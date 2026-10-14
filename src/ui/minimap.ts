import { BUILDINGS } from '../game/data';
import { seasonOf } from '../game/sim';
import type { Category, GameState } from '../game/types';
import type { Renderer } from '../render/renderer';

const CAT_COLORS: Record<Category, [number, number, number]> = {
  housing: [214, 170, 96],
  resources: [150, 100, 60],
  farming: [200, 176, 90],
  food: [222, 196, 90],
  industry: [130, 120, 130],
  civic: [180, 60, 50],
  decor: [220, 120, 170],
};

/** Small overview map; click or drag on it to move the camera. */
export class Minimap {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tiles: HTMLCanvasElement;
  private timer = 0;
  private dragging = false;
  readonly size = 184;
  private k = 0;
  private dpr = 1;

  constructor(
    parent: HTMLElement,
    private renderer: Renderer,
    private getState: () => GameState,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.className = 'panel';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = this.size * dpr;
    this.canvas.height = (this.size / 2 + 8) * dpr;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size / 2 + 8}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.tiles = document.createElement('canvas');
    parent.appendChild(this.canvas);
    const move = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const [tx, ty] = this.toTile(e.clientX - r.left, e.clientY - r.top);
      this.renderer.centerOn(tx, ty);
      this.renderer.clampCamera(this.getState());
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      move(e);
    });
    this.canvas.addEventListener('pointermove', (e) => this.dragging && move(e));
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
  }

  private toTile(mx: number, my: number): [number, number] {
    const k = this.k;
    const a = (mx - this.size / 2) / k;
    const b = (my - 4) / (k / 2);
    return [(a + b) / 2, (b - a) / 2];
  }

  private redrawTiles(s: GameState): void {
    const W = s.width;
    const H = s.height;
    if (this.tiles.width !== W) {
      this.tiles.width = W;
      this.tiles.height = H;
    }
    const tctx = this.tiles.getContext('2d')!;
    const img = tctx.createImageData(W, H);
    const winter = seasonOf(s.day) === 3;
    const owner = new Map<number, Category>();
    for (const b of s.buildings) owner.set(b.id, BUILDINGS[b.type].category);
    for (let i = 0; i < W * H; i++) {
      let c: [number, number, number];
      if (s.terrain[i] === 1) c = winter ? [150, 180, 196] : [64, 122, 156];
      else if (s.occ[i] >= 0) c = CAT_COLORS[owner.get(s.occ[i]) ?? 'civic'];
      else if (s.road[i]) c = [170, 140, 96];
      else if (s.rock[i]) c = [150, 148, 140];
      else if (s.ore[i]) c = [120, 90, 70];
      else if (s.trees[i]) c = winter ? [70, 100, 80] : [46, 92 + s.trees[i] * 4, 46];
      else c = winter ? [222, 228, 232] : [128, 166, 74];
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
  }

  update(dt: number): void {
    const s = this.getState();
    this.timer -= dt;
    if (this.timer <= 0) {
      this.redrawTiles(s);
      this.timer = 1;
    }
    const c = this.ctx;
    const size = this.size;
    this.k = size / (s.width + s.height);
    const k = this.k;
    c.clearRect(0, 0, size, size);
    c.save();
    c.imageSmoothingEnabled = false;
    // Map tile (x, y) to the isometric diamond.
    const d = this.dpr;
    c.setTransform(d * k, d * (k / 2), -d * k, d * (k / 2), d * (size / 2), d * 4);
    c.drawImage(this.tiles, 0, 0);
    c.restore();
    // Viewport outline.
    const r = this.renderer;
    const corners = [
      [0, 0],
      [r.width, 0],
      [r.width, r.height],
      [0, r.height],
    ].map(([sx, sy]) => {
      const [tx, ty] = r.screenToTile(sx, sy);
      return [(tx - ty) * k + size / 2, (tx + ty) * (k / 2) + 4];
    });
    c.strokeStyle = '#fff6dc';
    c.lineWidth = 1.5;
    c.beginPath();
    corners.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.stroke();
  }
}
