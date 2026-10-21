import type { BuildingType, GameState, ResourceId } from './types';

/**
 * What the town knows how to build. Every building outside the starting set,
 * every extra recipe, crop and animal is an unlock: either it opens when the
 * settlement reaches a rank, or it is learned with knowledge, never both.
 * Some wait for something the town has done first (a condition).
 */

export type UnlockKind = 'building' | 'recipe' | 'crop' | 'animal' | 'upgrade' | 'extension' | 'variant' | 'choice' | 'option';

/** The learning board's tabs, by craft. */
export type LearnTab = 'land' | 'farm' | 'herd' | 'cloth' | 'metal' | 'civic';

export const LEARN_TABS: { id: LearnTab; name: string }[] = [
  { id: 'land', name: 'Timber & stone' },
  { id: 'farm', name: 'Farming & food' },
  { id: 'herd', name: 'Herds & orchards' },
  { id: 'cloth', name: 'Cloth & dyes' },
  { id: 'metal', name: 'Metal & glass' },
  { id: 'civic', name: 'Town, learning & trade' },
];

export interface Condition {
  /** Goods the town must have made in total. */
  made?: Partial<Record<ResourceId, number>>;
  /** A building the town must own (any of these). */
  built?: BuildingType[];
  /** How the condition reads on the patch. */
  label: string;
}

export interface Unlock {
  id: string;
  name: string;
  kind: UnlockKind;
  tab: LearnTab;
  /** Patches of one group sit together on the board. */
  group: string;
  /** One line on what it changes. */
  desc: string;
  /** Opens by itself once the settlement reaches this rank. */
  rank?: number;
  /** Knowledge it costs to learn. */
  knowledge?: number;
  condition?: Condition;
  /** Unlocks that must be learned first. */
  needs?: string[];
  /** Learning it also opens these (a mill brings wheat with it). */
  grants?: string[];
  /** Exclusive choices share a group: taking one closes the others. */
  choice?: string;
  /** What it opens. */
  building?: BuildingType;
  recipe?: { building: BuildingType; id: string };
  /** The icon on its patch (a good or building icon key). */
  icon: string;
}

const b = (type: BuildingType) => `b:${type}`;
const r = (type: BuildingType, id: string) => `r:${type}:${id}`;

