import { mulberry32 } from '../game/rng';
import type { BuildingType, Season } from '../game/types';
import { Pen, TH, TW, iso, mix, shade, type V3 } from './pen';

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

export function grassTile(season: Season, fert: number, variant: number): Sprite {
  const rand = mulberry32(variant * 97 + fert * 13 + season * 1009);
  return makeSprite(TW + 4, TH + 4, TW / 2 + 2, 2, (ctx) => {
    const base = GRASS[season][fert];
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
    if (season === 0 && rand() < 0.5) {
      const flowers = ['#f4f0d8', '#f2d34a', '#e48ab0', '#b9a3e6'];
      const col = flowers[Math.floor(rand() * flowers.length)];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = col;
        ctx.fillRect((rand() - 0.5) * TW * 0.7, rand() * TH * 0.7 + 4, 1.6, 1.6);
      }
    }
    if (season === 2 && rand() < 0.4) {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#c8752e', '#d9a43c', '#a8482a'][i % 3];
        ctx.fillRect((rand() - 0.5) * TW * 0.7, rand() * TH * 0.7 + 4, 2, 1.4);
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
export function waterTile(season: Season, mask: number): Sprite {
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
  });
}

/** Dirt road; mask bits mark road neighbours like waterTile. */
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
    const draw = (color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
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
      draw(edge, 19);
      return;
    }
    draw(dirt, 15);
    // Wheel ruts.
    ctx.save();
    ctx.globalAlpha = 0.5;
    draw(shade(dirt, 0.85), 7);
    ctx.globalAlpha = 1;
    draw(dirt, 4);
    ctx.restore();
    // Pebbles.
    const rand = mulberry32(mask * 31 + season);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = shade(dirt, rand() < 0.5 ? 0.8 : 1.15);
      ctx.fillRect(cx + (rand() - 0.5) * 14, cy + (rand() - 0.5) * 8, 1.4, 1.1);
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

const PLASTER = '#eadcbf';
const STONE = '#a8a093';
const WOOD = '#9a7247';
const BEAM = '#4a3020';

export function buildingSprite(type: BuildingType, w: number, h: number, level: number, season: Season): Sprite {
  const top = 150;
  const sw = (w + h) * (TW / 2) + 30;
  const sh = (w + h) * (TH / 2) + top + 14;
  return makeSprite(sw, sh, h * (TW / 2) + 15, top, (ctx) => {
    const p = new Pen(ctx);
    p.snow = season === 3;
    return drawBuilding(p, type, level, season);
  });
}

function drawBuilding(p: Pen, type: BuildingType, level: number, season: Season): V3[] {
  const smoke: V3[] = [];
  switch (type) {
    case 'townhall': {
      p.shadow(0.3, 0.2, 2.7, 2.6);
      // Courtyard paving.
      p.poly(
        [
          [0.2, 0.15, 0],
          [2.85, 0.15, 0],
          [2.85, 2.85, 0],
          [0.2, 2.85, 0],
        ],
        '#b9ad94',
      );
      // Stone tower at the back.
      p.box(0.35, 0.2, 1.15, 0.95, 0, 54, STONE);
      for (let i = 0; i < 4; i++) p.line([0.35, 0.95, 4 + i * 13], [1.15, 0.95, 4 + i * 13], shade(STONE, 0.8), 0.6);
      p.windowL(0.95, 0.68, 36, 0.12, 8);
      p.windowR(1.15, 0.5, 36, 0.12, 8);
      p.roofPyramid(0.35, 0.2, 1.15, 0.95, 54, 26, 'slate');
      p.flag(0.75, 0.575, 80, 20, '#a8322d');
      // Main hall.
      p.box(0.5, 0.75, 2.6, 2.25, 0, 6, STONE);
      p.box(0.5, 0.75, 2.6, 2.25, 6, 24, PLASTER);
      p.timber(0.5, 0.75, 2.6, 2.25, 6, 24, BEAM);
      for (const x of [0.7, 1.05, 1.95, 2.3]) p.windowL(2.25, x, 16, 0.14, 8, season === 3);
      p.windowR(2.6, 1.0, 16, 0.14, 8);
      p.windowR(2.6, 1.7, 16, 0.14, 8);
      p.wallL(2.252, 1.38, 1.72, 0, 16, '#5b3a22');
      p.line([1.55, 2.253, 0], [1.55, 2.253, 16], '#3d2614', 0.8);
      p.roofX(0.5, 0.75, 2.6, 2.25, 30, 28, 'slate', PLASTER, 0.12);
      smoke.push(p.chimney(2.15, 1.65, 34, 18, '#8d8274'));
      // Steps and barrels.
      p.box(1.32, 2.25, 1.78, 2.5, 0, 3, '#9b9284');
      p.barrel(2.55, 2.55);
      p.barrel(2.75, 2.45);
      p.crate(0.45, 2.45);
      break;
    }
    case 'house': {
      if (level >= 2) {
        p.shadow(0.2, 0.25, 1.8, 1.65);
        p.box(0.25, 0.3, 1.75, 1.6, 0, 12, STONE);
        p.box(0.2, 0.25, 1.8, 1.65, 12, 16, PLASTER);
        p.timber(0.2, 0.25, 1.8, 1.65, 12, 16, BEAM);
        p.doorL(1.6, 0.9, 0.2, 11);
        p.windowL(1.6, 0.42, 4, 0.14, 5);
        p.windowL(1.6, 1.4, 4, 0.14, 5);
        p.windowL(1.65, 0.45, 17, 0.14, 6, season === 3);
        p.windowL(1.65, 1.35, 17, 0.14, 6);
        p.windowR(1.8, 0.6, 17, 0.14, 6);
        p.windowR(1.75, 0.8, 4, 0.14, 5);
        p.roofX(0.2, 0.25, 1.8, 1.65, 28, 18, 'shingle', PLASTER, 0.12);
        smoke.push(p.chimney(1.35, 1.12, 34, 16, '#8f8476'));
        p.bush(1.85, 1.85, 4, season === 3 ? '#8d9a86' : '#4d8a3a');
        p.barrel(0.3, 1.85);
      } else {
        p.shadow(0.35, 0.45, 1.65, 1.45);
        // Vegetable patch.
        if (season !== 3) {
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
        p.box(0.35, 0.45, 1.65, 1.45, 0, 17, PLASTER);
        p.timber(0.35, 0.45, 1.65, 1.45, 0, 17, BEAM);
        p.windowL(1.45, 0.52, 7, 0.14, 5, season === 3);
        p.windowL(1.45, 1.32, 7, 0.14, 5);
        p.doorL(1.45, 0.9, 0.18, 11);
        p.windowR(1.65, 0.8, 7, 0.14, 5);
        p.roofX(0.35, 0.45, 1.65, 1.45, 17, 15, 'thatch', PLASTER, 0.13);
        smoke.push(p.chimney(1.3, 1.08, 24, 14, '#8a7d70'));
        p.logPile(1.75, 0.75, 2);
      }
      break;
    }
    case 'woodcutter': {
      p.shadow(0.3, 0.3, 1.3, 1.2);
      p.box(0.3, 0.3, 1.3, 1.2, 0, 15, WOOD);
      for (let z = 3; z < 15; z += 3) {
        p.line([0.3, 1.2, z], [1.3, 1.2, z], shade(WOOD, 0.7), 0.6);
        p.line([1.3, 0.3, z], [1.3, 1.2, z], shade(WOOD, 0.55), 0.6);
      }
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
      p.box(0.3, 0.3, 1.2, 1.1, 0, 12, WOOD);
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
      for (let z = 3; z < 13; z += 3) p.line([0.3, 1.1, z], [1.2, 1.1, z], shade(WOOD, 0.7), 0.5);
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
    case 'storehouse': {
      p.shadow(0.3, 0.4, 2.7, 2.4);
      p.box(0.3, 0.4, 2.7, 2.3, 0, 22, WOOD);
      for (let x = 0.4; x < 2.7; x += 0.15) p.line([x, 2.3, 0], [x, 2.3, 22], shade(WOOD, 0.75), 0.5);
      for (let y = 0.5; y < 2.3; y += 0.15) p.line([2.7, y, 0], [2.7, y, 22], shade(WOOD, 0.58), 0.5);
      p.timber(0.3, 0.4, 2.7, 2.3, 0, 22, '#5a3a22');
      // Big barn doors.
      p.wallL(2.302, 1.15, 1.85, 0, 17, '#5b3a22');
      p.line([1.15, 2.304, 0], [1.85, 2.304, 17], '#3d2614', 1);
      p.line([1.85, 2.304, 0], [1.15, 2.304, 17], '#3d2614', 1);
      p.line([1.5, 2.304, 0], [1.5, 2.304, 17], '#3d2614', 1);
      p.roofX(0.3, 0.4, 2.7, 2.3, 22, 26, 'shingle', WOOD, 0.14);
      p.barrel(0.5, 2.6);
      p.barrel(0.7, 2.7);
      p.crate(2.2, 2.5);
      p.crate(2.45, 2.55, 0.14);
      p.sack(2.85, 1.2);
      p.sack(2.85, 1.45, '#cdbb8e');
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
      for (let z = 8; z < 70; z += 9) {
        p.line([0.95, 1.3, z], [2.05, 1.3, z], '#958d80', 0.5);
        p.line([2.05, 0.25, z], [2.05, 1.3, z], '#857d70', 0.5);
      }
      // Belfry openings.
      p.wallL(1.302, 1.3, 1.7, 52, 64, '#2a2522');
      p.wallR(2.052, 0.6, 0.95, 52, 64, '#221e1b');
      p.roofPyramid(0.95, 0.25, 2.05, 1.3, 70, 46, 'slate');
      // Cross.
      p.line([1.5, 0.775, 116], [1.5, 0.775, 130], '#d8b84a', 1.6);
      p.line([1.5 - 0.06, 0.775 + 0.06, 125], [1.5 + 0.06, 0.775 - 0.06, 125], '#d8b84a', 1.6);
      // Nave.
      p.box(0.6, 1.2, 2.4, 3.65, 0, 32, '#b6ae9f');
      for (let z = 6; z < 32; z += 6.5) {
        p.line([0.6, 3.65, z], [2.4, 3.65, z], '#9a9284', 0.5);
        p.line([2.4, 1.2, z], [2.4, 3.65, z], '#8a8274', 0.5);
      }
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
  }
  return smoke;
}

/** Ground tile for building yards drawn under some buildings. */
export function plotColor(season: Season): string {
  return season === 3 ? '#d9dcd8' : mix('#a88a5c', GRASS[season][1], 0.55);
}
