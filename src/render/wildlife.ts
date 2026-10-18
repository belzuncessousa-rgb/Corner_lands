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
const SHOWN = { deer: 3, rabbit: 3 };

/**
 * The game's herds, seen: a few deer or rabbits graze about each herd's
 * home, follow it when it moves on, grow fewer as it is hunted and bolt from
 * anyone building close by.
 */
export class Wildlife {
  animals: Animal[] = [];

  reset(): void {
    this.animals = [];
    this.seen.clear();
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

  /** A free spot within `r` tiles of a herd's home, away from buildings and roads. */
  private near(s: GameState, cx: number, cy: number, r: number): { x: number; y: number } | null {
    // Glades and edges first, where the animals can be seen; deep wood if need be.
    let fallback: { x: number; y: number } | null = null;
    for (let tries = 0; tries < 24; tries++) {
      const x = cx + (Math.random() * 2 - 1) * r;
      const y = cy + (Math.random() * 2 - 1) * r;
      if (!this.walkable(s, Math.floor(x), Math.floor(y)) || this.disturbed(s, x, y, 1.5)) continue;
      if (s.trees[idx(s, Math.floor(x), Math.floor(y))] <= 1) return { x, y };
      fallback ??= { x, y };
    }
    return fallback;
  }

  update(s: GameState, dt: number): void {
    if (dt <= 0) return;
    const herds = s.herds ?? [];
    // Keep each herd's animals in step with its size. They stay in sight: a
    // herd seen for the first time is there at once, a newborn appears beside
    // the others, and only the hunted leave.
    herds.forEach((h, hi) => {
      const mine = this.animals.filter((a) => a.herd === hi && !a.leaving);
      const want = h.n < 1 ? 0 : Math.min(SHOWN[h.kind], Math.ceil(h.n / (h.kind === 'deer' ? 2 : 3)));
      if (mine.length > want) {
        for (const a of mine.slice(want)) this.bolt(a);
        return;
      }
      const first = !this.seen.has(hi);
      this.seen.add(hi);
      for (let k = mine.length; k < want; k++) {
        if (!first && Math.random() > dt * 0.2) break;
        const by = mine[0];
        const p = by ? this.near(s, by.x, by.y, 1) : this.near(s, h.x, h.y, h.kind === 'deer' ? 3 : 2);
        if (!p) break;
        const a: Animal = { kind: h.kind, herd: hi, x: p.x, y: p.y, tx: p.x, ty: p.y, timer: Math.random() * 3, dir: Math.random() < 0.5 ? 1 : -1, step: 0, alpha: first ? 1 : 0, leaving: false, grazing: true };
        this.animals.push(a);
        mine.push(a);
      }
    });
    for (const a of this.animals) {
      a.alpha = a.leaving ? Math.max(0, a.alpha - dt * 0.7) : Math.min(1, a.alpha + dt * 0.7);
      const h = herds[a.herd];
      // A herd that has moved on: everyone sets off for the new home together.
      const away = !!h && !a.leaving && Math.hypot(h.x - a.x, h.y - a.y) > 4.5;
      if (away && Math.hypot(a.tx - h.x, a.ty - h.y) > 3) {
        const p = this.near(s, h.x, h.y, 2) ?? { x: h.x, y: h.y };
        a.tx = p.x;
        a.ty = p.y;
      }
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.02) {
        const speed = a.leaving ? 1.6 : away ? 1.1 : a.kind === 'rabbit' ? 0.8 : 0.45;
        const m = Math.min(d, speed * dt);
        a.x += (dx / d) * m;
        a.y += (dy / d) * m;
        if (Math.abs(dx - dy) > 0.01) a.dir = dx - dy > 0 ? 1 : -1;
        a.step += dt * (a.leaving || away ? 14 : a.kind === 'rabbit' ? 10 : 6);
        a.grazing = false;
        continue;
      }
      a.grazing = true;
      a.timer -= dt;
      if (a.timer > 0) continue;
      a.timer = (a.kind === 'rabbit' ? 1 : 2) + Math.random() * 5;
      if (!h) {
        this.bolt(a);
        continue;
      }
      // Wander about the herd's home, keeping away from the town.
      const crowded = this.disturbed(s, a.x, a.y, 1.5);
      const p = crowded ? this.near(s, h.x, h.y, 3) : Math.random() < 0.6 ? this.near(s, a.x, a.y, a.kind === 'rabbit' ? 1 : 1.3) : null;
      if (p && Math.hypot(p.x - h.x, p.y - h.y) < 4) {
        a.tx = p.x;
        a.ty = p.y;
      }
    }
    this.animals = this.animals.filter((a) => !(a.leaving && a.alpha <= 0));
  }

  /** Herds already shown (their animals were there from the start). */
  private seen = new Set<number>();

  /** A hunted animal leaves the herd. */
  private bolt(a: Animal): void {
    if (a.leaving) return;
    a.leaving = true;
    const ang = Math.random() * Math.PI * 2;
    a.tx = a.x + Math.cos(ang) * 4;
    a.ty = a.y + Math.sin(ang) * 4;
  }
}
