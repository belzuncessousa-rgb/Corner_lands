// @vitest-environment node
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let proc: ChildProcess;
let base = '';
let dir = '';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cl-saves-'));
  // Under load the server can be slow to start, or a random port may be taken:
  // poll its health, and try another port if it exits.
  for (let attempt = 0; attempt < 3 && !base; attempt++) {
    const port = 3900 + Math.floor(Math.random() * 500);
    const url = `http://localhost:${port}`;
    proc = spawn('node', ['server/index.mjs'], { env: { ...process.env, PORT: String(port), SAVES_DIR: dir } });
    let exited = false;
    proc.on('exit', () => (exited = true));
    for (let t = 0; t < 150 && !exited; t++) {
      try {
        if ((await fetch(`${url}/api/health`)).ok) {
          base = url;
          break;
        }
      } catch {
        /* not listening yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!base) proc.kill();
  }
  if (!base) throw new Error('server did not start');
}, 60000);

afterAll(() => {
  proc?.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe('save server', () => {
  it('reports health', async () => {
    const r = await fetch(`${base}/api/health`);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('lists a small PNG thumbnail but nothing else in its place', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    await fetch(`${base}/api/saves/with-thumb`, { method: 'PUT', body: JSON.stringify({ summary: 'Town', updated: 5, thumb: png, data: 'x' }) });
    await fetch(`${base}/api/saves/bad-thumb`, { method: 'PUT', body: JSON.stringify({ summary: 'Town', updated: 6, thumb: 'javascript:alert(1)', data: 'x' }) });
    const list = (await (await fetch(`${base}/api/saves`)).json()) as { slot: string; thumb?: string }[];
    expect(list.find((s) => s.slot === 'with-thumb')?.thumb).toBe(png);
    expect(list.find((s) => s.slot === 'bad-thumb')?.thumb).toBeUndefined();
    await fetch(`${base}/api/saves/with-thumb`, { method: 'DELETE' });
    await fetch(`${base}/api/saves/bad-thumb`, { method: 'DELETE' });
  });

  it('stores, lists, loads and deletes saves', async () => {
    const body = JSON.stringify({ summary: 'Hamlet', updated: 123, data: 'abc' });
    expect((await fetch(`${base}/api/saves/slot-1`, { method: 'PUT', body })).status).toBe(200);
    const list = await (await fetch(`${base}/api/saves`)).json();
    expect(list).toEqual([{ slot: 'slot-1', updated: 123, summary: 'Hamlet' }]);
    const save = await (await fetch(`${base}/api/saves/slot-1`)).json();
    expect(save.data).toBe('abc');
    await fetch(`${base}/api/saves/slot-1`, { method: 'DELETE' });
    expect((await fetch(`${base}/api/saves/slot-1`)).status).toBe(404);
  });

  it('rejects bad slot names and bodies', async () => {
    expect((await fetch(`${base}/api/saves/..%2Fetc`, { method: 'PUT', body: '{}' })).status).toBe(400);
    expect((await fetch(`${base}/api/saves/ok`, { method: 'PUT', body: 'not json' })).status).toBe(400);
    expect((await fetch(`${base}/api/saves/ok`, { method: 'PUT', body: '{"data":1}' })).status).toBe(400);
  });

  it('does not serve files outside the client build', async () => {
    const r = await fetch(`${base}/..%2Fpackage.json`);
    const text = await r.text();
    expect(text).not.toContain('"devDependencies"');
  });
});
