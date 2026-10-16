// Screenshots of the map, ledger and charter tree as seen with deuteranopia
// (colour-matrix filter), to check that colour is never the only cue.
// Expects the game at http://localhost:3001; writes to OUT (default /tmp).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', '4242');
await page.click('text=Found the Settlement');
await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.game; window.cl.playBot(g.state, 5, 3); g.state.pendingEvent = undefined; g.setSpeed(0);
  // A protected wood beside the manor, to check its border is visible.
  const h = g.state.buildings.find((b) => b.type === 'townhall'); g.state.groves = [{ x: h.x - 9, y: h.y - 3, w: 7, h: 7 }]; g.renderer.centerOn(h.x - 3, h.y + 1); g.hud.update(); });
for (let i = 0; i < 3 && (await page.$('.modal-back')); i++) { await page.click('.modal button >> nth=0').catch(() => {}); await page.waitForTimeout(300); }
// Deuteranopia (Machado et al. 2009, severity 1).
await page.evaluate(() => {
  document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="cvd"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter></svg>');
  document.documentElement.style.filter = 'url(#cvd)';
  document.querySelectorAll('.banner').forEach((e) => e.remove());
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${process.env.OUT || '/tmp'}/cvd-map.png` });
await page.click('[data-action="ledger"], [data-chip="treasury"]').catch(() => {});
await page.waitForTimeout(300);
const led = await page.$('[data-action="ledger"]');
if (led) { await led.click(); await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.OUT || '/tmp'}/cvd-ledger.png` }); await page.keyboard.press('Escape'); }
await page.evaluate(() => { window.game.state.tier = 2; window.game.state.res.prestige = 500; });
await page.keyboard.press('Escape').catch(() => {});
const ch = await page.$('[data-action="charters"]');
if (ch) { await ch.click(); await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.OUT || '/tmp'}/cvd-charters.png` }); }
console.log(errors);
await browser.close();
