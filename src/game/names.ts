/** Place names for new settlements, and the seed everyone shares this week. */

const FRONT = ['Ash', 'Oak', 'Thorn', 'Wil', 'Brad', 'Elm', 'Stan', 'Hart', 'Ald', 'Bur', 'Kings', 'Mar', 'Red', 'Wester', 'Mil', 'Black', 'Fair', 'Hazel', 'Brook', 'Cold', 'Long', 'Swan', 'Wolf', 'Frog'];
const BACK = ['ford', 'ley', 'ton', 'bury', 'wick', 'field', 'by', 'stead', 'ham', 'well', 'dale', 'holm', 'worth', 'mere', 'combe'];

/** A plausible English place name, the same for the same number. */
export function placeName(n: number): string {
  let h = (n * 2654435761) >>> 0;
  const a = FRONT[h % FRONT.length];
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  const b = BACK[h % BACK.length];
  // Avoid doubled letters across the join ("Brookkford" and the like).
  return a.at(-1) === b[0] ? a + b.slice(1) : a + b;
}

/** Weeks since 1 Jan 1970, counted from Mondays. */
export function weekNumber(now = Date.now()): number {
  return Math.floor((now / 86400000 + 3) / 7);
}

/** The map seed for a given week: everyone gets the same land. */
export function weeklySeed(week = weekNumber()): number {
  return ((week * 2654435761) >>> 0) % 999999;
}

/** The settlement's name; older saves take one from their map seed. */
export function townName(s: { name?: string; seed: number }): string {
  return s.name || placeName(s.seed);
}
