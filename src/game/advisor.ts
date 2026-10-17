import { BUILDINGS, DAYS_PER_MONTH, FOOD_IDS, GOODS, RESOURCE_STORAGE } from './data';
import type { StorageKind } from './data';
import { harvestForecast, isUnlocked, keepOf, labourSummary, log, winterBundles, storageCap, stored, totalHousing } from './sim';
import { RESOURCE_IDS } from './types';
import type { Building, BuildingType, GameState, ResourceId } from './types';

/** Minimum days between repeats of the same piece of advice. */
const COOLDOWN = DAYS_PER_MONTH * 6;

interface Advice {
  id: string;
  when: (s: GameState, month: number) => boolean;
  text: (s: GameState) => string;
  /** The building the advice is about, so the toast can show it. */
  at?: (s: GameState) => Building | undefined;
}

const food = (s: GameState) => FOOD_IDS.reduce((a, f) => a + s.res[f], 0);
/** Villager-months the stored food would feed (bread goes three times as far). */
const fed = (s: GameState) => FOOD_IDS.reduce((a, f) => a + s.res[f] * (GOODS[f].food ?? 1), 0);
const homes = (s: GameState) => s.buildings.filter((b) => b.residents > 0).length;

/** ", mostly planks (87) and dressed stone (64)": the biggest piles in a store. */
function piles(s: GameState, kind: StorageKind): string {
  const top = RESOURCE_IDS.filter((r) => RESOURCE_STORAGE[r] === kind && s.res[r] >= 1)
    .sort((a, b) => s.res[b] - s.res[a])
    .slice(0, 2)
    .map((r) => `${GOODS[r].name.toLowerCase()} (${Math.floor(s.res[r])})`);
  return top.length ? `, mostly ${top.join(' and ')}` : '';
}

/** Raw goods that pile up unused, and the workshop that would use them. */
const USERS: { good: ResourceId; by: BuildingType; makes: string }[] = [
  { good: 'hides', by: 'tanner', makes: 'leather for boots' },
  { good: 'wool', by: 'weaver', makes: 'cloth for clothes' },
  { good: 'flax', by: 'weaver', makes: 'linen for clothes' },
  { good: 'barley', by: 'brewhouse', makes: 'ale for the taverns' },
  { good: 'grain', by: 'windmill', makes: 'flour for the bakers' },
  { good: 'milk', by: 'dairy', makes: 'cheese' },
];
const built = (s: GameState, t: BuildingType) => s.buildings.some((b) => b.type === t && b.build >= 1);

/** The largest unused pile, if any is worth a word. */
function unusedPile(s: GameState): (typeof USERS)[number] | undefined {
  return USERS.filter((u) => s.res[u.good] >= 80 && !built(s, u.by) && !s.buildings.some((b) => b.type === u.by) && isUnlocked(s, u.by))
    .sort((a, b) => s.res[b.good] - s.res[a.good])[0];
}

/** Workplaces a town with spare hands would most likely use. */
function usefulJobs(s: GameState): string {
  const ideas: string[] = [];
  const u = unusedPile(s);
  if (u) ideas.push(`a ${BUILDINGS[u.by].name} for the ${GOODS[u.good].name.toLowerCase()} in store`);
  if (food(s) < s.population * 3) ideas.push('another farm, fisher or hunter');
  if (s.res.planks < 30 && isUnlocked(s, 'sawmill')) ideas.push(`a ${BUILDINGS.sawmill.name}`);
  if (s.res.stone < 30) ideas.push('a quarry');
  if (built(s, 'tradingpost')) ideas.push('a workshop whose wares the merchants will buy');
  else ideas.push('woodcutters and quarries, whose surplus merchants at a trading post would buy');
  return ideas.slice(0, 3).join(', or ');
}

/** Wheat each staffed-up windmill grinds in a month, roughly (walking included). */
const MILL_PER_MONTH = 16;

/** Months the windmills need to grind the wheat in store. */
function millMonths(s: GameState): number {
  const mills = s.buildings.filter((b) => b.type === 'windmill' && b.build >= 1).length;
  return mills ? s.res.grain / (mills * MILL_PER_MONTH) : Infinity;
}

