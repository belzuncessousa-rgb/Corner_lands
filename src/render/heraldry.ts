/**
 * The lord's arms: a field, maybe divided with a second tincture, and a
 * charge in the middle. They fly on the manor's and the castle's flags.
 */
export type Division = 'plain' | 'pale' | 'fess' | 'quarterly' | 'bend' | 'chevron' | 'saltire' | 'chief' | 'bordure' | 'paly' | 'barry' | 'chequy';
export type Charge =
  | 'none'
  | 'roundel'
  | 'star'
  | 'cross'
  | 'lozenge'
  | 'crescent'
  | 'tower'
  | 'fleur'
  | 'tree'
  | 'sheaf'
  | 'key'
  | 'horseshoe'
  | 'fish'
  | 'bell'
  | 'sun';
/** The cut of the flag: square, a swallowtail, a long pennant or tongues. */
export type FlagShape = 'banner' | 'swallowtail' | 'pennant' | 'tongues';

export interface Heraldry {
  field: string;
  second: string;
  division: Division;
  charge: Charge;
  chargeColor: string;
  /** Older saves have none: a square banner. */
  shape?: FlagShape;
}

export const DIVISIONS: { id: Division; name: string }[] = [
  { id: 'plain', name: 'Plain' },
  { id: 'pale', name: 'Halved' },
  { id: 'fess', name: 'Banded' },
  { id: 'quarterly', name: 'Quartered' },
  { id: 'bend', name: 'Bend' },
  { id: 'chevron', name: 'Chevron' },
  { id: 'saltire', name: 'Saltire' },
  { id: 'chief', name: 'Chief' },
  { id: 'bordure', name: 'Border' },
  { id: 'paly', name: 'Stripes' },
  { id: 'barry', name: 'Bars' },
  { id: 'chequy', name: 'Chequered' },
];

export const CHARGES: { id: Charge; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'roundel', name: 'Roundel' },
  { id: 'star', name: 'Star' },
  { id: 'cross', name: 'Cross' },
  { id: 'lozenge', name: 'Lozenge' },
  { id: 'crescent', name: 'Crescent' },
  { id: 'tower', name: 'Tower' },
  { id: 'fleur', name: 'Fleur-de-lis' },
  { id: 'tree', name: 'Oak' },
  { id: 'sheaf', name: 'Sheaf' },
  { id: 'key', name: 'Key' },
  { id: 'horseshoe', name: 'Horseshoe' },
  { id: 'fish', name: 'Fish' },
  { id: 'bell', name: 'Bell' },
  { id: 'sun', name: 'Sun' },
];

export const FLAG_SHAPES: { id: FlagShape; name: string }[] = [
  { id: 'banner', name: 'Banner' },
  { id: 'swallowtail', name: 'Swallowtail' },
  { id: 'pennant', name: 'Pennant' },
  { id: 'tongues', name: 'Tongues' },
];

/** The heraldic colours and metals, as our palette paints them. */
export const TINCTURES = ['#a8322d', '#2e5e9a', '#3d7a3a', '#6a3a7a', '#2a2420', '#c8962a', '#e8c040', '#f2ece0', '#d8792a', '#7a4a2a', '#4a8a8a', '#d86a8a'];

export const DEFAULT_HERALDRY: Heraldry = { field: '#a8322d', second: '#e8c040', division: 'plain', charge: 'roundel', chargeColor: '#e8c040', shape: 'banner' };

/** The arms flying now (set from the game each frame; sprites read them as they are drawn). */
export const HERALDRY: { current: Heraldry } = { current: DEFAULT_HERALDRY };

export function heraldryKey(h: Heraldry = HERALDRY.current): string {
  return `${h.field}${h.second}${h.division}${h.charge}${h.chargeColor}${h.shape ?? 'banner'}`;
}

/**
 * Traces a flag's outline with its fly (the free edge) cut to `shape`.
 * The flag hangs from (x, y), `w` wide and `h` tall; `wave(t)` lifts the
 * cloth at a fraction t of the way out from the pole.
 */
