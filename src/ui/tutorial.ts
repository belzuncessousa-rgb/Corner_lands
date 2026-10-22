import type { Game } from '../main';
import { bCenter } from '../game/sim';
import type { GameState } from '../game/types';
import { readyCount } from './learning';
import type { HelpPage } from './fingahelp';

/**
 * The tutorial: Fingamoboblius, an old steward with a beard, walks about the
 * screen with a little spotlight on himself and on whatever he is showing,
 * and talks in a balloon whose letters appear one by one. Some steps wait
 * for the player to do something; the rest wait for a click.
 */

/** The tutorial is always played on the same land. */
export const TUTORIAL_SEED = 209;

type Spot = { x: number; y: number; w: number; h: number; round?: boolean };

interface Step {
  /** What Fingamoboblius says (a function to fit the moment). */
  say: string | ((g: Game) => string);
  /** What to light up: a selector on the interface, or a point in the land. */
  show?: string | ((g: Game) => Spot | null);
  /** Called when the step starts (pan the view, pause, open a menu...). */
  enter?: (g: Game) => void;
  /** The step ends by itself once this holds; otherwise on a click. */
  until?: (g: Game) => boolean;
  /** Let time run while this step waits. */
  run?: boolean;
}

const count = (s: GameState, type: string, built = false) => s.buildings.filter((b) => b.type === type && (!built || b.build >= 1)).length;

/** The nearest map feature to the camp matching a test, as a tile. */
function nearest(s: GameState, test: (i: number) => boolean, penalty: (i: number) => number = () => 0): { x: number; y: number } | null {
  const camp = s.buildings.find((b) => b.type === 'camp') ?? s.buildings[0];
  if (!camp) return null;
  const c = bCenter(camp);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let i = 0; i < s.terrain.length; i++) {
    if (!test(i)) continue;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) + penalty(i);
    if (d < bd) {
      bd = d;
      best = { x: x + 0.5, y: y + 0.5 };
    }
  }
  return best;
}

/** A circle on the land around a tile, in screen pixels. */
function landSpot(g: Game, x: number, y: number, r = 46): Spot {
  const [sx, sy] = g.renderer.tileToScreen(x, y);
  return { x: sx - r, y: sy - r * 0.8, w: r * 2, h: r * 1.6, round: true };
}

/** The selected building, lit up on the map. */
function selectedSpot(g: Game): Spot | null {
  const b = g.state.buildings.find((o) => o.id === g.selected);
  if (!b) return null;
  const c = bCenter(b);
  return landSpot(g, c.x, c.y, 30 + Math.max(b.w, b.h) * 12);
}

/** Where the guide is panning the view to (tiles); the view glides there. */
let camGoal: { x: number; y: number } | null = null;

function lookAt(_g: Game, x: number, y: number): void {
  camGoal = { x, y };
}

