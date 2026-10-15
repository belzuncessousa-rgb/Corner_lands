import { describe, expect, it } from 'vitest';
import { BUILDINGS, DAYS_PER_MONTH, DAYS_PER_YEAR } from '../src/game/data';
import { deserialize, serialize } from '../src/game/save';
import {
  buildRoad,
  demolish,
  doorTile,
  isBlocked,
  placeOrder,
  placementError,
  recompute,
  stepDay,
  totalHousing,
} from '../src/game/sim';
import type { BuildingType, GameState } from '../src/game/types';
import { generateWorld, idx } from '../src/game/world';

function hall(s: GameState) {
  return s.buildings.find((b) => b.type === 'townhall')!;
}

/** Finds a spot for a building next to the starting road and connects it. */
function placeNearRoad(s: GameState, type: BuildingType) {
  const d = BUILDINGS[type];
  const h = hall(s);
  const roadY = h.y + 3;
  for (let x = h.x - 20; x < h.x + 20; x++) {
    // Extend the main road outward as needed.
    for (const y of [roadY + 1, roadY - d.h]) {
      if (placementError(s, type, x, y)) continue;
      for (let rx = Math.min(x, h.x); rx <= Math.max(x + d.w, h.x + 3); rx++) buildRoad(s, rx, roadY);
      const b = placeOrder(s, type, x, y);
      if (b) return b;
    }
  }
  throw new Error(`could not place ${type}`);
}

function run(s: GameState, days: number) {
  for (let i = 0; i < days; i++) stepDay(s);
}

