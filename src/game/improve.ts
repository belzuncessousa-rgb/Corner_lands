import type { Building, BuildingType, Cost, GameState } from './types';

/**
 * Improvements built onto a workplace once the town has learned them: an
 * upgrade rebuilds it in place (usually more places and a better way of
 * working), an extension adds an ability (often with a running cost). Each
 * is built once per workplace, by builders, like a renovation.
 */
export interface Improvement {
  id: string;
  name: string;
  kind: 'upgrade' | 'extension';
  of: BuildingType[];
  desc: string;
  cost: Cost;
  /** Days of building once the materials are on site. */
  days: number;
  /** Tools or wood parts it adds to the workplace's yearly upkeep. */
  upkeep?: Partial<Record<'tools' | 'woodparts', number>>;
  /** Another improvement this one builds on (a chain). */
  after?: string;
  /** Extra places it gives. */
  places?: number;
  /** Must stand beside water. */
  water?: boolean;
}

export const IMPROVEMENTS: Improvement[] = [
  // ------------------------------------------------ upgrades
  { id: 'biglodge', name: "Large woodcutter's lodge", kind: 'upgrade', of: ['woodcutter'], desc: 'Two more places for woodcutters.', cost: { wood: 6 }, days: 6, places: 2 },
  { id: 'towermill', name: 'Tower mill', kind: 'upgrade', of: ['windmill'], desc: 'A quarter more flour from the same grain.', cost: { stone: 8, woodparts: 4, tiles: 4 }, days: 12 },
  { id: 'secondcopper', name: "Brewer's second copper", kind: 'upgrade', of: ['brewhouse'], desc: 'Brews two drinks at once.', cost: { planks: 6, stone: 4 }, days: 8 },
  { id: 'animalsheds', name: 'Animal sheds', kind: 'upgrade', of: ['pasture'], desc: 'This pasture carries 15% more animals.', cost: { planks: 10 }, days: 8 },
  { id: 'cheesecellar', name: 'Cheese cellar', kind: 'upgrade', of: ['dairy'], desc: 'A third less milk for the same cheese.', cost: { stone: 6, tiles: 2 }, days: 8 },
  { id: 'fishingboat', name: 'Fishing boat', kind: 'upgrade', of: ['fisher'], desc: 'One more place, out on deeper water.', cost: { planks: 6, woodparts: 2 }, days: 6, upkeep: { woodparts: 1 }, places: 1 },
  { id: 'broadloom', name: 'Broadloom', kind: 'upgrade', of: ['weaver'], desc: 'Half as much cloth again from the same wool or flax.', cost: { planks: 6, woodparts: 4 }, days: 8, upkeep: { woodparts: 1 } },
  { id: 'crownglass', name: 'Crown glass', kind: 'upgrade', of: ['glassworks'], desc: 'Each melt makes half as much glass again.', cost: { stone: 8, tools: 4 }, days: 12 },
  { id: 'secondvat', name: 'Second vat', kind: 'upgrade', of: ['papermill'], desc: 'Half as much paper again from the same flax.', cost: { planks: 6, woodparts: 2 }, days: 8 },
  { id: 'masonslodge', name: "Mason's lodge", kind: 'upgrade', of: ['stonemason'], desc: 'The masons help raise Great Works in reach: a fifth faster.', cost: { dressedstone: 2, tiles: 2 }, days: 8 },
  { id: 'loft', name: 'Loft', kind: 'upgrade', of: ['storehouse', 'granary'], desc: 'Holds half as much again.', cost: { planks: 6 }, days: 6 },
  { id: 'bigstore', name: 'Improved store', kind: 'upgrade', of: ['storehouse', 'granary'], desc: 'Holds twice as much as at first, and two more haulers.', cost: { stone: 6, planks: 6 }, days: 10, after: 'loft', places: 2 },
  { id: 'pump', name: 'Pump', kind: 'upgrade', of: ['well'], desc: 'Reaches half as far again.', cost: { woodparts: 2, stone: 2 }, days: 4, upkeep: { woodparts: 1 } },
  { id: 'tradecentre', name: 'Trade centre', kind: 'upgrade', of: ['tradingpost'], desc: 'Two more places and carts that carry twice as much.', cost: { stone: 6, wood: 10 }, days: 12, places: 2 },
  { id: 'hugeships', name: 'Great ships', kind: 'upgrade', of: ['dock'], desc: 'Each docker sends away twice as much.', cost: { wood: 12, planks: 20, woodparts: 6 }, days: 16, upkeep: { woodparts: 6 } },
  { id: 'bigstable', name: 'Expanded draught stable', kind: 'upgrade', of: ['draughtstable'], desc: 'Six stalls instead of three.', cost: { wood: 4, planks: 6 }, days: 8 },
  // ------------------------------------------------ extensions
  { id: 'oxshed', name: 'Ox tool-shed', kind: 'extension', of: ['woodcutter'], desc: 'An ox (bought for it, kept in a Draught Stable) drags the logs: half the walking.', cost: { wood: 2, planks: 2, tiles: 1 }, days: 4, upkeep: { tools: 0.5 } },
  { id: 'lathe', name: 'Lathe', kind: 'extension', of: ['carpenter'], desc: 'Wood parts from a third fewer planks.', cost: { planks: 4, tools: 2, tiles: 1 }, days: 6, upkeep: { tools: 1 } },
  { id: 'nursery', name: 'Tree nursery', kind: 'extension', of: ['forester'], desc: 'Saplings for the orchards: those in reach bear a season sooner.', cost: { wood: 4, planks: 2 }, days: 4 },
  { id: 'crane', name: 'Quarry crane', kind: 'extension', of: ['quarry'], desc: 'One more place, and one stone in five comes out ready-dressed.', cost: { planks: 4, woodparts: 2 }, days: 6, upkeep: { woodparts: 1 }, places: 1 },
  { id: 'firingchamber', name: 'Second firing chamber', kind: 'extension', of: ['kiln'], desc: 'Tiles on half the fuel.', cost: { stone: 6, tiles: 2 }, days: 6 },
  { id: 'ironplough', name: 'Iron plough', kind: 'extension', of: ['farm'], desc: 'Farmers tend half as many fields again.', cost: { planks: 4, tools: 2 }, days: 4, upkeep: { tools: 1 } },
  { id: 'herbgarden', name: 'Herb garden', kind: 'extension', of: ['forager'], desc: 'Herbs grown on a plot all year, not only gathered in season.', cost: { planks: 3 }, days: 3 },
  { id: 'fishpond', name: 'Pisciculture', kind: 'extension', of: ['fisher'], desc: 'A fish pond by the hut: a shoal that never wanders off.', cost: { wood: 1, planks: 4 }, days: 5 },
  { id: 'kennels', name: 'Kennels', kind: 'extension', of: ['hunter'], desc: 'Hunters with dogs walk twice as fast; the dogs eat a meat a month.', cost: { wood: 4, planks: 2 }, days: 4 },
  { id: 'bellows', name: 'Water bellows', kind: 'extension', of: ['bloomery'], desc: 'Beside water: iron on half the fuel.', cost: { planks: 6, woodparts: 4 }, days: 8, upkeep: { woodparts: 2 }, water: true },
  { id: 'farrier', name: 'Farrier', kind: 'extension', of: ['smithy'], desc: 'Shod animals: pack horses carry a quarter more, oxen speed building a quarter more; an iron a year for each.', cost: { planks: 4, stone: 2 }, days: 5 },
  { id: 'deepshaft', name: 'Deep shaft', kind: 'extension', of: ['mine'], desc: 'The ore lasts twice as long.', cost: { planks: 6, woodparts: 4 }, days: 8 },
  { id: 'sundayschool', name: 'Sunday school', kind: 'extension', of: ['church'], desc: '0.02 knowledge a month for each home it serves; all work 2% slower.', cost: { planks: 4, tiles: 2 }, days: 6 },
  { id: 'infirmary', name: 'Infirmary', kind: 'extension', of: ['monastery'], desc: 'Sickness passes lightly over homes in reach; uses a medicine a month.', cost: { stone: 6, tiles: 4 }, days: 8 },
  { id: 'goodscart', name: 'Goods cart', kind: 'extension', of: ['tradingpost'], desc: 'A cart for a pack horse: it carries half as much again.', cost: { planks: 10 }, days: 5, upkeep: { woodparts: 1 } },
  { id: 'mountedguard', name: 'Mounted guard', kind: 'extension', of: ['courthouse'], desc: 'Horses for the watch: it keeps order in half as many homes again.', cost: { planks: 6, stone: 4 }, days: 6 },
  { id: 'oxcarts', name: 'Ox-carts', kind: 'extension', of: ['storehouse', 'granary'], desc: 'An ox from a draught stable: haulers carry twice as much.', cost: { planks: 4, woodparts: 2 }, days: 4, after: 'bigstore' },
];