const START: Step[] = [
  {
    say: 'Greetings, my liege! Welcome to your new land. I am Fingamoboblius, and I shall assist you in your task.',
    enter: (g) => g.setSpeed(0),
  },
  {
    say: "First, let's take a look at the reports I'll keep updated for you to track.",
    show: '#topbar',
  },
  {
    say: 'Here you can see the happiness of your subjects, and its reasons if you hover or click it. A happy village attracts more people, and that means more hands to work! But also... more mouths to feed. We will get there.',
    show: '#topbar [data-chip="happy"]',
  },
  {
    say: 'These are your people, and the homes they have room in. The little badge counts those without work: idle hands are wasted hands, my liege.',
    show: '#topbar [data-chip="pop"]',
  },
  {
    say: 'Food in the stores. Hover it to see each kind and how many months it will last. Your people eat from the stores every month, so keep an eye on it before winter.',
    show: '#topbar [data-chip="food"]',
  },
  {
    say: 'Materials: timber, stone, planks and the like, for building. The settlers brought some on their carts, but not enough for long.',
    show: '#topbar [data-chip="materials"]',
  },
  {
    say: 'Goods: what your workshops make from other things, such as flour, cloth, ale and tools.',
    show: '#topbar [data-chip="goods"]',
  },
  {
    say: 'And the treasury: coins from trade, and taxes once you raise a manor hall, and later the prestige of your house. Click it to set the taxes.',
    show: '#topbar [data-chip="treasury"]',
  },
  {
    say: "This book holds what your people know. Knowledge gathers slowly, month by month, and buys new buildings, recipes and better ways of working. I shall show you more when there is enough to spend.",
    show: '#topbar .learn-chip',
  },
  {
    say: 'Over here is the calendar. A year has twelve months and four seasons. These buttons pause time or make it run faster. I have stopped it while we talk.',
    show: '#clock',
  },
  {
    say: 'In the corner: the game menu, your portrait (dress yourself and design your arms there), the chronicle of all that happens, the production book, the town charters, and the reach of your wells and markets.',
    show: '#top .btnrow',
  },
  {
    say: 'And this little switch changes how you see the land. The glass greys it out and lights up what can be gathered: rock, bog ore, berries hiding under the trees, game and fish, with about how much of each. Handy, before you build a lodge!',
    show: '#lens-switch',
  },
  {
    say: 'Below them, your rank and what you need to grow to the next one. A hamlet becomes a village, then a town, and so on.',
    show: '#objectives',
  },
  {
    say: 'But that is enough tattle. Let us get this town going! Down here you place the buildings that will fuel your town and serve your subjects. Let us start with some essential work. Click on the Resources icon.',
    show: '#buildbar [data-cat="resources"]',
    until: () => !!document.querySelector('#buildbar [data-type="woodcutter"]'),
  },
  {
    say: "Most of our basic buildings need timber. We brought some with the settlers, but we will need much more for our mighty village. Choose the Woodcutter's Lodge and build it close to the forest.",
    show: '#buildbar [data-type="woodcutter"]',
    until: (g) => count(g.state, 'woodcutter') > 0,
  },
  {
    say: (g) => {
      const w = g.state.buildings.find((b) => b.type === 'woodcutter');
      let trees = 0;
      if (w) {
        const c = bCenter(w);
        for (let y = Math.floor(c.y - 5); y <= c.y + 5; y++)
          for (let x = Math.floor(c.x - 5); x <= c.x + 5; x++) if (x >= 0 && y >= 0 && x < g.state.width && y < g.state.height && g.state.trees[y * g.state.width + x]) trees++;
      }
      return trees < 12
        ? 'Hmm, there are few trees about that spot, my liege: the woodcutters will walk a long way. You may demolish it and build nearer the woods. For now, let us go on.'
        : 'Splendid, right by the trees! The woodcutters will not walk far.';
    },
    show: (g) => {
      const w = g.state.buildings.find((b) => b.type === 'woodcutter');
      if (!w) return null;
      lookAt(g, w.x + 1, w.y + 1);
      return landSpot(g, w.x + 1, w.y + 1, 60);
    },
  },
  {
    say: 'While our woodcutters get us more timber, let us take care of another pressing matter: food. Later we shall have farms and animals, but for now, let us see what nature offers.',
  },
  {
    say: 'Berry bushes! Foragers pick them in spring and summer.',
    show: (g) => {
      const t = nearest(g.state, (i) => g.state.berriesMax[i] > 0);
      if (!t) return null;
      lookAt(g, t.x, t.y);
      return landSpot(g, t.x, t.y);
    },
  },
  {
    say: 'Herbs grow in the shade of the woods. Once your foragers learn them, the apothecary makes them into medicine.',
    show: (g) => {
      const s = g.state;
      const t = nearest(s, (i) => s.trees[i] >= 3);
      if (!t) return null;
      lookAt(g, t.x, t.y);
      return landSpot(g, t.x, t.y);
    },
  },
  {
    say: (g) =>
      nearestHerd(g)?.h.kind === 'deer'
        ? 'A herd of deer. Hunters bring home meat and hides. Mind, the deer wander off if the woods about them are cut down, and a herd hunted too hard grows small and comes back only slowly.'
        : 'A warren of rabbits, for a hunter to snare. Deer roam the deep woods further off. Mind, game wanders off if the woods about it are cut down, and hunted too hard it grows few and comes back only slowly.',
    show: (g) => {
      const hi = nearestHerd(g);
      if (!hi) return null;
      // Light up the animals themselves, which graze about their herd's home.
      const herd = g.wildlife.animals.filter((a) => a.herd === hi.i && !a.leaving);
      const x = herd.length ? herd.reduce((t, a) => t + a.x, 0) / herd.length : hi.h.x;
      const y = herd.length ? herd.reduce((t, a) => t + a.y, 0) / herd.length : hi.h.y;
      lookAt(g, x, y);
      return landSpot(g, x, y, 70);
    },
  },
  {
    say: 'And the water is full of fish, for a fisher to catch.',
    show: (g) => {
      const camp = g.state.buildings.find((b) => b.type === 'camp');
      const c = camp ? bCenter(camp) : { x: 0, y: 0 };
      const f = [...(g.state.shoals ?? [])].sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      if (!f) return null;
      lookAt(g, f.x, f.y);
      return landSpot(g, f.x, f.y, 60);
    },
  },
  {
    say: "Let us build a Forager's Hut, a Hunting Camp or a Fisher's Hut (in the Food menu), so we have food in store. Remember: workers walk to the workplace, and from there to the food. Building close to it makes them quicker.",
    show: '#buildbar [data-cat="food"]',
    enter: (g) => {
      const camp = g.state.buildings.find((b) => b.type === 'camp');
      if (camp) lookAt(g, camp.x + 1.5, camp.y + 1.5);
    },
    until: (g) => count(g.state, 'forager') + count(g.state, 'hunter') + count(g.state, 'fisher') > 0,
  },
  {
    say: 'Our people still sleep in the tents they came with. Open Housing and build a cottage for a family. Leave room around it: homes grow, and gardens come later.',
    show: '#buildbar [data-cat="housing"]',
    until: (g) => count(g.state, 'house') > 0,
  },
  {
    say: 'Now a road. Buildings work without one, but villagers walk much faster on a road. Choose Road, click where it starts and click where it ends. Join the cottage to the camp.',
    show: '#buildbar [data-action="road"]',
    enter: (g) => {
      (g as unknown as { tutorRoads: number }).tutorRoads = roadsOf(g.state);
    },
    until: (g) => roadsOf(g.state) > ((g as unknown as { tutorRoads?: number }).tutorRoads ?? 0),
  },
  {
    say: 'Well done! Now let time flow. Builders carry what each site needs from the stores, and raise it. I shall wait with you until our first buildings stand.',
    show: '#clock',
    enter: (g) => g.setSpeed(1),
    until: (g) => {
      const s = g.state;
      const food = s.buildings.some((b) => (b.type === 'forager' || b.type === 'hunter' || b.type === 'fisher') && b.build >= 1);
      return count(s, 'woodcutter', true) > 0 && count(s, 'house', true) > 0 && food;
    },
    run: true,
  },
  {
    say: 'They stand! Click any building to see what it does, who works there and what it lacks. Workers leave what they make in a little yard, until someone carries it to storage.',
    enter: (g) => g.setSpeed(0),
  },
  {
    say: 'That is why you will soon want a Storehouse for materials and a Granary for food (in the Civic menu): their haulers fetch from the yards, and the camp cannot hold much.',
    show: '#buildbar [data-cat="civic"]',
  },
  {
    say: 'Before winter, make sure there is firewood for the hearths (a woodcutter can cut it instead of timber), and food for the cold months, when nothing grows. A Marketplace and a Well will make your hamlet a village.',
    show: '#objectives',
  },
  {
    say: 'And raise a Manor Hall (in the Manor menu) as soon as you can spare the timber: no lord, no taxes, and coins buy tools and goods when your own run short.',
    show: '#buildbar [data-cat="manor"]',
  },
  {
    say: 'I shall leave you to it now, my liege. When there is knowledge to spend, or your manor stands, I shall come back. Good fortune!',
    enter: (g) => g.setSpeed(1),
  },
];

