import type { GameState } from './types';
import { mulberry32 } from './rng';

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
  { id: 'craft', name: "Artisans' Guilds", color: '#7a4a9a', malus: 'The dye works stink: homes near a dyer are a little less happy.' },
];

export const CHARTERS: Charter[] = [
  { id: 'metal1', path: 'metal', rank: 1, name: 'Master Smiths', desc: 'Bloomeries and blacksmiths work a quarter faster.' },
  { id: 'metal2', path: 'metal', rank: 2, name: 'Deep Veins', desc: 'Prospectors find two to four veins of silver in the hills, worked by a Silver Mine.', excludes: ['nature3a', 'nature3b'] },
  { id: 'metal3a', path: 'metal', rank: 3, name: "Jewellers' Guild", desc: "Opens the Jeweller's Shop, and jewellers work twice as fast. +1 prestige a month, and +2 for each jeweller.", excludes: ['metal3b'] },
  { id: 'metal3b', path: 'metal', rank: 3, name: "Ironmongers' Guild", desc: 'Blacksmiths work a third faster, every workplace wears out a fifth fewer tools, and tools fetch half again.', excludes: ['metal3a'] },

  { id: 'orchard1', path: 'orchard', rank: 1, name: 'Grafting', desc: 'Orchards and hives yield 30% more.' },
  { id: 'orchard2', path: 'orchard', rank: 2, name: 'Vines and Nurseries', desc: 'Orchards may be planted with vines for grapes, and young trees bear in a year instead of a year and a half.' },
  { id: 'orchard3a', path: 'orchard', rank: 3, name: 'Vintners', desc: 'Opens the Winery; wineries and cider presses make half as much again, and wine and cider sell for half again.', excludes: ['orchard3b'] },
  { id: 'orchard3b', path: 'orchard', rank: 3, name: 'Meadmakers', desc: 'Beekeepers and backyard hives give twice the honey, and mead is brewed half as fast again. Honey cakes cheer the town (+4 happiness).', excludes: ['orchard3a'] },

  { id: 'learning1', path: 'learning', rank: 1, name: 'Scribes', desc: 'Opens the Scriptorium, and scriptoria copy half as many books again. +1 prestige a month.' },
  { id: 'learning2', path: 'learning', rank: 2, name: 'Guild Schools', desc: 'Apprentices learn their trade: every workshop that turns one good into another works 10% faster.' },
  { id: 'learning3a', path: 'learning', rank: 3, name: 'University Charter', desc: 'The University reads only one book a month and teaches half as much again, and its learning makes every workplace 10% faster instead of 5%.', excludes: ['learning3b'] },
  { id: 'learning3b', path: 'learning', rank: 3, name: 'Cathedral School', desc: 'A choir and a library: +6 happiness, +2 prestige a month, and the cathedral and churches teach twice as much.', excludes: ['learning3a'] },

  { id: 'nature1', path: 'nature', rank: 1, name: 'Woodland Lore', desc: 'Foragers and hunters bring home 40% more.' },
  { id: 'nature2', path: 'nature', rank: 2, name: 'Greenwood', desc: 'Forests regrow twice as fast, woodcutters fell a fifth more, and the people love their woods (+3 happiness).' },
  { id: 'nature3a', path: 'nature', rank: 3, name: "Druids' Grove", desc: 'Old rites under the oaks: +6 happiness, herbs for the gathering, +1 prestige a month; and content with their woods, homes go up a level, or keep theirs, with one need unmet.', excludes: ['nature3b', 'metal2'] },
  { id: 'nature3b', path: 'nature', rank: 3, name: 'Royal Hunt', desc: 'The king hunts in your woods: hunters bring half again, two more herds of deer roam the land, and the deer park yields twice as much and brings 2 more prestige.', excludes: ['nature3a', 'metal2'] },

  { id: 'trade1', path: 'trade', rank: 1, name: 'Market Charter', desc: 'Buy 15% cheaper and sell 20% dearer at the trading post and dock.' },
  { id: 'trade2', path: 'trade', rank: 2, name: 'Fair Town', desc: 'Merchants buy twice as much each month.' },
  { id: 'trade3a', path: 'trade', rank: 3, name: 'Merchant Guild', desc: 'Exports fetch 30% more.', excludes: ['trade3b'] },
  { id: 'trade3b', path: 'trade', rank: 3, name: 'Toll Roads', desc: 'Travellers pay a toll: a coin a month for every two tiles of stone road or cobbled street, three times as much on the Royal Road.', excludes: ['trade3a'] },

  { id: 'farm1', path: 'farm', rank: 1, name: 'Three-Field Rotation', desc: 'Harvests are 20% larger.' },
  { id: 'farm2', path: 'farm', rank: 2, name: 'Heavy Plough', desc: 'The iron plough is known without study and wears out no tools, and farmers tend a quarter more fields besides.' },
  { id: 'farm3a', path: 'farm', rank: 3, name: 'Breadbasket', desc: 'Granaries hold twice as much, and mills and bakeries make 30% more.', excludes: ['farm3b'] },
  { id: 'farm3b', path: 'farm', rank: 3, name: "Brewers' Guild", desc: 'Brewhouses brew half as much again of every drink, and drinks fetch half again.', excludes: ['farm3a'] },

  { id: 'herd1', path: 'herd', rank: 1, name: 'Good Husbandry', desc: 'Wool, milk and meat from herds are 30% more.' },
  { id: 'herd2', path: 'herd', rank: 2, name: 'Great Herds', desc: 'Pastures carry half as many animals again.' },
  { id: 'herd3a', path: 'herd', rank: 3, name: "Butchers' Guild", desc: 'The slaughter yields half as much meat again, and tanners work a third faster, at leather and parchment alike.', excludes: ['herd3b'] },
  { id: 'herd3b', path: 'herd', rank: 3, name: 'Fine Cheese', desc: 'Dairies make half as much cheese again, and cheese fetches half again.', excludes: ['herd3a'] },

  { id: 'craft1', path: 'craft', rank: 1, name: "Dyers' Guild", desc: 'Dyers work half as fast again, and berries dye as well as woad.' },
  { id: 'craft2', path: 'craft', rank: 2, name: 'Glaziers', desc: 'Glassworks and glaziers work a third faster.' },
  { id: 'craft3a', path: 'craft', rank: 3, name: "Drapers' Guild", desc: "Embroiderers work twice as fast, fine clothes fetch a quarter more, and the atelier's tapestry comes twice as readily.", excludes: ['craft3b'] },
  { id: 'craft3b', path: 'craft', rank: 3, name: "Potters' Guild", desc: 'Potters work twice as fast, and fine pottery counts as two luxuries in a home.', excludes: ['craft3a'] },
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

/** The first charter's price, and how much dearer each one after it is (about two full paths in a game). */
export const CHARTER_BASE = 40;
export const CHARTER_GROWTH = 1.8;
/** A Guildhall's masters plead the town's case: every charter a fifth cheaper. */
export const GUILDHALL_DISCOUNT = 0.8;

/** Prestige the next charter costs: every charter makes the next dearer. */
export function charterCost(s: GameState): number {
  const guild = s.buildings.some((b) => b.type === 'guildhall' && b.build >= 1);
  return Math.round(CHARTER_BASE * Math.pow(CHARTER_GROWTH, s.charters?.length ?? 0) * (guild ? GUILDHALL_DISCOUNT : 1));
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
  if (id === 'metal2') revealSilver(s);
  if (id === 'nature3b') addDeer(s);
  return true;
}

/**
 * Deep Veins: prospectors find two to four silver veins on open ground,
 * nearest the hills (rock) where they can.
 */
export function revealSilver(s: GameState): void {
  const rand = mulberry32(s.seed * 31 + 7);
  const n = 2 + Math.floor(rand() * 3);
  const spots: { i: number; score: number }[] = [];
  for (let y = 3; y < s.height - 3; y++)
    for (let x = 3; x < s.width - 3; x++) {
      const i = y * s.width + x;
      if (s.terrain[i] || s.occ[i] >= 0 || s.road[i] || s.rock[i] || s.ore[i]) continue;
      let rock = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (s.rock[i + dy * s.width + dx]) rock++;
      if (rock) spots.push({ i, score: rock + rand() * 3 });
    }
  spots.sort((a, b) => b.score - a.score);
  const out: number[] = [];
  for (const sp of spots) {
    if (out.length >= n) break;
    const x = sp.i % s.width;
    const y = Math.floor(sp.i / s.width);
    // Veins lie well apart.
    if (out.some((o) => Math.hypot((o % s.width) - x, Math.floor(o / s.width) - y) < 12)) continue;
    out.push(sp.i);
  }
  s.silver = out;
}

/** Royal Hunt: two more herds of deer come to the woods. */
export function addDeer(s: GameState): void {
  const rand = mulberry32(s.seed * 17 + 3);
  const woods: number[] = [];
  for (let i = 0; i < s.trees.length; i++) if (s.trees[i] >= 3 && s.occ[i] < 0) woods.push(i);
  for (let k = 0; k < 2 && woods.length; k++) {
    const i = woods[Math.floor(rand() * woods.length)];
    (s.herds ??= []).push({ kind: 'deer', x: (i % s.width) + 0.5, y: Math.floor(i / s.width) + 0.5, n: 6, max: 6 } as never);
  }
}
