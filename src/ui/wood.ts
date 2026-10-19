/**
 * Painted wood for signboards and plaques: planks of grain with a knot or
 * two, drawn once into images the stylesheet uses (`--wood-img`, `--wood-img-dark`,
 * `--wood-pale` and `--wood-frame`).
 */

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A board of grain, `w` by `h`, in the given tones (light, mid, dark). */
function paintWood(w: number, h: number, tones: [string, string, string], seed: number): string {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  if (!c) return '';
  const rand = mulberry(seed);
  const base = c.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, tones[0]);
  base.addColorStop(0.5, tones[1]);
  base.addColorStop(1, tones[0]);
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);
  // Broad bands of lighter and darker wood.
  for (let k = 0; k < 9; k++) {
    const y = rand() * h;
    const bh = 10 + rand() * h * 0.12;
    c.fillStyle = rand() < 0.5 ? 'rgba(255,235,190,0.07)' : 'rgba(40,20,5,0.08)';
    c.fillRect(0, y, w, bh);
  }
  // Knots the grain bends around.
  const knots = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => ({ x: w * (0.1 + rand() * 0.8), y: h * (0.15 + rand() * 0.7), r: 5 + rand() * 7 }));
  const lines = Math.round(h / 3.2);
  for (let k = 0; k < lines; k++) {
    const y0 = (k + rand() * 0.8) * (h / lines);
    const a1 = 0.6 + rand() * 1.6;
    const f1 = 0.004 + rand() * 0.006;
    const ph = rand() * 6.28;
    c.strokeStyle = `rgba(${rand() < 0.75 ? '45,22,6' : '255,230,180'},${0.06 + rand() * 0.2})`;
    c.lineWidth = 0.5 + rand() * 1.6;
    c.beginPath();
    for (let x = 0; x <= w; x += 4) {
      let y = y0 + Math.sin(x * f1 + ph) * a1 + Math.sin(x * 0.031 + ph * 2) * 0.4;
      for (const kn of knots) {
        const dx = x - kn.x;
        const dy = y0 - kn.y;
        // Lines swell around a knot, more the nearer they pass.
        const pull = Math.exp(-(dx * dx) / (2 * (kn.r * 5) ** 2)) * Math.exp(-(dy * dy) / (2 * (kn.r * 3) ** 2));
        y += Math.sign(dy || 1) * pull * kn.r * 2.2;
      }
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  for (const kn of knots) {
    for (let r = kn.r; r > 1; r -= 1.6) {
      c.strokeStyle = `rgba(40,18,4,${0.25 + (1 - r / kn.r) * 0.3})`;
      c.lineWidth = 0.8;
      c.beginPath();
      c.ellipse(kn.x, kn.y, r * 1.8, r * 0.75, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = tones[2];
    c.beginPath();
    c.ellipse(kn.x, kn.y, kn.r * 0.5, kn.r * 0.25, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Fine pores and a few cracks.
  for (let k = 0; k < w * h * 0.004; k++) {
    c.fillStyle = `rgba(30,14,2,${0.08 + rand() * 0.15})`;
    c.fillRect(rand() * w, rand() * h, 1 + rand() * 4, 0.6);
  }
  for (let k = 0; k < 3; k++) {
    const x = rand() * w;
    const y = rand() * h;
    c.strokeStyle = 'rgba(25,10,0,0.35)';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 30 + rand() * 60, y + (rand() - 0.5) * 3);
    c.stroke();
  }
  return cv.toDataURL('image/jpeg', 0.86);
}

/**
 * Woven cloth, as a see-through overlay: warp and weft threads passing over
 * and under each other, laid over any colour (`--weave`).
 */
function paintWeave(seed: number): string {
  const n = 48;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const c = cv.getContext('2d');
  if (!c) return '';
  const rand = mulberry(seed);
  const t = 3;
  for (let y = 0; y < n; y += t) {
    for (let x = 0; x < n; x += t) {
      const over = ((x + y) / t) % 2 === 0;
      const j = rand() * 0.06;
      // The thread on top catches the light along its length; the one beneath sits in shade.
      const g = over ? c.createLinearGradient(x, y, x + t, y) : c.createLinearGradient(x, y, x, y + t);
      g.addColorStop(0, `rgba(0,0,0,${0.16 + j})`);
      g.addColorStop(0.5, `rgba(255,248,230,${0.1 + j})`);
      g.addColorStop(1, `rgba(0,0,0,${0.2 + j})`);
      c.fillStyle = g;
      c.fillRect(x, y, t, t);
    }
  }
  // A few slubs: thicker bits of yarn.
  for (let k = 0; k < 10; k++) {
    c.fillStyle = `rgba(255,245,220,${0.06 + rand() * 0.08})`;
    c.fillRect(Math.floor(rand() * n), Math.floor(rand() * n / t) * t, 4 + rand() * 8, 1.4);
  }
  return cv.toDataURL('image/png');
}

/** Paints the wood once and hands it to the stylesheet. */
export function installWood(): void {
  const root = document.documentElement.style;
  root.setProperty('--wood-img', `url(${paintWood(1024, 512, ['#b98a55', '#a87842', '#5a3416'], 7)})`);
  root.setProperty('--wood-img-dark', `url(${paintWood(512, 256, ['#7a5230', '#6a4424', '#3a200c'], 19)})`);
  // Pale pine for the boards text is read from, and walnut for their frames.
  root.setProperty('--wood-pale', `url(${paintWood(768, 384, ['#e9cd9c', '#dcb985', '#a87a46'], 31)})`);
  root.setProperty('--wood-frame', `url(${paintWood(512, 256, ['#83552e', '#6b4223', '#2e1608'], 43)})`);
  root.setProperty('--weave', `url(${paintWeave(5)})`);
}
