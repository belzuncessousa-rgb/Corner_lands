import { GOODS } from './data';
import type { BuildingType, GameState, ResourceId } from './types';

/**
 * What the town knows how to build. Every building outside the starting set,
 * every extra recipe, crop and animal is an unlock: either it opens when the
 * settlement reaches a rank, or it is learned with knowledge, never both.
 * Some wait for something the town has done first (a condition).
 */

export type UnlockKind = 'building' | 'recipe' | 'crop' | 'animal' | 'upgrade' | 'extension' | 'variant' | 'choice' | 'option';

/** The learning board's tabs, by craft. */
export type LearnTab = 'land' | 'farm' | 'herd' | 'craft' | 'civic';

export const LEARN_TABS: { id: LearnTab; name: string }[] = [
  { id: 'land', name: 'Timber & stone' },
  { id: 'farm', name: 'Farming & food' },
  { id: 'herd', name: 'Herds & orchards' },
  { id: 'craft', name: 'Crafts' },
  { id: 'civic', name: 'Civics' },
];

/** Conditions that are not about goods made (see conditionMet). */
export type ConditionTest = 'herd15' | 'herd30' | 'greatwork' | 'storefull' | 'church10' | 'well8' | 'courtfull' | 'stablefull' | 'animalwork' | 'trade200' | 'trade250' | 'trade500' | 'trade600' | 'trade1000';

export interface Condition {
  /** Goods the town must have made in total. */
  made?: Partial<Record<ResourceId, number>>;
  /** Something else the town must have done. */
  test?: ConditionTest;
  /** A building the town must own (any of these). */
  built?: BuildingType[];
  /** How the condition reads on the patch. */
  label: string;
}

export interface Unlock {
  id: string;
  name: string;
  kind: UnlockKind;
  tab: LearnTab;
  /** Patches of one group sit together on the board. */
  group: string;
  /** One line on what it changes. */
  desc: string;
  /** Opens by itself once the settlement reaches this rank. */
  rank?: number;
  /** Knowledge it costs to learn. */
  knowledge?: number;
  condition?: Condition;
  /** Unlocks that must be learned first. */
  needs?: string[];
  /** Learning it also opens these (a mill brings wheat with it). */
  grants?: string[];
  /** Exclusive choices share a group: taking one closes the others. */
  choice?: string;
  /** What it opens. */
  building?: BuildingType;
  recipe?: { building: BuildingType; id: string };
  /** An improvement (upgrade or extension) workplaces may then be given. */
  improvement?: string;
  /** A town option that can then be switched on (see options.ts). */
  option?: string;
  /** The icon on its patch (a good or building icon key). */
  icon: string;
}

const b = (type: BuildingType) => `b:${type}`;
const r = (type: BuildingType, id: string) => `r:${type}:${id}`;

