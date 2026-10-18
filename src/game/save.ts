import { BUILDINGS } from './data';
import type { Building, BuildingType, GameState, ResourceId } from './types';
import { mulberry32 } from './rng';
import { emptyResources, makeBuilding, placeBuilding, seedNature } from './world';

const TYPED_KEYS = [
  'terrain',
  'trees',
  'rock',
  'ore',
  'berries',
  'berriesMax',
  'fertility',
  'road',
  'occ',
  'variant',
] as const;

function toB64(arr: ArrayBufferView): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromB64(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serialize(s: GameState): string {
  const plain: Record<string, unknown> = { ...s };
  for (const k of TYPED_KEYS) plain[k] = toB64(s[k]);
  return JSON.stringify(plain);
}

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const s = raw as unknown as GameState;
  for (const k of TYPED_KEYS) {
    const bytes = fromB64(raw[k] as string);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (k === 'fertility') s.fertility = new Float32Array(buf);
    else if (k === 'occ') s.occ = new Int32Array(buf);
    else (s as unknown as Record<string, Uint8Array>)[k] = new Uint8Array(buf);
  }
  s.res = { ...emptyResources(), ...s.res };
  // Oats are no longer grown: oat fields go to wheat, and the oats in store to grain.
  for (const b of s.buildings) if (b.type === 'field' && b.recipe === 'oats') b.recipe = 'wheat';
  if (s.res.oats > 0) {
    s.res.grain += s.res.oats;
    s.res.oats = 0;
  }
  // Older lands had no herds, shoals or mushrooms: give them some, around the manor.
  if (!s.herds) {
    const hall = s.buildings.find((b) => b.type === 'townhall');
    seedNature(s, hall ? { x: hall.x, y: hall.y } : { x: s.width >> 1, y: s.height >> 1 }, mulberry32(s.seed + 404), false);
  }
  s.history ??= [];
  // Version 2 brought wooden churches: the churches already built were stone.
  // The manor stopped storing goods too: a town that kept its food or
  // materials there is given a granary or a storehouse beside it.
  if ((s.version ?? 1) < 2) {
    const manor = s.buildings.find((b) => b.type === 'townhall' && b.build >= 1);
    if (manor) for (const type of ['granary', 'storehouse'] as const) if (!s.buildings.some((b) => b.type === type)) giveStore(s, manor, type);
    for (const b of s.buildings) if (b.type === 'church') b.level = Math.max(b.level, 2);
    s.version = 2;
  }
  if (s.exports) {
    for (const k in s.exports) {
      const id = k as ResourceId;
      (s.targets ??= {})[id] = s.exports[id]!;
      (s.sell ??= {})[id] = true;
    }
    delete s.exports;
  }
  // Older saves ranked the settlement by population; carry that over to the manor.
  const hall = s.buildings.find((b) => b.type === 'townhall');
  if (hall) hall.level = Math.max(hall.level, s.tier + 1);
  for (const b of s.buildings) {
    if (b.type === 'house' && b.level >= 2) b.level = Math.min(b.level, 3);
    // The manor now stops at the Stone Manor (4x4): keeps and castles step down.
    if (b.type === 'townhall' && (b.level > 3 || (b.upgrading ?? 0) > 3)) {
      if (b.upgrading) {
        b.upgrading = undefined;
        b.upProgress = undefined;
        b.need = undefined;
      }
      b.level = Math.min(b.level, 3);
      if (b.w > 4) {
        for (let y = b.y; y < b.y + b.h; y++)
          for (let x = b.x; x < b.x + b.w; x++) if (x >= b.x + 4 || y >= b.y + 4) s.occ[y * s.width + x] = -1;
        b.w = 4;
        b.h = 4;
      }
    }
    // Workplaces are no longer expanded.
    if (b.type !== 'house' && b.type !== 'townhall' && b.type !== 'market' && b.type !== 'church') {
      if (b.level > 1) b.level = 1;
      if (b.upgrading && !b.craftTo) {
        b.upgrading = undefined;
        b.upProgress = undefined;
        b.need = undefined;
      }
    }
  }
  // Farms used to be 4x4 with their own field; they are now a farmstead
  // with fields drawn beside it.
  for (const b of [...s.buildings]) {
    if (b.type !== 'farm' || b.w !== 4) continue;
    b.w = 2;
    b.h = 2;
    for (const [x, y, w, h] of [
      [b.x + 2, b.y, 2, 2],
      [b.x, b.y + 2, 4, 2],
    ]) {
      const f = makeBuilding(s.nextId++, 'field', x, y);
      f.w = w;
      f.h = h;
      f.build = 1;
      f.growth = b.growth;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) s.occ[yy * s.width + xx] = f.id;
      s.buildings.push(f);
    }
    b.growth = 0;
  }
  s.dirty = true;
  return s;
}

/** Places a finished store of a type on clear ground near a building (for old saves). */
function giveStore(s: GameState, near: Building, type: BuildingType): void {
  const d = BUILDINGS[type];
  for (let r = 1; r < 14; r++) {
    for (let y = near.y - r - d.h; y <= near.y + near.h + r; y++) {
      for (let x = near.x - r - d.w; x <= near.x + near.w + r; x++) {
        let ok = x >= 1 && y >= 1 && x + d.w < s.width - 1 && y + d.h < s.height - 1;
        for (let yy = y; ok && yy < y + d.h; yy++)
          for (let xx = x; ok && xx < x + d.w; xx++) {
            const i = yy * s.width + xx;
            if (s.occ[i] >= 0 || s.terrain[i] || s.road[i] || s.rock[i] || s.ore[i]) ok = false;
          }
        if (!ok) continue;
        const b = makeBuilding(s.nextId++, type, x, y);
        b.build = 1;
        placeBuilding(s, b);
        return;
      }
    }
  }
}
