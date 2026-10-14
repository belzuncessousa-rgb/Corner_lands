import {
  BASE_STORAGE,
  BUILDINGS,
  DAYS_PER_MONTH,
  HOUSE_L2_HOUSING,
  HOUSE_UPGRADE_COST,
  MAX_BEAUTY,
  MONTHS_PER_YEAR,
  SELL_FACTOR,
  STOREHOUSE_STORAGE,
  TAX_LEVELS,
  TIERS,
  TRADE_PRICES,
} from './data';
import { advise } from './advisor';
import { rollEvent } from './events';
import { checkQuests } from './quests';
import { StateRng } from './rng';
import type { Building, BuildingType, Category, Cost, GameState, ResourceId, Season } from './types';
import { FOOD_IDS } from './types';
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

export function log(s: GameState, text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  s.messages.push({ day: s.day, text, kind });
  if (s.messages.length > 40) s.messages.splice(0, s.messages.length - 40);
}

// ---------------------------------------------------------------- resources

export function storageCap(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b.type === 'storehouse' && b.build >= 1) n++;
  return BASE_STORAGE + n * STOREHOUSE_STORAGE;
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
    s.res[id] += Math.floor((cost[id] ?? 0) * factor);
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
  if (!canAfford(s, d.cost)) return 'Not enough resources';
  return null;
}

export function placeOrder(s: GameState, type: BuildingType, x: number, y: number): Building | null {
  if (placementError(s, type, x, y)) return null;
  const d = BUILDINGS[type];
  pay(s, d.cost);
  const b = makeBuilding(s.nextId++, type, x, y);
  placeBuilding(s, b);
  recompute(s);
  return b;
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
  // Unfinished sites refund fully, finished buildings half.
  refund(s, d.cost, b.build >= 1 ? 0.5 : 1);
  removeBuilding(s, b);
  recompute(s);
  return true;
}

export function canUpgrade(s: GameState, b: Building): string | null {
  if (b.type !== 'house') return 'Only houses can be upgraded';
  if (b.level >= 2) return 'Already upgraded';
  if (b.build < 1) return 'Still under construction';
  if (s.tier < 2) return `Requires ${TIERS[2].name}`;
  if (!coveredBy(s, b, 'market')) return 'Needs a marketplace nearby';
  if (!canAfford(s, HOUSE_UPGRADE_COST)) return 'Not enough resources';
  return null;
}

export function upgradeHouse(s: GameState, b: Building): boolean {
  if (canUpgrade(s, b)) return false;
  pay(s, HOUSE_UPGRADE_COST);
  b.level = 2;
  s.dirty = true;
  log(s, 'A family has upgraded their home.', 'good');
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
    if (s.res[id] + amount > storageCap(s)) return 'Not enough storage';
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

function coveredBy(s: GameState, b: Building, type: BuildingType): boolean {
  const r = BUILDINGS[type].radius;
  const c = bCenter(b);
  for (const o of s.buildings) {
    if (o.type !== type || o.build < 1) continue;
    if (BUILDINGS[type].workers > 0 && o.workers === 0) continue;
    const oc = bCenter(o);
    if (Math.hypot(oc.x - c.x, oc.y - c.y) <= r) return true;
  }
  return false;
}

// ---------------------------------------------------------------- road network

/** Marks buildings connected to the manor hall by road. */
export function computeConnectivity(s: GameState): Uint8Array {
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
    const nb = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of nb) {
      if (!inBounds(s, nx, ny)) continue;
      const j = ny * s.width + nx;
      if (s.road[j] && !reached[j]) {
        reached[j] = 1;
        queue.push(j);
      }
    }
  }
  for (const b of s.buildings) {
    if (b.type === 'townhall') {
      b.connected = true;
      continue;
    }
    let ok = false;
    forPerimeter(s, b, (i) => {
      if (reached[i]) ok = true;
    });
    b.connected = ok;
  }
  return reached;
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
  return best ?? { x: b.x + Math.floor(b.w / 2), y: b.y + b.h };
}

// ---------------------------------------------------------------- recompute

const BLOCKED = /^(No |Bushes|Storage full|Waiting|Not enough|Fields lie|Fields resting|Fields harvested)/;

/** True when the building's last status says it cannot currently produce. */
export function isBlocked(b: Building): boolean {
  return b.build >= 1 && BLOCKED.test(b.status) && b.status !== 'No workers available';
}

export function housingOf(b: Building): number {
  if (b.build < 1 || !b.connected) return 0;
  if (b.type === 'house') return b.level >= 2 ? HOUSE_L2_HOUSING : BUILDINGS.house.housing;
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
  for (const b of s.buildings) n += b.workers;
  return n;
}

