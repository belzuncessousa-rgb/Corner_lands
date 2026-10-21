import type { BuildingType, Category, Cost, FoodGroup, GoodsGroup, ResourceId } from './types';
import { RESOURCE_IDS } from './types';

/** Real seconds per game day at 1x speed: a year lasts 45 minutes. */
export const DAY_SECONDS = 22.5;

/** Walking speed in tiles per game day: paved roads, dirt roads, open country. */
export const STONE_ROAD_TILES_PER_DAY = 30;
/** Cobbled streets of dressed stone are the quickest going of all. */
export const COBBLE_TILES_PER_DAY = 36;
export const ROAD_TILES_PER_DAY = 22;
export const OFFROAD_TILES_PER_DAY = 12;
/**
 * How far gatherers go for what they gather: there is no fixed area, only
 * the walk, which costs them working time. Beyond this they will not go.
 */
export const GATHER_REACH = 26;
/** How far around a spot the build hint counts trees, rocks or bushes (workers walk further if they must). */
export const NEAR_HINT = 8;
/** Workplaces that go out for what they gather. */
export const GATHERERS: ReadonlySet<BuildingType> = new Set<BuildingType>(['woodcutter', 'quarry', 'mine', 'forager', 'hunter', 'fisher']);

/** Goods a workplace can keep in its own yard until haulers fetch them. */
export const YARD_STORE = 30;
/** Goods a hauler carries in one trip (a handcart). */
export const HAUL_LOAD = 10;
/** How strongly walking time slows production (0 = ignored). */
export const TRAVEL_WEIGHT = 2;

export type StorageKind = 'materials' | 'food';

export interface GoodDef {
  name: string;
  desc: string;
  group: GoodsGroup;
  /** Storage pool; null for coins and prestige. */
  storage: StorageKind | null;
  /** Market buying price in coins (0 = cannot be traded). */
  price: number;
  /** Hunger one unit satisfies (villager-months); edible goods only. */
  food?: number;
  foodGroup?: FoodGroup;
  /** Default amount kept in store before workers rest. */
  keep: number;
}

function good(
  name: string,
  group: GoodsGroup,
  price: number,
  desc: string,
  extra: Partial<GoodDef> = {},
): GoodDef {
  const storage: StorageKind | null = group === 'currency' ? null : group === 'food' ? 'food' : 'materials';
  return { name, desc, group, storage, price, keep: group === 'food' ? 300 : 150, ...extra };
}

/** Every good in the game. Goods nobody has made yet stay hidden. */
export const GOODS: Record<ResourceId, GoodDef> = {
  wood: good('Timber', 'materials', 2, 'Felled logs for building, sawing and burning.'),
  firewood: good('Firewood', 'materials', 2, 'Split logs. Homes burn one bundle a winter month instead of two logs of timber.', { keep: 100 }),
  planks: good('Planks', 'materials', 5, 'Sawn boards for finer buildings.', { keep: 100 }),
  woodparts: good('Wood Parts', 'materials', 12, 'Gears, axles and frames for mills and machines.', { keep: 20 }),
  stone: good('Stone', 'materials', 3, 'Quarried stone for sturdier buildings.'),
  dressedstone: good('Dressed Stone', 'materials', 9, 'Squared blocks for manors, churches and keeps.', { keep: 80 }),
  clay: good('Clay', 'materials', 1, 'Dug from riverbanks, fired into tiles.'),
  tiles: good('Roof Tiles', 'materials', 6, 'Fired clay tiles. Townhouses want a tiled roof.', { keep: 80 }),
  ore: good('Bog Iron', 'materials', 3, 'Rusty lumps of iron ore dug from boggy ground, smelted in a bloomery.'),
  iron: good('Iron', 'materials', 9, 'Iron for the blacksmith.', { keep: 60 }),
  crates: good('Crates', 'materials', 7, 'Nailed boxes from the cooper. Wine is packed in them, and merchants carry ten more goods for every crate in store above its stock target, up to half as much again; a quarter of the crates used come back too worn to use.', { keep: 40 }),
  sand: good('Sand', 'materials', 1, 'Dug from riverbanks and lakeshores: burned with stone into mortar, or melted into glass.'),
  mortar: good('Mortar', 'materials', 8, 'Lime burned from stone and mixed with sand, to bind the dressed stone of the finest buildings.', { keep: 60 }),
  charcoal: good('Charcoal', 'materials', 4, 'Timber slow-burned under turf: the hot, clean fire a glass furnace needs.', { keep: 60 }),
  glass: good('Glass', 'materials', 20, 'Melted from sand over a charcoal fire, for the windows of the grandest buildings.', { keep: 30 }),
  stainedglass: good('Stained Glass', 'materials', 60, 'Panes of coloured glass leaded into pictures, for the windows of the church and the cathedral.', { keep: 20 }),
  silver: good('Silver', 'materials', 15, 'Precious ore turned up by deep miners, for the jeweller.', { keep: 40 }),

  bread: good('Bread', 'food', 3, 'Baked from flour. Filling: feeds one and a half.', { food: 1.5, foodGroup: 'grain' }),
  meat: good('Meat', 'food', 3, 'Venison and beef.', { food: 1, foodGroup: 'meat' }),
  pork: good('Pork', 'food', 3, 'Salted pork from the autumn slaughter.', { food: 1, foodGroup: 'meat' }),
  fish: good('Fish', 'food', 3, 'Caught from rivers and lakes.', { food: 1, foodGroup: 'meat' }),
  eggs: good('Eggs', 'food', 2, 'From backyard hens.', { food: 0.75, foodGroup: 'meat' }),
  berries: good('Berries', 'food', 2, 'Foraged in spring and summer.', { food: 1, foodGroup: 'produce' }),
  strawberries: good('Strawberries', 'food', 3, 'From strawberry beds in the orchards: they bear in their first year.', { food: 1, foodGroup: 'produce' }),
  vegetables: good('Vegetables', 'food', 2, 'Cabbages, leeks and turnips from backyard plots.', { food: 1, foodGroup: 'produce' }),
  apples: good('Apples', 'food', 2, 'From orchards; also pressed into cider.', { food: 1, foodGroup: 'produce' }),
  pears: good('Pears', 'food', 2, 'From orchards.', { food: 1, foodGroup: 'produce' }),
  plums: good('Plums', 'food', 2, 'From orchards.', { food: 1, foodGroup: 'produce' }),
  grapes: good('Grapes', 'food', 3, 'From vines planted in orchards; pressed into wine.', { food: 1, foodGroup: 'produce' }),
  honey: good('Honey', 'food', 5, 'From backyard hives. A treat: feeds one and a half.', { food: 1.5, foodGroup: 'dairy' }),
  milk: good('Milk', 'food', 1, 'From cattle. Spoils quickly; better made into cheese.', { food: 0.5, foodGroup: 'dairy' }),
  cheese: good('Cheese', 'food', 4, 'Made from milk at a dairy. Feeds two.', { food: 2, foodGroup: 'dairy' }),

  grain: good('Wheat', 'goods', 2, 'Harvested in autumn, milled and baked into bread.', { storage: 'food', keep: 300 }),
  barley: good('Barley', 'goods', 2, 'Brewed into ale.', { storage: 'food' }),
  // No longer grown (kept so older saves load).
  flour: good('Flour', 'goods', 3, 'Milled wheat, ready for the oven.', { storage: 'food' }),
  flax: good('Flax', 'goods', 2, 'Retted and spun into linen.'),
  wool: good('Wool', 'goods', 3, 'Shorn from sheep in spring.'),
  hides: good('Hides', 'goods', 2, 'Skins from the hunt and the slaughter, for the tanner.', { keep: 60 }),
  leather: good('Leather', 'goods', 6, 'Tanned hides for boots.'),
  cloth: good('Cloth', 'goods', 8, 'Woven wool and linen.'),
  clothes: good('Clothes', 'goods', 13, 'Tunics and cloaks. Finer homes need them.', { keep: 60 }),
  boots: good('Boots', 'goods', 12, 'Sturdy leather boots. Townhouses need them.', { keep: 60 }),
  ale: good('Ale', 'goods', 5, 'Brewed from barley and poured at the tavern.', { keep: 100 }),
  cider: good('Cider', 'goods', 5, 'Pressed from apples.', { keep: 100 }),
  mead: good('Mead', 'goods', 10, 'Honey wine from the brewhouse (Meadmakers). Taverns pour it, and Townhouses count it a luxury.', { keep: 60 }),
  wine: good('Wine', 'goods', 12, 'From the winery. Taverns pour it, and Townhouses count it a luxury.', { keep: 60 }),
  herbs: good('Herbs', 'goods', 2, 'Gathered wild, made into medicine.'),
  medicine: good('Medicine', 'goods', 10, 'Salves and tinctures. Townhouses want them.', { keep: 40 }),
  tools: good('Tools', 'goods', 14, 'Needed for upgrades and grand buildings.', { keep: 40 }),
  woad: good('Woad', 'goods', 2, 'Leaves of the dye plant, crushed and fermented for the dyer.'),
  dyes: good('Dyes', 'goods', 10, "Blue steeped from woad in the dyer's vats."),
  fineclothes: good('Fine Clothes', 'goods', 30, 'Gowns and cloaks of dyed cloth from the tailor. A luxury for the finest homes, and a rich export.', { keep: 30 }),
  paper: good('Paper', 'goods', 6, 'Rag paper from the paper mill, for offices and books.', { keep: 40 }),
  parchment: good('Parchment', 'goods', 8, 'Hides scraped and stretched at the tannery: offices and books use it like paper.', { keep: 40 }),
  books: good('Books', 'goods', 40, 'Copied and bound at the scriptorium, or bought from merchants. A luxury for Townhouses; universities and monasteries read them.', { keep: 20 }),
  jewellery: good('Jewellery', 'goods', 60, 'Rings and brooches of silver. The finest luxury.', { keep: 20 }),
  pottery: good('Fine Pottery', 'goods', 14, 'Glazed jugs and dishes from the potter: a luxury the finest homes want.', { keep: 40 }),

  gold: good('Coins', 'currency', 0, 'Collected from taxes and trade.'),
  prestige: good('Prestige', 'currency', 0, 'The renown of your house. Earned from a fine manor and a thriving town; spent on charters, titles (Baron, Earl, Duke) and works of art.'),
  knowledge: good('Knowledge', 'currency', 0, 'What your people have learned: taught by the church and the monks, kept in the homes of the well-to-do, copied in scriptoria and argued over at the university.'),
};

