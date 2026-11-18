// SOLANO HEAT — entry point and game orchestration.
// Builds the world and every system, runs the loop, owns the crime/heat
// economy, interactions, respawns and saving, and exposes a debug hook
// (window.__solano) that the screenshot scenes and test harness drive.

import {
  START_MONEY, RESPRAY_COST, HOSPITAL_FEE, BUST_FEE, PENALTY_RATE,
  HEAT_MAX, HEAT_DECAY, HEAT_DECAY_SEEN, CRIME,
} from './config.js';
import { seededRng, seedFromQuery } from './random.js';
import { Input } from './input.js';
import { loadSave, storeSave, wipeSave, hasSave } from './save.js';
import { SoundKit } from './audio.js';
import { Effects } from './effects.js';
import { buildCity, collideCircle } from './city.js';
import { makeVehicle, spawnParked, spawnTraffic, updateTraffic, driveStep, damageVehicle, vehiclesOverlap } from './vehicles.js';
import { spawnCrowd, updatePeds, makePed } from './pedestrians.js';
import { createPlayer, updatePlayerOnFoot, hurtPlayer, regenPlayer, placePlayer } from './player.js';
import { Combat } from './combat.js';
import { Police, starsForHeat } from './police.js';
import { Missions } from './missions.js';
import { drawGround, drawProps, drawBuildings, drawVehicle, drawPed, drawPlayer, drawBeacon } from './render.js';
import { Hud } from './hud.js';
import { applyShot, shotFromQuery } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

const rng = seededRng(seedFromQuery(window.location.search));
const world = buildCity(rng);
const input = new Input(canvas);
const sound = new SoundKit();
const effects = new Effects();
const hud = new Hud(document);

const state = {
  mode: 'title',           // title | playing | paused | flash
  money: START_MONEY,
  heat: 0,
  time: 0,
  playSeconds: 0,
  flashTimer: 0,
  flashKind: null,
  saveTimer: 0,
  muted: false,
  cameraX: 0,
  cameraY: 0,
  focus: null,             // {x,y} camera override for posed scenes
  started: false,
};

const player = createPlayer(world.landmarks.briefing.x, world.landmarks.briefing.y + 120);
let cars = [...spawnParked(world, rng), ...spawnTraffic(world, rng)];
let peds = spawnCrowd(world, rng);
const police = new Police(world, rng);
const combat = new Combat(sound, effects);
const missions = new Missions(world);
let playerCar = null;
let threat = null;         // {x,y,radius,crime,for} fed to pedestrians

// ------------------------------------------------------------------ helpers

function clampHeat() {
  state.heat = Math.max(0, Math.min(HEAT_MAX, state.heat));
}

function witnessesAt(x, y, radius = 300) {
  if (police.seesCrime(x, y, radius + 40)) return true;
  return peds.some((p) => p.state !== 'down' && Math.hypot(p.x - x, p.y - y) < radius);
}

/** Apply a crime: full heat when seen, a third when nobody was watching. */
function commitCrime(points, x, y, label) {
  const seen = witnessesAt(x, y);
  state.heat += seen ? points : Math.round(points * 0.3);
  clampHeat();
  if (seen && label) effects.text(x, y - 24, label, '#ffd60a', 13);
  threat = { x, y, radius: 240, crime: true, for: 0.4 };
  return seen;
}

function addMoney(amount) {
  state.money += amount;
}

function penalty(fee) {
  const due = Math.min(state.money, Math.round(fee + state.money * PENALTY_RATE));
  state.money -= due;
  return due;
}

function persist() {
  storeSave({
    money: state.money,
    missionIndex: missions.index,
    chainDone: missions.chainDone,
    hasPistol: combat.hasPistol,
    reserveAmmo: combat.reserve,
    playerX: Math.round(player.x),
    playerY: Math.round(player.y),
    playSeconds: Math.round(state.playSeconds),
  });
}

function resetWorldEntities() {
  cars = [...spawnParked(world, rng), ...spawnTraffic(world, rng)];
  peds = spawnCrowd(world, rng);
  police.clear();
  playerCar = null;
  threat = null;
}

