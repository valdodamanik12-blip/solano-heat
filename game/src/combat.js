// Combat: fists and the pistol. Bullets are fast points with a tracer
// drawn by render.js; a shot reports back what it hit through hooks so
// main.js can apply heat, money and mission consequences in one place.

import { PISTOL } from './config.js';
import { hurtPed } from './pedestrians.js';
import { damageVehicle } from './vehicles.js';

export class Combat {
  constructor(sound, effects) {
    this.sound = sound;
    this.effects = effects;
    this.hasPistol = false;
    this.mag = PISTOL.mag;
    this.reserve = 0;
    this.bullets = [];       // {x,y,vx,vy,left}
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.muzzle = null;      // {x,y,angle,age} for the render flash
  }

  givePistol() {
    if (!this.hasPistol) {
      this.hasPistol = true;
      this.mag = PISTOL.mag;
      this.reserve = PISTOL.startReserve;
    } else {
      this.reserve += PISTOL.startReserve;
    }
  }

  get reloading() { return this.reloadTimer > 0; }

  startReload() {
    if (!this.hasPistol || this.reloading) return false;
    if (this.mag >= PISTOL.mag || this.reserve <= 0) return false;
    this.reloadTimer = PISTOL.reloadTime;
    this.sound.reload();
    return true;
  }

  finishReload() {
    const take = Math.min(PISTOL.mag - this.mag, this.reserve);
    this.mag += take;
    this.reserve -= take;
  }

  /**
   * Fire one round from (x, y) toward angle. Spacing and dry clicks are
   * handled here. Returns 'fired' | 'dry' | 'wait' | 'nopistol'.
   */
  tryFire(x, y, angle) {
    if (!this.hasPistol) return 'nopistol';
    if (this.reloading) return 'wait';
    if (this.fireTimer > 0) return 'wait';
    if (this.mag <= 0) {
      this.sound.dryFire();
      this.fireTimer = 0.25;
      this.startReload();
      return 'dry';
    }
    this.mag -= 1;
    this.fireTimer = PISTOL.fireGap;
    const bx = x + Math.cos(angle) * 16;
    const by = y + Math.sin(angle) * 16;
    this.bullets.push({
      x: bx, y: by,
      vx: Math.cos(angle) * PISTOL.bulletSpeed,
      vy: Math.sin(angle) * PISTOL.bulletSpeed,
      left: PISTOL.range,
    });
    this.muzzle = { x: bx, y: by, angle, age: 0 };
    this.effects.muzzle(bx, by, angle);
    this.sound.shot();
    if (this.mag === 0) this.startReload();
    return 'fired';
  }

  /**
   * A swing of the fists. Hits the closest ped or car within reach in
   * front of the player. hooks: { onPedHit(ped, result), onCarHit(car) }.
   */
  punch(world, player, peds, cars, hooks, rng) {
    this.sound.punch();
    const reach = 30;
    const tx = player.x + Math.cos(player.angle) * reach;
    const ty = player.y + Math.sin(player.angle) * reach;
    let bestPed = null;
    let bestD = 26;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - tx, ped.y - ty);
      if (d < bestD) { bestD = d; bestPed = ped; }
    }
    if (bestPed) {
      const result = hurtPed(bestPed, 22, player.x, player.y, rng);
      this.effects.blood(bestPed.x, bestPed.y);
      this.sound.hit();
      hooks.onPedHit?.(bestPed, result);
      return 'ped';
    }
    for ( const car of cars ) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - tx, car.y - ty);
      if (d < car.spec.len * 0.7 + 12) {
        damageVehicle(car, 4);
        this.effects.sparks(tx, ty);
        this.sound.hit();
        hooks.onCarHit?.(car);
        return 'car';
      }
    }
    return 'air';
  }

  /**
   * Step bullets. hooks: { onPedHit, onCarHit, onWallHit(x, y) }.
   * Buildings stop rounds: a point-in-building test per step is plenty
   * at 780 px/s with small steps.
   */
  update(world, dt, peds, cars, hooks, rng) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (this.muzzle) {
      this.muzzle.age += dt;
      if (this.muzzle.age > 0.05) this.muzzle = null;
    }
    const steps = 3;
    for (const b of this.bullets) {
      let alive = true;
      for (let s = 0; s < steps && alive; s++) {
        const stepDt = dt / steps;
        b.x += b.vx * stepDt;
        b.y += b.vy * stepDt;
        b.left -= PISTOL.bulletSpeed * stepDt;
        if (b.left <= 0 || b.x < 0 || b.y < 0 || b.x > world.w || b.y > world.h) {
          alive = false;
          break;
        }
        for (const bd of world.buildings) {
          if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) {
            this.effects.sparks(b.x, b.y);
            hooks.onWallHit?.(b.x, b.y);
            alive = false;
            break;
          }
        }
        if (!alive) break;
        for (const ped of peds) {
          if (ped.state === 'down' || ped.role === 'fixer') continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
            const result = hurtPed(ped, PISTOL.damage, b.x - b.vx * 0.01, b.y - b.vy * 0.01, rng);
            this.effects.blood(ped.x, ped.y);
            hooks.onPedHit?.(ped, result);
            alive = false;
            break;
          }
        }
        if (!alive) break;
        for (const car of cars) {
          if (car.dead) continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < car.spec.len * 0.55) {
            damageVehicle(car, PISTOL.damage * 0.6);
            this.effects.sparks(b.x, b.y);
            hooks.onCarHit?.(car);
            alive = false;
            break;
          }
        }
      }
      b.dead = !alive;
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }
}