export const UNLOCKS: Unlock[] = [
  // ------------------------------------------------ timber & stone
  { id: b('forester'), name: "Forester's Hut", kind: 'building', tab: 'land', group: 'Timber', desc: 'Plants trees where the woods have thinned.', knowledge: 1, building: 'forester', icon: 'forester' },
  { id: b('carpenter'), name: "Carpenter's Workshop", kind: 'building', tab: 'land', group: 'Timber', desc: 'Planks into wood parts, which mills and workshops wear.', knowledge: 1, building: 'carpenter', icon: 'carpenter' },
  { id: b('cooper'), name: "Cooper's Workshop", kind: 'building', tab: 'land', group: 'Timber', desc: 'Planks and iron hoops into crates, which carry more trade.', knowledge: 3, condition: { built: ['tradingpost', 'dock', 'winery'], label: 'a trading post, dock or winery' }, building: 'cooper', icon: 'cooper' },
  { id: b('watersawmill'), name: 'Water Sawmill', kind: 'building', tab: 'land', group: 'Timber', desc: 'Beside water: one timber makes one plank.', knowledge: 8, needs: [b('carpenter')], building: 'watersawmill', icon: 'watersawmill' },
  { id: b('claypit'), name: 'Clay Pit', kind: 'building', tab: 'land', group: 'Earth', desc: 'Digs clay from a shore.', rank: 1, building: 'claypit', icon: 'claypit' },
  { id: b('kiln'), name: 'Tile Kiln', kind: 'building', tab: 'land', group: 'Earth', desc: 'Fires clay into roof tiles.', knowledge: 1, building: 'kiln', icon: 'kiln' },
  { id: b('potter'), name: "Potter's Workshop", kind: 'building', tab: 'land', group: 'Earth', desc: 'Fine glazed pottery, coloured with dye: a luxury.', knowledge: 6, building: 'potter', icon: 'potter' },
  { id: b('sandpit'), name: 'Sand Pit', kind: 'building', tab: 'land', group: 'Earth', desc: 'Digs and sieves sand from a shore.', rank: 2, building: 'sandpit', icon: 'sandpit' },
  { id: b('stonemason'), name: "Stonemason's Yard", kind: 'building', tab: 'land', group: 'Stone', desc: 'Squares stone into dressed blocks for fine buildings.', knowledge: 2, building: 'stonemason', icon: 'stonemason' },
  { id: b('limekiln'), name: 'Lime Kiln', kind: 'building', tab: 'land', group: 'Stone', desc: 'Burns stone with sand into mortar.', knowledge: 2, building: 'limekiln', icon: 'limekiln' },

  // ------------------------------------------------ farming & food
  { id: b('windmill'), name: 'Windmill and wheat', kind: 'building', tab: 'farm', group: 'Grain', desc: 'Wheat for the fields and a mill to grind it into flour.', knowledge: 1, building: 'windmill', grants: [r('field', 'wheat')], icon: 'windmill' },
  { id: r('field', 'wheat'), name: 'Wheat', kind: 'crop', tab: 'farm', group: 'Grain', desc: 'The bread grain, learned with the windmill.', recipe: { building: 'field', id: 'wheat' }, icon: 'grain' },
  { id: b('bakery'), name: 'Bakery', kind: 'building', tab: 'farm', group: 'Grain', desc: 'Bakes flour into bread.', knowledge: 1, building: 'bakery', icon: 'bakery' },
  { id: b('watermill'), name: 'Watermill', kind: 'building', tab: 'farm', group: 'Grain', desc: 'The big mill, on a river.', knowledge: 5, building: 'watermill', icon: 'watermill' },
  { id: b('silo'), name: 'Silo', kind: 'building', tab: 'farm', group: 'Grain', desc: 'Keeps grain dry for years.', knowledge: 1, needs: [r('field', 'wheat')], building: 'silo', icon: 'silo' },
  { id: r('field', 'barley'), name: 'Barley', kind: 'crop', tab: 'farm', group: 'Drink', desc: 'The brewing grain.', knowledge: 1, recipe: { building: 'field', id: 'barley' }, icon: 'barley' },
  { id: b('brewhouse'), name: 'Brewhouse', kind: 'building', tab: 'farm', group: 'Drink', desc: 'Opened by the first drink learned.', building: 'brewhouse', icon: 'brewhouse' },
  { id: r('brewhouse', 'ale'), name: 'Brewhouse: ale', kind: 'recipe', tab: 'farm', group: 'Drink', desc: 'Brews barley into ale. The first drink learned opens the brewhouse.', knowledge: 1, recipe: { building: 'brewhouse', id: 'ale' }, grants: [b('brewhouse')], icon: 'ale' },
  { id: r('brewhouse', 'cider'), name: 'Brewhouse: cider', kind: 'recipe', tab: 'farm', group: 'Drink', desc: 'Presses apples into cider. The first drink learned opens the brewhouse.', knowledge: 1, recipe: { building: 'brewhouse', id: 'cider' }, grants: [b('brewhouse')], icon: 'cider' },
  { id: r('brewhouse', 'mead'), name: 'Brewhouse: mead', kind: 'recipe', tab: 'farm', group: 'Drink', desc: 'Ferments honey into mead.', knowledge: 3, recipe: { building: 'brewhouse', id: 'mead' }, grants: [b('brewhouse')], icon: 'mead' },
  { id: r('forager', 'herbs'), name: 'Forager: herbs', kind: 'recipe', tab: 'farm', group: 'Wild', desc: 'Foragers learn the herbs of the woods.', knowledge: 1, recipe: { building: 'forager', id: 'herbs' }, icon: 'herbs' },
  { id: b('apothecary'), name: 'Apothecary', kind: 'building', tab: 'farm', group: 'Wild', desc: 'Herbs into medicine.', knowledge: 4, building: 'apothecary', icon: 'apothecary' },

  // ------------------------------------------------ herds & orchards
  { id: b('byre'), name: 'Animal Farm', kind: 'building', tab: 'herd', group: 'Herds', desc: 'Sheep and pigs on fenced pastures.', knowledge: 2, building: 'byre', icon: 'byre' },
  { id: 'a:cattle', name: 'Cattle', kind: 'animal', tab: 'herd', group: 'Herds', desc: 'The bigger beast: milk, meat and hides.', knowledge: 2, needs: [b('byre')], icon: 'byre' },
  { id: b('dairy'), name: 'Dairy', kind: 'building', tab: 'herd', group: 'Herds', desc: 'Milk into cheese.', knowledge: 2, building: 'dairy', icon: 'dairy' },
  { id: b('draughtstable'), name: 'Draught Stable', kind: 'building', tab: 'herd', group: 'Herds', desc: 'Stalls for pack horses and oxen.', knowledge: 2, building: 'draughtstable', icon: 'draughtstable' },
  { id: b('orchardist'), name: "Orchard Keeper's Lodge", kind: 'building', tab: 'herd', group: 'Orchards', desc: 'Apple orchards.', knowledge: 1, building: 'orchardist', icon: 'orchardist' },
  { id: b('beekeeper'), name: 'Beekeeper', kind: 'building', tab: 'herd', group: 'Orchards', desc: 'Honey from rows of skeps, spring to autumn.', knowledge: 2, building: 'beekeeper', icon: 'beekeeper' },
  { id: r('orchard', 'pears'), name: 'Pears', kind: 'variant', tab: 'herd', group: 'Orchards', desc: 'A year longer to bear, but a third more fruit.', knowledge: 6, needs: [b('orchardist')], recipe: { building: 'orchard', id: 'pears' }, icon: 'pears' },
  { id: r('orchard', 'plums'), name: 'Plums', kind: 'crop', tab: 'herd', group: 'Orchards', desc: 'Plum trees for the orchards.', knowledge: 1, needs: [b('orchardist')], recipe: { building: 'orchard', id: 'plums' }, icon: 'plums' },

  // ------------------------------------------------ cloth & dyes
  { id: r('field', 'flax'), name: 'Flax', kind: 'crop', tab: 'craft', group: 'Cloth', desc: 'Linen without sheep.', knowledge: 1, recipe: { building: 'field', id: 'flax' }, icon: 'flax' },
  { id: b('weaver'), name: 'Weaver', kind: 'building', tab: 'craft', group: 'Cloth', desc: 'Wool or flax into cloth.', knowledge: 2, building: 'weaver', icon: 'weaver' },
  { id: b('tailor'), name: 'Tailor & Cobbler: clothes', kind: 'building', tab: 'craft', group: 'Cloth', desc: 'Cloth into clothes.', knowledge: 2, building: 'tailor', icon: 'tailor' },
  { id: b('tanner'), name: 'Tannery', kind: 'building', tab: 'craft', group: 'Leather', desc: 'Hides into leather.', knowledge: 2, building: 'tanner', icon: 'tanner' },
  { id: r('tailor', 'boots'), name: 'Tailor: boots', kind: 'recipe', tab: 'craft', group: 'Leather', desc: 'Leather into boots.', knowledge: 3, needs: [b('tailor')], recipe: { building: 'tailor', id: 'boots' }, icon: 'boots' },
  { id: r('tanner', 'parchment'), name: 'Tanner: parchment', kind: 'recipe', tab: 'craft', group: 'Leather', desc: 'Hides scraped into parchment, for offices and books.', knowledge: 3, needs: [b('tanner')], recipe: { building: 'tanner', id: 'parchment' }, icon: 'parchment' },
  { id: b('cobbler'), name: 'Cobbler', kind: 'building', tab: 'craft', group: 'Leather', desc: 'Boots alone, quicker than the tailor.', knowledge: 6, needs: [r('tailor', 'boots')], building: 'cobbler', icon: 'cobbler' },
  { id: b('embroiderer'), name: 'Embroiderer', kind: 'building', tab: 'craft', group: 'Dyes', desc: 'Dyed cloth into fine clothes, a luxury.', knowledge: 10, building: 'embroiderer', icon: 'embroiderer' },
  { id: r('field', 'woad'), name: 'Woad', kind: 'crop', tab: 'craft', group: 'Dyes', desc: 'The blue dye plant.', knowledge: 3, recipe: { building: 'field', id: 'woad' }, icon: 'woad' },
  { id: b('dyer'), name: "Dyer's Workshop", kind: 'building', tab: 'craft', group: 'Dyes', desc: 'Woad or berries into dyes.', knowledge: 5, building: 'dyer', icon: 'dyer' },

  // ------------------------------------------------ metal & glass
  { id: b('mine'), name: 'Bog Iron Pit', kind: 'building', tab: 'craft', group: 'Iron', desc: 'Digs bog ore.', knowledge: 4, building: 'mine', icon: 'mine' },
  { id: b('collier'), name: 'Charcoal Burner', kind: 'building', tab: 'craft', group: 'Iron', desc: 'Timber into charcoal, the hot fuel.', knowledge: 3, building: 'collier', icon: 'collier' },
  { id: b('bloomery'), name: 'Bloomery', kind: 'building', tab: 'craft', group: 'Iron', desc: 'Smelts ore into iron.', rank: 1, building: 'bloomery', icon: 'bloomery' },
  { id: b('smithy'), name: 'Blacksmith', kind: 'building', tab: 'craft', group: 'Iron', desc: 'Iron and timber into tools.', knowledge: 2, building: 'smithy', icon: 'smithy' },
  { id: b('glazier'), name: "Glazier's Workshop", kind: 'building', tab: 'craft', group: 'Glass', desc: 'Glass and dyes into stained glass.', knowledge: 10, building: 'glazier', icon: 'glazier' },
  { id: b('glassworks'), name: 'Glassworks', kind: 'building', tab: 'craft', group: 'Glass', desc: 'Sand and charcoal into glass.', knowledge: 10, building: 'glassworks', icon: 'glassworks' },

  // ------------------------------------------------ town, learning & trade
  { id: b('church'), name: 'Wooden Church', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'Worship, cheer and the first schooling.', rank: 1, building: 'church', icon: 'church' },
  { id: b('monastery'), name: 'Monastery', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'Monks read books for knowledge, prestige and cheer.', knowledge: 10, building: 'monastery', icon: 'monastery' },
  { id: b('school'), name: 'Public School', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'A little knowledge from every home; all work a little slower.', knowledge: 2, building: 'school', icon: 'school' },
  { id: b('papermill'), name: 'Paper Mill', kind: 'building', tab: 'civic', group: 'Faith & learning', desc: 'Flax beaten into rag paper by a water wheel.', knowledge: 8, building: 'papermill', icon: 'papermill' },
  { id: b('taxoffice'), name: 'Tax Office', kind: 'building', tab: 'civic', group: 'Services', desc: 'Taxes forty more villagers, on paper or parchment.', rank: 2, building: 'taxoffice', icon: 'taxoffice' },
  { id: b('bathhouse'), name: 'Bathhouse', kind: 'building', tab: 'civic', group: 'Services', desc: "Hot baths: a Merchant's House need.", rank: 3, building: 'bathhouse', icon: 'bathhouse' },
  { id: b('courthouse'), name: 'Courthouse', kind: 'building', tab: 'civic', group: 'Services', desc: 'Keeps order in a crowded town.', rank: 3, building: 'courthouse', icon: 'courthouse' },
  { id: b('tavern'), name: 'Alehouse', kind: 'building', tab: 'civic', group: 'Services', desc: 'Pours drink for the homes around it.', rank: 2, building: 'tavern', icon: 'tavern' },
  { id: b('builderyard'), name: "Builder's Yard", kind: 'building', tab: 'civic', group: 'Services', desc: 'With an ox, building sites nearby rise faster.', knowledge: 4, condition: { built: ['draughtstable'], label: 'a draught stable' }, building: 'builderyard', icon: 'builderyard' },
  { id: b('dock'), name: 'Dock', kind: 'building', tab: 'civic', group: 'Trade', desc: 'Boats trade more, and cheaper.', knowledge: 4, building: 'dock', icon: 'dock' },

  // ------------------------------------------------ the lord's buildings (also wait for the manor)
  { id: b('stewpond'), name: 'Stew Pond', kind: 'building', tab: 'civic', group: 'The manor', desc: "Fish for the lord's table, a little prestige.", knowledge: 4, building: 'stewpond', icon: 'stewpond' },
  { id: b('deerpark'), name: 'Deer Park', kind: 'building', tab: 'civic', group: 'The manor', desc: 'Venison and prestige from a fenced park.', knowledge: 6, building: 'deerpark', icon: 'deerpark' },
  { id: b('barracks'), name: 'Barracks', kind: 'building', tab: 'civic', group: 'The manor', desc: 'Raises the retinue; its men help the courthouse.', knowledge: 6, building: 'barracks', icon: 'barracks' },
  { id: b('tiltyard'), name: 'Tiltyard', kind: 'building', tab: 'civic', group: 'The manor', desc: 'Jousting: fairs bring twice the prestige.', knowledge: 8, building: 'tiltyard', icon: 'tiltyard' },
  { id: b('atelier'), name: "Patrons' Atelier", kind: 'building', tab: 'civic', group: 'The manor', desc: 'Artists who, kept supplied, now and then make a masterpiece.', knowledge: 8, building: 'atelier', icon: 'atelier' },
  // ------------------------------------------------ step 4: upgrades, extensions, variants, choices, options
  { id: 'c:coppice', name: 'Coppicing', kind: 'choice', tab: 'land', group: 'Timber', choice: 'woods', desc: 'Woods regrow twice as fast; woodcutters fell poles: firewood half again, timber a third less.', knowledge: 6, condition: { made: { wood: 200 }, label: '200 timber felled' }, icon: 'firewood' },
  { id: 'c:highforest', name: 'High forest', kind: 'choice', tab: 'land', group: 'Timber', choice: 'woods', desc: 'Tall timber: woodcutters fell a fifth more timber.', knowledge: 6, condition: { made: { wood: 200 }, label: '200 timber felled' }, icon: 'wood' },
  { id: 'i:biglodge', name: "Large woodcutter's lodge", kind: 'upgrade', tab: 'land', group: 'Timber', desc: 'Two more places for woodcutters.', knowledge: 4, condition: { made: { wood: 100 }, label: '100 timber felled' }, improvement: 'biglodge', icon: 'woodcutter' },
  { id: 'i:oxshed', name: 'Ox tool-shed', kind: 'extension', tab: 'land', group: 'Timber', desc: 'No slowing in the woods, less carrying.', knowledge: 4, needs: [b('draughtstable')], condition: { made: { wood: 150 }, label: '150 timber felled' }, improvement: 'oxshed', icon: 'woodcutter' },
  { id: 'i:lathe', name: 'Lathe', kind: 'extension', tab: 'land', group: 'Timber', desc: 'Wood parts from a third fewer planks.', knowledge: 6, needs: [b('carpenter')], condition: { made: { woodparts: 100 }, label: '100 wood parts made' }, improvement: 'lathe', icon: 'woodparts' },
  { id: 'i:nursery', name: 'Tree nursery', kind: 'extension', tab: 'land', group: 'Timber', desc: 'Orchards near a forester bear a season sooner.', knowledge: 4, needs: [b('forester')], condition: { made: { wood: 300 }, label: '300 timber felled' }, improvement: 'nursery', icon: 'forester' },
  { id: 'i:crane', name: 'Quarry crane', kind: 'extension', tab: 'land', group: 'Stone', desc: 'One more place; one stone in five comes out dressed.', knowledge: 8, condition: { made: { stone: 50 }, label: '50 stone quarried' }, improvement: 'crane', icon: 'quarry' },
  { id: 'i:masonslodge', name: "Mason's lodge", kind: 'upgrade', tab: 'land', group: 'Stone', desc: 'Masons help raise Great Works in reach: a fifth faster.', knowledge: 8, needs: [b('stonemason')], condition: { test: 'greatwork', label: 'a Great Work begun' }, improvement: 'masonslodge', icon: 'stonemason' },
  { id: 'o:limewash', name: 'Limewash', kind: 'option', tab: 'land', group: 'Stone', desc: 'Homes limewashed white: +1 beauty each, half a mortar a year.', knowledge: 4, needs: [b('limekiln')], option: 'limewash', icon: 'mortar' },
  { id: 'i:firingchamber', name: 'Second firing chamber', kind: 'extension', tab: 'land', group: 'Earth', desc: 'Tiles on half the fuel.', knowledge: 5, needs: [b('kiln')], condition: { made: { tiles: 100 }, label: '100 tiles fired' }, improvement: 'firingchamber', icon: 'tiles' },
  { id: 'x:stoneroad', name: 'Stone roads', kind: 'variant', tab: 'land', group: 'Stone', desc: 'Roads paved with stone: quicker underfoot.', knowledge: 2, icon: 'paved' },
  { id: 'x:cobbles', name: 'Cobbled streets', kind: 'variant', tab: 'land', group: 'Stone', desc: 'Streets cobbled in dressed stone: quickest of all.', knowledge: 4, needs: ['x:stoneroad'], icon: 'cobbles' },
  { id: r('field', 'rye'), name: 'Rye', kind: 'variant', tab: 'farm', group: 'Grain', desc: 'Grows as well on poor soil as on rich, but yields half as much as wheat.', knowledge: 3, needs: [b('windmill')], recipe: { building: 'field', id: 'rye' }, icon: 'grain' },
  { id: r('field', 'beans'), name: 'Beans', kind: 'variant', tab: 'farm', group: 'Grain', desc: 'Vegetables that feed the soil: the next crop on that field a fifth more.', knowledge: 4, recipe: { building: 'field', id: 'beans' }, icon: 'vegetables' },
  { id: 'i:ironplough', name: 'Iron plough', kind: 'extension', tab: 'farm', group: 'Grain', desc: 'Farmers tend half as many fields again.', knowledge: 6, condition: { made: { grain: 100 }, label: '100 grain harvested' }, improvement: 'ironplough', icon: 'farm' },
  { id: 'i:towermill', name: 'Tower mill', kind: 'upgrade', tab: 'farm', group: 'Grain', desc: 'A quarter more flour from the same grain.', knowledge: 8, needs: [b('windmill')], condition: { made: { flour: 200 }, label: '200 flour milled' }, improvement: 'towermill', icon: 'windmill' },
  { id: 'i:secondcopper', name: "Brewer's second copper", kind: 'upgrade', tab: 'farm', group: 'Drink', desc: 'Brews two drinks at once.', knowledge: 6, needs: [r('brewhouse', 'ale'), r('brewhouse', 'cider')], improvement: 'secondcopper', icon: 'brewhouse' },
  { id: 'i:herbgarden', name: 'Herb garden', kind: 'extension', tab: 'farm', group: 'Wild', desc: 'Herbs from a plot all year.', knowledge: 3, needs: [r('forager', 'herbs')], condition: { made: { herbs: 50 }, label: '50 herbs gathered' }, improvement: 'herbgarden', icon: 'herbs' },
  { id: 'i:fishingboat', name: 'Fishing boat', kind: 'upgrade', tab: 'farm', group: 'Wild', desc: 'One more place on deeper water.', knowledge: 6, condition: { made: { fish: 50 }, label: '50 fish caught' }, improvement: 'fishingboat', icon: 'fisher' },
  { id: 'i:fishpond', name: 'Pisciculture', kind: 'extension', tab: 'farm', group: 'Wild', desc: 'A fish pond by the hut that never runs dry.', knowledge: 6, condition: { made: { fish: 100 }, label: '100 fish caught' }, improvement: 'fishpond', icon: 'fish' },
  { id: 'i:kennels', name: 'Kennels', kind: 'extension', tab: 'farm', group: 'Wild', desc: 'Hunters walk twice as fast; the dogs eat a meat a month.', knowledge: 4, condition: { made: { meat: 100 }, label: '100 meat hunted' }, improvement: 'kennels', icon: 'hunter' },
  { id: 'a:goats', name: 'Goats', kind: 'animal', tab: 'herd', group: 'Herds', desc: 'Milk on scrub: a goat needs one tile but gives little milk.', knowledge: 3, needs: [b('byre')], icon: 'milk' },
  { id: 'x:longwool', name: 'Long-wool sheep', kind: 'variant', tab: 'herd', group: 'Herds', desc: 'Sheep give half as much wool again.', knowledge: 8, needs: [b('byre')], condition: { made: { wool: 200 }, label: '200 wool shorn' }, icon: 'wool' },
  { id: 'c:frisian', name: 'Frisian cattle', kind: 'choice', tab: 'herd', group: 'Herds', choice: 'cattle', desc: 'Twice the milk, a third less meat.', knowledge: 12, needs: ['a:cattle'], condition: { test: 'herd30', label: '30 animals kept' }, icon: 'milk' },
  { id: 'c:highland', name: 'Highland cattle', kind: 'choice', tab: 'herd', group: 'Herds', choice: 'cattle', desc: 'Twice the meat, less milk.', knowledge: 12, needs: ['a:cattle'], condition: { test: 'herd30', label: '30 animals kept' }, icon: 'meat' },
  { id: 'i:animalsheds', name: 'Animal sheds', kind: 'upgrade', tab: 'herd', group: 'Herds', desc: 'Pastures carry 15% more animals.', knowledge: 6, needs: [b('byre')], condition: { test: 'herd15', label: '15 animals kept' }, improvement: 'animalsheds', icon: 'byre' },
  { id: 'i:cheesecellar', name: 'Cheese cellar', kind: 'upgrade', tab: 'herd', group: 'Herds', desc: 'A third less milk for the same cheese.', knowledge: 6, needs: [b('dairy')], condition: { made: { cheese: 30 }, label: '30 cheese made' }, improvement: 'cheesecellar', icon: 'cheese' },
  { id: 'i:bigstable', name: 'Expanded draught stable', kind: 'upgrade', tab: 'herd', group: 'Herds', desc: 'Six stalls instead of three.', knowledge: 8, needs: [b('draughtstable')], condition: { test: 'stablefull', label: 'a full draught stable' }, improvement: 'bigstable', icon: 'draughtstable' },
  { id: 'x:espalier', name: 'Espalier', kind: 'variant', tab: 'herd', group: 'Orchards', desc: 'Orchard tiles touching walls or buildings bear a third more.', knowledge: 8, needs: [b('orchardist')], icon: 'apples' },
  { id: r('orchard', 'strawberries'), name: 'Strawberries', kind: 'variant', tab: 'herd', group: 'Orchards', desc: 'Strawberry beds bear in their first year, and a fifth more.', knowledge: 12, needs: [b('orchardist')], recipe: { building: 'orchard', id: 'strawberries' }, icon: 'strawberries' },
  { id: 'c:skeps', name: 'Skeps', kind: 'choice', tab: 'herd', group: 'Orchards', choice: 'hives', desc: 'More honey, but now and then the bees swarm away.', knowledge: 5, needs: [b('beekeeper')], icon: 'honey' },
  { id: 'c:loghives', name: 'Log hives', kind: 'choice', tab: 'herd', group: 'Orchards', choice: 'hives', desc: 'Steady honey, a little more than before.', knowledge: 5, needs: [b('beekeeper')], icon: 'honey' },
  { id: 'i:broadloom', name: 'Broadloom', kind: 'upgrade', tab: 'craft', group: 'Cloth', desc: 'Half as much cloth again from the same wool or flax.', knowledge: 8, needs: [b('weaver')], condition: { made: { cloth: 100 }, label: '100 cloth woven' }, improvement: 'broadloom', icon: 'weaver' },
  { id: 'o:tunics', name: 'Dyed tunics', kind: 'option', tab: 'craft', group: 'Dyes', desc: 'Villagers in dyed colours: +2 happiness; a dye a year for every ten villagers.', knowledge: 4, needs: [b('dyer')], option: 'tunics', icon: 'dyes' },
  { id: 'i:bellows', name: 'Water bellows', kind: 'extension', tab: 'craft', group: 'Iron', desc: 'Beside water: iron on half the fuel.', knowledge: 10, needs: [b('bloomery')], condition: { made: { iron: 100 }, label: '100 iron smelted' }, improvement: 'bellows', icon: 'bloomery' },
  { id: 'i:farrier', name: 'Farrier', kind: 'extension', tab: 'craft', group: 'Iron', desc: 'Shod animals work a quarter better.', knowledge: 6, needs: [b('smithy')], condition: { test: 'animalwork', label: 'a draught animal at work' }, improvement: 'farrier', icon: 'smithy' },
  { id: 'i:deepshaft', name: 'Deep shaft', kind: 'extension', tab: 'craft', group: 'Iron', desc: 'The ore lasts twice as long.', knowledge: 6, needs: [b('mine')], condition: { made: { ore: 200 }, label: '200 ore dug' }, improvement: 'deepshaft', icon: 'mine' },
  { id: 'i:crownglass', name: 'Crown glass', kind: 'upgrade', tab: 'craft', group: 'Glass', desc: 'Each melt makes half as much glass again.', knowledge: 12, needs: [b('glassworks')], condition: { made: { glass: 50 }, label: '50 glass made' }, improvement: 'crownglass', icon: 'glassworks' },
  { id: 'o:windows', name: 'Church windows', kind: 'option', tab: 'craft', group: 'Glass', desc: 'Stained glass in the church and cathedral: more cheer and prestige; a stained glass each, once.', knowledge: 2, needs: [b('glazier')], option: 'windows', icon: 'stainedglass' },
  { id: 'i:secondvat', name: 'Second vat', kind: 'upgrade', tab: 'civic', group: 'Faith & learning', desc: 'Half as much paper again from the same flax.', knowledge: 6, needs: [b('papermill')], condition: { made: { paper: 100 }, label: '100 paper made' }, improvement: 'secondvat', icon: 'papermill' },
  { id: 'i:sundayschool', name: 'Sunday school', kind: 'extension', tab: 'civic', group: 'Faith & learning', desc: 'Knowledge from every home the church serves; all work 2% slower.', knowledge: 4, condition: { test: 'church10', label: 'a church serving 10 homes' }, improvement: 'sundayschool', icon: 'church' },
  { id: 'i:infirmary', name: 'Infirmary', kind: 'extension', tab: 'civic', group: 'Faith & learning', desc: 'Sickness passes lightly over homes nearby; a medicine a month.', knowledge: 8, needs: [b('monastery')], condition: { made: { medicine: 20 }, label: '20 medicine made' }, improvement: 'infirmary', icon: 'monastery' },
  { id: 'i:loft', name: 'Loft', kind: 'upgrade', tab: 'civic', group: 'Services', desc: 'Stores hold half as much again.', knowledge: 4, condition: { test: 'storefull', label: '300 goods in store' }, improvement: 'loft', icon: 'storage' },
  { id: 'i:bigstore', name: 'Improved stores', kind: 'upgrade', tab: 'civic', group: 'Services', desc: 'Stores hold twice as much as at first, with two more haulers.', knowledge: 6, needs: ['i:loft'], condition: { test: 'storefull', label: '300 goods in store' }, improvement: 'bigstore', icon: 'storage' },
  { id: 'i:oxcarts', name: 'Ox-carts', kind: 'extension', tab: 'civic', group: 'Services', desc: 'Haulers with an ox carry twice as much.', knowledge: 4, needs: ['i:bigstore', b('draughtstable')], improvement: 'oxcarts', icon: 'storage' },
  { id: 'i:pump', name: 'Pump', kind: 'upgrade', tab: 'civic', group: 'Services', desc: 'A well reaches half as far again.', knowledge: 3, condition: { test: 'well8', label: 'a well serving 8 homes' }, improvement: 'pump', icon: 'well' },
  { id: 'i:mountedguard', name: 'Mounted guard', kind: 'extension', tab: 'civic', group: 'Services', desc: 'The watch on horseback keeps order in half as many homes again.', knowledge: 8, needs: [b('courthouse')], condition: { test: 'courtfull', label: 'a courthouse with its hands full' }, improvement: 'mountedguard', icon: 'courthouse' },
  { id: 'i:goodscart', name: 'Goods cart', kind: 'extension', tab: 'civic', group: 'Trade', desc: 'A trading post may keep a pack horse.', knowledge: 4, condition: { test: 'trade200', label: '200 goods traded' }, improvement: 'goodscart', icon: 'tradingpost' },
  { id: 'i:tradecentre', name: 'Trade centre', kind: 'upgrade', tab: 'civic', group: 'Trade', desc: 'Two more places; carts carry twice as much.', knowledge: 8, condition: { test: 'trade600', label: '600 goods traded' }, improvement: 'tradecentre', icon: 'tradingpost' },
  { id: 'i:hugeships', name: 'Great ships', kind: 'upgrade', tab: 'civic', group: 'Trade', desc: 'Docks send away twice as much.', knowledge: 13, needs: [b('dock')], condition: { test: 'trade1000', label: '1000 goods traded' }, improvement: 'hugeships', icon: 'dock' },
  { id: 'x:tollnav', name: 'Toll navigation', kind: 'variant', tab: 'civic', group: 'Trade', desc: 'Merchants sell a tenth cheaper and buy a tenth dearer.', knowledge: 12, condition: { test: 'trade250', label: '250 goods traded' }, icon: 'gold' },
  { id: 'x:tradedeals', name: 'Trade deals', kind: 'variant', tab: 'civic', group: 'Trade', desc: 'Another tenth on every bargain.', knowledge: 12, needs: ['x:tollnav'], condition: { test: 'trade500', label: '500 goods traded' }, icon: 'gold' },
  { id: 'o:banners', name: 'Heraldic banners', kind: 'option', tab: 'civic', group: 'Looks', desc: "The lord's arms on the manor, towers and market: +prestige; cloth and dyes once.", knowledge: 2, condition: { made: { cloth: 4, dyes: 2 }, label: '4 cloth and 2 dyes made' }, option: 'banners', icon: 'prestige' },
];

