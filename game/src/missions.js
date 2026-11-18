// The story chain: five jobs for fixer Dario Klem, offered in order at
// his plaza corner. Each mission is a small stage machine; this module
// owns the stage logic and objective text, while main.js owns the world
// and passes a game context `G` with the entities and effect hooks:
//
//   G.player, G.playerCar() -> vehicle|null, G.peds, G.cars,
//   G.pay(amount, label), G.toast(text), G.bumpHeat(points),
//   G.setHeatAtLeast(points), G.clearHeat(), G.givePistol(),
//   G.spawnGuard(x, y), G.spawnTarget(x, y), G.spawnMissionCar(x, y),
//   G.sound.cash() / .fail() / .pickup()
//
// Payouts halve on replays after the chain is finished.

import { RESPRAY_COST } from './config.js';
import { makePed } from './pedestrians.js';
import { makeVehicle } from './vehicles.js';

export const MISSION_DEFS = [
  { title: 'First Wheels', pay: 250, blurb: 'Fetch a package from the docks and bring it to the garage. Wheels required.' },
  { title: 'Ledger Bound', pay: 400, blurb: 'A gambler at the east park owes Dario. Catch him and collect.' },
  { title: 'Daylight Gold', pay: 600, blurb: 'A Vireo GT sits at the docks under guard. Take it, deliver it shining.' },
  { title: 'Reel Trouble', pay: 800, blurb: 'Pick up a film reel at the beach. The whole bay will watch you deliver it.' },
  { title: 'Solano Goodbye', pay: 1200, blurb: 'One last run: shake a four-star ambush and reach the respray garage.' },
];

export class Missions {
  constructor(world) {
    this.world = world;
    this.index = 0;          // next mission to offer
    this.active = null;      // { n, stage, timer, target, car, holdFor }
    this.chainDone = false;
    this.replays = false;
  }

  get currentDef() {
    return this.active ? MISSION_DEFS[this.active.n] : MISSION_DEFS[this.index] ?? null;
  }

  /** What the HUD should say, and where the marker sits, right now. */
  objective() {
    const L = this.world.landmarks;
    if (!this.active) {
      if (this.chainDone && !this.replays) {
        return { text: 'Story complete — free roam. Talk to Dario to run jobs again for half pay.', marker: L.briefing };
      }
      const def = MISSION_DEFS[this.index];
      return { text: def ? `See Dario Klem on the plaza: ${def.title}` : 'Free roam.', marker: L.briefing };
    }
    const a = this.active;
    switch (a.n) {
      case 0:
        return a.stage === 'pickup'
          ? { text: 'First Wheels: drive to the docks yard and take the package (be in a car).', marker: L.docksYard }
          : { text: `First Wheels: deliver the package to the garage. ${Math.max(0, Math.ceil(a.timer))}s left.`, marker: L.respray };
      case 1:
        return { text: 'Ledger Bound: catch the debtor in the east park and stay on him.', marker: a.target ?? L.briefing };
      case 2:
        return a.stage === 'steal'
          ? { text: 'Daylight Gold: steal the marked Vireo GT at the docks.', marker: a.car ?? L.docksYard }
          : { text: 'Daylight Gold: deliver the GT to the garage — keep it pretty.', marker: L.respray };
      case 3:
        return a.stage === 'pickup'
          ? { text: 'Reel Trouble: collect the reel at the beach.', marker: L.beach }
          : { text: 'Reel Trouble: deliver the reel to Dario on the plaza. Heat is on.', marker: L.briefing };
      case 4:
        return { text: 'Solano Goodbye: reach the respray garage and end this.', marker: L.hideout };
      default:
        return { text: '', marker: null };
    }
  }

  /** Begin the next mission. Called when the player talks to Dario. */
  start(G) {
    if (this.active) return false;
    if (this.index >= MISSION_DEFS.length) {
      this.index = 0;
      this.replays = true;
    }
    const n = this.index;
    const L = this.world.landmarks;
    const a = { n, stage: 'go', timer: 0, target: null, car: null, holdFor: 0 };
    if (n === 0) {
      a.stage = 'pickup';
    } else if (n === 1) {
      const park = { x: 8 * 300 + 84 + 108, y: 6 * 300 + 84 + 108 };
      a.target = G.spawnTarget(park.x, park.y);
      a.stage = 'chase';
    } else if (n === 2) {
      a.car = G.spawnMissionCar(L.docksYard.x - 30, L.docksYard.y + 66);
      for (let i = 0; i < 4; i++) {
        G.spawnGuard(L.docksYard.x + (i - 1.5) * 44, L.docksYard.y + 20 + (i % 2) * 36);
      }
      a.stage = 'steal';
      G.givePistol();
      G.toast('Dario slips you a pistol. The dock crew will not ask politely.');
    } else if (n === 3) {
      a.stage = 'pickup';
    } else if (n === 4) {
      a.stage = 'escape';
      G.setHeatAtLeast(400);
      G.toast('Ambush! Every unit in the bay is rolling. Run.');
    }
    this.active = a;
    G.toast(`${MISSION_DEFS[n].title} — ${MISSION_DEFS[n].blurb}`);
    return true;
  }

