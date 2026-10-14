import type { ResourceId } from '../game/types';

const svg = (body: string) =>
  `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<ResourceId | 'people' | 'happy' | 'storage' | 'granary' | 'road' | 'demolish' | 'cal', string> = {
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
  road: svg('<path d="M6 18L9 2h2l3 16z" fill="#a88a5c"/><path d="M10 4v2M10 9v2M10 14v2" stroke="#e8d8b0" stroke-width="1"/>'),
  demolish: svg(
    '<path d="M4 16l8-8" stroke="#7a5230" stroke-width="2.2" stroke-linecap="round"/><path d="M10 4l6 6-3 1-4-4z" fill="#8a8e94"/><path d="M13 14l3 3M15 13l2 1M12 16l1 2" stroke="#c84a2a" stroke-width="1.2" stroke-linecap="round"/>',
  ),
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
