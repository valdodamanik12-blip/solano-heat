// Solano Heat — the game itself: the fixed-step loop, the world glue (collisions,
// theft, respray, reels, districts), the crime-report hooks every system calls
// into, the screens' state machine, and the boot — including the deterministic
// ?shot= mode the dossier screenshots are rendered from.

import { CITY_SEED, PALETTE, START_MONEY, STEP, WORLD_H, WORLD_W } from './config.js';
import { clamp, dist, mulberry32, pick } from './random.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { City } from './city.js';
import { Effects } from './effects.js';
import { drawCar, spawnParked, spawnTraffic } from './vehicles.js';
import { Ped, drawPerson, spawnPeds } from './pedestrians.js';
import { Player } from './player.js';
import { Bullets, startReload } from './combat.js';
import { PoliceSystem, Wanted } from './police.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { drawWorld } from './render.js';
import { clearSave, hasSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const REPAINTS = ['#c23b2e', '#3f7fbf', '#57a773', '#e0a458', '#8d6cc9', '#d9d9d9', '#2b2f38', '#e88ca0'];

function freshStats() {
  return { earned: 0, missionsDone: 0, carsStolen: 0, busts: 0, wastings: 0, shotsFired: 0, debtPaid: false };
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewW = 1280;
    this.viewH = 720;
    this.input = new Input(canvas);
    this.sound = new SoundBank();
    this.hud = new Hud();
    this.effects = new Effects();
    this.bullets = new Bullets();
    this.state = 'title';
    this.time = 0;
    this.playTime = 0;
    this.camera = { x: 0, y: 0 };
    this.showMap = false;
    this.showHelp = false;
    this.saveExists = hasSave();
    this.endInfo = '';
    this.pendingCharge = 0;
    this.interactLabel = null;
    this.districtNow = '';
    this.autosaveTimer = 0;
    this.resprayArmed = true;
    this.stats = freshStats();
    this.buildWorld();

    const wake = () => this.sound.wake();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      requestAnimationFrame(frame); // scheduled first: a bad frame can never freeze the game
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.time += dtReal;
      this.hud.update(dtReal);
      this.sound.updateMusic(dtReal, this.state === 'playing' || this.state === 'title');
      if (this.state === 'paused' && this.input.hit('pause')) {
        this.input.consume('KeyP', 'Escape'); // eat the press so the resumed step does not re-pause
        this.state = 'playing';
      }
      if (this.state === 'playing') {
        acc += dtReal;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          this.stepWorld(STEP);
          acc -= STEP;
          steps += 1;
        }
        if (steps === 5) acc = 0;
      }
      this.handleClicks();
      this.render();
    };
    requestAnimationFrame(frame);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = Math.round(this.viewW * dpr);
    this.canvas.height = Math.round(this.viewH * dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
    this.dpr = dpr;
  }

  // ------------------------------------------------------------ world setup

  buildWorld() {
    this.rng = mulberry32(987654321);
    this.city = new City(mulberry32(CITY_SEED));
    const g = this.city.pois.garage;
    this.player = new Player(g.x - 60, g.y + 26);
    this.cars = [...spawnTraffic(this, 14), ...spawnParked(this)];
    this.peds = spawnPeds(this, 26);
    this.wanted = new Wanted();
    this.police = new PoliceSystem();
    this.missions = new Missions();
    this.money = START_MONEY;
    this.reelsFound = new Set();
    this.bullets = new Bullets();
    this.effects = new Effects();
    this.districtNow = '';
    this.snapCamera();
  }

  newGame() {
    clearSave();
    this.buildWorld();
    this.stats = freshStats();
    this.state = 'playing';
    this.showMap = false;
    this.showHelp = false;
    this.saveExists = false;
    this.hud.banner('SOLANO HEAT', 'Mari Voss owes $2,200. Dario Klem is hiring.');
    this.hud.toast('See Dario at Klem Auto Works — walk up and press E');
    this.snapCamera();
  }

  continueGame() {
    const data = loadSave();
    if (!data) return;
    this.buildWorld();
    this.stats = { ...freshStats(), ...data.stats };
    this.money = data.money;
    this.missions.storyIndex = data.storyIndex;
    this.missions.storyDone = data.storyDone;
    this.reelsFound = new Set(data.reels);
    this.player.weapon = data.weapon;
    const resolved = this.city.collideCircle(
      clamp(data.x, 20, WORLD_W - 20), clamp(data.y, 20, WORLD_H - 20), 9,
    );
    this.player.x = resolved.x;
    this.player.y = resolved.y;
    this.player.health = clamp(data.health, 25, 100);
    this.state = 'playing';
    this.showMap = false;
    this.showHelp = false;
    this.hud.banner('Welcome back to Solano Bay');
    this.snapCamera();
  }

  saveNow() {
    saveGame(this);
    this.saveExists = true;
  }

  // ------------------------------------------------------------ input routing

  handleClicks() {
    if (!this.input.consumeClick()) return;
    this.sound.wake();
    if (this.showHelp) {
      this.showHelp = false;
      return;
    }
    if (this.state === 'wasted' || this.state === 'busted') {
      this.respawn();
      return;
    }
    if (this.state !== 'title' && this.state !== 'paused') return;
    const { mouseX: x, mouseY: y } = this.input;
    for (const c of this.hud.clickables) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        this.menuAction(c.action);
        return;
      }
    }
  }

  menuAction(action) {
    if (action === 'new') this.newGame();
    else if (action === 'continue') this.continueGame();
    else if (action === 'help') this.showHelp = true;
    else if (action === 'sound') {
      this.sound.setEnabled(!this.sound.enabled);
      this.sound.blip(520, 520, 0.06, 'sine', 0.06);
    } else if (action === 'resume') this.state = 'playing';
    else if (action === 'title') {
      this.state = 'title';
      this.saveExists = hasSave();
      this.sound.setEngine(false);
      this.sound.setSiren(0);
    } else if (action === 'close-help') this.showHelp = false;
    else if (action === 'respawn') this.respawn();
  }

  // ------------------------------------------------------------ the step

  stepWorld(dt) {
    this.playTime += dt;
    const briefing = this.missions.state === 'briefing';

    if (this.state === 'playing') this.handleKeys(briefing);

    if (!briefing) {
      this.missions.update(dt, this);
      this.player.update(dt, this);
    }
    for (const car of this.cars) {
      if (car.driver === 'traffic') car.driveTraffic(dt, this);
    }
    if (!briefing) this.police.update(dt, this);
    for (const car of this.cars) car.stepPhysics(dt, this);
    this.carCarCollisions();
    if (!briefing) this.carPedCollisions();
    this.bullets.update(dt, this);
    for (const ped of this.peds) ped.update(dt, this);
    if (!briefing) this.wanted.update(dt, this);
    this.effects.update(dt);

    if (!briefing && this.state === 'playing') {
      this.updateInteractLabel();
      this.reelsCheck();
      this.resprayCheck();
      this.districtCheck();
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 20) {
        this.autosaveTimer = 0;
        this.saveNow();
      }
    }
    this.soundSteering();
    this.updateCamera(dt);
    this.input.endFrame();
  }

  handleKeys(briefing) {
    const input = this.input;
    if (input.hit('pause')) {
      if (this.showMap) this.showMap = false;
      else if (this.state === 'playing') this.state = 'paused';
      return;
    }
    if (input.hit('map')) this.showMap = !this.showMap;
    if (input.hit('help')) this.showHelp = true;
    if (briefing) {
      if (input.hit('interact')) {
        this.missions.advanceDialogue(this);
        this.sound.blip(660, 660, 0.05, 'sine', 0.05);
      }
      return;
    }
    if (input.hit('reload')) startReload(this);
    if (input.hit('interact')) this.interact();
  }

  interact() {
    const p = this.player;
    if (p.inCar) {
      p.exitCar(this);
      this.sound.door();
      return;
    }
    const dario = this.city.pois.dario;
    if (!this.missions.busy && dist(p.x, p.y, dario.x, dario.y) < 48) {
      this.missions.startBriefing(this);
      this.sound.blip(520, 520, 0.06, 'sine', 0.05);
      return;
    }
    let best = null;
    let bestD = 58;
    for (const car of this.cars) {
      if (car.wrecked || car.driver === 'player') continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (best) this.enterCarFlow(best);
  }

  enterCarFlow(car) {
    const p = this.player;
    if (car.driver === 'traffic') {
      // Carjacking: the driver bails out and runs.
      const ped = new Ped(car.x + 14, car.y + 10, this.rng);
      this.peds.push(ped);
      ped.scare(this, p.x, p.y);
      this.wanted.report(this, 85, car.x, car.y);
      this.stats.carsStolen += 1;
    } else if (car.driver === 'police') {
      this.wanted.report(this, 110, car.x, car.y);
      this.stats.carsStolen += 1;
      this.hud.toast('You stole a police Interceptor');
    } else if (car.hot) {
      this.wanted.report(this, 60, car.x, car.y);
      this.stats.carsStolen += 1;
    } else if (!car.starterCar && !car.missionCar) {
      this.wanted.report(this, 55, car.x, car.y);
      this.stats.carsStolen += 1;
    }
    car.driver = 'player';
    p.enterCar(car);
    this.sound.door();
  }

  updateInteractLabel() {
    const p = this.player;
    if (p.inCar || this.missions.busy) {
      this.interactLabel = null;
      return;
    }
    const dario = this.city.pois.dario;
    if (dist(p.x, p.y, dario.x, dario.y) < 48) {
      this.interactLabel = `Talk to Dario — ${this.missions.offerTitle()}`;
      return;
    }
    let best = null;
    let bestD = 58;
    for (const car of this.cars) {
      if (car.wrecked || car.driver === 'player') continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    this.interactLabel = best ? `Enter the ${best.name}` : null;
  }

  // ------------------------------------------------------------ glue

  carCarCollisions() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = (a.spec.len + b.spec.len) / 2 * 0.72;
        if (d === 0 || d >= minD) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (minD - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.abs(a.vx - b.vx) + Math.abs(a.vy - b.vy);
        const avx = a.vx;
        const avy = a.vy;
        a.vx = b.vx * 0.6;
        a.vy = b.vy * 0.6;
        b.vx = avx * 0.6;
        b.vy = avy * 0.6;
        if (rel > 90) {
          const dmg = (rel - 90) * 0.05;
          a.damage = Math.min(100, a.damage + dmg);
          b.damage = Math.min(100, b.damage + dmg);
          this.effects.burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd60a', 5, 90);
          if (a.driver === 'player' || b.driver === 'player') {
            this.sound.crash(0.5);
            this.wanted.report(this, 14, a.x, a.y);
          }
        }
      }
    }
  }

  carPedCollisions() {
    for (const car of this.cars) {
      const speed = car.speed();
      if (speed < 55) continue;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        for (const c of car.circles()) {
          if (dist(ped.x, ped.y, c.x, c.y) < c.r + 7) {
            ped.knockDown(this, speed > 210);
            if (car.driver === 'player') this.effects.shake(3);
            break;
          }
        }
      }
      // The player, on foot, is not exempt from traffic.
      if (car.driver === 'traffic' && !this.player.inCar && this.state === 'playing') {
        for (const c of car.circles()) {
          if (dist(this.player.x, this.player.y, c.x, c.y) < c.r + 8) {
            this.player.hurt(this, 12, car.angle);
            this.player.x += Math.cos(car.angle) * 14;
            this.player.y += Math.sin(car.angle) * 14;
            break;
          }
        }
      }
    }
  }

  reelsCheck() {
    const pp = this.player.pos();
    for (const reel of this.city.reels) {
      if (this.reelsFound.has(reel.id)) continue;
      if (dist(pp.x, pp.y, reel.x, reel.y) < 22) {
        this.reelsFound.add(reel.id);
        this.money += 50;
        this.sound.pickup();
        this.effects.addText(reel.x, reel.y - 16, '+$50', PALETTE.gold);
        this.hud.toast(`Lost reel found — ${this.reelsFound.size} / 20 (+$50)`);
        this.saveNow();
      }
    }
  }

  resprayCheck() {
    const car = this.player.inCar;
    const z = this.city.resprayZone;
    const inside = car && car.x > z.x && car.x < z.x + z.w && car.y > z.y && car.y < z.y + z.h;
    if (!inside) {
      this.resprayArmed = true;
      return;
    }
    if (!this.resprayArmed || car.speed() > 26) return;
    if (car.damage <= 4 && this.wanted.stars === 0) return;
    this.resprayArmed = false;
    if (this.money < 120) {
      this.hud.toast("Manny's respray costs $120 — come back with cash");
      return;
    }
    this.money -= 120;
    car.damage = 0;
    car.color = pick(this.rng, REPAINTS);
    if (this.wanted.heat > 0) this.wanted.heat = Math.max(0, this.wanted.heat - 100);
    this.sound.cash();
    this.hud.toast('Resprayed: repaired, repainted, one star forgotten — $120');
    this.saveNow();
  }

  districtCheck() {
    const pp = this.player.pos();
    const name = this.city.districtAt(pp.x, pp.y);
    if (name !== this.districtNow) {
      if (this.districtNow) this.hud.toast(name);
      this.districtNow = name;
    }
  }

  soundSteering() {
    const car = this.player.inCar;
    if (this.state === 'playing' && car && !car.wrecked) {
      this.sound.setEngine(true, clamp(Math.abs(car.forwardSpeed()) / car.spec.top, 0, 1));
    } else {
      this.sound.setEngine(false);
    }
    if (this.state !== 'playing') this.sound.setSiren(0);
  }

  updateCamera(dt) {
    const pp = this.player.pos();
    const tx = clamp(pp.x - this.viewW / 2, 0, Math.max(0, WORLD_W - this.viewW));
    const ty = clamp(pp.y - this.viewH / 2, 0, Math.max(0, WORLD_H - this.viewH));
    const k = 1 - Math.exp(-7 * dt);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
  }

  snapCamera() {
    const pp = this.player.pos();
    this.camera.x = clamp(pp.x - this.viewW / 2, 0, Math.max(0, WORLD_W - this.viewW));
    this.camera.y = clamp(pp.y - this.viewH / 2, 0, Math.max(0, WORLD_H - this.viewH));
  }

  // ------------------------------------------------------------ crime hooks

  onGunshot(x, y) {
    this.wanted.report(this, 26, x, y);
    for (const ped of this.peds) {
      if (dist(ped.x, ped.y, x, y) < 190) ped.scare(this, x, y);
    }
  }

  onPedShot(ped) {
    if (ped.state !== 'down') ped.knockDown(this, true);
  }

  onPedPunched(ped) {
    ped.scare(this, this.player.x, this.player.y);
    this.wanted.report(this, 16, ped.x, ped.y);
  }

  onGuardShot(guard, dmg) {
    if (guard.dead) return;
    guard.hp -= dmg;
    this.effects.burst(guard.x, guard.y, '#c23b2e', 4, 70);
    if (guard.hp <= 0) {
      guard.dead = true;
      this.wanted.report(this, 40, guard.x, guard.y);
      this.hud.toast('Yard crew down');
    }
  }

  onOfficerShot(officer, dmg) {
    if (officer.dead) return;
    officer.hp -= dmg;
    this.effects.burst(officer.x, officer.y, '#c23b2e', 4, 70);
    if (officer.hp <= 0) {
      officer.dead = true;
      this.wanted.report(this, 120, officer.x, officer.y);
      this.hud.toast('Officer down — the heat jumps');
    }
  }

  onVehicleImpact(car, strength) {
    this.sound.crash(clamp(strength / 320, 0.15, 0.9));
    if (strength > 200) this.effects.smoke(car.x, car.y, 3);
    if (car.driver === 'player' && strength > 175) {
      this.wanted.report(this, strength > 260 ? 30 : 14, car.x, car.y);
    }
  }

  onPlayerWasted() {
    if (this.state !== 'playing') return;
    this.stats.wastings += 1;
    this.pendingCharge = Math.min(this.money, 75);
    this.endInfo = `St. Solana General patches Mari up. The bill: $${this.pendingCharge}.`;
    if (this.missions.busy) this.missions.fail(this, 'Mari went down');
    this.state = 'wasted';
    this.sound.setEngine(false);
    this.sound.setSiren(0);
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.stats.busts += 1;
    this.pendingCharge = Math.min(this.money, 40 + this.wanted.stars * 30);
    this.endInfo = `Fine: $${this.pendingCharge}. The car, if she had one, is impounded.`;
    if (this.missions.busy) this.missions.fail(this, 'Arrested mid-job');
    this.state = 'busted';
    this.police.arrestProgress = 0;
    this.sound.setEngine(false);
    this.sound.setSiren(0);
  }

  respawn() {
    this.money -= this.pendingCharge;
    this.pendingCharge = 0;
    const p = this.player;
    if (p.inCar) {
      if (this.state === 'busted') {
        this.cars = this.cars.filter((c) => c !== p.inCar);
      } else {
        p.inCar.driver = null;
      }
      p.inCar = null;
    }
    const spot = this.state === 'busted' ? this.city.pois.police : this.city.pois.hospital;
    p.x = spot.x + 26;
    p.y = spot.y + 18;
    p.health = p.maxHealth;
    p.deadTimer = 0;
    this.wanted.clear();
    this.police.standDown(this);
    this.state = 'playing';
    this.snapCamera();
    this.saveNow();
  }

  // ------------------------------------------------------------ render

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.state === 'title') {
      this.hud.draw(ctx, this);
      return;
    }
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(-Math.round(this.camera.x + shake.x), -Math.round(this.camera.y + shake.y));
    drawWorld(ctx, this);
    this.effects.drawUnder(ctx);
    for (const ped of this.peds) ped.draw(ctx);
    this.missions.drawGuards(ctx);
    const sortedCars = this.cars.slice().sort((a, b) => a.y - b.y);
    for (const car of sortedCars) drawCar(ctx, car, this.time);
    this.player.draw(ctx);
    this.police.drawOfficers(ctx);
    this.bullets.draw(ctx);
    this.effects.drawOver(ctx);
    // Dario Klem, at his post on the garage forecourt, in his fixer colours.
    const d = this.city.pois.dario;
    drawPerson(ctx, d.x, d.y, Math.PI / 2, 0, { skin: '#8a5a34', shirt: '#ffd60a', pants: '#2b2f38' }, { cap: true });
    ctx.restore();
    this.hud.draw(ctx, this);
  }
}

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.SOLANO = game;

const shotName = new URLSearchParams(window.location.search).get('shot');
if (shotName) {
  if (stageShot(game, shotName)) window.__shotReady = true;
}
