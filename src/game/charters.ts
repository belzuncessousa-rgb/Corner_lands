import type { GameState } from './types';

/**
 * Town charters: specialisation paths radiating from the Town Charter.
 * Each path has two ranks and then forks into two exclusive guilds. Every
 * charter granted makes the next dearer, so a town either goes deep in one
 * path or dabbles in several. Each path carries a small drawback.
 */

export interface Charter {
  id: string;
  path: string;
  rank: 1 | 2 | 3;
  name: string;
  desc: string;
  /** Charters this one cannot be taken alongside. */
  excludes?: string[];
}

export interface CharterPath {
  id: string;
  name: string;
  color: string;
  /** Drawback that applies once any charter on the path is granted. */
  malus: string;
}

export const PATHS: CharterPath[] = [
  { id: 'metal', name: 'Metalwork', color: '#6d7078', malus: 'Smoke from the forges: homes are a little less happy.' },
  { id: 'orchard', name: 'Orchard Masters', color: '#b8483a', malus: 'Orchard keepers need a third more hands.' },
  { id: 'learning', name: 'Erudition', color: '#3a5a8a', malus: 'Scholars shun the fields: farms yield a little less.' },
  { id: 'nature', name: 'Harmony with Nature', color: '#3d7a3a', malus: 'Quarries and mines work a fifth slower.' },
  { id: 'trade', name: 'Traders', color: '#c8a038', malus: 'Taxes are less popular.' },
  { id: 'farm', name: 'Farmers', color: '#a8862a', malus: 'Pastures carry a fifth fewer animals.' },
  { id: 'herd', name: 'Shepherds', color: '#8a6a44', malus: 'The best land goes to grazing: fields yield a tenth less.' },
];

