import type { ResourceId } from '../game/types';

const svg = (body: string) =>
  `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<ResourceId | 'people' | 'happy' | 'materials' | 'goods' | 'storage' | 'granary' | 'road' | 'paved' | 'demolish' | 'grove' | 'cal', string> = {
  wood: svg(
    '<rect x="2" y="7" width="15" height="6" rx="3" fill="#7a5230"/><ellipse cx="16" cy="10" rx="2.4" ry="3" fill="#d8b47c"/><ellipse cx="16" cy="10" rx="1" ry="1.3" fill="#9a7346"/><path d="M4 9h8M5 11h7" stroke="#5a3a20" stroke-width=".8"/>',
  ),
  stone: svg(
    '<path d="M3 15l2-6 5-3 5 2 2 6-4 2H6z" fill="#9d9a92"/><path d="M5 9l5-3 5 2-4 2z" fill="#c4c1b9"/><path d="M11 10l4-2 2 6-4 2z" fill="#7d7a72"/>',
  ),
  planks: svg(
    '<rect x="2" y="5" width="16" height="3" fill="#d8b47c" stroke="#8a6236" stroke-width=".6"/><rect x="2" y="9" width="16" height="3" fill="#c8a46c" stroke="#8a6236" stroke-width=".6"/><rect x="2" y="13" width="16" height="3" fill="#d8b47c" stroke="#8a6236" stroke-width=".6"/>',
  ),
  iron: svg(
    '<path d="M3 13l3-5h8l3 5z" fill="#7d8088"/><path d="M6 8h8l-1-2H7z" fill="#a4a8b0"/><path d="M3 13h14v2H3z" fill="#5a5d64"/>',
  ),
  tools: svg(
    '<path d="M5 16L13 8" stroke="#7a5230" stroke-width="2" stroke-linecap="round"/><path d="M11 3l5 5-2 2-5-5z" fill="#9aa0a8"/><path d="M15 16L8 9" stroke="#7a5230" stroke-width="1.6" stroke-linecap="round"/><path d="M4 5c2-2 5-1 5 1l-2 2c-1-2-2-2-3-3z" fill="#b8bcc4"/>',
  ),
  berries: svg(
    '<path d="M10 3c0 3 2 4 4 4" stroke="#3f7a35" stroke-width="1.4" fill="none"/><circle cx="7" cy="11" r="3" fill="#c42b3a"/><circle cx="12" cy="13" r="3" fill="#a8243a"/><circle cx="9" cy="15.5" r="2.6" fill="#5a2a6e"/><circle cx="6" cy="10" r=".9" fill="#f08a9a"/>',
  ),
  meat: svg(
    '<path d="M4 12c0-5 6-8 10-5s1 9-4 9c-3 0-6-1-6-4z" fill="#b0463a"/><path d="M6 12c1-3 4-4 6-3" stroke="#e8b0a0" stroke-width="1.2" fill="none"/><path d="M13 6l3-3" stroke="#eee6d6" stroke-width="2.2" stroke-linecap="round"/>',
  ),
  fish: svg(
    '<path d="M2 10c3-4 9-4 12 0-3 4-9 4-12 0z" fill="#8aa6b8"/><path d="M14 10l4-3v6z" fill="#6a8698"/><circle cx="6" cy="9.3" r=".9" fill="#1a2a3a"/>',
  ),
  grain: svg(
    '<path d="M10 18V5" stroke="#b08a3a" stroke-width="1.2"/><g fill="#e0b84a"><ellipse cx="8" cy="7" rx="1.5" ry="2.6" transform="rotate(-25 8 7)"/><ellipse cx="12" cy="7" rx="1.5" ry="2.6" transform="rotate(25 12 7)"/><ellipse cx="8" cy="11" rx="1.5" ry="2.6" transform="rotate(-25 8 11)"/><ellipse cx="12" cy="11" rx="1.5" ry="2.6" transform="rotate(25 12 11)"/><ellipse cx="10" cy="4" rx="1.4" ry="2.4"/></g>',
  ),
  bread: svg(
    '<path d="M3 13c0-5 3-7 7-7s7 2 7 7c0 2-2 3-7 3s-7-1-7-3z" fill="#c8904a"/><path d="M7 8l-1 3M10 7v3M13 8l1 3" stroke="#f0d09a" stroke-width="1.2" stroke-linecap="round"/>',
  ),
  gold: svg(
    '<circle cx="10" cy="10" r="7" fill="#d8a838"/><circle cx="10" cy="10" r="5.2" fill="#e8c860" stroke="#b08a2a" stroke-width=".8"/><path d="M10 6.5v7M8 8.2h3.2a1.2 1.2 0 010 2.4H8.8a1.2 1.2 0 000 2.4H12" stroke="#a07a20" stroke-width="1" fill="none"/>',
  ),
  prestige: svg(
    '<path d="M4 15l-1-9 4 3 3-5 3 5 4-3-1 9z" fill="#c8a038" stroke="#7a5a18" stroke-width=".8"/><path d="M4 15h12v2H4z" fill="#8a2a3a"/><circle cx="10" cy="11" r="1.4" fill="#c42b3a"/><circle cx="6.5" cy="12" r=".9" fill="#3a6ab0"/><circle cx="13.5" cy="12" r=".9" fill="#3a6ab0"/>',
  ),
  firewood: svg(
    '<path d="M4 15l6-9 6 9z" fill="none"/><rect x="3" y="12" width="14" height="3.4" rx="1.2" fill="#8a5a30"/><rect x="5" y="8.6" width="10" height="3.4" rx="1.2" fill="#9a6a3a"/><rect x="7" y="5.2" width="6" height="3.4" rx="1.2" fill="#8a5a30"/><g fill="#d8b47c"><circle cx="3.8" cy="13.7" r="1.1"/><circle cx="5.8" cy="10.3" r="1.1"/><circle cx="7.8" cy="6.9" r="1.1"/></g>',
  ),
  woodparts: svg(
    '<circle cx="10" cy="10" r="5.5" fill="#a8783e" stroke="#5e3e22"/><circle cx="10" cy="10" r="2" fill="#5e3e22"/><g stroke="#5e3e22" stroke-width="2.2"><path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2 2M13.7 13.7l2 2M4.3 15.7l2-2M13.7 6.3l2-2"/></g>',
  ),
  dressedstone: svg(
    '<path d="M3 9l7-3 7 3v6l-7 3-7-3z" fill="#b8b4aa"/><path d="M3 9l7 3 7-3-7-3z" fill="#d6d2c8"/><path d="M10 12v6" stroke="#8a867c"/><path d="M6.5 7.5l7 3" stroke="#a8a49a" stroke-width=".6"/>',
  ),
  clay: svg('<path d="M3 14c0-4 3-6 7-6s7 2 7 6c0 2-3 3-7 3s-7-1-7-3z" fill="#b0643a"/><path d="M6 11c2-1 5-1 8 0" stroke="#d08a5a" stroke-width="1.2" fill="none"/>'),
  tiles: svg(
    '<g fill="#b8483a" stroke="#7a2a20" stroke-width=".6"><path d="M2 8c2-2 4-2 5 0v4c-1-2-3-2-5 0z"/><path d="M7.5 8c2-2 4-2 5 0v4c-1-2-3-2-5 0z"/><path d="M13 8c2-2 4-2 5 0v4c-1-2-3-2-5 0z"/><path d="M4.5 12c2-2 4-2 5 0v4c-1-2-3-2-5 0z"/><path d="M10 12c2-2 4-2 5 0v4c-1-2-3-2-5 0z"/></g>',
  ),
  ore: svg('<path d="M3 15l2-6 5-3 5 2 2 6-4 2H6z" fill="#6a5a50"/><g fill="#c8743a"><circle cx="8" cy="10" r="1.3"/><circle cx="12" cy="12" r="1.1"/><circle cx="7" cy="14" r=".9"/><circle cx="13" cy="9" r=".8"/></g>'),
  pork: svg('<path d="M3 12c0-4 4-6 8-6s6 3 6 6-3 5-7 5-7-2-7-5z" fill="#e89a8a"/><path d="M6 11c2-2 6-2 8 0" stroke="#fff0e8" stroke-width="1.6" fill="none"/><path d="M5 14c3 1 6 1 9 0" stroke="#c87060" stroke-width="1" fill="none"/>'),
  eggs: svg('<ellipse cx="7.5" cy="11.5" rx="3.3" ry="4.2" fill="#f2e8d4" stroke="#b8a888" stroke-width=".6"/><ellipse cx="13" cy="12.5" rx="3" ry="3.8" fill="#d8b890" stroke="#a88858" stroke-width=".6"/>'),
  mushrooms: svg('<path d="M3 10c0-4 4-6 7-6s7 2 7 6z" fill="#a8603a"/><g fill="#f2e8d4"><circle cx="7" cy="7" r="1"/><circle cx="12" cy="6.5" r=".8"/><circle cx="14" cy="8.5" r=".7"/></g><path d="M8 10h4v6c0 1-4 1-4 0z" fill="#efe2c8"/>'),
  vegetables: svg('<path d="M10 9c-4 0-6 3-5 6s4 3 5 3 4 0 5-3-1-6-5-6z" fill="#7a9a4a"/><path d="M10 9c-2 2-2 6 0 9M10 9c2 2 2 6 0 9" stroke="#5a7a3a" fill="none"/><path d="M10 9l-3-6M10 9l3-6M10 9V3" stroke="#4a8a3a" stroke-width="1.4"/>'),
  apples: svg('<path d="M10 6c-4-2-7 1-6 5s3 7 6 6c3 1 5-2 6-6s-2-7-6-5z" fill="#c4322a"/><path d="M10 6c0-2 1-3 2-4" stroke="#5a3a20" stroke-width="1.2" fill="none"/><path d="M11 4c2-1 4 0 4 1-2 1-3 0-4-1z" fill="#4a8a3a"/><ellipse cx="7" cy="9" rx="1" ry="1.6" fill="#f08a7a"/>'),
  pears: svg('<path d="M10 4c-2 0-2 4-3 6-2 2-2 7 3 7s5-5 3-7c-1-2-1-6-3-6z" fill="#b8c040"/><path d="M10 4V2" stroke="#5a3a20" stroke-width="1.2"/><ellipse cx="8" cy="12" rx="1" ry="1.8" fill="#e0e080"/>'),
  plums: svg('<circle cx="7.5" cy="12" r="4" fill="#5a2a6e"/><circle cx="13" cy="11" r="3.6" fill="#6a3a80"/><path d="M10 7c1-2 2-3 4-4" stroke="#5a3a20" stroke-width="1.1" fill="none"/><ellipse cx="6" cy="10.5" rx=".9" ry="1.4" fill="#a888c0"/>'),
  honey: svg('<path d="M5 8h10v7c0 2-2 3-5 3s-5-1-5-3z" fill="#d8962a"/><path d="M5 8c0-1 2-2 5-2s5 1 5 2-2 2-5 2-5-1-5-2z" fill="#f0c050"/><path d="M8 6V4h4v2" stroke="#7a5a2a" stroke-width="1.4" fill="none"/>'),
  milk: svg('<path d="M6 5h8l1 3v8c0 1-1 2-2 2H7c-1 0-2-1-2-2V8z" fill="#8a6a4a"/><path d="M6 8h8" stroke="#5a3a20"/><ellipse cx="10" cy="6.2" rx="3.6" ry="1" fill="#f8f4ea"/>'),
  cheese: svg('<path d="M2 13l10-7 6 3v6l-16 0z" fill="#f0c850"/><path d="M2 13h16" stroke="#c8a030"/><g fill="#d8a838"><circle cx="7" cy="15" r="1"/><circle cx="12" cy="11" r="1.1"/><circle cx="14.5" cy="15" r=".8"/></g>'),
  barley: svg('<path d="M10 18V6" stroke="#a8905a" stroke-width="1.2"/><g fill="#d8c070"><ellipse cx="10" cy="5" rx="1.3" ry="2.2"/><ellipse cx="10" cy="8.5" rx="1.3" ry="2"/><ellipse cx="10" cy="12" rx="1.3" ry="2"/></g><path d="M10 3L8 0M11 5l3-4M9 8L6 4M11 9l3-4" stroke="#c8b070" stroke-width=".6"/>'),
  oats: svg('<path d="M10 18V4" stroke="#a8985a" stroke-width="1"/><g fill="#e0d090"><ellipse cx="7" cy="7" rx="1.2" ry="2" transform="rotate(20 7 7)"/><ellipse cx="13" cy="8" rx="1.2" ry="2" transform="rotate(-20 13 8)"/><ellipse cx="7" cy="12" rx="1.2" ry="2" transform="rotate(20 7 12)"/><ellipse cx="13" cy="13" rx="1.2" ry="2" transform="rotate(-20 13 13)"/></g><path d="M10 6L7.5 5M10 9l3-1M10 11l-3-1M10 14l3-1" stroke="#a8985a" stroke-width=".6"/>'),
  flour: svg('<path d="M5 7c0-2 10-2 10 0l1 9c0 2-12 2-12 0z" fill="#efe6d4" stroke="#a89878" stroke-width=".7"/><path d="M7 6l3-3 3 3" stroke="#a89878" fill="none"/><text x="10" y="14" font-size="5" text-anchor="middle" fill="#a89878">✦</text>'),
  flax: svg('<path d="M7 18V8M10 18V5M13 18V8" stroke="#6a8a4a" stroke-width="1.1"/><g fill="#6a8ad8"><circle cx="7" cy="7" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="13" cy="7" r="1.6"/></g>'),
  wool: svg('<g fill="#f2ece0" stroke="#c8bca8" stroke-width=".6"><circle cx="7" cy="9" r="3.4"/><circle cx="12" cy="8" r="3.4"/><circle cx="9.5" cy="12.5" r="3.6"/><circle cx="14" cy="12" r="2.8"/></g>'),
  hides: svg('<path d="M4 4c2 1 4 1 6 0 2 1 4 1 6 0l-1 4 1 4-2 4c-2-1-6-1-8 0l-2-4 1-4z" fill="#b08458" stroke="#7a5a38" stroke-width=".7"/>'),
  leather: svg('<path d="M4 4c2 1 4 1 6 0 2 1 4 1 6 0l-1 4 1 4-2 4c-2-1-6-1-8 0l-2-4 1-4z" fill="#7a4a2a" stroke="#4a2a18" stroke-width=".7"/><path d="M6 7h8M6 13h8" stroke="#a8784a" stroke-width=".6" stroke-dasharray="1 1"/>'),
  cloth: svg('<path d="M3 6h12a2 2 0 010 4H3z" fill="#5a7ab0"/><path d="M3 10h12a2 2 0 010 4H3z" fill="#4a6a9a"/><path d="M3 6v8" stroke="#2a3a5a"/><path d="M5 6v4M8 6v4M11 6v4" stroke="#7a9ad0" stroke-width=".5"/>'),
  clothes: svg('<path d="M7 3l3 2 3-2 4 3-2 3-2-1v9H7V8L5 9 3 6z" fill="#8a3b2e"/><path d="M7 11h6" stroke="#c89a4a" stroke-width="1.2"/>'),
  boots: svg('<path d="M5 3h5v8l6 2c1 1 1 3 0 4H5z" fill="#6a3e22"/><path d="M5 15h11" stroke="#3a2010" stroke-width="1.4"/><path d="M5 5h5" stroke="#a87a4a"/>'),
  ale: svg('<path d="M5 6h8v10c0 1-1 2-2 2H7c-1 0-2-1-2-2z" fill="#a87a3a" stroke="#5a3a20" stroke-width=".7"/><path d="M13 8h2c1 0 2 1 2 2v2c0 1-1 2-2 2h-2" stroke="#5a3a20" stroke-width="1.2" fill="none"/><path d="M4 6c0-2 2-3 3-2 1-2 4-2 5 0 1-1 3 0 2 2z" fill="#f8f0d8"/>'),
  cider: svg('<path d="M7 3h6v3l2 3v8c0 1-1 1-1 1H6s-1 0-1-1V9l2-3z" fill="#d8a83a" stroke="#7a5a20" stroke-width=".7"/><path d="M7 3h6" stroke="#5a3a20" stroke-width="1.4"/><circle cx="10" cy="13" r="2.2" fill="#c4322a"/>'),
  herbs: svg('<path d="M10 18V6M10 10l-4-3M10 13l4-3M10 8l3-4" stroke="#4a7a3a" stroke-width="1.1"/><g fill="#6aa04a"><ellipse cx="6" cy="7" rx="2" ry="1.1"/><ellipse cx="14" cy="10" rx="2" ry="1.1"/><ellipse cx="13" cy="4" rx="1.8" ry="1"/><ellipse cx="10" cy="5" rx="1" ry="1.8"/></g>'),
  medicine: svg('<path d="M7 3h6v3l2 2v9c0 1-1 1-1 1H6s-1 0-1-1V8l2-2z" fill="#6aa0a0" stroke="#3a6060" stroke-width=".7"/><path d="M7 3h6" stroke="#5a3a20" stroke-width="1.6"/><path d="M10 10v5M7.5 12.5h5" stroke="#f8f4ea" stroke-width="1.6"/>'),
  materials: svg(
    '<rect x="2" y="11" width="10" height="4" rx="2" fill="#7a5230"/><ellipse cx="12" cy="13" rx="1.6" ry="2" fill="#d8b47c"/><rect x="4" y="7" width="9" height="4" rx="2" fill="#8a6236"/><ellipse cx="13" cy="9" rx="1.6" ry="2" fill="#d8b47c"/><path d="M12 16l2-5 3-1 2 3-1 3z" fill="#a8a49a"/>',
  ),
  goods: svg(
    '<path d="M3 8h9v9H3z" fill="#a87a48" stroke="#5e3e22" stroke-width=".8"/><path d="M3 8l3-3h9l-3 3z" fill="#c8985a" stroke="#5e3e22" stroke-width=".8"/><path d="M12 8l3-3v9l-3 3z" fill="#8a5e34" stroke="#5e3e22" stroke-width=".8"/><path d="M3 12.5h9M7.5 8v9" stroke="#5e3e22" stroke-width=".6"/>',
  ),
  silver: svg('<path d="M3 13l3-5h8l3 5z" fill="#b8bcc4"/><path d="M6 8h8l-1-2H7z" fill="#e0e4ea"/><path d="M3 13h14v2H3z" fill="#8a8e96"/><path d="M8 9.5l1.5 1" stroke="#fff" stroke-width=".8"/>'),
  grapes: svg('<path d="M10 4c1-2 3-2 4-2" stroke="#5a3a20" stroke-width="1.2" fill="none"/><path d="M11 4c2-1 4 0 4 2-2 0-3-1-4-2z" fill="#4a8a3a"/><g fill="#6a3a80"><circle cx="7" cy="7" r="2"/><circle cx="11" cy="7" r="2"/><circle cx="9" cy="10" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="11" cy="13" r="2"/><circle cx="9" cy="16" r="2"/></g>'),
  mead: svg('<path d="M7 3h6v3l2 3v8c0 1-1 1-1 1H6s-1 0-1-1V9l2-3z" fill="#c88a28" stroke="#6a4210" stroke-width=".7"/><path d="M7 3h6" stroke="#7a5a3a" stroke-width="1.6"/><path d="M13 9c2 0 3 1 3 3s-1 3-3 3" fill="none" stroke="#6a4210" stroke-width=".9"/><rect x="7" y="11" width="5" height="3" fill="#f0d890"/>'),
  wine: svg('<path d="M8 2h4v4c2 1 3 3 3 5v6c0 1-1 1-1 1H6s-1 0-1-1v-6c0-2 1-4 3-5z" fill="#5a1a2a" stroke="#2a0a14" stroke-width=".7"/><path d="M8 2h4" stroke="#7a5a3a" stroke-width="1.6"/><rect x="7" y="10" width="6" height="4" fill="#e8dcc4"/>'),
  paper: svg('<path d="M5 3h8l3 3v11H5z" fill="#f4ecd8" stroke="#a89878" stroke-width=".7"/><path d="M13 3v3h3" fill="none" stroke="#a89878" stroke-width=".7"/><path d="M7 9h7M7 11.5h7M7 14h5" stroke="#c8b898" stroke-width=".7"/>'),
  books: svg('<rect x="3" y="5" width="4" height="12" fill="#8a3b2e"/><rect x="7.5" y="3" width="4" height="14" fill="#3a5a8a"/><rect x="12" y="6" width="5" height="11" fill="#3d7a3a" transform="rotate(8 14 11)"/><path d="M3 8h4M7.5 6h4M3 14h4M7.5 14h4" stroke="#d8b84a" stroke-width=".8"/>'),
  jewellery: svg('<circle cx="10" cy="11" r="5" fill="none" stroke="#d8a838" stroke-width="2.2"/><path d="M7 5l3-3 3 3-3 3z" fill="#6ab0e8" stroke="#3a6a9a" stroke-width=".6"/><circle cx="8" cy="9" r=".7" fill="#fff8d8"/>'),
  weapons: svg('<path d="M4 17L15 4" stroke="#7a5230" stroke-width="1.6"/><path d="M15 4l2-2-.5 3z" fill="#b8bcc4"/><path d="M5 3c6 2 9 6 11 13" stroke="#6b4a2e" stroke-width="1.6" fill="none"/><path d="M5 3l11 13" stroke="#e8dcc4" stroke-width=".5"/><path d="M8 11l4 4-2 2-4-4z" fill="#9aa0a8"/>'),
  people: svg(
    '<circle cx="7" cy="6" r="2.6" fill="#e8c4a0"/><path d="M2.5 17c0-4 2-6 4.5-6s4.5 2 4.5 6z" fill="#8a3b2e"/><circle cx="13.5" cy="7" r="2.3" fill="#e8c4a0"/><path d="M9.5 17c0-3.5 1.8-5.2 4-5.2s4 1.7 4 5.2z" fill="#4a5e8a"/>',
  ),
  happy: svg(
    '<circle cx="10" cy="10" r="7.5" fill="#e8c860" stroke="#a07a20" stroke-width=".8"/><circle cx="7.5" cy="8.5" r="1" fill="#3a2a1a"/><circle cx="12.5" cy="8.5" r="1" fill="#3a2a1a"/><path d="M6.5 11.5c1.5 2.5 5.5 2.5 7 0" stroke="#3a2a1a" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  ),
  storage: svg(
    '<path d="M3 8l7-4 7 4v9H3z" fill="#9a7247"/><path d="M2 8l8-5 8 5" stroke="#5e3e22" stroke-width="1.4" fill="none"/><rect x="7" y="11" width="6" height="6" fill="#5b3a22"/>',
  ),
  granary: svg(
    '<path d="M4 9h12v8H4z" fill="#c9a050"/><path d="M3 9l7-5 7 5z" fill="#8a6236"/><path d="M5 17v2M15 17v2" stroke="#5e4129" stroke-width="1.6"/><ellipse cx="8" cy="13" rx="2" ry="2.4" fill="#e0c070"/><ellipse cx="12.5" cy="13" rx="2" ry="2.4" fill="#d8b860"/>',
  ),
  paved: svg(
    '<path d="M5 18L8 2h4l3 16z" fill="#8a8274"/><g fill="#c2bbad"><ellipse cx="9" cy="5" rx="1.3" ry=".8"/><ellipse cx="11.2" cy="5.2" rx="1" ry=".8"/><ellipse cx="8.4" cy="9" rx="1.4" ry=".9"/><ellipse cx="11.4" cy="9" rx="1.4" ry=".9"/><ellipse cx="7.6" cy="14" rx="1.6" ry="1"/><ellipse cx="10.2" cy="14.2" rx="1.4" ry="1"/><ellipse cx="12.8" cy="14" rx="1.5" ry="1"/></g>',
  ),
  road: svg('<path d="M6 18L9 2h2l3 16z" fill="#a88a5c"/><path d="M10 4v2M10 9v2M10 14v2" stroke="#e8d8b0" stroke-width="1"/>'),
  demolish: svg(
    '<path d="M4 16l8-8" stroke="#7a5230" stroke-width="2.2" stroke-linecap="round"/><path d="M10 4l6 6-3 1-4-4z" fill="#8a8e94"/><path d="M13 14l3 3M15 13l2 1M12 16l1 2" stroke="#c84a2a" stroke-width="1.2" stroke-linecap="round"/>',
  ),
  grove: svg('<path d="M10 2l5 8h-3l4 6H4l4-6H5z" fill="#4d8a3a"/><rect x="9" y="15" width="2" height="4" fill="#7a5230"/><path d="M2 18h16" stroke="#c89a38" stroke-width="1.4" stroke-dasharray="2 1.5"/>'),
  cal: svg(
    '<rect x="3" y="4" width="14" height="13" rx="1.5" fill="#f1e4c3" stroke="#6b4a2b"/><path d="M3 8h14" stroke="#6b4a2b"/><path d="M7 3v3M13 3v3" stroke="#6b4a2b" stroke-width="1.4"/>',
  ),
};

export const SEASON_ICONS = [
  svg('<path d="M10 17V9" stroke="#3f7a35" stroke-width="1.4"/><circle cx="10" cy="7" r="3" fill="#e48ab0"/><circle cx="10" cy="7" r="1.2" fill="#f2d34a"/><path d="M10 13c-3 0-4-2-4-3 2 0 4 1 4 3z" fill="#5d9a3a"/>'),
  svg('<circle cx="10" cy="10" r="4" fill="#f2c84a"/><g stroke="#f2c84a" stroke-width="1.5" stroke-linecap="round"><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></g>'),
  svg('<path d="M10 3c4 2 6 6 4 10-2 3-6 3-8 0-2-4 0-8 4-10z" fill="#c97b2a"/><path d="M10 4v13" stroke="#7a4a1a" stroke-width="1"/>'),
  svg('<g stroke="#8ab4d8" stroke-width="1.6" stroke-linecap="round"><path d="M10 2v16M3 6l14 8M3 14l14-8"/></g><circle cx="10" cy="10" r="1.6" fill="#c8e0f0"/>'),
];

/** Icons for the build menu categories. */
export const CATEGORY_ICONS: Record<string, string> = {
  housing: svg('<path d="M3 10l7-6 7 6v7H3z" fill="#eadcbf" stroke="#5b3a22"/><path d="M2 10.5L10 3.5l8 7" stroke="#c49a52" stroke-width="2.2" fill="none" stroke-linejoin="round"/><rect x="8.5" y="12" width="3" height="5" fill="#5b3a22"/>'),
  resources: svg('<path d="M5 17L13 6" stroke="#7a5230" stroke-width="2" stroke-linecap="round"/><path d="M11 3l5 3-2.5 3-5-3z" fill="#9aa0a8"/><rect x="3" y="14" width="9" height="3.5" rx="1.7" fill="#8a6236"/>'),
  farming: svg('<path d="M10 18V6" stroke="#b08a3a" stroke-width="1.3"/><g fill="#e0b84a"><ellipse cx="7.8" cy="8" rx="1.6" ry="2.8" transform="rotate(-25 7.8 8)"/><ellipse cx="12.2" cy="8" rx="1.6" ry="2.8" transform="rotate(25 12.2 8)"/><ellipse cx="7.8" cy="12.5" rx="1.6" ry="2.8" transform="rotate(-25 7.8 12.5)"/><ellipse cx="12.2" cy="12.5" rx="1.6" ry="2.8" transform="rotate(25 12.2 12.5)"/><ellipse cx="10" cy="4.5" rx="1.5" ry="2.6"/></g>'),
  food: svg('<path d="M3 13c0-5 3-7 7-7s7 2 7 7c0 2-2 3-7 3s-7-1-7-3z" fill="#c8904a" stroke="#7a5230" stroke-width=".6"/><path d="M7 8l-1 3M10 7v3M13 8l1 3" stroke="#f0d09a" stroke-width="1.2" stroke-linecap="round"/>'),
  industry: svg('<path d="M3 12h11l2-3H6z" fill="#5d6068"/><path d="M6 12h6v2H6z" fill="#4a4d52"/><path d="M5 14h8l1 3H4z" fill="#6d7078"/><path d="M14 4l3 3-6 6-3-3z" fill="#8a6236"/>'),
  civic: svg('<path d="M4 17V8h12v9" fill="#b0a898" stroke="#6d6558"/><path d="M3 8l7-5 7 5z" fill="#5d6670"/><path d="M10 1v4" stroke="#d8b84a" stroke-width="1.2"/><rect x="8.5" y="12" width="3" height="5" fill="#4a2f1b"/>'),
  decor: svg('<path d="M10 18v-7" stroke="#3f7a35" stroke-width="1.4"/><circle cx="10" cy="7" r="2" fill="#f2d34a"/><g fill="#e84a6a"><circle cx="10" cy="4" r="2"/><circle cx="13" cy="7" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="7" cy="7" r="2"/></g><circle cx="10" cy="7" r="1.6" fill="#f2d34a"/><path d="M10 15c-3 0-4-2-4-3 2 0 4 1 4 3z" fill="#5d9a3a"/>'),
  scroll: svg('<rect x="4" y="3" width="12" height="14" rx="1.5" fill="#f1e4c3" stroke="#6b4a2b"/><path d="M7 7h6M7 10h6M7 13h4" stroke="#6b4a2b" stroke-width="1.1"/>'),
  menu: svg('<path d="M4 6h12M4 10h12M4 14h12" stroke="#3b2a1a" stroke-width="2" stroke-linecap="round"/>'),
};
