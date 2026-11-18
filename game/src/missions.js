// Solano Heat — missions and story. Five jobs for fixer Dario Klem pay off Mari's
// debt; each is data (a briefing dialogue, a reward, a list of steps) plus the
// small state machine that walks the steps: enter the marked car, go somewhere,
// deliver a particular car, clear a yard of guards, beat a clock. When the story
// ends, the same machine generates endless courier work from the city's own map.

import { dist, pick, rand } from './random.js';
import { Car } from './vehicles.js';
import { drawPerson, randomOutfit } from './pedestrians.js';
import { enemyShoot } from './combat.js';

export class Guard {
  constructor(x, y, rng) {
    this.x = x;
    this.y = y;
    this.angle = rand(rng, 0, Math.PI * 2);
    this.walkPhase = rand(rng, 0, 6);
    this.hp = 60;
    this.dead = false;
    this.fireTimer = rand(rng, 0.5, 1.2);
    this.strafe = pick(rng, [-1, 1]);
    this.outfit = { skin: randomOutfit(rng).skin, shirt: '#3a3f47', pants: '#22242a' };
  }

  update(dt, game) {
    if (this.dead) return;
    const p = game.player.pos();
    const d = dist(this.x, this.y, p.x, p.y);
    const want = Math.atan2(p.y - this.y, p.x - this.x);
    this.angle = want;
    this.fireTimer -= dt;
    if (d > 130) {
      const speed = 96;
      const nx = this.x + Math.cos(want) * speed * dt;
      const ny = this.y + Math.sin(want) * speed * dt;
      const resolved = game.city.collideCircle(nx, ny, 7);
      this.x = resolved.x;
      this.y = resolved.y;
      this.walkPhase += dt * speed * 0.15;
    } else if (d < 62) {
      // Too close for comfort: back away while firing.
      const nx = this.x - Math.cos(want) * 60 * dt;
      const ny = this.y - Math.sin(want) * 60 * dt;
      const resolved = game.city.collideCircle(nx, ny, 7);
      this.x = resolved.x;
      this.y = resolved.y;
    }
    if (d < 300 && this.fireTimer <= 0 && !game.city.losBlocked(this.x, this.y, p.x, p.y)) {
      enemyShoot(game, this.x, this.y, p.x, p.y, 0.11);
      this.fireTimer = 0.85 + Math.random() * 0.5;
    }
  }

  draw(ctx) {
    if (this.dead) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = this.outfit.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9.5, 4.6, this.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    drawPerson(ctx, this.x, this.y, this.angle, this.walkPhase, this.outfit, {
      aim: this.angle, armed: true,
    });
  }
}

