import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/game/world';
import { playBot } from '../src/game/autoplay';

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

  // Slow: run with SWEEP=1 after changing the economy or the autoplayer.
  it.runIf(process.env.SWEEP)('every one of ten maps reaches Town within six years', { timeout: 300000 }, () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rep = playBot(generateWorld(seed), 6, seed);
      console.log(`seed ${seed}: village ${rep.villageYear?.toFixed(1)} town ${rep.townYear?.toFixed(1)} borough ${rep.boroughYear?.toFixed(1)}`);
      expect(rep.townYear, `seed ${seed}`).not.toBeNull();
    }
  });
});
