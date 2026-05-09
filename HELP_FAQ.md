# Game Timer Help and FAQ

Game Timer helps a tabletop group track turns, pauses, setup time, final placements, and end-game stats.

## Quick Start

1. Choose a game from the game list.
2. Add players.
3. Pick colors or factions.
4. Adjust turn order if needed.
5. Press Start.
6. Tap a player when their turn starts.
7. Tap the same player again, tap another player, or use Auto to finish and move turns.
8. Press End when the game is over.
9. Review Statistics, assign placements, and share the results.

## Setup Page

### Choosing a Game

Use the game list to pick the game you are playing. The app shows player count guidance, estimated play time, complexity, and any special tags.

Common tags:

- `T`: The game has a special turn-order rule.
- `F`: The game has faction-based setup.
- `√`: The game data has been manually verified (and often color matched)

### Adding Players

Use the Add Players area to add common names quickly, pick colors, or add a custom player. For faction games, colors may represent factions instead of generic colors.

### Adding Other Rows

Other rows track non-player activity such as:

- Ruling
- Bidding
- Trading
- Banking
- Scoring

These rows appear in the Session and Statistics pages, but they do not receive player placements.

### Turn Order

Drag or arrange players into the correct order before starting. Some games include turn-order guidance. Use First when you want the app to choose or apply the game's first-player rule.

## Session Page

### Starting Turns

Tap a player to start their turn. If another player is active, tapping a new player ends the current turn and starts the new one.

### Pausing

Use Pause when the game stops for discussion, rules lookup, breaks, or interruptions. Pause time is tracked separately from play time.

### Auto

Auto ends the current player's turn and advances to the next player in turn order.

### Ending the Game

Press End to stop the session and open Statistics.

## Statistics Page

The Statistics page shows:

- Total game time
- Setup time
- Play time
- Pause time
- Total turn count
- Timeline
- Player stats
- Other row stats
- Placements
- Awards

### Placements

Use the placement selector in the Players table to assign final places.

Placements support ties. If two players share a rank, the next rank skips correctly. For example:

```text
1st, 1st, 3rd
```

Players are sorted by placement once any placement is assigned.

### Awards

Awards can include:

- Fastest average
- Slowest average
- Fastest turn
- Slowest turn
- Placement medals for 1st, 2nd, and 3rd

### Timeline

The timeline shows setup, player turns, other tracked rows, and pauses. The x-axis uses 15-minute labels and does not show seconds.

## Sharing Results

On the Statistics page, press Share.

You can choose:

- Text: Shares a text summary of the game, totals, player stats, placements, awards, and other rows.
- Image: Creates a PNG image of the full Statistics page.

If native sharing is not available, the app will try to copy the result. If copying is blocked, it opens a preview so you can select or save the result manually.

## Settings

Open Settings from the gear button.

Available settings:

- Light or dark mode
- Player name or faction name as the primary display
- Text labels or emoji labels
- Date format
- Clock-style or unit-style time format
- Changelog
- Wishlist

## Keyboard Shortcuts

Hold `Shift + Control + Option` to reveal shortcut hints on many buttons.

Hidden shortcuts:

- `1`: Setup
- `2`: Session
- `3`: Statistics
- `S`: Settings
- `W`: Wishlist
- `C`: Changelog
- `/`: Focus game search on Setup
- `Shift + G`: Simulate a completed game from the Session page

## FAQ

### Does Game Timer save my session?

No. Current game/session data is in memory only. Reloading the page resets the current session. Settings preferences are saved in the browser.

### Can two players tie?

Yes. Assign the same placement to multiple players. The app adjusts later ranks automatically.

### Why is there a Pause row in Other stats?

Pause time is summarized as an Other row so it can be reviewed alongside other tracked non-player activities.

### What is the Ruling row?

Ruling is an optional Other row for rules lookups or rules discussion. It helps separate rules time from player turn time.

### Why do some games show factions instead of colors?

Some games use named factions. In those games, the color picker becomes a faction picker so player identity matches the game.

### Why does the Statistics page sort players differently?

Once placements are assigned, the Players table sorts by placement. Before placements are assigned, it keeps the session/player order.

### Can I share an image on every device?

Image sharing depends on browser and device support. If native image sharing is unavailable, the app tries image copy or opens an image preview fallback.

### Why are some shortcuts hidden?

Some shortcuts are mainly for testing or quick navigation during development. They are kept hidden so the table UI stays simple.

### Can I edit the game list?

Currently, game data lives inside `game-timer.html`. Editing it requires changing the file. A future wishlist item tracks splitting game data into separate files for easier editing.

### What should I do if the layout feels cramped on phone or iPad portrait?

Use landscape orientation when possible. Improving iPhone and iPad portrait layouts is already on the wishlist, with the Statistics page called out as the highest priority.
