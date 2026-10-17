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
