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
import type { BuildingType, GameState } from '../src/game/types';
import { generateWorld, idx } from '../src/game/world';

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
    run(s, 6);
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
    const { setExport } = await import('../src/game/sim');
    const s = generateWorld(8);
    s.tier = 2;
    const m = placeNearRoad(s, 'tradingpost');
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

  it('the manor stops at the Stone Manor, which opens the garden, watch towers and walls', async () => {
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
    marketBy(s, h);
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
  it('every building is open from the start but decorations; charters still shape recipes', async () => {
    const { grantCharter } = await import('../src/game/charters');
    const { isUnlocked, chooseRecipe } = await import('../src/game/sim');
    const s = generateWorld(61);
    s.res.prestige = 2000;
    expect(isUnlocked(s, 'scriptorium')).toBe(true);
    expect(isUnlocked(s, 'cathedral')).toBe(true);
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

  it('townhouses enjoy luxuries and pay more for them', () => {
    const s = generateWorld(62);
    const h = placeNearRoad(s, 'house');
    h.build = 1;
    h.level = 3;
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
  it('May Day needs a maypole in spring; Midsummer burns timber in summer', async () => {
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
    const wood = s.res.wood;
    expect(holdFestival(s, 'midsummer')).toBeNull();
    expect(s.res.wood).toBe(wood - 20);
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
    const { exportGoods, prestigeIncome } = await import('../src/game/sim');
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
    s.sell = { stone: true };
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
    const R = BUILDINGS.woodcutter.radius + 2;
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
  it('prestige buys Baron, Earl and Duke in turn, each needing a larger town', async () => {
    const { takeTitle, titleError } = await import('../src/game/events');
    const s = generateWorld(4);
    s.res.prestige = 10000;
    expect(titleError(s)).toMatch(/Baron needs a Town/);
    s.tier = 2;
    expect(takeTitle(s)).toBeNull();
    expect(s.title).toBe(1);
    expect(s.res.prestige).toBe(9500);
    expect(titleError(s)).toMatch(/Earl needs a Borough/);
    s.tier = 4;
    expect(takeTitle(s)).toBeNull();
    expect(takeTitle(s)).toBeNull();
    expect(s.title).toBe(3);
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

describe('commissions', () => {
  it('prestige buys each work of art once, for lasting cheer', async () => {
    const { commission, commissionError } = await import('../src/game/events');
    const { updateHappiness } = await import('../src/game/sim');
    const s = generateWorld(15);
    s.tier = 3;
    s.res.wood = 100;
    s.res.planks = 40;
    s.res.stone = 40;
    manorFor(s);
    s.res.prestige = 1000;
    expect(commissionError(s, 'glass')).toMatch(/cathedral/);
    expect(commission(s, 'tapestry')).toBeNull();
    expect(s.res.prestige).toBe(700);
    expect(commissionError(s, 'tapestry')).toMatch(/Already/);
    updateHappiness(s);
    expect(s.happinessFactors.some((f) => f.label === 'The great tapestry' && f.value === 2)).toBe(true);
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
