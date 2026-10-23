import { BUILDINGS, DAY_SECONDS, GATHER_REACH, GATHERERS, OFFROAD_TILES_PER_DAY, RESOURCE_STORAGE, ROAD_TILES_PER_DAY, STONE_ROAD_TILES_PER_DAY, COBBLE_TILES_PER_DAY, STORAGE_CAPACITY } from '../game/data';
import { findPath, ROYAL_ROAD_PACE, WOODS_SLOWDOWN } from '../game/path';
import { chooseRecipe, lordRides, nearestShoal, doorTile, forTilesInRadius, bCenter, isWinter, nearestHerd, needsMaterials, seatOf, beastWorks, constructionSites, yardFor } from '../game/sim';

/** The day of each month a merchant cart sets out from the trading post. */
const CART_DAY = 4;
import type { Building, GameState, ResourceId } from '../game/types';
import { getBuilding, idx, inBounds } from '../game/world';

export type Role =
  | { kind: 'work'; id: number }
  | { kind: 'build'; id: number }
  | { kind: 'idle' }
  | { kind: 'settler' }
  | { kind: 'cart'; id: number; leaving: boolean }
  /** Men-at-arms of the lord's retinue, pacing before the manor. */
  | { kind: 'guard' }
  | { kind: 'lord'; id: number }
  /** A trading post's pack horse or a builder's yard's ox: `id` is the building it works for. */
  | { kind: 'beast'; id: number; animal: 'horse' | 'ox' };

type Phase = 'walk' | 'inside' | 'act' | 'pause';

export interface Agent {
  key: string;
  role: Role;
  home: number;
  x: number;
  y: number;
  path: number[];
  phase: Phase;
  timer: number;
  /** What to do after arriving. */
  next: 'enter-work' | 'act' | 'return' | 'enter-home' | 'wander-done' | 'arrive-hall' | 'fetch' | 'drop';
  carry: ResourceId | null;
  tunic: string;
  hair: string;
  ox: number;
  oy: number;
  dir: number;
  step: number;
  visible: boolean;
  /** Animation hint while acting: chop, dig, pick, hammer, fish, plant. */
  act: string;
  fadeIn: number;
  /** Resource a builder is fetching. */
  want?: ResourceId;
  /** Set when a visitor has left the map. */
  gone?: boolean;
  /** Where a visiting cart entered the map. */
  edge?: { x: number; y: number };
  /** Where a fisher's float lies: a point over the water beside the bank (tiles). */
  cast?: { x: number; y: number };
  /** The ring a dancer circles: centre and radius in tiles. */
  ring?: { x: number; y: number; r: number; t: number };
}

const TUNICS = ['#8a3b2e', '#4a5e8a', '#6b7a3a', '#9a7a3a', '#5e4a6e', '#7a5a3a', '#3a6a6a', '#a05a3a', '#556070'];
const HAIR = ['#3a2a1a', '#6a4a2a', '#c8a060', '#2a2420', '#8a5a2a', '#d8d0c0'];

/** Walking speed in tiles per game-second (game time already includes the speed setting). */
const ROAD_SPEED = ROAD_TILES_PER_DAY / DAY_SECONDS;
const OFFROAD_SPEED = OFFROAD_TILES_PER_DAY / DAY_SECONDS;
const PAVED_SPEED = STONE_ROAD_TILES_PER_DAY / DAY_SECONDS;
const COBBLE_SPEED = COBBLE_TILES_PER_DAY / DAY_SECONDS;
const GATHERING = new Set(['market', 'markethall', 'well', 'church', 'cathedral', 'maypole', 'garden', 'publicgarden', 'statue', 'belltower', 'guildhall', 'tavern', 'fountain', 'shrine']);

/** What villagers do for leisure at each gathering place. */
const LEISURE: Record<string, string> = {
  maypole: 'dance',
  church: 'pray',
  cathedral: 'pray',
  shrine: 'pray',
  tavern: 'toast',
  fountain: 'sit',
  garden: 'sit',
  publicgarden: 'sit',
  statue: 'sit',
};

/** Whether a ring round a building, and the tiles just beyond it, are free of other buildings and water. */
function ringClear(s: GameState, b: Building, c: { x: number; y: number }, r: number): boolean {
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2;
    const x = Math.floor(c.x + Math.cos(t) * r);
    const y = Math.floor(c.y + Math.sin(t) * r);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      if (!inBounds(s, x + dx, y + dy)) return false;
      const i = idx(s, x + dx, y + dy);
      if ((s.occ[i] >= 0 && s.occ[i] !== b.id) || (dx === 0 && dy === 0 && s.terrain[i])) return false;
    }
  }
  return true;
}

/** Work done standing beside the thing worked on (a tree, rock, bush or fruit tree), facing it. */
const BESIDE_ACTS = new Set(['chop', 'dig', 'pick', 'reach']);

/** Workshops whose workers are sometimes seen at work in the yard, and at what. */
const YARD_WORK: Partial<Record<string, string[]>> = {
  sawmill: ['saw'],
  carpenter: ['saw', 'hammer'],
  cooper: ['hammer'],
  stonemason: ['chisel'],
  tanner: ['scrape'],
  dyer: ['stir'],
  monastery: ['hoe'],
  limekiln: ['mix'],
  collier: ['shovel'],
};

/** Where each fisher's boat lies when no shoal is near: the open water nearest the hut. */
const homeWater = new Map<number, number>();
let homeWaterMap: Uint8Array | null = null;

/**
 * The tile of open water a fisher's boat lies on: out on the shoal it works,
 * or, with none, in the open water nearest the hut (-1 if there is none).
 */
export function boatSpot(s: GameState, b: Building): number {
  const W = s.width;
  const water = (x: number, y: number) => inBounds(s, x, y) && s.terrain[idx(s, x, y)] === 1;
  const sh = nearestShoal(s, b);
  if (sh) {
    const ox = ((b.id * 7) % 5) * 0.4 - 0.8;
    const oy = ((b.id * 3) % 5) * 0.3 - 0.6;
    const tx = Math.floor(sh.x + ox);
    const ty = Math.floor(sh.y + oy);
    return water(tx, ty) ? ty * W + tx : Math.floor(sh.y) * W + Math.floor(sh.x);
  }
  return boatHome(s, b);
}

