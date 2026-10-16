import * as THREE from 'three';
import { BUILDINGS } from '../game/data';
import { seasonOf } from '../game/sim';
import type { GameState, Season } from '../game/types';
import { drawBuilding, treeSprite, wallMaterial } from '../render/sprites';
import type { TreeKind } from '../render/sprites';
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

/** The ground as one texture, a few pixels per tile, painted from the map. */
function groundTexture(s: GameState, season: Season): THREE.CanvasTexture {
  const P = 8;
  const c = document.createElement('canvas');
  c.width = s.width * P;
  c.height = s.height * P;
  const g = c.getContext('2d')!;
  const grass = season === 3 ? ['#dfe5e3', '#d6dcda', '#e8ecea'] : season === 2 ? ['#a8a24a', '#9b9845', '#b3ab55'] : ['#7fae4a', '#73a444', '#8ab955'];
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const i = y * s.width + x;
      if (s.terrain[i] === 1) g.fillStyle = season === 3 ? '#9fb6c8' : '#4d86b0';
      else g.fillStyle = grass[Math.min(2, Math.floor(s.fertility[i] * 3))];
      g.fillRect(x * P, y * P, P, P);
      if (s.terrain[i] !== 1) {
        // A few darker and lighter flecks so the grass is not flat.
        g.fillStyle = 'rgba(40,60,20,0.12)';
        g.fillRect(x * P + (s.variant[i] % 6), y * P + ((s.variant[i] >> 3) % 6), 2, 2);
      }
      if (s.road[i]) {
        g.fillStyle = s.road[i] === 2 ? '#a39b8c' : season === 3 ? '#cfc6b8' : '#a88a5c';
        g.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);
        // Join to road neighbours so roads read as bands.
        if (x + 1 < s.width && s.road[i + 1]) g.fillRect(x * P + P - 1, y * P + 1, 2, P - 2);
        if (y + 1 < s.height && s.road[i + s.width]) g.fillRect(x * P + 1, y * P + P - 1, P - 2, 2);
      }
    }
  }
  // Fields and pastures as coloured plots.
  for (const b of s.buildings) {
    if (b.type === 'field') {
      g.fillStyle = season === 3 ? '#cfd4d4' : b.growth > 0.3 ? '#6e9a3a' : '#7a5a3a';
      g.fillRect(b.x * P + 1, b.y * P + 1, b.w * P - 2, b.h * P - 2);
      g.strokeStyle = 'rgba(60,40,20,0.35)';
      for (let r = 0; r < b.h * 4; r++) {
        g.beginPath();
        g.moveTo(b.x * P + 2, b.y * P + (r + 0.5) * (P / 4));
        g.lineTo((b.x + b.w) * P - 2, b.y * P + (r + 0.5) * (P / 4));
        g.stroke();
      }
    } else if (b.type === 'pasture') {
      g.fillStyle = 'rgba(150,180,70,0.35)';
      g.fillRect(b.x * P, b.y * P, b.w * P, b.h * P);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
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
