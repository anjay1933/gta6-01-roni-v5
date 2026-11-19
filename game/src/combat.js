// combat.js — pistol shooting, punching and the mission goons who shoot back.
// Shooting is a hitscan ray from the camera through the crosshair; goons are
// box-built thugs with health, a wind-up before they fire, and bad aim that
// gets worse the further away they are.

import * as THREE from 'three';
import { S } from './state.js';
import { clamp, dist2D } from './utils.js';
import { muzzleFlash, burst, sparkBurst } from './effects.js';
import { scarePeds } from './traffic.js';
import { addHeat } from './police.js';

export function spawnEnemy(x, z, scene) {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0x8a1a1a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x181820 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), red);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.38), skin);
  head.position.y = 1.78;
  g.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.42), dark);
  band.position.y = 1.95;
  g.add(band);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), dark);
  legL.position.set(-0.17, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  g.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.42, 0.95, 0.2);
  g.add(gun);
  scene.add(g);
  const enemy = {
    group: g, legL, legR,
    x, z, heading: 0,
    health: 60, maxHealth: 60,
    shootTimer: 1 + Math.random(),
    alive: true, moveTimer: 0,
  };
  g.position.set(x, 0, z);
  S.enemies.push(enemy);
  return enemy;
}

export function clearEnemies() {
  for (const e of S.enemies) S.three.scene.remove(e.group);
  S.enemies = [];
}

function nearestShootable(origin, dir, maxDist) {
  // returns {kind:'enemy'|'ped'|'car', obj, dist} or null
  let best = null;
  const test = (x, z, radius, kind, obj) => {
    const dx = x - origin.x;
    const dz = z - origin.z;
    const along = dx * dir.x + dz * dir.z;
    if (along < 1 || along > maxDist) return;
    const side = Math.abs(dx * dir.z - dz * dir.x);
    if (side < radius && (!best || along < best.dist)) best = { kind, obj, dist: along };
  };
  for (const e of S.enemies) if (e.alive) test(e.x, e.z, 1.1, 'enemy', e);
  for (const ped of S.peds) if (ped.state !== 'down') test(ped.x, ped.z, 0.9, 'ped', ped);
  for (const car of S.cars) {
    if (car.driver === 'player') continue;
    test(car.x, car.z, 2.2, 'car', car);
  }
  return best;
}

export function playerShoot() {
  const p = S.player;
  if (p.inCar || p.reloadTimer > 0 || p.ammo <= 0) return false;
  p.ammo -= 1;
  const cam = S.three.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const origin = { x: cam.position.x, z: cam.position.z };
  const d2 = { x: dir.x, z: dir.z };
  const len = Math.hypot(d2.x, d2.z) || 1;
  d2.x /= len;
  d2.z /= len;
  // muzzle flash at the gun
  const gx = p.x + Math.sin(p.heading) * 0.6;
  const gz = p.z + Math.cos(p.heading) * 0.6;
  muzzleFlash(gx, 1.3, gz);
  S.combat.muzzleTimer = 0.08;
  scarePeds(p.x, p.z, 35);
  addHeat(2, 'gunfire');
  if (window.__viceShot) window.__viceShot();

  const hit = nearestShootable(origin, d2, 70);
  if (!hit) {
    // dust puff where the shot lands, far down the ray
    burst(origin.x + d2.x * 55, 0.6, origin.z + d2.z * 55, 0xaaaaaa, 4, 2, 1, 0.4);
    return true;
  }
  if (hit.kind === 'enemy') {
    const e = hit.obj;
    e.health -= 34;
    burst(e.x, 1.3, e.z, 0xff3333, 10, 5, 3, 0.5);
    if (e.health <= 0) {
      e.alive = false;
      e.group.rotation.x = -Math.PI / 2 * 0.9;
      e.group.position.y = 0.25;
      p.cash += 25;
      if (window.__viceNotify) window.__viceNotify('Goon down. +$25');
    }
  } else if (hit.kind === 'ped') {
    const ped = hit.obj;
    ped.state = 'down';
    ped.fleeTimer = 5;
    ped.group.rotation.x = Math.PI / 2 * 0.9;
    ped.group.position.y = 0.3;
    addHeat(10, 'shot a pedestrian');
    scarePeds(ped.x, ped.z, 40);
  } else if (hit.kind === 'car') {
    const car = hit.obj;
    car.health -= 12;
    sparkBurst(car.x, 1, car.z);
    if (car.health <= 0 && car.driver !== 'player') {
      car.driver = 'wreck';
      if (window.__viceCarExploded) window.__viceCarExploded(car);
    }
  }
  return true;
}