/** Edible goods, in the order villagers reach for them. */
export const FOOD_IDS: ResourceId[] = RESOURCE_IDS.filter((r) => GOODS[r].food);

export const GROUP_NAMES: Record<GoodsGroup, string> = {
  food: 'Food',
  materials: 'Materials',
  goods: 'Goods',
  currency: 'Treasury',
};

/** Back-compat views of the registry. */
export const RESOURCE_INFO: Record<ResourceId, { name: string; desc: string }> = GOODS;
export const RESOURCE_STORAGE: Record<ResourceId, StorageKind | null> = Object.fromEntries(
  RESOURCE_IDS.map((r) => [r, GOODS[r].storage]),
) as Record<ResourceId, StorageKind | null>;

/** Storage capacity each building provides. */
export const STORAGE_CAPACITY: Partial<Record<BuildingType, Partial<Record<StorageKind, number>>>> = {
  camp: { materials: 150, food: 120 },
  storehouse: { materials: 300 },
  granary: { food: 300 },
};

/** Grains a silo keeps: they go there first, before the granaries. */
export const SILO_GOODS: ResourceId[] = ['grain', 'barley'];
/** Wheat and barley each silo holds. */
export const SILO_CAPACITY = 500;

export const DAYS_PER_MONTH = 10;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export const MONTH_NAMES = [
  'Early Spring',
  'Mid Spring',
  'Late Spring',
  'Early Summer',
  'Midsummer',
  'Late Summer',
  'Early Autumn',
  'Harvest',
  'Late Autumn',
  'Early Winter',
  'Midwinter',
  'Late Winter',
];
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

/** One product a building can make. */
export interface Recipe {
  id: string;
  name: string;
  inputs: Cost;
  outputs: Cost;
  /** Months (0-11) it can be made; all year when absent. */
  months?: number[];
  /** Whether Auto may pick it (false for goods nothing uses yet). */
  auto?: boolean;
  /** Town charter needed before it can be made. */
  charter?: string;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  desc: string;
  category: Category;
  w: number;
  h: number;
  cost: Cost;
  buildDays: number;
  workers: number;
  housing: number;
  tier: number;
  hotkey?: string;
  /** Radius (tiles) for resource gathering or service coverage. */
  radius: number;
  /** Production: days per cycle for one full crew. */
  cycle: number;
  inputs: Cost;
  outputs: Cost;
  /** What map resource this building gathers, if any. */
  gathers?: 'trees' | 'rock' | 'ore' | 'berries' | 'forest' | 'water';
  /** Happiness added to homes within `radius` (decorations). */
  beauty: number;
  /** Months (0-11) the workplace needs workers; all year when absent. */
  months?: number[];
  /** Alternative products; the first is the default. */
  recipes?: Recipe[];
  /** Town charter that unlocks it. */
  charter?: string;
  /** Works in batches: workers are only called once inputs for this many cycles wait. */
  batch?: number;
  /** Drawn areas worked from a nearby workplace (fields, pastures, orchards). */
  zone?: { owner: BuildingType; min: number; max: number };
  buildable: boolean;
}

