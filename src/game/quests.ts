import { GOODS } from './data';
import { log, sellPrice, store } from './sim';
import type { BuildingType, Cost, GameState, ResourceId } from './types';

export interface Quest {
  id: string;
  title: string;
  hint: string;
  reward: Cost;
  done: (s: GameState) => boolean;
}

const count = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t && b.build >= 1).length;

export const QUESTS: Quest[] = [
  {
    id: 'houses',
    title: 'Build 2 houses',
    hint: 'Place Burgage Houses near the Manor Hall. Idle villagers will carry the timber and build them.',
    reward: { wood: 20 },
    done: (s) => count(s, 'house') >= 2,
  },
  {
    id: 'wood',
    title: "Build a Woodcutter's Lodge",
    hint: 'Place it near a forest. Timber is needed for everything.',
    reward: { gold: 20 },
    done: (s) => count(s, 'woodcutter') >= 1,
  },
  {
    id: 'food',
    title: 'Secure food',
    hint: "Build a Forager's Hut near berry bushes, or a Hunting Camp by the woods.",
    reward: { wood: 15 },
    done: (s) => count(s, 'forager') + count(s, 'hunter') + count(s, 'fisher') >= 1,
  },
  {
    id: 'stone',
    title: 'Open a stone quarry',
    hint: 'Grey boulders mark rock deposits.',
    reward: { gold: 25 },
    done: (s) => count(s, 'quarry') >= 1,
  },
  {
    id: 'pop15',
    title: 'Grow to 15 villagers',
    hint: 'Keep people fed and happy and settlers will come.',
    reward: { gold: 40 },
    done: (s) => s.population >= 15,
  },
  {
    id: 'well',
    title: 'Dig a well',
    hint: 'Wells make the households around them happier.',
    reward: { stone: 10 },
    done: (s) => count(s, 'well') >= 1,
  },
  {
    id: 'forester',
    title: 'Plant a forest',
    hint: "A Forester's Hut keeps your woodcutters supplied.",
    reward: { wood: 20 },
    done: (s) => count(s, 'forester') >= 1,
  },
  {
    id: 'workers',
    title: 'Put people where they matter',
    hint: 'Select a workplace and click its worker pips or priority. Hover the villagers in the top bar to see who is idle.',
    reward: { wood: 15 },
    done: (s) => s.buildings.some((b) => b.want !== undefined || b.priority !== undefined),
  },
  {
    id: 'firewood',
    title: 'Split firewood for winter',
    hint: "Select a Woodcutter's Lodge and choose Firewood: a bundle warms a home for a winter month, half the timber of logs.",
    reward: { gold: 20 },
    done: (s) => s.res.firewood >= 10,
  },
  {
    id: 'targets',
    title: 'Set a stock target',
    hint: 'Click Materials in the top bar and change how much timber to keep. Workers rest at the target, freeing hands for other work.',
    reward: { gold: 20 },
    done: (s) => Object.keys(s.targets ?? {}).length > 0,
  },
  {
    id: 'garden',
    title: 'Plant a flower garden',
    hint: 'Decorations from the Decor tab make nearby homes happier.',
    reward: { gold: 30 },
    done: (s) => count(s, 'garden') >= 1,
  },
  {
    id: 'village',
    title: 'Become a Village',
    hint: 'Reach 20 villagers, then select the Manor Hall and raise it to a Manor House.',
    reward: { gold: 60 },
    done: (s) => s.tier >= 1,
  },
  {
    id: 'sow',
    title: 'Sow wheat',
    hint: 'Build a Farmstead and draw a field beside it (Farming menu): click one corner, then the other. Wheat is sown in spring and harvested in early autumn.',
    reward: { wood: 15 },
    done: (s) => s.buildings.some((b) => b.type === 'field' && b.build >= 1 && (b.recipe ?? 'wheat') === 'wheat' && b.owner !== undefined),
  },
  {
    id: 'bread',
    title: 'Bake bread',
    hint: 'A Windmill grinds the wheat and a Bakery bakes the flour. The windmill needs wood parts: build a Sawpit for planks and a Carpenter\'s Workshop to make them.',
    reward: { gold: 40 },
    done: (s) => count(s, 'farm') >= 1 && count(s, 'windmill') >= 1 && count(s, 'bakery') >= 1,
  },
  {
    id: 'yard',
    title: 'Keep a backyard',
    hint: 'Select a house and give the family a vegetable patch or a hen coop.',
    reward: { wood: 15 },
    done: (s) => s.buildings.some((b) => b.type === 'house' && !!b.yard),
  },
  {
    id: 'herd',
    title: 'Raise a flock',
    hint: 'Build an Animal Farm and fence a pasture beside it for sheep, cattle or pigs.',
    reward: { gold: 40 },
    done: (s) => s.buildings.some((b) => b.type === 'byre' && (b.herd ?? 0) > 0),
  },
  {
    id: 'planks',
    title: 'Saw planks',
    hint: 'A Sawpit turns timber into planks for finer buildings.',
    reward: { wood: 30 },
    done: (s) => count(s, 'sawmill') >= 1,
  },
  {
    id: 'orchard',
    title: 'Plant an orchard',
    hint: "Build an Orchard Keeper's Lodge and plant fruit trees nearby. They bear after a year and a half.",
    reward: { gold: 40 },
    done: (s) => count(s, 'orchard') >= 1,
  },
  {
    id: 'storehouse',
    title: 'Build a Storehouse',
    hint: 'More room for goods.',
    reward: { gold: 30 },
    done: (s) => count(s, 'storehouse') >= 1,
  },
  {
    id: 'market',
    title: 'Hold a market',
    hint: 'A Marketplace lifts spirits and lets you trade.',
    reward: { gold: 60 },
    done: (s) => count(s, 'market') >= 1,
  },
  {
    id: 'tavern',
    title: 'Open a tavern',
    hint: 'Ale and company cheer nearby homes. A Brewhouse brews ale from barley fields, or cider from apples.',
    reward: { gold: 40 },
    done: (s) => count(s, 'tavern') >= 1,
  },
  {
    id: 'clothes',
    title: 'Clothe your people',
    hint: 'Timber Houses need clothes: shear sheep or grow flax, weave cloth at a Weaver and sew it at a Tailor & Cobbler.',
    reward: { gold: 60 },
    done: (s) => s.res.clothes >= 5,
  },
  {
    id: 'town',
    title: 'Become a Town',
    hint: "With 45 villagers and a marketplace, raise the manor to a Stone Manor. A Stonemason's Yard squares the stone it needs.",
    reward: { gold: 100 },
    done: (s) => s.tier >= 2,
  },
  {
    id: 'tools',
    title: 'Forge tools',
    hint: 'Dig ore at an Iron Mine, smelt it at a Bloomery and forge tools at a Blacksmith.',
    reward: { gold: 50 },
    done: (s) => count(s, 'smithy') >= 1 && s.res.tools >= 1,
  },
  {
    id: 'upgrade',
    title: 'Upgrade 3 homes',
    hint: 'Cottages near a well, a market and a tavern, with clothes and two food groups on the table, can become Timber Houses.',
    reward: { gold: 80 },
    done: (s) => s.buildings.filter((b) => b.type === 'house' && b.level >= 2).length >= 3,
  },
  {
    id: 'church',
    title: 'Raise a church',
    hint: 'A grand undertaking for a growing town.',
    reward: { gold: 100 },
    done: (s) => count(s, 'church') >= 1,
  },
  {
    id: 'borough',
    title: 'Become a Borough',
    hint: "With 90 villagers and a church, raise the manor to a Lord's Keep.",
    reward: { gold: 200 },
    done: (s) => s.tier >= 3,
  },
  {
    id: 'charter',
    title: 'Win a town charter',
    hint: 'Prestige gathers from a fine manor, a church and monuments. Spend it on a charter (crown button) to specialise your town.',
    reward: { gold: 100 },
    done: (s) => (s.charters?.length ?? 0) >= 1,
  },
  {
    id: 'fair',
    title: 'Hold a great fair',
    hint: 'Coins pile up in a busy town. Open the treasury (coins in the top bar) and endow a fair once a year: each grander than the last, each bringing prestige.',
    reward: { prestige: 20 },
    done: (s) => (s.fairs ?? 0) >= 1,
  },
  {
    id: 'city',
    title: 'Raise a castle',
    hint: 'With 150 villagers and three charters, raise the Keep into a Castle and become a City.',
    reward: { gold: 500 },
    done: (s) => s.tier >= 4,
  },
];

