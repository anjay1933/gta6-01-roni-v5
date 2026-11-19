// main.js — VICE LIGHTS entry point.
// Builds the renderer and the world, runs the game loop, drives the
// third-person camera, wires every menu button, and stages the ?shot=
// scenes the screenshots are taken from. All game systems live in their
// own modules; this file only connects them.

import * as THREE from 'three';
import { S, resetRunState } from './state.js';
import { clamp, lerpAngle } from './utils.js';
import { buildCity } from './city.js';
import { makePlayerCharacter, updatePlayerOnFoot, nearestCar, enterCar, exitCar } from './player.js';
import { makeCar, placeCar, updatePlayerDriving } from './vehicles.js';
import { spawnTraffic, spawnParkedCars, spawnPedestrians, updateTraffic, updatePedestrians, checkCarPedCollisions, scarePeds } from './traffic.js';
import { updatePolice, addHeat, setWanted, clearPolice, spawnPoliceCarAt } from './police.js';
import { armNextMission, updateMissions, forceMission } from './missions.js';
import { playerShoot, playerPunch, reloadWeapon, updateEnemies } from './combat.js';
import { initEffects, updateEffects, explosion } from './effects.js';
import { cacheUi, notify, updateHud, showScreen, flashVignette } from './hud.js';
import { ensureAudio, updateAudio, setMuted, playShot, playThud, playHurt, playBoom, playJingle, playPickup } from './audio.js';
import { saveGame, loadSave, hasSave, clearSave } from './save.js';
import { attachInput, isDown, consumeMouse } from './input.js';

const GAME_TITLE = 'VICE LIGHTS';
let lastTime = 0;
let readyFlagged = false;

function readShotParams() {
  const q = new URLSearchParams(window.location.search);
  S.seed = parseInt(q.get('seed') || '20261119', 10) || 20261119;
  S.shotMode = q.get('shot');
}

// Window hooks let the other modules call back into this file (notify,
// sounds, busted/wasted/finale) without an import cycle back to main.js.
window.__viceNotify = (msg) => notify(msg);
window.__viceJingle = () => playJingle();
window.__viceShot = () => playShot();
window.__viceThud = () => playThud();
window.__viceHurt = () => { playHurt(); flashVignette(); };
window.__viceBoom = () => playBoom();
window.__viceSave = () => saveGame();
window.__viceBusted = () => onBusted();
window.__viceCarExploded = (car) => onCarExploded(car);
window.__viceFinale = () => onFinale();

function onBusted() {
  if (S.mode !== 'playing') return;
  S.mode = 'busted';
  const lost = Math.floor(S.player.cash * 0.2);
  S.player.cash -= lost;
  clearPolice();
  if (S.player.inCar) exitCar();
  S.ui.bustedStats.textContent = `The Neon Bay PD caught up with you. You lost $${lost} in fines.`;
  showScreen('busted');
  playThud();
}

function onWasted() {
  if (S.mode !== 'playing') return;
  S.mode = 'wasted';
  const lost = Math.floor(S.player.cash * 0.1);
  S.player.cash -= lost;
  clearPolice();
  if (S.player.inCar) exitCar();
  S.ui.wastedStats.textContent = `Jax wakes up in St. Lumen Hospital, $${lost} lighter.`;
  showScreen('wasted');
  playBoom();
}

function onCarExploded(car) {
  explosion(car.x, 1, car.z);
  car.driver = 'wreck';
  car.speed = 0;
  if (S.player.inCar && S.player.car === car) {
    exitCar();
    S.player.health -= 30;
    S.player.x = car.x + 3;
    S.player.z = car.z + 3;
    S.player.group.position.set(S.player.x, 0, S.player.z);
    notify('Your car blew up! Get clear!');
  }
  // the wreck is towed away after a while so the street clears
  setTimeout(() => {
    S.three.scene.remove(car.group);
    const i = S.cars.indexOf(car);
    if (i >= 0) S.cars.splice(i, 1);
  }, 20000);
}

