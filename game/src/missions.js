// missions.js — the story of Jax Marlowe, getaway driver of Neon Bay.
// Six missions for Mara Voss, each a chain of steps: drive somewhere, pick
// something up, fight someone, lose the heat, get paid. Between missions a
// yellow M beacon marks the next job; walking into it starts the story.

import * as THREE from 'three';
import { S } from './state.js';
import { dist2D } from './utils.js';
import { spawnEnemy, enemiesAlive, clearEnemies } from './combat.js';
import { setWanted, addHeat } from './police.js';
import { makeCar, placeCar } from './vehicles.js';

const MISSIONS = [
  {
    title: 'FIRST FARE',
    intro: 'Mara Voss needs a driver she can trust. Prove it: pick up her client on 2nd Ave and drop him at Hotel Mara. No heat, no drama.',
    reward: 300,
    start: { x: 0, z: 40 },
    steps: [
      { text: 'Pick up the client at the taxi stand (2nd Ave)', x: 80, z: 40, radius: 6, kind: 'goto' },
      { text: 'Drive the client to Hotel Mara', x: 120, z: -80, radius: 7, kind: 'goto' },
    ],
  },
  {
    title: 'HOT WHEELS',
    intro: 'A Comet GT is parked on 3rd Ave with the keys in it. Jack it, then bring it to the garage on Dockside. The owner will notice — drive fast.',
    reward: 500,
    start: { x: -80, z: 80 },
    steps: [
      {
        text: 'Steal the Comet GT parked on 3rd Ave', x: -120, z: 40, radius: 6, kind: 'goto',
        setup() {
          const car = makeCar('sport', 0xff2d78, S.three.scene);
          placeCar(car, -120, 40, Math.PI / 2, 'parked');
          car.group.userData.targetCar = true;
          S.cars.push(car);
          S.mission.data.targetCar = car;
        },
      },
      {
        text: 'Deliver the Comet to the Dockside garage', x: -160, z: -120, radius: 8, kind: 'goto',
        setup() { setWanted(1); },
      },
    ],
  },
  {
    title: 'THE DROP',
    intro: 'A package for the docks, handoff in the alley behind Club Pulse. The Red Jacks want it too. On foot, gun out.',
    reward: 450,
    start: { x: -40, z: 80 },
    steps: [
      { text: 'Reach the alley behind Club Pulse', x: -40, z: 120, radius: 6, kind: 'goto' },
      {
        text: 'The Red Jacks ambushed you — take them down', x: -40, z: 120, radius: 30, kind: 'fight',
        setup() {
          spawnEnemy(-36, 116, S.three.scene);
          spawnEnemy(-44, 124, S.three.scene);
          spawnEnemy(-32, 126, S.three.scene);
          addHeat(8, 'ambush');
        },
      },
      { text: 'Deliver the package to the dock office', x: 80, z: 120, radius: 6, kind: 'goto' },
    ],
  },
  {
    title: 'HEAT WAVE',
    intro: 'You burned a cop car in the last job and the whole precinct is awake. Three stars on your head. Survive 45 seconds, then vanish at the hideout.',
    reward: 600,
    start: { x: 80, z: -40 },
    steps: [
      {
        text: 'Survive the heat — 45 seconds', x: 80, z: -40, radius: 999, kind: 'escape', timer: 45,
        setup() { setWanted(3); },
      },
      { text: 'Lose them — reach the hideout', x: 160, z: 160, radius: 8, kind: 'goto' },
    ],
  },
  {
    title: 'NEON HEIST',
    intro: 'Casino Lumen keeps the night take in a back room. Walk in, grab the cash, walk out. The guards will not just watch.',
    reward: 900,
    start: { x: 0, z: -80 },
    steps: [
      { text: 'Get inside Casino Lumen', x: 0, z: -120, radius: 6, kind: 'goto' },
      {
        text: 'Grab the cash from the back room', x: 0, z: -120, radius: 5, kind: 'grab',
        setup() {
          spawnEnemy(4, -116, S.three.scene);
          spawnEnemy(-4, -124, S.three.scene);
          spawnEnemy(6, -124, S.three.scene);
          spawnEnemy(-6, -116, S.three.scene);
        },
      },
      { text: 'Drop the guards, then run', x: 0, z: -120, radius: 30, kind: 'fight' },
      { text: 'Escape to the north hideout', x: -160, z: -160, radius: 8, kind: 'goto' },
    ],
  },
  {
    title: 'THE GETAWAY',
    intro: 'Last job. Mara herself is in the back seat and the whole city is locked down. Four stars. Drive her to the docks and do not stop for anything.',
    reward: 1500,
    start: { x: -40, z: -80 },
    steps: [
      { text: 'Pick up Mara on 1st Ave', x: -40, z: -80, radius: 6, kind: 'goto' },
      {
        text: 'Drive Mara to the docks — do not stop', x: 0, z: 160, radius: 9, kind: 'goto',
        setup() { setWanted(4); },
      },
    ],
  },
];

let beacon = null;
let beaconRing = null;