export function activeQuests(s: GameState, n = 3): Quest[] {
  return QUESTS.filter((q) => !s.quests.includes(q.id)).slice(0, n);
}

/** Completes any active quests that are satisfied and grants rewards. */
export function checkQuests(s: GameState): Quest[] {
  const done: Quest[] = [  {
    id: 'cathedral',
    title: 'Raise a cathedral',
    hint: 'The great work of a lifetime (Civic menu): a fortune in coin, dressed stone and tiles, most of a year to build. It cheers the whole town and brings prestige every month.',
    reward: { prestige: 50 },
    done: (s) => count(s, 'cathedral') >= 1,
  },
  {
    id: 'walls',
    title: 'Raise the town walls',
    hint: 'A City may wall itself in (Civic menu: Town Wall): lay it like a road, section by section. Where it crosses a road a gate tower rises. Forty sections keep wolves and bandits out.',
    reward: { prestige: 40 },
    done: (s) => count(s, 'wall') >= 40,
  },
];
  for (const q of activeQuests(s, 3)) {
    if (!q.done(s)) continue;
    s.quests.push(q.id);
    // Rewards go into the stores; what does not fit is sold for coins.
    let sold = 0;
    for (const k in q.reward) {
      const id = k as ResourceId;
      const n = q.reward[id] ?? 0;
      const kept = store(s, id, n);
      if (kept < n) sold += sellPrice(s, id, n - kept);
    }
    s.res.gold += sold;
    const reward = Object.entries(q.reward)
      .map(([k, v]) => `${v} ${GOODS[k as keyof Cost].name.toLowerCase()}`)
      .join(', ');
    const note = sold ? ` (the stores were full, so some was sold for ${sold} coins)` : '';
    log(s, `Objective complete: ${q.title}. Reward: ${reward}${note}.`, 'good');
    done.push(q);
  }
  return done;
}
