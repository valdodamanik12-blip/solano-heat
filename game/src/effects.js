// Transient visual effects: particles (sparks, dust, splashes, muzzle
// smoke) and floating text popups ("+$250", "BUSTED", damage ticks).
// Effects are purely cosmetic, live in world space, and are drawn by
// render.js between the entity layers.

const MAX_PARTICLES = 420;

export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.shake = 0;      // camera shake magnitude, decays fast
    this.flash = 0;      // red edge flash when the player is hurt
  }

  burst(x, y, opts = {}) {
    const {
      count = 10, color = '#ffd166', speed = 130, life = 0.5,
      size = 3, gravity = 0, spread = Math.PI * 2, baseAngle = 0,
    } = opts;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = baseAngle + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.85);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.7),
        age: 0,
        size: size * (0.6 + Math.random() * 0.8),
        color, gravity,
      });
    }
  }

  sparks(x, y) { this.burst(x, y, { count: 9, color: '#ffb703', speed: 190, life: 0.32, size: 2.4 }); }
  dust(x, y) { this.burst(x, y, { count: 7, color: '#cfc4a5', speed: 60, life: 0.6, size: 4 }); }
  splash(x, y) { this.burst(x, y, { count: 12, color: '#7fd4e6', speed: 120, life: 0.5, size: 3, gravity: 260 }); }
  blood(x, y) { this.burst(x, y, { count: 8, color: '#b23a48', speed: 105, life: 0.4, size: 3 }); }
  smoke(x, y) { this.burst(x, y, { count: 5, color: '#9a9a9a', speed: 34, life: 0.9, size: 5 }); }
  muzzle(x, y, angle) { this.burst(x, y, { count: 4, color: '#ffe66d', speed: 240, life: 0.12, size: 2.6, spread: 0.5, baseAngle: angle }); }
  cashBurst(x, y) { this.burst(x, y, { count: 14, color: '#7bd88a', speed: 110, life: 0.7, size: 3, gravity: 120 }); }

  text(x, y, label, color = '#ffffff', size = 15) {
    this.texts.push({ x, y, label, color, size, age: 0, life: 1.25 });
    if (this.texts.length > 24) this.texts.shift();
  }

  addShake(amount) { this.shake = Math.min(14, this.shake + amount); }
  hurtFlash() { this.flash = Math.min(0.55, this.flash + 0.3); }

  update(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const t of this.texts) {
      t.age += dt;
      t.y -= 26 * dt;
    }
    this.texts = this.texts.filter((t) => t.age < t.life);
    this.shake = Math.max(0, this.shake - 30 * dt);
    this.flash = Math.max(0, this.flash - 1.4 * dt);
  }

  /** Random camera offset for this frame, from the current shake. */
  shakeOffset() {
    if (this.shake <= 0.1) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * 2 * this.shake,
      y: (Math.random() - 0.5) * 2 * this.shake,
    };
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const k = 1 - t.age / t.life;
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 2));
      ctx.font = `bold ${t.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(t.label, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.label, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