function def(d: Partial<BuildingDef> & Pick<BuildingDef, 'type' | 'name' | 'desc' | 'category'>): BuildingDef {
  return {
    w: 2,
    h: 2,
    cost: {},
    buildDays: 10,
    workers: 0,
    housing: 0,
    tier: 0,
    radius: 0,
    cycle: 0,
    inputs: {},
    outputs: {},
    buildable: true,
    beauty: 0,
    ...d,
  };
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  camp: def({
    type: 'camp',
    name: "Settlers' Camp",
    desc: 'Tents and the cart the first families came with: shelter for eight and a store for what they brought, until houses and a storehouse stand.',
    category: 'civic',
    w: 3,
    h: 3,
    housing: 8,
    buildable: false,
  }),
  townhall: def({
    type: 'townhall',
    name: 'Manor',
    desc: "The lord's seat, built where you choose (one to a town). Feasts and festivals are held here, and it brings a little prestige each month. It grows from a timber hall to a Manor House and a Stone Manor, which lets the lord raise a manor garden, watch towers and the town walls.",
    category: 'manor',
    w: 3,
    h: 3,
    housing: 4,
    cost: { wood: 60, planks: 20, stone: 20, gold: 60 },
    buildDays: 30,
    tier: 1,
  }),
  house: def({
    type: 'house',
    name: 'Burgage House',
    desc: 'A timber cottage for a family of five.',
    category: 'housing',
    cost: { wood: 12 },
    buildDays: 8,
    housing: 5,
    hotkey: 'h',
  }),
  woodcutter: def({
    type: 'woodcutter',
    name: "Woodcutter's Lodge",
    desc: 'Fells nearby trees for timber, or splits them into firewood. A household burns one bundle of firewood each winter month, or two logs of timber.',
    category: 'resources',
    cost: { wood: 15 },
    workers: 2,
    cycle: 2,
    outputs: { wood: 4 },
    gathers: 'trees',
    hotkey: 'e',
    recipes: [
      { id: 'logs', name: 'Timber', inputs: {}, outputs: { wood: 4 } },
      { id: 'firewood', name: 'Firewood', inputs: {}, outputs: { firewood: 6 } },
    ],
  }),
  forester: def({
    type: 'forester',
    name: "Forester's Hut",
    desc: 'Plants new trees nearby so the forest never runs out.',
    category: 'resources',
    cost: { wood: 8 },
    workers: 1,
    cycle: 2,
    gathers: undefined,
  }),
  quarry: def({
    type: 'quarry',
    name: 'Stone Quarry',
    desc: 'Cuts stone from nearby rock outcrops.',
    category: 'resources',
    cost: { wood: 20 },
    workers: 2,
    cycle: 3,
    outputs: { stone: 3 },
    gathers: 'rock',
    hotkey: 'q',
  }),
  forager: def({
    type: 'forager',
    name: "Forager's Hut",
    desc: 'Gathers berries from wild bushes in spring and summer, and wild herbs once foragers know them. Rests in deep winter.',
    category: 'food',
    cost: { wood: 10 },
    workers: 2,
    cycle: 2,
    outputs: { berries: 5 },
    gathers: 'berries',
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    recipes: [
      { id: 'berries', name: 'Berries', inputs: {}, outputs: { berries: 5 }, months: [0, 1, 2, 3, 4, 5, 6, 7] },
      { id: 'herbs', name: 'Herbs', inputs: {}, outputs: { herbs: 3 }, months: [0, 1, 2, 3, 4, 5, 6, 7, 8], auto: false },
    ],
    hotkey: 'g',
  }),
  hunter: def({
    type: 'hunter',
    name: 'Hunting Camp',
    desc: 'Hunts game in nearby forests. Needs plenty of trees around.',
    category: 'food',
    cost: { wood: 15 },
    workers: 1,
    cycle: 3,
    outputs: { meat: 5 },
    gathers: 'forest',
  }),
  fisher: def({
    type: 'fisher',
    name: "Fisher's Hut",
    desc: 'Catches fish. Must be built close to water. Slower in winter.',
    category: 'food',
    cost: { wood: 15 },
    workers: 2,
    cycle: 3,
    outputs: { fish: 5 },
    gathers: 'water',
  }),
  farm: def({
    type: 'farm',
    name: 'Farmstead',
    desc: 'Farmers sow the fields you draw nearby in spring, tend them through summer and bring in the harvest in autumn. Three farmers keep about 45 tiles of fields.',
    category: 'farming',
    cost: { wood: 25 },
    buildDays: 12,
    workers: 3,
    tier: 1,
    months: [0, 1, 2, 3, 4, 5, 7],
  }),
  field: def({
    type: 'field',
    name: 'Field',
    desc: 'Draw a field near a Farmstead and choose its crop: vegetables to eat as they are, wheat for bread, barley for ale, flax for linen or woad for dye. Changing crops each year keeps the soil rich.',
    category: 'farming',
    w: 1,
    h: 1,
    buildDays: 0,
    tier: 1,
    zone: { owner: 'farm', min: 2, max: 10 },
    recipes: [
      { id: 'vegetables', name: 'Vegetables', inputs: {}, outputs: { vegetables: 1 } },
      { id: 'wheat', name: 'Wheat', inputs: {}, outputs: { grain: 1 } },
      { id: 'barley', name: 'Barley', inputs: {}, outputs: { barley: 1 } },
      { id: 'flax', name: 'Flax', inputs: {}, outputs: { flax: 1 } },
      { id: 'woad', name: 'Woad', inputs: {}, outputs: { woad: 1 } },
    ],
  }),
  byre: def({
    type: 'byre',
    name: 'Animal Farm',
    desc: 'Herders keep sheep (wool each spring), cattle (milk) and pigs on the pastures you fence nearby. Animals are bought one by one at a trading post and do not breed; slaughter one for its meat and hide when you choose.',
    category: 'farming',
    cost: { wood: 30, planks: 5 },
    buildDays: 12,
    workers: 2,
    tier: 1,
  }),
  pasture: def({
    type: 'pasture',
    name: 'Pasture',
    desc: 'Fenced grazing for an Animal Farm: a sheep needs 2 tiles, a pig 3, a cow 4, and kinds share it. Buy the animals at a trading post.',
    category: 'farming',
    w: 1,
    h: 1,
    buildDays: 0,
    tier: 1,
    zone: { owner: 'byre', min: 3, max: 10 },
  }),
  orchardist: def({
    type: 'orchardist',
    name: "Orchard Keeper's Lodge",
    desc: 'Pickers harvest the orchards you plant nearby in late summer. Young trees bear fruit after a year and a half.',
    category: 'farming',
    cost: { wood: 20, planks: 5 },
    buildDays: 10,
    workers: 2,
    tier: 1,
    months: [5, 6],
  }),
  orchard: def({
    type: 'orchard',
    name: 'Orchard',
    desc: 'Rows of fruit trees: apples (also pressed into cider), pears or plums. Saplings cost 2 coins a tile.',
    category: 'farming',
    w: 1,
    h: 1,
    buildDays: 0,
    tier: 1,
    zone: { owner: 'orchardist', min: 2, max: 8 },
    recipes: [
      { id: 'apples', name: 'Apples', inputs: {}, outputs: { apples: 1 } },
      { id: 'pears', name: 'Pears', inputs: {}, outputs: { pears: 1 } },
      { id: 'plums', name: 'Plums', inputs: {}, outputs: { plums: 1 } },
      { id: 'grapes', name: 'Vines', inputs: {}, outputs: { grapes: 1 }, charter: 'orchard2' },
    ],
  }),
  watermill: def({
    type: 'watermill',
    name: 'Watermill',
    desc: 'A wheel turned by the stream grinds wheat into flour twice as fast as a windmill, and wastes less. Must be built on a riverbank or lakeshore.',
    category: 'food',
    cost: { wood: 30, stone: 15, woodparts: 6 },
    buildDays: 16,
    workers: 1,
    cycle: 2,
    inputs: { grain: 8 },
    outputs: { flour: 9 },
    tier: 1,
  }),
  windmill: def({
    type: 'windmill',
    name: 'Windmill',
    desc: 'Grinds wheat into flour for the bakers.',
    category: 'food',
    cost: { wood: 25, woodparts: 4 },
    buildDays: 14,
    workers: 1,
    cycle: 2,
    inputs: { grain: 4 },
    outputs: { flour: 4 },
    tier: 1,
  }),
  bakery: def({
    type: 'bakery',
    name: 'Bakery',
    desc: 'The town oven: bakes flour into bread. A loaf feeds one and a half.',
    category: 'food',
    cost: { wood: 20, stone: 4 },
    workers: 2,
    cycle: 2,
    inputs: { flour: 2 },
    outputs: { bread: 4 },
    tier: 1,
  }),
  brewhouse: def({
    type: 'brewhouse',
    name: 'Brewhouse',
    desc: 'Brews ale from barley or presses cider from apples (and, for Meadmakers, mead from honey). Taverns pour them for the town.',
    category: 'food',
    cost: { wood: 20, planks: 10 },
    workers: 2,
    cycle: 3,
    inputs: { barley: 3 },
    outputs: { ale: 4 },
    tier: 1,
    recipes: [
      { id: 'ale', name: 'Ale', inputs: { barley: 3 }, outputs: { ale: 4 } },
      { id: 'cider', name: 'Cider', inputs: { apples: 4 }, outputs: { cider: 4 } },
      { id: 'mead', name: 'Mead', inputs: { honey: 3 }, outputs: { mead: 3 }, charter: 'orchard3b' },
    ],
  }),
  dairy: def({
    type: 'dairy',
    name: 'Dairy',
    desc: 'Turns milk into cheese, which keeps and feeds twice as much.',
    category: 'food',
    cost: { wood: 20 },
    workers: 1,
    cycle: 2,
    inputs: { milk: 3 },
    outputs: { cheese: 2 },
    tier: 1,
  }),
  tanner: def({
    type: 'tanner',
    name: 'Tannery',
    desc: 'Tans hides into leather in stinking pits, a batch at a time once enough hides are waiting.',
    category: 'industry',
    cost: { wood: 25 },
    workers: 1,
    cycle: 3,
    inputs: { hides: 2 },
    outputs: { leather: 2 },
    batch: 3,
    tier: 1,
    recipes: [
      { id: 'leather', name: 'Leather', inputs: { hides: 2 }, outputs: { leather: 2 } },
      { id: 'parchment', name: 'Parchment', inputs: { hides: 2 }, outputs: { parchment: 2 } },
    ],
  }),
  weaver: def({
    type: 'weaver',
    name: 'Weaver',
    desc: 'Spins and weaves wool or flax into cloth.',
    category: 'industry',
    cost: { wood: 20, planks: 5 },
    workers: 2,
    cycle: 3,
    inputs: { wool: 2 },
    outputs: { cloth: 2 },
    tier: 1,
    recipes: [
      { id: 'wool', name: 'Woollen', inputs: { wool: 2 }, outputs: { cloth: 2 } },
      { id: 'linen', name: 'Linen', inputs: { flax: 3 }, outputs: { cloth: 2 } },
    ],
  }),
  tailor: def({
    type: 'tailor',
    name: 'Tailor & Cobbler',
    desc: 'Sews cloth into clothes and stitches leather into boots. Timber Houses need clothes, Townhouses boots. With dyes, it cuts fine clothes for the well-to-do.',
    category: 'industry',
    cost: { wood: 15, planks: 10 },
    workers: 2,
    cycle: 3,
    inputs: { cloth: 2 },
    outputs: { clothes: 2 },
    tier: 1,
    recipes: [
      { id: 'clothes', name: 'Clothes', inputs: { cloth: 2 }, outputs: { clothes: 2 } },
      { id: 'boots', name: 'Boots', inputs: { leather: 2 }, outputs: { boots: 2 } },
      { id: 'fineclothes', name: 'Fine clothes', inputs: { cloth: 2, dyes: 1 }, outputs: { fineclothes: 1 } },
    ],
  }),
  apothecary: def({
    type: 'apothecary',
    name: 'Apothecary',
    desc: 'Makes salves and tinctures from herbs. Townhouses want medicine.',
    category: 'civic',
    cost: { wood: 15, planks: 10 },
    workers: 1,
    cycle: 4,
    inputs: { herbs: 3 },
    outputs: { medicine: 2 },
    tier: 2,
  }),
  sawmill: def({
    type: 'sawmill',
    name: 'Sawpit',
    desc: 'Saws timber into planks.',
    category: 'industry',
    cost: { wood: 25 },
    workers: 2,
    cycle: 2,
    inputs: { wood: 4 },
    outputs: { planks: 3 },
    tier: 1,
  }),
  mine: def({
    type: 'mine',
    name: 'Bog Iron Pit',
    desc: 'Digs bog iron from the rusty, marshy ground nearby, for a bloomery to smelt.',
    category: 'resources',
    cost: { wood: 30, planks: 10 },
    buildDays: 14,
    workers: 3,
    cycle: 3,
    outputs: { ore: 4 },
    gathers: 'ore',
    tier: 2,
  }),
  smithy: def({
    type: 'smithy',
    name: 'Blacksmith',
    desc: 'Forges iron and timber into tools.',
    category: 'industry',
    cost: { stone: 20, planks: 15 },
    buildDays: 12,
    workers: 2,
    cycle: 5,
    inputs: { iron: 1, wood: 1 },
    outputs: { tools: 2 },
    tier: 2,
  }),
  claypit: def({
    type: 'claypit',
    name: 'Clay Pit',
    desc: 'Digs clay from a riverbank or lakeshore. Must be built beside water.',
    category: 'resources',
    cost: { wood: 15 },
    workers: 2,
    cycle: 2,
    outputs: { clay: 4 },
    gathers: 'water',
    tier: 1,
  }),
  sandpit: def({
    type: 'sandpit',
    name: 'Sand Pit',
    desc: 'Digs and sieves sand from a riverbank or lakeshore. Must be built beside water.',
    category: 'resources',
    cost: { wood: 15 },
    workers: 2,
    cycle: 2,
    outputs: { sand: 4 },
    gathers: 'water',
    tier: 1,
  }),
  limekiln: def({
    type: 'limekiln',
    name: 'Lime Kiln',
    desc: 'Burns stone into quicklime over a wood fire and slakes it with sand into mortar.',
    category: 'industry',
    cost: { stone: 20, wood: 10 },
    workers: 2,
    cycle: 3,
    inputs: { stone: 2, sand: 1, firewood: 1 },
    outputs: { mortar: 2 },
    tier: 1,
  }),
  collier: def({
    type: 'collier',
    name: 'Charcoal Burner',
    desc: 'Stacks timber into clamps, covers them with turf and lets them smoulder for days into charcoal.',
    category: 'industry',
    cost: { wood: 20 },
    workers: 2,
    cycle: 4,
    inputs: { wood: 4 },
    outputs: { charcoal: 3 },
    tier: 1,
  }),
  glassworks: def({
    type: 'glassworks',
    name: 'Glassworks',
    desc: 'A furnace roaring on charcoal melts sand into glass, blown and spread into panes. With dyes, the glaziers colour it and lead it into stained glass.',
    category: 'industry',
    cost: { stone: 25, planks: 10, gold: 40 },
    buildDays: 14,
    workers: 2,
    cycle: 5,
    inputs: { sand: 3, charcoal: 2 },
    outputs: { glass: 1 },
    tier: 2,
    recipes: [
      { id: 'glass', name: 'Glass', inputs: { sand: 3, charcoal: 2 }, outputs: { glass: 1 } },
      { id: 'stainedglass', name: 'Stained glass', inputs: { glass: 2, dyes: 1 }, outputs: { stainedglass: 1 } },
    ],
  }),
  dyer: def({
    type: 'dyer',
    name: "Dyer's Workshop",
    desc: 'Woad leaves steeped and fermented in great vats give a fast blue dye.',
    category: 'industry',
    cost: { wood: 15, planks: 10 },
    workers: 2,
    cycle: 3,
    inputs: { woad: 3, firewood: 1 },
    outputs: { dyes: 2 },
    tier: 2,
  }),
  kiln: def({
    type: 'kiln',
    name: 'Tile Kiln',
    desc: 'Fires clay into roof tiles over a firewood blaze. The kiln is fired in batches: workers come once clay for three firings is waiting. Townhouses are roofed with tiles.',
    category: 'industry',
    cost: { wood: 15, stone: 8 },
    workers: 2,
    cycle: 3,
    inputs: { clay: 4, firewood: 2 },
    outputs: { tiles: 4 },
    batch: 3,
    tier: 1,
  }),
  stonemason: def({
    type: 'stonemason',
    name: "Stonemason's Yard",
    desc: 'Squares rough stone into dressed blocks for manors, churches and statues.',
    category: 'industry',
    cost: { wood: 20, stone: 4 },
    workers: 2,
    cycle: 3,
    inputs: { stone: 3 },
    outputs: { dressedstone: 2 },
    tier: 1,
  }),
  carpenter: def({
    type: 'carpenter',
    name: "Carpenter's Workshop",
    desc: 'Shapes planks into wood parts: gears, axles and frames for mills and machines.',
    category: 'industry',
    cost: { wood: 15, planks: 10 },
    workers: 2,
    cycle: 3,
    inputs: { planks: 3 },
    outputs: { woodparts: 2 },
    tier: 1,
  }),
  bloomery: def({
    type: 'bloomery',
    name: 'Bloomery',
    desc: 'Smelts bog iron into iron in a clay furnace fed with firewood, lit once there is ore for two smeltings.',
    category: 'industry',
    cost: { stone: 20, wood: 10 },
    workers: 2,
    cycle: 3,
    inputs: { ore: 2, firewood: 2 },
    outputs: { iron: 2 },
    batch: 2,
    tier: 2,
  }),
  cooper: def({
    type: 'cooper',
    name: "Cooper's Workshop",
    desc: 'Nails planks into crates. The winery packs its wine in them, and merchants carry ten more goods away for every crate in store, up to half as much again.',
    category: 'industry',
    cost: { wood: 15, planks: 10 },
    buildDays: 10,
    workers: 2,
    cycle: 3,
    inputs: { planks: 2 },
    outputs: { crates: 3 },
    tier: 1,
  }),
  potter: def({
    type: 'potter',
    name: "Potter's Workshop",
    desc: 'Throws clay on the wheel and fires it with a glaze: fine pottery, a luxury for the finest homes.',
    category: 'industry',
    cost: { wood: 15, stone: 8, gold: 30 },
    buildDays: 12,
    workers: 2,
    cycle: 4,
    inputs: { clay: 3, firewood: 1 },
    outputs: { pottery: 2 },
    tier: 2,
  }),
  jeweller: def({
    type: 'jeweller',
    name: "Jeweller's Shop",
    desc: 'Goldsmiths work silver into rings and brooches: the finest luxury, and the lord gains prestige from their fame.',
    category: 'industry',
    cost: { dressedstone: 15, planks: 10, gold: 80 },
    buildDays: 14,
    workers: 1,
    cycle: 5,
    inputs: { silver: 2 },
    outputs: { jewellery: 1 },
    tier: 2,
    charter: 'metal3a',
  }),
  winery: def({
    type: 'winery',
    name: 'Winery',
    desc: 'Treads and presses grapes and ages the wine in casks: a luxury for Townhouses and a drink for the taverns.',
    category: 'food',
    cost: { stone: 20, planks: 15, woodparts: 4 },
    buildDays: 14,
    workers: 2,
    cycle: 4,
    inputs: { grapes: 4, crates: 1 },
    outputs: { wine: 3 },
    tier: 2,
    charter: 'orchard3a',
  }),
  scriptorium: def({
    type: 'scriptorium',
    name: 'Scriptorium',
    desc: 'Monks press flax into paper, and copy and bind books with leather covers. Books are a luxury and a fine export, and the scribes add to the town’s knowledge.',
    category: 'civic',
    cost: { dressedstone: 15, planks: 15, gold: 30 },
    buildDays: 16,
    workers: 2,
    cycle: 4,
    inputs: { flax: 2 },
    outputs: { paper: 3 },
    tier: 2,
    charter: 'learning1',
    recipes: [
      { id: 'paper', name: 'Paper', inputs: { flax: 2 }, outputs: { paper: 3 } },
      { id: 'books', name: 'Books', inputs: { paper: 3, leather: 1 }, outputs: { books: 1 } },
    ],
  }),
  armoury: def({
    type: 'armoury',
    name: 'Armoury',
    desc: "The lord's armourer fits out the guard: the retinue and the watchmen wear his armour. Needed to raise a retinue.",
    category: 'manor',
    cost: { stone: 25, planks: 15 },
    buildDays: 14,
    workers: 1,
    tier: 2,
  }),
  well: def({
    type: 'well',
    name: 'Well',
    desc: 'Fresh water makes nearby households happier.',
    category: 'civic',
    w: 1,
    h: 1,
    cost: { wood: 12 },
    buildDays: 5,
    radius: 16,
  }),
  storehouse: def({
    type: 'storehouse',
    name: 'Storehouse',
    desc: 'Stores 300 materials and goods: timber, stone, planks, wool, cloth, tools and the like. Its haulers fetch them from the workplaces, so the workers there need not walk to storage.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { wood: 30 },
    buildDays: 12,
    workers: 2,
  }),
  granary: def({
    type: 'granary',
    name: 'Granary',
    desc: 'A square granary raised on stones, shut tight against rats and damp. Stores 300 food and grain: bread, meat, fish, fruit, cheese, wheat, barley, flour. Its haulers fetch food from the workplaces, so the workers there need not walk to storage.',
    category: 'civic',
    w: 2,
    h: 2,
    cost: { wood: 30 },
    buildDays: 12,
    workers: 2,
  }),
  silo: def({
    type: 'silo',
    name: 'Silo',
    desc: `A tall round store that keeps 500 wheat and barley dry for years. Harvested grain goes here first and the granaries stay free for other food. It needs no keepers.`,
    category: 'farming',
    w: 2,
    h: 2,
    cost: { wood: 20, stone: 15 },
    buildDays: 12,
    workers: 0,
    tier: 1,
  }),
  tavern: def({
    type: 'tavern',
    name: 'Alehouse',
    desc: 'A plain room with a fire, benches and a barrel of ale. Homes nearby are happier and Timber Houses need one. Each month it pours a cask for every eight villagers it serves. It can be enlarged into a Tavern, with twice the reach.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { wood: 15, planks: 4 },
    buildDays: 8,
    workers: 1,
    radius: 10,
    tier: 1,
  }),
  market: def({
    type: 'market',
    name: 'Marketplace',
    desc: 'A square for stalls, free to lay out: click one corner, then the other. A vendor for each stall stocks it from the storehouse and granary, and each open stall serves ten households with their goods, the nearest homes first. Food comes from the stores either way.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: {},
    buildDays: 0,
    workers: 2,
    // No reach: its stalls serve the nearest homes, as many as they can (see marketServed).
    radius: 0,
    tier: 0,
    zone: { owner: 'market', min: 2, max: 8 },
  }),
  dock: def({
    type: 'dock',
    name: 'Dock',
    desc: 'A quay where boats tie up: give it import and export orders as at a trading post, but boats carry more each month, bring goods in cheaper and pay more for what they take. Must be built on the water\'s edge.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { planks: 30, wood: 20, stone: 10 },
    buildDays: 18,
    workers: 3,
    tier: 1,
  }),
  university: def({
    type: 'university',
    name: 'University',
    desc: 'Masters and scholars in a cloistered college. Fed two books a month, it brings prestige and much knowledge, and its learning makes every workshop and farm in town a little more productive (+5%). One per town.',
    category: 'works',
    w: 4,
    h: 4,
    cost: { dressedstone: 60, planks: 40, tiles: 30, books: 10, gold: 500 },
    buildDays: 60,
    workers: 3,
    tier: 3,
  }),
  markethall: def({
    type: 'markethall',
    name: 'Covered Market Hall',
    desc: 'A great hall on stone arches: ten stalls under one roof in a small space, each serving ten households like the stalls of an open market.',
    category: 'works',
    w: 4,
    h: 3,
    cost: { dressedstone: 30, planks: 25, tiles: 20, gold: 250 },
    buildDays: 30,
    workers: 10,
    tier: 2,
  }),
  tradingpost: def({
    type: 'tradingpost',
    name: 'Trading Post',
    desc: 'Where the outside world comes to trade: give it orders to import goods up to a target or export them down to one, and the merchants work through them each month. Animals for the pastures are bought here too.',
    category: 'civic',
    w: 3,
    h: 2,
    cost: { wood: 30, planks: 10 },
    buildDays: 14,
    workers: 2,
    tier: 1,
  }),
  church: def({
    type: 'church',
    name: 'Church',
    desc: 'A place of worship, first raised in timber. Greatly raises happiness in a wide area, and the priest teaches the children their letters (knowledge). Once the settlement is a Town it can be rebuilt in stone, which brings more prestige and knowledge.',
    category: 'civic',
    w: 3,
    h: 4,
    cost: { wood: 40, planks: 20, gold: 40 },
    buildDays: 20,
    workers: 1,
    radius: 16,
    tier: 2,
  }),
  monastery: def({
    type: 'monastery',
    name: 'Monastery',
    desc: 'Monks at prayer and study round a quiet cloister. Each month they read a book, bought from merchants if the town copies none, and in return teach (knowledge), bring the lord a little prestige and comfort the whole town.',
    category: 'civic',
    w: 4,
    h: 4,
    cost: { stone: 40, planks: 30, tiles: 20, gold: 120 },
    buildDays: 30,
    workers: 2,
    tier: 2,
  }),
  cathedral: def({
    type: 'cathedral',
    name: 'Cathedral',
    desc: 'The great work of a lifetime: twin towers, a spire and glass. Serves as a church far and wide, cheers the whole town and brings prestige every month. One per town.',
    category: 'works',
    w: 5,
    h: 6,
    cost: { dressedstone: 180, stone: 120, planks: 100, tiles: 60, tools: 25, gold: 1500 },
    buildDays: 240,
    workers: 2,
    radius: 26,
    tier: 3,
  }),
  wall: def({
    type: 'wall',
    name: 'Town Wall',
    desc: "Stone walls laid section by section like a road (click, click), once the lord has a Stone Manor. Where they cross a road a gate tower rises. Walls bring prestige, and a long circuit makes the town feel safe and keeps wolves and bandits out.",
    category: 'manor',
    w: 1,
    h: 1,
    cost: { stone: 4, dressedstone: 2 },
    buildDays: 3,
    workers: 0,
    radius: 0,
  }),
  watchtower: def({
    type: 'watchtower',
    name: 'Watch Tower',
    desc: "A stone tower where a watchman keeps an eye on the roads, once the lord has a Stone Manor. With a watch kept, wolves and bandits are seen coming and turned away; homes nearby feel safer, and it brings a little prestige.",
    category: 'manor',
    w: 1,
    h: 1,
    cost: { stone: 20, planks: 10, gold: 40 },
    buildDays: 12,
    workers: 1,
    radius: 10,
  }),
  stable: def({
    type: 'stable',
    name: "Lord's Stable",
    desc: "Stalls, a tack room and a paddock for the lord's horses, once the manor is a Manor House. With a groom at work the lord rides out through the town on horseback. It brings a little prestige. One per town.",
    category: 'manor',
    w: 3,
    h: 2,
    cost: { wood: 40, planks: 20, gold: 120 },
    buildDays: 16,
    workers: 1,
  }),
  draughtstable: def({
    type: 'draughtstable',
    name: 'Draught Stable',
    desc: "Stalls for four draught animals: a pack horse for each trading post, an ox for each builder's yard. Each eats a measure of grain a month.",
    category: 'civic',
    w: 3,
    h: 2,
    cost: { wood: 30, planks: 15 },
    buildDays: 12,
    workers: 0,
  }),
  builderyard: def({
    type: 'builderyard',
    name: "Builder's Yard",
    desc: 'Timber, scaffolding and an ox cart. With its ox, building sites within reach get their materials and rise half as fast again; the cart wears through about a wood part a month.',
    category: 'civic',
    w: 2,
    h: 2,
    cost: { wood: 30, planks: 15, stone: 10 },
    buildDays: 12,
    workers: 2,
    radius: 12,
  }),
  garden: def({
    type: 'garden',
    name: 'Flower Garden',
    desc: 'A small garden with flowers and a bench. Homes nearby are more cheerful.',
    category: 'decor',
    w: 1,
    h: 1,
    cost: { wood: 5, gold: 25 },
    buildDays: 4,
    radius: 5,
    beauty: 3,
  }),
  publicgarden: def({
    type: 'publicgarden',
    name: 'Public Garden',
    desc: 'A large green for everyone: lawns, flower beds, shade trees and benches round a pond. Makes a wide area lovelier.',
    category: 'decor',
    w: 3,
    h: 3,
    cost: { wood: 10, stone: 10, gold: 120 },
    buildDays: 10,
    radius: 10,
    beauty: 4,
    tier: 1,
  }),
  hedge: def({
    type: 'hedge',
    name: 'Clipped Hedge',
    desc: 'A clipped box hedge, laid along a line like a road: hedges side by side grow into one row, with a topiary ball at each end. Mostly for looks: a touch lovelier right beside it.',
    category: 'decor',
    w: 1,
    h: 1,
    cost: { gold: 3 },
    buildDays: 1,
    radius: 2,
    beauty: 1,
  }),
  flowerbed: def({
    type: 'flowerbed',
    name: 'Flower Bed',
    desc: 'A bed of flowers, laid along a line like a road: the beds you lay in one go grow into a single bed. Mostly for looks: a touch lovelier right beside it.',
    category: 'decor',
    w: 1,
    h: 1,
    cost: { gold: 4 },
    buildDays: 1,
    radius: 2,
    beauty: 1,
  }),
  shrine: def({
    type: 'shrine',
    name: 'Wayside Shrine',
    desc: 'A little roofed shrine with a saint and a candle. Mostly for looks: a touch lovelier nearby.',
    category: 'decor',
    w: 1,
    h: 1,
    cost: { wood: 2, stone: 2, gold: 6 },
    buildDays: 2,
    radius: 2,
    beauty: 1,
  }),
  fountain: def({
    type: 'fountain',
    name: 'Stone Fountain',
    desc: 'A small stone basin with a spout. Mostly for looks: a touch lovelier nearby.',
    category: 'decor',
    w: 1,
    h: 1,
    cost: { stone: 6, gold: 15 },
    buildDays: 3,
    radius: 3,
    beauty: 1,
  }),
  manorgarden: def({
    type: 'manorgarden',
    name: 'Manor Garden',
    desc: "The lord's pleasure garden, once the Stone Manor stands: clipped hedges, flower beds, a fountain and a pavilion. It costs a fortune in coin, makes a wide area lovelier and brings prestige every month. One per town.",
    category: 'manor',
    w: 10,
    h: 10,
    cost: { stone: 60, planks: 30, gold: 900 },
    buildDays: 40,
    radius: 16,
    beauty: 6,
  }),
  maypole: def({
    type: 'maypole',
    name: 'Maypole',
    desc: 'A festive pole with ribbons where villagers dance. Lifts spirits in a wide area.',
    category: 'decor',
    w: 2,
    h: 2,
    cost: { wood: 15, gold: 60 },
    buildDays: 6,
    radius: 8,
    beauty: 5,
    tier: 1,
  }),
  belltower: def({
    type: 'belltower',
    name: 'Bell Tower',
    desc: 'A tall stone tower whose bells ring the hours across the town. Beautifies a wide area and brings prestige every month. One per town.',
    category: 'works',
    w: 2,
    h: 2,
    cost: { stone: 60, dressedstone: 40, planks: 20, gold: 1200 },
    buildDays: 60,
    radius: 18,
    beauty: 8,
    tier: 3,
  }),
  guildhall: def({
    type: 'guildhall',
    name: 'Guildhall',
    desc: "The merchants' and craftsmen's grand hall. Merchants pay a fifth more for what you sell, the whole town takes pride in it, and it brings prestige every month. One per town.",
    category: 'works',
    w: 4,
    h: 4,
    cost: { dressedstone: 100, planks: 80, tiles: 40, tools: 15, gold: 4000 },
    buildDays: 120,
    workers: 2,
    tier: 4,
  }),
  statue: def({
    type: 'statue',
    name: 'Lord\'s Statue',
    desc: 'A proud stone statue in your honour. Greatly beautifies the town.',
    category: 'works',
    w: 2,
    h: 2,
    cost: { dressedstone: 20, tools: 2, gold: 150 },
    buildDays: 15,
    radius: 10,
    beauty: 8,
    tier: 2,
  }),
};

