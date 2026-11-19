// city.js — builds Neon Bay: a sunset grid city with roads, lit towers,
// neon signs, street lamps, palms and a dusk sky. All textures are drawn
// on canvases at runtime, so the game ships zero image files.

import * as THREE from 'three';
import { S } from './state.js';
import { makeRng, randRange, randInt, pick } from './utils.js';

const NEON = ['#ff2d78', '#00e5ff', '#ffe600', '#ff6a00', '#b967ff', '#39ff88'];
const SIGN_TEXTS = [
  ['VICE LIGHTS', '#ff2d78'], ['NEON BAY', '#00e5ff'], ['CASINO LUMEN', '#ffe600'],
  ['HOTEL MARA', '#ff6a00'], ['CLUB PULSE', '#b967ff'], ['PIZZA 24H', '#39ff88'],
  ['TAXI', '#ffe600'], ['DOCK 9', '#00e5ff'], ['BAR NOIR', '#ff2d78'],
  ['MOTEL SUN', '#ff6a00'], ['ARCADE', '#b967ff'], ['GYM IRON', '#39ff88'],
];

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// One 1024px ground texture: asphalt blocks, roads, lane dashes, crosswalks,
// sidewalks and the plaza around the docks. Drawn once, used by the big plane.
// Roads sit on multiples of 40 (-160..160); blocks fill the gaps between.
const ROAD_LINES = [-160, -120, -80, -40, 0, 40, 80, 120, 160];

function makeGroundTexture() {
  const half = S.city.half;
  const size = 1024;
  const toPx = (v) => ((v + half) / (half * 2)) * size;
  return canvasTexture(size, size, (g) => {
    g.fillStyle = '#1b1b22';
    g.fillRect(0, 0, size, size);
    // sidewalk blocks between the roads
    g.fillStyle = '#2a2a33';
    for (let i = 0; i < ROAD_LINES.length - 1; i++) {
      for (let j = 0; j < ROAD_LINES.length - 1; j++) {
        g.fillRect(toPx(ROAD_LINES[i] + 5), toPx(ROAD_LINES[j] + 5),
          toPx(ROAD_LINES[i + 1] - 5) - toPx(ROAD_LINES[i] + 5),
          toPx(ROAD_LINES[j + 1] - 5) - toPx(ROAD_LINES[j] + 5));
      }
    }
    // roads
    g.fillStyle = '#15151b';
    for (const k of ROAD_LINES) {
      g.fillRect(0, toPx(k - 5), size, toPx(k + 5) - toPx(k - 5));
      g.fillRect(toPx(k - 5), 0, toPx(k + 5) - toPx(k - 5), size);
    }
    // lane dashes
    g.fillStyle = '#c8a23a';
    for (const k of ROAD_LINES) {
      for (let v = -156; v < 160; v += 12) {
        g.fillRect(toPx(v), toPx(k - 0.4), toPx(v + 5) - toPx(v), toPx(k + 0.4) - toPx(k - 0.4));
        g.fillRect(toPx(k - 0.4), toPx(v), toPx(k + 0.4) - toPx(k - 0.4), toPx(v + 5) - toPx(v));
      }
    }
    // crosswalks at every intersection
    g.fillStyle = 'rgba(230,230,230,0.55)';
    for (const x of ROAD_LINES) {
      for (const z of ROAD_LINES) {
        for (let i = -2; i <= 2; i++) {
          g.fillRect(toPx(x - 4 + i * 1.6), toPx(z - 8), toPx(x - 3 + i * 1.6) - toPx(x - 4 + i * 1.6), toPx(z - 5) - toPx(z - 8));
        }
      }
    }
  });
}

// Building face: dark facade with a grid of windows, some lit warm, some neon.
function makeFacadeTexture(rng, tint) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    const cols = 6;
    const rows = 14;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng();
        if (lit < 0.45) g.fillStyle = pick(rng, ['#ffd27a', '#ff9d5c', '#9be8ff', '#fff3c4']);
        else if (lit < 0.50) g.fillStyle = pick(rng, NEON);
        else g.fillStyle = '#0d0d14';
        g.fillRect(8 + c * 19, 10 + r * 17, 12, 10);
      }
    }
  });
}

