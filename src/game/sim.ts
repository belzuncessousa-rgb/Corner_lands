import {
  BUILDINGS,
  CARRY_LOAD,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  HAUL_LOAD,
  OFFROAD_TILES_PER_DAY,
  RESOURCE_STORAGE,
  ROAD_TILES_PER_DAY,
  STONE_ROAD_TILES_PER_DAY,
  YARD_STORE,
  STORAGE_CAPACITY,
  type StorageKind,
  TRAVEL_WEIGHT,
  MAX_BEAUTY,
  MONTHS_PER_YEAR,
  MONTH_NAMES,
  type Recipe,
  type BuildingDef,
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
import { CHARTERS, hasCharter, onPath } from './charters';
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
  buildingName,
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

/** Most messages kept for the chronicle. */
export const MAX_MESSAGES = 40;

export function log(s: GameState, text: string, kind: MessageKind = 'info', at?: Building): void {
  s.messageCount = (s.messageCount ?? s.messages.length) + 1;
  s.messages.push({ day: s.day, text, kind, n: s.messageCount, ...(at ? { at: { x: at.x + at.w / 2, y: at.y + at.h / 2 } } : {}) });
  if (s.messages.length > MAX_MESSAGES) s.messages.splice(0, s.messages.length - MAX_MESSAGES);
}

// ---------------------------------------------------------------- resources

export function storageCap(s: GameState, kind: StorageKind): number {
  let n = 0;
  for (const b of s.buildings) {
    if (b.build < 1) continue;
    n += (STORAGE_CAPACITY[b.type]?.[kind] ?? 0) * (b.type === 'granary' && hasCharter(s, 'farm3a') ? 2 : 1);
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

/** Villager-months of food in store: richer foods count for more, grain and oats as pottage. */
export function larder(s: GameState): number {
  let n = 0;
  for (const f of FOOD_IDS) n += s.res[f] * (GOODS[f].food ?? 1);
  for (const f of POTTAGE) n += s.res[f] * POTTAGE_FOOD;
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
  const d = BUILDINGS[type];
  return d.tier <= s.tier && (!d.charter || hasCharter(s, d.charter));
}

/** Why a building is locked, for menus. */
export function lockReason(s: GameState, type: BuildingType): string | null {
  const d = BUILDINGS[type];
  if (d.tier > s.tier) return `Requires ${TIERS[d.tier].name}`;
  if (d.charter && !hasCharter(s, d.charter)) return `Requires the ${CHARTERS.find((c) => c.id === d.charter)?.name ?? d.charter} charter`;
  return null;
}

export function placementError(s: GameState, type: BuildingType, x: number, y: number): string | null {
  const d = BUILDINGS[type];
  if (!d.buildable) return 'Cannot be built';
  if (!isUnlocked(s, type)) return lockReason(s, type);
  const clear = footprintClear(s, x, y, d.w, d.h);
  if (clear) return clear;
  if ((type === 'fisher' || type === 'claypit') && countInRadius(s, centerOf(x, y, d.w, d.h), 2.5, (i) => s.terrain[i] === 1) < 2) {
    return 'Must be next to water';
  }
  if (type === 'cathedral' && s.buildings.some((b) => b.type === 'cathedral')) return 'Your town has its cathedral';
  if (type === 'guildhall' && s.buildings.some((b) => b.type === 'guildhall')) return 'Your town has its guildhall';
  if (type === 'belltower' && s.buildings.some((b) => b.type === 'belltower')) return 'Your town has its bell tower';
  if ((d.cost.gold ?? 0) > s.res.gold) return 'Not enough coins';
  return null;
}

/** Materials of a cost that builders must carry (gold is paid up front). */
export function materialsOf(cost: Cost): Cost {
  const out: Cost = {};
  for (const k in cost) if (k !== 'gold' && k !== 'prestige') out[k as ResourceId] = cost[k as ResourceId];
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

// ---------------------------------------------------------------- zones

export function isZone(type: BuildingType): boolean {
  return !!BUILDINGS[type].zone;
}

/** What it costs to lay out a zone: fences for pastures, saplings for orchards. */
export function zoneCost(type: BuildingType, w: number, h: number): Cost {
  if (type === 'pasture') return { wood: w + h };
  if (type === 'orchard') return { gold: 2 * w * h };
  return {};
}

function zoneRect(x0: number, y0: number, x1: number, y1: number) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}

/** Why a zone cannot be drawn between two corner tiles, or null. */
export function zoneError(s: GameState, type: BuildingType, x0: number, y0: number, x1: number, y1: number): string | null {
  const d = BUILDINGS[type];
  const z = d.zone;
  if (!z) return 'Not a zone';
  if (!isUnlocked(s, type)) return `Requires ${TIERS[d.tier].name}`;
  const r = zoneRect(x0, y0, x1, y1);
  if (r.w < z.min || r.h < z.min) return `At least ${z.min}×${z.min} tiles`;
  if (r.w > z.max || r.h > z.max) return `At most ${z.max}×${z.max} tiles`;
  const clear = footprintClear(s, r.x, r.y, r.w, r.h);
  if (clear) return clear;
  const cost = zoneCost(type, r.w, r.h);
  if (!canAfford(s, cost)) return cost.gold ? 'Not enough coins' : 'Not enough timber for fences';
  return null;
}

/** Lays out a field, pasture or orchard between two corner tiles. */
export function placeZone(s: GameState, type: BuildingType, x0: number, y0: number, x1: number, y1: number): Building | null {
  if (zoneError(s, type, x0, y0, x1, y1)) return null;
  const r = zoneRect(x0, y0, x1, y1);
  pay(s, zoneCost(type, r.w, r.h));
  const b = makeBuilding(s.nextId++, type, r.x, r.y);
  b.w = r.w;
  b.h = r.h;
  b.build = 1;
  if (type === 'orchard') b.age = 0;
  placeBuilding(s, b);
  recompute(s);
  return b;
}

/** Links every zone to the nearest workplace of its kind in range. */
function assignOwners(s: GameState): void {
  for (const z of s.buildings) {
    const zd = BUILDINGS[z.type].zone;
    if (!zd) continue;
    const c = bCenter(z);
    let best: Building | undefined;
    let bestD = Infinity;
    for (const o of s.buildings) {
      if (o.type !== zd.owner || o.build < 1) continue;
      const oc = bCenter(o);
      const d = Math.hypot(oc.x - c.x, oc.y - c.y);
      if (d <= BUILDINGS[o.type].radius + Math.max(z.w, z.h) / 2 && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    z.owner = best?.id;
  }
}

/** Fields, pastures or orchards tended from a workplace. */
export function zonesOf(s: GameState, b: Building): Building[] {
  return s.buildings.filter((z) => z.owner === b.id && BUILDINGS[z.type].zone);
}

export function zoneArea(zones: Building[]): number {
  return zones.reduce((a, z) => a + z.w * z.h, 0);
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

/** Stone for each tile of paved road. */
export const PAVING_COST: Cost = { stone: 2 };
/** Settlement rank needed to pave roads (none: stone is its own price). */
export const PAVING_TIER = 0;

export function roadError(s: GameState, x: number, y: number, paved = false): string | null {
  if (!inBounds(s, x, y)) return 'Outside the map';
  const i = idx(s, x, y);
  const planned = plannedRoad(s, i);
  if (planned && (paved ? planned === 2 : true)) return 'Already planned';
  if (s.occ[i] >= 0) return 'Occupied';
  if (s.rock[i] || s.ore[i]) return 'Rocky ground';
  if (paved) {
    if (s.tier < PAVING_TIER) return `Requires ${TIERS[PAVING_TIER].name}`;
    if (s.road[i] === 2) return 'Already paved';
    if (s.terrain[i] === 1) return s.road[i] ? 'Bridges stay timber' : 'Cannot pave water';
    if (!canAfford(s, PAVING_COST)) return 'Not enough stone';
    return null;
  }
  if (s.road[i]) return 'Already a road';
  if (s.terrain[i] === 1 && !canAfford(s, BRIDGE_COST)) return 'Not enough timber for a bridge';
  return null;
}

/** Lays a dirt road, or paves one (also laying it where there was none). */
export function buildRoad(s: GameState, x: number, y: number, paved = false): boolean {
  if (roadError(s, x, y, paved)) return false;
  if (paved) pay(s, PAVING_COST);
  else if (isBridge(s, x, y)) pay(s, BRIDGE_COST);
  setRoad(s, x, y, true, paved ? 2 : 1);
  return true;
}

export function removeRoad(s: GameState, x: number, y: number): boolean {
  if (!inBounds(s, x, y)) return false;
  const i = idx(s, x, y);
  if (plannedRoad(s, i)) {
    // An unlaid tile is simply struck from the plan, and what was paid comes back.
    const k = s.roadPlan!.findIndex((c) => c >> 2 === i);
    refundRoad(s, i, s.roadPlan![k] & 3);
    s.roadPlan!.splice(k, 1);
    return true;
  }
  if (!s.road[i]) return false;
  setRoad(s, x, y, false);
  return true;
}

/** Dirt road tiles a town lays in a day, and paved ones (stone is slower work). */
export const ROAD_LAY_PER_DAY = 16;
export const PAVE_LAY_PER_DAY = 6;

/** The kind of road planned on a tile and not laid yet (0 if none). */
export function plannedRoad(s: GameState, i: number): number {
  if (!s.roadPlan?.length) return 0;
  for (const c of s.roadPlan) if (c >> 2 === i) return c & 3;
  return 0;
}

function refundRoad(s: GameState, i: number, kind: number): void {
  if (kind === 2) refund(s, PAVING_COST, 1);
  else if (s.terrain[i] === 1) refund(s, BRIDGE_COST, 1);
}

/**
 * Plans a road tile for the villagers to lay: it is paid for now and laid in
 * a moment, in the order drawn (see layRoads).
 */
export function planRoad(s: GameState, x: number, y: number, paved = false): boolean {
  if (roadError(s, x, y, paved)) return false;
  if (paved) pay(s, PAVING_COST);
  else if (isBridge(s, x, y)) pay(s, BRIDGE_COST);
  const i = idx(s, x, y);
  (s.roadPlan ??= []).push(i * 4 + (paved ? 2 : 1));
  return true;
}

/** Lays planned road tiles as the days pass; returns how many were laid. */
export function layRoads(s: GameState, days: number): number {
  if (!s.roadPlan?.length) {
    s.roadWork = 0;
    return 0;
  }
  let work = (s.roadWork ?? 0) + days;
  let n = 0;
  while (s.roadPlan.length) {
    const c: number = s.roadPlan[0];
    const i = c >> 2;
    const kind = c & 3;
    const need = 1 / (kind === 2 ? PAVE_LAY_PER_DAY : ROAD_LAY_PER_DAY);
    if (work < need) break;
    work -= need;
    s.roadPlan.shift();
    if (s.occ[i] >= 0 || s.rock[i] || s.ore[i]) {
      // Something was built there meanwhile.
      refundRoad(s, i, kind);
      continue;
    }
    if (kind === 1 && s.road[i]) continue;
    setRoad(s, i % s.width, Math.floor(i / s.width), true, kind);
    n++;
  }
  s.roadWork = s.roadPlan.length ? work : 0;
  return n;
}

export function demolish(s: GameState, b: Building): boolean {
  if (b.type === 'townhall') return false;
  const d = BUILDINGS[b.type];
  // Sites return what was delivered (and the gold); finished buildings half.
  if (b.build >= 1) {
    refund(s, d.zone ? zoneCost(b.type, b.w, b.h) : d.cost, 0.5);
    if (b.upgrading) {
      // A renovation under way gives back its gold and what was carried in.
      const cost = upgradeCost(b);
      s.res.gold += cost.gold ?? 0;
      s.res.prestige += cost.prestige ?? 0;
      const back = deliveredTo(b);
      for (const k in back) store(s, k as ResourceId, back[k as ResourceId] ?? 0);
    }
  } else {
    s.res.gold += d.cost.gold ?? 0;
    const back = deliveredTo(b);
    for (const k in back) store(s, k as ResourceId, back[k as ResourceId] ?? 0);
  }
  // A farm's barn and a workplace's yard are emptied into the stores first.
  let lost = 0;
  for (const k in b.barn) {
    const n = b.barn[k as ResourceId] ?? 0;
    lost += n - store(s, k as ResourceId, n);
  }
  for (const k in b.stock) {
    const n = b.stock[k as ResourceId] ?? 0;
    lost += n - store(s, k as ResourceId, n);
  }
  if (lost > 0) log(s, `${Math.floor(lost)} sacks from the barn had no room in the stores and were lost.`, 'bad');
  removeBuilding(s, b);
  recompute(s);
  return true;
}

export function hasBuilt(s: GameState, type: BuildingType): boolean {
  return s.buildings.some((b) => b.type === type && b.build >= 1);
}

/** Coins to buy n units at the market. */
export function buyPrice(s: GameState, id: ResourceId, n: number): number {
  return Math.ceil(priceOf(s, id) * n * (hasCharter(s, 'trade1') ? 0.85 : 1));
}

/** Coins earned selling n units at the market. */
export function sellPrice(s: GameState, id: ResourceId, n: number): number {
  return Math.floor(priceOf(s, id) * SELL_FACTOR * n * (hasCharter(s, 'trade1') ? 1.2 : 1));
}

export function trade(s: GameState, id: ResourceId, amount: number): string | null {
  if (!hasBuilt(s, 'market')) return 'Requires a marketplace';
  if (!priceOf(s, id)) return 'Cannot trade this';
  if (amount > 0) {
    const cost = buyPrice(s, id, amount);
    if (s.res.gold < cost) return 'Not enough coins';
    if (roomFor(s, id) < amount) return 'Not enough storage';
    s.res.gold -= cost;
    s.res[id] += amount;
  } else {
    const n = -amount;
    if (s.res[id] < n) return 'Not enough goods';
    s.res[id] -= n;
    s.res.gold += sellPrice(s, id, n);
  }
  return null;
}

/** Market price of a good, with what charters add to it. */
export function priceOf(s: GameState, id: ResourceId): number {
  const base = TRADE_PRICES[id] ?? 0;
  const special: Partial<Record<ResourceId, string>> = { ale: 'farm3b', cheese: 'herd3b' };
  if (special[id] && hasCharter(s, special[id]!)) return base * 2;
  if ((id === 'wine' || id === 'cider') && hasCharter(s, 'orchard3a')) return base * 1.5;
  if (id === 'weapons' && hasCharter(s, 'metal3b')) return base * 1.5;
  if (id === 'books' && hasCharter(s, 'learning3b')) return base * 1.5;
  return base;
}

/** Drinks taverns pour, everyday ones first. */
export const TAVERN_DRINKS: ResourceId[] = ['ale', 'cider', 'mead', 'wine'];

/** Taverns pour ale, cider, mead or wine: a cask a month for every eight villagers they serve. */
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
    let casks = Math.ceil(served / 8);
    const poured: string[] = [];
    for (const d of TAVERN_DRINKS) {
      const n = Math.min(casks, Math.floor(s.res[d]));
      if (n <= 0) continue;
      s.res[d] -= n;
      casks -= n;
      poured.push(GOODS[d].name.toLowerCase());
    }
    if (casks <= 0) {
      t.blocked = 0;
      t.lack = undefined;
      const drinks = poured.join(' and ');
      t.status = served ? `Pouring ${drinks || 'drinks'} for ${served} villagers` : 'No homes nearby yet';
    } else {
      t.blocked = BLOCK_PROBLEM;
      t.status = 'The casks are dry: needs ale, cider, mead or wine';
      t.lack = 'ale';
    }
  }
}

/** Goods each home level uses up, one every three months. */
export const HOUSE_GOODS: Record<number, ResourceId[]> = { 2: ['clothes'], 3: ['clothes', 'boots', 'medicine'] };
const SUPPLY_DAYS = DAYS_PER_MONTH * 3;

/** Whether a home has (or could get from store) a good it needs. */
export function hasSupply(s: GameState, b: Building, id: ResourceId): boolean {
  return (b.supply?.[id] ?? -1) > s.day || s.res[id] >= 1;
}

/** Luxuries Townhouses enjoy (one at a time): they lift spirits and taxes. */
export const LUXURIES: ResourceId[] = ['jewellery', 'books', 'wine', 'mead'];

export function hasLuxury(s: GameState, b: Building): boolean {
  return LUXURIES.some((id) => (b.supply?.[id] ?? -1) > s.day);
}

/** Homes take clothes, boots and medicine from the stores as theirs wear out. */
function supplyHomes(s: GameState): void {
  for (const b of s.buildings) {
    if (b.type !== 'house' || b.residents === 0) continue;
    if (b.level >= 3 && !hasLuxury(s, b)) {
      const lux = LUXURIES.find((id) => s.res[id] >= 1);
      if (lux) {
        s.res[lux] -= 1;
        (b.supply ??= {})[lux] = s.day + SUPPLY_DAYS;
      }
    }
    for (const id of HOUSE_GOODS[Math.min(3, b.level)] ?? []) {
      b.supply ??= {};
      if ((b.supply[id] ?? -1) > s.day) continue;
      if (s.res[id] >= 1) {
        s.res[id] -= 1;
        b.supply[id] = s.day + SUPPLY_DAYS;
      }
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
    // Materials still owed to building sites come on top of the stock target.
    if (s.res[id] < keepOf(s, id) + owedTo(s, id)) return null;
    first ??= id;
  }
  return first;
}

/** How much of a good unfinished buildings and renovations still wait for. */
export function owedTo(s: GameState, id: ResourceId): number {
  let n = 0;
  for (const b of s.buildings) n += b.need?.[id] ?? 0;
  return n;
}

/** Goods the settlement has ever held, for menus that hide unknown goods. */
export function noteSeen(s: GameState): void {
  s.seen ??= [];
  for (const id of RESOURCE_IDS) if (s.res[id] > 0 && !s.seen.includes(id)) s.seen.push(id);
}

/** Monthly visit of merchants buying surplus goods at staffed markets. */
export function exportGoods(s: GameState): number {
  const markets = s.buildings.filter((b) => b.type === 'market' && b.build >= 1 && b.workers > 0).length;
  let budget = markets * EXPORT_PER_MARKET * (hasCharter(s, 'trade2') ? 2 : 1) * ((s.title ?? 0) >= 3 ? 1.5 : 1);
  const guild = s.buildings.some((b) => b.type === 'guildhall' && b.build >= 1 && b.workers > 0);
  let gold = 0;
  const sold: string[] = [];
  for (const k in s.sell ?? {}) {
    const id = k as ResourceId;
    const price = priceOf(s, id) * (hasCharter(s, 'trade3a') ? 1.3 : 1) * (guild ? 1.2 : 1);
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
      return countInRadius(s, c, d.radius, (i) => s.trees[i] > 0 && !inGrove(s, i));
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
  const c = bCenter(b);
  for (const o of s.buildings) {
    // A cathedral serves as a church, with a far wider reach.
    const serves = o.type === type || (type === 'church' && o.type === 'cathedral');
    if (!serves || o.build < 1) continue;
    if (BUILDINGS[o.type].workers > 0 && (o.workers === 0 || o.blocked === BLOCK_PROBLEM)) continue;
    const oc = bCenter(o);
    if (Math.hypot(oc.x - c.x, oc.y - c.y) <= BUILDINGS[o.type].radius) return true;
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
  if (s.road[i] === 2) return ROAD_TILES_PER_DAY / STONE_ROAD_TILES_PER_DAY;
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
  // Villagers walk across fields, pastures and orchards.
  // Fields can be walked across, and posterns let walkers through the town wall.
  const zones = new Set(s.buildings.filter((b) => BUILDINGS[b.type].zone || isPostern(b)).map((b) => b.id));
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
      if (s.occ[j] >= 0 && field[i] > 0 && !zones.has(s.occ[j])) continue;
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

const CATEGORY_PRIORITY: Record<Category, number> = { farming: 0, food: 0.5, resources: 1, industry: 2, civic: 3, housing: 4, decor: 5 };
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

/** Fells up to n units of timber from the trees around a site; false if there are none. */
function fellNear(s: GameState, b: Building, n: number): boolean {
  let got = 0;
  for (let r = 1; r <= 4 && got < n; r++) {
    for (let y = b.y - r; y < b.y + b.h + r && got < n; y++) {
      for (let x = b.x - r; x < b.x + b.w + r && got < n; x++) {
        if (!inBounds(s, x, y)) continue;
        const i = idx(s, x, y);
        if (s.trees[i] <= 0 || s.groves?.some((g) => x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h)) continue;
        s.trees[i]--;
        got += 2;
        if (!s.trees[i]) (s.stumps ??= {})[i] = s.day;
      }
    }
  }
  return got > 0;
}

/** True when a site still needs materials and none of them is in storage. */
export function starvedSite(s: GameState, b: Building): boolean {
  if (b.type === 'woodcutter' && b.build < 1) return false;
  if (!needsMaterials(b)) return false;
  for (const k in b.need) {
    const id = k as ResourceId;
    if ((b.need[id] ?? 0) > 0 && s.res[id] >= 1) return false;
  }
  return true;
}

/** Re-runs connectivity, distributes residents and assigns jobs. */
export function recompute(s: GameState): void {
  if (s.dirty) {
    assignOwners(s);
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
  // Player priority first, then food before materials before services.
  // Buildings that could not work last time go to the back of their band, so
  // villagers are not stuck at a forager with no berries while a hunter idles.
  const prio = (b: Building) =>
    (2 - (b.priority ?? 1)) * 100 +
    // Haulers keep every workplace's yard from filling: staffed with raw materials.
    (b.type === 'storehouse' || b.type === 'granary' ? 1.05 : CATEGORY_PRIORITY[workDef(b).category]) +
    (TYPE_PRIORITY[b.type] ?? 0) +
    (isBlocked(b) ? 10 : 0);
  type Job = { b: Building; site: boolean; p: number };
  const jobs: Job[] = [];
  for (const b of s.buildings) {
    b.workers = 0;
    b.builders = 0;
    // Pausing stops a workplace's production, not building work on it.
    // Town wall sections are a long project: after every workplace, so the
    // masons who make their stone keep working.
    // A site whose materials are all missing from storage holds no builders:
    // they would only stand about, while the woodcutters who could end the
    // wait went unstaffed.
    if (isProject(b) && !starvedSite(s, b)) jobs.push({ b, site: true, p: 100 + (b.type === 'wall' ? WALL_SITE_PRIORITY : SITE_PRIORITY) + b.id * 1e-6 });
    if (b.paused) continue;
    if (b.build >= 1 && workDef(b).workers > 0 && (b.want ?? 1) > 0 && !restingNow(s, b)) {
      // Families working a craft from home always tend to it first.
      jobs.push({ b, site: false, p: b.trade ? -1 : prio(b) });
    }
  }
  jobs.sort((a, c) => a.p - c.p || a.b.id - c.b.id);
  for (const j of jobs) {
    const n = Math.min(free, j.site ? (j.b.type === 'wall' ? 1 : SITE_BUILDERS) : Math.min(workersOf(j.b), j.b.want ?? Infinity));
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

/** Crafts a family may take up at home. */
export const HOME_TRADES: BuildingType[] = ['bakery', 'brewhouse', 'dairy', 'weaver', 'tailor', 'tanner', 'apothecary'];
/** Setting up a home workshop. */
export const HOME_TRADE_COST: Cost = { wood: 6, planks: 6 };
/** A family working from home produces this much more than a common workshop. */
export const HOME_TRADE_BONUS = 1.5;

/** What a building works as: its own kind, or the craft a family keeps at home. */
export function workDef(b: Building): BuildingDef {
  return b.trade ? BUILDINGS[b.trade] : BUILDINGS[b.type];
}

/** Why a home cannot take up a craft, or null. */
export function tradeError(s: GameState, b: Building, trade: BuildingType | undefined): string | null {
  if (b.type !== 'house' || b.build < 1) return 'Only homes';
  if (!trade) return null;
  if (!HOME_TRADES.includes(trade)) return 'Not a home craft';
  if (b.level < 2) return 'Only Timber Houses and Townhouses';
  if (!isUnlocked(s, trade)) return `Requires ${TIERS[BUILDINGS[trade].tier].name}`;
  if (b.trade !== trade && !canAfford(s, HOME_TRADE_COST)) return 'Needs 6 timber and 6 planks';
  return null;
}

/** Sets the family to work a craft from home (or gives it up). */
export function setTrade(s: GameState, b: Building, trade: BuildingType | undefined): string | null {
  const err = tradeError(s, b, trade);
  if (err) return err;
  if (trade && trade !== b.trade) pay(s, HOME_TRADE_COST);
  b.trade = trade;
  b.recipe = undefined;
  b.work = 0;
  b.blocked = 0;
  recompute(s);
  return null;
}

/** Whether a workplace needs hands this month. */
export function inSeason(s: GameState, b: Building): boolean {
  const months = workDef(b).months;
  return !months || months.includes(monthOf(s.day));
}

/**
 * True when a workplace sends its workers elsewhere for now: out of season,
 * or everything it makes is already at its stock target.
 */
export function restingNow(s: GameState, b: Building): boolean {
  if (!inSeason(s, b)) return true;
  // Batch workshops wait, without workers, until a full batch of inputs is in store.
  const def = workDef(b);
  if (def.batch && !b.batchOn) {
    if (!batchReady(s, b)) return true;
    b.batchOn = true;
  }
  // The harvest is brought in on the first day of its month; then farmers are free.
  if (b.type === 'farm' && monthOf(s.day) === 7 && s.day % DAYS_PER_MONTH !== 0) return true;
  // Foresters whose woods are full take other work until next month.
  if (b.blocked === BLOCK_SEASONAL && b.status === 'The woods are full') return true;
  if (b.blocked === BLOCK_SEASONAL && b.status.startsWith('Enough')) {
    const r = chooseRecipe(s, b, true);
    const out = r ? r.outputs : workDef(b).outputs;
    if (enoughOf(s, out)) return true;
    b.blocked = 0;
    b.status = 'Back to work';
  }
  return false;
}

/** Whether inputs for a whole batch of cycles are waiting in store. */
export function batchReady(s: GameState, b: Building): boolean {
  const d = workDef(b);
  const n = d.batch ?? 1;
  for (const k in d.inputs) if (s.res[k as ResourceId] < (d.inputs[k as ResourceId] ?? 0) * n) return false;
  return true;
}

/** The first month after `from` in which the workplace works again. */
export function nextSeasonMonth(s: GameState, b: Building): number | null {
  const months = workDef(b).months;
  if (!months) return null;
  const m = monthOf(s.day);
  for (let k = 1; k <= 12; k++) if (months.includes((m + k) % 12)) return (m + k) % 12;
  return null;
}

/** Products Auto should make first: firewood ahead of winter. */
function recipeUrgent(s: GameState, r: Recipe): boolean {
  if (r.id !== 'firewood') return false;
  const m = monthOf(s.day);
  if (m < 5 || m > 10) return false;
  const homes = s.buildings.filter((b) => b.residents > 0).length;
  return s.res.firewood < homes * 3;
}

function recipeInMonth(r: Recipe, month: number): boolean {
  return !r.months || r.months.includes(month);
}

/** Whether a recipe could run right now (season, inputs, map resources). */
function recipeReady(s: GameState, b: Building, r: Recipe): boolean {
  if (!recipeInMonth(r, monthOf(s.day))) return false;
  if (!canAfford(s, r.inputs)) return false;
  if (b.type === 'forager' && r.id === 'berries') {
    return countInRadius(s, bCenter(b), BUILDINGS.forager.radius, (i) => s.berries[i] > 0) > 0;
  }
  return true;
}

/**
 * The product a building makes now: its chosen recipe, or on Auto the first
 * one that is in season, has its inputs and is below its stock target.
 * `any` returns the chosen or first recipe regardless of readiness.
 */
export function chooseRecipe(s: GameState, b: Building, any = false): Recipe | null {
  const all = workDef(b).recipes;
  if (!all) return null;
  const list = all.filter((r) => !r.charter || hasCharter(s, r.charter));
  const fixed = b.recipe ? list.find((r) => r.id === b.recipe) : undefined;
  if (fixed) return any || recipeInMonth(fixed, monthOf(s.day)) ? fixed : null;
  const auto = list.filter((r) => r.auto !== false);
  const urgent = auto.find((r) => recipeUrgent(s, r) && recipeReady(s, b, r) && !enoughOf(s, r.outputs));
  if (urgent) return urgent;
  const pick = auto.find((r) => recipeReady(s, b, r) && !enoughOf(s, r.outputs));
  if (pick) return pick;
  if (any) return auto.find((r) => recipeInMonth(r, monthOf(s.day))) ?? auto[0] ?? null;
  return null;
}

export function setRecipe(_s: GameState, b: Building, id: string | undefined): void {
  // Replanting an orchard starts the trees over.
  if (b.type === 'orchard' && (b.recipe ?? 'apples') !== (id ?? 'apples')) {
    b.age = 0;
    b.growth = 0;
  }
  b.recipe = id;
  b.work = Math.min(b.work, 0.99);
  if (b.blocked) b.blocked = 0;
}

export function setWorkers(s: GameState, b: Building, want: number | undefined): void {
  b.want = want === undefined ? undefined : Math.max(0, Math.min(workersOf(b), Math.round(want)));
  if (b.want === workersOf(b)) b.want = undefined;
  recompute(s);
}

export function setPriority(s: GameState, b: Building, p: number): void {
  b.priority = Math.max(0, Math.min(2, p));
  if (b.priority === 1) b.priority = undefined;
  recompute(s);
}

export interface LabourSummary {
  population: number;
  workers: number;
  builders: number;
  idle: number;
  /** Worker slots resting for the season or because stocks are full. */
  resting: number;
  /** Workplaces with fewer workers than they want. */
  short: { b: Building; have: number; want: number }[];
  byCategory: { cat: Category; have: number; slots: number }[];
}

export function labourSummary(s: GameState): LabourSummary {
  const out: LabourSummary = { population: s.population, workers: 0, builders: 0, idle: 0, resting: 0, short: [], byCategory: [] };
  const cats = new Map<Category, { have: number; slots: number }>();
  for (const b of s.buildings) {
    out.builders += b.builders ?? 0;
    const d = workDef(b);
    if (b.build < 1 || d.workers === 0) continue;
    out.workers += b.workers;
    const want = b.paused ? 0 : Math.min(workersOf(b), b.want ?? Infinity);
    const resting = !b.paused && want > 0 && restingNow(s, b);
    if (resting) out.resting += want;
    const c = cats.get(d.category) ?? { have: 0, slots: 0 };
    c.have += b.workers;
    c.slots += resting ? 0 : want;
    cats.set(d.category, c);
    if (!resting && b.workers < want) out.short.push({ b, have: b.workers, want });
  }
  out.idle = Math.max(0, s.population - out.workers - out.builders);
  for (const [cat, v] of cats) out.byCategory.push({ cat, ...v });
  out.byCategory.sort((a, c) => CATEGORY_PRIORITY[a.cat] - CATEGORY_PRIORITY[c.cat]);
  return out;
}

/** Builders each construction site employs before idle villagers join in. */
export const SITE_BUILDERS = 2;
const SITE_PRIORITY = 1.5;
const WALL_SITE_PRIORITY = 6;

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

/** How much more (or less) a workplace makes thanks to the town's charters. */
export function charterBonus(s: GameState, b: Building, id: ResourceId): number {
  if (!s.charters?.length) return 1;
  const d = workDef(b);
  let f = 1;
  const t = b.trade ?? b.type;
  if ((t === 'forager' || t === 'hunter') && hasCharter(s, 'nature1')) f *= 1.4;
  if ((t === 'quarry' || t === 'mine') && onPath(s, 'nature')) f *= 0.8;
  const converter = Object.keys(d.inputs).length > 0 || !!d.recipes?.some((r) => Object.keys(r.inputs).length > 0);
  if (converter) f *= hasCharter(s, 'learning3a') && s.universityOk ? 1.3 : hasCharter(s, 'learning2') ? 1.1 : 1;
  if ((id === 'cider' || id === 'wine') && hasCharter(s, 'orchard3a')) f *= 1.25;
  if (id === 'ale' && hasCharter(s, 'farm3b')) f *= 1.5;
  if (id === 'cheese' && hasCharter(s, 'herd3b')) f *= 1.5;
  if (id === 'weapons' && hasCharter(s, 'metal3b')) f *= 1.5;
  return f;
}

function addOutput(s: GameState, b: Building, out: Cost): boolean {
  const bonus = b.trade ? HOME_TRADE_BONUS : 1;
  if (b.hauled) {
    // Into the yard, for the haulers to fetch.
    let n = 0;
    for (const k in out) n += (out[k as ResourceId] ?? 0) * bonus * charterBonus(s, b, k as ResourceId);
    if (yardTotal(b) + n > YARD_STORE) return false;
    for (const k in out) {
      const id = k as ResourceId;
      const m = (out[id] ?? 0) * bonus * charterBonus(s, b, id);
      (b.stock ??= {})[id] = (b.stock[id] ?? 0) + m;
      b.output += m;
      tally(s, 'making', id, m);
    }
    return true;
  }
  if (fullFor(s, out)) return false;
  for (const k in out) {
    const n = store(s, k as ResourceId, (out[k as ResourceId] ?? 0) * bonus * charterBonus(s, b, k as ResourceId));
    b.output += n;
    tally(s, 'making', k as ResourceId, n);
  }
  return true;
}

/** Goods waiting in a workplace's yard. */
export function yardTotal(b: Building): number {
  let n = 0;
  if (b.stock) for (const k in b.stock) n += b.stock[k as ResourceId] ?? 0;
  return n;
}

/** The store whose workers haul each kind of good: storehouse or granary. */
export const HAUL_STORES: Record<StorageKind, BuildingType> = { materials: 'storehouse', food: 'granary' };

/** Whether working haulers fetch every good a workplace makes. */
export function servedByHaulers(s: GameState, b: Building): boolean {
  const d = workDef(b);
  const outs = d.recipes ? d.recipes.flatMap((r) => Object.keys(r.outputs)) : Object.keys(d.outputs);
  if (!outs.length || b.type === 'market') return false;
  for (const k of outs) {
    const kind = RESOURCE_STORAGE[k as ResourceId];
    if (!kind) return false;
    if (!s.buildings.some((o) => o.type === HAUL_STORES[kind] && o.build >= 1 && o.workers > 0)) return false;
  }
  return true;
}

/**
 * Storehouse and granary workers walk the round of the workplaces, bringing
 * back a handcart at a time from the fullest, nearest yards.
 */
export function dailyHaul(s: GameState): void {
  for (const st of s.buildings) {
    if (st.build < 1 || st.workers <= 0) continue;
    const kind = (Object.keys(HAUL_STORES) as StorageKind[]).find((k) => HAUL_STORES[k] === st.type);
    if (!kind) continue;
    const c = bCenter(st);
    let moved = 0;
    let full = false;
    for (let w = 0; w < st.workers && !full; w++) {
      let time = 1;
      while (time > 0 && !full) {
        let best: Building | null = null;
        let bestScore = 0;
        let bestDist = 0;
        for (const b of s.buildings) {
          if (!b.stock) continue;
          let n = 0;
          for (const k in b.stock) if (RESOURCE_STORAGE[k as ResourceId] === kind) n += b.stock[k as ResourceId] ?? 0;
          if (n < 1) continue;
          const bc = bCenter(b);
          const dist = Math.hypot(bc.x - c.x, bc.y - c.y);
          const score = Math.min(n, HAUL_LOAD) / (1 + dist);
          if (score > bestScore) {
            best = b;
            bestScore = score;
            bestDist = dist;
          }
        }
        if (!best) break;
        // There and back, mostly along lanes, plus loading. A long last trip
        // is finished tomorrow.
        const trip = (2 * bestDist) / ROAD_TILES_PER_DAY + 0.05;
        if (trip > time && time < 1) break;
        time -= trip;
        let load = HAUL_LOAD;
        for (const k in best.stock) {
          const id = k as ResourceId;
          if (RESOURCE_STORAGE[id] !== kind || load <= 0) continue;
          const take = Math.min(load, best.stock![id] ?? 0);
          const kept = store(s, id, take);
          best.stock![id] = (best.stock![id] ?? 0) - kept;
          if ((best.stock![id] ?? 0) <= 0.001) delete best.stock![id];
          load -= kept;
          moved += kept;
          if (kept < take) full = true;
        }
        if (load === HAUL_LOAD) break;
      }
    }
    st.output += moved;
    st.status = moved > 0 ? `Hauling (${Math.round(moved)} brought in today)` : full ? 'Storage full' : 'Waiting for goods to fetch';
  }
}

/** Performs one production cycle. Returns a status string on failure. */
function produce(s: GameState, b: Building, rng: StateRng): string | null {
  const d = workDef(b);
  const season = seasonOf(s.day);
  const enough = d.recipes ? null : enoughOf(s, d.outputs);
  if (enough) return `Enough ${GOODS[enough].name.toLowerCase()} in store`;
  switch (b.type) {
    case 'woodcutter': {
      const r = chooseRecipe(s, b);
      if (!r) {
        const e = enoughOf(s, chooseRecipe(s, b, true)?.outputs ?? d.outputs);
        return e ? `Enough ${GOODS[e].name.toLowerCase()} in store` : 'Waiting';
      }
      const e = enoughOf(s, r.outputs);
      if (e) return `Enough ${GOODS[e].name.toLowerCase()} in store`;
      if (fullFor(s, r.outputs)) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (s.trees[i] > 0 && !inGrove(s, i) ? dist - s.trees[i] * 1.2 : null));
      if (t < 0) return s.groves?.length && nearestTile(s, b, d.radius, (i, dist) => (s.trees[i] > 0 ? dist : null)) >= 0 ? 'Only protected woods in range' : 'No trees in range';
      b.resDist = tileDist(s, b, t);
      s.trees[t]--;
      if (s.trees[t] === 0) (s.stumps ??= {})[t] = s.day;
      addOutput(s, b, r.outputs);
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
      return 'The woods are full';
    }
    case 'quarry':
    case 'mine': {
      const arr = b.type === 'quarry' ? s.rock : s.ore;
      const out = b.type === 'quarry' ? 'stone' : 'ore';
      if (roomFor(s, out) <= 0) return 'Storage full';
      const t = nearestTile(s, b, d.radius, (i, dist) => (arr[i] > 0 ? dist : null));
      if (t < 0) return b.type === 'quarry' ? 'No rock in range' : 'No ore in range';
      b.resDist = tileDist(s, b, t);
      // Deep shafts never exhaust a vein.
      if (!(b.type === 'mine' && hasCharter(s, 'metal1'))) arr[t]--;
      // Precious veins: now and then a load of silver.
      if (b.type === 'mine' && hasCharter(s, 'metal2') && rng.next() < 0.3) b.output += produced(s, 'silver', 1);
      addOutput(s, b, d.outputs);
      return null;
    }
    case 'forager': {
      const r = chooseRecipe(s, b);
      if (!r) return b.recipe ? 'Out of season' : 'Nothing to gather this season';
      const fixedEnough = enoughOf(s, r.outputs);
      if (fixedEnough) return `Enough ${GOODS[fixedEnough].name.toLowerCase()} in store`;
      if (fullFor(s, r.outputs)) return 'Storage full';
      if (r.id === 'berries') {
        const t = nearestTile(s, b, d.radius, (i, dist) => (s.berries[i] > 0 ? dist : null));
        if (t < 0) {
          return countInRadius(s, bCenter(b), d.radius, (i) => s.berriesMax[i] > 0) > 0
            ? 'Bushes picked clean for now'
            : 'No berry bushes in range';
        }
        b.resDist = tileDist(s, b, t);
        s.berries[t]--;
      } else {
        // Mushrooms and herbs grow in the woods.
        const t = nearestTile(s, b, d.radius, (i, dist) => (s.trees[i] > 0 ? dist : null));
        const woods = countInRadius(s, bCenter(b), d.radius, (i) => s.trees[i] > 0);
        if (r.id === 'mushrooms' && woods < 6) return 'No woods nearby for mushrooms';
        if (t >= 0) b.resDist = tileDist(s, b, t);
      }
      addOutput(s, b, r.outputs);
      return null;
    }
    case 'hunter': {
      const forest = countInRadius(s, bCenter(b), d.radius, (i) => s.trees[i] > 0);
      if (forest < 8) return 'Not enough forest for game';
      if (roomFor(s, 'meat') <= 0) return 'Storage full';
      const amount = Math.max(1, Math.round((d.outputs.meat ?? 0) * Math.min(1, forest / 40)));
      addOutput(s, b, { meat: amount });
      // Every few kills bring a hide worth tanning.
      if (rng.next() < 0.5) produced(s, 'hides', 1);
      return null;
    }
    case 'claypit': {
      const water = countInRadius(s, bCenter(b), d.radius, (i) => s.terrain[i] === 1);
      if (water < 2) return 'No riverbank nearby';
      if (roomFor(s, 'clay') <= 0) return 'Storage full';
      const amount = Math.max(1, Math.round((d.outputs.clay ?? 0) * Math.min(1, water / 10) * (season === 3 ? 0.4 : 1)));
      addOutput(s, b, { clay: amount });
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
      let inputs = d.inputs;
      let outputs = d.outputs;
      if (d.recipes) {
        const r = chooseRecipe(s, b);
        if (!r) {
          const fixed = chooseRecipe(s, b, true);
          const e = fixed && enoughOf(s, fixed.outputs);
          b.lack = undefined;
          return e ? `Enough ${GOODS[e].name.toLowerCase()} in store` : 'Waiting for materials';
        }
        inputs = r.inputs;
        outputs = r.outputs;
        const e = enoughOf(s, outputs);
        if (e) return `Enough ${GOODS[e].name.toLowerCase()} in store`;
      }
      if ((inputs.wood ?? 0) > 0 && s.res.wood - (inputs.wood ?? 0) < WOOD_RESERVE) {
        b.lack = 'wood';
        return 'Waiting for wood (keeping firewood reserve)';
      }
      if (!canAfford(s, inputs)) {
        // A batch ends when the inputs run out; workers go back to other jobs.
        if (d.batch) {
          b.batchOn = false;
          return 'Batch done: waiting for the next load';
        }
        const missing = Object.keys(inputs).filter((k) => s.res[k as ResourceId] < (inputs[k as ResourceId] ?? 0));
        b.lack = missing[0] as ResourceId;
        return `Waiting for ${missing.map((k) => GOODS[k as ResourceId].name.toLowerCase()).join(', ')}`;
      }
      // Inputs leave the store as the outputs arrive: milling a full granary's
      // grain into flour must not stall for want of room.
      pay(s, inputs);
      if (!addOutput(s, b, outputs)) {
        for (const k in inputs) s.res[k as ResourceId] += inputs[k as ResourceId] ?? 0;
        return 'Storage full';
      }
      for (const k in inputs) tally(s, 'using', k as ResourceId, inputs[k as ResourceId] ?? 0);
      return null;
    }
  }
}

function farmFertility(s: GameState, b: Building): number {
  let f = 0;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) f += s.fertility[idx(s, x, y)];
  return f / (b.w * b.h);
}

/** Grain (or barley, oats, flax) per tile from a fully tended field on rich soil. */
export const FIELD_YIELD = 18;
/** Farmer-days of sowing and tending each tile of field needs in a season. */
export const TEND_PER_TILE = 4;
/** Converters leave this much timber in stock for firewood. */
export const WOOD_RESERVE = 20;

const CROP_GOOD: Record<string, ResourceId> = { wheat: 'grain', barley: 'barley', oats: 'oats', flax: 'flax' };
const CROP_FACTOR: Record<string, number> = { wheat: 1, barley: 1, oats: 1.15, flax: 0.5 };

export function cropOf(f: Building): string {
  return f.recipe ?? 'wheat';
}

/** What a field will bring in at harvest, with `crew` the share of farmers at work. */
function fieldYield(s: GameState, f: Building, crew: number): number {
  const crop = cropOf(f);
  const rotation = (f.lastCrop === crop ? 0.85 : 1) * fieldCharterFactor(s);
  return Math.round(f.w * f.h * FIELD_YIELD * f.growth * (0.5 + 0.5 * farmFertility(s, f)) * (0.6 + 0.4 * crew) * CROP_FACTOR[crop] * rotation);
}

/**
 * What a field should bring in: with the growth it has now, and if it is
 * fully tended by harvest time, plus the soil's richness (0-1). Uses the same
 * formula as the harvest itself, so the preview never lies.
 */
export function fieldForecast(s: GameState, f: Building): { good: ResourceId; now: number; full: number; soil: number; crew: number } {
  const owner = s.buildings.find((o) => o.id === f.owner);
  const crew = owner ? Math.min(1, owner.workers / Math.max(1, workersOf(owner))) : 0;
  const good = CROP_GOOD[cropOf(f)];
  const growth = f.growth;
  const now = fieldYield(s, f, crew || 1);
  f.growth = 1;
  const full = fieldYield(s, f, 1);
  f.growth = growth;
  return { good, now, full, soil: farmFertility(s, f), crew };
}

/**
 * The coming harvest against the room left for it, per kind of store:
 * lets the steward warn before crops spoil for want of space.
 */
export function harvestForecast(s: GameState): { kind: StorageKind; expected: number; room: number }[] {
  const expected: Partial<Record<StorageKind, number>> = {};
  const farms = new Set<Building>();
  for (const f of s.buildings) {
    if (f.type !== 'field' || f.growth <= 0) continue;
    // Fields without a farmstead rot unharvested.
    const owner = s.buildings.find((o) => o.id === f.owner && o.build >= 1);
    if (!owner) continue;
    farms.add(owner);
    const kind = RESOURCE_STORAGE[CROP_GOOD[cropOf(f)]];
    if (kind) expected[kind] = (expected[kind] ?? 0) + fieldYield(s, f, 1);
  }
  // Each farm's barn takes only its own harvest; share the space across stores by size.
  let barns = 0;
  for (const b of farms) barns += FARM_BARN - barnTotal(b);
  const all = Object.values(expected).reduce((a, n) => a + (n ?? 0), 0) || 1;
  return (Object.keys(expected) as StorageKind[]).map((kind) => ({
    kind,
    expected: expected[kind]!,
    room: Math.max(0, storageCap(s, kind) - stored(s, kind)) + Math.floor((barns * expected[kind]!) / all),
  }));
}

/** Stores what a herd, orchard, yard or gatherer brought in, and counts it as made. */
function produced(s: GameState, id: ResourceId, n: number): number {
  const k = store(s, id, n);
  tally(s, 'making', id, k);
  return k;
}

function tally(s: GameState, key: 'making' | 'using', id: ResourceId, n: number): void {
  if (n <= 0) return;
  const t = (s[key] ??= {});
  t[id] = (t[id] ?? 0) + n;
}

/** Production chains, raw good first, as the Production Book shows them. */
export const CHAINS: { name: string; links: ResourceId[] }[] = [
  { name: 'Bread', links: ['grain', 'flour', 'bread'] },
  { name: 'Ale', links: ['barley', 'ale'] },
  { name: 'Cider', links: ['apples', 'cider'] },
  { name: 'Cheese', links: ['milk', 'cheese'] },
  { name: 'Clothes', links: ['wool', 'cloth', 'clothes'] },
  { name: 'Linen', links: ['flax', 'cloth'] },
  { name: 'Boots', links: ['hides', 'leather', 'boots'] },
  { name: 'Tools', links: ['ore', 'iron', 'tools'] },
  { name: 'Wood', links: ['wood', 'planks', 'woodparts'] },
  { name: 'Stone', links: ['stone', 'dressedstone'] },
  { name: 'Tiles', links: ['clay', 'tiles'] },
  { name: 'Medicine', links: ['herbs', 'medicine'] },
];

export interface ChainLink {
  id: ResourceId;
  stock: number;
  made: number;
  used: number;
}

/**
 * A chain's links with last month's figures, and its weakest link: the first
 * good the next workshop used faster than it was made while stocks ran low,
 * or a good piling up because the next workshop cannot keep up.
 */
export function chainReport(s: GameState, links: ResourceId[]): { links: ChainLink[]; weak: number | null; why: string | null } {
  const rows = links.map((id) => ({ id, stock: Math.floor(s.res[id]), made: Math.round(s.made?.[id] ?? 0), used: Math.round(s.used?.[id] ?? 0) }));
  for (let i = 0; i < rows.length - 1; i++) {
    const r = rows[i];
    const next = rows[i + 1];
    const name = GOODS[r.id].name.toLowerCase();
    if (r.used > r.made && r.stock < Math.max(10, r.used)) return { links: rows, weak: i, why: `Short of ${name}: the next workshop used ${r.used} but only ${r.made} were made` };
    if (r.stock >= keepOf(s, r.id) * 0.8 && r.made > 0 && next.made < r.made / 2) {
      return { links: rows, weak: i + 1, why: `${GOODS[r.id].name} ${GOODS[r.id].name.endsWith('s') ? 'pile' : 'piles'} up: the ${GOODS[next.id].name.toLowerCase()} makers cannot keep up` };
    }
  }
  return { links: rows, weak: null, why: null };
}

/** A page for the chronicle as each year ends: how the lands fared. */
/** Stored goods at a moment, for the year's rises and falls. */
function stockSnapshot(s: GameState): Partial<Record<ResourceId, number>> {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) if (RESOURCE_STORAGE[id] && s.res[id] >= 1) out[id] = Math.floor(s.res[id]);
  return out;
}

/** "planks (+120) and tools (+30)": the largest changes one way over the year. */
function stockChanges(s: GameState, before: Partial<Record<ResourceId, number>>, sign: 1 | -1): string {
  return RESOURCE_IDS.filter((id) => RESOURCE_STORAGE[id])
    .map((id) => ({ id, d: Math.floor(s.res[id]) - (before[id] ?? 0) }))
    .filter((x) => x.d * sign >= 20)
    .sort((a, b) => (b.d - a.d) * sign)
    .slice(0, 3)
    .map((x) => `${GOODS[x.id].name.toLowerCase()} (${x.d > 0 ? '+' : ''}${x.d})`)
    .join(', ');
}

/** A goal for each year once the town is a City: there is always something to aim for. */
export const YEAR_GOALS: { id: string; title: string; goal: number; have: (s: GameState) => number; done?: (s: GameState) => boolean }[] = [
  { id: 'arrive', title: 'Welcome 30 newcomers', goal: 30, have: (s) => s.year?.arrived ?? 0 },
  { id: 'fed', title: 'Let no one go hungry', goal: 0, have: (s) => s.year?.hungry ?? 0, done: (s) => (s.year?.hungry ?? 0) === 0 },
  { id: 'build', title: 'Raise 8 buildings', goal: 8, have: (s) => s.year?.built ?? 0 },
  { id: 'harvest', title: 'Bring in 800 sacks at harvest', goal: 800, have: (s) => s.year?.harvest ?? 0 },
];

/** This year's goal, for a City only. */
export function yearGoal(s: GameState): (typeof YEAR_GOALS)[number] | null {
  // Set goals and their rewards belong to the Easy game.
  if (!s.relaxed) return null;
  if (s.tier < TIERS.length - 1) return null;
  return YEAR_GOALS[Math.floor(s.day / DAYS_PER_YEAR) % YEAR_GOALS.length];
}

export function yearGoalMet(s: GameState, g: (typeof YEAR_GOALS)[number]): boolean {
  return g.done ? g.done(s) : g.have(s) >= g.goal;
}

/**
 * A friendly score to compare towns: people and rank first, then the lord's
 * deeds, and every year in which no one went hungry.
 */
export function townScore(s: GameState): number {
  const great = ['cathedral', 'guildhall', 'belltower'].filter((t) => s.buildings.some((b) => b.type === t && b.build >= 1)).length;
  return Math.round(
    s.population * 10 + s.tier * 500 + (s.title ?? 0) * 400 + great * 300 + (s.commissions?.length ?? 0) * 200 + (s.milestones?.length ?? 0) * 50 + (s.fedYears ?? 0) * 100,
  );
}

function yearInReview(s: GameState): void {
  if (s.year && s.day > 1 && !(s.year.hungry ?? 0)) s.fedYears = (s.fedYears ?? 0) + 1;
  // Judge the year's goal before the tally starts afresh (the day has just turned).
  const last = s.day - 1;
  const g = s.tier >= TIERS.length - 1 && s.year ? YEAR_GOALS[Math.floor(last / DAYS_PER_YEAR) % YEAR_GOALS.length] : null;
  if (g && yearGoalMet(s, g)) {
    s.res.prestige += 25;
    s.moods = (s.moods ?? []).filter((m) => m.label !== 'A year well kept');
    s.moods.push({ label: 'A year well kept', value: 4, until: s.day + 3 * DAYS_PER_MONTH });
    log(s, `The year's goal is met: ${g.title.toLowerCase()}. +25 prestige, and the town is merry for a season.`, 'good');
  }
  const y = s.year;
  s.year = { pop: s.population, gold: s.res.gold, prestige: s.res.prestige, arrived: 0, left: 0, built: 0, harvest: 0, stock: stockSnapshot(s) };
  if (!y) return;
  const done = yearOf(s.day) - 1;
  const parts: string[] = [];
  const grew = s.population - y.pop;
  const place = TIERS[s.tier].name.toLowerCase();
  parts.push(grew > 0 ? `the ${place} grew by ${grew} to ${s.population} souls` : grew < 0 ? `${-grew} fewer souls remain (${s.population})` : `${s.population} souls, as many as a year ago`);
  if (y.arrived) parts.push(`${y.arrived} newcomers settled`);
  if (y.left) parts.push(`${y.left} left`);
  if (y.built) parts.push(`${y.built} buildings were raised`);
  if (y.harvest) parts.push(`the fields gave ${y.harvest} sacks`);
  const gold = Math.round(s.res.gold - y.gold);
  parts.push(`the treasury ${gold >= 0 ? 'gained' : 'lost'} ${Math.abs(gold)} coins`);
  const prestige = Math.round(s.res.prestige - y.prestige);
  if (prestige) parts.push(`${prestige > 0 ? '+' : ''}${prestige} prestige`);
  let stock = '';
  if (y.stock) {
    const up = stockChanges(s, y.stock, 1);
    const down = stockChanges(s, y.stock, -1);
    if (up) stock += ` Stocked up: ${up}.`;
    if (down) stock += ` Ran down: ${down}.`;
  }
  log(s, `The year ${done} in review: ${parts.join(', ')}.${stock}`, 'good');
}

/** The day's harvest across every farm, summed up in one message. */
let harvestDay: { got: Partial<Record<ResourceId, number>>; barn: number; spoiled: number; where: Set<string>; at: Building } | null = null;

function reportHarvest(s: GameState): void {
  const h = harvestDay;
  harvestDay = null;
  if (!h) return;
  if (s.year) for (const k in h.got) s.year.harvest += h.got[k as ResourceId] ?? 0;
  const list = Object.entries(h.got)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${n} ${GOODS[k as ResourceId].name.toLowerCase()}`)
    .join(', ');
  if (!list && !h.spoiled) return;
  const barn = h.barn ? ` ${h.barn} wait in the barns for room in the stores.` : '';
  const lost = h.spoiled ? ` ${h.spoiled} spoiled: the ${[...h.where].join(' and ')} and the barns are full.` : '';
  log(s, `Harvest! The fields brought in ${list || 'nothing'}.${barn}${lost}`, h.spoiled ? 'bad' : 'good', h.at);
}

/** Harvest a farmstead's barn holds while the stores are full. */
export const FARM_BARN = 200;
/** Sacks carried from a barn to the stores each day, as room allows. */
const BARN_UNLOAD = 25;

export function barnTotal(b: Building): number {
  let n = 0;
  for (const k in b.barn) n += b.barn[k as ResourceId] ?? 0;
  return n;
}

/** Share of the stores barns leave free, so fresh food still has room. */
const BARN_HEADROOM = 0.15;

/** Carries what waits in a farm's barn to the stores as room frees up. */
function unloadBarn(s: GameState, b: Building): void {
  if (!b.barn) return;
  let budget = BARN_UNLOAD;
  for (const k in b.barn) {
    const id = k as ResourceId;
    const kind = RESOURCE_STORAGE[id];
    const spare = kind ? roomFor(s, id) - storageCap(s, kind) * BARN_HEADROOM : budget;
    const moved = store(s, id, Math.max(0, Math.min(budget, b.barn[id] ?? 0, Math.floor(spare))));
    b.barn[id] = (b.barn[id] ?? 0) - moved;
    budget -= moved;
    if (!b.barn[id]) delete b.barn[id];
  }
  if (!Object.keys(b.barn).length) b.barn = undefined;
}

function stepFarm(s: GameState, b: Building): void {
  unloadBarn(s, b);
  const month = monthOf(s.day);
  const fields = zonesOf(s, b);
  const area = zoneArea(fields);
  const crew = Math.min(1, b.workers / Math.max(1, workersOf(b)));
  b.blocked = 0;
  if (!fields.length) {
    b.status = 'Draw fields nearby to farm';
    b.blocked = BLOCK_PROBLEM;
    return;
  }
  if (month <= 5) {
    const grow = b.workers > 0 ? (b.workers * (hasCharter(s, 'farm2') ? 1.5 : 1)) / (area * TEND_PER_TILE) : 0;
    for (const f of fields) {
      f.growth = Math.min(1, f.growth + grow);
      f.status = b.workers ? (month < 3 ? `Sowing ${cropOf(f)}` : `${cap(cropOf(f))} growing`) : 'Untended';
    }
    b.status = b.workers > 0 ? (month < 3 ? 'Sowing the fields' : 'Tending the crops') : 'Fields untended';
    if (b.workers > 0 && area * TEND_PER_TILE > b.workers * 60 * 1.05) b.status += ' (more fields than hands)';
  } else if (month === 6) {
    b.status = 'Crops ripening';
    for (const f of fields) f.status = f.growth > 0 ? `${cap(cropOf(f))} ripening` : 'Lying fallow';
    b.blocked = BLOCK_SEASONAL;
  } else if (month === 7 && s.day % DAYS_PER_MONTH === 0) {
    const got: Partial<Record<ResourceId, number>> = {};
    let unstaffed = 0;
    let spoiled = 0;
    let inBarn = 0;
    const spoiledIn = new Set<string>();
    for (const f of fields) {
      if (f.growth <= 0) continue;
      const crop = cropOf(f);
      if (crew <= 0) {
        unstaffed++;
        f.status = 'Crops rotted';
      } else {
        const amount = fieldYield(s, f, crew);
        const good = CROP_GOOD[crop];
        const n = store(s, good, amount);
        // What the stores cannot take waits in the farm's barn.
        const barned = Math.min(amount - n, FARM_BARN - barnTotal(b));
        if (barned > 0) b.barn = { ...b.barn, [good]: (b.barn?.[good] ?? 0) + barned };
        inBarn += barned;
        got[good] = (got[good] ?? 0) + n + barned;
        tally(s, 'making', good, n + barned);
        b.output += n + barned;
        f.lastOutput = n + barned;
        const lost = amount - n - barned;
        spoiled += lost;
        if (lost > 0) spoiledIn.add(RESOURCE_STORAGE[good] === 'food' ? 'granaries' : 'storehouses');
        f.status = lost > 0 ? `Harvested ${amount - lost}; ${lost} spoiled` : `Harvested ${amount} ${GOODS[good].name.toLowerCase()}`;
      }
      f.lastCrop = crop;
      f.growth = 0;
    }
    const list = Object.entries(got)
      .filter(([, n]) => n! > 0)
      .map(([k, n]) => `${n} ${GOODS[k as ResourceId].name.toLowerCase()}`)
      .join(', ');
    const where = [...spoiledIn].join(' and ');
    const barnNote = inBarn ? ` ${inBarn} wait in the barn for room in the stores.` : '';
    // Each farm's tally goes to the chronicle; one toast sums up the day's harvest.
    if (list) log(s, `${buildingName(b)}: the fields brought in ${list}.${barnNote}${spoiled ? ` ${spoiled} spoiled: the ${where} and the barn are full.` : ''}`, 'info', b);
    else if (spoiled) log(s, `${buildingName(b)}: the harvest rotted in the fields, no room left in the ${where} for ${spoiled} sacks.`, 'info', b);
    if (unstaffed) log(s, 'Crops rotted in the fields: no farmers to bring them in.', 'bad', b);
    harvestDay ??= { got: {}, barn: 0, spoiled: 0, where: new Set(), at: b };
    for (const k in got) harvestDay.got[k as ResourceId] = (harvestDay.got[k as ResourceId] ?? 0) + (got[k as ResourceId] ?? 0);
    harvestDay.barn += inBarn;
    harvestDay.spoiled += spoiled;
    for (const w of spoiledIn) harvestDay.where.add(w);
    if (spoiled && !harvestDay.spoiled) harvestDay.at = b;
    b.status = 'Harvest gathered';
    b.blocked = BLOCK_SEASONAL;
  } else if (month >= 7) {
    for (const f of fields) {
      f.growth = 0;
      if (month >= 9) f.status = 'Resting for winter';
    }
    b.status = month >= 9 ? 'Fields resting for winter' : 'Fields harvested';
    b.blocked = BLOCK_SEASONAL;
  }
}

/** Charters that change every harvest. */
function fieldCharterFactor(s: GameState): number {
  let f = hasCharter(s, 'farm1') ? 1.2 : 1;
  if (onPath(s, 'learning')) f *= 0.9;
  if (onPath(s, 'herd')) f *= 0.9;
  return f;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Animals each pasture tile carries, and how fast the herd grows each spring. */
export const HERDS: Record<string, { tiles: number; births: number; name: string; plural: string }> = {
  sheep: { tiles: 2, births: 0.8, name: 'sheep', plural: 'sheep' },
  cattle: { tiles: 4, births: 0.5, name: 'cow', plural: 'cattle' },
  pigs: { tiles: 3, births: 1.5, name: 'pig', plural: 'pigs' },
};

export function herdKindOf(b: Building): string {
  return b.recipe ?? 'sheep';
}

/** How many animals the pastures feed for free, and with oats over winter. */
export function herdCapacity(s: GameState, b: Building): { free: number; fed: number } {
  const per = HERDS[herdKindOf(b)].tiles;
  const mult = (hasCharter(s, 'herd2') ? 1.5 : 1) * (onPath(s, 'farm') ? 0.8 : 1);
  const free = Math.floor((zoneArea(zonesOf(s, b)) / per) * mult);
  return { free, fed: free + (s.res.oats >= 1 ? Math.floor(free / 2) : 0) };
}

/** A fresh herd of a few animals arrives when the farm opens or changes animal. */
const STARTING_HERD = 6;

function stepByre(s: GameState, b: Building): void {
  const kind = herdKindOf(b);
  const pastures = zonesOf(s, b);
  const capy = herdCapacity(s, b);
  // A fresh herd arrives once there is pasture for it (and when the animal changes).
  if (capy.free > 0 && (b.herdKind !== kind || !b.herd)) {
    if (b.herdKind !== kind || b.herd === undefined) b.herd = Math.min(STARTING_HERD, capy.free);
    else if (!b.herd) b.herd = Math.min(2, capy.free);
    b.herdKind = kind;
  }
  // Pastures shrank below the herd: the surplus is sold at market.
  if ((b.herd ?? 0) > capy.fed) {
    const extra = (b.herd ?? 0) - capy.fed;
    b.herd = capy.fed;
    s.res.gold += extra * 3;
  }
  const H = HERDS[kind];
  const winter = monthOf(s.day) >= 10;
  for (const z of pastures) z.status = winter ? `${b.herd} ${H.plural} sheltering in the byre` : `${b.herd} ${b.herd === 1 ? H.name : H.plural} grazing`;
  b.blocked = 0;
  if (!pastures.length) {
    b.status = 'Fence pastures nearby for the animals';
    b.blocked = BLOCK_PROBLEM;
    return;
  }
  if (b.workers === 0) {
    b.status = 'No herders';
    return;
  }
  const month = monthOf(s.day);
  const crew = b.workers / workersOf(b);
  if (kind === 'cattle' && month >= 1 && month <= 8) {
    b.work += (b.herd ?? 0) * 0.12 * crew * (hasCharter(s, 'herd1') ? 1.3 : 1);
    const n = Math.floor(b.work);
    if (n > 0) {
      b.work -= n;
      b.output += produced(s, 'milk', n);
    }
    b.status = `Milking ${b.herd} cattle`;
  } else {
    b.status = `Herding ${b.herd} ${b.herd === 1 ? H.name : H.plural}`;
  }
}

/** Monthly herd events: spring lambing and shearing, autumn slaughter, winter fodder. */
function monthlyHerds(s: GameState, month: number): void {
  for (const b of s.buildings) {
    if (b.type !== 'byre' || b.build < 1 || !b.herd) continue;
    const kind = herdKindOf(b);
    const capy = herdCapacity(s, b);
    const herd = b.herd ?? 0;
    const staffed = b.workers > 0;
    if (month === 1 && herd > 0) {
      b.herd = Math.min(capy.fed, herd + Math.max(1, Math.round(herd * HERDS[kind].births)));
      if (kind === 'sheep' && staffed) {
        const n = produced(s, 'wool', Math.round(herd * 2 * (hasCharter(s, 'herd1') ? 1.3 : 1)));
        b.output += n;
        if (n) log(s, `Shearing time: ${n} wool from the flock.`, 'info', b);
      }
    }
    if (month === 8 && staffed) {
      const keep = Math.max(2, Math.ceil(capy.free * 0.5));
      const cull = Math.max(0, herd - keep);
      if (cull > 0) {
        b.herd = herd - cull;
        const got: string[] = [];
        const add = (id: ResourceId, n: number) => {
          const k = produced(s, id, n);
          if (k) got.push(`${k} ${GOODS[id].name.toLowerCase()}`);
          b.output += k;
        };
        const meat = (hasCharter(s, 'herd1') ? 1.3 : 1) * (hasCharter(s, 'herd3a') ? 1.5 : 1);
        if (kind === 'pigs') add('pork', Math.round(cull * 4 * meat));
        else add('meat', Math.round(cull * (kind === 'cattle' ? 5 : 2) * meat));
        add('hides', cull);
        log(s, `Autumn slaughter: ${got.join(', ')}.`, 'info', b);
      }
    }
    if (month >= 9 || month === 0) {
      // Animals beyond what the pasture feeds eat oats through winter.
      const extra = Math.max(0, (b.herd ?? 0) - capy.free);
      if (extra > 0) {
        const eat = Math.min(extra, Math.floor(s.res.oats));
        s.res.oats -= eat;
        if (eat < extra) {
          b.herd = (b.herd ?? 0) - (extra - eat);
          log(s, `Without oats, ${extra - eat} animals had to be sold off.`, 'bad', b);
        }
      }
    }
  }
}

/** Days before young fruit trees bear (a year and a half). */
export const ORCHARD_MATURE_DAYS = Math.round(DAYS_PER_MONTH * MONTHS_PER_YEAR * 1.5);
/** Fruit per tile of a mature orchard in a season. */
export const ORCHARD_YIELD = 7;
/** Fruit one picker gathers in a day. */
const PICK_PER_DAY = 5;

export function orchardMaturity(b: Building, fast = false): number {
  return Math.min(1, (b.age ?? 0) / (ORCHARD_MATURE_DAYS * (fast ? 2 / 3 : 1)));
}

function stepOrchardist(s: GameState, b: Building): void {
  const orchards = zonesOf(s, b);
  b.blocked = 0;
  if (!orchards.length) {
    b.status = 'Plant orchards nearby';
    b.blocked = BLOCK_PROBLEM;
    return;
  }
  const hanging = orchards.reduce((a, o) => a + o.growth, 0);
  if (hanging < 1) {
    b.status = 'Nothing ripe to pick';
    b.blocked = BLOCK_SEASONAL;
    return;
  }
  let pick = (b.workers * PICK_PER_DAY * (b.efficiency ?? 1)) / (onPath(s, 'orchard') ? 1.33 : 1);
  for (const o of orchards) {
    if (pick <= 0) break;
    const n = Math.min(Math.floor(o.growth), Math.ceil(pick));
    if (n <= 0) continue;
    const good = (o.recipe ?? 'apples') as ResourceId;
    const k = produced(s, good, n);
    o.growth -= n;
    o.lastOutput += k;
    b.output += k;
    pick -= n;
  }
  b.status = `Picking fruit (${Math.floor(hanging)} on the trees)`;
}

/** Orchards age daily; fruit sets in late summer and rots if not picked. */
function dailyOrchards(s: GameState): void {
  const month = monthOf(s.day);
  const first = s.day % DAYS_PER_MONTH === 0;
  for (const o of s.buildings) {
    if (o.type !== 'orchard') continue;
    o.age = (o.age ?? 0) + 1;
    const m = orchardMaturity(o, hasCharter(s, 'orchard2'));
    if (month === 5 && first) {
      o.growth = Math.round(o.w * o.h * ORCHARD_YIELD * (m >= 1 ? 1 : m * m) * (hasCharter(s, 'orchard1') ? 1.3 : 1));
      o.lastOutput = 0;
    }
    if (month === 7 && first) o.growth = 0;
    const fruit = GOODS[(o.recipe ?? 'apples') as ResourceId].name.toLowerCase();
    o.status =
      m < 1
        ? `Young trees: ${Math.round(m * 100)}% grown`
        : month >= 5 && month <= 6 && o.growth > 0
          ? `${Math.floor(o.growth)} ${fruit} ripe`
          : month <= 1
            ? 'In blossom'
            : month <= 4
              ? `${cap(fruit)} setting`
              : 'Resting';
  }
}

/** Backyard extensions a family can keep, what they cost and make. */
export const YARDS: Record<string, { name: string; cost: Cost; desc: string; tier: number }> = {
  veg: { name: 'Vegetable patch', cost: { wood: 4, gold: 8 }, desc: 'Cabbages, leeks and turnips: 3 vegetables a month from spring to autumn.', tier: 0 },
  hens: { name: 'Hen coop', cost: { wood: 8, gold: 15 }, desc: 'A few hens: 3 eggs a month, 1 in winter.', tier: 0 },
  bees: { name: 'Beehives', cost: { wood: 6, gold: 25 }, desc: 'Straw skeps: about 8 honey each late summer.', tier: 1 },
};

export function setYard(s: GameState, b: Building, kind: string | undefined): string | null {
  if (b.type !== 'house' || b.build < 1) return 'Only homes have backyards';
  if (kind === b.yard) return null;
  if (kind) {
    const y = YARDS[kind];
    if (!y) return 'Unknown';
    if (s.tier < y.tier) return `Requires ${TIERS[y.tier].name}`;
    if (!canAfford(s, y.cost)) return 'Cannot afford it';
    pay(s, y.cost);
  }
  b.yard = kind;
  return null;
}

function monthlyYards(s: GameState, month: number): void {
  for (const b of s.buildings) {
    if (b.type !== 'house' || !b.yard || b.residents === 0) continue;
    if (b.yard === 'veg' && month >= 3 && month <= 8) b.lastOutput = produced(s, 'vegetables', 3);
    else if (b.yard === 'hens') b.lastOutput = produced(s, 'eggs', month >= 9 ? 1 : 3);
    else if (b.yard === 'bees' && month === 6) {
      b.lastOutput = produced(s, 'honey', Math.round(8 * (hasCharter(s, 'orchard1') ? 1.3 : 1) * (hasCharter(s, 'orchard3b') ? 2 : 1)));
    }
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
    case 'belltower':
    case 'cathedral':
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
  const d = workDef(b);
  if (!d.cycle) return 1;
  const toResource = d.gathers && d.gathers !== 'water' && d.gathers !== 'forest' ? (2 * (b.resDist ?? d.radius / 2)) / OFFROAD_TILES_PER_DAY : 0;
  // Served by haulers, the workers no longer carry their goods to storage.
  const walking = ((b.hauled ? 0 : (b.trip ?? 0)) + toResource) / Math.max(1, d.workers);
  return d.cycle / (d.cycle + TRAVEL_WEIGHT * walking);
}

export function dailyProduction(s: GameState, rng: StateRng): void {
  for (const b of s.buildings) {
    const d = workDef(b);
    if (b.build < 1) continue;
    // Carting the barn's harvest to the stores is not farm work: it goes on when paused.
    if (b.type === 'farm' && b.paused) unloadBarn(s, b);
    if (b.paused) {
      b.status = 'Paused';
      b.blocked = 0;
      continue;
    }
    if (d.zone) continue;
    if (b.type === 'farm') {
      stepFarm(s, b);
      continue;
    }
    if (b.type === 'byre') {
      stepByre(s, b);
      continue;
    }
    if (b.type === 'orchardist') {
      stepOrchardist(s, b);
      continue;
    }
    if (d.workers === 0 || d.cycle === 0) {
      // Taverns set their own status when they pour (or run dry).
      if (b.type !== 'tavern') b.status = passiveStatus(s, b);
      else if (b.workers === 0) b.status = 'No workers available';
      continue;
    }
    if (d.batch && !b.batchOn && inSeason(s, b) && !batchReady(s, b)) {
      const need = Object.entries(d.inputs).map(([k, v]) => `${Math.floor(s.res[k as ResourceId])}/${(v ?? 0) * (d.batch ?? 1)} ${GOODS[k as ResourceId].name.toLowerCase()}`);
      b.status = `Waiting for a full batch (${need.join(', ')})`;
      b.blocked = BLOCK_SEASONAL;
      continue;
    }
    if (!inSeason(s, b)) {
      const next = nextSeasonMonth(s, b);
      b.status = next === null ? 'Resting' : `Resting until ${MONTH_NAMES[next].toLowerCase()}`;
      b.blocked = BLOCK_SEASONAL;
      continue;
    }
    if (b.want === 0) {
      b.status = 'No workers assigned';
      b.blocked = 0;
      continue;
    }
    if (b.workers === 0) {
      // Keep a blocked status so the job queue does not flip-flop daily;
      // blocked buildings are retried at the start of each month.
      if (!isBlocked(b)) b.status = 'No workers available';
      continue;
    }
    b.hauled = servedByHaulers(s, b);
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
      if (!status?.startsWith('Waiting for')) b.lack = undefined;
      // Winter rest and full storage are normal pauses, not problems to flag.
      const idle =
        status === 'Storage full' ||
        status === 'Out of season' ||
        status === 'Nothing to gather this season' ||
        status === 'The woods are full' ||
        !!status?.startsWith('Batch done') ||
        !!status?.startsWith('Enough');
      b.blocked = status ? (idle ? BLOCK_SEASONAL : BLOCK_PROBLEM) : 0;
      if (status === 'Storage full' && b.hauled && yardTotal(b) > 0) status = 'Yard full: waiting for haulers';
    }
    if (status || !b.blocked) b.status = status ?? 'Working';
  }
}

// ---------------------------------------------------------------- construction

/** Most builders that work one site at once. */
export const MAX_BUILDERS = 4;
/** Share of a building-day of work one builder does per day. */
export const LABOUR_PER_BUILDER = 2;

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
    // A renovation keeps its own note, so the workplace's status stays about its work.
    const setStatus = (text: string) => {
      if (renovating) b.upNote = text;
      else b.status = text;
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
      // With no timber in store, a woodcutter's lodge is raised from trees
      // felled on the spot, so a town can never be stuck without one.
      if (b.type === 'woodcutter' && !renovating && (b.need!.wood ?? 0) > 0 && s.res.wood < 1 && fellNear(s, b, n * 2)) {
        b.need!.wood = Math.max(0, (b.need!.wood ?? 0) - n * 2);
        setStatus('Felling timber on the spot');
        continue;
      }
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
        if ((b.need![id] ?? 0) > 0 && s.res[id] < 1) missing = GOODS[id].name.toLowerCase();
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
      b.upNote = `Building (${n} builder${n > 1 ? 's' : ''})`;
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
      if (s.year) s.year.built++;
      s.dirty = true;
    }
  }
}


// ---------------------------------------------------------------- monthly

const VARIETY_BONUS = [0, 0, 6, 12, 18];

/**
 * Feeds `mouths` villagers for a month from the stores, spreading meals
 * across foods. Returns how many went hungry and how many food groups
 * (grain, meat, produce, dairy) were on the table.
 */
/** Famine food: a measure of grain or oats boiled into pottage feeds half a villager for a month. */
const POTTAGE: ResourceId[] = ['grain', 'oats'];
export const POTTAGE_FOOD = 0.5;

export function eatFood(s: GameState, mouths: number): { hungry: number; groups: number; pottage: number } {
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
  // With nothing else left, families boil grain or oats into pottage.
  const before = need;
  for (const f of POTTAGE) {
    const n = Math.min(Math.floor(s.res[f]), Math.ceil((need - 0.001) / POTTAGE_FOOD));
    if (n <= 0) continue;
    s.res[f] -= n;
    need -= n * POTTAGE_FOOD;
  }
  return { hungry: Math.max(0, Math.ceil(need - 0.001)), groups: groups.size, pottage: Math.round(before - Math.max(0, need)) };
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
  report.pottage = eaten.pottage;
  const need = eaten.hungry;
  if (need > 0) log(s, `Food shortage! ${need} villagers went hungry.`, 'bad');
  if (s.year) s.year.hungry = (s.year.hungry ?? 0) + need;

  // Heating in winter: each household burns a bundle of split firewood, or
  // twice as much raw timber (two bundles in hardy winters).
  report.cold = false;
  if (Math.floor(prevMonth / 3) === 3) {
    let homes = s.buildings.filter((b) => b.residents > 0).length * winterBundles(s);
    const split = Math.min(homes, Math.floor(s.res.firewood));
    s.res.firewood -= split;
    homes -= split;
    if (s.res.wood >= homes * 2) {
      s.res.wood -= homes * 2;
    } else {
      s.res.wood = 0;
      report.cold = true;
      log(s, 'Not enough firewood! Families are freezing.', 'bad');
    }
  }
  // Fresh milk does not keep.
  if (s.res.milk > 0) s.res.milk = Math.floor(s.res.milk * 0.7);

  // Taxes.
  const tax = TAX_LEVELS[s.taxLevel];
  let taxes = 0;
  for (const b of s.buildings) {
    if (b.residents === 0) continue;
    taxes += b.residents * tax.perHead * (b.type === 'house' ? (HOUSE_LEVELS[b.level]?.tax ?? 1) * (hasLuxury(s, b) ? 1.3 : 1) : 1);
  }
  // A Baron and above collects a tenth more.
  report.taxes = Math.floor(taxes * ((s.title ?? 0) >= 1 ? 1.1 : 1));
  s.res.gold += report.taxes;
  serveAle(s);
  supplyHomes(s);
  monthlyHerds(s, month);
  monthlyYards(s, month);
  report.trade = exportGoods(s);

  updateHappiness(s);
  migrate(s, rng);
  s.moods = (s.moods ?? []).filter((m) => m.until > s.day);
  rollEvent(s, rng, month);

  if (month <= 5) regrowForests(s, rng);
  if (month <= 5 && hasCharter(s, 'nature2')) regrowForests(s, rng);
  monthlyPrestige(s);
  // Stumps grass over in two years, or go when the tile is used or regrows.
  if (s.stumps) {
    for (const k in s.stumps) {
      const i = Number(k);
      if (s.day - s.stumps[i] > 2 * DAYS_PER_YEAR || s.trees[i] > 0 || s.occ[i] >= 0 || s.road[i]) delete s.stumps[i];
    }
  }

  // Bushes fruit in spring and again in summer.
  if (month === 0 || month === 4) s.berries.set(s.berriesMax);
  if (month === 0) {
    yearInReview(s);
    log(s, `Spring of year ${yearOf(s.day)} has arrived.`, 'info');
  }
  if (month === 9) log(s, 'Winter is here. Keep timber stocked for firewood.', 'info');

  updateTier(s);
  checkQuests(s);
  advise(s, month);
  // What was made and used this month becomes last month's tally.
  s.made = s.making ?? {};
  s.used = s.using ?? {};
  s.making = {};
  s.using = {};
  // Monthly change of every stock, for the top bar.
  const prev = s.lastMonth ?? {};
  s.flow = {};
  s.lastMonth = {};
  for (const id of s.seen ?? []) {
    s.flow[id] = Math.round(s.res[id] - (prev[id] ?? s.res[id]));
    s.lastMonth[id] = Math.round(s.res[id]);
  }
  s.history.push({ d: s.day, pop: s.population, food: Math.floor(totalFood(s)), happy: s.happiness, gold: Math.floor(s.res.gold) });
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
}

/**
 * Prestige: the renown of the lord's house, from a fine manor, a church,
 * monuments, townhouses and the charters that bring it.
 */
export function prestigeIncome(s: GameState): number {
  let n = 0;
  let walls = 0;
  for (const b of s.buildings) {
    if (b.build < 1) continue;
    if (b.type === 'townhall') n += (b.level - 1) * 1.5;
    else if (b.type === 'church') n += 1;
    else if (b.type === 'cathedral') n += 6;
    else if (b.type === 'wall') walls++;
    else if (b.type === 'statue') n += 1;
    else if (b.type === 'belltower') n += 2;
    else if (b.type === 'guildhall') n += 4;
    else if (b.type === 'maypole') n += 0.5;
    else if (b.type === 'house' && b.level >= 3) n += 0.2;
    else if (b.type === 'hunter' && hasCharter(s, 'nature3b')) n += 1;
  }
  if (hasCharter(s, 'learning1')) n += 1;
  if (hasCharter(s, 'learning3b')) n += 2;
  if (hasCharter(s, 'metal3a')) n += 1 + s.buildings.filter((b) => b.type === 'jeweller' && b.build >= 1).length * 2;
  // Town walls: renown grows with every twenty sections, up to six a month.
  n += Math.min(6, walls / 20);
  return n;
}

// ---------------------------------------------------------------- retinue

/** Wall sections that make a town feel safe and keep wolves and bandits out. */
export const WALL_SAFE = 40;

/** Every sixth section of town wall has a postern: a small door villagers on foot can use. */
export function isPostern(b: Building): boolean {
  return b.type === 'wall' && (b.x + b.y) % 6 === 0;
}

export function wallSections(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b.type === 'wall' && b.build >= 1) n++;
  return n;
}

/** Settlement rank (Borough) from which the lord may keep a retinue. */
export const RETINUE_TIER = 3;
/** Raising the guard: prestige to attract men-at-arms, and their arms. */
export const RETINUE_COST: Cost = { prestige: 60, weapons: 10 };
/** Coins the guard is paid each month. */
export const RETINUE_PAY = 10;

export function retinueError(s: GameState): string | null {
  if (s.retinue) return 'The retinue is already raised';
  if (s.tier < RETINUE_TIER) return `Requires ${TIERS[RETINUE_TIER].name}`;
  if (s.res.prestige < (RETINUE_COST.prestige ?? 0)) return `Needs ${RETINUE_COST.prestige} prestige`;
  if (s.res.weapons < (RETINUE_COST.weapons ?? 0)) return `Needs ${RETINUE_COST.weapons} arms`;
  return null;
}

export function raiseRetinue(s: GameState): string | null {
  const err = retinueError(s);
  if (err) return err;
  pay(s, RETINUE_COST);
  s.retinue = true;
  log(s, 'Men-at-arms take service with the lord. Wolves and bandits will find the roads guarded.', 'good');
  return null;
}

export function dismissRetinue(s: GameState): void {
  s.retinue = false;
}

/** Pays the guard; unpaid, the men-at-arms drift away. */
function payRetinue(s: GameState): void {
  if (!s.retinue) return;
  if (s.res.gold >= RETINUE_PAY) {
    s.res.gold -= RETINUE_PAY;
    return;
  }
  s.retinue = false;
  log(s, 'The treasury could not pay the retinue, and the men-at-arms have left.', 'bad');
}

function monthlyPrestige(s: GameState): void {
  s.res.prestige += prestigeIncome(s);
  payRetinue(s);
  // The university's masters need books and machines to teach.
  if (hasCharter(s, 'learning3a')) {
    s.universityOk = s.res.books >= 1 && s.res.woodparts >= 2;
    if (s.universityOk) {
      s.res.books -= 1;
      s.res.woodparts -= 2;
    }
  }
  if (hasCharter(s, 'trade3b')) {
    let paved = 0;
    for (let i = 0; i < s.road.length; i++) if (s.road[i] === 2) paved++;
    s.res.gold += Math.floor(paved / 3);
  }
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
  let luxury = 0;
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
    if (b.type === 'house' && hasLuxury(s, b)) luxury += b.residents;
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
    if (luxury) factors.push({ label: 'Fine living (luxuries)', value: Math.round((10 * luxury) / residents) });
  }
  for (const m of s.moods ?? []) if (m.until > s.day) factors.push({ label: m.label, value: m.value });
  if (s.buildings.some((b) => b.type === 'cathedral' && b.build >= 1)) factors.push({ label: 'The cathedral', value: 6 });
  if (s.commissions?.includes('tapestry')) factors.push({ label: 'The great tapestry', value: 2 });
  if (s.commissions?.includes('glass')) factors.push({ label: 'The cathedral glass', value: 3 });
  if ((s.title ?? 0) >= 2) factors.push({ label: `Proud to serve ${(s.title ?? 0) >= 3 ? 'a Duke' : 'an Earl'}`, value: 3 });
  if (s.buildings.some((b) => b.type === 'guildhall' && b.build >= 1)) factors.push({ label: 'Pride in the guildhall', value: 3 });
  if (wallSections(s) >= WALL_SAFE) factors.push({ label: 'Safe behind the town walls', value: 4 });
  if (s.retinue) factors.push({ label: "The lord's guard", value: 2 });
  if (s.charters?.length) {
    const c = (id: string, label: string, v: number) => hasCharter(s, id) && factors.push({ label, value: v });
    c('nature2', 'Love of the greenwood', 3);
    c('nature3a', "The druids' grove", 6);
    c('learning3b', 'The cathedral choir', 6);
    c('orchard3b', 'Honey cakes', 4);
    if (onPath(s, 'metal') && s.buildings.some((b) => (b.type === 'mine' || b.type === 'bloomery' || b.type === 'smithy') && b.build >= 1)) {
      factors.push({ label: 'Smoke from the forges', value: -4 });
    }
    if (onPath(s, 'trade') && s.taxLevel > 0) factors.push({ label: 'Grumbling at the merchants’ taxes', value: -3 });
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
    if (s.year) s.year.left += n;
    log(s, `${n} homeless villagers left the settlement.`, 'bad');
  }
  if ((s.happiness < 30 || r.shortage > 0) && s.population > 2 && !s.relaxed) {
    const n = Math.max(1, Math.round(s.population * (r.shortage > 0 ? 0.12 : 0.06) * (s.hardy ? 1.25 : 1)));
    const actual = Math.min(n, s.population - 2);
    s.population -= actual;
    r.left += actual;
    if (s.year) s.year.left += actual;
    if (actual > 0) log(s, `${actual} unhappy villagers packed up and left.`, 'bad');
  } else if (s.happiness < 30 || r.shortage > 0) {
    // Relaxed mode: nobody leaves, but nobody new arrives either.
  } else if (s.happiness >= 50 && r.shortage === 0) {
    const free = housing - s.population;
    // Newcomers only settle where the larders could feed everyone for a while.
    const room = Math.floor(larder(s) / settlerMonths(s)) - s.population;
    if (free > 0 && room > 0) {
      const n = Math.min(free, room, 1 + Math.floor((s.happiness - 50) / 12) + rng.int(2));
      s.population += n;
      r.arrived += n;
      if (s.year) s.year.arrived += n;
      log(s, `${n} settler${n > 1 ? 's' : ''} arrived seeking a new life.`, 'info');
    }
  }
  recompute(s);
}

/** Months of food in store settlers want to see for the whole town, themselves included. */
export const SETTLER_FOOD_MONTHS = 2;

/** Months of food settlers want to see: more in hardy mode. */
export function settlerMonths(s: GameState): number {
  return s.hardy ? SETTLER_FOOD_MONTHS + 1 : SETTLER_FOOD_MONTHS;
}

/** Bundles of firewood each home burns a winter month. */
export function winterBundles(s: GameState): number {
  return s.hardy ? 2 : 1;
}

/** Why no settlers are coming right now, or null if they may. */
export function settlerBlocker(s: GameState): string | null {
  if (s.happiness < 50) return 'Villagers are not happy enough (50% needed)';
  if (s.report.shortage > 0) return 'Someone went hungry last month';
  if (totalHousing(s) <= s.population) return 'Every home is full';
  if (larder(s) < (s.population + 1) * settlerMonths(s)) {
    // Full granaries that still cannot hold enough: the town needs more of them.
    if (stored(s, 'food') >= storageCap(s, 'food') * 0.9) return `The granaries are too small to hold ${settlerMonths(s)} months of food for everyone: build a Granary`;
    return `The larders look thin: settlers want ${settlerMonths(s)} months of food for everyone`;
  }
  return null;
}

/** The day of each month (0-based) when the market squares fill. */
export const MARKET_DAY = 4;

/** Whether today is market day at a market: staffed, built, and not deep winter. */
export function isMarketDay(s: GameState, b: Building): boolean {
  return b.type === 'market' && b.build >= 1 && b.workers > 0 && s.day % DAYS_PER_MONTH === MARKET_DAY && seasonOf(s.day) !== 3;
}

/** Largest protected wood, tiles a side. */
export const GROVE_MAX = 30;

/** Whether a tile lies in a wood the woodcutters must leave alone. */
export function inGrove(s: GameState, i: number): boolean {
  const g = s.groves;
  if (!g?.length) return false;
  const x = i % s.width;
  const y = (i - x) / s.width;
  return g.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** The protected wood covering a tile, if any. */
export function groveAt(s: GameState, x: number, y: number): number {
  return (s.groves ?? []).findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** Marks the rectangle between two corners as a protected wood; returns why not, or null. */
export function protectGrove(s: GameState, x0: number, y0: number, x1: number, y1: number): string | null {
  const x = Math.max(0, Math.min(x0, x1));
  const y = Math.max(0, Math.min(y0, y1));
  const w = Math.min(s.width, Math.max(x0, x1) + 1) - x;
  const h = Math.min(s.height, Math.max(y0, y1) + 1) - y;
  if (w < 2 || h < 2) return 'A protected wood is at least 2×2 tiles';
  if (w > GROVE_MAX || h > GROVE_MAX) return `A protected wood is at most ${GROVE_MAX} tiles a side`;
  (s.groves ??= []).push({ x, y, w, h });
  return null;
}

/** Lifts the protection from the wood covering a tile. */
export function unprotectGrove(s: GameState, x: number, y: number): boolean {
  const i = groveAt(s, x, y);
  if (i < 0) return false;
  s.groves!.splice(i, 1);
  return true;
}

/** Firsts and round numbers worth a line in the chronicle, checked daily until reached. */
const MILESTONES: { id: string; text: string; reached: (s: GameState) => boolean; quiet?: boolean }[] = [
  { id: 'harvest', text: 'The first harvest was brought in', reached: (s) => (s.year?.harvest ?? 0) > 0 },
  { id: 'bread', text: 'The first loaves came out of the oven', reached: (s) => s.res.bread > 0 },
  { id: 'market', text: 'The first market opened its stalls', reached: (s) => s.buildings.some((b) => b.type === 'market' && b.build >= 1) },
  { id: 'timber', text: 'The first Timber House was raised', reached: (s) => s.buildings.some((b) => b.type === 'house' && b.level >= 2 && b.build >= 1) },
  { id: 'church', text: 'The church bell rang for the first time', reached: (s) => s.buildings.some((b) => b.type === 'church' && b.build >= 1) },
  { id: 'townhouse', text: 'The first Townhouse was raised', reached: (s) => s.buildings.some((b) => b.type === 'house' && b.level >= 3 && b.build >= 1) },
  { id: 'pop50', text: 'Fifty souls now call these lands home', reached: (s) => s.population >= 50 },
  { id: 'pop100', text: 'A hundred villagers now call these lands home', reached: (s) => s.population >= 100 },
  { id: 'pop200', text: 'Two hundred souls live under your banner', reached: (s) => s.population >= 200 },
  { id: 'pop300', text: 'Three hundred souls live under your banner', reached: (s) => s.population >= 300 },
  ...TIERS.slice(1).map((t, i) => ({ id: `tier${i + 1}`, text: `The settlement became a ${t.name}`, reached: (s: GameState) => s.tier >= i + 1, quiet: true })),
  { id: 'fair', text: 'The first fair was held', reached: (s) => (s.fairs ?? 0) > 0, quiet: true },
  { id: 'walls', text: 'The town walls were closed', reached: (s) => wallSections(s) >= WALL_SAFE },
  { id: 'belltower', text: 'The bells of the new tower rang out', reached: (s) => s.buildings.some((b) => b.type === 'belltower' && b.build >= 1) },
  { id: 'guildhall', text: 'The guilds opened their hall', reached: (s) => s.buildings.some((b) => b.type === 'guildhall' && b.build >= 1) },
  { id: 'cathedral', text: 'The cathedral was consecrated', reached: (s) => s.buildings.some((b) => b.type === 'cathedral' && b.build >= 1) },
];

/** Records milestones newly reached; those not announced elsewhere get a toast. */
export function checkMilestones(s: GameState): void {
  // A game saved before milestones were kept: what it had already reached has no date.
  const before = !s.milestones && s.day > 1;
  s.milestones ??= [];
  const got = s.milestones;
  for (const m of MILESTONES) {
    if (got.some((x) => x.id === m.id) || !m.reached(s)) continue;
    got.push({ id: m.id, day: before ? -1 : s.day, text: m.text });
    if (!m.quiet && !before) log(s, `${m.text}.`, 'good');
  }
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
  s.year ??= { pop: s.population, gold: s.res.gold, prestige: s.res.prestige, arrived: 0, left: 0, built: 0, harvest: 0, stock: stockSnapshot(s) };
  recompute(s);
  dailyConstruction(s);
  dailyOrchards(s);
  dailyProduction(s, rng);
  dailyHaul(s);
  reportHarvest(s);
  noteSeen(s);
  checkMilestones(s);
  s.day++;
  if (s.day % DAYS_PER_MONTH === 0) monthly(s, rng);
  if (s.dirty) recompute(s);
}

export { getBuilding };
