/**
 * A horse in profile, as small as the villagers: drawn standing at (x, y)
 * between its hooves, facing `dir` (1 right, -1 left). `step` drives the
 * walk; a saddled horse wears a caparison in the given colour.
 */
export function drawHorse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  opts: { coat?: string; step?: number; walking?: boolean; cloth?: string; trim?: string } = {},
): void {
  const coat = opts.coat ?? '#7a5236';
  const dark = '#3e2a1c';
  const step = opts.step ?? 0;
  const walking = opts.walking ?? false;
  const leg = walking ? Math.sin(step * 1.4) * 1.8 : 0;
  const bob = walking ? Math.abs(Math.sin(step * 1.4)) * 0.6 : 0;
  c.save();
  c.translate(x, y);
  if (dir < 0) c.scale(-1, 1);
  // Shadow.
  c.fillStyle = 'rgba(20,20,10,0.25)';
  c.beginPath();
  c.ellipse(0, 0, 9, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  // Legs: far pair darker, near pair over the body's edge.
  c.lineCap = 'round';
  c.strokeStyle = shadeOf(coat);
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-4.5, -6 - bob);
  c.lineTo(-4.5 - leg, 0);
  c.moveTo(4.5, -6 - bob);
  c.lineTo(4.5 + leg, 0);
  c.stroke();
  // Tail.
  c.strokeStyle = dark;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(-6.6, -10 - bob);
  c.quadraticCurveTo(-9, -8 - bob, -8.4 + Math.sin(step) * 0.6, -3.5 - bob);
  c.stroke();
  // Body.
  c.fillStyle = coat;
  c.beginPath();
  c.ellipse(0, -9 - bob, 7, 3.4, 0, 0, Math.PI * 2);
  c.fill();
  // Neck and head.
  c.beginPath();
  c.moveTo(4.2, -10.5 - bob);
  c.lineTo(7.6, -16 - bob);
  c.lineTo(10.6, -14.2 - bob);
  c.lineTo(10.9, -12.6 - bob);
  c.lineTo(8.6, -12.4 - bob);
  c.lineTo(6.8, -8.4 - bob);
  c.closePath();
  c.fill();
  // Mane and ear.
  c.fillStyle = dark;
  c.beginPath();
  c.moveTo(4.4, -11.4 - bob);
  c.lineTo(7.4, -16.4 - bob);
  c.lineTo(8.2, -15.6 - bob);
  c.lineTo(5.6, -10.6 - bob);
  c.closePath();
  c.fill();
  c.fillRect(7.6, -17.4 - bob, 0.9, 1.6);
  // Near legs.
  c.strokeStyle = coat;
  c.lineWidth = 1.7;
  c.beginPath();
  c.moveTo(-3.4, -6.5 - bob);
  c.lineTo(-3.4 + leg, 0);
  c.moveTo(3.6, -6.5 - bob);
  c.lineTo(3.6 - leg, 0);
  c.stroke();
  c.fillStyle = dark;
  for (const hx of [-3.4 + leg, 3.6 - leg]) c.fillRect(hx - 0.9, -0.8, 1.8, 0.9);
  // A caparison in the lord's colours, and the saddle.
  if (opts.cloth) {
    c.fillStyle = opts.cloth;
    c.beginPath();
    c.moveTo(-5.4, -11.6 - bob);
    c.lineTo(4.2, -11.6 - bob);
    c.lineTo(5, -5.4 - bob);
    c.lineTo(-6, -5.4 - bob);
    c.closePath();
    c.fill();
    c.fillStyle = opts.trim ?? '#e8c048';
    c.fillRect(-6, -6.2 - bob, 11, 0.9);
    c.fillStyle = '#4a2e1c';
    c.beginPath();
    c.ellipse(-0.4, -12.2 - bob, 3, 1.1, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function shadeOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.72);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
