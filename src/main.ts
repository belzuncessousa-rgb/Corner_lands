import './ui/styles.css';
import { listSaves, loadGame, saveGame } from './api';
import { BUILDINGS, BUILD_ORDER, DAY_SECONDS, MONTH_NAMES, TIERS } from './game/data';
import { playBot } from './game/autoplay';
import { autoResolve } from './game/events';
import { StateRng } from './game/rng';
import { deserialize, serialize } from './game/save';
import {
  BRIDGE_COST,
  buildRoad,
  canAfford,
  materialsOf,
  bCenter,
  isBridge,
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
  zoneError,
  zoneCost,
  placeZone,
  setYard,
  footprintClear,
  PAVING_COST,
  PAVING_TIER,
  stepDay,
  updateHappiness,
  yearOf,
  keepOf,
} from './game/sim';
import type { BuildingType, GameState } from './game/types';
import { FOOD_IDS } from './game/data';
import { generateWorld, idx, inBounds } from './game/world';
import { AgentSystem } from './render/agents';
import { Wildlife } from './render/wildlife';
import { type Overlay, Renderer } from './render/renderer';
import { Hud } from './ui/hud';

export type Tool =
  | { kind: 'select' }
  | { kind: 'build'; type: BuildingType }
  | { kind: 'road'; paved?: boolean }
  | { kind: 'zone'; type: BuildingType }
  | { kind: 'demolish' };

const SPEEDS = [0, 1, 3, 8];

