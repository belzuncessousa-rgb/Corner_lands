// Corner Lands game server: serves the built client and stores save games.
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const SAVES = resolve(process.env.SAVES_DIR || join(ROOT, 'saves'));
const PORT = Number(process.env.PORT || 3001);
const MAX_BODY = 8 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const SLOT_RE = /^[a-z0-9_-]{1,40}$/;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') return send(res, 200, { ok: true });
  if (url.pathname === '/api/saves' && req.method === 'GET') {
    await mkdir(SAVES, { recursive: true });
    const files = (await readdir(SAVES)).filter((f) => f.endsWith('.json'));
    const list = [];
    for (const f of files) {
      try {
        const meta = JSON.parse(await readFile(join(SAVES, f), 'utf8'));
        list.push({ slot: f.slice(0, -5), updated: meta.updated ?? 0, summary: meta.summary ?? '' });
      } catch {
        /* skip unreadable save */
      }
    }
    list.sort((a, b) => b.updated - a.updated);
    return send(res, 200, list);
  }
  const m = url.pathname.match(/^\/api\/saves\/([^/]+)$/);
  if (m) {
    const slot = decodeURIComponent(m[1]);
    if (!SLOT_RE.test(slot)) return send(res, 400, { error: 'bad slot name' });
    const file = join(SAVES, `${slot}.json`);
    if (req.method === 'GET') {
      try {
        return send(res, 200, await readFile(file, 'utf8'));
      } catch {
        return send(res, 404, { error: 'not found' });
      }
    }
    if (req.method === 'PUT') {
      let body;
      try {
        body = await readBody(req);
        const parsed = JSON.parse(body);
        if (typeof parsed.data !== 'string') throw new Error('missing data');
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
      await mkdir(SAVES, { recursive: true });
      await writeFile(file, body);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await rm(file, { force: true });
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

async function handleStatic(req, res, url) {
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) return send(res, 403, 'forbidden', 'text/plain');
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
  } catch {
    file = join(DIST, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': file.includes(`${join(DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch {
    send(res, 404, 'Build the client first: npm run build', 'text/plain');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Corner Lands running at http://localhost:${PORT}`);
});
