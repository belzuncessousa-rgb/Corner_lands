import { BUILDINGS } from '../game/data';
import type { BuildingType } from '../game/types';

/**
 * The little portrait of Fingamoboblius on every panel: click it and he pops
 * up beside the panel to explain what it is for. The texts are his.
 */

/** His face, small: a pointed hat, a white beard, rosy cheeks. */
const FACE = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 9L10 1l5 8z" fill="#4a5a8a"/><circle cx="10" cy="1.6" r="1.1" fill="#e8c860"/><ellipse cx="10" cy="10" rx="4.6" ry="3.8" fill="#f2d2b4"/><circle cx="8.2" cy="9.6" r=".6" fill="#2a1a10"/><circle cx="11.8" cy="9.6" r=".6" fill="#2a1a10"/><circle cx="7" cy="11.2" r=".9" fill="#e8a090"/><circle cx="13" cy="11.2" r=".9" fill="#e8a090"/><path d="M5.6 11.4c0 4.6 2.4 7.6 4.4 7.6s4.4-3 4.4-7.6c-1.2 1.4-2.6 1.8-4.4 1.8s-3.2-.4-4.4-1.8z" fill="#f4f2ec"/><path d="M8.6 12.4c.8.5 2 .5 2.8 0" stroke="#c8b8a8" stroke-width=".6" fill="none"/></svg>`;

/** The button itself, for a panel with help under `key`. */
export function fingaButton(key: string): string {
  return `<button class="finga-help" data-action="finga" data-key="${key}" data-tip="Ask Fingamoboblius about this" aria-label="Ask Fingamoboblius">${FACE}</button>`;
}

const HELP: Record<string, string> = {
  happy: 'Happiness, my liege: what pleases your people and what grieves them, each with its weight. Happy folk work harder, and more settlers come; unhappy ones work slower, and some pack up and leave.',
  pop: 'Your people: how many there are, how many homes have room, and who works where. Jobs fill by need, food first. Idle hands help the builders; if too many are short, build homes, not more workshops.',
  food: 'The food in the stores, kind by kind, and how many months it lasts. Each villager eats a measure a month. Several kinds of food make a more contented town, and winter brings nothing in from the fields.',
  materials: 'Building materials and fuel: timber, stone, planks and the like. Each has a stock target: once there is enough in store, its makers rest and their workers go elsewhere.',
  goods: 'Goods your workshops make: flour, cloth, ale, tools and the luxuries the finest homes ask for. Workshops also wear out tools and wood parts, so keep a few in store.',
  treasury: 'The treasury: taxes, trade and upkeep, month by month. Taxes come only with a manor hall, which can tax five and forty villagers; tax offices reach more. Here too: prestige, the lord\'s title and his works of art.',
  learning: 'The learning board! Spend your people\'s knowledge here. Patches that glow can be learned now; locked ones say what they wait for. Threads show what opens what, and patches joined by "or" are a choice for good. Knowledge grows with the town, and with churches, schools, monks and fine homes.',
  charters: 'The town charters, granted by the crown for prestige once you are a Town. Each path makes your town good at one thing, at a small cost elsewhere, and each charter costs more than the last: two full paths are a fine reign. A Guildhall makes them cheaper.',
  chronicle: 'The chronicle: everything that has happened in your lands, and the milestones of your reign. Click an entry to look at the place.',
  production: 'The production book: what each good comes from and what uses it, how much was made and used of late, and the stock targets. When something runs short, this is where to look for why.',
  ledger: 'The town ledger: the town\'s numbers over the years, drawn as charts. Watch the lines to see a trouble coming before it arrives.',
  lord: 'Your portrait and your arms, my liege. They fly on the manor, the banners and the town\'s flags.',
  menu: 'The game menu: save and load, settings and help.',
  newgame: 'Founding a new settlement: choose the land, its name and how hard the going should be. The same seed always gives the same land, so friends can play the same one.',
  save: 'Your saved towns. Download one to keep it, or to give a friend the very same town.',
  help: 'How to play, in short. And I am always here: click my face on any panel.',
  event: 'Something has happened in your lands, and the choice is yours. Each answer says what it costs and what it brings.',
  orders: 'Choose a good for this order. Its price is shown; imports cost a little more than the good is worth, exports bring a little less.',
  folk: 'One of your villagers: where they live, where they work, and what they want. Their home\'s needs are the town\'s needs.',
  objectives: 'Your rank, and what the next one needs. A bigger settlement opens new things to learn and to build, and its own lore teaches more each month.',
};

/** What he says about a panel (a building's panel: what it is and how its panel reads). */
export function helpText(key: string): string | null {
  if (key.startsWith('building:')) {
    const type = key.slice(9) as BuildingType;
    const d = BUILDINGS[type];
    if (!d) return null;
    const workers = d.workers ? ' The panel shows its workers (set how many you want, and its priority), what it makes, what it lacks, and what slows it.' : '';
    const improve = ' Below are its improvements: learn them on the learning board, then build them here.';
    return `${d.name}: ${d.desc}${workers}${d.workers ? improve : ''}`;
  }
  return HELP[key] ?? null;
}