export const UNLOCK_BY_ID = new Map(UNLOCKS.map((u) => [u.id, u]));

/** The unlock that opens a building, if it is not free from the start. */
const BY_BUILDING = new Map<BuildingType, Unlock>();
for (const u of UNLOCKS) if (u.building) BY_BUILDING.set(u.building, u);
const BY_RECIPE = new Map<string, Unlock>();
for (const u of UNLOCKS) if (u.recipe) BY_RECIPE.set(`${u.recipe.building}:${u.recipe.id}`, u);

export function unlockForBuilding(type: BuildingType): Unlock | undefined {
  return BY_BUILDING.get(type);
}

export function unlockForRecipe(building: BuildingType, id: string): Unlock | undefined {
  return BY_RECIPE.get(`${building}:${id}`);
}

/** Whether the town knows an unlock: learned, granted, or opened by rank. */
export function knows(s: GameState, id: string): boolean {
  const u = UNLOCK_BY_ID.get(id);
  if (!u) return true;
  if (s.learned?.includes(id)) return true;
  // The Heavy Plough charter brings the iron plough with it.
  if (id === 'i:ironplough' && s.charters?.includes('farm2')) return true;
  return u.rank !== undefined && u.knowledge === undefined && s.tier >= u.rank;
}

/** Lifetime count of a good made by the town. */
export function madeOf(s: GameState, id: ResourceId): number {
  return s.madeEver?.[id] ?? 0;
}

