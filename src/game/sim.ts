import {
  BUILDINGS,
  CARRY_LOAD,
  DAYS_PER_MONTH,
  OFFROAD_TILES_PER_DAY,
  RESOURCE_STORAGE,
  ROAD_TILES_PER_DAY,
  STORAGE_CAPACITY,
  type StorageKind,
  TRAVEL_WEIGHT,
  MAX_BEAUTY,
  MONTHS_PER_YEAR,
  SELL_FACTOR,
  EXPORT_FACTOR,
  EXPORT_PER_MARKET,
  FOOD_IDS,
  GOODS,
  TAX_LEVELS,
  TIERS,
  TRADE_PRICES,
} from './data';
import { advise } from './advisor';
import { rollEvent } from './events';
import {
  HOUSE_LEVELS,
  MANOR_STORAGE_PER_LEVEL,
  finishUpgrade,
  houseNeeds,
  isProject,
  upgradeCost,
  upgradeDays,
  upgradePlan,
  workersOf,
} from './levels';
import { Heap } from './path';
import { checkQuests } from './quests';
import { StateRng } from './rng';
import type { Building, BuildingType, Category, Cost, GameState, MessageKind, ResourceId, Season } from './types';
import { RESOURCE_IDS } from './types';
import { getBuilding, idx, inBounds, makeBuilding, placeBuilding, removeBuilding, setRoad } from './world';

// ---------------------------------------------------------------- time helpers

export function monthOf(day: number): number {
  return Math.floor(day / DAYS_PER_MONTH) % MONTHS_PER_YEAR;
}
export function yearOf(day: number): number {
  return Math.floor(day / (DAYS_PER_MONTH * MONTHS_PER_YEAR)) + 1;
}
export function seasonOf(day: number): Season {
  return Math.floor(monthOf(day) / 3) as Season;
}
export function isWinter(day: number): boolean {
  return seasonOf(day) === 3;
}

// ---------------------------------------------------------------- messages

export function log(s: GameState, text: string, kind: MessageKind = 'info', at?: Building): void {
  s.messages.push({ day: s.day, text, kind, ...(at ? { at: { x: at.x + at.w / 2, y: at.y + at.h / 2 } } : {}) });
  if (s.messages.length > 40) s.messages.splice(0, s.messages.length - 40);
}

// ---------------------------------------------------------------- resources

export function storageCap(s: GameState, kind: StorageKind): number {
  let n = 0;
  for (const b of s.buildings) {
    if (b.build < 1) continue;
    n += STORAGE_CAPACITY[b.type]?.[kind] ?? 0;
    if (b.type === 'townhall') n += (b.level - 1) * MANOR_STORAGE_PER_LEVEL[kind];
  }
  return n;
}

export function stored(s: GameState, kind: StorageKind): number {
  let n = 0;
  for (const k in RESOURCE_STORAGE) if (RESOURCE_STORAGE[k as ResourceId] === kind) n += s.res[k as ResourceId];
  return n;
}

/** Free space left for a resource's storage pool (Infinity for gold). */
export function roomFor(s: GameState, id: ResourceId): number {
  const kind = RESOURCE_STORAGE[id];
  if (!kind) return Infinity;
  return Math.max(0, storageCap(s, kind) - stored(s, kind));
}

/** Adds goods up to the free space; returns how many fit. */
export function store(s: GameState, id: ResourceId, n: number): number {
  const add = Math.max(0, Math.min(n, roomFor(s, id)));
  s.res[id] += add;
  return add;
}

export function canAfford(s: GameState, cost: Cost): boolean {
  for (const k in cost) {
    const id = k as ResourceId;
    if ((s.res[id] ?? 0) < (cost[id] ?? 0)) return false;
  }
  return true;
}

export function pay(s: GameState, cost: Cost): void {
  for (const k in cost) {
    const id = k as ResourceId;
    s.res[id] -= cost[id] ?? 0;
  }
}

function refund(s: GameState, cost: Cost, factor: number): void {
  for (const k in cost) {
    const id = k as ResourceId;
    store(s, id, Math.floor((cost[id] ?? 0) * factor));
  }
}

export function totalFood(s: GameState): number {
  let n = 0;
  for (const f of FOOD_IDS) n += s.res[f];
  return n;
}

// ---------------------------------------------------------------- placement

export function footprintClear(s: GameState, x: number, y: number, w: number, h: number): string | null {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!inBounds(s, tx, ty)) return 'Outside the map';
      const i = idx(s, tx, ty);
      if (s.terrain[i] === 1) return 'Cannot build on water';
      if (s.occ[i] >= 0) return 'Space is occupied';
      if (s.road[i]) return 'A road is in the way';
      if (s.rock[i] || s.ore[i]) return 'Rocky ground';
    }
  }
  return null;
}

export function isUnlocked(s: GameState, type: BuildingType): boolean {
  return BUILDINGS[type].tier <= s.tier;
}

export function placementError(s: GameState, type: BuildingType, x: number, y: number): string | null {
  const d = BUILDINGS[type];
  if (!d.buildable) return 'Cannot be built';
  if (!isUnlocked(s, type)) return `Requires ${TIERS[d.tier].name}`;
  const clear = footprintClear(s, x, y, d.w, d.h);
  if (clear) return clear;
  if (type === 'fisher' && countInRadius(s, centerOf(x, y, d.w, d.h), 2.5, (i) => s.terrain[i] === 1) < 2) {
    return 'Must be next to water';
  }
  if ((d.cost.gold ?? 0) > s.res.gold) return 'Not enough gold';
  return null;
}

/** Materials of a cost that builders must carry (gold is paid up front). */
export function materialsOf(cost: Cost): Cost {
  const out: Cost = {};
  for (const k in cost) if (k !== 'gold') out[k as ResourceId] = cost[k as ResourceId];
  return out;
}

/**
 * Places a construction site. Gold is paid at once; materials are carried
 * from storage by builders as they become available.
 */
