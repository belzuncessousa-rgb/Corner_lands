// node scripts/audio.mjs [--fetch]
//
// Turns the recordings into the small files the game plays, in
// public/audio/, and writes public/audio/manifest.json.
//
// - Every file is brought to the same loudness for its kind (music, beds,
//   calls, interface), so nothing jumps out and the mix is set in code.
// - Long recordings get a list of the stretches where something is heard,
//   so a call played from them never lands on silence.
// - Short clips for looking into a building are cut from the busiest part
//   of its recording.
//
// The recordings themselves are kept on the repository's `master` branch;
// --fetch copies them into audio-src/ (same folders) first.
//
// Tracks marked `private` may not be shared as files (their licence allows
// them in the game, not in a public repository): they are encoded like the
// rest but .gitignore keeps them out of the repository, and the game skips
// them where they are missing.
//
// Needs ffmpeg and ffprobe on the PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = 'audio-src';
const OUT = 'public/audio';

/**
 * The sounds: id -> recording (its path on the master branch) and kind.
 * - bed: a continuous loop, faded in and out with what the camera sees.
 * - call: short pieces played now and then from the busy stretches.
 * - ui: interface and one-off sounds, played whole.
 */
const SOUNDS = {
  // Nature
  birds: { src: 'Abience/birds.wav', kind: 'bed' },
  meadow: { src: 'Abience/269559__vonora__sussex-woodland-meadow-bird-sounds-evening.mp3', kind: 'bed' },
  forest: { src: 'Abience/723913__magnesus__forest-birds-ambient-seamless-loop.wav', kind: 'bed' },
  river: { src: 'Abience/mostly_river.wav', kind: 'bed' },
  lightrain: { src: 'Abience/light_rain.wav', kind: 'bed' },
  rain: { src: 'Abience/rain.wav', kind: 'bed' },
  wind: { src: 'Abience/winter_wind.mp3', kind: 'bed' },
  autumnwind: { src: 'Abience/457318__stek59__autumn-wind-and-dry-leaves.wav', kind: 'bed' },
  snowstorm: { src: 'Abience/snow_storm.wav', kind: 'bed' },
  crickets: { src: 'Abience/320145__owlstorm__night-crickets-ambience-on-rural-property.wav', kind: 'bed' },
  owl: { src: 'Abience/ocasional_owl.wav', kind: 'call' },
  frogs: { src: 'animals/532235__shaunhillyard__frog-croaking-uk-common-frog.wav', kind: 'call' },
  // The town
  village: { src: 'town/zoon_in_village_2.wav', kind: 'bed' },
  residential: { src: 'town/zoon_in_residential.wav', kind: 'bed' },
  footsteps: { src: 'footstpes.wav', kind: 'bed' },
  tavern: { src: 'town/tavern.wav', kind: 'bed' },
  market: { src: 'town/market.wav', kind: 'bed' },
  street: { src: 'town/mix_hooves_noise.wav', kind: 'bed' },
  bees: { src: 'animals/bees_cut_short_for_buildings.wav', kind: 'bed' },
  smithy: { src: 'town/blacksmith.wav', kind: 'bed' },
  stone: { src: 'town/stoneworks.wav', kind: 'bed' },
  building: { src: 'town/construction.wav', kind: 'bed' },
  watermill: { src: 'town/water_mill_building_and_ocasional_city.wav', kind: 'bed' },
  sawing: { src: 'town/sawing_building_and_ocasional_city.wav', kind: 'call' },
  woodmill: { src: 'town/woodcutter_mill_building_and_ocasional_city.wav', kind: 'call' },
  treefall: { src: 'town/tree_falling_ocasional_city.wav', kind: 'call' },
  bells: { src: 'town/change_season_bells.wav', kind: 'call' },
  // Animals
  sheep: { src: 'animals/sheep.wav', kind: 'call' },
  cattle: { src: 'animals/cows.flac', kind: 'call' },
  cattle2: { src: 'animals/cow_mooing.wav', kind: 'call' },
  goats: { src: 'animals/goats.m4a', kind: 'call' },
  pigs: { src: 'animals/pig_snort.wav', kind: 'call' },
  hens: { src: 'animals/chicken.wav', kind: 'call' },
  hens2: { src: 'animals/more_chicken.wav', kind: 'call' },
  rooster: { src: 'animals/rooster_dawn.mp3', kind: 'call' },
  ducks: { src: 'animals/ducks.wav', kind: 'call' },
  dogs: { src: 'animals/dogs.wav', kind: 'call' },
  dogs2: { src: 'animals/dogs2.wav', kind: 'call' },
  // Effects
  chop: { src: 'town/woodcutters.wav', kind: 'ui' },
  coins: { src: 'town/coins_trade_taxes.wav', kind: 'ui' },
  demolish: { src: 'town/demolishing.wav', kind: 'ui' },
  click: { src: 'UI/click.wav', kind: 'ui' },
  back: { src: 'UI/click_close_or_back.wav', kind: 'ui' },
  open: { src: 'town/stone_building_open.wav', kind: 'ui' },
  charters: { src: 'UI/science_screen.wav', kind: 'ui' },
};

