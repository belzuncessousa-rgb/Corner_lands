import { BUILDINGS } from './data';
import { deliveredTo, demolish, recompute, store, zoneCost } from './sim';
import type { Building, Cost, GameState, ResourceId } from './types';
import { idx, placeBuilding } from './world';

/**
 * A short grace period after placing or demolishing: the last action can be
 * taken back in full. Steps hold closures and are never saved.
 */
export interface UndoStep {
  /** What the button says, e.g. "Undo placing Bakery". */
  label: string;
  /** Takes the action back; returns why it cannot, or null. */
  revert: (s: GameState) => string | null;
}

/** Records a placement (a building site or a drawn field, pasture or orchard). */
export function undoPlacement(b: Building): UndoStep {
  const d = BUILDINGS[b.type];
  const paid: Cost = d.zone ? zoneCost(b.type, b.w, b.h) : { gold: d.cost.gold ?? 0 };
  return {
    label: `Undo placing ${d.name}`,
    revert: (s) => {
      const o = s.buildings.find((x) => x.id === b.id);
      if (!o) return 'It is already gone';
      if (!d.zone && o.build >= 1) return 'It is already built';
      // What builders carried over goes back to the stores, the rest of the cost too.
      const back = d.zone ? {} : deliveredTo(o);
      s.res.gold += paid.gold ?? 0;
      for (const k in paid) if (k !== 'gold') store(s, k as ResourceId, paid[k as ResourceId] ?? 0);
      for (const k in back) store(s, k as ResourceId, back[k as ResourceId] ?? 0);
      removeQuietly(s, o);
      return null;
    },
  };
}

/** Several placements taken back together (a stretch of town wall). */
export function undoMany(steps: UndoStep[], label: string): UndoStep {
  return {
    label,
    revert: (s) => {
      let err: string | null = null;
      for (const st of steps) err = st.revert(s) ?? err;
      return err;
    },
  };
}

/** Demolishes a building and returns how to put it back exactly as it was. */
export function demolishWithUndo(s: GameState, b: Building): UndoStep | null {
  const before: Partial<Record<ResourceId, number>> = { ...s.res };
  const copy = structuredClone(b);
  if (!demolish(s, b)) return null;
  // The refund (and anything emptied into the stores) is taken back on undo.
  const refund: Partial<Record<ResourceId, number>> = {};
  for (const k in s.res) {
    const id = k as ResourceId;
    const d = s.res[id] - (before[id] ?? 0);
    if (d > 0) refund[id] = d;
  }
  return {
    label: `Undo demolishing ${BUILDINGS[copy.type].name}`,
    revert: (st) => {
      for (let y = copy.y; y < copy.y + copy.h; y++) {
        for (let x = copy.x; x < copy.x + copy.w; x++) {
          const i = idx(st, x, y);
          if (st.occ[i] >= 0 || st.road[i]) return 'Something stands there now';
        }
      }
      for (const k in refund) if (st.res[k as ResourceId] < (refund[k as ResourceId] ?? 0) - 1e-6) return 'The refund has already been spent';
      for (const k in refund) st.res[k as ResourceId] -= refund[k as ResourceId] ?? 0;
      placeBuilding(st, copy);
      recompute(st);
      return null;
    },
  };
}

function removeQuietly(s: GameState, b: Building): void {
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) s.occ[idx(s, x, y)] = -1;
  s.buildings = s.buildings.filter((o) => o !== b);
  recompute(s);
}
