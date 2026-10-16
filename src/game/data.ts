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
  firewood: good('Firewood', 'materials', 2, 'Split logs. Homes burn one bundle a winter month instead of two logs of timber.', { keep: 100 }),
  planks: good('Planks', 'materials', 5, 'Sawn boards for finer buildings.', { keep: 100 }),
  woodparts: good('Wood Parts', 'materials', 9, 'Gears, axles and frames for mills and machines.', { keep: 20 }),
  stone: good('Stone', 'materials', 3, 'Quarried stone for sturdier buildings.'),
  dressedstone: good('Dressed Stone', 'materials', 8, 'Squared blocks for manors, churches and keeps.', { keep: 80 }),
  clay: good('Clay', 'materials', 1, 'Dug from riverbanks, fired into tiles.'),
  tiles: good('Roof Tiles', 'materials', 6, 'Fired clay tiles. Townhouses want a tiled roof.', { keep: 80 }),
  ore: good('Iron Ore', 'materials', 3, 'Rock rich in iron, smelted in a bloomery.'),
  iron: good('Iron', 'materials', 6, 'Iron for the blacksmith.', { keep: 60 }),
  silver: good('Silver', 'materials', 15, 'Precious ore turned up by deep miners, for the jeweller.', { keep: 40 }),

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
  grapes: good('Grapes', 'food', 3, 'From vines planted in orchards; pressed into wine.', { food: 1, foodGroup: 'produce' }),
  honey: good('Honey', 'food', 5, 'From backyard hives. A treat: feeds one and a half.', { food: 1.5, foodGroup: 'dairy' }),
  milk: good('Milk', 'food', 1, 'From cattle. Spoils quickly; better made into cheese.', { food: 0.5, foodGroup: 'dairy' }),
  cheese: good('Cheese', 'food', 4, 'Made from milk at a dairy. Feeds two.', { food: 2, foodGroup: 'dairy' }),

  grain: good('Wheat', 'goods', 2, 'Harvested in autumn, milled and baked into bread.', { storage: 'food', keep: 300 }),
  barley: good('Barley', 'goods', 2, 'Brewed into ale.', { storage: 'food' }),
  oats: good('Oats', 'goods', 1, 'Winter fodder for large herds.', { storage: 'food' }),
  flour: good('Flour', 'goods', 3, 'Milled wheat, ready for the oven.', { storage: 'food' }),
  flax: good('Flax', 'goods', 2, 'Retted and spun into linen.'),
  wool: good('Wool', 'goods', 3, 'Shorn from sheep in spring.'),
  hides: good('Hides', 'goods', 2, 'Skins from the hunt and the slaughter, for the tanner.', { keep: 60 }),
  leather: good('Leather', 'goods', 6, 'Tanned hides for boots.'),
  cloth: good('Cloth', 'goods', 7, 'Woven wool and linen.'),
  clothes: good('Clothes', 'goods', 12, 'Tunics and cloaks. Finer homes need them.', { keep: 60 }),
  boots: good('Boots', 'goods', 12, 'Sturdy leather boots. Townhouses need them.', { keep: 60 }),
  ale: good('Ale', 'goods', 5, 'Brewed from barley and poured at the tavern.', { keep: 100 }),
  cider: good('Cider', 'goods', 5, 'Pressed from apples.', { keep: 100 }),
  mead: good('Mead', 'goods', 10, 'Honey wine from the brewhouse (Meadmakers). Taverns pour it, and Townhouses count it a luxury.', { keep: 60 }),
  wine: good('Wine', 'goods', 12, 'From the winery. Taverns pour it, and Townhouses count it a luxury.', { keep: 60 }),
  herbs: good('Herbs', 'goods', 2, 'Gathered wild, made into medicine.'),
  medicine: good('Medicine', 'goods', 10, 'Salves and tinctures. Townhouses want them.', { keep: 40 }),
  tools: good('Tools', 'goods', 14, 'Needed for upgrades and grand buildings.', { keep: 40 }),
  paper: good('Paper', 'goods', 6, 'Pressed from flax at the scriptorium.', { keep: 40 }),
  books: good('Books', 'goods', 40, 'Copied and bound at the scriptorium. A luxury for Townhouses; universities need them.', { keep: 20 }),
  jewellery: good('Jewellery', 'goods', 60, 'Rings and brooches of silver. The finest luxury.', { keep: 20 }),
  weapons: good('Arms', 'goods', 20, "Bows, pikes and armour. The castle's garrison needs them; merchants pay well.", { keep: 30 }),

  gold: good('Coins', 'currency', 0, 'Collected from taxes and trade.'),
  prestige: good('Prestige', 'currency', 0, 'The renown of your house. Earned from a fine manor and a thriving town; spent on charters, titles (Baron, Earl, Duke) and works of art.'),
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
  townhall: { materials: 150, food: 120 },
  storehouse: { materials: 300 },
  granary: { food: 300 },
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
    desc: 'Fells nearby trees for timber, or splits them into firewood. A household burns one bundle of firewood each winter month, or two logs of timber.',
    category: 'resources',
    cost: { gold: 10 },
    workers: 2,
    radius: 7,
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
    cost: { gold: 15 },
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
    desc: 'Farmers sow the fields you draw nearby in spring, tend them through summer and bring in the harvest in autumn. Three farmers keep about 45 tiles of fields.',
    category: 'farming',
    cost: { wood: 25 },
    buildDays: 12,
    workers: 3,
    tier: 1,
    radius: 12,
    months: [0, 1, 2, 3, 4, 5, 7],
  }),
  field: def({
    type: 'field',
    name: 'Field',
    desc: 'Draw a field near a Farmstead and choose its crop: wheat for bread, barley for ale, oats for fodder or flax for linen. Changing crops each year keeps the soil rich.',
    category: 'farming',
    w: 1,
    h: 1,
    buildDays: 0,
    tier: 1,
    zone: { owner: 'farm', min: 2, max: 10 },
    recipes: [
      { id: 'wheat', name: 'Wheat', inputs: {}, outputs: { grain: 1 } },
      { id: 'barley', name: 'Barley', inputs: {}, outputs: { barley: 1 } },
      { id: 'oats', name: 'Oats', inputs: {}, outputs: { oats: 1 } },
      { id: 'flax', name: 'Flax', inputs: {}, outputs: { flax: 1 } },
    ],
  }),
  byre: def({
    type: 'byre',
    name: 'Animal Farm',
    desc: 'Herders keep sheep (wool), cattle (milk, beef, hides) or pigs (pork) on the pastures you fence nearby. Herds grow each spring and the surplus is slaughtered in autumn.',
    category: 'farming',
    cost: { wood: 25, gold: 40 },
    buildDays: 12,
    workers: 2,
    tier: 1,
    radius: 12,
    recipes: [
      { id: 'sheep', name: 'Sheep', inputs: {}, outputs: { wool: 1 } },
      { id: 'cattle', name: 'Cattle', inputs: {}, outputs: { milk: 1 } },
      { id: 'pigs', name: 'Pigs', inputs: {}, outputs: { pork: 1 } },
    ],
  }),
  pasture: def({
    type: 'pasture',
    name: 'Pasture',
    desc: 'Fenced grazing for an Animal Farm: a sheep needs 2 tiles, a pig 3, a cow 4. With oats in store the herd can grow half as large again, eating oats through winter.',
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
    radius: 12,
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
  windmill: def({
    type: 'windmill',
    name: 'Windmill',
    desc: 'Grinds wheat into flour for the bakers.',
    category: 'food',
    cost: { wood: 20, woodparts: 4, stone: 10 },
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
    cost: { wood: 15, stone: 10 },
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
    cost: { wood: 15, stone: 5 },
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
    cost: { wood: 20, stone: 5 },
    workers: 1,
    cycle: 3,
    inputs: { hides: 2 },
    outputs: { leather: 2 },
    batch: 3,
    tier: 1,
  }),
  weaver: def({
    type: 'weaver',
    name: 'Weaver',
    desc: 'Spins and weaves wool or flax into cloth.',
    category: 'industry',
    cost: { wood: 20, planks: 5 },
    workers: 2,
    cycle: 3,
    inputs: { wool: 3 },
    outputs: { cloth: 2 },
    tier: 1,
    recipes: [
      { id: 'wool', name: 'Woollen', inputs: { wool: 3 }, outputs: { cloth: 2 } },
      { id: 'linen', name: 'Linen', inputs: { flax: 3 }, outputs: { cloth: 2 } },
    ],
  }),
  tailor: def({
    type: 'tailor',
    name: 'Tailor & Cobbler',
    desc: 'Sews cloth into clothes and stitches leather into boots. Timber Houses need clothes, Townhouses boots.',
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
    ],
  }),
  apothecary: def({
    type: 'apothecary',
    name: 'Apothecary',
    desc: 'Makes salves and tinctures from herbs. Townhouses want medicine.',
    category: 'civic',
    cost: { wood: 15, planks: 10, gold: 20 },
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
    desc: 'Digs iron ore from nearby deposits, for a bloomery to smelt.',
    category: 'resources',
    cost: { wood: 25, planks: 10, gold: 30 },
    buildDays: 14,
    workers: 3,
    radius: 4,
    cycle: 3,
    outputs: { ore: 2 },
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
  claypit: def({
    type: 'claypit',
    name: 'Clay Pit',
    desc: 'Digs clay from a riverbank or lakeshore. Must be built beside water.',
    category: 'resources',
    cost: { wood: 15 },
    workers: 2,
    radius: 4,
    cycle: 2,
    outputs: { clay: 4 },
    gathers: 'water',
    tier: 1,
  }),
  kiln: def({
    type: 'kiln',
    name: 'Tile Kiln',
    desc: 'Fires clay into roof tiles over a firewood blaze. The kiln is fired in batches: workers come once clay for three firings is waiting. Townhouses are roofed with tiles.',
    category: 'industry',
    cost: { stone: 15, wood: 10 },
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
    cost: { wood: 15, stone: 10 },
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
    desc: 'Smelts iron ore into iron in a clay furnace fed with firewood, lit once there is ore for two smeltings.',
    category: 'industry',
    cost: { stone: 20, wood: 10 },
    workers: 2,
    cycle: 3,
    inputs: { ore: 2, firewood: 2 },
    outputs: { iron: 2 },
    batch: 2,
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
    inputs: { grapes: 4 },
    outputs: { wine: 3 },
    tier: 2,
    charter: 'orchard3a',
  }),
  scriptorium: def({
    type: 'scriptorium',
    name: 'Scriptorium',
    desc: 'Monks press flax into paper, and copy and bind books with leather covers. Books are a luxury and a fine export.',
    category: 'civic',
    cost: { dressedstone: 15, planks: 15, gold: 60 },
    buildDays: 16,
    workers: 2,
    cycle: 4,
    inputs: { flax: 2 },
    outputs: { paper: 2 },
    tier: 2,
    charter: 'learning1',
    recipes: [
      { id: 'paper', name: 'Paper', inputs: { flax: 2 }, outputs: { paper: 2 } },
      { id: 'books', name: 'Books', inputs: { paper: 3, leather: 1 }, outputs: { books: 1 } },
    ],
  }),
  armoury: def({
    type: 'armoury',
    name: 'Armoury',
    desc: "Fletchers and armourers make bows from planks and armour from iron and leather. The castle's garrison needs arms.",
    category: 'industry',
    cost: { stone: 25, planks: 15, gold: 40 },
    buildDays: 14,
    workers: 2,
    cycle: 4,
    inputs: { planks: 3 },
    outputs: { weapons: 1 },
    tier: 3,
    recipes: [
      { id: 'bows', name: 'Bows', inputs: { planks: 3 }, outputs: { weapons: 1 } },
      { id: 'armour', name: 'Armour', inputs: { iron: 2, leather: 1 }, outputs: { weapons: 2 } },
    ],
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
    desc: 'Stores 300 materials and goods: timber, stone, planks, wool, cloth, tools and the like.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { wood: 30 },
    buildDays: 12,
  }),
  granary: def({
    type: 'granary',
    name: 'Granary',
    desc: 'Stores 300 food and grain: bread, meat, fish, fruit, cheese, wheat, barley, flour.',
    category: 'civic',
    w: 3,
    h: 3,
    cost: { wood: 30 },
    buildDays: 12,
  }),
  tavern: def({
    type: 'tavern',
    name: 'Tavern',
    desc: 'Ale, cider and good company. Homes nearby are happier and Timber Houses need one. Each month it pours a cask for every eight villagers it serves.',
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
    desc: 'Households nearby are happier. Lets you buy and sell goods, and merchants visit to buy your surplus.',
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
    cost: { planks: 40, dressedstone: 30, stone: 20, tools: 5, gold: 100 },
    buildDays: 30,
    workers: 1,
    radius: 16,
    tier: 2,
  }),
  cathedral: def({
    type: 'cathedral',
    name: 'Cathedral',
    desc: 'The great work of a lifetime: twin towers, a spire and glass. Serves as a church far and wide, cheers the whole town and brings prestige every month. One per town.',
    category: 'civic',
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
    desc: "A City's great work, laid section by section like a road (click, click). Where it crosses a road a gate tower rises. Walls bring prestige, and a long circuit makes the town feel safe and keeps wolves and bandits out.",
    category: 'civic',
    w: 1,
    h: 1,
    cost: { stone: 4, dressedstone: 2, gold: 5 },
    buildDays: 3,
    workers: 0,
    radius: 0,
    tier: 4,
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
  belltower: def({
    type: 'belltower',
    name: 'Bell Tower',
    desc: 'A tall stone tower whose bells ring the hours across the town. Beautifies a wide area and brings prestige every month. One per town.',
    category: 'decor',
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
    category: 'civic',
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
    category: 'decor',
    w: 2,
    h: 2,
    cost: { dressedstone: 20, tools: 2, gold: 150 },
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
  'claypit',
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
  'bakery',
  'brewhouse',
  'dairy',
  'winery',
  'sawmill',
  'tanner',
  'weaver',
  'tailor',
  'carpenter',
  'stonemason',
  'kiln',
  'bloomery',
  'smithy',
  'armoury',
  'jeweller',
  'well',
  'storehouse',
  'granary',
  'market',
  'tavern',
  'apothecary',
  'scriptorium',
  'church',
  'cathedral',
  'guildhall',
  'wall',
  'garden',
  'maypole',
  'statue',
  'belltower',
];

export const CATEGORY_NAMES: Record<Category, string> = {
  housing: 'Housing',
  resources: 'Resources',
  farming: 'Farming',
  food: 'Food',
  industry: 'Industry',
  civic: 'Civic',
  decor: 'Decor',
};


export const TIERS = [
  { name: 'Hamlet', pop: 0, desc: 'A handful of families clearing the land.' },
  { name: 'Village', pop: 20, desc: 'Unlocks farms, bakeries, sawpits, markets, taverns, Timber Houses and workshop expansions.' },
  { name: 'Town', pop: 45, desc: 'Unlocks mines, bloomeries, blacksmiths, churches, Townhouses and town charters.' },
  { name: 'Borough', pop: 90, desc: 'Your lands prosper. A true seat of a lord!' },
  { name: 'City', pop: 150, desc: 'A castle crowns your city. Songs are sung of your house across the realm.' },
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
