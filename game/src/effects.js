// Solano Heat — the juice: particles, skid marks, floating text and screen shake.
// Effects never touch game state; systems report moments (a crash, a pickup, a shot)
// and this module turns them into things the player can see and feel.

import { clamp } from './random.js';

const MAX_SKIDS = 420;

export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.skids = [];
    this.trauma = 0;
  }

  /** A burst of short-lived sparks or chips in one colour. */
  burst(x, y, color, count = 8, speed = 130, life = 0.45, size = 2.4) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        t: 0, life: life * (0.6 + Math.random() * 0.7),
        color, size: size * (0.6 + Math.random() * 0.8), drag: 3.2, grav: 0,
      });
    }
  }

  /** Slow grey smoke, for damaged engines and wrecks. */
  smoke(x, y, count = 1) {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 16, vy: -22 - Math.random() * 22,
        t: 0, life: 0.9 + Math.random() * 0.6,
        color: 'smoke', size: 5 + Math.random() * 6, drag: 0.4, grav: -30,
      });
    }
  }

  /** A bright two-frame flash at a gun muzzle. */
  muzzle(x, y, angle) {
    this.particles.push({
      x: x + Math.cos(angle) * 14, y: y + Math.sin(angle) * 14,
      vx: Math.cos(angle) * 30, vy: Math.sin(angle) * 30,
      t: 0, life: 0.07, color: '#ffd97a', size: 6, drag: 0, grav: 0,
    });
    this.burst(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, '#ffb347', 3, 90, 0.18, 1.8);
  }

  /** Floating words that rise and fade: cash, warnings, screams. */
  addText(x, y, str, color = '#fdf6e3', size = 13) {
    this.texts.push({ x, y, str, color, size, t: 0, life: 1.5 });
  }

  /** Lay a skid mark segment; called while a driven car slides or brakes hard. */
  addSkid(x, y) {
    this.skids.push({ x, y, t: 0, life: 7 });
    if (this.skids.length > MAX_SKIDS) this.skids.splice(0, this.skids.length - MAX_SKIDS);
  }

  /** Add screen shake; 0.3 is a nudge, 1 is a serious crash. */
  shake(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** The camera offset for this frame, from the current trauma. */
  shakeOffset() {
    const s = this.trauma * this.trauma * 14;
    return { x: (Math.random() * 2 - 1) * s, y: (Math.random() * 2 - 1) * s };
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    for (const p of this.particles) {
      p.t += dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const t of this.texts) {
      t.t += dt;
      t.y -= 26 * dt;
    }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const s of this.skids) s.t += dt;
    this.skids = this.skids.filter((s) => s.t < s.life);
  }

  /** Skids go under the cars; call before entities are drawn. */
  drawUnder(ctx) {
    ctx.save();
    ctx.fillStyle = '#22242a';
    for (const s of this.skids) {
      ctx.globalAlpha = 0.34 * (1 - s.t / s.life);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Particles and floating text go over the world; call after entities. */
  drawOver(ctx) {
    ctx.save();
    for (const p of this.particles) {
      const k = 1 - p.t / p.life;
      if (p.color === 'smoke') {
        ctx.globalAlpha = 0.3 * k;
        ctx.fillStyle = '#555a63';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const k = 1 - t.t / t.life;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `bold ${t.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,10,16,0.75)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}
