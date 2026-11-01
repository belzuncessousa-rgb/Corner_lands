# Corner Lands on Steam

The game on Steam is the same build as on the web, inside its own window
(Electron, in `desktop/`). Text and balance changes need nothing here: rebuild
and upload again.

## What is ready

- `desktop/`: the desktop app. It serves the game from `app://game/`, so saves,
  sound and fonts work offline; links open in the player's browser; F11 or
  Alt+Enter switches full screen; the main menu has a Quit button.
- The fonts ship with the game (`public/fonts`, SIL Open Font License), so
  nothing is loaded from the internet.
- `npm run build:desktop` (full game) or `npm run build:desktop-demo` (the demo,
  see `src/demo.ts`) puts the game in `desktop/game`.
- `desktop/steam/app_build.vdf`: the upload script for SteamPipe, with the ids
  left to fill in.

## Building

```bash
npm run build:desktop-demo              # or build:desktop for the full game
cd desktop
npm install                             # once
npm start                               # try it in a window
npm run pack:win                        # desktop/out/win-unpacked (CornerLands.exe)
npm run pack:linux                      # desktop/out/linux-unpacked (CornerLands)
```

For the demo with a wishlist button, build with the store page's address:
`WISHLIST_URL=https://store.steampowered.com/app/<id>/Corner_Lands/ npm run build:desktop-demo`.

Build on the computer that has the alkakrab music in `public/audio/music`
(kept out of the repository), or those tracks are missing from the build.
A Mac build (`npm run pack:mac`) must be made on a Mac, and Apple requires
signing and notarising it; Windows and Linux are enough to begin with.

## Step by step on Steam

1. **Steamworks account.** Sign up at <https://partner.steamgames.com>, fill in the
   tax and bank forms, and pay the app fee (100 USD, paid back once the game earns
   1,000 USD). You get an **App ID** for the game.
2. **Store page ("Coming Soon").** Description, tags, at least five screenshots
   (1920×1080), a trailer if possible, and the capsule images: header 920×430,
   small 462×174, main 1232×706, vertical 748×896, library 600×900, library hero
   3840×1240 and logo 1280×720. Fill in the **AI content disclosure** in the
   content survey (code and art were made with an AI assistant). Valve reviews
   the page (a few days); once it is public, people can wishlist.
3. **The demo.** In Steamworks, *Associated Packages & DLC → Demo*: create a demo
   app. It gets its own App ID and shows a "Download Demo" button on the game's
   page. Its wishlist button should point at the main game's page.
4. **Depots.** In the demo's (and later the game's) *SteamPipe → Depots*, add one
   depot for Windows and one for Linux, and in *Installation → General* add a
   launch option for each: `CornerLands.exe` (Windows) and `CornerLands` (Linux).
5. **Upload.** Download the Steamworks SDK, put the App ID and depot ids into
   `desktop/steam/app_build.vdf`, then:
   ```bash
   steamcmd +login <builder account> +run_app_build "$PWD/desktop/steam/app_build.vdf" +quit
   ```
   In *SteamPipe → Builds*, set the new build live on the `default` branch.
6. **Release.** Valve reviews the build too. Steam asks for a store page to be
   live for at least two weeks before the release, so put the page up early:
   wishlists gathered meanwhile matter most at launch. Steam Next Fest (a demo
   festival a few times a year) is a good moment for the demo.

## Still to decide

- **Saves and Steam Cloud.** Saves live in the browser storage of the app
  (on Windows under `%APPDATA%\Corner Lands`), which Steam Cloud cannot sync
  well. For Cloud saves, the desktop app should write each save as a file; a
  small change, best made once texts settle.
- **Achievements and the Steam overlay** need the Steamworks SDK in the app
  (steamworks.js); not needed for a demo.
- **Steam Deck.** The game works with the touch screen and trackpads; there is no
  controller layout yet, so mark it unverified for now.
- **The music licences.** Check that every track's licence allows selling the
  game on Steam (the CC BY and CC BY-SA ones do, with the credits shown; the
  four without credits in CREDITS.md must be sorted out first; alkakrab's
  allows commercial use).
- **The name.** `com.cornerlands.game` and "Corner Lands" in
  `desktop/package.json` go into the app; change them before the first upload
  if needed.