const MANOR: Step[] = [
  {
    say: 'Ah, my liege! A manor worthy of your house. Allow me a word or two.',
    enter: (g) => {
      g.setSpeed(0);
      const m = g.state.buildings.find((b) => b.type === 'townhall');
      if (m) lookAt(g, m.x + 1.5, m.y + 1.5);
    },
    show: (g) => {
      const m = g.state.buildings.find((b) => b.type === 'townhall');
      return m ? landSpot(g, m.x + 1.5, m.y + 1.5, 80) : null;
    },
  },
  {
    say: 'From here you hold feasts and festivals that cheer the people and bring prestige: click the manor to see them. You yourself will now walk out among your subjects.',
  },
  {
    say: 'Taxes are paid now: the manor clerk can see to five and forty villagers, and tax offices to more. Prestige gathers each month from the manor, the church and other fine things. Spend it on town charters here, once you are a Town: each shapes what kind of town yours becomes, and each costs more than the last.',
    show: '#top [data-action="charters"]',
  },
  {
    say: "The manor can be renovated into a Manor House, a Stone Manor and at last a Palace. Each opens buildings for the lord's grounds: a stable, a garden, an armoury, a deer park, the atelier where masterpieces are made. They must stand beside the manor, or beside the hedges and gardens that join it.",
  },
  {
    say: 'And here you may dress yourself and design the arms that fly over the manor. That is all, my liege. Rule well!',
    show: '#lord-btn',
    enter: (g) => g.setSpeed(0),
  },
];

/** How many things the town has learned. */
const learned = (g: Game) => g.state.learned?.length ?? 0;
let learnedBefore = 0;

const LEARN: Step[] = [
  {
    say: 'My liege, your people have gathered enough knowledge to learn something new! Click the book up here to open the learning board.',
    enter: (g) => g.setSpeed(0),
    show: '#topbar .learn-chip',
    until: () => !!document.querySelector('.lb'),
  },
  {
    say: 'Every patch on the board is something your people can learn, pinned beside the others of its craft. The tabs along the top hold the other crafts.',
    show: '.lb-board',
  },
  {
    say: 'Gold-stitched patches are learned. Glowing ones can be learned now. The rest are locked, and show what they wait for: a size of town, something made, or another patch first (the threads show which). Patches joined by "or" are a choice, for good.',
    show: () => {
      const e = document.querySelector('.lb-patch.ready') as HTMLElement | null;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left - 10, y: r.top - 10, w: r.width + 20, h: r.height + 20, round: true };
    },
  },
  {
    say: 'Click a glowing patch to look at it, then Learn it. A Forester, perhaps, so the woods never run out.',
    enter: (g) => {
      learnedBefore = learned(g);
    },
    until: (g) => learned(g) > learnedBefore,
  },
  {
    say: 'Splendid! It waits for you in the build menu now. Knowledge comes faster as the town grows, and the church, a school, the monks and the finest homes all add to it. Come back to the board whenever the book shows a number.',
  },
];

/** The first trading post or dock to stand. */
const tradeHouse = (g: Game) => g.state.buildings.find((b) => (b.type === 'tradingpost' || b.type === 'dock') && b.build >= 1);

/** Keeps its order book open while he talks about it. */
function openBook(g: Game): void {
  const b = tradeHouse(g);
  if (b && g.selected !== b.id) g.select(b.id);
}

/** How many orders the book held when he asked for one. */
let ordersBefore = 0;

