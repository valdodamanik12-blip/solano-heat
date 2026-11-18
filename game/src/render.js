// Solano Heat — painting the city: ground, roads and markings, sidewalks, parks and
// beach, the docks, and the buildings lifted toward the low sun with long shadows
// and lit windows (the 2.5D in a top-down game). Everything here is drawn from the
// generated city data, in world space, under the camera the game hands in.

import { BLOCK, PALETTE, ROAD, WORLD_H, WORLD_W } from './config.js';
import { mulberry32 } from './random.js';

// How far a building's roof is lifted from its footprint, per unit of `lift`.
const LIFT = 0.55;

export function drawWorld(ctx, game) {
  const cam = game.camera;
  const viewW = game.viewW;
  const viewH = game.viewH;
  const x0 = Math.max(0, cam.x - 60);
  const y0 = Math.max(0, cam.y - 60);
  const x1 = Math.min(WORLD_W, cam.x + viewW + 60);
  const y1 = Math.min(WORLD_H, cam.y + viewH + 60);

  drawBay(ctx, game, x0, y0, x1, y1);
  drawGround(ctx, game, x0, y0, x1, y1);
  drawRoads(ctx, game, x0, y0, x1, y1);

  // Blocks in view, ground first, then their furniture.
  const blocks = game.city.blocks.filter(
    (b) => b.x + b.w > x0 && b.x < x1 && b.y + b.h > y0 && b.y < y1,
  );
  for (const block of blocks) drawBlockGround(ctx, game, block);
  for (const block of blocks) drawBlockProps(ctx, game, block);

  drawPoiSigns(ctx, game);
  drawReels(ctx, game);
  drawObjectiveBeacon(ctx, game);
}

/** The bay itself: water beyond the south shore and around the map's edge. */
function drawBay(ctx, game, x0, y0, x1, y1) {
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(x0 - 80, y0 - 80, (x1 - x0) + 160, (y1 - y0) + 160);
  ctx.fillStyle = PALETTE.water;
  const t = game.time * 0.7;
  ctx.fillRect(x0 - 80, WORLD_H, (x1 - x0) + 160, 400);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = Math.floor(x0 / 90) * 90; x < x1 + 90; x += 90) {
    const yy = WORLD_H + 26 + Math.sin(t + x * 0.02) * 5;
    ctx.moveTo(x, yy);
    ctx.lineTo(x + 42, yy);
  }
  ctx.stroke();
  // The Marina Pier: planks walking out into the bay at the pier point.
  const pier = game.city.pois.pier;
  ctx.fillStyle = '#8a5a2f';
  ctx.fillRect(pier.x - 13, WORLD_H - 8, 26, 120);
  ctx.fillStyle = '#a9713d';
  for (let i = 0; i < 6; i += 1) ctx.fillRect(pier.x - 13, WORLD_H - 8 + i * 20, 26, 3);
}

/** The land base: one warm ground colour under everything, block by block. */
function drawGround(ctx, game, x0, y0, x1, y1) {
  ctx.fillStyle = '#cfc39f';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  for (const block of game.city.blocks) {
    if (block.x + block.w < x0 || block.x > x1 || block.y + block.h < y0 || block.y > y1) continue;
    if (block.kind === 'park') ctx.fillStyle = PALETTE.grass;
    else if (block.kind === 'beach') ctx.fillStyle = PALETTE.sand;
    else if (block.kind === 'docks') ctx.fillStyle = PALETTE.dockFloor;
    else ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }
}

