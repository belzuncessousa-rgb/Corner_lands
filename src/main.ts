import './ui/styles.css';
import { listSaves, loadGame, saveGame } from './api';
import { BUILDINGS, BUILD_ORDER, MONTH_NAMES, TIERS } from './game/data';
import { deserialize, serialize } from './game/save';
import {
  buildRoad,
  bCenter,
  centerOf,
  demolish,
  log,
  monthOf,
  placeOrder,
  placementError,
  recompute,
  removeRoad,
  resourceInRange,
  roadError,
  stepDay,
  updateHappiness,
  yearOf,
} from './game/sim';
import type { BuildingType, GameState } from './game/types';
import { FOOD_IDS } from './game/types';
import { generateWorld, idx, inBounds } from './game/world';
import { AgentSystem } from './render/agents';
import { Wildlife } from './render/wildlife';
import { type Overlay, Renderer } from './render/renderer';
import { Hud } from './ui/hud';

export type Tool = { kind: 'select' } | { kind: 'build'; type: BuildingType } | { kind: 'road' } | { kind: 'demolish' };

/** Real seconds per game day at 1x speed. */
const DAY_SECONDS = 1.5;
const SPEEDS = [0, 1, 2, 4];

export class Game {
  state: GameState;
  renderer: Renderer;
  agents = new AgentSystem();
  wildlife = new Wildlife();
  hud: Hud;
  tool: Tool = { kind: 'select' };
  selected: number | null = null;
  speedIndex = 1;
  /** Speed to resume to after a pause. */
  lastSpeed = 1;
  modalOpen = false;
  hoverTile: { x: number; y: number } | null = null;
  private simAcc = 0;
  private lastTime = performance.now();
  private hudTimer = 0;
  private lastMonth = -1;
  private canvas: HTMLCanvasElement;

