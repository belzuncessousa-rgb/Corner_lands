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
- [ ] Harvest feast: in autumn the lord may call a feast (food and ale for happiness and prestige)
- [ ] Meadmakers make mead from honey at the brewhouse (tavern drink, luxury)
- [ ] Retinue: spend prestige on a castle guard that wards off wolves and bandits in events
