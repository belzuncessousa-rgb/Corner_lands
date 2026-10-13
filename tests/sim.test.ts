import { describe, expect, it } from 'vitest';
import { BUILDINGS, DAYS_PER_MONTH, DAYS_PER_YEAR } from '../src/game/data';
import { deserialize, serialize } from '../src/game/save';
import {
  buildRoad,
  demolish,
  doorTile,
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
      if (b && b.connected) return b;
      if (b) demolish(s, b);
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
      expect(h.connected).toBe(true);
      expect(s.road.some((r) => r === 1)).toBe(true);
    }
  });
});

describe('simulation', () => {
  it('builds a connected house and adds housing', () => {
    const s = generateWorld(7);
    recompute(s);
    const before = totalHousing(s);
    const house = placeNearRoad(s, 'house');
    expect(house.connected).toBe(true);
    run(s, 20);
    expect(house.build).toBe(1);
    expect(totalHousing(s)).toBe(before + 5);
  });

  it('woodcutter fells trees and produces timber', () => {
    const s = generateWorld(11);
    const wc = placeNearRoad(s, 'woodcutter');
    run(s, 15);
    expect(wc.build).toBe(1);
    const treesBefore = s.trees.reduce((a, b) => a + b, 0);
    const woodBefore = s.res.wood;
    run(s, 9); // stay inside one month so no firewood is consumed
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

  it('demolishing a site refunds its cost', () => {
    const s = generateWorld(3);
    const wood = s.res.wood;
    const b = placeNearRoad(s, 'house');
    expect(s.res.wood).toBe(wood - 12);
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
