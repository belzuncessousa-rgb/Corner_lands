// Store-page pictures for itch.io: screenshots at 1280x720 and a 630x500 cover.
// Expects the game at http://localhost:3001; writes into itch/.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('[data-m="new"]');
await page.fill('#seed', process.env.SEED || '4242');
await page.click('[data-m="go"]');
await page.waitForTimeout(400);
await page.evaluate(() => {
  const g = window.game;
  window.cl.playBot(g.state, 8, 3);
  g.setSpeed(0);
  g.renderer.noteRenderTime = () => { g.renderer.light = false; };
  g.renderer.light = false;
});
const clean = () => page.evaluate(() => document.querySelectorAll('.banner, .msg, #season-banner, .modal-back').forEach((b) => b.remove()));
/** Into a given day of the year (0-119), paused, looking at the manor. */
const season = (day, zoom, ui = true, dx = 0, dy = 0) =>
  page.evaluate(([day, zoom, ui, dx, dy]) => {
    const g = window.game;
    const s = g.state;
    while (s.day % 120 !== day) window.cl.stepDay(s);
    s.pendingEvent = null;
    g.setSpeed(0);
    const hall = s.buildings.find((b) => b.type === 'townhall') ?? s.buildings.find((b) => b.type === 'camp');
    g.renderer.centerOn(hall.x + 2 + dx, hall.y + 2 + dy);
    g.renderer.cam.zoom = zoom;
    document.getElementById('ui').style.display = ui ? '' : 'none';
    g.hud.update();
  }, [day, zoom, ui, dx, dy]);
const shot = async (name) => {
  await clean();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `itch/${name}.png` });
};
await season(45, 1.0);
await shot('1-summer-town');
await season(50, 2.0, false, 3, 2);
await shot('2-close-up');
await season(80, 1.2, false, -4, 3);
await shot('3-autumn');
await season(105, 1.2, false, 2, -3);
await shot('4-winter');
await season(45, 1.0);
await page.evaluate(() => { const s = window.game.state; s.res.prestige = Math.max(s.res.prestige, 400); });
await page.click('#top [data-action="charters"]');
await page.mouse.move(640, 700);
await page.evaluate(() => document.querySelectorAll('.banner, .msg, #log > *, #season-banner').forEach((b) => b.remove()));
await page.waitForTimeout(600);
await page.screenshot({ path: 'itch/5-charters.png' });
await page.evaluate(() => window.game.hud.closeModal());
// The cover: a close view of the town with the title over it.
await season(52, 1.7, false, 1, 1);
await clean();
await page.waitForTimeout(2500);
const bg = (await page.screenshot({ type: 'jpeg', quality: 92 })).toString('base64');
const cover = await browser.newPage({ viewport: { width: 630, height: 500 } });
await cover.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=EB+Garamond:ital@1&display=swap" rel="stylesheet"></head>
<body style="margin:0;width:630px;height:500px;overflow:hidden;background:url(data:image/jpeg;base64,${bg}) center/cover">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(30,18,6,0.65) 0%,rgba(30,18,6,0) 38%,rgba(30,18,6,0) 75%,rgba(30,18,6,0.55) 100%)"></div>
<div style="position:absolute;top:26px;width:100%;text-align:center;font-family:Cinzel,serif;font-weight:700;font-size:60px;color:#fbefd2;letter-spacing:2px;text-shadow:0 3px 8px rgba(0,0,0,.8)">Corner Lands</div>
<div style="position:absolute;top:104px;width:100%;text-align:center;font-family:'EB Garamond',serif;font-style:italic;font-size:22px;color:#f2e2c0;text-shadow:0 2px 6px rgba(0,0,0,.9)">Raise a humble hamlet into a thriving medieval town</div>
</body></html>`);
await cover.waitForTimeout(1500);
await cover.screenshot({ path: 'itch/cover.png' });
console.log(errors.length ? errors : 'ok');
await browser.close();