/**
 * Clips for looking into a building, cut from its trade's recording: id ->
 * recording and length in seconds. The game picks one by building type.
 */
const OPENS = {
  'open-smithy': ['town/blacksmith.wav', 2.5],
  'open-stone': ['town/stoneworks.wav', 2.5],
  'open-saw': ['town/sawing_building_and_ocasional_city.wav', 2.5],
  'open-watermill': ['town/water_mill_building_and_ocasional_city.wav', 3],
  'open-woodcutter': ['town/woodcutter_mill_building_and_ocasional_city.wav', 2.5],
  'open-tavern': ['town/tavern.wav', 3],
  'open-market': ['town/market.wav', 3],
  'open-home': ['town/zoon_in_residential.wav', 2.5],
  'open-bees': ['animals/bees.aiff', 2.5],
  'open-church': ['town/change_season_bells.wav', 3.5],
  'open-farm': ['animals/rooster_dawn.mp3', 2.5],
  'open-hens': ['animals/more_chicken.wav', 2.5],
  'open-cattle': ['animals/cow_mooing.wav', 2.5],
  'open-building': ['town/construction.wav', 2.5],
};

/**
 * The music, with what its licence asks to be credited. Mood: when it
 * plays (menu, day in spring and summer, autumn, winter, festival).
 */
