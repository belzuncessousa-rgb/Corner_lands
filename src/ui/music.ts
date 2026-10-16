import type { Season } from '../game/types';

/**
 * A quiet tune now and then: a recorder-like melody over a plucked drone,
 * in a mode for each season. Phrases are made up as they play, with long
 * silences between, so it never becomes a loop you notice.
 */

// Scale steps in semitones from the root, and the root note per season.
const MODES: Record<Season, { root: number; steps: number[]; pace: number }> = {
  0: { root: 62, steps: [0, 2, 3, 5, 7, 9, 10, 12], pace: 0.42 }, // spring: D dorian
  1: { root: 67, steps: [0, 2, 4, 5, 7, 9, 10, 12], pace: 0.38 }, // summer: G mixolydian
  2: { root: 57, steps: [0, 2, 3, 5, 7, 8, 10, 12], pace: 0.5 }, // autumn: A aeolian
  3: { root: 52, steps: [0, 2, 3, 5, 7, 8, 10, 12], pace: 0.62 }, // winter: E aeolian, slower
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  private out: GainNode;
  private wait = 6;
  on = true;

  constructor(private ac: AudioContext) {
    this.out = ac.createGain();
    this.out.gain.value = 0.11;
    this.out.connect(ac.destination);
  }

  setOn(on: boolean): void {
    this.on = on;
    this.out.gain.setTargetAtTime(on ? 0.11 : 0, this.ac.currentTime, 0.4);
  }

  update(dt: number, season: Season, running: boolean): void {
    if (!this.on || !running) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const length = this.phrase(season);
    // A long rest between phrases: music as a visitor, not a soundtrack.
    this.wait = length + 18 + Math.random() * 25;
  }

  /** Plays one phrase; returns how long it lasts in seconds. */
  private phrase(season: Season): number {
    const m = MODES[season];
    const t0 = this.ac.currentTime + 0.1;
    const notes = 6 + Math.floor(Math.random() * 4);
    let degree = Math.floor(Math.random() * 3) + 2;
    let t = t0;
    for (let i = 0; i < notes; i++) {
      // A gentle random walk, ending on the root.
      if (i === notes - 1) degree = Math.random() < 0.5 ? 0 : 7;
      else degree = Math.max(0, Math.min(m.steps.length - 1, degree + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      const long = i === notes - 1 || Math.random() < 0.25;
      const d = m.pace * (long ? 2 : 1);
      this.recorder(hz(m.root + m.steps[degree]), t, d);
      if (i % 3 === 0) this.pluck(hz(m.root - 12), t);
      if (i % 3 === 0) this.pluck(hz(m.root - 5), t + m.pace * 0.5);
      t += d;
    }
    return t - t0;
  }

  /** A soft breathy tone with a little vibrato. */
  private recorder(f: number, t: number, d: number): void {
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const vib = ac.createOscillator();
    vib.frequency.value = 5;
    const vibAmt = ac.createGain();
    vibAmt.gain.value = f * 0.004;
    vib.connect(vibAmt).connect(o.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.06);
    g.gain.setValueAtTime(0.5, t + d * 0.7);
    g.gain.linearRampToValueAtTime(0, t + d * 0.98);
    o.connect(g).connect(this.out);
    o.start(t);
    vib.start(t);
    o.stop(t + d);
    vib.stop(t + d);
  }

  /** A lute-like pluck that dies away. */
  private pluck(f: number, t: number): void {
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 1.25);
  }
}
