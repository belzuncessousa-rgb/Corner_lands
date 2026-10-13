import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/game/world';
import { playBot } from './bot';

describe('balance', () => {
  it('a simple strategy grows from Hamlet to Village and Town', { timeout: 60000 }, () => {
    const results = [101, 202, 303].map((seed) => {
      const s = generateWorld(seed);
      const rep = playBot(s, 12, seed);
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BALANCE_LOG) console.log(`seed ${seed}\n${rep.log.join('\n')}\n`, rep);
      return rep;
    });
    for (const r of results) {
      expect(r.villageYear).not.toBeNull();
      expect(r.villageYear!).toBeLessThan(5);
    }
    // The bot is crude; at least one map should reach Town.
    expect(results.some((r) => r.townYear !== null)).toBe(true);
  });
});
