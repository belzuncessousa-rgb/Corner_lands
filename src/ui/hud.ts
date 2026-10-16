import { placeName, townName, weeklySeed } from '../game/names';
import { deleteSave, listSaves, type SaveInfo } from '../api';
import {
  BUILDINGS,
  BUILD_ORDER,
  CATEGORY_NAMES,
  MONTH_NAMES,
  RESOURCE_INFO,
  SEASON_NAMES,
  EXPORT_PER_MARKET,
  TAX_LEVELS,
  TIERS,
  TRADE_PRICES,
  GOODS,
  GROUP_NAMES,
  RESOURCE_STORAGE,
  STORAGE_CAPACITY,
  DAYS_PER_MONTH,
} from '../game/data';
import { commission, commissionError, COMMISSIONS, nextTitle, takeTitle, titleError, TITLES, fairCost, fairError, fairPrestige, FAIR_TIER, feastCost, feastError, FESTIVALS, festivalError, getEvent, holdFair, holdFeast, holdFestival, resolveEvent } from '../game/events';
import { CHARTERS, CHARTER_TIER, PATHS, charterCost, charterError, grantCharter, hasCharter } from '../game/charters';
import { HOUSE_LEVELS, MANOR_LEVELS, buildingName, houseNeeds, startUpgrade, upgradeBlocker, upgradePlan, workersOf } from '../game/levels';
import { activeQuests } from '../game/quests';
import { StateRng } from '../game/rng';
import {
  canAfford,
  hasBuilt,
  housingOf,
  isUnlocked,
  log,
  monthOf,
  nextTierRequirements,
  recompute,
  seasonOf,
  setKeep,
  buyPrice,
  sellPrice,
  lockReason,
  prestigeIncome,
  setTrade,
  workDef,
  HOME_TRADES,
  setYard,
  YARDS,
  zonesOf,
  zoneArea,
  fieldForecast,
  FARM_BARN,
  CHAINS,
  chainReport,
  settlerBlocker,
  herdCapacity,
  HERDS,
  orchardMaturity,
  TEND_PER_TILE,
  labourSummary,
  bCenter,
  coveredBy,
  PAVING_TIER,
  setWorkers,
  setPriority,
  setRecipe,
  setSell,
  selling,
  keepOf,
  setTax,
  hasProblem,
  roomFor,
  storageCap,
  stored,
  totalFood,
  totalHousing,
  trade,
  yearOf,
  RETINUE_COST,
  RETINUE_PAY,
  RETINUE_TIER,
  dismissRetinue,
  raiseRetinue,
  retinueError,
  isMarketDay,
  MARKET_DAY,
  yearGoal,
  yearGoalMet,
} from '../game/sim';
import type { Building, BuildingType, Category, Cost, GoodsGroup, ResourceId } from '../game/types';
import type { StorageKind } from '../game/data';
import { RESOURCE_IDS } from '../game/types';
import { generateWorld, idx, inBounds } from '../game/world';
import type { Game } from '../main';
import { CATEGORY_ICONS, ICONS, SEASON_ICONS } from './icons';
import { Minimap } from './minimap';
import { Ambient } from './ambient';
import { folkDoing, folkName, folkThought, WISHES, workplaceOf } from './folk';

const ZONE_COST_NOTE: Partial<Record<BuildingType, string>> = {
  field: '<small>Free · draw it</small>',
  pasture: '<small>Fences: timber</small>',
  orchard: '<small>2 coins a tile</small>',
};
const YARD_ICON: Record<string, string> = { veg: 'vegetables', hens: 'eggs', bees: 'honey' };
const costText = (c: Cost) =>
  Object.entries(c)
    .map(([k, v]) => `${v} ${GOODS[k as ResourceId].name.toLowerCase()}`)
    .join(', ');

/** The number of the newest message (old saves without numbers count by position). */
function lastNumber(msgs: { n?: number }[]): number {
  return msgs.length ? (msgs[msgs.length - 1].n ?? msgs.length) : 0;
}

const REACH_ICON =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="#5a3a22" stroke-width="1.4" stroke-dasharray="2.5 1.8"/><circle cx="10" cy="10" r="2.6" fill="#3a5a8a"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function costHtml(cost: Cost, have?: Record<string, number>): string {
  return Object.entries(cost)
    .map(([k, v]) => {
      const poor = have && (have[k] ?? 0) < (v ?? 0);
      return `<span class="${poor ? 'neg' : ''}">${ICONS[k as ResourceId]}${v}</span>`;
    })
    .join('');
}

const lastHtml = new WeakMap<HTMLElement, string>();
/** Assigns innerHTML only when it changed, so buttons are not recreated mid-click. */
/** "Early Spring – Harvest" style description of a set of months. */
function seasonSpan(months: number[]): string {
  const sorted = [...months].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const m of sorted) {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else runs.push([m, m]);
  }
  // Join a run ending in late winter with one starting in early spring.
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === 11) {
    runs[0][0] = runs.pop()![0];
  }
  return runs.map(([a, b]) => (a === b ? MONTH_NAMES[a] : `${MONTH_NAMES[a]} – ${MONTH_NAMES[b]}`).toLowerCase()).join(', ');
}

