# Verification

Choose checks for changed behavior and shared-code risk. Documentation-only edits need `git diff --check`, not app tests or a preview.

## Automated

```sh
node --test tests/*.test.mjs
for file in assets/js/*.js assets/js/core/*.js assets/js/data/*.js assets/js/features/*.js sw.js; do node --check "$file" || exit 1; done
node -e "for (const f of ['manifest.webmanifest','manifest-dark.webmanifest']) JSON.parse(require('fs').readFileSync(f,'utf8'))"
git diff --check
```

`tests/game.test.mjs` covers player-count fit, placements with ties, totals and awards, and state normalization. `tests/boot.test.mjs` checks ordered scripts, versioned assets, and that every referenced file exists. `tests/pwa.test.mjs` covers the update flow.

Without Node, `osascript -l JavaScript` can syntax-check files with `new Function(source)`.

## Manual (focus on changed behavior)

Serve with `python3 -m http.server 8000`; stop afterward. After editing assets without a version bump, hard-reload (or unregister the service worker) to avoid cached files.

- Setup: game list search and All/Owned/Fits filters; factions and fixed colors auto-advance; Quick Add uses people colors; Ruling auto-row; turn-order rules (faction order, random-all Set); First roll; drag and keyboard reorder; Random and Reset.
- Session: tap/Enter/Space to change turns, pause/resume, Auto, End confirmation with no turns; long-turn warning highlight; reload mid-session resumes; Play tab live dot.
- Statistics: totals, timeline lanes, placements with ties, winner banner, awards alignment, Share text and image (preview fallback), New game.
- Library: ownership toggle, owners, wishlist, rating, notes; Who’s playing → Available and Best fit; add/edit/delete custom game; Play from Library seats present people with the game’s colors/factions.
- People: add, rename (updates owners and history), recolor, remove; records match History.
- History: filters, overview totals, dialog placements update stats, Play again, Share, Delete.
- Settings: Game Timer preferences re-render views; theme, text size; backup export/import preview; Reset Preferences keeps data; Erase All clears session and legacy keys.
- Legacy: with 1.9 keys present (`gameTimerTheme`, `gameTimerTimeFormat`, `gameTimer.lastResult.v1`, `gameTimer.session.v1`), first launch imports preferences, adds the last result to History, and resumes the session.
- Desktop and 375px/mobile: no horizontal overflow, reachable controls, visible focus, both themes, reduced motion; installed app works offline and Update refreshes.
