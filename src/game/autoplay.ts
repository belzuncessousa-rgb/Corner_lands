/**
 * A simple greedy player. Tests use it to check the game is winnable and to
 * tune balance; the title screen uses it to grow a demo village.
 */
import { BUILDINGS, DAYS_PER_MONTH } from './data';
import { autoResolve } from './events';
import { startUpgrade, upgradeBlocker, upgradePlan } from './levels';
import { StateRng } from './rng';
import {
  buildRoad,
  canAfford,
  centerOf,
  reachableRoads,
  monthOf,
  placeOrder,
  placementError,
  resourceInRange,
  roadError,
  stepDay,
  storageCap,
  stored,
  totalFood,
  totalHousing,
  hasBuilt,
  roomFor,
  trade,
  bCenter,
  placeZone,
  zoneArea,
  zoneError,
  zonesOf,
} from './sim';
import type { BuildingType, Cost, GameState, ResourceId } from './types';
import { idx, inBounds } from './world';

const count = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;

function tryPlace(s: GameState, type: BuildingType): boolean {
  const d = BUILDINGS[type];
  // Count materials already promised to unfinished sites.
  if (!affordsWithPromises(s, d.cost)) return false;
  const reached = reachableRoads(s);
  let best: { x: number; y: number; score: number } | null = null;
  const hall = s.buildings.find((b) => b.type === 'townhall')!;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (Math.abs(x - hall.x) > 26 || Math.abs(y - hall.y) > 26) continue;
      if (placementError(s, type, x, y)) continue;
      // Keep the planned streets free.
      let blocksStreet = false;
      for (let yy = y; yy < y + d.h && !blocksStreet; yy++) for (let xx = x; xx < x + d.w; xx++) if (onGrid(s, xx, yy)) blocksStreet = true;
      if (blocksStreet) continue;
      // Must touch a connected road.
      let touches = false;
      for (let xx = x - 1; xx <= x + d.w && !touches; xx++) {
        for (let yy = y - 1; yy <= y + d.h && !touches; yy++) {
          const edge = xx === x - 1 || xx === x + d.w || yy === y - 1 || yy === y + d.h;
          const corner = (xx === x - 1 || xx === x + d.w) && (yy === y - 1 || yy === y + d.h);
          if (edge && !corner && inBounds(s, xx, yy) && reached[idx(s, xx, yy)]) touches = true;
        }
      }
      if (!touches) continue;
      const c = centerOf(x, y, d.w, d.h);
      let score = -Math.hypot(c.x - hall.x, c.y - hall.y);
      if (d.gathers) score += resourceInRange(s, type, c) * (d.gathers === 'rock' || d.gathers === 'ore' ? 3 : 1);
      if (type === 'farm') {
        let f = 0;
        for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) f += s.fertility[idx(s, xx, yy)];
        score += f * 2;
      }
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (!best) return false;
  if (d.gathers && resourceInRange(s, type, centerOf(best.x, best.y, d.w, d.h)) < 3) return false;
  return !!placeOrder(s, type, best.x, best.y);
}

/** Gives each farmstead about 40 tiles of fields on the best soil nearby. */
function drawFields(s: GameState): void {
  for (const farm of s.buildings) {
    if (farm.type !== 'farm' || farm.build < 1) continue;
    if (zoneArea(zonesOf(s, farm)) >= 36) continue;
    const c = bCenter(farm);
    let best = null as { x: number; y: number; w: number; h: number; score: number } | null;
    for (const [w, h] of [
      [5, 5],
      [6, 4],
      [4, 6],
      [4, 4],
      [3, 4],
      [4, 3],
      [3, 3],
    ]) {
      for (let y = Math.floor(c.y - 9); y <= c.y + 9; y++) {
        for (let x = Math.floor(c.x - 9); x <= c.x + 9; x++) {
          if (zoneError(s, 'field', x, y, x + w - 1, y + h - 1)) continue;
          let blocks = false;
          let fert = 0;
          for (let yy = y; yy < y + h && !blocks; yy++) {
            for (let xx = x; xx < x + w; xx++) {
              if (onGrid(s, xx, yy)) blocks = true;
              fert += s.fertility[idx(s, xx, yy)];
            }
          }
          if (blocks) continue;
          const d = Math.hypot(x + w / 2 - c.x, y + h / 2 - c.y);
          const score = fert / (w * h) * 4 + w * h * 0.15 - d * 0.4;
          if (!best || score > best.score) best = { x, y, w, h, score };
        }
      }
      if (best) break;
    }
    if (best) placeZone(s, 'field', best.x, best.y, best.x + best.w - 1, best.y + best.h - 1);
  }
}