/** Pixels a pointer may move and still count as a click: more for fingers. */
const MOUSE_SLOP = 6;
const TOUCH_SLOP = 14;
/** Holding a finger this long acts as a right-click. */
const LONG_PRESS_MS = 500;

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
  /** Title screen: a computer-grown village plays on behind the menu. */
  demo = true;
  hoverTile: { x: number; y: number } | null = null;
  private simAcc = 0;
  private lastTime = performance.now();
  private hudTimer = 0;
  private lastMonth = -1;
  private canvas: HTMLCanvasElement;

  // Pointer state.
  private pointers = new Map<number, { x: number; y: number }>();
  private dragFrom: { x: number; y: number; camX: number; camY: number; button: number; touch?: boolean } | null = null;
  private moved = false;
  private longPress = 0;

  /** Right-click (or a long press): drop the half-drawn road or zone, then the tool, then the selection. */
  private cancelOrDeselect(): void {
    if (this.tool.kind === 'road' && this.roadAnchor) this.roadAnchor = null;
    else if (this.tool.kind === 'zone' && this.zoneAnchor) this.zoneAnchor = null;
    else if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
    else this.select(null);
  }
  private dragTile: { x: number; y: number } | null = null;
  /** Where the road being laid starts; the next click finishes a segment. */
  private roadAnchor: { x: number; y: number } | null = null;
  /** First corner of a field, pasture or orchard being drawn. */
  private zoneAnchor: { x: number; y: number } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private keys = new Set<string>();

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas);
    this.renderer.showMarkers = false;
    this.state = makeDemoVillage();
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

  newGame(seed: number, relaxed = false): void {
    this.state = generateWorld(seed, { relaxed });
    recompute(this.state);
    // Show a meaningful happiness breakdown from the very first day.
    this.state.report.variety = FOOD_IDS.filter((f) => this.state.res[f] > 0).length;
    updateHappiness(this.state);
    log(this.state, 'Your settlers have arrived at a quiet corner of the land. Build houses and gather food!', 'info');
    this.afterLoad();
  }

  private afterLoad(): void {
    this.demo = false;
    this.renderer.showMarkers = true;
    document.getElementById('ui')!.classList.remove('demo');
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
    return `${TIERS[s.tier].name} · ${s.population} villagers · Year ${yearOf(s.day)}, ${MONTH_NAMES[monthOf(s.day)]}${s.relaxed ? ' · Relaxed' : ''}`;
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
    const running = (!this.modalOpen || this.demo) && this.speed > 0;
    if (this.demo) {
      this.driftCamera(dt);
      if (this.state.pendingEvent) autoResolve(this.state, new StateRng(this.state));
    }
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
    if (this.demo) return;
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
    } else if (tool.kind === 'zone') {
      const a = this.zoneAnchor ?? { x: tx, y: ty };
      const err = zoneError(s, tool.type, a.x, a.y, tx, ty);
      const x0 = Math.min(a.x, tx);
      const y0 = Math.min(a.y, ty);
      const w = Math.abs(tx - a.x) + 1;
      const h = Math.abs(ty - a.y) + 1;
      ov.tiles = [];
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          if (!inBounds(s, x, y)) continue;
          ov.tiles.push({ x, y, ok: !footprintClear(s, x, y, 1, 1) });
        }
      }
      ov.tileColor = 'road';
      const d = BUILDINGS[tool.type];
      const owner = d.zone!.owner;
      const ownerName = BUILDINGS[owner].name;
      // Show the reach of the workplaces that would tend it.
      const near = s.buildings.find((o) => o.type === owner && o.build >= 1 && Math.hypot(bCenter(o).x - (x0 + w / 2), bCenter(o).y - (y0 + h / 2)) <= BUILDINGS[owner].radius + Math.max(w, h) / 2);
      const any = s.buildings.find((o) => o.type === owner);
      if (near || any) {
        const c = bCenter(near ?? any!);
        ov.range = { cx: c.x, cy: c.y, r: BUILDINGS[owner].radius };
      }
      const cost = zoneCost(tool.type, w, h);
      const costText = cost.wood ? ` · ${cost.wood} timber for fences` : cost.gold ? ` · ${cost.gold} coins for saplings` : '';
      if (!this.zoneAnchor) {
        this.hud.setHint(`${d.name}: click one corner, then the opposite corner · ${d.zone!.min}–${d.zone!.max} tiles a side`, false);
      } else {
        const where = near ? '' : ` · no ${ownerName} in range: nobody will tend it`;
        // Fields care about the soil: say how rich the ground under the plan is.
        let soil = '';
        if (tool.type === 'field' && !err) {
          let f = 0;
          for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inBounds(s, x, y)) f += s.fertility[idx(s, x, y)];
          const avg = f / (w * h);
          soil = ` · ${avg < 0.4 ? 'poor' : avg < 0.7 ? 'fair' : 'rich'} soil (${Math.round(avg * 100)}%)`;
        }
        this.hud.setHint(err ? `${d.name} ${w}×${h}: ${err}` : `${d.name} ${w}×${h} (${w * h} tiles)${soil}${costText}${where} · click to place`, !!err || !near);
      }
    } else if (tool.kind === 'road') {
      const paved = !!tool.paved;
      const tiles = this.roadTiles(tx, ty);
      const done = (t: { x: number; y: number }) => s.road[idx(s, t.x, t.y)] === (paved ? 2 : 1) || (!paved && s.road[idx(s, t.x, t.y)] > 0);
      ov.tiles = tiles.map((t) => ({ ...t, ok: !roadError(s, t.x, t.y, paved) || done(t) }));
      ov.tileColor = 'road';
      const fresh = tiles.filter((t) => !done(t));
      const n = fresh.filter((t) => !roadError(s, t.x, t.y, paved)).length;
      if (paved) {
        const stone = n * (PAVING_COST.stone ?? 0);
        this.hud.setHint(
          s.tier < PAVING_TIER
            ? 'Paved roads unlock when you become a Village'
            : this.roadAnchor
              ? `Paved road: ${n} tiles · ${stone} stone · click to lay it, keep clicking to continue · right-click to finish`
              : 'Click where the paved road starts · paving an existing road upgrades it · 2 stone per tile',
          s.tier < PAVING_TIER || fresh.length * (PAVING_COST.stone ?? 0) > s.res.stone,
        );
      } else {
        const bridges = fresh.filter((t) => isBridge(s, t.x, t.y)).length;
        const cost = bridges ? ` · ${bridges} bridge tiles cost ${bridges * (BRIDGE_COST.wood ?? 0)} timber` : '';
        this.hud.setHint(
          this.roadAnchor
            ? `Road: ${n} new tiles${cost} · click to lay it, then keep clicking to continue · right-click to finish`
            : 'Click where the road starts · roads over water become bridges · right-click to stop',
          bridges * (BRIDGE_COST.wood ?? 0) > s.res.wood,
        );
      }
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
    const start = this.roadAnchor ?? this.dragTile ?? { x: tx, y: ty };
    // Try both L-shaped routes and keep the one with fewer obstacles.
    const a = this.lPath(start, tx, ty, true);
    const b = this.lPath(start, tx, ty, false);
    // Blocked tiles count heavily; bridges a little, so dry routes win.
    const bad = (path: { x: number; y: number }[]) =>
      path.reduce((sum, t) => {
        if (this.state.road[idx(this.state, t.x, t.y)]) return sum;
        if (roadError(this.state, t.x, t.y)) return sum + 10;
        return sum + (isBridge(this.state, t.x, t.y) ? 1 : 0);
      }, 0);
    const ba = bad(a);
    const bb = bad(b);
    if (ba !== bb) return ba < bb ? a : b;
    return Math.abs(tx - start.x) >= Math.abs(ty - start.y) ? a : b;
  }

  private lPath(start: { x: number; y: number }, tx: number, ty: number, horizontalFirst: boolean): { x: number; y: number }[] {
    const s = this.state;
    const out: { x: number; y: number }[] = [];
    const dx = Math.sign(tx - start.x);
    const dy = Math.sign(ty - start.y);
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

  /** Zone tool click: first corner, then the opposite corner places it. */
  private clickZone(type: BuildingType, tx: number, ty: number): void {
    const s = this.state;
    if (!inBounds(s, tx, ty)) return;
    if (!this.zoneAnchor) {
      this.zoneAnchor = { x: tx, y: ty };
      return;
    }
    const a = this.zoneAnchor;
    const err = zoneError(s, type, a.x, a.y, tx, ty);
    if (err) {
      this.hud.flash(err);
      return;
    }
    const z = placeZone(s, type, a.x, a.y, tx, ty);
    this.zoneAnchor = null;
    if (z) {
      this.hud.sound('place');
      this.setTool({ kind: 'select' });
      this.hud.closeCategory();
      this.select(z.id);
    }
  }

  /** Road tool click: start a road, or lay the segment and continue from its end. */
  private clickRoad(tx: number, ty: number): void {
    if (!inBounds(this.state, tx, ty)) return;
    if (!this.roadAnchor) {
      this.roadAnchor = { x: tx, y: ty };
      return;
    }
    if (tx === this.roadAnchor.x && ty === this.roadAnchor.y) {
      // Clicking the same tile again lays a single tile and ends the road.
      this.finishRoad(tx, ty);
      this.roadAnchor = null;
      return;
    }
    this.finishRoad(tx, ty);
    this.roadAnchor = { x: tx, y: ty };
  }

  // ---------------------------------------------------------------- actions

  setTool(t: Tool): void {
    this.tool = t;
    this.dragTile = null;
    this.roadAnchor = null;
    this.zoneAnchor = null;
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
        if (!canAfford(s, materialsOf(BUILDINGS[tool.type].cost))) this.hud.flash('Builders will start once the materials are in storage.');
        if (tool.type !== 'house' && tool.type !== 'well' && tool.type !== 'garden') {
          this.setTool({ kind: 'select' });
          this.hud.closeCategory();
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
      this.hud.closeCategory();
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
    const paved = this.tool.kind === 'road' && !!this.tool.paved;
    for (const t of this.roadTiles(tx, ty)) if (buildRoad(s, t.x, t.y, paved)) n++;
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
      this.dragFrom = { x: e.clientX, y: e.clientY, camX: this.renderer.cam.x, camY: this.renderer.cam.y, button: e.button, touch: e.pointerType === 'touch' };
      // Phones have no right button: a long press cancels the tool or deselects.
      clearTimeout(this.longPress);
      if (e.pointerType === 'touch') {
        this.longPress = window.setTimeout(() => {
          if (!this.dragFrom || this.moved || this.pointers.size !== 1) return;
          this.dragFrom = null;
          this.dragTile = null;
          this.cancelOrDeselect();
          navigator.vibrate?.(15);
        }, LONG_PRESS_MS);
      }
      if (e.button === 0 && this.tool.kind === 'demolish') {
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
      // Fingers wobble: a touch must travel further than a mouse before it counts as a drag.
      if (dist > (df.touch ? TOUCH_SLOP : MOUSE_SLOP)) {
        this.moved = true;
        clearTimeout(this.longPress);
      }
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
      clearTimeout(this.longPress);
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
        this.cancelOrDeselect();
        return;
      }
      if (df.button !== 0) return;
      if (this.tool.kind === 'road') {
        if (!this.moved) this.clickRoad(tx, ty);
        return;
      }
      if (this.tool.kind === 'zone') {
        if (!this.moved) this.clickZone(this.tool.type, tx, ty);
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
        if (this.hud.handleEscape()) return;
        if (this.tool.kind === 'road' && this.roadAnchor) this.roadAnchor = null;
        else if (this.tool.kind === 'zone' && this.zoneAnchor) this.zoneAnchor = null;
        else if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
        else if (this.selected !== null) this.select(null);
        else if (this.hud.categoryOpen) this.hud.closeCategory();
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
      } else if (k === 't') {
        this.setTool({ kind: 'road', paved: true });
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

  private demoTime = 0;

  /** Slow circling pan over the demo village. */
  private driftCamera(dt: number): void {
    this.demoTime += dt;
    const hall = this.state.buildings.find((b) => b.type === 'townhall');
    if (!hall) return;
    const t = this.demoTime * 0.04;
    this.renderer.centerOn(hall.x + 1.5 + Math.cos(t) * 7, hall.y + 1.5 + Math.sin(t) * 7);
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

/** A fresh map that the autoplayer has grown for a few years. */
function makeDemoVillage(): GameState {
  const seed = Math.floor(Math.random() * 1e9);
  const s = generateWorld(seed);
  playBot(s, 3.5, seed);
  s.messages = [];
  return s;
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
(window as unknown as Record<string, unknown>).cl = { placeOrder, buildRoad, stepDay, recompute, placementError, playBot, placeZone, setYard, keepOf };