  /** End the active mission without pay (busted, wasted, abandoned). */
  abort(G, reason) {
    if (!this.active) return;
    if (this.active.target) this.active.target.state = 'wander';
    this.active = null;
    if (reason) G.toast(reason);
  }

  finish(G, def, bonusNote = '') {
    const pay = Math.round(def.pay * (this.replays ? 0.5 : 1));
    G.pay(pay, def.title);
    this.active = null;
    this.index += 1;
    if (this.index >= MISSION_DEFS.length) {
      this.chainDone = true;
      G.toast(`Chain complete. Dario raises a glass to you.${bonusNote}`);
    }
    // Persist AFTER the index advanced, so a saved game never replays
    // a mission that was already paid for.
    G.save?.();
  }

  near(player, point, radius) {
    return Math.hypot(player.x - point.x, player.y - point.y) < radius;
  }

  /** Advance the active mission. Called every frame while playing. */
  update(dt, G) {
    const a = this.active;
    if (!a) return;
    const L = this.world.landmarks;
    const player = G.player;
    const car = G.playerCar();

    if (a.n === 0) {
      if (a.stage === 'pickup') {
        if (car && this.near(player, L.docksYard, 95)) {
          a.stage = 'deliver';
          a.timer = 240;
          G.sound.pickup();
          G.toast('Package on board. The garage, before the clock eats you.');
        }
      } else if (a.stage === 'deliver') {
        a.timer -= dt;
        if (a.timer <= 0) {
          this.abort(G, 'Too slow — the buyer walked. Dario still has work.');
          G.sound.fail();
          return;
        }
        if (car && this.near(player, L.respray, 95)) {
          this.finish(G, MISSION_DEFS[0]);
        }
      }
    } else if (a.n === 1) {
      const t = a.target;
      if (!t) { this.active = null; return; }
      if (t.state === 'down' && this.near(player, t, 46)) {
        t.state = 'confront';
      }
      if (t.state === 'confront') {
        if (this.near(player, t, 52)) {
          a.holdFor += dt;
          if (a.holdFor > 1.6) {
            t.state = 'wander';
            this.finish(G, MISSION_DEFS[1]);
          }
        } else {
          a.holdFor = 0;
          t.state = 'chase';
        }
      }
    } else if (a.n === 2) {
      if (a.stage === 'steal') {
        // Guards wake when the player closes in or touches the car.
        const close = this.near(player, L.docksYard, 240);
        if (close || car === a.car) {
          for (const ped of G.peds) {
            if (ped.role === 'guard' && ped.state !== 'down') ped.state = 'fight';
          }
        }
        if (car === a.car) {
          a.stage = 'deliver';
          G.bumpHeat(60);
          G.toast('That is the one. Garage. Now.');
        }
      } else if (a.stage === 'deliver') {
        if (a.car.dead) {
          this.abort(G, 'The GT is wrecked. Dario pays nothing for scrap.');
          G.sound.fail();
          return;
        }
        if (car === a.car && this.near(player, L.respray, 95)) {
          const shape = Math.max(0, a.car.hp / a.car.maxHp);
          const def = { ...MISSION_DEFS[2], pay: Math.round(400 + 200 * shape) };
          this.finish(G, def);
        }
      }
    } else if (a.n === 3) {
      if (a.stage === 'pickup') {
        if (this.near(player, L.beach, 85)) {
          a.stage = 'deliver';
          G.setHeatAtLeast(200);
          G.sound.pickup();
          G.toast('Reel secured — and half the bay saw it. Move.');
        }
      } else if (a.stage === 'deliver') {
        if (this.near(player, L.briefing, 80)) {
          this.finish(G, MISSION_DEFS[3]);
        }
      }
    } else if (a.n === 4) {
      // The ambush does not cool down on its own: heat is pinned.
      G.setHeatAtLeast(400);
      if (this.near(player, L.hideout, 85)) {
        G.clearHeat();
        this.finish(G, MISSION_DEFS[4]);
        G.toast(`Respray bills you $${RESPRAY_COST} later. Tonight, you vanish.`);
      }
    }
  }

  /** Factories re-exported so main.js needs no extra imports for spawns. */
  static makeTarget(x, y, rng) {
    const ped = makePed(x, y, rng, { role: 'target', name: 'Debt target', shirt: '#bc4749', hp: 80 });
    ped.state = 'chase';
    return ped;
  }

  static makeGuard(x, y, rng) {
    return makePed(x, y, rng, { role: 'guard', shirt: '#3d405b', hp: 85 });
  }

  static makeMissionCar(x, y, rng) {
    const car = makeVehicle('sports', x, y, -Math.PI / 2, rng, { parked: true, mission: true, color: '#ffb703' });
    return car;
  }
}
