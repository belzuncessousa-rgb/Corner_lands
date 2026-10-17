// Plays a scripted settlement and captures screenshots across seasons.
import { chromium } from 'playwright';
const out = process.argv[2] || 'scenario';
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
await page.click('text=Found the Settlement');
await page.waitForTimeout(500);
const result = await page.evaluate(() => {
  const { game, cl } = window;
  const s = game.state;
  const hall = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'));
  const ry = hall.y + 3;
  const placed = [];
  // Extend the main road both ways and add a cross street.
  for (let x = hall.x - 12; x <= hall.x + 14; x++) cl.buildRoad(s, x, ry);
  for (let y = ry - 8; y <= ry + 10; y++) cl.buildRoad(s, hall.x + 5, y);
  const want = ['house', 'house', 'house', 'house', 'woodcutter', 'forager', 'hunter', 'quarry', 'well', 'forester', 'house', 'house', 'storehouse', 'fisher'];
  for (const type of want) {
    let done = false;
    for (let d = 0; d < 14 && !done; d++) {
      for (const [x, y] of [
        [hall.x - d, ry + 1], [hall.x + d, ry + 1], [hall.x - d, ry - 2], [hall.x + d, ry - 2],
        [hall.x + 6, ry - d], [hall.x + 6, ry + d], [hall.x + 3, ry - d], [hall.x + 3, ry + d],
        [hall.x - d, ry - 3], [hall.x + d, ry - 3],
      ]) {
        if (!cl.placementError(s, type, x, y)) {
          const b = cl.placeOrder(s, type, x, y);
          if (b) { placed.push(type); done = true; break; }
        }
      }
    }
  }
  return placed;
});
console.log('placed', result);
const snap = async (name, days) => {
  await page.evaluate((days) => {
    for (let i = 0; i < days; i++) window.cl.stepDay(window.game.state);
  }, days);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-${name}.png` });
  const info = await page.evaluate(() => {
    const s = window.game.state;
    return { day: s.day, pop: s.population, happy: s.happiness, res: s.res, tier: s.tier };
  });
  console.log(name, JSON.stringify(info));
};
await snap('spring', 20);
await snap('summer', 30);
await snap('autumn', 40);
await snap('winter', 30);
await page.evaluate(() => window.game.select(window.game.state.buildings[1].id));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}-inspect.png` });
console.log('errors:', errors);
await browser.close();
