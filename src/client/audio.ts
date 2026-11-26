import type { GameEvent } from '../core/game';

/** All sound is synthesized with WebAudio: no audio files. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  musicOn = true;
  private nextNote = 0;
  private step = 0;
  private timer: number | null = null;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0) {
    const c = this.ctx, m = this.master;
    if (!c || !m) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(m);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, filter: BiquadFilterType, freq: number, gain: number, q = 1, delay = 0, dest?: AudioNode) {
    const c = this.ctx, m = this.master;
    if (!c || !m || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest ?? m);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  play(e: GameEvent) {
    if (!this.ctx) return;
    switch (e.type) {
      case 'bounce':
        this.tone(e.text === 'dribble' ? 150 : 120, 0.09, 'sine', e.text === 'dribble' ? 0.25 : 0.4, 50);
        break;
      case 'swish':
        this.noise(0.28, 'highpass', 2500, 0.35);
        this.cheer(0.9);
        break;
      case 'rim':
        this.tone(620, 0.32, 'triangle', 0.22);
        this.tone(935, 0.25, 'square', 0.06);
        break;
      case 'swing':
        // The whoosh of a strike, hit or miss.
        this.noise(e.power === 2 ? 0.14 : 0.08, 'bandpass', e.power === 2 ? 700 : 1100, e.power === 2 ? 0.16 : 0.1, 0.8);
        break;
      case 'hit':
        // Layered impact: a low body thump, a mid slap and a sharp crack.
        if (e.power === 2) {
          this.tone(150, 0.2, 'sine', 0.75, 42);
          this.noise(0.12, 'lowpass', 700, 0.7);
          this.noise(0.04, 'highpass', 2200, 0.5);
        } else {
          this.tone(190, 0.09, 'sine', 0.55, 70);
          this.noise(0.06, 'bandpass', 950, 0.45, 1);
          this.noise(0.03, 'highpass', 2400, 0.4);
        }
        break;
      case 'ko':
        this.tone(130, 0.3, 'sine', 0.85, 36);
        this.tone(95, 0.22, 'sawtooth', 0.22, 40);
        this.noise(0.18, 'lowpass', 600, 0.8);
        this.noise(0.05, 'highpass', 2000, 0.55);
        this.cheer(0.5);
        break;
      case 'slam':
        // A body landing.
        this.tone(e.power === 2 ? 85 : 110, e.power === 2 ? 0.2 : 0.12, 'sine', e.power === 2 ? 0.7 : 0.4, 34);
        this.noise(e.power === 2 ? 0.16 : 0.09, 'lowpass', 320, e.power === 2 ? 0.55 : 0.3);
        break;
      case 'whistle':
        this.whistle();
        break;
      case 'block':
        this.noise(0.12, 'bandpass', 1200, 0.6, 2);
        this.tone(200, 0.15, 'square', 0.15, 90);
        this.cheer(0.6);
        break;
      case 'steal':
      case 'fumble':
        this.tone(520, 0.08, 'square', 0.1, 780);
        break;
      case 'shoot':
        this.noise(0.18, 'bandpass', 700, 0.12, 0.7);
        break;
      case 'pass':
        this.noise(0.12, 'bandpass', 1100, 0.1, 0.8);
        break;
      case 'jump':
        if (e.text === 'DUNK!') this.tone(220, 0.35, 'sawtooth', 0.12, 660);
        break;
      case 'dunk':
        this.noise(0.35, 'lowpass', 400, 0.9);
        this.tone(70, 0.4, 'sine', 0.6, 40);
        this.tone(660, 0.4, 'triangle', 0.15);
        this.cheer(1.4);
        break;
      case 'special':
        this.tone(160, 0.7, 'sawtooth', 0.18, 1400);
        this.tone(240, 0.7, 'square', 0.08, 2000);
        break;
      case 'shockwave':
        this.tone(1200, 0.5, 'sawtooth', 0.2, 60);
        this.noise(0.5, 'lowpass', 500, 0.7);
        break;
      case 'buzzer':
      case 'violation':
        this.tone(196, 0.7, 'sawtooth', 0.22);
        this.tone(199, 0.7, 'square', 0.12);
        break;
      case 'final':
        this.cheer(2);
        break;
      case 'tackle':
        this.noise(0.2, 'bandpass', 500, 0.3, 0.6);
        break;
      case 'spin':
        this.noise(0.16, 'highpass', 1800, 0.18);
        this.tone(500, 0.14, 'sine', 0.08, 1100);
        break;
      case 'oop':
        this.tone(440, 0.22, 'triangle', 0.14, 880);
        break;
      case 'launch':
        this.tone(180, 0.3, 'square', 0.12, 900);
        this.tone(260, 0.25, 'sine', 0.2, 1300);
        break;
      case 'item':
        this.tone(660, 0.06, 'square', 0.08);
        this.tone(990, 0.08, 'square', 0.08, undefined, 0.06);
        break;
      case 'throw':
        this.noise(0.18, 'bandpass', 900, 0.2, 0.7);
        break;
      case 'itemhit':
        this.noise(0.22, 'bandpass', 1600, 0.6, 1.2);
        this.tone(300, 0.12, 'square', 0.12, 120);
        break;
      case 'megaslam':
      case 'blitz':
        this.tone(120, 0.6, 'sawtooth', 0.2, 900);
        this.noise(0.4, 'lowpass', 700, 0.4);
        break;
      default:
        break;
    }
  }

  private whistle() {
    const c = this.ctx, m = this.master;
    if (!c || !m) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.frequency.value = 2800;
    lfo.frequency.value = 28;
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(m);
    o.start(t); lfo.start(t);
    o.stop(t + 0.5); lfo.stop(t + 0.5);
  }

  private cheer(dur: number) {
    this.noise(dur, 'bandpass', 1100, 0.2, 0.6);
    this.noise(dur * 0.8, 'bandpass', 2200, 0.08, 0.8, 0.05);
  }

  /** Tiny step-sequencer: bass + hats, loops forever. */
  private schedule() {
    const c = this.ctx;
    if (!c || !this.musicGain) return;
    const spb = 60 / 104 / 2; // eighth notes at 104 BPM
    const bass = [45, 45, 57, 45, 48, 48, 60, 50, 43, 43, 55, 43, 47, 47, 59, 52];
    while (this.nextNote < c.currentTime + 0.15) {
      const t = this.nextNote;
      if (this.musicOn) {
        const n = bass[this.step % bass.length];
        const f = 440 * Math.pow(2, (n - 69) / 12);
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
        o.connect(g).connect(this.musicGain);
        o.start(t); o.stop(t + spb);
        if (this.noiseBuf) {
          const s = c.createBufferSource();
          s.buffer = this.noiseBuf;
          const hf = c.createBiquadFilter();
          hf.type = 'highpass'; hf.frequency.value = 7000;
          const hg = c.createGain();
          const accent = this.step % 2 === 1 ? 0.25 : 0.1;
          hg.gain.setValueAtTime(accent, t);
          hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          s.connect(hf).connect(hg).connect(this.musicGain);
          s.start(t, Math.random()); s.stop(t + 0.06);
        }
        if (this.step % 4 === 0) {
          const k = c.createOscillator();
          const kg = c.createGain();
          k.frequency.setValueAtTime(130, t);
          k.frequency.exponentialRampToValueAtTime(40, t + 0.12);
          kg.gain.setValueAtTime(0.7, t);
          kg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          k.connect(kg).connect(this.musicGain);
          k.start(t); k.stop(t + 0.16);
        }
      }
      this.nextNote += spb;
      this.step++;
    }
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
  }
}
