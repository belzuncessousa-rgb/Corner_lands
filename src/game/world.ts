import { BUILDINGS } from './data';
import { fbm, mulberry32 } from './rng';
import type { Building, BuildingType, GameState, Land, Resources } from './types';
import { RESOURCE_IDS } from './types';

export const MAP_SIZE = 80;

export function idx(s: { width: number }, x: number, y: number): number {
  return y * s.width + x;
}

export function inBounds(s: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.width && y < s.height;
}

export function emptyResources(): Resources {
  const r = {} as Resources;
  for (const id of RESOURCE_IDS) r[id] = 0;
  return r;
}

export function makeBuilding(id: number, type: BuildingType, x: number, y: number): Building {
  const d = BUILDINGS[type];
  return {
    id,
    type,
    x,
    y,
    w: d.w,
    h: d.h,
    level: 1,
    build: 0,
    workers: 0,
    residents: 0,
    work: 0,
    growth: 0,
    paused: false,
    blocked: 0,
    status: '',
    lastOutput: 0,
    output: 0,
  };
}

/** Generates a fresh map and initial settlement. */
/** How each kind of land is described when choosing where to found a town. */
export const LANDS: Record<Land, { name: string; desc: string }> = {
  meadow: { name: 'Meadows', desc: 'Rolling land with woods, lakes and a river: a little of everything.' },
  valley: { name: 'River valley', desc: 'A broad river with islands and shallow fords; rich soil along the banks, little stone.' },
  hills: { name: 'Hills', desc: 'Stony upland with more rock and ore, thin soil and only a stream.' },
};

