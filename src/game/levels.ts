import { IMPROVEMENT_BY_ID, has, improvedPlaces } from './improve';
import { BUILDINGS, TIERS } from './data';
import { hasCharter } from './charters';
import {
  coveredBy,
  luxuryCount,
  hasSupply,
  LUXURIES,
  HOME_TRADE_COST,
  HOME_TRADE_DAYS,
  log,
  materialsOf,
  needsMaterials,
  recompute,
} from './sim';
import type { Building, BuildingType, Cost, GameState } from './types';
import { idx, inBounds } from './world';

/**
 * Building levels: houses grow as their needs are met, and the manor grows
 * with the settlement.
 */

export interface HouseLevel {
  name: string;
  housing: number;
  /** Tax multiplier for residents. */
  tax: number;
  cost?: Cost;
  /** Settlement tier needed before upgrading to this level. */
  tier?: number;
}

export const HOUSE_LEVELS: HouseLevel[] = [
  { name: '', housing: 0, tax: 0 },
  { name: 'Cottage', housing: 5, tax: 1 },
  { name: 'Timber House', housing: 7, tax: 1.5, cost: { wood: 2, planks: 4 }, tier: 1 },
  { name: 'Townhouse', housing: 9, tax: 2, cost: { planks: 6, stone: 4, tiles: 10 }, tier: 2 },
  { name: "Merchant's House", housing: 9, tax: 3, cost: { dressedstone: 6, tiles: 10, mortar: 4, glass: 4, gold: 20 }, tier: 3 },
  { name: 'Patrician House', housing: 9, tax: 4, cost: { dressedstone: 6, mortar: 4, glass: 10, stainedglass: 6, gold: 100 }, tier: 4 },
];

export const MANOR_LEVELS: { name: string; cost?: Cost; days?: number }[] = [
  { name: '' },
  { name: 'Manor Hall' },
  { name: 'Manor House', cost: { wood: 4, planks: 10, stone: 10, gold: 12 }, days: 20 },
  { name: 'Stone Manor', cost: { stone: 5, dressedstone: 10, tiles: 10, gold: 40 }, days: 30 },
  { name: 'Palace', cost: { dressedstone: 10, mortar: 6, tools: 4, gold: 60 }, days: 40 },
];

/** A church is raised in timber, rebuilt in stone once a Town, and in dressed stone once a Borough. */
export const CHURCH_LEVELS: { name: string; cost?: Cost; days?: number; tier?: number }[] = [
  { name: '' },
  { name: 'Wooden Church' },
  { name: 'Stone Church', cost: { stone: 8, tiles: 4, tools: 1, gold: 10 }, days: 25, tier: 2 },
  { name: 'Dressed Stone Church', cost: { dressedstone: 8, mortar: 4, glass: 3, tools: 1, gold: 20 }, days: 30, tier: 3 },
];

/** The alehouse, and the tavern it can be enlarged into: a second tapster, and twice the reach. */
export const TAVERN_LEVELS: { name: string; cost?: Cost; days?: number; tier?: number }[] = [
  { name: '' },
  { name: 'Alehouse' },
  { name: 'Tavern', cost: { wood: 5, planks: 4, stone: 3 }, days: 14, tier: 2 },
];

/** How far a service reaches, in tiles: an enlarged tavern twice as far as an alehouse. */
export function reachOf(b: Building): number {
  const r = BUILDINGS[b.type].radius * (has(b, 'pump') ? 1.5 : 1);
  return b.type === 'tavern' && b.level >= 2 ? r * 2 : r;
}

/** The manor level from which the lord may build walls, towers, the garden and the armoury. */
export const STONE_MANOR = 3;
/** The palace: the atelier, the barracks and the tiltyard. */
export const PALACE = 4;

/** The manor's grounds at each level: it needs more room as it grows. */
export const MANOR_SIZE = [0, 3, 3, 4, 4];
/** The town size each manor level waits for. */
export const MANOR_TIER = [0, 0, 1, 2, 3];

