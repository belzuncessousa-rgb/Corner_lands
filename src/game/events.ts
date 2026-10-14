import { DAYS_PER_MONTH, DAYS_PER_YEAR } from './data';
import type { StateRng } from './rng';
import { store, totalHousing } from './sim';
import type { GameState, MessageKind, ResourceId } from './types';
import { FOOD_IDS } from './types';

/**
 * Rare decision events. Every year or two something happens that pauses the
 * game and asks the lord to choose.
 */

export interface Choice {
  label: string;
  /** What the choice costs or brings, shown under the label. */
  detail: string;
  /** Why the choice cannot be taken right now, if so. */
  blocked?: (s: GameState) => string | null;
  apply: (s: GameState, rng: StateRng) => { text: string; kind: MessageKind };
}

export interface DecisionEvent {
  id: string;
  title: string;
  text: (s: GameState) => string;
  /** Relative chance; 0 when it cannot happen now. */
  weight: (s: GameState, month: number) => number;
  choices: (s: GameState) => Choice[];
}

/** Adds a temporary happiness effect lasting some months. */
export function addMood(s: GameState, label: string, value: number, months: number): void {
  s.moods = (s.moods ?? []).filter((m) => m.label !== label);
  s.moods.push({ label, value, until: s.day + months * DAYS_PER_MONTH });
}

/** Takes food spread across kinds, returning how much was taken. */
function takeFood(s: GameState, n: number): number {
  let left = n;
  while (left > 0) {
    let took = false;
    for (const f of FOOD_IDS) {
      if (left > 0 && s.res[f] >= 1) {
        s.res[f]--;
        left--;
        took = true;
      }
    }
    if (!took) break;
  }
  return n - left;
}

const food = (s: GameState) => FOOD_IDS.reduce((a, f) => a + s.res[f], 0);
const need = (s: GameState, id: ResourceId, n: number, name: string) => (s.res[id] >= n ? null : `Needs ${n} ${name}`);

