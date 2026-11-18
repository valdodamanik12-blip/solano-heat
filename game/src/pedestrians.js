// Pedestrians: ambient crowds that wander the pavements, dock workers,
// fleeing witnesses, angry guards, and one very unlucky debt target.
// A ped is a plain object with a small state machine; main.js feeds it
// threats (gunfire, violence, a speeding car) and reads back events
// (a guard landed a punch, a witness saw a crime).

import { PLAYER_R } from './config.js';
import { blockRect, collideCircle } from './city.js';

const SHIRTS = ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#bc4749', '#6d597a', '#2a9d8f', '#e9c46a', '#457b9d', '#bc6c25'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

let nextId = 1;

export function makePed(x, y, rng, opts = {}) {
  return {
    id: nextId++,
    x, y,
    angle: rng.angle(),
    speed: 0,
    hp: opts.hp ?? 60,
    maxHp: opts.hp ?? 60,
    shirt: opts.shirt ?? rng.pick(SHIRTS),
    skin: rng.pick(SKIN),
    role: opts.role ?? 'ambient',   // ambient | guard | target | fixer
    state: 'wander',                // wander | flee | fight | down | confront
    waypoint: null,
    waitFor: rng.range(0, 2),
    panicFor: 0,
    threatX: 0,
    threatY: 0,
    attackGap: 0,
    downFor: 0,
    seenCrime: false,               // set when a crime happens in view
    name: opts.name ?? null,
  };
}

/** Ambient crowd scattered over block pavements and open spaces. */
export function spawnCrowd(world, rng, count = 34) {
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard++ < 600) {
    const bx = rng.int(0, 10);
    const by = rng.int(0, 8);
    const r = blockRect(bx, by);
    const x = r.x + rng.range(6, r.w - 6);
    const y = r.y + rng.range(6, r.h - 6);
    // Keep them out of the bay itself (the dockyards south of it are dry).
    if (x < 248 && y > 584 && y < 1400) continue;
    peds.push(makePed(x, y, rng));
  }
  // The fixer holds court on the plaza day and night.
  const b = world.landmarks.briefing;
  const fixer = makePed(b.x - 26, b.y - 10, rng, { role: 'fixer', name: 'Dario Klem', shirt: '#22223b' });
  fixer.state = 'stand';
  peds.push(fixer);
  return peds;
}

function movePed(world, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return true;
  ped.angle = Math.atan2(dy, dx);
  const step = Math.min(d, speed * dt);
  const res = collideCircle(world, ped.x + Math.cos(ped.angle) * step, ped.y + Math.sin(ped.angle) * step, PLAYER_R - 3);
  ped.x = res.x;
  ped.y = res.y;
  ped.speed = speed;
  return d - step < 6;
}

/**
 * Update every ped. `scene` carries what they react to:
 * { playerX, playerY, playerArmed, threat: {x,y,for} | null, rng,
 *   onGuardHit: (dmg) => void }
 */
export function updatePeds(world, peds, dt, scene) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downFor -= dt;
      ped.speed = 0;
      if (ped.downFor <= 0 && ped.hp > 0) ped.state = 'flee';
      continue;
    }
    if (ped.role === 'fixer') { ped.speed = 0; continue; }

    // Panic: a fresh threat overrides everything but a guard's orders.
    if (scene.threat && ped.role !== 'guard') {
      const d = Math.hypot(ped.x - scene.threat.x, ped.y - scene.threat.y);
      if (d < scene.threat.radius) {
        ped.state = 'flee';
        ped.panicFor = 1.6;
        ped.threatX = scene.threat.x;
        ped.threatY = scene.threat.y;
        if (scene.threat.crime && d < 300) ped.seenCrime = true;
      }
    }

    if (ped.state === 'flee') {
      ped.panicFor -= dt;
      const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
      movePed(world, ped, ped.x + Math.cos(away) * 120, ped.y + Math.sin(away) * 120, 196, dt);
      if (ped.panicFor <= 0) ped.state = 'wander';
      continue;
    }

    if (ped.state === 'fight') {
      const d = Math.hypot(scene.playerX - ped.x, scene.playerY - ped.y);
      ped.attackGap -= dt;
      if (d > 30) {
        movePed(world, ped, scene.playerX, scene.playerY, 168, dt);
      } else {
        ped.speed = 0;
        ped.angle = Math.atan2(scene.playerY - ped.y, scene.playerX - ped.x);
        if (ped.attackGap <= 0) {
          ped.attackGap = 0.85;
          scene.onGuardHit?.(7);
        }
      }
      continue;
    }

    if (ped.state === 'chase') {
      // The debt target runs from the player but tires quickly.
      const d = Math.hypot(scene.playerX - ped.x, scene.playerY - ped.y);
      const away = Math.atan2(ped.y - scene.playerY, ped.x - scene.playerX);
      const tired = ped.hp < 30 ? 120 : 178;
      movePed(world, ped, ped.x + Math.cos(away) * 160, ped.y + Math.sin(away) * 160, tired, dt);
      if (d < 30) ped.state = 'confront';
      continue;
    }
    if (ped.state === 'confront') {
      ped.speed = 0;
      ped.angle = Math.atan2(scene.playerY - ped.y, scene.playerX - ped.x);
      continue;
    }

    // Wander: stroll to a nearby point, pause, stroll on.
    ped.waitFor -= dt;
    if (!ped.waypoint || ped.waitFor <= -6) {
      if (ped.waitFor <= 0 && scene.rng.chance(0.5)) {
        ped.waypoint = {
          x: ped.x + scene.rng.range(-170, 170),
          y: ped.y + scene.rng.range(-170, 170),
        };
        ped.waitFor = scene.rng.range(2, 6);
      }
    }
    if (ped.waypoint) {
      const arrived = movePed(world, ped, ped.waypoint.x, ped.waypoint.y, 62, dt);
      if (arrived) ped.waypoint = null;
    } else {
      ped.speed = 0;
    }
  }
}

/** Knock a ped down (or out). Returns true when they stay down. */
export function knockDown(ped, rng, fatal = false) {
  ped.state = 'down';
  ped.downFor = fatal ? 9999 : rng.range(2.5, 5);
  ped.speed = 0;
  return true;
}

/** Damage a ped; guards turn and fight, everyone else panics. */
export function hurtPed(ped, amount, fromX, fromY, rng) {
  ped.hp -= amount;
  if (ped.hp <= 0) {
    knockDown(ped, rng, true);
    return 'down';
  }
  if (ped.role === 'guard') {
    ped.state = 'fight';
  } else {
    ped.state = 'flee';
    ped.panicFor = 2;
    ped.threatX = fromX;
    ped.threatY = fromY;
  }
  return ped.state;
}
