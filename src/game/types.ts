export const RESOURCE_IDS = [
  // Materials
  'wood',
  'firewood',
  'planks',
  'woodparts',
  'stone',
  'dressedstone',
  'clay',
  'tiles',
  'ore',
  'iron',
  'silver',
  // Food
  'bread',
  'meat',
  'pork',
  'fish',
  'eggs',
  'berries',
  'mushrooms',
  'vegetables',
  'apples',
  'pears',
  'plums',
  'grapes',
  'honey',
  'milk',
  'cheese',
  // Goods
  'grain',
  'barley',
  'oats',
  'flour',
  'flax',
  'wool',
  'hides',
  'leather',
  'cloth',
  'clothes',
  'boots',
  'ale',
  'cider',
  'wine',
  'mead',
  'herbs',
  'medicine',
  'tools',
  'paper',
  'books',
  'jewellery',
  'weapons',
  // Currency
  'gold',
  'prestige',
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Resources = Record<ResourceId, number>;
export type Cost = Partial<Resources>;

/** How the top bar groups goods. */
export type GoodsGroup = 'food' | 'materials' | 'goods' | 'currency';
/** Food groups count towards variety. */
export type FoodGroup = 'grain' | 'meat' | 'produce' | 'dairy';

export type BuildingType =
  | 'townhall'
  | 'house'
  | 'woodcutter'
  | 'forester'
  | 'quarry'
  | 'forager'
  | 'hunter'
  | 'fisher'
  | 'farm'
  | 'field'
  | 'byre'
  | 'pasture'
  | 'orchardist'
  | 'orchard'
  | 'bakery'
  | 'windmill'
  | 'brewhouse'
  | 'dairy'
  | 'tanner'
  | 'weaver'
  | 'tailor'
  | 'apothecary'
  | 'sawmill'
  | 'mine'
  | 'smithy'
  | 'claypit'
  | 'kiln'
  | 'stonemason'
  | 'carpenter'
  | 'bloomery'
  | 'jeweller'
  | 'winery'
  | 'scriptorium'
  | 'armoury'
  | 'well'
  | 'market'
  | 'church'
  | 'storehouse'
  | 'granary'
  | 'tavern'
  | 'garden'
  | 'maypole'
  | 'statue';

export type Category = 'housing' | 'resources' | 'farming' | 'food' | 'industry' | 'civic' | 'decor';

export type Season = 0 | 1 | 2 | 3; // spring, summer, autumn, winter

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  /** Construction progress 0..1; building is complete at 1. */
  build: number;
  workers: number;
  residents: number;
  /** Production progress accumulator. */
  work: number;
  /** Farm crop growth 0..1. */
  growth: number;
  paused: boolean;
  status: string;
  /** Builders working on this site or renovation. */
  builders?: number;
  /** Level a renovation is raising the building to. */
  upgrading?: number;
  /** Materials being carried for a renovation (fractional loads). */
  carry?: number;
  /** Renovation progress 0..1 once materials are delivered. */
  upProgress?: number;
  /** House needs that are not met (for the inspector). */
  unmet?: string[];
  /** Construction materials still to be carried to the site. */
  need?: Cost;
  /** Days a round trip to the nearest storage takes, refreshed by recompute. */
  trip?: number;
  /** Distance to the last resource tile gathered from. */
  resDist?: number;
  /** Production speed relative to an ideal site, 0..1 (travel overhead). */
  efficiency?: number;
  /**
   * Why the building cannot currently work: 0 or undefined = it can,
   * 1 = blocked by a problem (no resources, storage full), 2 = seasonal rest.
   */
  blocked?: number;
  /** Workers wanted here (undefined = as many as it takes). */
  want?: number;
  /** Job priority: 0 low, 1 normal (default), 2 high. */
  priority?: number;
  /** Chosen product (recipe id), or undefined for Auto. */
  recipe?: string;
  /** Zones (fields, pastures, orchards): the workplace that tends them. */
  owner?: number;
  /** Byres: animals in the herd, and which animal they are. */
  herd?: number;
  herdKind?: string;
  /** Orchards: days since planting. */
  age?: number;
  /** Fields: the crop harvested last year (for rotation). */
  lastCrop?: string;
  /** Batch workshops: a batch is under way. */
  batchOn?: boolean;
  /** Houses: a craft the family works from home. */
  trade?: BuildingType;
  /** Houses: goods the household has been supplied with, until which day. */
  supply?: Partial<Record<ResourceId, number>>;
  /** Houses: what the family keeps in the backyard. */
  yard?: string;
  /** Units produced in the last month, for display. */
  lastOutput: number;
  output: number;
}

