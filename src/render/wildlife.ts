import type { GameState } from '../game/types';
import { idx, inBounds } from '../game/world';

export interface Animal {
  kind: 'deer' | 'rabbit';
  /** The herd this animal belongs to (index into the game's herds). */
  herd: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  timer: number;
  dir: number;
  step: number;
  /** 0..1, fades in on spawn and out when leaving. */
  alpha: number;
  leaving: boolean;
  grazing: boolean;
}

/** Most animals shown for one herd (the rest are out of sight in the woods). */
const SHOWN = { deer: 4, rabbit: 5 };

/**
 * The game's herds, seen: a few deer or rabbits graze about each herd's
 * home, follow it when it moves on, grow fewer as it is hunted and bolt from
 * anyone building close by.
 */
export class Wildlife {
  animals: Animal[] = [];

  reset(): void {
    this.animals = [];
  }

  private walkable(s: GameState, x: number, y: number): boolean {
    if (!inBounds(s, x, y)) return false;
    const i = idx(s, x, y);
    return s.terrain[i] === 0 && s.occ[i] < 0 && !s.road[i];
  }

  /** True when buildings or roads are close, which scares game off. */
  private disturbed(s: GameState, x: number, y: number, r: number): boolean {
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) {
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (!inBounds(s, xx, yy)) continue;
        const i = idx(s, xx, yy);
        if (s.occ[i] >= 0 || s.road[i]) return true;
      }
    }
    return false;
  }

  /** A free spot within `r` tiles of a herd's home. */
  private near(s: GameState, cx: number, cy: number, r: number): { x: number; y: number } | null {
    // Glades and edges first, where the animals can be seen; deep wood if need be.
    let fallback: { x: number; y: number } | null = null;
    for (let tries = 0; tries < 24; tries++) {
      const x = cx + (Math.random() * 2 - 1) * r;
      const y = cy + (Math.random() * 2 - 1) * r;
      if (!this.walkable(s, Math.floor(x), Math.floor(y))) continue;
      if (s.trees[idx(s, Math.floor(x), Math.floor(y))] <= 1) return { x, y };
      fallback ??= { x, y };
    }
    return fallback;
  }

  update(s: GameState, dt: number): void {
    if (dt <= 0) return;
    const herds = s.herds ?? [];
    // Keep each herd's shown animals in step with its size.
    herds.forEach((h, hi) => {
      const mine = this.animals.filter((a) => a.herd === hi && !a.leaving);
      const want = h.n < 1 ? 0 : Math.min(SHOWN[h.kind], Math.ceil(h.n / (h.kind === 'deer' ? 2 : 3)));
      if (mine.length > want) {
        for (const a of mine.slice(want)) this.bolt(a);
      } else if (mine.length < want && Math.random() < dt * 0.5) {
        const p = this.near(s, h.x, h.y, h.kind === 'deer' ? 3.5 : 2.5);
        if (p) this.animals.push({ kind: h.kind, herd: hi, x: p.x, y: p.y, tx: p.x, ty: p.y, timer: Math.random() * 3, dir: Math.random() < 0.5 ? 1 : -1, step: 0, alpha: 0, leaving: false, grazing: true });
      }
    });
    for (const a of this.animals) {
      a.alpha = a.leaving ? Math.max(0, a.alpha - dt * 0.7) : Math.min(1, a.alpha + dt * 0.7);
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.02) {
        const speed = a.leaving ? 1.6 : a.kind === 'rabbit' ? 0.8 : 0.45;
        const m = Math.min(d, speed * dt);
        a.x += (dx / d) * m;
        a.y += (dy / d) * m;
        if (Math.abs(dx - dy) > 0.01) a.dir = dx - dy > 0 ? 1 : -1;
        a.step += dt * (a.leaving ? 14 : a.kind === 'rabbit' ? 10 : 6);
        a.grazing = false;
        continue;
      }
      a.grazing = true;
      a.timer -= dt;
      if (a.timer > 0) continue;
      a.timer = (a.kind === 'rabbit' ? 1 : 2) + Math.random() * 5;
      if (this.disturbed(s, a.x, a.y, 1.5)) {
        this.bolt(a);
        continue;
      }
      // Wander about the herd's home, following it if it has moved on.
      const h = herds[a.herd];
      if (!h) {
        this.bolt(a);
        continue;
      }
      const far = Math.hypot(h.x - a.x, h.y - a.y) > 4;
      const p = far ? this.near(s, h.x, h.y, 2.5) : Math.random() < 0.6 ? this.near(s, a.x, a.y, a.kind === 'rabbit' ? 1 : 1.3) : null;
      if (p && Math.hypot(p.x - h.x, p.y - h.y) < 4) {
        a.tx = p.x;
        a.ty = p.y;
      }
    }
    this.animals = this.animals.filter((a) => !(a.leaving && a.alpha <= 0));
  }

  /** Bolts away and vanishes into the woods. */
  private bolt(a: Animal): void {
    if (a.leaving) return;
    a.leaving = true;
    const ang = Math.random() * Math.PI * 2;
    a.tx = a.x + Math.cos(ang) * 4;
    a.ty = a.y + Math.sin(ang) * 4;
  }
}
