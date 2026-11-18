// Solano Bay generation: blocks, buildings, parks, the bay, the docks,
// the beach, and every named landmark the missions point at. Also owns
// collision: buildings and water block movement, piers bridge the water.

import {
  BLOCK, ROAD, PITCH, COLS, ROWS, WORLD_W, WORLD_H,
  BUILDING_PALETTES, COLORS,
} from './config.js';

/** Centreline x of the vertical road west of block column bx (0..COLS). */
export function roadCenterX(i) { return i * PITCH + ROAD / 2; }
/** Centreline y of the horizontal road north of block row by (0..ROWS). */
export function roadCenterY(j) { return j * PITCH + ROAD / 2; }

/** The land rectangle of block (bx, by). */
export function blockRect(bx, by) {
  return { x: bx * PITCH + ROAD, y: by * PITCH + ROAD, w: BLOCK, h: BLOCK };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function buildCity(rng) {
  const world = {
    w: WORLD_W,
    h: WORLD_H,
    buildings: [],   // {x,y,w,h,body,trim,floors,label?}
    parks: [],       // grass rects
    plazas: [],      // paved open rects
    sands: [],       // beach rects
    piers: [],       // walkable planks over water
    waters: [],      // blocking water rects
    trees: [],       // {x,y,palm}
    crates: [],      // small AABB props at the docks {x,y,w,h}
    lamps: [],       // {x,y} street lights along roads
    landmarks: {},
    special: new Map(),
  };

  // -- water and beach -----------------------------------------------------
  // The bay: a bite of water over the west column's middle rows. The
  // dockyards sit south of it on dry concrete, the western avenue crosses
  // it on a causeway (see bridges below), and piers reach into it.
  world.waters.push({ x: 0, y: 584, w: 248, h: 816 });
  // The sea along the very south edge, behind the beach.
  world.waters.push({ x: 0, y: WORLD_H - 84, w: WORLD_W, h: 84 });
  world.sands.push({ x: 292, y: WORLD_H - 204, w: WORLD_W - 292, h: 120 });
  // Piers: three planks reaching west into the bay from the dock road.
  for (const py of [760, 1010, 1260]) {
    world.piers.push({ x: 8, y: py, w: 240, h: 34 });
  }
  // The causeway: the western avenue's strip across the bay stays dry.
  world.bridges = [{ x: 0, y: 584, w: ROAD, h: 816 }];

  // -- special blocks --------------------------------------------------------
  const special = (bx, by, kind) => world.special.set(`${bx},${by}`, kind);
  special(5, 4, 'plaza');       // downtown plaza, Dario's corner
  special(2, 2, 'park');
  special(8, 6, 'park');
  special(0, 2, 'docks');
  special(0, 3, 'docks');
  special(0, 4, 'park');
  special(0, 5, 'docks');
  special(0, 6, 'docks');
  special(9, 1, 'garage');      // respray
  special(3, 0, 'hospital');
  special(9, 4, 'precinct');
  special(1, 7, 'beachfront');

  // -- blocks ------------------------------------------------------------------
  for (let by = 0; by < ROWS; by++) {
    for (let bx = 0; bx < COLS; bx++) {
      const r = blockRect(bx, by);
      const kind = world.special.get(`${bx},${by}`) ?? 'city';
      if (kind === 'park') {
        world.parks.push(r);
        for (let i = 0; i < 7; i++) {
          world.trees.push({ x: r.x + rng.range(18, r.w - 18), y: r.y + rng.range(18, r.h - 18), palm: false });
        }
        continue;
      }
      if (kind === 'plaza') {
        world.plazas.push(r);
        world.trees.push({ x: r.x + 22, y: r.y + 22, palm: true });
        world.trees.push({ x: r.x + r.w - 22, y: r.y + r.h - 22, palm: true });
        continue;
      }
      if (kind === 'docks') {
        world.plazas.push(r); // concrete yard
        for (let i = 0; i < 6; i++) {
          world.crates.push({
            x: r.x + rng.range(8, r.w - 34), y: r.y + rng.range(8, r.h - 34), w: 26, h: 26,
          });
        }
        continue;
      }
      if (kind === 'beachfront') {
        world.sands.push(r);
        for (let i = 0; i < 5; i++) {
          world.trees.push({ x: r.x + rng.range(16, r.w - 16), y: r.y + rng.range(16, r.h - 16), palm: true });
        }
        continue;
      }
      if (kind === 'garage' || kind === 'hospital' || kind === 'precinct') {
        // One landmark building taking most of the block, door on the
        // south side, apron of pavement in front of it.
        const pal = kind === 'hospital'
          ? { body: '#eef0ea', trim: '#b23a48' }
          : kind === 'precinct'
            ? { body: '#5b6b7f', trim: '#2f3a49' }
            : { body: '#8d6e63', trim: '#4e342e' };
        world.buildings.push({
          x: r.x + 18, y: r.y + 14, w: r.w - 36, h: r.h - 78,
          body: pal.body, trim: pal.trim, floors: kind === 'garage' ? 1 : 4,
          label: kind === 'hospital' ? 'HOSPITAL' : kind === 'precinct' ? 'POLICE' : 'RESPRAY',
        });
        world.plazas.push({ x: r.x, y: r.y + r.h - 58, w: r.w, h: 58 });
        continue;
      }
      // Ordinary city block: a sidewalk rim (drawn from the rect) plus
      // 2–4 buildings with gaps a player can slip through.
      const count = rng.int(2, 4);
      const cell = BLOCK / 2;
      const spots = rng.shuffled([0, 1, 2, 3]).slice(0, count);
      for (const s of spots) {
        const cx = r.x + (s % 2) * cell;
        const cy = r.y + Math.floor(s / 2) * cell;
        const pal = rng.pick(BUILDING_PALETTES);
        const inset = rng.range(7, 15);
        world.buildings.push({
          x: cx + inset, y: cy + inset,
          w: cell - inset * 2, h: cell - inset * 2,
          body: pal.body, trim: pal.trim,
          floors: rng.int(2, 9),
        });
      }
      if (rng.chance(0.4)) {
        world.trees.push({ x: r.x + rng.range(10, r.w - 10), y: r.y + rng.range(10, r.h - 10), palm: rng.chance(0.4) });
      }
    }
  }

  // -- street lamps along the main avenues --------------------------------------
  for (let i = 1; i < COLS; i += 2) {
    for (let j = 0; j <= ROWS; j++) {
      world.lamps.push({ x: roadCenterX(i) + ROAD / 2 - 4, y: roadCenterY(j) });
    }
  }
  for (let j = 2; j < ROWS; j += 2) {
    for (let i = 0; i <= COLS; i++) {
      world.lamps.push({ x: roadCenterX(i), y: roadCenterY(j) + ROAD / 2 - 4 });
    }
  }

  // -- landmarks -------------------------------------------------------------------
  const centre = (bx, by) => {
    const r = blockRect(bx, by);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const doorstep = (bx, by) => {
    const r = blockRect(bx, by);
    return { x: r.x + r.w / 2, y: r.y + r.h - 26 };
  };
  world.landmarks = {
    briefing: centre(5, 4),
    hospital: doorstep(3, 0),
    precinct: doorstep(9, 4),
    respray: doorstep(9, 1),
    docksYard: centre(0, 5),
    pierEnd: { x: 40, y: 1010 + 17 },
    beach: centre(1, 7),
    hideout: doorstep(9, 1), // the finale ends at the respray garage
  };
  return world;
}

/** Is the point over water (and not safely on a pier or the causeway)? */
export function inWater(world, x, y) {
  for (const p of world.piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
  }
  for (const b of world.bridges ?? []) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return false;
  }
  for (const w of world.waters) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

function pushOutOfRect(px, py, r, rect) {
  const nx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  const dx = px - nx;
  const dy = py - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * r, y: ny + (dy / d) * r };
  }
  // Centre inside the rect: leave by the nearest face.
  const left = px - rect.x;
  const right = rect.x + rect.w - px;
  const top = py - rect.y;
  const bottom = rect.y + rect.h - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: py };
  if (m === right) return { x: rect.x + rect.w + r, y: py };
  if (m === top) return { x: px, y: rect.y - r };
  return { x: px, y: rect.y + rect.h + r };
}

