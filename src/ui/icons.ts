import type { ResourceId } from '../game/types';

const svg = (body: string) =>
  `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<ResourceId | 'people' | 'happy' | 'materials' | 'goods' | 'storage' | 'granary' | 'road' | 'paved' | 'cobbles' | 'demolish' | 'grove' | 'cal', string> = {
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
  knowledge: svg(
    '<path d="M10 6c-2-1.4-4.6-1.6-7-1v10c2.4-.6 5-.4 7 1 2-1.4 4.6-1.6 7-1V5c-2.4-.6-5-.4-7 1z" fill="#f4ecd8" stroke="#7a5a3a" stroke-width=".8"/><path d="M10 6v10" stroke="#7a5a3a" stroke-width=".8"/><path d="M4.6 7.4c1.3-.2 2.6 0 3.8.5M4.6 9.6c1.3-.2 2.6 0 3.8.5M11.6 7.9c1.2-.5 2.5-.7 3.8-.5M11.6 10.1c1.2-.5 2.5-.7 3.8-.5" stroke="#a89878" stroke-width=".6"/><path d="M13 3.5l2.5 8" stroke="#3a6ab0" stroke-width="1"/><path d="M12.6 2.2c1.6.4 2.4 1.4 2.4 2.8l-1.4.4z" fill="#e8f0f8" stroke="#3a6ab0" stroke-width=".4"/>',
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
  strawberries: svg('<path d="M10 5c3.6 0 5.6 2.4 5 5.6-.6 3.4-3 6.4-5 6.4s-4.4-3-5-6.4C4.4 7.4 6.4 5 10 5z" fill="#d8323a"/><path d="M6.5 5.2c1-1.4 2.2-1.4 3.5-.4 1.3-1 2.5-1 3.5.4-1.2.4-2.4.6-3.5.4-1.1.2-2.3 0-3.5-.4z" fill="#4f8a3c"/><path d="M10 4.6V2.6" stroke="#4f8a3c" stroke-width="1"/><g fill="#f2d34a"><circle cx="8" cy="9" r=".45"/><circle cx="11.5" cy="8.6" r=".45"/><circle cx="9.8" cy="11.4" r=".45"/><circle cx="12.4" cy="11.6" r=".45"/><circle cx="7.6" cy="12.2" r=".45"/><circle cx="10.2" cy="14.2" r=".45"/></g>'),
  vegetables: svg('<path d="M10 9c-4 0-6 3-5 6s4 3 5 3 4 0 5-3-1-6-5-6z" fill="#7a9a4a"/><path d="M10 9c-2 2-2 6 0 9M10 9c2 2 2 6 0 9" stroke="#5a7a3a" fill="none"/><path d="M10 9l-3-6M10 9l3-6M10 9V3" stroke="#4a8a3a" stroke-width="1.4"/>'),
  apples: svg('<path d="M10 6c-4-2-7 1-6 5s3 7 6 6c3 1 5-2 6-6s-2-7-6-5z" fill="#c4322a"/><path d="M10 6c0-2 1-3 2-4" stroke="#5a3a20" stroke-width="1.2" fill="none"/><path d="M11 4c2-1 4 0 4 1-2 1-3 0-4-1z" fill="#4a8a3a"/><ellipse cx="7" cy="9" rx="1" ry="1.6" fill="#f08a7a"/>'),
  pears: svg('<path d="M10 4c-2 0-2 4-3 6-2 2-2 7 3 7s5-5 3-7c-1-2-1-6-3-6z" fill="#b8c040"/><path d="M10 4V2" stroke="#5a3a20" stroke-width="1.2"/><ellipse cx="8" cy="12" rx="1" ry="1.8" fill="#e0e080"/>'),
  plums: svg('<circle cx="7.5" cy="12" r="4" fill="#5a2a6e"/><circle cx="13" cy="11" r="3.6" fill="#6a3a80"/><path d="M10 7c1-2 2-3 4-4" stroke="#5a3a20" stroke-width="1.1" fill="none"/><ellipse cx="6" cy="10.5" rx=".9" ry="1.4" fill="#a888c0"/>'),
  honey: svg('<path d="M5 8h10v7c0 2-2 3-5 3s-5-1-5-3z" fill="#d8962a"/><path d="M5 8c0-1 2-2 5-2s5 1 5 2-2 2-5 2-5-1-5-2z" fill="#f0c050"/><path d="M8 6V4h4v2" stroke="#7a5a2a" stroke-width="1.4" fill="none"/>'),
  milk: svg('<path d="M6 5h8l1 3v8c0 1-1 2-2 2H7c-1 0-2-1-2-2V8z" fill="#8a6a4a"/><path d="M6 8h8" stroke="#5a3a20"/><ellipse cx="10" cy="6.2" rx="3.6" ry="1" fill="#f8f4ea"/>'),
  cheese: svg('<path d="M2 13l10-7 6 3v6l-16 0z" fill="#f0c850"/><path d="M2 13h16" stroke="#c8a030"/><g fill="#d8a838"><circle cx="7" cy="15" r="1"/><circle cx="12" cy="11" r="1.1"/><circle cx="14.5" cy="15" r=".8"/></g>'),
  barley: svg('<path d="M10 18V6" stroke="#a8905a" stroke-width="1.2"/><g fill="#d8c070"><ellipse cx="10" cy="5" rx="1.3" ry="2.2"/><ellipse cx="10" cy="8.5" rx="1.3" ry="2"/><ellipse cx="10" cy="12" rx="1.3" ry="2"/></g><path d="M10 3L8 0M11 5l3-4M9 8L6 4M11 9l3-4" stroke="#c8b070" stroke-width=".6"/>'),
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
  woad: svg('<path d="M10 18V9" stroke="#5a7a5a" stroke-width="1"/><path d="M10 15c-4 0-6-2-6-5 3 0 5 2 6 5zM10 13c4 0 6-2 6-5-3 0-5 2-6 5z" fill="#5f8f86"/><path d="M10 11c-2-1-2-4 0-6 2 2 2 5 0 6z" fill="#6aa098"/><g fill="#e8cf3a"><circle cx="8.5" cy="4" r="1.1"/><circle cx="11.5" cy="3.6" r="1.1"/><circle cx="10" cy="2.4" r="1"/></g>'),
  dyes: svg('<path d="M4 8h12v8a2 2 0 01-2 2H6a2 2 0 01-2-2z" fill="#8a6236" stroke="#5a3a20" stroke-width=".8"/><ellipse cx="10" cy="8" rx="6" ry="1.8" fill="#2f4fa8" stroke="#5a3a20" stroke-width=".7"/><path d="M4 11.5h12" stroke="#5a3a20" stroke-width=".6"/><path d="M13 7.6c1-2.5 3-3 4-5" stroke="#3a62c4" stroke-width="1.4" fill="none" stroke-linecap="round"/><ellipse cx="8.5" cy="7.8" rx="1.6" ry=".5" fill="#6a8ae0"/>'),
  fineclothes: svg('<path d="M7 3h6l1 3-2 1 4 11H4l4-11-2-1z" fill="#2f4fa8" stroke="#1a2a60" stroke-width=".7"/><path d="M7 3c1 1.6 5 1.6 6 0" fill="none" stroke="#d8a838" stroke-width="1"/><path d="M8 7h4" stroke="#d8a838" stroke-width="1.1"/><path d="M4.4 17.2h11.2" stroke="#d8a838" stroke-width="1"/><path d="M10 7v10" stroke="#4a6ac8" stroke-width=".7"/><circle cx="10" cy="9.4" r=".7" fill="#e8c860"/>'),
  paper: svg('<path d="M5 3h8l3 3v11H5z" fill="#f4ecd8" stroke="#a89878" stroke-width=".7"/><path d="M13 3v3h3" fill="none" stroke="#a89878" stroke-width=".7"/><path d="M7 9h7M7 11.5h7M7 14h5" stroke="#c8b898" stroke-width=".7"/>'),
  crates: svg('<path d="M3 7l7-3 7 3v8l-7 3-7-3z" fill="#b8894e" stroke="#6a4a26" stroke-width=".8"/><path d="M3 7l7 3 7-3M10 10v8M5 9.5l3 1.3v5M15 9.5l-3 1.3v5" stroke="#6a4a26" stroke-width=".7" fill="none"/>'),
  sand: svg('<path d="M2 16c2-5 5-8 8-8s6 3 8 8z" fill="#e2c98a"/><path d="M5 14c2-3 4-4.5 6-4.5" stroke="#f2e0aa" stroke-width="1.1" fill="none"/><g fill="#b89a5a"><circle cx="8" cy="13" r=".5"/><circle cx="12" cy="12" r=".5"/><circle cx="14" cy="14.5" r=".5"/><circle cx="10" cy="15" r=".5"/></g>'),
  mortar: svg('<path d="M3 12h14l-1.5 5h-11z" fill="#8a6a44" stroke="#5a4028" stroke-width=".7"/><path d="M3.6 12c1-2.5 3-3.5 6.4-3.5s5.4 1 6.4 3.5z" fill="#e8e4d8" stroke="#a8a294" stroke-width=".6"/><path d="M12 9.5l5-6.5" stroke="#6a4a2a" stroke-width="1.2" stroke-linecap="round"/><path d="M10 10.6c1.4-.6 3-.6 4.2.2" stroke="#c8c2b4" stroke-width=".7" fill="none"/>'),
  charcoal: svg('<g stroke="#121212" stroke-width=".5"><path d="M3 15l4-3 4 1 1 3-4 2z" fill="#2c2a28"/><path d="M9 12l4-4 4 2-1 4-4 1z" fill="#3a3734"/><path d="M5 11l2-4 3 1-1 3z" fill="#24221f"/></g><path d="M10 10l2-2M5 15l3-1" stroke="#6a6560" stroke-width=".6"/><circle cx="14" cy="11" r=".7" fill="#e8742a"/>'),
  glass: svg('<path d="M7 3h6v3l2 3v8H5V9l2-3z" fill="#9ad4c8" fill-opacity=".75" stroke="#4a8a80" stroke-width=".8"/><path d="M7 3h6" stroke="#4a8a80" stroke-width="1.2"/><path d="M7 10v5" stroke="#e6faf4" stroke-width="1.2" stroke-linecap="round"/><path d="M5.6 12.5h8.8" stroke="#6ab0a4" stroke-width=".5"/>'),
  stainedglass: svg('<path d="M5 18V8a5 5 0 0110 0v10z" fill="#5a5a60"/><path d="M6.2 17V8.2a3.8 3.8 0 017.6 0V17z" fill="#3a62c4"/><path d="M6.6 9a3.4 3.4 0 016.8 0z" fill="#d8a838"/><path d="M6.2 9.6h7.6v3.6H6.2z" fill="#c42b3a"/><path d="M8.6 13.2h2.8V17H8.6z" fill="#4f8a3c"/><path d="M10 4.4V17M6.2 9.6h7.6M6.2 13.2h7.6" stroke="#2a2a30" stroke-width=".7"/><circle cx="10" cy="11.4" r="1.1" fill="#f2d34a" stroke="#2a2a30" stroke-width=".5"/>'),
  pottery: svg('<path d="M7 3h6l-1 2c3 1 4 4 3 8-1 3-3 4-5 4s-4-1-5-4c-1-4 0-7 3-8z" fill="#b8583a" stroke="#6a2a18" stroke-width=".7"/><path d="M5.2 10h9.6" stroke="#e8c070" stroke-width="1.4"/><path d="M14 7c2 0 2 4 0 4" stroke="#6a2a18" stroke-width=".9" fill="none"/>'),
  books: svg('<rect x="3" y="5" width="4" height="12" fill="#8a3b2e"/><rect x="7.5" y="3" width="4" height="14" fill="#3a5a8a"/><rect x="12" y="6" width="5" height="11" fill="#3d7a3a" transform="rotate(8 14 11)"/><path d="M3 8h4M7.5 6h4M3 14h4M7.5 14h4" stroke="#d8b84a" stroke-width=".8"/>'),
  jewellery: svg('<circle cx="10" cy="11" r="5" fill="none" stroke="#d8a838" stroke-width="2.2"/><path d="M7 5l3-3 3 3-3 3z" fill="#6ab0e8" stroke="#3a6a9a" stroke-width=".6"/><circle cx="8" cy="9" r=".7" fill="#fff8d8"/>'),
  parchment: svg('<path d="M5 4c3-1 7-1 10 0v12c-3-1-7-1-10 0z" fill="#ead8b4" stroke="#9a7a50" stroke-width=".8"/><path d="M4 4.2c.6 1 .6 2 0 3M16 4.2c-.6 1-.6 2 0 3M4 13.2c.6 1 .6 2 0 3M16 13.2c-.6 1-.6 2 0 3" stroke="#9a7a50" stroke-width=".7" fill="none"/><path d="M7 7.5h6M7 10h6M7 12.5h4" stroke="#7a5a3a" stroke-width=".6"/>'),
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
  cobbles: svg('<path d="M5 18L8 2h4l3 16z" fill="#3e3228"/><g fill="#d8c096"><rect x="8.35" y="2.30" width="1.40" height="2.10" rx=".5"/><rect x="10.25" y="2.30" width="1.40" height="2.10" rx=".5"/><rect x="7.77" y="5.20" width="0.74" height="2.50" rx=".5"/><rect x="9.01" y="5.20" width="1.98" height="2.50" rx=".5"/><rect x="11.49" y="5.20" width="0.74" height="2.50" rx=".5"/><rect x="7.11" y="8.50" width="1.59" height="2.90" rx=".5"/><rect x="9.20" y="8.50" width="1.59" height="2.90" rx=".5"/><rect x="11.30" y="8.50" width="1.59" height="2.90" rx=".5"/><rect x="6.51" y="12.20" width="0.75" height="1.90" rx=".5"/><rect x="7.76" y="12.20" width="1.99" height="1.90" rx=".5"/><rect x="10.25" y="12.20" width="1.99" height="1.90" rx=".5"/><rect x="12.74" y="12.20" width="0.75" height="1.90" rx=".5"/><rect x="5.95" y="14.90" width="2.37" height="2.50" rx=".5"/><rect x="8.82" y="14.90" width="2.37" height="2.50" rx=".5"/><rect x="11.68" y="14.90" width="2.37" height="2.50" rx=".5"/></g><path d="M5 18L8 2M15 18L12 2" stroke="#2e1e14" stroke-width="1.2"/>'),
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
  manor: svg('<path d="M3 18v-8h14v8z" fill="#eadcbf" stroke="#5b3a22" stroke-width=".8"/><path d="M2 10.5L10 6l8 4.5z" fill="#a8483a" stroke="#5b3a22" stroke-width=".7"/><rect x="8.6" y="13" width="2.8" height="5" fill="#5b3a22"/><path d="M6 13h1.6M12.4 13H14" stroke="#5b3a22" stroke-width="1.2"/><path d="M6.5 4.6L7.3 1.5l1.6 1.8L10 1l1.1 2.3 1.6-1.8.8 3.1z" fill="#e8b83a" stroke="#8a6a1a" stroke-width=".5"/>'),
  works: svg('<path d="M4 18V7h3v2h2V7h2v2h2V7h3v11z" fill="#b0a898" stroke="#6d6558" stroke-width=".8"/><path d="M8.5 18v-4a1.5 1.5 0 013 0v4z" fill="#4a2f1b"/><path d="M10 7V2" stroke="#6d6558" stroke-width=".9"/><path d="M10 2l4 1.3-4 1.3z" fill="#c8483a"/><path d="M6 11h1.2M12.8 11H14" stroke="#6d6558" stroke-width="1.1"/>'),
  scroll: svg('<rect x="4" y="3" width="12" height="14" rx="1.5" fill="#f1e4c3" stroke="#6b4a2b"/><path d="M7 7h6M7 10h6M7 13h4" stroke="#6b4a2b" stroke-width="1.1"/>'),
  menu: svg('<path d="M4 6h12M4 10h12M4 14h12" stroke="#3b2a1a" stroke-width="2" stroke-linecap="round"/>'),
};

/** The game's name, signwritten on an arch like an inn sign. */
export const LOGO = `<svg class="logo" viewBox="0 0 420 132" role="img" aria-label="Corner Lands"><defs><path id="logo-arc" d="M30 118 Q210 8 390 118"/></defs><text><textPath href="#logo-arc" startOffset="50%" text-anchor="middle">Corner Lands</textPath></text></svg>`;

/**
 * Icons look painted onto the boards: one shared filter gives every icon a
 * dark brush outline, a slight wobble to its paint, and streaks of grain
 * showing through.
 * The stylesheet applies it (`filter: url(#ic-paint)`).
 */
export function installIconPaint(): void {
  if (document.getElementById('ic-paint')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <filter id="ic-paint" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="wide"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="4" result="noise"/>
      <feDisplacementMap in="wide" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="wobble"/>
      <feFlood flood-color="#3a2412"/>
      <feComposite in2="wobble" operator="in" result="outline"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.8" xChannelSelector="R" yChannelSelector="G" result="brushed"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.06 1.6" numOctaves="2" seed="9" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 0.62" result="streaks"/>
      <feComposite in="streaks" in2="brushed" operator="in" result="grained"/>
      <feMerge><feMergeNode in="outline"/><feMergeNode in="brushed"/><feMergeNode in="grained"/></feMerge>
    </filter></defs></svg>`;
  document.body.appendChild(holder.firstElementChild!);
}

/** Little pictures for buildings that make nothing to show (or nothing yet drawn). */
const B = {
  barn: svg('<path d="M3 17V9l7-5 7 5v8z" fill="#a8322d"/><path d="M2 9.5l8-6 8 6" stroke="#5a2a1a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M7.5 17v-5h5v5z" fill="#f2ece0"/><path d="M7.5 12l5 5M12.5 12l-5 5" stroke="#a8322d" stroke-width=".9"/><rect x="8.6" y="7.4" width="2.8" height="2" fill="#f2ece0"/>'),
  cow: svg('<path d="M4 9h10c2 0 3 1 3 3v2H4z" fill="#f2ece0"/><path d="M6 9h3v3H6zM11 11h3v3h-3z" fill="#3a2a1a"/><path d="M5 14v4M8 14v4M12 14v4M15 14v4" stroke="#3a2a1a" stroke-width="1.3"/><path d="M3 7c-2 0-2 4 0 5h2V7z" fill="#f2ece0"/><path d="M2.5 7l-1-2M4.5 7l1-2" stroke="#c8b898" stroke-width="1"/><ellipse cx="2.6" cy="11" rx="1.4" ry="1" fill="#e8a8a0"/>'),
  fence: svg('<path d="M4 6v12M10 4v14M16 6v12" stroke="#8a5a30" stroke-width="2.2" stroke-linecap="round"/><path d="M2 9h16M2 14h16" stroke="#a87a48" stroke-width="1.8"/><path d="M3 18h14" stroke="#4f8a3c" stroke-width="1.6"/>'),
  appletree: svg('<rect x="9" y="12" width="2.2" height="6" fill="#7a5230"/><circle cx="10" cy="8.5" r="6" fill="#4f8a3c"/><g fill="#c4322a"><circle cx="7.5" cy="7.5" r="1.2"/><circle cx="12.5" cy="9" r="1.2"/><circle cx="9.5" cy="11.4" r="1.1"/><circle cx="11" cy="5.6" r="1"/></g>'),
  waterwheel: svg('<circle cx="10" cy="10" r="7" fill="none" stroke="#8a5a30" stroke-width="1.8"/><circle cx="10" cy="10" r="1.8" fill="#5a3a20"/><g stroke="#8a5a30" stroke-width="1.4"><path d="M10 3v14M3 10h14M5 5l10 10M15 5L5 15"/></g><path d="M2 16c2-1 4 1 6 0s4 1 6 0 3 0 4 1v2H2z" fill="#4a7ab0"/>'),
  windmill: svg('<path d="M7 18l1.5-9h3L13 18z" fill="#c8a46c"/><path d="M7.6 9.2h4.8L10 6.6z" fill="#8a5a30"/><g fill="#f2ece0" stroke="#7a5230" stroke-width=".6"><path d="M10 8L8.6 2l1.8-.3z"/><path d="M10 8l6 1.4-.3 1.8z"/><path d="M10 8l1.4 6-1.8.3z"/><path d="M10 8L4 6.6l.3-1.8z"/></g><circle cx="10" cy="8" r="1" fill="#5a3a20"/><rect x="9" y="14" width="2" height="4" fill="#5a3a20"/>'),
  well: svg('<path d="M4 6h12" stroke="#7a5230" stroke-width="1.8"/><path d="M3 6.5l7-4 7 4" fill="#a8322d"/><path d="M5 6v6M15 6v6" stroke="#7a5230" stroke-width="1.6"/><path d="M10 6v5" stroke="#5a3a20" stroke-width=".8"/><rect x="8.8" y="10.4" width="2.4" height="2" fill="#8a5a30"/><path d="M4 12h12v5c0 1-12 1-12 0z" fill="#9d9a92"/><path d="M4 12h12" stroke="#5e5a52" stroke-width="1.2"/><path d="M6 15h2M11 14h3" stroke="#7d7a72" stroke-width=".8"/>'),
  silo: svg('<path d="M5 6h10v12H5z" fill="#c8a46c"/><path d="M4 6.5L10 2l6 4.5z" fill="#8a5a30"/><path d="M5 10h10M5 14h10" stroke="#8a6236" stroke-width=".8"/><rect x="8.6" y="14.5" width="2.8" height="3.5" fill="#5a3a20"/>'),
  tavern: svg('<path d="M3 4h10" stroke="#5a3a20" stroke-width="1.6"/><path d="M5 4v2M11 4v2" stroke="#5a3a20" stroke-width=".9"/><rect x="3.5" y="6" width="9" height="7" rx="1" fill="#a87a48"/><path d="M6 8h3v3.6H6z" fill="#e8c860"/><path d="M9 8.6h.9c.8 0 .8 2.4 0 2.4H9" stroke="#e8c860" stroke-width=".7" fill="none"/><path d="M6 8c0-1 3-1 3 0" fill="#fff8e6"/><path d="M14 4v14" stroke="#5a3a20" stroke-width="1.8"/><path d="M5 18h12" stroke="#4f8a3c" stroke-width="1.6"/>'),
  stall: svg('<path d="M3 8l2-4h10l2 4z" fill="#f2ece0"/><path d="M5 4l-.7 4M8.3 4l-.3 4M11.7 4l.3 4M15 4l.7 4" stroke="#a8322d" stroke-width="1.5"/><path d="M3 8h14" stroke="#a8322d" stroke-width="1.6"/><path d="M4.5 8v10M15.5 8v10" stroke="#7a5230" stroke-width="1.4"/><rect x="4" y="12" width="12" height="3" fill="#a87a48"/><circle cx="7" cy="11.3" r="1.1" fill="#c4322a"/><circle cx="10" cy="11.3" r="1.1" fill="#e8b84a"/><circle cx="13" cy="11.3" r="1.1" fill="#7a9a4a"/>'),
  boat: svg('<path d="M2 11h16l-2.5 4h-11z" fill="#8a5a30"/><path d="M2 11h16" stroke="#5a3a20" stroke-width="1"/><path d="M10 11V2" stroke="#5a3a20" stroke-width="1.2"/><path d="M10.6 3l5 6.5h-5z" fill="#f2ece0"/><path d="M2 16.5c2-1 4 1 6 0s4 1 6 0 3 0 4 1V19H2z" fill="#4a7ab0"/>'),
  hall: svg('<path d="M2 9l8-6 8 6z" fill="#a8322d"/><path d="M3 9h14v9H3z" fill="#e8dcc0"/><g fill="#7a5230"><path d="M4.5 18v-5c0-2 3-2 3 0v5z"/><path d="M8.5 18v-5c0-2 3-2 3 0v5z"/><path d="M12.5 18v-5c0-2 3-2 3 0v5z"/></g><path d="M3 9h14" stroke="#5a2a1a" stroke-width="1"/>'),
  scales: svg('<path d="M10 3v14M6 18h8" stroke="#7a5230" stroke-width="1.6" stroke-linecap="round"/><path d="M3 5h14" stroke="#c8962a" stroke-width="1.4"/><path d="M4 5l-2 6h4zM16 5l-2 6h4z" fill="none" stroke="#a87a3a" stroke-width=".7"/><path d="M1.6 11c0 1.5 4.8 1.5 4.8 0zM13.6 11c0 1.5 4.8 1.5 4.8 0z" fill="#d8a838"/><circle cx="10" cy="3" r="1.2" fill="#d8a838"/>'),
  cathedral: svg('<path d="M3 18V8l2-5 2 5v10zM13 18V8l2-5 2 5v10z" fill="#b0a898"/><path d="M7 18v-7l3-3 3 3v7z" fill="#c8c0b0"/><path d="M8.6 18v-3c0-1.6 2.8-1.6 2.8 0v3z" fill="#5a3a20"/><circle cx="10" cy="11.6" r="1.4" fill="#3a6ab0"/><g fill="#5d6670"><path d="M3 8l2-5 2 5z"/><path d="M13 8l2-5 2 5z"/></g><path d="M5 9.5v2M15 9.5v2" stroke="#5a3a20" stroke-width="1"/>'),
  guild: svg('<path d="M3 18V8h14v10z" fill="#d8c8a8"/><path d="M2 8.5L10 3l8 5.5z" fill="#5d6670"/><path d="M5 18v-6h3v6zM12 18v-6h3v6z" fill="#7a5230"/><path d="M10 3V0.5" stroke="#5a3a20" stroke-width=".9"/><path d="M10.4 0.6h4l-1 1 1 1h-4z" fill="#c8962a"/><circle cx="10" cy="10.5" r="1.6" fill="#c8962a"/>'),
  wall: svg('<path d="M2 8h3V6h2.5v2h3V6h2.5v2h3V6H18v12H2z" fill="#a8a49a"/><g stroke="#7d7a72" stroke-width=".8"><path d="M2 11h16M2 14.5h16M6 8v3M12 8v3M9 11v3.5M15 11v3.5M5 14.5V18M12 14.5V18"/></g>'),
  tower: svg('<path d="M6 18V7h8v11z" fill="#a8a49a"/><path d="M5 7V4h2v1.6h2V4h2v1.6h2V4h2v3z" fill="#b8b4aa"/><path d="M9 18v-3c0-1.4 2-1.4 2 0v3z" fill="#5a3a20"/><rect x="9.2" y="9" width="1.6" height="2.6" fill="#3a2a1a"/><path d="M14 4V1" stroke="#5a3a20" stroke-width=".8"/><path d="M14.4 1.2h3l-.8.9.8.9h-3z" fill="#a8322d"/>'),
  manor: svg('<path d="M3 18V9h14v9z" fill="#e8dcc0"/><path d="M2 9.5L10 4l8 5.5z" fill="#a8322d"/><path d="M8.5 18v-4h3v4z" fill="#7a5230"/><path d="M4.5 11h2.4v2H4.5zM13.1 11h2.4v2h-2.4z" fill="#5a4a6a"/><path d="M10 4V0.8" stroke="#5a3a20" stroke-width=".9"/><path d="M10.4 0.9h4.4l-1.1 1.1 1.1 1.1h-4.4z" fill="#2e5e9a"/><path d="M3 9.4h14" stroke="#5a2a1a" stroke-width=".9"/>'),
  tent: svg('<path d="M10 3l8 14H2z" fill="#e8dcc0"/><path d="M10 3l2.5 14h-5z" fill="#c8b898"/><path d="M10 3v14" stroke="#8a7a5a" stroke-width=".8"/><path d="M10 3V1" stroke="#5a3a20" stroke-width="1"/><path d="M1 17.5h18" stroke="#7a5230" stroke-width="1.4"/>'),
  bench: svg('<rect x="9.2" y="10" width="1.8" height="7" fill="#7a5230"/><circle cx="10" cy="7.5" r="4.5" fill="#4f8a3c"/><path d="M2 14h6M2.6 14v3M7.4 14v3M12 14h6M12.6 14v3M17.4 14v3" stroke="#8a5a30" stroke-width="1.4"/><path d="M1 17.5h18" stroke="#c8a46c" stroke-width="1.2"/>'),
  hedge: svg('<path d="M2 17v-6c0-3 3-4 4-2 0-3 4-3 4 0 0-3 4-3 4 0 1-2 4-1 4 2v6z" fill="#3d7a3a"/><g fill="#5a9a4a"><circle cx="6" cy="11" r="1"/><circle cx="11" cy="10" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="8" cy="14" r=".9"/></g><path d="M1 17.5h18" stroke="#7a5230" stroke-width="1.2"/>'),
  flowerbed: svg('<path d="M2 14h16l-1.5 4h-13z" fill="#8a5a30"/><g stroke="#3f7a35" stroke-width="1.1"><path d="M5 14V9M10 14V7M15 14V9"/></g><circle cx="5" cy="8" r="2" fill="#e84a6a"/><circle cx="10" cy="6" r="2.2" fill="#f2d34a"/><circle cx="15" cy="8" r="2" fill="#8a6ad8"/><g fill="#fff4dc"><circle cx="5" cy="8" r=".7"/><circle cx="10" cy="6" r=".8"/><circle cx="15" cy="8" r=".7"/></g>'),
  shrine: svg('<path d="M5 18h10l-1-2H6z" fill="#9d9a92"/><path d="M7 16V8h6v8z" fill="#b8b4aa"/><path d="M6 8.5l4-4 4 4z" fill="#5d6670"/><path d="M10 9.5v4.5M8.4 11.2h3.2" stroke="#c8962a" stroke-width="1.2"/><circle cx="5" cy="15.5" r="1.2" fill="#e84a6a"/>'),
  fountain: svg('<path d="M2 14h16v2c0 2-16 2-16 0z" fill="#9d9a92"/><path d="M2 14c0-1 16-1 16 0" fill="#4a7ab0"/><rect x="9" y="7" width="2" height="7" fill="#b8b4aa"/><path d="M6 8c2-1 6-1 8 0" fill="#9d9a92"/><g stroke="#8ab4d8" stroke-width="1.1" fill="none" stroke-linecap="round"><path d="M10 6c-1-3-4-3-5 1"/><path d="M10 6c1-3 4-3 5 1"/><path d="M10 6V2"/></g>'),
  topiary: svg('<path d="M6 18h8l-1-3H7z" fill="#a8583a"/><rect x="9.2" y="10" width="1.6" height="5" fill="#7a5230"/><circle cx="10" cy="9" r="3.4" fill="#3d7a3a"/><circle cx="10" cy="4" r="2.2" fill="#3d7a3a"/><g fill="#5a9a4a"><circle cx="8.8" cy="8" r=".8"/><circle cx="9.4" cy="3.4" r=".6"/></g>'),
  maypole: svg('<path d="M10 2v16" stroke="#f2ece0" stroke-width="1.6"/><circle cx="10" cy="2.4" r="1.4" fill="#e8c040"/><g stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M10 3c-3 4-5 9-7 14" stroke="#e84a6a"/><path d="M10 3c3 4 5 9 7 14" stroke="#3a6ab0"/><path d="M10 3c-1 5-2 10-3 14" stroke="#f2d34a"/><path d="M10 3c1 5 2 10 3 14" stroke="#4f8a3c"/></g><path d="M3 18h14" stroke="#4f8a3c" stroke-width="1.6"/>'),
  statue: svg('<path d="M5 18h10v-3H5z" fill="#9d9a92"/><path d="M6 15h8v-1.5H6z" fill="#b8b4aa"/><circle cx="10" cy="4" r="1.8" fill="#c8c4bc"/><path d="M7.5 13.5l.8-7h3.4l.8 7z" fill="#c8c4bc"/><path d="M11.6 7l2.4-2.5" stroke="#c8c4bc" stroke-width="1.2" stroke-linecap="round"/><path d="M13.6 2v5" stroke="#a8a49a" stroke-width=".9"/>'),
  belltower: svg('<path d="M6 18V8h8v10z" fill="#b8b4aa"/><path d="M5 8l5-6 5 6z" fill="#5d6670"/><path d="M8 13.5c0-3 4-3 4 0l.6 1.5H7.4z" fill="#d8a838"/><circle cx="10" cy="15.6" r=".7" fill="#a07a20"/><path d="M8 18v-1.5h4V18" fill="#5a3a20"/>'),
};

/** One small picture per building, for the compact build menu. */
export const BUILDING_ICONS: Partial<Record<string, string>> = {
  beekeeper: svg('<path d="M4 16c0-6 2.6-10 6-10s6 4 6 10z" fill="#d8a848" stroke="#8a6224" stroke-width=".8"/><path d="M4.6 13h10.8M5.4 10.4h9.2M7 8h6" stroke="#8a6224" stroke-width=".7"/><path d="M8.6 16v-2.4h2.8V16z" fill="#3a2a1a"/><path d="M3 16h14" stroke="#6a4a2a" stroke-width="1.2"/><g fill="#2a2018"><ellipse cx="15.5" cy="5" rx="1.2" ry=".8"/></g><path d="M14.8 4.4c-.6-1 .2-1.6.7-.6M16.2 4.4c.6-1-.2-1.6-.7-.6" fill="#e8f0f8"/>'),
  papermill: svg('<circle cx="7" cy="11" r="5" fill="none" stroke="#7a5230" stroke-width="1.3"/><path d="M7 6v10M2 11h10M3.5 7.5l7 7M10.5 7.5l-7 7" stroke="#7a5230" stroke-width=".8"/><path d="M1 16.5c2-1 4-1 6 0s4 1 6 0" stroke="#4a7ab0" stroke-width="1.1" fill="none"/><path d="M12 4h5l1 1v8h-6z" fill="#f4ecd8" stroke="#a89878" stroke-width=".7"/><path d="M13 6.5h4M13 8.5h4M13 10.5h3" stroke="#c8b898" stroke-width=".6"/>'),
  embroiderer: svg('<path d="M6 3h5l1 3-1.6.8 3 10.2H3.6l3-10.2L5 6z" fill="#7a3ab0" stroke="#3a1a60" stroke-width=".7"/><path d="M6 3c.8 1.4 4.2 1.4 5 0" fill="none" stroke="#e0b840" stroke-width=".9"/><path d="M4 15.4h9" stroke="#e0b840" stroke-width=".9"/><path d="M14 3l3.4 12" stroke="#b8bcc4" stroke-width=".9"/><path d="M17.4 15c-1.4 1-3.6 1.4-5 .6" stroke="#e0b840" stroke-width=".7" fill="none"/><circle cx="14" cy="3" r=".6" fill="none" stroke="#8a8e94" stroke-width=".5"/>'),
  glazier: svg('<path d="M4 18V7a6 6 0 0112 0v11z" fill="#4a4a52"/><path d="M5.2 17V7.2a4.8 4.8 0 019.6 0V17z" fill="#3a62c4"/><path d="M5.2 9h9.6v4H5.2z" fill="#c42b3a"/><path d="M7 13h6v4H7z" fill="#d8a838"/><path d="M5.6 7a4.4 4.4 0 018.8 0z" fill="#4f8a3c"/><path d="M10 2.4V17M5.2 9h9.6M5.2 13h9.6M7.6 13v4M12.4 13v4" stroke="#22222a" stroke-width=".6"/>'),
  cobbler: svg('<path d="M5 3h5v8c2 0 6 1 7 3v2H4V8z" fill="#7a4a2a" stroke="#3a2010" stroke-width=".8"/><path d="M4 16h13" stroke="#2a1a10" stroke-width="1.4"/><path d="M5.6 6h3.8M5.6 8.4h3.8" stroke="#c8a070" stroke-width=".6"/><path d="M10 11.2c1.6.2 3 .8 4.4 1.6" stroke="#c8a070" stroke-width=".6" fill="none"/>'),
  watersawmill: svg('<circle cx="6.5" cy="11.5" r="4.6" fill="none" stroke="#7a5230" stroke-width="1.3"/><path d="M6.5 6.9v9.2M1.9 11.5h9.2" stroke="#7a5230" stroke-width=".8"/><path d="M1 17c2-1 4-1 6 0s4 1 6 0" stroke="#4a7ab0" stroke-width="1.1" fill="none"/><path d="M11 9h7v3h-7z" fill="#d8b47c" stroke="#8a6440" stroke-width=".6"/><circle cx="14.5" cy="5.5" r="3" fill="#c8ccd4" stroke="#6d7078" stroke-width=".6"/><path d="M14.5 2.5l.6 1M17.5 5.5l-1 .6M14.5 8.5l-.6-1M11.5 5.5l1-.6" stroke="#6d7078" stroke-width=".7"/>'),
  silvermine: svg('<path d="M2 17l4-9 4 3 3-6 5 12z" fill="#7a7468"/><path d="M6 8l4 3 3-6" fill="none" stroke="#5a554c" stroke-width=".7"/><g fill="#e4e8f0" stroke="#8a8e9a" stroke-width=".4"><path d="M8 14l1.6-1.6 1.6 1.6-1.6 1.6z"/><path d="M12 12l1.2-1.2 1.2 1.2-1.2 1.2z"/><path d="M5 15l1-1 1 1-1 1z"/></g><path d="M15 3l2 2M16 2l-1.4 3.6" stroke="#7a5230" stroke-width=".9"/>'),
  bathhouse: svg('<path d="M3 11h14v2a5 5 0 01-5 5H8a5 5 0 01-5-5z" fill="#8a6440" stroke="#4a3020" stroke-width=".8"/><ellipse cx="10" cy="11" rx="7" ry="1.6" fill="#6aa8c8" stroke="#4a3020" stroke-width=".6"/><path d="M7 8c-1-1.4 1-2 0-3.6M10 8c-1-1.4 1-2 0-3.6M13 8c-1-1.4 1-2 0-3.6" stroke="#c8d0d8" stroke-width=".9" fill="none" stroke-linecap="round"/>'),
  school: svg('<path d="M3 5h14v10H3z" fill="#3a4a3a" stroke="#7a5230" stroke-width="1.2"/><path d="M6 12l2-5 2 5M6.8 10h2.4M12 7v5M12 7h2.4M12 9.4h2M12 12h2.4" stroke="#f2ece0" stroke-width=".8" fill="none"/><path d="M8 15l-1 3M12 15l1 3" stroke="#7a5230" stroke-width="1"/>'),
  taxoffice: svg('<path d="M3 4h9l3 3v9H3z" fill="#f4ecd8" stroke="#a89878" stroke-width=".7"/><path d="M5 7h6M5 9h6M5 11h4" stroke="#c8b898" stroke-width=".6"/><g stroke="#a07a20" stroke-width=".6"><ellipse cx="14" cy="16" rx="3.4" ry="1.2" fill="#d8a838"/><ellipse cx="14" cy="14.6" rx="3.4" ry="1.2" fill="#e8c860"/><ellipse cx="14" cy="13.2" rx="3.4" ry="1.2" fill="#d8a838"/></g>'),
  courthouse: svg('<path d="M10 3v13" stroke="#6a4a2a" stroke-width="1.1"/><path d="M4 6h12" stroke="#6a4a2a" stroke-width="1.1"/><path d="M4 6l-2 5h4zM16 6l-2 5h4z" fill="none" stroke="#6a4a2a" stroke-width=".8"/><path d="M2 11a2 1 0 004 0zM14 11a2 1 0 004 0z" fill="#d8a838"/><path d="M6 17h8" stroke="#6a4a2a" stroke-width="1.6"/><circle cx="10" cy="3" r="1" fill="#d8a838"/>'),
  atelier: svg('<path d="M5 18l3-14M15 18L12 4M10 4v14" stroke="#7a5230" stroke-width="1"/><path d="M6 6h8v7H6z" fill="#f4ecd8" stroke="#8a6440" stroke-width=".7"/><path d="M7 11c1.4-2 2.4-1 3.2-2.4s2.2-.6 2.8.4" stroke="#3a62c4" stroke-width=".9" fill="none"/><circle cx="12" cy="8" r=".9" fill="#d8a838"/><ellipse cx="15.6" cy="15.6" rx="2.6" ry="1.8" fill="#c8a070"/><g fill="#c42b3a"><circle cx="14.8" cy="15.2" r=".45"/></g><circle cx="16.2" cy="15.8" r=".45" fill="#3a62c4"/>'),
  barracks: svg('<path d="M3 3v14M17 3v14" stroke="#7a5230" stroke-width="1"/><path d="M3 3l-1.2 2.4h2.4zM17 3l-1.2 2.4h2.4z" fill="#9aa0a8"/><path d="M6 10a4 4 0 018 0v5l-1.4 1.4H7.4L6 15z" fill="#9aa0a8" stroke="#4a4d52" stroke-width=".8"/><path d="M10 6v10M6 11h8" stroke="#4a4d52" stroke-width=".7"/><path d="M7.4 12h1.6v2.4H7.4zM11 12h1.6v2.4H11z" fill="#2a2c30"/>'),
  deerpark: svg('<path d="M2 17h16M3 17v-6M7 17v-6M13 17v-6M17 17v-6M2 12h16" stroke="#7a5230" stroke-width=".9"/><ellipse cx="10" cy="11.4" rx="3.6" ry="2" fill="#a0683a"/><path d="M8 13v3M12 13v3" stroke="#6a4424" stroke-width=".8"/><circle cx="13.6" cy="9" r="1.3" fill="#a0683a"/><path d="M13.2 8l-1-2.6M14.2 8l1.2-2.6M12.6 6.4l-1 .2M15 6.2l1 .2" stroke="#6a4424" stroke-width=".6" fill="none"/>'),
  stewpond: svg('<ellipse cx="10" cy="12" rx="8" ry="5" fill="#4a7ab0" stroke="#8a8478" stroke-width="1.2"/><path d="M6 12c2-2 4-2 6 0-2 2-4 2-6 0z" fill="#c8a070"/><path d="M12 12l2-1.4v2.8z" fill="#c8a070"/><circle cx="7.4" cy="11.6" r=".4" fill="#2a2018"/><path d="M4 9c1-.6 2-.6 3 0" stroke="#a8c8e0" stroke-width=".6" fill="none"/>'),
  tiltyard: svg('<path d="M2 17L15 4" stroke="#c8a070" stroke-width="1.4"/><path d="M15 4l2.4-2-1 3z" fill="#9aa0a8"/><path d="M5 14l-2 2" stroke="#7a5230" stroke-width="2"/><path d="M11 9l4-1-1 4" fill="#c42b3a"/><path d="M2 18h16" stroke="#7a5230" stroke-width="1"/><path d="M4 18v-3M8 18v-3M12 18v-3M16 18v-3" stroke="#7a5230" stroke-width=".8"/>'),
  draughtstable: svg('<path d="M5 4a5 5 0 0110 0v7h-2.4V4.5a2.6 2.6 0 00-5.2 0V11H5z" transform="translate(0 4)" fill="#8a8f98" stroke="#4a4d52" stroke-width=".8"/><g fill="#4a4d52"><circle cx="6.2" cy="9" r=".6"/><circle cx="6.2" cy="12" r=".6"/><circle cx="13.8" cy="9" r=".6"/><circle cx="13.8" cy="12" r=".6"/></g>'),
  builderyard: svg('<path d="M6 18V3" stroke="#6a4a2a" stroke-width="1.8"/><path d="M6 4l10 3" stroke="#6a4a2a" stroke-width="1.5"/><path d="M15 7v5" stroke="#3a2a1a" stroke-width=".8"/><rect x="13" y="12" width="4" height="3" fill="#b0aca4" stroke="#6d6a62" stroke-width=".6"/><circle cx="6" cy="14" r="3.4" fill="none" stroke="#8a6236" stroke-width="1.3"/><path d="M2.6 14h6.8M6 10.6v6.8" stroke="#8a6236" stroke-width=".8"/>'),
  camp: B.tent,
  townhall: B.manor,
  house: CATEGORY_ICONS.housing,
  woodcutter: ICONS.wood,
  forester: ICONS.grove,
  quarry: ICONS.stone,
  mine: ICONS.ore,
  claypit: ICONS.clay,
  sandpit: ICONS.sand,
  forager: ICONS.berries,
  hunter: ICONS.meat,
  fisher: ICONS.fish,
  farm: B.barn,
  field: ICONS.grain,
  byre: B.cow,
  pasture: B.fence,
  orchardist: ICONS.apples,
  orchard: B.appletree,
  watermill: B.waterwheel,
  windmill: B.windmill,
  bakery: ICONS.bread,
  brewhouse: ICONS.ale,
  dairy: ICONS.cheese,
  winery: ICONS.wine,
  tanner: ICONS.leather,
  weaver: ICONS.cloth,
  dyer: ICONS.dyes,
  tailor: ICONS.clothes,
  apothecary: ICONS.medicine,
  sawmill: ICONS.planks,
  collier: ICONS.charcoal,
  smithy: ICONS.tools,
  kiln: ICONS.tiles,
  stonemason: ICONS.dressedstone,
  limekiln: ICONS.mortar,
  glassworks: ICONS.glass,
  carpenter: ICONS.woodparts,
  bloomery: ICONS.iron,
  cooper: ICONS.crates,
  potter: ICONS.pottery,
  jeweller: ICONS.jewellery,
  scriptorium: ICONS.paper,
  armoury: svg('<path d="M5 9a5 5 0 0110 0v6l-2 2H7l-2-2z" fill="#9aa0a8" stroke="#4a4d52" stroke-width=".8"/><path d="M10 4v13M5 11h10" stroke="#4a4d52" stroke-width=".8"/><path d="M7 12h2v3H7zM11 12h2v3h-2z" fill="#2a2c30"/><path d="M10 4c1-2 3-2 4-1" stroke="#b8483a" stroke-width="1.4" fill="none"/>'),
  well: B.well,
  storehouse: ICONS.storage,
  granary: ICONS.granary,
  silo: B.silo,
  tavern: B.tavern,
  market: B.stall,
  dock: B.boat,
  university: ICONS.books,
  markethall: B.hall,
  tradingpost: B.scales,
  church: CATEGORY_ICONS.civic,
  monastery: svg('<path d="M2 18V9h16v9z" fill="#b8b4aa"/><path d="M1.5 9.5L10 5l8.5 4.5z" fill="#a8483a"/><path d="M9 5V2.5h2V5" fill="#8a8478"/><path d="M9.4 3.4h1.2v1.2H9.4z" fill="#d8a838"/><g fill="#4a3a2a"><path d="M3.4 18v-4.4a1.6 1.6 0 013.2 0V18z"/><path d="M8.4 18v-4.4a1.6 1.6 0 013.2 0V18z"/><path d="M13.4 18v-4.4a1.6 1.6 0 013.2 0V18z"/></g><path d="M2 18h16" stroke="#6d6a62"/>'),
  cathedral: B.cathedral,
  guildhall: B.guild,
  wall: B.wall,
  watchtower: B.tower,
  garden: CATEGORY_ICONS.decor,
  publicgarden: B.bench,
  hedge: B.hedge,
  flowerbed: B.flowerbed,
  shrine: B.shrine,
  fountain: B.fountain,
  manorgarden: B.topiary,
  maypole: B.maypole,
  belltower: B.belltower,
  statue: B.statue,
};
