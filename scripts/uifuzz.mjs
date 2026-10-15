// Clicks, drags, keys and wheel turns at random over the real UI of a large
// town, looking for script errors and slow frames.
// Expects the game at http://localhost:3001 (npm start). STEPS sets the length.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const W = Number(process.env.W || 1440);
const H = Number(process.env.H || 900);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', process.env.SEED || '777');
await page.click('text=Found the Settlement');
await page.waitForTimeout(500);
// Grow a big town quickly with the autoplayer.
await page.evaluate((years) => { const g = window.game; window.cl.playBot(g.state, years, 3); g.state.dirty = true; g.hud.update(); }, Number(process.env.YEARS || 8));
await page.evaluate(() => window.game.setSpeed(1));
console.log('town', await page.evaluate(() => ({ pop: window.game.state.population, buildings: window.game.state.buildings.length, tier: window.game.state.tier })));

let seed = Number(process.env.SEED || 777);
const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const keys = ['Escape', 'Space', '1', '2', '3', 'r', 't', 'x', 'h', 'e', 'q', 'g', '+', '-', 'w', 'a', 's', 'd', 'ArrowLeft', 'ArrowUp'];
const steps = Number(process.env.STEPS || 600);
for (let i = 0; i < steps; i++) {
  const roll = r();
  try {
    if (roll < 0.45) {
      // Prefer real controls half the time.
      const els = await page.$$('button:visible, [data-action]:visible, [data-cat]:visible, [data-type]:visible, .chip:visible');
      if (els.length && r() < 0.6) await els[Math.floor(r() * els.length)].click({ timeout: 300, force: true });
      else await page.mouse.click(r() * W, r() * H, { button: r() < 0.15 ? 'right' : 'left' });
    } else if (roll < 0.6) {
      await page.keyboard.press(keys[Math.floor(r() * keys.length)]);
    } else if (roll < 0.75) {
      const x = r() * W, y = r() * H;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (r() - 0.5) * 300, y + (r() - 0.5) * 300, { steps: 4 });
      await page.mouse.up();
    } else if (roll < 0.85) {
      await page.mouse.move(r() * W, r() * H);
      await page.mouse.wheel(0, (r() - 0.5) * 600);
    } else {
      await page.mouse.move(r() * W, r() * H);
    }
  } catch {
    // Elements vanish under the monkey's hands; that is fine.
  }
  if (i % 50 === 0) await page.waitForTimeout(100);
  if (errors.length) break;
}
// Frame times at the end, with the game running.
await page.evaluate(() => window.game.setSpeed(1));
const frames = await page.evaluate(() => new Promise((done) => {
  const t = [];
  let last = performance.now();
  const tick = (now) => { t.push(now - last); last = now; if (t.length < 120) requestAnimationFrame(tick); else done(t); };
  requestAnimationFrame(tick);
}));
frames.sort((a, b) => a - b);
console.log('frame ms median', frames[60].toFixed(1), 'p95', frames[114].toFixed(1));
await page.screenshot({ path: process.env.SHOT || '/tmp/claude-0/uifuzz.png' });
console.log('errors', errors.slice(0, 5));
await browser.close();
if (errors.length) process.exit(1);
