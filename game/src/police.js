// The Solano Bay PD: patrol units that spawn off-screen in proportion
// to the player's stars, hunt by road, and try to ram or corner the
// player. The bust rule is positional: a unit close to a slow or
// on-foot player fills the bust meter; distance or speed drains it.

import { HEAT_PER_STAR } from './config.js';
import { makeVehicle, driveStep, damageVehicle } from './vehicles.js';
import { roadCenterX, roadCenterY } from './city.js';

export function starsForHeat(heat) {
  return Math.max(0, Math.min(5, Math.ceil(heat / HEAT_PER_STAR)));
}

function desiredUnits(stars) {
  return [0, 2, 3, 4, 5, 6][stars] ?? 0;
}

export class Police {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    this.units = [];        // police vehicles (driverSeat 'police')
    this.bust = 0;          // 0..1 progress toward BUSTED
    this.spawnGap = 0;
    this.active = false;    // any unit currently close enough to matter
  }

  clear() {
    this.units = [];
    this.bust = 0;
    this.active = false;
  }

  /** Spawn one unit on a road, well away from the player's view. */
  spawnUnit(player) {
    const horizontal = this.rng.chance(0.5);
    const dist = this.rng.range(640, 860);
    const side = this.rng.chance(0.5) ? 1 : -1;
    let x; let y;
    if (horizontal) {
      x = Math.max(60, Math.min(this.world.w - 60, player.x + side * dist));
      const line = Math.max(0, Math.min(9, Math.round((player.y - 42) / 300)));
      y = roadCenterY(line);
    } else {
      y = Math.max(60, Math.min(this.world.h - 60, player.y + side * dist));
      const line = Math.max(0, Math.min(11, Math.round((player.x - 42) / 300)));
      x = roadCenterX(line);
    }
    const unit = makeVehicle('sedan', x, y, Math.atan2(player.y - y, player.x - x), this.rng, { color: '#1d3557' });
    unit.police = true;
    unit.driverSeat = 'police';
    unit.spec = { ...unit.spec, topSpeed: 318, accel: 215, grip: 3.6 };
    this.units.push(unit);
    return unit;
  }

  /**
   * Advance the hunt. scene: { heat, player, playerCar } where playerCar
   * is the vehicle the player drives or null. hooks: { onBusted(),
   * onRam(dmgToPlayerCar, dmgToUnit), onPlayerHurt(dmg) }.
   */
  update(dt, scene, hooks) {
    const stars = starsForHeat(scene.heat);
    const want = desiredUnits(stars);
    this.spawnGap -= dt;
    if (stars > 0 && this.units.length < want && this.spawnGap <= 0) {
      this.spawnUnit(scene.player);
      this.spawnGap = 1.4;
    }
    if (stars === 0 && this.units.length > 0) {
      // Heat is gone: units give up and drive off, then despawn.
      for (const u of this.units) u.givingUp = true;
    }

    const target = scene.playerCar ?? scene.player;
    let nearest = Infinity;
    this.active = false;

    for (const u of this.units) {
      if (u.dead) continue;
      const dx = target.x - u.x;
      const dy = target.y - u.y;
      const dist = Math.hypot(dx, dy);
      nearest = Math.min(nearest, dist);
      if (dist < 420) this.active = true;

      if (u.givingUp) {
        // Peel away from the player and fade out at range.
        const away = Math.atan2(u.y - target.y, u.x - target.x);
        this.steerToward(u, u.x + Math.cos(away) * 200, u.y + Math.sin(away) * 200, dt, 0.5);
        continue;
      }
      // Aim slightly ahead of a moving target to cut it off.
      const lead = scene.playerCar ? Math.min(0.55, dist / 620) : 0;
      const tx = target.x + Math.cos(target.angle ?? 0) * (target.speed ?? 0) * lead;
      const ty = target.y + Math.sin(target.angle ?? 0) * (target.speed ?? 0) * lead;
      this.steerToward(u, tx, ty, dt, 1);
    }
    this.units = this.units.filter((u) => {
      if (u.dead) return false;
      if (u.givingUp && Math.hypot(u.x - target.x, u.y - target.y) > 900) return false;
      return true;
    });

    // Ramming: a unit overlapping the player's car trades damage.
    if (scene.playerCar) {
      for (const u of this.units) {
        if (u.dead) continue;
        const d = Math.hypot(u.x - scene.playerCar.x, u.y - scene.playerCar.y);
        const touch = (u.spec.len + scene.playerCar.spec.len) * 0.38;
        if (d < touch && Math.abs(u.speed) + Math.abs(scene.playerCar.speed) > 90) {
          const wrecked = damageVehicle(scene.playerCar, 7);
          damageVehicle(u, 5);
          u.speed *= -0.3;
          scene.playerCar.speed *= 0.55;
          hooks.onRam?.(wrecked);
        }
      }
    }

    // The bust meter.
    const playerSpeed = scene.playerCar ? Math.abs(scene.playerCar.speed) : (scene.player.speed ?? 0);
    const cornered = nearest < 105 && playerSpeed < 55;
    const caughtOnFoot = !scene.playerCar && nearest < 62;
    if (stars > 0 && (cornered || caughtOnFoot)) {
      this.bust += dt / 2.1;
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.55);
    }
    if (this.bust >= 1) {
      this.bust = 0;
      hooks.onBusted?.();
    }
  }

  /** Simple pursuit steering through the shared arcade physics. */
  steerToward(unit, tx, ty, dt, aggression) {
    const want = Math.atan2(ty - unit.y, tx - unit.x);
    let diff = want - unit.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.4));
    const dist = Math.hypot(tx - unit.x, ty - unit.y);
    const throttle = dist > 46 ? aggression : 0.15;
    driveStep(this.world, unit, throttle, steer, dt);
  }

  /** Is any unit close enough to see the player commit a crime? */
  seesCrime(x, y, radius = 320) {
    return this.units.some((u) => !u.dead && Math.hypot(u.x - x, u.y - y) < radius);
  }
}