const ALKAKRAB = { by: 'alkakrab', source: 'https://alkakrab04.wixsite.com/alkakrab-game-music', licence: 'alkakrab licence', private: true };
const MUSIC = [
  { src: 'Menu.mp3', id: 'teller-of-the-tales', title: 'Teller of the Tales', by: 'Kevin MacLeod', source: 'https://incompetech.com', licence: 'CC BY 4.0', mood: 'menu' },
  { src: 'Angevin.mp3', id: 'angevin', title: 'Angevin', by: 'Kevin MacLeod', source: 'https://incompetech.com', licence: 'CC BY 4.0', mood: 'autumn' },
  { src: 'Woodland Fantasy.mp3', id: 'woodland-fantasy', title: 'Woodland Fantasy', by: 'Matthew Pablo', source: 'https://opengameart.org/content/woodland-fantasy', licence: 'CC BY 3.0', mood: 'day' },
  { src: 'alexander-nakarada-village-ambiance.mp3', id: 'village-ambiance', title: 'Village Ambiance', by: 'Alexander Nakarada (CreatorChords)', source: 'https://creatorchords.com', licence: 'CC BY 4.0', mood: 'day' },
  { src: 'alexander-nakarada-wintersong.mp3', id: 'wintersong', title: 'Wintersong', by: 'Alexander Nakarada (CreatorChords)', source: 'https://creatorchords.com', licence: 'CC BY 4.0', mood: 'winter' },
  { src: 'alexander-nakarada-winter-night.mp3', id: 'winter-night', title: 'Winter Night', by: 'Alexander Nakarada (CreatorChords)', source: 'https://creatorchords.com', licence: 'CC BY-SA 4.0', mood: 'winter' },
  { src: 'the-medieval-banquet.mp3', id: 'the-medieval-banquet', title: 'The Medieval Banquet', by: 'Shane Ivers', source: 'https://www.silvermansound.com', licence: 'CC BY 4.0', mood: 'festival' },
  {
    src: 'Marin_Marais_(1656-1728)_-_Excerpts_from_Suite_No.3_from_Pieces_en_trio_pour_les_flutes,_violon,_et_dessus_de_viole_(1692).ogg',
    id: 'marais-pieces-en-trio',
    title: 'Marais, Suite No. 3 from Pièces en trio (1692)',
    by: 'New Comma Baroque (Matthew C. Cataldi, Leighann Daihl, Phillip W. Serna, Emily J. Morlan)',
    source: 'https://commons.wikimedia.org/wiki/File:Marin_Marais_(1656-1728)_-_Excerpts_from_Suite_No.3_from_Pieces_en_trio_pour_les_flutes,_violon,_et_dessus_de_viole_(1692).ogg',
    licence: 'CC BY-SA 3.0',
    mood: 'day',
  },
  {
    src: 'summer.ogg',
    id: 'dowland-whitehead-almand',
    title: 'Dowland, M. George Whitehead his Almand',
    by: 'Phillip W. Serna, viols',
    source: 'https://commons.wikimedia.org/wiki/File:John_Dowland_(1563-1626)_-_M._George_Whitehead_His_Almand,_Lachrimae,_No.21_for_Treble,_Tenor_%26_Bass_Viols_with_Great_Bass_Violone_in_G_1604.ogg',
    licence: 'CC BY-SA 4.0',
    mood: 'day',
  },
  { src: 'Chopin,_Nocturne_op_32_no_1.ogg', id: 'chopin-nocturne-op32-1', title: 'Chopin, Nocturne Op. 32 No. 1', by: 'Constantin Stephan', source: 'https://commons.wikimedia.org/wiki/File:Chopin,_Nocturne_op_32_no_1.ogg', licence: 'CC BY-SA 4.0', mood: 'winter' },
  { src: 'O_frondens.ogg', id: 'o-frondens', title: 'Hildegard von Bingen, O frondens', by: 'Magdalen Kadel', source: 'https://commons.wikimedia.org/wiki/File:O_frondens.ogg', licence: 'CC BY-SA 3.0', mood: 'winter' },
  // Credits to come: the sources of these four are still to be noted.
  { src: 'harvestseason.mp3', id: 'harvest-season', title: 'Harvest Season', by: '', source: '', licence: '', mood: 'autumn' },
  { src: 'music_peaceful_town_loop.mp3', id: 'peaceful-town', title: 'Peaceful Town', by: '', source: '', licence: '', mood: 'day' },
  { src: '022815townbgm.ogg', id: 'town-theme', title: 'Town', by: '', source: '', licence: '', mood: 'day' },
  { src: 'celebrations_1min.mp3', id: 'celebrations', title: 'Celebrations', by: '', source: '', licence: '', mood: 'festival' },
  { src: 'Medieval Vol. 2 1.ogg', id: 'alkakrab-knight-in-a-tavern', title: 'Knight In A Tavern', ...ALKAKRAB, mood: 'festival' },
  { src: 'Medieval Vol. 2 2.ogg', id: 'alkakrab-drunken-king', title: 'Drunken King', ...ALKAKRAB, mood: 'festival' },
  { src: 'Medieval Vol. 2 3.ogg', id: 'alkakrab-morning-in-a-castle', title: 'Morning In A Castle', ...ALKAKRAB, mood: 'day' },
  { src: 'Medieval Vol. 2 4.ogg', id: 'alkakrab-hunters-in-the-forest', title: 'Hunters In The Forest', ...ALKAKRAB, mood: 'autumn' },
  { src: 'Medieval Vol. 2 5.ogg', id: 'alkakrab-sacred-rivers', title: 'Sacred Rivers', ...ALKAKRAB, mood: 'day' },
  { src: 'Medieval Vol. 2 6.ogg', id: 'alkakrab-tournier-of-the-knights', title: 'Tournier Of The Knights', ...ALKAKRAB, mood: 'festival' },
  { src: 'Medieval Vol. 2 7.ogg', id: 'alkakrab-midnight-walk', title: 'Midnight Walk', ...ALKAKRAB, mood: 'winter' },
  { src: 'Medieval Vol. 2 8.ogg', id: 'alkakrab-stranger-in-town', title: 'Stranger In Town', ...ALKAKRAB, mood: 'autumn' },
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

/** A short clip from the busiest stretch of a recording, faded at both ends. */
function cutClip(src, dest, len) {
  const busy = busyStretches(src);
  const longest = busy.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0] ?? [0, len];
  const start = longest[0] + Math.max(0, (longest[1] - longest[0] - len) / 2);
  const tmp = `${dest}.wav`;
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-ss', String(start), '-t', String(len), '-i', src, '-af', `afade=t=in:d=0.08,afade=t=out:st=${len - 0.7}:d=0.7`, tmp]);
  encode(tmp, dest, 'ui');
  rmSync(tmp);
}

