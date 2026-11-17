// Solano Heat — the city of Solano Bay, generated once from a seed: an 11x9 grid of
// blocks cut by roads, with named districts, special POI blocks (the Klem garage, the
// police HQ, St. Solana General, Manny's Respray, the Old Port docks), parks, a beach
// row along the bay, and every spatial query the other systems need — collision,
// line of sight, road centres, sidewalk points, collectible spots.

import {
  BLOCK, CITY_SEED, COLS, PALETTE, PITCH, ROAD, ROWS, WORLD_H, WORLD_W,
} from './config.js';
import { chance, clamp, mulberry32, pick, rand, randInt } from './random.js';

/** Centre line of vertical road i (0..COLS), the roads running north–south. */
export function roadCenterX(i) {
  return i * PITCH + ROAD / 2;
}

/** Centre line of horizontal road j (0..ROWS), the roads running east–west. */
export function roadCenterY(j) {
  return j * PITCH + ROAD / 2;
}

/** The rect of block (col, row) in world units. */
export function blockRect(col, row) {
  return { x: ROAD + col * PITCH, y: ROAD + row * PITCH, w: BLOCK, h: BLOCK };
}

const DISTRICTS = [
  // [colFrom, colTo, rowFrom, rowTo, name] — first match wins.
  [0, 10, 8, 8, 'Solano Beach'],
  [0, 2, 0, 3, 'Palm Heights'],
  [0, 2, 4, 7, 'Midtown'],
  [8, 10, 0, 3, 'The Flats'],
  [8, 10, 4, 7, 'Old Port'],
  [3, 7, 0, 1, 'Northgate'],
  [3, 7, 2, 4, 'Downtown'],
  [3, 7, 5, 7, 'Marina Mile'],
];

export function districtName(col, row) {
  for (const [c0, c1, r0, r1, name] of DISTRICTS) {
    if (col >= c0 && col <= c1 && row >= r0 && row <= r1) return name;
  }
  return 'Solano Bay';
}

// Which blocks are special. Everything not listed and not in the beach row is a
// building block whose lots the generator subdivides.
const POI_BLOCKS = new Map([
  ['2,4', 'garage'],
  ['5,3', 'police'],
  ['5,1', 'hospital'],
  ['8,5', 'respray'],
  ['10,5', 'docks'],
  ['10,4', 'docks'],
  ['3,2', 'park'],
  ['7,6', 'park'],
]);

export class City {
  constructor(seed = CITY_SEED) {
    const rng = mulberry32(seed);
    this.blocks = [];
    this.solids = []; // every rect a body or a bullet must respect
    this.buildingSolids = []; // the tall subset, for line-of-sight checks
    this.palms = [];
    this.parkedSpots = [];
    this.pois = {};
    this.reels = [];
    this.buildBlocks(rng);
    this.placePois();
    this.placeReels(rng);
    this.placeParkedSpots(rng);
  }

