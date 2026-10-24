// node scripts/texts.mjs [out.json]: every phrase of six words or more the game
// shows (descriptions, tooltips, tutorial, warnings, events, chronicle), with
// the file, line and the building, event or screen it belongs to.
import ts from 'typescript';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const repo = '.';
const out = process.argv[2] ?? 'game-texts.json';
const AREAS = {
  'src/ui/tutorial.ts': 'Tutorial (Fingamoblineus)',
  'src/ui/fingahelp.ts': 'Fingamoblineus help',
  'src/game/advisor.ts': 'Steward warnings and tips',
  'src/game/events.ts': 'Events (decision windows)',
  'src/game/data.ts': 'Buildings, goods and ranks',
  'src/game/charters.ts': 'Charters',
  'src/game/learning.ts': 'Learning',
  'src/ui/learning.ts': 'Learning',
  'src/game/improve.ts': 'Improvements',
  'src/game/options.ts': 'Town options',
  'src/game/unlocks.ts': 'Unlocks and requirements',
  'src/game/levels.ts': 'Building and home levels',
  'src/game/quests.ts': 'Goals',
  'src/game/sim.ts': 'Chronicle, statuses and messages from the town',
  'src/game/world.ts': 'Lands',
  'src/game/save.ts': 'Saving and loading',
  'src/ui/hud.ts': 'Interface: windows, panels and tooltips',
  'src/main.ts': 'Interface: map messages',
  'src/ui/folk.ts': 'Villagers',
  'src/ui/news.ts': "What's new",
  'src/ui/tapestry.ts': 'Charters',
  'src/ui/credits.ts': 'Credits',
};
const files = [];
for (const dir of ['src', 'src/game', 'src/ui']) for (const f of readdirSync(join(repo, dir))) if (f.endsWith('.ts')) files.push(join(dir, f));
const skip = new Set(['src/game/autoplay.ts', 'src/game/rng.ts', 'src/game/path.ts', 'src/game/types.ts', 'src/game/names.ts', 'src/game/undo.ts', 'src/api.ts', 'src/ui/icons.ts', 'src/ui/soundscape.ts', 'src/ui/minimap.ts', 'src/ui/wood.ts']);
const items = [];
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const words = (s) => (s.match(/[A-Za-zÀ-ÿ']{2,}/g) ?? []).length;
const looksCode = (s) => /^[\w-]+(\s[\w-]+)*$/.test(s) && !/\s/.test(s.trim()) || /^(\.|#|@media|rgba?\(|M\d|<svg|https?:)/.test(s.trim()) || /[{};]\s*$/.test(s.trim()) && /:\s*[\w#-]+;/.test(s);
/** The name or title of the nearest object that has one: the event, building or charter a line belongs to. */
function owner(node, sf) {
  for (let n = node.parent; n; n = n.parent) {
    if (!ts.isObjectLiteralExpression(n)) continue;
    for (const key of ['title', 'name', 'id']) {
      const p = n.properties.find((q) => ts.isPropertyAssignment(q) && q.name.getText(sf).replace(/['"]/g, '') === key && ts.isStringLiteralLike(q.initializer));
      if (p && p.initializer !== node) return p.initializer.text;
    }
  }
  return '';
}
function context(node, sf) {
  const parts = [];
  let fn = '';
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isPropertyAssignment(n) && n.name) parts.unshift(n.name.getText(sf).replace(/['"]/g, ''));
    else if ((ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name && !fn) fn = n.name.getText(sf);
    else if (ts.isVariableDeclaration(n) && n.name && !parts.length && !fn) parts.unshift(n.name.getText(sf));
    else if (ts.isCallExpression(n) && !parts.length) {
      const callee = n.expression.getText(sf);
      if (/\blog$/.test(callee)) parts.unshift('chronicle message');
      else if (/flash$/.test(callee)) parts.unshift('pop-up message');
      else if (/(say|speak|line)$/i.test(callee)) parts.unshift('spoken');
    }
  }
  const who = owner(node, sf);
  const label = parts.filter((p) => !['choices', 'apply', 'text'].includes(p)).slice(-2).join(' › ');
  return [who, fn && !who ? fn : '', label].filter(Boolean).join(' › ');
}
function textOf(node, sf) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => '…' + s.literal.text).join('');
  return null;
}
for (const rel of files) {
  if (skip.has(rel)) continue;
  const src = readFileSync(join(repo, rel), 'utf8');
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    let raw = textOf(node, sf);
    // Only the outermost template: inner ones are handled as their own nodes.
    if (raw !== null && !(ts.isTemplateExpression(node.parent?.parent ?? {}) && false)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const ctx = context(node, sf);
      const found = [];
      // Tooltips inside markup.
      raw = raw.replace(/data-tip="([^"]*)"/g, (_, t) => {
        found.push({ kind: 'tooltip', text: t });
        return '';
      });
      raw = raw.replace(/\btitle="([^"]*)"/g, (_, t) => {
        found.push({ kind: 'tooltip', text: t });
        return '';
      });
      const isHtml = /<\/?[a-z][^>]*>/i.test(raw);
      const visible = raw.replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, isHtml ? ' ' : '');
      for (const piece of isHtml ? visible.split(/\s{2,}|\n/) : [visible]) found.push({ kind: 'text', text: piece });
      for (const f of found) {
        const t = decode(f.text.replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        if (words(t) < 6 || looksCode(t)) continue;
        if (/^[\s…/·,.()-]*$/.test(t)) continue;
        items.push({ area: AREAS[rel] ?? rel, file: rel, line, ctx, kind: f.kind, text: t });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
// Drop exact repeats in the same file.
const seen = new Set();
const uniq = items.filter((i) => {
  const k = i.file + '|' + i.text;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
writeFileSync(out, JSON.stringify(uniq, null, 1));
const by = {};
for (const i of uniq) by[i.area] = (by[i.area] ?? 0) + 1;
console.log(uniq.length, by);
