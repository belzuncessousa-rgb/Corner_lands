import './ui/styles.css';
import './ui/painted.css';
import './ui/oldwood.css';
import { deleteSave, listSaves, loadGame, saveGame } from './api';
import { BUILDINGS, BUILD_ORDER, DAY_SECONDS, GATHER_REACH, GATHERERS, MONTH_NAMES, TIERS } from './game/data';
import { playBot } from './game/autoplay';
import { autoResolve, TITLES } from './game/events';
import { placeName, townName } from './game/names';
import { StateRng } from './game/rng';
import { deserialize, serialize } from './game/save';
import {
  seasonOf,
  BRIDGE_COST,
  buildRoad,
  layRoads,
  planRoad,
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
  clearTree,
  moveError,
  startMove,
  demolishBlocker,
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
  COBBLE_COST,
  ROYAL_COST,
  ROYAL_TIER,
  stepDay,
  updateHappiness,
  yearOf,
  keepOf,
  townScore,
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
import { knows, learnEverything } from './game/unlocks';
import { grantCharter } from './game/charters';
import { penShoal, reachOf } from './game/levels';
import { Wildlife } from './render/wildlife';
import { type Overlay, Renderer } from './render/renderer';
import { type LensData, lensData } from './render/lens';
import { Tutor } from './ui/tutorial';
import { installWood } from './ui/wood';
import { installIconPaint } from './ui/icons';
import { Hud } from './ui/hud';

export type Tool =
  | { kind: 'select' }
  | { kind: 'build'; type: BuildingType }
  | { kind: 'road'; paved?: boolean; cobbled?: boolean; royal?: boolean; wall?: boolean; lay?: BuildingType }
  | { kind: 'zone'; type: BuildingType }
  | { kind: 'demolish' }
  | { kind: 'grove' }
  /** Choosing a new spot for a building (its id). */
  | { kind: 'move'; id: number };

const SPEEDS = [0, 1, 3, 8];

/** Autosaves of different settlements kept before the oldest is removed. */
const AUTOSAVES_KEPT = 3;


/** Services whose reach the V overlay can show. */
const COVERAGE_TYPES: BuildingType[] = ['well', 'market', 'tavern', 'church'];

/** Pixels a pointer may move and still count as a click: more for fingers. */
const MOUSE_SLOP = 6;
const TOUCH_SLOP = 14;
/** Holding a finger this long acts as a right-click. */
/** Game days in one turn of day and night (two a month). */
const DAYS_PER_CYCLE = 5;
const LONG_PRESS_MS = 500;

export class Game {
  state: GameState;
  renderer: Renderer;
  agents = new AgentSystem();
  wildlife = new Wildlife();
  hud: Hud;
  tutor: Tutor;
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
  /** How far the current day has gone, 0 to 1 (the month bar fills smoothly). */
  get dayFraction(): number {
    return Math.min(1, this.simAcc / DAY_SECONDS);
  }
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
  /** The lens the map is seen through: as it is, or greyed with its resources lit up (L). */
  lens: 'normal' | 'resources' = 'normal';
  private lensCache: { data: LensData; at: number } | null = null;

  /** Switches between the lenses: the land as it is, and its resources. */
  setLens(lens: 'normal' | 'resources'): void {
    this.lens = lens;
    this.lensCache = null;
    if (lens !== 'normal' && this.coverage) {
      this.coverage = null;
      this.hud.showCoverage(null);
    }
    this.hud.update();
  }

  /** Demolishes a building (from the tool or the inspector). There is no taking it back. */
  demolishBuilding(b: Building): boolean {
    const why = demolishBlocker(this.state, b);
    if (why) {
      this.hud.flash(`${why}.`);
      return false;
    }
    if (!demolishWithUndo(this.state, b)) return false;
    log(this.state, `${BUILDINGS[b.type].name} demolished.`, 'info');
    return true;
  }


  /** Cycles the reach overlay: wells, markets, taverns, churches, off. */
  cycleCoverage(): void {
    const order: (BuildingType | null)[] = [...COVERAGE_TYPES, null];
    this.coverage = order[(order.indexOf(this.coverage) + 1) % order.length];
    if (this.coverage && this.lens !== 'normal') this.setLens('normal');
    this.hud.showCoverage(this.coverage);
  }

  /** Right-click (or a long press): drop the half-drawn road or zone, then the tool, then the selection. */
  private cancelOrDeselect(): void {
    if (this.tool.kind === 'road' && this.roadAnchor) this.roadAnchor = null;
    else if ((this.tool.kind === 'zone' || this.tool.kind === 'grove') && this.zoneAnchor) this.zoneAnchor = null;
    else {
      // Putting the tool down closes the build menu it came from too.
      if (this.tool.kind !== 'select') this.setTool({ kind: 'select' });
      else this.select(null);
      if (this.hud.categoryOpen) this.hud.closeCategory();
    }
  }
  private dragTile: { x: number; y: number } | null = null;
  /** Where the road being laid starts; the next click finishes a segment. */
  private roadAnchor: { x: number; y: number } | null = null;
  /** The group the hedges or flower beds being laid now belong to. */
  private layGroup = 0;
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
    installWood();
    installIconPaint();
    this.tutor = new Tutor(this);
    this.renderer.resize();
    this.resetView();
    this.bindInput();
    window.addEventListener('resize', () => this.renderer.resize());
    requestAnimationFrame((t) => this.frame(t));
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

  newGame(seed: number, mode: 'normal' | 'relaxed' | 'hardy' = 'normal', name?: string, land: Land = 'meadow', tutorial = false): void {
    this.state = generateWorld(seed, { relaxed: mode === 'relaxed', hardy: mode === 'hardy', land, plain: tutorial });
    this.state.founded = Date.now();
    this.state.name = name?.trim().slice(0, 40) || placeName(seed);
    // Fingamoboblius drops in uninvited only on a first settlement (or the tutorial).
    let founded = 0;
    try {
      founded = Number(localStorage.getItem('cornerlands.founded') ?? '0') || 0;
      localStorage.setItem('cornerlands.founded', String(founded + 1));
    } catch {
      /* ignore */
    }
    if (tutorial || founded === 0) this.state.firstGame = true;
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
    for (const t of ['manorgarden', 'cathedral', 'guildhall', 'belltower'] as const) {
      if (s.buildings.some((b) => b.type === t && b.build >= 1)) deeds.push(BUILDINGS[t].name);
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

  /**
   * The time of day, 0 at dawn to 1 at the next: one turn of day and night
   * spans DAYS_PER_CYCLE game days, so a month sees two.
   */
  private clock(): number {
    return ((this.state.day % DAYS_PER_CYCLE) + this.simAcc / DAY_SECONDS) / DAYS_PER_CYCLE;
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
    this.agents.update(this.state, gameDt, this.clock());
    this.wildlife.update(this.state, gameDt);
    // Dusk only at normal speed: faster, the days would flicker.
    this.renderer.setDayTime(this.clock(), !this.demo && this.speed <= 1, dt, seasonOf(this.state.day) === 3);
    this.renderer.dayFrac = this.dayFraction;
    this.renderer.render(this.state, this.agents.agents, this.overlay(), running ? dt : 0, this.wildlife.animals);
    this.hud.minimap.update(dt);
    this.tutor.update(dt);
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

  /** Where a building being moved would stand, centred on the pointer. */
  private movePos(b: Building, tx: number, ty: number): { x: number; y: number } {
    return { x: Math.floor(tx - b.w / 2 + 0.5), y: Math.floor(ty - b.h / 2 + 0.5) };
  }

  private lastPointer: { x: number; y: number } | null = null;

  private overlay(): Overlay {
    const ov: Overlay = {};
    const s = this.state;
    if (this.selectedAgent) ov.agent = this.selectedAgent;
    if (this.lens === 'resources') {
      // Berries ripen and herds move: look again every second or so.
      const now = performance.now();
      if (!this.lensCache || now - this.lensCache.at > 1000) this.lensCache = { data: lensData(s), at: now };
      ov.lens = this.lensCache.data;
    }
    if (this.coverage) {
      const type = this.coverage;
      // The same buildings coveredBy counts: staffed ones, and a cathedral for the church.
      const circles = s.buildings
        .filter((b) => (b.type === type || (type === 'church' && b.type === 'cathedral')) && b.build >= 1)
        .filter((b) => BUILDINGS[b.type].workers === 0 || (b.workers > 0 && !hasProblem(b)))
        .map((b) => ({ cx: bCenter(b).x, cy: bCenter(b).y, r: reachOf(b) }))
        .filter((c) => c.r > 0);
      const homes = new Map<number, boolean>();
      for (const b of s.buildings) if (b.type === 'house' && b.build >= 1) homes.set(b.id, coveredBy(s, b, type));
      ov.coverage = { circles, homes };
    }
    if (this.selected !== null) {
      ov.selected = this.selected;
      const b = s.buildings.find((o) => o.id === this.selected);
      if (b) {
        const d = BUILDINGS[b.type];
        // Only services reach: workplaces walk as far as they must.
        if (d.radius) {
          const c = bCenter(b);
          ov.range = { cx: c.x, cy: c.y, r: reachOf(b), highlight: rangeHighlighter(s, b.type) };
        }
        ov.crew = this.crewOf(b);
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
    if (tool.kind === 'move') {
      const b = s.buildings.find((o) => o.id === tool.id);
      if (b) {
        const p = this.movePos(b, ftx, fty);
        const err = moveError(s, b, p.x, p.y);
        ov.ghost = { type: b.type, x: p.x, y: p.y, ok: !err };
        ov.selected = b.id;
        this.hud.setHint(err ? `Move the ${BUILDINGS[b.type].name}: ${err}` : `Move the ${BUILDINGS[b.type].name} here · no materials, builders take it down and put it up again; it keeps working until then · right-click to cancel`, !!err);
      }
    } else if (tool.kind === 'build') {
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
      // Tended from the nearest workplace of its kind, however far; the walk only slows them.
      // A marketplace tends itself: show the homes it would serve instead.
      const selfTended = owner === tool.type;
      const zc = { x: x0 + w / 2, y: y0 + h / 2 };
      const tenders = s.buildings.filter((o) => o.type === owner && Math.hypot(bCenter(o).x - zc.x, bCenter(o).y - zc.y) <= GATHER_REACH + Math.max(w, h) / 2);
      const nearest = tenders.sort((a, b) => Math.hypot(bCenter(a).x - zc.x, bCenter(a).y - zc.y) - Math.hypot(bCenter(b).x - zc.x, bCenter(b).y - zc.y))[0];
      const near = selfTended ? true : !!nearest;
      if (selfTended && d.radius) ov.range = { cx: zc.x, cy: zc.y, r: d.radius, highlight: rangeHighlighter(s, tool.type) };
      const cost = zoneCost(tool.type, w, h);
      const costText = cost.wood ? ` · ${cost.wood} timber for fences` : cost.gold ? ` · ${cost.gold} coins for saplings` : '';
      const stalls = tool.type === 'market' ? ` · room for ${Math.max(1, Math.min(6, Math.floor((w * h) / 6)))} stalls` : '';
      if (!this.zoneAnchor) {
        this.hud.setHint(`${d.name}: click one corner, then the opposite corner · ${d.zone!.min}–${d.zone!.max} tiles a side${selfTended ? ' · free' : ''}`, false);
      } else {
        const far = nearest ? Math.round(Math.hypot(bCenter(nearest).x - zc.x, bCenter(nearest).y - zc.y)) : 0;
        const where = selfTended ? '' : nearest ? ` · tended from the ${ownerName}, ${far} tiles away${far > 8 ? ' (a long walk: slower work)' : ''}` : ` · no ${ownerName} yet: nobody will tend it`;
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
    } else if (tool.kind === 'road' && tool.wall && tool.lay) {
      // Hedges and flower beds: laid along a line, one to a tile.
      const type = tool.lay;
      const tiles = this.roadTiles(tx, ty);
      ov.tiles = tiles.map((t) => ({ ...t, ok: !placementError(s, type, t.x, t.y) }));
      ov.tileColor = 'road';
      const n = tiles.filter((t) => !placementError(s, type, t.x, t.y)).length;
      const gold = n * (BUILDINGS[type].cost.gold ?? 0);
      this.hud.setHint(
        this.roadAnchor
          ? `${BUILDINGS[type].name}: ${n} · ${gold} coins · click to lay them, keep clicking to continue · right-click to finish`
          : `Click where the ${BUILDINGS[type].name.toLowerCase()}s start, then where they end`,
        gold > s.res.gold,
      );
    } else if (tool.kind === 'road' && tool.wall) {
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
    } else if (tool.kind === 'road') {
      const grade = tool.royal ? 4 : tool.cobbled ? 3 : tool.paved ? 2 : 1;
      const paved = grade === 2;
      const tiles = grade === 4 ? widen(this.roadTiles(tx, ty)) : this.roadTiles(tx, ty);
      const done = (t: { x: number; y: number }) => s.road[idx(s, t.x, t.y)] >= grade;
      ov.tiles = tiles.map((t) => ({ ...t, ok: !roadError(s, t.x, t.y, grade) || done(t) }));
      ov.tileColor = 'road';
      const fresh = tiles.filter((t) => !done(t));
      const n = fresh.filter((t) => !roadError(s, t.x, t.y, grade)).length;
      if (grade === 4) {
        this.hud.setHint(
          s.tier < ROYAL_TIER
            ? 'The Royal Road comes to Boroughs'
            : this.roadAnchor
              ? `Royal Road: ${n} tiles, two abreast · ${n * (ROYAL_COST.stone ?? 0)} stone, ${n * (ROYAL_COST.dressedstone ?? 0)} dressed stone (bridges three times) · keep clicking to continue · ${s.royalLinked ? 'joined edge to edge ✓' : 'join two opposite edges of the land for its trade'}`
              : 'Click where the Royal Road starts: it runs two tiles wide, and pays once it joins two opposite edges of the land',
          s.tier < ROYAL_TIER,
        );
      } else if (grade === 3) {
        const ds = n * (COBBLE_COST.dressedstone ?? 0);
        this.hud.setHint(
          !knows(s, 'x:cobbles')
            ? 'Learn cobbled streets first (the learning board)'
            : this.roadAnchor
              ? `Cobbled street: ${n} tiles · ${ds} dressed stone · click to lay it, keep clicking to continue · right-click to finish`
              : 'Click where the cobbled street starts · cobbling a road upgrades it · 2 dressed stone per tile',
          !knows(s, 'x:cobbles') || fresh.length * (COBBLE_COST.dressedstone ?? 0) > s.res.dressedstone,
        );
      } else if (paved) {
        const stone = n * (PAVING_COST.stone ?? 0);
        this.hud.setHint(
          !knows(s, 'x:stoneroad')
            ? 'Learn stone roads first (the learning board)'
            : this.roadAnchor
              ? `Paved road: ${n} tiles · ${stone} stone · click to lay it, keep clicking to continue · right-click to finish`
              : 'Click where the paved road starts · paving an existing road upgrades it · 2 stone per tile',
          !knows(s, 'x:stoneroad') || fresh.length * (PAVING_COST.stone ?? 0) > s.res.stone,
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
        b
          ? `Click to demolish ${BUILDINGS[b.type].name}${b.type === 'townhall' ? ' (not possible)' : ''}`
          : inBounds(s, tx, ty) && s.trees[idx(s, tx, ty)] && !s.road[idx(s, tx, ty)]
            ? 'Click to fell these trees and clear the ground (the timber is left) · drag to clear a line'
            : 'Click a building, or drag across roads or trees to remove them',
        b?.type === 'townhall',
      );
    } else if (this.coverage) {
      this.hud.showCoverage(this.coverage);
    } else if (this.lens === 'resources') {
      this.hud.setHint('Resource lens: rock, bog ore, berries, game and fish, and about how much of each · L or Esc to go back', false);
    } else {
      this.hud.setHint('', false);
    }
    return ov;
  }

  /** Lines from a building to the people working there or building it, wherever they are now. */
  private crewOf(b: Building): Overlay['crew'] {
    const to: { x: number; y: number }[] = [];
    let inside = 0;
    for (const a of this.agents.agents) {
      const r = a.role;
      if ((r.kind !== 'work' && r.kind !== 'build' && r.kind !== 'beast') || r.id !== b.id) continue;
      if (a.visible) to.push({ x: a.x, y: a.y });
      else inside++;
    }
    if (!to.length && !inside) return undefined;
    const c = bCenter(b);
    const d = BUILDINGS[b.type];
    return { cx: c.x, cy: c.y, h: d.zone ? 4 : 18 + Math.min(d.w, d.h) * 7, to, inside };
  }

  private buildHint(type: BuildingType, x: number, y: number, err: string | null): string {
    const d = BUILDINGS[type];
    if (err) return `${d.name}: ${err}`;
    if (GATHERERS.has(type)) {
      // No area to fill: what matters is how far the workers must walk.
      const c = centerOf(x, y, d.w, d.h);
      const dist = nearestResource(this.state, type, c);
      const what = { woodcutter: 'trees', quarry: 'rock', mine: 'ore', forager: 'berries', hunter: 'game', fisher: 'fish' }[type as string] ?? 'resources';
      if (dist === null) return `${d.name}: no ${what} within reach · the workers would have nothing to do`;
      // The walk as the villagers walk it: quicker along roads, slower through woods.
      const walk = dist < 6 ? 'a short walk' : dist < 14 ? 'a fair walk' : 'a long walk: they will lose time on the way';
      return `${d.name}: nearest ${what} ${Math.round(dist)} tiles' walk away, ${walk} · Click to place`;
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
  private clickRoad(tx: number, ty: number): void {
    if (!inBounds(this.state, tx, ty)) return;
    if (!this.roadAnchor) {
      this.roadAnchor = { x: tx, y: ty };
      // Hedges and beds laid from here until the tool lets go belong together.
      this.layGroup = this.state.nextId;
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
    if (tool.kind === 'move') {
      const b = s.buildings.find((o) => o.id === tool.id);
      if (!b) return this.setTool({ kind: 'select' });
      const p = this.movePos(b, ftx, fty);
      const err = moveError(s, b, p.x, p.y);
      if (err) {
        this.hud.flash(err);
        return;
      }
      if (startMove(s, b, p.x, p.y)) {
        this.hud.sound('place');
        this.setTool({ kind: 'select' });
        this.select(b.id);
      }
      return;
    }
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
      } else if (clearTree(s, tx, ty)) {
        recompute(s);
        this.hud.sound('demolish');
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
      // A draught animal stands for the building it works for.
      if (folk?.role.kind === 'beast') {
        this.select(folk.role.id);
        this.hud.closeCategory();
        return;
      }
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
    if (this.tool.kind === 'road' && this.tool.wall && this.tool.lay) {
      const type = this.tool.lay;
      let placed = 0;
      for (const t of this.roadTiles(tx, ty)) {
        if (placementError(s, type, t.x, t.y)) continue;
        const b = placeOrder(s, type, t.x, t.y);
        if (!b) continue;
        b.group = this.layGroup;
        placed++;
      }
      if (placed) this.hud.sound('place');
      return;
    }
    if (this.tool.kind === 'road' && this.tool.wall) {
      let placed = 0;
      for (const t of this.roadTiles(tx, ty)) {
        if (s.road[idx(s, t.x, t.y)] > 0 || placementError(s, 'wall', t.x, t.y)) continue;
        if (placeOrder(s, 'wall', t.x, t.y)) placed++;
      }
      if (placed) this.hud.sound('stone');
      return;
    }
    const grade = this.tool.kind === 'road' ? (this.tool.royal ? 4 : this.tool.cobbled ? 3 : this.tool.paved ? 2 : 1) : 1;
    for (const t of grade === 4 ? widen(this.roadTiles(tx, ty)) : this.roadTiles(tx, ty)) if (planRoad(s, t.x, t.y, grade)) n++;
    if (n) {
      recompute(s);
      this.hud.sound('road');
    }
  }

  private finishRoadRemoval(tx: number, ty: number): void {
    const s = this.state;
    let n = 0;
    // Dragging clears the roads along the line, or failing a road the trees.
    for (const t of this.roadTiles(tx, ty)) if (removeRoad(s, t.x, t.y) || clearTree(s, t.x, t.y)) n++;
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
        if (this.tutor?.locksCamera) return;
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
      // During the tutorial the guide moves the view; the player cannot.
      if (this.moved && panning && !this.tutor?.locksCamera) {
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
        if (!this.moved) this.clickRoad(tx, ty);
        return;
      }
      if (this.tool.kind === 'zone') {
        if (!this.moved) this.clickZone(this.tool.type, tx, ty);
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
        if (this.tutor?.locksCamera) return;
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
      // Arrow keys pan the view; inside a game portal's frame they must not scroll the page too.
      if (k.startsWith('arrow')) e.preventDefault();
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
        if (this.lens !== 'normal') {
          this.setLens('normal');
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
      } else if (k === 'y') {
        this.setTool({ kind: 'road', cobbled: true });
      } else if (k === 'k') {
        this.setTool({ kind: 'road', royal: true });
      } else if (k === 'v') {
        this.cycleCoverage();
      } else if (k === 'l') {
        this.setLens(this.lens === 'normal' ? 'resources' : 'normal');
      } else if (k === 'u') {
        this.setPhoto(!this.photo);
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
    if (this.modalOpen || this.tutor?.locksCamera) return;
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
(window as unknown as Record<string, unknown>).cl = { defs: BUILDINGS, placeOrder, buildRoad, planRoad, buyAnimal, stepDay, recompute, placementError, playBot, placeZone, setYard, keepOf, log, learnEverything, grantCharter, penShoal };

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

/** The Royal Road runs two abreast: each tile of the path with its neighbour beside it. */
function widen(path: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ x, y });
    }
  };
  path.forEach((t, k) => {
    const o = path[k + 1] ?? path[k - 1] ?? t;
    add(t.x, t.y);
    // Along x, the second lane is the next row; along y, the next column.
    if (o.x !== t.x) add(t.x, t.y + 1);
    else add(t.x + 1, t.y);
  });
  return out;
}