export function placeOrder(s: GameState, type: BuildingType, x: number, y: number): Building | null {
  if (placementError(s, type, x, y)) return null;
  const d = BUILDINGS[type];
  s.res.gold -= d.cost.gold ?? 0;
  const b = makeBuilding(s.nextId++, type, x, y);
  b.need = materialsOf(d.cost);
  placeBuilding(s, b);
  recompute(s);
  return b;
}

/** Materials already carried to a construction site. */
export function deliveredTo(b: Building): Cost {
  const d = BUILDINGS[b.type];
  const out: Cost = {};
  const mats = materialsOf(b.upgrading ? upgradeCost(b) : d.cost);
  for (const k in mats) {
    const id = k as ResourceId;
    out[id] = (mats[id] ?? 0) - (b.need?.[id] ?? 0);
  }
  return out;
}

/** Timber needed for each bridge tile laid over water. */
export const BRIDGE_COST: Cost = { wood: 4 };

export function isBridge(s: GameState, x: number, y: number): boolean {
  return inBounds(s, x, y) && s.terrain[idx(s, x, y)] === 1;
}

export function roadError(s: GameState, x: number, y: number): string | null {
  if (!inBounds(s, x, y)) return 'Outside the map';
  const i = idx(s, x, y);
  if (s.occ[i] >= 0) return 'Occupied';
  if (s.rock[i] || s.ore[i]) return 'Rocky ground';
  if (s.road[i]) return 'Already a road';
  if (s.terrain[i] === 1 && !canAfford(s, BRIDGE_COST)) return 'Not enough timber for a bridge';
  return null;
}

export function buildRoad(s: GameState, x: number, y: number): boolean {
  if (roadError(s, x, y)) return false;
  if (isBridge(s, x, y)) pay(s, BRIDGE_COST);
  setRoad(s, x, y, true);
  return true;
}

export function removeRoad(s: GameState, x: number, y: number): boolean {
  if (!inBounds(s, x, y) || !s.road[idx(s, x, y)]) return false;
  setRoad(s, x, y, false);
  return true;
}

export function demolish(s: GameState, b: Building): boolean {
  if (b.type === 'townhall') return false;
  const d = BUILDINGS[b.type];
  // Sites return what was delivered (and the gold); finished buildings half.
  if (b.build >= 1) refund(s, d.cost, 0.5);
  else {
    s.res.gold += d.cost.gold ?? 0;
    const back = deliveredTo(b);
    for (const k in back) store(s, k as ResourceId, back[k as ResourceId] ?? 0);
  }
  removeBuilding(s, b);
  recompute(s);
  return true;
}

export function hasBuilt(s: GameState, type: BuildingType): boolean {
  return s.buildings.some((b) => b.type === type && b.build >= 1);
}

export function trade(s: GameState, id: ResourceId, amount: number): string | null {
  if (!hasBuilt(s, 'market')) return 'Requires a marketplace';
  const price = TRADE_PRICES[id];
  if (!price) return 'Cannot trade this';
  if (amount > 0) {
    const cost = price * amount;
    if (s.res.gold < cost) return 'Not enough gold';
    if (roomFor(s, id) < amount) return 'Not enough storage';
    s.res.gold -= cost;
    s.res[id] += amount;
  } else {
    const n = -amount;
    if (s.res[id] < n) return 'Not enough goods';
    s.res[id] -= n;
    s.res.gold += Math.floor(price * SELL_FACTOR * n);
  }
  return null;
}

/** Taverns brew their ale from grain: one sack per ten villagers served. */
export function serveAle(s: GameState): void {
  for (const t of s.buildings) {
    if (t.type !== 'tavern' || t.build < 1 || t.workers === 0) continue;
    const c = bCenter(t);
    let served = 0;
    for (const h of s.buildings) {
      if (h.residents === 0) continue;
      const hc = bCenter(h);
      if (Math.hypot(hc.x - c.x, hc.y - c.y) <= BUILDINGS.tavern.radius) served += h.residents;
    }
    const grain = Math.ceil(served / 10);
    if (s.res.grain >= grain) {
      s.res.grain -= grain;
      t.blocked = 0;
      t.status = served ? `Pouring ale for ${served} villagers` : 'No homes nearby yet';
    } else {
      t.blocked = BLOCK_PROBLEM;
      t.status = 'Out of ale: needs grain to brew';
    }
  }
}

/** Units of a good to keep in store: producers rest and merchants buy above it. */
export function keepOf(s: GameState, id: ResourceId): number {
  return s.targets?.[id] ?? GOODS[id].keep;
}

export function setKeep(s: GameState, id: ResourceId, keep: number): void {
  s.targets ??= {};
  s.targets[id] = Math.max(0, Math.round(keep));
}

/** Whether visiting merchants may buy this good's surplus. */
export function selling(s: GameState, id: ResourceId): boolean {
  return !!s.sell?.[id];
}

export function setSell(s: GameState, id: ResourceId, on: boolean): void {
  s.sell ??= {};
  if (on) s.sell[id] = true;
  else delete s.sell[id];
}

/** Sets an export rule: keep `keep` units and sell the surplus (null stops selling). */
export function setExport(s: GameState, id: ResourceId, keep: number | null): void {
  if (keep === null) return setSell(s, id, false);
  setKeep(s, id, keep);
  setSell(s, id, true);
}

/** True when every good a building makes is at or above its stock target. */
export function enoughOf(s: GameState, out: Cost): ResourceId | null {
  let first: ResourceId | null = null;
  for (const k in out) {
    const id = k as ResourceId;
    if (id === 'gold' || id === 'prestige') return null;
    if (s.res[id] < keepOf(s, id)) return null;
    first ??= id;
  }
  return first;
}

/** Goods the settlement has ever held, for menus that hide unknown goods. */
export function noteSeen(s: GameState): void {
  s.seen ??= [];
  for (const id of RESOURCE_IDS) if (s.res[id] > 0 && !s.seen.includes(id)) s.seen.push(id);
}

