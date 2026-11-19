// utils.js — small math + seeded random helpers shared by every system.
// Nothing here knows about three.js; positions are plain {x, z} or THREE vectors
// passed in by callers, so this file stays tiny and testable on its own.

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// mulberry32 — a tiny deterministic PRNG so a ?seed= URL replays the same city.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

// Format cash the way the HUD shows it: $1,250
export function formatCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

// Snap a world position onto the nearest road centre line (roads run on a grid).
export function nearestRoadCoord(v, spacing, half) {
  const k = Math.round(v / spacing);
  return clamp(k * spacing, -half, half);
}
