// Solano Heat — Marina "Mari" Voss, the player: walking and sprinting on foot,
// getting into and out of cars, aiming with the mouse, taking damage and slowly
// recovering when the trouble passes. While she drives, this module turns the
// game's input into the car's input record; the car itself does the moving.

import { PALETTE } from './config.js';
import { angleDelta, clamp } from './random.js';
import { drawPerson } from './pedestrians.js';
import { playerPunch, playerShoot } from './combat.js';

const WALK_SPEED = 132;
const SPRINT_SPEED = 205;
const REGEN_DELAY = 5; // seconds out of harm before health returns
const REGEN_RATE = 9; // health a second while recovering

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.aimAngle = -Math.PI / 2;
    this.walkPhase = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.inCar = null;
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.mag = 12;
    this.magSize = 12;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.hurtTimer = 0; // time since last damage, drives regeneration
    this.outfit = { skin: '#c68863', shirt: PALETTE.playerJacket, pants: '#2e3a4a' };
    this.dead = false;
  }

  /** Where the world should treat Mari as standing: her car, when she drives. */
  pos() {
    if (this.inCar) return { x: this.inCar.x, y: this.inCar.y };
    return { x: this.x, y: this.y };
  }

  speedNow(game) {
    if (this.inCar) return this.inCar.speed();
    const a = game.input.axes();
    if (a.x === 0 && a.y === 0) return 0;
    return game.input.down('ShiftLeft', 'ShiftRight') ? SPRINT_SPEED : WALK_SPEED;
  }

  enterCar(car) {
    this.inCar = car;
    car.driver = 'player';
    this.x = car.x;
    this.y = car.y;
  }

  /** Step out beside the car, on whichever side is clear of buildings. */
  exitCar(game) {
    const car = this.inCar;
    if (!car) return;
    car.driver = null;
    car.input = { throttle: 0, steer: 0, brake: true, hand: false };
    const side = Math.PI / 2;
    for (const dir of [side, -side]) {
      const nx = car.x + Math.cos(car.angle + dir) * (car.spec.wid / 2 + 12);
      const ny = car.y + Math.sin(car.angle + dir) * (car.spec.wid / 2 + 12);
      if (!game.city.pointBlocked(nx, ny)) {
        this.x = nx;
        this.y = ny;
        break;
      }
      this.x = nx;
      this.y = ny;
    }
    const resolved = game.city.collideCircle(this.x, this.y, 7);
    this.x = resolved.x;
    this.y = resolved.y;
    this.inCar = null;
    game.sound.door();
  }

  hurt(game, amount, fromAngle = null) {
    if (this.dead || game.state !== 'playing') return;
    this.health -= amount;
    this.hurtTimer = 0;
    game.effects.shake(0.18);
    game.sound.hurt();
    if (fromAngle !== null) {
      game.effects.burst(this.pos().x, this.pos().y, '#e2725b', 4, 80, 0.3, 2);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      game.onPlayerWasted();
    }
  }

  update(dt, game) {
    this.hurtTimer += dt;
    if (this.hurtTimer > REGEN_DELAY && this.health > 0) {
      this.health = Math.min(this.maxHealth, this.health + REGEN_RATE * dt);
    }
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.mag = this.magSize;
    }

    const input = game.input;
    // Aim always tracks the mouse in world space.
    const wx = game.camera.x + input.mouseX;
    const wy = game.camera.y + input.mouseY;
    const p = this.pos();
    this.aimAngle = Math.atan2(wy - p.y, wx - p.x);

    if (this.inCar) {
      const car = this.inCar;
      const axes = input.axes();
      car.input.throttle = axes.y < 0 ? 1 : axes.y > 0 ? -1 : 0;
      car.input.steer = axes.x;
      car.input.brake = false;
      car.input.hand = input.down('Space');
      this.x = car.x;
      this.y = car.y;
      this.angle = car.angle;
      return;
    }

    const axes = input.axes();
    if (axes.x !== 0 || axes.y !== 0) {
      const sprint = input.down('ShiftLeft', 'ShiftRight');
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      const len = Math.hypot(axes.x, axes.y);
      const vx = (axes.x / len) * speed;
      const vy = (axes.y / len) * speed;
      const resolved = game.city.collideCircle(this.x + vx * dt, this.y + vy * dt, 7);
      this.x = resolved.x;
      this.y = resolved.y;
      this.angle = Math.atan2(vy, vx);
      this.walkPhase += dt * speed * 0.14;
    }
    // While armed she faces the aim; unarmed she faces her stride.
    if (this.weapon === 'pistol') {
      this.angle += angleDelta(this.angle, this.aimAngle) * Math.min(1, dt * 18);
    }
    // The mouse is the trigger: a held button fires the pistol at its cadence,
    // or throws punches at theirs. combat.js owns the shots themselves.
    if (input.mouseDown && this.fireTimer <= 0 && this.reloadTimer <= 0) {
      if (this.weapon === 'pistol') playerShoot(game);
      else playerPunch(game);
    }
  }

  draw(ctx) {
    if (this.inCar) return; // the car is her portrait while she drives
    drawPerson(ctx, this.x, this.y, this.angle, this.walkPhase, this.outfit, {
      cap: PALETTE.playerCap,
      aim: this.weapon === 'pistol' ? this.aimAngle : null,
      armed: this.weapon === 'pistol',
    });
  }
}
