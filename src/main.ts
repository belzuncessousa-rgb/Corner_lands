import './ui/styles.css';
import { deleteSave, listSaves, loadGame, saveGame } from './api';
import { BUILDINGS, BUILD_ORDER, DAY_SECONDS, GATHERERS, MONTH_NAMES, TIERS } from './game/data';
import { playBot } from './game/autoplay';
import { autoResolve, TITLES } from './game/events';
import { placeName, townName } from './game/names';
import { curveSamples, curveTiles, perimeter, polygonCells } from './game/curves';
import { StateRng } from './game/rng';
import { deserialize, serialize } from './game/save';
import {
  BRIDGE_COST,
  buildRoad,
  layRoads,
  planRoad,
  canAfford,
  materialsOf,
  bCenter,
  buyAnimal,
  isBridge,
  centerOf,
  log,
  lockReason,
  isUnlocked,
  coveredBy,
  hasProblem,
  monthOf,
  placeOrder,
  placementError,
  recompute,
  removeRoad,
  nearestResource,
  seatOf,
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
  seasonOf,
  yearOf,
  keepOf,
  townScore,
  freePlacementError,
  placeFree,
  curveError,
  layWallCurve,
  wallCurveError,
  placeShape,
  shapeError,
  layCurve,
  GROVE_MAX,
  groveAt,
  protectGrove,
  unprotectGrove,
} from './game/sim';
import type { Building, BuildingType, GameState, Land } from './game/types';
import { FOOD_IDS } from './game/data';
import { LANDS, generateWorld, idx, inBounds } from './game/world';
import { demolishWithUndo } from './game/undo';
import type { Agent } from './render/agents';
import { AgentSystem } from './render/agents';
import { Wildlife } from './render/wildlife';
import { type Overlay, Renderer, stallSpots } from './render/renderer';
import { setViewTurn } from './render/pen';
import { Hud } from './ui/hud';

export type Tool =
  | { kind: 'select' }
  | { kind: 'build'; type: BuildingType }
  | { kind: 'road'; paved?: boolean; wall?: boolean }
  | { kind: 'zone'; type: BuildingType }
  | { kind: 'demolish' }
  | { kind: 'grove' };

const SPEEDS = [0, 1, 3, 8];

/** Autosaves of different settlements kept before the oldest is removed. */
const AUTOSAVES_KEPT = 3;