export const EVENTS: DecisionEvent[] = [
  {
    id: 'family',
    title: 'Wanderers at the Gate',
    text: () =>
      'A ragged family of four stands at the edge of your lands. Their village burned last winter and they ask, caps in hand, whether there is room for them here.',
    weight: (s) => (s.population > 0 ? 3 : 0),
    choices: () => [
      {
        label: 'Welcome them',
        detail: '+4 villagers, −8 food. Needs 4 free beds.',
        blocked: (st) => (totalHousing(st) - st.population >= 4 ? null : 'Not enough free housing'),
        apply: (st) => {
          st.population += 4;
          takeFood(st, 8);
          return { text: 'The family has settled in. They were glad of a warm bowl of pottage.', kind: 'good' };
        },
      },
      {
        label: 'Put them to work for a season',
        detail: '+25 timber, −10 food. They move on afterwards.',
        apply: (st) => {
          store(st, 'wood', 25);
          takeFood(st, 10);
          return { text: 'The wanderers cut timber all season, then went on their way with full bellies.', kind: 'good' };
        },
      },
      {
        label: 'Send them on their way',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'The wanderers trudged on toward the next valley.', kind: 'info' }),
      },
    ],
  },
  {
    id: 'merchant',
    title: 'A Travelling Merchant',
    text: () =>
      'A merchant with a heavy cart and a heavier purse stops at the manor. "Fine iron tools from the city, my lord, or perhaps you have timber to spare?"',
    weight: () => 3,
    choices: () => [
      {
        label: 'Buy his tools',
        detail: '6 tools for 70 gold.',
        blocked: (s) => need(s, 'gold', 70, 'gold'),
        apply: (s) => {
          s.res.gold -= 70;
          store(s, 'tools', 6);
          return { text: 'You bought six good iron tools from the merchant.', kind: 'good' };
        },
      },
      {
        label: 'Sell him timber',
        detail: '40 timber for 70 gold.',
        blocked: (s) => need(s, 'wood', 40, 'timber'),
        apply: (s) => {
          s.res.wood -= 40;
          s.res.gold += 70;
          return { text: 'The merchant loaded forty logs onto his cart and paid in silver.', kind: 'good' };
        },
      },
      {
        label: 'Send him away',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'The merchant tipped his hat and rattled off down the road.', kind: 'info' }),
      },
    ],
  },
  {
    id: 'wolves',
    title: 'Wolves in the Woods',
    text: () =>
      'Howling in the night. A shepherd swears he saw a pack of wolves at the forest edge, bold and hungry, eyeing the smokehouse.',
    weight: (s) => (s.population >= 10 ? 2 : 0),
    choices: () => [
      {
        label: 'Organise a hunt',
        detail: 'Pay the hunters 25 gold. +20 meat.',
        blocked: (s) => need(s, 'gold', 25, 'gold'),
        apply: (s) => {
          s.res.gold -= 25;
          store(s, 'meat', 20);
          return { text: 'The hunt was a success. The pack is gone and the smokehouse is full.', kind: 'good' };
        },
      },
      {
        label: 'Build fences',
        detail: '−25 timber. Nothing is lost.',
        blocked: (s) => need(s, 'wood', 25, 'timber'),
        apply: (s) => {
          s.res.wood -= 25;
          return { text: 'Stout fences went up around the stores. The wolves slunk away.', kind: 'info' };
        },
      },
      {
        label: 'Hope they pass by',
        detail: 'Lose up to 20 food; people sleep badly for a while.',
        apply: (s) => {
          const lost = takeFood(s, 20);
          addMood(s, 'Fear of wolves', -5, 6);
          return { text: `Wolves raided the stores and carried off ${lost} food. The villagers bar their doors at night.`, kind: 'bad' };
        },
      },
    ],
  },
  {
    id: 'feast',
    title: 'A Harvest Feast?',
    text: () =>
      'The harvest is in and the evenings are drawing in. The villagers look to the manor, hopeful. A feast would be remembered for a long time.',
    weight: (s, m) => (m >= 6 && m <= 8 && food(s) >= s.population * 3 && s.population >= 8 ? 3 : 0),
    choices: (s) => [
      {
        label: 'Hold a grand feast',
        detail: `−${s.population} food. Happiness +12 for half a year.`,
        blocked: (st) => (food(st) >= st.population ? null : 'Not enough food'),
        apply: (st) => {
          takeFood(st, st.population);
          addMood(st, 'Memories of the feast', 12, 6);
          return { text: 'Music, ale and roast meat late into the night. Nobody will forget it soon.', kind: 'good' };
        },
      },
      {
        label: 'A modest gathering',
        detail: `−${Math.ceil(s.population / 3)} food. Happiness +5 for a season.`,
        apply: (st) => {
          takeFood(st, Math.ceil(st.population / 3));
          addMood(st, 'A pleasant evening', 5, 3);
          return { text: 'Bread, cheese and songs by the fire. A pleasant evening.', kind: 'good' };
        },
      },
      {
        label: 'No time for feasting',
        detail: 'Happiness −4 for a season.',
        apply: (st) => {
          addMood(st, 'No harvest feast', -4, 3);
          return { text: 'The villagers grumble that the lord has no heart.', kind: 'bad' };
        },
      },
    ],
  },
  {
    id: 'collector',
    title: "The King's Tax Collector",
    text: (s) =>
      `A royal officer arrives with two soldiers and a ledger. "His Majesty requires his due." He eyes your coffers, which hold ${Math.floor(s.res.gold)} gold.`,
    weight: (s) => (s.res.gold >= 250 ? 2 : 0),
    choices: (s) => [
      {
        label: 'Pay the royal tax',
        detail: `−${Math.floor(s.res.gold * 0.2)} gold (a fifth).`,
        apply: (st) => {
          const n = Math.floor(st.res.gold * 0.2);
          st.res.gold -= n;
          return { text: `You paid ${n} gold to the crown. The officer rode off satisfied.`, kind: 'info' };
        },
      },
      {
        label: 'Slip him a bribe',
        detail: `−${Math.floor(s.res.gold * 0.08)} gold, but the villagers whisper. Happiness −5 for half a year.`,
        apply: (st) => {
          const n = Math.floor(st.res.gold * 0.08);
          st.res.gold -= n;
          addMood(st, 'Whispers of a bribe', -5, 6);
          return { text: `The officer pocketed ${n} gold and found the ledger "in order".`, kind: 'info' };
        },
      },
      {
        label: 'Turn him away',
        detail: 'Risky: half the time he returns with more soldiers and takes a third.',
        apply: (st, rng) => {
          if (rng.next() < 0.5) {
            const n = Math.floor(st.res.gold * 0.33);
            st.res.gold -= n;
            return { text: `The officer returned with a dozen soldiers and seized ${n} gold.`, kind: 'bad' };
          }
          addMood(st, 'Stood up to the crown', 6, 6);
          return { text: 'The officer blustered, but never came back. The villagers cheer their lord.', kind: 'good' };
        },
      },
    ],
  },
  {
    id: 'storm',
    title: 'A Summer Storm',
    text: () => 'A great storm swept through in the night. Thatch was torn from roofs and the rain got in everywhere.',
    weight: (s, m) => (m >= 3 && m <= 7 && s.buildings.filter((b) => b.type === 'house').length >= 3 ? 2 : 0),
    choices: () => [
      {
        label: 'Repair the roofs at once',
        detail: '−20 timber.',
        blocked: (s) => need(s, 'wood', 20, 'timber'),
        apply: (s) => {
          s.res.wood -= 20;
          return { text: 'By evening every roof was patched. Good work.', kind: 'info' };
        },
      },
      {
        label: 'Make do for now',
        detail: 'Happiness −8 for four months.',
        apply: (s) => {
          addMood(s, 'Leaky roofs', -8, 4);
          return { text: 'Buckets under every drip. The villagers are not pleased.', kind: 'bad' };
        },
      },
    ],
  },
  {
    id: 'monk',
    title: 'A Wandering Monk',
    text: () =>
      'A barefoot monk asks for a corner to pray in and a little bread. In return, he offers to preach and to teach the children their letters.',
    weight: (s) => (s.population >= 15 && !s.buildings.some((b) => b.type === 'church' && b.build >= 1) ? 2 : 0),
    choices: () => [
      {
        label: 'Give him lodging',
        detail: '−15 timber, −10 food. Happiness +6 for a year.',
        blocked: (s) => need(s, 'wood', 15, 'timber'),
        apply: (s) => {
          s.res.wood -= 15;
          takeFood(s, 10);
          addMood(s, "The monk's sermons", 6, 12);
          return { text: 'The monk built a little hermitage and preaches every Sunday.', kind: 'good' };
        },
      },
      {
        label: 'Send him onward',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'The monk blessed the manor anyway and walked on.', kind: 'info' }),
      },
    ],
  },
  {
    id: 'fever',
    title: 'Fever in the Village',
    text: () => 'A fever is spreading through the cottages. Children cough through the night and the old fear the worst.',
    weight: (s) => (s.population >= 20 ? 1 : 0),
    choices: () => [
      {
        label: 'Send for a physician',
        detail: '−50 gold. Everyone recovers.',
        blocked: (st) => need(st, 'gold', 50, 'gold'),
        apply: (st) => {
          st.res.gold -= 50;
          return { text: 'The physician from town brought bitter draughts. Everyone recovered.', kind: 'good' };
        },
      },
      {
        label: 'Rely on herb lore',
        detail: '−15 berries. Most recover, but some may leave.',
        apply: (st, rng) => {
          st.res.berries = Math.max(0, st.res.berries - 15);
          if (rng.next() < 0.5 && !st.relaxed) {
            const n = Math.min(2, Math.max(0, st.population - 2));
            st.population -= n;
            return { text: `Most recovered, but ${n} villagers left to seek better care.`, kind: 'bad' };
          }
          return { text: 'Old remedies did the trick. The fever passed.', kind: 'good' };
        },
      },
    ],
  },
  {
    id: 'fair',
    title: 'A Country Fair',
    text: () => 'Pedlars and players ask to hold a fair in your marketplace. It would cost something to host, but draw folk from all around.',
    weight: (s) => (s.buildings.some((b) => b.type === 'market' && b.build >= 1) ? 2 : 0),
    choices: () => [
      {
        label: 'Host the fair',
        detail: '−40 gold now, +90 gold from trade. Happiness +8 for half a year.',
        blocked: (s) => need(s, 'gold', 40, 'gold'),
        apply: (s) => {
          s.res.gold += 50;
          addMood(s, 'The country fair', 8, 6);
          return { text: 'Jugglers, bear-baiting and honey cakes! The fair was a roaring success.', kind: 'good' };
        },
      },
      {
        label: 'Not this year',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'The pedlars moved on to the next town.', kind: 'info' }),
      },
    ],
  },
];