export type MessageKind = 'info' | 'good' | 'bad' | 'advice';

export interface Message {
  day: number;
  text: string;
  /** info: chronicle only; good/bad: shown as a toast; advice: steward's tip. */
  kind: MessageKind;
  /** Tile the message is about; clicking it centres the camera there. */
  at?: { x: number; y: number };
}

export interface MonthReport {
  eaten: number;
  shortage: number;
  variety: number;
  cold: boolean;
  taxes: number;
  arrived: number;
  left: number;
  /** Gold earned from merchants last month. */
  trade?: number;
}

/** One month's snapshot for the ledger charts. */
export interface HistoryPoint {
  /** Day the month started. */
  d: number;
  pop: number;
  food: number;
  happy: number;
  gold: number;
}

export interface GameState {
  version: number;
  seed: number;
  width: number;
  height: number;
  /** Terrain: 0 grass, 1 water. */
  terrain: Uint8Array;
  trees: Uint8Array;
  rock: Uint8Array;
  ore: Uint8Array;
  berries: Uint8Array;
  berriesMax: Uint8Array;
  fertility: Float32Array;
  road: Uint8Array;
  occ: Int32Array;
  variant: Uint8Array;
  buildings: Building[];
  nextId: number;
  res: Resources;
  day: number;
  population: number;
  happiness: number;
  happinessTarget: number;
  happinessFactors: { label: string; value: number }[];
  taxLevel: number;
  tier: number;
  quests: string[];
  messages: Message[];
  report: MonthReport;
  rngState: number;
  /** Settlers still walking in (cosmetic + counted on arrival). */
  incoming: number;
  /** Relaxed mode: generous start and villagers never leave in anger. */
  relaxed?: boolean;
  /** Day each piece of advisor advice was last given. */
  advice?: Record<string, number>;
  /** Old export rules (pre stock targets); migrated on load. */
  exports?: Partial<Record<ResourceId, number>>;
  /** Stock targets overriding each good's default keep amount. */
  targets?: Partial<Record<ResourceId, number>>;
  /** Goods visiting merchants may buy above their target. */
  sell?: Partial<Record<ResourceId, boolean>>;
  /** Stock at the end of last month, and the change over that month. */
  lastMonth?: Partial<Record<ResourceId, number>>;
  flow?: Partial<Record<ResourceId, number>>;
  /** Whether the university had its books and wood parts this month. */
  universityOk?: boolean;
  /** The lord keeps an armed retinue (Borough and up). */
  retinue?: boolean;
  /** Town charters granted (see charters.ts). */
  charters?: string[];
  /** Goods the settlement has ever held. */
  seen?: ResourceId[];
  /** Decision event waiting for the player's choice. */
  pendingEvent?: string;
  /** Earliest day the next decision event may happen. */
  nextEventDay?: number;
  /** Temporary happiness effects from events. */
  moods?: { label: string; value: number; until: number }[];
  /** Year in which the lord last called a harvest feast. */
  lastFeast?: number;
  /** Monthly snapshots, oldest first. */
  history: HistoryPoint[];
  /** Set when buildings/roads change; cleared after recompute. */
  dirty: boolean;
}
