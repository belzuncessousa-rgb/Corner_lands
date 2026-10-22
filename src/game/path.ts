import { BUILDINGS, COBBLE_TILES_PER_DAY, OFFROAD_TILES_PER_DAY, ROAD_TILES_PER_DAY, STONE_ROAD_TILES_PER_DAY } from './data';
import type { GameState } from './types';

let gScore = new Float32Array(0);
let fromArr = new Int32Array(0);
let closed = new Uint8Array(0);
let stamp = new Uint32Array(0);
let curStamp = 0;

export class Heap {
  ids: number[] = [];
  pri: number[] = [];
  push(id: number, p: number): void {
    const ids = this.ids;
    const pri = this.pri;
    let i = ids.length;
    ids.push(id);
    pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      ids[i] = ids[parent];
      pri[i] = pri[parent];
      i = parent;
    }
    ids[i] = id;
    pri[i] = p;
  }
  pop(): number {
    const ids = this.ids;
    const pri = this.pri;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastP = pri.pop()!;
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mp = lastP;
        if (l < n && pri[l] < mp) {
          m = l;
          mp = pri[l];
        }
        if (r < n && pri[r] < mp) m = r;
        if (m === i) break;
        ids[i] = ids[m];
        pri[i] = pri[m];
        i = m;
      }
      ids[i] = lastId;
      pri[i] = lastP;
    }
    return top;
  }
  get size(): number {
    return this.ids.length;
  }
}

/** Woods slow walkers off the road by this much more: a little, not so much that gathering in them stops paying. */
export const WOODS_SLOWDOWN = 1.15;

/**
 * Time to cross a tile, in dirt-road tiles: what walkers take, what the
 * paths minimise and what the workplaces' travel times count.
 */
/** The Royal Road: going is 30% quicker than on cobbles. */
export const ROYAL_ROAD_PACE = 1.3;

export function tileCost(s: GameState, i: number): number {
  const r = s.road[i];
  if (r === 4) return ROAD_TILES_PER_DAY / (COBBLE_TILES_PER_DAY * ROYAL_ROAD_PACE);
  if (r === 3) return ROAD_TILES_PER_DAY / COBBLE_TILES_PER_DAY;
  if (r === 2) return ROAD_TILES_PER_DAY / STONE_ROAD_TILES_PER_DAY;
  if (r) return 1;
  const off = ROAD_TILES_PER_DAY / OFFROAD_TILES_PER_DAY;
  return s.trees[i] ? off * WOODS_SLOWDOWN : off;
}

/** The quickest going anywhere on the map, so A* never overestimates what is left. */
function cheapestTile(s: GameState): number {
  let best = 1;
  for (let i = 0; i < s.road.length; i++) {
    if (s.road[i] === 4) return ROAD_TILES_PER_DAY / (COBBLE_TILES_PER_DAY * ROYAL_ROAD_PACE);
    if (s.road[i] === 3) best = Math.min(best, ROAD_TILES_PER_DAY / COBBLE_TILES_PER_DAY);
    if (s.road[i] === 2) best = Math.min(best, ROAD_TILES_PER_DAY / STONE_ROAD_TILES_PER_DAY);
  }
  return best;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

/**
 * A* over the tile grid for the quickest walk (time, not distance). Buildings
 * block movement except the ones listed in `allowIds` (start/goal buildings).
 * Returns tile indices from start (exclusive) to goal (inclusive), or null.
 */
export function findPath(
  s: GameState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  allowIds: number[] = [],
  maxNodes = 12000,
): number[] | null {
  const W = s.width;
  const H = s.height;
  const n = W * H;
  if (gScore.length !== n) {
    gScore = new Float32Array(n);
    fromArr = new Int32Array(n);
    closed = new Uint8Array(n);
    stamp = new Uint32Array(n);
  }
  curStamp++;
  const start = sy * W + sx;
  const goal = gy * W + gx;
  if (start === goal) return [];
  // Fields, pastures and orchards can be walked across; posterns lead through the town wall.
  const zones = new Set<number>();
  for (const b of s.buildings) if (BUILDINGS[b.type].zone || (b.type === 'wall' && (b.x + b.y) % 6 === 0)) zones.add(b.id);
  const passable = (i: number) => {
    if (s.terrain[i] === 1 && !s.road[i]) return false;
    const o = s.occ[i];
    return o < 0 || zones.has(o) || allowIds.includes(o) || i === goal;
  };
  const cost = (i: number) => tileCost(s, i);
  const hMin = cheapestTile(s);
  const heap = new Heap();
  stamp[start] = curStamp;
  gScore[start] = 0;
  fromArr[start] = -1;
  closed[start] = 0;
  heap.push(start, 0);
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) {
      const out: number[] = [];
      let c = cur;
      while (c !== start) {
        out.push(c);
        c = fromArr[c];
      }
      return out.reverse();
    }
    if (closed[cur] && stamp[cur] === curStamp) continue;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy, dl] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (!passable(ni)) continue;
      // No corner cutting.
      if (dx && dy && (!passable(cy * W + nx) || !passable(ny * W + cx))) continue;
      const g = gScore[cur] + dl * (cost(ni) + cost(cur)) * 0.5;
      if (stamp[ni] === curStamp && (closed[ni] || gScore[ni] <= g)) continue;
      stamp[ni] = curStamp;
      closed[ni] = 0;
      gScore[ni] = g;
      fromArr[ni] = cur;
      const h = Math.hypot(nx - gx, ny - gy) * hMin;
      heap.push(ni, g + h);
    }
  }
  return null;
}
