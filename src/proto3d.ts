// A test page for the 3D view: the same town as the game, built from the
// game's own drawings. Open proto3d.html?seed=4242&years=8; [ and ] turn the
// view, the wheel zooms.
import * as THREE from 'three';
import { playBot } from './game/autoplay';
import { generateWorld } from './game/world';
import { buildTown, isoCamera } from './render3d/scene3d';

const q = new URLSearchParams(location.search);
const s = generateWorld(Number(q.get('seed') ?? 4242));
playBot(s, Number(q.get('years') ?? 8), 3);
if (q.get('day')) while (s.day % 120 !== Number(q.get('day'))) s.day++;
const hall = s.buildings.find((b) => b.type === 'townhall')!;
const center = { x: hall.x + 2 + Number(q.get('dx') ?? 0), y: hall.y + 4 + Number(q.get('dy') ?? 0) };
const town = buildTown(s, center, 32);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

let turn = Number(q.get('turn') ?? 0);
let zoom = Number(q.get('zoom') ?? 1.2);
const draw = () => renderer.render(town.scene, isoCamera(innerWidth, innerHeight, center, zoom, turn));
addEventListener('keydown', (e) => {
  if (e.key === '[') turn -= Math.PI / 12;
  if (e.key === ']') turn += Math.PI / 12;
  draw();
});
addEventListener('wheel', (e) => {
  zoom *= e.deltaY > 0 ? 0.9 : 1.1;
  draw();
});
draw();
(window as unknown as { proto: unknown }).proto = { draw, setTurn: (t: number) => { turn = t; draw(); } };
