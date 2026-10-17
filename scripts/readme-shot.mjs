// The README's screenshot: a town grown by the autoplayer, seen in summer.
// Expects the game at http://localhost:3001; writes docs/screenshot.jpg.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', process.env.SEED || '4242');
await page.click('text=Found the Settlement');
await page.waitForTimeout(400);
await page.evaluate((years) => {
  const g = window.game;
  const s = g.state;
  window.cl.playBot(s, years, 3);
  // Into high summer of the next year, paused, in full detail.
  while (s.day % 120 !== 45) window.cl.stepDay(s);
  s.pendingEvent = null;
  g.setSpeed(0);
  g.renderer.noteRenderTime = () => { g.renderer.light = false; };
  g.renderer.light = false;
  const hall = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'));
  g.renderer.centerOn(hall.x + 2, hall.y + 2);
  g.renderer.cam.zoom = 1.15;
  g.hud.update();
}, Number(process.env.YEARS || 12));
await page.evaluate(() => document.querySelectorAll('.banner, .msg, #season-banner, .modal-back').forEach((b) => b.remove()));
await page.waitForTimeout(2500);
await page.screenshot({ path: process.argv[2] || 'docs/screenshot.jpg', type: 'jpeg', quality: 85 });
await browser.close();
