import { describe, expect, it } from 'vitest';
import { BUILDINGS, DAYS_PER_MONTH, DAYS_PER_YEAR } from '../src/game/data';
import { deserialize, serialize } from '../src/game/save';
import {
  buildRoad,
  demolish,
  doorTile,
  isBlocked,
  layRoads,
  planRoad,
  removeRoad,
  placeOrder,
  placementError,
  placeZone,
  recompute,
  stepDay,
  totalHousing,
} from '../src/game/sim';
import type { Building, BuildingType, GameState } from '../src/game/types';
import { generateWorld as freshWorld, idx } from '../src/game/world';
import { learnEverything } from '../src/game/unlocks';

/** A new world where everything is already learned, for testing other systems. */
function generateWorld(seed: number, opts?: Parameters<typeof freshWorld>[1]): GameState {
  const s = freshWorld(seed, opts);
  learnEverything(s);
  return s;
}

function hall(s: GameState) {
  return s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'))!;
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

/** Lays out a small marketplace near a building, so its households can fetch food. */
function marketBy(s: GameState, near: { x: number; y: number; w: number; h: number }) {
  for (let r = 1; r < 14; r++)
    for (const [dx, dy] of [[near.w + r - 1, 0], [0, near.h + r - 1], [-r - 3, 0], [0, -r - 3], [r, r], [-r - 3, -r - 3]]) {
      const x = near.x + dx;
      const y = near.y + dy;
      const m = placeZone(s, 'market', x, y, x + 2, y + 2);
      if (m) return m;
    }
  throw new Error('no room for a market');
}

/** A finished manor near the road (built for the test, whatever the town's size). */
function manorFor(s: GameState) {
  const tier = s.tier;
  s.tier = Math.max(1, tier);
  s.res.gold += 100;
  const m = placeNearRoad(s, 'townhall');
  s.tier = tier;
  m.build = 1;
  m.need = undefined;
  s.dirty = true;
  return m;
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
    s.res.wood = 30;
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
    s.lord = { skin: '#d2a47a', hair: '#c8963a', hairStyle: 'braid', hat: 'coronet', hatColor: '#2e5e9a', garment: 'dress', cloth: '#3d7a3a' };
    s.heraldry = { field: '#2e5e9a', second: '#f2ece0', division: 'quarterly', charge: 'star', chargeColor: '#e8c040' };
    const copy = deserialize(serialize(s));
    expect(copy.day).toBe(s.day);
    expect(copy.lord).toEqual(s.lord);
    expect(copy.heraldry).toEqual(s.heraldry);
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
    s.population = 24;
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
    // Room to store everything; the eight villagers housed work the chain itself.
    for (let k = 0; k < 2; k++) {
      const st = placeNearRoad(s, 'storehouse');
      st.build = 1;
      st.want = 0;
    }
    mine!.want = 2;
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

describe('yards and haulers', () => {
  it('a staffed storehouse fetches from workplace yards; without one, workers carry it themselves', async () => {
    const { yardTotal } = await import('../src/game/sim');
    const s = generateWorld(31);
    s.population = 8;
    const wc = placeNearRoad(s, 'woodcutter');
    wc.build = 1;
    wc.need = undefined;
    s.dirty = true;
    recompute(s);
    s.res.wood = 0;
    run(s, 12);
    // No storehouse yet: timber goes straight into the manor's store.
    expect(wc.hauled).toBe(false);
    expect(s.res.wood).toBeGreaterThan(0);
    const st = placeNearRoad(s, 'storehouse');
    st.build = 1;
    st.need = undefined;
    s.population = 12;
    s.dirty = true;
    recompute(s);
    expect(st.workers).toBe(2);
    const before = s.res.wood;
    run(s, 10);
    expect(wc.hauled).toBe(true);
    // Timber reaches the store by handcart, and the yard never overflows.
    expect(s.res.wood).toBeGreaterThan(before);
    expect(yardTotal(wc)).toBeLessThanOrEqual(30);
  });
});

describe('kinds of land', () => {
  it('valleys run wetter and richer, hills stonier and poorer; saves remember which', () => {
    const stats = (land: 'meadow' | 'valley' | 'hills') => {
      const s = generateWorld(4242, { land });
      return {
        s,
        rock: s.rock.filter((v) => v > 0).length,
        fert: s.fertility.reduce((a, v) => a + v, 0) / s.fertility.length,
      };
    };
    const meadow = stats('meadow');
    const valley = stats('valley');
    const hills = stats('hills');
    expect(hills.rock).toBeGreaterThan(meadow.rock);
    expect(hills.fert).toBeLessThan(meadow.fert);
    expect(valley.fert).toBeGreaterThan(meadow.fert);
    expect(valley.rock).toBeLessThan(meadow.rock);
    expect(deserialize(serialize(hills.s)).land).toBe('hills');
    expect(meadow.s.land).toBeUndefined();
  });
});

describe('planned roads', () => {
  it('are paid at once and laid over the following moments, in order', () => {
    const s = generateWorld(777);
    const h = hall(s);
    const y = h.y + h.h + 3;
    const xs: number[] = [];
    for (let x = h.x - 10; x < h.x + 10 && xs.length < 20; x++) if (planRoad(s, x, y)) xs.push(x);
    expect(xs.length).toBeGreaterThan(10);
    expect(s.road[idx(s, xs[0], y)]).toBe(0);
    expect(planRoad(s, xs[0], y)).toBe(false);
    // Half a day lays about half a day's worth.
    const laid = layRoads(s, 0.5);
    expect(laid).toBe(8);
    expect(s.road[idx(s, xs[0], y)]).toBe(1);
    expect(s.road[idx(s, xs[xs.length - 1], y)]).toBe(0);
    // Striking an unlaid tile takes it off the plan.
    expect(removeRoad(s, xs[xs.length - 1], y)).toBe(true);
    layRoads(s, 5);
    expect(s.roadPlan).toHaveLength(0);
    expect(s.road[idx(s, xs[xs.length - 1], y)]).toBe(0);
    expect(s.road[idx(s, xs[xs.length - 2], y)]).toBe(1);
  });
});

describe('relaxed mode', () => {
  it('starts with more supplies and nobody leaves when starving', () => {
    const s = generateWorld(5, { relaxed: true });
    expect(s.res.wood).toBe(30);
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
    marketBy(s, hall(s));
    s.population = 4;
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
  it('merchants buy surplus above the kept amount at staffed trading posts', async () => {
    const { addOrder } = await import('../src/game/sim');
    const s = generateWorld(8);
    s.tier = 2;
    const m = placeNearRoad(s, 'tradingpost');
    m.build = 1;
    m.need = undefined;
    s.res.wood = 110;
    addOrder(s, m, 'export', 'wood', 50);
    s.dirty = true;
    const gold = s.res.gold;
    run(s, DAYS_PER_MONTH);
    expect(m.workers).toBeGreaterThan(0);
    expect(s.res.wood).toBeLessThanOrEqual(50);
    expect(s.res.gold).toBeGreaterThan(gold);
  });
});

describe('levels', () => {
  it('the town grows a size once it has the people and the places for it', async () => {
    const { nextTierRequirements } = await import('../src/game/sim');
    const s = generateWorld(14);
    expect(s.buildings.some((b) => b.type === 'townhall')).toBe(false);
    expect(nextTierRequirements(s).join()).toMatch(/marketplace/);
    for (let k = 0; k < 3; k++) placeNearRoad(s, 'house').build = 1;
    marketBy(s, hall(s));
    const well = placeNearRoad(s, 'well');
    well.build = 1;
    well.need = undefined;
    s.population = 20;
    s.res.bread = 200;
    s.dirty = true;
    run(s, DAYS_PER_MONTH);
    expect(s.tier).toBe(1);
  });

  it('a manor is built by choice, once, and needs clear ground to grow', async () => {
    const { startUpgrade, upgradeBlocker } = await import('../src/game/levels');
    const s = generateWorld(14);
    s.tier = 2;
    const m = manorFor(s);
    expect(placementError(s, 'townhall', 1, 1)).toMatch(/has its manor/);
    s.res.wood = 100;
    s.res.planks = 50;
    s.res.stone = 40;
    s.res.gold = 200;
    expect(startUpgrade(s, m)).toBe(true);
    run(s, 40);
    expect(m.level).toBe(2);
    // The Stone Manor needs a Town and 4x4 of clear ground.
    s.tier = 3;
    for (let x = m.x; x < m.x + 4; x++) s.trees[idx(s, x, m.y + 3)] = 0;
    const blocker = upgradeBlocker(s, m);
    if (blocker) expect(blocker).toMatch(/ground|coins/);
  });

  it('a cottage needs a church, a well and a market before becoming a Timber House', async () => {
    const { upgradeBlocker, houseNeeds } = await import('../src/game/levels');
    const s = generateWorld(15);
    s.tier = 1;
    hall(s).level = 2;
    const house = placeNearRoad(s, 'house');
    house.build = 1;
    expect(upgradeBlocker(s, house)).toMatch(/church/);
    expect(houseNeeds(s, house, 2).filter((n) => !n.met).length).toBeGreaterThan(0);
  });

  it('the Stone Manor opens the garden, watch towers and walls, and the manor stops at the Palace', async () => {
    const { upgradePlan } = await import('../src/game/levels');
    const { isUnlocked, lockReason } = await import('../src/game/sim');
    const s = generateWorld(17);
    s.tier = 4;
    const m = placeNearRoad(s, 'townhall');
    m.build = 1;
    m.level = 2;
    expect(isUnlocked(s, 'manorgarden')).toBe(false);
    expect(lockReason(s, 'watchtower')).toMatch(/Stone Manor/);
    expect(upgradePlan(s, m)?.name).toBe('Stone Manor');
    m.level = 3;
    expect(upgradePlan(s, m)?.name).toBe('Palace');
    m.level = 4;
    expect(upgradePlan(s, m)).toBeNull();
    for (const t of ['manorgarden', 'watchtower', 'wall'] as const) expect(isUnlocked(s, t)).toBe(true);
  });

  it('a church is raised in timber and rebuilt in stone once a Town', async () => {
    const { buildingName, upgradePlan } = await import('../src/game/levels');
    const s = generateWorld(18);
    const c = placeNearRoad(s, 'church');
    c.build = 1;
    expect(buildingName(c)).toBe('Wooden Church');
    const plan = upgradePlan(s, c)!;
    expect(plan.name).toBe('Stone Church');
    expect(plan.reqs[0].met).toBe(false);
    s.tier = 2;
    expect(upgradePlan(s, c)!.reqs[0].met).toBe(true);
    // Churches in saves from before wooden churches were stone.
    const old = JSON.parse(serialize(s));
    old.version = 1;
    const back = deserialize(JSON.stringify(old));
    expect(back.buildings.find((b) => b.type === 'church')!.level).toBe(2);
  });

  it('cobbled streets need dressed stone, and are the quickest going', async () => {
    const { buildRoad, roadError, stepCost } = await import('../src/game/sim');
    const s = generateWorld(19);
    const h = hall(s);
    const x = h.x - 3;
    const y = h.y + 6;
    expect(roadError(s, x, y, 3)).toMatch(/dressed stone/i);
    s.res.dressedstone = 10;
    expect(buildRoad(s, x, y, 2)).toBe(true);
    expect(buildRoad(s, x, y, 3)).toBe(true);
    expect(s.res.dressedstone).toBe(8);
    const i = y * s.width + x;
    expect(s.road[i]).toBe(3);
    s.road[i + 1] = 2;
    expect(stepCost(s, i)).toBeLessThan(stepCost(s, i + 1));
  });

  it('workplaces are not expanded', async () => {
    const { upgradePlan, workersOf } = await import('../src/game/levels');
    const s = generateWorld(16);
    const wc = placeNearRoad(s, 'woodcutter');
    wc.build = 1;
    expect(workersOf(wc)).toBe(3);
    expect(upgradePlan(s, wc)).toBeNull();
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
    s.population = 4;
    recompute(s);
    // Woodcutters come before quarries by default.
    expect(a.workers).toBe(3);
    expect(b.workers).toBe(1);
    setPriority(s, b, 2);
    expect(b.workers).toBe(3);
    expect(a.workers).toBe(1);
    setWorkers(s, b, 1);
    expect(b.workers).toBe(1);
    expect(a.workers).toBe(3);
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

  it('cost stone (from the start) and make walking cheaper', async () => {
    const { stepCost, roadError } = await import('../src/game/sim');
    const s = generateWorld(24);
    const h = hall(s);
    const x = h.x + 1;
    const y = h.y + 3;
    expect(s.road[idx(s, x, y)]).toBe(1);
    s.res.stone = 1;
    expect(roadError(s, x, y, true)).toMatch(/stone/);
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
        // These tests were written for wheat fields.
        if (z && type === 'field') z.recipe ??= 'wheat';
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

  it('animals are bought at a trading post, share the pastures, are shorn in spring and slaughtered by choice', async () => {
    const { buyAnimal, slaughterAnimal } = await import('../src/game/sim');
    const s = generateWorld(33);
    s.tier = 1;
    s.res.gold = 1000;
    ready(s, 'storehouse');
    ready(s, 'granary');
    const byre = ready(s, 'byre');
    await zoneNear(s, 'pasture', byre, 6, 6);
    s.population = 8;
    run(s, 1);
    expect(byre.herd ?? 0).toBe(0);
    expect(buyAnimal(s, byre, 'sheep')).toMatch(/trading post/);
    ready(s, 'tradingpost');
    // 36 tiles: six sheep (12), three cows (12) and four pigs (12) fill it.
    for (let k = 0; k < 6; k++) expect(buyAnimal(s, byre, 'sheep')).toBeNull();
    for (let k = 0; k < 3; k++) expect(buyAnimal(s, byre, 'cattle')).toBeNull();
    for (let k = 0; k < 4; k++) expect(buyAnimal(s, byre, 'pigs')).toBeNull();
    expect(buyAnimal(s, byre, 'pigs')).toMatch(/room/);
    expect(byre.herd).toBe(13);
    run(s, DAYS_PER_MONTH * 3);
    // No breeding; wool in spring, milk from the cows.
    expect(byre.herd).toBe(13);
    expect(s.res.wool).toBeGreaterThan(0);
    // Milk is made (and may already have been drunk: food comes from the stores).
    expect((s.made?.milk ?? 0) + (s.making?.milk ?? 0)).toBeGreaterThan(0);
    const pork = s.res.pork;
    expect(slaughterAnimal(s, byre, 'pigs')).toBeNull();
    expect(s.res.pork).toBeGreaterThan(pork);
    expect(byre.herd).toBe(12);
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
    s.res.gold = 50;
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

  it('townhouses use up clothes (or boots) every few months', () => {
    const s = generateWorld(42);
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 3;
    marketBy(s, h);
    // The manor hall fills first.
    s.population = 15;
    s.res.clothes = 3;
    recompute(s);
    run(s, DAYS_PER_MONTH * 5);
    // Two months a set: the first set, then two more.
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
    s.res.planks = 40;
    s.res.tools = 5;
    s.res.gold = 100;
    expect(setTrade(s, h, 'weaver')).toMatch(/Timber/);
    h.level = 2;
    s.population = 15;
    // Builders add the workshop; then the craft is the family's for good.
    expect(setTrade(s, h, 'weaver')).toBeNull();
    expect(setTrade(s, h, 'tailor')).toMatch(/already/);
    run(s, 20);
    expect(h.trade).toBe('weaver');
    expect(setTrade(s, h, 'tailor')).toMatch(/for good/);
    s.res.cloth = 0;
    s.res.wool = 30;
    recompute(s);
    expect(h.workers).toBe(3);
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
  it('every building is open from the start but decorations and charter buildings; charters still shape recipes', async () => {
    const { grantCharter } = await import('../src/game/charters');
    const { isUnlocked, chooseRecipe } = await import('../src/game/sim');
    const s = generateWorld(61);
    s.res.prestige = 2000;
    expect(isUnlocked(s, 'cathedral')).toBe(true);
    // A guild's workshop only once its charter is granted.
    expect(isUnlocked(s, 'scriptorium')).toBe(false);
    expect(isUnlocked(s, 'jeweller')).toBe(false);
    expect(isUnlocked(s, 'winery')).toBe(false);
    s.tier = 2;
    grantCharter(s, 'learning1');
    expect(isUnlocked(s, 'scriptorium')).toBe(true);
    s.tier = 0;
    expect(isUnlocked(s, 'maypole')).toBe(false);
    s.tier = 1;
    expect(isUnlocked(s, 'maypole')).toBe(true);
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

  it("merchant's houses enjoy luxuries and pay more for them", () => {
    const s = generateWorld(62);
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 4;
    marketBy(s, h);
    s.population = 17;
    s.res.wine = 2;
    recompute(s);
    run(s, DAYS_PER_MONTH);
    expect(s.res.wine).toBe(1);
    expect(s.happinessFactors.some((f) => /luxur/.test(f.label))).toBe(true);
  });
});

describe('review regressions', () => {
  it('an animal farm raised by builders keeps the animals bought for it', async () => {
    const { placeZone, buyAnimal } = await import('../src/game/sim');
    const s = generateWorld(71);
    s.tier = 1;
    s.res.wood = 150;
    s.res.gold = 400;
    s.res.planks = 20;
    s.population = 12;
    const byre = placeNearRoad(s, 'byre');
    let z = null;
    for (let r = 1; r < 10 && !z; r++) z = placeZone(s, 'pasture', byre.x + 2 + r, byre.y, byre.x + 7 + r, byre.y + 5) ?? placeZone(s, 'pasture', byre.x, byre.y + 2 + r, byre.x + 5, byre.y + 7 + r);
    expect(z).not.toBeNull();
    const tp = placeNearRoad(s, 'tradingpost');
    tp.build = 1;
    tp.need = undefined;
    run(s, 40);
    expect(byre.build).toBe(1);
    expect(buyAnimal(s, byre, 'cattle')).toBeNull();
    run(s, 2);
    expect(byre.herd).toBe(1);
  });

  it('a home dairy makes half as much again as a dairy, not three times', async () => {
    const { setTrade } = await import('../src/game/sim');
    const s = generateWorld(72);
    s.tier = 1;
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 2;
    s.res.wood = 40;
    s.res.planks = 40;
    s.res.tools = 5;
    s.res.gold = 100;
    s.population = 15;
    expect(setTrade(s, h, 'dairy')).toBeNull();
    run(s, 20);
    expect(h.trade).toBe('dairy');
    recompute(s);
    expect(h.workers).toBe(2);
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
    s.res.firewood = 60;
    s.dirty = true;
    run(s, 2);
    expect(k.workers).toBe(0);
    expect(k.status).toMatch(/full batch/);
    s.res.clay = 12;
    run(s, 60);
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
    expect(msg?.text).toMatch(/storehouses are full, mostly planks \(\d+\)/);
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
    expect(feastError(s)).toMatch(/manor/);
    manorFor(s);
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
  it('the brewhouse brews mead once it is learned, and taverns pour it', async () => {
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
    s.res.firewood = 60;
    s.learned = s.learned!.filter((id) => id !== 'r:brewhouse:mead');
    expect(chooseRecipe(s, bh)).toBeNull();
    s.learned.push('r:brewhouse:mead');
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
    s.res.gold = 100;
    expect(retinueError(s)).toMatch(/Borough/);
    s.tier = 3;
    expect(retinueError(s)).toMatch(/barracks/);
    s.buildings.push({ ...s.buildings[0], id: 9998, type: 'barracks', build: 1 });
    expect(retinueError(s)).toMatch(/armoury/);
    s.buildings.push({ ...s.buildings[0], id: 9999, type: 'armoury', build: 1 });
    expect(raiseRetinue(s)).toBeNull();
    expect(s.retinue).toBe(true);
    expect(s.res.gold).toBe(75);
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
    if (field) field.recipe = 'wheat';
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
    if (field) field.recipe = 'wheat';
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
  it('points to the bread target when the bakers rest with bread in store', async () => {
    const { advise } = await import('../src/game/advisor');
    const s = generateWorld(93);
    s.tier = 1;
    s.res.grain = 900;
    s.res.bread = 400;
    const hall = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'))!;
    let mill = null;
    for (let r = 3; r < 30 && !mill; r++)
      for (let dy = -r; dy <= r && !mill; dy++)
        for (let dx = -r; dx <= r && !mill; dx++) if (!placementError(s, 'windmill', hall.x + dx, hall.y + dy)) mill = placeOrder(s, 'windmill', hall.x + dx, hall.y + dy);
    mill!.build = 1;
    for (let i = 0; i < 25; i++) advise(s, 3);
    expect(s.messages.some((m) => /bakers rest: the bread in store has reached its target/.test(m.text))).toBe(true);
    // The advice points at a windmill, so its toast can show the spot.
    expect(s.messages.find((m) => /bakers rest/.test(m.text))?.at).toEqual({ x: mill!.x + mill!.w / 2, y: mill!.y + mill!.h / 2 });
    expect(s.messages.some((m) => /food stores .* barely two months/.test(m.text))).toBe(false);
  });
});

describe('chronicle', () => {
  it('keeps the last forty messages and numbers every one', async () => {
    const { log, MAX_MESSAGES } = await import('../src/game/sim');
    const s = generateWorld(92);
    const before = s.messageCount ?? s.messages.length;
    for (let i = 0; i < 100; i++) log(s, `news ${i}`, 'good');
    expect(s.messages.length).toBe(MAX_MESSAGES);
    expect(s.messages.at(-1)?.n).toBe(before + 100);
    expect(s.messages.at(-1)?.text).toBe('news 99');
  });
});

describe('undo', () => {
  it('takes back a placement or a demolition in full', async () => {
    const { demolishWithUndo, undoPlacement } = await import('../src/game/undo');
    const { stored } = await import('../src/game/sim');
    const s = generateWorld(93);
    s.res.gold = 500;
    const gold = s.res.gold;
    const b = placeNearRoad(s, 'woodcutter');
    const place = undoPlacement(b);
    expect(place.revert(s)).toBeNull();
    expect(s.buildings.includes(b)).toBe(false);
    expect(s.res.gold).toBe(gold);
    // A finished building comes back exactly as it was, and the refund goes back.
    const w = placeNearRoad(s, 'woodcutter');
    w.build = 1;
    w.need = undefined;
    w.want = 1;
    const mats = stored(s, 'materials');
    const step = demolishWithUndo(s, w)!;
    expect(stored(s, 'materials')).toBeGreaterThan(mats - 1);
    expect(step.revert(s)).toBeNull();
    const back = s.buildings.find((x) => x.id === w.id)!;
    expect(back.type).toBe('woodcutter');
    expect(back.want).toBe(1);
    expect(stored(s, 'materials')).toBeCloseTo(mats);
  });
});

describe('fairs', () => {
  it('cost more each time, once a year, and bring prestige', async () => {
    const { fairCost, fairError, holdFair } = await import('../src/game/events');
    const s = generateWorld(94);
    s.res.gold = 5000;
    expect(fairError(s)).toMatch(/Towns/);
    s.tier = 2;
    const first = fairCost(s);
    const prestige = s.res.prestige;
    expect(holdFair(s)).toBeNull();
    expect(s.res.gold).toBe(5000 - first);
    expect(s.res.prestige).toBeGreaterThan(prestige);
    expect(fairError(s)).toMatch(/this year/);
    s.day += DAYS_PER_YEAR;
    expect(fairCost(s)).toBeGreaterThan(first);
  });
});

describe('cathedral', () => {
  it('serves as a church far and wide, one per town', async () => {
    const { coveredBy, placementError } = await import('../src/game/sim');
    const s = generateWorld(95);
    s.tier = 3;
    s.res.gold = 5000;
    const home = placeNearRoad(s, 'house');
    home.build = 1;
    const c = placeNearRoad(s, 'cathedral');
    c.build = 1;
    c.need = undefined;
    c.workers = 2;
    expect(coveredBy(s, home, 'church')).toBe(true);
    let tried = 0;
    for (let x = 0; x < s.width && tried < 50; x++) for (let y = 0; y < s.height && tried < 50; y++) {
      const e = placementError(s, 'cathedral', x, y);
      if (e === null) throw new Error('a second cathedral was allowed');
      if (e === 'Your town has its cathedral') tried++;
    }
    expect(tried).toBeGreaterThan(0);
  });
});

describe('production chains', () => {
  it('find the weakest link', async () => {
    const { chainReport } = await import('../src/game/sim');
    const s = generateWorld(96);
    // Wheat runs out: the mills used more than the farms made.
    s.res.grain = 2;
    s.made = { grain: 10, flour: 20, bread: 30 };
    s.used = { grain: 20, flour: 15 };
    expect(chainReport(s, ['grain', 'flour', 'bread']).weak).toBe(0);
    // Flour piles up while the ovens bake little: the bakery is the weak link.
    s.res.grain = 100;
    s.res.flour = 400;
    s.made = { grain: 50, flour: 40, bread: 6 };
    s.used = { grain: 40, flour: 3 };
    const r = chainReport(s, ['grain', 'flour', 'bread']);
    expect(r.weak).toBe(2);
    expect(r.why).toMatch(/Flour piles up/);
  });
});

describe('year in review', () => {
  it('sums up each year in the chronicle', () => {
    const s = generateWorld(97);
    run(s, DAYS_PER_YEAR + 1);
    const page = s.messages.find((m) => m.text.startsWith('The year 1 in review'));
    expect(page?.text).toMatch(/souls/);
    expect(page?.text).toMatch(/treasury/);
  });
});

describe('town walls', () => {
  it('bring prestige, cheer the town and keep wolves out once long enough', async () => {
    const { prestigeIncome, updateHappiness, WALL_SAFE, placeOrder } = await import('../src/game/sim');
    const { EVENTS } = await import('../src/game/events');
    const s = generateWorld(98);
    s.tier = 4;
    s.res.gold = 9999;
    const h = hall(s);
    // Town walls wait for a Stone Manor.
    expect(placeOrder(s, 'wall', h.x - 10, h.y)).toBeFalsy();
    const manor = placeNearRoad(s, 'townhall');
    manor.build = 1;
    manor.level = 3;
    const base = prestigeIncome(s);
    let n = 0;
    for (let y = h.y - 12; y < h.y + 14 && n < WALL_SAFE; y++) {
      for (const x of [h.x - 10, h.x + 13]) {
        if (n >= WALL_SAFE) break;
        const w = placeOrder(s, 'wall', x, y);
        if (w) {
          w.build = 1;
          w.need = undefined;
          n++;
        }
      }
    }
    expect(n).toBe(WALL_SAFE);
    expect(prestigeIncome(s)).toBeCloseTo(base + WALL_SAFE / 20);
    updateHappiness(s);
    expect(s.happinessFactors.some((f) => f.label.includes('walls'))).toBe(true);
    s.population = 30;
    expect(EVENTS.find((e) => e.id === 'wolves')!.choices(s)[0].label).toBe('Shut the gates');
  });
});

describe('review fixes', () => {
  it('the late objectives are listed, and nothing completes on a fresh map', async () => {
    const { QUESTS, checkQuests } = await import('../src/game/quests');
    const ids = QUESTS.map((q) => q.id);
    expect(ids).toContain('cathedral');
    expect(ids).toContain('walls');
    expect(checkQuests(generateWorld(99)).map((q) => q.id)).toEqual([]);
  });

  it('wall sites do not take the masons from their work', async () => {
    const { placeOrder } = await import('../src/game/sim');
    const s = generateWorld(100);
    s.tier = 4;
    s.res.gold = 9999;
    const mason = placeNearRoad(s, 'stonemason');
    mason.build = 1;
    mason.need = undefined;
    const h = hall(s);
    for (let x = h.x - 10; x < h.x + 12; x++) placeOrder(s, 'wall', x, h.y - 9);
    s.population = 6;
    recompute(s);
    expect(mason.workers).toBeGreaterThan(0);
  });
});

describe('seasonal festivals', () => {
  it('May Day needs a maypole in spring; Midsummer burns firewood in summer', async () => {
    const { festivalError, holdFestival } = await import('../src/game/events');
    const s = generateWorld(101);
    s.population = 16;
    s.res.bread = 50;
    s.res.wood = 150;
    s.day = 1 * DAYS_PER_MONTH;
    expect(festivalError(s, 'mayday')).toMatch(/manor/);
    manorFor(s);
    s.res.wood = 50;
    expect(festivalError(s, 'mayday')).toMatch(/maypole/);
    s.tier = 1;
    const pole = placeNearRoad(s, 'maypole');
    pole.build = 1;
    expect(holdFestival(s, 'mayday')).toBeNull();
    expect(festivalError(s, 'mayday')).toMatch(/this year/);
    expect(festivalError(s, 'midsummer')).toMatch(/midsummer/);
    s.day = 4 * DAYS_PER_MONTH;
    s.res.firewood = 40;
    expect(holdFestival(s, 'midsummer')).toBeNull();
    expect(s.res.firewood).toBe(30);
    expect(s.festivalDay?.id).toBe('midsummer');
  });
});

describe('milestones', () => {
  it('records firsts with their date once, and old saves get no burst of news', async () => {
    const { checkMilestones } = await import('../src/game/sim');
    const s = generateWorld(7);
    s.population = 120;
    const before = s.messages.length;
    checkMilestones(s);
    const ids = (s.milestones ?? []).map((m) => m.id);
    expect(ids).toContain('pop50');
    expect(ids).toContain('pop100');
    expect(ids).not.toContain('pop200');
    expect(s.messages.length).toBe(before + 2);
    checkMilestones(s);
    expect(s.milestones!.length).toBe(ids.length);
    // A game from before milestones: reached ones are noted without a date or a toast.
    const old = generateWorld(8);
    old.day = 400;
    old.population = 60;
    const n = old.messages.length;
    checkMilestones(old);
    expect(old.milestones!.find((m) => m.id === 'pop50')?.day).toBe(-1);
    expect(old.messages.length).toBe(n);
  });
});

describe('steward on idle hands and unused piles', () => {
  it('names the workshop that would use a pile nobody touches', async () => {
    const { advise } = await import('../src/game/advisor');
    const s = generateWorld(11);
    s.tier = 1;
    s.res.hides = 150;
    for (let i = 0; i < 20; i++) advise(s, 3);
    const said = s.messages.map((m) => m.text).join(' | ');
    expect(said).toMatch(/150 hides lie unused.*Tannery/);
  });
});

describe('great works', () => {
  it('one guildhall and one bell tower per town; the guildhall lifts prices and spirits', async () => {
    const { addOrder, exportGoods, prestigeIncome } = await import('../src/game/sim');
    const s = generateWorld(21);
    s.tier = 4;
    s.res.gold = 50000;
    const hall = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'))!;
    const put = (t: BuildingType) => {
      for (let r = 3; r < 25; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) if (!placementError(s, t, hall.x + dx, hall.y + dy)) return placeOrder(s, t, hall.x + dx, hall.y + dy)!;
      throw new Error(`no room for ${t}`);
    };
    const market = put('tradingpost');
    market.build = 1;
    market.workers = 1;
    const guild = put('guildhall');
    const tower = put('belltower');
    expect(placementError(s, 'guildhall', 1, 1)).toMatch(/has its guildhall/);
    expect(placementError(s, 'belltower', 1, 1)).toMatch(/has its bell tower/);
    addOrder(s, market, 'export', 'stone', 0);
    s.res.stone = 500;
    const plain = exportGoods(structuredClone(s));
    guild.build = 1;
    guild.workers = 2;
    tower.build = 1;
    const richer = exportGoods(structuredClone(s));
    expect(richer).toBeGreaterThan(plain * 1.15);
    expect(prestigeIncome(s)).toBeGreaterThanOrEqual(6);
  });
});

describe('protected woods', () => {
  it('woodcutters leave a protected wood standing and fell again once it is lifted', async () => {
    const { protectGrove, unprotectGrove, inGrove } = await import('../src/game/sim');
    const s = generateWorld(5);
    const hall = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'))!;
    let at: { x: number; y: number } | null = null;
    for (let r = 3; r < 30 && !at; r++)
      for (let dy = -r; dy <= r && !at; dy++)
        for (let dx = -r; dx <= r && !at; dx++) if (!placementError(s, 'woodcutter', hall.x + dx, hall.y + dy)) at = { x: hall.x + dx, y: hall.y + dy };
    const wc = placeOrder(s, 'woodcutter', at!.x, at!.y)!;
    wc.build = 1;
    // A wood all round the lodge, nine tiles each way.
    const R = 9;
    expect(protectGrove(s, wc.x - R, wc.y - R, wc.x + R, wc.y + R)).toBeNull();
    expect(protectGrove(s, 0, 0, 0, 0)).toMatch(/at least/);
    const before = Array.from(s.trees).reduce((a, t, i) => a + (inGrove(s, i) ? t : 0), 0);
    expect(before).toBeGreaterThan(0);
    for (let d = 0; d < 33; d++) stepDay(s);
    const after = Array.from(s.trees).reduce((a, t, i) => a + (inGrove(s, i) ? t : 0), 0);
    // Woodcutters go further afield; trees may grow back, but none are felled inside the wood.
    expect(after).toBeGreaterThanOrEqual(before);
    expect(unprotectGrove(s, wc.x, wc.y)).toBe(true);
    expect(s.groves!.length).toBe(1 - 1);
    // Saves carry the protected woods.
    protectGrove(s, 2, 2, 5, 5);
    expect(deserialize(serialize(s)).groves).toEqual([{ x: 2, y: 2, w: 4, h: 4 }]);
  });
});

describe('titles', () => {
  it('prestige buys Baron, Earl, Marquess and Duke in turn, each needing a larger town', async () => {
    const { takeTitle, titleError } = await import('../src/game/events');
    const s = generateWorld(4);
    s.res.prestige = 20000;
    expect(titleError(s)).toMatch(/Baron needs a Town/);
    s.tier = 2;
    expect(takeTitle(s)).toBeNull();
    expect(s.title).toBe(1);
    expect(s.res.prestige).toBe(19500);
    expect(titleError(s)).toMatch(/Earl needs a Borough/);
    s.tier = 4;
    expect(takeTitle(s)).toBeNull();
    expect(takeTitle(s)).toBeNull();
    expect(s.title).toBe(3);
    expect(titleError(s)).toMatch(/Palace/);
    const manor = manorFor(s);
    manor.level = 4;
    expect(takeTitle(s)).toBeNull();
    expect(s.title).toBe(4);
    expect(titleError(s)).toMatch(/no higher title/);
    expect(s.milestones!.map((m) => m.id)).toEqual(expect.arrayContaining(['title1', 'title2', 'title3']));
  });
});

describe('year in review', () => {
  it('names the goods that piled up and ran down over the year', async () => {
    const { playBot } = await import('../src/game/autoplay');
    const s = generateWorld(12);
    playBot(s, 3, 3);
    const review = s.messages.map((m) => m.text).filter((t) => t.includes('in review'));
    expect(review.length).toBeGreaterThan(0);
    expect(review.some((t) => /Stocked up: [a-z ]+ \(\+\d+\)/.test(t))).toBe(true);
  });
});

describe('pottage', () => {
  it('counts villagers fed on pottage and the steward speaks up', async () => {
    const { eatFood } = await import('../src/game/sim');
    const { advise } = await import('../src/game/advisor');
    const s = generateWorld(13);
    for (const k of Object.keys(s.res)) if (k !== 'gold') (s.res as Record<string, number>)[k] = 0;
    s.res.grain = 200;
    s.population = 40;
    const r = eatFood(s, 40);
    expect(r.hungry).toBe(0);
    expect(r.pottage).toBe(40);
    s.report.pottage = r.pottage;
    s.report.shortage = 0;
    for (let i = 0; i < 25; i++) advise(s, 3);
    expect(s.messages.some((m) => /40 villagers lived on pottage/.test(m.text))).toBe(true);
  });
});

describe('year goals', () => {
  it('a City gets a goal each year in the Easy game, judged when spring comes', async () => {
    const { yearGoal, YEAR_GOALS } = await import('../src/game/sim');
    const s = generateWorld(14);
    expect(yearGoal(s)).toBeNull();
    s.tier = 4;
    s.day = 2 * DAYS_PER_YEAR + 50;
    // The regular game sets no goals.
    expect(yearGoal(s)).toBeNull();
    s.relaxed = true;
    s.day = 2 * DAYS_PER_YEAR + 50;
    expect(yearGoal(s)?.id).toBe(YEAR_GOALS[2].id);
    stepDay(s);
    s.year!.built = 9;
    s.day = 3 * DAYS_PER_YEAR - 1;
    stepDay(s);
    expect(s.messages.some((m) => /goal is met: raise 8 buildings/.test(m.text))).toBe(true);
    expect(s.moods?.some((m) => m.label === 'A year well kept')).toBe(true);
  });
});

describe('works of art', () => {
  it('a supplied atelier grows its chance month by month and, at last, makes a masterpiece', async () => {
    const { monthlyAtelier, artBoons } = await import('../src/game/events');
    const { StateRng } = await import('../src/game/rng');
    const s = generateWorld(15);
    const { makeBuilding, placeBuilding } = await import('../src/game/world');
    const at = makeBuilding(s.nextId++, 'atelier', 2, 2);
    placeBuilding(s, at);
    at.build = 1;
    at.workers = 2;
    const stock = () => Object.assign(s.res, { gold: 1000, dyes: 50, dressedstone: 50, paper: 50, jewellery: 50 });
    stock();
    const rng = new StateRng(s);
    monthlyAtelier(s, rng);
    expect(s.atelier!.chance).toBeCloseTo(0.01);
    // A month without paper: the chance starts over.
    s.res.paper = 0;
    monthlyAtelier(s, rng);
    expect(s.atelier!.chance).toBe(0);
    let months = 0;
    while (!s.commissions?.length && months++ < 400) {
      stock();
      monthlyAtelier(s, rng);
    }
    expect(s.commissions?.length).toBe(1);
    expect(s.atelier!.rest).toBe(12);
    const b = artBoons(s);
    expect(b.happiness.length + b.prestige + b.knowledge).toBeGreaterThan(0);
  });
});

describe('names and the weekly seed', () => {
  it('gives each seed a stable place name and everyone the same seed all week', async () => {
    const { placeName, townName, weeklySeed, weekNumber } = await import('../src/game/names');
    expect(placeName(42)).toBe(placeName(42));
    expect(placeName(42)).toMatch(/^[A-Z][a-z]+$/);
    const names = new Set(Array.from({ length: 200 }, (_, i) => placeName(i)));
    expect(names.size).toBeGreaterThan(100);
    // Monday 00:00 UTC to Sunday 23:59 is one week.
    const monday = Date.UTC(2026, 9, 12);
    expect(weekNumber(monday)).toBe(weekNumber(monday + 6.99 * 86400000));
    expect(weekNumber(monday + 7 * 86400000)).toBe(weekNumber(monday) + 1);
    expect(weeklySeed(weekNumber(monday))).not.toBe(weeklySeed(weekNumber(monday) + 1));
    expect(townName({ seed: 42 })).toBe(placeName(42));
    expect(townName({ seed: 42, name: 'Our Town' })).toBe('Our Town');
  });
});

describe('town score', () => {
  it('rises with people, rank and deeds, and counts years without hunger', async () => {
    const { townScore } = await import('../src/game/sim');
    const s = generateWorld(16);
    marketBy(s, hall(s));
    const start = townScore(s);
    s.population += 10;
    expect(townScore(s)).toBe(start + 100);
    s.tier = 2;
    s.title = 1;
    expect(townScore(s)).toBe(start + 100 + 1000 + 400);
    // A year with no hunger counts once it ends (the ten extra had no homes to shop from).
    s.population -= 10;
    stepDay(s);
    s.day = DAYS_PER_YEAR - 1;
    s.year!.hungry = 0;
    s.res.bread = 1000;
    stepDay(s);
    expect(s.fedYears).toBe(1);
  });
});

describe('new events', () => {
  it('each choice of the six new events applies cleanly where it is offered', async () => {
    const { EVENTS } = await import('../src/game/events');
    for (const id of ['pilgrims', 'comet', 'flood', 'beekeeper', 'border', 'relic']) {
      const e = EVENTS.find((x) => x.id === id)!;
      expect(e, id).toBeTruthy();
      for (let i = 0; i < e.choices(generateWorld(1)).length; i++) {
        const s = generateWorld(30 + i);
        s.tier = 4;
        s.res.gold = 5000;
        s.res.prestige = 500;
        s.res.wood = 100;
        s.res.grain = 100;
        s.res.bread = 200;
        s.retinue = true;
        s.population = 40;
        const hall = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'))!;
        for (const t of ['church', 'granary', 'cathedral'] as BuildingType[]) {
          let done = false;
          for (let r = 3; r < 30 && !done; r++)
            for (let dy = -r; dy <= r && !done; dy++)
              for (let dx = -r; dx <= r && !done; dx++)
                if (!placementError(s, t, hall.x + dx, hall.y + dy)) {
                  placeOrder(s, t, hall.x + dx, hall.y + dy)!.build = 1;
                  done = true;
                }
        }
        expect(e.weight(s, 1), id).toBeGreaterThan(0);
        const c = e.choices(s)[i];
        expect(c.blocked?.(s) ?? null, `${id} ${c.label}`).toBeNull();
        const out = c.apply(s, { next: () => 0.5 } as never);
        expect(out.text.length, `${id} ${c.label}`).toBeGreaterThan(5);
        for (const k of Object.keys(s.res)) expect(s.res[k as keyof typeof s.res], `${id} ${k}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('paths', () => {
  /** An empty meadow, with roads laid as given. */
  const meadow = () => {
    const s = generateWorld(5);
    for (const a of [s.terrain, s.trees, s.road, s.rock, s.ore]) a.fill(0);
    s.occ.fill(-1);
    s.buildings = [];
    return s;
  };
  const lay = (s: ReturnType<typeof meadow>, y: number, x0: number, x1: number, grade: number) => {
    for (let x = x0; x <= x1; x++) s.road[y * s.width + x] = grade;
  };
  const time = async (s: ReturnType<typeof meadow>, path: number[], from: number) => {
    const { tileCost } = await import('../src/game/path');
    let t = 0;
    let prev = from;
    for (const i of path) {
      const diag = i % s.width !== prev % s.width && Math.floor(i / s.width) !== Math.floor(prev / s.width);
      t += (diag ? Math.SQRT2 : 1) * (tileCost(s, i) + tileCost(s, prev)) * 0.5;
      prev = i;
    }
    return t;
  };

  it('take a road detour only when it is quicker than the straight walk', async () => {
    const { findPath } = await import('../src/game/path');
    // A road three tiles off the straight line is worth the detour...
    let s = meadow();
    lay(s, 23, 8, 52, 1);
    let p = findPath(s, 10, 20, 50, 20)!;
    expect(p.filter((i) => s.road[i]).length).toBeGreaterThan(25);
    // ...one fifteen tiles off is not.
    s = meadow();
    lay(s, 35, 8, 52, 1);
    p = findPath(s, 10, 20, 50, 20)!;
    expect(p.filter((i) => s.road[i]).length).toBe(0);
  });

  it('prefer a cobbled street to a nearer dirt road, and find the quickest way', async () => {
    const { findPath } = await import('../src/game/path');
    const s = meadow();
    lay(s, 21, 8, 52, 1);
    lay(s, 24, 8, 52, 3);
    const from = 20 * s.width + 10;
    const p = findPath(s, 10, 20, 50, 20)!;
    expect(p.filter((i) => s.road[i] === 3).length).toBeGreaterThan(25);
    // No other route is quicker: compare with the dirt road.
    const viaDirt = [...Array(1).keys()].flatMap(() => {
      const out: number[] = [];
      out.push(21 * s.width + 11);
      for (let x = 12; x <= 49; x++) out.push(21 * s.width + x);
      out.push(20 * s.width + 50);
      return out;
    });
    expect(await time(s, p, from)).toBeLessThan(await time(s, viaDirt, from));
  });

  it('walk round a wood when that is quicker', async () => {
    const { findPath } = await import('../src/game/path');
    const s = meadow();
    // A long, narrow wood across the way: slower to cross than to skirt.
    for (let y = 18; y <= 22; y++) for (let x = 20; x <= 40; x++) s.trees[y * s.width + x] = 1;
    let p = findPath(s, 10, 20, 50, 20)!;
    expect(p.filter((i) => s.trees[i]).length).toBe(0);
    // A tall one is quicker to push through than to walk all the way round.
    for (let y = 5; y <= 35; y++) for (let x = 28; x <= 31; x++) s.trees[y * s.width + x] = 1;
    p = findPath(s, 10, 20, 50, 20)!;
    expect(p.filter((i) => s.trees[i]).length).toBeGreaterThan(0);
  });
});

describe('trade audit', () => {
  const tradeTown = () => {
    const s = generateWorld(31);
    s.tier = 4;
    s.res.gold = 100000;
    const post = placeNearRoad(s, 'tradingpost');
    post.build = 1;
    post.need = undefined;
    recompute(s);
    return s;
  };
  /** Staff every finished trading post, dock and guildhall (after any recompute). */
  const staff = (s: GameState) => {
    for (const b of s.buildings) if (['tradingpost', 'dock', 'guildhall'].includes(b.type) && b.build >= 1) b.workers = 2;
  };

  it('buying always costs at least three times the best selling price, bonuses and all', async () => {
    const { buyPrice, exportUnitPrice, sellPrice } = await import('../src/game/sim');
    const s = tradeTown();
    s.charters = ['trade1', 'trade2', 'trade3a'];
    // Toll navigation and trade deals are the merchants' concession on top of this rule.
    s.learned = (s.learned ?? []).filter((id) => id !== 'x:tollnav' && id !== 'x:tradedeals');
    const guild = placeNearRoad(s, 'guildhall');
    guild.build = 1;
    guild.need = undefined;
    recompute(s);
    staff(s);
    for (const id of ['jewellery', 'tools', 'wood', 'bread'] as const) {
      expect(buyPrice(s, id, 100)).toBeGreaterThanOrEqual(3 * exportUnitPrice(s, id) * 100 - 1);
      expect(buyPrice(s, id, 100)).toBeGreaterThanOrEqual(3 * sellPrice(s, id, 100));
    }
  });

  it('merchants never buy what building sites are still owed', async () => {
    const { addOrder, exportGoods } = await import('../src/game/sim');
    const s = tradeTown();
    const site = placeNearRoad(s, 'church');
    site.need = { planks: 50 };
    s.res.planks = 60;
    addOrder(s, s.buildings.find((b) => b.type === 'tradingpost')!, 'export', 'planks', 0);
    staff(s);
    exportGoods(s);
    expect(s.res.planks).toBe(50);
  });

  it('crates carry ten more goods each, and only the extra goods use them up', async () => {
    const { addOrder, exportBudget, exportGoods } = await import('../src/game/sim');
    const s = tradeTown();
    s.targets = { ...(s.targets ?? {}), stone: 0, crates: 0 };
    s.res.stone = 500;
    s.res.crates = 1;
    staff(s);
    expect(exportBudget(s).crated).toBe(10);
    addOrder(s, s.buildings.find((b) => b.type === 'tradingpost')!, 'export', 'stone', 0);
    const before = s.res.stone;
    exportGoods(s);
    expect(before - s.res.stone).toBe(exportBudget({ ...s, res: { ...s.res, crates: 0 } } as typeof s).base + 10);
    expect(s.res.crates).toBe(0);
  });
});

describe('trade orders', () => {
  const town = () => {
    const s = generateWorld(31);
    s.tier = 4;
    s.res.gold = 100000;
    const post = placeNearRoad(s, 'tradingpost');
    post.build = 1;
    post.need = undefined;
    recompute(s);
    post.workers = 2;
    return { s, post };
  };

  it('imports buy up to the target and exports sell down to it, first order first', async () => {
    const { addOrder, runTradeOrders, tradeCapacity } = await import('../src/game/sim');
    const { s, post } = town();
    const cap = tradeCapacity(s, post);
    s.res.fish = 10;
    s.res.stone = 500;
    addOrder(s, post, 'import', 'fish', 40);
    addOrder(s, post, 'export', 'stone', 0);
    const gold = s.res.gold;
    const r = runTradeOrders(s);
    expect(s.res.fish).toBe(40);
    // The carts had room left for the rest after the fish.
    expect(500 - s.res.stone).toBe(cap - 30);
    expect(r.spent).toBeGreaterThan(0);
    expect(r.earned).toBeGreaterThan(0);
    expect(s.res.gold).toBe(gold - r.spent + r.earned);
  });

  it('a later order for the same good raises the target if the carts have room', async () => {
    const { addOrder, runTradeOrders, tradeCapacity } = await import('../src/game/sim');
    const { s, post } = town();
    s.res.fish = 0;
    s.res.stone = 0;
    const cap = tradeCapacity(s, post);
    addOrder(s, post, 'import', 'fish', 20);
    addOrder(s, post, 'import', 'stone', cap - 30);
    addOrder(s, post, 'import', 'fish', 40);
    runTradeOrders(s);
    // 20 fish, then the stone, then the 10 carts still had room for.
    expect(s.res.stone).toBe(cap - 30);
    expect(s.res.fish).toBe(30);
    expect(post.orders![2].note).toBe('The carts were full');
  });

  it('orders can be moved, retargeted and struck off; an unstaffed post trades nothing', async () => {
    const { addOrder, moveOrder, removeOrder, runTradeOrders, setOrderTarget } = await import('../src/game/sim');
    const { s, post } = town();
    const a = addOrder(s, post, 'import', 'fish', 10)!;
    const b = addOrder(s, post, 'export', 'stone', 5)!;
    moveOrder(post, b.id, 0);
    expect(post.orders!.map((o) => o.id)).toEqual([b.id, a.id]);
    setOrderTarget(post, a.id, -5);
    expect(a.target).toBe(0);
    removeOrder(post, b.id);
    expect(post.orders!.length).toBe(1);
    post.workers = 0;
    s.res.fish = 0;
    setOrderTarget(post, a.id, 50);
    runTradeOrders(s);
    expect(s.res.fish).toBe(0);
  });

  it('a stopped good counts as enough, so its makers rest', async () => {
    const { enoughOf, setStopped } = await import('../src/game/sim');
    const s = generateWorld(3);
    s.res.planks = 0;
    expect(enoughOf(s, { planks: 2 })).toBeNull();
    setStopped(s, 'planks', true);
    expect(enoughOf(s, { planks: 2 })).toBe('planks');
  });
});

describe('gathering audit', () => {
  /** An empty meadow with a staffed woodcutter's lodge at (30, 30). */
  const lodge = () => {
    const s = generateWorld(5);
    for (const a of [s.terrain, s.trees, s.road, s.rock, s.ore, s.berriesMax, s.berries]) a.fill(0);
    s.occ.fill(-1);
    s.buildings = [];
    s.dirty = true;
    const b = placeOrder(s, 'woodcutter', 30, 30)!;
    b.build = 1;
    b.need = undefined;
    recompute(s);
    // Haulers fetch from its yard (the meadow has no stores of its own).
    b.hauled = true;
    b.stock = {};
    return { s, b };
  };
  const work = async (s: GameState, b: Building) => {
    const { produceOnce } = await import('../src/game/sim');
    return produceOnce(s, b);
  };

  it('woodcutters fell the trees quickest to walk to, roads and all', async () => {
    const { s, b } = lodge();
    const near = idx(s, 38, 30); // eight tiles over open ground
    const far = idx(s, 30, 44); // fourteen tiles, but along a road
    s.trees[near] = 2;
    s.trees[far] = 2;
    for (let y = 32; y <= 44; y++) s.road[idx(s, 30, y)] = 3;
    s.dirty = true;
    recompute(s);
    expect(await work(s, b)).toBeNull();
    expect(s.trees[far]).toBe(1);
    expect(s.trees[near]).toBe(2);
  });

  it('do not fell trees across water they cannot cross', async () => {
    const { s, b } = lodge();
    for (let y = 0; y < s.height; y++) s.terrain[idx(s, 34, y)] = 1;
    s.trees[idx(s, 36, 30)] = 2;
    s.dirty = true;
    recompute(s);
    expect(await work(s, b)).toMatch(/No trees/);
    expect(s.trees[idx(s, 36, 30)]).toBe(2);
  });

  it('use nothing up when the yard is full', async () => {
    const { s, b } = lodge();
    s.trees[idx(s, 33, 30)] = 2;
    b.hauled = true;
    b.stock = { wood: 30 };
    expect(await work(s, b)).toBe('Storage full');
    expect(s.trees[idx(s, 33, 30)]).toBe(2);
  });
});

describe('construction audit', () => {
  it('the last store of a kind cannot be pulled down', async () => {
    const { demolish, demolishBlocker } = await import('../src/game/sim');
    const s = generateWorld(41);
    const camp = s.buildings.find((b) => b.type === 'camp')!;
    expect(demolishBlocker(s, camp)).toMatch(/last store/);
    expect(demolish(s, camp)).toBe(false);
    expect(s.buildings).toContain(camp);
  });

  it('a lodge raised from trees felled on the spot is credited what was felled, and gives none of it back', async () => {
    const { demolish } = await import('../src/game/sim');
    const s = generateWorld(42);
    s.res.wood = 0;
    const lodge = placeNearRoad(s, 'woodcutter');
    // Just one tree level about the site.
    for (let y = lodge.y - 4; y < lodge.y + lodge.h + 4; y++) for (let x = lodge.x - 4; x < lodge.x + lodge.w + 4; x++) s.trees[idx(s, x, y)] = 0;
    s.trees[idx(s, lodge.x - 1, lodge.y)] = 1;
    lodge.builders = 4;
    run(s, 1);
    const need = BUILDINGS.woodcutter.cost.wood! - (lodge.need?.wood ?? 0);
    expect(need).toBeLessThanOrEqual(2);
    demolish(s, lodge);
    expect(s.res.wood).toBe(0);
  });
});

describe('people audit', () => {
  it('two taverns over the same homes pour once for them', async () => {
    const { serveAle } = await import('../src/game/sim');
    const s = generateWorld(51);
    const home = placeNearRoad(s, 'house');
    home.build = 1;
    const t1 = placeNearRoad(s, 'tavern');
    const t2 = placeNearRoad(s, 'tavern');
    for (const t of [t1, t2]) {
      t.build = 1;
      t.workers = 1;
    }
    s.res.ale = 10;
    // The home between the two, within reach of both.
    home.x = Math.round((t1.x + t2.x) / 2);
    home.y = Math.round((t1.y + t2.y) / 2);
    for (const b of s.buildings) b.residents = b === home ? 5 : 0;
    serveAle(s);
    expect(s.res.ale).toBe(9);
  });

  it('villagers taste every kind of food in store, so variety counts', async () => {
    const { eatFood } = await import('../src/game/sim');
    const s = generateWorld(52);
    for (const id of ['bread', 'meat', 'berries', 'cheese'] as const) s.res[id] = 20;
    expect(eatFood(s, 5).groups).toBe(4);
  });
});

describe('save audit', () => {
  it('loading a save keeps the manor as it was', async () => {
    const { playBot } = await import('../src/game/autoplay');
    const s = generateWorld(61);
    playBot(s, 4, 61);
    const hall = s.buildings.find((b) => b.type === 'townhall');
    if (hall) hall.level = 1;
    const back = deserialize(serialize(s));
    expect(back.buildings.find((b) => b.type === 'townhall')?.level).toBe(hall?.level);
  });
});

describe('farming audit', () => {
  it('a farm paused on harvest day brings the crop in when it resumes', async () => {
    const { playBot } = await import('../src/game/autoplay');
    const s = generateWorld(7);
    playBot(s, 4, 7);
    while (s.day % DAYS_PER_YEAR !== 69) stepDay(s);
    const farm = s.buildings.find((b) => b.type === 'farm' && b.build >= 1)!;
    const fields = s.buildings.filter((f) => f.type === 'field' && f.owner === farm.id && f.growth > 0);
    expect(fields.length).toBeGreaterThan(0);
    farm.paused = true;
    stepDay(s);
    stepDay(s);
    farm.paused = false;
    // Within the Harvest month, once farmers are back at work.
    while (s.day % DAYS_PER_YEAR < 76) stepDay(s);
    expect(fields.reduce((n, f) => n + f.lastOutput, 0)).toBeGreaterThan(0);
  });
});

describe('events audit', () => {
  it('no event comes up again within the next three', async () => {
    const { rollEvent, autoResolve } = await import('../src/game/events');
    const { StateRng } = await import('../src/game/rng');
    const s = generateWorld(71);
    s.population = 60;
    s.tier = 2;
    const rng = new StateRng(s);
    const seen: string[] = [];
    for (let k = 0; k < 50; k++) {
      s.nextEventDay = s.day;
      const id = rollEvent(s, rng, k % 12);
      if (id) {
        seen.push(id);
        autoResolve(s, rng);
      }
      s.day += 90;
    }
    expect(seen.length).toBeGreaterThan(20);
    for (let i = 1; i < seen.length; i++) expect(seen.slice(Math.max(0, i - 3), i)).not.toContain(seen[i]);
  });

  it('an old save without remembered events reads the last ones from the chronicle', async () => {
    const { rollEvent, autoResolve } = await import('../src/game/events');
    const { StateRng } = await import('../src/game/rng');
    const s = generateWorld(72);
    s.population = 60;
    s.tier = 2;
    const rng = new StateRng(s);
    s.nextEventDay = s.day;
    const first = rollEvent(s, rng, 4);
    expect(first).toBeTruthy();
    autoResolve(s, rng);
    for (let k = 0; k < 20; k++) {
      s.recentEvents = undefined;
      s.pendingEvent = undefined;
      s.day += 30;
      s.nextEventDay = s.day;
      expect(rollEvent(s, rng, 4)).not.toBe(first);
      s.recentEvents = undefined;
      s.pendingEvent = undefined;
    }
  });
});

describe('workshop inputs', () => {
  it('a sawpit that ran dry is back to work the day timber is in store again', async () => {
    const { dailyProduction } = await import('../src/game/sim');
    const { StateRng } = await import('../src/game/rng');
    const s = generateWorld(81);
    const pit = placeNearRoad(s, 'sawmill');
    pit.build = 1;
    pit.need = undefined;
    recompute(s);
    // Out of timber for a while: it is flagged short and its workers go.
    pit.blocked = 1;
    pit.status = 'Waiting for timber';
    pit.workers = 0;
    s.res.wood = 200;
    dailyProduction(s, new StateRng(s));
    expect(pit.blocked).toBe(0);
    expect(pit.status).toBe('Back to work');
  });
});

describe('draught animals', () => {
  const town = () => {
    const s = generateWorld(33);
    s.tier = 3;
    s.res.gold = 5000;
    s.res.grain = 50;
    const post = placeNearRoad(s, 'tradingpost');
    post.build = 1;
    post.need = undefined;
    // The pack horse pulls the goods cart.
    post.improved = ['goodscart'];
    recompute(s);
    post.workers = 2;
    return { s, post };
  };

  it('a trading post keeps no pack horse until it has a goods cart', async () => {
    const { buyDraughtError } = await import('../src/game/sim');
    const { s, post } = town();
    post.improved = [];
    expect(buyDraughtError(s, post)).toMatch(/Nothing here/);
  });

  it('a trading post buys a pack horse only into a free stall, and carries half as much again', async () => {
    const { buyDraught, buyDraughtError, tradeCapacity, stalls, STABLE_STALLS } = await import('../src/game/sim');
    const { s, post } = town();
    expect(buyDraughtError(s, post)).toMatch(/Draught Stable/);
    const stable = placeNearRoad(s, 'draughtstable');
    stable.build = 1;
    stable.need = undefined;
    const before = tradeCapacity(s, post);
    expect(buyDraught(s, post)).toBeNull();
    expect(tradeCapacity(s, post)).toBe(Math.floor(before * 1.5));
    expect(stalls(s)).toEqual({ room: STABLE_STALLS, used: 1 });
    expect(buyDraughtError(s, post)).toMatch(/has its horse/);
  });

  it('with no grain the animal goes hungry and does not work that month', async () => {
    const { buyDraught, tradeCapacity } = await import('../src/game/sim');
    const { s, post } = town();
    const stable = placeNearRoad(s, 'draughtstable');
    stable.build = 1;
    stable.need = undefined;
    buyDraught(s, post);
    const fed = tradeCapacity(s, post);
    s.res.grain = 0;
    while (s.day % DAYS_PER_MONTH !== DAYS_PER_MONTH - 1) stepDay(s);
    stepDay(s);
    s.res.grain = 0;
    expect(post.hungry).toBe(true);
    expect(tradeCapacity(s, post)).toBeLessThan(fed);
  });

  it("a builder's yard with its ox raises sites within reach faster, wearing out wood parts", async () => {
    const { buyDraught, yardFor } = await import('../src/game/sim');
    const raise = (withOx: boolean) => {
      const { s } = town();
      const stable = placeNearRoad(s, 'draughtstable');
      stable.build = 1;
      stable.need = undefined;
      const yard = placeNearRoad(s, 'builderyard');
      yard.build = 1;
      yard.need = undefined;
      recompute(s);
      yard.workers = 2;
      if (withOx) buyDraught(s, yard);
      s.res.woodparts = 10;
      const site = placeNearRoad(s, 'church');
      site.need = undefined;
      site.builders = 2;
      expect(!!yardFor(s, site)).toBe(withOx);
      const parts = s.res.woodparts;
      let days = 0;
      while (site.build < 1 && days < 200) {
        site.builders = 2;
        stepDay(s);
        days++;
      }
      return { days, parts: parts - s.res.woodparts };
    };
    const slow = raise(false);
    const fast = raise(true);
    expect(fast.days).toBeLessThan(slow.days);
    expect(slow.parts).toBe(0);
  });
});

describe('travel', () => {
  it('counts every kind of road: the better the road, the shorter the walk the work loses', async () => {
    const { walkBetween } = await import('../src/game/sim');
    const s = generateWorld(42);
    // Two buildings a good way apart along one long lane.
    const h = hall(s);
    const y = h.y + 3;
    const spot = (from: number, step: number, type: BuildingType) => {
      for (let x = from; Math.abs(x - from) < 12; x += step) {
        if (placementError(s, type, x, y + 1)) continue;
        for (let rx = Math.min(x, h.x); rx <= Math.max(x + 2, h.x + 3); rx++) buildRoad(s, rx, y);
        const b = placeOrder(s, type, x, y + 1);
        if (b) return b;
      }
      throw new Error(`no room for ${type}`);
    };
    const a = spot(h.x - 8, -1, 'well');
    const b = spot(h.x + 8, 1, 'woodcutter');
    for (const x of [a, b]) {
      x.build = 1;
      x.need = undefined;
    }
    recompute(s);
    const lane = walkBetween(s, a, b);
    expect(lane).toBeGreaterThan(10);
    // Pave every road tile, then cobble them: each is quicker going than the last.
    const roads = [...s.road.keys()].filter((i) => s.road[i] === 1);
    let last = lane;
    for (const kind of [2, 3]) {
      for (const i of roads) s.road[i] = kind;
      s.dirty = true;
      recompute(s);
      const now = walkBetween(s, a, b);
      expect(now).toBeLessThan(last);
      last = now;
    }
    // Off the roads altogether, the same walk is the slowest.
    for (const i of roads) s.road[i] = 0;
    s.dirty = true;
    recompute(s);
    expect(walkBetween(s, a, b)).toBeGreaterThan(lane);
  });
});

describe('resource lens', () => {
  it('gathers every rock, bush and herd into patches, counting what is there', async () => {
    const { lensData } = await import('../src/render/lens');
    const s = generateWorld(41);
    const lens = lensData(s);
    const sum = (kind: string) => lens.groups.filter((g) => g.kind === kind).reduce((n, g) => n + g.n, 0);
    let rock = 0;
    let berries = 0;
    for (let i = 0; i < s.terrain.length; i++) {
      if (s.occ[i] >= 0) continue;
      if (s.rock[i] && !(s.silver ?? []).includes(i)) rock++;
      if (s.berriesMax[i]) berries += s.berries[i];
    }
    expect(sum('stone')).toBe(rock);
    expect(sum('berries')).toBe(berries);
    expect(sum('game')).toBeCloseTo((s.herds ?? []).reduce((n, h) => n + h.n, 0));
    // Patches are kept small enough that their numbers say where things are.
    for (const g of lens.groups) expect(g.n).toBeGreaterThanOrEqual(0);
    expect(lens.groups.filter((g) => g.kind === 'stone').length).toBeGreaterThan(1);
  });
});

describe('upkeep and crates', () => {
  it('a workplace wears out its tools, and works slower once none are left to replace them', async () => {
    const { dailyUpkeep, wornYield, WORN_YIELD } = await import('../src/game/sim');
    const s = generateWorld(35);
    const q = placeNearRoad(s, 'quarry');
    q.build = 1;
    q.need = undefined;
    q.workers = BUILDINGS.quarry.workers;
    s.res.tools = 3;
    // A tool and a half a year with a full crew: about eight months wear out one.
    for (let d = 0; d < DAYS_PER_MONTH * 9; d++) dailyUpkeep(s);
    expect(s.res.tools).toBe(2);
    expect(q.worn).toBeFalsy();
    s.res.tools = 0;
    for (let d = 0; d < DAYS_PER_MONTH * 8; d++) dailyUpkeep(s);
    expect(q.worn).toBe(true);
    expect(wornYield(q)).toBe(WORN_YIELD);
    s.res.tools = 5;
    dailyUpkeep(s);
    expect(q.worn).toBeFalsy();
    expect(s.res.tools).toBe(4);
  });

  it('crates that carried extra exports come back, a quarter of them worn out', async () => {
    const { addOrder, runTradeOrders, tradeCapacity, CRATE_WEAR } = await import('../src/game/sim');
    const s = generateWorld(36);
    s.tier = 4;
    const post = placeNearRoad(s, 'tradingpost');
    post.build = 1;
    post.need = undefined;
    recompute(s);
    post.workers = 2;
    const cap = tradeCapacity(s, post);
    s.res.stone = 1000;
    s.res.crates = 40 + 20;
    addOrder(s, post, 'export', 'stone', 0);
    runTradeOrders(s);
    // Half the load again went out in crates: cap / 2 goods, a crate per ten.
    const used = Math.ceil(cap / 2 / 10);
    expect(1000 - s.res.stone).toBe(cap + Math.floor(cap / 2));
    expect(60 - s.res.crates).toBe(Math.max(1, Math.round(used * CRATE_WEAR)));
  });
});

describe('alehouse and tavern, and fields far from their farm', () => {
  it('an alehouse enlarged into a tavern keeps a second tapster and reaches twice as far', async () => {
    const { reachOf, workersOf, buildingName, upgradePlan, finishUpgrade } = await import('../src/game/levels');
    const s = generateWorld(37);
    s.tier = 1;
    const t = placeNearRoad(s, 'tavern');
    t.build = 1;
    t.need = undefined;
    expect(buildingName(t)).toBe('Alehouse');
    expect(workersOf(t)).toBe(2);
    const r = reachOf(t);
    const plan = upgradePlan(s, t);
    expect(plan?.name).toBe('Tavern');
    t.level = plan!.to;
    finishUpgrade(s, t);
    expect(buildingName(t)).toBe('Tavern');
    expect(workersOf(t)).toBe(3);
    expect(reachOf(t)).toBe(r * 2);
    // Saves from before the alehouse: their taverns are full taverns.
    const old = JSON.parse(serialize(s));
    old.version = 2;
    for (const b of old.buildings) if (b.type === 'tavern') b.level = 1;
    expect(deserialize(JSON.stringify(old)).buildings.find((b) => b.type === 'tavern')!.level).toBe(2);
  });

  it('a field far from its farm is still tended, but the walk costs the farm', async () => {
    const { zoneEfficiency } = await import('../src/game/sim');
    const s = generateWorld(38);
    s.tier = 1;
    const farm = placeNearRoad(s, 'farm');
    farm.build = 1;
    farm.need = undefined;
    const c = { x: farm.x + 1, y: farm.y + 1 };
    // The nearest and the furthest free 3x3 plots within 20 tiles.
    const plots: { x: number; y: number; d: number }[] = [];
    for (let y = 2; y < s.height - 5; y++)
      for (let x = 2; x < s.width - 5; x++) {
        const d = Math.hypot(x + 1.5 - c.x, y + 1.5 - c.y);
        if (d < 3 || d > 20) continue;
        let free = true;
        for (let yy = y; yy < y + 3 && free; yy++) for (let xx = x; xx < x + 3 && free; xx++) free = s.terrain[idx(s, xx, yy)] === 0 && s.occ[idx(s, xx, yy)] < 0 && !s.trees[idx(s, xx, yy)] && !s.rock[idx(s, xx, yy)] && !s.road[idx(s, xx, yy)];
        if (free) plots.push({ x, y, d });
      }
    plots.sort((a, b) => a.d - b.d);
    const near = placeZone(s, 'field', plots[0].x, plots[0].y, plots[0].x + 2, plots[0].y + 2)!;
    s.dirty = true;
    recompute(s);
    expect(near.owner).toBe(farm.id);
    const close = zoneEfficiency(s, farm);
    demolish(s, near);
    const fp = plots.filter((p) => p.d > 14).pop()!;
    const far = placeZone(s, 'field', fp.x, fp.y, fp.x + 2, fp.y + 2)!;
    s.dirty = true;
    recompute(s);
    // Beyond the old twelve-tile reach, and still the farm's.
    expect(far.owner).toBe(farm.id);
    expect(zoneEfficiency(s, farm)).toBeLessThan(close);
  });
});

describe('knowledge and the monastery', () => {
  it('a monastery reads a book a month for knowledge, prestige and the prayers that cheer the town', async () => {
    const { knowledgeIncome, prestigeIncome, updateHappiness, MONASTERY_KNOWLEDGE } = await import('../src/game/sim');
    const s = generateWorld(77);
    s.tier = 2;
    s.res.gold = 9999;
    const m = placeNearRoad(s, 'monastery');
    m.build = 1;
    m.need = undefined;
    m.workers = 2;
    const k0 = knowledgeIncome(s);
    const p0 = prestigeIncome(s);
    s.res.books = 1;
    // Step to the turn of the month, when the monks take their book.
    while (s.day % DAYS_PER_MONTH !== DAYS_PER_MONTH - 1) stepDay(s);
    m.workers = 2;
    const known = s.res.knowledge;
    stepDay(s);
    expect(m.reading).toBe(true);
    expect(s.res.books).toBe(0);
    expect(knowledgeIncome(s)).toBe(k0 + MONASTERY_KNOWLEDGE);
    expect(prestigeIncome(s)).toBeCloseTo(p0 + 0.5);
    expect(s.res.knowledge).toBeGreaterThanOrEqual(known + MONASTERY_KNOWLEDGE);
    updateHappiness(s);
    expect(s.happinessFactors.some((f) => f.label.includes('monks'))).toBe(true);
    // No book next month: the monks only pray, and teach nothing.
    for (let i = 0; i < DAYS_PER_MONTH; i++) stepDay(s);
    expect(m.reading).toBe(false);
    expect(knowledgeIncome(s)).toBe(k0);
  });

  it('the church teaches, and so do the homes of the well-to-do', async () => {
    const { knowledgeIncome, eldersLore } = await import('../src/game/sim');
    const s = generateWorld(78);
    s.tier = 3;
    s.res.gold = 9999;
    const base = knowledgeIncome(s);
    expect(base).toBe(eldersLore(s));
    const c = placeNearRoad(s, 'church');
    c.build = 1;
    expect(knowledgeIncome(s)).toBe(base + 0.25);
    c.level = 2;
    expect(knowledgeIncome(s)).toBe(base + 1);
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 4;
    h.residents = 5;
    expect(knowledgeIncome(s)).toBe(base + 1.25);
  });
});

describe('improvements, choices and town options', () => {
  const built = (s: GameState, type: BuildingType) => {
    const b = placeNearRoad(s, type);
    b.build = 1;
    b.need = undefined;
    recompute(s);
    return b;
  };
  const finish = async (s: GameState, b: Building) => {
    const { finishUpgrade } = await import('../src/game/levels');
    finishUpgrade(s, b);
  };

  it('an improvement must be learned, is built by builders, and then counts', async () => {
    const { improveError, startImprove } = await import('../src/game/sim');
    const { workersOf } = await import('../src/game/levels');
    const s = freshWorld(41);
    s.res.gold = 500;
    const wc = built(s, 'woodcutter');
    expect(improveError(s, wc, 'biglodge')).toMatch(/learned/);
    learnEverything(s);
    const places = workersOf(wc);
    expect(startImprove(s, wc, 'biglodge')).toBeNull();
    expect(wc.need).toEqual({ wood: 6 });
    expect(improveError(s, wc, 'oxshed')).toMatch(/already at work/);
    await finish(s, wc);
    expect(wc.improved).toEqual(['biglodge']);
    expect(workersOf(wc)).toBe(places + 2);
    expect(improveError(s, wc, 'biglodge')).toMatch(/Already/);
  });

  it('animal sheds are built onto a pasture, and that pasture carries more', async () => {
    const { placeZone, startImprove, herdRoom } = await import('../src/game/sim');
    const s = generateWorld(71);
    s.tier = 1;
    s.res.wood = 150;
    s.res.gold = 400;
    s.res.planks = 40;
    s.population = 12;
    learnEverything(s);
    const byre = built(s, 'byre');
    let z = null;
    for (let r = 1; r < 10 && !z; r++) z = placeZone(s, 'pasture', byre.x + 2 + r, byre.y, byre.x + 7 + r, byre.y + 5) ?? placeZone(s, 'pasture', byre.x, byre.y + 2 + r, byre.x + 5, byre.y + 7 + r);
    expect(z).not.toBeNull();
    run(s, 5);
    const before = herdRoom(s, byre).room;
    expect(startImprove(s, byre, 'animalsheds')).toMatch(/Not for this/);
    expect(startImprove(s, z!, 'animalsheds')).toBeNull();
    run(s, 60);
    expect(z!.improved).toEqual(['animalsheds']);
    expect(herdRoom(s, byre).room).toBe(Math.floor(before * 1.15));
  });

  it('the improved store needs its loft first, and holds twice as much', async () => {
    const { improveError, storageCap } = await import('../src/game/sim');
    const s = generateWorld(42);
    const before = storageCap(s, 'materials');
    const st = built(s, 'storehouse');
    const one = storageCap(s, 'materials') - before;
    expect(improveError(s, st, 'bigstore')).toMatch(/loft/);
    st.improved = ['loft'];
    expect(storageCap(s, 'materials') - before).toBe(one * 1.5);
    st.improved = ['loft', 'bigstore'];
    expect(storageCap(s, 'materials') - before).toBe(one * 2);
  });

  it('a lathe makes wood parts from two planks, and a firing chamber halves the fuel', async () => {
    const { produceOnce } = await import('../src/game/sim');
    const s = generateWorld(43);
    const c = built(s, 'carpenter');
    c.improved = ['lathe'];
    s.res.planks = 10;
    expect(produceOnce(s, c)).toBeNull();
    expect(s.res.planks).toBe(8);
    const k = built(s, 'kiln');
    k.improved = ['firingchamber'];
    s.res.clay = 40;
    s.res.firewood = 40;
    produceOnce(s, k);
    produceOnce(s, k);
    expect(s.res.firewood).toBe(39);
  });

  it('coppice and high forest are a choice: taking one closes the other', async () => {
    const { learn, learnError } = await import('../src/game/unlocks');
    const s = generateWorld(44);
    s.res.knowledge = 100;
    s.madeEver = { wood: 500 };
    expect(learn(s, 'c:coppice')).toBeNull();
    expect(learnError(s, 'c:highforest')).toMatch(/chosen/);
  });

  it('goats need little pasture; Frisians milk twice and Highlanders give twice the meat', async () => {
    const { buyAnimalError, breedMilk, breedMeat } = await import('../src/game/sim');
    const s = generateWorld(33);
    built(s, 'tradingpost');
    const byre = built(s, 'byre');
    s.res.gold = 500;
    s.learned = (s.learned ?? []).filter((id) => id !== 'a:goats');
    expect(buyAnimalError(s, byre, 'goats')).toMatch(/goats/);
    expect(breedMilk(s)).toBe(1);
    s.learned = ['c:frisian'];
    expect(breedMilk(s)).toBe(2);
    expect(breedMeat(s)).toBeLessThan(1);
    s.learned = ['c:highland'];
    expect(breedMeat(s)).toBe(2);
  });

  it('town options cost something to switch on and run, and give happiness or prestige', async () => {
    const { setOption, monthlyOptions, optionHappiness, optionPrestige } = await import('../src/game/options');
    const s = generateWorld(46);
    expect(setOption(s, 'banners', true)).toMatch(/cloth/);
    s.res.cloth = 10;
    s.res.dyes = 10;
    const p = optionPrestige(s);
    expect(setOption(s, 'banners', true)).toBeNull();
    expect(s.res.cloth).toBe(6);
    expect(optionPrestige(s)).toBe(p + 1);
    // Taken down and put back up again: the banners are already made.
    setOption(s, 'banners', false);
    setOption(s, 'banners', true);
    expect(s.res.cloth).toBe(6);
    s.population = 120;
    expect(setOption(s, 'tunics', true)).toBeNull();
    expect(optionHappiness(s).some((f) => f.label === 'Dyed tunics')).toBe(true);
    s.res.dyes = 0;
    for (let m = 0; m < 12; m++) monthlyOptions(s);
    expect(optionHappiness(s).some((f) => f.label === 'Dyed tunics')).toBe(false);
  });

  it('toll navigation and trade deals each make imports cheaper and exports dearer', async () => {
    const { buyPrice, exportUnitPrice } = await import('../src/game/sim');
    const s = freshWorld(47);
    const buy = buyPrice(s, 'tools', 100);
    const sell = exportUnitPrice(s, 'tools');
    s.learned = ['x:tollnav', 'x:tradedeals'];
    expect(buyPrice(s, 'tools', 100)).toBeLessThan(buy);
    expect(exportUnitPrice(s, 'tools')).toBeGreaterThan(sell);
  });

  it('feats are noticed once: a draught animal at work', async () => {
    const { checkFeats } = await import('../src/game/sim');
    const s = generateWorld(48);
    const y = built(s, 'builderyard');
    checkFeats(s);
    expect(s.feats).not.toContain('animalwork');
    y.beast = true;
    checkFeats(s);
    expect(s.feats).toContain('animalwork');
  });

  it('stone roads and cobbles must be learned', async () => {
    const { roadError } = await import('../src/game/sim');
    const s = freshWorld(49);
    const h = hall(s);
    s.res.stone = 50;
    expect(roadError(s, h.x - 3, h.y + 6, 2)).toMatch(/Learn/);
    s.learned = ['x:stoneroad'];
    expect(roadError(s, h.x - 3, h.y + 6, 2)).toBeNull();
  });
});

describe('the deer park', () => {
  it('is a great reserve of land: never over water, and at least seven by seven', async () => {
    const { zoneError } = await import('../src/game/sim');
    const s = generateWorld(4242);
    s.res.wood = 999;
    manorFor(s).level = 3;
    // Any 8x8 square with a water tile in it is refused.
    let wet: [number, number] | null = null;
    for (let i = 0; i < s.terrain.length && !wet; i++) if (s.terrain[i] === 1 && i % s.width > 10 && i % s.width < s.width - 10 && i / s.width > 10 && i / s.width < s.height - 10) wet = [i % s.width, Math.floor(i / s.width)];
    expect(wet).not.toBeNull();
    const [x, y] = wet!;
    // Nothing else in the way but the water itself.
    for (let yy = y - 3; yy <= y + 4; yy++)
      for (let xx = x - 3; xx <= x + 4; xx++) {
        const i = yy * s.width + xx;
        s.rock[i] = 0;
        s.ore[i] = 0;
        s.road[i] = 0;
      }
    expect(zoneError(s, 'deerpark', x - 3, y - 3, x + 4, y + 4)).toMatch(/water/);
    expect(zoneError(s, 'deerpark', 10, 10, 14, 14)).toMatch(/At least 7/);
  });
});
