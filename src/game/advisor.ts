import { DAYS_PER_MONTH } from './data';
import { labourSummary, totalHousing } from './sim';
import type { GameState } from './types';
import { FOOD_IDS } from './data';

/** Minimum days between repeats of the same piece of advice. */
const COOLDOWN = DAYS_PER_MONTH * 6;

interface Advice {
  id: string;
  when: (s: GameState, month: number) => boolean;
  text: (s: GameState) => string;
}

const food = (s: GameState) => FOOD_IDS.reduce((a, f) => a + s.res[f], 0);
const homes = (s: GameState) => s.buildings.filter((b) => b.residents > 0).length;

const ADVICE: Advice[] = [
  {
    id: 'food-low',
    when: (s) => s.population > 0 && food(s) < s.population * 2 && s.report.shortage === 0,
    text: (s) =>
      `Steward: our food stores (${Math.floor(food(s))}) will last barely two months. Build another forager, hunter, fisher or farm.`,
  },
  {
    id: 'firewood',
    when: (s, m) => m >= 6 && m <= 8 && s.res.firewood + s.res.wood / 2 < homes(s) * 3 + 5,
    text: (s) =>
      `Steward: winter is coming. Each home burns a bundle of firewood a month, or two logs of timber. We need about ${homes(s) * 3} firewood; set a woodcutter to split firewood.`,
  },
  {
    id: 'housing',
    when: (s) => s.happiness >= 50 && s.report.shortage === 0 && totalHousing(s) <= s.population,
    text: () => 'Steward: settlers would gladly come, but every home is full. Build more houses.',
  },
  {
    id: 'unhappy',
    when: (s) => s.happiness < 45 && s.report.shortage === 0,
    text: () => 'Steward: the people grumble. Wells, varied food, decorations or lower taxes would cheer them.',
  },
  {
    id: 'idle-jobs',
    when: (s) => {
      const l = labourSummary(s);
      return l.idle === 0 && l.short.some((x) => x.have === 0);
    },
    text: () =>
      'Steward: some workplaces stand empty for lack of hands. More houses bring more workers; or raise the priority of the work that matters and give less to the rest.',
  },
];

/** Offers at most one timely tip per month. */
export function advise(s: GameState, month: number): void {
  s.advice ??= {};
  for (const a of ADVICE) {
    const last = s.advice[a.id] ?? -Infinity;
    if (s.day - last < COOLDOWN || !a.when(s, month)) continue;
    s.advice[a.id] = s.day;
    s.messages.push({ day: s.day, text: a.text(s), kind: 'advice' });
    return;
  }
}