export const UNLOCKS: Unlock[] = [
  // ------------------------------------------------ timber & stone
  { id: b('forester'), name: "Forester's Hut", kind: 'building', tab: 'land', group: 'Timber', desc: 'Plants trees where the woods have thinned.', knowledge: 1, building: 'forester', icon: 'forester' },
  { id: b('carpenter'), name: "Carpenter's Workshop", kind: 'building', tab: 'land', group: 'Timber', desc: 'Planks into wood parts, which mills and workshops wear.', knowledge: 1, building: 'carpenter', icon: 'carpenter' },
  { id: b('cooper'), name: "Cooper's Workshop", kind: 'building', tab: 'land', group: 'Timber', desc: 'Planks and iron hoops into crates, which carry more trade.', knowledge: 3, condition: { built: ['tradingpost', 'dock', 'winery'], label: 'a trading post, dock or winery' }, building: 'cooper', icon: 'cooper' },
  { id: b('watersawmill'), name: 'Water Sawmill', kind: 'building', tab: 'land', group: 'Timber', desc: 'Beside water: one timber makes one plank.', knowledge: 8, needs: [b('carpenter')], building: 'watersawmill', icon: 'watersawmill' },
  { id: b('claypit'), name: 'Clay Pit', kind: 'building', tab: 'land', group: 'Earth', desc: 'Digs clay from a shore.', rank: 1, building: 'claypit', icon: 'claypit' },
  { id: b('kiln'), name: 'Tile Kiln', kind: 'building', tab: 'land', group: 'Earth', desc: 'Fires clay into roof tiles.', knowledge: 1, building: 'kiln', icon: 'kiln' },
  { id: b('potter'), name: "Potter's Workshop", kind: 'building', tab: 'land', group: 'Earth', desc: 'Fine glazed pottery, coloured with dye: a luxury.', knowledge: 6, building: 'potter', icon: 'potter' },
  { id: b('sandpit'), name: 'Sand Pit', kind: 'building', tab: 'land', group: 'Earth', desc: 'Digs and sieves sand from a shore.', rank: 2, building: 'sandpit', icon: 'sandpit' },
  { id: b('stonemason'), name: "Stonemason's Yard", kind: 'building', tab: 'land', group: 'Stone', desc: 'Squares stone into dressed blocks for fine buildings.', knowledge: 2, building: 'stonemason', icon: 'stonemason' },
  { id: b('limekiln'), name: 'Lime Kiln', kind: 'building', tab: 'land', group: 'Stone', desc: 'Burns stone with sand into mortar.', knowledge: 2, building: 'limekiln', icon: 'limekiln' },

  // ------------------------------------------------ farming & food
  { id: b('windmill'), name: 'Windmill and wheat', kind: 'building', tab: 'farm', group: 'Grain', desc: 'Wheat for the fields and a mill to grind it into flour.', knowledge: 1, building: 'windmill', grants: [r('field', 'wheat')], icon: 'windmill' },
  { id: r('field', 'wheat'), name: 'Wheat', kind: 'crop', tab: 'farm', group: 'Grain', desc: 'The bread grain.', needs: [b('windmill')], recipe: { building: 'field', id: 'wheat' }, icon: 'grain' },
  { id: b('bakery'), name: 'Bakery', kind: 'building', tab: 'farm', group: 'Grain', desc: 'Bakes flour into bread.', knowledge: 1, building: 'bakery', icon: 'bakery' },
  { id: b('watermill'), name: 'Watermill', kind: 'building', tab: 'farm', group: 'Grain', desc: 'The big mill, on a river.', knowledge: 5, building: 'watermill', icon: 'watermill' },
  { id: b('silo'), name: 'Silo', kind: 'building', tab: 'farm', group: 'Grain', desc: 'Keeps grain dry for years.', knowledge: 1, building: 'silo', icon: 'silo' },
  { id: r('field', 'barley'), name: 'Barley', kind: 'crop', tab: 'farm', group: 'Drink', desc: 'The brewing grain.', knowledge: 1, recipe: { building: 'field', id: 'barley' }, icon: 'barley' },
  { id: b('brewhouse'), name: 'Brewhouse', kind: 'building', tab: 'farm', group: 'Drink', desc: 'Opened by the first drink learned.', building: 'brewhouse', icon: 'brewhouse' },
  { id: r('brewhouse', 'ale'), name: 'Brewhouse: ale', kind: 'recipe', tab: 'farm', group: 'Drink', desc: 'Brews barley into ale. The first drink learned opens the brewhouse.', knowledge: 1, recipe: { building: 'brewhouse', id: 'ale' }, grants: [b('brewhouse')], icon: 'ale' },
  { id: r('brewhouse', 'cider'), name: 'Brewhouse: cider', kind: 'recipe', tab: 'farm', group: 'Drink', desc: 'Presses apples into cider. The first drink learned opens the brewhouse.', knowledge: 1, recipe: { building: 'brewhouse', id: 'cider' }, grants: [b('brewhouse')], icon: 'cider' },
  { id: r('brewhouse', 'mead'), name: 'Brewhouse: mead', kind: 'recipe', tab: 'farm', group: 'Drink', desc: 'Ferments honey into mead.', knowledge: 3, recipe: { building: 'brewhouse', id: 'mead' }, grants: [b('brewhouse')], icon: 'mead' },
  { id: r('forager', 'herbs'), name: 'Forager: herbs', kind: 'recipe', tab: 'farm', group: 'Wild', desc: 'Foragers learn the herbs of the woods.', knowledge: 1, recipe: { building: 'forager', id: 'herbs' }, icon: 'herbs' },
  { id: b('apothecary'), name: 'Apothecary', kind: 'building', tab: 'farm', group: 'Wild', desc: 'Herbs into medicine.', knowledge: 4, building: 'apothecary', icon: 'apothecary' },

  // ------------------------------------------------ herds & orchards
  { id: b('byre'), name: 'Animal Farm', kind: 'building', tab: 'herd', group: 'Herds', desc: 'Sheep and pigs on fenced pastures.', knowledge: 2, building: 'byre', icon: 'byre' },
  { id: 'a:cattle', name: 'Cattle', kind: 'animal', tab: 'herd', group: 'Herds', desc: 'The bigger beast: milk, meat and hides.', knowledge: 2, needs: [b('byre')], icon: 'byre' },
  { id: b('dairy'), name: 'Dairy', kind: 'building', tab: 'herd', group: 'Herds', desc: 'Milk into cheese.', knowledge: 2, building: 'dairy', icon: 'dairy' },
  { id: b('draughtstable'), name: 'Draught Stable', kind: 'building', tab: 'herd', group: 'Herds', desc: 'Stalls for pack horses and oxen.', knowledge: 2, building: 'draughtstable', icon: 'draughtstable' },
  { id: b('orchardist'), name: "Orchard Keeper's Lodge", kind: 'building', tab: 'herd', group: 'Orchards', desc: 'Apple orchards.', knowledge: 1, building: 'orchardist', icon: 'orchardist' },
  { id: b('beekeeper'), name: 'Beekeeper', kind: 'building', tab: 'herd', group: 'Orchards', desc: 'Honey from rows of skeps, spring to autumn.', knowledge: 2, building: 'beekeeper', icon: 'beekeeper' },
  { id: r('orchard', 'pears'), name: 'Pears', kind: 'variant', tab: 'herd', group: 'Orchards', desc: 'A year longer to bear, but a third more fruit.', knowledge: 6, needs: [b('orchardist')], recipe: { building: 'orchard', id: 'pears' }, icon: 'pears' },
  { id: r('orchard', 'plums'), name: 'Plums', kind: 'crop', tab: 'herd', group: 'Orchards', desc: 'Plum trees for the orchards.', knowledge: 1, needs: [b('orchardist')], recipe: { building: 'orchard', id: 'plums' }, icon: 'plums' },

  // ------------------------------------------------ cloth & dyes
  { id: r('field', 'flax'), name: 'Flax', kind: 'crop', tab: 'cloth', group: 'Cloth', desc: 'Linen without sheep.', knowledge: 1, recipe: { building: 'field', id: 'flax' }, icon: 'flax' },
  { id: b('weaver'), name: 'Weaver', kind: 'building', tab: 'cloth', group: 'Cloth', desc: 'Wool or flax into cloth.', knowledge: 2, building: 'weaver', icon: 'weaver' },
  { id: b('tailor'), name: 'Tailor & Cobbler: clothes', kind: 'building', tab: 'cloth', group: 'Cloth', desc: 'Cloth into clothes.', knowledge: 2, building: 'tailor', icon: 'tailor' },
  { id: b('tanner'), name: 'Tannery', kind: 'building', tab: 'cloth', group: 'Leather', desc: 'Hides into leather.', knowledge: 2, building: 'tanner', icon: 'tanner' },
  { id: r('tailor', 'boots'), name: 'Tailor: boots', kind: 'recipe', tab: 'cloth', group: 'Leather', desc: 'Leather into boots.', knowledge: 3, needs: [b('tailor')], recipe: { building: 'tailor', id: 'boots' }, icon: 'boots' },
  { id: r('tanner', 'parchment'), name: 'Tanner: parchment', kind: 'recipe', tab: 'cloth', group: 'Leather', desc: 'Hides scraped into parchment, for offices and books.', knowledge: 3, needs: [b('tanner')], recipe: { building: 'tanner', id: 'parchment' }, icon: 'parchment' },
  { id: b('cobbler'), name: 'Cobbler', kind: 'building', tab: 'cloth', group: 'Leather', desc: 'Boots alone, quicker than the tailor.', knowledge: 6, needs: [r('tailor', 'boots')], building: 'cobbler', icon: 'cobbler' },
  { id: b('embroiderer'), name: 'Embroiderer', kind: 'building', tab: 'cloth', group: 'Dyes', desc: 'Dyed cloth into fine clothes, a luxury.', knowledge: 10, building: 'embroiderer', icon: 'embroiderer' },
  { id: r('field', 'woad'), name: 'Woad', kind: 'crop', tab: 'cloth', group: 'Dyes', desc: 'The blue dye plant.', knowledge: 3, recipe: { building: 'field', id: 'woad' }, icon: 'woad' },
  { id: b('dyer'), name: "Dyer's Workshop", kind: 'building', tab: 'cloth', group: 'Dyes', desc: 'Woad or berries into dyes.', knowledge: 5, building: 'dyer', icon: 'dyer' },

  // ------------------------------------------------ metal & glass
  { id: b('mine'), name: 'Bog Iron Pit', kind: 'building', tab: 'metal', group: 'Iron', desc: 'Digs bog ore.', knowledge: 4, building: 'mine', icon: 'mine' },
  { id: b('collier'), name: 'Charcoal Burner', kind: 'building', tab: 'metal', group: 'Iron', desc: 'Timber into charcoal, the hot fuel.', knowledge: 3, building: 'collier', icon: 'collier' },
  { id: b('bloomery'), name: 'Bloomery', kind: 'building', tab: 'metal', group: 'Iron', desc: 'Smelts ore into iron.', rank: 1, building: 'bloomery', icon: 'bloomery' },
  { id: b('smithy'), name: 'Blacksmith', kind: 'building', tab: 'metal', group: 'Iron', desc: 'Iron and timber into tools.', knowledge: 2, building: 'smithy', icon: 'smithy' },
  { id: b('glazier'), name: "Glazier's Workshop", kind: 'building', tab: 'metal', group: 'Glass', desc: 'Glass and dyes into stained glass.', knowledge: 10, building: 'glazier', icon: 'glazier' },
  { id: b('glassworks'), name: 'Glassworks', kind: 'building', tab: 'metal', group: 'Glass', desc: 'Sand and charcoal into glass.', knowledge: 10, building: 'glassworks', icon: 'glassworks' },

  // ------------------------------------------------ town, learning & trade
  { id: b('church'), name: 'Wooden Church', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'Worship, cheer and the first schooling.', rank: 1, building: 'church', icon: 'church' },
  { id: b('monastery'), name: 'Monastery', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'Monks read books for knowledge, prestige and cheer.', knowledge: 10, building: 'monastery', icon: 'monastery' },
  { id: b('school'), name: 'Public School', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'A little knowledge from every home; all work a little slower.', knowledge: 2, building: 'school', icon: 'school' },
  { id: b('papermill'), name: 'Paper Mill', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'Flax beaten into rag paper by a water wheel.', knowledge: 8, building: 'papermill', icon: 'papermill' },
  { id: b('taxoffice'), name: 'Tax Office', kind: 'building', tab: 'civic', group: 'Services', desc: 'Taxes forty more villagers, on paper or parchment.', rank: 2, building: 'taxoffice', icon: 'taxoffice' },
  { id: b('bathhouse'), name: 'Bathhouse', kind: 'building', tab: 'civic', group: 'Services', desc: "Hot baths: a Merchant's House need.", rank: 3, building: 'bathhouse', icon: 'bathhouse' },
  { id: b('courthouse'), name: 'Courthouse', kind: 'building', tab: 'civic', group: 'Services', desc: 'Keeps order in a crowded town.', rank: 3, building: 'courthouse', icon: 'courthouse' },
  { id: b('tavern'), name: 'Alehouse', kind: 'building', tab: 'civic', group: 'Services', desc: 'Pours drink for the homes around it.', rank: 2, building: 'tavern', icon: 'tavern' },
  { id: b('builderyard'), name: "Builder's Yard", kind: 'building', tab: 'civic', group: 'Services', desc: 'With an ox, building sites nearby rise faster.', knowledge: 4, condition: { built: ['draughtstable'], label: 'a draught stable' }, building: 'builderyard', icon: 'builderyard' },
  { id: b('dock'), name: 'Dock', kind: 'building', tab: 'civic', group: 'Trade', desc: 'Boats trade more, and cheaper.', knowledge: 4, building: 'dock', icon: 'dock' },
];

