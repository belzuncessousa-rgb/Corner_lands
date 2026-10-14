# Corner Lands

A casual medieval city builder in the spirit of *Manor Lords*. Start with a
manor hall and eight settlers in a quiet corner of the land, then grow your
hamlet into a village, a town and finally a borough.

Everything — terrain, forests, timber-framed houses, villagers and UI icons —
is drawn procedurally in code, so there are no image assets.

## Playing

```bash
npm install
npm start          # builds the client and serves it with the save server
# open http://localhost:3001
```

For development with hot reload run the save server and Vite side by side:

```bash
npm run server     # API on :3001
npm run dev        # client on :5173, proxies /api to :3001
```

The client also works on its own (`npm run dev` or any static host): saves
then fall back to the browser's localStorage.

### Controls

| Action | Input |
| --- | --- |
| Pan | Left-drag, right-drag, `WASD` / arrow keys, or the minimap |
| Zoom | Mouse wheel, pinch, `+` / `-` |
| Build | Pick a card in the bottom bar (`H` house, `E` woodcutter, `Q` quarry, `G` forager) |
| Roads | `R`, then click and drag |
| Demolish | `X`, then click a building or drag across roads |
| Cancel / deselect | Right-click or `Esc` |
| Pause / speed | `Space`, `1` `2` `3` |

### How the settlement works

- **Roads** — every building must be connected to the Manor Hall by road to be
  built or staffed. Roads over water become bridges (4 timber per tile).
- **Villagers** — settlers arrive when happiness is at least 50%, nobody went
  hungry and there is free housing. Unhappy or hungry villagers leave.
- **Jobs** — villagers fill jobs automatically (food first). Idle villagers help
  on construction sites. Pause buildings to free up workers.
- **Food** — each villager eats one food per month. Berries, meat, fish and
  bread all count; variety raises happiness.
- **Seasons** — farms are sown in spring and harvested in autumn; foragers rest
  in winter and every household burns one timber per winter month.
- **Happiness** — food variety, wells, markets, churches, decorations, fine
  houses and low taxes all help.
- **Growth tiers** — Hamlet → Village (20 villagers) → Town (45 + market) →
  Borough (90 + church). Each tier unlocks new buildings.
- **Events** — merchants, wandering families, good weather, wolves, rats and
  the king's tax collector keep things lively.
- **Steward & ledger** — timely warnings about food, firewood and housing, plus
  monthly charts of population, food, happiness and gold.
- **Nature** — forests slowly regrow, deer graze at the woods' edge and birds
  pass overhead; wind and birdsong change with the seasons.

## Project layout

```
src/game/      Simulation (pure TypeScript, no DOM): world generation,
               economy, quests, events, advisor, pathfinding, save format,
               and an autoplayer that grows the title-screen village
src/render/    Canvas renderer, procedural sprites, villager agents
src/ui/        HUD, minimap, icons and styles
src/main.ts    Game loop and input handling
server/        Zero-dependency Node server: static files + save game API
tests/         Vitest suites, including balance runs of the autoplayer
scripts/       Playwright scripts for screenshots and UI checks
```

### Save API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | `{ ok: true }` |
| `GET` | `/api/saves` | List of `{ slot, updated, summary }` |
| `GET` | `/api/saves/:slot` | A save `{ summary, updated, data }` |
| `PUT` | `/api/saves/:slot` | Store a save |
| `DELETE` | `/api/saves/:slot` | Remove a save |

Saves are written as JSON files to `./saves` (override with `SAVES_DIR`).
`PORT` sets the server port (default 3001).

## Development

```bash
npm run typecheck
npm test                         # unit tests + balance bot
BALANCE_LOG=1 npx vitest run tests/balance.test.ts   # print bot progress
node scripts/showcase.mjs out    # screenshots of every building per season
```

The screenshot scripts expect the game at `http://localhost:3001` and a
Chromium headless shell (set `CHROME` to its path if it lives elsewhere).