// The story. Steps: {type:'enter'} uses the mission's spawned car; 'goto' a point;
// 'deliver' a point in the spawned car; 'fight' clears `count` guards at a point.
export const STORY = [
  {
    title: 'First Wheels',
    reward: 150,
    brief: [
      ['Dario Klem', 'Mari. You came home. The debt did not go anywhere while you were gone, so let us start small.'],
      ['Mari Voss', 'Small suits me. What do you need?'],
      ['Dario Klem', 'That blue sedan on my forecourt — take it down to the Marina Pier. My cousin is waiting, and he does not wait long.'],
    ],
    setup(game, rt) {
      const g = game.city.pois.garage;
      const car = new Car(g.x + 44, g.y + 34, Math.PI / 2, 'sedan', '#4a7fb5');
      car.starterCar = true;
      car.missionCar = true;
      game.cars.push(car);
      rt.car = car;
    },
    steps: (game) => [
      { type: 'enter', label: 'Get in the blue sedan' },
      { type: 'deliver', label: 'Drive the sedan to the Marina Pier', x: game.city.pois.pier.x, y: game.city.pois.pier.y },
    ],
  },
  {
    title: 'The Sealed Case',
    reward: 250,
    brief: [
      ['Dario Klem', 'A case came in at the Old Port docks. Steel, sealed, and not yours to open.'],
      ['Mari Voss', 'And if I get curious?'],
      ['Dario Klem', 'Then you carry it slower. Pick it up, take it to the drop in The Flats, and do not dent it.'],
    ],
    steps: (game) => [
      { type: 'goto', label: 'Pick up the sealed case at the docks', x: game.city.pois.docks.x, y: game.city.pois.docks.y, r: 40 },
      { type: 'goto', label: 'Deliver the case to the drop in The Flats', x: game.city.pois.police.x + 1180, y: game.city.pois.hospital.y + 330, r: 48 },
    ],
  },
  {
    title: 'Daylight Gold',
    reward: 400,
    brief: [
      ['Dario Klem', 'Customs impounded a gold Sunfire GT. It sits in their yard downtown, pretty as a shop window.'],
      ['Mari Voss', 'You want me to steal it back. In daylight.'],
      ['Dario Klem', 'I want you to steal it back quietly. The yard crew disagrees? You still carry that pistol licence, yes?'],
    ],
    setup(game, rt) {
      // The impound yard is the forecourt of the civic block downtown: the gold car
      // sits in the open, south of the hall, where everyone can see it.
      const hall = game.city.pois.police;
      const car = new Car(hall.x + 60, hall.y - 6, Math.PI / 2, 'sport', '#ffd60a');
      car.missionCar = true;
      car.hot = true; // Taking it is theft, and the city will hear about it.
      game.cars.push(car);
      rt.car = car;
    },
    steps: (game) => [
      { type: 'enter', label: 'Steal the gold Sunfire GT' },
      { type: 'deliver', label: 'Bring the Sunfire to Klem Auto Works', x: game.city.pois.garage.x, y: game.city.pois.garage.y },
    ],
  },
  {
    title: 'Ledger Bound',
    reward: 600,
    brief: [
      ['Dario Klem', 'The yard crew at the Old Port keeps a ledger with my name in it. I would like it back.'],
      ['Mari Voss', 'Four of them, one of me. You are generous with my luck, Dario.'],
      ['Dario Klem', 'Clear the yard, take the ledger from the warehouse door, and bring it home. Then we are nearly square.'],
    ],
    steps: (game) => [
      { type: 'fight', label: 'Clear the yard crew', x: game.city.pois.docks.x, y: game.city.pois.docks.y, count: 4 },
      { type: 'goto', label: 'Take the ledger', x: game.city.pois.docks.x, y: game.city.pois.docks.y - 58, r: 38 },
      { type: 'goto', label: 'Bring the ledger to Klem Auto Works', x: game.city.pois.garage.x, y: game.city.pois.garage.y, r: 52 },
    ],
  },
  {
    title: 'Last Run',
    reward: 800,
    timed: 150,
    brief: [
      ['Dario Klem', 'One last run, Mari. The van, the pier, before the clock eats it. Do this and the debt is ash.'],
      ['Mari Voss', 'And after that, my time is my own?'],
      ['Dario Klem', 'After that, you will work for me because the pay is good. Drive.'],
    ],
    setup(game, rt) {
      const g = game.city.pois.garage;
      const car = new Car(g.x + 44, g.y + 34, Math.PI / 2, 'van', '#d9d9d9');
      car.missionCar = true;
      game.cars.push(car);
      rt.car = car;
    },
    steps: (game) => [
      { type: 'enter', label: 'Get in the white van' },
      { type: 'deliver', label: 'Reach the Marina Pier before the clock runs out', x: game.city.pois.pier.x, y: game.city.pois.pier.y },
    ],
  },
];

export class Missions {
  constructor() {
    this.state = 'idle'; // idle | briefing | active
    this.storyIndex = 0;
    this.storyDone = false;
    this.current = null; // runtime mission
    this.dialogue = [];
    this.lineIndex = 0;
    this.guards = [];
  }

  get busy() {
    return this.state !== 'idle';
  }

  /** A job is on offer whenever Mari is free: the next story job, or courier work. */
  offerTitle() {
    if (this.storyIndex < STORY.length) return STORY[this.storyIndex].title;
    return 'Courier work';
  }

  startBriefing(game) {
    if (this.state !== 'idle') return;
    let rt;
    if (this.storyIndex < STORY.length) {
      const def = STORY[this.storyIndex];
      rt = {
        def, title: def.title, reward: def.reward, story: true,
        steps: def.steps(game), stepIndex: 0,
        timer: def.timed ?? null, car: null,
      };
      if (def.setup) def.setup(game, rt);
      this.dialogue = def.brief.slice();
    } else {
      rt = this.makeCourier(game);
      this.dialogue = rt.brief;
    }
    this.current = rt;
    this.lineIndex = 0;
    this.state = 'briefing';
  }

  advanceDialogue(game) {
    this.lineIndex += 1;
    if (this.lineIndex >= this.dialogue.length) {
      this.state = 'active';
      this.enterStep(game);
      game.hud.banner(`Mission: ${this.current.title}`);
      // Daylight Gold is the job Dario arms her for: from here on, Mari carries.
      if (this.current.story && this.storyIndex === 2 && game.player.weapon !== 'pistol') {
        game.player.weapon = 'pistol';
        game.hud.toast('Dario hands over a pistol — mouse aims, click fires, R reloads');
      }
    }
  }