/** Monthly visit of merchants buying surplus goods at staffed markets. */
export function exportGoods(s: GameState): number {
  const markets = s.buildings.filter((b) => b.type === 'market' && b.build >= 1 && b.workers > 0).length;
  let budget = markets * EXPORT_PER_MARKET;
  let gold = 0;
  const sold: string[] = [];
  for (const k in s.sell ?? {}) {
    const id = k as ResourceId;
    const price = TRADE_PRICES[id];
    if (!price || budget <= 0) continue;
    const n = Math.min(budget, Math.floor(s.res[id] - keepOf(s, id)));
    if (n <= 0) continue;
    s.res[id] -= n;
    budget -= n;
    const earned = Math.floor(n * price * EXPORT_FACTOR);
    gold += earned;
    sold.push(`${n} ${GOODS[id].name.toLowerCase()}`);
  }
  s.res.gold += gold;
  if (gold > 0) log(s, `Merchants bought ${sold.join(', ')} for ${gold} coins.`, 'info');
  return gold;
}

export function setTax(s: GameState, level: number): void {
  s.taxLevel = Math.max(0, Math.min(TAX_LEVELS.length - 1, level));
}

// ---------------------------------------------------------------- geometry

export function centerOf(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return { x: x + w / 2, y: y + h / 2 };
}

export function bCenter(b: Building): { x: number; y: number } {
  return centerOf(b.x, b.y, b.w, b.h);
}

/** Calls fn for each tile whose centre lies within r of c. */
export function forTilesInRadius(
  s: GameState,
  c: { x: number; y: number },
  r: number,
  fn: (i: number, x: number, y: number, d: number) => void,
): void {
  const x0 = Math.max(0, Math.floor(c.x - r));
  const x1 = Math.min(s.width - 1, Math.ceil(c.x + r));
  const y0 = Math.max(0, Math.floor(c.y - r));
  const y1 = Math.min(s.height - 1, Math.ceil(c.y + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
      if (d <= r) fn(y * s.width + x, x, y, d);
    }
  }
}

export function countInRadius(
  s: GameState,
  c: { x: number; y: number },
  r: number,
  pred: (i: number) => boolean,
): number {
  let n = 0;
  forTilesInRadius(s, c, r, (i) => {
    if (pred(i)) n++;
  });
  return n;
}

/** Amount of the gathered map resource available around a spot. */
export function resourceInRange(s: GameState, type: BuildingType, c: { x: number; y: number }): number {
  const d = BUILDINGS[type];
  switch (d.gathers) {
    case 'trees':
    case 'forest':
      return countInRadius(s, c, d.radius, (i) => s.trees[i] > 0);
    case 'rock':
      return countInRadius(s, c, d.radius, (i) => s.rock[i] > 0);
    case 'ore':
      return countInRadius(s, c, d.radius, (i) => s.ore[i] > 0);
    case 'berries':
      return countInRadius(s, c, d.radius, (i) => s.berriesMax[i] > 0);
    case 'water':
      return countInRadius(s, c, d.radius, (i) => s.terrain[i] === 1);
    default:
      return 0;
  }
}

export function coveredBy(s: GameState, b: Building, type: BuildingType): boolean {
  const r = BUILDINGS[type].radius;
  const c = bCenter(b);
  for (const o of s.buildings) {
    if (o.type !== type || o.build < 1) continue;
    if (BUILDINGS[type].workers > 0 && (o.workers === 0 || o.blocked === BLOCK_PROBLEM)) continue;
    const oc = bCenter(o);
    if (Math.hypot(oc.x - c.x, oc.y - c.y) <= r) return true;
  }
  return false;
}

// ---------------------------------------------------------------- travel

/** Road tiles linked to the manor hall (used by the autoplayer's planning). */
export function reachableRoads(s: GameState): Uint8Array {
  const reached = new Uint8Array(s.width * s.height);
  const hall = s.buildings.find((b) => b.type === 'townhall');
  const queue: number[] = [];
  if (hall) {
    forPerimeter(s, hall, (i) => {
      if (s.road[i] && !reached[i]) {
        reached[i] = 1;
        queue.push(i);
      }
    });
  }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % s.width;
    const y = (i - x) / s.width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (!inBounds(s, nx, ny)) continue;
      const j = ny * s.width + nx;
      if (s.road[j] && !reached[j]) {
        reached[j] = 1;
        queue.push(j);
      }
    }
  }
  return reached;
}

/** Cost of stepping onto a tile, in road-tile units. */
export function stepCost(s: GameState, i: number): number {
  if (s.road[i]) return 1;
  const off = ROAD_TILES_PER_DAY / OFFROAD_TILES_PER_DAY;
  return s.trees[i] ? off * 1.4 : off;
}

const travelCache = new WeakMap<GameState, Float64Array>();

/**
 * Walking cost from every tile to the nearest storage building (manor hall,
 * storehouse or granary), in road-tile units. Roads make it cheaper.
 */
export function travelField(s: GameState, rebuild = false): Float64Array {
  let field = travelCache.get(s);
  if (field && !rebuild) return field;
  const n = s.width * s.height;
  field = new Float64Array(n).fill(Infinity);
  const heap = new Heap();
  for (const b of s.buildings) {
    if (b.build < 1 || !STORAGE_CAPACITY[b.type]) continue;
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = idx(s, x, y);
        field[i] = 0;
        heap.push(i, 0);
      }
    }
  }
  while (heap.size) {
    const i = heap.pop();
    const g = field[i];
    const x = i % s.width;
    const y = (i - x) / s.width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (!inBounds(s, nx, ny)) continue;
      const j = ny * s.width + nx;
      if (s.terrain[j] === 1 && !s.road[j]) continue;
      // Paths may end at a building's edge but not cross other buildings.
      if (s.occ[j] >= 0 && field[i] > 0) continue;
      const ng = g + stepCost(s, j);
      if (ng < field[j]) {
        field[j] = ng;
        heap.push(j, ng);
      }
    }
  }
  travelCache.set(s, field);
  return field;
}

/** Days for a round trip between a building and its nearest storage. */
export function tripDays(s: GameState, b: Building): number {
  if (STORAGE_CAPACITY[b.type] && b.build >= 1) return 0;
  const field = travelField(s);
  let best = Infinity;
  forPerimeter(s, b, (i) => {
    if (field[i] < best) best = field[i];
  });
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) best = Math.min(best, field[idx(s, x, y)]);
  if (!Number.isFinite(best)) return 20;
  return (2 * best) / ROAD_TILES_PER_DAY;
}

