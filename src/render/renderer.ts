import { BUILDINGS, DAYS_PER_MONTH, DAYS_PER_YEAR, RESOURCE_STORAGE, STORAGE_CAPACITY, type StorageKind } from '../game/data';
import { MANOR_SIZE, marketStalls, upgradeBlocker } from '../game/levels';
import { hasCharter } from '../game/charters';
import { ANIMAL_KINDS, HOME_TRADES, animalsOf, deliveredTo, hasProblem, herdTotal, monthOf, nearestShoal, orchardMaturity, seasonOf, seatOf, storageCap, stored } from '../game/sim';
import type { Building, BuildingType, GameState, ResourceId, Season } from '../game/types';
import { idx, inBounds } from '../game/world';
import type { Agent } from './agents';
import { ICONS } from '../ui/icons';
import type { Animal } from './wildlife';
import { Pen, TH, TW, iso, mix, shade } from './pen';
import { mulberry32 } from '../game/rng';
import { DEFAULT_HERALDRY, HERALDRY, heraldryKey } from './heraldry';
import {
  oreHeap,
  type Sprite,
  type TreeKind,
  bridgeTile,
  bushSprite,
  makeSprite,
  drawSails,
  buildingSprite,
  grassTile,
  roadTile,
  fruitTreeSprite,
  drawSheep,
  YARD_CODES,
  HOUSE_FORMS,
  homeWindow,
  pavedTile,
  cobbleTile,
  rockSprite,
  bogSprite,
  stallSprite,
  treeSprite,
  waterTile,
} from './sprites';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Ghost {
  type: BuildingType;
  x: number;
  y: number;
  ok: boolean;
}

export interface Overlay {
  ghost?: Ghost;
  /** Tiles to preview for road building / demolition. */
  tiles?: { x: number; y: number; ok: boolean }[];
  tileColor?: 'road' | 'remove' | 'grove';
  /** The protect-wood tool is in hand: show the protected woods clearly. */
  groves?: boolean;
  selected?: number;
  hover?: { x: number; y: number };
  /** Range circle in tile coordinates. */
  range?: { cx: number; cy: number; r: number; highlight?: (i: number) => boolean };
  /** The villager selected on the map (their key). */
  agent?: string;
  /** Reach of every well (or market, tavern, church) and which homes it covers. */
  coverage?: { circles: { cx: number; cy: number; r: number }[]; homes: Map<number, boolean> };
  /** A farm or field is being placed: tint the land by how fertile it is. */
  fertility?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** Steam (whiter, quicker to vanish) rather than smoke. */
  steam?: boolean;
}

const GRASS_VARIANTS = 8;
const CHUNK = 16;
const TREE_VARIANTS = 6;

export class Renderer {
  ctx: CanvasRenderingContext2D;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  dpr = 1;
  width = 0;
  height = 0;
  private cache = new Map<string, Sprite>();
  private particles: Particle[] = [];
  private smokeTimer = 0;
  private boost = new Int32Array(0);
  private buckets: number[][] = [];
  time = 0;
  /** Show the little problem markers over buildings. */
  showMarkers = true;
  /** Set to an object to collect per-section render timings (debugging). */
  prof: Record<string, number> | null = null;
  private profT = 0;

  private mark(k: string): void {
    if (!this.prof) return;
    const n = performance.now();
    this.prof[k] = (this.prof[k] ?? 0) + n - this.profT;
    this.profT = n;
  }

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  // ---------------------------------------------------------------- camera