const ADVICE: Advice[] = [
  {
    id: 'no-market',
    when: (s) => !s.buildings.some((b) => b.type === 'market') && s.day >= 3,
    text: () => 'Steward: our people can only get their food and goods at a market. Lay out a Marketplace near the homes (Civic): it is free, and the cart we came with will not last past the second month.',
  },
  {
    id: 'unserved',
    when: (s) => (s.report.unserved ?? 0) > 0,
    text: (s) => `Steward: ${s.report.unserved} villagers live out of reach of a staffed market and went without. Lay out a Marketplace near their homes, or see that its stalls have vendors.`,
  },
  {
    id: 'errands',
    when: (s) => (s.report.errands ?? 0) > 0.22,
    text: (s) => `Steward: our people lose ${Math.round((s.report.errands ?? 0) * 100)}% of their working time walking to market, the well, church and the tavern. These places nearer the homes would give us that time back.`,
  },
  {
    id: 'food-low',
    when: (s) => s.population > 0 && fed(s) < s.population * 2 && s.report.shortage === 0,
    text: (s) =>
      s.res.grain >= s.population * 2
        ? `Steward: our food stores (${Math.floor(food(s))}) will last barely two months, though ${Math.floor(s.res.grain)} sacks of grain wait unground. Windmills and Bakeries would turn them into bread that feeds three times as many.`
        : `Steward: our food stores (${Math.floor(food(s))}) will last barely two months. Build another forager, hunter, fisher or farm.`,
  },
  {
    id: 'firewood',
    when: (s, m) => m >= 6 && m <= 8 && s.res.firewood + s.res.wood / 2 < homes(s) * 3 * winterBundles(s) + 5,
    text: (s) =>
      `Steward: winter is coming. Each home burns a bundle of firewood a month, or two logs of timber. We need about ${homes(s) * 3 * winterBundles(s)} firewood; set a woodcutter to split firewood.`,
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
    at: (s) => labourSummary(s).short.find((x) => x.have === 0)?.b,
    text: () =>
      'Steward: some workplaces stand empty for lack of hands. More houses bring more workers; or raise the priority of the work that matters and give less to the rest.',
  },
  {
    id: 'no-fields',
    when: (s) => s.buildings.some((b) => b.type === 'farm' && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    at: (s) => s.buildings.find((b) => b.type === 'farm' && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    text: () => 'Steward: our farmstead has no fields. Choose Field in the Farming menu and draw it beside the farm: click one corner, then the other.',
  },
  {
    id: 'no-pasture',
    when: (s) => s.buildings.some((b) => (b.type === 'byre' || b.type === 'orchardist') && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    at: (s) => s.buildings.find((b) => (b.type === 'byre' || b.type === 'orchardist') && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    text: () => 'Steward: the animal farm or orchard lodge has nothing to tend. Draw a pasture or plant an orchard next to it.',
  },
  {
    id: 'mills',
    when: (s) => s.tier >= 1 && s.res.grain >= 100 && millMonths(s) > 4,
    at: (s) => s.buildings.find((b) => b.type === 'windmill' && b.build >= 1) ?? s.buildings.find((b) => b.type === 'granary'),
    text: (s) => {
      const mills = s.buildings.filter((b) => b.type === 'windmill' && b.build >= 1).length;
      // The bakers rest once the bread in store reaches its target: more mills would not help.
      if (mills && s.res.bread >= keepOf(s, 'bread'))
        return `Steward: ${Math.floor(s.res.grain)} wheat waits in the granaries, but the bakers rest: the bread in store has reached its target of ${keepOf(s, 'bread')}. Raise the bread target in the Food panel to bake more, or sell the surplus wheat.`;
      return mills
        ? `Steward: ${Math.floor(s.res.grain)} wheat waits in the granaries, about ${Math.round(millMonths(s))} months of grinding for our ${mills > 1 ? `${mills} windmills` : 'windmill'}. Another Windmill and Bakery would turn it into bread sooner.`
        : `Steward: ${Math.floor(s.res.grain)} wheat sits unground. A Windmill grinds it into flour and a Bakery bakes the bread, which feeds three times as many as pottage.`;
    },
  },
  {
    id: 'ovens',
    when: (s) => s.res.flour >= 60 && s.res.bread < keepOf(s, 'bread') && s.buildings.filter((b) => b.type === 'bakery' && b.build >= 1).length < 2,
    text: () => 'Steward: flour is piling up faster than the ovens can bake it. Build another Bakery, or let a family bake at home.',
  },
  {
    id: 'tavern-dry',
    when: (s) => s.buildings.some((b) => b.type === 'tavern' && b.build >= 1 && b.blocked === 1),
    at: (s) => s.buildings.find((b) => b.type === 'tavern' && b.build >= 1 && b.blocked === 1),
    text: (s) => {
      const brewers = s.buildings.filter((b) => b.type === 'brewhouse' && b.build >= 1).length;
      if (s.res.barley >= 20)
        return brewers
          ? `Steward: the tavern casks are dry, yet ${Math.floor(s.res.barley)} barley waits in the granaries. Build another Brewhouse, or give the one we have more hands.`
          : `Steward: the tavern casks are dry, yet ${Math.floor(s.res.barley)} barley waits in the granaries. Build a Brewhouse to brew it into ale.`;
      return 'Steward: the tavern casks are dry. A Brewhouse brews ale from barley (sow a barley field) or presses cider from apples.';
    },
  },
  {
    id: 'clothes',
    when: (s) => s.res.clothes < 1 && s.buildings.some((b) => b.type === 'house' && b.level >= 2 && b.unmet?.includes('Clothes')),
    at: (s) => s.buildings.find((b) => b.type === 'house' && b.level >= 2 && b.unmet?.includes('Clothes')),
    text: () => 'Steward: the families in Timber Houses need clothes. Shear sheep or grow flax, weave cloth and have a tailor sew it, or buy clothes at the market.',
  },
  {
    id: 'harvest-room',
    when: (s, m) => (m === 5 || m === 6) && harvestForecast(s).some((h) => h.expected > h.room + 10),
    text: (s) => {
      const h = harvestForecast(s).find((x) => x.expected > x.room + 10)!;
      const store = h.kind === 'food' ? 'granaries' : 'storehouses';
      const build = h.kind === 'food' ? 'a Granary' : 'a Storehouse';
      return `Steward: the harvest is near. The fields should bring in about ${h.expected}, but the ${store} and the farm barns have room for only ${h.room}${h.room < h.expected / 4 ? `; they are full${piles(s, h.kind)}` : ''}; the rest will spoil. Build ${build} or sell some stock before autumn.`;
    },
  },
  {
    id: 'storage',
    when: (s) => storageCap(s, 'materials') > 0 && stored(s, 'materials') >= storageCap(s, 'materials') - 5,
    at: (s) => s.buildings.find((b) => b.type === 'storehouse'),
    text: (s) =>
      `Steward: the storehouses are full${piles(s, 'materials')}, so quarries and woodcutters stand idle. Build another Storehouse, sell the surplus, or lower some stock targets.`,
  },
  {
    id: 'granary',
    when: (s) => storageCap(s, 'food') > 0 && stored(s, 'food') >= storageCap(s, 'food') - 5,
    at: (s) => s.buildings.find((b) => b.type === 'granary'),
    text: (s) =>
      `Steward: the granaries are full${piles(s, 'food')}, so the harvest and the hunt go to waste. Build a Granary or sell what we cannot eat.`,
  },
  {
    id: 'charter',
    when: (s) => s.tier >= 2 && !(s.charters?.length) && s.res.prestige >= 40,
    text: () => 'Steward: the crown would grant us a charter for our prestige. Open the charters (crown button) and choose what our town should become.',
  },
  {
    id: 'pottage',
    when: (s) => s.population >= 20 && (s.report.pottage ?? 0) >= s.population * 0.3 && s.report.shortage === 0,
    text: (s) =>
      `Steward: ${s.report.pottage} villagers lived on pottage last month, grain boiled whole for want of better food. Bread from a Windmill and a Bakery feeds three times as many from the same wheat; hunters and fishers add variety.`,
  },
  {
    id: 'idle-hands',
    when: (s) => {
      const l = labourSummary(s);
      return s.population >= 20 && l.idle >= Math.max(8, s.population * 0.15) && l.builders < l.idle;
    },
    text: (s) =>
      `Steward: ${labourSummary(s).idle} villagers have no work. They could serve in ${usefulJobs(s)}.`,
  },
  {
    id: 'unused-pile',
    when: (s) => !!unusedPile(s),
    text: (s) => {
      const u = unusedPile(s)!;
      return `Steward: ${Math.floor(s.res[u.good])} ${GOODS[u.good].name.toLowerCase()} lie unused in our stores. A ${BUILDINGS[u.by].name} would turn them into ${u.makes}, or sell them at the market.`;
    },
  },
];

/** Offers at most one timely tip per month. */
export function advise(s: GameState, month: number): void {
  s.advice ??= {};
  for (const a of ADVICE) {
    const last = s.advice[a.id] ?? -Infinity;
    if (s.day - last < COOLDOWN || !a.when(s, month)) continue;
    s.advice[a.id] = s.day;
    log(s, a.text(s), 'advice', a.at?.(s));
    return;
  }
}