function setHTML(el: HTMLElement, html: string): void {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

/** Goods listed in the top bar panels even before the first one is made. */
const ALWAYS_SHOWN: ResourceId[] = ['wood', 'stone', 'bread', 'berries', 'meat', 'fish'];

/** Just-in-time help: one short line, shown the first time each thing is used. */
const TIPS: Record<string, string> = {
  category: 'Pick a building card, then click the map. Builders fetch the materials from storage, so you can place it before you can afford it.',
  build: 'Green means a good spot. Right-click or Esc puts the tool down; Ctrl+Z takes a placement back for a few seconds.',
  zone: 'Fields, pastures and orchards are drawn: click one corner, then the opposite one. Bigger fields need more hands.',
  road: 'Click to start a road, click again to end it. Roads are optional, but villagers walk faster on them.',
  wall: 'Wall sections keep wolves and bandits out once there are enough of them. Small gates are left so villagers can pass.',
  grove: 'Woods you protect stay standing: woodcutters fell elsewhere. Good beside homes, the church or the cathedral.',
  demolish: 'Demolishing returns part of the cost. Changed your mind? Ctrl+Z puts it back for a few seconds.',
  'chip-happy': 'Happiness brings settlers. Town talk tells you what villagers wish for; click a line to see one of their homes.',
  'chip-pop': 'Who works where, and who is short of hands. Click a workplace in the list to go there and raise its priority.',
  'chip-food': 'Hover a good to see who makes it and who uses it. Set a stock target so workshops stop when you have enough.',
  'chip-treasury': 'Coins come from taxes, markets and trade. Prestige, from feasts, fairs and fine buildings, buys charters.',
  inspect: 'Pause a building to free its workers, or raise its priority. X or Delete demolishes the selected building.',
  villager: 'Every villager has a name and a thought. Their wishes tell you what the town lacks.',
  speed: 'Space pauses; 1, 2 and 3 set the speed. Press V to see which homes a well, market or church reaches.',
};

export class Hud {
  private el: Record<string, HTMLElement> = {};
  /** Open build category, or null when the build menu is folded away. */
  private category: Category | null = null;
  private lastSeason = -1;
  private hintText = '';
  private flashUntil = 0;
  private shownMessages = 0;
  private modal: HTMLElement | null = null;
  private audio: AudioContext | null = null;
  private ambient: Ambient | null = null;
  muted = false;
  private objectivesMin = true;
  private lastInspectorKey = '';
  private cardImgs = new Map<string, string>();
  minimap: Minimap;
  private lastTier = -1;

  constructor(
    private game: Game,
    private root: HTMLElement,
  ) {
    try {
      this.muted = localStorage.getItem('cornerlands.muted') === '1';
      this.uiScale = Number(localStorage.getItem('cornerlands.uiScale')) || 1;
      this.pauseOnBad = localStorage.getItem('cornerlands.pauseOnBad') === '1';
      this.tipsOn = localStorage.getItem('cornerlands.tipsOff') !== '1';
      this.tipsSeen = new Set(JSON.parse(localStorage.getItem('cornerlands.tips') ?? '[]') as string[]);
    } catch {
      /* ignore */
    }
    this.applyScale();
    root.classList.toggle('demo', game.demo);
    root.innerHTML = `
      <div id="top">
        <div class="stack">
          <div class="btnrow">
            <button id="menu-btn" class="panel icon-btn" data-action="menu" data-tip="Menu (Esc)">${CATEGORY_ICONS.menu}</button>
            <button class="panel icon-btn" data-action="chronicle" data-tip="<b>Chronicle</b><br>Everything that has happened in your lands.">${CATEGORY_ICONS.scroll}</button>
            <button class="panel icon-btn" data-action="production" data-tip="<b>Production Book</b><br>Every trade, what it takes and what it makes.">${ICONS.books}</button>
            <button class="panel icon-btn" data-action="charters" data-tip="<b>Town Charters</b><br>Spend prestige to specialise your town.">${ICONS.prestige}</button>
            <button class="panel icon-btn" data-action="coverage" data-tip="<b>Reach</b> (V)<br>Show where wells, markets, taverns and churches reach, and which homes they miss.">${REACH_ICON}</button>
          </div>
          <div id="objectives" class="panel"></div>
        </div>
        <div id="topbar" class="panel"></div>
        <div class="stack right">
          <div id="clock" class="panel"></div>
        </div>
      </div>
      <div id="season-banner"></div>
      <div id="log"></div>
      <div id="inspector" class="panel" style="display:none"></div>
      <div id="hint" class="panel" style="display:none"></div>
      <div id="buildbar" class="panel"></div>
      <div id="tooltip" class="panel"></div>
      <div id="chip-panel" class="panel" style="display:none"></div>`;
    for (const id of ['chip-panel', 'topbar', 'clock', 'objectives', 'log', 'inspector', 'hint', 'buildbar', 'tooltip', 'season-banner']) {
      this.el[id] = root.querySelector(`#${id}`)!;
    }
    this.minimap = new Minimap(root, game.renderer, () => game.state);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('mousemove', (e) => this.onTipMove(e));
    root.addEventListener('mouseleave', () => (this.el.tooltip.style.display = 'none'));
    // The mouse wheel scrolls a long row of building cards sideways.
    this.el.buildbar.addEventListener(
      'wheel',
      (e) => {
        const cards = (e.target as HTMLElement).closest('.cards') as HTMLElement | null;
        if (!cards || cards.scrollWidth <= cards.clientWidth) return;
        cards.scrollLeft += e.deltaY + e.deltaX;
        e.preventDefault();
      },
      { passive: false },
    );
    // Category chips open their breakdown on hover; a click pins it open.
    this.el.topbar.addEventListener('mouseover', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-chip]') as HTMLElement | null;
      if (chip && !this.pinnedChip) this.showChip(chip.dataset.chip!);
    });
    const leave = () => {
      if (this.pinnedChip) return;
      clearTimeout(this.chipTimer);
      this.chipTimer = window.setTimeout(() => this.showChip(null), 220);
    };
    const stay = () => clearTimeout(this.chipTimer);
    this.el.topbar.addEventListener('mouseleave', leave);
    this.el['chip-panel'].addEventListener('mouseleave', leave);
    this.el['chip-panel'].addEventListener('mouseenter', stay);
    this.el.topbar.addEventListener('mouseenter', stay);
    this.rebuild();
  }

  // ---------------------------------------------------------------- build

  rebuild(): void {
    this.lastTier = this.game.state.tier;
    this.lastSeason = seasonOf(this.game.state.day);
    this.category = null;
    this.shownMessages = lastNumber(this.game.state.messages);
    this.el.log.innerHTML = '';
    this.lastInspectorKey = '';
    this.renderBuildBar();
    this.update();
  }

  private cardImage(type: BuildingType): string {
    let url = this.cardImgs.get(type);
    if (!url) {
      url = this.game.renderer.previewDataUrl(type);
      this.cardImgs.set(type, url);
    }
    return url;
  }

  private renderBuildBar(): void {
    const g = this.game;
    const s = g.state;
    const cats = Object.keys(CATEGORY_NAMES) as Category[];
    const tool = g.tool;
    const tabs = cats
      .map(
        (c) =>
          `<button data-action="cat" data-cat="${c}" class="tab ${c === this.category ? 'active' : ''}" data-tip="<b>${CATEGORY_NAMES[c]}</b>">${CATEGORY_ICONS[c]}<span>${CATEGORY_NAMES[c]}</span></button>`,
      )
      .join('');
    const tools = `<span class="divider"></span>
      <button data-action="road" class="tab ${tool.kind === 'road' && !tool.paved ? 'active' : ''}" data-tip="<b>Road</b> (R)<br>Click to start, click again to lay it. Roads speed up walking; buildings work without them.">${ICONS.road}<span>Road</span></button>
      ${this.game.state.tier >= PAVING_TIER ? `<button data-action="road" data-paved="1" class="tab ${tool.kind === 'road' && tool.paved ? 'active' : ''}" data-tip="<b>Paved road</b> (T)<br>Cobbled stone: villagers walk a third faster than on dirt. 2 stone per tile; lay it over a dirt road to pave it.">${ICONS.paved}<span>Paving</span></button>` : ''}
      <button data-action="grove" class="tab ${tool.kind === 'grove' ? 'active' : ''}" data-tip="<b>Protect woods</b> (P)<br>Mark a wood the woodcutters must leave standing: click one corner, then the other. Click twice inside one to lift it.">${ICONS.grove}<span>Protect</span></button>
      <button data-action="demolish" class="tab ${tool.kind === 'demolish' ? 'active' : ''}" data-tip="<b>Demolish</b> (X)<br>Remove buildings or roads. Finished buildings return half their cost.">${ICONS.demolish}<span>Demolish</span></button>`;
    let cards = '';
    if (this.category) {
      cards = BUILD_ORDER.filter((t) => BUILDINGS[t].category === this.category)
        .map((t) => {
          const d = BUILDINGS[t];
          const locked = !isUnlocked(s, t);
          const poor = !canAfford(s, d.cost);
          const sel = (tool.kind === 'build' || tool.kind === 'zone') && tool.type === t;
          return `<div class="card ${sel ? 'sel' : ''} ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}" data-action="build" data-type="${t}" data-tip="${esc(this.buildingTip(t))}">
            ${d.hotkey ? `<span class="key">${d.hotkey}</span>` : ''}
            <img src="${this.cardImage(t)}" alt="" draggable="false">
            ${locked ? `<div class="lock">${d.tier > s.tier ? TIERS[d.tier].name : 'Charter'}</div>` : ''}
            <div class="name">${d.name}</div>
            <div class="cost">${d.zone ? ZONE_COST_NOTE[t] ?? '' : costHtml(d.cost, s.res)}</div>
          </div>`;
        })
        .join('');
    }
    this.el.buildbar.classList.toggle('open', !!this.category);
    this.el.buildbar.innerHTML = `${cards ? `<div class="cards">${cards}</div>` : ''}<div class="tabs">${tabs}${tools}</div>`;
    this.buildBarKey = this.buildBarState();
  }

  get categoryOpen(): boolean {
    return this.category !== null;
  }

  /** Folds the build menu away. */
  closeCategory(): void {
    if (!this.category) return;
    this.category = null;
    this.renderBuildBar();
  }

  private buildBarKey = '';
  private buildBarState(): string {
    const g = this.game;
    const s = g.state;
    const t = g.tool;
    return [
      this.category ?? '',
      t.kind,
      t.kind === 'build' || t.kind === 'zone' ? t.type : t.kind === 'road' && t.paved ? 'paved' : '',
      s.tier,
      ...BUILD_ORDER.map((b) => (canAfford(s, BUILDINGS[b].cost) ? 1 : 0)),
    ].join('|');
  }

  private buildingTip(t: BuildingType): string {
    const d = BUILDINGS[t];
    const lines = [`<b>${d.name}</b>`, d.desc];
    if (d.workers) lines.push(`Workers: ${d.workers}`);
    if (d.housing) lines.push(`Houses ${d.housing} villagers`);
    if (Object.keys(d.inputs).length) lines.push(`Uses: ${Object.entries(d.inputs).map(([k, v]) => `${v} ${RESOURCE_INFO[k as ResourceId].name}`).join(', ')}`);
    if (Object.keys(d.outputs).length) lines.push(`Makes: ${Object.entries(d.outputs).map(([k, v]) => `${v} ${RESOURCE_INFO[k as ResourceId].name}`).join(', ')}`);
    if (d.zone) lines.push('<i>Click one corner, then the opposite corner.</i>');
    const lock = lockReason(this.game.state, t);
    if (lock) lines.push(`<span class="neg">${esc(lock)}</span>`);
    else if (!canAfford(this.game.state, d.cost)) lines.push('<i>You can place it now; builders wait until the materials are in storage.</i>');
    return lines.join('<br>');
  }

  // ---------------------------------------------------------------- top bar

  private openChip: string | null = null;
  private pinnedChip = false;
  private chipTimer = 0;
  /** Text and panel size chosen in the menu (CSS zoom on the UI layer). */
  private uiScale = 1;
  /** Stop the clock when bad news arrives (famine, departures, fire). */
  private pauseOnBad = false;
  /** Short help shown the first time a panel or tool is opened. */
  private tipsOn = true;
  private tipsSeen = new Set<string>();

  private applyScale(): void {
    this.root.style.setProperty('zoom', this.uiScale === 1 ? '' : String(this.uiScale));
  }

  /** How much the UI layer is magnified on screen: client pixels per CSS pixel. */
  private zoom(): number {
    const w = this.root.offsetWidth;
    return w ? this.root.getBoundingClientRect().width / w : 1;
  }

  private showChip(id: string | null, pin = false): void {
    this.openChip = id;
    this.pinnedChip = !!id && pin;
    this.renderTopbar();
    this.renderChipPanel();
  }

  /** Happiness · Population · Food · Materials · Goods · Treasury. */
  private renderTopbar(): void {
    const s = this.game.state;
    const housing = totalHousing(s);
    const food = totalFood(s);
    const months = s.population ? food / s.population : 99;
    const sum = (g: GoodsGroup) => RESOURCE_IDS.reduce((a, r) => a + (GOODS[r].group === g ? Math.floor(s.res[r]) : 0), 0);
    const matFull = stored(s, 'materials') >= storageCap(s, 'materials');
    const foodFull = stored(s, 'food') >= storageCap(s, 'food');
    const chip = (id: string, cls: string, body: string) =>
      `<div class="res chip ${cls} ${this.openChip === id ? 'open' : ''}" data-chip="${id}" data-action="chip">${body}</div>`;
    const lab = labourSummary(s);
    const html = [
      chip('happy', s.happiness < 35 ? 'low' : '', `${ICONS.happy}${s.happiness}%`),
      chip('pop', '', `${ICONS.people}${s.population}<span class="delta">/${housing}</span>${lab.idle > 0 ? `<span class="badge" title="idle">${lab.idle}</span>` : ''}`),
      '<div class="sep"></div>',
      chip('food', months < 1.2 ? 'low' : foodFull ? 'full' : '', `${ICONS.bread}${Math.floor(food)}`),
      chip('materials', matFull ? 'full' : '', `${ICONS.materials}${sum('materials')}`),
      chip('goods', '', `${ICONS.goods}${sum('goods')}`),
      '<div class="sep"></div>',
      chip('treasury', '', `${ICONS.gold}${Math.floor(s.res.gold)}${s.res.prestige > 0 || s.tier >= 1 ? `<span class="prestige">${ICONS.prestige}${Math.floor(s.res.prestige)}</span>` : ''}`),
    ].join('');
    setHTML(this.el.topbar, html);
  }

  private renderChipPanel(): void {
    const panel = this.el['chip-panel'];
    const id = this.openChip;
    if (!id) {
      panel.style.display = 'none';
      return;
    }
    let html = '';
    if (id === 'happy') html = this.happyPanel();
    else if (id === 'pop') html = this.labourPanel();
    else if (id === 'treasury') html = this.treasuryPanel();
    else html = this.goodsPanel(id as GoodsGroup);
    setHTML(panel, `${this.pinnedChip ? '<button class="close" data-action="chip-close">✕</button>' : ''}${html}`);
    panel.style.display = 'block';
    const anchor = this.el.topbar.querySelector(`[data-chip="${id}"]`) as HTMLElement | null;
    if (anchor) {
      const z = this.zoom();
      const r = anchor.getBoundingClientRect();
      const w = panel.offsetWidth;
      panel.style.left = `${Math.max(6, Math.min(window.innerWidth / z - w - 6, (r.left + r.width / 2) / z - w / 2))}px`;
      panel.style.top = `${r.bottom / z + 6}px`;
    }
  }

  private happyPanel(): string {
    const s = this.game.state;
    const factors = s.happinessFactors
      .map((f) => `<div class="kv"><span>${esc(f.label)}</span><span class="${f.value >= 0 ? 'pos' : 'neg'}">${f.value > 0 ? '+' : ''}${f.value}</span></div>`)
      .join('');
    // How many finer homes have each of their needs met, worst first.
    const tally = new Map<string, { met: number; of: number; lacking?: number }>();
    for (const b of s.buildings) {
      if (b.type !== 'house' || b.level < 2 || b.build < 1) continue;
      for (const n of houseNeeds(s, b, b.level).slice(2)) {
        const t = tally.get(n.label) ?? { met: 0, of: 0 };
        t.of++;
        if (n.met) t.met++;
        else t.lacking ??= b.id;
        tally.set(n.label, t);
      }
    }
    const needs = [...tally]
      .sort((a, b) => a[1].met / a[1].of - b[1].met / b[1].of)
      .map(([label, t]) => {
        const full = t.met === t.of;
        const attrs = full ? 'class="kv"' : `class="kv link" data-action="goto-b" data-id="${t.lacking}" data-tip="Show a home that lacks this"`;
        return `<div ${attrs}><span>${esc(label)}</span><span class="${full ? 'pos' : 'neg'}">${t.met}/${t.of} homes</span></div>`;
      })
      .join('');
    // Town talk: the wishes most often heard in the lanes, in the villagers' words.
    const voices = new Map<string, { homes: number; at: number }>();
    for (const b of s.buildings) {
      if (b.type !== 'house' || b.build < 1 || b.residents === 0) continue;
      for (const u of houseNeeds(s, b, b.level).filter((n) => !n.met).map((n) => n.label)) {
        const v = voices.get(u) ?? { homes: 0, at: b.id };
        v.homes++;
        voices.set(u, v);
      }
    }
    const talk = [...voices]
      .sort((a, b) => b[1].homes - a[1].homes)
      .slice(0, 3)
      .map(([u, v]) => `<div class="talk link" data-action="goto-b" data-id="${v.at}" data-tip="Show one of these homes">“${esc(WISHES[u] ?? `We need ${u.toLowerCase()}.`)}” <small>— ${v.homes} home${v.homes > 1 ? 's' : ''}</small></div>`)
      .join('');
    return `<h3>${ICONS.happy} Happiness ${s.happiness}%</h3>
      <div class="bar"><i style="width:${s.happiness}%;background-position:${-220 + s.happiness * 2.2}px 0"></i></div>
      ${factors || '<i>No villagers yet</i>'}
      ${talk ? `<div class="sub">Town talk</div>${talk}` : ''}
      ${needs ? `<div class="sub">Needs of Timber Houses and Townhouses</div>${needs}` : ''}
      <p class="note">Above 50% settlers arrive, if there are homes and two months of food in store; below 30% families leave.${s.happinessTarget !== s.happiness ? ` Heading towards ${s.happinessTarget}%.` : ''}</p>`;
  }

  private labourPanel(): string {
    const s = this.game.state;
    const l = labourSummary(s);
    const housing = totalHousing(s);
    const bar = (have: number, slots: number) =>
      `<span class="lbar"><i style="width:${slots ? Math.min(100, (100 * have) / slots) : 0}%"></i></span>`;
    const cats = l.byCategory
      .filter((c) => c.slots > 0 || c.have > 0)
      .map((c) => `<div class="kv"><span>${CATEGORY_ICONS[c.cat] ?? ''}${CATEGORY_NAMES[c.cat]}</span><span>${bar(c.have, c.slots)} ${c.have}/${c.slots}</span></div>`)
      .join('');
    const short = l.short
      .slice(0, 5)
      .map((x) => `<div class="kv link" data-action="goto-b" data-id="${x.b.id}"><span>${esc(buildingName(x.b))}</span><span class="neg">${x.have}/${x.want}</span></div>`)
      .join('');
    const blocked = settlerBlocker(s);
    return `<h3>${ICONS.people} Villagers ${s.population} <small>of ${housing} beds</small></h3>
      <div class="kv"><span>Newcomers</span><span class="${blocked ? 'neg' : 'pos'}">${blocked ? esc(blocked) : 'Settlers are arriving'}</span></div>
      <div class="labour-sum">
        <div><b>${l.workers}</b><span>at work</span></div>
        <div><b>${l.builders}</b><span>building</span></div>
        <div><b>${l.idle}</b><span>idle</span></div>
        <div data-tip="Jobs resting for the season, or with stores already full"><b>${l.resting}</b><span>resting jobs</span></div>
      </div>
      ${cats ? `<div class="sub">Jobs filled</div>${cats}` : ''}
      ${short ? `<div class="sub">Short of hands</div>${short}` : ''}
      <p class="note">Select a workplace to set its workers and priority. Idle villagers help on building sites.</p>`;
  }

  /** Works of art prestige can buy once the great buildings stand. */
  private commissionRows(): string {
    const s = this.game.state;
    if (s.tier < 3) return '';
    return COMMISSIONS.map((c) => {
      const done = s.commissions?.includes(c.id);
      const err = commissionError(s, c.id);
      const tip = `<b>${c.name}</b><br>${esc(c.desc)}. +${c.happiness} happiness for good.<br>Costs ${c.prestige} prestige`;
      return `<div class="kv feast" data-tip="${esc(tip)}"><span>${c.name}</span><span>${
        done ? '<span class="pos">Made ✓</span>' : `<button data-action="commission" data-id="${c.id}" ${err ? `disabled title="${esc(err)}"` : ''}>Commission <small>${c.prestige} ${ICONS.prestige}</small></button>`
      }</span></div>`;
    }).join('');
  }

  /** The lord's title, and the next one prestige can buy. */
  private titleRow(): string {
    const s = this.game.state;
    const now = TITLES[s.title ?? 0];
    const next = nextTitle(s);
    if (!next) return `<div class="kv"><span>Title</span><b>${now.name}</b></div>`;
    if (s.tier < next.tier && !(s.title ?? 0)) return '';
    const err = titleError(s);
    const tip = `<b>${next.name}</b><br>${esc(next.boon)}.<br>Costs ${next.prestige} prestige${err ? `<br><span class=neg>${esc(err)}</span>` : ''}`;
    return `<div class="kv feast" data-tip="${esc(tip)}"><span>Title: <b>${now.name}</b></span><span><button data-action="title" ${err ? 'disabled' : ''}>Become ${next.name} <small>${next.prestige} ${ICONS.prestige}</small></button></span></div>`;
  }

  private treasuryPanel(): string {
    const s = this.game.state;
    const r = s.report;
    return `<h3>${ICONS.gold} Treasury</h3>
      <div class="kv"><span>Coins</span><b>${Math.floor(s.res.gold)}</b></div>
      <div class="kv"><span>Taxes last month</span><span class="pos">+${r.taxes}</span></div>
      ${r.trade ? `<div class="kv"><span>Merchants last month</span><span class="pos">+${r.trade}</span></div>` : ''}
      <div class="sub">Taxes</div>
      <div class="tax">${TAX_LEVELS.map(
        (t, i) =>
          `<button data-action="tax" data-level="${i}" class="${s.taxLevel === i ? 'active' : ''}" data-tip="<b>${t.name} taxes</b><br>${t.perHead} coins per villager per month.<br>Happiness ${t.happiness >= 0 ? '+' : ''}${t.happiness}">${t.name}</button>`,
      ).join('')}</div>
      <div class="kv" style="margin-top:8px"><span>${ICONS.prestige} Prestige</span><b>${Math.floor(s.res.prestige)}</b></div>
      <p class="note">${esc(GOODS.prestige.desc)}</p>
      ${
        s.tier >= FAIR_TIER
          ? `<div class="kv feast" data-tip="Once a year, endow a fair: merchants, jugglers and a tournament. Each fair is grander and dearer than the last. Brings prestige and +8 happiness for a season."><span>Fair</span><span>${
              fairError(s) && s.res.gold >= fairCost(s)
                ? `<small class="muted">${esc(fairError(s)!)}</small>`
                : `<button data-action="fair" ${fairError(s) ? 'disabled' : ''}>Hold a fair <small>${fairCost(s)}c · +${fairPrestige(s)} ${ICONS.prestige}</small></button>`
            }</span></div>`
          : ''
      }
      ${this.titleRow()}
      ${this.commissionRows()}
      <div class="row">${hasBuilt(s, 'market') ? '<button data-action="trade">⚖ Trade</button>' : ''}<button data-action="ledger">Ledger</button><button data-action="charters">${ICONS.prestige} Charters</button></div>`;
  }

  /**
   * Why a good is short or plentiful: who makes it and whether they are
   * working, who uses it, and which workplaces are waiting for it.
   */
  private goodDiagnosis(r: ResourceId): string {
    const s = this.game.state;
    const makes = (b: Building) => {
      const d = workDef(b);
      return r in d.outputs || !!d.recipes?.some((x) => r in x.outputs && (!x.charter || hasCharter(s, x.charter)));
    };
    const uses = (b: Building) => {
      const d = workDef(b);
      return r in d.inputs || !!d.recipes?.some((x) => r in x.inputs && (!x.charter || hasCharter(s, x.charter)));
    };
    const done = s.buildings.filter((b) => b.build >= 1);
    const lines: string[] = [];
    const makers = done.filter(makes);
    const byName = new Map<string, Building[]>();
    for (const b of makers) byName.set(buildingName(b), [...(byName.get(buildingName(b)) ?? []), b]);
    for (const [name, list] of byName) {
      const working = list.filter((b) => b.workers > 0 && !hasProblem(b)).length;
      const stalled = list.filter((b) => hasProblem(b));
      const resting = list.length - working - stalled.length;
      const parts = [`${working} at work`];
      if (resting) parts.push(`${resting} resting or unstaffed`);
      if (stalled.length) parts.push(`${stalled.length} stalled: ${esc(stalled[0].status.toLowerCase())}`);
      lines.push(`${esc(name)} ×${list.length} — ${parts.join(', ')}`);
    }
    if (!makers.length && GOODS[r].group !== 'currency') lines.push('<i>Nothing in your lands makes this yet.</i>');
    const users = done.filter(uses);
    if (users.length) lines.push(`Used by ${users.length} workplace${users.length > 1 ? 's' : ''}`);
    const waiting = done.filter((b) => b.lack === r && hasProblem(b));
    if (waiting.length) lines.push(`<span class="neg">⚠ ${waiting.length} waiting for it: ${esc(waiting.slice(0, 3).map((b) => buildingName(b)).join(', '))}</span>`);
    return lines.length ? `<br><br>${lines.join('<br>')}` : '';
  }

  private goodsPanel(group: GoodsGroup): string {
    const s = this.game.state;
    const market = hasBuilt(s, 'market');
    const ids = RESOURCE_IDS.filter((r) => GOODS[r].group === group && (s.seen?.includes(r) || s.res[r] > 0 || ALWAYS_SHOWN.includes(r)));
    const rows = ids
      .map((r) => {
        const g = GOODS[r];
        const flow = s.flow?.[r] ?? 0;
        const keep = keepOf(s, r);
        const sell = selling(s, r);
        const wanted = s.buildings.some((b) => b.lack === r && hasProblem(b));
        return `<tr data-tip="${esc(`<b>${g.name}</b><br>${esc(g.desc)}${g.food ? `<br>Feeds ${g.food} · ${g.foodGroup}` : ''}${this.goodDiagnosis(r)}`)}">
          <td class="ic">${ICONS[r]}</td><td>${g.name}${wanted ? ' <span class="neg" title="Workplaces are waiting for this">⚠</span>' : ''}</td>
          <td class="num"><b>${Math.floor(s.res[r])}</b></td>
          <td class="num flow ${flow > 0 ? 'pos' : flow < 0 ? 'neg' : ''}">${flow > 0 ? '+' : ''}${flow || ''}</td>
          <td class="keep" data-tip="<b>Keep in stock</b><br>Workers making ${g.name.toLowerCase()} rest once there are ${keep}, plus whatever building sites still need${market ? '; merchants buy what is above it if you sell' : ''}."><button data-action="keep" data-res="${r}" data-d="-10">−</button><span>${keep}</span><button data-action="keep" data-res="${r}" data-d="10">+</button></td>
          ${market && g.price ? `<td><button class="sell ${sell ? 'active' : ''}" data-action="sell" data-res="${r}" data-tip="${sell ? 'Selling the surplus above the target to merchants. Click to stop.' : 'Sell the surplus above the target to visiting merchants.'}">${ICONS.gold}</button></td>` : '<td></td>'}
        </tr>`;
      })
      .join('');
    const kind = group === 'food' ? 'food' : group === 'materials' ? 'materials' : null;
    let storage = '';
    if (group === 'goods') {
      storage = `<div class="kv" data-tip="Wares share the storehouses with materials; wheat, barley, oats and flour go to the granaries."><span>${ICONS.storage} Storehouses</span><span>${Math.floor(stored(s, 'materials'))} / ${storageCap(s, 'materials')}</span></div>
        <div class="kv"><span>${ICONS.granary} Granaries</span><span>${Math.floor(stored(s, 'food'))} / ${storageCap(s, 'food')}</span></div>`;
    } else if (kind) {
      const used = Math.floor(stored(s, kind));
      const cap = storageCap(s, kind);
      storage = `<div class="kv"><span>${kind === 'food' ? `${ICONS.granary} Granaries` : `${ICONS.storage} Storehouses`}</span><span class="${used >= cap ? 'neg' : ''}">${used} / ${cap}</span></div>
        <div class="progress"><i style="width:${Math.min(100, (100 * used) / Math.max(1, cap))}%"></i></div>`;
    }
    const extra =
      group === 'food'
        ? `<p class="note">Villagers eat ${s.population} a month${s.report.variety ? `; last month from ${s.report.variety} food group${s.report.variety > 1 ? 's' : ''}` : ''}.</p>`
        : '';
    return `<h3>${group === 'food' ? ICONS.bread : group === 'materials' ? ICONS.materials : ICONS.goods} ${GROUP_NAMES[group]}</h3>
      ${storage}
      <table class="goods">${rows || '<tr><td><i>Nothing yet</i></td></tr>'}</table>${extra}`;
  }

  // ---------------------------------------------------------------- update

  update(): void {
    const g = this.game;
    const s = g.state;

    this.renderTopbar();
    this.renderChipPanel();

    // Clock.
    const season = seasonOf(s.day);
    const progress = ((s.day % 10) / 10) * 100;
    setHTML(
      this.el.clock,
      `<span data-tip="<b>${SEASON_NAMES[season]}</b>">${SEASON_ICONS[season]}</span>
      <div class="date">Year ${yearOf(s.day)}<small>${MONTH_NAMES[monthOf(s.day)]}</small>
        <div class="progress" style="height:3px;margin:2px 0 0"><i class="month-bar"></i></div></div>
      <div class="speeds">
        <button data-action="speed" data-speed="0" class="${g.speedIndex === 0 ? 'active' : ''}" data-tip="Pause (Space)">❚❚</button>
        <button data-action="speed" data-speed="1" class="${g.speedIndex === 1 ? 'active' : ''}" data-tip="Normal speed (1)">▶</button>
        <button data-action="speed" data-speed="2" class="${g.speedIndex === 2 ? 'active' : ''}" data-tip="Fast (2)">▶▶</button>
        <button data-action="speed" data-speed="3" class="${g.speedIndex === 3 ? 'active' : ''}" data-tip="Fastest (3)">▶▶▶</button>
      </div>`,
    );
    const bar = this.el.clock.querySelector('.month-bar') as HTMLElement | null;
    if (bar) bar.style.width = `${progress}%`;

    if (this.lastTier >= 0 && s.tier > this.lastTier && !g.demo) this.celebrate(s.tier);
    if (s.pendingEvent && !g.demo && !this.modal) this.showEvent();
    this.lastTier = s.tier;
    this.updateObjectives();
    if (this.buildBarState() !== this.buildBarKey) this.renderBuildBar();
    this.updateInspector();
    this.updateLog();
    this.updateSeason();
    this.updateHint();
    this.updateTips();
  }

  /** One line of help the first time each panel or tool is used, then never again. */
  private updateTips(): void {
    const g = this.game;
    if (g.demo || !this.tipsOn || this.modal) return;
    const t = g.tool;
    const key =
      t.kind === 'grove' ? 'grove'
      : t.kind === 'road' ? (t.wall ? 'wall' : 'road')
      : t.kind === 'demolish' ? 'demolish'
      : t.kind === 'zone' ? 'zone'
      : t.kind === 'build' ? 'build'
      : this.category ? 'category'
      : this.openChip ? `chip-${this.openChip === 'materials' || this.openChip === 'goods' ? 'food' : this.openChip}`
      : g.selectedAgent ? 'villager'
      : g.selected !== null ? 'inspect'
      : g.state.day >= 2 ? 'speed'
      : '';
    if (!key || this.tipsSeen.has(key) || !TIPS[key]) return;
    this.tipsSeen.add(key);
    try {
      localStorage.setItem('cornerlands.tips', JSON.stringify([...this.tipsSeen]));
    } catch {
      /* ignore */
    }
    const div = document.createElement('div');
    div.className = 'msg panel tip';
    div.dataset.kind = 'advice';
    div.innerHTML = `<b>Tip:</b> ${TIPS[key]}`;
    div.title = 'Click to dismiss. Tips can be turned off in the menu.';
    div.addEventListener('click', () => div.remove());
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      div.remove();
    });
    // A newer tip replaces an older one still showing.
    this.el.log.querySelectorAll('.tip').forEach((o) => o.remove());
    this.el.log.appendChild(div);
    this.expire(div, 'advice');
    while (this.el.log.children.length > 3) this.el.log.firstElementChild!.remove();
  }

  private updateObjectives(): void {
    const s = this.game.state;
    const tier = TIERS[s.tier];
    const next = TIERS[s.tier + 1];
    const req = nextTierRequirements(s);
    const quests = activeQuests(s, 3)
      .map((q) => {
        const done = q.done(s);
        return `<div class="quest"><div class="t ${done ? 'done' : ''}">${done ? '✔ ' : '◇ '}${q.title}</div>
          <div class="h">${q.hint}</div>
          <div class="rw costline">Reward: ${costHtml(q.reward)}</div></div>`;
      })
      .join('');
    const active = activeQuests(s, 3);
    const ready = active.filter((q) => q.done(s)).length;
    const goal = yearGoal(s);
    this.el.objectives.className = `panel pill-panel ${this.objectivesMin ? 'min' : ''}`;
    setHTML(
      this.el.objectives,
      this.objectivesMin
        ? `<button class="pill" data-action="toggle-obj"><b>${tier.name}</b><span class="sep-dot">·</span>Objectives${active.length ? ` <span class="count">${active.length - ready}</span>` : ' ✓'} <span class="chev">▾</span></button>`
        : `<button class="pill" data-action="toggle-obj"><b>${tier.name}</b><span class="chev">▴</span></button>
      <div class="body">
        ${next ? `<div class="tier-next">Next: <b>${next.name}</b> — ${req.join(', ')}</div>` : `<div class="tier-next">${tier.desc}</div>`}
        <h3>Objectives</h3>
        ${quests || (goal ? '' : '<div class="quest"><i>All objectives complete. Your lands flourish!</i></div>')}
        ${goal ? this.goalHtml(goal) : ''}
      </div>`,
    );
  }

  /** This year's goal for a City, with progress. */
  private goalHtml(g: NonNullable<ReturnType<typeof yearGoal>>): string {
    const s = this.game.state;
    const met = yearGoalMet(s, g);
    const progress = g.done ? (met ? 'So far, so good' : `${g.have(s)} went hungry`) : `${Math.min(g.have(s), g.goal)} / ${g.goal}`;
    return `<div class="quest"><div class="t ${met && !g.done ? 'done' : ''}">${met && !g.done ? '✔ ' : '◇ '}This year: ${esc(g.title)}</div>
      <div class="h">${progress} · judged when spring comes</div>
      <div class="rw">Reward: +25 ${ICONS.prestige}, a merry season</div></div>`;
  }

  private updateInspector(): void {
    const g = this.game;
    const s = g.state;
    const b = g.selected !== null ? s.buildings.find((o) => o.id === g.selected) : undefined;
    const box = this.el.inspector;
    if (!b && g.selectedAgent) {
      this.villagerCard(box);
      return;
    }
    if (!b) {
      box.style.display = 'none';
      this.lastInspectorKey = '';
      return;
    }
    const plan = upgradePlan(s, b);
    const blocker = upgradeBlocker(s, b);
    const key = JSON.stringify([
      b.id, b.status, b.workers, b.builders, b.residents, b.build.toFixed(2), b.paused, b.level, b.lastOutput, b.growth.toFixed(2), b.want, b.priority, b.recipe, b.yard, b.trade, b.herd, b.owner, Math.floor(b.growth),
      s.tier, blocker, b.need, (b.upProgress ?? 0).toFixed(2), b.unmet, Math.floor(s.res.gold / 10), s.population,
      s.lastFeast, s.festivals, monthOf(s.day), b.type === 'market' ? s.day : 0, s.retinue, Math.floor(s.res.wood), Math.floor(totalFood(s)), b.barn, Math.floor(s.res.prestige), Math.floor(s.res.weapons),
      STORAGE_CAPACITY[b.type] ? RESOURCE_IDS.map((r) => (RESOURCE_STORAGE[r] ? Math.floor(s.res[r]) : 0)).join() : '',
    ]);
    if (key === this.lastInspectorKey) return;
    this.lastInspectorKey = key;
    box.style.display = 'block';
    // A family craft works like that workshop; name and description stay the home's.
    const d = workDef(b);
    const own = BUILDINGS[b.type];
    const rows: string[] = [];
    const needLine = () => {
      if (!b.need) return '';
      const left = Object.entries(b.need).filter(([, v]) => (v ?? 0) > 0);
      return left.length ? `<div class="kv"><span>Still to carry</span><span class="costline">${costHtml(Object.fromEntries(left))}</span></div>` : '';
    };
    if (b.build < 1) {
      rows.push(needLine());
      rows.push(`<div class="kv"><span>Construction</span><span>${Math.floor(b.build * 100)}%</span></div><div class="progress"><i style="width:${b.build * 100}%"></i></div>`);
      rows.push(`<div class="kv"><span>Builders</span><span>${b.builders ?? 0}</span></div>`);
    } else {
      const slots = workersOf(b);
      if (slots) {
        const want = Math.min(slots, b.want ?? slots);
        const pips = Array.from(
          { length: slots },
          (_, i) => `<i class="${i < b.workers ? 'on' : ''} ${i >= want ? 'unwanted' : ''}" data-action="want" data-n="${i + 1 === want ? i : i + 1}"></i>`,
        ).join('');
        const prio = b.priority ?? 1;
        rows.push(`<div class="kv labour" data-tip="Click the pips to choose how many villagers work here. Workers left free take other jobs or help build."><span>Workers ${b.workers}/${want}</span><span class="pips">${pips}</span></div>
          <div class="kv"><span>Priority</span><span class="seg">${['Low', 'Normal', 'High']
            .map((n, i) => `<button data-action="prio" data-p="${i}" class="${prio === i ? 'active' : ''}" data-tip="${['Staffed last', 'Staffed in the usual order', 'Staffed before everything else'][i]}">${n}</button>`)
            .join('')}</span></div>`);
        if (d.months) {
          const names = d.months.length >= 12 ? '' : seasonSpan(d.months);
          if (names) rows.push(`<div class="kv"><span>Works in</span><span>${names}</span></div>`);
        }
      }
      if (d.recipes) {
        // Fields, orchards and herds are always one thing; workshops may run on Auto.
        const fixed = !!d.zone || b.type === 'byre';
        const avail = d.recipes.filter((r) => !r.charter || hasCharter(s, r.charter));
        const opts = fixed ? avail : [{ id: '', name: 'Auto' }, ...avail];
        const current = b.recipe ?? (fixed ? d.recipes[0].id : '');
        const label = b.type === 'field' ? 'Crop' : b.type === 'orchard' ? 'Fruit' : b.type === 'byre' ? 'Animals' : 'Product';
        rows.push(`<div class="kv product"><span>${label}</span><span class="seg">${opts
          .map((r) => {
            const rec = d.recipes!.find((x) => x.id === r.id);
            const tip = rec
              ? `<b>${rec.name}</b><br>${b.type === 'byre' ? 'Changing animals sells the old herd; a new one of six arrives.' : b.type === 'orchard' ? 'Replanting starts the trees over.' : rec.months ? `In ${seasonSpan(rec.months)}` : 'All year'}${rec.auto === false ? '<br>Auto never picks this; choose it to make it.' : ''}`
              : '<b>Auto</b><br>Make whatever is in season and below its stock target.';
            const icon = rec ? (ICONS[Object.keys(rec.outputs)[0] as ResourceId] ?? '') : '';
            return `<button data-action="recipe" data-r="${r.id}" class="${current === r.id ? 'active' : ''}" data-tip="${esc(tip)}">${icon}${r.name}</button>`;
          })
          .join('')}</span></div>`);
      }
      rows.push(...this.zoneRows(b));
      if (b.type === 'market' && b.build >= 1) {
        const left = (MARKET_DAY - (s.day % DAYS_PER_MONTH) + DAYS_PER_MONTH) % DAYS_PER_MONTH;
        const when = isMarketDay(s, b) ? '<span class="pos">Today!</span>' : !b.workers ? '<span class="neg">Needs a stallholder</span>' : left === 0 ? 'Not in winter' : `In ${left} day${left > 1 ? 's' : ''}`;
        rows.push(`<div class="kv" data-tip="Once a month the square fills with townsfolk and the merchants' cart comes for the goods you sell."><span>Market day</span><span>${when}</span></div>`);
      }
      rows.push(...this.storeRows(b));
      if (b.type === 'townhall') {
        const c = feastCost(s);
        const err = feastError(s);
        rows.push(`<div class="kv feast" data-tip="Once each autumn: a meal for every villager and a cask for every eight. With drink for all it is merrier (+14 happiness for half a year, +10 prestige); without, +9 and +5."><span>Harvest feast</span><span>${
          err ? `<small class="muted">${esc(err)}</small>` : `<button data-action="feast">Call a feast <small>${c.food} food · ${c.drink} drink</small></button>`
        }</span></div>`);
        // Seasonal festivals: shown in their season, or once the maypole needed stands.
        for (const f of FESTIVALS) {
          const month = monthOf(s.day);
          if (!f.months.includes(month)) continue;
          const err = festivalError(s, f.id);
          const c = f.cost(s);
          rows.push(`<div class="kv feast" data-tip="${esc(`<b>${f.name}</b><br>${f.desc}<br>+${f.mood} happiness for a season, +${f.prestige} prestige.`)}"><span>${f.name}</span><span>${
            err
              ? `<small class="muted">${esc(err)}</small>`
              : `<button data-action="festival" data-id="${f.id}">Celebrate <small>${c.food} food${c.wood ? ` · ${c.wood} timber` : ''}</small></button>`
          }</span></div>`);
        }
        if (s.tier >= RETINUE_TIER - 1) {
          const err = retinueError(s);
          rows.push(`<div class="kv feast" data-tip="Men-at-arms guard the roads: +2 happiness, and when wolves or bandits come you can send them out. They cost ${RETINUE_PAY} coins a month and leave if unpaid."><span>Retinue</span><span>${
            s.retinue
              ? `On guard · ${RETINUE_PAY}c a month <button data-action="retinue-dismiss">Dismiss</button>`
              : err
                ? `<small class="muted">${esc(err)}</small>`
                : `<button data-action="retinue">Raise <small>${costHtml(RETINUE_COST)}</small></button>`
          }</span></div>`);
        }
      }
      const cap = housingOf(b);
      if (cap) rows.push(`<div class="kv"><span>Residents</span><span>${b.residents} / ${cap}</span></div>`);
      if (Object.keys(d.outputs).length || b.type === 'farm' || b.type === 'forester') {
        rows.push(`<div class="kv"><span>${b.type === 'forester' ? 'Trees planted' : 'Produced'} last month</span><span>${b.lastOutput}</span></div>`);
      }
      if (d.cycle && b.efficiency !== undefined && b.efficiency < 0.97) {
        rows.push(`<div class="kv" data-tip="Time lost walking to storage and to resources. Build closer to a storehouse or granary, or lay roads."><span>Walking time</span><span class="${b.efficiency < 0.7 ? 'neg' : ''}">${Math.round(b.efficiency * 100)}% efficient</span></div>`);
      }
      if (!d.recipes && Object.keys(d.inputs).length) rows.push(`<div class="kv"><span>Consumes</span><span class="costline">${costHtml(d.inputs)}</span></div>`);
      if (!d.recipes && Object.keys(d.outputs).length) rows.push(`<div class="kv"><span>Produces</span><span class="costline">${costHtml(d.outputs)}</span></div>`);
      if (b.type === 'house') {
        const needs = houseNeeds(s, b, b.level);
        rows.push(`<div class="needs"><div class="needs-h">Needs</div>${needs.map((n) => `<span class="${n.met ? 'met' : 'unmet'}">${n.met ? '✓' : '✗'} ${n.label}</span>`).join('')}</div>`);
      }
      if (b.upgrading) {
        rows.push(`<div class="upgrade-box"><b>Upgrading to ${esc(upgradeName(b))}</b>${needLine()}
          <div class="kv"><span>Work</span><span>${Math.floor((b.upProgress ?? 0) * 100)}% · ${b.builders ?? 0} builders</span></div>
          <div class="progress"><i style="width:${(b.upProgress ?? 0) * 100}%"></i></div></div>`);
      } else if (plan) {
        const label = b.type === 'townhall' ? `Raise the manor to a ${plan.name}` : `Upgrade to ${plan.name}`;
        const what =
          b.type === 'townhall'
            ? `Your settlement becomes a ${TIERS[plan.to - 1].name}, unlocking new buildings. More storage.`
            : b.type === 'house'
              ? `Houses ${HOUSE_LEVELS[plan.to].housing} villagers and pays more taxes.`
              : `Room for ${Math.ceil(d.workers / 2)} more worker${Math.ceil(d.workers / 2) > 1 ? 's' : ''}.`;
        rows.push(`<div class="upgrade-box"><b>${label}</b><div class="desc">${what}</div>
          <div class="reqs">${plan.reqs.map((r) => `<span class="${r.met ? 'met' : 'unmet'}">${r.met ? '✓' : '✗'} ${esc(r.label)}</span>`).join('')}</div>
          <div class="costline">${costHtml(plan.cost, s.res)}</div>
          <button class="primary" data-action="upgrade" ${blocker ? 'disabled' : ''}>⬆ ${b.type === 'townhall' ? 'Raise the manor' : 'Upgrade'}</button></div>`);
      }
    }
    const warn = hasProblem(b) || /Waiting|rotted|untended/.test(b.status);
    const actions: string[] = [];
    if (b.build >= 1 && d.workers > 0) {
      actions.push(`<button data-action="pause-b">${b.paused ? '▶ Resume' : '❚❚ Pause'}</button>`);
    }
    if (b.type !== 'townhall') actions.push(`<button data-action="demolish-b">✖ ${b.build < 1 ? 'Cancel' : 'Demolish'}</button>`);
    if (b.type === 'market' && b.build >= 1) actions.push('<button data-action="trade">⚖ Trade</button>');
    box.innerHTML = `
      <button class="close" data-action="deselect">✕</button>
      <h2>${esc(buildingName(b))}${b.trade ? ` <small>· ${esc(BUILDINGS[b.trade].name)}</small>` : ''}</h2>
      <div class="desc">${own.desc}</div>
      ${rows.join('')}
      <div class="status ${warn ? 'warn' : ''}">${esc(b.status || 'Idle')}</div>
      <div class="actions">${actions.join('')}</div>`;
  }

  /** Inspector rows for farms, herds, orchards, their zones and backyards. */
  /** What the town's stores of this kind hold, biggest piles first, with a quick sale of the surplus. */
  private storeRows(b: Building): string[] {
    const s = this.game.state;
    const kinds = Object.keys(STORAGE_CAPACITY[b.type] ?? {}) as StorageKind[];
    const market = hasBuilt(s, 'market');
    const rows: string[] = [];
    for (const kind of kinds) {
      const used = Math.floor(stored(s, kind));
      const cap = storageCap(s, kind);
      const goods = RESOURCE_IDS.filter((r) => RESOURCE_STORAGE[r] === kind && s.res[r] >= 1).sort((a, c) => s.res[c] - s.res[a]);
      const list = goods
        .slice(0, 8)
        .map((r) => {
          const surplus = Math.floor(s.res[r] - keepOf(s, r));
          const sell =
            market && TRADE_PRICES[r] && surplus >= 1
              ? `<button data-action="store-sell" data-res="${r}" data-n="${surplus}" data-tip="Sell what is above the stock target (${keepOf(s, r)})">Sell ${surplus} <small>+${sellPrice(s, r, surplus)}c</small></button>`
              : '';
          return `<div class="kv store-row"><span>${ICONS[r] ?? ''} ${GOODS[r].name}</span><span>${Math.floor(s.res[r])} ${sell}</span></div>`;
        })
        .join('');
      rows.push(`<div class="needs-h">${kind === 'food' ? 'All granaries' : 'All storehouses'} · ${used} / ${cap}</div>
        <div class="progress"><i style="width:${Math.min(100, (used / Math.max(1, cap)) * 100)}%"></i></div>${list}`);
    }
    if (kinds.length && !market) rows.push('<div class="note">Build a marketplace to sell surplus from here.</div>');
    return rows;
  }

  private zoneRows(b: Building): string[] {
    const s = this.game.state;
    const rows: string[] = [];
    const bar = (v: number) => `<div class="progress"><i style="width:${Math.min(100, v * 100)}%"></i></div>`;
    const zd = BUILDINGS[b.type].zone;
    if (zd) {
      const owner = s.buildings.find((o) => o.id === b.owner);
      rows.push(`<div class="kv"><span>Size</span><span>${b.w} × ${b.h} (${b.w * b.h} tiles)</span></div>`);
      rows.push(
        owner
          ? `<div class="kv link" data-action="goto-b" data-id="${owner.id}"><span>Tended from</span><span>${esc(buildingName(owner))}</span></div>`
          : `<div class="kv"><span>Tended from</span><span class="neg">No ${BUILDINGS[zd.owner].name} in range</span></div>`,
      );
      if (b.type === 'field') {
        rows.push(`<div class="kv"><span>Crop growth</span><span>${Math.round(b.growth * 100)}%</span></div>${bar(b.growth)}`);
        const fc = fieldForecast(s, b);
        const name = GOODS[fc.good].name.toLowerCase();
        // Crops nobody brings in rot: say so rather than promise a harvest.
        if (!owner) rows.push('<div class="kv"><span>Expected harvest</span><span class="neg">None: no farmstead tends it</span></div>');
        else if (fc.crew === 0 && monthOf(s.day) <= 6 && b.growth > 0) rows.push('<div class="kv"><span>Expected harvest</span><span class="neg">At risk: no farmers at work</span></div>');
        else rows.push(`<div class="kv" data-tip="Harvest comes in early autumn. It grows with the farmers' work through spring and summer, the soil's richness and crop rotation."><span>Expected harvest</span><span>${b.growth > 0 ? `~${fc.now} ${name}` : '—'}${fc.full > fc.now ? ` <small>(up to ${fc.full})</small>` : ''}</span></div>`);
        rows.push(`<div class="kv" data-tip="Richer soil yields up to twice as much as poor soil. Look for dark green, lush ground."><span>Soil</span><span class="${fc.soil < 0.4 ? 'neg' : ''}">${fc.soil < 0.4 ? 'Poor' : fc.soil < 0.7 ? 'Fair' : 'Rich'} (${Math.round(fc.soil * 100)}%)</span></div>`);
        if (b.lastCrop) rows.push(`<div class="kv" data-tip="Growing the same crop two years running yields less."><span>Last year</span><span>${esc(b.lastCrop)}${b.lastCrop === (b.recipe ?? 'wheat') ? ' <span class="neg">(same crop: −15%)</span>' : ''}</span></div>`);
      } else if (b.type === 'orchard') {
        const m = orchardMaturity(b, hasCharter(s, 'orchard2'));
        rows.push(`<div class="kv"><span>Trees</span><span>${m < 1 ? `${Math.round(m * 100)}% grown` : 'Bearing fruit'}</span></div>${m < 1 ? bar(m) : ''}`);
        if (b.growth > 0) rows.push(`<div class="kv"><span>Fruit on the trees</span><span>${Math.floor(b.growth)}</span></div>`);
      }
    }
    if (b.type === 'farm' && b.build >= 1) {
      const fields = zonesOf(s, b);
      const area = zoneArea(fields);
      const hands = Math.round((workersOf(b) * 60) / TEND_PER_TILE);
      rows.push(`<div class="kv" data-tip="Draw fields within the farm's reach (Food menu). ${workersOf(b)} farmers can sow and tend about ${hands} tiles."><span>Fields</span><span class="${area > hands ? 'neg' : ''}">${fields.length} · ${area} of ~${hands} tiles</span></div>`);
      if (b.barn) {
        const held = Object.entries(b.barn)
          .map(([k, v]) => `${Math.floor(v ?? 0)} ${GOODS[k as ResourceId].name.toLowerCase()}`)
          .join(', ');
        rows.push(`<div class="kv" data-tip="Harvest the stores had no room for. It is carried over as room frees up; the barn holds ${FARM_BARN}."><span>In the barn</span><span>${held}</span></div>`);
      }
    }
    if (b.type === 'byre' && b.build >= 1) {
      const capy = herdCapacity(s, b);
      const kind = HERDS[b.recipe ?? 'sheep'];
      rows.push(`<div class="kv" data-tip="A ${kind.name} needs ${kind.tiles} tiles of pasture. With oats in store the herd may grow half as large again, eating oats each winter month."><span>Herd</span><span>${b.herd ?? 0} ${kind.plural} · room for ${capy.free}${capy.fed > capy.free ? ` (+${capy.fed - capy.free} on oats)` : ''}</span></div>`);
      rows.push(`<div class="kv"><span>Pastures</span><span>${zonesOf(s, b).length} · ${zoneArea(zonesOf(s, b))} tiles</span></div>`);
    }
    if (b.type === 'orchardist' && b.build >= 1) {
      const orchards = zonesOf(s, b);
      rows.push(`<div class="kv"><span>Orchards</span><span>${orchards.length} · ${zoneArea(orchards)} tiles</span></div>`);
    }
    if (b.type === 'house' && b.build >= 1 && b.level >= 2) {
      const trades = HOME_TRADES.filter((t) => isUnlocked(s, t));
      rows.push(`<div class="kv product" data-tip="<b>Home craft</b><br>Members of the family work a craft from home, making half as much again as a common workshop. Setting up costs 6 timber and 6 planks."><span>Home craft</span><span class="seg">${[undefined, ...trades]
        .map((t) => `<button data-action="trade-home" data-t="${t ?? ''}" class="${(b.trade ?? '') === (t ?? '') ? 'active' : ''}" data-tip="${t ? `<b>${esc(BUILDINGS[t].name)}</b><br>${esc(BUILDINGS[t].desc)}` : 'No craft: the family works wherever it is needed.'}">${t ? (ICONS[Object.keys(BUILDINGS[t].outputs)[0] as ResourceId] ?? '') : ''}${t ? BUILDINGS[t].name.split(' ')[0] : 'None'}</button>`)
        .join('')}</span></div>`);
    }
    if (b.type === 'house' && b.build >= 1) {
      const opts = [{ id: '', name: 'None', cost: {} as Cost, desc: 'Nothing but a woodpile.', tier: 0 }, ...Object.entries(YARDS).map(([id, y]) => ({ id, ...y }))];
      rows.push(`<div class="kv product"><span>Backyard</span><span class="seg">${opts
        .map((o) => {
          const locked = s.tier < o.tier;
          return `<button data-action="yard" data-y="${o.id}" class="${(b.yard ?? '') === o.id ? 'active' : ''}" ${locked ? 'disabled' : ''} data-tip="<b>${o.name}</b><br>${esc(o.desc)}${Object.keys(o.cost).length ? `<br>Costs ${esc(costText(o.cost))}` : ''}${locked ? `<br>Unlocks at ${TIERS[o.tier].name}` : ''}">${o.id ? (ICONS[(YARD_ICON[o.id] ?? 'wood') as ResourceId] ?? '') : ''}${o.name.split(' ')[0]}</button>`;
        })
        .join('')}</span></div>`);
    }
    return rows;
  }

  private updateLog(): void {
    const s = this.game.state;
    const msgs = s.messages;
    // Messages are numbered: the oldest are trimmed, so positions cannot tell what is new.
    const last = lastNumber(msgs);
    if (this.game.demo || last < this.shownMessages) {
      this.shownMessages = last;
      return;
    }
    let played = false;
    for (const m of msgs) {
      if ((m.n ?? 0) <= this.shownMessages) continue;
      // Routine news goes to the chronicle only.
      if (m.kind === 'info') continue;
      const text = `${m.kind === 'advice' ? '<b>Steward:</b> ' : ''}${esc(m.text.replace(/^Steward: /, ''))}`;
      // The same news again bumps a counter on the toast already showing.
      const same = [...this.el.log.children].find((c) => (c as HTMLElement).dataset.text === m.text) as HTMLElement | undefined;
      if (same) {
        const n = Number(same.dataset.n ?? 1) + 1;
        same.dataset.n = String(n);
        same.innerHTML = `${text} <span class="times">×${n}</span>`;
        this.expire(same, m.kind);
        continue;
      }
      const div = document.createElement('div');
      div.className = `msg panel ${m.kind}${m.at ? ' link' : ''}`;
      div.dataset.text = m.text;
      div.dataset.kind = m.kind;
      div.innerHTML = text;
      if (m.at) {
        const at = m.at;
        div.title = 'Show me (right-click to dismiss)';
        div.addEventListener('click', () => {
          this.game.renderer.centerOn(at.x, at.y);
          this.game.renderer.clampCamera(this.game.state);
        });
      }
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        div.remove();
      });
      this.el.log.appendChild(div);
      this.expire(div, m.kind);
      if (!played) {
        this.sound(m.kind === 'bad' ? 'bad' : 'good');
        played = true;
      }
      if (m.kind === 'bad' && this.pauseOnBad && this.game.speed > 0) this.game.setSpeed(0);
    }
    this.shownMessages = last;
    // Keep three at most: good news makes way first, warnings last.
    const rank: Record<string, number> = { good: 0, advice: 1, bad: 2 };
    while (this.el.log.children.length > 3) {
      const all = [...this.el.log.children] as HTMLElement[];
      const drop = all.reduce((a, c) => ((rank[c.dataset.kind ?? ''] ?? 1) < (rank[a.dataset.kind ?? ''] ?? 1) ? c : a));
      drop.remove();
    }
  }

  /** Fades a toast after a while; warnings stay up longer. */
  private expire(div: HTMLElement, kind: string): void {
    const life = kind === 'bad' ? 14000 : kind === 'advice' ? 11000 : 7000;
    clearTimeout(Number(div.dataset.fade));
    clearTimeout(Number(div.dataset.gone));
    div.classList.remove('old');
    div.dataset.fade = String(window.setTimeout(() => div.classList.add('old'), life));
    div.dataset.gone = String(window.setTimeout(() => div.remove(), life + 1000));
  }

  private celebrate(tier: number): void {
    const t = TIERS[tier];
    const unlocked = BUILD_ORDER.filter((b) => BUILDINGS[b].tier === tier && !BUILDINGS[b].charter);
    const div = document.createElement('div');
    div.className = 'banner panel';
    div.innerHTML = `<div class="ornament">❦ ❦ ❦</div><h1>${t.name}</h1><p>${esc(t.desc)}</p>
      ${unlocked.length ? `<div class="unlocks">${unlocked.map((b) => `<div><img src="${this.cardImage(b)}" alt=""><span>${BUILDINGS[b].name}</span></div>`).join('')}</div>` : ''}`;
    this.root.appendChild(div);
    this.sound('good');
    setTimeout(() => this.sound('good'), 350);
    setTimeout(() => div.classList.add('out'), 6000);
    setTimeout(() => div.remove(), 7000);
    div.addEventListener('click', () => div.remove());
    this.renderBuildBar();
  }

  /** A small button to take back the last placement or demolition, for a few seconds. */
  showUndo(label: string | null, ms: number): void {
    this.root.querySelector('.undo-btn')?.remove();
    clearTimeout(this.undoTimer);
    if (!label || this.game.demo) return;
    const btn = document.createElement('button');
    btn.className = 'undo-btn panel';
    btn.innerHTML = `↶ ${esc(label)} <small>Ctrl+Z</small>`;
    btn.addEventListener('click', () => this.game.undo());
    this.root.appendChild(btn);
    this.undoTimer = window.setTimeout(() => btn.remove(), ms);
  }
  private undoTimer = 0;

  /** Says which reach the map shows, and how many homes it misses. */
  showCoverage(type: BuildingType | null): void {
    this.coverageType = type;
    this.updateCoverageHint();
  }
  private coverageType: BuildingType | null = null;
  private coverageKey = '';
  private coverageText = '';

  private updateCoverageHint(): void {
    const type = this.coverageType;
    if (!type) {
      this.coverageKey = '';
      this.setHint('', false);
      return;
    }
    const s = this.game.state;
    const key = `${type}:${s.day}:${s.buildings.length}`;
    if (key !== this.coverageKey) {
      this.coverageKey = key;
      const homes = s.buildings.filter((b) => b.type === 'house' && b.build >= 1);
      const missed = homes.filter((h) => !coveredBy(s, h, type)).length;
      this.coverageText = `${BUILDINGS[type].name} reach: ${homes.length - missed} of ${homes.length} homes ✓${missed ? `, ${missed} ✗` : ''} · V for the next, Esc to close`;
    }
    this.setHint(this.coverageText, false);
  }

  /** A large, quiet title when a new season begins. */
  private updateSeason(): void {
    const s = this.game.state;
    const season = seasonOf(s.day);
    if (season === this.lastSeason) return;
    this.lastSeason = season;
    if (this.game.demo) return;
    const el = this.el['season-banner'];
    el.innerHTML = `<div>${SEASON_NAMES[season]}</div><small>Year ${yearOf(s.day)}${season === 3 ? ' · keep firewood for the hearths' : season === 0 ? ' · time to sow the fields' : season === 2 ? ' · harvest is near' : ''}</small>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** A decision event: the game waits until the lord chooses. */
  private showEvent(): void {
    const s = this.game.state;
    const e = s.pendingEvent ? getEvent(s.pendingEvent) : undefined;
    if (!e) return;
    const text = e.text(s);
    const choices = e.choices(s)
      .map((c, i) => {
        const why = c.blocked?.(s);
        return `<button class="choice" data-i="${i}" ${why ? 'disabled' : ''}>
          <b>${esc(c.label)}</b><small>${esc(c.detail)}${why ? ` <span class="neg">— ${esc(why)}</span>` : ''}</small></button>`;
      })
      .join('');
    const m = this.openModal(
      `<div class="event">
        <div class="ornament">❦ ❦ ❦</div>
        <h2>${esc(e.title)}</h2>
        <p class="tale"><span class="initial">${esc(text[0])}</span>${esc(text.slice(1))}</p>
        <div class="choices">${choices}</div>
      </div>`,
      false,
    );
    this.sound('good');
    m.querySelectorAll<HTMLButtonElement>('.choice').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (resolveEvent(s, new StateRng(s), Number(btn.dataset.i))) {
          recompute(s);
          this.closeModal(true);
          this.update();
        }
      }),
    );
  }

  private showChronicle(): void {
    const s = this.game.state;
    const rows = s.messages
      .slice()
      .reverse()
      .map((m) => `<div class="chron ${m.kind}"><small>${MONTH_NAMES[monthOf(m.day)]}, Y${yearOf(m.day)}</small> ${esc(m.text)}</div>`)
      .join('');
    const dated = (s.milestones ?? []).filter((m) => m.day >= 0);
    const miles = dated
      .map((m) => `<div class="mile"><small>${MONTH_NAMES[monthOf(m.day)]}, Year ${yearOf(m.day)}</small><span>${esc(m.text)}</span></div>`)
      .join('');
    this.openModal(`<h2>Chronicle of ${esc(townName(s))}</h2>${miles ? `<div class="sub">Milestones</div><div class="milestones">${miles}</div><div class="sub">Lately</div>` : ''}<div class="chronicle">${rows || '<i>Nothing has happened yet.</i>'}</div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="primary" data-action="close-modal">Close</button></div>`);
  }

  // ---------------------------------------------------------------- hints

  setHint(text: string, err: boolean): void {
    if (performance.now() < this.flashUntil) return;
    if (text === this.hintText && this.el.hint.classList.contains('err') === err) return;
    this.hintText = text;
    this.el.hint.textContent = text;
    this.el.hint.classList.toggle('err', err);
    this.el.hint.style.display = text ? 'block' : 'none';
  }

  /** A passing note in the hint bar, without the alarm. */
  flashInfo(text: string): void {
    this.flashUntil = 0;
    this.setHint(text, false);
    this.flashUntil = performance.now() + 2200;
  }

  flash(text: string): void {
    this.flashUntil = 0;
    this.setHint(text, true);
    this.flashUntil = performance.now() + 2200;
    this.sound('bad');
  }

  private updateHint(): void {
    if (performance.now() < this.flashUntil) return;
    if (this.game.tool.kind !== 'select') return;
    if (this.coverageType) this.updateCoverageHint();
    else this.setHint('', false);
  }

  // ---------------------------------------------------------------- tooltips

  private onTipMove(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
    const tip = this.el.tooltip;
    if (!target) {
      tip.style.display = 'none';
      return;
    }
    tip.innerHTML = target.dataset.tip!;
    this.placeTip(e.clientX, e.clientY);
  }

  private placeTip(x: number, y: number): void {
    const tip = this.el.tooltip;
    tip.style.display = 'block';
    // Work in the UI layer's own pixels, which differ from the screen's when it is scaled.
    const z = this.zoom();
    x /= z;
    y /= z;
    const W = window.innerWidth / z;
    const H = window.innerHeight / z;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.min(W - w - 6, x + 14)}px`;
    tip.style.top = `${y + h + 20 > H ? y - h - 10 : y + 18}px`;
  }

  /** Tooltip for whatever is under the cursor on the map. */
  hoverWorld(x: number, y: number): void {
    const tip = this.el.tooltip;
    const g = this.game;
    if (x < 0 || g.tool.kind !== 'select') {
      tip.style.display = 'none';
      return;
    }
    const s = g.state;
    const [ftx, fty] = g.renderer.screenToTile(x, y);
    const tx = Math.floor(ftx);
    const ty = Math.floor(fty);
    if (!inBounds(s, tx, ty)) {
      tip.style.display = 'none';
      return;
    }
    const i = idx(s, tx, ty);
    let html = '';
    const occ = s.occ[i];
    if (occ >= 0) {
      const b = s.buildings.find((o) => o.id === occ);
      if (b) html = `<b>${BUILDINGS[b.type].name}</b><br>${esc(b.status)}`;
    } else if (s.trees[i]) html = `<b>Forest</b><br>${s.trees[i]} tree${s.trees[i] > 1 ? 's' : ''} · ${s.trees[i] * 3} timber`;
    else if (s.rock[i]) html = `<b>Rock deposit</b><br>${s.rock[i]} loads of stone`;
    else if (s.ore[i]) html = `<b>Iron ore</b><br>${s.ore[i]} loads of ore`;
    else if (s.berriesMax[i]) html = `<b>Berry bush</b><br>${s.berries[i] > 0 ? 'Ripe for picking' : 'Picked clean until spring'}`;
    else if (s.terrain[i] === 1) html = '<b>Water</b>';
    else if (!s.road[i]) html = `<b>Meadow</b><br>Soil fertility ${Math.round(s.fertility[i] * 100)}%`;
    if (!html) {
      tip.style.display = 'none';
      return;
    }
    tip.innerHTML = html;
    this.placeTip(x, y);
  }

  // ---------------------------------------------------------------- clicks

  pickBuilding(t: BuildingType): void {
    const g = this.game;
    const s = g.state;
    if (!isUnlocked(s, t)) {
      this.flash(`${BUILDINGS[t].name}: ${lockReason(s, t)}.`);
      return;
    }
    this.category = BUILDINGS[t].category;
    if (t === 'wall') {
      // Walls are laid like roads, section by section.
      g.setTool(g.tool.kind === 'road' && g.tool.wall ? { kind: 'select' } : { kind: 'road', wall: true });
      return;
    }
    const kind = BUILDINGS[t].zone ? 'zone' : 'build';
    if ((g.tool.kind === 'build' || g.tool.kind === 'zone') && g.tool.type === t) g.setTool({ kind: 'select' });
    else g.setTool({ kind, type: t });
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    const g = this.game;
    const s = g.state;
    this.ensureAudio();
    const a = t.dataset.action!;
    switch (a) {
      case 'menu':
        this.showGameMenu();
        break;
      case 'cat': {
        const c = t.dataset.cat as Category;
        this.category = this.category === c ? null : c;
        if (g.tool.kind === 'road' || g.tool.kind === 'demolish') g.setTool({ kind: 'select' });
        this.renderBuildBar();
        break;
      }
      case 'build':
        this.pickBuilding(t.dataset.type as BuildingType);
        break;
      case 'road': {
        this.category = null;
        const paved = !!t.dataset.paved;
        g.setTool(g.tool.kind === 'road' && !!g.tool.paved === paved ? { kind: 'select' } : { kind: 'road', paved });
        break;
      }
      case 'grove':
        this.category = null;
        g.setTool(g.tool.kind === 'grove' ? { kind: 'select' } : { kind: 'grove' });
        break;
      case 'demolish':
        this.category = null;
        g.setTool(g.tool.kind === 'demolish' ? { kind: 'select' } : { kind: 'demolish' });
        break;
      case 'speed':
        g.setSpeed(Number(t.dataset.speed));
        break;
      case 'tax':
        setTax(s, Number(t.dataset.level));
        this.update();
        break;
      case 'toggle-obj':
        this.objectivesMin = !this.objectivesMin;
        this.update();
        break;
      case 'chronicle':
        this.showChronicle();
        break;
      case 'coverage':
        g.cycleCoverage();
        break;
      case 'deselect':
        g.select(null);
        break;
      case 'pause-b': {
        const b = this.selectedBuilding();
        if (b) {
          b.paused = !b.paused;
          s.dirty = true;
          this.update();
        }
        break;
      }
      case 'chip': {
        const id = t.dataset.chip!;
        if (this.pinnedChip && this.openChip === id) this.showChip(null);
        else this.showChip(id, true);
        break;
      }
      case 'chip-close':
        this.showChip(null);
        break;
      case 'keep': {
        const r = t.dataset.res as ResourceId;
        setKeep(s, r, Math.max(0, keepOf(s, r) + Number(t.dataset.d) * (e.shiftKey ? 5 : 1)));
        this.renderChipPanel();
        break;
      }
      case 'sell': {
        const r = t.dataset.res as ResourceId;
        setSell(s, r, !selling(s, r));
        this.renderChipPanel();
        break;
      }
      case 'goto-b': {
        const b = s.buildings.find((o) => o.id === Number(t.dataset.id));
        if (b) {
          g.renderer.centerOn(b.x + b.w / 2, b.y + b.h / 2);
          g.select(b.id);
        }
        break;
      }
      case 'want': {
        const b = this.selectedBuilding();
        if (b) {
          setWorkers(s, b, Number(t.dataset.n));
          this.update();
        }
        break;
      }
      case 'prio': {
        const b = this.selectedBuilding();
        if (b) {
          setPriority(s, b, Number(t.dataset.p));
          this.update();
        }
        break;
      }
      case 'trade-home': {
        const b = this.selectedBuilding();
        if (b) {
          const err = setTrade(s, b, (t.dataset.t || undefined) as BuildingType | undefined);
          if (err) this.flash(err);
          else this.sound('place');
          this.lastInspectorKey = '';
          this.update();
        }
        break;
      }
      case 'yard': {
        const b = this.selectedBuilding();
        if (b) {
          const err = setYard(s, b, t.dataset.y || undefined);
          if (err) this.flash(err);
          else this.sound('place');
          this.lastInspectorKey = '';
          this.update();
        }
        break;
      }
      case 'recipe': {
        const b = this.selectedBuilding();
        if (b) {
          setRecipe(s, b, t.dataset.r || undefined);
          recompute(s);
          this.update();
        }
        break;
      }
      case 'upgrade': {
        const b = this.selectedBuilding();
        if (b && startUpgrade(s, b)) this.sound('place');
        this.update();
        break;
      }
      case 'demolish-b': {
        const b = this.selectedBuilding();
        if (b && g.demolishBuilding(b)) {
          this.sound('demolish');
          g.select(null);
        }
        break;
      }
      case 'trade':
        this.showTrade();
        break;
      case 'production':
        this.showProduction();
        break;
      case 'charters':
        this.charterSel = null;
        this.showCharters();
        break;
      case 'charter-sel':
        e.preventDefault();
        this.charterSel = t.dataset.id || null;
        this.showCharters();
        break;
      case 'charter-grant':
        if (grantCharter(s, t.dataset.id!)) {
          const c = CHARTERS.find((x) => x.id === t.dataset.id)!;
          log(s, `The crown grants the town a charter: ${c.name}.`, 'good');
          this.sound('good');
          recompute(s);
        }
        this.showCharters();
        break;
      case 'ledger':
        this.showLedger();
        break;
      case 'retinue': {
        const err = raiseRetinue(s);
        if (err) this.flash(err);
        else this.sound('march');
        this.lastInspectorKey = '';
        break;
      }
      case 'retinue-dismiss':
        dismissRetinue(s);
        log(s, 'The lord pays off the men-at-arms.', 'info');
        this.lastInspectorKey = '';
        break;
      case 'festival': {
        const id = t.dataset.id!;
        const err = holdFestival(s, id);
        if (err) this.flash(err);
        else {
          const f = FESTIVALS.find((x) => x.id === id)!;
          log(s, `${f.name}! ${f.desc}`, 'good');
          this.sound('jig');
        }
        this.lastInspectorKey = '';
        break;
      }
      case 'commission': {
        const err = commission(s, t.dataset.id ?? '');
        if (err) this.flash(err);
        else this.sound('fanfare');
        this.renderChipPanel();
        break;
      }
      case 'title': {
        const err = takeTitle(s);
        if (err) this.flash(err);
        else this.sound('fanfare');
        this.renderChipPanel();
        break;
      }
      case 'fair': {
        const err = holdFair(s);
        if (err) this.flash(err);
        else {
          log(s, 'A great fair comes to town: merchants, jugglers and a tournament on the green.', 'good');
          this.sound('fanfare');
        }
        this.renderChipPanel();
        break;
      }
      case 'feast': {
        const err = holdFeast(s);
        if (err) this.flash(err);
        else {
          log(s, 'The lord calls a harvest feast: music, ale and roast meat late into the night.', 'good');
          this.sound('good');
        }
        this.lastInspectorKey = '';
        break;
      }
      case 'store-sell': {
        const err = trade(s, t.dataset.res as ResourceId, -Number(t.dataset.n));
        if (err) this.flash(err);
        else this.sound('coin');
        this.lastInspectorKey = '';
        break;
      }
      case 'trade-do': {
        const err = trade(s, t.dataset.res as ResourceId, Number(t.dataset.n));
        if (err) this.flash(err);
        else this.sound('coin');
        this.showTrade();
        break;
      }
      case 'export-toggle': {
        const r = t.dataset.res as ResourceId;
        setSell(s, r, !selling(s, r));
        this.showTrade();
        break;
      }
      case 'export-keep': {
        const r = t.dataset.res as ResourceId;
        setKeep(s, r, Math.max(0, keepOf(s, r) + Number(t.dataset.d)));
        this.showTrade();
        break;
      }
      case 'close-modal':
        this.closeModal();
        break;
    }
  }

  private selectedBuilding(): Building | undefined {
    const g = this.game;
    return g.selected !== null ? g.state.buildings.find((b) => b.id === g.selected) : undefined;
  }

  // ---------------------------------------------------------------- modals

  /** Every workshop, branch by branch: what it takes, what it makes, how many you have. */
  private showProduction(): void {
    const s = this.game.state;
    const goods = (c: Cost) =>
      Object.entries(c)
        .map(([k, v]) => `<span class="pg" data-tip="${GOODS[k as ResourceId].name}">${ICONS[k as ResourceId] ?? ''}${v}</span>`)
        .join('');
    const cats: Category[] = ['resources', 'farming', 'food', 'industry', 'civic'];
    const sections = cats
      .map((cat) => {
        const rows = BUILD_ORDER.filter((t) => BUILDINGS[t].category === cat && (BUILDINGS[t].workers > 0 || BUILDINGS[t].zone))
          .map((t) => {
            const d = BUILDINGS[t];
            const lock = lockReason(s, t);
            const mine = s.buildings.filter((b) => b.type === t && b.build >= 1);
            const staff = mine.reduce((a, b) => a + b.workers, 0);
            const stuck = mine.filter((b) => hasProblem(b));
            const slots = mine.reduce((a, b) => a + workersOf(b), 0);
            const recipes = (d.recipes ?? [{ id: '', name: '', inputs: d.inputs, outputs: d.outputs }]).filter((r) => !r.charter || hasCharter(s, r.charter));
            const icons = (ids: ResourceId[]) => ids.map((k) => `<span class="pg" data-tip="${GOODS[k].name}">${ICONS[k] ?? ''}</span>`).join('');
            const OWNERS: Partial<Record<BuildingType, string>> = {
              farm: 'Sows and reaps the fields drawn nearby',
              orchardist: 'Picks the orchards planted nearby',
              forester: 'Plants trees for the woodcutters',
            };
            let lines: string;
            if (OWNERS[t]) lines = `<i>${OWNERS[t]}</i>`;
            else if (t === 'byre') lines = icons(['wool', 'milk', 'meat', 'pork', 'hides']);
            else if (d.zone) lines = icons(recipes.flatMap((r) => Object.keys(r.outputs) as ResourceId[])) + (t === 'pasture' ? '<i>Grazing for the Animal Farm</i>' : '');
            else
              lines = recipes
                .filter((r) => Object.keys(r.outputs).length)
                .map((r) => `<span class="recipe">${Object.keys(r.inputs).length ? `${goods(r.inputs)}<span class="arrow">→</span>` : ''}${goods(r.outputs)}</span>`)
                .join('<span class="or">or</span>');
            return `<tr class="${lock ? 'locked' : ''}">
              <td class="pimg"><img src="${this.cardImage(t)}" alt=""></td>
              <td><b>${esc(d.name)}</b>${lock ? `<div class="neg small">${esc(lock)}</div>` : ''}</td>
              <td><div class="plines">${lines || '<i>—</i>'}</div></td>
              <td class="num">${mine.length ? `${mine.length}${slots ? `<div class="small">${staff}/${slots} at work</div>` : ''}${stuck.length ? `<div class="small neg" data-tip="${esc([...new Set(stuck.map((b) => b.status))].join('<br>'))}">${stuck.length} stalled</div>` : ''}` : ''}</td>
            </tr>`;
          })
          .join('');
        return rows ? `<h3>${CATEGORY_ICONS[cat]} ${CATEGORY_NAMES[cat]}</h3><table class="prod">${rows}</table>` : '';
      })
      .join('');
    // The chains: each good's stock and last month's making and using, weakest link flagged.
    const chains = CHAINS.filter((c) => c.links.some((id) => s.seen?.includes(id) || s.res[id] > 0))
      .map((c) => {
        const rep = chainReport(s, c.links);
        const links = rep.links
          .map(
            (l, i) => `${i ? '<span class="arrow">→</span>' : ''}<span class="link ${rep.weak === i ? 'weak' : ''}" data-tip="<b>${GOODS[l.id].name}</b><br>In store ${l.stock}<br>Made last month ${l.made}<br>Used by workshops ${l.used}">${rep.weak === i ? '⚠ ' : ''}${ICONS[l.id] ?? ''}<b>${l.stock}</b><small>+${l.made}${l.used ? ` −${l.used}` : ''}</small></span>`,
          )
          .join('');
        return `<tr><td><b>${esc(c.name)}</b></td><td><div class="chain">${links}</div>${rep.why ? `<div class="small neg">${esc(rep.why)}</div>` : ''}</td></tr>`;
      })
      .join('');
    this.openModal(`<h2>Production Book</h2>
      <p class="note">Every trade in your lands, what it takes and what it makes. Greyed trades unlock with rank or charters.</p>
      <div class="prodbook">${chains ? `<h3>Chains <small class="muted">in store, +made −used last month</small></h3><table class="prod chains">${chains}</table>` : ''}${sections}</div>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="primary" data-action="close-modal">Close</button></div>`).querySelector('.modal')!.classList.add('wide', 'prod-modal');
  }

  private charterSel: string | null = null;

  /** The charter tree: paths radiate from the Town Charter at the centre. */
  private showCharters(): void {
    const s = this.game.state;
    const W = 620;
    const cx = W / 2;
    const cy = W / 2;
    const nodes: string[] = [];
    const lines: string[] = [];
    const pos = new Map<string, [number, number]>();
    PATHS.forEach((path, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / PATHS.length;
      const at = (r: number, da = 0): [number, number] => [cx + Math.cos(a + da) * r, cy + Math.sin(a + da) * r];
      for (const c of CHARTERS.filter((x) => x.path === path.id)) {
        const p = c.rank === 3 ? at(250, c.id.endsWith('a') ? -0.16 : 0.16) : at(c.rank === 1 ? 105 : 180);
        pos.set(c.id, p);
        const prev = c.rank === 1 ? [cx, cy] : pos.get(CHARTERS.find((x) => x.path === c.path && x.rank === c.rank - 1)!.id)!;
        const taken = hasCharter(s, c.id);
        lines.push(`<line x1="${prev[0]}" y1="${prev[1]}" x2="${p[0]}" y2="${p[1]}" stroke="${taken ? path.color : '#b8a27a'}" stroke-width="${taken ? 4 : 2}" ${taken ? '' : 'stroke-dasharray="5 4"'}/>`);
      }
      const [lx, ly] = at(292);
      const cos = Math.cos(a);
      const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
      nodes.push(`<text x="${lx}" y="${ly + (Math.sin(a) > 0.5 ? 8 : Math.sin(a) < -0.5 ? -8 : 0)}" class="path-label" text-anchor="${anchor}" dominant-baseline="middle" fill="${path.color}">${esc(path.name)}</text>`);
    });
    for (const c of CHARTERS) {
      const [x, y] = pos.get(c.id)!;
      const path = PATHS.find((p) => p.id === c.path)!;
      const taken = hasCharter(s, c.id);
      const err = charterError(s, c.id);
      const open = !taken && !err;
      const reachable = !taken && (!err || /prestige/.test(err));
      const fill = taken ? path.color : reachable ? '#f4e7c8' : '#d6ccb6';
      const stroke = taken ? '#3b2a1a' : open ? '#c8a038' : reachable ? path.color : '#a89878';
      const sel = this.charterSel === c.id;
      nodes.push(`<g class="charter-node ${open ? 'open' : ''}" data-action="charter-sel" data-id="${c.id}">
        <circle cx="${x}" cy="${y}" r="${sel ? 27 : 24}" fill="${fill}" stroke="${stroke}" stroke-width="${sel || open ? 3.5 : 2}"/>
        <text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="middle" fill="${taken ? '#fff8e6' : '#3b2a1a'}" font-size="13" font-weight="700">${c.rank === 3 ? `III${c.id.slice(-1)}` : 'I'.repeat(c.rank)}</text>
      </g>`);
    }
    const taken = s.charters?.length ?? 0;
    const sel = this.charterSel ? CHARTERS.find((c) => c.id === this.charterSel) : null;
    let detail = `<h3>Town Charters</h3>
      <p>The crown grants charters that shape what kind of town yours becomes. Each one costs prestige, and every charter makes the next dearer: go deep along one path, or take a little of several.</p>
      <div class="kv"><span>${ICONS.prestige} Prestige</span><b>${Math.floor(s.res.prestige)}</b></div>
      <div class="kv"><span>Next charter costs</span><b>${charterCost(s)}</b></div>
      <div class="kv"><span>Prestige a month</span><b>+${prestigeIncome(s).toFixed(1)}</b></div>
      <div class="kv"><span>Granted</span><b>${taken}</b></div>
      ${s.tier < CHARTER_TIER ? `<p class="neg">Charters are granted once your settlement is a ${TIERS[CHARTER_TIER].name}. Prestige gathers meanwhile.</p>` : '<p class="note">Choose a circle to read its charter.</p>'}`;
    if (sel) {
      const path = PATHS.find((p) => p.id === sel.path)!;
      const err = charterError(s, sel.id);
      const done = hasCharter(s, sel.id);
      const others = sel.excludes?.map((x) => CHARTERS.find((c) => c.id === x)!.name);
      detail = `<h3 style="color:${path.color}">${esc(sel.name)}</h3>
        <div class="sub">${esc(path.name)} · rank ${sel.rank}</div>
        <p>${esc(sel.desc)}</p>
        <p class="note"><b>Drawback of the path:</b> ${esc(path.malus)}</p>
        ${others?.length ? `<p class="note">Cannot be held alongside ${esc(others.join(' or '))}.</p>` : ''}
        ${done ? '<p class="pos"><b>Granted.</b></p>' : `<div class="kv"><span>Cost</span><b>${charterCost(s)} ${ICONS.prestige}</b></div>
          <button class="primary" data-action="charter-grant" data-id="${sel.id}" ${err ? 'disabled' : ''}>Grant this charter</button>
          ${err ? `<p class="neg">${esc(err)}</p>` : ''}`}
        <p><a href="#" data-action="charter-sel" data-id="">← Back</a></p>`;
    }
    const html = `<div class="charters">
        <svg viewBox="-110 -10 ${W + 220} ${W + 20}" class="charter-tree">
          ${lines.join('')}
          <circle cx="${cx}" cy="${cy}" r="42" fill="#7a2a2a" stroke="#c8a038" stroke-width="4"/>
          <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#f4e7c8" font-size="13" font-weight="700">TOWN</text>
          <text x="${cx}" y="${cy + 11}" text-anchor="middle" fill="#f4e7c8" font-size="13" font-weight="700">CHARTER</text>
          ${nodes.join('')}
        </svg>
        <div class="charter-detail">${detail}</div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="primary" data-action="close-modal">Close</button></div>`;
    if (this.modal && this.modal.querySelector('.charters')) this.modal.querySelector('.modal')!.innerHTML = html;
    else this.openModal(html).querySelector('.modal')!.classList.add('wide', 'charter-modal');
  }

  private openModal(html: string, closable = true): HTMLElement {
    this.closeModal(true);
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal panel">${html}</div>`;
    if (closable) {
      back.addEventListener('click', (e) => {
        if (e.target === back) this.closeModal();
      });
    }
    back.dataset.closable = closable ? '1' : '0';
    this.root.appendChild(back);
    this.modal = back;
    this.game.modalOpen = true;
    return back;
  }

  closeModal(force = false): boolean {
    if (!this.modal) return false;
    if (!force && this.modal.dataset.closable !== '1') return false;
    this.modal.remove();
    this.modal = null;
    this.game.modalOpen = false;
    return true;
  }

  /**
   * Escape inside a dialog: closes it, or acts as its Back button when the
   * dialog cannot simply be dismissed. Returns true when a dialog consumed it.
   */
  handleEscape(): boolean {
    if (!this.modal && this.pinnedChip) {
      this.showChip(null);
      return true;
    }
    if (!this.modal) return this.game.modalOpen;
    if (this.closeModal()) return true;
    (this.modal.querySelector('[data-m="back"]') as HTMLElement | null)?.click();
    return true;
  }

  async showMainMenu(): Promise<void> {
    // Block game input while the save list loads, before the title appears.
    this.game.modalOpen = true;
    const saves = await listSaves().catch(() => [] as SaveInfo[]);
    const latest = saves[0];
    const m = this.openModal(
      `<h1>Corner Lands</h1>
      <div class="sub">Raise a humble hamlet into a thriving medieval city</div>
      <div class="ornament">❦ ❦ ❦</div>
      <div class="menu">
        ${latest ? `<button class="primary" data-m="continue">Continue <small>(${esc(latest.summary.split(' — ')[0])})</small></button>` : ''}
        <button class="${latest ? '' : 'primary'}" data-m="new">New Settlement</button>
        ${saves.length ? '<button data-m="load">Load Game</button>' : ''}
        <button data-m="help">How to Play</button>
      </div>`,
      false,
    );
    m.querySelector('[data-m="continue"]')?.addEventListener('click', async () => {
      this.ensureAudio();
      try {
        await this.game.load(latest!.slot, latest!.where);
        this.closeModal(true);
      } catch (err) {
        this.flash(String((err as Error).message));
      }
    });
    m.querySelector('[data-m="new"]')!.addEventListener('click', () => {
      this.ensureAudio();
      this.showNewGame(true);
    });
    m.querySelector('[data-m="load"]')?.addEventListener('click', () => this.showLoad(true));
    m.querySelector('[data-m="help"]')!.addEventListener('click', () => this.showHelp(true));
  }

  showNewGame(fromMain: boolean): void {
    const seed = Math.floor(Math.random() * 999999);
    const m = this.openModal(
      `<h2>New Settlement</h2>
      <div class="row"><label>Name</label><input id="town" value="${esc(placeName(seed))}" maxlength="40"><button data-m="rename" data-tip="Another name">🎲</button></div>
      <p>Every map is generated from a seed. Share a seed to play the same land, or take this week's seed, the same for everyone.</p>
      <div class="row"><label>Seed</label><input id="seed" value="${seed}" inputmode="numeric"><button data-m="dice" data-tip="Another land">🎲</button><button data-m="weekly" data-tip="The same land for everyone until Monday">Seed of the week</button></div>
      <div class="map-preview"><canvas width="300" height="160" aria-label="The land from above"></canvas><div class="map-facts"></div></div>
      <div class="modes">
        <label class="mode"><input type="radio" name="mode" value="normal" checked><span><b>Normal</b><br><small>Hungry or unhappy villagers will leave.</small></span></label>
        <label class="mode"><input type="radio" name="mode" value="relaxed"><span><b>Relaxed</b><br><small>Double starting supplies; nobody ever leaves in anger.</small></span></label>
        <label class="mode"><input type="radio" name="mode" value="hardy"><span><b>Hardy</b><br><small>A scarcer start, bitter winters, choosier settlers.</small></span></label>
      </div>
      <div class="ornament">❦</div>
      <div class="row" style="justify-content:flex-end">
        <button data-m="back">Back</button>
        <button class="primary" data-m="go">Found the Settlement</button>
      </div>`,
      false,
    );
    const input = m.querySelector('#seed') as HTMLInputElement;
    const seedOf = (v: string) => {
      let n = Number(v);
      if (!Number.isFinite(n) || v === '') {
        n = 0;
        for (const ch of v) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
      }
      return Math.floor(Math.abs(n)) % 2147483647;
    };
    const preview = () => this.drawMapPreview(m.querySelector('.map-preview')!, seedOf(input.value.trim()));
    let typing = 0;
    input.addEventListener('input', () => {
      clearTimeout(typing);
      typing = window.setTimeout(preview, 250);
    });
    preview();
    const town = m.querySelector('#town') as HTMLInputElement;
    // The name follows the seed until the player types their own.
    let named = false;
    town.addEventListener('input', () => (named = true));
    const reseed = (n: number) => {
      input.value = String(n);
      if (!named) town.value = placeName(n);
      preview();
    };
    m.querySelector('[data-m="dice"]')!.addEventListener('click', () => reseed(Math.floor(Math.random() * 999999)));
    m.querySelector('[data-m="weekly"]')!.addEventListener('click', () => reseed(weeklySeed()));
    m.querySelector('[data-m="rename"]')!.addEventListener('click', () => {
      town.value = placeName(Math.floor(Math.random() * 999999));
      named = true;
    });
    m.querySelector('[data-m="back"]')!.addEventListener('click', () => (fromMain ? this.showMainMenu() : this.showGameMenu()));
    m.querySelector('[data-m="go"]')!.addEventListener('click', () => {
      const mode = ((m.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value ?? 'normal') as 'normal' | 'relaxed' | 'hardy';
      this.game.newGame(seedOf(input.value.trim()), mode, town.value);
      this.closeModal(true);
      this.game.setSpeed(1);
    });
  }

  /** A card for the villager selected on the map: name, trade, home and a passing thought. */
  private villagerCard(box: HTMLElement): void {
    const g = this.game;
    const s = g.state;
    const a = g.agents.agents.find((x) => x.key === g.selectedAgent);
    if (!a) {
      g.selectedAgent = null;
      box.style.display = 'none';
      return;
    }
    const home = s.buildings.find((x) => x.id === a.home);
    const work = workplaceOf(s, a);
    const key = JSON.stringify(['folk', a.key, a.role, home?.unmet, s.report.shortage, monthOf(s.day)]);
    if (key === this.lastInspectorKey) return;
    this.lastInspectorKey = key;
    box.style.display = 'block';
    box.innerHTML = `<button class="close" data-action="deselect">✕</button>
      <h2>${esc(folkName(s, a))}</h2>
      <div class="desc">${esc(folkDoing(s, a))}</div>
      ${home ? `<div class="kv link" data-action="goto-b" data-id="${home.id}"><span>Lives in</span><span>${esc(buildingName(home))}</span></div>` : ''}
      ${work ? `<div class="kv link" data-action="goto-b" data-id="${work.id}"><span>${a.role.kind === 'build' ? 'Building' : 'Works at'}</span><span>${esc(buildingName(work))}</span></div>` : ''}
      <p class="thought">“${esc(folkThought(s, a))}”</p>`;
  }

  /** The land a seed makes, from above, with what lies near the starting manor. */
  private drawMapPreview(box: HTMLElement, seed: number): void {
    const s = generateWorld(seed);
    const cv = box.querySelector('canvas')!;
    const c = cv.getContext('2d')!;
    const W = s.width;
    const H = s.height;
    const tiles = document.createElement('canvas');
    tiles.width = W;
    tiles.height = H;
    const t = tiles.getContext('2d')!;
    const img = t.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const col =
        s.terrain[i] === 1 ? [64, 122, 156] : s.occ[i] >= 0 ? [200, 70, 50] : s.road[i] ? [170, 140, 96] : s.rock[i] ? [150, 148, 140] : s.ore[i] ? [120, 90, 70] : s.trees[i] ? [46, 92 + s.trees[i] * 4, 46] : [118 + s.fertility[i] * 20, 150 + s.fertility[i] * 30, 70];
      img.data.set([col[0], col[1], col[2], 255], i * 4);
    }
    t.putImageData(img, 0, 0);
    // Isometric: rotate the tile grid by 45 degrees and squash it vertically.
    const k = Math.min(cv.width / (W + H), (cv.height * 2) / (W + H)) * Math.SQRT2;
    c.clearRect(0, 0, cv.width, cv.height);
    c.save();
    c.translate(cv.width / 2, (cv.height - ((W + H) * k) / Math.SQRT2 / 2) / 2);
    c.scale(1, 0.5);
    c.rotate(Math.PI / 4);
    c.imageSmoothingEnabled = false;
    c.drawImage(tiles, 0, 0, W * k, H * k);
    c.restore();
    // What a settler would ask about the land.
    const hall = s.buildings.find((b) => b.type === 'townhall')!;
    const c0 = bCenter(hall);
    let near = 0;
    let rock = 0;
    let ore = 0;
    let fertile = 0;
    let water = 0;
    let forest = 0;
    for (let i = 0; i < W * H; i++) {
      if (s.terrain[i] === 1) water++;
      else if (s.trees[i]) forest++;
      const x = i % W;
      const y = Math.floor(i / W);
      if (Math.hypot(x + 0.5 - c0.x, y + 0.5 - c0.y) > 14) continue;
      near++;
      if (s.rock[i]) rock++;
      if (s.ore[i]) ore++;
      fertile += s.fertility[i];
    }
    const pct = (n: number, of: number) => Math.round((100 * n) / Math.max(1, of));
    const soil = fertile / Math.max(1, near);
    box.querySelector('.map-facts')!.innerHTML = `
      <div>Forest ${pct(forest, W * H)}% · water ${pct(water, W * H)}%</div>
      <div>Near the manor: ${rock ? 'rock' : '<span class="neg">no rock</span>'}, ${ore ? 'iron ore' : 'no ore'}</div>
      <div>Soil around it: ${soil < 0.4 ? 'poor' : soil < 0.7 ? 'fair' : 'rich'}</div>`;
  }

  showGameMenu(): void {
    const m = this.openModal(
      `<h1>Corner Lands</h1>
      <div class="sub">${esc(this.game.summary())}</div>
      <div class="menu">
        <button class="primary" data-m="resume">Resume</button>
        <button data-m="save">Save Game</button>
        <button data-m="load">Load Game</button>
        <button data-m="new">New Settlement</button>
        <button data-m="help">How to Play</button>
        <button data-m="sound">Sound: ${this.muted ? 'Off' : 'On'}</button>
        <button data-m="scale">Text size: ${Math.round(this.uiScale * 100)}%</button>
        <button data-m="pausebad">Pause on bad news: ${this.pauseOnBad ? 'On' : 'Off'}</button>
        <button data-m="tips">Tips: ${this.tipsOn ? 'On' : 'Off'}</button>
        <button data-m="picture">📷 Save a picture</button>
      </div>
      <div class="seed-line" data-tip="Start a New Settlement with this seed to play the same land.">Map seed <b>${this.game.state.seed}</b> <button data-m="seed">Copy</button></div>`,
    );
    m.querySelector('[data-m="resume"]')!.addEventListener('click', () => this.closeModal());
    m.querySelector('[data-m="save"]')!.addEventListener('click', () => this.showSave());
    m.querySelector('[data-m="load"]')!.addEventListener('click', () => this.showLoad(false));
    m.querySelector('[data-m="new"]')!.addEventListener('click', () => this.showNewGame(false));
    m.querySelector('[data-m="help"]')!.addEventListener('click', () => this.showHelp(false));
    m.querySelector('[data-m="pausebad"]')!.addEventListener('click', () => {
      this.pauseOnBad = !this.pauseOnBad;
      try {
        localStorage.setItem('cornerlands.pauseOnBad', this.pauseOnBad ? '1' : '0');
      } catch {
        /* ignore */
      }
      this.showGameMenu();
    });
    m.querySelector('[data-m="picture"]')!.addEventListener('click', () => {
      // Close the menu first so the picture shows the town, not the dialog.
      this.closeModal();
      requestAnimationFrame(() => requestAnimationFrame(() => this.game.savePicture()));
    });
    m.querySelector('[data-m="seed"]')!.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(String(this.game.state.seed));
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Copy failed';
      }
    });
    m.querySelector('[data-m="tips"]')!.addEventListener('click', () => {
      this.tipsOn = !this.tipsOn;
      // Turning tips back on shows them all again from the start.
      if (this.tipsOn) this.tipsSeen.clear();
      try {
        localStorage.setItem('cornerlands.tipsOff', this.tipsOn ? '0' : '1');
        if (this.tipsOn) localStorage.removeItem('cornerlands.tips');
      } catch {
        /* ignore */
      }
      this.showGameMenu();
    });
    m.querySelector('[data-m="scale"]')!.addEventListener('click', () => {
      const steps = [0.85, 1, 1.15, 1.3];
      this.uiScale = steps[(steps.indexOf(this.uiScale) + 1) % steps.length];
      this.applyScale();
      try {
        localStorage.setItem('cornerlands.uiScale', String(this.uiScale));
      } catch {
        /* ignore */
      }
      this.showGameMenu();
    });
    m.querySelector('[data-m="sound"]')!.addEventListener('click', () => {
      this.muted = !this.muted;
      this.ambient?.setMuted(this.muted);
      if (!this.muted) this.ensureAudio();
      try {
        localStorage.setItem('cornerlands.muted', this.muted ? '1' : '0');
      } catch {
        /* ignore */
      }
      this.showGameMenu();
    });
  }

  private showSave(): void {
    const m = this.openModal(
      `<h2>Save Game</h2>
      <div class="row"><input id="slot" value="${esc(townName(this.game.state).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-village')}" maxlength="40"><button class="primary" data-m="save">Save</button></div>
      <p id="save-msg" style="min-height:1.2em"></p>
      <p class="note">To share this town with a friend, download it as a file; they open it from Load Game.</p>
      <div class="row" style="justify-content:space-between"><button data-m="file">⬇ Download as a file</button><button data-m="back">Back</button></div>`,
    );
    m.querySelector('[data-m="file"]')!.addEventListener('click', () => {
      this.game.exportFile();
      this.sound('good');
    });
    const input = m.querySelector('#slot') as HTMLInputElement;
    const msg = m.querySelector('#save-msg')!;
    m.querySelector('[data-m="save"]')!.addEventListener('click', async () => {
      try {
        const where = await this.game.save(input.value || 'save');
        msg.textContent = where === 'server' ? 'Saved to the game server.' : 'Saved in this browser.';
        this.sound('good');
      } catch (err) {
        msg.textContent = String((err as Error).message);
      }
    });
    m.querySelector('[data-m="back"]')!.addEventListener('click', () => this.showGameMenu());
  }

  private async showLoad(fromMain: boolean): Promise<void> {
    const saves = await listSaves().catch(() => [] as SaveInfo[]);
    const list = saves
      .map(
        (s, i) => `<div class="save">${s.thumb ? `<img class="thumb" src="${esc(s.thumb)}" alt="">` : ''}<div class="n">${s.slot.startsWith('autosave') ? '<i>Autosave</i>' : esc(s.slot)}<br><small>${esc(s.summary.split(' — ')[0])} · ${new Date(s.updated).toLocaleString()} · ${s.where}</small>${s.summary.includes(' — ') ? `<br><small class="deeds">${esc(s.summary.split(' — ')[1])}</small>` : ''}</div>
        <button class="primary" data-load="${i}">Load</button><button data-del="${i}" title="Delete">✖</button></div>`,
      )
      .join('');
    const m = this.openModal(
      `<h2>Load Game</h2>
      <div class="saves">${list || '<i>No saved games yet.</i>'}</div>
      <div class="row" style="justify-content:space-between"><button data-m="open-file">📂 Open a town file…</button><input class="file-pick" type="file" accept=".json,application/json" hidden><button data-m="back">Back</button></div>`,
      !fromMain,
    );
    const pick = m.querySelector('input.file-pick') as HTMLInputElement;
    m.querySelector('[data-m="open-file"]')!.addEventListener('click', () => pick.click());
    pick.addEventListener('change', async () => {
      const f = pick.files?.[0];
      if (!f) return;
      try {
        this.game.importText(await f.text());
        this.closeModal(true);
        this.sound('good');
      } catch (err) {
        this.flash(String((err as Error).message));
      }
    });
    m.querySelectorAll('[data-load]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const s = saves[Number((btn as HTMLElement).dataset.load)];
        try {
          await this.game.load(s.slot, s.where);
          this.closeModal(true);
        } catch (err) {
          this.flash(String((err as Error).message));
        }
      }),
    );
    m.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const s = saves[Number((btn as HTMLElement).dataset.del)];
        await deleteSave(s.slot, s.where);
        this.showLoad(fromMain);
      }),
    );
    m.querySelector('[data-m="back"]')!.addEventListener('click', () => (fromMain ? this.showMainMenu() : this.showGameMenu()));
  }

  private showHelp(fromMain: boolean): void {
    const m = this.openModal(
      `<h2>How to Play</h2>
      <div class="help">
        <p><b>Grow your settlement</b> from a Hamlet into a City. Open the objectives pill (top left) for guidance; raise the Manor Hall to climb the ranks.</p>
        <p><b>Building:</b> pick a category at the bottom, then a building, then click the map. Builders carry the materials over from storage, one load per trip, and then raise the walls. Plans can wait for materials.</p>
        <p><b>Fields, pastures and orchards</b> (Farming) are drawn: click one corner, then the opposite one, near a Farmstead, Animal Farm or Orchard Keeper's Lodge. Choose each field's crop and each farm's animals in the panel.</p>
        <p><b>Roads</b> are optional but villagers walk faster on them, faster still on paved stone (T). Click to start, click again to lay it, keep clicking to continue.</p>
        <p><b>The top bar</b> shows happiness, villagers, food, materials, goods and the treasury. Hover a chip for the details, click to pin it: set how much of each good to keep and whether merchants may buy the surplus. Workers rest when their goods reach the target.</p>
        <p><b>Workers:</b> select a workplace to choose how many villagers work there, its priority and its product. Seasonal work frees hands in the off season. Hover the villagers chip to see who is idle and where hands are short.</p>
        <p><b>Retinue</b>: a Borough can raise men-at-arms at the manor for prestige and arms. Paid 10 coins a month, they ride out against wolves and bandits.</p>
        <p><b>Harvest feast</b>: once each autumn, select the manor to call a feast. A meal for everyone and drink for every eight cheer the town for half a year and bring prestige.</p>
        <p><b>Homes</b> eat one food a month each; several food groups (grain, meat, produce, dairy) cheer them. When every food is gone they boil stored wheat or oats into pottage, which is only half as filling. Each winter month a home burns firewood. Finer homes need clothes, a tavern, boots and medicine, and enjoy luxuries; families in them can work a craft from home.</p>
        <p><b>Prestige</b> comes from a fine manor, a church and monuments. From Town on, spend it on <b>charters</b> (crown button) to specialise your town.</p>
        <p>Your <b>steward</b> warns you when things go wrong; the <b>Chronicle</b> (scroll button) keeps the full story.</p>
        <div class="ornament">❦</div>
        <p><b>Keys</b>: <kbd>Left-drag</kbd> / <kbd>WASD</kbd> / arrows pan · <kbd>Wheel</kbd> / <kbd>+</kbd><kbd>-</kbd> / pinch zoom · <kbd>R</kbd> road (click, click) · <kbd>T</kbd> paved road · <kbd>X</kbd> / <kbd>Del</kbd> demolish · <kbd>P</kbd> protect a wood · <kbd>V</kbd> reach of wells, markets, taverns, churches · <kbd>Ctrl+Z</kbd> undo the last placement or demolition · ${BUILD_ORDER.filter((b) => BUILDINGS[b].hotkey)
          .map((b) => `<kbd>${BUILDINGS[b].hotkey!.toUpperCase()}</kbd> ${BUILDINGS[b].name.toLowerCase()}`)
          .join(' · ')} · <kbd>Space</kbd> pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed</p>
        <p><b>Playing with friends:</b> found the same land with the seed of the week, download your town from Save Game for a friend to open, and compare <b>scores</b> on the load cards: villagers and rank, the lord's title, great works, works of art, milestones and every year in which no one went hungry.</p>
        <p><kbd>Esc</kbd>, <kbd>Right-click</kbd> or a long press on touch screens backs out one step at a time: a dialog, a pinned panel, a half-drawn road or field, the tool, the selection, then opens the menu.</p>
      </div>
      <div class="row" style="justify-content:flex-end"><button class="primary" data-m="back">Back</button></div>`,
      !fromMain,
    );
    m.querySelector('[data-m="back"]')!.addEventListener('click', () => (fromMain ? this.showMainMenu() : this.showGameMenu()));
  }

  private showLedger(): void {
    const s = this.game.state;
    const h = s.history;
    if (h.length < 2) {
      this.openModal(`<h2>Town Ledger</h2><p>The clerk needs a couple of months of records before drawing any charts. Check back soon.</p>
        <div class="row" style="justify-content:flex-end"><button class="primary" data-action="close-modal">Close</button></div>`);
      return;
    }
    const charts: [string, keyof (typeof h)[number], string][] = [
      ['Villagers', 'pop', ''],
      ['Food in store', 'food', ''],
      ['Happiness', 'happy', '%'],
      ['Gold', 'gold', ''],
    ];
    const html = charts.map(([title, key, unit]) => lineChart(title, h.map((p) => [p.d, p[key]]), unit, key === 'happy' ? 100 : undefined)).join('');
    const m = this.openModal(`<h2>Town Ledger</h2>
      <div class="ledger">${html}</div>
      <div class="row" style="justify-content:flex-end"><button class="primary" data-action="close-modal">Close</button></div>`);
    m.querySelector('.modal')!.classList.add('wide');
    m.querySelectorAll<SVGSVGElement>('svg.chart').forEach(bindChartHover);
  }

  private showTrade(): void {
    const s = this.game.state;
    const staffed = s.buildings.some((b) => b.type === 'market' && b.build >= 1 && b.workers > 0);
    const basic: ResourceId[] = ['wood', 'stone', 'planks', 'tools', 'bread', 'meat', 'fish', 'grain'];
    const rows = (Object.keys(TRADE_PRICES) as ResourceId[])
      .filter((r) => basic.includes(r) || s.seen?.includes(r))
      .map((r) => {
        const buy = buyPrice(s, r, 10);
        const sell = sellPrice(s, r, 10);
        const keep = keepOf(s, r);
        const on = selling(s, r);
        return `<tr><td>${ICONS[r]} ${RESOURCE_INFO[r].name}</td><td class="num">${Math.floor(s.res[r])}</td>
          <td><button data-action="trade-do" data-res="${r}" data-n="10" ${s.res.gold < buy || roomFor(s, r) < 10 ? 'disabled' : ''}>Buy 10 <small>${buy}c</small></button></td>
          <td><button data-action="trade-do" data-res="${r}" data-n="-10" ${s.res[r] < 10 ? 'disabled' : ''}>Sell 10 <small>+${sell}c</small></button></td>
          <td class="export">
            <button data-action="export-toggle" data-res="${r}" class="${on ? 'active' : ''}" data-tip="Sell surplus to visiting merchants each month">${on ? 'Exporting' : 'Export'}</button>
            ${on ? `<span class="keep">keep <button data-action="export-keep" data-res="${r}" data-d="-10">−</button><b>${keep}</b><button data-action="export-keep" data-res="${r}" data-d="10">+</button></span>` : ''}
          </td></tr>`;
      })
      .join('');
    const wasOpen = this.modal && this.modal.querySelector('.trade');
    const last = s.report.trade ?? 0;
    const html = `<h2>Marketplace Trade</h2>
      <p>Gold: <b>${Math.floor(s.res.gold)}</b> ${ICONS.gold} · ${staffed ? `Merchants visit every month and buy up to ${EXPORT_PER_MARKET} goods per market${last ? ` (last month: +${last} gold)` : ''}.` : '<span class="neg">Staff the marketplace so merchants will visit.</span>'}</p>
      <table class="trade">${rows}</table>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="primary" data-action="close-modal">Done</button></div>`;
    if (wasOpen && this.modal) {
      this.modal.querySelector('.modal')!.innerHTML = html;
    } else {
      this.openModal(html).querySelector('.modal')!.classList.add('wide');
    }
  }

  // ---------------------------------------------------------------- sound

  private ensureAudio(): void {
    if (this.audio || this.muted) return;
    try {
      this.audio = new AudioContext();
      this.ambient = new Ambient(this.audio);
    } catch {
      /* no audio */
    }
  }

  /** Drives ambient sound; called every frame. */
  tickAudio(dt: number, running: boolean): void {
    if (!this.ambient || this.muted || this.audio?.state !== 'running') return;
    this.ambient.update(dt, seasonOf(this.game.state.day), running);
  }

  sound(kind: 'place' | 'road' | 'demolish' | 'good' | 'bad' | 'coin' | 'jig' | 'fanfare' | 'march' | 'stone'): void {
    if (this.muted) return;
    this.ensureAudio();
    const ac = this.audio;
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume().catch(() => undefined);
    const now = ac.currentTime;
    const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) => {
      const o = ac.createOscillator();
      const gn = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now + start);
      gn.gain.setValueAtTime(0, now + start);
      gn.gain.linearRampToValueAtTime(vol, now + start + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      o.connect(gn).connect(ac.destination);
      o.start(now + start);
      o.stop(now + start + dur + 0.05);
    };
    const noise = (dur: number, vol: number, freq: number) => {
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const gn = ac.createGain();
      gn.gain.value = vol;
      src.connect(f).connect(gn).connect(ac.destination);
      src.start(now);
    };
    switch (kind) {
      case 'place':
        tone(140, 0, 0.18, 'triangle', 0.2);
        tone(210, 0.07, 0.15, 'triangle', 0.12);
        noise(0.12, 0.15, 900);
        break;
      case 'road':
        noise(0.2, 0.18, 600);
        break;
      case 'demolish':
        noise(0.45, 0.3, 1200);
        tone(90, 0, 0.3, 'sawtooth', 0.06);
        break;
      case 'good':
        tone(523, 0, 0.25, 'sine', 0.08);
        tone(659, 0.1, 0.25, 'sine', 0.08);
        tone(784, 0.2, 0.35, 'sine', 0.08);
        break;
      case 'bad':
        tone(300, 0, 0.2, 'triangle', 0.08);
        tone(220, 0.12, 0.3, 'triangle', 0.08);
        break;
      case 'coin':
        tone(1200, 0, 0.12, 'square', 0.04);
        tone(1600, 0.06, 0.18, 'square', 0.04);
        break;
      case 'jig':
        // A few bars on a pipe for a festival.
        [784, 880, 988, 880, 784, 659, 784, 988].forEach((f, i) => tone(f, i * 0.11, 0.14, 'triangle', 0.06));
        break;
      case 'fanfare':
        // Heralds' trumpets for a fair.
        tone(392, 0, 0.18, 'sawtooth', 0.035);
        tone(523, 0.16, 0.18, 'sawtooth', 0.035);
        tone(659, 0.32, 0.18, 'sawtooth', 0.035);
        tone(784, 0.48, 0.5, 'sawtooth', 0.04);
        break;
      case 'march':
        // Drums as the men-at-arms take service.
        for (let i = 0; i < 4; i++) {
          tone(80, i * 0.22, 0.16, 'sine', 0.2);
          noise(0.08, 0.08, 400);
        }
        break;
      case 'stone':
        tone(70, 0, 0.25, 'sine', 0.22);
        noise(0.18, 0.12, 500);
        break;
    }
  }
}

