// Canvas renderer: the city from above with a fake-height building
// treatment (offset roofs, long shadows), then vehicles, pedestrians,
// the player, bullets and the mission beacon. Everything is drawn in
// world coordinates inside a camera transform set up by main.js.

import { COLORS, ROAD, PITCH, COLS, ROWS } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';

function visible(rect, view) {
  return rect.x + rect.w >= view.x && rect.x <= view.x + view.w
      && rect.y + rect.h >= view.y && rect.y <= view.y + view.h;
}

export function drawGround(ctx, world, view) {
  // Land base.
  ctx.fillStyle = COLORS.sidewalk;
  ctx.fillRect(view.x, view.y, view.w, view.h);

  // Roads: asphalt strips with dashed centre lines.
  ctx.fillStyle = COLORS.road;
  for (let i = 0; i <= COLS; i++) {
    const x = i * PITCH;
    if (x + ROAD >= view.x && x <= view.x + view.w) ctx.fillRect(x, view.y, ROAD, view.h);
  }
  for (let j = 0; j <= ROWS; j++) {
    const y = j * PITCH;
    if (y + ROAD >= view.y && y <= view.y + view.h) ctx.fillRect(view.x, y, view.w, ROAD);
  }
  ctx.strokeStyle = COLORS.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (let i = 0; i <= COLS; i++) {
    const x = roadCenterX(i);
    if (x >= view.x && x <= view.x + view.w) { ctx.moveTo(x, view.y); ctx.lineTo(x, view.y + view.h); }
  }
  for (let j = 0; j <= ROWS; j++) {
    const y = roadCenterY(j);
    if (y >= view.y && y <= view.y + view.h) { ctx.moveTo(view.x, y); ctx.lineTo(view.x + view.w, y); }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Open ground: parks, plaza paving, sand.
  ctx.fillStyle = COLORS.grass;
  for (const p of world.parks) if (visible(p, view)) ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = COLORS.plaza;
  for (const p of world.plazas) if (visible(p, view)) ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = COLORS.sand;
  for (const s of world.sands) if (visible(s, view)) ctx.fillRect(s.x, s.y, s.w, s.h);

  // Water with a slow two-tone banding (time-free: bands are static so
  // screenshots stay deterministic).
  for (const w of world.waters) {
    if (!visible(w, view)) continue;
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = COLORS.waterDeep;
    for (let y = Math.floor(w.y / 46) * 46; y < w.y + w.h; y += 92) {
      ctx.fillRect(w.x, y, w.w, 20);
    }
  }
  // Piers over the water.
  for (const p of world.piers) {
    if (!visible(p, view)) continue;
    ctx.fillStyle = COLORS.pierEdge;
    ctx.fillRect(p.x, p.y + 5, p.w, p.h);
    ctx.fillStyle = COLORS.pier;
    ctx.fillRect(p.x, p.y, p.w, p.h - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let x = p.x + 22; x < p.x + p.w; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, p.y + 2); ctx.lineTo(x, p.y + p.h - 6); ctx.stroke();
    }
  }
  // Wet sand line where beach meets sea.
  ctx.fillStyle = COLORS.sandWet;
  for (const s of world.sands) {
    if (visible(s, view)) ctx.fillRect(s.x, s.y + s.h - 12, s.w, 12);
  }
}

export function drawProps(ctx, world, view) {
  // Crates at the docks.
  for (const c of world.crates) {
    if (!visible(c, view)) continue;
    ctx.fillStyle = '#a9713f';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = '#7c4f27';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + c.w, c.y + c.h);
    ctx.moveTo(c.x + c.w, c.y); ctx.lineTo(c.x, c.y + c.h);
    ctx.stroke();
  }
  // Trees: palms lean, park trees are round.
  for (const t of world.trees) {
    if (t.x < view.x - 30 || t.x > view.x + view.w + 30 || t.y < view.y - 30 || t.y > view.y + view.h + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(t.x + 4, t.y + 6, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
    if (t.palm) {
      ctx.strokeStyle = '#8a6f4d';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(t.x, t.y + 6); ctx.quadraticCurveTo(t.x + 3, t.y - 4, t.x + 6, t.y - 10); ctx.stroke();
      ctx.strokeStyle = '#3e7d46';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.5;
        ctx.beginPath();
        ctx.moveTo(t.x + 6, t.y - 10);
        ctx.quadraticCurveTo(t.x + 6 + Math.cos(a) * 10, t.y - 14, t.x + 6 + Math.cos(a) * 16, t.y - 8 + Math.abs(Math.sin(a)) * 5);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = COLORS.grassDark;
      ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.grass;
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, 9, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Lamps: small posts with a warm dot.
  ctx.fillStyle = '#3a3f44';
  for (const l of world.lamps) {
    if (l.x < view.x || l.x > view.x + view.w || l.y < view.y || l.y > view.y + view.h) continue;
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath(); ctx.arc(l.x, l.y, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3f44';
  }
}

export function drawBuildings(ctx, world, view) {
  for (const b of world.buildings) {
    const lift = b.floors * 2.1;
    const grow = { x: b.x - lift - 6, y: b.y - lift - 6, w: b.w + 12, h: b.h + 12 };
    if (!visible(grow, view)) continue;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    // Body and lifted roof.
    ctx.fillStyle = b.body;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.trim;
    ctx.fillRect(b.x - lift * 0.4, b.y - lift * 0.4, b.w, b.h);
    ctx.fillStyle = b.body;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(b.x - lift * 0.4 + 4, b.y - lift * 0.4 + 4, b.w - 8, b.h - 8);
    ctx.globalAlpha = 1;
    // Window grid on the roof face reads as floors from above.
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 13 + b.floors) % 3 === 0) continue;
        ctx.fillRect(b.x - lift * 0.4 + 8 + i * 24, b.y - lift * 0.4 + 8 + j * 24, 9, 6);
      }
    }
    if (b.label) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.strokeText(b.label, cx, cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.label, cx, cy);
    }
  }
}

