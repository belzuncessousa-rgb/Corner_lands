import { deleteSave, listSaves, type SaveInfo } from '../api';
import {
  BUILDINGS,
  BUILD_ORDER,
  CATEGORY_NAMES,
  HOUSE_UPGRADE_COST,
  MONTH_NAMES,
  RESOURCE_INFO,
  SEASON_NAMES,
  SELL_FACTOR,
  EXPORT_PER_MARKET,
  TAX_LEVELS,
  TIERS,
  TRADE_PRICES,
} from '../game/data';
import { getEvent, resolveEvent } from '../game/events';
import { activeQuests } from '../game/quests';
import { StateRng } from '../game/rng';
import {
  canAfford,
  canUpgrade,
  demolish,
  employed,
  hasBuilt,
  housingOf,
  isUnlocked,
  log,
  monthOf,
  nextTierRequirements,
  recompute,
  seasonOf,
  setExport,
  setTax,
  hasProblem,
  roomFor,
  storageCap,
  stored,
  totalFood,
  totalHousing,
  trade,
  upgradeHouse,
  yearOf,
} from '../game/sim';
import type { Building, BuildingType, Category, Cost, ResourceId } from '../game/types';
import { FOOD_IDS } from '../game/types';
import { idx, inBounds } from '../game/world';
import type { Game } from '../main';
import { CATEGORY_ICONS, ICONS, SEASON_ICONS } from './icons';
import { Minimap } from './minimap';
import { Ambient } from './ambient';

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
function setHTML(el: HTMLElement, html: string): void {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

const TOP_RES: ResourceId[] = ['wood', 'stone', 'planks', 'iron', 'tools', 'grain', 'gold'];

export class Hud {
  private el: Record<string, HTMLElement> = {};
  /** Open build category, or null when the build menu is folded away. */
  private category: Category | null = null;
  private townOpen = false;
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
    } catch {
      /* ignore */
    }
    root.classList.toggle('demo', game.demo);
    root.innerHTML = `
      <div id="top">
        <div class="stack">
          <div class="btnrow">
            <button id="menu-btn" class="panel icon-btn" data-action="menu" data-tip="Menu (Esc)">${CATEGORY_ICONS.menu}</button>
            <button class="panel icon-btn" data-action="chronicle" data-tip="<b>Chronicle</b><br>Everything that has happened in your lands.">${CATEGORY_ICONS.scroll}</button>
          </div>
          <div id="objectives" class="panel"></div>
        </div>
        <div id="topbar" class="panel"></div>
        <div class="stack right">
          <div id="clock" class="panel"></div>
          <div id="town" class="panel"></div>
        </div>
      </div>
      <div id="season-banner"></div>
      <div id="log"></div>
      <div id="inspector" class="panel" style="display:none"></div>
      <div id="hint" class="panel" style="display:none"></div>
      <div id="buildbar" class="panel"></div>
      <div id="tooltip" class="panel"></div>`;
    for (const id of ['topbar', 'clock', 'objectives', 'town', 'log', 'inspector', 'hint', 'buildbar', 'tooltip', 'season-banner']) {
      this.el[id] = root.querySelector(`#${id}`)!;
    }
    this.minimap = new Minimap(root, game.renderer, () => game.state);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('mousemove', (e) => this.onTipMove(e));
    root.addEventListener('mouseleave', () => (this.el.tooltip.style.display = 'none'));
    this.rebuild();
  }

  // ---------------------------------------------------------------- build

  rebuild(): void {
    this.lastTier = this.game.state.tier;
    this.lastSeason = seasonOf(this.game.state.day);
    this.category = null;
    this.shownMessages = this.game.state.messages.length;
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
      <button data-action="road" class="tab ${tool.kind === 'road' ? 'active' : ''}" data-tip="<b>Road</b> (R)<br>Click to start, click again to lay it. Roads speed up walking; buildings work without them.">${ICONS.road}<span>Road</span></button>
      <button data-action="demolish" class="tab ${tool.kind === 'demolish' ? 'active' : ''}" data-tip="<b>Demolish</b> (X)<br>Remove buildings or roads. Finished buildings return half their cost.">${ICONS.demolish}<span>Demolish</span></button>`;
    let cards = '';
    if (this.category) {
      cards = BUILD_ORDER.filter((t) => BUILDINGS[t].category === this.category)
        .map((t) => {
          const d = BUILDINGS[t];
          const locked = !isUnlocked(s, t);
          const poor = !canAfford(s, d.cost);
          const sel = tool.kind === 'build' && tool.type === t;
          return `<div class="card ${sel ? 'sel' : ''} ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}" data-action="build" data-type="${t}" data-tip="${esc(this.buildingTip(t))}">
            ${d.hotkey ? `<span class="key">${d.hotkey}</span>` : ''}
            <img src="${this.cardImage(t)}" alt="" draggable="false">
            ${locked ? `<div class="lock">${TIERS[d.tier].name}</div>` : ''}
            <div class="name">${d.name}</div>
            <div class="cost">${costHtml(d.cost, s.res)}</div>
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
      t.kind === 'build' ? t.type : '',
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
    if (d.tier > this.game.state.tier) lines.push(`<span class="neg">Unlocks at ${TIERS[d.tier].name}</span>`);
    else if (!canAfford(this.game.state, d.cost)) lines.push('<i>You can place it now; builders wait until the materials are in storage.</i>');
    return lines.join('<br>');
  }

  // ---------------------------------------------------------------- update

  update(): void {
    const g = this.game;
    const s = g.state;

    // Top bar.
    const food = totalFood(s);
    const foodTip = `<b>Food</b><br>${FOOD_IDS.map((f) => `${RESOURCE_INFO[f].name}: ${Math.floor(s.res[f])}`).join('<br>')}<br>Villagers eat ${s.population} per month.`;
    const months = s.population ? food / s.population : 99;
    const housing = totalHousing(s);
    let html = `
      <div class="res" data-tip="<b>Villagers</b><br>${s.population} living here, housing for ${housing}.<br>${employed(s)} employed.">${ICONS.people}${s.population}<span class="delta">/${housing}</span></div>
      <div class="res ${s.happiness < 35 ? 'low' : ''}" data-tip="<b>Happiness</b><br>Above 50 attracts settlers. Below 30 drives them away.">${ICONS.happy}${s.happiness}%</div>
      <div class="sep"></div>
      <div class="res ${months < 1.2 ? 'low' : ''}" data-tip="${esc(foodTip)}">${ICONS.bread}${Math.floor(food)}</div>`;
    for (const r of TOP_RES) {
      const v = Math.floor(s.res[r]);
      // Goods you have never had stay out of the way until they matter.
      if (v <= 0 && r !== 'gold' && r !== 'wood' && r !== 'stone' && !(r === 'planks' && s.tier >= 1) && !(r === 'tools' && s.tier >= 2)) continue;
      const full = r !== 'gold' && roomFor(s, r) <= 0;
      html += `<div class="res ${full ? 'full' : ''}" data-tip="<b>${RESOURCE_INFO[r].name}</b><br>${esc(RESOURCE_INFO[r].desc)}">${ICONS[r]}${v}</div>`;
    }
    const matUsed = Math.floor(stored(s, 'materials'));
    const matCap = storageCap(s, 'materials');
    const foodUsed = Math.floor(stored(s, 'food'));
    const foodCap = storageCap(s, 'food');
    html += `<div class="sep"></div>
      <div class="res ${matUsed >= matCap ? 'full' : ''}" data-tip="<b>Storehouses</b><br>Building materials: ${matUsed} of ${matCap}.<br>Build a Storehouse for more room.">${ICONS.storage}<span class="delta">${Math.round((100 * matUsed) / Math.max(1, matCap))}%</span></div>
      <div class="res ${foodUsed >= foodCap ? 'full' : ''}" data-tip="<b>Granaries</b><br>Food: ${foodUsed} of ${foodCap}.<br>Build a Granary for more room.">${ICONS.granary}<span class="delta">${Math.round((100 * foodUsed) / Math.max(1, foodCap))}%</span></div>`;
    setHTML(this.el.topbar, html);

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
    this.updateTown();
    if (this.buildBarState() !== this.buildBarKey) this.renderBuildBar();
    this.updateInspector();
    this.updateLog();
    this.updateSeason();
    this.updateHint();
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
    this.el.objectives.className = `panel pill-panel ${this.objectivesMin ? 'min' : ''}`;
    setHTML(
      this.el.objectives,
      this.objectivesMin
        ? `<button class="pill" data-action="toggle-obj"><b>${tier.name}</b><span class="sep-dot">·</span>Objectives${active.length ? ` <span class="count">${active.length - ready}</span>` : ' ✓'} <span class="chev">▾</span></button>`
        : `<button class="pill" data-action="toggle-obj"><b>${tier.name}</b><span class="chev">▴</span></button>
      <div class="body">
        ${next ? `<div class="tier-next">Next: <b>${next.name}</b> — ${req.join(', ')}</div>` : `<div class="tier-next">${tier.desc}</div>`}
        <h3>Objectives</h3>
        ${quests || '<div class="quest"><i>All objectives complete. Your lands flourish!</i></div>'}
      </div>`,
    );
  }

  private updateTown(): void {
    const g = this.game;
    const s = g.state;
    const jobs = s.buildings.reduce((a, b) => a + (b.build >= 1 && !b.paused ? BUILDINGS[b.type].workers : 0), 0);
    const working = s.buildings.reduce((a, b) => a + (b.build >= 1 ? b.workers : 0), 0);
    const building = s.buildings.reduce((a, b) => a + (b.build < 1 ? b.workers : 0), 0);
    const factors = s.happinessFactors
      .map((f) => `<div><span>${f.label}</span><span class="${f.value >= 0 ? 'pos' : 'neg'}">${f.value > 0 ? '+' : ''}${f.value}</span></div>`)
      .join('');
    const taxes = TAX_LEVELS.map(
      (t, i) => `<button data-action="tax" data-level="${i}" class="${s.taxLevel === i ? 'active' : ''}" data-tip="<b>${t.name} taxes</b><br>${t.perHead} gold per villager per month.<br>Happiness ${t.happiness >= 0 ? '+' : ''}${t.happiness}">${t.name}</button>`,
    ).join('');
    const r = s.report;
    const mood = s.happiness >= 65 ? '😊' : s.happiness >= 45 ? '🙂' : s.happiness >= 30 ? '😐' : '☹';
    this.el.town.className = `panel pill-panel ${this.townOpen ? '' : 'min'}`;
    const pill = `<button class="pill" data-action="toggle-town" data-tip="<b>Your people</b><br>Happiness, jobs and taxes">${mood} <b>${s.happiness}%</b><span class="sep-dot">·</span>${ICONS.people}${s.population}<span class="chev">${this.townOpen ? '▴' : '▾'}</span></button>`;
    setHTML(
      this.el.town,
      this.townOpen
        ? `${pill}
      <div class="body">
      <div class="bar"><i style="width:${s.happiness}%;background-position:${-220 + s.happiness * 2.2}px 0"></i></div>
      <div class="factors">${factors || '<i>No villagers yet</i>'}</div>
      <div class="row"><span>At work</span><span>${working} / ${jobs} jobs</span></div>
      <div class="row"><span>Building</span><span>${building}</span></div>
      <div class="row"><span>Idle</span><span>${Math.max(0, s.population - working - building)}</span></div>
      <div class="row"><span>Last month</span><span>ate ${r.eaten}${r.shortage ? `, <span class="neg">${r.shortage} hungry</span>` : ''}</span></div>
      <div class="row"><span>Taxes</span><span>+${r.taxes} ${ICONS.gold}</span></div>
      <div class="tax">${taxes}</div>
      <div class="town-actions">
        <button data-action="ledger">Ledger</button>
        ${hasBuilt(s, 'market') ? '<button data-action="trade">Trade</button>' : ''}
      </div></div>`
        : pill,
    );
  }

  private updateInspector(): void {
    const g = this.game;
    const s = g.state;
    const b = g.selected !== null ? s.buildings.find((o) => o.id === g.selected) : undefined;
    const box = this.el.inspector;
    if (!b) {
      box.style.display = 'none';
      this.lastInspectorKey = '';
      return;
    }
    const key = JSON.stringify([b.id, b.status, b.workers, b.residents, b.build.toFixed(2), b.paused, b.level, b.lastOutput, b.growth.toFixed(2), s.tier, canUpgrade(s, b)]);
    if (key === this.lastInspectorKey) return;
    this.lastInspectorKey = key;
    box.style.display = 'block';
    const d = BUILDINGS[b.type];
    const rows: string[] = [];
    if (b.build < 1) {
      rows.push(`<div class="kv"><span>Construction</span><span>${Math.floor(b.build * 100)}%</span></div><div class="progress"><i style="width:${b.build * 100}%"></i></div>`);
    } else {
      if (d.workers) {
        const pips = Array.from({ length: d.workers }, (_, i) => `<i class="${i < b.workers ? 'on' : ''}"></i>`).join('');
        rows.push(`<div class="kv"><span>Workers</span><span class="pips">${pips}</span></div>`);
      }
      const cap = housingOf(b);
      if (cap) rows.push(`<div class="kv"><span>Residents</span><span>${b.residents} / ${cap}</span></div>`);
      if (b.type === 'farm') rows.push(`<div class="kv"><span>Crop growth</span><span>${Math.round(b.growth * 100)}%</span></div><div class="progress"><i style="width:${b.growth * 100}%"></i></div>`);
      if (Object.keys(d.outputs).length || b.type === 'farm' || b.type === 'forester') {
        rows.push(`<div class="kv"><span>${b.type === 'forester' ? 'Trees planted' : 'Produced'} last month</span><span>${b.lastOutput}</span></div>`);
      }
      if (Object.keys(d.inputs).length) rows.push(`<div class="kv"><span>Consumes</span><span class="costline">${costHtml(d.inputs)}</span></div>`);
      if (Object.keys(d.outputs).length) rows.push(`<div class="kv"><span>Produces</span><span class="costline">${costHtml(d.outputs)}</span></div>`);
    }
    const warn = hasProblem(b) || /Waiting|rotted|untended/.test(b.status);
    const actions: string[] = [];
    if (b.build >= 1 && d.workers > 0) {
      actions.push(`<button data-action="pause-b">${b.paused ? '▶ Resume' : '❚❚ Pause'}</button>`);
    }
    if (b.type === 'house' && b.level < 2) {
      const err = canUpgrade(s, b);
      actions.push(
        `<button data-action="upgrade" ${err ? 'disabled' : ''} data-tip="${esc(`<b>Upgrade to a two-storey house</b><br>Houses 8 villagers and pays more taxes.<br>${err ? `<span class='neg'>${err}</span>` : ''}<div class='costline'>${costHtml(HOUSE_UPGRADE_COST, s.res)}</div>`)}">⬆ Upgrade</button>`,
      );
    }
    if (b.type !== 'townhall') actions.push(`<button data-action="demolish-b">✖ ${b.build < 1 ? 'Cancel' : 'Demolish'}</button>`);
    if (b.type === 'market' && b.build >= 1) actions.push('<button data-action="trade">⚖ Trade</button>');
    box.innerHTML = `
      <button class="close" data-action="deselect">✕</button>
      <h2>${b.type === 'house' && b.level >= 2 ? 'Timber Townhouse' : d.name}</h2>
      <div class="desc">${d.desc}</div>
      ${rows.join('')}
      <div class="status ${warn ? 'warn' : ''}">${esc(b.status || 'Idle')}</div>
      <div class="actions">${actions.join('')}</div>`;
  }

  private updateLog(): void {
    const s = this.game.state;
    const msgs = s.messages;
    if (this.game.demo) {
      this.shownMessages = msgs.length;
      return;
    }
    if (msgs.length < this.shownMessages) this.shownMessages = msgs.length;
    let played = false;
    for (let i = this.shownMessages; i < msgs.length; i++) {
      const m = msgs[i];
      // Routine news goes to the chronicle only.
      if (m.kind === 'info') continue;
      const div = document.createElement('div');
      div.className = `msg panel ${m.kind}${m.at ? ' link' : ''}`;
      div.innerHTML = `${m.kind === 'advice' ? '<b>Steward:</b> ' : ''}${esc(m.text.replace(/^Steward: /, ''))}`;
      if (m.at) {
        const at = m.at;
        div.title = 'Show me';
        div.addEventListener('click', () => {
          this.game.renderer.centerOn(at.x, at.y);
          this.game.renderer.clampCamera(this.game.state);
        });
      }
      this.el.log.appendChild(div);
      setTimeout(() => div.classList.add('old'), 7000);
      setTimeout(() => div.remove(), 8000);
      if (!played) {
        this.sound(m.kind === 'bad' ? 'bad' : 'good');
        played = true;
      }
    }
    this.shownMessages = msgs.length;
    while (this.el.log.children.length > 3) this.el.log.firstElementChild?.remove();
  }

  private celebrate(tier: number): void {
    const t = TIERS[tier];
    const unlocked = BUILD_ORDER.filter((b) => BUILDINGS[b].tier === tier);
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

  /** A large, quiet title when a new season begins. */
  private updateSeason(): void {
    const s = this.game.state;
    const season = seasonOf(s.day);
    if (season === this.lastSeason) return;
    this.lastSeason = season;
    if (this.game.demo) return;
    const el = this.el['season-banner'];
    el.innerHTML = `<div>${SEASON_NAMES[season]}</div><small>Year ${yearOf(s.day)}${season === 3 ? ' · keep timber for firewood' : season === 0 ? ' · time to sow the fields' : season === 2 ? ' · harvest is near' : ''}</small>`;
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
    this.openModal(`<h2>Chronicle</h2><div class="chronicle">${rows || '<i>Nothing has happened yet.</i>'}</div>
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

  flash(text: string): void {
    this.flashUntil = 0;
    this.setHint(text, true);
    this.flashUntil = performance.now() + 2200;
    this.sound('bad');
  }

  private updateHint(): void {
    if (performance.now() < this.flashUntil) return;
    if (this.game.tool.kind === 'select') this.setHint('', false);
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
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.min(window.innerWidth - w - 6, x + 14)}px`;
    tip.style.top = `${y + h + 20 > window.innerHeight ? y - h - 10 : y + 18}px`;
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
      this.flash(`${BUILDINGS[t].name} unlocks when you become a ${TIERS[BUILDINGS[t].tier].name}.`);
      return;
    }
    this.category = BUILDINGS[t].category;
    if (g.tool.kind === 'build' && g.tool.type === t) g.setTool({ kind: 'select' });
    else g.setTool({ kind: 'build', type: t });
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
      case 'road':
        this.category = null;
        g.setTool(g.tool.kind === 'road' ? { kind: 'select' } : { kind: 'road' });
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
      case 'toggle-town':
        this.townOpen = !this.townOpen;
        this.update();
        break;
      case 'chronicle':
        this.showChronicle();
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
      case 'upgrade': {
        const b = this.selectedBuilding();
        if (b && upgradeHouse(s, b)) this.sound('place');
        this.update();
        break;
      }
      case 'demolish-b': {
        const b = this.selectedBuilding();
        if (b && demolish(s, b)) {
          log(s, `${BUILDINGS[b.type].name} demolished.`, 'info');
          this.sound('demolish');
          g.select(null);
        }
        break;
      }
      case 'trade':
        this.showTrade();
        break;
      case 'ledger':
        this.showLedger();
        break;
      case 'trade-do': {
        const err = trade(s, t.dataset.res as ResourceId, Number(t.dataset.n));
        if (err) this.flash(err);
        else this.sound('coin');
        this.showTrade();
        break;
      }
      case 'export-toggle': {
        const r = t.dataset.res as ResourceId;
        setExport(s, r, s.exports?.[r] === undefined ? 50 : null);
        this.showTrade();
        break;
      }
      case 'export-keep': {
        const r = t.dataset.res as ResourceId;
        setExport(s, r, Math.max(0, (s.exports?.[r] ?? 0) + Number(t.dataset.d)));
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
      <div class="sub">Raise a humble hamlet into a thriving medieval borough</div>
      <div class="ornament">❦ ❦ ❦</div>
      <div class="menu">
        ${latest ? `<button class="primary" data-m="continue">Continue <small>(${esc(latest.summary)})</small></button>` : ''}
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
      <p>Every map is generated from a seed. Share a seed to play the same land.</p>
      <div class="row"><label>Seed</label><input id="seed" value="${seed}" inputmode="numeric"><button data-m="dice">🎲</button></div>
      <div class="modes">
        <label class="mode"><input type="radio" name="mode" value="normal" checked><span><b>Normal</b><br><small>Hungry or unhappy villagers will leave.</small></span></label>
        <label class="mode"><input type="radio" name="mode" value="relaxed"><span><b>Relaxed</b><br><small>Double starting supplies; nobody ever leaves in anger.</small></span></label>
      </div>
      <div class="ornament">❦</div>
      <div class="row" style="justify-content:flex-end">
        <button data-m="back">Back</button>
        <button class="primary" data-m="go">Found the Settlement</button>
      </div>`,
      false,
    );
    const input = m.querySelector('#seed') as HTMLInputElement;
    m.querySelector('[data-m="dice"]')!.addEventListener('click', () => (input.value = String(Math.floor(Math.random() * 999999))));
    m.querySelector('[data-m="back"]')!.addEventListener('click', () => (fromMain ? this.showMainMenu() : this.showGameMenu()));
    m.querySelector('[data-m="go"]')!.addEventListener('click', () => {
      const v = input.value.trim();
      let n = Number(v);
      if (!Number.isFinite(n) || v === '') {
        n = 0;
        for (const ch of v) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
      }
      const relaxed = (m.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value === 'relaxed';
      this.game.newGame(Math.floor(Math.abs(n)) % 2147483647, relaxed);
      this.closeModal(true);
      this.game.setSpeed(1);
    });
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
      </div>`,
    );
    m.querySelector('[data-m="resume"]')!.addEventListener('click', () => this.closeModal());
    m.querySelector('[data-m="save"]')!.addEventListener('click', () => this.showSave());
    m.querySelector('[data-m="load"]')!.addEventListener('click', () => this.showLoad(false));
    m.querySelector('[data-m="new"]')!.addEventListener('click', () => this.showNewGame(false));
    m.querySelector('[data-m="help"]')!.addEventListener('click', () => this.showHelp(false));
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
      <div class="row"><input id="slot" value="my-village" maxlength="40"><button class="primary" data-m="save">Save</button></div>
      <p id="save-msg" style="min-height:1.2em"></p>
      <div class="row" style="justify-content:flex-end"><button data-m="back">Back</button></div>`,
    );
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
        (s, i) => `<div class="save"><div class="n">${esc(s.slot)}<br><small>${esc(s.summary)} · ${new Date(s.updated).toLocaleString()} · ${s.where}</small></div>
        <button class="primary" data-load="${i}">Load</button><button data-del="${i}" title="Delete">✖</button></div>`,
      )
      .join('');
    const m = this.openModal(
      `<h2>Load Game</h2>
      <div class="saves">${list || '<i>No saved games yet.</i>'}</div>
      <div class="row" style="justify-content:flex-end"><button data-m="back">Back</button></div>`,
      !fromMain,
    );
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
        <p><b>Grow your settlement</b> from a Hamlet into a Borough. Open the objectives pill (top left) for guidance.</p>
        <p><b>Building:</b> pick a category at the bottom, then a building, then click the map. Builders carry the materials over from storage, one load per trip, and then raise the walls. You can plan buildings before you have the materials; they wait.</p>
        <p><b>Roads</b> are optional but villagers walk much faster on them. Click to start a road, click again to lay it, and keep clicking to continue. Roads over water become bridges (4 timber per tile).</p>
        <p><b>Storage:</b> goods live in the Manor Hall, Storehouses (materials) and Granaries (food). Workplaces close to storage and to their resources work faster.</p>
        <p><b>Villagers</b> arrive when happiness is 50% or higher, there is free housing and nobody is going hungry. Each eats one food a month; several kinds of food make them happier.</p>
        <p><b>Winter</b> stops foraging and farming, and each household burns one timber a month. Farms are sown in spring and harvested in autumn.</p>
        <p><b>Wells, markets, churches and decorations</b> make nearby homes happier. Your <b>steward</b> warns you when food or firewood runs low; the <b>Chronicle</b> (scroll button) keeps the full story.</p>
        <div class="ornament">❦</div>
        <p><kbd>Left-drag</kbd> / <kbd>WASD</kbd> pan · <kbd>Wheel</kbd> zoom · <kbd>R</kbd> road (click, click) · <kbd>X</kbd> demolish · <kbd>H</kbd> house · <kbd>Space</kbd> pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed · <kbd>Right-click</kbd>/<kbd>Esc</kbd> cancel</p>
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
    const rows = (Object.keys(TRADE_PRICES) as ResourceId[])
      .map((r) => {
        const price = TRADE_PRICES[r]!;
        const sell = Math.floor(price * SELL_FACTOR * 10);
        const keep = s.exports?.[r];
        const on = keep !== undefined;
        return `<tr><td>${ICONS[r]} ${RESOURCE_INFO[r].name}</td><td class="num">${Math.floor(s.res[r])}</td>
          <td><button data-action="trade-do" data-res="${r}" data-n="10" ${s.res.gold < price * 10 || roomFor(s, r) < 10 ? 'disabled' : ''}>Buy 10 <small>${price * 10}g</small></button></td>
          <td><button data-action="trade-do" data-res="${r}" data-n="-10" ${s.res[r] < 10 ? 'disabled' : ''}>Sell 10 <small>+${sell}g</small></button></td>
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

  sound(kind: 'place' | 'road' | 'demolish' | 'good' | 'bad' | 'coin'): void {
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
    }
  }
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
