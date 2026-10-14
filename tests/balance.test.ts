import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/game/world';
import { playBot } from './bot';

describe('balance', () => {
  it('a simple strategy grows from Hamlet to Borough', { timeout: 60000 }, () => {
    const results = [101, 202, 303].map((seed) => {
      const s = generateWorld(seed);
      const rep = playBot(s, 12, seed);
      if (process.env.BALANCE_LOG) console.log(`seed ${seed}\n${rep.log.join('\n')}\n`, rep);
      return rep;
    });
    for (const r of results) {
      expect(r.villageYear).not.toBeNull();
      expect(r.villageYear!).toBeLessThan(5);
    }
    // Every map reaches Town; the crude bot should reach Borough on most.
    for (const r of results) expect(r.townYear).not.toBeNull();
    expect(results.filter((r) => r.boroughYear !== null).length).toBeGreaterThanOrEqual(2);
  });
});
