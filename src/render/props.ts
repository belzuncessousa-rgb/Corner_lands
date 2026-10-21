import type { Building, Season } from '../game/types';
import { Pen, iso, type V3 } from './pen';

/**
 * Small pictures of a workplace's improvements, drawn beside it as it stands:
 * a crane over the quarry, kennels by the hunting camp, a cart at the
 * trading post. Each sits in its own spot along the building's front.
 */
export function drawImprovements(ctx: CanvasRenderingContext2D, b: Building, season: Season, time: number): void {
  const list = b.improved;
  if (!list?.length) return;
  const p = new Pen(ctx);
  const snow = season === 3;
  // Spots just outside the front walls: along the right face, then the left.
  const spots: [number, number][] = [
    [b.x + b.w + 0.3, b.y + b.h - 0.45],
    [b.x + 0.45, b.y + b.h + 0.3],
    [b.x + b.w + 0.3, b.y + 0.45],
    [b.x + b.w - 0.45, b.y + b.h + 0.3],
  ];
  list.forEach((id, k) => {
    const [x, y] = spots[k % spots.length];
    const draw = PROPS[id];
    if (draw) draw(p, x, y, b, snow, time);
  });
}

type Prop = (p: Pen, x: number, y: number, b: Building, snow: boolean, time: number) => void;

const ROOF = '#7a4b2e';
const SNOW = '#eef2f4';
const WOODC = '#8a6238';
const DARK = '#4a3020';

/** A little lean-to shed: posts, a sloping roof, open at the front. */
function shed(p: Pen, x: number, y: number, snow: boolean, wall = '#9a7247'): void {
  p.shadow(x - 0.25, y - 0.2, x + 0.25, y + 0.2);
  p.box(x - 0.22, y - 0.18, x + 0.22, y + 0.18, 0, 9, wall);
  p.poly(
    [
      [x - 0.28, y - 0.24, 14],
      [x + 0.28, y - 0.24, 14],
      [x + 0.28, y + 0.24, 8],
      [x - 0.28, y + 0.24, 8],
    ],
    snow ? SNOW : ROOF,
  );
}

function cart(p: Pen, x: number, y: number, big = false): void {
  const l = big ? 0.32 : 0.25;
  p.shadow(x - l, y - 0.15, x + l, y + 0.15);
  p.box(x - l, y - 0.12, x + l, y + 0.12, 4, 4, WOODC, '#a67c4a');
  for (const wx of [x - l * 0.6, x + l * 0.6]) {
    const [sx, sy] = iso(wx, y + 0.13, 3.5);
    p.ctx.strokeStyle = DARK;
    p.ctx.lineWidth = 1.2;
    p.ctx.beginPath();
    p.ctx.ellipse(sx, sy, 2.6, 3.4, 0, 0, Math.PI * 2);
    p.ctx.stroke();
  }
  p.line([x + l, y, 6], [x + l + 0.3, y - 0.05, 4], DARK, 1);
  // The load sits on the cart bed.
  p.sack(x - 0.06, y - 0.02, undefined, 8);
  if (big) p.sack(x + 0.12, y + 0.01, '#cdbb8e', 8);
}

