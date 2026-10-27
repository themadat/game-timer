/* Game library data: presets, colors, and default people. Edit games here. */
(function () {
  "use strict";

  window.LocalApp = window.LocalApp || {};

  function colorDef(name, namedColor = name, customValue = null) {
    return {
      name: name === "Green" && namedColor === "Green" && !customValue ? "Pine" : name,
      namedColor,
      customValue,
      get value() {
        return this.customValue || NAMED_COLORS[this.namedColor] || this.namedColor;
      }
    };
  }

  /* cspell:disable */
  const PRESET_NAMES = ["Adam", "Austin", "Bryson", "Johanna", "Tristen", "Kathleen", "Jake", "Kacie"];
  const QUICK_PLAYERS = [
    { name: "Adam", color: "Red" },
    { name: "Austin", color: "Aqua" },
    { name: "Bryson", color: "Orange" },
    { name: "Johanna", color: "Yellow" },
    { name: "Tristen", color: "Green" },
    { name: "Kathleen", color: "Pink" },
    { name: "Jake", color: "Navy" },
    { name: "Kacie", color: "Purple" }
  ];
  const OTHER_NAMES = ["Ruling", "Bidding", "Trading", "Banking", "Scoring"];
  const NAMED_COLORS = {
    Red: "#ef4444",
    Orange: "#f97316",
    Brown: "#7c4a2d",
    Tan: "#d2b48c",
    Yellow: "#facc15",
    Gold: "#d4a017",
    Lime: "#a3e635",
    Pine: "#15803d",
    Green: "#15803d",
    Teal: "#14b8a6",
    Aqua: "#38bdf8",
    Blue: "#3b82f6",
    LightBlue: "#7dd3fc",
    DarkBlue: "#1e3a8a",
    Navy: "#1d4ed8",
    Purple: "#8b5cf6",
    Pink: "#ec4899",
    White: "#f8fafc",
    Silver: "#c0c7d1",
    Slate: "#475569",
    Gray: "#475569",
    Black: "#111827"
  };
  const STANDARD_COLORS = [
    colorDef("Red"),
    colorDef("Orange"),
    colorDef("Yellow"),
    colorDef("Gold"),
    colorDef("Lime"),
    colorDef("Pine"),
    colorDef("Aqua"),
    colorDef("Navy"),
    colorDef("Purple"),
    colorDef("Pink"),
    colorDef("Brown"),
    colorDef("Tan"),
    colorDef("White"),
    colorDef("Silver"),
    colorDef("Slate"),
    colorDef("Black")
  ];
  const OTHER_COLORS = STANDARD_COLORS.filter(color => ["White", "Silver", "Slate", "Black"].includes(color.name));
  const GAME_PRESETS = [
    {
        id: "custom",
        name: "Custom Game",
        minPlayers: 1,
        maxPlayers: 16,
        minMinutes: 1,
        maxMinutes: 240,
        complexityWeight: null,
        recommendedPlayers: "1-16",
        bestPlayers: "1-16",
        avoidPlayers: "--",
        colors: []
    },
    {
        id: "catan",
        name: "Catan",
        minPlayers: 3,
        maxPlayers: 6,
        minMinutes: 60,
        maxMinutes: 120,
        complexityWeight: 2.3,
        recommendedPlayers: "3-4",
        bestPlayers: "4",
        avoidPlayers: "--",
        colors: [
            colorDef("Red", "Red", "#EA3637"),
            colorDef("White", "White", "#FFFFFF"),
            colorDef("Orange", "Orange", "#F48A3B"),
            colorDef("Blue", "Blue", "#1493D9"),
            colorDef("Green", "Green", "#169549"),
            colorDef("Brown", "Brown", "#5B3019")
        ],
        verified: true
    },
    {
        id: "dune-2019",
        name: "Dune (2019)",
        minPlayers: 2,
        maxPlayers: 6,
        minMinutes: 120,
        maxMinutes: 180,
        complexityWeight: 4.0,
        recommendedPlayers: "5-6",
        bestPlayers: "6",
        avoidPlayers: "2-4",
        turnOrder: {
            icon: "↕",
            label: "Faction order",
            note: "Auto-orders selected factions by faction list until you drag the order.",
            firstMode: "faction-order",
            autoSortFactions: true,
            defaultOthers: ["Bidding"]
        },
        colors: [
            colorDef("House Atreides", "Green", "#526336"),
            colorDef("House Harkonnen", "Black", "#161616"),
            colorDef("Emperor (House)", "Red", "#702625"),
            colorDef("Fremen", "Yellow", "#B68942"),
            colorDef("Bene Gesserit", "Navy", "#27385A"),
            colorDef("Spacing Guild", "Orange", "#A45536"),
            colorDef("Ixians", "Tan", "#777776"),
            colorDef("Tleilaxu", "Purple", "#2A1A3A"),
            colorDef("CHOAM", "Pink", "#A63230"),
            colorDef("House Richese", "Gray", "#CBC7BA"),
            colorDef("House Ecaz", "Purple", "#7A3A78"),
            colorDef("House Moritani", "Aqua", "#568BA1")
        ], verified: true
    },
    {
        id: "dune-imperium-uprising",
        name: "Dune: Imperium — Uprising (2023)",
        minPlayers: 1,
        maxPlayers: 4,
        minMinutes: null,
        maxMinutes: null,
        complexityWeight: null,
        recommendedPlayers: "--",
        bestPlayers: "--",
        avoidPlayers: "--",
        factions: false,
        colors: [
            colorDef("Red", "Red", "#a63846"),
            colorDef("Blue", "Blue", "#414a9c"),
            colorDef("Green", "Green", "#398970"),
            colorDef("Yellow", "Yellow", "#dbbd49")
        ],
        verified: true,
        turnOrder: {
            icon: "↻",
            label: "Objective-card first player · clockwise",
            firstMode: "manual",
            sequence: "clockwise",
            note: "Deal player-count-appropriate Objective cards randomly; the card with the First Player marker determines the starter. Agent and Reveal turns proceed clockwise; skip players after their Reveal turn. Combat Intrigue also proceeds clockwise from the marker, only among players with units in the Conflict; stop after all pass consecutively. At Recall, pass the marker clockwise for the next round. Choose leaders separately from colors; Emperor, Spacing Guild, Bene Gesserit and Fremen are influence tracks, not player factions. Exclude Shaddam Corrino IV without CHOAM. Solo/two-player Rivals and six-player team rules need separate supplements. End after Recall at 10+ VP or an empty Conflict deck; resolve Endgame Intrigue, then rank by VP, spice, Solari, water and garrisoned troops.",
            defaultOthers: ["Combat", "Makers", "Recall", "Scoring"]
        }
    },
    {
        id: "foundations-of-rome",
        name: "Foundations of Rome",
        minPlayers: 1,
        maxPlayers: 5,
        minMinutes: 60,
        maxMinutes: 90,
        complexityWeight: 2.0,
        recommendedPlayers: "2-5",
        bestPlayers: "4",
        avoidPlayers: "1",
        colors: [
            colorDef("Red"),
            colorDef("Aqua"),
            colorDef("Green"),
            colorDef("Purple"),
            colorDef("Yellow")
        ], verified: true
    },
    {
        id: "cyclades-legendary-edition",
        name: "Cyclades: Legendary Edition",
        minPlayers: 2,
        maxPlayers: 6,
        minMinutes: 60,
        maxMinutes: 90,
        complexityWeight: 2.9,
        recommendedPlayers: "3-6",
        bestPlayers: "4-5",
        avoidPlayers: "2",
        turnOrder: {
            icon: "⚖",
            label: "Bid order",
            note: "Full Turn order is random to start; Future Turns determined by God Resolution. Bidding/Auctions has turn order changes.",
            firstMode: "random-all",
            defaultOthers: ["Mechanics"]
        },
        colors: [
            colorDef("Red"),
            colorDef("Yellow"),
            colorDef("Green"),
            colorDef("Blue"),
            colorDef("Purple"),
            colorDef("Black"),
        ], verified: true
    },
    {
        id: "dungeon-kart",
        name: "Dungeon Kart",
        minPlayers: 2,
        maxPlayers: 8,
        minMinutes: 30,
        maxMinutes: 60,
        complexityWeight: 1.7,
        recommendedPlayers: "2-8",
        bestPlayers: "4-6",
        avoidPlayers: "--",
        colors: [
            colorDef("Belladonna", "Pink", "#BDA4C0"),
            colorDef("Gorgona", "Tan", "#C3A04C"),
            colorDef("King Croak", "Red", "#BF2335"),
            colorDef("Porkus", "Green", "#5CAD4A"),
            colorDef("Killa", "Orange", "#E37432"),
            colorDef("Umbra", "Black", "#AB85AD"),
            colorDef("Ravenus", "Brown", "#69794B"),
            colorDef("Explodo", "Gray", "#6B7486"),
            colorDef("Klonos", "Teal", "#359D78"),
            colorDef("Cleopatra", "Aqua", "#ACD8E4")
        ], verified: true
    },
    {
        id: "small-world",
        name: "Small World",
        minPlayers: 2,
        maxPlayers: 5,
        minMinutes: 40,
        maxMinutes: 80,
        complexityWeight: 2.4,
        recommendedPlayers: "2-5",
        bestPlayers: "4",
        avoidPlayers: "--",
        colors: [],
        verified: true
    },
    {
        id: "scythe",
        name: "Scythe",
        minPlayers: 1,
        maxPlayers: 7,
        minMinutes: 115,
        maxMinutes: 115,
        complexityWeight: 3.5,
        recommendedPlayers: "1-7",
        bestPlayers: "4",
        avoidPlayers: "--",
        turnOrder: {
            icon: "⚑",
            label: "Lowest mat starts",
            note: "Put the lowest-numbered player mat first, then keep clockwise order.",
            firstMode: "current-order"
        },
        colors: [
            colorDef("Republic of Polania", "White", "#FFFFFE"),
            colorDef("Saxony Empire", "Black", "#151514"),
            colorDef("Crimean Khanate", "Yellow", "#C47E31"),
            colorDef("Nordic Kingdoms", "DarkBlue", "#268ABC"),
            colorDef("Rusviet Union", "Red", "#942024"),
            colorDef("Clan Albion", "Green", "#5B7037"),
            colorDef("Togawa Shogunate", "Purple", "#612161"),
            colorDef("Vesna", "LightBlue", "#5DA3B6"),
            colorDef("Fenris", "Orange", "#E0732E")
        ], verified: true
    },
    {
        id: "lost-ruins-of-arnak",
        name: "Lost Ruins of Arnak",
        minPlayers: 1,
        maxPlayers: 4,
        minMinutes: 30,
        maxMinutes: 120,
        complexityWeight: 2.9,
        recommendedPlayers: "1-4",
        bestPlayers: "3",
        avoidPlayers: "--",
        colors: [
            colorDef("Red"),
            colorDef("Yellow"),
            colorDef("Green"),
            colorDef("Blue")
        ], verified: true
    },
    {
        id: "dominion",
        name: "Dominion",
        minPlayers: 2,
        maxPlayers: 4,
        minMinutes: 30,
        maxMinutes: 30,
        complexityWeight: 2.4,
        recommendedPlayers: "2-4",
        bestPlayers: "3",
        avoidPlayers: "--",
        colors: [],
        verified: true
    },
    {
        id: "here-to-slay",
        name: "Here to Slay",
        minPlayers: 2,
        maxPlayers: 6,
        minMinutes: 30,
        maxMinutes: 60,
        complexityWeight: 1.7,
        recommendedPlayers: "2-6",
        bestPlayers: "3-4",
        avoidPlayers: "--",
        colors: [
            colorDef("Fighter", "Red", "#772328"),
            colorDef("Guardian", "Yellow", "#DA9931"),
            colorDef("Ranger", "Green", "#224A31"),
            colorDef("Thief", "Navy", "#1D3A66"),
            colorDef("Wizard", "Purple", "#5A2569"),
            colorDef("Bard", "Brown", "#A7442F"),
            colorDef("Warrior", "Blue", "#A7442F"),
            colorDef("Druid", "Teal", "#1C977A"),
            colorDef("Berserker", "Orange", "#DB7831"),
            colorDef("Necromancer", "Pink", "#CC0F5C"),
        ], verified: true
    },
    {
        id: "middle-ages",
        name: "Middle Ages",
        minPlayers: 2,
        maxPlayers: 5,
        minMinutes: 30,
        maxMinutes: 30,
        complexityWeight: 2.0,
        recommendedPlayers: "2-5",
        bestPlayers: "3-4",
        avoidPlayers: "--",
        colors: [
            colorDef("Pink"),
            colorDef("Brown"),
            colorDef("Yellow"),
            colorDef("Green"),
            colorDef("Blue")
        ], verified: true
    },
    {
        id: "splendor",
        name: "Splendor",
        minPlayers: 2,
        maxPlayers: 4,
        minMinutes: 30,
        maxMinutes: 30,
        complexityWeight: 1.8,
        recommendedPlayers: "2-4",
        bestPlayers: "3",
        avoidPlayers: "--",
        colors: [],
        verified: true
    },
    {
        id: "risk-europe",
        name: "Risk: Europe",
        minPlayers: 2,
        maxPlayers: 4,
        minMinutes: 45,
        maxMinutes: 180,
        complexityWeight: 2.7,
        recommendedPlayers: "2-4",
        bestPlayers: "4",
        avoidPlayers: "--",
        colors: [
            colorDef("Red", "#DE614F"),
            colorDef("Green", "#7ABB66"),
            colorDef("Purple", "#604180"),
            colorDef("Blue", "#4F95C3")
        ], verified: true
    },
    {
        id: "fire-tower",
        name: "Fire Tower",
        minPlayers: 2,
        maxPlayers: 4,
        minMinutes: 15,
        maxMinutes: 30,
        complexityWeight: 1.8,
        recommendedPlayers: "2-4",
        bestPlayers: "4",
        avoidPlayers: "--",
        colors: [],
        verified: true
    },
    {
        id: "farms-race",
        name: "Farms Race",
        minPlayers: 2,
        maxPlayers: 4,
        minMinutes: 60,
        maxMinutes: 120,
        complexityWeight: 2.3,
        recommendedPlayers: "3-4",
        bestPlayers: "3-4",
        avoidPlayers: "2",
        colors: [
            colorDef("Sheep", "White", "#FFFFFF"),
            colorDef("Pigs", "Pink", "#DD8281"),
            colorDef("Chickens", "Green", "#57945C"),
            colorDef("Cows", "Yellow", "#DDAC35")
        ], verified: true
    },
    {
        id: "terminus",
        name: "Terminus",
        minPlayers: 2,
        maxPlayers: 5,
        minMinutes: 90,
        maxMinutes: 180,
        complexityWeight: 3.5,
        recommendedPlayers: "2-5",
        bestPlayers: "3-4",
        avoidPlayers: "--",
        colors: [
            colorDef("Red"),
            colorDef("Orange"),
            colorDef("Yellow"),
            colorDef("Purple"),
            colorDef("Pink")
        ], verified: true
    },
    {
        id: "power-grid",
        name: "Power Grid",
        minPlayers: 2,
        maxPlayers: 6,
        minMinutes: 120,
        maxMinutes: 120,
        complexityWeight: 3.3,
        recommendedPlayers: "3-6",
        bestPlayers: "4-5",
        avoidPlayers: "2",
        turnOrder: {
            icon: "⚡",
            label: "Auction order",
            note: "Adds Bidding. Update turn order after the game recalculates player order.",
            firstMode: "current-order",
            defaultOthers: ["Bidding"]
        },
        colors: [
            colorDef("Red"),
            colorDef("Yellow"),
            colorDef("Green"),
            colorDef("Blue"),
            colorDef("Purple"),
            colorDef("Black")
        ], verified: true
    },
    {
        id: "root",
        name: "Root",
        minPlayers: 2,
        maxPlayers: 6,
        minMinutes: 60,
        maxMinutes: 90,
        complexityWeight: 3.8,
        recommendedPlayers: "3-4",
        bestPlayers: "4",
        avoidPlayers: "2, 5-6",
        turnOrder: {
            icon: "↕",
            label: "Faction order",
            note: "Auto-orders selected factions by faction list until you drag the order.",
            firstMode: "faction-order",
            autoSortFactions: true
        },
        colors: [
            colorDef("Marquise de Cat", "Orange", "#CB6736"),
            colorDef("Eyrie Dynasties", "Blue", "#3A61A5"),
            colorDef("Woodland Alliance", "Green", "#60AF4F"),
            colorDef("Vagabond", "Silver", "#626365"),
            colorDef("Riverfolk Company", "Aqua", "#54BCB5"),
            colorDef("Lizard Cult", "Yellow", "#FBF064"),
            colorDef("Underground Duchy", "Pink", "#EBBDA2"),
            colorDef("Corvid Conspiracy", "Purple", "#865099"),
            colorDef("Lord of the Hundreds", "Red", "#DA1136"),
            colorDef("Keepers in Iron", "Gray", "#808285"),
            colorDef("Lilypad Diaspora", "Tan", "#A38F33"),
            colorDef("Twilight Council", "Brown", "#88412A"),
            colorDef("Knaves of the Deepwood", "Black", "#302927")
        ], verified: true
    },
    {
        id: "lord-of-the-rings-risk",
        name: "Lord of the Rings Risk",
        minPlayers: 2,
        maxPlayers: 4,
        minMinutes: 120,
        maxMinutes: 180,
        complexityWeight: 2.4,
        recommendedPlayers: "2-4",
        bestPlayers: "4",
        avoidPlayers: "--",
        colors: [
            colorDef("Red"),
            colorDef("Black"),
            colorDef("Green"),
            colorDef("Yellow")
        ], verified: true
    },
    {
        id: "puerto-rico",
        name: "Puerto Rico",
        minPlayers: 2,
        maxPlayers: 5,
        minMinutes: 90,
        maxMinutes: 120,
        complexityWeight: 3.3,
        recommendedPlayers: "2-5",
        bestPlayers: "4",
        avoidPlayers: "--",
        turnOrder: {
            icon: "⚑",
            label: "Governor starts",
            note: "Put the Governor first; role selection rotates from that player.",
            firstMode: "current-order"
        },
        colors: [],
        verified: true
    },
    {
        id: "brass-birmingham",
        name: "Brass Birmingham",
        minPlayers: 2,
        maxPlayers: 4,
        minMinutes: 60,
        maxMinutes: 120,
        complexityWeight: 3.9,
        recommendedPlayers: "2-4",
        bestPlayers: "3-4",
        avoidPlayers: "--",
        turnOrder: {
            icon: "£",
            label: "Spending order",
            note: "Turn order changes by previous-round spend; drag the list between rounds.",
            firstMode: "current-order"
        },
        colors: [
            colorDef("Red", "#9A3B26"),
            colorDef("Yellow", "#C39E44"),
            colorDef("Gray", "#8E94A9"),
            colorDef("Purple", "#84649E")
        ], verified: true
    },
    {
        id: "7-wonders",
        name: "7 Wonders",
        minPlayers: 2,
        maxPlayers: 7,
        minMinutes: 30,
        maxMinutes: 30,
        complexityWeight: 2.3,
        recommendedPlayers: "3-7",
        bestPlayers: "4-5",
        avoidPlayers: "2",
        openColorPool: true,
        colors: [],
        verified: true
    },
    {
        id: "bang",
        name: "Bang",
        minPlayers: 4,
        maxPlayers: 7,
        minMinutes: 20,
        maxMinutes: 40,
        complexityWeight: 1.6,
        recommendedPlayers: "5-7",
        bestPlayers: "7",
        avoidPlayers: "4",
        turnOrder: {
            icon: "⭐",
            label: "Sheriff starts",
            note: "Put the Sheriff first, then arrange the rest clockwise.",
            firstMode: "current-order"
        },
        openColorPool: true,
        colors: [],
        verified: true
    },
    {
        id: "carcassonne",
        name: "Carcassonne",
        minPlayers: 2,
        maxPlayers: 6,
        minMinutes: 30,
        maxMinutes: 45,
        complexityWeight: 1.9,
        recommendedPlayers: "2-5",
        bestPlayers: "2",
        avoidPlayers: "--",
        colors: [
            colorDef("Red", "#C6101C"),
            colorDef("Yellow", "#DABC29"),
            colorDef("Green", "#13833D"),
            colorDef("Blue", "#095898"),
            colorDef("Black", "#323133"),
            colorDef("Pink", "#D27A9F")
        ], verified: true
    },
    {
        id: "ticket-to-ride",
        name: "Ticket to Ride",
        minPlayers: 2,
        maxPlayers: 5,
        minMinutes: 30,
        maxMinutes: 60,
        complexityWeight: 1.8,
        recommendedPlayers: "2-5",
        bestPlayers: "4",
        avoidPlayers: "--",
        colors: [
            colorDef("Red"),
            colorDef("Blue"),
            colorDef("Green"),
            colorDef("Yellow"),
            colorDef("Black")
        ], verified: true
    }
  ];
  /* cspell:enable */

  window.LocalApp.gameData = Object.freeze({
    colorDef,
    PRESET_NAMES,
    QUICK_PLAYERS,
    OTHER_NAMES,
    NAMED_COLORS,
    STANDARD_COLORS,
    OTHER_COLORS,
    GAME_PRESETS
  });
})();
