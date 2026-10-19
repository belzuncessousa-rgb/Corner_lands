import { DEFAULT_HERALDRY, type Heraldry, flagOutline, paintArms } from './heraldry';

/**
 * The player's lord or lady, drawn like the villagers (a tapered body and a
 * round, faceless head) but larger, with the hair, hat and clothes chosen.
 */
export type HairStyle = 'short' | 'long' | 'braid' | 'bald' | 'curly' | 'bun' | 'tail';
export type Hat = 'none' | 'cap' | 'hood' | 'feather' | 'coronet' | 'crown' | 'helm' | 'straw' | 'veil' | 'wreath';
export type Garment = 'tunic' | 'dress' | 'robe' | 'armour';
export type Beard = 'none' | 'stubble' | 'beard' | 'moustache';
export type Held = 'none' | 'staff' | 'sword' | 'banner';

export interface LordLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  hat: Hat;
  hatColor: string;
  garment: Garment;
  cloth: string;
  /** The rest arrived later; older saves go without. */
  trim?: string;
  cloak?: string;
  beard?: Beard;
  held?: Held;
}

export const SKINS = ['#f2d6bc', '#e8c4a0', '#d2a47a', '#b07a52', '#8a5a3a', '#5e3c26'];
export const HAIRS = ['#2a2018', '#5a3a22', '#8a5a2a', '#c8963a', '#e0c070', '#a8442a', '#9a9490', '#e8e4dc'];
export const CLOTHS = ['#a8322d', '#2e5e9a', '#3d7a3a', '#6a3a7a', '#2a2420', '#c8962a', '#7a4a2a', '#f2ece0', '#d8792a', '#4a8a8a'];
export const HAIR_STYLES: { id: HairStyle; name: string }[] = [
  { id: 'short', name: 'Short' },
  { id: 'long', name: 'Long' },
  { id: 'braid', name: 'Braided' },
  { id: 'tail', name: 'Ponytail' },
  { id: 'bun', name: 'Bun' },
  { id: 'curly', name: 'Curly' },
  { id: 'bald', name: 'Bald' },
];
export const BEARDS: { id: Beard; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'stubble', name: 'Stubble' },
  { id: 'moustache', name: 'Moustache' },
  { id: 'beard', name: 'Beard' },
];
export const HATS: { id: Hat; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'cap', name: 'Cap' },
  { id: 'hood', name: 'Hood' },
  { id: 'feather', name: 'Plumed hat' },
  { id: 'straw', name: 'Straw hat' },
  { id: 'veil', name: 'Veil' },
  { id: 'wreath', name: 'Wreath' },
  { id: 'helm', name: 'Helm' },
  { id: 'coronet', name: 'Coronet' },
  { id: 'crown', name: 'Crown' },
];
/** Hats whose colour is their own (metal, straw, leaves), not chosen. */
export const FIXED_HATS: Hat[] = ['none', 'coronet', 'crown', 'helm', 'straw', 'wreath'];
export const GARMENTS: { id: Garment; name: string }[] = [
  { id: 'tunic', name: 'Tunic' },
  { id: 'dress', name: 'Dress' },
  { id: 'robe', name: 'Robe' },
  { id: 'armour', name: 'Armour' },
];
export const HELD: { id: Held; name: string }[] = [
  { id: 'none', name: 'Nothing' },
  { id: 'staff', name: 'Staff' },
  { id: 'sword', name: 'Sword' },
  { id: 'banner', name: 'Banner' },
];
/** Trims and belts in metal, leather or a bright thread. */
export const TRIMS = ['#c8962a', '#e8c040', '#c8ccd0', '#5a3a22', '#2a2420', '#f2ece0', '#a8322d', '#2e5e9a'];

export const DEFAULT_LORD: LordLook = {
  skin: '#e8c4a0',
  hair: '#5a3a22',
  hairStyle: 'short',
  hat: 'feather',
  hatColor: '#2e5e9a',
  garment: 'tunic',
  cloth: '#a8322d',
  trim: '#c8962a',
  cloak: '',
  beard: 'none',
  held: 'none',
};

