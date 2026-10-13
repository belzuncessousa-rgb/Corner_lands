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
  const port = 3900 + Math.floor(Math.random() * 500);
  base = `http://localhost:${port}`;
  proc = spawn('node', ['server/index.mjs'], { env: { ...process.env, PORT: String(port), SAVES_DIR: dir } });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 5000);
    proc.stdout!.on('data', () => {
      clearTimeout(t);
      resolve();
    });
  });
});

afterAll(() => {
  proc?.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe('save server', () => {
  it('reports health', async () => {
    const r = await fetch(`${base}/api/health`);
    expect(await r.json()).toEqual({ ok: true });
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
