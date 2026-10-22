/* Play: game setup, the live session timer, and end-of-game statistics. */
(function () {
  "use strict";

  const App = window.LocalApp;
  const config = App.config;
  const u = App.utils;
  const storage = App.storage;
  const components = App.components;
  const icons = App.icons;
  const {
    NAMED_COLORS,
    STANDARD_COLORS,
    OTHER_COLORS,
    OTHER_NAMES,
    GAME_PRESETS
  } = App.gameData;

  const FALLBACK_COLORS = STANDARD_COLORS.map(color => color.value);
  const RULE_LOOKUP_NAME = "Ruling";
  const RULE_LOOKUP_PLAYER_LIMIT = 8;
  const PLAYER_QUICK_COLOR = "__quick-add__";
  const QUICK_COLOR_OPTION = { name: "Quick Add", value: PLAYER_QUICK_COLOR };
  const DEFAULT_GAME_ID = "custom";
  const LEGACY_PREFERENCE_KEYS = {
    theme: "gameTimerTheme",
    timeFormat: "gameTimerTimeFormat",
    dateFormat: "gameTimerDateFormat",
    displayNameMode: "gameTimerDisplayNameMode",
    textType: "gameTimerTextType"
  };

  let root = null;
  let setupEntries = [];
  let selectedGameId = DEFAULT_GAME_ID;
  let isGameListCollapsed = true;
  let selectedPlayerColor = PLAYER_QUICK_COLOR;
  let selectedOtherColor = OTHER_COLORS.find(color => color.name === "Gray").value;
  let gameSearch = "";
  let selectedStarterId = null;
  let tickTimer = null;
  let autosaveTimer = null;
  let dragState = null;
  let turnOrderManuallyAdjusted = false;
  let sessionDensityFrame = null;
  let randomSelectAnimation = null;
  let randomSelectTimer = null;
  let state = emptySessionState();

  function emptySessionState(gameName) {
    return {
      view: "setup",
      gameName: gameName || "Custom Game",
      sessionId: "",
      historyId: "",
      demo: false,
      players: [],
      activeId: null,
      activeTurnStartedAt: null,
      currentStartedAt: null,
      currentElapsed: 0,
      isPaused: false,
      pauseStartedAt: null,
      pauses: [],
      gameStartedAt: null,
      firstTurnStartedAt: null,
      setupElapsed: 0,
      gameEndedAt: null
    };
  }

  function appState() {
    return storage.getState();
  }

  function prefs() {
    return appState().preferences.game;
  }

  function esc(value) {
    return u.escapeHtml(value);
  }

  function symbol(name) {
    return '<span class="glyph" aria-hidden="true">' + icons.markup(name) + "</span>";
  }

  function uid() {
    return u.uid("entry");
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  /* ---------- Game catalog (built-in presets plus library custom games) ---------- */

  function customGames() {
    return appState().workspace.library.customGames || [];
  }

  function allGames(includeExpansions) {
    return GAME_PRESETS.concat(customGames().map(game => Object.assign({ colors: [], custom: true }, game))).map(game => {
      const metadata = appState().workspace.library.games[game.id]?.metadata;
      if (!metadata?.catalog && !metadata?.setup && !metadata?.expansionOf) return game;
      const merged = Object.assign({}, game, metadata.catalog, metadata.setup);
      if (metadata?.expansionOf) merged.expansionOf = metadata.expansionOf;
      if (typeof merged.factions === "boolean" && merged.colors) merged.colors = merged.colors.map(color => Object.assign({}, color, { faction: merged.factions }));
      merged.maxPlayers = Math.max(merged.minPlayers, merged.maxPlayers);
      merged.maxMinutes = Math.max(merged.minMinutes, merged.maxMinutes);
      return merged;
    }).filter(game => includeExpansions || !game.expansionOf);
  }

  function gameById(id) {
    return allGames(true).find(game => game.id === id) || null;
  }

  function currentPreset() {
    return gameById(selectedGameId) || GAME_PRESETS[0];
  }

  function libraryEntry(gameId) {
    return appState().workspace.library.games[gameId] || null;
  }

  function parsePlayerCounts(text) {
    const counts = new Set();
    String(text || "").split(",").forEach(part => {
      const match = part.trim().match(/^(\d+)\s*(?:-\s*(\d+)|(\+))?$/);
      if (!match) return;
      const start = Number(match[1]);
      const end = match[3] ? Math.max(start, 20) : Number(match[2] || match[1]);
      for (let count = start; count <= Math.min(end, 20); count += 1) counts.add(count);
    });
    return counts;
  }

  function playerCountFit(game, count) {
    if (!game || !count || game.id === "custom") return { score: 0, label: "", key: "none" };
    if (count < game.minPlayers || count > game.maxPlayers) return { score: -2, label: "Doesn’t support " + count, key: "outside" };
    if (parsePlayerCounts(game.avoidPlayers).has(count)) return { score: -1, label: "Weak at " + count, key: "avoid" };
    if (parsePlayerCounts(game.bestPlayers).has(count)) return { score: 3, label: "Best at " + count, key: "best" };
    if (parsePlayerCounts(game.recommendedPlayers).has(count)) return { score: 2, label: "Good at " + count, key: "good" };
    return { score: 1, label: "Plays " + count, key: "plays" };
  }

  function turnOrderRuleForGame(game = currentPreset()) {
    return game?.turnOrder || null;
  }

  function turnOrderBadgeLabel(rule = turnOrderRuleForGame()) {
    return rule?.label || "Turn order rule";
  }

  function turnOrderSearchText(game) {
    const rule = turnOrderRuleForGame(game);
    if (!rule) return "";
    return ["turn order", rule.label, rule.note, rule.firstMode, ...(rule.defaultOthers || [])].filter(Boolean).join(" ");
  }

  function defaultOtherTimingNames(game = currentPreset()) {
    return turnOrderRuleForGame(game)?.defaultOthers || [];
  }

  function hasDefaultOtherTiming(game = currentPreset()) {
    return defaultOtherTimingNames(game).length > 0;
  }

  function usesOpenColorPool(game = currentPreset()) {
    return game?.openColorPool === true || (game?.openColorPool !== false && !game?.colors?.length);
  }

  function colorsForGame(game = currentPreset()) {
    const colors = usesOpenColorPool(game) ? STANDARD_COLORS : game.colors || [];
    return colors.map(color => typeof color === "string" ? { name: color, value: color } : color);
  }

  function selectedGameColors() {
    return colorsForGame();
  }

  function isNamedColorLabel(name) {
    const normalized = String(name || "").toLowerCase();
    return Object.keys(NAMED_COLORS).some(key => key.toLowerCase() === normalized);
  }

  function isFactionColorOption(color) {
    return Boolean(color && color.value !== PLAYER_QUICK_COLOR && (typeof color.faction === "boolean" ? color.faction : !isNamedColorLabel(color.name)));
  }

  function hasFactionColorOptions(colors = selectedGameColors()) {
    return colors.some(isFactionColorOption);
  }

  function hasKnownColorOptions() {
    return hasFactionColorOptions() || !usesOpenColorPool(currentPreset());
  }

  function playerColorOptions(colors = selectedGameColors()) {
    const options = colors.filter(color => color.name.toLowerCase() !== "silver");
    return hasKnownColorOptions() ? options : [...options, QUICK_COLOR_OPTION];
  }

  function colorName(value, colors = selectedGameColors()) {
    if (value === PLAYER_QUICK_COLOR) return QUICK_COLOR_OPTION.name;
    return (colors.find(color => color.value === value) || STANDARD_COLORS.find(color => color.value === value) || { name: "Custom" }).name;
  }

  function factionNameForSelection(colorValue = selectedPlayerColor) {
    if (colorValue === PLAYER_QUICK_COLOR) return "";
    const option = playerColorOptions().find(color => color.value === colorValue);
    return isFactionColorOption(option) ? option.name : "";
  }

  /* ---------- Formatting ---------- */

  function displayNameParts(entity) {
    const playerName = (entity?.name || "").trim() || "Unnamed";
    const factionName = (entity?.factionName || "").trim();
    if (factionName && prefs().displayNameMode === "faction") return { primary: factionName, secondary: playerName };
    return { primary: playerName, secondary: factionName };
  }

  function displayNameText(entity) {
    const names = displayNameParts(entity);
    return names.secondary ? `${names.primary}, ${names.secondary}` : names.primary;
  }

  function fmtClock(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function fmtUnits(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes || hours) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
  }

  function fmt(ms) {
    return prefs().timeFormat === "units" ? fmtUnits(ms) : fmtClock(ms);
  }

  function fmtDuration(ms) {
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes}m`;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  function fmtAxisTime(ms) {
    return fmtDuration(ms);
  }

  function formatDateStamp(timestamp) {
    const date = new Date(timestamp || Date.now());
    const day = String(date.getDate()).padStart(2, "0");
    const monthName = date.toLocaleString(undefined, { month: "long" });
    const monthShort = date.toLocaleString(undefined, { month: "short" });
    const numericMonth = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    if (prefs().dateFormat === "dmy") return `${day} ${monthShort} ${year}`;
    if (prefs().dateFormat === "ymd") return `${year}-${numericMonth}-${day}`;
    return `${monthName} ${date.getDate()}, ${year}`;
  }

  function gameTitleParts(name) {
    const text = String(name || "").trim();
    const match = text.match(/\s*\((\d{4})\)\s*$/);
    if (!match) return { title: text, year: "" };
    return { title: text.slice(0, match.index).trim(), year: match[1] };
  }

  function gameAccessibleName(name) {
    const { title, year } = gameTitleParts(name);
    return year ? `${title} ${year}` : title;
  }

  function gameTitleMarkup(name, className = "") {
    const { title, year } = gameTitleParts(name);
    const classes = ["game-title-line", className].filter(Boolean).join(" ");
    return `<span class="${esc(classes)}"><span class="game-title-name">${esc(title)}</span>${year ? `<span class="game-year-tag">${esc(year)}</span>` : ""}</span>`;
  }

  function gameRangeText(game) {
    const playerRange = game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers}-${game.maxPlayers}`;
    const weightValue = Number.isFinite(game.complexityWeight) ? game.complexityWeight.toFixed(2) : "??";
    const timeValue = game.minMinutes === game.maxMinutes ? `${game.minMinutes} min` : `${game.minMinutes}-${game.maxMinutes} min`;
    const recommendedValue = game.recommendedPlayers || playerRange;
    const bestValue = game.bestPlayers || game.recommendedPlayers || playerRange;
    const avoidValue = game.avoidPlayers && game.avoidPlayers !== "--" ? game.avoidPlayers : "None";
    if (prefs().textType === "emoji") {
      return `👥 ${playerRange}p • 👍 ${recommendedValue} • ⭐ ${bestValue} • ⚠️ ${avoidValue}\n🕰️ ${timeValue} • 🧠 ${weightValue}`;
    }
    return `${playerRange}p • Rec ${recommendedValue} • Best ${bestValue} • Avoid ${avoidValue}\n${timeValue} • Weight ${weightValue}`;
  }

  function gameSearchText(game) {
    const { title, year } = gameTitleParts(game.name);
    const factionText = hasFactionColorOptions(colorsForGame(game)) ? "faction faction-based factions" : "";
    const otherTimingText = hasDefaultOtherTiming(game) ? `other timing other-timing ${defaultOtherTimingNames(game).join(" ")}` : "";
    const entry = libraryEntry(game.id);
    const ownership = entry?.owned ? `owned own ${(entry.owners || []).join(" ")}` : "";
    return [game.name, title, year, game.id, factionText, otherTimingText, turnOrderSearchText(game), ownership, game.custom ? "custom added" : ""].filter(Boolean).join(" ").toLowerCase();
  }

  /* ---------- Placements and statistics (pure, work on live sessions and saved games) ---------- */

  function statsFor(player) {
    const durations = player.turns.map(turn => turn.duration);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    const count = durations.length;
    return {
      count,
      total,
      average: count ? total / count : 0,
      longest: count ? Math.max(...durations) : 0,
      shortest: count ? Math.min(...durations) : 0
    };
  }

  function placementLabel(value) {
    const rank = Number(value);
    if (!Number.isInteger(rank) || rank <= 0) return "";
    const mod100 = rank % 100;
    const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : rank % 10 === 1 ? "st" : rank % 10 === 2 ? "nd" : rank % 10 === 3 ? "rd" : "th";
    return `${rank}${suffix}`;
  }

  function placementNumber(player) {
    const rank = Number(player?.placement);
    return Number.isInteger(rank) && rank > 0 ? rank : null;
  }

  function placementMedal(player) {
    return { 1: "🥇", 2: "🥈", 3: "🥉" }[placementNumber(player)] || "";
  }

  function groupedPlacedPlayers(players) {
    const groups = new Map();
    players.forEach((player, index) => {
      const rank = placementNumber(player);
      if (!rank) return;
      if (!groups.has(rank)) groups.set(rank, { rank, players: [] });
      groups.get(rank).players.push({ player, index });
    });
    return [...groups.values()].sort((a, b) => a.rank - b.rank);
  }

  function normalizePlacementGroups(players, forceFromFirst = false) {
    const groups = groupedPlacedPlayers(players);
    let nextRank = forceFromFirst ? 1 : null;
    groups.forEach(group => {
      const rank = nextRank === null ? group.rank : forceFromFirst ? nextRank : Math.max(group.rank, nextRank);
      group.players.forEach(({ player }) => { player.placement = String(rank); });
      nextRank = rank + group.players.length;
    });
  }

  function autoCorrectPlacements(players) {
    const placedCount = players.filter(player => placementNumber(player)).length;
    if (!placedCount) return;
    normalizePlacementGroups(players, placedCount === players.length);
  }

  function sortPlayersByPlacement(players) {
    if (!players.some(player => placementNumber(player))) return players;
    return players
      .map((player, index) => ({ player, index, rank: placementNumber(player) }))
      .sort((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY) || a.index - b.index)
      .map(item => item.player);
  }

  function applyPlacement(game, id, placement) {
    const player = game.players.find(item => item.id === id && item.type === "player");
    if (!player) return false;
    player.placement = placement || "";
    autoCorrectPlacements(game.players.filter(item => item.type === "player"));
    return true;
  }

  function pauseTotal(game, now = Date.now()) {
    const recorded = game.pauses.reduce((total, pause) => total + pause.duration, 0);
    return recorded + (game.isPaused && game.pauseStartedAt ? now - game.pauseStartedAt : 0);
  }

  function setupTotal(game, now = Date.now()) {
    if (!game.gameStartedAt) return 0;
    if (game.firstTurnStartedAt) return game.setupElapsed;
    const end = game.gameEndedAt || now;
    return Math.max(0, end - game.gameStartedAt);
  }

  function gameTotals(game, ended = game.gameEndedAt || Date.now()) {
    const total = Math.max(0, ended - game.gameStartedAt);
    const paused = pauseTotal(game, ended);
    const setup = setupTotal(game, ended);
    return {
      total,
      paused,
      setup,
      play: Math.max(0, total - paused - setup),
      turns: game.players.reduce((sum, player) => sum + player.turns.length, 0)
    };
  }

  function computeAwards(game) {
    const people = game.players
      .filter(player => player.type === "player")
      .map(player => ({ player, stats: statsFor(player) }))
      .filter(item => item.stats.count > 0);
    const awards = { fastestAverage: null, slowestAverage: null, fastestTurn: null, slowestTurn: null };
    if (people.length > 1) {
      awards.fastestAverage = people.reduce((best, item) => item.stats.average < best.stats.average ? item : best).player.id;
      awards.slowestAverage = people.reduce((worst, item) => item.stats.average > worst.stats.average ? item : worst).player.id;
    }
    const allTurns = game.players
      .filter(player => player.type === "player")
      .flatMap(player => player.turns.map(turn => ({ playerId: player.id, duration: turn.duration })));
    if (allTurns.length > 1) {
      awards.fastestTurn = allTurns.reduce((best, item) => item.duration < best.duration ? item : best).playerId;
      awards.slowestTurn = allTurns.reduce((worst, item) => item.duration > worst.duration ? item : worst).playerId;
    }
    return awards;
  }

  function awardList(player, awards) {
    if (player.type !== "player") return [];
    const list = [];
    if (awards.fastestAverage === player.id) list.push(["🐇", "Fastest average"]);
    if (awards.slowestAverage === player.id) list.push(["🐢", "Slowest average"]);
    if (awards.fastestTurn === player.id) list.push(["🚀", "Fastest turn"]);
    if (awards.slowestTurn === player.id) list.push(["⌛", "Slowest turn"]);
    return list;
  }

  function awardBadges(player, awards) {
    return awardList(player, awards).map(([mark, label]) => `<span class="award" title="${esc(label)}" aria-label="${esc(label)}">${mark}</span>`).join("");
  }

  function turnBadges(turn, stats) {
    if (!stats.count || stats.count < 2) return "";
    const badges = [];
    if (turn.duration === stats.shortest) badges.push(["⚡", "Player fastest turn"]);
    if (turn.duration === stats.longest) badges.push(["⌛", "Player slowest turn"]);
    if (!badges.length) return "";
    return `<span class="turn-badges">${badges.map(([mark, label]) => `<span class="turn-award" title="${esc(label)}" aria-label="${esc(label)}">${mark}</span>`).join("")}</span>`;
  }

  function pauseSummaryRow(game) {
    return {
      id: "pause-summary",
      name: "Pause",
      type: "other",
      color: NAMED_COLORS.Black,
      factionName: "",
      turns: game.pauses.map(pause => ({ duration: pause.duration }))
    };
  }

  function clampTimelineSegment(segment, timelineStart, timelineEnd) {
    const start = Math.max(timelineStart, Math.min(timelineEnd, segment.start));
    const end = Math.max(start, Math.min(timelineEnd, segment.end));
    return Object.assign({}, segment, { start, end, wallDuration: Math.max(0, end - start) });
  }

  function timelineSegments(game, ended) {
    const timelineStart = game.gameStartedAt || ended;
    const timelineEnd = Math.max(timelineStart, ended);
    const segments = [];
    const setupEnd = Math.min(timelineEnd, game.firstTurnStartedAt || timelineStart + setupTotal(game, ended));
    if (setupEnd > timelineStart) {
      segments.push({ laneKey: "setup", type: "setup", label: "Setup", color: NAMED_COLORS.Gray, start: timelineStart, end: setupEnd, duration: setupEnd - timelineStart });
    }
    game.players.forEach(player => {
      const longestDuration = player.turns.reduce((max, turn) => Math.max(max, turn.duration || 0), 0);
      const hasMultipleTurns = player.turns.length > 1;
      player.turns.forEach((turn, index) => {
        const end = turn.endedAt || timelineStart;
        const duration = Math.max(0, turn.duration || 0);
        const start = turn.startedAt || Math.max(timelineStart, end - duration);
        const isLongest = hasMultipleTurns && duration > 0 && duration === longestDuration;
        segments.push({
          laneKey: `player:${player.id}`,
          type: "turn",
          label: displayNameText(player),
          color: player.color,
          start,
          end,
          duration,
          detail: isLongest ? `Longest · Turn ${index + 1}` : `Turn ${index + 1}`,
          isPlayerLongestTurn: isLongest
        });
      });
    });
    game.pauses.forEach((pause, index) => {
      const end = pause.end || timelineEnd;
      const duration = Math.max(0, pause.duration || 0);
      segments.push({ laneKey: "pause", type: "pause", label: "Pause", color: NAMED_COLORS.Black, start: pause.start || Math.max(timelineStart, end - duration), end, duration, detail: `Pause ${index + 1}` });
    });
    return segments
      .map(segment => clampTimelineSegment(segment, timelineStart, timelineEnd))
      .filter(segment => segment.wallDuration > 0)
      .sort((a, b) => a.start - b.start || (a.type === "pause" ? 1 : 0) - (b.type === "pause" ? 1 : 0));
  }

  function timelineLanes(game, segments) {
    const segmentKeys = new Set(segments.map(segment => segment.laneKey));
    const lanes = [];
    if (segmentKeys.has("setup")) lanes.push({ key: "setup", type: "setup", label: "Setup", color: NAMED_COLORS.Gray });
    game.players.forEach(player => {
      lanes.push({ key: `player:${player.id}`, type: player.type === "other" ? "other" : "player", label: displayNameText(player), color: player.color });
    });
    if (segmentKeys.has("pause")) lanes.push({ key: "pause", type: "pause", label: "Pause", color: NAMED_COLORS.Black });
    return lanes;
  }

  function timelineTicks(total) {
    const interval = total > 3 * 60 * 60 * 1000 ? 30 * 60 * 1000 : 15 * 60 * 1000;
    const safeTotal = Math.max(1, total);
    const ticks = [{ value: 0, label: fmtAxisTime(0), type: "start" }];
    for (let value = interval; value < safeTotal; value += interval) {
      if (safeTotal - value <= interval / 2) continue;
      ticks.push({ value, label: fmtAxisTime(value), type: "" });
    }
    ticks.push({ value: safeTotal, label: fmtAxisTime(safeTotal), type: "end" });
    return ticks;
  }

  function segmentMarkup(segment, timelineStart, total) {
    const left = ((segment.start - timelineStart) / total) * 100;
    const width = (segment.wallDuration / total) * 100;
    const label = `${segment.label} · ${fmt(segment.duration || segment.wallDuration)}`;
    const detail = segment.detail ? `${segment.detail}: ${label}` : label;
    return `<span class="timeline-segment is-${esc(segment.type)} ${segment.isPlayerLongestTurn ? "is-player-longest" : ""}" style="--start:${left.toFixed(3)}%; --width:${width.toFixed(3)}%; --lane:${esc(segment.color)}" title="${esc(detail)}"></span>`;
  }

  function timelineMarkup(game, ended) {
    const timelineStart = game.gameStartedAt || ended;
    const total = Math.max(1, ended - timelineStart);
    const segments = timelineSegments(game, ended);
    if (!segments.length) return "";
    const lanes = timelineLanes(game, segments);
    const ticks = timelineTicks(total);
    const typeRank = type => type === "pause" ? 2 : type === "setup" ? 0 : 1;
    const combined = segments.slice().sort((a, b) => a.start - b.start || typeRank(a.type) - typeRank(b.type));
    const lane = (key, type, label, color, laneSegments) => `
      <div class="timeline-lane is-${esc(type)}" style="--lane:${esc(color)}">
        <div class="timeline-lane-label"><span class="dot" style="--accent:${esc(color)}"></span><span>${esc(label)}</span></div>
        <div class="timeline-lane-track" role="img" aria-label="${esc(label)}: ${laneSegments.length} ${laneSegments.length === 1 ? "segment" : "segments"}">${laneSegments.map(segment => segmentMarkup(segment, timelineStart, total)).join("")}</div>
      </div>`;
    return `
      <section class="panel timeline-panel" aria-label="Game timeline">
        <div class="panel-head"><h3>Timeline</h3><span class="count-pill">${esc(fmtDuration(total))}</span></div>
        <div class="timeline-scroll">
          <div class="timeline-lanes">
            ${lane("combined", "combined", "Combined", "#94a3b8", combined)}
            ${lanes.map(item => lane(item.key, item.type, item.label, item.color, segments.filter(segment => segment.laneKey === item.key))).join("")}
            <div class="timeline-scale" aria-hidden="true"><span></span><span class="timeline-scale-track">${ticks.map(tick => `<span class="timeline-tick ${tick.type ? `is-${esc(tick.type)}` : ""}" style="--x:${((tick.value / total) * 100).toFixed(3)}%">${esc(tick.label)}</span>`).join("")}</span></div>
          </div>
        </div>
      </section>`;
  }

  function placementSelectMarkup(player, playerCount, interactive) {
    if (player.type !== "player") return "";
    const selected = String(player.placement || "");
    if (!interactive) return selected ? `<span class="placement-chip">${esc(placementLabel(selected))}</span>` : "";
    const options = ['<option value="">Place</option>'];
    for (let rank = 1; rank <= playerCount; rank += 1) {
      options.push(`<option value="${rank}" ${String(rank) === selected ? "selected" : ""}>${esc(placementLabel(rank))}</option>`);
    }
    return `<select class="placement-select" data-placement-id="${esc(player.id)}" aria-label="Placement for ${esc(displayNameText(player))}">${options.join("")}</select>`;
  }

  function summaryTable(game, players, awards, countLabel, interactive) {
    if (!players.length) return `<p class="empty-note">No entries</p>`;
    const playerCount = game.players.filter(player => player.type === "player").length;
    return `
      <div class="table-wrap">
        <table class="stats-table">
          <thead><tr><th scope="col">Name</th><th scope="col">${esc(countLabel)}</th><th scope="col">Total</th><th scope="col">Avg</th><th scope="col">Long</th><th scope="col">Short</th></tr></thead>
          <tbody>
            ${players.map(player => {
              const stats = statsFor(player);
              const names = displayNameParts(player);
              const medal = placementMedal(player);
              return `
                <tr class="${player.type === "player" && placementNumber(player) === 1 ? "is-winner" : ""}">
                  <th scope="row" data-label="Name">
                    <span class="name-cell">
                      <span class="dot" style="--accent:${esc(player.color)}"></span>
                      <span class="name-text"><strong>${esc(names.primary)}</strong>${names.secondary ? `<span>${esc(names.secondary)}</span>` : ""}</span>
                      <span class="name-extras">
                        ${placementSelectMarkup(player, playerCount, interactive)}
                        <span class="awards">${medal ? `<span class="award medal" title="${esc(placementLabel(player.placement))} place">${medal}</span>` : ""}${awardBadges(player, awards)}</span>
                      </span>
                    </span>
                  </th>
                  <td data-label="${esc(countLabel)}">${stats.count}</td>
                  <td data-label="Total">${fmt(stats.total)}</td>
                  <td data-label="Avg">${stats.count ? fmt(stats.average) : "--"}</td>
                  <td data-label="Long" class="${stats.count > 1 ? "is-longest" : ""}">${stats.count ? fmt(stats.longest) : "--"}</td>
                  <td data-label="Short">${stats.count ? fmt(stats.shortest) : "--"}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function summaryMarkup(game, options) {
    const settings = Object.assign({ interactive: true }, options || {});
    const ended = game.gameEndedAt || Date.now();
    const totals = gameTotals(game, ended);
    const awards = computeAwards(game);
    const people = sortPlayersByPlacement(game.players.filter(player => player.type === "player"));
    const others = [pauseSummaryRow(game), ...game.players.filter(player => player.type === "other")];
    const winners = people.filter(player => placementNumber(player) === 1);
    return `
      <div class="summary-body">
        <header class="capture-heading"><span class="eyebrow">Game Timer · ${esc(formatDateStamp(ended))}</span>${gameTitleMarkup(game.gameName, "capture-title")}</header>
        ${winners.length ? `<div class="winner-banner">${symbol("trophy")}<span><span class="eyebrow">${winners.length > 1 ? "Winners" : "Winner"}</span><strong>${winners.map(player => esc(displayNameText(player))).join(" & ")}</strong></span></div>` : ""}
        <section class="kpi-row" aria-label="Totals">
          <div class="kpi"><span class="eyebrow">Game</span><strong>${fmt(totals.total)}</strong></div>
          <div class="kpi"><span class="eyebrow">Setup</span><strong>${fmt(totals.setup)}</strong></div>
          <div class="kpi"><span class="eyebrow">Play</span><strong>${fmt(totals.play)}</strong></div>
          <div class="kpi"><span class="eyebrow">Pause</span><strong>${fmt(totals.paused)}</strong></div>
          <div class="kpi"><span class="eyebrow">Turns</span><strong>${totals.turns}</strong></div>
        </section>
        ${timelineMarkup(game, ended)}
        <section class="summary-grid">
          <section class="panel"><div class="panel-head"><h3>Players</h3>${settings.interactive ? `<span class="panel-note">Set placements to crown a winner</span>` : ""}</div>${summaryTable(game, people, awards, "Turns", settings.interactive)}</section>
          <section class="panel"><div class="panel-head"><h3>Other</h3></div>${summaryTable(game, others, awards, "Times", false)}</section>
        </section>
      </div>`;
  }

  function summaryShareRow(player, awards, countLabel) {
    const stats = statsFor(player);
    const parts = [
      `${stats.count} ${countLabel.toLowerCase()}`,
      `total ${fmt(stats.total)}`,
      `avg ${stats.count ? fmt(stats.average) : "--"}`,
      `long ${stats.count ? fmt(stats.longest) : "--"}`,
      `short ${stats.count ? fmt(stats.shortest) : "--"}`
    ];
    const placement = placementLabel(player.placement);
    if (placement) parts.unshift(placement);
    const labels = awardList(player, awards).map(item => item[1]);
    if (labels.length) parts.push(labels.join(", "));
    return `- ${displayNameText(player)}: ${parts.join(" | ")}`;
  }

  function summarySharePayload(game) {
    const ended = game.gameEndedAt || Date.now();
    const totals = gameTotals(game, ended);
    const awards = computeAwards(game);
    const people = sortPlayersByPlacement(game.players.filter(player => player.type === "player"));
    const others = [pauseSummaryRow(game), ...game.players.filter(player => player.type === "other")];
    const name = gameAccessibleName(game.gameName);
    const fileSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "game";
    const lines = [
      `Final Stats for ${name} on ${formatDateStamp(ended)}`,
      "",
      `Game: ${fmt(totals.total)}`,
      `Setup: ${fmt(totals.setup)}`,
      `Play: ${fmt(totals.play)}`,
      `Pause: ${fmt(totals.paused)}`,
      `Turns: ${totals.turns}`,
      "",
      "Players",
      ...(people.length ? people.map(player => summaryShareRow(player, awards, "Turns")) : ["- No players"]),
      "",
      "Other",
      ...others.map(player => summaryShareRow(player, awards, "Times"))
    ];
    return { title: `Game Timer Stats: ${name}`, text: lines.join("\n"), imageName: `game-timer-${fileSlug}-${new Date(ended).toISOString().slice(0, 10)}.png` };
  }

  /* ---------- Sharing ---------- */

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch (error) { /* fall back below */ }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand?.("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard unavailable");
  }

  function documentCssText() {
    return Array.from(document.styleSheets).map(sheet => {
      try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join("\n"); } catch (error) { return ""; }
    }).join("\n");
  }

  const CAPTURE_TOKENS = ["--bg", "--surface", "--surface-2", "--surface-3", "--text", "--muted", "--faint", "--line", "--line-strong", "--shadow", "--shadow-small", "--accent", "--accent-strong", "--accent-soft", "--accent-2", "--accent-2-soft", "--success", "--warning", "--danger", "--danger-soft", "--radius", "--radius-small", "--text-scale"];

  function imageFromSource(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  async function screenshotBlob(target) {
    const rect = target.getBoundingClientRect();
    const width = Math.ceil(Math.max(target.scrollWidth, rect.width, 320));
    const height = Math.ceil(Math.max(target.scrollHeight, rect.height, 1));
    const rootStyle = getComputedStyle(document.documentElement);
    const background = rootStyle.getPropertyValue("--bg").trim() || "#f5f3ed";
    const clone = target.cloneNode(true);
    clone.querySelectorAll("select").forEach(select => {
      const chip = document.createElement("span");
      chip.className = "placement-chip";
      chip.textContent = select.value ? placementLabel(select.value) : "";
      select.replaceWith(chip);
    });
    clone.style.width = `${width}px`;
    clone.style.margin = "0";
    const wrapper = document.createElement("div");
    wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    wrapper.className = "capture-root";
    wrapper.style.cssText = CAPTURE_TOKENS.map(token => `${token}:${rootStyle.getPropertyValue(token)}`).join(";") + `;width:${width}px;min-height:${height}px;padding:16px;background:${background};color:${rootStyle.getPropertyValue("--text")};font-family:Helvetica,Arial,sans-serif;font-size:${rootStyle.fontSize}`;
    const style = document.createElement("style");
    style.textContent = documentCssText();
    wrapper.append(style, clone);
    const markup = new XMLSerializer().serializeToString(wrapper);
    const fullWidth = width + 32;
    const fullHeight = height + 32;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fullWidth}" height="${fullHeight}" viewBox="0 0 ${fullWidth} ${fullHeight}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
    const image = await imageFromSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(fullWidth * scale);
    canvas.height = Math.ceil(fullHeight * scale);
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = background;
    context.fillRect(0, 0, fullWidth, fullHeight);
    context.drawImage(image, 0, 0, fullWidth, fullHeight);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image export failed")), "image/png"));
  }

  function shareDialogBody(html) {
    $("#shareDialogBody").innerHTML = html;
  }

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function openShare(game, captureTarget, trigger) {
    const payload = summarySharePayload(game);
    shareDialogBody(`
      <p class="setting-note">Share a text summary or an image of the statistics.</p>
      <div class="share-choice-grid">
        <button class="button share-choice" type="button" data-share-kind="text" data-shortcut="T">${symbol("notes")}<span>Text</span></button>
        <button class="button share-choice" type="button" data-share-kind="image" data-shortcut="I">${symbol("share")}<span>Image</span></button>
      </div>
      <p class="inline-status" data-share-status role="status" aria-live="polite" hidden></p>`);
    const dialog = components.openDialog("#shareDialog", { trigger, focus: "[data-share-kind='text']" });
    emit("app:viewrendered");
    dialog.querySelector("[data-share-kind='text']").onclick = () => shareText(payload);
    dialog.querySelector("[data-share-kind='image']").onclick = () => shareImage(payload, captureTarget);
  }

  function shareStatus(message) {
    const status = $("[data-share-status]");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
  }

  async function shareText(payload) {
    try {
      if (navigator.share) {
        await navigator.share({ title: payload.title, text: payload.text });
        components.closeDialog("#shareDialog", "shared");
        return;
      }
      await copyText(payload.text);
      components.closeDialog("#shareDialog", "copied");
      components.toast("The statistics summary was copied.", { title: "Copied", kind: "success" });
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        await copyText(payload.text);
        components.closeDialog("#shareDialog", "copied");
        components.toast("The statistics summary was copied.", { title: "Copied", kind: "success" });
      } catch (copyError) {
        shareDialogBody(`<p class="setting-note">Copying is blocked here. Select the text below to copy it.</p><textarea class="share-text" readonly aria-label="${esc(payload.title)}">${esc(payload.text)}</textarea>`);
        $("#shareDialogBody textarea")?.select();
      }
    }
  }

  async function shareImage(payload, captureTarget) {
    shareStatus("Creating image…");
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const blob = await screenshotBlob(captureTarget);
      const file = new File([blob], payload.imageName, { type: blob.type });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: payload.title, text: payload.text, files: [file] });
          components.closeDialog("#shareDialog", "shared");
          return;
        } catch (error) {
          if (error?.name === "AbortError") { shareStatus(""); return; }
        }
      }
      try {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard unavailable");
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        components.closeDialog("#shareDialog", "copied");
        components.toast("The statistics image was copied.", { title: "Image copied", kind: "success" });
      } catch (error) {
        const url = URL.createObjectURL(blob);
        shareDialogBody(`<p class="setting-note">Press and hold or right-click the image to save or copy it.</p><img class="share-image" src="${esc(url)}" alt="${esc(payload.title)}">`);
        $("#shareDialog").addEventListener("close", () => URL.revokeObjectURL(url), { once: true });
      }
    } catch (error) {
      shareStatus("The image could not be created in this browser. Try Text instead.");
    }
  }

  /* ---------- Setup ---------- */

  function people() {
    return appState().workspace.people;
  }

  function personColor(name) {
    return people().find(person => person.name.toLowerCase() === String(name).toLowerCase())?.color || "";
  }

  function colorDistance(a, b) {
    const first = u.hexToRgb(a);
    const second = u.hexToRgb(b);
    if (!first || !second) return Number.MAX_SAFE_INTEGER;
    return (first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2;
  }

  function colorForIndex(index) {
    const colors = selectedGameColors();
    return colors[index % colors.length]?.value || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  function playerColorForName(name) {
    if (selectedPlayerColor !== PLAYER_QUICK_COLOR) return selectedPlayerColor;
    const preferred = personColor(name);
    const playerCount = setupEntries.filter(entry => entry.type === "player").length;
    if (!preferred) return colorForIndex(playerCount);
    if (usesOpenColorPool(currentPreset())) return preferred;
    const used = new Set(setupEntries.map(entry => entry.color));
    const candidates = selectedGameColors().filter(color => !used.has(color.value));
    if (!candidates.length) return colorForIndex(playerCount);
    return candidates.reduce((best, color) => colorDistance(color.value, preferred) < colorDistance(best.value, preferred) ? color : best).value;
  }

  function realSetupPlayerCount() {
    return setupEntries.filter(entry => entry.type === "player" && entry.name.trim()).length;
  }

  function isRuleLookupEntry(entry) {
    return Boolean(entry && entry.type === "other" && entry.name.trim().toLowerCase() === RULE_LOOKUP_NAME.toLowerCase());
  }

  function isTurnOrderDefaultEntry(entry) {
    return Boolean(entry?.turnOrderDefault);
  }

  function normalizeRuleLookupEntry(entry, isDefault = entry.ruleLookupDefault !== false) {
    entry.locked = true;
    entry.name = RULE_LOOKUP_NAME;
    entry.type = "other";
    entry.color = NAMED_COLORS.White;
    entry.factionName = "";
    entry.ruleLookupDefault = Boolean(isDefault);
    entry.turnOrderDefault = false;
    return entry;
  }

  function defaultOtherColorForName(name) {
    if (String(name || "").toLowerCase() === RULE_LOOKUP_NAME.toLowerCase()) return NAMED_COLORS.White;
    return OTHER_COLORS.find(color => color.name === "Gray")?.value || selectedOtherColor;
  }

  function addEntry(name = "", type = "player", color = colorForIndex(setupEntries.filter(entry => entry.type === "player").length), locked = false, factionName = "", ruleLookupDefault = false) {
    const entry = { id: uid(), name, type, color, locked, factionName: type === "player" ? factionName : "", ruleLookupDefault, turnOrderDefault: false };
    setupEntries.push(entry);
    return entry;
  }

  function syncTurnOrderDefaultOthers(game = currentPreset()) {
    const rule = turnOrderRuleForGame(game);
    const defaultNames = new Set((rule?.defaultOthers || []).map(name => name.toLowerCase()));
    setupEntries = setupEntries.filter(entry => !isTurnOrderDefaultEntry(entry) || defaultNames.has(entry.name.trim().toLowerCase()));
    (rule?.defaultOthers || []).forEach(name => {
      const exists = setupEntries.some(entry => entry.type === "other" && entry.name.trim().toLowerCase() === name.toLowerCase());
      if (exists) return;
      const entry = addEntry(name, "other", defaultOtherColorForName(name), false, "", false);
      entry.turnOrderDefault = true;
    });
  }

  function turnOrderRankForEntry(entry, game = currentPreset()) {
    const colors = colorsForGame(game);
    const normalizedFaction = String(entry.factionName || "").toLowerCase();
    const colorIndex = colors.findIndex(color => (normalizedFaction && color.name.toLowerCase() === normalizedFaction) || color.value === entry.color);
    return colorIndex >= 0 ? colorIndex : Number.MAX_SAFE_INTEGER;
  }

  function orderedPlayersByTurnRule(players, game = currentPreset()) {
    return players
      .map((entry, index) => ({ entry, index, rank: turnOrderRankForEntry(entry, game) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(item => item.entry);
  }

  function sortSetupPlayersByTurnRule(game = currentPreset()) {
    const players = setupEntries.filter(entry => entry.type === "player");
    const others = setupEntries.filter(entry => entry.type !== "player");
    setupEntries = [...orderedPlayersByTurnRule(players, game), ...others];
  }

  function applyGameTurnOrderDefaults({ sortPlayers = true, syncOthers = true } = {}) {
    const game = currentPreset();
    const rule = turnOrderRuleForGame(game);
    if (syncOthers) syncTurnOrderDefaultOthers(game);
    if (sortPlayers && rule?.autoSortFactions && !turnOrderManuallyAdjusted) sortSetupPlayersByTurnRule(game);
  }

  function firstPlayerByTurnRule(realPlayers, game = currentPreset()) {
    const rule = turnOrderRuleForGame(game);
    if (!rule) return null;
    if (rule.firstMode === "faction-order") return turnOrderManuallyAdjusted ? realPlayers[0] || null : orderedPlayersByTurnRule(realPlayers, game)[0] || null;
    if (rule.firstMode === "current-order") return realPlayers[0] || null;
    return null;
  }

  function usesRandomAllTurnOrder(game = currentPreset()) {
    return turnOrderRuleForGame(game)?.firstMode === "random-all";
  }

  function ensureRuleLookup() {
    const existing = setupEntries.find(isRuleLookupEntry);
    if (realSetupPlayerCount() >= RULE_LOOKUP_PLAYER_LIMIT) {
      setupEntries = setupEntries.filter(entry => !isRuleLookupEntry(entry) || entry.ruleLookupDefault === false);
      const manual = setupEntries.find(isRuleLookupEntry);
      return manual ? normalizeRuleLookupEntry(manual, false) : null;
    }
    if (existing) {
      setupEntries = setupEntries.filter(entry => !isRuleLookupEntry(entry) || entry.id === existing.id);
      return normalizeRuleLookupEntry(existing, existing.ruleLookupDefault !== false);
    }
    const entry = { id: uid(), name: RULE_LOOKUP_NAME, type: "other", color: NAMED_COLORS.White, locked: true, factionName: "", ruleLookupDefault: true, turnOrderDefault: false };
    setupEntries.push(entry);
    return entry;
  }

  function addName(name, color = playerColorForName(name), factionName = factionNameForSelection()) {
    const exists = setupEntries.some(entry => entry.name.trim().toLowerCase() === name.toLowerCase());
    if (!exists) addEntry(name, "player", color, false, factionName);
    if (!exists && selectedPlayerColor !== PLAYER_QUICK_COLOR) {
      const used = new Set(setupEntries.filter(entry => entry.type === "player").map(entry => entry.color));
      const options = playerColorOptions();
      const start = options.findIndex(option => option.value === selectedPlayerColor);
      const next = options.slice(start + 1).concat(options.slice(0, start + 1)).find(option => !used.has(option.value));
      if (next) selectedPlayerColor = next.value;
    }
    applyGameTurnOrderDefaults({ syncOthers: false });
    selectedStarterId = null;
    render();
  }

  function addOther(name) {
    const exists = setupEntries.some(entry => entry.type === "other" && entry.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) return;
    const isRuleLookup = name.toLowerCase() === RULE_LOOKUP_NAME.toLowerCase();
    const entry = addEntry(name, "other", isRuleLookup ? NAMED_COLORS.White : selectedOtherColor, isRuleLookup, "", false);
    selectedStarterId = null;
    render();
    requestAnimationFrame(() => root.querySelector(`input[data-id="${entry.id}"][data-field="name"]`)?.focus());
  }

  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffled(values) {
    const copy = values.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function randomizeColorsForGame(game) {
    const previous = selectedGameId;
    selectedGameId = game.id;
    const colors = playerColorOptions(colorsForGame(game)).filter(color => color.value !== PLAYER_QUICK_COLOR);
    selectedGameId = previous;
    return colors;
  }

  function randomizePlayersForGame(game) {
    clearRandomSelectAnimation();
    const colors = shuffled(randomizeColorsForGame(game));
    const names = people().map(person => person.name);
    const maxPlayers = Math.min(game.maxPlayers, names.length, colors.length);
    const minPlayers = Math.min(game.minPlayers, maxPlayers);
    const playerCount = maxPlayers > 0 ? randomInteger(minPlayers, maxPlayers) : 0;
    if (!playerCount) {
      components.toast("Add people in Library → People to randomize players.", { title: "No people yet", kind: "info" });
      return;
    }
    selectedGameId = game.id;
    state.gameName = game.name;
    gameSearch = "";
    isGameListCollapsed = true;
    selectedPlayerColor = PLAYER_QUICK_COLOR;
    selectedOtherColor = OTHER_COLORS.find(color => color.name === "Gray").value;
    selectedStarterId = null;
    setupEntries = [];
    shuffled(names).slice(0, playerCount).forEach((name, index) => {
      const color = colors[index];
      addEntry(name, "player", usesOpenColorPool(game) ? (personColor(name) || color.value) : color.value, false, isFactionColorOption(color) ? color.name : "");
    });
    turnOrderManuallyAdjusted = false;
    ensureRuleLookup();
    applyGameTurnOrderDefaults();
    render();
  }

  function randomizeSetup() {
    const filter = appState().modules.play.gameFilter;
    const pool = setupGames().filter(game => game.id !== "custom" && (filter === "all" || !game.custom));
    const games = pool.length ? pool : GAME_PRESETS.filter(game => game.id !== "custom");
    randomizePlayersForGame(games[randomInteger(0, games.length - 1)]);
  }

  function selectGame(gameId, options) {
    clearRandomSelectAnimation();
    if (!gameById(gameId)) return;
    const isSwitchingGames = gameId !== selectedGameId;
    selectedGameId = gameId;
    state.gameName = currentPreset().name;
    selectedPlayerColor = PLAYER_QUICK_COLOR;
    isGameListCollapsed = true;
    if (isSwitchingGames && !(options && options.keepPlayers)) {
      setupEntries = setupEntries.filter(entry => entry.type !== "player");
      turnOrderManuallyAdjusted = false;
      selectedStarterId = null;
      ensureRuleLookup();
    }
    applyGameTurnOrderDefaults({ sortPlayers: false });
    render();
  }

  function clearTurnOrder() {
    clearRandomSelectAnimation();
    setupEntries = setupEntries.filter(entry => entry.type !== "player");
    turnOrderManuallyAdjusted = false;
    selectedStarterId = null;
    ensureRuleLookup();
    applyGameTurnOrderDefaults({ sortPlayers: false });
    render();
  }

  function resetStartPage() {
    clearRandomSelectAnimation();
    selectedGameId = DEFAULT_GAME_ID;
    state.gameName = currentPreset().name;
    gameSearch = "";
    isGameListCollapsed = true;
    selectedPlayerColor = PLAYER_QUICK_COLOR;
    selectedOtherColor = OTHER_COLORS.find(color => color.name === "Gray").value;
    selectedStarterId = null;
    setupEntries = [];
    turnOrderManuallyAdjusted = false;
    ensureRuleLookup();
    applyGameTurnOrderDefaults({ sortPlayers: false });
    render();
  }

  function removeEntry(id) {
    const entry = setupEntries.find(item => item.id === id);
    if (entry?.locked) return;
    setupEntries = setupEntries.filter(item => item.id !== id);
    ensureRuleLookup();
    if (selectedStarterId === id) selectedStarterId = null;
    render();
  }

  function updateEntry(id, patch) {
    const entry = setupEntries.find(item => item.id === id);
    if (!entry) return;
    if (entry.locked) {
      if (patch.color) entry.color = patch.color;
      return;
    }
    Object.assign(entry, patch);
  }

  function clearRandomSelectAnimation() {
    if (randomSelectTimer) {
      clearInterval(randomSelectTimer);
      randomSelectTimer = null;
    }
    randomSelectAnimation = null;
  }

  function startRandomSelectAnimation({ finalIds, candidatePool, ticksPerLock }) {
    const reduce = document.documentElement.dataset.motion === "reduce";
    if (reduce) {
      selectedStarterId = finalIds[0];
      render();
      return;
    }
    randomSelectAnimation = { finalIds, candidatePool, lockedCount: 0, tickInSlot: 0, flickerSeed: 0, justLocked: false, singleMode: finalIds.length === 1 };
    randomSelectTimer = setInterval(() => {
      const anim = randomSelectAnimation;
      if (!anim) { clearRandomSelectAnimation(); return; }
      anim.flickerSeed += 1;
      anim.tickInSlot += 1;
      anim.justLocked = false;
      if (anim.tickInSlot >= ticksPerLock) {
        anim.tickInSlot = 0;
        anim.lockedCount += 1;
        anim.justLocked = true;
        if (anim.lockedCount >= anim.finalIds.length) {
          const starterId = anim.finalIds[0];
          clearRandomSelectAnimation();
          selectedStarterId = starterId;
          App.sessionAids?.cue("pick");
          render();
          return;
        }
      }
      renderRosterOnly();
    }, 70);
    render();
  }

  function pickFirstPlayer() {
    const realPlayers = setupEntries.filter(entry => entry.type === "player" && entry.name.trim());
    if (!realPlayers.length) return;
    clearRandomSelectAnimation();
    if (usesRandomAllTurnOrder()) {
      const shuffledPlayers = shuffled(realPlayers);
      const others = setupEntries.filter(entry => !(entry.type === "player" && entry.name.trim()));
      setupEntries = [...shuffledPlayers, ...others];
      turnOrderManuallyAdjusted = true;
      selectedStarterId = null;
      if (shuffledPlayers.length <= 1) {
        selectedStarterId = shuffledPlayers[0]?.id || null;
        render();
        return;
      }
      const finalIds = shuffledPlayers.map(player => player.id);
      startRandomSelectAnimation({ finalIds, candidatePool: finalIds.slice(), ticksPerLock: 8 });
      return;
    }
    const picked = firstPlayerByTurnRule(realPlayers) || realPlayers[Math.floor(Math.random() * realPlayers.length)];
    const index = setupEntries.findIndex(entry => entry.id === picked.id);
    if (index > 0) setupEntries = setupEntries.slice(index).concat(setupEntries.slice(0, index));
    selectedStarterId = null;
    if (realPlayers.length <= 1) {
      selectedStarterId = picked.id;
      render();
      return;
    }
    startRandomSelectAnimation({ finalIds: [picked.id], candidatePool: realPlayers.map(player => player.id), ticksPerLock: 16 });
  }

  /* ---------- Session ---------- */

  function startGame() {
    clearRandomSelectAnimation();
    applyGameTurnOrderDefaults({ syncOthers: false });
    ensureRuleLookup();
    const realPlayers = setupEntries.filter(entry => entry.type === "player" && entry.name.trim());
    if (!realPlayers.length) return;
    const orderedEntries = [...setupEntries.filter(entry => entry.type === "player"), ...setupEntries.filter(entry => entry.type === "other")];
    const players = orderedEntries.filter(entry => entry.name.trim()).map(entry => ({
      id: entry.id,
      name: entry.name.trim(),
      type: entry.type,
      color: entry.color,
      factionName: entry.factionName || "",
      ruleLookupDefault: entry.ruleLookupDefault || false,
      turnOrderDefault: entry.turnOrderDefault || false,
      placement: "",
      turns: []
    }));
    state = Object.assign(emptySessionState(currentPreset().name), {
      view: "game",
      sessionId: u.uid("game"),
      demo: prefs().demoMode,
      players,
      gameStartedAt: Date.now()
    });
    if (prefs().demoMode) simulateFullGame(false);
    else render();
    App.sessionAids?.cue("start");
  }

  function getPlayer(id) {
    return state.players.find(player => player.id === id);
  }

  function activeElapsed(now = Date.now()) {
    if (!state.activeId) return 0;
    const running = !state.isPaused && state.currentStartedAt ? now - state.currentStartedAt : 0;
    return state.currentElapsed + running;
  }

  function markFirstTurnStarted(now = Date.now()) {
    if (state.firstTurnStartedAt || !state.gameStartedAt) return;
    state.firstTurnStartedAt = now;
    state.setupElapsed = Math.max(0, now - state.gameStartedAt);
  }

  function beginPause(now = Date.now()) {
    if (state.isPaused) return;
    if (state.activeId && state.currentStartedAt) {
      state.currentElapsed += now - state.currentStartedAt;
      state.currentStartedAt = null;
    }
    state.isPaused = true;
    state.pauseStartedAt = now;
    App.sessionAids?.cue("pause");
    render();
  }

  function endPause(now = Date.now(), resumeActive = true) {
    if (!state.isPaused) return;
    state.pauses.push({ start: state.pauseStartedAt, end: now, duration: Math.max(0, now - state.pauseStartedAt) });
    state.isPaused = false;
    state.pauseStartedAt = null;
    if (resumeActive && state.activeId) state.currentStartedAt = now;
  }

  function togglePause() {
    if (state.view !== "game") return;
    const now = Date.now();
    if (state.isPaused) {
      endPause(now, true);
      App.sessionAids?.cue("resume");
      render();
    } else {
      beginPause(now);
    }
  }

  function finishCurrentTurn(now = Date.now()) {
    if (!state.activeId) return;
    if (state.isPaused) endPause(now, false);
    const player = getPlayer(state.activeId);
    const elapsed = activeElapsed(now);
    if (player && elapsed >= 0) {
      player.turns.push({ startedAt: state.activeTurnStartedAt || Math.max(state.gameStartedAt || now, now - elapsed), duration: elapsed, endedAt: now });
    }
    state.activeId = null;
    state.activeTurnStartedAt = null;
    state.currentStartedAt = null;
    state.currentElapsed = 0;
  }

  function beginTurn(player, now) {
    markFirstTurnStarted(now);
    state.activeId = player.id;
    state.activeTurnStartedAt = now;
    state.currentElapsed = 0;
    state.currentStartedAt = now;
    App.sessionAids?.turnStarted(player);
    render();
  }

  function startTurn(id) {
    const now = Date.now();
    if (state.activeId === id) {
      togglePause();
      return;
    }
    if (state.activeId) finishCurrentTurn(now);
    if (state.isPaused) endPause(now, false);
    const player = getPlayer(id);
    if (player) beginTurn(player, now);
  }

  function autoAdvance() {
    if (state.view !== "game") return;
    const turnPlayers = state.players.filter(player => player.type === "player");
    if (!turnPlayers.length) return;
    const now = Date.now();
    const activeIndex = turnPlayers.findIndex(player => player.id === state.activeId);
    if (state.activeId) finishCurrentTurn(now);
    if (state.isPaused) endPause(now, false);
    beginTurn(turnPlayers[activeIndex >= 0 ? (activeIndex + 1) % turnPlayers.length : 0], now);
  }

  function historyRecord(game) {
    return {
      id: game.historyId || game.sessionId || u.uid("game"),
      gameId: selectedGameId,
      gameName: game.gameName,
      gameStartedAt: game.gameStartedAt,
      firstTurnStartedAt: game.firstTurnStartedAt,
      setupElapsed: game.setupElapsed,
      gameEndedAt: game.gameEndedAt,
      players: u.clone(game.players),
      pauses: u.clone(game.pauses)
    };
  }

  function saveToHistory() {
    if (state.demo || !state.gameEndedAt) return;
    const record = historyRecord(state);
    state.historyId = record.id;
    storage.mutate(next => {
      next.workspace.history = [record].concat(next.workspace.history.filter(item => item.id !== record.id));
    }, { reason: "history-save" });
    emit("app:gamechange");
  }

  function endGame() {
    if (state.view !== "game") return;
    const now = Date.now();
    if (state.isPaused) endPause(now, false);
    if (state.activeId) finishCurrentTurn(now);
    state.gameEndedAt = now;
    state.view = "summary";
    saveToHistory();
    App.sessionAids?.cue("end");
    render();
    if (!state.demo) components.toast("Saved to History. Set placements to record the winner.", { title: "Game over", kind: "success" });
  }

  function setPlayerPlacement(id, placement) {
    if (!applyPlacement(state, id, placement)) return;
    if (state.historyId) {
      const players = u.clone(state.players);
      storage.mutate(next => {
        const record = next.workspace.history.find(item => item.id === state.historyId);
        if (record) record.players = players;
      }, { reason: "history-placement" });
      emit("app:gamechange");
    }
    render();
  }

  function resetToSetup() {
    if (state.players.length) {
      setupEntries = state.players.map((player, index) => ({
        id: uid(),
        name: player.name,
        type: player.type,
        color: player.color || colorForIndex(index),
        locked: player.type === "other" && player.name.trim().toLowerCase() === RULE_LOOKUP_NAME.toLowerCase(),
        factionName: player.factionName || "",
        ruleLookupDefault: player.ruleLookupDefault || false,
        turnOrderDefault: player.turnOrderDefault || false
      }));
    }
    ensureRuleLookup();
    applyGameTurnOrderDefaults({ sortPlayers: false });
    selectedStarterId = null;
    isGameListCollapsed = true;
    state = emptySessionState(currentPreset().name);
    render();
  }

  function setupFromRecord(record) {
    if (state.view === "game") {
      components.toast("Finish or end the running session first.", { title: "Session in progress", kind: "warning" });
      return false;
    }
    const game = gameById(record.gameId);
    selectedGameId = game ? game.id : DEFAULT_GAME_ID;
    setupEntries = record.players.map((player, index) => ({
      id: uid(),
      name: player.name,
      type: player.type,
      color: player.color || colorForIndex(index),
      locked: player.type === "other" && player.name.trim().toLowerCase() === RULE_LOOKUP_NAME.toLowerCase(),
      factionName: player.factionName || "",
      ruleLookupDefault: player.ruleLookupDefault || false,
      turnOrderDefault: player.turnOrderDefault || false
    }));
    turnOrderManuallyAdjusted = true;
    selectedStarterId = null;
    isGameListCollapsed = true;
    state = emptySessionState(currentPreset().name);
    ensureRuleLookup();
    applyGameTurnOrderDefaults({ sortPlayers: false });
    return true;
  }

  function seatPlayers(names) {
    const game = currentPreset();
    const options = playerColorOptions().filter(option => option.value !== PLAYER_QUICK_COLOR);
    const others = setupEntries.filter(entry => entry.type !== "player");
    setupEntries = [];
    names.forEach((name, index) => {
      const option = options[index % Math.max(1, options.length)];
      const color = usesOpenColorPool(game) ? (personColor(name) || option?.value || colorForIndex(index)) : option?.value || colorForIndex(index);
      addEntry(name, "player", color, false, isFactionColorOption(option) && !usesOpenColorPool(game) ? option.name : "");
    });
    setupEntries = setupEntries.concat(others);
    turnOrderManuallyAdjusted = false;
    selectedStarterId = null;
    ensureRuleLookup();
    applyGameTurnOrderDefaults();
  }

  function playGame(gameId, names) {
    if (state.view === "game") {
      components.toast("Finish or end the running session first.", { title: "Session in progress", kind: "warning" });
      return false;
    }
    if (!gameById(gameId)) return false;
    if (state.view === "summary") resetToSetup();
    const seated = names && names.length ? names : setupEntries.filter(entry => entry.type === "player" && entry.name.trim()).map(entry => entry.name.trim());
    clearRandomSelectAnimation();
    selectedGameId = gameId;
    state.gameName = currentPreset().name;
    selectedPlayerColor = PLAYER_QUICK_COLOR;
    isGameListCollapsed = true;
    seatPlayers(seated);
    render();
    return true;
  }

  function simulateFullGame(toSummary = true) {
    if (state.view !== "game") return;
    const peopleRows = state.players.filter(player => player.type === "player");
    if (!peopleRows.length) return;
    const others = state.players.filter(player => player.type === "other");
    const rounds = randomInteger(3, 5);
    const setupDuration = randomInteger(120, 420) * 1000;
    const segments = [];
    for (let round = 0; round < rounds; round += 1) {
      peopleRows.forEach((player, playerIndex) => {
        segments.push({ kind: "turn", player, duration: (randomInteger(35, 210) + randomInteger(0, 90) + round * 8 + playerIndex * 3) * 1000 });
      });
      if (others.length && Math.random() > 0.35) segments.push({ kind: "turn", player: others[randomInteger(0, others.length - 1)], duration: randomInteger(25, 150) * 1000 });
      if (round < rounds - 1 && Math.random() > 0.25) segments.push({ kind: "pause", duration: randomInteger(30, 180) * 1000 });
    }
    state.players.forEach(player => {
      player.turns = [];
      if (player.type === "player") player.placement = "";
    });
    shuffled(peopleRows).forEach((player, index) => { player.placement = String(index + 1); });
    const simulatedDuration = setupDuration + segments.reduce((total, segment) => total + segment.duration, 0);
    const endedAt = Date.now();
    let cursor = endedAt - simulatedDuration;
    Object.assign(state, {
      demo: true,
      gameStartedAt: cursor,
      firstTurnStartedAt: cursor + setupDuration,
      setupElapsed: setupDuration,
      pauses: [],
      activeId: null,
      activeTurnStartedAt: null,
      currentStartedAt: null,
      currentElapsed: 0,
      isPaused: false,
      pauseStartedAt: null
    });
    cursor += setupDuration;
    segments.forEach(segment => {
      const start = cursor;
      cursor += segment.duration;
      if (segment.kind === "pause") state.pauses.push({ start, end: cursor, duration: segment.duration });
      else segment.player.turns.push({ startedAt: start, duration: segment.duration, endedAt: cursor });
    });
    state.gameEndedAt = toSummary ? endedAt : null;
    state.view = toSummary ? "summary" : "game";
    render();
  }

  function simulateForTesting() {
    if (state.view === "summary") resetToSetup();
    if (state.view === "setup") {
      if (!realSetupPlayerCount()) {
        const game = currentPreset();
        const colors = randomizeColorsForGame(game);
        people().slice(0, Math.max(2, Math.min(game.minPlayers || 2, 4))).forEach((person, index) => {
          const color = colors[index] || STANDARD_COLORS[index];
          addEntry(person.name, "player", usesOpenColorPool(game) ? person.color : color.value, false, isFactionColorOption(color) ? color.name : "");
        });
        ensureRuleLookup();
        applyGameTurnOrderDefaults();
      }
      startGame();
    }
    simulateFullGame(true);
  }

  /* ---------- Rendering ---------- */

  function colorButton(color, selectedValue, action) {
    const isQuick = color.value === PLAYER_QUICK_COLOR;
    return `<button class="color-btn ${isQuick ? "is-rainbow" : ""}" type="button" data-action="${esc(action)}" ${isQuick ? `data-shortcut="Q"` : ""} data-color="${esc(color.value)}" aria-pressed="${color.value === selectedValue}" style="--swatch:${isQuick ? "#f8fafc" : esc(color.value)}"><span class="color-dot" aria-hidden="true"></span><span>${esc(color.name)}</span></button>`;
  }

  function nameButton(person) {
    const inRoster = setupEntries.some(entry => entry.name.trim().toLowerCase() === person.name.toLowerCase());
    const color = playerColorForName(person.name);
    return `<button class="chip-btn name-chip" type="button" data-action="name" data-name="${esc(person.name)}" style="--accent:${esc(color)}" ${inRoster ? `aria-pressed="true" title="${esc(person.name)} is already playing"` : ""}><span class="dot" aria-hidden="true"></span><span>${esc(person.name)}</span></button>`;
  }

  function swatchesMarkup(game) {
    const colors = colorsForGame(game);
    if (usesOpenColorPool(game)) return game.id === "custom" ? "" : `<span class="swatches" aria-hidden="true"><span class="swatch is-rainbow"></span></span>`;
    const preview = colors.slice(0, 10);
    return `<span class="swatches" aria-hidden="true">${preview.map(color => `<span class="swatch" style="--swatch:${esc(color.value)}"></span>`).join("")}${colors.length > preview.length ? `<span class="swatch-count">+${colors.length - preview.length}</span>` : ""}</span>`;
  }

  function gameBadges(game) {
    const badges = [];
    if (hasFactionColorOptions(colorsForGame(game))) badges.push(`<span class="tag-badge" title="Faction based">F</span>`);
    if (turnOrderRuleForGame(game)) badges.push(`<span class="tag-badge" title="${esc(turnOrderBadgeLabel(turnOrderRuleForGame(game)))}">T</span>`);
    if (hasDefaultOtherTiming(game)) badges.push(`<span class="tag-badge" title="Known other timing: ${esc(defaultOtherTimingNames(game).join(", "))}">O</span>`);
    if (game.verified) badges.push(`<span class="tag-badge is-verified" title="Verified colors">✓</span>`);
    return badges.join("");
  }

  function ownershipMarkup(game) {
    const entry = libraryEntry(game.id);
    if (!entry || (!entry.owned && !entry.wishlist)) return "";
    if (entry.wishlist && !entry.owned) return `<span class="own-pill is-wishlist">${symbol("heart")}Wishlist</span>`;
    const owners = entry.owners || [];
    return `<span class="own-pill" title="${esc(owners.length ? "Owned by " + owners.join(", ") : "Owned")}">${symbol("checkmark")}${esc(owners.length ? owners.join(", ") : "Owned")}</span>`;
  }

  function setupPlayerCount() {
    return realSetupPlayerCount();
  }

  function setupGames() {
    const filter = appState().modules.play.gameFilter;
    const count = setupPlayerCount();
    const [custom, ...rest] = allGames();
    const games = rest.filter(game => {
      if (filter === "owned") return Boolean(libraryEntry(game.id)?.owned);
      if (filter === "fits") return count ? playerCountFit(game, count).score > 0 : true;
      return true;
    });
    const sorted = games.slice().sort((a, b) => {
      if (filter === "fits" && count) return playerCountFit(b, count).score - playerCountFit(a, count).score || a.name.localeCompare(b.name, undefined, { numeric: true });
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    return [custom, ...sorted];
  }

  function gameOption(game) {
    const query = gameSearch.trim().toLowerCase();
    const isHidden = Boolean(query) && game.id !== "custom" && !gameSearchText(game).includes(query);
    const count = setupPlayerCount();
    const fit = playerCountFit(game, count);
    const plays = App.library?.playCount?.(game.id) || 0;
    return `
      <button class="game-option ${isHidden ? "is-hidden" : ""}" type="button" data-action="preset" data-game-id="${esc(game.id)}" data-search-text="${esc(gameSearchText(game))}" aria-pressed="${game.id === selectedGameId}">
        <span class="game-option-main">
          <strong class="game-option-title">${gameTitleMarkup(game.name)}${gameBadges(game)}</strong>
          <small>${esc(game.id === "custom" ? "Any game · any player count" : gameRangeText(game))}</small>
          <span class="game-option-meta">${ownershipMarkup(game)}${fit.key !== "none" && count ? `<span class="fit-pill is-${esc(fit.key)}">${esc(fit.label)}</span>` : ""}${plays ? `<span class="plays-pill">${plays} ${plays === 1 ? "play" : "plays"}</span>` : ""}${game.custom ? `<span class="plays-pill">Added</span>` : ""}</span>
        </span>
        ${swatchesMarkup(game)}
      </button>`;
  }

  function turnOrderRuleMarkup(rule) {
    if (!rule) return "";
    return `<div class="turn-order-rule"><span class="turn-order-rule-icon" aria-hidden="true">${esc(rule.icon || "↕")}</span><span><strong>${esc(rule.label || "Turn order rule")}</strong><span>${esc(rule.note || "This game has custom turn-order setup.")}</span></span></div>`;
  }

  function rosterRow(entry) {
    const anim = randomSelectAnimation;
    const isAnimating = Boolean(anim);
    const isRandomEntry = isAnimating && entry.type === "player" && anim.finalIds.includes(entry.id);
    const finalIndex = isRandomEntry ? anim.finalIds.indexOf(entry.id) : -1;
    const isUnlocked = isRandomEntry && finalIndex >= anim.lockedCount;
    const isSpinning = isRandomEntry && finalIndex === anim.lockedCount;
    const justLocked = isRandomEntry && anim.justLocked && finalIndex === anim.lockedCount - 1;
    let displayEntry = entry;
    if (isUnlocked) {
      const pool = anim.singleMode ? (anim.candidatePool || anim.finalIds) : anim.finalIds.slice(anim.lockedCount);
      const candidates = pool.map(id => setupEntries.find(item => item.id === id)).filter(Boolean);
      if (candidates.length) displayEntry = candidates[(isSpinning ? anim.flickerSeed : anim.flickerSeed + finalIndex * 3 + 1) % candidates.length];
    }
    const hasFaction = Boolean(displayEntry.factionName);
    const factionFirst = hasFaction && prefs().displayNameMode === "faction";
    const inputDisabled = entry.locked || isAnimating;
    const showName = isUnlocked ? displayEntry.name : entry.name;
    const showColor = isUnlocked ? displayEntry.color : entry.color;
    const showFaction = isUnlocked ? displayEntry.factionName : entry.factionName;
    const isStarter = entry.id === selectedStarterId;
    const rowClasses = [
      dragState && dragState.id === entry.id ? "is-dragging" : "",
      isSpinning ? "is-spinning" : "",
      justLocked ? "is-just-locked" : "",
      isRandomEntry && !isUnlocked ? "is-revealed" : "",
      isUnlocked && !isSpinning ? "is-pending" : "",
      isStarter ? "is-starter" : ""
    ].filter(Boolean).join(" ");
    const handle = isAnimating
      ? `<span class="drag-handle" aria-hidden="true">${isSpinning ? "🎲" : isUnlocked ? "?" : "✓"}</span>`
      : entry.locked ? `<span class="drag-handle is-locked" aria-hidden="true">•</span>`
      : `<button class="drag-handle" type="button" data-drag-id="${esc(entry.id)}" aria-label="Reorder ${esc(entry.name || "entry")}; use arrow keys to move">${icons.markup("drag")}</button>`;
    return `
      <div class="roster-row ${rowClasses}" data-id="${esc(entry.id)}" data-entry-type="${esc(entry.type)}" style="--accent:${esc(showColor)}">
        ${handle}
        <div class="roster-name-cell">
          ${factionFirst ? `<span class="roster-faction is-primary">${esc(showFaction)}</span>` : ""}
          <input data-field="name" data-id="${esc(entry.id)}" value="${esc(showName)}" placeholder="${entry.type === "other" ? "Other name" : "Player name"}" aria-label="${entry.type === "other" ? "Other row name" : "Player name"}" autocomplete="off" autocapitalize="words" ${inputDisabled ? "disabled" : ""}>
          ${hasFaction && !factionFirst ? `<span class="roster-faction">${esc(showFaction)}</span>` : ""}
        </div>
        ${isStarter ? `<span class="starter-pill">First</span>` : ""}
        <label class="roster-color" title="Color"><span class="visually-hidden">Color for ${esc(entry.name || "entry")}</span><span class="roster-color-swatch" aria-hidden="true"></span><input data-field="color" data-id="${esc(entry.id)}" type="color" value="${esc(showColor)}" ${isAnimating ? "disabled" : ""}></label>
        <button class="icon-button remove-btn" type="button" ${entry.locked || isAnimating ? "disabled" : `data-action="remove" data-id="${esc(entry.id)}"`} aria-label="Remove ${esc(entry.name || "entry")}">${icons.markup("close")}</button>
      </div>`;
  }

  function renderSetup() {
    ensureRuleLookup();
    const preset = currentPreset();
    const colors = selectedGameColors();
    const knownChoices = hasKnownColorOptions();
    const playerColors = playerColorOptions(colors);
    if (!playerColors.some(color => color.value === selectedPlayerColor)) {
      selectedPlayerColor = knownChoices ? playerColors[0]?.value || "" : PLAYER_QUICK_COLOR;
    }
    const isQuickColor = selectedPlayerColor === PLAYER_QUICK_COLOR;
    const playerAccent = isQuickColor ? "#f8fafc" : selectedPlayerColor;
    const playerEntries = setupEntries.filter(entry => entry.type === "player");
    const otherEntries = setupEntries.filter(entry => entry.type === "other");
    const canStart = playerEntries.some(entry => entry.name.trim());
    const playerCount = playerEntries.filter(entry => entry.name.trim()).length;
    const filter = appState().modules.play.gameFilter;
    const fit = playerCountFit(preset, playerCount);
    const lastGame = appState().workspace.history[0];
    root.innerHTML = `
      <div class="play-setup ${isGameListCollapsed ? "is-list-collapsed" : "is-list-open"}">
        <header class="play-bar">
          <button class="game-picker-toggle" type="button" data-action="toggle-game-list" data-shortcut="J" aria-expanded="${!isGameListCollapsed}" aria-controls="setupGameList">
            <span class="eyebrow">${prefs().demoMode ? "Demo Mode · " : ""}Game</span>
            ${gameTitleMarkup(preset.name, "picker-title")}
            <small>${esc(preset.id === "custom" ? "Choose a game from the list, or play anything" : gameRangeText(preset))}</small>
            <span class="picker-meta">${ownershipMarkup(preset)}${fit.key !== "none" ? `<span class="fit-pill is-${esc(fit.key)}">${esc(fit.label)}</span>` : ""}</span>
            <span class="picker-chevron" aria-hidden="true">${icons.markup("chevronDown")}</span>
          </button>
          <div class="play-bar-actions">
            <button class="button" type="button" data-action="randomize" data-shortcut="R">${symbol("dice")}<span>Random</span></button>
            <button class="button" type="button" data-action="setup-reset" data-shortcut="Z">${symbol("reset")}<span>Reset</span></button>
            <button class="button primary start-button" type="button" data-action="start" data-shortcut="G" ${canStart ? "" : "disabled"}>${symbol("play")}<span>Start</span></button>
          </div>
        </header>

        <section class="panel game-panel" id="setupGameList" ${isGameListCollapsed ? "hidden" : ""}>
          <div class="panel-head">
            <h3>Games</h3>
            <div class="game-panel-tools">
              <label class="search-field"><span class="visually-hidden">Search games</span><input data-field="game-search" type="search" value="${esc(gameSearch)}" placeholder="Search games" autocomplete="off"></label>
              <div class="segmented compact" role="group" aria-label="Show games">
                <button type="button" data-game-filter="all" aria-pressed="${filter === "all"}">All</button>
                <button type="button" data-game-filter="owned" aria-pressed="${filter === "owned"}">Owned</button>
                <button type="button" data-game-filter="fits" aria-pressed="${filter === "fits"}" ${playerCount ? "" : `title="Add players to rank games for the table"`}>Fits ${playerCount || ""}</button>
              </div>
              <button class="icon-button" type="button" data-action="toggle-game-list" aria-label="Close game list">${icons.markup("close")}</button>
            </div>
          </div>
          <div class="game-list" role="list">${setupGames().map(game => `<div role="listitem">${gameOption(game)}</div>`).join("")}</div>
          ${filter === "owned" && !setupGames().slice(1).length ? `<p class="empty-note">No owned games yet. Mark games you own in Library.</p>` : ""}
        </section>

        <div class="setup-grid">
          <section class="panel player-add-panel">
            <div class="panel-head">
              <h3>Add players</h3>
              <div class="panel-actions">
                <span class="selection-pill ${isQuickColor ? "is-rainbow" : ""}" style="--accent:${esc(playerAccent)}"><span class="dot"></span>${esc(colorName(selectedPlayerColor, playerColors))}</span>
                <button class="button small" type="button" data-action="randomize-selected-game" data-shortcut="Y">${symbol("shuffle")}<span>Random</span></button>
              </div>
            </div>
            <div class="label-row"><span class="eyebrow">${knownChoices && hasFactionColorOptions(colors) ? "Factions" : "Colors"} · ${playerColors.length}</span></div>
            <div class="color-grid">${playerColors.map(color => colorButton(color, selectedPlayerColor, "select-player-color")).join("")}</div>
            <div class="label-row"><span class="eyebrow">People</span><button class="text-link" type="button" data-action="manage-people">Manage</button></div>
            <div class="chip-grid">${people().map(nameButton).join("") || `<span class="empty-note">No people yet.</span>`}</div>
            <div class="custom-add">
              <label class="grow-control"><span class="visually-hidden">Custom player name</span><input data-field="custom-player" placeholder="Custom player name" autocomplete="off" autocapitalize="words"></label>
              <button class="button" type="button" data-action="custom-player" data-shortcut="P">${symbol("plus")}<span>Add</span></button>
            </div>
          </section>

          <section class="panel turn-order-panel">
            <div class="panel-head">
              <div><h3>Turn order</h3><span class="panel-note">${playerCount} ${playerCount === 1 ? "player" : "players"}</span></div>
              <div class="panel-actions">
                <button class="button small" type="button" data-action="clear-turn-order" data-shortcut="L" ${playerEntries.length ? "" : "disabled"}>${symbol("close")}<span>Clear</span></button>
                <button class="button small" type="button" data-action="first" data-shortcut="F" ${playerEntries.length && !randomSelectAnimation ? "" : "disabled"}>${symbol("dice")}<span>${randomSelectAnimation ? "Rolling…" : usesRandomAllTurnOrder(preset) ? "Set" : "First"}</span></button>
              </div>
            </div>
            ${turnOrderRuleMarkup(turnOrderRuleForGame(preset))}
            <div class="roster-list player-list ${randomSelectAnimation ? "is-random-animating" : ""}" data-roster="player">
              ${playerEntries.length ? playerEntries.map(rosterRow).join("") : `<div class="empty-panel">Pick a ${knownChoices && hasFactionColorOptions(colors) ? "faction" : "color"}, then tap a name to add players.${lastGame ? ` <button class="text-link" type="button" data-action="repeat-last">Use last game’s players</button>` : ""}</div>`}
            </div>
          </section>

          <section class="panel other-panel">
            <div class="panel-head">
              <h3>Other timing</h3>
              <span class="selection-pill" style="--accent:${esc(selectedOtherColor)}"><span class="dot"></span>${esc(colorName(selectedOtherColor, OTHER_COLORS))}</span>
            </div>
            <div class="color-grid is-compact">${OTHER_COLORS.map(color => colorButton(color, selectedOtherColor, "select-other-color")).join("")}</div>
            <div class="chip-grid">${OTHER_NAMES.filter(name => name !== RULE_LOOKUP_NAME).map(name => `<button class="chip-btn" type="button" data-action="other" data-name="${esc(name)}">${esc(name)}</button>`).join("")}</div>
            <div class="custom-add">
              <label class="grow-control"><span class="visually-hidden">Custom other name</span><input data-field="custom-other" placeholder="Custom other name" autocomplete="off" autocapitalize="words"></label>
              <button class="button" type="button" data-action="custom-other" data-shortcut="O">${symbol("plus")}<span>Add</span></button>
            </div>
            <div class="roster-list other-list" data-roster="other">${otherEntries.map(rosterRow).join("")}</div>
          </section>
        </div>
      </div>`;
    stopTick();
  }

  function renderRosterOnly() {
    const list = root.querySelector("[data-roster='player']");
    if (!list) { render(); return; }
    list.innerHTML = setupEntries.filter(entry => entry.type === "player").map(rosterRow).join("");
  }

  function sessionGridLayout(count) {
    const safeCount = Math.max(1, count);
    const rows = safeCount <= 4 ? 1 : safeCount <= 8 ? 2 : 3;
    const columns = Math.ceil(safeCount / rows);
    const smallColumns = safeCount <= 1 ? 1 : safeCount <= 4 ? 2 : 3;
    return { columns, rows, smallColumns, smallRows: Math.ceil(safeCount / smallColumns), phoneColumns: safeCount <= 1 ? 1 : 2 };
  }

  function playerCard(player, awards, now) {
    const stats = statsFor(player);
    const isActive = state.activeId === player.id;
    const elapsed = isActive ? activeElapsed(now) : 0;
    const names = displayNameParts(player);
    const turns = player.turns.map((turn, index) => ({ turn, number: index + 1 })).reverse().slice(0, 30).map(({ turn, number }) => `<li><span class="turn-label">Turn ${number}${turnBadges(turn, stats)}</span><strong>${fmt(turn.duration)}</strong></li>`).join("");
    const overtime = isActive && App.sessionAids?.isOvertime(elapsed);
    return `
      <article class="player-card ${isActive ? "is-active" : ""} ${isActive && state.isPaused ? "is-paused" : ""} ${player.type === "other" ? "is-other" : ""} ${overtime ? "is-overtime" : ""}" role="button" tabindex="0" data-player-id="${esc(player.id)}" style="--accent:${esc(player.color)}" aria-pressed="${isActive}" aria-label="${esc(displayNameText(player))}${isActive ? (state.isPaused ? ", paused" : ", taking a turn") : ""}">
        <div class="player-head">
          <span class="dot"></span>
          <div class="player-names"><div class="player-name">${esc(names.primary)}</div><div class="player-subname">${esc(names.secondary || (player.type === "other" ? "Other" : "Player"))}</div></div>
          <div class="awards">${awardBadges(player, awards)}</div>
        </div>
        <div class="live-time" data-live-id="${esc(player.id)}">${isActive ? fmt(elapsed) : fmt(stats.total)}</div>
        <div class="card-state">${isActive ? (state.isPaused ? "Paused" : "Taking a turn") : stats.count ? `${stats.count} ${stats.count === 1 ? "turn" : "turns"} · total` : "Tap to start"}</div>
        <div class="stat-grid">
          <div class="stat"><span>Avg</span><strong>${stats.count ? fmt(stats.average) : "--"}</strong></div>
          <div class="stat"><span>Long</span><strong>${stats.count ? fmt(stats.longest) : "--"}</strong></div>
          <div class="stat"><span>Short</span><strong>${stats.count ? fmt(stats.shortest) : "--"}</strong></div>
        </div>
        <ol class="turn-list">${turns || `<li class="empty-list">No turns yet</li>`}</ol>
      </article>`;
  }

  function renderGame() {
    const now = Date.now();
    const active = getPlayer(state.activeId);
    const activeNames = active ? displayNameParts(active) : null;
    const awards = computeAwards(state);
    const layout = sessionGridLayout(state.players.length);
    const awake = App.sessionAids?.wakeLockStatus?.() || "";
    root.innerHTML = `
      <div class="play-session ${state.isPaused ? "is-paused" : ""}">
        <header class="session-bar">
          <div class="current-chip" style="--accent:${esc(active ? active.color : "var(--line-strong)")}">
            ${gameTitleMarkup(state.gameName, "session-game")}
            <span class="current-name"><strong>${activeNames ? esc(activeNames.primary) : state.isPaused ? "Paused" : state.firstTurnStartedAt ? "Ready" : "Setting up"}</strong>${activeNames?.secondary ? `<span>${esc(activeNames.secondary)}</span>` : ""}</span>
          </div>
          <div class="metric-strip">
            <div class="metric"><span class="eyebrow">Game</span><strong data-metric="game">${fmt(now - state.gameStartedAt)}</strong></div>
            <div class="metric"><span class="eyebrow">Setup</span><strong data-metric="setup">${fmt(setupTotal(state, now))}</strong></div>
            <div class="metric"><span class="eyebrow">Pause</span><strong data-metric="pause">${fmt(pauseTotal(state, now))}</strong></div>
          </div>
          <div class="session-flags">
            ${state.demo ? `<span class="session-chip is-demo">${symbol("sparkles")}Demo</span>` : ""}
            <span class="session-chip" data-awake-chip title="Screen kept awake" ${awake ? "" : "hidden"}>${symbol("awake")}<span class="visually-hidden">Screen kept awake</span></span>
          </div>
          <button class="button danger end-button" type="button" data-action="end" data-shortcut="E">${symbol("stop")}<span>End</span></button>
        </header>
        <section class="players-grid" style="--player-cols:${layout.columns};--player-rows:${layout.rows};--player-cols-small:${layout.smallColumns};--player-rows-small:${layout.smallRows};--player-cols-phone:${layout.phoneColumns}" aria-label="Players">
          ${state.players.map(player => playerCard(player, awards, now)).join("")}
        </section>
        <section class="session-controls" aria-label="Session controls">
          <button class="button pause-button" type="button" data-action="pause" data-shortcut="P" aria-pressed="${state.isPaused}">${symbol(state.isPaused ? "play" : "pause")}<span>${state.isPaused ? "Resume" : "Pause"}</span></button>
          <button class="button primary advance-button" type="button" data-action="advance" data-shortcut="A">${symbol("advance")}<span>${state.activeId ? "Next player" : "Start first turn"}</span></button>
        </section>
      </div>`;
    scheduleSessionDensityCheck();
    startTick();
  }

  function renderSummary() {
    stopTick();
    const ended = state.gameEndedAt || Date.now();
    root.innerHTML = `
      <div class="play-summary">
        <header class="play-bar summary-bar">
          <div class="summary-title">
            <span class="eyebrow">${state.demo ? "Demo · not saved" : "Final stats · saved to History"}</span>
            ${gameTitleMarkup(state.gameName, "picker-title")}
            <small>${esc(formatDateStamp(ended))}</small>
          </div>
          <div class="play-bar-actions">
            <button class="button" type="button" data-action="share" data-shortcut="S">${symbol("share")}<span>Share</span></button>
            <button class="button primary" type="button" data-action="reset" data-shortcut="R">${symbol("reset")}<span>New game</span></button>
          </div>
        </header>
        <div class="summary-capture">${summaryMarkup(state, { interactive: true })}</div>
      </div>`;
  }

  function render() {
    if (!root) return;
    saveSession();
    if (state.view === "game") renderGame();
    else if (state.view === "summary") renderSummary();
    else renderSetup();
    App.sessionAids?.setSessionActive(state.view === "game" && !state.demo);
    emit("app:gamechange");
    emit("app:viewrendered");
  }

  function applySessionDensityClass() {
    if (state.view !== "game") return;
    const grid = root.querySelector(".players-grid");
    const firstCard = grid?.querySelector(".player-card");
    if (!grid || !firstCard) return;
    const height = firstCard.getBoundingClientRect().height;
    grid.dataset.density = height < 130 ? "essential" : height < 250 ? "insightful" : "detailed";
  }

  function scheduleSessionDensityCheck() {
    if (sessionDensityFrame) window.cancelAnimationFrame(sessionDensityFrame);
    sessionDensityFrame = window.requestAnimationFrame(() => {
      sessionDensityFrame = null;
      applySessionDensityClass();
    });
  }

  function updateLive() {
    if (state.view !== "game" || !root) return;
    const now = Date.now();
    const set = (selector, value) => { const element = root.querySelector(selector); if (element && element.textContent !== value) element.textContent = value; };
    set("[data-metric='game']", fmt(now - state.gameStartedAt));
    set("[data-metric='setup']", fmt(setupTotal(state, now)));
    set("[data-metric='pause']", fmt(pauseTotal(state, now)));
    if (state.activeId) {
      const elapsed = activeElapsed(now);
      const live = Array.from(root.querySelectorAll("[data-live-id]")).find(element => element.dataset.liveId === state.activeId);
      if (live) live.textContent = fmt(elapsed);
      const player = getPlayer(state.activeId);
      if (!state.isPaused && player) {
        const overtime = App.sessionAids?.tick(elapsed, player);
        live?.closest(".player-card")?.classList.toggle("is-overtime", Boolean(overtime));
      }
    }
  }

  function startTick() {
    if (!tickTimer) tickTimer = window.setInterval(updateLive, 250);
  }

  function stopTick() {
    if (tickTimer) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  /* ---------- Events ---------- */

  function handleClick(event) {
    const filterButton = event.target.closest("[data-game-filter]");
    if (filterButton) {
      storage.mutate(next => { next.modules.play.gameFilter = filterButton.dataset.gameFilter; }, { reason: "play-filter", touch: false });
      render();
      return;
    }
    const card = event.target.closest("[data-player-id]");
    if (card && state.view === "game") { startTurn(card.dataset.playerId); return; }
    const control = event.target.closest("[data-action]");
    if (!control || control.disabled) return;
    const action = control.dataset.action;
    if (action === "preset") selectGame(control.dataset.gameId);
    else if (action === "select-player-color") { selectedPlayerColor = control.dataset.color; render(); }
    else if (action === "select-other-color") { selectedOtherColor = control.dataset.color; render(); }
    else if (action === "name") addName(control.dataset.name);
    else if (action === "other") addOther(control.dataset.name);
    else if (action === "custom-player") {
      const input = root.querySelector("input[data-field='custom-player']");
      const name = u.cleanLine(input?.value, 60);
      if (name) addName(name);
      else input?.focus();
    }
    else if (action === "custom-other") {
      const input = root.querySelector("input[data-field='custom-other']");
      const name = u.cleanLine(input?.value, 60);
      if (name) addOther(name);
      else input?.focus();
    }
    else if (action === "first") pickFirstPlayer();
    else if (action === "clear-turn-order") clearTurnOrder();
    else if (action === "toggle-game-list") {
      isGameListCollapsed = !isGameListCollapsed;
      render();
      if (!isGameListCollapsed) requestAnimationFrame(() => root.querySelector("input[data-field='game-search']")?.focus({ preventScroll: true }));
    }
    else if (action === "randomize") randomizeSetup();
    else if (action === "randomize-selected-game") randomizePlayersForGame(currentPreset());
    else if (action === "setup-reset") resetStartPage();
    else if (action === "remove") removeEntry(control.dataset.id);
    else if (action === "start") startGame();
    else if (action === "pause") togglePause();
    else if (action === "advance") autoAdvance();
    else if (action === "end") confirmEnd(control);
    else if (action === "share") openShare(state, root.querySelector(".summary-capture"), control);
    else if (action === "reset") resetToSetup();
    else if (action === "manage-people") { emit("app:switchview", { view: "library" }); App.library?.showPeople(); }
    else if (action === "repeat-last") {
      const last = appState().workspace.history[0];
      if (last && setupFromRecord(last)) render();
    }
  }

  async function confirmEnd(trigger) {
    const turns = state.players.reduce((sum, player) => sum + player.turns.length, 0) + (state.activeId ? 1 : 0);
    if (turns === 0) {
      const accepted = await components.confirm({ title: "End without any turns?", message: "No turns were recorded yet. Ending now saves an empty game.", confirmLabel: "End game", cancelLabel: "Keep playing", trigger });
      if (!accepted) return;
    }
    endGame();
  }

  function handleKeydown(event) {
    const card = event.target.closest?.("[data-player-id]");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      startTurn(card.dataset.playerId);
      return;
    }
    const handle = event.target.closest?.("[data-drag-id]");
    if (handle && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      moveEntry(handle.dataset.dragId, event.key === "ArrowUp" ? -1 : 1);
      requestAnimationFrame(() => root.querySelector(`[data-drag-id="${CSS.escape(handle.dataset.dragId)}"]`)?.focus());
      return;
    }
    if (event.target.matches?.("input[data-field='custom-player']") && event.key === "Enter") {
      event.preventDefault();
      root.querySelector("[data-action='custom-player']")?.click();
    }
    if (event.target.matches?.("input[data-field='custom-other']") && event.key === "Enter") {
      event.preventDefault();
      root.querySelector("[data-action='custom-other']")?.click();
    }
    if (event.target.matches?.("input[data-field='game-search']") && event.key === "Enter") {
      event.preventDefault();
      root.querySelector(".game-option:not(.is-hidden):not([data-game-id='custom'])")?.click();
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.matches("input[data-field='game-search']")) {
      gameSearch = target.value;
      const query = gameSearch.trim().toLowerCase();
      root.querySelectorAll(".game-option[data-search-text]").forEach(option => {
        option.classList.toggle("is-hidden", Boolean(query) && option.dataset.gameId !== "custom" && !option.dataset.searchText.includes(query));
      });
    } else if (target.matches("input[data-field='name']")) {
      updateEntry(target.dataset.id, { name: target.value });
      const button = root.querySelector("[data-action='start']");
      if (button) button.disabled = !setupEntries.some(entry => entry.type === "player" && entry.name.trim());
      saveSession();
    } else if (target.matches("input[data-field='color']")) {
      updateEntry(target.dataset.id, { color: target.value });
      target.closest(".roster-row")?.style.setProperty("--accent", target.value);
      saveSession();
    }
  }

  function handleChange(event) {
    const select = event.target.closest("[data-placement-id]");
    if (select && state.view === "summary") setPlayerPlacement(select.dataset.placementId, select.value);
    if (event.target.matches("input[data-field='name']")) render();
  }

  function moveEntry(id, delta) {
    const entry = setupEntries.find(item => item.id === id);
    if (!entry) return;
    const group = setupEntries.filter(item => item.type === entry.type);
    const index = group.indexOf(entry);
    const target = Math.max(0, Math.min(group.length - 1, index + delta));
    if (target === index) return;
    group.splice(index, 1);
    group.splice(target, 0, entry);
    let groupIndex = 0;
    setupEntries = setupEntries.map(item => item.type === entry.type ? group[groupIndex++] : item);
    if (entry.type === "player") turnOrderManuallyAdjusted = true;
    selectedStarterId = null;
    render();
  }

  function startDrag(event) {
    const handle = event.target.closest("[data-drag-id]");
    if (!handle || event.button > 0) return;
    event.preventDefault();
    const entry = setupEntries.find(item => item.id === handle.dataset.dragId);
    dragState = { id: handle.dataset.dragId, type: entry?.type || "player" };
    window.addEventListener("pointermove", moveDrag, { passive: false });
    window.addEventListener("pointerup", endDrag, { once: true });
    window.addEventListener("pointercancel", endDrag, { once: true });
    render();
  }

  function moveDrag(event) {
    if (!dragState) return;
    event.preventDefault();
    const rows = Array.from(root.querySelectorAll(`.roster-row[data-entry-type="${dragState.type}"][data-id]`)).filter(row => row.dataset.id !== dragState.id);
    let targetIndex = 0;
    rows.forEach(row => {
      const rect = row.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) targetIndex += 1;
    });
    const group = setupEntries.filter(entry => entry.type === dragState.type);
    const oldIndex = group.findIndex(entry => entry.id === dragState.id);
    if (oldIndex < 0 || targetIndex === oldIndex) return;
    const [entry] = group.splice(oldIndex, 1);
    group.splice(targetIndex, 0, entry);
    let groupIndex = 0;
    setupEntries = setupEntries.map(item => item.type === dragState.type ? group[groupIndex++] : item);
    if (dragState.type === "player") turnOrderManuallyAdjusted = true;
    selectedStarterId = null;
    render();
  }

  function endDrag() {
    window.removeEventListener("pointermove", moveDrag);
    dragState = null;
    render();
  }

  function handleKey(event) {
    if (state.view !== "game") return false;
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    if (event.shiftKey && event.code === "KeyG") {
      event.preventDefault();
      simulateFullGame(true);
      return true;
    }
    if (event.shiftKey) return false;
    if (event.code === "Space" && !event.target.closest?.("button, [role='button'], a, select")) {
      event.preventDefault();
      autoAdvance();
      return true;
    }
    if (event.code === "KeyP") {
      event.preventDefault();
      togglePause();
      return true;
    }
    return false;
  }

  /* ---------- Persistence ---------- */

  function buildSessionSnapshot() {
    return { v: 1, savedAt: Date.now(), state, setupEntries, selectedGameId, selectedStarterId, turnOrderManuallyAdjusted };
  }

  function saveSession() {
    try { localStorage.setItem(config.storage.sessionKey, JSON.stringify(buildSessionSnapshot())); } catch (error) { /* Session persistence is best-effort. */ }
  }

  function clearSession() {
    [config.storage.sessionKey, config.storage.legacyLastResultKey, "gameTimer.persistenceProbe.v1", "gameTimerStorageDiagnostic"].concat(Object.values(LEGACY_PREFERENCE_KEYS)).forEach(key => {
      try { localStorage.removeItem(key); } catch (error) { /* ignore */ }
    });
    stopTick();
    clearRandomSelectAnimation();
    setupEntries = [];
    selectedGameId = DEFAULT_GAME_ID;
    selectedStarterId = null;
    turnOrderManuallyAdjusted = false;
    state = emptySessionState(currentPreset().name);
  }

  function loadSnapshot(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.v === 1 && parsed.state && Array.isArray(parsed.state.players) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function hydrateFromSnapshot(snapshot) {
    if (!snapshot) return false;
    state = Object.assign(emptySessionState(), snapshot.state);
    setupEntries = Array.isArray(snapshot.setupEntries) ? snapshot.setupEntries : [];
    selectedGameId = gameById(snapshot.selectedGameId) ? snapshot.selectedGameId : DEFAULT_GAME_ID;
    selectedStarterId = snapshot.selectedStarterId || null;
    turnOrderManuallyAdjusted = Boolean(snapshot.turnOrderManuallyAdjusted);
    if (state.view === "game" && !state.sessionId) state.sessionId = u.uid("game");
    return true;
  }

  function importLegacyData() {
    if (appState().meta.legacyImported) return;
    const read = key => { try { return localStorage.getItem(key); } catch (error) { return null; } };
    const legacy = loadSnapshot(config.storage.legacyLastResultKey);
    const theme = read(LEGACY_PREFERENCE_KEYS.theme);
    storage.mutate(next => {
      const game = next.preferences.game;
      if (read(LEGACY_PREFERENCE_KEYS.timeFormat) === "units") game.timeFormat = "units";
      const dateFormat = read(LEGACY_PREFERENCE_KEYS.dateFormat);
      if (["mdy", "dmy", "ymd"].includes(dateFormat)) game.dateFormat = dateFormat;
      if (read(LEGACY_PREFERENCE_KEYS.displayNameMode) === "faction") game.displayNameMode = "faction";
      if (read(LEGACY_PREFERENCE_KEYS.textType) === "emoji") game.textType = "emoji";
      if (theme === "light" || theme === "dark") next.preferences.appearance.mode = theme;
      if (legacy && legacy.state.view === "summary" && legacy.state.gameEndedAt) {
        const record = {
          id: "legacy-" + legacy.state.gameEndedAt,
          gameId: legacy.selectedGameId || "custom",
          gameName: legacy.state.gameName,
          gameStartedAt: legacy.state.gameStartedAt,
          firstTurnStartedAt: legacy.state.firstTurnStartedAt,
          setupElapsed: legacy.state.setupElapsed,
          gameEndedAt: legacy.state.gameEndedAt,
          players: legacy.state.players,
          pauses: legacy.state.pauses || []
        };
        if (!next.workspace.history.some(item => item.id === record.id)) next.workspace.history.unshift(record);
      }
      next.meta.legacyImported = true;
    }, { reason: "legacy-import" });
  }

  /* ---------- Public API ---------- */

  function sessionStatus() {
    if (state.view !== "game") return "";
    const active = getPlayer(state.activeId);
    return `${gameAccessibleName(state.gameName)} in progress${active ? ` · ${displayNameText(active)}${state.isPaused ? " (paused)" : ""}` : ""}`;
  }

  function init() {
    root = document.querySelector("#playView");
    importLegacyData();
    hydrateFromSnapshot(loadSnapshot(config.storage.sessionKey));
    ensureRuleLookup();
    root.addEventListener("click", handleClick);
    root.addEventListener("keydown", handleKeydown);
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleChange);
    root.addEventListener("pointerdown", startDrag);
    window.addEventListener("resize", scheduleSessionDensityCheck);
    window.visualViewport?.addEventListener("resize", scheduleSessionDensityCheck);
    window.addEventListener("pagehide", saveSession);
    window.addEventListener("beforeunload", saveSession);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveSession();
      else if (state.view === "game") updateLive();
    });
    if (!autosaveTimer) autosaveTimer = window.setInterval(() => { if (state.view === "game") saveSession(); }, config.controls.sessionAutosaveMs);
  }

  App.play = {
    init,
    render,
    handleKey,
    sessionStatus,
    clearSession,
    playGame,
    setupFromRecord,
    simulateForTesting,
    allGames,
    gameById,
    playerCountFit,
    parsePlayerCounts,
    gameRangeText,
    gameTitleMarkup,
    gameAccessibleName,
    gameSearchText,
    colorsForGame,
    formatDateStamp,
    fmt,
    fmtDuration,
    displayNameText,
    stats: {
      statsFor,
      gameTotals,
      computeAwards,
      placementNumber,
      placementLabel,
      sortPlayersByPlacement,
      applyPlacement,
      summaryMarkup,
      summarySharePayload
    },
    openShare,
    isSessionRunning: () => state.view === "game",
    activeGameId: () => selectedGameId
  };
})();
