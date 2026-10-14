import type { GameState } from '../game/types';
import { idx, inBounds } from '../game/world';

export interface Animal {
  kind: 'deer';
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

const TARGET = 12;

/** Cosmetic deer that graze at forest edges and shy away from people. */
export class Wildlife {
  animals: Animal[] = [];
  private spawnTimer = 0;

  reset(): void {
    this.animals = [];
  }

  private walkable(s: GameState, x: number, y: number): boolean {
    if (!inBounds(s, x, y)) return false;
    const i = idx(s, x, y);
    return s.terrain[i] === 0 && s.occ[i] < 0 && !s.road[i];
  }

  /** True when buildings or roads are close, which scares deer off. */
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

  private spawn(s: GameState): void {
    for (let tries = 0; tries < 40; tries++) {
      const x = Math.floor(Math.random() * s.width);
      const y = Math.floor(Math.random() * s.height);
      if (!this.walkable(s, x, y)) continue;
      // Forest edge: open tile beside trees.
      const i = idx(s, x, y);
      if (s.trees[i] > 1) continue;
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(s, x + dx, y + dy) && s.trees[idx(s, x + dx, y + dy)]) near++;
      if (near < 3 || this.disturbed(s, x, y, 5)) continue;
      const herd = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < herd; k++) {
        const ax = x + 0.3 + Math.random() * 0.5;
        const ay = y + 0.3 + Math.random() * 0.5;
        this.animals.push({ kind: 'deer', x: ax, y: ay, tx: ax, ty: ay, timer: Math.random() * 3, dir: Math.random() < 0.5 ? 1 : -1, step: 0, alpha: 0, leaving: false, grazing: true });
      }
      return;
    }
  }

  update(s: GameState, dt: number): void {
    if (dt <= 0) return;
    this.spawnTimer -= dt;
    const alive = this.animals.filter((a) => !a.leaving).length;
    if (this.spawnTimer <= 0 && alive < TARGET) {
      this.spawn(s);
      this.spawnTimer = 4;
    }
    for (const a of this.animals) {
      a.alpha = a.leaving ? Math.max(0, a.alpha - dt * 0.7) : Math.min(1, a.alpha + dt * 0.7);
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.02) {
        const speed = a.leaving ? 1.6 : 0.45;
        const m = Math.min(d, speed * dt);
        a.x += (dx / d) * m;
        a.y += (dy / d) * m;
        if (Math.abs(dx - dy) > 0.01) a.dir = dx - dy > 0 ? 1 : -1;
        a.step += dt * (a.leaving ? 14 : 6);
        a.grazing = false;
        continue;
      }
      a.grazing = true;
      a.timer -= dt;
      if (a.timer > 0) continue;
      a.timer = 2 + Math.random() * 5;
      if (this.disturbed(s, a.x, a.y, 3)) {
        // Bolt away and vanish into the woods.
        a.leaving = true;
        const ang = Math.random() * Math.PI * 2;
        a.tx = a.x + Math.cos(ang) * 4;
        a.ty = a.y + Math.sin(ang) * 4;
        continue;
      }
      if (Math.random() < 0.6) {
        const nx = a.x + (Math.random() - 0.5) * 2.5;
        const ny = a.y + (Math.random() - 0.5) * 2.5;
        if (this.walkable(s, Math.floor(nx), Math.floor(ny))) {
          a.tx = nx;
          a.ty = ny;
        }
      }
    }
    this.animals = this.animals.filter((a) => !(a.leaving && a.alpha <= 0));
  }
}
