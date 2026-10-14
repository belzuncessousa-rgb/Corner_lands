// Drives the real UI like a player: build menu, drawing a field, the
// inspector's crop, worker and product controls, stock targets and paving.
// Expects the game at http://localhost:3001 (npm start).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', '4242');
await page.click('text=Found the Settlement');
await page.waitForTimeout(600);
await page.evaluate(() => { const g = window.game; g.setSpeed(0); g.state.tier = 1; g.state.res.wood = 300; g.state.res.planks = 60; g.state.res.stone = 60; g.state.res.gold = 500; g.hud.update(); });
const tileXY = (x, y) => page.evaluate(([x, y]) => window.game.renderer.tileToScreen(x + 0.5, y + 0.5), [x, y]);
/** Clicks so that a size x size building lands with its corner on (x, y). */
const placeAt = async (x, y, size) => { const [sx, sy] = await page.evaluate(([x, y, n]) => window.game.renderer.tileToScreen(x + n / 2, y + n / 2), [x, y, size]); await page.mouse.move(sx, sy); await page.mouse.click(sx, sy); await page.waitForTimeout(150); };
const clickTile = async (x, y) => { const [sx, sy] = await tileXY(x, y); await page.mouse.move(sx, sy); await page.mouse.click(sx, sy); await page.waitForTimeout(150); };
const hall = await page.evaluate(() => { const h = window.game.state.buildings.find((b) => b.type === 'townhall'); return { x: h.x, y: h.y }; });
const pick = async (cat, type) => {
  if (!(await page.$(`#buildbar [data-type="${type}"]`))) await page.click(`[data-cat="${cat}"]`);
  await page.click(`#buildbar [data-type="${type}"]`);
};
const results = [];
const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`);
// Farmstead from the menu (search a free spot near the hall).
await pick('farming', 'farm');
const spot = await page.evaluate(([hx, hy]) => (() => { for (let r = 4; r < 14; r++) for (const [dx, dy] of [[r, -r], [r, 0], [0, -r], [-r, 0], [0, r]]) if (!window.cl.placementError(window.game.state, 'farm', hx + dx, hy + dy)) return [hx + dx, hy + dy]; return null; })(), [hall.x, hall.y]);
await placeAt(spot[0], spot[1], 2);
const farm = await page.evaluate(() => window.game.state.buildings.find((b) => b.type === 'farm'));
check('place farmstead from menu', !!farm);
// Field: two corner clicks next to the farm.
await pick('farming', 'field');
const fz = await page.evaluate(([fx, fy]) => { const s = window.game.state; for (let r = 2; r < 10; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r - 3, 0], [0, -r - 3]]) { const x = fx + dx, y = fy + dy; let ok = true; for (let yy = y; yy < y + 4; yy++) for (let xx = x; xx < x + 4; xx++) { const i = yy * s.width + xx; if (s.occ[i] >= 0 || s.terrain[i] || s.road[i] || s.rock[i] || s.ore[i]) ok = false; } if (ok) return [x, y]; } return null; }, [farm.x, farm.y]);
await clickTile(fz[0], fz[1]);
await clickTile(fz[0] + 3, fz[1] + 3);
const field = await page.evaluate(() => { const f = window.game.state.buildings.find((b) => b.type === 'field'); return f && { w: f.w, h: f.h, owner: f.owner, sel: window.game.selected === f.id }; });
check('draw a 4x4 field with two clicks', field && field.w === 4 && field.h === 4, JSON.stringify(field));
// Once the farmstead stands, it tends the field.
const owner = await page.evaluate(() => { const s = window.game.state; const f = s.buildings.find((b) => b.type === 'farm'); f.build = 1; f.need = undefined; s.dirty = true; window.cl.recompute(s); return s.buildings.find((b) => b.type === 'field').owner === f.id; });
check('field is tended by the farmstead', owner);
if (field) {
  await page.click('#inspector [data-action="recipe"][data-r="barley"]');
  check('choose barley in the inspector', (await page.evaluate(() => window.game.state.buildings.find((b) => b.type === 'field').recipe)) === 'barley');
}
await page.keyboard.press('Escape');
// Woodcutter by hotkey, then its worker, priority and product controls.
await page.keyboard.press('e');
const ws = await page.evaluate(([hx, hy]) => { for (let r = 4; r < 16; r++) for (const [dx, dy] of [[-r, 0], [0, r], [-r, r], [r, r]]) if (!window.cl.placementError(window.game.state, 'woodcutter', hx + dx, hy + dy)) return [hx + dx, hy + dy]; return null; }, [hall.x, hall.y]);
await placeAt(ws[0], ws[1], 2);
const wcId = await page.evaluate(() => { const b = window.game.state.buildings.find((x) => x.type === 'woodcutter'); if (b) { b.build = 1; b.need = undefined; window.game.select(b.id); } return b?.id; });
check('place woodcutter with the E hotkey', !!wcId);
await page.waitForTimeout(400);
if (wcId) {
  await page.click('#inspector .pips i[data-n="1"]');
  await page.click('#inspector [data-action="prio"][data-p="2"]');
  await page.click('#inspector [data-action="recipe"][data-r="firewood"]');
  const wc = await page.evaluate(() => { const b = window.game.state.buildings.find((x) => x.type === 'woodcutter'); return { want: b.want, priority: b.priority, recipe: b.recipe }; });
  check('set workers, priority and product', wc.want === 1 && wc.priority === 2 && wc.recipe === 'firewood', JSON.stringify(wc));
}
await page.keyboard.press('Escape');
// Stock target from the top bar.
await page.click('[data-chip="materials"]');
await page.waitForTimeout(300);
await page.click('#chip-panel [data-action="keep"][data-res="wood"][data-d="10"]');
check('raise the timber stock target', (await page.evaluate(() => window.game.state.targets?.wood)) === 160);
await page.click('#chip-panel [data-action="chip-close"]');
// Paved road with T: two clicks.
await page.keyboard.press('t');
await clickTile(hall.x + 1, hall.y + 3);
await clickTile(hall.x + 4, hall.y + 3);
check('pave a road with T', (await page.evaluate(() => window.game.state.road.filter((v) => v === 2).length)) >= 3);
await page.keyboard.press('Escape');
// Animal farm and a pasture; switch to cattle.
await page.evaluate(() => { const s = window.game.state; s.tier = 2; s.res.prestige = 200; s.res.wood = 300; s.res.gold = 800; s.population = 30; });
await pick('farming', 'byre');
const bs = await page.evaluate(([hx, hy]) => { for (let r = 5; r < 16; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r]]) if (!window.cl.placementError(window.game.state, 'byre', hx + dx, hy + dy)) return [hx + dx, hy + dy]; return null; }, [hall.x, hall.y]);
await placeAt(bs[0], bs[1], 2);
const byreId = await page.evaluate(() => { const b = window.game.state.buildings.find((x) => x.type === 'byre'); if (b) { b.build = 1; b.need = undefined; window.game.state.dirty = true; } return b?.id; });
check('place an animal farm', !!byreId);
await page.keyboard.press('Escape');
await pick('farming', 'pasture');
const pz = await page.evaluate(([bx, by]) => { const s = window.game.state; for (let r = 1; r < 10; r++) for (const [dx, dy] of [[r + 1, 0], [0, r + 1], [-r - 5, 0], [0, -r - 5]]) { const x = bx + dx, y = by + dy; if (!window.cl.placementError(s, 'well', x, y)) { let ok = true; for (let yy = y; yy < y + 5; yy++) for (let xx = x; xx < x + 5; xx++) { const i = yy * s.width + xx; if (s.occ[i] >= 0 || s.terrain[i] || s.road[i] || s.rock[i] || s.ore[i]) ok = false; } if (ok) return [x, y]; } } return null; }, [bs[0], bs[1]]);
await clickTile(pz[0], pz[1]);
await clickTile(pz[0] + 4, pz[1] + 4);
const past = await page.evaluate(() => { const s = window.game.state; window.cl.recompute(s); const p = s.buildings.find((b) => b.type === 'pasture'); return p && p.owner; });
check('fence a pasture beside it', past === byreId);
await page.evaluate((id) => window.game.select(id), byreId);
await page.waitForTimeout(300);
await page.click('#inspector [data-action="recipe"][data-r="cattle"]');
await page.evaluate(() => { for (let i = 0; i < 3; i++) window.cl.stepDay(window.game.state); });
const herd = await page.evaluate(() => { const b = window.game.state.buildings.find((x) => x.type === 'byre'); return { kind: b.herdKind, herd: b.herd }; });
check('keep cattle', herd.kind === 'cattle' && herd.herd > 0, JSON.stringify(herd));
await page.keyboard.press('Escape');
// A house: backyard hens, then raise it and take up weaving at home.
const houseId = await page.evaluate(([hx, hy]) => { const s = window.game.state; for (let r = 4; r < 16; r++) for (const [dx, dy] of [[-r, -r], [r, r], [-r, r]]) { const b = window.cl.placeOrder(s, 'house', hx + dx, hy + dy); if (b) { b.build = 1; b.need = undefined; window.game.select(b.id); return b.id; } } return null; }, [hall.x, hall.y]);
await page.waitForTimeout(300);
await page.click('#inspector [data-action="yard"][data-y="hens"]');
check('keep hens in the backyard', (await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).yard, houseId)) === 'hens');
await page.evaluate((id) => { const b = window.game.state.buildings.find((x) => x.id === id); b.level = 2; window.game.hud.update(); }, houseId);
await page.waitForTimeout(300);
await page.click('#inspector [data-action="trade-home"][data-t="weaver"]');
check('take up weaving at home', (await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).trade, houseId)) === 'weaver');
await page.keyboard.press('Escape');
// Grant a charter through the charter screen.
await page.click('[data-action="charters"]');
await page.waitForTimeout(300);
await page.click('[data-action="charter-sel"][data-id="farm1"]');
await page.click('[data-action="charter-grant"]');
check('grant a charter', (await page.evaluate(() => window.game.state.charters?.includes('farm1'))) === true);
await page.click('[data-action="close-modal"]');
// The manor's store panel sells planks above the stock target.
const sale = await page.evaluate(() => {
  const s = window.game.state;
  const h = s.buildings.find((b) => b.type === 'townhall');
  let m = null;
  for (let r = 3; r < 20 && !m; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r]]) if (!m && !window.cl.placementError(s, 'market', h.x + dx, h.y + dy)) m = window.cl.placeOrder(s, 'market', h.x + dx, h.y + dy);
  m.build = 1;
  m.need = undefined;
  window.cl.recompute(s);
  s.res.planks = window.cl.keepOf(s, 'planks') + 40;
  window.game.select(s.buildings.find((b) => b.type === 'townhall').id);
  window.game.hud.update();
  return { planks: s.res.planks, gold: s.res.gold };
});
await page.waitForTimeout(300);
await page.screenshot({ path: process.env.SHOT || '/tmp/claude-0/store.png', clip: { x: 1440 - 420, y: 0, width: 420, height: 900 } });
await page.click('#inspector [data-action="store-sell"][data-res="planks"]');
const after = await page.evaluate(() => ({ planks: window.game.state.res.planks, gold: window.game.state.res.gold }));
check('sell surplus from the store panel', after.planks === sale.planks - 40 && after.gold > sale.gold, JSON.stringify([sale, after]));
// Call a harvest feast from the manor in autumn.
await page.evaluate(() => { const s = window.game.state; s.day = 6 * 10 + 1; s.res.bread = 200; window.game.hud.update(); });
await page.waitForTimeout(300);
await page.click('#inspector [data-action="feast"]');
check('call a harvest feast', (await page.evaluate(() => window.game.state.lastFeast)) === 0);
// Raise a retinue in a Borough.
await page.evaluate(() => { const s = window.game.state; s.tier = 3; s.res.prestige = 100; s.res.weapons = 12; window.game.hud.update(); });
await page.waitForTimeout(300);
await page.mouse.move(200, 600);
await page.waitForTimeout(200);
await page.screenshot({ path: process.env.SHOT2 || '/tmp/claude-0/manor.png', clip: { x: 1440 - 420, y: 0, width: 420, height: 900 } });
await page.click('#inspector [data-action="retinue"]');
check('raise a retinue', (await page.evaluate(() => window.game.state.retinue)) === true);
await page.evaluate(() => { window.game.state.tier = 1; });
await page.evaluate(() => window.game.select(null));
// Save through the menu, then load it back.
await page.keyboard.press('Escape');
await page.click('[data-m="save"]');
await page.fill('#slot', 'ui-test');
await page.click('.modal [data-m="save"]');
await page.waitForTimeout(600);
check('save the game', /Saved/.test(await page.textContent('#save-msg')));
await page.evaluate(() => { window.game.state.res.gold = 1; });
await page.click('[data-m="back"]');
await page.click('[data-m="load"]');
await page.waitForTimeout(500);
const loadBtn = await page.$$('.saves .save');
let idx = -1;
for (let i = 0; i < loadBtn.length; i++) if ((await loadBtn[i].textContent()).includes('ui-test')) idx = i;
await page.click(`[data-load="${idx}"]`);
await page.waitForTimeout(800);
const loaded = await page.evaluate(() => ({ gold: window.game.state.res.gold, charters: window.game.state.charters, weaver: window.game.state.buildings.some((b) => b.trade === 'weaver') }));
check('load it back', loaded.gold > 1 && loaded.charters?.includes('farm1') && loaded.weaver, JSON.stringify(loaded));
await page.evaluate(() => fetch('/api/saves/ui-test', { method: 'DELETE' }));
console.log(results.join('\n'));
console.log('errors', errors);
await browser.close();
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exit(1);
