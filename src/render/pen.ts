/** Isometric projection: tile units on x/y, pixels on z. */
export const TW = 64;
export const TH = 32;

export type V3 = [number, number, number];

export function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * (TW / 2), (x + y) * (TH / 2) - z];
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

export type RoofKind = 'thatch' | 'shingle' | 'slate' | 'tile' | 'plank';

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
  box(x0: number, y0: number, x1: number, y1: number, z0: number, h: number, color: string, top?: string): void {
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
    this.roofTexture(front, kind, true);
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
    this.roofTexture(front, kind, false);
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
  }

  private roofTexture(plane: V3[], kind: RoofKind, alongX: boolean): void {
    const col = this.roofColor(kind);
    const [e0, e1, r1, r0] = plane;
    const rows = kind === 'thatch' ? 7 : kind === 'slate' ? 6 : 5;
    for (let i = 1; i < rows; i++) {
      const t = i / rows;
      const a: V3 = [e0[0] + (r0[0] - e0[0]) * t, e0[1] + (r0[1] - e0[1]) * t, e0[2] + (r0[2] - e0[2]) * t];
      const b: V3 = [e1[0] + (r1[0] - e1[0]) * t, e1[1] + (r1[1] - e1[1]) * t, e1[2] + (r1[2] - e1[2]) * t];
      this.line(a, b, shade(col, kind === 'thatch' ? 0.82 : 0.7), kind === 'thatch' ? 0.8 : 0.6);
      if (kind !== 'thatch') {
        // Staggered vertical joints.
        const n = 7;
        for (let j = (i % 2) * 0.5; j < n; j++) {
          const u = j / n;
          const t2 = (i - 1) / rows;
          const p: V3 = [
            e0[0] + (e1[0] - e0[0]) * u + (r0[0] - e0[0]) * t2,
            e0[1] + (e1[1] - e0[1]) * u + (r0[1] - e0[1]) * t2,
            e0[2] + (e1[2] - e0[2]) * u + (r0[2] - e0[2]) * t2,
          ];
          const q: V3 = [p[0] + (r0[0] - e0[0]) / rows, p[1] + (r0[1] - e0[1]) / rows, p[2] + (r0[2] - e0[2]) / rows];
          this.line(p, q, shade(col, 0.75), 0.4);
        }
      }
    }
    void alongX;
  }

  private snowOn(plane: V3[]): void {
    const [e0, e1, r1, r0] = plane;
    const t = 0.25;
    const a: V3 = [e0[0] + (r0[0] - e0[0]) * t, e0[1] + (r0[1] - e0[1]) * t, e0[2] + (r0[2] - e0[2]) * t];
    const b: V3 = [e1[0] + (r1[0] - e1[0]) * t, e1[1] + (r1[1] - e1[1]) * t, e1[2] + (r1[2] - e1[2]) * t];
    this.poly([a, b, r1, r0], 'rgba(244,248,250,0.92)');
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
      this.line([x, y1, z0], [x, y1, z1], color, 1.1);
    }
    const postsR = Math.max(2, Math.round((y1 - y0) / 0.35));
    for (let i = 0; i <= postsR; i++) {
      const y = y0 + ((y1 - y0) * i) / postsR;
      this.line([x1, y, z0], [x1, y, z1], shade(color, 0.8), 1.1);
    }
    const zm = z0 + h * 0.5;
    this.line([x0, y1, zm], [x1, y1, zm], color, 1);
    this.line([x1, y0, zm], [x1, y1, zm], shade(color, 0.8), 1);
    this.line([x0, y1, z1], [x1, y1, z1], color, 1.3);
    this.line([x1, y0, z1], [x1, y1, z1], shade(color, 0.8), 1.3);
    this.line([x0, y1, z0 + 0.5], [x1, y1, z0 + 0.5], color, 1.3);
    // A few braces.
    const step = (x1 - x0) / posts;
    for (let i = 0; i < posts; i += 2) {
      const x = x0 + step * i;
      this.line([x, y1, z0], [x + step, y1, zm], color, 0.8);
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
    this.box(x, y, x + 0.12, y + 0.12, zBase, h, color);
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

  sack(x: number, y: number, color = '#d8c79c'): void {
    const [sx, sy] = iso(x, y, 0);
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(sx, sy - 3.5, 3.5, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = shade(color, 0.7);
    c.beginPath();
    c.ellipse(sx + 1, sy - 2.5, 2, 2.5, 0, 0, Math.PI * 2);
    c.fill();
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
