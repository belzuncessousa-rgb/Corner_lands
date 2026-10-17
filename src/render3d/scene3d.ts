import * as THREE from 'three';
import { BUILDINGS } from '../game/data';
import { seasonOf } from '../game/sim';
import type { GameState, Season } from '../game/types';
import { drawBuilding, treeSprite, wallMaterial } from '../render/sprites';
import type { TreeKind } from '../render/sprites';
import { curveSamples } from '../game/curves';
import { mulberry32 } from '../game/rng';
import { Pen3D } from './pen3d';

/**
 * A 3D view of a town built from the game's own drawings: buildings from
 * the same pen calls as the flat sprites, trees as the same painted sprites
 * turned to face the camera, and the ground painted from the map.
 */
const models = new Map<string, THREE.Group>();

/** A building's model, built once per kind, level, season and look. */
export function buildingModel(type: GameState['buildings'][number]['type'], level: number, season: Season, variant: number): THREE.Group {
  const key = `${type}:${level}:${season}:${variant}`;
  let m = models.get(key);
  if (!m) {
    const p = new Pen3D();
    p.snow = season === 3;
    p.matFor = wallMaterial;
    drawBuilding(p, type, level, season, variant);
    m = p.build();
    models.set(key, m);
  }
  return m;
}

const treeTextures = new Map<string, { tex: THREE.Texture; w: number; h: number; ax: number; ay: number }>();
function treeTexture(kind: TreeKind, season: Season, v: number) {
  const key = `${kind}:${season}:${v}`;
  let t = treeTextures.get(key);
  if (!t) {
    const sp = treeSprite(kind, season, v);
    const tex = new THREE.CanvasTexture(sp.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    t = { tex, w: sp.w, h: sp.h, ax: sp.ax, ay: sp.ay };
    treeTextures.set(key, t);
  }
  return t;
}

/** The ground as one texture, painted from the map in the style of the flat tiles. */
export function groundTexture(s: GameState, season: Season): THREE.CanvasTexture {
  const P = 24;
  const W = s.width * P;
  const H = s.height * P;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // Grass, water and shores change only with the season: painted once, then
  // fields and roads go on top of a copy each time they change.
  g.drawImage(groundBase(s, season, P), 0, 0);
  // Zones: fields, pastures, orchards and market squares, laid square or drawn as free shapes.
  for (const b of s.buildings) if (BUILDINGS[b.type].zone) paintZone(g, b, P, season);
  paintRoads(g, s, P, season);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let baseCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Grass with its soil wash and tufts, and the water with its shores. */
function groundBase(s: GameState, season: Season, P: number): HTMLCanvasElement {
  const key = `${s.seed}:${s.width}:${season}:${s.founded ?? 0}`;
  if (baseCache?.key === key) return baseCache.canvas;
  const W = s.width * P;
  const H = s.height * P;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rand = mulberry32(s.seed);
  // Soil richness as a soft wash: one pixel per tile, smoothed as it is enlarged.
  const small = document.createElement('canvas');
  small.width = s.width;
  small.height = s.height;
  const sg = small.getContext('2d')!;
  const lush = season === 3 ? ['#d9dfdd', '#e6ebe9'] : season === 2 ? ['#9a9440', '#b4ac58'] : ['#6a9a3c', '#8cba56'];
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const i = y * s.width + x;
      // Water is laid over afterwards along a smooth shore; under it, plain grass.
      sg.fillStyle = s.terrain[i] === 1 ? lush[0] : mixHex(lush[0], lush[1], 1 - s.fertility[i]);
      sg.fillRect(x, y, 1, 1);
    }
  }
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, W, H);
  // Tufts and flecks, as on the flat grass tiles.
  const tuft = season === 3 ? ['rgba(255,255,255,0.35)', 'rgba(160,170,170,0.25)'] : ['rgba(40,70,20,0.22)', 'rgba(200,230,120,0.22)'];
  for (let k = 0; k < s.width * s.height * 6; k++) {
    const x = rand() * W;
    const y = rand() * H;
    if (s.terrain[Math.floor(y / P) * s.width + Math.floor(x / P)] === 1) continue;
    g.strokeStyle = tuft[k % 2];
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 2, y - 2 - rand() * 3);
    g.stroke();
  }
  // Wildflowers in clumps, thicker on rich soil, and pebbles here and there.
  const blooms = season === 3 ? [] : season === 2 ? ['#d88a3a', '#b8482a', '#e0c050'] : ['#e84a6a', '#f2d34a', '#f4f0e0', '#b97ae0', '#5a7ad8', '#d84a3a'];
  for (let k = 0; k < s.width * s.height * 1.6; k++) {
    const tx = Math.floor(rand() * s.width);
    const ty = Math.floor(rand() * s.height);
    const i = ty * s.width + tx;
    const r = rand();
    if (s.terrain[i] === 1) continue;
    if (r < 0.06) {
      g.fillStyle = rand() < 0.5 ? '#9a9286' : '#b4ada0';
      g.beginPath();
      g.ellipse((tx + rand()) * P, (ty + rand()) * P, 1.6 + rand(), 1.1, 0, 0, Math.PI * 2);
      g.fill();
    } else if (blooms.length && r < 0.06 + 0.3 * s.fertility[i]) {
      g.fillStyle = blooms[Math.floor(rand() * blooms.length)];
      const cx = (tx + rand()) * P;
      const cy = (ty + rand()) * P;
      for (let f = 0; f < 4; f++) {
        g.beginPath();
        g.arc(cx + (rand() - 0.5) * P * 0.4, cy + (rand() - 0.5) * P * 0.4, 1.7, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Water with smooth shores: the map's water tiles as a mask, enlarged
  // smoothly and softened, then cut at half way. A sandy rim runs round it and
  // the water deepens away from the bank. (The simulation keeps its tiles.)
  paintWater(g, s, P, season);
  g.lineCap = 'round';
  if (season !== 3) {
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (s.terrain[y * s.width + x] !== 1 || rand() > 0.3) continue;
        g.beginPath();
        g.moveTo(x * P + rand() * P * 0.6, y * P + rand() * P);
        g.lineTo(x * P + P * 0.4 + rand() * P * 0.6, y * P + rand() * P);
        g.stroke();
      }
    }
  }
  baseCache = { key, canvas: c };
  return c;
}

/** Roads: continuous bands with a darker verge, bending at corners. */
function paintRoads(g: CanvasRenderingContext2D, s: GameState, P: number, season: Season): void {
  // Roads: continuous bands with a darker verge, bending at corners. Roads
  // laid as free curves are drawn along their curve instead of tile by tile.
  const road = (x: number, y: number) => x >= 0 && y >= 0 && x < s.width && y < s.height && s.road[y * s.width + x] > 0;
  const curved = new Set<number>();
  // Ordinary roads join a curve only at its ends, so they do not ladder along it.
  const curveEnds = new Set<number>();
  for (const cv of s.curves ?? []) {
    for (const i of cv.tiles) curved.add(i);
    curveEnds.add(cv.tiles[0]);
    curveEnds.add(cv.tiles[cv.tiles.length - 1]);
  }
  const curveLines = (s.curves ?? []).map((cv) => ({ paved: cv.paved, pts: curveSamples(cv.pts, 0.2) }));
  for (const layer of ['edge', 'fill'] as const) {
    for (const cv of curveLines) {
      g.strokeStyle = layer === 'edge' ? (season === 3 ? '#b9ad9c' : cv.paved ? '#6e6658' : '#8d7149') : cv.paved ? '#a8a092' : season === 3 ? '#cfc6b8' : '#a88a5c';
      g.lineWidth = P * (layer === 'edge' ? 0.62 : 0.48);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      cv.pts.forEach(([x, y], k) => (k ? g.lineTo(x * P, y * P) : g.moveTo(x * P, y * P)));
      g.stroke();
    }
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const i = y * s.width + x;
        if (!s.road[i] || curved.has(i)) continue;
        const paved = s.road[i] === 2;
        g.strokeStyle = layer === 'edge' ? (season === 3 ? '#b9ad9c' : paved ? '#6e6658' : '#8d7149') : paved ? '#a8a092' : season === 3 ? '#cfc6b8' : '#a88a5c';
        g.lineWidth = P * (layer === 'edge' ? 0.62 : 0.48);
        g.lineCap = 'round';
        const cx = (x + 0.5) * P;
        const cy = (y + 0.5) * P;
        const ends: [number, number][] = [];
        // Towards a curved road, run on to the middle of its tile to meet the curve.
        const to = (nx: number, ny: number, ex: number, ey: number) => {
          const j = ny * s.width + nx;
          if (!curved.has(j)) ends.push([ex, ey]);
          else if (curveEnds.has(j)) ends.push([(nx + 0.5) * P, (ny + 0.5) * P]);
        };
        if (road(x + 1, y)) to(x + 1, y, (x + 1) * P, cy);
        if (road(x - 1, y)) to(x - 1, y, x * P, cy);
        if (road(x, y + 1)) to(x, y + 1, cx, (y + 1) * P);
        if (road(x, y - 1)) to(x, y - 1, cx, y * P);
        g.beginPath();
        const corner = ends.length === 2 && ends[0][0] !== ends[1][0] && ends[0][1] !== ends[1][1];
        if (corner) {
          g.moveTo(ends[0][0], ends[0][1]);
          g.quadraticCurveTo(cx, cy, ends[1][0], ends[1][1]);
        } else if (ends.length) {
          for (const [ex, ey] of ends) {
            g.moveTo(cx, cy);
            g.lineTo(ex, ey);
          }
        } else {
          g.moveTo(cx - 2, cy);
          g.lineTo(cx + 2, cy);
        }
        g.stroke();
      }
    }
  }
}