const TRADE: Step[] = [
  {
    say: (g) =>
      `A ${tradeHouse(g)?.type === 'dock' ? 'dock' : 'trading post'}, my liege! Now merchants will call on our town. Allow me to tell you how trade works.`,
    enter: (g) => {
      g.setSpeed(0);
      const b = tradeHouse(g);
      if (b) lookAt(g, b.x + 1, b.y + 1);
    },
    show: (g) => {
      const b = tradeHouse(g);
      return b ? landSpot(g, b.x + 1, b.y + 1, 70) : null;
    },
  },
  {
    say: 'Merchants do only what you bid them, and you bid them with orders. Click the building to open its order book.',
    show: (g) => {
      const b = tradeHouse(g);
      return b ? landSpot(g, b.x + 1, b.y + 1, 70) : null;
    },
    until: (g) => g.selected !== null && g.selected === tradeHouse(g)?.id,
  },
  {
    say: 'Here it is. An Import order buys a good until your stores hold the target you set. The merchants are paid from the treasury, a little above what the good is worth.',
    show: '#inspector .order-add [data-kind="import"]',
    enter: openBook,
  },
  {
    say: 'An Export order sells a good while your stores hold more than its target, and the coins go to the treasury. Set the target high enough to keep what your own people need.',
    show: '#inspector .order-add [data-kind="export"]',
    enter: openBook,
  },
  {
    say: 'But the carts are only so big: each month the merchants carry a set number of goods here, whatever you order. Crates nearby give them room to take more away.',
    show: '#inspector .trade-book > .note',
    enter: openBook,
  },
  {
    say: 'So the order of the orders matters! The first is worked first, then the next, while there is room in the carts. Drag an order by its grip to move it up or down. You may even give one good two orders: import fish up to 100 at the top, say, and up to 120 further down, once the rest is done.',
    show: '#inspector .trade-book',
    enter: openBook,
  },
  {
    say: 'Let us try. Click ＋ Import, or ＋ Export, and choose a good.',
    show: '#inspector .order-add',
    enter: (g) => {
      openBook(g);
      ordersBefore = tradeHouse(g)?.orders?.length ?? 0;
    },
    until: (g) => (tradeHouse(g)?.orders?.length ?? 0) > ordersBefore,
  },
  {
    say: 'Splendid! Now set its target with these pegs. The merchants work it every month until it is met, and note beneath it how they fared.',
    show: '#inspector .order:last-child .ord-target',
    enter: openBook,
  },
  {
    say: 'Each trading post and dock keeps its own book, and each one adds carts. That is all, my liege. May your coffers fill!',
  },
];

/** The herd nearest the camp, with its index. */
function nearestHerd(g: Game): { h: NonNullable<GameState['herds']>[number]; i: number } | null {
  const camp = g.state.buildings.find((b) => b.type === 'camp');
  const c = camp ? bCenter(camp) : { x: 0, y: 0 };
  const herds = (g.state.herds ?? []).map((h, i) => ({ h, i }));
  herds.sort((a, b) => Math.hypot(a.h.x - c.x, a.h.y - c.y) - Math.hypot(b.h.x - c.x, b.h.y - c.y));
  return herds[0] ?? null;
}

function roadsOf(s: GameState): number {
  let n = s.roadPlan?.length ?? 0;
  for (let i = 0; i < s.road.length; i++) if (s.road[i]) n++;
  return n;
}

export class Tutor {
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  private balloon: HTMLDivElement;
  private guide: HTMLCanvasElement;
  private grey: HTMLDivElement;
  private shield: HTMLDivElement;
  private greyMask = '';
  private gx = 0;
  private gy = 0;
  private walk = 0;
  private typed = 0;
  private text = '';
  private stepKey = '';
  private active = false;
  /** On a step that waits for the player: the speech is done and the screen is theirs again. */
  private waiting = false;
  /** Seconds the whole line has been on show. */
  private shown = 0;
  /** Whether he is on screen, and for how many seconds since he popped up. */
  private visible = false;
  private appear = 0;
  /** Which side of him his balloon goes, when the trade window leaves room on one side only. */
  private side: 'left' | 'right' | null = null;