function newGame() {
  wipeSave();
  resetWorldEntities();
  state.money = START_MONEY;
  state.heat = 0;
  state.playSeconds = 0;
  missions.index = 0;
  missions.chainDone = false;
  missions.replays = false;
  missions.active = null;
  combat.hasPistol = false;
  combat.mag = 12;
  combat.reserve = 0;
  combat.bullets = [];
  player.hp = player.maxHp;
  placePlayer(player, world.landmarks.briefing.x, world.landmarks.briefing.y + 120, -Math.PI / 2);
  state.mode = 'playing';
  state.started = true;
  showScreen(null);
  hud.toast('Dario Klem waits on the plaza, under the palms. Go and earn.');
  persist();
}

function continueGame() {
  const save = loadSave();
  resetWorldEntities();
  state.money = save.money ?? START_MONEY;
  state.heat = 0;
  state.playSeconds = save.playSeconds || 0;
  missions.index = save.missionIndex || 0;
  missions.chainDone = !!save.chainDone;
  missions.active = null;
  if (save.hasPistol) {
    combat.givePistol();
    combat.reserve = save.reserveAmmo ?? combat.reserve;
  }
  player.hp = player.maxHp;
  const px = save.playerX ?? world.landmarks.briefing.x;
  const py = save.playerY ?? world.landmarks.briefing.y + 120;
  placePlayer(player, px, py, -Math.PI / 2);
  state.mode = 'playing';
  state.started = true;
  showScreen(null);
  hud.toast('Back in Solano Bay. Dario still has work for you.');
}

// ------------------------------------------------------------------ screens

const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  flash: document.getElementById('screen-flash'),
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (el) el.classList.toggle('hidden', key !== name);
  }
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = hasSave() ? '' : 'none';
}

document.getElementById('btn-new')?.addEventListener('click', () => { sound.unlock(); newGame(); });
document.getElementById('btn-continue')?.addEventListener('click', () => { sound.unlock(); continueGame(); });
document.getElementById('btn-resume')?.addEventListener('click', () => resumeGame());
document.getElementById('btn-restart')?.addEventListener('click', () => { sound.unlock(); newGame(); });

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  const el = document.getElementById('pause-stats');
  if (el) {
    el.textContent = `Cash $${Math.floor(state.money)} · Mission ${Math.min(5, missions.index + (missions.active ? 0 : 0))} of 5 in the chain · Heat ${starsForHeat(state.heat)} star(s) · ${Math.floor(state.playSeconds / 60)}m played`;
  }
  showScreen('pause');
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  showScreen(null);
  input.flush();
}

function flash(kind, detail) {
  state.mode = 'flash';
  state.flashKind = kind;
  state.flashTimer = 1.7;
  const word = document.getElementById('flash-word');
  const det = document.getElementById('flash-detail');
  if (word) word.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  if (det) det.textContent = detail;
  showScreen('flash');
  sound.fail();
  sound.sirenStop();
}

function doBusted() {
  if (state.mode !== 'playing') return;
  missions.abort(G, null);
  const due = penalty(BUST_FEE);
  flash('busted', `The Bay PD take $${due} in fines and drop you at the precinct. The job is blown.`);
  state.afterFlash = () => {
    placePlayer(player, world.landmarks.precinct.x, world.landmarks.precinct.y + 10, Math.PI / 2);
    player.hp = player.maxHp;
    playerCar = null;
    state.heat = 0;
    police.clear();
    persist();
  };
}

function doWasted() {
  if (state.mode !== 'playing') return;
  missions.abort(G, null);
  const due = penalty(HOSPITAL_FEE);
  flash('wasted', `You wake up at Solano General, $${due} lighter. The job is blown.`);
  state.afterFlash = () => {
    placePlayer(player, world.landmarks.hospital.x, world.landmarks.hospital.y + 10, Math.PI / 2);
    player.hp = player.maxHp;
    playerCar = null;
    state.heat = 0;
    police.clear();
    persist();
  };
}

// ------------------------------------------------------------------ missions context

