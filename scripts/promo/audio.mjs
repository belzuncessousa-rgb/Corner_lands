// Renders the trailer's score to promo-out/soundtrack.wav.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage();
await page.goto('file://' + fileURLToPath(new URL('./soundtrack.html', import.meta.url)));
const b64 = await page.evaluate(() => window.render());
writeFileSync('promo-out/soundtrack.wav', Buffer.from(b64, 'base64'));
await browser.close();
console.log('promo-out/soundtrack.wav');
