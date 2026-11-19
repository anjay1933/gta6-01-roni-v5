// traffic.js — Neon Bay's living streets: traffic cars that follow the road
// grid and pedestrians who stroll the sidewalks and flee from gunfire.
// Traffic cars drive lane-correct, turn at intersections and brake for the
// car ahead; pedestrians wander block to block and run when scared.

import * as THREE from 'three';
import { S } from './state.js';
import { makeRng, randRange, pick, dist2D, clamp } from './utils.js';
import { makeCar, placeCar, randomCarColor } from './vehicles.js';
import { collideCircle, onRoad } from './city.js';

const PED_SHIRTS = [0x2fae6b, 0xe8b13a, 0x3a7de8, 0xe8e8e8, 0xd13a7d, 0x6b4fd8];

export function spawnTraffic(scene, count) {
  const rng = makeRng(S.seed + 77);
  const kinds = ['sedan', 'sedan', 'taxi', 'van', 'sport'];
  for (let i = 0; i < count; i++) {
    const kind = pick(rng, kinds);
    const car = makeCar(kind, randomCarColor(rng), scene);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = Math.floor(randRange(rng, -4, 4)) * 40;
    const along = randRange(rng, -170, 170);
    const x = axis === 'x' ? along : road + 2.5;
    const z = axis === 'x' ? road + 2.5 : along;
    const heading = axis === 'x' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    placeCar(car, x, z, heading, 'traffic');
    car.ai = {
      axis, road, targetSpeed: randRange(rng, 9, 15),
      nextTurn: randRange(rng, 30, 90),
    };
    S.cars.push(car);
  }
}

export function spawnParkedCars(scene, count) {
  const rng = makeRng(S.seed + 131);
  const kinds = ['sedan', 'sport', 'taxi', 'van'];
  for (let i = 0; i < count; i++) {
    const kind = pick(rng, kinds);
    const car = makeCar(kind, randomCarColor(rng), scene);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = Math.floor(randRange(rng, -4, 4)) * 40;
    const along = randRange(rng, -160, 160);
    const x = axis === 'x' ? along : road + 7.5;
    const z = axis === 'x' ? road + 7.5 : along;
    placeCar(car, x, z, axis === 'x' ? Math.PI / 2 : 0, 'parked');
    S.cars.push(car);
  }
}

function carAhead(car, dist) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of S.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < dist && side < 2.4) return other;
  }
  return null;
}

export function updateTraffic(dt) {
  const spacing = S.city.roadSpacing;
  for (const car of S.cars) {
    if (car.driver !== 'traffic' || !car.ai) continue;
    const ai = car.ai;
    // brake for the car ahead
    const ahead = carAhead(car, 12);
    const want = ahead ? 0 : ai.targetSpeed;
    car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
    // turn at intersections sometimes
    ai.nextTurn -= Math.abs(car.speed) * dt;
    const onIntersection = Math.abs(((car.x % spacing) + spacing) % spacing) < 3
      || Math.abs(((car.z % spacing) + spacing) % spacing) < 3;
    if (ai.nextTurn <= 0 && onIntersection && Math.abs(car.speed) > 4) {
      ai.nextTurn = randRange(Math.random, 40, 110);
      const turn = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      car.heading += turn;
      // snap onto the new road lane
      if (Math.abs(Math.sin(car.heading)) > 0.5) car.z = Math.round(car.z / spacing) * spacing + 2.5;
      else car.x = Math.round(car.x / spacing) * spacing + 2.5;
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // wrap around the city edge so traffic never runs out
    if (car.x > 185) car.x = -185;
    if (car.x < -185) car.x = 185;
    if (car.z > 185) car.z = -185;
    if (car.z < -185) car.z = 185;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    for (const w of car.wheels) w.rotation.x += car.speed * dt * 2.2;
  }
}

export function makePedestrian(scene, rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, PED_SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xd9a066, 0x8a5a34, 0xf0c8a0]) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1e2430 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  torso.position.y = 1.1;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skin);
  head.position.y = 1.68;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), pants);
  legL.position.set(-0.15, 0.31, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legR);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
  scene.add(g);
  const ped = {
    group: g, legL, legR,
    x: 0, z: 0, heading: 0,
    speed: randRange(rng, 1.2, 2.2),
    state: 'walk', fleeTimer: 0,
    targetX: 0, targetZ: 0,
  };
  g.userData.ped = ped;
  return ped;
}

export function spawnPedestrians(scene, count) {
  const rng = makeRng(S.seed + 55);
  for (let i = 0; i < count; i++) {
    const ped = makePedestrian(scene, rng);
    // start on a sidewalk next to a road
    const road = Math.floor(randRange(rng, -4, 4)) * 40;
    const along = randRange(rng, -170, 170);
    if (rng() < 0.5) { ped.x = along; ped.z = road + 7; }
    else { ped.x = road + 7; ped.z = along; }
    ped.heading = rng() * Math.PI * 2;
    pickNewTarget(ped, rng);
    S.peds.push(ped);
  }
}

function pickNewTarget(ped, rng) {
  ped.targetX = clamp(ped.x + randRange(rng, -50, 50), -175, 175);
  ped.targetZ = clamp(ped.z + randRange(rng, -50, 50), -175, 175);
}

// A loud bang or a cop chase scares every pedestrian nearby.
export function scarePeds(x, z, radius) {
  for (const ped of S.peds) {
    if (dist2D(ped.x, ped.z, x, z) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 3 + Math.random() * 2;
    }
  }
}

export function updatePedestrians(dt) {
  const rng = Math.random;
  for (const ped of S.peds) {
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }
    const speed = ped.state === 'flee' ? 6.5 : ped.speed;
    let tx = ped.targetX;
    let tz = ped.targetZ;
    if (ped.state === 'flee') {
      // run away from the player
      tx = ped.x + (ped.x - S.player.x);
      tz = ped.z + (ped.z - S.player.z);
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) {
      if (ped.state === 'walk') pickNewTarget(ped, rng);
      continue;
    }
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    // peds stay out of buildings and off the road centre
    if (!collideCircle(nx, nz, 0.5)) {
      ped.x = nx;
      ped.z = nz;
    }
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = ped.heading;
    const swing = Math.sin(S.time * (ped.state === 'flee' ? 14 : 8)) * 0.5;
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
  }
}

// A car ploughing through a pedestrian: knock them down (they get up later).
export function checkCarPedCollisions() {
  for (const car of S.cars) {
    if (Math.abs(car.speed) < 3) continue;
    for (const ped of S.peds) {
      if (ped.state === 'down') continue;
      if (dist2D(car.x, car.z, ped.x, ped.z) < 2) {
        ped.state = 'down';
        ped.fleeTimer = 4;
        ped.group.rotation.x = Math.PI / 2 * 0.9;
        ped.group.position.y = 0.3;
        if (car.driver === 'player') {
          S.police.heat = Math.min(100, S.police.heat + 18);
          scarePeds(ped.x, ped.z, 30);
        }
      }
    }
  }
  for (const ped of S.peds) {
    if (ped.state === 'down' && ped.fleeTimer <= 0) {
      ped.state = 'walk';
      ped.group.rotation.x = 0;
      ped.group.position.y = 0;
    }
  }
}
