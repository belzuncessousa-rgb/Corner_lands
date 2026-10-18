/**
 * The lord's arms: a field, maybe divided with a second tincture, and a
 * charge in the middle. They fly on the manor's and the castle's flags.
 */
export type Division = 'plain' | 'pale' | 'fess' | 'quarterly' | 'bend' | 'chevron';
export type Charge = 'none' | 'roundel' | 'star' | 'cross' | 'lozenge' | 'crescent' | 'tower';

export interface Heraldry {
  field: string;
  second: string;
  division: Division;
  charge: Charge;
  chargeColor: string;
}

export const DIVISIONS: { id: Division; name: string }[] = [
  { id: 'plain', name: 'Plain' },
  { id: 'pale', name: 'Halved' },
  { id: 'fess', name: 'Banded' },
  { id: 'quarterly', name: 'Quartered' },
  { id: 'bend', name: 'Bend' },
  { id: 'chevron', name: 'Chevron' },
];

export const CHARGES: { id: Charge; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'roundel', name: 'Roundel' },
  { id: 'star', name: 'Star' },
  { id: 'cross', name: 'Cross' },
  { id: 'lozenge', name: 'Lozenge' },
  { id: 'crescent', name: 'Crescent' },
  { id: 'tower', name: 'Tower' },
];

/** The heraldic colours and metals, as our palette paints them. */
export const TINCTURES = ['#a8322d', '#2e5e9a', '#3d7a3a', '#6a3a7a', '#2a2420', '#c8962a', '#e8c040', '#f2ece0', '#d8792a', '#7a4a2a'];

export const DEFAULT_HERALDRY: Heraldry = { field: '#a8322d', second: '#e8c040', division: 'plain', charge: 'roundel', chargeColor: '#e8c040' };

/** The arms flying now (set from the game each frame; sprites read them as they are drawn). */
export const HERALDRY: { current: Heraldry } = { current: DEFAULT_HERALDRY };

export function heraldryKey(h: Heraldry = HERALDRY.current): string {
  return `${h.field}${h.second}${h.division}${h.charge}${h.chargeColor}`;
}

/** Paints the arms filling the box (x, y, w, h); clip to a flag's or shield's shape first. */
export function paintArms(c: CanvasRenderingContext2D, a: Heraldry, x: number, y: number, w: number, h: number): void {
  c.fillStyle = a.field;
  c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = a.second;
  c.beginPath();
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
  }
  if (a.division !== 'plain') c.fill();
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.26;
  c.fillStyle = a.chargeColor;
  c.beginPath();
  switch (a.charge) {
    case 'roundel':
      c.arc(cx, cy, r, 0, Math.PI * 2);
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
  }
  if (a.charge !== 'none') c.fill('nonzero');
}