function paintWater(g: CanvasRenderingContext2D, s: GameState, P: number, season: Season): void {
  const W = s.width * P;
  const H = s.height * P;
  const small = document.createElement('canvas');
  small.width = s.width;
  small.height = s.height;
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(s.width, s.height);
  let any = false;
  for (let i = 0; i < s.width * s.height; i++) {
    const v = s.terrain[i] === 1 ? 255 : 0;
    if (v) any = true;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  if (!any) return;
  sg.putImageData(img, 0, 0);
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const mg = mask.getContext('2d', { willReadFrequently: true })!;
  mg.imageSmoothingEnabled = true;
  mg.filter = `blur(${P * 0.4}px)`;
  // Smoothing blends between tile centres, so the shore cuts across corners.
  mg.drawImage(small, 0, 0, W, H);
  mg.filter = 'none';
  const m = mg.getImageData(0, 0, W, H).data;
  const out = mg.createImageData(W, H);
  const d = out.data;
  const winter = season === 3;
  const shallow = winter ? [176, 196, 210] : [86, 146, 184];
  const deep = winter ? [150, 172, 190] : [52, 104, 150];
  const sand = winter ? [232, 236, 232] : [216, 200, 144];
  const ramp = (a: number, b: number, v: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  for (let k = 0; k < W * H; k++) {
    const v = m[k * 4] / 255;
    if (v < 0.3) continue;
    const water = ramp(0.47, 0.53, v);
    const depth = ramp(0.55, 0.95, v);
    const o = k * 4;
    for (let c = 0; c < 3; c++) {
      const wc = shallow[c] + (deep[c] - shallow[c]) * depth;
      d[o + c] = sand[c] + (wc - sand[c]) * water;
    }
    // The rim fades into the grass on the land side.
    d[o + 3] = Math.round(255 * Math.max(water, ramp(0.3, 0.4, v)));
  }
  mg.putImageData(out, 0, 0);
  g.drawImage(mask, 0, 0);
}

/** Traces a zone's outline: its drawn shape, or its rectangle with round corners. */
function zonePath(g: CanvasRenderingContext2D, b: GameState['buildings'][number], P: number, inset: number): void {
  if (!b.shape) {
    roundRect(g, b.x * P + inset, b.y * P + inset, b.w * P - inset * 2, b.h * P - inset * 2, P * 0.5);
    return;
  }
  // Corners rounded a little, like a ploughman turning his team.
  const pts = b.shape.map(([x, y]) => [x * P, y * P] as [number, number]);
  const n = pts.length;
  const mid = (a: [number, number], c: [number, number]) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] as [number, number];
  g.beginPath();
  const m0 = mid(pts[n - 1], pts[0]);
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    g.arcTo(pts[i][0], pts[i][1], m[0], m[1], P * 0.6);
  }
  g.closePath();
}