/** The open water nearest a fisher's hut, where its boat lies moored while no one is out in it (-1 if none). */
export function boatHome(s: GameState, b: Building): number {
  const water = (x: number, y: number) => inBounds(s, x, y) && s.terrain[idx(s, x, y)] === 1;
  const W = s.width;
  if (homeWaterMap !== s.terrain) {
    homeWater.clear();
    homeWaterMap = s.terrain;
  }
  let spot = homeWater.get(b.id);
  if (spot === undefined) {
    spot = -1;
    let bd = 1e9;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    for (let y = b.y - 6; y < b.y + b.h + 6; y++) {
      for (let x = b.x - 6; x < b.x + b.w + 6; x++) {
        let open = true;
        for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++) open &&= water(x + dx, y + dy);
        if (!open) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d < bd) {
          bd = d;
          spot = y * W + x;
        }
      }
    }
    homeWater.set(b.id, spot);
  }
  return spot;
}

/** The dry tile on the bank nearest a spot on the water, where the boat is boarded. */
function landingFor(s: GameState, spot: number): { x: number; y: number } | null {
  const sx = spot % s.width;
  const sy = Math.floor(spot / s.width);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let r = 1; r <= 10 && !best; r++)
    for (let y = sy - r; y <= sy + r; y++)
      for (let x = sx - r; x <= sx + r; x++) {
        if (!inBounds(s, x, y) || s.terrain[idx(s, x, y)] || s.occ[idx(s, x, y)] >= 0) continue;
        const d = Math.hypot(x - sx, y - sy);
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
  return best;
}

/** Leisure acts (no tools in hand). */
export const LEISURE_ACTS = new Set(['dance', 'pray', 'toast', 'sit', 'chat']);
const MAX_AGENTS = 240;

export class AgentSystem {
  agents: Agent[] = [];
  private syncTimer = 0;
  private lastPop = -1;
  private serial = 0;

  reset(): void {
    this.agents = [];
    this.lastPop = -1;
    this.syncTimer = 0;
  }

  private lastCartDay: number | null = null;

  /** Dusk to night: villagers head home and the lanes go quiet until morning. */
  private evening = false;