export function drawVehicle(ctx, v) {
  const { len, wid } = v.spec;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
  // Body.
  ctx.fillStyle = v.dead ? '#2b2b2b' : v.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  // Cabin.
  ctx.fillStyle = v.dead ? '#171717' : 'rgba(16,24,32,0.85)';
  roundRect(ctx, -len * 0.16, -wid / 2 + 3, len * 0.36, wid - 6, 4);
  ctx.fill();
  // Windshield stripe.
  ctx.fillStyle = 'rgba(160,210,235,0.75)';
  ctx.fillRect(len * 0.2, -wid / 2 + 3, 3.4, wid - 6);
  if (v.type === 'taxi') {
    ctx.fillStyle = '#111111';
    ctx.fillRect(-6, -5, 12, 10);
    ctx.fillStyle = '#f2b705';
    ctx.font = 'bold 7px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2.5);
  }
  if (v.type === 'van' || v.type === 'pickup') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-len / 2 + 3, -wid / 2 + 2.4, len * 0.34, wid - 4.8);
  }
  if (v.police) {
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(-len * 0.14, -wid / 2, len * 0.3, wid);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(-4, -wid / 2 - 2.4, 8, 4.4);
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(-4, wid / 2 - 2, 8, 4.4);
  }
  if (v.mission) {
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 2.4;
    roundRect(ctx, -len / 2 - 2, -wid / 2 - 2, len + 4, wid + 4, 8);
    ctx.stroke();
  }
  // Damage smoke source point is handled by effects; a dark scorch for wrecks.
  if (v.dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(2, 3, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(-10, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 4, 9, 4.6, 0, 0, Math.PI * 2); ctx.fill();
  const swing = ped.speed > 4 ? Math.sin(performance.now() / 90 + ped.id) * 4 : 0;
  ctx.strokeStyle = '#2f3542';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ped.angle + 2.6) * 7 + swing * 0.4, Math.sin(ped.angle + 2.6) * 7);
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ped.angle - 2.6) * 7 - swing * 0.4, Math.sin(ped.angle - 2.6) * 7);
  ctx.stroke();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 2.4, Math.sin(ped.angle) * 2.4, 4.6, 0, Math.PI * 2); ctx.fill();
  if (ped.role === 'guard') {
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10.6, 0, Math.PI * 2); ctx.stroke();
  }
  if (ped.role === 'target') {
    ctx.fillStyle = '#bc4749';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, -13);
  }
  if (ped.role === 'fixer') {
    ctx.fillStyle = '#ffd60a';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -13);
  }
  ctx.restore();
}

export function drawPlayer(ctx, player, armed) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 4, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  const swing = player.moving ? Math.sin(player.walkCycle) * 5 : 0;
  ctx.strokeStyle = '#1f2a33';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(player.angle + 2.6) * 8 + swing * 0.4, Math.sin(player.angle + 2.6) * 8);
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(player.angle - 2.6) * 8 - swing * 0.4, Math.sin(player.angle - 2.6) * 8);
  ctx.stroke();
  ctx.fillStyle = '#0e7c7b';
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd60a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(Math.cos(player.angle) * 2.6, Math.sin(player.angle) * 2.6, 5, 0, Math.PI * 2); ctx.fill();
  if (armed) {
    ctx.strokeStyle = '#14181d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(player.angle) * 6, Math.sin(player.angle) * 6);
    ctx.lineTo(Math.cos(player.angle) * 17, Math.sin(player.angle) * 17);
    ctx.stroke();
  }
  ctx.restore();
}

/** The mission beacon: a soft pulsing column at the objective point. */
export function drawBeacon(ctx, point, color = '#ffd60a') {
  if (!point) return;
  const pulse = 0.72 + 0.28 * Math.sin(performance.now() / 300);
  ctx.save();
  ctx.globalAlpha = 0.16 * pulse;
  ctx.fillStyle = color;
  ctx.fillRect(point.x - 13, point.y - 190, 26, 190);
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(point.x, point.y, 13 * pulse + 5, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath(); ctx.arc(point.x, point.y, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
