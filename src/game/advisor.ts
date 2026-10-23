import { BUILDINGS, DAYS_PER_MONTH, FOOD_IDS, GOODS, RESOURCE_STORAGE } from './data';
import type { StorageKind } from './data';
import { harvestForecast, isUnlocked, keepOf, labourSummary, log, monthOf, winterBundles, storageCap, stored, totalHousing } from './sim';
import { RESOURCE_IDS } from './types';
import type { Alert, Building, BuildingType, GameState, ResourceId } from './types';

/** Minimum days between repeats of the same tip. */
const COOLDOWN = DAYS_PER_MONTH * 6;
/** A dismissed warning stays away this long while the trouble lasts. */
const SNOOZE = DAYS_PER_MONTH * 3;
/** Tips showing at once, at most. */
const MAX_TIPS = 2;

interface Advice {
  id: string;
  /** alert: an emergency, for everyone (red); tip: help for the tutorial only (yellow). */
  level: Alert['level'];
  /** A few words for the tab. */
  title: string;
  when: (s: GameState, month: number) => boolean;
  text: (s: GameState) => string;
  /** The building the advice is about, so the tab can show it. */
  at?: (s: GameState) => Building | undefined;
}

const food = (s: GameState) => FOOD_IDS.reduce((a, f) => a + s.res[f], 0);
/** Villager-months the stored food would feed (bread goes three times as far). */
const fed = (s: GameState) => FOOD_IDS.reduce((a, f) => a + s.res[f] * (GOODS[f].food ?? 1), 0);
const homes = (s: GameState) => s.buildings.filter((b) => b.residents > 0).length;
/** Winter months still to heat from month m: three from late summer, fewer once winter has begun. */
const winterLeft = (m: number) => (m >= 6 && m <= 9 ? 3 : m === 10 ? 2 : m === 11 ? 1 : 0);
/** Firewood the homes still need for this winter. */
const firewoodNeed = (s: GameState, m: number) => homes(s) * winterLeft(m) * winterBundles(s);

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
  // A watermill grinds twice what a windmill does.
  const mills = s.buildings.reduce((n, b) => n + (b.build < 1 ? 0 : b.type === 'windmill' ? 1 : b.type === 'watermill' ? 2 : 0), 0);
  return mills ? s.res.grain / (mills * MILL_PER_MONTH) : Infinity;
}

