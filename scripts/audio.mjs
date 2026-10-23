// node scripts/audio.mjs
//
// Turns the recordings in audio-src/ into the small files the game plays,
// in public/audio/, and writes public/audio/manifest.json.
//
// - Every file is brought to the same loudness for its kind (music, beds,
//   calls, interface), so nothing jumps out and the mix is set in code.
// - Long recordings get a list of the stretches where something is heard,
//   so a call played from them never lands on silence.
// - Music is every file in audio-src/music/, in name order.
//
// The recordings themselves are kept on the repository's `master` branch
// (sound effects in its Abience/, animals/, town/ and UI/ folders, music at
// its top level); run with --fetch to copy them into audio-src/ first.
//
// Needs ffmpeg and ffprobe on the PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const SRC = 'audio-src';
const OUT = 'public/audio';

/**
 * The sounds: id -> source file and kind.
 * - bed: a continuous loop, faded in and out with what the camera sees.
 * - call: short pieces played now and then from the busy stretches.
 * - ui: interface sounds, played whole.
 */
const SOUNDS = {
  birds: { src: 'birds.wav', kind: 'bed' },
  meadow: { src: '269559__vonora__sussex-woodland-meadow-bird-sounds-evening.mp3', kind: 'bed' },
  river: { src: 'mostly_river.wav', kind: 'bed' },
  lightrain: { src: 'light_rain.wav', kind: 'bed' },
  rain: { src: 'rain.wav', kind: 'bed' },
  wind: { src: 'winter_wind.mp3', kind: 'bed' },
  snowstorm: { src: 'snow_storm.wav', kind: 'bed' },
  village: { src: 'zoon_in_village_2.wav', kind: 'bed' },
  residential: { src: 'zoon_in_residential.wav', kind: 'bed' },
  tavern: { src: 'tavern_zoo_in.wav', kind: 'bed' },
  market: { src: 'market.wav', kind: 'bed' },
  street: { src: 'mix_hooves_noise.wav', kind: 'bed' },
  bees: { src: 'bees_cut_short_for_buildings.wav', kind: 'bed' },
  smithy: { src: 'blacksmith.wav', kind: 'bed' },
  stone: { src: 'stoneworks.wav', kind: 'bed' },
  building: { src: 'construction.wav', kind: 'bed' },
  owl: { src: 'ocasional_owl.wav', kind: 'call' },
  sheep: { src: 'sheep.wav', kind: 'call' },
  cattle: { src: 'cows.flac', kind: 'call' },
  goats: { src: 'goats.m4a', kind: 'call' },
  hens: { src: 'chicken.wav', kind: 'call' },
  ducks: { src: 'ducks.wav', kind: 'call' },
  dogs: { src: 'dogs.wav', kind: 'call' },
  dogs2: { src: 'dogs2.wav', kind: 'call' },
  chop: { src: 'woodcutters.wav', kind: 'ui' },
  bells: { src: 'change_season_bells.wav', kind: 'call' },
  click: { src: 'click.wav', kind: 'ui' },
  back: { src: 'click_close_or_back.wav', kind: 'ui' },
  open: { src: 'stone_building_open.wav', kind: 'ui' },
  charters: { src: 'science_screen.wav', kind: 'ui' },
};

/**
 * When each track plays: menu, day (spring and summer), autumn, winter or
 * festival. Matched by the start of the file name; unknown files play by day.
 */
const MOODS = [
  ['Menu', 'menu'],
  ['harvestseason', 'autumn'],
  ['Angevin', 'autumn'],
  ['alexander-nakarada-winter-night', 'winter'],
  ['alexander-nakarada-wintersong', 'winter'],
  ['celebrations', 'festival'],
  ['the-medieval-banquet', 'festival'],
];

/** Loudness each kind is brought to (LUFS), and how it is encoded. */
const KINDS = {
  music: { lufs: -18, args: ['-ac', '2', '-b:a', '128k'] },
  bed: { lufs: -23, args: ['-ac', '2', '-b:a', '96k'] },
  call: { lufs: -20, args: ['-ac', '1', '-b:a', '64k'] },
  ui: { peak: -3, args: ['-ac', '1', '-b:a', '64k'] },
};

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
/** ffmpeg's report, which it writes to stderr. */
const report = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;

/** Integrated loudness and true peak, from ffmpeg's EBU R128 meter. */
function loudness(file) {
  const log = report(['-i', file, '-af', 'ebur128=peak=true']);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const i = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1] ?? -70);
  const tp = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1] ?? 0);
  return { i, tp };
}