function upgradeName(b: Building): string {
  const to = b.upgrading ?? b.level + 1;
  if (b.type === 'house') return HOUSE_LEVELS[to]?.name ?? '';
  if (b.type === 'townhall') return MANOR_LEVELS[to]?.name ?? '';
  return `Expanded ${BUILDINGS[b.type].name}`;
}

// ------------------------------------------------------------------ charts

const CW = 260;
const CH = 120;
const PAD = { l: 34, r: 10, t: 8, b: 20 };

/** A single-series line chart in the ledger's ink colour. */
function lineChart(title: string, pts: [number, number][], unit: string, fixedMax?: number): string {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const yMax = fixedMax ?? niceMax(Math.max(1, ...ys));
  const sx = (x: number) => PAD.l + ((x - x0) / Math.max(1, x1 - x0)) * (CW - PAD.l - PAD.r);
  const sy = (y: number) => CH - PAD.b - (y / yMax) * (CH - PAD.t - PAD.b);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
  const area = `${path}L${sx(x1).toFixed(1)},${sy(0)}L${sx(x0).toFixed(1)},${sy(0)}Z`;
  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = sy(yMax * f);
      return `<line x1="${PAD.l}" x2="${CW - PAD.r}" y1="${y}" y2="${y}" class="grid"/><text x="${PAD.l - 5}" y="${y + 4}" text-anchor="end" class="tick">${fmtNum(yMax * f)}</text>`;
    })
    .join('');
  // Year ticks.
  let years = '';
  for (let d = Math.ceil(x0 / 120) * 120; d <= x1; d += 120 * Math.max(1, Math.ceil((x1 - x0) / 120 / 6))) {
    years += `<text x="${sx(d)}" y="${CH - 5}" text-anchor="middle" class="tick">Y${d / 120 + 1}</text>`;
  }
  const last = ys[ys.length - 1];
  return `<figure class="chart-card">
    <figcaption><span>${title}</span><b>${fmtNum(last)}${unit}</b></figcaption>
    <svg class="chart" viewBox="0 0 ${CW} ${CH}" data-pts='${JSON.stringify(pts)}' data-unit="${unit}" data-max="${yMax}" role="img" aria-label="${title} over time, now ${fmtNum(last)}${unit}">
      ${grid}${years}
      <path d="${area}" class="area"/>
      <path d="${path}" class="line"/>
      <g class="hover" style="display:none"><line class="cross" y1="${PAD.t}" y2="${CH - PAD.b}"/><circle r="4"/><rect class="hvbg" rx="3" height="15"/><text class="hv" y="${PAD.t + 10}"></text></g>
      <rect x="${PAD.l}" y="0" width="${CW - PAD.l - PAD.r}" height="${CH}" fill="transparent"/>
    </svg></figure>`;
}