/** Paints a zone on the ground: ploughed rows, grazing with a fence, orchard rows or a market square. */
function paintZone(g: CanvasRenderingContext2D, b: GameState['buildings'][number], P: number, season: Season): void {
  const snow = season === 3;
  const x0 = b.x * P;
  const y0 = b.y * P;
  const x1 = (b.x + b.w) * P;
  const y1 = (b.y + b.h) * P;
  g.save();
  zonePath(g, b, P, b.shape ? 0 : P * 0.12);
  if (b.type === 'field') {
    // A grassy headland, then the ploughed plot with its crop rows.
    g.fillStyle = snow ? '#cfd4d4' : '#7a5a3a';
    g.fill();
    g.clip();
    const crop = snow ? '#b8bebe' : b.growth > 0.05 ? (b.growth > 0.8 ? '#c8a848' : '#6a9a38') : '#5e4129';
    g.strokeStyle = crop;
    g.lineWidth = b.growth > 0.05 && !snow ? P / 6 : 1.5;
    for (let y = y0 + P / 8; y < y1; y += P / 4) {
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
    }
    g.restore();
    g.save();
    zonePath(g, b, P, b.shape ? 0 : P * 0.12);
    g.strokeStyle = snow ? 'rgba(200,206,208,0.8)' : 'rgba(110,140,60,0.7)';
    g.lineWidth = P * 0.18;
    g.stroke();
  } else if (b.type === 'pasture') {
    g.fillStyle = snow ? '#e4e8e8' : '#8cad4e';
    g.fill();
    g.clip();
    // Tufts and bare patches where the herd stands.
    const rand = mulberry32(b.id * 7919);
    for (let k = 0; k < (x1 - x0) * (y1 - y0) / (P * 2); k++) {
      g.fillStyle = rand() < 0.7 ? (snow ? 'rgba(255,255,255,0.5)' : 'rgba(70,110,40,0.35)') : 'rgba(150,120,80,0.25)';
      g.fillRect(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), P * 0.18, P * 0.1);
    }
    g.restore();
    g.save();
    zonePath(g, b, P, b.shape ? 0 : P * 0.12);
    // Post-and-rail fence round it.
    g.strokeStyle = '#7b5a36';
    g.lineWidth = P * 0.07;
    g.stroke();
    g.setLineDash([P * 0.08, P * 0.6]);
    g.lineWidth = P * 0.16;
    g.strokeStyle = '#5e4129';
    g.stroke();
  } else if (b.type === 'orchard') {
    g.fillStyle = snow ? 'rgba(230,236,238,0.6)' : 'rgba(80,110,40,0.3)';
    g.fill();
    g.clip();
    g.strokeStyle = snow ? 'rgba(200,206,208,0.6)' : 'rgba(150,170,80,0.45)';
    g.lineWidth = P * 0.3;
    for (let x = x0 + P / 2; x < x1; x += P) {
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
    }
  } else if (b.type === 'market') {
    // Packed earth with a cobbled edge.
    g.fillStyle = snow ? '#d6dadb' : '#b5a88e';
    g.fill();
    g.clip();
    g.strokeStyle = 'rgba(90,75,55,0.18)';
    g.lineWidth = 1;
    for (let x = x0; x < x1; x += P / 2) {
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
    }
    for (let y = y0; y < y1; y += P / 2) {
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
    }
    g.restore();
    g.save();
    zonePath(g, b, P, b.shape ? 0 : P * 0.05);
    g.strokeStyle = snow ? '#b8bec0' : '#8a7c62';
    g.lineWidth = P * 0.14;
    g.stroke();
  }
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export interface Town3D {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
}