export const IMPROVEMENT_BY_ID = new Map(IMPROVEMENTS.map((i) => [i.id, i]));

/** Whether a workplace has an improvement finished. */
export function has(b: Building, id: string): boolean {
  return !!b.improved?.includes(id);
}

/** Whether the town has any building with this improvement. */
export function townHas(s: GameState, id: string): boolean {
  return s.buildings.some((b) => b.build >= 1 && has(b, id));
}

/** Improvements a kind of workplace can take. */
export function improvementsFor(type: BuildingType): Improvement[] {
  return IMPROVEMENTS.filter((i) => i.of.includes(type));
}

/** Extra places a workplace has from its improvements. */
export function improvedPlaces(b: Building): number {
  let n = 0;
  for (const id of b.improved ?? []) n += IMPROVEMENT_BY_ID.get(id)?.places ?? 0;
  return n;
}

/** Upkeep its improvements add to a workplace (a month). */
export function improvedUpkeep(b: Building, free: string[] = []): Partial<Record<'tools' | 'woodparts', number>> {
  const out: Partial<Record<'tools' | 'woodparts', number>> = {};
  for (const id of b.improved ?? []) {
    if (free.includes(id)) continue;
    const u = IMPROVEMENT_BY_ID.get(id)?.upkeep;
    for (const k in u) out[k as 'tools'] = (out[k as 'tools'] ?? 0) + (u[k as 'tools'] ?? 0) / 12;
  }
  return out;
}