function onFinale() {
  S.ui.finalStats.textContent = `Jax and Mara made the docks with $${S.player.cash.toLocaleString('en-US')} — every job done, ${S.mission.totalEarned.toLocaleString('en-US')} earned across the story. Neon Bay is yours.`;
  showScreen('finale');
  saveGame();
}

function respawn(x, z) {
  S.player.x = x;
  S.player.z = z;
  S.player.heading = 0;
  S.player.health = 100;
  S.player.group.position.set(x, 0, z);
  S.player.group.visible = true;
  S.mode = 'playing';
  showScreen(null);
  notify('Back on the streets of Neon Bay.');
}

function buildWorld() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('app').appendChild(renderer.domElement);
  S.three.scene = scene;
  S.three.camera = camera;
  S.three.renderer = renderer;

  buildCity(scene);
  makePlayerCharacter(scene);
  initEffects(scene);
  spawnTraffic(scene, 14);
  spawnParkedCars(scene, 12);
  spawnPedestrians(scene, 26);

  // Jax's own taxi, parked on the avenue by the start corner
  const taxi = makeCar('taxi', 0xf2c230, scene);
  placeCar(taxi, 2.5, 12, 0, 'parked');
  S.cars.push(taxi);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function readDriveInput() {
  // screenshot scenes drive themselves; a real player uses W/S/A/D
  const auto = S.shotMode === 'cover' || S.shotMode === 'drive';
  return {
    fwd: auto || isDown('KeyW') || isDown('ArrowUp'),
    back: isDown('KeyS') || isDown('ArrowDown'),
    left: isDown('KeyA') || isDown('ArrowLeft'),
    right: isDown('KeyD') || isDown('ArrowRight'),
    handbrake: isDown('Space'),
  };
}

function readFootInput() {
  return {
    fwd: isDown('KeyW') || isDown('ArrowUp'),
    back: isDown('KeyS') || isDown('ArrowDown'),
    left: isDown('KeyA') || isDown('ArrowLeft'),
    right: isDown('KeyD') || isDown('ArrowRight'),
    sprint: isDown('ShiftLeft') || isDown('ShiftRight'),
  };
}

function updateCamera(dt) {
  const cam = S.three.camera;
  const p = S.player;
  const m = consumeMouse();
  S.camera.yaw -= m.dx * 0.004;
  S.camera.pitch = clamp(S.camera.pitch + m.dy * 0.003, 0.08, 1.1);
  S.camera.dist = clamp(S.camera.dist + m.wheel * 0.01, 5, 15);

  let tx;
  let tz;
  if (p.inCar && p.car) {
    tx = p.car.x;
    tz = p.car.z;
    // the chase camera trails behind the car; the mouse can still orbit
    S.camera.yaw = lerpAngle(S.camera.yaw, p.car.heading, Math.min(1, dt * 1.6));
  } else {
    tx = p.x;
    tz = p.z;
  }
  const dist = S.camera.dist;
  const h = 1.6 + Math.sin(S.camera.pitch) * dist;
  const back = Math.cos(S.camera.pitch) * dist;
  const cx = tx - Math.sin(S.camera.yaw) * back;
  const cz = tz - Math.cos(S.camera.yaw) * back;
  const sh = S.effects.shake;
  const shx = (Math.random() - 0.5) * sh * 0.7;
  const shy = (Math.random() - 0.5) * sh * 0.5;
  cam.position.set(cx + shx, h + shy, cz);
  cam.lookAt(tx, 1.8, tz);
}

function updatePlaying(dt) {
  const p = S.player;
  S.time += dt;
  p.invuln = Math.max(0, p.invuln - dt);
  if (p.reloadTimer > 0) p.reloadTimer -= dt;
  // slow health regen out of combat
  if (p.health > 0 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 1.6 * dt);

  if (p.inCar && p.car) {
    updatePlayerDriving(p.car, dt, readDriveInput());
    S.ui.promptTarget = 'E — Exit car';
  } else {
    updatePlayerOnFoot(dt, readFootInput(), S.camera.yaw);
    const near = nearestCar();
    if (near) {
      S.ui.promptTarget = near.driver === 'traffic' ? 'E — Jack this car!' : 'E — Drive';
      S.ui.promptCar = near;
    } else {
      S.ui.promptTarget = null;
      S.ui.promptCar = null;
    }
  }

  updateTraffic(dt);
  updatePedestrians(dt);
  checkCarPedCollisions();
  updatePolice(dt);
  updateMissions(dt);
  updateEnemies(dt);
  updateEffects(dt);
  updateAudio(dt);

  if (p.health <= 0) onWasted();
}

