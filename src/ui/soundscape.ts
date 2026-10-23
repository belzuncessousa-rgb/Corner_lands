import { BUILDINGS } from '../game/data';
import { monthOf, seasonOf } from '../game/sim';
import type { Building, BuildingType, GameState, Season } from '../game/types';
import type { Agent } from '../render/agents';
import type { Renderer } from '../render/renderer';

/**
 * Everything the game sounds like, from the recordings in public/audio
 * (made by scripts/audio.mjs from audio-src/):
 *
 * - music: the tracks back to back, chosen by mood (menu, the season, a festival);
 * - ambience: birds, water, rain and wind, mixed by season, hour and weather;
 * - noise: the town and its animals, heard near where the camera looks;
 * - effects: clicks and the sounds of building.
 *
 * Music and the rest ("ambience": nature, town, animals and clicks) can
 * each be switched off from the button beside the date.
 */

export type Channel = 'music' | 'ambience' | 'noise' | 'effects';
/** How loud each channel sits in the mix. */
const MIX: Record<Channel, number> = { music: 0.6, ambience: 0.45, noise: 0.55, effects: 0.7 };

/** What the player has switched on. */
export interface SoundSwitches {
  music: boolean;
  ambience: boolean;
}

interface SoundEntry {
  file: string;
  kind: 'bed' | 'call' | 'ui';
  duration: number;
  busy?: [number, number][];
}
interface Track {
  file: string;
  title: string;
  mood: Mood;
  duration: number;
}
type Mood = 'menu' | 'day' | 'autumn' | 'winter' | 'festival';
interface Manifest {
  sounds: Record<string, SoundEntry>;
  music: Track[];
}

/** What the camera sees, gathered once a frame for the mix. */
export interface Scene {
  s: GameState;
  renderer: Renderer;
  agents: Agent[];
  selected: number | null;
  /** On the title screen (no town yet to listen to). */
  menu: boolean;
  running: boolean;
}

/**
 * How loud each bed sits in the mix at full presence. The recordings are
 * brought to the same loudness, so these set the balance between them.
 */
const BED_LEVEL: Record<string, number> = {
  birds: 0.55,
  meadow: 0.5,
  river: 0.6,
  lightrain: 0.7,
  rain: 0.7,
  wind: 0.55,
  snowstorm: 0.45,
  residential: 0.5,
  village: 0.45,
  tavern: 0.6,
  market: 0.55,
  street: 0.4,
  bees: 0.35,
  smithy: 0.5,
  stone: 0.5,
  building: 0.3,
};
const BED_CHANNEL: Record<string, Channel> = {
  birds: 'ambience',
  meadow: 'ambience',
  river: 'ambience',
  lightrain: 'ambience',
  rain: 'ambience',
  wind: 'ambience',
  snowstorm: 'ambience',
};

/** A looping recording played through two players that cross over, so the seam is never heard. */
class Bed {
  private els: HTMLAudioElement[] = [];
  private gains: GainNode[] = [];
  private cur = 0;
  private out: GainNode;
  level = 0;
  private playing = false;
  private fade = 3;

  constructor(
    private ac: AudioContext,
    src: string,
    dest: AudioNode,
  ) {
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    for (let k = 0; k < 2; k++) {
      const el = new Audio(src);
      el.preload = 'none';
      el.crossOrigin = 'anonymous';
      const g = ac.createGain();
      g.gain.value = 0;
      ac.createMediaElementSource(el).connect(g).connect(this.out);
      this.els.push(el);
      this.gains.push(g);
    }
  }

  /** Waiting for the first sound to arrive after starting; the fade-in begins then. */
  private waiting = false;

