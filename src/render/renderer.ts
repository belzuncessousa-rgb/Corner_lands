import { BUILDINGS, DAYS_PER_MONTH, DAYS_PER_YEAR, RESOURCE_STORAGE, STORAGE_CAPACITY, type StorageKind } from '../game/data';
import { MANOR_SIZE, marketStalls, upgradeBlocker } from '../game/levels';
import { knows } from '../game/unlocks';
import { optionOn } from '../game/options';
import { drawImprovements, pastureShed } from './props';
import { estateTiles, ANIMAL_KINDS, LOW_EFFICIENCY, animalsOf, deliveredTo, hasProblem, herdTotal, lordRides, monthOf, nearestShoal, orchardMaturity, seasonOf, seatOf, storageCap, stored } from '../game/sim';
import type { Building, BuildingType, GameState, ResourceId, Season } from '../game/types';
import { idx, inBounds } from '../game/world';
import { type Agent, LEISURE_ACTS } from './agents';
import { ICONS } from '../ui/icons';
import type { Animal } from './wildlife';
import { LENS_COLORS, type LensData, type LensKind, lensCount } from './lens';
import { drawHorse, drawOx } from './horse';
import { Pen, TH, TW, iso, mix, shade, type RoofKind, type V3 } from './pen';
import { mulberry32 } from '../game/rng';
import { DEFAULT_HERALDRY, HERALDRY, heraldryKey } from './heraldry';
import { DEFAULT_LORD, type LordLook, drawLord } from './lord';
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
  tuft,
  roadTile,
  fruitTreeSprite,
  drawSheep,
  variantOf,
  homeWindow,
  pavedTile,
  cobbleTile,
  royalTile,
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
  /** The resource lens: the map greyed, with what gatherers gather lit up and counted. */
  lens?: LensData;
  /** The selected building's people: curved lines from it to each of them, and how many are indoors. */
  crew?: { cx: number; cy: number; h: number; to: { x: number; y: number }[]; inside: number };
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
  /** Whether the lord rides out on horseback (a staffed stable). */
  private lordRides = false;
  private buckets: number[][] = [];
  /** Each bucket entry's place along its row, by where its base stands (x + y). */
  private bucketKeys: number[][] = [];
  /** Things on the ground pass's zones that stand up (beasts, park trees, front fences), sorted in with the rest. */
  private late: { x: number; y: number; fn: () => void }[] = [];
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
    this.lordRides = lordRides(s);
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
    this.lordLook = s.lord ?? DEFAULT_LORD;
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
    this.late.length = 0;
    this.drawFields(s, season, ov.selected);
    this.drawBedGround(s, season, visible);
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
          // A few versions of each piece, so ragged borders do not repeat.
          const v = (x * 7 + y * 13) % 3;
          const sp =
            s.terrain[i] === 1
              ? this.sprite(`br:${season}:${mask}:${layer}`, () => bridgeTile(season, mask, layer))
              : s.road[i] === 4
                ? this.sprite(`ry:${season}:${mask}:${layer}`, () => royalTile(season, mask, layer))
              : s.road[i] === 3
                ? this.sprite(`rc:${season}:${mask}:${layer}`, () => cobbleTile(season, mask, layer))
              : s.road[i] === 2
                ? this.sprite(`rp:${season}:${mask}:${layer}:${v}`, () => pavedTile(season, mask, layer, v))
                : this.sprite(`r:${season}:${mask}:${layer}:${v}`, () => roadTile(season, mask, layer, v));
          this.blit(sp, wx, wy);
        }
      }
    }

    // Silver veins the prospectors found: a grey outcrop glinting with ore.
    for (const i of s.silver ?? []) {
      if (s.occ[i] >= 0) continue;
      const x = i % W;
      const y = (i / W) | 0;
      const [wx, wy] = iso(x + 0.5, y + 0.5);
      if (!visible(wx, wy)) continue;
      this.blit(this.sprite(`k:silver:${season === 3}`, () => rockSprite(false, 1, season === 3 ? 3 : 0)), wx, wy);
      const c = this.ctx;
      // Veins of bright metal threading the rock.
      c.strokeStyle = '#dfe6ee';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(wx - 12, wy - 3);
      c.lineTo(wx - 7, wy - 7);
      c.lineTo(wx - 3, wy - 5);
      c.moveTo(wx - 4, wy - 1);
      c.lineTo(wx + 1, wy - 5);
      c.stroke();
      const tw = 0.5 + 0.5 * Math.sin(this.time * 3 + i);
      c.fillStyle = `rgba(240,248,255,${0.5 + 0.5 * tw})`;
      for (const [dx, dy] of [
        [-8, -6],
        [-2, -3],
        [-6, -9],
      ]) {
        c.beginPath();
        c.arc(wx + dx, wy + dy, 0.8 + tw * 0.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    this.mark('shimmer+fields+roads');
    this.drawGroundOverlays(s, ov);
    this.mark('overlays');

    // ---- objects, back to front
    this.computeBoost(s);
    // Everything goes in a bucket by the row its base stands on, and within
    // the row by its exact place, so whatever stands nearer is drawn later.
    // A tile's things stand at its centre (row + 1), a building at its front
    // tile's centre; tiles just in front of a building come after it.
    const nb = W + H + 6;
    if (this.buckets.length !== nb) {
      this.buckets = Array.from({ length: nb }, () => []);
      this.bucketKeys = Array.from({ length: nb }, () => []);
    }
    for (const b of this.buckets) b.length = 0;
    for (const b of this.bucketKeys) b.length = 0;
    const put = (code: number, key: number) => {
      const k = Math.max(0, Math.min(nb - 1, Math.floor(key)));
      this.buckets[k].push(code);
      this.bucketKeys[k].push(key);
    };
    const tileKey = (d: number, i: number) => (this.boost[i] > d ? this.boost[i] + 1.001 : d + 1);
    const standKey = (x: number, y: number) => {
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      const bo = inBounds(s, tx, ty) ? this.boost[ty * W + tx] : 0;
      return bo > tx + ty ? bo + 1.002 + (x + y - tx - ty) * 0.001 : x + y;
    };
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
          if (visible(wx, wy)) put(i * 8, tileKey(x + y, i));
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
              put((y * W + x) * 8, tileKey(x + y, y * W + x));
            }
          }
        }
        return;
      }
      const [wx, wy] = iso(b.x + b.w / 2, b.y + b.h / 2);
      if (!visible(wx, wy + 60) && !visible(wx, wy - 100)) return;
      put(bi * 8 + 1, this.buildingDepth(s, b) + 1);
    });
    for (let d = 0; d < W + H - 1; d++) {
      for (let x = Math.max(0, d - H + 1); x <= Math.min(W - 1, d); x++) {
        const y = d - x;
        const i = y * W + x;
        if (!s.trees[i] && !s.rock[i] && !s.ore[i] && !s.berriesMax[i] && !s.stumps?.[i]) continue;
        const [wx, wy] = iso(x, y);
        if (!visible(wx, wy)) continue;
        put(i * 8, tileKey(d, i));
      }
    }
    this.festTile = this.light ? -1 : this.festivalTile(s);
    if (this.festTile >= 0) {
      const [wx, wy] = iso((this.festTile % W) + 0.5, ((this.festTile / W) | 0) + 0.5);
      if (visible(wx, wy)) put(this.festTile * 8, tileKey((this.festTile % W) + ((this.festTile / W) | 0), this.festTile));
    }
    agents.forEach((a, ai) => {
      if (!a.visible) return;
      const tx = Math.floor(a.x);
      const ty = Math.floor(a.y);
      if (!inBounds(s, tx, ty)) return;
      const [wx, wy] = iso(a.x, a.y);
      if (!visible(wx, wy)) return;
      put(ai * 8 + 2, standKey(a.x, a.y));
    });
    this.late.forEach((l, li) => put(li * 8 + 4, standKey(l.x, l.y)));
    this.mark('bucketing');
    animals.forEach((a, ai) => {
      const tx = Math.floor(a.x);
      const ty = Math.floor(a.y);
      if (!inBounds(s, tx, ty)) return;
      const [wx, wy] = iso(a.x, a.y);
      if (!visible(wx, wy)) return;
      put(ai * 8 + 3, standKey(a.x, a.y));
    });
    this.drawRoadPlan(s, visible);
    if (!this.light) this.drawPuddles(s, season, dt, visible);
    if (!this.light && season !== 3) {
      this.drawDucks(s, visible);
      this.drawShoals(s, visible);
      this.drawBoats(s, visible);
      this.drawMist(s, season, visible);
    }
    for (let bi = 0; bi < nb; bi++) {
      const bucket = this.buckets[bi];
      const keys = this.bucketKeys[bi];
      // Insertion sort by key (buckets are short and nearly in order); ties keep their order.
      for (let i = 1; i < bucket.length; i++) {
        const c = bucket[i];
        const k = keys[i];
        let j = i - 1;
        while (j >= 0 && keys[j] > k) {
          bucket[j + 1] = bucket[j];
          keys[j + 1] = keys[j];
          j--;
        }
        bucket[j + 1] = c;
        keys[j + 1] = k;
      }
      for (const code of bucket) {
        const kind = code & 7;
        const n = code >> 3;
        if (kind === 0) this.drawTileObjects(s, n, season);
        else if (kind === 1) this.drawBuilding(s, s.buildings[n], season, ov.selected === s.buildings[n].id);
        else if (kind === 2) this.drawAgent(agents[n]);
        else if (kind === 3) this.drawAnimal(animals[n], season);
        else this.late[n].fn();
      }
    }

    if (!this.light && (season === 0 || season === 1)) {
      this.drawButterflies(s, visible);
      if (season === 1) this.drawFireflies(s, visible);
    }
    if (ov.ghost) this.drawGhost(s, ov.ghost, season);
    if (ov.crew && !ov.lens) this.drawCrew(ov.crew);

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
    if (ov.lens) this.drawLens(s, ov.lens);
    this.mark('effects');
  }

  /**
   * Curved lines from a building to each of its workers or builders, with
   * the ants marching along them toward the people, and a ring at each.
   */
  private drawCrew(crew: NonNullable<Overlay['crew']>): void {
    const c = this.ctx;
    const z = this.cam.zoom;
    const [bx, by] = iso(crew.cx, crew.cy, crew.h);
    c.save();
    c.lineCap = 'round';
    for (const t of crew.to) {
      const [ax, ay] = iso(t.x, t.y, 9);
      const dist = Math.hypot(ax - bx, ay - by);
      if (dist < 4) continue;
      // The curve bows upward, more for longer lines, like a thrown rope.
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 - Math.min(90, 14 + dist * 0.28);
      c.setLineDash([]);
      c.strokeStyle = 'rgba(30,20,10,0.45)';
      c.lineWidth = 4 / z;
      c.beginPath();
      c.moveTo(bx, by);
      c.quadraticCurveTo(mx, my, ax, ay);
      c.stroke();
      c.setLineDash([7 / z, 5 / z]);
      c.lineDashOffset = -this.time * (24 / z);
      c.strokeStyle = '#f2d878';
      c.lineWidth = 2 / z;
      c.beginPath();
      c.moveTo(bx, by);
      c.quadraticCurveTo(mx, my, ax, ay);
      c.stroke();
      // A ring round the villager's feet.
      const [fx, fy] = iso(t.x, t.y);
      c.setLineDash([]);
      c.strokeStyle = '#f2d878';
      c.lineWidth = 1.6 / z;
      c.beginPath();
      c.ellipse(fx, fy, 7, 3.5, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // Where the lines start: a knot over the building.
    c.setLineDash([]);
    c.fillStyle = '#f2d878';
    c.strokeStyle = 'rgba(30,20,10,0.6)';
    c.lineWidth = 1.2 / z;
    c.beginPath();
    c.arc(bx, by, 3.2 / Math.min(1, z), 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (crew.inside > 0) {
      const label = `${crew.inside} inside`;
      c.font = `bold ${11 / z}px Georgia, serif`;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.lineWidth = 3 / z;
      c.strokeStyle = 'rgba(30,20,10,0.75)';
      c.strokeText(label, bx, by - 6 / Math.min(1, z));
      c.fillStyle = '#f8ecc8';
      c.fillText(label, bx, by - 6 / Math.min(1, z));
    }
    c.restore();
  }

  /**
   * The resource lens: the whole picture loses its colour and darkens a
   * little, then each tile with something to gather glows in its own colour
   * (over the trees that hide it), and each patch gets a ball with its icon
   * and about how much is there.
   */
  private drawLens(s: GameState, lens: LensData): void {
    const c = this.ctx;
    const z = this.cam.zoom;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalCompositeOperation = 'saturation';
    c.fillStyle = '#808080';
    c.globalAlpha = 0.92;
    c.fillRect(0, 0, this.width, this.height);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(18,20,28,0.3)';
    c.fillRect(0, 0, this.width, this.height);
    // The tiles themselves, in world space.
    c.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.width / 2 - this.cam.x * z), this.dpr * (this.height / 2 - this.cam.y * z));
    const [vx0, vy0] = this.screenToWorld(-40, -40);
    const [vx1, vy1] = this.screenToWorld(this.width + 40, this.height + 40);
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 2.5);
    for (const kind in lens.tiles) {
      const list = lens.tiles[kind as LensKind]!;
      if (!list.length) continue;
      c.fillStyle = LENS_COLORS[kind as LensKind];
      c.globalAlpha = 0.28 * pulse;
      c.beginPath();
      for (const i of list) {
        const [a, b] = iso(i % s.width, (i / s.width) | 0);
        if (a < vx0 || a > vx1 || b < vy0 || b > vy1) continue;
        c.moveTo(a, b);
        c.lineTo(a + TW / 2, b + TH / 2);
        c.lineTo(a, b + TH);
        c.lineTo(a - TW / 2, b + TH / 2);
        c.closePath();
      }
      c.fill();
      c.globalAlpha = 0.95;
      c.beginPath();
      for (const i of list) {
        const [a, b] = iso((i % s.width) + 0.5, ((i / s.width) | 0) + 0.5);
        if (a < vx0 || a > vx1 || b < vy0 || b > vy1) continue;
        c.moveTo(a + 3.2, b);
        c.arc(a, b, 3.2, 0, Math.PI * 2);
      }
      c.fill();
    }
    c.globalAlpha = 1;
    for (const r of lens.rings) {
      const [a, b] = iso(r.x, r.y);
      c.strokeStyle = LENS_COLORS[r.kind];
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.ellipse(a, b, r.r * TW * 0.5, r.r * TH * 0.5, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash([]);
    // The balls, in screen space so they keep their size; near ones of a kind merge when zoomed out.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const R = 13;
    const drawn: { x: number; y: number; kind: LensKind; n: number; varies: boolean }[] = [];
    for (const g of lens.groups) {
      const [x, y] = this.tileToScreen(g.x, g.y, 14);
      if (x < -30 || y < -30 || x > this.width + 30 || y > this.height + 30) continue;
      const same = drawn.find((d) => d.kind === g.kind && Math.hypot(d.x - x, d.y - y) < R * 2.6);
      if (same) {
        same.n += g.n;
        continue;
      }
      drawn.push({ x, y, kind: g.kind, n: g.n, varies: g.varies });
    }
    // Different kinds on the same spot step aside.
    for (let i = 0; i < drawn.length; i++)
      for (let j = 0; j < i; j++) {
        const dx = drawn[i].x - drawn[j].x;
        const dy = drawn[i].y - drawn[j].y;
        if (Math.hypot(dx, dy) < R * 2.2) drawn[i].x = drawn[j].x + R * 2.4;
      }
    c.font = 'bold 11px Georgia, serif';
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    for (const d of drawn) {
      const color = LENS_COLORS[d.kind];
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.beginPath();
      c.arc(d.x + 1.5, d.y + 2, R, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff6e0';
      c.beginPath();
      c.arc(d.x, d.y, R, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = color;
      c.lineWidth = 2.5;
      c.stroke();
      this.drawLensIcon(d.kind, d.x, d.y);
      // The count, on a tab under the ball.
      const label = lensCount({ kind: d.kind, x: 0, y: 0, n: d.n, varies: d.varies });
      const w = Math.max(18, c.measureText(label).width + 10);
      c.fillStyle = d.n < 1 ? '#6a6458' : '#3a2a18';
      c.beginPath();
      c.roundRect(d.x - w / 2, d.y + R - 3, w, 15, 7);
      c.fill();
      c.fillStyle = '#fff6e0';
      c.fillText(label, d.x, d.y + R + 4.5);
    }
    c.restore();
  }

  /** The picture inside a lens ball: the good's own icon. */
  private drawLensIcon(kind: LensKind, x: number, y: number): void {
    const c = this.ctx;
    const id: ResourceId = kind === 'game' ? 'meat' : kind;
    const icon = goodIcon(id);
    if (icon) c.drawImage(icon, x - 8, y - 8, 16, 16);
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

  /**
   * The market square: a patch of rolled red clay with a wandering border
   * that thins into the grass or snow, lighter sun-dried clay in the middle
   * and the odd damp, darker patch.
   */
  private drawClaySquare(p: Pen, b: Building, season: Season): void {
    const c = this.ctx;
    const snow = season === 3;
    const rand = mulberry32(b.id * 131 + 7);
    // A wobble for each side, smooth so the edge bends rather than zigzags.
    const waves = Array.from({ length: 4 }, () => [rand() * 6.3, rand() * 6.3, 2 + rand() * 2, 5 + rand() * 3]);
    const ring = (m: number, amp: number): V3[] => {
      const pts: V3[] = [];
      const step = 0.2;
      const side = (k: number, len: number, at: (u: number, d: number) => [number, number]) => {
        const [p1, p2, f1, f2] = waves[k];
        for (let u = 0; u < len; u += step) {
          const taper = Math.min(1, u / 0.6, (len - u) / 0.6);
          const d = m + amp * taper * (0.6 * Math.sin(u * f1 + p1) + 0.4 * Math.sin(u * f2 + p2));
          const [x, y] = at(u, d);
          pts.push([x, y, 0]);
        }
      };
      side(0, b.w, (u, d) => [b.x + u, b.y - d]);
      side(1, b.h, (u, d) => [b.x + b.w + d, b.y + u]);
      side(2, b.w, (u, d) => [b.x + b.w - u, b.y + b.h + d]);
      side(3, b.h, (u, d) => [b.x - d, b.y + b.h - u]);
      return pts;
    };
    // Worn soil around it, fading out.
    const soil = snow ? 'rgba(190,170,160,0.11)' : 'rgba(140,98,58,0.15)';
    for (const m of [0.3, 0.2, 0.11]) p.poly(ring(m, 0.16), soil);
    p.poly(ring(0.02, 0.14), snow ? 'rgba(205,180,168,0.55)' : 'rgba(176,96,56,0.55)');
    p.poly(ring(-0.08, 0.13), snow ? '#d9c4b8' : '#c4693e');
    const spot = (x: number, y: number, r: number, color: string) => {
      const [sx, sy] = iso(x, y);
      c.fillStyle = color;
      c.beginPath();
      c.ellipse(sx, sy, r * TW * 0.5, r * TH * 0.5, 0, 0, Math.PI * 2);
      c.fill();
    };
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const inside = (spread: number): [number, number] => [cx + (rand() - 0.5) * b.w * spread, cy + (rand() - 0.5) * b.h * spread];
    // Sun-dried, lighter clay towards the middle, where most feet go:
    // many faint, overlapping spots, so it brightens without hard rims.
    for (let k = 0; k < 14 + b.w * 4; k++) {
      const [x, y] = inside(0.65);
      spot(x, y, 0.2 + rand() * 0.35, snow ? 'rgba(240,226,218,0.14)' : 'rgba(232,158,106,0.14)');
    }
    for (let k = 0; k < 4; k++) spot(cx + (rand() - 0.5) * 0.6, cy + (rand() - 0.5) * 0.6, Math.min(b.w, b.h) * (0.12 + k * 0.07), snow ? 'rgba(245,235,228,0.1)' : 'rgba(232,162,114,0.1)');
    // A few damp, darker patches.
    for (let k = 0; k < 2; k++) {
      const [x, y] = inside(0.75);
      for (let j = 0; j < 5; j++) spot(x + (rand() - 0.5) * 0.3, y + (rand() - 0.5) * 0.3, 0.08 + rand() * 0.16, snow ? 'rgba(170,130,115,0.06)' : 'rgba(120,52,24,0.07)');
    }
    // Brushed in sweeps of uneven length, the light catching some.
    for (let k = 1; k < b.h * 6; k++) {
      const y = b.y + k / 6 + (rand() - 0.5) * 0.05;
      const a = b.x + 0.2 + rand() * b.w * 0.3;
      const e = b.x + b.w - 0.2 - rand() * b.w * 0.3;
      p.line([a, y, 0], [e, y, 0], rand() < 0.5 ? 'rgba(255,215,185,0.07)' : snow ? 'rgba(160,120,100,0.05)' : 'rgba(110,45,20,0.06)', 1 + rand());
    }
    // Grit, scuffs and footprints.
    for (let k = 0; k < b.w * b.h * 9; k++) {
      const [sx, sy] = iso(b.x + 0.15 + rand() * (b.w - 0.3), b.y + 0.15 + rand() * (b.h - 0.3));
      c.fillStyle = rand() < 0.55 ? 'rgba(120,50,22,0.26)' : snow ? 'rgba(255,255,255,0.5)' : 'rgba(240,180,130,0.35)';
      c.fillRect(sx, sy, 1 + rand() * 1.5, 0.8);
    }
    // Grass (or snow) creeping in over the border.
    for (const [x, y] of ring(-0.05, 0.14)) {
      if (rand() < 0.35) continue;
      const [sx, sy] = iso(x, y);
      tuft(c, sx + (rand() - 0.5) * 4, sy + (rand() - 0.5) * 2, season, rand);
    }
    c.globalAlpha = 1;
  }

  private estateCache = { key: '', tiles: [] as number[] };

  /** The manor's grounds: the grass under the manor and its buildings worn into one gravelled shape. */
  private drawGrounds(s: GameState, season: Season): void {
    const key = `${s.buildings.length}:${s.nextId}:${s.buildings.find((b) => b.type === 'townhall')?.w ?? 0}`;
    if (this.estateCache.key !== key) this.estateCache = { key, tiles: [...estateTiles(s)] };
    const c = this.ctx;
    c.fillStyle = season === 3 ? 'rgba(205,200,190,0.55)' : 'rgba(168,146,104,0.5)';
    c.beginPath();
    for (const i of this.estateCache.tiles) {
      const x = i % s.width;
      const y = (i / s.width) | 0;
      // Each tile a little overgrown so neighbours run together.
      const g = 0.12;
      const pts = [iso(x - g, y - g), iso(x + 1 + g, y - g), iso(x + 1 + g, y + 1 + g), iso(x - g, y + 1 + g)];
      c.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) c.lineTo(px, py);
      c.closePath();
    }
    c.fill();
  }

  private drawFields(s: GameState, season: Season, selected?: number): void {
    this.drawGrounds(s, season);
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
        this.drawClaySquare(p, b, season);
      } else if (b.type === 'field') {
        this.drawField(p, b, season, month);
      } else if (b.type === 'pasture') {
        this.drawPasture(p, s, b, season, herds);
      } else if (b.type === 'deerpark') {
        this.drawDeerPark(p, b, season);
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
    const crop = b.recipe ?? 'vegetables';
    // The crop's stage: bare, sprouting, young, tall, ripe, stooked or stubble.
    let stage = 'bare';
    if (month <= 5 && b.growth > 0) stage = b.growth < 0.2 ? 'sprout' : b.growth < 0.5 ? 'young' : b.growth < 0.8 ? 'tall' : 'full';
    else if (month === 6 && b.growth > 0) stage = 'ripe';
    else if (month === 7) stage = 'stooks';
    else if (month === 8) stage = 'stubble';
    if ((crop === 'flax' || crop === 'woad') && stage === 'full' && month >= 3) stage = 'flower';
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

  /** The deer park: rough grass inside a paling fence, a few trees, and the deer grazing. */
  private drawDeerPark(p: Pen, b: Building, season: Season): void {
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const winter = season === 3;
    p.poly(
      [
        [x0, y0, 0],
        [x1, y0, 0],
        [x1, y1, 0],
        [x0, y1, 0],
      ],
      winter ? 'rgba(240,244,246,0.3)' : 'rgba(70,110,40,0.28)',
    );
    const post = '#6b4a2e';
    p.fence([x0 + 0.05, y0 + 0.05], [x1 - 0.05, y0 + 0.05], post);
    p.fence([x0 + 0.05, y0 + 0.05], [x0 + 0.05, y1 - 0.05], post);
    const rand = mulberry32(b.id * 13 + 1);
    // Woods in groves, with open glades between where the deer can be seen.
    const area = b.w * b.h;
    const groves: [number, number][] = [];
    for (let k = 0; k < Math.max(3, Math.round(area / 22)); k++) groves.push([x0 + 1 + rand() * (b.w - 2), y0 + 1 + rand() * (b.h - 2)]);
    const trees: { x: number; y: number; kind: TreeKind }[] = [];
    for (const [gx, gy] of groves) {
      for (let k = 0; k < Math.round(area / (groves.length * 3.2)); k++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 1.7;
        const x = Math.max(x0 + 0.4, Math.min(x1 - 0.4, gx + Math.cos(a) * r));
        const y = Math.max(y0 + 0.4, Math.min(y1 - 0.4, gy + Math.sin(a) * r));
        const v = rand();
        trees.push({ x, y, kind: v < 0.55 ? 'oak' : v < 0.8 ? 'pine' : 'birch' });
      }
    }
    // A few lone trees out in the glades.
    for (let k = 0; k < Math.round(area / 12); k++) trees.push({ x: x0 + 0.5 + rand() * (b.w - 1), y: y0 + 0.5 + rand() * (b.h - 1), kind: 'oak' });
    // The deer graze in the glades, wandering slowly about the park.
    const deer = Math.min(16, Math.max(4, Math.floor(area / 5)));
    const items: { x: number; y: number; tree?: TreeKind; j?: number }[] = trees.map((tr) => ({ x: tr.x, y: tr.y, tree: tr.kind }));
    for (let j = 0; j < deer; j++) {
      const r1 = rand();
      const r2 = rand();
      const t = this.time * 0.04 + r1 * 10;
      let x = x0 + 0.4 + (b.w - 0.8) * (0.5 + 0.45 * Math.sin(r1 * 6.283 + t * 0.5));
      let y = y0 + 0.4 + (b.h - 0.8) * (0.5 + 0.45 * Math.sin(r2 * 6.283 + t * 0.4));
      // Out of the thick of a grove, into the open.
      for (const [gx, gy] of groves) {
        const d = Math.hypot(x - gx, y - gy);
        if (d < 1.2) {
          x = Math.max(x0 + 0.4, Math.min(x1 - 0.4, gx + ((x - gx) / (d || 1)) * 1.3));
          y = Math.max(y0 + 0.4, Math.min(y1 - 0.4, gy + ((y - gy) / (d || 1)) * 1.3));
        }
      }
      items.push({ x, y, j });
    }
    // Trees and deer stand up, so they are sorted in with everything else.
    for (const it of items) {
      if (it.tree) {
        const tv = Math.floor(it.x * 7 + it.y * 3) % TREE_VARIANTS;
        const kind = it.tree;
        this.late.push({
          x: it.x,
          y: it.y,
          fn: () => {
            const sp = this.sprite(`t:${kind}:${season}:${tv}`, () => treeSprite(kind, season, tv));
            const [wx, wy] = iso(it.x, it.y);
            this.blit(sp, wx, wy, 1, TREE_SCALE * 0.9);
          },
        });
      } else {
        this.late.push({
          x: it.x,
          y: it.y,
          fn: () => {
            const [sx, sy] = iso(it.x, it.y);
            drawDeer(p.ctx, sx, sy, Math.sin(this.time * 0.02 + it.j!) > 0 ? 1 : -1, it.j! % 3 === 0);
          },
        });
      }
    }
    this.lateFence(p, [x1 - 0.05, y0 + 0.05], [x1 - 0.05, y1 - 0.05], post);
    this.lateFence(p, [x0 + 0.05, y1 - 0.05], [x1 - 0.05, y1 - 0.05], post);
  }

  /** A fence along the front of a zone, tile by tile, sorted in with what stands near it. */
  private lateFence(p: Pen, a: [number, number], b: [number, number], color: string): void {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k < n; k++) {
      const u: [number, number] = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      const v: [number, number] = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
      this.late.push({ x: (u[0] + v[0]) / 2, y: (u[1] + v[1]) / 2, fn: () => p.fence(u, v, color) });
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
    if (b.improved?.includes('animalsheds')) this.late.push({ x: x0 + 0.9, y: y0 + 0.5, fn: () => pastureShed(p, x0 + 0.2, y0 + 0.2, season === 3) });
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
      const breed = knows(s, 'c:frisian') ? 'frisian' : knows(s, 'c:highland') ? 'highland' : 'cattle';
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
      for (const { kind, ax, ay, f, j } of beasts) {
        this.late.push({
          x: ax,
          y: ay,
          fn: () => {
            const [sx, sy] = iso(ax, ay);
            if (kind === 'sheep') drawSheep(p.ctx, sx, sy, f, season === 3 ? '#e2ddd2' : '#f2ece0');
            else if (kind === 'goats') drawGoat(p.ctx, sx, sy, f, j);
            else drawBeast(p.ctx, sx, sy, f, kind === 'cattle' ? breed : kind, j);
          },
        });
      }
    }
    this.lateFence(p, [x1 - 0.05, y0 + 0.05], [x1 - 0.05, y1 - 0.05], post);
    this.lateFence(p, [x0 + 0.05, y1 - 0.05], [x0 + b.w / 2 - 0.3, y1 - 0.05], post);
    this.lateFence(p, [x0 + b.w / 2 + 0.3, y1 - 0.05], [x1 - 0.05, y1 - 0.05], post);
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
      const stage = Math.round(orchardMaturity(s, orchard) * 4) / 4;
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
    const look = variantOf(s, b);
    const sp = this.buildingSprite(b.type, b.level, season, turning ? look | 1 : look);
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
    if (b.type === 'hedge') {
      this.drawHedge(s, b, season);
      return;
    }
    if (b.type === 'flowerbed') {
      this.drawFlowerBed(s, b, season);
      return;
    }
    this.blit(sp, wx, wy);
    if (b.type === 'house' && b.flowers) this.drawDoorFlowers(b, season);
    if (b.improved?.length) drawImprovements(c, b, season, this.time);
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
    if (b.type === 'townhall' && (s.commissions?.includes('tapestry') || optionOn(s, 'banners'))) this.drawHeraldry(b);
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
    } else if (b.workers > 0 && !b.paused && (b.efficiency ?? 1) < LOW_EFFICIENCY) {
      // Losing much of the day to walking: select it to see how much.
      this.drawMarker(b, '#b8683a', 'walk');
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

  /** The finished neighbour of a hedge or bed at (dx, dy), if it is one of `type` (and of `group`). */
  private kin(s: GameState, b: Building, dx: number, dy: number, group?: number): boolean {
    const nx = b.x + dx;
    const ny = b.y + dy;
    if (!inBounds(s, nx, ny)) return false;
    const o = s.occ[idx(s, nx, ny)] >= 0 ? this.byId.get(s.occ[idx(s, nx, ny)]) : undefined;
    return !!o && o.type === b.type && o.build >= 1 && (group === undefined || o.group === group);
  }

  /**
   * Hedges grow into rows: each one reaches out to the hedges beside it, and
   * a row ends (or a lone hedge stands) with a clipped ball on a stem.
   */
  private drawHedge(s: GameState, b: Building, season: Season): void {
    const p = new Pen(this.ctx);
    const x = b.x;
    const y = b.y;
    const g = season === 3 ? '#8a9a86' : '#3d6b30';
    const top = season === 3 ? '#e8ecec' : shade(g, 1.18);
    const H = 7;
    const w = this.kin(s, b, -1, 0);
    const n = this.kin(s, b, 0, -1);
    const e = this.kin(s, b, 1, 0);
    const so = this.kin(s, b, 0, 1);
    const links = +w + +n + +e + +so;
    const side = shade(g, 0.76);
    // One bar along each line the hedge runs, without outlines, so a row reads as one hedge:
    // the faces where it carries on into the next tile are left out.
    const ink = shade(g, 0.5);
    const bar = (x0: number, y0: number, x1: number, y1: number, h: number, openW: boolean, openN: boolean, openE: boolean, openS: boolean) => {
      if (!openS) p.poly([[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]], g);
      if (!openE) p.poly([[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], side);
      p.poly([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]], top);
      // The outline: lines along the row meet their neighbours' end to end.
      if (!openS) {
        p.line([x0, y1, 0], [x1, y1, 0], ink, 0.7);
        p.line([x0, y1, h], [x1, y1, h], ink, 0.6);
      }
      if (!openE) {
        p.line([x1, y0, 0], [x1, y1, 0], ink, 0.7);
        p.line([x1, y0, h], [x1, y1, h], ink, 0.6);
        p.line([x1, y1, 0], [x1, y1, h], ink, 0.6);
      }
      if (!openN) p.line([x0, y0, h], [x1, y0, h], ink, 0.5);
      if (!openW) p.line([x0, y0, h], [x0, y1, h], ink, 0.5);
    };
    const a = 0.35;
    const z = 1 - a;
    if (n || so) bar(x + a, y + (n ? 0 : a), x + z, y + (so ? 1 : z), H, false, n, false, so);
    if (w || e || links === 0) bar(x + (w ? 0 : a), y + a, x + (e ? 1 : z), y + z, links ? H : H - 1, w, false, e, false);
    if (season !== 3) {
      // A few lighter leaves along the top.
      const rand = mulberry32(x * 73856093 + y * 19349663);
      for (let k = 0; k < 5; k++) {
        const along = rand();
        const span = links ? along : 0.38 + along * 0.24;
        const [lx, ly] = w || e ? [x + span, y + 0.4 + rand() * 0.2] : [x + 0.4 + rand() * 0.2, y + span];
        p.circle(lx, ly, H + 0.3, 1.1, shade(g, 1.3));
      }
    }
    if (links <= 1) {
      // The end of a row, or a lone hedge: a topiary ball.
      const [tx, ty] = iso(x + 0.5, y + 0.5, H);
      const c = this.ctx;
      c.fillStyle = shade(g, 0.85);
      c.fillRect(tx - 0.8, ty - 4, 1.6, 4);
      c.fillStyle = g;
      c.beginPath();
      c.arc(tx, ty - 8, 4.6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = season === 3 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.16)';
      c.beginPath();
      c.arc(tx - 1.4, ty - 9.4, 2, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Where a flower bed's soil lies on its tile: to the tile's edge where the bed carries on. */
  private bedBounds(s: GameState, b: Building) {
    const g = b.group;
    const W = this.kin(s, b, -1, 0, g);
    const N = this.kin(s, b, 0, -1, g);
    const E = this.kin(s, b, 1, 0, g);
    const S = this.kin(s, b, 0, 1, g);
    const edge = 0.08;
    const lip = 0.06;
    const x0 = b.x + (W ? 0 : edge);
    const x1 = b.x + 1 - (E ? 0 : edge);
    const y0 = b.y + (N ? 0 : edge);
    const y1 = b.y + 1 - (S ? 0 : edge);
    return { x0, x1, y0, y1, sx0: x0 + (W ? 0 : lip), sx1: x1 - (E ? 0 : lip), sy0: y0 + (N ? 0 : lip), sy1: y1 - (S ? 0 : lip) };
  }

  /**
   * The ground of the flower beds, laid with the fields under everything
   * else: beds laid in one go share one stone edging round the outside.
   */
  private drawBedGround(s: GameState, season: Season, visible: (x: number, y: number) => boolean): void {
    const c = this.ctx;
    const quad = (x0: number, y0: number, x1: number, y1: number, fill: string) => {
      const pts = [iso(x0, y0, 0), iso(x1, y0, 0), iso(x1, y1, 0), iso(x0, y1, 0)];
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) c.lineTo(px, py);
      c.closePath();
      c.fill();
    };
    const beds = s.buildings.filter((b) => b.type === 'flowerbed' && b.build >= 1 && visible(...iso(b.x + 0.5, b.y + 0.5)));
    for (const b of beds) {
      const r = this.bedBounds(s, b);
      quad(r.x0, r.y0, r.x1, r.y1, '#9a9288');
    }
    for (const b of beds) {
      const r = this.bedBounds(s, b);
      quad(r.sx0, r.sy0, r.sx1, r.sy1, season === 3 ? '#e2e7e6' : '#5a3e24');
    }
  }

  /**
   * Flower beds laid in one go grow into one bed: their ground is laid with
   * the fields (drawBedGround); here the plants stand on it, thick enough to
   * hide the soil, the flowers carrying on from tile to tile.
   */
  private drawFlowerBed(s: GameState, b: Building, season: Season): void {
    if (season === 3) return;
    const c = this.ctx;
    const r = this.bedBounds(s, b);
    const flowers = season === 2 ? ['#d8903a', '#b8503a', '#e0c040', '#c86a2a'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0', '#e86a3a', '#6a8ad8'];
    const leaf = season === 2 ? ['#6a7a34', '#7a8a3a'] : ['#3f7a2c', '#4f8a34', '#5e9a3e'];
    const rand = mulberry32(b.x * 73856093 + b.y * 19349663 + 7);
    // Plants on a grid (jittered), drawn back to front so nearer ones overlap.
    const step = 0.13;
    const spots: [number, number][] = [];
    for (let y = r.sy0 + step / 2; y < r.sy1; y += step) {
      for (let x = r.sx0 + step / 2; x < r.sx1; x += step) spots.push([x + (rand() - 0.5) * step * 0.8, y + (rand() - 0.5) * step * 0.8]);
    }
    spots.sort((a, b2) => a[0] + a[1] - (b2[0] + b2[1]));
    for (const [px, py] of spots) {
      const [fx, fy] = iso(Math.min(r.sx1 - 0.02, Math.max(r.sx0 + 0.02, px)), Math.min(r.sy1 - 0.02, Math.max(r.sy0 + 0.02, py)), 0);
      c.fillStyle = leaf[Math.floor(rand() * leaf.length)];
      c.beginPath();
      c.ellipse(fx, fy - 1.2, 3.2, 2.2, 0, 0, Math.PI * 2);
      c.fill();
      if (rand() < 0.75) {
        c.fillStyle = flowers[Math.floor(rand() * flowers.length)];
        c.beginPath();
        c.arc(fx + (rand() - 0.5) * 2, fy - 3, 1.35, 0, Math.PI * 2);
        c.fill();
        if (rand() < 0.4) {
          c.beginPath();
          c.arc(fx + (rand() - 0.5) * 3, fy - 2.2, 1.1, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }

  /** Flower boxes along the front of a home's plot, between the door and the street. */
  private drawDoorFlowers(b: Building, season: Season): void {
    const p = new Pen(this.ctx);
    const wood = '#8a5a30';
    const soil = season === 3 ? '#e8ecec' : '#6a4a2c';
    const boxes: [number, number, number, number][] = [
      [b.x + 0.18, b.y + 1.86, b.x + 0.9, b.y + 1.97],
      [b.x + 1.86, b.y + 1.1, b.x + 1.97, b.y + 1.85],
    ];
    if (season === 3) {
      for (const [x0, y0, x1, y1] of boxes) p.box(x0, y0, x1, y1, 0, 2.5, wood, soil);
      return;
    }
    const flowers = season === 2 ? ['#d8903a', '#b8503a', '#e0c040'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0'];
    const rand = mulberry32(b.id * 2654435761);
    for (const [x0, y0, x1, y1] of boxes) {
      p.box(x0, y0, x1, y1, 0, 2.5, wood, soil);
      const long = x1 - x0 > y1 - y0;
      for (let t = 0.06; t < 1; t += 0.16) {
        const fx = long ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
        const fy = long ? (y0 + y1) / 2 : y0 + (y1 - y0) * t;
        p.circle(fx, fy, 3.4, 1.6, '#4f8a34');
        p.circle(fx, fy, 4.6, 1.15, flowers[Math.floor(rand() * flowers.length)]);
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

  /** Butterflies flitting over flower beds and gardens on spring and summer days. */
  private drawButterflies(s: GameState, visible: (x: number, y: number) => boolean): void {
    if (this.dusk > 0.3) return;
    const c = this.ctx;
    const COLORS = ['#f2e8a0', '#f4f0e8', '#e89a3a', '#a8c8f0', '#e8a0c0'];
    for (const b of s.buildings) {
      if (b.build < 1) continue;
      const n = b.type === 'flowerbed' ? 1 : b.type === 'garden' || b.type === 'fountain' ? 2 : b.type === 'publicgarden' ? 4 : b.type === 'manorgarden' ? 6 : 0;
      if (!n) continue;
      const [cx, cy] = iso(b.x + b.w / 2, b.y + b.h / 2);
      if (!visible(cx, cy)) continue;
      const r = Math.min(40, 6 + b.w * 4);
      for (let k = 0; k < n; k++) {
        const ph = b.id * 1.7 + k * 2.3;
        const t = this.time * 0.6 + ph;
        const x = cx + Math.sin(t) * r + Math.sin(t * 2.7) * 4;
        const y = cy - 10 + Math.cos(t * 0.8) * r * 0.45 + Math.sin(t * 3.1) * 3;
        const flap = Math.abs(Math.sin(this.time * 14 + ph));
        c.fillStyle = COLORS[(b.id + k) % COLORS.length];
        c.beginPath();
        c.ellipse(x - 1.2, y, 1.6 * flap + 0.3, 1.2, -0.4, 0, Math.PI * 2);
        c.ellipse(x + 1.2, y, 1.6 * flap + 0.3, 1.2, 0.4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#3a2c20';
        c.fillRect(x - 0.3, y - 1, 0.6, 2);
      }
    }
  }

  /** Spots in the meadows and by the water where fireflies dance on summer nights. */
  private fireflySpots: number[] | null = null;
  private fireflyMap: Uint8Array | null = null;

  private drawFireflies(s: GameState, visible: (x: number, y: number) => boolean): void {
    if (this.dusk < 0.4) return;
    if (!this.fireflySpots || this.fireflyMap !== s.terrain) {
      this.fireflyMap = s.terrain;
      this.fireflySpots = [];
      for (let i = 0; i < s.terrain.length; i++) if (!s.terrain[i] && (Math.imul(i, 2246822519) >>> 0) % 23 === 0) this.fireflySpots.push(i);
    }
    const c = this.ctx;
    const glow = Math.min(1, (this.dusk - 0.4) / 0.3);
    for (const i of this.fireflySpots) {
      if (s.occ[i] >= 0 || s.road[i]) continue;
      const [cx, cy] = iso((i % s.width) + 0.5, Math.floor(i / s.width) + 0.5);
      if (!visible(cx, cy)) continue;
      for (let k = 0; k < 3; k++) {
        const ph = i * 0.37 + k * 2.1;
        const t = this.time * 0.5 + ph;
        const x = cx + Math.sin(t) * 12 + Math.sin(t * 2.3) * 3;
        const y = cy - 6 + Math.cos(t * 0.7) * 5 - Math.abs(Math.sin(t * 1.3)) * 6;
        const blink = Math.max(0, Math.sin(this.time * 2.2 + ph * 3));
        if (blink < 0.05) continue;
        c.fillStyle = `rgba(220,255,110,${0.4 * glow * blink})`;
        c.beginPath();
        c.arc(x, y, 4.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgba(250,255,190,${glow * blink})`;
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }
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
      const i = plan[k] >> 3;
      const paved = (plan[k] & 7) >= 2;
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
      const [cx, cy] = iso(sh.x, sh.y);
      if (!visible(cx, cy)) return;
      if (sh.pen !== undefined && s.buildings.some((b) => b.id === sh.pen)) this.drawFishPen(sh.x, sh.y);
      if (sh.n < 1) return;
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

  /** A ring of wooden stakes in the water, with a rail, where pisciculture keeps its shoal. */
  private drawFishPen(x: number, y: number): void {
    const c = this.ctx;
    const r = 0.95;
    const n = 22;
    const pts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      pts.push(iso(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    // The back half first, then the rail, then the front stakes over it.
    const stake = (k: number) => {
      const [sx, sy] = pts[k];
      c.fillStyle = '#5a3e26';
      c.fillRect(sx - 1, sy - 6, 2, 7);
      c.fillStyle = '#7a5a3a';
      c.fillRect(sx - 1, sy - 6, 1, 7);
      c.fillStyle = 'rgba(220,235,245,0.5)';
      c.fillRect(sx - 2, sy, 4, 1);
    };
    const back = (k: number) => pts[k][1] < iso(x, y)[1];
    for (let k = 0; k < n; k++) if (back(k)) stake(k);
    c.strokeStyle = '#6b4a2e';
    c.lineWidth = 1.4;
    c.beginPath();
    pts.forEach(([sx, sy], k) => (k ? c.lineTo(sx, sy - 4.5) : c.moveTo(sx, sy - 4.5)));
    c.closePath();
    c.stroke();
    for (let k = 0; k < n; k++) if (!back(k)) stake(k);
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
  private lordLook: LordLook = DEFAULT_LORD;

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
    // The improved store has built over its yard: everything is inside.
    if (b.improved?.includes('bigstore')) return;
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
    if (glyph === 'walk') {
      // Two footprints, one ahead of the other.
      c.fillStyle = '#fff';
      for (const [fx, fy, rot] of [[-2.2, 1.6, -0.25], [2.2, -1.8, 0.25]] as const) {
        c.save();
        c.translate(x + fx, y + fy);
        c.rotate(rot);
        c.beginPath();
        c.ellipse(0, 0.6, 1.6, 2.6, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(0, -2.9, 1.1, 1, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      return;
    }
    c.fillStyle = '#fff';
    c.font = 'bold 11px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(glyph, x, y + 0.5);
  }

  /**
   * A building site in three stages: the ground pegged out and footings laid;
   * the frame (or, for stone buildings, the walls) going up in scaffolding;
   * then the walls closed and the roof raised, rafters first and the covering
   * creeping up from the eaves.
   */
  private drawConstruction(b: Building, sp: Sprite, wx: number, wy: number): void {
    void sp;
    void wx;
    void wy;
    const c = this.ctx;
    const p = new Pen(c);
    const d = BUILDINGS[b.type];
    const prog = Math.max(0, Math.min(1, b.build));
    const stage = prog < 1 / 3 ? 0 : prog < 2 / 3 ? 1 : 2;
    const within = Math.min(1, (prog - stage / 3) * 3);
    const x0 = b.x + 0.28;
    const y0 = b.y + 0.28;
    const x1 = b.x + b.w - 0.28;
    const y1 = b.y + b.h - 0.28;
    const big = Math.max(b.w, b.h);
    const wallH = Math.min(30, 9 + big * 3.5);
    const roofH = wallH * 0.75;
    const stoneCost = (d.cost.stone ?? 0) + (d.cost.dressedstone ?? 0);
    const stone = stoneCost > 0 && stoneCost >= (d.cost.wood ?? 0) * 0.6;
    const BEAM = '#7b5a36';
    // Trodden earth over the whole plot.
    p.poly(
      [
        [b.x + 0.1, b.y + 0.1, 0],
        [b.x + b.w - 0.1, b.y + 0.1, 0],
        [b.x + b.w - 0.1, b.y + b.h - 0.1, 0],
        [b.x + 0.1, b.y + b.h - 0.1, 0],
      ],
      '#a08a62',
      '#7a6440',
      1,
    );
    if (b.type === 'wall') {
      // A stretch of town wall: courses of stone rising.
      p.box(x0, y0, x1, y1, 0, Math.max(1, 16 * prog), '#b9ae98', undefined, 'stone');
      p.stonePile(b.x + 0.2, b.y + b.h - 0.3, 2);
      return;
    }
    // Pegs at the corners and the string line between them.
    const corners: [number, number][] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    if (stage === 0) {
      for (const [x, y] of corners) p.line([x, y, 0], [x, y, 4], '#6e5030', 1.2);
      for (let k = 0; k < 4; k++) {
        const a = corners[k];
        const n = corners[(k + 1) % 4];
        p.line([a[0], a[1], 3], [n[0], n[1], 3], 'rgba(240,232,210,0.9)', 0.6);
      }
    }
    // The footings, laid round the plot (the back sides first), then whole.
    const sides: [V3, V3][] = [
      [[x0, y0, 0], [x1, y0, 0]],
      [[x0, y0, 0], [x0, y1, 0]],
      [[x1, y0, 0], [x1, y1, 0]],
      [[x0, y1, 0], [x1, y1, 0]],
    ];
    const footing = stage === 0 ? within : 1;
    const sill = stone ? '#a8a08c' : '#8a6a44';
    sides.forEach(([a, e], k) => {
      const f = Math.max(0, Math.min(1, footing * 4 - k));
      if (f <= 0) return;
      const ex = a[0] + (e[0] - a[0]) * f;
      const ey = a[1] + (e[1] - a[1]) * f;
      // A dark trench, and the sill or stone footing in it.
      p.box(Math.min(a[0], ex) - 0.06, Math.min(a[1], ey) - 0.06, Math.max(a[0], ex) + 0.06, Math.max(a[1], ey) + 0.06, 0, 2.2, sill, undefined, stone ? 'stone' : undefined);
    });
    if (stage >= 1) {
      // Walls or frame: how high they stand.
      const rise = stage === 1 ? within : 1;
      const back = () => {
        if (stone) {
          p.box(x0, y0, x1, y0 + 0.14, 2, (wallH - 2) * rise, '#b9ae98', undefined, 'stone');
          p.box(x0, y0, x0 + 0.14, y1, 2, (wallH - 2) * rise, '#b9ae98', undefined, 'stone');
        }
      };
      const front = () => {
        if (stone) {
          p.box(x0, y1 - 0.14, x1, y1, 2, (wallH - 2) * rise, '#c4b9a3', undefined, 'stone');
          p.box(x1 - 0.14, y0, x1, y1, 2, (wallH - 2) * rise, '#c4b9a3', undefined, 'stone');
        }
      };
      // Timber posts, set one after another, back ones first.
      const posts: [number, number][] = [];
      const step = (a: number, e: number) => Math.max(1, Math.round((e - a) / 0.55));
      for (let k = 0, n = step(x0, x1); k <= n; k++) posts.push([x0 + ((x1 - x0) * k) / n, y0]);
      for (let k = 1, n = step(y0, y1); k <= n; k++) posts.push([x0, y0 + ((y1 - y0) * k) / n]);
      for (let k = 1, n = step(y0, y1); k <= n; k++) posts.push([x1, y0 + ((y1 - y0) * k) / n]);
      for (let k = 1, n = step(x0, x1); k < n; k++) posts.push([x0 + ((x1 - x0) * k) / n, y1]);
      posts.sort((u, v) => u[0] + u[1] - (v[0] + v[1]));
      const shown = stone ? 4 : stage === 1 ? Math.ceil(posts.length * Math.min(1, within * 1.4)) : posts.length;
      const frame = stone ? corners.map(([x, y]) => [x, y] as [number, number]) : posts.slice(0, shown);
      back();
      // In the last stage the walls are closed with wattle and daub, from the back.
      const infill = !stone && stage === 2 ? Math.min(1, within * 1.8) : 0;
      if (infill > 0) {
        p.wallL(y0, x0, x1, 2, 2 + (wallH - 2) * infill, '#cdb994');
        p.wallR(x0, y0, y1, 2, 2 + (wallH - 2) * infill, '#c2ad86');
      }
      if (!stone) for (const [x, y] of frame.filter(([x, y]) => y === y0 || x === x0)) p.line([x, y, 2], [x, y, wallH], BEAM, 1.6);
      // Top plates once the corners stand.
      if (!stone && (stage === 2 || within > 0.75)) {
        p.line([x0, y0, wallH], [x1, y0, wallH], BEAM, 1.4);
        p.line([x0, y0, wallH], [x0, y1, wallH], BEAM, 1.4);
      }
      // Rafters and the ridge, then the covering from the eaves up.
      if (stage === 2) {
        const alongX = b.w >= b.h;
        const ym = (y0 + y1) / 2;
        const xm = (x0 + x1) / 2;
        const rafters = within > 0.15 ? Math.ceil(Math.min(1, (within - 0.15) * 3) * (alongX ? (x1 - x0) / 0.4 : (y1 - y0) / 0.4)) : 0;
        const kind: RoofKind = stone ? 'tile' : d.cost.planks ? 'shingle' : 'thatch';
        const col = kind === 'thatch' ? '#c9a95e' : kind === 'tile' ? '#a8553a' : '#7a5a3a';
        const cover = Math.max(0, (within - 0.55) / 0.45);
        // The back slope's covering goes on first.
        if (cover > 0) {
          const back: V3[] = alongX
            ? [[x0 - 0.08, y0 - 0.08, wallH], [x1 + 0.08, y0 - 0.08, wallH], [x1 + 0.08, y0 + (ym - y0) * cover, wallH + roofH * cover], [x0 - 0.08, y0 + (ym - y0) * cover, wallH + roofH * cover]]
            : [[x0 - 0.08, y0 - 0.08, wallH], [x0 - 0.08, y1 + 0.08, wallH], [x0 + (xm - x0) * cover, y1 + 0.08, wallH + roofH * cover], [x0 + (xm - x0) * cover, y0 - 0.08, wallH + roofH * cover]];
          p.poly(back, shade(col, 0.82), shade(col, 0.5));
        }
        for (let k = 0; k <= rafters; k++) {
          if (alongX) {
            const x = Math.min(x1, x0 + k * 0.4);
            p.line([x, y0, wallH], [x, ym, wallH + roofH], BEAM, 1.1);
            p.line([x, y1, wallH], [x, ym, wallH + roofH], BEAM, 1.1);
          } else {
            const y = Math.min(y1, y0 + k * 0.4);
            p.line([x0, y, wallH], [xm, y, wallH + roofH], BEAM, 1.1);
            p.line([x1, y, wallH], [xm, y, wallH + roofH], BEAM, 1.1);
          }
        }
        if (rafters > 1) {
          if (alongX) p.line([x0, ym, wallH + roofH], [x0 + Math.min(x1 - x0, rafters * 0.4), ym, wallH + roofH], BEAM, 1.4);
          else p.line([xm, y0, wallH + roofH], [xm, y0 + Math.min(y1 - y0, rafters * 0.4), wallH + roofH], BEAM, 1.4);
        }
        if (infill > 0) {
          p.wallL(y1, x0, x1, 2, 2 + (wallH - 2) * infill, '#dcc8a2');
          p.wallR(x1, y0, y1, 2, 2 + (wallH - 2) * infill, '#cfba92');
        }
        if (cover > 0) {
          const front: V3[] = alongX
            ? [[x0 - 0.08, y1 + 0.08, wallH], [x1 + 0.08, y1 + 0.08, wallH], [x1 + 0.08, y1 - (y1 - ym) * cover, wallH + roofH * cover], [x0 - 0.08, y1 - (y1 - ym) * cover, wallH + roofH * cover]]
            : [[x1 + 0.08, y0 - 0.08, wallH], [x1 + 0.08, y1 + 0.08, wallH], [x1 - (x1 - xm) * cover, y1 + 0.08, wallH + roofH * cover], [x1 - (x1 - xm) * cover, y0 - 0.08, wallH + roofH * cover]];
          p.poly(front, col, shade(col, 0.5));
        }
      } else if (infill > 0) {
        p.wallL(y1, x0, x1, 2, 2 + (wallH - 2) * infill, '#dcc8a2');
        p.wallR(x1, y0, y1, 2, 2 + (wallH - 2) * infill, '#cfba92');
      }
      front();
      if (!stone) {
        for (const [x, y] of frame.filter(([x, y]) => !(y === y0 || x === x0))) p.line([x, y, 2], [x, y, wallH], BEAM, 1.6);
        if (stage === 2 || within > 0.75) {
          p.line([x1, y0, wallH], [x1, y1, wallH], BEAM, 1.4);
          p.line([x0, y1, wallH], [x1, y1, wallH], BEAM, 1.4);
          // A brace in the front corner.
          p.line([x1, y1 - 0.45, 2], [x1, y1, wallH * 0.6], BEAM, 1);
        }
      }
      // Scaffolding along the front, and a ladder leaning on it.
      const sh = Math.min(wallH, 4 + (wallH - 4) * (stage === 1 ? within : 1));
      for (const [x, y] of [
        [x0 - 0.12, y1 + 0.22],
        [(x0 + x1) / 2, y1 + 0.22],
        [x1 + 0.22, y1 + 0.22],
        [x1 + 0.22, (y0 + y1) / 2],
        [x1 + 0.22, y0 - 0.12],
      ] as const)
        p.line([x, y, 0], [x, y, sh + 4], '#8a6a44', 1.2);
      // The walkway boards, once the walls are worth climbing.
      if (sh >= 10) {
        p.box(x0 - 0.12, y1 + 0.14, x1 + 0.22, y1 + 0.3, sh * 0.6, 0.6, '#c8a46c');
        p.box(x1 + 0.14, y0 - 0.12, x1 + 0.3, y1 + 0.22, sh * 0.6, 0.6, '#c8a46c');
      }
      if (stage === 2) {
        const lx = x0 + (x1 - x0) * 0.3;
        for (const dx of [0, 0.16]) p.line([lx + dx, y1 + 0.55, 0], [lx + dx, y1 + 0.05, wallH * 0.85], '#6e5030', 1);
        for (let k = 1; k < 6; k++) {
          const t = k / 6;
          p.line([lx, y1 + 0.55 - 0.5 * t, wallH * 0.85 * t], [lx + 0.16, y1 + 0.55 - 0.5 * t, wallH * 0.85 * t], '#6e5030', 0.8);
        }
      }
    }
    // Materials delivered so far, stacked beside the site.
    const got = deliveredTo(b);
    const wood = got.wood ?? 0;
    const stoneN = (got.stone ?? 0) + (got.dressedstone ?? 0);
    const planks = got.planks ?? 0;
    if (wood > 0) p.logPile(b.x + b.w - 0.1, b.y + b.h - 0.6, Math.min(3, 1 + Math.floor(wood / 8)));
    if (stoneN > 0) p.stonePile(b.x + 0.15, b.y + b.h - 0.35, Math.min(6, 1 + Math.floor(stoneN / 6)));
    if (planks > 0) {
      for (let i = 0; i < Math.min(4, 1 + Math.floor(planks / 6)); i++) {
        p.box(b.x + b.w - 0.7, b.y + 0.15, b.x + b.w - 0.25, b.y + 0.35, i * 2.2, 2, i % 2 ? '#d7b47c' : '#c8a46c');
      }
    }
    // Progress bar.
    const top = stage === 2 ? wallH + roofH : stage === 1 ? wallH : 6;
    const [bx, by] = iso(b.x + b.w / 2, b.y + b.h / 2, top + 16);
    c.fillStyle = 'rgba(40,28,16,0.75)';
    c.fillRect(bx - 18, by - 3, 36, 6);
    c.fillStyle = '#e8c860';
    c.fillRect(bx - 17, by - 2, 34 * prog, 4);
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
    if (a.role.kind === 'beast') {
      this.drawBeast(a, a.role.animal);
      return;
    }
    const c = this.ctx;
    const [wx, wy] = iso(a.x + a.ox * 0.25, a.y + a.oy * 0.25);
    const walking = a.phase === 'walk';
    let bob = walking ? Math.abs(Math.sin(a.step)) * 1.2 : 0;
    let legA = walking ? Math.sin(a.step) * 2 : 0;
    // A fisher faces the water he has cast into.
    const casting = a.phase === 'act' && a.act === 'fish' && a.cast ? iso(a.cast.x, a.cast.y) : null;
    if (casting && Math.abs(casting[0] - wx) > 0.5) a.dir = casting[0] > wx ? 1 : -1;
    // Leisure: dancing round the maypole, kneeling in prayer, sitting a while, a mug raised.
    const leisure = a.phase === 'act' && LEISURE_ACTS.has(a.act) ? a.act : '';
    const lh = hashKey(a.key);
    // Work that is done low: kneeling to plant, crouching to pick from the ground.
    const work = a.phase === 'act' && !leisure ? a.act : '';
    const kneel = work === 'plant';
    const crouch = work === 'pick';
    if (leisure === 'dance') {
      bob = Math.abs(Math.sin(this.time * 9 + lh)) * 1.8;
      legA = Math.sin(this.time * 9 + lh) * 1.8;
    } else if (leisure === 'pray' || leisure === 'sit' || kneel) bob = 3;
    else if (crouch) bob = 1.8;
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
    if (a.role.kind === 'lord') {
      // The lord, as the player dressed them, in a tabard of their arms;
      // with a stable and a groom, on horseback.
      if (this.lordRides) {
        drawHorse(c, wx, wy, a.dir, { coat: '#5e3e28', step: a.step, walking, cloth: this.lordLook.cloth });
        const lift = walking ? Math.abs(Math.sin(a.step * 1.4)) * 0.6 : 0;
        c.save();
        // The lord's hips (4 units above the feet) rest in the saddle.
        c.translate(wx - 0.8 * a.dir, wy - 8.6 - lift);
        if (a.dir < 0) c.scale(-1, 1);
        drawLord(c, this.lordLook, 0, 0, 0.95, HERALDRY.current, 0, true);
        c.restore();
      } else {
        c.save();
        c.translate(wx, wy - bob);
        if (a.dir < 0) c.scale(-1, 1);
        drawLord(c, this.lordLook, 0, 0, 1.05, HERALDRY.current, walking ? Math.sin(a.step) : 0);
        c.restore();
      }
      c.globalAlpha = 1;
      return;
    }
    if (leisure === 'sit') {
      // A log to sit on.
      c.fillStyle = '#7a5a3a';
      c.fillRect(wx - 3.5, wy - 4, 7, 3);
      c.fillStyle = '#a07a50';
      c.fillRect(wx - 3.5, wy - 4, 7, 0.9);
    }
    // Legs.
    c.strokeStyle = '#3a2c20';
    c.lineWidth = 1.4;
    c.beginPath();
    if (leisure === 'sit') {
      // Knees forward, feet down.
      for (const o of [-1, 1]) {
        c.moveTo(wx + o, wy - 4 - bob);
        c.lineTo(wx + o + 3 * a.dir, wy - 4 - bob + 0.6);
        c.lineTo(wx + o + 3.4 * a.dir, wy);
      }
    } else if (leisure === 'pray' || kneel) {
      // Kneeling: shins along the ground behind.
      c.moveTo(wx - 0.5, wy - 4 - bob);
      c.lineTo(wx - 0.5, wy - 0.4);
      c.lineTo(wx - 3.5 * a.dir, wy);
    } else if (crouch) {
      // Crouching: knees bent forward over the feet.
      for (const o of [-1, 1]) {
        c.moveTo(wx + o * 0.8, wy - 4 - bob);
        c.lineTo(wx + o * 0.8 + 2.4 * a.dir, wy - 2.2);
        c.lineTo(wx + o * 0.8 + 0.6 * a.dir, wy);
      }
    } else {
      c.moveTo(wx - 1, wy - 4 - bob);
      c.lineTo(wx - 1 + legA, wy);
      c.moveTo(wx + 1, wy - 4 - bob);
      c.lineTo(wx + 1 - legA, wy);
    }
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
    if (leisure) this.drawLeisure(a, leisure, wx, wy, bob, lh);
    if (casting) this.drawFishing(a, wx, wy, casting);
    // The work itself: each trade with its own tool and motion.
    else if (work) this.drawWork(a, work, wx, wy, bob);
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

  /**
   * A villager at work, drawn in their scaled frame: arms, the tool of the
   * trade and its motion, and what flies from it (chips, clods, sawdust).
   * `step` runs on while they work; each act turns it into its own cycle.
   */
  private drawWork(a: Agent, act: string, wx: number, wy: number, bob: number): void {
    const c = this.ctx;
    const f = a.dir;
    const t = a.step;
    const sx = wx + 0.8 * f;
    const sy = wy - 9.4 - bob;
    const arm = shade(a.tunic, 0.82);
    const skin = '#e8c4a0';
    const IRON = '#9aa0a6';
    const HANDLE = '#7a5434';
    const at = (ang: number, r: number, ox = sx, oy = sy): [number, number] => [ox + Math.cos(ang) * r * f, oy + Math.sin(ang) * r];
    const line = (x0: number, y0: number, x1: number, y1: number, col: string, w: number) => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    };
    const hand = (x: number, y: number) => {
      c.fillStyle = skin;
      c.beginPath();
      c.arc(x, y, 0.8, 0, Math.PI * 2);
      c.fill();
    };
    const armTo = (x: number, y: number) => {
      line(sx, sy, x, y, arm, 1.3);
      hand(x, y);
    };
    const bits = (x: number, y: number, q: number, col: string, n = 3, spread = 2.6) => {
      c.fillStyle = col;
      for (let k = 0; k < n; k++) {
        const vx = (k - (n - 1) / 2) * spread + f * 1.5;
        c.fillRect(x + vx * q - 0.5, y - 4 * q + 7 * q * q - 0.5, 1.1, 1.1);
      }
    };
    c.lineCap = 'round';
    switch (act) {
      case 'chop':
      case 'dig': {
        // Raised up behind the head, then brought down hard; it rests a beat on the blow.
        const p = (t * 0.32) % 1;
        const ease = (u: number) => 1 - (1 - u) * (1 - u);
        const ang = p < 0.55 ? 0.55 + (-2.5 - 0.55) * ease(p / 0.55) : p < 0.68 ? -2.5 + (0.55 + 2.5) * ((p - 0.55) / 0.13) ** 2 : 0.55;
        const [hx, hy] = at(ang, 3.6);
        const [ex, ey] = at(ang, 10.5);
        const [bx, by] = at(ang, 1.6);
        line(sx - 0.6 * f, sy + 0.4, bx, by, arm, 1.3);
        armTo(hx, hy);
        hand(bx, by);
        line(bx, by, ex, ey, HANDLE, 1.2);
        const ux = Math.cos(ang) * f;
        const uy = Math.sin(ang);
        const nx = -Math.sin(ang) * f;
        const ny = Math.cos(ang);
        if (act === 'chop') {
          // The axe head: a wedge flaring to its edge.
          c.fillStyle = IRON;
          c.beginPath();
          c.moveTo(ex - ux * 0.8, ey - uy * 0.8);
          c.lineTo(ex + ux * 0.6, ey + uy * 0.6);
          c.lineTo(ex + ux * 1.4 + nx * 2.8, ey + uy * 1.4 + ny * 2.8);
          c.lineTo(ex - ux * 1.8 + nx * 2.8, ey - uy * 1.8 + ny * 2.8);
          c.closePath();
          c.fill();
          line(ex + ux * 1.4 + nx * 2.8, ey + uy * 1.4 + ny * 2.8, ex - ux * 1.8 + nx * 2.8, ey - uy * 1.8 + ny * 2.8, '#dfe4e8', 0.6);
        } else {
          // The pick: a curved iron bar across the end of the haft.
          c.strokeStyle = IRON;
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(ex - nx * 2.4 - ux * 0.7, ey - ny * 2.4 - uy * 0.7);
          c.quadraticCurveTo(ex + ux * 0.5, ey + uy * 0.5, ex + nx * 2.6 - ux * 0.7, ey + ny * 2.6 - uy * 0.7);
          c.stroke();
        }
        if (p >= 0.68 && p < 0.92) bits(ex + nx * 2.6, ey + ny * 2.6, (p - 0.68) / 0.24, act === 'chop' ? '#d8b078' : '#a8a49c');
        break;
      }
      case 'shovel': {
        // Spade down into the bank, lift, and a clod tossed onto the heap.
        const p = (t * 0.28) % 1;
        const u = p < 0.35 ? p / 0.35 : p < 0.7 ? 1 - (p - 0.35) / 0.35 : 0;
        const tipX = wx + (4.5 + (p < 0.35 ? 0 : 1)) * f;
        const tipY = wy - 0.5 - (p < 0.35 ? 0 : (1 - u) * 5);
        const topX = sx + (1.5 + u * 1.8) * f;
        const topY = sy - 1 + u * 3;
        line(topX, topY, tipX, tipY, HANDLE, 1.2);
        armTo(topX, topY);
        const mx = (topX * 2 + tipX) / 3;
        const my = (topY * 2 + tipY) / 3;
        line(sx - 0.5 * f, sy + 0.5, mx, my, arm, 1.3);
        hand(mx, my);
        c.fillStyle = IRON;
        c.beginPath();
        c.ellipse(tipX, tipY, 1.4, 2, Math.atan2(tipY - topY, tipX - topX) + Math.PI / 2, 0, Math.PI * 2);
        c.fill();
        if (p >= 0.35 && p < 0.7) {
          c.fillStyle = '#7a5838';
          c.beginPath();
          c.arc(tipX, tipY - 1.2, 1.3, 0, Math.PI * 2);
          c.fill();
        } else if (p >= 0.7) bits(tipX, tipY - 5, (p - 0.7) / 0.3, '#7a5838', 2, 3);
        break;
      }
      case 'hammer': {
        // Quick short taps on a beam at waist height.
        const p = (t * 0.9) % 1;
        const up = p < 0.6 ? p / 0.6 : 1 - (p - 0.6) / 0.4;
        const ang = 0.5 - up * 1.6;
        const [hx, hy] = at(ang, 4.2);
        armTo(hx, hy);
        const [ex, ey] = at(ang, 8.2);
        line(hx, hy, ex, ey, HANDLE, 1);
        c.fillStyle = '#6a6e72';
        c.save();
        c.translate(ex, ey);
        c.rotate(ang * f + (f < 0 ? Math.PI : 0));
        c.fillRect(-0.6, -1.6, 1.8, 3.2);
        c.restore();
        // The beam being nailed, on two trestles.
        c.fillStyle = '#b48a58';
        c.fillRect(wx + 3.2 * f - (f < 0 ? 6 : 0), wy - 5, 6, 1.3);
        line(wx + 4 * f, wy - 3.8, wx + 4 * f, wy, '#7a5434', 0.8);
        line(wx + 8 * f, wy - 3.8, wx + 8 * f, wy, '#7a5434', 0.8);
        if (p > 0.95 || p < 0.06) bits(ex, ey + 1, ((p + 0.05) % 1) * 4, '#f2e2a0', 2, 1.5);
        break;
      }
      case 'saw': {
        // A plank on a sawhorse, the saw run back and forth, sawdust falling.
        const off = Math.sin(t * 1.5) * 2.2;
        const px = wx + 5 * f;
        line(px - 2, wy, px + 1.5, wy - 4.5, '#6a4a2a', 0.9);
        line(px + 2, wy, px - 1.5, wy - 4.5, '#6a4a2a', 0.9);
        c.fillStyle = '#c8a46c';
        c.fillRect(px - 6, wy - 5.6, 12, 1.4);
        const hx = wx + (2.6 + off * 0.5) * f;
        const hy = wy - 7.2;
        armTo(hx, hy);
        c.fillStyle = '#b8bec4';
        c.beginPath();
        c.moveTo(hx, hy - 0.6);
        c.lineTo(hx + 6 * f, wy - 5.2);
        c.lineTo(hx + 6 * f, wy - 4.4);
        c.lineTo(hx, hy + 1);
        c.closePath();
        c.fill();
        line(hx - 0.8 * f, hy - 0.8, hx + 0.6 * f, hy + 1.2, HANDLE, 1.6);
        c.fillStyle = '#f2e2b0';
        for (let k = 0; k < 3; k++) {
          const q = (this.time * 1.4 + k / 3) % 1;
          c.fillRect(px - 0.5 + (k - 1) * 0.6, wy - 4 + q * 4, 0.8, 0.8);
        }
        break;
      }
      case 'scythe': {
        // A long low sweep through the crop, then the blade carried back.
        const p = (t * 0.26) % 1;
        const sweep = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
        const k = sweep * sweep * (3 - 2 * sweep);
        const bx = wx + (-5 + k * 11) * f;
        const by = wy - 0.8 - (p >= 0.4 ? 1.5 : 0);
        const tx = sx + (-0.5 + k * 3) * f;
        const ty = sy + 1;
        line(tx, ty, bx, by, HANDLE, 1.1);
        armTo(tx, ty);
        const mx = (tx + bx) / 2;
        const my = (ty + by) / 2;
        line(sx, sy + 0.6, mx, my, arm, 1.3);
        hand(mx, my);
        c.strokeStyle = '#c8ccd0';
        c.lineWidth = 1.1;
        c.beginPath();
        c.moveTo(bx, by);
        c.quadraticCurveTo(bx + 3.5 * f, by + 1.6, bx + 7 * f, by + 0.4);
        c.stroke();
        if (p > 0.3 && p < 0.55) bits(bx + 4 * f, by - 1, (p - 0.3) / 0.25, '#c8b050', 3, 2);
        break;
      }
      case 'hoe': {
        // Raised to the shoulder and chopped down into the soil, then drawn back.
        const p = (t * 0.32) % 1;
        const ang = p < 0.5 ? 1 - (p / 0.5) * 2.6 : p < 0.62 ? -1.6 + ((p - 0.5) / 0.12) * 2.75 : 1.15 - ((p - 0.62) / 0.38) * 0.15;
        const [hx, hy] = at(ang, 3.4);
        const [bx, by] = at(ang, 1.4);
        const [ex, ey] = at(ang, 10.5);
        line(sx - 0.5 * f, sy + 0.4, bx, by, arm, 1.3);
        armTo(hx, hy);
        hand(bx, by);
        line(bx, by, ex, ey, HANDLE, 1.1);
        // The blade, square to the haft and turned toward the hoer.
        const nx = -Math.sin(ang) * f;
        const ny = Math.cos(ang);
        line(ex, ey, ex - Math.cos(ang) * f * 0.4 + nx * 2.4, ey - Math.sin(ang) * 0.4 + ny * 2.4, '#7c8288', 1.8);
        if (p >= 0.62 && p < 0.85) bits(ex, ey, (p - 0.62) / 0.23, '#6e5034', 3, 1.8);
        break;
      }
      case 'pick': {
        // Crouched by the bush: a hand from the branches to the basket on the arm.
        const p = (t * 0.35) % 1;
        const u = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
        const hx = wx + (1.5 + u * 3.5) * f;
        const hy = sy + 2.5 + u * 3;
        armTo(hx, hy);
        if (u > 0.1 && p >= 0.5) {
          c.fillStyle = '#a8324a';
          c.beginPath();
          c.arc(hx, hy - 0.4, 0.7, 0, Math.PI * 2);
          c.fill();
        }
        this.drawBasket(wx - 2.2 * f, wy - 4.5 - bob, '#a8324a');
        break;
      }
      case 'reach': {
        // Reaching up into the branches; the basket waits at the foot of the tree.
        const p = (t * 0.3) % 1;
        const up = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
        const hx = sx + (1.2 + Math.sin(t * 0.9) * 0.6) * f;
        const hy = sy - 1 - up * 6.5;
        armTo(hx, hy);
        line(sx - 0.4 * f, sy + 0.3, sx + 0.6 * f, sy - 1 - up * 6, arm, 1.3);
        hand(sx + 0.6 * f, sy - 1 - up * 6);
        if (up < 0.9) {
          c.fillStyle = '#c8402c';
          c.beginPath();
          c.arc(hx, hy + 0.6, 0.9, 0, Math.PI * 2);
          c.fill();
        }
        this.drawBasket(wx + 4 * f, wy - 1.2, '#c8402c');
        break;
      }
      case 'plant': {
        // Kneeling: a sapling lowered into the hole, then the soil firmed round it.
        const p = (t * 0.25) % 1;
        const gx = wx + 4.2 * f;
        c.fillStyle = '#6e5034';
        c.beginPath();
        c.ellipse(gx, wy - 0.2, 2.2, 0.8, 0, 0, Math.PI * 2);
        c.fill();
        const planted = p >= 0.45;
        const sapX = planted ? gx : wx + (2.6 + p * 3.5) * f;
        const sapY = planted ? wy - 0.6 : sy + 2 + p * 9;
        line(sapX, sapY, sapX, sapY - 4, '#6a4a2a', 0.7);
        c.fillStyle = '#4f8a3c';
        c.beginPath();
        c.arc(sapX - 0.8, sapY - 4, 1.1, 0, Math.PI * 2);
        c.arc(sapX + 0.8, sapY - 4.4, 1.1, 0, Math.PI * 2);
        c.arc(sapX, sapY - 5.2, 1.1, 0, Math.PI * 2);
        c.fill();
        if (planted) {
          const pat = Math.abs(Math.sin(t * 2.4)) * 1.6;
          armTo(gx + 1.6 * f, wy - 1 - pat);
        } else armTo(sapX, sapY - 1.5);
        break;
      }
      case 'hunt': {
        // The bow raised and drawn, held, loosed: the arrow flies off.
        const p = (t * 0.22) % 1;
        const draw = p < 0.55 ? (p / 0.55) * 3.6 : p < 0.72 ? 3.6 : 0;
        const bx = wx + 5 * f;
        const by = sy + 0.6;
        armTo(bx - 0.3 * f, by);
        c.strokeStyle = '#6a4a2a';
        c.lineWidth = 1.1;
        c.beginPath();
        c.moveTo(bx - 0.6 * f, by - 5.2);
        c.quadraticCurveTo(bx + 2.6 * f, by, bx - 0.6 * f, by + 5.2);
        c.stroke();
        const nx = bx - (0.6 + draw) * f;
        line(bx - 0.6 * f, by - 5.2, nx, by, 'rgba(240,235,220,0.9)', 0.4);
        line(nx, by, bx - 0.6 * f, by + 5.2, 'rgba(240,235,220,0.9)', 0.4);
        line(sx - 0.4 * f, sy + 0.4, nx, by, arm, 1.3);
        hand(nx, by);
        if (p < 0.72) line(nx, by, bx + 2.4 * f, by, '#8a6a44', 0.6);
        else {
          const q = (p - 0.72) / 0.28;
          c.globalAlpha *= 1 - q;
          line(bx + (2 + q * 40) * f, by - q * 3, bx + (6 + q * 40) * f, by - q * 3, '#8a6a44', 0.6);
          c.globalAlpha = a.fadeIn;
        }
        break;
      }
      case 'herd': {
        // Leaning on a shepherd's crook; now and then an arm waved at a stray.
        const cx = wx + 3.4 * f;
        line(cx, wy + 0.2, cx, wy - 16, HANDLE, 1);
        c.strokeStyle = HANDLE;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(cx + 1.3 * f, wy - 16, 1.3, Math.PI, f > 0 ? Math.PI * 2 : 0, f < 0);
        c.stroke();
        armTo(cx, wy - 9.5 - bob * 0.5);
        if (Math.sin(t * 0.25) > 0.75) {
          const w = Math.sin(t * 2) * 0.8;
          line(sx - 1.4 * f, sy, sx - (2.6 + w) * f, sy - 5, arm, 1.3);
          hand(sx - (2.6 + w) * f, sy - 5);
        }
        break;
      }
      case 'chisel': {
        // A block of stone at the feet: chisel held to it, the mallet tapping.
        const bx = wx + 4.6 * f;
        c.fillStyle = '#b8b4aa';
        c.fillRect(bx - 2.6, wy - 4.4, 5.2, 4.4);
        c.fillStyle = '#d0ccc2';
        c.fillRect(bx - 2.6, wy - 4.4, 5.2, 1);
        c.fillStyle = 'rgba(0,0,0,0.15)';
        c.fillRect(bx + (f > 0 ? 1.6 : -2.6), wy - 3.4, 1, 3.4);
        const cx = bx - 2.2 * f;
        line(sx - 0.6 * f, sy + 0.6, cx, wy - 5.4, arm, 1.3);
        hand(cx, wy - 5.4);
        line(cx, wy - 5.4, cx + 0.6 * f, wy - 3.8, IRON, 0.8);
        const p = (t * 0.8) % 1;
        const up = p < 0.7 ? p / 0.7 : 1 - (p - 0.7) / 0.3;
        const mx = cx - (0.4 + up * 0.8) * f;
        const my = wy - 7.2 - up * 4.5;
        armTo(mx, my);
        c.fillStyle = '#8a6440';
        c.fillRect(mx - 1.2, my - 1.6, 2.4, 2);
        if (p > 0.92 || p < 0.1) bits(cx + 0.8 * f, wy - 4, ((p + 0.08) % 1) * 4, '#e0dcd2', 3, 1.4);
        break;
      }
      case 'scrape': {
        // A hide stretched on a frame, scraped clean with a two-handled knife.
        const fx = wx + 5 * f;
        line(fx - 3, wy, fx - 3, wy - 13, '#6a4a2a', 0.9);
        line(fx + 3, wy, fx + 3, wy - 13, '#6a4a2a', 0.9);
        line(fx - 3.4, wy - 12.4, fx + 3.4, wy - 12.4, '#6a4a2a', 0.9);
        c.fillStyle = '#c89a6a';
        c.beginPath();
        c.moveTo(fx - 2.4, wy - 12);
        c.lineTo(fx + 2.4, wy - 12);
        c.quadraticCurveTo(fx + 2.8, wy - 6, fx + 2, wy - 2.4);
        c.lineTo(fx - 2, wy - 2.4);
        c.quadraticCurveTo(fx - 2.8, wy - 6, fx - 2.4, wy - 12);
        c.fill();
        const k = (Math.sin(t * 1.2) + 1) / 2;
        const ky = wy - 10.5 + k * 6.5;
        armTo(fx - 1.8 * f, ky);
        line(sx - 0.5 * f, sy + 0.4, fx + 1.2 * f, ky, arm, 1.3);
        hand(fx + 1.2 * f, ky);
        line(fx - 2.4 * f, ky, fx + 1.8 * f, ky, IRON, 0.9);
        break;
      }
      case 'stir':
      case 'mix': {
        // A tub at the feet, a long paddle worked round and round in it: woad in the vat, or lime and sand for mortar.
        const tx = wx + 6.2 * f;
        const ty = wy - 0.6;
        c.fillStyle = '#7a5230';
        c.beginPath();
        c.moveTo(tx - 4, ty - 4.6);
        c.lineTo(tx - 3.4, ty);
        c.ellipse(tx, ty, 3.4, 1.4, 0, Math.PI, 0, true);
        c.lineTo(tx + 4, ty - 4.6);
        c.closePath();
        c.fill();
        c.fillStyle = act === 'stir' ? '#2f4fa8' : '#e8e4d8';
        c.beginPath();
        c.ellipse(tx, ty - 4.6, 4, 1.6, 0, 0, Math.PI * 2);
        c.fill();
        const ang = t * 1.4;
        const px = tx + Math.cos(ang) * 2.2;
        const py = ty - 4.6 + Math.sin(ang) * 0.8;
        const gx = px - 2.4 * f;
        const gy = py - 9;
        line(px, py, gx - 0.8 * f, gy - 1.5, HANDLE, 1);
        armTo(gx, gy);
        line(sx - 0.5 * f, sy + 0.4, (gx + px) / 2, (gy + py) / 2, arm, 1.3);
        hand((gx + px) / 2, (gy + py) / 2);
        break;
      }
      default: {
        // Any other work: busy hands at the bench.
        armTo(wx + 3.5 * f, sy + 2 + Math.sin(t) * 0.8);
      }
    }
    c.lineCap = 'butt';
  }

  /** A wicker basket with a handle, heaped with what is being picked. */
  private drawBasket(x: number, y: number, fruit: string): void {
    const c = this.ctx;
    c.fillStyle = '#a0784a';
    c.beginPath();
    c.moveTo(x - 2.2, y - 1.6);
    c.lineTo(x + 2.2, y - 1.6);
    c.lineTo(x + 1.6, y + 1.2);
    c.lineTo(x - 1.6, y + 1.2);
    c.closePath();
    c.fill();
    c.strokeStyle = '#7a5434';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(x - 2, y - 0.3);
    c.lineTo(x + 2, y - 0.3);
    c.stroke();
    c.beginPath();
    c.arc(x, y - 1.6, 1.8, Math.PI, 0);
    c.stroke();
    c.fillStyle = fruit;
    for (const dx of [-1, 0, 1]) {
      c.beginPath();
      c.arc(x + dx * 0.9, y - 1.9, 0.65, 0, Math.PI * 2);
      c.fill();
    }
  }

  /**
   * A rod held out over the water, the line sagging to a float that bobs
   * where it was cast, with rings spreading now and then. Drawn inside the
   * villager's scaled frame, so the float's point is scaled back to match.
   */
  private drawFishing(a: Agent, wx: number, wy: number, at: [number, number]): void {
    const c = this.ctx;
    const fx = wx + (at[0] - wx) / FOLK_SCALE;
    const fy = wy + (at[1] - wy) / FOLK_SCALE + Math.sin(this.time * 2.6 + a.step) * 0.5;
    const hx = wx + a.dir * 2;
    const hy = wy - 8;
    const tx = hx + a.dir * 8;
    const ty = hy - 7 + Math.sin(this.time * 1.3 + a.step) * 0.6;
    c.strokeStyle = '#6b4a2e';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(tx, ty);
    c.stroke();
    c.strokeStyle = 'rgba(240,240,240,0.75)';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo((tx + fx) / 2, Math.max(ty, fy) + 2, fx, fy);
    c.stroke();
    // Rings on the water now and then.
    const ring = (this.time * 0.7 + a.step) % 2.5;
    if (ring < 1.2) {
      c.strokeStyle = `rgba(235,245,250,${0.5 * (1 - ring / 1.2)})`;
      c.lineWidth = 0.6;
      c.beginPath();
      c.ellipse(fx, fy + 0.6, 1.5 + ring * 3.5, 0.7 + ring * 1.6, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = '#c8402c';
    c.beginPath();
    c.arc(fx, fy - 0.3, 0.9, Math.PI, 0);
    c.fill();
    c.fillStyle = '#f2ece0';
    c.beginPath();
    c.arc(fx, fy - 0.3, 0.9, 0, Math.PI);
    c.fill();
  }

  /** Arms and props for a villager at leisure. */
  private drawLeisure(a: Agent, act: string, wx: number, wy: number, bob: number, h: number): void {
    const c = this.ctx;
    const sy = wy - 9.5 - bob;
    c.strokeStyle = a.tunic;
    c.lineWidth = 1.2;
    c.lineCap = 'round';
    if (act === 'dance') {
      // Both arms up, waving with the music.
      const w = Math.sin(this.time * 9 + h) * 1.2;
      c.beginPath();
      c.moveTo(wx - 2, sy);
      c.lineTo(wx - 4 + w, sy - 5);
      c.moveTo(wx + 2, sy);
      c.lineTo(wx + 4 + w, sy - 5);
      c.stroke();
    } else if (act === 'pray') {
      // Hands together before the chest.
      c.fillStyle = '#e8c4a0';
      c.beginPath();
      c.arc(wx + 2.4 * a.dir, sy - 0.5, 1, 0, Math.PI * 2);
      c.fill();
    } else if (act === 'toast') {
      // A mug, now and then raised high.
      const up = Math.sin(this.time * 1.3 + h) > 0.5;
      const mx = wx + 3.6 * a.dir;
      const my = up ? sy - 6 : sy + 1.5;
      c.beginPath();
      c.moveTo(wx + 2 * a.dir, sy);
      c.lineTo(mx, my + 1);
      c.stroke();
      c.fillStyle = '#8a5a2e';
      c.fillRect(mx - 1.2, my - 1.2, 2.4, 3);
      c.fillStyle = '#f4ecd8';
      c.fillRect(mx - 1.3, my - 1.8, 2.6, 0.9);
    } else if (act === 'chat') {
      // A hand that talks, and now and then a word balloon.
      const g = Math.sin(this.time * 3 + h);
      c.beginPath();
      c.moveTo(wx + 2 * a.dir, sy);
      c.lineTo(wx + (4 + g) * a.dir, sy - 2 - g * 1.5);
      c.stroke();
      if (Math.sin(this.time * 0.8 + h * 0.7) > 0.55) {
        const bx = wx + 5 * a.dir;
        const by = wy - 21 - bob;
        c.fillStyle = 'rgba(255,252,240,0.92)';
        c.beginPath();
        c.ellipse(bx, by, 4.5, 2.8, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(bx - 1.6 * a.dir, by + 2);
        c.lineTo(bx - 3.4 * a.dir, by + 4.4);
        c.lineTo(bx - 0.2 * a.dir, by + 2.4);
        c.fill();
        c.fillStyle = '#5a4630';
        for (let k = -1; k <= 1; k++) c.fillRect(bx + k * 1.6 - 0.4, by - 0.4, 0.8, 0.8);
      }
    }
    c.lineCap = 'butt';
  }

  /**
   * A draught animal: at work it pulls a two-wheeled cart, loaded with what
   * it carries, its carter walking at its head; at rest it stands by the
   * stable, the ox with its head down to graze.
   */
  private drawBeast(a: Agent, animal: 'horse' | 'ox'): void {
    const c = this.ctx;
    const [wx, wy] = iso(a.x + a.ox * 0.25, a.y + a.oy * 0.25);
    const f = a.dir;
    const walking = a.phase === 'walk';
    const resting = a.act === 'graze' && !a.carry;
    c.globalAlpha = a.fadeIn;
    if (a.key === this.selectedAgent) {
      c.strokeStyle = '#e8c048';
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(wx, wy, 12, 4, 0, 0, Math.PI * 2);
      c.stroke();
    }
    const working = !resting && (walking || !!a.carry);
    if (working) {
      // The cart behind: shafts to the animal, a wheel, the load.
      const cx = wx - 13 * f;
      c.fillStyle = 'rgba(20,20,10,0.25)';
      c.beginPath();
      c.ellipse(cx, wy, 7, 2.2, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#5e4129';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx + 4 * f, wy - 6);
      c.lineTo(wx - 3 * f, wy - 7.5);
      c.stroke();
      c.fillStyle = '#8a6236';
      c.fillRect(cx - 6, wy - 8, 12, 3);
      c.fillStyle = '#6e4e2c';
      c.fillRect(cx - 6, wy - 11, 1.2, 3);
      c.fillRect(cx + 4.8, wy - 11, 1.2, 3);
      this.drawLoad(cx, wy - 8, a.carry);
      c.strokeStyle = '#3e2c1e';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(cx - 0.5 * f, wy - 3.2, 3.2, 0, Math.PI * 2);
      c.moveTo(cx - 0.5 * f - 3.2, wy - 3.2);
      c.lineTo(cx - 0.5 * f + 3.2, wy - 3.2);
      c.moveTo(cx - 0.5 * f, wy - 6.4);
      c.lineTo(cx - 0.5 * f, wy);
      c.stroke();
    }
    if (animal === 'horse') drawHorse(c, wx, wy, f, { coat: '#6b4a30', step: a.step, walking });
    else drawOx(c, wx, wy, f, { step: a.step, walking, grazing: resting && Math.sin(this.time * 0.7 + hashKey(a.key)) > -0.3 });
    if (working) {
      // The carter at the animal's head, a switch in hand.
      // He walks alongside, on the near side, a little ahead of the shoulder.
      const px = wx + 3 * f;
      const py = wy + 4.5;
      const leg = walking ? Math.sin(a.step) * 1.8 : 0;
      const bob = walking ? Math.abs(Math.sin(a.step)) * 1 : 0;
      c.fillStyle = 'rgba(20,20,10,0.28)';
      c.beginPath();
      c.ellipse(px, py, 3.2, 1.4, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#3a2c20';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(px - 0.8, py - 4 - bob);
      c.lineTo(px - 0.8 + leg, py);
      c.moveTo(px + 0.8, py - 4 - bob);
      c.lineTo(px + 0.8 - leg, py);
      c.stroke();
      c.fillStyle = a.tunic;
      c.fillRect(px - 2.2, py - 9.5 - bob, 4.4, 5.8);
      c.fillStyle = '#e8c4a0';
      c.beginPath();
      c.arc(px, py - 11.6 - bob, 2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5a4630';
      c.beginPath();
      c.ellipse(px, py - 12.8 - bob, 2.8, 0.9, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#7a5a3a';
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(px + 1.8 * f, py - 7 - bob);
      c.lineTo(px + 5 * f, py - 14 - bob);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  /** What a cart carries, heaped on its bed: crates, logs, stone or sacks. */
  private drawLoad(x: number, y: number, carry: ResourceId | null): void {
    const c = this.ctx;
    if (!carry) return;
    if (carry === 'wood' || carry === 'planks' || carry === 'woodparts') {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = carry === 'planks' ? (k % 2 ? '#d7b47c' : '#c8a46c') : '#7a5230';
        c.fillRect(x - 5.5 + (k % 2) * 1.5, y - 2 - k * 1.8, 10, 1.7);
        if (carry === 'wood') {
          c.fillStyle = '#c8a06a';
          c.beginPath();
          c.arc(x + 4.5 + (k % 2) * 1.5, y - 1.2 - k * 1.8, 0.9, 0, Math.PI * 2);
          c.fill();
        }
      }
      return;
    }
    if (carry === 'stone' || carry === 'dressedstone' || carry === 'tiles' || carry === 'clay') {
      const col = carry === 'tiles' ? '#b05a3a' : carry === 'clay' ? '#a8784a' : '#a7a59e';
      for (const [dx, dy, w] of [[-4.5, 0, 4], [0, 0, 4], [-2.5, -2.6, 4]] as const) {
        c.fillStyle = col;
        c.fillRect(x + dx, y + dy - 2.6, w, 2.6);
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.fillRect(x + dx, y + dy - 0.6, w, 0.6);
      }
      return;
    }
    // Crates for the trading post, sacks for anything else.
    if (carry === 'crates') {
      for (const [dx, dy] of [[-5, 0], [-0.5, 0], [-2.8, -3.6]] as const) {
        c.fillStyle = '#a07a48';
        c.fillRect(x + dx, y + dy - 3.6, 4, 3.6);
        c.strokeStyle = '#6e5030';
        c.lineWidth = 0.5;
        c.strokeRect(x + dx, y + dy - 3.6, 4, 3.6);
      }
      return;
    }
    c.fillStyle = '#d8c79c';
    c.beginPath();
    c.ellipse(x - 2.5, y - 2, 2.6, 2.2, 0, 0, Math.PI * 2);
    c.ellipse(x + 2.2, y - 2, 2.6, 2.2, 0, 0, Math.PI * 2);
    c.fill();
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

  /** A brown bear: a heavy lumbering body with a hump at the shoulders, or reared up on its hind legs. */
  private drawBear(a: Animal): void {
    const c = this.ctx;
    const [wx, wy] = iso(a.x, a.y);
    const f = a.dir;
    const walk = a.grazing ? 0 : Math.sin(a.step);
    const fur = '#5e4026';
    const dark = '#3e2a18';
    c.globalAlpha = a.alpha;
    c.fillStyle = 'rgba(20,20,10,0.28)';
    c.beginPath();
    c.ellipse(wx, wy, 9, 3, 0, 0, Math.PI * 2);
    c.fill();
    if (a.rear !== undefined) {
      // Up on its hind legs, forepaws hanging, nose to the wind.
      const lift = Math.min(1, (2.2 - a.rear) * 3, a.rear * 3);
      const top = wy - 10 - 9 * lift;
      c.fillStyle = dark;
      c.fillRect(wx - 3.2, wy - 5, 2.4, 5);
      c.fillRect(wx + 0.8, wy - 5, 2.4, 5);
      c.fillStyle = fur;
      c.beginPath();
      c.ellipse(wx, (wy - 5 + top) / 2, 4.6, (wy - 5 - top) / 2 + 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#7a5634';
      c.beginPath();
      c.ellipse(wx + 0.6 * f, (wy - 5 + top) / 2 + 1, 2.6, (wy - 5 - top) / 3, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = dark;
      c.lineWidth = 1.8;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(wx + 2.5 * f, top + 3);
      c.lineTo(wx + 5 * f, top + 6.5);
      c.moveTo(wx - 1 * f, top + 3.5);
      c.lineTo(wx + 2 * f, top + 7);
      c.stroke();
      c.lineCap = 'butt';
      this.bearHead(wx + 1 * f, top - 1.5, f);
      c.globalAlpha = 1;
      return;
    }
    // Four heavy legs, moving in pairs.
    c.strokeStyle = dark;
    c.lineWidth = 2.2;
    c.beginPath();
    for (const [lx, ph] of [[-5, 1], [-3, -1], [3, -1], [5, 1]] as const) {
      c.moveTo(wx + lx * f, wy - 5);
      c.lineTo(wx + lx * f + walk * ph * 1.4, wy);
    }
    c.stroke();
    // Body, with the hump over the shoulders.
    c.fillStyle = fur;
    c.beginPath();
    c.ellipse(wx - 0.5 * f, wy - 7.5, 7.5, 4.2, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(wx + 3 * f, wy - 10, 3.6, 2.6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,220,170,0.12)';
    c.beginPath();
    c.ellipse(wx, wy - 9.5, 5.5, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    // Head held low, swinging as it walks.
    this.bearHead(wx + 7.5 * f, wy - 7 + (a.grazing ? 1.5 : walk * 0.5), f);
    c.globalAlpha = 1;
  }

  private bearHead(x: number, y: number, f: number): void {
    const c = this.ctx;
    c.fillStyle = '#5e4026';
    c.beginPath();
    c.arc(x, y, 2.8, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x - 1.6 * f, y - 2.4, 1.1, 0, Math.PI * 2);
    c.arc(x + 0.8 * f, y - 2.7, 1.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#a07a52';
    c.beginPath();
    c.ellipse(x + 2.4 * f, y + 0.6, 1.7, 1.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1e140c';
    c.beginPath();
    c.arc(x + 3.6 * f, y + 0.3, 0.6, 0, Math.PI * 2);
    c.arc(x + 0.9 * f, y - 0.8, 0.45, 0, Math.PI * 2);
    c.fill();
  }

  /** A pond turtle: a little domed shell basking on the shore, or sliding into the water. */
  private drawTurtle(a: Animal): void {
    const c = this.ctx;
    const [wx, wy] = iso(a.x, a.y);
    const f = a.dir;
    const paddle = a.grazing ? 0 : Math.sin(a.step * 2) * 0.5;
    c.globalAlpha = a.alpha;
    c.save();
    c.translate(wx, wy);
    c.scale(1.45, 1.45);
    c.translate(-wx, -wy);
    if (!a.swim) {
      c.fillStyle = 'rgba(20,20,10,0.25)';
      c.beginPath();
      c.ellipse(wx, wy + 0.2, 3, 1, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Head and legs peeking out of the shell.
    c.fillStyle = '#6e7a3e';
    c.beginPath();
    c.ellipse(wx + 2.9 * f, wy - 1.3, 1.1, 0.8, 0, 0, Math.PI * 2);
    c.fill();
    for (const [lx, ph] of [[-1.8, 1], [1.6, -1]] as const) {
      c.beginPath();
      c.ellipse(wx + lx + paddle * ph, wy - 0.2, 0.8, 0.5, 0, 0, Math.PI * 2);
      c.fill();
    }
    // The shell: dark, with paler plates and a rim.
    c.fillStyle = '#4a4a2a';
    c.beginPath();
    c.ellipse(wx, wy - 1.2, 2.7, 1.5, 0, Math.PI, 0);
    c.ellipse(wx, wy - 1.2, 2.7, 0.6, 0, 0, Math.PI);
    c.fill();
    c.fillStyle = '#7a7440';
    for (const px of [-1.1, 0.2, 1.4]) {
      c.beginPath();
      c.ellipse(wx + px, wy - 1.9, 0.55, 0.4, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#e8d070';
    c.beginPath();
    c.arc(wx + 3.3 * f, wy - 1.5, 0.25, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.globalAlpha = 1;
  }

  private drawAnimal(a: Animal, season: Season): void {
    if (a.kind === 'rabbit') {
      this.drawRabbit(a, season);
      return;
    }
    if (a.kind === 'bear') {
      this.drawBear(a);
      return;
    }
    if (a.kind === 'turtle') {
      this.drawTurtle(a);
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
  // Frisians black and white; Highlanders shaggy and russet, with long horns.
  const highland = kind === 'highland';
  const frisian = kind === 'frisian';
  const coat = pig ? '#e8a8a0' : highland ? ['#b0602a', '#c8783a', '#9a5024'][j % 3] : frisian ? '#f4f0e6' : ['#8a5a3a', '#f2ece0', '#3a3028', '#b0703a'][j % 4];
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
  if (frisian || (!pig && !highland && j % 4 === 1)) {
    c.fillStyle = '#2a2420';
    c.beginPath();
    c.ellipse(x - 1.5 * f, y - tall - 2.6, 1.8, 1.3, 0, 0, Math.PI * 2);
    c.fill();
    if (frisian) {
      c.beginPath();
      c.ellipse(x + 2.4 * f, y - tall - 1.6, 1.5, 1.2, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (highland) {
    // A shaggy fringe of coat along the belly.
    c.strokeStyle = '#8a4420';
    c.lineWidth = 0.8;
    c.beginPath();
    for (let i = -4; i <= 4; i += 2) {
      c.moveTo(x + i, y - tall - 0.4);
      c.lineTo(x + i + 0.4, y - tall + 0.9);
    }
    c.stroke();
  }
  // Head, lowered to graze.
  c.fillStyle = coat;
  c.beginPath();
  c.ellipse(x + (len + 1) * f, y - tall - (pig ? 1.4 : 0.6), pig ? 2 : 2.3, pig ? 1.8 : 2, 0, 0, Math.PI * 2);
  c.fill();
  if (pig) {
    c.fillStyle = '#d88a84';
    c.fillRect(x + (len + 2.4) * f - 0.8, y - tall - 1.8, 1.6, 1.4);
  } else if (highland) {
    c.strokeStyle = '#efe4c8';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(x + (len + 1) * f, y - tall - 1.8);
    c.quadraticCurveTo(x + (len - 1.5) * f, y - tall - 2.6, x + (len - 2.2) * f, y - tall - 4.6);
    c.moveTo(x + (len + 1) * f, y - tall - 1.8);
    c.quadraticCurveTo(x + (len + 3.5) * f, y - tall - 2.6, x + (len + 4) * f, y - tall - 4.4);
    c.stroke();
  } else {
    c.strokeStyle = '#e8dcc4';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(x + (len + 0.5) * f, y - tall - 2.2);
    c.lineTo(x + (len - 0.6) * f, y - tall - 3.8);
    c.stroke();
  }
}

/** A fallow deer: dappled back, white rump, a stag with antlers. */
function drawDeer(c: CanvasRenderingContext2D, x: number, y: number, f: number, stag: boolean): void {
  const len = 4.6;
  const tall = 4.6;
  c.fillStyle = 'rgba(20,20,10,0.22)';
  c.beginPath();
  c.ellipse(x, y, len + 0.8, 1.5, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#5a3a20';
  c.lineWidth = 0.9;
  c.beginPath();
  for (const lx of [-len * 0.6, len * 0.55]) {
    c.moveTo(x + lx, y - tall);
    c.lineTo(x + lx, y);
  }
  c.stroke();
  c.fillStyle = '#a8683a';
  c.beginPath();
  c.ellipse(x, y - tall - 1.8, len, 2.3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f2ead8';
  c.beginPath();
  c.ellipse(x - len * 0.85 * f, y - tall - 1.6, 1.1, 1.4, 0, 0, Math.PI * 2);
  c.fill();
  for (const dx of [-1.6, 0, 1.6]) c.fillRect(x + dx, y - tall - 2.8, 0.7, 0.7);
  const hx = x + (len + 0.4) * f;
  const hy = y - tall - 4.4;
  c.fillStyle = '#a8683a';
  c.beginPath();
  c.moveTo(x + (len - 1.4) * f, y - tall - 2.4);
  c.lineTo(hx, hy + 0.8);
  c.lineTo(hx - 0.6 * f, hy + 2.2);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(hx + 0.6 * f, hy + 0.4, 1.5, 1, 0.3 * f, 0, Math.PI * 2);
  c.fill();
  if (stag) {
    c.strokeStyle = '#d8c4a0';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(hx, hy - 0.4);
    c.lineTo(hx - 1 * f, hy - 3.4);
    c.lineTo(hx - 2.4 * f, hy - 4);
    c.moveTo(hx - 0.6 * f, hy - 2.2);
    c.lineTo(hx + 0.6 * f, hy - 3.6);
    c.stroke();
  }
}

/** A goat: small and wiry, with swept-back horns and a beard, head up and browsing. */
function drawGoat(c: CanvasRenderingContext2D, x: number, y: number, f: number, j: number): void {
  const coat = ['#e8e2d6', '#9a8a78', '#5a4a3c', '#c8b49a'][j % 4];
  const len = 3.6;
  const tall = 3.2;
  c.fillStyle = 'rgba(20,20,10,0.22)';
  c.beginPath();
  c.ellipse(x, y, len + 0.8, 1.4, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#3a3028';
  c.lineWidth = 1;
  c.beginPath();
  for (const lx of [-len * 0.6, len * 0.55]) {
    c.moveTo(x + lx, y - tall);
    c.lineTo(x + lx, y);
  }
  c.stroke();
  c.fillStyle = coat;
  c.beginPath();
  c.ellipse(x, y - tall - 1.6, len, 2.2, 0, 0, Math.PI * 2);
  c.fill();
  // Neck and head held high.
  const hx = x + (len + 0.6) * f;
  const hy = y - tall - 4.2;
  c.beginPath();
  c.moveTo(x + (len - 1.2) * f, y - tall - 2.6);
  c.lineTo(hx, hy + 0.6);
  c.lineTo(hx - 0.4 * f, hy + 2);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(hx + 0.6 * f, hy + 0.4, 1.6, 1.1, 0.3 * f, 0, Math.PI * 2);
  c.fill();
  // Beard and horns.
  c.strokeStyle = '#5a4a3c';
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(hx + 1.4 * f, hy + 1.2);
  c.lineTo(hx + 1.2 * f, hy + 2.6);
  c.stroke();
  c.strokeStyle = '#d8ccb0';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(hx, hy - 0.4);
  c.quadraticCurveTo(hx - 0.6 * f, hy - 2.4, hx - 2 * f, hy - 2);
  c.stroke();
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
    case 'herbs':
      p.sack(x - 0.08, y, id === 'flour' ? '#efe6d4' : '#d8c890');
      p.sack(x + 0.08, y + 0.05, id === 'flour' ? '#e8dcc4' : '#cdbb8e');
      break;
    case 'sand':
      p.ellipse(x, y, 10, 5, 1.5, '#c8a868');
      p.ellipse(x - 0.02, y - 0.02, 7.5, 3.6, 3.5, '#e2c98a');
      p.ellipse(x - 0.04, y - 0.04, 4, 2, 5, '#eed69a');
      break;
    case 'charcoal':
      p.sack(x - 0.08, y, '#3e3a36');
      p.sack(x + 0.08, y + 0.05, '#34302c');
      break;
    case 'mortar':
      p.sack(x - 0.08, y, '#efece4');
      p.sack(x + 0.08, y + 0.05, '#e4e0d4');
      break;
    case 'glass':
      p.crate(x - 0.1, y - 0.1, 0.2);
      for (let i = 0; i < 3; i++) p.ellipse(x - 0.06 + i * 0.06, y + 0.02, 1.6, 2.4, 9, 'rgba(140,210,190,0.9)');
      break;
    case 'stainedglass': {
      // Finished windows crated upright, their coloured panes showing.
      p.crate(x - 0.12, y - 0.1, 0.22);
      const cols = ['#3a62c4', '#c42b3a', '#d8a838'];
      for (let i = 0; i < 3; i++) p.wallL(y + 0.13, x - 0.1 + i * 0.07, x - 0.04 + i * 0.07, 6, 13, cols[i]);
      break;
    }
    case 'fineclothes':
      for (let i = 0; i < 3; i++) p.box(x - 0.16, y - 0.12, x + 0.16, y + 0.12, i * 2.6, 2.4, i % 2 ? '#24408e' : '#2f4fa8');
      p.line([x - 0.16, y + 0.12, 7.6], [x + 0.16, y + 0.12, 7.6], '#e0b840', 0.8);
      break;
    case 'woad':
    case 'dyes': {
      if (id === 'dyes') {
        p.barrel(x - 0.06, y);
        p.barrel(x + 0.1, y + 0.08);
        p.ellipse(x + 0.1, y + 0.08, 2.6, 1.1, 10.5, '#3a5ac0');
        p.ellipse(x - 0.06, y, 2.6, 1.1, 10.5, '#3a5ac0');
        break;
      }
      const [bx, by] = iso(x, y, 0);
      p.ctx.fillStyle = '#a07a40';
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 3, 5, 4, 0, 0, Math.PI);
      p.ctx.fill();
      p.ctx.fillStyle = '#5f8f86';
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 3.5, 4.8, 2.4, 0, 0, Math.PI * 2);
      p.ctx.fill();
      break;
    }
    case 'cheese':
      p.ellipse(x, y, 7, 3.4, 2.2, '#e8c040');
      p.ellipse(x + 0.05, y + 0.06, 7, 3.4, 4.6, '#f0c850');
      break;
    case 'apples':
    case 'pears':
    case 'plums':
    case 'strawberries':
    case 'vegetables':
    case 'eggs': {
      const fill = { apples: '#c4322a', pears: '#c8c040', plums: '#6a3a80', strawberries: '#d8323a', vegetables: '#5d9a3a', eggs: '#f2e8d4' }[id];
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
  flour: 'sack',
  wool: 'sack',
  herbs: 'sack',
  clay: 'sack',
  ore: 'sack',
  berries: 'basket',
  strawberries: 'basket',
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
  parchment: 'bundle',
  sand: 'sack',
  mortar: 'sack',
  charcoal: 'sack',
  glass: 'crate',
  woad: 'basket',
  dyes: 'cask',
  stainedglass: 'crate',
  fineclothes: 'bundle',
};
const GOOD_COLORS: Partial<Record<ResourceId, string>> = {
  firewood: '#9a6a3a',
  barley: '#e0cc84',
  flour: '#efe6d4',
  wool: '#f2ece0',
  herbs: '#6aa04a',
  clay: '#b0643a',
  ore: '#6a5a50',
  strawberries: '#d8323a',
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
  parchment: '#e8dcc0',
  medicine: '#6aa0a0',
  boots: '#6a3e22',
  sand: '#e2c98a',
  mortar: '#e8e4d8',
  charcoal: '#2c2a28',
  glass: '#9ad4c8',
  woad: '#5f8f86',
  dyes: '#2f4fa8',
  stainedglass: '#c42b3a',
  fineclothes: '#2f4fa8',
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
  // Rye stands blue-green and ripens a dusky grey-gold.
  const green = crop === 'barley' ? '#7aa83e' : crop === 'flax' ? '#5a8a4a' : crop === 'rye' ? '#6a9a78' : '#5e9a34';
  const gold = crop === 'barley' ? '#e0cc84' : crop === 'flax' ? '#b8a060' : crop === 'rye' ? '#b8a478' : '#d8b44a';
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
    if (crop === 'woad') {
      k = woadRow(p, a, z, y, stage, k, rand);
      continue;
    }
    if (crop === 'vegetables') {
      k = vegetableRow(p, a, z, y, stage, k, rand, r);
      continue;
    }
    if (crop === 'beans') {
      k = beanRow(p, a, z, y, stage, k, rand);
      continue;
    }
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
  if (stage === 'stooks' && !winter && crop === 'vegetables') {
    // The crop lifted into baskets along the rows.
    for (let yy = 0.6; yy < b.h - 0.3; yy += 1.2) {
      for (let xx = 0.6; xx < b.w - 0.3; xx += 1.1) {
        const [sx, sy] = iso(xx + ((b.id + Math.floor(yy)) % 2) * 0.3, yy);
        c.fillStyle = 'rgba(30,20,10,0.2)';
        c.beginPath();
        c.ellipse(sx + 1, sy, 5, 2, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#a07a40';
        c.beginPath();
        c.ellipse(sx, sy - 3, 4.5, 3.5, 0, 0, Math.PI);
        c.fill();
        for (const [dx, col] of [[-2, '#7ab04a'], [0.5, '#e8e0c8'], [2.5, '#6aa040']] as [number, string][]) {
          c.fillStyle = col;
          c.beginPath();
          c.arc(sx + dx, sy - 3.6, 1.8, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  } else if (stage === 'stooks' && !winter && crop === 'woad') {
    // The cut leaves piled in heaps along the rows, to be carted to the dyer.
    for (let yy = 0.6; yy < b.h - 0.3; yy += 1.2) {
      for (let xx = 0.6; xx < b.w - 0.3; xx += 1.1) {
        const [sx, sy] = iso(xx + ((b.id + Math.floor(yy)) % 2) * 0.3, yy);
        c.fillStyle = 'rgba(30,20,10,0.2)';
        c.beginPath();
        c.ellipse(sx + 1, sy, 6, 2.2, 0, 0, Math.PI * 2);
        c.fill();
        for (let j = 0; j < 7; j++) {
          c.fillStyle = j % 2 ? '#4f7e74' : '#62948a';
          c.beginPath();
          c.ellipse(sx - 3.5 + (j % 4) * 2.4, sy - 1.5 - Math.floor(j / 4) * 2.4, 2.4, 1.2, (j - 3) * 0.4, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  } else if (stage === 'stooks' && !winter) {
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
 * One row of vegetables: cabbages in one row, the feathery tops of turnips
 * and leeks in the next, swelling from shoots to round heads by harvest.
 */
/** A row of field beans: leafy bushes, white flowers in early summer, dark pods when ripe. */
function beanRow(p: Pen, a: number, z: number, y: number, stage: string, k: number, rand: (k: number) => number): number {
  const c = p.ctx;
  const size: Record<string, number> = { sprout: 1.2, young: 2.2, tall: 3.2, full: 3.8, flower: 3.8, ripe: 3.8, stubble: 0.8 };
  const r = size[stage] ?? 0;
  for (let x = a + 0.04; x < z; x += 0.1) {
    k++;
    const [sx, sy] = iso(x + (rand(k) - 0.5) * 0.03, y);
    const rr = r * (0.85 + rand(k + 7) * 0.3);
    if (stage === 'stubble') {
      c.fillStyle = '#5a4a30';
      c.fillRect(sx - 0.5, sy - 1.6, 1, 1.6);
      continue;
    }
    c.strokeStyle = '#4a7a30';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx, sy - rr * 1.6);
    c.stroke();
    c.fillStyle = stage === 'ripe' ? '#7a8a40' : '#4e8a36';
    for (const [dx, dz] of [
      [-1.2, 0.8],
      [1.1, 1.1],
      [-0.6, 1.5],
    ]) {
      c.beginPath();
      c.ellipse(sx + dx * rr * 0.5, sy - rr * dz, rr * 0.45, rr * 0.3, 0, 0, Math.PI * 2);
      c.fill();
    }
    if (stage === 'full' && rand(k + 3) < 0.6) {
      c.fillStyle = '#f4f0e6';
      c.fillRect(sx - 0.6, sy - rr * 1.2, 1.2, 1);
    }
    if (stage === 'ripe') {
      c.fillStyle = '#3a3a24';
      c.fillRect(sx + 0.6, sy - rr * 1.1, 0.8, 2);
    }
  }
  return k;
}

function vegetableRow(p: Pen, a: number, z: number, y: number, stage: string, k: number, rand: (k: number) => number, row: number): number {
  const c = p.ctx;
  const size: Record<string, number> = { sprout: 1.2, young: 2, tall: 2.8, full: 3.4, flower: 3.4, ripe: 3.6, stubble: 0.8 };
  const r = size[stage] ?? 0;
  const cabbage = row % 2 === 0;
  for (let x = a + 0.05; x < z; x += 0.14) {
    k++;
    const [sx, sy] = iso(x + (rand(k) - 0.5) * 0.03, y);
    const rr = r * (0.85 + rand(k + 7) * 0.3);
    if (stage === 'stubble') {
      c.fillStyle = '#6a7a48';
      c.fillRect(sx - 0.7, sy - 1, 1.4, 1);
      continue;
    }
    c.fillStyle = 'rgba(30,20,10,0.28)';
    c.beginPath();
    c.ellipse(sx + 0.5, sy, rr, rr * 0.45, 0, 0, Math.PI * 2);
    c.fill();
    if (cabbage) {
      // Outer leaves, then the pale heart.
      c.fillStyle = stage === 'sprout' ? '#8ac060' : '#5e9a3e';
      c.beginPath();
      c.ellipse(sx, sy - rr * 0.45, rr, rr * 0.62, 0, 0, Math.PI * 2);
      c.fill();
      if (stage !== 'sprout') {
        c.fillStyle = '#a8d070';
        c.beginPath();
        c.arc(sx - rr * 0.1, sy - rr * 0.6, rr * 0.48, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(60,100,40,0.6)';
        c.lineWidth = 0.4;
        c.beginPath();
        c.arc(sx - rr * 0.1, sy - rr * 0.6, rr * 0.3, 0.5, 2.6);
        c.stroke();
      }
    } else {
      // Turnip tops: a spray of leaves over a white-and-purple shoulder.
      if (stage === 'full' || stage === 'ripe' || stage === 'flower') {
        c.fillStyle = '#e8e0d0';
        c.beginPath();
        c.arc(sx, sy - 0.6, 1.2, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#9a5aa0';
        c.beginPath();
        c.arc(sx, sy - 1.1, 1.1, Math.PI, 0);
        c.fill();
      }
      c.strokeStyle = '#4f8a3c';
      c.lineWidth = 0.8;
      for (let j = -2; j <= 2; j++) {
        c.beginPath();
        c.moveTo(sx, sy - 1);
        c.quadraticCurveTo(sx + j * rr * 0.3, sy - rr * 1.2, sx + j * rr * 0.5, sy - rr * 1.6);
        c.stroke();
      }
    }
  }
  return k;
}

/**
 * One row of woad: rosettes of long blue-green leaves that grow broad by
 * summer, then send up stems of tiny yellow flowers. Returns the running seed.
 */
function woadRow(p: Pen, a: number, z: number, y: number, stage: string, k: number, rand: (k: number) => number): number {
  const c = p.ctx;
  const size: Record<string, number> = { sprout: 1.6, young: 2.4, tall: 3.2, full: 3.8, flower: 3.8, ripe: 4, stubble: 1 };
  const r = size[stage] ?? 0;
  for (let x = a + 0.05; x < z; x += 0.15) {
    k++;
    const [sx, sy] = iso(x + (rand(k) - 0.5) * 0.03, y);
    const rr = r * (0.85 + rand(k + 7) * 0.3);
    if (stage === 'stubble') {
      c.fillStyle = '#6a7a58';
      c.fillRect(sx - 0.8, sy - 1.2, 1.6, 1.2);
      continue;
    }
    c.fillStyle = 'rgba(30,20,10,0.3)';
    c.beginPath();
    c.ellipse(sx + 0.6, sy, rr * 1.1, rr * 0.45, 0, 0, Math.PI * 2);
    c.fill();
    const leaf = stage === 'ripe' ? '#4a7468' : stage === 'sprout' ? '#7aa890' : '#5f8f86';
    const leaves = stage === 'sprout' ? 3 : 5;
    // Long leaves fanning up and out from the crown, the back ones darker.
    for (let j = 0; j < leaves; j++) {
      const t = j / (leaves - 1) - 0.5;
      const ang = -Math.PI / 2 + t * 2.4 + (rand(k + j) - 0.5) * 0.3;
      const len = rr * (1.1 - Math.abs(t) * 0.4);
      const lx = sx + Math.cos(ang) * len * 0.6;
      const ly = sy - 0.5 + Math.sin(ang) * len * 0.6;
      c.fillStyle = Math.abs(t) < 0.2 ? shade(leaf, 0.85) : j % 2 ? leaf : shade(leaf, 1.12);
      c.beginPath();
      c.ellipse(lx, ly, len * 0.62, len * 0.24, ang, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = shade(leaf, 1.4);
    c.lineWidth = 0.35;
    c.beginPath();
    c.moveTo(sx, sy - 0.5);
    c.lineTo(sx - rr * 0.7, sy - rr * 0.55);
    c.moveTo(sx, sy - 0.5);
    c.lineTo(sx + rr * 0.7, sy - rr * 0.55);
    c.stroke();
    if (stage === 'flower' && rand(k + 40) < 0.7) {
      // A branching stem crowned with a haze of little yellow flowers.
      const top = sy - rr - 7 - rand(k + 3) * 3;
      c.strokeStyle = '#4a6a4a';
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(sx, sy - rr * 0.4);
      c.lineTo(sx, top + 2);
      c.stroke();
      for (let j = 0; j < 5; j++) {
        c.fillStyle = j % 3 ? '#f0d43a' : '#e0b828';
        c.beginPath();
        c.arc(sx + (rand(k + 20 + j) - 0.5) * 5, top + (rand(k + 30 + j) - 0.5) * 3, 0.9, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  return k;
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
