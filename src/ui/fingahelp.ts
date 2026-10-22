import { BUILDINGS } from '../game/data';
import type { BuildingType } from '../game/types';

/**
 * The little portrait of Fingamoboblius on every panel: click it and he pops
 * up and walks you round the panel a page at a time, pointing things out.
 * The texts are his.
 */

/** His face, small: a pointed hat, a white beard, rosy cheeks. */
const FACE = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 9L10 1l5 8z" fill="#4a5a8a"/><circle cx="10" cy="1.6" r="1.1" fill="#e8c860"/><ellipse cx="10" cy="10" rx="4.6" ry="3.8" fill="#f2d2b4"/><circle cx="8.2" cy="9.6" r=".6" fill="#2a1a10"/><circle cx="11.8" cy="9.6" r=".6" fill="#2a1a10"/><circle cx="7" cy="11.2" r=".9" fill="#e8a090"/><circle cx="13" cy="11.2" r=".9" fill="#e8a090"/><path d="M5.6 11.4c0 4.6 2.4 7.6 4.4 7.6s4.4-3 4.4-7.6c-1.2 1.4-2.6 1.8-4.4 1.8s-3.2-.4-4.4-1.8z" fill="#f4f2ec"/><path d="M8.6 12.4c.8.5 2 .5 2.8 0" stroke="#c8b8a8" stroke-width=".6" fill="none"/></svg>`;

/** The button itself, for a panel with help under `key`. */
export function fingaButton(key: string): string {
  return `<button class="finga-help" data-action="finga" data-key="${key}" data-tip="Ask Fingamoboblius about this" aria-label="Ask Fingamoboblius">${FACE}</button>`;
}

/**
 * One page of his explanation: what he says, and what he walks over to and
 * lights up (a selector; pages whose thing is not on screen are left out).
 * `show: 'selected'` lights up the selected building on the map.
 */
export interface HelpPage {
  say: string;
  show?: string;
}

/** The goods chips (food, materials, goods) read alike; only the last word differs. */
function goodsPages(chip: string, first: string, last: string): HelpPage[] {
  return [
    { say: first, show: `#topbar [data-chip="${chip}"]` },
    { say: 'Each kind has its row: what is in store, and how it moved last month. Hover one and I shall whisper who makes it, and who is waiting for it.', show: '#chip-panel table' },
    { say: 'These little pegs are the stock target. Once there is that much, the makers put down their tools and lend a hand elsewhere. Clever, no?', show: '#chip-panel td.keep' },
    { say: 'And "Stop" halts a good altogether, whatever the stock, should you want those hands on something else.', show: '#chip-panel button.stop' },
    { say: 'Down here is the room left in the stores. Full stores mean work wasted, my liege.', show: '#chip-panel .progress' },
    { say: last },
  ];
}