  /**
   * Eases towards the target level: in over two seconds, out over four, so
   * a river or a market drifts away instead of stopping. Starts or pauses
   * the players as needed.
   */
  update(target: number, dt: number): void {
    const now = this.ac.currentTime;
    if (target > 0.003 && !this.playing) {
      this.playing = true;
      this.waiting = true;
      this.level = 0;
      const el = this.els[this.cur];
      // Begin somewhere in the middle, so two visits never sound alike.
      if (el.duration > 10) el.currentTime = Math.random() * (el.duration - 10);
      this.gains[this.cur].gain.cancelScheduledValues(now);
      this.gains[this.cur].gain.setValueAtTime(1, now);
      el.addEventListener('playing', () => (this.waiting = false), { once: true });
      el.play().catch(() => {
        this.playing = false;
        this.waiting = false;
      });
    }
    if (!this.playing) return;
    if (!this.waiting) this.level += (target - this.level) * Math.min(1, dt / (target > this.level ? 2 : 4));
    if (Math.abs(this.level - target) < 0.001) this.level = target;
    this.out.gain.setTargetAtTime(this.level, now, 0.15);
    if (this.level <= 0.002 && target === 0 && !this.waiting) {
      this.playing = false;
      for (const e of this.els) e.pause();
      return;
    }
    // Cross over to the other player before this one runs out.
    const el = this.els[this.cur];
    if (el.duration && el.currentTime > el.duration - this.fade) {
      const next = 1 - this.cur;
      const n = this.els[next];
      n.currentTime = 0;
      n.play().catch(() => undefined);
      this.gains[next].gain.cancelScheduledValues(now);
      this.gains[next].gain.setValueAtTime(0, now);
      this.gains[next].gain.linearRampToValueAtTime(1, now + this.fade);
      this.gains[this.cur].gain.cancelScheduledValues(now);
      this.gains[this.cur].gain.setValueAtTime(1, now);
      this.gains[this.cur].gain.linearRampToValueAtTime(0, now + this.fade);
      const old = this.cur;
      setTimeout(() => this.els[old].pause(), this.fade * 1000 + 200);
      this.cur = next;
    }
  }

  /** Fades out over a second and a half, then stops. */
  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.level = 0;
    this.out.gain.setTargetAtTime(0, this.ac.currentTime, 0.4);
    setTimeout(() => {
      if (!this.playing) for (const e of this.els) e.pause();
    }, 1800);
  }
}

/** The music: tracks streamed one after another, crossing over when one ends or the mood changes. */
class MusicPlayer {
  private els: HTMLAudioElement[] = [];
  private gains: GainNode[] = [];
  private cur = 0;
  private track: Track | null = null;
  private mood: Mood | null = null;
  private recent: string[] = [];

  constructor(
    private ac: AudioContext,
    private tracks: Track[],
    dest: AudioNode,
  ) {
    for (let k = 0; k < 2; k++) {
      const el = new Audio();
      el.preload = 'auto';
      const g = ac.createGain();
      g.gain.value = 0;
      ac.createMediaElementSource(el).connect(g).connect(dest);
      this.els.push(el);
      this.gains.push(g);
    }
  }

  private pick(mood: Mood): Track | null {
    // Autumn mixes its own tracks with the summer ones; others keep to their mood.
    let pool = this.tracks.filter((t) => t.mood === mood);
    if (mood === 'autumn') pool = pool.concat(this.tracks.filter((t) => t.mood === 'day'));
    if (!pool.length) pool = this.tracks.filter((t) => t.mood === 'day');
    if (!pool.length) return null;
    const fresh = pool.filter((t) => !this.recent.includes(t.file));
    const from = fresh.length ? fresh : pool;
    const t = from[Math.floor(Math.random() * from.length)];
    this.recent = [...this.recent, t.file].slice(-Math.max(1, Math.floor(pool.length / 2)));
    return t;
  }