/** Lifetime goods traded through trading posts and docks. */
export function tradedOf(s: GameState): number {
  return s.tradedEver ?? 0;
}

function testMet(s: GameState, t: ConditionTest): boolean {
  const animals = () => s.buildings.reduce((n, o) => n + (o.type === 'byre' ? Object.values(o.animals ?? {}).reduce((a, v) => a + (v ?? 0), 0) : 0), 0);
  switch (t) {
    case 'herd15':
      return animals() >= 15;
    case 'herd30':
      return animals() >= 30;
    case 'greatwork':
      return s.buildings.some((o) => ['markethall', 'belltower', 'cathedral', 'university', 'guildhall'].includes(o.type));
    case 'storefull': {
      let n = 0;
      for (const k in s.res) if (GOODS[k as ResourceId]?.storage === 'materials') n += s.res[k as ResourceId];
      return n >= 300;
    }
    case 'trade200':
      return tradedOf(s) >= 200;
    case 'trade250':
      return tradedOf(s) >= 250;
    case 'trade500':
      return tradedOf(s) >= 500;
    case 'trade600':
      return tradedOf(s) >= 600;
    case 'trade1000':
      return tradedOf(s) >= 1000;
    default:
      return (s.feats ?? []).includes(t);
  }
}

export function conditionMet(s: GameState, c: Condition | undefined): boolean {
  if (!c) return true;
  if (c.test && !testMet(s, c.test)) return false;
  for (const k in c.made ?? {}) if (madeOf(s, k as ResourceId) < (c.made![k as ResourceId] ?? 0)) return false;
  if (c.built && !s.buildings.some((o) => c.built!.includes(o.type) && o.build >= 1)) return false;
  return true;
}

