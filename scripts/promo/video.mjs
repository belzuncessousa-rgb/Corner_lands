// Records the trailer frame by frame on a virtual clock, then encodes it with
// the score. Expects the game at http://localhost:3001 and ffmpeg on the path.
//   node scripts/promo/audio.mjs && node scripts/promo/video.mjs
// Writes promo-out/corner-lands-trailer.mp4 (1920x1080, 30 fps).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FPS = 30;
const SCENES = [
  ['title', 4.5],
  ['found', 6.5],
  ['grow', 8],
  ['life', 9],
  ['seasons', 8],
  ['dusk', 6],
  ['manor', 5],
  ['charters', 5],
  ['tutorial', 4],
  ['end', 5],
];
const only = process.env.ONLY; // a scene name, to try one out
const frames = 'promo-out/frames';
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// The game's clock is ours: each frame moves it on exactly 1/30 s.
await page.addInitScript(() => {
  let vt = 0;
  let cbs = [];
  window.requestAnimationFrame = (cb) => {
    cbs.push(cb);
    return cbs.length;
  };
  window.cancelAnimationFrame = () => {};
  performance.now = () => vt;
  window.__step = (ms) => {
    vt += ms;
    const list = cbs;
    cbs = [];
    for (const cb of list) cb(vt);
  };
});
await page.goto(process.env.URL || 'http://localhost:3001/');
await page.waitForTimeout(1500);
const step = (k = 1) => page.evaluate((k) => { for (let j = 0; j < k; j++) window.__step(1000 / 30); }, k);
await step(30);
await page.addScriptTag({ path: fileURLToPath(new URL('./scenes.js', import.meta.url)) });
await page.evaluate(() => document.fonts.ready);

let n = 0;
const shoot = async () => {
  await page.screenshot({ path: `${frames}/f${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
};
for (const [name, secs] of SCENES) {
  const count = Math.round(secs * FPS);
  if (name === 'found') {
    // Into a new game, and grown a little off camera for the later scenes.
    await page.evaluate(() => document.querySelector('.modal-back')?.style.removeProperty('display'));
    await page.click('[data-m="new"]');
    await page.fill('#seed', process.env.SEED || '4242');
    await page.click('[data-m="go"]');
    await step(10);
  }
  if (name === 'life') await page.evaluate(() => { window.cl.playBot(window.game.state, 3, 9); window.game.state.pendingEvent = null; });
  if (only && only !== name) {
    for (let i = 0; i < count; i++) await page.evaluate(([name, i, count]) => window.promo[name](i, count), [name, i, count]);
    continue;
  }
  for (let i = 0; i < count; i++) {
    await page.evaluate(([name, i, count]) => window.promo[name](i, count), [name, i, count]);
    await step();
    await shoot();
  }
  console.log(`${name}: ${count} frames (${n} total)`);
}
await browser.close();
if (errors.length) console.log('page errors:', errors);

const out = only ? `promo-out/scene-${only}.mp4` : 'promo-out/corner-lands-trailer.mp4';
const audio = only ? [] : ['-i', 'promo-out/soundtrack.wav'];
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%05d.jpg`, ...audio,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-vf', 'scale=1920:1080:flags=lanczos',
  ...(only ? [] : ['-c:a', 'aac', '-b:a', '192k', '-shortest']), '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log(out);
