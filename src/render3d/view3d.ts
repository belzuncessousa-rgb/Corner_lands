import * as THREE from 'three';
import { BUILDINGS } from '../game/data';
import { hasCharter } from '../game/charters';
import { monthOf, orchardMaturity, seasonOf } from '../game/sim';
import type { Building, GameState, Season } from '../game/types';
import { TREE_SLOTS, variantOf } from '../render/renderer';
import { bushSprite, fruitTreeSprite, rockSprite, treeSprite } from '../render/sprites';
import type { Sprite, TreeKind } from '../render/sprites';
import { buildingModel, groundTexture } from './scene3d';

/**
 * A building's model where it stands: on its grid rectangle, or for a freely
 * placed building turned about its centre (the model is drawn from 0..w).
 */
export function placedModel(type: Building['type'], level: number, season: Season, variant: number, at: { x: number; y: number; cx?: number; cy?: number; rot?: number }): THREE.Object3D {
  const model = buildingModel(type, level, season, variant).clone();
  if (at.rot === undefined || at.cx === undefined || at.cy === undefined) {
    model.position.set(at.x, 0, at.y);
    return model;
  }
  const d = BUILDINGS[type];
  model.position.set(-d.w / 2, 0, -d.h / 2);
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.position.set(at.cx, 0, at.cy);
  pivot.rotation.y = -at.rot;
  return pivot;
}

/** Screen pixels per world unit across the view at zoom 1 (a tile edge). */
const PPU = 64 / Math.SQRT2;

/**
 * Painted sprites standing in the 3D world, always turned to the camera:
 * one instanced mesh per sprite, one draw call however many there are.
 */
class Billboards {
  private groups = new Map<string, { sp: Sprite; pos: number[]; mesh?: THREE.InstancedMesh }>();
  readonly root = new THREE.Group();

  begin(): void {
    for (const g of this.groups.values()) g.pos.length = 0;
  }

  add(key: string, make: () => Sprite, x: number, y: number): void {
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = { sp: make(), pos: [] }));
    g.pos.push(x, y);
  }

  end(): void {
    for (const [key, g] of this.groups) {
      if (g.mesh) {
        this.root.remove(g.mesh);
        g.mesh.dispose();
        g.mesh = undefined;
      }
      if (!g.pos.length) {
        this.groups.delete(key);
        continue;
      }
      const n = g.pos.length / 2;
      const mesh = new THREE.InstancedMesh(PLANE, material(g.sp), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        m.makeTranslation(g.pos[i * 2], 0, g.pos[i * 2 + 1]);
        mesh.setMatrixAt(i, m);
      }
      mesh.frustumCulled = false;
      this.root.add(mesh);
      g.mesh = mesh;
    }
  }
}

/**
 * Billboards that move every frame (villagers, carts, deer): meshes keep
 * their capacity and only their positions and counts change.
 */
class MovingBillboards {
  private groups = new Map<Sprite, { mesh: THREE.InstancedMesh; n: number; idle: number }>();
  readonly root = new THREE.Group();
  private m = new THREE.Matrix4();

  begin(): void {
    for (const g of this.groups.values()) g.n = 0;
  }

  add(sp: Sprite, x: number, y: number): void {
    let g = this.groups.get(sp);
    if (!g || g.n >= g.mesh.instanceMatrix.count) {
      const cap = Math.max(8, (g?.mesh.instanceMatrix.count ?? 4) * 2);
      const mesh = new THREE.InstancedMesh(PLANE, material(sp), cap);
      mesh.frustumCulled = false;
      if (g) {
        for (let i = 0; i < g.n; i++) {
          g.mesh.getMatrixAt(i, this.m);
          mesh.setMatrixAt(i, this.m);
        }
        this.root.remove(g.mesh);
        g.mesh.dispose();
      }
      this.root.add(mesh);
      g = { mesh, n: g?.n ?? 0, idle: 0 };
      this.groups.set(sp, g);
    }
    this.m.makeTranslation(x, 0, y);
    g.mesh.setMatrixAt(g.n++, this.m);
  }

  end(): void {
    for (const [sp, g] of this.groups) {
      g.mesh.count = g.n;
      g.mesh.instanceMatrix.needsUpdate = true;
      g.idle = g.n ? 0 : g.idle + 1;
      // Poses unused for a while are let go.
      if (g.idle > 120) {
        this.root.remove(g.mesh);
        g.mesh.dispose();
        this.groups.delete(sp);
      }
    }
  }
}

const PLANE = new THREE.PlaneGeometry(1, 1);
const spriteMats = new WeakMap<Sprite, THREE.ShaderMaterial>();