export function flagOutline(c: CanvasRenderingContext2D, shape: FlagShape | undefined, x: number, y: number, w: number, h: number, wave: (t: number) => number = () => 0): void {
  const top = (t: number) => y + wave(t);
  const bot = (t: number) => y + h + wave(t);
  c.moveTo(x, top(0));
  if (shape === 'pennant') {
    // Tapering to a point.
    for (let t = 0; t <= 1.001; t += 0.05) c.lineTo(x + w * t, top(t) + (h / 2) * t * t * 0.95);
    for (let t = 1; t >= -0.001; t -= 0.05) c.lineTo(x + w * t, bot(t) - (h / 2) * t * t * 0.95);
    c.closePath();
    return;
  }
  for (let t = 0; t <= 1.001; t += 0.05) c.lineTo(x + w * t, top(t));
  if (shape === 'swallowtail') {
    c.lineTo(x + w * 0.72, y + h / 2 + wave(0.72));
  } else if (shape === 'tongues') {
    // Three tongues, the cut between them a third of the way in.
    for (let k = 1; k <= 2; k++) {
      c.lineTo(x + w * 0.8, y + (h * k) / 3 + wave(0.8));
      c.lineTo(x + w, y + (h * k) / 3 + h * 0.02 + wave(1));
    }
  }
  for (let t = 1; t >= -0.001; t -= 0.05) c.lineTo(x + w * t, bot(t));
  c.closePath();
}

/** Paints the arms filling the box (x, y, w, h); clip to a flag's or shield's shape first. */
export function paintArms(c: CanvasRenderingContext2D, a: Heraldry, x: number, y: number, w: number, h: number): void {
  c.fillStyle = a.field;
  c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = a.second;
  c.beginPath();
  let rule: CanvasFillRule = 'nonzero';
  switch (a.division) {
    case 'pale':
      c.rect(x + w / 2, y - 1, w / 2 + 1, h + 2);
      break;
    case 'fess':
      c.rect(x - 1, y + h / 2, w + 2, h / 2 + 1);
      break;
    case 'quarterly':
      c.rect(x + w / 2, y - 1, w / 2 + 1, h / 2 + 1);
      c.rect(x - 1, y + h / 2, w / 2 + 1, h / 2 + 1);
      break;
    case 'bend':
      c.moveTo(x - 1, y - 1);
      c.lineTo(x + w * 0.35, y - 1);
      c.lineTo(x + w + 1, y + h * 0.65);
      c.lineTo(x + w + 1, y + h + 1);
      c.lineTo(x + w * 0.65, y + h + 1);
      c.lineTo(x - 1, y + h * 0.35);
      c.closePath();
      break;
    case 'chevron':
      c.moveTo(x - 1, y + h * 0.8);
      c.lineTo(x + w / 2, y + h * 0.25);
      c.lineTo(x + w + 1, y + h * 0.8);
      c.lineTo(x + w + 1, y + h + 1);
      c.lineTo(x + w / 2, y + h * 0.55);
      c.lineTo(x - 1, y + h + 1);
      c.closePath();
      break;
    case 'saltire': {
      // Two bands crossing corner to corner.
      const b = Math.min(w, h) * 0.13;
      c.moveTo(x - 1, y - 1 + b);
      c.lineTo(x - 1 + b, y - 1);
      c.lineTo(x + w + 1, y + h + 1 - b);
      c.lineTo(x + w + 1 - b, y + h + 1);
      c.closePath();
      c.moveTo(x + w + 1 - b, y - 1);
      c.lineTo(x + w + 1, y - 1 + b);
      c.lineTo(x - 1 + b, y + h + 1);
      c.lineTo(x - 1, y + h + 1 - b);
      c.closePath();
      break;
    }
    case 'chief':
      c.rect(x - 1, y - 1, w + 2, h * 0.3 + 1);
      break;
    case 'bordure': {
      const b = Math.min(w, h) * 0.13;
      c.rect(x - 1, y - 1, w + 2, h + 2);
      c.rect(x + b, y + b, w - b * 2, h - b * 2);
      rule = 'evenodd';
      break;
    }
    case 'paly':
      for (let k = 1; k < 6; k += 2) c.rect(x + (w * k) / 6, y - 1, w / 6, h + 2);
      break;
    case 'barry':
      for (let k = 1; k < 6; k += 2) c.rect(x - 1, y + (h * k) / 6, w + 2, h / 6);
      break;
    case 'chequy':
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) c.rect(x + (w * i) / 6, y + (h * j) / 4, w / 6 + 0.3, h / 4 + 0.3);
      break;
  }
  if (a.division !== 'plain') c.fill(rule);
  const cx = x + w / 2;
  const cy = y + (a.division === 'chief' ? h * 0.62 : h / 2);
  const r = Math.min(w, h) * (a.division === 'chief' ? 0.22 : 0.26);
  c.fillStyle = a.chargeColor;
  paintCharge(c, a.charge, cx, cy, r);
}

