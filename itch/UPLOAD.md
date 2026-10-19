# Publishing Corner Lands on itch.io

## What is in this folder

| File | Use |
|---|---|
| `corner-lands-itch.zip` (repo root) | The game. Upload this. |
| `cover.png` (630×500) | Cover image |
| `banner.png`, `background.jpg`, `embed-bg.jpg` | Page theme (see *Theme the page*) |
| `1-summer-town.png` … `5-charters.png` (1280×720) | Screenshots |

To rebuild after changes: `npm run build:itch` makes a fresh `corner-lands-itch.zip`, and
`node scripts/itch-shots.mjs` (with the game server running) remakes the pictures.

## Step by step

1. **Make an account** at <https://itch.io/register>. In *Settings → Profile*, pick a creator
   name: your games live at `https://YOURNAME.itch.io/corner-lands`.
2. Go to <https://itch.io/game/new> (or *Dashboard → Create new project*).
3. Fill in the top of the form:
   - **Title:** Corner Lands
   - **Project URL:** corner-lands
   - **Short description or tagline:** *Raise a humble hamlet into a thriving medieval town.*
   - **Classification:** Games
   - **Kind of project:** **HTML** (this is what makes it playable in the browser)
   - **Release status:** *In development* (or *Released*); "In development" sets
     expectations nicely while you keep tweaking.
4. **Pricing:** *No payments*, or *$0 or donate*.
5. **Uploads:** click **Upload files**, choose `corner-lands-itch.zip`. When it finishes,
   tick **This file will be played in the browser**.
6. **Embed options** (appear once the box is ticked):
   - **Viewport dimensions:** 1280 × 720
   - Tick **Mobile friendly** (touch works: drag to pan, pinch to zoom, long-press to cancel).
     Orientation: Landscape.
   - Tick **Fullscreen button**. (The game also fits any window size.)
   - Leave *Automatically start on page load* unticked: players click "Run game".
   - Leave *Enable scrollbars* unticked.
7. **Details:**
   - **Description:** paste the text below.
   - **Genre:** Simulation (or Strategy).
   - **Tags:** city-builder, medieval, strategy, simulation, management, colony-sim, relaxing, isometric, singleplayer.
   - **Made with:** TypeScript (optional).
   - **AI generation disclosure:** itch asks whether the project uses AI-generated content.
     Answer honestly. The code and art were made with an AI assistant.
8. **Media:** upload `cover.png` as the **Cover image**, and the five PNGs under **Screenshots**.
9. **Visibility & access:** keep it **Draft** first and click **Save & view page**. Play it on
   the page (try New Settlement, a save and a reload, and the tutorial). Then come back,
   set it to **Public** and save. Done!

Later updates: *Edit game → Uploads*, upload the new zip and delete the old one (or use
"Replace"). Saves stay in players' browsers between versions, because the game loads old saves.

## Theme the page

After saving, open the page and click **Edit theme** (top of the page). Under **Images**:

| Slot | File | Setting |
|---|---|---|
| **Banner** | `banner.png` (960×300, transparent) | It replaces the title text at the top. |
| **Background** | `background.jpg` (2400×1350) | Repeat: *No repeat*; Position: *Center*, top; tick *Fixed* if offered. |
| **Embed BG** | `embed-bg.jpg` (1280×720) | Shown behind the "Run game" button. |

Suggested colours, to match the wooden boards:

| Colour | Value |
|---|---|
| Background | `#2a1d12` |
| Inner column | `#3b2a1a` |
| Text | `#f2e2c0` |
| Links | `#f2c46a` |
| Buttons | `#8a5a32` |
| Embed background | `#2a1d12` |

Fonts: *Header* Cinzel if offered (otherwise any serif), *Body* a serif such as EB Garamond or Lora.
Remake the pictures with `node scripts/itch-art.mjs` (game server running).

## Things good to know

- **Saves** live in the player's browser (local storage on itch's domain). They survive
  updates and reloads, but not clearing site data or switching browsers. To move a town,
  players can download it as a file from *Save Game* and open it from *Load Game*.
- The game needs no server, makes no network requests apart from Google Fonts, and is about
  190 KB zipped.
- The "share this seed" link points at the game's frame on itch's servers, not your itch
  page. Players can still type the seed into *New Settlement*.

## Store page text (paste into Description)

> **Corner Lands** is a cosy medieval city builder that runs in your browser.
>
> A handful of settlers and their carts arrive on a quiet corner of land. Clear the woods,
> gather berries and game, raise cottages and lay the first lanes. Every villager walks to
> work, carries goods to the stores and comes home at dusk with a lantern. Watch your
> hamlet grow into a village, a town, a borough and finally a city.
>
> **Features**
> - A living town: villagers fell trees, plough fields, haul sacks, dance round the maypole
>   and gossip at the well. Every good is carried by hand, so roads and good placement matter.
> - Four seasons with snow, autumn woods, harvests and hungry winters.
> - Production chains from wheat to bread, wool to clothes, bog iron to tools and silver to jewellery.
> - Homes that grow from cottages to tall merchants' houses as their needs are met.
> - Your own lord or lady, with custom clothes and a coat of arms on your banners.
> - A manor that grows into a stone manor with gardens, watchtowers and town walls.
> - Town charters: seven paths to specialise your town, from Master Smiths to the University.
> - A tutorial with your steward, Fingamoboblius.
> - Three difficulties, and endless random lands (meadows, river valleys and hills) with shareable seeds.
>
> **Controls:** left-click to build and select, drag or WASD/arrow keys to move,
> wheel to zoom, right-click or Esc to cancel, Space to pause. Touch works on tablets and phones.
>
> Corner Lands is in development. Feedback is very welcome in the comments!
