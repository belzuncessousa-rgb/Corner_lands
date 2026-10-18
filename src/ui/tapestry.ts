import { type LordLook, drawLord } from '../render/lord';

/**
 * Woven scenes for the charter tapestries: villagers at the work of each
 * path, in the flat colours and simple shapes of a hanging, drawn into a
 * canvas of w x h CSS pixels.
 */
export function drawTapestry(cv: HTMLCanvasElement, path: string, color: string, w: number, h: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const c = cv.getContext('2d');
  if (!c) return;
  c.scale(dpr, dpr);
  // The ground of the weave: the path's colour, darkened, with a field of tiny flowers.
  c.fillStyle = shadeHex(color, 0.55);
  c.fillRect(0, 0, w, h);
  const rand = mulberry(path.length * 97 + path.charCodeAt(0));
  for (let k = 0; k < 40; k++) {
    c.fillStyle = ['#e8d8a8', '#c8a038', '#a8c080', '#d88a7a'][k % 4];
    c.globalAlpha = 0.35;
    const x = rand() * w;
    const y = rand() * h * 0.6;
    c.fillRect(x, y, 1.6, 1.6);
    c.fillRect(x - 1.6, y + 1.6, 1.6, 1.6);
    c.fillRect(x + 1.6, y + 1.6, 1.6, 1.6);
    c.fillRect(x, y + 3.2, 1.6, 1.6);
  }
  c.globalAlpha = 1;
  // A green sward along the bottom.
  c.fillStyle = '#4a6a34';
  c.beginPath();
  c.moveTo(0, h * 0.78);
  c.quadraticCurveTo(w * 0.5, h * 0.7, w, h * 0.78);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.closePath();
  c.fill();
  for (let x = 4; x < w; x += 7) {
    c.fillStyle = '#6a8a44';
    c.fillRect(x, h * 0.8 + (x % 3), 1.4, 4);
  }
  const ground = h * 0.86;
  const S = h / 70;
  const folk = (x: number, look: Partial<LordLook>, flip = false) => {
    c.save();
    c.translate(x, ground);
    if (flip) c.scale(-1, 1);
    drawLord(c, { skin: '#e8c4a0', hair: '#5a3a22', hairStyle: 'short', hat: 'none', hatColor: '#7a4a2a', garment: 'tunic', cloth: '#a8322d', ...look }, 0, 0, S);
    c.restore();
  };
  switch (path) {
    case 'metal': {
      // A smith at the anvil, hammer raised, the forge glowing behind.
      c.fillStyle = '#5a5048';
      c.fillRect(w * 0.6, ground - 34 * S * 0.6, w * 0.3, 34 * S * 0.6);
      c.fillStyle = '#f08a2a';
      c.beginPath();
      c.arc(w * 0.75, ground - 12 * S * 0.6, 6 * S * 0.6, Math.PI, 0);
      c.fill();
      c.fillStyle = '#4a4d52';
      c.fillRect(w * 0.42, ground - 9 * S, 12 * S, 3 * S);
      c.fillRect(w * 0.42 + 4 * S, ground - 6 * S, 4 * S, 6 * S);
      folk(w * 0.28, { cloth: '#6a4a2a', hat: 'cap', hatColor: '#3a2a1a' });
      c.strokeStyle = '#3a2a1a';
      c.lineWidth = 1.4 * S * 0.6;
      c.beginPath();
      c.moveTo(w * 0.28 + 2 * S, ground - 9 * S);
      c.lineTo(w * 0.28 + 7 * S, ground - 17 * S);
      c.stroke();
      c.fillStyle = '#6a6e74';
      c.fillRect(w * 0.28 + 5.5 * S, ground - 19 * S, 4 * S, 2.4 * S);
      // Sparks.
      c.fillStyle = '#f8d060';
      for (let k = 0; k < 6; k++) c.fillRect(w * 0.48 + k * 2 * S, ground - 12 * S - (k % 3) * 2 * S, 1.2, 1.2);
      break;
    }
    case 'orchard': {
      // A tree heavy with apples, a picker with a basket.
      c.fillStyle = '#5a3e26';
      c.fillRect(w * 0.62, ground - 26 * S, 3 * S, 26 * S);
      c.fillStyle = '#3d7a3a';
      c.beginPath();
      c.arc(w * 0.62 + 1.5 * S, ground - 30 * S, 12 * S, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#c8322a';
      for (let k = 0; k < 9; k++) {
        c.beginPath();
        c.arc(w * 0.62 + (rand() - 0.5) * 18 * S, ground - 30 * S + (rand() - 0.5) * 16 * S, 1.6 * S, 0, Math.PI * 2);
        c.fill();
      }
      folk(w * 0.3, { garment: 'dress', cloth: '#5a7ab0', hairStyle: 'braid', hair: '#8a5a2a' });
      c.fillStyle = '#9a7247';
      c.beginPath();
      c.ellipse(w * 0.3 + 5 * S, ground - 7 * S, 3.5 * S, 2.4 * S, 0, 0, Math.PI);
      c.fill();
      c.fillStyle = '#c8322a';
      c.fillRect(w * 0.3 + 3 * S, ground - 8.4 * S, 2 * S, 1.6 * S);
      break;
    }
    case 'learning': {
      // A scholar at a lectern, a shelf of books.
      c.fillStyle = '#7a5a3a';
      c.fillRect(w * 0.58, ground - 14 * S, 2 * S, 14 * S);
      c.beginPath();
      c.moveTo(w * 0.58 - 5 * S, ground - 14 * S);
      c.lineTo(w * 0.58 + 7 * S, ground - 17 * S);
      c.lineTo(w * 0.58 + 7 * S, ground - 15 * S);
      c.lineTo(w * 0.58 - 5 * S, ground - 12 * S);
      c.closePath();
      c.fill();
      c.fillStyle = '#f2ece0';
      c.fillRect(w * 0.58 - 3 * S, ground - 17 * S, 9 * S, 2.6 * S);
      const books = ['#a8322d', '#2e5e9a', '#3d7a3a', '#c8962a', '#6a3a7a'];
      for (let k = 0; k < 5; k++) {
        c.fillStyle = books[k];
        c.fillRect(w * 0.72 + k * 3 * S, ground - 30 * S, 2.4 * S, 9 * S);
      }
      c.fillStyle = '#7a5a3a';
      c.fillRect(w * 0.7, ground - 21 * S, 18 * S, 1.4 * S);
      folk(w * 0.35, { garment: 'dress', cloth: '#2a2420', hat: 'hood', hatColor: '#2a2420' });
      break;
    }
    case 'nature': {
      // Two trees, a deer, a hunter with a bow.
      for (const [x, r] of [[0.75, 11], [0.9, 8]] as const) {
        c.fillStyle = '#5a3e26';
        c.fillRect(w * x, ground - 22 * S, 2.4 * S, 22 * S);
        c.fillStyle = '#2f5a28';
        c.beginPath();
        c.moveTo(w * x - r * S, ground - 14 * S);
        c.lineTo(w * x + 1.2 * S, ground - 40 * S);
        c.lineTo(w * x + r * S + 2.4 * S, ground - 14 * S);
        c.closePath();
        c.fill();
      }
      // The deer.
      c.fillStyle = '#9a6a3a';
      c.beginPath();
      c.ellipse(w * 0.55, ground - 9 * S, 6 * S, 3 * S, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(w * 0.55 - 5 * S, ground - 7 * S, 1.2 * S, 7 * S);
      c.fillRect(w * 0.55 + 4 * S, ground - 7 * S, 1.2 * S, 7 * S);
      c.fillRect(w * 0.55 + 5 * S, ground - 15 * S, 1.6 * S, 6 * S);
      c.beginPath();
      c.ellipse(w * 0.55 + 7 * S, ground - 15 * S, 2.6 * S, 1.6 * S, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#5a3e26';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(w * 0.55 + 6 * S, ground - 16 * S);
      c.lineTo(w * 0.55 + 4 * S, ground - 21 * S);
      c.lineTo(w * 0.55 + 2 * S, ground - 22 * S);
      c.moveTo(w * 0.55 + 4 * S, ground - 21 * S);
      c.lineTo(w * 0.55 + 6 * S, ground - 23 * S);
      c.stroke();
      folk(w * 0.22, { cloth: '#3d7a3a', hat: 'hood', hatColor: '#3d6a30' });
      c.strokeStyle = '#7a4a2a';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(w * 0.22 + 4 * S, ground - 10 * S, 5 * S, -Math.PI / 2, Math.PI / 2);
      c.stroke();
      break;
    }
    case 'trade': {
      // A merchant's cart piled with bales, a merchant with a purse of coin.
      c.fillStyle = '#8a6236';
      c.fillRect(w * 0.5, ground - 10 * S, 22 * S, 4 * S);
      c.strokeStyle = '#4a3020';
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(w * 0.5 + 5 * S, ground - 4 * S, 4 * S, 0, Math.PI * 2);
      c.arc(w * 0.5 + 17 * S, ground - 4 * S, 4 * S, 0, Math.PI * 2);
      c.stroke();
      for (const [dx, col] of [[1, '#e8d8a8'], [7, '#c8a46c'], [13, '#5a7ab0']] as const) {
        c.fillStyle = col;
        c.fillRect(w * 0.5 + dx * S, ground - 17 * S, 6 * S, 7 * S);
      }
      folk(w * 0.28, { cloth: '#c8962a', hat: 'feather', hatColor: '#6a3a7a' });
      c.fillStyle = '#d8b04a';
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        c.arc(w * 0.28 + 5 * S + k * 1.6 * S, ground - 2 * S, 1.3 * S, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'farm': {
      // Golden wheat, a reaper with a sickle, sheaves standing.
      c.strokeStyle = '#d8b44a';
      c.lineWidth = 1;
      for (let x = w * 0.5; x < w * 0.95; x += 2.4) {
        c.beginPath();
        c.moveTo(x, ground);
        c.lineTo(x + (rand() - 0.5) * 2, ground - 16 * S - rand() * 4 * S);
        c.stroke();
      }
      c.fillStyle = '#e8c860';
      for (let x = w * 0.5; x < w * 0.95; x += 2.4) c.fillRect(x - 0.6, ground - 18 * S - (x % 3), 1.6, 3);
      c.fillStyle = '#c8a040';
      c.beginPath();
      c.moveTo(w * 0.1, ground);
      c.lineTo(w * 0.14, ground - 12 * S);
      c.lineTo(w * 0.18, ground);
      c.closePath();
      c.fill();
      folk(w * 0.33, { cloth: '#a8862a', hat: 'cap', hatColor: '#e8d8a8' });
      c.strokeStyle = '#b8bcc4';
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(w * 0.33 + 6 * S, ground - 9 * S, 3 * S, -Math.PI / 2, Math.PI / 3);
      c.stroke();
      break;
    }
    case 'herd': {
      // Sheep grazing and a shepherd with a crook.
      for (const [x, y] of [[0.55, 0], [0.72, 3], [0.86, -1]] as const) {
        c.fillStyle = '#f2ece0';
        c.beginPath();
        c.ellipse(w * x, ground - 6 * S + y, 5 * S, 3.4 * S, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#3a2c20';
        c.beginPath();
        c.ellipse(w * x + 5 * S, ground - 7 * S + y, 1.8 * S, 1.4 * S, 0, 0, Math.PI * 2);
        c.fill();
        c.fillRect(w * x - 3 * S, ground - 3 * S + y, 1 * S, 3 * S);
        c.fillRect(w * x + 2 * S, ground - 3 * S + y, 1 * S, 3 * S);
      }
      folk(w * 0.28, { cloth: '#8a6a44', hat: 'hood', hatColor: '#6a5a40' });
      c.strokeStyle = '#5a3e26';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(w * 0.28 + 4 * S, ground);
      c.lineTo(w * 0.28 + 4 * S, ground - 22 * S);
      c.arc(w * 0.28 + 6 * S, ground - 22 * S, 2 * S, Math.PI, 0);
      c.stroke();
      break;
    }
  }
  // A woven border of little diamonds round the scene.
  c.fillStyle = '#c8a038';
  for (let x = 2; x < w; x += 6) {
    c.fillRect(x, 1, 2.4, 2.4);
    c.fillRect(x, h - 3.4, 2.4, 2.4);
  }
}

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
