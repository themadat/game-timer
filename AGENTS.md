# Game Timer

Static, local-first HTML/CSS/JavaScript; no runtime dependencies or build step. Built on the app-template shell.

## Work efficiently

- Before edits, run `git status --short`; preserve existing work. Search with `rg`, then read relevant sections only. Never dump `assets/js/data/games.js`, full logs, or unrelated docs.
- Read `context/LLM_HANDOFF.md` only when resuming; WISHES only for backlog work. Read recent commits only when history matters. Keep one task per objective; recommend a fresh task for unrelated work.
- Bound tool output; report summaries and failures. Verify affected behavior once; broaden only for failures or shared-code risk. No app tests for documentation-only edits. Stop preview servers.
- Keep responses concise. No unsolicited plans, status files, or subagents. Record a short Resume only for interrupted work.

## Preserve

- Keep the shell (search, Update, Notes, Settings tabs), the Play → Session → Statistics flow, Library, People, and History.
- Keep storage/migrations stable: `gameTimer.state.v2`, the `gameTimer.session.v1` snapshot format, and legacy 1.9 import. New state shapes need normalization and tests.
- Saved history drives library and people statistics; never drop or rewrite records outside explicit user actions.
- Use accessible controls, escaped text, safe URLs, and shared SVGs from `icons.js`.
- No commits/pushes without authorization; keep Git remotes computer-independent.

## On demand

Use docs/COMPONENTS.md for UI/keyboard, ARCHITECTURE.md for state/offline, TESTING.md for checks, CUSTOMIZATION.md for games/configuration/releases, and GIT-SETUP.md for SSH.

## Workflows

- `wish`: record title, desired behavior, status in WISHES; no implementation.
- `plan`: investigate and write a proportionate plan; no implementation. `start`: implement it and verify.
- `cut`: finalize release and close its wish. Bump only config's VERSION once per completed app-change batch, before deployment; follow CUSTOMIZATION. No documentation-only bump.

After file changes, give outcome, verification, and one scoped stage/commit/push command using `Version - Text`. Omit the command for unchanged files.
