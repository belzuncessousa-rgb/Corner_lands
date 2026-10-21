import { BUILDINGS, TIERS } from '../game/data';
import { lockReason } from '../game/sim';
import type { GameState } from '../game/types';
import { LEARN_TABS, UNLOCKS, UNLOCK_BY_ID, conditionMet, conditionProgress, knows, learnError, type LearnTab, type Unlock } from '../game/unlocks';
import { fingaButton } from './fingahelp';
import { BUILDING_ICONS, ICONS } from './icons';

/**
 * The learning board: every unlock is an embroidered patch sewn onto the
 * board, linked patches close together, threads running from a patch to what
 * it opens. Nothing is hidden, only locked; choices are pairs
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
const PATCH_H = 108;
/** The board's size: the layout spreads the patches over all of it. */
const BOARD_W = 980;
const BOARD_H = 690;
const MARGIN = 22;

interface Placed {
  u: Unlock;
  x: number;
  y: number;
}

/** A link between two patches: what it needs (an arrow), what comes with it, or the other side of a choice. */
interface Link {
  a: number;
  b: number;
  kind: 'needs' | 'with' | 'or';
}

function linksOf(list: Unlock[]): Link[] {
  const at = new Map(list.map((u, i) => [u.id, i]));
  const out: Link[] = [];
  list.forEach((u, i) => {
    for (const n of u.needs ?? []) if (at.has(n)) out.push({ a: at.get(n)!, b: i, kind: 'needs' });
    for (const g of u.grants ?? []) if (at.has(g)) out.push({ a: i, b: at.get(g)!, kind: 'with' });
  });
  const seen = new Set<string>();
  list.forEach((u) => {
    if (!u.choice || seen.has(u.choice)) return;
    seen.add(u.choice);
    const pair = list.map((o, j) => [o, j] as const).filter(([o]) => o.choice === u.choice);
    for (let k = 1; k < pair.length; k++) out.push({ a: pair[k - 1][1], b: pair[k][1], kind: 'or' });
  });
  return out;
}

/** A small seeded random source, so a tab is laid out the same every time. */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether two segments cross (not counting shared ends). */
function crosses(p: number[], q: number[], r: number[], t: number[]): boolean {
  const o = (a: number[], b: number[], c: number[]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p, q, r) * o(p, q, t) < 0 && o(r, t, p) * o(r, t, q) < 0;
}

/** How far a point lies from a segment. */
function segDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Scatters a tab's patches over the whole board: linked patches pull close
 * (a choice or what comes with a patch closest), a patch sits to the right of
 * what it needs, and every patch pushes the others away so the board fills.
 * Several seeded tries are made and the tidiest kept: fewest threads crossing,
 * and none running under a patch it does not join.
 */
function scatter(list: Unlock[], links: Link[]): number[][] {
  const n = list.length;
  const W = BOARD_W - 2 * MARGIN - PATCH;
  const H = BOARD_H - 2 * MARGIN - PATCH_H;
  // How deep each patch is in its chain of needs, to start it left or right.
  const depth = list.map(() => 0);
  for (let pass = 0; pass < n; pass++) for (const l of links) if (l.kind === 'needs') depth[l.b] = Math.max(depth[l.b], depth[l.a] + 1);
  const maxDepth = Math.max(1, ...depth);
  let best: number[][] = [];
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    const rand = seeded(hash(list[0]?.tab ?? '') * 1e9 + attempt * 7919);
    const pos = list.map((_, i) => [(depth[i] / (maxDepth + 1)) * W * 0.7 + rand() * W * 0.35, rand() * H]);
    // Each patch keeps its own distance from the edges, so those pushed out there do not line up.
    const inset = list.map(() => [rand() * 70, rand() * 70, rand() * 60, rand() * 60]);
    for (let it = 0; it < 500; it++) {
      const cool = 1 - it / 500;
      const f = pos.map(() => [0, 0]);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pos[j][0] - pos[i][0];
          let dy = (pos[j][1] - pos[i][1]) * 1.15;
          let d = Math.hypot(dx, dy);
          if (d < 1) {
            dx = rand() - 0.5;
            dy = rand() - 0.5;
            d = 1;
          }
          // Everyone keeps their distance; near neighbours push hard.
          const push = 60000 / (d * d) + (d < 128 ? (128 - d) * 0.35 : 0);
          f[i][0] -= (dx / d) * push;
          f[i][1] -= (dy / d) * push;
          f[j][0] += (dx / d) * push;
          f[j][1] += (dy / d) * push;
        }
      }
      for (const l of links) {
        const want = l.kind === 'needs' ? 140 : 118;
        const dx = pos[l.b][0] - pos[l.a][0];
        const dy = pos[l.b][1] - pos[l.a][1];
        const d = Math.hypot(dx, dy) || 1;
        const pull = (d - want) * (l.kind === 'needs' ? 0.06 : 0.12);
        f[l.a][0] += (dx / d) * pull;
        f[l.a][1] += (dy / d) * pull;
        f[l.b][0] -= (dx / d) * pull;
        f[l.b][1] -= (dy / d) * pull;
        // A choice's sides, and what comes with a patch, sit side by side.
        if (l.kind !== 'needs') {
          f[l.a][1] += dy * 0.1;
          f[l.b][1] -= dy * 0.1;
        }
        // What a patch needs sits to its left.
        if (l.kind === 'needs' && dx < 70) {
          f[l.a][0] -= (70 - dx) * 0.05;
          f[l.b][0] += (70 - dx) * 0.05;
        }
      }
      // A gentle pull to the middle, so lone patches leave the edges.
      for (let i = 0; i < n; i++) {
        f[i][0] += (W / 2 - pos[i][0]) * 0.006;
        f[i][1] += (H / 2 - pos[i][1]) * 0.009;
      }
      const step = 6 + 30 * cool;
      for (let i = 0; i < n; i++) {
        const m = Math.hypot(f[i][0], f[i][1]);
        const k = m > step ? step / m : 1;
        pos[i][0] = Math.max(inset[i][0], Math.min(W - inset[i][1], pos[i][0] + f[i][0] * k + (rand() - 0.5) * 2 * cool));
        pos[i][1] = Math.max(inset[i][2], Math.min(H - inset[i][3], pos[i][1] + f[i][1] * k + (rand() - 0.5) * 2 * cool));
      }
    }
    // Score it: crossings, threads under patches, patches too close, links too long.
    const c = pos.map(([x, y]) => [x + PATCH / 2, y + 40]);
    let score = 0;
    for (let i = 0; i < links.length; i++) {
      const li = links[i];
      for (let j = i + 1; j < links.length; j++) {
        const lj = links[j];
        if (li.a === lj.a || li.a === lj.b || li.b === lj.a || li.b === lj.b) continue;
        if (crosses(c[li.a], c[li.b], c[lj.a], c[lj.b])) score += 10;
      }
      for (let k = 0; k < n; k++) {
        if (k === li.a || k === li.b) continue;
        // The disc, and the ribbon with the name under it.
        if (segDist(c[k], c[li.a], c[li.b]) < 60) score += 40;
        if (segDist([c[k][0] - 30, c[k][1] + 40], c[li.a], c[li.b]) < 14 || segDist([c[k][0] + 30, c[k][1] + 40], c[li.a], c[li.b]) < 14) score += 25;
      }
      score += Math.max(0, Math.hypot(c[li.b][0] - c[li.a][0], c[li.b][1] - c[li.a][1]) - 190) / 20;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(c[i][0] - c[j][0], (c[i][1] - c[j][1]) * 1.1) < 116) score += 6;
    if (score < bestScore) {
      bestScore = score;
      best = pos.map((p) => [p[0] + MARGIN, p[1] + MARGIN]);
    }
  }
  return best;
}

