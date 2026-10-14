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
await clickTile(spot[0], spot[1]);
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
await clickTile(ws[0], ws[1]);
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
console.log(results.join('\n'));
console.log('errors', errors);
await browser.close();
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exit(1);
