import type { Game } from '../main';
import { bCenter } from '../game/sim';
import type { GameState } from '../game/types';

/**
 * The tutorial: Fingamabob, an old steward with a beard, walks about the
 * screen with a little spotlight on himself and on whatever he is showing,
 * and talks in a balloon whose letters appear one by one. Some steps wait
 * for the player to do something; the rest wait for a click.
 */

/** The tutorial is always played on the same land. */
export const TUTORIAL_SEED = 209;

type Spot = { x: number; y: number; w: number; h: number; round?: boolean };

interface Step {
  /** What Fingamabob says (a function to fit the moment). */
  say: string | ((g: Game) => string);
  /** What to light up: a selector on the interface, or a point in the land. */
  show?: string | ((g: Game) => Spot | null);
  /** Called when the step starts (pan the view, pause, open a menu...). */
  enter?: (g: Game) => void;
  /** The step ends by itself once this holds; otherwise on a click. */
  until?: (g: Game) => boolean;
  /** Let time run while this step waits. */
  run?: boolean;
  /** Dim the rest of the screen (on by default; off while the player works the map). */
  dim?: boolean;
}

const count = (s: GameState, type: string, built = false) => s.buildings.filter((b) => b.type === type && (!built || b.build >= 1)).length;

/** The nearest map feature to the camp matching a test, as a tile. */
function nearest(s: GameState, test: (i: number) => boolean): { x: number; y: number } | null {
  const camp = s.buildings.find((b) => b.type === 'camp') ?? s.buildings[0];
  if (!camp) return null;
  const c = bCenter(camp);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let i = 0; i < s.terrain.length; i++) {
    if (!test(i)) continue;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
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

function lookAt(g: Game, x: number, y: number): void {
  g.renderer.centerOn(x, y);
}

const START: Step[] = [
  {
    say: 'Greetings, my liege! Welcome to your new land. I am Fingamabob, and I shall assist you in your task.',
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
    say: 'And the treasury: coins from taxes and trade, and later the prestige of your house. Click it to set the taxes.',
    show: '#topbar [data-chip="treasury"]',
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
    say: 'Below them, your rank and what you need to grow to the next one. A hamlet becomes a village, then a town, and so on.',
    show: '#objectives',
  },
  {
    say: 'But that is enough tattle. Let us get this town going! Down here you place the buildings that will fuel your town and serve your subjects. Let us start with some essential work. Click on the Resources icon.',
    show: '#buildbar [data-cat="resources"]',
    until: () => !!document.querySelector('#buildbar [data-type="woodcutter"]'),
    dim: true,
  },
  {
    say: "Most of our basic buildings need timber. We brought some with the settlers, but we will need much more for our mighty village. Choose the Woodcutter's Lodge and build it close to the forest.",
    show: '#buildbar [data-type="woodcutter"]',
    until: (g) => count(g.state, 'woodcutter') > 0,
    dim: false,
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
    say: 'Mushrooms grow on the forest floor, best in autumn. Foragers gather those too.',
    show: (g) => {
      const t = nearest(g.state, (i) => (g.state.mushroomsMax?.[i] ?? 0) > 0);
      if (!t) return null;
      lookAt(g, t.x, t.y);
      return landSpot(g, t.x, t.y);
    },
  },
  {
    say: 'A herd of deer. Hunters bring home meat and hides. Mind, the animals may wander off if the woods about them are cut down, and if hunted too hard they grow few.',
    show: (g) => {
      const camp = g.state.buildings.find((b) => b.type === 'camp');
      const c = camp ? bCenter(camp) : { x: 0, y: 0 };
      const herds = g.state.herds ?? [];
      const hi = herds
        .map((h, i) => ({ h, i }))
        .filter((o) => o.h.kind === 'deer')
        .sort((a, b) => Math.hypot(a.h.x - c.x, a.h.y - c.y) - Math.hypot(b.h.x - c.x, b.h.y - c.y))[0];
      if (!hi) return null;
      // Light up the deer themselves, which graze about their herd's home.
      const deer = g.wildlife.animals.filter((a) => a.herd === hi.i && !a.leaving);
      const x = deer.length ? deer.reduce((t, a) => t + a.x, 0) / deer.length : hi.h.x;
      const y = deer.length ? deer.reduce((t, a) => t + a.y, 0) / deer.length : hi.h.y;
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
    dim: false,
  },
  {
    say: 'Our people still sleep in the tents they came with. Open Housing and build a cottage for a family. Leave room around it: homes grow, and gardens come later.',
    show: '#buildbar [data-cat="housing"]',
    until: (g) => count(g.state, 'house') > 0,
    dim: false,
  },
  {
    say: 'Now a road. Buildings work without one, but villagers walk much faster on a road. Choose Road, click where it starts and click where it ends. Join the cottage to the camp.',
    show: '#buildbar [data-action="road"]',
    enter: (g) => {
      (g as unknown as { tutorRoads: number }).tutorRoads = roadsOf(g.state);
    },
    until: (g) => roadsOf(g.state) > ((g as unknown as { tutorRoads?: number }).tutorRoads ?? 0),
    dim: false,
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
    dim: false,
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
    say: 'Before winter, make sure there is timber or firewood for the hearths, and food for the cold months, when nothing grows. A Marketplace and a Well will make your hamlet a village.',
    show: '#objectives',
  },
  {
    say: 'I shall leave you to it now, my liege. When you raise your manor, I shall come back to show you what a lord can do. Good fortune!',
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
    say: 'Prestige gathers each month from the manor, the church and other fine things. Spend it on town charters here, once you are a Town: each shapes what kind of town yours becomes.',
    show: '#top [data-action="charters"]',
  },
  {
    say: 'The manor can be renovated into a Manor House, and then a Stone Manor, which lets you lay out a grand garden, raise watch towers and build the town walls.',
  },
  {
    say: 'And here you may dress yourself and design the arms that fly over the manor. That is all, my liege. Rule well!',
    show: '#lord-btn',
    enter: (g) => g.setSpeed(0),
  },
];

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
  private greyMask = '';
  private gx = -60;
  private gy = 0;
  private walk = 0;
  private typed = 0;
  private text = '';
  private stepKey = '';
  private active = false;

  constructor(private game: Game) {
    this.root = document.createElement('div');
    this.root.id = 'tutor';
    this.root.innerHTML = `<div class="t-grey"></div><svg class="t-dim" aria-hidden="true"></svg><canvas class="t-guide"></canvas><div class="t-balloon"></div>`;
    document.body.appendChild(this.root);
    this.svg = this.root.querySelector('svg')!;
    this.grey = this.root.querySelector('.t-grey')!;
    this.guide = this.root.querySelector('canvas')!;
    this.balloon = this.root.querySelector('.t-balloon')!;
    this.balloon.addEventListener('click', (e) => this.onBalloon(e));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.guide.width = 44 * dpr;
    this.guide.height = 64 * dpr;
    this.guide.style.width = '44px';
    this.guide.style.height = '64px';
  }

  private get steps(): Step[] {
    return this.game.state.tutorial?.chapter === 'manor' ? MANOR : START;
  }

  private onBalloon(e: MouseEvent): void {
    const t = this.game.state.tutorial;
    if (!t) return;
    if ((e.target as HTMLElement).closest('[data-t="skip"]')) {
      t.chapter = 'done';
      this.hide();
      this.game.setSpeed(1);
      return;
    }
    if (this.typed < this.text.length) {
      this.typed = this.text.length;
      return;
    }
    const step = this.steps[t.step];
    if (step && !step.until) this.advance();
  }

  private advance(): void {
    const t = this.game.state.tutorial!;
    t.step++;
    if (t.step >= this.steps.length) {
      if (t.chapter === 'manor') t.manorSeen = true;
      t.chapter = 'done';
      if (this.game.speed === 0) this.game.setSpeed(1);
      t.step = 0;
      this.hide();
    }
  }

  private hide(): void {
    this.active = false;
    this.root.style.display = 'none';
    this.stepKey = '';
  }

  /** Called every frame. */
  update(dt: number): void {
    const g = this.game;
    const t = g.state.tutorial;
    if (!t || g.demo) {
      if (this.active) this.hide();
      return;
    }
    // The manor chapter begins once the manor stands.
    if (t.chapter === 'done' && !t.manorSeen && g.state.buildings.some((b) => b.type === 'townhall' && b.build >= 1)) {
      t.chapter = 'manor';
      t.step = 0;
    }
    if (t.chapter === 'done' || g.modalOpen) {
      if (this.active || this.root.style.display !== 'none') this.root.style.display = 'none';
      this.active = t.chapter !== 'done';
      return;
    }
    const step = this.steps[t.step];
    if (!step) return;
    this.active = true;
    this.root.style.display = 'block';
    const key = `${t.chapter}:${t.step}`;
    if (key !== this.stepKey) {
      this.stepKey = key;
      step.enter?.(g);
      this.text = typeof step.say === 'function' ? step.say(g) : step.say;
      this.typed = 0;
    }
    if (step.until?.(g)) {
      this.advance();
      return;
    }
    // Where to light up, and where Fingamabob should stand.
    let spot: Spot | null = null;
    if (typeof step.show === 'string') {
      const el = document.querySelector(step.show) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width) spot = { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 };
      }
    } else if (step.show) spot = step.show(g);
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
    if (this.gx < -50) {
      this.gx = tx;
      this.gy = ty;
    }
    const dx = tx - this.gx;
    const dy = ty - this.gy;
    const d = Math.hypot(dx, dy);
    const walking = d > 2;
    if (walking) {
      const v = Math.min(d, 260 * dt);
      this.gx += (dx / d) * v;
      this.gy += (dy / d) * v;
      this.walk += dt * 10;
    } else if (this.typed < this.text.length) {
      this.typed = Math.min(this.text.length, this.typed + dt * 48);
    }
    this.draw(spot, walking, step);
  }

  private draw(spot: Spot | null, walking: boolean, step: Step): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    // The dimmed screen, with holes for Fingamabob and what he shows.
    const holes: string[] = [`<ellipse cx="${this.gx + 22}" cy="${this.gy + 34}" rx="46" ry="52" fill="black"/>`];
    if (spot) {
      holes.push(
        spot.round
          ? `<ellipse cx="${spot.x + spot.w / 2}" cy="${spot.y + spot.h / 2}" rx="${spot.w / 2}" ry="${spot.h / 2}" fill="black"/>`
          : `<rect x="${spot.x}" y="${spot.y}" width="${spot.w}" height="${spot.h}" rx="10" fill="black"/>`,
      );
    }
    const dim = step.dim === false ? 0.12 : 0.34;
    // The world outside the holes loses its colour (a masked backdrop filter).
    const grey = step.dim === false ? 'grayscale(0.55)' : 'grayscale(0.9) brightness(0.8)';
    const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><mask id="m"><rect width="${W}" height="${H}" fill="white"/>${holes.join('')}</mask></defs><rect width="${W}" height="${H}" mask="url(#m)"/></svg>`)}")`;
    if (mask + grey !== this.greyMask) {
      this.greyMask = mask + grey;
      this.grey.style.backdropFilter = grey;
      this.grey.style.maskImage = mask;
      this.grey.style.webkitMaskImage = mask;
    }
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.innerHTML = `<defs><mask id="tmask"><rect width="${W}" height="${H}" fill="white"/>${holes.join('')}</mask>
      <radialGradient id="tglow"><stop offset="0" stop-color="#fff4c8" stop-opacity="0.35"/><stop offset="1" stop-color="#fff4c8" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="rgba(12,10,20,${dim})" mask="url(#tmask)"/>
      <ellipse cx="${this.gx + 22}" cy="${this.gy + 40}" rx="40" ry="44" fill="url(#tglow)"/>
      ${spot ? (spot.round ? `<ellipse cx="${spot.x + spot.w / 2}" cy="${spot.y + spot.h / 2}" rx="${spot.w / 2}" ry="${spot.h / 2}" fill="none" stroke="#f2d878" stroke-width="2.5" stroke-dasharray="6 5"/>` : `<rect x="${spot.x}" y="${spot.y}" width="${spot.w}" height="${spot.h}" rx="10" fill="none" stroke="#f2d878" stroke-width="2.5"/>`) : ''}`;
    // Fingamabob himself.
    this.guide.style.left = `${this.gx}px`;
    this.guide.style.top = `${this.gy}px`;
    this.paintGuide(walking);
    // His balloon, beside him on the side with more room.
    const right = this.gx < W / 2;
    const shown = this.text.slice(0, Math.floor(this.typed));
    const done = this.typed >= this.text.length;
    const t = this.game.state.tutorial!;
    const html = `<div class="t-name">Fingamabob</div><p>${esc(shown)}<span class="t-caret">${done ? '' : '▌'}</span></p>
      <div class="t-foot">${step.until ? `<span class="t-wait">${done ? 'Waiting for you, my liege…' : ''}</span>` : `<span class="t-next">${done ? 'Click to go on ▸' : 'Click to hurry him'}</span>`}<button data-t="skip">Skip tutorial</button></div>`;
    if (this.balloon.dataset.html !== `${t.chapter}${t.step}:${Math.floor(this.typed)}`) {
      this.balloon.dataset.html = `${t.chapter}${t.step}:${Math.floor(this.typed)}`;
      this.balloon.innerHTML = html;
    }
    const bw = Math.min(340, W - 24);
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

function esc(s: string): string {
  return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!);
}
