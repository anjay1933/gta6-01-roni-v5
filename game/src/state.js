// state.js — the one shared game state every system reads and writes.
// No three.js import here on purpose: state is plain data, modules attach
// their THREE objects to it at build time. main.js creates it once.

export const S = {
  mode: 'menu', // menu | playing | paused | busted | wasted | finale
  time: 0,
  seed: 20261119,
  paused: false,
  muted: false,
  shotMode: null,

  three: { scene: null, camera: null, renderer: null, clock: null },

  city: {
    half: 180, // city extends -180..180 on x and z
    roadSpacing: 40,
    roadWidth: 10,
    roads: [], // road centre lines: {axis:'x'|'z', at:number}
    buildings: [], // {x, z, w, d, h, mesh}
    colliders: [], // {minX, maxX, minZ, maxZ}
    signs: [],
    bounds: 180,
  },

  player: {
    group: null,
    x: 0, z: 8, heading: 0, // heading: radians, 0 = facing -z
    walkSpeed: 0,
    health: 100, maxHealth: 100,
    cash: 250,
    ammo: 12, magSize: 12, reserve: 60,
    armed: true,
    inCar: false,
    car: null, // the car object the player drives, when inCar
    moving: false,
    punchTimer: 0,
    reloadTimer: 0,
    invuln: 0,
  },

  cars: [], // every car: {group, kind, color, x, z, heading, speed, driver, health, ai, wheels, lightBar}
  peds: [], // pedestrians: {group, x, z, heading, speed, state, fleeTimer, legL, legR}
  enemies: [], // mission goons: {group, x, z, heading, health, shootTimer, alive}

  police: {
    wanted: 0, // 0..5 stars
    heat: 0, // 0..100, drives wanted changes
    cops: [], // police cars + foot cops chasing
    spawnTimer: 0,
    hiddenTimer: 0,
    bustedTimer: 0,
    lastSeen: 0,
  },

  mission: {
    index: 0, // which of the 6 story missions is current
    step: 0,
    active: false,
    title: '',
    objective: '',
    target: null, // {x, z, label}
    beacon: null, // THREE mesh marking the target
    blip: null,
    timer: 0, // mission countdowns (escape timers etc)
    data: {}, // per-mission scratch (passenger, package car, ...)
    completed: [], // indices of finished missions
    totalEarned: 0,
  },

  combat: {
    shooting: false,
    muzzleTimer: 0,
    muzzleLight: null,
    tracer: null,
  },

  effects: {
    particles: [], // {mesh, vx, vy, vz, life, maxLife}
    shake: 0,
  },

  audio: {
    ctx: null, master: null, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, musicTimer: 0, started: false,
  },

  camera: {
    yaw: 0, pitch: 0.32, dist: 8.5,
    shakeX: 0, shakeY: 0,
  },

  ui: {}, // DOM refs filled by hud.js
  save: { slot: 'vicelights-save-v1' },
};

export function resetRunState() {
  S.mode = 'playing';
  S.time = 0;
  S.player.health = 100;
  S.player.ammo = 12;
  S.player.reserve = 60;
  S.player.inCar = false;
  S.player.car = null;
  S.police.wanted = 0;
  S.police.heat = 0;
  S.police.cops = [];
  S.police.bustedTimer = 0;
  S.mission.active = false;
  S.mission.step = 0;
  S.mission.timer = 0;
  S.mission.data = {};
  S.enemies = [];
}