/**
 * Workplaces that make things take half as many hands again as their
 * drawings say, each making that much less: a full crew makes the same, but
 * labour is something to plan, not a surplus to park.
 */
export const CREW_FACTOR = 1.5;
for (const d of Object.values(BUILDINGS)) {
  if (d.cycle > 0 && d.workers > 0) d.workers = Math.ceil(d.workers * CREW_FACTOR);
}

/** Most beauty a home can enjoy from decorations. */
export const MAX_BEAUTY = 12;

export const BUILD_ORDER: BuildingType[] = [
  'house',
  'woodcutter',
  'forester',
  'quarry',
  'mine',
  'claypit',
  'sandpit',
  'forager',
  'hunter',
  'fisher',
  'farm',
  'field',
  'byre',
  'pasture',
  'orchardist',
  'orchard',
  'windmill',
  'watermill',
  'bakery',
  'brewhouse',
  'dairy',
  'winery',
  'sawmill',
  'collier',
  'tanner',
  'weaver',
  'dyer',
  'tailor',
  'carpenter',
  'cooper',
  'potter',
  'stonemason',
  'limekiln',
  'glassworks',
  'kiln',
  'bloomery',
  'smithy',
  'armoury',
  'jeweller',
  'well',
  'storehouse',
  'granary',
  'silo',
  'market',
  'tradingpost',
  'dock',
  'draughtstable',
  'builderyard',
  'tavern',
  'apothecary',
  'scriptorium',
  'church',
  'monastery',
  'garden',
  'flowerbed',
  'hedge',
  'shrine',
  'fountain',
  'publicgarden',
  'maypole',
  'townhall',
  'stable',
  'watchtower',
  'wall',
  'manorgarden',
  'statue',
  'belltower',
  'markethall',
  'cathedral',
  'university',
  'guildhall',
];

