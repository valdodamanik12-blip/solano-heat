// Deterministic seedable random helpers.
// The city, traffic and crowds are generated from a seed so a given
// ?seed= always builds the same Solano Bay — that is what makes the
// screenshot scenes and the test harness reproducible.

/** Mulberry32: tiny fast PRNG, good enough for layout work. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap a raw next() function in the convenience API the game uses. */
export function rngApi(next) {
  const api = {
    next,
    /** Float in [min, max). */
    range(min, max) { return min + next() * (max - min); },
    /** Integer in [min, max] inclusive. */
    int(min, max) { return Math.floor(api.range(min, max + 1)); },
    /** True with probability p. */
    chance(p) { return next() < p; },
    /** Random element of an array (undefined for an empty one). */
    pick(list) { return list[Math.floor(next() * list.length)]; },
    /** A fresh array with the elements shuffled (Fisher–Yates). */
    shuffled(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    /** Angle in radians, any direction. */
    angle() { return next() * Math.PI * 2; },
  };
  return api;
}

/** Convenience: a ready-to-use rng object from a numeric seed. */
export function seededRng(seed) {
  return rngApi(makeRng(seed));
}

/** Parse ?seed= from a query string, falling back to a default. */
export function seedFromQuery(search, fallback = 20261117) {
  try {
    const raw = new URLSearchParams(search).get('seed');
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