const G = {
  get player() { return player; },
  playerCar: () => playerCar,
  get peds() { return peds; },
  get cars() { return cars; },
  pay(amount, label) {
    addMoney(amount);
    sound.cash();
    effects.text(player.x, player.y - 30, `+$${amount}`, '#7bd88a', 19);
    effects.cashBurst(player.x, player.y);
    hud.toast(`${label} — paid $${amount}.`);
    missions.index = missions.index; // index advanced by missions.finish
    persist();
  },
  toast: (text) => hud.toast(text),
  save: () => persist(),
  bumpHeat: (points) => { state.heat += points; clampHeat(); },
  setHeatAtLeast: (points) => { state.heat = Math.max(state.heat, points); clampHeat(); },
  clearHeat: () => { state.heat = 0; police.clear(); },
  givePistol: () => {
    if (!combat.hasPistol) hud.toast('You now carry a pistol. Mouse aims, click fires, R reloads.');
    combat.givePistol();
  },
  spawnTarget: (x, y) => {
    const ped = Missions.makeTarget(x, y, rng);
    peds.push(ped);
    return ped;
  },
  spawnGuard: (x, y) => {
    const ped = Missions.makeGuard(x, y, rng);
    peds.push(ped);
    return ped;
  },
  spawnMissionCar: (x, y) => {
    const car = Missions.makeMissionCar(x, y, rng);
    cars.push(car);
    return car;
  },
  sound,
};

// ------------------------------------------------------------------ interactions

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  if (car.driverSeat === 'traffic') {
    // The driver bails out and runs.
    const driver = makePed(car.x + 14, car.y + 10, rng);
    driver.state = 'flee';
    driver.panicFor = 2.4;
    driver.threatX = player.x;
    driver.threatY = player.y;
    peds.push(driver);
  }
  commitCrime(CRIME.stealSeen, car.x, car.y, 'WITNESSED');
  car.driverSeat = 'player';
  car.parked = false;
  car.traffic = false;
  playerCar = car;
  player.x = car.x;
  player.y = car.y;
  sound.door();
  sound.engine();
  hud.toast(`${car.label} — it's yours now. E to get out.`);
}

function exitCar() {
  if (!playerCar) return;
  const car = playerCar;
  car.driverSeat = null;
  car.speed = 0;
  playerCar = null;
  const side = car.angle + Math.PI / 2;
  const res = collideCircle(world, car.x + Math.cos(side) * (car.spec.wid + 16), car.y + Math.sin(side) * (car.spec.wid + 16), 13);
  placePlayer(player, res.x, res.y, car.angle);
  sound.door();
}

function tryRespray() {
  if (!playerCar) return false;
  if (state.money < RESPRAY_COST) {
    hud.toast(`Respray costs $${RESPRAY_COST}. You are short.`);
    sound.fail();
    return true;
  }
  state.money -= RESPRAY_COST;
  state.heat = Math.floor(state.heat * 0.3);
  playerCar.hp = playerCar.maxHp;
  playerCar.dead = false;
  effects.burst(playerCar.x, playerCar.y, { count: 16, color: '#e8e6df', speed: 80, life: 0.7, size: 4 });
  sound.pickup();
  hud.toast('Fresh paint, fresh plates. The heat forgets your face.');
  return true;
}

function handleInteract() {
  const L = world.landmarks;
  if (playerCar) {
    // E always means "get out" — respray has its own key (F, below), so
    // a driver at the garage is never trapped into paying for a respray
    // they did not ask for.
    exitCar();
    return;
  }
  // Talk to Dario.
  if (!missions.active && Math.hypot(player.x - L.briefing.x, player.y - L.briefing.y) < 78) {
    sound.unlock();
    missions.start(G);
    return;
  }
  const car = nearestCar(56);
  if (car) enterCar(car);
}

function currentPrompt() {
  const L = world.landmarks;
  if (playerCar) {
    const nearGarage = Math.hypot(player.x - L.respray.x, player.y - L.respray.y) < 95;
    if (nearGarage && (state.heat > 0 || playerCar.hp < playerCar.maxHp)) {
      return `<b>F</b> Respray — $${RESPRAY_COST} (lose heat, full repair) · <b>E</b> Exit vehicle`;
    }
    return '<b>E</b> Exit vehicle';
  }
  if (!missions.active && Math.hypot(player.x - L.briefing.x, player.y - L.briefing.y) < 78) {
    const def = missions.currentDef;
    return def ? `<b>E</b> Talk to Dario Klem — ${def.title}` : '<b>E</b> Talk to Dario Klem';
  }
  const car = nearestCar(56);
  if (car) return `<b>E</b> Steal the ${car.label}`;
  return null;
}

// ------------------------------------------------------------------ combat hooks