/** Builds the scene for a town; trees are placed within `radius` tiles of the centre. */
export function buildTown(s: GameState, center: { x: number; y: number }, radius = 30): Town3D {
  const season = seasonOf(s.day);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(season === 3 ? '#dfe6ea' : '#a9c7d8');

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), new THREE.MeshLambertMaterial({ map: groundTexture(s, season) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(s.width / 2, 0, s.height / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Soft sky light and a low sun from the front left, like the painted art.
  scene.add(new THREE.HemisphereLight('#fff6e0', '#5a6a40', 1.1));
  const sun = new THREE.DirectionalLight('#fff2d8', 1.9);
  sun.position.set(center.x - 18, 34, center.y + 30);
  sun.target.position.set(center.x, 0, center.y);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -radius;
  sc.right = radius;
  sc.top = radius;
  sc.bottom = -radius;
  sc.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    if (d.zone || b.type === 'wall') continue;
    const model = buildingModel(b.type, b.level, season, 0).clone();
    model.position.set(b.x, 0, b.y);
    // Building sites rise as the work goes on.
    if (b.build < 1) model.scale.y = Math.max(0.15, b.build);
    scene.add(model);
  }

  // Trees: the painted sprites, standing upright and always facing the camera.
  for (let y = Math.max(0, Math.floor(center.y - radius)); y < Math.min(s.height, center.y + radius); y++) {
    for (let x = Math.max(0, Math.floor(center.x - radius)); x < Math.min(s.width, center.x + radius); x++) {
      const i = y * s.width + x;
      const n = s.trees[i];
      if (!n) continue;
      const v = s.variant[i];
      const kind: TreeKind = v % 9 < 4 ? 'pine' : v % 9 < 8 ? 'oak' : 'birch';
      for (let k = 0; k < Math.min(n, 3); k++) {
        const t = treeTexture(k === 1 && v % 2 ? 'birch' : kind, season, (v + k * 3) % 6);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, alphaTest: 0.4 }));
        // Sprite pixels to world units: 45.25 px per unit across the screen.
        const ppu = 45.25;
        sprite.scale.set(t.w / ppu, t.h / ppu, 1);
        sprite.center.set(t.ax / t.w, 1 - t.ay / t.h);
        const jx = [0.3, 0.7, 0.5][k];
        const jy = [0.35, 0.45, 0.75][k];
        sprite.position.set(x + jx, 0, y + jy);
        scene.add(sprite);
      }
    }
  }
  return { scene, sun };
}

