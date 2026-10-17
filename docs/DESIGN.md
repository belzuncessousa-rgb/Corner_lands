# Corner Lands — Design & Roadmap (iteration 3)

This is the working plan agreed with the player-designer. Scheduled work
sessions follow it top to bottom; tick items off as they land.

## Agreed decisions

- **Pace**: one year lasts about **45 minutes** at normal speed
  (10 days × 12 months, 22.5 s per day). Villagers walk at the same
  on-screen speed as before, so travel is a smaller share of each day.
- **Events**: 1.5–2 decision events per year (gap 0.5–0.67 years), drawn from
  a larger, more varied pool; each pauses the game and offers choices.
- **Roads**: dirt roads (free, as now) and **stone roads** (stone, faster),
  laid with the same two-click tool. Paving an existing road upgrades it.
- **Top bar**: Happiness · Population · Food · Materials · Goods ·
  Coins/Prestige. Hovering a chip lists everything in it; hovering
  Population shows the **Labour panel**.
- **Stock targets** (keep-at amounts) are the one rule for everything:
  workshops on *Auto* make whatever is furthest below target, merchants buy
  what is above it.
- **Product toggles**: a building can make several products; the player picks
  one or leaves it on Auto.
- **Common workshops vs. specialised homes**: common buildings (town oven,
  communal kiln...) anyone can staff; a house can be **specialised** into a
  trade (a family's bakery, a cobbler's home), locking the family to it for a
  higher yield.
- **Processed goods are worth more**: in the market *and* in use — e.g.
  cheese feeds twice as much as milk, bread more than grain.
- **Oats** are fodder: pastures feed a few animals for free in proportion to
  their size; larger herds eat oats over winter.
- **Milk → cheese** at a dairy. **Eggs** only from chickens.
- **Fruits** are separate goods (apples, pears, plums).
- **Fields and pastures are drawn** by the player.
- **Clothing, boots, medicine** are consumed by households, but less often
  than food (seasonally).
- Variety counts **food groups**: grain (bread), meat (meat, pork, fish,
  eggs), produce (vegetables, fruit, berries, mushrooms), dairy & sweet
  (cheese, honey).

## Goods

Value is the base market price; *food value* is how much hunger one unit
satisfies (1 = one villager for one month).

| Group | Goods |
|---|---|
| Food | bread (1.5), meat, pork, fish, eggs, berries, mushrooms, vegetables, apples, pears, plums, honey, milk (0.5), cheese (1.5) |
| Materials | timber, firewood, planks, wood parts, stone, dressed stone, clay, tiles, iron ore, iron |
| Goods | grain, barley, oats, flour, flax, wool, hides, leather, cloth, clothes, boots, ale, cider, herbs, medicine, tools, (later: arms) |
| Currency | coins, prestige |

## Buildings by branch

| Branch | Building | Products |
|---|---|---|
| Land | Hunting Camp | meat + hides |
| | Forager's Hut | berries / mushrooms (autumn) / herbs |
| | Fisher's Hut | fish |
| Wood | Woodcutter | timber / firewood |
| | Sawpit | planks |
| | Carpenter | wood parts |
| Stone & clay | Quarry | stone |
| | Stonemason | dressed stone |
| | Clay Pit | clay (riverbank) |
| | Kiln | tiles |
| Metal | Mine | iron ore |
| | Bloomery | iron (ore + firewood) |
| | Blacksmith | tools |
| Farming | Field (drawn) | wheat / barley / oats / flax, chosen each spring |
| | Orchard (drawn) | apples / pears / plums |
| Husbandry | Pasture (drawn) | sheep → wool · cattle → milk, hides, meat · pigs → pork |
| | Dairy | milk → cheese |
| Backyards | House extension | vegetable patch / chicken coop (eggs) / beehives (honey) |
| Industry | Windmill | grain → flour (needs wood parts) |
| | Bakery (town oven) | flour → bread |
| | Brewhouse | barley → ale / apples → cider |
| | Tanner | hides → leather |
| | Weaver | wool or flax → cloth |
| | Tailor & Cobbler | cloth → clothes / leather → boots |
| | Apothecary | herbs → medicine |

## Labour

- Each workplace: worker target (0..max), priority (low/normal/high), pause.
- **Seasonal schedules**: farms heavy in spring & autumn, orchards in late
  summer, foragers rest in winter, shearing in spring, slaughter in autumn.
  Out of season, workers return to the pool and take the next job.
- **Batch jobs**: kiln, tanner fire when a full batch of inputs is waiting.
- Labour panel (hover on Population): employed / seasonal / building / idle,
  by branch, with shortages.

