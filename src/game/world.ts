import { BUILDINGS } from './data';
import { fbm, mulberry32 } from './rng';
import type { Building, BuildingType, GameState, Land, NatResource, Resources, Richness } from './types';
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

/** How much of a resource each richness brings, against a regular land. */
export const RICHNESS_SCALE: Record<Richness, number> = { rich: 2, regular: 1, poor: 0.5, none: 0 };

/** The resource each kind of land is always rich in. */
const LAND_RICH: Record<Land, NatResource> = { meadow: 'fertility', valley: 'fish', hills: 'stone' };

/**
 * How rich a new land is in each natural resource: the one its kind of land
 * is known for is rich, one other is missing altogether (never stone), and
 * of the rest two are regular and two poor. The tutorial's land has some of
 * everything.
 */
export function rollRichness(land: Land, rand: () => number, plain = false): Record<NatResource, Richness> {
  const all: NatResource[] = ['stone', 'game', 'fish', 'berries', 'ore', 'fertility'];
  const out = Object.fromEntries(all.map((k) => [k, 'regular'])) as Record<NatResource, Richness>;
  if (plain) return out;
  const rich = LAND_RICH[land];
  out[rich] = 'rich';
  const rest = all.filter((k) => k !== rich);
  const canLack = rest.filter((k) => k !== 'stone');
  const none = canLack[Math.floor(rand() * canLack.length)];
  out[none] = 'none';
  const left = rest.filter((k) => k !== none);
  // Shuffle what is left: two regular, two poor.
  for (let i = left.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [left[i], left[j]] = [left[j], left[i]];
  }
  left.forEach((k, i) => (out[k] = i < 2 ? 'regular' : 'poor'));
  return out;
}

/** How much of a natural resource a land has, against a regular one (old lands: regular). */
export function richness(s: GameState, k: NatResource): number {
  return RICHNESS_SCALE[s.richness?.[k] ?? 'regular'];
}

