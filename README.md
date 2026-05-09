# Game Timer

Game Timer is a single-file tabletop session timer for tracking player turns, pauses, setup time, final placements, and end-game statistics. It is built as a standalone HTML app in `game-timer.html` with embedded CSS, JavaScript, game data, changelog, and wishlist data.

Current app version: `1.5.0`.

## Project Structure

```text
game-timer.html   # Complete application: markup shell, styles, state, data, and behavior
README.md         # Developer-oriented project notes
HELP_FAQ.md       # User-facing help and FAQ
```

The app currently has no build step and no external runtime dependencies. Opening `game-timer.html` directly in a browser works, and serving it through a local static server works too.

## Running Locally

Open the file directly:

```text
game-timer.html
```

Or serve the repo root with a static server:

```bash
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/game-timer.html
```

## App Model

The app is organized around three main views:

- Setup: choose a game, add players and other tracked rows, configure colors/factions, and adjust turn order.
- Session: run the timer, start/stop player turns, pause the game, auto-advance turns, and end the game.
- Statistics: review totals, turn stats, placements, timeline, awards, other rows, and share results.

State is held in module-level JavaScript variables inside `game-timer.html`. The app re-renders by replacing `app.innerHTML` for the active view and then binding event listeners for the new DOM.

Persistent user preferences are stored in `localStorage`:

- Theme mode
- Time format
- Date format
- Primary display name mode
- Text/emoji label mode

Game/session data is not persisted across reloads.

## Important Data Blocks

Inside `game-timer.html`:

- `GAME_PRESETS`: game library, player counts, game metadata, colors, factions, and turn-order rules.
- `WISHLIST_ITEMS`: in-app wishlist shown from Settings.
- `CHANGELOG`: in-app changelog shown from Settings. `appVersion()` uses the first changelog entry.
- Named color constants and setup helper lists live near the top of the JavaScript section.

## Key Features

- Game library with recommended/best/avoid player counts.
- Faction-aware setup for games with named faction colors.
- Turn-order guidance for games with special start/order rules.
- Player and other-row tracking.
- Setup, play, pause, and total game timers.
- Per-player turn counts, totals, averages, longest turns, and shortest turns.
- Fastest/slowest average and fastest/slowest turn awards.
- Final placements with ties and rank auto-correction.
- Statistics timeline with setup, player/other, and pause lanes.
- Text and image sharing from the Statistics page.
- Settings, changelog, and wishlist modules.
- Responsive layouts for desktop, tablet, and phone sizes.

## Keyboard Shortcuts

Visible shortcut hints appear while holding `Shift + Control + Option` on supported keyboards.

Hidden testing/navigation shortcuts:

- `1`: Setup view
- `2`: Session view
- `3`: Statistics view
- `S`: Settings
- `W`: Wishlist
- `C`: Changelog
- `/`: Focus game search on Setup
- `Shift + G`: Simulate a completed game from the Session view

Common visible actions also have shortcut tags in the UI, including setup actions, session controls, settings controls, wishlist controls, Share, and Restart.

## Statistics and Sharing Notes

The Statistics page is the most complex area of the app. It combines:

- KPI totals
- Timeline lanes
- Player and Other stat tables
- Placement selectors
- Medal and timing award badges
- Text and image share flows

The image share path creates a PNG from the current Statistics page by cloning the DOM into an SVG `foreignObject`, drawing that image to a canvas, and exporting a PNG blob. This is intentionally dependency-free but may be browser-sensitive, especially on mobile Safari. The current fallback behavior previews the generated image or falls back to text sharing paths.

## Development Guidelines

Because the app is currently a single file, keep changes small and local:

- Prefer adding small helper functions over broad rewrites.
- Keep render functions and event binding in sync.
- When adding a setting or data list, update the corresponding settings UI and any search/filter helpers.
- When changing `CHANGELOG`, keep newest release first because `appVersion()` reads the first entry.
- When completing a wishlist item, remove it from `WISHLIST_ITEMS` and mention it in `CHANGELOG`.
- Avoid changing unrelated game data while working on UI behavior.

## Manual Test Checklist

Before considering a change done:

- Setup loads with default game data.
- Add at least two players and start a session.
- Start a player turn, pause/resume, auto-advance, and end the game.
- Statistics page renders KPI cards, timeline, Players table, and Other table.
- Placement selectors update ranks and preserve ties.
- Share opens the Text/Image chooser.
- Text share works or opens the text fallback.
- Image share works or opens the image preview fallback.
- Settings opens and closes.
- Changelog and Wishlist open from Settings.
- Browser console has no new errors.

## Known Technical Debt

The in-app wishlist tracks active planning items. Notable development items include:

- Create a build script for deployable output.
- Split README, changelog, wishlist, and game list data into separate files.
- Convert to a native app.
- Improve iPhone and iPad portrait layouts, especially Statistics.
- Add more playful share options.
- Fix placement alignment when rows have many badges.
- Add secret hotkeys to the share menu.

## Release Notes

Release notes are maintained in the in-app `CHANGELOG` array. The current `1.5.0` release focuses on final statistics: placements, timeline, sharing, layout polish, and shortcuts.
