// The demo build (npm run build:demo): the game as it is, ending when the
// settlement becomes a Town or at the end of its second year, whichever
// comes first, with a thank-you and a link to the store page.
import { DAYS_PER_YEAR } from './game/data';
import type { GameState } from './game/types';

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};

export const DEMO = env.VITE_DEMO === '1';

/** The store page the thank-you links to; no button when empty. */
export const WISHLIST_URL = env.VITE_WISHLIST_URL ?? '';

/** The size that ends the demo (Town). */
export const DEMO_TIER = 2;

/** The day that ends the demo: the last of the second year. */
export const DEMO_DAYS = 2 * DAYS_PER_YEAR;

/** True once a demo town has played all the demo holds. */
export function demoOver(s: GameState): boolean {
  return DEMO && (s.tier >= DEMO_TIER || s.day >= DEMO_DAYS);
}