const HELP: Record<string, HelpPage[]> = {
  happy: [
    { say: 'Ah, happiness! The mood of your people. Come, let me show you.', show: '#topbar [data-chip="happy"]' },
    { say: 'This bar is the whole town\'s mood. Above half, settlers come knocking. Below a third... well, families start loading their carts.', show: '#chip-panel .bar' },
    { say: 'Every line in here is something that pleases or grieves them, with its weight. Green helps, red hurts. Simple as porridge.', show: '#chip-panel' },
    { say: 'And this is town talk: what they grumble about in the lanes. Click a line and I shall take you to a home that says it.', show: '#chip-panel .talk' },
    { say: 'Happy folk even work harder, a tenth faster at best. Sad ones drag their feet. So it pays to keep them smiling!', show: '#chip-panel [data-tip^="Happy villagers"]' },
  ],
  pop: [
    { say: 'Your people, my liege, and the beds they have to sleep in.', show: '#topbar [data-chip="pop"]' },
    { say: 'Who is doing what: at work, building, idle, and jobs resting for the season. Idle hands help the builders, so they are never quite wasted.', show: '#chip-panel .labour-sum' },
    { say: 'Errands! Every household walks to market, to the well, to church. That time comes off their work, so build those places near the homes.', show: '#chip-panel [data-tip^="Each household"]' },
    { say: 'Jobs fill by need, food first. A workplace short of hands shows up in this list; click it and I shall walk you there.', show: '#chip-panel .sub' },
    { say: 'A rule of thumb: many idle? Build workplaces. Many short? Build homes, not more workshops.' },
  ],
  food: goodsPages('food', 'The larder! Everything your people can eat, kind by kind.', 'Each villager eats a measure a month, and a varied table makes a happier town. Winter brings nothing in from the fields, so fill the granaries before the frost.'),
  materials: goodsPages('materials', 'Materials and fuel: timber, stone, planks and the like. What everything is built from.', 'Building sites take their materials a load at a time, so keep a little of each in store and the builders never stand about.'),
  goods: goodsPages('goods', 'Goods: what your workshops make from other things. Flour, cloth, ale, tools...', 'Workshops wear out tools and wood parts as they work, too, so keep a few of each in store. A crew with worn gear works a quarter slower.'),
  treasury: [
    { say: 'The treasury! My favourite chip, if I may say so.', show: '#topbar [data-chip="treasury"]' },
    { say: 'Taxes. Higher fills the chest, but your people grumble. And only a manor hall collects them, mind.', show: '#chip-panel .tax' },
    { say: 'Prestige: the standing of your house. It buys titles and charters.', show: '#chip-panel .note' },
    { say: 'Knowledge, gathered month by month, to spend on the learning board.', show: '#chip-panel [data-tip*="Knowledge a month"]' },
    { say: 'With enough prestige you may even become something grander. A fine ring to it!', show: '#chip-panel [data-action="title"]' },
    { say: 'And here: the ledger, with the town\'s numbers over the years, and the charters.', show: '#chip-panel .row' },
  ],
  learning: [
    { say: 'The learning board! Your people\'s knowledge, ready to spend. Let me walk you round it.', show: '.lb-have' },
    { say: 'It has several cloths, one for each part of town life. A badge says how many patches are ready on each.', show: '.lb-tabs' },
    { say: 'Patches that glow can be learned now. Click one to see what it does and what it costs.', show: '.lb-patch.ready' },
    { say: 'Locked ones say what they wait for: a rank, another patch, or something your town must do first.', show: '.lb-patch.locked' },
    { say: 'And patches joined by "or"... those are a choice for good. Choose wisely, my liege!', show: '.lb-or' },
    { say: 'Knowledge grows with the town: churches, schools, monks and fine homes all teach.' },
  ],
  charters: [
    { say: 'The town charters, granted by the crown once you are a Town.', show: '.charter-hall' },
    { say: 'Each tapestry is a path. It makes your town good at one thing, at a small cost somewhere else.', show: '.tapestry' },
    { say: 'The charters go in order along the path, and each costs more prestige than the last.', show: '.t-nodes' },
    { say: 'Click one and its details show here. Two full paths make a fine reign; a Guildhall makes them cheaper.', show: '.charter-detail' },
  ],
  chronicle: [
    { say: 'The milestones of your reign, my liege. Something to tell the grandchildren.', show: '.modal .milestones' },
    { say: 'And below, everything that has happened in your lands. Click an entry and I shall take you to the place.', show: '.modal .chronicle' },
  ],
  production: [
    { say: 'The production book! What each good comes from, and what uses it.', show: '.modal .prodbook' },
    { say: 'How much was made and used of late, and the stock targets. When something runs short, look here first: the chain shows which link is missing.' },
  ],
  ledger: [
    { say: 'The town ledger: your numbers over the years, drawn as charts.', show: '.modal .ledger' },
    { say: 'Watch the lines, my liege. A trouble shows in them long before it knocks at the door.' },
  ],
  lord: [
    { say: 'Your portrait, my liege! Most handsome, if I may.', show: '.lord-portrait' },
    { say: 'Dress yourself here, piece by piece.', show: '.lord-tabs' },
    { say: 'And your arms. They fly on the manor, on the banners and on the town\'s flags.', show: '.lord-flag' },
  ],
  menu: [
    { say: 'The game menu: save and load, settings, and help.', show: '.modal .menu' },
    { say: 'And the seed of your land. The same seed always grows the same land, so friends can play it too.', show: '.modal .seed-line' },
  ],
  newgame: [
    { say: 'A new settlement! How exciting. Let us choose your land.' },
    { say: 'The seed. The same seed always gives the same land, so you can share it with a friend.', show: '.modal #seed' },
    { say: 'Then choose the kind of land and how hard the going should be. Do not worry, I shall be there either way.' },
  ],
  save: [
    { say: 'Your saved towns, my liege.' },
    { say: 'Download one to keep it safe, or to give a friend the very same town.' },
  ],
  help: [
    { say: 'How to play, in short. A good read for a rainy evening.' },
    { say: 'And remember: I am always here. Click my face on any panel and I shall come.' },
  ],
  event: [
    { say: 'Something has happened in your lands, and the choice is yours.', show: '.modal .tale' },
    { say: 'Each answer says what it costs and what it brings. Take your time; the world waits for you.', show: '.modal .choices' },
  ],
  orders: [
    { say: 'Choose a good for this order.' },
    { say: 'Its price is shown. Imports cost a little more than the good is worth, exports bring a little less. The merchants must eat too!' },
  ],
  folk: [
    { say: 'One of your villagers! Where they live, where they work, and what they want.', show: '#inspector' },
    { say: 'Their home\'s needs are the town\'s needs. Meet them, and they will be happy.' },
  ],
  objectives: [
    { say: 'Your rank, my liege, and what the next one needs.', show: '#objectives' },
    { say: 'A bigger settlement opens new things to learn and to build, and its own lore teaches more each month.' },
  ],
};

/** What he says about a panel, page by page (a building's panel: what it is and how its panel reads). */
export function helpPages(key: string): HelpPage[] | null {
  if (key.startsWith('building:')) {
    const type = key.slice(9) as BuildingType;
    const d = BUILDINGS[type];
    if (!d) return null;
    const pages: HelpPage[] = [{ say: `The ${d.name}! ${d.desc}`, show: 'selected' }];
    if (d.workers) {
      pages.push(
        { say: 'These pips are its workers. Click them to choose how many work here; the rest take other jobs or help the builders.', show: '#inspector .labour' },
        { say: 'Priority says who is staffed first when hands are short. High for what you cannot do without!', show: '#inspector .prio' },
        { say: 'It can make more than one thing. Pick one, or leave it on Auto to make whatever is short.', show: '#inspector .product' },
        { say: 'Walking time: the share of the day spent working rather than walking. Look at the map: the lines show where each worker is right now.', show: '#inspector .walk' },
        { say: 'Upkeep: the tools or wood parts the work wears out, taken from the stores as they go.', show: '#inspector .upkeep' },
        { say: 'Its improvements: learn them on the learning board, then build them here.', show: '#inspector .imps' },
      );
    }
    pages.push({ say: 'And this line says what it is doing right now, or what is holding it up.', show: '#inspector .status' });
    return pages;
  }
  return HELP[key] ?? null;
}

/** Whether he has anything to say about a panel. */
export function hasHelp(key: string): boolean {
  return !!helpPages(key);
}