describe('world generation', () => {
  it('is deterministic per seed', () => {
    const a = generateWorld(42);
    const b = generateWorld(42);
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('places the manor hall on dry land with a road', () => {
    for (const seed of [1, 2, 3, 99, 1234]) {
      const s = generateWorld(seed);
      const h = hall(s);
      for (let y = h.y; y < h.y + 3; y++)
        for (let x = h.x; x < h.x + 3; x++) expect(s.terrain[idx(s, x, y)]).toBe(0);
      recompute(s);
      expect(s.road.some((r) => r === 1)).toBe(true);
    }
  });
});

describe('simulation', () => {
  it('builders carry materials over, then raise a house', () => {
    const s = generateWorld(7);
    recompute(s);
    const before = totalHousing(s);
    const house = placeNearRoad(s, 'house');
    const wood = s.res.wood;
    // Nothing is paid until builders carry the timber over.
    expect(s.res.wood).toBe(wood);
    run(s, 2);
    expect(s.res.wood).toBeLessThan(wood);
    run(s, 25);
    expect(house.build).toBe(1);
    expect(totalHousing(s)).toBe(before + 5);
  });

  it('woodcutter fells trees and produces timber', () => {
    const s = generateWorld(11);
    const wc = placeNearRoad(s, 'woodcutter');
    run(s, 21);
    expect(wc.build).toBe(1);
    const treesBefore = s.trees.reduce((a, b) => a + b, 0);
    const woodBefore = s.res.wood;
    run(s, 8); // stay inside one month: no firewood use or forest regrowth
    if (wc.status === 'No trees in range') return;
    expect(s.res.wood).toBeGreaterThan(woodBefore);
    expect(s.trees.reduce((a, b) => a + b, 0)).toBeLessThan(treesBefore);
  });

  it('villagers eat each month', () => {
    const s = generateWorld(5);
    const food = s.res.berries + s.res.meat;
    run(s, DAYS_PER_MONTH);
    expect(s.res.berries + s.res.meat).toBe(food - s.report.eaten);
    expect(s.report.eaten).toBeGreaterThan(0);
  });

  it('cancelling a site returns the materials already delivered', () => {
    const s = generateWorld(3);
    const b = placeNearRoad(s, 'house');
    const wood = s.res.wood;
    stepDay(s);
    expect(s.res.wood).toBeLessThan(wood);
    demolish(s, b);
    expect(s.res.wood).toBe(wood);
    expect(s.occ[idx(s, b.x, b.y)]).toBe(-1);
  });

  it('door tile is an adjacent road', () => {
    const s = generateWorld(8);
    const b = placeNearRoad(s, 'house');
    const d = doorTile(s, b);
    expect(s.road[idx(s, d.x, d.y)]).toBe(1);
  });

  it('a simple settlement survives two years', () => {
    const s = generateWorld(21);
    placeNearRoad(s, 'house');
    placeNearRoad(s, 'house');
    placeNearRoad(s, 'forager');
    placeNearRoad(s, 'hunter');
    placeNearRoad(s, 'woodcutter');
    run(s, DAYS_PER_YEAR * 2);
    expect(s.population).toBeGreaterThanOrEqual(2);
    expect(s.day).toBe(DAYS_PER_YEAR * 2);
  });

  it('round-trips through save/load', () => {
    const s = generateWorld(9);
    placeNearRoad(s, 'house');
    run(s, 30);
    const copy = deserialize(serialize(s));
    expect(copy.day).toBe(s.day);
    expect(Array.from(copy.trees)).toEqual(Array.from(s.trees));
    expect(Array.from(copy.occ)).toEqual(Array.from(s.occ));
    expect(copy.fertility[100]).toBeCloseTo(s.fertility[100]);
    run(copy, 10);
    run(s, 10);
    expect(serialize(copy)).toEqual(serialize(s));
  });
});

describe('production chains', () => {
  it('mine, bloomery and blacksmith turn ore into tools', () => {
    const s = generateWorld(77);
    s.tier = 2;
    for (const k of ['wood', 'stone', 'planks', 'gold', 'bread'] as const) s.res[k] = 100;
    s.population = 14;
    // Find an ore tile and build a road from the hall to it.
    const ore = s.ore.findIndex((v) => v > 0);
    const ox = ore % s.width;
    const oy = Math.floor(ore / s.width);
    const h = hall(s);
    // Clear a straight path of map features so roads can be laid.
    const path: [number, number][] = [];
    const startY = h.y + 3;
    for (let x = Math.min(h.x, ox); x <= Math.max(h.x, ox); x++) path.push([x, startY]);
    for (let y = Math.min(startY, oy + 3); y <= Math.max(startY, oy + 3); y++) path.push([ox, y]);
    for (const [x, y] of path) {
      const i = idx(s, x, y);
      s.terrain[i] = 0;
      s.rock[i] = 0;
      s.ore[i] = 0;
      if (s.occ[i] < 0) buildRoad(s, x, y);
    }
    recompute(s);
    let mine = null;
    for (const [dx, dy] of [[1, 1], [-2, 1], [1, 2], [-2, 2], [1, -2], [-2, -2]]) {
      const x = ox + dx;
      const y = oy + 3 + dy;
      for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 2; xx++) {
        const i = idx(s, xx, yy);
        s.terrain[i] = 0;
        s.rock[i] = 0;
        s.trees[i] = 0;
        if (!(xx === ox && Math.abs(yy - oy) < 1)) s.ore[i] = 0;
      }
      mine = placeOrder(s, 'mine', x, y);
      if (mine) break;
    }
    expect(mine).not.toBeNull();
    // Room to store everything.
    for (let k = 0; k < 2; k++) placeNearRoad(s, 'storehouse').build = 1;
    s.dirty = true;
    s.ore[ore] = 30;
    const smithy = placeNearRoad(s, 'smithy');
    const bloomery = placeNearRoad(s, 'bloomery');
    s.res.firewood = 80;
    run(s, 60);
    expect(mine!.build).toBe(1);
    expect(bloomery.build).toBe(1);
    expect(smithy.build).toBe(1);
    s.res.tools = 0;
    const tools = s.res.tools;
    run(s, 40);
    expect(s.res.tools).toBeGreaterThan(tools);
  });
});

describe('events', () => {
  it('keep the settlement consistent over many years', () => {
    const s = generateWorld(31);
    placeNearRoad(s, 'house');
    placeNearRoad(s, 'house');
    placeNearRoad(s, 'forager');
    placeNearRoad(s, 'woodcutter');
    run(s, DAYS_PER_YEAR * 6);
    const eventTexts = s.messages.map((m) => m.text);
    expect(eventTexts.length).toBeGreaterThan(0);
    for (const v of Object.values(s.res)) expect(v).toBeGreaterThanOrEqual(0);
    expect(s.population).toBeGreaterThanOrEqual(2);
  });
});

describe('bridges', () => {
  it('roads over water cost timber and connect both banks', () => {
    const s = generateWorld(777);
    s.res.wood = 100;
    const water = s.terrain.findIndex((t) => t === 1);
    const x = water % s.width;
    const y = Math.floor(water / s.width);
    expect(buildRoad(s, x, y)).toBe(true);
    expect(s.res.wood).toBe(96);
    expect(s.road[water]).toBe(1);
    s.res.wood = 2;
    const next = s.terrain.findIndex((t, i) => t === 1 && i !== water);
    expect(buildRoad(s, next % s.width, Math.floor(next / s.width))).toBe(false);
  });
});

describe('relaxed mode', () => {
  it('starts with more supplies and nobody leaves when starving', () => {
    const s = generateWorld(5, { relaxed: true });
    expect(s.res.wood).toBe(140);
    for (const f of ['berries', 'meat'] as const) s.res[f] = 0;
    run(s, DAYS_PER_MONTH * 3);
    expect(s.population).toBe(8);
  });
});

describe('job queue', () => {
  it('staffs an unstaffed spring farm before foragers when hands are short', () => {
    const s = generateWorld(9);
    s.tier = 1;
    s.res.wood = 200;
    const forager = placeNearRoad(s, 'forager');
    const farm = placeNearRoad(s, 'farm');
    farm.build = 1;
    forager.build = 1;
    // A farm that had nobody yesterday must still win workers today.
    farm.status = 'Fields untended';
    s.population = 3;
    s.dirty = true;
    stepDay(s);
    expect(farm.workers).toBe(3);
    expect(forager.workers).toBe(0);
  });

  it('a farm resting over winter is staffed again on the first day of spring', () => {
    const s = generateWorld(9);
    s.tier = 1;
    s.res.wood = 200;
    const forager = placeNearRoad(s, 'forager');
    const farm = placeNearRoad(s, 'farm');
    farm.build = 1;
    forager.build = 1;
    s.population = 3;
    // Jump to the last day of winter.
    s.day = DAYS_PER_YEAR - 1;
    s.dirty = true;
    stepDay(s);
    expect(isBlocked(farm)).toBe(false);
    stepDay(s);
    expect(farm.workers).toBe(3);
  });
});

describe('decision events', () => {
  it('a rare event pauses for a choice and applies it', async () => {
    const { resolveEvent, EVENTS } = await import('../src/game/events');
    const { StateRng } = await import('../src/game/rng');
    const s = generateWorld(12);
    s.res.gold = 500;
    let day = 0;
    while (!s.pendingEvent && day++ < DAYS_PER_YEAR * 3) stepDay(s);
    expect(s.pendingEvent).toBeDefined();
    const e = EVENTS.find((x) => x.id === s.pendingEvent)!;
    const ok = e.choices(s).findIndex((c) => !c.blocked?.(s));
    expect(resolveEvent(s, new StateRng(s), ok)).toBe(true);
    expect(s.pendingEvent).toBeUndefined();
    // The next one is at least half a year away.
    expect(s.nextEventDay! - s.day).toBeGreaterThanOrEqual(DAYS_PER_YEAR / 2);
  });
});

describe('exports', () => {
  it('merchants buy surplus above the kept amount at staffed markets', async () => {
    const { setExport } = await import('../src/game/sim');
    const s = generateWorld(8);
    s.tier = 2;
    const m = placeNearRoad(s, 'market');
    m.build = 1;
    m.need = undefined;
    s.res.wood = 110;
    setExport(s, 'wood', 50);
    s.dirty = true;
    const gold = s.res.gold;
    run(s, DAYS_PER_MONTH);
    expect(m.workers).toBeGreaterThan(0);
    expect(s.res.wood).toBeLessThanOrEqual(50);
    expect(s.res.gold).toBeGreaterThan(gold);
  });
});

describe('levels', () => {
  it('raising the manor promotes the settlement once requirements are met', async () => {
    const { startUpgrade, upgradeBlocker } = await import('../src/game/levels');
    const s = generateWorld(14);
    const h = hall(s);
    expect(upgradeBlocker(s, h)).toMatch(/villagers/);
    s.population = 20;
    for (let k = 0; k < 3; k++) placeNearRoad(s, 'house').build = 1;
    s.res.wood = 100;
    s.res.stone = 40;
    s.dirty = true;
    expect(startUpgrade(s, h)).toBe(true);
    run(s, 60);
    expect(h.level).toBe(2);
    expect(s.tier).toBe(1);
  });

  it('a cottage needs a well and a market before becoming a Timber House', async () => {
    const { upgradeBlocker, houseNeeds } = await import('../src/game/levels');
    const s = generateWorld(15);
    s.tier = 1;
    hall(s).level = 2;
    const house = placeNearRoad(s, 'house');
    house.build = 1;
    expect(upgradeBlocker(s, house)).toMatch(/well/);
    expect(houseNeeds(s, house, 2).filter((n) => !n.met).length).toBeGreaterThan(0);
  });

  it('expanded workplaces take more workers', async () => {
    const { workersOf } = await import('../src/game/levels');
    const s = generateWorld(16);
    const wc = placeNearRoad(s, 'woodcutter');
    wc.build = 1;
    expect(workersOf(wc)).toBe(2);
    wc.level = 2;
    expect(workersOf(wc)).toBe(3);
  });
});

describe('labour', () => {
  it('worker targets and priorities decide who is staffed', async () => {
    const { setWorkers, setPriority } = await import('../src/game/sim');
    const s = generateWorld(21);
    const a = placeNearRoad(s, 'woodcutter');
    const b = placeNearRoad(s, 'quarry');
    a.build = b.build = 1;
    a.need = b.need = undefined;
    s.population = 3;
    recompute(s);
    // Woodcutters come before quarries by default.
    expect(a.workers).toBe(2);
    expect(b.workers).toBe(1);
    setPriority(s, b, 2);
    expect(b.workers).toBe(2);
    expect(a.workers).toBe(1);
    setWorkers(s, b, 1);
    expect(b.workers).toBe(1);
    expect(a.workers).toBe(2);
    setWorkers(s, b, 0);
    expect(b.workers).toBe(0);
  });

  it('seasonal workplaces release their workers out of season', () => {
    const s = generateWorld(22);
    const f = placeNearRoad(s, 'forager');
    f.build = 1;
    f.need = undefined;
    s.day = DAYS_PER_MONTH * 11; // late winter
    recompute(s);
    expect(f.workers).toBe(0);
    s.day = DAYS_PER_MONTH * 6;
    recompute(s);
    expect(f.workers).toBeGreaterThan(0);
  });

  it('foragers on auto turn to mushrooms in autumn', async () => {
    const { chooseRecipe } = await import('../src/game/sim');
    const s = generateWorld(23);
    const f = placeNearRoad(s, 'forager');
    f.build = 1;
    s.day = DAYS_PER_MONTH * 8; // late autumn: no berries
    expect(chooseRecipe(s, f)?.id).toBe('mushrooms');
    f.recipe = 'herbs';
    expect(chooseRecipe(s, f)?.id).toBe('herbs');
  });
});

describe('paved roads', () => {
  it('cost stone, need a village and make walking cheaper', async () => {
    const { stepCost, roadError } = await import('../src/game/sim');
    const s = generateWorld(24);
    const h = hall(s);
    const x = h.x + 1;
    const y = h.y + 3;
    expect(s.road[idx(s, x, y)]).toBe(1);
    expect(roadError(s, x, y, true)).toMatch(/Village/);
    s.tier = 1;
    s.res.stone = 10;
    expect(buildRoad(s, x, y, true)).toBe(true);
    expect(s.res.stone).toBe(8);
    expect(s.road[idx(s, x, y)]).toBe(2);
    expect(stepCost(s, idx(s, x, y))).toBeLessThan(stepCost(s, idx(s, x + 1, y)));
  });
});

describe('fields, herds, orchards and backyards', () => {
  const ready = (s: GameState, type: BuildingType) => {
    const b = placeNearRoad(s, type);
    b.build = 1;
    b.need = undefined;
    s.dirty = true;
    return b;
  };
  /** Places a zone of the given size somewhere within reach of `near`. */
  const zoneNear = async (s: GameState, type: BuildingType, near: { x: number; y: number }, w: number, h: number) => {
    const { placeZone } = await import('../src/game/sim');
    for (let r = 1; r < 12; r++) {
      for (const [dx, dy] of [[r, 0], [0, r], [-r - w, 0], [0, -r - h], [r, r], [-r - w, -r - h]]) {
        const z = placeZone(s, type, near.x + dx, near.y + dy, near.x + dx + w - 1, near.y + dy + h - 1);
        if (z) return z;
      }
    }
    throw new Error(`no room for ${type}`);
  };

  it('farmsteads sow, tend and harvest the fields drawn nearby', async () => {
    const s = generateWorld(31);
    s.tier = 1;
    for (let k = 0; k < 2; k++) ready(s, 'granary');
    const farm = ready(s, 'farm');
    const wheat = await zoneNear(s, 'field', farm, 4, 4);
    const barley = await zoneNear(s, 'field', farm, 3, 4);
    barley.recipe = 'barley';
    s.population = 10;
    recompute(s);
    expect(wheat.owner).toBe(farm.id);
    expect(barley.owner).toBe(farm.id);
    run(s, DAYS_PER_MONTH * 8 + 1);
    expect(s.res.grain).toBeGreaterThan(100);
    expect(s.res.barley).toBeGreaterThan(60);
    expect(wheat.lastCrop).toBe('wheat');
  });

  it('a farmstead without fields reports the problem', () => {
    const s = generateWorld(32);
    s.tier = 1;
    const farm = ready(s, 'farm');
    s.population = 5;
    run(s, 2);
    expect(farm.status).toMatch(/Draw fields/);
  });

  it('herds grow in spring, are shorn and slaughtered in autumn', async () => {
    const s = generateWorld(33);
    s.tier = 1;
    ready(s, 'storehouse');
    ready(s, 'granary');
    const byre = ready(s, 'byre');
    await zoneNear(s, 'pasture', byre, 6, 6);
    s.population = 6;
    run(s, 1);
    expect(byre.herd).toBe(6);
    run(s, DAYS_PER_MONTH * 3);
    expect(byre.herd).toBeGreaterThan(6);
    expect(s.res.wool).toBeGreaterThan(0);
    // A big flock is thinned out in autumn.
    byre.herd = 18;
    run(s, DAYS_PER_MONTH * 6);
    expect(byre.herd).toBeLessThan(18);
    expect(s.res.wool).toBeGreaterThan(0);
    expect(s.res.meat + s.res.hides).toBeGreaterThan(0);
  });

  it('orchards bear fruit once grown and pickers bring it in', async () => {
    const s = generateWorld(34);
    s.tier = 1;
    s.res.gold = 500;
    ready(s, 'granary');
    const lodge = ready(s, 'orchardist');
    const o = await zoneNear(s, 'orchard', lodge, 4, 4);
    o.recipe = 'pears';
    o.age = 1000;
    s.population = 6;
    s.day = DAYS_PER_MONTH * 5 - 1;
    run(s, DAYS_PER_MONTH * 2);
    expect(s.res.pears).toBeGreaterThan(40);
  });

  it('backyards cost materials and feed the household', async () => {
    const { setYard } = await import('../src/game/sim');
    const s = generateWorld(35);
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    s.res.wood = 20;
    expect(setYard(s, h, 'hens')).toBeNull();
    expect(s.res.wood).toBe(12);
    expect(setYard(s, h, 'bees')).toMatch(/Village/);
    s.population = 13;
    recompute(s);
    run(s, DAYS_PER_MONTH * 2);
    expect(s.res.eggs).toBeGreaterThan(0);
  });
});

describe('workshops and household goods', () => {
  it('taverns pour ale or cider and run dry without', async () => {
    const { serveAle } = await import('../src/game/sim');
    const s = generateWorld(41);
    s.tier = 1;
    const t = placeNearRoad(s, 'tavern');
    t.build = 1;
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    s.population = 13;
    recompute(s);
    s.res.ale = 0;
    s.res.cider = 0;
    serveAle(s);
    expect(t.status).toMatch(/dry/);
    s.res.cider = 5;
    serveAle(s);
    expect(t.status).toMatch(/cider/);
    expect(s.res.cider).toBeLessThan(5);
  });

  it('timber houses use up clothes every few months', () => {
    const s = generateWorld(42);
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 2;
    // The manor hall fills first.
    s.population = 15;
    s.res.clothes = 3;
    recompute(s);
    run(s, DAYS_PER_MONTH * 7);
    // Three months a set: the first set, then two more.
    expect(s.res.clothes).toBe(0);
    expect(h.supply?.clothes).toBeGreaterThan(s.day);
  });

  it('a family craft makes half as much again as a workshop', async () => {
    const { setTrade } = await import('../src/game/sim');
    const s = generateWorld(43);
    s.tier = 1;
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    s.res.wood = 50;
    s.res.planks = 20;
    expect(setTrade(s, h, 'weaver')).toMatch(/Timber/);
    h.level = 2;
    expect(setTrade(s, h, 'weaver')).toBeNull();
    s.population = 15;
    s.res.wool = 30;
    recompute(s);
    expect(h.workers).toBe(2);
    run(s, 9);
    expect(s.res.cloth).toBeGreaterThan(0);
    expect(s.res.cloth % 3).toBe(0);
  });
});

describe('charters', () => {
  it('cost prestige, rise in price, follow their path and exclude rivals', async () => {
    const { grantCharter, charterError, charterCost } = await import('../src/game/charters');
    const s = generateWorld(51);
    s.res.prestige = 1000;
    expect(charterError(s, 'farm1')).toMatch(/Towns/);
    s.tier = 2;
    expect(charterError(s, 'farm2')).toMatch(/previous/);
    const first = charterCost(s);
    expect(grantCharter(s, 'farm1')).toBe(true);
    expect(charterCost(s)).toBeGreaterThan(first);
    expect(grantCharter(s, 'farm2')).toBe(true);
    expect(grantCharter(s, 'farm3a')).toBe(true);
    expect(charterError(s, 'farm3b')).toMatch(/alongside/);
    expect(s.res.prestige).toBeLessThan(1000);
  });

  it('a granted charter changes the economy', async () => {
    const { grantCharter } = await import('../src/game/charters');
    const { storageCap, prestigeIncome } = await import('../src/game/sim');
    const s = generateWorld(52);
    s.tier = 2;
    s.res.prestige = 1000;
    const g = placeNearRoad(s, 'granary');
    g.build = 1;
    const before = storageCap(s, 'food');
    for (const id of ['farm1', 'farm2', 'farm3a']) grantCharter(s, id);
    expect(storageCap(s, 'food')).toBe(before + 300);
    const p = prestigeIncome(s);
    grantCharter(s, 'learning1');
    expect(prestigeIncome(s)).toBe(p + 1);
  });
});

describe('charter goods', () => {
  it('charter buildings stay locked until granted', async () => {
    const { grantCharter } = await import('../src/game/charters');
    const { isUnlocked, chooseRecipe } = await import('../src/game/sim');
    const s = generateWorld(61);
    s.tier = 2;
    s.res.prestige = 2000;
    expect(isUnlocked(s, 'scriptorium')).toBe(false);
    grantCharter(s, 'learning1');
    expect(isUnlocked(s, 'scriptorium')).toBe(true);
    // Vines only once the orchard charter allows them.
    s.tier = 1;
    const lodge = placeNearRoad(s, 'orchardist');
    lodge.build = 1;
    const o = placeNearRoad(s, 'house');
    o.type = 'orchard';
    o.recipe = 'grapes';
    expect(chooseRecipe(s, o, true)?.id).not.toBe('grapes');
    s.tier = 2;
    grantCharter(s, 'orchard1');
    grantCharter(s, 'orchard2');
    expect(chooseRecipe(s, o, true)?.id).toBe('grapes');
  });

  it('townhouses enjoy luxuries and pay more for them', () => {
    const s = generateWorld(62);
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 3;
    s.population = 17;
    s.res.wine = 2;
    recompute(s);
    run(s, DAYS_PER_MONTH);
    expect(s.res.wine).toBe(1);
    expect(s.happinessFactors.some((f) => /luxur/.test(f.label))).toBe(true);
  });
});

describe('review regressions', () => {
  it('an animal farm raised by builders gets its herd once pastures exist', async () => {
    const { placeZone } = await import('../src/game/sim');
    const s = generateWorld(71);
    s.tier = 1;
    s.res.wood = 150;
    s.res.gold = 200;
    s.population = 12;
    const byre = placeNearRoad(s, 'byre');
    let z = null;
    for (let r = 1; r < 10 && !z; r++) z = placeZone(s, 'pasture', byre.x + 2 + r, byre.y, byre.x + 7 + r, byre.y + 5) ?? placeZone(s, 'pasture', byre.x, byre.y + 2 + r, byre.x + 5, byre.y + 7 + r);
    expect(z).not.toBeNull();
    run(s, 40);
    expect(byre.build).toBe(1);
    expect(byre.herd).toBeGreaterThan(0);
  });

  it('a home dairy makes half as much again as a dairy, not three times', async () => {
    const { setTrade } = await import('../src/game/sim');
    const s = generateWorld(72);
    s.tier = 1;
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 2;
    s.res.wood = 20;
    s.res.planks = 20;
    s.population = 15;
    expect(setTrade(s, h, 'dairy')).toBeNull();
    recompute(s);
    expect(h.workers).toBe(1);
  });
});

describe('batch work', () => {
  it('a kiln waits for a full batch, fires it, then frees its workers', () => {
    const s = generateWorld(81);
    s.tier = 1;
    const k = placeNearRoad(s, 'kiln');
    k.build = 1;
    k.need = undefined;
    s.population = 10;
    s.res.clay = 8;
    s.res.firewood = 20;
    s.dirty = true;
    run(s, 2);
    expect(k.workers).toBe(0);
    expect(k.status).toMatch(/full batch/);
    s.res.clay = 12;
    run(s, 30);
    expect(s.res.tiles).toBeGreaterThan(0);
    expect(k.batchOn).toBe(false);
    run(s, 1);
    expect(k.workers).toBe(0);
  });
});

describe('full stores', () => {
  it('a windmill grinds a full granary of grain into flour', async () => {
    const { storageCap, stored } = await import('../src/game/sim');
    const s = generateWorld(82);
    s.tier = 1;
    const m = placeNearRoad(s, 'windmill');
    m.build = 1;
    m.need = undefined;
    s.population = 5;
    s.res.grain += storageCap(s, 'food') - stored(s, 'food');
    expect(stored(s, 'food')).toBe(storageCap(s, 'food'));
    const grain = s.res.grain;
    s.dirty = true;
    run(s, 8);
    expect(s.res.flour).toBeGreaterThan(0);
    expect(s.res.grain).toBeLessThan(grain);
  });

  it('hungry villagers boil grain into pottage when nothing else is left', async () => {
    const { eatFood } = await import('../src/game/sim');
    const { FOOD_IDS } = await import('../src/game/data');
    const s = generateWorld(83);
    for (const f of FOOD_IDS) s.res[f] = 0;
    s.res.grain = 20;
    const fed = eatFood(s, 8);
    expect(fed.hungry).toBe(0);
    expect(s.res.grain).toBe(4);
  });
});

describe('steward', () => {
  it('names what fills a full storehouse', async () => {
    const { advise } = await import('../src/game/advisor');
    const { storageCap, stored } = await import('../src/game/sim');
    const s = generateWorld(84);
    s.res.planks += storageCap(s, 'materials') - stored(s, 'materials');
    // One tip a month: put the others on cooldown.
    s.advice = { housing: s.day, 'food-low': s.day, firewood: s.day };
    advise(s, 3);
    const msg = s.messages.find((m) => m.kind === 'advice');
    expect(msg?.text).toMatch(/storehouses are full, mostly \w+ \(\d+\) and planks/);
  });
});

describe('harvest feast', () => {
  it('can be called once each autumn and cheers the town', async () => {
    const { feastError, holdFeast } = await import('../src/game/events');
    const s = generateWorld(85);
    s.population = 16;
    s.res.bread = 40;
    s.res.ale = 2;
    s.day = 2 * DAYS_PER_MONTH;
    expect(feastError(s)).toMatch(/autumn/);
    s.day = 6 * DAYS_PER_MONTH + 2;
    const prestige = s.res.prestige;
    expect(holdFeast(s)).toBeNull();
    expect(s.res.ale).toBe(0);
    expect(s.res.prestige).toBe(prestige + 10);
    expect(s.moods?.some((m) => m.label === 'Memories of the feast' && m.value === 14)).toBe(true);
    expect(feastError(s)).toMatch(/this year/);
    s.day += DAYS_PER_YEAR;
    expect(feastError(s)).toBeNull();
  });
});

describe('mead', () => {
  it('the brewhouse brews mead only for Meadmakers, and taverns pour it', async () => {
    const { chooseRecipe, serveAle } = await import('../src/game/sim');
    const s = generateWorld(86);
    s.tier = 1;
    const t = placeNearRoad(s, 'tavern');
    t.build = 1;
    t.need = undefined;
    const bh = placeNearRoad(s, 'brewhouse');
    bh.build = 1;
    bh.need = undefined;
    bh.recipe = 'mead';
    s.res.honey = 30;
    expect(chooseRecipe(s, bh)).toBeNull();
    s.charters = ['orchard1', 'orchard2', 'orchard3b'];
    expect(chooseRecipe(s, bh)?.id).toBe('mead');
    s.population = 8;
    s.dirty = true;
    run(s, 12);
    expect(s.res.mead).toBeGreaterThan(0);
    t.workers = 1;
    // Pouring only looks at who lives within reach: stand it by the manor.
    t.x = hall(s).x + 3;
    t.y = hall(s).y;
    s.res.ale = 0;
    s.res.cider = 0;
    const mead = s.res.mead;
    serveAle(s);
    expect(s.res.mead).toBeLessThan(mead);
    expect(t.status).toMatch(/mead/);
  });
});

describe('retinue', () => {
  it('is raised in a Borough, is paid monthly and rides out against wolves', async () => {
    const { raiseRetinue, retinueError, RETINUE_PAY } = await import('../src/game/sim');
    const { EVENTS } = await import('../src/game/events');
    const s = generateWorld(87);
    s.res.prestige = 100;
    s.res.weapons = 10;
    expect(retinueError(s)).toMatch(/Borough/);
    s.tier = 3;
    expect(raiseRetinue(s)).toBeNull();
    expect(s.retinue).toBe(true);
    expect(s.res.weapons).toBe(0);
    const wolves = EVENTS.find((e) => e.id === 'wolves')!;
    expect(wolves.choices(s)[0].label).toBe('Send the retinue');
    s.res.gold = RETINUE_PAY;
    s.day = DAYS_PER_MONTH - 1;
    run(s, 1);
    expect(s.res.gold).toBeLessThan(RETINUE_PAY);
    expect(s.retinue).toBe(true);
    s.res.gold = 0;
    run(s, DAYS_PER_MONTH);
    expect(s.retinue).toBe(false);
  });
});

describe('harvest forecast', () => {
  it('the steward warns before a harvest that will not fit', async () => {
    const { advise } = await import('../src/game/advisor');
    const { harvestForecast, placeZone, storageCap, stored } = await import('../src/game/sim');
    const s = generateWorld(88);
    s.tier = 1;
    const farm = placeNearRoad(s, 'farm');
    farm.build = 1;
    farm.need = undefined;
    let field = null;
    for (let r = 3; r < 12 && !field; r++) field = placeZone(s, 'field', farm.x + r, farm.y, farm.x + r + 4, farm.y + 4) ?? placeZone(s, 'field', farm.x - r - 4, farm.y, farm.x - r, farm.y + 4);
    expect(field).not.toBeNull();
    field!.build = 1;
    field!.growth = 1;
    s.res.grain += storageCap(s, 'food') - stored(s, 'food');
    const f = harvestForecast(s).find((h) => h.kind === 'food')!;
    expect(f.expected).toBeGreaterThan(10);
    // Only the farm's barn is left to take it.
    expect(f.room).toBe(200);
    s.advice = { housing: s.day, 'food-low': s.day, firewood: s.day, granary: s.day };
    advise(s, 6);
    expect(s.messages.at(-1)?.text).toMatch(/harvest is near/);
  });
});

describe('farm barn', () => {
  it('keeps harvest the granaries cannot take and carries it over later', async () => {
    const { placeZone, storageCap, stored, barnTotal, FARM_BARN } = await import('../src/game/sim');
    const s = generateWorld(89);
    s.tier = 1;
    const farm = placeNearRoad(s, 'farm');
    farm.build = 1;
    farm.need = undefined;
    let field = null;
    for (let r = 3; r < 12 && !field; r++) field = placeZone(s, 'field', farm.x + r, farm.y, farm.x + r + 5, farm.y + 5) ?? placeZone(s, 'field', farm.x - r - 5, farm.y, farm.x - r, farm.y + 5);
    field!.build = 1;
    field!.growth = 1;
    s.population = 12;
    s.res.grain += storageCap(s, 'food') - stored(s, 'food');
    // Jump to the eve of the harvest.
    s.day = 7 * DAYS_PER_MONTH - 1;
    s.dirty = true;
    run(s, 2);
    expect(barnTotal(farm)).toBeGreaterThan(0);
    expect(barnTotal(farm)).toBeLessThanOrEqual(FARM_BARN);
    // Room frees up: the barn carries into the granary, leaving some room for fresh food.
    const held = barnTotal(farm);
    s.res.grain = 0;
    run(s, 4);
    expect(barnTotal(farm)).toBeLessThan(held);
    expect(stored(s, 'food')).toBeGreaterThan(storageCap(s, 'food') * 0.6);
    expect(stored(s, 'food')).toBeLessThanOrEqual(storageCap(s, 'food') * 0.86 + 1);
    expect(s.res.grain).toBeGreaterThan(0);
  });
});

describe('farm barn safety', () => {
  it('demolishing a farm or pausing it does not lose the barn', async () => {
    const { barnTotal, demolish, stored } = await import('../src/game/sim');
    const { RESOURCE_STORAGE } = await import('../src/game/data');
    const { RESOURCE_IDS } = await import('../src/game/types');
    const s = generateWorld(90);
    s.tier = 1;
    const a = placeNearRoad(s, 'farm');
    a.build = 1;
    a.need = undefined;
    for (const k of RESOURCE_IDS) if (RESOURCE_STORAGE[k] === 'food') s.res[k] = 0;
    // Paused, the barn still empties into the granary.
    a.barn = { grain: 50 };
    a.paused = true;
    s.dirty = true;
    run(s, 3);
    expect(barnTotal(a)).toBe(0);
    expect(s.res.grain).toBe(50);
    // Demolished, what is in the barn goes to the stores.
    a.barn = { grain: 30 };
    const before = stored(s, 'food');
    demolish(s, a);
    expect(stored(s, 'food')).toBe(before + 30);
  });
});

describe('steward on mills', () => {
  it('says when wheat waits too long for the windmills', async () => {
    const { advise } = await import('../src/game/advisor');
    const s = generateWorld(91);
    s.tier = 1;
    s.res.grain = 200;
    s.advice = { housing: s.day, 'food-low': s.day, firewood: s.day, granary: s.day, storage: s.day };
    advise(s, 3);
    expect(s.messages.at(-1)?.text).toMatch(/wheat sits unground/);
  });
});
