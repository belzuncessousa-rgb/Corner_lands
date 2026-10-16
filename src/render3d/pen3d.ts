import * as THREE from 'three';
import { Pen, TW } from '../render/pen';
import type { V3 } from '../render/pen';

/**
 * Scale between the flat drawing and 3D: the isometric pen measures height
 * in screen pixels. With a camera 30° above the ground, a world unit of
 * height covers cos(30°) of the 45.25 px a tile edge spans on screen.
 */
export const PX_PER_UNIT = (TW / Math.SQRT2) * Math.cos(Math.PI / 6);
/** Pen coordinates (x, y in tiles, z in pixels) to world space (y up). */
export const toWorld = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, z / PX_PER_UNIT, y);

/** One shared material for every solid face: colours come from the vertices. */
const SOLID = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

/** A throwaway canvas for the few things the building code paints directly. */
let scratch: CanvasRenderingContext2D | null = null;
function scratchCtx(): CanvasRenderingContext2D {
  if (!scratch) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    scratch = c.getContext('2d')!;
  }
  return scratch;
}

/** "#aabbcc", "rgb(...)" or "rgba(...)" to a colour and an opacity. */
function parse(style: string): { color: THREE.Color; alpha: number } {
  const m = /^rgba?\(([^)]+)\)$/.exec(style.trim());
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((v) => Number(v.trim()));
    return { color: new THREE.Color(r / 255, g / 255, b / 255), alpha: a ?? 1 };
  }
  return { color: new THREE.Color(style), alpha: 1 };
}

/**
 * The isometric pen, re-done in 3D: the same calls the building code makes
 * (boxes, gable roofs, wall quads, windows, timbers, props) build solid
 * geometry instead of painting a picture. Boxes and roofs get all their
 * faces, so a building can be seen from any side.
 */
export class Pen3D extends Pen {
  private batches = new Map<string, { color: THREE.Color; alpha: number; pos: number[] }>();

  constructor() {
    super(scratchCtx());
  }

