import { BUILDINGS, TIERS } from '../game/data';
import { lockReason } from '../game/sim';
import type { GameState } from '../game/types';
import { LEARN_TABS, UNLOCKS, UNLOCK_BY_ID, conditionMet, conditionProgress, knows, learnError, type LearnTab, type Unlock } from '../game/unlocks';
import { BUILDING_ICONS, ICONS } from './icons';

/**
 * The learning board: every unlock is an embroidered patch pinned to a wooden
 * board, the patches of one craft sewn close together, threads running from
 * a patch to what it opens. Nothing is hidden, only locked; choices are pairs
 * of patches joined by "or". A click shows a patch close up, with what it
 * waits for and the button to learn it.
 */

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** How a patch stands: learned, ready to learn now, waiting, or closed by a choice made the other way. */
export type PatchState = 'learned' | 'ready' | 'locked' | 'closed';

export function patchState(s: GameState, u: Unlock): PatchState {
  if (knows(s, u.id)) return 'learned';
  const err = learnError(s, u.id);
  if (!err) return 'ready';
  if (err === 'Another way was chosen') return 'closed';
  return 'locked';
}

/** Patches ready to learn, on a tab or the whole board. */
export function readyCount(s: GameState, tab?: LearnTab): number {
  return UNLOCKS.filter((u) => (!tab || u.tab === tab) && patchState(s, u) === 'ready').length;
}

const KIND_NAMES: Record<string, string> = {
  building: 'Building',
  recipe: 'Recipe',
  crop: 'Crop',
  animal: 'Animal',
  upgrade: 'Upgrade',
  extension: 'Extension',
  variant: 'Way of working',
  choice: 'Choice',
  option: 'Town option',
};

function iconOf(u: Unlock): string {
  return (ICONS as Record<string, string>)[u.icon] ?? BUILDING_ICONS[u.icon] ?? (u.building ? BUILDING_ICONS[u.building] : undefined) ?? ICONS.knowledge;
}

/** A small stable number from a string, for each patch's tilt and jitter. */
function hash(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const PATCH = 96;
const STEP_X = 112;
const STEP_Y = 118;

interface Placed {
  u: Unlock;
  x: number;
  y: number;
}

/** Lays out a tab: each group a cluster of patches on a loose hex grid, the clusters in rows. */
function layout(tab: LearnTab): { placed: Placed[]; labels: { name: string; x: number; y: number }[]; w: number; h: number } {
  const groups: string[] = [];
  for (const u of UNLOCKS) if (u.tab === tab && !groups.includes(u.group)) groups.push(u.group);
  const placed: Placed[] = [];
  const labels: { name: string; x: number; y: number }[] = [];
  const maxW = 1020;
  let cx = 24;
  let cy = 18;
  let rowH = 0;
  for (const g of groups) {
    const list = UNLOCKS.filter((u) => u.tab === tab && u.group === g);
    const cols = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(list.length * 1.3))));
    const rows = Math.ceil(list.length / cols);
    const w = cols * STEP_X + STEP_X / 2;
    const h = rows * STEP_Y + 36;
    if (cx + w > maxW && cx > 24) {
      cx = 24;
      cy += rowH + 22;
      rowH = 0;
    }
    labels.push({ name: g, x: cx + 6, y: cy });
    list.forEach((u, k) => {
      const r = Math.floor(k / cols);
      const c = k % cols;
      const j1 = hash(u.id) - 0.5;
      const j2 = hash(`${u.id}y`) - 0.5;
      placed.push({ u, x: cx + c * STEP_X + (r % 2 ? STEP_X / 2 : 0) + j1 * 14, y: cy + 34 + r * STEP_Y + j2 * 12 });
    });
    cx += w + 28;
    rowH = Math.max(rowH, h);
  }
  return { placed, labels, w: maxW + 40, h: cy + rowH + 30 };
}