export function generateWorld(seed: number, opts: { relaxed?: boolean; hardy?: boolean; land?: Land; plain?: boolean } = {}): GameState {
  const land: Land = opts.land ?? 'meadow';
  const W = MAP_SIZE;
  const H = MAP_SIZE;
  const n = W * H;
  const rand = mulberry32(seed);
  const s: GameState = {
    version: 4,
    learned: [],
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

  // What this land is rich and poor in (its own dice, so the lie of the land does not change with it).
  s.richness = rollRichness(land, mulberry32(seed + 4242), opts.plain);
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
  // Bog iron lies in wet ground: near water where there is any.
  const nearWater = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (inBounds(s, x + dx, y + dy) && s.terrain[idx(s, x + dx, y + dy)] === 1) return true;
    return false;
  };
  const depositNear = (arr: Uint8Array, minD: number, maxD: number, r: number, amount: number, sameShore = false, wet = false) => {
    for (let tries = 0; tries < 300; tries++) {
      const a = rand() * Math.PI * 2;
      const d = minD + rand() * (maxD - minD);
      const x = Math.round(site.x + 1 + Math.cos(a) * d);
      const y = Math.round(site.y + 1 + Math.sin(a) * d);
      if (!inBounds(s, x, y) || s.terrain[idx(s, x, y)] !== 0) continue;
      // The first outcrop must be on the settlers' side of any river.
      if (sameShore && tries < 250 && !dry[idx(s, x, y)]) continue;
      if (wet && tries < 250 && !nearWater(x, y)) continue;
      placeDeposit(arr, x, y, r, amount);
      return;
    }
  };
  // Few outcrops, but deep: stone is found in places, not everywhere. There is always one near the start.
  depositNear(s.rock, 8, 13, richness(s, 'stone') < 1 ? 1 : 2, 40, true);
  const outcrops = Math.round((land === 'hills' ? 6 : land === 'valley' ? 2 : 4) * richness(s, 'stone'));
  for (let k = 0; k < outcrops; k++) depositNear(s.rock, 16, 40, 1 + Math.floor(rand() * 2), 45);
  const ore = richness(s, 'ore');
  if (ore > 0) {
    depositNear(s.ore, 14, 22, 1, 30, false, true);
    for (let k = 0; k < Math.round((land === 'hills' ? 3 : 2) * ore); k++) depositNear(s.ore, 20, 40, 1, 35, false, true);
  }

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
  // Rich soil, thin soil, or none worth the plough anywhere (below a fifth).
  const fert = s.richness.fertility;
  if (fert !== 'regular') {
    for (let i = 0; i < n; i++) {
      const f = s.fertility[i];
      s.fertility[i] = fert === 'rich' ? Math.min(1, f * 1.3 + 0.12) : fert === 'poor' ? Math.max(0.15, f * 0.6) : Math.min(0.19, Math.max(0.1, f * 0.2));
    }
  }
  if (land !== 'meadow') s.land = land;
  // Enough timber for a home, a woodcutter and a food camp; a little coin.
  s.res.wood = 15;
  s.res.stone = 10;
  s.res.planks = 0;
  s.res.berries = 40;
  s.res.meat = 20;
  s.res.gold = 10;
  // The settlers bring tools for two years of their first workplaces, and spare cart parts.
  s.res.tools = 11;
  s.res.woodparts = 4;
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
 * herds of deer and rabbits in the woods and shoals of fish in the water;
 * and, only to be looked at, rings of mushrooms on the forest floor.
 *
 * Near the start lies one of each kind but deer, together enough to feed
 * some thirty villagers a year (a villager eats twelve a year): a patch of
 * six berry bushes (~120), a warren (~110) and a shoal (~110). About two and a half times as much again lies
 * far off, toward the edges of the map: wild food carries a hamlet, not a town.
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
  /** A spot well away from the start, toward the edge of the map if there is one that suits. */
  const EDGE = 16;
  const far = (ok: (x: number, y: number) => boolean) =>
    spot(28, 70, (x, y) => Math.min(x, y, s.width - 1 - x, s.height - 1 - y) <= EDGE && ok(x, y)) ?? spot(24, 70, ok);

  // Berry patches: a cluster of bushes on open ground by the trees.
  const edge = (x: number, y: number) => free(idx(s, x, y)) && !s.trees[idx(s, x, y)] && trees(x, y, 2) >= 3;
  const berryPatch = (x: number, y: number, n: number) => {
    for (let k = 0, placed = 0; k < 40 && placed < n; k++) {
      const bx = x + Math.round((rand() - 0.5) * 5);
      const by = y + Math.round((rand() - 0.5) * 5);
      if (!inBounds(s, bx, by)) continue;
      const i = idx(s, bx, by);
      if (!free(i) || s.trees[i] || s.berriesMax[i]) continue;
      s.berriesMax[i] = 2;
      placed++;
    }
  };
  // How much of each this land has: rich doubles the patches, poor halves them, none has none.
  const berryScale = richness(s, 'berries');
  if (berries && berryScale > 0) {
    const near = spot(6, 12, edge) ?? spot(6, 14, (x, y) => free(idx(s, x, y)) && !s.trees[idx(s, x, y)]);
    if (near) berryPatch(near.x, near.y, Math.max(3, Math.round(6 * Math.min(1.4, berryScale))));
    for (let k = 0; k < Math.round(3 * berryScale); k++) {
      const p = far(edge);
      if (p) berryPatch(p.x, p.y, 7);
    }
    s.berries.set(s.berriesMax);
  }

  // Mushrooms: rings on the floor of older woods, for the look of them (no one gathers them).
  s.mushrooms = {};
  s.mushroomsMax = {};
  const deepWood = (x: number, y: number) => s.trees[idx(s, x, y)] >= 1 && trees(x, y, 2) >= 10;
  // Mushrooms are seen at the wood's edge, where nothing stands in front of them.
  const openFront = (x: number, y: number) =>
    (inBounds(s, x + 1, y) && !s.trees[idx(s, x + 1, y)] && s.terrain[idx(s, x + 1, y)] === 0) ||
    (inBounds(s, x, y + 1) && !s.trees[idx(s, x, y + 1)] && s.terrain[idx(s, x, y + 1)] === 0);
  // A ring needs old wood with an open edge to be seen from.
  const ringSite = (x: number, y: number) => deepWood(x, y) && countMushroomTiles(x, y) >= 4;
  const countMushroomTiles = (x: number, y: number) => {
    let n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inBounds(s, x + dx, y + dy) && s.trees[idx(s, x + dx, y + dy)] && openFront(x + dx, y + dy)) n++;
    return n;
  };
  for (let k = 0; k < 3; k++) {
    const p = k === 0 ? (spot(7, 16, ringSite) ?? spot(7, 20, ringSite) ?? spot(7, 20, deepWood)) : (far(ringSite) ?? far(deepWood));
    if (!p) continue;
    const n = k === 0 ? 5 : 6;
    for (let j = 0, placed = 0; j < 80 && placed < n; j++) {
      const mx = p.x + Math.round((rand() - 0.5) * 6);
      const my = p.y + Math.round((rand() - 0.5) * 6);
      if (!inBounds(s, mx, my)) continue;
      const i = idx(s, mx, my);
      if (!s.trees[i] || s.mushroomsMax[i] || !openFront(mx, my)) continue;
      s.mushroomsMax[i] = 2;
      placed++;
    }
  }
  s.mushrooms = { ...s.mushroomsMax };

  // Game: a warren of rabbits near the start, where wood meets meadow; deer
  // keep to glades deep in the woods far off, and another warren.
  s.herds = [];
  const game = richness(s, 'game');
  const woods = (x: number, y: number) => free(idx(s, x, y)) && s.trees[idx(s, x, y)] <= 1 && trees(x, y, 4) >= 30;
  const apart = (x: number, y: number) => !s.herds!.some((o) => Math.hypot(o.x - x, o.y - y) < 10);
  if (game > 0) {
    // Always a warren within reach (a small one on poor land), then deer and warrens further off.
    const warrenNear = spot(7, 15, edge);
    const small = game < 1 ? 0.6 : 1;
    if (warrenNear) s.herds.push({ kind: 'rabbit', x: warrenNear.x + 0.5, y: warrenNear.y + 0.5, n: Math.round(10 * small), max: Math.round(14 * small) });
    for (let k = 0; k < Math.round(1 * game); k++) {
      const deer = far((x, y) => woods(x, y) && apart(x, y));
      if (deer) s.herds.push({ kind: 'deer', x: deer.x + 0.5, y: deer.y + 0.5, n: 6, max: 8 });
    }
    for (let k = 0; k < Math.round(1 * game) - (game < 1 ? 1 : 0); k++) {
      const warrenFar = far((x, y) => edge(x, y) && apart(x, y));
      if (warrenFar) s.herds.push({ kind: 'rabbit', x: warrenFar.x + 0.5, y: warrenFar.y + 0.5, n: 10, max: 14 });
    }
  }

  // Fish shoal in open water, away from the banks: about one for every
  // WATER_PER_SHOAL tiles of water (twice that on rich land, half on poor),
  // the first near the start, the rest spread out over the water.
  s.shoals = [];
  const deep = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inBounds(s, x + dx, y + dy) || s.terrain[idx(s, x + dx, y + dy)] !== 1) return false;
    return true;
  };
  let water = 0;
  for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] === 1) water++;
  const fish = richness(s, 'fish');
  const shoals = fish > 0 ? Math.max(1, Math.round((water / WATER_PER_SHOAL) * fish)) : 0;
  const clear = (x: number, y: number) => !s.shoals!.some((o) => Math.hypot(o.x - x, o.y - y) < SHOAL_SPACING);
  const add = (p: { x: number; y: number } | null) => p && s.shoals!.push({ x: p.x + 0.5, y: p.y + 0.5, n: SHOAL_MAX, max: SHOAL_MAX });
  // A stream has no open water: there the fish keep to its widest stretches.
  const wide = (x: number, y: number) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(s, x + dx, y + dy) && s.terrain[idx(s, x + dx, y + dy)] === 1) n++;
    return s.terrain[idx(s, x, y)] === 1 && n >= 5;
  };
  if (shoals > 0) add(spot(4, 18, deep) ?? spot(4, 24, wide));
  for (let tries = 0; s.shoals.length < shoals && tries < 1200; tries++) {
    const x = Math.floor(rand() * s.width);
    const y = Math.floor(rand() * s.height);
    if ((tries < 600 ? deep(x, y) : wide(x, y)) && clear(x, y)) add({ x, y });
  }
}

/** Tiles of water for each shoal of fish, on a land of regular richness. */
export const WATER_PER_SHOAL = 150;
/** Shoals keep at least this far apart. */
const SHOAL_SPACING = 6;

/** Catches a shoal holds (each half a catch of five fish). */
export const SHOAL_MAX = 12;

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

/** Lays (1 = dirt, 2 = stone, 3 = cobbled) or clears a road tile. */
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
