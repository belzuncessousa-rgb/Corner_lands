import type { BuildingType, Category, Cost, FoodGroup, GoodsGroup, ResourceId } from './types';
import { RESOURCE_IDS } from './types';

/** Real seconds per game day at 1x speed: a year lasts 45 minutes. */
export const DAY_SECONDS = 22.5;

/** Walking speed in tiles per game day: paved roads, dirt roads, open country. */
export const STONE_ROAD_TILES_PER_DAY = 30;
export const ROAD_TILES_PER_DAY = 22;
export const OFFROAD_TILES_PER_DAY = 12;
/** Units of goods a villager carries in one trip. */
export const CARRY_LOAD = 5;
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
  /** Default amount kept in store before workers rest and merchants buy. */
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
  firewood: good('Firewood', 'materials', 2, 'Split logs. Keeps homes warm in winter at half the timber.'),
  planks: good('Planks', 'materials', 5, 'Sawn boards for finer buildings.', { keep: 100 }),
  woodparts: good('Wood Parts', 'materials', 9, 'Gears, axles and frames for mills and machines.', { keep: 40 }),
  stone: good('Stone', 'materials', 3, 'Quarried stone for sturdier buildings.'),
  dressedstone: good('Dressed Stone', 'materials', 8, 'Squared blocks for manors, churches and keeps.', { keep: 80 }),
  clay: good('Clay', 'materials', 1, 'Dug from riverbanks, fired into tiles.'),
  tiles: good('Roof Tiles', 'materials', 6, 'Fired clay tiles. Townhouses want a tiled roof.', { keep: 80 }),
  ore: good('Iron Ore', 'materials', 3, 'Rock rich in iron, smelted in a bloomery.'),
  iron: good('Iron', 'materials', 6, 'Iron for the blacksmith.', { keep: 60 }),

  bread: good('Bread', 'food', 3, 'Baked from flour. Filling: feeds one and a half.', { food: 1.5, foodGroup: 'grain' }),
  meat: good('Meat', 'food', 3, 'Venison and beef.', { food: 1, foodGroup: 'meat' }),
  pork: good('Pork', 'food', 3, 'Salted pork from the autumn slaughter.', { food: 1, foodGroup: 'meat' }),
  fish: good('Fish', 'food', 3, 'Caught from rivers and lakes.', { food: 1, foodGroup: 'meat' }),
  eggs: good('Eggs', 'food', 2, 'From backyard hens.', { food: 0.75, foodGroup: 'meat' }),
  berries: good('Berries', 'food', 2, 'Foraged in spring and summer.', { food: 1, foodGroup: 'produce' }),
  mushrooms: good('Mushrooms', 'food', 2, 'Foraged in the autumn woods.', { food: 1, foodGroup: 'produce' }),
  vegetables: good('Vegetables', 'food', 2, 'Cabbages, leeks and turnips from backyard plots.', { food: 1, foodGroup: 'produce' }),
  apples: good('Apples', 'food', 2, 'From orchards; also pressed into cider.', { food: 1, foodGroup: 'produce' }),
  pears: good('Pears', 'food', 2, 'From orchards.', { food: 1, foodGroup: 'produce' }),
  plums: good('Plums', 'food', 2, 'From orchards.', { food: 1, foodGroup: 'produce' }),
  honey: good('Honey', 'food', 5, 'From backyard hives. A treat: feeds one and a half.', { food: 1.5, foodGroup: 'dairy' }),
  milk: good('Milk', 'food', 1, 'From cattle. Spoils quickly; better made into cheese.', { food: 0.5, foodGroup: 'dairy' }),
  cheese: good('Cheese', 'food', 4, 'Made from milk at a dairy. Feeds two.', { food: 2, foodGroup: 'dairy' }),

  grain: good('Wheat', 'goods', 2, 'Harvested in autumn, milled and baked into bread.', { storage: 'food', keep: 300 }),
  barley: good('Barley', 'goods', 2, 'Brewed into ale.', { storage: 'food' }),
  oats: good('Oats', 'goods', 1, 'Winter fodder for large herds.', { storage: 'food' }),
  flour: good('Flour', 'goods', 3, 'Milled wheat, ready for the oven.', { storage: 'food' }),
  flax: good('Flax', 'goods', 2, 'Retted and spun into linen.'),
  wool: good('Wool', 'goods', 3, 'Shorn from sheep in spring.'),
  hides: good('Hides', 'goods', 2, 'Skins from the hunt and the slaughter.'),
  leather: good('Leather', 'goods', 6, 'Tanned hides for boots.'),
  cloth: good('Cloth', 'goods', 7, 'Woven wool and linen.'),
  clothes: good('Clothes', 'goods', 12, 'Tunics and cloaks. Finer homes need them.', { keep: 60 }),
  boots: good('Boots', 'goods', 12, 'Sturdy leather boots. Townhouses need them.', { keep: 60 }),
  ale: good('Ale', 'goods', 5, 'Brewed from barley and poured at the tavern.', { keep: 100 }),
  cider: good('Cider', 'goods', 5, 'Pressed from apples.', { keep: 100 }),
  herbs: good('Herbs', 'goods', 2, 'Gathered wild, made into medicine.'),
  medicine: good('Medicine', 'goods', 10, 'Salves and tinctures. Townhouses want them.', { keep: 40 }),
  tools: good('Tools', 'goods', 14, 'Needed for upgrades and grand buildings.', { keep: 40 }),

  gold: good('Coins', 'currency', 0, 'Collected from taxes and trade.'),
  prestige: good('Prestige', 'currency', 0, 'The renown of your house. Earned from a fine manor and a thriving town; spent on charters.'),
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
  townhall: { materials: 120, food: 100 },
  storehouse: { materials: 250 },
  granary: { food: 250 },
};

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
  townhall: def({
    type: 'townhall',
    name: 'Manor Hall',
    desc: 'The heart of your settlement. Stores goods and shelters the first settlers.',
    category: 'civic',
    w: 3,
    h: 3,
    housing: 8,
    buildable: false,
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
    desc: 'Fells nearby trees for timber.',
    category: 'resources',
    cost: { wood: 10 },
    workers: 2,
    radius: 7,
    cycle: 2,
    outputs: { wood: 4 },
    gathers: 'trees',
    hotkey: 'e',
  }),
  forester: def({
    type: 'forester',
    name: "Forester's Hut",
    desc: 'Plants new trees nearby so the forest never runs out.',
    category: 'resources',
    cost: { wood: 15 },
    workers: 1,
    radius: 6,
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
    radius: 5,
    cycle: 3,
    outputs: { stone: 3 },
    gathers: 'rock',
    hotkey: 'q',
  }),
  forager: def({
    type: 'forager',
    name: "Forager's Hut",
    desc: 'Gathers berries from wild bushes in spring and summer, mushrooms in the autumn woods, and wild herbs. Rests in deep winter.',
    category: 'food',
    cost: { wood: 10 },
    workers: 2,
    radius: 7,
    cycle: 2,
    outputs: { berries: 5 },
    gathers: 'berries',
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    recipes: [
      { id: 'berries', name: 'Berries', inputs: {}, outputs: { berries: 5 }, months: [0, 1, 2, 3, 4, 5, 6, 7] },
      { id: 'mushrooms', name: 'Mushrooms', inputs: {}, outputs: { mushrooms: 4 }, months: [6, 7, 8, 9] },
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
    radius: 8,
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
    radius: 4,
    cycle: 3,
    outputs: { fish: 5 },
    gathers: 'water',
  }),
  farm: def({
    type: 'farm',
    name: 'Farmstead',
    desc: 'Sow in spring, tend in summer, harvest grain in autumn. Fertile soil yields more.',
    category: 'food',
    w: 4,
    h: 4,
    cost: { wood: 25 },
    buildDays: 12,
    workers: 3,
    tier: 1,
    months: [0, 1, 2, 3, 4, 5, 7],
  }),
  bakery: def({
    type: 'bakery',
    name: 'Bakery',
    desc: 'Bakes grain into bread.',
    category: 'food',
    cost: { wood: 15, stone: 10 },
    workers: 2,
    cycle: 2,
    inputs: { grain: 2 },
    outputs: { bread: 4 },
    tier: 1,
  }),
  sawmill: def({
    type: 'sawmill',
    name: 'Sawpit',
    desc: 'Saws timber into planks.',
    category: 'industry',
    cost: { wood: 20, stone: 5 },
    workers: 2,
    cycle: 2,
    inputs: { wood: 3 },
    outputs: { planks: 2 },
    tier: 1,
  }),
  mine: def({
    type: 'mine',
    name: 'Iron Mine',
    desc: 'Digs iron ore from nearby deposits.',
    category: 'industry',
    cost: { wood: 25, planks: 10, gold: 30 },
    buildDays: 14,
    workers: 3,
    radius: 4,
    cycle: 3,
    outputs: { iron: 1 },
    gathers: 'ore',
    tier: 2,
  }),
  smithy: def({
    type: 'smithy',
    name: 'Blacksmith',
    desc: 'Forges iron and timber into tools.',
    category: 'industry',
    cost: { stone: 20, planks: 15, gold: 30 },
    buildDays: 12,
    workers: 2,
    cycle: 4,
    inputs: { iron: 1, wood: 1 },
    outputs: { tools: 1 },
    tier: 2,
  }),
  well: def({
    type: 'well',
    name: 'Well',
    desc: 'Fresh water makes nearby households happier.',
    category: 'civic',
    w: 1,
    h: 1,
    cost: { stone: 10 },
    buildDays: 5,
    radius: 7,
  }),
  storehouse: def({
    type: 'storehouse',
    name: 'Storehouse',
    desc: 'Stores 250 building materials: timber, stone, planks, iron and tools.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { wood: 30 },
    buildDays: 12,
  }),
  granary: def({
    type: 'granary',
    name: 'Granary',
    desc: 'Stores 250 food: berries, meat, fish, grain and bread.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { wood: 30 },
    buildDays: 12,
  }),
  tavern: def({
    type: 'tavern',
    name: 'Tavern',
    desc: 'Ale and good company. Homes nearby are happier; Townhouses need one. Pours ale from a little grain each month.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { wood: 25, planks: 10, gold: 20 },
    buildDays: 12,
    workers: 1,
    radius: 10,
    tier: 1,
  }),
  market: def({
    type: 'market',
    name: 'Marketplace',
    desc: 'Households nearby are happier. Enables trading goods for gold.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { planks: 20, stone: 10, gold: 50 },
    buildDays: 14,
    workers: 2,
    radius: 11,
    cycle: 5,
    outputs: { gold: 4 },
    tier: 1,
  }),
  church: def({
    type: 'church',
    name: 'Church',
    desc: 'A place of worship. Greatly raises happiness in a wide area.',
    category: 'civic',
    w: 3,
    h: 4,
    cost: { planks: 40, stone: 50, tools: 5, gold: 100 },
    buildDays: 30,
    workers: 1,
    radius: 16,
    tier: 2,
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
  statue: def({
    type: 'statue',
    name: 'Lord\'s Statue',
    desc: 'A proud stone statue in your honour. Greatly beautifies the town.',
    category: 'decor',
    w: 2,
    h: 2,
    cost: { stone: 30, tools: 2, gold: 150 },
    buildDays: 15,
    radius: 10,
    beauty: 8,
    tier: 2,
  }),
};

/** Most beauty a home can enjoy from decorations. */
export const MAX_BEAUTY = 12;

export const BUILD_ORDER: BuildingType[] = [
  'house',
  'woodcutter',
  'forester',
  'quarry',
  'mine',
  'forager',
  'hunter',
  'fisher',
  'farm',
  'bakery',
  'sawmill',
  'smithy',
  'well',
  'storehouse',
  'granary',
  'market',
  'tavern',
  'church',
  'garden',
  'maypole',
  'statue',
];

export const CATEGORY_NAMES: Record<Category, string> = {
  housing: 'Housing',
  resources: 'Resources',
  food: 'Food',
  industry: 'Industry',
  civic: 'Civic',
  decor: 'Decor',
};


export const TIERS = [
  { name: 'Hamlet', pop: 0, desc: 'A handful of families clearing the land.' },
  { name: 'Village', pop: 20, desc: 'Unlocks farms, bakeries, sawpits, markets, taverns, Timber Houses and workshop expansions.' },
  { name: 'Town', pop: 45, desc: 'Unlocks mines, blacksmiths, churches and Townhouses.' },
  { name: 'Borough', pop: 90, desc: 'Your lands prosper. A true seat of a lord!' },
];

export const TAX_LEVELS = [
  { name: 'None', perHead: 0, happiness: 10 },
  { name: 'Low', perHead: 0.5, happiness: 4 },
  { name: 'Normal', perHead: 1, happiness: 0 },
  { name: 'High', perHead: 1.6, happiness: -14 },
];


/** Prices in coins for one unit at the market (sell price is lower). */
export const TRADE_PRICES: Partial<Record<ResourceId, number>> = Object.fromEntries(
  RESOURCE_IDS.filter((r) => GOODS[r].price > 0).map((r) => [r, GOODS[r].price]),
);
export const SELL_FACTOR = 0.5;
/** Merchants pay a little better for regular exports. */
export const EXPORT_FACTOR = 0.6;
/** Units one marketplace's merchants buy per month. */
export const EXPORT_PER_MARKET = 60;