function handleKey(code, down) {
  if (!down) return;
  if (code === 'KeyM') {
    setMuted(!S.muted);
    notify(S.muted ? 'Sound off.' : 'Sound on.');
    return;
  }
  if (S.mode === 'menu' && (code === 'Enter' || code === 'Space')) {
    startNewGame();
    return;
  }
  if (S.mode === 'playing' && (code === 'Escape' || code === 'KeyP')) {
    S.mode = 'paused';
    showScreen('pause');
    return;
  }
  if (S.mode === 'paused' && (code === 'Escape' || code === 'KeyP')) {
    S.mode = 'playing';
    showScreen(null);
    return;
  }
  if (S.mode !== 'playing') return;
  ensureAudio();
  if (code === 'KeyE') {
    const p = S.player;
    if (p.inCar) {
      exitCar();
    } else if (S.ui.promptCar) {
      const car = S.ui.promptCar;
      if (car.driver === 'traffic') {
        addHeat(12, 'carjacking');
        notify('You jacked the car! The driver ran for it.');
        scarePeds(car.x, car.z, 25);
      }
      enterCar(car);
      playPickup();
    }
  } else if (code === 'KeyF') {
    playerShoot();
  } else if (code === 'KeyV') {
    playerPunch();
  } else if (code === 'KeyR') {
    reloadWeapon();
  }
}

function handleMouseDown(button) {
  if (S.mode !== 'playing') return;
  ensureAudio();
  if (button === 0 && !S.player.inCar) playerShoot();
}

function startNewGame() {
  ensureAudio();
  clearSave();
  resetRunState();
  S.player.cash = 250;
  S.player.x = 0;
  S.player.z = 8;
  S.player.heading = 0;
  S.player.group.position.set(0, 0, 8);
  S.player.group.visible = true;
  S.mission.completed = [];
  S.mission.totalEarned = 0;
  armNextMission();
  S.mode = 'playing';
  showScreen(null);
  notify(`${GAME_TITLE} — Jax Marlowe, getaway driver. Follow the yellow M to your first job.`);
}

function continueGame() {
  ensureAudio();
  const d = loadSave();
  if (!d) {
    startNewGame();
    return;
  }
  resetRunState();
  S.player.cash = d.cash;
  S.mission.completed = d.completed || [];
  S.mission.totalEarned = d.totalEarned || 0;
  S.mode = 'playing';
  showScreen(null);
  notify(`Welcome back, Jax. ${S.mission.completed.length} of 6 jobs done.`);
}

function wireMenus() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { ensureAudio(); fn(); });
  };
  on('start-btn', startNewGame);
  on('continue-btn', continueGame);
  on('resume-btn', () => { S.mode = 'playing'; showScreen(null); });
  on('save-btn', () => { saveGame(); notify('Game saved.'); });
  on('quit-menu-btn', () => { saveGame(); S.mode = 'menu'; showScreen('menu'); refreshMenu(); });
  on('respawn-btn', () => respawn(0, 8));
  on('respawn2-btn', () => respawn(0, 8));
  on('finale-roam-btn', () => { S.mode = 'playing'; showScreen(null); notify('Free roam — Neon Bay is yours.'); });
  on('mute-btn', () => { setMuted(!S.muted); notify(S.muted ? 'Sound off.' : 'Sound on.'); });
}

function refreshMenu() {
  const has = hasSave();
  S.ui.continueBtn.style.display = has ? '' : 'none';
  if (has) {
    try {
      const d = JSON.parse(localStorage.getItem(S.save.slot));
      S.ui.saveNote.textContent = `Saved game: ${d.completed.length}/6 jobs, $${d.cash.toLocaleString('en-US')} — ${new Date(d.savedAt).toLocaleString()}`;
    } catch { S.ui.saveNote.textContent = ''; }
  } else {
    S.ui.saveNote.textContent = 'No save yet — start a new game.';
  }
}

