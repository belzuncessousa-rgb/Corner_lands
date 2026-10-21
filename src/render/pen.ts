/** Isometric projection: tile units on x/y, pixels on z. */
export const TW = 64;
export const TH = 32;

export type V3 = [number, number, number];

/**
 * How tall things stand against the ground: every height (z) is stretched by
 * this, so buildings and their chimneys, sails and glows grow together while
 * footprints, lanes and villagers keep their size.
 */
export const ZS = 1.3;

export function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * (TW / 2), (x + y) * (TH / 2) - z * ZS];
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Multiplies a colour's brightness (f < 1 darker, f > 1 lighter). */
export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (u: number, v: number) => Math.round(u + (v - u) * t);
  return `#${((1 << 24) | (m(r1, r2) << 16) | (m(g1, g2) << 8) | m(b1, b2)).toString(16).slice(1)}`;
}

import { mulberry32 } from '../game/rng';
import { HERALDRY, flagOutline, paintArms } from './heraldry';

export type RoofKind = 'thatch' | 'shingle' | 'slate' | 'tile' | 'plank';

/** Wall surfaces: cut stone, rough rubble, weatherboards, logs, wattle and daub. */
export type Material = 'stone' | 'rubble' | 'plank' | 'log' | 'plaster';

const hash = (...n: number[]) => n.reduce((h, v) => Math.imul(h ^ Math.round(v * 1000), 2654435761) >>> 0, 2166136261);

export const ROOF_COLORS: Record<RoofKind, string> = {
  thatch: '#c49a52',
  shingle: '#7a4b2e',
  slate: '#5d6670',
  tile: '#a4523a',
  plank: '#8a6a44',
};

/** Draws 3D primitives in isometric projection onto a 2D context. */
export class Pen {
  snow = false;
  /** Optional tint mixed into roof colours for variety. */
  roofTint: { color: string; t: number } | null = null;

  roofColor(kind: RoofKind): string {
    const base = ROOF_COLORS[kind];
    return this.roofTint ? mix(base, this.roofTint.color, this.roofTint.t) : base;
  }

  /** Picks a wall material from a box colour (set by the sprite builder). */
  matFor: ((color: string) => Material | undefined) | null = null;

  constructor(public ctx: CanvasRenderingContext2D) {}

  path(pts: V3[]): void {
    const c = this.ctx;
    c.beginPath();
    pts.forEach((p, i) => {
      const [sx, sy] = iso(p[0], p[1], p[2]);
      if (i === 0) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    });
    c.closePath();
  }

