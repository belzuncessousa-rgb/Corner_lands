import { BUILDINGS } from './data';
import { fbm, mulberry32 } from './rng';
import type { Building, BuildingType, GameState, Resources } from './types';
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
export function generateWorld(seed: number, opts: { relaxed?: boolean } = {}): GameState {
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
      if (h < 0.3) s.terrain[idx(s, x, y)] = 1;
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
    const width = 1.2 + fbm(t / 9, 3, seed + 5, 2) * 1.6;
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
      s.fertility[idx(s, x, y)] = Math.max(0.15, Math.min(1, (f - 0.25) * 1.8));
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
  const depositNear = (arr: Uint8Array, minD: number, maxD: number, r: number, amount: number) => {
    for (let tries = 0; tries < 200; tries++) {
      const a = rand() * Math.PI * 2;
      const d = minD + rand() * (maxD - minD);
      const x = Math.round(site.x + 1 + Math.cos(a) * d);
      const y = Math.round(site.y + 1 + Math.sin(a) * d);
      if (!inBounds(s, x, y) || s.terrain[idx(s, x, y)] !== 0) continue;
      placeDeposit(arr, x, y, r, amount);
      return;
    }
  };
  depositNear(s.rock, 8, 13, 2, 30);
  for (let k = 0; k < 6; k++) depositNear(s.rock, 14, 40, 1 + Math.floor(rand() * 2), 30);
  depositNear(s.ore, 14, 22, 1, 25);
  for (let k = 0; k < 3; k++) depositNear(s.ore, 18, 40, 1, 25);

  // --- Berry bushes: open land near forest edges.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idx(s, x, y);
      if (s.terrain[i] !== 0 || s.trees[i] || s.rock[i] || s.ore[i]) continue;
      let near = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (s.trees[idx(s, x + dx, y + dy)]) near++;
      if (near > 2 && rand() < 0.1) {
        s.berriesMax[i] = 2 + Math.floor(rand() * 2);
      }
    }
  }
  // Guarantee bushes close to the start.
  let guaranteed = 0;
  for (let tries = 0; tries < 400 && guaranteed < 8; tries++) {
    const x = site.x + 1 + Math.round((rand() - 0.5) * 16);
    const y = site.y + 1 + Math.round((rand() - 0.5) * 16);
    if (!inBounds(s, x, y)) continue;
    const i = idx(s, x, y);
    if (Math.hypot(x - site.x - 1, y - site.y - 1) < 5) continue;
    if (s.terrain[i] || s.trees[i] || s.rock[i] || s.ore[i] || s.berriesMax[i]) continue;
    s.berriesMax[i] = 3;
    guaranteed++;
  }
  s.berries.set(s.berriesMax);

  // --- The manor hall and a stub of road.
  const hall = makeBuilding(s.nextId++, 'townhall', site.x, site.y);
  hall.build = 1;
  placeBuilding(s, hall);
  const roadY = site.y + 3;
  for (let x = site.x - 2; x <= site.x + 5; x++) {
    if (inBounds(s, x, roadY) && s.terrain[idx(s, x, roadY)] === 0) setRoad(s, x, roadY, true);
  }

  s.res.wood = 70;
  s.res.stone = 20;
  s.res.planks = 0;
  s.res.berries = 40;
  s.res.meat = 20;
  s.res.gold = 150;
  if (opts.relaxed) {
    s.relaxed = true;
    for (const k of ['wood', 'stone', 'berries', 'meat', 'gold'] as const) s.res[k] *= 2;
  }
  return s;
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

export function placeBuilding(s: GameState, b: Building): void {
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      const i = idx(s, x, y);
      s.occ[i] = b.id;
      s.trees[i] = 0;
      s.berries[i] = 0;
      s.berriesMax[i] = 0;
    }
  }
  s.buildings.push(b);
  s.dirty = true;
}

export function removeBuilding(s: GameState, b: Building): void {
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) s.occ[idx(s, x, y)] = -1;
  }
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
