// Solano Heat — the law. A heat meter hides behind the stars: crimes add heat,
// witnesses decide how much of it sticks, and it drains while nobody can see you.
// The pursuit itself is Interceptors driven through the same car physics as
// everyone else, plus foot officers who pile out when they corner you on foot
// and will hold you for a BUSTED if you let them.

import { HEAT_MAX, HEAT_PER_STAR } from './config.js';
import { angleDelta, clamp, dist, rand } from './random.js';
import { Car } from './vehicles.js';
import { drawPerson, randomOutfit } from './pedestrians.js';
import { enemyShoot } from './combat.js';

// How many Interceptors the city sends at each star level.
const FLEET_BY_STARS = [0, 1, 2, 3, 4, 6];

export class Wanted {
  constructor() {
    this.heat = 0;
    this.sightTimer = 99; // seconds since a cop last laid eyes on the player
    this.spawnTimer = 0;
  }

  get stars() {
    if (this.heat <= 0) return 0;
    return Math.min(5, Math.ceil(this.heat / HEAT_PER_STAR));
  }

  /** True while the stars should blink: heat is draining, the trail is going cold. */
  get cooling() {
    return this.heat > 0 && this.sightTimer > 3.5;
  }

  /**
   * Report a crime at (x, y). What the city saw decides the weight: unseen crime is
   * cheap, a civilian audience costs full price, and doing it in front of the
   * police costs half again. Returns the multiplier that was applied.
   */
  report(game, base, x, y) {
    let witnesses = 0;
    for (const ped of game.peds) {
      if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < 150) witnesses += 1;
    }
    let policeSee = false;
    const pp = game.player.pos();
    for (const car of game.cars) {
      if (car.driver === 'police' && dist(x, y, car.x, car.y) < 470 && !game.city.losBlocked(x, y, car.x, car.y)) {
        policeSee = true;
        break;
      }
    }
    if (!policeSee) {
      for (const officer of game.police.officers) {
        if (!officer.dead && dist(x, y, officer.x, officer.y) < 300) { policeSee = true; break; }
      }
    }
    let mult = 0.45;
    if (witnesses > 0) mult = 1;
    if (policeSee) mult = 1.5;
    // A reported crime means the trail is warm: eyes were just on Mari, so the
    // cooling clock restarts near zero instead of wherever it had drifted to.
    if (mult >= 1) this.sightTimer = Math.min(this.sightTimer, 0.8);
    if (dist(x, y, pp.x, pp.y) < 4 && policeSee) this.sightTimer = 0;
    this.heat = clamp(this.heat + base * mult, 0, HEAT_MAX);
    return mult;
  }

  update(dt, game) {
    // Being seen: any active officer or Interceptor with a clear line to Mari.
    const pp = game.player.pos();
    let seen = false;
    if (this.heat > 0) {
      for (const car of game.cars) {
        if (car.driver !== 'police' || car.wrecked) continue;
        if (dist(pp.x, pp.y, car.x, car.y) < 470 && !game.city.losBlocked(pp.x, pp.y, car.x, car.y)) {
          seen = true;
          break;
        }
      }
      if (!seen) {
        for (const officer of game.police.officers) {
          if (!officer.dead && dist(pp.x, pp.y, officer.x, officer.y) < 300 && !game.city.losBlocked(pp.x, pp.y, officer.x, officer.y)) {
            seen = true;
            break;
          }
        }
      }
    }
    if (seen) this.sightTimer = 0;
    else this.sightTimer += dt;

    if (this.cooling) {
      // The longer unseen, the faster it drains — but capped, so a star lasts.
      const rate = 9 + Math.min(20, (this.sightTimer - 3.5) * 4);
      this.heat = Math.max(0, this.heat - dt * rate);
      if (this.heat === 0) game.police.standDown(game);
    }
    this.spawnTimer = Math.max(0, this.spawnTimer - dt);
  }

  clear() {
    this.heat = 0;
    this.sightTimer = 99;
  }
}

class Officer {
  constructor(x, y, rng, car) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.walkPhase = rand(rng, 0, 6);
    this.hp = 60;
    this.dead = false;
    this.fireTimer = rand(rng, 0.3, 0.9);
    this.car = car;
    this.outfit = { skin: randomOutfit(rng).skin, shirt: '#1f3a93', pants: '#16294d' };
  }
}

export class PoliceSystem {
  constructor() {
    this.officers = [];
    this.arrestProgress = 0;
  }

  copCars(game) {
    return game.cars.filter((c) => c.driver === 'police');
  }

  /** Heat reached zero: the hunt is over, everyone goes home. */
  standDown(game) {
    this.arrestProgress = 0;
    for (const officer of this.officers) officer.dead = true; // they simply leave the story
    this.officers = [];
  }

