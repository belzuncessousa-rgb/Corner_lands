/**
 * A simple greedy player used to check that the game is winnable and to
 * tune balance. It is not part of the shipped game.
 */
import { BUILDINGS, DAYS_PER_MONTH } from '../src/game/data';
import {
  buildRoad,
  canAfford,
  canUpgrade,
  centerOf,
  computeConnectivity,
  monthOf,
  placeOrder,
  placementError,
  resourceInRange,
  stepDay,
  storageCap,
  totalFood,
  totalHousing,
  upgradeHouse,
} from '../src/game/sim';
import type { BuildingType, GameState } from '../src/game/types';
import { idx, inBounds } from '../src/game/world';

const count = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;

function tryPlace(s: GameState, type: BuildingType): boolean {
  const d = BUILDINGS[type];
  if (!canAfford(s, d.cost)) return false;
  const reached = computeConnectivity(s);
  let best: { x: number; y: number; score: number } | null = null;
  const hall = s.buildings.find((b) => b.type === 'townhall')!;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (Math.abs(x - hall.x) > 26 || Math.abs(y - hall.y) > 26) continue;
      if (placementError(s, type, x, y)) continue;
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

/** Lays a road from the network towards the nearest ore deposit. */
function roadToOre(s: GameState): void {
  const reached = computeConnectivity(s);
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

/** Extends the road network with a straight spur from a random road tile. */
function growRoads(s: GameState, rand: () => number): void {
  const reached = computeConnectivity(s);
  const tiles: number[] = [];
  reached.forEach((v, i) => v && tiles.push(i));
  for (let tries = 0; tries < 30; tries++) {
    const t = tiles[Math.floor(rand() * tiles.length)];
    const x = t % s.width;
    const y = Math.floor(t / s.width);
    const [dx, dy] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][Math.floor(rand() * 4)];
    let n = 0;
    for (let k = 1; k <= 8; k++) if (buildRoad(s, x + dx * k, y + dy * k)) n++;
    if (n >= 4) return;
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

function act(s: GameState, rand: () => number): void {
  const pop = s.population;
  const food = totalFood(s);
  const sites = s.buildings.filter((b) => b.build < 1).length;
  if (sites >= 3) return;
  const idle = pop - s.buildings.reduce((a, b) => a + b.workers, 0);
  const foodMakers = count(s, 'forager') + count(s, 'hunter') + count(s, 'fisher') + count(s, 'bakery') * 2;
  const wants: BuildingType[] = [];
  if (food < pop * 4 && foodMakers < 1 + pop / 6) {
    if (count(s, 'forager') < 2) wants.push('forager');
    wants.push('fisher', 'hunter');
    if (s.tier >= 1) wants.push('farm');
  }
  if (count(s, 'woodcutter') < 1 + Math.floor(pop / 20) || s.res.wood < 25) wants.push('woodcutter');
  if (totalHousing(s) - pop < 4 && idle >= 0) wants.push('house');
  if (count(s, 'quarry') < 1 + Math.floor(pop / 40)) wants.push('quarry');
  if (pop >= 10 && count(s, 'well') < Math.ceil(pop / 20)) wants.push('well');
  if (count(s, 'forester') < count(s, 'woodcutter')) wants.push('forester');
  const cap = storageCap(s);
  if (Object.entries(s.res).some(([k, v]) => k !== 'gold' && v > cap * 0.85) && count(s, 'storehouse') < 3) wants.push('storehouse');
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
    for (const b of s.buildings) if (b.type === 'house' && !canUpgrade(s, b)) upgradeHouse(s, b);
  }
  for (const t of wants) {
    if (BUILDINGS[t].tier > s.tier) continue;
    if (tryPlace(s, t)) return;
  }
  if (wants.length) growRoads(s, rand);
  void monthOf;
}
