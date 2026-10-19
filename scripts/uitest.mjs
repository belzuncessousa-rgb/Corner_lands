// Drives the real UI like a player: build menu, drawing a field, the
// inspector's crop, worker and product controls, stock targets and paving.
// Expects the game at http://localhost:3001 (npm start).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// SCALE=1.3 runs everything with the text size raised in the menu.
if (process.env.SCALE) await page.addInitScript((z) => localStorage.setItem('cornerlands.uiScale', z), process.env.SCALE);
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', '4242');
await page.click('text=Found the Settlement');
await page.waitForTimeout(600);
await page.evaluate(() => { const g = window.game; g.setSpeed(0); g.state.tier = 1; g.state.res.wood = 300; g.state.res.planks = 60; g.state.res.stone = 60; g.state.res.gold = 500; g.hud.update(); });
// The test raises the town's size by hand: carry on past the banner it shows (it pauses the game and takes clicks).
const closeBanners = async () => {
  while (await page.$('.banner .carry-on')) await page.click('.banner .carry-on');
};
const tileXY = (x, y) => page.evaluate(([x, y]) => window.game.renderer.tileToScreen(x + 0.5, y + 0.5), [x, y]);
/** Clicks so that a size x size building lands with its corner on (x, y). */
const placeAt = async (x, y, size) => { await closeBanners(); const [sx, sy] = await page.evaluate(([x, y, n]) => window.game.renderer.tileToScreen(x + n / 2, y + n / 2), [x, y, size]); await page.mouse.move(sx, sy); await page.mouse.click(sx, sy); await page.waitForTimeout(150); };
const clickTile = async (x, y) => { await closeBanners(); const [sx, sy] = await tileXY(x, y); await page.mouse.move(sx, sy); await page.mouse.click(sx, sy); await page.waitForTimeout(150); };
const hall = await page.evaluate(() => { const h = window.game.state.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp')); return { x: h.x, y: h.y }; });
const pick = async (cat, type) => {
  if (!(await page.$(`#buildbar [data-type="${type}"]`))) await page.click(`[data-cat="${cat}"]`);
  await page.click(`#buildbar [data-type="${type}"]`);
};
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); if (process.env.DEBUG) console.log(results.at(-1)); };
// Esc closes a pinned top-bar panel before anything else.
await page.click('[data-chip="goods"]');
await page.waitForTimeout(200);
// Move away first: hovering a chip opens its panel anyway.
await page.mouse.move(700, 500);
await page.waitForTimeout(400);
const pinned = await page.$eval('#chip-panel', (e) => getComputedStyle(e).display) !== 'none';
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
if (process.env.DEBUG) console.log('pinned before Esc', pinned, 'menu', !!(await page.$('.modal-back')));
check('Esc closes a pinned panel', pinned && (await page.$eval('#chip-panel', (e) => getComputedStyle(e).display)) === 'none' && !(await page.$('.modal-back')));
// No undo: a placed house stays, Ctrl+Z or not.
{
  const before = await page.evaluate(() => ({ n: window.game.state.buildings.length, gold: window.game.state.res.gold }));
  await page.keyboard.press('h');
  const hs = await page.evaluate(([hx, hy]) => { for (let r = 3; r < 14; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r]]) if (!window.cl.placementError(window.game.state, 'house', hx + dx, hy + dy)) return [hx + dx, hy + dy]; return null; }, [hall.x, hall.y]);
  await placeAt(hs[0], hs[1], 2);
  const placed = (await page.evaluate(() => window.game.state.buildings.length)) === before.n + 1;
  const shown = !!(await page.$('.undo-btn'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ n: window.game.state.buildings.length, gold: window.game.state.res.gold }));
  check('no undo: Ctrl+Z leaves a placement standing', placed && !shown && after.n === before.n + 1, JSON.stringify({ placed, shown, before, after }));
}
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
check('pave a road with T (planned, then laid)', (await page.evaluate(() => { const s = window.game.state; return s.road.filter((v) => v === 2).length + (s.roadPlan ?? []).filter((c) => (c & 3) === 2).length; })) >= 3);
await page.keyboard.press('Escape');
// One Road button: dirt by default, the other kinds chosen from the cards it shows.
await page.evaluate(() => window.game.setTool({ kind: 'select' }));
await page.click('#buildbar [data-action="road"]');
const dirt = await page.evaluate(() => { const t = window.game.tool; return t.kind === 'road' && !t.paved && !t.cobbled && document.querySelectorAll('#buildbar .road-card').length; });
await page.click('#buildbar .road-card[data-cobbled="1"]');
const cob = await page.evaluate(() => window.game.tool.cobbled === true && !!document.querySelector('#buildbar .road-card.sel[data-cobbled="1"]'));
check('road button lays dirt, cards offer stone and cobbles', dirt === 3 && cob, JSON.stringify([dirt, cob]));
await page.click('#buildbar [data-action="road"]');
check('road button puts the road tool away', (await page.evaluate(() => window.game.tool.kind)) === 'select');
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
// Bring the spot to the middle of the screen so no panel covers it.
await page.evaluate(([x, y]) => window.game.renderer.centerOn(x + 2, y + 2), pz);
await clickTile(pz[0], pz[1]);
await clickTile(pz[0] + 4, pz[1] + 4);
const past = await page.evaluate(() => { const s = window.game.state; window.cl.recompute(s); const p = s.buildings.find((b) => b.type === 'pasture'); return p && p.owner; });
check('fence a pasture beside it', past === byreId);
await page.evaluate((id) => window.game.select(id), byreId);
await page.waitForTimeout(300);
// Animals are bought at a trading post, one by one.
await page.evaluate(() => {
  const s = window.game.state;
  const c = s.buildings.find((b) => b.type === 'camp');
  let t = null;
  for (let r = 3; r < 24 && !t; r++) for (const [dx, dy] of [[-r, 0], [0, -r], [r, 0], [0, r], [-r, -r]]) if (!t && !window.cl.placementError(s, 'tradingpost', c.x + dx, c.y + dy)) t = window.cl.placeOrder(s, 'tradingpost', c.x + dx, c.y + dy);
  t.build = 1;
  t.need = undefined;
  window.cl.recompute(s);
  window.game.hud.update();
});
// The first trading post brings the steward, in a puff, to explain trade; skip him here.
await page.waitForSelector('#tutor .t-name', { timeout: 6000 }).catch(() => {});
const tutor = await page.evaluate(() => ({ chapter: window.game.state.tutorial?.chapter, name: document.querySelector('#tutor .t-name')?.textContent, puffs: document.querySelectorAll('.t-puff').length }));
check('the steward comes to explain trade', tutor.chapter === 'trade' && tutor.name === 'Fingamoboblius', JSON.stringify(tutor));
await page.click('#tutor [data-t="skip"]');
await page.waitForTimeout(200);
check('skip the trade lesson', (await page.evaluate(() => window.game.state.tutorial?.tradeSeen)) === true);
await page.evaluate((id) => window.game.select(id), byreId);
await page.waitForTimeout(300);
await page.click('#inspector [data-action="buy-animal"][data-k="cattle"]');
await page.evaluate(() => { for (let i = 0; i < 3; i++) window.cl.stepDay(window.game.state); });
const herd = await page.evaluate(() => { const b = window.game.state.buildings.find((x) => x.type === 'byre'); return { cattle: b.animals?.cattle, herd: b.herd }; });
check('buy a cow for the pasture', herd.cattle === 1 && herd.herd === 1, JSON.stringify(herd));
await page.keyboard.press('Escape');
// A house: backyard hens, then raise it and take up weaving at home.
const houseId = await page.evaluate(([hx, hy]) => { const s = window.game.state; for (let r = 4; r < 16; r++) for (const [dx, dy] of [[-r, -r], [r, r], [-r, r]]) { const b = window.cl.placeOrder(s, 'house', hx + dx, hy + dy); if (b) { b.build = 1; b.need = undefined; window.game.select(b.id); return b.id; } } return null; }, [hall.x, hall.y]);
await page.waitForTimeout(300);
await page.click('#inspector [data-action="yard"][data-y="hens"]');
check('keep hens in the backyard', (await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).yard, houseId)) === 'hens');
await page.evaluate((id) => { const b = window.game.state.buildings.find((x) => x.id === id); b.level = 2; window.game.hud.update(); }, houseId);
await page.waitForTimeout(300);
await page.click('#inspector [data-action="trade-home"][data-t="weaver"]');
check('start a weaving workshop at home', (await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).craftTo, houseId)) === 'weaver');
// Builders add the workshop; the craft is the family's for good.
await page.evaluate(() => { const s = window.game.state; s.res.planks += 40; s.res.wood += 40; s.res.tools += 4; for (let i = 0; i < 25; i++) window.cl.stepDay(s); });
check('take up weaving at home', (await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).trade, houseId)) === 'weaver');
await page.keyboard.press('Escape');
// Grant a charter through the charter screen.
await page.click('[data-action="charters"]');
await page.waitForTimeout(300);
await page.click('[data-action="charter-sel"][data-id="farm1"]');
await page.click('[data-action="charter-grant"]');
check('grant a charter', (await page.evaluate(() => window.game.state.charters?.includes('farm1'))) === true);
await page.click('[data-action="close-modal"]');
// A trading post takes orders: add an import and an export from the picker, set a target, reorder by dragging.
const postId = await page.evaluate(() => {
  const s = window.game.state;
  const h = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'));
  let m = null;
  for (let r = 3; r < 20 && !m; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r]]) if (!m && !window.cl.placementError(s, 'tradingpost', h.x + dx, h.y + dy)) m = window.cl.placeOrder(s, 'tradingpost', h.x + dx, h.y + dy);
  m.build = 1;
  m.need = undefined;
  window.cl.recompute(s);
  window.game.select(m.id);
  window.game.hud.update();
  return m.id;
});
await page.waitForTimeout(300);
await page.click('#inspector [data-action="order-new"][data-kind="import"]');
await page.click('.picker-modal .trade-tabs [data-tab="food"]');
await page.click('.picker-modal .pick[data-res="fish"]');
await page.waitForTimeout(200);
await page.click('#inspector [data-action="order-new"][data-kind="export"]');
await page.click('.picker-modal .trade-tabs [data-tab="materials"]');
await page.click('.picker-modal .pick[data-res="planks"]');
await page.waitForTimeout(200);
const orders0 = await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).orders.map((o) => `${o.kind}:${o.res}:${o.target}`), postId);
check('add import and export orders from the picker', orders0.length === 2 && orders0[0].startsWith('import:fish') && orders0[1].startsWith('export:planks'), JSON.stringify(orders0));
const t0 = await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).orders[0].target, postId);
await page.click('#inspector .order:first-child [data-action="order-target"][data-d="10"]');
const t1 = await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).orders[0].target, postId);
check('raise an order\'s target', t1 === t0 + 10, JSON.stringify([t0, t1]));
await page.waitForTimeout(200);
{
  const grips = await page.$$('#inspector .order .grip');
  const a = await grips[1].boundingBox();
  const t = await grips[0].boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, t.y + 2, { steps: 8 });
  await page.mouse.up();
}
const orders1 = await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).orders.map((o) => o.res), postId);
check('drag an order to the top', orders1[0] === 'planks' && orders1[1] === 'fish', JSON.stringify(orders1));
await page.click('#inspector .order:first-child [data-action="order-del"]');
const orders2 = await page.evaluate((id) => window.game.state.buildings.find((b) => b.id === id).orders.length, postId);
check('strike off an order', orders2 === 1);
// Build a manor (once the town is a Village) and call a harvest feast from it in autumn.
await page.evaluate(() => {
  const s = window.game.state;
  s.tier = Math.max(s.tier, 1);
  s.res.gold += 200;
  const c = s.buildings.find((b) => b.type === 'camp');
  let m = null;
  for (let r = 4; r < 24 && !m; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) if (!m && !window.cl.placementError(s, 'townhall', c.x + dx, c.y + dy)) m = window.cl.placeOrder(s, 'townhall', c.x + dx, c.y + dy);
  m.build = 1;
  m.need = undefined;
  window.cl.recompute(s);
  window.game.select(m.id);
  s.day = 6 * 10 + 1;
  s.res.bread = 200;
  window.game.hud.update();
});
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
// The reach overlay: V cycles wells, markets, taverns, churches; Esc closes it.
await page.keyboard.press('v');
const reach = await page.evaluate(() => window.game.coverage);
await page.keyboard.press('Escape');
check('reach overlay toggles', reach === 'well' && (await page.evaluate(() => window.game.coverage)) === null);
// Town walls (once the manor is a Stone Manor): laid like a road from the Manor menu.
{
  await page.evaluate(() => { const s = window.game.state; s.tier = 4; const m = s.buildings.find((b) => b.type === 'townhall'); m.build = 1; m.level = 3; s.res.stone += 200; s.res.dressedstone += 100; s.res.gold += 500; window.game.hud.update(); });
  await page.evaluate(() => document.querySelectorAll('.banner').forEach((e) => e.remove()));
  await pick('manor', 'wall');
  const wy = hall.y - 6;
  await page.evaluate(([x, y]) => window.game.renderer.centerOn(x, y), [hall.x + 2, wy]);
  await clickTile(hall.x - 2, wy);
  await clickTile(hall.x + 5, wy);
  const walls = await page.evaluate(() => window.game.state.buildings.filter((b) => b.type === 'wall').length);
  check('lay a town wall with two clicks', walls >= 5, `${walls} sections`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  check('no undo for walls either', (await page.evaluate(() => window.game.state.buildings.filter((b) => b.type === 'wall').length)) === walls);
  await page.evaluate(() => { window.game.setTool({ kind: 'select' }); window.game.hud.closeCategory(); });
  await page.evaluate(() => { window.game.state.tier = 1; });
}
// A long game: once the chronicle is full, new news still shows.
const late = await page.evaluate(() => {
  const g = window.game;
  // Warnings outrank good news on screen: start from a clear log.
  document.querySelectorAll('#log .msg').forEach((e) => e.remove());
  for (let i = 0; i < 60; i++) { window.cl.log(g.state, `Old news ${i}`, 'good'); g.hud.update(); }
  window.cl.log(g.state, 'Fresh news after a long game', 'good');
  g.hud.update();
  return [...document.querySelectorAll('#log .msg')].some((e) => e.textContent.includes('Fresh news'));
});
check('news still shows once the chronicle is full', late);
// Pause on bad news, switched on in the menu.
await page.keyboard.press('Escape');
await page.click('[data-m="pausebad"]');
await page.click('[data-m="resume"]');
await page.evaluate(() => { const g = window.game; g.setSpeed(1); window.cl.log(g.state, 'Food shortage! 3 villagers went hungry.', 'bad'); g.hud.update(); });
await page.waitForTimeout(300);
check('bad news pauses the game when asked', (await page.evaluate(() => window.game.speed)) === 0);
await page.evaluate(() => localStorage.removeItem('cornerlands.pauseOnBad'));
// Save through the menu, then load it back.
if (process.env.DEBUG) await page.screenshot({ path: '/tmp/claude-0/before-menu.png' });
await page.keyboard.press('Escape');
if (process.env.DEBUG) { await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/claude-0/after-esc.png' }); }
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
// Playing with friends: a town file round trip, the land link, music and photo mode.
await page.evaluate(() => document.querySelectorAll('.modal-back, .banner').forEach((b) => b.remove()));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.click('[data-m="save"]');
const [file] = await Promise.all([page.waitForEvent('download'), page.click('[data-m="file"]')]);
const filePath = `/tmp/claude-0/${file.suggestedFilename()}`;
await file.saveAs(filePath);
const townBefore = await page.evaluate(() => ({ b: window.game.state.buildings.length, name: window.game.state.name }));
await page.click('[data-m="back"]');
await page.evaluate(() => { window.game.newGame(9, 'normal', 'Elsewhere'); window.game.hud.showGameMenu(); });
await page.waitForTimeout(200);
await page.click('[data-m="load"]');
await page.waitForTimeout(400);
await page.setInputFiles('input.file-pick', filePath);
await page.waitForTimeout(500);
const townAfter = await page.evaluate(() => ({ b: window.game.state.buildings.length, name: window.game.state.name }));
check('a town file opens where it was saved', JSON.stringify(townBefore) === JSON.stringify(townAfter), JSON.stringify(townAfter));
await page.evaluate(() => window.game.hud.showGameMenu());
await page.waitForTimeout(200);
const musicBefore = await page.textContent('[data-m="music"]');
await page.click('[data-m="music"]');
check('music switch toggles', musicBefore !== (await page.textContent('[data-m="music"]')));
await page.click('[data-m="music"]');
check('the seed link button is there', !!(await page.$('[data-m="seed-link"]')));
await page.click('[data-m="photo"]');
await page.waitForTimeout(200);
check('photo mode hides the interface', await page.evaluate(() => document.getElementById('ui').classList.contains('photo') && document.getElementById('topbar').getClientRects().length === 0));
await page.keyboard.press('Escape');
check('Esc leaves photo mode', await page.evaluate(() => !window.game.photo && !document.querySelector('.modal')));
console.log(results.join('\n'));
console.log('errors', errors);
await browser.close();
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exit(1);
