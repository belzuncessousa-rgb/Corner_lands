// Theme pictures for the itch.io page: a banner (the title on a wooden
// signboard), a page background and the game frame's background.
// Expects the game at http://localhost:3001; writes into itch/.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
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
  window.cl.playBot(g.state, 9, 3);
  g.setSpeed(0);
  g.renderer.noteRenderTime = () => { g.renderer.light = false; };
  g.renderer.light = false;
  g.setPhoto(true);
  document.getElementById('ui').style.display = 'none';
});
const view = async (day, zoom, dx, dy, w, h) => {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(([day, zoom, dx, dy]) => {
    const g = window.game;
    const s = g.state;
    while (s.day % 120 !== day) window.cl.stepDay(s);
    s.pendingEvent = null;
    const m = s.buildings.find((b) => b.type === 'townhall') ?? s.buildings.find((b) => b.type === 'camp');
    g.renderer.centerOn(m.x + 2 + dx, m.y + 2 + dy);
    g.renderer.cam.zoom = zoom;
    document.querySelectorAll('.banner, .msg, #season-banner, .modal-back').forEach((b) => b.remove());
  }, [day, zoom, dx, dy]);
  await page.waitForTimeout(2500);
  return (await page.screenshot({ type: 'jpeg', quality: 92 })).toString('base64');
};
const wood = await page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--wood-img'), getComputedStyle(document.documentElement).getPropertyValue('--wood-img-dark')]);
const panorama = await view(47, 0.8, 0, 0, 2400, 1350);
const frame = await view(52, 1.35, 1, 2, 1280, 720);

const fonts = '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=EB+Garamond:ital@1&display=swap" rel="stylesheet">';
const art = await browser.newPage();
const shoot = async (w, h, html, path, transparent = false) => {
  await art.setViewportSize({ width: w, height: h });
  await art.setContent(`<html><head>${fonts}<style>body{margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;background:${transparent ? 'transparent' : '#2a1d12'}}
    .plaque{position:absolute;filter:drop-shadow(0 8px 14px rgba(0,0,0,.55))}
    .plaque::before,.plaque::after{content:'';position:absolute;--m:radial-gradient(circle at 0 0,transparent var(--n),#000 calc(var(--n) + .5px)) top left/51% 51% no-repeat,radial-gradient(circle at 100% 0,transparent var(--n),#000 calc(var(--n) + .5px)) top right/51% 51% no-repeat,radial-gradient(circle at 0 100%,transparent var(--n),#000 calc(var(--n) + .5px)) bottom left/51% 51% no-repeat,radial-gradient(circle at 100% 100%,transparent var(--n),#000 calc(var(--n) + .5px)) bottom right/51% 51% no-repeat;-webkit-mask:var(--m);mask:var(--m)}
    .plaque::before{inset:0;--n:30px;background:linear-gradient(180deg,rgba(255,220,160,.25),rgba(0,0,0,.25)),${wood[1]} center/cover}
    .plaque::after{inset:10px;--n:32px;background:radial-gradient(ellipse at 50% 40%,rgba(255,230,180,.12),rgba(30,12,0,.32)),${wood[0]} center/cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
    .plaque>*{position:relative;z-index:1}
    .rope{position:absolute;width:7px;background:repeating-linear-gradient(160deg,#c8a46c 0 4px,#8a6a3a 4px 8px);box-shadow:1px 0 1px rgba(0,0,0,.4)}
    .title{font:700 var(--ts) Cinzel,serif;color:#fbefd2;letter-spacing:.04em;text-align:center;text-shadow:0 2px 0 #3a2210,0 4px 10px rgba(0,0,0,.6)}
    .sub{font:italic var(--ss) 'EB Garamond',serif;color:#f6e6c2;text-align:center;text-shadow:0 2px 4px rgba(0,0,0,.8)}
  </style></head><body>${html}</body></html>`);
  await art.evaluate(() => document.fonts.ready);
  await art.waitForTimeout(1200);
  await art.screenshot({ path, omitBackground: transparent, ...(path.endsWith('.jpg') ? { type: 'jpeg', quality: 88 } : {}) });
};

// Banner: 960 wide, the page's width; the signboard hangs from the top edge.
await shoot(960, 300, `
  <i class="rope" style="left:230px;top:0;height:60px"></i><i class="rope" style="right:230px;top:0;height:60px"></i>
  <div class="plaque" style="left:100px;top:40px;width:760px;height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;--ts:78px;--ss:26px;white-space:nowrap">
    <div class="title">Corner Lands</div><div class="sub">Raise a humble hamlet into a thriving medieval town</div>
  </div>`, 'itch/banner.png', true);

// Page background: a wide summer view of the town, softened toward the edges.
await shoot(2400, 1350, `
  <div style="position:absolute;inset:0;background:url(data:image/jpeg;base64,${panorama}) center/cover"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 35%,rgba(30,18,6,0) 30%,rgba(30,18,6,.55) 100%)"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:420px;background:linear-gradient(180deg,rgba(42,29,18,0),#2a1d12)"></div>`, 'itch/background.jpg');

// The game frame before "Run game": the town, the title above, the middle left clear for itch's button.
await shoot(1280, 720, `
  <div style="position:absolute;inset:0;background:url(data:image/jpeg;base64,${frame}) center/cover"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(30,18,6,.7) 0%,rgba(30,18,6,.15) 34%,rgba(30,18,6,.25) 62%,rgba(30,18,6,.6) 100%)"></div>
  <div class="title" style="position:absolute;top:40px;width:100%;--ts:92px">Corner Lands</div>
  <div class="sub" style="position:absolute;top:150px;width:100%;--ss:30px">A cosy medieval city builder</div>
  <div class="sub" style="position:absolute;bottom:42px;width:100%;--ss:24px">Plays in your browser · saves stay on your device</div>`, 'itch/embed-bg.jpg');

console.log(errors.length ? errors : 'ok');
await browser.close();