function bindChartHover(svg: SVGSVGElement): void {
  const pts = JSON.parse(svg.dataset.pts!) as [number, number][];
  const unit = svg.dataset.unit ?? '';
  const yMax = Number(svg.dataset.max);
  const g = svg.querySelector('.hover') as SVGGElement;
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const sx = (x: number) => PAD.l + ((x - x0) / Math.max(1, x1 - x0)) * (CW - PAD.l - PAD.r);
  const sy = (y: number) => CH - PAD.b - (y / yMax) * (CH - PAD.t - PAD.b);
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * CW;
    let best = pts[0];
    for (const p of pts) if (Math.abs(sx(p[0]) - vx) < Math.abs(sx(best[0]) - vx)) best = p;
    const x = sx(best[0]);
    g.style.display = '';
    g.querySelector('line')!.setAttribute('x1', String(x));
    g.querySelector('line')!.setAttribute('x2', String(x));
    const c = g.querySelector('circle')!;
    c.setAttribute('cx', String(x));
    c.setAttribute('cy', String(sy(best[1])));
    const t = g.querySelector('text')!;
    const month = MONTH_NAMES[Math.floor(best[0] / 10) % 12];
    t.textContent = `${month}, Y${Math.floor(best[0] / 120) + 1}: ${fmtNum(best[1])}${unit}`;
    const right = x > CW / 2;
    t.setAttribute('x', String(right ? x - 6 : x + 6));
    t.setAttribute('text-anchor', right ? 'end' : 'start');
    const bb = t.getBBox();
    const bg = g.querySelector('rect')!;
    bg.setAttribute('x', String(bb.x - 3));
    bg.setAttribute('y', String(bb.y - 1));
    bg.setAttribute('width', String(bb.width + 6));
    bg.setAttribute('height', String(bb.height + 2));
  });
  svg.addEventListener('pointerleave', () => (g.style.display = 'none'));
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function fmtNum(v: number): string {
  return v >= 10000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
}
