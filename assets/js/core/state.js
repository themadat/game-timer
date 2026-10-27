(function () {
  "use strict";

  const App = window.LocalApp;
  const config = App.config;
  const u = App.utils;
  const SYNC_FORMAT = "local-first-app-data";
  const SYNC_VERSION = 1;
  // Older apps reject v5 instead of mistaking this compact envelope for empty v4 state.
  const SYNC_SCHEMA_VERSION = 5;
  const CLOUD_TARGET = Object.freeze({
    owner: u.cleanLine(config.cloudSync?.owner, 39),
    repo: u.cleanLine(config.cloudSync?.repo, 100).replace(/\.git$/i, ""),
    branch: u.cleanLine(config.cloudSync?.branch || "main", 250) || "main",
    path: u.cleanLine(config.cloudSync?.path || "data/game-timer.json", 500).replace(/^\/+/, "") || "data/game-timer.json"
  });
  const STATUS_IDS = new Set(config.statuses.map(function (status) { return status.id; }));
  const MODULE_IDS = ["roadmap"];
  const VIEW_IDS = ["play", "library", "history"];
  const LIBRARY_TABS = ["games", "people"];
  const LIBRARY_OWNERSHIP = ["all", "owned", "available", "unowned", "wishlist", "played", "unplayed"];
  const ADDITIONAL_GAME_TYPES = ["Abstract", "Customizable", "Thematic", "Family", "Children's", "Party", "Strategy", "Wargames"];
  const LIBRARY_SORTS = ["fit", "name", "plays", "recent", "length", "weight", "wins", "year", "rating", "bggRating", "minPlayers", "maxPlayers", "bestPlayers", "recommendedPlayers", "avoidPlayers", "minMinutes", "maxMinutes", "mainType", "mechanisms", "note", "bggId", "turnStart", "factions", "verified", "colors", "owners"];
  const gameData = App.gameData || { QUICK_PLAYERS: [], NAMED_COLORS: {}, GAME_PRESETS: [] };

  function demoRecords(now) {
    return [];
  }

  function defaultPeople() {
    return (gameData.QUICK_PLAYERS || []).map(function (player) {
      return { id: "person-" + player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: player.name, color: gameData.NAMED_COLORS[player.color] || "#94a3b8" };
    });
  }

  function defaultGamePreferences() {
    return {
      timeFormat: "clock",
      dateFormat: "mdy",
      displayNameMode: "player",
      textType: "text",
      demoMode: false,
      keepAwake: true,
      chime: false,
      haptics: true,
      longTurnSeconds: 0
    };
  }

  function cleanNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function cleanTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 && number < 8.64e15 ? Math.round(number) : null;
  }

  function cleanId(value, prefix) {
    const id = u.cleanLine(value, 100).replace(/[^a-z0-9_-]/gi, "-");
    return id || u.uid(prefix);
  }

  function normalizePeople(value) {
    const seen = new Set();
    const ids = new Set();
    return (Array.isArray(value) ? value : []).map(function (item) {
      const source = u.plainObject(item);
      const name = u.cleanLine(source.name, 60);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return null;
      seen.add(key);
      let id = cleanId(source.id, "person");
      if (ids.has(id)) id = u.uid("person");
      ids.add(id);
      return { id: id, name: name, color: u.normalizeColor(source.color, "#94a3b8") };
    }).filter(Boolean).slice(0, config.controls.maxPeople);
  }

  function normalizePlayerCountText(value, fallback) {
    const text = u.cleanLine(value, 40).replace(/[^0-9,\-\s+]/g, "").trim();
    return text || fallback;
  }

  function normalizeCustomGames(value) {
    const ids = new Set(gameData.GAME_PRESETS.map(function (game) { return game.id; }));
    return (Array.isArray(value) ? value : []).map(function (item) {
      const source = u.plainObject(item);
      const name = u.cleanLine(source.name, 100);
      if (!name) return null;
      let id = cleanId(source.id, "custom-game");
      if (!id.startsWith("custom-")) id = "custom-" + id;
      if (ids.has(id)) id = u.uid("custom-game");
      ids.add(id);
      const optionalNumber = (key, max) => source[key] !== null && source[key] !== "" && Number.isFinite(Number(source[key])) && Number(source[key]) >= 1 && Number(source[key]) <= max ? Math.round(Number(source[key])) : null;
      const minPlayers = optionalNumber("minPlayers",20);
      const maxPlayers = optionalNumber("maxPlayers",20);
      const minMinutes = optionalNumber("minMinutes",1440);
      const maxMinutes = optionalNumber("maxMinutes",1440);
      const weight = Number(source.complexityWeight);
      return {
        id: id,
        name: name,
        minPlayers: minPlayers,
        maxPlayers: maxPlayers,
        minMinutes: minMinutes,
        maxMinutes: maxMinutes,
        complexityWeight: Number.isFinite(weight) && weight >= 1 && weight <= 5 ? Math.round(weight * 100) / 100 : null,
        recommendedPlayers: normalizePlayerCountText(source.recommendedPlayers, "--"),
        bestPlayers: normalizePlayerCountText(source.bestPlayers, "--"),
        avoidPlayers: normalizePlayerCountText(source.avoidPlayers, "--"),
        createdAt: u.ensureIso(source.createdAt)
      };
    }).filter(Boolean).slice(0, config.controls.maxCustomGames);
  }

  function normalizeCatalogOverrides(value) {
    const source = u.plainObject(value);
    const catalog = {};
    const name = u.cleanLine(source.name, 100);
    if (name) catalog.name = name;
    [["minPlayers", 1, 20], ["maxPlayers", 1, 20], ["minMinutes", 1, 1440], ["maxMinutes", 1, 1440], ["complexityWeight", 1, 5]].forEach(function ([key, min, max]) {
      const value = Number(source[key]);
      if (Number.isFinite(value) && value >= min && value <= max) catalog[key] = key === "complexityWeight" ? Math.round(value * 100) / 100 : Math.round(value);
    });
    [["minPlayers", "maxPlayers"], ["minMinutes", "maxMinutes"]].forEach(function ([min, max]) {
      if (catalog[min] !== undefined && catalog[max] !== undefined) catalog[max] = Math.max(catalog[min], catalog[max]);
    });
    ["bestPlayers", "recommendedPlayers", "avoidPlayers"].forEach(function (key) {
      if (typeof source[key] === "string") catalog[key] = normalizePlayerCountText(source[key], "--");
    });
    return catalog;
  }

  function normalizeGameSetup(value) {
    const source = u.plainObject(value);
    const setup = {};
    if (typeof source.openColorPool === "boolean") setup.openColorPool = source.openColorPool;
    ["colors", "palette"].forEach(key => {
      if (!Array.isArray(source[key])) return;
      setup[key] = source[key].slice(0, 64).map(item => {
        const color = u.plainObject(item);
        return { name: u.cleanLine(color.name, 60), value: /^#[0-9a-f]{6}$/i.test(color.value) ? color.value.toLowerCase() : "" };
      }).filter((color, index, colors) => color.name && color.value && colors.findIndex(other => other.name.toLowerCase() === color.name.toLowerCase() && (key === "colors" || other.value === color.value)) === index);
    });
    if (typeof source.factions === "boolean") setup.factions = source.factions;
    if (typeof source.verified === "boolean") setup.verified = source.verified;
    if (source.turnOrder === null) setup.turnOrder = null;
    else if (source.turnOrder && typeof source.turnOrder === "object") {
      const rule = source.turnOrder;
      setup.turnOrder = {
        firstMode: ["", "random-all", "current-order", "faction-order", "manual", "random-first"].includes(rule.firstMode) ? rule.firstMode : "current-order",
        sequence: ["clockwise", "random", "listed"].includes(rule.sequence) ? rule.sequence : rule.firstMode === "random-all" ? "random" : rule.autoSortFactions === true || rule.firstMode === "faction-order" ? "listed" : "clockwise",
        autoSortFactions: rule.autoSortFactions === true,
        label: u.cleanLine(rule.label, 80) || "First player",
        note: u.cleanText(rule.note, 1000).trim(),
        icon: "↕",
        defaultOthers: Array.from(new Set((Array.isArray(rule.defaultOthers) ? rule.defaultOthers : []).map(name => u.cleanLine(name, 60)).filter(Boolean))).slice(0, 12)
      };
    }
    return setup;
  }

  function normalizeLibraryGames(value, customGames) {
    const source = u.plainObject(value);
    const games = {};
    const gameIds = new Set(gameData.GAME_PRESETS.map(game => game.id).concat((Array.isArray(customGames) ? customGames : []).map(game => typeof game?.id === "string" ? (game.id.startsWith("custom-") ? game.id : "custom-" + game.id) : "")));
    Object.keys(source).slice(0, 2000).forEach(function (key) {
      const id = u.cleanLine(key, 100).replace(/[^a-z0-9_-]/gi, "-");
      if (!id) return;
      const entry = u.plainObject(source[key]);
      const owners = Array.from(new Set((Array.isArray(entry.owners) ? entry.owners : []).map(function (name) { return u.cleanLine(name, 60); }).filter(Boolean))).slice(0, 20);
      const normalized = {
        owned: entry.owned === true || owners.length > 0,
        owners: owners,
        wishlist: entry.wishlist === true,
        rating: Math.round(cleanNumber(entry.rating, 0, 5, 0) * 2) / 2,
        note: u.cleanText(entry.note, 1000).trim(),
        metadata: {
          year: /^-?\d{1,4}$/.test(String(entry.metadata?.year ?? "")) ? Number(entry.metadata.year) : null,
          bggRating: Number(entry.metadata?.bggRating) >= 1 && Number(entry.metadata?.bggRating) <= 10 ? Math.round(Number(entry.metadata.bggRating) * 100) / 100 : null,
          category: u.cleanLine(entry.metadata?.category, 1000),
          bggId: /^\d{1,12}$/.test(String(entry.metadata?.bggId || "")) && Number(entry.metadata.bggId) > 0 ? String(entry.metadata.bggId) : ""
        }
      };
      ["alternativeNames", "mechanisms", "expansions"].forEach(function (key) {
        const raw = entry.metadata?.[key];
        const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[;\n]/) : [];
        const tags = Array.from(new Set(list.map(function (tag) { return u.cleanLine(tag, 150); }).filter(Boolean))).slice(0, 100);
        if (tags.length) normalized.metadata[key] = tags;
      });
      const expansionOf = u.cleanLine(entry.metadata?.expansionOf, 100);
      if (expansionOf && expansionOf !== "custom" && expansionOf !== id && gameIds.has(expansionOf) && !source[expansionOf]?.metadata?.expansionOf) normalized.metadata.expansionOf = expansionOf;
      const additionalTypes = Array.from(new Set((Array.isArray(entry.metadata?.additionalTypes) ? entry.metadata.additionalTypes : []).filter(type => ADDITIONAL_GAME_TYPES.includes(type))));
      if (additionalTypes.length) normalized.metadata.additionalTypes = additionalTypes;
      const ownedExpansions = Array.from(new Set((Array.isArray(entry.metadata?.ownedExpansions) ? entry.metadata.ownedExpansions : []).map(name => u.cleanLine(name, 150)).filter(name => normalized.metadata.expansions?.includes(name))));
      if (ownedExpansions.length) normalized.metadata.ownedExpansions = ownedExpansions;
      if (["Board", "Cards", "Coop", "1v1", "Table"].includes(entry.metadata?.mainType)) normalized.metadata.mainType = entry.metadata.mainType;
      const mainTag = u.cleanLine(entry.metadata?.mainTag, 150);
      const allTags = normalized.metadata.category.split(/[,;]/).map(function (tag) { return tag.trim(); }).concat(normalized.metadata.mechanisms || [], normalized.metadata.expansions || []);
      if (mainTag && allTags.includes(mainTag)) normalized.metadata.mainTag = mainTag;
      const catalog = normalizeCatalogOverrides(entry.metadata?.catalog);
      if (Object.keys(catalog).length) normalized.metadata.catalog = catalog;
      const setup = normalizeGameSetup(entry.metadata?.setup);
      if (Object.keys(setup).length) normalized.metadata.setup = setup;
      if (normalized.owned || normalized.wishlist || normalized.rating || normalized.note || normalized.metadata.year === 0 || Object.values(normalized.metadata).some(Boolean)) games[id] = normalized;
    });
    Object.entries(games).forEach(function ([id, entry]) {
      const parentId = entry.metadata.expansionOf;
      if (!parentId) return;
      const record = (Array.isArray(customGames) ? customGames : []).find(game => (String(game?.id || "").startsWith("custom-") ? game.id : "custom-" + game?.id) === id) || gameData.GAME_PRESETS.find(game => game.id === id);
      const name = u.cleanLine(entry.metadata.catalog?.name || record?.name, 150);
      if (!name) { delete entry.metadata.expansionOf; return; }
      const parent = games[parentId] || {owned:false, owners:[], wishlist:false, rating:0, note:"", metadata:{year:null,bggRating:null,category:"",bggId:""}};
      parent.metadata.expansions = Array.from(new Set((parent.metadata.expansions || []).concat(name)));
      const owned = parent.metadata.ownedExpansions || [];
      if (entry.owned) parent.metadata.ownedExpansions = Array.from(new Set(owned.concat(name)));
      else if (owned.length) parent.metadata.ownedExpansions = owned.filter(value => value !== name);
      games[parentId] = parent;
    });
    return games;
  }

  function normalizeTurns(value) {
    return (Array.isArray(value) ? value : []).slice(0, 5000).map(function (item) {
      const source = u.plainObject(item);
      const duration = cleanNumber(source.duration, 0, 8.64e7, 0);
      return { startedAt: cleanTimestamp(source.startedAt), duration: Math.round(duration), endedAt: cleanTimestamp(source.endedAt) };
    });
  }

  function normalizeHistory(value) {
    const ids = new Set();
    return (Array.isArray(value) ? value : []).map(function (item) {
      const source = u.plainObject(item);
      const startedAt = cleanTimestamp(source.gameStartedAt || source.startedAt);
      const endedAt = cleanTimestamp(source.gameEndedAt || source.endedAt);
      if (!startedAt || !endedAt || endedAt < startedAt) return null;
      let id = cleanId(source.id, "game");
      if (ids.has(id)) id = u.uid("game");
      ids.add(id);
      const players = (Array.isArray(source.players) ? source.players : []).slice(0, 40).map(function (player, index) {
        const entry = u.plainObject(player);
        const placement = Number(entry.placement);
        return {
          id: cleanId(entry.id, "entry"),
          name: u.cleanLine(entry.name, 60) || "Unnamed",
          type: entry.type === "other" ? "other" : "player",
          color: u.normalizeColor(entry.color, "#94a3b8"),
          factionName: u.cleanLine(entry.factionName, 80),
          placement: Number.isInteger(placement) && placement > 0 && placement <= 40 ? String(placement) : "",
          ruleLookupDefault: entry.ruleLookupDefault === true,
          turnOrderDefault: entry.turnOrderDefault === true,
          turns: normalizeTurns(entry.turns)
        };
      });
      if (!players.some(function (player) { return player.type === "player"; })) return null;
      const pauses = (Array.isArray(source.pauses) ? source.pauses : []).slice(0, 2000).map(function (pause) {
        const entry = u.plainObject(pause);
        return { start: cleanTimestamp(entry.start), end: cleanTimestamp(entry.end), duration: Math.round(cleanNumber(entry.duration, 0, 8.64e7, 0)) };
      });
      return {
        id: id,
        gameId: u.cleanLine(source.gameId, 100).replace(/[^a-z0-9_-]/gi, "-") || "custom",
        gameName: u.cleanLine(source.gameName, 120) || "Custom Game",
        gameStartedAt: startedAt,
        firstTurnStartedAt: cleanTimestamp(source.firstTurnStartedAt),
        setupElapsed: Math.round(cleanNumber(source.setupElapsed, 0, 8.64e7, 0)),
        gameEndedAt: endedAt,
        players: players,
        pauses: pauses,
        note: u.cleanText(source.note, 1000).trim()
      };
    }).filter(Boolean).sort(function (a, b) { return b.gameEndedAt - a.gameEndedAt; }).slice(0, config.controls.maxHistory);
  }

  function demoDocuments(now) {
    return [
      { id: "app-notes", title: "Notes", html: "", order: 0, createdAt: now, updatedAt: now }
    ];
  }

  function defaultTheme() {
    return config.themeDefaults;
  }

  function createDefaultState(options) {
    const settings = Object.assign({ demo: config.features.demoData }, options || {});
    const now = u.isoNow();
    const records = settings.demo ? demoRecords(now) : [];
    const documents = settings.demo && config.features.documents ? demoDocuments(now) : [];
    return {
      schemaVersion: config.schemaVersion,
      meta: {
        appVersion: config.identity.version,
        buildId: config.identity.buildId,
        createdAt: now,
        updatedAt: now,
        lastMutationId: u.uid("mutation"),
        tombstones: { records: [], documents: [] },
        legacyImported: false
      },
      workspace: {
        title: "Game Timer",
        records: records,
        documents: documents,
        people: defaultPeople(),
        library: { games: {}, customGames: [] },
        history: []
      },
      preferences: {
        appearance: {
          mode: "system",
          accent: defaultTheme().accent,
          accent2: defaultTheme().accent2,
          success: defaultTheme().success,
          warning: defaultTheme().warning,
          danger: defaultTheme().danger,
          textScale: 1
        },
        controls: {
          showWhatsNew: true,
          whatsNewDismissSeconds: config.controls.whatsNewAutoDismissMs / 1000,
          buttonStyle: "both",
          shortcutHints: true,
          shortcutHintModifier: config.controls.shortcutHintModifier,
          developerMode: false
        },
        hints: {
          enabled: config.features.hints && config.controls.hintsEnabledByDefault,
          dismissed: []
        },
        installation: {
          iconVariant: "auto"
        },
        game: defaultGamePreferences()
      },
      ui: {
        view: "play",
        activeModule: "roadmap",
        selectedRecordId: records[0] ? records[0].id : "",
        selectedDocumentId: documents[0] ? documents[0].id : "",
        search: "",
        searchNameOnly: false,
        records: {
          statusFilter: "all",
          categoryFilter: "all",
          favoritesOnly: false,
          sortBy: "order",
          sortDirection: "asc",
          viewMode: "comfortable",
          expandedIds: []
        },
        documents: {
          search: "",
          sortBy: "order",
          sortDirection: "asc"
        },
        panels: {
          listVisible: true,
          detailVisible: true,
          listRatio: 0.38
        },
        navigation: {
          mobileScreen: "list",
          recordsScrollTop: 0,
          documentsScrollTop: 0
        },
        dismissedHints: [],
        seenReleaseVersion: "",
        supportTab: "settings"
      },
      modules: {
        library: { tab: "games", search: "", host: "all", hosts: [], category: "all", mechanism: "all", mainType: "all", showExpansions: false, expansionDisclosure: {}, ownership: "all", present: [], playerCount: 0, sortBy: "fit", sortDirection: "asc" },
        history: { search: "", game: "all", person: "all" },
        play: { gameFilter: "all" },
        records: { showDemoFields: true },
        documents: { enabled: config.features.documents },
        roadmap: { search: "", state: "all", priority: "all", target: "all", effort: "all", sortBy: "priority", sortDirection: "asc" },
        cloudSync: {
          enabled: config.features.cloudSync,
          owner: CLOUD_TARGET.owner,
          repo: CLOUD_TARGET.repo,
          branch: CLOUD_TARGET.branch,
          path: CLOUD_TARGET.path,
          rememberToken: true,
          autoSync: false,
          autoSyncReady: false,
          advancedOpen: false,
          baselineTarget: "",
          baselineSha: "",
          baselineHash: "",
          lastSyncedAt: "",
          lastCheckedAt: ""
        }
      }
    };
  }

  function migrate1to2(input) {
    const source = u.plainObject(input);
    const now = u.isoNow();
    const rawRecords = Array.isArray(source.items) ? source.items : (Array.isArray(source.records) ? source.records : []);
    const rawDocuments = Array.isArray(source.notes) ? source.notes : (Array.isArray(source.documents) ? source.documents : []);
    return {
      schemaVersion: 2,
      meta: {
        appVersion: u.cleanLine(source.appVersion || source.version, 32),
        createdAt: source.createdAt || now,
        updatedAt: source.updatedAt || now
      },
      workspace: {
        title: source.workspaceTitle || source.title || "My Workspace",
        records: rawRecords.map(function (item, index) {
          const record = u.plainObject(item);
          return {
            id: record.id || u.uid("record"),
            title: record.title || record.name || "Untitled record",
            summary: record.summary || record.description || "",
            category: record.category || record.type || "General",
            status: record.status || (record.done ? "complete" : "active"),
            url: record.url || record.link || "",
            tags: record.tags || [],
            favorite: record.favorite === true,
            order: Number.isFinite(Number(record.order)) ? Number(record.order) : index,
            createdAt: record.createdAt || now,
            updatedAt: record.updatedAt || now
          };
        }),
        documents: rawDocuments.map(function (item, index) {
          if (typeof item === "string") return { id: u.uid("document"), title: "Note " + (index + 1), html: "<p>" + u.escapeHtml(item) + "</p>", order: index, createdAt: now, updatedAt: now };
          const document = u.plainObject(item);
          return {
            id: document.id || u.uid("document"),
            title: document.title || document.name || "Untitled note",
            html: document.html || document.content || document.text || "",
            order: Number.isFinite(Number(document.order)) ? Number(document.order) : index,
            createdAt: document.createdAt || now,
            updatedAt: document.updatedAt || now
          };
        })
      },
      preferences: {
        theme: source.theme || (source.settings && source.settings.theme) || "system",
        accent: source.accent || (source.settings && source.settings.accent),
        textScale: source.textScale || (source.settings && source.settings.textScale) || 1,
        buttonStyle: source.buttonStyle || (source.settings && source.settings.buttonStyle) || "both",
        hintsEnabled: typeof source.hintsEnabled === "boolean" ? source.hintsEnabled : config.controls.hintsEnabledByDefault
      },
      layout: u.plainObject(source.layout || source.panels),
      filters: u.plainObject(source.filters),
      selection: u.plainObject(source.selection),
      modules: u.plainObject(source.modules)
    };
  }

  function migrate2to3(input) {
    const source = u.plainObject(input);
    const base = createDefaultState({ demo: false });
    const oldPreferences = u.plainObject(source.preferences);
    const oldLayout = u.plainObject(source.layout);
    const oldFilters = u.plainObject(source.filters);
    const oldSelection = u.plainObject(source.selection);
    const oldModules = u.plainObject(source.modules);
    const mode = ["system", "light", "dark"].includes(oldPreferences.theme) ? oldPreferences.theme : "system";
    return {
      schemaVersion: 3,
      meta: Object.assign({}, base.meta, u.plainObject(source.meta), { tombstones: { records: [], documents: [] } }),
      workspace: Object.assign({}, base.workspace, u.plainObject(source.workspace)),
      preferences: {
        appearance: Object.assign({}, base.preferences.appearance, {
          mode: mode,
          accent: oldPreferences.accent || base.preferences.appearance.accent,
          textScale: oldPreferences.textScale || 1
        }),
        controls: Object.assign({}, base.preferences.controls, { buttonStyle: oldPreferences.buttonStyle || "both" }),
        hints: Object.assign({}, base.preferences.hints, { enabled: typeof oldPreferences.hintsEnabled === "boolean" ? oldPreferences.hintsEnabled : config.controls.hintsEnabledByDefault }),
        installation: base.preferences.installation
      },
      ui: Object.assign({}, base.ui, {
        selectedRecordId: oldSelection.recordId || oldSelection.selectedRecordId || "",
        selectedDocumentId: oldSelection.documentId || oldSelection.selectedDocumentId || "",
        records: Object.assign({}, base.ui.records, oldFilters.records || oldFilters),
        documents: Object.assign({}, base.ui.documents, oldFilters.documents),
        panels: {
          listVisible: oldLayout.listVisible !== false,
          detailVisible: oldLayout.detailVisible !== false,
          listRatio: oldLayout.listRatio || oldLayout.splitRatio || base.ui.panels.listRatio
        }
      }),
      modules: Object.assign({}, base.modules, oldModules)
    };
  }

  function migrate3to4(input) {
    const source = u.plainObject(input);
    source.schemaVersion = 4;
    source.ui = Object.assign({}, u.plainObject(source.ui), { activeModule: "roadmap" });
    return source;
  }

  const migrations = { 1: migrate1to2, 2: migrate2to3, 3: migrate3to4 };

  function unwrapInput(input) {
    const source = u.plainObject(input);
    if (source.exportFormat && source.state && typeof source.state === "object") return source.state;
    if (source.backup && source.backup.state && typeof source.backup.state === "object") return source.backup.state;
    if (source.data && source.data.workspace && typeof source.data === "object") return source.data;
    return source;
  }

  function migrate(input) {
    let next = u.clone(unwrapInput(input));
    let version = Number(next.schemaVersion || next.stateVersion || 1);
    if (!Number.isInteger(version) || version < 1) version = 1;
    if (version > config.schemaVersion) throw new Error("This backup uses a newer state model (v" + version + ") than this app supports (v" + config.schemaVersion + ").");
    const applied = [];
    while (version < config.schemaVersion) {
      const migration = migrations[version];
      if (!migration) throw new Error("No migration is available from state model v" + version + ".");
      next = migration(next);
      applied.push(version + "→" + (version + 1));
      version += 1;
    }
    next.schemaVersion = config.schemaVersion;
    return { state: next, applied: applied };
  }

  function normalizeRecord(input, index, usedIds, now) {
    const source = u.plainObject(input);
    let id = u.cleanLine(source.id, 100).replace(/[^a-z0-9_-]/gi, "-");
    if (!id || usedIds.has(id)) id = u.uid("record");
    usedIds.add(id);
    const status = STATUS_IDS.has(source.status) ? source.status : "active";
    const createdAt = u.ensureIso(source.createdAt, now);
    return {
      id: id,
      title: u.cleanLine(source.title || source.name || "Untitled record", 140) || "Untitled record",
      summary: u.cleanText(source.summary || source.description, 4000).trim(),
      category: u.cleanLine(source.category || "General", 60) || "General",
      status: status,
      url: u.safeUrl(source.url || source.link),
      tags: Array.from(new Set((Array.isArray(source.tags) ? source.tags : String(source.tags || "").split(","))
        .map(function (tag) { return u.cleanLine(tag, 32).toLowerCase(); }).filter(Boolean))).slice(0, 20),
      favorite: source.favorite === true,
      order: Number.isFinite(Number(source.order)) ? Math.round(Number(source.order)) : index,
      createdAt: createdAt,
      updatedAt: u.ensureIso(source.updatedAt, createdAt)
    };
  }

  function normalizeDocument(input, index, usedIds, now) {
    const source = u.plainObject(input);
    let id = u.cleanLine(source.id, 100).replace(/[^a-z0-9_-]/gi, "-");
    if (!id || usedIds.has(id)) id = u.uid("document");
    usedIds.add(id);
    const createdAt = u.ensureIso(source.createdAt, now);
    return {
      id: id,
      title: u.cleanLine(source.title || source.name || "Untitled note", 140) || "Untitled note",
      html: u.sanitizeRichHtml(source.html || source.content || source.text || ""),
      order: Number.isFinite(Number(source.order)) ? Math.round(Number(source.order)) : index,
      createdAt: createdAt,
      updatedAt: u.ensureIso(source.updatedAt, createdAt)
    };
  }

  function consolidateDocuments(documents, now) {
    const ordered = documents.slice().sort(function (a, b) { return a.order - b.order; });
    if (!ordered.length) return [{ id: "app-notes", title: "Notes", html: "", order: 0, createdAt: now, updatedAt: now }];
    const createdAt = ordered.reduce(function (earliest, item) {
      return Date.parse(item.createdAt) < Date.parse(earliest) ? item.createdAt : earliest;
    }, ordered[0].createdAt);
    const updatedAt = ordered.reduce(function (latest, item) {
      return Date.parse(item.updatedAt) > Date.parse(latest) ? item.updatedAt : latest;
    }, ordered[0].updatedAt);
    const sections = ordered.map(function (item) {
      const text = u.richTextToPlainText(item.html, config.controls.maxDocumentHtmlLength);
      if (ordered.length === 1) return text;
      return [item.title, text].filter(Boolean).join("\n\n");
    });
    let text = u.cleanText(sections.filter(Boolean).join("\n\n—\n\n"), config.controls.maxDocumentHtmlLength);
    if (ordered.length === 1 && text === "This is a simple local note. Start typing to replace it.") text = "";
    return [{
      id: "app-notes",
      title: "Notes",
      html: u.escapeHtml(text).replace(/\n/g, "<br>"),
      order: 0,
      createdAt: createdAt,
      updatedAt: updatedAt
    }];
  }

  function normalizeTombstones(value) {
    const used = new Set();
    return (Array.isArray(value) ? value : []).map(function (entry) {
      const source = u.plainObject(entry);
      const id = u.cleanLine(source.id, 100).replace(/[^a-z0-9_-]/gi, "-");
      if (!id || used.has(id)) return null;
      used.add(id);
      return { id: id, deletedAt: u.ensureIso(source.deletedAt) };
    }).filter(Boolean).slice(0, 10000);
  }

  function normalize(input) {
    const source = u.plainObject(input);
    const base = createDefaultState({ demo: false });
    const now = u.isoNow();
    const sourceMeta = u.plainObject(source.meta);
    const sourceWorkspace = u.plainObject(source.workspace);
    const sourcePreferences = u.plainObject(source.preferences);
    const sourceAppearance = u.plainObject(sourcePreferences.appearance);
    const sourceControls = u.plainObject(sourcePreferences.controls);
    const sourceHints = u.plainObject(sourcePreferences.hints);
    const sourceInstallation = u.plainObject(sourcePreferences.installation);
    const sourceUi = u.plainObject(source.ui);
    const sourceRecordUi = u.plainObject(sourceUi.records);
    const sourceDocumentUi = u.plainObject(sourceUi.documents);
    const sourcePanels = u.plainObject(sourceUi.panels);
    const sourceNavigation = u.plainObject(sourceUi.navigation);
    const sourceModules = u.plainObject(source.modules);
    const sourceLibraryUi = u.plainObject(sourceModules.library);
    const sourceHistoryUi = u.plainObject(sourceModules.history);
    const sourcePlayUi = u.plainObject(sourceModules.play);
    const sourceGame = u.plainObject(sourcePreferences.game);
    const sourceLibrary = u.plainObject(sourceWorkspace.library);
    const gameDefaults = defaultGamePreferences();
    const people = Array.isArray(sourceWorkspace.people) ? normalizePeople(sourceWorkspace.people) : defaultPeople();
    const hostNames = new Set(people.map(function (person) { return person.name; }));
    Object.values(u.plainObject(sourceLibrary.games)).forEach(function (entry) {
      (Array.isArray(entry?.owners) ? entry.owners : []).forEach(function (name) { hostNames.add(u.cleanLine(name, 60)); });
    });
    const hosts = Array.from(new Set((Array.isArray(sourceLibraryUi.hosts) ? sourceLibraryUi.hosts : [sourceLibraryUi.host]).map(name => u.cleanLine(name, 60)).filter(name => hostNames.has(name)))).slice(0, 20);
    const sourceRoadmap = u.plainObject(sourceModules.roadmap);
    const sourceCloud = u.plainObject(sourceModules.cloudSync);
    const theme = defaultTheme();
    const recordIds = new Set();
    const normalizedDocumentIds = new Set();
    const records = (Array.isArray(sourceWorkspace.records) ? sourceWorkspace.records : []).slice(0, config.controls.maxRecords).map(function (record, index) {
      return normalizeRecord(record, index, recordIds, now);
    });
    const normalizedDocuments = (Array.isArray(sourceWorkspace.documents) ? sourceWorkspace.documents : []).slice(0, config.controls.maxDocuments).map(function (document, index) {
      return normalizeDocument(document, index, normalizedDocumentIds, now);
    });
    const documents = consolidateDocuments(normalizedDocuments, now);
    const documentIds = new Set(documents.map(function (documentItem) { return documentItem.id; }));
    const categories = new Set(records.map(function (record) { return record.category; }));
    const mode = ["system", "light", "dark"].includes(sourceAppearance.mode) ? sourceAppearance.mode : "system";
    const sortBy = ["order", "title", "status", "updatedAt", "createdAt"].includes(sourceRecordUi.sortBy) ? sourceRecordUi.sortBy : "order";
    const documentSort = ["order", "title", "updatedAt", "createdAt"].includes(sourceDocumentUi.sortBy) ? sourceDocumentUi.sortBy : "order";
    const activeCandidates = MODULE_IDS.filter(function (id) { return id !== "roadmap" || config.features.roadmap; });
    const activeModule = activeCandidates.includes(sourceUi.activeModule) ? sourceUi.activeModule : (activeCandidates[0] || "");
    const sourceTombstones = u.plainObject(sourceMeta.tombstones);
    const state = {
      schemaVersion: config.schemaVersion,
      meta: {
        appVersion: config.identity.version,
        buildId: config.identity.buildId,
        createdAt: u.ensureIso(sourceMeta.createdAt, now),
        updatedAt: u.ensureIso(sourceMeta.updatedAt, now),
        lastMutationId: u.cleanLine(sourceMeta.lastMutationId, 100) || u.uid("mutation"),
        tombstones: {
          records: normalizeTombstones(sourceTombstones.records),
          documents: normalizeTombstones(sourceTombstones.documents)
        },
        legacyImported: sourceMeta.legacyImported === true
      },
      workspace: {
        title: u.cleanLine(sourceWorkspace.title || base.workspace.title, 100) || base.workspace.title,
        records: records,
        documents: documents,
        people: people,
        library: {
          games: normalizeLibraryGames(sourceLibrary.games, sourceLibrary.customGames),
          customGames: normalizeCustomGames(sourceLibrary.customGames)
        },
        history: normalizeHistory(sourceWorkspace.history)
      },
      preferences: {
        appearance: {
          mode: mode,
          accent: u.normalizeColor(sourceAppearance.accent, theme.accent),
          accent2: u.normalizeColor(sourceAppearance.accent2, theme.accent2),
          success: u.normalizeColor(sourceAppearance.success, theme.success),
          warning: u.normalizeColor(sourceAppearance.warning, theme.warning),
          danger: u.normalizeColor(sourceAppearance.danger, theme.danger),
          textScale: u.clamp(sourceAppearance.textScale, 0.85, 1.3, u.clamp(sourceAppearance.readingScale, 0.85, 1.3, 1))
        },
        controls: {
          showWhatsNew: sourceControls.showWhatsNew !== false,
          whatsNewDismissSeconds: Math.round(u.clamp(sourceControls.whatsNewDismissSeconds, 1, 300, config.controls.whatsNewAutoDismissMs / 1000)),
          buttonStyle: ["icons", "text", "both"].includes(sourceControls.buttonStyle) ? sourceControls.buttonStyle : "both",
          shortcutHints: sourceControls.shortcutHints !== false,
          shortcutHintModifier: sourceControls.shortcutHintModifier === "ShiftControlOption" ? sourceControls.shortcutHintModifier : config.controls.shortcutHintModifier,
          developerMode: sourceControls.developerMode === true
        },
        hints: {
          enabled: config.features.hints && (typeof sourceHints.enabled === "boolean" ? sourceHints.enabled : config.controls.hintsEnabledByDefault),
          dismissed: Array.from(new Set((Array.isArray(sourceHints.dismissed) ? sourceHints.dismissed : []).map(function (id) { return u.cleanLine(id, 80); }).filter(Boolean))).slice(0, 200)
        },
        installation: {
          iconVariant: ["auto", "light", "dark"].includes(sourceInstallation.iconVariant) ? sourceInstallation.iconVariant : "auto"
        },
        game: {
          timeFormat: sourceGame.timeFormat === "units" ? "units" : gameDefaults.timeFormat,
          dateFormat: ["mdy", "dmy", "ymd"].includes(sourceGame.dateFormat) ? sourceGame.dateFormat : gameDefaults.dateFormat,
          displayNameMode: sourceGame.displayNameMode === "faction" ? "faction" : gameDefaults.displayNameMode,
          textType: sourceGame.textType === "emoji" ? "emoji" : gameDefaults.textType,
          demoMode: sourceGame.demoMode === true,
          keepAwake: sourceGame.keepAwake !== false,
          chime: sourceGame.chime === true,
          haptics: sourceGame.haptics !== false,
          longTurnSeconds: Math.round(cleanNumber(sourceGame.longTurnSeconds, 0, 3600, gameDefaults.longTurnSeconds))
        }
      },
      ui: {
        view: VIEW_IDS.includes(sourceUi.view) ? sourceUi.view : "play",
        activeModule: activeModule,
        selectedRecordId: recordIds.has(sourceUi.selectedRecordId) ? sourceUi.selectedRecordId : (records[0] ? records[0].id : ""),
        selectedDocumentId: documentIds.has(sourceUi.selectedDocumentId) ? sourceUi.selectedDocumentId : (documents[0] ? documents[0].id : ""),
        search: u.cleanLine(sourceUi.search, 200),
        searchNameOnly: sourceUi.searchNameOnly === true,
        records: {
          statusFilter: sourceRecordUi.statusFilter === "all" || STATUS_IDS.has(sourceRecordUi.statusFilter) ? (sourceRecordUi.statusFilter || "all") : "all",
          categoryFilter: sourceRecordUi.categoryFilter === "all" || categories.has(sourceRecordUi.categoryFilter) ? (sourceRecordUi.categoryFilter || "all") : "all",
          favoritesOnly: sourceRecordUi.favoritesOnly === true,
          sortBy: sortBy,
          sortDirection: sourceRecordUi.sortDirection === "desc" ? "desc" : "asc",
          viewMode: ["compact", "comfortable"].includes(sourceRecordUi.viewMode) ? sourceRecordUi.viewMode : "comfortable",
          expandedIds: (Array.isArray(sourceRecordUi.expandedIds) ? sourceRecordUi.expandedIds : []).filter(function (id) { return recordIds.has(id); }).slice(0, 200)
        },
        documents: {
          search: u.cleanLine(sourceDocumentUi.search, 200),
          sortBy: documentSort,
          sortDirection: sourceDocumentUi.sortDirection === "desc" ? "desc" : "asc"
        },
        panels: {
          listVisible: sourcePanels.listVisible !== false,
          detailVisible: sourcePanels.detailVisible !== false,
          listRatio: u.clamp(sourcePanels.listRatio, 0.25, 0.7, base.ui.panels.listRatio)
        },
        navigation: {
          mobileScreen: sourceNavigation.mobileScreen === "detail" ? "detail" : "list",
          recordsScrollTop: u.clamp(sourceNavigation.recordsScrollTop, 0, 10000000, 0),
          documentsScrollTop: u.clamp(sourceNavigation.documentsScrollTop, 0, 10000000, 0)
        },
        dismissedHints: Array.from(new Set((Array.isArray(sourceUi.dismissedHints) ? sourceUi.dismissedHints : []).map(function (id) { return u.cleanLine(id, 80); }).filter(Boolean))).slice(0, 200),
        seenReleaseVersion: u.cleanLine(sourceUi.seenReleaseVersion, 32),
        supportTab: ["settings", "dataSync", "help", "releases", "shortcuts", "roadmap", "developer"].includes(sourceUi.supportTab) ? sourceUi.supportTab : "settings"
      },
      modules: {
        library: {
          tab: LIBRARY_TABS.includes(sourceLibraryUi.tab) ? sourceLibraryUi.tab : "games",
          search: u.cleanLine(sourceLibraryUi.search, 200),
          category: "all",
          mechanism: u.cleanLine(sourceLibraryUi.mechanism, 150) || "all",
          mainType: ["Board", "Cards", "Coop", "1v1", "Table", ...ADDITIONAL_GAME_TYPES.map(type => "additional:" + type)].includes(sourceLibraryUi.mainType || sourceLibraryUi.category) ? sourceLibraryUi.mainType || sourceLibraryUi.category : "all",
          showExpansions: sourceLibraryUi.showExpansions === true,
          expansionDisclosure: Object.fromEntries(Object.entries(u.plainObject(sourceLibraryUi.expansionDisclosure)).filter(([id, value]) => /^[a-z0-9_-]{1,100}$/i.test(id) && typeof value === "boolean").slice(0, 2000)),
          verified: ["yes", "no"].includes(sourceLibraryUi.verified) ? sourceLibraryUi.verified : "all",
          host: hosts.length === 1 ? hosts[0] : "all",
          hosts,
          ownership: LIBRARY_OWNERSHIP.includes(sourceLibraryUi.ownership) ? sourceLibraryUi.ownership : "all",
          present: Array.from(new Set((Array.isArray(sourceLibraryUi.present) ? sourceLibraryUi.present : []).map(function (name) { return u.cleanLine(name, 60); }).filter(function (name) { return people.some(function (person) { return person.name === name; }); }))),
          playerCount: Math.round(cleanNumber(sourceLibraryUi.playerCount, 0, 20, 0)),
          sortBy: sourceLibraryUi.sortBy === "category" ? "mainType" : LIBRARY_SORTS.includes(sourceLibraryUi.sortBy) ? sourceLibraryUi.sortBy : "fit",
          sortDirection: sourceLibraryUi.sortDirection === "desc" ? "desc" : "asc"
        },
        history: {
          search: u.cleanLine(sourceHistoryUi.search, 200),
          game: u.cleanLine(sourceHistoryUi.game, 100) || "all",
          person: u.cleanLine(sourceHistoryUi.person, 60) || "all"
        },
        play: {
          gameFilter: ["all", "owned", "fits"].includes(sourcePlayUi.gameFilter) ? sourcePlayUi.gameFilter : "all"
        },
        records: Object.assign({}, base.modules.records, u.plainObject(sourceModules.records)),
        documents: { enabled: config.features.documents && u.plainObject(sourceModules.documents).enabled !== false },
        roadmap: {
          search: u.cleanLine(sourceRoadmap.search, 200),
          state: ["all", "released", "planned", "wishlist"].includes(sourceRoadmap.state) ? sourceRoadmap.state : "all",
          priority: ["all", "1", "2", "3"].includes(String(sourceRoadmap.priority)) ? String(sourceRoadmap.priority) : "all",
          target: sourceRoadmap.target ? u.cleanLine(sourceRoadmap.target, 80) : "all",
          effort: ["all", "1", "2", "3", "4"].includes(String(sourceRoadmap.effort)) ? String(sourceRoadmap.effort) : "all",
          sortBy: ["priority", "target", "effort", "age", "title"].includes(sourceRoadmap.sortBy) ? sourceRoadmap.sortBy : "priority",
          sortDirection: sourceRoadmap.sortDirection === "desc" ? "desc" : "asc"
        },
        cloudSync: {
          enabled: config.features.cloudSync && sourceCloud.enabled !== false,
          owner: CLOUD_TARGET.owner,
          repo: CLOUD_TARGET.repo,
          branch: CLOUD_TARGET.branch,
          path: CLOUD_TARGET.path,
          rememberToken: sourceCloud.rememberToken !== false,
          autoSync: sourceCloud.autoSync === true,
          autoSyncReady: sourceCloud.autoSyncReady === true,
          advancedOpen: sourceCloud.advancedOpen === true,
          baselineTarget: u.cleanLine(sourceCloud.baselineTarget, 800),
          baselineSha: u.cleanLine(sourceCloud.baselineSha, 100),
          baselineHash: u.cleanLine(sourceCloud.baselineHash, 100),
          lastSyncedAt: sourceCloud.lastSyncedAt ? u.ensureIso(sourceCloud.lastSyncedAt, "") : "",
          lastCheckedAt: sourceCloud.lastCheckedAt ? u.ensureIso(sourceCloud.lastCheckedAt, "") : ""
        }
      }
    };
    if (!state.ui.panels.listVisible && !state.ui.panels.detailVisible) state.ui.panels.listVisible = true;
    return state;
  }

  function validate(state) {
    const errors = [];
    const warnings = [];
    if (!state || typeof state !== "object") errors.push("The root value must be an object.");
    if (state.schemaVersion !== config.schemaVersion) errors.push("The state-model version is not supported.");
    if (!state.workspace || !Array.isArray(state.workspace.records) || !Array.isArray(state.workspace.documents)) errors.push("Workspace records or documents are missing.");
    if (state.workspace && !Array.isArray(state.workspace.history)) errors.push("Game history is missing.");
    if (state.workspace && Array.isArray(state.workspace.history) && state.workspace.history.length >= config.controls.maxHistory) warnings.push("The history limit was reached; older games were not included.");
    if (state.workspace && state.workspace.records.length >= config.controls.maxRecords) warnings.push("The record limit was reached; extra records were not included.");
    if (state.workspace && state.workspace.documents.length >= config.controls.maxDocuments) warnings.push("The document limit was reached; extra documents were not included.");
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function prepare(input) {
    if (input && ("syncFormat" in Object(input) || "syncVersion" in Object(input))) return prepareSync(input);
    const migration = migrate(input);
    const state = normalize(migration.state);
    const validation = validate(state);
    if (!validation.ok) throw new Error(validation.errors.join(" "));
    return { state: state, migrations: migration.applied, validation: validation };
  }

  function touch(state) {
    state.meta.appVersion = config.identity.version;
    state.meta.buildId = config.identity.buildId;
    state.meta.updatedAt = u.isoNow();
    state.meta.lastMutationId = u.uid("mutation");
    return state;
  }

  function resetPreferences(state) {
    const defaults = createDefaultState({ demo: false });
    const next = u.clone(state);
    next.preferences = defaults.preferences;
    next.ui.search = "";
    next.ui.searchNameOnly = false;
    next.ui.records = defaults.ui.records;
    next.ui.documents = defaults.ui.documents;
    next.ui.panels = defaults.ui.panels;
    next.ui.navigation = defaults.ui.navigation;
    next.ui.dismissedHints = [];
    next.ui.supportTab = "settings";
    next.modules.library = defaults.modules.library;
    next.modules.history = defaults.modules.history;
    next.modules.play = defaults.modules.play;
    next.modules.roadmap = defaults.modules.roadmap;
    next.modules.cloudSync.advancedOpen = false;
    return normalize(touch(next));
  }

  function exportEnvelope(state) {
    return {
      exportFormat: "local-first-workspace-backup",
      exportedAt: u.isoNow(),
      application: {
        name: config.identity.name,
        version: config.identity.version,
        buildId: config.identity.buildId
      },
      schemaVersion: config.schemaVersion,
      state: normalize(u.clone(state))
    };
  }

  // Cloud data is a complete content snapshot. Empty collections are omitted;
  // their absence still clears that content when a snapshot is downloaded.
  function syncPayload(state) {
    const normalized = normalize(state);
    const data = {};
    const notes = u.richTextToPlainText(normalized.workspace.documents[0].html, config.controls.maxDocumentHtmlLength);
    if (notes) data.notes = notes;
    if (normalized.workspace.people.length) data.people = normalized.workspace.people;
    if (Object.keys(normalized.workspace.library.games).length) data.libraryGames = normalized.workspace.library.games;
    if (normalized.workspace.library.customGames.length) data.customGames = normalized.workspace.library.customGames;
    if (normalized.workspace.history.length) data.history = normalized.workspace.history;
    // Preserve real content from older backups, without exporting empty scaffolding.
    if (normalized.workspace.records.length) data.records = normalized.workspace.records.map(function (record) {
      const item = Object.assign({}, record);
      delete item.createdAt;
      delete item.updatedAt;
      return item;
    });
    return { syncFormat: SYNC_FORMAT, syncVersion: SYNC_VERSION, schemaVersion: SYNC_SCHEMA_VERSION, data: data };
  }

  function syncHash(state) {
    // Prefix separates content hashes from the previous whole-state baselines.
    return "data-v1:" + u.fingerprint(syncPayload(state));
  }

  function prepareSync(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("The GitHub data must be a JSON object.");
    if (!("syncFormat" in input) && !("syncVersion" in input)) {
      return Object.assign({}, prepare(input), { legacy: true });
    }
    if (input.syncFormat !== SYNC_FORMAT || input.syncVersion !== SYNC_VERSION || input.schemaVersion !== SYNC_SCHEMA_VERSION) throw new Error("This cloud data format is not supported. Update the app before syncing.");
    const data = input.data;
    if (!data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).some(function (key) { return !["notes", "records", "people", "libraryGames", "customGames", "history"].includes(key); })
      || ("notes" in data && (typeof data.notes !== "string" || data.notes.length > config.controls.maxDocumentHtmlLength))
      || ("people" in data && (!Array.isArray(data.people) || data.people.length > config.controls.maxPeople))
      || ("libraryGames" in data && (!data.libraryGames || typeof data.libraryGames !== "object" || Array.isArray(data.libraryGames)))
      || ("customGames" in data && (!Array.isArray(data.customGames) || data.customGames.length > config.controls.maxCustomGames))
      || ("history" in data && (!Array.isArray(data.history) || data.history.length > config.controls.maxHistory))
      || ("records" in data && (!Array.isArray(data.records) || data.records.length > config.controls.maxRecords))) {
      throw new Error("The cloud file contains invalid or unsupported content.");
    }
    if ((data.history || []).some(function (item) { return !item || typeof item.id !== "string" || !item.id; })
      || (data.people || []).some(function (item) { return !item || typeof item.name !== "string" || !item.name; })
      || (data.records || []).some(function (item) { return !item || typeof item.id !== "string" || !item.id; })) {
      throw new Error("The cloud file contains an invalid saved item.");
    }
    const state = normalize({
      workspace: {
        documents: [{ id: "app-notes", title: "Notes", html: u.escapeHtml(data.notes || "").replace(/\n/g, "<br>") }],
        records: data.records || [],
        people: data.people || [],
        library: { games: data.libraryGames || {}, customGames: data.customGames || [] },
        history: data.history || []
      }
    });
    return { state: state, legacy: false, migrations: [], validation: validate(state) };
  }

  function applySync(localState, remoteState) {
    const next = normalize(localState);
    const remote = normalize(remoteState);
    next.workspace.documents = remote.workspace.documents;
    next.workspace.records = remote.workspace.records;
    next.workspace.people = remote.workspace.people;
    next.workspace.library = remote.workspace.library;
    next.workspace.history = remote.workspace.history;
    next.meta.tombstones = remote.meta.tombstones;
    return normalize(touch(next));
  }

  function mergeSyncData(localState, remoteState) {
    const local = syncPayload(localState).data;
    const remote = syncPayload(remoteState).data;
    if (local.notes && remote.notes && local.notes !== remote.notes) throw new Error("Notes differ. Choose which copy to keep.");
    const data = {};
    if (local.notes || remote.notes) data.notes = local.notes || remote.notes;
    // People are a name list; the same name added on two devices is one person, keeping this device's color.
    const people = new Map();
    (local.people || []).concat(remote.people || []).forEach(function (person) {
      const key = person.name.toLowerCase();
      if (!people.has(key)) people.set(key, person);
    });
    if (people.size > config.controls.maxPeople) throw new Error("The combined people list exceeds the limit.");
    if (people.size) data.people = Array.from(people.values());
    [["history", "id", config.controls.maxHistory], ["customGames", "id", config.controls.maxCustomGames], ["records", "id", config.controls.maxRecords]].forEach(function (entry) {
      const items = new Map();
      (local[entry[0]] || []).concat(remote[entry[0]] || []).forEach(function (item) {
        const current = items.get(item[entry[1]]);
        if (current && u.stableJson(current) !== u.stableJson(item)) throw new Error("The same saved item differs. Choose which copy to keep.");
        items.set(item[entry[1]], item);
      });
      if (items.size > entry[2]) throw new Error("The combined content exceeds the saved item limit.");
      if (items.size) data[entry[0]] = Array.from(items.values());
    });
    const games = {};
    Object.keys(Object.assign({}, local.libraryGames, remote.libraryGames)).forEach(function (id) {
      const localEntry = (local.libraryGames || {})[id];
      const remoteEntry = (remote.libraryGames || {})[id];
      if (localEntry && remoteEntry && u.stableJson(localEntry) !== u.stableJson(remoteEntry)) throw new Error("A library game differs. Choose which copy to keep.");
      games[id] = localEntry || remoteEntry;
    });
    if (Object.keys(games).length) data.libraryGames = games;
    return { syncFormat: SYNC_FORMAT, syncVersion: SYNC_VERSION, schemaVersion: SYNC_SCHEMA_VERSION, data: data };
  }

  function canMerge(localState, remoteState) {
    try { mergeSyncData(localState, remoteState); return true; }
    catch (error) { return false; }
  }

  function merge(localState, remoteState) {
    return applySync(localState, prepareSync(mergeSyncData(localState, remoteState)).state);
  }

  App.stateModel = {
    additionalGameTypes: ADDITIONAL_GAME_TYPES,
    migrations: migrations,
    createDefaultState: createDefaultState,
    normalize: normalize,
    validate: validate,
    prepare: prepare,
    touch: touch,
    resetPreferences: resetPreferences,
    exportEnvelope: exportEnvelope,
    syncPayload: syncPayload,
    syncHash: syncHash,
    prepareSync: prepareSync,
    applySync: applySync,
    canMerge: canMerge,
    merge: merge
  };
})();
