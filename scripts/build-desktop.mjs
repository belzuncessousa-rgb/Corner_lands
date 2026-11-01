// Builds the game into desktop/game for the desktop (Steam) app in desktop/:
// the same static build as for itch.io (saves stay on the player's computer).
//   node scripts/build-desktop.mjs           the full game
//   node scripts/build-desktop.mjs --demo    the demo (see src/demo.ts)
// WISHLIST_URL=<store page> adds the demo's wishlist button.
// Then, in desktop/: npm install once, `npm start` to try it, `npm run pack:win`
// (or pack:linux, pack:mac) for the folder that goes up to Steam (desktop/out).
import { build } from 'vite';

process.env.VITE_STATIC = '1';
if (process.argv.includes('--demo')) process.env.VITE_DEMO = '1';
if (process.env.WISHLIST_URL) process.env.VITE_WISHLIST_URL = process.env.WISHLIST_URL;
await build({ build: { outDir: 'desktop/game', emptyOutDir: true }, logLevel: 'warn' });
console.log(`desktop/game: built${process.env.VITE_DEMO ? ' (demo)' : ''}`);