  private start(t: Track, fade: number): void {
    const now = this.ac.currentTime;
    const next = this.track ? 1 - this.cur : this.cur;
    const el = this.els[next];
    el.src = t.file;
    el.currentTime = 0;
    el.play().catch(() => undefined);
    this.gains[next].gain.cancelScheduledValues(now);
    this.gains[next].gain.setValueAtTime(0, now);
    this.gains[next].gain.linearRampToValueAtTime(1, now + fade);
    if (this.track && next !== this.cur) {
      const old = this.cur;
      this.gains[old].gain.cancelScheduledValues(now);
      this.gains[old].gain.setValueAtTime(this.gains[old].gain.value, now);
      this.gains[old].gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => this.els[old].pause(), fade * 1000 + 200);
    }
    this.cur = next;
    this.track = t;
  }

  update(mood: Mood): void {
    if (!this.tracks.length) return;
    const el = this.els[this.cur];
    // A new mood that matters (the menu, a festival, a new season) takes over in a few seconds.
    const urgent = this.mood !== null && mood !== this.mood && (mood === 'menu' || this.mood === 'menu' || mood === 'festival' || mood === 'winter' || this.mood === 'winter');
    if (!this.track || urgent) {
      this.mood = mood;
      const t = this.pick(mood);
      if (t) this.start(t, this.track ? 4 : 2);
      return;
    }
    this.mood = mood;
    if (el.duration && el.currentTime > el.duration - 4) {
      const t = this.pick(mood);
      if (t) this.start(t, 4);
    } else if (el.paused && el.ended) {
      const t = this.pick(mood);
      if (t) this.start(t, 1);
    }
  }

  pause(): void {
    for (const e of this.els) e.pause();
  }

  resume(): void {
    if (this.track) this.els[this.cur].play().catch(() => undefined);
  }

  /** On to another track of the same mood, crossing over in two seconds. */
  skip(): void {
    const t = this.pick(this.mood ?? 'day');
    if (t) this.start(t, 2);
  }

  get title(): string | null {
    return this.track ? (TRACK_NAMES[this.track.title] ?? this.track.title.replace(/[-_]+/g, ' ')) : null;
  }
}

/** Names to show for the music files. */
const TRACK_NAMES: Record<string, string> = {
  Menu: 'Teller of the Tales',
  Angevin: 'Angevin',
  'Woodland Fantasy': 'Woodland Fantasy',
  'alexander-nakarada-village-ambiance': 'Village Ambiance',
  'alexander-nakarada-winter-night': 'Winter Night',
  'alexander-nakarada-wintersong': 'Wintersong',
  'the-medieval-banquet': 'The Medieval Banquet',
  harvestseason: 'Harvest Season',
  celebrations_1min: 'Celebrations',
  music_peaceful_town_loop: 'Peaceful Town',
  summer: 'Summer',
  '022815townbgm': 'Town',
  'Marin_Marais_(1656-1728)_-_Excerpts_from_Suite_No.3_from_Pieces_en_trio_pour_les_flutes,_violon,_et_dessus_de_viole_(1692)': 'Marais, Pièces en trio',
};

/** Buildings whose work is heard nearby, by bed. */
const WORK_BEDS: Partial<Record<string, BuildingType[]>> = {
  smithy: ['smithy', 'armoury', 'bloomery', 'jeweller'],
  stone: ['quarry', 'stonemason', 'mine', 'silvermine'],
  market: ['market', 'markethall'],
  tavern: ['tavern'],
  bees: ['beekeeper'],
};

/** Houses that make a church; bells ring only once one stands. */
const BELL_TOWERS: BuildingType[] = ['church', 'monastery', 'cathedral', 'belltower'];

export class Soundscape {
  private master: GainNode;
  private bus: Record<Channel, GainNode>;
  private manifest: Manifest | null = null;
  private buffers = new Map<string, AudioBuffer | 'loading'>();
  private beds = new Map<string, Bed>();
  private music: MusicPlayer | null = null;
  private on: SoundSwitches;
  private timers: Record<string, number> = {};
  private lastSeason: Season | null = null;
  private lastSelected: number | null = null;
  private chopTimer = 0;

  constructor(
    private ac: AudioContext,
    on: SoundSwitches,
  ) {
    this.on = { ...on };
    this.master = ac.createGain();
    this.master.connect(ac.destination);
    this.bus = {} as Record<Channel, GainNode>;
    for (const id of Object.keys(MIX) as Channel[]) {
      const g = ac.createGain();
      g.gain.value = MIX[id] * (this.isOn(id) ? 1 : 0);
      g.connect(this.master);
      this.bus[id] = g;
    }
    fetch('audio/manifest.json')
      .then((r) => r.json())
      .then((m: Manifest) => {
        this.manifest = m;
        this.music = new MusicPlayer(ac, m.music, this.bus.music);
        for (const [id, e] of Object.entries(m.sounds)) if (e.kind === 'bed') this.beds.set(id, new Bed(ac, e.file, this.bus[BED_CHANNEL[id] ?? 'noise']));
        for (const [id, e] of Object.entries(m.sounds)) if (e.kind === 'ui') this.load(id);
      })
      .catch(() => undefined);
  }

