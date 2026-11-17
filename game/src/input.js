// Solano Heat — keyboard and mouse state. The game polls this once per fixed step:
// `down` is level-triggered (held), `hit` is edge-triggered (pressed since the last
// step) and both feed from one press queue that endFrame clears after each step, so
// a tap is seen exactly once however the frame rate wobbles. `hit` also answers to
// action names — 'interact', 'pause', 'map', 'help', 'reload' — so the game's
// state machine reads in intentions while the player code reads raw keys.

// The named actions and the physical keys that trigger them.
const ACTIONS = {
  interact: ['KeyE'],
  pause: ['KeyP', 'Escape'],
  map: ['KeyM'],
  help: ['KeyH'],
  reload: ['KeyR'],
};

export class Input {
  constructor(canvas) {
    this.keys = new Set(); // codes currently held
    this.pressed = new Set(); // codes pressed since the last endFrame
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // a fresh click since the last endFrame
    this.enabled = true;

    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      this.keys.add(ev.code);
      this.pressed.add(ev.code);
      // Keep the page itself still: the game owns these keys.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(ev.code)) {
        ev.preventDefault();
      }
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
      this.mouseX = ev.clientX - rect.left;
      this.mouseY = ev.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (ev) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ev.clientX - rect.left;
      this.mouseY = ev.clientY - rect.top;
      if (ev.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
    });
    window.addEventListener('mouseup', (ev) => {
      if (ev.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  /** True while any of the given key codes is held. */
  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True on the step a press begins. Accepts key codes or action names. */
  hit(...names) {
    return names.some((n) => (ACTIONS[n] ?? [n]).some((c) => this.pressed.has(c)));
  }

  /** Forget a press, so a second system does not act on the same tap. */
  consume(...codes) {
    for (const c of codes) this.pressed.delete(c);
  }

  /** Take the pending click, if any: true exactly once per physical click. */
  consumeClick() {
    const clicked = this.mouseClicked;
    this.mouseClicked = false;
    return clicked;
  }

  /** Movement axes from the keys: x right, y down, each in -1..1. */
  axes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y -= 1;
    if (this.down('KeyS', 'ArrowDown')) y += 1;
    return { x, y };
  }

  /** Clear the per-step press queue. Called once after every fixed step. The
   *  pending click is NOT cleared here — menus consume it via consumeClick, and
   *  a step must never eat a click meant for the frame's menu pass. */
  endFrame() {
    this.pressed.clear();
  }
}