// Screenshot staging: ?shot=cover|street|mission|drive|menu.
// Deterministic scenes so the screenshots show the game at its best:
// a police chase, on-foot neon streets, a mission firefight, fast driving.
function stageShot() {
  const shot = S.shotMode;
  if (!shot || shot === 'menu') return;
  S.mode = 'playing';
  showScreen(null);
  const p = S.player;
  if (shot === 'cover') {
    // Heat Wave chase: Jax in the taxi, 3 stars, police on his tail
    const taxi = S.cars.find((c) => c.kind === 'taxi');
    p.x = 0; p.z = -40;
    enterCar(taxi);
    taxi.x = 0; taxi.z = -40; taxi.heading = 0; taxi.speed = 24;
    taxi.group.position.set(0, 0, -40);
    S.camera.yaw = 0; S.camera.dist = 11; S.camera.pitch = 0.3;
    forceMission(3, 0);
    setWanted(3);
    S.mission.timer = 32;
    // a police interceptor ahead and one on the tail, so the chase is visible
    spawnPoliceCarAt(0, 20, Math.PI);
    spawnPoliceCarAt(2.5, -110, 0);
  } else if (shot === 'street') {
    // on foot at the downtown intersection, looking down the neon avenue
    p.x = 0; p.z = 40; p.heading = Math.PI;
    p.group.position.set(p.x, 0, p.z);
    S.camera.yaw = Math.PI; S.camera.dist = 8; S.camera.pitch = 0.35;
    setWanted(1);
    armNextMission();
  } else if (shot === 'mission') {
    // Neon Heist firefight at the casino corner (road intersection)
    p.x = 4; p.z = -112; p.heading = Math.PI;
    p.group.position.set(p.x, 0, p.z);
    S.camera.yaw = Math.PI; S.camera.dist = 9; S.camera.pitch = 0.4;
    forceMission(4, 2);
    setWanted(2);
  } else if (shot === 'drive') {
    const sport = makeCar('sport', 0xff2d78, S.three.scene);
    placeCar(sport, -80, 2.5, Math.PI / 2, 'parked');
    S.cars.push(sport);
    p.x = -80; p.z = 2.5;
    enterCar(sport);
    sport.speed = 26;
    S.camera.yaw = Math.PI / 2; S.camera.dist = 11; S.camera.pitch = 0.28;
    setWanted(2);
    armNextMission();
  }
}

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastTime) / 1000 || 0.016);
  lastTime = t;
  if (S.mode === 'playing') {
    updatePlaying(dt);
  } else if (S.mode === 'menu') {
    // menu backdrop: a slow orbit around the neon downtown
    S.time += dt;
    const a = S.time * 0.05;
    S.three.camera.position.set(Math.sin(a) * 90, 42, Math.cos(a) * 90);
    S.three.camera.lookAt(0, 12, 0);
    updateTraffic(dt * 0.5);
    updatePedestrians(dt * 0.5);
    updateEffects(dt);
  } else {
    updateEffects(dt);
  }
  if (S.mode === 'playing') updateCamera(dt);
  updateHud(dt);
  S.three.renderer.render(S.three.scene, S.three.camera);
  if (!readyFlagged) {
    readyFlagged = true;
    setTimeout(() => { window.__viceReady = true; }, 1200);
  }
}

function init() {
  readShotParams();
  cacheUi();
  buildWorld();
  wireMenus();
  attachInput(S.three.renderer.domElement, { onKey: handleKey, onMouseDown: handleMouseDown });
  refreshMenu();
  if (S.shotMode && S.shotMode !== 'menu') {
    stageShot();
  } else {
    S.mode = 'menu';
    showScreen('menu');
  }
  const titleEl = document.getElementById('game-title');
  if (titleEl) titleEl.textContent = GAME_TITLE;
  // exposed for play-testing from the console / automation
  window.__viceState = S;
  requestAnimationFrame(loop);
}

init();