  private isOn(ch: Channel): boolean {
    return ch === 'music' ? this.on.music : this.on.ambience;
  }

  /** The track playing now, by name. */
  get nowPlaying(): string | null {
    return this.music?.title ?? null;
  }

  skipTrack(): void {
    if (this.on.music) this.music?.skip();
  }

  /** Switches the music, or everything else, on or off. */
  setOn(kind: keyof SoundSwitches, on: boolean): void {
    this.on[kind] = on;
    for (const ch of Object.keys(MIX) as Channel[]) this.bus[ch].gain.setTargetAtTime(MIX[ch] * (this.isOn(ch) ? 1 : 0), this.ac.currentTime, 0.2);
    if (kind === 'music') {
      if (on) this.music?.resume();
      else this.music?.pause();
    } else if (!on) for (const b of this.beds.values()) b.stop();
  }

  private load(id: string): AudioBuffer | null {
    const have = this.buffers.get(id);
    if (have === 'loading') return null;
    if (have) return have;
    const e = this.manifest?.sounds[id];
    if (!e) return null;
    this.buffers.set(id, 'loading');
    fetch(e.file)
      .then((r) => r.arrayBuffer())
      .then((a) => this.ac.decodeAudioData(a))
      .then((b) => this.buffers.set(id, b))
      .catch(() => this.buffers.delete(id));
    return null;
  }