  buildBlocks(rng) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const rect = blockRect(col, row);
        const poi = POI_BLOCKS.get(`${col},${row}`);
        let kind = 'buildings';
        if (poi) kind = poi;
        else if (row === ROWS - 1) kind = 'beach';
        const block = {
          col, row, ...rect, kind,
          district: districtName(col, row),
          buildings: [], crates: [], huts: [],
          fountain: null,
        };
        if (kind === 'buildings') this.fillBuildings(rng, block);
        if (kind === 'park') this.fillPark(rng, block);
        if (kind === 'beach') this.fillBeach(rng, block);
        if (kind === 'docks') this.fillDocks(rng, block);
        if (kind === 'garage') this.fillGarage(block);
        if (kind === 'police' || kind === 'hospital') this.fillCivic(block);
        if (kind === 'respray') this.fillRespray(block);
        this.blocks.push(block);
      }
    }
  }

  addBuilding(block, x, y, w, h, rng) {
    const b = {
      x, y, w, h,
      lift: rand(rng, 14, 46),
      color: pick(rng, PALETTE.roof),
      seed: Math.floor(rand(rng, 0, 1e9)),
    };
    block.buildings.push(b);
    this.solids.push(b);
    this.buildingSolids.push(b);
    return b;
  }

  fillBuildings(rng, block) {
    const m = 20; // sidewalk margin inside the block
    const inner = { x: block.x + m, y: block.y + m, w: block.w - 2 * m, h: block.h - 2 * m };
    const pattern = randInt(rng, 0, 2);
    if (pattern === 0) {
      this.addBuilding(block, inner.x + 14, inner.y + 14, inner.w - 28, inner.h - 28, rng);
    } else if (pattern === 1) {
      const gap = 16;
      const w = (inner.w - gap) / 2;
      this.addBuilding(block, inner.x, inner.y + 10, w, inner.h - 20, rng);
      this.addBuilding(block, inner.x + w + gap, inner.y + 10, w, inner.h - 20, rng);
    } else {
      const gap = 14;
      const w = (inner.w - gap) / 2;
      const h = (inner.h - gap) / 2;
      for (const [dx, dy] of [[0, 0], [w + gap, 0], [0, h + gap], [w + gap, h + gap]]) {
        if (chance(rng, 0.85)) this.addBuilding(block, inner.x + dx, inner.y + dy, w, h, rng);
      }
    }
    // A palm or two on the sidewalk corners.
    if (chance(rng, 0.7)) {
      this.palms.push({ x: block.x + 10, y: block.y + 10, s: rand(rng, 0.8, 1.2) });
    }
    if (chance(rng, 0.5)) {
      this.palms.push({ x: block.x + block.w - 10, y: block.y + block.h - 10, s: rand(rng, 0.8, 1.2) });
    }
  }

  fillPark(rng, block) {
    block.fountain = { x: block.x + BLOCK / 2, y: block.y + BLOCK / 2, r: 17 };
    this.solids.push({
      x: block.fountain.x - 17, y: block.fountain.y - 17, w: 34, h: 34,
    });
    for (let i = 0; i < 7; i += 1) {
      this.palms.push({
        x: block.x + rand(rng, 24, BLOCK - 24),
        y: block.y + rand(rng, 24, BLOCK - 24),
        s: rand(rng, 0.9, 1.4),
      });
    }
  }

  fillBeach(rng, block) {
    for (let i = 0; i < 4; i += 1) {
      this.palms.push({
        x: block.x + rand(rng, 18, BLOCK - 18),
        y: block.y + rand(rng, 14, 90),
        s: rand(rng, 1, 1.5),
      });
    }
    if (chance(rng, 0.6)) {
      const hut = {
        x: block.x + rand(rng, 30, BLOCK - 90), y: block.y + rand(rng, 16, 60), w: 54, h: 36,
        lift: 8, color: pick(rng, PALETTE.roof), seed: randInt(rng, 0, 1e9),
      };
      block.huts.push(hut);
      this.solids.push(hut);
    }
  }

  fillDocks(rng, block) {
    // A warehouse along the north edge and a yard of crates to weave through.
    const wh = {
      x: block.x + 12, y: block.y + 10, w: block.w - 24, h: 52,
      lift: 18, color: '#7d6a53', seed: randInt(rng, 0, 1e9),
    };
    block.buildings.push(wh);
    this.solids.push(wh);
    this.buildingSolids.push(wh);
    for (let i = 0; i < 7; i += 1) {
      const crate = {
        x: block.x + rand(rng, 16, BLOCK - 60),
        y: block.y + rand(rng, 96, BLOCK - 52),
        w: rand(rng, 30, 46), h: rand(rng, 26, 40),
      };
      block.crates.push(crate);
      this.solids.push(crate);
    }
  }

  fillGarage(block) {
    // Klem Auto Works: the workshop across the north of the block, open forecourt south.
    const shop = {
      x: block.x + 16, y: block.y + 14, w: block.w - 32, h: 74,
      lift: 12, color: '#577590', seed: 7,
    };
    block.buildings.push(shop);
    this.solids.push(shop);
    this.buildingSolids.push(shop);
  }

  fillCivic(block) {
    const hall = {
      x: block.x + 30, y: block.y + 26, w: block.w - 60, h: block.h - 90,
      lift: 22, color: '#f4f1de', seed: 11,
    };
    block.buildings.push(hall);
    this.solids.push(hall);
    this.buildingSolids.push(hall);
  }

  fillRespray(block) {
    const shop = {
      x: block.x + 16, y: block.y + 14, w: block.w - 32, h: 70,
      lift: 11, color: '#e88ca0', seed: 13,
    };
    block.buildings.push(shop);
    this.solids.push(shop);
    this.buildingSolids.push(shop);
  }

  placePois() {
    const at = (col, row) => this.blocks[row * COLS + col];
    const g = at(2, 4);
    this.pois.garage = { x: g.x + BLOCK / 2, y: g.y + 150, name: 'Klem Auto Works' };
    this.pois.dario = { x: g.x + BLOCK / 2 - 34, y: g.y + 132 };
    const p = at(5, 3);
    this.pois.police = { x: p.x + BLOCK / 2, y: p.y + BLOCK - 22, name: 'Solano Bay Police HQ' };
    const h = at(5, 1);
    this.pois.hospital = { x: h.x + BLOCK / 2, y: h.y + BLOCK - 22, name: 'St. Solana General' };
    const r = at(8, 5);
    this.pois.respray = { x: r.x + BLOCK / 2, y: r.y + 150, name: "Manny's Respray" };
    this.resprayZone = { x: r.x + 55, y: r.y + 104, w: BLOCK - 110, h: 92 };
    const d = at(10, 5);
    this.pois.docks = { x: d.x + BLOCK / 2, y: d.y + BLOCK / 2 + 30, name: 'Old Port docks' };
    this.pois.pier = { x: roadCenterX(7), y: WORLD_H - 46, name: 'Marina Pier' };
    this.pois.beach = { x: roadCenterX(2), y: WORLD_H - 120, name: 'Solano Beach' };
  }

  placeReels(rng) {
    // Twenty lost film reels, scattered on sidewalks, in parks and along the beach.
    const spots = [];
    for (const block of this.blocks) {
      if (block.kind === 'buildings' || block.kind === 'park' || block.kind === 'beach') {
        spots.push({ x: block.x + 10, y: block.y + BLOCK / 2 });
        spots.push({ x: block.x + BLOCK - 10, y: block.y + 26 });
      }
    }
    const chosen = [];
    const used = new Set();
    while (chosen.length < 20 && used.size < spots.length) {
      const i = randInt(rng, 0, spots.length - 1);
      if (used.has(i)) continue;
      used.add(i);
      chosen.push({ id: chosen.length, x: spots[i].x + rand(rng, -4, 4), y: spots[i].y + rand(rng, -4, 4) });
    }
    this.reels = chosen;
  }

  placeParkedSpots(rng) {
    // Curb parking: spots along the south and east edges of building blocks, on the
    // road, facing along it. Traffic spawns come from the same curbside logic.
    for (const block of this.blocks) {
      if (block.kind !== 'buildings' && block.kind !== 'respray' && block.kind !== 'garage') continue;
      for (let x = block.x + 26; x < block.x + block.w - 30; x += 58) {
        if (chance(rng, 0.55)) {
          this.parkedSpots.push({ x, y: block.y + block.h + 14, angle: 0 });
        }
      }
      for (let y = block.y + 26; y < block.y + block.h - 30; y += 58) {
        if (chance(rng, 0.4)) {
          this.parkedSpots.push({ x: block.x + block.w + 14, y, angle: Math.PI / 2 });
        }
      }
    }
  }

  /** The block containing a point, or null when the point is on a road or outside. */
  blockAt(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return null;
    const col = Math.floor((x - ROAD) / PITCH);
    const row = Math.floor((y - ROAD) / PITCH);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
    const block = this.blocks[row * COLS + col];
    if (x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h) return block;
    return null;
  }

  districtAt(x, y) {
    const block = this.blockAt(x, y);
    if (block) return block.district;
    const col = clamp(Math.floor(x / PITCH), 0, COLS - 1);
    const row = clamp(Math.floor(y / PITCH), 0, ROWS - 1);
    return districtName(col, row);
  }

  isRoad(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
    return (x % PITCH) < ROAD || (y % PITCH) < ROAD;
  }

  /** True when a point sits inside any solid (buildings, crates, fountains, huts). */
  pointBlocked(x, y) {
    for (const s of this.solids) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
    }
    return false;
  }

  /** True when a tall building blocks the straight line between two points. */
  losBlocked(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.floor(d / 16));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      for (const s of this.buildingSolids) {
        if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
      }
    }
    return false;
  }

  /**
   * Push a circle out of every solid it overlaps and keep it inside the world.
   * Returns the resolved position; mutates nothing.
   */
  collideCircle(x, y, r) {
    let nx = clamp(x, r, WORLD_W - r);
    let ny = clamp(y, r, WORLD_H - r);
    for (const s of this.solids) {
      const cx = clamp(nx, s.x, s.x + s.w);
      const cy = clamp(ny, s.y, s.y + s.h);
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        ny = cy + (dy / d) * r;
      } else {
        // Centre inside the rect: leave by the nearest face.
        const left = nx - s.x;
        const right = s.x + s.w - nx;
        const top = ny - s.y;
        const bottom = s.y + s.h - ny;
        const min = Math.min(left, right, top, bottom);
        if (min === left) nx = s.x - r;
        else if (min === right) nx = s.x + s.w + r;
        else if (min === top) ny = s.y - r;
        else ny = s.y + s.h + r;
      }
    }
    return { x: nx, y: ny };
  }

  /** A random point on a road centre line, for traffic and police spawns. */
  randomRoadPoint(rng) {
    if (chance(rng, 0.5)) {
      const i = randInt(rng, 0, COLS);
      return { x: roadCenterX(i), y: rand(rng, 30, WORLD_H - 30), angle: chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2 };
    }
    const j = randInt(rng, 0, ROWS);
    return { x: rand(rng, 30, WORLD_W - 30), y: roadCenterY(j), angle: chance(rng, 0.5) ? 0 : Math.PI };
  }

  /** A sidewalk point near (x, y): the edge of the nearest block, inset a little. */
  sidewalkPointNear(rng, x, y) {
    const col = clamp(Math.round((x - ROAD - BLOCK / 2) / PITCH), 0, COLS - 1);
    const row = clamp(Math.round((y - ROAD - BLOCK / 2) / PITCH), 0, ROWS - 1);
    const b = blockRect(col, row);
    const side = randInt(rng, 0, 3);
    const along = rand(rng, 12, BLOCK - 12);
    if (side === 0) return { x: b.x + along, y: b.y + 9 };
    if (side === 1) return { x: b.x + along, y: b.y + BLOCK - 9 };
    if (side === 2) return { x: b.x + 9, y: b.y + along };
    return { x: b.x + BLOCK - 9, y: b.y + along };
  }
}
