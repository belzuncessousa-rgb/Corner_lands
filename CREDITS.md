# Credits

Corner Lands: game, code and art made with Claude (Anthropic).

## Music

The game's Credits screen reads these from `public/audio/manifest.json`, written by `scripts/audio.mjs` (the `MUSIC` list there); keep this page in step.

- "Teller of the Tales" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License, <http://creativecommons.org/licenses/by/4.0/>. Plays on the title screen.
- "Angevin" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License, <http://creativecommons.org/licenses/by/4.0/>
- **Village Ambiance**, **Wintersong**, by Alexander Nakarada (CreatorChords), <https://creatorchords.com>. Royalty Free Music by <https://www.free-stock-music.com>. Creative Commons / Attribution 4.0 International (CC BY 4.0), <https://creativecommons.org/licenses/by/4.0/>
- **Winter Night**, by Alexander Nakarada (CreatorChords), <https://creatorchords.com>. Royalty Free Music by <https://www.free-stock-music.com>. CC BY-SA 4.0, <https://creativecommons.org/licenses/by-sa/4.0/>. The game plays a loudness-adjusted copy, shared under the same licence.
- Music: **The Medieval Banquet** by Shane Ivers, <https://www.silvermansound.com>. CC BY 4.0.
- **Woodland Fantasy**, by Matthew Pablo, <https://opengameart.org/content/woodland-fantasy>. CC BY 3.0.
- **Marin Marais, Suite No. 3 from Pièces en trio (1692), excerpts**, played by New Comma Baroque (Matthew C. Cataldi, Baroque violin; Leighann Daihl, Baroque flute; Phillip W. Serna, viola da gamba; Emily J. Morlan, historical keyboards). Wikimedia Commons. CC BY-SA 3.0.
- **John Dowland, M. George Whitehead his Almand** (Lachrimae, No. 21), played by Phillip W. Serna, viols. Wikimedia Commons. CC BY-SA 4.0 (licence to confirm on its Commons page).
- **Chopin, Nocturne Op. 32 No. 1**, played by Constantin Stephan. Wikimedia Commons. CC BY-SA 4.0.
- **Hildegard von Bingen, O frondens**, sung by Magdalen Kadel. Wikimedia Commons. CC BY-SA 3.0.
- **Medieval Vol. 2** (Knight In A Tavern, Drunken King, Morning In A Castle, Hunters In The Forest, Sacred Rivers, Tournier Of The Knights, Midnight Walk, Stranger In Town), by **alkakrab**, <https://alkakrab04.wixsite.com/alkakrab-game-music>, alkakrab04@gmail.com. Under alkakrab's music licence (royalty-free, commercial use allowed, credit appreciated). The licence does not allow sharing the files themselves, so they are kept out of this public repository (see `.gitignore`); they go only into builds of the game.

In the game, credit still to be noted (their files carry no artist or source): **Harvest Season** (`harvestseason.mp3`), **Peaceful Town** (`music_peaceful_town_loop.mp3`), **Town** (`022815townbgm.ogg`), **Celebrations** (`celebrations_1min.mp3`).

Removed because its file carried no credit information: `Satie_-_Gnossienne_1.ogg`.

## Sounds

The recordings are kept on the repository's `master` branch; `node scripts/audio.mjs --fetch` turns them into the game's files (the `SOUNDS` list there says what each is used for).

From freesound.org, named by their uploaders (all CC0 unless the page says otherwise; to confirm):

- Vonora, *Sussex Woodland & Meadow Bird Sounds, Evening*, <https://freesound.org/people/Vonora/sounds/269559/>
- Magnesus, *Forest birds, ambient seamless loop*, <https://freesound.org/people/Magnesus/sounds/723913/>
- OwlStorm, *Night crickets ambience on rural property*, <https://freesound.org/people/OwlStorm/sounds/320145/>
- Stek59, *Autumn wind and dry leaves*, <https://freesound.org/people/Stek59/sounds/457318/>
- shaunhillyard, *Frog croaking (UK common frog)*, <https://freesound.org/people/shaunhillyard/sounds/532235/>

Source and licence still to be filled in:

| File | Used for |
|---|---|
| birds.wav, mostly_river.wav, light_rain.wav, rain.wav, winter_wind.mp3, snow_storm.wav, ocasional_owl.wav | birdsong, water, showers, winter, owls |
| zoon_in_residential.wav, zoon_in_village_2.wav, footstpes.wav, mix_hooves_noise.wav | homes, the town from afar, feet, streets |
| market.wav, tavern.wav, blacksmith.wav, stoneworks.wav, construction.wav, water_mill_…wav, sawing_…wav, woodcutter_mill_…wav, tree_falling_…wav, woodcutters.wav | trades and building sites |
| bees_cut_short_for_buildings.wav, bees.aiff, sheep.wav, cows.flac, cow_mooing.wav, goats.m4a, pig_snort.wav, chicken.wav, more_chicken.wav, rooster_dawn.mp3, ducks.wav, dogs.wav, dogs2.wav | animals |
| change_season_bells.wav | church bells |
| coins_trade_taxes.wav, demolishing.wav, click.wav, click_close_or_back.wav, stone_building_open.wav, science_screen.wav | effects and buttons |

## Fonts

- Cinzel, EB Garamond, Texturina and Kurale, from Google Fonts, under the SIL Open Font License.

---

Options being considered are listed in [docs/AUDIO-OPTIONS.md](docs/AUDIO-OPTIONS.md).