  /**
   * Plays a recording once: whole, or (for long ones) a few seconds from
   * one of the stretches where something is heard, faded in and out.
   */
  play(id: string, gain = 1, channel: Channel = 'effects', piece?: [number, number]): void {
    if (!this.isOn(channel)) return;
    const buf = this.load(id);
    const e = this.manifest?.sounds[id];
    if (!buf || !e || gain <= 0.01) return;
    const now = this.ac.currentTime;
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = channel === 'noise' ? 0.96 + Math.random() * 0.08 : 1;
    const g = this.ac.createGain();
    src.connect(g).connect(this.bus[channel]);
    if (!piece) {
      // Whole recordings still end on a short fade, never a cut.
      const end = buf.duration / src.playbackRate.value;
      const fade = Math.min(1.5, end / 5);
      g.gain.setValueAtTime(gain, now);
      g.gain.setValueAtTime(gain, now + end - fade);
      g.gain.linearRampToValueAtTime(0, now + end);
      src.start(now);
      return;
    }
    const [lo, hi] = piece;
    const stretches = e.busy?.length ? e.busy : [[0, e.duration] as [number, number]];
    const [a, b] = stretches[Math.floor(Math.random() * stretches.length)];
    const len = Math.min(b - a, lo + Math.random() * (hi - lo));
    const at = a + Math.random() * Math.max(0, b - a - len);
    const fade = Math.min(0.4, len / 4);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + fade);
    g.gain.setValueAtTime(gain, now + len - fade);
    g.gain.linearRampToValueAtTime(0, now + len);
    src.start(now, at, len + 0.05);
  }

  /**
   * The sound of looking into a building: its own recording if there is
   * one (open-smithy), else one for its kind (open-farming), else a door.
   */
  openSound(type: BuildingType): void {
    const ids = [`open-${type}`, `open-${BUILDINGS[type]?.category}`];
    const id = ids.find((k) => this.manifest?.sounds[k]) ?? 'open';
    this.play(id, 0.45);
  }

  /** An interface click; a close or back button gets its own. */
  click(back: boolean): void {
    this.play(back ? 'back' : 'click', back ? 0.12 : 0.4);
  }

  /** A pastures's or a home's animals, a call now and then. */
  private calls(id: string, presence: number, every: [number, number], dt: number, piece: [number, number] = [1.5, 4]): void {
    if (presence <= 0.02) return;
    this.timers[id] = (this.timers[id] ?? every[0] * Math.random()) - dt;
    if (this.timers[id] > 0) return;
    this.timers[id] = every[0] + Math.random() * (every[1] - every[0]);
    this.play(id, Math.min(1, presence) * 0.8, 'noise', piece);
  }

  update(dt: number, sc: Scene): void {
    if (!this.manifest) return;
    const { s, renderer: r } = sc;
    const season = seasonOf(s.day);
    const month = monthOf(s.day) % 3;
    const night = Math.min(1, Math.max(0, (r.dusk - 0.2) / 0.5));
    const day = 1 - night;
    const want: Record<string, number> = {};

    if (sc.menu) {
      if (this.on.music) this.music?.update('menu');
      // Behind the title: a quiet meadow.
      want.birds = 0.5;
      if (this.on.ambience) for (const [id, bed] of this.beds) bed.update((want[id] ?? 0) * (BED_LEVEL[id] ?? 0.5), dt);
      return;
    }

    // ---- where the camera looks
    const [cx, cy] = r.screenToTile(r.width / 2, r.height / 2);
    const zoom = r.cam.zoom;
    // Half the view, in tiles; and how close the camera is (0 far out, 1 right in).
    const reach = Math.max(4, r.width / (zoom * 64));
    const close = Math.max(0, Math.min(1, (zoom - 0.7) / 1.3));
    const near = (x: number, y: number, k = 1) => Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (reach * k));
    const nearest = (test: (b: Building) => boolean, k = 1) => {
      let best = 0;
      for (const b of s.buildings) if (test(b)) best = Math.max(best, near(b.x + b.w / 2, b.y + b.h / 2, k));
      return best;
    };

    // ---- music
    const festive =
      (s.feastDay !== undefined && s.day - s.feastDay < 4) || (s.fairDay !== undefined && s.day - s.fairDay < 15) || (s.festivalDay !== undefined && s.day - s.festivalDay.day < 4);
    if (this.on.music) this.music?.update(festive ? 'festival' : season === 3 ? 'winter' : season === 2 ? 'autumn' : 'day');

    // ---- ambience: the land, the hour and the weather
    const rain = r.rainLevel;
    const warm = season === 0 || season === 1 ? 1 : season === 2 ? 0.45 : 0;
    want.birds = warm * day * (1 - rain * 0.8);
    // The evening chorus at dusk and dawn, and softly through the day.
    want.meadow = warm * (r.dusk > 0.1 && r.dusk < 0.7 ? 1 : 0.35 * day) * (1 - rain * 0.8);
    let water = 0;
    let land = 0;
    const step = Math.max(1, Math.round(reach / 4));
    for (let dy = -reach; dy <= reach; dy += step) {
      for (let dx = -reach; dx <= reach; dx += step) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
        const w = near(x, y);
        if (s.terrain[y * s.width + x] === 1) water += w;
        else land += w;
      }
    }
    want.river = season === 3 ? 0 : Math.min(1, (water / Math.max(1, water + land)) * 4);
    want[season === 2 ? 'rain' : 'lightrain'] = rain;
    want.wind = season === 3 ? 0.55 + 0.35 * (1 - close) : season === 2 ? 0.2 + 0.25 * (1 - close) : 0.08 * (1 - close);
    want.snowstorm = season === 3 ? (month === 1 ? 0.45 : 0.15) * (0.5 + 0.5 * (1 - close)) : 0;

    // ---- the town: heard where the camera looks, more as it comes close
    const built = (b: Building) => b.build >= 1;
    const working = (types: BuildingType[]) => (b: Building) => built(b) && types.includes(b.type) && b.workers > 0;
    const homes = nearest((b) => b.type === 'house' && b.residents > 0, 0.8);
    want.residential = homes * close * (0.4 + 0.6 * day);
    want.village = s.population >= 12 ? Math.min(1, s.population / 80) * (1 - close * 0.7) * day * nearest((b) => b.type === 'house' && b.residents > 0, 2) : 0;
    want.street = s.tier >= 1 ? nearest((b) => b.type === 'house' && b.residents > 0, 1.2) * (0.3 + 0.7 * close) * day * Math.min(1, s.population / 40) : 0;
    want.market = nearest(working(WORK_BEDS.market!), 0.7) * day * (0.3 + 0.7 * close);
    want.tavern = nearest(working(WORK_BEDS.tavern!), 0.5) * (0.3 + 0.7 * night) * close;
    want.smithy = nearest(working(WORK_BEDS.smithy!), 0.5) * day * close;
    want.stone = nearest(working(WORK_BEDS.stone!), 0.5) * day * close;
    want.bees = (season === 0 || season === 1 ? 1 : 0) * day * nearest((b) => built(b) && (b.type === 'beekeeper' || (b.type === 'house' && b.yard === 'bees')), 0.4) * close;
    want.building = nearest((b) => b.build < 1 && b.build > 0 && !b.need, 0.5) * day * close;

    if (!this.on.ambience) return;
    for (const [id, bed] of this.beds) bed.update(sc.running || BED_CHANNEL[id] ? (want[id] ?? 0) * (BED_LEVEL[id] ?? 0.5) : 0, dt);

    if (!sc.running) return;

    // ---- animals: a call now and then from what is in view; the chosen one at once
    const sel = sc.selected !== null ? s.buildings.find((b) => b.id === sc.selected) : undefined;
    if (sel && sel.id !== this.lastSelected) {
      this.openSound(sel.type);
      const kinds = Object.entries(sel.animals ?? {})
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([k]) => k);
      const id = kinds.length ? kinds[Math.floor(Math.random() * kinds.length)] : sel.type === 'house' && sel.yard === 'hens' ? 'hens' : null;
      if (id && this.manifest.sounds[id === 'pigs' ? 'goats' : id]) this.play(id === 'pigs' ? 'goats' : id, 0.9, 'noise', [2, 4]);
    }
    this.lastSelected = sel?.id ?? null;
    const flock = (kind: string) => nearest((b) => built(b) && ((b.animals as Record<string, number> | undefined)?.[kind] ?? 0) > 0, 0.7);
    if (day > 0.3) {
      this.calls('sheep', flock('sheep') * (0.4 + 0.6 * close), [8, 22], dt);
      this.calls('cattle', flock('cattle') * (0.4 + 0.6 * close), [10, 28], dt);
      this.calls('goats', Math.max(flock('goats'), flock('pigs')) * (0.4 + 0.6 * close), [12, 30], dt);
      this.calls('hens', nearest((b) => built(b) && b.type === 'house' && b.yard === 'hens', 0.5) * close, [9, 25], dt);
      this.calls('ducks', season !== 3 ? want.river * close : 0, [14, 40], dt, [1.5, 3]);
      this.calls(Math.random() < 0.5 ? 'dogs' : 'dogs2', homes * close * Math.min(1, s.population / 30) * 0.7, [25, 70], dt, [1, 2.5]);
    }
    if (night > 0.6 && season !== 3) this.calls('owl', 0.7, [25, 60], dt, [1.5, 3]);

    // ---- axes in the woods: the nearest woodcutter at work
    this.chopTimer -= dt;
    if (this.chopTimer <= 0) {
      let best = 0;
      for (const a of sc.agents) if (a.phase === 'act' && a.act === 'chop') best = Math.max(best, near(a.x, a.y, 0.4));
      this.chopTimer = best > 0 ? 0.9 + Math.random() * 0.6 : 1;
      if (best > 0) this.play('chop', best * (0.3 + 0.7 * close) * 0.7, 'noise');
    }

    // ---- church bells when the season turns, once a church stands
    if (this.lastSeason !== null && season !== this.lastSeason && s.buildings.some((b) => built(b) && BELL_TOWERS.includes(b.type))) this.play('bells', 0.8, 'noise');
    this.lastSeason = season;
  }

  /** Bells for a great moment (a new rank, a festival), if the town has a church. */
  bells(s: GameState): void {
    if (s.buildings.some((b) => b.build >= 1 && BELL_TOWERS.includes(b.type))) this.play('bells', 0.8, 'noise', [6, 10]);
  }
}