/** The whole board: tabs, the patches of the open tab, and the close-up of the chosen patch. */
export function boardHtml(s: GameState, tab: LearnTab, sel: string | null, confirm: string | null): string {
  const tabs = LEARN_TABS.map((t) => {
    const n = readyCount(s, t.id);
    return `<button class="lb-tab ${t.id === tab ? 'active' : ''}" data-action="learn-tab" data-tab="${t.id}">${esc(t.name)}${n ? `<span class="lb-badge">${n}</span>` : ''}</button>`;
  }).join('');
  const { placed, labels, w, h } = layout(tab);
  const at = new Map(placed.map((p) => [p.u.id, p]));
  // Threads from what a patch needs to the patch.
  const threads: string[] = [];
  for (const p of placed) {
    for (const n of p.u.needs ?? []) {
      const q = at.get(n);
      if (!q) continue;
      const x1 = q.x + PATCH / 2;
      const y1 = q.y + PATCH / 2;
      const x2 = p.x + PATCH / 2;
      const y2 = p.y + PATCH / 2;
      const d = Math.hypot(x2 - x1, y2 - y1) || 1;
      // Stop short of the patches, and sag a little like thread.
      const r = PATCH / 2 + 2;
      const ax = x1 + ((x2 - x1) * r) / d;
      const ay = y1 + ((y2 - y1) * r) / d;
      const bx = x2 - ((x2 - x1) * (r + 4)) / d;
      const by = y2 - ((y2 - y1) * (r + 4)) / d;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 + Math.min(18, d / 8);
      const lit = knows(s, n) ? 'lit' : '';
      threads.push(`<path class="lb-thread ${lit}" d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}" marker-end="url(#lb-arrow)"/>`);
    }
  }
  // "or" between the patches of a choice.
  const ors: string[] = [];
  const seen = new Set<string>();
  for (const p of placed) {
    if (!p.u.choice || seen.has(p.u.choice)) continue;
    seen.add(p.u.choice);
    const pair = placed.filter((q) => q.u.choice === p.u.choice);
    for (let k = 1; k < pair.length; k++) {
      const a = pair[k - 1];
      const b = pair[k];
      ors.push(`<div class="lb-or" style="left:${(a.x + b.x) / 2 + PATCH / 2 - 15}px;top:${(a.y + b.y) / 2 + PATCH / 2 - 11}px">or</div>`);
    }
  }
  const patches = placed
    .map(({ u, x, y }) => {
      const st = patchState(s, u);
      const tilt = (hash(`${u.id}r`) - 0.5) * 14;
      const price = u.knowledge !== undefined ? `<span class="lb-price">${ICONS.knowledge}${u.knowledge}</span>` : u.rank !== undefined ? `<span class="lb-price rank">${TIERS[u.rank].name}</span>` : '';
      return `<button class="lb-patch ${st} ${sel === u.id ? 'sel' : ''} kind-${u.kind}" data-action="learn-sel" data-id="${u.id}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--tilt:${tilt.toFixed(1)}deg" aria-label="${esc(u.name)}">
        <span class="lb-disc">${iconOf(u)}</span>
        <span class="lb-name">${esc(u.name)}</span>${st === 'learned' ? '' : price}${st === 'locked' ? '<span class="lb-lock">🔒</span>' : ''}
      </button>`;
    })
    .join('');
  const board = `<div class="lb-board"><div class="lb-pins" style="width:${w}px;height:${h}px">
      <svg class="lb-threads" width="${w}" height="${h}"><defs><marker id="lb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="#e8d8b0"/></marker></defs>${threads.join('')}</svg>
      ${labels.map((l) => `<div class="lb-label" style="left:${l.x}px;top:${l.y}px">${esc(l.name)}</div>`).join('')}
      ${ors.join('')}${patches}</div></div>`;
  return `<div class="lb">
    <div class="lb-head"><div class="lb-title">${ICONS.knowledge} The learning board</div><div class="lb-have">${Math.floor(s.res.knowledge)} knowledge to spend</div><button class="plaque-btn small" data-action="close-modal">Close</button></div>
    <div class="lb-tabs">${tabs}</div>
    <div class="lb-body">${board}<div class="lb-detail">${detailHtml(s, sel, confirm)}</div></div>
  </div>`;
}