function makeBeacon(scene, x, z, color = 0xffe600) {
  removeBeacon();
  beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 40, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.set(x, 20, z);
  scene.add(beacon);
  beaconRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.18, 8, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.position.set(x, 0.25, z);
  scene.add(beaconRing);
}

export function removeBeacon() {
  if (beacon) { S.three.scene.remove(beacon); beacon = null; }
  if (beaconRing) { S.three.scene.remove(beaconRing); beaconRing = null; }
}

export function missionCount() {
  return MISSIONS.length;
}

export function missionTitle(i) {
  return MISSIONS[i].title;
}

function currentStep() {
  const m = MISSIONS[S.mission.index];
  return m ? m.steps[S.mission.step] : null;
}

function showStep() {
  const m = MISSIONS[S.mission.index];
  const step = currentStep();
  if (!step) return;
  S.mission.objective = step.text;
  S.mission.target = { x: step.x, z: step.z, label: step.text };
  S.mission.timer = step.timer || 0;
  makeBeacon(S.three.scene, step.x, step.z);
  if (step.setup) step.setup();
}

export function startMission(i) {
  const m = MISSIONS[i];
  if (!m) return;
  S.mission.index = i;
  S.mission.step = 0;
  S.mission.active = true;
  S.mission.title = m.title;
  S.mission.data = {};
  if (window.__viceNotify) window.__viceNotify(`${m.title} — ${m.intro}`);
  if (window.__viceJingle) window.__viceJingle();
  showStep();
}

// Between missions: a beacon at the next job's start; walk into it to begin.
export function armNextMission() {
  const next = S.mission.completed.length;
  if (next >= MISSIONS.length) {
    S.mission.objective = 'Neon Bay is yours. Free roam — cause chaos, or just drive.';
    S.mission.target = null;
    removeBeacon();
    return;
  }
  const m = MISSIONS[next];
  S.mission.index = next;
  S.mission.active = false;
  S.mission.title = m.title;
  S.mission.objective = `Next job: ${m.title} — go to the yellow M`;
  S.mission.target = { x: m.start.x, z: m.start.z, label: m.title };
  makeBeacon(S.three.scene, m.start.x, m.start.z);
}

export function completeMission() {
  const m = MISSIONS[S.mission.index];
  S.player.cash += m.reward;
  S.mission.totalEarned += m.reward;
  S.mission.completed.push(S.mission.index);
  S.mission.active = false;
  removeBeacon();
  clearEnemies();
  if (window.__viceNotify) window.__viceNotify(`${m.title} COMPLETE — +$${m.reward}`);
  if (window.__viceJingle) window.__viceJingle();
  if (window.__viceSave) window.__viceSave();
  if (S.mission.index === MISSIONS.length - 1) {
    S.mode = 'finale';
    if (window.__viceFinale) window.__viceFinale();
    return;
  }
  armNextMission();
}

function advanceStep() {
  S.mission.step += 1;
  const m = MISSIONS[S.mission.index];
  if (S.mission.step >= m.steps.length) {
    completeMission();
    return;
  }
  showStep();
}

export function updateMissions(dt) {
  // beacon pulse
  if (beacon) {
    const s = 1 + Math.sin(S.time * 3) * 0.12;
    beacon.scale.set(s, 1, s);
    beacon.material.opacity = 0.16 + Math.sin(S.time * 3) * 0.06;
  }
  if (beaconRing) {
    beaconRing.scale.setScalar(1 + Math.sin(S.time * 3) * 0.15);
  }
  const p = S.player;
  const px = p.inCar && p.car ? p.car.x : p.x;
  const pz = p.inCar && p.car ? p.car.z : p.z;

  // waiting for the player to walk into the next job's beacon
  if (!S.mission.active) {
    if (S.mission.target && S.mission.index < MISSIONS.length && !S.mission.completed.includes(S.mission.index)) {
      if (dist2D(px, pz, S.mission.target.x, S.mission.target.z) < 6) {
        startMission(S.mission.index);
      }
    }
    return;
  }
  const step = currentStep();
  if (!step) return;

  if (step.kind === 'goto' || step.kind === 'grab') {
    if (dist2D(px, pz, step.x, step.z) < step.radius) {
      if (step.kind === 'grab') {
        p.cash += 200;
        setWanted(3);
        if (window.__viceNotify) window.__viceNotify('Cash grabbed! +$200 — the alarm is screaming.');
      }
      advanceStep();
    }
  } else if (step.kind === 'fight') {
    if (enemiesAlive() === 0) advanceStep();
  } else if (step.kind === 'escape') {
    S.mission.timer -= dt;
    S.mission.objective = `Survive the heat — ${Math.max(0, Math.ceil(S.mission.timer))}s`;
    if (S.mission.timer <= 0) advanceStep();
  }
}

// For screenshots / debug: jump straight into a mission at a step.
export function forceMission(index, step = 0) {
  S.mission.index = index;
  S.mission.step = 0;
  S.mission.active = true;
  S.mission.title = MISSIONS[index].title;
  S.mission.data = {};
  for (let i = 0; i < step; i++) {
    const s = MISSIONS[index].steps[i];
    if (s.setup) s.setup();
  }
  S.mission.step = step;
  showStep();
}
