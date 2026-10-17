// Browser checks for the 3D view: it is the default, roads and zones are drawn
// freely with clicks, and the view turns. Expects the game at
// http://localhost:3001 (npm start), or URL=...
import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200));
});
let failed = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${ok ? '' : info}`);
  if (!ok) failed++;
};
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.click('text=Found the Settlement');
await page.waitForTimeout(1500);
check('3D is the default view', await page.evaluate(() => window.game.renderer.threeD));
await page.keyboard.press('Space');
// A clear patch near the camp.
const spot = await page.evaluate(() => {
  const s = window.game.state;
  s.res.wood = 999;
  s.res.gold = 999;
  s.tier = 1;
  const hall = s.buildings.find((b) => b.type === 'camp');
  const ox = hall.x + 6;
  const oy = hall.y - 9;
  for (let y = oy - 2; y < oy + 12; y++)
    for (let x = ox - 2; x < ox + 14; x++) {
      const i = y * s.width + x;
      if (s.occ[i] >= 0) continue;
      s.trees[i] = 0;
      s.rock[i] = 0;
      s.ore[i] = 0;
      s.terrain[i] = 0;
      s.road[i] = 0;
    }
  window.game.renderer.centerOn(ox + 5, oy + 4);
  return { ox, oy };
});
const clickAt = async (x, y) => {
  const [sx, sy] = await page.evaluate(([x, y]) => window.game.renderer.tileToScreen(x, y), [x, y]);
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
};
// A curved road: three bends, then the last one again.
await page.keyboard.press('r');
for (const [x, y] of [[0.5, 0.5], [5, 2.5], [10.5, 1]]) await clickAt(spot.ox + x, spot.oy + y);
await clickAt(spot.ox + 10.5, spot.oy + 1);
const curve = await page.evaluate(() => (window.game.state.curves ?? []).length);
check('a curved road is drawn with clicks', curve === 1, String(curve));
await page.keyboard.press('Escape');
// A pasture as a free shape: four corners, then the first again.
await page.evaluate(() => window.game.setTool({ kind: 'zone', type: 'pasture' }));
const corners = [[0.4, 4], [6.4, 4.5], [5, 10], [0.6, 9]].map(([x, y]) => [spot.ox + x, spot.oy + y]);
for (const [x, y] of corners) await clickAt(x, y);
await clickAt(corners[0][0] + 0.05, corners[0][1] + 0.05);
const shape = await page.evaluate(() => {
  const b = window.game.state.buildings.find((o) => o.shape);
  return b && { type: b.type, tiles: b.cells.length, sel: window.game.selected === b.id };
});
check('a pasture is drawn as a free shape', !!shape && shape.type === 'pasture' && shape.tiles > 15 && shape.sel, JSON.stringify(shape));
// Turning: the button swings the view a quarter round.
await page.click('#turnbar [data-turn="1"]');
// Slow software rendering takes a while to swing round.
await page.waitForFunction(() => window.game.turn === window.game.turnTo, null, { timeout: 20000 }).catch(() => {});
const turn = await page.evaluate(() => window.game.turn);
check('the turn button turns the view', Math.abs(turn - Math.PI / 2) < 1e-6, String(turn));
check('no errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(failed ? 1 : 0);