export function generateWorld(seed: number, opts: { relaxed?: boolean; hardy?: boolean; land?: Land } = {}): GameState {
  const land: Land = opts.land ?? 'meadow';
  const W = MAP_SIZE;
  const H = MAP_SIZE;
  const n = W * H;
  const rand = mulberry32(seed);
  const s: GameState = {
    version: 1,
    seed,
    width: W,
    height: H,
    terrain: new Uint8Array(n),
    trees: new Uint8Array(n),
    rock: new Uint8Array(n),
    ore: new Uint8Array(n),
    berries: new Uint8Array(n),
    berriesMax: new Uint8Array(n),
    fertility: new Float32Array(n),
    road: new Uint8Array(n),
    occ: new Int32Array(n).fill(-1),
    variant: new Uint8Array(n),
    buildings: [],
    nextId: 1,
    res: emptyResources(),
    day: 0,
    population: 8,
    happiness: 60,
    happinessTarget: 60,
    happinessFactors: [],
    taxLevel: 2,
    tier: 0,
    quests: [],
    messages: [],
    report: { eaten: 0, shortage: 0, variety: 0, cold: false, taxes: 0, arrived: 0, left: 0 },
    rngState: (seed * 7919) >>> 0,
    incoming: 0,
    history: [],
    dirty: true,
  };

  for (let i = 0; i < n; i++) s.variant[i] = Math.floor(rand() * 256);

  // --- Water: a meandering river plus noise lakes.
  const lakeSeed = seed + 11;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = fbm(x / 16, y / 16, lakeSeed, 4);
      // Hills hold few lakes; a valley's water is all in its river.
      if (h < (land === 'hills' ? 0.22 : land === 'valley' ? 0.18 : 0.3)) s.terrain[idx(s, x, y)] = 1;
    }
  }
  const vertical = rand() < 0.5;
  let rx = W * (0.2 + rand() * 0.6);
  let dir = 0;
  for (let t = 0; t < (vertical ? H : W); t++) {
    dir += (rand() - 0.5) * 0.35;
    dir = Math.max(-0.9, Math.min(0.9, dir * 0.96));
    rx += dir;
    rx = Math.max(4, Math.min((vertical ? W : H) - 5, rx));
    const width = land === 'valley' ? 3.5 + fbm(t / 9, 3, seed + 5, 2) * 2.5 : land === 'hills' ? 0.7 + fbm(t / 9, 3, seed + 5, 2) * 0.6 : 1.2 + fbm(t / 9, 3, seed + 5, 2) * 1.6;
    if (land === 'valley') {
      // Islands in mid-stream, and every so often a ford: shallows to walk across.
      const island = fbm(t / 6, 9, seed + 13, 2) > 0.68;
      const ford = t % 23 === 11 || t % 23 === 12;
      for (let o = -6; o <= 6; o++) {
        const along = Math.round(rx + o);
        const off = Math.abs(o + (rx - Math.round(rx)));
        if (off > width) continue;
        const x = vertical ? along : t;
        const y = vertical ? t : along;
        if (!inBounds(s, x, y)) continue;
        s.terrain[idx(s, x, y)] = ford || (island && off < width - 2.2) ? 0 : 1;
      }
      continue;
    }
    for (let o = -3; o <= 3; o++) {
      const along = Math.round(rx + o);
      if (Math.abs(o + (rx - Math.round(rx))) > width) continue;
      const x = vertical ? along : t;
      const y = vertical ? t : along;
      if (inBounds(s, x, y)) s.terrain[idx(s, x, y)] = 1;
    }
  }

  // --- Fertility.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const f = fbm(x / 12, y / 12, seed + 31, 3);
      let fert = (f - 0.25) * 1.8;
      if (land === 'hills') fert *= 0.7;
      s.fertility[idx(s, x, y)] = Math.max(0.15, Math.min(1, fert));
    }
  }

  // --- Choose the settlement site: near the centre, dry land around.
  const site = findSite(s, rand);

  // --- Forests.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(s, x, y);
      if (s.terrain[i] !== 0) continue;
      const f = fbm(x / 9, y / 9, seed + 77, 4);
      const d = Math.hypot(x - site.x - 1, y - site.y - 1);
      if (d < 6) continue;
      if (f > 0.52) {
        s.trees[i] = Math.min(4, 1 + Math.floor((f - 0.52) * 18));
      } else if (f > 0.45 && rand() < 0.12) {
        s.trees[i] = 1;
      }
    }
  }

  // --- Rock and ore deposits.
  const placeDeposit = (arr: Uint8Array, cx: number, cy: number, r: number, amount: number) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!inBounds(s, x, y)) continue;
        const i = idx(s, x, y);
        if (s.terrain[i] !== 0) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + 0.3 || rand() < d / (r + 1) - 0.2) continue;
        arr[i] = Math.round(amount * (0.6 + rand() * 0.4));
        s.trees[i] = 0;
      }
    }
  };
  // Land reachable from the site on foot, without bridges.
  const dry = new Uint8Array(n);
  {
    const start = idx(s, site.x + 1, site.y + 1);
    const queue = [start];
    dry[start] = 1;
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (!inBounds(s, nx, ny)) continue;
        const j = idx(s, nx, ny);
        if (dry[j] || s.terrain[j] !== 0) continue;
        dry[j] = 1;
        queue.push(j);
      }
    }
  }
  const depositNear = (arr: Uint8Array, minD: number, maxD: number, r: number, amount: number, sameShore = false) => {
    for (let tries = 0; tries < 300; tries++) {
      const a = rand() * Math.PI * 2;
      const d = minD + rand() * (maxD - minD);
      const x = Math.round(site.x + 1 + Math.cos(a) * d);
      const y = Math.round(site.y + 1 + Math.sin(a) * d);
      if (!inBounds(s, x, y) || s.terrain[idx(s, x, y)] !== 0) continue;
      // The first outcrop must be on the settlers' side of any river.
      if (sameShore && tries < 250 && !dry[idx(s, x, y)]) continue;
      placeDeposit(arr, x, y, r, amount);
      return;
    }
  };
  // Few outcrops, but deep: stone is found in places, not everywhere.
  depositNear(s.rock, 8, 13, 2, 40, true);
  const outcrops = land === 'hills' ? 9 : land === 'valley' ? 2 : 4;
  for (let k = 0; k < outcrops; k++) depositNear(s.rock, 16, 40, 1 + Math.floor(rand() * 2), 45);
  depositNear(s.ore, 14, 22, 1, 30);
  for (let k = 0; k < (land === 'hills' ? 4 : 2); k++) depositNear(s.ore, 20, 40, 1, 35);

  seedNature(s, site, rand);

  // --- The settlers' camp and a stub of road.
  // The settlers' camp: tents and their cart. The manor, if any, comes later.
  const hall = makeBuilding(s.nextId++, 'camp', site.x, site.y);
  hall.build = 1;
  placeBuilding(s, hall);
  const roadY = site.y + 3;
  for (let x = site.x - 2; x <= site.x + 5; x++) {
    if (inBounds(s, x, roadY) && s.terrain[idx(s, x, roadY)] === 0) setRoad(s, x, roadY, true);
  }

  // Valley soil is richest along the banks.
  if (land === 'valley') {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(s, x, y);
        if (s.terrain[i]) continue;
        let near = false;
        for (let dy = -4; dy <= 4 && !near; dy++) for (let dx = -4; dx <= 4 && !near; dx++) near = inBounds(s, x + dx, y + dy) && s.terrain[idx(s, x + dx, y + dy)] === 1;
        if (near) s.fertility[i] = Math.min(1, s.fertility[i] + 0.3);
      }
  }
  if (land !== 'meadow') s.land = land;
  s.res.wood = 70;
  s.res.stone = 20;
  s.res.planks = 0;
  s.res.berries = 40;
  s.res.meat = 20;
  s.res.gold = 100;
  if (opts.relaxed) {
    s.relaxed = true;
    for (const k of ['wood', 'stone', 'berries', 'meat', 'gold'] as const) s.res[k] *= 2;
  } else if (opts.hardy) {
    s.hardy = true;
    for (const k of ['wood', 'stone', 'berries', 'meat', 'gold'] as const) s.res[k] = Math.round(s.res[k] * 0.6);
  }
  return s;
}