/** Lays a road from the network towards the nearest ore deposit. */
function roadToOre(s: GameState): void {
  const reached = reachableRoads(s);
  const hall = s.buildings.find((b) => b.type === 'townhall')!;
  let ore = -1;
  let best = Infinity;
  s.ore.forEach((v, i) => {
    if (!v) return;
    const d = Math.hypot((i % s.width) - hall.x, Math.floor(i / s.width) - hall.y);
    if (d < best) {
      best = d;
      ore = i;
    }
  });
  if (ore < 0) return;
  const ox = ore % s.width;
  const oy = Math.floor(ore / s.width);
  let start = -1;
  best = Infinity;
  reached.forEach((v, i) => {
    if (!v) return;
    const d = Math.hypot((i % s.width) - ox, Math.floor(i / s.width) - oy);
    if (d < best) {
      best = d;
      start = i;
    }
  });
  if (start < 0 || best < 4) return;
  // Walk greedily toward the ore, stopping a few tiles short.
  let x = start % s.width;
  let y = Math.floor(start / s.width);
  for (let k = 0; k < 60 && Math.hypot(x - ox, y - oy) > 3; k++) {
    const dx = Math.sign(ox - x);
    const dy = Math.sign(oy - y);
    const tryStep = (nx: number, ny: number) => {
      if (!inBounds(s, nx, ny)) return false;
      const i = idx(s, nx, ny);
      if (s.road[i]) return true;
      return buildRoad(s, nx, ny);
    };
    if (Math.abs(ox - x) >= Math.abs(oy - y) ? tryStep(x + dx, y) || tryStep(x, y + dy) : tryStep(x, y + dy) || tryStep(x + dx, y)) {
      if (Math.abs(ox - x) >= Math.abs(oy - y) && s.road[idx(s, x + dx, y)]) x += dx;
      else if (dy && s.road[idx(s, x, y + dy)]) y += dy;
      else x += dx;
    } else {
      return;
    }
  }
}

/** The bot lays out streets on a grid every GRID tiles around the hall. */
const GRID = 7;

function onGrid(s: GameState, x: number, y: number): boolean {
  const hall = s.buildings.find((b) => b.type === 'townhall')!;
  const gx = (((x - (hall.x - 2)) % GRID) + GRID) % GRID;
  const gy = (((y - (hall.y + 3)) % GRID) + GRID) % GRID;
  return gx === 0 || gy === 0;
}

/** Extends a grid street from the edge of the connected network. */
function growRoads(s: GameState, rand: () => number): void {
  const reached = reachableRoads(s);
  const tiles: number[] = [];
  reached.forEach((v, i) => v && tiles.push(i));
  for (let tries = 0; tries < 80; tries++) {
    const t = tiles[Math.floor(rand() * tiles.length)];
    const x = t % s.width;
    const y = Math.floor(t / s.width);
    const [dx, dy] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][Math.floor(rand() * 4)];
    // Only follow grid lines, over dry land, without gaps.
    let ok = 0;
    for (let k = 1; k <= GRID; k++) {
      const nx = x + dx * k;
      const ny = y + dy * k;
      if (!inBounds(s, nx, ny) || s.terrain[idx(s, nx, ny)] === 1 || !onGrid(s, nx, ny)) break;
      if (!s.road[idx(s, nx, ny)] && roadError(s, nx, ny)) break;
      ok = k;
    }
    if (ok < 2) continue;
    let built = 0;
    for (let k = 1; k <= ok; k++) if (buildRoad(s, x + dx * k, y + dy * k)) built++;
    if (built) return;
  }
}

