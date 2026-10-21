import { optionOn } from '../game/options';
import { drawHorse } from './horse';
import { mulberry32 } from '../game/rng';
import { HERALDRY } from './heraldry';
import { HOME_TRADES } from '../game/sim';
import type { BuildingType, Season } from '../game/types';
import { type Material, Pen, type PenDoor, ROOF_COLORS, TH, TW, iso, mix, shade, type V3 } from './pen';
import type { Building, GameState } from '../game/types';

/** Supersampling factor so sprites stay crisp when zoomed in. */
export const SS = 2;

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Local origin within the sprite, in CSS pixels. */
  ax: number;
  ay: number;
  w: number;
  h: number;
  /** Chimney tops in local 3D coordinates, for smoke. */
  smoke: V3[];
  /** The door villagers go in and out by, in local tile coordinates, if it has one. */
  door?: PenDoor;
}

export function makeSprite(w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D) => V3[] | void): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * SS);
  canvas.height = Math.ceil(h * SS);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SS, SS);
  ctx.translate(ax, ay);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const smoke = draw(ctx) || [];
  return { canvas, ax, ay, w, h, smoke };
}

// ------------------------------------------------------------------ palettes

export const GRASS: Record<Season, string[]> = {
  // From poor to fertile soil.
  0: ['#93b052', '#8bac4c', '#82a747', '#79a142'],
  1: ['#9fa954', '#94a54e', '#89a048', '#7e9a42'],
  2: ['#ab9f55', '#a39b50', '#9a964b', '#919146'],
  3: ['#e6ebee', '#e0e7ea', '#d9e2e6', '#d3dde2'],
};

const WATER = ['#3f7d9c', '#3f7d9c', '#3d7896', '#7fa4b8'];

// ------------------------------------------------------------------ ground

function diamond(ctx: CanvasRenderingContext2D, grow = 0.6): void {
  ctx.beginPath();
  ctx.moveTo(0, -grow);
  ctx.lineTo(TW / 2 + grow * 2, TH / 2);
  ctx.lineTo(0, TH + grow);
  ctx.lineTo(-TW / 2 - grow * 2, TH / 2);
  ctx.closePath();
}

/** How each month's grass leans toward the next season's colours. */
const MONTH_BLEND: [number, string | null][] = [
  [0.25, '#8a8a52'], // early spring: still a little muddy
  [0, null],
  [0.25, 'next'], // late spring greening into summer
  [0, null],
  [0, null],
  [0.3, 'next'], // late summer yellowing
  [0, null],
  [0, null],
  [0.35, '#8e7a50'], // late autumn browns
  [0, null],
  [0, null],
  [0.35, '#a8b07a'], // late winter thaw
];

export function grassColor(month: number, fert: number): string {
  const season = Math.floor(month / 3) as Season;
  const base = GRASS[season][fert];
  const [t, target] = MONTH_BLEND[month];
  if (!target || t === 0) return base;
  const to = target === 'next' ? GRASS[((season + 1) % 4) as Season][fert] : target;
  return mix(base, to, t);
}

export function grassTile(month: number, fert: number, variant: number): Sprite {
  const season = Math.floor(month / 3) as Season;
  const rand = mulberry32(variant * 97 + fert * 13 + season * 1009);
  return makeSprite(TW + 4, TH + 4, TW / 2 + 2, 2, (ctx) => {
    const base = grassColor(month, fert);
    diamond(ctx);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.save();
    diamond(ctx, 0);
    ctx.clip();
    // Speckles and tufts.
    for (let i = 0; i < 70; i++) {
      const x = (rand() - 0.5) * TW;
      const y = rand() * TH;
      const r = rand();
      ctx.fillStyle = r < 0.5 ? shade(base, 0.88) : shade(base, 1.08);
      ctx.fillRect(x, y, 1.5, 1.2);
    }
    if (season !== 3) {
      for (let i = 0; i < 9; i++) {
        const x = (rand() - 0.5) * TW * 0.8;
        const y = rand() * TH * 0.8 + 3;
        ctx.strokeStyle = shade(base, 0.75);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1, y - 3);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1.2, y - 2.6);
        ctx.stroke();
      }
    }
    if ((season === 0 || season === 1) && rand() < 0.35 + fert * 0.18) {
      // Wildflowers in a patch or two, thicker on rich soil: daisies and
      // primroses in spring; poppies, cornflowers, buttercups and clover in summer.
      const flowers = season === 0 ? ['#f4f0d8', '#f2d34a', '#e48ab0', '#b9a3e6'] : ['#d8352a', '#4a78d0', '#f2d34a', '#f4f0e4', '#c46aa8'];
      const patches = 1 + (fert >= 2 && rand() < 0.6 ? 1 : 0);
      for (let p = 0; p < patches; p++) {
        const col = flowers[Math.floor(rand() * flowers.length)];
        const px = (rand() - 0.5) * TW * 0.55;
        const py = TH * 0.25 + rand() * TH * 0.5;
        for (let i = 0; i < 3 + fert * 2; i++) {
          const fx = px + (rand() - 0.5) * 12;
          const fy = py + (rand() - 0.5) * 6;
          ctx.fillStyle = col;
          ctx.fillRect(fx - 0.9, fy - 0.9, 1.8, 1.8);
          ctx.fillStyle = col === '#f4f0d8' || col === '#f4f0e4' ? '#e8c840' : shade(col, 0.6);
          ctx.fillRect(fx - 0.3, fy - 0.3, 0.7, 0.7);
        }
      }
    }
    if (variant % 5 === 0 && season !== 3) {
      // A field stone or two half sunk in the grass.
      for (let i = 0; i < 1 + (variant % 2); i++) {
        const x = (rand() - 0.5) * TW * 0.5;
        const y = TH * 0.35 + rand() * TH * 0.4;
        ctx.fillStyle = '#9d988c';
        ctx.beginPath();
        ctx.ellipse(x, y, 2.4, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c4beb2';
        ctx.beginPath();
        ctx.ellipse(x - 0.5, y - 0.5, 1.3, 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (season === 2 && rand() < 0.4) {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#c8752e', '#d9a43c', '#a8482a'][i % 3];
        ctx.fillRect((rand() - 0.5) * TW * 0.7, rand() * TH * 0.7 + 4, 2, 1.4);
      }
    }
    if (season === 2 && fert >= 2 && rand() < 0.5) {
      // Seed heads standing in the autumn grass.
      ctx.strokeStyle = '#b89a5a';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 5; i++) {
        const x = (rand() - 0.5) * TW * 0.6;
        const y = TH * 0.3 + rand() * TH * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.6, y - 4);
        ctx.stroke();
        ctx.fillStyle = '#d8c48a';
        ctx.fillRect(x, y - 5, 1.4, 1.6);
      }
    }
    if (season === 3) {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(120,140,90,0.35)';
        ctx.fillRect((rand() - 0.5) * TW * 0.7, rand() * TH * 0.7 + 4, 2, 1.2);
      }
    }
    ctx.restore();
  });
}

/** Water tile; mask bits mark land on sides +x(1), +y(2), -x(4), -y(8). */
/**
 * Water tile; `deco` adds life to quiet water: 1 reeds along the shore,
 * 2 lily pads, 3 both.
 */
export function waterTile(season: Season, mask: number, deco = 0): Sprite {
  return makeSprite(TW + 4, TH + 4, TW / 2 + 2, 2, (ctx) => {
    const base = WATER[season];
    diamond(ctx);
    const g = ctx.createLinearGradient(0, 0, 0, TH);
    g.addColorStop(0, shade(base, 1.06));
    g.addColorStop(1, shade(base, 0.92));
    ctx.fillStyle = g;
    ctx.fill();
    // Shore edges.
    const top: [number, number] = [0, 0];
    const right: [number, number] = [TW / 2, TH / 2];
    const bottom: [number, number] = [0, TH];
    const left: [number, number] = [-TW / 2, TH / 2];
    const edges: [number, [number, number], [number, number]][] = [
      [1, right, bottom],
      [2, bottom, left],
      [4, left, top],
      [8, top, right],
    ];
    const sand = season === 3 ? '#dfe5e6' : '#c9b582';
    ctx.save();
    diamond(ctx, 0);
    ctx.clip();
    for (const [bit, a, b] of edges) {
      if (!(mask & bit)) continue;
      const cx = 0;
      const cy = TH / 2;
      const inset = (p: [number, number], t: number): [number, number] => [p[0] + (cx - p[0]) * t, p[1] + (cy - p[1]) * t];
      const a1 = inset(a, 0.32);
      const b1 = inset(b, 0.32);
      ctx.fillStyle = shade(base, 1.25);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(...inset(b, 0.45));
      ctx.lineTo(...inset(a, 0.45));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = sand;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(b1[0], b1[1]);
      ctx.lineTo(a1[0], a1[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const rand = mulberry32(mask * 131 + deco * 17 + season);
    if (deco & 2 && season !== 3) {
      // Lily pads floating in the open part of the tile, flowering in spring and summer.
      for (let k = 0; k < 3; k++) {
        const x = (rand() - 0.5) * TW * 0.36;
        const y = TH / 2 + (rand() - 0.5) * TH * 0.36;
        ctx.fillStyle = season === 2 ? '#7a8a3a' : '#4f8a3c';
        ctx.beginPath();
        ctx.ellipse(x, y, 4.2, 2.1, 0, 0.35, Math.PI * 2);
        ctx.lineTo(x, y);
        ctx.fill();
        if (season <= 1 && k === 0) {
          ctx.fillStyle = rand() < 0.5 ? '#f2d4dc' : '#f6f0e4';
          ctx.beginPath();
          ctx.arc(x + 0.8, y - 0.8, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (deco & 1 && mask) {
      // Reeds at the water's edge on the shore sides, cattails in summer and autumn.
      const mids: [number, number, number][] = [
        [1, TW / 4, (TH * 3) / 4],
        [2, -TW / 4, (TH * 3) / 4],
        [4, -TW / 4, TH / 4],
        [8, TW / 4, TH / 4],
      ];
      for (const [bit, mx, my] of mids) {
        if (!(mask & bit)) continue;
        const bx = mx * 0.55;
        const by = TH / 2 + (my - TH / 2) * 0.55;
        for (let k = 0; k < 9; k++) {
          const x = bx + (rand() - 0.5) * 14;
          const y = by + (rand() - 0.5) * 4;
          const h = 7 + rand() * 5;
          ctx.strokeStyle = season === 3 ? '#b8a878' : season === 2 ? '#9a8a4a' : '#5f8a3a';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 0.5, y - h * 0.6, x + (rand() - 0.5) * 2, y - h);
          ctx.stroke();
          if ((season === 1 || season === 2) && k % 2 === 0) {
            ctx.fillStyle = '#6b4a2e';
            ctx.fillRect(x - 0.6, y - h - 0.5, 1.4, 2.6);
          }
        }
      }
    }
  });
}

/** A post mill's four lattice sails around a hub at (hx, hy), turned by `turn` radians. */
export function drawSails(c: CanvasRenderingContext2D, hx: number, hy: number, turn: number, season: Season): void {
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2 + turn;
    const ex = hx + Math.cos(a) * 30;
    const ey = hy + Math.sin(a) * 30;
    c.strokeStyle = '#5e4129';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(ex, ey);
    c.stroke();
    // Lattice sail cloth along one side of each arm.
    const nx = -Math.sin(a) * 6;
    const ny = Math.cos(a) * 6;
    c.fillStyle = season === 3 ? 'rgba(230,236,240,0.85)' : 'rgba(240,232,214,0.9)';
    c.beginPath();
    c.moveTo(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8);
    c.lineTo(ex, ey);
    c.lineTo(ex + nx, ey + ny);
    c.lineTo(hx + Math.cos(a) * 8 + nx, hy + Math.sin(a) * 8 + ny);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(94,65,41,0.6)';
    c.lineWidth = 0.5;
    for (let t = 0.35; t < 1; t += 0.16) {
      c.beginPath();
      c.moveTo(hx + Math.cos(a) * 30 * t, hy + Math.sin(a) * 30 * t);
      c.lineTo(hx + Math.cos(a) * 30 * t + nx, hy + Math.sin(a) * 30 * t + ny);
      c.stroke();
    }
  }
  c.fillStyle = '#3b2a1a';
  c.beginPath();
  c.arc(hx, hy, 2.4, 0, Math.PI * 2);
  c.fill();
}

/** Dirt road; mask bits mark road neighbours like waterTile. */
/**
 * A road tile that only turns a corner (two neighbours at right angles) is
 * drawn as a curve between the two edge midpoints, so roads bend instead of
 * meeting in a sharp elbow. Returns the two midpoints, or null.
 */
function cornerEnds(mask: number, mids: [number, number, number][]): [[number, number], [number, number]] | null {
  if (mask !== 3 && mask !== 6 && mask !== 12 && mask !== 9) return null;
  const ends = mids.filter(([bit]) => mask & bit).map(([, x, y]) => [x, y] as [number, number]);
  return [ends[0], ends[1]];
}

function roadPoints(cx: number, cy: number, segs: [number, number, number][], corner: [[number, number], [number, number]] | null, step: number): [number, number, number, number][] {
  // Each point carries the direction of travel there (ux, uy).
  const out: [number, number, number, number][] = [];
  if (corner) {
    const [[ax, ay], [bx, by]] = corner;
    const n = Math.max(4, Math.round((Math.hypot(ax - cx, ay - cy) + Math.hypot(bx - cx, by - cy)) / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
      const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
      const dx = 2 * (1 - t) * (cx - ax) + 2 * t * (bx - cx);
      const dy = 2 * (1 - t) * (cy - ay) + 2 * t * (by - cy);
      const l = Math.hypot(dx, dy) || 1;
      out.push([x, y, dx / l, dy / l]);
    }
    return out;
  }
  for (const [, mx, my] of segs) {
    const len = Math.hypot(mx - cx, my - cy);
    for (let t = 0; t <= len + 0.5; t += step) out.push([cx + ((mx - cx) * t) / len, cy + ((my - cy) * t) / len, (mx - cx) / len, (my - cy) / len]);
  }
  return out;
}

/**
 * The worn verge of a road: trodden earth that fades into the ground around
 * it instead of a hard kerb line. Segments end square at the tile's edge, so
 * neighbouring tiles meet without the verge doubling up at the joint.
 */
function softVerge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  segs: [number, number, number][],
  corner: [[number, number], [number, number]] | null,
  color: string,
  inner: number,
  outer: number,
  peak: number,
): void {
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = ctx.canvas.width;
    cv.height = ctx.canvas.height;
    const c = cv.getContext('2d')!;
    c.setTransform(ctx.getTransform());
    return { cv, c };
  };
  const acc = mk();
  const lvl = mk();
  const steps = 7;
  for (let k = 0; k < steps; k++) {
    const w = outer - ((outer - inner) * k) / steps;
    // One level, solid, so overlapping strokes do not add up...
    lvl.c.save();
    lvl.c.setTransform(1, 0, 0, 1, 0, 0);
    lvl.c.clearRect(0, 0, lvl.cv.width, lvl.cv.height);
    lvl.c.restore();
    lvl.c.strokeStyle = color;
    lvl.c.fillStyle = color;
    lvl.c.lineWidth = w;
    lvl.c.lineCap = 'butt';
    lvl.c.beginPath();
    if (corner) {
      lvl.c.moveTo(corner[0][0], corner[0][1]);
      lvl.c.quadraticCurveTo(cx, cy, corner[1][0], corner[1][1]);
      lvl.c.stroke();
    } else {
      for (const [, mx, my] of segs) {
        lvl.c.moveTo(cx, cy);
        lvl.c.lineTo(mx, my);
      }
      lvl.c.stroke();
      lvl.c.beginPath();
      lvl.c.ellipse(cx, cy, w / 2, w / 2, 0, 0, Math.PI * 2);
      lvl.c.fill();
    }
    // ...then laid over the wider ones with its own strength.
    acc.c.save();
    acc.c.setTransform(1, 0, 0, 1, 0, 0);
    acc.c.globalCompositeOperation = 'destination-out';
    acc.c.drawImage(lvl.cv, 0, 0);
    acc.c.globalCompositeOperation = 'source-over';
    acc.c.globalAlpha = peak * ((k + 1) / steps) ** 1.6;
    acc.c.drawImage(lvl.cv, 0, 0);
    acc.c.restore();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(acc.cv, 0, 0);
  ctx.restore();
}

/** A few clods and pebbles scattered along the verge, thinning outwards. */
function vergeSpecks(ctx: CanvasRenderingContext2D, pts: [number, number, number, number][], color: string, from: number, to: number, seed: number): void {
  const rand = mulberry32(seed);
  for (const [bx, by, ux, uy] of pts) {
    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const d = from + (to - from) * rand() ** 1.8;
      const x = bx - uy * d * side;
      const y = by + ux * d * side;
      ctx.globalAlpha = 0.25 + 0.35 * (1 - (d - from) / (to - from));
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1 + rand() * 1.2, 0.8);
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Ragged blots of `color` along both sides of a road, so its border wanders
 * in and out instead of running as a clean line.
 */
function raggedEdge(ctx: CanvasRenderingContext2D, pts: [number, number, number, number][], color: string, from: number, to: number, alpha: [number, number], seed: number): void {
  const rand = mulberry32(seed);
  ctx.fillStyle = color;
  for (const [bx, by, ux, uy] of pts) {
    for (const side of [-1, 1]) {
      const d = from + (to - from) * rand();
      const r = 1.2 + rand() * 2.2;
      ctx.globalAlpha = alpha[0] + (alpha[1] - alpha[0]) * rand();
      ctx.beginPath();
      ctx.ellipse(bx - uy * d * side, by + ux * d * side, r * 1.4, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Tufts of grass (or drifts of snow) creeping in over a road's border. */
export function encroach(ctx: CanvasRenderingContext2D, pts: [number, number, number, number][], season: Season, at: number, seed: number): void {
  const rand = mulberry32(seed);
  for (const [bx, by, ux, uy] of pts) {
    for (const side of [-1, 1]) {
      if (rand() < 0.4) continue;
      const d = at + (rand() - 0.4) * 2.5;
      tuft(ctx, bx - uy * d * side, by + ux * d * side, season, rand);
    }
  }
}

/** One tuft: a soft patch of turf with a few blades, or a little drift of snow. */
export function tuft(ctx: CanvasRenderingContext2D, x: number, y: number, season: Season, rand: () => number): void {
  const tones = GRASS[season];
  const snow = season === 3;
  ctx.fillStyle = tones[(snow ? 0 : 2) + Math.floor(rand() * 2)];
  ctx.globalAlpha = snow ? 0.25 + rand() * 0.2 : 0.35 + rand() * 0.25;
  ctx.beginPath();
  ctx.ellipse(x, y, (1.6 + rand() * 1.6) * (snow ? 1.4 : 1), (0.8 + rand() * 0.6) * (snow ? 1.2 : 1), 0, 0, Math.PI * 2);
  ctx.fill();
  if (season !== 3) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = shade(tones[3], 0.72);
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
      const ox = x + (rand() - 0.5) * 2.4;
      ctx.moveTo(ox - 0.5, y - 1.6 - rand());
      ctx.lineTo(ox, y + 0.2);
      ctx.lineTo(ox + 0.6, y - 1.5 - rand());
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function roadTile(season: Season, mask: number, layer: 'edge' | 'fill', variant = 0): Sprite {
  return makeSprite(TW + 28, TH + 28, TW / 2 + 14, 14, (ctx) => {
    const cx = 0;
    const cy = TH / 2;
    const mids: [number, number, number][] = [
      [1, TW / 4, (TH * 3) / 4],
      [2, -TW / 4, (TH * 3) / 4],
      [4, -TW / 4, TH / 4],
      [8, TW / 4, TH / 4],
    ];
    const dirt = season === 3 ? '#cfc6b8' : '#a88a5c';
    const edge = season === 3 ? '#b9ad9c' : '#8d7149';
    const corner = cornerEnds(mask, mids);
    const draw = (color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (corner) {
        ctx.moveTo(corner[0][0], corner[0][1]);
        ctx.quadraticCurveTo(cx, cy, corner[1][0], corner[1][1]);
        ctx.stroke();
        return;
      }
      let any = false;
      for (const [bit, mx, my] of mids) {
        if (!(mask & bit)) continue;
        any = true;
        ctx.moveTo(cx, cy);
        ctx.lineTo(mx, my);
      }
      if (!any) {
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx + 6, cy);
      }
      ctx.stroke();
    };
    const segs = mids.filter(([bit]) => mask & bit);
    const pts = roadPoints(cx, cy, segs.length ? segs : [mids[0], mids[2]], corner, 2.2);
    const seed = mask * 7 + season * 101 + variant * 997;
    if (layer === 'edge') {
      // A wide, faint wear in the grass where feet stray off the track.
      softVerge(ctx, cx, cy, segs, corner, edge, 10, 32, 0.32);
      vergeSpecks(ctx, pts, shade(edge, 0.9), 7, 14, seed);
      return;
    }
    // Packed earth that thins out at its borders rather than stopping.
    softVerge(ctx, cx, cy, segs, corner, dirt, 6, 19, 0.9);
    raggedEdge(ctx, pts, dirt, 3.5, 7.5, [0.45, 0.95], seed + 1);
    draw(dirt, 7);
    encroach(ctx, pts, season, 8.2, seed + 2);
    // Wheel ruts.
    ctx.save();
    ctx.globalAlpha = 0.35;
    draw(shade(dirt, 0.85), 6);
    ctx.globalAlpha = 1;
    draw(dirt, 3.4);
    ctx.restore();
    // Pebbles.
    const rand = mulberry32(mask * 31 + season);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = shade(dirt, rand() < 0.5 ? 0.8 : 1.15);
      ctx.fillRect(cx + (rand() - 0.5) * 11, cy + (rand() - 0.5) * 6, 1.4, 1.1);
    }
  });
}

/** Cobbled stone road; mask bits like roadTile. */
export function pavedTile(season: Season, mask: number, layer: 'edge' | 'fill', variant = 0): Sprite {
  return makeSprite(TW + 28, TH + 28, TW / 2 + 14, 14, (ctx) => {
    const cx = 0;
    const cy = TH / 2;
    const mids: [number, number, number][] = [
      [1, TW / 4, (TH * 3) / 4],
      [2, -TW / 4, (TH * 3) / 4],
      [4, -TW / 4, TH / 4],
      [8, TW / 4, TH / 4],
    ];
    let segs = mids.filter(([bit]) => mask & bit);
    if (!segs.length) segs = [mids[0], mids[2]];
    const corner = cornerEnds(mask, mids);
    const draw = (color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (corner) {
        ctx.moveTo(corner[0][0], corner[0][1]);
        ctx.quadraticCurveTo(cx, cy, corner[1][0], corner[1][1]);
      } else {
        for (const [, mx, my] of segs) {
          ctx.moveTo(cx, cy);
          ctx.lineTo(mx, my);
        }
      }
      ctx.stroke();
    };
    if (layer === 'edge') {
      // A strip of trodden earth fading into the ground.
      // A band of brown, trodden earth along the stones, fading into the ground.
      const earth = season === 3 ? '#b9ad9c' : '#937652';
      const pts = roadPoints(cx, cy, segs, corner, 2.2);
      const seed = mask * 13 + season * 101 + variant * 997;
      softVerge(ctx, cx, cy, segs, corner, earth, 14, 32, 0.72);
      raggedEdge(ctx, pts, earth, 7, 10.5, [0.3, 0.7], seed);
      encroach(ctx, pts, season, 12.5, seed + 1);
      vergeSpecks(ctx, pts, season === 3 ? '#9a958c' : '#857c6e', 7.5, 13, seed + 2);
      return;
    }
    const mortar = season === 3 ? '#c4c0b8' : '#8a8274';
    draw(mortar, 15);
    // Cobbles laid in courses across the road.
    const rand = mulberry32(mask * 17 + 3);
    const stones = ['#b4ada0', '#a39b8c', '#c2bbad', '#998f80', '#aca594'];
    let row = 0;
    for (const [bx, by, ux, uy] of roadPoints(cx, cy, segs, corner, 3.2)) {
      // Perpendicular in iso screen space (across the road).
      const px = -uy * 2;
      const py = ux * 0.5;
      for (let k = -2; k <= 2; k++) {
        const off = k + (row % 2 ? 0.5 : 0);
        if (Math.abs(off) > 2.2) continue;
        const x = bx + px * off * 1.35;
        const y = by + py * off * 1.35;
        ctx.fillStyle = season === 3 && rand() < 0.4 ? '#e8ecf0' : stones[Math.floor(rand() * stones.length)];
        ctx.beginPath();
        ctx.ellipse(x, y, 1.9, 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      row++;
    }
    // A worn centre line where cartwheels run.
    ctx.globalAlpha = 0.18;
    draw('#4a4236', 3);
    ctx.globalAlpha = 1;
  });
}

/** Cobbled street (dressed stone): rounded setts over the whole roadway. */
/**
 * The Royal Road: broad slabs of pale dressed stone paving the whole tile,
 * so its two lanes side by side read as one wide way, kerbed where it ends.
 */
export function royalTile(season: Season, mask: number, layer: 'edge' | 'fill'): Sprite {
  return makeSprite(TW + 28, TH + 28, TW / 2 + 14, 14, (ctx) => {
    const cy = TH / 2;
    const diamond = (grow: number) => {
      ctx.beginPath();
      ctx.moveTo(0, cy - TH / 2 - grow / 2);
      ctx.lineTo(TW / 2 + grow, cy);
      ctx.lineTo(0, cy + TH / 2 + grow / 2);
      ctx.lineTo(-TW / 2 - grow, cy);
      ctx.closePath();
    };
    if (layer === 'edge') {
      ctx.fillStyle = season === 3 ? 'rgba(170,165,155,0.5)' : 'rgba(120,105,80,0.45)';
      diamond(5);
      ctx.fill();
      return;
    }
    ctx.fillStyle = season === 3 ? '#d8d6d0' : '#c9bfa8';
    diamond(1);
    ctx.fill();
    // Slabs in courses across the tile.
    ctx.strokeStyle = season === 3 ? '#b8b4ac' : '#9c917a';
    ctx.lineWidth = 0.7;
    const rand = mulberry32(mask * 29 + 5);
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      ctx.beginPath();
      ctx.moveTo(-TW / 2 + (TW / 2) * t, cy - (TH / 2) * t);
      ctx.lineTo((TW / 2) * t, cy + TH / 2 - (TH / 2) * t);
      ctx.stroke();
    }
    for (let k = 0; k < 8; k++) {
      const u = rand() - 0.5;
      const v = rand() - 0.5;
      const x = (u - v) * (TW / 2);
      const y = cy + (u + v) * (TH / 2);
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 1.5);
      ctx.lineTo(x + 3, y + 1.5);
      ctx.stroke();
    }
    // A kerb where the road stops (sides with no road beside).
    ctx.strokeStyle = season === 3 ? '#a8a49c' : '#7e735e';
    ctx.lineWidth = 1.4;
    const sides: [number, [number, number], [number, number]][] = [
      [1, [TW / 2, cy], [0, cy + TH / 2]],
      [2, [0, cy + TH / 2], [-TW / 2, cy]],
      [4, [-TW / 2, cy], [0, cy - TH / 2]],
      [8, [0, cy - TH / 2], [TW / 2, cy]],
    ];
    for (const [bit, a, b] of sides) {
      if (mask & bit) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  });
}

export function cobbleTile(season: Season, mask: number, layer: 'edge' | 'fill'): Sprite {
  return makeSprite(TW + 28, TH + 28, TW / 2 + 14, 14, (ctx) => {
    const cx = 0;
    const cy = TH / 2;
    const mids: [number, number, number][] = [
      [1, TW / 4, (TH * 3) / 4],
      [2, -TW / 4, (TH * 3) / 4],
      [4, -TW / 4, TH / 4],
      [8, TW / 4, TH / 4],
    ];
    let segs = mids.filter(([bit]) => mask & bit);
    if (!segs.length) segs = [mids[0], mids[2]];
    const corner = cornerEnds(mask, mids);
    const draw = (color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (corner) {
        ctx.moveTo(corner[0][0], corner[0][1]);
        ctx.quadraticCurveTo(cx, cy, corner[1][0], corner[1][1]);
      } else {
        for (const [, mx, my] of segs) {
          ctx.moveTo(cx, cy);
          ctx.lineTo(mx, my);
        }
      }
      ctx.stroke();
    };
    if (layer === 'edge') {
      // A strip of trodden earth fading into the ground.
      const earth = season === 3 ? '#b9b2a6' : '#8d7a5a';
      softVerge(ctx, cx, cy, segs, corner, earth, 14, 27, 0.5);
      vergeSpecks(ctx, roadPoints(cx, cy, segs, corner, 2.5), season === 3 ? '#9a958c' : '#857c6e', 7.5, 12, mask * 13 + season);
      return;
    }
    const mortar = season === 3 ? '#b4b0a8' : '#6e6658';
    draw(mortar, 15);
    // Cobbles in courses over the whole tile, kept only where the road runs.
    const rand = mulberry32(mask * 17 + 3);
    const stones = ['#b4ada0', '#a39b8c', '#c2bbad', '#998f80', '#aca594'];
    const t = document.createElement('canvas');
    t.width = ctx.canvas.width;
    t.height = ctx.canvas.height;
    const tc = t.getContext('2d')!;
    tc.setTransform(ctx.getTransform());
    for (let gy = -2; gy <= TH + 2; gy += 2.4) {
      const row = Math.round(gy / 2.4);
      for (let gx = -TW / 2 - 2 + (row % 2 ? 2.1 : 0); gx <= TW / 2 + 2; gx += 4.2) {
        const col = season === 3 && rand() < 0.4 ? '#e8ecf0' : stones[Math.floor(rand() * stones.length)];
        const x = gx + (rand() - 0.5) * 0.6;
        const y = gy + (rand() - 0.5) * 0.4;
        tc.fillStyle = shade(col, 0.6);
        tc.beginPath();
        tc.ellipse(x + 0.2, y + 0.45, 2, 1.15, 0, 0, Math.PI * 2);
        tc.fill();
        tc.fillStyle = col;
        tc.beginPath();
        tc.ellipse(x, y, 1.9, 1.05, 0, 0, Math.PI * 2);
        tc.fill();
        tc.fillStyle = shade(col, 1.15);
        tc.beginPath();
        tc.ellipse(x - 0.5, y - 0.3, 0.9, 0.45, 0, 0, Math.PI * 2);
        tc.fill();
      }
    }
    // Keep the cobbles inside the road's line.
    tc.globalCompositeOperation = 'destination-in';
    tc.strokeStyle = '#000';
    tc.lineWidth = 14;
    tc.lineCap = 'round';
    tc.beginPath();
    if (corner) {
      tc.moveTo(corner[0][0], corner[0][1]);
      tc.quadraticCurveTo(cx, cy, corner[1][0], corner[1][1]);
    } else {
      for (const [, mx, my] of segs) {
        tc.moveTo(cx, cy);
        tc.lineTo(mx, my);
      }
    }
    tc.stroke();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(t, 0, 0);
    ctx.restore();
    // A worn centre line where cartwheels run.
    ctx.globalAlpha = 0.18;
    draw('#4a4236', 3);
    ctx.globalAlpha = 1;
  });
}

/** Wooden bridge deck over water; mask bits like roadTile. */
export function bridgeTile(season: Season, mask: number, layer: 'edge' | 'fill'): Sprite {
  return makeSprite(TW + 4, TH + 24, TW / 2 + 2, 2, (ctx) => {
    const cx = 0;
    const cy = TH / 2;
    const mids: [number, number, number][] = [
      [1, TW / 4, (TH * 3) / 4],
      [2, -TW / 4, (TH * 3) / 4],
      [4, -TW / 4, TH / 4],
      [8, TW / 4, TH / 4],
    ];
    let segs = mids.filter(([bit]) => mask & bit);
    // A lone bridge tile still shows a short deck.
    if (!segs.length) segs = [mids[0], mids[2]];
    const stroke = (color: string, width: number, dy = 0) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const [, mx, my] of segs) {
        ctx.moveTo(cx, cy + dy);
        ctx.lineTo(mx, my + dy);
      }
      ctx.stroke();
    };
    if (layer === 'edge') {
      // Shadow on the water and supporting posts.
      stroke('rgba(20,40,50,0.35)', 18, 6);
      ctx.fillStyle = '#4a3424';
      for (const [, mx, my] of segs) {
        ctx.fillRect((cx + mx) / 2 - 7, (cy + my) / 2 - 1, 2.5, 9);
        ctx.fillRect((cx + mx) / 2 + 5, (cy + my) / 2 - 1, 2.5, 9);
      }
      return;
    }
    stroke('#5e4129', 16);
    stroke(season === 3 ? '#d8d4cc' : '#a07a4a', 13);
    // Planks across the deck.
    ctx.strokeStyle = season === 3 ? '#b8b0a4' : '#7a5a36';
    ctx.lineWidth = 0.8;
    for (const [, mx, my] of segs) {
      const len = Math.hypot(mx - cx, my - cy);
      const ux = (mx - cx) / len;
      const uy = (my - cy) / len;
      for (let t = 2; t < len; t += 3.2) {
        const px = cx + ux * t;
        const py = cy + uy * t;
        ctx.beginPath();
        ctx.moveTo(px - uy * 6.5, py + ux * 6.5);
        ctx.lineTo(px + uy * 6.5, py - ux * 6.5);
        ctx.stroke();
      }
      // Rails.
      ctx.strokeStyle = '#4a3424';
      ctx.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx - uy * 7 * side, cy + ux * 7 * side - 4);
        ctx.lineTo(mx - uy * 7 * side, my + ux * 7 * side - 4);
        ctx.stroke();
      }
      ctx.strokeStyle = season === 3 ? '#b8b0a4' : '#7a5a36';
      ctx.lineWidth = 0.8;
    }
  });
}

// ------------------------------------------------------------------ nature

export type TreeKind = 'oak' | 'pine' | 'birch';

export function treeSprite(kind: TreeKind, season: Season, variant: number): Sprite {
  const rand = mulberry32(variant * 7919 + season * 31 + kind.length);
  const scale = 0.8 + rand() * 0.35;
  return makeSprite(44, 76, 22, 70, (ctx) => {
    // Shadow.
    ctx.fillStyle = 'rgba(25,35,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(5, 1, 13 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'pine') {
      ctx.fillStyle = '#5a3d24';
      ctx.fillRect(-1.5, -9 * scale, 3, 9 * scale);
      const green = ['#2f5d36', '#346539', '#2b5532'][variant % 3];
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const w = (15 - i * 3) * scale;
        const yb = (-7 - i * 10) * scale;
        const yt = yb - 18 * scale;
        ctx.fillStyle = shade(green, 0.82);
        ctx.beginPath();
        ctx.moveTo(-w, yb);
        ctx.lineTo(0, yt);
        ctx.lineTo(w, yb);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(green, 1.08);
        ctx.beginPath();
        ctx.moveTo(-w, yb);
        ctx.lineTo(0, yt);
        ctx.lineTo(w * 0.15, yb - 1);
        ctx.closePath();
        ctx.fill();
        if (season === 3) {
          ctx.fillStyle = '#f2f6f8';
          ctx.beginPath();
          ctx.moveTo(-w * 0.55, yb - 6 * scale);
          ctx.lineTo(0, yt);
          ctx.lineTo(w * 0.5, yb - 6 * scale);
          ctx.quadraticCurveTo(0, yb - 9 * scale, -w * 0.55, yb - 6 * scale);
          ctx.fill();
        }
      }
      return;
    }
    // Broadleaf trees.
    const trunk = kind === 'birch' ? '#e8e2d6' : '#5e4129';
    ctx.fillStyle = trunk;
    ctx.fillRect(-2, -18 * scale, 4, 18 * scale);
    if (kind === 'birch') {
      ctx.fillStyle = '#3b3530';
      for (let i = 0; i < 4; i++) ctx.fillRect(-2, -4 - i * 4 * scale, 2.5, 1);
    }
    if (season === 3) {
      ctx.strokeStyle = trunk;
      ctx.lineWidth = 1.4;
      const branch = (x: number, y: number, a: number, len: number, depth: number) => {
        const x2 = x + Math.cos(a) * len;
        const y2 = y + Math.sin(a) * len;
        ctx.lineWidth = depth * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (depth > 1) {
          branch(x2, y2, a - 0.45 - rand() * 0.2, len * 0.72, depth - 1);
          branch(x2, y2, a + 0.45 + rand() * 0.2, len * 0.72, depth - 1);
        }
      };
      branch(0, -16 * scale, -Math.PI / 2, 13 * scale, 4);
      ctx.fillStyle = 'rgba(245,248,250,0.9)';
      for (let i = 0; i < 10; i++) {
        ctx.fillRect((rand() - 0.5) * 22 * scale, -20 * scale - rand() * 26 * scale, 2.5, 1.2);
      }
      return;
    }
    let leaf: string;
    if (season === 2) {
      leaf = ['#c97b2a', '#d6a13a', '#b0502a', '#9c8a2e', '#d08a30'][variant % 5];
      if (kind === 'birch') leaf = '#e0b840';
    } else if (season === 0) {
      leaf = kind === 'birch' ? '#9cc65a' : '#6aa63e';
    } else {
      leaf = kind === 'birch' ? '#7fae48' : ['#4f8a2e', '#4a822c', '#5a9234'][variant % 3];
    }
    const blobs: [number, number, number][] = [
      [-7, -26, 9],
      [7, -27, 9],
      [0, -36, 10],
      [-4, -44, 7],
      [5, -42, 7],
    ];
    for (const [bx, by, r] of blobs) {
      ctx.fillStyle = shade(leaf, 0.72);
      ctx.beginPath();
      ctx.arc(bx * scale + 1.5, by * scale + 1.5, r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [bx, by, r] of blobs) {
      ctx.fillStyle = leaf;
      ctx.beginPath();
      ctx.arc(bx * scale, by * scale, r * scale * 0.92, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [bx, by, r] of blobs) {
      ctx.fillStyle = shade(leaf, 1.18);
      ctx.beginPath();
      ctx.arc(bx * scale - r * 0.3 * scale, by * scale - r * 0.35 * scale, r * scale * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (season === 0 && variant % 3 === 0) {
      ctx.fillStyle = '#f6d6e4';
      for (let i = 0; i < 12; i++) ctx.fillRect((rand() - 0.5) * 24 * scale, -24 * scale - rand() * 26 * scale, 2, 2);
    }
  });
}

/** Bog iron in the ground: a rust-stained, boggy patch with pools and reeds. */
export function bogSprite(variant: number, season: Season): Sprite {
  const rand = mulberry32(variant * 53 + 11);
  return makeSprite(70, 40, 35, 22, (ctx) => {
    const winter = season === 3;
    // Soft-edged wet ground fading into the grass.
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    g.addColorStop(0, winter ? '#d0d6d4' : 'rgba(96,70,44,0.95)');
    g.addColorStop(0.7, winter ? 'rgba(208,214,212,0.7)' : 'rgba(110,84,50,0.75)');
    g.addColorStop(1, 'rgba(110,84,50,0)');
    ctx.save();
    ctx.scale(1, 0.48);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Rust stains and ochre crusts.
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = winter ? '#c8b8a8' : k % 2 ? 'rgba(168,94,48,0.55)' : 'rgba(190,120,60,0.45)';
      ctx.beginPath();
      ctx.ellipse((rand() - 0.5) * 34, (rand() - 0.5) * 14, 3 + rand() * 4, 1.5 + rand() * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // A pool of rusty water with an oily sheen.
    const px = (rand() - 0.5) * 16;
    const py = (rand() - 0.5) * 6;
    ctx.fillStyle = winter ? '#e8f0f2' : '#7a5034';
    ctx.beginPath();
    ctx.ellipse(px, py, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = winter ? '#f4f8fa' : 'rgba(200,140,80,0.6)';
    ctx.beginPath();
    ctx.ellipse(px - 1, py - 0.6, 6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!winter) {
      ctx.strokeStyle = 'rgba(160,190,220,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(px + 1, py - 0.4, 3, 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Lumps of ore showing, and tufts of reed and rush.
    for (let k = 0; k < 3; k++) {
      const x = (rand() - 0.5) * 34;
      const y = (rand() - 0.5) * 10;
      ctx.fillStyle = '#7a4a34';
      ctx.beginPath();
      ctx.ellipse(x, y - 1, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0703a';
      ctx.fillRect(x - 1, y - 2.4, 1.4, 1);
    }
    ctx.strokeStyle = winter ? '#a8b0a0' : '#6a8a3a';
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 9; k++) {
      const x = (rand() - 0.5) * 50;
      const y = (rand() - 0.5) * 18;
      for (const d of [-1.5, 0, 1.5]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + d, y - 6 - rand() * 4);
        ctx.stroke();
      }
    }
  });
}

export function rockSprite(ore: boolean, variant: number, season: Season): Sprite {
  const rand = mulberry32(variant * 131 + (ore ? 7 : 0));
  return makeSprite(60, 40, 30, 28, (ctx) => {
    const n = 2 + (variant % 3);
    const stones: [number, number, number][] = [];
    for (let i = 0; i < n; i++) stones.push([(rand() - 0.5) * 28, (rand() - 0.5) * 10, 6 + rand() * 6]);
    stones.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of stones) {
      ctx.fillStyle = 'rgba(30,30,20,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + 3, y + 2, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const base = ore ? '#7a5240' : '#9d9a92';
      ctx.fillStyle = shade(base, 0.8);
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x - r * 0.6, y - r * 1.1);
      ctx.lineTo(x + r * 0.3, y - r * 1.3);
      ctx.lineTo(x + r, y - r * 0.4);
      ctx.lineTo(x + r * 0.8, y + r * 0.3);
      ctx.lineTo(x - r * 0.5, y + r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(base, 1.1);
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x - r * 0.6, y - r * 1.1);
      ctx.lineTo(x + r * 0.3, y - r * 1.3);
      ctx.lineTo(x + r * 0.1, y - r * 0.3);
      ctx.closePath();
      ctx.fill();
      if (ore) {
        // Rust-red streaks and ochre stains of the iron in the rock.
        ctx.fillStyle = '#c0703a';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + (rand() - 0.6) * r, y - rand() * r, 2.6, 1.4);
        ctx.fillStyle = '#d8a050';
        ctx.fillRect(x + (rand() - 0.5) * r * 0.8, y - r * 0.6, 1.6, 1.2);
      }
      if (season === 3) {
        ctx.fillStyle = '#f2f6f8';
        ctx.beginPath();
        ctx.moveTo(x - r * 0.7, y - r * 0.9);
        ctx.lineTo(x + r * 0.3, y - r * 1.3);
        ctx.lineTo(x + r * 0.5, y - r * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    }
  });
}

export function bushSprite(berries: boolean, season: Season, variant: number): Sprite {
  const rand = mulberry32(variant * 17 + (berries ? 1 : 0));
  return makeSprite(32, 24, 16, 18, (ctx) => {
    ctx.fillStyle = 'rgba(30,40,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 1, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const leaf = season === 3 ? '#7d8a6e' : season === 2 ? '#7d7f34' : '#3f7a35';
    for (const [x, y, r] of [
      [-5, -4, 6],
      [4, -5, 6],
      [0, -9, 6],
    ] as const) {
      ctx.fillStyle = shade(leaf, 0.8);
      ctx.beginPath();
      ctx.arc(x + 1, y + 1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = leaf;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (season === 3) {
      ctx.fillStyle = '#f1f5f7';
      ctx.beginPath();
      ctx.ellipse(0, -13, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (berries && season !== 3) {
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 3 === 0 ? '#5a2a6e' : '#c42b3a';
        ctx.beginPath();
        ctx.arc((rand() - 0.5) * 16, -3 - rand() * 10, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

// ------------------------------------------------------------------ buildings

const PLASTER_BASE = '#eadcbf';
const PLASTER = PLASTER_BASE;
const STONE = '#a8a093';
const WOOD = '#9a7247';
const BEAM = '#4a3020';

export function buildingSprite(type: BuildingType, w: number, h: number, level: number, season: Season, variant = 0): Sprite {
  const top = 200;
  const sw = (w + h) * (TW / 2) + 30;
  const sh = (w + h) * (TH / 2) + top + 14;
  let door: PenDoor | undefined;
  const sp = makeSprite(sw, sh, h * (TW / 2) + 15, top, (ctx) => {
    const p = new Pen(ctx);
    p.snow = season === 3;
    p.matFor = wallMaterial;
    const smoke = drawBuilding(p, type, level, season, variant);
    door = pickDoor(p, w, h, type);
    return smoke;
  });
  sp.door = door;
  return sp;
}

/**
 * The door to use from those drawn: the first proper door on a front wall,
 * else the front-most dark doorway standing on the ground. Doors on inner
 * walls (a porch, a lean-to) count only if they face out from the building.
 */
function pickDoor(p: Pen, w: number, h: number, type: BuildingType): PenDoor | undefined {
  if (DOOR_SPOTS[type]) return DOOR_SPOTS[type];
  const front = (d: PenDoor) => (d.face === 'L' ? d.plane > h * 0.4 : d.plane > w * 0.4);
  const real = p.doors.filter(front);
  if (real.length) return real[0];
  const rough = p.doorish.filter(front).sort((a, b) => b.plane - a.plane || (b.b - b.a) - (a.b - a.a));
  return rough[0];
}

/**
 * Doors the pictures draw in their own way (stall doors, tent flaps, a raised
 * granary door, the cathedral's portal), and the spot under the roof where
 * open sheds are entered.
 */
const DOOR_SPOTS: Partial<Record<BuildingType, PenDoor>> = {
  camp: { face: 'R', plane: 1.1, a: 1.65, b: 1.95, h: 11, open: true },
  cathedral: { face: 'L', plane: 5.752, a: 2.26, b: 2.74, h: 20 },
  granary: { face: 'L', plane: 1.722, a: 0.62, b: 0.92, h: 23, z0: 9 },
  stable: { face: 'L', plane: 1.052, a: 1.35, b: 1.77, h: 11, open: true },
  draughtstable: { face: 'L', plane: 1.222, a: 1.02, b: 1.42, h: 10, open: true },
  byre: { face: 'L', plane: 1.202, a: 0.85, b: 1.2, h: 11, open: true },
  stonemason: { face: 'L', plane: 1.0, a: 0.7, b: 1.0, h: 9, open: true },
  bloomery: { face: 'L', plane: 1.15, a: 0.7, b: 1.0, h: 9, open: true },
  tanner: { face: 'L', plane: 0.95, a: 0.7, b: 1.0, h: 9, open: true },
  kiln: { face: 'R', plane: 1.15, a: 0.8, b: 1.05, h: 7, open: true },
  builderyard: { face: 'L', plane: 0.722, a: 0.5, b: 1.0, h: 9, open: true },
  markethall: { face: 'L', plane: 2.85, a: 1.6, b: 2.2, h: 14, open: true },
  sandpit: { face: 'L', plane: 0.75, a: 0.6, b: 0.9, h: 9, open: true },
  limekiln: { face: 'L', plane: 1.5, a: 1.3, b: 1.7, h: 10, open: true },
  collier: { face: 'L', plane: 0.75, a: 0.3, b: 0.5, h: 9, open: true },
};

const DOORS = new Map<string, PenDoor | null>();

/** Where a building's door is drawn (local tile coordinates), for villagers to walk in by; cached. */
export function buildingDoor(s: GameState, b: Building): PenDoor | null {
  const v = variantOf(s, b);
  const key = `${b.type}:${b.w}:${b.h}:${b.level}:${v}`;
  let d = DOORS.get(key);
  if (d === undefined) {
    d = buildingSprite(b.type, b.w, b.h, b.level, 0, v).door ?? null;
    DOORS.set(key, d);
  }
  return d;
}

/** Which look a building's picture takes: the house forms and colours, the dock's side, the cathedral's glass. */
export function variantOf(s: GameState, b: Building): number {
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
  // Stained-glass windows once the town has them put in.
  if (b.type === 'church') return optionOn(s, 'windows') && (s.glazed ?? 0) > 0 ? 1 : 0;
  if (b.type !== 'house') return 0;
  const trade = b.trade ? HOME_TRADES.indexOf(b.trade) + 1 : 0;
  // Colours, yard, craft and the shape of the house, which the id picks.
  const forms = HOUSE_FORMS[Math.max(1, Math.min(4, b.level))] || 5;
  const form = (((b.id * 2654435761) >>> 0) >>> 7) % forms;
  return ((b.id * 7 + b.x) % 4) + 4 * Math.max(0, YARD_CODES.indexOf(b.yard ?? null)) + 16 * trade + 128 * form + (b.limewashed ? 1024 : 0);
}

/** Panes of stained glass: ruby, sapphire, gold, emerald. */
const GLASS = ['#b83a3a', '#3a5ab8', '#d8a83a', '#3a8a5a'];
/** Limewashed walls. */
const LIMEWASH = '#fbfaf5';

const STONE_COLORS = new Set([STONE, '#c8c0b0', '#9d9488', '#b0a898', '#b6ae9f', '#9d978c', '#a49c8e', '#c8c2b6', '#9b9284']);

/** Wall material for a box colour: stone greys, timber browns, plastered infill. */
function wallMaterial(color: string): Material | undefined {
  if (STONE_COLORS.has(color)) return 'stone';
  if (color === WOOD) return 'plank';
  if (color === PLASTER || color === '#e8d4b0' || color === LIMEWASH || HOUSE_VARIANTS.some((v) => v.wall === color)) return 'plaster';
  return undefined;
}

/** Wall colour, roof tint and yard prop for each house variant. */
type HouseExtra = 'flowers' | 'laundry' | 'bench' | 'both';
const HOUSE_VARIANTS: { wall: string; tint: { color: string; t: number } | null; roof2: 'shingle' | 'tile' | 'slate'; prop: 'logs' | 'hive' | 'cart' | 'well'; extra: HouseExtra }[] = [
  { wall: PLASTER_BASE, tint: null, roof2: 'shingle', prop: 'logs', extra: 'flowers' },
  { wall: '#dfbd88', tint: { color: '#5a3a1a', t: 0.35 }, roof2: 'tile', prop: 'hive', extra: 'laundry' },
  { wall: '#f6f2ea', tint: { color: '#f2d070', t: 0.32 }, roof2: 'slate', prop: 'cart', extra: 'bench' },
  { wall: '#dcb6a4', tint: { color: '#6a665e', t: 0.42 }, roof2: 'shingle', prop: 'logs', extra: 'both' },
];

/**
 * Small signs of the family inside: window boxes of flowers, washing on a
 * line, a bench by the door. `front` is the y of the front wall, `wins` the
 * x of the ground-floor windows and `wz` their sill height.
 */
function drawHouseExtra(p: Pen, extra: HouseExtra, season: Season, front: number, wins: number[], wz: number, door?: [number, number]): void {
  if (season === 3) {
    // Midwinter: an evergreen wreath on the door and a candle in each window.
    if (door) {
      const dx = door[0] + door[1] / 2;
      p.circle(dx, front + 0.01, 8, 2.4, '#3f6a3a');
      p.circle(dx, front + 0.012, 8, 1.2, '#5b3a22');
      p.circle(dx - 0.02, front + 0.014, 9.6, 0.6, '#c83a2a');
      p.circle(dx + 0.03, front + 0.014, 6.6, 0.5, '#c83a2a');
      p.line([dx, front + 0.014, 5.8], [dx, front + 0.014, 4.8], '#c83a2a', 0.8);
    }
    for (const x of wins) {
      p.line([x + 0.075, front + 0.01, wz + 0.4], [x + 0.075, front + 0.01, wz + 2.2], '#f2ece0', 1);
      p.circle(x + 0.075, front + 0.01, wz + 3, 1.6, 'rgba(255,200,90,0.45)');
      p.circle(x + 0.075, front + 0.01, wz + 2.8, 0.6, '#ffd860');
    }
  }
  if ((extra === 'flowers' || extra === 'both') && season !== 3) {
    const colors = season === 2 ? ['#d88a3a', '#b8482a'] : ['#e84a6a', '#f2d34a', '#f4f0e0', '#b97ae0'];
    for (const x of wins) {
      p.box(x - 0.03, front, x + 0.18, front + 0.06, wz - 2.5, 2.5, '#7b5a36');
      for (let k = 0; k < 4; k++) p.circle(x + 0.0 + k * 0.05, front + 0.05, wz + 0.6, 1.1, colors[k % colors.length]);
    }
  }
  if (extra === 'bench' || extra === 'both') {
    // A plank bench against the wall beside the door.
    p.box(1.1, front + 0.04, 1.42, front + 0.13, 2.5, 1.2, '#8a6a44');
    p.line([1.13, front + 0.12, 0], [1.13, front + 0.12, 2.5], '#5e4129', 1);
    p.line([1.39, front + 0.12, 0], [1.39, front + 0.12, 2.5], '#5e4129', 1);
  }
  if (extra === 'laundry' && season !== 3) {
    // Washing drying on a line between two posts by the house.
    const x = 1.98;
    p.line([x, 0.55, 0], [x, 0.55, 13], '#5e4129', 1.1);
    p.line([x, 1.45, 0], [x, 1.45, 13], '#5e4129', 1.1);
    p.line([x, 0.55, 12.5], [x, 1.45, 12], '#d8cfc0', 0.6);
    const cloth = ['#f2ece0', '#9ab0c8', '#c8a878', '#f2ece0'];
    for (let k = 0; k < 4; k++) {
      const y = 0.65 + k * 0.2;
      p.wallR(x + 0.01, y, y + 0.13, 7 + (k % 2) * 1.5, 12.2, cloth[k]);
    }
  }
}

function drawBuilding(p: Pen, type: BuildingType, level: number, season: Season, variant = 0): V3[] {
  const smoke: V3[] = [];
  return drawBuildingBody(p, type, level, season, variant, smoke);
}

function drawBuildingBody(p: Pen, type: BuildingType, level: number, season: Season, variant: number, smoke: V3[]): V3[] {
  switch (type) {
    case 'townhall': {
      drawManor(p, level, season, smoke);
      break;
    }
    case 'house':
      drawHome(p, level, variant, season, smoke);
      break;
    case 'field':
    case 'pasture':
    case 'orchard': {
      // Small previews for the build menu; in the world zones are drawn as ground.
      const ground = type === 'field' ? '#7a5a3a' : type === 'pasture' ? '#7da24a' : '#6e9a44';
      p.poly(
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
        ],
        ground,
      );
      if (type === 'field') {
        for (let r = 0; r < 4; r++) {
          const y = (r + 0.5) / 4;
          p.line([0.1, y, 0], [0.9, y, 0], '#5e4129', 1.2);
          p.line([0.1, y - 0.05, 3], [0.9, y - 0.05, 3], '#d8b44a', 5);
        }
      } else if (type === 'pasture') {
        p.fence([0, 1], [1, 1]);
        p.fence([1, 0], [1, 1]);
        drawSheep(p.ctx, ...iso(0.45, 0.55), 1);
        drawSheep(p.ctx, ...iso(0.7, 0.3), -1);
      } else {
        const t = fruitTreeSprite('apples', season, 1, true);
        const [tx, ty] = iso(0.5, 0.5);
        p.ctx.drawImage(t.canvas, tx - t.ax, ty - t.ay, t.w, t.h);
      }
      break;
    }
    case 'jeweller': {
      p.shadow(0.35, 0.35, 1.6, 1.4);
      p.box(0.4, 0.4, 1.45, 1.3, 0, 12, STONE);
      p.box(0.37, 0.37, 1.48, 1.33, 12, 13, '#dfbd88');
      p.timber(0.37, 0.37, 1.48, 1.33, 12, 13, BEAM);
      // A shop window with a striped awning and a golden sign.
      p.wallL(1.302, 0.5, 1.0, 3, 10, '#4a3020');
      p.wallL(1.303, 0.53, 0.97, 4, 9, '#f2c25a');
      p.poly(
        [
          [0.48, 1.31, 12],
          [1.02, 1.31, 12],
          [1.02, 1.5, 8],
          [0.48, 1.5, 8],
        ],
        '#2e5e9a',
      );
      for (let x = 0.55; x < 1.0; x += 0.12) p.poly([[x, 1.31, 12], [x + 0.06, 1.31, 12], [x + 0.06, 1.5, 8], [x, 1.5, 8]], '#f1e8d6');
      p.doorL(1.3, 1.1, 0.18, 10);
      p.roofX(0.37, 0.37, 1.48, 1.33, 25, 15, 'slate', '#dfbd88', 0.1);
      p.line([1.5, 1.2, 20], [1.66, 1.32, 20], '#3b2a1a', 1.2);
      const [rx, ry] = iso(1.62, 1.3, 14);
      p.ctx.strokeStyle = '#d8a838';
      p.ctx.lineWidth = 1.8;
      p.ctx.beginPath();
      p.ctx.arc(rx, ry, 3.2, 0, Math.PI * 2);
      p.ctx.stroke();
      smoke.push(p.chimney(0.7, 0.8, 33, 9));
      break;
    }
    case 'winery': {
      p.shadow(0.25, 0.3, 1.75, 1.6);
      p.box(0.3, 0.35, 1.5, 1.3, 0, 16, STONE);
      p.wallL(1.302, 0.6, 1.05, 0, 12, '#3a2a1e');
      p.roofX(0.3, 0.35, 1.5, 1.3, 16, 13, 'tile', STONE, 0.12);
      // Casks racked outside, a treading vat and a press.
      for (const [x, y] of [
        [1.65, 0.55],
        [1.75, 0.8],
        [1.65, 1.05],
      ]) p.barrel(x, y);
      const [vx, vy] = iso(0.7, 1.65, 0);
      p.ctx.fillStyle = '#7b5a36';
      p.ctx.beginPath();
      p.ctx.ellipse(vx, vy - 4, 12, 6, 0, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.fillStyle = season === 3 ? '#8a7a8a' : '#5a2a4a';
      p.ctx.beginPath();
      p.ctx.ellipse(vx, vy - 6, 10, 4.4, 0, 0, Math.PI * 2);
      p.ctx.fill();
      p.line([1.3, 1.55, 0], [1.3, 1.55, 14], '#5e4129', 2);
      p.line([1.3, 1.55, 14], [1.3, 1.85, 14], '#5e4129', 2);
      p.box(1.22, 1.6, 1.4, 1.8, 0, 6, '#6b4a2e');
      break;
    }
    case 'scriptorium': {
      p.shadow(0.3, 0.3, 1.7, 1.6);
      p.box(0.35, 0.35, 1.55, 1.45, 0, 24, '#b6ae9f');
      // Tall arched windows.
      for (const x of [0.55, 0.9, 1.25]) {
        p.wallL(1.452, x, x + 0.14, 8, 19, '#3a3a52');
        p.ellipse(x + 0.07, 1.453, 19, 2.2, 1.6, '#3a3a52');
      }
      p.windowR(1.55, 0.6, 10, 0.14, 9);
      p.doorR(1.55, 1.0, 0.2, 13);
      p.roofX(0.35, 0.35, 1.55, 1.45, 24, 18, 'slate', '#b6ae9f', 0.1);
      // A little bell-cote.
      p.box(1.38, 0.82, 1.5, 0.98, 42, 8, '#b6ae9f');
      p.roofPyramid(1.38, 0.82, 1.5, 0.98, 50, 6, 'slate', 0.02);
      // Flax drying for paper.
      p.line([0.4, 1.7, 0], [0.4, 1.7, 9], '#5e4129', 1);
      p.line([1.0, 1.7, 0], [1.0, 1.7, 9], '#5e4129', 1);
      p.line([0.4, 1.7, 9], [1.0, 1.7, 9], '#5e4129', 1);
      for (let k = 0; k < 5; k++) p.wallL(1.701, 0.45 + k * 0.105, 0.51 + k * 0.105, 3, 8.6, '#f4ecd8');
      break;
    }
    case 'armoury': {
      p.shadow(0.3, 0.3, 1.7, 1.5);
      p.box(0.35, 0.35, 1.5, 1.35, 0, 18, '#9d9488');
      p.wallL(1.352, 0.55, 1.05, 0, 13, '#2a2522');
      p.ctx.fillStyle = '#f08a2a';
      const [fx, fy] = iso(0.8, 1.355, 3);
      p.ctx.fillRect(fx - 6, fy - 3, 12, 3);
      p.roofX(0.35, 0.35, 1.5, 1.35, 18, 14, 'slate', '#9d9488', 0.1);
      smoke.push(p.chimney(1.2, 0.6, 26, 12));
      // Racks of pikes, bows and a shield.
      p.line([1.65, 0.5, 0], [1.65, 0.5, 10], '#5e4129', 1.2);
      p.line([1.65, 1.2, 0], [1.65, 1.2, 10], '#5e4129', 1.2);
      p.line([1.65, 0.5, 9], [1.65, 1.2, 9], '#5e4129', 1.2);
      for (let y = 0.58; y < 1.2; y += 0.1) {
        p.line([1.64, y, 0], [1.64, y + 0.02, 24], '#7a5230', 0.9);
        p.line([1.64, y + 0.02, 24], [1.64, y + 0.03, 27], '#b8bcc4', 1.4);
      }
      const [sx, sy] = iso(1.55, 1.5, 6);
      p.ctx.fillStyle = '#a8322d';
      p.ctx.beginPath();
      p.ctx.moveTo(sx - 5, sy - 6);
      p.ctx.lineTo(sx + 5, sy - 6);
      p.ctx.lineTo(sx + 4, sy + 2);
      p.ctx.lineTo(sx, sy + 6);
      p.ctx.lineTo(sx - 4, sy + 2);
      p.ctx.closePath();
      p.ctx.fill();
      p.ctx.fillStyle = '#e8c860';
      p.ctx.fillRect(sx - 1, sy - 5, 2, 9);
      p.ctx.fillRect(sx - 4, sy - 2, 8, 2);
      break;
    }
    case 'claypit': {
      // A dug pit by the water, clay heaps and a drying shelter.
      p.poly(
        [
          [0.3, 0.9, 0],
          [1.3, 0.9, 0],
          [1.3, 1.75, 0],
          [0.3, 1.75, 0],
        ],
        season === 3 ? '#c8c2bc' : '#8a5a38',
      );
      p.poly(
        [
          [0.45, 1.05, 0],
          [1.15, 1.05, 0],
          [1.15, 1.6, 0],
          [0.45, 1.6, 0],
        ],
        season === 3 ? '#b4aca4' : '#6e4428',
      );
      p.line([0.55, 1.3, 0], [0.75, 1.15, 9], '#6b4a2e', 1.2);
      // A heap of wet clay with a spade stuck in it.
      for (const [x, y, r] of [
        [1.55, 1.25, 11],
        [1.7, 1.55, 8],
      ] as const) {
        const [hx, hy] = iso(x, y, 0);
        const c = p.ctx;
        c.fillStyle = 'rgba(40,24,12,0.25)';
        c.beginPath();
        c.ellipse(hx + 2, hy + 1, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
        c.fill();
        const g = c.createLinearGradient(hx - r, 0, hx + r, 0);
        g.addColorStop(0, '#a8644a');
        g.addColorStop(1, '#7a4430');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(hx - r, hy);
        c.quadraticCurveTo(hx - r * 0.5, hy - r * 0.95, hx, hy - r * 0.9);
        c.quadraticCurveTo(hx + r * 0.6, hy - r * 0.85, hx + r, hy);
        c.quadraticCurveTo(hx, hy + r * 0.35, hx - r, hy);
        c.fill();
        c.strokeStyle = 'rgba(255,230,210,0.35)';
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(hx - r * 0.6, hy - r * 0.5);
        c.quadraticCurveTo(hx - r * 0.2, hy - r * 0.85, hx + r * 0.2, hy - r * 0.8);
        c.stroke();
      }
      p.line([1.6, 1.25, 7], [1.62, 1.22, 18], '#6b4a2e', 1.2);
      p.poly([[1.56, 1.25, 2], [1.66, 1.25, 2], [1.66, 1.25, 8], [1.56, 1.25, 8]], '#7a7e84');
      for (const [x, y] of [
        [0.3, 0.3],
        [1.2, 0.3],
        [0.3, 0.75],
        [1.2, 0.75],
      ]) p.line([x, y, 0], [x, y, 11], '#5e4129', 1.6);
      // Clay cakes drying on a plank rack under the thatch.
      p.box(0.38, 0.42, 1.12, 0.63, 4, 1.2, '#8a6440');
      p.line([0.4, 0.6, 0], [0.4, 0.6, 4], '#5e4129', 1);
      p.line([1.1, 0.6, 0], [1.1, 0.6, 4], '#5e4129', 1);
      for (let i = 0; i < 5; i++) p.box(0.42 + i * 0.14, 0.46, 0.53 + i * 0.14, 0.58, 5.2, 1.6, i % 2 ? '#b8785a' : '#a86a4c');
      p.roofX(0.3, 0.3, 1.2, 0.75, 11, 7, 'thatch', WOOD, 0.08);
      break;
    }
    case 'kiln': {
      p.shadow(0.3, 0.3, 1.7, 1.6);
      // Beehive kiln of brick with a glowing mouth.
      const [kx, ky] = iso(0.9, 0.9, 0);
      const c = p.ctx;
      c.fillStyle = '#9a5a40';
      c.beginPath();
      c.ellipse(kx, ky - 4, 26, 13, 0, 0, Math.PI);
      c.ellipse(kx, ky - 4, 26, 30, 0, Math.PI, 0);
      c.fill();
      // Courses of brick round the dome, with staggered joints.
      c.save();
      c.beginPath();
      c.ellipse(kx, ky - 4, 26, 13, 0, 0, Math.PI);
      c.ellipse(kx, ky - 4, 26, 30, 0, Math.PI, 0);
      c.clip();
      const shadeG = c.createLinearGradient(kx - 26, 0, kx + 26, 0);
      shadeG.addColorStop(0, 'rgba(255,220,190,0.12)');
      shadeG.addColorStop(1, 'rgba(40,10,0,0.3)');
      c.fillStyle = shadeG;
      c.fillRect(kx - 27, ky - 36, 54, 50);
      c.strokeStyle = 'rgba(70,30,18,0.55)';
      c.lineWidth = 0.7;
      for (let k = 0; k < 9; k++) {
        const h = k * 3.6;
        const w = 26 * Math.sqrt(Math.max(0, 1 - (h * h) / (30 * 30)));
        c.beginPath();
        c.ellipse(kx, ky - 4 - h, w, Math.max(1, w * 0.45), 0, 0, Math.PI);
        c.stroke();
        for (let j = -3; j <= 3; j++) {
          const jx = kx + ((j + (k % 2) * 0.5) * w) / 3.6;
          c.beginPath();
          c.moveTo(jx, ky - 4 - h + Math.max(1, w * 0.45) * Math.sqrt(Math.max(0, 1 - ((jx - kx) / Math.max(1, w)) ** 2)));
          c.lineTo(jx, ky - 4 - h - 3.6 + Math.max(1, w * 0.45) * Math.sqrt(Math.max(0, 1 - ((jx - kx) / Math.max(1, w)) ** 2)));
          c.stroke();
        }
      }
      c.restore();
      c.fillStyle = '#2a1a10';
      c.beginPath();
      c.ellipse(kx + 6, ky + 4, 7, 6, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = '#f08a2a';
      c.fillRect(kx + 1, ky + 1, 10, 3);
      smoke.push([0.9, 0.9, 38]);
      // Stacks of finished tiles and firewood.
      tileStack(p, 1.4, 0.8, 3);
      tileStack(p, 1.35, 1.25, 4);
      p.logPile(0.4, 1.7, 2);
      break;
    }
    case 'stonemason': {
      p.shadow(0.2, 0.2, 1.7, 1.7);
      for (const [x, y] of [
        [0.3, 0.3],
        [1.5, 0.3],
        [0.3, 0.95],
        [1.5, 0.95],
      ]) p.line([x, y, 0], [x, y, 14], '#5e4129', 2);
      // A block on the banker under the roof, finished blocks and rubble outside.
      p.box(0.7, 0.55, 1.0, 0.8, 0, 6, '#7b5a36');
      p.box(0.72, 0.57, 0.98, 0.78, 6, 5, '#cac4b6');
      p.roofX(0.3, 0.3, 1.5, 0.95, 14, 9, 'shingle', WOOD, 0.08);
      cutBlocks(p, 0.35, 1.25, 3);
      cutBlocks(p, 0.45, 1.6, 2);
      for (const [x, y, r] of [[1.35, 1.35, 4.5], [1.55, 1.45, 4], [1.4, 1.6, 3.5]] as const) rockLump(p, x, y, r, '#a8a49a', 7);
      p.line([1.05, 1.6, 0], [1.2, 1.7, 8], '#6b4a2e', 1.3);
      break;
    }
    case 'carpenter': {
      p.shadow(0.3, 0.3, 1.65, 1.4);
      p.box(0.3, 0.35, 1.45, 1.35, 0, 16, WOOD);
      p.timber(0.3, 0.35, 1.45, 1.35, 0, 16, BEAM);
      p.wallL(1.352, 0.5, 1.1, 0, 12, '#3a2a1e');
      p.roofX(0.3, 0.35, 1.45, 1.35, 16, 15, 'shingle', WOOD, 0.12);
      smoke.push(p.chimney(1.15, 0.7, 24, 9));
      // A cartwheel and a stack of beams.
      const [wx, wy] = iso(1.65, 0.9, 7);
      const c = p.ctx;
      c.strokeStyle = '#5e3e22';
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(wx, wy, 6, 7, 0, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 0.8;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        c.beginPath();
        c.moveTo(wx, wy);
        c.lineTo(wx + Math.cos(a) * 6, wy + Math.sin(a) * 7);
        c.stroke();
      }
      for (let i = 0; i < 3; i++) p.box(0.45, 1.6, 1.25, 1.75, i * 2.2, 2, i % 2 ? '#c8a46c' : '#b8945c');
      break;
    }
    case 'bloomery': {
      p.shadow(0.3, 0.3, 1.7, 1.6);
      // A squat clay shaft furnace under an open shed, bellows and ore.
      for (const [x, y] of [
        [0.3, 0.3],
        [1.4, 0.3],
        [0.3, 1.2],
        [1.4, 1.2],
      ]) p.line([x, y, 0], [x, y, 18], '#5e4129', 2);
      const [fx, fy] = iso(0.85, 0.75, 0);
      const c = p.ctx;
      c.fillStyle = '#8a5a40';
      c.beginPath();
      c.moveTo(fx - 11, fy);
      c.lineTo(fx - 7, fy - 26);
      c.lineTo(fx + 7, fy - 26);
      c.lineTo(fx + 11, fy);
      c.closePath();
      c.fill();
      c.fillStyle = '#6e4430';
      c.fillRect(fx + 2, fy - 26, 5, 26);
      c.fillStyle = '#f0a03a';
      c.beginPath();
      c.ellipse(fx, fy - 3, 3.5, 3, 0, 0, Math.PI * 2);
      c.fill();
      smoke.push([0.85, 0.75, 30]);
      // Bellows by the furnace.
      p.box(1.05, 0.62, 1.28, 0.82, 0, 5, '#6b4a2e');
      p.line([1.05, 0.72, 4], [0.95, 0.75, 3], '#4a3020', 1.2);
      p.roofX(0.3, 0.3, 1.4, 1.2, 18, 8, 'plank', WOOD, 0.08);
      oreHeap(p, 1.6, 1.35, 5);
      p.logPile(0.45, 1.6, 2);
      break;
    }
    case 'windmill': {
      // Post mill: a stone base, a boarded body and four lattice sails.
      p.shadow(0.4, 0.4, 1.6, 1.6);
      p.box(0.55, 0.55, 1.45, 1.45, 0, 10, STONE);
      p.box(0.62, 0.62, 1.38, 1.38, 10, 30, WOOD);
      p.doorL(1.38, 0.9, 0.18, 9);
      p.windowL(1.38, 0.8, 26, 0.12, 5);
      p.roofX(0.62, 0.62, 1.38, 1.38, 40, 14, 'shingle', WOOD, 0.06);
      // Sails turn on a hub at the front face; a working mill gets them drawn turning, frame by frame.
      if (variant !== 1) {
        const [hx, hy] = iso(1.0, 1.42, 34);
        drawSails(p.ctx, hx, hy, 0, season);
      }
      p.sack(1.65, 1.3, '#efe6d4');
      p.sack(1.75, 1.5, '#e8dcc4');
      break;
    }
    case 'brewhouse': {
      p.shadow(0.25, 0.3, 1.7, 1.4);
      p.box(0.3, 0.35, 1.45, 1.35, 0, 8, STONE);
      p.box(0.3, 0.35, 1.45, 1.35, 8, 12, PLASTER);
      p.timber(0.3, 0.35, 1.45, 1.35, 8, 12, BEAM);
      p.doorL(1.35, 0.75, 0.2, 10);
      p.windowL(1.35, 0.45, 12, 0.13, 5, season === 3);
      p.windowR(1.45, 0.7, 12, 0.13, 5);
      p.roofX(0.3, 0.35, 1.45, 1.35, 20, 15, 'tile', PLASTER, 0.12);
      // A tall louvred vent lets the steam out of the copper.
      p.box(0.85, 0.75, 1.05, 0.95, 30, 6, WOOD);
      p.roofPyramid(0.85, 0.75, 1.05, 0.95, 36, 5, 'tile', 0.03);
      smoke.push([0.95, 0.85, 40]);
      for (const [x, y] of [
        [1.6, 0.6],
        [1.7, 0.85],
        [1.55, 1.1],
        [1.75, 1.4],
      ]) p.barrel(x, y);
      p.sack(0.45, 1.65, '#d8c070');
      break;
    }
    case 'dairy': {
      p.shadow(0.35, 0.35, 1.55, 1.35);
      p.box(0.4, 0.4, 1.45, 1.3, 0, 14, STONE);
      p.doorL(1.3, 0.8, 0.18, 10);
      p.windowR(1.45, 0.7, 6, 0.12, 4);
      p.roofX(0.4, 0.4, 1.45, 1.3, 14, 13, 'slate', STONE, 0.1);
      // Cheese wheels maturing on a rack and milk churns.
      p.box(0.45, 1.5, 1.05, 1.65, 0, 2, '#7b5a36');
      p.box(0.45, 1.5, 1.05, 1.65, 6, 1.5, '#7b5a36');
      for (const x of [0.55, 0.75, 0.95]) {
        p.ellipse(x, 1.57, 2, 4, 2.2, '#f0c850');
        p.ellipse(x, 1.57, 7.5, 3.6, 2, '#e8c040');
      }
      for (const [x, y] of [
        [1.6, 1.0],
        [1.7, 1.2],
      ]) {
        p.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 8, '#b8bcc0');
        p.ellipse(x, y, 8, 2.5, 1.2, '#8a8e94');
      }
      break;
    }
    case 'tanner': {
      p.shadow(0.2, 0.2, 1.7, 1.7);
      // Lean-to over the pits.
      for (const [x, y] of [
        [0.3, 0.3],
        [1.4, 0.3],
        [0.3, 0.9],
        [1.4, 0.9],
      ]) p.line([x, y, 0], [x, y, 13], '#5e4129', 2);
      p.barrel(0.6, 0.6);
      p.roofX(0.3, 0.3, 1.4, 0.9, 13, 7, 'plank', WOOD, 0.08);
      // Tanning pits in the yard.
      for (const [x, y, c] of [
        [0.35, 1.15, '#5a3a20'],
        [0.8, 1.15, '#6e4a26'],
        [0.35, 1.5, '#4a5a3a'],
        [0.8, 1.5, '#5a3a20'],
      ] as [number, number, string][]) {
        p.poly(
          [
            [x, y, 0],
            [x + 0.32, y, 0],
            [x + 0.32, y + 0.28, 0],
            [x, y + 0.28, 0],
          ],
          '#7b6a54',
        );
        p.poly(
          [
            [x + 0.04, y + 0.04, 0],
            [x + 0.28, y + 0.04, 0],
            [x + 0.28, y + 0.24, 0],
            [x + 0.04, y + 0.24, 0],
          ],
          c,
        );
      }
      // Hides stretched on frames.
      for (const y of [1.2, 1.5]) {
        p.line([1.45, y - 0.12, 0], [1.45, y - 0.12, 14], '#5e4129', 1.2);
        p.line([1.45, y + 0.12, 0], [1.45, y + 0.12, 14], '#5e4129', 1.2);
        p.wallR(1.45, y - 0.1, y + 0.1, 3, 13, y > 1.3 ? '#b88a5a' : '#9a6a40');
      }
      break;
    }
    case 'weaver': {
      p.shadow(0.3, 0.3, 1.65, 1.4);
      p.box(0.3, 0.35, 1.5, 1.35, 0, 16, PLASTER);
      p.timber(0.3, 0.35, 1.5, 1.35, 0, 16, BEAM);
      // A wide window to weave by.
      p.wallL(1.352, 0.42, 0.95, 5, 12, '#4a3020');
      p.wallL(1.353, 0.45, 0.92, 6, 11, season === 3 ? '#e0b04e' : '#3a3540');
      p.line([0.55, 1.354, 6], [0.55, 1.354, 11], '#c8b890', 0.6);
      p.line([0.8, 1.354, 6], [0.8, 1.354, 11], '#c8b890', 0.6);
      p.doorL(1.35, 1.1, 0.18, 10);
      p.roofX(0.3, 0.35, 1.5, 1.35, 16, 15, 'thatch', PLASTER, 0.12);
      smoke.push(p.chimney(1.25, 0.8, 24, 10));
      // Bolts of cloth and bales of wool.
      for (const [x, y, c] of [
        [1.65, 0.7, '#5a7ab0'],
        [1.75, 0.95, '#8a3b2e'],
        [1.6, 1.2, '#c8b890'],
      ] as [number, number, string][]) {
        p.line([x, y - 0.12, 3], [x, y + 0.12, 3], c, 5);
      }
      p.sack(0.45, 1.65, '#f2ece0');
      p.sack(0.65, 1.75, '#ece4d4');
      break;
    }
    case 'tailor': {
      p.shadow(0.35, 0.3, 1.65, 1.4);
      p.box(0.4, 0.4, 1.4, 1.3, 0, 12, STONE);
      p.box(0.35, 0.35, 1.45, 1.35, 12, 12, '#dfbd88');
      p.timber(0.35, 0.35, 1.45, 1.35, 12, 12, BEAM);
      p.doorL(1.3, 0.75, 0.2, 10);
      p.windowL(1.3, 0.48, 4, 0.14, 5, true);
      p.windowL(1.35, 0.55, 15, 0.12, 5);
      p.windowL(1.35, 1.05, 15, 0.12, 5);
      p.roofX(0.35, 0.35, 1.45, 1.35, 24, 15, 'shingle', '#dfbd88', 0.12);
      smoke.push(p.chimney(0.65, 0.85, 32, 10));
      // Shop sign: a boot.
      p.line([1.46, 1.3, 18], [1.62, 1.42, 18], '#3b2a1a', 1.2);
      const [bx, by] = iso(1.58, 1.4, 12);
      p.ctx.fillStyle = '#6a3e22';
      p.ctx.fillRect(bx - 2, by - 5, 3, 5);
      p.ctx.fillRect(bx - 2, by - 1, 6, 2);
      // Market trestle with cloth.
      p.box(1.55, 0.5, 1.9, 0.9, 6, 1.5, '#8a6236');
      p.line([1.6, 0.85, 0], [1.6, 0.85, 6], '#5e4129', 1);
      p.line([1.85, 0.85, 0], [1.85, 0.85, 6], '#5e4129', 1);
      p.box(1.6, 0.55, 1.75, 0.85, 7.5, 2, '#8a3b2e');
      p.box(1.76, 0.55, 1.88, 0.85, 7.5, 2, '#4a6a9a');
      // A gown of woad-blue with gold trim on the dress form at the door.
      {
        const [gx, gy] = iso(1.62, 1.55, 0);
        const c = p.ctx;
        c.fillStyle = 'rgba(30,24,12,0.22)';
        c.beginPath();
        c.ellipse(gx + 1, gy, 4.5, 1.8, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#5e4129';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(gx, gy);
        c.lineTo(gx, gy - 3);
        c.stroke();
        c.fillStyle = '#2f4fa8';
        c.beginPath();
        c.moveTo(gx - 1.6, gy - 15);
        c.lineTo(gx + 1.6, gy - 15);
        c.lineTo(gx + 1.2, gy - 11);
        c.lineTo(gx + 4, gy - 3);
        c.lineTo(gx - 4, gy - 3);
        c.lineTo(gx - 1.2, gy - 11);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(0,0,30,0.25)';
        c.beginPath();
        c.moveTo(gx + 0.4, gy - 11);
        c.lineTo(gx + 1.2, gy - 11);
        c.lineTo(gx + 4, gy - 3);
        c.lineTo(gx + 1.2, gy - 3);
        c.closePath();
        c.fill();
        c.strokeStyle = '#e0b840';
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(gx - 1.3, gy - 11);
        c.lineTo(gx + 1.3, gy - 11);
        c.moveTo(gx - 4, gy - 3.2);
        c.lineTo(gx + 4, gy - 3.2);
        c.stroke();
        c.fillStyle = '#8a6440';
        c.fillRect(gx - 0.6, gy - 16.6, 1.2, 1.8);
      }
      break;
    }
    case 'apothecary': {
      p.shadow(0.4, 0.3, 1.5, 1.3);
      p.box(0.45, 0.35, 1.35, 1.25, 0, 11, STONE);
      p.box(0.42, 0.32, 1.38, 1.28, 11, 14, PLASTER);
      p.timber(0.42, 0.32, 1.38, 1.28, 11, 14, BEAM);
      p.wallL(1.252, 0.75, 0.95, 0, 10, '#2e5a3a');
      p.windowL(1.25, 0.5, 4, 0.13, 5, true);
      p.windowL(1.28, 0.6, 16, 0.12, 5);
      p.windowR(1.38, 0.7, 16, 0.12, 5);
      p.roofX(0.42, 0.32, 1.38, 1.28, 25, 17, 'slate', PLASTER, 0.1);
      smoke.push(p.chimney(1.0, 0.7, 33, 9));
      // A physic garden of herb beds.
      for (let i = 0; i < 3; i++) {
        p.poly(
          [
            [0.4 + i * 0.4, 1.45, 0],
            [0.7 + i * 0.4, 1.45, 0],
            [0.7 + i * 0.4, 1.85, 0],
            [0.4 + i * 0.4, 1.85, 0],
          ],
          season === 3 ? '#cfd4d4' : '#6e5038',
        );
        if (season !== 3) {
          for (let j = 0; j < 2; j++) p.bush(0.55 + i * 0.4, 1.55 + j * 0.18, 2.2, ['#6aa04a', '#8a9a5a', '#a07ab8'][i]);
        }
      }
      break;
    }
    case 'byre': {
      // Open-fronted cattle shed with a hay loft and a fenced pen.
      p.shadow(0.25, 0.25, 1.75, 1.2);
      p.box(0.25, 0.25, 1.75, 1.2, 0, 15, WOOD);
      p.wallL(1.202, 0.5, 1.5, 0, 11, '#2e2218');
      for (const x of [0.5, 1.0, 1.5]) p.line([x, 1.21, 0], [x, 1.21, 15], BEAM, 2);
      // Hay inside.
      p.wallL(1.205, 0.55, 1.45, 0, 4, '#c9a54e');
      p.roofX(0.25, 0.25, 1.75, 1.2, 15, 14, 'thatch', WOOD, 0.14);
      p.fence([0.2, 1.95], [1.9, 1.95]);
      p.fence([1.9, 1.3], [1.9, 1.95]);
      // Trough.
      p.box(0.4, 1.5, 0.95, 1.62, 0, 3, '#7b5a36');
      p.wallL(1.621, 0.42, 0.93, 2, 3, '#5a7a9a');
      if (season !== 3) {
        const [hx, hy] = iso(1.55, 1.6, 0);
        p.ctx.fillStyle = '#c9a54e';
        p.ctx.beginPath();
        p.ctx.ellipse(hx, hy - 4, 7, 6, 0, Math.PI, 0);
        p.ctx.lineTo(hx + 7, hy);
        p.ctx.lineTo(hx - 7, hy);
        p.ctx.fill();
      }
      p.sack(0.3, 1.75, '#d8c79c');
      break;
    }
    case 'orchardist': {
      p.shadow(0.3, 0.35, 1.6, 1.4);
      p.box(0.35, 0.35, 1.5, 1.3, 0, 14, '#e8d4b0');
      p.timber(0.35, 0.35, 1.5, 1.3, 0, 14, BEAM);
      p.doorL(1.3, 0.8, 0.18, 10);
      p.windowL(1.3, 0.48, 5, 0.13, 4, season === 3);
      p.windowR(1.5, 0.7, 5, 0.13, 4);
      p.roofX(0.35, 0.35, 1.5, 1.3, 14, 14, 'tile', '#e8d4b0', 0.12);
      smoke.push(p.chimney(0.65, 0.9, 20, 10));
      // Ladder against the wall, baskets of fruit and a cider barrel.
      p.line([1.52, 0.5, 0], [1.52, 0.42, 16], '#7b5a36', 1);
      p.line([1.52, 0.62, 0], [1.52, 0.54, 16], '#7b5a36', 1);
      for (let z = 2; z < 15; z += 3) p.line([1.52, 0.5 - z * 0.005, z], [1.52, 0.62 - z * 0.005, z], '#7b5a36', 0.8);
      for (const [x, y, c] of [
        [1.65, 1.0, '#c4322a'],
        [1.8, 1.25, '#b8c040'],
        [1.5, 1.6, '#6a3a80'],
      ] as [number, number, string][]) {
        const [sx, sy] = iso(x, y, 0);
        p.ctx.fillStyle = '#a07a40';
        p.ctx.beginPath();
        p.ctx.ellipse(sx, sy - 3, 5, 4, 0, 0, Math.PI);
        p.ctx.fill();
        p.ctx.fillStyle = season === 3 ? '#e8ecee' : c;
        p.ctx.beginPath();
        p.ctx.ellipse(sx, sy - 3, 4.5, 2, 0, 0, Math.PI * 2);
        p.ctx.fill();
      }
      p.barrel(0.45, 1.6);
      p.barrel(0.62, 1.75);
      break;
    }
    case 'woodcutter': {
      p.shadow(0.3, 0.3, 1.3, 1.2);
      p.box(0.3, 0.3, 1.3, 1.2, 0, 15, WOOD, undefined, 'log');
      p.doorL(1.2, 0.6, 0.18, 11);
      p.windowR(1.3, 0.6, 7, 0.14, 4);
      p.roofX(0.3, 0.3, 1.3, 1.2, 15, 13, 'shingle', WOOD, 0.12);
      smoke.push(p.chimney(0.55, 0.85, 20, 10, '#7f7468'));
      p.logPile(1.45, 0.7, 3);
      p.logPile(0.4, 1.75, 2);
      // Chopping block with an axe.
      p.box(1.4, 1.5, 1.55, 1.65, 0, 5, '#7b5a36');
      p.line([1.47, 1.57, 5], [1.6, 1.5, 14], '#6b4a2e', 1.4);
      p.poly(
        [
          [1.58, 1.5, 12],
          [1.66, 1.48, 16],
          [1.66, 1.48, 10],
        ],
        '#b8bcc0',
      );
      break;
    }
    case 'forester': {
      p.shadow(0.3, 0.3, 1.2, 1.1);
      p.box(0.3, 0.3, 1.2, 1.1, 0, 14, PLASTER);
      p.timber(0.3, 0.3, 1.2, 1.1, 0, 14, BEAM);
      p.doorL(1.1, 0.65, 0.17, 10);
      p.windowR(1.2, 0.55, 6, 0.13, 4);
      p.roofX(0.3, 0.3, 1.2, 1.1, 14, 13, 'thatch', PLASTER, 0.12);
      // Sapling nursery.
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          const x = 0.35 + i * 0.35;
          const y = 1.45 + j * 0.3;
          p.line([x, y, 0], [x, y, 5], '#5e4129', 1);
          const [sx, sy] = iso(x, y, 7);
          p.ctx.fillStyle = season === 3 ? '#6e7d68' : season === 2 ? '#b08a30' : '#4f9a3a';
          p.ctx.beginPath();
          p.ctx.moveTo(sx - 3.5, sy + 3);
          p.ctx.lineTo(sx, sy - 6);
          p.ctx.lineTo(sx + 3.5, sy + 3);
          p.ctx.fill();
        }
      }
      p.sack(1.45, 0.6, '#9b8a5a');
      break;
    }
    case 'quarry': {
      // A stepped face cut into the rock, a derrick to lift the blocks,
      // cut stone stacked to go and the rubble of the work.
      const ROCK = '#9a968c';
      // The outcrop being worked, and the pale ledge cut out of it.
      for (const [x, y, r] of [[0.35, 0.3, 15], [0.95, 0.15, 17], [1.55, 0.3, 15], [0.2, 0.75, 11], [1.8, 0.75, 10]] as const) rockLump(p, x, y, r, ROCK, 2);
      p.box(0.45, 0.45, 1.45, 0.75, 0, 9, '#b8b2a6', '#c4beb2');
      for (let k = 0; k < 5; k++) p.wallL(0.752, 0.5 + k * 0.19, 0.56 + k * 0.19, 2, 7, 'rgba(60,55,45,0.2)');
      p.box(0.6, 0.75, 1.3, 0.95, 0, 4, '#b8b2a6', '#c4beb2');
      // Rubble on the floor of the cut.
      for (const [x, y, r] of [[1.55, 1.0, 4], [1.7, 1.1, 3], [0.35, 1.1, 3.5]] as const) rockLump(p, x, y, r, ROCK, 5);
      // Derrick: two legs and a jib with a block on the rope.
      p.line([1.35, 1.0, 0], [1.5, 1.15, 30], '#5e4129', 1.6);
      p.line([1.7, 1.25, 0], [1.5, 1.15, 30], '#5e4129', 1.6);
      p.line([1.5, 1.15, 30], [1.15, 0.85, 26], '#5e4129', 1.4);
      p.line([1.17, 0.87, 26], [1.17, 0.87, 15], '#c8b48c', 0.6);
      p.box(1.08, 0.8, 1.26, 0.94, 10, 5, '#cfc8b8');
      cutBlocks(p, 0.45, 1.45, 3);
      cutBlocks(p, 1.25, 1.6, 2);
      // A pick leaning on the stack.
      p.line([1.05, 1.62, 0], [1.08, 1.6, 10], '#6b4a2e', 1.1);
      p.line([1.0, 1.6, 10], [1.16, 1.62, 9], '#6a6e74', 1.2);
      break;
    }
    case 'mine': {
      // A bog-iron pit dug down into flat, wet ground: timbered edges, a
      // ladder down the cut face, a windlass to haul the ore up, rusty water
      // in the bottom and heaps of ore and spoil beside it.
      const c = p.ctx;
      const x0 = 0.25;
      const y0 = 0.25;
      const x1 = 1.4;
      const y1 = 1.3;
      const D = -16;
      // Trampled mud round the pit.
      p.poly([[0.1, 0.1, 0], [1.9, 0.1, 0], [1.9, 1.9, 0], [0.1, 1.9, 0]], season === 3 ? 'rgba(220,226,226,0.6)' : 'rgba(110,80,50,0.35)');
      c.save();
      p.path([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
      c.clip();
      // The pit floor with its puddle, then the cut faces at the back and side.
      p.poly([[x0, y0, D], [x1, y0, D], [x1, y1, D], [x0, y1, D]], '#3a2a1e');
      p.poly([[x0 + 0.3, y0 + 0.3, D], [x1 - 0.15, y0 + 0.3, D], [x1 - 0.15, y1 - 0.1, D], [x0 + 0.3, y1 - 0.1, D]], season === 3 ? '#c8d4d8' : '#8a5a34');
      p.poly([[x0 + 0.35, y0 + 0.35, D], [x1 - 0.25, y0 + 0.35, D], [x1 - 0.25, y1 - 0.2, D], [x0 + 0.35, y1 - 0.2, D]], season === 3 ? '#dfe8ec' : 'rgba(200,120,60,0.55)');
      p.poly([[x0, y0, 0], [x1, y0, 0], [x1, y0, D], [x0, y0, D]], '#7a5236');
      p.poly([[x0, y0, 0], [x0, y1, 0], [x0, y1, D], [x0, y0, D]], '#6a4630');
      // Bands of rusty ore in the cut, and shoring planks.
      for (const z of [-4, -9, -13]) {
        p.line([x0, y0 + 0.002, z], [x1, y0 + 0.002, z], z === -9 ? '#c0703a' : '#5a3a26', z === -9 ? 2 : 0.8);
        p.line([x0 + 0.002, y0, z], [x0 + 0.002, y1, z], z === -9 ? '#a85e30' : '#4a3020', z === -9 ? 2 : 0.8);
      }
      for (const x of [0.5, 0.95, 1.3]) p.line([x, y0 + 0.004, 0], [x, y0 + 0.004, D], '#5e4129', 1.6);
      // A ladder down the back face.
      p.line([1.1, y0 + 0.02, 3], [1.1, y0 + 0.25, D], '#8a6440', 1);
      p.line([1.22, y0 + 0.02, 3], [1.22, y0 + 0.25, D], '#8a6440', 1);
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        p.line([1.1, y0 + 0.02 + 0.23 * t, 3 + (D - 3) * t], [1.22, y0 + 0.02 + 0.23 * t, 3 + (D - 3) * t], '#8a6440', 0.8);
      }
      oreHeap(p, 0.6, 0.8, 3);
      c.restore();
      // Timber kerb round the edge.
      p.box(x0 - 0.05, y1, x1 + 0.05, y1 + 0.06, 0, 2, '#6b4a2c');
      p.box(x1, y0 - 0.05, x1 + 0.06, y1 + 0.05, 0, 2, '#6b4a2c');
      p.line([x0, y0, 1], [x1, y0, 1], '#6b4a2c', 1.6);
      p.line([x0, y0, 1], [x0, y1, 1], '#6b4a2c', 1.6);
      // The windlass across the pit, its rope and bucket.
      // Its posts stand on firm ground either side of the pit.
      for (const x of [0.16, 1.49]) {
        p.line([x, 0.78, 0], [x, 0.78, 14], '#5e4129', 1.8);
        p.line([x, 0.66, 0], [x, 0.78, 10], '#5e4129', 1);
        p.line([x, 0.9, 0], [x, 0.78, 10], '#5e4129', 1);
      }
      p.line([0.12, 0.78, 13], [1.53, 0.78, 13], '#6b4a2c', 3);
      p.line([1.53, 0.78, 13], [1.6, 0.86, 10], '#5e4129', 1.2);
      p.line([0.85, 0.78, 12], [0.85, 0.78, -2], '#c8b48c', 0.6);
      p.box(0.8, 0.73, 0.9, 0.83, -5, 4, '#6b4a2c');
      // Heaps of bog ore and spoil, and a barrow.
      oreHeap(p, 1.65, 0.55, 6);
      oreHeap(p, 1.7, 1.15, 5);
      const [hx, hy] = iso(0.55, 1.65, 0);
      c.fillStyle = season === 3 ? '#e8ecee' : '#7a5a3a';
      c.beginPath();
      c.moveTo(hx - 14, hy);
      c.quadraticCurveTo(hx, hy - 14, hx + 14, hy);
      c.quadraticCurveTo(hx, hy + 5, hx - 14, hy);
      c.fill();
      p.box(1.0, 1.55, 1.25, 1.75, 3, 3, '#8a6236');
      p.circle(1.28, 1.65, 2.5, 2, '#4a3020');
      p.line([1.0, 1.6, 4], [0.85, 1.6, 2], '#6b4a2e', 1);
      p.line([1.0, 1.72, 4], [0.85, 1.72, 2], '#6b4a2e', 1);
      oreHeap(p, 1.12, 1.62, 2);
      // Reeds at the wet edge.
      if (season !== 3) {
        for (const [rx, ry] of [[0.2, 1.45], [0.3, 1.5], [1.85, 1.75], [1.75, 1.85]] as const) {
          p.line([rx, ry, 0], [rx - 0.02, ry, 9], '#6a8a3a', 0.8);
          p.line([rx, ry, 0], [rx + 0.03, ry, 8], '#7a9a44', 0.8);
        }
      }
      break;
    }
    case 'forager': {
      p.shadow(0.4, 0.4, 1.3, 1.2);
      p.box(0.4, 0.4, 1.3, 1.2, 0, 12, PLASTER);
      p.timber(0.4, 0.4, 1.3, 1.2, 0, 12, BEAM);
      p.doorL(1.2, 0.75, 0.16, 9);
      p.roofX(0.4, 0.4, 1.3, 1.2, 12, 14, 'thatch', PLASTER, 0.14);
      // Baskets of berries.
      for (const [x, y] of [
        [1.5, 1.0],
        [1.65, 1.25],
        [1.3, 1.55],
      ]) {
        const [sx, sy] = iso(x, y, 0);
        p.ctx.fillStyle = '#a07a40';
        p.ctx.beginPath();
        p.ctx.ellipse(sx, sy - 3, 5, 4, 0, 0, Math.PI);
        p.ctx.fill();
        p.ctx.fillStyle = '#b23040';
        p.ctx.beginPath();
        p.ctx.ellipse(sx, sy - 3, 4.5, 2, 0, 0, Math.PI * 2);
        p.ctx.fill();
      }
      p.bush(0.4, 1.6, 4, season === 3 ? '#8d9a86' : '#4d8a3a');
      break;
    }
    case 'hunter': {
      p.shadow(0.3, 0.3, 1.2, 1.1);
      p.box(0.3, 0.3, 1.2, 1.1, 0, 12, WOOD, undefined, 'log');
      p.doorL(1.1, 0.6, 0.17, 10);
      p.roofX(0.3, 0.3, 1.2, 1.1, 12, 16, 'shingle', WOOD, 0.12);
      // Antlers over the door.
      const [ax, ay] = iso(0.7, 1.1, 14);
      p.ctx.strokeStyle = '#e6dcc4';
      p.ctx.lineWidth = 1;
      p.ctx.beginPath();
      p.ctx.moveTo(ax - 4, ay - 4);
      p.ctx.lineTo(ax, ay);
      p.ctx.lineTo(ax + 4, ay - 4);
      p.ctx.moveTo(ax - 3, ay - 2);
      p.ctx.lineTo(ax - 5, ay - 2);
      p.ctx.moveTo(ax + 3, ay - 2);
      p.ctx.lineTo(ax + 5, ay - 2);
      p.ctx.stroke();
      // Drying rack with hides.
      p.line([1.4, 1.2, 0], [1.4, 1.2, 14], '#5e4129', 1.4);
      p.line([1.4, 1.8, 0], [1.4, 1.8, 14], '#5e4129', 1.4);
      p.line([1.4, 1.2, 14], [1.4, 1.8, 14], '#5e4129', 1.4);
      p.wallR(1.4, 1.27, 1.48, 4, 13, '#9a6a40');
      p.wallR(1.4, 1.55, 1.74, 5, 13, '#b88a5a');
      // Bow.
      p.line([0.4, 1.5, 0], [0.5, 1.5, 12], '#4a3020', 1.2);
      break;
    }
    case 'fisher': {
      p.shadow(0.3, 0.3, 1.2, 1.1);
      p.box(0.3, 0.3, 1.2, 1.1, 0, 13, WOOD);
      p.doorL(1.1, 0.55, 0.17, 10);
      p.windowR(1.2, 0.5, 6, 0.13, 4);
      p.roofX(0.3, 0.3, 1.2, 1.1, 13, 12, 'thatch', WOOD, 0.12);
      // Net rack.
      p.line([1.4, 0.4, 0], [1.4, 0.4, 13], '#5e4129', 1.3);
      p.line([1.4, 1.1, 0], [1.4, 1.1, 13], '#5e4129', 1.3);
      p.line([1.4, 0.4, 13], [1.4, 1.1, 13], '#5e4129', 1.3);
      p.ctx.strokeStyle = 'rgba(70,60,50,0.7)';
      p.ctx.lineWidth = 0.5;
      for (let i = 0; i <= 6; i++) {
        const y = 0.45 + i * 0.1;
        const [x1, y1] = iso(1.4, y, 12);
        const [x2, y2] = iso(1.4, y, 3);
        p.ctx.beginPath();
        p.ctx.moveTo(x1, y1);
        p.ctx.lineTo(x2, y2);
        p.ctx.stroke();
      }
      for (let z = 4; z <= 12; z += 2) p.line([1.4, 0.45, z], [1.4, 1.05, z], 'rgba(70,60,50,0.7)', 0.5);
      // Upturned boat.
      const [bx, by] = iso(0.75, 1.65, 0);
      p.ctx.fillStyle = '#6b4a2e';
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 3, 15, 5, -0.46, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.fillStyle = '#8a6440';
      p.ctx.beginPath();
      p.ctx.ellipse(bx, by - 4.5, 13, 3.5, -0.46, 0, Math.PI * 2);
      p.ctx.fill();
      p.barrel(1.55, 1.55);
      break;
    }
    case 'farm': {
      // Farmhouse in the back quadrant; fields are drawn as ground.
      p.shadow(0.3, 0.3, 1.7, 1.5);
      p.box(0.3, 0.35, 1.7, 1.4, 0, 16, PLASTER);
      p.timber(0.3, 0.35, 1.7, 1.4, 0, 16, BEAM);
      p.doorL(1.4, 0.7, 0.18, 11);
      p.windowL(1.4, 1.2, 6, 0.14, 5, season === 3);
      p.windowR(1.7, 0.7, 6, 0.14, 5);
      p.roofX(0.3, 0.35, 1.7, 1.4, 16, 16, 'thatch', PLASTER, 0.13);
      smoke.push(p.chimney(0.6, 1.0, 22, 12));
      // Haystack.
      if (season === 1 || season === 2) {
        const [hx, hy] = iso(1.85, 0.55, 0);
        p.ctx.fillStyle = '#c9a54e';
        p.ctx.beginPath();
        p.ctx.ellipse(hx, hy - 7, 9, 9, 0, Math.PI, 0);
        p.ctx.lineTo(hx + 9, hy);
        p.ctx.lineTo(hx - 9, hy);
        p.ctx.fill();
        p.ctx.fillStyle = '#ddb95e';
        p.ctx.beginPath();
        p.ctx.ellipse(hx - 2, hy - 9, 5, 5, 0, Math.PI, 0);
        p.ctx.fill();
      }
      p.sack(1.85, 1.2, '#d8c79c');
      p.sack(1.95, 1.35, '#cdbb8e');
      break;
    }
    case 'bakery': {
      p.shadow(0.3, 0.3, 1.7, 1.3);
      p.box(0.3, 0.3, 1.4, 1.3, 0, 18, PLASTER);
      p.timber(0.3, 0.3, 1.4, 1.3, 0, 18, BEAM);
      p.doorL(1.3, 0.75, 0.18, 11);
      p.windowL(1.3, 0.45, 7, 0.14, 5, true);
      p.roofX(0.3, 0.3, 1.4, 1.3, 18, 14, 'tile', PLASTER, 0.12);
      // The oven's flue runs up the gable wall, above the eaves.
      smoke.push(p.chimney(1.4, 0.62, 0, 34, '#9b8a78'));
      // Domed oven on the side.
      const [ox, oy] = iso(1.6, 0.85, 0);
      p.ctx.fillStyle = '#b39a80';
      p.ctx.beginPath();
      p.ctx.ellipse(ox, oy - 2, 13, 9, 0, Math.PI, 0);
      p.ctx.lineTo(ox + 13, oy + 2);
      p.ctx.lineTo(ox - 13, oy + 2);
      p.ctx.fill();
      p.ctx.fillStyle = '#c9b298';
      p.ctx.beginPath();
      p.ctx.ellipse(ox - 3, oy - 6, 6, 4, 0, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.fillStyle = '#2a1a10';
      p.ctx.beginPath();
      p.ctx.ellipse(ox + 2, oy - 1, 4, 4, 0, Math.PI, 0);
      p.ctx.fill();
      p.ctx.fillStyle = '#f08a2a';
      p.ctx.fillRect(ox - 1, oy - 2, 5, 2);
      p.sack(0.5, 1.6);
      p.sack(0.7, 1.7);
      p.crate(1.0, 1.55);
      break;
    }
    case 'sawmill': {
      p.shadow(0.2, 0.3, 1.6, 1.3);
      for (const [x, y] of [
        [0.3, 0.2],
        [1.5, 0.2],
        [0.3, 0.95],
        [1.5, 0.95],
      ]) {
        p.line([x, y, 0], [x, y, 16], '#5e4129', 2.2);
      }
      // Sawhorse and log inside.
      p.box(0.6, 0.5, 1.3, 0.65, 0, 7, '#7b5a36');
      p.line([0.55, 0.58, 10], [1.35, 0.58, 10], '#8a6236', 5);
      p.roofX(0.3, 0.2, 1.5, 0.95, 16, 12, 'shingle', WOOD, 0.1);
      // Planks stacked out in front, clear of the posts, and logs waiting.
      for (let i = 0; i < 3; i++) p.box(0.45, 1.4, 1.15, 1.62, i * 2.4, 2.2, i % 2 ? '#d7b47c' : '#c8a46c');
      p.logPile(1.45, 1.75, 2);
      break;
    }
    case 'smithy': {
      p.shadow(0.3, 0.3, 1.6, 1.4);
      p.box(0.3, 0.3, 1.5, 1.3, 0, 17, '#9d9488');
      for (let z = 4; z < 17; z += 4.5) {
        p.line([0.3, 1.3, z], [1.5, 1.3, z], '#7d756a', 0.5);
        p.line([1.5, 0.3, z], [1.5, 1.3, z], '#6d665c', 0.5);
      }
      // Open forge glow.
      p.wallL(1.302, 0.55, 1.05, 0, 11, '#2a1a12');
      p.wallL(1.303, 0.62, 0.98, 1, 6, '#e8742a');
      p.roofX(0.3, 0.3, 1.5, 1.3, 17, 13, 'slate', '#9d9488', 0.1);
      smoke.push(p.chimney(1.1, 0.5, 18, 18, '#7a7064'));
      // Anvil.
      p.box(1.2, 1.55, 1.35, 1.65, 0, 4, '#5e4129');
      p.box(1.16, 1.53, 1.4, 1.67, 4, 3, '#4a4d52');
      p.barrel(0.45, 1.6);
      p.crate(1.65, 0.6);
      break;
    }
    case 'well': {
      const [cx, cy] = iso(0.5, 0.5, 0);
      const c = p.ctx;
      c.fillStyle = 'rgba(30,30,10,0.25)';
      c.beginPath();
      c.ellipse(cx + 3, cy + 2, 15, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#8f877a';
      c.fillRect(cx - 12, cy - 9, 24, 9);
      c.beginPath();
      c.ellipse(cx, cy, 12, 6, 0, 0, Math.PI);
      c.fill();
      c.fillStyle = '#b0a898';
      c.beginPath();
      c.ellipse(cx, cy - 9, 12, 6, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2e4a5a';
      c.beginPath();
      c.ellipse(cx, cy - 9, 9, 4.2, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#6d6558';
      c.lineWidth = 0.6;
      for (let i = -9; i <= 9; i += 6) {
        c.beginPath();
        c.moveTo(cx + i, cy - 8);
        c.lineTo(cx + i, cy + 2);
        c.stroke();
      }
      p.line([0.22, 0.5, 0], [0.22, 0.5, 26], '#5e4129', 1.8);
      p.line([0.78, 0.5, 0], [0.78, 0.5, 26], '#5e4129', 1.8);
      p.line([0.22, 0.5, 20], [0.78, 0.5, 20], '#4a3020', 1.4);
      p.line([0.5, 0.5, 20], [0.5, 0.5, 13], '#4a3020', 0.6);
      p.box(0.46, 0.46, 0.54, 0.54, 10, 3, '#7b5a36');
      p.roofX(0.15, 0.3, 0.85, 0.7, 26, 9, 'shingle', WOOD, 0.06);
      break;
    }
    case 'tavern': {
      if (level < 2) {
        // The alehouse: a low thatched cottage, an ale-stake (a bush on a pole)
        // over the door to say there is ale, a bench, a barrel and a trestle.
        p.shadow(0.5, 0.45, 2.3, 1.75);
        p.poly([[0.4, 1.75, 0], [2.6, 1.75, 0], [2.6, 2.6, 0], [0.4, 2.6, 0]], season === 3 ? '#d4d8d6' : '#b0a07a');
        p.box(0.55, 0.5, 2.25, 1.65, 0, 12, PLASTER);
        p.timber(0.55, 0.5, 2.25, 1.65, 0, 12, BEAM);
        p.doorL(1.65, 1.15, 0.22, 10);
        p.windowL(1.65, 0.72, 4, 0.18, 4, true);
        p.windowL(1.65, 1.75, 4, 0.18, 4, true);
        p.windowR(2.25, 0.85, 4, 0.16, 4);
        p.roofX(0.55, 0.5, 2.25, 1.65, 12, 10, 'thatch', PLASTER, 0.1);
        smoke.push(p.chimney(1.95, 0.75, 16, 10));
        // The ale-stake, leaning out from the wall over the door.
        p.line([1.32, 1.66, 11], [1.32, 2.05, 15], '#5e4129', 1.2);
        p.circle(1.32, 2.08, 15.5, 2.6, season === 3 ? '#5a6a50' : '#4f7a34');
        // Bench against the wall, a barrel by the door, a trestle table outside.
        p.box(1.6, 1.7, 2.15, 1.82, 0, 3, '#7a5a3a');
        p.barrel(0.85, 1.95);
        p.box(1.5, 2.15, 2.25, 2.4, 4, 1, '#8a6440');
        for (const [x, y] of [[1.55, 2.2], [2.2, 2.2], [1.55, 2.35], [2.2, 2.35]] as const) p.line([x, y, 0], [x, y, 4], '#5e4129', 0.8);
        break;
      }
      p.shadow(0.3, 0.3, 2.5, 1.9);
      // Beer garden in front.
      p.poly(
        [
          [0.2, 2.0, 0],
          [2.8, 2.0, 0],
          [2.8, 2.85, 0],
          [0.2, 2.85, 0],
        ],
        season === 3 ? '#d4d8d6' : '#a89870',
      );
      p.box(0.35, 0.35, 2.4, 1.85, 0, 8, STONE);
      p.box(0.3, 0.3, 2.45, 1.9, 8, 18, '#e8d4b0');
      p.timber(0.3, 0.3, 2.45, 1.9, 8, 18, BEAM);
      p.doorL(1.85, 1.15, 0.24, 13);
      for (const x of [0.5, 0.8, 1.7, 2.05]) p.windowL(1.85, x, 4, 0.16, 6, true);
      for (const x of [0.5, 0.9, 1.5, 1.95]) p.windowL(1.9, x, 14, 0.14, 6);
      p.windowR(2.4, 0.7, 4, 0.16, 6, true);
      p.windowR(2.45, 1.2, 14, 0.14, 6);
      p.roofX(0.3, 0.3, 2.45, 1.9, 26, 22, 'thatch', '#e8d4b0', 0.14);
      smoke.push(p.chimney(0.7, 1.25, 32, 16, '#8a7d70'));
      // Hanging sign with a tankard.
      p.line([2.45, 1.95, 22], [2.7, 2.1, 22], '#3b2a1a', 1.4);
      p.wallR(2.6, 1.98, 2.24, 11, 20, '#7a4a28');
      const [sx, sy] = iso(2.6, 2.11, 15.5);
      p.ctx.fillStyle = '#e8c860';
      p.ctx.fillRect(sx - 2, sy - 3, 4, 5);
      // Benches, tables and barrels.
      for (const x of [0.55, 1.55]) {
        p.box(x, 2.25, x + 0.6, 2.45, 6, 2, '#8a6236');
        p.line([x + 0.05, 2.35, 0], [x + 0.05, 2.35, 6], '#5e4129', 1.2);
        p.line([x + 0.55, 2.35, 0], [x + 0.55, 2.35, 6], '#5e4129', 1.2);
        p.box(x, 2.55, x + 0.6, 2.62, 3, 1.5, '#7b5a36');
      }
      p.barrel(2.55, 2.3);
      p.barrel(2.65, 2.55);
      break;
    }
    case 'camp': {
      // Three canvas tents round a fire; the wood, stone and food they keep
      // are drawn live beside them.
      const tent = (x: number, y: number, cloth: string) => {
        const c0 = p.snow ? '#eef2f4' : cloth;
        p.shadow(x - 0.05, y - 0.05, x + 0.85, y + 0.75);
        // Back slope, then the side facing us and the open front.
        p.poly([[x, y, 0], [x + 0.8, y, 0], [x + 0.8, y + 0.35, 17], [x, y + 0.35, 17]], shade(c0, 0.8), shade(cloth, 0.5));
        p.poly([[x, y + 0.7, 0], [x + 0.8, y + 0.7, 0], [x + 0.8, y + 0.35, 17], [x, y + 0.35, 17]], shade(c0, 1), shade(cloth, 0.55));
        // Seams down the canvas.
        for (const t of [0.27, 0.54]) p.line([x + 0.8 * t, y + 0.7, 0], [x + 0.8 * t, y + 0.35, 17], shade(cloth, 0.78), 0.6);
        p.poly([[x + 0.8, y, 0], [x + 0.8, y + 0.7, 0], [x + 0.8, y + 0.35, 17]], shade(cloth, 0.68), shade(cloth, 0.5));
        // The flaps tied back from a dark doorway.
        p.poly([[x + 0.8, y + 0.2, 0], [x + 0.8, y + 0.5, 0], [x + 0.8, y + 0.35, 11]], '#3a2c20');
        p.poly([[x + 0.8, y + 0.5, 0], [x + 0.86, y + 0.62, 0], [x + 0.8, y + 0.35, 11]], shade(cloth, 0.9));
        // Ridge pole ends and guy ropes to pegs.
        p.line([x + 0.8, y + 0.35, 0], [x + 0.8, y + 0.35, 20], '#5e4129', 1.1);
        p.line([x - 0.02, y + 0.35, 0], [x - 0.02, y + 0.35, 19], '#5e4129', 1.1);
        p.line([x + 0.8, y + 0.35, 19], [x + 1.0, y + 0.35, 0], '#8a7a60', 0.5);
        p.line([x + 0.4, y + 0.7, 8], [x + 0.4, y + 0.9, 0], '#8a7a60', 0.5);
      };
      tent(0.25, 0.2, '#d8cfb8');
      tent(1.55, 0.25, '#c8b48c');
      tent(0.3, 1.45, '#e0d6c0');
      // A fire ring between the tents (its smoke rises live), a log to sit on.
      for (let k = 0; k < 8; k++) p.circle(1.45 + Math.cos(k * 0.785) * 0.17, 1.3 + Math.sin(k * 0.785) * 0.17, 0, 1.5, '#8a8478');
      p.circle(1.45, 1.3, 1, 2.4, season === 3 ? '#8a7060' : '#e8742a');
      p.circle(1.45, 1.3, 2, 1.2, season === 3 ? '#6a5a50' : '#f8c040');
      p.line([1.25, 1.62, 2], [1.7, 1.62, 2], '#6b4626', 4);
      // A tripod and pot over the fire.
      p.line([1.33, 1.2, 0], [1.45, 1.3, 14], '#4a3020', 0.9);
      p.line([1.57, 1.22, 0], [1.45, 1.3, 14], '#4a3020', 0.9);
      p.line([1.45, 1.44, 0], [1.45, 1.3, 14], '#4a3020', 0.9);
      p.circle(1.45, 1.3, 6, 2.2, '#3a3430');
      smoke.push([1.45, 1.3, 4]);
      break;
    }
    case 'tradingpost': {
      // A merchants' hall: stone ground floor, timber loft with a hoist,
      // a covered loading bay, bales and casks for the road, and a pennant.
      p.poly(
        [
          [0.1, 1.2, 0],
          [2.9, 1.2, 0],
          [2.9, 1.95, 0],
          [0.1, 1.95, 0],
        ],
        season === 3 ? '#d4d8d6' : '#a89a7a',
      );
      p.shadow(0.25, 0.2, 2.1, 1.15);
      p.box(0.25, 0.2, 2.1, 1.15, 0, 12, STONE, undefined, 'stone');
      p.box(0.25, 0.2, 2.1, 1.15, 12, 13, PLASTER);
      p.timber(0.25, 0.2, 2.1, 1.15, 12, 13, BEAM);
      p.doorL(1.15, 0.85, 0.32, 11);
      p.windowL(1.15, 0.45, 16, 0.18, 6);
      p.windowL(1.15, 1.6, 16, 0.18, 6);
      p.windowR(2.1, 0.5, 16, 0.18, 6);
      p.roofX(0.25, 0.2, 2.1, 1.15, 25, 18, 'tile', PLASTER, 0.12);
      // Hoist beam over the loft door.
      p.line([1.0, 1.15, 31], [1.0, 1.45, 31], '#4a3020', 1.6);
      p.line([1.0, 1.45, 31], [1.0, 1.45, 22], '#6b5a44', 0.6);
      p.box(0.93, 1.4, 1.07, 1.5, 19, 3, '#c8a46c');
      // Lean-to loading bay on posts.
      for (const [x, y] of [
        [2.2, 0.3],
        [2.85, 0.3],
        [2.2, 1.1],
        [2.85, 1.1],
      ] as const)
        p.line([x, y, 0], [x, y, 14], '#5e4129', 1.4);
      p.poly(
        [
          [2.1, 0.25, 17],
          [2.92, 0.25, 13],
          [2.92, 1.15, 13],
          [2.1, 1.15, 17],
        ],
        p.snow ? '#eef2f4' : '#8a5a3a',
        '#4a3020',
      );
      // Bales and crates on the forecourt, ready for the carts.
      bale(p, 0.45, 1.4, '#d8c8a0');
      bale(p, 0.5, 1.62, '#c8b48c');
      p.crate(1.55, 1.42, 0.18);
      p.crate(1.78, 1.5, 0.15);
      p.crate(2.35, 1.35, 0.16);
      p.flag(2.85, 1.85, 0, 30, '#c8962a');
      break;
    }
    case 'storehouse': {
      // Barn at the back, open stacking yard in front (piles drawn live).
      p.poly(
        [
          [0.15, 1.45, 0],
          [2.85, 1.45, 0],
          [2.85, 2.9, 0],
          [0.15, 2.9, 0],
        ],
        season === 3 ? '#d4d8d6' : '#a8946a',
      );
      p.fence([0.15, 2.92], [1.1, 2.92]);
      p.fence([1.9, 2.92], [2.85, 2.92]);
      p.fence([2.92, 1.45], [2.92, 2.85]);
      p.shadow(0.3, 0.25, 2.7, 1.35);
      p.box(0.3, 0.25, 2.7, 1.35, 0, 22, WOOD);
      p.timber(0.3, 0.25, 2.7, 1.35, 0, 22, '#5a3a22');
      // Big barn doors.
      p.wallL(1.352, 1.15, 1.85, 0, 17, '#5b3a22');
      p.line([1.15, 1.354, 0], [1.85, 1.354, 17], '#3d2614', 1);
      p.line([1.85, 1.354, 0], [1.15, 1.354, 17], '#3d2614', 1);
      p.line([1.5, 1.354, 0], [1.5, 1.354, 17], '#3d2614', 1);
      p.roofX(0.3, 0.25, 2.7, 1.35, 22, 22, 'shingle', WOOD, 0.14);
      break;
    }
    case 'granary': {
      // A square granary raised on staddle stones to keep the rats out, its
      // door reached by detached stone steps, a hoist for the sacks.
      const BOARD = '#b88a52';
      p.shadow(0.25, 0.25, 1.75, 1.75);
      for (const x of [0.38, 1.0, 1.62]) {
        for (const y of [0.38, 1.0, 1.62]) {
          p.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 5, '#9a9288');
          p.ellipse(x, y, 6, 4.5, 1.8, '#aaa296');
        }
      }
      p.box(0.25, 0.25, 1.75, 1.75, 7, 2, '#6b4a2c');
      p.box(0.28, 0.28, 1.72, 1.72, 9, 20, BOARD);
      // Weatherboards and corner posts.
      for (let z = 12; z < 29; z += 2.6) {
        p.line([0.28, 1.72, z], [1.72, 1.72, z], '#8a6236', 0.55);
        p.line([1.72, 0.28, z], [1.72, 1.72, z], '#7a5230', 0.55);
      }
      for (const t of [0.28, 1.0, 1.72]) {
        p.line([t, 1.72, 9], [t, 1.72, 29], '#5a3a22', 1.4);
        p.line([1.72, t, 9], [1.72, t, 29], '#4e3220', 1.4);
      }
      // Loft door on the front, steps leading up beside it (with a gap).
      p.wallL(1.722, 0.62, 0.92, 9, 23, '#5b3a22');
      p.line([0.77, 1.724, 9], [0.77, 1.724, 23], '#3d2614', 0.7);
      for (let k = 0; k < 3; k++) p.box(0.58, 1.86 + k * 0.1, 0.96, 1.96 + k * 0.1, 0, 7.5 - k * 2.4, '#a8a093');
      // Vents high on the right side.
      for (const y of [0.55, 1.25]) p.wallR(1.722, y, y + 0.18, 22, 25, '#3a2a1c');
      p.roofX(0.28, 0.28, 1.72, 1.72, 29, 30, 'thatch', BOARD, 0.2);
      // A hatch in the gable, and the hoist beam over it with its rope.
      p.wallR(1.724, 0.88, 1.12, 33, 41, '#4a3020');
      p.line([1.72, 1.0, 47], [2.02, 1.0, 47], '#5a3a22', 2);
      p.line([1.99, 1.0, 47], [1.99, 1.0, 30], '#c8b48c', 0.6);
      p.line([1.96, 1.0, 30], [2.02, 1.0, 30], '#5a3a22', 1);
      break;
    }
    case 'silo': {
      // A round tower of stone and boards under a conical cap, a ladder up its side.
      p.shadow(0.3, 0.3, 1.7, 1.7);
      const ctx = p.ctx;
      const cyl = (r: number, z0: number, z1: number, col: string) => {
        const rx = r * (TW / 2) * Math.SQRT2;
        const ry = r * (TH / 2) * Math.SQRT2;
        const [cx, cb] = iso(1, 1, z0);
        const [, ct] = iso(1, 1, z1);
        const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
        g.addColorStop(0, shade(col, 1.05));
        g.addColorStop(0.45, shade(col, 0.95));
        g.addColorStop(1, shade(col, 0.62));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cb, rx, ry, 0, 0, Math.PI);
        ctx.lineTo(cx - rx, ct);
        ctx.ellipse(cx, ct, rx, ry, 0, Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = shade(col, 0.5);
        ctx.lineWidth = 0.6;
        ctx.stroke();
        return { cx, ct, rx, ry };
      };
      cyl(0.62, 0, 8, STONE);
      const body = cyl(0.56, 8, 52, '#b8925c');
      // Hoops and boards.
      ctx.strokeStyle = 'rgba(70,45,25,0.55)';
      ctx.lineWidth = 0.7;
      for (const z of [18, 30, 42]) {
        const [, hy] = iso(1, 1, z);
        ctx.beginPath();
        ctx.ellipse(body.cx, hy, body.rx, body.ry, 0, 0, Math.PI);
        ctx.stroke();
      }
      // A conical thatched cap.
      const [, apex] = iso(1, 1, 76);
      const cap = ctx.createLinearGradient(body.cx - body.rx, 0, body.cx + body.rx, 0);
      const roof = p.snow ? '#eef2f4' : ROOF_COLORS.thatch;
      cap.addColorStop(0, shade(roof, 1.08));
      cap.addColorStop(1, shade(roof, 0.65));
      ctx.fillStyle = cap;
      ctx.beginPath();
      ctx.moveTo(body.cx - body.rx * 1.18, body.ct);
      ctx.ellipse(body.cx, body.ct, body.rx * 1.18, body.ry * 1.18, 0, Math.PI, 0, true);
      ctx.lineTo(body.cx, apex);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(ROOF_COLORS.thatch, 0.45);
      ctx.stroke();
      // Ladder and hatch on the near side.
      p.line([1.42, 1.42, 4], [1.42, 1.42, 50], '#5b3a22', 1);
      p.line([1.5, 1.34, 4], [1.5, 1.34, 50], '#5b3a22', 1);
      for (let z = 8; z < 50; z += 6) p.line([1.42, 1.42, z], [1.5, 1.34, z], '#5b3a22', 0.8);
      p.wallL(1.56, 0.85, 1.1, 40, 48, '#5b3a22');
      p.sack(1.75, 0.55, '#e8dcc4');
      p.sack(1.8, 0.35, '#d8c79c');
      break;
    }
    case 'market': {
      p.poly(
        [
          [0.1, 0.1, 0],
          [2.9, 0.1, 0],
          [2.9, 2.9, 0],
          [0.1, 2.9, 0],
        ],
        season === 3 ? '#d6dadb' : '#b5a88e',
      );
      for (let i = 1; i < 7; i++) {
        p.line([0.1, i * 0.4 + 0.1, 0], [2.9, i * 0.4 + 0.1, 0], 'rgba(90,75,55,0.25)', 0.5);
        p.line([i * 0.4 + 0.1, 0.1, 0], [i * 0.4 + 0.1, 2.9, 0], 'rgba(90,75,55,0.25)', 0.5);
      }
      const stall = (x: number, y: number, color: string, goods: string[]) => {
        for (const [px, py] of [
          [x, y],
          [x + 0.8, y],
          [x, y + 0.6],
          [x + 0.8, y + 0.6],
        ]) {
          p.line([px, py, 0], [px, py, 15], '#5e4129', 1.4);
        }
        p.box(x + 0.05, y + 0.35, x + 0.75, y + 0.6, 0, 7, '#8a6440');
        goods.forEach((g, i) => {
          const [gx, gy] = iso(x + 0.15 + i * 0.2, y + 0.47, 8);
          p.ctx.fillStyle = g;
          p.ctx.beginPath();
          p.ctx.ellipse(gx, gy, 3.5, 2, 0, 0, Math.PI * 2);
          p.ctx.fill();
        });
        // Striped awning.
        const stripes = 6;
        for (let i = 0; i < stripes; i++) {
          const x0 = x - 0.05 + (i * 0.9) / stripes;
          const x1 = x0 + 0.9 / stripes;
          p.poly(
            [
              [x0, y - 0.05, 18],
              [x1, y - 0.05, 18],
              [x1, y + 0.7, 13],
              [x0, y + 0.7, 13],
            ],
            p.snow ? (i % 2 ? '#f2f5f6' : '#e2e7e9') : i % 2 ? '#f1e8d6' : color,
          );
        }
      };
      stall(0.3, 0.3, '#b03a2e', ['#c42b3a', '#e0b040', '#7aa040']);
      stall(1.7, 0.3, '#2e5e9a', ['#c8a46c', '#d8c79c', '#8a6236']);
      stall(0.3, 1.8, '#3d7a3a', ['#d8c79c', '#e8742a', '#c42b3a']);
      // Centre cross.
      p.box(1.45, 1.45, 1.6, 1.6, 0, 4, '#9b9284');
      p.box(1.49, 1.49, 1.56, 1.56, 4, 20, '#a8a093');
      p.box(1.42, 1.49, 1.63, 1.56, 17, 3, '#a8a093');
      p.barrel(2.3, 2.1);
      p.barrel(2.5, 2.3);
      p.crate(2.0, 2.4);
      p.sack(2.6, 1.8);
      break;
    }
    case 'church': {
      if (level <= 1) {
        // Wooden Church: a boarded nave under a steep shingle roof, a timber
        // bell tower at the back and a little porch at the door.
        p.shadow(0.6, 0.35, 2.45, 3.85);
        p.box(1.1, 0.4, 1.9, 1.2, 0, 34, WOOD);
        p.wallL(1.202, 1.3, 1.7, 26, 33, '#2a2018');
        p.wallR(1.902, 0.6, 1.0, 26, 33, '#241a14');
        const [bx, by] = iso(1.5, 1.2, 27);
        p.ctx.fillStyle = '#c89a38';
        p.ctx.beginPath();
        p.ctx.moveTo(bx - 3, by + 4);
        p.ctx.quadraticCurveTo(bx - 2.5, by - 3, bx, by - 3);
        p.ctx.quadraticCurveTo(bx + 2.5, by - 3, bx + 3, by + 4);
        p.ctx.fill();
        p.roofPyramid(1.1, 0.4, 1.9, 1.2, 34, 30, 'shingle', 0.08);
        p.line([1.5, 0.8, 64], [1.5, 0.8, 74], '#5a3a22', 1.4);
        p.line([1.45, 0.85, 70.5], [1.55, 0.75, 70.5], '#5a3a22', 1.4);
        // The nave.
        p.box(0.75, 1.15, 2.25, 3.55, 0, 3, STONE);
        p.box(0.78, 1.18, 2.22, 3.52, 3, 19, WOOD);
        for (const y of [1.5, 2.1, 2.7, 3.25]) p.line([2.22, y, 3], [2.22, y, 22], '#5a3a22', 1.4);
        [1.7, 2.3, 2.9].forEach((y, k) => {
          p.wallR(2.222, y, y + 0.14, 9, 17, '#2e2a38');
          p.wallR(2.223, y + 0.02, y + 0.12, 10, 16, season === 3 ? '#e8b850' : variant ? GLASS[k % GLASS.length] : '#6a7a9a');
        });
        p.roofY(0.78, 1.18, 2.22, 3.52, 22, 30, 'shingle', WOOD, 0.12);
        // A carved cross on the gable and a gabled porch at the door.
        p.line([1.5, 3.525, 34], [1.5, 3.525, 44], '#5a3a22', 1.4);
        p.line([1.42, 3.525, 40], [1.58, 3.525, 40], '#5a3a22', 1.4);
        p.box(1.25, 3.52, 1.75, 3.85, 0, 2, '#9b9284');
        for (const x of [1.28, 1.72]) p.line([x, 3.83, 2], [x, 3.83, 13], BEAM, 1.4);
        p.wallL(3.522, 1.38, 1.62, 2, 14, '#4a2f1b');
        p.roofY(1.24, 3.5, 1.76, 3.88, 13, 8, 'shingle', WOOD, 0.04);
        break;
      }
      p.shadow(0.4, 0.2, 2.6, 3.7);
      // Bell tower at the back.
      p.box(0.95, 0.25, 2.05, 1.3, 0, 70, '#b0a898', undefined, 'stone');
      // Belfry openings.
      p.wallL(1.302, 1.3, 1.7, 52, 64, '#2a2522');
      p.wallR(2.052, 0.6, 0.95, 52, 64, '#221e1b');
      p.roofPyramid(0.95, 0.25, 2.05, 1.3, 70, 46, 'slate');
      // Cross.
      p.line([1.5, 0.775, 116], [1.5, 0.775, 130], '#d8b84a', 1.6);
      p.line([1.5 - 0.06, 0.775 + 0.06, 125], [1.5 + 0.06, 0.775 - 0.06, 125], '#d8b84a', 1.6);
      // Nave.
      p.box(0.6, 1.2, 2.4, 3.65, 0, 32, '#b6ae9f');
      // Buttresses and tall windows.
      [1.6, 2.2, 2.8, 3.4].forEach((y, k) => {
        p.box(2.4, y - 0.05, 2.5, y + 0.05, 0, 20, '#a49c8e');
        p.wallR(2.402, y + 0.12, y + 0.26, 10, 26, '#3a3a52');
        p.wallR(2.403, y + 0.14, y + 0.24, 11, 25, season === 3 ? '#e8b850' : variant ? GLASS[k % GLASS.length] : '#5a6a9a');
        // Stained glass: leading across the panes.
        if (variant && season !== 3) p.line([2.404, y + 0.14, 18], [2.404, y + 0.24, 18], '#2a2a3a', 0.6);
      });
      // Front gable with door and rose window.
      p.roofY(0.6, 1.2, 2.4, 3.65, 32, 26, 'slate', '#b6ae9f', 0.1);
      p.wallL(3.652, 1.3, 1.7, 0, 18, '#4a2f1b');
      p.line([1.5, 3.654, 0], [1.5, 3.654, 18], '#2e1d10', 0.8);
      const [rx, ry] = iso(1.5, 3.652, 38);
      p.ctx.fillStyle = '#3a3a52';
      p.ctx.beginPath();
      p.ctx.arc(rx, ry, 5, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.fillStyle = season === 3 ? '#e8b850' : '#7a5a9a';
      p.ctx.beginPath();
      p.ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
      p.ctx.fill();
      if (variant && season !== 3) {
        // A rose of coloured petals.
        for (let k = 0; k < 6; k++) {
          p.ctx.fillStyle = GLASS[k % GLASS.length];
          p.ctx.beginPath();
          p.ctx.moveTo(rx, ry);
          p.ctx.arc(rx, ry, 3.5, (k * Math.PI) / 3, ((k + 1) * Math.PI) / 3);
          p.ctx.fill();
        }
        p.ctx.fillStyle = '#e8c860';
        p.ctx.beginPath();
        p.ctx.arc(rx, ry, 1.1, 0, Math.PI * 2);
        p.ctx.fill();
      }
      break;
    }
    case 'monastery': {
      // A chapel with windows of coloured glass, a cloister walk round a
      // quiet garth with its well, the monks' range, and their herbs and bees.
      const winter = season === 3;
      const ST = '#b6ae9f';
      p.shadow(0.2, 0.2, 3.9, 3.9);
      // The garth: lawn quartered by paths, a well where they cross.
      p.poly([[0.4, 1.4, 0], [2.85, 1.4, 0], [2.85, 3.45, 0], [0.4, 3.45, 0]], winter ? '#e4e8e8' : '#7aa84a');
      p.poly([[1.68, 1.65, 0], [1.88, 1.65, 0], [1.88, 3.45, 0], [1.68, 3.45, 0]], winter ? '#d4d8d8' : '#d2c6a6');
      p.poly([[0.7, 2.45, 0], [2.85, 2.45, 0], [2.85, 2.65, 0], [0.7, 2.65, 0]], winter ? '#d4d8d8' : '#d2c6a6');
      if (!winter) {
        for (const [x, y] of [[1.0, 1.95], [2.3, 1.95], [1.0, 3.05], [2.3, 3.05]]) {
          p.poly([[x - 0.22, y - 0.17, 0], [x + 0.22, y - 0.17, 0], [x + 0.22, y + 0.17, 0], [x - 0.22, y + 0.17, 0]], '#6a4a2e');
          for (let k = 0; k < 5; k++) p.bush(x - 0.16 + k * 0.08, y + ((k % 2) - 0.5) * 0.12, 1.6, k % 2 ? '#5a8a4a' : '#7a9a5a');
        }
      }
      {
        const [wx, wy] = iso(1.78, 2.55, 0);
        const c = p.ctx;
        c.fillStyle = '#8a8478';
        c.beginPath();
        c.ellipse(wx, wy, 5, 2.4, 0, 0, Math.PI);
        c.lineTo(wx - 5, wy - 4);
        c.ellipse(wx, wy - 4, 5, 2.4, 0, Math.PI, 0, true);
        c.closePath();
        c.fill();
        c.fillStyle = '#c8c2b6';
        c.beginPath();
        c.ellipse(wx, wy - 4, 5, 2.4, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#2a3a4a';
        c.beginPath();
        c.ellipse(wx, wy - 4, 3.4, 1.5, 0, 0, Math.PI * 2);
        c.fill();
      }
      // The chapel along the north side, buttressed, its lancets glowing with colour.
      p.box(0.3, 0.3, 2.85, 1.35, 0, 26, ST, undefined, 'stone');
      for (const x of [0.62, 1.22, 1.82, 2.42]) lancetL(p, 1.352, x, 0.16, 15, 21, winter);
      for (const x of [0.5, 1.1, 1.7, 2.3]) p.box(x - 0.04, 1.35, x + 0.04, 1.42, 12, 12, '#a49c8e', undefined, 'stone');
      p.roofX(0.3, 0.3, 2.85, 1.35, 26, 18, 'slate', ST, 0.1);
      // A little bell turret astride the ridge.
      p.box(0.5, 0.62, 0.82, 1.02, 37, 15, ST, undefined, 'stone');
      p.wallL(1.022, 0.58, 0.74, 42, 50, '#2a2522');
      p.wallR(0.822, 0.7, 0.86, 42, 50, '#221e1b');
      {
        const [bx, by] = iso(0.66, 1.022, 44);
        p.ctx.fillStyle = '#c89a38';
        p.ctx.beginPath();
        p.ctx.moveTo(bx - 2.2, by + 2);
        p.ctx.quadraticCurveTo(bx - 2, by - 3, bx, by - 3);
        p.ctx.quadraticCurveTo(bx + 2, by - 3, bx + 2.2, by + 2);
        p.ctx.fill();
      }
      p.roofPyramid(0.5, 0.62, 0.82, 1.02, 52, 14, 'slate');
      p.line([0.66, 0.82, 66], [0.66, 0.82, 74], '#d8b84a', 1.3);
      p.line([0.62, 0.86, 71], [0.7, 0.78, 71], '#d8b84a', 1.3);
      // The cloister walks on the north and west sides of the garth.
      p.box(0.3, 1.35, 0.4, 3.45, 0, 12, ST, undefined, 'stone');
      p.wallL(1.352, 0.4, 2.85, 0, 11, '#6e665a');
      p.wallR(0.402, 1.35, 3.45, 0, 11, '#7a7266');
      // Lean-to roofs of tile over the walks, the arches in front of their eaves.
      p.poly([[0.38, 1.33, 15], [0.74, 1.72, 11], [0.74, 3.47, 11], [0.38, 3.47, 15]], '#b4503f', '#7a3428', 0.5);
      p.poly([[0.38, 1.33, 15], [2.85, 1.33, 15], [2.85, 1.72, 11], [0.74, 1.72, 11]], '#a8483a', '#7a3428', 0.5);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const y = 1.33 + t * 0.39;
        p.line([0.38 + t * 0.36, y, 15 - t * 4], [2.85, y, 15 - t * 4], 'rgba(90,30,20,0.45)', 0.5);
        p.line([0.38 + t * 0.36, y, 15 - t * 4], [0.38 + t * 0.36, 3.47, 15 - t * 4], 'rgba(90,30,20,0.45)', 0.5);
      }
      arcade(p, [0.74, 1.72], [2.85, 1.72], 7, 9.5, '#c8c2b6');
      arcade(p, [0.74, 1.72], [0.74, 3.47], 6, 9.5, '#c8c2b6');
      // The monks' range on the east side: dormitory above, refectory below.
      p.box(2.85, 0.3, 3.75, 3.45, 0, 21, ST, undefined, 'stone');
      for (const y of [0.55, 1.05, 1.55, 2.05]) {
        p.windowR(3.75, y, 4, 0.14, 6, winter);
        p.windowR(3.75, y, 13, 0.12, 5);
      }
      p.windowR(3.75, 3.0, 13, 0.12, 5);
      p.doorR(3.75, 2.6, 0.22, 11);
      p.windowL(3.45, 3.05, 5, 0.14, 6, winter);
      p.windowL(3.45, 3.4, 5, 0.14, 6, winter);
      p.roofY(2.85, 0.3, 3.75, 3.45, 21, 15, 'tile', ST, 0.1);
      smoke.push(p.chimney(3.25, 1.2, 30, 10));
      // A low wall closes the garth, with a gate onto the herb garden.
      p.box(0.3, 3.45, 1.6, 3.6, 0, 5, '#a49c8e', undefined, 'stone');
      p.box(1.96, 3.45, 2.85, 3.6, 0, 5, '#a49c8e', undefined, 'stone');
      if (!winter) {
        for (const [x, y] of [[0.65, 3.8], [1.15, 3.8], [2.4, 3.8]]) {
          p.poly([[x - 0.18, y - 0.1, 0], [x + 0.18, y - 0.1, 0], [x + 0.18, y + 0.1, 0], [x - 0.18, y + 0.1, 0]], '#6a4a2e');
          for (let k = 0; k < 4; k++) p.bush(x - 0.12 + k * 0.08, y, 1.8, ['#6a9a4a', '#9a7ac0', '#5a8a4a', '#d8c060'][(k + Math.round(x * 3)) % 4]);
        }
      }
      // Straw bee skeps on a bench.
      p.box(3.0, 3.62, 3.6, 3.78, 4, 1.2, '#8a6440');
      for (const x of [3.1, 3.3, 3.5]) {
        const [sx, sy] = iso(x, 3.7, 5.2);
        const c = p.ctx;
        c.fillStyle = '#c8a050';
        c.beginPath();
        c.moveTo(sx - 3, sy);
        c.quadraticCurveTo(sx - 3.2, sy - 6, sx, sy - 6.5);
        c.quadraticCurveTo(sx + 3.2, sy - 6, sx + 3, sy);
        c.closePath();
        c.fill();
        c.strokeStyle = '#9a7a38';
        c.lineWidth = 0.5;
        for (const h of [1.8, 3.6, 5]) {
          c.beginPath();
          c.moveTo(sx - 3 + h * 0.15, sy - h);
          c.lineTo(sx + 3 - h * 0.15, sy - h);
          c.stroke();
        }
        c.fillStyle = '#3a2a1a';
        c.fillRect(sx - 0.6, sy - 1.2, 1.2, 1.2);
      }
      break;
    }
    case 'beekeeper': {
      // A little hut, a bench of straw skeps in the meadow and a veil on a peg.
      p.shadow(0.3, 0.3, 1.1, 1.0);
      p.box(0.3, 0.3, 1.05, 0.95, 0, 11, PLASTER);
      p.timber(0.3, 0.3, 1.05, 0.95, 0, 11, BEAM);
      p.doorL(0.95, 0.6, 0.18, 9);
      p.roofX(0.3, 0.3, 1.05, 0.95, 11, 10, 'thatch', PLASTER, 0.1);
      if (season !== 3) for (const [x, y] of [[1.35, 0.5], [1.65, 0.9], [0.5, 1.45]] as const) p.bush(x, y, 3, '#c8a8d8');
      p.box(0.85, 1.25, 1.8, 1.4, 4, 1.2, '#8a6440');
      for (const x of [0.88, 1.77]) p.line([x, 1.38, 0], [x, 1.38, 4], BEAM, 1);
      for (const x of [1.0, 1.25, 1.5, 1.72]) skep(p, x, 1.32, 5.2);
      p.box(1.3, 0.35, 1.75, 0.6, 0, 3, '#7b5a36');
      skep(p, 1.42, 0.47, 3);
      skep(p, 1.62, 0.47, 3);
      break;
    }
    case 'papermill': {
      // A stone mill on the water: the wheel drives the stampers; sheets dry on lines.
      p.shadow(0.3, 0.3, 1.35, 1.6);
      p.box(0.3, 0.3, 1.35, 1.6, 0, 10, STONE, undefined, 'stone');
      p.box(0.28, 0.28, 1.37, 1.62, 10, 10, PLASTER);
      p.timber(0.28, 0.28, 1.37, 1.62, 10, 10, BEAM);
      p.doorL(1.6, 0.55, 0.2, 10);
      // Louvred drying loft.
      for (let k = 0; k < 4; k++) p.wallL(1.623, 0.85 + k * 0.12, 0.93 + k * 0.12, 12, 18, '#5a4030');
      p.roofX(0.28, 0.28, 1.37, 1.62, 20, 15, 'tile', PLASTER, 0.1);
      waterWheel(p, 1.62, 0.95, 11, 0.45, 11, season);
      // Sheets of paper drying on a line by the door.
      p.line([0.35, 1.8, 0], [0.35, 1.8, 12], BEAM, 1);
      p.line([1.15, 1.8, 0], [1.15, 1.8, 12], BEAM, 1);
      p.line([0.35, 1.8, 12], [1.15, 1.8, 12], '#6a5a4a', 0.5);
      for (let k = 0; k < 5; k++) p.wallL(1.801, 0.42 + k * 0.15, 0.53 + k * 0.15, 6.5, 11.8, k % 2 ? '#f4ecd8' : '#ece4d0');
      break;
    }
    case 'embroiderer': {
      // A tall shop with a wide window, a gown on a stand and bolts of dyed cloth.
      p.shadow(0.3, 0.3, 1.4, 1.3);
      p.box(0.3, 0.3, 1.35, 1.25, 0, 12, STONE, undefined, 'stone');
      p.box(0.28, 0.28, 1.37, 1.27, 12, 11, '#e6d2b0');
      p.timber(0.28, 0.28, 1.37, 1.27, 12, 11, BEAM);
      p.wallL(1.252, 0.4, 0.95, 3, 10, '#4a3020');
      p.wallL(1.253, 0.43, 0.92, 4, 9, season === 3 ? '#e8b850' : '#3a3540');
      p.doorL(1.25, 1.05, 0.18, 10);
      p.windowL(1.27, 0.6, 15, 0.14, 5);
      p.roofX(0.28, 0.28, 1.37, 1.27, 23, 14, 'tile', '#e6d2b0', 0.1);
      // An awning over the window, striped in the lord's colours.
      for (let k = 0; k < 6; k++) p.poly([[0.38 + k * 0.1, 1.27, 11], [0.48 + k * 0.1, 1.27, 11], [0.48 + k * 0.1, 1.45, 8.5], [0.38 + k * 0.1, 1.45, 8.5]], k % 2 ? '#7a3ab0' : '#e8d8b0');
      gown(p, 1.62, 1.55, '#7a3ab0');
      for (const [x, y, c] of [[1.62, 0.55, '#2f4fa8'], [1.72, 0.78, '#a83a2a'], [1.62, 1.0, '#4f8a3c']] as [number, number, string][]) p.line([x, y - 0.1, 3], [x, y + 0.1, 3], c, 5);
      break;
    }
    case 'glazier': {
      // A stone workshop with a kiln, a bench of coloured panes and finished windows.
      p.shadow(0.3, 0.3, 1.4, 1.3);
      p.box(0.3, 0.3, 1.3, 1.2, 0, 15, STONE, undefined, 'stone');
      p.doorL(1.2, 0.85, 0.18, 10);
      lancetL(p, 1.202, 0.45, 0.16, 5, 11, season === 3);
      p.roofX(0.3, 0.3, 1.3, 1.2, 15, 12, 'slate', STONE, 0.1);
      smoke.push(p.chimney(0.45, 0.45, 24, 10, '#7a7268'));
      // Panes leaning on a rack.
      p.box(1.45, 0.35, 1.85, 1.05, 0, 1, '#8a6440');
      const cols = ['#3a62c4', '#c42b3a', '#d8a838', '#4f8a3c', '#7a3ab0'];
      for (let k = 0; k < 5; k++) {
        const y = 0.42 + k * 0.12;
        p.poly([[1.5, y, 1], [1.5, y + 0.1, 1], [1.56, y + 0.1, 11], [1.56, y, 11]], cols[k]);
        p.poly([[1.5, y, 1], [1.5, y + 0.1, 1], [1.56, y + 0.1, 11], [1.56, y, 11]], null, '#2a2a30', 0.5);
      }
      // A finished window crated for the church.
      p.crate(0.5, 1.45, 0.24);
      p.wallL(1.692, 0.54, 0.7, 4, 9.5, '#3a62c4');
      p.wallL(1.693, 0.54, 0.7, 6.5, 7.5, '#d8a838');
      break;
    }
    case 'cobbler': {
      // A small shop with a boot sign and a last on the bench outside.
      p.shadow(0.35, 0.3, 1.4, 1.3);
      p.box(0.35, 0.35, 1.35, 1.25, 0, 12, '#dfbd88');
      p.timber(0.35, 0.35, 1.35, 1.25, 0, 12, BEAM);
      p.doorL(1.25, 0.75, 0.2, 10);
      p.windowL(1.25, 0.45, 4, 0.14, 5, season === 3);
      p.roofX(0.35, 0.35, 1.35, 1.25, 12, 11, 'shingle', '#dfbd88', 0.12);
      p.line([1.36, 1.2, 14], [1.55, 1.35, 14], '#3b2a1a', 1.2);
      bootSign(p, 1.5, 1.33, 8);
      p.box(1.45, 0.45, 1.85, 0.75, 5, 1.2, '#8a6440');
      for (const x of [1.48, 1.82]) p.line([x, 0.72, 0], [x, 0.72, 5], BEAM, 1);
      bootSign(p, 1.6, 0.6, 6.2);
      bootSign(p, 1.74, 0.6, 6.2);
      p.sack(0.55, 1.6, '#7a4a2a');
      break;
    }
    case 'watersawmill': {
      // An open-sided timber mill on the water: the wheel drives a frame saw.
      p.shadow(0.3, 0.3, 1.4, 1.6);
      p.logPile(0.3, 0.2, 2);
      p.box(0.3, 0.3, 1.35, 1.6, 0, 3, STONE, undefined, 'stone');
      for (const [x, y] of [[0.35, 0.35], [1.3, 0.35], [0.35, 1.55], [1.3, 1.55]]) p.line([x, y, 3], [x, y, 16], BEAM, 2);
      // The saw frame and a log on the carriage.
      p.line([0.8, 0.95, 3], [0.8, 0.95, 14], '#5a3e26', 1.4);
      p.line([0.8, 1.15, 3], [0.8, 1.15, 14], '#5a3e26', 1.4);
      p.line([0.8, 1.05, 4], [0.8, 1.05, 13], '#c8ccd4', 1);
      p.line([0.45, 1.05, 5], [1.2, 1.05, 5], '#8a6236', 5);
      p.roofX(0.28, 0.28, 1.37, 1.0, 16, 10, 'shingle', WOOD, 0.06);
      waterWheel(p, 1.62, 0.95, 9, 0.42, 9, season);
      for (let i = 0; i < 3; i++) p.box(0.4, 1.7, 1.2, 1.85, i * 2.2, 2, i % 2 ? '#d7b47c' : '#c8a46c');
      break;
    }
    case 'silvermine': {
      // An adit into the rock with a timber frame, a windlass, and a heap of bright ore.
      for (const [x, y, r] of [[0.5, 0.4, 14], [1.1, 0.3, 16], [1.6, 0.55, 12]] as const) rockLump(p, x, y, r, '#8a8478', 3);
      rockLump(p, 1.0, 0.8, 13, '#8a8478', 5);
      p.wallL(0.952, 0.82, 1.18, 0, 10, '#141210');
      p.line([0.78, 0.96, 0], [0.78, 0.96, 12], BEAM, 2);
      p.line([1.22, 0.96, 0], [1.22, 0.96, 12], BEAM, 2);
      p.line([0.74, 0.96, 12], [1.26, 0.96, 12], BEAM, 2.2);
      // Windlass.
      p.line([1.5, 1.2, 0], [1.5, 1.2, 9], BEAM, 1.4);
      p.line([1.5, 1.5, 0], [1.5, 1.5, 9], BEAM, 1.4);
      p.line([1.5, 1.2, 9], [1.5, 1.5, 9], '#6b4a2e', 3);
      for (const [dx, dy] of [[0, 0], [0.12, 0.06], [-0.08, 0.1], [0.05, 0.16]]) {
        rockLump(p, 0.7 + dx, 1.5 + dy, 3.5, '#9a9aa4', 7);
        const [sx, sy] = iso(0.7 + dx, 1.5 + dy, 2);
        p.ctx.fillStyle = '#eef2f8';
        p.ctx.fillRect(sx - 1, sy - 2, 1.6, 1.2);
      }
      p.barrel(1.2, 1.65);
      break;
    }
    case 'bathhouse': {
      // A low stone house with a tiled roof, steam from the vents and a woodpile.
      p.shadow(0.2, 0.25, 2.8, 1.7);
      p.box(0.25, 0.3, 2.75, 1.6, 0, 14, STONE, undefined, 'stone');
      p.doorL(1.6, 1.3, 0.24, 11);
      for (const x of [0.5, 0.85, 2.0, 2.35]) p.windowL(1.6, x, 6, 0.14, 5, true);
      p.windowR(2.75, 0.8, 6, 0.14, 5, true);
      p.roofX(0.25, 0.3, 2.75, 1.6, 14, 13, 'tile', STONE, 0.1);
      for (const x of [0.9, 1.9]) {
        p.box(x, 0.85, x + 0.18, 1.05, 21, 4, '#8a7d70', undefined, 'stone');
        smoke.push([x + 0.09, 0.95, 26]);
      }
      p.logPile(0.3, 1.9, 2);
      tub(p, 2.5, 1.85, 6, 5, '#7ab0c8');
      break;
    }
    case 'school': {
      // A schoolroom with tall windows, a bell on the gable and a yard with a slate board.
      p.shadow(0.25, 0.3, 2.75, 1.5);
      p.box(0.25, 0.3, 2.7, 1.45, 0, 14, PLASTER);
      p.timber(0.25, 0.3, 2.7, 1.45, 0, 14, BEAM);
      p.doorL(1.45, 1.35, 0.2, 10);
      for (const x of [0.45, 0.8, 1.75, 2.1, 2.4]) p.windowL(1.452, x, 4, 0.16, 7, season === 3);
      p.roofX(0.25, 0.3, 2.7, 1.45, 14, 12, 'tile', PLASTER, 0.1);
      // Bell-cote on the near gable.
      p.box(2.55, 0.8, 2.75, 0.95, 26, 6, '#8a7d70');
      p.wallR(2.752, 0.83, 0.92, 27, 31, '#2a2522');
      p.circle(2.75, 0.875, 28.5, 1.4, '#c89a38');
      // A slate board on legs in the yard.
      p.line([1.0, 1.75, 0], [1.0, 1.75, 9], BEAM, 1);
      p.line([1.5, 1.75, 0], [1.5, 1.75, 9], BEAM, 1);
      p.wallL(1.75, 0.95, 1.55, 4, 10, '#7a5230');
      p.wallL(1.751, 0.99, 1.51, 4.6, 9.4, '#33403a');
      p.line([1.08, 1.752, 8], [1.3, 1.752, 6], '#f2ece0', 0.5);
      break;
    }
    case 'taxoffice': {
      // A sober stone office: barred window, a chest by the door, the lord's arms over it.
      p.shadow(0.3, 0.3, 1.4, 1.3);
      p.box(0.3, 0.3, 1.35, 1.25, 0, 16, '#b6ae9f', undefined, 'stone');
      p.doorL(1.25, 0.95, 0.2, 11);
      p.windowL(1.25, 0.45, 5, 0.18, 7);
      for (const t of [0.5, 0.56]) p.line([t, 1.253, 5], [t, 1.253, 12], '#2a2a2a', 0.7);
      p.roofPyramid(0.3, 0.3, 1.35, 1.25, 16, 12, 'slate');
      p.flag(1.05, 1.252, 13, 5, '#c42b3a');
      p.box(0.55, 1.4, 0.85, 1.6, 0, 5, '#6a4426');
      p.box(0.55, 1.4, 0.85, 1.6, 5, 0.8, '#c89a38');
      p.sack(1.5, 0.8, '#d8c79c');
      break;
    }
    case 'courthouse': {
      // A great hall of dressed stone with a porch on columns and a watch at the door.
      p.shadow(0.2, 0.2, 2.8, 2.8);
      p.box(0.3, 0.3, 2.7, 2.2, 0, 22, '#cfc8b8', undefined, 'stone');
      for (const x of [0.6, 1.0, 1.9, 2.3]) lancetL(p, 2.202, x, 0.16, 8, 15, season === 3);
      p.roofX(0.3, 0.3, 2.7, 2.2, 22, 16, 'slate', '#cfc8b8', 0.1);
      // The porch.
      p.box(1.25, 2.2, 1.75, 2.75, 0, 1.5, '#b8b0a0');
      for (const x of [1.3, 1.7]) p.line([x, 2.7, 1.5], [x, 2.7, 13], '#e0dacc', 2.2);
      p.wallL(2.202, 1.38, 1.62, 0, 11, '#4a2f1b');
      p.roofY(1.22, 2.2, 1.78, 2.78, 13, 7, 'slate', '#cfc8b8', 0.04);
      // Scales of justice carved over the door.
      const [sx, sy] = iso(1.5, 2.781, 17);
      p.ctx.strokeStyle = '#c89a38';
      p.ctx.lineWidth = 0.8;
      p.ctx.beginPath();
      p.ctx.moveTo(sx, sy - 3);
      p.ctx.lineTo(sx, sy + 1.5);
      p.ctx.moveTo(sx - 3, sy - 2);
      p.ctx.lineTo(sx + 3, sy - 2);
      p.ctx.stroke();
      p.flag(2.65, 2.2, 22, 8, '#2f4fa8');
      break;
    }
    case 'atelier': {
      // A palace studio: tall north windows, an easel in the yard, a loom inside.
      p.shadow(0.3, 0.3, 1.45, 1.4);
      p.box(0.3, 0.3, 1.4, 1.3, 0, 18, '#e6dcc6', undefined, 'stone');
      for (const x of [0.45, 0.8]) p.windowL(1.302, x, 6, 0.2, 10, true);
      p.doorL(1.3, 1.1, 0.18, 10);
      p.roofX(0.3, 0.3, 1.4, 1.3, 18, 9, 'slate', '#e6dcc6', 0.1);
      // Easel with a painting in progress.
      p.line([1.6, 1.4, 0], [1.66, 1.5, 13], '#7a5230', 1.2);
      p.line([1.78, 1.4, 0], [1.72, 1.5, 13], '#7a5230', 1.2);
      p.line([1.69, 1.62, 0], [1.69, 1.5, 12], '#7a5230', 1);
      p.wallL(1.52, 1.55, 1.85, 5, 12, '#f4ecd8');
      p.wallL(1.521, 1.58, 1.82, 6, 11, '#6a9ad0');
      p.wallL(1.522, 1.58, 1.82, 6, 8, '#5a8a4a');
      p.circle(1.75, 1.522, 10, 1.2, '#f2d34a');
      p.bush(0.55, 1.65, 4, '#4f8a3c');
      break;
    }
    case 'barracks': {
      // A long stone barracks with a weapon rack and a guard's banner.
      p.shadow(0.25, 0.3, 1.6, 1.5);
      p.box(0.3, 0.3, 1.6, 1.4, 0, 14, '#a49c8e', undefined, 'stone');
      p.doorL(1.4, 1.1, 0.22, 11);
      for (const x of [0.45, 0.75]) p.windowL(1.402, x, 6, 0.12, 4);
      p.roofX(0.3, 0.3, 1.6, 1.4, 14, 10, 'slate', '#a49c8e', 0.1);
      p.line([0.4, 1.75, 0], [0.4, 1.75, 14], BEAM, 1.2);
      p.flag(0.4, 1.75, 14, 7, '#c42b3a');
      // Spears in a rack.
      p.box(1.0, 1.65, 1.5, 1.72, 0, 6, '#7b5a36');
      for (let k = 0; k < 5; k++) {
        const x = 1.04 + k * 0.1;
        p.line([x, 1.68, 0], [x, 1.68, 15], '#8a6440', 0.8);
        p.line([x, 1.68, 15], [x, 1.68, 17], '#c8ccd4', 1.2);
      }
      break;
    }
    case 'stewpond': {
      // A stone-edged pond with lilies, a little sluice and a net drying.
      p.poly([[0.25, 0.3, 0], [1.75, 0.3, 0], [1.75, 1.7, 0], [0.25, 1.7, 0]], '#9d978c');
      p.poly([[0.35, 0.4, 0], [1.65, 0.4, 0], [1.65, 1.6, 0], [0.35, 1.6, 0]], season === 3 ? '#cfe0e8' : '#4a7ab0');
      if (season !== 3) {
        for (const [x, y] of [[0.6, 0.7], [1.2, 1.1], [0.9, 1.4], [1.4, 0.6]]) {
          p.ellipse(x, y, 0, 3, 1.4, '#4f8a3c');
          p.circle(x + 0.03, y, 0.5, 0.8, '#f2d0e0');
        }
        const [fx, fy] = iso(1.05, 0.8, 0);
        p.ctx.strokeStyle = 'rgba(220,235,245,0.7)';
        p.ctx.lineWidth = 0.6;
        p.ctx.beginPath();
        p.ctx.ellipse(fx, fy, 4, 1.6, 0, 0, Math.PI * 2);
        p.ctx.stroke();
      }
      p.line([1.85, 0.5, 0], [1.85, 0.5, 8], BEAM, 1);
      p.line([1.85, 1.1, 0], [1.85, 1.1, 8], BEAM, 1);
      p.wallR(1.85, 0.52, 1.08, 3, 8, 'rgba(120,100,70,0.45)');
      break;
    }
    case 'tiltyard': {
      // A lists: a long barrier, stands at one side, pennants on poles.
      p.poly([[0.2, 0.2, 0], [3.8, 0.2, 0], [3.8, 1.8, 0], [0.2, 1.8, 0]], season === 3 ? '#e4e8e8' : '#c8b480');
      p.box(0.4, 0.95, 3.6, 1.05, 0, 4, '#a83a2a');
      for (let k = 0; k <= 8; k++) p.line([0.4 + k * 0.4, 1.0, 0], [0.4 + k * 0.4, 1.0, 5], '#e8d8b0', 1);
      // Stands.
      p.box(1.2, 0.2, 2.8, 0.5, 0, 6, '#8a6440');
      p.box(1.2, 0.2, 2.8, 0.35, 6, 4, '#7b5a36');
      p.roofX(1.15, 0.15, 2.85, 0.55, 12, 4, 'plank', WOOD, 0.04);
      for (const [x, c] of [[0.3, '#c42b3a'], [1.3, '#2f4fa8'], [2.7, '#d8a838'], [3.7, '#4f8a3c']] as [number, string][]) {
        p.line([x, 1.7, 0], [x, 1.7, 18], BEAM, 1);
        p.flag(x, 1.7, 18, 5, c);
      }
      break;
    }
    case 'wall': {
      // A short stretch with a merlon, for the build card and the building site.
      p.shadow(0.1, 0.3, 0.9, 0.7);
      p.box(0.1, 0.34, 0.9, 0.66, 0, 22, '#b5ac9b', '#cdc4b3');
      for (const x0 of [0.14, 0.42, 0.7]) p.box(x0, 0.38, x0 + 0.14, 0.62, 22, 5, '#b5ac9b', '#cdc4b3');
      break;
    }
    case 'cathedral': {
      // A Gothic cathedral: west front of twin towers round a great portal
      // and rose window, a tall nave over lower aisles held by flying
      // buttresses, a transept with its own rose, a lantern and spire over
      // the crossing, and a rounded apse at the east end.
      const stone = '#c4bba9';
      const dark = '#aea592';
      const jewels = ['#c83a3a', '#3a6ac8', '#e8b840', '#3a9a5a', '#9a4ac8'];
      let pane = 0;
      const plain = season === 3 ? '#e8b850' : '#5a6a9a';
      const glassAt = () => (variant === 1 ? jewels[pane++ % jewels.length] : plain);
      const lancetL = (y: number, x: number, w: number, z: number, h: number) => {
        p.poly([[x - 0.02, y, z - 1], [x + w + 0.02, y, z - 1], [x + w + 0.02, y, z + h * 0.72], [x + w / 2, y, z + h + 2], [x - 0.02, y, z + h * 0.72]], '#3a3a52');
        p.poly([[x, y + 0.001, z], [x + w, y + 0.001, z], [x + w, y + 0.001, z + h * 0.72], [x + w / 2, y + 0.001, z + h], [x, y + 0.001, z + h * 0.72]], glassAt());
      };
      const lancetR = (x: number, y: number, w: number, z: number, h: number) => {
        p.poly([[x, y - 0.02, z - 1], [x, y + w + 0.02, z - 1], [x, y + w + 0.02, z + h * 0.72], [x, y + w / 2, z + h + 2], [x, y - 0.02, z + h * 0.72]], '#2e2e44');
        p.poly([[x + 0.001, y, z], [x + 0.001, y + w, z], [x + 0.001, y + w, z + h * 0.72], [x + 0.001, y + w / 2, z + h], [x + 0.001, y, z + h * 0.72]], glassAt());
      };
      const rose = (x: number, y: number, z: number, r: number, onR: boolean) => {
        const [rx, ry] = iso(x, y, z);
        const c = p.ctx;
        c.save();
        c.translate(rx, ry);
        c.transform(onR ? 0.7 : 0.7, onR ? -0.35 : 0.35, 0, 1, 0, 0);
        c.fillStyle = '#3a3a52';
        c.beginPath();
        c.arc(0, 0, r + 1.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = variant === 1 ? '#c83a3a' : season === 3 ? '#e8b850' : '#7a5a9a';
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#3a3a52';
        c.lineWidth = 0.7;
        for (let k = 0; k < 8; k++) {
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(Math.cos((k * Math.PI) / 4) * r, Math.sin((k * Math.PI) / 4) * r);
          c.stroke();
        }
        c.fillStyle = variant === 1 ? '#e8b840' : '#c8b8e0';
        c.beginPath();
        c.arc(0, 0, r * 0.3, 0, Math.PI * 2);
        c.fill();
        c.restore();
      };
      const pinnacle = (x: number, y: number, z: number, h = 10) => {
        p.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, z, 3, dark);
        p.roofPyramid(x - 0.05, y - 0.05, x + 0.05, y + 0.05, z + 3, h, 'slate', 0.01);
      };
      p.shadow(0.4, 0.3, 4.75, 5.85);
      // Apse at the east end, rounded with three faces.
      p.box(1.85, 0.45, 3.15, 1.45, 0, 40, stone, undefined, 'stone');
      lancetR(3.15, 0.7, 0.16, 14, 18);
      lancetR(3.15, 1.05, 0.16, 14, 18);
      p.roofPyramid(1.85, 0.45, 3.15, 1.45, 40, 22, 'slate', 0.06);
      // The nave and its south aisle, in two lengths either side of the transept
      // so each is drawn behind or in front of it as it should be.
      const naveLength = (y0: number, y1: number, wins: number[], piers: number[]) => {
        p.box(1.55, y0, 3.45, y1, 0, 50, stone, undefined, 'stone');
        p.box(3.45, Math.max(1.45, y0), 4.15, Math.min(4.9, y1), 0, 26, dark, undefined, 'stone');
        for (const y of wins) lancetR(4.15, y + 0.04, 0.16, 7, 14);
        p.poly([[3.45, y0, 38], [3.45, y1, 38], [4.22, y1, 26], [4.22, y0, 26]], p.snow ? '#e8eef0' : shade(ROOF_COLORS.slate, 0.85), shade(ROOF_COLORS.slate, 0.5));
        for (const y of wins) lancetR(3.45, y + 0.04, 0.16, 40, 8);
        for (const y of piers) {
          p.box(4.15, y - 0.06, 4.3, y + 0.06, 0, 34, stone, undefined, 'stone');
          pinnacle(4.22, y, 34, 9);
          p.poly([[4.15, y - 0.03, 33], [4.15, y + 0.03, 33], [3.45, y + 0.03, 47], [3.45, y - 0.03, 47]], shade(stone, 0.85));
          p.poly([[4.15, y + 0.03, 30], [4.15, y + 0.03, 33], [3.45, y + 0.03, 47], [3.45, y + 0.03, 44]], shade(stone, 0.95));
        }
        p.roofY(1.55, y0, 3.45, y1, 50, 40, 'slate', stone, 0.06);
      };
      naveLength(1.35, 2.45, [1.6, 2.0], [1.5]);
      // Transept, with a rose window in its gable.
      p.box(0.75, 2.4, 4.75, 3.3, 0, 50, stone, undefined, 'stone');
      lancetR(4.75, 2.6, 0.18, 10, 22);
      lancetR(4.75, 2.95, 0.18, 10, 22);
      lancetL(3.3, 0.95, 0.18, 10, 22);
      p.roofX(0.75, 2.4, 4.75, 3.3, 50, 34, 'slate', stone, 0.08);
      rose(4.752, 2.85, 62, 7, true);
      for (const y of [2.4, 3.3]) {
        p.box(4.75, y - 0.06, 4.88, y + 0.06, 0, 52, dark, undefined, 'stone');
        pinnacle(4.81, y, 52, 12);
      }
      naveLength(3.25, 5.0, [3.45, 3.85, 4.25], [3.4, 4.2, 4.85]);
      // Lantern tower and spire over the crossing.
      p.box(2.1, 2.45, 2.9, 3.25, 50, 36, stone, undefined, 'stone');
      lancetR(2.9, 2.6, 0.14, 60, 18);
      lancetR(2.9, 2.95, 0.14, 60, 18);
      lancetL(3.25, 2.3, 0.14, 60, 18);
      lancetL(3.25, 2.6, 0.14, 60, 18);
      for (const [x, y] of [[2.1, 3.25], [2.9, 3.25], [2.9, 2.45]] as const) pinnacle(x, y, 86, 14);
      p.roofPyramid(2.15, 2.5, 2.85, 3.2, 86, 80, 'slate', 0.02);
      p.line([2.5, 2.85, 166], [2.5, 2.85, 178], '#d8b84a', 1.6);
      p.line([2.44, 2.91, 173], [2.56, 2.79, 173], '#d8b84a', 1.6);
      const tower = (x0: number) => {
        const x1 = x0 + 0.75;
        p.box(x0, 4.9, x1, 5.8, 0, 104, stone, undefined, 'stone');
        // Stepped buttresses at the outer corners.
        p.box(x0 + (x0 < 2 ? -0.08 : 0.67), 5.65, x0 + (x0 < 2 ? 0.08 : 0.83), 5.88, 0, 70, dark, undefined, 'stone');
        lancetL(5.8, x0 + 0.27, 0.2, 28, 22);
        lancetL(5.8, x0 + 0.24, 0.27, 72, 24);
        lancetR(x1, 5.15, 0.2, 28, 22);
        lancetR(x1, 5.12, 0.27, 72, 24);
        // A string course and the tower's crown of pinnacles round a short spire.
        p.wallL(5.802, x0, x1, 64, 66, 'rgba(70,60,50,0.35)');
        p.wallR(x1 + 0.002, 4.9, 5.8, 64, 66, 'rgba(70,60,50,0.3)');
        for (const [x, y] of [[x0, 5.8], [x1, 5.8], [x1, 4.9]] as const) pinnacle(x, y, 104, 16);
        p.roofPyramid(x0 + 0.08, 4.98, x1 - 0.08, 5.72, 104, 46, 'slate', 0.02);
      };
      // West front: the left tower, the gabled centre, then the right tower.
      tower(1.25);
      p.box(2.0, 4.95, 3.0, 5.75, 0, 60, stone, undefined, 'stone');
      p.poly([[2.0, 5.75, 60], [3.0, 5.75, 60], [2.5, 5.75, 80]], shade(stone, 1.02), shade(stone, 0.6));
      pinnacle(2.5, 5.7, 80, 8);
      rose(2.5, 5.752, 46, 8.5, false);
      // The great portal: a pointed arch, its tympanum and doors.
      p.poly([[2.18, 5.752, 0], [2.82, 5.752, 0], [2.82, 5.752, 24], [2.5, 5.752, 34], [2.18, 5.752, 24]], shade(stone, 0.75));
      p.poly([[2.26, 5.754, 0], [2.74, 5.754, 0], [2.74, 5.754, 22], [2.5, 5.754, 30], [2.26, 5.754, 22]], '#4a2f1b');
      p.poly([[2.26, 5.756, 20], [2.74, 5.756, 20], [2.74, 5.756, 22], [2.5, 5.756, 30], [2.26, 5.756, 22]], shade(stone, 0.9));
      p.line([2.5, 5.756, 0], [2.5, 5.756, 20], '#2e1d10', 0.8);
      tower(3.0);
      break;
    }
    case 'belltower': {
      const stone = '#c2b9a8';
      const dark = '#a69d8c';
      p.shadow(0.35, 0.35, 1.65, 1.65);
      // A broad base, the shaft, and the open belfry under a slate spire.
      p.box(0.4, 0.4, 1.6, 1.6, 0, 14, dark, undefined, 'stone');
      p.box(0.55, 0.55, 1.45, 1.45, 14, 70, stone, undefined, 'stone');
      p.wallL(1.452, 0.85, 1.15, 0, 18, '#4a2f1b');
      for (const z of [30, 52]) {
        p.wallL(1.452, 0.92, 1.08, z, z + 9, '#3a3a52');
        p.wallR(1.452, 0.92, 1.08, z, z + 9, '#3a3a52');
      }
      p.box(0.5, 0.5, 1.5, 1.5, 84, 4, dark);
      p.wallL(1.452, 0.68, 1.32, 90, 106, '#221e1b');
      p.wallR(1.452, 0.68, 1.32, 90, 106, '#221e1b');
      // The bell inside.
      const [bx, by] = iso(1.0, 1.45, 94);
      p.ctx.fillStyle = '#c89a38';
      p.ctx.beginPath();
      p.ctx.moveTo(bx - 4, by + 4);
      p.ctx.quadraticCurveTo(bx - 3, by - 6, bx, by - 6);
      p.ctx.quadraticCurveTo(bx + 3, by - 6, bx + 4, by + 4);
      p.ctx.fill();
      p.box(0.5, 0.5, 1.5, 1.5, 106, 4, dark);
      p.roofPyramid(0.5, 0.5, 1.5, 1.5, 110, 52, 'slate', 0.04);
      p.line([1.0, 1.0, 162], [1.0, 1.0, 172], '#d8b84a', 1.4);
      break;
    }
    case 'guildhall': {
      const stone = '#c2b9a8';
      const WALL = '#efe3c8';
      const BEAM = '#5a3a22';
      p.shadow(0.2, 0.2, 3.85, 3.85);
      // An arcaded stone ground floor where the merchants meet.
      p.box(0.3, 0.3, 3.7, 3.7, 0, 20, stone, undefined, 'stone');
      for (const x of [0.6, 1.3, 2.0, 2.7]) {
        p.wallL(3.702, x, x + 0.45, 0, 15, '#3a2a1e');
        p.wallR(3.702, x, x + 0.45, 0, 15, '#3a2a1e');
      }
      // Two timbered floors above, jettied out a little.
      p.box(0.22, 0.22, 3.78, 3.78, 20, 22, WALL);
      p.timber(0.22, 0.22, 3.78, 3.78, 20, 22, BEAM);
      for (const x of [0.5, 1.2, 1.9, 2.6, 3.2]) {
        p.windowL(3.78, x, 27, 0.2, 8, season === 3);
        p.windowR(3.78, x, 27, 0.2, 8);
      }
      p.roofX(0.22, 0.22, 3.78, 3.78, 42, 34, 'tile', WALL, 0.12);
      // A clock gable over the door, and the guild banners.
      p.box(1.6, 3.5, 2.4, 3.95, 20, 40, WALL);
      p.timber(1.6, 3.5, 2.4, 3.95, 20, 40, BEAM);
      const [cx, cy] = iso(2.0, 3.952, 48);
      p.ctx.fillStyle = '#f4ecd8';
      p.ctx.beginPath();
      p.ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.strokeStyle = '#3a2a1e';
      p.ctx.lineWidth = 1;
      p.ctx.stroke();
      p.ctx.beginPath();
      p.ctx.moveTo(cx, cy);
      p.ctx.lineTo(cx, cy - 4);
      p.ctx.moveTo(cx, cy);
      p.ctx.lineTo(cx + 3, cy + 1);
      p.ctx.stroke();
      p.roofY(1.6, 3.5, 2.4, 3.95, 60, 18, 'tile', WALL, 0.08);
      for (const [x, col] of [[0.7, '#9a2a2a'], [3.3, '#2a4a8a']] as [number, string][]) {
        p.line([x, 3.8, 20], [x, 3.8, 92], '#4a3a2a', 1.2);
        p.wallL(3.802, x, x + 0.25, 80, 92, col);
      }
      break;
    }
    case 'stable': {
      // A long timber stable with half-doors to the stalls, a horse looking
      // out of one, and a fenced paddock with a horse, a trough and hay.
      p.shadow(0.2, 0.2, 2.9, 1.2);
      p.box(0.25, 0.22, 2.85, 1.05, 0, 13, WOOD, undefined, 'plank');
      p.timber(0.25, 0.22, 2.85, 1.05, 0, 13, BEAM);
      for (const x of [0.55, 1.35, 2.15]) {
        // The stall door: dark above, a closed half-door below.
        p.wallL(1.052, x, x + 0.42, 5.5, 11, '#2e2014');
        p.wallL(1.052, x, x + 0.42, 0, 5.5, '#8a6440');
        p.line([x, 1.052, 5.5], [x + 0.42, 1.052, 5.5], BEAM, 1);
        p.line([x, 1.052, 0.3], [x + 0.42, 1.052, 5.2], BEAM, 0.8);
      }
      p.roofX(0.25, 0.22, 2.85, 1.05, 13, 11, 'shingle', WOOD, 0.12);
      {
        // A head over the middle door.
        const [hx, hy] = iso(1.56, 1.1, 8.5);
        const c = p.ctx;
        c.fillStyle = '#6b4a30';
        c.beginPath();
        c.moveTo(hx - 1.5, hy + 1);
        c.lineTo(hx - 0.6, hy - 4);
        c.lineTo(hx + 2.6, hy - 2.6);
        c.lineTo(hx + 2.8, hy - 1);
        c.lineTo(hx + 0.6, hy - 0.8);
        c.lineTo(hx + 0.8, hy + 1.4);
        c.closePath();
        c.fill();
        c.fillStyle = '#2e2014';
        c.fillRect(hx - 0.7, hy - 5, 0.8, 1.4);
      }
      // The paddock.
      const fence = '#8a6a44';
      p.fence([0.3, 1.25], [2.85, 1.25], fence);
      p.fence([0.3, 1.25], [0.3, 1.9], fence);
      p.fence([2.85, 1.25], [2.85, 1.9], fence);
      p.fence([0.3, 1.9], [1.3, 1.9], fence);
      p.fence([1.75, 1.9], [2.85, 1.9], fence);
      p.box(2.2, 1.4, 2.65, 1.55, 0, 2.6, '#7a5a3a');
      p.box(2.24, 1.43, 2.61, 1.52, 2.4, 0.2, '#5f9ab8');
      p.box(0.5, 1.4, 0.8, 1.62, 0, 3.2, '#d8b858');
      {
        const [hx, hy] = iso(1.55, 1.6, 0);
        drawHorse(p.ctx, hx, hy, -1, { coat: '#8a5a32' });
      }
      break;
    }
    case 'draughtstable': {
      // A plain plank barn: four stalls with half-doors, a hay loft in the
      // gable, a water trough and a pile of hay before it.
      p.shadow(0.18, 0.18, 2.88, 1.35);
      p.box(0.22, 0.22, 2.82, 1.22, 0, 12, '#9a7448', undefined, 'plank');
      p.timber(0.22, 0.22, 2.82, 1.22, 0, 12, BEAM);
      for (const x of [0.4, 1.02, 1.64, 2.26]) {
        p.wallL(1.222, x, x + 0.4, 5, 10, '#2a1c12');
        p.wallL(1.222, x, x + 0.4, 0, 5, '#7a5634');
        p.line([x, 1.222, 5], [x + 0.4, 1.222, 5], BEAM, 1);
        p.line([x, 1.222, 0.4], [x + 0.4, 1.222, 4.6], BEAM, 0.7);
        p.line([x + 0.4, 1.222, 0.4], [x, 1.222, 4.6], BEAM, 0.7);
      }
      p.roofX(0.22, 0.22, 2.82, 1.22, 12, 12, 'thatch', '#9a7448', 0.12);
      // The loft door high in the gable, hay spilling from it.
      p.wallR(2.822, 0.55, 0.88, 13, 18, '#2a1c12');
      p.poly([[2.83, 0.5, 12.5], [2.83, 0.95, 12.5], [2.92, 0.9, 11], [2.92, 0.55, 11]], '#d8b858');
      // Trough and hay.
      p.box(0.5, 1.42, 1.15, 1.58, 0, 2.6, '#6e5034');
      p.box(0.54, 1.45, 1.11, 1.55, 2.4, 0.2, '#5f9ab8');
      p.box(2.2, 1.4, 2.62, 1.66, 0, 3.4, '#d8b858');
      p.box(2.28, 1.46, 2.54, 1.6, 3.4, 1.6, '#e6c870');
      // A harness collar hung by the door.
      p.circle(1.5, 1.23, 7.5, 1.6, '#5a3a22');
      break;
    }
    case 'builderyard': {
      // An open shed, timber and stone stacked about the yard, a ladder, and
      // a treadwheel crane with a block of stone on its rope.
      p.shadow(0.15, 0.15, 1.9, 1.85);
      p.box(0.2, 0.2, 1.3, 0.72, 0, 12, '#9a7448', undefined, 'plank');
      p.wallL(0.722, 0.32, 1.18, 0, 9, '#2a1c12');
      for (const x of [0.32, 0.75, 1.18]) p.line([x, 0.722, 0], [x, 0.722, 12], BEAM, 1.4);
      // Planks racked inside the open front.
      for (let k = 0; k < 4; k++) p.line([0.38, 0.7, 1.5 + k * 1.6], [1.12, 0.7, 1.5 + k * 1.6], k % 2 ? '#d7b47c' : '#c8a46c', 1.3);
      p.roofX(0.2, 0.2, 1.3, 0.72, 12, 8, 'shingle', '#9a7448', 0.1);
      p.logPile(1.5, 0.55, 3);
      p.stonePile(0.45, 1.45, 4);
      for (let i = 0; i < 3; i++) p.box(0.3, 1.05, 0.85, 1.2, i * 1.8, 1.8, i % 2 ? '#d7b47c' : '#c8a46c');
      // A ladder against the shed.
      p.line([1.36, 0.3, 0], [1.31, 0.3, 14], '#7a5a3a', 1);
      p.line([1.36, 0.5, 0], [1.31, 0.5, 14], '#7a5a3a', 1);
      for (let z = 2; z < 14; z += 3) p.line([1.35, 0.3, z], [1.35, 0.5, z], '#7a5a3a', 0.8);
      // The crane at the front of the yard: a braced mast, a jib reaching over
      // the stone pile with a block on its rope, and the treadwheel that winds it.
      const MAST = '#6a4a2a';
      p.line([1.78, 1.2, 0], [1.78, 1.2, 34], MAST, 2.2);
      p.line([1.78, 1.2, 0], [1.78, 1.45, 0], MAST, 2);
      p.line([1.78, 1.45, 0], [1.78, 1.2, 14], MAST, 1.2);
      p.line([1.78, 0.95, 0], [1.78, 1.2, 14], MAST, 1.2);
      p.line([1.78, 1.2, 32], [1.6, 1.62, 27], MAST, 1.8);
      p.line([1.78, 1.2, 22], [1.66, 1.48, 28.5], MAST, 1);
      p.line([1.61, 1.6, 27], [1.61, 1.6, 9], '#3a2a1a', 0.6);
      p.box(1.55, 1.54, 1.67, 1.66, 4.5, 4.5, '#b8b5ad');
      // The treadwheel, standing on edge beside the mast.
      const ring = (r: number, z0: number) => {
        const pts: [number, number, number][] = [];
        for (let k = 0; k <= 20; k++) {
          const t = (k / 20) * Math.PI * 2;
          pts.push([1.42 + Math.cos(t) * r, 1.62, z0 + Math.sin(t) * r * 34]);
        }
        return pts;
      };
      const outer = ring(0.26, 9.5);
      for (let k = 0; k < outer.length - 1; k++) p.line(outer[k], outer[k + 1], MAST, 1.6);
      for (let k = 0; k < 4; k++) {
        const t = (k / 4) * Math.PI;
        p.line([1.42 + Math.cos(t) * 0.26, 1.62, 9.5 + Math.sin(t) * 8.8], [1.42 - Math.cos(t) * 0.26, 1.62, 9.5 - Math.sin(t) * 8.8], MAST, 0.7);
      }
      p.line([1.42, 1.62, 9.5], [1.78, 1.2, 9.5], MAST, 1);
      p.line([1.3, 1.62, 0], [1.42, 1.62, 9.5], MAST, 1.2);
      p.line([1.54, 1.62, 0], [1.42, 1.62, 9.5], MAST, 1.2);
      break;
    }
    case 'sandpit': {
      // A sandy scrape by the water, heaps of sand, a riddle on legs and a barrow.
      const snow = season === 3;
      p.poly([[0.25, 0.9, 0], [1.4, 0.9, 0], [1.4, 1.8, 0], [0.25, 1.8, 0]], snow ? '#dcd6cc' : '#dcc288');
      p.poly([[0.4, 1.05, 0], [1.25, 1.05, 0], [1.25, 1.65, 0], [0.4, 1.65, 0]], snow ? '#c8c0b4' : '#c6a46a');
      for (let k = 0; k < 4; k++) p.line([0.48, 1.13 + k * 0.14, 0], [1.17, 1.13 + k * 0.14, 0], 'rgba(120,90,48,0.35)', 0.6);
      p.line([0.62, 1.42, 0], [0.82, 1.25, 10], '#6b4a2e', 1.2);
      mound(p, 1.62, 1.28, 12, snow ? '#eeeae4' : '#eed69a', snow ? '#c8c4bc' : '#c09a5a');
      mound(p, 1.75, 1.62, 8, snow ? '#eeeae4' : '#e8cc8c', snow ? '#c8c4bc' : '#b89052');
      p.line([1.66, 1.3, 8], [1.7, 1.26, 19], '#6b4a2e', 1.2);
      p.poly([[1.62, 1.3, 3], [1.72, 1.3, 3], [1.72, 1.3, 9], [1.62, 1.3, 9]], '#7a7e84');
      // The riddle: a sloping wire screen the sand is thrown through, a little heap of fine sand beneath.
      mound(p, 0.78, 0.72, 7, '#f2dea8', '#c8a466');
      for (const [x, y, h] of [[0.4, 0.4, 14], [1.1, 0.4, 14], [0.4, 0.68, 6], [1.1, 0.68, 6]] as const) p.line([x, y, 0], [x, y, h], '#5e4129', 1.4);
      p.poly([[0.36, 0.38, 14], [1.14, 0.38, 14], [1.14, 0.7, 6], [0.36, 0.7, 6]], 'rgba(90,70,40,0.25)', '#6b4a2e', 1.3);
      for (let k = 1; k < 6; k++) p.line([0.36 + k * 0.13, 0.38, 14], [0.36 + k * 0.13, 0.7, 6], 'rgba(70,60,50,0.55)', 0.4);
      for (let k = 1; k < 4; k++) p.line([0.36, 0.38 + k * 0.08, 14 - k * 2], [1.14, 0.38 + k * 0.08, 14 - k * 2], 'rgba(70,60,50,0.55)', 0.4);
      // A wheelbarrow of sand.
      p.line([1.42, 0.62, 3], [1.82, 0.62, 6], '#5e4129', 1.2);
      p.line([1.42, 0.82, 3], [1.82, 0.82, 6], '#5e4129', 1.2);
      p.box(1.4, 0.6, 1.66, 0.84, 3, 5, '#8a6440');
      p.poly([[1.42, 0.62, 8], [1.64, 0.62, 8], [1.64, 0.82, 8], [1.42, 0.82, 8]], '#e2c68a');
      p.ctx.strokeStyle = '#4a3020';
      p.ctx.lineWidth = 1.2;
      {
        const [wx, wy] = iso(1.36, 0.72, 3);
        p.ctx.beginPath();
        p.ctx.ellipse(wx, wy, 2.6, 3, 0, 0, Math.PI * 2);
        p.ctx.stroke();
      }
      break;
    }
    case 'limekiln': {
      p.shadow(0.2, 0.2, 1.75, 1.75);
      // A squat round kiln of rough stone, the fire glowing in its draw-arch.
      const [kx, ky] = iso(0.85, 0.85, 0);
      const r = 23;
      const H = 30;
      const c = p.ctx;
      const body = () => {
        c.beginPath();
        c.moveTo(kx - r, ky - H);
        c.lineTo(kx - r - 3, ky);
        c.ellipse(kx, ky, r + 3, (r + 3) * 0.5, 0, Math.PI, 0, true);
        c.lineTo(kx + r, ky - H);
        c.closePath();
      };
      body();
      const g = c.createLinearGradient(kx - r, 0, kx + r, 0);
      g.addColorStop(0, '#c4bdb0');
      g.addColorStop(0.55, '#aaa294');
      g.addColorStop(1, '#7e776c');
      c.fillStyle = g;
      c.fill();
      c.save();
      body();
      c.clip();
      const rand = mulberry32(31);
      c.strokeStyle = 'rgba(60,54,46,0.5)';
      c.lineWidth = 0.6;
      for (let k = 1; k < 8; k++) {
        const y = ky - H + k * 4.2;
        const w = r + (k * 3) / 8;
        c.beginPath();
        c.ellipse(kx, y, w, w * 0.5, 0, 0, Math.PI);
        c.stroke();
        for (let j = 0; j < 7; j++) {
          const t = (j + (k % 2) * 0.5 + rand() * 0.3) / 7;
          const jx = kx - w + t * 2 * w;
          const jy = y + w * 0.5 * Math.sqrt(Math.max(0, 1 - ((jx - kx) / w) ** 2));
          c.beginPath();
          c.moveTo(jx, jy);
          c.lineTo(jx, jy - 4.2);
          c.stroke();
        }
      }
      c.restore();
      // The open top, a ring of lime-white stone round a red glow.
      c.fillStyle = '#d8d2c4';
      c.beginPath();
      c.ellipse(kx, ky - H, r, r * 0.5, 0, 0, Math.PI * 2);
      c.fill();
      const glow = c.createRadialGradient(kx, ky - H, 1, kx, ky - H, r * 0.7);
      glow.addColorStop(0, '#ffd27a');
      glow.addColorStop(0.5, '#e0602a');
      glow.addColorStop(1, '#4a2a1c');
      c.fillStyle = glow;
      c.beginPath();
      c.ellipse(kx, ky - H, r * 0.7, r * 0.34, 0, 0, Math.PI * 2);
      c.fill();
      smoke.push([0.85, 0.85, H + 4]);
      // The draw-arch on the side towards us, burning.
      const ax = kx - 9;
      const ay = ky + 9;
      c.fillStyle = '#5a5248';
      c.beginPath();
      c.moveTo(ax - 8, ay);
      c.lineTo(ax - 8, ay - 9);
      c.ellipse(ax, ay - 9, 8, 7, 0, Math.PI, 0);
      c.lineTo(ax + 8, ay);
      c.closePath();
      c.fill();
      c.fillStyle = '#1e140e';
      c.beginPath();
      c.moveTo(ax - 5, ay);
      c.lineTo(ax - 5, ay - 8);
      c.ellipse(ax, ay - 8, 5, 5, 0, Math.PI, 0);
      c.lineTo(ax + 5, ay);
      c.closePath();
      c.fill();
      const fire = c.createLinearGradient(0, ay - 7, 0, ay);
      fire.addColorStop(0, '#f8c040');
      fire.addColorStop(1, '#d04a1a');
      c.fillStyle = fire;
      c.beginPath();
      c.moveTo(ax - 4, ay);
      c.quadraticCurveTo(ax - 3, ay - 5, ax - 1, ay - 7);
      c.quadraticCurveTo(ax, ay - 4, ax + 1.5, ay - 6);
      c.quadraticCurveTo(ax + 3, ay - 3, ax + 4, ay);
      c.closePath();
      c.fill();
      // A lean-to over the slaking trough, white with lime, and the sacks of mortar.
      for (const [x, y] of [[1.25, 1.2], [1.85, 1.2], [1.25, 1.75], [1.85, 1.75]]) p.line([x, y, 0], [x, y, 12], '#5e4129', 1.6);
      p.box(1.32, 1.3, 1.75, 1.5, 0, 4, '#7b5a36');
      p.poly([[1.34, 1.32, 4], [1.73, 1.32, 4], [1.73, 1.48, 4], [1.34, 1.48, 4]], '#ece8dc');
      p.sack(1.4, 1.68, '#efece4');
      p.sack(1.6, 1.68, '#e6e2d6');
      p.roofY(1.2, 1.15, 1.9, 1.8, 12, 5, 'plank', WOOD, 0.06);
      p.stonePile(0.25, 1.45, 4);
      p.logPile(0.7, 1.75, 2);
      break;
    }
    case 'collier': {
      // Turf-covered clamps smouldering in a clearing, a bark hut and the black harvest.
      const clamp = (x: number, y: number, rx: number, hgt: number, burning: boolean) => {
        const [cx, cy] = iso(x, y, 0);
        const c = p.ctx;
        c.fillStyle = 'rgba(20,16,10,0.3)';
        c.beginPath();
        c.ellipse(cx + 3, cy + 1, rx * 1.1, rx * 0.5, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(cx, cy, rx, rx * 0.5, 0, 0, Math.PI);
        c.ellipse(cx, cy, rx, hgt, 0, Math.PI, 0);
        const g = c.createLinearGradient(cx - rx, cy - hgt, cx + rx, cy);
        g.addColorStop(0, season === 3 ? '#e8e6e0' : '#6e7a44');
        g.addColorStop(0.6, season === 3 ? '#c8c6c0' : '#4e5a32');
        g.addColorStop(1, '#3a3424');
        c.fillStyle = g;
        c.fill();
        // Bare patches of blackened earth between the turves.
        const rand = mulberry32(Math.round(x * 50 + y * 7));
        for (let k = 0; k < 7; k++) {
          const a = Math.PI + rand() * Math.PI;
          const d = 0.3 + rand() * 0.55;
          c.fillStyle = k % 2 ? '#3a2e20' : '#4a3a26';
          c.beginPath();
          c.ellipse(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * hgt * d, 2.4, 1.3, 0, 0, Math.PI * 2);
          c.fill();
        }
        if (burning) {
          for (const [dx, dy] of [[-0.35, -0.55], [0.3, -0.45], [0, -0.85]]) {
            c.fillStyle = '#e8742a';
            c.beginPath();
            c.ellipse(cx + dx * rx, cy + dy * hgt, 1.6, 1, 0, 0, Math.PI * 2);
            c.fill();
          }
          smoke.push([x - 0.05, y - 0.05, hgt + 2]);
          smoke.push([x + 0.15, y - 0.1, hgt * 0.6]);
        }
      };
      clamp(1.35, 0.5, 22, 20, true);
      // A conical hut of poles and bark where the collier watches the burn.
      {
        const [hx, hy] = iso(0.45, 0.65, 0);
        const c = p.ctx;
        c.fillStyle = 'rgba(20,16,10,0.25)';
        c.beginPath();
        c.ellipse(hx + 3, hy + 1, 14, 6, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#7a5a3a';
        c.beginPath();
        c.moveTo(hx - 13, hy);
        c.lineTo(hx, hy - 30);
        c.lineTo(hx + 13, hy);
        c.quadraticCurveTo(hx, hy + 5, hx - 13, hy);
        c.fill();
        c.fillStyle = 'rgba(30,18,8,0.3)';
        c.beginPath();
        c.moveTo(hx, hy - 30);
        c.lineTo(hx + 13, hy);
        c.quadraticCurveTo(hx + 6, hy + 3.5, hx + 2, hy + 4);
        c.fill();
        c.strokeStyle = '#4a3420';
        c.lineWidth = 0.6;
        for (let k = -3; k <= 3; k++) {
          c.beginPath();
          c.moveTo(hx, hy - 30);
          c.lineTo(hx + k * 4, hy + 2 - Math.abs(k) * 0.4);
          c.stroke();
        }
        c.strokeStyle = '#3a2a18';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(hx - 2, hy - 34);
        c.lineTo(hx + 1, hy - 26);
        c.moveTo(hx + 2, hy - 34);
        c.lineTo(hx - 1, hy - 26);
        c.stroke();
        c.fillStyle = '#20160e';
        c.beginPath();
        c.moveTo(hx - 7, hy + 3);
        c.lineTo(hx - 3.5, hy - 11);
        c.lineTo(hx + 0.5, hy + 4);
        c.closePath();
        c.fill();
      }
      // A clamp being built: billets stood on end round the centre pole.
      {
        const [bx, by] = iso(1.55, 1.3, 0);
        const c = p.ctx;
        c.fillStyle = 'rgba(20,16,10,0.25)';
        c.beginPath();
        c.ellipse(bx + 2, by + 1, 15, 7, 0, 0, Math.PI * 2);
        c.fill();
        for (let row = 0; row < 3; row++) {
          const w = 13 - row * 4;
          for (let k = -3; k <= 3; k++) {
            const t = k / 3.5;
            const lx = bx + t * w;
            const ly = by - row * 6 + Math.sqrt(Math.max(0, 1 - t * t)) * w * 0.45;
            c.fillStyle = (k + row) % 2 ? '#8a6236' : '#a07446';
            c.fillRect(lx - 1.6, ly - 7, 3.2, 7);
            c.fillStyle = '#c8a06a';
            c.beginPath();
            c.ellipse(lx, ly - 7, 1.6, 0.8, 0, 0, Math.PI * 2);
            c.fill();
          }
        }
        c.strokeStyle = '#5e4129';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(bx, by - 14);
        c.lineTo(bx, by - 26);
        c.stroke();
      }
      p.logPile(1.2, 1.9, 3);
      // The charcoal itself, raked out in a black heap.
      mound(p, 0.5, 1.55, 11, '#4a4642', '#1c1a18');
      for (const [dx, dy] of [[-3, -3], [2, -5], [4, -2], [-1, -6]]) {
        const [mx, my] = iso(0.5, 1.55, 0);
        p.ctx.fillStyle = '#6a6560';
        p.ctx.fillRect(mx + dx, my + dy, 1.2, 0.8);
      }
      break;
    }
    case 'glassworks': {
      p.shadow(0.25, 0.25, 1.65, 1.5);
      // A stone furnace house with a tall stack, its working ports glowing white-hot.
      p.box(0.3, 0.3, 1.45, 1.3, 0, 17, STONE, undefined, 'stone');
      p.doorL(1.3, 1.1, 0.18, 11);
      p.windowL(1.3, 0.75, 6, 0.16, 6, season === 3);
      for (const y of [0.5, 0.9]) {
        p.wallR(1.452, y, y + 0.18, 3, 9, '#3a2418');
        p.wallR(1.453, y + 0.03, y + 0.15, 3.5, 8, '#f8b040');
        p.wallR(1.454, y + 0.06, y + 0.12, 4, 6.5, '#fff0b0');
      }
      p.roofX(0.3, 0.3, 1.45, 1.3, 17, 13, 'tile', STONE, 0.1);
      p.box(0.95, 0.5, 1.2, 0.75, 22, 20, '#8a7d70', undefined, 'stone');
      p.box(0.93, 0.48, 1.22, 0.77, 40, 2, '#6e645a');
      smoke.push([1.075, 0.625, 46]);
      // Sand heaped by the door, charcoal sacks, and a rack of new glass.
      mound(p, 1.75, 0.55, 9, '#eed69a', '#c09a5a');
      p.sack(1.72, 0.95, '#3e3a36');
      p.sack(1.85, 1.1, '#46423e');
      p.box(0.3, 1.5, 0.95, 1.6, 7, 1, '#8a6440');
      p.box(0.3, 1.5, 0.95, 1.6, 0, 1, '#8a6440');
      for (const x of [0.32, 0.93]) p.line([x, 1.58, 0], [x, 1.58, 8], BEAM, 1);
      const bottle = (x: number, y: number, z: number, col: string) => {
        const [bx, by] = iso(x, y, z);
        const c = p.ctx;
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(bx - 0.8, by - 6);
        c.lineTo(bx - 0.8, by - 4);
        c.quadraticCurveTo(bx - 2.6, by - 3, bx - 2.2, by);
        c.lineTo(bx + 2.2, by);
        c.quadraticCurveTo(bx + 2.6, by - 3, bx + 0.8, by - 4);
        c.lineTo(bx + 0.8, by - 6);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fillRect(bx - 1.4, by - 3, 0.7, 2.2);
      };
      const glassCols = ['rgba(120,200,170,0.85)', 'rgba(90,150,200,0.85)', 'rgba(160,210,150,0.85)', 'rgba(200,220,210,0.85)'];
      for (let k = 0; k < 4; k++) {
        bottle(0.4 + k * 0.15, 1.55, 1, glassCols[k % 4]);
        bottle(0.45 + k * 0.14, 1.55, 8, glassCols[(k + 1) % 4]);
      }
      // Panes leaning against the wall.
      // A finished window of stained glass, leaded and propped against the wall.
      {
        const x = 1.5;
        p.poly([[x, 1.36, 0], [x, 1.62, 0], [x + 0.06, 1.62, 13], [x + 0.06, 1.36, 13]], '#3a3a44');
        const cols = ['#3a62c4', '#c42b3a', '#d8a838', '#4f8a3c'];
        const f = (z: number) => x + (z / 13) * 0.06;
        for (let k = 0; k < 4; k++) {
          for (let j = 0; j < 2; j++) {
            const z0 = 1 + k * 2.8;
            const ya = 1.385 + j * 0.11;
            const yb = ya + 0.1;
            p.poly([[f(z0), ya, z0], [f(z0), yb, z0], [f(z0 + 2.5), yb, z0 + 2.5], [f(z0 + 2.5), ya, z0 + 2.5]], cols[(k * 2 + j * 3 + (k >> 1)) % 4]);
          }
        }
      }
      for (let k = 0; k < 3; k++) {
        const x = 1.66 + k * 0.05;
        p.poly([[x, 1.35, 0], [x, 1.6, 0], [x + 0.06, 1.6, 10], [x + 0.06, 1.35, 10]], 'rgba(170,225,215,0.55)', 'rgba(70,130,120,0.8)', 0.5);
      }
      break;
    }
    case 'dyer': {
      p.shadow(0.25, 0.25, 1.4, 1.1);
      // A workshop by its vats, blue cloth drying on the racks.
      p.box(0.3, 0.3, 1.3, 1.0, 0, 14, PLASTER);
      p.timber(0.3, 0.3, 1.3, 1.0, 0, 14, BEAM);
      p.doorL(1.0, 0.95, 0.18, 10);
      p.windowL(1.0, 0.5, 5, 0.16, 5, season === 3);
      p.roofX(0.3, 0.3, 1.3, 1.0, 14, 12, 'thatch', PLASTER, 0.1);
      // A copper over a fire, steaming.
      {
        const [cx, cy] = iso(1.72, 1.12, 0);
        const c = p.ctx;
        c.fillStyle = '#7a7268';
        c.fillRect(cx - 8, cy - 6, 16, 6);
        c.fillStyle = '#2a1a10';
        c.fillRect(cx - 3, cy - 5, 6, 5);
        c.fillStyle = '#f0902a';
        c.fillRect(cx - 2, cy - 3, 4, 3);
        c.fillStyle = '#b06a3a';
        c.beginPath();
        c.moveTo(cx - 9, cy - 6);
        c.quadraticCurveTo(cx - 9, cy - 13, cx, cy - 13);
        c.quadraticCurveTo(cx + 9, cy - 13, cx + 9, cy - 6);
        c.closePath();
        c.fill();
        c.fillStyle = '#2f4fa8';
        c.beginPath();
        c.ellipse(cx, cy - 12.5, 8, 3, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#d8945a';
        c.lineWidth = 0.8;
        c.beginPath();
        c.ellipse(cx, cy - 12.5, 8, 3, 0, 0, Math.PI * 2);
        c.stroke();
        smoke.push([1.72, 1.12, 16]);
      }
      // Steeping vats of woad, the scum on top a coppery blue.
      for (const [x, y, liq] of [[0.45, 1.3, '#2a4a9a'], [0.82, 1.38, '#35589e'], [0.6, 1.7, '#3a6a8a']] as [number, number, string][]) tub(p, x, y, 8.5, 8, liq);
      // Drying rack with hanging lengths of blue.
      for (const y of [0.25, 0.85]) p.line([1.75, y, 0], [1.75, y, 17], '#5e4129', 1.5);
      p.line([1.75, 0.25, 17], [1.75, 0.85, 17], '#5e4129', 1);
      for (const [a, b2, col] of [[0.28, 0.42, '#2a4a9a'], [0.46, 0.6, '#4a6ab8'], [0.64, 0.8, '#203c80']] as [number, number, string][]) {
        p.wallR(1.75, a, b2, 5, 16.5, col);
        p.line([1.751, a, 5], [1.751, b2, 5], 'rgba(255,255,255,0.18)', 0.6);
      }
      // A basket of fresh woad leaves.
      tub(p, 1.15, 1.7, 5, 4, '#5f8f6a', '#9a7a4a');
      break;
    }
    case 'watchtower': {
      // A square stone tower with a timber gallery and a shingled cap.
      const ST = '#a8a093';
      p.shadow(0.18, 0.18, 0.82, 0.82);
      p.box(0.2, 0.2, 0.8, 0.8, 0, 6, '#9b9284', undefined, 'stone');
      p.box(0.24, 0.24, 0.76, 0.76, 6, 52, ST, undefined, 'stone');
      p.doorL(0.76, 0.4, 0.18, 11);
      p.windowL(0.76, 0.43, 26, 0.12, 6);
      p.windowR(0.76, 0.45, 38, 0.1, 6);
      // Gallery on beams, open between the posts.
      for (const t of [0.3, 0.5, 0.7]) {
        p.line([t, 0.82, 52], [t, 0.82, 56], BEAM, 1.2);
        p.line([0.82, t, 52], [0.82, t, 56], BEAM, 1.2);
      }
      p.box(0.14, 0.14, 0.86, 0.86, 56, 2, WOOD);
      for (const t of [0.14, 0.38, 0.62, 0.86]) {
        p.line([t, 0.86, 58], [t, 0.86, 68], BEAM, 1.3);
        p.line([0.86, t, 58], [0.86, t, 68], BEAM, 1.3);
      }
      p.line([0.14, 0.86, 62], [0.86, 0.86, 62], BEAM, 1.1);
      p.line([0.86, 0.14, 62], [0.86, 0.86, 62], BEAM, 1.1);
      p.roofPyramid(0.14, 0.14, 0.86, 0.86, 68, 18, 'shingle', 0.06);
      // A brazier glows at the rail.
      p.circle(0.7, 0.84, 63.5, 1.4, '#e8892a');
      p.lordFlag(0.5, 0.5, 86, 16);
      break;
    }
    case 'manorgarden': {
      // The lord's pleasure garden on 10x10: a hedged enclosure with an avenue
      // of trees, walks crossing at a great fountain, four knot gardens, a
      // rose tunnel, a pavilion over a lily pond, topiary and statues.
      const N = 10;
      const winter = season === 3;
      const lawn = winter ? '#e2e7e6' : season === 2 ? '#8a9a48' : '#6fa043';
      const gravel = winter ? '#d4d8d6' : '#d2c39c';
      const hedge = winter ? '#8a9a86' : '#3d6b30';
      const flowers = winter ? [] : season === 2 ? ['#d8903a', '#b8503a', '#e0c040', '#9a3a2a'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0', '#e86a3a', '#f07ab0'];
      const rand = mulberry32(31);
      const rect = (x0: number, y0: number, x1: number, y1: number, col: string) => p.poly([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], col);
      rect(0.05, 0.05, N - 0.05, N - 0.05, lawn);
      // Walks: round the inside of the hedge, and the two great walks crossing.
      rect(0.5, 0.5, N - 0.5, 0.95, gravel);
      rect(0.5, 0.5, 0.95, N - 0.5, gravel);
      rect(N - 0.95, 0.5, N - 0.5, N - 0.5, gravel);
      rect(0.5, N - 0.95, N - 0.5, N - 0.5, gravel);
      rect(4.6, 0.5, 5.4, N - 0.2, gravel);
      rect(0.5, 4.6, N - 0.5, 5.4, gravel);
      const yew = (x: number, y: number, h = 20) => {
        const [tx, ty] = iso(x, y, 0);
        const c = p.ctx;
        c.fillStyle = 'rgba(30,30,10,0.2)';
        c.beginPath();
        c.ellipse(tx + 2, ty, 5, 2, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = winter ? '#9aa894' : '#2f5a28';
        c.beginPath();
        c.moveTo(tx - 4.5, ty - 1);
        c.quadraticCurveTo(tx, ty + 2, tx + 4.5, ty - 1);
        c.lineTo(tx, ty - h);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.beginPath();
        c.moveTo(tx - 4.5, ty - 1);
        c.lineTo(tx, ty - h);
        c.lineTo(tx - 1, ty);
        c.closePath();
        c.fill();
      };
      const tree = (x: number, y: number, crown: string) => {
        p.line([x, y, 0], [x, y, 16], '#5a3e26', 2.2);
        if (winter) return;
        p.circle(x + 0.05, y + 0.05, 19, 9, shade(crown, 0.8));
        p.circle(x - 0.04, y, 21, 8, crown);
        p.circle(x + 0.07, y - 0.06, 25, 5.5, shade(crown, 1.1));
      };
      const statue = (x: number, y: number) => {
        p.box(x - 0.12, y - 0.12, x + 0.12, y + 0.12, 0, 7, '#c8c2b6', undefined, 'stone');
        p.box(x - 0.05, y - 0.04, x + 0.05, y + 0.04, 7, 12, '#e0dad0');
        p.circle(x, y, 21, 2.2, '#e0dad0');
      };
      // A knot garden: box hedges in a square with a cross and diagonals, flowers between.
      const knot = (x0: number, y0: number, x1: number, y1: number) => {
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        if (flowers.length) {
          for (let k = 0; k < 120; k++) {
            const x = x0 + 0.15 + rand() * (x1 - x0 - 0.3);
            const y = y0 + 0.15 + rand() * (y1 - y0 - 0.3);
            p.bush(x, y, 1.9, '#4a7a34');
            p.circle(x, y, 2.6, 1.3, flowers[k % flowers.length]);
          }
        }
        p.box(x0, y0, x1, y0 + 0.1, 0, 3, hedge);
        p.box(x0, y0, x0 + 0.1, y1, 0, 3, hedge);
        p.box(mx - 0.05, y0, mx + 0.05, y1, 0, 3, hedge);
        p.box(x0, my - 0.05, x1, my + 0.05, 0, 3, hedge);
        p.box(x1 - 0.1, y0, x1, y1, 0, 3, hedge);
        p.box(x0, y1 - 0.1, x1, y1, 0, 3, hedge);
        yew(mx, my, 16);
      };
      // Back left: a lily pond with a pavilion beside it.
      {
        const [px, py] = iso(2.6, 2.6, 0);
        const c = p.ctx;
        c.fillStyle = '#a49c8e';
        c.beginPath();
        c.ellipse(px, py, 58, 29, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = winter ? '#dfe8ec' : '#5f9ab8';
        c.beginPath();
        c.ellipse(px, py - 1, 53, 26, 0, 0, Math.PI * 2);
        c.fill();
        if (!winter) {
          for (const [dx, dy] of [[-20, 4], [10, -8], [24, 6], [-6, 12]]) {
            c.fillStyle = '#4f8a3a';
            c.beginPath();
            c.ellipse(px + dx, py + dy, 5, 2.4, 0, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#f2c8d8';
            c.beginPath();
            c.arc(px + dx + 1, py + dy - 1, 1.3, 0, Math.PI * 2);
            c.fill();
          }
        }
        const x0 = 1.2;
        const y0 = 1.2;
        p.box(x0, y0, x0 + 1.0, y0 + 1.0, 0, 3, '#c8c2b6', '#d8d2c6');
        for (const [x, y] of [[x0 + 0.1, y0 + 0.1], [x0 + 0.9, y0 + 0.1], [x0 + 0.9, y0 + 0.9], [x0 + 0.1, y0 + 0.9]]) p.box(x - 0.04, y - 0.04, x + 0.04, y + 0.04, 3, 24, '#e8e0d0');
        p.roofPyramid(x0 - 0.04, y0 - 0.04, x0 + 1.04, y0 + 1.04, 27, 18, 'slate', 0.08);
        p.circle(x0 + 0.5, y0 + 0.5, 46, 1.8, '#c8962a');
      }
      // Back right: a knot garden. Front left: another, and front right a third.
      knot(5.8, 1.3, 8.7, 4.2);
      knot(1.3, 5.8, 4.2, 8.7);
      knot(5.8, 5.8, 8.7, 8.7);
      // A rose tunnel of arches along the back walk of the right garden.
      for (let k = 0; k < 9; k++) {
        const x = 5.7 + k * 0.38;
        p.line([x, 0.55, 0], [x, 0.55, 18], '#e8e0d0', 1.4);
        p.line([x, 0.9, 0], [x, 0.9, 18], '#e8e0d0', 1.4);
        p.line([x, 0.55, 18], [x, 0.9, 18], '#e8e0d0', 1.4);
        if (!winter) {
          p.circle(x, 0.6, 15, 2.6, k % 2 ? '#4a7a34' : '#5a8a3e');
          p.circle(x, 0.88, 14, 2.4, '#4a7a34');
          p.circle(x + 0.05, 0.7, 18.5, 1.8, k % 3 ? '#c8486a' : '#f07ab0');
          p.circle(x - 0.05, 0.85, 16, 1.6, '#e84a6a');
        }
      }
      // The great fountain where the walks cross: two basins and a jet.
      {
        const [fx, fy] = iso(5.0, 5.0, 0);
        const c = p.ctx;
        c.fillStyle = '#a49c8e';
        c.beginPath();
        c.ellipse(fx, fy - 3, 44, 22, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#8a8274';
        c.fillRect(fx - 44, fy - 3, 88, 4);
        c.beginPath();
        c.ellipse(fx, fy + 1, 44, 22, 0, 0, Math.PI);
        c.fill();
        c.fillStyle = winter ? '#dfe8ec' : '#5f9ab8';
        c.beginPath();
        c.ellipse(fx, fy - 3.5, 39, 19, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#b6ae9f';
        c.fillRect(fx - 3, fy - 26, 6, 23);
        c.beginPath();
        c.ellipse(fx, fy - 26, 14, 6, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = winter ? '#dfe8ec' : '#7ab0c8';
        c.beginPath();
        c.ellipse(fx, fy - 27, 11, 4.4, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#b6ae9f';
        c.fillRect(fx - 1.5, fy - 38, 3, 11);
        if (!winter) {
          c.strokeStyle = 'rgba(220,240,250,0.85)';
          c.lineWidth = 1.2;
          for (const d of [-1, 1]) {
            c.beginPath();
            c.moveTo(fx, fy - 44);
            c.quadraticCurveTo(fx + d * 9, fy - 50, fx + d * 13, fy - 28);
            c.stroke();
            c.beginPath();
            c.moveTo(fx + d * 9, fy - 27);
            c.quadraticCurveTo(fx + d * 18, fy - 30, fx + d * 24, fy - 6);
            c.stroke();
          }
          c.beginPath();
          c.moveTo(fx, fy - 38);
          c.lineTo(fx, fy - 46);
          c.stroke();
        }
      }
      // Statues at the ends of the walks and yews flanking them.
      for (const [x, y] of [[5.0, 2.3], [2.3, 5.0], [7.7, 5.0], [5.0, 7.7]] as const) statue(x, y);
      for (const [x, y] of [[4.4, 4.4], [5.6, 4.4], [4.4, 5.6], [5.6, 5.6]] as const) yew(x, y, 18);
      // An avenue of ornamental trees down the two far walks, and the corners.
      const crown = winter ? '#9aa894' : season === 0 ? '#f0c4d4' : season === 2 ? '#d0803a' : '#4f8a3a';
      for (let k = 1; k < 10; k += 2) {
        if (k !== 5) tree(0.3, k, crown);
      }
      for (let k = 3; k < 10; k += 2) if (k !== 5) tree(k, 0.3, crown);
      // The hedge round it all, open where the great walk meets the street.
      p.box(N - 0.3, 0.1, N - 0.1, 4.5, 0, 7, hedge);
      p.box(N - 0.3, 5.5, N - 0.1, N - 0.1, 0, 7, hedge);
      p.box(0.1, N - 0.3, 4.5, N - 0.1, 0, 7, hedge);
      p.box(5.5, N - 0.3, N - 0.1, N - 0.1, 0, 7, hedge);
      for (const [x, y] of [[4.5, N - 0.2], [5.5, N - 0.2], [N - 0.2, 4.5], [N - 0.2, 5.5]] as const) {
        p.box(x - 0.14, y - 0.14, x + 0.14, y + 0.14, 0, 14, '#c8c2b6', undefined, 'stone');
        p.circle(x, y, 17, 2.4, '#d8d2c6');
      }
      for (const [x, y] of [[1.2, 7.3], [2.8, 9.0], [9.0, 2.8], [7.3, 1.2]] as const) if (!winter) p.bush(x, y, 5, '#557a38');
      break;
    }
    case 'watermill': {
      // Stone below, timber above, and the wheel turning in its race on the water side.
      p.shadow(0.3, 0.3, 1.35, 1.6);
      p.box(0.3, 0.3, 1.35, 1.6, 0, 12, STONE, undefined, 'stone');
      p.box(0.28, 0.28, 1.37, 1.62, 12, 13, PLASTER);
      p.timber(0.28, 0.28, 1.37, 1.62, 12, 13, BEAM);
      p.doorL(1.6, 0.55, 0.2, 10);
      p.windowL(1.62, 0.95, 16, 0.14, 6, season === 3);
      p.windowR(1.37, 0.6, 16, 0.14, 6);
      p.roofX(0.28, 0.28, 1.37, 1.62, 25, 18, 'tile', PLASTER, 0.1);
      smoke.push(p.chimney(0.5, 0.6, 32, 10, '#8f8476'));
      // The race: a timber flume bringing water over the wheel.
      p.box(1.4, 0.2, 1.85, 0.36, 22, 3, WOOD);
      if (season !== 3) p.poly([[1.42, 0.22, 25], [1.83, 0.22, 25], [1.83, 0.34, 25], [1.42, 0.34, 25]], '#6aa0c0');
      p.line([1.84, 0.28, 0], [1.84, 0.28, 22], BEAM, 1.6);
      // The wheel, upright beside the wall.
      waterWheel(p, 1.62, 0.95, 12, 0.5, 12, season);
      if (season !== 3) {
        // Water spilling off the paddles into the stream.
        p.line([1.7, 0.42, 22], [1.7, 0.5, 12], 'rgba(170,210,230,0.8)', 1.4);
        p.line([1.7, 0.6, 2], [1.7, 1.5, 0], 'rgba(200,230,240,0.7)', 1);
      }
      p.sack(0.5, 1.8, '#efe6d4');
      p.sack(0.7, 1.85, '#e8dcc4');
      break;
    }
    case 'dock': {
      // A timber quay out over the water, a warehouse, a crane and a cog moored
      // alongside. Variant 1 builds the quay out to the front instead of the side.
      const front = variant === 1;
      const P = (x: number, y: number): [number, number] => (front ? [y, x] : [x, y]);
      const bx0 = (x0: number, y0: number, x1: number, y1: number, z: number, h: number, col: string, top?: string, mat?: Material) => {
        const [ax, ay] = P(x0, y0);
        const [cx, cy] = P(x1, y1);
        p.box(Math.min(ax, cx), Math.min(ay, cy), Math.max(ax, cx), Math.max(ay, cy), z, h, col, top, mat);
      };
      const ln = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: string, w: number) => p.line([...P(x0, y0), z0], [...P(x1, y1), z1], col, w);
      // The warehouse at the landward end.
      p.shadow(0.15, 0.2, 1.3, 1.3);
      p.box(0.15, 0.2, 1.3, 1.3, 0, 18, WOOD, undefined, 'plank');
      p.timber(0.15, 0.2, 1.3, 1.3, 0, 18, '#5a3a22');
      if (front) p.wallL(1.302, 0.5, 1.0, 0, 14, '#3a2a1e');
      else p.wallR(1.302, 0.5, 1.0, 0, 14, '#3a2a1e');
      if (front) p.roofX(0.15, 0.2, 1.3, 1.3, 18, 16, 'shingle', WOOD, 0.1);
      else p.roofY(0.15, 0.2, 1.3, 1.3, 18, 16, 'shingle', WOOD, 0.1);
      // The deck on its piles.
      for (const x of [1.45, 2.05, 2.6, 2.95]) for (const y of [0.25, 1.5, 2.75]) ln(x, y, -6, x, y, 3, '#4a3020', 1.6);
      bx0(1.35, 0.1, 3.0, 2.9, 2, 2, '#9a7247', '#a8805a', 'plank');
      for (let x = 1.45; x < 3.0; x += 0.18) ln(x, 0.1, 4.01, x, 2.9, 4.01, 'rgba(70,45,25,0.35)', 0.5);
      // Goods waiting on the quay.
      for (const [x, y, sz] of [[1.5, 2.3, 0.18], [1.72, 2.4, 0.16], [1.55, 2.55, 0.15]] as const) {
        const [cx, cy] = P(x, y);
        p.crate(cx, cy, sz);
      }
      for (const [x, y] of [[2.05, 2.35], [2.2, 2.5]] as const) {
        const [cx, cy] = P(x, y);
        p.barrel(cx, cy);
      }
      bx0(2.85, 2.6, 2.95, 2.7, 4, 4, '#4a3020');
      // The crane: a post, a jib and a crate on the rope.
      ln(2.3, 0.45, 4, 2.3, 0.45, 34, '#5e4129', 2.2);
      ln(2.3, 0.45, 32, 2.95, 0.65, 30, '#5e4129', 1.6);
      ln(2.3, 0.45, 18, 2.7, 0.57, 31, '#5e4129', 1);
      ln(2.92, 0.65, 30, 2.92, 0.65, 16, '#c8b48c', 0.6);
      {
        const [cx, cy] = P(2.85, 0.58);
        p.crate(cx, cy, 0.14);
      }
      // A cog moored on the water side.
      {
        const c = p.ctx;
        const [ox, oy] = P(3.35, 1.5);
        const [bx, by] = iso(ox, oy, 0);
        const f = front ? -1 : 1;
        c.fillStyle = 'rgba(30,40,50,0.25)';
        c.beginPath();
        c.ellipse(bx + 2, by + 2, 26, 9, -0.46 * f, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#6b4a2c';
        c.beginPath();
        c.moveTo(bx - 26 * f, by + 12);
        c.lineTo(bx + 24 * f, by - 13);
        c.lineTo(bx + 22 * f, by - 5);
        c.quadraticCurveTo(bx + 4 * f, by + 10, bx - 22 * f, by + 20);
        c.closePath();
        c.fill();
        c.fillStyle = '#8a6440';
        c.beginPath();
        c.moveTo(bx - 26 * f, by + 12);
        c.lineTo(bx + 24 * f, by - 13);
        c.lineTo(bx + 20 * f, by - 15);
        c.lineTo(bx - 28 * f, by + 9);
        c.closePath();
        c.fill();
        c.strokeStyle = '#4a3020';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx, by - 46);
        c.stroke();
        c.fillStyle = season === 3 ? '#e8e4dc' : '#efe6d4';
        c.beginPath();
        c.moveTo(bx - 12, by - 42);
        c.quadraticCurveTo(bx + 2, by - 36, bx + 14, by - 46);
        c.lineTo(bx + 14, by - 20);
        c.quadraticCurveTo(bx + 2, by - 12, bx - 12, by - 16);
        c.closePath();
        c.fill();
        c.fillStyle = HERALDRY.current.field;
        c.fillRect(bx - 1, by - 52, 8, 5);
      }
      p.flag(0.25, 1.4, 0, 30, '#c8962a');
      break;
    }
    case 'cooper': {
      // A plank workshop with a saw horse, crates stacked to go.
      p.shadow(0.3, 0.3, 1.5, 1.3);
      p.box(0.3, 0.3, 1.45, 1.25, 0, 15, WOOD, undefined, 'plank');
      p.timber(0.3, 0.3, 1.45, 1.25, 0, 15, BEAM);
      p.wallL(1.252, 0.5, 1.0, 0, 11, '#3a2a1e');
      p.windowR(1.45, 0.55, 6, 0.14, 5);
      p.roofX(0.3, 0.3, 1.45, 1.25, 15, 13, 'shingle', WOOD, 0.1);
      smoke.push(p.chimney(1.15, 0.6, 22, 8));
      p.box(0.4, 1.45, 0.75, 1.55, 3, 1.5, '#8a6440');
      for (const [x, y] of [[0.42, 1.47], [0.73, 1.53]] as const) p.line([x, y, 0], [x, y, 3], BEAM, 1);
      p.line([0.38, 1.5, 5.5], [0.8, 1.5, 5.5], '#c8a46c', 3);
      // Two neat stacks of crates, drawn from the back: two below, one on top.
      const crate = (x: number, y: number, z: number) => {
        const k = 0.2;
        p.box(x, y, x + k, y + k, z, 7, '#a07a48');
        p.line([x, y + k, z + 0.5], [x + k, y + k, z + 6.5], '#6e5030', 0.6);
        p.line([x + k, y, z + 0.5], [x + k, y + k, z + 6.5], '#6e5030', 0.6);
      };
      crate(0.95, 1.45, 0);
      crate(1.17, 1.45, 0);
      crate(1.06, 1.45, 7);
      crate(1.6, 0.55, 0);
      crate(1.6, 0.77, 0);
      crate(1.6, 0.66, 7);
      // Planks waiting to be cut.
      for (let i = 0; i < 3; i++) p.box(1.55, 1.1, 1.85, 1.3, i * 2, 2, i % 2 ? '#d7b47c' : '#c8a46c');
      break;
    }
    case 'potter': {
      // A workshop with a wheel under the eaves, a little bottle kiln and shelves of pots.
      p.shadow(0.3, 0.3, 1.4, 1.3);
      p.box(0.3, 0.3, 1.3, 1.2, 0, 14, PLASTER);
      p.timber(0.3, 0.3, 1.3, 1.2, 0, 14, BEAM);
      p.doorL(1.2, 0.85, 0.18, 10);
      p.windowL(1.2, 0.45, 5, 0.16, 5, season === 3);
      p.roofX(0.3, 0.3, 1.3, 1.2, 14, 13, 'tile', PLASTER, 0.1);
      {
        const [kx, ky] = iso(1.65, 0.6, 0);
        const c = p.ctx;
        c.fillStyle = '#9a5a40';
        c.beginPath();
        c.moveTo(kx - 9, ky);
        c.quadraticCurveTo(kx - 12, ky - 16, kx - 4, ky - 24);
        c.lineTo(kx - 3, ky - 32);
        c.lineTo(kx + 3, ky - 32);
        c.lineTo(kx + 4, ky - 24);
        c.quadraticCurveTo(kx + 12, ky - 16, kx + 9, ky);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(40,10,0,0.25)';
        c.fillRect(kx + 1, ky - 30, 4, 30);
        c.fillStyle = '#2a1a10';
        c.beginPath();
        c.ellipse(kx, ky - 1, 3.5, 3.5, 0, Math.PI, 0);
        c.fill();
        c.fillStyle = '#f08a2a';
        c.fillRect(kx - 2, ky - 2, 4, 1.6);
        smoke.push([1.65, 0.6, 26]);
      }
      // Shelves of pots in the yard.
      p.box(0.4, 1.45, 1.25, 1.55, 6, 1, '#8a6440');
      p.box(0.4, 1.45, 1.25, 1.55, 0, 1, '#8a6440');
      for (const x of [0.42, 1.23]) p.line([x, 1.53, 0], [x, 1.53, 7], BEAM, 1);
      const pot = (x: number, y: number, z: number, col: string) => {
        const [px, py] = iso(x, y, z);
        const c = p.ctx;
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(px - 1.2, py - 5);
        c.quadraticCurveTo(px - 3.4, py - 3, px - 1.8, py);
        c.lineTo(px + 1.8, py);
        c.quadraticCurveTo(px + 3.4, py - 3, px + 1.2, py - 5);
        c.closePath();
        c.fill();
        c.fillStyle = '#e8c070';
        c.fillRect(px - 2.4, py - 3, 4.8, 0.8);
      };
      const cols = ['#b8583a', '#3a6a8a', '#c88a3a', '#6a8a5a'];
      for (let k = 0; k < 5; k++) {
        pot(0.52 + k * 0.16, 1.5, 1, cols[k % 4]);
        pot(0.6 + k * 0.14, 1.5, 7, cols[(k + 2) % 4]);
      }
      break;
    }
    case 'publicgarden': {
      // A public green: lawns, a winding walk, a pond with ducks, shade trees, beds and benches.
      const winter = season === 3;
      p.poly([[0.05, 0.05, 0], [2.95, 0.05, 0], [2.95, 2.95, 0], [0.05, 2.95, 0]], winter ? '#e2e7e6' : '#78a848');
      const walk: V3[] = [];
      for (let t = 0; t <= 1.0001; t += 0.05) walk.push([0.2 + t * 2.6, 2.6 - t * 2.2 + Math.sin(t * 6) * 0.25, 0]);
      for (let k = walk.length - 1; k >= 0; k--) walk.push([walk[k][0] + 0.18, walk[k][1] + 0.18, 0]);
      p.poly(walk, winter ? '#d4d8d6' : '#d2c39c');
      {
        const [px, py] = iso(0.95, 0.95, 0);
        const c = p.ctx;
        c.fillStyle = '#8a8274';
        c.beginPath();
        c.ellipse(px, py, 26, 13, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = winter ? '#dfe8ec' : '#5f9ab8';
        c.beginPath();
        c.ellipse(px, py - 0.5, 23, 11, 0, 0, Math.PI * 2);
        c.fill();
        if (!winter) {
          for (const [dx, dy] of [[-6, -2], [5, 3]]) {
            c.fillStyle = '#f2ece0';
            c.beginPath();
            c.ellipse(px + dx, py + dy, 2.4, 1.4, 0, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#3d7a3a';
            c.beginPath();
            c.arc(px + dx + 2, py + dy - 1.6, 1.1, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
      const flowers = winter ? [] : season === 2 ? ['#d88a3a', '#b8482a', '#e0c040'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0'];
      const rand = mulberry32(77);
      for (const [cx, cy] of [[2.2, 2.2], [0.6, 2.3], [2.3, 0.7]] as const) {
        for (let k = 0; k < 14 && flowers.length; k++) {
          const x = cx + (rand() - 0.5) * 0.5;
          const y = cy + (rand() - 0.5) * 0.4;
          p.bush(x, y, 2, '#4f8a34');
          p.circle(x, y, 2.8, 1.3, flowers[k % flowers.length]);
        }
      }
      const crown = winter ? '#9aa894' : season === 2 ? '#c8783a' : '#4f8a3a';
      const tree = (x: number, y: number) => {
        p.line([x, y, 0], [x, y, 14], '#5a3e26', 2);
        if (winter) return;
        p.circle(x + 0.05, y + 0.05, 17, 9, shade(crown, 0.8));
        p.circle(x - 0.04, y, 19, 8, crown);
        p.circle(x + 0.06, y - 0.06, 23, 5, shade(crown, 1.12));
      };
      const bench = (x: number, y: number) => {
        p.box(x, y, x + 0.3, y + 0.08, 2.5, 1.2, '#8a6236');
        p.line([x + 0.03, y + 0.07, 0], [x + 0.03, y + 0.07, 2.5], '#5e4129', 1);
        p.line([x + 0.27, y + 0.07, 0], [x + 0.27, y + 0.07, 2.5], '#5e4129', 1);
      };
      // Trees and benches back to front, so nearer ones cover farther ones.
      const things: [number, number, () => void][] = [
        ...([[0.3, 0.3], [2.7, 1.5], [1.5, 2.75], [0.25, 1.7]] as const).map(([x, y]) => [x, y, () => tree(x, y)] as [number, number, () => void]),
        ...([[1.55, 1.2], [1.5, 1.92]] as const).map(([x, y]) => [x + 0.15, y + 0.04, () => bench(x, y)] as [number, number, () => void]),
      ];
      things.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
      for (const t of things) t[2]();
      break;
    }
    case 'markethall': {
      // An open arcade of stone arches with stalls inside, a timber hall above, a turret.
      const ST = '#c4bba9';
      p.shadow(0.2, 0.2, 3.8, 2.8);
      // The stall floor, seen through the arches.
      p.poly([[0.25, 0.25, 0], [3.75, 0.25, 0], [3.75, 2.75, 0], [0.25, 2.75, 0]], season === 3 ? '#d6dadb' : '#b5a88e');
      const awnings = ['#b8483a', '#2e5e9a', '#c8962a', '#3d7a3a', '#6a3a7a'];
      for (let k = 0; k < 5; k++) {
        const x = 0.5 + k * 0.62;
        p.box(x, 2.2, x + 0.42, 2.45, 0, 5, '#8a6440');
        p.poly([[x - 0.03, 2.15, 12], [x + 0.45, 2.15, 12], [x + 0.45, 2.55, 9], [x - 0.03, 2.55, 9]], awnings[k]);
        for (let j = 0; j < 3; j++) p.circle(x + 0.08 + j * 0.12, 2.32, 6, 1.6, ['#d8b44a', '#b23040', '#e8dcc4', '#5d9a3a', '#c8904a'][(k + j) % 5]);
      }
      // Piers and arches on the two open faces.
      for (let k = 0; k <= 5; k++) {
        const x = 0.2 + k * 0.72;
        p.box(x - 0.08, 2.7, x + 0.08, 2.86, 0, 20, ST, undefined, 'stone');
      }
      for (let k = 0; k <= 3; k++) {
        const y = 0.2 + k * 0.88;
        p.box(3.7, y - 0.08, 3.86, y + 0.08, 0, 20, ST, undefined, 'stone');
      }
      for (let k = 0; k < 5; k++) {
        const x0 = 0.28 + k * 0.72;
        p.poly([[x0, 2.86, 20], [x0 + 0.56, 2.86, 20], [x0 + 0.56, 2.86, 16], [x0 + 0.28, 2.86, 14], [x0, 2.86, 16]], ST);
      }
      for (let k = 0; k < 3; k++) {
        const y0 = 0.28 + k * 0.88;
        p.poly([[3.86, y0, 20], [3.86, y0 + 0.72, 20], [3.86, y0 + 0.72, 16], [3.86, y0 + 0.36, 14], [3.86, y0, 16]], shade(ST, 0.85));
      }
      // The hall above on the arcade.
      p.box(0.12, 0.12, 3.88, 2.88, 20, 2, '#8a8274');
      p.box(0.15, 0.15, 3.85, 2.85, 22, 13, PLASTER);
      p.timber(0.15, 0.15, 3.85, 2.85, 22, 13, BEAM);
      for (let k = 0; k < 6; k++) p.windowL(2.85, 0.35 + k * 0.58, 25, 0.18, 6, season === 3 && k % 2 === 0);
      for (let k = 0; k < 4; k++) p.windowR(3.85, 0.35 + k * 0.6, 25, 0.18, 6);
      p.roofX(0.15, 0.15, 3.85, 2.85, 35, 28, 'tile', PLASTER, 0.12);
      // A clock turret on the ridge.
      p.box(1.8, 1.3, 2.2, 1.7, 54, 12, PLASTER);
      p.timber(1.8, 1.3, 2.2, 1.7, 54, 12, BEAM);
      {
        const [cx, cy] = iso(2.0, 1.703, 60);
        p.ctx.fillStyle = '#f2ece0';
        p.ctx.beginPath();
        p.ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
        p.ctx.fill();
        p.ctx.strokeStyle = '#2a2018';
        p.ctx.lineWidth = 0.6;
        p.ctx.beginPath();
        p.ctx.moveTo(cx, cy);
        p.ctx.lineTo(cx, cy - 2.4);
        p.ctx.moveTo(cx, cy);
        p.ctx.lineTo(cx + 1.6, cy);
        p.ctx.stroke();
      }
      p.roofPyramid(1.76, 1.26, 2.24, 1.74, 66, 16, 'slate', 0.04);
      p.flag(2.0, 1.5, 82, 12, '#c8962a');
      break;
    }
    case 'university': {
      // A college round a cloistered quad: the hall and library ranges, a gate tower, the lawn.
      const ST = '#c4bba9';
      const winter = season === 3;
      p.shadow(0.2, 0.2, 3.85, 3.85);
      p.poly([[1.3, 1.3, 0], [3.7, 1.3, 0], [3.7, 3.7, 0], [1.3, 3.7, 0]], winter ? '#e2e7e6' : '#7aa848');
      p.poly([[2.35, 1.3, 0], [2.65, 1.3, 0], [2.65, 3.7, 0], [2.35, 3.7, 0]], winter ? '#d4d8d6' : '#d2c39c');
      p.poly([[1.3, 2.35, 0], [3.7, 2.35, 0], [3.7, 2.65, 0], [1.3, 2.65, 0]], winter ? '#d4d8d6' : '#d2c39c');
      // The great hall along the back, with tall windows and a lantern.
      p.box(0.2, 0.2, 3.8, 1.3, 0, 30, ST, undefined, 'stone');
      for (let k = 0; k < 6; k++) {
        const x = 1.45 + k * 0.38;
        p.poly([[x, 1.302, 8], [x + 0.16, 1.302, 8], [x + 0.16, 1.302, 22], [x + 0.08, 1.302, 25], [x, 1.302, 22]], '#3a3a52');
        p.poly([[x + 0.02, 1.304, 9], [x + 0.14, 1.304, 9], [x + 0.14, 1.304, 21.5], [x + 0.08, 1.304, 24], [x + 0.02, 1.304, 21.5]], winter ? '#e8b850' : '#5a6a9a');
      }
      p.roofX(0.2, 0.2, 3.8, 1.3, 30, 26, 'slate', ST, 0.1);
      p.box(2.3, 0.6, 2.7, 0.9, 50, 10, '#8a8274');
      p.roofPyramid(2.27, 0.57, 2.73, 0.93, 60, 14, 'slate', 0.03);
      // The library range down the left side, with a cloister walk.
      p.box(0.2, 1.3, 1.3, 3.8, 0, 24, ST, undefined, 'stone');
      for (let k = 0; k < 4; k++) p.windowR(1.3, 1.5 + k * 0.55, 13, 0.16, 7, winter && k === 1);
      p.roofY(0.2, 1.3, 1.3, 3.8, 24, 20, 'slate', ST, 0.1);
      for (let k = 0; k < 5; k++) {
        const y = 1.45 + k * 0.5;
        p.box(1.42, y - 0.05, 1.52, y + 0.05, 0, 9, ST);
      }
      p.poly([[1.3, 1.3, 11], [1.3, 3.7, 11], [1.62, 3.7, 8], [1.62, 1.3, 8]], p.snow ? '#eef2f4' : shade(ROOF_COLORS.slate, 0.9), shade(ROOF_COLORS.slate, 0.5));
      // A gate tower at the front corner, its arms on a banner.
      p.box(3.0, 3.0, 3.8, 3.8, 0, 48, ST, undefined, 'stone');
      p.wallL(3.802, 3.2, 3.6, 0, 16, '#3a2a1e');
      p.windowL(3.8, 3.3, 28, 0.18, 9, winter);
      p.windowR(3.8, 3.3, 28, 0.18, 9);
      for (let i = 0; i < 4; i++) {
        p.box(3.0 + i * 0.22, 3.72, 3.1 + i * 0.22, 3.8, 48, 5, ST);
        p.box(3.72, 3.0 + i * 0.22, 3.8, 3.1 + i * 0.22, 48, 5, ST);
      }
      p.lordFlag(3.4, 3.4, 48, 22);
      // A scholar's well in the quad.
      p.box(2.4, 2.4, 2.6, 2.6, 0, 4, ST);
      break;
    }
    case 'hedge': {
      // A clipped box hedge with a topiary ball at its end.
      const g = season === 3 ? '#8a9a86' : '#3d6b30';
      p.box(0.2, 0.42, 0.8, 0.58, 0, 6, g, shade(g, 1.15));
      const [tx, ty] = iso(0.82, 0.5, 0);
      p.ctx.fillStyle = shade(g, 0.9);
      p.ctx.fillRect(tx - 0.8, ty - 6, 1.6, 6);
      p.ctx.fillStyle = g;
      p.ctx.beginPath();
      p.ctx.arc(tx, ty - 10, 5, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.fillStyle = 'rgba(255,255,255,0.15)';
      p.ctx.beginPath();
      p.ctx.arc(tx - 1.5, ty - 11.5, 2.2, 0, Math.PI * 2);
      p.ctx.fill();
      break;
    }
    case 'flowerbed': {
      // An oval bed edged with stones, thick with flowers.
      const [cx, cy] = iso(0.5, 0.5, 0);
      const c = p.ctx;
      c.fillStyle = '#9a9288';
      c.beginPath();
      c.ellipse(cx, cy, 17, 8.5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = season === 3 ? '#e2e7e6' : '#6a4a2c';
      c.beginPath();
      c.ellipse(cx, cy - 0.5, 15, 7.2, 0, 0, Math.PI * 2);
      c.fill();
      if (season !== 3) {
        const flowers = season === 2 ? ['#d8903a', '#b8503a', '#e0c040'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0', '#e86a3a'];
        const rand = mulberry32(5);
        for (let k = 0; k < 22; k++) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand());
          const x = cx + Math.cos(a) * r * 12;
          const y = cy + Math.sin(a) * r * 5.5 - 1;
          c.fillStyle = '#4f8a34';
          c.beginPath();
          c.arc(x, y, 1.8, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = flowers[k % flowers.length];
          c.beginPath();
          c.arc(x, y - 1.5, 1.3, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    }
    case 'shrine': {
      // A wayside shrine: a post with a little gabled box, a saint and a candle.
      p.box(0.44, 0.44, 0.56, 0.56, 0, 3, '#9a9288');
      p.line([0.5, 0.5, 3], [0.5, 0.5, 12], '#5e4129', 1.8);
      p.box(0.4, 0.42, 0.6, 0.58, 12, 7, WOOD);
      p.wallL(0.581, 0.44, 0.56, 13, 18, '#2a2018');
      const [sx, sy] = iso(0.5, 0.582, 13);
      p.ctx.fillStyle = '#e0dad0';
      p.ctx.fillRect(sx - 1, sy - 4.5, 2, 4.5);
      p.ctx.beginPath();
      p.ctx.arc(sx, sy - 5.3, 1, 0, Math.PI * 2);
      p.ctx.fill();
      p.roofY(0.38, 0.4, 0.62, 0.6, 19, 5, 'shingle', WOOD, 0.03);
      p.circle(0.62, 0.62, 1.5, 1.6, season === 3 ? '#ffd860' : '#f2c25a');
      if (season !== 3) for (const [x, y] of [[0.35, 0.7], [0.68, 0.38]] as const) {
        p.bush(x, y, 2.4, '#4f8a34');
        p.circle(x, y, 3.2, 1.2, '#f4f0e0');
      }
      break;
    }
    case 'fountain': {
      // A small round stone basin with a spout on a column.
      const [cx, cy] = iso(0.5, 0.5, 0);
      const c = p.ctx;
      c.fillStyle = '#a49c8e';
      c.beginPath();
      c.ellipse(cx, cy - 2, 18, 9, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#8a8274';
      c.fillRect(cx - 18, cy - 2, 36, 3);
      c.beginPath();
      c.ellipse(cx, cy + 1, 18, 9, 0, 0, Math.PI);
      c.fill();
      c.fillStyle = season === 3 ? '#dfe8ec' : '#5f9ab8';
      c.beginPath();
      c.ellipse(cx, cy - 2.4, 15, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#b6ae9f';
      c.fillRect(cx - 1.6, cy - 16, 3.2, 14);
      c.beginPath();
      c.ellipse(cx, cy - 16, 5, 2.2, 0, 0, Math.PI * 2);
      c.fill();
      if (season !== 3) {
        c.strokeStyle = 'rgba(220,240,250,0.85)';
        c.lineWidth = 0.9;
        for (const d of [-1, 1]) {
          c.beginPath();
          c.moveTo(cx, cy - 19);
          c.quadraticCurveTo(cx + d * 5, cy - 22, cx + d * 8, cy - 6);
          c.stroke();
        }
      }
      break;
    }
    case 'garden': {
      const flowers = season === 3 ? ['#e8eef0'] : season === 2 ? ['#d8903a', '#b8503a', '#e0c040'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0', '#e86a3a'];
      p.poly(
        [
          [0.08, 0.08, 0],
          [0.92, 0.08, 0],
          [0.92, 0.92, 0],
          [0.08, 0.92, 0],
        ],
        season === 3 ? '#dfe4e2' : '#6a9a3e',
      );
      // Gravel path.
      p.poly(
        [
          [0.42, 0.08, 0],
          [0.58, 0.08, 0],
          [0.58, 0.92, 0],
          [0.42, 0.92, 0],
        ],
        season === 3 ? '#d0d3d0' : '#c8b88e',
      );
      const rand = mulberry32(7);
      for (const [x0, x1] of [
        [0.12, 0.38],
        [0.62, 0.88],
      ]) {
        for (let i = 0; i < 9; i++) {
          const x = x0 + rand() * (x1 - x0);
          const y = 0.15 + rand() * 0.7;
          p.bush(x, y, 2.6, season === 3 ? '#9aa894' : '#3f7a35');
          if (season !== 3) {
            const [fx, fy] = iso(x, y, 3);
            p.ctx.fillStyle = flowers[i % flowers.length];
            p.ctx.beginPath();
            p.ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
            p.ctx.fill();
          }
        }
      }
      // Bench.
      p.box(0.66, 0.78, 0.86, 0.86, 3, 1.5, '#8a6236');
      p.line([0.68, 0.84, 0], [0.68, 0.84, 3], '#5e4129', 1);
      p.line([0.84, 0.84, 0], [0.84, 0.84, 3], '#5e4129', 1);
      break;
    }
    case 'maypole': {
      p.poly(
        [
          [0.2, 0.2, 0],
          [1.8, 0.2, 0],
          [1.8, 1.8, 0],
          [0.2, 1.8, 0],
        ],
        season === 3 ? '#dde2e0' : '#86a84a',
      );
      // Ring of trampled earth where people dance.
      const [cx, cy] = iso(1, 1, 0);
      p.ctx.strokeStyle = season === 3 ? '#c8ccc8' : '#a89060';
      p.ctx.lineWidth = 5;
      p.ctx.beginPath();
      p.ctx.ellipse(cx, cy, 34, 17, 0, 0, Math.PI * 2);
      p.ctx.stroke();
      const ribbons = ['#c42b3a', '#2e5e9a', '#e8c040', '#3d7a3a', '#f4f0e0', '#9a4ab0'];
      ribbons.forEach((col, i) => {
        const a = (i / ribbons.length) * Math.PI * 2;
        const ex = 1 + Math.cos(a) * 0.62;
        const ey = 1 + Math.sin(a) * 0.62;
        p.ctx.strokeStyle = col;
        p.ctx.lineWidth = 1.3;
        const [tx, ty] = iso(1, 1, 52);
        const [bx, by] = iso(ex, ey, 2);
        p.ctx.beginPath();
        p.ctx.moveTo(tx, ty);
        p.ctx.quadraticCurveTo((tx + bx) / 2 + 4, (ty + by) / 2, bx, by);
        p.ctx.stroke();
        p.box(ex - 0.03, ey - 0.03, ex + 0.03, ey + 0.03, 0, 3, '#7b5a36');
      });
      p.line([1, 1, 0], [1, 1, 60], '#e8dcc0', 3);
      p.line([1, 1, 0], [1, 1, 60], '#c8b490', 1);
      const [wx, wy] = iso(1, 1, 52);
      p.ctx.fillStyle = season === 3 ? '#e8eef0' : '#4f8a2e';
      p.ctx.beginPath();
      p.ctx.ellipse(wx, wy, 7, 3, 0, 0, Math.PI * 2);
      p.ctx.fill();
      p.flag(1, 1, 60, 6, '#c42b3a');
      break;
    }
    case 'statue': {
      p.poly(
        [
          [0.15, 0.15, 0],
          [1.85, 0.15, 0],
          [1.85, 1.85, 0],
          [0.15, 1.85, 0],
        ],
        season === 3 ? '#d8dcdc' : '#b9b2a2',
      );
      for (let i = 1; i < 4; i++) {
        p.line([0.15, 0.15 + i * 0.42, 0], [1.85, 0.15 + i * 0.42, 0], 'rgba(90,80,60,0.3)', 0.6);
        p.line([0.15 + i * 0.42, 0.15, 0], [0.15 + i * 0.42, 1.85, 0], 'rgba(90,80,60,0.3)', 0.6);
      }
      p.box(0.55, 0.55, 1.45, 1.45, 0, 6, '#a8a093', undefined, 'stone');
      p.box(0.7, 0.7, 1.3, 1.3, 6, 16, '#b8b0a2', undefined, 'stone');
      p.box(0.62, 0.62, 1.38, 1.38, 22, 3, '#a8a093', undefined, 'stone');
      // The lord: legs, cloak, head and raised sword.
      const st = '#c8c2b6';
      p.box(0.9, 0.95, 0.98, 1.03, 25, 12, st);
      p.box(1.02, 0.95, 1.1, 1.03, 25, 12, st);
      p.box(0.86, 0.9, 1.14, 1.08, 37, 14, '#d0cabe');
      p.poly(
        [
          [0.84, 1.1, 50],
          [1.16, 1.1, 50],
          [1.2, 1.12, 30],
          [0.8, 1.12, 30],
        ],
        '#b4ad9f',
      );
      const [hx, hy] = iso(1, 1, 56);
      p.ctx.fillStyle = '#d6d0c4';
      p.ctx.beginPath();
      p.ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      p.ctx.fill();
      p.line([1.14, 1.0, 47], [1.24, 0.92, 70], '#9aa0a6', 1.8);
      p.line([1.17, 0.98, 52], [1.11, 1.06, 50], '#8a8e94', 1.6);
      if (season === 3) {
        p.ctx.fillStyle = '#f2f6f8';
        p.ctx.beginPath();
        p.ctx.arc(hx, hy - 3, 3, Math.PI, 0);
        p.ctx.fill();
      }
      for (const [x, y] of [
        [0.3, 0.3],
        [1.7, 0.3],
        [0.3, 1.7],
        [1.7, 1.7],
      ]) {
        p.bush(x, y, 4, season === 3 ? '#9aa894' : season === 2 ? '#a08a3a' : '#3f7a35');
      }
      break;
    }
  }
  return smoke;
}

/** Backyard kinds, in the order they are encoded into a house sprite variant. */
export const YARD_CODES: (string | null)[] = [null, 'veg', 'hens', 'bees'];

/** How many house shapes there are for each level (the rest of a variant is colours, yard and craft). */
export const HOUSE_FORMS = [0, 5, 5, 3, 3];

/** Splits a house variant: colours, yard extension, home craft and shape. */
function homeParts(variant: number) {
  const hv = HOUSE_VARIANTS[variant % HOUSE_VARIANTS.length];
  return {
    // Limewashed homes are white whatever their colour was.
    hv: variant >= 1024 ? { ...hv, wall: LIMEWASH } : hv,
    yard: YARD_CODES[Math.floor(variant / HOUSE_VARIANTS.length) % YARD_CODES.length] ?? null,
    trade: HOME_TRADES[(Math.floor(variant / 16) % 8) - 1] ?? null,
    form: Math.floor(variant / 128) % 8,
  };
}

/** Where a lit window sits on a home's front, for the evening glow. */
export function homeWindow(level: number, variant: number): [number, number, number] {
  const { form } = homeParts(variant);
  if (level >= 4) return [0.6, 1.5, 16];
  if (level >= 3) return [0.55, form === 1 ? 1.3 : 1.25, 16];
  if (level === 2) return [0.5, form === 1 ? 1.2 : 1.15, 17];
  return [0.5, form === 1 ? 1.15 : 1.05, 7];
}

/**
 * A home on its 2x2 plot: the house stands at the back, leaving a yard in
 * front and a strip down the side, where its garden, animals or a family
 * workshop go, all inside a low wattle fence with a gate onto the street.
 */
function drawHome(p: Pen, level: number, variant: number, season: Season, smoke: V3[]): void {
  const { hv, yard, trade, form } = homeParts(variant);
  const winter = season === 3;
  // The trodden yard and the path from the door to the gate.
  p.poly([[0.12, 0.12, 0], [1.9, 0.12, 0], [1.9, 1.9, 0], [0.12, 1.9, 0]], winter ? 'rgba(235,240,240,0.35)' : 'rgba(150,130,80,0.18)');
  const doorX = level >= 4 ? 0.8 : level >= 3 ? 0.95 : 0.85;
  p.poly([[doorX - 0.1, 1.0, 0], [doorX + 0.12, 1.0, 0], [doorX + 0.16, 1.95, 0], [doorX - 0.14, 1.95, 0]], winter ? '#dfe3e2' : '#b8a27a');
  p.roofTint = hv.tint;
  if (level >= 4) drawMerchantHouse(p, form, hv, season, smoke);
  else if (level >= 3) drawTownhouse(p, form, hv, season, smoke);
  else if (level === 2) drawTimberHouse(p, form, hv, season, smoke);
  else drawCottage(p, form, hv, season, smoke);
  p.roofTint = null;
  if (trade) drawTradeAnnex(p, trade, season, smoke);
  if (yard) drawYardPlot(p, yard, !!trade, season);
  else drawGardenBits(p, hv, !!trade, doorX, season);
  // Wattle fence along the street and the side, with a gate at the path.
  wattle(p, [0.1, 1.95], [doorX - 0.2, 1.95], winter);
  wattle(p, [doorX + 0.22, 1.95], [1.95, 1.95], winter);
  wattle(p, [1.95, 0.1], [1.95, 1.95], winter);
}

/** A low woven-hazel fence between posts. */
function wattle(p: Pen, a: [number, number], b: [number, number], winter: boolean): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.05) return;
  const col = winter ? '#9a8a78' : '#8a6a40';
  p.poly([[a[0], a[1], 1], [b[0], b[1], 1], [b[0], b[1], 6], [a[0], a[1], 6]], shade(col, a[1] === b[1] ? 1 : 0.8), shade(col, 0.6));
  const n = Math.max(1, Math.round(len / 0.12));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    if (i % 3 === 0) p.line([x, y, 0], [x, y, 7.5], '#5e4129', 1.1);
    else p.line([x, y, 1.5], [x, y, 5.5], shade(col, 0.7), 0.5);
  }
  if (winter) p.line([a[0], a[1], 6.2], [b[0], b[1], 6.2], '#f2f6f8', 1.4);
}

type HouseLook = (typeof HOUSE_VARIANTS)[number];

/** A cottage: five shapes, each in four colourings. */
function drawCottage(p: Pen, form: number, hv: HouseLook, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  const W = hv.wall;
  switch (form % 5) {
    case 1: {
      // Gable to the street: the door under the gable end.
      p.shadow(0.35, 0.25, 1.25, 1.15);
      p.box(0.35, 0.25, 1.25, 1.15, 0, 15, W);
      p.timber(0.35, 0.25, 1.25, 1.15, 0, 15, BEAM);
      p.doorL(1.15, 0.72, 0.18, 11);
      p.windowL(1.15, 0.45, 7, 0.12, 5, winter);
      p.windowL(1.15, 1.02, 7, 0.12, 5);
      p.windowR(1.25, 0.55, 7, 0.14, 5);
      drawHouseExtra(p, hv.extra, season, 1.15, [0.45, 1.02], 7, [0.72, 0.18]);
      p.roofY(0.35, 0.25, 1.25, 1.15, 15, 17, 'thatch', W, 0.13);
      smoke.push(p.chimney(0.55, 0.4, 22, 13, '#8a7d70'));
      break;
    }
    case 2: {
      // A long cottage with a lean-to store at its end.
      p.shadow(0.25, 0.3, 1.55, 1.05);
      p.box(0.25, 0.3, 1.2, 1.05, 0, 15, W);
      p.timber(0.25, 0.3, 1.2, 1.05, 0, 15, BEAM);
      p.box(1.2, 0.4, 1.55, 1.0, 0, 10, WOOD);
      p.poly([[1.2, 0.36, 15], [1.2, 1.04, 15], [1.6, 1.04, 9], [1.6, 0.36, 9]], p.snow ? '#eef2f4' : shade(ROOF_COLORS.shingle, 0.9), shade(ROOF_COLORS.shingle, 0.5));
      p.doorL(1.05, 0.7, 0.18, 11);
      p.windowL(1.05, 0.38, 7, 0.13, 5, winter);
      p.windowL(1.05, 1.0, 7, 0.12, 5);
      drawHouseExtra(p, hv.extra, season, 1.05, [0.38, 1.0], 7, [0.7, 0.18]);
      p.roofX(0.25, 0.3, 1.2, 1.05, 15, 14, 'thatch', W, 0.12);
      smoke.push(p.chimney(0.4, 0.6, 22, 12, '#8a7d70'));
      break;
    }
    case 3: {
      // A rubble-stone cottage under a deep thatch.
      p.shadow(0.3, 0.3, 1.3, 1.05);
      p.box(0.3, 0.3, 1.3, 1.05, 0, 13, '#a49c8e', undefined, 'rubble');
      p.doorL(1.05, 0.75, 0.18, 10);
      p.windowL(1.05, 0.45, 6, 0.13, 5, winter);
      p.windowL(1.05, 1.05, 6, 0.12, 5);
      p.windowR(1.3, 0.6, 6, 0.13, 5);
      drawHouseExtra(p, hv.extra, season, 1.05, [0.45, 1.05], 6, [0.75, 0.18]);
      p.roofX(0.3, 0.3, 1.3, 1.05, 13, 17, 'thatch', '#a49c8e', 0.16);
      smoke.push(p.chimney(1.12, 0.6, 20, 14, '#8a7d70'));
      break;
    }
    case 4: {
      // A boarded cottage under shingles, a little porch at the door.
      p.shadow(0.3, 0.25, 1.3, 1.05);
      p.box(0.3, 0.25, 1.3, 1.05, 0, 14, WOOD);
      p.doorL(1.05, 0.72, 0.18, 10);
      p.windowL(1.05, 0.42, 6, 0.13, 5, winter);
      p.windowL(1.05, 1.05, 6, 0.12, 5);
      p.windowR(1.3, 0.55, 6, 0.13, 5);
      p.roofX(0.3, 0.25, 1.3, 1.05, 14, 14, 'shingle', WOOD, 0.12);
      for (const x of [0.66, 0.98]) p.line([x, 1.25, 0], [x, 1.25, 10], BEAM, 1.2);
      p.poly([[0.62, 1.04, 13], [1.02, 1.04, 13], [1.02, 1.28, 10], [0.62, 1.28, 10]], p.snow ? '#eef2f4' : shade(ROOF_COLORS.shingle, 0.95), shade(ROOF_COLORS.shingle, 0.5));
      smoke.push(p.chimney(0.45, 0.6, 21, 12, '#8a7d70'));
      break;
    }
    default: {
      // The plain cruck cottage: plaster and timber under thatch.
      p.shadow(0.3, 0.3, 1.35, 1.05);
      p.box(0.3, 0.3, 1.35, 1.05, 0, 15, W);
      p.timber(0.3, 0.3, 1.35, 1.05, 0, 15, BEAM);
      p.doorL(1.05, 0.75, 0.18, 11);
      p.windowL(1.05, 0.42, 7, 0.13, 5, winter);
      p.windowL(1.05, 1.1, 7, 0.12, 5);
      p.windowR(1.35, 0.6, 7, 0.13, 5);
      drawHouseExtra(p, hv.extra, season, 1.05, [0.42, 1.1], 7, [0.75, 0.18]);
      p.roofX(0.3, 0.3, 1.35, 1.05, 15, 14, 'thatch', W, 0.13);
      smoke.push(p.chimney(1.1, 0.68, 22, 13, '#8a7d70'));
    }
  }
}

/** A Timber House: two storeys, five shapes. */
function drawTimberHouse(p: Pen, form: number, hv: HouseLook, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  const W = hv.wall;
  // Thatch or shingles: tiled roofs are for the Townhouses.
  const roof = form % 5 === 0 || form % 5 === 3 ? 'thatch' : 'shingle';
  switch (form % 5) {
    case 1: {
      // Gable to the street, the upper floor jettied out over the door.
      p.shadow(0.3, 0.2, 1.3, 1.2);
      p.box(0.32, 0.22, 1.28, 1.12, 0, 2, STONE);
      p.box(0.32, 0.22, 1.28, 1.12, 2, 9, W);
      p.timber(0.32, 0.22, 1.28, 1.12, 2, 9, BEAM);
      p.box(0.29, 0.19, 1.31, 1.2, 11, 15, W);
      p.timber(0.29, 0.19, 1.31, 1.2, 11, 15, BEAM);
      p.doorL(1.12, 0.72, 0.18, 10);
      p.windowL(1.12, 0.42, 4, 0.12, 5);
      p.windowL(1.12, 1.02, 4, 0.12, 5);
      drawHouseExtra(p, hv.extra, season, 1.12, [0.42, 1.02], 4, [0.72, 0.18]);
      for (const x of [0.42, 0.72, 1.02]) p.windowL(1.2, x, 16, 0.13, 6, winter && x === 0.72);
      p.windowR(1.31, 0.5, 16, 0.13, 6);
      p.roofY(0.29, 0.19, 1.31, 1.2, 26, 20, roof, W, 0.1);
      smoke.push(p.chimney(0.5, 0.3, 36, 14, '#8f8476'));
      break;
    }
    case 2: {
      // An L: the main range and a short cross wing at the side.
      p.shadow(0.2, 0.2, 1.55, 1.2);
      p.box(0.22, 0.3, 1.1, 1.1, 0, 2, STONE);
      p.box(0.22, 0.3, 1.1, 1.1, 2, 9, W);
      p.timber(0.22, 0.3, 1.1, 1.1, 2, 9, BEAM);
      p.box(0.2, 0.28, 1.1, 1.14, 11, 14, W);
      p.timber(0.2, 0.28, 1.1, 1.14, 11, 14, BEAM);
      p.doorL(1.1, 0.62, 0.18, 10);
      p.windowL(1.1, 0.32, 4, 0.12, 5);
      p.windowL(1.14, 0.35, 16, 0.13, 6, winter);
      p.windowL(1.14, 0.8, 16, 0.13, 6);
      drawHouseExtra(p, hv.extra, season, 1.1, [0.32], 4, [0.62, 0.18]);
      p.roofX(0.2, 0.28, 1.1, 1.14, 25, 16, roof, W, 0.1);
      p.box(1.1, 0.2, 1.55, 1.2, 0, 2, STONE);
      p.box(1.1, 0.2, 1.55, 1.2, 2, 9, W);
      p.timber(1.1, 0.2, 1.55, 1.2, 2, 9, BEAM);
      p.box(1.08, 0.18, 1.57, 1.22, 11, 14, W);
      p.timber(1.08, 0.18, 1.57, 1.22, 11, 14, BEAM);
      p.windowL(1.2, 1.22, 4, 0.14, 5);
      p.windowL(1.22, 1.22, 16, 0.14, 6);
      p.windowR(1.57, 0.5, 16, 0.13, 6);
      p.roofY(1.08, 0.18, 1.57, 1.22, 25, 16, roof, W, 0.08);
      smoke.push(p.chimney(0.45, 0.6, 36, 13, '#8f8476'));
      break;
    }
    case 3: {
      // Close-studded all the way up, with a catslide roof over an outshot.
      p.shadow(0.25, 0.2, 1.4, 1.15);
      p.box(0.25, 0.25, 1.4, 1.1, 0, 26, W);
      p.timber(0.25, 0.25, 1.4, 1.1, 0, 13, BEAM);
      p.timber(0.25, 0.25, 1.4, 1.1, 13, 13, BEAM);
      for (let x = 0.33; x < 1.38; x += 0.12) p.line([x, 1.1, 1], [x, 1.1, 25], BEAM, 0.9);
      p.doorL(1.1, 0.78, 0.18, 10);
      p.windowL(1.1, 0.4, 4, 0.14, 5);
      p.windowL(1.1, 1.12, 4, 0.14, 5);
      drawHouseExtra(p, hv.extra, season, 1.1, [0.4, 1.12], 4, [0.78, 0.18]);
      for (const x of [0.4, 0.78, 1.12]) p.windowL(1.1, x, 17, 0.13, 6, winter && x === 1.12);
      p.windowR(1.4, 0.55, 17, 0.13, 6);
      p.roofX(0.25, 0.25, 1.4, 1.1, 26, 18, roof, W, 0.1);
      smoke.push(p.chimney(1.15, 0.6, 38, 14, '#8f8476'));
      break;
    }
    case 4: {
      // Stone below, timber above, and a dormer in the roof.
      p.shadow(0.25, 0.25, 1.4, 1.15);
      p.box(0.27, 0.27, 1.38, 1.1, 0, 2, STONE);
      p.box(0.27, 0.27, 1.38, 1.1, 2, 10, W);
      p.timber(0.27, 0.27, 1.38, 1.1, 2, 10, BEAM);
      p.box(0.24, 0.24, 1.41, 1.14, 12, 12, W);
      p.timber(0.24, 0.24, 1.41, 1.14, 12, 12, BEAM);
      p.doorL(1.1, 0.75, 0.18, 10);
      p.windowL(1.1, 0.4, 4, 0.14, 5, winter);
      p.windowL(1.1, 1.1, 4, 0.14, 5);
      drawHouseExtra(p, hv.extra, season, 1.1, [0.4, 1.1], 4, [0.75, 0.18]);
      for (const x of [0.4, 1.1]) p.windowL(1.14, x, 15, 0.14, 6);
      p.windowR(1.41, 0.6, 15, 0.13, 6);
      p.roofX(0.24, 0.24, 1.41, 1.14, 24, 20, roof, W, 0.1);
      p.box(0.7, 0.85, 0.95, 1.05, 27, 7, W);
      p.windowL(1.05, 0.76, 28, 0.13, 4, winter);
      p.roofY(0.69, 0.84, 0.96, 1.07, 34, 5, roof, W, 0.03);
      smoke.push(p.chimney(0.4, 0.55, 36, 13, '#8f8476'));
      break;
    }
    default: {
      // Stone ground floor and a jettied timber storey.
      p.shadow(0.2, 0.25, 1.4, 1.15);
      p.box(0.25, 0.3, 1.38, 1.1, 0, 2, STONE);
      p.box(0.25, 0.3, 1.38, 1.1, 2, 9, W);
      p.timber(0.25, 0.3, 1.38, 1.1, 2, 9, BEAM);
      p.box(0.2, 0.25, 1.42, 1.15, 11, 15, W);
      p.timber(0.2, 0.25, 1.42, 1.15, 11, 15, BEAM);
      p.doorL(1.1, 0.75, 0.18, 10);
      p.windowL(1.1, 0.38, 4, 0.13, 5);
      p.windowL(1.1, 1.1, 4, 0.13, 5);
      drawHouseExtra(p, hv.extra, season, 1.1, [0.38, 1.1], 4, [0.75, 0.18]);
      p.windowL(1.15, 0.4, 16, 0.13, 6, winter);
      p.windowL(1.15, 1.08, 16, 0.13, 6);
      p.windowR(1.42, 0.55, 16, 0.13, 6);
      p.roofX(0.2, 0.25, 1.42, 1.15, 26, 17, roof, W, 0.1);
      smoke.push(p.chimney(1.1, 0.65, 36, 14, '#8f8476'));
    }
  }
}

/** A Townhouse: three storeys, three shapes. */
function drawTownhouse(p: Pen, form: number, hv: HouseLook, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  const W = hv.wall;
  const boxes = (x: number, y0: number, z: number) => {
    if (winter) return;
    p.box(x - 0.02, y0, x + 0.16, y0 + 0.06, z - 1, 2, '#7b5a36');
    const [fx, fy] = iso(x + 0.07, y0 + 0.06, z + 2);
    p.ctx.fillStyle = ['#e84a6a', '#f2d34a', '#b97ae0'][Math.floor(x * 7) % 3];
    p.ctx.beginPath();
    p.ctx.arc(fx, fy, 2, 0, Math.PI * 2);
    p.ctx.fill();
  };
  switch (form % 3) {
    case 1: {
      // Tall and narrow, gable to the street, each storey jettied further out.
      p.shadow(0.3, 0.15, 1.3, 1.3);
      p.box(0.34, 0.18, 1.26, 1.2, 0, 11, STONE);
      p.box(0.31, 0.16, 1.29, 1.25, 11, 12, W);
      p.timber(0.31, 0.16, 1.29, 1.25, 11, 12, BEAM);
      p.box(0.28, 0.14, 1.32, 1.3, 23, 12, W);
      p.timber(0.28, 0.14, 1.32, 1.3, 23, 12, BEAM);
      p.doorL(1.2, 0.7, 0.2, 10);
      p.windowL(1.2, 0.42, 3, 0.13, 6, winter);
      p.windowL(1.2, 1.02, 3, 0.13, 6);
      drawHouseExtra(p, hv.extra, season, 1.2, [0.42, 1.02], 3, [0.7, 0.2]);
      for (const x of [0.42, 0.72, 1.02]) {
        p.windowL(1.25, x, 15, 0.13, 6);
        p.windowL(1.3, x, 27, 0.13, 6, winter && x === 0.72);
        boxes(x, 1.3, 26);
      }
      p.windowR(1.32, 0.5, 27, 0.13, 6);
      p.roofY(0.28, 0.14, 1.32, 1.3, 35, 24, 'tile', W, 0.1);
      smoke.push(p.chimney(0.45, 0.3, 46, 14, '#8f8476'));
      break;
    }
    case 2: {
      // Stone below, two timber storeys, and a pair of dormers.
      p.shadow(0.15, 0.2, 1.5, 1.25);
      p.box(0.18, 0.22, 1.48, 1.2, 0, 12, '#b6ae9f', undefined, 'stone');
      p.box(0.15, 0.2, 1.5, 1.25, 12, 12, W);
      p.timber(0.15, 0.2, 1.5, 1.25, 12, 12, BEAM);
      p.box(0.12, 0.17, 1.53, 1.3, 24, 11, W);
      p.timber(0.12, 0.17, 1.53, 1.3, 24, 11, BEAM);
      p.doorL(1.2, 0.85, 0.22, 10);
      p.windowL(1.2, 0.4, 3, 0.16, 6, winter);
      p.windowL(1.2, 1.2, 3, 0.16, 6);
      drawHouseExtra(p, hv.extra, season, 1.2, [0.4, 1.2], 3, [0.85, 0.22]);
      for (const x of [0.35, 0.8, 1.25]) {
        p.windowL(1.25, x, 15, 0.14, 6);
        p.windowL(1.3, x, 27, 0.14, 6, winter && x === 1.25);
      }
      p.windowR(1.53, 0.6, 27, 0.13, 6);
      p.roofX(0.12, 0.17, 1.53, 1.3, 35, 20, 'tile', W, 0.1);
      for (const x of [0.4, 1.05]) {
        p.box(x, 1.0, x + 0.25, 1.2, 38, 8, W);
        p.windowL(1.2, x + 0.06, 39, 0.13, 5);
        p.roofY(x - 0.02, 0.99, x + 0.27, 1.23, 46, 5, 'tile', W, 0.03);
      }
      smoke.push(p.chimney(0.75, 0.5, 46, 15, '#8f8476'));
      break;
    }
    default: {
      // Stone ground floor, two jettied timber storeys, a hanging sign.
      p.shadow(0.15, 0.2, 1.5, 1.25);
      p.box(0.2, 0.25, 1.45, 1.2, 0, 11, STONE);
      p.box(0.17, 0.22, 1.48, 1.25, 11, 12, W);
      p.timber(0.17, 0.22, 1.48, 1.25, 11, 12, BEAM);
      p.box(0.14, 0.19, 1.51, 1.3, 23, 11, W);
      p.timber(0.14, 0.19, 1.51, 1.3, 23, 11, BEAM);
      p.doorL(1.2, 0.85, 0.22, 10);
      p.windowL(1.2, 0.38, 3, 0.16, 6, winter);
      p.windowL(1.2, 1.2, 3, 0.16, 6);
      drawHouseExtra(p, hv.extra, season, 1.2, [0.38, 1.2], 3, [0.85, 0.22]);
      for (const x of [0.35, 0.8, 1.25]) {
        p.windowL(1.25, x, 14, 0.14, 6, winter && x > 1);
        p.windowL(1.3, x, 26, 0.14, 6);
        boxes(x, 1.3, 25);
      }
      p.windowR(1.48, 0.55, 14, 0.13, 6);
      p.windowR(1.51, 0.9, 26, 0.13, 6);
      p.roofX(0.14, 0.19, 1.51, 1.3, 34, 20, 'tile', W, 0.1);
      smoke.push(p.chimney(0.45, 0.7, 43, 15, '#8f8476'));
      smoke.push(p.chimney(1.25, 0.7, 43, 15, '#8f8476'));
    }
  }
}

/**
 * A Merchant's House: tall and narrow-fronted like the guild houses of a
 * great market square, four storeys under a gable to the street, finished
 * in stone and painted plaster with gilded details. Three shapes: a
 * stepped gable, a curving bell gable, and a pair of narrow houses.
 */
function drawMerchantHouse(p: Pen, form: number, hv: HouseLook, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  // Painted fronts: cream, brick red, ochre, slate blue, white, sage.
  const palettes = ['#e8d8b0', '#b8644a', '#d8a848', '#8aa0b8', '#f2ece0', '#a8b890'];
  const pal = Math.max(0, HOUSE_VARIANTS.indexOf(hv)) + form * 2;
  const face = palettes[pal % palettes.length];
  const gold = '#d8b04a';
  // One tall house: x0..x1 wide along the street, y0..y1 deep, its front at y1.
  const tall = (x0: number, x1: number, y0: number, y1: number, col: string, gable: 'step' | 'bell', storeys: number) => {
    const fh = 11;
    const top = fh * storeys;
    p.shadow(x0, y0, x1, y1);
    p.box(x0, y0, x1, y1, 0, fh, '#b6ae9f', undefined, 'stone');
    p.box(x0, y0, x1, y1, fh, top - fh, col, undefined, 'plaster');
    // Each storey: a band and its windows, the ground floor a shopfront.
    const w = x1 - x0;
    const n = w > 0.9 ? 3 : 2;
    for (let k = 1; k < storeys; k++) {
      const z = k * fh;
      p.wallL(y1 + 0.002, x0, x1, z - 0.5, z + 0.8, gold);
      for (let j = 0; j < n; j++) {
        const wx = x0 + (w / n) * (j + 0.5) - 0.07;
        p.windowL(y1, wx, z + 3, 0.14, 6, winter && (j + k) % 3 === 0);
        p.wallL(y1 + 0.003, wx - 0.02, wx + 0.16, z + 9.2, z + 10, '#f2ece0');
      }
    }
    for (let k = 1; k < storeys; k++) p.windowR(x1, y0 + (y1 - y0) * 0.45, k * fh + 3, 0.14, 6);
    // Shopfront: a wide window and the door.
    p.wallL(y1 + 0.002, x0 + 0.06, x0 + w * 0.48, 2, 8, '#3a2a1e');
    p.wallL(y1 + 0.003, x0 + 0.08, x0 + w * 0.46, 2.5, 7.5, winter ? '#e0b04e' : '#4a4858');
    p.wallL(y1 + 0.002, x0 + w * 0.6, x0 + w * 0.6 + 0.18, 0, 9, '#4a2f1b');
    p.wallL(y1 + 0.003, x0 + w * 0.58, x0 + w * 0.62 + 0.18, 9, 10.5, gold);
    // The roof runs back from the gable, and the gable rises in front of it.
    const rh = 22 + w * 6;
    p.roofY(x0, y0, x1, y1, top, rh, 'slate', col, 0.04);
    const xm = (x0 + x1) / 2;
    const pts: V3[] = [[x0, y1 + 0.004, top]];
    if (gable === 'step') {
      const steps = 4;
      for (let k = 0; k < steps; k++) {
        const xa = x0 + (k * (xm - x0)) / steps;
        const za = top + ((k + 1) * rh) / steps + 2;
        pts.push([xa, y1 + 0.004, za], [xa + (xm - x0) / steps, y1 + 0.004, za]);
      }
      pts.push([xm, y1 + 0.004, top + rh + 6]);
      for (let k = steps - 1; k >= 0; k--) {
        const xb = x1 - (k * (x1 - xm)) / steps;
        const za = top + ((k + 1) * rh) / steps + 2;
        pts.push([xb - (x1 - xm) / steps, y1 + 0.004, za], [xb, y1 + 0.004, za]);
      }
    } else {
      // A curving bell gable with scrolls at its shoulders.
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const xx = x0 + (xm - x0) * t;
        const zz = top + rh * (t < 0.5 ? 0.35 * Math.sin(t * Math.PI) : 0.35 + 0.65 * Math.sin((t - 0.5) * Math.PI));
        pts.push([xx, y1 + 0.004, zz + 3]);
      }
      for (let t = 1; t >= -0.0001; t -= 0.1) {
        const xx = x1 - (x1 - xm) * t;
        const zz = top + rh * (t < 0.5 ? 0.35 * Math.sin(t * Math.PI) : 0.35 + 0.65 * Math.sin((t - 0.5) * Math.PI));
        pts.push([xx, y1 + 0.004, zz + 3]);
      }
    }
    pts.push([x1, y1 + 0.004, top]);
    p.poly(pts, shade(col, 1.02), shade(col, 0.6));
    // A round window and a gilded finial in the gable.
    p.circle(xm, y1 + 0.006, top + rh * 0.45, 2.6, '#3a3a52');
    p.circle(xm, y1 + 0.007, top + rh * 0.45, 1.8, winter ? '#e0b04e' : '#5a6a9a');
    p.circle(xm, y1 + 0.006, top + rh + (gable === 'step' ? 9 : 6), 1.8, gold);
    smoke.push(p.chimney(x0 + 0.1, y0 + 0.25, top + 6, 12, '#8f8476'));
  };
  switch (form % 3) {
    case 1:
      tall(0.25, 1.4, 0.15, 1.45, face, 'bell', 4);
      break;
    case 2:
      // Two narrow houses side by side, one a storey taller.
      tall(0.15, 0.85, 0.15, 1.45, face, 'step', 4);
      tall(0.85, 1.55, 0.2, 1.45, palettes[(pal + 3) % palettes.length], 'bell', 5);
      break;
    default:
      tall(0.2, 1.45, 0.15, 1.45, face, 'step', 4);
  }
  // Pennant from the shop's sign-iron.
  p.line([1.5, 1.45, 14], [1.68, 1.55, 14], '#2a2018', 1.2);
  p.wallR(1.64, 1.48, 1.64, 7, 13.5, HERALDRY.current.field);
}

/** The yard extension a household keeps: vegetable beds, hens or bees. */
function drawYardPlot(p: Pen, yard: string, trade: boolean, season: Season): void {
  const winter = season === 3;
  // With a workshop down the side, the yard keeps to the front.
  const sx = trade ? 0.25 : 1.45;
  const sy = trade ? 1.35 : 0.3;
  if (yard === 'veg') {
    // Raised beds with plank edges: cabbages, leeks and beans on canes.
    const beds: [number, number, number, number][] = trade
      ? [[0.2, 1.3, 0.62, 1.82], [1.05, 1.3, 1.45, 1.82]]
      : [[0.2, 1.3, 0.62, 1.82], [1.05, 1.3, 1.5, 1.82], [1.5, 0.3, 1.85, 1.05]];
    beds.forEach(([x0, y0, x1, y1], i) => {
      p.box(x0, y0, x1, y1, 0, 2, '#7b5a36', winter ? '#cfd4d4' : '#6a4a2c');
      if (winter) return;
      for (let x = x0 + 0.08; x < x1 - 0.04; x += 0.13) {
        for (let y = y0 + 0.08; y < y1 - 0.04; y += 0.14) {
          if (i % 3 === 0) {
            p.circle(x, y, 3.4, 2.1, season === 2 ? '#8aa040' : '#5d9a3a');
            p.circle(x - 0.01, y - 0.01, 4.2, 1.2, '#8ac05a');
          } else if (i % 3 === 1) {
            p.line([x, y, 2], [x - 0.02, y, 8], '#6aa84a', 0.9);
            p.line([x, y, 2], [x + 0.03, y, 7], '#8ac05a', 0.7);
          } else {
            p.line([x, y, 2], [x, y, 12], '#8a6a40', 0.6);
            p.circle(x, y, 8, 1.8, '#4f8a34');
          }
        }
      }
    });
  } else if (yard === 'hens') {
    // A coop on legs with a ramp, a little run and hens about.
    const x0 = sx;
    const y0 = sy;
    p.box(x0, y0, x0 + 0.32, y0 + 0.36, 4, 8, '#9a7247', undefined, 'plank');
    for (const [lx, ly] of [[x0 + 0.03, y0 + 0.33], [x0 + 0.29, y0 + 0.33]] as const) p.line([lx, ly, 0], [lx, ly, 4], BEAM, 1.2);
    p.roofX(x0, y0, x0 + 0.32, y0 + 0.36, 12, 6, 'shingle', '#9a7247', 0.04);
    p.line([x0 + 0.16, y0 + 0.36, 4], [x0 + 0.16, y0 + 0.55, 0], '#7b5a36', 1.4);
    if (!winter) {
      const spots: [number, number, string][] = trade
        ? [[0.75, 1.5, '#f2ece0'], [0.6, 1.75, '#a8622a'], [1.2, 1.6, '#f2ece0'], [1.35, 1.8, '#3a2a1a']]
        : [[1.55, 0.95, '#f2ece0'], [1.75, 1.2, '#a8622a'], [1.6, 1.5, '#f2ece0'], [0.45, 1.55, '#3a2a1a'], [1.2, 1.7, '#a8622a']];
      for (const [hx, hy, col] of spots) {
        const [hsx, hsy] = iso(hx, hy, 0);
        const c = p.ctx;
        c.fillStyle = 'rgba(30,24,12,0.2)';
        c.beginPath();
        c.ellipse(hsx, hsy, 2.6, 1, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(hsx, hsy - 2.5, 2.6, 2, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(hsx + 2, hsy - 4.2, 1.2, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#c8322a';
        c.fillRect(hsx + 1.8, hsy - 5.8, 1, 1);
        c.fillStyle = '#e8a030';
        c.fillRect(hsx + 3, hsy - 4.2, 1, 0.6);
      }
    }
  } else if (yard === 'bees') {
    // Straw skeps on a plank stand, and lavender and borage for the bees.
    const x0 = trade ? 0.25 : 1.5;
    const y0 = trade ? 1.4 : 0.35;
    p.box(x0, y0, x0 + 0.3, y0 + 0.5, 3, 1.5, '#7b5a36');
    for (const [lx, ly] of [[x0 + 0.03, y0 + 0.47], [x0 + 0.27, y0 + 0.47], [x0 + 0.27, y0 + 0.03]] as const) p.line([lx, ly, 0], [lx, ly, 3], BEAM, 1);
    for (const y of [y0 + 0.1, y0 + 0.25, y0 + 0.4]) {
      const [x, yy] = iso(x0 + 0.15, y, 4.5);
      p.ctx.fillStyle = winter ? '#e8ecee' : '#c9a050';
      p.ctx.beginPath();
      p.ctx.ellipse(x, yy - 4, 4, 5.5, 0, Math.PI, 0);
      p.ctx.lineTo(x + 4, yy);
      p.ctx.lineTo(x - 4, yy);
      p.ctx.fill();
      p.ctx.strokeStyle = '#8a6a30';
      p.ctx.lineWidth = 0.5;
      for (const dz of [1.5, 3, 4.5]) {
        p.ctx.beginPath();
        p.ctx.moveTo(x - 3.8 + dz * 0.2, yy - dz);
        p.ctx.lineTo(x + 3.8 - dz * 0.2, yy - dz);
        p.ctx.stroke();
      }
      p.ctx.fillStyle = '#3a2a1a';
      p.ctx.fillRect(x - 0.8, yy - 1.4, 1.6, 1.2);
    }
    if (!winter) {
      for (let k = 0; k < 8; k++) {
        const x = (trade ? 0.95 : 1.5) + (k % 4) * 0.1;
        const y = (trade ? 1.4 : 1.1) + Math.floor(k / 4) * 0.25;
        p.bush(x, y, 2.6, '#6a8a4a');
        p.circle(x, y, 3.6, 1.5, k % 2 ? '#a07ad8' : '#6a8ae0');
      }
    }
  }
}

/** Without a yard extension: a flower bed, and the family's woodpile, bench, cart or water butt. */
function drawGardenBits(p: Pen, hv: HouseLook, trade: boolean, doorX: number, season: Season): void {
  const winter = season === 3;
  if (!winter) {
    const colors = season === 2 ? ['#d88a3a', '#b8482a', '#e0c040'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0'];
    for (let k = 0; k < 5; k++) {
      const x = 0.25 + k * 0.1;
      p.bush(x, 1.3 + (k % 2) * 0.06, 2.4, '#4f8a34');
      p.circle(x, 1.3 + (k % 2) * 0.06, 3.4, 1.4, colors[k % colors.length]);
    }
    p.bush(doorX + 0.45, 1.8, 3.4, '#4d8a3a');
  }
  if (trade) return;
  switch (hv.prop) {
    case 'logs':
      p.logPile(1.55, 0.6, 3);
      break;
    case 'cart': {
      p.box(1.5, 0.5, 1.8, 0.9, 4, 4, '#8a6236');
      const [wx, wy] = iso(1.65, 0.92, 4);
      p.ctx.strokeStyle = '#4a3020';
      p.ctx.lineWidth = 1.2;
      p.ctx.beginPath();
      p.ctx.ellipse(wx, wy, 3, 4, 0, 0, Math.PI * 2);
      p.ctx.stroke();
      p.line([1.5, 0.7, 6], [1.38, 0.7, 2], '#6b4a2e', 1.2);
      p.sack(1.64, 0.65, '#d8c79c');
      break;
    }
    case 'well': {
      // A water butt under the eaves and a washing tub.
      p.barrel(1.5, 0.55);
      const [tx, ty] = iso(1.6, 1.15, 0);
      p.ctx.fillStyle = '#7b5a36';
      p.ctx.beginPath();
      p.ctx.ellipse(tx, ty - 2, 5, 2.4, 0, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.fillStyle = winter ? '#dfe8ec' : '#7aa4c0';
      p.ctx.beginPath();
      p.ctx.ellipse(tx, ty - 2.6, 3.8, 1.6, 0, 0, Math.PI * 2);
      p.ctx.fill();
      break;
    }
    default:
      p.logPile(1.55, 0.6, 2);
      p.box(1.5, 1.2, 1.62, 1.32, 0, 4, '#8a6236');
  }
}

/** The workshop a craftsman's family builds on: each craft its own. */
function drawTradeAnnex(p: Pen, trade: BuildingType, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  const x0 = 1.42;
  const x1 = 1.88;
  const y0 = 0.25;
  const y1 = 1.15;
  const shed = (h: number, wall: string, roof: 'shingle' | 'tile' | 'slate' | 'thatch' = 'shingle', mat?: Material) => {
    p.box(x0, y0, x1, y1, 0, h, wall, undefined, mat);
    p.poly([[x0 - 0.04, y0 - 0.04, h + 6], [x0 - 0.04, y1 + 0.04, h + 6], [x1 + 0.05, y1 + 0.04, h - 1], [x1 + 0.05, y0 - 0.04, h - 1]], p.snow ? '#eef2f4' : shade(ROOF_COLORS[roof], 0.92), shade(ROOF_COLORS[roof], 0.5));
  };
  switch (trade) {
    case 'bakery': {
      // A bakehouse with its domed oven and flue.
      shed(11, '#b6ae9f', 'tile', 'stone');
      p.doorR(x1, 0.4, 0.18, 9);
      const [ox, oy] = iso(1.68, 1.4, 0);
      p.ctx.fillStyle = '#b39a80';
      p.ctx.beginPath();
      p.ctx.ellipse(ox, oy - 1, 9, 7, 0, Math.PI, 0);
      p.ctx.lineTo(ox + 9, oy + 1);
      p.ctx.lineTo(ox - 9, oy + 1);
      p.ctx.fill();
      p.ctx.fillStyle = '#2a1a10';
      p.ctx.beginPath();
      p.ctx.ellipse(ox + 2, oy, 3.2, 3.2, 0, Math.PI, 0);
      p.ctx.fill();
      p.ctx.fillStyle = '#f08a2a';
      p.ctx.fillRect(ox, oy - 1.4, 4, 1.4);
      smoke.push(p.chimney(1.5, 0.5, 12, 14, '#9b8a78'));
      p.box(1.45, 1.55, 1.7, 1.7, 0, 5, '#8a6440', '#d8a860');
      break;
    }
    case 'brewhouse': {
      // An open brew shed: the copper and casks.
      shed(13, WOOD, 'shingle', 'plank');
      p.wallR(x1 + 0.002, 0.35, 1.05, 0, 10, '#2a2018');
      const [cx, cy] = iso(x1 - 0.1, 0.7, 0);
      p.ctx.fillStyle = '#b4652e';
      p.ctx.beginPath();
      p.ctx.ellipse(cx, cy - 4, 5, 3, 0, 0, Math.PI * 2);
      p.ctx.fill();
      smoke.push(p.chimney(1.55, 0.4, 13, 10, '#8a7d70'));
      p.barrel(1.55, 1.4);
      p.barrel(1.75, 1.5);
      p.barrel(1.62, 1.68);
      break;
    }
    case 'dairy': {
      // A cool stone dairy with a louvre, a churn and cheeses on a rack.
      shed(12, '#c8c0b0', 'slate', 'stone');
      for (let z = 4; z < 10; z += 1.5) p.line([x1 + 0.003, 0.55, z], [x1 + 0.003, 0.85, z], '#3a3530', 0.6);
      p.box(1.5, 1.35, 1.82, 1.5, 0, 6, '#7b5a36');
      for (const x of [1.55, 1.66, 1.77]) p.ellipse(x, 1.42, 7.5, 2.4, 1.6, '#f0c850');
      const [jx, jy] = iso(1.55, 1.75, 0);
      p.ctx.fillStyle = '#9a7247';
      p.ctx.fillRect(jx - 2.2, jy - 9, 4.4, 9);
      p.ctx.fillStyle = '#6b4a2e';
      p.ctx.fillRect(jx - 0.4, jy - 12, 0.8, 3);
      break;
    }
    case 'weaver': {
      // A weaving shed with a long window for light, wool drying outside.
      shed(13, hvWallFor(trade), 'thatch');
      p.wallR(x1 + 0.002, 0.35, 1.05, 4, 10, '#4a3020');
      p.wallR(x1 + 0.003, 0.38, 1.02, 5, 9, winter ? '#e0b04e' : '#3a3540');
      for (let y = 0.5; y < 1.0; y += 0.15) p.line([x1 + 0.004, y, 5], [x1 + 0.004, y, 9], '#c8b890', 0.6);
      p.line([1.45, 1.35, 0], [1.45, 1.35, 11], '#6b4a2e', 1.2);
      p.line([1.85, 1.35, 0], [1.85, 1.35, 11], '#6b4a2e', 1.2);
      p.line([1.45, 1.35, 10.5], [1.85, 1.35, 10.5], '#6b4a2e', 0.9);
      ['#5a7ab0', '#c8b890', '#8a3b2e', '#f2ece0'].forEach((col, k) => p.wallL(1.352, 1.5 + k * 0.08, 1.56 + k * 0.08, 4 + (k % 2), 10, col));
      break;
    }
    case 'tailor': {
      // A shop front with an awning, bolts of cloth on the counter.
      shed(12, hvWallFor(trade), 'tile');
      p.wallR(x1 + 0.002, 0.35, 1.05, 3, 9, '#3a2a1e');
      p.box(x1, 0.35, x1 + 0.08, 1.05, 0, 4, '#7b5a36');
      ['#8a3b2e', '#5a7ab0', '#c8a040', '#3d7a3a'].forEach((col, k) => p.box(x1 + 0.005, 0.4 + k * 0.16, x1 + 0.07, 0.52 + k * 0.16, 4, 2, col));
      for (let k = 0; k < 5; k++) p.poly([[x1, 0.3 + k * 0.16, 12], [x1, 0.38 + k * 0.16, 12], [x1 + 0.2, 0.38 + k * 0.16, 9], [x1 + 0.2, 0.3 + k * 0.16, 9]], k % 2 ? '#f1e8d6' : '#8a3b2e');
      for (let k = 0; k < 5; k++) p.poly([[x1, 0.38 + k * 0.16, 12], [x1, 0.46 + k * 0.16, 12], [x1 + 0.2, 0.46 + k * 0.16, 9], [x1 + 0.2, 0.38 + k * 0.16, 9]], k % 2 ? '#8a3b2e' : '#f1e8d6');
      break;
    }
    case 'tanner': {
      // A lean-to with a soaking vat, hides on frames in the yard.
      for (const [px, py] of [[x1, y0], [x1, y1]] as const) p.line([px, py, 0], [px, py, 10], '#5e4129', 1.6);
      p.poly([[x0 - 0.04, y0 - 0.04, 15], [x0 - 0.04, y1 + 0.04, 15], [x1 + 0.05, y1 + 0.04, 10], [x1 + 0.05, y0 - 0.04, 10]], p.snow ? '#eef2f4' : shade(ROOF_COLORS.plank, 0.92), shade(ROOF_COLORS.plank, 0.5));
      p.barrel(1.6, 0.6);
      for (const y of [1.3, 1.62]) {
        p.line([1.55, y - 0.12, 0], [1.55, y - 0.12, 12], '#5e4129', 1.1);
        p.line([1.55, y + 0.12, 0], [1.55, y + 0.12, 12], '#5e4129', 1.1);
        p.wallR(1.551, y - 0.1, y + 0.1, 3, 11, y > 1.5 ? '#b88a5a' : '#9a6a40');
      }
      break;
    }
    case 'apothecary': {
      // A little glazed shop, herbs drying on a rack and a physic garden.
      shed(12, hvWallFor(trade), 'slate');
      p.wallR(x1 + 0.002, 0.4, 1.0, 4, 10, '#4a3020');
      p.wallR(x1 + 0.003, 0.43, 0.97, 5, 9, '#c8e0d8');
      for (const [y, col] of [[0.5, '#3d7a3a'], [0.62, '#a8322d'], [0.74, '#2e5e9a'], [0.86, '#c8962a']] as const) p.wallR(x1 + 0.004, y, y + 0.06, 5.5, 8, col);
      p.line([1.45, 1.4, 11], [1.85, 1.4, 11], '#5e4129', 1);
      for (let k = 0; k < 5; k++) {
        const x = 1.5 + k * 0.08;
        p.line([x, 1.4, 11], [x, 1.4, 7], '#6b4a2e', 0.5);
        p.ellipse(x, 1.4, 6.5, 1.3, 2, winter ? '#8a9a7a' : '#6aa04a');
      }
      if (!winter) for (let k = 0; k < 6; k++) p.bush(1.5 + (k % 3) * 0.14, 1.6 + Math.floor(k / 3) * 0.16, 2.4, k % 2 ? '#7aa858' : '#5a8a44');
      break;
    }
    default:
      shed(12, WOOD, 'shingle', 'plank');
  }
}

function hvWallFor(trade: BuildingType): string {
  return trade === 'weaver' ? '#e6d6b8' : trade === 'tailor' ? '#efe3c8' : '#e8dcc4';
}

/** A grazing sheep at a screen point; `f` is the facing (1 or -1). */
export function drawSheep(c: CanvasRenderingContext2D, x: number, y: number, f: number, white = '#f2ece0'): void {
  c.fillStyle = 'rgba(20,20,10,0.22)';
  c.beginPath();
  c.ellipse(x, y, 5, 1.6, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#3a3028';
  c.lineWidth = 0.9;
  c.beginPath();
  for (const lx of [-2.5, -1, 1.5, 3]) {
    c.moveTo(x + lx, y - 3);
    c.lineTo(x + lx, y);
  }
  c.stroke();
  c.fillStyle = white;
  for (const [dx, dy, r] of [
    [-2, -4.5, 2.6],
    [0.5, -5.2, 2.8],
    [2.5, -4.3, 2.4],
    [0, -3.4, 2.6],
  ]) {
    c.beginPath();
    c.arc(x + dx * f, y + dy, r, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#3a3028';
  c.beginPath();
  c.ellipse(x + 4.6 * f, y - 4.4, 1.5, 1.2, 0, 0, Math.PI * 2);
  c.fill();
}

/** A vine trained on a stake; stage 0..1 from cutting to mature. */
function vineSprite(season: Season, stage: number, fruiting: boolean): Sprite {
  return makeSprite(36, 40, 18, 34, (ctx) => {
    const k = 0.5 + 0.5 * stage;
    ctx.fillStyle = 'rgba(20,30,10,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8 * k, 3 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7b5a36';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -22 * k);
    ctx.moveTo(-9 * k, -15 * k);
    ctx.lineTo(9 * k, -15 * k);
    ctx.stroke();
    if (season === 3) return;
    const rand = mulberry32(Math.round(stage * 10) + 7);
    const leaf = season === 2 ? '#b8782a' : '#4f8a3a';
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = shade(leaf, 0.85 + rand() * 0.3);
      ctx.beginPath();
      ctx.arc((rand() - 0.5) * 18 * k, -12 * k - rand() * 10 * k, 3 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    if (fruiting) {
      ctx.fillStyle = '#5a2a6e';
      for (const dx of [-5, 1, 6]) {
        for (let j = 0; j < 4; j++) {
          ctx.beginPath();
          ctx.arc(dx * k + (j % 2) * 1.2, -12 * k + j * 1.6, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
}

/** A small fruit tree; stage 0..1 from sapling to mature. */
/** What each kind of market stall sells: awning colour and the goods on its board. */
const STALLS: { color: string; goods: string[] }[] = [
  { color: '#b03a2e', goods: ['#c8a46c', '#d9b77a', '#b98a4a'] }, // bread
  { color: '#3d7a3a', goods: ['#7aa040', '#e8742a', '#c42b3a'] }, // greens and roots
  { color: '#2e5e9a', goods: ['#a8b8c0', '#98a8b0', '#b8c8d0'] }, // fish
  { color: '#a07a2a', goods: ['#f2e8d6', '#e8c860', '#c8a46c'] }, // cheese and eggs
  { color: '#6a4a8a', goods: ['#4a6a9a', '#a04a3a', '#d8c79c'] }, // cloth
  { color: '#7a5a3a', goods: ['#8a6236', '#a8adb2', '#b0704a'] }, // pots and tools
];

/**
 * One stall of a marketplace, on a tile: posts, a board of goods and a
 * striped awning; shut (no awning or goods) when it has no vendor.
 */
export function stallSprite(kind: number, season: Season, open: boolean): Sprite {
  return makeSprite(TW + 8, TH + 40, TW / 2 + 4, 36, (ctx) => {
    const p = new Pen(ctx);
    p.snow = season === 3;
    const st = STALLS[kind % STALLS.length];
    // A small trestle stall: back posts, the counter and its wares, the
    // striped awning, and the front posts drawn last so they hold it up.
    const x = 0.2;
    const y = 0.25;
    const w = 0.6;
    const d = 0.45;
    const top = open ? 15 : 8;
    const front = open ? 11.5 : 8;
    p.line([x, y, 0], [x, y, top], '#5e4129', 1.3);
    p.line([x + w, y, 0], [x + w, y, top], '#5e4129', 1.3);
    p.box(x + 0.04, y + d * 0.45, x + w - 0.04, y + d - 0.02, 0, 6, '#8a6440');
    if (open) {
      st.goods.forEach((g, i) => {
        const [gx, gy] = iso(x + 0.1 + i * 0.17, y + d * 0.7, 6.5);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 3, 1.7, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      const stripes = 5;
      for (let i = 0; i < stripes; i++) {
        const x0 = x - 0.02 + (i * (w + 0.04)) / stripes;
        const x1 = x0 + (w + 0.04) / stripes;
        p.poly(
          [
            [x0, y - 0.02, top],
            [x1, y - 0.02, top],
            [x1, y + d + 0.03, front],
            [x0, y + d + 0.03, front],
          ],
          p.snow ? (i % 2 ? '#f2f5f6' : '#e2e7e9') : i % 2 ? '#f1e8d6' : st.color,
        );
      }
      // A scalloped valance along the front edge.
      for (let i = 0; i < stripes; i++) {
        const xm = x - 0.02 + ((i + 0.5) * (w + 0.04)) / stripes;
        const [vx, vy] = iso(xm, y + d + 0.03, front);
        ctx.fillStyle = p.snow ? '#e2e7e9' : i % 2 ? '#e6dcc8' : shade(st.color, 0.85);
        ctx.beginPath();
        ctx.ellipse(vx, vy, 3.6, 2, 0, 0, Math.PI);
        ctx.fill();
      }
    }
    p.line([x, y + d, 0], [x, y + d, front], '#5e4129', 1.3);
    p.line([x + w, y + d, 0], [x + w, y + d, front], '#5e4129', 1.3);
  });
}

/** A strawberry bed: low leafy plants on straw, white flowers in spring and red berries in summer. */
function strawberrySprite(season: Season, stage: number, fruiting: boolean, blossom: boolean): Sprite {
  return makeSprite(56, 28, 28, 16, (ctx) => {
    const winter = season === 3;
    // Two ridges of straw down the bed.
    for (const dy of [-3, 3]) {
      ctx.fillStyle = winter ? '#e4e8ea' : '#d8c084';
      ctx.beginPath();
      ctx.ellipse(0, dy, 20, 3.2, -0.46, 0, Math.PI * 2);
      ctx.fill();
    }
    if (winter) return;
    const rand = mulberry32(11);
    const k = 0.5 + 0.5 * stage;
    for (let i = 0; i < 9; i++) {
      const t = i / 8 - 0.5;
      const row = i % 2 ? 3 : -3;
      const x = t * 34 + (rand() - 0.5) * 2;
      const y = row - t * 15;
      for (const [dx, dy] of [
        [-1.6, -0.6],
        [1.6, -0.8],
        [0, -2],
      ]) {
        ctx.fillStyle = rand() < 0.5 ? '#4e8a36' : '#5e9a3e';
        ctx.beginPath();
        ctx.ellipse(x + dx * k, y + dy * k - 1, 2 * k, 1.4 * k, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (blossom || (stage >= 1 && !fruiting && season === 0)) {
        ctx.fillStyle = '#f8f4ea';
        ctx.fillRect(x - 0.6, y - 4 * k, 1.3, 1.3);
      }
      if (fruiting) {
        ctx.fillStyle = '#d8323a';
        ctx.beginPath();
        ctx.arc(x + 1.4, y - 0.4, 1.1, 0, Math.PI * 2);
        ctx.arc(x - 1.2, y + 0.2, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

export function fruitTreeSprite(fruit: string, season: Season, stage: number, fruiting: boolean, blossom = false): Sprite {
  if (fruit === 'grapes') return vineSprite(season, stage, fruiting);
  if (fruit === 'strawberries') return strawberrySprite(season, stage, fruiting, blossom);
  return makeSprite(36, 48, 18, 42, (ctx) => {
    const k = 0.45 + 0.55 * stage;
    const trunkH = 9 * k;
    ctx.fillStyle = 'rgba(20,30,10,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * k, 3.5 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5e4129';
    ctx.lineWidth = 2.2 * k;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -trunkH);
    ctx.stroke();
    const cy = -trunkH - 7 * k;
    if (season === 3) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const a of [-0.9, -0.3, 0.3, 0.9]) {
        ctx.moveTo(0, -trunkH);
        ctx.lineTo(Math.sin(a) * 9 * k, cy - Math.cos(a) * 5 * k);
      }
      ctx.stroke();
      return;
    }
    const leaf = season === 2 ? (fruit === 'pears' ? '#c8a03a' : '#b8782a') : fruit === 'plums' ? '#4f7f3a' : '#5d9a3a';
    const rand = mulberry32(fruit.length * 31 + Math.round(stage * 10));
    for (const [dx, dy, r] of [
      [-4, 1, 6],
      [4, 1, 6],
      [0, -3, 7],
      [0, 3, 6],
    ]) {
      ctx.fillStyle = shade(leaf, 0.85 + rand() * 0.25);
      ctx.beginPath();
      ctx.arc(dx * k, cy + dy * k, r * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,220,0.18)';
    ctx.beginPath();
    ctx.arc(-2 * k, cy - 3 * k, 4 * k, 0, Math.PI * 2);
    ctx.fill();
    const dot = (color: string, n: number, r: number) => {
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * 8 * k;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    if (blossom) dot(fruit === 'plums' ? '#f8f4f0' : '#f6c8d8', 14, 1.1);
    if (fruiting) dot(fruit === 'apples' ? '#c4322a' : fruit === 'pears' ? '#d0c848' : '#5a2a6e', 8, 1.4);
  });
}

/** A rough, faceted lump of rock (or ore) standing at (x, y), r pixels across. */
export function rockLump(p: Pen, x: number, y: number, r: number, base: string, seed = 1, z = 0): void {
  const rand = mulberry32(seed * 977 + Math.round(x * 100) * 13 + Math.round(y * 100));
  const [sx, sy] = iso(x, y, z);
  const c = p.ctx;
  const k = [0.9 + rand() * 0.2, 1 + rand() * 0.3, 1.1 + rand() * 0.3, 0.8 + rand() * 0.3];
  c.fillStyle = 'rgba(30,30,20,0.22)';
  c.beginPath();
  c.ellipse(sx + r * 0.25, sy + r * 0.1, r * 1.05, r * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = shade(base, 0.78);
  c.beginPath();
  c.moveTo(sx - r, sy);
  c.lineTo(sx - r * 0.6, sy - r * k[0]);
  c.lineTo(sx + r * 0.25, sy - r * k[2]);
  c.lineTo(sx + r, sy - r * 0.35 * k[1]);
  c.lineTo(sx + r * 0.8, sy + r * 0.3);
  c.lineTo(sx - r * 0.5, sy + r * 0.35);
  c.closePath();
  c.fill();
  c.fillStyle = shade(base, 1.08);
  c.beginPath();
  c.moveTo(sx - r, sy);
  c.lineTo(sx - r * 0.6, sy - r * k[0]);
  c.lineTo(sx + r * 0.25, sy - r * k[2]);
  c.lineTo(sx + r * 0.05, sy - r * 0.25 * k[3]);
  c.closePath();
  c.fill();
  c.strokeStyle = shade(base, 0.55);
  c.lineWidth = 0.5;
  c.beginPath();
  c.moveTo(sx + r * 0.25, sy - r * k[2]);
  c.lineTo(sx + r * 0.05, sy - r * 0.25 * k[3]);
  c.lineTo(sx + r * 0.8, sy + r * 0.3);
  c.stroke();
}

/** A heap of rusty iron ore lumps. */
export function oreHeap(p: Pen, x: number, y: number, n = 5): void {
  const spots: [number, number, number][] = [[-0.1, 0.02, 4.5], [0.08, -0.04, 4], [0.0, 0.1, 4.2], [0.14, 0.1, 3.5], [-0.12, 0.14, 3.4], [0.02, 0.0, 3.2]];
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const [dx, dy, r] = spots[i];
    rockLump(p, x + dx, y + dy, r, i % 2 ? '#7a4a34' : '#8a5236', i + 3, i === 5 ? 4 : 0);
    const [sx, sy] = iso(x + dx, y + dy, 0);
    p.ctx.fillStyle = '#c8783a';
    p.ctx.fillRect(sx - r * 0.4, sy - r * 0.7, 1.4, 1);
  }
}

/** Squared, freshly cut blocks of pale stone, stacked. */
/** A water wheel standing upright on the +x side of a mill, in its race. */
function waterWheel(p: Pen, wx: number, wy: number, wz: number, R: number, RZ: number, season: Season): void {
  const ring = (k: number, r: number): V3 => [wx, wy + Math.cos(k) * r, wz + Math.sin(k) * (RZ * r) / R];
  const pts: V3[] = [];
  for (let k = 0; k < 24; k++) pts.push(ring((k / 24) * Math.PI * 2, R));
  p.poly(pts, null, '#5a3e26', 2.2);
  const inner: V3[] = [];
  for (let k = 0; k < 24; k++) inner.push(ring((k / 24) * Math.PI * 2, R * 0.82));
  p.poly(inner, null, '#6b4a2c', 1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    p.line([wx, wy, wz], ring(a, R), '#6b4a2c', 1);
    const o = ring(a, R);
    p.line(o, [o[0] + 0.08, o[1], o[2]], '#8a6440', 2);
  }
  p.circle(wx, wy, wz, 2, '#4a3020');
  if (season !== 3) p.line([wx + 0.08, wy - R, 1], [wx + 0.08, wy + R * 1.6, 0], 'rgba(200,230,240,0.6)', 1);
}

/** A straw bee skep on a bench (z), coiled in rings, with its little door. */
function skep(p: Pen, x: number, y: number, z: number): void {
  const [sx, sy] = iso(x, y, z);
  const c = p.ctx;
  c.fillStyle = '#c8a050';
  c.beginPath();
  c.moveTo(sx - 3, sy);
  c.quadraticCurveTo(sx - 3.2, sy - 6, sx, sy - 6.5);
  c.quadraticCurveTo(sx + 3.2, sy - 6, sx + 3, sy);
  c.closePath();
  c.fill();
  c.strokeStyle = '#9a7a38';
  c.lineWidth = 0.5;
  for (const h of [1.8, 3.6, 5]) {
    c.beginPath();
    c.moveTo(sx - 3 + h * 0.15, sy - h);
    c.lineTo(sx + 3 - h * 0.15, sy - h);
    c.stroke();
  }
  c.fillStyle = '#3a2a1a';
  c.fillRect(sx - 0.6, sy - 1.2, 1.2, 1.2);
}

/** A gown on a dress form. */
function gown(p: Pen, x: number, y: number, color: string): void {
  const [gx, gy] = iso(x, y, 0);
  const c = p.ctx;
  c.fillStyle = 'rgba(30,24,12,0.22)';
  c.beginPath();
  c.ellipse(gx + 1, gy, 4.5, 1.8, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(gx - 1.6, gy - 15);
  c.lineTo(gx + 1.6, gy - 15);
  c.lineTo(gx + 1.2, gy - 11);
  c.lineTo(gx + 4, gy - 3);
  c.lineTo(gx - 4, gy - 3);
  c.lineTo(gx - 1.2, gy - 11);
  c.closePath();
  c.fill();
  c.strokeStyle = '#e0b840';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(gx - 1.3, gy - 11);
  c.lineTo(gx + 1.3, gy - 11);
  c.moveTo(gx - 4, gy - 3.2);
  c.lineTo(gx + 4, gy - 3.2);
  c.stroke();
  c.strokeStyle = '#5e4129';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(gx, gy);
  c.lineTo(gx, gy - 3);
  c.stroke();
}

/** A boot, as a shop sign or on the bench (z). */
function bootSign(p: Pen, x: number, y: number, z: number): void {
  const [bx, by] = iso(x, y, z);
  p.ctx.fillStyle = '#6a3e22';
  p.ctx.fillRect(bx - 2, by - 5, 3, 5);
  p.ctx.fillRect(bx - 2, by - 1, 6, 2);
}

/** A pointed window of coloured glass in a wall facing +y, its panes leaded in bands. */
function lancetL(p: Pen, y: number, x: number, w: number, z0: number, z1: number, lit: boolean): void {
  p.wallL(y, x - 0.025, x + w + 0.025, z0 - 1, z1, '#3a3a44');
  p.poly([[x - 0.025, y, z1], [x + w + 0.025, y, z1], [x + w / 2, y, z1 + 5]], '#3a3a44');
  const cols = lit ? ['#e8b850', '#f0c860', '#e0a840', '#e8b850'] : ['#3a62c4', '#c42b3a', '#4f8a3c', '#d8a838'];
  const n = 4;
  for (let k = 0; k < n; k++) p.wallL(y + 0.001, x, x + w, z0 + ((z1 - z0) * k) / n, z0 + ((z1 - z0) * (k + 1)) / n, cols[k % 4]);
  p.poly([[x, y + 0.001, z1], [x + w, y + 0.001, z1], [x + w / 2, y + 0.001, z1 + 3.6]], cols[1]);
  p.line([x + w / 2, y + 0.002, z0], [x + w / 2, y + 0.002, z1 + 3], 'rgba(40,40,50,0.8)', 0.5);
}

/** A row of round arches on slim columns from a to b (local tiles), as round a cloister. */
function arcade(p: Pen, a: [number, number], b: [number, number], n: number, h: number, stone: string): void {
  const c = p.ctx;
  const at = (t: number, z: number) => iso(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z);
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const [x0, y0] = at(t0, h - 3);
    const [xm, ym] = at((t0 + t1) / 2, h + 1.4);
    const [x1, y1] = at(t1, h - 3);
    const [x0t, y0t] = at(t0, h + 1.5);
    const [x1t, y1t] = at(t1, h + 1.5);
    c.fillStyle = stone;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0t, y0t);
    c.lineTo(x1t, y1t);
    c.lineTo(x1, y1);
    c.quadraticCurveTo(xm * 2 - (x0 + x1) / 2, ym * 2 - (y0 + y1) / 2, x0, y0);
    c.fill();
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = at(t, 0);
    const [xt, yt] = at(t, h - 2.6);
    c.strokeStyle = stone;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(xt, yt);
    c.stroke();
    c.strokeStyle = 'rgba(60,50,40,0.35)';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(x + 0.7, y);
    c.lineTo(xt + 0.7, yt);
    c.stroke();
  }
}

/** A soft heap of loose stuff (sand, charcoal), lit from the left. */
function mound(p: Pen, x: number, y: number, r: number, light: string, dark: string): void {
  const [hx, hy] = iso(x, y, 0);
  const c = p.ctx;
  c.fillStyle = 'rgba(40,30,16,0.22)';
  c.beginPath();
  c.ellipse(hx + 2, hy + 1, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  const g = c.createLinearGradient(hx - r, 0, hx + r, 0);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(hx - r, hy);
  c.quadraticCurveTo(hx - r * 0.5, hy - r * 0.9, hx, hy - r * 0.85);
  c.quadraticCurveTo(hx + r * 0.6, hy - r * 0.8, hx + r, hy);
  c.quadraticCurveTo(hx, hy + r * 0.35, hx - r, hy);
  c.fill();
}

/** A round wooden tub or basket, its contents showing on top. */
function tub(p: Pen, x: number, y: number, r: number, hgt: number, fill: string, wood = '#7a5230'): void {
  const [tx, ty] = iso(x, y, 0);
  const c = p.ctx;
  c.fillStyle = 'rgba(30,24,12,0.22)';
  c.beginPath();
  c.ellipse(tx + 1.5, ty + 0.5, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = wood;
  c.beginPath();
  c.moveTo(tx - r, ty - hgt);
  c.lineTo(tx - r * 0.9, ty);
  c.ellipse(tx, ty, r * 0.9, r * 0.4, 0, Math.PI, 0, true);
  c.lineTo(tx + r, ty - hgt);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(30,16,6,0.28)';
  c.fillRect(tx + r * 0.3, ty - hgt, r * 0.65, hgt + r * 0.2);
  c.strokeStyle = '#3c2a1a';
  c.lineWidth = 0.8;
  for (const t of [0.3, 0.75]) {
    c.beginPath();
    c.ellipse(tx, ty - hgt * (1 - t), r * (0.95 - t * 0.05), r * 0.42, 0, 0, Math.PI);
    c.stroke();
  }
  c.fillStyle = shade(wood, 0.75);
  c.beginPath();
  c.ellipse(tx, ty - hgt, r, r * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(tx, ty - hgt, r * 0.82, r * 0.34, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  c.ellipse(tx - r * 0.25, ty - hgt - r * 0.06, r * 0.3, r * 0.09, 0, 0, Math.PI * 2);
  c.fill();
}

/** Curved roof tiles stacked on a pallet, their rounded ends towards us. */
function tileStack(p: Pen, x: number, y: number, rows = 3): void {
  p.box(x, y, x + 0.42, y + 0.26, 0, 1.6, '#7b5a36');
  for (let r = 0; r < rows; r++) {
    const z = 1.6 + r * 2.4;
    p.box(x + 0.01, y + 0.01, x + 0.41, y + 0.25, z, 2.4, r % 2 ? '#b8583a' : '#ac4e32');
    for (let k = 0; k < 5; k++) {
      const [tx, ty] = iso(x + 0.05 + k * 0.08, y + 0.25, z + 1.2);
      p.ctx.strokeStyle = 'rgba(80,30,18,0.65)';
      p.ctx.lineWidth = 0.6;
      p.ctx.beginPath();
      p.ctx.ellipse(tx, ty, 2.2, 1.4, 0, Math.PI, 0);
      p.ctx.stroke();
    }
  }
}

/** A corded bale of wool or cloth. */
function bale(p: Pen, x: number, y: number, color: string): void {
  p.box(x, y, x + 0.26, y + 0.18, 0, 8, color);
  for (const t of [0.07, 0.19]) {
    p.line([x + t, y + 0.18, 0], [x + t, y + 0.18, 8], '#7a5a3a', 0.7);
    p.line([x + 0.26, y + t * 0.75, 0], [x + 0.26, y + t * 0.75, 8], '#6a4a2a', 0.7);
  }
}

function cutBlocks(p: Pen, x: number, y: number, n = 3): void {
  const col = '#cfc8b8';
  const slots: [number, number, number][] = [[0, 0, 0], [0.26, 0, 0], [0.13, 0.01, 5]];
  for (let i = 0; i < Math.min(n, slots.length); i++) {
    const [dx, dy, z] = slots[i];
    p.box(x + dx, y + dy, x + dx + 0.24, y + dy + 0.15, z, 5, col);
    p.line([x + dx + 0.05, y + dy + 0.15, z + 2], [x + dx + 0.19, y + dy + 0.15, z + 2], 'rgba(90,80,60,0.35)', 0.5);
  }
}

/** The manor grows with the settlement: hall, manor house, stone manor, keep. */
function drawManor(p: Pen, level: number, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  const arms = HERALDRY.current;
  if (level <= 1) {
    // Manor Hall: one long timber hall on a stone footing, a porch and a lean-to.
    p.shadow(0.35, 0.7, 2.7, 2.15);
    p.box(0.4, 0.75, 2.6, 2.05, 0, 4, STONE);
    p.box(0.4, 0.75, 2.6, 2.05, 4, 16, PLASTER);
    p.timber(0.4, 0.75, 2.6, 2.05, 4, 16, BEAM);
    for (const x of [0.65, 1.0, 1.95, 2.3]) p.windowL(2.05, x, 9, 0.13, 6, winter && x === 0.65);
    p.windowR(2.6, 1.25, 9, 0.14, 6);
    // Lean-to store against the right gable.
    p.box(2.6, 1.05, 2.92, 1.85, 0, 11, WOOD);
    p.roofY(2.6, 1.05, 2.92, 1.85, 11, 4, 'shingle', WOOD, 0.06);
    p.roofX(0.4, 0.75, 2.6, 2.05, 20, 26, 'shingle', PLASTER, 0.12);
    smoke.push(p.chimney(1.8, 1.35, 30, 14, '#8d8274'));
    // A gabled porch over the door.
    p.box(1.3, 2.05, 1.72, 2.4, 0, 1.5, '#9b9284');
    p.line([1.33, 2.38, 1.5], [1.33, 2.38, 13], BEAM, 1.4);
    p.line([1.69, 2.38, 1.5], [1.69, 2.38, 13], BEAM, 1.4);
    p.wallL(2.052, 1.4, 1.62, 1.5, 13, '#5b3a22');
    p.roofY(1.28, 2.0, 1.74, 2.42, 13, 7, 'shingle', PLASTER, 0.04);
    p.wallL(2.055, 1.0, 1.1, 10, 19, arms.field);
    p.wallL(2.055, 1.92, 2.02, 10, 19, arms.field);
    p.logPile(0.35, 2.45, 2);
    p.lordFlag(2.85, 2.35, 0, 30);
    return;
  }
  if (level === 2) {
    // Manor House: two storeys, stone below and timber-framed above, jettied
    // out a little, with a cross wing of the same height.
    p.shadow(0.35, 0.3, 2.75, 2.3);
    // Main range on the left, ridge along x, reaching to the wing.
    p.box(0.35, 0.75, 2.0, 2.05, 0, 14, STONE);
    p.box(0.32, 0.72, 2.0, 2.09, 14, 15, PLASTER);
    p.timber(0.32, 0.72, 2.0, 2.09, 14, 15, BEAM);
    for (const x of [0.55, 0.9, 1.6]) p.windowL(2.05, x, 5, 0.14, 6, winter && x === 0.55);
    for (const x of [0.5, 0.85, 1.2, 1.6]) p.windowL(2.09, x, 19, 0.14, 7);
    p.roofX(0.32, 0.72, 2.0, 2.09, 29, 24, 'tile', PLASTER, 0.1);
    // Cross wing on the right, ridge front to back.
    p.box(2.0, 0.3, 2.8, 2.3, 0, 14, STONE);
    p.box(1.97, 0.27, 2.83, 2.33, 14, 15, PLASTER);
    p.timber(1.97, 0.27, 2.83, 2.33, 14, 15, BEAM);
    for (const y of [0.55, 1.15, 1.75]) {
      p.windowR(2.8, y, 5, 0.14, 6);
      p.windowR(2.83, y, 19, 0.14, 7, winter && y === 1.15);
    }
    p.windowL(2.3, 2.3, 5, 0.14, 6);
    p.windowL(2.33, 2.3, 19, 0.14, 7);
    p.roofY(1.97, 0.27, 2.83, 2.33, 29, 22, 'tile', PLASTER, 0.1);
    smoke.push(p.chimney(0.75, 1.3, 40, 18, '#8d8274'));
    smoke.push(p.chimney(2.35, 0.7, 40, 16, '#8d8274'));
    // Door with a stone step and the lord's hangings.
    p.wallL(2.052, 1.2, 1.45, 0, 12, '#5b3a22');
    p.line([1.325, 2.054, 0], [1.325, 2.054, 12], '#3d2614', 0.8);
    p.box(1.15, 2.05, 1.5, 2.25, 0, 2, '#9b9284');
    p.wallL(2.095, 1.05, 1.13, 15, 26, arms.field);
    p.wallL(2.095, 1.52, 1.6, 15, 26, arms.field);
    p.lordFlag(2.4, 1.3, 51, 22);
    p.bush(0.5, 2.3, 4, '#5a7a3a');
    p.bush(0.85, 2.35, 3.5, '#4f6f34');
    return;
  }
  if (level >= 4) {
    drawPalace(p, season, smoke);
    return;
  }
  // Stone Manor: three storeys of dressed stone, a matching wing and a
  // corner tower, on grounds of 4x4.
  const ST = '#b6ae9f';
  p.shadow(0.35, 0.3, 3.65, 3.2);
  // Gravel path to the door, and clipped box hedges either side.
  p.poly([[1.6, 2.95, 0], [2.06, 2.95, 0], [2.11, 3.95, 0], [1.55, 3.95, 0]], winter ? '#d4d8d6' : '#c8b896');
  for (const y of [3.25, 3.7]) {
    p.bush(1.3, y, 4.5, '#557a38');
    p.bush(2.36, y, 4.5, '#557a38');
  }
  // Tower at the back left, a storey above the rest.
  p.box(0.35, 0.3, 1.25, 1.2, 0, 66, ST, undefined, 'stone');
  for (const z of [10, 26, 42]) p.windowR(1.25, 0.6, z, 0.14, 8);
  p.windowL(1.2, 0.65, 54, 0.14, 7);
  for (let i = 0; i < 4; i++) {
    p.box(0.35 + i * 0.25, 1.12, 0.47 + i * 0.25, 1.2, 66, 6, ST);
    p.box(1.17, 0.3 + i * 0.25, 1.25, 0.42 + i * 0.25, 66, 6, ST);
  }
  p.lordFlag(0.8, 0.75, 66, 26);
  // Main range, ridge along x.
  p.box(0.6, 1.2, 2.65, 2.9, 0, 42, ST, undefined, 'stone');
  for (const x of [0.8, 1.2, 2.2]) p.windowL(2.9, x, 5, 0.16, 8, winter && x === 0.8);
  for (const z of [19, 33]) for (const x of [0.8, 1.2, 1.7, 2.2]) p.windowL(2.9, x, z, 0.16, 8);
  // String courses between the floors.
  for (const z of [15, 29]) {
    p.wallL(2.903, 0.6, 2.65, z, z + 1.2, 'rgba(70,60,50,0.35)');
    p.wallR(3.603, 0.4, 2.9, z, z + 1.2, 'rgba(70,60,50,0.3)');
    p.wallL(2.903, 2.65, 3.6, z, z + 1.2, 'rgba(70,60,50,0.35)');
  }
  p.roofX(0.6, 1.2, 2.65, 2.9, 42, 28, 'slate', ST, 0.1);
  // Dormers on the front slope.
  for (const x of [1.0, 1.9]) {
    p.box(x, 2.35, x + 0.3, 2.6, 46, 9, ST);
    p.windowL(2.6, x + 0.08, 48, 0.14, 5);
    p.roofY(x - 0.02, 2.33, x + 0.32, 2.62, 55, 6, 'slate', ST, 0.03);
  }
  // Wing on the right, ridge front to back.
  p.box(2.65, 0.4, 3.6, 2.9, 0, 42, ST, undefined, 'stone');
  for (const y of [0.7, 1.3, 1.9, 2.5]) for (const z of [5, 19, 33]) p.windowR(3.6, y, z, 0.15, 8, winter && z === 5 && y === 1.9);
  for (const z of [5, 19, 33]) p.windowL(2.9, 3.05, z, 0.16, 8);
  p.roofY(2.65, 0.4, 3.6, 2.9, 42, 26, 'slate', ST, 0.1);
  smoke.push(p.chimney(0.95, 1.85, 58, 20, '#8d8274'));
  smoke.push(p.chimney(3.1, 0.75, 58, 18, '#8d8274'));
  // Arched door under a carved hood, with hangings.
  p.wallL(2.902, 1.68, 1.98, 0, 14, '#4a2f1b');
  p.line([1.83, 2.904, 0], [1.83, 2.904, 14], '#2e1d10', 0.8);
  p.box(1.6, 2.9, 2.06, 3.0, 14, 2, '#9b9284');
  p.box(1.55, 2.9, 2.1, 3.15, 0, 2, '#9b9284');
  p.wallL(2.905, 1.48, 1.57, 17, 28, arms.field);
  p.wallL(2.905, 2.09, 2.18, 17, 28, arms.field);
}

/**
 * The Palace: a pale stone house of state round a gravelled forecourt, two
 * wings ending in corner pavilions, a columned portico under a pediment and a
 * copper dome over the hall, the lord's banner flying from its lantern.
 */
function drawPalace(p: Pen, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  const arms = HERALDRY.current;
  const ST = '#d4ccbc';
  const ROOFC = 'slate';
  p.shadow(0.2, 0.2, 3.85, 3.3);
  // The forecourt: gravel, with a round basin in the middle.
  p.poly([[1.1, 2.95, 0], [2.9, 2.95, 0], [3.0, 3.95, 0], [1.0, 3.95, 0]], winter ? '#d8dcda' : '#d2c4a0');
  p.ellipse(2.0, 3.45, 1, 13, 6.5, '#a8a093');
  p.ellipse(2.0, 3.45, 2, 11, 5.4, winter ? '#dde8ee' : '#5a8ab0');
  p.line([2.0, 3.45, 2], [2.0, 3.45, 9], '#bab3a6', 1.6);
  // Left wing, ridge front to back.
  p.box(0.3, 0.45, 1.3, 2.95, 0, 36, ST, undefined, 'stone');
  for (const z of [5, 19]) p.windowL(2.95, 0.55, z, 0.16, 9, winter && z === 5);
  p.roofY(0.3, 0.45, 1.3, 2.95, 36, 22, ROOFC, ST, 0.08);
  // The central block of state rooms.
  p.box(1.3, 0.6, 2.7, 2.6, 0, 46, ST, undefined, 'stone');
  for (const z of [6, 22]) for (const x of [1.45, 1.75, 2.25, 2.55]) p.windowL(2.6, x, z, 0.14, z === 22 ? 12 : 9, winter && z === 6);
  for (const x of [1.45, 1.75, 2.0, 2.25, 2.55]) p.windowL(2.6, x - 0.04, 37, 0.12, 5);
  // A balustrade along the top, and a low hipped roof behind it.
  p.wallL(2.603, 1.3, 2.7, 43, 46, '#c4bcac');
  p.roofPyramid(1.3, 0.6, 2.7, 2.6, 46, 12, ROOFC, 0.02);
  // The dome over the great hall, its lantern and the lord's banner.
  p.box(1.72, 1.32, 2.28, 1.88, 52, 8, ST);
  p.ellipse(2.0, 1.6, 60, 22, 11, winter ? '#e6ecee' : '#5f9a86');
  p.ellipse(2.0, 1.6, 66, 16, 8, winter ? '#f2f6f8' : '#6faa94');
  p.ellipse(2.0, 1.6, 71, 9, 5, winter ? '#f6f9fa' : '#7cb8a2');
  p.box(1.94, 1.54, 2.06, 1.66, 74, 6, ST);
  p.lordFlag(2.0, 1.6, 80, 20);
  smoke.push(p.chimney(1.45, 0.85, 50, 10, '#a8a093'));
  // Right wing, ridge front to back.
  p.box(2.7, 0.45, 3.7, 2.95, 0, 36, ST, undefined, 'stone');
  for (const y of [0.75, 1.35, 1.95, 2.55]) for (const z of [5, 19]) p.windowR(3.7, y, z, 0.15, 9, winter && z === 5 && y === 1.35);
  for (const z of [5, 19]) p.windowL(2.95, 3.25, z, 0.16, 9);
  p.roofY(2.7, 0.45, 3.7, 2.95, 36, 22, ROOFC, ST, 0.08);
  smoke.push(p.chimney(3.2, 0.8, 52, 12, '#a8a093'));
  // Corner pavilions at the front of each wing, a storey higher, under tall roofs.
  for (const x0 of [0.22, 3.08]) {
    p.box(x0, 2.45, x0 + 0.7, 3.15, 0, 50, ST, undefined, 'stone');
    for (const z of [6, 22, 38]) p.windowL(3.15, x0 + 0.27, z, 0.15, 9);
    p.windowR(x0 + 0.7, 2.72, 22, 0.14, 9);
    p.roofPyramid(x0, 2.45, x0 + 0.7, 3.15, 50, 26, ROOFC, 0.05);
    p.line([x0 + 0.35, 2.8, 76], [x0 + 0.35, 2.8, 84], '#d8b84a', 1.2);
  }
  // The portico: four columns under a pediment carved with the arms.
  p.box(1.5, 2.6, 2.5, 2.95, 0, 2.5, '#c4bcac');
  for (const x of [1.58, 1.84, 2.16, 2.42]) {
    p.line([x, 2.9, 2.5], [x, 2.9, 30], '#efe9dc', 2.4);
    p.line([x + 0.03, 2.9, 2.5], [x + 0.03, 2.9, 30], 'rgba(120,110,95,0.35)', 0.8);
  }
  p.box(1.5, 2.6, 2.5, 2.95, 30, 3, '#e2dccd');
  p.poly([[1.5, 2.95, 33], [2.5, 2.95, 33], [2.0, 2.95, 43]], '#e8e2d4', '#b8b0a0', 0.8);
  p.circle(2.0, 2.952, 37, 2.6, arms.field);
  p.wallL(2.602, 1.86, 2.14, 2.5, 18, '#4a2f1b');
  // Hangings in the lord's colours either side of the door.
  p.wallL(2.604, 1.62, 1.7, 14, 26, arms.field);
  p.wallL(2.604, 2.3, 2.38, 14, 26, arms.field);
}

/** Ground tile for building yards drawn under some buildings. */
export function plotColor(season: Season): string {
  return season === 3 ? '#d9dcd8' : mix('#a88a5c', GRASS[season][1], 0.55);
}