/**
 * What can be gathered and hunted, in patches: berry bushes at forest edges,
 * mushrooms on the forest floor, herds of deer and rabbits in the woods and
 * shoals of fish in the water. One of each lies within a short walk of the
 * start; the rest is spread thin over the land.
 */
export function seedNature(s: GameState, site: { x: number; y: number }, rand: () => number, berries = true): void {
  const cx = site.x + 1;
  const cy = site.y + 1;
  const trees = (x: number, y: number, r: number) => {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBounds(s, x + dx, y + dy) && s.trees[idx(s, x + dx, y + dy)]) n++;
    return n;
  };
  const free = (i: number) => s.terrain[i] === 0 && s.occ[i] < 0 && !s.road[i] && !s.rock[i] && !s.ore[i];
  /** A spot `minD`–`maxD` from the start that passes `ok`. */
  const spot = (minD: number, maxD: number, ok: (x: number, y: number) => boolean) => {
    for (let tries = 0; tries < 400; tries++) {
      const a = rand() * Math.PI * 2;
      const d = minD + rand() * (maxD - minD);
      const x = Math.round(cx + Math.cos(a) * d);
      const y = Math.round(cy + Math.sin(a) * d);
      if (inBounds(s, x, y) && ok(x, y)) return { x, y };
    }
    return null;
  };

  // Berry patches: a cluster of bushes on open ground by the trees.
  const edge = (x: number, y: number) => free(idx(s, x, y)) && !s.trees[idx(s, x, y)] && trees(x, y, 2) >= 3;
  const berryPatch = (x: number, y: number) => {
    const n = 5 + Math.floor(rand() * 5);
    for (let k = 0, placed = 0; k < 40 && placed < n; k++) {
      const bx = x + Math.round((rand() - 0.5) * 5);
      const by = y + Math.round((rand() - 0.5) * 5);
      if (!inBounds(s, bx, by)) continue;
      const i = idx(s, bx, by);
      if (!free(i) || s.trees[i] || s.berriesMax[i]) continue;
      s.berriesMax[i] = 2 + Math.floor(rand() * 2);
      placed++;
    }
  };
  if (berries) {
    const near = spot(6, 12, edge) ?? spot(6, 14, (x, y) => free(idx(s, x, y)) && !s.trees[idx(s, x, y)]);
    if (near) berryPatch(near.x, near.y);
    for (let k = 0; k < 9; k++) {
      const p = spot(14, 45, edge);
      if (p) berryPatch(p.x, p.y);
    }
    s.berries.set(s.berriesMax);
  }

  // Mushrooms: rings on the floor of older woods.
  s.mushrooms = {};
  s.mushroomsMax = {};
  const deepWood = (x: number, y: number) => s.trees[idx(s, x, y)] >= 1 && trees(x, y, 2) >= 10;
  // Mushrooms are seen at the wood's edge, where nothing stands in front of them.
  const openFront = (x: number, y: number) =>
    (inBounds(s, x + 1, y) && !s.trees[idx(s, x + 1, y)] && s.terrain[idx(s, x + 1, y)] === 0) ||
    (inBounds(s, x, y + 1) && !s.trees[idx(s, x, y + 1)] && s.terrain[idx(s, x, y + 1)] === 0);
  for (let k = 0; k < 8; k++) {
    const p = spot(k === 0 ? 7 : 14, k === 0 ? 16 : 45, deepWood);
    if (!p) continue;
    const n = 4 + Math.floor(rand() * 5);
    for (let j = 0, placed = 0; j < 60 && placed < n; j++) {
      const mx = p.x + Math.round((rand() - 0.5) * 6);
      const my = p.y + Math.round((rand() - 0.5) * 6);
      if (!inBounds(s, mx, my)) continue;
      const i = idx(s, mx, my);
      if (!s.trees[i] || s.mushroomsMax[i] || !openFront(mx, my)) continue;
      s.mushroomsMax[i] = 2 + Math.floor(rand() * 2);
      placed++;
    }
  }
  s.mushrooms = { ...s.mushroomsMax };

  // Game: deer in the deep woods, rabbits where wood meets meadow.
  s.herds = [];
  // Deer keep to glades in the woods: open ground with forest all about.
  const woods = (x: number, y: number) => free(idx(s, x, y)) && s.trees[idx(s, x, y)] <= 1 && trees(x, y, 4) >= 30;
  for (let k = 0; k < 6; k++) {
    const p = spot(k === 0 ? 9 : 16, k === 0 ? 18 : 45, woods);
    if (p) s.herds.push({ kind: 'deer', x: p.x + 0.5, y: p.y + 0.5, n: 6, max: 8 });
  }
  for (let k = 0; k < 6; k++) {
    const p = spot(k === 0 ? 7 : 14, k === 0 ? 15 : 45, edge);
    if (p) s.herds.push({ kind: 'rabbit', x: p.x + 0.5, y: p.y + 0.5, n: 10, max: 14 });
  }

  // Fish shoal in open water, away from the banks.
  s.shoals = [];
  const deep = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inBounds(s, x + dx, y + dy) || s.terrain[idx(s, x + dx, y + dy)] !== 1) return false;
    return true;
  };
  for (let k = 0; k < 6; k++) {
    const p = spot(k === 0 ? 4 : 12, k === 0 ? 18 : 50, (x, y) => deep(x, y) && !s.shoals!.some((o) => Math.hypot(o.x - x, o.y - y) < 8));
    if (p) s.shoals.push({ x: p.x + 0.5, y: p.y + 0.5, n: 16, max: 20 });
  }
}