export const CHARTERS: Charter[] = [
  { id: 'metal1', path: 'metal', rank: 1, name: 'Deep Shafts', desc: 'Ore veins never run out.' },
  { id: 'metal2', path: 'metal', rank: 2, name: 'Precious Veins', desc: 'Miners turn up silver and gold: each load of ore brings a coin.', excludes: ['nature3a', 'nature3b'] },
  { id: 'metal3a', path: 'metal', rank: 3, name: "Jewellers' Guild", desc: 'Goldsmiths work the precious metal: +3 prestige and +20 coins a month.', excludes: ['metal3b'] },
  { id: 'metal3b', path: 'metal', rank: 3, name: "Armourers' Guild", desc: 'Smiths forge half as many tools again, and merchants pay half again for tools.', excludes: ['metal3a'] },

  { id: 'orchard1', path: 'orchard', rank: 1, name: 'Grafting', desc: 'Orchards and hives yield 30% more.' },
  { id: 'orchard2', path: 'orchard', rank: 2, name: 'Nurseries', desc: 'Young trees bear fruit in a year instead of a year and a half.' },
  { id: 'orchard3a', path: 'orchard', rank: 3, name: 'Cider Makers', desc: 'Brewhouses press half as much cider again; cider fetches double.', excludes: ['orchard3b'] },
  { id: 'orchard3b', path: 'orchard', rank: 3, name: 'Meadmakers', desc: 'Hives give twice the honey, and honey cakes cheer the town (+4 happiness).', excludes: ['orchard3a'] },

  { id: 'learning1', path: 'learning', rank: 1, name: 'Scriptorium', desc: 'Monks copy books for the lord: +2 prestige a month.' },
  { id: 'learning2', path: 'learning', rank: 2, name: 'Guild Schools', desc: 'Apprentices learn their trade: workshops work 10% faster.' },
  { id: 'learning3a', path: 'learning', rank: 3, name: 'University', desc: 'Masters and machines: workshops work 25% faster.', excludes: ['learning3b'] },
  { id: 'learning3b', path: 'learning', rank: 3, name: 'Cathedral School', desc: 'A choir and a library: +6 happiness and +2 prestige a month.', excludes: ['learning3a'] },

  { id: 'nature1', path: 'nature', rank: 1, name: 'Woodland Lore', desc: 'Foragers and hunters bring home 40% more.' },
  { id: 'nature2', path: 'nature', rank: 2, name: 'Greenwood', desc: 'Forests regrow twice as fast; the people love their woods (+3 happiness).' },
  { id: 'nature3a', path: 'nature', rank: 3, name: "Druids' Grove", desc: 'Old rites under the oaks: +6 happiness.', excludes: ['nature3b', 'metal2'] },
  { id: 'nature3b', path: 'nature', rank: 3, name: 'Royal Hunt', desc: 'The king hunts in your woods: each hunting camp brings 1 prestige a month.', excludes: ['nature3a', 'metal2'] },

  { id: 'trade1', path: 'trade', rank: 1, name: 'Market Charter', desc: 'Buy 15% cheaper and sell 20% dearer at the market.' },
  { id: 'trade2', path: 'trade', rank: 2, name: 'Fair Town', desc: 'Merchants buy twice as much each month.' },
  { id: 'trade3a', path: 'trade', rank: 3, name: 'Merchant Guild', desc: 'Exports fetch 30% more.', excludes: ['trade3b'] },
  { id: 'trade3b', path: 'trade', rank: 3, name: 'Toll Roads', desc: 'Travellers pay a toll: a coin a month for every three paved tiles.', excludes: ['trade3a'] },

  { id: 'farm1', path: 'farm', rank: 1, name: 'Three-Field Rotation', desc: 'Harvests are 20% larger.' },
  { id: 'farm2', path: 'farm', rank: 2, name: 'Heavy Plough', desc: 'Farmers tend half as many fields again.' },
  { id: 'farm3a', path: 'farm', rank: 3, name: 'Breadbasket', desc: 'Granaries hold twice as much.', excludes: ['farm3b'] },
  { id: 'farm3b', path: 'farm', rank: 3, name: "Brewers' Guild", desc: 'Brewhouses brew half as much ale again; ale fetches double.', excludes: ['farm3a'] },

  { id: 'herd1', path: 'herd', rank: 1, name: 'Good Husbandry', desc: 'Wool, milk and meat from herds are 30% more.' },
  { id: 'herd2', path: 'herd', rank: 2, name: 'Great Herds', desc: 'Pastures carry half as many animals again.' },
  { id: 'herd3a', path: 'herd', rank: 3, name: "Butchers' Guild", desc: 'The autumn slaughter yields half as much meat again.', excludes: ['herd3b'] },
  { id: 'herd3b', path: 'herd', rank: 3, name: 'Fine Cheese', desc: 'Dairies make half as much cheese again; cheese fetches double.', excludes: ['herd3a'] },
];

/** Settlement rank (Town) at which charters can be granted. */
export const CHARTER_TIER = 2;

export function hasCharter(s: GameState, id: string): boolean {
  return !!s.charters?.includes(id);
}

/** Whether any charter on a path has been granted (its drawback applies). */
export function onPath(s: GameState, path: string): boolean {
  return !!s.charters?.some((c) => c.startsWith(path));
}

/** Prestige the next charter costs: every charter makes the next dearer. */
export function charterCost(s: GameState): number {
  return Math.round(40 * Math.pow(1.6, s.charters?.length ?? 0));
}

export function charterError(s: GameState, id: string): string | null {
  const c = CHARTERS.find((x) => x.id === id);
  if (!c) return 'Unknown charter';
  if (hasCharter(s, id)) return 'Already granted';
  if (s.tier < CHARTER_TIER) return 'Charters are granted to Towns';
  if (c.rank > 1 && !CHARTERS.some((x) => x.path === c.path && x.rank === c.rank - 1 && hasCharter(s, x.id))) {
    return 'Grant the previous charter on this path first';
  }
  const lock = c.excludes?.find((x) => hasCharter(s, x));
  if (lock) return `Not alongside ${CHARTERS.find((x) => x.id === lock)!.name}`;
  if (s.res.prestige < charterCost(s)) return `Needs ${charterCost(s)} prestige`;
  return null;
}

export function grantCharter(s: GameState, id: string): boolean {
  if (charterError(s, id)) return false;
  s.res.prestige -= charterCost(s);
  s.charters = [...(s.charters ?? []), id];
  return true;
}