/** Peak level in dBFS, for clips too short to have a loudness. */
function peakOf(file) {
  return Number(/max_volume:\s+(-?[\d.]+) dB/.exec(report(['-i', file, '-af', 'volumedetect']))?.[1] ?? 0);
}

function duration(file) {
  return Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
}

/**
 * The stretches (in seconds) where something is heard: the level in
 * quarter-second windows, kept where it is within 18 dB of the loudest.
 */
function busyStretches(file) {
  const rate = 4000;
  const pcm = execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  const n = pcm.length >> 1;
  const win = rate / 4;
  const levels = [];
  for (let s = 0; s + win <= n; s += win) {
    let sum = 0;
    for (let k = 0; k < win; k++) {
      const v = pcm.readInt16LE((s + k) * 2) / 32768;
      sum += v * v;
    }
    levels.push(10 * Math.log10(sum / win + 1e-12));
  }
  const top = Math.max(...levels);
  const out = [];
  let start = -1;
  levels.forEach((l, k) => {
    const on = l > top - 18;
    if (on && start < 0) start = k;
    if ((!on || k === levels.length - 1) && start >= 0) {
      const end = on ? k + 1 : k;
      // Pad a little either side so a call is not clipped.
      if (end - start >= 2) out.push([Math.max(0, (start - 1) / 4), Math.min(levels.length, end + 1) / 4]);
      start = -1;
    }
  });
  return out;
}

function encode(src, dest, kind) {
  const k = KINDS[kind];
  let gain;
  if (k.peak !== undefined) {
    gain = k.peak - peakOf(src);
  } else {
    const { i, tp } = loudness(src);
    // Up to the target loudness, but never past -1 dBFS true peak.
    gain = Math.min(k.lufs - i, -1 - tp);
  }
  const filters = [`volume=${gain.toFixed(2)}dB`];
  // Interface clicks lose their leading silence.
  if (kind === 'ui') filters.unshift('silenceremove=start_periods=1:start_threshold=-50dB');
  // Beds loop in the game, so two and a half minutes of each is plenty.
  const trim = kind === 'bed' ? ['-t', '150'] : [];
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', src, ...trim, '-af', filters.join(','), '-ar', '44100', ...k.args, '-codec:a', 'libmp3lame', dest]);
  return gain;
}

if (process.argv.includes('--fetch')) {
  const files = run('git', ['ls-tree', '-r', '--name-only', 'origin/master']).split('\n').filter((f) => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f));
  for (const f of files) {
    const dir = f.includes('/') ? 'sfx' : 'music';
    mkdirSync(join(SRC, dir), { recursive: true });
    writeFileSync(join(SRC, dir, basename(f)), execFileSync('git', ['show', `origin/master:${f}`], { maxBuffer: 1 << 30 }));
  }
  console.log(`fetched ${files.length} recordings from origin/master`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'music'), { recursive: true });
const manifest = { sounds: {}, music: [] };

for (const [id, def] of Object.entries(SOUNDS)) {
  const src = join(SRC, 'sfx', def.src);
  if (!existsSync(src)) {
    console.warn(`missing ${src}`);
    continue;
  }
  const dest = join(OUT, `${id}.mp3`);
  const gain = encode(src, dest, def.kind);
  const entry = { file: `audio/${id}.mp3`, kind: def.kind, duration: Math.round(duration(dest) * 100) / 100 };
  if (def.kind === 'call') entry.busy = busyStretches(dest);
  manifest.sounds[id] = entry;
  console.log(`${id.padEnd(12)} ${def.kind.padEnd(5)} ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB  ${entry.duration}s${entry.busy ? `  ${entry.busy.length} busy stretches` : ''}`);
}

const tracks = existsSync(join(SRC, 'music')) ? readdirSync(join(SRC, 'music')).filter((f) => /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(f)).sort() : [];
for (const f of tracks) {
  const name = basename(f, extname(f));
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dest = join(OUT, 'music', `${slug}.mp3`);
  const gain = encode(join(SRC, 'music', f), dest, 'music');
  const mood = MOODS.find(([start]) => name.startsWith(start))?.[1] ?? 'day';
  manifest.music.push({ file: `audio/music/${slug}.mp3`, title: name, mood, duration: Math.round(duration(dest)) });
  console.log(`music ${mood.padEnd(8)} ${name}  ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${Object.keys(manifest.sounds).length} sounds, ${manifest.music.length} tracks`);
