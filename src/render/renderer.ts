import { BUILDINGS, DAYS_PER_MONTH, RESOURCE_STORAGE, STORAGE_CAPACITY, type StorageKind } from '../game/data';
import { upgradeBlocker } from '../game/levels';
import { hasCharter } from '../game/charters';
import { HOME_TRADES, deliveredTo, hasProblem, isMarketDay, monthOf, orchardMaturity, seasonOf, storageCap } from '../game/sim';
import type { Building, BuildingType, GameState, ResourceId, Season } from '../game/types';
import { idx, inBounds } from '../game/world';
import type { Agent } from './agents';
import { ICONS } from '../ui/icons';
import type { Animal } from './wildlife';
import { Pen, TH, TW, iso, mix } from './pen';
import { mulberry32 } from '../game/rng';
import {
  type Sprite,
  type TreeKind,
  bridgeTile,
  bushSprite,
  makeSprite,
  buildingSprite,
  grassTile,
  roadTile,
  fruitTreeSprite,
  drawSheep,
  YARD_CODES,
  pavedTile,
  rockSprite,
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
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

const GRASS_VARIANTS = 6;
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
    return this.sprite(`b:${type}:${level}:${season}:${variant}`, () => buildingSprite(type, d.w, d.h, level, season, variant));
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

  private blit(sp: Sprite, wx: number, wy: number, alpha = 1): void {
    const c = this.ctx;
    if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(this.lod(sp.canvas), wx - sp.ax, wy - sp.ay, sp.w, sp.h);
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
    s.buildings.forEach((b, bi) => {
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
        if (!s.trees[i] && !s.rock[i] && !s.ore[i] && !s.berriesMax[i]) continue;
        const [wx, wy] = iso(x, y);
        if (!visible(wx, wy)) continue;
        this.buckets[Math.max(d, this.boost[i])].push(i * 4);
      }
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
      c.fillStyle = `rgba(225,225,225,${0.35 * (1 - t)})`;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (1 + t * 1.6), 0, Math.PI * 2);
      c.fill();
    }

    this.drawSky(s, season, dt);
    if (!this.light) this.drawWeather(s, season, dt);
    else this.snow = [];
    this.drawAtmosphere(season, s.day);
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
          sp = this.sprite(`w:${season}:${mask}`, () => waterTile(season, mask));
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

  private drawField(p: Pen, b: Building, season: Season, month: number): void {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const soil = season === 3 ? '#cfd4d4' : '#7a5a3a';
    // A grassy headland around an irregular, round-cornered plot.
    p.poly(organicOutline(b, 0.02, 0.1, b.id), season === 3 ? 'rgba(225,230,230,0.6)' : 'rgba(110,140,60,0.45)');
    p.poly(organicOutline(b, 0.12, 0.12, b.id + 7), soil, '#5e4129', 1);
    const crop = b.recipe ?? 'wheat';
    const ripe: Record<string, string> = { wheat: '#d8b44a', barley: '#e0cc84', oats: '#d4c070', flax: '#9a8a5a' };
    const young: Record<string, string> = { wheat: '#5e9a34', barley: '#7aa83e', oats: '#88b04a', flax: '#5a8a4a' };
    let color: string | null = null;
    let height = 0;
    if (month <= 5 && b.growth > 0) {
      color = b.growth < 0.5 ? '#7aa83e' : young[crop];
      height = 2 + b.growth * 6;
      if (crop === 'flax' && month >= 3 && b.growth > 0.5) color = '#6a8ad8';
    } else if (month === 6 && b.growth > 0) {
      color = ripe[crop];
      height = 8;
    } else if (month >= 7 && month <= 8) {
      color = '#b89a5a';
      height = 1.2;
    }
    const rows = Math.round(b.h * 4);
    for (let r = 0; r < rows; r++) {
      const y = y0 + (r + 0.5) / 4;
      // Rows near the rounded corners are shorter, so they stay inside the plot.
      const edge = Math.min(r + 0.5, rows - r - 0.5) / 4;
      const cut = edge < 0.45 ? 0.45 - edge : 0;
      const a = x0 + 0.25 + cut;
      const z = x1 - 0.25 - cut;
      p.line([a, y, 0], [z, y, 0], season === 3 ? '#b8bebe' : '#5e4129', 1.4);
      if (color) {
        p.line([a, y - 0.05, height * 0.5], [z, y - 0.05, height * 0.5], color, height + 1.5);
        p.line([a, y - 0.08, height], [z, y - 0.08, height], shadeCrop(color), 1.2);
      }
    }
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
    if (owner && owner.herd && !sheltered) {
      const zones = s.buildings.filter((z) => z.owner === owner.id && z.type === 'pasture');
      const total = zones.reduce((a, z) => a + z.w * z.h, 0);
      let n = Math.round(((owner.herd ?? 0) * b.w * b.h) / Math.max(1, total));
      const used = herds.get(owner.id) ?? 0;
      if (zones[zones.length - 1] === b) n = Math.max(0, (owner.herd ?? 0) - used);
      herds.set(owner.id, used + n);
      const kind = owner.herdKind ?? 'sheep';
      for (let j = 0; j < Math.min(n, 40); j++) {
        const seed = b.id * 97 + j * 13;
        const r1 = fract(Math.sin(seed) * 43758.5);
        const r2 = fract(Math.sin(seed * 1.7) * 24634.6);
        const t = this.time * 0.05 + r1 * 10;
        const ax = x0 + 0.4 + (b.w - 0.8) * fract(r1 + 0.08 * Math.sin(t));
        const ay = y0 + 0.4 + (b.h - 0.8) * fract(r2 + 0.06 * Math.cos(t * 0.8));
        const [sx, sy] = iso(ax, ay);
        const f = Math.cos(t) > 0 ? 1 : -1;
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
      this.blit(sp, wx, wy);
      return;
    }
    if (s.rock[i] || s.ore[i]) {
      const ore = s.ore[i] > 0;
      const rv = v % 4;
      const sp = this.sprite(`k:${ore}:${rv}:${season === 3}`, () => rockSprite(ore, rv, season === 3 ? 3 : 0));
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
  }

  private treeClump(kind: TreeKind, n: number, base: number, mixBirch: boolean, season: Season): Sprite {
    const slots = TREE_SLOTS[n - 1];
    return makeSprite(TW + 50, TH + 84, TW / 2 + 25, 80, (ctx) => {
      for (let k = 0; k < slots.length; k++) {
        const tv = (base + k * 3) % TREE_VARIANTS;
        const kk: TreeKind = k === 1 && mixBirch ? 'birch' : kind;
        const t = this.sprite(`t:${kk}:${season}:${tv}`, () => treeSprite(kk, season, tv));
        const [lx, ly] = iso(slots[k][0], slots[k][1]);
        ctx.drawImage(t.canvas, lx - t.ax, ly - t.ay, t.w, t.h);
      }
    });
  }

  private drawBuilding(s: GameState, b: Building, season: Season, selected: boolean): void {
    const sp = this.buildingSprite(b.type, b.level, season, variantOf(s, b));
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
    if (STORAGE_CAPACITY[b.type]) this.drawStock(s, b, season);
    if (b.type === 'townhall' && s.feastDay !== undefined && s.day - s.feastDay < DAYS_PER_MONTH) this.drawFeast(b);
    const fest = s.festivalDay && s.day - s.festivalDay.day < DAYS_PER_MONTH ? s.festivalDay.id : null;
    if (fest === 'mayday' && b.type === 'maypole') this.drawMayDance(b);
    if (fest === 'midsummer' && b.type === 'townhall') this.drawBonfire(b);
    if (b.type === 'market' && !this.light && isMarketDay(s, b)) this.drawMarketDay(b);
    if (b.type === 'townhall' && s.commissions?.includes('tapestry')) this.drawHeraldry(b);
    // Lamplight in lived-in homes and the tavern as evening falls.
    if (this.dusk > 0.25 && b.build >= 1 && (b.residents > 0 || (b.type === 'tavern' && b.workers > 0))) this.drawLamplight(b);
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
        if ((o.type === 'house' || o.type === 'townhall') && o.build >= 1 && !o.upgrading && !upgradeBlocker(s, o)) this.upgradable.add(o.id);
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
    if (at(-1, 0).wall) p.box(x - 0.5, y + 0.36, x + 0.5, y + 0.64, 0, H, stone, top);
    if (at(0, -1).wall) p.box(x + 0.36, y - 0.5, x + 0.64, y + 0.5, 0, H, stone, top);
    if (gate) {
      p.box(x + 0.14, y + 0.14, x + 0.86, y + 0.86, 0, H * 2, '#aaa190', top);
      p.wallL(y + 0.862, x + 0.38, x + 0.62, H * 1.3, H * 1.6, '#2a2522');
      p.wallR(x + 0.862, y + 0.38, y + 0.62, H * 1.3, H * 1.6, '#221e1b');
      p.roofPyramid(x + 0.14, y + 0.14, x + 0.86, y + 0.86, H * 2, 18, 'slate');
    } else if ((x + y) % 6 === 0) {
      // A postern: a small arched door through the wall for folk on foot.
      p.box(x + 0.28, y + 0.28, x + 0.72, y + 0.72, 0, H + 8, '#aaa190', top);
      p.wallL(y + 0.722, x + 0.42, x + 0.58, 0, 12, '#4a2f1b');
      p.wallR(x + 0.722, y + 0.42, y + 0.58, 0, 12, '#3e2716');
    } else {
      p.box(x + 0.32, y + 0.32, x + 0.68, y + 0.68, 0, H + 4, stone, top);
      // Crenellations along the top.
      for (const [cx, cy] of [
        [0.36, 0.36],
        [0.56, 0.36],
        [0.36, 0.56],
        [0.56, 0.56],
      ]) {
        p.box(x + cx, y + cy, x + cx + 0.08, y + cy + 0.08, H + 4, 4, stone, top);
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
  /** A soft window glow on the front of a building. */
  private drawLamplight(b: Building): void {
    const c = this.ctx;
    const [x, y] = iso(b.x + b.w * 0.75, b.y + b.h, 9);
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
    p.poly([[x - 0.22, y + 0.22, 55], [x + 0.22, y - 0.22, 55], [x + 0.22, y - 0.22, 26 + sway], [x, y, 31 + sway], [x - 0.22, y + 0.22, 26 + sway]], '#9a2a2a');
    p.poly([[x - 0.22, y + 0.22, 47], [x + 0.22, y - 0.22, 47], [x + 0.22, y - 0.22, 43], [x - 0.22, y + 0.22, 43]], '#d8b84a');
    p.poly([[x, y, 41], [x + 0.1, y - 0.1, 36], [x, y, 31], [x - 0.1, y + 0.1, 36]], '#2a4a8a');
  }

  /** Market day: a crowd among the stalls, a cart, and bunting over the square. */
  private drawMarketDay(b: Building): void {
    const p = new Pen(this.ctx);
    const t = this.time;
    const rand = mulberry32(b.id * 977 + 5);
    const cloth = ['#9a2a2a', '#3a5a8a', '#5a7a3a', '#c8913c', '#6a4a7a', '#8a6238'];
    // A dozen townsfolk drifting between the stalls.
    for (let k = 0; k < 12; k++) {
      const bx = b.x + 0.3 + rand() * (b.w - 0.6);
      const by = b.y + 0.3 + rand() * (b.h - 0.6);
      const ph = rand() * Math.PI * 2;
      const x = bx + Math.sin(t * 0.4 + ph) * 0.25;
      const y = by + Math.cos(t * 0.3 + ph) * 0.2;
      p.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 7, cloth[k % cloth.length]);
      p.circle(x, y, 9, 1.8, '#e8c8a0');
    }
    // A farmer's cart at the edge of the square.
    const cx = b.x + b.w + 0.15;
    const cy = b.y + b.h * 0.5;
    p.box(cx - 0.18, cy - 0.35, cx + 0.18, cy + 0.35, 3, 4, '#8a6238', '#a87a48');
    p.circle(cx + 0.2, cy - 0.2, 3, 2.6, '#4a3020');
    p.circle(cx + 0.2, cy + 0.2, 3, 2.6, '#4a3020');
    for (let k = 0; k < 3; k++) p.circle(cx - 0.05, cy - 0.2 + k * 0.2, 8, 1.8, ['#c8913c', '#7a9a3a', '#b8483a'][k]);
    // Bunting across the square.
    const a: [number, number, number] = [b.x + 0.1, b.y + b.h - 0.1, 18];
    const c: [number, number, number] = [b.x + b.w - 0.1, b.y + 0.1, 18];
    p.line([a[0], a[1], 0], a, '#6b4a2e', 1.2);
    p.line([c[0], c[1], 0], c, '#6b4a2e', 1.2);
    const colors = ['#b8483a', '#e8c048', '#3a5a8a', '#f2ead8'];
    let prev = a;
    for (let k = 1; k <= 8; k++) {
      const f = k / 8;
      const pt: [number, number, number] = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] - Math.sin(f * Math.PI) * 4];
      p.line(prev, pt, '#5a4030', 0.7);
      const mid: [number, number, number] = [(prev[0] + pt[0]) / 2, (prev[1] + pt[1]) / 2, (prev[2] + pt[2]) / 2];
      p.poly([prev, pt, [mid[0], mid[1], mid[2] - 4]], colors[k % colors.length]);
      prev = pt;
    }
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
    const kinds: StorageKind[] = b.type === 'storehouse' ? ['materials'] : b.type === 'granary' ? ['food'] : ['materials', 'food'];
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

  private drawAgent(a: Agent): void {
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
    if (a.carry) drawCarried(c, a.carry, wx, wy - 17 - bob);
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

  private drawAnimal(a: Animal, season: Season): void {
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
        const sp = this.buildingSprite(b.type, b.level, season, variantOf(s, b));
        for (const [x, y, z] of sp.smoke) {
          const [wx, wy] = iso(b.x + x, b.y + y, z);
          this.particles.push({
            x: wx + (Math.random() - 0.5) * 2,
            y: wy,
            vx: 4 + Math.random() * 3,
            vy: -10 - Math.random() * 6,
            life: 0,
            max: 2.5 + Math.random() * 1.5,
            size: 1.8 + Math.random(),
          });
        }
      }
    }
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
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
      cl.x += 9 * dt;
      cl.y += 2 * dt;
      if (cl.x - cl.rx > maxX) {
        cl.x = minX - cl.rx;
        cl.y = Math.random() * maxY;
      }
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
    const showery = season === 0 && s.day > 10 && ((s.day * 2654435761) >>> 0) % 3 === 0;
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
  if (b.type !== 'house') return 0;
  const trade = b.trade ? HOME_TRADES.indexOf(b.trade) + 1 : 0;
  return ((b.id * 7 + b.x) % 4) + 4 * Math.max(0, YARD_CODES.indexOf(b.yard ?? null)) + 16 * trade;
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
      p.stonePile(x - 0.15, y - 0.15, 4);
      p.ellipse(x, y, 4, 2, 6, '#b4652e');
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

function shadeCrop(c: string): string {
  return c === '#d8b44a' ? '#e8c860' : c === '#b89a5a' ? '#a08850' : '#8ac04e';
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