/** One charge, centred on (cx, cy), about r in radius. */
function paintCharge(c: CanvasRenderingContext2D, charge: Charge, cx: number, cy: number, r: number): void {
  const TAU = Math.PI * 2;
  c.beginPath();
  // Holes (the key's bow) are traced the other way round, so nonzero leaves them open.
  const rule: CanvasFillRule = 'nonzero';
  switch (charge) {
    case 'none':
      return;
    case 'roundel':
      c.arc(cx, cy, r, 0, TAU);
      break;
    case 'star':
      for (let k = 0; k < 10; k++) {
        const ang = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r * 1.15;
        c.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      }
      c.closePath();
      break;
    case 'cross':
      c.rect(cx - r * 0.3, cy - r * 1.1, r * 0.6, r * 2.2);
      c.rect(cx - r * 1.1, cy - r * 0.3, r * 2.2, r * 0.6);
      break;
    case 'lozenge':
      c.moveTo(cx, cy - r * 1.2);
      c.lineTo(cx + r * 0.8, cy);
      c.lineTo(cx, cy + r * 1.2);
      c.lineTo(cx - r * 0.8, cy);
      c.closePath();
      break;
    case 'crescent':
      c.arc(cx, cy, r, Math.PI * 0.15, Math.PI * 1.85);
      c.arc(cx + r * 0.45, cy, r * 0.75, Math.PI * 1.75, Math.PI * 0.25, true);
      c.closePath();
      break;
    case 'tower': {
      const tw = r * 1.4;
      const th = r * 1.9;
      c.rect(cx - tw / 2, cy - th / 2 + r * 0.35, tw, th - r * 0.35);
      for (let k = 0; k < 3; k++) c.rect(cx - tw / 2 + k * (tw / 2.5), cy - th / 2, tw / 5, r * 0.4);
      break;
    }
    case 'fleur':
      // The middle petal, the two curling out to the sides, the band and the foot.
      c.moveTo(cx, cy - r * 1.3);
      c.quadraticCurveTo(cx + r * 0.5, cy - r * 0.55, cx + r * 0.18, cy + r * 0.12);
      c.lineTo(cx - r * 0.18, cy + r * 0.12);
      c.quadraticCurveTo(cx - r * 0.5, cy - r * 0.55, cx, cy - r * 1.3);
      for (const s of [1, -1]) {
        c.moveTo(cx + s * r * 0.12, cy + r * 0.08);
        c.quadraticCurveTo(cx + s * r * 1.25, cy - r * 0.95, cx + s * r * 1.1, cy - r * 0.05);
        c.quadraticCurveTo(cx + s * r * 1.0, cy + r * 0.35, cx + s * r * 0.5, cy + r * 0.24);
        c.closePath();
      }
      c.rect(cx - r * 0.62, cy + r * 0.14, r * 1.24, r * 0.3);
      c.moveTo(cx - r * 0.16, cy + r * 0.44);
      c.lineTo(cx - r * 0.5, cy + r * 1.15);
      c.lineTo(cx + r * 0.5, cy + r * 1.15);
      c.lineTo(cx + r * 0.16, cy + r * 0.44);
      c.closePath();
      break;
    case 'tree':
      // An oak: a trunk flaring at the root under a crown of rounded leaves.
      c.moveTo(cx - r * 0.18, cy + r * 0.1);
      c.lineTo(cx - r * 0.24, cy + r * 1.0);
      c.lineTo(cx - r * 0.5, cy + r * 1.2);
      c.lineTo(cx + r * 0.5, cy + r * 1.2);
      c.lineTo(cx + r * 0.24, cy + r * 1.0);
      c.lineTo(cx + r * 0.18, cy + r * 0.1);
      c.closePath();
      for (const [lx, ly, lr] of [[0, -0.75, 0.5], [-0.55, -0.45, 0.45], [0.55, -0.45, 0.45], [-0.75, 0.05, 0.4], [0.75, 0.05, 0.4], [0, -0.15, 0.55]]) {
        c.moveTo(cx + r * (lx + lr), cy + r * ly);
        c.arc(cx + r * lx, cy + r * ly, r * lr, 0, TAU);
      }
      break;
    case 'sheaf':
      // Three ears of wheat bound in the middle.
      for (const s of [-1, 0, 1]) {
        const ex = cx + s * r * 0.55;
        const ey = cy - r * 0.55 - (s === 0 ? r * 0.2 : 0);
        c.moveTo(ex + r * 0.28, ey);
        c.ellipse(ex, ey, r * 0.28, r * 0.6, s * 0.35, 0, TAU);
      }
      c.moveTo(cx - r * 0.12, cy - r * 0.1);
      c.lineTo(cx - r * 0.55, cy + r * 1.15);
      c.lineTo(cx + r * 0.55, cy + r * 1.15);
      c.lineTo(cx + r * 0.12, cy - r * 0.1);
      c.closePath();
      c.rect(cx - r * 0.45, cy + r * 0.25, r * 0.9, r * 0.24);
      break;
    case 'key':
      c.moveTo(cx + r * 0.55, cy - r * 0.6);
      c.arc(cx, cy - r * 0.6, r * 0.55, 0, TAU);
      c.moveTo(cx + r * 0.28, cy - r * 0.6);
      c.arc(cx, cy - r * 0.6, r * 0.28, 0, TAU, true);
      c.rect(cx - r * 0.14, cy - r * 0.1, r * 0.28, r * 1.35);
      c.rect(cx + r * 0.14, cy + r * 0.85, r * 0.42, r * 0.22);
      c.rect(cx + r * 0.14, cy + r * 0.5, r * 0.3, r * 0.2);
      break;
    case 'horseshoe':
      c.arc(cx, cy - r * 0.1, r, Math.PI * 0.82, Math.PI * 2.18);
      c.arc(cx, cy - r * 0.1, r * 0.55, Math.PI * 2.18, Math.PI * 0.82, true);
      c.closePath();
      break;
    case 'fish':
      c.moveTo(cx + r * 0.75, cy);
      c.ellipse(cx - r * 0.15, cy, r * 0.9, r * 0.45, 0, 0, TAU);
      c.moveTo(cx + r * 0.55, cy);
      c.lineTo(cx + r * 1.25, cy - r * 0.55);
      c.lineTo(cx + r * 1.25, cy + r * 0.55);
      c.closePath();
      break;
    case 'bell':
      c.moveTo(cx - r * 0.85, cy + r * 0.75);
      c.quadraticCurveTo(cx - r * 0.55, cy + r * 0.5, cx - r * 0.55, cy - r * 0.2);
      c.quadraticCurveTo(cx - r * 0.55, cy - r * 0.95, cx, cy - r * 0.95);
      c.quadraticCurveTo(cx + r * 0.55, cy - r * 0.95, cx + r * 0.55, cy - r * 0.2);
      c.quadraticCurveTo(cx + r * 0.55, cy + r * 0.5, cx + r * 0.85, cy + r * 0.75);
      c.closePath();
      c.moveTo(cx + r * 0.2, cy + r * 0.95);
      c.arc(cx, cy + r * 0.95, r * 0.2, 0, TAU);
      c.rect(cx - r * 0.1, cy - r * 1.25, r * 0.2, r * 0.32);
      break;
    case 'sun':
      c.moveTo(cx + r * 0.55, cy);
      c.arc(cx, cy, r * 0.55, 0, TAU);
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * TAU;
        c.moveTo(cx + Math.cos(a0 - 0.13) * r * 0.62, cy + Math.sin(a0 - 0.13) * r * 0.62);
        c.lineTo(cx + Math.cos(a0) * r * (k % 2 ? 1.0 : 1.25), cy + Math.sin(a0) * r * (k % 2 ? 1.0 : 1.25));
        c.lineTo(cx + Math.cos(a0 + 0.13) * r * 0.62, cy + Math.sin(a0 + 0.13) * r * 0.62);
        c.closePath();
      }
      break;
  }
  c.fill(rule);
}