const combatHooks = {
  onPedHit(ped, result) {
    commitCrime(result === 'down' ? CRIME.hitPed : CRIME.punch, ped.x, ped.y, 'WITNESSED');
    if (result === 'down') effects.text(ped.x, ped.y - 20, 'DOWN', '#ff8080', 13);
  },
  onCarHit() {
    // Tapping a car with fists/bullets is vandalism, not a headline.
  },
  onWallHit() {},
};

function firePistol() {
  const mouseWorldX = input.mouseX + state.cameraX;
  const mouseWorldY = input.mouseY + state.cameraY;
  player.angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);
  const result = combat.tryFire(player.x, player.y, player.angle);
  if (result === 'fired') {
    commitCrime(CRIME.gunshot, player.x, player.y, 'SHOTS FIRED');
    effects.addShake(1.6);
  }
}

// ------------------------------------------------------------------ update

function updatePlaying(dt) {
  state.time += dt;
  state.playSeconds += dt;
  state.saveTimer += dt;
  if (state.saveTimer > 6) {
    state.saveTimer = 0;
    persist();
  }
  if (threat) {
    threat.for -= dt;
    if (threat.for <= 0) threat = null;
  }

  // Pause / mute / reload keys.
  if (input.take('KeyP') || input.take('Escape')) { pauseGame(); return; }
  if (input.take('KeyM')) {
    state.muted = !state.muted;
    sound.setMuted(state.muted);
    hud.toast(state.muted ? 'Sound off.' : 'Sound on.');
  }
  if (input.take('KeyR')) combat.startReload();
  if (input.take('KeyE')) handleInteract();

  // Player or their car.
  if (playerCar) {
    // F at the respray garage buys the service (its own key, see
    // handleInteract for why E stays "exit only").
    if (input.take('KeyF')) {
      const L = world.landmarks;
      if (Math.hypot(player.x - L.respray.x, player.y - L.respray.y) < 95) tryRespray();
    }
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const steer = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const impact = driveStep(world, playerCar, throttle, steer, dt);
    player.x = playerCar.x;
    player.y = playerCar.y;
    player.angle = playerCar.angle;
    player.speed = Math.abs(playerCar.speed);
    if (impact > 130) {
      damageVehicle(playerCar, impact * 0.05);
      effects.sparks(playerCar.x, playerCar.y);
      effects.addShake(3);
      sound.crash(1);
    }
    if (playerCar.dead) {
      effects.smoke(playerCar.x, playerCar.y);
      hud.toast('The car is wrecked. Get out and find another.');
      if (input.take('KeyE')) exitCar();
    }
    // Running people over is very much a crime.
    if (Math.abs(playerCar.speed) > 55) {
      for (const ped of peds) {
        if (ped.state === 'down' || ped.role === 'fixer') continue;
        if (Math.hypot(ped.x - playerCar.x, ped.y - playerCar.y) < playerCar.spec.len * 0.55) {
          ped.hp -= 70;
          ped.state = 'down';
          ped.downFor = 9999;
          effects.blood(ped.x, ped.y);
          commitCrime(CRIME.hitPed, ped.x, ped.y, 'WITNESSED');
          playerCar.speed *= 0.72;
          sound.crash(0.7);
        }
      }
    }
    // Car-to-car shunts.
    for (const other of cars) {
      if (other === playerCar || other.dead) continue;
      if (vehiclesOverlap(playerCar, other)) {
        const closing = Math.abs(playerCar.speed) + Math.abs(other.speed);
        if (closing > 70) {
          damageVehicle(other, closing * 0.06);
          damageVehicle(playerCar, closing * 0.04);
          other.speed += playerCar.speed * 0.3;
          playerCar.speed *= -0.18;
          effects.sparks(other.x, other.y);
          effects.addShake(2.4);
          sound.crash(0.8);
          commitCrime(CRIME.hitCar, other.x, other.y, null);
        }
      }
    }
  } else {
    updatePlayerOnFoot(world, player, input, dt);
    regenPlayer(player, dt);
    // Aim with the mouse while armed; face travel direction otherwise.
    if (combat.hasPistol && input.mouseDown) {
      player.angle = Math.atan2(input.mouseY + state.cameraY - player.y, input.mouseX + state.cameraX - player.x);
    }
    if (input.take('KeyF') || input.take('Space')) {
      const result = combat.punch(world, player, peds, cars, combatHooks, rng);
      if (result === 'air') effects.dust(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
    }
    if (input.mouseDown && combat.hasPistol) firePistol();
    input.takeClick();
    // Traffic can hit a careless pedestrian player.
    for (const car of cars) {
      if (!car.traffic || car.dead) continue;
      if (Math.hypot(car.x - player.x, car.y - player.y) < car.spec.len * 0.5 && Math.abs(car.speed) > 45) {
        if (hurtPlayer(player, 11)) { doWasted(); return; }
        effects.hurtFlash();
        effects.blood(player.x, player.y);
        const away = Math.atan2(player.y - car.y, player.x - car.x);
        placePlayer(player, player.x + Math.cos(away) * 22, player.y + Math.sin(away) * 22);
        sound.hit();
      }
    }
  }

  // World life.
  updateTraffic(world, cars, dt, rng);
  updatePeds(world, peds, dt, {
    playerX: player.x,
    playerY: player.y,
    threat,
    rng,
    onGuardHit(dmg) {
      if (state.mode !== 'playing') return;
      if (hurtPlayer(player, dmg)) { doWasted(); return; }
      effects.hurtFlash();
      effects.blood(player.x, player.y);
      sound.hit();
    },
  });
  combat.update(world, dt, peds, cars, combatHooks, rng);

  // Police and heat.
  police.update(dt, { heat: state.heat, player, playerCar }, {
    onBusted() { doBusted(); },
    onRam() {
      effects.sparks(playerCar ? playerCar.x : player.x, playerCar ? playerCar.y : player.y);
      effects.addShake(3);
      sound.crash(1);
    },
  });
  if (police.active) sound.sirenStart(); else sound.sirenStop();
  const seen = police.units.some((u) => !u.dead && Math.hypot(u.x - player.x, u.y - player.y) < 430);
  state.heat = Math.max(0, state.heat - (seen ? HEAT_DECAY_SEEN : HEAT_DECAY) * dt);
  if (missions.active && missions.active.n === 4) {
    // The finale ambush does not cool off; missions.update re-pins it.
  }

  missions.update(dt, G);
  effects.update(dt);

  hud.setObjective(missions.objective().text);
  hud.setPrompt(state.mode === 'playing' ? currentPrompt() : null);
}

function updateCamera(dt) {
  let tx;
  let ty;
  if (state.focus) {
    tx = state.focus.x - VIEW_W / 2;
    ty = state.focus.y - VIEW_H / 2;
  } else if (state.mode === 'title') {
    const cx = world.landmarks.briefing.x + Math.cos(state.time * 0.07) * 260;
    const cy = world.landmarks.briefing.y + Math.sin(state.time * 0.05) * 200;
    tx = cx - VIEW_W / 2;
    ty = cy - VIEW_H / 2;
  } else {
    tx = player.x - VIEW_W / 2;
    ty = player.y - VIEW_H / 2;
  }
  const k = state.focus ? 1 : Math.min(1, dt * 5);
  state.cameraX += (tx - state.cameraX) * k;
  state.cameraY += (ty - state.cameraY) * k;
  state.cameraX = Math.max(0, Math.min(world.w - VIEW_W, state.cameraX));
  state.cameraY = Math.max(0, Math.min(world.h - VIEW_H, state.cameraY));
}

// ------------------------------------------------------------------ render

function render() {
  const view = { x: state.cameraX, y: state.cameraY, w: VIEW_W, h: VIEW_H };
  ctx.fillStyle = '#0d4256';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  const shake = effects.shakeOffset();
  ctx.translate(-state.cameraX + shake.x, -state.cameraY + shake.y);

  drawGround(ctx, world, view);
  drawProps(ctx, world, view);
  const obj = missions.objective();
  if (state.mode !== 'title') drawBeacon(ctx, obj.marker, missions.active ? '#ffd60a' : '#7bd88a');
  for (const car of cars) {
    if (car.x < view.x - 80 || car.x > view.x + VIEW_W + 80 || car.y < view.y - 80 || car.y > view.y + VIEW_H + 80) continue;
    drawVehicle(ctx, car);
  }
  for (const u of police.units) drawVehicle(ctx, u);
  for (const ped of peds) {
    if (ped.x < view.x - 40 || ped.x > view.x + VIEW_W + 40 || ped.y < view.y - 40 || ped.y > view.y + VIEW_H + 40) continue;
    drawPed(ctx, ped);
  }
  if (!playerCar && state.mode !== 'title') {
    drawPlayer(ctx, player, combat.hasPistol);
  }
  // Bullets as tracers.
  ctx.strokeStyle = '#ffe66d';
  ctx.lineWidth = 2;
  for (const b of combat.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (combat.muzzle) {
    ctx.fillStyle = 'rgba(255, 214, 90, 0.9)';
    ctx.beginPath();
    ctx.arc(combat.muzzle.x, combat.muzzle.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  effects.drawParticles(ctx);
  effects.drawTexts(ctx);
  drawBuildings(ctx, world, view);
  ctx.restore();

  // Hurt vignette.
  if (effects.flash > 0.01) {
    ctx.fillStyle = `rgba(200, 30, 40, ${effects.flash * 0.35})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (state.mode !== 'title') {
    hud.update({ money: state.money, player, heat: state.heat, combat, police });
    hud.drawMinimap(world, player, cars, police.units, missions.objective().marker);
  }
}

// ------------------------------------------------------------------ loop

let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  if (state.mode === 'playing') {
    updatePlaying(dt);
  } else if (state.mode === 'flash') {
    state.flashTimer -= dt;
    effects.update(dt);
    if (state.flashTimer <= 0) {
      state.afterFlash?.();
      state.afterFlash = null;
      state.mode = 'playing';
      showScreen(null);
      input.flush();
    }
  } else if (state.mode === 'title') {
    state.time += dt;
    updateTraffic(world, cars, dt, rng);
    updatePeds(world, peds, dt, { playerX: -9999, playerY: -9999, threat: null, rng, onGuardHit: null });
    effects.update(dt);
    if (input.take('Enter')) { sound.unlock(); newGame(); }
  }
  updateCamera(dt);
  render();
}

// ------------------------------------------------------------------ scene API + debug hook

const sceneApi = {
  world,
  player,
  state,
  placePlayer: (x, y, angle) => placePlayer(player, x, y, angle),
  enterCar: (car) => {
    car.driverSeat = 'player';
    car.parked = false;
    car.traffic = false;
    playerCar = car;
    player.x = car.x;
    player.y = car.y;
  },
  newCar: (type, x, y, angle, color) => {
    const car = makeVehicle(type, x, y, angle, rng, { parked: true, color });
    cars.push(car);
    return car;
  },
  addGuard: (x, y) => {
    const ped = Missions.makeGuard(x, y, rng);
    ped.state = 'fight';
    peds.push(ped);
    return ped;
  },
  spawnCop: (x, y) => {
    const unit = police.spawnUnit({ x: x + 900, y });
    unit.x = x;
    unit.y = y;
    return unit;
  },
  setHeat: (n) => { state.heat = n; clampHeat(); },
  givePistol: () => combat.givePistol(),
  startPlaying: () => {
    state.mode = 'playing';
    state.started = true;
    showScreen(null);
  },
  focusOn: (x, y) => { state.focus = { x, y }; },
};

const shotName = shotFromQuery(window.location.search);
if (shotName) {
  applyShot(sceneApi, shotName);
} else {
  showScreen('title');
}

window.__solano = {
  ready: true,
  state,
  player,
  world,
  get cars() { return cars; },
  get peds() { return peds; },
  police,
  missions,
  combat,
  newGame,
  continueGame,
  teleport: (x, y) => {
    if (playerCar) { playerCar.x = x; playerCar.y = y; }
    placePlayer(player, x, y);
    state.focus = null;
  },
  enterNearestCar: () => {
    const car = nearestCar(400);
    if (car) { placePlayer(player, car.x, car.y); enterCar(car); }
    return car;
  },
  exitCar,
  interact: handleInteract,
  setHeat: sceneApi.setHeat,
  addMoney,
  givePistol: () => combat.givePistol(),
  startMission: () => missions.start(G),
  fire: (angle) => {
    player.angle = angle ?? player.angle;
    return combat.tryFire(player.x, player.y, player.angle);
  },
  reload: () => combat.startReload(),
  pause: pauseGame,
  resume: resumeGame,
  pose: (name) => applyShot(sceneApi, name),
  objective: () => missions.objective(),
  stars: () => starsForHeat(state.heat),
};

requestAnimationFrame(frame);
