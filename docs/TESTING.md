# Verification

Choose checks for changed behavior and shared-code risk. Documentation-only edits need `git diff --check`, not app tests or a preview.

## Automated

```sh
node --test tests/*.test.mjs
for file in assets/js/*.js assets/js/core/*.js assets/js/data/*.js assets/js/features/*.js sw.js; do node --check "$file" || exit 1; done
node -e "for (const f of ['manifest.webmanifest','manifest-dark.webmanifest']) JSON.parse(require('fs').readFileSync(f,'utf8'))"
git diff --check
```

`tests/game.test.mjs` covers player-count fit, placements with ties, totals and awards, state normalization, and BGG clipboard parsing/catalog override persistence. `tests/boot.test.mjs` checks ordered scripts, versioned assets, and that every referenced file exists. `tests/pwa.test.mjs` covers the update flow.

Without Node, `osascript -l JavaScript` can syntax-check files with `new Function(source)`.

## Manual (focus on changed behavior)

Serve with `python3 -m http.server 8000`; stop afterward. After editing assets without a version bump, hard-reload (or unregister the service worker) to avoid cached files.

- Setup: game list search and All/Owned/Fits filters; factions and fixed colors auto-advance; Quick Add uses people colors; Ruling auto-row; turn-order rules (faction order, random-all Set); First roll; drag and keyboard reorder; Random and Reset.
- Session: tap/Enter/Space to change turns, pause/resume, Auto, End confirmation with no turns; long-turn warning highlight; reload mid-session resumes; Play tab live dot.
- Statistics: totals, timeline lanes, placements with ties, winner banner, awards alignment, Share text and image (preview fallback), New game.
- Library: right-aligned matching/total count in Search; Table menu below its button, multiple host pills (any selected owner matches), independent Type/Mechanism filters and a mechanism list; Category is absent from columns, filters, search tags, add/edit forms, and paste previews, combined labels such as Board :: Party stay on one line and all eight Additional Types save and filter; compact expansion count/disclosure sits after the year, number before caret without brackets; purple means none owned, blue some, green all; hover/focus lists every expansion only while collapsed; expanding hides the popup and hover/focus stays quiet while rows are visible; linked expansion rows show all saved columns and support in-row ratings; name-only expansions keep unknown fields blank; Mechanism arrows are centered; only owned expansions receive rows and the rest open in a checklist popup beside the name disclosure so parent rows remain one line tall; per-game disclosure and Table’s global toggle persist; host pills match player colors; ownership toggle, owners, wishlist (including a game owned only by another person), rating, notes; Who’s playing → Available and Best fit; add/edit/delete custom game; assign an existing game through Catalog & BGG → Expansion of (including a standalone Old Saloon under Bang); add as Expansion with a required base game, rename/reparent/convert it back to standalone, and verify ownership stays synchronized with its parent while standalone Play choices exclude linked expansions; Play from Library seats present people with the game’s colors/factions.
- Game editor: Details (colors, timing, ownership, independent personal wishlist), Catalog & BGG, and Your plays tabs fit a desktop viewport; redundant player/time/weight summary is absent; choose standard/selected colors (selection starts unchecked), name factions, add a valid hex color, and edit verification, first-player rules, faction seating, and other timers; confirm autosave without leaving the editor, reload, and reset; confirm these reach Play and survive custom-game edits and sync. Mobile controls remain reachable.
- Paste info: inputs appear in overview, player recommendations, correction order, with one submission; negative published years parse and survive save/reload/edit; Fill form marks missing fields yellow (including suggested defaults) and clears highlighting on manual entry; Name and BGG ID share the first row, all five player fields share one desktop row, and Main Type sits beside Additional Types; matched game and manual autocomplete; selective preview and cancellation; existing game saves, new-game staging, custom-form staging; no external request and no changes to history, personal ratings, notes, owners, or colors.
- People: add, rename (updates owners and history), recolor, remove; records match History.
- History: filters, overview totals, dialog placements update stats, Play again, Share, Delete.
- Settings: Game Timer preferences re-render views; theme, text size; backup export/import preview; Reset Preferences keeps data; Erase All clears session and legacy keys.
- Sync: Data Sync shows the fixed `app-data` target; Test/Save keeps a masked token; first Sync Now creates the file; a second device downloads library and history with recovery; edits on both devices to the same game or record ask which copy to keep; the payload preview contains only notes, people, library, and history.
- Legacy: with 1.9 keys present (`gameTimerTheme`, `gameTimerTimeFormat`, `gameTimer.lastResult.v1`, `gameTimer.session.v1`), first launch imports preferences, adds the last result to History, and resumes the session.
- Desktop and 375px/mobile: no horizontal overflow, reachable controls, visible focus, both themes, reduced motion; installed app works offline and Update refreshes.
