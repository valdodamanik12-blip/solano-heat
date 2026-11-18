// Solano Heat — everything that is not the world: the HUD (cash, stars, health,
// weapon, mission panel, minimap), the banners and toasts, the dialogue box, the
// full-city map, and every screen around the game — title, pause, help, WASTED,
// BUSTED. Menus report their buttons through `clickables`; the game routes the
// mouse to them, so drawing and hit-testing can never drift apart.

import { CONTROLS, GAME_SUBTITLE, GAME_TITLE, HEAT_PER_STAR, INTRO_LINES, PALETTE, WORLD_H, WORLD_W } from './config.js';
import { clamp } from './random.js';

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class Hud {
  constructor() {
    this.bannerNow = null;
    this.toasts = [];
    this.clickables = [];
  }

  banner(title, sub = '') {
    this.bannerNow = { title, sub, t: 0, dur: 3.4 };
  }

  toast(text) {
    this.toasts.push({ text, t: 0, dur: 2.8 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  update(dt) {
    if (this.bannerNow) {
      this.bannerNow.t += dt;
      if (this.bannerNow.t > this.bannerNow.dur) this.bannerNow = null;
    }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.dur);
  }

  draw(ctx, game) {
    this.clickables = [];
    if (game.state === 'title') {
      this.drawTitle(ctx, game);
      if (game.showHelp) this.drawHelp(ctx, game);
      return;
    }
    this.drawGameHud(ctx, game);
    if (game.state === 'wasted') this.drawEndScreen(ctx, game, 'WASTED', '#7a1610', game.endInfo);
    if (game.state === 'busted') this.drawEndScreen(ctx, game, 'BUSTED', '#16307a', game.endInfo);
    if (game.showMap && game.state === 'playing') this.drawMap(ctx, game);
    if (game.showHelp) this.drawHelp(ctx, game);
    if (game.state === 'paused') this.drawPause(ctx, game);
  }

  // ---------------------------------------------------------------- the HUD

  drawGameHud(ctx, game) {
    const W = game.viewW;
    const H = game.viewH;
    const p = game.player;

    // Cash and debt, top-left.
    ctx.save();
    ctx.fillStyle = 'rgba(16,19,28,0.66)';
    ctx.fillRect(14, 12, 196, 62);
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(money(game.money), 24, 37);
    if (!game.missions.storyDone) {
      const owed = Math.max(0, 2200 - game.stats.earned);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#ffb59d';
      ctx.fillText(owed > 0 ? `Debt to Dario: ${money(owed)}` : 'Debt cleared', 24, 57);
    } else {
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#9fe8b1';
      ctx.fillText('Debt paid — free agent', 24, 57);
    }

    // Wanted stars, top-right, with the arrest meter under them.
    const stars = game.wanted.stars;
    for (let i = 0; i < 5; i += 1) {
      const x = W - 34 - i * 30;
      const active = i < stars;
      const blink = game.wanted.cooling && Math.floor(game.time * 3) % 2 === 0;
      ctx.fillStyle = active ? (blink ? 'rgba(255,214,10,0.35)' : PALETTE.gold) : 'rgba(253,246,227,0.25)';
      drawStar(ctx, x, 28, 11);
    }
    if (game.police.arrestProgress > 0.02 && !p.inCar) {
      ctx.fillStyle = 'rgba(16,19,28,0.66)';
      ctx.fillRect(W - 164, 46, 150, 13);
      ctx.fillStyle = '#d43a2e';
      ctx.fillRect(W - 161, 49, 144 * clamp(game.police.arrestProgress, 0, 1), 7);
      ctx.fillStyle = PALETTE.hudPaper;
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BUSTED', W - 89, 56);
    }

    // Health and weapon, bottom-left.
    ctx.fillStyle = 'rgba(16,19,28,0.66)';
    ctx.fillRect(14, H - 58, 196, 44);
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(24, H - 48, 176, 9);
    const hpFrac = clamp(p.health / p.maxHealth, 0, 1);
    ctx.fillStyle = hpFrac > 0.35 ? '#67c24a' : '#d43a2e';
    ctx.fillRect(24, H - 48, 176 * hpFrac, 9);
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    if (p.weapon === 'pistol') {
      const label = p.reloadTimer > 0 ? 'PISTOL — RELOADING' : `PISTOL  ${p.mag} / ${p.magSize}`;
      ctx.fillText(label, 24, H - 24);
    } else {
      ctx.fillText('FISTS', 24, H - 24);
    }

    // Low-health pulse at the edges.
    if (hpFrac < 0.3 && game.state === 'playing') {
      ctx.strokeStyle = `rgba(196,30,20,${0.35 + Math.sin(game.time * 6) * 0.15})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, W, H);
    }

    this.drawMissionPanel(ctx, game);
    this.drawMinimap(ctx, game);
    if (game.interactLabel && game.state === 'playing') {
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = `[E] ${game.interactLabel}`;
      const w = ctx.measureText(label).width + 22;
      ctx.fillStyle = 'rgba(16,19,28,0.72)';
      ctx.fillRect(W / 2 - w / 2, H - 108, w, 26);
      ctx.fillStyle = PALETTE.hudPaper;
      ctx.fillText(label, W / 2, H - 90);
    }
    if (game.missions.state === 'briefing') this.drawDialogue(ctx, game);
    this.drawBanner(ctx, game);
    this.drawToasts(ctx, game);
    ctx.restore();
  }

  drawMissionPanel(ctx, game) {
    const m = game.missions;
    if (game.state !== 'playing' && game.state !== 'shot') return;
    let title = null;
    let line = null;
    if (m.state === 'briefing' && m.current) {
      title = m.current.title;
      line = 'Talking to Dario…';
    } else if (m.state === 'active' && m.current) {
      const obj = m.objective(game);
      title = m.current.title;
      if (obj) {
        const pp = game.player.pos();
        const d = Math.round(Math.hypot(obj.x - pp.x, obj.y - pp.y));
        line = `${obj.label} — ${d} m`;
      }
      if (m.current.timer !== null && m.current.timer !== undefined) {
        const s = Math.max(0, Math.ceil(m.current.timer));
        const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        line += `   ⏱ ${clock}`;
      }
    } else if (m.state === 'idle' && game.state === 'playing') {
      title = 'Free roam';
      line = `See Dario at Klem Auto Works — ${m.offerTitle()}`;
    }
    if (!title) return;
    const W = game.viewW;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(16,19,28,0.6)';
    const w = Math.max(ctx.measureText(line ?? '').width, ctx.measureText(title).width) + 30;
    ctx.fillRect(W / 2 - w / 2, 12, w, 44);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(title.toUpperCase(), W / 2, 30);
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = '12.5px system-ui, sans-serif';
    ctx.fillText(line ?? '', W / 2, 48);
    ctx.restore();
  }

  drawMinimap(ctx, game) {
    const size = 172;
    const h = Math.round(size * (WORLD_H / WORLD_W));
    const x = game.viewW - size - 14;
    const y = game.viewH - h - 14;
    const sx = size / WORLD_W;
    const sy = h / WORLD_H;
    ctx.save();
    ctx.fillStyle = 'rgba(16,19,28,0.78)';
    ctx.fillRect(x - 3, y - 3, size + 6, h + 6);
    ctx.beginPath();
    ctx.rect(x, y, size, h);
    ctx.clip();
    ctx.fillStyle = '#6f7d5a';
    ctx.fillRect(x, y, size, h);
    ctx.fillStyle = PALETTE.asphalt;
    for (let i = 0; i <= 11; i += 1) ctx.fillRect(x + i * (size / 11) - 3, y, 6, h);
    for (let j = 0; j <= 9; j += 1) ctx.fillRect(x, y + j * (h / 9) - 3, size, 6);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x, y + h - 4, size, 4);
    const dot = (wx, wy, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const reel of game.city.reels) {
      if (!game.reelsFound.has(reel.id)) dot(reel.x, reel.y, 'rgba(255,214,10,0.75)', 1.8);
    }
    dot(game.city.pois.garage.x, game.city.pois.garage.y, '#fdf6e3', 3);
    dot(game.city.pois.hospital.x, game.city.pois.hospital.y, '#ff6b5e', 3);
    dot(game.city.pois.respray.x, game.city.pois.respray.y, '#e88ca0', 3);
    for (const car of game.cars) {
      if (car.driver === 'police') dot(car.x, car.y, '#5b8cff', 2.6);
    }
    const obj = game.missions.objective(game);
    if (obj && game.state === 'playing') {
      const ox = x + clamp(obj.x * sx, 4, size - 4);
      const oy = y + clamp(obj.y * sy, 4, h - 4);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(ox, oy, 4 + Math.sin(game.time * 5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player arrow.
    const pp = game.player.pos();
    ctx.translate(x + pp.x * sx, y + pp.y * sy);
    ctx.rotate(game.player.inCar ? game.player.inCar.angle : game.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4.4, -3.8);
    ctx.lineTo(-4.4, 3.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawDialogue(ctx, game) {
    const m = game.missions;
    const [speaker, line] = m.dialogue[Math.min(m.lineIndex, m.dialogue.length - 1)] ?? ['', ''];
    const W = game.viewW;
    const H = game.viewH;
    const boxH = 96;
    ctx.save();
    ctx.fillStyle = 'rgba(13,15,24,0.88)';
    ctx.fillRect(W / 2 - 330, H - boxH - 16, 660, boxH);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(W / 2 - 330, H - boxH - 16, 660, boxH);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(speaker, W / 2 - 312, H - boxH + 12);
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = '15px system-ui, sans-serif';
    const lines = wrapText(ctx, line, 624);
    lines.forEach((l, i) => ctx.fillText(l, W / 2 - 312, H - boxH + 36 + i * 20));
    ctx.fillStyle = 'rgba(253,246,227,0.6)';
    ctx.font = '11.5px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('E ▸', W / 2 + 312, H - 28);
    ctx.restore();
  }

  drawBanner(ctx, game) {
    const b = this.bannerNow;
    if (!b) return;
    const fade = b.t < 0.3 ? b.t / 0.3 : b.t > b.dur - 0.5 ? Math.max(0, (b.dur - b.t) / 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10,10,16,0.6)';
    const y = 108;
    ctx.strokeText(b.title, game.viewW / 2, y);
    ctx.fillText(b.title, game.viewW / 2, y);
    if (b.sub) {
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudPaper;
      ctx.strokeText(b.sub, game.viewW / 2, y + 26);
      ctx.fillText(b.sub, game.viewW / 2, y + 26);
    }
    ctx.restore();
  }

  drawToasts(ctx, game) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '13.5px system-ui, sans-serif';
    this.toasts.forEach((t, i) => {
      const y = game.viewH - 148 - i * 22;
      ctx.globalAlpha = Math.min(1, (t.dur - t.t) / 0.6, t.t / 0.2);
      ctx.fillStyle = 'rgba(16,19,28,0.62)';
      const w = ctx.measureText(t.text).width + 18;
      ctx.fillRect(game.viewW / 2 - w / 2, y - 14, w, 19);
      ctx.fillStyle = PALETTE.hudPaper;
      ctx.fillText(t.text, game.viewW / 2, y);
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- screens

  drawTitle(ctx, game) {
    const W = game.viewW;
    const H = game.viewH;
    // Sunset sky.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2b1a4d');
    sky.addColorStop(0.45, '#8a2f5c');
    sky.addColorStop(0.72, '#e2725b');
    sky.addColorStop(0.88, '#f2a65a');
    sky.addColorStop(1, '#146074');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // The sun, low over the bay.
    ctx.fillStyle = '#ffd97a';
    ctx.beginPath();
    ctx.arc(W * 0.68, H * 0.66, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,217,122,0.25)';
    ctx.beginPath();
    ctx.arc(W * 0.68, H * 0.66, 84, 0, Math.PI * 2);
    ctx.fill();
    // Skyline silhouette.
    ctx.fillStyle = '#1d1430';
    const base = H * 0.78;
    const towers = [0.02, 0.09, 0.16, 0.24, 0.33, 0.41, 0.5, 0.58, 0.66, 0.75, 0.83, 0.91];
    const heights = [0.2, 0.32, 0.24, 0.4, 0.28, 0.46, 0.3, 0.38, 0.22, 0.42, 0.27, 0.34];
    towers.forEach((tx, i) => {
      const tw = W * 0.055;
      const th = H * heights[i];
      ctx.fillRect(W * tx, base - th, tw, th);
    });
    ctx.fillRect(0, base, W, H - base);
    // Lit windows in the silhouette.
    ctx.fillStyle = 'rgba(255,217,122,0.8)';
    for (let i = 0; i < 70; i += 1) {
      const wx = ((i * 137.5) % 97) / 97 * W;
      const wy = base - ((i * 89.3) % 41) / 41 * H * 0.42;
      ctx.fillRect(wx, wy, 3, 4);
    }
    // The bay strip.
    ctx.fillStyle = '#146074';
    ctx.fillRect(0, H * 0.9, W, H * 0.1);
    ctx.fillStyle = 'rgba(255,217,122,0.35)';
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(W * 0.6 + ((i * 53) % 130), H * 0.915 + (i % 4) * 9, 30, 2);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fdf6e3';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(20,10,30,0.55)';
    ctx.strokeText(GAME_TITLE, W / 2, H * 0.3);
    ctx.fillText(GAME_TITLE, W / 2, H * 0.3);
    ctx.font = 'italic 17px system-ui, sans-serif';
    ctx.fillStyle = '#ffe3b3';
    ctx.fillText(GAME_SUBTITLE, W / 2, H * 0.3 + 30);

    const items = [{ label: 'New Game', action: 'new' }];
    if (game.saveExists) items.push({ label: 'Continue', action: 'continue' });
    items.push({ label: 'How to Play', action: 'help' });
    items.push({ label: `Sound: ${game.sound.enabled ? 'On' : 'Off'}`, action: 'sound' });
    ctx.font = 'bold 21px system-ui, sans-serif';
    items.forEach((item, i) => {
      const y = H * 0.47 + i * 42;
      const w = ctx.measureText(item.label).width + 44;
      const x = W / 2 - w / 2;
      const hover = game.input.mouseX >= x && game.input.mouseX <= x + w
        && game.input.mouseY >= y - 27 && game.input.mouseY <= y + 8;
      ctx.fillStyle = hover ? 'rgba(255,214,10,0.85)' : 'rgba(16,19,28,0.55)';
      ctx.fillRect(x, y - 27, w, 35);
      ctx.fillStyle = hover ? '#10131c' : '#fdf6e3';
      ctx.fillText(item.label, W / 2, y);
      this.clickables.push({ x, y: y - 27, w, h: 35, action: item.action });
    });

    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(253,246,227,0.85)';
    INTRO_LINES.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.47 + items.length * 42 + 22 + i * 18));
  }

  drawPause(ctx, game) {
    const W = game.viewW;
    const H = game.viewH;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,20,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H * 0.3);
    ctx.font = '15px system-ui, sans-serif';
    const s = game.stats;
    const lines = [
      `Cash ${money(game.money)}   ·   Earned ${money(s.earned)}   ·   Missions ${s.missionsDone}`,
      `Reels found ${game.reelsFound.size} / 20   ·   Cars stolen ${s.carsStolen}   ·   Busts ${s.busts}   ·   Wastings ${s.wastings}`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.3 + 34 + i * 22));
    const items = [
      { label: 'Resume', action: 'resume' },
      { label: 'How to Play', action: 'help' },
      { label: 'Quit to Title', action: 'title' },
    ];
    ctx.font = 'bold 19px system-ui, sans-serif';
    items.forEach((item, i) => {
      const y = H * 0.52 + i * 38;
      const w = ctx.measureText(item.label).width + 40;
      const x = W / 2 - w / 2;
      const hover = game.input.mouseX >= x && game.input.mouseX <= x + w
        && game.input.mouseY >= y - 25 && game.input.mouseY <= y + 7;
      ctx.fillStyle = hover ? 'rgba(255,214,10,0.85)' : 'rgba(16,19,28,0.6)';
      ctx.fillRect(x, y - 25, w, 32);
      ctx.fillStyle = hover ? '#10131c' : '#fdf6e3';
      ctx.fillText(item.label, W / 2, y);
      this.clickables.push({ x, y: y - 25, w, h: 32, action: item.action });
    });
    ctx.restore();
  }

  drawHelp(ctx, game) {
    const W = game.viewW;
    const H = game.viewH;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,20,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('HOW TO PLAY', W / 2, H * 0.2);
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = '14.5px system-ui, sans-serif';
    const intro = [
      'Work Dario Klem’s jobs out of Klem Auto Works to pay off the debt.',
      'Crimes raise your stars — worse with witnesses. Lose the police, or pay Manny for a respray.',
      'Find the 20 lost film reels. WASTED wakes you at the hospital; BUSTED, at the police HQ.',
    ];
    intro.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.2 + 30 + i * 20));
    ctx.font = '15px system-ui, sans-serif';
    CONTROLS.forEach(([keys, what], i) => {
      const y = H * 0.2 + 108 + i * 24;
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(keys, W / 2 - 14, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.hudPaper;
      ctx.fillText(what, W / 2 + 14, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(253,246,227,0.65)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('H or click — back', W / 2, H * 0.2 + 108 + CONTROLS.length * 24 + 22);
    ctx.restore();
    this.clickables.push({ x: 0, y: 0, w: W, h: H, action: 'close-help' });
  }

  drawMap(ctx, game) {
    const W = game.viewW;
    const H = game.viewH;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,20,0.8)';
    ctx.fillRect(0, 0, W, H);
    const mw = Math.min(W - 120, (H - 130) * (WORLD_W / WORLD_H));
    const mh = mw * (WORLD_H / WORLD_W);
    const x = (W - mw) / 2;
    const y = (H - mh) / 2 + 16;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    ctx.fillStyle = '#77875f';
    ctx.fillRect(x, y, mw, mh);
    for (const block of game.city.blocks) {
      ctx.fillStyle = block.kind === 'park' ? PALETTE.grass
        : block.kind === 'beach' ? PALETTE.sand
          : block.kind === 'docks' ? PALETTE.dockFloor : '#a89f8a';
      ctx.fillRect(x + block.x * sx, y + block.y * sy, block.w * sx, block.h * sy);
    }
    ctx.fillStyle = PALETTE.asphalt;
    for (let i = 0; i <= 11; i += 1) ctx.fillRect(x + i * (mw / 11) - 3, y, 6, mh);
    for (let j = 0; j <= 9; j += 1) ctx.fillRect(x, y + j * (mh / 9) - 3, mw, 6);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x, y + mh, mw, 8);
    // District names.
    ctx.fillStyle = 'rgba(16,19,28,0.66)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const labels = [
      ['Palm Heights', 1, 1], ['Northgate', 5, 0], ['The Flats', 9, 1],
      ['Downtown', 5, 3], ['Midtown', 1, 5], ['Old Port', 9, 5],
      ['Marina Mile', 5, 6], ['Solano Beach', 5, 8],
    ];
    for (const [name, col, row] of labels) {
      ctx.fillText(name, x + (col * 330 + 205) * sx, y + (row * 330 + 205) * sy);
    }
    const mark = (wx, wy, color, label) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + wx * sx, y + wy * sy, 5, 0, Math.PI * 2);
      ctx.fill();
      if (label) {
        ctx.fillStyle = '#fdf6e3';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(label, x + wx * sx, y + wy * sy - 9);
      }
    };
    mark(game.city.pois.garage.x, game.city.pois.garage.y, '#fdf6e3', 'Garage');
    mark(game.city.pois.police.x, game.city.pois.police.y, '#5b8cff', 'Police');
    mark(game.city.pois.hospital.x, game.city.pois.hospital.y, '#ff6b5e', 'Hospital');
    mark(game.city.pois.respray.x, game.city.pois.respray.y, '#e88ca0', 'Respray');
    mark(game.city.pois.pier.x, game.city.pois.pier.y, '#ffd60a', 'Pier');
    const obj = game.missions.objective(game);
    if (obj) mark(obj.x, obj.y, '#ffd60a', '');
    const pp = game.player.pos();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + pp.x * sx, y + pp.y * sy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#10131c';
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('SOLANO BAY', W / 2, y - 14);
    ctx.font = '12.5px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(253,246,227,0.7)';
    ctx.fillText('M or Esc — close', W / 2, y + mh + 24);
    ctx.restore();
  }

  drawEndScreen(ctx, game, word, tint, info) {
    const W = game.viewW;
    const H = game.viewH;
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,14,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = tint === '#7a1610' ? '#e0483a' : '#5b8cff';
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(8,6,12,0.7)';
    ctx.strokeText(word, W / 2, H * 0.44);
    ctx.fillText(word, W / 2, H * 0.44);
    ctx.fillStyle = PALETTE.hudPaper;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(info ?? '', W / 2, H * 0.44 + 38);
    ctx.font = '13.5px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(253,246,227,0.75)';
    ctx.fillText('Click to continue', W / 2, H * 0.44 + 66);
    ctx.restore();
    this.clickables.push({ x: 0, y: 0, w: W, h: H, action: 'respawn' });
  }
}

function drawStar(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