/**
 * Tools and wood parts a workplace wears out in a month with a full crew, by
 * how much gear its work takes: axes, picks and saws for the rough trades,
 * gears and presses for the mills, carts and boats for the traders. Simple
 * crafts (baking, dairying, brewing in a copper) need none.
 */
export const UPKEEP: Partial<Record<BuildingType, Partial<Record<'tools' | 'woodparts', number>>>> = {
  woodcutter: { tools: 0.15 },
  forester: { tools: 0.05 },
  quarry: { tools: 0.2 },
  mine: { tools: 0.25 },
  claypit: { tools: 0.05 },
  sandpit: { tools: 0.05 },
  limekiln: { tools: 0.05 },
  collier: { tools: 0.05 },
  glassworks: { tools: 0.1 },
  dyer: { woodparts: 0.05 },
  farm: { tools: 0.1 },
  orchardist: { tools: 0.05 },
  windmill: { woodparts: 0.25 },
  watermill: { woodparts: 0.3 },
  brewhouse: { woodparts: 0.05 },
  winery: { woodparts: 0.15 },
  sawmill: { tools: 0.15 },
  carpenter: { tools: 0.1 },
  cooper: { tools: 0.1 },
  stonemason: { tools: 0.2 },
  kiln: { tools: 0.05 },
  bloomery: { tools: 0.1 },
  smithy: { tools: 0.1 },
  armoury: { tools: 0.15 },
  jeweller: { tools: 0.1 },
  potter: { woodparts: 0.1 },
  tanner: { tools: 0.05 },
  weaver: { woodparts: 0.1 },
  tailor: { tools: 0.05 },
  tradingpost: { woodparts: 0.1 },
  dock: { woodparts: 0.2 },
};

