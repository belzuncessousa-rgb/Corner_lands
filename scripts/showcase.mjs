// Cheats in resources, places every building type and screenshots each season.
import { chromium } from 'playwright';
const out = process.argv[2] || 'showcase';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', process.env.SEED || '4242');
await page.click('text=Found the Settlement');
await page.waitForTimeout(300);
const placed = await page.evaluate(() => {
  const { game, cl } = window;
  const s = game.state;
  for (const k of Object.keys(s.res)) s.res[k] = 5000;
  s.tier = 2;
  s.population = 60;
  const hall = s.buildings.find((b) => b.type === 'townhall');
  const ry = hall.y + 3;
  for (let x = hall.x - 16; x <= hall.x + 16; x++) cl.buildRoad(s, x, ry);
  for (let y = ry - 12; y <= ry + 12; y++) { cl.buildRoad(s, hall.x + 5, y); cl.buildRoad(s, hall.x - 6, y); }
  const want = ['farm', 'market', 'church', 'storehouse', 'house', 'house', 'house', 'bakery', 'sawmill', 'smithy', 'mine', 'quarry', 'woodcutter', 'forester', 'forager', 'hunter', 'fisher', 'well', 'house', 'house', 'house', 'house'];
  const placed = [];
  for (const type of want) {
    let done = false;
    for (let d = 0; d < 16 && !done; d++) {
      for (const [x, y] of [
        [hall.x - d, ry + 1], [hall.x + d, ry + 1], [hall.x - d, ry - 4], [hall.x + d, ry - 4],
        [hall.x + 6, ry - d], [hall.x + 6, ry + d], [hall.x + 1, ry - d], [hall.x + 1, ry + d],
        [hall.x - 10, ry - d], [hall.x - 10, ry + d], [hall.x - 5, ry - d], [hall.x - 5, ry + d],
        [hall.x - d, ry - 2], [hall.x + d, ry - 2], [hall.x - d, ry - 3], [hall.x + d, ry - 3],
      ]) {
        if (!cl.placementError(s, type, x, y)) {
          const b = cl.placeOrder(s, type, x, y);
          if (b && b.connected) { placed.push(type); done = true; break; }
          if (b) { s.buildings = s.buildings.filter((o) => o !== b); for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) s.occ[yy * s.width + xx] = -1; }
        }
      }
    }
  }
  // Finish construction except two sites.
  s.buildings.forEach((b, i) => { if (i < s.buildings.length - 2) b.build = 1; });
  s.buildings.filter((b) => b.type === 'house').slice(0, 3).forEach((b) => (b.level = 2));
  s.dirty = true;
  cl.recompute(s);
  return placed;
});
console.log('placed', placed.join(','));
for (const [name, toDay] of [['spring', 15], ['summer', 45], ['autumn', 65], ['winter', 100]]) {
  await page.evaluate((toDay) => {
    const s = window.game.state;
    while (s.day < toDay) window.cl.stepDay(s);
    for (const k of Object.keys(s.res)) s.res[k] = Math.max(s.res[k], 500);
  }, toDay);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}-${name}.png` });
}
await page.evaluate(() => window.game.setZoom(2));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}-zoom.png` });
console.log('errors:', errors);
await browser.close();