type Goods = Partial<Record<string, number>>;

/** What one batch takes and makes at a workplace, with its improvements. */
export function improvedRecipe(b: Building, inputs: Goods, outputs: Goods): { inputs: Goods; outputs: Goods } {
  if (!b.improved?.length) return { inputs, outputs };
  const i = { ...inputs };
  const o = { ...outputs };
  // Each scales the batch it improves, so the recipes can be retuned without breaking it.
  if (has(b, 'towermill') && o.flour) o.flour = Math.round(o.flour * 1.25);
  if (has(b, 'cheesecellar') && i.milk) i.milk = Math.round((i.milk * 2) / 3);
  if (has(b, 'broadloom') && o.cloth) o.cloth = Math.round(o.cloth * 1.5);
  if (has(b, 'crownglass') && o.glass) o.glass = Math.round(o.glass * 1.5);
  if (has(b, 'secondvat') && o.paper) o.paper = Math.round(o.paper * 1.5);
  if (has(b, 'lathe') && o.woodparts && i.planks) i.planks = Math.round((i.planks * 2) / 3);
  return { inputs: i as never, outputs: o as never };
}

/** Share of the usual fuel a workplace burns, with its improvements. */
export function improvedFuel(b: Building): number {
  return has(b, 'firingchamber') || has(b, 'bellows') ? 0.5 : 1;
}

/** How much faster a workplace gets through its batches, with its improvements. */
export function improvedPace(b: Building): number {
  return has(b, 'secondcopper') ? 2 : 1;
}

/** How far its walks to the work weigh, with its improvements (ox to drag logs, dogs to run down game). */
export function improvedWalk(b: Building): number {
  return has(b, 'oxshed') || has(b, 'kennels') ? 0.5 : 1;
}