  constructor(private game: Game) {
    this.root = document.createElement('div');
    this.root.id = 'tutor';
    this.root.innerHTML = `<div class="t-grey"></div><svg class="t-dim" aria-hidden="true"></svg><div class="t-shield"></div><canvas class="t-guide"></canvas><div class="t-balloon"></div>`;
    document.body.appendChild(this.root);
    this.svg = this.root.querySelector('svg')!;
    this.grey = this.root.querySelector('.t-grey')!;
    this.shield = this.root.querySelector('.t-shield')!;
    this.guide = this.root.querySelector('canvas')!;
    this.balloon = this.root.querySelector('.t-balloon')!;
    this.balloon.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-t="skip"]')) this.skip();
      else this.next();
    });
    // While he talks, a click anywhere goes on.
    this.shield.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.next();
    });
    // Clicking him while he waits brings his words back.
    this.guide.addEventListener('click', () => {
      if (!this.waiting) return;
      this.waiting = false;
      this.shown = 0;
    });
    // On a step that waits, the first click of the player's own (on the bar, the map) closes his balloon.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.active || this.waiting || this.root.style.display === 'none') return;
        if ((e.target as HTMLElement).closest('#tutor')) return;
        const step = this.steps[this.game.state.tutorial?.step ?? 0];
        if (step?.until && this.typed >= this.text.length) this.waiting = true;
      },
      true,
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Enter' || !this.active || this.root.style.display === 'none' || (this.game.modalOpen && !this.help)) return;
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.next();
      },
      true,
    );
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.guide.width = 44 * dpr;
    this.guide.height = 64 * dpr;
    this.guide.style.width = '44px';
    this.guide.style.height = '64px';
  }

  /** The view stays where the guide puts it while he leads (not while he only explains a panel). */
  get locksCamera(): boolean {
    return this.active && !this.help;
  }

  /** A panel he has been asked to explain: its pages, the one he is on, and its key. */
  private help: Step | null = null;
  private helpSteps: Step[] = [];
  private helpAt = 0;
  private helpKey = '';
  /** The speed to go back to once he has done explaining (he stops time while he talks). */
  private helpSpeed: number | null = null;

  /**
   * Asked (by the little portrait on a panel) to explain it: he pops up and
   * walks the player round the panel a page at a time, lighting up each part
   * as he talks about it, with the rest of the screen greyed and time stopped.
   * Pages about something not on screen just now are left out.
   */
  explain(key: string, pages: HelpPage[], host?: string): void {
    const g = this.game;
    const steps: Step[] = [];
    for (const p of pages) {
      if (p.show === 'selected') {
        if (g.selected === null) continue;
        steps.push({ say: p.say, show: (g) => selectedSpot(g) });
      } else if (!p.show || document.querySelector(p.show)) steps.push({ say: p.say, show: p.show });
    }
    if (!steps.length) steps.push({ say: pages[0].say, show: host });
    // A page with nothing of its own to show points at the panel itself.
    for (const st of steps) st.show ??= host;
    this.helpSteps = steps;
    this.helpAt = 0;
    this.help = steps[0];
    this.helpKey = `${key}:${Date.now()}`;
    this.stepKey = '';
    if (this.helpSpeed === null) {
      this.helpSpeed = g.speedIndex;
      g.setSpeed(0);
    }
  }

  private endHelp(): void {
    this.help = null;
    this.helpSteps = [];
    this.hide();
    if (this.helpSpeed !== null && this.game.speedIndex === 0) this.game.setSpeed(this.helpSpeed);
    this.helpSpeed = null;
  }

  private get steps(): Step[] {
    const c = this.game.state.tutorial?.chapter;
    return c === 'manor' ? MANOR : c === 'trade' ? TRADE : c === 'learn' ? LEARN : START;
  }

  /** A click or Enter: finish the line, then go on (or, on a step that waits, step aside). */
  private next(): void {
    if (this.help) {
      if (this.typed < this.text.length) this.typed = this.text.length;
      else if (this.helpAt + 1 < this.helpSteps.length) this.help = this.helpSteps[++this.helpAt];
      else this.endHelp();
      return;
    }
    const t = this.game.state.tutorial;
    if (!t || this.waiting) return;
    if (this.typed < this.text.length) {
      this.typed = this.text.length;
      return;
    }
    const step = this.steps[t.step];
    if (!step) return;
    if (step.until) this.waiting = true;
    else this.advance();
  }

  private skip(): void {
    if (this.help) {
      this.endHelp();
      return;
    }
    const t = this.game.state.tutorial;
    if (!t) return;
    if (t.chapter === 'manor') t.manorSeen = true;
    if (t.chapter === 'trade') t.tradeSeen = true;
    if (t.chapter === 'learn') t.learnSeen = true;
    t.chapter = 'done';
    this.hide();
    this.game.setSpeed(1);
  }

  private advance(): void {
    const t = this.game.state.tutorial!;
    t.step++;
    if (t.step >= this.steps.length) {
      if (t.chapter === 'manor') t.manorSeen = true;
      if (t.chapter === 'trade') t.tradeSeen = true;
      if (t.chapter === 'learn') t.learnSeen = true;
      t.chapter = 'done';
      if (this.game.speed === 0) this.game.setSpeed(1);
      t.step = 0;
      this.hide();
    }
  }

  private hide(): void {
    // He leaves as he came, in a puff of smoke.
    if (this.visible) puff(this.gx + 22, this.gy + 40);
    this.visible = false;
    this.active = false;
    this.root.style.display = 'none';
    this.stepKey = '';
    camGoal = null;
  }

  /** Glides the view toward where the guide wants to look. Returns whether it is still moving. */
  private panCamera(dt: number): boolean {
    if (!camGoal) return false;
    const r = this.game.renderer;
    const [cx, cy] = r.screenToTile(window.innerWidth / 2, window.innerHeight / 2);
    const dx = camGoal.x - cx;
    const dy = camGoal.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) {
      camGoal = null;
      return false;
    }
    // Ease in, at a brisk pace: never more than two dozen tiles a second.
    const v = Math.min(d, Math.max(d * dt * 4.4, 3 * dt), 24 * dt);
    r.centerOn(cx + (dx / d) * v, cy + (dy / d) * v);
    return d > 0.4;
  }

  /** Called every frame. */
  update(dt: number): void {
    const g = this.game;
    // Called to explain a panel: he does that before anything else.
    if (this.help) {
      this.play(this.help, `help:${this.helpKey}:${this.helpAt}`, dt);
      return;
    }
    // In any game, the first trading post or dock brings him to explain trade (unless tips are off).
    // And the first knowledge worth spending brings him to show the learning board.
    if (!g.state.tutorial && !g.demo && (tradeHouse(g) || readyCount(g.state) > 0) && tipsOn()) g.state.tutorial = { step: 0, chapter: 'done', manorSeen: true };
    const t = g.state.tutorial;
    if (!t || g.demo) {
      if (this.active) this.hide();
      return;
    }
    // The manor chapter begins once the manor stands.
    if (t.chapter === 'done' && !t.manorSeen && g.state.buildings.some((b) => b.type === 'townhall' && b.build >= 1)) {
      t.chapter = 'manor';
      t.step = 0;
    } else if (t.chapter === 'done' && !t.tradeSeen && tradeHouse(g)) {
      t.chapter = 'trade';
      t.step = 0;
    } else if (t.chapter === 'done' && !t.learnSeen && readyCount(g.state) > 0 && !g.modalOpen) {
      // Enough knowledge for something: he shows the learning board.
      t.chapter = 'learn';
      t.step = 0;
    }
    // He keeps talking over the learning board; other windows send him away.
    const overBoard = t.chapter === 'learn' && !!document.querySelector('.lb');
    if (t.chapter === 'done' || (g.modalOpen && !overBoard)) {
      if (this.active || this.root.style.display !== 'none') this.root.style.display = 'none';
      this.visible = false;
      this.active = t.chapter !== 'done';
      return;
    }
    const step = this.steps[t.step];
    if (!step) return;
    this.play(step, `${t.chapter}:${t.step}`, dt);
  }

  /** Shows a step: he walks to what it lights up and has his say. */
  private play(step: Step, key: string, dt: number): void {
    const g = this.game;
    this.active = true;
    this.root.style.display = 'block';
    if (key !== this.stepKey) {
      this.stepKey = key;
      step.enter?.(g);
      this.text = typeof step.say === 'function' ? step.say(g) : step.say;
      this.typed = 0;
      this.shown = 0;
      this.waiting = false;
    }
    if (step.until?.(g) && !this.help) {
      this.advance();
      return;
    }
    // Where to light up, and where he should stand.
    let spot: Spot | null = null;
    if (typeof step.show === 'string') {
      const el = document.querySelector(step.show) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width) spot = { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 };
      }
    } else if (step.show) spot = step.show(g);
    const panning = this.panCamera(dt);
    const W = window.innerWidth;
    const H = window.innerHeight;
    let tx = W / 2 - 22;
    let ty = H * 0.45;
    if (spot) {
      const below = spot.y + spot.h / 2 < H * 0.5;
      tx = Math.max(10, Math.min(W - 60, spot.x + spot.w / 2 - 22 + (spot.w > 260 ? spot.w / 2 - 40 : 40)));
      // Keep clear of the build bar when it is open.
      const bar = document.getElementById('buildbar')?.getBoundingClientRect();
      const floor = bar && bar.height ? Math.min(spot.y, bar.top) : spot.y;
      ty = below ? Math.min(H - 220, spot.y + spot.h + 16) : Math.max(70, floor - 110);
    }
    // Showing something in the big trade window, or in a panel he is explaining: he stands just
    // outside it, his balloon on the open side, so neither hides what he points at.
    this.side = null;
    const wide = (document.querySelector('#inspector.trade-wide') ??
      (this.help ? [...document.querySelectorAll<HTMLElement>('#inspector, #chip-panel, .modal')].find((el) => el.getClientRects().length && spot && contains(el.getBoundingClientRect(), spot)) : null)) as HTMLElement | null;
    const pr = wide?.getClientRects().length ? wide.getBoundingClientRect() : null;
    if (spot && pr && spot.x >= pr.left - 8 && spot.x + spot.w <= pr.right + 8) {
      const midY = Math.max(70, Math.min(H - 150, spot.y + spot.h / 2 - 40));
      if (pr.left >= 290) {
        tx = pr.left - 52;
        this.side = 'left';
      } else if (W - pr.right >= 290) {
        tx = pr.right + 8;
        this.side = 'right';
      }
      if (this.side) ty = midY;
    }
    // Each time he appears, he pops up where he means to stand in a puff of smoke.
    if (!this.visible) {
      this.visible = true;
      this.gx = tx;
      this.gy = ty;
      this.appear = 0;
      puff(tx + 22, ty + 40);
    }
    this.appear += dt;
    const popping = this.appear < POP;
    const dx = tx - this.gx;
    const dy = ty - this.gy;
    const d = Math.hypot(dx, dy);
    // He walks (briskly, but so it still reads as walking) and only talks once there.
    const walking = d > 2;
    if (popping) {
      // Not a word until the smoke clears.
    } else if (walking) {
      const v = Math.min(d, 340 * dt);
      this.gx += (dx / d) * v;
      this.gy += (dy / d) * v;
      this.walk += dt * 18;
    } else if (!panning && this.typed < this.text.length) {
      this.typed = Math.min(this.text.length, this.typed + dt * 48);
    } else if (!panning) {
      this.shown += dt;
      // On a step that waits, he steps aside once he has had his say.
      if (step.until && !this.waiting && this.shown > 4) this.waiting = true;
    }
    this.draw(spot, walking || panning || popping, step, walking);
  }

  private draw(spot: Spot | null, busy: boolean, step: Step, walking: boolean): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const talking = !busy && !this.waiting;
    // While he walks or waits nothing blocks the screen; while he talks a click anywhere goes on,
    // except on a step that waits for the player, who must be free to do it.
    this.shield.style.display = talking && !step.until ? 'block' : 'none';
    this.guide.style.pointerEvents = this.waiting ? 'auto' : 'none';
    this.guide.style.cursor = this.waiting ? 'pointer' : '';
    this.guide.title = this.waiting ? 'Fingamoboblius: click to hear him again' : '';
    // The dimmed, greyed screen, with holes for him and what he shows; none while he waits.
    const holes: string[] = [`<ellipse cx="${this.gx + 22}" cy="${this.gy + 34}" rx="46" ry="52" fill="black"/>`];
    if (spot) {
      holes.push(
        spot.round
          ? `<ellipse cx="${spot.x + spot.w / 2}" cy="${spot.y + spot.h / 2}" rx="${spot.w / 2}" ry="${spot.h / 2}" fill="black"/>`
          : `<rect x="${spot.x}" y="${spot.y}" width="${spot.w}" height="${spot.h}" rx="10" fill="black"/>`,
      );
    }
    const outline = spot
      ? spot.round
        ? `<ellipse cx="${spot.x + spot.w / 2}" cy="${spot.y + spot.h / 2}" rx="${spot.w / 2}" ry="${spot.h / 2}" fill="none" stroke="#f2d878" stroke-width="2.5" stroke-dasharray="6 5"/>`
        : `<rect x="${spot.x}" y="${spot.y}" width="${spot.w}" height="${spot.h}" rx="10" fill="none" stroke="#f2d878" stroke-width="2.5"/>`
      : '';
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    if (this.waiting) {
      this.svg.innerHTML = '';
      if (this.greyMask) {
        this.greyMask = '';
        this.grey.style.backdropFilter = 'none';
        this.grey.style.maskImage = 'none';
        this.grey.style.webkitMaskImage = 'none';
      }
    } else {
      this.svg.innerHTML = `<defs><mask id="tmask"><rect width="${W}" height="${H}" fill="white"/>${holes.join('')}</mask>
        <radialGradient id="tglow"><stop offset="0" stop-color="#fff4c8" stop-opacity="0.35"/><stop offset="1" stop-color="#fff4c8" stop-opacity="0"/></radialGradient></defs>
        <rect width="${W}" height="${H}" fill="rgba(12,10,20,0.34)" mask="url(#tmask)"/>
        <ellipse cx="${this.gx + 22}" cy="${this.gy + 40}" rx="40" ry="44" fill="url(#tglow)"/>${busy ? '' : outline}`;
      // The world outside the holes loses its colour (a masked backdrop filter).
      const grey = 'grayscale(0.9) brightness(0.8)';
      const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><mask id="m"><rect width="${W}" height="${H}" fill="white"/>${holes.join('')}</mask></defs><rect width="${W}" height="${H}" mask="url(#m)"/></svg>`)}")`;
      if (mask + grey !== this.greyMask) {
        this.greyMask = mask + grey;
        this.grey.style.backdropFilter = grey;
        this.grey.style.maskImage = mask;
        this.grey.style.webkitMaskImage = mask;
      }
    }
    // Fingamoboblius himself.
    this.guide.style.left = `${this.gx}px`;
    this.guide.style.top = `${this.gy}px`;
    // Hidden by the smoke at first, then he springs up.
    const a = this.appear;
    const pop = a < 0.12 ? 0 : a < POP ? 1 + Math.sin(((a - 0.12) / (POP - 0.12)) * Math.PI) * 0.18 : 1;
    this.guide.style.opacity = a < 0.12 ? '0' : '1';
    this.guide.style.transform = pop === 1 ? '' : `scale(${pop.toFixed(3)})`;
    this.paintGuide(walking);
    // His balloon, only while he stands and talks, beside him on the side with more room.
    this.balloon.style.display = talking ? 'block' : 'none';
    if (!talking) return;
    const right = this.side ? this.side === 'right' : this.gx < W / 2;
    const shownText = this.text.slice(0, Math.floor(this.typed));
    const done = this.typed >= this.text.length;
    const t = this.game.state.tutorial;
    // Explaining a panel, he only asks to be thanked.
    const skip = this.help ? 'Thank you' : t?.chapter === 'start' ? 'Skip tutorial' : 'Skip';
    const more = this.help && this.helpAt + 1 < this.helpSteps.length;
    const page = this.help && this.helpSteps.length > 1 ? ` <small>${this.helpAt + 1}/${this.helpSteps.length}</small>` : '';
    const next = this.help ? (more ? 'Click or press Enter to go on ▸' : 'Click when you have heard enough ▸') : step.until ? 'Over to you, my liege ▸' : 'Click or press Enter to go on ▸';
    const html = `<div class="t-name">Fingamoboblius</div><p>${esc(shownText)}<span class="t-caret">${done ? '' : '▌'}</span></p>
      <div class="t-foot"><span class="t-next">${done ? next : 'Click to hurry him'}${page}</span><button data-t="skip">${skip}</button></div>`;
    const stamp = `${this.stepKey}:${Math.floor(this.typed)}`;
    if (this.balloon.dataset.html !== stamp) {
      this.balloon.dataset.html = stamp;
      this.balloon.innerHTML = html;
    }
    // Beside the trade window there is only so much room.
    const room = this.side === 'left' ? this.gx - 20 : this.side === 'right' ? W - this.gx - 64 : W - 24;
    const bw = Math.min(340, room);
    let bx = right ? this.gx + 52 : this.gx - bw - 8;
    bx = Math.max(12, Math.min(W - bw - 12, bx));
    const by = Math.max(12, Math.min(H - 150, this.gy - 30));
    this.balloon.style.left = `${bx}px`;
    this.balloon.style.top = `${by}px`;
    this.balloon.style.width = `${bw}px`;
    this.balloon.classList.toggle('left', !right);
  }

  /** An old steward drawn like the villagers, but with a long white beard, a cap and a staff. */
  private paintGuide(walking: boolean): void {
    const c = this.guide.getContext('2d');
    if (!c) return;
    const dpr = this.guide.width / 44;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, 44, 64);
    const k = 2.6;
    c.save();
    c.translate(22, 60);
    c.scale(k, k);
    const bob = walking ? Math.abs(Math.sin(this.walk)) * 0.8 : 0;
    const leg = walking ? Math.sin(this.walk) * 1.6 : 0;
    c.fillStyle = 'rgba(20,20,10,0.3)';
    c.beginPath();
    c.ellipse(0, 0, 4.2, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#3a2c20';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(-1, -4 - bob);
    c.lineTo(-1 + leg, 0);
    c.moveTo(1, -4 - bob);
    c.lineTo(1 - leg, 0);
    c.stroke();
    // A long robe with a rope belt.
    c.fillStyle = '#6a4a7a';
    c.beginPath();
    c.moveTo(-3.4, -2.5 - bob);
    c.lineTo(3.4, -2.5 - bob);
    c.lineTo(2.4, -10.5 - bob);
    c.lineTo(-2.4, -10.5 - bob);
    c.closePath();
    c.fill();
    c.fillStyle = '#c8a040';
    c.fillRect(-2.8, -6.6 - bob, 5.6, 0.7);
    // The staff.
    c.strokeStyle = '#7a5a3a';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(3.6, 0);
    c.lineTo(3.6, -16 - bob);
    c.stroke();
    c.fillStyle = '#c8a040';
    c.beginPath();
    c.arc(3.6, -16.4 - bob, 0.8, 0, Math.PI * 2);
    c.fill();
    // Head, beard and cap.
    c.fillStyle = '#e8c4a0';
    c.beginPath();
    c.arc(0, -12.5 - bob, 2.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f2ece0';
    c.beginPath();
    c.moveTo(-2, -12.2 - bob);
    c.quadraticCurveTo(0, -11 - bob, 2, -12.2 - bob);
    c.lineTo(0.6, -6.5 - bob);
    c.lineTo(0, -6 - bob);
    c.lineTo(-0.6, -6.5 - bob);
    c.closePath();
    c.fill();
    c.fillStyle = '#4a2a5a';
    c.beginPath();
    c.arc(0, -13.4 - bob, 2.3, Math.PI, 0);
    c.lineTo(-1, -17.5 - bob);
    c.closePath();
    c.fill();
    c.restore();
  }
}

