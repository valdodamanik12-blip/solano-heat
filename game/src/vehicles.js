// Solano Heat — cars: six body styles with arcade physics, a lane-following traffic
// brain, and the drawing for all of them. Whoever drives a car — the player, the
// traffic brain, the police pursuit — writes the same input record, and one physics
// step moves every car, so a stolen Interceptor handles exactly like a pursuing one.

import { PITCH, ROAD } from './config.js';
import { angleDelta, clamp, dist, pick, turnToward } from './random.js';
import { roadCenterX, roadCenterY } from './city.js';

export const CAR_KINDS = {
  sedan: { len: 44, wid: 21, top: 295, accel: 190, turn: 2.7, label: 'sedan' },
  sport: { len: 46, wid: 21, top: 388, accel: 268, turn: 3.0, label: 'Sunfire GT' },
  cab: { len: 44, wid: 21, top: 290, accel: 185, turn: 2.7, label: 'cab' },
  van: { len: 52, wid: 24, top: 252, accel: 152, turn: 2.3, label: 'van' },
  hauler: { len: 58, wid: 25, top: 224, accel: 132, turn: 2.0, label: 'hauler' },
  police: { len: 46, wid: 22, top: 366, accel: 246, turn: 2.9, label: 'Interceptor' },
};

const TRAFFIC_KINDS = ['sedan', 'sedan', 'sedan', 'sport', 'cab', 'van', 'hauler'];
const CAR_COLORS = ['#c94f42', '#4a7fb5', '#e9c46a', '#90be6d', '#b565a7', '#d9d9d9', '#5a6b7a', '#f2a65a', '#2a9d8f'];

export function randomCarColor(rng) {
  return pick(rng, CAR_COLORS);
}

let nextCarId = 1;

export class Car {
  constructor(x, y, angle, kind = 'sedan', color = '#4a7fb5') {
    this.id = nextCarId;
    nextCarId += 1;
    this.kind = kind;
    this.spec = CAR_KINDS[kind];
    this.color = kind === 'cab' ? '#f7b731' : kind === 'police' ? '#eef1f4' : color;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.input = { throttle: 0, steer: 0, brake: false, hand: false };
    this.driver = null; // null (parked) | 'traffic' | 'police' | 'player'
    this.damage = 0;
    this.wrecked = false;
    this.steerVis = 0;
    this.waypoint = null;
    this.stuckTimer = 0;
    this.honkTimer = 0;
    this.starterCar = false;
    this.missionCar = false;
    this.hot = false; // A car whose taking is itself a reported theft.
  }

  /** Speed along the nose, signed (negative in reverse). */
  forwardSpeed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** The two collision circles, front and rear. */
  circles() {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const off = this.spec.len * 0.27;
    const r = this.spec.wid * 0.56;
    return [
      { x: this.x + c * off, y: this.y + s * off, r },
      { x: this.x - c * off, y: this.y - s * off, r },
    ];
  }

  /**
   * One physics step. Buildings resolve through the city; impacts hard enough to
   * matter are reported through game.onVehicleImpact(car, strength).
   */
  stepPhysics(dt, game) {
    if (this.wrecked) {
      this.vx *= 0.9;
      this.vy *= 0.9;
      return;
    }
    const spec = this.spec;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    let fwd = this.vx * fx + this.vy * fy;
    // Lateral velocity is grip: the tyres kill most of it, less under the handbrake.
    let lx = this.vx - fx * fwd;
    let ly = this.vy - fy * fwd;
    const grip = this.input.hand ? 2.2 : 9.5;
    lx -= lx * Math.min(1, grip * dt);
    ly -= ly * Math.min(1, grip * dt);

    const { throttle, steer, brake } = this.input;
    if (throttle > 0) fwd += spec.accel * throttle * dt * (fwd < 0 ? 1.8 : 1);
    if (throttle < 0) {
      // The same pedal is reverse from rest and the brake at speed.
      if (fwd > 12) fwd -= spec.accel * 1.7 * dt;
      else fwd = Math.max(fwd + spec.accel * 0.55 * throttle * dt, -spec.top * 0.34);
    }
    if (brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), spec.accel * 2.2 * dt);
    // Drag and rolling resistance settle the top speed where the table says.
    fwd -= fwd * 0.32 * dt * (Math.abs(fwd) / spec.top);
    fwd = clamp(fwd, -spec.top * 0.36, spec.top);

    // Steering bites with speed and flips in reverse, like a real wheel.
    const steerAuthority = clamp(Math.abs(fwd) / 60, 0, 1) * (fwd < 0 ? -1 : 1);
    this.angle += steer * spec.turn * steerAuthority * dt * (this.input.hand ? 1.35 : 1);
    this.steerVis = steer;

