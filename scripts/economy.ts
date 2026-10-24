/**
 * The economy on paper: for every workplace, what one fully staffed building
 * makes in a year and the coins its work adds per worker (outputs less
 * inputs, fuel and the tools and wood parts it wears), with the slowdowns
 * measured in play (walking, mood, errands). Run: npx -y tsx scripts/economy.ts
 */
import { BUILDINGS, GOODS, UPKEEP, GATHERERS, DAYS_PER_YEAR } from '../src/game/data';
import { UNLOCKS } from '../src/game/unlocks';
const price = (id: string) => (GOODS as any)[id]?.price ?? 0;
const val = (c: Record<string, number> = {}) => Object.entries(c).reduce((a, [k, v]) => a + v * price(k), 0);
/** Mood, learning, errands and worn gear, as measured in play. */
const OTHER = 0.85;
const know = (t: string) => { const u = UNLOCKS.find((u) => u.building === t); return u ? (u.knowledge ? `K${u.knowledge}` : `rank${u.rank}`) : 'start'; };
const rows: string[] = [];
for (const d of Object.values(BUILDINGS) as any[]) {
  if (!d.cycle || !d.workers) continue;
  const eff = GATHERERS.has(d.type) ? 0.65 : 0.8;
  const recs = d.recipes ?? [{ id: '-', inputs: d.inputs, outputs: d.outputs, months: d.months }];
  for (const r of recs) {
    const months = (r.months ?? d.months ?? Array(12).fill(0)).length;
    const cycles = (DAYS_PER_YEAR * months / 12 / d.cycle) * eff * OTHER;
    const fuel = (r.fuel ?? d.fuel ?? 0) * cycles * price('firewood');
    const up = val(UPKEEP[d.type as keyof typeof UPKEEP] as any) * 12;
    const out = Object.entries(r.outputs).map(([k, v]) => `${Math.round((v as number) * cycles)} ${k}`).join(', ');
    const inp = Object.entries(r.inputs ?? {}).map(([k, v]) => `${Math.round((v as number) * cycles)} ${k}`).join(', ');
    const added = (val(r.outputs) - val(r.inputs)) * cycles - fuel - up;
    rows.push([d.type + (r.id !== '-' ? ':' + r.id : ''), 't' + d.tier, know(d.type), 'crew ' + d.workers, 'mo ' + months, 'OUT/yr ' + out, inp ? 'IN ' + inp : '', 'coins/worker ' + Math.round(added / d.workers)].join(' | '));
  }
}
console.log(rows.join('\n'));
