import type { GameState } from './types';

/**
 * Roads drawn as free curves: the player clicks the bends, the road follows
 * a smooth line through them, and the tiles under it become road for the
 * simulation (walking speed, paths). The curve itself is kept for drawing.
 */
export type Pt = [number, number];

/** Points every `step` tiles along a smooth curve (Catmull-Rom) through the clicks. */
export function curveSamples(pts: Pt[], step = 0.2): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The tiles a curve runs over, in order along it, each once. */
export function curveTiles(s: GameState, pts: Pt[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const [x, y] of curveSamples(pts, 0.15)) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= s.width || ty >= s.height) continue;
    const i = ty * s.width + tx;
    if (seen.has(i)) continue;
    // Keep the tile path joined edge to edge, so walkers can follow it.
    const last = out[out.length - 1];
    if (last !== undefined) {
      const lx = last % s.width;
      const ly = (last - lx) / s.width;
      if (lx !== tx && ly !== ty) {
        const j = ly * s.width + tx;
        if (!seen.has(j)) {
          seen.add(j);
          out.push(j);
        }
      }
    }
    seen.add(i);
    out.push(i);
  }
  return out;
}

/**
 * Fields, pastures, orchards and markets drawn as free shapes: the player
 * clicks the corners of a polygon and the tiles whose centres lie inside
 * it are the zone's ground (for area, yields and what stands where).
 */
export function insidePolygon(pts: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The tiles inside a polygon (tiles off the map are -1). */
export function polygonCells(s: GameState, pts: Pt[]): number[] {
  const out: number[] = [];
  if (pts.length < 3) return out;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      if (!insidePolygon(pts, x + 0.5, y + 0.5)) continue;
      out.push(x >= 0 && y >= 0 && x < s.width && y < s.height ? y * s.width + x : -1);
    }
  }
  return out;
}

/** Tiles a polygon covers any part of (a corner or the centre inside it). */
export function polygonTouched(s: GameState, pts: Pt[]): number[] {
  const out: number[] = [];
  if (pts.length < 3) return out;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
      const hit = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].some(([dx, dy]) => insidePolygon(pts, x + dx, y + dy));
      if (hit) out.push(y * s.width + x);
    }
  }
  return out;
}

/** Length of a closed outline, in tiles. */
export function perimeter(pts: Pt[]): number {
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    n += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return n;
}

/** The bounding rectangle of a set of tiles. */
export function cellsRect(s: GameState, cells: number[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of cells) {
    const x = i % s.width;
    const y = (i - x) / s.width;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
