import { DAYS_PER_MONTH } from './data';
import type { StateRng } from './rng';
import { totalHousing } from './sim';
import type { GameState, MessageKind } from './types';

interface GameEvent {
  id: string;
  /** Relative chance; 0 when the event cannot happen now. */
  weight: (s: GameState, month: number) => number;
  apply: (s: GameState, rng: StateRng) => { text: string; kind: MessageKind } | null;
}

const housingFree = (s: GameState) => totalHousing(s) - s.population;

const has = (s: GameState, t: string) => s.buildings.some((b) => b.type === t && b.build >= 1);

const EVENTS: GameEvent[] = [
  {
    id: 'family',
    weight: (s) => (housingFree(s) >= 3 && s.happiness >= 40 ? 3 : 0),
    apply: (s) => {
      s.population += 3;
      return { text: 'A wandering family heard tales of your lands and has settled here.', kind: 'good' };
    },
  },
  {
    id: 'berries',
    weight: (_s, m) => (m >= 1 && m <= 6 ? 2 : 0),
    apply: (s) => {
      s.res.berries += 20;
      return { text: 'A bountiful season! Children gathered 20 extra berries.', kind: 'good' };
    },
  },
  {
    id: 'merchant',
    weight: (s) => (s.tier >= 1 ? 2 : 1),
    apply: (s, rng) => {
      const gifts = [
        ['planks', 15],
        ['stone', 20],
        ['tools', 3],
        ['iron', 6],
      ] as const;
      const [res, n] = gifts[rng.int(gifts.length)];
      s.res[res] += n;
      return { text: `A travelling merchant stayed the night and paid with ${n} ${res}.`, kind: 'good' };
    },
  },
  {
    id: 'sunshine',
    weight: (s, m) => (m >= 2 && m <= 5 && s.buildings.some((b) => b.type === 'farm') ? 2 : 0),
    apply: (s) => {
      for (const b of s.buildings) if (b.type === 'farm' && b.growth > 0) b.growth = Math.min(1, b.growth + 0.15);
      return { text: 'Warm rain and sunshine: the crops are growing fast.', kind: 'good' };
    },
  },
  {
    id: 'festival',
    weight: (s) => (has(s, 'maypole') ? 2 : 0),
    apply: (s) => {
      s.happiness = Math.min(100, s.happiness + 6);
      return { text: 'Villagers danced around the maypole late into the night. Spirits are high!', kind: 'good' };
    },
  },
  {
    id: 'wolves',
    weight: (s) => (s.res.meat >= 15 ? 1 : 0),
    apply: (s) => {
      const n = Math.min(s.res.meat, 10);
      s.res.meat -= n;
      return { text: `Wolves raided the smokehouse and took ${n} meat.`, kind: 'bad' };
    },
  },
  {
    id: 'rats',
    weight: (s) => (s.res.grain >= 40 ? 1 : 0),
    apply: (s) => {
      const n = Math.floor(s.res.grain * 0.1);
      s.res.grain -= n;
      return { text: `Rats got into the grain stores. ${n} grain was spoiled.`, kind: 'bad' };
    },
  },
  {
    id: 'collector',
    weight: (s) => (s.res.gold >= 400 ? 1 : 0),
    apply: (s) => {
      const n = Math.floor(s.res.gold * 0.1);
      s.res.gold -= n;
      return { text: `The king's tax collector rode through and claimed ${n} gold.`, kind: 'bad' };
    },
  },
  {
    id: 'frost',
    weight: (s, m) => (m >= 9 && s.res.wood >= 20 ? 1 : 0),
    apply: (s) => {
      const n = Math.min(s.res.wood, 10);
      s.res.wood -= n;
      return { text: `A bitter frost. Families burned ${n} extra timber to stay warm.`, kind: 'bad' };
    },
  },
  {
    id: 'ore',
    weight: (s) => (s.tier >= 1 ? 1 : 0),
    apply: (s) => {
      s.res.iron += 5;
      return { text: 'A shepherd found iron nuggets in a stream bed: +5 iron.', kind: 'good' };
    },
  },
];

/** Chance each month that something noteworthy happens. */
export const EVENT_CHANCE = 0.2;

/** Rolls for a random event at the start of a month. */
export function rollEvent(s: GameState, rng: StateRng, month: number): string | null {
  // Give new players a calm first few months.
  if (s.day < DAYS_PER_MONTH * 4) return null;
  if (rng.next() > EVENT_CHANCE) return null;
  const options = EVENTS.map((e) => ({ e, w: e.weight(s, month) })).filter((o) => o.w > 0);
  const total = options.reduce((a, o) => a + o.w, 0);
  if (!total) return null;
  let r = rng.next() * total;
  for (const o of options) {
    r -= o.w;
    if (r > 0) continue;
    const res = o.e.apply(s, rng);
    if (!res) return null;
    s.messages.push({ day: s.day, text: res.text, kind: res.kind });
    return o.e.id;
  }
  return null;
}
