// Solano Heat — gunfire and fists. One bullet list serves the player, the yard
// guards and the police: a bullet is a fast point with an owner, and every hit is
// routed back through the game so crimes, damage and effects stay in one place.
// Buildings stop bullets, which makes the city's corners real cover.

import { dist } from './random.js';

const BULLET_SPEED = 780;
const BULLET_LIFE = 0.55;
const PISTOL_DAMAGE = 34;
export const FIRE_INTERVAL = 0.17;
export const RELOAD_TIME = 0.9;
export const PUNCH_RANGE = 32;

export class Bullets {
  constructor() {
    this.list = [];
  }

  fire(game, x, y, angle, from, spread = 0.03) {
    const a = angle + (Math.random() - 0.5) * 2 * spread;
    this.list.push({
      x, y,
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
      from, t: 0,
    });
    game.effects.muzzle(x, y, a);
  }

  update(dt, game) {
    const kept = [];
    for (const b of this.list) {
      b.t += dt;
      if (b.t > BULLET_LIFE) continue;
      // Two substeps so a fast bullet cannot tunnel through a thin wall.
      let alive = true;
      for (let s = 0; s < 2 && alive; s += 1) {
        b.x += b.vx * dt * 0.5;
        b.y += b.vy * dt * 0.5;
        if (game.city.pointBlocked(b.x, b.y)) {
          game.effects.burst(b.x, b.y, '#e8e3c8', 3, 70, 0.25, 1.6);
          alive = false;
          break;
        }
        alive = !this.hitSomething(game, b);
      }
      if (alive) kept.push(b);
    }
    this.list = kept;
  }

  /** True when the bullet struck a person or a car this substep. */
  hitSomething(game, b) {
    // Cars first: their circles are the biggest targets on the street.
    for (const car of game.cars) {
      for (const c of car.circles()) {
        if (dist(b.x, b.y, c.x, c.y) < c.r) {
          car.damage = Math.min(100, car.damage + 2.5);
          if (car.damage >= 100) car.wrecked = true;
          game.effects.burst(b.x, b.y, '#ffb347', 3, 80, 0.25, 1.6);
          if (b.from === 'enemy' && game.player.inCar === car && Math.random() < 0.4) {
            game.player.hurt(game, 6, Math.atan2(b.vy, b.vx));
          }
          return true;
        }
      }
    }
    if (b.from === 'player') {
      for (const ped of game.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 9) {
          game.onPedShot(ped);
          return true;
        }
      }
      for (const guard of game.missions.guards) {
        if (!guard.dead && dist(b.x, b.y, guard.x, guard.y) < 10) {
          game.onGuardShot(guard, PISTOL_DAMAGE);
          return true;
        }
      }
      for (const officer of game.police.officers) {
        if (!officer.dead && dist(b.x, b.y, officer.x, officer.y) < 10) {
          game.onOfficerShot(officer, PISTOL_DAMAGE);
          return true;
        }
      }
    } else if (!game.player.inCar) {
      const p = game.player;
      if (!p.dead && dist(b.x, b.y, p.x, p.y) < 9) {
        p.hurt(game, 8 + Math.random() * 6, Math.atan2(b.vy, b.vx));
        return true;
      }
    }
    return false;
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = '#ffd97a';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (const b of this.list) {
      ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** An enemy shot at a point, with human inaccuracy. Returns nothing; sound is local. */
export function enemyShoot(game, sx, sy, tx, ty, spread = 0.09) {
  const angle = Math.atan2(ty - sy, tx - sx);
  game.bullets.fire(game, sx, sy, angle, 'enemy', spread);
  if (dist(sx, sy, game.player.x, game.player.y) < 620) game.sound.shot();
}

/** The player's pistol, fired from the main loop when the mouse is held. */
export function playerShoot(game) {
  const p = game.player;
  if (p.weapon !== 'pistol' || p.inCar || p.dead) return;
  if (p.fireTimer > 0 || p.reloadTimer > 0) return;
  if (p.mag <= 0) {
    game.sound.blip(1200, 900, 0.05, 'square', 0.1);
    p.fireTimer = 0.25;
    return;
  }
  p.mag -= 1;
  p.fireTimer = FIRE_INTERVAL;
  game.stats.shotsFired += 1;
  const p0 = p.pos();
  game.bullets.fire(game, p0.x, p0.y, p.aimAngle, 'player', 0.035);
  game.sound.shot();
  game.onGunshot(p0.x, p0.y);
  if (p.mag === 0) startReload(game);
}

export function startReload(game) {
  const p = game.player;
  if (p.weapon !== 'pistol' || p.reloadTimer > 0 || p.mag === p.magSize) return;
  p.reloadTimer = RELOAD_TIME;
  game.sound.blip(500, 300, 0.08, 'square', 0.12);
}

/** A punch: short, arc-less, and very impolite to whoever is standing there. */
export function playerPunch(game) {
  const p = game.player;
  if (p.inCar || p.dead || p.fireTimer > 0) return;
  p.fireTimer = 0.28;
  game.sound.punch();
  const tx = p.x + Math.cos(p.aimAngle) * PUNCH_RANGE;
  const ty = p.y + Math.sin(p.aimAngle) * PUNCH_RANGE;
  for (const ped of game.peds) {
    if (ped.state !== 'down' && dist(tx, ty, ped.x, ped.y) < 16) {
      game.onPedPunched(ped);
      return;
    }
  }
  for (const guard of game.missions.guards) {
    if (!guard.dead && dist(tx, ty, guard.x, guard.y) < 17) {
      game.onGuardShot(guard, 20);
      return;
    }
  }
  for (const officer of game.police.officers) {
    if (!officer.dead && dist(tx, ty, officer.x, officer.y) < 17) {
      game.onOfficerShot(officer, 20);
      return;
    }
  }
  for (const car of game.cars) {
    for (const c of car.circles()) {
      if (dist(tx, ty, c.x, c.y) < c.r + 4) {
        game.effects.burst(tx, ty, '#e8e3c8', 3, 60, 0.2, 1.5);
        return;
      }
    }
  }
}
