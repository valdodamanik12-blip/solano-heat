// Solano Heat — the save: one localStorage record carrying money, story progress,
// found reels, the pistol, where Mari stood, and her lifetime stats. Autosaved by
// the game loop at milestones and on a timer; Continue on the title screen reads
// exactly this. A corrupt or foreign record is ignored, never fatal.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return Boolean(window.localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function saveGame(game) {
  try {
    const p = game.player.pos();
    const data = {
      v: 1,
      money: game.money,
      storyIndex: game.missions.storyIndex,
      storyDone: game.missions.storyDone,
      reels: [...game.reelsFound],
      weapon: game.player.weapon,
      x: Math.round(p.x),
      y: Math.round(p.y),
      health: Math.round(game.player.health),
      stats: game.stats,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable (private mode, quotas); the game plays on.
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage itself is unavailable.
  }
}
