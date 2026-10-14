import type { BuildingType, Category, Cost, ResourceId } from './types';

/** Real seconds per game day at 1x speed. */
export const DAY_SECONDS = 4;

/** Walking speed in tiles per game day, on roads and across open country. */
export const ROAD_TILES_PER_DAY = 4;
export const OFFROAD_TILES_PER_DAY = 2.2;
/** Units of goods a villager carries in one trip. */
export const CARRY_LOAD = 5;
/** How strongly walking time slows production (0 = ignored). */
export const TRAVEL_WEIGHT = 0.5;
/** Workshops rest once this much of their product is in store. */
export const STOCK_TARGET = 150;

export type StorageKind = 'materials' | 'food';

/** Which storage pool each resource lives in; gold sits in the manor's coffers. */
export const RESOURCE_STORAGE: Record<ResourceId, StorageKind | null> = {
  wood: 'materials',
  stone: 'materials',
  planks: 'materials',
  iron: 'materials',
  tools: 'materials',
  berries: 'food',
  meat: 'food',
  fish: 'food',
  grain: 'food',
  bread: 'food',
  gold: null,
};

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

export const RESOURCE_INFO: Record<ResourceId, { name: string; desc: string }> = {
  wood: { name: 'Timber', desc: 'Felled logs. Used for building and as winter firewood.' },
  stone: { name: 'Stone', desc: 'Quarried stone for sturdier buildings.' },
  planks: { name: 'Planks', desc: 'Sawn boards for advanced construction.' },
  iron: { name: 'Iron', desc: 'Iron ore from the mine, forged into tools.' },
  tools: { name: 'Tools', desc: 'Needed for house upgrades and grand buildings.' },
  berries: { name: 'Berries', desc: 'Foraged food. Not available in winter.' },
  meat: { name: 'Meat', desc: 'Game hunted in the forests.' },
  fish: { name: 'Fish', desc: 'Caught from rivers and lakes.' },
  grain: { name: 'Grain', desc: 'Harvested in autumn. Baked into bread.' },
  bread: { name: 'Bread', desc: 'Hearty food baked from grain.' },
  gold: { name: 'Gold', desc: 'Collected from taxes and trade.' },
};

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
    desc: 'Gathers berries from wild bushes. Bushes fruit in spring and summer; idle in winter.',
    category: 'food',
    cost: { wood: 10 },
    workers: 2,
    radius: 7,
    cycle: 2,
    outputs: { berries: 5 },
    gathers: 'berries',
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

export const HOUSE_UPGRADE_COST: Cost = { planks: 10, stone: 5, tools: 2, gold: 20 };
export const HOUSE_L2_HOUSING = 8;

export const TIERS = [
  { name: 'Hamlet', pop: 0, desc: 'A handful of families clearing the land.' },
  { name: 'Village', pop: 20, desc: 'Unlocks farms, bakeries, sawpits and markets.' },
  { name: 'Town', pop: 45, desc: 'Unlocks mines, blacksmiths, churches and house upgrades.' },
  { name: 'Borough', pop: 90, desc: 'Your lands prosper. A true seat of a lord!' },
];

export const TAX_LEVELS = [
  { name: 'None', perHead: 0, happiness: 10 },
  { name: 'Low', perHead: 0.5, happiness: 4 },
  { name: 'Normal', perHead: 1, happiness: 0 },
  { name: 'High', perHead: 1.6, happiness: -14 },
];


/** Prices in gold for one unit at the market (sell price is lower). */
export const TRADE_PRICES: Partial<Record<ResourceId, number>> = {
  wood: 2,
  stone: 3,
  planks: 5,
  iron: 6,
  tools: 14,
  berries: 2,
  meat: 3,
  fish: 3,
  grain: 2,
  bread: 3,
};
export const SELL_FACTOR = 0.5;
