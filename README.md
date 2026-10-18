# Game Timer

A tabletop session timer and game library. Track turns, pauses, setup time, placements, and end-of-game statistics — and keep a library of the games you own (and who owns them), with play counts and records from every saved game.

Static, local-first HTML/CSS/JavaScript built on the [app-template](https://github.com/themadat/app-template) shell. No build step, runtime packages, backend, or sign-in. Installable and offline-capable.

```sh
python3 -m http.server 8000
```

Then open <http://127.0.0.1:8000/>.

## Features

- **Play** — choose a game, seat players with colors or factions, apply turn-order rules, roll for first player, then time every turn with pause, auto-advance, and Other timing rows (Ruling, Bidding, …).
- **Statistics** — totals, a combined and per-lane timeline, per-player stats, placements with ties, awards, and text or image sharing.
- **Library** — every built-in and added game with ownership, owners, wishlist, rating, notes, play counts, wins, average length, and last played. Pick who is at the table to see what is available and sort by best fit for that player count.
- **History** — every finished game is saved automatically; reopen its statistics, fix placements, share, play again, or delete.
- **People** — the names offered in Setup and as owners, with games, wins, win rate, podiums, and average turn.
- **Table aids** — keep the screen awake during a session, optional turn chime and vibration, and a long-turn warning.
- **Shell** — Help Center, What’s New, Roadmap, Notes, keyboard shortcuts with hint badges, light/dark/system theme, text size, JSON backup/restore with recovery, and one-tap Update.

Version 1.9 data is picked up automatically: an in-progress session resumes, the saved “Last Results” game is imported into History, and display preferences carry over.

## Project structure

```text
index.html                    Shell markup, dialogs, ordered script list
assets/js/config.js           VERSION, identity, features, Help, Roadmap, release notes
assets/js/data/games.js       Built-in games, colors, factions, turn-order rules, default people
assets/js/features/play.js    Setup, session timer, statistics, sharing
assets/js/features/library.js Library, people, history, and their dialogs
assets/js/features/session-aids.js  Wake lock, chimes, vibration, long-turn warning
assets/js/app.js              Shell: views, search, settings, shortcuts
assets/js/core/               State model, storage, dialogs, backup, PWA, (dormant) sync
assets/css/app.css            Shell styles and theme tokens
assets/css/game.css           Play, Library, and History styles
sw.js, manifest*.webmanifest  Offline cache and install metadata
```

## Develop and release

Edit `assets/js/config.js` for identity, Help, Roadmap, and release notes. For a release, change its single `VERSION` value (`major.minor.patch.build`) and add release notes at the front of `releases`; asset URLs, cache names, and visible labels follow automatically. Add or edit built-in games in `assets/js/data/games.js`.

```sh
node --test tests/*.test.mjs
git diff --check
```

## Deploy

GitHub Pages deploys from the checked-in workflow (`.github/workflows/deploy-pages.yml`) on every push to `main`. In the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** (and turn off any branch-based deployment).

## Documentation

- [Architecture](docs/ARCHITECTURE.md): runtime, persistence, offline updates.
- [Customization](docs/CUSTOMIZATION.md): games, people, identity, releases.
- [Components](docs/COMPONENTS.md): shared UI and keyboard conventions.
- [Testing](docs/TESTING.md): automated checks and manual coverage.
- [Git setup](docs/GIT-SETUP.md): personal/work laptop SSH.
- [Agent instructions](AGENTS.md): workflows and commit handoff.
