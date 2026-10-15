import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILD_ORDER, DAYS_PER_MONTH, DAYS_PER_YEAR, RESOURCE_STORAGE } from '../src/game/data';
import { CHARTERS, grantCharter } from '../src/game/charters';
import { getEvent, holdFeast, resolveEvent } from '../src/game/events';
import { startUpgrade, workersOf } from '../src/game/levels';
import { StateRng } from '../src/game/rng';
import { deserialize, serialize } from '../src/game/save';
import {
  HOME_TRADES,
  YARDS,
  buildRoad,
  demolish,
  placeOrder,
  placeZone,
  placementError,
  raiseRetinue,
  recompute,
  removeRoad,
  setKeep,
  setPriority,
  setRecipe,
  setSell,
  setTax,
  setTrade,
  setWorkers,
  setYard,
  stepDay,
  storageCap,
  store,
  stored,
  trade,
  workDef,
} from '../src/game/sim';
import type { BuildingType, GameState, ResourceId } from '../src/game/types';
import { RESOURCE_IDS } from '../src/game/types';
import { generateWorld, idx } from '../src/game/world';
import { act } from '../src/game/autoplay';

/**
 * A monkey that plays like a careless player: random but legal actions
 * every few days. After each day the state must still make sense.
 */
function monkey(s: GameState, seed: number) {
  const rng = new StateRng({ rngState: seed });
  const r = () => rng.next();
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const hall = s.buildings.find((b) => b.type === 'townhall')!;
  const near = () => ({ x: hall.x + Math.floor(r() * 31) - 15, y: hall.y + Math.floor(r() * 31) - 15 });
  const types = BUILD_ORDER.filter((t) => !BUILDINGS[t].zone) as BuildingType[];
  const actions: (() => unknown)[] = [
    () => {
      const p = near();
      const t = pick(types);
      if (!placementError(s, t, p.x, p.y)) placeOrder(s, t, p.x, p.y);
    },
    () => {
      const p = near();
      const n = 2 + Math.floor(r() * 8);
      const dx = r() < 0.5 ? 1 : 0;
      for (let k = 0; k < n; k++) buildRoad(s, p.x + k * dx, p.y + k * (1 - dx), r() < 0.2);
    },
    () => {
      const p = near();
      removeRoad(s, p.x, p.y);
    },
    () => {
      const p = near();
      placeZone(s, pick(['field', 'pasture', 'orchard'] as BuildingType[]), p.x, p.y, p.x + 1 + Math.floor(r() * 5), p.y + 1 + Math.floor(r() * 5));
    },
    () => {
      const b = pick(s.buildings);
      if (b.type !== 'townhall' && r() < 0.3) demolish(s, b);
    },
    () => {
      const b = pick(s.buildings);
      const recs = workDef(b).recipes;
      if (recs) setRecipe(s, b, r() < 0.3 ? undefined : pick(recs).id);
    },
    () => {
      const b = pick(s.buildings);
      setWorkers(s, b, r() < 0.3 ? undefined : Math.floor(r() * 5));
      setPriority(s, b, Math.floor(r() * 3));
    },
    () => {
      // Only finished workplaces offer a pause button.
      const b = pick(s.buildings.filter((x) => x.build >= 1 && workDef(x).workers > 0));
      if (b) {
        b.paused = !b.paused;
        s.dirty = true;
      }
    },
    () => setKeep(s, pick([...RESOURCE_IDS]), Math.floor(r() * 300)),
    () => setSell(s, pick([...RESOURCE_IDS]), r() < 0.5),
    () => setTax(s, Math.floor(r() * 4)),
    () => trade(s, pick([...RESOURCE_IDS]), (r() < 0.5 ? -1 : 1) * Math.floor(r() * 40)),
    () => {
      const b = pick(s.buildings.filter((x) => x.type === 'house'));
      if (b) setYard(s, b, r() < 0.3 ? undefined : pick(Object.keys(YARDS)));
    },
    () => {
      const b = pick(s.buildings.filter((x) => x.type === 'house'));
      if (b) setTrade(s, b, r() < 0.3 ? undefined : pick(HOME_TRADES));
    },
    () => {
      const b = pick(s.buildings);
      startUpgrade(s, b);
    },
    () => grantCharter(s, pick(CHARTERS).id),
    () => raiseRetinue(s),
    () => holdFeast(s),
    // A generous patron now and then, so the late game gets exercised too.
    () => {
      for (const id of ['wood', 'stone', 'planks', 'gold', 'tools', 'prestige', 'weapons', 'dressedstone', 'tiles'] as ResourceId[]) store(s, id, 40);
    },
  ];
  return () => {
    const n = Math.floor(r() * 3);
    for (let k = 0; k < n; k++) pick(actions)();
    if (s.pendingEvent) {
      const e = getEvent(s.pendingEvent);
      const choices = e?.choices(s) ?? [];
      if (!resolveEvent(s, rng, Math.floor(r() * Math.max(1, choices.length)))) resolveEvent(s, rng, 0) || (s.pendingEvent = undefined);
    }
  };
}