  centerOn(tx: number, ty: number): void {
    const [x, y] = iso(tx, ty);
    this.cam.x = x;
    this.cam.y = y;
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.width / 2) / this.cam.zoom + this.cam.x, (sy - this.height / 2) / this.cam.zoom + this.cam.y];
  }

  /** Fractional tile coordinates under a screen point. */
  screenToTile(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const a = wx / (TW / 2);
    const b = wy / (TH / 2);
    return [(a + b) / 2, (b - a) / 2];
  }

  tileToScreen(tx: number, ty: number, z = 0): [number, number] {
    const [wx, wy] = iso(tx, ty, z);
    return [(wx - this.cam.x) * this.cam.zoom + this.width / 2, (wy - this.cam.y) * this.cam.zoom + this.height / 2];
  }

  clampCamera(s: GameState): void {
    // Keep the centre of the view over the map's diamond, not its empty corners.
    const u = this.cam.x / (TW / 2);
    const v = this.cam.y / (TH / 2);
    const tx = Math.max(0, Math.min(s.width, (u + v) / 2));
    const ty = Math.max(0, Math.min(s.height, (v - u) / 2));
    [this.cam.x, this.cam.y] = iso(tx, ty);
  }

  // ---------------------------------------------------------------- sprites

  private sprite(key: string, make: () => Sprite): Sprite {
    let sp = this.cache.get(key);
    if (!sp) {
      sp = make();
      this.cache.set(key, sp);
    }
    return sp;
  }

  buildingSprite(type: BuildingType, level: number, season: Season, variant = 0): Sprite {
    const d = BUILDINGS[type];
    // The manor flies the lord's arms: a new design means a new picture.
    const arms = type === 'townhall' ? `:${heraldryKey()}` : '';
    // The manor's grounds grow with it.
    const size = type === 'townhall' ? (MANOR_SIZE[level] ?? d.w) : 0;
    return this.sprite(`b:${type}:${level}:${season}:${variant}${arms}`, () => buildingSprite(type, size || d.w, size || d.h, level, season, variant));
  }

  private lodCache = [new WeakMap<HTMLCanvasElement, HTMLCanvasElement>(), new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()];

  /** Reduced-resolution copies of sprite canvases, used when zoomed out. */
  private lod(cv: HTMLCanvasElement): HTMLCanvasElement {
    const scale = this.cam.zoom * this.dpr;
    // Full detail while frames are fast; the lighter copies only when drawing gets slow.
    if (scale > (this.light ? 1.2 : 0.95)) return cv;
    const level = scale > 0.48 ? 0 : 1;
    const cache = this.lodCache[level];
    let small = cache.get(cv);
    if (!small) {
      const src = level === 0 ? cv : this.lodAt(cv, 0);
      small = document.createElement('canvas');
      small.width = Math.max(1, src.width >> 1);
      small.height = Math.max(1, src.height >> 1);
      const g = small.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, small.width, small.height);
      cache.set(cv, small);
    }
    return small;
  }

  private lodAt(cv: HTMLCanvasElement, level: number): HTMLCanvasElement {
    let small = this.lodCache[level].get(cv);
    if (!small) {
      small = document.createElement('canvas');
      small.width = Math.max(1, cv.width >> 1);
      small.height = Math.max(1, cv.height >> 1);
      const g = small.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(cv, 0, 0, small.width, small.height);
      this.lodCache[level].set(cv, small);
    }
    return small;
  }

  /** Drawing with the lighter sprite copies because frames were slow. */
  light = false;
  private renderMs = 0;

  /** Keeps a running average of render time and switches light mode with some slack. */
  private noteRenderTime(ms: number): void {
    this.renderMs = this.renderMs * 0.95 + ms * 0.05;
    if (!this.light && this.renderMs > 14) this.light = true;
    else if (this.light && this.renderMs < 6) this.light = false;
  }

  private blit(sp: Sprite, wx: number, wy: number, alpha = 1, scale = 1): void {
    const c = this.ctx;
    if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(this.lod(sp.canvas), wx - sp.ax * scale, wy - sp.ay * scale, sp.w * scale, sp.h * scale);
    if (alpha !== 1) c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- main

  render(s: GameState, agents: Agent[], ov: Overlay, dt: number, animals: Animal[] = []): void {
    const started = performance.now();
    try {
      this.renderFrame(s, agents, ov, dt, animals);
    } finally {
      this.noteRenderTime(performance.now() - started);
    }
  }

  private coverageHomes: Map<number, boolean> | null = null;
  private selectedAgent: string | null = null;
  /** Buildings by id, rebuilt each frame (walls look up their neighbours). */
  private byId = new Map<number, Building>();

  private renderFrame(s: GameState, agents: Agent[], ov: Overlay, dt: number, animals: Animal[]): void {
    this.time += dt;
    this.coverageHomes = ov.coverage?.homes ?? null;
    this.selectedAgent = ov.agent ?? null;
    this.byId.clear();
    for (const b of s.buildings) this.byId.set(b.id, b);
    const c = this.ctx;
    const season = seasonOf(s.day);
    const z = this.cam.zoom;
    HERALDRY.current = s.heraldry ?? DEFAULT_HERALDRY;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = season === 3 ? '#9fb0b8' : '#5f7d4a';
    c.fillRect(0, 0, this.width, this.height);
    c.setTransform(
      this.dpr * z,
      0,
      0,
      this.dpr * z,
      this.dpr * (this.width / 2 - this.cam.x * z),
      this.dpr * (this.height / 2 - this.cam.y * z),
    );
    c.imageSmoothingEnabled = true;

    // Visible world rectangle with margins for tall sprites.
    const [vx0, vy0] = this.screenToWorld(-80, -40);
    const [vx1, vy1] = this.screenToWorld(this.width + 80, this.height + 200);
    const visible = (wx: number, wy: number) => wx > vx0 && wx < vx1 && wy > vy0 && wy < vy1;

    const W = s.width;
    const H = s.height;

    this.profT = performance.now();
    // ---- ground (cached in chunks; terrain never changes, only seasons)
    const gs = z * this.dpr > 1.25 ? 2 : z * this.dpr > 0.6 ? 1 : 0.5;
    const cw = Math.ceil(W / CHUNK);
    const ch = Math.ceil(H / CHUNK);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const x0 = cx * CHUNK;
        const y0 = cy * CHUNK;
        const left = (x0 - y0 - CHUNK) * (TW / 2);
        const right = (x0 + CHUNK - y0) * (TW / 2);
        const top = (x0 + y0) * (TH / 2);
        const bottom = (x0 + y0 + CHUNK * 2) * (TH / 2);
        if (right < vx0 || left > vx1 || bottom < vy0 || top > vy1) continue;
        const chunk = this.groundChunk(s, cx, cy, monthOf(s.day), gs);
        c.drawImage(chunk, left - 4, top - 4, right - left + 8, bottom - top + 8);
      }
    }
    this.mark('ground');
    this.drawWaterShimmer(s, visible);
    this.drawFields(s, season, ov.selected);
    this.drawFootpaths(s, agents, season, dt, visible);
    // Roads on top of ground: all edges first so joints blend.
    for (const layer of ['edge', 'fill'] as const) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!s.road[i]) continue;
          const [wx, wy] = iso(x, y);
          if (!visible(wx, wy)) continue;
          const mask = this.roadMask(s, x, y);
          const sp =
            s.terrain[i] === 1
              ? this.sprite(`br:${season}:${mask}:${layer}`, () => bridgeTile(season, mask, layer))
              : s.road[i] === 3
                ? this.sprite(`rc:${season}:${mask}:${layer}`, () => cobbleTile(season, mask, layer))
              : s.road[i] === 2
                ? this.sprite(`rp:${season}:${mask}:${layer}`, () => pavedTile(season, mask, layer))
                : this.sprite(`r:${season}:${mask}:${layer}`, () => roadTile(season, mask, layer));
          this.blit(sp, wx, wy);
        }
      }
    }

    this.mark('shimmer+fields+roads');
    this.drawGroundOverlays(s, ov);
    this.mark('overlays');

    // ---- objects, back to front
    this.computeBoost(s);
    const nb = W + H + 4;
    if (this.buckets.length !== nb) this.buckets = Array.from({ length: nb }, () => []);
    for (const b of this.buckets) b.length = 0;
    this.orchardTiles.clear();
    this.stallTiles.clear();
    s.buildings.forEach((b, bi) => {
      if (b.type === 'market') {
        // Stalls on every other tile, spread evenly over the square.
        const slots = marketStalls(b);
        const cands: number[] = [];
        for (let y = b.y; y < b.y + b.h; y += 2) for (let x = b.x; x < b.x + b.w; x += 2) cands.push(y * W + x);
        for (let k = 0; k < Math.min(slots, cands.length); k++) {
          const i = cands[Math.floor(((k + 0.5) * cands.length) / slots)];
          const x = i % W;
          const y = (i / W) | 0;
          this.stallTiles.set(i, { b, k, open: k < b.workers });
          const [wx, wy] = iso(x, y);
          if (visible(wx, wy)) this.buckets[Math.max(x + y, this.boost[i])].push(i * 4);
        }
        return;
      }
      if (BUILDINGS[b.type].zone) {
        if (b.type === 'orchard') {
          for (let y = b.y; y < b.y + b.h; y++) {
            for (let x = b.x; x < b.x + b.w; x++) {
              const [wx, wy] = iso(x, y);
              if (!visible(wx, wy)) continue;
              this.orchardTiles.set(y * W + x, b);
              this.buckets[Math.max(x + y, this.boost[y * W + x])].push((y * W + x) * 4);
            }
          }
        }
        return;
      }
      const [wx, wy] = iso(b.x + b.w / 2, b.y + b.h / 2);
      if (!visible(wx, wy + 60) && !visible(wx, wy - 100)) return;
      this.buckets[this.buildingDepth(s, b)].push(bi * 4 + 1);
    });
    for (let d = 0; d < W + H - 1; d++) {
      for (let x = Math.max(0, d - H + 1); x <= Math.min(W - 1, d); x++) {
        const y = d - x;
        const i = y * W + x;
        if (!s.trees[i] && !s.rock[i] && !s.ore[i] && !s.berriesMax[i] && !s.stumps?.[i]) continue;
        const [wx, wy] = iso(x, y);
        if (!visible(wx, wy)) continue;
        this.buckets[Math.max(d, this.boost[i])].push(i * 4);
      }
    }
    this.festTile = this.light ? -1 : this.festivalTile(s);
    if (this.festTile >= 0) {
      const [wx, wy] = iso((this.festTile % W) + 0.5, ((this.festTile / W) | 0) + 0.5);
      if (visible(wx, wy)) this.buckets[Math.max(((this.festTile % W) + ((this.festTile / W) | 0)), this.boost[this.festTile])].push(this.festTile * 4);
    }
    agents.forEach((a, ai) => {
      if (!a.visible) return;
      const tx = Math.floor(a.x);
      const ty = Math.floor(a.y);
      if (!inBounds(s, tx, ty)) return;
      const [wx, wy] = iso(a.x, a.y);
      if (!visible(wx, wy)) return;
      const d = Math.max(tx + ty, this.boost[ty * W + tx]);
      this.buckets[Math.min(nb - 1, d)].push(ai * 4 + 2);
    });
    this.mark('bucketing');
    animals.forEach((a, ai) => {
      const tx = Math.floor(a.x);
      const ty = Math.floor(a.y);
      if (!inBounds(s, tx, ty)) return;
      const [wx, wy] = iso(a.x, a.y);
      if (!visible(wx, wy)) return;
      const d = Math.max(tx + ty, this.boost[ty * W + tx]);
      this.buckets[Math.min(nb - 1, d)].push(ai * 4 + 3);
    });
    this.drawRoadPlan(s, visible);
    if (!this.light) this.drawPuddles(s, season, dt, visible);
    if (!this.light && season !== 3) {
      this.drawDucks(s, visible);
      this.drawShoals(s, visible);
      this.drawBoats(s, visible);
      this.drawMist(s, season, visible);
    }
    for (const bucket of this.buckets) {
      for (const code of bucket) {
        const kind = code & 3;
        const n = code >> 2;
        if (kind === 0) this.drawTileObjects(s, n, season);
        else if (kind === 1) this.drawBuilding(s, s.buildings[n], season, ov.selected === s.buildings[n].id);
        else if (kind === 2) this.drawAgent(agents[n]);
        else this.drawAnimal(animals[n], season);
      }
    }

    if (ov.ghost) this.drawGhost(s, ov.ghost, season);

    this.mark('objects');
    // ---- particles (chimney smoke)
    this.updateSmoke(s, dt, season);
    for (const p of this.particles) {
      const t = p.life / p.max;
      c.fillStyle = p.steam ? `rgba(250,250,250,${0.5 * (1 - t)})` : `rgba(225,225,225,${0.35 * (1 - t)})`;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (1 + t * 1.6), 0, Math.PI * 2);
      c.fill();
    }

    this.drawSparks();
    this.drawSky(s, season, dt);
    if (!this.light) this.drawWeather(s, season, dt);
    else this.snow = [];
    this.drawAtmosphere(season, s.day);
    this.drawNightLights();
    this.mark('effects');
  }

  // ---------------------------------------------------------------- ground helpers

  private chunks = new Map<string, HTMLCanvasElement>();
  private chunkSeed = -1;

  private groundChunk(s: GameState, cx: number, cy: number, month: number, scale: number): HTMLCanvasElement {
    const season = Math.floor(month / 3) as Season;
    if (this.chunkSeed !== s.seed) {
      this.chunks.clear();
      this.chunkSeed = s.seed;
    }
    const key = `${cx}:${cy}:${month}:${scale}`;
    let cv = this.chunks.get(key);
    if (cv) {
      // Refresh LRU position.
      this.chunks.delete(key);
      this.chunks.set(key, cv);
      return cv;
    }
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const left = (x0 - y0 - CHUNK) * (TW / 2) - 4;
    const top = (x0 + y0) * (TH / 2) - 4;
    const w = CHUNK * TW + 8;
    const h = CHUNK * TH + 8;
    cv = document.createElement('canvas');
    cv.width = w * scale;
    cv.height = h * scale;
    const g = cv.getContext('2d')!;
    g.scale(scale, scale);
    g.translate(-left, -top);
    for (let y = y0; y < Math.min(s.height, y0 + CHUNK); y++) {
      for (let x = x0; x < Math.min(s.width, x0 + CHUNK); x++) {
        const i = y * s.width + x;
        let sp: Sprite;
        if (s.terrain[i] === 1) {
          const mask = this.landMask(s, x, y);
          // Some quiet water gets reeds by the shore or lily pads.
          const v7 = s.variant[i] % 7;
          const deco = v7 === 0 ? 1 : v7 === 1 ? 2 : v7 === 2 && mask ? 3 : 0;
          sp = this.sprite(`w:${season}:${mask}:${deco}`, () => waterTile(season, mask, deco));
        } else {
          const f = Math.min(3, Math.floor(s.fertility[i] * 4));
          const v = s.variant[i] % GRASS_VARIANTS;
          sp = this.sprite(`g:${month}:${f}:${v}`, () => grassTile(month, f, v));
        }
        const [wx, wy] = iso(x, y);
        g.drawImage(sp.canvas, wx - sp.ax, wy - sp.ay, sp.w, sp.h);
      }
    }
    this.chunks.set(key, cv);
    while (this.chunks.size > 48) this.chunks.delete(this.chunks.keys().next().value!);
    return cv;
  }

  private landMask(s: GameState, x: number, y: number): number {
    const land = (xx: number, yy: number) => inBounds(s, xx, yy) && s.terrain[idx(s, xx, yy)] === 0;
    return (land(x + 1, y) ? 1 : 0) | (land(x, y + 1) ? 2 : 0) | (land(x - 1, y) ? 4 : 0) | (land(x, y - 1) ? 8 : 0);
  }

  private roadMask(s: GameState, x: number, y: number): number {
    const road = (xx: number, yy: number) => {
      if (!inBounds(s, xx, yy)) return false;
      const i = idx(s, xx, yy);
      return s.road[i] > 0;
    };
    return (road(x + 1, y) ? 1 : 0) | (road(x, y + 1) ? 2 : 0) | (road(x - 1, y) ? 4 : 0) | (road(x, y - 1) ? 8 : 0);
  }

  private drawWaterShimmer(s: GameState, visible: (x: number, y: number) => boolean): void {
    const c = this.ctx;
    if (seasonOf(s.day) === 3) return;
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1;
    const t = this.time;
    c.beginPath();
    for (let i = 0; i < s.terrain.length; i++) {
      if (s.terrain[i] !== 1) continue;
      const v = s.variant[i];
      const phase = (t * 0.6 + v / 40) % 3;
      if (phase > 1) continue;
      const x = i % s.width;
      const y = (i - x) / s.width;
      const [wx, wy] = iso(x + 0.3 + (v % 5) / 10, y + 0.4 + (v % 3) / 10);
      if (!visible(wx, wy)) continue;
      const len = 5 * Math.sin(phase * Math.PI);
      c.moveTo(wx - len, wy);
      c.lineTo(wx + len, wy);
    }
    c.stroke();
  }

  private wear = new Float32Array(0);
  private wearSeed = -1;

  /**
   * Where villagers keep walking off-road the grass wears into a dirt path,
   * and slowly grows back when they stop.
   */
  private drawFootpaths(s: GameState, agents: Agent[], season: Season, dt: number, visible: (x: number, y: number) => boolean): void {
    const n = s.width * s.height;
    if (this.wear.length !== n || this.wearSeed !== s.seed) {
      this.wear = new Float32Array(n);
      this.wearSeed = s.seed;
    }
    const w = this.wear;
    if (dt > 0) {
      for (const a of agents) {
        if (!a.visible || a.phase !== 'walk') continue;
        const tx = Math.floor(a.x);
        const ty = Math.floor(a.y);
        if (!inBounds(s, tx, ty)) continue;
        const i = ty * s.width + tx;
        if (!s.road[i] && s.occ[i] < 0) w[i] = Math.min(1, w[i] + dt * 0.05);
      }
    }
    const decay = 1 - dt * 0.0015;
    const c = this.ctx;
    c.fillStyle = season === 3 ? '#c9c2b2' : '#a48a62';
    for (let i = 0; i < n; i++) {
      if (w[i] <= 0) continue;
      w[i] *= decay;
      if (w[i] < 0.12 || s.road[i] || s.occ[i] >= 0 || s.terrain[i]) continue;
      const x = i % s.width;
      const y = (i - x) / s.width;
      const [wx, wy] = iso(x + 0.5, y + 0.5);
      if (!visible(wx, wy)) continue;
      c.globalAlpha = Math.min(0.55, (w[i] - 0.12) * 1.2);
      c.beginPath();
      c.ellipse(wx, wy, 17, 8.5, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawFields(s: GameState, season: Season, selected?: number): void {
    const p = new Pen(this.ctx);
    const month = monthOf(s.day);
    const herds = new Map<number, number>();
    for (const b of s.buildings) {
      if (b.type === 'farm') {
        // Farmyard.
        p.poly(
          [
            [b.x + 0.1, b.y + 0.1, 0],
            [b.x + b.w - 0.05, b.y + 0.1, 0],
            [b.x + b.w - 0.05, b.y + b.h - 0.05, 0],
            [b.x + 0.1, b.y + b.h - 0.05, 0],
          ],
          season === 3 ? '#d6dbd9' : '#9c8a5e',
        );
      } else if (b.type === 'market') {
        // A trodden square of packed earth with a cobbled edge.
        p.poly(
          [
            [b.x + 0.05, b.y + 0.05, 0],
            [b.x + b.w - 0.05, b.y + 0.05, 0],
            [b.x + b.w - 0.05, b.y + b.h - 0.05, 0],
            [b.x + 0.05, b.y + b.h - 0.05, 0],
          ],
          season === 3 ? '#d6dadb' : '#b5a88e',
          season === 3 ? '#b8bec0' : '#8a7c62',
          1.5,
        );
        for (let i = 1; i < b.w * 2; i++) p.line([b.x + i * 0.5, b.y + 0.1, 0], [b.x + i * 0.5, b.y + b.h - 0.1, 0], 'rgba(90,75,55,0.18)', 0.5);
        for (let i = 1; i < b.h * 2; i++) p.line([b.x + 0.1, b.y + i * 0.5, 0], [b.x + b.w - 0.1, b.y + i * 0.5, 0], 'rgba(90,75,55,0.18)', 0.5);
      } else if (b.type === 'field') {
        this.drawField(p, b, season, month);
      } else if (b.type === 'pasture') {
        this.drawPasture(p, s, b, season, herds);
      } else if (b.type === 'orchard') {
        // Mown grass between the rows.
        p.poly(
          [
            [b.x + 0.05, b.y + 0.05, 0],
            [b.x + b.w - 0.05, b.y + 0.05, 0],
            [b.x + b.w - 0.05, b.y + b.h - 0.05, 0],
            [b.x + 0.05, b.y + b.h - 0.05, 0],
          ],
          season === 3 ? 'rgba(230,236,238,0.5)' : 'rgba(80,110,40,0.25)',
        );
        for (let x = b.x + 0.5; x < b.x + b.w; x += 1) p.line([x, b.y + 0.2, 0], [x, b.y + b.h - 0.2, 0], season === 3 ? 'rgba(200,206,208,0.6)' : 'rgba(150,170,80,0.35)', 3);
      }
      if (selected === b.id && BUILDINGS[b.type].zone) {
        p.poly(
          [
            [b.x, b.y, 0],
            [b.x + b.w, b.y, 0],
            [b.x + b.w, b.y + b.h, 0],
            [b.x, b.y + b.h, 0],
          ],
          'rgba(255,230,140,0.12)',
          `rgba(240,200,80,${0.6 + 0.3 * Math.sin(this.time * 4)})`,
          2,
        );
      }
    }
  }

  /** Each field's picture, redrawn only when its crop moves on to another stage. */
  private fieldCache = new Map<number, { key: string; sp: Sprite }>();

  private drawField(_p: Pen, b: Building, season: Season, month: number): void {
    const crop = b.recipe ?? 'wheat';
    // The crop's stage: bare, sprouting, young, tall, ripe, stooked or stubble.
    let stage = 'bare';
    if (month <= 5 && b.growth > 0) stage = b.growth < 0.2 ? 'sprout' : b.growth < 0.5 ? 'young' : b.growth < 0.8 ? 'tall' : 'full';
    else if (month === 6 && b.growth > 0) stage = 'ripe';
    else if (month === 7) stage = 'stooks';
    else if (month === 8) stage = 'stubble';
    if (crop === 'flax' && stage === 'full' && month >= 3) stage = 'flower';
    const key = `${b.x},${b.y},${b.w},${b.h},${crop},${stage},${season}`;
    let hit = this.fieldCache.get(b.id);
    if (!hit || hit.key !== key) {
      const local = { ...b, x: 0, y: 0 };
      const m = 4;
      const top = 30;
      const sp = makeSprite((b.w + b.h) * (TW / 2) + m * 2, (b.w + b.h) * (TH / 2) + top + m, b.h * (TW / 2) + m, top, (ctx) => {
        drawFieldPicture(new Pen(ctx), local, crop, stage, season);
      });
      hit = { key, sp };
      this.fieldCache.set(b.id, hit);
    }
    const [wx, wy] = iso(b.x, b.y);
    this.blit(hit.sp, wx, wy);
  }

  private drawPasture(p: Pen, s: GameState, b: Building, season: Season, herds: Map<number, number>): void {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    p.poly(
      [
        [x0, y0, 0],
        [x1, y0, 0],
        [x1, y1, 0],
        [x0, y1, 0],
      ],
      season === 3 ? 'rgba(240,244,246,0.25)' : 'rgba(120,150,50,0.18)',
    );
    const post = '#7b5a36';
    p.fence([x0 + 0.05, y0 + 0.05], [x1 - 0.05, y0 + 0.05], post);
    p.fence([x0 + 0.05, y0 + 0.05], [x0 + 0.05, y1 - 0.05], post);
    // Animals, shared out between the owner's pastures by area.
    const owner = s.buildings.find((o) => o.id === b.owner);
    // In deep winter the herd shelters in the byre.
    const sheltered = monthOf(s.day) >= 10;
    if (owner && herdTotal(owner) && !sheltered) {
      const zones = s.buildings.filter((z) => z.owner === owner.id && z.type === 'pasture');
      const total = zones.reduce((a, z) => a + z.w * z.h, 0);
      const herd = herdTotal(owner);
      let n = Math.round((herd * b.w * b.h) / Math.max(1, total));
      const used = herds.get(owner.id) ?? 0;
      if (zones[zones.length - 1] === b) n = Math.max(0, herd - used);
      herds.set(owner.id, used + n);
      // The farm's animals, kind by kind, shared out over its pastures.
      const a = animalsOf(owner);
      const flock: string[] = [];
      for (const k of ANIMAL_KINDS) for (let i = 0; i < (a[k] ?? 0); i++) flock.push(k);
      const mine = flock.slice(used, used + Math.min(n, 40));
      // Each wanders slowly about its own spot (no wrapping round the edges),
      // facing the way it moves; nearer animals are drawn last.
      const beasts = mine.map((kind, j) => {
        const seed = b.id * 97 + j * 13;
        const r1 = fract(Math.sin(seed) * 43758.5);
        const r2 = fract(Math.sin(seed * 1.7) * 24634.6);
        const t = this.time * 0.05 + r1 * 10;
        const ax = x0 + 0.45 + (b.w - 0.9) * (0.5 + 0.42 * Math.sin(r1 * 6.283 + t * 0.6));
        const ay = y0 + 0.45 + (b.h - 0.9) * (0.5 + 0.42 * Math.sin(r2 * 6.283 + t * 0.45 + 1));
        const dx = (b.w - 0.9) * Math.cos(r1 * 6.283 + t * 0.6) * 0.6;
        const dy = (b.h - 0.9) * Math.cos(r2 * 6.283 + t * 0.45 + 1) * 0.45;
        return { kind, ax, ay, f: dx - dy >= 0 ? 1 : -1, j };
      });
      beasts.sort((p1, p2) => p1.ax + p1.ay - (p2.ax + p2.ay));
      for (const { kind, ax, ay, f, j } of beasts) {
        const [sx, sy] = iso(ax, ay);
        if (kind === 'sheep') drawSheep(p.ctx, sx, sy, f, season === 3 ? '#e2ddd2' : '#f2ece0');
        else drawBeast(p.ctx, sx, sy, f, kind, j);
      }
    }
    p.fence([x1 - 0.05, y0 + 0.05], [x1 - 0.05, y1 - 0.05], post);
    p.fence([x0 + 0.05, y1 - 0.05], [x0 + b.w / 2 - 0.3, y1 - 0.05], post);
    p.fence([x0 + b.w / 2 + 0.3, y1 - 0.05], [x1 - 0.05, y1 - 0.05], post);
  }

  private drawGroundOverlays(s: GameState, ov: Overlay): void {
    const c = this.ctx;
    const tileDiamond = (x: number, y: number) => {
      const [a, b] = iso(x, y);
      c.beginPath();
      c.moveTo(a, b);
      c.lineTo(a + TW / 2, b + TH / 2);
      c.lineTo(a, b + TH);
      c.lineTo(a - TW / 2, b + TH / 2);
      c.closePath();
    };
    if (ov.fertility) {
      // Poor soil red, fair yellow, rich green; batched by shade so it stays cheap.
      const shades = ['rgba(200,70,50,0.38)', 'rgba(220,150,50,0.34)', 'rgba(220,210,70,0.3)', 'rgba(140,200,70,0.32)', 'rgba(60,170,60,0.38)'];
      const z = this.cam.zoom;
      const hw = this.width / 2 / z + TW;
      const hh = this.height / 2 / z + TH;
      const buckets: number[][] = shades.map(() => []);
      for (let i = 0; i < s.terrain.length; i++) {
        if (s.terrain[i] || s.occ[i] >= 0 || s.road[i]) continue;
        const x = i % s.width;
        const y = (i / s.width) | 0;
        const [wx, wy] = iso(x + 0.5, y + 0.5);
        if (Math.abs(wx - this.cam.x) > hw || Math.abs(wy - this.cam.y) > hh) continue;
        buckets[Math.min(4, Math.floor(s.fertility[i] * 5))].push(i);
      }
      buckets.forEach((list, k) => {
        if (!list.length) return;
        c.fillStyle = shades[k];
        c.beginPath();
        for (const i of list) {
          const [a, b] = iso(i % s.width, (i / s.width) | 0);
          c.moveTo(a, b);
          c.lineTo(a + TW / 2, b + TH / 2);
          c.lineTo(a, b + TH);
          c.lineTo(a - TW / 2, b + TH / 2);
          c.closePath();
        }
        c.fill();
      });
    }
    if (ov.coverage) {
      // Tint each tile once, however many circles reach it.
      const seen = new Set<number>();
      c.fillStyle = 'rgba(90,160,255,0.32)';
      for (const { cx, cy, r } of ov.coverage.circles) {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
          for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if (!inBounds(s, x, y) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
            const i = idx(s, x, y);
            if (seen.has(i)) continue;
            seen.add(i);
            tileDiamond(x, y);
            c.fill();
          }
        }
      }
      // A ring marks the edge of each reach.
      c.strokeStyle = 'rgba(30,70,140,0.55)';
      c.lineWidth = 1.5;
      for (const { cx, cy, r } of ov.coverage.circles) {
        c.beginPath();
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * Math.PI * 2;
          const [px, py] = iso(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          if (k) c.lineTo(px, py);
          else c.moveTo(px, py);
        }
        c.stroke();
      }
    }
    if (ov.range) {
      const { cx, cy, r, highlight } = ov.range;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (!inBounds(s, x, y)) continue;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
          const i = idx(s, x, y);
          tileDiamond(x, y);
          c.fillStyle = highlight && highlight(i) ? 'rgba(255,214,90,0.38)' : 'rgba(255,255,255,0.12)';
          c.fill();
        }
      }
    }
    if (ov.tiles) {
      for (const t of ov.tiles) {
        tileDiamond(t.x, t.y);
        c.fillStyle = !t.ok
          ? 'rgba(220,60,40,0.45)'
          : ov.tileColor === 'remove'
            ? 'rgba(220,120,40,0.45)'
            : ov.tileColor === 'grove'
              ? 'rgba(120,200,110,0.4)'
              : 'rgba(240,220,150,0.55)';
        c.fill();
      }
    }
    // Protected woods: a light dashed border over a dark one, so it reads by
    // brightness on grass and trees alike; bolder while the tool is in hand.
    if (s.groves?.length) {
      c.save();
      for (const g of s.groves) {
        const pts = [iso(g.x, g.y), iso(g.x + g.w, g.y), iso(g.x + g.w, g.y + g.h), iso(g.x, g.y + g.h)];
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
        c.closePath();
        c.setLineDash([]);
        c.lineWidth = ov.groves ? 4 : 3;
        c.strokeStyle = 'rgba(25,40,15,0.45)';
        c.stroke();
        c.setLineDash(ov.groves ? [] : [7, 5]);
        c.lineWidth = ov.groves ? 2 : 1.4;
        c.strokeStyle = ov.groves ? 'rgba(240,250,210,0.95)' : 'rgba(235,240,200,0.8)';
        c.stroke();
      }
      c.restore();
    }
    if (ov.hover && !ov.ghost && !ov.tiles) {
      tileDiamond(ov.hover.x, ov.hover.y);
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = 1.2;
      c.stroke();
    }
    const sel = ov.selected !== undefined ? s.buildings.find((b) => b.id === ov.selected) : undefined;
    if (sel) {
      const p = new Pen(c);
      p.poly(
        [
          [sel.x, sel.y, 0],
          [sel.x + sel.w, sel.y, 0],
          [sel.x + sel.w, sel.y + sel.h, 0],
          [sel.x, sel.y + sel.h, 0],
        ],
        'rgba(255,230,120,0.18)',
        'rgba(255,220,90,0.95)',
        2,
      );
    }
  }

  // ---------------------------------------------------------------- depth

  /** Tiles in front of a building (east/south ring) must draw after it. */
  private computeBoost(s: GameState): void {
    const n = s.width * s.height;
    if (this.boost.length !== n) this.boost = new Int32Array(n);
    this.boost.fill(0);
    for (let pass = 0; pass < 2; pass++) {
      for (const b of s.buildings) {
        const d = this.buildingDepth(s, b);
        for (let y = b.y; y < b.y + b.h; y++) {
          const x = b.x + b.w;
          if (inBounds(s, x, y)) this.bump(s, x, y, d);
        }
        for (let x = b.x; x <= b.x + b.w; x++) {
          const y = b.y + b.h;
          if (inBounds(s, x, y)) this.bump(s, x, y, d);
        }
      }
    }
  }

  private bump(s: GameState, x: number, y: number, d: number): void {
    const i = y * s.width + x;
    if (this.boost[i] < d) this.boost[i] = d;
  }

  private buildingDepth(s: GameState, b: Building): number {
    let d = b.x + b.w - 1 + b.y + b.h - 1;
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const v = this.boost[y * s.width + x] ?? 0;
        if (v > d) d = v;
      }
    }
    return Math.min(d, s.width + s.height + 2);
  }

  // ---------------------------------------------------------------- objects

  /** Orchard tiles visible this frame, drawn as fruit trees. */
  private orchardTiles = new Map<number, Building>();

  private drawTileObjects(s: GameState, i: number, season: Season): void {
    const x = i % s.width;
    const y = (i - x) / s.width;
    const stall = this.stallTiles.get(i);
    if (stall) {
      const kind = (stall.b.id * 3 + stall.k) % 6;
      const sp = this.sprite(`stall:${kind}:${season}:${stall.open}`, () => stallSprite(kind, season, stall.open));
      const [wx, wy] = iso(x, y);
      this.blit(sp, wx, wy);
      return;
    }
    if (i === this.festTile) {
      this.drawFestival(s, x + 0.5, y + 0.5);
      if (!s.trees[i] && !s.rock[i] && !s.ore[i] && !s.berriesMax[i] && !s.stumps?.[i]) return;
    }
    const v = s.variant[i];
    const orchard = this.orchardTiles.get(i);
    if (orchard) {
      const fruit = orchard.recipe ?? 'apples';
      const stage = Math.round(orchardMaturity(orchard, hasCharter(s, 'orchard2')) * 4) / 4;
      const month = monthOf(s.day);
      const fruiting = stage >= 1 && month >= 3 && month <= 6 && (month < 5 || orchard.growth > 0);
      const blossom = month <= 1 && stage >= 0.5;
      const sp = this.sprite(`ft:${fruit}:${season}:${stage}:${fruiting}:${blossom}`, () => fruitTreeSprite(fruit, season, stage, fruiting, blossom));
      const [wx, wy] = iso(x + 0.5, y + 0.5);
      this.blit(sp, wx, wy, 1, TREE_SCALE * 0.92);
      return;
    }
    if (s.rock[i] || s.ore[i]) {
      const ore = s.ore[i] > 0;
      const rv = v % 4;
      const sp = ore
        ? this.sprite(`bog:${rv}:${season === 3}`, () => bogSprite(rv, season === 3 ? 3 : 0))
        : this.sprite(`k:${rv}:${season === 3}`, () => rockSprite(false, rv, season === 3 ? 3 : 0));
      const [wx, wy] = iso(x + 0.5, y + 0.5);
      this.blit(sp, wx, wy);
    }
    if (s.berriesMax[i] && !s.trees[i]) {
      const has = s.berries[i] > 0;
      const bv = v % 3;
      const sp = this.sprite(`u:${has}:${season}:${bv}`, () => bushSprite(has, season, bv));
      const [wx, wy] = iso(x + 0.5, y + 0.5);
      this.blit(sp, wx, wy);
      if (s.berriesMax[i] > 2) {
        const [wx2, wy2] = iso(x + 0.25, y + 0.75);
        this.blit(sp, wx2, wy2);
      }
    }
    const felled = s.stumps?.[i];
    if (felled !== undefined && !s.trees[i] && s.occ[i] < 0 && !s.road[i]) {
      // Stumps where the woodcutters were, fading into the grass over two years.
      const age = (s.day - felled) / (2 * DAYS_PER_YEAR);
      if (age < 1) {
        const c = this.ctx;
        c.globalAlpha = 1 - age * 0.8;
        const rv = mulberry32(i * 7 + 3);
        for (let k = 0; k < 2 + (v % 2); k++) {
          const [sx, sy] = iso(x + 0.25 + rv() * 0.5, y + 0.25 + rv() * 0.5);
          c.fillStyle = '#6b4a2e';
          c.beginPath();
          c.ellipse(sx, sy - 1.5, 3.2, 2.2, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = season === 3 ? '#e8ecee' : '#c8a06a';
          c.beginPath();
          c.ellipse(sx, sy - 3, 3, 1.5, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#9a7346';
          c.lineWidth = 0.5;
          c.beginPath();
          c.ellipse(sx, sy - 3, 1.6, 0.8, 0, 0, Math.PI * 2);
          c.stroke();
        }
        if (season !== 3) {
          // A few chips of wood in the grass.
          c.fillStyle = '#c8a06a';
          for (let k = 0; k < 4; k++) {
            const [sx, sy] = iso(x + rv(), y + rv());
            c.fillRect(sx, sy, 1.6, 0.9);
          }
        }
        c.globalAlpha = 1;
      }
    }
    const n = s.trees[i];
    if (n) {
      const kind: TreeKind = v % 9 < 4 ? 'pine' : v % 9 < 8 ? 'oak' : 'birch';
      const base = v % TREE_VARIANTS;
      const mixBirch = kind === 'oak' && v % 2 === 1;
      // One pre-composed clump per tile keeps draw calls low.
      const sp = this.sprite(`tc:${kind}:${n}:${base}:${mixBirch}:${season}`, () => this.treeClump(kind, n, base, mixBirch, season));
      const jx = ((v >> 2) % 5) * 0.03 - 0.06;
      const jy = ((v >> 4) % 5) * 0.03 - 0.06;
      const [wx, wy] = iso(x + jx, y + jy);
      this.blit(sp, wx, wy);
    }
    const shrooms = s.mushrooms?.[i] ?? 0;
    if (shrooms > 0 && season !== 3) this.drawMushrooms(x, y, shrooms, v);
  }

  /** A few red-capped and brown mushrooms at the foot of the trees. */
  private drawMushrooms(x: number, y: number, n: number, v: number): void {
    const c = this.ctx;
    for (let k = 0; k < n + 1; k++) {
      const [sx, sy] = iso(x + 0.25 + ((v * (k + 3)) % 7) * 0.08, y + 0.75 + ((v * (k + 5)) % 3) * 0.07);
      const red = (v + k) % 3 !== 0;
      const r = 2.2 + ((v + k) % 2) * 0.6;
      c.fillStyle = '#efe6d2';
      c.fillRect(sx - 0.6, sy - 2.6, 1.2, 2.6);
      c.fillStyle = red ? '#c8382a' : '#9a6a3e';
      c.beginPath();
      c.ellipse(sx, sy - 2.6, r, r * 0.65, 0, Math.PI, 0);
      c.fill();
      if (red) {
        c.fillStyle = '#f8f2e4';
        c.fillRect(sx - 0.8, sy - 3.4, 0.6, 0.6);
        c.fillRect(sx + 0.4, sy - 3.0, 0.5, 0.5);
      }
    }
  }

  private treeClump(kind: TreeKind, n: number, base: number, mixBirch: boolean, season: Season): Sprite {
    const slots = TREE_SLOTS[n - 1];
    // Trees stand a third taller than their drawings, to sit right by the houses.
    const k2 = TREE_SCALE;
    return makeSprite(TW + 70, TH + 112, TW / 2 + 35, 108, (ctx) => {
      for (let k = 0; k < slots.length; k++) {
        const tv = (base + k * 3) % TREE_VARIANTS;
        const kk: TreeKind = k === 1 && mixBirch ? 'birch' : kind;
        const t = this.sprite(`t:${kk}:${season}:${tv}`, () => treeSprite(kk, season, tv));
        const [lx, ly] = iso(slots[k][0], slots[k][1]);
        ctx.drawImage(t.canvas, lx - t.ax * k2, ly - t.ay * k2, t.w * k2, t.h * k2);
      }
    });
  }

  private drawBuilding(s: GameState, b: Building, season: Season, selected: boolean): void {
    // A mill that ground grain lately turns its sails (drawn live, not in the picture).
    const turning = b.type === 'windmill' && b.build >= 1 && !this.light && b.workers > 0 && !b.paused && (b.output > 0 || b.lastOutput > 0);
    const sp = this.buildingSprite(b.type, b.level, season, turning ? 1 : variantOf(s, b));
    const [wx, wy] = iso(b.x, b.y);
    const c = this.ctx;
    if (b.build < 1) {
      this.drawConstruction(b, sp, wx, wy);
      return;
    }
    if (b.type === 'wall') {
      this.drawWall(s, b);
      return;
    }
    this.blit(sp, wx, wy);
    if (turning) {
      const [hx, hy] = iso(b.x + 1.0, b.y + 1.42, 34);
      drawSails(c, hx, hy, this.time * 0.9 + b.id, season);
    }
    const yard = b.type === 'house' && !this.light && this.yardClear(s, b);
    if (yard && b.residents > 0 && season !== 3 && (b.id * 2654435761) % 3 === 0) this.drawChickens(b);
    if (b.type === 'farm' && b.build >= 1 && monthOf(s.day) >= 7) this.drawHayRick(b, season);
    if (b.type === 'house' && b.residents > 0 && !this.light && season !== 3 && this.dusk < 0.3 && ((b.id * 2246822519) >>> 0) % 5 === 3) this.drawCat(b);
    if (yard && b.residents > 1 && this.dusk < 0.3) {
      const hsh = ((b.id * 2654435761) >>> 0) >>> 9;
      // Children come out to play for a while, then go back in.
      if (hsh % 3 === 1 && Math.sin(this.time * 0.05 + b.id) > -0.2) this.drawChildren(b, season);
      // Neighbours stop at the door to chat now and then.
      if (hsh % 4 === 2 && Math.sin(this.time * 0.04 + b.id * 1.7) > 0.25) this.drawGossips(b, season);
    }
    if (b.type === 'bakery' && b.build >= 1 && b.workers > 0 && !b.paused && (b.output > 0 || b.lastOutput > 0)) {
      // The oven mouth glows and flickers while the baker bakes.
      const [ox, oy] = iso(b.x + 1.6, b.y + 0.85, 0);
      const f = 0.35 + 0.2 * Math.sin(this.time * 7 + b.id) + 0.1 * Math.sin(this.time * 13);
      c.fillStyle = `rgba(255,150,50,${f})`;
      c.beginPath();
      c.ellipse(ox + 2, oy - 2, 7, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(255,220,120,${f + 0.2})`;
      c.fillRect(ox - 1, oy - 2.5, 5, 2.2);
    }
    // The granary is shut up tight: only storehouse and camp show their stock.
    if (STORAGE_CAPACITY[b.type] && b.type !== 'granary') this.drawStock(s, b, season);
    if (b.type === 'townhall' && s.feastDay !== undefined && s.day - s.feastDay < DAYS_PER_MONTH) this.drawFeast(b);
    const fest = s.festivalDay && s.day - s.festivalDay.day < DAYS_PER_MONTH ? s.festivalDay.id : null;
    if (fest === 'mayday' && b.type === 'maypole') this.drawMayDance(b);
    if (fest === 'midsummer' && b.type === 'townhall') this.drawBonfire(b);
    if (b.type === 'townhall' && s.commissions?.includes('tapestry')) this.drawHeraldry(b);
    // Lamplight in lived-in homes and the tavern as evening falls.
    if (this.dusk > 0.25 && b.build >= 1 && (b.residents > 0 || (b.type === 'tavern' && b.workers > 0))) this.drawLamplight(s, b);
    if (b.upgrading) this.drawScaffold(b);
    if (selected) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.12 + 0.06 * Math.sin(this.time * 4);
      c.drawImage(sp.canvas, wx - sp.ax, wy - sp.ay, sp.w, sp.h);
      c.restore();
    }
    // While the reach overlay is on, homes show whether they are covered.
    const covered = this.coverageHomes?.get(b.id);
    if (covered !== undefined) {
      this.drawMarker(b, covered ? '#3f7a34' : '#b8483a', covered ? '✓' : '✗');
      return;
    }
    // Status markers.
    if (!this.showMarkers) return;
    if (hasProblem(b)) {
      this.drawMarker(b, '#e0a030', '?', b.lack);
    } else if ((b.type === 'house' || b.type === 'townhall') && this.canUpgrade(s, b)) {
      this.drawMarker(b, b.type === 'townhall' ? '#c89a38' : '#4f8a3a', '↑');
    }
    void s;
  }

  /**
   * Whether a home or the manor could be upgraded now. Checking means
   * scanning the town for wells, markets and taverns in reach, so it is
   * worked out once per game day (or when buildings change), not every frame.
   */
  private canUpgrade(s: GameState, b: Building): boolean {
    const key = `${s.day}:${s.buildings.length}:${Math.floor(s.res.gold)}`;
    if (key !== this.upgradeKey) {
      this.upgradeKey = key;
      this.upgradable.clear();
      for (const o of s.buildings) {
        if ((o.type === 'house' || o.type === 'townhall' || o.type === 'church') && o.build >= 1 && !o.upgrading && !upgradeBlocker(s, o)) this.upgradable.add(o.id);
      }
    }
    return this.upgradable.has(b.id);
  }
  private upgradeKey = '';
  private upgradable = new Set<number>();

  /**
   * A section of town wall, joined to its neighbours. Beside a road it rises
   * into a gate tower, so roads pass through the wall between towers.
   */
  private drawWall(s: GameState, b: Building): void {
    const p = new Pen(this.ctx);
    p.snow = seasonOf(s.day) === 3;
    const x = b.x;
    const y = b.y;
    const stone = '#b5ac9b';
    const top = '#cdc4b3';
    const H = 22;
    const at = (dx: number, dy: number) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(s, nx, ny)) return { wall: false, road: false };
      const i = idx(s, nx, ny);
      const o = s.occ[i] >= 0 ? this.byId.get(s.occ[i]) : undefined;
      return { wall: o?.type === 'wall' && o.build >= 1, road: s.road[i] > 0 };
    };
    const gate = at(1, 0).road || at(-1, 0).road || at(0, 1).road || at(0, -1).road;
    // Arms reach towards neighbours further back first, so nearer ones overlap.
    if (at(-1, 0).wall) p.box(x - 0.5, y + 0.36, x + 0.5, y + 0.64, 0, H, stone, top, 'stone');
    if (at(0, -1).wall) p.box(x + 0.36, y - 0.5, x + 0.64, y + 0.5, 0, H, stone, top, 'stone');
    if (gate) {
      p.box(x + 0.14, y + 0.14, x + 0.86, y + 0.86, 0, H * 2, '#aaa190', top, 'stone');
      p.wallL(y + 0.862, x + 0.38, x + 0.62, H * 1.3, H * 1.6, '#2a2522');
      p.wallR(x + 0.862, y + 0.38, y + 0.62, H * 1.3, H * 1.6, '#221e1b');
      p.roofPyramid(x + 0.14, y + 0.14, x + 0.86, y + 0.86, H * 2, 18, 'slate');
    } else if ((x + y) % 6 === 0) {
      // A postern: a small arched door through the wall for folk on foot.
      p.box(x + 0.28, y + 0.28, x + 0.72, y + 0.72, 0, H + 8, '#aaa190', top, 'stone');
      p.wallL(y + 0.722, x + 0.42, x + 0.58, 0, 12, '#4a2f1b');
      p.wallR(x + 0.722, y + 0.42, y + 0.58, 0, 12, '#3e2716');
    } else {
      p.box(x + 0.32, y + 0.32, x + 0.68, y + 0.68, 0, H + 4, stone, top, 'stone');
      // Crenellations along the top.
      for (const [cx, cy] of [
        [0.36, 0.36],
        [0.56, 0.36],
        [0.36, 0.56],
        [0.56, 0.56],
      ]) {
        p.box(x + cx, y + cy, x + cx + 0.08, y + cy + 0.08, H + 4, 4, stone, top, 'stone');
      }
    }
  }

  /** Dancers circling the maypole, ribbons in hand, for a month after May Day. */
  private drawMayDance(b: Building): void {
    const c = this.ctx;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const [tx, ty] = iso(cx, cy, 40);
    const colors = ['#b8483a', '#e8c048', '#3a5a8a', '#4f8a3a', '#e8e0d0', '#9a5aa0'];
    for (let k = 0; k < 6; k++) {
      const a = this.time * 0.8 + (k / 6) * Math.PI * 2;
      const [x, y] = iso(cx + Math.cos(a) * 0.95, cy + Math.sin(a) * 0.95);
      const hop = Math.abs(Math.sin(this.time * 6 + k)) * 1.5;
      // Ribbon to the top of the pole.
      c.strokeStyle = colors[k];
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x, y - 9 - hop);
      c.lineTo(tx, ty);
      c.stroke();
      // A small dancer.
      c.fillStyle = 'rgba(20,20,10,0.25)';
      c.beginPath();
      c.ellipse(x, y, 3, 1.3, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = colors[(k + 2) % colors.length];
      c.fillRect(x - 2, y - 9 - hop, 4, 6);
      c.fillStyle = '#e8c4a0';
      c.beginPath();
      c.arc(x, y - 11 - hop, 1.8, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** The Midsummer bonfire in the manor's yard, flickering for a month. */
  private drawBonfire(b: Building): void {
    const c = this.ctx;
    const [x, y] = iso(b.x + 0.55, b.y + b.h - 0.45);
    // Glow on the ground.
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, y - 4, 2, x, y - 4, 26);
    g.addColorStop(0, 'rgba(255,170,60,0.45)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y - 2, 26, 13, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // Logs.
    c.strokeStyle = '#4a3020';
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(x - 7, y + 1);
    c.lineTo(x + 6, y - 3);
    c.moveTo(x - 6, y - 3);
    c.lineTo(x + 7, y + 1);
    c.stroke();
    // Flames, three tongues that flicker.
    const tongues: [number, string, number][] = [
      [0, '#e8602a', 16],
      [-3, '#f0a030', 11],
      [3, '#f0c040', 9],
    ];
    for (const [dx, col, h] of tongues) {
      const f = h * (0.8 + 0.25 * Math.sin(this.time * 11 + dx * 2));
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x + dx - 4, y - 1);
      c.quadraticCurveTo(x + dx - 3, y - f * 0.6, x + dx + Math.sin(this.time * 7 + dx) * 1.5, y - f);
      c.quadraticCurveTo(x + dx + 3, y - f * 0.6, x + dx + 4, y - 1);
      c.closePath();
      c.fill();
    }
  }

  /** Trestle tables and bunting in the manor's yard for a month after a feast. */
  /** A thatched hay rick by the farmstead from the harvest to the spring. */
  private drawHayRick(b: Building, season: Season): void {
    const c = this.ctx;
    const [sx, sy] = iso(b.x + b.w - 0.35, b.y + b.h + 0.35);
    c.fillStyle = 'rgba(30,20,10,0.25)';
    c.beginPath();
    c.ellipse(sx + 2, sy, 11, 4.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c8a24a';
    c.beginPath();
    c.moveTo(sx - 10, sy);
    c.lineTo(sx - 9, sy - 10);
    c.quadraticCurveTo(sx, sy - 24, sx + 9, sy - 10);
    c.lineTo(sx + 10, sy);
    c.closePath();
    c.fill();
    c.fillStyle = '#b08a38';
    c.fillRect(sx + 1, sy - 12, 9, 12);
    // A thatched cap, snowy in winter.
    c.fillStyle = season === 3 ? '#eef2f4' : '#8a6a3a';
    c.beginPath();
    c.moveTo(sx - 9.5, sy - 11);
    c.quadraticCurveTo(sx, sy - 26, sx + 9.5, sy - 11);
    c.quadraticCurveTo(sx, sy - 17, sx - 9.5, sy - 11);
    c.fill();
  }

  /**
   * Whether the ground in front of a building's door is open, so yard life
   * drawn there is not hidden behind the next building along.
   */
  private yardClear(s: GameState, b: Building): boolean {
    for (let dy = 0; dy < 2; dy++) {
      const y = b.y + b.h + dy;
      if (y >= s.height) return false;
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = y * s.width + x;
        if (s.occ[i] >= 0 || s.terrain[i]) return false;
      }
    }
    return true;
  }

  /** A small standing or running figure, used for the lane folk by homes. */
  private drawFolk(sx: number, sy: number, scale: number, tunic: string, hair: string, run: number, face: number, winter: boolean, seated = false): void {
    const c = this.ctx;
    c.save();
    c.translate(sx, sy);
    c.scale(scale, scale);
    const bob = Math.abs(Math.sin(run)) * 1.2 * (run ? 1 : 0);
    const leg = run ? Math.sin(run) * 2 : 0;
    if (seated) c.translate(0, 4);
    else {
      c.fillStyle = 'rgba(20,20,10,0.28)';
      c.beginPath();
      c.ellipse(0, 0, 4, 1.8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#3a2c20';
    c.lineWidth = 1.4;
    if (!seated) {
      c.beginPath();
      c.moveTo(-1, -4 - bob);
      c.lineTo(-1 + leg, 0);
      c.moveTo(1, -4 - bob);
      c.lineTo(1 - leg, 0);
      c.stroke();
    }
    c.fillStyle = tunic;
    c.beginPath();
    c.moveTo(-3, -4 - bob);
    c.lineTo(3, -4 - bob);
    c.lineTo(2.4, -10.5 - bob);
    c.lineTo(-2.4, -10.5 - bob);
    c.closePath();
    c.fill();
    if (winter) {
      // A woollen shawl over the shoulders.
      c.fillStyle = '#8a6a4a';
      c.fillRect(-2.8, -10.8 - bob, 5.6, 2);
    }
    c.fillStyle = '#e8c4a0';
    c.beginPath();
    c.arc(face * 0.4, -12.5 - bob, 2.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = hair;
    c.beginPath();
    c.arc(face * 0.4, -13.2 - bob, 2.2, Math.PI, 0);
    c.fill();
    c.restore();
  }

  /** Two children chasing each other (or a ball) round a home's front yard. */
  private drawChildren(b: Building, season: Season): void {
    const c = this.ctx;
    const n = 1 + (b.id % 2);
    const cx = b.x + b.w * 0.5;
    const cy = b.y + b.h + 0.45;
    const tunics = ['#7a9ab8', '#c07850', '#8aa060', '#b89048'];
    const hairs = ['#e0c070', '#6a4428', '#3a2818'];
    const t = this.time * 0.9 + b.id;
    for (let k = 0; k < n; k++) {
      const a = t + k * 2.4;
      const x = cx + Math.cos(a) * 0.55;
      const y = cy + Math.sin(a) * 0.22;
      const [sx, sy] = iso(x, y);
      const face = -Math.sin(a) > 0 ? 1 : -1;
      this.drawFolk(sx, sy, 0.68 * FOLK_SCALE, tunics[(b.id + k) % tunics.length], hairs[(b.id + k * 2) % hairs.length], this.time * 9 + k, face, season === 3);
    }
    if (n === 1 && season !== 3) {
      // A lone child bounces a leather ball.
      const [bx, by] = iso(cx + Math.cos(t - 0.5) * 0.55, cy + Math.sin(t - 0.5) * 0.22);
      const hop = Math.abs(Math.sin(this.time * 6)) * 5;
      c.fillStyle = '#8a5a30';
      c.beginPath();
      c.arc(bx, by - 1.2 - hop, 1.3, 0, Math.PI * 2);
      c.fill();
    }
    if (season === 3) {
      // A snowman they have built by the door.
      const [mx, my] = iso(b.x + b.w - 0.25, b.y + b.h + 0.3);
      c.fillStyle = '#f6f8fa';
      c.strokeStyle = 'rgba(120,140,160,0.6)';
      c.lineWidth = 0.6;
      for (const [r, z] of [[3, 3], [2.2, 7.6], [1.6, 11]] as const) {
        c.beginPath();
        c.arc(mx, my - z, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      c.fillStyle = '#e07830';
      c.fillRect(mx, my - 11.2, 1.8, 0.6);
    }
  }

  /** Two neighbours standing at a home's door, talking with their hands. */
  private drawGossips(b: Building, season: Season): void {
    const c = this.ctx;
    const x = b.x + 0.4 + ((b.id * 7) % 3) * 0.2;
    const y = b.y + b.h + 0.3;
    const [ax, ay] = iso(x, y);
    const [bx, by] = iso(x + 0.42, y + 0.06);
    const tunics = ['#9a5a48', '#5a7a8a', '#7a6a9a', '#a08850', '#6a8a5a'];
    this.drawFolk(ax, ay, FOLK_SCALE, tunics[b.id % tunics.length], '#5a3a22', 0, 1, season === 3);
    this.drawFolk(bx, by, FOLK_SCALE, tunics[(b.id + 2) % tunics.length], '#2a2018', 0, -1, season === 3);
    // Whoever is talking lifts a hand, and a little speech mark rises now and then.
    const talk = Math.sin(this.time * 1.3 + b.id) > 0;
    const [hx, hy] = talk ? [ax + 3, ay - 9 - Math.abs(Math.sin(this.time * 5)) * 1.5] : [bx - 3, by - 9 - Math.abs(Math.sin(this.time * 5)) * 1.5];
    c.strokeStyle = '#e8c4a0';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(talk ? ax + 2 : bx - 2, (talk ? ay : by) - 9.5);
    c.lineTo(hx, hy);
    c.stroke();
    const ph = (this.time * 0.6 + b.id) % 3;
    if (ph < 1.2) {
      const [px, py] = talk ? [ax, ay] : [bx, by];
      c.globalAlpha = Math.min(1, ph * 3) * (1 - ph / 1.2);
      c.fillStyle = '#fbf6ea';
      c.strokeStyle = 'rgba(80,60,40,0.6)';
      c.lineWidth = 0.7;
      c.beginPath();
      c.ellipse(px + (talk ? 3 : -3), py - 20 - ph * 3, 3.6, 2.4, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(80,60,40,0.8)';
      for (let i = -1; i <= 1; i++) c.fillRect(px + (talk ? 3 : -3) + i * 1.3 - 0.35, py - 20.3 - ph * 3, 0.7, 0.7);
      c.globalAlpha = 1;
    }
  }

  /** A small dog trotting at its villager's heels. */
  private drawDog(x: number, y: number, dir: number, step: number): void {
    const c = this.ctx;
    const bob = Math.abs(Math.sin(step * 1.3)) * 0.8;
    const leg = Math.sin(step * 1.3) * 1.4;
    c.fillStyle = 'rgba(20,20,10,0.25)';
    c.beginPath();
    c.ellipse(x, y, 3.6, 1.3, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#5a4030';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - 2, y - 2.5);
    c.lineTo(x - 2 + leg, y);
    c.moveTo(x + 2, y - 2.5);
    c.lineTo(x + 2 - leg, y);
    c.stroke();
    c.fillStyle = '#8a6040';
    c.beginPath();
    c.ellipse(x, y - 3.4 - bob, 3.2, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    // Head up and forward, ears, and a wagging tail.
    c.beginPath();
    c.ellipse(x + dir * 3.2, y - 5.2 - bob, 1.6, 1.3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#5a4030';
    c.fillRect(x + dir * 2.6 - 0.5, y - 7 - bob, 1, 1.4);
    c.strokeStyle = '#8a6040';
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(x - dir * 3, y - 3.8 - bob);
    c.lineTo(x - dir * 4.6, y - 6 - bob + Math.sin(this.time * 14) * 1);
    c.stroke();
  }

  /** A cat curled on a sunny doorstep, flicking its tail. */
  private drawCat(b: Building): void {
    const c = this.ctx;
    const [x, y] = iso(b.x + 0.55, b.y + b.h - 0.2);
    const col = ['#3a3430', '#d08a40', '#e8e0d0', '#8a8078'][b.id % 4];
    c.fillStyle = 'rgba(20,20,10,0.22)';
    c.beginPath();
    c.ellipse(x, y, 3.4, 1.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, y - 1.6, 3, 1.8, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x + 2.4, y - 3.2, 1.5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x + 1.3, y - 4.2);
    c.lineTo(x + 1.6, y - 5.8);
    c.lineTo(x + 2.4, y - 4.6);
    c.moveTo(x + 2.6, y - 4.6);
    c.lineTo(x + 3.4, y - 5.8);
    c.lineTo(x + 3.6, y - 4.1);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - 2.8, y - 1);
    c.quadraticCurveTo(x - 5, y - 1 + Math.sin(this.time * 2 + b.id) * 1.5, x - 4, y + 0.6);
    c.stroke();
  }

  /** Quiet stretches of water near the shore where ducks paddle (terrain never changes). */
  private duckSpots: number[] | null = null;
  private duckMap: Uint8Array | null = null;

  /** A duck and her ducklings paddling slow circles near the bank, spring to autumn. */
  private drawDucks(s: GameState, visible: (x: number, y: number) => boolean): void {
    const W = s.width;
    if (!this.duckSpots || this.duckMap !== s.terrain) {
      this.duckMap = s.terrain;
      this.duckSpots = [];
      const water = (x: number, y: number) => inBounds(s, x, y) && s.terrain[idx(s, x, y)] === 1;
      for (let i = 0; i < s.terrain.length; i++) {
        if (s.terrain[i] !== 1 || (Math.imul(i, 2654435761) >>> 0) % 31 !== 0) continue;
        const x = i % W;
        const y = (i / W) | 0;
        // Open water a tile from the bank: room to swim, close to the reeds.
        let open = true;
        let bank = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) open &&= water(x + dx, y + dy);
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) bank ||= !water(x + dx, y + dy);
        if (open && bank) this.duckSpots.push(i);
      }
    }
    const c = this.ctx;
    for (const i of this.duckSpots) {
      const x0 = (i % W) + 0.5;
      const y0 = ((i / W) | 0) + 0.5;
      const [vx, vy] = iso(x0, y0);
      if (!visible(vx, vy)) continue;
      const n = 5 + (i % 3);
      const t = this.time * 0.12 + i;
      const at = (a: number) => iso(x0 + Math.cos(a) * 0.7, y0 + Math.sin(a) * 0.7);
      const brood: [number, number, number, number][] = [];
      for (let k = 0; k < n; k++) {
        // The brood follows in a line behind the mother.
        const a = t - k * 0.3;
        const [sx, sy] = at(a);
        const [nx] = at(a + 0.05);
        brood.push([sx, sy, nx > sx ? 1 : -1, k]);
      }
      brood.sort((p, q) => p[1] - q[1]);
      for (const [sx, sy, face, k] of brood) {
        const r = k === 0 ? 1.5 : 0.95;
        // A little wake behind.
        c.strokeStyle = 'rgba(230,242,248,0.55)';
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(sx - face * 2.4 * r, sy);
        c.lineTo(sx - face * 6 * r, sy - 1);
        c.moveTo(sx - face * 2.4 * r, sy);
        c.lineTo(sx - face * 5.5 * r, sy + 1.5);
        c.stroke();
        c.fillStyle = k === 0 ? '#8a6a48' : '#c8b070';
        c.beginPath();
        c.ellipse(sx, sy - 1 * r, 3 * r, 1.5 * r, 0, 0, Math.PI * 2);
        c.fill();
        // Tail tip up behind.
        c.beginPath();
        c.moveTo(sx - face * 2.4 * r, sy - 1.6 * r);
        c.lineTo(sx - face * 3.6 * r, sy - 2.6 * r);
        c.lineTo(sx - face * 2 * r, sy - 0.6 * r);
        c.fill();
        const hx = sx + face * 2.2 * r;
        const hy = sy - 3.2 * r;
        c.fillStyle = k === 0 ? '#2f6a44' : '#b89a58';
        c.beginPath();
        c.arc(hx, hy, 1.15 * r, 0, Math.PI * 2);
        c.fill();
        if (k === 0) {
          c.fillStyle = '#f2ece0';
          c.fillRect(hx - 1 * r, hy + 0.9 * r, 2 * r, 0.4 * r);
        }
        c.fillStyle = '#e8a030';
        c.fillRect(face > 0 ? hx + 0.9 * r : hx - 2.1 * r, hy - 0.1, 1.2 * r, 0.6 * r);
      }
    }
  }

  /** Road tiles drawn but not laid yet: pegged out with a dashed line, the next one filling in. */
  private drawRoadPlan(s: GameState, visible: (x: number, y: number) => boolean): void {
    const plan = s.roadPlan;
    if (!plan?.length) return;
    const c = this.ctx;
    const W = s.width;
    c.save();
    c.setLineDash([3, 3]);
    c.lineWidth = 1.2;
    for (let k = 0; k < plan.length; k++) {
      const i = plan[k] >> 2;
      const paved = (plan[k] & 3) >= 2;
      const x = i % W;
      const y = (i / W) | 0;
      const [cx, cy] = iso(x + 0.5, y + 0.5);
      if (!visible(cx, cy)) continue;
      const pts = [iso(x + 0.2, y + 0.2), iso(x + 0.8, y + 0.2), iso(x + 0.8, y + 0.8), iso(x + 0.2, y + 0.8)];
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) c.lineTo(px, py);
      c.closePath();
      if (k === 0) {
        const f = Math.min(1, (s.roadWork ?? 0) * (paved ? 6 : 16));
        c.fillStyle = paved ? `rgba(150,145,135,${0.25 + 0.5 * f})` : `rgba(168,138,92,${0.25 + 0.5 * f})`;
        c.fill();
      }
      c.strokeStyle = paved ? 'rgba(120,115,105,0.9)' : 'rgba(120,90,50,0.85)';
      c.stroke();
    }
    c.restore();
  }

  /** How wet the lanes are: up with the rain, then drying over the next days. */
  private wetness = 0;

  /** Puddles in the ruts of dirt lanes after rain, rippling while it still falls. */
  private drawPuddles(s: GameState, season: Season, dt: number, visible: (x: number, y: number) => boolean): void {
    const goal = season === 3 ? 0 : showeryDay(s.day) ? 1 : showeryDay(s.day - 1) ? 0.65 : showeryDay(s.day - 2) ? 0.3 : 0;
    this.wetness += Math.max(-dt * 0.05, Math.min(dt * 0.08, goal - this.wetness));
    if (this.wetness < 0.03) return;
    const W = s.width;
    const c = this.ctx;
    const raining = showeryDay(s.day);
    for (let i = 0; i < s.road.length; i++) {
      if (s.road[i] !== 1 || s.terrain[i] || s.occ[i] >= 0) continue;
      const h = (Math.imul(i, 2654435761) >>> 0) % 7;
      if (h > 2) continue;
      const x = (i % W) + 0.3 + h * 0.18;
      const y = ((i / W) | 0) + 0.65 - h * 0.12;
      const [sx, sy] = iso(x, y);
      if (!visible(sx, sy)) continue;
      // Smaller puddles dry first.
      const size = (0.5 + h * 0.3) * Math.min(1, this.wetness * (1.4 - h * 0.15));
      if (size < 0.15) continue;
      const rx = 9 * size;
      const ry = 3.8 * size;
      c.fillStyle = 'rgba(70,82,92,0.32)';
      c.beginPath();
      c.ellipse(sx, sy, rx + 1, ry + 0.6, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(160,190,210,0.55)';
      c.beginPath();
      c.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(235,245,250,0.55)';
      c.beginPath();
      c.ellipse(sx - rx * 0.3, sy - ry * 0.25, rx * 0.35, ry * 0.25, 0, 0, Math.PI * 2);
      c.fill();
      if (raining) {
        // Rain rings spreading on the water.
        const ph = (this.time * 1.7 + h * 0.37 + i * 0.13) % 1;
        c.strokeStyle = `rgba(240,248,252,${0.6 * (1 - ph)})`;
        c.lineWidth = 0.5;
        c.beginPath();
        c.ellipse(sx + ((i * 3) % 5) - 2, sy, rx * 0.6 * ph + 0.3, ry * 0.6 * ph + 0.2, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
  }

  /** Fish shoaling under the surface, and now and then one leaping. */
  private drawShoals(s: GameState, visible: (x: number, y: number) => boolean): void {
    const c = this.ctx;
    (s.shoals ?? []).forEach((sh, k) => {
      if (sh.n < 1) return;
      const [cx, cy] = iso(sh.x, sh.y);
      if (!visible(cx, cy)) return;
      const n = Math.ceil(sh.n / 4);
      // A darker patch of water where they gather, and silver backs turning in it.
      c.fillStyle = 'rgba(20,40,60,0.18)';
      c.beginPath();
      c.ellipse(cx, cy, 30, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(190,210,220,0.6)';
      for (let j = 0; j < n; j++) {
        const a = this.time * (0.4 + j * 0.07) + j * 1.9 + k;
        const [fx, fy] = iso(sh.x + Math.cos(a) * (0.5 + j * 0.15), sh.y + Math.sin(a) * (0.4 + j * 0.1));
        const dir = -Math.sin(a) > 0 ? 1 : -1;
        c.beginPath();
        c.ellipse(fx, fy, 2.6, 0.9, 0, 0, Math.PI * 2);
        c.moveTo(fx - dir * 2.4, fy);
        c.lineTo(fx - dir * 3.8, fy - 1);
        c.lineTo(fx - dir * 3.8, fy + 1);
        c.fill();
      }
      // A fish leaps, once in a while.
      const ph = (this.time * 0.5 + k * 0.37) % 1;
      if (ph < 0.2) {
        const t = ph / 0.2;
        const [jx, jy] = iso(sh.x + 0.4, sh.y - 0.2);
        c.fillStyle = '#b8c8d0';
        c.beginPath();
        c.ellipse(jx + (t - 0.5) * 10, jy - Math.sin(t * Math.PI) * 9, 2.4, 1, (t - 0.5) * 1.6, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = `rgba(235,245,250,${0.7 * (1 - t)})`;
        c.lineWidth = 0.7;
        c.beginPath();
        c.ellipse(jx - 5, jy + 1, 3 + t * 4, 1 + t * 1.5, 0, 0, Math.PI * 2);
        c.stroke();
      }
    });
  }

  /** For each fishery, the open water tile its boat rows out to (or -1). */
  private boatSpots = new Map<number, number>();

  /** A rowing boat with a fisher casting a line, out from each working fishery. */
  private drawBoats(s: GameState, visible: (x: number, y: number) => boolean): void {
    if (this.duckMap !== s.terrain) this.boatSpots.clear();
    const W = s.width;
    const water = (x: number, y: number) => inBounds(s, x, y) && s.terrain[idx(s, x, y)] === 1;
    const c = this.ctx;
    for (const b of s.buildings) {
      if (b.type !== 'fisher' || b.build < 1 || b.workers <= 0 || b.paused) continue;
      // Out on the shoal the fisher works, once it is at sea; otherwise near home.
      const sh = nearestShoal(s, b);
      let spot = -1;
      if (sh) {
        const ox = ((b.id * 7) % 5) * 0.4 - 0.8;
        const oy = ((b.id * 3) % 5) * 0.3 - 0.6;
        const tx = Math.floor(sh.x + ox);
        const ty = Math.floor(sh.y + oy);
        spot = water(tx, ty) ? ty * W + tx : Math.floor(sh.y) * W + Math.floor(sh.x);
      } else {
        spot = this.boatSpots.get(b.id) ?? -1;
        if (!this.boatSpots.has(b.id)) {
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
          this.boatSpots.set(b.id, spot);
        }
      }
      if (spot < 0) continue;
      const t = this.time;
      const x = (spot % W) + 0.5 + Math.sin(t * 0.07 + b.id) * 0.25;
      const y = ((spot / W) | 0) + 0.5 + Math.cos(t * 0.05 + b.id) * 0.2;
      const [sx, sy0] = iso(x, y);
      if (!visible(sx, sy0)) continue;
      const sy = sy0 + Math.sin(t * 1.6 + b.id) * 0.6;
      const f = b.id % 2 ? 1 : -1;
      // Ripples round the hull.
      c.strokeStyle = 'rgba(230,242,248,0.45)';
      c.lineWidth = 0.7;
      c.beginPath();
      c.ellipse(sx, sy0 + 1, 14 + Math.sin(t * 1.6) * 1, 4.5, 0, 0, Math.PI * 2);
      c.stroke();
      // Hull: a dark wooden boat seen from the side, bow up at one end.
      c.fillStyle = '#5a3e26';
      c.beginPath();
      c.moveTo(sx - 11 * f, sy - 4);
      c.lineTo(sx + 12 * f, sy - 5.5);
      c.quadraticCurveTo(sx + 9 * f, sy + 1.5, sx + 4 * f, sy + 1.5);
      c.lineTo(sx - 7 * f, sy + 1.5);
      c.quadraticCurveTo(sx - 10 * f, sy + 0.5, sx - 11 * f, sy - 4);
      c.fill();
      c.fillStyle = '#7a5636';
      c.fillRect(Math.min(sx - 10 * f, sx + 11 * f), sy - 5, 21, 1.4);
      // The fisher, seated, rod out over the water.
      this.drawFolk(sx - 3 * f, sy - 1.5, 0.85 * FOLK_SCALE, '#6a7a5a', '#4a3020', 0, f, false, true);
      const rx = sx + 1 * f;
      const ry = sy - 9;
      const tx = rx + 16 * f;
      const ty = ry - 9 + Math.sin(t * 0.9 + b.id) * 1.2;
      c.strokeStyle = '#6b4a2e';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(rx, ry);
      c.lineTo(tx, ty);
      c.stroke();
      c.strokeStyle = 'rgba(240,240,230,0.7)';
      c.lineWidth = 0.4;
      c.beginPath();
      c.moveTo(tx, ty);
      c.lineTo(tx + 2 * f, sy + 3);
      c.stroke();
      c.fillStyle = '#d84a30';
      c.beginPath();
      c.arc(tx + 2 * f, sy + 3 + Math.sin(t * 2.3 + b.id) * 0.5, 0.9, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Two or three hens pecking about a home's front yard. */
  private drawChickens(b: Building): void {
    const c = this.ctx;
    const n = 2 + (b.id % 2);
    for (let k = 0; k < n; k++) {
      const seed = b.id * 13 + k * 7;
      const t = this.time * 0.35 + seed;
      const x = b.x + 0.35 + ((seed % 5) / 5) * (b.w - 0.5) + Math.sin(t) * 0.15;
      const y = b.y + b.h + 0.18 + ((seed % 3) / 3) * 0.25 + Math.cos(t * 0.8) * 0.08;
      const [sx, sy] = iso(x, y);
      c.save();
      c.translate(sx, sy);
      c.scale(1.5, 1.5);
      c.translate(-sx, -sy);
      const face = Math.cos(t) > 0 ? 1 : -1;
      const peck = Math.sin(this.time * 3 + seed) > 0.6;
      const body = k === 1 ? '#b8743a' : '#f2ece0';
      c.fillStyle = 'rgba(20,20,10,0.22)';
      c.beginPath();
      c.ellipse(sx, sy, 2.4, 0.9, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#c89a38';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(sx - 0.5, sy - 1.5);
      c.lineTo(sx - 0.5, sy);
      c.moveTo(sx + 0.5, sy - 1.5);
      c.lineTo(sx + 0.5, sy);
      c.stroke();
      c.fillStyle = body;
      c.beginPath();
      c.ellipse(sx, sy - 2.6, 2.3, 1.6, 0, 0, Math.PI * 2);
      c.fill();
      // The head, down to the ground when pecking.
      const hx = sx + face * 2;
      const hy = sy - (peck ? 1 : 4);
      c.beginPath();
      c.arc(hx, hy, 1.1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#d8352a';
      c.fillRect(hx - 0.4, hy - 1.6, 0.9, 0.7);
      c.fillStyle = '#e8b030';
      c.fillRect(hx + face * 0.9 - (face < 0 ? 0.7 : 0), hy - 0.2, 0.7, 0.5);
      c.restore();
    }
  }

  /** A soft window glow on the front of a building. */
  private drawLamplight(s: GameState, b: Building): void {
    const c = this.ctx;
    const at: [number, number, number] = b.type === 'house' ? homeWindow(b.level, variantOf(s, b)) : [b.w * 0.75, b.h, 9];
    const [x, y] = iso(b.x + at[0], b.y + at[1], at[2]);
    // One glow drawn once and stamped on every lit window: cheap in big towns.
    if (!this.glow) {
      const g = document.createElement('canvas');
      g.width = g.height = 36;
      const gc = g.getContext('2d')!;
      const grad = gc.createRadialGradient(18, 18, 0, 18, 18, 18);
      grad.addColorStop(0, 'rgba(255,214,120,0.95)');
      grad.addColorStop(1, 'rgba(255,190,90,0)');
      gc.fillStyle = grad;
      gc.fillRect(0, 0, 36, 36);
      this.glow = g;
    }
    c.globalAlpha = Math.min(1, (this.dusk - 0.25) / 0.5);
    c.drawImage(this.glow, x - 18, y - 18);
    c.globalAlpha = 1;
  }
  private glow: HTMLCanvasElement | null = null;

  /** The great tapestry's design flies on a tall banner beside the manor. */
  private drawHeraldry(b: Building): void {
    const p = new Pen(this.ctx);
    const x = b.x + b.w + 0.25;
    const y = b.y + b.h - 0.4;
    p.line([x, y, 0], [x, y, 58], '#4a3020', 1.6);
    p.line([x - 0.25, y + 0.25, 56], [x + 0.25, y - 0.25, 56], '#4a3020', 1.4);
    const sway = Math.sin(this.time * 1.3) * 1.5;
    // A long swallow-tailed banner: crimson field, gold band, a blue lozenge.
    // In the lord's colours: the field, a band of the second tincture, the charge's colour.
    const arms = HERALDRY.current;
    p.poly([[x - 0.22, y + 0.22, 55], [x + 0.22, y - 0.22, 55], [x + 0.22, y - 0.22, 26 + sway], [x, y, 31 + sway], [x - 0.22, y + 0.22, 26 + sway]], arms.field);
    p.poly([[x - 0.22, y + 0.22, 47], [x + 0.22, y - 0.22, 47], [x + 0.22, y - 0.22, 43], [x - 0.22, y + 0.22, 43]], arms.second);
    p.poly([[x, y, 41], [x + 0.1, y - 0.1, 36], [x, y, 31], [x - 0.1, y + 0.1, 36]], arms.chargeColor);
  }



  private drawFeast(b: Building): void {
    const p = new Pen(this.ctx);
    const y = b.y + b.h - 0.32;
    const x0 = b.x + 0.95;
    const x1 = b.x + 2.1;
    // A long table with a cloth, loaves and a cask at the end.
    p.box(x0, y - 0.12, x1, y + 0.12, 0, 4, '#8a6238', '#e8dcc0');
    for (let k = 0; k < 4; k++) p.circle(x0 + 0.18 + k * 0.28, y, 5, 1.6, k % 2 ? '#c8913c' : '#b8483a');
    p.barrel(x1 + 0.22, y);
    // Bunting from the manor's corner to a pole across the yard.
    const a: [number, number, number] = [b.x + 0.2, b.y + b.h - 0.05, 20];
    const c: [number, number, number] = [b.x + b.w - 0.05, b.y + b.h - 0.05, 20];
    p.line([a[0], a[1], 0], a, '#6b4a2e', 1.2);
    p.line([c[0], c[1], 0], c, '#6b4a2e', 1.2);
    const colors = ['#b8483a', '#e8c048', '#3a5a8a', '#f2ead8'];
    const n = 9;
    let prev = a;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const sag = Math.sin(t * Math.PI) * 4;
      const pt: [number, number, number] = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] - sag];
      p.line(prev, pt, '#5a4030', 0.7);
      const mid: [number, number, number] = [(prev[0] + pt[0]) / 2, (prev[1] + pt[1]) / 2, (prev[2] + pt[2]) / 2];
      p.poly([prev, pt, [mid[0], mid[1], mid[2] - 4]], colors[k % colors.length]);
      prev = pt;
    }
  }

  /**
   * Piles of goods in a storage yard, one pile per slot, so a filling
   * storehouse visibly fills up.
   */
  private drawStock(s: GameState, b: Building, season: Season): void {
    const p = new Pen(this.ctx);
    p.snow = season === 3;
    if (b.type === 'camp') {
      // The settlers' things: logs, stone and sacks of food beside the tents.
      const fill = (kind: StorageKind) => Math.min(1, stored(s, kind) / Math.max(1, storageCap(s, kind)));
      const wood = s.res.wood + s.res.planks;
      const stone = s.res.stone;
      if (wood >= 1) p.logPile(b.x + 2.25, b.y + 1.85, Math.min(4, 1 + Math.ceil(fill('materials') * 3)));
      if (wood >= 40) p.logPile(b.x + 2.3, b.y + 2.5, 2);
      if (stone >= 1) p.stonePile(b.x + 1.45, b.y + 2.35, Math.min(6, 2 + Math.ceil((stone / 40) * 4)));
      const sacks = Math.ceil(fill('food') * 5);
      for (let k = 0; k < sacks; k++) p.sack(b.x + 2.35 + (k % 3) * 0.17, b.y + 0.9 + Math.floor(k / 3) * 0.2 + (k % 2) * 0.04, k % 2 ? '#cdbb8e' : '#d8c79c');
      return;
    }
    const kinds: StorageKind[] = b.type === 'storehouse' ? ['materials'] : ['food'];
    const slots: [number, number][] =
      b.type === 'townhall'
        ? [
            [0.45, 2.55],
            [2.3, 2.75],
            [2.75, 2.25],
            [0.35, 2.05],
          ]
        : [
            [0.45, 1.8],
            [1.05, 1.8],
            [1.65, 1.8],
            [2.25, 1.8],
            [0.45, 2.45],
            [1.05, 2.45],
            [1.65, 2.45],
            [2.25, 2.45],
          ];
    const per = Math.floor(slots.length / kinds.length);
    let slot = 0;
    for (const kind of kinds) {
      const cap = storageCap(s, kind);
      if (!cap) continue;
      const ids = (Object.keys(RESOURCE_STORAGE) as ResourceId[]).filter((r) => RESOURCE_STORAGE[r] === kind && s.res[r] >= 1);
      const total = ids.reduce((a, r) => a + s.res[r], 0);
      const filled = Math.min(per, Math.ceil((total / cap) * per));
      // Hand out filled slots to goods in proportion to how much there is.
      const order = ids.sort((a, c) => s.res[c] - s.res[a]);
      const counts = order.map((r) => Math.max(1, Math.round((s.res[r] / Math.max(1, total)) * filled)));
      let k = 0;
      for (let oi = 0; oi < order.length && k < filled; oi++) {
        for (let n = 0; n < counts[oi] && k < filled; n++, k++) {
          const [lx, ly] = slots[slot + k];
          drawGood(p, order[oi], b.x + lx, b.y + ly);
        }
      }
      slot += per;
    }
  }

  /** Poles and planks around a building being renovated. */
  private drawScaffold(b: Building): void {
    const p = new Pen(this.ctx);
    const h = b.type === 'townhall' ? 60 : 44;
    const corners: [number, number][] = [
      [b.x + 0.1, b.y + 0.1],
      [b.x + b.w - 0.1, b.y + 0.1],
      [b.x + b.w - 0.1, b.y + b.h - 0.1],
      [b.x + 0.1, b.y + b.h - 0.1],
    ];
    for (const [x, y] of corners) p.line([x, y, 0], [x, y, h], '#7b5a36', 1.6);
    for (const z of [h * 0.35, h * 0.7, h]) {
      p.line([corners[3][0], corners[3][1], z], [corners[2][0], corners[2][1], z], '#8a6a44', 1.2);
      p.line([corners[2][0], corners[2][1], z], [corners[1][0], corners[1][1], z], '#8a6a44', 1.2);
    }
    const got = deliveredTo(b);
    if ((got.planks ?? 0) + (got.wood ?? 0) > 0) p.logPile(b.x + b.w + 0.05, b.y + b.h - 0.5, 2);
    if ((got.stone ?? 0) > 0) p.stonePile(b.x + 0.2, b.y + b.h + 0.05, 3);
  }

  /** A bobbing bubble over a building: a glyph, or the good it is waiting for. */
  private drawMarker(b: Building, color: string, glyph: string, good?: ResourceId): void {
    const c = this.ctx;
    const [x, y] = iso(b.x + b.w / 2, b.y + b.h / 2, 46 + Math.sin(this.time * 3) * 3);
    const icon = good ? goodIcon(good) : null;
    const r = icon ? 10 : 8;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.arc(x + 1, y + 1, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = icon ? '#fff3d6' : color;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = icon ? color : '#fff6dc';
    c.lineWidth = icon ? 2 : 1.5;
    c.stroke();
    if (icon) {
      c.drawImage(icon, x - 7.5, y - 7.5, 15, 15);
      return;
    }
    c.fillStyle = '#fff';
    c.font = 'bold 11px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(glyph, x, y + 0.5);
  }

  private drawConstruction(b: Building, sp: Sprite, wx: number, wy: number): void {
    const c = this.ctx;
    const p = new Pen(c);
    // Dirt foundation.
    p.poly(
      [
        [b.x + 0.15, b.y + 0.15, 0],
        [b.x + b.w - 0.15, b.y + 0.15, 0],
        [b.x + b.w - 0.15, b.y + b.h - 0.15, 0],
        [b.x + 0.15, b.y + b.h - 0.15, 0],
      ],
      '#9a7a50',
      '#6e5434',
      1,
    );
    // The finished building rising from the ground.
    const groundY = sp.ay + (b.w + b.h) * (TH / 2);
    const prog = Math.max(0, (b.build - 0.15) / 0.85);
    if (prog > 0) {
      const visibleH = groundY * prog;
      const sy = groundY - visibleH;
      c.save();
      c.globalAlpha = 0.85;
      c.drawImage(sp.canvas, 0, sy * 2, sp.w * 2, (sp.h - sy) * 2, wx - sp.ax, wy - sp.ay + sy, sp.w, sp.h - sy);
      c.restore();
    }
    // Scaffolding posts.
    const h = 14 + 22 * Math.min(1, b.build * 1.3);
    const corners: [number, number][] = [
      [b.x + 0.2, b.y + 0.2],
      [b.x + b.w - 0.2, b.y + 0.2],
      [b.x + b.w - 0.2, b.y + b.h - 0.2],
      [b.x + 0.2, b.y + b.h - 0.2],
    ];
    for (const [x, y] of corners) p.line([x, y, 0], [x, y, h], '#7b5a36', 1.6);
    for (const zz of [h * 0.5, h]) {
      for (let k = 0; k < 4; k++) {
        const a = corners[k];
        const bb = corners[(k + 1) % 4];
        p.line([a[0], a[1], zz], [bb[0], bb[1], zz], '#8a6a44', 1);
      }
    }
    // Materials delivered so far, stacked beside the site.
    const got = deliveredTo(b);
    const wood = got.wood ?? 0;
    const stone = got.stone ?? 0;
    const planks = got.planks ?? 0;
    if (wood > 0) p.logPile(b.x + b.w - 0.1, b.y + b.h - 0.6, Math.min(3, 1 + Math.floor(wood / 8)));
    if (stone > 0) p.stonePile(b.x + 0.15, b.y + b.h - 0.35, Math.min(6, 1 + Math.floor(stone / 6)));
    if (planks > 0) {
      for (let i = 0; i < Math.min(4, 1 + Math.floor(planks / 6)); i++) {
        p.box(b.x + b.w - 0.7, b.y + 0.15, b.x + b.w - 0.25, b.y + 0.35, i * 2.2, 2, i % 2 ? '#d7b47c' : '#c8a46c');
      }
    }
    // Progress bar.
    const [bx, by] = iso(b.x + b.w / 2, b.y + b.h / 2, h + 18);
    c.fillStyle = 'rgba(40,28,16,0.75)';
    c.fillRect(bx - 18, by - 3, 36, 6);
    c.fillStyle = '#e8c860';
    c.fillRect(bx - 17, by - 2, 34 * b.build, 4);
  }

  private drawGhost(s: GameState, g: Ghost, season: Season): void {
    const d = BUILDINGS[g.type];
    const p = new Pen(this.ctx);
    p.poly(
      [
        [g.x, g.y, 0],
        [g.x + d.w, g.y, 0],
        [g.x + d.w, g.y + d.h, 0],
        [g.x, g.y + d.h, 0],
      ],
      g.ok ? 'rgba(120,220,120,0.35)' : 'rgba(230,70,50,0.4)',
      g.ok ? 'rgba(170,255,170,0.9)' : 'rgba(255,120,100,0.9)',
      1.5,
    );
    const sp = this.buildingSprite(g.type, 1, season);
    const [wx, wy] = iso(g.x, g.y);
    this.blit(sp, wx, wy, 0.65);
    void s;
  }

  /** Villagers are drawn a little under their sprite size, so doors and eaves stand above them. */
  private drawAgent(a: Agent): void {
    const c = this.ctx;
    const [wx, wy] = iso(a.x + a.ox * 0.25, a.y + a.oy * 0.25);
    c.save();
    c.translate(wx, wy);
    c.scale(FOLK_SCALE, FOLK_SCALE);
    c.translate(-wx, -wy);
    this.drawAgentBody(a);
    c.restore();
  }

  private drawAgentBody(a: Agent): void {
    if (a.role.kind === 'cart') {
      this.drawCart(a);
      return;
    }
    const c = this.ctx;
    const [wx, wy] = iso(a.x + a.ox * 0.25, a.y + a.oy * 0.25);
    const walking = a.phase === 'walk';
    const bob = walking ? Math.abs(Math.sin(a.step)) * 1.2 : 0;
    const legA = walking ? Math.sin(a.step) * 2 : 0;
    c.globalAlpha = a.fadeIn;
    if (a.key === this.selectedAgent) {
      // A gold ring at the feet of the villager being looked at.
      c.strokeStyle = '#e8c048';
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(wx, wy, 6.5, 3, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // Shadow.
    c.fillStyle = 'rgba(20,20,10,0.3)';
    c.beginPath();
    c.ellipse(wx, wy, 4, 1.8, 0, 0, Math.PI * 2);
    c.fill();
    if (!this.light && a.role.kind !== 'guard' && walking && hashKey(a.key) % 9 === 0) this.drawDog(wx - 9 * a.dir, wy + 1, a.dir, a.step);
    if (this.dusk > 0.35 && !this.light && a.key.charCodeAt(a.key.length - 1) % 3 !== 0) {
      // A lantern after dark, and the warm light it throws on the ground.
      const glow = Math.min(1, (this.dusk - 0.35) / 0.3) * (0.9 + 0.1 * Math.sin(this.time * 9 + a.step));
      const lx = wx + 4 * a.dir;
      const ly = wy - 6 - bob + Math.sin(a.step) * 0.6;
      this.nightLights.push(lx, wy - 3, glow);
      c.strokeStyle = '#3a2c20';
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(lx, ly - 2);
      c.lineTo(wx + 2 * a.dir, wy - 7 - bob);
      c.stroke();
      c.fillStyle = `rgba(255,214,120,${glow})`;
      c.fillRect(lx - 1.1, ly - 1.8, 2.2, 2.8);
      c.fillStyle = '#3a2c20';
      c.fillRect(lx - 1.4, ly - 2.4, 2.8, 0.7);
    }
    // Legs.
    c.strokeStyle = '#3a2c20';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(wx - 1, wy - 4 - bob);
    c.lineTo(wx - 1 + legA, wy);
    c.moveTo(wx + 1, wy - 4 - bob);
    c.lineTo(wx + 1 - legA, wy);
    c.stroke();
    // Body.
    c.fillStyle = a.tunic;
    c.beginPath();
    c.moveTo(wx - 3, wy - 4 - bob);
    c.lineTo(wx + 3, wy - 4 - bob);
    c.lineTo(wx + 2.4, wy - 10.5 - bob);
    c.lineTo(wx - 2.4, wy - 10.5 - bob);
    c.closePath();
    c.fill();
    // Head.
    c.fillStyle = '#e8c4a0';
    c.beginPath();
    c.arc(wx, wy - 12.5 - bob, 2.2, 0, Math.PI * 2);
    c.fill();
    if (a.role.kind === 'guard') {
      // Men-at-arms: livery tabard stripe, kettle helmet and a pike.
      c.fillStyle = '#e8d070';
      c.fillRect(wx - 0.6, wy - 10.5 - bob, 1.2, 6.5);
      c.fillStyle = '#8a9096';
      c.beginPath();
      c.arc(wx, wy - 13.2 - bob, 2.5, Math.PI, 0);
      c.fill();
      c.fillRect(wx - 3.4, wy - 13.4 - bob, 6.8, 0.9);
      const px = wx + 3.2 * a.dir;
      c.strokeStyle = '#5a3e26';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px, wy - 1);
      c.lineTo(px, wy - 22 - bob);
      c.stroke();
      c.fillStyle = '#b8bec4';
      c.beginPath();
      c.moveTo(px - 1.2, wy - 22 - bob);
      c.lineTo(px, wy - 25.5 - bob);
      c.lineTo(px + 1.2, wy - 22 - bob);
      c.fill();
      c.globalAlpha = 1;
      return;
    }
    c.fillStyle = a.hair;
    c.beginPath();
    c.arc(wx, wy - 13.2 - bob, 2.2, Math.PI, 0);
    c.fill();
    // Tool animation while acting.
    if (a.phase === 'act') {
      const swing = Math.sin(a.step * 1.6);
      const ang = -0.6 + swing * 0.9;
      const hx = wx + a.dir * 2;
      const hy = wy - 8;
      const tx = hx + Math.cos(ang) * 7 * a.dir;
      const ty = hy + Math.sin(ang) * 7;
      c.strokeStyle = '#6b4a2e';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(tx, ty);
      c.stroke();
      if (a.act === 'chop' || a.act === 'dig' || a.act === 'hammer' || a.act === 'scythe' || a.act === 'hoe') {
        c.fillStyle = '#a8adb2';
        c.fillRect(tx - 1.5, ty - 1.5, 3, 3);
      }
      if (a.act === 'fish') {
        c.strokeStyle = 'rgba(240,240,240,0.7)';
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(tx, ty);
        c.lineTo(tx + a.dir * 6, wy + 4);
        c.stroke();
      }
    }
    // Carried goods.
    if (a.carry) {
      // Loads are drawn large, so who carries what reads at a glance.
      const ly = wy - 17 - bob;
      c.save();
      c.translate(wx, ly);
      c.scale(1.7, 1.7);
      drawCarried(c, a.carry, 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  /** A merchant's covered cart pulled by a horse. */
  private drawCart(a: Agent): void {
    const c = this.ctx;
    const [wx, wy] = iso(a.x, a.y);
    const f = a.dir;
    const walking = a.phase === 'walk';
    const leg = walking ? Math.sin(a.step * 1.4) * 2 : 0;
    c.globalAlpha = a.fadeIn;
    c.fillStyle = 'rgba(20,20,10,0.3)';
    c.beginPath();
    c.ellipse(wx, wy, 16, 5, 0, 0, Math.PI * 2);
    c.fill();
    // Horse in front.
    const hx = wx + 11 * f;
    c.strokeStyle = '#3e2c1e';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(hx - 3, wy - 6);
    c.lineTo(hx - 3 + leg, wy);
    c.moveTo(hx + 3, wy - 6);
    c.lineTo(hx + 3 - leg, wy);
    c.stroke();
    c.fillStyle = '#6b4a30';
    c.beginPath();
    c.ellipse(hx, wy - 8, 6, 3.2, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(hx + 4 * f, wy - 9);
    c.lineTo(hx + 8 * f, wy - 14);
    c.lineTo(hx + 10 * f, wy - 12);
    c.lineTo(hx + 6 * f, wy - 7);
    c.fill();
    // Shafts, wheels and the covered cart.
    c.strokeStyle = '#5e4129';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(wx + 2 * f, wy - 6);
    c.lineTo(hx - 2 * f, wy - 8);
    c.stroke();
    c.fillStyle = '#8a6236';
    c.fillRect(wx - 8, wy - 9, 14, 5);
    c.fillStyle = '#efe6d2';
    c.beginPath();
    c.moveTo(wx - 8, wy - 9);
    c.quadraticCurveTo(wx - 1, wy - 22, wx + 6, wy - 9);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(90,70,40,0.5)';
    c.stroke();
    c.strokeStyle = '#3e2c1e';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(wx - 4, wy - 3, 3, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
  }

  /** A brown (in winter, paler) rabbit: hopping, or sitting up with its ears high. */
  private drawRabbit(a: Animal, season: Season): void {
    const c = this.ctx;
    const [wx, wy] = iso(a.x, a.y);
    const f = a.dir;
    const hop = a.grazing ? 0 : Math.abs(Math.sin(a.step)) * 3;
    const coat = season === 3 ? '#b8a890' : '#8a6a4a';
    c.globalAlpha = a.alpha;
    c.fillStyle = 'rgba(20,20,10,0.22)';
    c.beginPath();
    c.ellipse(wx, wy, 3, 1.1, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = coat;
    c.beginPath();
    c.ellipse(wx, wy - 2.2 - hop, 2.8, 2, 0, 0, Math.PI * 2);
    c.fill();
    // Head and ears.
    const hx = wx + 2.2 * f;
    const hy = wy - 3.6 - hop;
    c.beginPath();
    c.arc(hx, hy, 1.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = coat;
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(hx - 0.3 * f, hy - 0.8);
    c.lineTo(hx - 1.2 * f, hy - (a.grazing ? 4 : 3));
    c.moveTo(hx + 0.3 * f, hy - 0.8);
    c.lineTo(hx - 0.2 * f, hy - (a.grazing ? 4.2 : 3.2));
    c.stroke();
    // White scut.
    c.fillStyle = '#f4efe6';
    c.beginPath();
    c.arc(wx - 2.6 * f, wy - 2.6 - hop, 0.8, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  private drawAnimal(a: Animal, season: Season): void {
    if (a.kind === 'rabbit') {
      this.drawRabbit(a, season);
      return;
    }
    const c = this.ctx;
    const [wx, wy] = iso(a.x, a.y);
    const f = a.dir;
    const run = a.grazing ? 0 : Math.sin(a.step) * 1.6;
    c.globalAlpha = a.alpha;
    c.fillStyle = 'rgba(20,20,10,0.25)';
    c.beginPath();
    c.ellipse(wx, wy, 6, 2, 0, 0, Math.PI * 2);
    c.fill();
    const coat = season === 3 ? '#7a5e46' : '#9a6a3e';
    // Legs.
    c.strokeStyle = '#4a3424';
    c.lineWidth = 1;
    c.beginPath();
    for (const [lx, ph] of [
      [-3.5, 1],
      [-2, -1],
      [2.5, -1],
      [4, 1],
    ]) {
      c.moveTo(wx + lx * f, wy - 6);
      c.lineTo(wx + lx * f + run * ph, wy);
    }
    c.stroke();
    // Body.
    c.fillStyle = coat;
    c.beginPath();
    c.ellipse(wx, wy - 7.5, 6, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f2e8d8';
    c.beginPath();
    c.ellipse(wx - 5.5 * f, wy - 8, 1.4, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    // Neck and head: lowered while grazing.
    const hx = wx + 6 * f;
    const hy = a.grazing ? wy - 4 : wy - 13;
    c.strokeStyle = coat;
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(wx + 4 * f, wy - 8.5);
    c.lineTo(hx, hy);
    c.stroke();
    c.fillStyle = coat;
    c.beginPath();
    c.ellipse(hx + 1.2 * f, hy, 2.2, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#5a3e26';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(hx - 0.5 * f, hy - 1.2);
    c.lineTo(hx - 1.5 * f, hy - 4.5);
    c.moveTo(hx + 0.8 * f, hy - 1.2);
    c.lineTo(hx + 0.6 * f, hy - 4.5);
    c.stroke();
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- effects

  private updateSmoke(s: GameState, dt: number, season: Season): void {
    this.smokeTimer -= dt;
    const rate = season === 3 ? 0.05 : 0.12;
    if (this.smokeTimer <= 0 && dt > 0) {
      this.smokeTimer = rate;
      for (const b of s.buildings) {
        if (b.build < 1) continue;
        const active = b.residents > 0 || b.workers > 0;
        if (!active || Math.random() > 0.35) continue;
        // Steam rising from the brewhouse coppers while the brewer works.
        if (!this.light && b.type === 'brewhouse' && b.workers > 0 && !b.paused && (b.output > 0 || b.lastOutput > 0)) {
          const [vx, vy] = iso(b.x + 0.95, b.y + 0.85, 40);
          for (let k = 0; k < 2; k++) this.particles.push({ x: vx + (Math.random() - 0.5) * 6, y: vy, vx: this.wind * 4 + Math.random() * 2, vy: -16 - Math.random() * 8, life: 0, max: 1.2 + Math.random() * 0.6, size: 2.4 + Math.random(), steam: true });
        }
        // Forges at work throw sparks from the anvil.
        if (!this.light && (b.type === 'smithy' || b.type === 'armoury' || b.type === 'bloomery') && b.workers > 0 && !b.paused && (b.output > 0 || b.lastOutput > 0)) {
          const [ax, ay] = iso(b.x + b.w * 0.8, b.y + b.h - 0.05, 6);
          for (let k = 0; k < 4; k++) this.sparks.push({ x: ax, y: ay, vx: (Math.random() - 0.5) * 30, vy: -18 - Math.random() * 22, life: 0, max: 0.5 + Math.random() * 0.4 });
        }
        const sp = this.buildingSprite(b.type, b.level, season, variantOf(s, b));
        for (const [x, y, z] of sp.smoke) {
          const [wx, wy] = iso(b.x + x, b.y + y, z);
          this.particles.push({
            x: wx + (Math.random() - 0.5) * 2,
            y: wy,
            vx: this.wind * 5 + Math.random() * 2 - 1,
            vy: -10 - Math.random() * 6,
            life: 0,
            max: 2.5 + Math.random() * 1.5,
            size: 1.8 + Math.random(),
          });
        }
      }
    }
    // One wind for the whole land, slowly veering and gusting.
    this.wind = 0.9 * Math.sin(this.time * 0.006 + 0.6) + 0.35 * Math.sin(this.time * 0.017 + 1);
    for (const p of this.particles) {
      p.life += dt;
      p.vx += this.wind * 3 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
    for (const p of this.sparks) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 70 * dt;
    }
    this.sparks = this.sparks.filter((p) => p.life < p.max);
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);
  }

  private sparks: { x: number; y: number; vx: number; vy: number; life: number; max: number }[] = [];
  /** The wind across the land: negative blows left, positive right, near 0 is still. */
  private wind = 0.5;

  private drawSparks(): void {
    const c = this.ctx;
    for (const p of this.sparks) {
      const t = p.life / p.max;
      c.fillStyle = `rgba(255,${Math.round(200 - t * 120)},60,${1 - t})`;
      c.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
    }
  }

  private snow: { x: number; y: number; s: number }[] = [];
  private clouds: { x: number; y: number; rx: number; ry: number }[] = [];
  private lastCam = { x: 0, y: 0, zoom: 1 };

  /** Cloud shadows and birds live in the world, so they stay put when panning. */
  private drawSky(s: GameState, season: Season, dt: number): void {
    const c = this.ctx;
    const minX = -s.height * (TW / 2) - 600;
    const maxX = s.width * (TW / 2) + 600;
    const maxY = (s.width + s.height) * (TH / 2);
    if (!this.clouds.length) {
      for (let k = 0; k < 9; k++) {
        this.clouds.push({ x: minX + Math.random() * (maxX - minX), y: Math.random() * maxY, rx: 240 + Math.random() * 200, ry: 90 + Math.random() * 60 });
      }
    }
    c.fillStyle = 'rgba(20,30,40,0.075)';
    for (const cl of this.clouds) {
      cl.x += 12 * this.wind * dt;
      cl.y += 2 * dt;
      if (cl.x - cl.rx > maxX || cl.x + cl.rx < minX) {
        cl.x = cl.x > maxX ? minX - cl.rx : maxX + cl.rx;
        cl.y = Math.random() * maxY;
      }
      if (cl.y - cl.ry > maxY) cl.y = -cl.ry;
      c.beginPath();
      c.ellipse(cl.x, cl.y, cl.rx, cl.ry, 0.15, 0, Math.PI * 2);
      c.fill();
    }
    this.drawBirds(season, dt);
  }

  /** Snow and leaves fall in screen space but drift with the camera. */
  private drawWeather(s: GameState, season: Season, dt: number): void {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const t = this.time;
    const z = this.cam.zoom;
    const shiftX = (this.cam.x - this.lastCam.x) * z;
    const shiftY = (this.cam.y - this.lastCam.y) * z;
    this.lastCam = { x: this.cam.x, y: this.cam.y, zoom: z };
    const wrap = (f: { x: number; y: number }) => {
      f.x -= shiftX;
      f.y -= shiftY;
      if (f.x < -10) f.x += this.width + 20;
      if (f.x > this.width + 10) f.x -= this.width + 20;
      if (f.y < -10) f.y += this.height + 20;
      if (f.y > this.height + 10) {
        f.y = -5;
        f.x = Math.random() * this.width;
      }
    };
    if (season === 3) {
      if (this.snow.length < 220) {
        for (let k = 0; k < 220; k++) this.snow.push({ x: Math.random() * this.width, y: Math.random() * this.height, s: 0.5 + Math.random() });
      }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of this.snow) {
        f.y += (20 + f.s * 25) * dt;
        f.x += Math.sin(t + f.s * 10) * 10 * dt;
        wrap(f);
        c.fillRect(f.x, f.y, 1.2 + f.s, 1.2 + f.s);
      }
    } else if (season === 2) {
      // A few falling leaves.
      if (this.snow.length < 40) {
        for (let k = 0; k < 40; k++) this.snow.push({ x: Math.random() * this.width, y: Math.random() * this.height, s: Math.random() });
      }
      for (const f of this.snow.slice(0, 40)) {
        f.y += (14 + f.s * 10) * dt;
        f.x += Math.sin(t * 1.5 + f.s * 10) * 20 * dt;
        wrap(f);
        c.fillStyle = f.s < 0.5 ? 'rgba(200,120,40,0.8)' : 'rgba(220,170,60,0.8)';
        c.fillRect(f.x, f.y, 3, 2);
      }
    } else if (this.snow.length) {
      this.snow = [];
    }
    this.drawRain(s, season, dt, wrap);
  }

  private rain: { x: number; y: number; s: number }[] = [];
  /** How heavy the shower is now, easing towards today's weather. */
  private rainLevel = 0;

  /** Spring brings a passing shower about one day in three, chosen by the date. */
  private drawRain(s: GameState, season: Season, dt: number, wrap: (f: { x: number; y: number }) => void): void {
    const showery = showeryDay(s.day);
    void season;
    const goal = showery ? 1 : 0;
    this.rainLevel += Math.max(-dt * 0.4, Math.min(dt * 0.4, goal - this.rainLevel));
    if (this.rainLevel <= 0.01) {
      if (this.rain.length) this.rain = [];
      return;
    }
    const c = this.ctx;
    // The light dims a little under the clouds.
    c.fillStyle = `rgba(40,55,75,${0.12 * this.rainLevel})`;
    c.fillRect(0, 0, this.width, this.height);
    const n = Math.round(260 * this.rainLevel);
    while (this.rain.length < n) this.rain.push({ x: Math.random() * this.width, y: Math.random() * this.height, s: Math.random() });
    if (this.rain.length > n) this.rain.length = n;
    c.strokeStyle = 'rgba(205,220,240,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    for (const f of this.rain) {
      f.y += (420 + f.s * 200) * dt;
      f.x -= (60 + f.s * 30) * dt;
      wrap(f);
      const len = 8 + f.s * 6;
      c.moveTo(f.x, f.y);
      c.lineTo(f.x + len * 0.15, f.y - len);
    }
    c.stroke();
  }

  private birds: { x: number; y: number; vx: number; vy: number; n: number; seed: number }[] = [];
  private birdTimer = 3;

  /** Small flocks crossing the view outside winter (world coordinates). */
  private drawBirds(season: Season, dt: number): void {
    const c = this.ctx;
    this.birdTimer -= dt;
    const [vx0, vy0] = this.screenToWorld(0, 0);
    const [vx1, vy1] = this.screenToWorld(this.width, this.height);
    if (season !== 3 && this.birdTimer <= 0 && this.birds.length < 2) {
      this.birdTimer = 15 + Math.random() * 25;
      const fromLeft = Math.random() < 0.5;
      this.birds.push({
        x: fromLeft ? vx0 - 80 : vx1 + 80,
        y: vy0 + (vy1 - vy0) * (0.1 + Math.random() * 0.5),
        vx: (fromLeft ? 1 : -1) * (40 + Math.random() * 20),
        vy: (Math.random() - 0.5) * 10,
        n: 3 + Math.floor(Math.random() * 5),
        seed: Math.random() * 100,
      });
    }
    c.strokeStyle = 'rgba(40,36,30,0.75)';
    c.lineWidth = 1.3;
    for (const f of this.birds) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      for (let k = 0; k < f.n; k++) {
        // V formation with a little wobble.
        const row = Math.ceil(k / 2);
        const side = k % 2 ? 1 : -1;
        const bx = f.x - Math.sign(f.vx) * row * 14 + Math.sin(this.time * 2 + k) * 2;
        const by = f.y + side * row * 9 + Math.cos(this.time * 1.7 + k + f.seed) * 2;
        const flap = Math.sin(this.time * 9 + k * 1.3 + f.seed) * 2.5;
        c.beginPath();
        c.moveTo(bx - 4, by - flap);
        c.quadraticCurveTo(bx - 2, by - 1, bx, by);
        c.quadraticCurveTo(bx + 2, by - 1, bx + 4, by - flap);
        c.stroke();
      }
    }
    // Forget flocks far outside the view.
    const margin = 1500;
    this.birds = this.birds.filter((f) => f.x > vx0 - margin && f.x < vx1 + margin && f.y > vy0 - margin && f.y < vy1 + margin);
  }

  /** How deep into dusk the day is (0 by day, 1 at its deepest), eased so it never jumps. */
  private dusk = 0;

  setDayTime(frac: number, allowed: boolean, dt: number): void {
    // Evening falls over the last quarter of the day and lifts at the turn.
    const target = !allowed || this.light ? 0 : frac < 0.72 ? 0 : frac < 0.92 ? (frac - 0.72) / 0.2 : Math.max(0, (1 - frac) / 0.08);
    const step = Math.min(1, dt * 2.5);
    this.dusk += (target - this.dusk) * step;
    // Early morning, when mist lies on the water.
    const dawn = !allowed || this.light ? 0 : frac < 0.1 ? 1 : frac < 0.32 ? 1 - (frac - 0.1) / 0.22 : 0;
    this.dawn += (dawn - this.dawn) * step;
  }

  /** How early in the morning it is (1 at first light, 0 by mid-morning). */
  private dawn = 0;
  /** Water and the meadows along it, where morning mist gathers. */
  private mistSpots: number[] = [];
  private mistMap: Uint8Array | null = null;
  private mistPuff: HTMLCanvasElement | null = null;

  /** Soft banks of mist over water and the low ground beside it on spring and autumn mornings. */
  private drawMist(s: GameState, season: Season, visible: (x: number, y: number) => boolean): void {
    const misty = (season === 0 || season === 2) && ((s.day * 40503) >>> 0) % 5 < 3;
    if (!misty || this.dawn < 0.02) return;
    const W = s.width;
    if (this.mistMap !== s.terrain) {
      this.mistMap = s.terrain;
      this.mistSpots = [];
      for (let i = 0; i < s.terrain.length; i++) {
        const h = (Math.imul(i, 2246822519) >>> 0) % 6;
        const x = i % W;
        const y = (i / W) | 0;
        if (s.terrain[i] === 1) {
          if (h < 1) this.mistSpots.push(i);
        } else if (h === 0) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (inBounds(s, x + dx, y + dy) && s.terrain[idx(s, x + dx, y + dy)] === 1) {
              this.mistSpots.push(i);
              break;
            }
          }
        }
      }
    }
    if (!this.mistPuff) {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 64;
      const g = cv.getContext('2d')!;
      const grad = g.createRadialGradient(64, 32, 0, 64, 32, 64);
      // Faint and wide, so it reads as haze rather than patches.
      grad.addColorStop(0, 'rgba(240,244,246,0.3)');
      grad.addColorStop(0.5, 'rgba(240,244,246,0.12)');
      grad.addColorStop(1, 'rgba(240,244,246,0)');
      g.setTransform(1, 0, 0, 0.5, 0, 16);
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      this.mistPuff = cv;
    }
    const c = this.ctx;
    c.globalAlpha = Math.min(1, this.dawn * 1.2);
    for (const i of this.mistSpots) {
      const drift = this.time * 0.04 + (i % 17);
      const [sx, sy] = iso((i % W) + 0.5 + Math.sin(drift) * 0.4, ((i / W) | 0) + 0.5 + Math.cos(drift * 0.7) * 0.25);
      if (!visible(sx, sy)) continue;
      const w = 110 + (i % 5) * 14;
      c.drawImage(this.mistPuff, sx - w / 2, sy - w / 4 - 4, w, w / 2);
    }
    c.globalAlpha = 1;
  }

  /** Market stalls by tile, rebuilt each frame. */
  private stallTiles = new Map<number, { b: Building; k: number; open: boolean }>();

  /** The tile where this month's village festivity stands, or -1. */
  private festTile = -1;
  private festCache = { key: '', tile: -1 };

  /**
   * A maypole in late spring and a bonfire once the harvest is in, on open
   * ground in front of the town hall, for a few days in the middle of the month.
   */
  private festivalTile(s: GameState): number {
    const month = monthOf(s.day);
    const d = s.day % DAYS_PER_MONTH;
    if ((month !== 2 && month !== 8) || d < 2 || d > 7) return -1;
    const hall = seatOf(s);
    if (!hall) return -1;
    const key = `${hall.id}:${Math.floor(s.day / DAYS_PER_MONTH)}`;
    if (this.festCache.key === key) return this.festCache.tile;
    const W = s.width;
    const free = (x: number, y: number) => {
      if (!inBounds(s, x, y)) return false;
      const i = y * W + x;
      return s.occ[i] < 0 && !s.terrain[i] && !s.trees[i] && !s.rock[i] && !s.ore[i];
    };
    let best = -1;
    let bd = 1e9;
    const cx = hall.x + hall.w / 2;
    const cy = hall.y + hall.h / 2;
    for (let y = hall.y - 7; y < hall.y + hall.h + 7; y++) {
      for (let x = hall.x - 7; x < hall.x + hall.w + 7; x++) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) ok &&= free(x + dx, y + dy);
        if (!ok) continue;
        // Nearer is better, and in front of the hall (where it can be seen) better still.
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + (x < hall.x || y < hall.y ? 3 : 0);
        if (dist < bd) {
          bd = dist;
          best = y * W + x;
        }
      }
    }
    this.festCache = { key, tile: best };
    return best;
  }

  /** Dancers round a ribboned maypole, or villagers about a harvest bonfire. */
  private drawFestival(s: GameState, x: number, y: number): void {
    const c = this.ctx;
    const t = this.time;
    const may = monthOf(s.day) === 2;
    const [px, py] = iso(x, y);
    const tunics = ['#b85a48', '#5a7a9a', '#d8b048', '#6a9a5a', '#9a6aa0', '#c88a50', '#4a8a8a'];
    const hairs = ['#e0c070', '#6a4428', '#3a2818', '#a05a30'];
    const n = may ? 6 : 7;
    const ring: [number, number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = (may ? t * 0.6 : t * 0.04) + (k / n) * Math.PI * 2;
      const [sx, sy] = iso(x + Math.cos(a) * 0.95, y + Math.sin(a) * 0.95);
      ring.push([sx, sy, k]);
    }
    const back = ring.filter((r) => r[1] <= py);
    const front = ring.filter((r) => r[1] > py);
    const folk = (list: [number, number, number][]) => {
      for (const [sx, sy, k] of list.sort((a, b) => a[1] - b[1])) {
        const face = sx < px ? 1 : -1;
        this.drawFolk(sx, sy, 0.95 * FOLK_SCALE, tunics[k % tunics.length], hairs[k % hairs.length], may ? t * 8 + k : 0, face, false);
      }
    };
    if (may) {
      const top = py - 52;
      // Ribbons from the crown to the dancers' hands (those behind first).
      const ribbons = (list: [number, number, number][]) => {
        for (const [sx, sy, k] of list) {
          c.strokeStyle = ['#d84a40', '#f2e8d0', '#4a7ac8', '#e8c040'][k % 4];
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(px, top + 3);
          c.quadraticCurveTo((px + sx) / 2, (top + sy) / 2 - 4, sx, sy - 9);
          c.stroke();
        }
      };
      ribbons(back);
      folk(back);
      c.fillStyle = 'rgba(20,20,10,0.25)';
      c.beginPath();
      c.ellipse(px, py, 5, 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e8dcc0';
      c.fillRect(px - 1.3, top, 2.6, py - top);
      c.fillStyle = '#c8b898';
      c.fillRect(px + 0.3, top, 1, py - top);
      // A crown of greenery and flowers.
      c.fillStyle = '#4a7a3a';
      c.beginPath();
      c.ellipse(px, top + 2, 6, 2.6, 0, 0, Math.PI * 2);
      c.fill();
      for (let k = 0; k < 6; k++) {
        c.fillStyle = ['#f0d040', '#e85a6a', '#f8f0e0'][k % 3];
        c.beginPath();
        c.arc(px + Math.cos(k * 1.05) * 5, top + 2 + Math.sin(k * 1.05) * 2, 1, 0, Math.PI * 2);
        c.fill();
      }
      ribbons(front);
      folk(front);
      return;
    }
    // Harvest bonfire.
    folk(back);
    c.fillStyle = 'rgba(30,20,10,0.35)';
    c.beginPath();
    c.ellipse(px, py, 10, 4.5, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#5a3e26';
    c.lineWidth = 2.2;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(px + Math.cos(a) * 8, py + Math.sin(a) * 3.4);
      c.lineTo(px + Math.cos(a) * 1.5, py - 14);
      c.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const f = 0.85 + 0.15 * Math.sin(t * (8 + k * 3) + k);
      c.fillStyle = ['rgba(240,90,30,0.9)', 'rgba(255,160,40,0.9)', 'rgba(255,230,120,0.95)'][k];
      const w = (7 - k * 2) * f;
      const h = (22 - k * 5) * f;
      c.beginPath();
      c.moveTo(px - w, py - 2);
      c.quadraticCurveTo(px - w * 0.6, py - h * 0.6, px + Math.sin(t * 5 + k) * 1.5, py - 2 - h);
      c.quadraticCurveTo(px + w * 0.6, py - h * 0.6, px + w, py - 2);
      c.closePath();
      c.fill();
    }
    if (Math.random() < 0.3) this.sparks.push({ x: px + (Math.random() - 0.5) * 6, y: py - 18, vx: (Math.random() - 0.5) * 14 + this.wind * 6, vy: -30 - Math.random() * 20, life: 0, max: 0.8 + Math.random() * 0.5 });
    this.nightLights.push(px, py - 6, 1.6);
    folk(front);
  }

  /** Lanterns seen this frame, as world x, y and strength triples. */
  private nightLights: number[] = [];

  /** Warm light added back over the evening tint, so lanterns light the lanes. */
  private drawNightLights(): void {
    const L = this.nightLights;
    if (!L.length) return;
    const c = this.ctx;
    const z = this.cam.zoom;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < L.length; k += 3) {
      const x = this.width / 2 + (L[k] - this.cam.x) * z;
      const y = this.height / 2 + (L[k + 1] - this.cam.y) * z;
      const r = 22 * z;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,170,70,${0.32 * L[k + 2]})`);
      g.addColorStop(1, 'rgba(255,170,70,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    L.length = 0;
  }

  private drawAtmosphere(season: Season, day: number): void {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const tints = ['rgba(255,240,200,0.05)', 'rgba(255,220,140,0.07)', 'rgba(255,170,80,0.09)', 'rgba(180,200,230,0.1)'];
    c.fillStyle = tints[season];
    c.fillRect(0, 0, this.width, this.height);
    const g = c.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.45,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.8,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(20,15,5,0.35)');
    c.fillStyle = g;
    c.fillRect(0, 0, this.width, this.height);
    if (this.dusk > 0.01) {
      // A warm low sun, then a little blue as the light goes.
      c.fillStyle = `rgba(255,140,60,${0.13 * this.dusk})`;
      c.fillRect(0, 0, this.width, this.height);
      c.fillStyle = `rgba(30,35,80,${0.22 * this.dusk})`;
      c.fillRect(0, 0, this.width, this.height);
    }
    void day;
  }

  /** Small preview image of a building for the UI, cropped to its pixels. */
  previewDataUrl(type: BuildingType, season: Season = 1): string {
    const sp = this.buildingSprite(type, 1, season);
    const src = sp.canvas;
    const data = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width;
    let y0 = src.height;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        if (data[(y * src.width + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const size = 144;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d')!;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return cv.toDataURL();
    const scale = Math.min(size / w, size / h) * 0.94;
    ctx.drawImage(src, x0, y0, w, h, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
    return cv.toDataURL();
  }
}

/** Visual variant of a building (houses come in several styles). */
const fract = (v: number) => v - Math.floor(v);

/** A cow or a pig at a screen point. */
function drawBeast(c: CanvasRenderingContext2D, x: number, y: number, f: number, kind: string, j: number): void {
  const pig = kind === 'pigs';
  const coat = pig ? '#e8a8a0' : ['#8a5a3a', '#f2ece0', '#3a3028', '#b0703a'][j % 4];
  const len = pig ? 4.5 : 6.5;
  const tall = pig ? 2.5 : 5;
  c.fillStyle = 'rgba(20,20,10,0.22)';
  c.beginPath();
  c.ellipse(x, y, len + 1, 1.8, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = pig ? '#b87870' : '#3a3028';
  c.lineWidth = pig ? 1.2 : 1.3;
  c.beginPath();
  for (const lx of [-len * 0.6, len * 0.55]) {
    c.moveTo(x + lx, y - tall);
    c.lineTo(x + lx, y);
  }
  c.stroke();
  c.fillStyle = coat;
  c.beginPath();
  c.ellipse(x, y - tall - 2.2, len, pig ? 2.8 : 3.4, 0, 0, Math.PI * 2);
  c.fill();
  if (!pig && j % 4 === 1) {
    c.fillStyle = '#3a3028';
    c.beginPath();
    c.ellipse(x - 1.5 * f, y - tall - 2.6, 1.8, 1.3, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Head, lowered to graze.
  c.fillStyle = coat;
  c.beginPath();
  c.ellipse(x + (len + 1) * f, y - tall - (pig ? 1.4 : 0.6), pig ? 2 : 2.3, pig ? 1.8 : 2, 0, 0, Math.PI * 2);
  c.fill();
  if (pig) {
    c.fillStyle = '#d88a84';
    c.fillRect(x + (len + 2.4) * f - 0.8, y - tall - 1.8, 1.6, 1.4);
  } else {
    c.strokeStyle = '#e8dcc4';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(x + (len + 0.5) * f, y - tall - 2.2);
    c.lineTo(x + (len - 0.6) * f, y - tall - 3.8);
    c.stroke();
  }
}

function variantOf(s: GameState, b: Building): number {
  // The cathedral shows its stained glass once commissioned.
  if (b.type === 'cathedral') return s.commissions?.includes('glass') ? 1 : 0;
  // A dock builds its quay out over whichever side has more water.
  if (b.type === 'dock') {
    let side = 0;
    let fore = 0;
    for (let k = 0; k < 3; k++) {
      if (s.terrain[(b.y + k) * s.width + b.x + b.w] === 1) side++;
      if (s.terrain[(b.y + b.h) * s.width + b.x + k] === 1) fore++;
    }
    return fore > side ? 1 : 0;
  }
  if (b.type !== 'house') return 0;
  const trade = b.trade ? HOME_TRADES.indexOf(b.trade) + 1 : 0;
  // Colours, yard, craft and the shape of the house, which the id picks.
  const forms = HOUSE_FORMS[Math.min(3, b.level)] ?? 5;
  const form = (((b.id * 2654435761) >>> 0) >>> 7) % forms;
  return ((b.id * 7 + b.x) % 4) + 4 * Math.max(0, YARD_CODES.indexOf(b.yard ?? null)) + 16 * trade + 128 * form;
}

/** A small pile of one kind of goods. */
function drawGood(p: Pen, id: ResourceId, x: number, y: number): void {
  switch (id) {
    case 'wood':
      p.logPile(x - 0.15, y, 2);
      break;
    case 'stone':
      p.stonePile(x - 0.15, y - 0.15, 4);
      break;
    case 'planks':
      for (let i = 0; i < 3; i++) p.box(x - 0.2, y - 0.12, x + 0.2, y + 0.12, i * 2.4, 2.2, i % 2 ? '#d7b47c' : '#c8a46c');
      break;
    case 'iron':
      for (let i = 0; i < 3; i++) p.box(x - 0.15 + i * 0.1, y - 0.06, x - 0.07 + i * 0.1, y + 0.1, 0, 3, '#5d6068');
      p.box(x - 0.1, y - 0.04, x + 0.12, y + 0.04, 3, 3, '#6d7078');
      break;
    case 'tools':
      p.crate(x - 0.1, y - 0.1, 0.2);
      p.line([x - 0.05, y + 0.1, 8], [x + 0.08, y + 0.1, 14], '#8a8e94', 1.2);
      break;
    case 'grain':
      p.sack(x - 0.08, y);
      p.sack(x + 0.08, y + 0.05, '#cdbb8e');
      p.sack(x, y - 0.1, '#e0d0a4');
      break;
    case 'bread':
      p.crate(x - 0.1, y - 0.1, 0.18);
      p.ellipse(x, y, 8, 3, 1.6, '#c8904a');
      break;
    case 'berries': {
      const [bx, by] = iso(x, y, 0);
      p.ctx.fillStyle = '#a07a40';
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 3, 5, 4, 0, 0, Math.PI);
      p.ctx.fill();
      p.ctx.fillStyle = '#b23040';
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 3, 4.5, 2, 0, 0, Math.PI * 2);
      p.ctx.fill();
      break;
    }
    case 'meat':
    case 'fish':
    case 'pork':
    case 'ale':
    case 'cider':
    case 'milk':
      p.barrel(x - 0.06, y);
      p.barrel(x + 0.1, y + 0.08);
      break;
    case 'firewood':
      p.logPile(x - 0.12, y, 3);
      break;
    case 'dressedstone':
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) p.box(x - 0.16 + i * 0.17, y - 0.12 + j * 0.13, x - 0.01 + i * 0.17, y + 0.0 + j * 0.13, 0, 5, '#cac4b6');
      p.box(x - 0.08, y - 0.06, x + 0.08, y + 0.06, 5, 5, '#d4cec0');
      break;
    case 'ore':
      oreHeap(p, x, y, 6);
      break;
    case 'clay':
      p.ellipse(x, y, 10, 5, 2, '#9a5a34');
      p.ellipse(x - 0.02, y - 0.02, 7, 3.5, 4, '#b0643a');
      break;
    case 'tiles':
      for (let i = 0; i < 4; i++) p.box(x - 0.18, y - 0.1, x + 0.18, y + 0.1, i * 2, 1.8, i % 2 ? '#b8483a' : '#a4402f');
      break;
    case 'woodparts':
      p.crate(x - 0.12, y - 0.1, 0.18);
      p.ellipse(x + 0.12, y + 0.08, 5, 5, 5, '#8a6236');
      p.ellipse(x + 0.12, y + 0.08, 1.6, 1.6, 5, '#5e3e22');
      break;
    case 'wool':
    case 'flax':
    case 'hides':
    case 'leather':
    case 'cloth':
    case 'clothes': {
      const c = { wool: '#f2ece0', flax: '#c8b878', hides: '#b08458', leather: '#7a4a2a', cloth: '#5a7ab0', clothes: '#8a3b2e' }[id];
      for (let i = 0; i < 3; i++) p.box(x - 0.16, y - 0.12, x + 0.16, y + 0.12, i * 2.6, 2.4, shadeHex(c, i % 2 ? 0.9 : 1));
      break;
    }
    case 'flour':
    case 'barley':
    case 'oats':
    case 'herbs':
      p.sack(x - 0.08, y, id === 'flour' ? '#efe6d4' : '#d8c890');
      p.sack(x + 0.08, y + 0.05, id === 'flour' ? '#e8dcc4' : '#cdbb8e');
      break;
    case 'cheese':
      p.ellipse(x, y, 7, 3.4, 2.2, '#e8c040');
      p.ellipse(x + 0.05, y + 0.06, 7, 3.4, 4.6, '#f0c850');
      break;
    case 'apples':
    case 'pears':
    case 'plums':
    case 'mushrooms':
    case 'vegetables':
    case 'eggs': {
      const fill = { apples: '#c4322a', pears: '#c8c040', plums: '#6a3a80', mushrooms: '#a8603a', vegetables: '#5d9a3a', eggs: '#f2e8d4' }[id];
      const [bx, by] = iso(x, y, 0);
      p.ctx.fillStyle = '#a07a40';
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 3, 5, 4, 0, 0, Math.PI);
      p.ctx.fill();
      p.ctx.fillStyle = fill;
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 3, 4.5, 2, 0, 0, Math.PI * 2);
      p.ctx.fill();
      break;
    }
    default:
      p.crate(x - 0.1, y - 0.1, 0.18);
  }
}

/** Darkens a hex colour, keeping it hex so Pen can shade it further. */
function shadeHex(hex: string, f: number): string {
  return f >= 1 ? hex : mix(hex, '#000000', 1 - f);
}

const TREE_SLOTS: [number, number][][] = [
  [[0.5, 0.5]],
  [
    [0.3, 0.35],
    [0.65, 0.68],
  ],
  [
    [0.3, 0.3],
    [0.72, 0.4],
    [0.45, 0.75],
  ],
  [
    [0.28, 0.28],
    [0.72, 0.3],
    [0.3, 0.7],
    [0.72, 0.74],
  ],
];

const CARRY_COLORS: Partial<Record<ResourceId, string>> = {
  wood: '#8a6236',
  stone: '#a8a59e',
  iron: '#7a6a62',
  berries: '#b42a3a',
  meat: '#a0463a',
  fish: '#8aa6b8',
  grain: '#d8b44a',
  bread: '#c8904a',
  planks: '#d8b47c',
  tools: '#8a8e94',
};

/** A load on a villager's shoulder, shaped by what it is. */
const iconCache = new Map<ResourceId, HTMLImageElement>();

/** The HUD's icon for a good as an image for the canvas (null until loaded). */
function goodIcon(id: ResourceId): HTMLImageElement | null {
  let img = iconCache.get(id);
  if (!img) {
    img = new Image();
    const src = (ICONS[id] ?? '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
    iconCache.set(id, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

function drawCarried(c: CanvasRenderingContext2D, id: ResourceId, x: number, y: number): void {
  const shape = CARRY_SHAPES[id] ?? 'crate';
  const color = CARRY_COLORS[id] ?? GOOD_COLORS[id] ?? '#c8a46c';
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 0.6;
  switch (shape) {
    case 'log':
      c.fillStyle = color;
      c.fillRect(x - 5, y - 1.2, 10, 2.6);
      c.fillStyle = '#d8b47c';
      c.beginPath();
      c.arc(x + 5, y + 0.1, 1.3, 0, Math.PI * 2);
      c.fill();
      break;
    case 'sack':
      c.fillStyle = color;
      c.beginPath();
      c.ellipse(x, y, 3.2, 2.6, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      break;
    case 'basket':
      c.fillStyle = '#a07a40';
      c.beginPath();
      c.ellipse(x, y + 0.5, 3.4, 2.2, 0, 0, Math.PI);
      c.fill();
      c.fillStyle = color;
      c.beginPath();
      c.ellipse(x, y, 3, 1.3, 0, 0, Math.PI * 2);
      c.fill();
      break;
    case 'cask':
      c.fillStyle = '#7a5230';
      c.beginPath();
      c.ellipse(x, y, 2.6, 3.2, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#3c2a1a';
      c.beginPath();
      c.moveTo(x - 2.4, y - 1);
      c.lineTo(x + 2.4, y - 1);
      c.moveTo(x - 2.4, y + 1);
      c.lineTo(x + 2.4, y + 1);
      c.stroke();
      break;
    case 'bundle':
      c.fillStyle = color;
      c.fillRect(x - 3.5, y - 2, 7, 4);
      c.strokeRect(x - 3.5, y - 2, 7, 4);
      c.strokeStyle = 'rgba(80,50,20,0.7)';
      c.beginPath();
      c.moveTo(x, y - 2);
      c.lineTo(x, y + 2);
      c.stroke();
      break;
    default:
      c.fillStyle = color;
      c.fillRect(x - 2.5, y - 1.5, 5, 3.5);
      c.strokeRect(x - 2.5, y - 1.5, 5, 3.5);
  }
}

type CarryShape = 'log' | 'sack' | 'basket' | 'cask' | 'bundle' | 'crate';
const CARRY_SHAPES: Partial<Record<ResourceId, CarryShape>> = {
  wood: 'log',
  firewood: 'log',
  planks: 'log',
  grain: 'sack',
  barley: 'sack',
  oats: 'sack',
  flour: 'sack',
  wool: 'sack',
  herbs: 'sack',
  clay: 'sack',
  ore: 'sack',
  berries: 'basket',
  mushrooms: 'basket',
  apples: 'basket',
  pears: 'basket',
  plums: 'basket',
  grapes: 'basket',
  eggs: 'basket',
  vegetables: 'basket',
  fish: 'basket',
  ale: 'cask',
  cider: 'cask',
  wine: 'cask',
  mead: 'cask',
  milk: 'cask',
  meat: 'bundle',
  pork: 'bundle',
  hides: 'bundle',
  leather: 'bundle',
  cloth: 'bundle',
  clothes: 'bundle',
  flax: 'bundle',
  paper: 'bundle',
};
const GOOD_COLORS: Partial<Record<ResourceId, string>> = {
  firewood: '#9a6a3a',
  barley: '#e0cc84',
  oats: '#e0d090',
  flour: '#efe6d4',
  wool: '#f2ece0',
  herbs: '#6aa04a',
  clay: '#b0643a',
  ore: '#6a5a50',
  mushrooms: '#a8603a',
  apples: '#c4322a',
  pears: '#c8c040',
  plums: '#6a3a80',
  grapes: '#5a2a6e',
  eggs: '#f2e8d4',
  vegetables: '#5d9a3a',
  pork: '#e89a8a',
  hides: '#b08458',
  leather: '#7a4a2a',
  cloth: '#5a7ab0',
  clothes: '#8a3b2e',
  flax: '#c8b878',
  paper: '#f4ecd8',
  cheese: '#f0c850',
  tiles: '#b8483a',
  dressedstone: '#cac4b6',
  woodparts: '#a8783e',
  silver: '#c8ccd4',
  jewellery: '#d8a838',
  books: '#3a5a8a',
  weapons: '#8a8e94',
  medicine: '#6aa0a0',
  boots: '#6a3e22',
};

/**
 * A field as it stands: a headland round a ploughed plot, and the crop in
 * rows of stalks: shoots, green blades, ears that turn gold, stooks after
 * the harvest and stubble after that.
 */
function drawFieldPicture(p: Pen, b: Building, crop: string, stage: string, season: Season): void {
  const winter = season === 3;
  const soil = winter ? '#cfd4d4' : '#7a5a3a';
  p.poly(organicOutline(b, 0.02, 0.1, b.id), winter ? 'rgba(225,230,230,0.6)' : 'rgba(110,140,60,0.45)');
  p.poly(organicOutline(b, 0.12, 0.12, b.id + 7), soil, '#5e4129', 1);
  const c = p.ctx;
  const rand = (k: number) => fract(Math.sin(b.id * 91.7 + k * 12.9898) * 43758.5453);
  const rowsPerTile = 4;
  const rows = Math.round(b.h * rowsPerTile);
  const green = crop === 'barley' ? '#7aa83e' : crop === 'flax' ? '#5a8a4a' : '#5e9a34';
  const gold = crop === 'barley' ? '#e0cc84' : crop === 'flax' ? '#b8a060' : '#d8b44a';
  const tall: Record<string, number> = { sprout: 2.5, young: 5, tall: 8, full: 11, flower: 11, ripe: 12, stubble: 1.6 };
  const h = tall[stage] ?? 0;
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) / rowsPerTile;
    const edge = Math.min(r + 0.5, rows - r - 0.5) / rowsPerTile;
    const cut = edge < 0.45 ? 0.45 - edge : 0;
    const a = 0.25 + cut;
    const z = b.w - 0.25 - cut;
    // The furrow, darker, and a ridge of turned earth.
    p.line([a, y + 0.06, 0], [z, y + 0.06, 0], winter ? '#b8bebe' : '#5e4129', 1.2);
    p.line([a, y - 0.04, 0], [z, y - 0.04, 0], winter ? '#dde2e2' : '#8a6a46', 0.8);
    if (!h || winter) continue;
    for (let x = a; x < z; x += 0.055) {
      k++;
      const jx = x + (rand(k) - 0.5) * 0.03;
      const hh = h * (0.8 + rand(k + 7) * 0.4);
      const lean = (rand(k + 3) - 0.5) * (stage === 'ripe' ? 2.2 : 1.4);
      const [sx, sy] = iso(jx, y);
      if (stage === 'stubble') {
        c.strokeStyle = '#c8a860';
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + lean * 0.3, sy - hh);
        c.stroke();
        continue;
      }
      const col = stage === 'ripe' ? gold : stage === 'tall' || stage === 'full' || stage === 'flower' ? green : '#7ab04a';
      if (stage === 'sprout' || stage === 'young') {
        // A tuft of blades.
        c.strokeStyle = rand(k + 5) < 0.5 ? col : shade(col, 1.15);
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx - 1 + lean * 0.5, sy - hh);
        c.moveTo(sx, sy);
        c.lineTo(sx + 1 + lean * 0.5, sy - hh * 0.85);
        c.stroke();
        continue;
      }
      // A stalk with its ear.
      c.strokeStyle = stage === 'ripe' ? shade(gold, 0.85) : shade(col, 0.9);
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + lean * 0.3, sy - hh * 0.6, sx + lean, sy - hh);
      c.stroke();
      const ex = sx + lean;
      const ey = sy - hh;
      if (stage === 'flower') {
        c.fillStyle = rand(k + 9) < 0.6 ? '#7a9ae0' : '#9ab0f0';
        c.beginPath();
        c.arc(ex, ey, 1.1, 0, Math.PI * 2);
        c.fill();
        continue;
      }
      const ear = stage === 'ripe' ? (rand(k + 11) < 0.5 ? gold : shade(gold, 1.12)) : stage === 'full' ? shade(green, 1.1) : col;
      c.fillStyle = ear;
      c.beginPath();
      if (crop === 'barley' && stage === 'ripe') {
        // Barley's ears nod over, with long whiskers.
        c.ellipse(ex + 0.8, ey + 0.8, 0.9, 2.2, -0.6, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = shade(gold, 1.15);
        c.lineWidth = 0.35;
        c.beginPath();
        c.moveTo(ex + 1.2, ey + 2.2);
        c.lineTo(ex + 3, ey + 2.4);
        c.stroke();
      } else if (stage === 'full' || stage === 'ripe') {
        c.ellipse(ex, ey, 0.85, 2.1, lean * 0.1, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  if (stage === 'stooks' && !winter) {
    // Sheaves stooked to dry in rows after the harvest.
    for (let yy = 0.6; yy < b.h - 0.3; yy += 1.2) {
      for (let xx = 0.6; xx < b.w - 0.3; xx += 1.1) {
        const [sx, sy] = iso(xx + ((b.id + Math.floor(yy)) % 2) * 0.3, yy);
        c.fillStyle = 'rgba(30,20,10,0.2)';
        c.beginPath();
        c.ellipse(sx, sy, 4, 1.6, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#c8a040';
        c.beginPath();
        c.moveTo(sx - 3.5, sy);
        c.lineTo(sx, sy - 9);
        c.lineTo(sx + 3.5, sy);
        c.closePath();
        c.fill();
        c.fillStyle = '#e0c060';
        c.beginPath();
        c.moveTo(sx - 1, sy);
        c.lineTo(sx, sy - 9);
        c.lineTo(sx + 2.5, sy);
        c.closePath();
        c.fill();
        c.strokeStyle = '#8a6a30';
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(sx - 1.6, sy - 4);
        c.lineTo(sx + 1.8, sy - 4);
        c.stroke();
      }
    }
  }
}

/**
 * The outline of a field or pasture as an irregular ring with rounded
 * corners, so plots look hand-ploughed rather than ruled. The same seed
 * gives the same shape every frame.
 */
function organicOutline(b: { x: number; y: number; w: number; h: number }, inset: number, wobble: number, seed: number): [number, number, number][] {
  const r = Math.min(0.55, b.w / 3, b.h / 3);
  const x0 = b.x + inset;
  const y0 = b.y + inset;
  const x1 = b.x + b.w - inset;
  const y1 = b.y + b.h - inset;
  const pts: [number, number, number][] = [];
  let k = 0;
  const jitter = () => (fract(Math.sin(seed * 12.9898 + k++ * 78.233) * 43758.5453) - 0.5) * wobble;
  // Straight sides with a little wander, joined by quarter circles.
  const side = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / 0.6));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const j = i === 0 ? 0 : jitter();
      pts.push([ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j, 0]);
    }
  };
  const arc = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = from + (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]);
    }
  };
  side(x0 + r, y0, x1 - r, y0, 0, 1);
  arc(x1 - r, y0 + r, -Math.PI / 2);
  side(x1, y0 + r, x1, y1 - r, -1, 0);
  arc(x1 - r, y1 - r, 0);
  side(x1 - r, y1, x0 + r, y1, 0, -1);
  arc(x0 + r, y1 - r, Math.PI / 2);
  side(x0, y1 - r, x0, y0 + r, 1, 0);
  arc(x0 + r, y0 + r, Math.PI);
  return pts;
}

/** Spring days with showers (the same every playthrough, so puddles follow the rain). */
function showeryDay(day: number): boolean {
  return seasonOf(day) === 0 && day > 10 && ((day * 2654435761) >>> 0) % 3 === 0;
}

/** A small stable hash of a string key. */
function hashKey(k: string): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** How much larger trees are drawn than their sprites. */
const TREE_SCALE = 1.3;

/** Villagers' size against their drawings (smaller than buildings' scale). */
const FOLK_SCALE = 0.85;