    const nfx = Math.cos(this.angle);
    const nfy = Math.sin(this.angle);
    this.vx = nfx * fwd + lx;
    this.vy = nfy * fwd + ly;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Buildings: resolve both circles; a big velocity loss is a crash.
    const before = Math.hypot(this.vx, this.vy);
    for (const c of this.circles()) {
      const resolved = game.city.collideCircle(c.x, c.y, c.r);
      const dx = resolved.x - c.x;
      const dy = resolved.y - c.y;
      if (dx !== 0 || dy !== 0) {
        this.x += dx;
        this.y += dy;
        // Kill the velocity that points into the wall.
        const push = this.vx * dx + this.vy * dy;
        if (push < 0) {
          const len = Math.hypot(dx, dy) || 1;
          this.vx -= (dx / len) * (push / len) * 1.4;
          this.vy -= (dy / len) * (push / len) * 1.4;
        }
      }
    }
    const after = Math.hypot(this.vx, this.vy);
    const impact = before - after;
    if (impact > 95) {
      const strength = clamp(impact / 260, 0.2, 1);
      this.damage = Math.min(100, this.damage + impact * 0.055);
      if (this.damage >= 100) this.wrecked = true;
      game.onVehicleImpact(this, strength);
    }
  }

  /** The traffic brain: follow lanes between intersections, brake for trouble. */
  driveTraffic(dt, game) {
    const rng = game.rng;
    if (!this.waypoint) this.waypoint = this.nextWaypoint(rng, true);
    const wp = this.waypoint;
    const toWp = Math.hypot(wp.x - this.x, wp.y - this.y);
    if (toWp < 42) this.waypoint = this.nextWaypoint(rng, false);

    const targetAngle = Math.atan2(wp.y - this.y, wp.x - this.x);
    const delta = angleDelta(this.angle, targetAngle);
    this.input.steer = clamp(delta * 2.4, -1, 1);

    // Trouble ahead: another car, the player, a pedestrian in the road.
    let blocked = false;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const probe = (ox, oy, orad) => {
      const relX = ox - this.x;
      const relY = oy - this.y;
      const ahead = relX * fx + relY * fy;
      const side = Math.abs(relX * -fy + relY * fx);
      return ahead > 6 && ahead < 58 && side < orad + this.spec.wid * 0.6;
    };
    for (const other of game.cars) {
      if (other !== this && probe(other.x, other.y, other.spec.wid * 0.7)) { blocked = true; break; }
    }
    if (!blocked && game.player.inCar && probe(game.player.inCar.x, game.player.inCar.y, 14)) blocked = true;
    if (!blocked && !game.player.inCar && probe(game.player.x, game.player.y, 8)) blocked = true;
    if (!blocked) {
      for (const ped of game.peds) {
        if (!ped.down && game.city.isRoad(ped.x, ped.y) && probe(ped.x, ped.y, 7)) { blocked = true; break; }
      }
    }

    const fwd = this.forwardSpeed();
    if (blocked) {
      this.input.throttle = fwd > 8 ? -1 : 0;
      this.honkTimer -= dt;
      if (this.honkTimer <= 0 && this.driver === 'traffic') {
        this.honkTimer = rand2(rng, 1.2, 2.6);
        if (dist(this.x, this.y, game.player.x, game.player.y) < 300) game.sound.noise(0.08, 1400, 0.05);
      }
    } else {
      // Cruise a touch under the car's best; slow for the turn ahead.
      const cruise = this.spec.top * 0.52;
      this.input.throttle = fwd < cruise ? 0.75 : 0;
      if (Math.abs(delta) > 0.5 && fwd > 130) this.input.throttle = -0.6;
    }
    this.input.hand = false;

    // A car boxed in for a long while quietly recycles somewhere the player is not.
    if (Math.abs(fwd) < 6 && this.driver === 'traffic') {
      this.stuckTimer += dt;
      if (this.stuckTimer > 7 && dist(this.x, this.y, game.player.x, game.player.y) > 620) {
        const spot = game.city.randomRoadPoint(rng);
        this.x = spot.x;
        this.y = spot.y;
        this.angle = spot.angle;
        this.vx = 0;
        this.vy = 0;
        this.waypoint = null;
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
  }

  /** Choose the next intersection to aim for, offset into the right-hand lane. */
  nextWaypoint(rng, first) {
    const col = clamp(Math.round((this.x - ROAD / 2) / PITCH), 0, 11);
    const row = clamp(Math.round((this.y - ROAD / 2) / PITCH), 0, 9);
    let dir;
    if (first || !this.wpDir) {
      dir = pick(rng, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    } else {
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
        ([dx, dy]) => !(dx === -this.wpDir[0] && dy === -this.wpDir[1]),
      );
      dir = pick(rng, options);
    }
    this.wpDir = dir;
    const nc = clamp(col + dir[0], 0, 11);
    const nr = clamp(row + dir[1], 0, 9);
    // Aim past the intersection so the car commits to the turn, in its own lane:
    // the lane sits to the right of the direction of travel.
    const lane = 13;
    const rightX = -dir[1];
    const rightY = dir[0];
    return {
      x: roadCenterX(nc) + dir[0] * 46 + rightX * lane,
      y: roadCenterY(nr) + dir[1] * 46 + rightY * lane,
    };
  }
}

function rand2(rng, a, b) {
  return a + rng() * (b - a);
}

/** Spawn the ambient traffic set on roads away from the player's start. */
export function spawnTraffic(game, count) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard < count * 30) {
    guard += 1;
    const spot = game.city.randomRoadPoint(game.rng);
    if (dist(spot.x, spot.y, game.player.x, game.player.y) < 260) continue;
    if (cars.some((c) => dist(c.x, c.y, spot.x, spot.y) < 70)) continue;
    const kind = pick(game.rng, TRAFFIC_KINDS);
    const car = new Car(spot.x, spot.y, spot.angle, kind, randomCarColor(game.rng));
    car.driver = 'traffic';
    cars.push(car);
  }
  return cars;
}