/** Progress towards a condition, 0 to 1 (for the patch's bar). */
export function conditionProgress(s: GameState, c: Condition | undefined): number {
  if (!c) return 1;
  let p = 1;
  for (const k in c.made ?? {}) p = Math.min(p, madeOf(s, k as ResourceId) / Math.max(1, c.made![k as ResourceId] ?? 1));
  if (c.built && !s.buildings.some((o) => c.built!.includes(o.type) && o.build >= 1)) p = Math.min(p, 0);
  if (c.test && !testMet(s, c.test)) p = Math.min(p, c.test.startsWith('trade') ? tradedOf(s) / Number(c.test.slice(5)) : 0);
  return Math.max(0, Math.min(1, p));
}

/** Why an unlock cannot be learned now, or null. */
export function learnError(s: GameState, id: string): string | null {
  const u = UNLOCK_BY_ID.get(id);
  if (!u) return 'Unknown';
  if (knows(s, id)) return 'Already known';
  if (u.rank !== undefined && u.knowledge === undefined) return `Opens at ${['Hamlet', 'Village', 'Town', 'Borough', 'City'][u.rank]}`;
  if (u.choice && UNLOCKS.some((o) => o.choice === u.choice && o.id !== id && knows(s, o.id))) return 'Another way was chosen';
  for (const n of u.needs ?? []) if (!knows(s, n)) return `Needs ${UNLOCK_BY_ID.get(n)?.name ?? n}`;
  if (!conditionMet(s, u.condition)) return `Needs ${u.condition!.label}`;
  if (u.knowledge === undefined) return 'Opens another way';
  if ((s.res.knowledge ?? 0) < u.knowledge) return `Needs ${u.knowledge} knowledge`;
  return null;
}