/** Services whose reach the V overlay can show. */
const COVERAGE_TYPES: BuildingType[] = ['well', 'market', 'tavern', 'church'];

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
  /** Which service's reach the map is showing (V cycles), if any. */
  coverage: BuildingType | null = null;

  /** Demolishes a building (from the tool or the inspector). There is no taking it back. */
  demolishBuilding(b: Building): boolean {
    if (!demolishWithUndo(this.state, b)) return false;
    log(this.state, `${BUILDINGS[b.type].name} demolished.`, 'info');
    return true;
  }


  /** Cycles the reach overlay: wells, markets, taverns, churches, off. */
  cycleCoverage(): void {
    const order: (BuildingType | null)[] = [...COVERAGE_TYPES, null];
    this.coverage = order[(order.indexOf(this.coverage) + 1) % order.length];
    this.hud.showCoverage(this.coverage);
  }

  /** Right-click (or a long press): drop the half-drawn road or zone, then the tool, then the selection. */
  private cancelOrDeselect(): void {
    if (this.curvePts.length) {
      this.finishCurve();
      return;
    }
    if (this.tool.kind === 'road' && this.roadAnchor) this.roadAnchor = null;
    else if ((this.tool.kind === 'zone' || this.tool.kind === 'grove') && this.zoneAnchor) this.zoneAnchor = null;
    else if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
    else this.select(null);
  }
  private dragTile: { x: number; y: number } | null = null;
  /** Where the road being laid starts; the next click finishes a segment. */
  private roadAnchor: { x: number; y: number } | null = null;
  /** First corner of a field, pasture or orchard being drawn. */
  private zoneAnchor: { x: number; y: number } | null = null;
  private pinch: { dist: number; zoom: number; angle: number } | null = null;
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
    // The 3D view, if the player turned it on last time.
    try {
      if (localStorage.getItem('cornerlands.3d') === '1') void this.set3D(true);
    } catch {
      /* ignore */
    }
    // A shared link (…?seed=123) goes straight to founding a town on that land.
    const params = new URLSearchParams(location.search);
    const shared = params.get('seed');
    const sharedLand = params.get('land');
    const land = sharedLand && sharedLand in LANDS ? (sharedLand as Land) : undefined;
    if (shared) history.replaceState(null, '', location.pathname);
    if (shared && /^\d{1,9}$/.test(shared)) void this.hud.showMainMenu().then(() => this.hud.showNewGame(true, Number(shared), land));
    else this.hud.showMainMenu();
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

  newGame(seed: number, mode: 'normal' | 'relaxed' | 'hardy' = 'normal', name?: string, land: Land = 'meadow'): void {
    this.state = generateWorld(seed, { relaxed: mode === 'relaxed', hardy: mode === 'hardy', land });
    this.state.founded = Date.now();
    this.state.name = name?.trim().slice(0, 40) || placeName(seed);
    recompute(this.state);
    // Show a meaningful happiness breakdown from the very first day.
    this.state.report.variety = FOOD_IDS.filter((f) => this.state.res[f] > 0).length;
    updateHappiness(this.state);
    log(this.state, 'Your settlers have made camp in a quiet corner of the land. Lay out a free Marketplace (Civic) where families will fetch their food, gather food and timber, and build houses before the cart runs out.', 'info');
    this.afterLoad();
  }

  private afterLoad(): void {
    this.selectedAgent = null;
    this.demo = false;
    this.renderer.showMarkers = true;
    this.photo = false;
    document.getElementById('ui')!.classList.remove('demo', 'photo');
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
    const hall = seatOf(this.state);
    const c = hall ? bCenter(hall) : { x: this.state.width / 2, y: this.state.height / 2 };
    this.renderer.centerOn(c.x, c.y + 2);
    this.renderer.cam.zoom = window.innerWidth < 700 ? 0.8 : 1.1;
  }

  summary(): string {
    const s = this.state;
    const base = `${townName(s)} · ${TIERS[s.tier].name} · ${s.population} villagers · Year ${yearOf(s.day)}, ${MONTH_NAMES[monthOf(s.day)]}${s.relaxed ? ' · Relaxed' : s.hardy ? ' · Hardy' : ''}`;
    // Deeds for the load cards: the lord's title, great works and milestones.
    const deeds: string[] = [];
    if (s.title) deeds.push(TITLES[s.title].name);
    for (const t of ['castle', 'cathedral', 'guildhall', 'belltower'] as const) {
      const done = t === 'castle' ? s.tier >= TIERS.length - 1 : s.buildings.some((b) => b.type === t && b.build >= 1);
      if (done) deeds.push(t === 'castle' ? 'Castle' : BUILDINGS[t].name);
    }
    const miles = (s.milestones ?? []).length;
    if (miles) deeds.push(`${miles} milestone${miles > 1 ? 's' : ''}`);
    deeds.push(`Score ${townScore(s)}`);
    return deeds.length ? `${base} — ${deeds.join(' · ')}` : base;
  }

  async save(slot: string): Promise<string> {
    const where = await saveGame(slot, serialize(this.state), this.summary(), this.hud.minimap.thumbnail());
    return where;
  }

  async load(slot: string, where: 'server' | 'local'): Promise<void> {
    const data = await loadGame(slot, where);
    this.state = deserialize(data);
    this.afterLoad();
  }

  /** A file name for this town: rank, year and map seed. */
  private fileStem(): string {
    const s = this.state;
    const slug = townName(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'town';
    return `corner-lands-${slug}-year${yearOf(s.day)}-seed${s.seed}`;
  }

  /** Downloads the town as a file a friend can open. */
  exportFile(): void {
    const blob = new Blob([serialize(this.state)], { type: 'application/json' });
    download(blob, `${this.fileStem()}.json`);
  }

  /** Opens a town from a file's text; throws with a short reason if it is not one. */
  importText(text: string): void {
    let s: GameState;
    try {
      s = deserialize(text);
    } catch {
      throw new Error('That file is not a Corner Lands town.');
    }
    if (!s.buildings || !s.terrain || !s.width) throw new Error('That file is not a Corner Lands town.');
    this.state = s;
    this.afterLoad();
  }

  /** The 3D view (a test): loaded on demand so the flat game stays light. */
  private view3d: import('./render3d/view3d').View3D | null = null;

  async set3D(on: boolean): Promise<void> {
    if (on && !this.view3d) {
      const { View3D } = await import('./render3d/view3d');
      this.view3d = new View3D(this.canvas);
    }
    if (this.view3d) this.view3d.visible = on;
    this.renderer.threeD = on;
    document.body.classList.toggle('three-d', on);
    // The flat view is never turned.
    if (!on) {
      this.turnTo = 0;
      this.applyTurn(0);
    }
  }

  /** How far the 3D view is turned (radians), and where it is turning to. */
  private turn = 0;
  private turnTo = 0;

  /** Turns the 3D view a quarter round (dir 1 or -1). */
  turnView(dir: number): void {
    if (!this.renderer.threeD) return;
    this.turnTo += (dir * Math.PI) / 2;
  }

  /** Sets the view's turn, keeping the tile at the middle of the screen where it is. */
  private applyTurn(rot: number): void {
    const s = this.state;
    const [cx, cy] = this.renderer.screenToTile(this.renderer.width / 2, this.renderer.height / 2);
    this.turn = rot;
    setViewTurn(rot, s.width / 2, s.height / 2);
    this.renderer.centerOn(cx, cy);
  }

  /** Photo mode: the interface, markers and selection are hidden for a clean view. */
  photo = false;

  setPhoto(on: boolean): void {
    this.photo = on;
    if (on) {
      this.setTool({ kind: 'select' });
      this.select(null);
      this.hud.closeCategory();
    }
    this.renderer.showMarkers = !on && !this.demo;
    document.getElementById('ui')!.classList.toggle('photo', on);
  }

  /** A picture of the view with the town's name, rank and year along the bottom. */
  async savePicture(): Promise<void> {
    // Taken in photo mode, so no markers or selection rings spoil it.
    const was = this.photo;
    if (!was) this.setPhoto(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    this.capture();
    if (!was) this.setPhoto(false);
  }

  private capture(): void {
    const src = this.canvas;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const k = src.width / Math.max(1, src.clientWidth);
    const h = 54 * k;
    ctx.fillStyle = 'rgba(40, 28, 16, 0.72)';
    ctx.fillRect(0, c.height - h, c.width, h);
    ctx.fillStyle = '#f4ead2';
    ctx.font = `${22 * k}px Cinzel, Georgia, serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`Corner Lands — ${this.summary()}`, 18 * k, c.height - h / 2, c.width - 36 * k);
    c.toBlob((b) => b && download(b, `${this.fileStem()}.png`), 'image/png');
  }

  async hasAutosave(): Promise<boolean> {
    return (await listSaves()).some((s) => s.slot.startsWith('autosave'));
  }

  /**
   * Each settlement autosaves to its own slot, so founding a new one never
   * overwrites the last; only the three most recent settlements are kept.
   */
  async autosave(): Promise<void> {
    this.state.founded ??= Date.now();
    await this.save(`autosave-${this.state.founded}`);
    const autos = (await listSaves()).filter((x) => x.slot.startsWith('autosave-'));
    for (const old of autos.slice(AUTOSAVES_KEPT)) await deleteSave(old.slot, old.where).catch(() => undefined);
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
      if (layRoads(this.state, gameDt / DAY_SECONDS)) recompute(this.state);
      const m = monthOf(this.state.day);
      if (m !== this.lastMonth) {
        this.lastMonth = m;
        this.onNewMonth();
      }
    }
    this.agents.update(this.state, gameDt, this.simAcc / DAY_SECONDS);
    this.wildlife.update(this.state, gameDt);
    // Dusk only at normal speed: faster, the days would flicker.
    this.renderer.setDayTime(this.simAcc / DAY_SECONDS, !this.demo && this.speed <= 1, dt);
    if (this.turn !== this.turnTo) {
      // Swing round smoothly, a quarter turn in about a third of a second.
      const step = dt * 5;
      const d = this.turnTo - this.turn;
      this.applyTurn(Math.abs(d) <= step ? this.turnTo : this.turn + Math.sign(d) * step);
    }
    if (this.view3d && this.renderer.threeD) {
      // Villagers, carts and deer stand in the 3D world, so buildings hide them.
      const season = seasonOf(this.state.day);
      const figures = this.agents.agents
        .filter((a) => a.visible)
        .map((a) => ({ sprite: this.renderer.figureSprite(a), x: a.x + (a.role.kind === 'cart' ? 0 : a.ox * 0.25), y: a.y + (a.role.kind === 'cart' ? 0 : a.oy * 0.25) }));
      for (const an of this.wildlife.animals) figures.push({ sprite: this.renderer.animalSprite(an, season), x: an.x, y: an.y });
      // Herds in their pastures and the stalls of each market.
      const herds = new Map<number, number>();
      for (const b of this.state.buildings) {
        if (b.type === 'pasture') {
          for (const an of this.renderer.pastureBeasts(this.state, b, herds)) figures.push({ sprite: this.renderer.beastSprite(an.kind, an.f, an.j, season), x: an.ax, y: an.ay });
        } else if (b.type === 'market') {
          stallSpots(b, this.state.width).forEach((i, k) => {
            const x = i % this.state.width;
            figures.push({ sprite: this.renderer.stallFigure((b.id * 3 + k) % 6, season, k < b.workers), x: x + 1, y: (i - x) / this.state.width + 1 });
          });
        }
      }
      this.view3d.render(this.state, this.renderer.cam, this.renderer.width, this.renderer.height, this.renderer.dpr, figures);
    }
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
      this.autosave().catch(() => undefined);
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
    if (this.selectedAgent) ov.agent = this.selectedAgent;
    if (this.coverage) {
      const type = this.coverage;
      // The same buildings coveredBy counts: staffed ones, and a cathedral for the church.
      const circles = s.buildings
        .filter((b) => (b.type === type || (type === 'church' && b.type === 'cathedral')) && b.build >= 1)
        .filter((b) => BUILDINGS[b.type].workers === 0 || (b.workers > 0 && !hasProblem(b)))
        .map((b) => ({ cx: bCenter(b).x, cy: bCenter(b).y, r: BUILDINGS[b.type].radius }));
      const homes = new Map<number, boolean>();
      for (const b of s.buildings) if (b.type === 'house' && b.build >= 1) homes.set(b.id, coveredBy(s, b, type));
      ov.coverage = { circles, homes };
    }
    if (this.selected !== null) {
      ov.selected = this.selected;
      const b = s.buildings.find((o) => o.id === this.selected);
      if (b) {
        const d = BUILDINGS[b.type];
        if (d.radius && !GATHERERS.has(b.type)) {
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
    if ((tool.kind === 'build' || tool.kind === 'zone') && (tool.type === 'farm' || tool.type === 'field')) ov.fertility = true;
    if (tool.kind === 'build' && this.renderer.threeD && this.view3d && !BUILDINGS[tool.type].zone) {
      // Free placement in 3D: anywhere, turned to face the nearest road.
      const f = this.freeSpot(tool.type, ftx, fty);
      const err = freePlacementError(s, tool.type, f.cx, f.cy, f.rot);
      this.view3d.setGhost({ type: tool.type, cx: f.cx, cy: f.cy, rot: f.rot, ok: !err }, seasonOf(s.day));
      const d = BUILDINGS[tool.type];
      if (d.radius) ov.range = { cx: f.cx, cy: f.cy, r: d.radius, highlight: rangeHighlighter(s, tool.type) };
      this.hud.setHint(err ? `${d.name}: ${err}` : `${d.name}: click to place · it turns to face the nearest road · , and . turn it by hand`, !!err);
    } else if (tool.kind === 'build') {
      const p = this.ghostPos(tool.type, ftx, fty);
      const err = placementError(s, tool.type, p.x, p.y);
      ov.ghost = { type: tool.type, x: p.x, y: p.y, ok: !err };
      const d = BUILDINGS[tool.type];
      if (d.radius && !GATHERERS.has(tool.type)) {
        const c = centerOf(p.x, p.y, d.w, d.h);
        ov.range = { cx: c.x, cy: c.y, r: d.radius, highlight: rangeHighlighter(s, tool.type) };
      }
      this.hud.setHint(this.buildHint(tool.type, p.x, p.y, err), !!err);
    } else if (tool.kind === 'zone' && this.shaping()) {
      // A free shape: the corners clicked so far and the pointer.
      const d = BUILDINGS[tool.type];
      const pts: [number, number][] = [...this.curvePts, [ftx, fty]];
      const closing = this.curvePts.length >= 3 && Math.hypot(this.curvePts[0][0] - ftx, this.curvePts[0][1] - fty) < 0.6;
      const shape = closing ? this.curvePts : pts;
      ov.curve = shape.length >= 3 ? [...shape, shape[0]] : shape;
      ov.tiles = polygonCells(s, shape)
        .filter((i) => i >= 0)
        .map((i) => {
          const x = i % s.width;
          const y = (i - x) / s.width;
          return { x, y, ok: !footprintClear(s, x, y, 1, 1) };
        });
      ov.tileColor = 'road';
      if (this.curvePts.length < 2) {
        this.hud.setHint(`${d.name}: click each corner of its outline, any shape · ${d.zone!.min * d.zone!.min}–${d.zone!.max * d.zone!.max} tiles${d.zone!.owner === tool.type ? ' · free' : ''}`, false);
      } else {
        const err = shapeError(s, tool.type, shape);
        const cost = zoneCost(tool.type, 0, 0, ov.tiles.length, perimeter(shape));
        const costText = cost.wood ? ` · ${cost.wood} timber for fences` : cost.gold ? ` · ${cost.gold} coins for saplings` : '';
        const stalls = tool.type === 'market' ? ` · room for ${Math.max(1, Math.min(6, Math.floor(ov.tiles.length / 6)))} stalls` : '';
        this.hud.setHint(
          err && shape.length >= 3
            ? `${d.name}: ${err}`
            : `${d.name} (${ov.tiles.length} tiles)${costText}${stalls} · click to add a corner · click the first corner, Enter or right-click to finish`,
          !!err && shape.length >= 3,
        );
      }
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
      // A marketplace tends itself: show the homes it would serve instead.
      const selfTended = owner === tool.type;
      const near = selfTended ? true : s.buildings.find((o) => o.type === owner && o.build >= 1 && Math.hypot(bCenter(o).x - (x0 + w / 2), bCenter(o).y - (y0 + h / 2)) <= BUILDINGS[owner].radius + Math.max(w, h) / 2);
      const any = selfTended ? undefined : s.buildings.find((o) => o.type === owner);
      if (selfTended) {
        ov.range = { cx: x0 + w / 2, cy: y0 + h / 2, r: d.radius, highlight: rangeHighlighter(s, tool.type) };
      } else if (near || any) {
        const c = bCenter((near as Building | undefined) ?? any!);
        ov.range = { cx: c.x, cy: c.y, r: BUILDINGS[owner].radius };
      }
      const cost = zoneCost(tool.type, w, h);
      const costText = cost.wood ? ` · ${cost.wood} timber for fences` : cost.gold ? ` · ${cost.gold} coins for saplings` : '';
      const stalls = tool.type === 'market' ? ` · room for ${Math.max(1, Math.min(6, Math.floor((w * h) / 6)))} stalls` : '';
      if (!this.zoneAnchor) {
        this.hud.setHint(`${d.name}: click one corner, then the opposite corner · ${d.zone!.min}–${d.zone!.max} tiles a side${selfTended ? ' · free' : ''}`, false);
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
        this.hud.setHint(err ? `${d.name} ${w}×${h}: ${err}` : `${d.name} ${w}×${h} (${w * h} tiles)${soil}${costText}${stalls}${where} · click to place`, !!err || !near);
      }
    } else if (tool.kind === 'grove') {
      ov.groves = true;
      const a = this.zoneAnchor ?? { x: tx, y: ty };
      const x0 = Math.min(a.x, tx);
      const y0 = Math.min(a.y, ty);
      const w = Math.abs(tx - a.x) + 1;
      const h = Math.abs(ty - a.y) + 1;
      const big = w > GROVE_MAX || h > GROVE_MAX;
      ov.tiles = [];
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inBounds(s, x, y)) ov.tiles.push({ x, y, ok: !big });
      ov.tileColor = 'grove';
      let trees = 0;
      for (const t of ov.tiles) if (s.trees[idx(s, t.x, t.y)] > 0) trees++;
      const inside = inBounds(s, tx, ty) && groveAt(s, tx, ty) >= 0;
      this.hud.setHint(
        !this.zoneAnchor
          ? inside
            ? 'Protected wood: click twice here to lift the protection, or click a corner to mark another'
            : 'Protect a wood: click one corner, then the opposite corner · woodcutters leave its trees standing'
          : big
            ? `Protected wood ${w}×${h}: at most ${GROVE_MAX} tiles a side`
            : `Protected wood ${w}×${h} · ${trees} tree${trees === 1 ? "" : "s"} kept standing · click to mark it`,
        big,
      );
    } else if (tool.kind === 'road' && tool.wall && !this.curving()) {
      // Town walls: laid like a road; road tiles become gates.
      const tiles = this.roadTiles(tx, ty);
      const gate = (t: { x: number; y: number }) => inBounds(s, t.x, t.y) && s.road[idx(s, t.x, t.y)] > 0;
      ov.tiles = tiles.map((t) => ({ ...t, ok: gate(t) || !placementError(s, 'wall', t.x, t.y) }));
      ov.tileColor = 'road';
      const n = tiles.filter((t) => !gate(t) && !placementError(s, 'wall', t.x, t.y)).length;
      const c = BUILDINGS.wall.cost;
      const err = isUnlocked(s, 'wall') ? '' : lockReason(s, 'wall');
      this.hud.setHint(
        err
          ? `Town walls: ${err}`
          : this.roadAnchor
            ? `Town wall: ${n} sections · ${n * (c.stone ?? 0)} stone, ${n * (c.dressedstone ?? 0)} dressed stone, ${n * (c.gold ?? 0)} coins · roads it crosses become gates · keep clicking to continue`
            : 'Click where the wall starts, then where it ends · roads it crosses get gate towers',
        !!err,
      );
    } else if (tool.kind === 'road' && tool.wall && this.curving()) {
      // A town wall along a free curve: sections on clear tiles, gates over roads.
      const pts: [number, number][] = [...this.curvePts, [ftx, fty]];
      const c = BUILDINGS.wall.cost;
      if (pts.length >= 2) {
        ov.curve = curveSamples(pts, 0.25);
        ov.tiles = curveTiles(s, pts).map((i) => {
          const x = i % s.width;
          const y = (i - x) / s.width;
          return { x, y, ok: s.road[i] > 0 || !placementError(s, 'wall', x, y) };
        });
        ov.tileColor = 'road';
        const n = ov.tiles.filter((t) => !s.road[idx(s, t.x, t.y)] && !placementError(s, 'wall', t.x, t.y)).length;
        const gates = ov.tiles.filter((t) => s.road[idx(s, t.x, t.y)] > 0).length;
        const err = wallCurveError(s, pts);
        this.hud.setHint(
          err
            ? `Town wall: ${err}`
            : `Town wall: ${n} sections · ${n * (c.stone ?? 0)} stone, ${n * (c.dressedstone ?? 0)} dressed stone, ${n * (c.gold ?? 0)} coins${gates ? ` · ${gates} gate${gates > 1 ? 's' : ''}` : ''} · click to add a bend · click the last bend again, Enter or right-click to finish`,
          !!err,
        );
      } else {
        this.hud.setHint(isUnlocked(s, 'wall') ? 'Town wall: click where it starts, then each bend; it follows a smooth curve · roads it crosses get gates' : `Town walls: ${lockReason(s, 'wall')}`, !isUnlocked(s, 'wall'));
      }
    } else if (tool.kind === 'road' && this.curving()) {
      const pts = [...this.curvePts, this.snapToRoad(ftx, fty)];
      if (pts.length >= 2) {
        ov.curve = curveSamples(pts, 0.25);
        ov.tiles = curveTiles(s, pts).map((i) => {
          const x = i % s.width;
          const y = (i - x) / s.width;
          const e = roadError(s, x, y, !!tool.paved);
          return { x, y, ok: !e || e === 'Already a road' || e === 'Already paved' };
        });
        ov.tileColor = 'road';
        const err = curveError(s, pts, !!tool.paved);
        this.hud.setHint(err ? `Road: ${err}` : `Road: ${ov.tiles.filter((t) => !s.road[idx(s, t.x, t.y)]).length} new tiles · click to add a bend · click the last bend again, Enter or right-click to finish`, !!err);
      } else {
        this.hud.setHint('Road: click where it starts, then click each bend; it follows a smooth curve', false);
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
    } else if (this.coverage) {
      this.hud.showCoverage(this.coverage);
    } else {
      this.hud.setHint('', false);
    }
    return ov;
  }

  /** A hand-chosen turn for free placement (, and .), or null to face the nearest road. */
  private freeTurn: number | null = null;

  /** Where a freely placed building would stand under the pointer, and its angle. */
  private freeSpot(type: BuildingType, fx: number, fy: number): { cx: number; cy: number; rot: number } {
    const s = this.state;
    if (this.freeTurn !== null) return { cx: fx, cy: fy, rot: this.freeTurn };
    const d = BUILDINGS[type];
    const reach = Math.max(d.w, d.h) / 2 + 3;
    // The nearest point of road, and which way the road runs there.
    let best: { x: number; y: number; d: number; tx: number; ty: number } | null = null;
    const consider = (x: number, y: number, tx: number, ty: number) => {
      const dist = Math.hypot(x - fx, y - fy);
      if (dist <= reach && (!best || dist < best.d)) best = { x, y, d: dist, tx, ty };
    };
    for (const cv of s.curves ?? []) {
      const pts = curveSamples(cv.pts, 0.25);
      for (let k = 0; k < pts.length; k++) {
        const a = pts[Math.max(0, k - 1)];
        const b = pts[Math.min(pts.length - 1, k + 1)];
        consider(pts[k][0], pts[k][1], b[0] - a[0], b[1] - a[1]);
      }
    }
    const road = (x: number, y: number) => inBounds(s, x, y) && s.road[idx(s, x, y)] > 0;
    for (let y = Math.floor(fy - reach); y <= Math.ceil(fy + reach); y++) {
      for (let x = Math.floor(fx - reach); x <= Math.ceil(fx + reach); x++) {
        if (!road(x, y)) continue;
        const across = road(x - 1, y) || road(x + 1, y);
        const along = road(x, y - 1) || road(x, y + 1);
        // A straight run: its direction; a crossing or a lone tile: none.
        consider(x + 0.5, y + 0.5, across && !along ? 1 : 0, along && !across ? 1 : 0);
      }
    }
    const b = best as { x: number; y: number; d: number; tx: number; ty: number } | null;
    if (!b) return { cx: fx, cy: fy, rot: 0 };
    let nx = fx - b.x;
    let ny = fy - b.y;
    const len = Math.hypot(b.tx, b.ty);
    if (len > 0) {
      // Square to the road: the normal on the pointer's side of it.
      const px = -b.ty / len;
      const py = b.tx / len;
      const side = px * nx + py * ny >= 0 ? 1 : -1;
      nx = px * side;
      ny = py * side;
    } else {
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
    }
    // Front (+y, turned by rot) faces the road; snapped to 5° so rows line up.
    const raw = Math.atan2(nx, -ny);
    const rot = Math.round(raw / (Math.PI / 36)) * (Math.PI / 36);
    // Close to the road, the building steps back to stand just off its edge.
    if (len > 0 && b.d < d.h / 2 + 1.6) return { cx: b.x + nx * (d.h / 2 + 0.45), cy: b.y + ny * (d.h / 2 + 0.45), rot };
    return { cx: fx, cy: fy, rot };
  }

  private buildHint(type: BuildingType, x: number, y: number, err: string | null): string {
    const d = BUILDINGS[type];
    if (err) return `${d.name}: ${err}`;
    if (GATHERERS.has(type)) {
      // No area to fill: what matters is how far the workers must walk.
      const c = centerOf(x, y, d.w, d.h);
      const dist = nearestResource(this.state, type, c);
      const what = { woodcutter: 'trees', quarry: 'rock', mine: 'ore', forager: 'berry bushes', hunter: 'game', fisher: 'fish' }[type as string] ?? 'resources';
      if (dist === null) return `${d.name}: no ${what} within reach · the workers would have nothing to do`;
      const walk = dist < 6 ? 'a short walk' : dist < 14 ? 'a fair walk' : 'a long walk: they will lose time on the way';
      return `${d.name}: nearest ${what} ${Math.round(dist)} tiles away, ${walk} · Click to place`;
    }
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

  /** Protect-wood click: two corners mark a wood; two clicks on one inside lift it. */
  private clickGrove(tx: number, ty: number): void {
    const s = this.state;
    if (!inBounds(s, tx, ty)) return;
    if (!this.zoneAnchor) {
      this.zoneAnchor = { x: tx, y: ty };
      return;
    }
    const a = this.zoneAnchor;
    this.zoneAnchor = null;
    if (a.x === tx && a.y === ty) {
      if (unprotectGrove(s, tx, ty)) {
        this.hud.sound('demolish');
        this.hud.flashInfo('The woodcutters may fell those trees again');
      }
      return;
    }
    const err = protectGrove(s, a.x, a.y, tx, ty);
    if (err) {
      this.hud.flash(err);
      return;
    }
    this.hud.sound('place');
    s.dirty = true;
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
  /** Bends of the curved road being drawn (3D view), in tiles. */
  private curvePts: [number, number][] = [];

  /** Roads and town walls are drawn as free curves in the 3D view. */
  private curving(): boolean {
    return this.tool.kind === 'road' && this.renderer.threeD && !!this.view3d;
  }

  /** Starts and ends snap to a road close by, so curves join the network. */
  private snapToRoad(fx: number, fy: number): [number, number] {
    const s = this.state;
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    let best: [number, number] | null = null;
    let bd = 0.8;
    for (let y = ty - 1; y <= ty + 1; y++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        if (!inBounds(s, x, y) || !s.road[idx(s, x, y)]) continue;
        const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
        if (d < bd) {
          bd = d;
          best = [x + 0.5, y + 0.5];
        }
      }
    }
    return best ?? [fx, fy];
  }

  private clickCurve(fx: number, fy: number): void {
    if (!inBounds(this.state, Math.floor(fx), Math.floor(fy))) return;
    // Roads snap onto roads close by; walls go exactly where clicked.
    const p: [number, number] = this.tool.kind === 'road' && this.tool.wall ? [fx, fy] : this.snapToRoad(fx, fy);
    const last = this.curvePts[this.curvePts.length - 1];
    // Clicking the last bend again finishes the road.
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.5) {
      this.finishCurve();
      return;
    }
    this.curvePts.push(p);
  }

  /** Zones are drawn as free shapes in the 3D view. */
  private shaping(): boolean {
    return this.tool.kind === 'zone' && this.renderer.threeD && !!this.view3d;
  }

  /** Adds a corner to the shape being drawn; clicking the first corner closes it. */
  private clickShape(fx: number, fy: number): void {
    if (!inBounds(this.state, Math.floor(fx), Math.floor(fy))) return;
    const first = this.curvePts[0];
    if (first && this.curvePts.length >= 3 && Math.hypot(first[0] - fx, first[1] - fy) < 0.6) {
      this.finishCurve();
      return;
    }
    const last = this.curvePts[this.curvePts.length - 1];
    if (last && Math.hypot(last[0] - fx, last[1] - fy) < 0.3) return;
    this.curvePts.push([fx, fy]);
  }

  private finishShape(): void {
    const s = this.state;
    const pts = this.curvePts;
    this.curvePts = [];
    if (this.tool.kind !== 'zone' || pts.length < 3) return;
    const err = shapeError(s, this.tool.type, pts);
    if (err) {
      this.hud.flash(err);
      return;
    }
    const b = placeShape(s, this.tool.type, pts);
    if (b) {
      this.hud.sound('place');
      this.setTool({ kind: 'select' });
      this.hud.closeCategory();
      this.select(b.id);
    }
  }

  private finishCurve(): void {
    if (this.tool.kind === 'zone') {
      this.finishShape();
      return;
    }
    const s = this.state;
    const pts = this.curvePts;
    this.curvePts = [];
    if (pts.length < 2) return;
    if (this.tool.kind === 'road' && this.tool.wall) {
      const err = wallCurveError(s, pts);
      if (err) this.hud.flash(err);
      else if (layWallCurve(s, pts)) this.hud.sound('stone');
      return;
    }
    const paved = this.tool.kind === 'road' && !!this.tool.paved;
    const err = curveError(s, pts, paved);
    if (err) {
      this.hud.flash(err);
      return;
    }
    const n = layCurve(s, pts, paved);
    if (n) {
      recompute(s);
      this.hud.sound('road');
    }
  }

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
    this.freeTurn = null;
    this.curvePts = [];
    if (t.kind !== 'build') this.view3d?.setGhost(null, 0);
    this.dragTile = null;
    this.roadAnchor = null;
    this.zoneAnchor = null;
    if (t.kind !== 'select') {
      this.selected = null;
      this.selectedAgent = null;
    }
    this.canvas.classList.toggle('tool', t.kind !== 'select');
    this.hud.update();
  }

  select(id: number | null): void {
    this.selected = id;
    this.selectedAgent = null;
    this.hud.update();
  }

  private clickTile(sx: number, sy: number): void {
    if (this.photo) return;
    const s = this.state;
    const [ftx, fty] = this.renderer.screenToTile(sx, sy);
    const tx = Math.floor(ftx);
    const ty = Math.floor(fty);
    const tool = this.tool;
    if (tool.kind === 'build') {
      let b: Building | null;
      if (this.renderer.threeD && this.view3d && !BUILDINGS[tool.type].zone) {
        const f = this.freeSpot(tool.type, ftx, fty);
        const err = freePlacementError(s, tool.type, f.cx, f.cy, f.rot);
        if (err) {
          this.hud.flash(err);
          return;
        }
        b = placeFree(s, tool.type, f.cx, f.cy, f.rot);
      } else {
        const p = this.ghostPos(tool.type, ftx, fty);
        const err = placementError(s, tool.type, p.x, p.y);
        if (err) {
          this.hud.flash(err);
          return;
        }
        b = placeOrder(s, tool.type, p.x, p.y);
      }
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
        const step = b && this.demolishBuilding(b);
        if (step) this.hud.sound('demolish');
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
      // A villager under the cursor comes before the building behind them.
      const folk = this.pickAgent(sx, sy);
      if (folk) {
        this.select(null);
        this.selectedAgent = folk.key;
        this.hud.update();
        this.hud.closeCategory();
        return;
      }
      const occ = this.pickBuilding(sx, sy);
      this.select(occ);
      this.hud.closeCategory();
    }
  }

  /** The villager selected on the map (their key), if any. */
  selectedAgent: string | null = null;

  /** The villager whose figure is under the cursor, if any. */
  private pickAgent(sx: number, sy: number): Agent | null {
    const z = this.renderer.cam.zoom;
    let best: Agent | null = null;
    let bestD = 9 * z;
    for (const a of this.agents.agents) {
      if (!a.visible || a.fadeIn < 0.5 || a.role.kind === 'cart') continue;
      const [px, py] = this.renderer.tileToScreen(a.x + a.ox * 0.25, a.y + a.oy * 0.25);
      const d = Math.hypot(px - sx, py - 8 * z - sy);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
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
    if (this.tool.kind === 'road' && this.tool.wall) {
      let placed = 0;
      for (const t of this.roadTiles(tx, ty)) {
        if (s.road[idx(s, t.x, t.y)] > 0 || placementError(s, 'wall', t.x, t.y)) continue;
        if (placeOrder(s, 'wall', t.x, t.y)) placed++;
      }
      if (placed) this.hud.sound('stone');
      return;
    }
    const paved = this.tool.kind === 'road' && !!this.tool.paved;
    for (const t of this.roadTiles(tx, ty)) if (planRoad(s, t.x, t.y, paved)) n++;
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
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.renderer.cam.zoom, angle: Math.atan2(b.y - a.y, b.x - a.x) };
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
          if (this.photo) this.setPhoto(false);
          else this.cancelOrDeselect();
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
        // A two-finger twist turns the 3D view a quarter round, the way the fingers turn.
        let twist = Math.atan2(b.y - a.y, b.x - a.x) - this.pinch.angle;
        twist = Math.atan2(Math.sin(twist), Math.cos(twist));
        if (this.renderer.threeD && Math.abs(twist) > 0.6) {
          this.turnView(Math.sign(twist));
          this.pinch.angle += twist;
        }
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
        if (this.photo) this.setPhoto(false);
        else this.cancelOrDeselect();
        return;
      }
      if (df.button !== 0) return;
      if (this.tool.kind === 'road') {
        if (!this.moved) {
          if (this.curving()) this.clickCurve(ftx, fty);
          else this.clickRoad(tx, ty);
        }
        return;
      }
      if (this.tool.kind === 'zone') {
        if (!this.moved) {
          if (this.shaping()) this.clickShape(ftx, fty);
          else this.clickZone(this.tool.type, tx, ty);
        }
        return;
      }
      if (this.tool.kind === 'grove') {
        if (!this.moved) this.clickGrove(tx, ty);
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
        if (this.photo) {
          this.setPhoto(false);
          return;
        }
        if (this.hud.handleEscape()) return;
        if (this.coverage) {
          this.coverage = null;
          this.hud.showCoverage(null);
          return;
        }
        if (this.curvePts.length) {
          this.curvePts = [];
          return;
        }
        if (this.tool.kind === 'road' && this.roadAnchor) this.roadAnchor = null;
        else if ((this.tool.kind === 'zone' || this.tool.kind === 'grove') && this.zoneAnchor) this.zoneAnchor = null;
        else if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
        else if (this.selected !== null || this.selectedAgent) this.select(null);
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
      } else if (k === 'v') {
        this.cycleCoverage();
      } else if ((k === '[' || k === ']') && this.renderer.threeD) {
        this.turnView(k === '[' ? -1 : 1);
      } else if (k === 'enter' && this.curvePts.length) {
        this.finishCurve();
      } else if (k === 'u') {
        this.setPhoto(!this.photo);
      } else if ((k === ',' || k === '.') && this.tool.kind === 'build' && this.renderer.threeD) {
        // Turn the building being placed by 15°, from where it currently faces.
        const lp = this.lastPointer;
        const [fx, fy] = lp ? this.renderer.screenToTile(lp.x, lp.y) : [0, 0];
        const cur = this.freeSpot(this.tool.type, fx, fy).rot;
        this.freeTurn = cur + (k === ',' ? -1 : 1) * (Math.PI / 12);
      } else if (k === 'x' || k === 'delete') {
        this.setTool({ kind: 'demolish' });
      } else if (k === 'p') {
        this.setTool(this.tool.kind === 'grove' ? { kind: 'select' } : { kind: 'grove' });
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
    const hall = seatOf(this.state);
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
(window as unknown as Record<string, unknown>).cl = { layWallCurve, layCurve, layRoads, placeShape, placeOrder, buildRoad, planRoad, buyAnimal, stepDay, recompute, placementError, playBot, placeZone, setYard, keepOf, log };

/** Hands the player a file to save. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