export function forPerimeter(s: GameState, b: Building, fn: (i: number, x: number, y: number) => void): void {
  for (let x = b.x; x < b.x + b.w; x++) {
    if (inBounds(s, x, b.y - 1)) fn(idx(s, x, b.y - 1), x, b.y - 1);
    if (inBounds(s, x, b.y + b.h)) fn(idx(s, x, b.y + b.h), x, b.y + b.h);
  }
  for (let y = b.y; y < b.y + b.h; y++) {
    if (inBounds(s, b.x - 1, y)) fn(idx(s, b.x - 1, y), b.x - 1, y);
    if (inBounds(s, b.x + b.w, y)) fn(idx(s, b.x + b.w, y), b.x + b.w, y);
  }
}

/** A road tile next to the building, used as its entrance. */
export function doorTile(s: GameState, b: Building): { x: number; y: number } {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  forPerimeter(s, b, (i, x, y) => {
    if (!s.road[i]) return;
    // Prefer front-facing sides (south / east), which read better visually.
    const score = (y >= b.y + b.h ? 2 : 0) + (x >= b.x + b.w ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  });
  if (best) return best;
  // No road: use a free tile on the front sides, else any free side tile.
  let fallback: { x: number; y: number } | null = null;
  let fbScore = -Infinity;
  forPerimeter(s, b, (i, x, y) => {
    if (s.terrain[i] === 1 || s.occ[i] >= 0) return;
    const score = (y >= b.y + b.h ? 2 : 0) + (x >= b.x + b.w ? 1 : 0);
    if (score > fbScore) {
      fbScore = score;
      fallback = { x, y };
    }
  });
  return fallback ?? { x: b.x + Math.floor(b.w / 2), y: Math.min(s.height - 1, b.y + b.h) };
}

// ---------------------------------------------------------------- recompute

export const BLOCK_PROBLEM = 1;
/** Idle for a normal reason: the season, or storage is full. */
export const BLOCK_SEASONAL = 2;

/** True when the building could not work last time it tried (problem or season). */
export function isBlocked(b: Building): boolean {
  return b.build >= 1 && !!b.blocked;
}

/** True when the building is stuck on a problem the player may want to fix. */
export function hasProblem(b: Building): boolean {
  return b.build >= 1 && b.blocked === BLOCK_PROBLEM;
}

export function housingOf(b: Building): number {
  if (b.build < 1) return 0;
  if (b.type === 'house') return HOUSE_LEVELS[b.level]?.housing ?? BUILDINGS.house.housing;
  return BUILDINGS[b.type].housing;
}

export function totalHousing(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) n += housingOf(b);
  return n;
}

const CATEGORY_PRIORITY: Record<Category, number> = { food: 0, resources: 1, industry: 2, civic: 3, housing: 4, decor: 5 };
/** Fine ordering inside a category: staple food producers are staffed first. */
const TYPE_PRIORITY: Partial<Record<BuildingType, number>> = {
  farm: 0,
  bakery: 0.1,
  fisher: 0.2,
  hunter: 0.3,
  forager: 0.4,
  woodcutter: 0,
  quarry: 0.1,
  forester: 0.2,
};

export function employed(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) n += b.workers + (b.builders ?? 0);
  return n;
}

/** Re-runs connectivity, distributes residents and assigns jobs. */
export function recompute(s: GameState): void {
  if (s.dirty) {
    travelField(s, true);
    for (const b of s.buildings) b.trip = tripDays(s, b);
    s.dirty = false;
  }
  // Residents.
  let left = s.population;
  const homes = s.buildings.filter((b) => housingOf(b) > 0).sort((a, b) => a.id - b.id);
  for (const b of s.buildings) b.residents = 0;
  for (const b of homes) {
    const n = Math.min(left, housingOf(b));
    b.residents = n;
    left -= n;
  }
  // Workers. Construction sites count as jobs (two builders each, right
  // after food and raw materials) so building never stalls completely.
  let free = s.population;
  // Buildings that could not work last time go to the back of the queue, so
  // villagers are not stuck at a forager with no berries while a hunter idles.
  const prio = (b: Building) =>
    CATEGORY_PRIORITY[BUILDINGS[b.type].category] + (TYPE_PRIORITY[b.type] ?? 0) + (isBlocked(b) ? 10 : 0);
  type Job = { b: Building; site: boolean; p: number };
  const jobs: Job[] = [];
  for (const b of s.buildings) {
    b.workers = 0;
    b.builders = 0;
    if (b.paused) continue;
    if (isProject(b)) jobs.push({ b, site: true, p: SITE_PRIORITY + b.id * 1e-6 });
    if (b.build >= 1 && BUILDINGS[b.type].workers > 0) jobs.push({ b, site: false, p: prio(b) });
  }
  jobs.sort((a, c) => a.p - c.p || a.b.id - c.b.id);
  for (const j of jobs) {
    const n = Math.min(free, j.site ? SITE_BUILDERS : workersOf(j.b));
    if (j.site) j.b.builders = n;
    else j.b.workers = n;
    free -= n;
  }
  // Anyone left over lends a hand on construction sites.
  for (const j of jobs) {
    if (free <= 0) break;
    if (!j.site) continue;
    const n = Math.min(free, MAX_BUILDERS - (j.b.builders ?? 0));
    j.b.builders = (j.b.builders ?? 0) + n;
    free -= n;
  }
}

/** Builders each construction site employs before idle villagers join in. */
export const SITE_BUILDERS = 2;
const SITE_PRIORITY = 1.5;

// ---------------------------------------------------------------- production

function tileDist(s: GameState, b: Building, i: number): number {
  const c = bCenter(b);
  return Math.hypot((i % s.width) + 0.5 - c.x, Math.floor(i / s.width) + 0.5 - c.y);
}

function nearestTile(
  s: GameState,
  b: Building,
  r: number,
  score: (i: number, d: number) => number | null,
): number {
  let best = -1;
  let bestScore = Infinity;
  forTilesInRadius(s, bCenter(b), r, (i, _x, _y, d) => {
    const v = score(i, d);
    if (v !== null && v < bestScore) {
      bestScore = v;
      best = i;
    }
  });
  return best;
}