/** Whether the ground the manor would grow onto is clear. */
export function roomToGrow(s: GameState, b: Building, size: number): boolean {
  for (let y = b.y; y < b.y + size; y++) {
    for (let x = b.x; x < b.x + size; x++) {
      if (x < b.x + b.w && y < b.y + b.h) continue;
      if (!inBounds(s, x, y)) return false;
      const i = idx(s, x, y);
      if (s.occ[i] >= 0 || s.terrain[i] || s.road[i] || s.rock[i] || s.ore[i]) return false;
    }
  }
  return true;
}

/** Stalls a marketplace has room for: one for every six tiles, up to six. */
export function marketStalls(b: Building): number {
  if (b.type === 'markethall') return 10;
  return Math.max(1, Math.min(6, Math.floor((b.w * b.h) / 6)));
}

export function workersOf(b: Building): number {
  // A vendor for every stall.
  if (b.type === 'market' || b.type === 'markethall') return marketStalls(b);
  // A family craft is worked by as many of the household as the workshop needs.
  if (b.trade) return Math.min(BUILDINGS[b.trade].workers, b.residents);
  // A tavern keeps a second tapster.
  if (b.type === 'tavern' && b.level >= 2) return 3;
  const base = BUILDINGS[b.type].workers;
  return base > 0 ? base + improvedPlaces(b) : base;
}

export function buildingName(b: Building): string {
  if (b.type === 'house') return HOUSE_LEVELS[b.level]?.name || 'Cottage';
  if (b.type === 'townhall') return MANOR_LEVELS[b.level]?.name || 'Manor Hall';
  if (b.type === 'church') return CHURCH_LEVELS[b.level]?.name || 'Wooden Church';
  if (b.type === 'tavern') return TAVERN_LEVELS[b.level]?.name || 'Alehouse';
  return BUILDINGS[b.type].name;
}

/** Great Works that count for the Patrician House (all but the statue). */
export const GREAT_WORKS: BuildingType[] = ['markethall', 'belltower', 'cathedral', 'university', 'guildhall'];

/** The best church (or the cathedral, as the finest) whose reach covers a home. */
export function churchLevelNear(s: GameState, home: Building): number {
  let best = 0;
  const c = { x: home.x + home.w / 2, y: home.y + home.h / 2 };
  for (const o of s.buildings) {
    if ((o.type !== 'church' && o.type !== 'cathedral') || o.build < 1) continue;
    const r = BUILDINGS[o.type].radius;
    if (Math.hypot(o.x + o.w / 2 - c.x, o.y + o.h / 2 - c.y) > r) continue;
    best = Math.max(best, o.type === 'cathedral' ? 3 : o.level || 1);
  }
  return best;
}

export interface Need {
  label: string;
  met: boolean;
}

/** What a home of a given level needs to stay content. */
export function houseNeeds(s: GameState, b: Building, level: number): Need[] {
  const out: Need[] = [
    { label: 'Enough food', met: s.report.shortage === 0 },
    { label: 'Firewood in winter', met: !s.report.cold },
  ];
  if (level >= 2) {
    out.push({ label: 'A church nearby', met: churchLevelNear(s, b) >= 1 });
    out.push({ label: 'A well nearby', met: coveredBy(s, b, 'well') });
    out.push({ label: 'A market nearby', met: coveredBy(s, b, 'market') });
    out.push({ label: 'Two food groups', met: s.report.variety >= 2 });
  }
  if (level >= 3) {
    out.push({ label: 'A stone church nearby', met: churchLevelNear(s, b) >= 2 });
    out.push({ label: 'An alehouse or tavern with drink', met: coveredBy(s, b, 'tavern') });
    out.push({ label: 'Three food groups', met: s.report.variety >= 3 });
    if (level === 3) out.push({ label: 'Clothes or boots', met: hasSupply(s, b, 'clothes') || hasSupply(s, b, 'boots') });
    out.push({ label: 'Medicine (or herbs)', met: hasSupply(s, b, 'medicine') || hasSupply(s, b, 'herbs') });
  }
  if (level >= 4) {
    out.push({ label: 'A dressed stone church nearby', met: churchLevelNear(s, b) >= 3 });
    out.push({ label: 'A bathhouse nearby', met: coveredBy(s, b, 'bathhouse') });
    out.push({ label: 'Four food groups', met: s.report.variety >= 4 });
    out.push({ label: 'Clothes', met: hasSupply(s, b, 'clothes') });
    out.push({ label: 'Boots', met: hasSupply(s, b, 'boots') });
    out.push({ label: 'A luxury: jewellery, fine clothes, glass, wine or fine pottery', met: luxuryCount(s, b) >= 1 || LUXURIES.some((id) => s.res[id] >= 1) });
  }
  if (level >= 5) {
    // A public school, or a church with its Sunday school.
    out.push({ label: 'A school in town (public or Sunday)', met: s.buildings.some((o) => o.build >= 1 && (o.type === 'school' || (o.type === 'church' && !!o.improved?.includes('sundayschool')))) });
    out.push({ label: 'A Great Work in town', met: s.buildings.some((o) => GREAT_WORKS.includes(o.type) && o.build >= 1) });
    out.push({ label: 'Fine clothes', met: hasSupply(s, b, 'fineclothes') });
    out.push({ label: 'Two more luxuries', met: luxuryCount(s, b, 'fineclothes') >= 2 || LUXURIES.filter((id) => id !== 'fineclothes' && s.res[id] >= 1).length >= 2 });
  }
  return out;
}

