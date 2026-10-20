import {
  BUILDINGS,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  GATHER_REACH,
  HAUL_LOAD,
  OFFROAD_TILES_PER_DAY,
  RESOURCE_STORAGE,
  ROAD_TILES_PER_DAY,
  YARD_STORE,
  STORAGE_CAPACITY,
  SILO_CAPACITY,
  SILO_GOODS,
  type StorageKind,
  TRAVEL_WEIGHT,
  MAX_BEAUTY,
  MONTHS_PER_YEAR,
  MONTH_NAMES,
  type Recipe,
  type BuildingDef,
  SELL_FACTOR,
  IMPORT_FACTOR,
  EXPORT_FACTOR,
  EXPORT_PER_MARKET,
  EXPORT_PER_DOCK,
  FOOD_IDS,
  GOODS,
  TAX_LEVELS,
  TIERS,
  TRADE_PRICES,
  UPKEEP,
} from './data';
import { advise } from './advisor';
import { CHARTERS, hasCharter, onPath } from './charters';
import { rollEvent } from './events';
import {
  HOUSE_LEVELS,
  STONE_MANOR,
  finishUpgrade,
  houseNeeds,
  isProject,
  upgradeCost,
  upgradeDays,
  type Need,
  workersOf,
  buildingName,
  marketStalls,
} from './levels';
import { Heap, tileCost } from './path';
import { checkQuests } from './quests';
import { StateRng } from './rng';
import type { Building, BuildingType, Category, Cost, GameState, Herd, MessageKind, ResourceId, Season, Shoal, TradeOrder } from './types';
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
  }
  return n;
}

/** What the stores of a kind hold (for food: not counting the grain kept in silos). */
export function stored(s: GameState, kind: StorageKind): number {
  let n = 0;
  for (const k in RESOURCE_STORAGE) if (RESOURCE_STORAGE[k as ResourceId] === kind) n += s.res[k as ResourceId];
  return kind === 'food' ? n - siloHeld(s) : n;
}

/** Wheat and barley all finished silos hold. */
export function siloCap(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b.type === 'silo' && b.build >= 1) n += SILO_CAPACITY;
  return n;
}

/** Grain now kept in silos: they fill first, the granaries take the rest. */
export function siloHeld(s: GameState): number {
  const cap = siloCap(s);
  if (!cap) return 0;
  let n = 0;
  for (const r of SILO_GOODS) n += s.res[r];
  return Math.min(cap, n);
}

/** Free space left for a resource's storage pool (Infinity for gold). */
export function roomFor(s: GameState, id: ResourceId): number {
  const kind = RESOURCE_STORAGE[id];
  if (!kind) return Infinity;
  const room = Math.max(0, storageCap(s, kind) - stored(s, kind));
  return SILO_GOODS.includes(id) ? room + siloCap(s) - siloHeld(s) : room;
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

export function footprintClear(s: GameState, x: number, y: number, w: number, h: number, wetOk = false): string | null {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!inBounds(s, tx, ty)) return 'Outside the map';
      const i = idx(s, tx, ty);
      // A dock's quay stands on piles in the water; only its warehouse corner needs land.
      if (s.terrain[i] === 1 && !(wetOk && (tx !== x || ty !== y))) return 'Cannot build on water';
      if (s.occ[i] >= 0) return 'Space is occupied';
      if (s.road[i]) return 'A road is in the way';
      if (s.rock[i]) return 'Rocky ground';
      if (s.ore[i]) return 'Boggy ground';
    }
  }
  return null;
}

/**
 * Every building can be raised from the start: the player chooses. Only
 * decorations wait for the town's size (or a charter); improvements to
 * homes, workshops and the manor still follow the town's size.
 */
export function isUnlocked(s: GameState, type: BuildingType): boolean {
  const d = BUILDINGS[type];
  if (MANOR_WORKS.includes(type)) return hasStoneManor(s);
  if (type === 'stable') return s.buildings.some((b) => b.type === 'townhall' && b.build >= 1 && b.level >= 2);
  // Charters gate any building; the settlement's rank only decorations and the monuments.
  if (d.charter && !hasCharter(s, d.charter)) return false;
  if (d.category !== 'decor' && !MONUMENTS.includes(type)) return true;
  return d.tier <= s.tier;
}

/** Great works that, like decorations, wait for the settlement's rank. */
export const MONUMENTS: BuildingType[] = ['statue', 'belltower'];

/** What a Stone Manor lets the lord build. */
export const MANOR_WORKS: BuildingType[] = ['manorgarden', 'watchtower', 'wall'];

export function hasStoneManor(s: GameState): boolean {
  return s.buildings.some((b) => b.type === 'townhall' && b.build >= 1 && b.level >= STONE_MANOR);
}

/** Why a building is locked, for menus. */
export function lockReason(s: GameState, type: BuildingType): string | null {
  const d = BUILDINGS[type];
  if (isUnlocked(s, type)) return null;
  if (MANOR_WORKS.includes(type)) return 'Requires the Stone Manor';
  if (type === 'stable') return 'Requires the Manor House';
  if (d.tier > s.tier) return `Requires ${TIERS[d.tier].name}`;
  if (d.charter && !hasCharter(s, d.charter)) return `Requires the ${CHARTERS.find((c) => c.id === d.charter)?.name ?? d.charter} charter`;
  return null;
}

