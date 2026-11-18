// Solano Heat — all sound is synthesized WebAudio: no audio files, no network. A lazy
// AudioContext wakes on the first user gesture (browsers refuse sound before one),
// and every voice is a small oscillator or filtered-noise recipe. The engine and the
// siren are continuous voices whose pitch and gain the world steers each frame; the
// music is a two-bar synthwave loop scheduled a step ahead of the clock.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
    this.musicTimer = 0;
    this.musicStep = 0;
  }

  /** Create the context on first use; safe to call every frame. */
  wake() {
    if (this.ctx || typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.03);
    }
  }

  /** One oscillator blip with an envelope. */
  blip(freqFrom, freqTo, seconds, type = 'square', volume = 0.2, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  /** A burst of white noise through a band-pass, for shots, hits and crashes. */
  noise(seconds, freq = 1200, volume = 0.25, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  shot() {
    this.noise(0.12, 900, 0.5);
    this.blip(220, 60, 0.1, 'sawtooth', 0.3);
  }

  punch() {
    this.noise(0.07, 500, 0.35);
  }

  hurt() {
    this.blip(180, 90, 0.15, 'sawtooth', 0.3);
  }

  crash(strength = 1) {
    this.noise(0.25, 300, Math.min(0.6, 0.2 + strength * 0.3));
    this.blip(90, 40, 0.25, 'triangle', 0.3);
  }

  cash() {
    this.blip(880, 880, 0.07, 'square', 0.15);
    this.blip(1320, 1320, 0.12, 'square', 0.15, 0.07);
  }

  pickup() {
    this.blip(660, 990, 0.12, 'sine', 0.25);
  }

  door() {
    this.noise(0.08, 700, 0.2);
    this.blip(140, 110, 0.08, 'triangle', 0.15, 0.02);
  }

  sirenCue() {
    this.blip(660, 660, 0.12, 'triangle', 0.2);
    this.blip(880, 880, 0.12, 'triangle', 0.2, 0.12);
  }

  /** Continuous engine voice; rpm is 0..1, on=false parks it. */
  setEngine(on, rpm = 0) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc && this.ctx) {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + rpm * 165, t, 0.06);
      this.engineGain.gain.setTargetAtTime(on && this.enabled ? 0.05 + rpm * 0.06 : 0, t, 0.08);
    }
  }

  /** Continuous police siren; loudness falls with distance, 0 parks it. */
  setSiren(level) {
    if (!this.ctx) return;
    if (level > 0 && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    }
    if (this.sirenOsc && this.ctx) {
      this.sirenPhase += 0.09;
      const wail = 700 + Math.sin(this.sirenPhase) * 180;
      this.sirenOsc.frequency.setTargetAtTime(wail, this.ctx.currentTime, 0.03);
      const target = this.enabled ? Math.min(0.12, level * 0.12) : 0;
      this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    }
  }

  /**
   * The music loop: a lazy bass line under rotating pads, in A minor, two bars of
   * eighth notes. Driven from the game loop so it never runs ahead of the tab.
   */
  updateMusic(dt, playing) {
    if (!this.ctx || !this.enabled || !playing) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const eighth = 60 / 112 / 2; // 112 BPM
    this.musicTimer = eighth;
    const step = this.musicStep % 16;
    this.musicStep += 1;
    const bassLine = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
    const bass = bassLine[step];
    if (bass) this.blip(bass, bass, eighth * 0.95, 'triangle', 0.22);
    if (step % 8 === 0) {
      const roots = [220, 174.6, 196, 146.8];
      const root = roots[(this.musicStep >> 3) % roots.length];
      for (const mult of [1, 1.25, 1.5]) {
        this.blip(root * mult, root * mult, eighth * 7, 'sine', 0.045);
      }
    }
  }
}