  /** `dayFrac` is how far through the day it is (0 at dawn, 1 at the next). */
  update(s: GameState, dt: number, dayFrac = 0.5): void {
    // Home by nightfall (see the renderer's nights), out again in the morning.
    this.evening = dayFrac > 0.74 && dayFrac < 0.99;
    // Once a month a merchant cart visits trading posts and docks with orders.
    // The first such day seen after a load sends no cart; later ones do.
    const marketDay = s.day % 10 === CART_DAY ? s.day : null;
    if (marketDay !== null && this.lastCartDay !== null && marketDay !== this.lastCartDay && dt > 0) {
      for (const m of s.buildings) {
        // (A dock's trade comes by water: the renderer sails its ship in.)
        if (m.type === 'tradingpost' && m.build >= 1 && m.orders?.length) this.sendCart(s, m);
      }
    }
    if (marketDay !== null || this.lastCartDay === null) this.lastCartDay = marketDay ?? -1;
    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.sync(s);
      this.syncTimer = 0.75;
    }
    for (const a of this.agents) this.tick(s, a, dt);
  }

  // ---------------------------------------------------------------- roles

  private desiredRoles(s: GameState): Role[] {
    const roles: Role[] = [];
    for (const b of s.buildings) {
      for (let k = 0; k < (b.builders ?? 0); k++) roles.push({ kind: 'build', id: b.id });
      if (b.build >= 1) for (let k = 0; k < b.workers; k++) roles.push({ kind: 'work', id: b.id });
    }
    const idle = s.population - roles.length;
    for (let k = 0; k < idle; k++) roles.push({ kind: 'idle' });
    if (s.retinue) roles.push({ kind: 'guard' }, { kind: 'guard' });
    // Once the manor stands, the lord walks out to see the town.
    const manor = s.buildings.find((b) => b.type === 'townhall' && b.build >= 1);
    if (manor) roles.push({ kind: 'lord', id: manor.id });
    // Draught animals, each with the building it works for.
    if (s.buildings.some((b) => b.type === 'draughtstable' && b.build >= 1)) {
      for (const b of s.buildings) if (b.beast && b.build >= 1) roles.push({ kind: 'beast', id: b.id, animal: b.type === 'tradingpost' ? 'horse' : 'ox' });
    }
    return roles;
  }

  private sync(s: GameState): void {
    const roles = this.desiredRoles(s);
    const keyed = new Map<string, Role>();
    const counts = new Map<string, number>();
    for (const r of roles) {
      const base = r.kind === 'work' || r.kind === 'build' || r.kind === 'beast' ? `${r.kind}:${r.id}` : r.kind;
      const n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      keyed.set(`${base}#${n}`, r);
    }
    // Keep settlers walking in; they are re-keyed on arrival.
    const keep: Agent[] = [];
    const taken = new Set<string>();
    for (const a of this.agents) {
      if (a.role.kind === 'settler' || a.role.kind === 'cart') {
        if (!a.gone) keep.push(a);
        // A newcomer still walking in already holds the place they will take:
        // no second villager is made for it (one of the two would vanish on arrival).
        if (!a.gone && a.role.kind === 'settler' && keyed.has(a.key) && !taken.has(a.key)) taken.add(a.key);
        continue;
      }
      if (keyed.has(a.key) && !taken.has(a.key)) {
        taken.add(a.key);
        keep.push(a);
      }
    }
    // Villagers whose job went (jobs are shuffled as the town changes) take up
    // the new ones where they stand, rather than vanishing mid-step while a
    // stranger appears indoors elsewhere.
    const villager = (r: Role) => r.kind === 'work' || r.kind === 'build' || r.kind === 'idle';
    const orphans = this.agents.filter((a) => !keep.includes(a) && villager(a.role)).sort((a, b) => Number(b.visible) - Number(a.visible));
    const homes = this.homeSlots(s);
    const growth = this.lastPop >= 0 ? Math.max(0, s.population - this.lastPop) : 0;
    let settlersToSpawn = Math.min(growth, 12);
    this.lastPop = s.population;
    let i = 0;
    for (const [key, role] of keyed) {
      if (keep.length >= MAX_AGENTS) break;
      i++;
      if (taken.has(key)) continue;
      const free = villager(role) ? orphans.shift() : undefined;
      if (free) {
        free.key = key;
        free.role = role;
        keep.push(free);
        continue;
      }
      const home = role.kind === 'lord' ? role.id : role.kind === 'beast' ? (stableFor(s, role.id)?.id ?? -1) : (homes[i % Math.max(1, homes.length)] ?? -1);
      const a = this.spawn(s, key, role, home);
      if (settlersToSpawn > 0 && this.sendFromEdge(s, a)) settlersToSpawn--;
      keep.push(a);
    }
    // Drop agents beyond the population (people who left).
    const nonSettlers = keep.filter((a) => a.role.kind !== 'settler').length;
    void nonSettlers;
    this.agents = keep;
  }

  private homeSlots(s: GameState): number[] {
    const out: number[] = [];
    for (const b of s.buildings) for (let k = 0; k < b.residents; k++) out.push(b.id);
    return out;
  }

  private spawn(s: GameState, key: string, role: Role, home: number): Agent {
    const n = this.serial++;
    const hb = getBuilding(s, home);
    const start = hb ? doorTile(s, hb) : this.hallDoor(s);
    const a: Agent = {
      key,
      role,
      home,
      x: start.x + 0.5,
      y: start.y + 0.5,
      path: [],
      phase: 'inside',
      timer: Math.random() * 2,
      next: 'enter-home',
      carry: null,
      tunic: role.kind === 'guard' ? '#7a1e22' : TUNICS[n % TUNICS.length],
      hair: HAIR[(n * 7) % HAIR.length],
      ox: ((n * 37) % 7) / 7 - 0.5,
      oy: ((n * 53) % 5) / 5 - 0.5,
      dir: 1,
      step: Math.random() * 10,
      visible: false,
      act: '',
      fadeIn: 0,
    };
    return a;
  }

  private hallDoor(s: GameState): { x: number; y: number } {
    const hall = seatOf(s);
    return hall ? doorTile(s, hall) : { x: s.width >> 1, y: s.height >> 1 };
  }

  /** Makes a new agent walk in from the map edge. */
  private sendFromEdge(s: GameState, a: Agent): boolean {
    const hall = this.hallDoor(s);
    // Pick the closest dry edge tile in a random direction.
    for (let tries = 0; tries < 20; tries++) {
      const side = Math.floor(Math.random() * 4);
      const t = Math.floor(Math.random() * s.width);
      const x = side === 0 ? 0 : side === 1 ? s.width - 1 : t;
      const y = side === 2 ? 0 : side === 3 ? s.height - 1 : t;
      if (s.terrain[idx(s, x, y)] || s.occ[idx(s, x, y)] >= 0) continue;
      const path = findPath(s, x, y, hall.x, hall.y, [], 12000);
      if (!path) continue;
      const real = a.role;
      a.role = { kind: 'settler' };
      a.x = x + 0.5;
      a.y = y + 0.5;
      a.path = path;
      a.phase = 'walk';
      a.visible = true;
      a.next = 'arrive-hall';
      a.carry = 'wood';
      (a as Agent & { realRole?: Role }).realRole = real;
      return true;
    }
    return false;
  }

  /** A merchant's cart rolls in from the map edge to the market and back. */
  private sendCart(s: GameState, market: Building): void {
    const door = doorTile(s, market);
    for (let tries = 0; tries < 20; tries++) {
      const side = Math.floor(Math.random() * 4);
      const t = Math.floor(Math.random() * s.width);
      const x = side === 0 ? 0 : side === 1 ? s.width - 1 : t;
      const y = side === 2 ? 0 : side === 3 ? s.height - 1 : t;
      if (s.terrain[idx(s, x, y)] || s.occ[idx(s, x, y)] >= 0) continue;
      const path = findPath(s, x, y, door.x, door.y, [market.id], 12000);
      if (!path) continue;
      const a = this.spawn(s, `cart:${market.id}:${this.serial}`, { kind: 'cart', id: market.id, leaving: false }, -1);
      a.x = x + 0.5;
      a.y = y + 0.5;
      a.path = path;
      a.phase = 'walk';
      a.visible = true;
      a.next = 'wander-done';
      a.carry = 'tools';
      a.edge = { x, y };
      this.agents.push(a);
      return;
    }
  }

  // ---------------------------------------------------------------- behaviour

  private walkTo(s: GameState, a: Agent, tx: number, ty: number, allow: number[], next: Agent['next']): void {
    const sx = Math.floor(a.x);
    const sy = Math.floor(a.y);
    const extra = [...allow];
    const occ = inBounds(s, sx, sy) ? s.occ[idx(s, sx, sy)] : -1;
    if (occ >= 0) extra.push(occ);
    const path = findPath(s, sx, sy, tx, ty, extra);
    a.next = next;
    a.visible = true;
    if (!path) {
      // Unreachable: just appear there.
      a.x = tx + 0.5;
      a.y = ty + 0.5;
      a.path = [];
    } else {
      a.path = path;
    }
    a.phase = 'walk';
  }

  /** Comes out of a building: appears at its door tile, fading in. */
  private exitAt(s: GameState, a: Agent, b: Building | null | undefined): void {
    if (a.visible || !b) return;
    const d = doorTile(s, b);
    a.x = d.x + 0.5;
    a.y = d.y + 0.5;
    a.fadeIn = 0;
  }

  private tick(s: GameState, a: Agent, dt: number): void {
    if (a.fadeIn < 1) a.fadeIn = Math.min(1, a.fadeIn + dt * 2);
    if (a.phase === 'walk') {
      const here = inBounds(s, Math.floor(a.x), Math.floor(a.y)) ? idx(s, Math.floor(a.x), Math.floor(a.y)) : 0;
      const road = s.road[here];
      let move = (a.role.kind === 'lord' && lordRides(s) ? 1.8 : 1) * dt * (road >= 3 ? COBBLE_SPEED * (road === 4 ? ROYAL_ROAD_PACE : 1) : road === 2 ? PAVED_SPEED : road ? ROAD_SPEED : s.trees[here] ? OFFROAD_SPEED / WOODS_SLOWDOWN : OFFROAD_SPEED) * (a.carry ? 0.85 : 1);
      while (move > 0 && a.path.length) {
        const tx = (a.path[0] % s.width) + 0.5;
        const ty = Math.floor(a.path[0] / s.width) + 0.5;
        const dx = tx - a.x;
        const dy = ty - a.y;
        const d = Math.hypot(dx, dy);
        if (d <= move) {
          a.x = tx;
          a.y = ty;
          move -= d;
          a.path.shift();
        } else {
          a.x += (dx / d) * move;
          a.y += (dy / d) * move;
          move = 0;
        }
        // Screen-space facing: +1 right, -1 left.
        if (Math.abs(dx - dy) > 0.01) a.dir = dx - dy > 0 ? 1 : -1;
      }
      a.step += dt * 11;
      if (!a.path.length) this.arrive(s, a);
      return;
    }
    a.timer -= dt;
    if (a.phase === 'act') a.step += dt * 6;
    if (a.phase === 'act' && a.act === 'dance' && a.ring) {
      // Hand in hand round the maypole.
      const r = a.ring;
      r.t += dt * 0.5;
      const nx = r.x + Math.cos(r.t) * r.r;
      const ny = r.y + Math.sin(r.t) * r.r;
      const sx = nx - a.x - (ny - a.y);
      if (Math.abs(sx) > 0.001) a.dir = sx > 0 ? 1 : -1;
      a.x = nx;
      a.y = ny;
    }
    if (a.timer <= 0) this.decide(s, a);
  }

  private arrive(_s: GameState, a: Agent): void {
    switch (a.next) {
      case 'enter-work':
      case 'enter-home':
        a.phase = 'inside';
        a.visible = false;
        a.carry = null;
        a.timer = 4 + Math.random() * 5;
        break;
      case 'act':
        a.phase = 'act';
        a.timer = LEISURE_ACTS.has(a.act) ? 6 + Math.random() * 8 : 4 + Math.random() * 4;
        // Into the boat, and out on the water a good while (the boat is drawn with them in it).
        if (a.act === 'boat') {
          a.visible = false;
          a.timer = 20 + Math.random() * 20;
        }
        // A hunter turns to the herd.
        if (a.act === 'hunt' && a.cast) {
          const sx = a.cast.x - a.cast.y - (a.x - a.y);
          if (Math.abs(sx) > 0.05) a.dir = sx > 0 ? 1 : -1;
        }
        // At a tree, rock or bush: step to its near side and face it, rather than stand in it.
        if (BESIDE_ACTS.has(a.act)) {
          const tx = Math.floor(a.x);
          const ty = Math.floor(a.y);
          if (Math.random() < 0.5) {
            a.x = tx + 0.92;
            a.y = ty + 0.55;
            a.dir = -1;
          } else {
            a.x = tx + 0.55;
            a.y = ty + 0.92;
            a.dir = 1;
          }
        }
        break;
      case 'fetch':
        // Loading up at the store.
        a.phase = 'pause';
        a.timer = 1 + Math.random();
        a.carry = a.want ?? null;
        break;
      case 'drop':
        a.phase = 'pause';
        a.timer = 1 + Math.random();
        a.carry = null;
        break;
      case 'return':
        a.phase = 'pause';
        a.timer = 0.5 + Math.random() * 2;
        break;
      case 'wander-done':
        a.phase = 'pause';
        a.timer = a.role.kind === 'cart' ? (a.role.leaving ? 0.2 : 10) : 1.5 + Math.random() * 4;
        break;
      case 'arrive-hall': {
        const real = (a as Agent & { realRole?: Role }).realRole;
        a.role = real ?? { kind: 'idle' };
        a.carry = null;
        a.phase = 'pause';
        a.timer = 1;
        break;
      }
    }
  }

  /** Chooses the next activity once the current one is finished. */
  private decide(s: GameState, a: Agent): void {
    const r = a.role;
    if (r.kind === 'settler') return;
    if (this.evening && (r.kind === 'work' || r.kind === 'build' || r.kind === 'idle' || r.kind === 'lord')) {
      // Evening: home to supper and bed. Those already in stay in; the fisher rows back first.
      const home = getBuilding(s, a.home);
      if (a.act === 'boat' && a.phase === 'act' && !a.visible) {
        a.visible = true;
        a.act = '';
      }
      if (!a.visible || !home) {
        a.phase = 'inside';
        a.visible = false;
        a.timer = 1.5 + Math.random() * 2;
        return;
      }
      a.carry = null;
      const d = doorTile(s, home);
      this.walkTo(s, a, d.x, d.y, [home.id], 'enter-home');
      return;
    }
    if (r.kind === 'cart') {
      if (r.leaving) {
        a.gone = true;
        return;
      }
      // Trading done: head back to where it came from.
      r.leaving = true;
      a.carry = 'gold';
      const e = a.edge ?? { x: 0, y: 0 };
      this.walkTo(s, a, e.x, e.y, [r.id], 'wander-done');
      return;
    }
    if (r.kind === 'idle') {
      this.decideIdle(s, a);
      return;
    }
    if (r.kind === 'guard') {
      this.patrol(s, a);
      return;
    }
    if (r.kind === 'lord') {
      this.lordsWalk(s, a);
      return;
    }
    if (r.kind === 'beast') {
      this.beastWork(s, a, r);
      return;
    }
    const b = getBuilding(s, r.id);
    if (!b) {
      a.role = { kind: 'idle' };
      this.decideIdle(s, a);
      return;
    }
    if (r.kind === 'build') {
      if (b.build >= 1 && !b.upgrading) {
        a.role = { kind: 'idle' };
        this.decideIdle(s, a);
        return;
      }
      // Haul materials from storage while the site still needs them.
      if (needsMaterials(b)) {
        if (a.carry) {
          this.goToSiteEdge(s, a, b, 'drop');
          return;
        }
        const store = nearestStore(s, b);
        const want = Object.keys(b.need!).find((k) => (b.need![k as ResourceId] ?? 0) > 0 && s.res[k as ResourceId] >= 1) as ResourceId | undefined;
        if (store && want) {
          this.exitIfInside(s, a);
          a.want = want;
          const d = doorTile(s, store);
          this.walkTo(s, a, d.x, d.y, [store.id], 'fetch');
          return;
        }
        // Nothing to carry yet: wait by the site.
        a.phase = 'pause';
        a.timer = 3;
        if (!a.visible) this.goToSiteEdge(s, a, b, 'wander-done');
        return;
      }
      // Walk to a spot beside the site, then hammer.
      if (a.phase === 'act' || a.next === 'act') {
        a.phase = 'act';
        a.act = 'hammer';
        a.timer = 2 + Math.random() * 3;
        a.next = 'act';
        // Shuffle around the site occasionally.
        if (Math.random() < 0.4) this.goToSiteEdge(s, a, b);
        return;
      }
      this.goToSiteEdge(s, a, b);
      return;
    }
    this.decideWork(s, a, b);
  }

  /**
   * A draught animal's day: out of its stall in the morning, then to work for
   * the building that bought it. The pack horse runs crates between the
   * trading post and the nearest store; the ox carts timber and stone from
   * the stores to the building sites its yard reaches. With nothing to do,
   * or hungry, it stands outside the stable; at dusk it goes in.
   */
  private beastWork(s: GameState, a: Agent, r: Extract<Role, { kind: 'beast' }>): void {
    const stable = stableFor(s, r.id) ?? getBuilding(s, a.home);
    const owner = getBuilding(s, r.id);
    if (!stable || !owner) return;
    a.home = stable.id;
    const sd = doorTile(s, stable);
    // Out of the stall: it steps from the stable door.
    if (a.phase === 'inside') {
      if (this.evening) {
        a.timer = 2 + Math.random() * 2;
        return;
      }
      this.exitAt(s, a, stable);
      a.visible = true;
    }
    if (this.evening) {
      a.carry = null;
      this.walkTo(s, a, sd.x, sd.y, [stable.id], 'enter-home');
      return;
    }
    const rest = () => {
      // Graze by the stable: a free tile just in front of it.
      a.carry = null;
      a.act = 'graze';
      const spot = besideFree(s, stable, r.id * 3);
      // Just out of the stall, it always walks clear of the door first.
      if (spot && Math.hypot(spot.x + 0.5 - a.x, spot.y + 0.5 - a.y) > 0.6) this.walkTo(s, a, spot.x, spot.y, [stable.id], 'act');
      else {
        a.phase = 'act';
        a.timer = 5 + Math.random() * 5;
      }
    };
    if (!beastWorks(owner) || owner.workers <= 0) {
      rest();
      return;
    }
    if (r.animal === 'horse') {
      // Loaded: on to the store (or back to the post); empty: to the post to load.
      const store = nearestStore(s, owner);
      const od = doorTile(s, owner);
      if (!store) {
        rest();
        return;
      }
      const std = doorTile(s, store);
      if (a.carry) {
        this.walkTo(s, a, std.x, std.y, [store.id, owner.id], 'drop');
      } else if (a.next === 'drop' && Math.random() < 0.5) {
        // Back to the post with goods from the stores, now and then a rest.
        a.want = 'crates';
        this.walkTo(s, a, od.x, od.y, [owner.id, store.id], 'fetch');
      } else if (Math.random() < 0.25) rest();
      else {
        a.want = 'crates';
        this.walkTo(s, a, od.x, od.y, [owner.id], 'fetch');
      }
      return;
    }
    // A woodcutters' ox drags logs from the trees being felled back to the lodge.
    if (owner.type === 'woodcutter') {
      const od = doorTile(s, owner);
      if (a.carry) {
        this.walkTo(s, a, od.x, od.y, [owner.id], 'drop');
        return;
      }
      const t = this.workTarget(s, owner);
      if (!t) {
        rest();
        return;
      }
      a.want = 'wood';
      this.walkTo(s, a, t.x, t.y, [owner.id], 'fetch');
      return;
    }
    // The ox: materials from the stores to the nearest site the yard serves.
    const site = constructionSites(s).find((o) => yardFor(s, o) === owner);
    if (!site) {
      rest();
      return;
    }
    if (a.carry) {
      this.goToSiteEdge(s, a, site, 'drop');
      a.act = '';
      return;
    }
    const store = nearestStore(s, site);
    if (!store) {
      rest();
      return;
    }
    const need = site.need ? (Object.keys(site.need).find((k) => (site.need![k as ResourceId] ?? 0) > 0) as ResourceId | undefined) : undefined;
    a.want = need ?? (Math.random() < 0.5 ? 'planks' : 'stone');
    const std = doorTile(s, store);
    this.walkTo(s, a, std.x, std.y, [store.id], 'fetch');
  }

  /** An agent resting inside a building steps out of its door first. */
  private exitIfInside(s: GameState, a: Agent): void {
    if (a.visible) return;
    const home = getBuilding(s, a.home);
    if (home) this.exitAt(s, a, home);
    else a.fadeIn = 0;
  }

  private goToSiteEdge(s: GameState, a: Agent, b: Building, next: Agent['next'] = 'act'): void {
    const spots: [number, number][] = [];
    for (let x = b.x - 1; x <= b.x + b.w; x++) {
      for (let y = b.y - 1; y <= b.y + b.h; y++) {
        const inside = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
        if (inside || !inBounds(s, x, y)) continue;
        const i = idx(s, x, y);
        if (s.terrain[i] || s.occ[i] >= 0) continue;
        spots.push([x, y]);
      }
    }
    if (!spots.length) return;
    const [x, y] = spots[Math.floor(Math.random() * spots.length)];
    // Most builders hammer; some saw planks to length on a sawhorse.
    a.act = Math.random() < 0.3 ? 'saw' : 'hammer';
    this.exitIfInside(s, a);
    this.walkTo(s, a, x, y, [], next);
  }

  /** Guards pace between free tiles in front of the manor. */
  /**
   * The lord's rounds: out of the manor to look in on a workplace, a home
   * or the market, a pause there, then on to the next or back home.
   */
  private lordsWalk(s: GameState, a: Agent): void {
    const manor = getBuilding(s, a.home);
    if (!manor) return;
    const wasIn = a.phase === 'inside';
    if (wasIn) this.exitAt(s, a, manor);
    a.carry = null;
    if (!wasIn && Math.random() < 0.3) {
      const d = doorTile(s, manor);
      this.walkTo(s, a, d.x, d.y, [manor.id], 'enter-home');
      return;
    }
    const c = bCenter(manor);
    const sights = s.buildings.filter((b) => b.build >= 1 && b.id !== manor.id && b.type !== 'wall' && Math.hypot(bCenter(b).x - c.x, bCenter(b).y - c.y) < 22);
    const b = sights[Math.floor(Math.random() * sights.length)];
    if (!b) {
      this.patrol(s, a);
      return;
    }
    const d = doorTile(s, b);
    this.walkTo(s, a, d.x, d.y, [b.id], 'wander-done');
  }

  private patrol(s: GameState, a: Agent): void {
    const door = this.hallDoor(s);
    if (a.phase === 'inside') {
      a.x = door.x + 0.5;
      a.y = door.y + 0.5;
    }
    a.carry = null;
    for (let tries = 0; tries < 8; tries++) {
      const x = door.x + Math.floor(Math.random() * 7) - 3;
      const y = door.y + Math.floor(Math.random() * 7) - 3;
      if (!inBounds(s, x, y)) continue;
      const i = idx(s, x, y);
      if (s.occ[i] >= 0 || s.terrain[i]) continue;
      this.walkTo(s, a, x, y, [], 'wander-done');
      return;
    }
    a.phase = 'pause';
    a.timer = 2;
  }

  private decideIdle(s: GameState, a: Agent): void {
    const home = getBuilding(s, a.home);
    if (a.phase === 'inside') {
      // Step out for a stroll along nearby roads.
      const c = home ? bCenter(home) : { x: a.x, y: a.y };
      const roads: number[] = [];
      forTilesInRadius(s, c, 7, (i) => {
        if (s.road[i]) roads.push(i);
      });
      // Sometimes visit a gathering place: market, well, church or maypole.
      const spots = s.buildings.filter((b) => GATHERING.has(b.type) && b.build >= 1);
      if (spots.length && Math.random() < 0.35) {
        const near = spots.filter((b) => {
          const bc = bCenter(b);
          return Math.hypot(bc.x - c.x, bc.y - c.y) < 18;
        });
        const spot = near[Math.floor(Math.random() * near.length)];
        if (spot) {
          this.exitAt(s, a, home);
          a.carry = null;
          // Linger on a free tile right beside it.
          const around: [number, number][] = [];
          for (let x = spot.x - 1; x <= spot.x + spot.w; x++) {
            for (let y = spot.y - 1; y <= spot.y + spot.h; y++) {
              if (!inBounds(s, x, y)) continue;
              const i = idx(s, x, y);
              if (s.occ[i] < 0 && !s.terrain[i]) around.push([x, y]);
            }
          }
          const [tx, ty] = around.length ? around[Math.floor(Math.random() * around.length)] : [spot.x, spot.y];
          // Dance round the maypole, pray at the church, raise a mug at the tavern, gossip at the well.
          a.act = LEISURE[spot.type] ?? 'chat';
          a.ring = undefined;
          if (a.act === 'dance') {
            const sc = bCenter(spot);
            const r = Math.max(spot.w, spot.h) / 2 + 0.6;
            // Dance only on open ground: next to another building they would be drawn wrongly.
            if (ringClear(s, spot, sc, r)) a.ring = { x: sc.x, y: sc.y, r, t: Math.atan2(ty + 0.5 - sc.y, tx + 0.5 - sc.x) };
            else a.act = 'chat';
          }
          this.walkTo(s, a, tx, ty, [], 'act');
          return;
        }
      }
      if (roads.length && Math.random() < 0.7) {
        const t = roads[Math.floor(Math.random() * roads.length)];
        this.exitAt(s, a, home);
        a.carry = null;
        this.walkTo(s, a, t % s.width, Math.floor(t / s.width), [], 'wander-done');
      } else {
        a.timer = 3 + Math.random() * 4;
      }
      return;
    }
    if (home) {
      const d = doorTile(s, home);
      this.walkTo(s, a, d.x, d.y, [home.id], 'enter-home');
    } else {
      a.phase = 'pause';
      a.timer = 3;
    }
  }

  /** Storehouse and granary workers fetch goods from the workplaces' yards. */
  private decideHaul(s: GameState, a: Agent, b: Building): void {
    const door = doorTile(s, b);
    if (a.carry) {
      this.walkTo(s, a, door.x, door.y, [b.id], 'enter-work');
      return;
    }
    const kind = b.type === 'granary' ? 'food' : 'materials';
    const c = bCenter(b);
    const sources: { w: Building; id: ResourceId; score: number }[] = [];
    for (const w of s.buildings) {
      if (!w.stock) continue;
      for (const k in w.stock) {
        const id = k as ResourceId;
        if (RESOURCE_STORAGE[id] !== kind || (w.stock[id] ?? 0) < 1) continue;
        const wc = bCenter(w);
        sources.push({ w, id, score: (w.stock[id] ?? 0) / (4 + Math.hypot(wc.x - c.x, wc.y - c.y)) });
      }
    }
    if (!sources.length) {
      a.phase = 'inside';
      a.visible = false;
      a.timer = 3 + Math.random() * 3;
      return;
    }
    // Mostly the fullest, nearest yard; sometimes another, so haulers spread out.
    sources.sort((p, q) => q.score - p.score);
    const pick = sources[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * Math.min(4, sources.length))];
    this.exitAt(s, a, b);
    a.want = pick.id;
    const wd = doorTile(s, pick.w);
    this.walkTo(s, a, wd.x, wd.y, [pick.w.id, b.id], 'fetch');
  }

  private decideWork(s: GameState, a: Agent, b: Building): void {
    if (b.type === 'storehouse' || b.type === 'granary') {
      this.decideHaul(s, a, b);
      return;
    }
    const d = BUILDINGS[b.type];
    const door = doorTile(s, b);
    // After working outside, carry goods back (a fisher steps ashore from the boat).
    if (a.phase === 'act') {
      if (a.act === 'boat') a.visible = true;
      a.carry = LEISURE_ACTS.has(a.act) ? null : goodCarried(s, b);
      this.walkTo(s, a, door.x, door.y, [b.id], 'enter-work');
      return;
    }
    if (a.phase === 'pause') {
      // Arrived somewhere (e.g. delivered goods); head back to work.
      this.walkTo(s, a, door.x, door.y, [b.id], 'enter-work');
      return;
    }
    // Inside the workplace: decide what to do next. Now and then the
    // household's errands call: a basket from the market, a pail from the well.
    if (Math.random() < 0.07) {
      const errand = this.errandStop(s, a);
      if (errand) {
        this.exitAt(s, a, b);
        a.carry = null;
        a.want = errand.carry;
        const ed = doorTile(s, errand.at);
        this.walkTo(s, a, ed.x, ed.y, [b.id, errand.at.id], 'fetch');
        return;
      }
    }
    // A fisher's first hand takes the boat out: rows from the bank and fishes from it.
    if (b.type === 'fisher' && a.key.endsWith('#0') && !isWinter(s.day) && boatSpot(s, b) >= 0) {
      const land = landingFor(s, boatSpot(s, b));
      if (land) {
        this.exitAt(s, a, b);
        a.act = 'boat';
        a.carry = null;
        this.walkTo(s, a, land.x, land.y, [b.id], 'act');
        return;
      }
    }
    const target = this.workTarget(s, b);
    if (a.home !== -1 && Math.random() < 0.08) {
      const home = getBuilding(s, a.home);
      if (home) {
        this.exitAt(s, a, b);
        a.carry = null;
        const hd = doorTile(s, home);
        this.walkTo(s, a, hd.x, hd.y, [home.id], 'enter-home');
        a.role = { kind: 'work', id: b.id };
        return;
      }
    }
    if (target) {
      this.exitAt(s, a, b);
      a.act = target.act;
      // A fisher's float, or the herd a hunter stalks.
      a.cast = target.act === 'fish' ? castFrom(s, target.x, target.y) : target.aim;
      a.carry = null;
      this.walkTo(s, a, target.x, target.y, [b.id], 'act');
      return;
    }
    // Workshops send someone to the stores for what they work: timber for
    // the sawpit, flour for the bakery. (Haulers bring nothing in.)
    const inputs = Object.keys(chooseRecipe(s, b)?.inputs ?? d.inputs ?? {}) as ResourceId[];
    const want = inputs.find((k) => s.res[k] >= 1);
    if (want && b.status !== 'Paused' && Math.random() < 0.35) {
      const store = nearestStore(s, b);
      if (store) {
        this.exitAt(s, a, b);
        a.carry = null;
        a.want = want;
        const sd = doorTile(s, store);
        this.walkTo(s, a, sd.x, sd.y, [b.id, store.id], 'fetch');
        return;
      }
    }
    // Some trades are seen at work in the yard before the door.
    const yardAct = YARD_WORK[b.trade ?? b.type];
    if (yardAct && Math.random() < 0.4) {
      const spot = besideFree(s, b, a.key.length + b.id);
      if (spot) {
        this.exitAt(s, a, b);
        a.act = yardAct[Math.floor(Math.random() * yardAct.length)];
        a.carry = null;
        this.walkTo(s, a, spot.x, spot.y, [b.id], 'act');
        return;
      }
    }
    // Where haulers come for the goods, workers leave them in the yard.
    if (!b.hauled && d.outputs && Object.keys(d.outputs).length && Math.random() < 0.5 && b.type !== 'market') {
      // Deliver goods to the manor hall or a storehouse.
      const store = nearestStore(s, b);
      if (store) {
        this.exitAt(s, a, b);
        a.carry = goodCarried(s, b);
        const sd = doorTile(s, store);
        this.walkTo(s, a, sd.x, sd.y, [b.id, store.id], 'return');
        return;
      }
    }
    a.phase = 'inside';
    a.visible = false;
    a.timer = 3 + Math.random() * 4;
  }

  /** The nearest market or well to a villager's home, for an errand. */
  private errandStop(s: GameState, a: Agent): { at: Building; carry: ResourceId } | null {
    const home = getBuilding(s, a.home);
    if (!home) return null;
    const type = Math.random() < 0.5 ? 'market' : 'well';
    const hc = bCenter(home);
    let best: Building | null = null;
    let bd = Infinity;
    for (const o of s.buildings) {
      if (o.type !== type || o.build < 1) continue;
      const oc = bCenter(o);
      const d = Math.hypot(oc.x - hc.x, oc.y - hc.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best ? { at: best, carry: type === 'market' ? 'vegetables' : 'milk' } : null;
  }


  private workTarget(s: GameState, b: Building): { x: number; y: number; act: string; aim?: { x: number; y: number } } | null {
    const d = BUILDINGS[b.type];
    const c = bCenter(b);
    // Gatherers go to the nearest of what they gather, however far; others work their own area.
    const reach = GATHERERS.has(b.type) ? GATHER_REACH : d.radius;
    const pick = (pred: (i: number) => boolean, act: string) => {
      const cands: [number, number][] = [];
      forTilesInRadius(s, c, reach, (i, _x, _y, dist) => {
        if (pred(i)) cands.push([i, dist]);
      });
      if (!cands.length) return null;
      if (GATHERERS.has(b.type)) cands.sort((p, q) => p[1] - q[1]);
      const t = cands[Math.floor(Math.random() * (GATHERERS.has(b.type) ? Math.min(6, cands.length) : cands.length))][0];
      return { x: t % s.width, y: Math.floor(t / s.width), act };
    };
    const nearHerd = (hx: number, hy: number, act: string) => {
      for (let tries = 0; tries < 12; tries++) {
        const x = Math.floor(hx + (Math.random() * 2 - 1) * 2.5);
        const y = Math.floor(hy + (Math.random() * 2 - 1) * 2.5);
        if (inBounds(s, x, y) && s.terrain[idx(s, x, y)] === 0 && s.occ[idx(s, x, y)] < 0) return { x, y, act, aim: { x: hx, y: hy } };
      }
      return null;
    };
    const open = (i: number) => s.terrain[i] === 0 && s.occ[i] < 0;
    switch (b.type) {
      case 'woodcutter':
        return pick((i) => s.trees[i] > 0, 'chop');
      case 'quarry':
        return pick((i) => s.rock[i] > 0, 'dig');
      case 'mine':
        return pick((i) => s.ore[i] > 0, 'dig');
      case 'forager': {
        if (isWinter(s.day)) return null;
        return pick((i) => s.berries[i] > 0, 'pick');
      }
      case 'forester':
        return pick((i) => open(i) && !s.road[i] && s.trees[i] < 4, 'plant');
      case 'hunter': {
        const h = nearestHerd(s, b);
        return h ? nearHerd(h.x, h.y, 'hunt') : null;
      }
      case 'fisher':
      case 'claypit':
      case 'sandpit': {
        // A dry tile next to water.
        return pick((i) => {
          if (!open(i)) return false;
          const x = i % s.width;
          const y = Math.floor(i / s.width);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            if (inBounds(s, x + dx, y + dy) && s.terrain[idx(s, x + dx, y + dy)] === 1) return true;
          }
          return false;
        }, b.type === 'fisher' ? 'fish' : 'shovel');
      }
      case 'farm':
      case 'byre':
      case 'orchardist': {
        const m = Math.floor(s.day / 10) % 12;
        if (b.type === 'farm' && m >= 9) return null;
        // Work out in one of the fields, pastures or orchards this place tends.
        const zones = s.buildings.filter((z) => z.owner === b.id);
        if (!zones.length) return null;
        const z = zones[Math.floor(Math.random() * zones.length)];
        // Orchard keepers hoe round the trees in spring and summer, and reach up to pick in autumn.
        const act = b.type === 'farm' ? (m >= 6 ? 'scythe' : 'hoe') : b.type === 'orchardist' ? (m >= 7 ? 'reach' : 'hoe') : 'herd';
        return { x: z.x + Math.floor(Math.random() * z.w), y: z.y + Math.floor(Math.random() * z.h), act };
      }
      default:
        return null;
    }
  }
}

