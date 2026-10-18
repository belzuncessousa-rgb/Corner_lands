// Builds the game for itch.io (no server: saves stay in the browser) and
// packs it as corner-lands-itch.zip, with index.html at the top of the zip.
//   node scripts/build-itch.mjs
import { build } from 'vite';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

process.env.VITE_STATIC = '1';
const out = 'dist-itch';
await build({ build: { outDir: out, emptyOutDir: true }, logLevel: 'warn' });

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!name.endsWith('.md')) files.push(p);
  }
};
walk(out);

// A plain zip writer: each file deflated, then the central directory.
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
const chunks = [];
const central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(relative(out, f).split('\\').join('/'));
  const data = readFileSync(f);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, name, packed);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0, 8);
  c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime, 12);
  c.writeUInt16LE(dosDate, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(packed.length, 20);
  c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += local.length + name.length + packed.length;
}
const dir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(dir.length, 12);
end.writeUInt32LE(offset, 16);
writeFileSync('corner-lands-itch.zip', Buffer.concat([...chunks, dir, end]));
console.log(`corner-lands-itch.zip: ${files.length} files, ${(offset / 1024).toFixed(0)} KB`);