export interface UpgradePlan {
  to: number;
  name: string;
  cost: Cost;
  days: number;
  reqs: Need[];
}

/** The next upgrade a building could get, with its requirements. */
export function upgradePlan(s: GameState, b: Building): UpgradePlan | null {
  if (b.build < 1) return null;
  if (b.type === 'house') {
    const next = HOUSE_LEVELS[b.level + 1];
    if (!next?.cost) return null;
    const reqs: Need[] = [{ label: `Settlement is a ${TIERS[next.tier ?? 0].name}`, met: s.tier >= (next.tier ?? 0) }];
    // A house can only grow once the needs of the next level are met.
    const needs = houseNeeds(s, b, b.level + 1).slice(2);
    // Druids' Grove: content with their woods, a home may grow with one need unmet.
    const unmet = needs.filter((n) => !n.met);
    if (unmet.length === 1 && hasCharter(s, 'nature3a')) unmet[0].met = true;
    reqs.push(...needs);
    return { to: b.level + 1, name: next.name, cost: next.cost, days: 6 + b.level * 3, reqs };
  }
  if (b.type === 'tavern') {
    const next = TAVERN_LEVELS[Math.max(1, b.level) + 1];
    if (!next?.cost) return null;
    const tier = next.tier ?? 0;
    return { to: Math.max(1, b.level) + 1, name: next.name, cost: next.cost, days: next.days ?? 14, reqs: [{ label: `Settlement is a ${TIERS[tier].name}`, met: s.tier >= tier }] };
  }
  if (b.type === 'church') {
    const next = CHURCH_LEVELS[b.level + 1];
    if (!next?.cost) return null;
    const tier = next.tier ?? 0;
    return { to: b.level + 1, name: next.name, cost: next.cost, days: next.days ?? 20, reqs: [{ label: `Settlement is a ${TIERS[tier].name}`, met: s.tier >= tier }] };
  }
  if (b.type === 'townhall') {
    const next = MANOR_LEVELS[b.level + 1];
    if (!next?.cost) return null;
    const to = b.level + 1;
    const tier = MANOR_TIER[to];
    const size = MANOR_SIZE[to];
    const reqs: Need[] = [{ label: `Settlement is a ${TIERS[tier].name}`, met: s.tier >= tier }];
    if (size > b.w) reqs.push({ label: `Clear ground to grow to ${size}×${size}`, met: roomToGrow(s, b, size) });
    return { to, name: next.name, cost: next.cost, days: next.days ?? 20, reqs };
  }
  return null;
}

/** Why an upgrade cannot start now, or null if it can. */
export function upgradeBlocker(s: GameState, b: Building): string | null {
  if (b.upgrading) return 'Already being upgraded';
  const plan = upgradePlan(s, b);
  if (!plan) return 'No further upgrades';
  const missing = plan.reqs.find((r) => !r.met);
  if (missing) return `Needs: ${missing.label}`;
  if ((plan.cost.gold ?? 0) > s.res.gold) return 'Not enough coins';
  if ((plan.cost.prestige ?? 0) > s.res.prestige) return 'Not enough prestige';
  return null;
}

