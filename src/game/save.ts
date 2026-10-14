import type { GameState } from './types';
import { emptyResources } from './world';

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
  s.history ??= [];
  // Older saves ranked the settlement by population; carry that over to the manor.
  const hall = s.buildings.find((b) => b.type === 'townhall');
  if (hall) hall.level = Math.max(hall.level, s.tier + 1);
  for (const b of s.buildings) {
    if (b.type === 'house' && b.level >= 2) b.level = Math.min(b.level, 3);
  }
  s.dirty = true;
  return s;
}