function makeSignTexture(text, color) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#0a0a12';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = color;
    g.font = 'bold 56px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 22;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function makeSkyTexture() {
  return canvasTexture(16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1a1033');
    grad.addColorStop(0.45, '#5b2350');
    grad.addColorStop(0.72, '#c65a3a');
    grad.addColorStop(0.88, '#ff9d4d');
    grad.addColorStop(1, '#ffc46b');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function buildCity(scene) {
  const rng = makeRng(S.seed);
  const half = S.city.half;
  const spacing = S.city.roadSpacing;

  // --- sky dome + sunset sun disc -----------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sun.position.set(-420, 110, -760);
  sun.lookAt(0, 60, 0);
  scene.add(sun);

  // --- lights ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x8a6bbf, 0x1a1210, 1.05));
  const sunLight = new THREE.DirectionalLight(0xff9d5c, 1.7);
  sunLight.position.set(-160, 120, -80);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x403060, 0.5));

  // --- ground ----------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, half * 2 + 80),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // road centre lines, for traffic AI + minimap (multiples of 40)
  for (const k of ROAD_LINES) {
    S.city.roads.push({ axis: 'x', at: k });
    S.city.roads.push({ axis: 'z', at: k });
  }

  // --- buildings (block centres sit between the roads: -140..140) -----------
  const facades = [
    makeFacadeTexture(rng, '#23232e'),
    makeFacadeTexture(rng, '#2e2438'),
    makeFacadeTexture(rng, '#1e2a33'),
    makeFacadeTexture(rng, '#33241f'),
  ];
  const downtown = 80; // taller towers near the centre
  for (let bx = -140; bx <= 140; bx += spacing) {
    for (let bz = -140; bz <= 140; bz += spacing) {
      const distC = Math.max(Math.abs(bx), Math.abs(bz));
      const hMax = distC < downtown ? 55 : 26;
      const count = rng() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        // Buildings must stay inside the block interior (centre +/-14):
        // the roads at +/-20 from the block centre keep a 5-unit half-width,
        // so a footprint any wider would jut into traffic and wedge cars.
        let w;
        let d;
        let ox;
        let oz;
        if (count === 1) {
          w = randRange(rng, 14, 22);
          d = randRange(rng, 14, 22);
          ox = 0;
          oz = 0;
        } else {
          w = randRange(rng, 10, 12);
          d = randRange(rng, 10, 12);
          ox = i === 0 ? -7 : 7;
          oz = i === 0 ? -6 : 6;
        }
        const h = randRange(rng, 8, hMax);
        const x = bx + ox;
        const z = bz + oz;
        const tex = pick(rng, facades);
        const mat = new THREE.MeshLambertMaterial({
          map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55,
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        scene.add(b);
        S.city.buildings.push({ x, z, w, d, h, mesh: b });
        S.city.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // rooftop neon edge on the tallest towers
        if (h > 30 && rng() < 0.6) {
          const edge = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
            new THREE.MeshBasicMaterial({ color: pick(rng, NEON) }),
          );
          edge.position.set(x, h + 0.2, z);
          scene.add(edge);
        }
      }
    }
  }

  // --- neon signs on downtown faces -------------------------------------------
  for (let i = 0; i < 26; i++) {
    const b = pick(rng, S.city.buildings);
    if (!b || b.h < 14) continue;
    const [text, color] = pick(rng, SIGN_TEXTS);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 2.8),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color), transparent: true }),
    );
    const side = Math.floor(rng() * 4);
    const y = randRange(rng, 6, Math.min(b.h - 2, 26));
    if (side === 0) { sign.position.set(b.x, y, b.z - b.d / 2 - 0.15); }
    else if (side === 1) { sign.position.set(b.x, y, b.z + b.d / 2 + 0.15); sign.rotation.y = Math.PI; }
    else if (side === 2) { sign.position.set(b.x - b.w / 2 - 0.15, y, b.z); sign.rotation.y = -Math.PI / 2; }
    else { sign.position.set(b.x + b.w / 2 + 0.15, y, b.z); sign.rotation.y = Math.PI / 2; }
    scene.add(sign);
    S.city.signs.push(sign);
  }

  // --- street lamps (emissive head + glow sprite, no extra lights) ------------
  const lampHeadGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22222a });
  for (let k = -half + 20; k <= half - 20; k += spacing) {
    for (const [lx, lz] of [[k, -half + 6], [k, half - 6], [-half + 6, k], [half - 6, k]]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lx, 3, lz);
      scene.add(pole);
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(lx, 6.2, lz);
      scene.add(head);
    }
  }

  // --- palms along the central avenue -----------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3421 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1d5c33 });
  for (let k = -160; k <= 160; k += 20) {
    for (const z of [-8, 8]) {
      if (Math.abs(k) < 12) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
      trunk.position.set(k, 3.5, z);
      scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.2, 7), leafMat);
      crown.position.set(k, 7.8, z);
      scene.add(crown);
    }
  }

  // --- dock plaza prop: shipping containers at the south edge -----------------
  const contColors = [0xc23b2e, 0x2e7dc2, 0x3fae5a, 0xd8a018];
  for (let i = 0; i < 8; i++) {
    const cont = new THREE.Mesh(
      new THREE.BoxGeometry(10, 3, 3),
      new THREE.MeshLambertMaterial({ color: contColors[i % 4] }),
    );
    cont.position.set(-140 + i * 13, 1.5, 168);
    cont.rotation.y = (i % 2) * 0.12;
    scene.add(cont);
    S.city.colliders.push({ minX: cont.position.x - 5, maxX: cont.position.x + 5, minZ: 166.5, maxZ: 169.5 });
  }
  scene.fog = new THREE.Fog(0x2a1638, 150, 620);
}

// Push a circle (player / car / ped) out of building colliders. Returns true on hit.
export function collideCircle(x, z, radius) {
  for (const c of S.city.colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < radius * radius) return c;
  }
  return null;
}

// Is this point on a road (drivable) rather than inside a block?
export function onRoad(x, z) {
  const s = S.city.roadSpacing;
  const half = S.city.roadWidth / 2 + 1;
  const rx = Math.abs(((x + s / 2) % s + s) % s - s / 2);
  const rz = Math.abs(((z + s / 2) % s + s) % s - s / 2);
  return rx < half || rz < half;
}
