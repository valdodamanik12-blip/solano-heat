// Vehicles: the six stealable types, parked cars, moving traffic, and
// the arcade driving physics shared by the player and the AI drivers.
// A vehicle is a plain object; this module owns spawning and movement,
// render.js owns drawing, and main.js owns who is driving what.

import { VEHICLE_TYPES, ROAD, PITCH, COLS, ROWS } from './config.js';
import { roadCenterX, roadCenterY, collideCircle, inWater } from './city.js';

let nextId = 1;

export function makeVehicle(typeId, x, y, angle, rng, opts = {}) {
  const spec = VEHICLE_TYPES.find((t) => t.id === typeId) ?? VEHICLE_TYPES[0];
  return {
    id: nextId++,
    type: spec.id,
    label: spec.label,
    spec,
    x, y, angle,
    speed: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    color: opts.color ?? rng.pick(spec.colors),
    parked: !!opts.parked,
    traffic: !!opts.traffic,
    mission: !!opts.mission,      // a marked story vehicle
    driverSeat: null,             // 'player' | 'traffic' | 'police' | null
    dead: false,
    honkAt: 0,
  };
}

export function typeById(id) {
  return VEHICLE_TYPES.find((t) => t.id === id) ?? VEHICLE_TYPES[0];
}

/** A random type id, weighted so exotics stay rare in ambient traffic. */
function ambientType(rng) {
  const roll = rng.next();
  if (roll < 0.26) return 'compact';
  if (roll < 0.52) return 'sedan';
  if (roll < 0.66) return 'taxi';
  if (roll < 0.80) return 'van';
  if (roll < 0.92) return 'pickup';
  return 'sports';
}

/** Parked cars: along kerbs, in the docks yard, near the plaza. */
export function spawnParked(world, rng, count = 26) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard++ < 400) {
    const vertical = rng.chance(0.5);
    const i = rng.int(1, COLS - 1);
    const j = rng.int(0, ROWS - 1);
    let x; let y; let angle;
    if (vertical) {
      x = roadCenterX(i) + (rng.chance(0.5) ? ROAD / 2 - 12 : -ROAD / 2 + 12);
      y = j * PITCH + rng.range(100, 260);
      angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = i * PITCH + rng.range(100, 260);
      y = roadCenterY(j) + (rng.chance(0.5) ? ROAD / 2 - 12 : -ROAD / 2 + 12);
      angle = rng.chance(0.5) ? 0 : Math.PI;
    }
    if (cars.some((c) => Math.hypot(c.x - x, c.y - y) < 70)) continue;
    cars.push(makeVehicle(ambientType(rng), x, y, angle, rng, { parked: true }));
  }
  // Always one dependable ride near the briefing plaza and one at the docks.
  const b = world.landmarks.briefing;
  cars.push(makeVehicle('sedan', b.x + 130, b.y + 96, 0, rng, { parked: true }));
  const d = world.landmarks.docksYard;
  cars.push(makeVehicle('pickup', d.x + 40, d.y - 60, Math.PI / 2, rng, { parked: true }));
  return cars;
}

/** Moving traffic on the road grid. */
export function spawnTraffic(world, rng, count = 14) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const horizontal = rng.chance(0.5);
    const line = rng.int(0, horizontal ? ROWS : COLS);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = (ROAD / 4) * dir; // right-hand traffic
    let x; let y; let angle;
    if (horizontal) {
      x = rng.range(120, world.w - 120);
      y = roadCenterY(line) + lane;
      angle = dir > 0 ? 0 : Math.PI;
    } else {
      x = roadCenterX(line) + lane;
      y = rng.range(120, world.h - 120);
      angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    const car = makeVehicle(ambientType(rng), x, y, angle, rng, { traffic: true });
    car.driverSeat = 'traffic';
    car.cruise = rng.range(0.34, 0.5);   // share of top speed
    car.axis = horizontal ? 'x' : 'y';
    car.dir = dir;
    car.line = line;
    cars.push(car);
  }
  return cars;
}

