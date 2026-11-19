// hud.js — every pixel of interface: cash, health, ammo, wanted stars,
// speedometer, mission objective, message feed, the minimap canvas and the
// menu / pause / busted / wasted / finale screens. The minimap is a top-down
// 2D canvas drawn from the same city data the 3D world uses.

import { S } from './state.js';
import { formatCash, clamp } from './utils.js';
import { WANTED_NAMES } from './police.js';

let feedTimer = 0;

export function cacheUi() {
  const $ = (id) => document.getElementById(id);
  S.ui = {
    cash: $('cash'), healthFill: $('health-fill'), healthText: $('health-text'),
    ammo: $('ammo'), stars: $('stars'), wantedLabel: $('wanted-label'),
    speed: $('speed'), objective: $('objective'), missionTitle: $('mission-title'),
    feed: $('feed'), minimap: $('minimap'), prompt: $('prompt'),
    crosshair: $('crosshair'), vignette: $('vignette'),
    menu: $('menu'), pause: $('pause'), busted: $('busted'), wasted: $('wasted'),
    finale: $('finale'), saveNote: $('save-note'), continueBtn: $('continue-btn'),
    finalStats: $('final-stats'), bustedStats: $('busted-stats'), wastedStats: $('wasted-stats'),
    controlsHint: $('controls-hint'),
  };
}

export function notify(msg) {
  if (!S.ui.feed) return;
  const div = document.createElement('div');
  div.className = 'feed-msg';
  div.textContent = msg;
  S.ui.feed.prepend(div);
  while (S.ui.feed.children.length > 4) S.ui.feed.removeChild(S.ui.feed.lastChild);
  feedTimer = 6;
}

export function flashVignette() {
  if (!S.ui.vignette) return;
  S.ui.vignette.style.opacity = '0.55';
  setTimeout(() => { S.ui.vignette.style.opacity = '0'; }, 120);
}

function drawStars() {
  const n = S.police.wanted;
  let html = '';
  for (let i = 0; i < 5; i++) html += `<span class="star${i < n ? ' lit' : ''}">★</span>`;
  S.ui.stars.innerHTML = html;
  S.ui.wantedLabel.textContent = n > 0 ? WANTED_NAMES[n] : 'CLEAN';
  S.ui.wantedLabel.style.color = n >= 3 ? '#ff4040' : n > 0 ? '#ffb020' : '#39ff88';
}

function drawMinimap() {
  const cv = S.ui.minimap;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const range = 150; // world units shown across the map
  const px = S.player.inCar && S.player.car ? S.player.car.x : S.player.x;
  const pz = S.player.inCar && S.player.car ? S.player.car.z : S.player.z;
  const toMap = (x, z) => [W / 2 + ((x - px) / range) * W, H / 2 + ((z - pz) / range) * H];

  ctx.fillStyle = 'rgba(12,10,24,0.92)';
  ctx.fillRect(0, 0, W, H);
  // roads
  ctx.strokeStyle = '#3d3a55';
  ctx.lineWidth = 5;
  for (const r of S.city.roads) {
    const [ax, ay] = toMap(r.axis === 'x' ? -range : r.at, r.axis === 'x' ? r.at : -range);
    const [bx, by] = toMap(r.axis === 'x' ? range : r.at, r.axis === 'x' ? r.at : range);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  // buildings as faint blocks
  ctx.fillStyle = '#241f3a';
  for (const b of S.city.buildings) {
    const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
    const w = (b.w / range) * W;
    const h = (b.d / range) * H;
    if (x > -w && x < W && y > -h && y < H) ctx.fillRect(x, y, w, h);
  }
  // mission target: pulsing yellow diamond
  if (S.mission.target) {
    const [x, y] = toMap(S.mission.target.x, S.mission.target.z);
    const r = 6 + Math.sin(S.time * 4) * 2;
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }
  // traffic: yellow dots, police: flashing blue/red, enemies: red
  for (const car of S.cars) {
    if (car.driver === 'player') continue;
    const [x, y] = toMap(car.x, car.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.fillStyle = car.kind === 'police' ? (Math.floor(S.time * 4) % 2 ? '#ff2020' : '#2244ff') : '#f2c230';
    ctx.beginPath();
    ctx.arc(x, y, car.kind === 'police' ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const [x, y] = toMap(e.x, e.z);
    ctx.fillStyle = '#ff3030';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // player arrow (centre)
  const heading = S.player.inCar && S.player.car ? S.player.car.heading : S.player.heading;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  // map is north-up: world +z is down-screen, so the arrow rotates PI - heading
  ctx.rotate(Math.PI - heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // border + N
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 11px Arial';
  ctx.fillText('N', 6, 14);
}

export function updateHud(dt) {
  const p = S.player;
  if (!S.ui.cash) return;
  S.ui.cash.textContent = formatCash(p.cash);
  S.ui.healthFill.style.width = `${clamp(p.health, 0, 100)}%`;
  S.ui.healthFill.style.background = p.health > 50 ? '#39ff88' : p.health > 25 ? '#ffb020' : '#ff4040';
  S.ui.healthText.textContent = `${Math.ceil(Math.max(0, p.health))} HP`;
  S.ui.ammo.textContent = p.inCar ? '—' : `${p.ammo} / ${p.reserve}`;
  drawStars();
  const speed = p.inCar && p.car ? Math.abs(p.car.speed) * 3.2 : Math.abs(p.walkSpeed || 0) * 3.2;
  S.ui.speed.textContent = p.inCar ? `${Math.round(speed)} km/h` : '';
  S.ui.objective.textContent = S.mission.objective || 'Free roam — explore Neon Bay';
  S.ui.missionTitle.textContent = S.mission.active
    ? `★ ${S.mission.title}`
    : S.mission.completed.length >= 6 ? 'NEON BAY — COMPLETE' : `NEXT JOB: ${S.mission.title}`;
  drawMinimap();
  // crosshair only when on foot and armed
  S.ui.crosshair.style.display = (!p.inCar && p.armed && S.mode === 'playing') ? 'block' : 'none';
  // E prompt near a car
  if (S.ui.promptTarget) {
    S.ui.prompt.style.display = 'block';
    S.ui.prompt.textContent = S.ui.promptTarget;
  } else {
    S.ui.prompt.style.display = 'none';
  }
  if (feedTimer > 0) {
    feedTimer -= dt;
    if (feedTimer <= 0) S.ui.feed.innerHTML = '';
  }
}

export function showScreen(name) {
  const screens = ['menu', 'pause', 'busted', 'wasted', 'finale'];
  for (const s of screens) {
    const el = S.ui[s];
    if (el) el.style.display = s === name ? 'flex' : 'none';
  }
  const hudVisible = name === null;
  for (const id of ['hud-top', 'hud-bottom', 'minimap-wrap', 'objective-panel']) {
    const el = document.getElementById(id);
    if (el) el.style.display = hudVisible ? '' : 'none';
  }
}
