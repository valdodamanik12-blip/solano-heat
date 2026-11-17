// Solano Heat — the people of Solano Bay: ambient civilians who stroll the
// sidewalks, sunbathe near the beach, and run screaming from gunfire and bad
// driving. This module also owns the little top-down person every human in the
// game is drawn with — Mari, the guards and the officers all reuse it.

import { angleDelta, clamp, dist, pick, rand, turnToward } from './random.js';

const SKIN = ['#f2c79b', '#c68863', '#8a5a3b', '#6e4525', '#ffd9b3'];
const SHIRTS = ['#e2725b', '#f2a65a', '#4a7fb5', '#90be6d', '#b565a7', '#fdf6e3', '#2a9d8f', '#e9c46a'];
const PANTS = ['#2e3a4a', '#57493a', '#704214', '#33424f', '#7a4a2b'];

export function randomOutfit(rng) {
  return { skin: pick(rng, SKIN), shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS) };
}

/**
 * Draw a person from above: swinging legs, a torso in their shirt, a head, and —
 * when `aim` is given — arms raised toward the aim angle holding a pistol.
 */
export function drawPerson(ctx, x, y, angle, walkPhase, outfit, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,16,32,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 3.5, 7.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const stride = Math.sin(walkPhase) * 4.2;
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const px = -fy;
  const py = fx;
  // Legs.
  ctx.strokeStyle = outfit.pants;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px * 2.4, py * 2.4);
  ctx.lineTo(px * 2.4 + fx * stride, py * 2.4 + fy * stride);
  ctx.moveTo(-px * 2.4, -py * 2.4);
  ctx.lineTo(-px * 2.4 - fx * stride, -py * 2.4 - fy * stride);
  ctx.stroke();
  // Torso.
  ctx.fillStyle = outfit.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
  ctx.fill();
  if (opts.badge) {
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
  }
  // Head.
  ctx.fillStyle = outfit.skin;
  ctx.beginPath();
  ctx.arc(fx * 1.6, fy * 1.6, 3.6, 0, Math.PI * 2);
  ctx.fill();
  if (opts.cap) {
    ctx.fillStyle = opts.cap;
    ctx.beginPath();
    ctx.arc(fx * 1.8, fy * 1.8, 3.7, Math.atan2(fy, fx) - 1.15, Math.atan2(fy, fx) + 1.15);
    ctx.lineTo(fx * 1.8, fy * 1.8);
    ctx.fill();
  }
  // Arms toward the aim, with a pistol when armed.
  if (opts.aim !== undefined && opts.aim !== null) {
    const ax = Math.cos(opts.aim);
    const ay = Math.sin(opts.aim);
    ctx.strokeStyle = outfit.skin;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ax * 9, ay * 9);
    ctx.stroke();
    if (opts.armed) {
      ctx.strokeStyle = '#14161c';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ax * 8, ay * 8);
      ctx.lineTo(ax * 14, ay * 14);
      ctx.stroke();
    }
  }
  ctx.restore();
}

let nextPedId = 1;

export class Ped {
  constructor(x, y, rng) {
    this.id = nextPedId;
    nextPedId += 1;
    this.x = x;
    this.y = y;
    this.angle = rand(rng, 0, Math.PI * 2);
    this.walkPhase = rand(rng, 0, 6);
    this.speed = rand(rng, 34, 58);
    this.outfit = randomOutfit(rng);
    this.state = 'walk'; // walk | flee | down
    this.target = null;
    this.fleeX = 0;
    this.fleeY = 0;
    this.fleeTimer = 0;
    this.downTimer = 0;
    this.hp = 30;
    this.dead = false;
  }

  /** Something frightening happened at (x, y): run the other way, loudly. */
  scare(game, x, y) {
    if (this.state === 'down') return;
    const d = dist(this.x, this.y, x, y);
    if (d > 190) return;
    if (this.state !== 'flee') {
      game.effects.addText(this.x, this.y - 14, pick(game.rng, ['!', 'Hey!', 'Watch it!', 'Aaaah!']), '#fdf6e3', 12);
      if (d < 120) game.sound.noise(0.1, 1800, 0.05);
    }
    this.state = 'flee';
    this.fleeX = x;
    this.fleeY = y;
    this.fleeTimer = rand(game.rng, 1.4, 2.4);
  }

  knockDown(game, fatal = false) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = fatal ? 9999 : rand(game.rng, 6, 10);
    this.dead = fatal;
    game.effects.burst(this.x, this.y, '#e8e3c8', 5, 70, 0.4, 2);
  }

  update(dt, game) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0 && !this.dead) {
        this.state = 'walk';
        this.hp = 30;
        this.target = null;
      }
      return;
    }
    let speed = this.speed;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      const away = Math.atan2(this.y - this.fleeY, this.x - this.fleeX);
      this.angle = turnToward(this.angle, away, 7 * dt);
      speed = 148;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.target = null;
      }
    } else {
      if (!this.target || dist(this.x, this.y, this.target.x, this.target.y) < 10) {
        this.target = game.city.sidewalkPointNear(game.rng, this.x, this.y);
      }
      const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      this.angle = turnToward(this.angle, want, 5 * dt);
    }
    const nx = this.x + Math.cos(this.angle) * speed * dt;
    const ny = this.y + Math.sin(this.angle) * speed * dt;
    const resolved = game.city.collideCircle(nx, ny, 6);
    this.x = resolved.x;
    this.y = resolved.y;
    this.walkPhase += dt * speed * 0.16;
  }

  draw(ctx) {
    if (this.state === 'down') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = 'rgba(20,16,32,0.25)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.outfit.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9.5, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.outfit.skin;
      ctx.beginPath();
      ctx.arc(9, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    drawPerson(ctx, this.x, this.y, this.angle, this.walkPhase, this.outfit, {});
  }
}

/** Scatter the ambient crowd over the sidewalks, denser near the beach and parks. */
export function spawnPeds(game, count) {
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard < count * 40) {
    guard += 1;
    const block = pick(game.rng, game.city.blocks);
    if (block.kind === 'docks' || block.kind === 'police') continue;
    const spot = game.city.sidewalkPointNear(game.rng, block.x + 125, block.y + 125);
    peds.push(new Ped(spot.x, spot.y, game.rng));
  }
  return peds;
}