export function playerPunch() {
  const p = S.player;
  if (p.inCar || p.punchTimer > 0) return;
  p.punchTimer = 0.35;
  // nearest enemy / ped / cop within 2.2m takes the hit
  const targets = [];
  for (const e of S.enemies) if (e.alive) targets.push({ x: e.x, z: e.z, obj: e, kind: 'enemy' });
  for (const ped of S.peds) if (ped.state !== 'down') targets.push({ x: ped.x, z: ped.z, obj: ped, kind: 'ped' });
  for (const cop of S.police.cops) if (cop.kind === 'footcop') targets.push({ x: cop.x, z: cop.z, obj: cop, kind: 'cop' });
  let best = null;
  let bestD = 2.4;
  for (const t of targets) {
    const d = dist2D(p.x, p.z, t.x, t.z);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return;
  if (best.kind === 'enemy') {
    best.obj.health -= 25;
    burst(best.obj.x, 1.3, best.obj.z, 0xffcc66, 6, 4, 2, 0.4);
    if (best.obj.health <= 0) {
      best.obj.alive = false;
      best.obj.group.rotation.x = -Math.PI / 2 * 0.9;
      best.obj.group.position.y = 0.25;
      p.cash += 25;
    }
  } else if (best.kind === 'ped') {
    best.obj.state = 'down';
    best.obj.fleeTimer = 4;
    best.obj.group.rotation.x = Math.PI / 2 * 0.9;
    best.obj.group.position.y = 0.3;
    addHeat(8, 'assault');
  } else {
    best.obj.health -= 30;
    if (best.obj.health <= 0) {
      best.obj.group.visible = false;
      const i = S.police.cops.indexOf(best.obj);
      if (i >= 0) S.police.cops.splice(i, 1);
      addHeat(20, 'cop down');
    }
  }
  if (window.__viceThud) window.__viceThud();
}

export function reloadWeapon() {
  const p = S.player;
  if (p.reloadTimer > 0 || p.ammo === p.magSize || p.reserve <= 0) return;
  p.reloadTimer = 0.9;
  const need = p.magSize - p.ammo;
  const take = Math.min(need, p.reserve);
  p.ammo += take;
  p.reserve -= take;
  if (window.__viceNotify) window.__viceNotify('Reloaded.');
}

// Goons strafe toward the player and fire with a wind-up; their aim is poor
// at range so a firefight at 20m is survivable and close range is scary.
export function updateEnemies(dt) {
  const p = S.player;
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const d = dist2D(e.x, e.z, p.x, p.z);
    e.moveTimer -= dt;
    if (d > 16) {
      // close the distance
      const h = Math.atan2(p.x - e.x, p.z - e.z);
      e.heading = h;
      e.x += Math.sin(h) * 3.4 * dt;
      e.z += Math.cos(h) * 3.4 * dt;
    } else if (e.moveTimer <= 0) {
      e.moveTimer = 0.8 + Math.random() * 0.8;
      e.heading = Math.atan2(p.x - e.x, p.z - e.z) + (Math.random() - 0.5) * 1.2;
    } else {
      e.x += Math.sin(e.heading) * 1.6 * dt;
      e.z += Math.cos(e.heading) * 1.6 * dt;
    }
    e.group.position.set(e.x, 0, e.z);
    e.group.rotation.y = e.heading;
    const swing = Math.sin(S.time * 10) * 0.45;
    e.legL.rotation.x = swing;
    e.legR.rotation.x = -swing;
    // fire
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && d < 42 && !p.inCar) {
      e.shootTimer = 1.1 + Math.random() * 0.9;
      muzzleFlash(e.x + Math.sin(e.heading) * 0.6, 1.3, e.z + Math.cos(e.heading) * 0.6);
      if (window.__viceShot) window.__viceShot();
      // hit chance falls with distance
      const hitChance = clamp(0.55 - d * 0.012, 0.08, 0.5);
      if (Math.random() < hitChance && p.invuln <= 0) {
        p.health -= 8 + Math.random() * 6;
        S.effects.shake = Math.max(S.effects.shake, 0.35);
        if (window.__viceHurt) window.__viceHurt();
      }
    }
  }
}

export function enemiesAlive() {
  return S.enemies.filter((e) => e.alive).length;
}
