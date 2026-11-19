// audio.js — every sound is synthesized with WebAudio: no audio files.
// Engine hum follows the car, the siren wails with the wanted level, and a
// slow synthwave bassline keeps the neon mood. Created on the first gesture.

import { S } from './state.js';

const BASSLINE = [55, 0, 55, 65.4, 55, 0, 49, 58.3, 55, 0, 55, 65.4, 73.4, 65.4, 58.3, 49];
let beat = 0;
let beatTimer = 0;

export function ensureAudio() {
  const A = S.audio;
  if (A.ctx) {
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  A.ctx = new Ctx();
  A.master = A.ctx.createGain();
  A.master.gain.value = S.muted ? 0 : 0.5;
  A.master.connect(A.ctx.destination);
  // engine: sawtooth through a lowpass
  A.engineOsc = A.ctx.createOscillator();
  A.engineOsc.type = 'sawtooth';
  A.engineOsc.frequency.value = 50;
  const lp = A.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  A.engineGain = A.ctx.createGain();
  A.engineGain.gain.value = 0;
  A.engineOsc.connect(lp);
  lp.connect(A.engineGain);
  A.engineGain.connect(A.master);
  A.engineOsc.start();
  // siren: triangle that wails between two notes
  A.sirenOsc = A.ctx.createOscillator();
  A.sirenOsc.type = 'triangle';
  A.sirenOsc.frequency.value = 700;
  A.sirenGain = A.ctx.createGain();
  A.sirenGain.gain.value = 0;
  A.sirenOsc.connect(A.sirenGain);
  A.sirenGain.connect(A.master);
  A.sirenOsc.start();
  A.started = true;
}

export function setMuted(muted) {
  S.muted = muted;
  if (S.audio.master) S.audio.master.gain.value = muted ? 0 : 0.5;
}

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(freq, dur, type = 'square', vol = 0.25) {
  const A = S.audio;
  if (!A.ctx) return;
  const o = A.ctx.createOscillator();
  const g = A.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, A.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + dur);
  o.connect(g);
  g.connect(A.master);
  o.start();
  o.stop(A.ctx.currentTime + dur);
}

export function playShot() {
  const A = S.audio;
  if (!A.ctx) return;
  const src = A.ctx.createBufferSource();
  src.buffer = noiseBuffer(A.ctx, 0.18);
  const bp = A.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(0.5, A.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.16);
  src.connect(bp);
  bp.connect(g);
  g.connect(A.master);
  src.start();
}

export function playThud() {
  blip(120, 0.12, 'sine', 0.4);
}

export function playHurt() {
  blip(180, 0.2, 'sawtooth', 0.3);
}

export function playBoom() {
  const A = S.audio;
  if (!A.ctx) return;
  const src = A.ctx.createBufferSource();
  src.buffer = noiseBuffer(A.ctx, 0.7);
  const lp = A.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(0.8, A.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.65);
  src.connect(lp);
  lp.connect(g);
  g.connect(A.master);
  src.start();
  blip(60, 0.5, 'sine', 0.5);
}

export function playJingle() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => setTimeout(() => blip(f, 0.35, 'triangle', 0.3), i * 110));
}

export function playPickup() {
  blip(880, 0.12, 'sine', 0.3);
  setTimeout(() => blip(1320, 0.18, 'sine', 0.3), 90);
}

// Called every frame: engine pitch, siren wail, and the bassline groove.
export function updateAudio(dt) {
  const A = S.audio;
  if (!A.ctx || S.muted) return;
  const p = S.player;
  const speed = p.inCar && p.car ? Math.abs(p.car.speed) : 0;
  if (A.engineGain) {
    A.engineGain.gain.value = p.inCar ? 0.05 + speed * 0.003 : 0;
    A.engineOsc.frequency.value = 55 + speed * 4.5;
  }
  if (A.sirenGain) {
    const wanted = S.police.wanted;
    A.sirenGain.gain.value = wanted > 0 && S.mode === 'playing' ? 0.05 : 0;
    A.sirenOsc.frequency.value = Math.floor(S.time * 1.6) % 2 === 0 ? 720 : 960;
  }
  // bassline: one note per beat while playing
  if (S.mode === 'playing') {
    beatTimer -= dt;
    if (beatTimer <= 0) {
      beatTimer = 0.42;
      const f = BASSLINE[beat % BASSLINE.length];
      beat = (beat + 1) % BASSLINE.length;
      if (f > 0) blip(f, 0.38, 'triangle', 0.16);
    }
  }
}
