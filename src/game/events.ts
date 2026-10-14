import { DAYS_PER_MONTH, DAYS_PER_YEAR } from './data';
import type { StateRng } from './rng';
import { store, totalHousing } from './sim';
import type { GameState, MessageKind, ResourceId } from './types';
import { FOOD_IDS } from './data';

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
        detail: '6 tools for 70 coins.',
        blocked: (s) => need(s, 'gold', 70, 'coins'),
        apply: (s) => {
          s.res.gold -= 70;
          store(s, 'tools', 6);
          return { text: 'You bought six good iron tools from the merchant.', kind: 'good' };
        },
      },
      {
        label: 'Sell him timber',
        detail: '40 timber for 70 coins.',
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
        detail: 'Pay the hunters 25 coins. +20 meat.',
        blocked: (s) => need(s, 'gold', 25, 'coins'),
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
      `A royal officer arrives with two soldiers and a ledger. "His Majesty requires his due." He eyes your coffers, which hold ${Math.floor(s.res.gold)} coins.`,
    weight: (s) => (s.res.gold >= 250 ? 2 : 0),
    choices: (s) => [
      {
        label: 'Pay the royal tax',
        detail: `−${Math.floor(s.res.gold * 0.2)} coins (a fifth).`,
        apply: (st) => {
          const n = Math.floor(st.res.gold * 0.2);
          st.res.gold -= n;
          return { text: `You paid ${n} coins to the crown. The officer rode off satisfied.`, kind: 'info' };
        },
      },
      {
        label: 'Slip him a bribe',
        detail: `−${Math.floor(s.res.gold * 0.08)} coins, but the villagers whisper. Happiness −5 for half a year.`,
        apply: (st) => {
          const n = Math.floor(st.res.gold * 0.08);
          st.res.gold -= n;
          addMood(st, 'Whispers of a bribe', -5, 6);
          return { text: `The officer pocketed ${n} coins and found the ledger "in order".`, kind: 'info' };
        },
      },
      {
        label: 'Turn him away',
        detail: 'Risky: half the time he returns with more soldiers and takes a third.',
        apply: (st, rng) => {
          if (rng.next() < 0.5) {
            const n = Math.floor(st.res.gold * 0.33);
            st.res.gold -= n;
            return { text: `The officer returned with a dozen soldiers and seized ${n} coins.`, kind: 'bad' };
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
        detail: '−50 coins. Everyone recovers.',
        blocked: (st) => need(st, 'gold', 50, 'coins'),
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
        detail: '−40 coins now, +90 coins from trade. Happiness +8 for half a year.',
        blocked: (s) => need(s, 'gold', 40, 'coins'),
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
  {
    id: 'bandits',
    title: 'Bandits on the Road',
    text: () =>
      'Carters report masked men on the forest road. Last night they took a wagon of goods and left the driver tied to a tree.',
    weight: (s) => (s.population >= 15 ? 2 : 0),
    choices: (s) => [
      {
        label: 'Raise a watch',
        detail: '−30 coins, −15 timber for watchtowers. Bandits stay away.',
        blocked: (st) => need(st, 'gold', 30, 'coins') ?? need(st, 'wood', 15, 'timber'),
        apply: (st) => {
          st.res.gold -= 30;
          st.res.wood -= 15;
          addMood(st, 'Safe roads', 3, 6);
          return { text: 'Watchmen now walk the road at dusk. The bandits have gone elsewhere.', kind: 'good' };
        },
      },
      {
        label: 'Pay them off',
        detail: `−${Math.max(20, Math.floor(s.res.gold * 0.1))} coins.`,
        apply: (st) => {
          const n = Math.min(st.res.gold, Math.max(20, Math.floor(st.res.gold * 0.1)));
          st.res.gold -= n;
          return { text: `A purse of ${n} coins left in a hollow oak. The robberies stopped, for now.`, kind: 'info' };
        },
      },
      {
        label: 'Ignore them',
        detail: 'They may take a share of your goods.',
        apply: (st, rng) => {
          const lost: string[] = [];
          for (const id of ['wood', 'stone', 'planks', 'tools'] as ResourceId[]) {
            const n = Math.floor(st.res[id] * (0.1 + rng.next() * 0.15));
            if (n > 0) {
              st.res[id] -= n;
              lost.push(`${n} ${id === 'wood' ? 'timber' : id}`);
            }
          }
          addMood(st, 'Fear of bandits', -4, 4);
          return { text: lost.length ? `The bandits raided the stores: ${lost.join(', ')} gone.` : 'The bandits found little worth taking.', kind: 'bad' };
        },
      },
    ],
  },
  {
    id: 'wedding',
    title: 'A Village Wedding',
    text: () => "The miller's daughter is to marry the woodcutter's son. The whole village is invited, and they hope the lord will bless the match.",
    weight: (s) => (s.population >= 12 ? 2 : 0),
    choices: () => [
      {
        label: 'Give a generous gift',
        detail: '−30 coins, −10 food. Happiness +8 for half a year; the couple may bring kin.',
        blocked: (st) => need(st, 'gold', 30, 'coins'),
        apply: (st) => {
          st.res.gold -= 30;
          takeFood(st, 10);
          addMood(st, 'A joyful wedding', 8, 6);
          const beds = totalHousing(st) - st.population;
          if (beds >= 2) {
            st.population += 2;
            return { text: "Dancing on the green until dawn. The bride's cousins liked it so much they stayed.", kind: 'good' };
          }
          return { text: 'Dancing on the green until dawn. A day to remember.', kind: 'good' };
        },
      },
      {
        label: 'Send your blessing',
        detail: 'Happiness +3 for a season.',
        apply: (st) => {
          addMood(st, 'The lord’s blessing', 3, 3);
          return { text: 'The couple were glad of your kind words.', kind: 'good' };
        },
      },
    ],
  },
  {
    id: 'noble',
    title: 'A Neighbouring Lord Visits',
    text: () =>
      'Sir Aldric of the next valley rides up with his retinue, curious to see what you have made of this corner of the land. How will you receive him?',
    weight: (s) => (s.tier >= 1 ? 2 : 0),
    choices: (s) => [
      {
        label: 'A lavish reception',
        detail: `−${Math.max(20, s.population)} food, −60 coins. +15 prestige.`,
        blocked: (st) => need(st, 'gold', 60, 'coins') ?? (food(st) >= Math.max(20, st.population) ? null : 'Not enough food'),
        apply: (st) => {
          takeFood(st, Math.max(20, st.population));
          st.res.gold -= 60;
          st.res.prestige += 15;
          return { text: 'Venison, music and fine ale. Sir Aldric left full of praise, and word of your hospitality spreads.', kind: 'good' };
        },
      },
      {
        label: 'A simple supper',
        detail: '−10 food. +4 prestige.',
        apply: (st) => {
          takeFood(st, 10);
          st.res.prestige += 4;
          return { text: 'A plain but honest meal. Sir Aldric seemed content.', kind: 'info' };
        },
      },
      {
        label: 'Plead other business',
        detail: '−3 prestige.',
        apply: (st) => {
          st.res.prestige = Math.max(0, st.res.prestige - 3);
          return { text: 'Sir Aldric rode home muttering about rude upstarts.', kind: 'bad' };
        },
      },
    ],
  },
  {
    id: 'drought',
    title: 'A Dry Summer',
    text: () => 'Weeks without rain. The wheat is pale and the soil cracks. The farmers look to the sky, and to you.',
    weight: (s, m) => (m >= 3 && m <= 5 && s.buildings.some((b) => b.type === 'farm' && b.build >= 1) ? 2 : 0),
    choices: () => [
      {
        label: 'Carry water to the fields',
        detail: 'Happiness −5 for a season from the hard work. Crops are saved.',
        apply: (st) => {
          addMood(st, 'Hauling water', -5, 3);
          return { text: 'Bucket chains from the river all month. Aching backs, but green fields.', kind: 'info' };
        },
      },
      {
        label: 'Pray for rain',
        detail: 'Crops suffer unless the heavens answer.',
        apply: (st, rng) => {
          if (rng.next() < 0.4) return { text: 'Thunder on the third night! The rain came in time.', kind: 'good' };
          for (const b of st.buildings) if (b.type === 'field') b.growth = Math.max(0, b.growth - 0.3);
          return { text: 'No rain came. The harvest will be thin this year.', kind: 'bad' };
        },
      },
    ],
  },
  {
    id: 'minstrel',
    title: 'A Travelling Minstrel',
    text: () => 'A minstrel with a lute and a dozen songs about dragons offers to stay the season, for a fee and his supper.',
    weight: (s) => (s.population >= 8 ? 2 : 0),
    choices: () => [
      {
        label: 'Hire him for the season',
        detail: '−20 coins. Happiness +5 for four months.',
        blocked: (st) => need(st, 'gold', 20, 'coins'),
        apply: (st) => {
          st.res.gold -= 20;
          addMood(st, 'Songs in the evening', 5, 4);
          return { text: 'Every evening the tavern is full and the songs get longer.', kind: 'good' };
        },
      },
      {
        label: 'Just one song',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'He sang a ballad of the old king and went on his way.', kind: 'info' }),
      },
    ],
  },
  {
    id: 'herd',
    title: 'A Great Herd of Deer',
    text: () => 'Hunters bring word of a great herd of red deer grazing in the clearings beyond the woods.',
    weight: (s, m) => (m >= 5 && m <= 9 && s.buildings.some((b) => b.type === 'hunter' && b.build >= 1) ? 2 : 0),
    choices: () => [
      {
        label: 'A great hunt',
        detail: '+40 meat, +10 hides. The herd will not return soon.',
        apply: (st) => {
          const n = store(st, 'meat', 40);
          store(st, 'hides', 10);
          return { text: `The hunters brought home ${n} meat. Smoke rises from every chimney.`, kind: 'good' };
        },
      },
      {
        label: 'Let them be',
        detail: 'Happiness +3 for half a year. The forest stays rich in game.',
        apply: (st) => {
          addMood(st, 'Deer in the meadows', 3, 6);
          return { text: 'Children sneak out at dawn to watch the deer graze.', kind: 'good' };
        },
      },
    ],
  },
  {
    id: 'fire',
    title: 'Fire!',
    text: () => 'A spark from a hearth caught the thatch. Flames leap from roof to roof while villagers shout for water.',
    weight: (s) => (s.buildings.filter((b) => b.type === 'house' && b.build >= 1).length >= 6 ? 1 : 0),
    choices: (s) => {
      const wells = s.buildings.some((b) => b.type === 'well' && b.build >= 1);
      return [
        {
          label: 'Everyone to the buckets',
          detail: wells ? 'The wells are close by: little is lost. −10 timber.' : 'No well nearby: −30 timber of damage.',
          apply: (st) => {
            const n = Math.min(st.res.wood, wells ? 10 : 30);
            st.res.wood -= n;
            return { text: wells ? 'The wells saved the day. Only one roof needs rethatching.' : `The fire burned for hours. Repairs took ${n} timber.`, kind: wells ? 'info' : 'bad' };
          },
        },
        {
          label: 'Tear down the burning roofs',
          detail: '−20 timber, happiness −4 for a season.',
          apply: (st) => {
            st.res.wood = Math.max(0, st.res.wood - 20);
            addMood(st, 'Lost their roofs', -4, 3);
            return { text: 'The fire was stopped, at the cost of a few roofs.', kind: 'bad' };
          },
        },
      ];
    },
  },
  {
    id: 'winter',
    title: 'A Bitter Winter',
    text: () => 'The well froze solid overnight. The old folk say this winter will be the hardest in memory.',
    weight: (_s, m) => (m === 9 || m === 10 ? 2 : 0),
    choices: (s) => {
      const homes = s.buildings.filter((b) => b.residents > 0).length;
      return [
        {
          label: 'Hand out extra firewood',
          detail: `−${homes * 2} timber. Happiness +4 for the winter.`,
          blocked: (st) => need(st, 'wood', homes * 2, 'timber'),
          apply: (st) => {
            st.res.wood -= homes * 2;
            addMood(st, 'Warm hearths', 4, 3);
            return { text: 'Every hearth burned bright. The village sang through the long nights.', kind: 'good' };
          },
        },
        {
          label: 'They will manage',
          detail: 'Happiness −6 for the winter.',
          apply: (st) => {
            addMood(st, 'A cold winter', -6, 3);
            return { text: 'Families huddled together under every blanket they owned.', kind: 'bad' };
          },
        },
      ];
    },
  },
  {
    id: 'murrain',
    title: 'Murrain in the Herds',
    text: () => 'A sickness has come among the animals. Several stand listless in the pasture and will not eat.',
    weight: (s) => (s.buildings.some((b) => b.type === 'byre' && (b.herd ?? 0) >= 6) ? 2 : 0),
    choices: () => [
      {
        label: 'Cull the sick beasts at once',
        detail: 'Each herd loses a third, but the sickness stops. +hides.',
        apply: (st) => {
          let lost = 0;
          for (const b of st.buildings) {
            if (b.type !== 'byre' || !b.herd) continue;
            const n = Math.ceil(b.herd / 3);
            b.herd -= n;
            lost += n;
          }
          store(st, 'hides', lost);
          return { text: `${lost} animals were culled and burned. The rest are healthy.`, kind: 'info' };
        },
      },
      {
        label: 'Call the herb-wife',
        detail: '−5 herbs or medicine. Most of the herds recover.',
        blocked: (st) => (Math.floor(st.res.herbs) + Math.floor(st.res.medicine) >= 5 ? null : 'Needs 5 herbs or medicine'),
        apply: (st) => {
          const m = Math.min(5, Math.floor(st.res.medicine));
          st.res.medicine -= m;
          st.res.herbs = Math.max(0, st.res.herbs - (5 - m));
          for (const b of st.buildings) if (b.type === 'byre' && b.herd) b.herd = Math.max(1, b.herd - 1);
          return { text: 'Bitter draughts and smoke in the byres. Only a few animals were lost.', kind: 'good' };
        },
      },
      {
        label: 'Let it run its course',
        detail: 'Herds may lose half their animals.',
        apply: (st, rng) => {
          let lost = 0;
          for (const b of st.buildings) {
            if (b.type !== 'byre' || !b.herd) continue;
            const n = Math.floor(b.herd * (0.2 + rng.next() * 0.3));
            b.herd -= n;
            lost += n;
          }
          return { text: `The murrain took ${lost} animals before it passed.`, kind: 'bad' };
        },
      },
    ],
  },
  {
    id: 'scholar',
    title: 'A Travelling Scholar',
    text: () => 'A scholar from the university in the south stops at the manor, his mule loaded with books. He would teach for a season, for board and a fee.',
    weight: (s) => (s.tier >= 2 ? 1.5 : 0),
    choices: () => [
      {
        label: 'Let him teach',
        detail: '−60 coins. +10 prestige, happiness +4 for half a year.',
        blocked: (st) => need(st, 'gold', 60, 'coins'),
        apply: (st) => {
          st.res.gold -= 60;
          st.res.prestige += 10;
          addMood(st, 'Lessons from the scholar', 4, 6);
          return { text: 'Children and clerks crowded the hall to hear him. Your house gains renown for learning.', kind: 'good' };
        },
      },
      {
        label: 'Buy his books',
        detail: '3 books for 90 coins.',
        blocked: (st) => need(st, 'gold', 90, 'coins'),
        apply: (st) => {
          st.res.gold -= 90;
          store(st, 'books', 3);
          return { text: 'Three fine books, bound in calfskin, now sit in the manor.', kind: 'good' };
        },
      },
      {
        label: 'No need for book-learning',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'The scholar went on his way, muttering in Latin.', kind: 'info' }),
      },
    ],
  },
  {
    id: 'wool',
    title: 'The Wool Merchant',
    text: () => 'A Flemish wool merchant has heard of your flocks. He offers a fine price for fleeces, paid in silver.',
    weight: (s) => (s.res.wool >= 20 || s.res.cloth >= 10 ? 2 : 0),
    choices: (s) => [
      {
        label: 'Sell him wool',
        detail: `${Math.min(40, Math.floor(s.res.wool))} wool for ${Math.min(40, Math.floor(s.res.wool)) * 6} coins.`,
        blocked: (st) => (st.res.wool >= 5 ? null : 'Not enough wool'),
        apply: (st) => {
          const n = Math.min(40, Math.floor(st.res.wool));
          st.res.wool -= n;
          st.res.gold += n * 6;
          return { text: `The merchant paid ${n * 6} coins for ${n} fleeces.`, kind: 'good' };
        },
      },
      {
        label: 'Sell him cloth instead',
        detail: `${Math.min(20, Math.floor(s.res.cloth))} cloth for ${Math.min(20, Math.floor(s.res.cloth)) * 14} coins, +3 prestige.`,
        blocked: (st) => (st.res.cloth >= 5 ? null : 'Not enough cloth'),
        apply: (st) => {
          const n = Math.min(20, Math.floor(st.res.cloth));
          st.res.cloth -= n;
          st.res.gold += n * 14;
          st.res.prestige += 3;
          return { text: `Your weavers' cloth will be sold in Bruges. ${n * 14} coins, and some fame.`, kind: 'good' };
        },
      },
      {
        label: 'Keep it for our own looms',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'The merchant shrugged and rode on.', kind: 'info' }),
      },
    ],
  },
  {
    id: 'mason',
    title: 'A Master Mason',
    text: () => 'A master mason who worked on the cathedral at the capital seeks a new commission. He could teach your stonemasons, or build something fine.',
    weight: (s) => (s.tier >= 2 && s.buildings.some((b) => b.type === 'stonemason' && b.build >= 1) ? 1.5 : 0),
    choices: () => [
      {
        label: 'Commission a fine gateway',
        detail: '−30 dressed stone, −80 coins. +15 prestige.',
        blocked: (st) => need(st, 'dressedstone', 30, 'dressed stone') ?? need(st, 'gold', 80, 'coins'),
        apply: (st) => {
          st.res.dressedstone -= 30;
          st.res.gold -= 80;
          st.res.prestige += 15;
          return { text: 'A carved gateway with your arms now greets every traveller.', kind: 'good' };
        },
      },
      {
        label: 'Have him teach the masons',
        detail: '−50 coins. +30 dressed stone now.',
        blocked: (st) => need(st, 'gold', 50, 'coins'),
        apply: (st) => {
          st.res.gold -= 50;
          store(st, 'dressedstone', 30);
          return { text: 'Under his eye the masons squared a whole stack of blocks in a month.', kind: 'good' };
        },
      },
      {
        label: 'Not now',
        detail: 'Nothing happens.',
        apply: () => ({ text: 'The master mason went to look for work elsewhere.', kind: 'info' }),
      },
    ],
  },
];

/** Days between decision events (randomised in this range). */
/** One and a half to two events a year. */
const GAP_MIN = Math.round(DAYS_PER_YEAR / 2);
const GAP_MAX = Math.round(DAYS_PER_YEAR / 1.5);

export function getEvent(id: string): DecisionEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}

/** At the start of a month, maybe raise a decision event for the player. */
export function rollEvent(s: GameState, rng: StateRng, month: number): string | null {
  if (s.pendingEvent) return null;
  s.nextEventDay ??= Math.round(DAYS_PER_YEAR * 0.4) + rng.int(GAP_MAX - GAP_MIN);
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
