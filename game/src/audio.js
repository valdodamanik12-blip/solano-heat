// Tiny WebAudio sound kit: every effect is a synthesised blip, so the
// game ships zero audio assets. Sounds are short oscillator envelopes;
// the siren is a slow two-tone loop that only runs while police are
// actively hunting. Everything is behind a mute toggle (M).

export class SoundKit {
  constructor() {
    this.ctx = null;        // created lazily on first user gesture
    this.muted = false;
    this.sirenNodes = null; // { osc, gain } while the siren runs
    this.lastShot = 0;
  }

  /** Create/resume the context. Must be called from a gesture handler. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch {
      this.ctx = null;
    }
  }

  /** One enveloped tone. freq slides to freqEnd when given. */
  blip(freq, dur = 0.09, type = 'square', vol = 0.08, freqEnd = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst (gunshots, crashes, punches). */
  noise(dur = 0.08, vol = 0.12, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(t0);
  }

  shot() {
    const now = performance.now();
    if (now - this.lastShot < 40) return;
    this.lastShot = now;
    this.noise(0.11, 0.16, 2600);
    this.blip(160, 0.07, 'sawtooth', 0.05, 60);
  }

  dryFire() { this.blip(880, 0.04, 'square', 0.05); }
  reload() {
    this.blip(320, 0.05, 'square', 0.06);
    this.blip(520, 0.05, 'square', 0.06, null, 0.32);
    this.blip(240, 0.05, 'square', 0.06, null, 0.72);
  }
  punch() { this.noise(0.06, 0.1, 700); }
  hit() { this.blip(110, 0.08, 'triangle', 0.1, 55); }
  crash(strength = 1) { this.noise(0.16, 0.1 + 0.1 * strength, 500); this.blip(70, 0.14, 'sawtooth', 0.07, 40); }
  pickup() { this.blip(660, 0.07, 'square', 0.07); this.blip(990, 0.1, 'square', 0.07, null, 0.07); }
  cash() {
    this.blip(1046, 0.07, 'square', 0.07);
    this.blip(1318, 0.09, 'square', 0.07, null, 0.07);
    this.blip(1568, 0.13, 'square', 0.07, null, 0.14);
  }
  fail() { this.blip(220, 0.16, 'sawtooth', 0.08, 110); }
  door() { this.blip(196, 0.07, 'triangle', 0.08, 130); }
  engine() { this.blip(88, 0.12, 'sawtooth', 0.05, 130); }
  sirenStart() {
    if (!this.ctx || this.muted || this.sirenNodes) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 760;
    lfo.frequency.value = 0.65;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0.018;
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    lfo.start();
    this.sirenNodes = { osc, lfo, gain };
  }

  sirenStop() {
    if (!this.sirenNodes) return;
    try {
      this.sirenNodes.osc.stop();
      this.sirenNodes.lfo.stop();
    } catch {
      // Already stopped.
    }
    this.sirenNodes = null;
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.sirenStop();
  }
}