/** Everything that must always hold; returns the first broken rule. */
function invariants(s: GameState): string | null {
  for (const id of RESOURCE_IDS) {
    const v = s.res[id];
    if (!Number.isFinite(v)) return `${id} is ${v}`;
    if (v < -1e-6) return `${id} is negative (${v})`;
  }
  if (!Number.isInteger(s.population) || s.population < 0) return `population ${s.population}`;
  let hands = 0;
  const ids = new Set<number>();
  for (const b of s.buildings) {
    if (ids.has(b.id)) return `duplicate building id ${b.id}`;
    ids.add(b.id);
    hands += b.workers + (b.builders ?? 0);
    if (b.workers < 0 || (b.builders ?? 0) < 0) return `${b.type} has negative staff`;
    if (b.build >= 1 && b.workers > Math.max(workersOf(b), 0)) return `${b.type} has ${b.workers} workers of ${workersOf(b)}`;
    if (!(b.build >= 0 && b.build <= 1)) return `${b.type} build ${b.build}`;
    if (!Number.isFinite(b.work)) return `${b.type} work ${b.work}`;
    if (b.residents > 0 && b.build < 1) return `unfinished ${b.type} has residents`;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      if (s.occ[idx(s, x, y)] !== b.id) return `${b.type} ${b.id} not in occupancy at ${x},${y}`;
    }
  }
  if (hands > s.population) return `${hands} at work but only ${s.population} villagers`;
  for (let i = 0; i < s.occ.length; i++) if (s.occ[i] >= 0 && !ids.has(s.occ[i])) return `tile ${i} points at missing building ${s.occ[i]}`;
  if (s.happiness < 0 || s.happiness > 100 || !Number.isFinite(s.happiness)) return `happiness ${s.happiness}`;
  void RESOURCE_STORAGE;
  return null;
}

/**
 * A town grown by the autoplayer while a careless co-ruler meddles: the bot
 * keeps it alive long enough for the late game to be exercised.
 */
function soak(seed: number, years: number, chaos = 0.3) {
  const s = generateWorld(seed);
  const meddle = monkey(s, seed * 7919);
  let r = seed;
  const rand = () => {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    return r / 0x7fffffff;
  };
  // Villager-months of hunger: a measure of boom and bust.
  let hungry = 0;
  for (let d = 0; d < years * DAYS_PER_YEAR; d++) {
    if (d % 5 === 0) act(s, rand);
    if (rand() < chaos) meddle();
    const before = { materials: stored(s, 'materials'), food: stored(s, 'food') };
    stepDay(s);
    const bad = invariants(s) ?? overfilled(s, before);
    if (bad) return { s, bad: `day ${s.day}: ${bad}`, hungry };
    if (s.day % DAYS_PER_MONTH === 0) hungry += s.report.shortage;
  }
  return { s, bad: null, hungry };
}

/** A day's work must never push a store that is already full any fuller. */
function overfilled(s: GameState, before: Record<'materials' | 'food', number>): string | null {
  for (const kind of ['materials', 'food'] as const) {
    const now = stored(s, kind);
    if (now > storageCap(s, kind) + 0.5 && now > before[kind] + 0.5) {
      return `${kind} grew from ${Math.round(before[kind])} to ${Math.round(now)} past capacity ${storageCap(s, kind)}`;
    }
  }
  return null;
}

describe('stress', () => {
  it('a careless player never breaks the simulation (2 years, 3 maps)', { timeout: 60000 }, () => {
    for (const seed of [11, 12, 13]) {
      const { bad, s } = soak(seed, 2);
      expect(bad, `seed ${seed}`).toBeNull();
      expect(s.buildings.length).toBeGreaterThan(1);
    }
  });

  it('saving and loading mid-game changes nothing', () => {
    const a = generateWorld(21);
    const b = generateWorld(21);
    const actA = monkey(a, 5);
    const actB = monkey(b, 5);
    for (let d = 0; d < 200; d++) {
      actA();
      stepDay(a);
    }
    for (let d = 0; d < 100; d++) {
      actB();
      stepDay(b);
    }
    // Reload b from its save and play on with the same monkey.
    const c = deserialize(serialize(b));
    Object.assign(b, c);
    recompute(b);
    for (let d = 100; d < 200; d++) {
      actB();
      stepDay(b);
    }
    expect(b.population).toBe(a.population);
    expect(Math.round(b.res.gold)).toBe(Math.round(a.res.gold));
    expect(b.buildings.length).toBe(a.buildings.length);
  });

  it.runIf(process.env.STRESS)('long soak: 10 maps for 15 years', { timeout: 1200000 }, () => {
    for (let seed = 1; seed <= 10; seed++) {
      const t = performance.now();
      const { bad, s, hungry } = soak(seed, 15);
      console.log(`seed ${seed}: pop ${s.population} tier ${s.tier} buildings ${s.buildings.length} hungry ${hungry} ${Math.round(performance.now() - t)}ms ${bad ?? 'ok'}`);
      expect(bad, `seed ${seed}`).toBeNull();
    }
  });
});