function fullFor(s: GameState, out: Cost): boolean {
  for (const k in out) if (roomFor(s, k as ResourceId) <= 0) return true;
  return false;
}

function addOutput(s: GameState, b: Building, out: Cost): boolean {
  if (fullFor(s, out)) return false;
  for (const k in out) b.output += store(s, k as ResourceId, out[k as ResourceId] ?? 0);
  return true;
}

/** Performs one production cycle. Returns a status string on failure. */
function produce(s: GameState, b: Building, rng: StateRng): string | null {
  const d = BUILDINGS[b.type];
  const season = seasonOf(s.day);
  const enough = enoughOf(s, d.outputs);
  if (enough) return `Enough ${GOODS[enough].name.toLowerCase()} in store`;
  switch (b.type) {
    case 'woodcutter': {
      if (fullFor(s, d.outputs)) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (s.trees[i] > 0 ? dist - s.trees[i] * 1.2 : null));
      if (t < 0) return 'No trees in range';
      b.resDist = tileDist(s, b, t);
      s.trees[t]--;
      addOutput(s, b, d.outputs);
      return null;
    }
    case 'forester': {
      const c = bCenter(b);
      for (let tries = 0; tries < 12; tries++) {
        const x = Math.floor(c.x + (rng.next() * 2 - 1) * d.radius);
        const y = Math.floor(c.y + (rng.next() * 2 - 1) * d.radius);
        if (!inBounds(s, x, y)) continue;
        if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > d.radius) continue;
        const i = idx(s, x, y);
        if (s.terrain[i] || s.occ[i] >= 0 || s.road[i] || s.rock[i] || s.ore[i] || s.berriesMax[i]) continue;
        if (s.trees[i] >= 4) continue;
        s.trees[i]++;
        b.output++;
        return null;
      }
      return 'No room to plant';
    }
    case 'quarry':
    case 'mine': {
      const arr = b.type === 'quarry' ? s.rock : s.ore;
      const out = b.type === 'quarry' ? 'stone' : 'iron';
      if (roomFor(s, out) <= 0) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (arr[i] > 0 ? dist : null));
      if (t < 0) return b.type === 'quarry' ? 'No rock in range' : 'No ore in range';
      b.resDist = tileDist(s, b, t);
      arr[t]--;
      addOutput(s, b, d.outputs);
      return null;
    }
    case 'forager': {
      if (season === 3) return 'Bushes are bare in winter';
      if (roomFor(s, 'berries') <= 0) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (s.berries[i] > 0 ? dist : null));
      if (t < 0) {
        return countInRadius(s, bCenter(b), d.radius, (i) => s.berriesMax[i] > 0) > 0
          ? 'Bushes picked clean for now'
          : 'No berry bushes in range';
      }
      b.resDist = tileDist(s, b, t);
      s.berries[t]--;
      addOutput(s, b, d.outputs);
      return null;
    }
    case 'hunter': {
      const forest = countInRadius(s, bCenter(b), d.radius, (i) => s.trees[i] > 0);
      if (forest < 8) return 'Not enough forest for game';
      if (roomFor(s, 'meat') <= 0) return 'Storage full';
      const amount = Math.max(1, Math.round((d.outputs.meat ?? 0) * Math.min(1, forest / 40)));
      addOutput(s, b, { meat: amount });
      return null;
    }
    case 'fisher': {
      const water = countInRadius(s, bCenter(b), d.radius, (i) => s.terrain[i] === 1);
      if (water < 2) return 'No water nearby';
      if (roomFor(s, 'fish') <= 0) return 'Storage full';
      const amount = Math.max(1, Math.round((d.outputs.fish ?? 0) * Math.min(1, water / 12) * (season === 3 ? 0.5 : 1)));
      addOutput(s, b, { fish: amount });
      return null;
    }
    default: {
      // Generic converter: inputs -> outputs. Timber is never used below a
      // small reserve so homes keep their firewood.
      if ((d.inputs.wood ?? 0) > 0 && s.res.wood - (d.inputs.wood ?? 0) < WOOD_RESERVE) {
        return 'Waiting for wood (keeping firewood reserve)';
      }
      if (!canAfford(s, d.inputs)) {
        const missing = Object.keys(d.inputs).filter((k) => s.res[k as ResourceId] < (d.inputs[k as ResourceId] ?? 0));
        return `Waiting for ${missing.join(', ')}`;
      }
      if (fullFor(s, d.outputs)) return 'Storage full';
      pay(s, d.inputs);
      addOutput(s, b, d.outputs);
      return null;
    }
  }
}

function farmFertility(s: GameState, b: Building): number {
  let f = 0;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) f += s.fertility[idx(s, x, y)];
  return f / (b.w * b.h);
}

export const FARM_YIELD = 300;
/** Converters leave this much timber in stock for firewood. */
export const WOOD_RESERVE = 20;

function stepFarm(s: GameState, b: Building): void {
  const month = monthOf(s.day);
  const crew = b.workers / BUILDINGS.farm.workers;
  b.blocked = 0;
  if (month <= 5) {
    if (crew > 0) b.growth = Math.min(1, b.growth + crew / 50);
    b.status = crew > 0 ? (month < 3 ? 'Sowing the fields' : 'Tending the crops') : 'Fields untended';
  } else if (month === 6) {
    b.status = b.growth > 0 ? 'Crops ripening' : 'Fields lie fallow';
    if (b.growth === 0) b.blocked = BLOCK_SEASONAL;
  } else if (month === 7 && s.day % DAYS_PER_MONTH === 0 && b.growth > 0) {
    if (crew > 0) {
      const amount = Math.round(FARM_YIELD * b.growth * (0.5 + 0.5 * farmFertility(s, b)) * (0.6 + 0.4 * crew));
      const gained = store(s, 'grain', amount);
      b.output += gained;
      if (gained === 0) log(s, `The harvest rotted in the field: no room left to store ${amount} grain.`, 'bad', b);
      else if (gained < amount) log(s, `Harvest! A farm brought in ${gained} grain; ${amount - gained} spoiled for lack of storage.`, 'bad', b);
      else log(s, `Harvest! A farm brought in ${gained} grain.`, 'good', b);
      b.status = 'Harvest gathered';
    } else {
      log(s, 'Crops rotted in an unstaffed field.', 'bad', b);
      b.status = 'Crops rotted';
    }
    b.growth = 0;
    b.blocked = BLOCK_SEASONAL;
  } else if (month >= 7) {
    b.growth = 0;
    b.status = month >= 9 ? 'Fields resting for winter' : 'Fields harvested';
    b.blocked = BLOCK_SEASONAL;
  }
}

