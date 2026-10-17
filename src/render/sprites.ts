import { mulberry32 } from '../game/rng';
import { HOME_TRADES } from '../game/sim';
import type { BuildingType, Season } from '../game/types';
import { type Material, Pen, TH, TW, iso, mix, shade, type V3 } from './pen';

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

/** Points along a road tile's centre line: a curve for corners, spokes otherwise. */
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

export function roadTile(season: Season, mask: number, layer: 'edge' | 'fill'): Sprite {
  return makeSprite(TW + 4, TH + 4, TW / 2 + 2, 2, (ctx) => {
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
    if (layer === 'edge') {
      draw(edge, 15);
      return;
    }
    draw(dirt, 12);
    // Wheel ruts.
    ctx.save();
    ctx.globalAlpha = 0.5;
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
export function pavedTile(season: Season, mask: number, layer: 'edge' | 'fill'): Sprite {
  return makeSprite(TW + 4, TH + 4, TW / 2 + 2, 2, (ctx) => {
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
      // Kerb stones and a strip of trodden earth.
      draw(season === 3 ? '#a8a49c' : '#6e6658', 19);
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
      const base = ore ? '#6e6258' : '#9d9a92';
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
        ctx.fillStyle = '#b4652e';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + (rand() - 0.6) * r, y - rand() * r, 2.4, 1.6);
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
  return makeSprite(sw, sh, h * (TW / 2) + 15, top, (ctx) => {
    const p = new Pen(ctx);
    p.snow = season === 3;
    p.matFor = wallMaterial;
    return drawBuilding(p, type, level, season, variant);
  });
}

const STONE_COLORS = new Set([STONE, '#c8c0b0', '#9d9488', '#b0a898', '#b6ae9f', '#9d978c', '#a49c8e', '#c8c2b6', '#9b9284']);

/** Wall material for a box colour: stone greys, timber browns, plastered infill. */
function wallMaterial(color: string): Material | undefined {
  if (STONE_COLORS.has(color)) return 'stone';
  if (color === WOOD) return 'plank';
  if (color === PLASTER || color === '#e8d4b0' || HOUSE_VARIANTS.some((v) => v.wall === color)) return 'plaster';
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
  // Expanded workshops get fired-clay roofs and a guild banner.
  const expanded = level >= 2 && type !== 'house' && type !== 'townhall';
  if (expanded) p.roofTint = { color: '#a4523a', t: 0.55 };
  const out = drawBuildingBody(p, type, level, season, variant, smoke);
  if (expanded) {
    p.roofTint = null;
    p.flag(0.12, 0.12, 0, 34, '#2e5e9a');
  }
  return out;
}

function drawBuildingBody(p: Pen, type: BuildingType, level: number, season: Season, variant: number, smoke: V3[]): V3[] {
  switch (type) {
    case 'townhall': {
      drawManor(p, level, season, smoke);
      break;
    }
    case 'house': {
      const hv = HOUSE_VARIANTS[variant % HOUSE_VARIANTS.length];
      const yard = YARD_CODES[Math.floor(variant / HOUSE_VARIANTS.length) % YARD_CODES.length] ?? null;
      const trade = HOME_TRADES[Math.floor(variant / 16) - 1] ?? null;
      const WALL = hv.wall;
      p.roofTint = hv.tint;
      if (level >= 3) {
        // Townhouse: stone ground floor, two jettied timber storeys.
        p.shadow(0.15, 0.2, 1.85, 1.7);
        p.box(0.22, 0.28, 1.78, 1.62, 0, 12, STONE);
        p.box(0.17, 0.23, 1.83, 1.67, 12, 13, WALL);
        p.timber(0.17, 0.23, 1.83, 1.67, 12, 13, BEAM);
        p.box(0.12, 0.18, 1.88, 1.72, 25, 12, WALL);
        p.timber(0.12, 0.18, 1.88, 1.72, 25, 12, BEAM);
        p.doorL(1.62, 0.85, 0.22, 11);
        p.windowL(1.62, 0.38, 4, 0.16, 5, season === 3);
        p.windowL(1.62, 1.4, 4, 0.16, 5);
        drawHouseExtra(p, hv.extra, season, 1.62, [0.38, 1.4], 4, [0.85, 0.22]);
        for (const x of [0.35, 0.85, 1.4]) {
          p.windowL(1.67, x, 15, 0.14, 6, season === 3 && x > 1);
          p.windowL(1.72, x, 28, 0.14, 6);
        }
        p.windowR(1.83, 0.55, 15, 0.14, 6);
        p.windowR(1.88, 0.95, 28, 0.14, 6);
        // Flower boxes under the upper windows.
        if (season !== 3) {
          for (const x of [0.35, 0.85, 1.4]) {
            p.box(x - 0.02, 1.72, x + 0.16, 1.78, 26, 2, '#7b5a36');
            const [fx, fy] = iso(x + 0.07, 1.78, 29);
            p.ctx.fillStyle = ['#e84a6a', '#f2d34a', '#b97ae0'][Math.floor(x * 3) % 3];
            p.ctx.beginPath();
            p.ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
            p.ctx.fill();
          }
        }
        p.roofTint = null;
        p.roofX(0.12, 0.18, 1.88, 1.72, 37, 22, 'tile', WALL, 0.12);
        smoke.push(p.chimney(0.5, 1.15, 46, 16, '#8f8476'));
        smoke.push(p.chimney(1.45, 1.15, 46, 16, '#8f8476'));
        // Hanging sign.
        p.line([1.9, 1.75, 20], [2.0, 1.85, 20], '#3b2a1a', 1.2);
        p.wallR(1.95, 1.72, 1.92, 12, 18, '#c49a52');
      } else if (level >= 2) {
        p.shadow(0.2, 0.25, 1.8, 1.65);
        p.box(0.25, 0.3, 1.75, 1.6, 0, 12, STONE);
        p.box(0.2, 0.25, 1.8, 1.65, 12, 16, WALL);
        p.timber(0.2, 0.25, 1.8, 1.65, 12, 16, BEAM);
        p.doorL(1.6, 0.9, 0.2, 11);
        p.windowL(1.6, 0.42, 4, 0.14, 5);
        p.windowL(1.6, 1.4, 4, 0.14, 5);
        drawHouseExtra(p, hv.extra, season, 1.6, [0.42, 1.4], 4, [0.9, 0.2]);
        p.windowL(1.65, 0.45, 17, 0.14, 6, season === 3);
        p.windowL(1.65, 1.35, 17, 0.14, 6);
        p.windowR(1.8, 0.6, 17, 0.14, 6);
        p.windowR(1.75, 0.8, 4, 0.14, 5);
        p.roofTint = null;
        p.roofX(0.2, 0.25, 1.8, 1.65, 28, 18, hv.roof2, WALL, 0.12);
        smoke.push(p.chimney(1.35, 1.12, 34, 16, '#8f8476'));
        p.bush(1.85, 1.85, 4, season === 3 ? '#8d9a86' : '#4d8a3a');
        p.barrel(0.3, 1.85);
      } else {
        p.shadow(0.35, 0.45, 1.65, 1.45);
        // Vegetable patch.
        if (season !== 3 && yard === 'veg') {
          p.poly(
            [
              [0.25, 1.6, 0],
              [1.0, 1.6, 0],
              [1.0, 1.92, 0],
              [0.25, 1.92, 0],
            ],
            '#7a5a38',
          );
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) p.bush(0.38 + i * 0.25, 1.7 + j * 0.15, 2.2, season === 2 ? '#b08a3a' : '#5d9a3a');
          }
        }
        p.fence([0.2, 1.97], [1.05, 1.97]);
        p.box(0.35, 0.45, 1.65, 1.45, 0, 17, WALL);
        p.timber(0.35, 0.45, 1.65, 1.45, 0, 17, BEAM);
        p.windowL(1.45, 0.52, 7, 0.14, 5, season === 3);
        p.windowL(1.45, 1.32, 7, 0.14, 5);
        p.doorL(1.45, 0.9, 0.18, 11);
        p.windowR(1.65, 0.8, 7, 0.14, 5);
        drawHouseExtra(p, hv.extra, season, 1.45, [0.52, 1.32], 7, [0.9, 0.18]);
        p.roofX(0.35, 0.45, 1.65, 1.45, 17, 15, 'thatch', WALL, 0.13);
        smoke.push(p.chimney(1.3, 1.08, 24, 14, '#8a7d70'));
        if (!yard) drawHouseProp(p, hv.prop === 'hive' ? 'logs' : hv.prop, season);
      }
      if (yard) drawYard(p, yard, level, season);
      if (trade) drawHomeCraft(p, trade, level, season);
      p.roofTint = null;
      break;
    }
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
      p.windowR(1.55, 0.7, 10, 0.14, 9);
      p.roofX(0.35, 0.35, 1.55, 1.45, 24, 18, 'slate', '#b6ae9f', 0.1);
      // A little bell-cote.
      p.box(1.38, 0.82, 1.5, 0.98, 42, 8, '#b6ae9f');
      p.roofPyramid(1.38, 0.82, 1.5, 0.98, 50, 6, 'slate', 0.02);
      // Flax drying for paper.
      p.line([0.4, 1.7, 0], [0.4, 1.7, 9], '#5e4129', 1);
      p.line([1.0, 1.7, 0], [1.0, 1.7, 9], '#5e4129', 1);
      p.line([0.4, 1.7, 9], [1.0, 1.7, 9], '#5e4129', 1);
      for (let x = 0.47; x < 1.0; x += 0.1) p.wallL(1.701, x, x + 0.06, 3, 9, '#f4ecd8');
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
      for (const [x, y] of [
        [1.5, 1.2],
        [1.65, 1.5],
      ]) {
        p.ellipse(x, y, 9, 5, 2, '#9a5a34');
        p.ellipse(x - 0.03, y - 0.03, 6, 3, 4, '#b0643a');
      }
      for (const [x, y] of [
        [0.3, 0.3],
        [1.2, 0.3],
        [0.3, 0.75],
        [1.2, 0.75],
      ]) p.line([x, y, 0], [x, y, 11], '#5e4129', 1.6);
      p.roofX(0.3, 0.3, 1.2, 0.75, 11, 7, 'thatch', WOOD, 0.08);
      for (let i = 0; i < 3; i++) p.box(0.4 + i * 0.25, 0.45, 0.55 + i * 0.25, 0.6, 0, 3, '#b0643a');
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
      c.strokeStyle = 'rgba(70,36,24,0.5)';
      c.lineWidth = 0.6;
      for (let r = 6; r < 34; r += 4) {
        c.beginPath();
        c.ellipse(kx, ky - 4, Math.sqrt(Math.max(0, 26 * 26 * (1 - (r * r) / (30 * 30)))), 2, 0, 0, Math.PI);
        c.stroke();
      }
      c.fillStyle = '#b06848';
      c.beginPath();
      c.ellipse(kx - 8, ky - 22, 9, 8, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a1a10';
      c.beginPath();
      c.ellipse(kx + 6, ky + 4, 7, 6, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = '#f08a2a';
      c.fillRect(kx + 1, ky + 1, 10, 3);
      smoke.push([0.9, 0.9, 38]);
      // Stacks of finished tiles and firewood.
      for (let i = 0; i < 4; i++) p.box(1.35, 1.25, 1.75, 1.5, i * 2, 1.8, i % 2 ? '#b8483a' : '#a4402f');
      for (let i = 0; i < 3; i++) p.box(1.35, 0.85, 1.75, 1.1, i * 2, 1.8, i % 2 ? '#b8483a' : '#a4402f');
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
      p.roofX(0.3, 0.3, 1.5, 0.95, 14, 9, 'shingle', WOOD, 0.08);
      // A block on the banker, finished blocks and rubble.
      p.box(0.7, 0.55, 1.0, 0.8, 0, 6, '#7b5a36');
      p.box(0.72, 0.57, 0.98, 0.78, 6, 6, '#cac4b6');
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) p.box(0.35 + i * 0.22, 1.2 + j * 0.2, 0.53 + i * 0.22, 1.36 + j * 0.2, 0, 6, '#cac4b6');
      }
      p.box(0.4, 1.25, 0.58, 1.41, 6, 6, '#d4cec0');
      p.stonePile(1.25, 1.35, 5);
      p.line([1.05, 1.6, 0], [1.2, 1.7, 8], '#6b4a2e', 1.3);
      break;
    }
    case 'carpenter': {
      p.shadow(0.3, 0.3, 1.65, 1.4);
      p.box(0.3, 0.35, 1.45, 1.35, 0, 16, WOOD);
      p.timber(0.3, 0.35, 1.45, 1.35, 0, 16, BEAM);
      p.wallL(1.352, 0.5, 1.1, 0, 12, '#3a2a1e');
      p.box(0.6, 1.2, 1.0, 1.33, 0, 5, '#8a6236');
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
      for (let i = 0; i < 3; i++) p.box(0.4, 1.55, 1.3, 1.68, i * 2.2, 2, i % 2 ? '#c8a46c' : '#b8945c');
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
      p.roofX(0.3, 0.3, 1.4, 1.2, 18, 8, 'plank', WOOD, 0.08);
      // Bellows.
      p.box(1.1, 0.65, 1.3, 0.85, 2, 4, '#6b4a2e');
      p.stonePile(1.55, 1.3, 4);
      p.ellipse(1.6, 1.35, 4, 2, 6, '#b4652e');
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
      p.barrel(0.6, 0.6);
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
      p.shadow(0.2, 0.2, 1.4, 1.0);
      // Lean-to shed on posts.
      for (const [x, y] of [
        [0.3, 0.3],
        [1.3, 0.3],
        [0.3, 1.0],
        [1.3, 1.0],
      ]) {
        p.line([x, y, 0], [x, y, 14], '#5e4129', 2);
      }
      p.stonePile(0.5, 0.45, 4);
      p.roofX(0.3, 0.3, 1.3, 1.0, 14, 8, 'plank', WOOD, 0.08);
      p.stonePile(1.4, 1.3, 6);
      p.stonePile(0.4, 1.4, 3);
      // A big rough block being worked.
      p.box(1.0, 1.25, 1.3, 1.5, 0, 9, '#b4b0a6');
      p.line([0.9, 1.6, 0], [1.1, 1.75, 9], '#6b4a2e', 1.4);
      break;
    }
    case 'mine': {
      // Earth mound with a timbered entrance.
      p.poly(
        [
          [0.1, 0.1, 0],
          [1.7, 0.1, 0],
          [1.5, 0.6, 26],
          [0.3, 0.6, 26],
        ],
        '#7b6a54',
      );
      p.poly(
        [
          [0.1, 1.2, 0],
          [0.1, 0.1, 0],
          [0.3, 0.6, 26],
          [0.3, 1.0, 24],
        ],
        '#6e5f4a',
      );
      p.poly(
        [
          [0.3, 0.6, 26],
          [1.5, 0.6, 26],
          [1.6, 1.1, 16],
          [0.3, 1.0, 24],
        ],
        season === 3 ? '#e8edef' : '#7d8a52',
      );
      p.poly(
        [
          [0.1, 1.2, 0],
          [1.7, 1.25, 0],
          [1.6, 1.1, 16],
          [0.3, 1.0, 24],
        ],
        '#8a765c',
      );
      // Entrance.
      p.wallL(1.21, 0.65, 1.15, 0, 13, '#1f1a16');
      p.line([0.62, 1.22, 0], [0.62, 1.22, 14], BEAM, 2.4);
      p.line([1.18, 1.22, 0], [1.18, 1.22, 14], BEAM, 2.4);
      p.line([0.55, 1.22, 14], [1.25, 1.22, 14], BEAM, 2.6);
      // Rails and a cart with ore.
      p.line([0.8, 1.25, 0], [0.8, 1.95, 0], '#5a5048', 1);
      p.line([1.0, 1.25, 0], [1.0, 1.95, 0], '#5a5048', 1);
      p.box(0.75, 1.55, 1.05, 1.85, 2, 6, '#6b4a2e');
      p.stonePile(1.35, 1.45, 3);
      p.ctx.fillStyle = '#b4652e';
      const [ox, oy] = iso(0.9, 1.7, 9);
      p.ctx.fillRect(ox - 4, oy - 2, 3, 2);
      p.ctx.fillRect(ox + 1, oy - 1, 3, 2);
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
      smoke.push(p.chimney(1.55, 0.75, 9, 14, '#9b8a78'));
      p.sack(0.5, 1.6);
      p.sack(0.7, 1.7);
      p.crate(1.0, 1.55);
      break;
    }
    case 'sawmill': {
      p.shadow(0.2, 0.3, 1.6, 1.3);
      for (const [x, y] of [
        [0.3, 0.4],
        [1.5, 0.4],
        [0.3, 1.2],
        [1.5, 1.2],
      ]) {
        p.line([x, y, 0], [x, y, 16], '#5e4129', 2.2);
      }
      // Sawhorse and log inside.
      p.box(0.6, 0.7, 1.3, 0.85, 0, 7, '#7b5a36');
      p.line([0.55, 0.78, 10], [1.35, 0.78, 10], '#8a6236', 5);
      p.roofX(0.3, 0.4, 1.5, 1.2, 16, 12, 'shingle', WOOD, 0.1);
      // Plank stack.
      for (let i = 0; i < 4; i++) p.box(0.4, 1.45, 1.2, 1.7, i * 2.4, 2.2, i % 2 ? '#d7b47c' : '#c8a46c');
      p.logPile(1.55, 1.5, 2);
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
      p.barrel(2.45, 0.7);
      p.barrel(2.65, 0.95);
      p.crate(2.35, 1.3);
      p.sack(0.5, 1.45);
      p.sack(0.75, 1.55);
      p.crate(1.6, 1.45);
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
      p.poly(
        [
          [0.15, 1.45, 0],
          [2.85, 1.45, 0],
          [2.85, 2.9, 0],
          [0.15, 2.9, 0],
        ],
        season === 3 ? '#d4d8d6' : '#b09c70',
      );
      p.fence([0.15, 2.92], [1.1, 2.92], '#8a6a44');
      p.fence([1.9, 2.92], [2.85, 2.92], '#8a6a44');
      p.shadow(0.4, 0.3, 2.6, 1.35);
      // Raised on staddle stones to keep the rats out.
      for (const x of [0.5, 1.5, 2.5]) {
        for (const y of [0.4, 1.25]) {
          p.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, 5, '#9a9288');
          p.ellipse(x, y, 6, 4, 1.5, '#a8a093');
        }
      }
      p.box(0.4, 0.3, 2.6, 1.35, 6, 18, '#b88a52');
      for (let x = 0.5; x < 2.6; x += 0.12) p.line([x, 1.35, 6], [x, 1.35, 24], '#8a6236', 0.5);
      for (let y = 0.4; y < 1.35; y += 0.12) p.line([2.6, y, 6], [2.6, y, 24], '#7a5230', 0.5);
      p.wallL(1.352, 1.3, 1.7, 6, 19, '#5b3a22');
      p.box(1.35, 1.35, 1.65, 1.6, 0, 6, '#7b5a36');
      p.roofX(0.4, 0.3, 2.6, 1.35, 24, 20, 'thatch', '#b88a52', 0.16);
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
      p.shadow(0.4, 0.2, 2.6, 3.7);
      // Bell tower at the back.
      p.box(0.95, 0.25, 2.05, 1.3, 0, 70, '#b0a898');
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
      for (const y of [1.6, 2.2, 2.8, 3.4]) {
        p.box(2.4, y - 0.05, 2.5, y + 0.05, 0, 20, '#a49c8e');
        p.wallR(2.402, y + 0.12, y + 0.26, 10, 26, '#3a3a52');
        p.wallR(2.403, y + 0.14, y + 0.24, 11, 25, season === 3 ? '#e8b850' : '#5a6a9a');
      }
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
      const stone = '#bdb4a3';
      const dark = '#a69d8c';
      // Plain glazing, or once commissioned, stained glass in jewel colours.
      const jewels = ['#c83a3a', '#3a6ac8', '#e8b840', '#3a9a5a', '#9a4ac8'];
      let pane = 0;
      const plain = season === 3 ? '#e8b850' : '#5a6a9a';
      const glassAt = () => (variant === 1 ? jewels[pane++ % jewels.length] : plain);
      p.shadow(0.3, 0.2, 4.7, 5.8);
      // Apse at the back.
      p.box(1.7, 0.35, 3.3, 1.2, 0, 34, dark);
      p.roofY(1.7, 0.35, 3.3, 1.2, 34, 20, 'slate', dark, 0.08);
      // The long nave.
      p.box(1.4, 1.1, 3.6, 4.7, 0, 46, stone);
      for (const y of [1.5, 2.1, 3.5, 4.1]) {
        p.box(3.6, y - 0.06, 3.75, y + 0.06, 0, 30, dark);
        p.wallR(3.602, y + 0.14, y + 0.34, 16, 38, '#3a3a52');
        p.wallR(3.603, y + 0.17, y + 0.31, 18, 36, glassAt());
      }
      p.roofY(1.4, 1.1, 3.6, 4.7, 46, 34, 'slate', stone, 0.1);
      // Transept across the crossing.
      p.box(0.4, 2.45, 4.6, 3.3, 0, 46, stone);
      p.wallR(4.602, 2.65, 3.1, 14, 40, '#3a3a52');
      p.wallR(4.603, 2.7, 3.05, 16, 38, glassAt());
      p.roofX(0.4, 2.45, 4.6, 3.3, 46, 30, 'slate', stone, 0.1);
      // Spire over the crossing.
      p.box(2.2, 2.6, 2.8, 3.15, 46, 40, stone);
      p.roofPyramid(2.2, 2.6, 2.8, 3.15, 86, 70, 'slate', 0.04);
      p.line([2.5, 2.875, 156], [2.5, 2.875, 168], '#d8b84a', 1.6);
      p.line([2.44, 2.935, 163], [2.56, 2.815, 163], '#d8b84a', 1.6);
      // West front: twin towers and a great door with a rose window.
      for (const x0 of [1.15, 3.05]) {
        p.box(x0, 4.6, x0 + 0.8, 5.55, 0, 96, dark);
        p.wallL(5.552, x0 + 0.25, x0 + 0.55, 70, 86, '#2a2522');
        p.wallR(x0 + 0.802, 4.85, 5.3, 70, 86, '#221e1b');
        p.roofPyramid(x0, 4.6, x0 + 0.8, 5.55, 96, 44, 'slate');
      }
      p.box(1.95, 4.7, 3.05, 5.45, 0, 60, stone);
      p.wallL(5.452, 2.25, 2.75, 0, 26, '#4a2f1b');
      p.line([2.5, 5.454, 0], [2.5, 5.454, 26], '#2e1d10', 0.8);
      const [rx, ry] = iso(2.5, 5.452, 44);
      p.ctx.fillStyle = '#3a3a52';
      p.ctx.beginPath();
      p.ctx.arc(rx, ry, 8, 0, Math.PI * 2);
      p.ctx.fill();
      p.ctx.fillStyle = variant === 1 ? '#c83a3a' : season === 3 ? '#e8b850' : '#7a5a9a';
      p.ctx.beginPath();
      p.ctx.arc(rx, ry, 5.5, 0, Math.PI * 2);
      p.ctx.fill();
      break;
    }
    case 'belltower': {
      const stone = '#c2b9a8';
      const dark = '#a69d8c';
      p.shadow(0.35, 0.35, 1.65, 1.65);
      // A broad base, the shaft, and the open belfry under a slate spire.
      p.box(0.4, 0.4, 1.6, 1.6, 0, 14, dark);
      p.box(0.55, 0.55, 1.45, 1.45, 14, 70, stone);
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
      p.box(0.3, 0.3, 3.7, 3.7, 0, 20, stone);
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
      p.fence([0.08, 0.95], [0.4, 0.95], '#e8e0d0');
      p.fence([0.6, 0.95], [0.92, 0.95], '#e8e0d0');
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
      p.box(0.55, 0.55, 1.45, 1.45, 0, 6, '#a8a093');
      p.box(0.7, 0.7, 1.3, 1.3, 6, 16, '#b8b0a2');
      p.box(0.62, 0.62, 1.38, 1.38, 22, 3, '#a8a093');
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

/** Vegetable plots, hen coops and beehives behind a house. */
function drawYard(p: Pen, yard: string, level: number, season: Season): void {
  const big = level >= 2;
  const x0 = big ? 1.84 : 1.7;
  if (yard === 'veg' && level >= 2) {
    // A strip of beds along the side of larger homes.
    p.poly(
      [
        [x0, 0.3, 0],
        [1.98, 0.3, 0],
        [1.98, 1.4, 0],
        [x0, 1.4, 0],
      ],
      season === 3 ? '#cfd4d4' : '#7a5a38',
    );
    if (season !== 3) for (let j = 0; j < 4; j++) p.bush((x0 + 1.98) / 2, 0.42 + j * 0.27, 2.2, season === 2 ? '#b08a3a' : '#5d9a3a');
  } else if (yard === 'hens') {
    // A little coop on legs with a ramp, and hens scratching about.
    p.box(x0, 0.45, x0 + 0.24, 0.8, 4, 7, '#9a7247', undefined, 'plank');
    p.line([x0 + 0.02, 0.8, 0], [x0 + 0.02, 0.8, 4], BEAM, 1.2);
    p.line([x0 + 0.22, 0.8, 0], [x0 + 0.22, 0.8, 4], BEAM, 1.2);
    p.roofX(x0, 0.45, x0 + 0.24, 0.8, 11, 5, 'shingle', '#9a7247', 0.03);
    p.line([x0 + 0.24, 0.6, 4], [x0 + 0.38, 0.6, 0], '#7b5a36', 1.4);
    for (const [hx, hy] of [
      [x0 + 0.05, 1.0],
      [x0 + 0.2, 1.15],
      [x0 - 0.05, 1.25],
    ]) {
      const [sx, sy] = iso(hx, hy, 0);
      const c = p.ctx;
      c.fillStyle = hx > x0 ? '#f2ece0' : '#a8622a';
      c.beginPath();
      c.ellipse(sx, sy - 2.5, 2.6, 2, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(sx + 2, sy - 4.2, 1.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#c8322a';
      c.fillRect(sx + 1.8, sy - 5.8, 1, 1);
    }
  } else if (yard === 'bees') {
    p.box(x0, 0.5, x0 + 0.25, 0.65, 0, 4, '#7b5a36');
    for (const y of [0.52, 0.62]) {
      const [x, yy] = iso(x0 + 0.12, y, 4);
      p.ctx.fillStyle = season === 3 ? '#e8ecee' : '#c9a050';
      p.ctx.beginPath();
      p.ctx.ellipse(x, yy - 4, 4, 5, 0, Math.PI, 0);
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
    if (season === 1 || season === 0) p.bush(x0 + 0.1, 1.0, 3, '#b97ae0');
  }
}

/** The sign and a telltale prop of a craft worked from home. */
function drawHomeCraft(p: Pen, trade: BuildingType, level: number, season: Season): void {
  const front = level >= 3 ? 1.72 : 1.65;
  // Hanging sign on a bracket at the front corner.
  const sx = level >= 3 ? 1.88 : 1.8;
  p.line([sx, front, 22], [sx + 0.18, front + 0.12, 22], '#3b2a1a', 1.3);
  p.wallR(sx + 0.13, front + 0.04, front + 0.24, 13, 21, '#e8d8b0');
  p.wallR(sx + 0.131, front + 0.06, front + 0.22, 14, 20, TRADE_COLORS[trade] ?? '#8a3b2e');
  const yx = level >= 3 ? 1.95 : 1.9;
  switch (trade) {
    case 'bakery': {
      const [ox, oy] = iso(yx, 1.2, 0);
      p.ctx.fillStyle = '#b39a80';
      p.ctx.beginPath();
      p.ctx.ellipse(ox, oy - 1, 8, 6, 0, Math.PI, 0);
      p.ctx.lineTo(ox + 8, oy + 1);
      p.ctx.lineTo(ox - 8, oy + 1);
      p.ctx.fill();
      p.ctx.fillStyle = '#f08a2a';
      p.ctx.fillRect(ox - 1.5, oy - 2.5, 3, 2);
      break;
    }
    case 'brewhouse':
      p.barrel(yx, 1.0);
      p.barrel(yx + 0.05, 1.25);
      p.barrel(yx - 0.12, 1.15);
      break;
    case 'dairy':
      p.box(yx - 0.1, 1.0, yx + 0.08, 1.3, 0, 5, '#7b5a36');
      for (const y of [1.06, 1.18]) p.ellipse(yx - 0.01, y, 7, 2.6, 1.6, '#f0c850');
      break;
    case 'weaver':
      // A loom frame with a half-woven cloth.
      p.line([yx, 0.95, 0], [yx, 0.95, 13], '#6b4a2e', 1.4);
      p.line([yx, 1.35, 0], [yx, 1.35, 13], '#6b4a2e', 1.4);
      p.line([yx, 0.95, 13], [yx, 1.35, 13], '#6b4a2e', 1.4);
      p.wallR(yx, 1.0, 1.3, 4, 11, season === 3 ? '#9aaac8' : '#5a7ab0');
      break;
    case 'tailor':
      p.box(yx - 0.12, 1.0, yx + 0.08, 1.35, 0, 6, '#7b5a36');
      p.wallR(yx + 0.081, 1.05, 1.15, 6, 10, '#8a3b2e');
      p.wallR(yx + 0.081, 1.2, 1.3, 6, 9, '#6a3e22');
      break;
    case 'tanner':
      p.line([yx, 0.95, 0], [yx, 0.95, 12], '#5e4129', 1.3);
      p.line([yx, 1.4, 0], [yx, 1.4, 12], '#5e4129', 1.3);
      p.line([yx, 0.95, 12], [yx, 1.4, 12], '#5e4129', 1.3);
      p.wallR(yx, 1.0, 1.17, 3, 11, '#9a6a40');
      p.wallR(yx, 1.22, 1.37, 4, 11, '#b88a5a');
      break;
    case 'apothecary':
      for (const y of [1.0, 1.12, 1.24]) {
        p.line([yx, y, 13], [yx, y, 8], '#6b4a2e', 0.6);
        p.ellipse(yx, y, 7.5, 1.6, 2.4, season === 3 ? '#8a9a7a' : '#6aa04a');
      }
      p.line([yx, 0.95, 13], [yx, 1.3, 13], '#5e4129', 1.2);
      break;
  }
}

const TRADE_COLORS: Partial<Record<BuildingType, string>> = {
  bakery: '#c8904a',
  brewhouse: '#a87a3a',
  dairy: '#e8c850',
  weaver: '#4a6a9a',
  tailor: '#8a3b2e',
  tanner: '#6a3e22',
  apothecary: '#3a7a5a',
};

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
    const x = 0.12;
    const y = 0.2;
    for (const [px, py] of [
      [x, y],
      [x + 0.76, y],
      [x, y + 0.6],
      [x + 0.76, y + 0.6],
    ]) {
      p.line([px, py, 0], [px, py, open ? 15 : 9], '#5e4129', 1.4);
    }
    p.box(x + 0.05, y + 0.35, x + 0.72, y + 0.6, 0, 7, '#8a6440');
    if (!open) return;
    st.goods.forEach((g, i) => {
      const [gx, gy] = iso(x + 0.15 + i * 0.2, y + 0.47, 8);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 3.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      const x0 = x - 0.05 + (i * 0.88) / stripes;
      const x1 = x0 + 0.88 / stripes;
      p.poly(
        [
          [x0, y - 0.05, 18],
          [x1, y - 0.05, 18],
          [x1, y + 0.7, 13],
          [x0, y + 0.7, 13],
        ],
        p.snow ? (i % 2 ? '#f2f5f6' : '#e2e7e9') : i % 2 ? '#f1e8d6' : st.color,
      );
    }
  });
}

export function fruitTreeSprite(fruit: string, season: Season, stage: number, fruiting: boolean, blossom = false): Sprite {
  if (fruit === 'grapes') return vineSprite(season, stage, fruiting);
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

function drawHouseProp(p: Pen, prop: 'logs' | 'hive' | 'cart' | 'well', season: Season): void {
  switch (prop) {
    case 'logs':
      p.logPile(1.75, 0.75, 2);
      break;
    case 'hive': {
      // Straw beehives on a little bench.
      p.box(1.7, 0.6, 1.95, 0.75, 0, 4, '#7b5a36');
      for (const y of [0.62, 0.72]) {
        const [x, yy] = iso(1.82, y, 4);
        p.ctx.fillStyle = season === 3 ? '#e8ecee' : '#c9a050';
        p.ctx.beginPath();
        p.ctx.ellipse(x, yy - 4, 4, 5, 0, Math.PI, 0);
        p.ctx.lineTo(x + 4, yy);
        p.ctx.lineTo(x - 4, yy);
        p.ctx.fill();
        p.ctx.strokeStyle = '#8a6a30';
        p.ctx.lineWidth = 0.5;
        p.ctx.beginPath();
        p.ctx.moveTo(x - 3.6, yy - 3);
        p.ctx.lineTo(x + 3.6, yy - 3);
        p.ctx.stroke();
      }
      break;
    }
    case 'cart': {
      // A handcart with sacks.
      p.box(1.68, 0.5, 1.95, 0.85, 4, 4, '#8a6236');
      const [wx, wy] = iso(1.82, 0.88, 4);
      p.ctx.strokeStyle = '#4a3020';
      p.ctx.lineWidth = 1.2;
      p.ctx.beginPath();
      p.ctx.ellipse(wx, wy, 3, 4, 0, 0, Math.PI * 2);
      p.ctx.stroke();
      p.line([1.68, 0.67, 6], [1.55, 0.67, 2], '#6b4a2e', 1.2);
      p.sack(1.8, 0.62, '#d8c79c');
      break;
    }
    case 'well':
      p.barrel(1.8, 0.7);
      p.barrel(1.85, 0.9);
      break;
  }
}

/** The manor grows with the settlement: hall, manor house, stone manor, keep. */
function drawManor(p: Pen, level: number, season: Season, smoke: V3[]): void {
  p.shadow(0.3, 0.2, 2.7, 2.6);
  p.poly(
    [
      [0.2, 0.15, 0],
      [2.85, 0.15, 0],
      [2.85, 2.85, 0],
      [0.2, 2.85, 0],
    ],
    level >= 3 ? '#b4ad9e' : '#b9ad94',
  );
  const towerH = level >= 5 ? 96 : level >= 4 ? 78 : level >= 3 ? 64 : 54;
  const towerStone = level >= 4 ? '#9d978c' : STONE;
  // Tower at the back.
  p.box(0.3, 0.15, 1.2, 1.0, 0, towerH, towerStone);
  p.windowL(1.0, 0.68, towerH - 18, 0.12, 8, season === 3);
  p.windowR(1.2, 0.5, towerH - 18, 0.12, 8);
  if (level >= 4) {
    // Crenellations instead of a roof.
    for (let i = 0; i < 4; i++) {
      p.box(0.3 + i * 0.25, 0.92, 0.42 + i * 0.25, 1.0, towerH, 7, towerStone);
      p.box(1.12, 0.15 + i * 0.25, 1.2, 0.27 + i * 0.25, towerH, 7, towerStone);
    }
    p.flag(0.75, 0.575, towerH, 26, '#a8322d');
  } else {
    p.roofPyramid(0.3, 0.15, 1.2, 1.0, towerH, 26, 'slate');
    p.flag(0.75, 0.575, towerH + 26, 20, '#a8322d');
  }
  if (level >= 2) {
    // East wing.
    p.box(1.95, 0.3, 2.75, 0.95, 0, level >= 3 ? 10 : 5, STONE);
    p.box(1.95, 0.3, 2.75, 0.95, level >= 3 ? 10 : 5, 18, PLASTER);
    p.timber(1.95, 0.3, 2.75, 0.95, level >= 3 ? 10 : 5, 18, BEAM);
    p.windowR(2.75, 0.5, 12, 0.14, 7, season === 3);
    p.roofY(1.95, 0.3, 2.75, 0.95, level >= 3 ? 28 : 23, 18, level >= 3 ? 'slate' : 'shingle', PLASTER, 0.08);
  }
  // Main hall.
  const base = level >= 3 ? 14 : 6;
  const wallH = level >= 3 ? 20 : 24;
  p.box(0.5, 0.75, 2.6, 2.25, 0, base, STONE);
  p.box(0.5, 0.75, 2.6, 2.25, base, wallH, level >= 4 ? '#c8c0b0' : PLASTER);
  if (level < 4) p.timber(0.5, 0.75, 2.6, 2.25, base, wallH, BEAM);
  for (const x of [0.7, 1.05, 1.95, 2.3]) p.windowL(2.25, x, base + 6, 0.14, 8, season === 3);
  if (level >= 3) for (const x of [0.7, 1.05, 1.95, 2.3]) p.windowL(2.25, x, 3, 0.12, 6);
  p.windowR(2.6, 1.0, base + 6, 0.14, 8);
  p.windowR(2.6, 1.7, base + 6, 0.14, 8);
  p.wallL(2.252, 1.38, 1.72, 0, 16, '#5b3a22');
  p.line([1.55, 2.253, 0], [1.55, 2.253, 16], '#3d2614', 0.8);
  const roofZ = base + wallH;
  p.roofX(0.5, 0.75, 2.6, 2.25, roofZ, 28, 'slate', PLASTER, 0.12);
  smoke.push(p.chimney(2.15, 1.65, roofZ + 4, 18, '#8d8274'));
  if (level >= 3) smoke.push(p.chimney(0.8, 1.65, roofZ + 4, 18, '#8d8274'));
  p.box(1.32, 2.25, 1.78, 2.5, 0, 3, '#9b9284');
  if (level >= 2) {
    // Banners either side of the door.
    p.wallL(2.255, 1.18, 1.3, 8, 22, '#a8322d');
    p.wallL(2.255, 1.8, 1.92, 8, 22, '#a8322d');
  }
  if (level >= 5) {
    // Castle: a crenellated curtain wall with corner towers rings the keep.
    const w = '#a49c8e';
    const merlons = (x0: number, y0: number, x1: number, y1: number, z: number) => {
      const n = Math.max(2, Math.round(Math.max(x1 - x0, y1 - y0) / 0.16));
      for (let i = 0; i < n; i += 2) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        p.box(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1 + (x1 === x0 ? 0.06 : 0), y0 + (y1 - y0) * t1 + (y1 === y0 ? 0.06 : 0), z, 4, w);
      }
    };
    p.box(0.08, 2.78, 2.6, 2.9, 0, 18, w);
    merlons(0.08, 2.78, 2.6, 2.78, 18);
    p.box(2.78, 0.1, 2.9, 2.6, 0, 18, w);
    merlons(2.78, 0.1, 2.78, 2.6, 18);
    // Gatehouse in the front wall.
    p.box(1.25, 2.7, 1.85, 2.95, 0, 30, w);
    p.wallL(2.952, 1.42, 1.68, 0, 14, '#2a2522');
    merlons(1.25, 2.7, 1.85, 2.7, 30);
    for (const [x, y] of [
      [0.0, 2.65],
      [2.65, 2.65],
      [2.65, 0.0],
    ]) {
      p.box(x, y, x + 0.35, y + 0.35, 0, 40, w);
      merlons(x, y + 0.3, x + 0.35, y + 0.3, 40);
      merlons(x + 0.3, y, x + 0.3, y + 0.35, 40);
      p.windowL(y + 0.35, x + 0.12, 26, 0.08, 6);
    }
    p.flag(2.82, 2.82, 44, 22, '#2e5e9a');
    p.flag(1.55, 2.82, 34, 18, '#a8322d');
  } else if (level >= 4) {
    // A curtain wall stub with a gate tower at the front corner.
    p.box(2.55, 2.45, 2.9, 2.85, 0, 34, '#9d978c');
    for (let i = 0; i < 2; i++) p.box(2.55 + i * 0.2, 2.77, 2.67 + i * 0.2, 2.85, 34, 6, '#9d978c');
  }
}

/** Ground tile for building yards drawn under some buildings. */
export function plotColor(season: Season): string {
  return season === 3 ? '#d9dcd8' : mix('#a88a5c', GRASS[season][1], 0.55);
}