/** What a patch waits for, each with whether it is met. */
export function patchNeeds(s: GameState, u: Unlock): { label: string; met: boolean; progress?: number }[] {
  const out: { label: string; met: boolean; progress?: number }[] = [];
  if (u.rank !== undefined && u.knowledge === undefined) out.push({ label: `The settlement is a ${TIERS[u.rank].name}`, met: s.tier >= u.rank });
  for (const n of u.needs ?? []) out.push({ label: `${UNLOCK_BY_ID.get(n)?.name ?? n} learned`, met: knows(s, n) });
  if (u.condition) out.push({ label: u.condition.label, met: conditionMet(s, u.condition), progress: conditionProgress(s, u.condition) });
  if (u.knowledge !== undefined) out.push({ label: `${u.knowledge} knowledge`, met: s.res.knowledge >= u.knowledge });
  return out;
}

function detailHtml(s: GameState, sel: string | null, confirm: string | null): string {
  const u = sel ? UNLOCK_BY_ID.get(sel) : undefined;
  if (!u) {
    return `<div class="lb-hint"><p>Each patch is something your people can learn: a building, a recipe, a better way of working.</p>
      <p><b>Gold-stitched</b> patches are learned. Patches that <b>glow</b> can be learned now with knowledge. The rest show what they wait for.</p>
      <p>Threads run from a patch to what it opens. Patches joined by <b>or</b> are choices: take one and the other is closed for good.</p>
      <p class="muted">Click a patch to look at it closely.</p></div>`;
  }
  const st = patchState(s, u);
  const needs = patchNeeds(s, u);
  const rivals = u.choice ? UNLOCKS.filter((o) => o.choice === u.choice && o.id !== u.id) : [];
  // A building may also wait for the manor or a charter once it is learned.
  const extra = u.building && st === 'learned' ? lockReason(s, u.building) : null;
  const err = learnError(s, u.id);
  let action = '';
  if (st === 'learned') action = '<div class="lb-done">✓ Learned</div>';
  else if (st === 'closed') action = `<div class="lb-closed">Closed: ${esc(rivals.find((o) => knows(s, o.id))?.name ?? 'another way')} was chosen</div>`;
  else if (st === 'ready') {
    const sure = confirm === u.id;
    action =
      u.choice && !sure
        ? `<p class="lb-warn">A choice for good: learning it closes ${esc(rivals.map((o) => o.name).join(' and '))}.</p><button class="plaque-btn" data-action="learn-confirm" data-id="${u.id}">Choose ${esc(u.name)}…</button>`
        : `<button class="plaque-btn primary" data-action="learn-do" data-id="${u.id}">${sure ? 'Yes, choose it for good' : 'Learn it'} · ${ICONS.knowledge}${u.knowledge ?? 0}</button>`;
  } else action = `<div class="lb-wait">${esc(err ?? '')}</div>`;
  return `<div class="lb-card ${st}">
    <div class="lb-card-top"><span class="lb-disc big">${iconOf(u)}</span><div><div class="lb-card-name">${esc(u.name)}</div><div class="lb-kind">${KIND_NAMES[u.kind] ?? u.kind} · ${esc(u.group)}</div></div></div>
    <p>${esc(u.desc)}</p>
    ${u.building ? `<p class="muted">${esc(BUILDINGS[u.building].desc)}</p>` : ''}
    ${
      needs.length && st !== 'learned'
        ? `<div class="lb-needs">${needs
            .map(
              (n) =>
                `<div class="${n.met ? 'met' : 'unmet'}">${n.met ? '✓' : '✗'} ${esc(n.label)}${n.progress !== undefined && !n.met ? `<div class="progress"><i style="width:${Math.round(n.progress * 100)}%"></i></div>` : ''}</div>`,
            )
            .join('')}</div>`
        : ''
    }
    ${extra ? `<p class="neg">${esc(extra)}</p>` : ''}
    ${action}
  </div>`;
}

/** The tab a patch is on (to open the board at it). */
export function tabOf(id: string): LearnTab | null {
  return UNLOCK_BY_ID.get(id)?.tab ?? null;
}
