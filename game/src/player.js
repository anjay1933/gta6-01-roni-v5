// player.js — the on-foot hero: Jax Marlowe, getaway driver.
// A box-built character with swinging legs and arms, third-person movement
// relative to the camera yaw, and enter/exit-car interaction (E).

import * as THREE from 'three';
import { S } from './state.js';
import { clamp, lerpAngle } from './utils.js';
import { collideCircle } from './city.js';
import { attachHeadlight, detachHeadlight, placeCar } from './vehicles.js';

export function makePlayerCharacter(scene) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0xff2d78 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x22345e });
  const hair = new THREE.MeshLambertMaterial({ color: 0x14100c });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.38), skin);
  head.position.y = 1.78;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.42), hair);
  cap.position.y = 2.0;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), jeans);
  legL.position.set(-0.17, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), jacket);
  armL.position.set(-0.42, 1.18, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armR);
  // pistol in the right hand when armed
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.42, 0.9, 0.22);
  gun.name = 'pistol';
  g.add(gun);
  // blob shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  scene.add(g);
  S.player.group = g;
  g.userData = { legL, legR, armL, armR, gun };
  return g;
}

// Move on foot: WASD relative to camera yaw, Shift to sprint, collide with
// buildings, animate the walk cycle. Returns true while moving.
export function updatePlayerOnFoot(dt, input, camYaw) {
  const p = S.player;
  const sprint = input.sprint ? 1.7 : 1;
  const speed = 5.2 * sprint;
  let mx = 0;
  let mz = 0;
  if (input.fwd) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
  if (input.left) { mx += Math.sin(camYaw - Math.PI / 2); mz += Math.cos(camYaw - Math.PI / 2); }
  if (input.right) { mx += Math.sin(camYaw + Math.PI / 2); mz += Math.cos(camYaw + Math.PI / 2); }
  const len = Math.hypot(mx, mz);
  p.moving = len > 0.01;
  if (p.moving) {
    mx /= len;
    mz /= len;
    const nx = p.x + mx * speed * dt;
    const nz = p.z + mz * speed * dt;
    if (!collideCircle(nx, p.z, 0.6)) p.x = nx;
    if (!collideCircle(p.x, nz, 0.6)) p.z = nz;
    p.x = clamp(p.x, -S.city.bounds, S.city.bounds);
    p.z = clamp(p.z, -S.city.bounds, S.city.bounds);
    p.heading = lerpAngle(p.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
    p.walkSpeed = speed;
  } else {
    p.walkSpeed = 0;
  }
  const g = p.group;
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.heading;
  // walk cycle
  const t = S.time * (p.moving ? 11 : 0);
  const swing = p.moving ? Math.sin(t) * 0.55 : 0;
  g.userData.legL.rotation.x = swing;
  g.userData.legR.rotation.x = -swing;
  g.userData.armL.rotation.x = -swing * 0.8;
  g.userData.armR.rotation.x = p.armed ? -1.2 : swing * 0.8;
  g.userData.gun.visible = p.armed;
  // punch animation
  if (p.punchTimer > 0) {
    p.punchTimer -= dt;
    g.userData.armR.rotation.x = -1.6 + Math.sin(p.punchTimer * 30) * 0.4;
  }
  return p.moving;
}

// Nearest drivable car within 3.5m, for the E prompt / carjacking.
export function nearestCar(maxDist = 3.5) {
  let best = null;
  let bestD = maxDist;
  for (const car of S.cars) {
    if (car.driver === 'player') continue;
    const d = Math.hypot(car.x - S.player.x, car.z - S.player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(car) {
  const p = S.player;
  p.inCar = true;
  p.car = car;
  car.driver = 'player';
  p.group.visible = false;
  attachHeadlight(car, S.three.scene);
  if (car.ai) car.ai = null;
  return car;
}

export function exitCar() {
  const p = S.player;
  if (!p.car) return;
  const car = p.car;
  detachHeadlight(car);
  car.driver = 'parked';
  car.speed = 0;
  p.inCar = false;
  p.car = null;
  // step out to the driver's side
  p.x = car.x + Math.cos(car.heading) * 2.2;
  p.z = car.z - Math.sin(car.heading) * 2.2;
  p.heading = car.heading;
  p.group.visible = true;
  p.group.position.set(p.x, 0, p.z);
}