/** Days between decision events (randomised in this range). */
const GAP_MIN = Math.round(DAYS_PER_YEAR * 1.3);
const GAP_MAX = Math.round(DAYS_PER_YEAR * 2.3);

export function getEvent(id: string): DecisionEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}

/** At the start of a month, maybe raise a decision event for the player. */
export function rollEvent(s: GameState, rng: StateRng, month: number): string | null {
  if (s.pendingEvent) return null;
  s.nextEventDay ??= DAYS_PER_YEAR + rng.int(DAYS_PER_YEAR);
  if (s.day < s.nextEventDay) return null;
  const options = EVENTS.map((e) => ({ e, w: e.weight(s, month) })).filter((o) => o.w > 0);
  const total = options.reduce((a, o) => a + o.w, 0);
  if (!total) return null;
  let r = rng.next() * total;
  for (const o of options) {
    r -= o.w;
    if (r > 0) continue;
    s.pendingEvent = o.e.id;
    s.nextEventDay = s.day + GAP_MIN + rng.int(GAP_MAX - GAP_MIN);
    return o.e.id;
  }
  return null;
}

/** Applies the chosen option of the pending event. Returns false if not allowed. */
export function resolveEvent(s: GameState, rng: StateRng, choice: number): boolean {
  const e = s.pendingEvent ? getEvent(s.pendingEvent) : undefined;
  if (!e) {
    s.pendingEvent = undefined;
    return false;
  }
  const c = e.choices(s)[choice];
  if (!c || c.blocked?.(s)) return false;
  const out = c.apply(s, rng);
  s.messages.push({ day: s.day, text: `${e.title}: ${out.text}`, kind: out.kind });
  s.pendingEvent = undefined;
  return true;
}

/** Picks the first allowed choice (used by the autoplayer and title demo). */
export function autoResolve(s: GameState, rng: StateRng): void {
  const e = s.pendingEvent ? getEvent(s.pendingEvent) : undefined;
  if (!e) {
    s.pendingEvent = undefined;
    return;
  }
  const i = e.choices(s).findIndex((c) => !c.blocked?.(s));
  if (i < 0 || !resolveEvent(s, rng, i)) s.pendingEvent = undefined;
}