/** Re-runs connectivity, distributes residents and assigns jobs. */
export function recompute(s: GameState): void {
  if (s.dirty) {
    computeConnectivity(s);
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
  // Workers.
  let free = s.population;
  // Buildings that could not work last time go to the back of the queue, so
  // villagers are not stuck at a forager with no berries while a hunter idles.
  const prio = (b: Building) =>
    CATEGORY_PRIORITY[BUILDINGS[b.type].category] + (TYPE_PRIORITY[b.type] ?? 0) + (isBlocked(b) ? 10 : 0);
  const jobs = s.buildings.filter((b) => BUILDINGS[b.type].workers > 0).sort((a, b) => prio(a) - prio(b) || a.id - b.id);
  for (const b of s.buildings) b.workers = 0;
  for (const b of jobs) {
    if (b.build < 1 || !b.connected || b.paused) continue;
    const n = Math.min(free, BUILDINGS[b.type].workers);
    b.workers = n;
    free -= n;
  }
}

// ---------------------------------------------------------------- production

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

function addOutput(s: GameState, b: Building, out: Cost, cap: number): boolean {
  for (const k in out) {
    const id = k as ResourceId;
    if (id !== 'gold' && s.res[id] >= cap) return false;
  }
  for (const k in out) {
    const id = k as ResourceId;
    const n = out[id] ?? 0;
    s.res[id] = id === 'gold' ? s.res[id] + n : Math.min(cap, s.res[id] + n);
    b.output += n;
  }
  return true;
}

/** Performs one production cycle. Returns a status string on failure. */
function produce(s: GameState, b: Building, rng: StateRng, cap: number): string | null {
  const d = BUILDINGS[b.type];
  const season = seasonOf(s.day);
  switch (b.type) {
    case 'woodcutter': {
      if (s.res.wood >= cap) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (s.trees[i] > 0 ? dist - s.trees[i] * 1.2 : null));
      if (t < 0) return 'No trees in range';
      s.trees[t]--;
      addOutput(s, b, d.outputs, cap);
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
      if (s.res[out] >= cap) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (arr[i] > 0 ? dist : null));
      if (t < 0) return b.type === 'quarry' ? 'No rock in range' : 'No ore in range';
      arr[t]--;
      addOutput(s, b, d.outputs, cap);
      return null;
    }
    case 'forager': {
      if (season === 3) return 'Bushes are bare in winter';
      if (s.res.berries >= cap) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (s.berries[i] > 0 ? dist : null));
      if (t < 0) {
        return countInRadius(s, bCenter(b), d.radius, (i) => s.berriesMax[i] > 0) > 0
          ? 'Bushes picked clean for now'
          : 'No berry bushes in range';
      }
      s.berries[t]--;
      addOutput(s, b, d.outputs, cap);
      return null;
    }
    case 'hunter': {
      const forest = countInRadius(s, bCenter(b), d.radius, (i) => s.trees[i] > 0);
      if (forest < 8) return 'Not enough forest for game';
      if (s.res.meat >= cap) return 'Storage full';
      const amount = Math.max(1, Math.round((d.outputs.meat ?? 0) * Math.min(1, forest / 40)));
      addOutput(s, b, { meat: amount }, cap);
      return null;
    }
    case 'fisher': {
      const water = countInRadius(s, bCenter(b), d.radius, (i) => s.terrain[i] === 1);
      if (water < 2) return 'No water nearby';
      if (s.res.fish >= cap) return 'Storage full';
      const amount = Math.max(1, Math.round((d.outputs.fish ?? 0) * Math.min(1, water / 12) * (season === 3 ? 0.5 : 1)));
      addOutput(s, b, { fish: amount }, cap);
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
      for (const k in d.outputs) {
        const id = k as ResourceId;
        if (id !== 'gold' && s.res[id] >= cap) return 'Storage full';
      }
      pay(s, d.inputs);
      addOutput(s, b, d.outputs, cap);
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

function stepFarm(s: GameState, b: Building, cap: number): void {
  const month = monthOf(s.day);
  const crew = b.workers / BUILDINGS.farm.workers;
  if (month <= 5) {
    if (crew > 0) b.growth = Math.min(1, b.growth + crew / 50);
    b.status = crew > 0 ? (month < 3 ? 'Sowing the fields' : 'Tending the crops') : 'Fields untended';
  } else if (month === 6) {
    b.status = b.growth > 0 ? 'Crops ripening' : 'Fields lie fallow';
  } else if (month === 7 && s.day % DAYS_PER_MONTH === 0 && b.growth > 0) {
    if (crew > 0) {
      const amount = Math.round(FARM_YIELD * b.growth * (0.5 + 0.5 * farmFertility(s, b)) * (0.6 + 0.4 * crew));
      const before = s.res.grain;
      s.res.grain = Math.max(before, Math.min(cap, before + amount));
      const gained = s.res.grain - before;
      b.output += gained;
      if (gained < amount) log(s, `Harvest! A farm brought in ${gained} grain; ${amount - gained} spoiled for lack of storage.`, 'bad');
      else log(s, `Harvest! A farm brought in ${gained} grain.`, 'good');
      b.status = 'Harvest gathered';
    } else {
      log(s, 'Crops rotted in an unstaffed field.', 'bad');
      b.status = 'Crops rotted';
    }
    b.growth = 0;
  } else if (month >= 7) {
    b.growth = 0;
    b.status = month >= 9 ? 'Fields resting for winter' : 'Fields harvested';
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
      return `Storing goods (limit ${storageCap(s)} each)`;
    default:
      return 'Operating';
  }
}

export function dailyProduction(s: GameState, rng: StateRng): void {
  const cap = storageCap(s);
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    if (b.build < 1) continue;
    if (!b.connected && b.type !== 'townhall') {
      b.status = 'No road to the manor';
      continue;
    }
    if (b.paused) {
      b.status = 'Paused';
      continue;
    }
    if (b.type === 'farm') {
      stepFarm(s, b, cap);
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
    b.work += b.workers / d.workers / d.cycle;
    let status: string | null = null;
    while (b.work >= 1) {
      status = produce(s, b, rng, cap);
      if (status) {
        b.work = 1;
        break;
      }
      b.work -= 1;
    }
    b.status = status ?? 'Working';
  }
}

// ---------------------------------------------------------------- construction

export function dailyConstruction(s: GameState): void {
  let helpers = Math.max(0, s.population - employed(s));
  const sites = s.buildings.filter((b) => b.build < 1).sort((a, b) => a.id - b.id);
  for (const b of sites) {
    if (!b.connected) {
      b.status = 'Needs a road to the manor';
      continue;
    }
    const n = Math.min(helpers, 3);
    helpers -= n;
    b.workers = 0;
    const d = BUILDINGS[b.type];
    b.build = Math.min(1, b.build + (1 + n * 0.6) / d.buildDays);
    b.status = `Under construction (${n} helping)`;
    if (b.build >= 1) {
      b.status = 'Completed';
      log(s, `${d.name} completed.`, 'good');
      s.dirty = true;
    }
  }
}

// ---------------------------------------------------------------- monthly

const VARIETY_BONUS = [0, 0, 6, 12, 18];

export function monthly(s: GameState, rng: StateRng): void {
  const month = monthOf(s.day); // the month that just started
  const prevMonth = (month + MONTHS_PER_YEAR - 1) % MONTHS_PER_YEAR;
  const report = s.report;
  report.arrived = 0;
  report.left = 0;

  for (const b of s.buildings) {
    b.lastOutput = b.output;
    b.output = 0;
    if (isBlocked(b) && b.type !== 'farm') b.status = 'Looking for work';
  }

  // Eating: one unit per villager per month, spread across food types.
  let need = s.population;
  const eatenTypes = new Set<ResourceId>();
  while (need > 0) {
    let ate = false;
    for (const f of FOOD_IDS) {
      if (need <= 0) break;
      if (s.res[f] >= 1) {
        s.res[f] -= 1;
        need--;
        ate = true;
        eatenTypes.add(f);
      }
    }
    if (!ate) break;
  }
  report.eaten = s.population - need;
  report.shortage = need;
  report.variety = eatenTypes.size;
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
    taxes += b.residents * tax.perHead * (b.type === 'house' && b.level >= 2 ? 1.5 : 1);
  }
  report.taxes = Math.floor(taxes);
  s.res.gold += report.taxes;

  updateHappiness(s);
  migrate(s, rng);
  if (rollEvent(s, rng, month)) recompute(s);

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
    if (variety) factors.push({ label: `Food variety (${r.variety} kinds)`, value: variety });
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
  for (const b of s.buildings) {
    if (b.residents === 0) continue;
    residents += b.residents;
    beauty += beautyAt(s, b) * b.residents;
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
    if (upgraded) factors.push({ label: 'Fine houses', value: Math.round((6 * upgraded) / residents) });
    if (beauty) factors.push({ label: 'Beautiful surroundings', value: Math.round(beauty / residents) });
  }
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
      log(s, `${n} settler${n > 1 ? 's' : ''} arrived seeking a new life.`, 'good');
    }
  }
  recompute(s);
}

