// vehicles.js — car factory and arcade driving.
// Cars are boxes with cabins, wheels, headlights and taillights; the player
// car gets one real spotlight. Traffic and police AI live in traffic.js
// and police.js; this file only builds cars and moves the one being driven.

import * as THREE from 'three';
import { S } from './state.js';
import { clamp, lerpAngle } from './utils.js';
import { collideCircle } from './city.js';

const CAR_COLORS = [0xd8232a, 0x2477d8, 0xf2c230, 0x27b56b, 0xe8e8e8, 0x222228, 0x7a3fd1, 0xff7a1a];
const KINDS = {
  sedan: { len: 4.4, wid: 2.0, top: 24, accel: 16, max: 30 },
  taxi: { len: 4.4, wid: 2.0, top: 24, accel: 15, max: 28 },
  sport: { len: 4.2, wid: 2.0, top: 32, accel: 22, max: 40 },
  van: { len: 5.2, wid: 2.2, top: 18, accel: 11, max: 22 },
  police: { len: 4.5, wid: 2.0, top: 30, accel: 20, max: 38 },
};

export function makeCar(kind, color, scene) {
  const spec = KINDS[kind] || KINDS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.18 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x0d1620 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 0.85, spec.len), paint);
  body.position.y = 0.75;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid - 0.3, 0.7, spec.len * 0.45), glass);
  cabin.position.set(0, 1.45, -0.2);
  group.add(cabin);
  // headlights + taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    hl.position.set(sx, 0.8, spec.len / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    tl.position.set(sx, 0.8, -spec.len / 2 - 0.02);
    group.add(tl);
  }
  // taxi sign / police light bar
  let lightBar = null;
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe600 }),
    );
    sign.position.set(0, 1.95, -0.2);
    group.add(sign);
  }
  if (kind === 'police') {
    lightBar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    r.position.x = -0.35;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    b.position.x = 0.35;
    lightBar.add(r, b);
    lightBar.position.set(0, 1.9, -0.2);
    lightBar.userData.red = r;
    lightBar.userData.blue = b;
    group.add(lightBar);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.5, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    door.position.set(spec.wid / 2 + 0.01, 0.85, 0);
    group.add(door);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w);
    wheels.push(w);
  }
  // fake blob shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.wid + 0.6, spec.len + 0.8),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  scene.add(group);
  const car = {
    group, kind, color, spec,
    x: 0, z: 0, heading: 0, speed: 0,
    driver: 'parked', health: 100,
    wheels, lightBar,
    steer: 0, ai: null, flashTimer: 0,
    headlight: null,
  };
  group.position.set(0, 0, 0);
  return car;
}

export function placeCar(car, x, z, heading, driver) {
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.driver = driver;
  car.speed = 0;
  car.group.position.set(x, 0, z);
  car.group.rotation.y = heading;
}

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}

// One real headlight beam, attached only to the car the player drives.
export function attachHeadlight(car, scene) {
  if (car.headlight) return;
  const spot = new THREE.SpotLight(0xfff2b0, 60, 55, 0.5, 0.45, 1.2);
  const target = new THREE.Object3D();
  target.position.set(0, 0, 14);
  car.group.add(target);
  spot.target = target;
  spot.position.set(0, 1.2, 1.5);
  car.group.add(spot);
  car.headlight = spot;
}

export function detachHeadlight(car) {
  if (!car.headlight) return;
  car.group.remove(car.headlight);
  car.headlight = null;
}

// Arcade driving for the player car: W/S accelerate + brake/reverse,
// A/D steer (stronger at low speed), Space handbrake, collisions bounce.
export function updatePlayerDriving(car, dt, input) {
  const spec = car.spec;
  const fwd = input.fwd ? 1 : 0;
  const back = input.back ? 1 : 0;
  const left = input.left ? 1 : 0;
  const right = input.right ? 1 : 0;

  if (fwd) car.speed += spec.accel * dt * (car.speed < 0 ? 2.2 : 1);
  if (back) car.speed -= spec.accel * 0.9 * dt * (car.speed > 0 ? 2.4 : 1);
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -spec.max * 0.45, spec.max);

  const steerTarget = (left - right) * clamp(Math.abs(car.speed) / 8, 0, 1) * 0.55;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  if (Math.abs(car.speed) > 0.3) {
    car.heading += car.steer * dt * Math.sign(car.speed) * (input.handbrake ? 1.35 : 1);
  }

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(nx, nz, 1.6);
  if (hit) {
    // slide along the wall instead of stopping dead
    const hx = collideCircle(nx, car.z, 1.6);
    const hz = collideCircle(car.x, nz, 1.6);
    if (!hx) car.x = nx;
    if (!hz) car.z = nz;
    if (hx && hz) {
      car.speed *= -0.25; // bounce off
      S.effects.shake = Math.max(S.effects.shake, 0.25);
    }
  } else {
    car.x = nx;
    car.z = nz;
  }
  car.x = clamp(car.x, -S.city.bounds, S.city.bounds);
  car.z = clamp(car.z, -S.city.bounds, S.city.bounds);

  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  // body roll + wheel spin sell the speed
  car.group.rotation.z = -car.steer * 0.06 * Math.sign(car.speed);
  for (const w of car.wheels) w.rotation.x += car.speed * dt * 2.2;
  car.wheels[0].rotation.y = car.steer * 0.7;
  car.wheels[1].rotation.y = car.steer * 0.7;

  if (car.lightBar) {
    car.flashTimer += dt;
    const on = Math.floor(car.flashTimer * 6) % 2 === 0;
    car.lightBar.userData.red.material.color.setHex(on ? 0xff2020 : 0x551111);
    car.lightBar.userData.blue.material.color.setHex(on ? 0x112255 : 0x2244ff);
  }
  return Math.abs(car.speed);
}

export function damageCar(car, amount) {
  car.health -= amount;
  if (car.health <= 0 && car.driver === 'player') {
    return true; // caller explodes it
  }
  return false;
}