/**
 * An orthographic camera at the game's isometric angle (30° up, 45° round),
 * so the 3D view lines up with the flat one: `zoom` 1 is 45.25 px per tile.
 */
export function isoCamera(width: number, height: number, target: { x: number; y: number }, zoom: number, turn = 0): THREE.OrthographicCamera {
  const ppu = (64 / Math.SQRT2) * zoom;
  const cam = new THREE.OrthographicCamera(-width / 2 / ppu, width / 2 / ppu, height / 2 / ppu, -height / 2 / ppu, 0.1, 400);
  const dist = 120;
  const az = Math.PI / 4 + turn;
  const el = Math.PI / 6;
  cam.position.set(target.x + dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), target.y + dist * Math.cos(el) * Math.cos(az));
  cam.lookAt(target.x, 0, target.y);
  return cam;
}

// ---------------------------------------------------------------- town walls

const WALL_STONE = '#b5ac9b';
const WALL_TOP = '#cdc4b3';
const WALL_H = 24;
const wallModels = new Map<string, THREE.Group>();

function wallPiece(key: string, draw: (p: Pen3D) => void, snow: boolean): THREE.Group {
  const k = `${key}:${snow}`;
  let m = wallModels.get(k);
  if (!m) {
    const p = new Pen3D();
    p.snow = snow;
    draw(p);
    m = p.build();
    wallModels.set(k, m);
  }
  return m;
}

/** A stretch of wall `len` tiles long along +x, with merlons along the top. */
function wallSegment(len: number, snow: boolean): THREE.Group {
  const q = Math.max(1, Math.round(len * 20));
  return wallPiece(`seg:${q}`, (p) => {
    const l = q / 20;
    p.box(0, -0.16, l, 0.16, 0, WALL_H, WALL_STONE, WALL_TOP, 'stone');
    for (let x = 0.04; x + 0.12 <= l; x += 0.3) p.box(x, -0.16, x + 0.13, 0.16, WALL_H, 5, WALL_STONE, WALL_TOP, 'stone');
  }, snow);
}

/** A round-cornered tower at a bend or an end of the wall, with a slate cap. */
function wallTower(snow: boolean): THREE.Group {
  return wallPiece('tower', (p) => {
    p.box(-0.3, -0.3, 0.3, 0.3, 0, WALL_H + 14, WALL_STONE, WALL_TOP, 'stone');
    p.roofPyramid(-0.3, -0.3, 0.3, 0.3, WALL_H + 14, 20, 'slate', 0.06);
  }, snow);
}

/** A gatehouse over a road: an arch between two short towers, along +x. */
function wallGate(snow: boolean): THREE.Group {
  return wallPiece('gate', (p) => {
    for (const x of [-0.62, 0.32]) {
      p.box(x, -0.26, x + 0.3, 0.26, 0, WALL_H + 10, WALL_STONE, WALL_TOP, 'stone');
      p.roofPyramid(x, -0.26, x + 0.3, 0.26, WALL_H + 10, 14, 'slate', 0.05);
    }
    p.box(-0.32, -0.2, 0.32, 0.2, WALL_H - 6, 8, WALL_STONE, WALL_TOP, 'stone');
  }, snow);
}

