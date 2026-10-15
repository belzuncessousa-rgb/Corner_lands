/**
 * Save storage. Uses the game server's REST API when it is available and
 * falls back to browser localStorage (e.g. when served statically).
 */

export interface SaveInfo {
  slot: string;
  updated: number;
  summary: string;
  where: 'server' | 'local';
  /** A small picture of the town (PNG data URL), when the save has one. */
  thumb?: string;
}

/** Only small PNG pictures are accepted as save thumbnails. */
export function validThumb(t: unknown): string | undefined {
  return typeof t === 'string' && t.startsWith('data:image/png;base64,') && t.length < 60000 && /^[A-Za-z0-9+/=]*$/.test(t.slice(22)) ? t : undefined;
}

const LOCAL_PREFIX = 'cornerlands.save.';
let serverOk: boolean | null = null;

async function server(): Promise<boolean> {
  if (serverOk !== null) return serverOk;
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
    serverOk = r.ok && (await r.json()).ok === true;
  } catch {
    serverOk = false;
  }
  return serverOk;
}

export function sanitizeSlot(slot: string): string {
  return (
    slot
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'save'
  );
}

export async function saveGame(slot: string, data: string, summary: string, thumb?: string): Promise<'server' | 'local'> {
  slot = sanitizeSlot(slot);
  const payload = JSON.stringify({ summary, updated: Date.now(), thumb: validThumb(thumb), data });
  if (await server()) {
    try {
      const r = await fetch(`/api/saves/${slot}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (r.ok) return 'server';
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(LOCAL_PREFIX + slot, payload);
  } catch {
    throw new Error('Could not save: browser storage is unavailable or full.');
  }
  return 'local';
}

export async function loadGame(slot: string, where: 'server' | 'local'): Promise<string> {
  slot = sanitizeSlot(slot);
  if (where === 'server') {
    const r = await fetch(`/api/saves/${slot}`);
    if (!r.ok) throw new Error('Save not found');
    return ((await r.json()) as { data: string }).data;
  }
  const raw = localStorage.getItem(LOCAL_PREFIX + slot);
  if (!raw) throw new Error('Save not found');
  return (JSON.parse(raw) as { data: string }).data;
}

export async function deleteSave(slot: string, where: 'server' | 'local'): Promise<void> {
  slot = sanitizeSlot(slot);
  if (where === 'server') {
    await fetch(`/api/saves/${slot}`, { method: 'DELETE' });
  } else {
    try {
      localStorage.removeItem(LOCAL_PREFIX + slot);
    } catch {
      /* ignore */
    }
  }
}

export async function listSaves(): Promise<SaveInfo[]> {
  const out: SaveInfo[] = [];
  if (await server()) {
    try {
      const r = await fetch('/api/saves');
      if (r.ok) {
        const list = (await r.json()) as { slot: string; updated: number; summary: string; thumb?: string }[];
        for (const s of list) out.push({ ...s, thumb: validThumb(s.thumb), where: 'server' });
      }
    } catch {
      /* ignore */
    }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LOCAL_PREFIX)) continue;
      try {
        const v = JSON.parse(localStorage.getItem(key) || '{}') as { summary?: string; updated?: number; thumb?: string };
        out.push({ slot: key.slice(LOCAL_PREFIX.length), updated: v.updated ?? 0, summary: v.summary ?? '', where: 'local', thumb: validThumb(v.thumb) });
      } catch {
        /* skip corrupt */
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out.sort((a, b) => b.updated - a.updated);
}