function findSite(s: GameState, rand: () => number): { x: number; y: number } {
  const W = s.width;
  let best = { x: W / 2 - 1, y: W / 2 - 1 };
  let bestScore = -Infinity;
  for (let k = 0; k < 400; k++) {
    const x = Math.floor(W * 0.3 + rand() * W * 0.4);
    const y = Math.floor(W * 0.3 + rand() * W * 0.4);
    let water = 0;
    let near = 0;
    for (let dy = -5; dy <= 7; dy++) {
      for (let dx = -5; dx <= 7; dx++) {
        if (!inBounds(s, x + dx, y + dy)) continue;
        if (s.terrain[idx(s, x + dx, y + dy)] === 1) water++;
      }
    }
    for (let dy = -12; dy <= 14; dy++) {
      for (let dx = -12; dx <= 14; dx++) {
        if (inBounds(s, x + dx, y + dy) && s.terrain[idx(s, x + dx, y + dy)] === 1) near++;
      }
    }
    // Want no water right around the hall, but a river within reach.
    const score = -water * 10 + Math.min(near, 30) - Math.hypot(x - W / 2, y - W / 2) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  // Clear any stray water under the hall area.
  for (let dy = -1; dy <= 4; dy++) {
    for (let dx = -1; dx <= 4; dx++) {
      if (inBounds(s, best.x + dx, best.y + dy)) s.terrain[idx(s, best.x + dx, best.y + dy)] = 0;
    }
  }
  return best;
}

/** The tiles a building stands on: its turned footprint, or its rectangle. */
export function cellsOf(s: GameState, b: Building): number[] {
  if (b.cells) return b.cells;
  const out: number[] = [];
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inBounds(s, x, y)) out.push(idx(s, x, y));
  return out;
}

/**
 * The tiles under a w×h footprint centred at (cx, cy) and turned by rot:
 * every tile whose centre lies inside it (and at least the tile under the
 * centre). Tiles off the map are returned as -1.
 */
export function footprintCells(s: GameState, w: number, h: number, cx: number, cy: number, rot: number): number[] {
  const out: number[] = [];
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const r = Math.ceil(Math.hypot(w, h) / 2) + 1;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      // Into the footprint's own frame: undo the turn.
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const lx = dx * c + dy * sn;
      const ly = -dx * sn + dy * c;
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) out.push(inBounds(s, x, y) ? idx(s, x, y) : -1);
    }
  }
  if (!out.length) out.push(inBounds(s, Math.floor(cx), Math.floor(cy)) ? idx(s, Math.floor(cx), Math.floor(cy)) : -1);
  return out;
}

export function placeBuilding(s: GameState, b: Building): void {
  for (const i of cellsOf(s, b)) {
    s.occ[i] = b.id;
    s.trees[i] = 0;
    s.berries[i] = 0;
    s.berriesMax[i] = 0;
  }
  s.buildings.push(b);
  s.dirty = true;
}

export function removeBuilding(s: GameState, b: Building): void {
  for (const i of cellsOf(s, b)) if (s.occ[i] === b.id) s.occ[i] = -1;
  s.buildings = s.buildings.filter((o) => o !== b);
  s.dirty = true;
}

/** Lays (1 = dirt, 2 = paved) or clears a road tile. */
export function setRoad(s: GameState, x: number, y: number, on: boolean, kind = 1): void {
  const i = idx(s, x, y);
  s.road[i] = on ? kind : 0;
  if (on) {
    s.trees[i] = 0;
    s.berries[i] = 0;
    s.berriesMax[i] = 0;
  }
  s.dirty = true;
}

export function getBuilding(s: GameState, id: number): Building | undefined {
  return s.buildings.find((b) => b.id === id);
}