export function placementError(s: GameState, type: BuildingType, x: number, y: number): string | null {
  const d = BUILDINGS[type];
  if (!d.buildable) return 'Cannot be built';
  if (!isUnlocked(s, type)) return lockReason(s, type);
  const clear = footprintClear(s, x, y, d.w, d.h, type === 'dock');
  if (clear) return clear;
  if ((type === 'fisher' || type === 'claypit' || type === 'watermill' || type === 'dock') && countInRadius(s, centerOf(x, y, d.w, d.h), 2.5, (i) => s.terrain[i] === 1) < 2) {
    return 'Must be next to water';
  }
  if (type === 'cathedral' && s.buildings.some((b) => b.type === 'cathedral')) return 'Your town has its cathedral';
  if (type === 'townhall' && s.buildings.some((b) => b.type === 'townhall')) return 'Your town has its manor';
  if (type === 'guildhall' && s.buildings.some((b) => b.type === 'guildhall')) return 'Your town has its guildhall';
  if (type === 'belltower' && s.buildings.some((b) => b.type === 'belltower')) return 'Your town has its bell tower';
  if (type === 'manorgarden' && s.buildings.some((b) => b.type === 'manorgarden')) return 'Your manor has its garden';
  if (type === 'stable' && s.buildings.some((b) => b.type === 'stable')) return 'Your manor has its stable';
  if (type === 'university' && s.buildings.some((b) => b.type === 'university')) return 'Your town has its university';
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
    // A marketplace tends itself.
    if (!zd || zd.owner === z.type) continue;
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
    out[id] = (mats[id] ?? 0) - (b.need?.[id] ?? 0) - (id === 'wood' && !b.upgrading ? (b.felled ?? 0) : 0);
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
/** Dressed stone for each tile of cobbled street, and the rank it waits for (none: dressed stone is its own price). */
export const COBBLE_COST: Cost = { dressedstone: 1 };
export const COBBLE_TIER = 0;

/** Road grades: 1 dirt, 2 stone (gravel and stone), 3 cobbled street. */
export type RoadGrade = 1 | 2 | 3;
export function gradeOf(paved: boolean | RoadGrade): RoadGrade {
  return paved === true ? 2 : paved === false ? 1 : paved;
}

export function roadError(s: GameState, x: number, y: number, paved: boolean | RoadGrade = false): string | null {
  if (!inBounds(s, x, y)) return 'Outside the map';
  const grade = gradeOf(paved);
  const i = idx(s, x, y);
  const planned = plannedRoad(s, i);
  if (planned && (grade > 1 ? planned >= grade : true)) return 'Already planned';
  if (s.occ[i] >= 0) return 'Occupied';
  if (s.rock[i]) return 'Rocky ground';
  if (s.ore[i]) return 'Boggy ground';
  if (grade === 3) {
    if (s.tier < COBBLE_TIER) return `Requires ${TIERS[COBBLE_TIER].name}`;
    if (s.road[i] === 3) return 'Already cobbled';
    if (s.terrain[i] === 1) return s.road[i] ? 'Bridges stay timber' : 'Cannot cobble water';
    if (!canAfford(s, COBBLE_COST)) return 'Not enough dressed stone';
    return null;
  }
  if (grade === 2) {
    if (s.tier < PAVING_TIER) return `Requires ${TIERS[PAVING_TIER].name}`;
    if (s.road[i] >= 2) return 'Already paved';
    if (s.terrain[i] === 1) return s.road[i] ? 'Bridges stay timber' : 'Cannot pave water';
    if (!canAfford(s, PAVING_COST)) return 'Not enough stone';
    return null;
  }
  if (s.road[i]) return 'Already a road';
  if (s.terrain[i] === 1 && !canAfford(s, BRIDGE_COST)) return 'Not enough timber for a bridge';
  return null;
}

/** Lays a dirt road, or paves one (also laying it where there was none). */
export function buildRoad(s: GameState, x: number, y: number, paved: boolean | RoadGrade = false): boolean {
  if (roadError(s, x, y, paved)) return false;
  const grade = gradeOf(paved);
  if (grade === 3) pay(s, COBBLE_COST);
  else if (grade === 2) pay(s, PAVING_COST);
  else if (isBridge(s, x, y)) pay(s, BRIDGE_COST);
  setRoad(s, x, y, true, grade);
  return true;
}

export function removeRoad(s: GameState, x: number, y: number): boolean {
  if (!inBounds(s, x, y)) return false;
  const i = idx(s, x, y);
  if (plannedRoad(s, i)) {
    // An unlaid tile is simply struck from the plan, and what was paid comes back.
    for (let k = s.roadPlan!.length - 1; k >= 0; k--) {
      if (s.roadPlan![k] >> 2 !== i) continue;
      refundRoad(s, i, s.roadPlan![k] & 3);
      s.roadPlan!.splice(k, 1);
    }
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
  if (kind === 3) refund(s, COBBLE_COST, 1);
  else if (kind === 2) refund(s, PAVING_COST, 1);
  else if (s.terrain[i] === 1) refund(s, BRIDGE_COST, 1);
}

/**
 * Plans a road tile for the villagers to lay: it is paid for now and laid in
 * a moment, in the order drawn (see layRoads).
 */
export function planRoad(s: GameState, x: number, y: number, paved: boolean | RoadGrade = false): boolean {
  if (roadError(s, x, y, paved)) return false;
  const grade = gradeOf(paved);
  if (grade === 3) pay(s, COBBLE_COST);
  else if (grade === 2) pay(s, PAVING_COST);
  else if (isBridge(s, x, y)) pay(s, BRIDGE_COST);
  const i = idx(s, x, y);
  // One plan to a tile: a better road planned over a lesser one takes its place.
  const k = (s.roadPlan ??= []).findIndex((c) => c >> 2 === i);
  if (k >= 0) {
    refundRoad(s, i, s.roadPlan[k] & 3);
    s.roadPlan.splice(k, 1);
  }
  s.roadPlan.push(i * 4 + grade);
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
    const need = 1 / (kind >= 2 ? PAVE_LAY_PER_DAY : ROAD_LAY_PER_DAY);
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

/** Why a building cannot be pulled down, if it cannot: the manor, or the town's last store of a kind. */
export function demolishBlocker(s: GameState, b: Building): string | null {
  if (b.type === 'townhall' && b.build >= 1) return 'The manor cannot be pulled down';
  const caps = STORAGE_CAPACITY[b.type];
  if (b.build >= 1 && caps) {
    for (const kind of Object.keys(caps) as StorageKind[]) {
      const other = s.buildings.some((o) => o !== b && o.build >= 1 && (STORAGE_CAPACITY[o.type]?.[kind] ?? 0) > 0);
      if (!other) return `The town's last store for ${kind}: build a ${kind === 'food' ? 'granary' : 'storehouse'} first`;
    }
  }
  return null;
}

export function demolish(s: GameState, b: Building): boolean {
  if (demolishBlocker(s, b)) return false;
  const d = BUILDINGS[b.type];
  // What comes back: sites return what was delivered (and the gold),
  // finished buildings half their cost, and the barn and yard are emptied.
  const back: Cost = {};
  const add = (c: Cost, f = 1) => {
    for (const k in c) {
      const id = k as ResourceId;
      if (id === 'gold' || id === 'prestige') s.res[id] += Math.floor((c[id] ?? 0) * f);
      else back[id] = (back[id] ?? 0) + Math.floor((c[id] ?? 0) * f);
    }
  };
  if (b.build >= 1) {
    add(d.zone ? zoneCost(b.type, b.w, b.h) : d.cost, 0.5);
    if (b.upgrading) {
      // A renovation under way gives back its gold and what was carried in.
      const cost = upgradeCost(b);
      s.res.gold += cost.gold ?? 0;
      s.res.prestige += cost.prestige ?? 0;
      add(deliveredTo(b));
    }
  } else {
    s.res.gold += d.cost.gold ?? 0;
    add(deliveredTo(b));
  }
  if (b.barn) add(b.barn);
  if (b.stock) add(b.stock);
  // The building goes first, so a storehouse does not take its own refund.
  removeBuilding(s, b);
  recompute(s);
  let lost = 0;
  for (const k in back) {
    const n = back[k as ResourceId] ?? 0;
    lost += n - store(s, k as ResourceId, n);
  }
  if (lost >= 1) log(s, `${Math.floor(lost)} goods from the ${d.name.toLowerCase()} had no room in the stores and were lost.`, 'bad');
  return true;
}

export function hasBuilt(s: GameState, type: BuildingType): boolean {
  return s.buildings.some((b) => b.type === type && b.build >= 1);
}

/** Coins to buy n units at the market: never under three times the best the town could get selling it. */
export function buyPrice(s: GameState, id: ResourceId, n: number): number {
  // Boats bring goods in cheaper than carts.
  const dock = hasBuilt(s, 'dock') ? 0.85 : 1;
  const unit = priceOf(s, id) * IMPORT_FACTOR * dock * (hasCharter(s, 'trade1') ? 0.85 : 1);
  const floor = 3 * Math.max(priceOf(s, id) * SELL_FACTOR * (hasCharter(s, 'trade1') ? 1.2 : 1), exportUnitPrice(s, id));
  return Math.ceil(Math.max(unit, floor) * n);
}

/** Coins earned selling n units at the market. */
export function sellPrice(s: GameState, id: ResourceId, n: number): number {
  return Math.floor(priceOf(s, id) * SELL_FACTOR * n * (hasCharter(s, 'trade1') ? 1.2 : 1));
}

/** Coins merchants pay for one unit in their monthly visit, with every bonus the town has. */
export function exportUnitPrice(s: GameState, id: ResourceId): number {
  const docks = s.buildings.some((b) => b.type === 'dock' && b.build >= 1 && b.workers > 0);
  const guild = s.buildings.some((b) => b.type === 'guildhall' && b.build >= 1 && b.workers > 0);
  return priceOf(s, id) * EXPORT_FACTOR * (hasCharter(s, 'trade1') ? 1.2 : 1) * (hasCharter(s, 'trade3a') ? 1.3 : 1) * (guild ? 1.2 : 1) * (docks ? 1.15 : 1);
}

/** Units of a good free to sell: above its stock target and what building sites are still owed. */
export function surplusOf(s: GameState, id: ResourceId): number {
  return Math.max(0, Math.floor(s.res[id] - keepOf(s, id) - owedTo(s, id)));
}

/** Units each crate lets the merchants carry on top of their usual load. */
export const UNITS_PER_CRATE = 10;
/** Share of the crates used on a trip that come back too worn to use again. */
export const CRATE_WEAR = 0.25;

// ---------------------------------------------------------------- upkeep

/** How fast a workplace works with its gear worn out and nothing to mend it with. */
export const WORN_YIELD = 0.75;

export function wornYield(b: Building): number {
  return b.worn ? WORN_YIELD : 1;
}

/**
 * Each working day a workplace wears its tools and wood parts a little, by
 * how much gear its trade takes and how many work there; once a whole one is
 * worn out it is replaced from the stores. With none in store the crew makes
 * do with worn gear, and works slower until one comes.
 */
export function dailyUpkeep(s: GameState): void {
  for (const b of s.buildings) {
    const wear = UPKEEP[b.type];
    if (!wear || b.build < 1 || b.workers <= 0 || b.paused || isBlocked(b)) continue;
    const crew = b.workers / Math.max(1, workersOf(b));
    for (const k in wear) {
      const id = k as 'tools' | 'woodparts';
      const acc = (b.upkeep ??= {});
      acc[id] = (acc[id] ?? 0) + ((wear[id] ?? 0) * crew) / DAYS_PER_MONTH;
      if ((acc[id] ?? 0) < 1) continue;
      if (s.res[id] >= 1) {
        s.res[id] -= 1;
        acc[id] = (acc[id] ?? 0) - 1;
      } else acc[id] = 1;
    }
    // Worn gear: a whole one is due and none was there to replace it.
    const worn = Object.keys(wear).some((k) => (b.upkeep?.[k as 'tools'] ?? 0) >= 1);
    if (worn !== !!b.worn) b.worn = worn || undefined;
  }
}

/**
 * Goods the merchants carry each month at one staffed trading post or dock,
 * more with charters and a high title.
 */
export function tradeCapacity(s: GameState, b: Building): number {
  if (b.build < 1 || b.workers <= 0) return 0;
  const per = b.type === 'dock' ? EXPORT_PER_DOCK : b.type === 'tradingpost' ? EXPORT_PER_MARKET : 0;
  return Math.floor(per * (hasCharter(s, 'trade2') ? 2 : 1) * ((s.title ?? 0) >= 3 ? 1.5 : 1) * (beastWorks(b) ? HORSE_TRADE : 1));
}

/** Crates in store above their stock target: each lets a cart carry ten more exports. */
function spareCrates(s: GameState): number {
  return Math.max(0, Math.floor(s.res.crates - keepOf(s, 'crates')));
}

/** All the town's staffed posts and docks together: the base load and what crates add for exports. */
export function exportBudget(s: GameState): { base: number; crated: number } {
  const base = s.buildings.reduce((n, b) => n + tradeCapacity(s, b), 0);
  return { base, crated: Math.min(Math.floor(base / 2), spareCrates(s) * UNITS_PER_CRATE) };
}

export function addOrder(s: GameState, b: Building, kind: TradeOrder['kind'], res: ResourceId, target?: number): TradeOrder | null {
  if (b.type !== 'tradingpost' && b.type !== 'dock') return null;
  if (!priceOf(s, res)) return null;
  s.nextOrderId = (s.nextOrderId ?? 1) + 1;
  // Imports start a little above what is in store, exports at the stock target.
  const start = target ?? (kind === 'import' ? Math.ceil((s.res[res] + 30) / 10) * 10 : Math.max(0, Math.round(keepOf(s, res) / 10) * 10));
  const o: TradeOrder = { id: s.nextOrderId, kind, res, target: Math.max(0, start) };
  (b.orders ??= []).push(o);
  return o;
}

export function removeOrder(b: Building, id: number): void {
  b.orders = (b.orders ?? []).filter((o) => o.id !== id);
}

export function setOrderTarget(b: Building, id: number, target: number): void {
  const o = b.orders?.find((x) => x.id === id);
  if (o) o.target = Math.max(0, Math.round(target));
}

/** Moves an order to `to` in the list (0 is worked first). */
export function moveOrder(b: Building, id: number, to: number): void {
  const list = b.orders ?? [];
  const from = list.findIndex((o) => o.id === id);
  if (from < 0) return;
  const [o] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, o);
}

/**
 * The monthly merchant visit: each staffed trading post and dock works
 * through its orders from the first, buying up to an import's target or
 * selling down to an export's, until its carts are full. Spare crates let
 * the carts take more exports. Returns coins earned and spent.
 */
export function runTradeOrders(s: GameState): { earned: number; spent: number } {
  let earned = 0;
  let spent = 0;
  let cratesWorn = 0;
  let crates = spareCrates(s);
  const sold: string[] = [];
  const bought: string[] = [];
  for (const b of s.buildings) {
    if (b.type !== 'tradingpost' && b.type !== 'dock') continue;
    const orders = b.orders ?? [];
    for (const o of orders) {
      o.moved = 0;
      o.note = undefined;
    }
    let room = tradeCapacity(s, b);
    if (!room) {
      for (const o of orders) o.note = b.build < 1 ? 'Not built yet' : 'No one to meet the merchants';
      continue;
    }
    let extra = Math.min(Math.floor(room / 2), crates * UNITS_PER_CRATE);
    let extraUsed = 0;
    for (const o of orders) {
      const id = o.res;
      if (o.kind === 'export') {
        // Never below the target, nor what the building sites are still owed.
        const free = Math.floor(s.res[id] - Math.max(o.target, owedTo(s, id)));
        const price = exportUnitPrice(s, id);
        if (free <= 0) {
          o.note = 'Down to its target';
          continue;
        }
        if (room + extra <= 0) {
          o.note = 'The carts were full';
          continue;
        }
        const n = Math.min(free, room + extra);
        const fromExtra = Math.max(0, n - room);
        room -= n - fromExtra;
        extra -= fromExtra;
        extraUsed += fromExtra;
        s.res[id] -= n;
        earned += n * price;
        o.moved = n;
        o.note = free > n ? 'The carts were full' : 'Down to its target';
        sold.push(`${n} ${GOODS[id].name.toLowerCase()}`);
      } else {
        const want = Math.floor(o.target - s.res[id]);
        if (want <= 0) {
          o.note = 'Up to its target';
          continue;
        }
        if (room <= 0) {
          o.note = 'The carts were full';
          continue;
        }
        const unit = buyPrice(s, id, 1);
        const space = Math.floor(roomFor(s, id));
        const purse = Math.floor(s.res.gold / Math.max(1, unit));
        const n = Math.min(want, room, space, purse);
        if (n <= 0) {
          o.note = space <= 0 ? 'No room in the stores' : 'Not enough coins';
          continue;
        }
        const cost = buyPrice(s, id, n);
        s.res.gold -= cost;
        s.res[id] += n;
        spent += cost;
        o.moved = n;
        // What stopped it short, if anything.
        o.note = n >= want ? 'Up to its target' : n === room ? 'The carts were full' : n === space ? 'No room in the stores' : 'Not enough coins';
        room -= n;
        bought.push(`${n} ${GOODS[id].name.toLowerCase()}`);
      }
    }
    // The crates that carried the goods beyond the usual load come back with
    // the carts, but knocked about: some wear out on every trip.
    const used = Math.ceil(extraUsed / UNITS_PER_CRATE);
    if (used) {
      const worn = Math.max(1, Math.round(used * CRATE_WEAR));
      s.res.crates = Math.max(0, s.res.crates - worn);
      crates -= used;
      cratesWorn += worn;
    }
  }
  earned = Math.floor(earned);
  s.res.gold += earned;
  if (sold.length) log(s, `Merchants bought ${sold.join(', ')} for ${earned} coins.`, 'info');
  if (bought.length) log(s, `Merchants brought ${bought.join(', ')} for ${spent} coins.`, 'info');
  s.report.cratesWorn = cratesWorn || undefined;
  return { earned, spent };
}

/** The monthly merchant visit; returns the coins earned from exports. */
export function exportGoods(s: GameState): number {
  return runTradeOrders(s).earned;
}

/** Whether the town can trade: a trading post or a dock. */
export function hasTrade(s: GameState): boolean {
  return hasBuilt(s, 'tradingpost') || hasBuilt(s, 'dock');
}

export function trade(s: GameState, id: ResourceId, amount: number): string | null {
  if (!hasTrade(s)) return 'Requires a trading post or a dock';
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
  // Each home drinks at its nearest open tavern only, so overlapping taverns do not pour twice.
  const taverns = s.buildings.filter((t) => t.type === 'tavern' && t.build >= 1 && t.workers > 0);
  const regulars = new Map<number, number>();
  for (const h of s.buildings) {
    if (h.residents === 0) continue;
    const hc = bCenter(h);
    let best: Building | null = null;
    let bd = Infinity;
    for (const t of taverns) {
      const d = Math.hypot(bCenter(t).x - hc.x, bCenter(t).y - hc.y);
      if (d <= BUILDINGS.tavern.radius && d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best) regulars.set(best.id, (regulars.get(best.id) ?? 0) + h.residents);
  }
  for (const t of taverns) {
    const served = regulars.get(t.id) ?? 0;
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

/** Goods each home level uses up, one every two months. */
export const HOUSE_GOODS: Record<number, ResourceId[]> = { 2: ['clothes'], 3: ['clothes', 'boots', 'medicine'], 4: ['clothes', 'boots', 'medicine', 'pottery'] };
const SUPPLY_DAYS = DAYS_PER_MONTH * 2;

/** Whether a home has (or could get from store) a good it needs. */
export function hasSupply(s: GameState, b: Building, id: ResourceId): boolean {
  // Bought at the market: a home it does not serve cannot get any, however much is in store.
  return (b.supply?.[id] ?? -1) > s.day || (s.res[id] >= 1 && coveredBy(s, b, 'market'));
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
    // Clothes, boots and luxuries are bought at the market, like food.
    if (!coveredBy(s, b, 'market')) continue;
    if (b.level >= 3 && !hasLuxury(s, b)) {
      const lux = LUXURIES.find((id) => s.res[id] >= 1);
      if (lux) {
        s.res[lux] -= 1;
        (b.supply ??= {})[lux] = s.day + SUPPLY_DAYS;
      }
    }
    for (const id of HOUSE_GOODS[Math.min(4, b.level)] ?? []) {
      b.supply ??= {};
      if ((b.supply[id] ?? -1) > s.day) continue;
      if (s.res[id] >= 1) {
        s.res[id] -= 1;
        b.supply[id] = s.day + SUPPLY_DAYS;
      }
    }
  }
}

/** Units of a good to keep in store: producers rest above it. */
export function keepOf(s: GameState, id: ResourceId): number {
  return s.targets?.[id] ?? GOODS[id].keep;
}

export function setKeep(s: GameState, id: ResourceId, keep: number): void {
  s.targets ??= {};
  s.targets[id] = Math.max(0, Math.round(keep));
}

/** Whether the town has stopped making this good for now. */
export function stoppedMaking(s: GameState, id: ResourceId): boolean {
  return !!s.stopped?.includes(id);
}

export function setStopped(s: GameState, id: ResourceId, on: boolean): void {
  const list = (s.stopped ?? []).filter((x) => x !== id);
  if (on) list.push(id);
  s.stopped = list.length ? list : undefined;
  s.dirty = true;
}

/** True when every good a building makes is at or above its stock target. */
export function enoughOf(s: GameState, out: Cost): ResourceId | null {
  let first: ResourceId | null = null;
  for (const k in out) {
    const id = k as ResourceId;
    if (id === 'gold' || id === 'prestige') return null;
    // A good the town has stopped making counts as enough, whatever the stock.
    if (stoppedMaking(s, id)) {
      first ??= id;
      continue;
    }
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

/**
 * How long a walk it is from a spot to the nearest of what a gatherer
 * gathers, in tiles of open ground (roads make it shorter); null if none is
 * within reach.
 */
export function nearestResource(s: GameState, type: BuildingType, c: { x: number; y: number }): number | null {
  const d = BUILDINGS[type];
  const x = Math.max(0, Math.min(s.width - 1, Math.floor(c.x)));
  const y = Math.max(0, Math.min(s.height - 1, Math.floor(c.y)));
  const f = walkingField(s, [y * s.width + x], s.occ[y * s.width + x] >= 0 ? [s.occ[y * s.width + x]] : []);
  const offroad = OFFROAD_TILES_PER_DAY / ROAD_TILES_PER_DAY;
  let best = Infinity;
  if (type === 'hunter') for (const h of s.herds ?? []) h.n >= 1 && (best = Math.min(best, walkToPoint(f, s, h.x, h.y, 2)));
  else if (type === 'fisher') for (const h of s.shoals ?? []) h.n >= 1 && (best = Math.min(best, walkToPoint(f, s, h.x, h.y, 4)));
  else {
    const has: Partial<Record<string, (i: number) => boolean>> = {
      trees: (i) => s.trees[i] > 0 && !inGrove(s, i),
      rock: (i) => s.rock[i] > 0,
      ore: (i) => s.ore[i] > 0,
      // Foragers pick berries, and mushrooms in the woods.
      berries: (i) => s.berriesMax[i] > 0 || (s.mushroomsMax?.[i] ?? 0) > 0,
    };
    const pred = has[d.gathers ?? ''];
    if (!pred) return null;
    for (const i of f.order)
      if (pred(i)) {
        best = f.cost[i];
        break;
      }
  }
  return Number.isFinite(best) ? best * offroad : null;
}

/** Amount of the gathered map resource available around a spot. */
export function resourceInRange(s: GameState, type: BuildingType, c: { x: number; y: number }): number {
  const d = BUILDINGS[type];
  switch (d.gathers) {
    case 'trees':
      return countInRadius(s, c, d.radius, (i) => s.trees[i] > 0 && !inGrove(s, i));
    case 'forest':
      // Game: the animals of the herds within a fair walk.
      return Math.floor((s.herds ?? []).reduce((n, h) => n + (Math.hypot(h.x - c.x, h.y - c.y) <= GATHER_REACH / 2 ? h.n : 0), 0));
    case 'rock':
      return countInRadius(s, c, d.radius, (i) => s.rock[i] > 0);
    case 'ore':
      return countInRadius(s, c, d.radius, (i) => s.ore[i] > 0);
    case 'berries':
      return countInRadius(s, c, d.radius, (i) => s.berriesMax[i] > 0);
    case 'water':
      if (type === 'fisher') return Math.floor((s.shoals ?? []).reduce((n, h) => n + (Math.hypot(h.x - c.x, h.y - c.y) <= GATHER_REACH / 2 ? h.n : 0), 0));
      return countInRadius(s, c, d.radius, (i) => s.terrain[i] === 1);
    default:
      return 0;
  }
}

export function coveredBy(s: GameState, b: Building, type: BuildingType): boolean {
  // A market has no reach: its stalls serve the nearest homes, as many as they can.
  if (type === 'market') {
    // The camp's and the manor's folk are fed from any open stall, without taking a household's place.
    if (b.type !== 'house') return s.buildings.some((m) => isMarket(m) && m.build >= 1 && m.workers > 0);
    return marketServed(s).has(b.id);
  }
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

/** Road tiles linked to the town's seat (used by the autoplayer's planning). */
export function reachableRoads(s: GameState): Uint8Array {
  const reached = new Uint8Array(s.width * s.height);
  const hall = seatOf(s);
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
  return tileCost(s, i);
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
    const open = (xx: number, yy: number) => {
      const k = yy * s.width + xx;
      return !(s.terrain[k] === 1 && !s.road[k]) && (s.occ[k] < 0 || zones.has(s.occ[k]));
    };
    // Eight ways, as the villagers walk; no cutting corners past buildings or water.
    for (const [dx, dy, dl] of WALK_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(s, nx, ny)) continue;
      const j = ny * s.width + nx;
      if (s.terrain[j] === 1 && !s.road[j]) continue;
      // Paths may end at a building's edge but not cross other buildings.
      if (s.occ[j] >= 0 && field[i] > 0 && !zones.has(s.occ[j])) continue;
      if (dx && dy && (!open(nx, y) || !open(x, ny))) continue;
      const ng = g + dl * stepCost(s, j);
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

const CATEGORY_PRIORITY: Record<Category, number> = { farming: 0, food: 0.5, resources: 1, industry: 2, civic: 3, manor: 3.5, works: 3.5, housing: 4, decor: 5 };
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
/** Fells up to n timber's worth of trees around a site; returns the timber got. */
function fellNear(s: GameState, b: Building, n: number): number {
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
  return got;
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
    mapVersion++;
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
    // Market vendors are how food reaches the table: staffed with the food
    // makers. Haulers keep every workplace's yard from filling: staffed with
    // raw materials.
    (isMarket(b) ? 0.45 : b.type === 'storehouse' || b.type === 'granary' ? 1.05 : CATEGORY_PRIORITY[workDef(b).category]) +
    (TYPE_PRIORITY[b.type] ?? 0) +
    (isBlocked(b) ? 10 : 0);
  // `cap` limits a job to some of the building's places, `more` adds to those already filled.
  type Job = { b: Building; site: boolean; p: number; cap?: number; more?: boolean };
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
      if (isMarket(b)) {
        // One vendor opens the market, hired with the food makers; the
        // other stalls are kept only when there are hands to spare.
        jobs.push({ b, site: false, p: prio(b), cap: 1 });
        jobs.push({ b, site: false, p: (2 - (b.priority ?? 1)) * 100 + CATEGORY_PRIORITY.civic + 0.5, more: true });
      } else {
        // Families working a craft from home always tend to it first.
        // A family craft comes first within its priority band; the player's priority still rules.
        jobs.push({ b, site: false, p: b.trade ? (2 - (b.priority ?? 1)) * 100 - 1 : prio(b) });
      }
    }
  }
  jobs.sort((a, c) => a.p - c.p || a.b.id - c.b.id);
  for (const j of jobs) {
    const places = Math.min(workersOf(j.b), j.b.want ?? Infinity);
    const n = Math.min(free, j.site ? (j.b.type === 'wall' ? 1 : SITE_BUILDERS) : j.more ? places - j.b.workers : Math.min(places, j.cap ?? Infinity));
    if (j.site) j.b.builders = n;
    else if (j.more) j.b.workers += n;
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
/** Turning a home into a craftsman's house: a workshop built on, carried in by builders. */
export const HOME_TRADE_COST: Cost = { wood: 15, planks: 25, tools: 2, gold: 40 };
/** Days of building work to add a home workshop. */
export const HOME_TRADE_DAYS = 12;
/** A family working from home produces this much more than a common workshop. */
export const HOME_TRADE_BONUS = 1.5;

/** What a building works as: its own kind, or the craft a family keeps at home. */
export function workDef(b: Building): BuildingDef {
  return b.trade ? BUILDINGS[b.trade] : BUILDINGS[b.type];
}

/** Why a home cannot take up a craft, or null. */
export function tradeError(s: GameState, b: Building, trade: BuildingType | undefined): string | null {
  if (b.type !== 'house' || b.build < 1) return 'Only homes';
  if (b.trade) return `This family keeps its ${BUILDINGS[b.trade].name.toLowerCase()} for good`;
  if (b.craftTo || b.upgrading) return 'Builders are already at work here';
  if (!trade) return 'Choose a craft';
  if (!HOME_TRADES.includes(trade)) return 'Not a home craft';
  if (b.level < 2) return 'Only Timber Houses and Townhouses';
  if (!isUnlocked(s, trade)) return `Requires ${TIERS[BUILDINGS[trade].tier].name}`;
  if (s.res.gold < (HOME_TRADE_COST.gold ?? 0)) return `Needs ${HOME_TRADE_COST.gold} coins`;
  return null;
}

/**
 * Builds a workshop onto a home for the family to work a craft: coins now,
 * materials carried in by builders, and the craft is the family's for good.
 */
export function setTrade(s: GameState, b: Building, trade: BuildingType | undefined): string | null {
  const err = tradeError(s, b, trade);
  if (err) return err;
  s.res.gold -= HOME_TRADE_COST.gold ?? 0;
  b.craftTo = trade;
  b.upgrading = b.level;
  b.upProgress = 0;
  b.need = materialsOf(HOME_TRADE_COST);
  b.carry = 0;
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
  // The harvest is brought in early in its month; once it is in, the farmers are free.
  if (b.type === 'farm' && monthOf(s.day) === 7 && s.day % DAYS_PER_MONTH !== 0 && !zonesOf(s, b).some((f) => f.growth > 0)) return true;
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
  // Enough for a winter: three months of bundles (two a month in hardy winters).
  return s.res.firewood < homes * 3 * winterBundles(s);
}

function recipeInMonth(r: Recipe, month: number): boolean {
  return !r.months || r.months.includes(month);
}

/** Whether a recipe could run right now (season, inputs, map resources). */
function recipeReady(s: GameState, b: Building, r: Recipe): boolean {
  if (!recipeInMonth(r, monthOf(s.day))) return false;
  if (!canAfford(s, r.inputs)) return false;
  if (b.type === 'forager' && r.id === 'berries') {
    return countInRadius(s, bCenter(b), GATHER_REACH, (i) => s.berries[i] > 0) > 0;
  }
  if (b.type === 'forager' && r.id === 'mushrooms') {
    const c = bCenter(b);
    for (const k in s.mushrooms ?? {}) {
      const i = Number(k);
      if ((s.mushrooms![k] ?? 0) > 0 && Math.hypot((i % s.width) + 0.5 - c.x, Math.floor(i / s.width) + 0.5 - c.y) <= GATHER_REACH) return true;
    }
    return false;
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

// ---------------------------------------------------------------- walking to resources

/**
 * The longest walk a gatherer goes for what it gathers, in dirt-road tiles:
 * GATHER_REACH tiles over open ground, further along roads.
 */
export const GATHER_COST = GATHER_REACH * (ROAD_TILES_PER_DAY / OFFROAD_TILES_PER_DAY);

/** Walking times from a workplace's door: every tile within reach, nearest first. */
interface WalkField {
  cost: Float32Array;
  order: number[];
  key: string;
}
const walkCache = new WeakMap<GameState, Map<number, WalkField>>();
/** Bumped whenever buildings or roads change, so the fields are worked out again. */
let mapVersion = 0;

const WALK_DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Walking time from some starting tiles to every tile within GATHER_COST, as
 * the villagers walk: roads, gravel and cobbles at their speeds, slower
 * through woods, around buildings (fields and posterns can be crossed) and
 * water (unless bridged).
 */
export function walkingField(s: GameState, starts: number[], allow: number[] = []): WalkField {
  const n = s.width * s.height;
  const cost = new Float32Array(n).fill(Infinity);
  const order: number[] = [];
  const zones = new Set(s.buildings.filter((b) => BUILDINGS[b.type].zone || isPostern(b)).map((b) => b.id));
  const passable = (i: number) => {
    if (s.terrain[i] === 1 && !s.road[i]) return false;
    const o = s.occ[i];
    return o < 0 || zones.has(o) || allow.includes(o);
  };
  const heap = new Heap();
  for (const i of starts) {
    cost[i] = 0;
    heap.push(i, 0);
  }
  const done = new Uint8Array(n);
  while (heap.size) {
    const i = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    order.push(i);
    const x = i % s.width;
    const y = (i - x) / s.width;
    for (const [dx, dy, dl] of WALK_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(s, nx, ny)) continue;
      const j = ny * s.width + nx;
      if (done[j] || !passable(j)) continue;
      // No cutting corners past buildings or water.
      if (dx && dy && (!passable(y * s.width + nx) || !passable(ny * s.width + x))) continue;
      const g = cost[i] + (dl * (tileCost(s, i) + tileCost(s, j))) / 2;
      if (g > GATHER_COST || g >= cost[j]) continue;
      cost[j] = g;
      heap.push(j, g);
    }
  }
  return { cost, order, key: '' };
}

/** The walking field from a workplace's door (kept until the map changes or a month passes). */
export function walkFrom(s: GameState, b: Building): WalkField {
  let m = walkCache.get(s);
  if (!m) walkCache.set(s, (m = new Map()));
  const key = `${mapVersion}:${b.x}:${b.y}:${Math.floor(s.day / DAYS_PER_MONTH)}`;
  const had = m.get(b.id);
  if (had && had.key === key) return had;
  const d = doorTile(s, b);
  const f = walkingField(s, [d.y * s.width + d.x], [b.id]);
  f.key = key;
  m.set(b.id, f);
  return f;
}

/** The quickest tile to walk to that passes a test; -1 if none within reach. */
function nearestTile(s: GameState, b: Building, test: (i: number) => boolean): number {
  for (const i of walkFrom(s, b).order) if (test(i)) return i;
  return -1;
}

/** Walking time to a point (a herd in the woods, a shoal off the bank): to the nearest land within a short way of it. */
function walkToPoint(f: WalkField, s: GameState, px: number, py: number, near: number): number {
  let best = Infinity;
  const r = Math.ceil(near);
  for (let y = Math.floor(py) - r; y <= Math.floor(py) + r; y++)
    for (let x = Math.floor(px) - r; x <= Math.floor(px) + r; x++) {
      if (!inBounds(s, x, y) || Math.hypot(x + 0.5 - px, y + 0.5 - py) > near) continue;
      const c = f.cost[y * s.width + x];
      if (c < best) best = c;
    }
  return best;
}

// ---------------------------------------------------------------- production

/** How much more (or less) a workplace makes thanks to the town's charters. */
export function charterBonus(s: GameState, b: Building, id: ResourceId): number {
  if (!s.charters?.length) return 1;
  const d = workDef(b);
  let f = 1;
  const t = b.trade ?? b.type;
  if ((t === 'forager' || t === 'hunter') && hasCharter(s, 'nature1')) f *= 1.4;
  if (t === 'hunter' && hasCharter(s, 'nature3b')) f *= 1.5;
  if (t === 'woodcutter' && hasCharter(s, 'nature2')) f *= 1.2;
  if ((t === 'quarry' || t === 'mine') && onPath(s, 'nature')) f *= 0.8;
  if ((t === 'bloomery' || t === 'smithy' || t === 'armoury') && hasCharter(s, 'metal1')) f *= 1.25;
  if (t === 'jeweller' && hasCharter(s, 'metal3a')) f *= 2;
  if (t === 'scriptorium' && id === 'books' && hasCharter(s, 'learning1')) f *= 1.5;
  if ((t === 'windmill' || t === 'watermill' || t === 'bakery') && hasCharter(s, 'farm3a')) f *= 1.3;
  if (t === 'tanner' && hasCharter(s, 'herd3a')) f *= 1.33;
  const converter = Object.keys(d.inputs).length > 0 || !!d.recipes?.some((r) => Object.keys(r.inputs).length > 0);
  if (converter && hasCharter(s, 'learning2')) f *= 1.1;
  if ((id === 'cider' || id === 'wine') && hasCharter(s, 'orchard3a')) f *= 1.5;
  if (id === 'ale' && hasCharter(s, 'farm3b')) f *= 1.5;
  if (id === 'cheese' && hasCharter(s, 'herd3b')) f *= 1.5;
  if (id === 'weapons' && hasCharter(s, 'metal3b')) f *= 1.5;
  return f;
}

/** Whether a workplace has room for the whole of an output: in its yard if hauled, else in the stores. */
function canHold(s: GameState, b: Building, out: Cost): boolean {
  const bonus = b.trade ? HOME_TRADE_BONUS : 1;
  let n = 0;
  for (const k in out) {
    const id = k as ResourceId;
    const m = (out[id] ?? 0) * bonus * charterBonus(s, b, id);
    if (!b.hauled && roomFor(s, id) < m) return false;
    n += m;
  }
  return !b.hauled || yardTotal(b) + n <= YARD_STORE;
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
  if (!canHold(s, b, out)) return false;
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
  if (!outs.length || isMarket(b)) return false;
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

/** The herd quickest to walk to that has game to hunt (or, with `any`, even one hunted out), within reach. */
export function nearestHerd(s: GameState, b: Building, any = false): Herd | null {
  const f = walkFrom(s, b);
  let best: Herd | null = null;
  let bd = Infinity;
  for (const h of s.herds ?? []) {
    if (h.n < 1 && !any) continue;
    const d = walkToPoint(f, s, h.x, h.y, 2);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/** The shoal quickest to walk to (from the nearest bank) that has fish, within reach. */
export function nearestShoal(s: GameState, b: Building, any = false): Shoal | null {
  const f = walkFrom(s, b);
  let best: Shoal | null = null;
  let bd = Infinity;
  for (const h of s.shoals ?? []) {
    if (h.n < 1 && !any) continue;
    const d = walkToPoint(f, s, h.x, h.y, 4);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/**
 * Each month the game recovers where the woods are quiet. Herds whose woods
 * are cleared or crowded by the town move off to better cover, or dwindle
 * if there is none; fish shoals refill, slowly in winter.
 */
export function natureMonthly(s: GameState, rng: StateRng): void {
  const winter = seasonOf(s.day) === 3;
  const cover = (x: number, y: number) => countInRadius(s, { x, y }, 4, (i) => s.trees[i] > 0);
  const crowd = (x: number, y: number) => countInRadius(s, { x, y }, 4, (i) => s.occ[i] >= 0 || s.road[i] > 0);
  for (const h of s.herds ?? []) {
    const need = h.kind === 'deer' ? 18 : 6;
    const here = cover(h.x, h.y) - crowd(h.x, h.y) * 3;
    if (here < need) {
      // Look for better cover nearby.
      let best: { x: number; y: number; v: number } | null = null;
      for (let k = 0; k < 30; k++) {
        const x = Math.floor(h.x + (rng.next() * 2 - 1) * 14);
        const y = Math.floor(h.y + (rng.next() * 2 - 1) * 14);
        if (!inBounds(s, x, y) || s.terrain[idx(s, x, y)]) continue;
        const v = cover(x, y) - crowd(x, y) * 3;
        if (v >= need && (!best || v > best.v)) best = { x, y, v };
      }
      if (best) {
        h.x = best.x + 0.5;
        h.y = best.y + 0.5;
      } else {
        h.n = Math.max(0, h.n - 1);
      }
      continue;
    }
    if (!winter) h.n = Math.min(h.max, h.n + (h.kind === 'deer' ? 1 : 2));
  }
  // A shoal comes back slowly: a catch a month, half that in winter.
  for (const sh of s.shoals ?? []) sh.n = Math.min(sh.max, sh.n + (winter ? 0.5 : 1));
  // Mushrooms come up in late summer and autumn, a few in spring.
  const m = monthOf(s.day);
  if (s.mushroomsMax && (m >= 5 && m <= 8 || m === 2)) {
    s.mushrooms ??= {};
    for (const k in s.mushroomsMax) {
      const i = Number(k);
      if (!s.trees[i]) {
        delete s.mushroomsMax[k];
        delete s.mushrooms[k];
        continue;
      }
      s.mushrooms[k] = Math.min(s.mushroomsMax[k], (s.mushrooms[k] ?? 0) + 1);
    }
  }
}

/** One production cycle of a workplace, outside the daily round (for tests and tools). */
export function produceOnce(s: GameState, b: Building): string | null {
  return produce(s, b, new StateRng(s));
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
      if (!canHold(s, b, r.outputs)) return 'Storage full';
      // The quickest trees to walk to (not the nearest as the crow flies).
      const t = nearestTile(s, b, (i) => s.trees[i] > 0 && !inGrove(s, i));
      if (t < 0) return s.groves?.length && nearestTile(s, b, (i) => s.trees[i] > 0) >= 0 ? 'Only protected woods within reach' : 'No trees within reach';
      b.resDist = walkFrom(s, b).cost[t];
      s.trees[t]--;
      if (s.trees[t] === 0) (s.stumps ??= {})[t] = s.day;
      addOutput(s, b, r.outputs);
      return null;
    }
    case 'forester': {
      // Plant on open ground about the lodge, wherever there is room.
      const c = bCenter(b);
      const spots: number[] = [];
      forTilesInRadius(s, c, d.radius, (i) => {
        if (s.terrain[i] || s.occ[i] >= 0 || s.road[i] || s.rock[i] || s.ore[i] || s.berriesMax[i] || s.trees[i] >= 4) return;
        spots.push(i);
      });
      if (!spots.length) return 'The woods are full';
      const i = spots[Math.floor(rng.next() * spots.length)];
      s.trees[i]++;
      b.output++;
      return null;
    }
    case 'quarry':
    case 'mine': {
      const arr = b.type === 'quarry' ? s.rock : s.ore;
      if (!canHold(s, b, d.outputs)) return 'Storage full';
      const t = nearestTile(s, b, (i) => arr[i] > 0);
      if (t < 0) return b.type === 'quarry' ? 'No rock within reach' : 'No ore within reach';
      b.resDist = walkFrom(s, b).cost[t];
      // Deep shafts never exhaust a vein.
      if (!(b.type === 'mine' && hasCharter(s, 'metal2'))) arr[t]--;
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
      if (!canHold(s, b, r.outputs)) return 'Storage full';
      const f = walkFrom(s, b);
      if (r.id === 'berries') {
        const t = nearestTile(s, b, (i) => s.berries[i] > 0);
        if (t < 0) return nearestTile(s, b, (i) => s.berriesMax[i] > 0) >= 0 ? 'Bushes picked clean for now' : 'No berry bushes within reach';
        b.resDist = f.cost[t];
        s.berries[t]--;
      } else if (r.id === 'mushrooms') {
        // Mushrooms come up in rings in the old woods, and are picked out.
        const m = s.mushrooms ?? {};
        const t = nearestTile(s, b, (i) => (m[i] ?? 0) > 0);
        if (t < 0) return nearestTile(s, b, (i) => (s.mushroomsMax?.[i] ?? 0) > 0) >= 0 ? 'Mushrooms picked out for now' : 'No mushrooms within reach';
        b.resDist = f.cost[t];
        m[t]--;
      } else {
        // Herbs grow in the woods.
        const t = nearestTile(s, b, (i) => s.trees[i] > 0);
        if (t < 0) return 'No woods within reach for herbs';
        b.resDist = f.cost[t];
      }
      addOutput(s, b, r.outputs);
      return null;
    }
    case 'hunter': {
      const h = nearestHerd(s, b);
      if (!h) return nearestHerd(s, b, true) ? 'The game nearby has been hunted out for now' : 'No game within reach';
      // A deer feeds four outings' worth of meat; a rabbit, two.
      const meat = { meat: h.kind === 'deer' ? 5 : 3 };
      if (!canHold(s, b, meat)) return 'Storage full';
      b.resDist = walkToPoint(walkFrom(s, b), s, h.x, h.y, 2);
      h.n -= h.kind === 'deer' ? 0.25 : 0.5;
      addOutput(s, b, meat);
      // Deer bring a hide worth tanning now and then.
      if (h.kind === 'deer' && rng.next() < 0.5) produced(s, 'hides', 1);
      return null;
    }
    case 'claypit': {
      const water = countInRadius(s, bCenter(b), d.radius, (i) => s.terrain[i] === 1);
      if (water < 2) return 'No riverbank nearby';
      const amount = Math.max(1, Math.round((d.outputs.clay ?? 0) * Math.min(1, water / 10) * (season === 3 ? 0.4 : 1)));
      if (!canHold(s, b, { clay: amount })) return 'Storage full';
      addOutput(s, b, { clay: amount });
      return null;
    }
    case 'fisher': {
      const sh = nearestShoal(s, b);
      if (!sh) return nearestShoal(s, b, true) ? 'The fish are fished out for now' : 'No fish within reach';
      const fish = { fish: Math.max(1, Math.round((d.outputs.fish ?? 0) * (season === 3 ? 0.5 : 1))) };
      if (!canHold(s, b, fish)) return 'Storage full';
      b.resDist = walkToPoint(walkFrom(s, b), s, sh.x, sh.y, 4);
      sh.n -= 0.5;
      addOutput(s, b, fish);
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

const CROP_GOOD: Record<string, ResourceId> = { wheat: 'grain', barley: 'barley', flax: 'flax' };
const CROP_FACTOR: Record<string, number> = { wheat: 1, barley: 1, flax: 0.5 };

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
  let siloCrop = 0;
  for (const f of s.buildings) {
    if (f.type !== 'field' || f.growth <= 0) continue;
    // Fields without a farmstead rot unharvested.
    const owner = s.buildings.find((o) => o.id === f.owner && o.build >= 1);
    if (!owner) continue;
    farms.add(owner);
    const good = CROP_GOOD[cropOf(f)];
    const kind = RESOURCE_STORAGE[good];
    if (kind) expected[kind] = (expected[kind] ?? 0) + fieldYield(s, f, 1);
    if (SILO_GOODS.includes(good)) siloCrop += fieldYield(s, f, 1);
  }
  // Each farm's barn takes only its own harvest; share the space across stores by size.
  let barns = 0;
  for (const b of farms) barns += FARM_BARN - barnTotal(b);
  const all = Object.values(expected).reduce((a, n) => a + (n ?? 0), 0) || 1;
  return (Object.keys(expected) as StorageKind[]).map((kind) => ({
    kind,
    expected: expected[kind]!,
    // Silos take the wheat and barley, as far as their room goes.
    room: Math.max(0, storageCap(s, kind) - stored(s, kind)) + Math.floor((barns * expected[kind]!) / all) + (kind === 'food' ? Math.min(siloCrop, siloCap(s) - siloHeld(s)) : 0),
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
    const grow = b.workers > 0 ? (b.workers * (hasCharter(s, 'farm2') ? 1.5 : 1) * wornYield(b)) / (area * TEND_PER_TILE) : 0;
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
  } else if (month === 7 && fields.some((f) => f.growth > 0)) {
    // The harvest comes in on the farm's first working day of the month (a
    // farm paused on the first day harvests when it resumes); without
    // farmers the crop waits in the fields until the month's last day.
    if (crew <= 0 && s.day % DAYS_PER_MONTH < DAYS_PER_MONTH - 1) {
      b.status = 'The harvest waits for farmers';
      // Not blocked: it must keep its place when villagers are given their work.
      b.blocked = 0;
      return;
    }
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
    // The toast points at the first farm whose crop spoiled.
    if (spoiled && !harvestDay.spoiled) harvestDay.at = b;
    harvestDay.spoiled += spoiled;
    for (const w of spoiledIn) harvestDay.where.add(w);
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
export type AnimalKind = 'sheep' | 'cattle' | 'pigs';
export const ANIMAL_KINDS: AnimalKind[] = ['sheep', 'cattle', 'pigs'];

/** Each animal: pasture it needs, its price at the trading post, and what slaughtering one gives. */
export const HERDS: Record<AnimalKind, { tiles: number; price: number; name: string; plural: string; meat: Cost }> = {
  sheep: { tiles: 2, price: 20, name: 'sheep', plural: 'sheep', meat: { meat: 2, hides: 1 } },
  cattle: { tiles: 4, price: 45, name: 'cow', plural: 'cattle', meat: { meat: 5, hides: 1 } },
  pigs: { tiles: 3, price: 25, name: 'pig', plural: 'pigs', meat: { pork: 4, hides: 1 } },
};

/** The animals an animal farm keeps, by kind (older saves kept one kind). */
export function animalsOf(b: Building): Partial<Record<AnimalKind, number>> {
  if (!b.animals && b.herd) b.animals = { [(b.herdKind as AnimalKind) ?? 'sheep']: b.herd };
  return b.animals ?? {};
}

export function herdTotal(b: Building): number {
  let n = 0;
  for (const k of ANIMAL_KINDS) n += animalsOf(b)[k] ?? 0;
  return n;
}

/** Pasture an animal farm's fences hold, and how much its animals take. */
export function herdRoom(s: GameState, b: Building): { used: number; room: number } {
  const mult = (hasCharter(s, 'herd2') ? 1.5 : 1) * (onPath(s, 'farm') ? 0.8 : 1);
  let used = 0;
  for (const k of ANIMAL_KINDS) used += (animalsOf(b)[k] ?? 0) * HERDS[k].tiles;
  return { used, room: Math.floor(zoneArea(zonesOf(s, b)) * mult) };
}

/** Takes animals away (lost to sickness, wolves or a shrinking pasture), the commonest first. */
function removeAnimals(b: Building, n: number): void {
  const a = animalsOf(b);
  for (let k = 0; k < n; k++) {
    const kind = ANIMAL_KINDS.filter((x) => (a[x] ?? 0) > 0).sort((p, q) => (a[q] ?? 0) - (a[p] ?? 0))[0];
    if (!kind) break;
    a[kind] = (a[kind] ?? 0) - 1;
  }
}

/** Why an animal cannot be bought for a farm now, or null. */
export function buyAnimalError(s: GameState, b: Building, kind: AnimalKind): string | null {
  if (b.type !== 'byre' || b.build < 1) return 'Only an animal farm keeps animals';
  if (!hasTrade(s)) return 'Animals are bought at a trading post or dock';
  const r = herdRoom(s, b);
  if (r.used + HERDS[kind].tiles > r.room) return 'No room on the pastures: fence more';
  if (s.res.gold < HERDS[kind].price) return `Needs ${HERDS[kind].price} coins`;
  return null;
}

/** Buys one animal from the drovers at the trading post. */
export function buyAnimal(s: GameState, b: Building, kind: AnimalKind): string | null {
  const err = buyAnimalError(s, b, kind);
  if (err) return err;
  s.res.gold -= HERDS[kind].price;
  const a = animalsOf(b);
  a[kind] = (a[kind] ?? 0) + 1;
  b.animals = a;
  b.herd = herdTotal(b);
  return null;
}

/** Slaughters one animal for its meat and hide (there is no breeding: buy another to replace it). */
export function slaughterAnimal(s: GameState, b: Building, kind: AnimalKind): string | null {
  const a = animalsOf(b);
  if (!(a[kind] ?? 0)) return `No ${HERDS[kind].plural} to slaughter`;
  const meat = (hasCharter(s, 'herd1') ? 1.3 : 1) * (hasCharter(s, 'herd3a') ? 1.5 : 1);
  // Not while the meat would have nowhere to go.
  for (const k in HERDS[kind].meat) {
    const id = k as ResourceId;
    const n = HERDS[kind].meat[id] ?? 0;
    if (id !== 'hides' && roomFor(s, id) < Math.round(n * meat)) return `No room in the granaries for the ${GOODS[id].name.toLowerCase()}`;
  }
  a[kind] = (a[kind] ?? 0) - 1;
  b.herd = herdTotal(b);
  for (const k in HERDS[kind].meat) {
    const id = k as ResourceId;
    const n = HERDS[kind].meat[id] ?? 0;
    b.output += produced(s, id, id === 'hides' ? n : Math.round(n * meat));
  }
  return null;
}

function stepByre(s: GameState, b: Building): void {
  // Animals lost to an event (which lower the herd's count) leave the pastures.
  const total = herdTotal(b);
  if (b.herd !== undefined && b.herd < total) removeAnimals(b, total - b.herd);
  // Pastures shrank below the herd: the surplus is sold back to the drovers.
  const room = herdRoom(s, b);
  if (room.used > room.room) {
    let over = room.used - room.room;
    const a = animalsOf(b);
    for (const k of [...ANIMAL_KINDS].reverse()) {
      while (over > 0 && (a[k] ?? 0) > 0) {
        a[k] = (a[k] ?? 0) - 1;
        over -= HERDS[k].tiles;
        s.res.gold += Math.floor(HERDS[k].price / 2);
      }
    }
  }
  b.herd = herdTotal(b);
  const pastures = zonesOf(s, b);
  const winter = seasonOf(s.day) === 3;
  const a = animalsOf(b);
  const list = ANIMAL_KINDS.filter((k) => (a[k] ?? 0) > 0)
    .map((k) => `${a[k]} ${a[k] === 1 ? HERDS[k].name : HERDS[k].plural}`)
    .join(', ');
  for (const z of pastures) z.status = !b.herd ? 'Empty: buy animals at the trading post' : winter ? `${list} sheltering in the byre` : `${list} grazing`;
  b.blocked = 0;
  if (!pastures.length) {
    b.status = 'Fence pastures nearby for the animals';
    b.blocked = BLOCK_PROBLEM;
    return;
  }
  if (!b.herd) {
    b.status = 'No animals yet: buy them at the trading post';
    return;
  }
  if (b.workers === 0) {
    b.status = 'No herders';
    return;
  }
  const month = monthOf(s.day);
  const crew = b.workers / workersOf(b);
  const cows = a.cattle ?? 0;
  if (cows > 0 && month >= 1 && month <= 8) {
    b.work += cows * 0.12 * crew * (hasCharter(s, 'herd1') ? 1.3 : 1);
    const n = Math.floor(b.work);
    if (n > 0) {
      b.work -= n;
      b.output += produced(s, 'milk', n);
    }
    b.status = `Milking ${cows} ${cows === 1 ? 'cow' : 'cattle'}, herding ${list}`;
  } else {
    b.status = `Herding ${list}`;
  }
}

/** Spring shearing: each sheep gives two fleeces of wool. */
function monthlyHerds(s: GameState, month: number): void {
  if (month !== 1) return;
  for (const b of s.buildings) {
    if (b.type !== 'byre' || b.build < 1 || !b.workers) continue;
    const sheep = animalsOf(b).sheep ?? 0;
    if (!sheep) continue;
    const n = produced(s, 'wool', Math.round(sheep * 2 * (hasCharter(s, 'herd1') ? 1.3 : 1)));
    b.output += n;
    if (n) log(s, `Shearing time: ${n} wool from the flock.`, 'info', b);
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
  let pick = (b.workers * PICK_PER_DAY * (b.efficiency ?? 1) * wornYield(b)) / (onPath(s, 'orchard') ? 1.33 : 1);
  let full = false;
  for (const o of orchards) {
    if (pick <= 0) break;
    const good = (o.recipe ?? 'apples') as ResourceId;
    // Only what the stores have room for is picked: the rest stays on the trees.
    const n = Math.min(Math.floor(o.growth), Math.ceil(pick), Math.floor(roomFor(s, good)));
    if (n <= 0) {
      if (o.growth >= 1) full = true;
      continue;
    }
    const k = produced(s, good, n);
    o.growth -= k;
    o.lastOutput += k;
    b.output += k;
    pick -= n;
  }
  if (full && pick > 0) {
    b.status = `Storage full: fruit waits on the trees (${Math.floor(hanging)})`;
    b.blocked = BLOCK_SEASONAL;
    return;
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
  veg: { name: 'Vegetable patch', cost: { wood: 4, gold: 8 }, desc: 'Cabbages, leeks and turnips: 3 vegetables a month from early summer to late autumn.', tier: 0 },
  hens: { name: 'Hen coop', cost: { wood: 8, gold: 15 }, desc: 'A few hens: 3 eggs a month, 1 in winter.', tier: 0 },
  bees: { name: 'Beehives', cost: { wood: 6, gold: 25 }, desc: 'Straw skeps: about 8 honey each late summer.', tier: 1 },
};

// ---------------------------------------------------------------- draught animals

/** Stalls in each draught stable. */
export const STABLE_STALLS = 4;
export type Draught = 'horse' | 'ox';
/** What the drovers ask for a horse and an ox. */
export const DRAUGHT_PRICE: Record<Draught, number> = { horse: 60, ox: 45 };
/** A pack horse lets a trading post's carts carry half as much again. */
export const HORSE_TRADE = 1.5;
/** A builder's yard with its ox: sites within reach are supplied and raised half as fast again. */
export const YARD_BOOST = 1.5;
/** Days of carting before the ox cart has worn through a wood part. */
export const YARD_WEAR_DAYS = 30;

/** The draught animal a building can keep, if any. */
export function draughtOf(b: Building): Draught | null {
  return b.type === 'tradingpost' ? 'horse' : b.type === 'builderyard' ? 'ox' : null;
}

/** Stalls in the town's draught stables, and how many are taken. */
export function stalls(s: GameState): { room: number; used: number } {
  let room = 0;
  let used = 0;
  for (const b of s.buildings) {
    if (b.type === 'draughtstable' && b.build >= 1) room += STABLE_STALLS;
    if (b.beast) used++;
  }
  return { room, used };
}

export function buyDraughtError(s: GameState, b: Building): string | null {
  const kind = draughtOf(b);
  if (!kind || b.build < 1) return 'Nothing here needs a draught animal';
  if (b.beast) return `It has its ${kind}`;
  if (!hasTrade(s)) return 'Animals are bought at a trading post or dock';
  const st = stalls(s);
  if (!st.room) return 'Build a Draught Stable to keep it';
  if (st.used >= st.room) return 'Every stall is taken: build another Draught Stable';
  if (s.res.gold < DRAUGHT_PRICE[kind]) return `Needs ${DRAUGHT_PRICE[kind]} coins`;
  return null;
}

/** Buys the building its horse or ox from the drovers; it lives in a draught stable. */
export function buyDraught(s: GameState, b: Building): string | null {
  const err = buyDraughtError(s, b);
  if (err) return err;
  s.res.gold -= DRAUGHT_PRICE[draughtOf(b)!];
  b.beast = true;
  b.hungry = undefined;
  return null;
}

/** Sells the animal back to the drovers for half what it cost. */
export function sellDraught(s: GameState, b: Building): void {
  const kind = draughtOf(b);
  if (!b.beast || !kind) return;
  b.beast = undefined;
  b.hungry = undefined;
  s.res.gold += Math.floor(DRAUGHT_PRICE[kind] / 2);
}

/** Whether a building's draught animal is fit to work: bought and fed. */
export function beastWorks(b: Building): boolean {
  return !!b.beast && !b.hungry;
}

/** The working builder's yard (staffed, its ox fed, wood parts in store) that reaches a site, if any. */
export function yardFor(s: GameState, site: Building): Building | null {
  if (s.res.woodparts < 1) return null;
  const c = bCenter(site);
  for (const y of s.buildings) {
    if (y.type !== 'builderyard' || y.build < 1 || y.workers <= 0 || !beastWorks(y) || y === site) continue;
    const yc = bCenter(y);
    if (Math.hypot(yc.x - c.x, yc.y - c.y) <= BUILDINGS.builderyard.radius) return y;
  }
  return null;
}

/** A day's carting wears the ox cart a little; every so often a wood part is used up. */
function wearCart(s: GameState, y: Building): void {
  if (y.carted === s.day) return;
  y.carted = s.day;
  y.wear = (y.wear ?? 0) + 1;
  if (y.wear >= YARD_WEAR_DAYS && s.res.woodparts >= 1) {
    y.wear -= YARD_WEAR_DAYS;
    s.res.woodparts -= 1;
  }
}

/** Each month the draught animals eat a measure of grain each; with none they rest. Animals without a stall are sold. */
function monthlyDraught(s: GameState): void {
  const st = stalls(s);
  let over = Math.max(0, st.used - st.room);
  for (const b of s.buildings) {
    if (!b.beast) continue;
    if (over > 0) {
      over--;
      const kind = draughtOf(b) ?? 'horse';
      sellDraught(s, b);
      log(s, `With no stall to keep it, the ${kind} of the ${BUILDINGS[b.type].name} was sold to the drovers.`, 'bad', b);
      continue;
    }
    if (s.res.grain >= 1) {
      s.res.grain -= 1;
      if (b.hungry) b.hungry = undefined;
    } else if (!b.hungry) {
      b.hungry = true;
      log(s, `No grain for the ${draughtOf(b)} of the ${BUILDINGS[b.type].name}: it will not work this month.`, 'bad', b);
    }
  }
}

/** Flower boxes by a home's door: a few coins, and the home is a little lovelier. */
export const FLOWERS_COST: Cost = { gold: 6 };
export const FLOWERS_BEAUTY = 1;

export function setFlowers(s: GameState, b: Building, on: boolean): string | null {
  if (b.type !== 'house' || b.build < 1) return 'Only homes have flower boxes';
  if (!!b.flowers === on) return null;
  if (on) {
    if (!canAfford(s, FLOWERS_COST)) return 'Cannot afford it';
    pay(s, FLOWERS_COST);
  }
  b.flowers = on || undefined;
  s.dirty = true;
  return null;
}

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
    case 'stable':
      return "The groom keeps the lord's horse saddled";
    case 'well':
    case 'garden':
    case 'maypole':
    case 'statue':
    case 'belltower':
    case 'manorgarden':
    case 'publicgarden':
    case 'hedge':
    case 'flowerbed':
    case 'shrine':
    case 'fountain':
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
    case 'builderyard': {
      if (!b.beast) return "Needs an ox: buy one here once a Draught Stable has a stall";
      if (b.hungry) return 'The ox is hungry: no grain in store';
      if (s.res.woodparts < 1) return 'Waiting for wood parts to mend the cart';
      const sites = constructionSites(s).filter((o) => yardFor(s, o) === b).length;
      return sites ? `Carting for ${sites} building site${sites > 1 ? 's' : ''}` : 'No building sites within reach';
    }
    case 'draughtstable': {
      const st = stalls(s);
      return `${st.used} of ${st.room} stalls taken in the town`;
    }
    case 'storehouse':
      return `Materials in store: ${Math.floor(stored(s, 'materials'))} / ${storageCap(s, 'materials')}`;
    case 'granary':
      return `Food in store: ${Math.floor(stored(s, 'food'))} / ${storageCap(s, 'food')}`;
    case 'silo':
      return `Grain in the silos: ${Math.floor(siloHeld(s))} / ${siloCap(s)}`;
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
  // resDist is the walking time to the resource, in dirt-road tiles.
  const toResource = d.gathers && b.type !== 'claypit' ? (2 * (b.resDist ?? (d.radius / 2) * (ROAD_TILES_PER_DAY / OFFROAD_TILES_PER_DAY))) / ROAD_TILES_PER_DAY : 0;
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
    if (isMarket(b)) b.status = b.workers > 0 ? `${b.workers} stall${b.workers > 1 ? 's' : ''} open` : 'No vendors: the stalls are shut';
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
      // A workshop waiting for its inputs looks in the stores every day: as
      // soon as they are there again it is back on the job list.
      if (isBlocked(b) && b.status.startsWith('Waiting for') && inputsReady(s, b)) {
        b.blocked = 0;
        b.lack = undefined;
        b.short = 0;
        b.status = 'Back to work';
        continue;
      }
      // Otherwise keep a blocked status so the job queue does not flip-flop daily;
      // blocked buildings are retried at the start of each month.
      if (!isBlocked(b)) b.status = 'No workers available';
      continue;
    }
    b.hauled = servedByHaulers(s, b);
    b.efficiency = workEfficiency(b);
    // Time spent on the household's errands is time not spent at work.
    b.work += ((b.workers / d.workers) * b.efficiency * moodYield(s) * learningYield(s) * (1 - (s.report.errands ?? 0)) * wornYield(b)) / d.cycle;
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
      // A day or two without inputs is no shortage: the workers wait for the
      // next load rather than leave, and only a lasting want is flagged.
      if (status?.startsWith('Waiting for')) {
        b.short = (b.short ?? 0) + 1;
        if (b.short < SHORT_DAYS) {
          b.blocked = 0;
          b.lack = undefined;
          status = 'Waiting for the next load';
        }
      } else b.short = 0;
      if (status === 'Storage full' && b.hauled && yardTotal(b) > 0) status = 'Full';
    }
    if (status || !b.blocked) b.status = status ?? 'Working';
  }
}

/** Days a workshop waits for its inputs before it counts as short of them. */
const SHORT_DAYS = 3;

/** Whether a workshop's inputs (for its current product) are in store, above the firewood reserve. */
export function inputsReady(s: GameState, b: Building): boolean {
  const d = workDef(b);
  const inputs = d.recipes ? chooseRecipe(s, b)?.inputs : d.inputs;
  if (!inputs) return false;
  if ((inputs.wood ?? 0) > 0 && s.res.wood - (inputs.wood ?? 0) < WOOD_RESERVE) return false;
  return canAfford(s, inputs);
}

// ---------------------------------------------------------------- construction

/** Most builders that work one site at once. */
export const MAX_BUILDERS = 4;
/**
 * What a builder carries to a site in one trip, and the time a trip takes
 * beyond the walk (loading, stacking): materials leave storage a load at a
 * time as they are fetched, over a few days, not all at once.
 */
export const BUILD_LOAD = 3;
export const BUILD_TRIP_DAYS = 0.4;
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
      const yard = yardFor(s, b);
      if (yard) wearCart(s, yard);
      const carry = ((n * BUILD_LOAD) / ((b.trip ?? 0) + BUILD_TRIP_DAYS)) * (yard ? YARD_BOOST : 1);
      let pool = (renovating ? (b.carry ?? 0) : b.work) + carry;
      let missing = '';
      // With no timber in store, a woodcutter's lodge is raised from trees
      // felled on the spot, so a town can never be stuck without one.
      if (b.type === 'woodcutter' && !renovating && (b.need!.wood ?? 0) > 0 && s.res.wood < 1) {
        const got = Math.min(b.need!.wood ?? 0, fellNear(s, b, Math.min(n * 2, b.need!.wood ?? 0)));
        if (got > 0) {
          b.need!.wood = (b.need!.wood ?? 0) - got;
          // Felled here, not taken from the stores: cancelling the site gives none of it back.
          b.felled = (b.felled ?? 0) + got;
          setStatus('Felling timber on the spot');
          continue;
        }
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
      pool = Math.min(pool, n * BUILD_LOAD);
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
    const yard = yardFor(s, b);
    if (yard) wearCart(s, yard);
    const boost = yard ? YARD_BOOST : 1;
    if (renovating) {
      b.upNote = `Building (${n} builder${n > 1 ? 's' : ''})`;
      b.upProgress = Math.min(1, (b.upProgress ?? 0) + (n * LABOUR_PER_BUILDER * boost) / upgradeDays(b));
      if (b.upProgress >= 1) {
        b.carry = 0;
        finishUpgrade(s, b);
      }
      continue;
    }
    b.build = Math.min(1, b.build + (n * LABOUR_PER_BUILDER * boost) / d.buildDays);
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
const POTTAGE: ResourceId[] = ['grain'];
export const POTTAGE_FOOD = 0.5;

/**
 * Errands each household runs a month: to market for food and goods, to the
 * well for water, to church and to the tavern. Each is a walk there and back,
 * so homes far from them lose working time; the share is taken off every
 * villager's work.
 */
export const ERRANDS: { type: BuildingType; trips: number; fallback?: number }[] = [
  { type: 'market', trips: 3, fallback: 16 },
  { type: 'well', trips: 4, fallback: 10 },
  { type: 'church', trips: 1 },
  { type: 'tavern', trips: 2 },
];
const MAX_ERRANDS = 0.35;

export function errandShare(s: GameState): number {
  let days = 0;
  let people = 0;
  const near = (h: Building, t: BuildingType) => {
    const c = bCenter(h);
    let best = Infinity;
    for (const o of s.buildings) {
      if ((o.type !== t && !(t === 'church' && o.type === 'cathedral')) || o.build < 1) continue;
      const oc = bCenter(o);
      best = Math.min(best, Math.hypot(oc.x - c.x, oc.y - c.y));
    }
    return best;
  };
  for (const h of s.buildings) {
    if (h.residents <= 0 || !housingOf(h)) continue;
    people += h.residents;
    for (const e of ERRANDS) {
      let d = near(h, e.type);
      if (!Number.isFinite(d)) {
        if (e.fallback === undefined) continue;
        // No well: water from the river or a spring further off.
        d = e.fallback;
      }
      days += (e.trips * 2 * d) / ROAD_TILES_PER_DAY;
    }
  }
  if (!people) return 0;
  return Math.min(MAX_ERRANDS, days / (people * DAYS_PER_MONTH));
}

/** A new town's first months, when villagers make do with what the cart brought. */
export const MARKET_GRACE_DAYS = DAYS_PER_MONTH * 2;

/** Households one staffed market stall can serve. */
export const HOMES_PER_STALL = 10;

let servedCache: { key: string; set: Set<number> } = { key: '', set: new Set() };

/**
 * The homes the markets serve. A market has no reach: anyone may walk to it,
 * but each staffed stall can serve only so many households, and the homes
 * nearest a market come first.
 */
export function marketServed(s: GameState): Set<number> {
  const markets = s.buildings.filter((m) => isMarket(m) && m.build >= 1 && m.workers > 0);
  let stalls = 0;
  for (const m of markets) stalls += Math.min(m.workers, marketStalls(m));
  const key = `${s.day}:${s.buildings.length}:${s.nextId}:${stalls}:${s.population}`;
  if (servedCache.key === key) return servedCache.set;
  const set = new Set<number>();
  if (stalls) {
    // Homes only: the manor and the camp do not shop at the market.
    const homes = s.buildings
      .filter((h) => h.type === 'house' && h.residents > 0)
      .map((h) => {
        const c = bCenter(h);
        let d = Infinity;
        for (const m of markets) d = Math.min(d, Math.hypot(bCenter(m).x - c.x, bCenter(m).y - c.y));
        return { h, d };
      })
      .sort((a, b) => a.d - b.d);
    for (const { h } of homes.slice(0, stalls * HOMES_PER_STALL)) set.add(h.id);
  }
  servedCache = { key, set };
  return set;
}

/** Villagers the markets serve (everyone in a new town's first months). */
export function marketReach(s: GameState): number {
  if (s.day <= MARKET_GRACE_DAYS) return s.population;
  let n = 0;
  for (const b of s.buildings) if (b.residents > 0 && coveredBy(s, b, 'market')) n += b.residents;
  return Math.min(s.population, n);
}

export function eatFood(s: GameState, mouths: number): { hungry: number; groups: number; pottage: number } {
  let need = mouths;
  const groups = new Set<string>();
  // A taste of every kind of food in the stores first, so a varied larder is eaten as one.
  const firstOfGroup = new Map<string, ResourceId>();
  for (const f of FOOD_IDS) {
    const g = GOODS[f].foodGroup ?? f;
    if (!firstOfGroup.has(g) && s.res[f] >= 1) firstOfGroup.set(g, f);
  }
  for (const [g, f] of firstOfGroup) {
    if (need <= 0.001) break;
    s.res[f] -= 1;
    need -= GOODS[f].food ?? 1;
    groups.add(g);
  }
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
  natureMonthly(s, rng);
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
  // take a little of every food in turn; richer foods go further. Food comes
  // from the town's stores; a market is where households buy their goods, so
  // homes it cannot serve go without those, not without food.
  const reach = marketReach(s);
  const eaten = eatFood(s, s.population);
  const unserved = s.population - reach;
  report.eaten = s.population - eaten.hungry;
  report.shortage = eaten.hungry;
  report.unserved = unserved;
  report.variety = eaten.groups;
  report.pottage = eaten.pottage;
  report.errands = errandShare(s);
  const need = report.shortage;
  if (need > 0) log(s, `Food shortage! ${need} villagers went hungry.`, 'bad');
  if (s.year) s.year.hungry = (s.year.hungry ?? 0) + need;

  // Heating in winter: each household burns a bundle of split firewood, or
  // twice as much raw timber (two bundles in hardy winters).
  report.cold = false;
  report.coldShare = 0;
  if (Math.floor(prevMonth / 3) === 3) {
    let homes = s.buildings.filter((b) => b.residents > 0).length * winterBundles(s);
    const split = Math.min(homes, Math.floor(s.res.firewood));
    s.res.firewood -= split;
    homes -= split;
    const logs = Math.min(homes, Math.floor(s.res.wood / 2));
    s.res.wood -= logs * 2;
    homes -= logs;
    // Some hearths stay cold: the town counts as cold when more than a few do.
    const all = s.buildings.filter((b) => b.residents > 0).length * winterBundles(s);
    report.coldShare = all ? homes / all : 0;
    if (homes > 0 && report.coldShare > 0.15) {
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
  monthlyDraught(s);
  const merchants = runTradeOrders(s);
  report.trade = merchants.earned;
  report.imports = merchants.spent;

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
    else if (b.type === 'church') n += b.level >= 2 ? 1 : 0.5;
    else if (b.type === 'cathedral') n += 6;
    else if (b.type === 'wall') walls++;
    else if (b.type === 'statue') n += 1;
    else if (b.type === 'belltower') n += 2;
    else if (b.type === 'manorgarden') n += 4;
    else if (b.type === 'watchtower') n += 0.5;
    else if (b.type === 'stable') n += 0.5;
    else if (b.type === 'university') n += s.universityOk ? (hasCharter(s, 'learning3a') ? 6 : 4) : 0;
    else if (b.type === 'publicgarden') n += 0.5;
    else if (b.type === 'guildhall') n += 4;
    else if (b.type === 'maypole') n += 0.5;
    else if (b.type === 'house' && b.level >= 3) n += b.level >= 4 ? 0.5 : 0.2;
    else if (b.type === 'hunter' && hasCharter(s, 'nature3b')) n += 1;
  }
  if (hasCharter(s, 'learning1')) n += 1;
  if (hasCharter(s, 'learning3b')) n += 2;
  if (hasCharter(s, 'nature3a')) n += 1;
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

/**
 * Cheerful villagers work a little harder, glum ones a little slower:
 * from 90% at 20 happiness or less to 110% at 80 or more.
 */
export function moodYield(s: GameState): number {
  const h = Math.max(20, Math.min(80, s.happiness ?? 50));
  return 0.9 + ((h - 20) / 60) * 0.2;
}

/** Open markets and covered market halls both have stalls. */
export function isMarket(b: Building): boolean {
  return b.type === 'market' || b.type === 'markethall';
}

/** Books a university reads each month. */
export const UNIVERSITY_BOOKS = 2;

/** The university's learning: every workplace a little more productive while it is fed books. */
export function learningYield(s: GameState): number {
  return s.universityOk ? (hasCharter(s, 'learning3a') ? 1.1 : 1.05) : 1;
}

/** Whether the lord rides out on horseback: a stable with its groom at work. */
export function lordRides(s: GameState): boolean {
  return s.buildings.some((b) => b.type === 'stable' && b.build >= 1 && b.workers > 0);
}

/** Whether a watchman stands on a watch tower. */
export function watchKept(s: GameState): boolean {
  return s.buildings.some((b) => b.type === 'watchtower' && b.build >= 1 && b.workers > 0);
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
  // The university's masters need books to teach: two a month.
  const uni = s.buildings.some((b) => b.type === 'university' && b.build >= 1 && b.workers > 0);
  const books = hasCharter(s, 'learning3a') ? 1 : UNIVERSITY_BOOKS;
  s.universityOk = uni && s.res.books >= books;
  if (s.universityOk) s.res.books -= books;
  if (hasCharter(s, 'trade3b')) {
    let paved = 0;
    for (let i = 0; i < s.road.length; i++) if (s.road[i] >= 2) paved++;
    s.res.gold += Math.floor(paved / 2);
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
  if (home.flowers) total += FLOWERS_BEAUTY;
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
  if (r.cold) factors.push({ label: 'No firewood', value: -Math.round(20 * Math.min(1, (r.coldShare ?? 1) * 1.5)) });
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
    if (market) factors.push({ label: 'Served by a market', value: Math.round((10 * market) / residents) });
    // Homes the markets cannot serve go without their goods: a slow grumble, not hunger.
    if (s.day > MARKET_GRACE_DAYS && market < residents) factors.push({ label: 'No market to shop at', value: -Math.round((10 * (residents - market)) / residents) });
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
  else if (watchKept(s)) factors.push({ label: 'A watch on the towers', value: 2 });
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
  // Halfway to the target each month, at least a point, and never past it.
  const gap = target - s.happiness;
  s.happiness = Math.round(s.happiness + (gap === 0 ? 0 : Math.sign(gap) * Math.min(Math.abs(gap), Math.max(1, Math.round(Math.abs(gap) / 2)))));
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
  // Hard times are borne for a while: villagers only start to leave after a
  // second month of hunger or deep gloom in a row.
  const hard = s.happiness < 30 || r.shortage > 0;
  s.gloom = hard ? (s.gloom ?? 0) + 1 : 0;
  if (hard && s.gloom >= 2 && s.population > 2 && !s.relaxed) {
    // Half of those who went hungry give up, up to an eighth of the town; a
    // gloomy town loses a few more.
    const hungry = r.shortage > 0 ? Math.min(r.shortage * 0.5, s.population * 0.12) : 0;
    const gloomy = s.happiness < 30 ? s.population * 0.06 : 0;
    const n = Math.max(1, Math.round(Math.max(hungry, gloomy) * (s.hardy ? 1.25 : 1)));
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

/**
 * What a town needs to grow to each size: people, and the places a town of
 * that size would have. Met, the town grows at the start of the next month.
 */
export function rankNeeds(s: GameState, tier: number): Need[] {
  const t = TIERS[tier];
  if (!t) return [];
  const has = (type: BuildingType) =>
    s.buildings.some((b) => (b.type === type || (type === 'church' && b.type === 'cathedral') || (type === 'market' && b.type === 'markethall')) && b.build >= 1);
  const out: Need[] = [{ label: `${t.pop} villagers (${s.population})`, met: s.population >= t.pop }];
  if (tier === 1) {
    out.push({ label: 'A marketplace', met: has('market') });
    out.push({ label: 'A well', met: has('well') });
  }
  if (tier === 2) {
    out.push({ label: 'A tavern', met: has('tavern') });
    out.push({ label: 'A trading post or dock', met: has('tradingpost') || has('dock') });
  }
  if (tier === 3) out.push({ label: 'A church', met: has('church') });
  if (tier === 4) out.push({ label: 'Three town charters', met: (s.charters?.length ?? 0) >= 3 });
  return out;
}

/** The town grows a size once it meets the next one's needs (never shrinks). */
export function updateTier(s: GameState): void {
  while (s.tier < TIERS.length - 1 && rankNeeds(s, s.tier + 1).every((n) => n.met)) {
    s.tier++;
    const t = TIERS[s.tier];
    log(s, `Your settlement is now a ${t.name}! ${t.desc}`, 'good');
  }
}

/** Requirements for the town's next size, for the UI. */
export function nextTierRequirements(s: GameState): string[] {
  if (s.tier >= TIERS.length - 1) return [];
  return rankNeeds(s, s.tier + 1).map((r) => `${r.label}${r.met ? ' ✓' : ''}`);
}

/**
 * The heart of the town that roads and the autoplayer reckon from: the manor
 * once built, else the settlers' camp, else the first home.
 */
export function seatOf(s: GameState): Building | undefined {
  return (
    s.buildings.find((b) => b.type === 'townhall' && b.build >= 1) ??
    s.buildings.find((b) => b.type === 'camp') ??
    s.buildings.find((b) => b.type === 'townhall') ??
    s.buildings.find((b) => b.type === 'house')
  );
}

// ---------------------------------------------------------------- main step

export function stepDay(s: GameState): void {
  const rng = new StateRng(s);
  s.year ??= { pop: s.population, gold: s.res.gold, prestige: s.res.prestige, arrived: 0, left: 0, built: 0, harvest: 0, stock: stockSnapshot(s) };
  recompute(s);
  dailyConstruction(s);
  dailyUpkeep(s);
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
