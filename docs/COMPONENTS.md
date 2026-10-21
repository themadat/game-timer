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
- Library: “Who’s playing?” chips drive availability and Best-fit ranking; cards open the game dialog for ownership, owners, rating, notes, and play stats.
- History: rows open a dialog with the full statistics, editable placements, Share, Play again, and Delete.

## Search

Global search matches games (name, owners, tags), people, saved games, Notes, Help, Roadmap, and release notes. Quoted words require whole matches; all terms are required. Enter opens the first result.

## Keyboard

Register commands in `SHORTCUTS` (`plain: false` marks chord-only keys), declare `data-shortcut` for hints, and provide a visible action. Shift–Control–Option + key clicks the visible control carrying that `data-shortcut` in the active scope (top dialog or main view) before global shortcuts run. Respect editable fields, IME, browser shortcuts, and modal focus.