  // Pointer state.
  private pointers = new Map<number, { x: number; y: number }>();
  private dragFrom: { x: number; y: number; camX: number; camY: number; button: number } | null = null;
  private moved = false;
  private dragTile: { x: number; y: number } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private keys = new Set<string>();

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas);
    this.state = generateWorld(Math.floor(Math.random() * 1e9));
    this.hud = new Hud(this, document.getElementById('ui')!);
    this.renderer.resize();
    this.resetView();
    this.bindInput();
    window.addEventListener('resize', () => this.renderer.resize());
    requestAnimationFrame((t) => this.frame(t));
    this.hud.showMainMenu();
  }

  // ---------------------------------------------------------------- game lifecycle

  get speed(): number {
    return SPEEDS[this.speedIndex];
  }

  setSpeed(i: number): void {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    if (this.speedIndex > 0) this.lastSpeed = this.speedIndex;
    this.hud.update();
  }

  togglePause(): void {
    this.setSpeed(this.speedIndex === 0 ? this.lastSpeed : 0);
  }

  newGame(seed: number): void {
    this.state = generateWorld(seed);
    recompute(this.state);
    // Show a meaningful happiness breakdown from the very first day.
    this.state.report.variety = FOOD_IDS.filter((f) => this.state.res[f] > 0).length;
    updateHappiness(this.state);
    log(this.state, 'Your settlers have arrived at a quiet corner of the land. Build houses and gather food!', 'info');
    this.afterLoad();
  }

  private afterLoad(): void {
    this.agents.reset();
    this.wildlife.reset();
    this.selected = null;
    this.tool = { kind: 'select' };
    this.simAcc = 0;
    this.lastMonth = monthOf(this.state.day);
    recompute(this.state);
    this.resetView();
    this.hud.rebuild();
  }

  private resetView(): void {
    const hall = this.state.buildings.find((b) => b.type === 'townhall');
    const c = hall ? bCenter(hall) : { x: this.state.width / 2, y: this.state.height / 2 };
    this.renderer.centerOn(c.x, c.y + 2);
    this.renderer.cam.zoom = window.innerWidth < 700 ? 0.8 : 1.1;
  }

  summary(): string {
    const s = this.state;
    return `${TIERS[s.tier].name} · ${s.population} villagers · Year ${yearOf(s.day)}, ${MONTH_NAMES[monthOf(s.day)]}`;
  }

  async save(slot: string): Promise<string> {
    const where = await saveGame(slot, serialize(this.state), this.summary());
    return where;
  }

  async load(slot: string, where: 'server' | 'local'): Promise<void> {
    const data = await loadGame(slot, where);
    this.state = deserialize(data);
    this.afterLoad();
  }

  async hasAutosave(): Promise<boolean> {
    return (await listSaves()).some((s) => s.slot === 'autosave');
  }

  // ---------------------------------------------------------------- loop

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - this.lastTime) / 1000);
    this.lastTime = t;
    const running = !this.modalOpen && this.speed > 0;
    const gameDt = running ? dt * this.speed : 0;
    this.panByKeys(dt);
    if (running) {
      this.simAcc += gameDt;
      let steps = 0;
      while (this.simAcc >= DAY_SECONDS && steps < 8) {
        this.simAcc -= DAY_SECONDS;
        stepDay(this.state);
        steps++;
      }
      const m = monthOf(this.state.day);
      if (m !== this.lastMonth) {
        this.lastMonth = m;
        this.onNewMonth();
      }
    }
    this.agents.update(this.state, gameDt);
    this.wildlife.update(this.state, gameDt);
    this.renderer.render(this.state, this.agents.agents, this.overlay(), running ? dt : 0, this.wildlife.animals);
    this.hud.minimap.update(dt);
    this.hud.tickAudio(dt, running);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.hud.update();
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private onNewMonth(): void {
    this.hud.update();
    // Autosave at the start of every season.
    if (monthOf(this.state.day) % 3 === 0) {
      this.save('autosave').catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- overlay

  private ghostPos(type: BuildingType, tx: number, ty: number): { x: number; y: number } {
    const d = BUILDINGS[type];
    return { x: Math.floor(tx - d.w / 2 + 0.5), y: Math.floor(ty - d.h / 2 + 0.5) };
  }

  private lastPointer: { x: number; y: number } | null = null;

  private overlay(): Overlay {
    const ov: Overlay = {};
    const s = this.state;
    if (this.selected !== null) {
      ov.selected = this.selected;
      const b = s.buildings.find((o) => o.id === this.selected);
      if (b) {
        const d = BUILDINGS[b.type];
        if (d.radius) {
          const c = bCenter(b);
          ov.range = { cx: c.x, cy: c.y, r: d.radius, highlight: rangeHighlighter(s, b.type) };
        }
      } else {
        this.selected = null;
      }
    }
    const lp = this.lastPointer;
    if (!lp) return ov;
    const [ftx, fty] = this.renderer.screenToTile(lp.x, lp.y);
    const tx = Math.floor(ftx);
    const ty = Math.floor(fty);
    if (inBounds(s, tx, ty)) ov.hover = { x: tx, y: ty };
    const tool = this.tool;
    if (tool.kind === 'build') {
      const p = this.ghostPos(tool.type, ftx, fty);
      const err = placementError(s, tool.type, p.x, p.y);
      ov.ghost = { type: tool.type, x: p.x, y: p.y, ok: !err };
      const d = BUILDINGS[tool.type];
      if (d.radius) {
        const c = centerOf(p.x, p.y, d.w, d.h);
        ov.range = { cx: c.x, cy: c.y, r: d.radius, highlight: rangeHighlighter(s, tool.type) };
      }
      this.hud.setHint(this.buildHint(tool.type, p.x, p.y, err), !!err);
    } else if (tool.kind === 'road') {
      const tiles = this.roadTiles(tx, ty);
      ov.tiles = tiles.map((t) => ({ ...t, ok: !roadError(s, t.x, t.y) || s.road[idx(s, t.x, t.y)] === 1 }));
      ov.tileColor = 'road';
      const n = tiles.filter((t) => !roadError(s, t.x, t.y)).length;
      this.hud.setHint(this.dragTile ? `Road: ${n} tiles · release to build` : 'Click and drag to lay a road · Right-click to stop', false);
    } else if (tool.kind === 'demolish') {
      const tiles = this.dragTile ? this.roadTiles(tx, ty) : inBounds(s, tx, ty) ? [{ x: tx, y: ty }] : [];
      ov.tiles = tiles.map((t) => ({ ...t, ok: true }));
      ov.tileColor = 'remove';
      const occ = inBounds(s, tx, ty) ? s.occ[idx(s, tx, ty)] : -1;
      const b = occ >= 0 ? s.buildings.find((o) => o.id === occ) : undefined;
      this.hud.setHint(
        b ? `Click to demolish ${BUILDINGS[b.type].name}${b.type === 'townhall' ? ' (not possible)' : ''}` : 'Click a building, or drag across roads to remove them',
        b?.type === 'townhall',
      );
    } else {
      this.hud.setHint('', false);
    }
    return ov;
  }

  private buildHint(type: BuildingType, x: number, y: number, err: string | null): string {
    const d = BUILDINGS[type];
    if (err) return `${d.name}: ${err}`;
    if (d.gathers) {
      const c = centerOf(x, y, d.w, d.h);
      const n = resourceInRange(this.state, type, c);
      const what = { trees: 'tree tiles', forest: 'forest tiles', rock: 'rock deposits', ore: 'ore deposits', berries: 'berry bushes', water: 'water tiles' }[d.gathers];
      return `${d.name}: ${n} ${what} in range · Click to place`;
    }
    return `${d.name} · Click to place · Right-click to cancel`;
  }

  private roadTiles(tx: number, ty: number): { x: number; y: number }[] {
    const s = this.state;
    const start = this.dragTile ?? { x: tx, y: ty };
    const out: { x: number; y: number }[] = [];
    const dx = Math.sign(tx - start.x);
    const dy = Math.sign(ty - start.y);
    const horizontalFirst = Math.abs(tx - start.x) >= Math.abs(ty - start.y);
    let x = start.x;
    let y = start.y;
    const push = () => {
      if (inBounds(s, x, y)) out.push({ x, y });
    };
    push();
    if (horizontalFirst) {
      while (x !== tx) {
        x += dx;
        push();
      }
      while (y !== ty) {
        y += dy;
        push();
      }
    } else {
      while (y !== ty) {
        y += dy;
        push();
      }
      while (x !== tx) {
        x += dx;
        push();
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- actions

  setTool(t: Tool): void {
    this.tool = t;
    this.dragTile = null;
    if (t.kind !== 'select') this.selected = null;
    this.canvas.classList.toggle('tool', t.kind !== 'select');
    this.hud.update();
  }

  select(id: number | null): void {
    this.selected = id;
    this.hud.update();
  }

  private clickTile(sx: number, sy: number): void {
    const s = this.state;
    const [ftx, fty] = this.renderer.screenToTile(sx, sy);
    const tx = Math.floor(ftx);
    const ty = Math.floor(fty);
    const tool = this.tool;
    if (tool.kind === 'build') {
      const p = this.ghostPos(tool.type, ftx, fty);
      const err = placementError(s, tool.type, p.x, p.y);
      if (err) {
        this.hud.flash(err);
        return;
      }
      const b = placeOrder(s, tool.type, p.x, p.y);
      if (b) {
        this.hud.sound('place');
        if (!b.connected) this.hud.flash('Connect it to the Manor Hall with a road to start construction.');
        if (tool.type !== 'house' && tool.type !== 'well') {
          this.setTool({ kind: 'select' });
          this.select(b.id);
        }
      }
      return;
    }
    if (tool.kind === 'demolish') {
      if (!inBounds(s, tx, ty)) return;
      const occ = s.occ[idx(s, tx, ty)];
      if (occ >= 0) {
        const b = s.buildings.find((o) => o.id === occ);
        if (b && demolish(s, b)) {
          this.hud.sound('demolish');
          log(s, `${BUILDINGS[b.type].name} demolished.`, 'info');
        }
      } else if (s.road[idx(s, tx, ty)]) {
        removeRoad(s, tx, ty);
        recompute(s);
      }
      return;
    }
    if (tool.kind === 'select') {
      if (!inBounds(s, tx, ty)) {
        this.select(null);
        return;
      }
      const occ = this.pickBuilding(sx, sy);
      this.select(occ);
    }
  }

  /** Picks the building under the cursor, accounting for sprite height. */
  private pickBuilding(sx: number, sy: number): number | null {
    const s = this.state;
    // Try the tile under the cursor and a few tiles "below" it, since tall
    // sprites extend upward on screen.
    for (let lift = 0; lift <= 40; lift += 8) {
      const [ftx, fty] = this.renderer.screenToTile(sx, sy + lift * this.renderer.cam.zoom);
      const tx = Math.floor(ftx);
      const ty = Math.floor(fty);
      if (!inBounds(s, tx, ty)) continue;
      const occ = s.occ[idx(s, tx, ty)];
      if (occ >= 0) return occ;
    }
    return null;
  }

  private finishRoad(tx: number, ty: number): void {
    const s = this.state;
    let n = 0;
    for (const t of this.roadTiles(tx, ty)) if (buildRoad(s, t.x, t.y)) n++;
    if (n) {
      recompute(s);
      this.hud.sound('road');
    }
  }

  private finishRoadRemoval(tx: number, ty: number): void {
    const s = this.state;
    let n = 0;
    for (const t of this.roadTiles(tx, ty)) if (removeRoad(s, t.x, t.y)) n++;
    if (n) recompute(s);
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.renderer.cam.zoom };
        this.dragFrom = null;
        this.dragTile = null;
        return;
      }
      this.moved = false;
      this.dragFrom = { x: e.clientX, y: e.clientY, camX: this.renderer.cam.x, camY: this.renderer.cam.y, button: e.button };
      if (e.button === 0 && (this.tool.kind === 'road' || this.tool.kind === 'demolish')) {
        const [tx, ty] = this.renderer.screenToTile(e.clientX, e.clientY);
        this.dragTile = { x: Math.floor(tx), y: Math.floor(ty) };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom((this.pinch.zoom * d) / this.pinch.dist);
        return;
      }
      const df = this.dragFrom;
      if (!df) {
        this.hud.hoverWorld(e.clientX, e.clientY);
        return;
      }
      const dist = Math.hypot(e.clientX - df.x, e.clientY - df.y);
      if (dist > 6) this.moved = true;
      const panning = df.button !== 0 || (this.tool.kind !== 'road' && this.tool.kind !== 'demolish') || !this.dragTile;
      if (this.moved && panning) {
        cv.classList.add('dragging');
        const z = this.renderer.cam.zoom;
        this.renderer.cam.x = df.camX - (e.clientX - df.x) / z;
        this.renderer.cam.y = df.camY - (e.clientY - df.y) / z;
        this.renderer.clampCamera(this.state);
      }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      cv.classList.remove('dragging');
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        this.dragFrom = null;
        return;
      }
      const df = this.dragFrom;
      this.dragFrom = null;
      if (!df) return;
      const [ftx, fty] = this.renderer.screenToTile(e.clientX, e.clientY);
      const tx = Math.floor(ftx);
      const ty = Math.floor(fty);
      if (df.button === 2 && !this.moved) {
        if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
        else this.select(null);
        return;
      }
      if (df.button !== 0) return;
      if (this.tool.kind === 'road' && this.dragTile) {
        this.finishRoad(tx, ty);
        this.dragTile = null;
        return;
      }
      if (this.tool.kind === 'demolish' && this.dragTile) {
        const single = this.dragTile.x === tx && this.dragTile.y === ty;
        this.dragTile = null;
        if (single) this.clickTile(e.clientX, e.clientY);
        else this.finishRoadRemoval(tx, ty);
        return;
      }
      if (!this.moved) this.clickTile(e.clientX, e.clientY);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => {
      if (!this.dragFrom) this.lastPointer = null;
      this.hud.hoverWorld(-1, -1);
    });
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.renderer;
        const [wx, wy] = r.screenToWorld(e.clientX, e.clientY);
        this.setZoom(r.cam.zoom * Math.exp(-e.deltaY * 0.0015));
        // Keep the point under the cursor fixed.
        const [wx2, wy2] = r.screenToWorld(e.clientX, e.clientY);
        r.cam.x += wx - wx2;
        r.cam.y += wy - wy2;
        r.clampCamera(this.state);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'escape') {
        if (this.hud.closeModal()) return;
        if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
        else if (this.selected !== null) this.select(null);
        else this.hud.showGameMenu();
        return;
      }
      if (this.modalOpen) return;
      if (k === ' ') {
        e.preventDefault();
        this.togglePause();
      } else if (k === '1' || k === '2' || k === '3') {
        this.setSpeed(Number(k));
      } else if (k === 'r') {
        this.setTool({ kind: 'road' });
      } else if (k === 'x' || k === 'delete') {
        this.setTool({ kind: 'demolish' });
      } else if (k === '+' || k === '=') {
        this.setZoom(this.renderer.cam.zoom * 1.2);
      } else if (k === '-') {
        this.setZoom(this.renderer.cam.zoom / 1.2);
      } else {
        const t = BUILD_ORDER.find((b) => BUILDINGS[b].hotkey === k);
        if (t) this.hud.pickBuilding(t);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setZoom(z: number): void {
    this.renderer.cam.zoom = Math.max(0.4, Math.min(2.5, z));
  }

  private panByKeys(dt: number): void {
    if (this.modalOpen) return;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (!dx && !dy) return;
    const sp = (700 * dt) / this.renderer.cam.zoom;
    this.renderer.cam.x += dx * sp;
    this.renderer.cam.y += dy * sp;
    this.renderer.clampCamera(this.state);
  }

  focusBuilding(id: number): void {
    const b = this.state.buildings.find((o) => o.id === id);
    if (!b) return;
    const c = bCenter(b);
    this.renderer.centerOn(c.x, c.y);
    this.select(id);
  }
}

function rangeHighlighter(s: GameState, type: BuildingType): ((i: number) => boolean) | undefined {
  switch (BUILDINGS[type].gathers) {
    case 'trees':
    case 'forest':
      return (i) => s.trees[i] > 0;
    case 'rock':
      return (i) => s.rock[i] > 0;
    case 'ore':
      return (i) => s.ore[i] > 0;
    case 'berries':
      return (i) => s.berriesMax[i] > 0;
    case 'water':
      return (i) => s.terrain[i] === 1;
    default:
      if (type === 'well' || type === 'market' || type === 'church' || BUILDINGS[type].beauty > 0) {
        return (i) => {
          const o = s.occ[i];
          if (o < 0) return false;
          const b = s.buildings.find((x) => x.id === o);
          return !!b && b.type === 'house';
        };
      }
      return undefined;
  }
}

const game = new Game();
// Handy hooks for debugging and automated screenshots.
(window as unknown as Record<string, unknown>).game = game;
(window as unknown as Record<string, unknown>).cl = { placeOrder, buildRoad, stepDay, recompute, placementError };