const layouts = new Map<LearnTab, { placed: Placed[]; links: Link[] }>();

/** Lays out a tab once: its patches scattered over the board, linked ones close. */
function layout(tab: LearnTab): { placed: Placed[]; links: Link[]; w: number; h: number } {
  let l = layouts.get(tab);
  if (!l) {
    const list = UNLOCKS.filter((u) => u.tab === tab);
    const links = linksOf(list);
    const pos = scatter(list, links);
    l = { placed: list.map((u, i) => ({ u, x: pos[i][0], y: pos[i][1] })), links };
    layouts.set(tab, l);
  }
  return { ...l, w: BOARD_W, h: BOARD_H };
}

/** The whole board: tabs, the patches of the open tab, and the close-up of the chosen patch. */
export function boardHtml(s: GameState, tab: LearnTab, sel: string | null, confirm: string | null): string {
  const tabs = LEARN_TABS.map((t) => {
    const n = readyCount(s, t.id);
    return `<button class="lb-tab ${t.id === tab ? 'active' : ''}" data-action="learn-tab" data-tab="${t.id}">${esc(t.name)}${n ? `<span class="lb-badge">${n}</span>` : ''}</button>`;
  }).join('');
  const { placed, links, w, h } = layout(tab);
  // Threads between linked patches: an arrow from what a patch needs to it,
  // a plain stitch to what comes with it, and "or" between a choice's sides.
  const threads: string[] = [];
  const ors: string[] = [];
  for (const l of links) {
    const p = placed[l.a];
    const q = placed[l.b];
    const x1 = p.x + PATCH / 2;
    const y1 = p.y + 40;
    const x2 = q.x + PATCH / 2;
    const y2 = q.y + 40;
    if (l.kind === 'or') {
      ors.push(`<div class="lb-or" style="left:${((x1 + x2) / 2 - 15).toFixed(0)}px;top:${((y1 + y2) / 2 - 11).toFixed(0)}px">or</div>`);
      continue;
    }
    const d = Math.hypot(x2 - x1, y2 - y1) || 1;
    // Stop short of the discs, so the arrowhead shows.
    const r = 46;
    const ax = x1 + ((x2 - x1) * r) / d;
    const ay = y1 + ((y2 - y1) * r) / d;
    const bx = x2 - ((x2 - x1) * (r + 6)) / d;
    const by = y2 - ((y2 - y1) * (r + 6)) / d;
    const lit = knows(s, p.u.id) ? 'lit' : '';
    threads.push(
      `<path class="lb-thread ${l.kind} ${lit}" d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}"${l.kind === 'needs' ? ' marker-end="url(#lb-arrow)"' : ''}/>`,
    );
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
      <svg class="lb-threads" width="${w}" height="${h}"><defs><marker id="lb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="#7a5530"/></marker></defs>${threads.join('')}</svg>
      ${ors.join('')}${patches}</div></div>`;
  return `<div class="lb">
    <div class="lb-head"><div class="lb-title">${ICONS.knowledge} The learning board</div><div class="lb-have">${Math.floor(s.res.knowledge)} knowledge to spend</div>${fingaButton('learning')}<button class="plaque-btn small" data-action="close-modal">Close</button></div>
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
      <p>Arrows run from a patch to what it opens; a solid stitch joins what is learned together. Patches joined by <b>or</b> are choices: take one and the other is closed for good.</p>
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
    <div class="lb-card-top"><span class="lb-disc big">${iconOf(u)}</span><div><div class="lb-card-name">${esc(u.name)}</div><div class="lb-kind">${KIND_NAMES[u.kind] ?? u.kind}</div></div></div>
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