  private tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, style: string): void {
    let batch = this.batches.get(style);
    if (!batch) {
      const { color, alpha } = parse(style);
      batch = { color, alpha, pos: [] };
      this.batches.set(style, batch);
    }
    batch.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  private quadW(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, style: string): void {
    this.tri(a, b, c, style);
    this.tri(a, c, d, style);
  }

  override poly(pts: V3[], fill: string | null): void {
    if (!fill || pts.length < 3) return;
    const w = pts.map((p) => toWorld(p[0], p[1], p[2]));
    for (let i = 1; i < w.length - 1; i++) this.tri(w[0], w[i], w[i + 1], fill);
  }

  override line(a: V3, b: V3, color: string, w = 1): void {
    const A = toWorld(a[0], a[1], a[2]);
    const B = toWorld(b[0], b[1], b[2]);
    const dir = B.clone().sub(A);
    if (dir.lengthSq() < 1e-9) return;
    dir.normalize();
    // Two directions across the line, for a thin square beam.
    const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t = (w / PX_PER_UNIT) * 0.5;
    const u = new THREE.Vector3().crossVectors(dir, ref).normalize().multiplyScalar(t);
    const v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(t);
    const c = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
    for (let i = 0; i < 4; i++) {
      const p = c[i];
      const q = c[(i + 1) % 4];
      this.quadW(A.clone().add(p), B.clone().add(p), B.clone().add(q), A.clone().add(q), color);
    }
  }

  override ellipse(x: number, y: number, z: number, rx: number, _ry: number, fill: string): void {
    // A small ball: log ends, flowers, apples, knots.
    const r = rx / PX_PER_UNIT;
    const c = toWorld(x, y, z);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const top = c.clone().add(new THREE.Vector3(0, r, 0));
      const bot = c.clone().add(new THREE.Vector3(0, -r, 0));
      const p0 = c.clone().add(new THREE.Vector3(Math.cos(a0) * r, 0, Math.sin(a0) * r));
      const p1 = c.clone().add(new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r));
      this.tri(top, p0, p1, fill);
      this.tri(bot, p1, p0, fill);
    }
  }

  // Real shadows replace the painted ones.
  override shadow(): void {}

  override box(x0: number, y0: number, x1: number, y1: number, z0: number, h: number, color: string, top?: string): void {
    const z1 = z0 + h;
    const P = (x: number, y: number, z: number) => toWorld(x, y, z);
    const [a, b, c, d] = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)];
    const [e, f, g, k] = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
    this.quadW(d, c, g, k, color); // front (y1)
    this.quadW(b, a, e, f, color); // back (y0)
    this.quadW(c, b, f, g, color); // right (x1)
    this.quadW(a, d, k, e, color); // left (x0)
    this.quadW(k, g, f, e, top ?? color); // top
  }

  override roofX(x0: number, y0: number, x1: number, y1: number, h: number, rh: number, kind: Parameters<Pen['roofX']>[6], wall: string, o = 0.1): void {
    const ym = (y0 + y1) / 2;
    const col = this.roofColor(kind);
    const P = (x: number, y: number, z: number) => toWorld(x, y, z);
    this.quadW(P(x0 - o, y0 - o, h - 2), P(x1 + o, y0 - o, h - 2), P(x1 + o, ym, h + rh), P(x0 - o, ym, h + rh), col);
    this.quadW(P(x0 - o, y1 + o, h - 2), P(x1 + o, y1 + o, h - 2), P(x1 + o, ym, h + rh), P(x0 - o, ym, h + rh), col);
    this.tri(P(x1, y0, h), P(x1, y1, h), P(x1, ym, h + rh), wall);
    this.tri(P(x0, y0, h), P(x0, y1, h), P(x0, ym, h + rh), wall);
    if (this.snow) this.snowCap([P(x0 - o, y1 + o, h - 2), P(x1 + o, y1 + o, h - 2), P(x1 + o, ym, h + rh), P(x0 - o, ym, h + rh)]);
  }

  override roofY(x0: number, y0: number, x1: number, y1: number, h: number, rh: number, kind: Parameters<Pen['roofY']>[6], wall: string, o = 0.1): void {
    const xm = (x0 + x1) / 2;
    const col = this.roofColor(kind);
    const P = (x: number, y: number, z: number) => toWorld(x, y, z);
    this.quadW(P(x0 - o, y0 - o, h - 2), P(x0 - o, y1 + o, h - 2), P(xm, y1 + o, h + rh), P(xm, y0 - o, h + rh), col);
    this.quadW(P(x1 + o, y0 - o, h - 2), P(x1 + o, y1 + o, h - 2), P(xm, y1 + o, h + rh), P(xm, y0 - o, h + rh), col);
    this.tri(P(x0, y1, h), P(x1, y1, h), P(xm, y1, h + rh), wall);
    this.tri(P(x0, y0, h), P(x1, y0, h), P(xm, y0, h + rh), wall);
    if (this.snow) this.snowCap([P(x1 + o, y0 - o, h - 2), P(x1 + o, y1 + o, h - 2), P(xm, y1 + o, h + rh), P(xm, y0 - o, h + rh)]);
  }

  override roofPyramid(x0: number, y0: number, x1: number, y1: number, h: number, rh: number, kind: Parameters<Pen['roofPyramid']>[6], o = 0.08): void {
    const col = this.snow ? '#eef2f4' : this.roofColor(kind);
    const P = (x: number, y: number, z: number) => toWorld(x, y, z);
    const apex = P((x0 + x1) / 2, (y0 + y1) / 2, h + rh);
    const a = P(x0 - o, y0 - o, h);
    const b = P(x1 + o, y0 - o, h);
    const c = P(x1 + o, y1 + o, h);
    const d = P(x0 - o, y1 + o, h);
    this.tri(a, b, apex, col);
    this.tri(b, c, apex, col);
    this.tri(c, d, apex, col);
    this.tri(d, a, apex, col);
  }

  private snowCap(plane: THREE.Vector3[]): void {
    const [e0, e1, r1, r0] = plane;
    const lift = new THREE.Vector3(0, 0.01, 0);
    const a = e0.clone().lerp(r0, 0.25).add(lift);
    const b = e1.clone().lerp(r1, 0.25).add(lift);
    this.quadW(a, b, r1.clone().add(lift), r0.clone().add(lift), '#f4f8fa');
  }

  // Painted-on details become small solids.
  override barrel(x: number, y: number): void {
    this.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, 11, '#7a5230', '#5e3e22');
  }

  override sack(x: number, y: number, color = '#d8c79c'): void {
    this.ellipse(x, y, 3.5, 4, 4, color);
  }

  override bush(x: number, y: number, r: number, color: string): void {
    this.ellipse(x, y, r * 0.8, r, r, color);
  }

  override flag(x: number, y: number, z: number, h: number, color: string): void {
    this.line([x, y, z], [x, y, z + h], '#3b2a1a', 1.4);
    this.quadW(toWorld(x, y, z + h), toWorld(x + 0.3, y, z + h - 1), toWorld(x + 0.3, y, z + h - 9), toWorld(x, y, z + h - 9), color);
  }

  /**
   * The finished model: all solid faces in one mesh with a colour per
   * vertex (one draw call per building), and see-through faces in another.
   */
  build(): THREE.Group {
    const group = new THREE.Group();
    const solid: { pos: number[]; col: number[] } = { pos: [], col: [] };
    for (const { color, alpha, pos } of this.batches.values()) {
      if (alpha >= 1) {
        solid.pos.push(...pos);
        for (let i = 0; i < pos.length / 3; i++) solid.col.push(color.r, color.g, color.b);
        continue;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: alpha, depthWrite: false }));
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (solid.pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(solid.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(solid.col, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, SOLID);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}
