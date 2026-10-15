import { DAYS_PER_MONTH, FOOD_IDS, GOODS, RESOURCE_STORAGE } from './data';
import type { StorageKind } from './data';
import { harvestForecast, labourSummary, storageCap, stored, totalHousing } from './sim';
import { RESOURCE_IDS } from './types';
import type { GameState } from './types';

/** Minimum days between repeats of the same piece of advice. */
const COOLDOWN = DAYS_PER_MONTH * 6;

interface Advice {
  id: string;
  when: (s: GameState, month: number) => boolean;
  text: (s: GameState) => string;
}

const food = (s: GameState) => FOOD_IDS.reduce((a, f) => a + s.res[f], 0);
const homes = (s: GameState) => s.buildings.filter((b) => b.residents > 0).length;

/** ", mostly planks (87) and dressed stone (64)": the biggest piles in a store. */
function piles(s: GameState, kind: StorageKind): string {
  const top = RESOURCE_IDS.filter((r) => RESOURCE_STORAGE[r] === kind && s.res[r] >= 1)
    .sort((a, b) => s.res[b] - s.res[a])
    .slice(0, 2)
    .map((r) => `${GOODS[r].name.toLowerCase()} (${Math.floor(s.res[r])})`);
  return top.length ? `, mostly ${top.join(' and ')}` : '';
}

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
  {
    id: 'no-fields',
    when: (s) => s.buildings.some((b) => b.type === 'farm' && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    text: () => 'Steward: our farmstead has no fields. Choose Field in the Farming menu and draw it beside the farm: click one corner, then the other.',
  },
  {
    id: 'no-pasture',
    when: (s) => s.buildings.some((b) => (b.type === 'byre' || b.type === 'orchardist') && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    text: () => 'Steward: the animal farm or orchard lodge has nothing to tend. Draw a pasture or plant an orchard next to it.',
  },
  {
    id: 'tavern-dry',
    when: (s) => s.buildings.some((b) => b.type === 'tavern' && b.build >= 1 && b.blocked === 1),
    text: () => 'Steward: the tavern casks are dry. A Brewhouse brews ale from barley (sow a barley field) or presses cider from apples.',
  },
  {
    id: 'clothes',
    when: (s) => s.res.clothes < 1 && s.buildings.some((b) => b.type === 'house' && b.level >= 2 && b.unmet?.includes('Clothes')),
    text: () => 'Steward: the families in Timber Houses need clothes. Shear sheep or grow flax, weave cloth and have a tailor sew it, or buy clothes at the market.',
  },
  {
    id: 'harvest-room',
    when: (s, m) => (m === 5 || m === 6) && harvestForecast(s).some((h) => h.expected > h.room + 10),
    text: (s) => {
      const h = harvestForecast(s).find((x) => x.expected > x.room + 10)!;
      const store = h.kind === 'food' ? 'granaries' : 'storehouses';
      const build = h.kind === 'food' ? 'a Granary' : 'a Storehouse';
      return `Steward: the harvest is near. The fields should bring in about ${h.expected}, but the ${store} and the farm barns have room for only ${h.room}; the rest will spoil. Build ${build} or sell some stock before autumn.`;
    },
  },
  {
    id: 'storage',
    when: (s) => storageCap(s, 'materials') > 0 && stored(s, 'materials') >= storageCap(s, 'materials') - 5,
    text: (s) =>
      `Steward: the storehouses are full${piles(s, 'materials')}, so quarries and woodcutters stand idle. Build another Storehouse, sell the surplus, or lower some stock targets.`,
  },
  {
    id: 'granary',
    when: (s) => storageCap(s, 'food') > 0 && stored(s, 'food') >= storageCap(s, 'food') - 5,
    text: (s) =>
      `Steward: the granaries are full${piles(s, 'food')}, so the harvest and the hunt go to waste. Build a Granary or sell what we cannot eat.`,
  },
  {
    id: 'charter',
    when: (s) => s.tier >= 2 && !(s.charters?.length) && s.res.prestige >= 40,
    text: () => 'Steward: the crown would grant us a charter for our prestige. Open the charters (crown button) and choose what our town should become.',
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
