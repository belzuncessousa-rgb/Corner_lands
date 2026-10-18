import { BUILDINGS, TIERS } from './data';
import {
  coveredBy,
  hasSupply,
  HOME_TRADE_COST,
  HOME_TRADE_DAYS,
  log,
  materialsOf,
  needsMaterials,
  recompute,
} from './sim';
import type { Building, Cost, GameState } from './types';
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
  { name: 'Timber House', housing: 7, tax: 1.5, cost: { planks: 12, wood: 6 }, tier: 1 },
  { name: 'Townhouse', housing: 9, tax: 2, cost: { planks: 20, tiles: 15, stone: 10, tools: 3 }, tier: 2 },
];

export const MANOR_LEVELS: { name: string; cost?: Cost; days?: number }[] = [
  { name: '' },
  { name: 'Manor Hall' },
  { name: 'Manor House', cost: { wood: 40, stone: 20, gold: 50 }, days: 20 },
  { name: 'Stone Manor', cost: { planks: 40, dressedstone: 40, stone: 20, gold: 150 }, days: 30 },
];

/** The manor's last step: once it stands, the lord may build what befits it. */
export const STONE_MANOR = 3;

/** The manor's grounds at each level: it needs more room as it grows. */
export const MANOR_SIZE = [0, 3, 3, 4];
/** The town size each manor level waits for. */
export const MANOR_TIER = [0, 1, 1, 2];

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
  return Math.max(1, Math.min(6, Math.floor((b.w * b.h) / 6)));
}

export function workersOf(b: Building): number {
  // A vendor for every stall.
  if (b.type === 'market') return marketStalls(b);
  // A family craft is worked by as many of the household as the workshop needs.
  if (b.trade) return Math.min(BUILDINGS[b.trade].workers, b.residents);
  return BUILDINGS[b.type].workers;
}

export function buildingName(b: Building): string {
  if (b.type === 'house') return HOUSE_LEVELS[b.level]?.name || 'Cottage';
  if (b.type === 'townhall') return MANOR_LEVELS[b.level]?.name || 'Manor Hall';
  return BUILDINGS[b.type].name;
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
    out.push({ label: 'A well nearby', met: coveredBy(s, b, 'well') });
    out.push({ label: 'A market nearby', met: coveredBy(s, b, 'market') });
    out.push({ label: 'A tavern with drink', met: coveredBy(s, b, 'tavern') });
    out.push({ label: 'Two food groups', met: s.report.variety >= 2 });
    out.push({ label: 'Clothes', met: hasSupply(s, b, 'clothes') });
  }
  if (level >= 3) {
    out.push({ label: 'A church nearby', met: coveredBy(s, b, 'church') });
    out.push({ label: 'Three food groups', met: s.report.variety >= 3 });
    out.push({ label: 'Boots', met: hasSupply(s, b, 'boots') });
    out.push({ label: 'Medicine', met: hasSupply(s, b, 'medicine') });
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
    reqs.push(...houseNeeds(s, b, b.level + 1).slice(2));
    return { to: b.level + 1, name: next.name, cost: next.cost, days: 6 + b.level * 3, reqs };
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
  if (b.type === 'townhall') return MANOR_LEVELS[b.upgrading ?? 2]?.days ?? 20;
  return 6 + (b.upgrading ?? 2) * 3;
}

/** Cost of the renovation in progress (for showing delivered materials). */
export function upgradeCost(b: Building): Cost {
  if (b.craftTo) return HOME_TRADE_COST;
  if (b.type === 'townhall') return MANOR_LEVELS[b.upgrading ?? 2]?.cost ?? {};
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
