import { BUILDINGS } from '../game/data';
import { buildingName } from '../game/levels';
import type { Building, BuildingType, GameState } from '../game/types';
import type { Agent } from '../render/agents';

/**
 * Names and passing thoughts for the villagers walking the map. They are
 * made up from each figure's key, so the same person keeps their name.
 */

const FIRST = [
  'Agnes', 'Alice', 'Beatrice', 'Cecily', 'Edith', 'Emma', 'Isabel', 'Joan', 'Margery', 'Matilda', 'Maud', 'Rose',
  'Adam', 'Alan', 'Geoffrey', 'Gilbert', 'Hugh', 'John', 'Nicholas', 'Ralph', 'Richard', 'Robert', 'Simon', 'Walter', 'William', 'Thomas',
];
const PLACE = ['Atwood', 'Brook', 'Hill', 'Green', 'Marsh', 'Ford', 'Lane', 'Underhill', 'Westbrook', 'Ashby', 'Holt', 'Dale'];
const TRADE_NAMES: Partial<Record<BuildingType, string>> = {
  woodcutter: 'Woodward',
  forester: 'Forester',
  quarry: 'Quarrier',
  mine: 'Collier',
  claypit: 'Potter',
  forager: 'Gatherer',
  hunter: 'Hunter',
  fisher: 'Fisher',
  farm: 'Fielding',
  byre: 'Shepherd',
  orchardist: 'Appleby',
  windmill: 'Miller',
  bakery: 'Baker',
  brewhouse: 'Brewer',
  dairy: 'Dairyman',
  winery: 'Vintner',
  sawmill: 'Sawyer',
  tanner: 'Tanner',
  weaver: 'Webster',
  tailor: 'Taylor',
  carpenter: 'Carpenter',
  stonemason: 'Mason',
  kiln: 'Tyler',
  bloomery: 'Smelter',
  smithy: 'Smith',
  armoury: 'Armourer',
  jeweller: 'Goldsmith',
  market: 'Chapman',
  tavern: 'Taverner',
  apothecary: 'Leech',
  scriptorium: 'Scrivener',
  church: 'Clerk',
  cathedral: 'Canon',
  guildhall: 'Alderman',
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The workplace a villager walks to, if any. */
export function workplaceOf(s: GameState, a: Agent): Building | undefined {
  const r = a.role;
  return r.kind === 'work' || r.kind === 'build' ? s.buildings.find((b) => b.id === r.id) : undefined;
}

export function folkName(s: GameState, a: Agent): string {
  const h = hash(`${a.home}:${a.key}`);
  const first = FIRST[h % FIRST.length];
  const work = workplaceOf(s, a);
  if (a.role.kind === 'guard') return `${first} the man-at-arms`;
  const trade = a.role.kind === 'work' && work ? TRADE_NAMES[work.trade ?? work.type] : undefined;
  return `${first} ${trade ?? PLACE[(h >>> 8) % PLACE.length]}`;
}

/** What the villager is about: their trade or task right now. */
export function folkDoing(s: GameState, a: Agent): string {
  const work = workplaceOf(s, a);
  switch (a.role.kind) {
    case 'work':
      return work ? `Works at the ${buildingName(work)}` : 'Between jobs';
    case 'build':
      return work ? `Building the ${BUILDINGS[work.type].name}` : 'Lending a hand on the building sites';
    case 'guard':
      return "Keeps watch at the lord's manor";
    case 'settler':
      return 'Newly come to settle here';
    default:
      return 'No work today: strolling, chatting, resting';
  }
}

export const WISHES: Record<string, string> = {
  'Enough food': 'My belly grumbles. Is there nothing in the granary?',
  'Firewood in winter': 'Our hearth was cold all winter.',
  'A well nearby': 'If only the well were not so far to carry water.',
  'A market nearby': 'A market close by would save my legs.',
  'A tavern with drink': 'A mug of ale with the neighbours, that is all I ask.',
  'Two food groups': 'Pottage again! I would give much for some variety.',
  'Three food groups': 'Bread, meat, something green... we eat the same every day.',
  Clothes: 'My cloak is more holes than cloth.',
  'A church nearby': 'The church is so far that we miss mass.',
  Boots: 'My boots let in the rain.',
  Medicine: 'My mother coughs, and there is no medicine to be had.',
};

/** A passing thought, from what their home lacks or what cheers the town. */
export function folkThought(s: GameState, a: Agent): string {
  const home = s.buildings.find((b) => b.id === a.home);
  const h = hash(a.key);
  if (s.report.shortage > 0) return 'There was not enough to eat last month. Times are hard.';
  const unmet = home?.unmet ?? [];
  if (unmet.length) return WISHES[unmet[h % unmet.length]] ?? `I wish we had ${unmet[0].toLowerCase()}.`;
  const good = (s.happinessFactors ?? []).filter((f) => f.value > 0 && f.label !== 'Base contentment');
  if (good.length) {
    const f = good[h % good.length];
    return `Life is good here. ${f.label} — what more could one want?`;
  }
  if (s.happiness < 40) return 'I have half a mind to pack up and leave.';
  return 'A quiet day in a quiet corner of the land.';
}