export const UNLOCK_BY_ID = new Map(UNLOCKS.map((u) => [u.id, u]));

/** The unlock that opens a building, if it is not free from the start. */
const BY_BUILDING = new Map<BuildingType, Unlock>();
for (const u of UNLOCKS) if (u.building) BY_BUILDING.set(u.building, u);
const BY_RECIPE = new Map<string, Unlock>();
for (const u of UNLOCKS) if (u.recipe) BY_RECIPE.set(`${u.recipe.building}:${u.recipe.id}`, u);

export function unlockForBuilding(type: BuildingType): Unlock | undefined {
  return BY_BUILDING.get(type);
}

export function unlockForRecipe(building: BuildingType, id: string): Unlock | undefined {
  return BY_RECIPE.get(`${building}:${id}`);
}

/** Whether the town knows an unlock: learned, granted, or opened by rank. */
export function knows(s: GameState, id: string): boolean {
  const u = UNLOCK_BY_ID.get(id);
  if (!u) return true;
  if (s.learned?.includes(id)) return true;
  return u.rank !== undefined && u.knowledge === undefined && s.tier >= u.rank;
}

/** Lifetime count of a good made by the town. */
export function madeOf(s: GameState, id: ResourceId): number {
  return s.madeEver?.[id] ?? 0;
}

