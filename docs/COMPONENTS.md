# Shared UI

Use labelled semantic controls and `assets/js/icons.js` for standard symbols. State needs text or an accessible name as well as color/artwork.

- `components.openDialog`: remember trigger, open native modal, move focus; closing restores focus. Use confirm for destructive actions.
- `components.toast` and `setLoading`: shared announcements and busy UI.
- Notes: one plain-text, autosaving modal; fullscreen on mobile.
- Settings: vertical icon-led tabs for Settings (Appearance, Game Timer, Backup), Help, What’s New, Roadmap, Shortcuts, and the optional Developer panel. Data Sync configures GitHub Sync.
- Appearance: system/light/dark, icons/text/both buttons, app-wide text scale, hints default off. Reduced motion follows the OS.
- App icon: click/T changes theme; hold or D/pipe toggles Developer Mode.

## Game views

- View tabs (Play, Library, History) sit in the top bar between the title and search; on phones they share the second row with a search icon that expands when focused. They are a tablist; arrows move between them and 1/2/3 switch from anywhere outside a dialog. The Play tab shows a live dot while a session runs.
- Play: the game picker toggles the game list (search plus All/Owned/Fits filters). Name chips seat people; fixed-color games auto-advance to the next unused color or faction. Roster handles drag with a pointer or move with ↑/↓.
- Session: player cards are buttons (tap or Enter/Space). Space advances and P pauses when focus is not on a control. Cards adapt density to their height; phones use two columns and hide search while live.
- Statistics: placement selects keep a fixed column so award badges never shift alignment. Share opens a Text/Image chooser with copy and preview fallbacks.
- Library: “Who’s playing?” chips drive availability and Best-fit ranking; a compact sticky toolbar combines Games/People, Add game, search, and filters; its Table menu contains the player controls, and the filter row scrolls horizontally on phones. A scrollable spreadsheet has sortable headers and sticky game names. Table SVGs and color bubbles are 17px; complexity uses five one-point color bands from green (0–1) through red (4–5). Category and color verification filters supplement ownership and search. Game names open the dialog for ownership, owners, rating, notes, catalog metadata, and play stats. The name includes a right-aligned published year, with color verification and game-specific color bubbles on its second line; the complete standard color set becomes one rainbow circle. Owner is a separate sortable column after Notes. Custom Game stays first even when sorting or filtering. Ratings support half-star steps. Player-count squares use green for best, blue for good, red for bad, and purple for neutral. Time displays the catalog range, with 30-minute color bands based on its longest time (green through red above 150 minutes); sorting by time still uses saved average plays, falling back to the catalog midpoint. BGG, turn-start, and faction symbols follow Name; turn/faction information opens on hover, focus, or tap. BGG ratings are entered manually; missing BGG IDs link to a BGG search. The details dialog and custom-game editor offer BGG name search in a new tab and accept a game URL or ID to link; metadata is not imported automatically.
- History: rows open a dialog with the full statistics, editable placements, Share, Play again, and Delete.

## Search

Global search matches games (name, owners, tags), people, saved games, Notes, Help, Roadmap, and release notes. Quoted words require whole matches; all terms are required. Enter opens the first result.

## Keyboard

Underlined letters identify plain shortcuts: P for Play (pause/resume while a live game is visible), L for Library, H for History, and G/E for Games/People within Library. Period opens Games and focuses its Library search; question mark opens Help. Number keys 1/2/3 and the existing chord shortcuts remain available. Settings → Appearance has a What’s New pop-up toggle; turning it off keeps release notes available manually.

Register commands in `SHORTCUTS` (`plain: false` marks chord-only keys), declare `data-shortcut` for hints, and provide a visible action. Shift–Control–Option + key clicks the visible control carrying that `data-shortcut` in the active scope (top dialog or main view) before global shortcuts run. Respect editable fields, IME, browser shortcuts, and modal focus.
