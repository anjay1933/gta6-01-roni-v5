// police.js — the wanted system: heat builds stars, police cars and foot
// cops spawn and chase, and getting caught means BUSTED. Heat fades when
// the player stays out of sight, so a clean getaway really works.

import * as THREE from 'three';
import { S } from './state.js';
import { clamp, dist2D } from './utils.js';
import { makeCar, placeCar } from './vehicles.js';
import { scarePeds } from './traffic.js';

export const WANTED_NAMES = ['Clean', 'Suspect', 'Fugitive', 'Most Wanted', 'Manhunt', 'City Lockdown'];

export function addHeat(amount, reason) {
  S.police.heat = clamp(S.police.heat + amount, 0, 100);
  const stars = heatToStars(S.police.heat);
  if (stars > S.police.wanted) {
    S.police.wanted = stars;
    if (window.__viceNotify) window.__viceNotify(`WANTED LEVEL ${stars} — ${WANTED_NAMES[stars]}!`);
  }
  return S.police.wanted;
}

export function heatToStars(heat) {
  if (heat < 12) return 0;
  if (heat < 28) return 1;
  if (heat < 45) return 2;
  if (heat < 62) return 3;
  if (heat < 82) return 4;
  return 5;
}

export function setWanted(stars) {
  S.police.wanted = clamp(stars, 0, 5);
  S.police.heat = [0, 15, 32, 50, 68, 88][S.police.wanted];
}

function spawnPoliceCar() {
  const scene = S.three.scene;
  const car = makeCar('police', 0x111118, scene);
  // spawn on a road behind / ahead of the player
  const a = Math.random() * Math.PI * 2;
  const d = 55 + Math.random() * 30;
  let x = clamp(S.player.x + Math.sin(a) * d, -175, 175);
  let z = clamp(S.player.z + Math.cos(a) * d, -175, 175);
  x = Math.round(x / 40) * 40 + 2.5;
  z = Math.round(z / 40) * 40 + 2.5;
  placeCar(car, x, z, Math.atan2(S.player.x - x, S.player.z - z), 'police');
  car.ai = { mode: 'chase' };
  S.cars.push(car);
  S.police.cops.push(car);
  return car;
}

// Place a police car at an exact road spot (used to stage the cover chase).
export function spawnPoliceCarAt(x, z, heading) {
  const car = makeCar('police', 0x111118, S.three.scene);
  placeCar(car, x, z, heading, 'police');
  car.ai = { mode: 'chase' };
  S.cars.push(car);
  S.police.cops.push(car);
  return car;
}

function spawnFootCop() {
  const scene = S.three.scene;
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.36), navy);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin);
  head.position.y = 1.76;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: 0x0a1430 }));
  cap.position.y = 1.98;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), navy);
  legL.position.set(-0.16, 0.35, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  scene.add(g);
  const a = Math.random() * Math.PI * 2;
  const cop = {
    group: g, legL, legR, kind: 'footcop',
    x: clamp(S.player.x + Math.sin(a) * 25, -175, 175),
    z: clamp(S.player.z + Math.cos(a) * 25, -175, 175),
    heading: 0, speed: 0, health: 100,
  };
  g.position.set(cop.x, 0, cop.z);
  S.police.cops.push(cop);
  return cop;
}

function removeCop(cop) {
  S.three.scene.remove(cop.group);
  const i = S.police.cops.indexOf(cop);
  if (i >= 0) S.police.cops.splice(i, 1);
  if (cop.kind === 'police') {
    const j = S.cars.indexOf(cop);
    if (j >= 0) S.cars.splice(j, 1);
  }
}

export function clearPolice() {
  for (const cop of [...S.police.cops]) removeCop(cop);
  S.police.wanted = 0;
  S.police.heat = 0;
  S.police.bustedTimer = 0;
}