## Household needs

| Home | Needs |
|---|---|
| Cottage | food, firewood (winter) |
| Timber House | 2 food groups, firewood, clothes, ale or cider, well, market |
| Townhouse | 3 food groups, boots, medicine, tiled roof, church, tavern |

## Prestige

Earned monthly from manor level, townhouses, decorations, feasts and good
event choices. Spent on Charters, castle levels above the Keep and later a
retinue.

## Charters (specialisation)

A radial tree around the Town Charter. Seven paths of three ranks. Every
charter you take raises the price of the next (cost = 40 × 1.6^n prestige),
so a town can either go deep in one path or dabble in several. Rank 3 of
some paths forks into two exclusive guilds; a few ranks lock another path.
Every charter carries a small malus.

| Path | Rank 1 | Rank 2 | Rank 3 (fork) | Malus / lock |
|---|---|---|---|---|
| **Metalwork** | Deep shafts: mines never deplete | Precious veins: gold & silver mining | *Jewellers' Guild* (jeweller, jewellery) or *Armourers' Guild* (arms export value ×1.5) | Mines and forges sour nearby homes; rank 2 locks *Harmony* rank 3 |
| **Orchard master** | +30% fruit & honey | Vines: vineyards on south slopes | *Vintners* (winery, wine) or *Meadmakers* (mead from honey) | Orchards need more workers at harvest |
| **Erudition** | Scriptorium: paper | Bookbinder: books (prestige when sold) | *University* (great yields, eats wood parts) or *Cathedral school* (happiness, prestige) | Clerks don't do manual work |
| **Harmony with nature** | +40% foraging & hunting | Wildlife returns, forests regrow fast | *Druids' grove* (happiness) or *Royal hunt* (prestige from hunts) | Quarries and mines −20% |
| **Traders** | Market charter: better prices | Fair town: yearly fair | *Merchant guild* (caravans, imports) or *Toll bridges* (coins from roads) | Taxes are less popular |
| **Farmers** | Three-field rotation: +20% crops | Heavy plough: bigger fields | *Breadbasket* (granaries hold double) or *Brewers' Guild* (ale exports) | Pastures smaller |
| **Shepherds** | +30% animal products | Great herds: more animals per pasture | *Butchers' Guild* (town butcher, meat feeds more) or *Cheesemakers' Guild* (fine cheese, luxury) | Fields yield less beside pastures |

## Roadmap

### Phase 1 — Foundations
- [x] 45-minute year; events 1.5–2 per year with a larger pool
- [x] Data-driven goods registry (groups, value, food value, storage kind)
- [x] Top bar with category chips, hover breakdowns, prestige
- [x] Stock targets per good (replace export thresholds; converters on Auto)
- [x] Worker targets, priority, seasonal schedules; Labour panel on Population hover
- [x] Product toggles on buildings
- [x] Food groups for variety; food value per good
- [x] Stone roads
- [x] Medieval art pass: plank walls, wattle & daub, coursed stone, thatch & shingle texture

### Phase 2 — Land and wood
- [x] Firewood; hides; mushrooms & herbs
- [x] Drawn fields with crop choice (wheat, barley, oats, flax)
- [x] Drawn orchards (apples, pears, plums); drawn pastures (sheep, cattle, pigs), oats as fodder
- [x] Backyard extensions (vegetables, chickens, bees)

### Phase 3 — Workshops and needs
- [x] Windmill → bakery; brewhouse; dairy; tanner; weaver; tailor & cobbler; apothecary
- [x] Specialised homes (family trades with higher yield)
- [x] New household needs and seasonal consumption of wares

### Phase 4 — Stone, clay, metal
- [x] Clay pit & kiln (tiles), stonemason, bloomery, carpenter
- [x] New construction costs (tiles for townhouses, dressed stone for manor)

### Phase 5 — Prestige and charters
- [x] Prestige income; charter tree UI; first ranks of every path
- [x] Castle levels above the Keep

### Phase 6 — Charter goods and polish
Charter rewards were first implemented as bonuses; these add the goods the
designer asked for.
- [x] Precious veins: silver and gold ore from mines; Jewellers' Guild makes jewellery (luxury export, prestige)
- [x] Vines: vineyards (drawn zone) and a winery; wine as a tavern drink and luxury
- [x] Erudition: paper (from flax/rags) and books at a scriptorium/bookbinder; University eats wood parts
- [x] Arms: bows and pikes (carpenter), armour (armourer) for the castle's retinue and export
- [x] Help screen and tutorial objectives for the new systems; balance pass at the 45-minute year

