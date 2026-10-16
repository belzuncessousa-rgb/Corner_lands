import * as THREE from 'three';
import { mulberry32 } from '../game/rng';

/**
 * Surface patterns for the 3D view, in the style of the flat art: straw,
 * shingles, slates, barrel tiles and planks for roofs; cut stone, rubble,
 * weatherboards, logs and limewash for walls. Each is a light grey swatch
 * that the face's own colour is multiplied by, so a building keeps its
 * colours and gains its texture. One swatch covers WORLD units each way.
 */
export type Pattern = 'thatch' | 'shingle' | 'slate' | 'tile' | 'plank' | 'stone' | 'rubble' | 'boards' | 'log' | 'plaster';

/** World units one repeat of a swatch covers. */
export const WORLD = 0.5;
const S = 128;

const cache = new Map<Pattern, THREE.Texture>();

const grey = (v: number) => {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${c},${c},${c})`;
};

export function patternTexture(p: Pattern): THREE.Texture {
  let t = cache.get(p);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  paint(g, p);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(p, t);
  return t;
}

/** Paints a swatch: u runs along the eave or wall, v up the slope or wall. */
function paint(g: CanvasRenderingContext2D, p: Pattern): void {
  const rand = mulberry32(p.length * 977 + p.charCodeAt(0));
  g.fillStyle = grey(0.92);
  g.fillRect(0, 0, S, S);
  // Canvas y grows downwards; v grows upwards, so rows are laid bottom to top.
  if (p === 'thatch') {
    // Thousands of short strands running down the slope, in five tones.
    g.lineWidth = 1.2;
    for (let i = 0; i < 2600; i++) {
      const x = rand() * S;
      const y = rand() * S;
      g.strokeStyle = grey([0.7, 0.8, 0.9, 0.97, 1][Math.floor(rand() * 5)]);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 1.5, y + 6 + rand() * 8);
      g.stroke();
    }
    // Courses where each layer of bundles was pegged down.
    g.strokeStyle = grey(0.66);
    g.lineWidth = 1.5;
    for (const y of [32, 96]) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y);
      g.stroke();
    }
    return;
  }
  if (p === 'shingle' || p === 'slate' || p === 'tile') {
    const rows = p === 'slate' ? 11 : 9;
    const cols = p === 'slate' ? 8 : p === 'tile' ? 10 : 7;
    const rh = S / rows;
    const cw = S / cols;
    const [lo, hi] = p === 'slate' ? [0.8, 0.98] : p === 'tile' ? [0.78, 1] : [0.74, 0.98];
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.5;
      for (let k = -1; k <= cols; k++) {
        const x = (k + off) * cw;
        const y = S - (r + 1) * rh;
        const f = lo + rand() * (hi - lo);
        if (p === 'tile') {
          // Barrel tiles: a lit crown and a shaded trough.
          g.fillStyle = grey(f);
          g.fillRect(x, y, cw / 2, rh);
          g.fillStyle = grey(f * 0.82);
          g.fillRect(x + cw / 2, y, cw / 2, rh);
        } else {
          g.fillStyle = grey(f);
          g.fillRect(x + 0.5, y, cw - 1, rh);
        }
        g.fillStyle = grey(0.55);
        g.fillRect(x, y, 1, rh);
      }
      // Shadow under the course above.
      g.fillStyle = grey(0.58);
      g.fillRect(0, S - (r + 1) * rh, S, p === 'slate' ? 1 : 1.5);
    }
    return;
  }
  if (p === 'plank') {
    const n = 8;
    for (let k = 0; k < n; k++) {
      g.fillStyle = grey(0.8 + rand() * 0.18);
      g.fillRect((k * S) / n, 0, S / n, S);
      g.fillStyle = grey(0.55);
      g.fillRect((k * S) / n, 0, 1, S);
    }
    return;
  }
  if (p === 'stone' || p === 'rubble') {
    // Mortar beds with squared blocks laid in courses.
    g.fillStyle = grey(0.97);
    g.fillRect(0, 0, S, S);
    let y = S;
    let row = 0;
    while (y > 0) {
      const ch = p === 'rubble' ? 9 + rand() * 7 : 13 + rand() * 2;
      let x = row % 2 ? -8 - rand() * 6 : -rand() * 6;
      while (x < S) {
        const len = p === 'rubble' ? 12 + rand() * 18 : 22 + rand() * 16;
        const f = 0.74 + rand() * 0.2;
        g.fillStyle = grey(f);
        const inset = p === 'rubble' ? 1.5 + rand() * 1.5 : 1.2;
        g.fillRect(x + inset, y - ch + inset, len - inset * 2, ch - inset * 2);
        g.fillStyle = grey(Math.min(1, f + 0.1));
        g.fillRect(x + inset, y - ch + inset, len - inset * 2, 1);
        x += len;
      }
      y -= ch;
      row++;
    }
    return;
  }
  if (p === 'boards' || p === 'log') {
    const rowH = p === 'log' ? 14 : 10;
    for (let y = S, row = 0; y > 0; y -= rowH, row++) {
      g.fillStyle = grey(0.82 + rand() * 0.16);
      g.fillRect(0, y - rowH, S, rowH);
      g.fillStyle = grey(p === 'log' ? 0.6 : 0.62);
      g.fillRect(0, y - (p === 'log' ? 2 : 1.5), S, p === 'log' ? 2 : 1.5);
      if (p === 'log') {
        g.fillStyle = grey(1);
        g.fillRect(0, y - rowH + 2, S, 1);
      } else if (rand() < 0.6) {
        g.fillStyle = grey(0.62);
        g.fillRect(rand() * S, y - rowH, 1, rowH);
      }
    }
    return;
  }
  // Limewash mottled with weather, and dirt splashed at the foot of the wall.
  for (let i = 0; i < 220; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120,120,120,0.08)' : 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(rand() * S, rand() * S, 3 + rand() * 7, 2 + rand() * 4, 0, 0, Math.PI * 2);
    g.fill();
  }
}
