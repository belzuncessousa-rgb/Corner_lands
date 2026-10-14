import { BUILDINGS, TIERS } from './data';
import {
  coveredBy,
  hasSupply,
  hasBuilt,
  log,
  materialsOf,
  needsMaterials,
  recompute,
} from './sim';
import type { Building, BuildingType, Cost, GameState } from './types';

/**
 * Building levels: houses grow as their needs are met, the manor grows with
 * the settlement (and with it the settlement's rank), and workplaces can be
 * expanded once to take more workers.
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
  { name: 'Timber House', housing: 7, tax: 1.5, cost: { planks: 10, stone: 5, gold: 20 }, tier: 1 },
  { name: 'Townhouse', housing: 9, tax: 2, cost: { planks: 20, tiles: 15, stone: 10, tools: 3, gold: 50 }, tier: 2 },
];

export const MANOR_LEVELS: { name: string; cost?: Cost; days?: number }[] = [
  { name: '' },
  { name: 'Manor Hall' },
  { name: 'Manor House', cost: { wood: 40, stone: 20, gold: 50 }, days: 20 },
  { name: 'Stone Manor', cost: { planks: 40, dressedstone: 40, stone: 20, gold: 150 }, days: 30 },
  { name: "Lord's Keep", cost: { dressedstone: 80, stone: 40, planks: 60, tools: 15, gold: 400 }, days: 40 },
  { name: 'Castle', cost: { dressedstone: 160, stone: 80, planks: 60, tools: 25, gold: 800, prestige: 150 }, days: 60 },
];

/** Extra storage each manor level above the first provides. */
export const MANOR_STORAGE_PER_LEVEL = { materials: 60, food: 50 };

export const WORKPLACE_UPGRADE: Cost = { planks: 15, stone: 10, gold: 30 };
export const UPGRADABLE_WORK: BuildingType[] = [
  'woodcutter',
  'forester',
  'quarry',
  'mine',
  'forager',
  'hunter',
  'fisher',
  'farm',
  'bakery',
  'windmill',
  'brewhouse',
  'dairy',
  'tanner',
  'weaver',
  'tailor',
  'apothecary',
  'byre',
  'orchardist',
  'sawmill',
  'smithy',
  'claypit',
  'kiln',
  'stonemason',
  'carpenter',
  'bloomery',
  'market',
  'tavern',
];

/** Worker slots, including the expansion of a level 2 workplace. */
export function workersOf(b: Building): number {
  // A family craft is worked by two of the household.
  if (b.trade) return Math.min(2, b.residents);
  const base = BUILDINGS[b.type].workers;
  return b.level >= 2 && UPGRADABLE_WORK.includes(b.type) ? base + Math.ceil(base / 2) : base;
}

export function buildingName(b: Building): string {
  if (b.type === 'house') return HOUSE_LEVELS[b.level]?.name || 'Cottage';
  if (b.type === 'townhall') return MANOR_LEVELS[b.level]?.name || 'Manor Hall';
  const name = BUILDINGS[b.type].name;
  return b.level >= 2 ? `${name} (expanded)` : name;
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
    out.push({ label: 'A tavern with ale or cider', met: coveredBy(s, b, 'tavern') });
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
    const tier = TIERS[b.level];
    const reqs: Need[] = [{ label: `${tier.pop} villagers (${s.population})`, met: s.population >= tier.pop }];
    if (b.level + 1 === 3) reqs.push({ label: 'A marketplace', met: hasBuilt(s, 'market') });
    if (b.level + 1 === 4) reqs.push({ label: 'A church', met: hasBuilt(s, 'church') });
    if (b.level + 1 === 5) reqs.push({ label: 'Three town charters', met: (s.charters?.length ?? 0) >= 3 });
    return { to: b.level + 1, name: next.name, cost: next.cost, days: next.days ?? 20, reqs };
  }
  if (UPGRADABLE_WORK.includes(b.type) && b.level < 2) {
    return {
      to: 2,
      name: `Expanded ${BUILDINGS[b.type].name}`,
      cost: WORKPLACE_UPGRADE,
      days: 8,
      reqs: [{ label: `Settlement is a ${TIERS[1].name}`, met: s.tier >= 1 }],
    };
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
  if (b.type === 'townhall') return MANOR_LEVELS[b.upgrading ?? 2]?.days ?? 20;
  if (b.type === 'house') return 6 + (b.upgrading ?? 2) * 3;
  return 8;
}

/** Cost of the renovation in progress (for showing delivered materials). */
export function upgradeCost(b: Building): Cost {
  if (b.type === 'townhall') return MANOR_LEVELS[b.upgrading ?? 2]?.cost ?? {};
  if (b.type === 'house') return HOUSE_LEVELS[b.upgrading ?? 2]?.cost ?? {};
  return WORKPLACE_UPGRADE;
}

/** Called when a renovation finishes. */
export function finishUpgrade(s: GameState, b: Building): void {
  b.level = b.upgrading ?? b.level;
  b.upgrading = undefined;
  b.upProgress = undefined;
  b.need = undefined;
  if (b.type === 'townhall') {
    s.tier = b.level - 1;
    const t = TIERS[s.tier];
    log(s, `The manor is now a ${MANOR_LEVELS[b.level].name}. Your settlement is a ${t.name}! ${t.desc}`, 'good', b);
  } else {
    log(s, `${buildingName(b)} finished.`, b.type === 'house' ? 'info' : 'good', b);
  }
  s.dirty = true;
}

export function isProject(b: Building): boolean {
  return b.build < 1 || !!b.upgrading;
}

export { needsMaterials };
