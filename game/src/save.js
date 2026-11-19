// save.js — localStorage save / continue for VICE LIGHTS.
// Saves cash, story progress, health and position; loading puts Jax back
// where he was with the next job armed. Nothing here touches the network.

import { S } from './state.js';
import { armNextMission } from './missions.js';

export function saveGame() {
  try {
    const data = {
      v: 1,
      cash: Math.floor(S.player.cash),
      health: Math.round(S.player.health),
      ammo: S.player.ammo,
      reserve: S.player.reserve,
      completed: S.mission.completed,
      totalEarned: S.mission.totalEarned,
      x: S.player.x,
      z: S.player.z,
      heading: S.player.heading,
      savedAt: Date.now(),
    };
    localStorage.setItem(S.save.slot, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(S.save.slot);
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(S.save.slot);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    S.player.cash = d.cash;
    S.player.health = d.health;
    S.player.ammo = d.ammo;
    S.player.reserve = d.reserve;
    S.mission.completed = d.completed || [];
    S.mission.totalEarned = d.totalEarned || 0;
    S.player.x = d.x;
    S.player.z = d.z;
    S.player.heading = d.heading || 0;
    S.player.group.position.set(d.x, 0, d.z);
    S.player.group.rotation.y = d.heading;
    armNextMission();
    return d;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(S.save.slot);
  } catch { /* storage unavailable — play without saving */ }
}