const ADVICE: Advice[] = [
  {
    id: 'no-market',
    level: 'alert',
    title: 'No marketplace',
    when: (s) => !s.buildings.some((b) => b.type === 'market') && s.day >= 3,
    text: () => 'Steward: our people can only get their food and goods at a market. Lay out a Marketplace near the homes (Civic): it is free, and the cart we came with will not last past the second month.',
  },
  {
    id: 'worn-gear',
    level: 'alert',
    title: 'Worn-out gear',
    when: (s) => s.buildings.some((b) => b.worn),
    at: (s) => s.buildings.find((b) => b.worn),
    text: (s) => {
      const worn = s.buildings.filter((b) => b.worn);
      const tools = worn.some((b) => (b.upkeep?.tools ?? 0) >= 1);
      const parts = worn.some((b) => (b.upkeep?.woodparts ?? 0) >= 1);
      const what = [tools ? 'tools' : '', parts ? 'wood parts' : ''].filter(Boolean).join(' and ');
      return `Steward: ${worn.length > 1 ? `${worn.length} workplaces are` : 'a workplace is'} working with worn-out gear and ${worn.length > 1 ? 'go' : 'goes'} a quarter slower. We need ${what}: a ${tools ? 'Blacksmith' : "Carpenter's Workshop"} would make them, or the merchants can bring some.`;
    },
  },
  {
    id: 'unserved',
    level: 'alert',
    title: 'No market stall',
    when: (s) => (s.report.unserved ?? 0) > 0,
    text: (s) => `Steward: ${s.report.unserved} villagers have no market stall to buy their goods at. Each open stall serves ten households: lay out another Marketplace, a bigger one, or see that the stalls have vendors.`,
  },
  {
    id: 'errands',
    level: 'tip',
    title: 'Long errands',
    when: (s) => (s.report.errands ?? 0) > 0.22,
    text: (s) => `Steward: our people lose ${Math.round((s.report.errands ?? 0) * 100)}% of their working time walking to market, the well, church and the tavern. These places nearer the homes would give us that time back.`,
  },
  {
    id: 'food-low',
    level: 'alert',
    title: 'Food running low',
    when: (s) => s.population > 0 && fed(s) < s.population * 2,
    text: (s) =>
      s.res.grain >= s.population * 2
        ? `Steward: our food stores (${Math.floor(food(s))}) will last barely two months, though ${Math.floor(s.res.grain)} sacks of grain wait unground. Windmills and Bakeries would turn them into bread that feeds six times as many.`
        : `Steward: our food stores (${Math.floor(food(s))}) will last barely two months. Build another forager, hunter, fisher or farm.`,
  },
  {
    id: 'firewood',
    level: 'alert',
    title: 'Firewood for winter',
    when: (s, m) => firewoodNeed(s, m) > 0 && s.res.firewood + s.res.wood / 2 < firewoodNeed(s, m),
    text: (s) =>
      `Steward: ${monthOf(s.day) >= 9 ? 'the hearths will run cold before spring' : 'winter is coming'}. Each home burns ${winterBundles(s) > 1 ? 'two bundles' : 'a bundle'} of firewood a month, or twice as many logs of timber. We need about ${firewoodNeed(s, monthOf(s.day))} firewood and have ${Math.floor(s.res.firewood)}; set a woodcutter to split firewood.`,
  },
  {
    id: 'housing',
    level: 'tip',
    title: 'Homes are full',
    when: (s) => s.happiness >= 50 && s.report.shortage === 0 && totalHousing(s) <= s.population,
    text: () => 'Steward: settlers would gladly come, but every home is full. Build more houses.',
  },
  {
    id: 'unhappy',
    level: 'tip',
    title: 'The people grumble',
    when: (s) => s.happiness < 45 && s.report.shortage === 0,
    text: () => 'Steward: the people grumble. Wells, varied food, decorations or lower taxes would cheer them.',
  },
  {
    id: 'idle-jobs',
    level: 'tip',
    title: 'Empty workplaces',
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
    level: 'tip',
    title: 'A farm without fields',
    when: (s) => s.buildings.some((b) => b.type === 'farm' && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    at: (s) => s.buildings.find((b) => b.type === 'farm' && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    text: () => 'Steward: our farmstead has no fields. Choose Field in the Farming menu and draw it beside the farm: click one corner, then the other.',
  },
  {
    id: 'no-pasture',
    level: 'tip',
    title: 'Nothing to tend',
    when: (s) => s.buildings.some((b) => (b.type === 'byre' || b.type === 'orchardist') && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    at: (s) => s.buildings.find((b) => (b.type === 'byre' || b.type === 'orchardist') && b.build >= 1 && !s.buildings.some((z) => z.owner === b.id)),
    text: () => 'Steward: the animal farm or orchard lodge has nothing to tend. Draw a pasture or plant an orchard next to it.',
  },
  {
    id: 'mills',
    level: 'tip',
    title: 'Wheat unground',
    when: (s) => s.tier >= 1 && s.res.grain >= 100 && millMonths(s) > 4,
    at: (s) => s.buildings.find((b) => b.type === 'windmill' && b.build >= 1) ?? s.buildings.find((b) => b.type === 'granary'),
    text: (s) => {
      const mills = s.buildings.filter((b) => b.type === 'windmill' && b.build >= 1).length;
      // The bakers rest once the bread in store reaches its target: more mills would not help.
      if (mills && s.res.bread >= keepOf(s, 'bread'))
        return `Steward: ${Math.floor(s.res.grain)} wheat waits in the granaries, but the bakers rest: the bread in store has reached its target of ${keepOf(s, 'bread')}. Raise the bread target in the Food panel to bake more, or export the surplus wheat from a trading post.`;
      return mills
        ? `Steward: ${Math.floor(s.res.grain)} wheat waits in the granaries, about ${Math.round(millMonths(s))} months of grinding for our ${mills > 1 ? `${mills} windmills` : 'windmill'}. Another Windmill and Bakery would turn it into bread sooner.`
        : `Steward: ${Math.floor(s.res.grain)} wheat sits unground. A Windmill grinds it into flour and a Bakery bakes the bread, which feeds six times as many as pottage.`;
    },
  },
  {
    id: 'ovens',
    level: 'tip',
    title: 'Flour piling up',
    when: (s) => s.res.flour >= 60 && s.res.bread < keepOf(s, 'bread') && s.buildings.filter((b) => b.type === 'bakery' && b.build >= 1).length < 2,
    text: () => 'Steward: flour is piling up faster than the ovens can bake it. Build another Bakery, or let a family bake at home.',
  },
  {
    id: 'tavern-dry',
    level: 'tip',
    title: 'Tavern casks dry',
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
    level: 'tip',
    title: 'Clothes wanted',
    when: (s) => s.res.clothes < 1 && s.buildings.some((b) => b.type === 'house' && b.level >= 2 && b.unmet?.includes('Clothes')),
    at: (s) => s.buildings.find((b) => b.type === 'house' && b.level >= 2 && b.unmet?.includes('Clothes')),
    text: () => 'Steward: the families in Timber Houses need clothes. Shear sheep or grow flax, weave cloth and have a tailor sew it, or buy clothes at the market.',
  },
  {
    id: 'harvest-room',
    level: 'tip',
    title: 'No room for the harvest',
    when: (s, m) => (m === 5 || m === 6) && harvestForecast(s).some((h) => h.expected > h.room + 10),
    text: (s) => {
      const h = harvestForecast(s).find((x) => x.expected > x.room + 10)!;
      const store = h.kind === 'food' ? 'granaries' : 'storehouses';
      const build = h.kind === 'food' ? 'a Silo for the grain, a Granary' : 'a Storehouse';
      return `Steward: the harvest is near. The fields should bring in about ${h.expected}, but the ${store} and the farm barns have room for only ${h.room}${h.room < h.expected / 4 ? `; they are full${piles(s, h.kind)}` : ''}; the rest will spoil. Build ${build} or sell some stock before autumn.`;
    },
  },
  {
    id: 'storage',
    level: 'tip',
    title: 'Storehouses full',
    when: (s) => storageCap(s, 'materials') > 0 && stored(s, 'materials') >= storageCap(s, 'materials') - 5,
    at: (s) => s.buildings.find((b) => b.type === 'storehouse'),
    text: (s) =>
      `Steward: the storehouses are full${piles(s, 'materials')}, so quarries and woodcutters stand idle. Build another Storehouse, export the surplus from a trading post, or lower some stock targets.`,
  },
  {
    id: 'granary',
    level: 'tip',
    title: 'Granaries full',
    when: (s) => storageCap(s, 'food') > 0 && stored(s, 'food') >= storageCap(s, 'food') - 5,
    at: (s) => s.buildings.find((b) => b.type === 'granary'),
    text: (s) =>
      `Steward: the granaries are full${piles(s, 'food')}, so the harvest and the hunt go to waste. Build a Granary or sell what we cannot eat.`,
  },
  {
    id: 'charter',
    level: 'tip',
    title: 'A charter awaits',
    when: (s) => s.tier >= 2 && !(s.charters?.length) && s.res.prestige >= 40,
    text: () => 'Steward: the crown would grant us a charter for our prestige. Open the charters (crown button) and choose what our town should become.',
  },
  {
    id: 'pottage',
    level: 'tip',
    title: 'Living on pottage',
    when: (s) => s.population >= 20 && (s.report.pottage ?? 0) >= s.population * 0.3 && s.report.shortage === 0,
    text: (s) =>
      `Steward: ${s.report.pottage} villagers lived on pottage last month, grain boiled whole for want of better food. Bread from a Windmill and a Bakery feeds six times as many from the same wheat; hunters and fishers add variety.`,
  },
  {
    id: 'idle-hands',
    level: 'tip',
    title: 'Idle villagers',
    when: (s) => {
      const l = labourSummary(s);
      return s.population >= 20 && l.idle >= Math.max(8, s.population * 0.15) && l.builders < l.idle;
    },
    text: (s) =>
      `Steward: ${labourSummary(s).idle} villagers have no work. They could serve in ${usefulJobs(s)}.`,
  },
  {
    id: 'unused-pile',
    level: 'tip',
    title: 'Goods lie unused',
    when: (s) => !!unusedPile(s),
    text: (s) => {
      const u = unusedPile(s)!;
      return `Steward: ${Math.floor(s.res[u.good])} ${GOODS[u.good].name.toLowerCase()} lie unused in our stores. A ${BUILDINGS[u.by].name} would turn them into ${u.makes}, or sell them at the market.`;
    },
  },
];

/** Whether this game gets the steward's tips as well as his warnings. */
const tipsOn = (s: GameState) => !!s.tutorial;

/**
 * Raises the steward's warnings while the trouble lasts (and, in the
 * tutorial, a timely tip a month), and takes down those no longer true.
 */
export function advise(s: GameState, month: number): void {
  s.advice ??= {};
  s.alerts ??= [];
  let tipped = false;
  for (const a of ADVICE) {
    const shown: Alert | undefined = s.alerts.find((x) => x.id === a.id);
    const due = (a.level === 'alert' || tipsOn(s)) && a.when(s, month);
    if (!due) {
      if (shown) s.alerts = s.alerts.filter((x) => x !== shown);
      // A warning that has passed may come back as soon as the trouble does.
      if (a.level === 'alert') delete s.advice[a.id];
      continue;
    }
    const at = a.at?.(s);
    const where = at ? { at: { x: at.x + at.w / 2, y: at.y + at.h / 2 } } : {};
    if (shown) {
      // Still true: the numbers in it may have moved.
      Object.assign(shown, { text: a.text(s), ...where });
      continue;
    }
    const last = s.advice[a.id] ?? -Infinity;
    if (s.day - last < (a.level === 'alert' ? SNOOZE : COOLDOWN)) continue;
    if (a.level === 'tip' && (tipped || s.alerts.filter((x) => x.level === 'tip').length >= MAX_TIPS)) continue;
    if (a.level === 'tip') {
      tipped = true;
      s.advice[a.id] = s.day;
    }
    const text = a.text(s);
    s.alerts.push({ id: a.id, level: a.level, title: a.title, text, day: s.day, ...where });
    log(s, text, 'info', at);
  }
}

/** Takes down warnings and tips whose trouble has passed, between the monthly looks. */
export function clearAlerts(s: GameState): void {
  if (!s.alerts?.length) return;
  const month = monthOf(s.day);
  s.alerts = s.alerts.filter((x) => {
    const a = ADVICE.find((y) => y.id === x.id);
    if (a && a.when(s, month)) return true;
    if (a?.level === 'alert') delete s.advice?.[a.id];
    return false;
  });
}

/** The player waves a warning or tip away: it stays away for a while even if the trouble lasts. */
export function dismissAlert(s: GameState, id: string): void {
  s.alerts = (s.alerts ?? []).filter((x) => x.id !== id);
  (s.advice ??= {})[id] = s.day;
}