export function conditionMet(s: GameState, c: Condition | undefined): boolean {
  if (!c) return true;
  for (const k in c.made ?? {}) if (madeOf(s, k as ResourceId) < (c.made![k as ResourceId] ?? 0)) return false;
  if (c.built && !s.buildings.some((o) => c.built!.includes(o.type) && o.build >= 1)) return false;
  return true;
}

/** Progress towards a condition, 0 to 1 (for the patch's bar). */
export function conditionProgress(s: GameState, c: Condition | undefined): number {
  if (!c) return 1;
  let p = 1;
  for (const k in c.made ?? {}) p = Math.min(p, madeOf(s, k as ResourceId) / Math.max(1, c.made![k as ResourceId] ?? 1));
  if (c.built && !s.buildings.some((o) => c.built!.includes(o.type) && o.build >= 1)) p = Math.min(p, 0);
  return Math.max(0, Math.min(1, p));
}

/** Why an unlock cannot be learned now, or null. */
export function learnError(s: GameState, id: string): string | null {
  const u = UNLOCK_BY_ID.get(id);
  if (!u) return 'Unknown';
  if (knows(s, id)) return 'Already known';
  if (u.rank !== undefined && u.knowledge === undefined) return `Opens at ${['Hamlet', 'Village', 'Town', 'Borough', 'City'][u.rank]}`;
  if (u.choice && UNLOCKS.some((o) => o.choice === u.choice && o.id !== id && knows(s, o.id))) return 'Another way was chosen';
  for (const n of u.needs ?? []) if (!knows(s, n)) return `Needs ${UNLOCK_BY_ID.get(n)?.name ?? n}`;
  if (!conditionMet(s, u.condition)) return `Needs ${u.condition!.label}`;
  if (u.knowledge === undefined) return 'Opens another way';
  if ((s.res.knowledge ?? 0) < u.knowledge) return `Needs ${u.knowledge} knowledge`;
  return null;
}

