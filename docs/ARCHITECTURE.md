# Architecture

## Startup and versions

`index.html` declares ordered scripts as inert `data-app-src` entries. Deferred `assets/js/boot.js` loads config with a freshness nonce, stamps marked stylesheet/install links with `config.identity.version`, then loads scripts in order. A load failure produces a visible alert.

The sole release literal is `VERSION` in config. Identity version/buildId and the newest release derive from it; older release entries keep their own numbers.

`core/pwa.js` registers `sw.js?v=<buildId>`. The worker derives its cache name (`game-timer-shell-<build>`) from that URL, caches the shell, and serves network-first with offline fallback. The toolbar Update control saves before checking, installing, and refreshing.

## Code map

All runtime modules attach to `window.LocalApp`.
- `config.js`: identity, flags, help, releases (with optional `sections`), Roadmap.
- `icons.js`: every interface SVG, baked in (no catalog).
- `data/games.js`: built-in games, named colors, factions, turn-order rules, default people (`App.gameData`).
- `core/utils.js`, `core/state.js`, `core/storage.js`, `core/components.js`, `core/portability.js`, `core/pwa.js`: shell infrastructure. `core/sync.js` is present but disabled (`features.cloudSync: false`).
- `features/session-aids.js`: wake lock, Web Audio chimes, vibration, long-turn warning (`App.sessionAids`).
- `features/play.js`: setup, live session, statistics, sharing, session snapshot, legacy import (`App.play`). Pure statistics helpers are exposed as `App.play.stats`.
- `features/library.js`: library, people, history, game/custom-game/history dialogs (`App.library`).
- `core/bgg.js`: direct BGG XML API2 search/fetch and XML-to-import fields (`App.bgg`); feeds Library’s selective preview/apply workflow. Settings → Data Sync stores a device-local API key separately (`gameTimer.bggToken.v1`), outside state, backup, and sync. Requests go only to BGG with a Bearer header; successful results cache in memory and requests are spaced five seconds apart. See [BGG setup](BGG.md).
- `features/vibe-check.js`: private pass-the-device Heavy/Light/Sit out ballots and table matching. Heavy defaults to a minimum weight of 2.5; Light uses a maximum weight and defaults to 0.0 (no limit). Unknown weights are excluded only while a nonzero filter is active. Weight buttons use the normalized, device-local `preferences.game.vibeWeightStep` setting (default 0.25; supported 0.1/0.25/0.5/1). Setup uses People/Tables steps, paged highlighted attendee chips, default selections for the eight named regulars when present, and fixed-height game-limit areas to avoid scrolling. The host chooses and confirms a four-digit reveal PIN using button-only entry, with no credential inputs; ballots, passcode, and results stay in memory, outside state/session/backup/sync. Closing or reloading clears the round; hiding the app relocks results, restarts unfinished PIN setup, or discards the unfinished ballot. All stages occupy the viewport; voting shows the current person’s name/color and separated freeform answer targets (or fixed accessible positions), and results always show Heavy/Light/Out columns with colored names. Matching respects choices and game limits, requires three people per active table, then maximizes players seated, active tables, and balance. Ballots are discarded after the authorized reveal.
- `app.js`: header, view tabs (Play/Library/History), global search, settings, shortcuts, developer panel.

Views render by replacing their section’s markup and use delegated events. Rendering dispatches `app:viewrendered` so the shell can decorate shortcut controls.

## Persistence

Application state (`gameTimer.state.v2`, schema v4) holds:
- `workspace.history`: finished games with players, turns, pauses, placements. Statistics for games and people are derived from it.
- `workspace.library.games`: per-game `owned`, `owners`, `wishlist`, `rating`, `note`, and catalog `metadata`; optional normalized `metadata.mechanisms`/`expansions` arrays, a validated `mainType` (Board/Cards/Coop/1v1/Table), and a retained legacy `mainTag` preserve tag groups while legacy `category` remains readable; optional normalized `metadata.catalog` overrides name, player/time limits, weight, and recommendation counts when resolving games for Library and Play; `workspace.library.customGames`: games added by the user.
- `workspace.people`: names and colors used in Setup and as owners.
- `workspace.documents`: the single Notes document.
- `preferences.game`: time/date format, display name mode, labels, demo mode, keep-awake, chime, vibration, long-turn threshold.
- `modules.library|history|play`, `ui.view`: device-local filters and the active view.

Normalization validates and caps every collection; imports are validated, previewed, and confirmed, with a recovery copy saved first.

The live session is a separate high-frequency snapshot (`gameTimer.session.v1`, unchanged from 1.9) saved on every render, every 10 seconds during play, and when the page hides. On first run, play.js imports 1.9 preference keys and the `gameTimer.lastResult.v1` game into History, then sets `meta.legacyImported`.

Ending a game (outside Demo Mode) writes a history record immediately; placement changes in Statistics or the History dialog update that record.

## GitHub Sync

Optional GitHub Sync stores one `local-first-app-data` envelope at `themadat/app-data` → `data/game-timer.json` (fixed in config). Its data allowlist is `notes`, `people`, `libraryGames`, `customGames`, and `history`; preferences, filters, the running session, and credentials stay on the device. The first Sync Now creates the file after confirmation.

Downloads and merges save a recovery copy first. Merge unions history and custom games by id and people by name; the same record or library entry edited differently on two devices is a conflict that needs a manual choice. Optional Auto Sync uploads local-only changes and downloads remote-only changes while the app is visible. Files over 400 KB are written as compact JSON, and files over 1 MB are read through GitHub’s raw media type.
