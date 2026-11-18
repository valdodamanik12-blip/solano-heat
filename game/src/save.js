// localStorage persistence for the run: cash, story progress, gun
// ownership and where the player left off. Saving is best-effort — a
// browser that refuses storage should never break the game.

const KEY = 'solano-heat-save-v1';

export function defaultSave() {
  return {
    money: null,          // null means "use the game's starting cash"
    missionIndex: 0,      // next story mission to offer (0..5)
    chainDone: false,
    hasPistol: false,
    reserveAmmo: 0,
    playerX: null,
    playerY: null,
    playSeconds: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultSave();
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the run simply will not persist.
  }
}

export function wipeSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

export function hasSave() {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
