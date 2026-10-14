export const RESOURCE_IDS = [
  'wood',
  'stone',
  'planks',
  'iron',
  'tools',
  'berries',
  'meat',
  'fish',
  'grain',
  'bread',
  'gold',
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Resources = Record<ResourceId, number>;
export type Cost = Partial<Resources>;

/** Edible resources, in the order villagers prefer to eat them. */
export const FOOD_IDS: ResourceId[] = ['bread', 'fish', 'meat', 'berries'];

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
  | 'bakery'
  | 'sawmill'
  | 'mine'
  | 'smithy'
  | 'well'
  | 'market'
  | 'church'
  | 'storehouse'
  | 'garden'
  | 'maypole'
  | 'statue';

export type Category = 'housing' | 'resources' | 'food' | 'industry' | 'civic' | 'decor';

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
  connected: boolean;
  status: string;
  /** Units produced in the last month, for display. */
  lastOutput: number;
  output: number;
}

export interface Message {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

export interface MonthReport {
  eaten: number;
  shortage: number;
  variety: number;
  cold: boolean;
  taxes: number;
  arrived: number;
  left: number;
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
  /** Monthly snapshots, oldest first. */
  history: HistoryPoint[];
  /** Set when buildings/roads change; cleared after recompute. */
  dirty: boolean;
}
