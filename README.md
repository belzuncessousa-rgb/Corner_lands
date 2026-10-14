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
| Build | Pick a category at the bottom, then a building (`H` house, `E` woodcutter, `Q` quarry, `G` forager) |
| Roads | `R`, click where the road starts, click where it ends; keep clicking to continue. `T` lays paved stone roads (Village) |
| Demolish | `X`, then click a building or drag across roads |
| Cancel / deselect | Right-click or `Esc` |
| Pause / speed | `Space`, `1` `2` `3` (normal, ×3, ×8) |

### How the settlement works

- **Pace** — a year lasts about 45 minutes at normal speed. Villagers stroll;
  they walk faster on dirt roads and faster still on paved ones.
- **Top bar** — happiness, villagers, food, materials, goods and the treasury
  (coins and prestige). Hover a chip for the breakdown, click to pin it: set
  how much of each good to keep in stock and whether merchants may buy the
  surplus. The villagers chip shows who is working, building, idle or resting.
- **Labour** — select a workplace to choose how many villagers work there, its
  priority and, where it has several, its product (or Auto). Seasonal work and
  workplaces whose goods are at their stock target free their workers.
- **Building** — place a plan and builders carry the materials from storage,
  one load per trip, then raise the walls. Plans can wait for materials.
  Construction is a job: each site takes two builders before other work, and
  idle villagers lend a hand.
- **Roads** — optional. They speed up walking, which makes everything nearby
  work faster. Roads over water become bridges (4 timber per tile).
- **Storage** — goods live in the Manor Hall, Storehouses (materials) and
  Granaries (food); their yards visibly fill up. Workplaces close to storage and
  to their resources work faster (the inspector shows their efficiency).
- **Villagers** — settlers arrive when happiness is at least 50%, nobody went
  hungry and there is free housing.
- **Farming** — a Farmstead tends the fields you draw near it (click one
  corner, then the opposite one): wheat, barley, oats or flax, sown in spring
  and harvested in autumn; rotate crops for better yields. Animal Farms keep
  sheep (wool), cattle (milk, beef, hides) or pigs (pork) on fenced pastures;
  oats let a herd outgrow its pasture over winter. Orchards of apples, pears
  or plums bear after a year and a half. Households can keep a vegetable
  patch, hens or beehives in the backyard.
- **Food & seasons** — each villager eats one food per month (bread and cheese
  go further); meals from several food groups (grain, meat, produce, dairy)
  raise happiness. With nothing else left, families boil wheat or oats into
  pottage, half as filling. Foragers pick berries, autumn mushrooms or herbs and rest in deep winter;
  every household burns a bundle of firewood (or two logs) each winter month.
- **Workshops** — a Windmill grinds wheat for the Bakery; the Brewhouse brews
  ale from barley or cider from apples for the taverns; a Dairy makes cheese;
  the Tannery, Weaver and Tailor & Cobbler turn hides, wool and flax into
  leather, cloth, clothes and boots; the Apothecary makes medicine from herbs.
  Clay pits by the water feed the Tile Kiln (roof tiles for Townhouses); the
  Stonemason squares stone for the manor, church and statues; the Carpenter
  makes wood parts for windmills; the Bloomery smelts ore into iron for the
  Blacksmith. Kilns, tanneries and bloomeries work in batches: their workers
  only come once a full batch of inputs is waiting.
- **Homes grow** — Cottage → Timber House (well, market, a tavern with ale or
  cider, clothes, two food groups) → Townhouse (church, boots, medicine, three
  food groups). Clothes, boots and medicine wear out every three months.
  Unmet needs sour the mood.
- **Home crafts** — a Timber House or Townhouse can take up a craft (baker,
  brewer, weaver, tailor...). The family works it from home and makes
  half as much again as a common workshop.
- **The manor** — raise the Manor Hall to a Manor House, Stone Manor,
  Lord's Keep and finally a Castle to become a Village, Town, Borough and
  City. Each rank unlocks buildings and adds storage.
- **Prestige & charters** — a fine manor, a church, monuments and townhouses
  bring prestige each month. From Town on, spend it on charters (crown
  button): seven paths (Metalwork, Orchard Masters, Erudition, Harmony with
  Nature, Traders, Farmers, Shepherds) of two ranks that then fork into rival
  guilds. Every charter makes the next dearer, and each path has a drawback.
  Some charters open new trades: silver and the Jeweller's Shop, vines and the
  Winery, the Scriptorium's paper and books. Jewellery, books and wine are
  luxuries: Townhouses that have one are happier and pay more tax. An Armoury
  (Borough) makes the arms a castle garrison needs.
- **Expansions** — workshops can be expanded once for half as many workers again.
- **Trade** — at the marketplace buy and sell goods; mark goods for sale in the
  top bar and a merchant's cart visits each month to buy what is above the
  stock target.
- **Events** — once or twice a year something happens (wanderers, a merchant,
  wolves, a harvest feast, the king's tax collector...) and you choose what to
  do.
- **Steward, chronicle & ledger** — timely advice, the full story of your lands
  and monthly charts.
- **Relaxed mode** — double starting supplies and nobody ever leaves in anger.

## Project layout

```
src/game/      Simulation (pure TypeScript, no DOM): world generation,
               economy, building levels, quests, events, advisor,
               pathfinding, save format, and an autoplayer that grows the
               title-screen village
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
node scripts/uitest.mjs          # drives the real UI: build, draw fields, workers, targets
```

The screenshot scripts expect the game at `http://localhost:3001` and a
Chromium headless shell (set `CHROME` to its path if it lives elsewhere).
