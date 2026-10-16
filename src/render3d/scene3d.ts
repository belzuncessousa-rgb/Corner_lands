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
      sg.fillStyle = s.terrain[i] === 1 ? (season === 3 ? '#a3b9ca' : '#4a83ad') : mixHex(lush[0], lush[1], 1 - s.fertility[i]);
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
  // Sandy shores where land meets water, and ripples on the water.
  g.lineCap = 'round';
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const i = y * s.width + x;
      if (s.terrain[i] !== 1) continue;
      const land = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < s.width && yy < s.height && s.terrain[yy * s.width + xx] !== 1;
      g.strokeStyle = season === 3 ? '#e8ece8' : '#d8c890';
      g.lineWidth = P * 0.28;
      const edge = (ax: number, ay: number, bx: number, by: number) => {
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      };
      if (land(x - 1, y)) edge(x * P, y * P, x * P, (y + 1) * P);
      if (land(x + 1, y)) edge((x + 1) * P, y * P, (x + 1) * P, (y + 1) * P);
      if (land(x, y - 1)) edge(x * P, y * P, (x + 1) * P, y * P);
      if (land(x, y + 1)) edge(x * P, (y + 1) * P, (x + 1) * P, (y + 1) * P);
      if (season !== 3 && rand() < 0.3) {
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.lineWidth = 1;
        edge(x * P + rand() * P * 0.6, y * P + rand() * P, x * P + P * 0.4 + rand() * P * 0.6, y * P + rand() * P);
      }
    }
  }
  // Fields: ploughed plots with crop rows.
  for (const b of s.buildings) {
    if (b.type !== 'field') continue;
    g.fillStyle = season === 3 ? '#cfd4d4' : '#7a5a3a';
    roundRect(g, b.x * P + P * 0.12, b.y * P + P * 0.12, b.w * P - P * 0.24, b.h * P - P * 0.24, P * 0.5);
    g.fill();
    const crop = season === 3 ? '#b8bebe' : b.growth > 0.05 ? (b.growth > 0.8 ? '#c8a848' : '#6a9a38') : '#5e4129';
    g.strokeStyle = crop;
    g.lineWidth = b.growth > 0.05 && season !== 3 ? P / 6 : 1.5;
    for (let r = 0; r < b.h * 4; r++) {
      const y = b.y * P + (r + 0.5) * (P / 4);
      const edgeR = Math.min(r + 0.5, b.h * 4 - r - 0.5) / 4;
      const cut = edgeR < 0.45 ? (0.45 - edgeR) * P : 0;
      g.beginPath();
      g.moveTo(b.x * P + P * 0.3 + cut, y);
      g.lineTo((b.x + b.w) * P - P * 0.3 - cut, y);
      g.stroke();
    }
  }
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
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