const PROPS: Record<string, Prop> = {
  oxshed: (p, x, y, _b, snow) => {
    shed(p, x, y, snow);
    // The yoke hung on the post.
    p.line([x + 0.24, y - 0.1, 7], [x + 0.24, y + 0.12, 7], DARK, 1.6);
  },
  lathe: (p, x, y, _b, snow) => {
    shed(p, x, y, snow);
    const [sx, sy] = iso(x, y + 0.2, 6);
    p.ctx.strokeStyle = '#5e3e22';
    p.ctx.lineWidth = 1.1;
    p.ctx.beginPath();
    p.ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
    p.ctx.stroke();
  },
  nursery: (p, x, y, _b, snow) => {
    // Rows of saplings, each tied to a stake.
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const sx = x - 0.2 + i * 0.2;
        const sy = y - 0.1 + j * 0.25;
        p.line([sx, sy, 0], [sx, sy, 7], '#6b4a2e', 0.8);
        if (!snow) p.circle(sx, sy, 7, 2.2, j % 2 ? '#5a8a3a' : '#6a9a44');
      }
  },
  crane: (p, x, y, _b, _snow, time) => {
    // An A-frame of poles with a jib, a rope and a stone swinging below.
    p.line([x - 0.2, y + 0.1, 0], [x, y, 34], WOODC, 2);
    p.line([x + 0.2, y - 0.1, 0], [x, y, 34], WOODC, 2);
    const swing = Math.sin(time * 0.8 + x) * 0.05;
    const tip: V3 = [x - 0.55 + swing, y + 0.35, 30];
    p.line([x, y, 32], tip, WOODC, 1.6);
    p.line(tip, [tip[0], tip[1], 12], '#3a3028', 0.7);
    p.box(tip[0] - 0.08, tip[1] - 0.06, tip[0] + 0.08, tip[1] + 0.06, 8, 4, '#a8a093');
  },
  firingchamber: (p, x, y, _b, snow) => {
    p.ellipse(x + 0.04, y + 0.03, 0, 11, 5.5, 'rgba(30,30,10,0.22)');
    p.ellipse(x, y, 4, 9, 6, '#a4523a');
    p.ellipse(x, y, 9, 8, 5, snow ? SNOW : '#b8634a');
    const [sx, sy] = iso(x, y + 0.2, 3);
    p.ctx.fillStyle = '#2a1a10';
    p.ctx.fillRect(sx - 2, sy - 3, 4, 3);
  },
  ironplough: (p, x, y) => {
    p.line([x - 0.3, y, 1], [x + 0.2, y, 4], WOODC, 1.6);
    p.line([x + 0.2, y, 4], [x + 0.35, y - 0.05, 9], WOODC, 1.2);
    p.poly(
      [
        [x - 0.32, y - 0.02, 0],
        [x - 0.18, y - 0.02, 0],
        [x - 0.22, y, 4],
      ],
      '#6a6a70',
    );
  },
  herbgarden: (p, x, y, _b, snow) => {
    p.fence([x - 0.3, y - 0.2], [x + 0.3, y - 0.2]);
    p.fence([x + 0.3, y - 0.2], [x + 0.3, y + 0.25]);
    if (snow) return;
    const greens = ['#6a9a44', '#8ab05a', '#5a8a6a', '#a0b860'];
    for (let i = 0; i < 6; i++) p.bush(x - 0.2 + (i % 3) * 0.18, y - 0.05 + Math.floor(i / 3) * 0.2, 2.2, greens[i % greens.length]);
  },
  fishingboat: (p, x, y) => {
    // A rowing boat drawn up on the bank, oars across it.
    p.shadow(x - 0.32, y - 0.12, x + 0.32, y + 0.12);
    p.poly(
      [
        [x - 0.35, y, 5],
        [x + 0.35, y, 5],
        [x + 0.22, y, 0],
        [x - 0.22, y, 0],
      ],
      '#7a5230',
    );
    p.poly(
      [
        [x - 0.35, y, 5],
        [x + 0.35, y, 5],
        [x + 0.28, y - 0.12, 5],
        [x - 0.28, y - 0.12, 5],
      ],
      '#5e3e22',
    );
    p.line([x - 0.2, y - 0.2, 6], [x + 0.25, y + 0.1, 6], '#b08a58', 1);
  },
  kennels: (p, x, y, _b, snow, time) => {
    // A kennel with a pitched roof and an arched door, in a little fenced run.
    const x0 = x - 0.35;
    const y0 = y - 0.25;
    p.fence([x0, y0], [x0 + 0.75, y0], '#7b5a36');
    p.fence([x0, y0], [x0, y0 + 0.6], '#7b5a36');
    p.shadow(x0 + 0.05, y0 + 0.05, x0 + 0.35, y0 + 0.3);
    p.box(x0 + 0.05, y0 + 0.05, x0 + 0.33, y0 + 0.28, 0, 6, '#9a7247');
    const [dx, dy] = iso(x0 + 0.33, y0 + 0.17, 0);
    p.ctx.fillStyle = '#2a1a10';
    p.ctx.beginPath();
    p.ctx.ellipse(dx + 1, dy - 1, 1.6, 3.2, 0, Math.PI, 0);
    p.ctx.fill();
    p.roofX(x0 + 0.05, y0 + 0.05, x0 + 0.33, y0 + 0.28, 6, 5, snow ? 'thatch' : 'shingle', '#9a7247', 0.04);
    // One hound sits by the kennel; the other trots up and down the run.
    hound(p.ctx, ...iso(x0 + 0.3, y0 + 0.45, 0), 1, true, time);
    const t = (Math.sin(time * 0.9 + x) + 1) / 2;
    const run: [number, number] = [x0 + 0.5 + t * 0.15, y0 + 0.15 + t * 0.35];
    hound(p.ctx, ...iso(run[0], run[1], 0), Math.cos(time * 0.9 + x) > 0 ? 1 : -1, false, time);
    p.fence([x0 + 0.75, y0], [x0 + 0.75, y0 + 0.6], '#7b5a36');
    p.fence([x0, y0 + 0.6], [x0 + 0.75, y0 + 0.6], '#7b5a36');
  },
  bellows: (p, x, y) => {
    p.box(x - 0.2, y - 0.08, x + 0.2, y + 0.08, 2, 3, '#5e3e22');
    p.poly(
      [
        [x - 0.2, y, 5],
        [x + 0.2, y, 5],
        [x + 0.05, y, 10],
        [x - 0.12, y, 10],
      ],
      '#8a5a3a',
    );
    p.line([x + 0.2, y, 4], [x + 0.4, y - 0.05, 3], '#3a3028', 1.5);
  },
  farrier: (p, x, y) => {
    // An anvil on its block and a horseshoe sign.
    p.box(x - 0.08, y - 0.08, x + 0.08, y + 0.08, 0, 4, '#6b4a2e');
    p.box(x - 0.13, y - 0.05, x + 0.13, y + 0.05, 4, 3, '#4a4a50', '#5a5a62');
    p.line([x + 0.25, y - 0.2, 0], [x + 0.25, y - 0.2, 16], DARK, 1.2);
    const [sx, sy] = iso(x + 0.25, y - 0.2, 14);
    p.ctx.strokeStyle = '#7a7a82';
    p.ctx.lineWidth = 1.6;
    p.ctx.beginPath();
    p.ctx.arc(sx + 3, sy, 2.4, 0.2 * Math.PI, 0.8 * Math.PI, true);
    p.ctx.stroke();
  },
  deepshaft: (p, x, y) => {
    // A headframe over the shaft, with its winding wheel.
    for (const [dx, dy] of [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ])
      p.line([x + dx, y + dy, 0], [x, y, 28], WOODC, 1.4);
    const [sx, sy] = iso(x, y, 28);
    p.ctx.strokeStyle = DARK;
    p.ctx.lineWidth = 1.2;
    p.ctx.beginPath();
    p.ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    p.ctx.stroke();
    p.line([x, y, 24], [x, y, 2], '#3a3028', 0.6);
  },
  sundayschool: (p, x, y, _b, snow) => {
    shed(p, x, y, snow, '#e2d4b6');
    // A slate board by the door.
    p.box(x + 0.24, y + 0.05, x + 0.27, y + 0.2, 2, 7, '#3a3a40');
  },
  infirmary: (p, x, y, _b, snow, time) => {
    shed(p, x, y, snow, '#e2d4b6');
    // Clean linen drying on a line.
    p.line([x - 0.25, y + 0.35, 0], [x - 0.25, y + 0.35, 10], DARK, 0.8);
    p.line([x + 0.25, y + 0.35, 0], [x + 0.25, y + 0.35, 10], DARK, 0.8);
    p.line([x - 0.25, y + 0.35, 10], [x + 0.25, y + 0.35, 10], '#5a4a3a', 0.5);
    const sway = Math.sin(time * 1.5 + x) * 0.6;
    for (const dx of [-0.12, 0.08])
      p.poly(
        [
          [x + dx, y + 0.35, 10],
          [x + dx + 0.12, y + 0.35, 10],
          [x + dx + 0.12, y + 0.35, 4 + sway],
          [x + dx, y + 0.35, 4 + sway],
        ],
        '#f4f0e6',
      );
  },
  goodscart: (p, x, y) => cart(p, x, y),
  oxcarts: (p, x, y) => cart(p, x, y, true),
  mountedguard: (p, x, y) => {
    // A hitching rail for the watch's horses.
    p.line([x - 0.3, y, 0], [x - 0.3, y, 8], DARK, 1.3);
    p.line([x + 0.3, y, 0], [x + 0.3, y, 8], DARK, 1.3);
    p.line([x - 0.32, y, 8], [x + 0.32, y, 8], WOODC, 1.5);
    p.sack(x, y + 0.2, '#c8b070');
  },
  // ---- upgrades: the building is rebuilt; a telling detail beside it.
  towermill: (p, x, y) => p.stonePile(x, y, 3),
  secondcopper: (p, x, y) => {
    p.shadow(x - 0.15, y - 0.15, x + 0.15, y + 0.15);
    p.ellipse(x, y, 4, 6, 5, '#b8703a');
    p.ellipse(x, y, 8, 5, 2.4, '#d08848');
  },
  cheesecellar: (p, x, y) => {
    // The cellar hatch, and cheeses set out to dry.
    p.poly(
      [
        [x - 0.18, y - 0.12, 0],
        [x + 0.18, y - 0.12, 0],
        [x + 0.18, y + 0.12, 4],
        [x - 0.18, y + 0.12, 4],
      ],
      '#6b4a2e',
    );
    for (let i = 0; i < 3; i++) p.ellipse(x - 0.15 + i * 0.15, y + 0.3, 1.5, 3, 1.5, '#e8c460');
  },
  broadloom: (p, x, y) => {
    for (let i = 0; i < 3; i++) p.box(x - 0.2 + i * 0.13, y - 0.05, x - 0.1 + i * 0.13, y + 0.05, i * 0.5, 3, ['#b8483a', '#e8dcc0', '#3a5a8a'][i]);
  },
  crownglass: (p, x, y) => {
    // Spun crowns of glass leaning on a rack.
    p.line([x - 0.2, y, 8], [x + 0.2, y, 8], WOODC, 1);
    for (let i = 0; i < 2; i++) {
      const [sx, sy] = iso(x - 0.08 + i * 0.16, y + 0.02, 5);
      p.ctx.fillStyle = 'rgba(160,210,220,0.85)';
      p.ctx.beginPath();
      p.ctx.ellipse(sx, sy, 2.6, 4, 0.2, 0, Math.PI * 2);
      p.ctx.fill();
    }
  },
  secondvat: (p, x, y) => {
    p.shadow(x - 0.18, y - 0.18, x + 0.18, y + 0.18);
    p.ellipse(x, y, 3, 7, 3.5, '#7a5230');
    p.ellipse(x, y, 6.5, 6, 2.6, '#c8d4d8');
  },
  masonslodge: (p, x, y, _b, snow) => {
    shed(p, x, y, snow, '#b0a89a');
    p.box(x - 0.1, y + 0.3, x + 0.1, y + 0.42, 0, 4, '#c8c0b2');
  },
  pump: (p, _x, _y, b) => {
    // The pump's iron handle over the well head.
    const x = b.x + b.w / 2 + 0.25;
    const y = b.y + b.h / 2 + 0.25;
    p.box(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 12, '#5a5a62');
    p.line([x, y, 12], [x - 0.2, y + 0.1, 15], '#3a3a40', 1.3);
  },
  tradecentre: (p, x, y) => {
    p.crate(x - 0.15, y);
    p.barrel(x + 0.12, y + 0.05);
    p.crate(x, y + 0.25);
  },
  hugeships: (p, x, y, _b, _snow, time) => {
    // The masts of a great ship at the quay.
    const sway = Math.sin(time * 0.7 + x) * 0.03;
    p.line([x, y, 0], [x + sway, y, 52], '#5e3e22', 2);
    p.line([x + 0.25, y + 0.1, 0], [x + 0.25 + sway, y + 0.1, 40], '#5e3e22', 1.6);
    p.line([x - 0.2, y, 44], [x + 0.2, y, 44], '#5e3e22', 1);
    p.poly(
      [
        [x - 0.18, y, 43],
        [x + 0.18, y, 43],
        [x + 0.2 + sway, y, 26],
        [x - 0.2 + sway, y, 26],
      ],
      '#efe6d2',
    );
  },
  bigstable: (p, x, y, _b, snow) => {
    shed(p, x, y, snow);
    p.sack(x + 0.1, y + 0.3, '#c8b070');
  },
};

