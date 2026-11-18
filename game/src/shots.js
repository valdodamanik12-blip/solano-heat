// Solano Heat — the four dossier screenshots, staged deterministically. Each scene
// builds a fresh game, arranges a moment the brief asks for (a chase, a briefing,
// a firefight, a beach drive), then drives it with a scripted keyboard so the
// render the camera captures is alive — wheels turned, sirens behind, muzzle
// flashes lit — rather than a posed still. Same seed, same script, same frame.

import { STEP } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';
import { Car } from './vehicles.js';

/** A keyboard-and-mouse stand-in with the same surface as the real Input. */
class ScriptedInput {
  constructor() {
    this.held = new Set();
    this.taps = new Set();
    this.mouseX = 640;
    this.mouseY = 360;
    this.mouseDown = false;
    this.mouseClicked = false;
  }

  hold(...actions) {
    for (const a of actions) this.held.add(a);
  }

  release(...actions) {
    for (const a of actions) this.held.delete(a);
  }

  down(action) {
    return this.held.has(action);
  }

  hit(action) {
    if (this.taps.has(action)) {
      this.taps.delete(action);
      return true;
    }
    return false;
  }

  consume(action) {
    return this.hit(action);
  }

  consumeClick() {
    const clicked = this.mouseClicked;
    this.mouseClicked = false;
    return clicked;
  }

  axes() {
    return {
      x: (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0),
      y: (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0),
    };
  }

  endFrame() {}
}

/** Run `segments` of [steps, setup] against the fixed-step world. */
function run(game, input, segments) {
  for (const [steps, setup] of segments) {
    if (setup) setup(input);
    for (let i = 0; i < steps; i += 1) game.stepWorld(STEP);
  }
}

function freshWorld(game) {
  game.newGame();
  // The new-game banner and toast belong to a player starting out, not to a
  // staged scene: each scene raises only the banners its own action earns.
  game.hud.bannerNow = null;
  game.hud.toasts.length = 0;
  const input = new ScriptedInput();
  game.input = input;
  return input;
}

function skipBriefing(game) {
  game.missions.startBriefing(game);
  while (game.missions.state === 'briefing') game.missions.advanceDialogue(game);
}

function copCar(game, x, y, angle) {
  const cop = new Car(x, y, angle, 'police', '#20242e');
  cop.driver = 'police';
  game.cars.push(cop);
  return cop;
}

const SCENES = {
  /** The cover: four stars, a marked sedan running south, Interceptors behind. */
  cover(game) {
    const input = freshWorld(game);
    game.money = 1240;
    game.player.health = 86;
    skipBriefing(game);
    const car = game.missions.current.car;
    car.x = roadCenterX(5) - 19;
    car.y = 1180;
    car.angle = Math.PI / 2;
    game.player.enterCar(car);
    game.wanted.heat = 400;
    game.wanted.sightTimer = 0; // the hunt is live: eyes on her, no cooling
    run(game, input, [[150, (si) => si.hold('up')]]);
    // Whatever the pursuit spawned, the shot wants exactly three cars behind.
    game.cars = game.cars.filter((c) => c.driver !== 'police');
    copCar(game, car.x - 26, car.y - 168, Math.PI / 2);
    copCar(game, car.x + 30, car.y - 268, Math.PI / 2);
    copCar(game, car.x - 8, car.y - 380, Math.PI / 2);
    run(game, input, [[30, (si) => si.hold('up', 'right')]]);
    game.snapCamera();
  },

  /** The briefing: Mari on a downtown street, pistol drawn, Dario's words open. */
  foot(game) {
    const input = freshWorld(game);
    game.money = 420;
    game.player.x = roadCenterX(5) - 52;
    game.player.y = roadCenterY(4) + 64;
    game.player.angle = Math.PI / 2;
    game.player.weapon = 'pistol';
    game.missions.startBriefing(game);
    game.missions.lineIndex = 1;
    input.mouseX = 900;
    input.mouseY = 430;
    run(game, input, [[80, null]]);
    game.snapCamera();
  },

  /** The firefight: Ledger Bound, in the docks yard, both sides shooting. */
  mission(game) {
    const input = freshWorld(game);
    game.money = 1710;
    game.missions.storyIndex = 3;
    skipBriefing(game);
    const yard = game.city.pois.docks;
    const spots = [
      [yard.x - 92, yard.y - 44], [yard.x + 84, yard.y - 30],
      [yard.x - 40, yard.y + 84], [yard.x + 96, yard.y + 78],
    ];
    game.missions.guards.forEach((guard, i) => {
      guard.x = spots[i][0];
      guard.y = spots[i][1];
    });
    // Inside the yard, off the through road: traffic must not shove the shot.
    game.player.x = yard.x + 6;
    game.player.y = yard.y + 118;
    game.player.weapon = 'pistol';
    game.player.health = 64;
    game.wanted.heat = 210;
    game.wanted.sightTimer = 0;
    game.snapCamera();
    run(game, input, [[6, (si) => {
      const g = game.missions.guards[0];
      si.mouseX = g.x - game.camera.x;
      si.mouseY = g.y - game.camera.y;
      si.mouseDown = true;
    }], [14, null], [10, (si) => { si.mouseDown = false; }]]);
    game.snapCamera();
  },

  /** The beach drive: a stolen gold Sunfire eastbound on the shore road, the
   *  beach blocks and palms in frame to its south. (The road hugging the water
   *  sits at the world's very edge, where the camera cannot centre a car; the
   *  road one block north frames the drive properly.) */
  beach(game) {
    const input = freshWorld(game);
    game.money = 860;
    const car = new Car(820, roadCenterY(8), 0, 'sport', '#ffd60a');
    game.cars.push(car);
    game.player.enterCar(car);
    game.wanted.heat = 130;
    game.wanted.sightTimer = 0;
    run(game, input, [[215, (si) => si.hold('up')]]);
    game.cars = game.cars.filter((c) => c.driver !== 'police'
      || Math.hypot(c.x - car.x, c.y - car.y) <= 340);
    copCar(game, car.x - 190, car.y + 4, 0);
    run(game, input, [[18, (si) => si.hold('up')]]);
    game.snapCamera();
  },
};

export const SHOT_NAMES = Object.keys(SCENES);

/** Stage one named scene and leave the game in the 'shot' state, render-ready. */
export function stageShot(game, name) {
  const scene = SCENES[name];
  if (!scene) return false;
  scene(game);
  game.state = 'shot';
  return true;
}
