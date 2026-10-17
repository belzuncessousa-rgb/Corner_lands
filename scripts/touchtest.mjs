// Touch check on a phone-sized page: a wobbly tap still selects, a long
// press deselects. Expects the game at http://localhost:3001 (npm start).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', '4242');
await page.click('text=Found the Settlement');
await page.waitForTimeout(600);
const hall = await page.evaluate(() => { const g = window.game; g.setSpeed(0); const h = g.state.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp')); g.renderer.centerOn(h.x + 1.5, h.y + 1.5); return window.game.renderer.tileToScreen(h.x + 1.5, h.y + 1.5); });
const cdp = await ctx.newCDPSession(page);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
// A tap that wobbles 9 px.
await touch('touchStart', hall[0], hall[1]);
await touch('touchMove', hall[0] + 9, hall[1] + 3);
await touch('touchEnd', 0, 0);
await page.waitForTimeout(300);
const tapped = (await page.evaluate(() => window.game.selected)) !== null;
console.log('wobbly tap selects:', tapped);
// A long press clears the selection.
await touch('touchStart', 60, 400);
await page.waitForTimeout(700);
await touch('touchEnd', 0, 0);
await page.waitForTimeout(200);
const cleared = (await page.evaluate(() => window.game.selected)) === null;
console.log('long press deselects:', cleared);
console.log('errors', errors);
await browser.close();
if (!tapped || !cleared || errors.length) process.exit(1);