/** Animal sheds in a pasture's back corner: a long open-fronted shelter with hay in its racks. */
export function pastureShed(p: Pen, x: number, y: number, snow: boolean): void {
  p.shadow(x, y, x + 1.3, y + 0.55);
  p.box(x, y, x + 1.3, y + 0.12, 0, 14, '#8a6238');
  p.box(x, y, x + 0.1, y + 0.55, 0, 14, '#8a6238');
  for (const px of [0.45, 0.88, 1.28]) p.line([x + px, y + 0.53, 0], [x + px, y + 0.53, 12], DARK, 1.4);
  if (!snow) for (let k = 0; k < 3; k++) p.ellipse(x + 0.3 + k * 0.38, y + 0.25, 2, 6, 3, '#d8b860');
  p.poly(
    [
      [x - 0.05, y - 0.05, 17],
      [x + 1.38, y - 0.05, 17],
      [x + 1.38, y + 0.62, 11],
      [x - 0.05, y + 0.62, 11],
    ],
    snow ? SNOW : ROOF,
    '#3d2614',
    0.6,
  );
}

/** A hound: brown and white, ears down, tail up; sitting, or trotting with its legs going. */
function hound(c: CanvasRenderingContext2D, sx: number, sy: number, dir: number, sitting: boolean, time: number): void {
  const coat = '#8a5a32';
  const pale = '#efe6d4';
  c.save();
  c.translate(sx, sy);
  c.scale(dir * 1.5, 1.5);
  c.fillStyle = 'rgba(30,24,12,0.22)';
  c.beginPath();
  c.ellipse(0, 0, 4.5, 1.4, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = coat;
  c.lineWidth = 1;
  if (sitting) {
    // Haunches down, chest up, forelegs straight.
    c.fillStyle = coat;
    c.beginPath();
    c.ellipse(-1.2, -2.2, 2.6, 2.2, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(1, -4.2, 1.6, 2.6, -0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = pale;
    c.beginPath();
    c.ellipse(1.6, -3.6, 0.9, 1.8, -0.3, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(1.4, -2.2);
    c.lineTo(1.4, 0);
    c.moveTo(2.2, -2.2);
    c.lineTo(2.2, 0);
    c.strokeStyle = pale;
    c.stroke();
    c.save();
    c.translate(1.8, -7);
  } else {
    // Body level, legs swinging, tail up.
    const sw = Math.sin(time * 12) * 1.2;
    c.beginPath();
    c.moveTo(-2.5, -3);
    c.lineTo(-2.5 + sw, 0);
    c.moveTo(-1.6, -3);
    c.lineTo(-1.6 - sw, 0);
    c.moveTo(1.8, -3);
    c.lineTo(1.8 - sw, 0);
    c.moveTo(2.6, -3);
    c.lineTo(2.6 + sw, 0);
    c.stroke();
    c.fillStyle = coat;
    c.beginPath();
    c.ellipse(0, -3.6, 3.6, 1.7, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = pale;
    c.beginPath();
    c.ellipse(0.4, -3, 2.2, 0.8, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-3.4, -4);
    c.quadraticCurveTo(-5, -6, -4.6, -7.4);
    c.strokeStyle = coat;
    c.stroke();
    c.save();
    c.translate(3.6, -5.6);
  }
  // The head: skull, a long muzzle with a dark nose, a drooping ear.
  c.fillStyle = coat;
  c.beginPath();
  c.ellipse(0, 0, 1.6, 1.4, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(1.6, 0.5, 1.4, 0.8, 0.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#2a1a10';
  c.beginPath();
  c.arc(2.9, 0.6, 0.45, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#5a3a1e';
  c.beginPath();
  c.ellipse(-0.6, 0.8, 0.7, 1.4, 0.3, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.restore();
}