/**
 * Draws the figure standing at (x, y) (between the feet), `scale` times a
 * villager's size. With arms, a tabard of them is worn over the tunic.
 * `stride` (-1 to 1) swings the legs, or the hem of a gown, mid-step;
 * `riding` seats the figure astride (no legs below the saddle).
 */
export function drawLord(c: CanvasRenderingContext2D, look: LordLook, x: number, y: number, scale: number, arms?: Heraldry, stride = 0, riding = false): void {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.lineJoin = 'round';
  // Shadow (a rider's falls under the horse).
  if (!riding) {
    c.fillStyle = 'rgba(20,20,10,0.25)';
    c.beginPath();
    c.ellipse(0, 0, 4.5, 1.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  const trim = look.trim ?? '#c8962a';
  // A cloak falls behind, from the shoulders nearly to the ground.
  if (look.cloak) {
    c.fillStyle = look.cloak;
    c.beginPath();
    c.moveTo(-2.7, -10.8);
    c.lineTo(2.7, -10.8);
    c.lineTo(4.6, riding ? -3.5 : -0.6);
    c.quadraticCurveTo(0, riding ? -2.6 : 0.4, -4.6, riding ? -3.5 : -0.6);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    c.moveTo(-2.7, -10.8);
    c.lineTo(-4.6, riding ? -3.5 : -0.6);
    c.lineTo(-3.6, riding ? -3.3 : -0.4);
    c.closePath();
    c.fill();
  }
  // A staff or banner held on the far side stands behind the figure.
  if (look.held === 'banner') {
    c.strokeStyle = '#5a3e26';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(4.2, -21);
    c.lineTo(4.2, riding ? -4 : 0.2);
    c.stroke();
    c.save();
    c.beginPath();
    flagOutline(c, arms?.shape, 4.5, -20.6, 5.2, 3.6, (t) => Math.sin(t * Math.PI * 2) * 0.25 * t);
    c.clip();
    paintArms(c, arms ?? DEFAULT_HERALDRY, 4.5, -20.6, 5.2, 3.6);
    c.restore();
    c.fillStyle = '#e8c040';
    c.beginPath();
    c.arc(4.2, -21.2, 0.45, 0, Math.PI * 2);
    c.fill();
  } else if (look.held === 'staff') {
    c.strokeStyle = '#6a4424';
    c.lineWidth = 0.75;
    c.beginPath();
    c.moveTo(4, -16.5);
    c.lineTo(4, riding ? -4 : 0.2);
    c.stroke();
    c.beginPath();
    c.arc(4.6, -16.4, 0.8, Math.PI, Math.PI * 2.6);
    c.stroke();
  }
  // Hair falling behind the back.
  c.fillStyle = look.hair;
  if (look.hairStyle === 'long') {
    c.beginPath();
    c.moveTo(-2.4, -13);
    c.lineTo(2.4, -13);
    c.lineTo(2.7, -8.6);
    c.lineTo(-2.7, -8.6);
    c.closePath();
    c.fill();
  }
  if (look.garment === 'dress' || look.garment === 'robe') {
    // A gown flaring down to the ground, or a straighter robe with a belt.
    // The hem sways with each step.
    const sway = stride * (look.garment === 'robe' ? 0.5 : 0.9);
    const hem = look.garment === 'robe' ? 3.5 : 4.2;
    c.fillStyle = look.cloth;
    c.beginPath();
    c.moveTo(-hem + sway, 0);
    c.lineTo(hem + sway, 0);
    c.lineTo(2.4, -10.5);
    c.lineTo(-2.4, -10.5);
    c.closePath();
    c.fill();
    if (look.garment === 'robe') {
      // Long sleeves, a belt and a trimmed front.
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.fillRect(-3.3, -9.8, 1.1, 4.6);
      c.fillRect(2.2, -9.8, 1.1, 4.6);
      c.fillStyle = trim;
      c.fillRect(-2.7, -6.6, 5.4, 0.8);
      c.fillRect(-0.3, -5.8, 0.6, 5.8);
      c.fillRect(-hem + sway, -0.7, hem * 2, 0.7);
    } else {
      c.fillStyle = trim;
      c.fillRect(-2.5, -7.4, 5, 0.8);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(-4.2 + sway, -0.8, 8.4, 0.8);
    }
  } else {
    const armour = look.garment === 'armour';
    c.strokeStyle = armour ? '#7a8088' : '#3a2c20';
    c.lineWidth = 1.4;
    c.beginPath();
    if (riding) {
      // Seated: the near leg bent at the knee down the horse's side, the foot in the stirrup.
      c.lineWidth = 1.6;
      c.moveTo(0.2, -4.2);
      c.lineTo(2.6, -3.4);
      c.lineTo(2.1, 0.4);
      c.stroke();
      c.fillStyle = '#2a1e14';
      c.fillRect(1.4, 0, 2.2, 1);
      c.beginPath();
    } else {
      c.moveTo(-1, -4);
      c.lineTo(-1.1 + stride * 1.8, 0);
      c.moveTo(1, -4);
      c.lineTo(1.1 - stride * 1.8, 0);
    }
    c.stroke();
    if (armour) {
      // Mail from shoulder to thigh, with a surcoat over it.
      c.fillStyle = '#9aa0a8';
      c.beginPath();
      c.moveTo(-3.2, -3.4);
      c.lineTo(3.2, -3.4);
      c.lineTo(2.7, -10.6);
      c.lineTo(-2.7, -10.6);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(40,44,52,0.3)';
      for (let yy = -10; yy < -3.6; yy += 1.1) c.fillRect(-3, yy, 6, 0.35);
    }
    c.fillStyle = look.cloth;
    c.beginPath();
    if (armour) {
      c.moveTo(-2.3, -3.6);
      c.lineTo(2.3, -3.6);
      c.lineTo(2, -10.1);
      c.lineTo(-2, -10.1);
    } else {
      c.moveTo(-3, -4);
      c.lineTo(3, -4);
      c.lineTo(2.4, -10.5);
      c.lineTo(-2.4, -10.5);
    }
    c.closePath();
    c.fill();
    if (arms) {
      // A tabard of the lord's arms.
      c.save();
      c.beginPath();
      c.rect(-1.6, -10.3, 3.2, 6);
      c.clip();
      paintArms(c, arms, -1.6, -10.3, 3.2, 6);
      c.restore();
    }
    c.fillStyle = trim;
    c.fillRect(-2.8, -5.6, 5.6, 0.7);
  }
  // A sword at the hip, on the near side.
  if (look.held === 'sword') {
    c.fillStyle = '#c8ccd0';
    c.fillRect(-3.9, -5.8, 0.55, 5.2);
    c.fillStyle = '#5a3e26';
    c.fillRect(-4.6, -6.1, 1.95, 0.5);
    c.fillRect(-3.85, -7.4, 0.45, 1.3);
    c.fillStyle = trim;
    c.beginPath();
    c.arc(-3.62, -7.6, 0.4, 0, Math.PI * 2);
    c.fill();
  }
  if (look.cloak) {
    // The clasp at the throat.
    c.fillStyle = trim;
    c.beginPath();
    c.arc(0, -10.5, 0.55, 0, Math.PI * 2);
    c.fill();
  }
  // Head (no face, as the villagers).
  c.fillStyle = look.skin;
  c.beginPath();
  c.arc(0, -12.5, 2.2, 0, Math.PI * 2);
  c.fill();
  // Beard or moustache, on the lower face.
  c.fillStyle = look.hair;
  switch (look.beard) {
    case 'beard':
      c.beginPath();
      c.moveTo(-1.95, -11.9);
      c.quadraticCurveTo(-1.7, -9.7, 0, -9.5);
      c.quadraticCurveTo(1.7, -9.7, 1.95, -11.9);
      c.quadraticCurveTo(0, -11.1, -1.95, -11.9);
      c.fill();
      break;
    case 'moustache':
      c.beginPath();
      c.ellipse(-0.75, -11.7, 0.95, 0.38, 0.25, 0, Math.PI * 2);
      c.ellipse(0.75, -11.7, 0.95, 0.38, -0.25, 0, Math.PI * 2);
      c.fill();
      break;
    case 'stubble':
      c.globalAlpha = 0.35;
      c.beginPath();
      c.arc(0, -12.3, 2.15, Math.PI * 0.08, Math.PI * 0.92);
      c.fill();
      c.globalAlpha = 1;
      break;
  }
  // Hair.
  c.fillStyle = look.hair;
  if (look.hairStyle === 'curly') {
    for (const [hx, hy] of [[-1.9, -13.2], [-1.1, -14.3], [0, -14.7], [1.1, -14.3], [1.9, -13.2], [-2.3, -12.1], [2.3, -12.1]]) {
      c.beginPath();
      c.arc(hx, hy, 0.95, 0, Math.PI * 2);
      c.fill();
    }
  } else if (look.hairStyle !== 'bald') {
    c.beginPath();
    c.arc(0, -13.2, 2.2, Math.PI, 0);
    c.fill();
  }
  if (look.hairStyle === 'bun') {
    c.beginPath();
    c.arc(0.3, -15.4, 1.05, 0, Math.PI * 2);
    c.fill();
  }
  if (look.hairStyle === 'tail') {
    c.beginPath();
    c.moveTo(1.6, -14);
    c.quadraticCurveTo(4.2, -13.4, 3.2, -9.6);
    c.quadraticCurveTo(2.6, -12, 1.4, -12.8);
    c.closePath();
    c.fill();
  }
  if (look.hairStyle === 'braid') {
    c.beginPath();
    c.ellipse(2.2, -10.6, 0.6, 1.8, -0.2, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(2.5, -8.7, 0.45, 0, Math.PI * 2);
    c.fill();
  }
  // Hat.
  c.fillStyle = look.hatColor;
  switch (look.hat) {
    case 'cap':
      c.beginPath();
      c.arc(0, -13.6, 2.3, Math.PI, 0);
      c.fill();
      c.fillRect(-2.5, -13.8, 5, 0.7);
      break;
    case 'hood':
      c.beginPath();
      c.moveTo(-2.9, -10.6);
      c.lineTo(-2.7, -13.6);
      c.quadraticCurveTo(0, -17.4, 2.7, -13.6);
      c.lineTo(2.9, -10.6);
      c.lineTo(2.2, -10.6);
      c.lineTo(2.1, -12.8);
      c.quadraticCurveTo(0, -15.6, -2.1, -12.8);
      c.lineTo(-2.2, -10.6);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(-3.2, -10.8);
      c.lineTo(3.2, -10.8);
      c.lineTo(2.4, -9.3);
      c.lineTo(-2.4, -9.3);
      c.closePath();
      c.fill();
      break;
    case 'feather':
      c.beginPath();
      c.ellipse(0, -14.5, 3.6, 0.9, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(-1.9, -16.6, 3.8, 2.2);
      c.fillStyle = '#f2ece0';
      c.beginPath();
      c.moveTo(1.2, -16);
      c.quadraticCurveTo(4.6, -18.4, 5.2, -15.6);
      c.quadraticCurveTo(3.6, -16.6, 1.8, -15.2);
      c.closePath();
      c.fill();
      break;
    case 'coronet':
      c.fillStyle = '#e8c040';
      c.beginPath();
      c.moveTo(-2.3, -14.2);
      for (let k = 0; k < 5; k++) {
        c.lineTo(-2.3 + k * 1.15, -16.1);
        c.lineTo(-2.3 + k * 1.15 + 0.58, -14.9);
      }
      c.lineTo(2.3, -16.1);
      c.lineTo(2.3, -14.2);
      c.closePath();
      c.fill();
      c.fillStyle = '#a8322d';
      c.beginPath();
      c.arc(0, -14.9, 0.4, 0, Math.PI * 2);
      c.fill();
      break;
    case 'crown':
      // Taller than a coronet, with a jewel on each point.
      c.fillStyle = '#e8c040';
      c.beginPath();
      c.moveTo(-2.5, -14);
      c.lineTo(-2.7, -17.4);
      c.lineTo(-1.35, -15.8);
      c.lineTo(0, -18);
      c.lineTo(1.35, -15.8);
      c.lineTo(2.7, -17.4);
      c.lineTo(2.5, -14);
      c.closePath();
      c.fill();
      c.fillStyle = '#c8962a';
      c.fillRect(-2.5, -14.8, 5, 0.8);
      for (const [jx, jy, jc] of [[-2.7, -17.5, '#2e5e9a'], [0, -18.1, '#a8322d'], [2.7, -17.5, '#2e5e9a']] as const) {
        c.fillStyle = jc;
        c.beginPath();
        c.arc(jx, jy, 0.42, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'helm':
      // A round steel helm with a nose guard.
      c.fillStyle = '#9aa0a8';
      c.beginPath();
      c.arc(0, -13, 2.5, Math.PI, 0);
      c.lineTo(2.5, -12.2);
      c.lineTo(-2.5, -12.2);
      c.closePath();
      c.fill();
      c.fillStyle = '#7a8088';
      c.fillRect(-2.6, -13.2, 5.2, 0.6);
      c.fillRect(-0.3, -13, 0.6, 1.8);
      c.fillStyle = '#d0d4d8';
      c.beginPath();
      c.arc(-0.9, -14.4, 0.5, 0, Math.PI * 2);
      c.fill();
      break;
    case 'straw':
      c.fillStyle = '#e0c070';
      c.beginPath();
      c.ellipse(0, -14.1, 4.4, 1.1, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(0, -14.3, 2, Math.PI, 0);
      c.fill();
      c.fillStyle = '#a8322d';
      c.fillRect(-2, -14.6, 4, 0.55);
      break;
    case 'veil':
      // Cloth over the head and down past the shoulders, held by a band.
      c.beginPath();
      c.moveTo(-3.2, -9.6);
      c.lineTo(-2.6, -13.6);
      c.quadraticCurveTo(0, -16.6, 2.6, -13.6);
      c.lineTo(3.2, -9.6);
      c.lineTo(2.1, -9.8);
      c.lineTo(2, -12.6);
      c.quadraticCurveTo(0, -14.4, -2, -12.6);
      c.lineTo(-2.1, -9.8);
      c.closePath();
      c.fill();
      c.fillStyle = '#e8c040';
      c.fillRect(-2.3, -14.3, 4.6, 0.5);
      break;
    case 'wreath':
      c.fillStyle = '#4f8a3c';
      for (let k = 0; k < 9; k++) {
        const t = -Math.PI + (k / 8) * Math.PI;
        c.beginPath();
        c.ellipse(Math.cos(t) * 2.3, -13.6 + Math.sin(t) * 0.7, 0.75, 0.42, t + Math.PI / 2, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#d84a5a';
      c.beginPath();
      c.arc(-1.5, -14.1, 0.38, 0, Math.PI * 2);
      c.arc(1.5, -14.1, 0.38, 0, Math.PI * 2);
      c.fill();
      break;
  }
  c.restore();
}

/**
 * A canvas with the lord standing on a little patch of grass, framed for a
 * portrait; a bust shows only the head and shoulders, for small buttons.
 */
export function lordPortrait(look: LordLook, size: number, arms?: Heraldry, bust = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const c = cv.getContext('2d');
  if (!c) return cv;
  c.scale(dpr, dpr);
  const g = c.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#c8d8e0');
  g.addColorStop(0.72, '#e8e0c8');
  g.addColorStop(0.72, '#8aa860');
  g.addColorStop(1, '#6a8a48');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  if (bust) drawLord(c, look, size / 2, size * 1.25, size / 14, arms);
  else drawLord(c, look, size / 2, size * 0.9, size / 24.5, arms);
  return cv;
}