/** Fill the city's curb spots with parked cars. */
export function spawnParked(game) {
  const cars = [];
  for (const spot of game.city.parkedSpots) {
    const kind = pick(game.rng, TRAFFIC_KINDS);
    const car = new Car(spot.x, spot.y, spot.angle, kind, randomCarColor(game.rng));
    car.driver = null;
    cars.push(car);
  }
  return cars;
}

/** Draw one car: shadow, body, glass, wheels, livery, damage. */
export function drawCar(ctx, car, time) {
  const { len, wid } = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  // Ground shadow, offset toward the low sun.
  ctx.fillStyle = 'rgba(20,16,32,0.30)';
  ctx.beginPath();
  ctx.ellipse(4, 6, len * 0.55, wid * 0.62, car.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);

  const body = car.wrecked ? '#3a3f47' : car.color;
  ctx.fillStyle = body;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  // Nose and tail shading.
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  roundRect(ctx, len * 0.18, -wid / 2 + 2, len * 0.3, wid - 4, 4);
  ctx.fill();
  // Cabin glass.
  ctx.fillStyle = '#22303e';
  roundRect(ctx, -len * 0.08, -wid / 2 + 3.5, len * 0.34, wid - 7, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,235,0.5)';
  roundRect(ctx, len * 0.16, -wid / 2 + 4.5, len * 0.07, wid - 9, 2);
  ctx.fill();

  if (car.kind === 'police') {
    ctx.fillStyle = '#1f3a93';
    roundRect(ctx, -len / 2, -wid / 2, len * 0.3, wid, 5);
    ctx.fill();
    roundRect(ctx, len * 0.28, -wid / 2, len * 0.22, wid, 5);
    ctx.fill();
    // Light bar: red and blue halves trade flashes.
    const phase = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#5a0f0c';
    ctx.fillRect(-4, -wid / 2 + 3, 8, wid / 2 - 3);
    ctx.fillStyle = phase ? '#123a7a' : '#2f7bff';
    ctx.fillRect(-4, 0, 8, wid / 2 - 3);
  } else if (car.kind === 'cab') {
    ctx.fillStyle = '#10131c';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(-len / 2 + 4 + i * 6, wid / 2 - 5, 3.4, 3.4);
    ctx.fillStyle = '#fdf6e3';
    roundRect(ctx, -3, -4, 9, 8, 2);
    ctx.fill();
  } else if (car.kind === 'sport') {
    ctx.fillStyle = 'rgba(16,19,28,0.85)';
    ctx.fillRect(-len / 2 + 1, -wid / 2 + 2, 5, wid - 4); // rear wing
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-len * 0.3, -2, len * 0.55, 4); // centre stripe
  } else if (car.kind === 'van' || car.kind === 'hauler') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-len * 0.42, -wid / 2 + 3, len * 0.5, wid - 6);
    ctx.fillStyle = 'rgba(16,19,28,0.25)';
    ctx.fillRect(-len * 0.1, -wid / 2 + 3, 2, wid - 6);
  }

  // Wheels; the front pair turns with the wheel.
  ctx.fillStyle = '#14161c';
  const wy = wid / 2 - 1;
  for (const [wx, front] of [[len * 0.32, true], [-len * 0.32, false]]) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(wx, side * wy);
      if (front) ctx.rotate(car.steerVis * 0.42);
      ctx.fillRect(-5, -2.2, 10, 4.4);
      ctx.restore();
    }
  }
  // Lights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(len / 2 - 2.5, -wid / 2 + 2.5, 2.5, 4);
  ctx.fillRect(len / 2 - 2.5, wid / 2 - 6.5, 2.5, 4);
  ctx.fillStyle = car.wrecked ? '#571f1a' : '#d43a2e';
  ctx.fillRect(-len / 2, -wid / 2 + 2.5, 2.5, 4);
  ctx.fillRect(-len / 2, wid / 2 - 6.5, 2.5, 4);
  ctx.restore();

  // Damage smoke is emitted by the game loop; a wreck just sits dark and still.
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