/** The draught stable nearest the building an animal works for. */
function stableFor(s: GameState, id: number): Building | null {
  const b = getBuilding(s, id);
  if (!b) return null;
  const c = bCenter(b);
  let best: Building | null = null;
  let bd = Infinity;
  for (const o of s.buildings) {
    if (o.type !== 'draughtstable' || o.build < 1) continue;
    const oc = bCenter(o);
    const d = Math.hypot(oc.x - c.x, oc.y - c.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** A free tile just in front of a building (its lower edges on screen), for an animal to stand on. */
function besideFree(s: GameState, b: Building, seed = 0): { x: number; y: number } | null {
  const spots: { x: number; y: number }[] = [];
  for (let r = 0; r < 2; r++) {
    for (let x = b.x; x <= b.x + b.w + r; x++) spots.push({ x, y: b.y + b.h + r });
    for (let y = b.y; y < b.y + b.h + r; y++) spots.push({ x: b.x + b.w + r, y });
  }
  const free = spots.filter((p) => inBounds(s, p.x, p.y) && !s.terrain[idx(s, p.x, p.y)] && s.occ[idx(s, p.x, p.y)] < 0 && !s.road[idx(s, p.x, p.y)]);
  if (!free.length) return null;
  // Each animal keeps mostly to its own patch, so two do not stand on one spot.
  return free[(seed + (Math.random() < 0.7 ? 0 : Math.floor(Math.random() * 3))) % free.length];
}

function nearestStore(s: GameState, b: Building): Building | null {
  const c = bCenter(b);
  let best: Building | null = null;
  let bestD = Infinity;
  for (const o of s.buildings) {
    if (!STORAGE_CAPACITY[o.type] || o.build < 1) continue;
    const oc = bCenter(o);
    const d = Math.hypot(oc.x - c.x, oc.y - c.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** What a worker carries home: the product the workplace is making now. */
function goodCarried(s: GameState, b: Building): ResourceId | null {
  if (b.type === 'byre') return ({ sheep: 'wool', cattle: 'milk', pigs: 'pork' } as Record<string, ResourceId>)[b.recipe ?? 'sheep'];
  if (b.type === 'orchardist') {
    const o = s.buildings.find((z) => z.owner === b.id);
    return ((o?.recipe ?? 'apples') as ResourceId) ?? 'apples';
  }
  if (b.type === 'farm') {
    const f = s.buildings.find((z) => z.owner === b.id);
    return ({ vegetables: 'vegetables', wheat: 'grain', barley: 'barley', flax: 'flax', woad: 'woad' } as Record<string, ResourceId>)[f?.recipe ?? 'vegetables'] ?? 'vegetables';
  }
  const r = chooseRecipe(s, b, true);
  if (r) return (Object.keys(r.outputs)[0] as ResourceId) ?? null;
  return carryFor(b.trade ?? b.type);
}

function carryFor(type: string): ResourceId | null {
  switch (type) {
    case 'woodcutter':
      return 'wood';
    case 'quarry':
      return 'stone';
    case 'mine':
      return 'ore';
    case 'forager':
      return 'berries';
    case 'hunter':
      return 'meat';
    case 'fisher':
      return 'fish';
    case 'farm':
      return 'grain';
    case 'byre':
      return 'wool';
    case 'orchardist':
      return 'apples';
    case 'bakery':
      return 'bread';
    case 'sawmill':
      return 'planks';
    case 'smithy':
      return 'tools';
    default: {
      const out = Object.keys(BUILDINGS[type as keyof typeof BUILDINGS]?.outputs ?? {})[0];
      return (out as ResourceId) ?? null;
    }
  }
}

/**
 * Where a fisher standing on a bank tile casts: out over the water beside
 * it, toward whichever side has the most open water.
 */
function castFrom(s: GameState, x: number, y: number): { x: number; y: number } | undefined {
  const water = (xx: number, yy: number) => inBounds(s, xx, yy) && s.terrain[idx(s, xx, yy)] === 1;
  let best: { x: number; y: number } | undefined;
  let most = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ]) {
    if (!water(x + dx, y + dy)) continue;
    // How far the water runs that way.
    let n = 1;
    while (n < 3 && water(x + dx * (n + 1), y + dy * (n + 1))) n++;
    if (n > most) {
      most = n;
      const reach = Math.min(n, 2) * 0.75 + 0.35;
      best = { x: x + 0.5 + dx * reach, y: y + 0.5 + dy * reach };
    }
  }
  return best;
}