### Phase 7 — Polish (for the scheduled runs)
- [x] Villagers visibly carry the new goods (wool bales, cheese wheels, casks, cloth) and work outdoors at the new trades
- [x] Winter and autumn looks for pastures, orchards and vines; animals shelter in the byre in deep winter
- [x] A first-hour guide tuned to the 45-minute year (objectives that teach fields, workers and stock targets in order)
- [x] Phone layout pass for the inspector, charter tree and production book
- [x] Performance check on a 250-villager town; trim per-frame work if needed

### Phase 8 — Robustness and late game (for the scheduled runs)
A ten-seed sweep of the autoplayer exposed stalls a player can hit too.
- [x] Workshops count the room their inputs free (a full granary no longer stops the mill); pottage from wheat or oats as famine food
- [x] Steward names what fills a full storehouse or granary
- [x] Ten-seed balance sweep as an opt-in test (`SWEEP=1`); every seed reaches Town
- [x] Storehouse and granary inspector: what is stored there, with a quick "sell surplus" button
- [x] Harvest feast: in autumn the lord may call a feast (food and ale for happiness and prestige)
- [x] Meadmakers make mead from honey at the brewhouse (tavern drink, luxury)
- [x] Retinue: spend prestige on a castle guard that wards off wolves and bandits in events

### Phase 9 — Clearer economy (for the scheduled runs)
- [x] Steward warns when wheat piles up faster than the mills grind it (suggest a second windmill or bakery)
- [x] Goods diagnose themselves (who makes, who waits); map markers show the missing good; needs overview per home need
- [x] Feast visuals: trestle tables and bunting at the manor in the month of a feast
- [x] Late-game balance: twelve-year bot runs reach the Castle on most maps (check prestige and arms costs)

### Phase 10 — Lessons from player research (for the scheduled runs)
Research into what players praise and criticise in Manor Lords, Banished,
Anno, Farthest Frontier, Timberborn and cozy builders; the shipped answers
are listed in the README.
- [x] Touch: taps tolerate 14 px of wobble; a long press acts as right-click (cancel, deselect)
- [x] A funnel test (FUNNEL=1) that plays the objectives like a new player (including the teaching ones) and flags any step that takes over ten minutes
- [x] Colour-blind pass (scripts/cvdshots.mjs): simulate deuteranopia on screenshots of markers, charts and the charter tree; add shapes where colour alone carries meaning
- [x] Keyboard: list every hotkey in the help screen; Esc closes tools, panels and menus in a predictable order
- [x] Optional "pause on bad news" setting (events already pause)

