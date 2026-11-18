// Heads-up display: DOM panels for money/health/heat/ammo/objective,
// a toast line for fixer chatter, an interact prompt, and the minimap.
// The DOM structure lives in index.html; this class only writes to it.

import { HEAT_PER_STAR } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';

export class Hud {
  constructor(doc) {
    this.money = doc.getElementById('hud-money');
    this.hpFill = doc.getElementById('hud-hp-fill');
    this.hpText = doc.getElementById('hud-hp-text');
    this.heatEl = doc.getElementById('hud-heat');
    this.ammo = doc.getElementById('hud-ammo');
    this.objective = doc.getElementById('hud-objective');
    this.prompt = doc.getElementById('hud-prompt');
    this.toastEl = doc.getElementById('hud-toast');
    this.bustFill = doc.getElementById('hud-bust-fill');
    this.bustWrap = doc.getElementById('hud-bust');
    this.map = doc.getElementById('minimap');
    this.mapCtx = this.map ? this.map.getContext('2d') : null;
    this.toastUntil = 0;
    this.lastObjective = '';
    this.lastPrompt = '';
  }

  toast(text, seconds = 4.2) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastUntil = performance.now() + seconds * 1000;
  }

  update(state) {
    if (this.toastEl && performance.now() > this.toastUntil) {
      this.toastEl.classList.remove('show');
    }
    if (this.money) this.money.textContent = `$${Math.max(0, Math.floor(state.money))}`;
    if (this.hpFill) {
      const pct = Math.max(0, Math.min(100, state.player.hp));
      this.hpFill.style.width = `${pct}%`;
      this.hpFill.style.background = pct > 45 ? '#57cc5e' : pct > 22 ? '#ffb703' : '#e63946';
    }
    if (this.hpText) this.hpText.textContent = `${Math.ceil(Math.max(0, state.player.hp))}`;
    if (this.heatEl) {
      const stars = Math.floor(state.heat / HEAT_PER_STAR + (state.heat % HEAT_PER_STAR > 0 ? 1 : 0));
      const full = Math.min(5, Math.ceil(state.heat / HEAT_PER_STAR));
      let out = '';
      for (let i = 0; i < 5; i++) out += i < full ? '★' : '☆';
      this.heatEl.textContent = out;
      this.heatEl.classList.toggle('hot', state.heat >= HEAT_PER_STAR);
      void stars;
    }
    if (this.ammo) {
      if (state.combat.hasPistol) {
        this.ammo.textContent = state.combat.reloading
          ? 'PISTOL — RELOADING'
          : `PISTOL ${state.combat.mag} / ${state.combat.reserve}`;
        this.ammo.style.display = '';
      } else {
        this.ammo.style.display = 'none';
      }
    }
    if (this.bustWrap) {
      const show = state.police.bust > 0.02;
      this.bustWrap.style.display = show ? '' : 'none';
      if (show && this.bustFill) this.bustFill.style.width = `${Math.min(100, state.police.bust * 100)}%`;
    }
  }

  setObjective(text) {
    if (this.objective && text !== this.lastObjective) {
      this.objective.textContent = text;
      this.lastObjective = text;
    }
  }

  setPrompt(text) {
    if (this.prompt && text !== this.lastPrompt) {
      // Prompts carry a <b> key hint, so this is markup, not plain text.
      this.prompt.innerHTML = text ?? '';
      this.prompt.style.display = text ? '' : 'none';
      this.lastPrompt = text;
    }
  }

  drawMinimap(world, player, cars, policeUnits, marker) {
    const ctx = this.mapCtx;
    if (!ctx || !this.map) return;
    const W = this.map.width;
    const H = this.map.height;
    const sx = W / world.w;
    const sy = H / world.h;
    ctx.fillStyle = '#20262b';
    ctx.fillRect(0, 0, W, H);
    // Water.
    ctx.fillStyle = '#14586e';
    for (const w of world.waters) ctx.fillRect(w.x * sx, w.y * sy, w.w * sx, w.h * sy);
    // Roads.
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 11; i++) {
      ctx.moveTo(roadCenterX(i) * sx, 0);
      ctx.lineTo(roadCenterX(i) * sx, H);
    }
    for (let j = 0; j <= 9; j++) {
      ctx.moveTo(0, roadCenterY(j) * sy);
      ctx.lineTo(W, roadCenterY(j) * sy);
    }
    ctx.stroke();
    // Police blips.
    ctx.fillStyle = '#3a86ff';
    for (const u of policeUnits) {
      if (u.dead) continue;
      ctx.fillRect(u.x * sx - 2, u.y * sy - 2, 4, 4);
    }
    // Mission car.
    ctx.fillStyle = '#ffd60a';
    for (const c of cars) {
      if (c.mission && !c.dead) ctx.fillRect(c.x * sx - 2, c.y * sy - 2, 4, 4);
    }
    // Objective marker.
    if (marker) {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(marker.x * sx, marker.y * sy, 6 + Math.sin(performance.now() / 280) * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Player arrow.
    const px = player.x * sx;
    const py = player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