  enterStep(game) {
    const step = this.current?.steps[this.current.stepIndex];
    if (!step) return;
    if (step.type === 'fight') {
      this.guards = [];
      for (let i = 0; i < step.count; i += 1) {
        const a = (i / step.count) * Math.PI * 2;
        this.guards.push(new Guard(step.x + Math.cos(a) * 66, step.y + Math.sin(a) * 52, game.rng));
      }
    }
  }

  /** Where the HUD arrow and the beacon should point right now. */
  objective(game) {
    if (this.state === 'briefing') {
      return { x: game.city.pois.dario.x, y: game.city.pois.dario.y, label: 'Talking to Dario' };
    }
    if (this.state !== 'active' || !this.current) return null;
    const step = this.current.steps[this.current.stepIndex];
    if (!step) return null;
    if (step.type === 'enter') {
      return { x: this.current.car.x, y: this.current.car.y, label: step.label };
    }
    if (step.type === 'deliver' && game.player.inCar !== this.current.car) {
      return { x: this.current.car.x, y: this.current.car.y, label: 'Get back in the car' };
    }
    return { x: step.x, y: step.y, label: step.label };
  }

  update(dt, game) {
    for (const guard of this.guards) guard.update(dt, game);
    if (this.state !== 'active' || !this.current) return;
    const rt = this.current;
    if (rt.timer !== null && rt.timer !== undefined) {
      rt.timer -= dt;
      if (rt.timer <= 0) {
        this.fail(game, 'Out of time');
        return;
      }
    }
    const step = rt.steps[rt.stepIndex];
    if (!step) return;
    const pp = game.player.pos();
    let done = false;
    if (step.type === 'enter') {
      done = game.player.inCar === rt.car;
    } else if (step.type === 'goto') {
      done = dist(pp.x, pp.y, step.x, step.y) < (step.r ?? 46);
    } else if (step.type === 'deliver') {
      if (rt.car.wrecked) {
        this.fail(game, 'The car is a wreck');
        return;
      }
      done = game.player.inCar === rt.car && dist(rt.car.x, rt.car.y, step.x, step.y) < 58;
    } else if (step.type === 'fight') {
      done = this.guards.every((g) => g.dead);
    }
    if (done) {
      rt.stepIndex += 1;
      if (rt.stepIndex >= rt.steps.length) this.complete(game);
      else {
        this.enterStep(game);
        game.sound.pickup();
      }
    }
  }

  complete(game) {
    const rt = this.current;
    game.money += rt.reward;
    game.stats.earned += rt.reward;
    game.stats.missionsDone += 1;
    game.sound.cash();
    game.hud.banner(`${rt.title} — complete`, `+$${rt.reward}`);
    if (rt.story) {
      this.storyIndex += 1;
      if (this.storyIndex >= STORY.length) {
        this.storyDone = true;
        game.hud.banner('The debt is paid', 'Mari Voss is her own woman again. Courier work continues.');
        game.stats.debtPaid = true;
      }
    }
    this.cleanup(game);
    this.state = 'idle';
    this.current = null;
    game.saveNow();
  }

  fail(game, reason) {
    if (!this.current) return;
    game.hud.banner('Mission failed', reason);
    this.cleanup(game);
    this.state = 'idle';
    this.current = null;
  }

  /** Remove the mission's actors; spawned cars stay in the world as ordinary cars. */
  cleanup(game) {
    this.guards = [];
    if (this.current?.car) {
      this.current.car.missionCar = false;
    }
    this.dialogue = [];
  }

  makeCourier(game) {
    const pois = [game.city.pois.docks, game.city.pois.hospital, game.city.pois.police, game.city.pois.respray, game.city.pois.pier];
    const from = pick(game.rng, pois);
    let to = pick(game.rng, pois);
    if (to === from) to = game.city.pois.garage;
    const pay = Math.round(dist(from.x, from.y, to.x, to.y) / 11 / 5) * 5;
    return {
      def: null, title: 'Courier Run', story: false,
      reward: Math.max(60, Math.min(420, pay)),
      steps: [
        { type: 'goto', label: 'Pick up the package', x: from.x, y: from.y, r: 44 },
        { type: 'goto', label: 'Deliver the package', x: to.x, y: to.y, r: 48 },
      ],
      stepIndex: 0, timer: null, car: null,
      brief: [
        ['Dario Klem', 'A package, a place, a payment. The Solano Bay special.'],
        ['Mari Voss', 'On it.'],
      ],
    };
  }

  drawGuards(ctx) {
    for (const guard of this.guards) guard.draw(ctx);
  }
}
