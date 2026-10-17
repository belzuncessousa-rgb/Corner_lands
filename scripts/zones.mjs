// Grows a village with the autoplayer, adds pastures, an orchard and backyards, and screenshots them.
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:3001/');
await page.waitForTimeout(800);
await page.click('text=New Settlement');
await page.fill('#seed', '4242');
await page.click('text=Found the Settlement');
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const { game, cl } = window;
  const s = game.state;
  cl.playBot(s, 3.2, 5);
  s.res.gold += 500; s.res.wood += 100; s.res.planks += 40;
  // Animal farm + pasture, orchard lodge + orchard near the edge of town.
  const hall = s.buildings.find((b) => (b.type === 'townhall' || b.type === 'camp'));
  const out = [];
  const tryAt = (fn, c = hall, r0 = 6) => { for (let r = r0; r < 26; r++) for (const [dx, dy] of [[r,0],[0,r],[-r,0],[0,-r],[r,r],[-r,r],[r,-r],[-r,-r]]) { const v = fn(c.x + dx, c.y + dy); if (v) return v; } return null; };
  const byre = tryAt((x, y) => cl.placementError(s, 'byre', x, y) ? null : cl.placeOrder(s, 'byre', x, y));
  if (byre) { byre.build = 1; byre.need = undefined; s.dirty = true; byre.recipe = 'sheep'; }
  const past = byre && tryAt((x, y) => cl.placeZone(s, 'pasture', x, y, x + 5, y + 4), byre, 2);
  const byre2 = tryAt((x, y) => cl.placementError(s, 'byre', x, y) ? null : cl.placeOrder(s, 'byre', x, y));
  if (byre2) { byre2.build = 1; byre2.need = undefined; byre2.recipe = 'cattle'; s.dirty = true; }
  const past2 = byre2 && tryAt((x, y) => cl.placeZone(s, 'pasture', x, y, x + 5, y + 5), byre2, 2);
  const lodge = tryAt((x, y) => cl.placementError(s, 'orchardist', x, y) ? null : cl.placeOrder(s, 'orchardist', x, y));
  if (lodge) { lodge.build = 1; lodge.need = undefined; s.dirty = true; }
  const orch = lodge && tryAt((x, y) => cl.placeZone(s, 'orchard', x, y, x + 4, y + 3), lodge, 2);
  if (orch) orch.age = 400;
  let n = 0;
  for (const h of s.buildings.filter((b) => b.type === 'house')) { cl.setYard(s, h, ['veg', 'hens', 'bees'][n++ % 3]); s.res.wood += 10; s.res.gold += 20; }
  cl.recompute(s);
  // Advance to late spring then summer.
  while (Math.floor(s.day / 10) % 12 !== 4) cl.stepDay(s);
  game.setSpeed(0);
  document.querySelectorAll('.banner').forEach((e) => e.remove());
  return { byre: !!byre, past: !!past, byre2: !!byre2, past2: !!past2, lodge: !!lodge, orch: !!orch, herd: byre?.herd, herd2: byre2?.herd, fields: s.buildings.filter((b) => b.type === 'field').length };
});
console.log(JSON.stringify(info));
const shoot = async (type, name, zoom = 1.6) => {
  await page.evaluate(([type, zoom]) => { const { game } = window; const b = game.state.buildings.find((o) => o.type === type); if (!b) return; game.renderer.cam.zoom = zoom; game.renderer.centerOn(b.x + b.w / 2, b.y + b.h / 2); game.select(b.id); }, [type, zoom]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}-${name}.png` });
};
await shoot('field', 'field');
await shoot('pasture', 'pasture');
await shoot('orchard', 'orchard');
await shoot('house', 'house', 2.4);
console.log('errors', errors);
await browser.close();