/** Spends knowledge to learn an unlock (and whatever it grants); returns why not, or null. */
export function learn(s: GameState, id: string): string | null {
  const err = learnError(s, id);
  if (err) return err;
  const u = UNLOCK_BY_ID.get(id)!;
  s.res.knowledge -= u.knowledge ?? 0;
  grant(s, id);
  s.dirty = true;
  return null;
}

/** Marks an unlock known, with whatever it brings along. */
export function grant(s: GameState, id: string): void {
  const list = (s.learned ??= []);
  if (list.includes(id)) return;
  list.push(id);
  for (const g of UNLOCK_BY_ID.get(id)?.grants ?? []) grant(s, g);
}

/** For saves made before learning existed: everything the town already has is known. */
export function grantWhatExists(s: GameState): void {
  for (const o of s.buildings) {
    const u = unlockForBuilding(o.type);
    if (u) grant(s, u.id);
    if (o.recipe) {
      const ru = unlockForRecipe(o.type, o.recipe);
      if (ru) grant(s, ru.id);
    }
    if (o.animals?.cattle) grant(s, 'a:cattle');
  }
}

/** Knows every unlock (for tests of other systems, and the sandbox). */
export function learnEverything(s: GameState): void {
  // Choices are the player's to make: none is taken here.
  for (const u of UNLOCKS) if (!u.choice) grant(s, u.id);
}