export function updateTier(s: GameState): void {
  while (s.tier < TIERS.length - 1) {
    const next = TIERS[s.tier + 1];
    if (s.population < next.pop) break;
    if (s.tier + 1 === 2 && !hasBuilt(s, 'market')) break;
    if (s.tier + 1 === 3 && !hasBuilt(s, 'church')) break;
    s.tier++;
    log(s, `Your settlement is now a ${next.name}! ${next.desc}`, 'good');
  }
}

/** Requirements for reaching the next tier, for the UI. */
export function nextTierRequirements(s: GameState): string[] {
  if (s.tier >= TIERS.length - 1) return [];
  const next = TIERS[s.tier + 1];
  const req = [`${next.pop} villagers (${s.population})`];
  if (s.tier + 1 === 2) req.push(`A marketplace${hasBuilt(s, 'market') ? ' ✓' : ''}`);
  if (s.tier + 1 === 3) req.push(`A church${hasBuilt(s, 'church') ? ' ✓' : ''}`);
  return req;
}

// ---------------------------------------------------------------- main step

export function stepDay(s: GameState): void {
  const rng = new StateRng(s);
  recompute(s);
  dailyConstruction(s);
  dailyProduction(s, rng);
  s.day++;
  if (s.day % DAYS_PER_MONTH === 0) monthly(s, rng);
  if (s.dirty) recompute(s);
}

export { getBuilding };
