import type { Season } from '../game/types';

/** Procedural ambience: wind that rises in winter and birdsong in the warm months. */
export class Ambient {
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private chirpTimer = 2;
  private t = 0;

  constructor(private ac: AudioContext) {}

  private start(): void {
    const ac = this.ac;
    this.master = ac.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ac.destination);
    // Looping noise buffer for wind.
    const len = ac.sampleRate * 4;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Brownish noise sounds softer than white noise.
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
      data[i] = last * 6;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.windFilter = ac.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 500;
    this.windGain = ac.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }

  setMuted(muted: boolean): void {
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ac.currentTime, 0.3);
  }

  update(dt: number, season: Season, running: boolean): void {
    if (!this.master) this.start();
    this.t += dt;
    const ac = this.ac;
    // Gusting wind.
    const gust = 0.5 + 0.5 * Math.sin(this.t * 0.31) * Math.sin(this.t * 0.17 + 1);
    const base = season === 3 ? 0.09 : season === 2 ? 0.05 : 0.03;
    this.windGain!.gain.setTargetAtTime(base * (0.4 + gust), ac.currentTime, 0.5);
    this.windFilter!.frequency.setTargetAtTime(300 + gust * 500, ac.currentTime, 0.5);
    // Birdsong in spring and summer while the game runs.
    if (!running || season >= 2) return;
    this.chirpTimer -= dt;
    if (this.chirpTimer > 0) return;
    this.chirpTimer = 1.5 + Math.random() * (season === 0 ? 3 : 5);
    this.chirp();
  }

  private chirp(): void {
    const ac = this.ac;
    const now = ac.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1600;
    for (let k = 0; k < notes; k++) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const t0 = now + k * (0.09 + Math.random() * 0.05);
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t0);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t0 + 0.07);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.018, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.08);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.1);
    }
  }
}