### Phase 11 — Deeper polish (for the scheduled runs)
When a phase is done, keep going: stress the game harder, look for new
player insights on the web, and add what you learn here as new items.
Save size was checked (about 200 KB after twenty years, fine for browser storage).
- [x] Production chains view in the Production Book: wheat → flour → bread drawn as a chain, each link showing made vs used last month and the weakest link highlighted (players say Anno's numbers do not diagnose)
- [x] Coverage overlay (V): a toggle that tints the map by well, market, tavern and church reach, so homes out of reach stand out
- [x] Undo the last placement or demolition (a few seconds' grace, refunding fully)
- [x] Thirty-year soak with the meddling monkey (STRESS=1): watch for drift (gold or prestige running away, message and chronicle growth, frame time at 300+ villagers)
- [x] Gold sinks for the late game (yearly fairs that grow dearer; the Cathedral great work): towns sit on 20,000+ coins after twenty years (the thirty-year soak); e.g. a cathedral or town walls built over years, festivals, buying land or charters with coin
- [x] Research pass: recent reviews of cozy city builders (2025–2026) for complaints this game could answer; add the best as items

### Phase 12 — Next ideas (for the scheduled runs)
From the research pass (late-game variety is the most common complaint
about medieval builders, Manor Lords' own roadmap included) and the soaks.
- [x] A second great work for Cities (town walls with gatehouses, built in sections), so the castle is not the end of the road
- [x] Late-game events that use the retinue, fairs and charters (a royal visit, a rival lord's challenge, a plague the apothecaries can fight)
- [x] Chronicle as a story: a year-end page summing up the year (harvest, newcomers, buildings raised, events)
- [x] Performance on machines without GPU canvas: measured instead of cached. With light mode a 300-villager town runs at 30 fps in software rendering; a lower canvas resolution only helped at half size (too blurry), so it was left out

### Phase 13 — From the second research pass (for the scheduled runs)
- [x] New-game map preview with forest, water, rock, ore and soil near the manor (Timberborn and Farthest Frontier show the land before you commit)
- [x] Villagers with names, trades, homes and passing thoughts when clicked (players love individual stories, e.g. Heard of the Story?)
- [x] Town talk: a panel gathering what villagers are saying (their most common wishes), linked to the homes that voice them
- [x] A hardier mode beside Normal and Relaxed (scarcer start, colder winters), balanced with the autoplayer
- [x] Seasonal festivals beyond the harvest feast (May Day at the maypole, Midsummer fires) as small optional spends with visible decorations

### Phase 14 — Next (for the scheduled runs)
- [x] Autosaves per settlement: founding a new one never overwrites the last (players lose towns to a single shared autosave slot in other builders); the three most recent are kept
- [x] A save-slot screen with a thumbnail of each town (the minimap image) and its rank and year
- [x] Sound pass: distinct, quiet cues for festivals, fairs, the retinue and wall gates
- [x] A late-game soak with walls and festivals exercised by the autoplayer (found that a tight ring of walls stifles a town's growth; walls now have posterns, and the autoplayer walls wide and stops at forty sections)

### Phase 15 — Next ideas (for the scheduled runs)
- [x] Just-in-time tips: the first time a tool or panel is opened, one short line on what it does (players drop long tutorials; short contextual help works)
- [x] Weather you can see: drifting snow in winter, rain showers in spring, falling leaves in autumn (light particles, off in light mode)
- [x] Milestones in the chronicle: first harvest, first Timber House, a hundred villagers, the castle raised — each with the date
- [x] The autoplayer raises a cathedral when rich, so the soak exercises it

### Phase 16 — The long game (from the 30-year soaks and player feedback on city builders)
- [x] Idle hands: when many villagers have had no work for months, the steward says so and names the jobs a town of this size usually lacks
- [x] Piles nobody uses (hides, flax, wool, barley): the steward names the workshop that would use them
- [x] A late-game use for coins: rich towns end up with tens of thousands of coins and nothing to buy. Commissions after the cathedral (a guildhall, a bell tower, a market cross) that turn coins into prestige and happiness
- [x] Protected woods: mark an area the woodcutters leave alone (a Manor Lords request), so groves near homes and the cathedral survive
- [x] UI fuzz on a thirty-year city: the monkey test on the largest towns, with frame times (553 villagers, no errors, frames at the 60 fps cap; found the camera could wander into the empty corners beyond the map, now kept over the land)

### Phase 17 — Ideas for the next runs
- [x] Titles for the lord: prestige piles up in the thousands late on. Spend it to rise from Lord to Baron, Earl and Duke, each with a lasting boon and a line in the chronicle
- [x] The autoplayer builds workplaces for idle hands (a thirty-year city has hundreds idle), so soaks look like a played game
- [x] Market days: once a month the market square fills with stalls and people for a day, a visible pulse of the economy Idle villagers flock to the square that day.
- [x] A "what changed" line on the year-in-review page: the three biggest rises and falls in stock

Note from the morning run: the 30-year soak's famine on seed 3 comes from its random meddling (10% of days); played without it the same map reaches 568 villagers with no hunger at all.

### Phase 18 — Ideas for the next runs
- [x] Big cities run their larders thin (22 food for 568 villagers at year 30 without hunger, living on pottage): the food chip and steward should warn when the town eats grain as pottage month after month
- [x] The market panel says when the next market day is, and the merchants' cart arrives on that day
- [x] Colour check of the new overlays (protected woods, rain) with the colour-vision screenshots
- [x] A short "Lord's ledger of deeds" on the main menu's load cards: title, great works and milestones of each saved settlement

### Phase 19 — Ideas for the next runs
- [x] Unground grain in big towns: a Year-17 bot city had 626 sacks of grain waiting while the steward asked for mills. Find out why the mills lag (hands, flour storage, distance) and fix the cause in the game if it is not just the bot (Found: the bakers rest once bread reaches its stock target, so the surplus is wheat, not hunger. The steward now counts food by how many it feeds and points to the bread target instead of asking for mills.)
- [x] The steward's advice gets a "show me" link to the building or spot it is about, like the harvest toasts
- [x] A seasonal goal on the objectives panel for players past City: "this year: raise prestige by 200", "this year: no one goes hungry"

### Phase 20 — Ideas for the next runs
- [x] Prestige still piles up past Duke (2,000–2,600 at year 30): a few repeatable prestige uses, e.g. commission a tapestry or a stained-glass window for the cathedral (+happiness, one each)
- [x] The save server test failed once under load, right after a typecheck; give its server start a readiness wait so it cannot race
- [x] Look again at mobile layout with the new build-bar tab (Protect) and the longer objectives panel at 360 px wide

### Phase 21 — Ideas for the next runs
- [x] The cathedral's windows glow in colour once the stained glass is commissioned, and the manor shows a banner for the tapestry
- [x] Refresh the showcase screenshots (scripts/showcase.mjs) with the great works, titles, market day and protected woods
- [x] A soak with a player who never touches stock targets, to check the defaults suit a town of 300+ (they do: three 25-year towns of 164–443 villagers had no hunger and no pottage in their last ten years; the only effect is a wheat surplus the steward suggests selling)

### Phase 22 — Playing with friends (the game is now on GitHub Pages, saves stay in each browser)
- [x] Export a town to a file and import one, so friends can swap towns and continue each other's games
- [x] The map seed shown in the menu with a copy button: play the same land as a friend and compare
- [x] "Save a picture" in the menu: a screenshot of the town with its name, rank and year, to share

### Phase 23 — Ideas for the next runs
- [x] Name your town when founding it; the name heads the save list, the picture and the chronicle
- [x] A "seed of the week" on the New Settlement screen, the same for everyone, so friends can race the same land
- [x] A town score (villagers, prestige, great works, years without hunger) on the picture and the load card, for friendly comparison

### Phase 24 — More to discover, nicer to share
- [x] Photo mode (U): hide the interface for a clean view of the town; the picture button uses it
- [x] Six new decision events (pilgrims, a comet, a spring flood, a beekeeper, a border quarrel, a holy relic), some only for larger towns, so each game tells a different story
- [x] "What's new" on the title screen: a short list of the latest additions, for friends coming back to the link

Note for later runs: when a feature players would notice goes in, add a line to the top of `src/ui/news.ts` (with the next number) so returning friends see it marked as new.

### Phase 25 — Ideas for the next runs
- [x] A link to share the land: the menu copies the game's address with `?seed=…`, and opening it goes straight to New Settlement with that seed
- [x] Evening light: the day ends in a warm dusk with lit windows before the next morning (off in light mode)
- [x] A quiet tune for each season from the existing sound engine, with its own volume switch

### Phase 26 — Ideas for the next runs
- [x] More map types, chosen on New Settlement (with the preview): Meadows (as before), River valley (a broad river with islands and fords, rich banks, little stone) and Hills (more rock and ore, thin soil, only a stream). Shared seed links carry the land
- [x] Villagers react to evening: they walk home at dusk (lanterns lit) and stay in until morning; only newcomers on the road are out
- [x] The uitest covers the new menus (photo mode, town files, seed link, music switch) so later changes cannot break them unnoticed

### Phase 27 — Hide the grid (art direction agreed: de-square first, AI art for standalone pictures later, 3D only as a separate experiment)
- [x] Curved roads: draw each road as a smooth band through its tiles, with soft verges, instead of square tiles
- [x] Organic edges: fields get round-cornered, slightly irregular plots with a grassy headland (pastures keep straight fences; forests were already irregular)
- [ ] Buildings face the nearest road (four directions) and small props sit a little off-grid (deferred: sprites carry baked shadows, so mirroring would light them from the wrong side; revisit with a lighting rework or 3D)
- [x] Image slots for standalone art (title screen, event cards) so pictures made elsewhere drop in without code changes: put `title.webp` or `events/<id>.webp` (or .jpg/.png) in `public/art/` (see its README)

*This is the 3D branch (`claude/3d-gridless`), kept up to date with the game; the main branch stays on the flat look.*

### Phase 28 — 3D in our own style, then no grid (agreed direction)
The player wants a virtually gridless town and 3D only if it keeps our own designs. The prototype (proto3d.html) shows it does: a 3D pen re-implements the isometric pen's calls (boxes, gable and pyramid roofs, wall quads, windows, timbers, props), so every building is built from its existing drawing code; trees and other painted art stand as camera-facing billboards of the same sprites; an orthographic camera at 30°/45° matches the flat projection exactly, so panning, clicking tiles and the minimap keep working in the default orientation.
- [x] Prototype: the same town in 3D from the game's own drawings, with a sun and shadows (proto3d.html?seed=4242&years=8)
- [x] Roof and wall patterns as textures: straw, shingles, slates, tiles, stone courses, weatherboards and logs baked from the pen's own pattern code
- [x] Details on every side: windows, doors and timbers mirrored onto the walls the flat view never showed
- [x] Ground: grass, water and roads painted in our style at a finer scale (curved road bands, shorelines; the shore still follows the tile edges until the map itself loses its grid)
- [x] The 3D view in the game behind a setting: same camera as the flat view, the flat canvas on top for overlays, ghosts and villagers; picking through the 3D view (not needed while the view is not turned: the projection matches)
- [x] Villagers, carts and deer in 3D (smoke, overlays and the ghost still draw flat on top, which is right while the view is not turned), so buildings hide what stands behind them
- [x] Turn the view a quarter round with [ and ] (a short swing about the middle of the screen). The flat projection turns the map by the same angle, so overlays, ghosts and picking stay exact without ray casting (the ground is flat); sprites are always drawn unturned. A two-finger twist turns it too, and two round buttons above the minimap do it with a click or a tap
- [x] No grid, step 1: buildings at any position and angle in the 3D view. The simulation keeps its tile grid underneath: a turned building covers the tiles its footprint covers (used for space, paths, its door and demolition) and keeps the nearest grid rectangle for rough distances and the flat view. Placing in 3D, the ghost follows the pointer, turns to face the nearest road (5° steps) and , . turn it by hand
- [x] No grid, step 2: roads as free curves (click points, a smooth band drawn through them; the tiles under it carry the walking speed; starts and ends snap onto roads close by; ordinary roads join a curve only at its ends. The map's first road is still a tile road)
- [x] No grid, step 3: fields, pastures, orchards and markets drawn as free shapes in the 3D view: click each corner, then the first corner again (or Enter, or right-click) to close it. The tiles whose centres lie inside count for area, so yields, pasture room, market stalls, orchard saplings and fences (a timber for every two tiles of outline) follow the shape. The 3D ground paints every zone along its outline (fields, grazing with a fence, orchard rows, market squares); the flat view cuts its square drawing to the outline
- [x] Zones come alive in 3D: market stalls, herds grazing in their pastures (each keeping to its own spot inside a drawn shape) and orchard trees inside drawn orchards; laying a shape clears trees along its edge
- [x] Ground overlays lie on the 3D ground: plans, reaches, the fertility map, road and wall previews and the selected building's outline are painted onto a texture over the tiles on screen (repainted only when they change) and laid just above the ground, so buildings and trees in front hide them at any angle. The selection follows a turned building or a drawn shape. The 3D view zooms in further (models stay sharp)
- [x] Tilt the 3D view: dragging up or down with the right or middle button (or PageUp and PageDown) lowers the camera towards the horizon or raises it towards a bird's-eye view (about 17° to 72°). The flat projection tilts with it, so every overlay, preview and click stays on its tile; tile highlights are drawn through their four corners so they fit at any angle. Clicking selects buildings by casting a ray into the 3D models, so a roof can be picked from a low angle
- [x] For PC: drag with the right or middle mouse button to turn the 3D view to any angle (a right-click without dragging still cancels); the turn buttons sit in the minimap's corner. No stall at the change of season: the water mask is worked out once per map, and in a season's last month the next season's ground and building models are prepared while the browser is idle
- [x] 3D is the default view (the menu switches to the flat view, remembered); a preview of this branch is published at /3d/ beside the game. In 3D: piles of goods in the stores' yards, lamplight in homes at dusk, festivals, market days, the manor's banner and scaffolds
- [x] 3D matches the flat look more closely: buildings stand as tall as in the flat view (heights get the same stretch), so smoke rises from the chimney tops; mill sails on the 3D windmills, turning while the miller works; wells and the silo drawn with real round drums and a conical cap (new cylinder and cone pen calls, painted in the flat view and built in 3D); wildflowers and pebbles in the 3D meadows; smoke, steam and sparks follow turned buildings
- [x] Town walls in 3D (they were missing from the 3D view): laid as free curves like roads (click each bend; sections on clear tiles, gates where they cross roads), drawn as one stone wall with merlons along the curve, towers at ends, bends and every sixth section, and gatehouses over roads; walls laid on the grid join tile to tile. Unfinished sections show as low courses
- [x] Buildings placed by a road in 3D line up with it: they turn square to the road's direction at the nearest point (curves included, not just the tiles under them) and, near it, step back to stand just off its edge, so rows of houses follow a bend
- [x] Villagers walk smoothly: from the middle of one step of their path to the middle of the next, so a road at an angle is walked as a straight line, not a staircase (each leg stays inside a tile of the path)
- [x] Smooth shores in 3D: the water is painted from a softened mask of the water tiles, so banks curve instead of stepping along tile edges, with a sandy rim and deeper water mid-stream. Grass, tufts and water are painted once a season and kept, so laying roads and fields repaints the ground in milliseconds
- [x] No grid, step 4: the autoplayer and the flat view cope with turned buildings and drawn shapes (checked: towns full of them still grow to Town, every tile claim stays consistent, builders finish turned sites; the flat view draws turned buildings square on their nearest rectangle and cuts drawn zones to their outline)
### Phase 29 — More art for the flat look (the chosen direction)
- [x] Stumps where trees were felled, slowly grassing over; reeds and water lilies along quiet shores
- [x] Wildflowers and stones scattered in meadows, thicker on rich soil, changing with the seasons
- [x] More house looks: flower boxes, laundry lines, a bench by the door, varied chimneys and roof patches
- [x] Workshop signs and small working details (most workshops already had them; added windmill sails that turn while the mill is grinding, and sparks from working forges) (a cart at the sawpit, hides on frames at the tannery, cloth drying at the weaver)
- [x] Contact shadows: a soft darkening where walls meet the ground, so buildings sit in the land

### Phase 30 — More life in the flat look
- [x] Chickens pecking about the yards of lived-in homes (spring to autumn)
- [x] Children playing in the lanes near homes, and neighbours stopping to chat
- [x] Bakery ovens glowing at the mouth, and steam from the brewhouse
- [x] Harvest sheaves stooked in the fields after the harvest, and hay ricks by the farmsteads in autumn
- [x] Icicles and snow-heavy roofs in deep winter

### Phase 31 — Water and weather in the flat look
- [x] Ducks and their broods paddling near the banks, spring to autumn
- [x] A fishing boat out on the water near a working fishery
- [x] Puddles on dirt lanes after rain, drying out over the following days
- [x] Morning mist over water and low meadows in spring and autumn
- [x] Chimney smoke, brewhouse steam and cloud shadows drifting with one shared wind that slowly veers and gusts

### Phase 32 — Evenings and festivals in the flat look
- [x] Villagers out after dark carry lanterns, with a warm pool of light at their feet
- [x] A maypole with dancers by the town hall in late spring
- [x] A harvest bonfire with villagers gathered round when the harvest is in
- [x] Wreaths on doors and candles in the windows in midwinter
- [x] Dogs trotting after some villagers, and cats sunning on doorsteps

### Phase 33 — Proportions
- [x] Buildings stand 30% taller (every height is stretched in the projection, so chimneys, sails and glows follow), trees 30% larger, villagers 15% smaller, and dirt lanes narrower, so doors stand above people and lanes no longer dominate

## Playtest feedback, October (the player's own notes, kept as the brief)

The look is right ("loving the cute forms and the overall aesthetics"). Before more
art, the logic and balance get this pass. Grouped by how deep each change goes.

### Phase 34 — Quick fixes from the playtest
- [x] Construction is much faster: building is not where the time should go
- [x] Dirt and stone roads take a little time to build: drawn roads are pegged out (dashed) and laid in order, 16 dirt or 6 paved tiles a day, paid up front and refunded if struck off
- [x] Objectives and rewards (and a City's yearly goals) only in Easy (renamed from Relaxed), not in the regular game
- [x] The build bar keeps a fixed size however many buildings a category holds
- [x] No undo (Ctrl+Z): no room for regrets
- [x] The game pauses when the town grows a size (the banner waits for "Carry on")
- [x] A fertility heatmap on the ground while placing a farm or field
- [x] Buildings whose requirements are not met yet (charters and the like) are hidden from the menus, not shown locked
- [x] Stone roads easy to find: the button is "Stone road" and is there from the start (it used to appear only at Village rank)
- [x] Trading post lists every good, in tabs by kind (Food, Materials, Goods); it used to show only basics and goods already seen
- [x] Bug: the manor stopped improving in one playthrough (renovations never said what they were waiting for; now the upgrade box shows it, e.g. "Waiting for dressed stone in storage")
- [x] Haulers visibly carry what they move (loads drawn larger; storehouse and granary haulers fetch from the yards since Phase 35)
- [x] Fishers sit in their boats (no legs or shadow); fewer duck families, five to seven ducklings each
- [x] Less stone early: level 1 buildings are timber (wells, dairies, sawpits, tanneries, windmills, Timber Houses); stone is for better buildings
- [x] Coins only for what must be imported: woodcutter and forester cost timber only, as do markets, taverns, smithies and upgrades; orchards, decorations and backyard extensions cost coins (and some materials); great works keep coins for their bells, glass and the like. Taxes halved and the start purse 100, so coins are hard to come by and worth spending. A woodcutter's lodge can always be built: with no timber in store its builders fell trees on the spot

### Phase 35 — How work and goods move
- [x] Yield is throughput: what a workplace makes depends on how much its workers get done in a day (walking included). It already was; now the walk to the resource counts for hunters and fishers too, and served workplaces skip the walk to storage
- [x] Workplaces have more jobs and each worker yields less, so labour is a real (but not harsh) concern; idle workers become rare (crews of workplaces that make things are half as large again; a full crew makes what it did)
- [x] Workplaces keep a small local store; granary and warehouse workers fetch from them (a yard of 30; two haulers per storehouse or granary, staffed right after raw materials; served workplaces no longer lose time walking to storage; without a working store, workers carry their goods themselves as before)
- [x] No gathering areas: woodcutters, quarries, mines, foragers, hunters and fishers go to the nearest of what they gather (up to 26 tiles), and the walking costs them time. No range circle when placing them: the hint says how far the nearest is
- [x] Resources are concentrated but sparse: stone in fewer, deeper outcrops; berries and mushrooms in patches; deer herds in woodland glades and rabbit warrens at wood edges; fish in shoals. Herds recover each month unless overhunted; clearing or building over their woods drives them to better cover, or they dwindle
- [x] Mushrooms to gather (visible on the map at the wood's edge, coming up in late summer and autumn)

### Phase 36 — Villagers' days
- [x] Villagers spend time on their needs: each household's walks to market (3 a month), the well (4), church (1) and the tavern (2) are taken off everyone's working time, up to 35%; the villagers panel shows the share and the Steward warns when it runs high. Workers are seen fetching baskets from the market and pails from the well. (At dusk everyone goes home to sleep.)
- [x] Food and goods can only be had where there is a market: homes out of reach of a staffed market go without (a new town's first two months live off the settlers' cart)
- [x] The market is free: a drawn area (3 to 8 tiles a side) where stalls pop up, one for every six tiles, each with a vendor hired right after the food makers. Old market buildings become 3×3 squares
- [x] Trade with the outside world needs a Trading Post (its own building, separate from the market): buying, selling and the merchants' monthly visit

### Phase 37 — The manor and the town
- [x] The game starts without a manor, in a settlers' camp (tents and a cart: shelter for eight and a store). The town grows sizes by itself when it meets the next one's needs: Village 20 people, a marketplace and a well; Town 45, a tavern and a trading post; Borough 90 and a church; City 150 and three charters. The game pauses when it does
- [x] The manor is built by choice, anywhere, once (from Village): storage, prestige, feasts and festivals. Each level waits for a town size, and from the Stone Manor its grounds spread to 4×4 and then 5×5 onto ground that must be kept clear, with a courtyard, walls, and at the Castle, corner towers and a gatehouse
- [x] Specialised houses are built as such: a home craft is a building project (15 timber, 25 planks, 2 tools, 40 coins, about 12 days) and the family keeps it for good. (Their own looks: the existing craft signs for now; more in the visual phase)

### Phase 38 — Herds
- [x] Each animal is bought separately, only once there is a trading post (sheep 20, cow 45, pig 25 coins); they do not breed. Sheep are shorn each spring, cows milked; any animal can be slaughtered for meat and a hide when the player chooses
- [x] Each animal needs room in a pasture (sheep 2 tiles, pig 3, cow 4); kinds share a pasture
- [x] Oats removed (old oat fields turn to wheat, stored oats to grain)
- [x] Fix animals' glitchy look: they wrapped from one edge of the pasture to the other; now they wander smoothly, face where they go and are drawn in depth order. (More herding interaction left for the visual phase)

### Phase 39 — Balance pass
- [x] Hunger drives people away in proportion: half of those who went hungry leave (at most an eighth of the town a month), instead of an eighth of the whole town for a single hungry family
- [x] Hardy mode is hard but fair: every test map reaches Town (in 3 to 6 years, against about 3 on Normal)
- [x] The autoplayer builds a granary before a harvest spoils, serves homes out of a market's reach even when hands are short, keeps its streets around the camp once a manor is built, and no longer builds a mill for every sack of wheat

- [x] Silo (Farming, Village): a round tower that keeps 500 wheat and barley for years, needs no keepers, and fills before the granaries, so a big harvest no longer crowds out other food

### For the visual refinement phase (later)

On hold until the player has played the October changes (Phases 34–38) and given feedback on logic and balance: the player asked not to commit to more art before that.
- [ ] Construction stages as different structures (scaffold, frame, walls, roof) instead of revealing the building
- [ ] Stone roads look like gravel; a third, dressed-stone cobbled street
- [ ] Fields worked and filling up progressively, and each crop easy to tell apart
- [ ] Liked: children playing, people with dogs, fishers' boats