/** Spends knowledge to learn an unlock (and whatever it grants); returns why not, or null. */
export function learn(s: GameState, id: string): string | null {
  const err = learnError(s, id);
  if (err) return err;
  const u = UNLOCK_BY_ID.get(id)!;
  s.res.knowledge -= u.knowledge ?? 0;
  grant(s, id);
  s.dirty = true;
  return null;
}

/** Marks an unlock known, with whatever it brings along. */
export function grant(s: GameState, id: string): void {
  const list = (s.learned ??= []);
  if (list.includes(id)) return;
  list.push(id);
  for (const g of UNLOCK_BY_ID.get(id)?.grants ?? []) grant(s, g);
}

/** For saves made before learning existed: everything the town already has is known. */
export function grantWhatExists(s: GameState): void {
  for (const o of s.buildings) {
    const u = unlockForBuilding(o.type);
    if (u) grant(s, u.id);
    if (o.recipe) {
      const ru = unlockForRecipe(o.type, o.recipe);
      if (ru) grant(s, ru.id);
    }
    if (o.animals?.cattle) grant(s, 'a:cattle');
  }
}

/** Knows every unlock (for tests of other systems, and the sandbox). */
export function learnEverything(s: GameState): void {
  for (const u of UNLOCKS) grant(s, u.id);
}