export interface BotReport {
  villageYear: number | null;
  townYear: number | null;
  boroughYear: number | null;
  log: string[];
}

export function playBot(s: GameState, years: number, seed = 1): BotReport {
  let r = seed;
  const rand = () => {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    return r / 0x7fffffff;
  };
  const rep: BotReport = { villageYear: null, townYear: null, boroughYear: null, log: [] };
  for (let day = 0; day < years * 120; day++) {
    if (day % 5 === 0) act(s, rand);
    stepDay(s);
    const year = s.day / 120;
    if (s.tier >= 1 && rep.villageYear === null) rep.villageYear = year;
    if (s.tier >= 2 && rep.townYear === null) rep.townYear = year;
    if (s.tier >= 3 && rep.boroughYear === null) rep.boroughYear = year;
    if (s.day % (DAYS_PER_MONTH * 12) === 0) {
      rep.log.push(
        `y${s.day / 120} pop=${s.population}/${totalHousing(s)} happy=${s.happiness} food=${Math.floor(totalFood(s))} wood=${Math.floor(s.res.wood)} stone=${Math.floor(s.res.stone)} planks=${Math.floor(s.res.planks)} tools=${s.res.tools} gold=${Math.floor(s.res.gold)} tier=${s.tier} b=${s.buildings.length}`,
      );
    }
  }
  const counts: Record<string, number> = {};
  for (const b of s.buildings) counts[b.type] = (counts[b.type] ?? 0) + 1;
  rep.log.push(JSON.stringify(counts));
  rep.log.push(s.buildings.filter((b) => b.status && b.type !== 'house').map((b) => `${b.type}:${b.status}`).join(' | '));
  return rep;
}

/** Buys what is short at the market, as a sensible player would. */
function shop(s: GameState): void {
  if (!hasBuilt(s, 'market')) return;
  const buy = (id: ResourceId, n: number, keep: number) => {
    if (s.res.gold > keep) trade(s, id, n);
  };
  if (s.res.wood < 30) buy('wood', 20, 80);
  if (s.res.tools < 6 && s.tier >= 2) buy('tools', 5, 150);
  if (totalFood(s) < s.population * 2) buy('bread', 20, 80);
  if (s.res.stone < 30) buy('stone', 20, 120);
}

/** Materials still owed to every unfinished site and renovation. */
function promisedMaterials(s: GameState): Cost {
  const out: Cost = {};
  for (const o of s.buildings) {
    if (!o.need) continue;
    for (const k in o.need) out[k as ResourceId] = (out[k as ResourceId] ?? 0) + (o.need[k as ResourceId] ?? 0);
  }
  return out;
}

function affordsWithPromises(s: GameState, cost: Cost): boolean {
  const all: Cost = { ...cost };
  const p = promisedMaterials(s);
  for (const k in p) all[k as ResourceId] = (all[k as ResourceId] ?? 0) + (p[k as ResourceId] ?? 0);
  return canAfford(s, all);
}

