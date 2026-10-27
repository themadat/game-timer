(function () {
  "use strict";

  window.LocalApp = window.LocalApp || {};

  const VERSION = "2.1.0.46";

  const CONFIG = {
    identity: {
      name: "Game Timer",
      shortName: "Game Timer",
      description: "A tabletop session timer and game library for tracking turns, pauses, placements, and who owns what.",
      version: VERSION,
      buildId: VERSION,
      repository: {
        label: "App repository",
        url: "https://github.com/themadat/game-timer"
      },
      support: [
        { label: "Report a problem", url: "https://github.com/themadat/game-timer/issues/new" },
        { label: "View documentation", url: "https://github.com/themadat/game-timer#readme" }
      ],
      assets: {
        favicon: "assets/icons/favicon-tab.svg",
        appIconLight: "assets/icons/app-icon-light.svg",
        appIconDark: "assets/icons/app-icon-dark.svg",
        manifestLight: "manifest.webmanifest",
        manifestDark: "manifest-dark.webmanifest"
      }
    },

    schemaVersion: 4,
    storage: {
      stateKey: "gameTimer.state.v2",
      legacyKeys: [],
      recoveryKey: "gameTimer.recovery.v1",
      secretKey: "gameTimer.githubToken.v1",
      sessionSecretKey: "gameTimer.githubToken.session.v1",
      sessionKey: "gameTimer.session.v1",
      legacyLastResultKey: "gameTimer.lastResult.v1"
    },

    cloudSync: {
      owner: "themadat",
      repo: "app-data",
      branch: "main",
      path: "data/game-timer.json"
    },

    features: {
      records: false,
      documents: true,
      cloudSync: true,
      roadmap: true,
      developerTools: true,
      hints: true,
      demoData: true
    },

    controls: {
      shortcutHintModifier: "ShiftControlOption",
      autosaveDelayMs: 180,
      syncCheckIntervalMs: 30000,
      hintsEnabledByDefault: false,
      whatsNewAutoDismissMs: 20 * 1000,
      maxImportBytes: 5 * 1024 * 1024,
      maxRecords: 5000,
      maxDocuments: 500,
      maxTextLength: 20000,
      maxDocumentHtmlLength: 250000,
      maxHistory: 2000,
      maxPeople: 200,
      maxCustomGames: 500,
      sessionAutosaveMs: 10000
    },

    statuses: [
      { id: "active", label: "Active", icon: "●", color: "#2f7d68" },
      { id: "paused", label: "Paused", icon: "Ⅱ", color: "#a86a1f" },
      { id: "complete", label: "Complete", icon: "✓", color: "#4f6f52" },
      { id: "idea", label: "Idea", icon: "◇", color: "#7058a3" }
    ],

    themeDefaults: { accent: "#9a5b14", accent2: "#2f6f8f", success: "#3f7a55", warning: "#9b6a24", danger: "#b0413e" },

    releases: [
      {
        version: VERSION,
        date: "2026-10-27T01:30:00.000Z",
        title: "Refresh existing standard colors",
        summary: "Existing games adopt Pine, Lime and Slate for legacy standard swatches while custom hex colors stay intact. Tristen defaults to Pine.",
        features: [], improvements: ["Update saved standard palettes and built-in color names", "Set Tristen’s default color to Pine"], fixes: ["Preserve custom hex colors in the game editor"], knownIssues: []
      },
      {
        version: "2.1.0.45",
        date: "2026-10-27T01:00:00.000Z",
        title: "Sixteen standard colors",
        summary: "Use the ordered sixteen-color palette with darker Slate, and consolidate old Green, Teal and Gray options in the game editor.",
        features: [], improvements: ["Order standard colors from Red through Black", "Replace Gray with darker Slate"], fixes: ["Avoid duplicate legacy color options in the editor"], knownIssues: []
      },
      {
        version: "2.1.0.44",
        date: "2026-10-26T12:00:00.000-05:00",
        title: "Clockwise seating and Uprising rules",
        summary: "Separate first-player selection from full-order shuffling, with rulebook-backed Dune: Imperium — Uprising setup.",
        features: ["Clockwise seating checkbox, chosen starter, and one-time full-order shuffle", "Uprising colors, Objective-card starter, clockwise rules and phase timers"],
        improvements: ["Save turn-order type separately from first-player rules"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.44",
        date: "2026-10-27T00:00:00.000Z",
        title: "Lime and pine colors",
        summary: "The standard palette offers lime and pine, with pine as the default green. Game color editors use four columns.",
        features: [], improvements: ["Replace standard green and teal with light lime and dark pine", "Keep game color pickers in four columns"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.43",
        date: "2026-10-23T18:15:00.000Z",
        title: "Align years and expansion counts",
        summary: "Years and expansion counts use consistent right-aligned slots across regular and expansion rows.",
        features: [], improvements: [], fixes: ["Keep year positions steady when expansion counts differ or are absent"], knownIssues: []
      },
      {
        version: "2.1.0.42",
        date: "2026-10-23T18:00:00.000Z",
        title: "Right-aligned name details and two-row player counts",
        summary: "Colors, year and expansions align right within the content-sized name column; games above eight players use two rows of counts.",
        features: [], improvements: ["Share name-column space across rows without fixed lanes", "Keep all supported player counts visible in two rows"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.41",
        date: "2026-10-23T17:45:00.000Z",
        title: "Visible and immediate game autosave",
        summary: "Game edits write to local storage immediately and show whether they saved or why saving is blocked.",
        features: [], improvements: ["Show saved, pending validation, and storage-failure status"], fixes: ["Stop silently skipping autosave on invalid fields"], knownIssues: []
      },
      {
        version: "2.1.0.40",
        date: "2026-10-23T17:30:00.000Z",
        title: "Show all supported player counts",
        summary: "The Players column fits every supported count instead of hiding counts above eight in a scroll area.",
        features: [], improvements: [], fixes: ["Keep player counts through 20 visible on one line"], knownIssues: []
      },
      {
        version: "2.1.0.39",
        date: "2026-10-23T17:15:00.000Z",
        title: "Content-sized game name column",
        summary: "Names, colors, years and expansion counts sit together without fixed-width lanes.",
        features: [], improvements: ["Size the name column to complete inline content", "Keep long names visible with horizontal table scrolling"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.38",
        date: "2026-10-23T17:00:00.000Z",
        title: "Keep scroll steady while editing games",
        summary: "Autosaving game edits keeps the editor in place and preserves library scrolling when it closes.",
        features: [], improvements: [], fixes: ["Avoid rebuilding the background library on each form edit", "Restore editor and library scroll positions during refreshes"], knownIssues: []
      },
      {
        version: "2.1.0.37",
        date: "2026-10-23T16:45:00.000Z",
        title: "Stable expansion checklist scrolling",
        summary: "Checking owned expansions keeps the checklist, focus, and library scroll position in place.",
        features: [], improvements: [], fixes: ["Update expansion ownership without rebuilding the open checklist or resetting table scroll"], knownIssues: []
      },
      {
        version: "2.1.0.36",
        date: "2026-10-23T16:30:00.000Z",
        title: "Consistent promo filtering",
        summary: "Exclude promo entries in both correction imports and expansion-list saves, including Promokarte.",
        features: [], improvements: [], fixes: ["Filter directly edited expansion lists too", "Apply an empty expansion list when every imported entry is excluded"], knownIssues: []
      },
      {
        version: "2.1.0.35",
        date: "2026-10-23T16:15:00.000Z",
        title: "Highlight missing owners",
        summary: "Ownership gets a yellow border until an owner is selected or entered.",
        features: [], improvements: ["Highlight unspecified owners in Add/Edit and Details"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.34",
        date: "2026-10-23T16:00:00.000Z",
        title: "Consistent Add and Edit game forms",
        summary: "Every saved game can use the complete Add/Edit form, with yellow missing fields and automatic saving for updates.",
        features: [], improvements: ["Full catalog editing for built-in games without duplicating records", "Missing-field highlights on opening Add or Edit", "Notes in the shared form"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.33",
        date: "2026-10-23T15:30:00.000Z",
        title: "Numeric personal ratings",
        summary: "Select your numeric rating with one click when adding or updating a game.",
        features: [], improvements: ["Replace remaining stars with numeric ratings", "Direct half-point rating buttons in game forms"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.32",
        date: "2026-10-23T15:15:00.000Z",
        title: "Skip promo expansions in correction imports",
        summary: "Correction paste excludes promo and promotional expansions as well as fan expansions.",
        features: [], improvements: ["Ignore separate promo sections and promo-labeled expansion names"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.31",
        date: "2026-10-23T15:00:00.000Z",
        title: "Leave unknown player counts and times blank",
        summary: "New games and expansions no longer receive invented player counts, recommendations, or play times.",
        features: [], improvements: ["Allow saving incomplete player and timing information"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.30",
        date: "2026-10-23T14:30:00.000Z",
        title: "Roomier catalog lists",
        summary: "Edit alternative names, mechanisms, and expansions one per line in tall scrollable columns.",
        features: [], improvements: ["Compact lookup-side types, year and rating", "Newline lists in Add/Edit game and paste fills"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.29",
        date: "2026-10-23T14:00:00.000Z",
        title: "Skip fan expansions in correction imports",
        summary: "Correction paste excludes expansions labeled as fan expansions or fan-made entries.",
        features: [], improvements: ["Skip separate Fan Expansions sections"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.28",
        date: "2026-10-23T02:45:00.000Z",
        title: "Visible BGG ID in paste",
        summary: "Review or correct the BGG ID beside the game name before applying pasted information.",
        features: ["Editable BGG ID or page-link field in Paste game info"], improvements: ["Read IDs from correction page URLs and labeled BGG IDs"], fixes: ["Detect linked title IDs without a URL slug"], knownIssues: []
      },
      {
        version: "2.1.0.27",
        date: "2026-10-23T02:30:00.000Z",
        title: "Edit published years in the table",
        summary: "Click the year area to add or edit a published year on regular and expansion rows.",
        features: ["Inline year editing, including negative years and name-only expansions"], improvements: [], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.26",
        date: "2026-10-23T02:15:00.000Z",
        title: "Expansion notes editing",
        summary: "Double-click Notes on name-only expansion rows to add notes without opening the editor.",
        features: [], improvements: [], fixes: ["Enable inline notes for name-only expansions; create their linked record only when a note is saved"], knownIssues: []
      },
      {
        version: "2.1.0.25",
        date: "2026-10-23T02:00:00.000Z",
        title: "Edit notes in the library table",
        summary: "Double-click a Notes cell to edit it directly. Click away to save or press Escape to cancel.",
        features: ["Inline notes editing with keyboard access"], improvements: [], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.24",
        date: "2026-10-23T01:45:00.000Z",
        title: "Optional alternative-name import",
        summary: "Pasted alternative names start unchecked so importing them is an explicit choice.",
        features: [], improvements: ["Leave alternative names unchecked in paste previews"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.23",
        date: "2026-10-23T01:30:00.000Z",
        title: "Alternative names beside game names",
        summary: "Library rows show alternative names beside the main name, with the full list available on hover.",
        features: [], improvements: ["Display alternative names inline while keeping compact rows"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.22",
        date: "2026-10-23T01:15:00.000Z",
        title: "Whole-page correction paste",
        summary: "Read BGG correction pages even when copied without Edit and Remove controls.",
        features: [], improvements: [], fixes: ["Ignore BGG navigation when reading correction identity", "Read alternative names, mechanisms, and expansions from unlabeled rows"], knownIssues: []
      },
      {
        version: "2.1.0.21",
        date: "2026-10-23T01:00:00.000Z",
        title: "Two-decimal game weight",
        summary: "Weight displays consistently with two decimal places in the library, Play, and paste preview.",
        features: [], improvements: ["Show weight as 1.00 or 3.98"], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.20",
        date: "2026-10-23T00:45:00.000Z",
        title: "Alternative game names and linked overview paste",
        summary: "Add searchable alternative names and fill game details from linked BGG overviews, including games without a year.",
        features: ["Alternative names in Add/Edit game and catalog details", "Keep BGG hyperlinks when pasting copied page content"],
        improvements: [], fixes: ["Read overview names and ratings without a published year"], knownIssues: []
      },
      {
        version: "2.1.0.19",
        date: "2026-10-23T00:30:00.000Z",
        title: "Visible owner selection when adding games",
        summary: "Owner selection sits directly below the game name, with an option to enter other owners.",
        improvements: ["Show ownership and owner selection near the top of Add/Edit game", "Enter owners who are not in People", "Remove Have checkboxes from expansion Owner cells"],
        features: [], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.18",
        date: "2026-10-23T00:20:00.000Z",
        title: "Expansion editing and game owners",
        summary: "Owned expansion names open an editor, and game forms include ownership and owner selection.",
        features: ["Edit owned expansions from their names, including name-only entries", "Set owners and independent wishlist status in Add/Edit game"],
        improvements: ["Partial expansion counts show owned/total", "Alphabetical Expansion of choices", "Yellow border when no Additional Types are selected"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.17",
        date: "2026-10-23T00:10:00.000Z",
        title: "Complete expansion rows",
        summary: "Linked expansions show their saved game details in every column, with cleaner disclosure behavior.",
        improvements: ["Hide expansion popups while their rows are expanded", "Display linked expansion ratings, players, timing, types, notes, and other saved fields", "Center the Mechanism dropdown arrow vertically"],
        features: [], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.16",
        date: "2026-10-23T00:00:00.000Z",
        title: "Compact names and expansion ownership counts",
        summary: "Name columns use less space, expansion counts show ownership with color, and existing games can be linked to a base game.",
        features: ["Expansion count before its disclosure: purple none owned, blue some, green all", "Hover or focus the count to inspect expansion lists", "Assign existing games through Expansion of in Catalog & BGG"],
        improvements: ["Narrower Name column and tighter gaps", "Remove Category from library columns, filters, forms, and paste previews"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.15",
        date: "2026-10-22T23:00:00.000Z",
        title: "Grouped game form and compact library rows",
        summary: "Game forms group identity, player counts, and types, and highlight fields missing from pasted information.",
        features: ["Negative published years", "Yellow highlights for missing pasted fields"],
        improvements: ["BGG ID beside the name; player fields on one desktop line", "Main Type and Additional Types grouped together", "Paste inputs ordered overview, player recommendations, correction", "Compact game rows with unowned expansion lists in a popup"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.14",
        date: "2026-10-22T22:00:00.000Z",
        title: "Linked expansions and colored hosts",
        summary: "Host pills use player colors, expansion disclosures sit beside the year, and new games can be linked as expansions.",
        features: ["Add a custom game as an expansion of a base game", "Expand owned expansion rows and list unowned expansions within the name column"],
        improvements: ["Host pills match player colors", "Combined type labels such as Board :: Party"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.13",
        date: "2026-10-22T20:00:00.000Z",
        title: "Expansion ownership and combined game details",
        summary: "Details include colors and timing alongside personal ownership, while expansions can be checked off and shown as rows.",
        features: ["Track which expansions you have", "Show or hide expansion rows beneath their base game", "Choose Additional Types alongside Main Type"],
        improvements: ["Wishlist has its own control, independent of who owns a copy", "Colors and timing move into Details in place of the range summary"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.12",
        date: "2026-10-22T18:00:00.000Z",
        title: "Autosaving game details and focused filters",
        summary: "Game edits save automatically, hosts support multiple selections, and categories and mechanisms have separate filters.",
        features: ["Autosaving color and timing controls with single-click choices", "Name factions and add custom hex colors", "Choose multiple hosts using pills", "Separate type, category, and mechanism filters; expansion lists open beside the game type"],
        improvements: ["Search shows the matching game count", "Table options open below their button", "Consistent editor field heights and readable entered text"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.11",
        date: "2026-10-22T00:05:00.000Z",
        title: "Game colors and timing editor",
        summary: "A wider tabbed game editor makes room for colors, first-player rules, and extra timers.",
        features: ["Select available game colors and preserve faction names", "Customize first-player rules, faction seating, and other timers", "Paste correction forms, overviews, and player polls together before one submission"],
        improvements: ["Desktop game details use focused tabs", "Verification appears after the color circles"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.10",
        date: "2026-10-21T23:58:00.000Z",
        title: "Anchored ratings and hosting filters",
        summary: "Ratings open beside their pills, game types organize tags, and the table can filter by its host.",
        features: ["Vertical ratings from -- and 5.0 down, aligned with the current score", "Board, Cards, Coop, 1v1, and Table types with three columns of detailed tags", "Filter games by the selected host’s ownership"],
        improvements: ["Owned games can also stay on the wishlist", "Names, right-aligned colors, and the year share one line"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.9",
        date: "2026-10-21T23:55:00.000Z",
        title: "Compact columns and grouped tags",
        summary: "The library fills the available space, ratings open from pills, and one main tag expands into organized sections.",
        features: ["Choose a main tag from Category, Mechanism, and Expansions sections", "Click a rating pill to choose a half-star score"],
        improvements: ["Narrow utility columns and right-aligned play times", "Player counts line up by number with blank unsupported positions", "BGG pastes preserve separate category, mechanism, and expansion lists"],
        fixes: ["Remove unused space beneath the Library table"], knownIssues: []
      },
      {
        version: "2.1.0.8",
        date: "2026-10-21T23:50:00.000Z",
        title: "Paste game information",
        summary: "Paste BGG correction forms, game overviews, or player polls to fill game information locally.",
        features: ["Autocomplete game matching with a field-by-field preview", "Fill existing games or stage a new game, with no network lookup", "Player polls select Best, Good, and Bad from the dominant vote"],
        improvements: ["Pasted catalog details persist in backups and sync and are used in Play", "Full category and mechanism lists become tags"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.7",
        date: "2026-10-21T23:45:00.000Z",
        title: "Inline ratings and faction details",
        summary: "Rate games directly in the table, inspect faction colors, and browse a tighter Library layout.",
        features: ["Inline half-star ratings with one-decimal scores and colors", "Faction bubbles reveal names; faction lists use matching color bullets"],
        improvements: ["Play symbols precede names; owner pills replace the ownership action", "Eight player-count squares per row, one-decimal complexity and BGG scores", "Tags replace Category, and Table controls precede search with its period shortcut hint"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.6",
        date: "2026-10-21T23:30:00.000Z",
        title: "Library shortcuts and quieter updates",
        summary: "Disable automatic What’s New banners, navigate with underlined letter shortcuts, and search Library with a period.",
        features: ["What’s New pop-up On/Off setting", "P/L/H navigation, G/E Library tabs, and period to focus Library search"],
        improvements: ["The full available color set displays as one rainbow circle"],
        fixes: ["Library search preserves spaces and cursor position while typing"], knownIssues: []
      },
      {
        version: "2.1.0.5",
        date: "2026-10-21T23:00:00.000Z",
        title: "Compact sticky Library toolbar",
        summary: "Library tabs, search, filters, and Add game share one compact toolbar that stays visible as you scroll.",
        improvements: ["Table player controls open from the toolbar", "Five complexity colors in one-point bands", "Table symbols match the color bubbles; tighter rows and no repeated timer symbol"],
        features: [], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.4",
        date: "2026-10-21T22:00:00.000Z",
        title: "Library details and half-star ratings",
        summary: "Colors and verification sit under game names, with a separate Owner column and half-star ratings.",
        features: ["BGG name search and paste-link linking in game details and the custom-game editor", "Rate games in half-star steps"],
        improvements: ["Wider names fit 16 colors; Custom Game stays first through sorting and filtering", "Owners have their own sortable column after Notes"],
        fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.3",
        date: "2026-10-21T20:00:00.000Z",
        title: "Compact library columns",
        summary: "A denser library with player-count squares, colored play times, and quick information symbols.",
        improvements: ["Published year sits beside the name; BGG links show green when linked and red when missing", "Combined player counts and time ranges; hover or tap turn and faction symbols for details", "Player-count controls share the Who’s playing row and filters have matching heights"],
        features: [], fixes: [], knownIssues: []
      },
      {
        version: "2.1.0.2",
        date: "2026-10-21T18:00:00.000Z",
        title: "Spreadsheet game library",
        summary: "Browse games in a sortable spreadsheet with catalog details and color bubbles.",
        features: ["Sticky game names and column headings, category and verified-color filters", "Editable published year, BGG rating, category, and BGG game ID in game details"],
        improvements: ["All requested player counts, times, turn rules, factions, and notes in one table"],
        fixes: [],
        knownIssues: []
      },
      {
        version: "2.1.0.1",
        date: "2026-10-21T12:00:00.000Z",
        title: "Cloud sync and a slimmer top bar",
        summary: "Your game library, history, and people can now sync between devices through GitHub, and Play, Library, and History live in the top bar.",
        features: [
          "GitHub Sync for the library (owned games, owners, wishlist, ratings, notes, added games), game history, people, and Notes",
          "Optional Auto Sync while the app is open, with manual review for conflicts",
          "Play, Library, and History tabs in the top bar"
        ],
        improvements: [
          "More room for player cards: the section tabs no longer take their own row",
          "Search collapses to an icon on phones and expands when tapped",
          "Long histories sync reliably, including cloud files over 1 MB"
        ],
        fixes: [],
        knownIssues: ["Sync needs a fine-grained GitHub token with Contents access to the app-data repository on each device."]
      },
      {
        version: "2.0.0.1",
        date: "2026-10-17T12:00:00.000Z",
        title: "Game Timer 2.0 — the glow-up",
        summary: "Game Timer moves onto the installable app shell with a full game library, saved game history, table aids, and a redesigned setup, session, and statistics flow.",
        features: [
          "Game Library with ownership, owners, wishlist, play counts, wins, average length, and last played",
          "Sort and filter the library by who is at the table, best player count, availability, plays, weight, and length",
          "Add your own games to the library and pick them in Setup",
          "Game History saves every finished game; reopen its statistics, adjust placements, share, or delete it",
          "People manager with per-person records: games played, wins, win rate, and average turn",
          "Keep the screen awake while a session is running",
          "Optional turn chime, vibration, and a long-turn warning",
          "Installable, offline-capable app with one-tap Update",
          "Help Center, Release Notes, Roadmap, Notes, and keyboard shortcut reference in Settings",
          "JSON backup and restore for your library, history, people, notes, and preferences"
        ],
        improvements: [
          "Setup, Session, and Statistics redesigned on the shared light and dark themes with adjustable text size",
          "Setup game list shows ownership and can show only games you own or that fit the table",
          "Statistics badges and placement selectors stay aligned regardless of how many awards a player earns",
          "Game data, help, release notes, and roadmap live in separate source files",
          "An in-progress session from version 1.9 resumes automatically, and its last saved result is imported into History"
        ],
        fixes: [],
        knownIssues: [
          "Vibration is not supported by Safari on iPhone and iPad; the chime and on-screen warning still work.",
          "Image sharing depends on browser support; unsupported browsers show a preview to save instead."
        ]
      },
      {
        version: "1.9.0",
        date: "2026-05-21T12:00:00.000Z",
        title: "Periodic Auto-Save",
        summary: "On a stable HTTPS origin (e.g. GitHub Pages) localStorage is reliable, so 1.9 leans into it: the active session now writes itself out automatically every 10 seconds during play — independent of UI interactions — so if your tab crashes, the browser sleeps, the battery dies, or you accidentally reload, you can pick right back up.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Continuous Snapshot", items: ["A 10-second setInterval calls saveSession() regardless of whether the UI is being touched, so a long quiet turn (where no buttons get tapped) still gets flushed to disk on a fixed cadence.", "The existing render-driven save still fires on every state change, so quick interactions hit storage immediately; the 10s timer is the idle safety net."] },
          { title: "Visibility & Unload Safety", items: ["Saves the session on visibilitychange (tab hidden), pagehide, and beforeunload so the very last in-memory delta lands before the browser tears the page down or backgrounds the tab.", "Wall-clock-based duration math (turn.startedAt, state.currentStartedAt, state.pauseStartedAt) continues to count correctly across the resume, so a 7-minute interrupted turn still reads as 7 minutes when you come back."] },
          { title: "Diagnostic Tooltip", items: ["The Storage Diagnostic 💾 pill now shows \"Auto-saving every 10s · Last save Ns ago\" in its tooltip, making it easy to confirm the cadence is alive."] }
        ]
      },
      {
        version: "1.8.1",
        date: "2026-05-21T12:00:00.000Z",
        title: "Auto-Save & Mobile Clipboard",
        summary: "This release wraps the 1.8 line with everything needed to make game state survive crashes, reloads, and even iOS HTML viewers that don't persist localStorage.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Auto-Save", items: ["Continuously snapshots the active session (state, setup, selected game, starter, turn-order flag) into localStorage on every render so a crash, battery loss, or accidental reload silently restores Setup, Session, or Statistics state right where you left off — including running and paused timers, which keep counting from their stored timestamps.", "On End, freezes a separate Last Results snapshot that survives Restart so the final stats and timeline are never lost if you forget to Share.", "Added a compact Last Results chip in the Setup header (between the Game Timer title and the ⚙ button) when a saved end-of-game snapshot exists. Tap to re-open the Statistics view, × to dismiss."] },
          { title: "Session Backup", items: ["Added Export / Import buttons in Settings that save and restore the current session as a JSON file via the iOS Share Sheet or file picker.", "Export bundles the live session AND the Last Results snapshot so a single file restores everything.", "Added a Paste Session textarea + Restore button for iOS HTML viewers that block programmatic clipboard reads — long-press inside the box, tap Paste, then tap Restore."] },
          { title: "Clipboard Workflow", items: ["End now auto-copies the full session JSON to the clipboard via the modern Clipboard API with a legacy execCommand fallback for restricted WKWebViews.", "Added a yellow Copy button on the Statistics header with an inline two-overlapping-squares SVG (no emoji) for manually re-copying at any time.", "Two-line confirmation toast slots into the Statistics header between the title pills and the ⚙ button: \"Copied to / clipboard\" on success, \"Clipboard blocked / Use Export\" if the viewer rejects.", "Import button now checks the clipboard first (where allowed) before opening the file picker, so on desktop it round-trips with one tap."] },
          { title: "Storage Diagnostic", items: ["Added a hidden Storage Diagnostic toggle in Settings → Developer Tools.", "When enabled, a small 💾 pill appears beside the version pill on every header showing 💾 #N (persisted across N loads, green), 💾 1st (first load, amber), or 💾 ✗ (localStorage unavailable, red). Useful for confirming whether a given iOS viewer wipes storage on every launch."] }
        ]
      },
      {
        version: "1.8.0",
        date: "2026-05-19T12:00:00.000Z",
        title: "Random Starts & Stats Polish",
        summary: "This release adds full random turn-order setup for the games that need it, condenses the Statistics timeline into a single readable bar, and makes each player's longest turn easy to spot.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Random Turn Order", items: ["Added a data-driven random-all turn-order mode for games whose first turn order is fully randomized (e.g. Cyclades).", "For these games the Turn Order action becomes Set and randomly shuffles every eligible player into a fresh order.", "Set now plays a suspenseful reveal: each slot spins through candidate names with a 🎲 spinner before locking in with a green flash, one position at a time.", "Pending slots dim and italicize while the current slot pulses and flickers so the screen always feels alive.", "Updated Cyclades: Legendary Edition's note to reflect the full random start."] },
          { title: "First Player Drama", items: ["The classic single First pick now plays the same dramatic flicker on the chosen row before settling, lasting roughly twice as long per spin as the random-all per-slot reveal."] },
          { title: "Combined Timeline", items: ["Added a Combined bar across the top of the Statistics timeline that condenses setup, every player or other lane, and pauses onto a single line.", "The Combined bar renders at 1.5x the height of the other lanes for emphasis."] },
          { title: "Longest Turn Highlight", items: ["Highlighted each player's longest turn segment in the Statistics timeline with a deep red outline and pulsing crimson glow, keeping the player's own color as the fill.", "Highlighted the Long column in the final Players and Other tables with deep red text and a deep red outline."] },
          { title: "Demo Mode Tag", items: ["When Demo Mode is enabled the version pill itself swaps to a glowing amber v1.8.0-DEMO-MODE chip (no text clipping); it reverts to the normal style when Demo Mode is off.", "Added a triple-tap gesture on the Game Timer title that toggles Demo Mode from any header, perfect for iPad use without keyboard."] },
          { title: "Auto-Save", items: ["Continuously snapshots the active session to localStorage so a crash, battery loss, or accidental reload silently restores Setup, Session, or Statistics state right where you left off — including running and paused timers, which keep counting from their stored timestamps.", "On End, also writes a frozen Last Results snapshot that survives Restart so the final stats and timeline are never lost if you forget to Share.", "Adds a compact saved-results chip between the Game Timer title and the Settings button on the Setup header when an end-of-game snapshot exists; tap it to re-open the full Statistics view (Share still works), or dismiss it with the × button."] }
        ]
      },
      {
        version: "1.7.0",
        date: "2026-05-13T12:00:00.000Z",
        title: "Session Polish",
        summary: "This release focuses on table ergonomics during a live game.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Session UI", items: ["Made the Pause and Auto buttons on the active Session screen much larger, scaling dynamically to 25% of the screen height for easier tapping.", "Made the active player's turn and the paused game state much more obvious by adding bigger, bolder borders and glows to the player cards using their pure selected colors."] },
          { title: "Game Library", items: ["Added Ticket to Ride to the game library."] }
        ]
      },
      {
        version: "1.6.0",
        date: "2026-05-13T12:00:00.000Z",
        title: "Developer Tools & Shortcuts",
        summary: "This release introduces new developer utilities and expands the hidden shortcuts system.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Developer Tools Menu", items: ["Added a dedicated \"Developer Tools\" drill-in menu inside Settings.", "Moved testing and debug features into this new section to keep the main settings clean."] },
          { title: "Demo Mode", items: ["Added a Demo Mode toggle inside Developer Tools.", "When enabled, starting a game immediately generates a simulated, completed game session. This allows you to explore the Statistics page, timeline, and share features without having to click through a manual session."] },
          { title: "Shortcut Mode", items: ["Added a Shortcut Mode toggle inside Developer Tools.", "When enabled, visual shortcut hints are permanently shown on supported buttons without needing to hold the Shift + Control + Option chord.", "Added documentation for hidden navigation and testing hotkeys directly inside the Developer Tools menu."] }
        ]
      },
      {
        version: "1.5.0",
        date: "2026-05-08T12:00:00.000Z",
        title: "Final Stats",
        summary: "This release makes the end-game Statistics page a fuller recap: placements, the timeline, awards, and sharing now live together without changing the timer math.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Placements", items: ["Added placement selectors directly inside the final Players table.", "Supports ties and auto-corrects following ranks so skipped places stay accurate.", "Sorts final player rows by placement whenever any placement has been assigned.", "Keeps placement separate from setup, pause, play, turn, and award calculations.", "Shows medal badges for 1st, 2nd, and 3rd beside the timing awards.", "Reserves medal space when placements exist so timing awards line up more consistently."] },
          { title: "Timeline", items: ["Added a lane-based Statistics timeline for setup, each player or other row, and pauses.", "Stores turn start times so future completed sessions can show more accurate timeline segments.", "Uses denser timeline lanes and a 15-minute x-axis with no seconds in the axis labels.", "Suppresses the final interval label when it would crowd the game-end label."] },
          { title: "Sharing", items: ["Added a blue Share button on the Statistics page beside Restart.", "Share now offers Text and Image options.", "Text sharing includes game totals, player rows, placements, timing awards, pause, and other rows.", "Image sharing creates a PNG snapshot of the full Statistics page, with copy and preview fallbacks when native file sharing is unavailable."] },
          { title: "Setup and Shortcuts", items: ["Gave turn-order game tags a consistent warning-accent treatment and simplified game-list turn-order badges to T.", "Added manually verified game badges as green checks and changed faction badges to blue.", "Added gray O badges for games with known default Other timing rows, such as Bidding.", "Added shortcut hint tags while Shift + Control + Option are held.", "Added hidden test shortcuts for Setup, Session, Statistics, Settings, Wishlist, Changelog, search, and full-game simulation."] },
          { title: "Layout Polish", items: ["Tightened KPI cards, Statistics tables, timeline lanes, and Small session layouts.", "Moved placement selection out of the separate grid and into the Players table.", "Gave player names more room in the Statistics time tables on narrower screens.", "Changed Session card density to three height-based modes: Detailed, Insightful, and Essential.", "Completed the wishlist items for final placements, the stats timeline, and the stats share button."] }
        ]
      },
      {
        version: "1.4.0",
        date: "2026-05-08T12:00:00.000Z",
        title: "Smart Setup",
        summary: "This release closes the 1.4 update with smarter setup behavior, clearer game-library signals, and faster keyboard control. The app now understands game-specific turn-order rules, highlights faction-based games, keeps Scythe expansion factions ready to use, and makes common settings available from shortcuts wherever you are.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Settings Shortcuts", items: ["Added Escape to close Settings, Changelog, or Wishlist.", "Added Backspace and browser Back to return from Changelog or Wishlist back to Settings.", "Added keyboard shortcuts for Appearance, Primary Display Name, Text Type, Date Format, and Time Format.", "Changed the Appearance shortcut to A and made preference toggle shortcuts work globally outside the Settings modal.", "Added visible shortcut hints beside each Settings toggle."] },
          { title: "Header Naming", items: ["Renamed the page header classes to setup-bar, session-bar, statistics-bar, and header-bar.", "Explicitly anchored the session header to the same sticky top position used by the other pages."] },
          { title: "Wishlist", items: ["Changed the default Wishlist sort to Priority."] },
          { title: "Turn Order Rules", items: ["Added data-driven turn-order rules for games with faction order, auction order, role-first starts, or shifting order.", "Added rule badges to the game list and searchable rule text.", "Added Turn Order guidance cards on setup for games with special order rules.", "Auto-orders faction games by faction list until the turn order is manually dragged.", "Adds game-specific tracking rows such as Bidding where useful.", "Makes the First button respect game rules before falling back to random selection."] },
          { title: "Game Library", items: ["Expanded Scythe with faction choices from its expansions.", "Added LightBlue and DarkBlue to named colors for faction palettes.", "Added a faction badge to the game list for faction-based games."] }
        ]
      },
      {
        version: "1.3.0",
        date: "2026-05-08T12:00:00.000Z",
        title: "Table Ready",
        summary: "This release closes the 1.3 release with stronger session-table ergonomics, faction-aware setup behavior, faster navigation, and cleaner release planning. The main theme was making the app calmer during live play: every player remains reachable, important identity/timer information stays visible, and setup helpers step out of the way when the table gets crowded.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Faction Setup", items: ["Changed the Add Players color label to Factions when the selected game uses named factions.", "Disabled Quick Add for faction games so each player is added with an explicit faction."] },
          { title: "Setup and Search", items: ["Kept game list rows at a stable height while searching so filtered results do not stretch.", "Turned parenthetical game-title years into inline year tags and made those years searchable.", "Removed the default Ruling row automatically when setup reaches eight real players, while preserving manually re-added Ruling rows."] },
          { title: "Turn Order", items: ["Kept the Turn Order title on one line with Clear and First aligned side by side on the same header row."] },
          { title: "Session Layout", items: ["Made the Pause and Auto bottom bar sticky in every media size.", "Added a no-scroll session grid that keeps every player visible and tappable.", "Showed newest completed turns first in each player list.", "Kept emoji badges visible in every player density mode.", "Added a little breathing room between the player grid and the top/bottom session bars."] },
          { title: "Shortcuts and Planning", items: ["Added keyboard shortcuts: W opens Wishlist, C opens Changelog, and / opens game search on Setup.", "Reworked Wishlist sorting with an emoji direction toggle, ID-first sort defaults, clearer sort labels, and a reset-to-defaults button.", "Cleaned up Settings module navigation controls and Wishlist action buttons.", "Added a future planning item for a color-coded stats timeline visualization."] }
        ]
      },
      {
        version: "1.2.0",
        date: "2026-05-07T12:00:00.000Z",
        title: "Responsive Shell",
        summary: "This release formalized the app's responsive foundation. It introduced named Large, Medium, and Small layouts, moved the navigation toward a shared top-bar system, and made the setup experience practical on both iPad and phone-sized screens.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Media Layouts", items: ["Formalized Large as the default layout, Medium at 1080px, and Small at 720px.", "Added responsive Start page layouts: Large keeps three columns, Medium uses a two-column workflow, and Small uses a single-column flow with game-list hiding.", "Improved phone and iPad layout behavior, including scrollable Settings, Changelog, and Wishlist panels."] },
          { title: "Navigation and Bars", items: ["Moved Settings into the top bar beside the app name/version.", "Made Setup, Session, and Statistics nav bars sticky across layouts.", "Standardized action buttons to 52px height and split the game-list collapse control into its own square button style.", "Refined start/session bar proportions, alignment, gaps, and shared header-bar structure."] },
          { title: "Setup and Session", items: ["Split Add Players into color/name columns on smaller layouts.", "Added compact setup behavior for game selection, turn order, and responsive game-list hiding.", "Updated Session to use the shared header-bar, grouping Game/Setup/Pause/End into the right-side metric area.", "Kept Small Session as a unique stacked layout."] },
          { title: "Testing and Planning", items: ["Set Root as the testing default game on setup and reset.", "Added keyboard shortcuts: 1 for Setup, 2 for Session, 3 for Statistics, and S for Settings.", "Added planning notes for search stability, title-year metadata, iPad height use, Ruling behavior, floating session controls, and Session screen optimization."] }
        ]
      },
      {
        version: "1.1.0",
        date: "2026-05-06T12:00:00.000Z",
        title: "Tabletop Toolkit",
        summary: "This release expanded Game Timer from a basic table timer into a full tabletop session companion. It added the game library, richer player setup, live session awards, final statistics, and the settings/planning modules that make later iteration easier.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Setup", items: ["Added expanded game presets, factions, expansions, shared named colors, custom game palettes, and compact game metadata.", "Added recommended, best, and avoid player counts, complexity weights, time ranges, emoji/text metadata display, and richer searchable game rows.", "Added quick-add name/color defaults, custom names, Other tracking options, Scoring, permanent Rule Lookup, player randomizers, selected-game randomizer, reset, clear, first-player selection, and no-duplicate-color randomization."] },
          { title: "Session", items: ["Added setup time tracking, pause tracking, full-width Pause and Auto controls, one-line current player/faction display, and top status cells for game, setup, pause, and end.", "Added per-player fastest/slowest turn badges plus fastest average, slowest average, fastest overall turn, and slowest overall turn awards."] },
          { title: "Statistics", items: ["Added final stats with game/date formatting, pause stats in Other, aligned full-width Players and Other tables, and stacked statistics layout.", "Added date format options for MDY, DMY, and YMD."] },
          { title: "Settings and Wishlist", items: ["Added markdown-style Changelog and Wishlist full-screen modules.", "Added Settings for light/dark mode, timestamp format, date format, display-name preference, and text/emoji labels.", "Added Wishlist IDs, categories, priorities, LOE estimates, sorting, filtering, and planning items."] },
          { title: "Interface Polish", items: ["Refined the shared top bars, version pill, setup actions, game list sizing, color grids, turn-order rows, session controls, and settings button behavior."] }
        ]
      },
      {
        version: "1.0.0",
        date: "2026-05-05T12:00:00.000Z",
        title: "First Turn",
        summary: "The initial release established the core loop: choose a game, add players, track turns, pause when needed, and review final stats. It was designed first for iPad landscape play, with large touch targets and a dark tabletop-friendly interface.",
        features: [],
        improvements: [],
        fixes: [],
        knownIssues: [],
        sections: [
          { title: "Start Page", items: ["Game List Module (alphabetized) with Search, Pinned Custom, Selected", "Each Game has player count, estimated time, available themed colors", "Add Player Module with color selection and names", "Add Custom Names", "Quick Add option for players with their favorite color", "Add Other generic game dynamics like bidding along with permanent Rule Lookup", "Turn Order Module with \"Who goes First\" randomizer", "Ability to change turn order, name, and color"] },
          { title: "Session Page", items: ["Overall Game stats of game time, play time, pause time.", "Pause and end button", "Individual columns for each player and dynamic with running stats", "Start/Stop works via player tapping and auto advance", "Badges per player for maximum/minimum/average fastest/slowest turn"] },
          { title: "Statistic Page", items: ["Stats per player and dynamic"] },
          { title: "Settings Module", items: ["Light/Dark Mode", "CHANGELOG"] }
        ]
      }
    ],

    roadmap: [
      { id: "road-w001", title: "Game type tags and tag search", description: "Tag games by type, mechanics, and table mood (strategy, party, negotiation, drafting) and let library search match tags.", state: "planned", priority: 2, target: "2.1", effort: 3, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-w003", title: "Game mechanisms", description: "Track mechanisms such as deck-building, worker placement, auctions, and area control for filtering and setup logic.", state: "planned", priority: 2, target: "2.1", effort: 2, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-w004", title: "Game categories", description: "Track categories such as economic, party, racing, fantasy, and civilization so randomization can pick by table mood.", state: "planned", priority: 2, target: "2.1", effort: 2, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-w012", title: "Tune iPhone and iPad portrait layouts", description: "Keep refining small-screen and portrait tablet layouts, especially the Statistics timeline and tables.", state: "planned", priority: 1, target: "2.1", effort: 3, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-w013", title: "Playful share options", description: "Share variants that celebrate the winner or call out the slowest player, with friendly, dramatic, or spicy tones.", state: "wishlist", priority: 2, target: "Unscheduled", effort: 2, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-w011", title: "Native app wrapper", description: "Evaluate packaging Game Timer as a native app while preserving the tabletop-first layout and offline behavior.", state: "wishlist", priority: 3, target: "Unscheduled", effort: 4, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-sync", title: "GitHub Sync", description: "Library, history, and people follow you between devices through the shell’s GitHub Sync.", state: "released", priority: 2, target: "2.1", effort: 2, createdAt: "2026-10-17T12:00:00.000Z" },
      { id: "road-w016", title: "2.0 source split and release", description: "Split games, help, release notes, and roadmap into separate files and deploy with GitHub Pages.", state: "released", priority: 1, target: "2.0", effort: 4, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-w014", title: "Align placements with many badges", description: "Placement and timing badges stay aligned when a player has three or more awards.", state: "released", priority: 3, target: "2.0", effort: 1, createdAt: "2026-05-01T12:00:00.000Z" },
      { id: "road-library", title: "Game Library and History", description: "Ownership, owners, wishlist, play counts, saved results, and per-person records.", state: "released", priority: 1, target: "2.0", effort: 4, createdAt: "2026-10-17T12:00:00.000Z" }
    ],

    help: [
      { id: "start", title: "Quick start", section: "Basics", keywords: "start begin setup players colors factions turn order start session end statistics", html: "<ol><li>Open <strong>Play</strong> and choose a game.</li><li>Add players from People, or type a custom name.</li><li>Pick colors or factions, then drag to set turn order. Use <strong>First</strong> to pick a starting player.</li><li>Press <strong>Start</strong>. Tap a player when their turn begins; tap another player or use <strong>Auto</strong> to move on.</li><li>Press <strong>End</strong> when the game is over, then assign placements and share the results.</li></ol>" },
      { id: "setup", title: "Setup", section: "Play", keywords: "game list search tags turn order faction other rows ruling bidding trading banking scoring random reset first owned fits", html: "<p>Search the game list or filter it to games you own or that fit the current table. Tags mark special rules: <strong>T</strong> turn-order rule, <strong>F</strong> factions, <strong>O</strong> default Other timing, and <strong>✓</strong> verified colors.</p><p><strong>Other</strong> rows time non-player activity such as Ruling, Bidding, Trading, Banking, or Scoring. They appear in Session and Statistics but receive no placements. Ruling is added automatically for smaller groups.</p><p><strong>Random</strong> picks a game and players; the panel’s own Random button keeps the selected game. <strong>First</strong> applies the game’s first-player rule or rolls for one.</p>" },
      { id: "session", title: "Running a session", section: "Play", keywords: "turn tap pause resume auto advance end awake chime vibrate warning long turn", html: "<p>Tap a player to start their turn; tapping the active player pauses or resumes. <strong>Pause</strong> tracks breaks and rules lookups separately from play time. <strong>Auto</strong> ends the current turn and starts the next player in order. <strong>End</strong> stops the session and opens Statistics.</p><p>While a session runs the screen stays awake when <em>Keep screen awake</em> is on. Turn chimes, vibration, and the long-turn warning are set in Settings → Game Timer.</p>" },
      { id: "stats", title: "Statistics, placements, and awards", section: "Play", keywords: "statistics placements ties medals awards fastest slowest average timeline share text image", html: "<p>Statistics shows game, setup, play, and pause time, turn counts, a timeline, and per-player totals. Assign placements in the Players table; ties are supported and later ranks adjust automatically (1st, 1st, 3rd).</p><p>Awards mark the fastest and slowest average and the fastest and slowest single turn. <strong>Share</strong> offers a text summary or an image of the statistics.</p>" },
      { id: "library", title: "Game Library", section: "Library", keywords: "library own owned owners wishlist available best player count sort filter plays wins custom add game", html: "<p>The Library lists every game with ownership and play statistics from your history. Mark games you own, choose who owns them, or add them to your wishlist.</p><p>Select who is at the table to see which games are available (owned by someone present) and sort by <strong>Best fit</strong> for that player count. You can also sort by plays, last played, length, or weight, and add your own games.</p>" },
      { id: "history", title: "Game History", section: "Library", keywords: "history saved results reopen delete placements share", html: "<p>Every finished game is saved to History automatically. Open an entry to review its statistics, correct placements, or share it again. Deleting an entry removes it from library and people statistics. Demo games are not saved.</p>" },
      { id: "people", title: "People and records", section: "Library", keywords: "people players names colors wins win rate average turn record", html: "<p>People are the names offered in Setup and as game owners. Each person shows games played, wins, win rate, and average turn from saved history. Rename, recolor, add, or remove people from the Library’s People tab.</p>" },
      { id: "settings", title: "Game Timer settings", section: "Settings", keywords: "time format clock units date format display name faction emoji labels demo mode awake chime vibrate warning", html: "<p>Settings → Game Timer controls clock or unit time format, date format, whether player or faction names lead, text or emoji labels, keep-awake, turn chime, vibration, and the long-turn warning. <strong>Demo Mode</strong> jumps a started game straight to a simulated finish for trying out Statistics.</p>" },
      { id: "notes", title: "Notes", section: "Settings", keywords: "notes text edit modal autosave house rules", html: "<p>Open Notes from the top bar or press <kbd>N</kbd>. The single plain-text editor saves locally and is included in backups — handy for house rules and scores.</p>" },
      { id: "backup", title: "Backup and restore", section: "Data", keywords: "json export import backup restore recovery history library", html: "<p>Export a JSON backup from Settings. It includes your library, history, people, notes, and preferences. Imports are validated and confirmed before replacing data, and the current copy is kept as a recovery snapshot.</p>" },
      { id: "sync", title: "Sync between devices", section: "Data", keywords: "sync github cloud token devices phone tablet auto conflict merge app-data", html: "<p>Settings → Data Sync keeps your library, game history, people, and Notes in one JSON file in the <code>app-data</code> GitHub repository. Create a fine-grained token with <strong>Contents: Read and write</strong> for that repository only, paste it, then Test and Save. The first <strong>Sync Now</strong> creates the file. Turn on Auto Sync to upload and download changes while the app is open; conflicting edits always ask which copy to keep. Repeat the token setup on each device.</p><p>Appearance, Game Timer settings, filters, and a running session stay on each device.</p>" },
      { id: "privacy", title: "Privacy and saving", section: "Data", keywords: "privacy local storage autosave session resume reload", html: "<p>Everything stays in this browser’s storage unless you turn on GitHub Sync. Tokens are stored separately and never included in backups or synced data. The running session saves every few seconds and when the app is hidden, so a reload or crash resumes where you left off.</p>" },
      { id: "install", title: "Install and update", section: "Installation", keywords: "install add home screen iphone ipad android mac windows pwa offline update refresh", html: "<p>Use your browser’s Install app, Add to Home Screen, or Add to Dock command. The installed app works offline. <strong>Update</strong> in the top bar saves, checks for a new version, and refreshes.</p>" },
      { id: "app-icon", title: "App icon controls", section: "Appearance", keywords: "icon theme dark light developer mode hold press", html: "<p>Click or tap the app icon, or press <kbd>T</kbd>, to switch between light and dark themes. Press and hold the icon, or press <kbd>|</kbd> or <kbd>D</kbd>, to toggle Developer Mode.</p>" },
      { id: "shortcuts", title: "Keyboard access", section: "Accessibility", keywords: "keyboard shortcuts slash escape hints play library history", html: "<p>Press <kbd>1</kbd>, <kbd>2</kbd>, or <kbd>3</kbd> for Play, Library, and History, <kbd>/</kbd> to search, <kbd>,</kbd> for Settings, and <kbd>H</kbd> for Help. Hold Shift–Control–Option to reveal shortcut badges on visible controls such as Start, Pause, Auto, and End. The full list is in Settings → Shortcuts.</p>" },
      { id: "faq-ties", title: "Can two players tie?", section: "FAQ", keywords: "tie ties same placement", html: "<p>Yes. Assign the same placement to several players and later ranks skip correctly.</p>" },
      { id: "faq-pause", title: "Why is there a Pause row in Other stats?", section: "FAQ", keywords: "pause row other", html: "<p>Pause time is summarized as an Other row so it can be reviewed alongside other tracked non-player activity.</p>" },
      { id: "faq-factions", title: "Why do some games show factions?", section: "FAQ", keywords: "factions colors", html: "<p>Games with named factions replace the color picker with a faction picker so each player’s identity matches the game. Settings can make faction names lead.</p>" },
      { id: "faq-edit-games", title: "Can I edit the game list?", section: "FAQ", keywords: "edit games add custom data file", html: "<p>Add your own games from the Library. Built-in games and their colors live in <code>assets/js/data/games.js</code> in the repository.</p>" }
    ]
  };

  window.LocalApp.config = Object.freeze(CONFIG);
})();