if (process.argv.includes('--fetch')) {
  const files = run('git', ['ls-tree', '-r', '--name-only', 'origin/master']).split('\n').filter((f) => /\.(mp3|wav|ogg|flac|m4a|aiff)$/i.test(f));
  for (const f of files) {
    mkdirSync(dirname(join(SRC, f)), { recursive: true });
    writeFileSync(join(SRC, f), execFileSync('git', ['show', `origin/master:${f}`], { maxBuffer: 1 << 30 }));
  }
  console.log(`fetched ${files.length} recordings from origin/master`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'music'), { recursive: true });
const manifest = { sounds: {}, music: [] };
const missing = [];

for (const [id, def] of Object.entries(SOUNDS)) {
  const src = join(SRC, def.src);
  if (!existsSync(src)) {
    missing.push(def.src);
    continue;
  }
  const dest = join(OUT, `${id}.mp3`);
  const gain = encode(src, dest, def.kind);
  const entry = { file: `audio/${id}.mp3`, kind: def.kind, duration: Math.round(duration(dest) * 100) / 100 };
  if (def.kind === 'call') entry.busy = busyStretches(dest);
  manifest.sounds[id] = entry;
  console.log(`${id.padEnd(12)} ${def.kind.padEnd(5)} ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB  ${entry.duration}s${entry.busy ? `  ${entry.busy.length} busy stretches` : ''}`);
}

for (const [id, [file, len]] of Object.entries(OPENS)) {
  const src = join(SRC, file);
  if (!existsSync(src)) {
    missing.push(file);
    continue;
  }
  const dest = join(OUT, `${id}.mp3`);
  cutClip(src, dest, len);
  manifest.sounds[id] = { file: `audio/${id}.mp3`, kind: 'ui', duration: Math.round(duration(dest) * 100) / 100 };
  console.log(`${id}`);
}

for (const m of MUSIC) {
  const src = join(SRC, m.src);
  if (!existsSync(src)) {
    missing.push(m.src);
    continue;
  }
  const dest = join(OUT, 'music', `${m.id}.mp3`);
  const gain = encode(src, dest, 'music');
  const { src: _src, id, ...about } = m;
  manifest.music.push({ file: `audio/music/${id}.mp3`, ...about, duration: Math.round(duration(dest)) });
  console.log(`music ${m.mood.padEnd(8)} ${m.title}  ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${Object.keys(manifest.sounds).length} sounds, ${manifest.music.length} tracks`);
if (missing.length) console.warn(`missing: ${missing.join(', ')}`);
