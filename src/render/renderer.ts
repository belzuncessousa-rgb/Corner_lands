import { BUILDINGS, RESOURCE_STORAGE, STORAGE_CAPACITY, type StorageKind } from '../game/data';
import { deliveredTo, hasProblem, monthOf, seasonOf, storageCap } from '../game/sim';
import type { Building, BuildingType, GameState, ResourceId, Season } from '../game/types';
import { idx, inBounds } from '../game/world';
import type { Agent } from './agents';
import type { Animal } from './wildlife';
import { Pen, TH, TW, iso } from './pen';
import {
  type Sprite,
  type TreeKind,
  bridgeTile,
  bushSprite,
  makeSprite,
  buildingSprite,
  grassTile,
  roadTile,
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
  tileColor?: 'road' | 'remove';
  selected?: number;
  hover?: { x: number; y: number };
  /** Range circle in tile coordinates. */
  range?: { cx: number; cy: number; r: number; highlight?: (i: number) => boolean };
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
    const [lx] = iso(0, s.height);
    const [rx] = iso(s.width, 0);
    const [, ty] = iso(0, 0);
    const [, by] = iso(s.width, s.height);
    this.cam.x = Math.max(lx, Math.min(rx, this.cam.x));
    this.cam.y = Math.max(ty, Math.min(by, this.cam.y));
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
    if (scale > 0.95) return cv;
    const level = scale > 0.48 ? 0 : 1;
    const cache = this.lodCache[level];
    let small = cache.get(cv);
    if (!small) {
      const src = level === 0 ? cv : this.lodAt(cv, 0);
      small = document.createElement('canvas');
      small.width = Math.max(1, src.width >> 1);
      small.height = Math.max(1, src.height >> 1);
      small.getContext('2d')!.drawImage(src, 0, 0, small.width, small.height);
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
      small.getContext('2d')!.drawImage(cv, 0, 0, small.width, small.height);
      this.lodCache[level].set(cv, small);
    }
    return small;
  }

  private blit(sp: Sprite, wx: number, wy: number, alpha = 1): void {
    const c = this.ctx;
    if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(this.lod(sp.canvas), wx - sp.ax, wy - sp.ay, sp.w, sp.h);
    if (alpha !== 1) c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- main

  render(s: GameState, agents: Agent[], ov: Overlay, dt: number, animals: Animal[] = []): void {
    this.time += dt;
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
    this.drawFields(s, season);
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
    s.buildings.forEach((b, bi) => {
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
    this.drawWeather(s, season, dt);
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
      return s.road[i] === 1;
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

  private drawFields(s: GameState, season: Season): void {
    const p = new Pen(this.ctx);
    const month = monthOf(s.day);
    for (const b of s.buildings) {
      if (b.type !== 'farm') continue;
      const rects: [number, number, number, number][] = [
        [b.x + 2, b.y, b.x + 4, b.y + 2],
        [b.x, b.y + 2, b.x + 4, b.y + 4],
      ];
      // Yard.
      p.poly(
        [
          [b.x + 0.1, b.y + 0.1, 0],
          [b.x + 2, b.y + 0.1, 0],
          [b.x + 2, b.y + 2, 0],
          [b.x + 0.1, b.y + 2, 0],
        ],
        season === 3 ? '#d6dbd9' : '#9c8a5e',
      );
      const built = b.build >= 1;
      for (const [x0, y0, x1, y1] of rects) {
        const soil = season === 3 ? '#cfd4d4' : '#7a5a3a';
        p.poly(
          [
            [x0 + 0.08, y0 + 0.08, 0],
            [x1 - 0.08, y0 + 0.08, 0],
            [x1 - 0.08, y1 - 0.08, 0],
            [x0 + 0.08, y1 - 0.08, 0],
          ],
          soil,
          '#5e4129',
          1,
        );
        if (!built) continue;
        // Furrows / crops along x.
        const rows = Math.round((y1 - y0) * 4);
        let crop: string | null = null;
        let height = 0;
        if (month <= 5 && b.growth > 0) {
          crop = b.growth < 0.5 ? '#7aa83e' : '#5e9a34';
          height = 2 + b.growth * 6;
        } else if (month === 6 && b.growth > 0) {
          crop = '#d8b44a';
          height = 8;
        } else if (month >= 7 && month <= 8) {
          crop = '#b89a5a';
          height = 1.2;
        }
        for (let r = 0; r < rows; r++) {
          const y = y0 + (r + 0.5) / 4;
          p.line([x0 + 0.15, y, 0], [x1 - 0.15, y, 0], season === 3 ? '#b8bebe' : '#5e4129', 1.4);
          if (crop) {
            p.line([x0 + 0.15, y - 0.05, height * 0.5], [x1 - 0.15, y - 0.05, height * 0.5], crop, height + 1.5);
            p.line([x0 + 0.15, y - 0.08, height], [x1 - 0.15, y - 0.08, height], shadeCrop(crop), 1.2);
          }
        }
      }
    }
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
            : 'rgba(240,220,150,0.55)';
        c.fill();
      }
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

  private drawTileObjects(s: GameState, i: number, season: Season): void {
    const x = i % s.width;
    const y = (i - x) / s.width;
    const v = s.variant[i];
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
    const sp = this.buildingSprite(b.type, b.level, season, variantOf(b));
    const [wx, wy] = iso(b.x, b.y);
    const c = this.ctx;
    if (b.build < 1) {
      this.drawConstruction(b, sp, wx, wy);
      return;
    }
    this.blit(sp, wx, wy);
    if (STORAGE_CAPACITY[b.type]) this.drawStock(s, b, season);
    if (selected) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.12 + 0.06 * Math.sin(this.time * 4);
      c.drawImage(sp.canvas, wx - sp.ax, wy - sp.ay, sp.w, sp.h);
      c.restore();
    }
    // Status markers.
    if (!this.showMarkers) return;
    if (hasProblem(b)) {
      this.drawMarker(b, '#e0a030', '?');
    }
    void s;
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

  private drawMarker(b: Building, color: string, glyph: string): void {
    const c = this.ctx;
    const [x, y] = iso(b.x + b.w / 2, b.y + b.h / 2, 46 + Math.sin(this.time * 3) * 3);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.arc(x + 1, y + 1, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff6dc';
    c.lineWidth = 1.5;
    c.stroke();
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
      c.fillStyle = CARRY_COLORS[a.carry] ?? '#c8a46c';
      c.fillRect(wx - 2.5, wy - 18.5 - bob, 5, 3.5);
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 0.6;
      c.strokeRect(wx - 2.5, wy - 18.5 - bob, 5, 3.5);
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
        const sp = this.buildingSprite(b.type, b.level, season, variantOf(b));
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
    void s;
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
function variantOf(b: Building): number {
  return b.type === 'house' ? (b.id * 7 + b.x) % 4 : 0;
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
      p.barrel(x - 0.06, y);
      p.barrel(x + 0.1, y + 0.08);
      break;
    default:
      p.crate(x - 0.1, y - 0.1, 0.18);
  }
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

function shadeCrop(c: string): string {
  return c === '#d8b44a' ? '#e8c860' : c === '#b89a5a' ? '#a08850' : '#8ac04e';
}
