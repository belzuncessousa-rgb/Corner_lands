/**
 * A simple greedy player. Tests use it to check the game is winnable and to
 * tune balance; the title screen uses it to grow a demo village.
 */
import { BUILDINGS, DAYS_PER_MONTH } from './data';
import { autoResolve, fairCost, fairError, feastError, FESTIVALS, festivalError, holdFair, holdFeast, holdFestival } from './events';
import { grantCharter } from './charters';
import { startUpgrade, upgradeBlocker, upgradePlan } from './levels';
import { StateRng } from './rng';
import {
  labourSummary,
  WALL_SAFE,
  coveredBy,
  harvestForecast,
  barnTotal,
  FARM_BARN,
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
  countInRadius,
  placeZone,
  zoneArea,
  zoneError,
  zonesOf,
} from './sim';
import type { BuildingType, Cost, GameState, ResourceId } from './types';
import { idx, inBounds } from './world';

const count = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;

/** Places a building near the manor, or near `near` (a home that lacks it). */
export function tryPlace(s: GameState, type: BuildingType, near?: { x: number; y: number }): boolean {
  const d = BUILDINGS[type];
  // Count materials already promised to unfinished sites. The cathedral, like a
  // player would, is begun with the coins alone; builders gather the rest over years.
  if (type === 'cathedral' ? s.res.gold < (d.cost.gold ?? 0) + 500 : !affordsWithPromises(s, d.cost)) return false;
  const reached = reachableRoads(s);
  let best: { x: number; y: number; score: number } | null = null;
  const hall = s.buildings.find((b) => b.type === 'townhall')!;
  // A bigger town spreads further from the manor.
  const reach = 26 + 5 * Math.max(0, s.tier - 2);
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (Math.abs(x - hall.x) > reach || Math.abs(y - hall.y) > reach) continue;
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
      const to = near ?? hall;
      let score = -Math.hypot(c.x - to.x, c.y - to.y);
      if (d.gathers) {
        const res = resourceInRange(s, type, c);
        // Only spots with something to gather are worth considering.
        if (res < 3) continue;
        score += res * (d.gathers === 'rock' || d.gathers === 'ore' ? 3 : 1);
      }
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

/** Finds the best clear rectangle for a zone near a workplace. */
export function zoneSpot(s: GameState, type: BuildingType, near: { x: number; y: number; w: number; h: number }, sizes: [number, number][]) {
  const c = bCenter(near as never);
  for (const [w, h] of sizes) {
    let best = null as { x: number; y: number; w: number; h: number; score: number } | null;
    for (let y = Math.floor(c.y - 9); y <= c.y + 9; y++) {
      for (let x = Math.floor(c.x - 9); x <= c.x + 9; x++) {
        if (zoneError(s, type, x, y, x + w - 1, y + h - 1)) continue;
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
        const score = ((type === 'field' ? 4 : 0) * fert) / (w * h) - d * 0.4;
        if (!best || score > best.score) best = { x, y, w, h, score };
      }
    }
    if (best) return best;
  }
  return null;
}

/** Gives each farmstead about 40 tiles of fields, wheat first, then barley and flax. */
function drawFields(s: GameState): void {
  const crops = ['wheat', 'barley', 'wheat', 'flax'];
  for (const farm of s.buildings) {
    if (farm.type !== 'farm' || farm.build < 1) continue;
    const fields = zonesOf(s, farm);
    if (zoneArea(fields) >= 36) continue;
    // The last harvest did not fit: no more fields for now.
    if (s.buildings.some((b) => b.type === 'farm' && barnTotal(b) > FARM_BARN * 0.6)) continue;
    const spot = zoneSpot(s, 'field', farm, [
      [5, 5],
      [6, 4],
      [4, 6],
      [4, 4],
      [3, 4],
      [4, 3],
      [3, 3],
    ]);
    if (!spot) continue;
    const f = placeZone(s, 'field', spot.x, spot.y, spot.x + spot.w - 1, spot.y + spot.h - 1);
    if (f) {
      const farms = s.buildings.filter((b) => b.type === 'farm').indexOf(farm);
      f.recipe = crops[(fields.length + farms) % crops.length];
    }
  }
  // Sow wheat again where barley or flax piles up unused.
  for (const f of s.buildings) {
    if (f.type !== 'field' || f.growth > 0.01) continue;
    if ((f.recipe === 'barley' && s.res.barley > 200) || (f.recipe === 'flax' && s.res.flax > 200)) f.recipe = 'wheat';
    else if (f.recipe === 'wheat' && s.res.barley < 20 && count(s, 'brewhouse') > 0 && s.res.grain > 100) f.recipe = 'barley';
  }
  for (const byre of s.buildings) {
    if (byre.type !== 'byre' || byre.build < 1 || zonesOf(s, byre).length) continue;
    if (s.res.wood < 25) continue;
    const spot = zoneSpot(s, 'pasture', byre, [
      [6, 6],
      [5, 6],
      [5, 5],
      [4, 5],
      [4, 4],
    ]);
    if (spot) placeZone(s, 'pasture', spot.x, spot.y, spot.x + spot.w - 1, spot.y + spot.h - 1);
  }
}

/** Lays a road from the network towards the nearest ore deposit. */
function roadToOre(s: GameState, deposits: Uint8Array = s.ore): void {
  const reached = reachableRoads(s);
  const hall = s.buildings.find((b) => b.type === 'townhall')!;
  let ore = -1;
  let best = Infinity;
  deposits.forEach((v, i) => {
    if (!v) return;
    // Aim for a real outcrop, not a lone boulder.
    if (countInRadius(s, { x: (i % s.width) + 0.5, y: Math.floor(i / s.width) + 0.5 }, 3, (j) => deposits[j] > 0) < 4) return;
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
  if (start < 0 || best < 2.5) return;
  // Walk greedily toward the deposit (bridging rivers), stopping just short.
  let x = start % s.width;
  let y = Math.floor(start / s.width);
  for (let k = 0; k < 60 && Math.hypot(x - ox, y - oy) > 2; k++) {
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
  cityYear: number | null;
  log: string[];
}

export function playBot(s: GameState, years: number, seed = 1): BotReport {
  let r = seed;
  const rand = () => {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    return r / 0x7fffffff;
  };
  const rep: BotReport = { villageYear: null, townYear: null, boroughYear: null, cityYear: null, log: [] };
  for (let day = 0; day < years * 120; day++) {
    if (day % 5 === 0) act(s, rand);
    stepDay(s);
    const year = s.day / 120;
    if (s.tier >= 1 && rep.villageYear === null) rep.villageYear = year;
    if (s.tier >= 2 && rep.townYear === null) rep.townYear = year;
    if (s.tier >= 3 && rep.boroughYear === null) rep.boroughYear = year;
    if (s.tier >= 4 && rep.cityYear === null) rep.cityYear = year;
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
  // Stores clogged with wares: sell some of the largest pile.
  if (stored(s, 'materials') > storageCap(s, 'materials') * 0.9) {
    const piles: ResourceId[] = ['planks', 'dressedstone', 'woodparts', 'tiles', 'iron', 'clay', 'flax', 'hides', 'wool'];
    const top = piles.reduce((a, c) => (s.res[c] > s.res[a] ? c : a));
    if (s.res[top] >= 30) trade(s, top, -Math.floor(s.res[top] / 3));
  }
  // Granaries full of what no one eats (barley waiting for the brewer).
  if (stored(s, 'food') > storageCap(s, 'food') * 0.8 && s.res.barley >= 60) trade(s, 'barley', -Math.floor(s.res.barley / 2));
  if (s.res.wood < 30) buy('wood', 20, 80);
  if (s.res.tools < 6 && s.tier >= 2) buy('tools', 5, 150);
  if (totalFood(s) < s.population * 2) buy('bread', 20, 80);
  if (s.res.stone < 30) buy('stone', 20, 120);
  // Finer homes and the tavern use up wares; buy them when our own run short.
  const homes = (lvl: number) => s.buildings.filter((b) => b.type === 'house' && b.level >= lvl).length;
  if (hasBuilt(s, 'tavern') && s.res.ale + s.res.cider < 8) buy('ale', 10, 100);
  if (s.tier >= 1 && s.res.clothes < 4) buy('clothes', Math.min(10, homes(2) + 3), 150);
  if (homes(3) && s.res.boots < 3) buy('boots', Math.min(8, homes(3)), 200);
  if (s.tier >= 1 && (count(s, 'windmill') === 0 || s.res.grain > 60) && s.res.woodparts < 4) buy('woodparts', 4, 120);
  if (s.tier >= 2 && s.res.tiles < 15 && homes(2) > homes(3)) buy('tiles', 15, 250);
  if (homes(3) && s.res.medicine < 3) buy('medicine', Math.min(8, homes(3)), 200);
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
  let saving = false;
  if (hall && plan && !hall.upgrading && plan.reqs.every((r) => r.met)) {
    // The manor goes first: start as soon as it is allowed and let the builders fetch materials as they come.
    if (!upgradeBlocker(s, hall) && (s.tier >= 3 || affordsWithPromises(s, plan.cost))) {
      startUpgrade(s, hall);
    } else {
      // Save up for the manor: buy what is missing, and renovate one home at a time.
      for (const k in plan.cost) {
        const id = k as ResourceId;
        if (id === 'gold') continue;
        const short = (plan.cost[id] ?? 0) - s.res[id];
        if (short > 0 && hasBuilt(s, 'market') && s.res.gold > (plan.cost.gold ?? 0) + 60) trade(s, id, Math.min(short, roomFor(s, id)));
      }
      saving = true;
    }
  }
  let busy = s.buildings.filter((b) => b.upgrading).length;
  for (const b of s.buildings) {
    if (busy >= (saving ? 1 : 2)) break;
    if (b.type !== 'house' || upgradeBlocker(s, b)) continue;
    if (!affordsWithPromises(s, upgradePlan(s, b)!.cost)) continue;
    if (startUpgrade(s, b)) busy++;
  }
}

/** A City walls itself in, a few sections at a time, around its outermost buildings. */
function layWall(s: GameState): void {
  if (s.buildings.some((b) => b.type === 'wall' && b.build < 1)) return;
  // Forty sections give the walls' full comfort; leave the rest of the land open for growth.
  if (s.buildings.filter((b) => b.type === 'wall').length >= WALL_SAFE) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of s.buildings) {
    if (BUILDINGS[b.type].zone || b.type === 'wall') continue;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  x0 -= 6;
  y0 -= 6;
  x1 += 5;
  y1 += 5;
  const ring: [number, number][] = [];
  for (let x = x0; x <= x1; x++) ring.push([x, y0], [x, y1]);
  for (let y = y0 + 1; y < y1; y++) ring.push([x0, y], [x1, y]);
  let laid = 0;
  for (const [x, y] of ring) {
    if (laid >= 6) break;
    if (!inBounds(s, x, y) || s.road[idx(s, x, y)] || placementError(s, 'wall', x, y)) continue;
    if (placeOrder(s, 'wall', x, y)) laid++;
  }
}

/** The bot favours farming and trade charters. */
const BOT_CHARTERS = ['farm1', 'trade1', 'farm2', 'herd1', 'trade2', 'farm3a', 'learning1'];

/** One turn of the autoplayer: what a sensible player would do today. */
export function act(s: GameState, rand: () => number): void {
  if (s.pendingEvent) autoResolve(s, new StateRng(s));
  for (const id of BOT_CHARTERS) if (grantCharter(s, id)) break;
  shop(s);
  const pop = s.population;
  const food = totalFood(s);
  if (!feastError(s) && food > pop * 4) holdFeast(s);
  if (!fairError(s) && s.res.gold > fairCost(s) * 3) holdFair(s);
  for (const f of FESTIVALS) if (!festivalError(s, f.id) && food > pop * 4) holdFestival(s, f.id);
  if (s.tier >= 4 && s.res.dressedstone > 60 && s.res.gold > 500) layWall(s);
  renovate(s);
  drawFields(s);
  const sites = s.buildings.filter((b) => b.build < 1).length;
  // Sites waiting for stone must not block the quarry that would supply it.
  if (s.res.stone < 10 && count(s, 'quarry') === 0 && tryPlace(s, 'quarry')) return;
  if (sites >= 3) return;
  const idle = pop - s.buildings.reduce((a, b) => a + b.workers, 0);
  const foodMakers = count(s, 'forager') + count(s, 'hunter') + count(s, 'fisher') + count(s, 'bakery') * 2;
  const wants: BuildingType[] = [];
  // Key buildings for progression come first once unlocked.
  if (s.tier >= 1) {
    for (const t of ['sawmill', 'carpenter', 'windmill', 'bakery', 'market', 'stonemason'] as BuildingType[]) {
      const ready = t === 'sawmill' || t === 'market' || (t === 'stonemason' ? hasBuilt(s, 'market') : count(s, 'farm') > 0);
      if (count(s, t) === 0 && ready) wants.push(t);
    }
  }
  // Timber Houses need a tavern: one, and a brewhouse for it, once there is a market.
  if (s.tier >= 1 && hasBuilt(s, 'market')) {
    for (const t of ['tavern', 'brewhouse'] as BuildingType[]) if (count(s, t) === 0) wants.push(t);
  }
  if (s.tier >= 2) {
    for (const t of ['smithy', 'church'] as BuildingType[]) if (count(s, t) === 0) wants.push(t);
  }
  // Rich enough for the great work: begin the cathedral before anything else.
  if ((s.tier >= 4 || (s.tier >= 3 && s.res.gold > 4000)) && count(s, 'cathedral') < 1 && s.day % DAYS_PER_MONTH === 0 && tryPlace(s, 'cathedral')) return;
  // Jobs nobody fills: new workplaces would only spread the villagers thinner.
  const short = labourSummary(s).short.reduce((a, x) => a + x.want - x.have, 0);
  // Grain piling up: more mills and ovens before anything else.
  if (s.tier >= 1 && s.res.grain > 60 && count(s, 'windmill') < 1 + Math.floor(s.res.grain / 60)) wants.push('windmill');
  if (s.tier >= 1 && s.res.flour > 20 && count(s, 'bakery') < 1 + count(s, 'windmill')) wants.push('bakery');
  if (food < pop * 4 && foodMakers < 1 + pop / 6) {
    if (s.tier >= 1 && count(s, 'farm') < 1 + Math.floor(pop / (idle > pop / 10 ? 25 : 40))) wants.push('farm');
    if (count(s, 'forager') < 2) wants.push('forager');
    if (count(s, 'fisher') < 2 + Math.floor(pop / 30)) wants.push('fisher');
    if (count(s, 'hunter') < 2 + Math.floor(pop / 30)) wants.push('hunter');
  }
  if (short >= 8) {
    // Fill the existing jobs first; homes still bring more hands.
    if (totalHousing(s) - pop < 4) wants.push('house');
    for (const t of wants) if (BUILDINGS[t].tier <= s.tier && tryPlace(s, t)) return;
    return;
  }
  if (count(s, 'woodcutter') < 2 + Math.floor(pop / 15) || (s.res.wood < 25 && count(s, 'woodcutter') < 4 + Math.floor(pop / 10))) wants.push('woodcutter');
  if (totalHousing(s) - pop < 4 && idle >= 0) wants.push('house');
  if (count(s, 'quarry') < 1 + Math.floor(pop / 30)) {
    // Without stone nothing grand gets built: put the quarry first.
    if (s.res.stone < 20) wants.unshift('quarry');
    else wants.push('quarry');
  }
  // No rock beside the roads yet: lay a road towards the nearest outcrop.
  if (count(s, 'quarry') === 0 && pop >= 8 && s.day % DAYS_PER_MONTH === 0) roadToOre(s, s.rock);
  if (pop >= 10 && count(s, 'well') < Math.ceil(pop / 20)) wants.push('well');
  // Homes out of reach of a well, the market or a tavern cannot grow: serve them first.
  if (s.tier >= 2 && s.day % 10 === 0) {
    for (const t of ['well', 'market', 'tavern'] as BuildingType[]) {
      if (t !== 'well' && !hasBuilt(s, t)) continue;
      const lone = s.buildings.find((h) => h.type === 'house' && h.build >= 1 && !coveredBy(s, h, t));
      if (lone && count(s, t) < 2 + Math.floor(pop / (t === 'well' ? 12 : 40)) && tryPlace(s, t, bCenter(lone))) return;
    }
  }
  if (count(s, 'forester') < count(s, 'woodcutter')) wants.push('forester');
  const stores = 2 + Math.floor(pop / 50);
  // Full stores stop the quarry and the woodcutters: a storehouse comes first.
  if (stored(s, 'materials') > storageCap(s, 'materials') * 0.8 && count(s, 'storehouse') < stores) {
    if (stored(s, 'materials') > storageCap(s, 'materials') * 0.85 && tryPlace(s, 'storehouse')) return;
    wants.push('storehouse');
  }
  if (stored(s, 'food') > storageCap(s, 'food') * 0.8 && count(s, 'granary') < stores) wants.push('granary');
  // A harvest that will not fit: a granary before autumn.
  else if (monthOf(s.day) <= 6 && count(s, 'granary') < 2 + Math.floor(pop / 30) && harvestForecast(s).some((h) => h.kind === 'food' && h.expected > h.room)) wants.push('granary');
  if (s.tier >= 1) {
    // A field of wheat bakes into bread for some sixty villagers a year.
    if (count(s, 'farm') < 1 + Math.floor(pop / 50)) wants.push('farm');
    if (count(s, 'windmill') < count(s, 'farm')) wants.push('windmill');
    if (count(s, 'bakery') < count(s, 'windmill')) wants.push('bakery');
    if (count(s, 'tavern') > 0 && count(s, 'brewhouse') < Math.max(1, Math.ceil(count(s, 'tavern') / 2))) wants.push('brewhouse');
    if (pop >= 30 && count(s, 'byre') < 1) wants.push('byre');
    if ((count(s, 'byre') > 0 || s.res.flax >= 40) && count(s, 'weaver') < 1) wants.push('weaver');
    if (count(s, 'weaver') > 0 && count(s, 'tailor') < 1) wants.push('tailor');
    if (count(s, 'sawmill') < 1 + Math.floor(pop / 35)) wants.push('sawmill');
    if (count(s, 'market') < 1) wants.push('market');
  }
  if (s.tier >= 2) {
    if (count(s, 'mine') < 1) {
      if (!tryPlace(s, 'mine')) roadToOre(s);
    }
    if (count(s, 'smithy') < 1) wants.push('smithy');
    if (count(s, 'church') < 1) wants.push('church');
    if (pop >= 60 && count(s, 'tanner') < 1) wants.push('tanner');
    if (count(s, 'mine') > 0 && count(s, 'bloomery') < 1) wants.push('bloomery');
    if (count(s, 'claypit') < 1) wants.push('claypit');
    if (count(s, 'claypit') > 0 && count(s, 'kiln') < 1) wants.push('kiln');
  }
  if (s.tier >= 1 && count(s, 'tavern') < 1 + Math.floor(pop / 70)) wants.push('tavern');
  for (const t of wants) {
    if (BUILDINGS[t].tier > s.tier) continue;
    if (tryPlace(s, t)) return;
  }
  if (wants.length) growRoads(s, rand);
  void monthOf;
}
