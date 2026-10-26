import { seasonOf } from '../game/sim';
import type { GameState } from '../game/types';
import { idx, inBounds } from '../game/world';

export interface Animal {
  kind: 'deer' | 'rabbit' | 'bear' | 'turtle';
  /** The herd this animal belongs to (index into the game's herds); -1 for the bear and turtles, seen but never hunted. */
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
  /** Seconds left before a visitor (the bear, a turtle) moves on. */
  life?: number;
  /** The bear rearing up on its hind legs to sniff the air: seconds left. */
  rear?: number;
  /** A turtle sliding into the water. */
  swim?: boolean;
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
    this.bearIn = 60 + Math.random() * 120;
    this.turtlesIn = 10 + Math.random() * 30;
  }

  /** Seconds until a bear may next wander out of the woods, and until turtles next come up to bask. */
  private bearIn = 60 + Math.random() * 120;
  private turtlesIn = 10 + Math.random() * 30;

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

  /**
   * `inView` is a random tile on screen, if the caller knows: the bear comes
   * out where it can be seen.
   */
  update(s: GameState, dt: number, inView?: () => [number, number]): void {
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
    this.visitors(s, dt, inView);
    for (const a of this.animals) {
      if (a.herd < 0) continue;
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

  private water(s: GameState, x: number, y: number): boolean {
    return inBounds(s, x, y) && s.terrain[idx(s, x, y)] === 1;
  }

  /** Trees standing within a tile or two: the edge of the woods has some, open ground none. */
  private woods(s: GameState, x: number, y: number): number {
    let n = 0;
    for (let yy = Math.floor(y) - 2; yy <= y + 2; yy++) for (let xx = Math.floor(x) - 2; xx <= x + 2; xx++) if (inBounds(s, xx, yy) && s.trees[idx(s, xx, yy)]) n++;
    return n;
  }

  /** Open ground on the edge of thick woods, far from the town: where the bear can be seen. */
  private edge(s: GameState, x: number, y: number, r: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    // Nothing standing just in front of it (lower on the screen), or the trees would hide it.
    const clear = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2]].every(([dx, dy]) => !inBounds(s, tx + dx, ty + dy) || !s.trees[idx(s, tx + dx, ty + dy)]);
    return this.walkable(s, tx, ty) && clear && this.woods(s, x, y) >= 6 && !this.disturbed(s, x, y, r);
  }

  /** A bare tile of land beside the water, where turtles bask. */
  private shore(s: GameState, x: number, y: number): boolean {
    if (!this.walkable(s, x, y) || s.trees[idx(s, x, y)]) return false;
    return this.water(s, x + 1, y) || this.water(s, x - 1, y) || this.water(s, x, y + 1) || this.water(s, x, y - 1);
  }

  /**
   * Now and then a lone bear ambles along the edge of the deep woods, far from
   * any building, and goes back in; in the warm months a few turtles crawl out
   * on a quiet shore to bask, and slip back into the water one by one.
   */
  private visitors(s: GameState, dt: number, inView?: () => [number, number]): void {
    const winter = seasonOf(s.day) === 3;
    // The bear.
    const bear = this.animals.find((a) => a.kind === 'bear');
    if (!bear && !winter && (this.bearIn -= dt) <= 0) {
      this.bearIn = 150 + Math.random() * 300;
      let found = false;
      // Somewhere on screen first, then anywhere; if there is nowhere quiet enough, look again soon.
      for (let tries = 0; tries < 800 && !found; tries++) {
        const near = !!inView && tries < 400;
        const [vx, vy] = near ? inView!() : [Math.random() * s.width, Math.random() * s.height];
        const x = Math.floor(vx);
        const y = Math.floor(vy);
        if (!this.edge(s, x + 0.5, y + 0.5, near ? 5 : 7)) continue;
        this.animals.push({ kind: 'bear', herd: -1, x: x + 0.5, y: y + 0.5, tx: x + 0.5, ty: y + 0.5, timer: 2, dir: 1, step: 0, alpha: 0, leaving: false, grazing: true, life: 50 + Math.random() * 60 });
        found = true;
      }
      if (!found) this.bearIn = 20 + Math.random() * 20;
    }
    // The turtles.
    const turtles = this.animals.filter((a) => a.kind === 'turtle');
    if (!turtles.length && !winter && (this.turtlesIn -= dt) <= 0) {
      this.turtlesIn = 60 + Math.random() * 160;
      for (let tries = 0; tries < 200; tries++) {
        const x = Math.floor(Math.random() * s.width);
        const y = Math.floor(Math.random() * s.height);
        if (!this.shore(s, x, y) || this.disturbed(s, x, y, 3)) continue;
        // Along the water's edge, side by side, facing the sun.
        const [wx, wy] = this.toWater(s, x, y);
        const n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          const along = (k - (n - 1) / 2) * 0.32 + (Math.random() - 0.5) * 0.1;
          const px = x + 0.5 + wx * 0.44 + wy * along;
          const py = y + 0.5 + wy * 0.44 + wx * along;
          this.animals.push({ kind: 'turtle', herd: -1, x: px, y: py, tx: px, ty: py, timer: 3 + Math.random() * 6, dir: Math.random() < 0.5 ? 1 : -1, step: 0, alpha: 0, leaving: false, grazing: true, life: 70 + Math.random() * 120 });
        }
        break;
      }
    }
    for (const a of this.animals) {
      if (a.herd >= 0) continue;
      a.alpha = a.leaving ? Math.max(0, a.alpha - dt * (a.swim ? 0.9 : 0.5)) : Math.min(1, a.alpha + dt * 0.5);
      a.life = (a.life ?? 0) - dt;
      if (!a.leaving && (a.life <= 0 || winter || this.disturbed(s, a.x, a.y, a.kind === 'bear' ? 4 : 2))) {
        if (a.kind === 'turtle') this.slip(s, a);
        else this.bolt(a);
      }
      if (a.rear !== undefined) {
        a.rear -= dt;
        if (a.rear <= 0) a.rear = undefined;
        continue;
      }
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.02) {
        const speed = a.kind === 'bear' ? (a.leaving ? 0.9 : 0.32) : a.swim ? 0.18 : 0.07;
        const m = Math.min(d, speed * dt);
        a.x += (dx / d) * m;
        a.y += (dy / d) * m;
        if (Math.abs(dx - dy) > 0.01) a.dir = dx - dy > 0 ? 1 : -1;
        a.step += dt * (a.kind === 'bear' ? 5 : 3);
        a.grazing = false;
        continue;
      }
      a.grazing = true;
      if (a.leaving || (a.timer -= dt) > 0) continue;
      if (a.kind === 'bear') {
        a.timer = 2 + Math.random() * 5;
        // Now and then it rears up to sniff the air; otherwise it noses along the edge of the woods.
        if (Math.random() < 0.18) {
          a.rear = 2.2;
          continue;
        }
        for (let tries = 0; tries < 12; tries++) {
          const x = a.x + (Math.random() * 2 - 1) * 2.5;
          const y = a.y + (Math.random() * 2 - 1) * 2.5;
          if (!this.edge(s, x, y, 5)) continue;
          a.tx = x;
          a.ty = y;
          break;
        }
      } else {
        // A turtle shuffles a few steps along the shore, or turns to face the sun.
        a.timer = 4 + Math.random() * 9;
        const x = a.x + (Math.random() * 2 - 1) * 0.25;
        const y = a.y + (Math.random() * 2 - 1) * 0.25;
        if (Math.floor(x) === Math.floor(a.x) && Math.floor(y) === Math.floor(a.y) && this.shore(s, Math.floor(x), Math.floor(y))) {
          a.tx = x;
          a.ty = y;
        } else a.dir = -a.dir;
      }
    }
  }

  /** Which way the water lies from a shore tile. */
  private toWater(s: GameState, x: number, y: number): [number, number] {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) if (this.water(s, x + dx, y + dy)) return [dx, dy];
    return [0, 1];
  }

  /** A turtle slides off into the nearest water. */
  private slip(s: GameState, a: Animal): void {
    a.leaving = true;
    a.swim = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.water(s, Math.floor(a.x) + dx, Math.floor(a.y) + dy)) {
        a.tx = a.x + dx * 0.9;
        a.ty = a.y + dy * 0.9;
        return;
      }
    }
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
