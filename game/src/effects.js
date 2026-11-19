// effects.js — particles, explosions, muzzle flashes and screen shake.
// One THREE.Points cloud (300 particles) does every burst so effects cost
// a single draw call; the camera shake is a number main.js reads each frame.

import * as THREE from 'three';
import { S } from './state.js';

const MAX = 300;
let points = null;
let posAttr = null;
let colAttr = null;
const vel = new Float32Array(MAX * 3);
const life = new Float32Array(MAX);
const maxLife = new Float32Array(MAX);
let cursor = 0;

export function initEffects(scene) {
  const geo = new THREE.BufferGeometry();
  posAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3);
  colAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  const mat = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < MAX; i++) {
    posAttr.setXYZ(i, 0, -100, 0);
    life[i] = 0;
  }
}

export function burst(x, y, z, colorHex, count, speed, up = 4, lifeSec = 0.8) {
  const c = new THREE.Color(colorHex);
  for (let n = 0; n < count; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    posAttr.setXYZ(i, x, y, z);
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    vel[i * 3] = Math.cos(a) * s;
    vel[i * 3 + 1] = up * (0.3 + Math.random() * 0.9);
    vel[i * 3 + 2] = Math.sin(a) * s;
    colAttr.setXYZ(i, c.r, c.g, c.b);
    life[i] = lifeSec * (0.6 + Math.random() * 0.6);
    maxLife[i] = life[i];
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}

export function explosion(x, y, z) {
  burst(x, y + 0.6, z, 0xff7a1a, 60, 14, 9, 1.1);
  burst(x, y + 0.4, z, 0xffd23a, 30, 9, 7, 0.7);
  burst(x, y + 1.2, z, 0x555555, 24, 4, 6, 1.6);
  S.effects.shake = Math.max(S.effects.shake, 0.9);
  if (window.__viceBoom) window.__viceBoom();
}

export function muzzleFlash(x, y, z) {
  burst(x, y, z, 0xffe9a8, 6, 5, 1, 0.18);
}

export function sparkBurst(x, y, z) {
  burst(x, y, z, 0xfff2b0, 10, 7, 3, 0.4);
}

export function updateEffects(dt) {
  if (!points) return;
  for (let i = 0; i < MAX; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    if (life[i] <= 0) {
      posAttr.setXYZ(i, 0, -100, 0);
      continue;
    }
    let px = posAttr.getX(i);
    let py = posAttr.getY(i);
    let pz = posAttr.getZ(i);
    vel[i * 3 + 1] -= 12 * dt;
    px += vel[i * 3] * dt;
    py += vel[i * 3 + 1] * dt;
    pz += vel[i * 3 + 2] * dt;
    if (py < 0.05) { py = 0.05; vel[i * 3 + 1] *= -0.4; }
    posAttr.setXYZ(i, px, py, pz);
  }
  posAttr.needsUpdate = true;
  // camera shake decays
  S.effects.shake = Math.max(0, S.effects.shake - dt * 1.8);
}