function placeAlong(m: THREE.Group, ax: number, ay: number, bx: number, by: number, lift = 1): THREE.Object3D {
  const o = m.clone();
  o.position.set(ax, 0, ay);
  o.rotation.y = -Math.atan2(by - ay, bx - ax);
  o.scale.y = lift;
  return o;
}

/**
 * The town walls in 3D: walls laid on the grid join from tile centre to
 * tile centre, walls laid as curves follow their curve; towers stand at
 * ends and bends, gatehouses where a wall crosses a road. Unfinished
 * sections show as low courses.
 */
export function wallsModel(s: GameState, season: Season): THREE.Group {
  const g = new THREE.Group();
  const snow = season === 3;
  const W = s.width;
  const wallAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= s.height) return null;
    const id = s.occ[y * W + x];
    const b = id >= 0 ? s.buildings.find((o) => o.id === id) : undefined;
    return b?.type === 'wall' ? b : null;
  };
  const lift = (b: { build: number } | null) => (b && b.build >= 1 ? 1 : 0.3);
  const curved = new Set<number>();
  for (const cv of s.wallCurves ?? []) for (const i of cv.tiles) curved.add(i);
  // Walls along curves.
  for (const cv of s.wallCurves ?? []) {
    const pts = curveSamples(cv.pts, 0.3);
    let inGate = false;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      const mx = Math.floor((ax + bx) / 2);
      const my = Math.floor((ay + by) / 2);
      const w = wallAt(mx, my);
      const road = mx >= 0 && my >= 0 && mx < W && my < s.height && s.road[my * W + mx] > 0;
      if (road && !inGate) g.add(placeAlong(wallGate(snow), (ax + bx) / 2, (ay + by) / 2, bx, by));
      inGate = road;
      if (w) g.add(placeAlong(wallSegment(Math.hypot(bx - ax, by - ay) + 0.02, snow), ax, ay, bx, by, lift(w)));
    }
    const [sx, sy] = pts[0];
    const [ex, ey] = pts[pts.length - 1];
    if (wallAt(Math.floor(sx), Math.floor(sy))) g.add(placeAlong(wallTower(snow), sx, sy, sx + 1, sy));
    if (wallAt(Math.floor(ex), Math.floor(ey))) g.add(placeAlong(wallTower(snow), ex, ey, ex + 1, ey));
  }
  // Walls on the grid.
  for (const b of s.buildings) {
    if (b.type !== 'wall' || curved.has(b.y * W + b.x)) continue;
    const cx = b.x + 0.5;
    const cy = b.y + 0.5;
    const n: [number, number][] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const o = wallAt(b.x + dx, b.y + dy);
      if (o && !curved.has((b.y + dy) * W + b.x + dx)) {
        n.push([dx, dy]);
        // Each joint once: to the right and downwards.
        if (dx > 0 || dy > 0) g.add(placeAlong(wallSegment(1, snow), cx, cy, cx + dx, cy + dy, Math.min(lift(b), lift(o))));
      }
      // A road with wall beyond it: a gate across it.
      const rx = b.x + dx;
      const ry = b.y + dy;
      if ((dx > 0 || dy > 0) && rx < W && ry < s.height && s.road[ry * W + rx] > 0 && wallAt(b.x + 2 * dx, b.y + 2 * dy)) {
        g.add(placeAlong(wallGate(snow), rx + 0.5, ry + 0.5, rx + 0.5 + dx, ry + 0.5 + dy));
        g.add(placeAlong(wallSegment(0.5, snow), cx, cy, cx + dx * 0.5, cy + dy * 0.5, lift(b)));
        const far = wallAt(b.x + 2 * dx, b.y + 2 * dy)!;
        g.add(placeAlong(wallSegment(0.5, snow), cx + dx * 1.5, cy + dy * 1.5, cx + dx * 2, cy + dy * 2, lift(far)));
      }
    }
    // Towers at ends and corners, and every sixth section along a run.
    const straight = n.length === 2 && n[0][0] === -n[1][0] && n[0][1] === -n[1][1];
    if (b.build >= 1 && (!straight || (b.x + b.y) % 6 === 0)) g.add(placeAlong(wallTower(snow), cx, cy, cx + 1, cy));
    if (!n.length) g.add(placeAlong(wallSegment(0.6, snow), cx - 0.3, cy, cx + 0.3, cy, lift(b)));
  }
  return g;
}