/**
 * Resolve a circle at (x, y) against buildings, crates and water.
 * Returns { x, y, hit } — hit is true when anything pushed back.
 * Cars use a bigger radius and accept the same treatment.
 */
export function collideCircle(world, x, y, r) {
  let hit = false;
  // Buildings near the point only (grid pitch keeps the scan cheap).
  for (const b of world.buildings) {
    if (b.x - r > x || b.x + b.w + r < x || b.y - r > y || b.y + b.h + r < y) continue;
    const out = pushOutOfRect(x, y, r, b);
    if (out) { x = out.x; y = out.y; hit = true; }
  }
  for (const c of world.crates) {
    const out = pushOutOfRect(x, y, r, c);
    if (out) { x = out.x; y = out.y; hit = true; }
  }
  // Water behaves like a wall unless a pier carries the point.
  if (inWater(world, x, y)) {
    for (const w of world.waters) {
      const out = pushOutOfRect(x, y, r, w);
      if (out && !inWater(world, out.x, out.y)) { x = out.x; y = out.y; hit = true; break; }
    }
    if (inWater(world, x, y)) hit = true; // cornered: caller sees the hit
  }
  // World bounds.
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > world.w - r) { x = world.w - r; hit = true; }
  if (y > world.h - r) { y = world.h - r; hit = true; }
  return { x, y, hit };
}

/** Quick AABB overlap test kept for other modules. */
export function overlaps(a, b) { return rectsOverlap(a, b); }
