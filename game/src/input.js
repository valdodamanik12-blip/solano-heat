// Keyboard and mouse state, sampled by the game loop.
// The loop reads `input.moveX/moveY`; edge-triggered presses are consumed
// with take(), and the mouse is tracked in canvas coordinates (the loop
// adds the camera offset to get world coordinates for aiming).

const TRACKED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
  'KeyE', 'KeyF', 'KeyR', 'KeyM', 'KeyP', 'Escape', 'Enter',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // codes that went down since last take()
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;  // went down since last frame
    this.enabled = true;

    window.addEventListener('keydown', (ev) => {
      if (!this.enabled) return;
      if (TRACKED.has(ev.code)) ev.preventDefault();
      if (!ev.repeat) this.pressed.add(ev.code);
      this.keys.add(ev.code);
    });
    window.addEventListener('keyup', (ev) => {
      this.keys.delete(ev.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((ev.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseY = ((ev.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (ev) => {
      if (ev.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', (ev) => {
      if (ev.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  down(code) { return this.keys.has(code); }

  /** Edge trigger: true once per physical press until consumed. */
  take(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** Consume the "mouse clicked this frame" flag. */
  takeClick() {
    const was = this.mouseClicked;
    this.mouseClicked = false;
    return was;
  }

  /** -1..1 movement axes from WASD / arrows. */
  get moveX() {
    return (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
         - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
  }

  get moveY() {
    return (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0)
         - (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0);
  }

  get sprint() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }

  /** Forget all pending edge triggers (used on mode changes). */
  flush() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
