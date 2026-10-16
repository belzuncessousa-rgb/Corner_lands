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
- [x] Market days: once a month the market square fills with stalls and people for a day, a visible pulse of the economy
- [x] A "what changed" line on the year-in-review page: the three biggest rises and falls in stock