function passiveStatus(s: GameState, b: Building): string {
  const d = BUILDINGS[b.type];
  if (d.workers > 0 && b.workers === 0) return 'No workers available';
  switch (b.type) {
    case 'house':
    case 'townhall': {
      const cap = housingOf(b);
      if (b.residents === 0) return 'Empty, waiting for settlers';
      if (b.residents < cap) return `Home to ${b.residents}, room for ${cap - b.residents} more`;
      return `Home to ${b.residents} villagers`;
    }
    case 'well':
    case 'garden':
    case 'maypole':
    case 'statue':
    case 'church': {
      let homes = 0;
      const c = bCenter(b);
      for (const o of s.buildings) {
        if (o.residents === 0) continue;
        const oc = bCenter(o);
        if (Math.hypot(oc.x - c.x, oc.y - c.y) <= d.radius) homes++;
      }
      return homes ? `Cheering ${homes} home${homes > 1 ? 's' : ''} nearby` : 'No homes nearby yet';
    }
    case 'storehouse':
      return `Materials in store: ${Math.floor(stored(s, 'materials'))} / ${storageCap(s, 'materials')}`;
    case 'granary':
      return `Food in store: ${Math.floor(stored(s, 'food'))} / ${storageCap(s, 'food')}`;
    default:
      return 'Operating';
  }
}

/**
 * Share of time spent working rather than walking: trips to storage and to
 * the trees, rocks or bushes being gathered both slow a workplace down.
 */
export function workEfficiency(b: Building): number {
  const d = BUILDINGS[b.type];
  if (!d.cycle) return 1;
  const toResource = d.gathers && d.gathers !== 'water' && d.gathers !== 'forest' ? (2 * (b.resDist ?? d.radius / 2)) / OFFROAD_TILES_PER_DAY : 0;
  const walking = ((b.trip ?? 0) + toResource) / Math.max(1, d.workers);
  return d.cycle / (d.cycle + TRAVEL_WEIGHT * walking);
}

export function dailyProduction(s: GameState, rng: StateRng): void {
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    if (b.build < 1) continue;
    if (b.paused) {
      b.status = 'Paused';
      b.blocked = 0;
      continue;
    }
    if (b.type === 'farm') {
      stepFarm(s, b);
      continue;
    }
    if (d.workers === 0 || d.cycle === 0) {
      b.status = passiveStatus(s, b);
      continue;
    }
    if (b.workers === 0) {
      // Keep a blocked status so the job queue does not flip-flop daily;
      // blocked buildings are retried at the start of each month.
      if (!isBlocked(b)) b.status = 'No workers available';
      continue;
    }
    b.efficiency = workEfficiency(b);
    b.work += ((b.workers / d.workers) * b.efficiency) / d.cycle;
    let status: string | null = null;
    let tried = false;
    while (b.work >= 1) {
      tried = true;
      status = produce(s, b, rng);
      if (status) {
        b.work = 1;
        break;
      }
      b.work -= 1;
    }
    if (tried) {
      // Winter rest and full storage are normal pauses, not problems to flag.
      const idle = (b.type === 'forager' && seasonOf(s.day) === 3) || status === 'Storage full' || !!status?.startsWith('Enough');
      b.blocked = status ? (idle ? BLOCK_SEASONAL : BLOCK_PROBLEM) : 0;
    }
    if (status || !b.blocked) b.status = status ?? 'Working';
  }
}

// ---------------------------------------------------------------- construction

/** Most builders that work one site at once. */
export const MAX_BUILDERS = 4;
/** Share of a building-day of work one builder does per day. */
export const LABOUR_PER_BUILDER = 0.7;

/** Construction sites in the order builders attend to them. */
export function constructionSites(s: GameState): Building[] {
  return s.buildings.filter(isProject).sort((a, b) => a.id - b.id);
}

export function needsMaterials(b: Building): boolean {
  if (!b.need) return false;
  for (const k in b.need) if ((b.need[k as ResourceId] ?? 0) > 0) return true;
  return false;
}

/**
 * Builders first carry the materials over from storage, a load per trip,
 * then raise the building (or carry out the renovation).
 */
export function dailyConstruction(s: GameState): void {
  for (const b of constructionSites(s)) {
    const n = b.builders ?? 0;
    const d = BUILDINGS[b.type];
    const renovating = b.build >= 1;
    const setStatus = (text: string) => {
      if (!renovating) b.status = text;
    };
    if (needsMaterials(b)) {
      if (n === 0) {
        setStatus(b.paused ? 'Paused' : 'Waiting for builders');
        continue;
      }
      // Each builder brings one load per round trip. Renovations keep their
      // own tally so they do not disturb production.
      const carry = (n * CARRY_LOAD) / ((b.trip ?? 0) + 0.5);
      let pool = (renovating ? (b.carry ?? 0) : b.work) + carry;
      let missing = '';
      for (const k in b.need) {
        const id = k as ResourceId;
        const want = b.need![id] ?? 0;
        if (want <= 0) continue;
        const take = Math.min(Math.floor(pool), want, Math.floor(s.res[id]));
        if (take > 0) {
          s.res[id] -= take;
          b.need![id] = want - take;
          pool -= take;
        }
        if ((b.need![id] ?? 0) > 0 && s.res[id] < 1) missing = RESOURCE_INFO_NAMES[id] ?? id;
      }
      // Loads cannot pile up beyond a trip's worth while waiting for goods.
      pool = Math.min(pool, n * CARRY_LOAD);
      if (!needsMaterials(b)) pool = 0;
      if (renovating) b.carry = pool;
      else b.work = pool;
      setStatus(missing ? `Waiting for ${missing} in storage` : `Carrying materials (${n} builder${n > 1 ? 's' : ''})`);
      continue;
    }
    if (n === 0) {
      setStatus(b.paused ? 'Paused' : 'Waiting for builders');
      continue;
    }
    if (renovating) {
      b.upProgress = Math.min(1, (b.upProgress ?? 0) + (n * LABOUR_PER_BUILDER) / upgradeDays(b));
      if (b.upProgress >= 1) {
        b.carry = 0;
        finishUpgrade(s, b);
      }
      continue;
    }
    b.build = Math.min(1, b.build + (n * LABOUR_PER_BUILDER) / d.buildDays);
    b.status = `Raising the walls (${n} builder${n > 1 ? 's' : ''})`;
    if (b.build >= 1) {
      b.status = 'Completed';
      b.need = undefined;
      b.work = 0;
      log(s, `${d.name} completed.`, 'info', b);
      s.dirty = true;
    }
  }
}

