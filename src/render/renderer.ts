import { BUILDINGS } from '../game/data';
import { monthOf, seasonOf } from '../game/sim';
import type { Building, BuildingType, GameState, ResourceId, Season } from '../game/types';
import { idx, inBounds } from '../game/world';
import type { Agent } from './agents';
import { Pen, TH, TW, iso } from './pen';
import {
  type Sprite,
  type TreeKind,
  bushSprite,
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

  buildingSprite(type: BuildingType, level: number, season: Season): Sprite {
    const d = BUILDINGS[type];
    return this.sprite(`b:${type}:${level}:${season}`, () => buildingSprite(type, d.w, d.h, level, season));
  }

  private blit(sp: Sprite, wx: number, wy: number, alpha = 1): void {
    const c = this.ctx;
    if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(sp.canvas, wx - sp.ax, wy - sp.ay, sp.w, sp.h);
    if (alpha !== 1) c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- main

  render(s: GameState, agents: Agent[], ov: Overlay, dt: number): void {
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

    // ---- ground
    for (let d = 0; d < W + H - 1; d++) {
      for (let x = Math.max(0, d - H + 1); x <= Math.min(W - 1, d); x++) {
        const y = d - x;
        const [wx, wy] = iso(x, y);
        if (!visible(wx, wy)) continue;
        const i = y * W + x;
        let sp: Sprite;
        if (s.terrain[i] === 1) {
          const mask = this.landMask(s, x, y);
          sp = this.sprite(`w:${season}:${mask}`, () => waterTile(season, mask));
        } else {
          const f = Math.min(3, Math.floor(s.fertility[i] * 4));
          const v = s.variant[i] % GRASS_VARIANTS;
          sp = this.sprite(`g:${season}:${f}:${v}`, () => grassTile(season, f, v));
        }
        this.blit(sp, wx, wy);
      }
    }
    this.drawWaterShimmer(s, visible);
    this.drawFields(s, season);
    // Roads on top of ground: all edges first so joints blend.
    for (const layer of ['edge', 'fill'] as const) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!s.road[i]) continue;
          const [wx, wy] = iso(x, y);
          if (!visible(wx, wy)) continue;
          const mask = this.roadMask(s, x, y);
          const sp = this.sprite(`r:${season}:${mask}:${layer}`, () => roadTile(season, mask, layer));
          this.blit(sp, wx, wy);
        }
      }
    }

    this.drawGroundOverlays(s, ov);

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
    for (const bucket of this.buckets) {
      for (const code of bucket) {
        const kind = code & 3;
        const n = code >> 2;
        if (kind === 0) this.drawTileObjects(s, n, season);
        else if (kind === 1) this.drawBuilding(s, s.buildings[n], season, ov.selected === s.buildings[n].id);
        else this.drawAgent(agents[n]);
      }
    }

    if (ov.ghost) this.drawGhost(s, ov.ghost, season);

    // ---- particles (chimney smoke)
    this.updateSmoke(s, dt, season);
    for (const p of this.particles) {
      const t = p.life / p.max;
      c.fillStyle = `rgba(225,225,225,${0.35 * (1 - t)})`;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (1 + t * 1.6), 0, Math.PI * 2);
      c.fill();
    }

    this.drawWeather(s, season, dt);
    this.drawAtmosphere(season, s.day);
  }

  // ---------------------------------------------------------------- ground helpers

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
      const slots = TREE_SLOTS[n - 1];
      for (let k = 0; k < slots.length; k++) {
        const tv = (v + k * 3) % TREE_VARIANTS;
        const kk: TreeKind = k === 1 && kind === 'oak' && v % 2 ? 'birch' : kind;
        const sp = this.sprite(`t:${kk}:${season}:${tv}`, () => treeSprite(kk, season, tv));
        const jx = ((v >> 2) % 5) * 0.03 - 0.06;
        const jy = ((v >> 4) % 5) * 0.03 - 0.06;
        const [wx, wy] = iso(x + slots[k][0] + jx, y + slots[k][1] + jy);
        this.blit(sp, wx, wy);
      }
    }
  }

  private drawBuilding(s: GameState, b: Building, season: Season, selected: boolean): void {
    const sp = this.buildingSprite(b.type, b.level, season);
    const [wx, wy] = iso(b.x, b.y);
    const c = this.ctx;
    if (b.build < 1) {
      this.drawConstruction(b, sp, wx, wy);
      return;
    }
    this.blit(sp, wx, wy);
    if (selected) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.12 + 0.06 * Math.sin(this.time * 4);
      c.drawImage(sp.canvas, wx - sp.ax, wy - sp.ay, sp.w, sp.h);
      c.restore();
    }
    // Status markers.
    if (!b.connected && b.type !== 'townhall') {
      this.drawMarker(b, '#d8462e', '!');
    } else if (b.status.startsWith('No ') || b.status.startsWith('Waiting') || b.status === 'Storage full') {
      this.drawMarker(b, '#e0a030', '?');
    }
    void s;
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
    // Materials.
    p.logPile(b.x + b.w - 0.1, b.y + b.h - 0.6, 2);
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
        const sp = this.buildingSprite(b.type, b.level, season);
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

  private drawWeather(s: GameState, season: Season, dt: number): void {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Drifting cloud shadows.
    const t = this.time;
    c.fillStyle = 'rgba(20,30,40,0.07)';
    for (let k = 0; k < 4; k++) {
      const x = ((t * 14 + k * 600) % (this.width + 900)) - 450;
      const y = (k * 271) % Math.max(1, this.height);
      c.beginPath();
      c.ellipse(x, y, 260, 110, 0.2, 0, Math.PI * 2);
      c.fill();
    }
    if (season === 3) {
      if (this.snow.length < 220) {
        for (let k = 0; k < 220; k++) this.snow.push({ x: Math.random() * 2000, y: Math.random() * 1200, s: 0.5 + Math.random() });
      }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of this.snow) {
        f.y += (20 + f.s * 25) * dt;
        f.x += Math.sin(t + f.s * 10) * 10 * dt;
        if (f.y > this.height) {
          f.y = -5;
          f.x = Math.random() * this.width;
        }
        c.fillRect(f.x % this.width, f.y, 1.2 + f.s, 1.2 + f.s);
      }
    } else if (season === 2) {
      // A few falling leaves.
      if (this.snow.length < 40) {
        for (let k = 0; k < 40; k++) this.snow.push({ x: Math.random() * 2000, y: Math.random() * 1200, s: Math.random() });
      }
      for (const f of this.snow.slice(0, 40)) {
        f.y += (14 + f.s * 10) * dt;
        f.x += Math.sin(t * 1.5 + f.s * 10) * 20 * dt;
        if (f.y > this.height) {
          f.y = -5;
          f.x = Math.random() * this.width;
        }
        c.fillStyle = f.s < 0.5 ? 'rgba(200,120,40,0.8)' : 'rgba(220,170,60,0.8)';
        c.fillRect(f.x % this.width, f.y, 3, 2);
      }
    } else if (this.snow.length) {
      this.snow = [];
    }
    void s;
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
