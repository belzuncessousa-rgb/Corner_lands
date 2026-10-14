// Drives the UI with real mouse input to verify controls work.
import { chromium } from 'playwright';
const out = process.argv[2] || 'interact';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', '777');
await page.click('text=Found the Settlement');
await page.waitForTimeout(500);
// Screen position of a tile.
const scr = (tx, ty) => page.evaluate(([tx, ty]) => window.game.renderer.tileToScreen(tx + 0.5, ty + 0.5), [tx, ty]);
const hall = await page.evaluate(() => { const h = window.game.state.buildings[0]; return { x: h.x, y: h.y }; });
// Drag a road south from the existing road.
await page.keyboard.press('r');
let [x0, y0] = await scr(hall.x + 4, hall.y + 3);
let [x1, y1] = await scr(hall.x + 4, hall.y + 9);
await page.mouse.click(x0, y0);
await page.mouse.move(x1, y1, { steps: 5 });
await page.screenshot({ path: `${out}-1-road-drag.png` });
await page.mouse.click(x1, y1);
await page.mouse.click(x1, y1, { button: 'right' });
const roads = await page.evaluate(() => window.game.state.road.reduce((a, b) => a + b, 0));
console.log('road tiles', roads);
// Place a house via the build card.
await page.keyboard.press('Escape');
await page.click('.card[data-type="house"]');
[x0, y0] = await scr(hall.x + 5.5, hall.y + 5.5);
await page.mouse.move(x0, y0);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}-2-ghost.png` });
await page.mouse.click(x0, y0);
await page.keyboard.press('Escape');
const houses = await page.evaluate(() => window.game.state.buildings.filter((b) => b.type === 'house').map((b) => [b.x, b.y, b.connected]));
console.log('houses', JSON.stringify(houses));
// Run time and select the house.
await page.click('button[data-speed="3"]');
await page.waitForTimeout(6000);
await page.mouse.click(x0, y0 - 10);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-3-select.png` });
const sel = await page.evaluate(() => window.game.selected);
console.log('selected', sel);
// Hover tooltip on a resource.
await page.mouse.move(700, 30);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}-4-tooltip.png` });
// Zoom out with the wheel.
await page.mouse.move(720, 450);
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-5-zoomout.png` });
// Menu + save.
await page.click('#menu-btn');
await page.click('text=Save Game');
await page.click('[data-m="save"]');
await page.waitForTimeout(500);
console.log('save msg', await page.textContent('#save-msg'));
await page.screenshot({ path: `${out}-6-save.png` });
console.log('errors:', errors);
await browser.close();