/**
 * Arcade car physics for one step. throttle -1..1, steer -1..1.
 * Returns the impact speed when a wall stopped the car, else 0.
 */
export function driveStep(world, v, throttle, steer, dt) {
  const spec = v.spec;
  const maxF = spec.topSpeed;
  const maxR = spec.topSpeed * 0.36;
  if (throttle > 0) v.speed += spec.accel * throttle * dt;
  else if (throttle < 0) v.speed += spec.accel * 0.7 * throttle * dt;
  // Rolling drag and brakes.
  v.speed -= v.speed * 0.55 * dt;
  if (throttle === 0) v.speed -= v.speed * 0.8 * dt;
  v.speed = Math.max(-maxR, Math.min(maxF, v.speed));
  if (Math.abs(v.speed) < 2 && throttle === 0) v.speed = 0;
  // Steering authority grows with speed, flips in reverse.
  const authority = Math.min(1, Math.abs(v.speed) / 90);
  v.angle += steer * spec.grip * authority * dt * (v.speed < 0 ? -1 : 1);
  const nx = v.x + Math.cos(v.angle) * v.speed * dt;
  const ny = v.y + Math.sin(v.angle) * v.speed * dt;
  const before = Math.abs(v.speed);
  const res = collideCircle(world, nx, ny, spec.wid + 5);
  v.x = res.x;
  v.y = res.y;
  if (res.hit && before > 60) {
    v.speed = -v.speed * 0.22;
    return before;
  }
  if (res.hit) v.speed *= 0.6;
  return 0;
}

/** Traffic update: follow the lane, turn at some junctions, keep spacing. */
export function updateTraffic(world, cars, dt, rng) {
  for (const car of cars) {
    if (!car.traffic || car.dead || car.driverSeat !== 'traffic') continue;
    // Slow down when the car ahead in the same lane is close.
    let target = car.spec.topSpeed * car.cruise;
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 74 && side < 20) target = Math.min(target, Math.abs(other.speed) * 0.9);
    }
    const throttle = car.speed < target ? 0.7 : -0.4;
    // Junction check: near a crossing, sometimes turn onto the cross road.
    const gx = Math.round((car.x - ROAD / 2) / PITCH);
    const gy = Math.round((car.y - ROAD / 2) / PITCH);
    const nearX = Math.abs(car.x - roadCenterX(gx)) < 10;
    const nearY = Math.abs(car.y - roadCenterY(gy)) < 10;
    if (nearX && nearY && rng.chance(0.006)) {
      car.angle += (rng.chance(0.5) ? 1 : -1) * (Math.PI / 2);
      car.angle = Math.round(car.angle / (Math.PI / 2)) * (Math.PI / 2);
    }
    // Keep to the right-hand lane for the current heading.
    const laneX = Math.cos(car.angle) > 0.5 ? 0 : Math.cos(car.angle) < -0.5 ? 0 : (ROAD / 4) * Math.sign(Math.cos(car.angle));
    void laneX;
    const steer = 0;
    driveStep(world, car, throttle, steer, dt);
    // Hard-keep traffic out of the water: if a step pushed the car
    // somewhere impossible, recentre it on the nearest dry avenue.
    if (inWater(world, car.x, car.y)) {
      car.x = roadCenterX(1);
    }
  }
}

/** Damage a vehicle; returns true when this blow wrecked it. */
export function damageVehicle(v, amount) {
  if (v.dead) return false;
  v.hp -= amount;
  if (v.hp <= 0) {
    v.hp = 0;
    v.dead = true;
    v.speed = 0;
    return true;
  }
  return false;
}

/** Circle overlap between two vehicles (loose, arcade-style). */
export function vehiclesOverlap(a, b) {
  const r = (a.spec.len + b.spec.len) * 0.36;
  return Math.hypot(a.x - b.x, a.y - b.y) < r;
}