const RESOURCE_INFO_NAMES: Partial<Record<ResourceId, string>> = {
  wood: 'timber',
  stone: 'stone',
  planks: 'planks',
  iron: 'iron',
  tools: 'tools',
};

// ---------------------------------------------------------------- monthly

const VARIETY_BONUS = [0, 0, 6, 12, 18];

/**
 * Feeds `mouths` villagers for a month from the stores, spreading meals
 * across foods. Returns how many went hungry and how many food groups
 * (grain, meat, produce, dairy) were on the table.
 */
export function eatFood(s: GameState, mouths: number): { hungry: number; groups: number } {
  let need = mouths;
  const groups = new Set<string>();
  while (need > 0.001) {
    let ate = false;
    for (const f of FOOD_IDS) {
      if (need <= 0.001) break;
      if (s.res[f] >= 1) {
        s.res[f] -= 1;
        need -= GOODS[f].food ?? 1;
        ate = true;
        groups.add(GOODS[f].foodGroup ?? f);
      }
    }
    if (!ate) break;
  }
  return { hungry: Math.max(0, Math.ceil(need - 0.001)), groups: groups.size };
}

export function monthly(s: GameState, rng: StateRng): void {
  const month = monthOf(s.day); // the month that just started
  const prevMonth = (month + MONTHS_PER_YEAR - 1) % MONTHS_PER_YEAR;
  const report = s.report;
  report.arrived = 0;
  report.left = 0;

  for (const b of s.buildings) {
    b.lastOutput = b.output;
    b.output = 0;
    // Retry blocked workplaces each month. Farms recompute their own state
    // on the next day, so only their flag is cleared.
    if (isBlocked(b)) {
      b.blocked = 0;
      if (b.type !== 'farm') b.status = 'Looking for work';
    }
  }

  // Eating: each villager needs one unit of nourishment a month. Villagers
  // take a little of every food in turn; richer foods go further.
  const eaten = eatFood(s, s.population);
  report.eaten = s.population - eaten.hungry;
  report.shortage = eaten.hungry;
  report.variety = eaten.groups;
  const need = eaten.hungry;
  if (need > 0) log(s, `Food shortage! ${need} villagers went hungry.`, 'bad');

  // Firewood in winter: one log per household.
  report.cold = false;
  if (Math.floor(prevMonth / 3) === 3) {
    const homes = s.buildings.filter((b) => b.residents > 0).length;
    if (s.res.wood >= homes) {
      s.res.wood -= homes;
    } else {
      s.res.wood = 0;
      report.cold = true;
      log(s, 'Not enough firewood! Families are freezing.', 'bad');
    }
  }

  // Taxes.
  const tax = TAX_LEVELS[s.taxLevel];
  let taxes = 0;
  for (const b of s.buildings) {
    if (b.residents === 0) continue;
    taxes += b.residents * tax.perHead * (b.type === 'house' ? (HOUSE_LEVELS[b.level]?.tax ?? 1) : 1);
  }
  report.taxes = Math.floor(taxes);
  s.res.gold += report.taxes;
  serveAle(s);
  report.trade = exportGoods(s);

  updateHappiness(s);
  migrate(s, rng);
  s.moods = (s.moods ?? []).filter((m) => m.until > s.day);
  rollEvent(s, rng, month);

  if (month <= 5) regrowForests(s, rng);

  // Bushes fruit in spring and again in summer.
  if (month === 0 || month === 4) s.berries.set(s.berriesMax);
  if (month === 0) log(s, `Spring of year ${yearOf(s.day)} has arrived.`, 'info');
  if (month === 9) log(s, 'Winter is here. Keep timber stocked for firewood.', 'info');

  updateTier(s);
  checkQuests(s);
  advise(s, month);
  s.history.push({ d: s.day, pop: s.population, food: Math.floor(totalFood(s)), happy: s.happiness, gold: Math.floor(s.res.gold) });
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
}

/** Months of history kept for the ledger (30 years). */
export const MAX_HISTORY = 360;

/** Decoration beauty enjoyed by a home, capped. */
export function beautyAt(s: GameState, home: Building): number {
  const c = bCenter(home);
  let total = 0;
  for (const o of s.buildings) {
    const d = BUILDINGS[o.type];
    if (!d.beauty || o.build < 1) continue;
    const oc = bCenter(o);
    if (Math.hypot(oc.x - c.x, oc.y - c.y) <= d.radius) total += d.beauty;
  }
  return Math.min(MAX_BEAUTY, total);
}

/**
 * Natural regrowth during the growing season: thin woods thicken and forest
 * edges creep onto open meadow, so timber never runs out entirely.
 */
export function regrowForests(s: GameState, rng: StateRng): void {
  const n = s.width * s.height;
  const samples = Math.floor(n / 12);
  for (let k = 0; k < samples; k++) {
    const i = rng.int(n);
    if (s.terrain[i] || s.occ[i] >= 0 || s.road[i] || s.rock[i] || s.ore[i] || s.berriesMax[i]) continue;
    if (s.trees[i] > 0) {
      if (s.trees[i] < 4 && rng.next() < 0.25) s.trees[i]++;
      continue;
    }
    const x = i % s.width;
    const y = (i - x) / s.width;
    let neighbours = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (inBounds(s, x + dx, y + dy) && s.trees[idx(s, x + dx, y + dy)] >= 2) neighbours++;
    }
    if (neighbours >= 2 && rng.next() < 0.12) s.trees[i] = 1;
  }
}

