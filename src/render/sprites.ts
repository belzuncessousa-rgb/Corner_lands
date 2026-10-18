import { mulberry32 } from '../game/rng';
import { HERALDRY } from './heraldry';
import { HOME_TRADES } from '../game/sim';
import type { BuildingType, Season } from '../game/types';
import { type Material, Pen, ROOF_COLORS, TH, TW, iso, mix, shade, type V3 } from './pen';

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
      p.windowR(1.55, 0.7, 10, 0.14, 9);
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
      p.roofX(0.3, 0.3, 1.2, 0.75, 11, 7, 'thatch', WOOD, 0.08);
      // Clay cakes drying on a plank rack under the thatch.
      p.box(0.38, 0.42, 1.12, 0.63, 4, 1.2, '#8a6440');
      p.line([0.4, 0.6, 0], [0.4, 0.6, 4], '#5e4129', 1);
      p.line([1.1, 0.6, 0], [1.1, 0.6, 4], '#5e4129', 1);
      for (let i = 0; i < 5; i++) p.box(0.42 + i * 0.14, 0.46, 0.53 + i * 0.14, 0.58, 5.2, 1.6, i % 2 ? '#b8785a' : '#a86a4c');
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
      tileStack(p, 1.35, 1.25, 4);
      tileStack(p, 1.4, 0.8, 3);
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
      // An adit driven into a rocky knoll: a timbered mouth, rails out to
      // a spoil heap of rusty ore, and a windlass shed.
      const ROCK = '#8a8378';
      const turf = season === 3 ? '#e8edef' : '#7d8a52';
      // A rounded knoll over the back of the plot.
      {
        const c = p.ctx;
        const [lx, ly] = iso(0.0, 1.45, 0);
        const [rx, ry] = iso(1.95, 0.0, 0);
        const [fx, fy] = iso(1.35, 1.35, 0);
        const [px, py] = iso(0.55, 0.55, 28);
        const g = c.createLinearGradient(lx, 0, rx, 0);
        g.addColorStop(0, shade(ROCK, 1.05));
        g.addColorStop(1, shade(ROCK, 0.7));
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(lx, ly);
        c.bezierCurveTo(lx + 2, ly - 28, px - 30, py, px, py);
        c.bezierCurveTo(px + 34, py + 2, rx - 6, ry - 20, rx, ry);
        c.quadraticCurveTo(fx + 8, fy + 2, fx, fy);
        c.quadraticCurveTo(fx - 30, fy + 2, lx, ly);
        c.fill();
        // Strata in the rock face.
        c.save();
        c.clip();
        c.strokeStyle = 'rgba(60,50,40,0.22)';
        c.lineWidth = 0.8;
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.moveTo(lx - 4, ly - 6 - k * 7);
          c.quadraticCurveTo(px, py + 30 - k * 6, rx + 4, ry - 4 - k * 6);
          c.stroke();
        }
        c.restore();
        // Turf over the crown.
        c.fillStyle = turf;
        c.beginPath();
        c.moveTo(lx + 8, ly - 22);
        c.bezierCurveTo(lx + 12, ly - 38, px - 26, py - 1, px, py);
        c.bezierCurveTo(px + 30, py + 2, rx - 14, ry - 26, rx - 6, ry - 14);
        c.quadraticCurveTo(px + 10, py + 26, lx + 8, ly - 22);
        c.fill();
      }
      for (const [x, y, z, r] of [[0.3, 0.95, 10, 6], [1.45, 0.45, 12, 5], [1.65, 0.85, 4, 6]] as const) rockLump(p, x, y, r, ROCK, 4, z);
      for (const [x, y, r] of [[0.3, 1.45, 5], [1.7, 1.35, 5]] as const) rockLump(p, x, y, r, ROCK, 6);
      // Timbered mouth.
      p.wallL(1.31, 0.75, 1.2, 0, 13, '#1a1512');
      p.wallL(1.305, 0.68, 1.27, 13, 15.5, '#3a2c20');
      p.line([0.72, 1.32, 0], [0.72, 1.32, 15], BEAM, 2.6);
      p.line([1.23, 1.32, 0], [1.23, 1.32, 15], BEAM, 2.6);
      p.line([0.64, 1.32, 15.5], [1.31, 1.32, 15.5], BEAM, 2.8);
      // A lantern by the mouth.
      p.circle(1.29, 1.33, 11, 1.4, '#f2c25a');
      // Rails and a cart of ore.
      for (let k = 0; k < 5; k++) p.line([0.8, 1.38 + k * 0.13, 0], [1.15, 1.38 + k * 0.13, 0], '#6b4a2e', 1.2);
      p.line([0.86, 1.3, 0.5], [0.86, 1.95, 0.5], '#5a5450', 0.9);
      p.line([1.09, 1.3, 0.5], [1.09, 1.95, 0.5], '#5a5450', 0.9);
      p.box(0.8, 1.55, 1.15, 1.85, 2.5, 6, '#6b4a2e');
      for (const t of [1.6, 1.8]) p.circle(0.83, t, 2.5, 1.6, '#3a2c20');
      oreHeap(p, 0.97, 1.7, 3);
      // Spoil heap of ore to the side.
      oreHeap(p, 1.55, 1.65, 6);
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
        for (const y of [1.7, 2.3, 2.9]) {
          p.wallR(2.222, y, y + 0.14, 9, 17, '#2e2a38');
          p.wallR(2.223, y + 0.02, y + 0.12, 10, 16, season === 3 ? '#e8b850' : '#6a7a9a');
        }
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
      const winter = season === 3;
      const lawn = winter ? '#e2e7e6' : season === 2 ? '#8a9a48' : '#6fa043';
      const gravel = winter ? '#d4d8d6' : '#d2c39c';
      const hedge = winter ? '#8a9a86' : '#3d6b30';
      const flowers = winter ? [] : season === 2 ? ['#d8903a', '#b8503a', '#e0c040', '#9a3a2a'] : ['#e84a6a', '#f2d34a', '#b97ae0', '#f4f0e0', '#e86a3a', '#f07ab0'];
      p.poly([[0.05, 0.05, 0], [4.95, 0.05, 0], [4.95, 3.95, 0], [0.05, 3.95, 0]], lawn);
      // Gravel walks: round the edge and across the middle, meeting at the fountain.
      const walk = (x0: number, y0: number, x1: number, y1: number) => p.poly([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], gravel);
      walk(0.15, 1.85, 4.85, 2.15);
      walk(2.35, 0.15, 2.65, 3.85);
      walk(0.15, 3.6, 4.85, 3.85);
      walk(4.6, 0.15, 4.85, 3.85);
      // Four parterres: box-edged beds of flowers.
      const rand = mulberry32(31);
      for (const [x0, y0, x1, y1] of [
        [0.35, 0.35, 2.15, 1.65],
        [2.85, 0.35, 4.4, 1.65],
        [0.35, 2.35, 2.15, 3.4],
        [2.85, 2.35, 4.4, 3.4],
      ]) {
        p.box(x0, y0, x1, y0 + 0.08, 0, 3, hedge);
        p.box(x0, y0, x0 + 0.08, y1, 0, 3, hedge);
        if (flowers.length) {
          for (let k = 0; k < 26; k++) {
            const x = x0 + 0.18 + rand() * (x1 - x0 - 0.3);
            const y = y0 + 0.18 + rand() * (y1 - y0 - 0.3);
            p.bush(x, y, 1.9, '#4a7a34');
            p.circle(x, y, 2.6, 1.3, flowers[k % flowers.length]);
          }
        }
        // A clipped yew cone at the outer corner.
        const cx = x0 < 2 ? x0 + 0.2 : x1 - 0.2;
        const cy = y0 < 2 ? y0 + 0.2 : y1 - 0.2;
        const [tx, ty] = iso(cx, cy, 0);
        p.ctx.fillStyle = winter ? '#9aa894' : '#2f5a28';
        p.ctx.beginPath();
        p.ctx.moveTo(tx - 4.5, ty - 1);
        p.ctx.quadraticCurveTo(tx, ty + 2, tx + 4.5, ty - 1);
        p.ctx.lineTo(tx, ty - 20);
        p.ctx.closePath();
        p.ctx.fill();
        p.ctx.fillStyle = 'rgba(255,255,255,0.12)';
        p.ctx.beginPath();
        p.ctx.moveTo(tx - 4.5, ty - 1);
        p.ctx.lineTo(tx, ty - 20);
        p.ctx.lineTo(tx - 1, ty);
        p.ctx.closePath();
        p.ctx.fill();
        p.box(x1 - 0.08, y0, x1, y1, 0, 3, hedge);
        p.box(x0, y1 - 0.08, x1, y1, 0, 3, hedge);
      }
      // The fountain: a round stone basin with a jet.
      const [fx, fy] = iso(2.5, 2.0, 0);
      const c = p.ctx;
      c.fillStyle = '#a49c8e';
      c.beginPath();
      c.ellipse(fx, fy - 2, 22, 11, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#8a8274';
      c.fillRect(fx - 22, fy - 2, 44, 3);
      c.beginPath();
      c.ellipse(fx, fy + 1, 22, 11, 0, 0, Math.PI);
      c.fill();
      c.fillStyle = winter ? '#dfe8ec' : '#5f9ab8';
      c.beginPath();
      c.ellipse(fx, fy - 2.5, 18, 8.6, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#b6ae9f';
      c.fillRect(fx - 2, fy - 16, 4, 14);
      c.beginPath();
      c.ellipse(fx, fy - 16, 7, 3, 0, 0, Math.PI * 2);
      c.fill();
      if (!winter) {
        c.strokeStyle = 'rgba(220,240,250,0.8)';
        c.lineWidth = 1;
        for (const d of [-1, 1]) {
          c.beginPath();
          c.moveTo(fx, fy - 22);
          c.quadraticCurveTo(fx + d * 6, fy - 26, fx + d * 9, fy - 15);
          c.stroke();
        }
        c.beginPath();
        c.moveTo(fx, fy - 16);
        c.lineTo(fx, fy - 23);
        c.stroke();
      }
      // A pavilion at the far corner, and a rose pergola along the back walk.
      const px0 = 0.25;
      const py0 = 0.2;
      for (let k = 0; k < 6; k++) {
        const x = 2.85 + k * 0.3;
        p.line([x, 0.12, 0], [x, 0.12, 16], '#e8e0d0', 1.4);
      }
      p.line([2.85, 0.12, 16], [4.35, 0.12, 16], '#e8e0d0', 1.4);
      if (!winter) for (let k = 0; k < 10; k++) p.circle(2.85 + k * 0.16, 0.12, 14 + (k % 3), 2.2, k % 2 ? '#c8486a' : '#4a7a34');
      p.box(px0, py0, px0 + 0.75, py0 + 0.75, 0, 2, '#c8c2b6');
      for (const [x, y] of [[px0 + 0.08, py0 + 0.08], [px0 + 0.67, py0 + 0.08], [px0 + 0.67, py0 + 0.67], [px0 + 0.08, py0 + 0.67]]) p.box(x - 0.03, y - 0.03, x + 0.03, y + 0.03, 2, 20, '#e8e0d0');
      p.roofPyramid(px0 - 0.02, py0 - 0.02, px0 + 0.77, py0 + 0.77, 22, 14, 'slate', 0.06);
      p.circle(px0 + 0.375, py0 + 0.375, 37, 1.4, '#c8962a');
      // Two ornamental trees at the front corners.
      // Ornamental trees: blossom in spring, gold in autumn.
      const crown = winter ? '#9aa894' : season === 0 ? '#f0c4d4' : season === 2 ? '#d0803a' : '#4f8a3a';
      for (const [x, y] of [[4.75, 3.75], [0.3, 3.75], [4.75, 0.3], [0.2, 1.75], [4.75, 1.75]]) {
        p.line([x, y, 0], [x, y, 14], '#5a3e26', 2.2);
        if (winter) continue;
        p.circle(x + 0.04, y + 0.04, 17, 8, shade(crown, 0.8));
        p.circle(x - 0.03, y, 19, 7, crown);
        p.circle(x + 0.06, y - 0.05, 22, 5, shade(crown, 1.1));
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
export const HOUSE_FORMS = [0, 5, 5, 3];

/** Splits a house variant: colours, yard extension, home craft and shape. */
function homeParts(variant: number) {
  return {
    hv: HOUSE_VARIANTS[variant % HOUSE_VARIANTS.length],
    yard: YARD_CODES[Math.floor(variant / HOUSE_VARIANTS.length) % YARD_CODES.length] ?? null,
    trade: HOME_TRADES[(Math.floor(variant / 16) % 8) - 1] ?? null,
    form: Math.floor(variant / 128),
  };
}

/** Where a lit window sits on a home's front, for the evening glow. */
export function homeWindow(level: number, variant: number): [number, number, number] {
  const { form } = homeParts(variant);
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
  const doorX = level >= 3 ? 0.95 : 0.85;
  p.poly([[doorX - 0.1, 1.0, 0], [doorX + 0.12, 1.0, 0], [doorX + 0.16, 1.95, 0], [doorX - 0.14, 1.95, 0]], winter ? '#dfe3e2' : '#b8a27a');
  p.roofTint = hv.tint;
  if (level >= 3) drawTownhouse(p, form, hv, season, smoke);
  else if (level === 2) drawTimberHouse(p, form, hv, season, smoke);
  else drawCottage(p, form, hv, season, smoke);
  p.roofTint = null;
  if (trade) drawTradeAnnex(p, trade, level, season, smoke);
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
  const roof = hv.roof2;
  switch (form % 5) {
    case 1: {
      // Gable to the street, the upper floor jettied out over the door.
      p.shadow(0.3, 0.2, 1.3, 1.2);
      p.box(0.32, 0.22, 1.28, 1.12, 0, 11, STONE);
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
      p.box(0.22, 0.3, 1.1, 1.1, 0, 11, STONE);
      p.box(0.2, 0.28, 1.1, 1.14, 11, 14, W);
      p.timber(0.2, 0.28, 1.1, 1.14, 11, 14, BEAM);
      p.doorL(1.1, 0.62, 0.18, 10);
      p.windowL(1.1, 0.32, 4, 0.12, 5);
      p.windowL(1.14, 0.35, 16, 0.13, 6, winter);
      p.windowL(1.14, 0.8, 16, 0.13, 6);
      drawHouseExtra(p, hv.extra, season, 1.1, [0.32], 4, [0.62, 0.18]);
      p.roofX(0.2, 0.28, 1.1, 1.14, 25, 16, roof, W, 0.1);
      p.box(1.1, 0.2, 1.55, 1.2, 0, 11, STONE);
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
      p.box(0.27, 0.27, 1.38, 1.1, 0, 12, '#a49c8e', undefined, 'rubble');
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
      p.box(0.25, 0.3, 1.38, 1.1, 0, 11, STONE);
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
function drawTradeAnnex(p: Pen, trade: BuildingType, level: number, season: Season, smoke: V3[]): void {
  const winter = season === 3;
  const x0 = 1.42;
  const x1 = 1.88;
  const y0 = 0.25;
  const y1 = 1.15;
  // The hanging sign by the door.
  const front = level >= 3 ? 1.3 : level === 2 ? 1.15 : 1.08;
  p.line([0.22, front, 20], [0.22, front + 0.16, 20], '#3b2a1a', 1.2);
  p.wallL(front + 0.1, 0.12, 0.32, 12, 19, '#e8d8b0');
  p.wallL(front + 0.101, 0.14, 0.3, 13, 18, TRADE_COLORS[trade] ?? '#8a3b2e');
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
  // Stone Manor: three storeys of dressed stone, a matching wing and a
  // corner tower, on grounds of 4x4.
  const ST = '#b6ae9f';
  p.shadow(0.35, 0.3, 3.65, 3.2);
  // Gravel path to the door, and clipped box hedges either side.
  p.poly([[1.75, 2.95, 0], [2.25, 2.95, 0], [2.3, 3.95, 0], [1.7, 3.95, 0]], winter ? '#d4d8d6' : '#c8b896');
  for (const y of [3.25, 3.7]) {
    p.bush(1.45, y, 4.5, '#557a38');
    p.bush(2.55, y, 4.5, '#557a38');
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

/** Ground tile for building yards drawn under some buildings. */
export function plotColor(season: Season): string {
  return season === 3 ? '#d9dcd8' : mix('#a88a5c', GRASS[season][1], 0.55);
}