/** Starts a renovation: gold now, materials carried in by builders. */
export function startUpgrade(s: GameState, b: Building): boolean {
  if (upgradeBlocker(s, b)) return false;
  const plan = upgradePlan(s, b)!;
  s.res.gold -= plan.cost.gold ?? 0;
  s.res.prestige -= plan.cost.prestige ?? 0;
  b.upgrading = plan.to;
  b.upProgress = 0;
  b.need = materialsOf(plan.cost);
  b.work = 0;
  recompute(s);
  return true;
}

/** Days of labour a renovation takes once materials are on site. */
export function upgradeDays(b: Building): number {
  if (b.craftTo) return HOME_TRADE_DAYS;
  if (b.improveTo) return IMPROVEMENT_BY_ID.get(b.improveTo)?.days ?? 6;
  if (b.type === 'townhall') return MANOR_LEVELS[b.upgrading ?? 2]?.days ?? 20;
  if (b.type === 'church') return CHURCH_LEVELS[b.upgrading ?? 2]?.days ?? 20;
  if (b.type === 'tavern') return TAVERN_LEVELS[b.upgrading ?? 2]?.days ?? 14;
  return 6 + (b.upgrading ?? 2) * 3;
}

/** Cost of the renovation in progress (for showing delivered materials). */
export function upgradeCost(b: Building): Cost {
  if (b.craftTo) return HOME_TRADE_COST;
  if (b.improveTo) return IMPROVEMENT_BY_ID.get(b.improveTo)?.cost ?? {};
  if (b.type === 'townhall') return MANOR_LEVELS[b.upgrading ?? 2]?.cost ?? {};
  if (b.type === 'church') return CHURCH_LEVELS[b.upgrading ?? 2]?.cost ?? {};
  if (b.type === 'tavern') return TAVERN_LEVELS[b.upgrading ?? 2]?.cost ?? {};
  return HOUSE_LEVELS[b.upgrading ?? 2]?.cost ?? {};
}

/** Called when a renovation finishes. */
export function finishUpgrade(s: GameState, b: Building): void {
  if (b.craftTo) {
    // A home workshop: the family takes up its craft for good.
    b.trade = b.craftTo;
    b.craftTo = undefined;
    b.upgrading = undefined;
    b.upProgress = undefined;
    b.upNote = undefined;
    b.need = undefined;
    b.recipe = undefined;
    b.work = 0;
    b.blocked = 0;
    log(s, `A family opened its ${BUILDINGS[b.trade].name.toLowerCase()} at home.`, 'good', b);
    s.dirty = true;
    return;
  }
  if (b.improveTo) {
    const imp = IMPROVEMENT_BY_ID.get(b.improveTo);
    (b.improved ??= []).push(b.improveTo);
    b.improveTo = undefined;
    b.upgrading = undefined;
    b.upProgress = undefined;
    b.upNote = undefined;
    b.need = undefined;
    if (imp) log(s, `${imp.name} finished at the ${buildingName(b).toLowerCase()}.`, 'good', b);
    s.dirty = true;
    return;
  }
  b.level = b.upgrading ?? b.level;
  b.upgrading = undefined;
  b.upProgress = undefined;
  b.upNote = undefined;
  b.need = undefined;
  if (b.type === 'townhall') {
    // The grounds spread onto the ground kept clear for them.
    const size = MANOR_SIZE[b.level] ?? b.w;
    if (size > b.w && roomToGrow(s, b, size)) {
      for (let y = b.y; y < b.y + size; y++) for (let x = b.x; x < b.x + size; x++) s.occ[idx(s, x, y)] = b.id;
      b.w = size;
      b.h = size;
    }
    log(s, `The manor is now a ${MANOR_LEVELS[b.level].name}.`, 'good', b);
  } else {
    log(s, `${buildingName(b)} finished.`, b.type === 'house' ? 'info' : 'good', b);
  }
  s.dirty = true;
}

export function isProject(b: Building): boolean {
  return b.build < 1 || !!b.upgrading;
}

export { needsMaterials };
