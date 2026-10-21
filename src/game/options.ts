import type { Cost, GameState, ResourceId } from './types';
import { knows } from './unlocks';

/**
 * Town options: ways the town may choose to look and live, each with a cost
 * when switched on and some with a running cost. They make towns look
 * different from one another and give existing goods a steady use.
 */
export interface TownOption {
  id: string;
  name: string;
  desc: string;
  /** Paid once, when it is first switched on. */
  once?: Cost;
  /** Paid every month while it is on (worked out from the town). */
  running?: (s: GameState) => Cost;
}

/** Mortar each limewashed home takes in a year. */
export const LIMEWASH_MORTAR = 0.5;
/** Villagers one dye a year keeps in coloured tunics. */
export const TUNIC_VILLAGERS = 10;
export const TUNICS_HAPPINESS = 2;
export const WINDOWS_HAPPINESS = 2;
export const WINDOWS_PRESTIGE = 1;
export const BANNERS_PRESTIGE = 1;

export function limewashHomes(s: GameState): number {
  return s.buildings.filter((b) => b.type === 'house' && b.build >= 1).length;
}

export function churchCount(s: GameState): number {
  return s.buildings.filter((b) => (b.type === 'church' || b.type === 'cathedral') && b.build >= 1).length;
}

export const OPTIONS: TownOption[] = [
  {
    id: 'limewash',
    name: 'Limewash',
    desc: `The homes are limewashed white: +1 beauty at each home; each takes ${LIMEWASH_MORTAR} mortar a year.`,
    running: (s) => ({ mortar: (limewashHomes(s) * LIMEWASH_MORTAR) / 12 }),
  },
  {
    id: 'tunics',
    name: 'Dyed tunics',
    desc: `Villagers wear dyed colours: +${TUNICS_HAPPINESS} happiness; a dye a year for every ${TUNIC_VILLAGERS} villagers.`,
    running: (s) => ({ dyes: s.population / TUNIC_VILLAGERS / 12 }),
  },
  {
    id: 'windows',
    name: 'Church windows',
    desc: `Stained-glass windows in every church and the cathedral: +${WINDOWS_HAPPINESS} happiness and +${WINDOWS_PRESTIGE} prestige a month; a stained glass for each church, once.`,
  },
  {
    id: 'banners',
    name: 'Heraldic banners',
    desc: `Banners in the lord's arms on the manor, the towers and the market: +${BANNERS_PRESTIGE} prestige a month. Cloth and dyes, once.`,
    once: { cloth: 4, dyes: 2 },
  },
];

export const OPTION_BY_ID = new Map(OPTIONS.map((o) => [o.id, o]));

export function optionOn(s: GameState, id: string): boolean {
  return !!s.options?.includes(id);
}

/** What switching an option on costs now (church windows: a stained glass for each church not yet glazed). */
export function optionOnce(s: GameState, id: string): Cost {
  if (id === 'windows') return { stainedglass: Math.max(1, churchCount(s) - (s.glazed ?? 0)) };
  return OPTION_BY_ID.get(id)?.once ?? {};
}

export function optionError(s: GameState, id: string): string | null {
  const o = OPTION_BY_ID.get(id);
  if (!o) return 'No such option';
  if (!knows(s, `o:${id}`)) return 'Not learned yet';
  if (optionOn(s, id)) return null;
  const cost = optionOnce(s, id);
  if (id === 'windows' && !churchCount(s)) return 'Build a church first';
  for (const k in cost) {
    const need = cost[k as ResourceId] ?? 0;
    if (s.res[k as ResourceId] < need) return `Needs ${need} ${k === 'stainedglass' ? 'stained glass' : k}`;
  }
  return null;
}

/** Switches a town option on (paying its one-off cost) or off. */
export function setOption(s: GameState, id: string, on: boolean): string | null {
  if (optionOn(s, id) === on) return null;
  if (!on) {
    s.options = (s.options ?? []).filter((x) => x !== id);
    if (id === 'limewash') for (const b of s.buildings) b.limewashed = undefined;
    s.dirty = true;
    return null;
  }
  const err = optionError(s, id);
  if (err) return err;
  // Banners and windows, once paid for, stay up: switching back on is free.
  if (!(s.optionsPaid ?? []).includes(id)) {
    const cost = optionOnce(s, id);
    for (const k in cost) s.res[k as ResourceId] -= cost[k as ResourceId] ?? 0;
    if (id !== 'windows') (s.optionsPaid ??= []).push(id);
  }
  if (id === 'windows') s.glazed = churchCount(s);
  (s.options ??= []).push(id);
  s.dirty = true;
  return null;
}

/**
 * Each month the options running costs are paid. Short of mortar the
 * limewash fades from the homes; short of dyes the tunics go undyed (no
 * happiness) until there is dye again.
 */
export function monthlyOptions(s: GameState): void {
  if (!s.options?.length) return;
  const acc = (s.optionUse ??= {});
  for (const id of s.options) {
    const o = OPTION_BY_ID.get(id);
    if (!o?.running) continue;
    const cost = o.running(s);
    let ok = true;
    for (const k in cost) {
      const r = k as ResourceId;
      acc[r] = (acc[r] ?? 0) + (cost[r] ?? 0);
      const whole = Math.floor(acc[r] ?? 0);
      if (whole <= 0) continue;
      if (s.res[r] >= whole) {
        s.res[r] -= whole;
        acc[r] = (acc[r] ?? 0) - whole;
      } else ok = false;
    }
    if (id === 'limewash') for (const b of s.buildings) if (b.type === 'house') b.limewashed = (ok && b.build >= 1) || undefined;
    if (id === 'tunics') s.tunicsBare = !ok || undefined;
  }
  // New churches want their windows: unglazed ones wait for a stained glass each.
  if (optionOn(s, 'windows') && (s.glazed ?? 0) < churchCount(s) && s.res.stainedglass >= 1) {
    s.res.stainedglass -= 1;
    s.glazed = (s.glazed ?? 0) + 1;
  }
}

/** Happiness the town options give. */
export function optionHappiness(s: GameState): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  if (optionOn(s, 'tunics') && !s.tunicsBare) out.push({ label: 'Dyed tunics', value: TUNICS_HAPPINESS });
  if (optionOn(s, 'windows') && (s.glazed ?? 0) > 0) out.push({ label: 'Stained-glass windows', value: WINDOWS_HAPPINESS });
  return out;
}

/** Prestige the town options give each month. */
export function optionPrestige(s: GameState): number {
  return (optionOn(s, 'windows') && (s.glazed ?? 0) > 0 ? WINDOWS_PRESTIGE : 0) + (optionOn(s, 'banners') ? BANNERS_PRESTIGE : 0);
}
