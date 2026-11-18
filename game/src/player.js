// The player character on foot: position, facing, health, and the
// walk/sprint movement with building collision. When the player is in a
// car, main.js drives the car instead and the player rides along hidden
// at the car's position.

import { PLAYER_R, WALK_SPEED, SPRINT_SPEED, PLAYER_MAX_HP } from './config.js';
import { collideCircle } from './city.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    speed: 0,          // current speed, for animation and bust rules
    walkCycle: 0,      // leg swing phase
    moving: false,
    regenWait: 0,      // seconds since last damage before regen starts
  };
}

/** Move on foot from the input axes. Returns true when actually moving. */
export function updatePlayerOnFoot(world, player, input, dt) {
  const mx = input.moveX;
  const my = input.moveY;
  player.moving = mx !== 0 || my !== 0;
  if (!player.moving) {
    player.speed = 0;
    return false;
  }
  const len = Math.hypot(mx, my);
  const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  const vx = (mx / len) * speed;
  const vy = (my / len) * speed;
  player.angle = Math.atan2(vy, vx);
  const res = collideCircle(world, player.x + vx * dt, player.y + vy * dt, PLAYER_R);
  player.x = res.x;
  player.y = res.y;
  player.speed = speed;
  player.walkCycle += dt * (input.sprint ? 13 : 9.5);
  return true;
}

/** Hurt the player; returns true when this is the killing blow. */
export function hurtPlayer(player, amount) {
  player.hp -= amount;
  player.regenWait = 0;
  return player.hp <= 0;
}

/** Slow out-of-combat regeneration, up to 60% — full health is earned. */
export function regenPlayer(player, dt) {
  player.regenWait += dt;
  if (player.regenWait > 5 && player.hp > 0 && player.hp < player.maxHp * 0.6) {
    player.hp = Math.min(player.maxHp * 0.6, player.hp + 3.2 * dt);
  }
}

/** Place the player somewhere directly (respawns, debug, scene poses). */
export function placePlayer(player, x, y, angle = null) {
  player.x = x;
  player.y = y;
  if (angle !== null) player.angle = angle;
  player.speed = 0;
}
