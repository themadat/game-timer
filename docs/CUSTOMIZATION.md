# Customization

For SSH on either laptop, see [Git setup](GIT-SETUP.md).

## Games

Built-in games live in `assets/js/data/games.js` as `GAME_PRESETS`. Each entry has an `id` (stable — history and library ownership reference it), `name` (a trailing `(2019)` renders as a year tag), player range, minutes, `complexityWeight`, `recommendedPlayers`/`bestPlayers`/`avoidPlayers` (counts or ranges such as `3-4` or `2, 5-6`; `--` for none), and optional:
- `colors`: `colorDef(name, namedColor, hex)` entries. Names that are not plain color names are treated as factions.
- `openColorPool: true`: use the standard color set and Quick Add.
- `turnOrder`: `{ icon, label, note, firstMode: "faction-order" | "current-order" | "random-all" | "random-first" | "manual", sequence: "clockwise" | "random" | "listed", autoSortFactions, defaultOthers: ["Bidding"] }`.
- `manual` first-player mode requires choosing the starter from the game’s setup (for example an Objective card). `sequence` describes subsequent order independently; clockwise is the normal seating default, while legacy random-all/faction rules retain their defaults. Play can override seating and shuffle the full lineup once.
- `verified: true` once colors are checked against the box.

Never rename an existing `id`. Users can also add their own games from the Library; those live in their data, not in this file.

`PRESET_NAMES`/`QUICK_PLAYERS` seed the default People list for new installs only.

## Configuration

Edit `assets/js/config.js`: identity, repository/support URLs, flags, Help topics, Roadmap, and releases. Theme defaults (`themeDefaults`) set the accent colors. Keep system appearance and OS reduced motion.

BGG keys are entered in Settings → Data Sync, outside source/configuration, backups, and sync; see [BGG setup](BGG.md). Requests go directly to BGG without a server.

## Release

Bump `VERSION` in config once per completed app-change batch, before committing a deployable release. The format is `major.minor.patch.build`; increment build normally, or use build 1 after changing major/minor/patch. Add a dated entry first in `releases` using `version: VERSION`, and replace the previous first entry’s `VERSION` reference with its literal number. Entries may include `sections: [{ title, items }]` in addition to features/improvements/fixes/knownIssues.

Do not edit versions in HTML, manifests, workflow names, or documentation. Validate using [Testing](TESTING.md), then use commit subject `Version - Text`.

## Assets

The editable app artwork is `assets/game-timer-icon.svg`. Light/dark app icons, favicons, and splash SVGs in `assets/icons/` wrap it; export 192/512px install icons, 512px maskable icons (artwork inside the central 80%), 180px touch icons, and 1170px splash PNGs from them. When adding a script, add it to `index.html` and the service-worker shell list.
