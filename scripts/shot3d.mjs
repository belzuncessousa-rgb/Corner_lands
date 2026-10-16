// Screenshots of the 3D test page (proto3d.html) from the default angle and turned.
// Expects the game server at http://localhost:3001. Usage: node scripts/shot3d.mjs OUTDIR [query]
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp';
const query = process.argv[3] || 'seed=4242&years=8&day=45&zoom=1.6';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(`${process.env.URL || 'http://localhost:3001'}/proto3d.html?${query}`);
await page.waitForFunction(() => !!window.proto, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/p3d-a.png` });
await page.evaluate(() => window.proto.setTurn(Math.PI * 0.75));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/p3d-b.png` });
console.log('errors', errors.slice(0, 5));
await browser.close();
