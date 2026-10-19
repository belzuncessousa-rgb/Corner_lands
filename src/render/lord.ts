import { type Heraldry, paintArms } from './heraldry';

/**
 * The player's lord or lady, drawn like the villagers (a tapered body and a
 * round, faceless head) but larger, with the hair, hat and clothes chosen.
 */
export type HairStyle = 'short' | 'long' | 'braid' | 'bald';
export type Hat = 'none' | 'cap' | 'hood' | 'feather' | 'coronet';
export type Garment = 'tunic' | 'dress';

export interface LordLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  hat: Hat;
  hatColor: string;
  garment: Garment;
  cloth: string;
}

export const SKINS = ['#f2d6bc', '#e8c4a0', '#d2a47a', '#b07a52', '#8a5a3a', '#5e3c26'];
export const HAIRS = ['#2a2018', '#5a3a22', '#8a5a2a', '#c8963a', '#e0c070', '#a8442a', '#9a9490', '#e8e4dc'];
export const CLOTHS = ['#a8322d', '#2e5e9a', '#3d7a3a', '#6a3a7a', '#2a2420', '#c8962a', '#7a4a2a', '#f2ece0', '#d8792a', '#4a8a8a'];
export const HAIR_STYLES: { id: HairStyle; name: string }[] = [
  { id: 'short', name: 'Short' },
  { id: 'long', name: 'Long' },
  { id: 'braid', name: 'Braided' },
  { id: 'bald', name: 'Bald' },
];
export const HATS: { id: Hat; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'cap', name: 'Cap' },
  { id: 'hood', name: 'Hood' },
  { id: 'feather', name: 'Plumed hat' },
  { id: 'coronet', name: 'Coronet' },
];
export const GARMENTS: { id: Garment; name: string }[] = [
  { id: 'tunic', name: 'Tunic' },
  { id: 'dress', name: 'Dress' },
];

export const DEFAULT_LORD: LordLook = {
  skin: '#e8c4a0',
  hair: '#5a3a22',
  hairStyle: 'short',
  hat: 'feather',
  hatColor: '#2e5e9a',
  garment: 'tunic',
  cloth: '#a8322d',
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
  if (look.garment === 'dress') {
    // A gown flaring down to the ground.
    // The hem sways with each step.
    const sway = stride * 0.9;
    c.fillStyle = look.cloth;
    c.beginPath();
    c.moveTo(-4.2 + sway, 0);
    c.lineTo(4.2 + sway, 0);
    c.lineTo(2.3, -10.5);
    c.lineTo(-2.3, -10.5);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.fillRect(-2.5, -7.4, 5, 0.9);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(-4.2, -0.8, 8.4, 0.8);
  } else {
    c.strokeStyle = '#3a2c20';
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
    c.fillStyle = look.cloth;
    c.beginPath();
    c.moveTo(-3, -4);
    c.lineTo(3, -4);
    c.lineTo(2.4, -10.5);
    c.lineTo(-2.4, -10.5);
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
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(-2.8, -5.6, 5.6, 0.7);
  }
  // Head (no face, as the villagers).
  c.fillStyle = look.skin;
  c.beginPath();
  c.arc(0, -12.5, 2.2, 0, Math.PI * 2);
  c.fill();
  // Hair.
  c.fillStyle = look.hair;
  if (look.hairStyle !== 'bald') {
    c.beginPath();
    c.arc(0, -13.2, 2.2, Math.PI, 0);
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
  else drawLord(c, look, size / 2, size * 0.86, size / 21, arms);
  return cv;
}
