// Solano Heat — deterministic randomness and the small math helpers every system
// shares. The city is generated from one seed, so a given build of the game always
// raises the same Solano Bay; ambient life uses a separate stream so it can jitter
// without ever reshaping the streets.

/** mulberry32: a tiny seeded PRNG. Returns a function giving floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max) drawn from rng. */
export function rand(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max] inclusive, drawn from rng. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of arr, drawn from rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** True with probability p, drawn from rng. */
export function chance(rng, p) {
  return rng() < p;
}

/** A copy of arr shuffled with rng (Fisher–Yates). */
export function shuffled(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed distance between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Turn `angle` toward `target` by at most `maxStep`. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Is the point (x, y) inside the rect {x, y, w, h}, grown by pad on every side? */
export function pointInRect(x, y, r, pad = 0) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}