export function updateHappiness(s: GameState): void {
  const factors: { label: string; value: number }[] = [];
  factors.push({ label: 'Base contentment', value: 50 });
  const r = s.report;
  if (s.population > 0) {
    const variety = VARIETY_BONUS[Math.min(4, r.variety)];
    if (variety) factors.push({ label: `Food variety (${r.variety} food groups)`, value: variety });
    if (r.shortage > 0) factors.push({ label: 'Hunger', value: -Math.round(15 + 30 * (r.shortage / s.population)) });
  }
  if (r.cold) factors.push({ label: 'No firewood', value: -20 });
  const tax = TAX_LEVELS[s.taxLevel];
  if (tax.happiness) factors.push({ label: `${tax.name} taxes`, value: tax.happiness });

  let residents = 0;
  let well = 0;
  let market = 0;
  let church = 0;
  let upgraded = 0;
  let beauty = 0;
  let tavern = 0;
  let unmet = 0;
  for (const b of s.buildings) {
    if (b.residents === 0) continue;
    residents += b.residents;
    beauty += beautyAt(s, b) * b.residents;
    if (coveredBy(s, b, 'tavern')) tavern += b.residents;
    if (b.type === 'house') {
      // Finer homes expect more; unmet needs sour the mood inside.
      b.unmet = houseNeeds(s, b, b.level)
        .filter((n) => !n.met)
        .map((n) => n.label);
      if (b.level >= 2 && b.unmet.some((u) => u !== 'Enough food' && u !== 'Firewood in winter')) unmet += b.residents;
    }
    if (coveredBy(s, b, 'well')) well += b.residents;
    if (coveredBy(s, b, 'market')) market += b.residents;
    if (coveredBy(s, b, 'church')) church += b.residents;
    if (b.type === 'house' && b.level >= 2) upgraded += b.residents;
  }
  const homeless = Math.max(0, s.population - residents);
  if (residents > 0) {
    if (well) factors.push({ label: 'Wells nearby', value: Math.round((8 * well) / residents) });
    if (market) factors.push({ label: 'Market nearby', value: Math.round((10 * market) / residents) });
    if (church) factors.push({ label: 'Church nearby', value: Math.round((15 * church) / residents) });
    if (tavern) factors.push({ label: 'Tavern nearby', value: Math.round((8 * tavern) / residents) });
    if (upgraded) factors.push({ label: 'Fine houses', value: Math.round((6 * upgraded) / residents) });
    if (unmet) factors.push({ label: 'Homes lacking what they need', value: -Math.round((14 * unmet) / residents) });
    if (beauty) factors.push({ label: 'Beautiful surroundings', value: Math.round(beauty / residents) });
  }
  for (const m of s.moods ?? []) if (m.until > s.day) factors.push({ label: m.label, value: m.value });
  if (homeless > 0 && s.population > 0) {
    factors.push({ label: 'Homelessness', value: -Math.round(5 + (20 * homeless) / s.population) });
  }
  const target = Math.max(0, Math.min(100, factors.reduce((a, f) => a + f.value, 0)));
  s.happinessFactors = factors.filter((f) => f.value !== 0);
  s.happinessTarget = target;
  s.happiness = Math.round(s.happiness + (target - s.happiness) * 0.5);
}

function migrate(s: GameState, rng: StateRng): void {
  const housing = totalHousing(s);
  const r = s.report;
  // Homeless villagers leave first.
  if (s.population > housing) {
    const n = Math.min(s.population - housing, Math.max(1, Math.ceil((s.population - housing) / 2)));
    s.population -= n;
    r.left += n;
    log(s, `${n} homeless villagers left the settlement.`, 'bad');
  }
  if ((s.happiness < 30 || r.shortage > 0) && s.population > 2 && !s.relaxed) {
    const n = Math.max(1, Math.round(s.population * (r.shortage > 0 ? 0.12 : 0.06)));
    const actual = Math.min(n, s.population - 2);
    s.population -= actual;
    r.left += actual;
    if (actual > 0) log(s, `${actual} unhappy villagers packed up and left.`, 'bad');
  } else if (s.happiness < 30 || r.shortage > 0) {
    // Relaxed mode: nobody leaves, but nobody new arrives either.
  } else if (s.happiness >= 50 && r.shortage === 0) {
    const free = housing - s.population;
    if (free > 0) {
      const n = Math.min(free, 1 + Math.floor((s.happiness - 50) / 12) + rng.int(2));
      s.population += n;
      r.arrived += n;
      log(s, `${n} settler${n > 1 ? 's' : ''} arrived seeking a new life.`, 'info');
    }
  }
  recompute(s);
}

/** The settlement's rank follows the manor's level. */
export function updateTier(s: GameState): void {
  const hall = s.buildings.find((b) => b.type === 'townhall');
  if (hall) s.tier = Math.max(0, Math.min(TIERS.length - 1, hall.level - 1));
}

/** Requirements for raising the manor (and so the settlement), for the UI. */
export function nextTierRequirements(s: GameState): string[] {
  const hall = s.buildings.find((b) => b.type === 'townhall');
  if (!hall || s.tier >= TIERS.length - 1) return [];
  const plan = upgradePlan(s, hall);
  if (!plan) return [];
  return [...plan.reqs.map((r) => `${r.label}${r.met ? ' ✓' : ''}`), `then raise the manor`];
}

// ---------------------------------------------------------------- main step

export function stepDay(s: GameState): void {
  const rng = new StateRng(s);
  recompute(s);
  dailyConstruction(s);
  dailyProduction(s, rng);
  noteSeen(s);
  s.day++;
  if (s.day % DAYS_PER_MONTH === 0) monthly(s, rng);
  if (s.dirty) recompute(s);
}

export { getBuilding };