  poly(pts: V3[], fill: string | null, stroke?: string, lw = 0.6): void {
    this.path(pts);
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = lw;
      this.ctx.stroke();
    }
  }

  line(a: V3, b: V3, color: string, w = 1): void {
    const c = this.ctx;
    const [x1, y1] = iso(a[0], a[1], a[2]);
    const [x2, y2] = iso(b[0], b[1], b[2]);
    c.strokeStyle = color;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  ellipse(x: number, y: number, z: number, rx: number, ry: number, fill: string): void {
    const [sx, sy] = iso(x, y, z);
    this.ctx.fillStyle = fill;
    this.ctx.beginPath();
    this.ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  circle(x: number, y: number, z: number, r: number, fill: string): void {
    this.ellipse(x, y, z, r, r, fill);
  }

  /** Soft ground shadow under a footprint. */
  shadow(x0: number, y0: number, x1: number, y1: number, grow = 0.12): void {
    this.poly(
      [
        [x0 - grow * 0.3, y0 - grow * 0.3, 0],
        [x1 + grow * 1.6, y0 - grow * 0.3, 0],
        [x1 + grow * 1.6, y1 + grow * 1.6, 0],
        [x0 - grow * 0.3, y1 + grow * 1.6, 0],
      ],
      'rgba(30,30,10,0.22)',
    );
  }

  /** Box with visible faces: front-left (y=y1), front-right (x=x1) and top. */
  box(x0: number, y0: number, x1: number, y1: number, z0: number, h: number, color: string, top?: string, mat?: Material): void {
    this.plainBox(x0, y0, x1, y1, z0, h, color, top);
    const m = mat ?? this.matFor?.(color);
    if (m && h >= 5) this.textureBox(x0, y0, x1, y1, z0, h, color, m);
    if (z0 === 0 && h >= 8 && x1 - x0 > 0.3 && y1 - y0 > 0.3) this.contactShadow(x0, y0, x1, y1);
  }

  /** Where a wall meets the ground: a soft darkening at its foot and a thin shade on the ground. */
  private contactShadow(x0: number, y0: number, x1: number, y1: number): void {
    this.poly([[x0, y1, 0], [x1, y1, 0], [x1 + 0.07, y1 + 0.07, 0], [x0 + 0.03, y1 + 0.07, 0]], 'rgba(30,24,12,0.16)');
    this.poly([[x1, y0, 0], [x1, y1, 0], [x1 + 0.07, y1 + 0.07, 0], [x1 + 0.07, y0 + 0.03, 0]], 'rgba(30,24,12,0.16)');
    for (const [za, zb, a] of [
      [0, 1.4, 0.16],
      [1.4, 3, 0.08],
    ] as const) {
      this.wallL(y1 + 0.003, x0, x1, za, zb, `rgba(30,22,10,${a})`);
      this.wallR(x1 + 0.003, y0, y1, za, zb, `rgba(30,22,10,${a + 0.04})`);
    }
  }

  private plainBox(x0: number, y0: number, x1: number, y1: number, z0: number, h: number, color: string, top?: string): void {
    const z1 = z0 + h;
    this.poly(
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      shade(color, 1),
      shade(color, 0.6),
      0.5,
    );
    this.poly(
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
      shade(color, 0.76),
      shade(color, 0.5),
      0.5,
    );
    this.poly(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      top ?? shade(color, 1.12),
      shade(color, 0.6),
      0.5,
    );
  }

  /** Draws a wall material over the two visible faces of a box. */
  textureBox(x0: number, y0: number, x1: number, y1: number, z0: number, h: number, color: string, m: Material): void {
    const rand = mulberry32(hash(x0, y0, x1, y1, z0, h));
    this.textureFace('L', y1, x0, x1, z0, z0 + h, color, m, rand, 1);
    this.textureFace('R', x1, y0, y1, z0, z0 + h, color, m, rand, 0.76);
    if (m === 'log') {
      // Log ends interlock at the front corner.
      for (let z = z0 + 1.8; z < z0 + h - 0.5; z += 3.6) {
        this.circle(x1 + 0.02, y1 + 0.02, z, 1.9, shade('#c8a06a', 0.95 + rand() * 0.1));
        this.circle(x1 + 0.02, y1 + 0.02, z, 0.8, '#9a7346');
      }
    }
  }

  /** Quad on a visible face: 'L' is the plane y = c, 'R' the plane x = c. */
  private faceQuad(face: 'L' | 'R', c: number, a: number, b: number, za: number, zb: number, fill: string): void {
    if (face === 'L') this.wallL(c, a, b, za, zb, fill);
    else this.wallR(c, a, b, za, zb, fill);
  }

  private faceLine(face: 'L' | 'R', c: number, a: number, za: number, b: number, zb: number, color: string, w: number): void {
    if (face === 'L') this.line([a, c, za], [b, c, zb], color, w);
    else this.line([c, a, za], [c, b, zb], color, w);
  }

  private textureFace(
    face: 'L' | 'R',
    c: number,
    a0: number,
    a1: number,
    z0: number,
    z1: number,
    color: string,
    m: Material,
    rand: () => number,
    lit: number,
  ): void {
    const cc = c + (face === 'L' ? 0.001 : 0.001);
    const span = a1 - a0;
    if (span < 0.05) return;
    const tone = (lo: number, hi: number) => shade(color, lit * (lo + rand() * (hi - lo)));
    if (m === 'stone' || m === 'rubble') {
      // Mortar beds with squared blocks laid in courses.
      this.faceQuad(face, cc, a0, a1, z0, z1, shade(mix(color, '#e2dccd', 0.45), lit * 0.92));
      let z = z0;
      let row = 0;
      while (z < z1 - 0.5) {
        const ch = m === 'rubble' ? 2.2 + rand() * 1.6 : 3.1 + rand() * 0.5;
        const zt = Math.min(z1, z + ch);
        let a = a0 - (row % 2 ? 0.06 + rand() * 0.04 : rand() * 0.04);
        while (a < a1) {
          const len = m === 'rubble' ? 0.07 + rand() * 0.12 : 0.13 + rand() * 0.11;
          const b = Math.min(a1, a + len);
          const lo = Math.max(a0, a + 0.012);
          const hi = b - 0.012;
          if (hi > lo) {
            const zl = z + 0.35 + (m === 'rubble' ? rand() * 0.4 : 0);
            const zh = zt - 0.35 - (m === 'rubble' ? rand() * 0.4 : 0);
            this.faceQuad(face, cc + 0.0005, lo, hi, zl, zh, tone(0.82, 1.04));
            // Lit upper edge of each block.
            this.faceLine(face, cc + 0.001, lo, zh - 0.25, hi, zh - 0.25, shade(color, lit * 1.12), 0.45);
          }
          a = b;
        }
        z = zt;
        row++;
      }
      return;
    }
    if (m === 'plank' || m === 'log') {
      const rowH = m === 'log' ? 3.6 : 2.6;
      let row = 0;
      for (let z = z0; z < z1 - 0.3; z += rowH, row++) {
        const zt = Math.min(z1, z + rowH);
        this.faceQuad(face, cc, a0, a1, z, zt, tone(0.84, 1.06));
        if (m === 'log') {
          this.faceLine(face, cc + 0.001, a0, zt - 0.8, a1, zt - 0.8, shade(color, lit * 1.18), 0.7);
          this.faceLine(face, cc + 0.001, a0, z + 0.3, a1, z + 0.3, shade(color, lit * 0.55), 0.9);
        } else {
          // Lapped weatherboards: a shadow under each board, the odd joint and knot.
          this.faceLine(face, cc + 0.001, a0, z + 0.25, a1, z + 0.25, shade(color, lit * 0.58), 0.7);
          if (rand() < 0.6) {
            const j = a0 + rand() * span;
            this.faceLine(face, cc + 0.001, j, z + 0.3, j, zt, shade(color, lit * 0.62), 0.5);
          }
          if (rand() < 0.25) {
            const k = a0 + rand() * span;
            const p: V3 = face === 'L' ? [k, cc + 0.002, z + rowH / 2] : [cc + 0.002, k, z + rowH / 2];
            this.ellipse(p[0], p[1], p[2], 0.8, 0.5, shade(color, lit * 0.6));
          }
        }
      }
      return;
    }
    // Wattle and daub: limewash mottled with weather, dirt splashed at the
    // foot of the wall, and here and there the woven hazel showing through.
    const ctx = this.ctx;
    const n = Math.round(span * (z1 - z0) * 1.6);
    for (let i = 0; i < n; i++) {
      const a = a0 + rand() * span;
      const z = z0 + rand() * (z1 - z0);
      const p: V3 = face === 'L' ? [a, cc + 0.001, z] : [cc + 0.001, a, z];
      const [sx, sy] = iso(p[0], p[1], p[2]);
      ctx.fillStyle = rand() < 0.5 ? 'rgba(120,96,60,0.07)' : 'rgba(255,250,235,0.12)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 1.5 + rand() * 2.5, 1 + rand() * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const band = Math.min(3, (z1 - z0) * 0.25);
    this.faceQuad(face, cc + 0.0008, a0, a1, z0, z0 + band, 'rgba(110,84,52,0.22)');
    this.faceQuad(face, cc + 0.0008, a0, a1, z0, z0 + band * 0.45, 'rgba(90,66,40,0.2)');
    if (span > 0.5 && z1 - z0 > 10 && rand() < 0.55) {
      const a = a0 + 0.08 + rand() * (span - 0.3);
      const z = z0 + 4 + rand() * (z1 - z0 - 9);
      const w = 0.09 + rand() * 0.05;
      this.faceQuad(face, cc + 0.0012, a, a + w, z, z + 3.2, shade('#8a6a44', lit));
      for (let k = 0; k < 3; k++) {
        this.faceLine(face, cc + 0.0015, a, z + 0.6 + k, a + w, z + 0.6 + k + (k % 2 ? -0.4 : 0.4), shade('#5e4129', lit), 0.45);
      }
    }
  }

  /** Gable roof with the ridge running along the x axis. */
  roofX(x0: number, y0: number, x1: number, y1: number, h: number, rh: number, kind: RoofKind, wall: string, o = 0.1): void {
    const ym = (y0 + y1) / 2;
    const col = this.roofColor(kind);
    const back: V3[] = [
      [x0 - o, y0 - o, h - 2],
      [x1 + o, y0 - o, h - 2],
      [x1 + o, ym, h + rh],
      [x0 - o, ym, h + rh],
    ];
    const front: V3[] = [
      [x0 - o, y1 + o, h - 2],
      [x1 + o, y1 + o, h - 2],
      [x1 + o, ym, h + rh],
      [x0 - o, ym, h + rh],
    ];
    this.poly(back, shade(col, 0.82), shade(col, 0.5));
    this.roofTexture(back, kind, 0.82);
    // Gable end facing +x.
    this.poly(
      [
        [x1, y0, h],
        [x1, y1, h],
        [x1, ym, h + rh],
      ],
      shade(wall, 0.72),
      shade(wall, 0.45),
    );
    this.poly(front, shade(col, 1), shade(col, 0.5));
    this.roofTexture(front, kind, 1);
    if (this.snow) this.snowOn(front);
    else this.poly(front, null, shade(col, 0.45), 0.8);
    // Ridge line.
    this.line([x0 - o, ym, h + rh], [x1 + o, ym, h + rh], shade(col, 0.55), 1.2);
  }

  /** Gable roof with the ridge running along the y axis. */
  roofY(x0: number, y0: number, x1: number, y1: number, h: number, rh: number, kind: RoofKind, wall: string, o = 0.1): void {
    const xm = (x0 + x1) / 2;
    const col = this.roofColor(kind);
    const back: V3[] = [
      [x0 - o, y0 - o, h - 2],
      [x0 - o, y1 + o, h - 2],
      [xm, y1 + o, h + rh],
      [xm, y0 - o, h + rh],
    ];
    const front: V3[] = [
      [x1 + o, y0 - o, h - 2],
      [x1 + o, y1 + o, h - 2],
      [xm, y1 + o, h + rh],
      [xm, y0 - o, h + rh],
    ];
    this.poly(back, shade(col, 0.95), shade(col, 0.5));
    this.roofTexture(back, kind, 0.95);
    if (this.snow) this.snowOn(back);
    this.poly(
      [
        [x0, y1, h],
        [x1, y1, h],
        [xm, y1, h + rh],
      ],
      shade(wall, 1),
      shade(wall, 0.55),
    );
    this.poly(front, shade(col, 0.78), shade(col, 0.45));
    this.roofTexture(front, kind, 0.78);
    if (this.snow) this.snowOn(front);
    this.line([xm, y0 - o, h + rh], [xm, y1 + o, h + rh], shade(col, 0.5), 1.2);
  }

  /** Four-sided pyramid roof (towers, wells). */
  roofPyramid(x0: number, y0: number, x1: number, y1: number, h: number, rh: number, kind: RoofKind, o = 0.08): void {
    const col = this.roofColor(kind);
    const apex: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, h + rh];
    const a: V3 = [x0 - o, y0 - o, h];
    const b: V3 = [x1 + o, y0 - o, h];
    const c: V3 = [x1 + o, y1 + o, h];
    const d: V3 = [x0 - o, y1 + o, h];
    this.poly([a, b, apex], shade(col, 0.9), shade(col, 0.5));
    this.poly([d, a, apex], shade(col, 0.95), shade(col, 0.5));
    this.poly([d, c, apex], this.snow ? '#eef2f4' : shade(col, 1.05), shade(col, 0.5));
    this.poly([b, c, apex], this.snow ? '#cdd6dc' : shade(col, 0.75), shade(col, 0.45));
    // The two faces we see get their slates, tiles or shingles like any other roof.
    if (!this.snow && kind !== 'thatch') {
      this.roofTexture([d, c, apex, apex], kind, 1.05);
      this.roofTexture([b, c, apex, apex], kind, 0.75);
      this.line(c, apex, shade(col, 0.45), 0.8);
    }
  }

  /**
   * Roof covering drawn over a sloped plane [eave start, eave end, ridge end,
   * ridge start]: straw for thatch, rows of shingles, slates or clay tiles.
   */
  private roofTexture(plane: V3[], kind: RoofKind, lit: number): void {
    const col = this.roofColor(kind);
    const [e0, e1, , r0] = plane;
    const P = (u: number, t: number): V3 => [
      e0[0] + (e1[0] - e0[0]) * u + (r0[0] - e0[0]) * t,
      e0[1] + (e1[1] - e0[1]) * u + (r0[1] - e0[1]) * t,
      e0[2] + (e1[2] - e0[2]) * u + (r0[2] - e0[2]) * t,
    ];
    const len = (a: V3, b: V3) => {
      const [ax, ay] = iso(a[0], a[1], a[2]);
      const [bx, by] = iso(b[0], b[1], b[2]);
      return Math.hypot(bx - ax, by - ay);
    };
    const lu = len(e0, e1);
    const lt = len(e0, r0);
    const rand = mulberry32(hash(e0[0], e0[1], e0[2], e1[0], r0[2], kind.length));
    const ctx = this.ctx;
    const quad = (u0: number, u1: number, t0: number, t1: number, fill: string) => this.poly([P(u0, t0), P(u1, t0), P(u1, t1), P(u0, t1)], fill);
    ctx.save();
    this.path(plane);
    ctx.clip();
    if (kind === 'thatch') {
      // Bundled straw: thousands of short strands running down the slope.
      const tones = [0.72, 0.84, 0.95, 1.06, 1.16].map((f) => shade(col, f * lit));
      const n = Math.round((lu * lt) / 3.2);
      ctx.lineWidth = 0.75;
      for (let i = 0; i < n; i++) {
        const u = rand();
        const t = rand();
        const dt = (3 + rand() * 4) / lt;
        const [ax, ay] = iso(...P(u, t));
        const [bx, by] = iso(...P(u + (rand() - 0.5) * 0.012, t + dt));
        ctx.strokeStyle = tones[Math.floor(rand() * tones.length)];
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      // Courses where each layer of bundles was pegged down.
      for (let t = 0.22; t < 0.9; t += 0.22) this.line(P(0, t), P(1, t), shade(col, 0.74 * lit), 0.9);
      // A thick ridge roll held by crossed hazel spars.
      quad(0, 1, 0.86, 1, shade(col, 0.78 * lit));
      const spars = Math.max(3, Math.round(lu / 7));
      for (let k = 0; k < spars; k++) {
        const u = (k + 0.5) / spars;
        this.line(P(u - 0.03, 0.87), P(u + 0.03, 0.99), shade('#6b4a2a', lit), 0.6);
        this.line(P(u + 0.03, 0.87), P(u - 0.03, 0.99), shade('#6b4a2a', lit), 0.6);
      }
      this.line(P(0, 0.87), P(1, 0.87), shade(col, 0.6 * lit), 0.8);
    } else if (kind === 'plank') {
      const n = Math.max(4, Math.round(lu / 4));
      for (let k = 0; k < n; k++) {
        quad(k / n, (k + 1) / n, 0, 1, shade(col, lit * (0.84 + rand() * 0.2)));
        this.line(P(k / n, 0), P(k / n, 1), shade(col, 0.55 * lit), 0.6);
      }
    } else {
      // Shingles, slates or clay tiles in staggered rows.
      const rowPx = kind === 'slate' ? 2.8 : kind === 'tile' ? 3.2 : 3.4;
      const cellPx = kind === 'slate' ? 4.2 : kind === 'tile' ? 3.6 : 4.6;
      const rows = Math.max(4, Math.round(lt / rowPx));
      const cols = Math.max(4, Math.round(lu / cellPx));
      const [lo, hi] = kind === 'slate' ? [0.86, 1.06] : kind === 'tile' ? [0.84, 1.1] : [0.8, 1.08];
      for (let r = 0; r < rows; r++) {
        const t0 = r / rows;
        const t1 = (r + 1) / rows;
        const off = (r % 2) * 0.5;
        for (let k = -1; k < cols; k++) {
          const u0 = (k + off) / cols;
          const u1 = (k + 1 + off) / cols;
          const f = lo + rand() * (hi - lo);
          if (kind === 'tile') {
            // Barrel tiles: a lit crown and a shaded trough.
            const um = (u0 + u1) / 2;
            quad(u0, um, t0, t1, shade(col, lit * f * 1.08));
            quad(um, u1, t0, t1, shade(col, lit * f * 0.86));
          } else {
            quad(u0 + 0.004, u1 - 0.004, t0, t1, shade(col, lit * f));
          }
          this.line(P(u0, t0), P(u0, t1), shade(col, 0.6 * lit), 0.45);
        }
        // Shadow cast by the course above.
        this.line(P(0, t1 - 0.012), P(1, t1 - 0.012), shade(col, 0.58 * lit), kind === 'slate' ? 0.6 : 0.8);
        if (kind === 'shingle' && rand() < 0.5) {
          // Moss on old shingles.
          const u = rand();
          const [mx, my] = iso(...P(u, t0 + 0.5 / rows));
          ctx.fillStyle = 'rgba(96,120,60,0.35)';
          ctx.beginPath();
          ctx.ellipse(mx, my, 2.5 + rand() * 2, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (kind === 'tile' || kind === 'slate') quad(0, 1, 0.94, 1, shade(col, 0.7 * lit));
    }
    ctx.restore();
    if (kind === 'thatch' && !this.snow) {
      // Ragged straw ends hanging over the eave.
      const n = Math.round(lu / 1.6);
      ctx.lineWidth = 0.8;
      for (let i = 0; i <= n; i++) {
        const [ax, ay] = iso(...P(i / n, 0.02));
        ctx.strokeStyle = shade(col, lit * (0.7 + rand() * 0.35));
        ctx.beginPath();
        ctx.moveTo(ax, ay - 1);
        ctx.lineTo(ax + (rand() - 0.5) * 1.2, ay + 1 + rand() * 1.8);
        ctx.stroke();
      }
    }
  }

  /**
   * Heavy winter snow on a roof slope: a thick blanket with a lumpy edge that
   * curls over the eave, and icicles hanging beneath it.
   */
  private snowOn(plane: V3[]): void {
    const [e0, e1, r1, r0] = plane;
    const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const t = 0.04;
    const a = lerp(e0, r0, t);
    const b = lerp(e1, r1, t);
    const [ax, ay] = iso(a[0], a[1], a[2]);
    const [bx, by] = iso(b[0], b[1], b[2]);
    const [cx, cy] = iso(r1[0], r1[1], r1[2]);
    const [dx, dy] = iso(r0[0], r0[1], r0[2]);
    const ctx = this.ctx;
    const rand = mulberry32(hash(e0[0], e0[1], e0[2], e1[0], e1[1], 7));
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(3, Math.round(len / 5));
    // Blanket with a scalloped, overhanging lower edge.
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(ax, ay);
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const mx = ax + (bx - ax) * ((u0 + u1) / 2);
      const my = ay + (by - ay) * ((u0 + u1) / 2) + 1.6 + rand() * 1.6;
      ctx.quadraticCurveTo(mx, my, ax + (bx - ax) * u1, ay + (by - ay) * u1);
    }
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(246,249,251,0.96)';
    ctx.fill();
    // Blue shadow under the lip so the snow reads as thick.
    ctx.strokeStyle = 'rgba(150,170,190,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 1.2);
    ctx.lineTo(bx, by + 1.2);
    ctx.stroke();
    // Icicles hanging from the eave.
    const m = Math.max(2, Math.round(len / 4));
    ctx.fillStyle = 'rgba(214,232,244,0.9)';
    for (let i = 0; i < m; i++) {
      if (rand() < 0.35) continue;
      const u = (i + 0.3 + rand() * 0.4) / m;
      const x = ax + (bx - ax) * u;
      const y = ay + (by - ay) * u + 1.5;
      const l = 2 + rand() * 4.5;
      ctx.beginPath();
      ctx.moveTo(x - 0.7, y);
      ctx.lineTo(x + 0.7, y);
      ctx.lineTo(x + (rand() - 0.5) * 0.4, y + l);
      ctx.closePath();
      ctx.fill();
    }
  }


  /** Quad on the front-left wall (plane y = y). */
  wallL(y: number, xa: number, xb: number, za: number, zb: number, fill: string): void {
    this.poly(
      [
        [xa, y, za],
        [xb, y, za],
        [xb, y, zb],
        [xa, y, zb],
      ],
      fill,
    );
  }

  /** Quad on the front-right wall (plane x = x). */
  wallR(x: number, ya: number, yb: number, za: number, zb: number, fill: string): void {
    this.poly(
      [
        [x, ya, za],
        [x, yb, za],
        [x, yb, zb],
        [x, ya, zb],
      ],
      fill,
    );
  }

  /** Timber framing on both visible walls of a box. */
  timber(x0: number, y0: number, x1: number, y1: number, z0: number, h: number, color = '#4a3020'): void {
    const z1 = z0 + h;
    const posts = Math.max(2, Math.round((x1 - x0) / 0.35));
    for (let i = 0; i <= posts; i++) {
      const x = x0 + ((x1 - x0) * i) / posts;
      this.line([x, y1, z0], [x, y1, z1], color, 1.6);
    }
    const postsR = Math.max(2, Math.round((y1 - y0) / 0.35));
    for (let i = 0; i <= postsR; i++) {
      const y = y0 + ((y1 - y0) * i) / postsR;
      this.line([x1, y, z0], [x1, y, z1], shade(color, 0.8), 1.6);
    }
    const zm = z0 + h * 0.5;
    this.line([x0, y1, zm], [x1, y1, zm], color, 1.4);
    this.line([x1, y0, zm], [x1, y1, zm], shade(color, 0.8), 1.4);
    this.line([x0, y1, z1], [x1, y1, z1], color, 1.8);
    this.line([x1, y0, z1], [x1, y1, z1], shade(color, 0.8), 1.8);
    this.line([x0, y1, z0 + 0.7], [x1, y1, z0 + 0.7], color, 1.8);
    this.line([x1, y0, z0 + 0.7], [x1, y1, z0 + 0.7], shade(color, 0.8), 1.8);
    // A few braces.
    const step = (x1 - x0) / posts;
    for (let i = 0; i < posts; i += 2) {
      const x = x0 + step * i;
      this.line([x, y1, z0], [x + step, y1, zm], color, 1.2);
    }
  }

  windowL(y: number, x: number, z: number, w = 0.14, hgt = 6, lit = false): void {
    this.wallL(y + 0.001, x - 0.02, x + w + 0.02, z - 1, z + hgt + 1, '#4a3020');
    this.wallL(y + 0.002, x, x + w, z, z + hgt, lit ? '#f2c25a' : '#2b2a2e');
  }

  windowR(x: number, y: number, z: number, w = 0.14, hgt = 6, lit = false): void {
    this.wallR(x + 0.001, y - 0.02, y + w + 0.02, z - 1, z + hgt + 1, '#3a2618');
    this.wallR(x + 0.002, y, y + w, z, z + hgt, lit ? '#e0b04e' : '#232226');
  }

  doorL(y: number, x: number, w = 0.18, hgt = 11): void {
    this.wallL(y + 0.002, x, x + w, 0, hgt, '#5b3a22');
    this.line([x + w / 2, y + 0.003, 0], [x + w / 2, y + 0.003, hgt], '#3d2614', 0.6);
  }

  doorR(x: number, y: number, w = 0.18, hgt = 11): void {
    this.wallR(x + 0.002, y, y + w, 0, hgt, '#4a2f1b');
  }

  chimney(x: number, y: number, zBase: number, h: number, color = '#8a7d70'): V3 {
    this.box(x, y, x + 0.12, y + 0.12, zBase, h, color, undefined, 'stone');
    return [x + 0.06, y + 0.06, zBase + h + 2];
  }

  // ------------------------------------------------------------ props

  logPile(x: number, y: number, n = 3): void {
    for (let row = 0; row < n; row++) {
      const count = n - row;
      for (let i = 0; i < count; i++) {
        const lx = x + i * 0.13 + row * 0.065;
        const z = 3 + row * 5;
        this.line([lx, y - 0.3, z], [lx, y + 0.1, z], '#6b4626', 5);
        this.circle(lx, y + 0.1, z, 2.6, '#c8a06a');
        this.circle(lx, y + 0.1, z, 1.1, '#9a7346');
      }
    }
  }

  stonePile(x: number, y: number, n = 4): void {
    const cols = ['#a7a59e', '#8f8d86', '#b8b5ad', '#9b988f'];
    for (let i = 0; i < n; i++) {
      const dx = (i % 2) * 0.15;
      const dy = Math.floor(i / 2) * 0.15;
      this.box(x + dx, y + dy, x + dx + 0.12, y + dy + 0.12, 0, 5, cols[i % 4]);
    }
    if (n > 3) this.box(x + 0.07, y + 0.07, x + 0.19, y + 0.19, 5, 4, '#aeaba3');
  }

  barrel(x: number, y: number): void {
    const [sx, sy] = iso(x, y, 0);
    const c = this.ctx;
    c.fillStyle = '#7a5230';
    c.beginPath();
    c.ellipse(sx, sy - 5, 4, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#3c2a1a';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(sx - 4, sy - 7);
    c.lineTo(sx + 4, sy - 7);
    c.moveTo(sx - 4, sy - 3);
    c.lineTo(sx + 4, sy - 3);
    c.stroke();
    c.fillStyle = '#5e3e22';
    c.beginPath();
    c.ellipse(sx, sy - 10.5, 3.2, 1.5, 0, 0, Math.PI * 2);
    c.fill();
  }

  crate(x: number, y: number, s = 0.16): void {
    this.box(x, y, x + s, y + s, 0, s * 40, '#a07a48');
    this.line([x, y + s, 0], [x + s, y + s, s * 40], '#6e5030', 0.6);
  }

  /** A filled sack standing upright, tied at the neck. */
  sack(x: number, y: number, color = '#d8c79c'): void {
    const [sx, sy] = iso(x, y, 0);
    const c = this.ctx;
    c.fillStyle = 'rgba(30,24,12,0.2)';
    c.beginPath();
    c.ellipse(sx + 0.8, sy - 0.3, 4.4, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    const g = c.createLinearGradient(sx - 4, 0, sx + 4, 0);
    g.addColorStop(0, shade(color, 1.04));
    g.addColorStop(0.55, shade(color, 0.92));
    g.addColorStop(1, shade(color, 0.68));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(sx - 1.3, sy - 8.6);
    c.bezierCurveTo(sx - 4.6, sy - 7, sx - 4.8, sy - 1.6, sx - 3.2, sy - 0.6);
    c.quadraticCurveTo(sx, sy + 0.6, sx + 3.2, sy - 0.6);
    c.bezierCurveTo(sx + 4.8, sy - 1.6, sx + 4.6, sy - 7, sx + 1.3, sy - 8.6);
    c.closePath();
    c.fill();
    c.strokeStyle = shade(color, 0.55);
    c.lineWidth = 0.5;
    c.stroke();
    // The gathered mouth above the tie.
    c.fillStyle = shade(color, 0.85);
    c.beginPath();
    c.moveTo(sx - 1.3, sy - 8.6);
    c.lineTo(sx - 2.2, sy - 10.6);
    c.lineTo(sx - 0.4, sy - 9.8);
    c.lineTo(sx + 0.6, sy - 10.9);
    c.lineTo(sx + 2, sy - 10.2);
    c.lineTo(sx + 1.3, sy - 8.6);
    c.closePath();
    c.fill();
    c.strokeStyle = '#6a4a2a';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(sx - 1.5, sy - 8.7);
    c.lineTo(sx + 1.5, sy - 8.5);
    c.stroke();
  }

  fence(a: [number, number], b: [number, number], color = '#7b5a36'): void {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 0.25));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      this.line([x, y, 0], [x, y, 7], color, 1.2);
    }
    this.line([a[0], a[1], 5.5], [b[0], b[1], 5.5], color, 1);
    this.line([a[0], a[1], 2.5], [b[0], b[1], 2.5], color, 1);
  }

  bush(x: number, y: number, r: number, color: string): void {
    const [sx, sy] = iso(x, y, 0);
    const c = this.ctx;
    c.fillStyle = shade(color, 0.7);
    c.beginPath();
    c.ellipse(sx + 1, sy - r * 0.7, r, r * 0.8, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(sx, sy - r * 0.9, r * 0.85, r * 0.7, 0, 0, Math.PI * 2);
    c.fill();
  }

  /** A flag bearing the lord's arms, on a pole h high from z. */
  lordFlag(x: number, y: number, z: number, h: number): void {
    this.line([x, y, z], [x, y, z + h], '#3b2a1a', 1.4);
    const [sx, sy] = iso(x, y, z + h);
    const c = this.ctx;
    c.save();
    c.beginPath();
    // The cloth droops a little towards the fly, cut to the arms' chosen shape.
    flagOutline(c, HERALDRY.current.shape, sx, sy, 15, 8.8, (t) => t * 3 - Math.sin(t * Math.PI) * 1.2);
    c.clip();
    // Skewed a little, as the cloth hangs.
    c.transform(1, 3 / 15, 0, 1, 0, -(sx * 3) / 15);
    paintArms(c, HERALDRY.current, sx, sy, 15, 8.5);
    c.restore();
  }

  flag(x: number, y: number, z: number, h: number, color: string): void {
    this.line([x, y, z], [x, y, z + h], '#3b2a1a', 1.4);
    const [sx, sy] = iso(x, y, z + h);
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(sx, sy);
    c.quadraticCurveTo(sx + 8, sy + 1, sx + 15, sy + 3);
    c.lineTo(sx + 14, sy + 10);
    c.quadraticCurveTo(sx + 7, sy + 8, sx, sy + 9);
    c.closePath();
    c.fill();
    c.fillStyle = '#e8c860';
    c.beginPath();
    c.arc(sx + 7, sy + 5.5, 2, 0, Math.PI * 2);
    c.fill();
  }
}