export function updatePolice(dt) {
  const wanted = S.police.wanted;
  const p = S.player;
  // --- spawn to match the wanted level --------------------------------------
  const wantCars = wanted === 0 ? 0 : Math.min(wanted, 4);
  const wantFoot = wanted >= 3 ? wanted - 2 : 0;
  S.police.spawnTimer -= dt;
  const carsNow = S.police.cops.filter((c) => c.kind === 'police').length;
  const footNow = S.police.cops.filter((c) => c.kind === 'footcop').length;
  if (S.police.spawnTimer <= 0) {
    S.police.spawnTimer = 1.2;
    if (carsNow < wantCars) spawnPoliceCar();
    else if (footNow < wantFoot) spawnFootCop();
  }

  // --- chase behaviour --------------------------------------------------------
  const px = p.inCar && p.car ? p.car.x : p.x;
  const pz = p.inCar && p.car ? p.car.z : p.z;
  let nearest = 999;
  for (const cop of [...S.police.cops]) {
    if (cop.kind === 'footcop') {
      // foot cop runs at the player on foot
      const d = dist2D(cop.x, cop.z, p.x, p.z);
      nearest = Math.min(nearest, d);
      const wantHeading = Math.atan2(p.x - cop.x, p.z - cop.z);
      let diff = wantHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += clamp(diff, -3 * dt, 3 * dt);
      const sp = 6.2;
      cop.x += Math.sin(cop.heading) * sp * dt;
      cop.z += Math.cos(cop.heading) * sp * dt;
      cop.group.position.set(cop.x, 0, cop.z);
      cop.group.rotation.y = cop.heading;
      const swing = Math.sin(S.time * 13) * 0.6;
      cop.legL.rotation.x = swing;
      cop.legR.rotation.x = -swing;
      // caught!
      if (d < 1.6 && !p.inCar) {
        S.police.bustedTimer += dt;
        if (S.police.bustedTimer > 1.1) {
          if (window.__viceBusted) window.__viceBusted();
          return;
        }
      }
      if (d > 160) removeCop(cop);
      continue;
    }
    // police car: steer toward the player, ram when close
    const d = dist2D(cop.x, cop.z, px, pz);
    nearest = Math.min(nearest, d);
    const wantHeading = Math.atan2(px - cop.x, pz - cop.z);
    let diff = wantHeading - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.heading += clamp(diff, -1.9 * dt, 1.9 * dt);
    const targetSpeed = d > 60 ? cop.spec.max : cop.spec.max * 0.85;
    cop.speed += clamp(targetSpeed - cop.speed, -20 * dt, 12 * dt);
    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    cop.x = clamp(cop.x, -180, 180);
    cop.z = clamp(cop.z, -180, 180);
    cop.group.position.set(cop.x, 0, cop.z);
    cop.group.rotation.y = cop.heading;
    for (const w of cop.wheels) w.rotation.x += cop.speed * dt * 2.2;
    cop.flashTimer = (cop.flashTimer || 0) + dt;
    const on = Math.floor(cop.flashTimer * 6) % 2 === 0;
    cop.lightBar.userData.red.material.color.setHex(on ? 0xff2020 : 0x551111);
    cop.lightBar.userData.blue.material.color.setHex(on ? 0x112255 : 0x2244ff);
    // ram the player's car
    if (p.inCar && p.car && d < 3.4) {
      cop.speed *= 0.55;
      p.car.health -= 14 * dt;
      p.car.speed *= 0.94;
      S.effects.shake = Math.max(S.effects.shake, 0.3);
      if (p.car.health <= 0 && window.__viceCarExploded) window.__viceCarExploded(p.car);
    }
    // on-foot player run over
    if (!p.inCar && d < 2.2) {
      p.health -= 30 * dt;
      S.effects.shake = Math.max(S.effects.shake, 0.4);
    }
    if (d > 220) removeCop(cop);
  }

  // --- heat decay: hide and the heat fades ------------------------------------
  if (wanted > 0) {
    if (nearest > 55) {
      S.police.hiddenTimer += dt;
      if (S.police.hiddenTimer > 8) {
        S.police.heat = Math.max(0, S.police.heat - 6 * dt);
        const stars = heatToStars(S.police.heat);
        if (stars < S.police.wanted) {
          S.police.wanted = stars;
          if (window.__viceNotify) window.__viceNotify(`Heat cooling… wanted level ${stars}.`);
        }
      }
    } else {
      S.police.hiddenTimer = 0;
    }
  }
  if (wanted === 0 && S.police.cops.length > 0) {
    for (const cop of [...S.police.cops]) {
      if (dist2D(cop.x, cop.z, px, pz) > 90) removeCop(cop);
    }
  }
  S.police.lastSeen = nearest;
}
