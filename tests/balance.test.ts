import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR } from '../src/game/data';
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
    // The castle crowns the late game: most maps get there within twelve years.
    expect(results.filter((r) => r.cityYear !== null).length).toBeGreaterThanOrEqual(2);
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

describe('first hours', () => {
  // Slow: FUNNEL=1. A new player follows the objectives: the autoplayer builds
  // and a "student" does each teaching step as soon as it is shown.
  it.runIf(process.env.FUNNEL)('objectives never stall a new player', { timeout: 600000 }, async () => {
    const { act, tryPlace, zoneSpot } = await import('../src/game/autoplay');
    const { activeQuests, QUESTS } = await import('../src/game/quests');
    const { startUpgrade, upgradeBlocker } = await import('../src/game/levels');
    const { placeZone, setKeep, setPriority, setYard, stepDay } = await import('../src/game/sim');
    const when: Record<string, number[]> = {};
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const s = generateWorld(seed);
      let r = seed;
      const rand = () => {
        r = (r * 1103515245 + 12345) & 0x7fffffff;
        return r / 0x7fffffff;
      };
      const student = () => {
        for (const q of activeQuests(s, 3)) {
          if (q.id === 'workers') {
            const b = s.buildings.find((x) => x.type === 'woodcutter' && x.build >= 1);
            if (b) setPriority(s, b, 2);
          } else if (q.id === 'targets') setKeep(s, 'wood', 200);
          else if (q.id === 'garden') tryPlace(s, 'garden');
          else if (q.id === 'yard') {
            const h = s.buildings.find((x) => x.type === 'house' && x.build >= 1);
            if (h) setYard(s, h, 'veg');
          } else if (q.id === 'herd') {
            const y = s.buildings.find((x) => x.type === 'byre' && x.build >= 1);
            if (!y) tryPlace(s, 'byre');
            else if (!s.buildings.some((x) => x.type === 'pasture' && x.owner === y.id)) {
              const spot = zoneSpot(s, 'pasture', y, [[5, 5], [4, 5], [4, 4], [3, 4]]);
              if (spot) placeZone(s, 'pasture', spot.x, spot.y, spot.x + spot.w - 1, spot.y + spot.h - 1);
            }
          } else if (q.id === 'upgrade') {
            for (const h of s.buildings) if (h.type === 'house' && !upgradeBlocker(s, h)) startUpgrade(s, h);
          } else if (q.id === 'orchard') {
            const o = s.buildings.find((x) => x.type === 'orchardist' && x.build >= 1);
            if (!o) tryPlace(s, 'orchardist');
            else {
              const spot = zoneSpot(s, 'orchard', o, [[3, 3], [3, 2], [2, 3], [2, 2]]);
              if (spot) placeZone(s, 'orchard', spot.x, spot.y, spot.x + spot.w - 1, spot.y + spot.h - 1);
            }
          }
        }
      };
      const done = new Set<string>();
      for (let d = 0; d < 6 * DAYS_PER_YEAR; d++) {
        if (d % 5 === 0) {
          act(s, rand);
          student();
        }
        stepDay(s);
        for (const q of s.quests) if (!done.has(q)) {
          done.add(q);
          (when[q] ??= []).push(s.day);
        }
      }
    }
    // Minutes of play at normal speed (45 a year), median over the maps.
    const minutes = (day: number) => Math.round((day / DAYS_PER_YEAR) * 45);
    let prev = 0;
    const slow: string[] = [];
    for (const q of QUESTS) {
      const t = (when[q.id] ?? []).sort((a, b) => a - b);
      const med = t.length ? t[Math.floor(t.length / 2)] : null;
      const step = med === null ? null : minutes(med) - prev;
      if (med !== null) prev = Math.max(prev, minutes(med));
      console.log(`${q.id.padEnd(11)} ${t.length}/${seeds.length} maps · ${med === null ? 'never' : `${minutes(med)} min`}${step && step > 10 ? `  (+${step} min after the previous)` : ''}`);
      if (q.id === 'town' && t.length < seeds.length) slow.push(`${q.id} reached on ${t.length} maps`);
    }
    expect(slow).toEqual([]);
  });
});