  update(dt, game) {
    const wanted = game.wanted;
    const pp = game.player.pos();
    const stars = wanted.stars;

    // --- The fleet: keep the promised number of Interceptors in the hunt.
    const cops = this.copCars(game);
    if (stars > 0 && cops.length < FLEET_BY_STARS[stars] && wanted.spawnTimer <= 0) {
      let spot = null;
      for (let tries = 0; tries < 8 && !spot; tries += 1) {
        const cand = game.city.randomRoadPoint(game.rng);
        const d = dist(cand.x, cand.y, pp.x, pp.y);
        if (d > 620 && d < 980) spot = cand;
      }
      if (spot) {
        const cop = new Car(spot.x, spot.y, spot.angle, 'police');
        cop.driver = 'police';
        game.cars.push(cop);
        wanted.spawnTimer = 2.2;
        if (dist(spot.x, spot.y, pp.x, pp.y) < 900) game.sound.sirenCue();
      }
    }

    // --- Drive the pursuit.
    for (const cop of cops) {
      if (cop.wrecked) continue;
      cop.huntTime = (cop.huntTime ?? 0) + dt;
      const lead = 0.32;
      const pvx = game.player.inCar ? game.player.inCar.vx : 0;
      const pvy = game.player.inCar ? game.player.inCar.vy : 0;
      const tx = pp.x + pvx * lead;
      const ty = pp.y + pvy * lead;
      const d = dist(cop.x, cop.y, pp.x, pp.y);
      const targetAngle = Math.atan2(ty - cop.y, tx - cop.x);
      const delta = angleDelta(cop.angle, targetAngle);
      cop.input.steer = clamp(delta * 2.6, -1, 1);
      if (stars === 0) {
        cop.input.throttle = d < 500 ? 0.35 : 0; // drifting away, hunt over
      } else if (!game.player.inCar && d < 46) {
        cop.input.throttle = 0; // cornered on foot: the officers' moment, not the bumper's
      } else {
        cop.input.throttle = d > 55 ? 1 : 0.45;
      }
      cop.input.hand = Math.abs(delta) > 1.15 && cop.speed() > 150;

      // Cornered on foot: pile out, up to two officers a car.
      if (
        stars >= 1 && !game.player.inCar && d < 120 && cop.speed() < 26
        && !cop.deployed && game.player.speedNow(game) < 210
      ) {
        cop.deployed = true;
        for (let i = 0; i < 2; i += 1) {
          this.officers.push(new Officer(cop.x + (i === 0 ? -14 : 14), cop.y + (i === 0 ? 10 : -10), game.rng, cop));
        }
      }
      // A wrecked or beached pursuit car is struck from the hunt when far away —
      // but only once it has had a fair chance to hunt: a fresh Interceptor
      // starts stationary at spawn range and must not be culled on frame one.
      if (cop.huntTime > 6 && (cop.wrecked || (cop.speed() < 4 && d > 200)) && d > 700) {
        game.cars.splice(game.cars.indexOf(cop), 1);
      }
    }
    // Retire cars that lost the trail entirely.
    if (stars === 0) {
      for (const cop of cops) {
        if (dist(cop.x, cop.y, pp.x, pp.y) > 560) {
          game.cars.splice(game.cars.indexOf(cop), 1);
        }
      }
    }

    // --- Foot officers.
    let arresting = false;
    for (const officer of this.officers) {
      if (officer.dead) continue;
      const d = dist(officer.x, officer.y, pp.x, pp.y);
      officer.fireTimer -= dt;
      const want = Math.atan2(pp.y - officer.y, pp.x - officer.x);
      officer.angle = want;
      if (game.player.inCar) {
        // Officers keep their distance from a moving car and shoot only at 3+ stars.
        if (stars >= 3 && d < 300 && officer.fireTimer <= 0 && !game.city.losBlocked(officer.x, officer.y, pp.x, pp.y)) {
          enemyShoot(game, officer.x, officer.y, pp.x, pp.y, 0.12);
          officer.fireTimer = 1.15;
        }
        continue;
      }
      if (d > 34) {
        const speed = 141;
        const nx = officer.x + Math.cos(want) * speed * dt;
        const ny = officer.y + Math.sin(want) * speed * dt;
        const resolved = game.city.collideCircle(nx, ny, 7);
        officer.x = resolved.x;
        officer.y = resolved.y;
        officer.walkPhase += dt * speed * 0.15;
      } else {
        // Hands on: the arrest fills while Mari stays close and slow.
        if (game.player.speedNow(game) < 62) arresting = true;
        officer.walkPhase += dt * 2;
      }
      if (stars >= 3 && d >= 60 && d < 300 && officer.fireTimer <= 0 && !game.city.losBlocked(officer.x, officer.y, pp.x, pp.y)) {
        enemyShoot(game, officer.x, officer.y, pp.x, pp.y, 0.1);
        officer.fireTimer = 1.0;
      }
      // An officer whose car is long gone gives up the foot chase.
      if (officer.car && !game.cars.includes(officer.car) && d > 420) officer.dead = true;
    }
    this.officers = this.officers.filter((o) => !o.dead);
    if (arresting) {
      this.arrestProgress += dt / 1.15;
      if (this.arrestProgress >= 1) {
        this.arrestProgress = 0;
        game.onBusted();
      }
    } else {
      this.arrestProgress = Math.max(0, this.arrestProgress - dt * 1.6);
    }

    // --- Sirens for the soundtrack: the nearest live Interceptor sets the level.
    let nearest = Infinity;
    for (const cop of this.copCars(game)) {
      if (!cop.wrecked) nearest = Math.min(nearest, dist(cop.x, cop.y, pp.x, pp.y));
    }
    game.sound.setSiren(nearest === Infinity ? 0 : clamp(1.15 - nearest / 620, 0, 1));
  }

  drawOfficers(ctx) {
    for (const officer of this.officers) {
      if (officer.dead) continue;
      drawPerson(ctx, officer.x, officer.y, officer.angle, officer.walkPhase, officer.outfit, {
        badge: true,
        aim: officer.angle,
        armed: true,
      });
    }
  }
}
