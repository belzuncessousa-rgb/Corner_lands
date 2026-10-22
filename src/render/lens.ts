import type { GameState } from '../game/types';

/**
 * The resource lens: what the land holds for gatherers, gathered into
 * patches. The map greys out and each patch gets a little ball saying what
 * is there and about how much, so bushes under the trees, ore
 * in the bogs and game in the woods can be found at a glance.
 */

export type LensKind = 'stone' | 'ore' | 'silver' | 'berries' | 'game' | 'fish';

export interface LensGroup {
  kind: LensKind;
  /** Middle of the patch, in tiles. */
  x: number;
  y: number;
  /** How much is there now: outcrops for rock and ore, berries, animals or fish. */
  n: number;
  /** Whether the amount comes and goes (bushes regrow, herds breed), so is shown as "about". */
  varies: boolean;
}

export interface LensData {
  groups: LensGroup[];
  /** Tiles to light up, by kind (tile indices). */
  tiles: Partial<Record<LensKind, number[]>>;
  /** Herds and shoals: where they keep and how far about, in tiles. */
  rings: { kind: LensKind; x: number; y: number; r: number }[];
}

/** Colours of each kind on the greyed map. */
export const LENS_COLORS: Record<LensKind, string> = {
  stone: '#d8d4c8',
  ore: '#d0804a',
  silver: '#e8f0ff',
  berries: '#e0405a',
  game: '#b07a40',
  fish: '#50b0e8',
};

/** Tiles further apart than this (in a straight line) belong to different patches. */
const LINK = 2;
/** A patch wider than this is split into parts this wide, so the numbers say where. */
const SPLIT = 12;

/** The lens for the land as it is now. */
export function lensData(s: GameState): LensData {
  const W = s.width;
  const tiles: Partial<Record<LensKind, number[]>> = { stone: [], ore: [], silver: [], berries: [] };
  const amount = new Map<number, number>();
  const silver = new Set(s.silver ?? []);
  for (let i = 0; i < s.terrain.length; i++) {
    if (s.occ[i] >= 0) continue;
    if (silver.has(i)) tiles.silver!.push(i);
    else if (s.rock[i]) tiles.stone!.push(i);
    else if (s.ore[i]) tiles.ore!.push(i);
    if (s.berriesMax[i]) tiles.berries!.push(i);
  }
  const groups: LensGroup[] = [];
  for (const kind of ['stone', 'ore', 'silver', 'berries'] as const) {
    const list = tiles[kind]!;
    const value = (i: number) => (kind === 'berries' ? s.berries[i] : 1);
    for (const patch of patches(list, W)) {
      // Split a wide patch by a grid, so a big one reads part by part.
      const xs = patch.map((i) => i % W);
      const ys = patch.map((i) => (i / W) | 0);
      const wide = Math.max(...xs) - Math.min(...xs) > SPLIT + 2 || Math.max(...ys) - Math.min(...ys) > SPLIT + 2;
      const parts = new Map<number, number[]>();
      for (const i of patch) {
        const key = wide ? Math.floor((i % W) / SPLIT) * 1000 + Math.floor(((i / W) | 0) / SPLIT) : 0;
        let p = parts.get(key);
        if (!p) parts.set(key, (p = []));
        p.push(i);
      }
      for (const part of parts.values()) {
        let n = 0;
        let sx = 0;
        let sy = 0;
        for (const i of part) {
          n += value(i);
          amount.set(i, value(i));
          sx += (i % W) + 0.5;
          sy += ((i / W) | 0) + 0.5;
        }
        groups.push({ kind, x: sx / part.length, y: sy / part.length, n, varies: kind === 'berries' });
      }
    }
  }
  const rings: LensData['rings'] = [];
  for (const h of s.herds ?? []) {
    groups.push({ kind: 'game', x: h.x, y: h.y, n: h.n, varies: true });
    rings.push({ kind: 'game', x: h.x, y: h.y, r: 3 });
  }
  for (const sh of s.shoals ?? []) {
    groups.push({ kind: 'fish', x: sh.x, y: sh.y, n: sh.n, varies: true });
    rings.push({ kind: 'fish', x: sh.x, y: sh.y, r: 2 });
  }
  return { groups, tiles, rings };
}

/** Tiles joined into patches: two tiles are in the same patch if a chain of near neighbours links them. */
function patches(list: number[], W: number): number[][] {
  const left = new Set(list);
  const out: number[][] = [];
  for (const start of list) {
    if (!left.has(start)) continue;
    left.delete(start);
    const patch = [start];
    for (let k = 0; k < patch.length; k++) {
      const x = patch[k] % W;
      const y = (patch[k] / W) | 0;
      for (let dy = -LINK; dy <= LINK; dy++)
        for (let dx = -LINK; dx <= LINK; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const j = (y + dy) * W + nx;
          if (left.has(j)) {
            left.delete(j);
            patch.push(j);
          }
        }
    }
    out.push(patch);
  }
  return out;
}

/** The number on a ball: exact for outcrops, rounded and marked "about" for what comes and goes. */
export function lensCount(g: LensGroup): string {
  const n = Math.floor(g.n);
  if (!g.varies) return String(n);
  if (n < 10) return `~${n}`;
  return `~${Math.round(n / 5) * 5}`;
}

/** What a kind is called, for the lens's key. */
export const LENS_NAMES: Record<LensKind, string> = {
  stone: 'Rock (outcrops)',
  ore: 'Bog ore',
  silver: 'Silver veins',
  berries: 'Berries',
  game: 'Game',
  fish: 'Fish',
};