function drawRoads(ctx, game, x0, y0, x1, y1) {
  ctx.fillStyle = PALETTE.asphalt;
  // Vertical roads.
  for (let i = 0; i <= 11; i += 1) {
    const x = i * (BLOCK + ROAD);
    if (x + ROAD < x0 || x > x1) continue;
    ctx.fillRect(x, 0, ROAD, WORLD_H);
  }
  // Horizontal roads.
  for (let j = 0; j <= 9; j += 1) {
    const y = j * (BLOCK + ROAD);
    if (y + ROAD < y0 || y > y1) continue;
    ctx.fillRect(0, y, WORLD_W, ROAD);
  }
  // Lane dashes down every centre line.
  ctx.strokeStyle = PALETTE.laneMark;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2.4;
  ctx.setLineDash([16, 18]);
  ctx.beginPath();
  for (let i = 0; i <= 11; i += 1) {
    const x = i * (BLOCK + ROAD) + ROAD / 2;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
  }
  for (let j = 0; j <= 9; j += 1) {
    const y = j * (BLOCK + ROAD) + ROAD / 2;
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawBlockGround(ctx, game, block) {
  if (block.kind === 'park') {
    // Paths crossing at the fountain.
    ctx.fillStyle = PALETTE.parkPath;
    ctx.fillRect(block.x, block.y + BLOCK / 2 - 9, BLOCK, 18);
    ctx.fillRect(block.x + BLOCK / 2 - 9, block.y, 18, BLOCK);
    if (block.fountain) {
      ctx.fillStyle = '#3f8ea6';
      ctx.beginPath();
      ctx.arc(block.fountain.x, block.fountain.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9fd8e8';
      ctx.beginPath();
      ctx.arc(block.fountain.x, block.fountain.y, 9 + Math.sin(game.time * 2.4) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (block.kind === 'beach') {
    // The shoreline: wet sand, then foam at the water's edge.
    ctx.fillStyle = '#e2c384';
    ctx.fillRect(block.x, block.y + BLOCK - 26, BLOCK, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(block.x, block.y + BLOCK - 5, BLOCK, 5);
  }
  if (block.kind === 'garage') {
    // The forecourt: oil-stained concrete in front of Klem Auto Works.
    ctx.fillStyle = '#a49d8c';
    ctx.fillRect(block.x + 10, block.y + 92, block.w - 20, block.h - 102);
  }
  if (block.kind === 'respray') {
    ctx.fillStyle = '#a49d8c';
    ctx.fillRect(block.x + 10, block.y + 88, block.w - 20, block.h - 98);
    // The respray bay itself, painted like a target.
    const z = game.city.resprayZone;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([]);
  }
}

function drawBlockProps(ctx, game, block) {
  // Crates at the docks.
  for (const crate of block.crates) {
    ctx.fillStyle = 'rgba(20,16,32,0.25)';
    ctx.fillRect(crate.x + 3, crate.y + 4, crate.w, crate.h);
    ctx.fillStyle = PALETTE.crate;
    ctx.fillRect(crate.x, crate.y, crate.w, crate.h);
    ctx.strokeStyle = PALETTE.crateDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(crate.x + 1, crate.y + 1, crate.w - 2, crate.h - 2);
    ctx.beginPath();
    ctx.moveTo(crate.x, crate.y);
    ctx.lineTo(crate.x + crate.w, crate.y + crate.h);
    ctx.stroke();
  }
  // Palms that belong to this block.
  for (const palm of game.city.palms) {
    if (palm.x >= block.x - 4 && palm.x <= block.x + block.w + 4 && palm.y >= block.y - 4 && palm.y <= block.y + block.h + 4) {
      drawPalm(ctx, palm, game.time);
    }
  }
  // Buildings, lifted: shadow, south wall, roof, windows.
  const sorted = block.buildings.slice().sort((a, b) => a.y - b.y);
  for (const b of sorted) drawBuilding(ctx, b, game.time);
  for (const hut of block.huts) drawBuilding(ctx, hut, game.time);
}

export function drawPalm(ctx, palm, time) {
  const sway = Math.sin(time * 1.3 + palm.x * 0.05) * 2;
  ctx.fillStyle = 'rgba(20,16,32,0.22)';
  ctx.beginPath();
  ctx.ellipse(palm.x + 6, palm.y + 5, 10 * palm.s, 5 * palm.s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.palmTrunk;
  ctx.lineWidth = 3.4 * palm.s;
  ctx.beginPath();
  ctx.moveTo(palm.x, palm.y);
  ctx.quadraticCurveTo(palm.x + 3, palm.y - 6, palm.x + sway, palm.y - 11 * palm.s);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.palmLeaf;
  ctx.lineWidth = 2.6 * palm.s;
  const topX = palm.x + sway;
  const topY = palm.y - 11 * palm.s;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + palm.x;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(a) * 9 * palm.s, topY + Math.sin(a) * 6 * palm.s - 2,
      topX + Math.cos(a) * 15 * palm.s, topY + Math.sin(a) * 10 * palm.s + 4,
    );
    ctx.stroke();
  }
}

function drawBuilding(ctx, b, time) {
  const lift = (b.lift ?? 16) * LIFT;
  // Long golden-hour shadow to the south-east.
  ctx.fillStyle = 'rgba(24,18,38,0.30)';
  ctx.fillRect(b.x + lift * 0.9, b.y + lift * 1.15, b.w, b.h);
  // The south wall, in shade.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(b.x - lift * 0.45, b.y + b.h - lift * 0.2, b.w + lift * 0.45, lift * 0.65);
  // The roof, lifted up-left toward the light.
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x - lift * 0.45, b.y - lift * 0.45, b.w, b.h);
  ctx.strokeStyle = 'rgba(16,19,28,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x - lift * 0.45, b.y - lift * 0.45, b.w, b.h);
  // Windows: a deterministic grid per building, some lit as the light goes.
  const rng = mulberry32(b.seed ?? 1);
  const cols = Math.max(2, Math.floor(b.w / 17));
  const rows = Math.max(2, Math.floor(b.h / 17));
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const lit = rng() < 0.42;
      ctx.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDark;
      ctx.globalAlpha = lit ? 0.9 : 0.55;
      ctx.fillRect(b.x - lift * 0.45 + 5 + i * 17, b.y - lift * 0.45 + 5 + j * 17, 8, 10);
    }
  }
  ctx.globalAlpha = 1;
}

/** Named places get painted signs, readable as Mari passes. */
function drawPoiSigns(ctx, game) {
  const signs = [
    { poi: game.city.pois.garage, text: 'KLEM AUTO WORKS', dy: -64 },
    { poi: game.city.pois.police, text: 'POLICE HQ', dy: -190 },
    { poi: game.city.pois.hospital, text: 'ST. SOLANA GENERAL', dy: -190 },
    { poi: game.city.pois.respray, text: "MANNY'S RESPRAY", dy: -60 },
  ];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px system-ui, sans-serif';
  for (const s of signs) {
    ctx.fillStyle = 'rgba(16,19,28,0.72)';
    const w = ctx.measureText(s.text).width + 16;
    ctx.fillRect(s.poi.x - w / 2, s.poi.y + s.dy - 14, w, 20);
    ctx.fillStyle = '#fdf6e3';
    ctx.fillText(s.text, s.poi.x, s.poi.y + s.dy);
  }
  ctx.restore();
}

/** Un-found reels glint in the sun; found ones are gone from the world. */
function drawReels(ctx, game) {
  for (const reel of game.city.reels) {
    if (game.reelsFound.has(reel.id)) continue;
    const pulse = 1 + Math.sin(game.time * 3 + reel.id) * 0.15;
    ctx.save();
    ctx.translate(reel.x, reel.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(20,16,32,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 8, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f38';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    for (const [hx, hy] of [[-3, -3], [3, -3], [0, 3.4]]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** The mission beacon: a pillar of light the whole city can see. */
function drawObjectiveBeacon(ctx, game) {
  const obj = game.missions.objective(game);
  if (!obj || game.state !== 'playing') return;
  const pulse = 0.55 + Math.sin(game.time * 4) * 0.2;
  const grad = ctx.createLinearGradient(obj.x, obj.y - 190, obj.x, obj.y);
  grad.addColorStop(0, 'rgba(255,214,10,0)');
  grad.addColorStop(1, `rgba(255,214,10,${pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(obj.x - 13, obj.y - 190, 26, 190);
  ctx.fillStyle = `rgba(255,214,10,${pulse + 0.2})`;
  ctx.beginPath();
  ctx.ellipse(obj.x, obj.y, 20, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}