/** A camera-facing material for a sprite, anchored where the flat view anchors it. */
function material(sp: Sprite): THREE.ShaderMaterial {
  let m = spriteMats.get(sp);
  if (m) return m;
  const tex = new THREE.CanvasTexture(sp.canvas);
  tex.colorSpace = THREE.NoColorSpace;
  m = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      uSize: { value: new THREE.Vector2(sp.w / PPU, sp.h / PPU) },
      uAnchor: { value: new THREE.Vector2(sp.ax / sp.w, 1 - sp.ay / sp.h) },
    },
    vertexShader: `
      uniform vec2 uSize;
      uniform vec2 uAnchor;
      varying vec2 vUv;
      void main() {
        vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec2 q = (uv - uAnchor) * uSize;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(base.xyz + right * q.x + up * q.y, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        gl_FragColor = vec4(c.rgb, 1.0);
      }`,
  });
  spriteMats.set(sp, m);
  return m;
}

/**
 * The town in 3D, drawn under the flat canvas, which keeps drawing the
 * villagers, overlays and weather on top. Follows the flat view's camera
 * exactly, so clicks land on the same tiles.
 */
export class View3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private ground: THREE.Mesh;
  private groundKey = '';
  private objectsKey = '';
  private buildings = new Map<number, { key: string; obj: THREE.Object3D }>();
  private billboards = new Billboards();
  private moving = new MovingBillboards();
  private sprites = new Map<string, Sprite>();
  private seed = -1;
  private ghost: { key: string; obj: THREE.Object3D } | null = null;

  /** The building being placed, see-through, green where it fits and red where not. */
  setGhost(g: { type: Building['type']; cx: number; cy: number; rot: number; ok: boolean } | null, season: Season): void {
    const key = g ? `${g.type}:${g.cx.toFixed(2)}:${g.cy.toFixed(2)}:${g.rot.toFixed(3)}:${g.ok}:${season}` : '';
    if (this.ghost?.key === key) return;
    if (this.ghost) this.scene.remove(this.ghost.obj);
    this.ghost = null;
    if (!g) return;
    const obj = placedModel(g.type, 1, season, 0, { x: 0, y: 0, cx: g.cx, cy: g.cy, rot: g.rot });
    const tint = new THREE.MeshBasicMaterial({ color: g.ok ? '#7fe07a' : '#e05a4a', transparent: true, opacity: 0.55, depthWrite: false });
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).material = tint;
        o.castShadow = false;
      }
    });
    this.scene.add(obj);
    this.ghost = { key, obj };
  }

  constructor(under: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game3d';
    under.parentElement!.insertBefore(this.canvas, under);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight('#fff6e0', '#5a6a40', 1.1));
    this.sun = new THREE.DirectionalLight('#fff2d8', 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial());
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground, this.billboards.root, this.moving.root);
  }

  set visible(on: boolean) {
    this.canvas.style.display = on ? 'block' : 'none';
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }

  /** Draws the town as the flat camera (centre in iso pixels, zoom) sees it. */
  render(
    s: GameState,
    cam: { x: number; y: number; zoom: number },
    width: number,
    height: number,
    dpr: number,
    figures: { sprite: Sprite; x: number; y: number }[] = [],
  ): void {
    if (this.seed !== s.seed) this.reset(s);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
    }
    const season = seasonOf(s.day);
    this.syncGround(s, season);
    this.syncBuildings(s, season);
    this.syncObjects(s, season);
    this.moving.begin();
    for (const f of figures) this.moving.add(f.sprite, f.x, f.y);
    this.moving.end();
    // The camera centre, from iso pixels back to the tile plane.
    const a = cam.x / 32;
    const b = cam.y / 16;
    const tx = (a + b) / 2;
    const ty = (b - a) / 2;
    const ppu = PPU * cam.zoom;
    const camera = new THREE.OrthographicCamera(-width / 2 / ppu, width / 2 / ppu, height / 2 / ppu, -height / 2 / ppu, 0.1, 600);
    const el = Math.PI / 6;
    const dist = 200;
    camera.position.set(tx + dist * Math.cos(el) * Math.SQRT1_2, dist * Math.sin(el), ty + dist * Math.cos(el) * Math.SQRT1_2);
    camera.lookAt(tx, 0, ty);
    // The sun follows the view, with its shadows covering what is on screen.
    const reach = Math.min(70, Math.max(width, height) / ppu);
    this.sun.position.set(tx - 18, 34, ty + 30);
    this.sun.target.position.set(tx, 0, ty);
    const sc = this.sun.shadow.camera;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach;
    sc.bottom = -reach;
    sc.far = 160;
    sc.updateProjectionMatrix();
    this.scene.background = new THREE.Color(season === 3 ? '#9fb0b8' : '#5f7d4a');
    this.renderer.render(this.scene, camera);
  }

  private reset(s: GameState): void {
    this.seed = s.seed;
    for (const { obj } of this.buildings.values()) this.scene.remove(obj);
    this.buildings.clear();
    this.groundKey = '';
    this.objectsKey = '';
    this.ground.scale.set(s.width, s.height, 1);
    this.ground.position.set(s.width / 2, 0, s.height / 2);
  }

  /** Repaints the ground when roads, fields or the season change. */
  private syncGround(s: GameState, season: Season): void {
    let roads = 0;
    for (let i = 0; i < s.road.length; i++) if (s.road[i]) roads = (roads * 31 + i * s.road[i]) >>> 0;
    const fields = s.buildings
      .filter((b) => BUILDINGS[b.type].zone)
      .map((b) => `${b.id}:${b.x}:${b.y}:${b.w}:${b.h}:${b.shape?.length ?? 0}:${Math.round(b.growth * 5)}`)
      .join();
    const key = `${season}:${roads}:${fields}:${(s.curves ?? []).length}:${(s.curves ?? []).map((c) => c.pts.length).join()}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const mat = this.ground.material as THREE.MeshLambertMaterial;
    mat.map?.dispose();
    mat.map = groundTexture(s, season);
    mat.needsUpdate = true;
  }

  /** Adds, removes and rebuilds building models as the town changes. */
  private syncBuildings(s: GameState, season: Season): void {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      const d = BUILDINGS[b.type];
      if (d.zone || b.type === 'wall') continue;
      seen.add(b.id);
      const key = `${b.type}:${b.level}:${season}:${variantOf(s, b)}:${b.build >= 1 ? 1 : Math.ceil(b.build * 6)}:${b.x}:${b.y}:${b.rot ?? ''}`;
      const cur = this.buildings.get(b.id);
      if (cur?.key === key) continue;
      if (cur) this.scene.remove(cur.obj);
      const obj = placedModel(b.type, b.level, season, variantOf(s, b), b);
      // Building sites rise as the work goes on.
      if (b.build < 1) obj.scale.y = Math.max(0.12, Math.ceil(b.build * 6) / 6);
      this.scene.add(obj);
      this.buildings.set(b.id, { key, obj });
    }
    for (const [id, cur] of this.buildings) {
      if (seen.has(id)) continue;
      this.scene.remove(cur.obj);
      this.buildings.delete(id);
    }
  }

  private sprite(key: string, make: () => Sprite): Sprite {
    let sp = this.sprites.get(key);
    if (!sp) this.sprites.set(key, (sp = make()));
    return sp;
  }

  /** Trees, rocks, bushes and orchard trees: rebuilt when any of them change. */
  private syncObjects(s: GameState, season: Season): void {
    let sum = season * 7919;
    for (let i = 0; i < s.trees.length; i++) sum = (sum * 31 + s.trees[i] * 7 + s.rock[i] * 3 + (s.berries[i] > 0 ? 1 : 0)) >>> 0;
    const orchards = s.buildings.filter((b) => b.type === 'orchard');
    const month = monthOf(s.day);
    const key = `${sum}:${month}:${orchards.map((o) => `${o.id}:${Math.round(o.growth * 4)}`).join()}`;
    if (key === this.objectsKey) return;
    this.objectsKey = key;
    const bb = this.billboards;
    bb.begin();
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const i = y * s.width + x;
        const v = s.variant[i];
        if (s.rock[i] || s.ore[i]) {
          const ore = s.ore[i] > 0;
          const rv = v % 4;
          bb.add(`k:${ore}:${rv}:${season === 3}`, () => this.sprite(`k:${ore}:${rv}:${season === 3}`, () => rockSprite(ore, rv, season === 3 ? 3 : 0)), x + 0.5, y + 0.5);
        }
        if (s.berriesMax[i] && !s.trees[i]) {
          const has = s.berries[i] > 0;
          const bv = v % 3;
          const k = `u:${has}:${season}:${bv}`;
          bb.add(k, () => this.sprite(k, () => bushSprite(has, season, bv)), x + 0.5, y + 0.5);
        }
        const n = s.trees[i];
        if (n) {
          const kind: TreeKind = v % 9 < 4 ? 'pine' : v % 9 < 8 ? 'oak' : 'birch';
          const mixBirch = kind === 'oak' && v % 2 === 1;
          const slots = TREE_SLOTS[Math.min(n, 4) - 1];
          for (let k = 0; k < slots.length; k++) {
            const tv = (v + k * 3) % 6;
            const kk: TreeKind = k === 1 && mixBirch ? 'birch' : kind;
            const key2 = `t:${kk}:${season}:${tv}`;
            bb.add(key2, () => this.sprite(key2, () => treeSprite(kk, season, tv)), x + slots[k][0], y + slots[k][1]);
          }
        }
      }
    }
    for (const o of orchards) {
      const fruit = o.recipe ?? 'apples';
      const stage = Math.round(orchardMaturity(o, hasCharter(s, 'orchard2')) * 4) / 4;
      const fruiting = stage >= 1 && month >= 3 && month <= 6 && (month < 5 || o.growth > 0);
      const blossom = month <= 1 && stage >= 0.5;
      const k = `ft:${fruit}:${season}:${stage}:${fruiting}:${blossom}`;
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) bb.add(k, () => this.sprite(k, () => fruitTreeSprite(fruit, season, stage, fruiting, blossom)), x + 0.5, y + 0.5);
    }
    bb.end();
  }
}

export type { Building };