export const CATEGORY_NAMES: Record<Category, string> = {
  housing: 'Housing',
  resources: 'Resources',
  farming: 'Farming',
  food: 'Food',
  industry: 'Industry',
  civic: 'Civic',
  manor: 'Manor',
  works: 'Great Works',
  decor: 'Decor',
};


export const TIERS = [
  { name: 'Hamlet', pop: 0, desc: 'A handful of families clearing the land.' },
  { name: 'Village', pop: 20, desc: 'Homes may become Timber Houses and the manor may grow into a Manor House.' },
  { name: 'Town', pop: 45, desc: 'Homes may become Townhouses, the manor a Stone Manor, and town charters may be granted.' },
  { name: 'Borough', pop: 90, desc: 'Your lands prosper, and the lord may keep a retinue.' },
  { name: 'City', pop: 150, desc: 'Songs are sung of your town across the realm.' },
];

export const TAX_LEVELS = [
  { name: 'None', perHead: 0, happiness: 10 },
  { name: 'Low', perHead: 0.25, happiness: 4 },
  { name: 'Normal', perHead: 0.5, happiness: 0 },
  { name: 'High', perHead: 0.8, happiness: -14 },
];


/** Prices in coins for one unit at the market (sell price is lower). */
export const TRADE_PRICES: Partial<Record<ResourceId, number>> = Object.fromEntries(
  RESOURCE_IDS.filter((r) => GOODS[r].price > 0).map((r) => [r, GOODS[r].price]),
);
/**
 * Trade is dear: goods brought in cost half again their price, while the
 * town sells at well under it, so buying costs over three times what selling
 * the same goods earns.
 */
export const IMPORT_FACTOR = 1.5;
export const SELL_FACTOR = 0.4;
/** Merchants pay a little better for regular exports. */
export const EXPORT_FACTOR = 0.48;
/** Units one marketplace's merchants buy per month. */
export const EXPORT_PER_MARKET = 60;
/** Units one dock's boats carry off each month. */
export const EXPORT_PER_DOCK = 100;