/** Raises the manor when possible, and a couple of homes at a time. */
function renovate(s: GameState): void {
  const hall = s.buildings.find((b) => b.type === 'townhall');
  const plan = hall ? upgradePlan(s, hall) : null;
  if (hall && plan && !hall.upgrading && plan.reqs.every((r) => r.met)) {
    if (!upgradeBlocker(s, hall) && affordsWithPromises(s, plan.cost)) {
      startUpgrade(s, hall);
    } else {
      // Save up for the manor: buy what is missing, and hold off on homes.
      for (const k in plan.cost) {
        const id = k as ResourceId;
        if (id === 'gold') continue;
        const short = (plan.cost[id] ?? 0) - s.res[id];
        if (short > 0 && hasBuilt(s, 'market') && s.res.gold > (plan.cost.gold ?? 0) + 60) trade(s, id, Math.min(short, roomFor(s, id)));
      }
      return;
    }
  }
  let busy = s.buildings.filter((b) => b.upgrading).length;
  for (const b of s.buildings) {
    if (busy >= 2) break;
    if (b.type !== 'house' || upgradeBlocker(s, b)) continue;
    if (!affordsWithPromises(s, upgradePlan(s, b)!.cost)) continue;
    if (startUpgrade(s, b)) busy++;
  }
}

function act(s: GameState, rand: () => number): void {
  if (s.pendingEvent) autoResolve(s, new StateRng(s));
  shop(s);
  const pop = s.population;
  const food = totalFood(s);
  renovate(s);
  drawFields(s);
  const sites = s.buildings.filter((b) => b.build < 1).length;
  if (sites >= 3) return;
  const idle = pop - s.buildings.reduce((a, b) => a + b.workers, 0);
  const foodMakers = count(s, 'forager') + count(s, 'hunter') + count(s, 'fisher') + count(s, 'bakery') * 2;
  const wants: BuildingType[] = [];
  // Key buildings for progression come first once unlocked.
  if (s.tier >= 1) {
    for (const t of ['sawmill', 'bakery', 'market'] as BuildingType[]) {
      if (count(s, t) === 0 && (t !== 'bakery' || count(s, 'farm') > 0)) wants.push(t);
    }
  }
  if (s.tier >= 2) {
    for (const t of ['smithy', 'church'] as BuildingType[]) if (count(s, t) === 0) wants.push(t);
  }
  if (food < pop * 4 && foodMakers < 1 + pop / 6) {
    if (count(s, 'forager') < 2) wants.push('forager');
    wants.push('fisher', 'hunter');
    if (s.tier >= 1) wants.push('farm');
  }
  if (count(s, 'woodcutter') < 2 + Math.floor(pop / 15) || s.res.wood < 25) wants.push('woodcutter');
  if (totalHousing(s) - pop < 4 && idle >= 0) wants.push('house');
  if (count(s, 'quarry') < 1 + Math.floor(pop / 40)) wants.push('quarry');
  if (pop >= 10 && count(s, 'well') < Math.ceil(pop / 20)) wants.push('well');
  if (count(s, 'forester') < count(s, 'woodcutter')) wants.push('forester');
  if (stored(s, 'materials') > storageCap(s, 'materials') * 0.8 && count(s, 'storehouse') < 3) wants.push('storehouse');
  if (stored(s, 'food') > storageCap(s, 'food') * 0.8 && count(s, 'granary') < 3) wants.push('granary');
  if (s.tier >= 1) {
    if (count(s, 'farm') < Math.ceil(pop / 18)) wants.push('farm');
    if (count(s, 'bakery') < Math.ceil(count(s, 'farm') / 2)) wants.push('bakery');
    if (count(s, 'sawmill') < 1 + Math.floor(pop / 50)) wants.push('sawmill');
    if (count(s, 'market') < 1) wants.push('market');
  }
  if (s.tier >= 2) {
    if (count(s, 'mine') < 1) {
      if (!tryPlace(s, 'mine')) roadToOre(s);
    }
    if (count(s, 'smithy') < 1) wants.push('smithy');
    if (count(s, 'church') < 1) wants.push('church');
  }
  if (s.tier >= 1 && count(s, 'tavern') < 1 + Math.floor(pop / 70)) wants.push('tavern');
  for (const t of wants) {
    if (BUILDINGS[t].tier > s.tier) continue;
    if (tryPlace(s, t)) return;
  }
  if (wants.length) growRoads(s, rand);
  void monthOf;
}