/** Whether a spot lies within a panel's box (give or take its outline). */
function contains(r: DOMRect, spot: Spot): boolean {
  return spot.x >= r.left - 8 && spot.x + spot.w <= r.right + 8 && spot.y >= r.top - 8 && spot.y + spot.h <= r.bottom + 8;
}

/** Seconds from the puff until he can speak. */
const POP = 0.42;

function tipsOn(): boolean {
  try {
    return localStorage.getItem('cornerlands.tipsOff') !== '1';
  } catch {
    return true;
  }
}

/** A cartoon puff of smoke at a point on the screen: billows swell outward and fade, with a few sparks. */
function puff(x: number, y: number): void {
  const S = 180;
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = S * dpr;
  cv.height = S * dpr;
  cv.className = 't-puff';
  cv.style.cssText = `position:fixed;left:${x - S / 2}px;top:${y - S / 2}px;width:${S}px;height:${S}px;pointer-events:none;z-index:61`;
  document.body.appendChild(cv);
  const c = cv.getContext('2d');
  if (!c) return cv.remove();
  const blobs = Array.from({ length: 11 }, (_, i) => ({
    a: (i / 11) * Math.PI * 2 + Math.random() * 0.4,
    d: 26 + Math.random() * 20,
    r: 12 + Math.random() * 9,
    up: Math.random() * 10,
  }));
  const sparks = Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2 + Math.random(), d: 60 + Math.random() * 20 }));
  const LIFE = 0.75;
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = (now - t0) / 1000 / LIFE;
    if (t >= 1) return cv.remove();
    const e = 1 - (1 - t) ** 3;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, S, S);
    c.globalAlpha = Math.min(1, (1 - t) * 1.6);
    // A burst at the heart, gone in a blink.
    if (t < 0.3) {
      c.fillStyle = '#fffaf0';
      c.beginPath();
      c.arc(S / 2, S / 2, 14 + t * 90, 0, Math.PI * 2);
      c.fill();
    }
    for (const pass of [0, 1, 2]) {
      for (const b of blobs) {
        const r = b.r * (0.6 + 0.7 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.8)) * (1 - t * 0.5);
        const bx = S / 2 + Math.cos(b.a) * b.d * e;
        const by = S / 2 + Math.sin(b.a) * b.d * e * 0.8 - b.up * e;
        c.beginPath();
        if (pass === 0) {
          c.fillStyle = '#6a5a48';
          c.arc(bx, by, r + 2, 0, Math.PI * 2);
        } else if (pass === 1) {
          c.fillStyle = '#d8ccbc';
          c.arc(bx, by, r, 0, Math.PI * 2);
        } else {
          c.fillStyle = '#f8f2e6';
          c.arc(bx - r * 0.22, by - r * 0.25, r * 0.7, 0, Math.PI * 2);
        }
        c.fill();
      }
    }
    for (const sp of sparks) {
      const sx = S / 2 + Math.cos(sp.a) * sp.d * e;
      const sy = S / 2 + Math.sin(sp.a) * sp.d * e;
      const k = 3.5 * (1 - t);
      c.fillStyle = '#f2d878';
      c.beginPath();
      c.moveTo(sx, sy - k * 1.6);
      c.lineTo(sx + k * 0.5, sy);
      c.lineTo(sx, sy + k * 1.6);
      c.lineTo(sx - k * 0.5, sy);
      c.closePath();
      c.fill();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!);
}
