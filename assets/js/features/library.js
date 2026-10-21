/* Library: owned games, people, and saved game history with play statistics. */
(function () {
  "use strict";

  const App = window.LocalApp;
  const u = App.utils;
  const storage = App.storage;
  const components = App.components;
  const icons = App.icons;
  const play = App.play;
  const stats = play.stats;
  const { GAME_PRESETS, STANDARD_COLORS } = App.gameData;

  const OWNERSHIP_LABELS = {
    all: "All games",
    owned: "Owned",
    available: "Available at the table",
    unowned: "Not owned",
    wishlist: "Wishlist",
    played: "Played",
    unplayed: "Never played"
  };
  const SORT_LABELS = { fit: "Best fit", name: "Name", plays: "Most played", recent: "Recently played", length: "Play time", weight: "Weight" };

  const SHEET_COLUMNS = [
    ["name", "Name"], ["bggId", "BGG"], ["turnStart", "Turn start"], ["factions", "Factions"],
    ["rating", "My rating"], ["bggRating", "BGG rating"], ["weight", "Weight"], ["minPlayers", "Players"],
    ["length", "Time"], ["category", "Category"], ["note", "Notes"], ["owners", "Owner"]
  ];
  SHEET_COLUMNS.forEach(([key, label]) => { SORT_LABELS[key] = label; });
  Object.assign(SORT_LABELS, { year: "Published year", bestPlayers: "Best player count", recommendedPlayers: "Good player counts", avoidPlayers: "Bad player counts", maxPlayers: "Maximum players", minMinutes: "Shortest time", maxMinutes: "Longest time", verified: "Verified colors", colors: "Colors" });

  function playerCountBadges(game) {
    const badges = [];
    for (let count = game.minPlayers; count <= game.maxPlayers; count += 1) {
      const fit = play.playerCountFit(game, count);
      const label = fit.key === "plays" ? `Neutral at ${count}` : fit.label;
      badges.push(`<span class="player-count-square is-${fit.key}" title="${esc(label)}" role="img" aria-label="${esc(label)}">${icons.markup(`number${count}SquareFill`)}</span>`);
    }
    return `<span class="player-count-badges">${badges.join("")}</span>`;
  }

  function sheetInfoButton(game, key, icon, label) {
    const info = sheetValue(game, key);
    return `<button class="sheet-info-button ${info ? "has-info" : ""}" type="button" data-sheet-info="${esc(info || `No ${label.toLowerCase()} recorded.`)}" data-info-label="${label}" aria-label="${esc(label + ': ' + (info || 'Not recorded'))}" aria-expanded="false">${symbol(icon)}</button>`;
  }

  let infoAnchor = null;
  let infoPinned = false;
  function hideSheetInfo() {
    document.querySelector("#libraryInfoPopover")?.hidePopover();
    infoAnchor?.setAttribute("aria-expanded", "false");
    infoAnchor = null;
    infoPinned = false;
  }
  function showSheetInfo(button, pin) {
    if (pin && infoAnchor === button && infoPinned) { hideSheetInfo(); return; }
    if (!pin && infoPinned) return;
    let popup = document.querySelector("#libraryInfoPopover");
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "libraryInfoPopover";
      popup.className = "sheet-info-popover";
      popup.setAttribute("popover", "auto");
      document.body.appendChild(popup);
      popup.addEventListener("toggle", event => { if (event.newState === "closed") { infoAnchor?.setAttribute("aria-expanded", "false"); infoAnchor = null; infoPinned = false; } });
    }
    infoAnchor?.setAttribute("aria-expanded", "false");
    popup.innerHTML = `<strong>${esc(button.dataset.infoLabel)}</strong><p>${esc(button.dataset.sheetInfo)}</p>`;
    popup.showPopover();
    infoAnchor = button;
    infoPinned = Boolean(pin);
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", popup.id);
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8));
    const top = rect.bottom + popup.offsetHeight + 8 <= window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - popup.offsetHeight - 6);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function sheetValue(game, key) {
    const entry = libraryEntry(game.id);
    const metadata = entry.metadata || {};
    if (key === "name") return game.name.replace(/\s*\(\d{4}\)$/, "");
    if (key === "year") return metadata.year || Number(game.name.match(/\((\d{4})\)$/)?.[1]) || null;
    if (key === "rating") return entry.rating || null;
    if (key === "owners") return entry.owned ? (entry.owners.join(", ") || "Shared") : entry.wishlist ? "Wishlist" : "Not owned";
    if (key === "note") return entry.note;
    if (["bggRating", "category", "bggId"].includes(key)) return metadata[key] || null;
    if (key === "weight") return game.complexityWeight;
    if (key === "length") return averageMinutes(game);
    if (key === "turnStart") return game.turnOrder ? [game.turnOrder.label, game.turnOrder.note].filter(Boolean).join(" · ") : "";
    if (key === "factions") return play.colorsForGame(game).filter(color => !Object.keys(App.gameData.NAMED_COLORS).some(name => name.toLowerCase() === color.name.toLowerCase())).map(color => color.name).join(", ");
    if (key === "colors") return play.colorsForGame(game).map(color => color.name).join(", ");
    return game[key] ?? null;
  }

  function gameRow(game) {
    const id = esc(game.id);
    const entry = libraryEntry(game.id);
    const cells = SHEET_COLUMNS.map(([key]) => {
      const value = sheetValue(game, key);
      if (key === "name") return `<th scope="row"><button class="text-link sheet-name" type="button" data-open-game="${id}"><span>${esc(value)}</span>${sheetValue(game, "year") ? `<span class="sheet-year">(${esc(sheetValue(game, "year"))})</span>` : ""}</button><span class="sheet-name-details"><span class="sheet-verification-mark ${game.verified ? "is-verified" : ""}" role="img" title="${game.verified ? 'Verified colors' : 'Colors unchecked'}" aria-label="${game.verified ? 'Verified colors' : 'Colors unchecked'}">${symbol("libraryVerified")}</span><span class="sheet-colors">${play.colorsForGame(game).map(color => `<span class="sheet-color" style="--bubble:${esc(u.normalizeColor(color.value, '#94a3b8'))}" title="${esc(color.name)}" role="img" aria-label="${esc(color.name)}"></span>`).join("")}</span></span></th>`;
      let content = value === null || value === "" || value === "--" ? '<span class="sheet-missing" aria-label="Not recorded">—</span>' : esc(value);
      if (key === "rating" && value) content = starsMarkup(value);
      if (key === "bggRating" && value) content = `${esc(value)} / 10`;
      if (key === "weight" && Number.isFinite(value)) content = `<span class="sheet-weight weight-band-${Math.min(5, Math.max(1, Math.ceil(value)))}" title="Complexity ${esc(value)} / 5">${esc(value)}</span>`;
      if (key === "length") {
        const band = Math.min(6, Math.max(1, Math.ceil(game.maxMinutes / 30)));
        content = `<span class="sheet-time time-band-${band}" title="${esc(game.maxMinutes)} min longest · ${Math.round(value || 0)} min average"><span>${esc(game.minMinutes)}${game.minMinutes === game.maxMinutes ? "" : "–" + esc(game.maxMinutes)} min</span></span>`;
      }
      if (key === "minPlayers") content = playerCountBadges(game);
      if (key === "turnStart") content = sheetInfoButton(game, key, "libraryTurnStart", "Turn start");
      if (key === "factions") content = sheetInfoButton(game, key, "libraryFactions", "Factions");
      if (["minMinutes", "maxMinutes"].includes(key) && value) content = `${esc(value)} min`;
      if (key === "verified") content = `<span class="sheet-verification-mark ${game.verified ? "is-verified" : ""}" role="img" aria-label="${game.verified ? "Verified colors" : "Colors unchecked"}">${symbol("libraryVerified")}</span>`;
      if (key === "bggId") content = `<a class="sheet-web ${value ? 'is-linked' : 'is-unlinked'}" aria-label="${esc((value ? 'View BGG: ' : 'Find on BGG (not linked): ') + game.name)}" title="${value ? 'Linked to BGG' : 'Not linked · search BGG'}" href="${value ? 'https://boardgamegeek.com/boardgame/' + encodeURIComponent(value) : 'https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=' + encodeURIComponent(sheetValue(game, 'name'))}" target="_blank" rel="noopener noreferrer">${symbol("libraryWeb")}</a>`;
      if (key === "colors") content = `<span class="sheet-colors">${play.colorsForGame(game).map(color => `<span class="sheet-color" style="--bubble:${esc(u.normalizeColor(color.value, '#94a3b8'))}" title="${esc(color.name)}" role="img" aria-label="${esc(color.name)}"></span>`).join("")}</span>`;
      if (["note"].includes(key)) content = `<span class="sheet-cell-text">${content}</span>`;
      return `<td class="sheet-${key}" title="${esc(value ?? '')}">${content}</td>`;
    }).join("");
    return `<tr${game.id === "custom" ? ' class="is-pinned-game"' : ""}>${cells}<td><div class="sheet-actions"><button class="button small own-toggle" type="button" data-toggle-owned="${id}" aria-pressed="${entry.owned}" aria-label="Owned: ${esc(game.name)}">Owned</button><button class="button small" type="button" data-play-game="${id}">Play</button></div></td></tr>`;
  }

  function gameSheet(games) {
    const ui = moduleState();
    return `<div class="library-sheet" role="region" aria-label="Game library spreadsheet" tabindex="0"><table><caption class="visually-hidden">Game library. Select a column heading to sort; select a game name to edit details. Player squares: green best, blue good, red bad, purple neutral. Times are in minutes, colored in half-hour bands by longest time. Turn and faction symbols show information on hover, focus, or tap.</caption><thead><tr>${SHEET_COLUMNS.map(([key, label]) => `<th scope="col" aria-sort="${ui.sortBy === key ? (ui.sortDirection === 'desc' ? 'descending' : 'ascending') : 'none'}"><button type="button" data-sheet-sort="${key}">${["bggId", "turnStart", "factions", "minPlayers", "length", "weight", "verified"].includes(key) ? `<span class="sheet-heading-icon" title="${label}">${symbol(({ bggId: "libraryWeb", turnStart: "libraryTurnStart", factions: "libraryFactions", minPlayers: "libraryPlayers", length: "libraryTime", weight: "libraryWeight", verified: "libraryVerified" })[key])}<span class="visually-hidden">${label}</span></span>` : label}${ui.sortBy === key ? (ui.sortDirection === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`).join("")}<th scope="col">Actions</th></tr></thead><tbody>${games.map(gameRow).join("")}</tbody></table></div>`;
  }

  let libraryRoot = null;
  let historyRoot = null;
  let openGameId = "";
  let openHistoryId = "";
  let editingCustomGameId = "";
  let statsCache = null;

  function appState() {
    return storage.getState();
  }

  function esc(value) {
    return u.escapeHtml(value);
  }

  function symbol(name) {
    return '<span class="glyph" aria-hidden="true">' + icons.markup(name) + "</span>";
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function moduleState() {
    return appState().modules.library;
  }

  function people() {
    return appState().workspace.people;
  }

  function history() {
    return appState().workspace.history;
  }

  function allGames() {
    return play.allGames();
  }

  function libraryEntry(gameId) {
    return appState().workspace.library.games[gameId] || { owned: false, owners: [], wishlist: false, rating: 0, note: "" };
  }

  function sameName(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }

  /* ---------- Statistics ---------- */

  function buildStats() {
    const records = history();
    const games = new Map();
    const persons = new Map();
    records.forEach(record => {
      const totals = stats.gameTotals(record);
      const gameStats = games.get(record.gameId) || { plays: 0, totalMs: 0, setupMs: 0, lastPlayed: 0, longest: 0, turns: 0, turnMs: 0, winners: new Map(), players: new Map(), records: [] };
      gameStats.plays += 1;
      gameStats.totalMs += totals.total;
      gameStats.setupMs += totals.setup;
      gameStats.lastPlayed = Math.max(gameStats.lastPlayed, record.gameEndedAt);
      gameStats.longest = Math.max(gameStats.longest, totals.total);
      gameStats.records.push(record);
      const seated = record.players.filter(player => player.type === "player");
      const placed = seated.some(player => stats.placementNumber(player));
      seated.forEach(player => {
        const key = player.name.trim().toLowerCase();
        const summary = stats.statsFor(player);
        gameStats.turns += summary.count;
        gameStats.turnMs += summary.total;
        gameStats.players.set(key, (gameStats.players.get(key) || 0) + 1);
        const isWinner = stats.placementNumber(player) === 1;
        if (isWinner) gameStats.winners.set(player.name, (gameStats.winners.get(player.name) || 0) + 1);
        const person = persons.get(key) || { name: player.name, games: 0, placedGames: 0, wins: 0, podiums: 0, turns: 0, turnMs: 0, playMs: 0, lastPlayed: 0, gameCounts: new Map() };
        person.games += 1;
        if (placed) person.placedGames += 1;
        if (isWinner) person.wins += 1;
        if ((stats.placementNumber(player) || 99) <= 3) person.podiums += 1;
        person.turns += summary.count;
        person.turnMs += summary.total;
        person.playMs += totals.total;
        person.lastPlayed = Math.max(person.lastPlayed, record.gameEndedAt);
        person.gameCounts.set(record.gameName, (person.gameCounts.get(record.gameName) || 0) + 1);
        persons.set(key, person);
      });
      games.set(record.gameId, gameStats);
    });
    return { games, persons, signature: records.length + ":" + (records[0]?.id || "") + ":" + records.reduce((sum, record) => sum + record.players.filter(player => player.placement).length, 0) };
  }

  function allStats() {
    const records = history();
    const signature = records.length + ":" + (records[0]?.id || "") + ":" + records.reduce((sum, record) => sum + record.players.filter(player => player.placement).length, 0);
    if (!statsCache || statsCache.signature !== signature) statsCache = buildStats();
    return statsCache;
  }

  function invalidateStats() {
    statsCache = null;
  }

  function gameStats(gameId) {
    return allStats().games.get(gameId) || null;
  }

  function personStats(name) {
    return allStats().persons.get(String(name || "").trim().toLowerCase()) || null;
  }

  function playCount(gameId) {
    return gameStats(gameId)?.plays || 0;
  }

  function topEntry(map) {
    let best = null;
    map.forEach((count, key) => { if (!best || count > best[1]) best = [key, count]; });
    return best;
  }

  function averageMinutes(game) {
    const record = gameStats(game.id);
    if (record?.plays) return record.totalMs / record.plays / 60000;
    return (Number(game.minMinutes) + Number(game.maxMinutes)) / 2 || 0;
  }

  /* ---------- Filtering ---------- */

  function tableCount() {
    const ui = moduleState();
    return ui.present.length || ui.playerCount || 0;
  }

  function isAvailable(game) {
    const entry = libraryEntry(game.id);
    if (!entry.owned) return false;
    const present = moduleState().present;
    if (!present.length || !entry.owners.length) return true;
    return entry.owners.some(owner => present.some(name => sameName(name, owner)));
  }

  function gameSearchText(game) {
    const entry = libraryEntry(game.id);
    return [play.gameSearchText(game), entry.note, ...SHEET_COLUMNS.map(([key]) => sheetValue(game, key)), entry.wishlist ? "wishlist wish" : "", entry.owned ? "" : "not owned unowned"].filter(Boolean).join(" ").toLowerCase();
  }

  function gameSearchMeta(game) {
    const entry = libraryEntry(game.id);
    const plays = playCount(game.id);
    const owned = entry.owned ? "Owned" + (entry.owners.length ? " by " + entry.owners.join(", ") : "") : entry.wishlist ? "Wishlist" : "Library";
    return owned + " · " + plays + (plays === 1 ? " play" : " plays");
  }

  function filteredGames() {
    const ui = moduleState();
    const query = ui.search.trim().toLowerCase();
    const count = tableCount();
    const terms = query.split(/\s+/).filter(Boolean);
    const games = allGames().filter(game => {
      if (game.id === "custom") return true;
      const entry = libraryEntry(game.id);
      const plays = playCount(game.id);
      if (ui.ownership === "owned" && !entry.owned) return false;
      if (ui.ownership === "available" && !isAvailable(game)) return false;
      if (ui.ownership === "unowned" && entry.owned) return false;
      if (ui.ownership === "wishlist" && !entry.wishlist) return false;
      if (ui.ownership === "played" && !plays) return false;
      if (ui.ownership === "unplayed" && plays) return false;
      if (ui.ownership === "available" && count && play.playerCountFit(game, count).score < 0) return false;
      if (ui.category && ui.category !== "all" && sheetValue(game, "category") !== ui.category) return false;
      if (ui.verified === "yes" && !game.verified || ui.verified === "no" && game.verified) return false;
      if (terms.length) {
        const text = gameSearchText(game);
        if (!terms.every(term => text.includes(term))) return false;
      }
      return true;
    });
    const direction = ui.sortDirection === "desc" ? -1 : 1;
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
    return games.sort((a, b) => {
      if (a.id === "custom") return -1;
      if (b.id === "custom") return 1;
      let compared = 0;
      if (ui.sortBy === "fit") {
        compared = count ? play.playerCountFit(b, count).score - play.playerCountFit(a, count).score : 0;
        if (!compared) compared = Number(isAvailable(b)) - Number(isAvailable(a));
        if (!compared) compared = playCount(b.id) - playCount(a.id);
      } else if (ui.sortBy === "plays") compared = playCount(b.id) - playCount(a.id);
      else if (ui.sortBy === "recent") compared = (gameStats(b.id)?.lastPlayed || 0) - (gameStats(a.id)?.lastPlayed || 0);
      else if (ui.sortBy === "length") compared = averageMinutes(a) - averageMinutes(b);
      else if (ui.sortBy === "weight") compared = (Number(a.complexityWeight) || 0) - (Number(b.complexityWeight) || 0);
      else if (ui.sortBy !== "name") {
        const av = sheetValue(a, ui.sortBy), bv = sheetValue(b, ui.sortBy);
        if (av === null || av === "" || av === "--") return bv === null || bv === "" || bv === "--" ? byName(a, b) : 1;
        if (bv === null || bv === "" || bv === "--") return -1;
        compared = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      } else compared = byName(a, b);
      return compared * direction || byName(a, b);
    });
  }

  /* ---------- Library rendering ---------- */

  function fitPill(game) {
    const count = tableCount();
    if (!count) return "";
    const fit = play.playerCountFit(game, count);
    return fit.key === "none" ? "" : `<span class="fit-pill is-${esc(fit.key)}">${esc(fit.label)}</span>`;
  }

  function ownershipPill(game) {
    const entry = libraryEntry(game.id);
    if (entry.owned) return `<span class="own-pill">${symbol("checkmark")}${esc(entry.owners.length ? entry.owners.join(", ") : "Owned")}</span>`;
    if (entry.wishlist) return `<span class="own-pill is-wishlist">${symbol("heart")}Wishlist</span>`;
    return `<span class="own-pill is-unowned">Not owned</span>`;
  }

  function starsMarkup(rating) {
    if (!rating) return "";
    return `<span class="rating rating-stars" role="img" aria-label="Rated ${rating} of 5" title="${rating} / 5">${[0, 1, 2, 3, 4].map(index => `<span class="rating-star" aria-hidden="true">☆<span style="width:${Math.max(0, Math.min(1, rating - index)) * 100}%">★</span></span>`).join("")}</span>`;
  }

  function bggLookupMarkup(game, customForm) {
    const name = game ? sheetValue(game, "name") : "";
    const bggId = game ? sheetValue(game, "bggId") : "";
    return `<section class="bgg-lookup ${customForm ? 'wide' : 'detail-section'}" data-bgg-lookup><h3>BGG lookup</h3><p class="setting-note">Search BoardGameGeek, then paste the game’s page link below to connect it.</p><div class="bgg-lookup-row"><label class="field grow-control"><span>Game name</span><input type="search" data-bgg-query maxlength="100" value="${esc(name)}" autocomplete="off"></label><a class="button" data-bgg-search href="https://boardgamegeek.com/geeksearch.php?action=search&amp;objecttype=boardgame&amp;q=${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer">${symbol("libraryWeb")}Search BGG</a></div><div class="bgg-lookup-row"><label class="field grow-control"><span>BGG game link or ID</span><input type="text" data-bgg-link ${customForm ? 'name="bggLink"' : ''} maxlength="500" value="${esc(bggId || '')}" placeholder="https://boardgamegeek.com/boardgame/…" autocomplete="off"></label>${customForm ? '' : '<button class="button" type="button" data-bgg-apply>Link game</button>'}</div><p class="setting-note" data-bgg-status role="status">${bggId ? `Linked to BGG #${esc(bggId)}.` : ''}</p></section>`;
  }

  function bggIdFromInput(value) {
    const text = String(value || "").trim();
    if (/^\d{1,12}$/.test(text) && Number(text) > 0) return text;
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" || !["boardgamegeek.com", "www.boardgamegeek.com"].includes(url.hostname) || url.username || url.password) return "";
      const id = url.pathname.match(/^\/boardgame\/(\d{1,12})(?:\/|$)/)?.[1];
      return Number(id) > 0 ? id : "";
    } catch (_) { return ""; }
  }

  function updateBggSearch(event) {
    if (!event.target.matches("[data-bgg-query]")) return;
    const section = event.target.closest("[data-bgg-lookup]");
    section.querySelector("[data-bgg-search]").href = "https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=" + encodeURIComponent(event.target.value.trim());
  }

  function applyBggLink(event) {
    const button = event.target.closest("[data-bgg-apply]");
    if (!button) return;
    const section = button.closest("[data-bgg-lookup]");
    const input = section.querySelector("[data-bgg-link]");
    const id = bggIdFromInput(input.value);
    if (!id) { section.querySelector("[data-bgg-status]").textContent = "Paste a valid HTTPS BoardGameGeek game link or numeric game ID."; input.focus(); return; }
    mutateLibrary(openGameId, entry => { entry.metadata = Object.assign({}, entry.metadata, { bggId: id }); });
    refreshAfterLibraryChange();
  }

  function gameCard(game) {
    const entry = libraryEntry(game.id);
    const record = gameStats(game.id);
    const winner = record ? topEntry(record.winners) : null;
    const available = isAvailable(game);
    const players = game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers}–${game.maxPlayers}`;
    return `
      <article class="library-card ${entry.owned ? "is-owned" : ""} ${available && moduleState().present.length ? "is-available" : ""}" data-game-card="${esc(game.id)}">
        <button class="library-card-main" type="button" data-open-game="${esc(game.id)}" aria-label="${esc(play.gameAccessibleName(game.name))} details">
          <span class="library-card-title">${play.gameTitleMarkup(game.name)}${starsMarkup(entry.rating)}</span>
          <span class="library-card-facts">
            <span>${symbol("people")}${esc(players)}</span>
            <span>${symbol("star")}Best ${esc(game.bestPlayers || players)}</span>
            <span>${symbol("timer")}${esc(game.minMinutes === game.maxMinutes ? game.minMinutes : game.minMinutes + "–" + game.maxMinutes)}m</span>
            ${Number.isFinite(game.complexityWeight) ? `<span>${symbol("bolt")}${esc(game.complexityWeight.toFixed(1))}</span>` : ""}
          </span>
          <span class="library-card-pills">${ownershipPill(game)}${fitPill(game)}${game.custom ? `<span class="plays-pill">Added</span>` : ""}</span>
          <span class="library-card-stats">
            ${record ? `<span><strong>${record.plays}</strong> ${record.plays === 1 ? "play" : "plays"}</span><span>Last ${esc(play.formatDateStamp(record.lastPlayed))}</span><span>Avg ${esc(play.fmtDuration(record.totalMs / record.plays))}</span>${winner ? `<span>${symbol("crown")}${esc(winner[0])} ×${winner[1]}</span>` : ""}` : `<span class="muted">Not played yet</span>`}
          </span>
        </button>
        <div class="library-card-actions">
          <button class="button small own-toggle" type="button" data-toggle-owned="${esc(game.id)}" aria-pressed="${entry.owned}">${symbol(entry.owned ? "checkmark" : "plus")}<span>${entry.owned ? "Owned" : "Own it"}</span></button>
          <button class="button small" type="button" data-play-game="${esc(game.id)}">${symbol("play")}<span>Play</span></button>
        </div>
      </article>`;
  }

  function presentPickerMarkup() {
    const ui = moduleState();
    return `
      <div class="present-picker">
        <div class="present-heading"><span class="eyebrow">Who’s playing?</span><div class="count-stepper" ${ui.present.length ? "hidden" : ""}>
          <span class="eyebrow">or player count</span>
          <button class="icon-button" type="button" data-player-count="-1" aria-label="Fewer players">−</button>
          <output aria-live="polite">${ui.playerCount ? ui.playerCount + " players" : "Any"}</output>
          <button class="icon-button" type="button" data-player-count="1" aria-label="More players">+</button>
        </div></div>
        <div class="chip-grid">
          ${people().map(person => `<button class="chip-btn" type="button" data-present="${esc(person.name)}" aria-pressed="${ui.present.includes(person.name)}" style="--accent:${esc(person.color)}"><span class="dot" aria-hidden="true"></span><span>${esc(person.name)}</span></button>`).join("")}
        </div>
        ${ui.present.length ? `<span class="panel-note">${ui.present.length} at the table · <button class="text-link" type="button" data-clear-present>Clear</button></span>` : ""}
      </div>`;
  }

  function libraryControlsMarkup() {
    const ui = moduleState();
    const count = tableCount();
    return `<section class="panel library-controls" aria-label="Library controls">
      <div class="segmented compact" role="tablist" aria-label="Library sections">
        <button type="button" role="tab" data-library-tab="games" aria-selected="${ui.tab === "games"}" aria-pressed="${ui.tab === "games"}">${symbol("library")}<span>Games</span></button>
        <button type="button" role="tab" data-library-tab="people" aria-selected="${ui.tab === "people"}" aria-pressed="${ui.tab === "people"}">${symbol("people")}<span>People</span></button>
      </div>
      ${ui.tab === "games" ? `
        <div class="filter-row" role="group" aria-label="Library search and filters">
          <label class="search-field grow-control"><span class="visually-hidden">Search library</span><input type="search" data-library-search value="${esc(ui.search)}" placeholder="Search library…" autocomplete="off"></label>
          <label class="select-field"><span class="visually-hidden">Show</span><select data-library-ownership>${Object.keys(OWNERSHIP_LABELS).map(key => `<option value="${key}" ${ui.ownership === key ? "selected" : ""}>${OWNERSHIP_LABELS[key]}</option>`).join("")}</select></label>
          <label class="select-field"><span class="visually-hidden">Sort</span><select data-library-sort>${Object.keys(SORT_LABELS).map(key => `<option value="${key}" ${ui.sortBy === key ? "selected" : ""}>${SORT_LABELS[key]}${key === "fit" && count ? ` for ${count}` : ""}</option>`).join("")}</select></label>
          <button class="icon-button" type="button" data-library-direction aria-label="${ui.sortDirection === "desc" ? "Reverse order on" : "Reverse order off"}" aria-pressed="${ui.sortDirection === "desc"}" title="Reverse order">${icons.markup("sort")}</button>
          <label class="select-field"><span class="visually-hidden">Category</span><select data-library-category><option value="all">All categories</option>${[...new Set(allGames().map(game => sheetValue(game, "category")).filter(Boolean))].sort().map(category => `<option value="${esc(category)}" ${ui.category === category ? 'selected' : ''}>${esc(category)}</option>`).join("")}</select></label>
          <label class="select-field"><span class="visually-hidden">Colors</span><select data-library-verified>${[["all", "Any verification"], ["yes", "Verified"], ["no", "Unchecked"]].map(([value, label]) => `<option value="${value}" ${ui.verified === value ? 'selected' : ''}>${label}</option>`).join("")}</select></label>
          <button class="button small" type="button" data-library-reset>Reset</button>
        </div>

        <details class="library-table-options"><summary>${symbol("people")}<span>Table${count ? ` · ${count}` : ''}</span></summary>${presentPickerMarkup()}</details>
      ` : ''}
      <button class="button small library-add-game" type="button" data-add-game>${symbol("plus")}<span>Add game</span></button>
    </section>`;
  }

  function renderGamesTab() {
    const ui = moduleState();
    const games = filteredGames();
    const count = tableCount();
    return `
      <p class="results-line" role="status">${games.length} ${games.length === 1 ? "game" : "games"}${ui.ownership !== "all" ? " · " + esc(OWNERSHIP_LABELS[ui.ownership]) : ""}${count && ui.sortBy === "fit" ? " · ranked for " + count + " players" : ""}</p>
      ${games.length ? gameSheet(games) : `<div class="empty-state"><strong>No games match</strong><span>Try another filter, or add a game you own.</span><button class="button small" type="button" data-library-reset>Reset filters</button></div>`}`;
  }

  function personCard(person) {
    const record = personStats(person.name);
    const favorite = record ? topEntry(record.gameCounts) : null;
    const ownedCount = allGames().filter(game => libraryEntry(game.id).owners.some(owner => sameName(owner, person.name))).length;
    const winRate = record && record.placedGames ? Math.round(record.wins / record.placedGames * 100) : null;
    return `
      <article class="person-card" style="--accent:${esc(person.color)}" data-person="${esc(person.id)}">
        <div class="person-head">
          <label class="roster-color" title="Color"><span class="visually-hidden">Color for ${esc(person.name)}</span><span class="roster-color-swatch" aria-hidden="true"></span><input type="color" value="${esc(person.color)}" data-person-color="${esc(person.id)}"></label>
          <label class="grow-control"><span class="visually-hidden">Name</span><input class="person-name-input" type="text" value="${esc(person.name)}" maxlength="60" data-person-name="${esc(person.id)}" autocomplete="off" autocapitalize="words"></label>
          <button class="icon-button" type="button" data-remove-person="${esc(person.id)}" aria-label="Remove ${esc(person.name)}">${icons.markup("trash")}</button>
        </div>
        <dl class="person-stats">
          <div><dt>Games</dt><dd>${record?.games || 0}</dd></div>
          <div><dt>Wins</dt><dd>${record?.wins || 0}</dd></div>
          <div><dt>Win rate</dt><dd>${winRate === null ? "--" : winRate + "%"}</dd></div>
          <div><dt>Podiums</dt><dd>${record?.podiums || 0}</dd></div>
          <div><dt>Avg turn</dt><dd>${record?.turns ? esc(play.fmt(record.turnMs / record.turns)) : "--"}</dd></div>
          <div><dt>Owns</dt><dd>${ownedCount}</dd></div>
        </dl>
        <p class="person-foot">${favorite ? `Most played: <strong>${esc(favorite[0])}</strong> ×${favorite[1]}` : "No saved games yet"}${record?.lastPlayed ? ` · Last played ${esc(play.formatDateStamp(record.lastPlayed))}` : ""}</p>
      </article>`;
  }

  function renderPeopleTab() {
    const ranked = people().slice().sort((a, b) => (personStats(b.name)?.wins || 0) - (personStats(a.name)?.wins || 0) || (personStats(b.name)?.games || 0) - (personStats(a.name)?.games || 0) || a.name.localeCompare(b.name));
    return `
      <section class="panel add-person">
        <form class="custom-add" data-add-person>
          <label class="grow-control"><span class="visually-hidden">New person</span><input name="name" type="text" maxlength="60" placeholder="Add a person" autocomplete="off" autocapitalize="words" required></label>
          <label class="roster-color" title="Color"><span class="visually-hidden">Color</span><span class="roster-color-swatch" aria-hidden="true"></span><input name="color" type="color" value="${esc(STANDARD_COLORS[people().length % STANDARD_COLORS.length].value)}"></label>
          <button class="button primary" type="submit">${symbol("personAdd")}<span>Add person</span></button>
        </form>
        <p class="setting-note">People appear as quick-add players in Setup and as owners in the Library. Records come from saved History; renaming updates history and owners too.</p>
      </section>
      <div class="people-grid">${ranked.map(personCard).join("") || `<div class="empty-state"><strong>No people yet</strong><span>Add the people you play with.</span></div>`}</div>`;
  }

  function renderLibrary() {
    hideSheetInfo();
    if (!libraryRoot) return;
    const ui = moduleState();
    const tableOptionsOpen = Boolean(libraryRoot.querySelector(".library-table-options")?.open);
    const focusSelector = document.activeElement?.matches?.("[data-library-search]") ? "[data-library-search]" : "";
    libraryRoot.innerHTML = `
      <div class="library">
        ${libraryControlsMarkup()}
        ${ui.tab === "people" ? renderPeopleTab() : renderGamesTab()}
      </div>`;
    if (tableOptionsOpen && libraryRoot.querySelector(".library-table-options")) libraryRoot.querySelector(".library-table-options").open = true;
    if (focusSelector) {
      const input = libraryRoot.querySelector(focusSelector);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
    emit("app:viewrendered");
  }

  function mutateLibrary(gameId, update, reason) {
    storage.mutate(next => {
      const games = next.workspace.library.games;
      const entry = Object.assign({ owned: false, owners: [], wishlist: false, rating: 0, note: "" }, games[gameId] || {});
      update(entry);
      if (!entry.owned) entry.owners = [];
      if (entry.owned || entry.wishlist || entry.rating || entry.note || Object.values(entry.metadata || {}).some(Boolean)) games[gameId] = entry;
      else delete games[gameId];
    }, { reason: reason || "library-edit" });
  }

  function updateLibraryUi(update) {
    storage.mutate(next => update(next.modules.library), { reason: "library-filter", touch: false });
  }

  /* ---------- Game dialog ---------- */

  function gameDialogMarkup(game) {
    const entry = libraryEntry(game.id);
    const record = gameStats(game.id);
    const owners = entry.owners;
    const winners = record ? Array.from(record.winners.entries()).sort((a, b) => b[1] - a[1]) : [];
    const recent = record ? record.records.slice(0, 6) : [];
    return `
      <div class="game-detail">
        <p class="game-detail-range">${esc(play.gameRangeText(game)).replace("\n", "<br>")}</p>
        ${bggLookupMarkup(game, false)}
        <section class="detail-section"><h3>Catalog details</h3><p class="setting-note">BGG rating is recorded manually (out of 10). Verified refers to the game’s colors.</p><div class="custom-game-fields">${[["year", "Published year", "number", "min=\"1\" max=\"9999\" step=\"1\""], ["bggRating", "BGG rating", "number", "min=\"1\" max=\"10\" step=\"0.01\""], ["category", "Category", "text", "maxlength=\"100\""], ["bggId", "BGG game ID", "text", "inputmode=\"numeric\" pattern=\"[0-9]+\" maxlength=\"12\""]].map(([key, label, type, attrs]) => `<label class="field"><span>${label}</span><input data-detail-metadata="${key}" type="${type}" ${attrs} value="${esc(sheetValue(game, key) || '')}"></label>`).join("")}</div></section>
        <div class="fit-strip" aria-label="Player count fit">${playerCountBadges(game)}<span class="player-fit-legend"><span class="is-best">Best</span><span class="is-good">Good</span><span class="is-avoid">Bad</span><span class="is-plays">Neutral</span></span></div>
        <section class="detail-section">
          <h3>Ownership</h3>
          <div class="segmented" role="group" aria-label="Ownership">
            <button type="button" data-detail-owned="true" aria-pressed="${entry.owned}">${symbol("checkmark")}<span>Owned</span></button>
            <button type="button" data-detail-owned="false" aria-pressed="${!entry.owned}"><span>Not owned</span></button>
            <button type="button" data-detail-wishlist aria-pressed="${entry.wishlist}">${symbol("heart")}<span>Wishlist</span></button>
          </div>
          <div class="owner-picker" ${entry.owned ? "" : "hidden"}>
            <span class="eyebrow">Who owns it?</span>
            <div class="chip-grid">${people().map(person => `<button class="chip-btn" type="button" data-detail-owner="${esc(person.name)}" aria-pressed="${owners.some(owner => sameName(owner, person.name))}" style="--accent:${esc(person.color)}"><span class="dot" aria-hidden="true"></span><span>${esc(person.name)}</span></button>`).join("")}</div>
            <p class="setting-note">Leave everyone unselected if it belongs to the whole table.</p>
          </div>
          <div class="rating-picker">
            <label class="field"><span>My rating</span><select data-detail-rating-select>${Array.from({ length: 11 }, (_, index) => index / 2).map(value => `<option value="${value}" ${entry.rating === value ? 'selected' : ''}>${value ? `${value} / 5 stars` : 'Not rated'}</option>`).join("")}</select></label>
            ${starsMarkup(entry.rating)}
          </div>
          <label class="field"><span>Notes</span><textarea data-detail-note rows="2" maxlength="1000" placeholder="House rules, missing pieces, expansions…">${esc(entry.note)}</textarea></label>
        </section>
        <section class="detail-section">
          <h3>Your plays</h3>
          ${record ? `
            <dl class="detail-stats">
              <div><dt>Plays</dt><dd>${record.plays}</dd></div>
              <div><dt>Last played</dt><dd>${esc(play.formatDateStamp(record.lastPlayed))}</dd></div>
              <div><dt>Avg length</dt><dd>${esc(play.fmtDuration(record.totalMs / record.plays))}</dd></div>
              <div><dt>Longest</dt><dd>${esc(play.fmtDuration(record.longest))}</dd></div>
              <div><dt>Avg setup</dt><dd>${esc(play.fmt(record.setupMs / record.plays))}</dd></div>
              <div><dt>Avg turn</dt><dd>${record.turns ? esc(play.fmt(record.turnMs / record.turns)) : "--"}</dd></div>
            </dl>
            ${winners.length ? `<div class="winner-list"><span class="eyebrow">Wins</span>${winners.map(([name, count]) => `<span class="count-pill">${symbol("crown")}${esc(name)} ×${count}</span>`).join("")}</div>` : ""}
            <ul class="recent-list">${recent.map(item => `<li><button class="text-link" type="button" data-open-history="${esc(item.id)}">${esc(play.formatDateStamp(item.gameEndedAt))}</button><span>${esc(item.players.filter(player => player.type === "player").map(player => player.name).join(", "))}</span><span>${esc(play.fmtDuration(stats.gameTotals(item).total))}</span></li>`).join("")}</ul>
          ` : `<p class="setting-note">No saved plays yet. Finished games appear here automatically.</p>`}
        </section>
      </div>`;
  }

  function renderGameDialog() {
    const game = play.gameById(openGameId);
    if (!game) return;
    document.querySelector("#gameDialogTitle").innerHTML = play.gameTitleMarkup(game.name);
    document.querySelector("[data-game-dialog-eyebrow]").textContent = game.custom ? "Added game" : game.verified ? "Game · verified colors" : "Game";
    document.querySelector("#gameDialogBody").innerHTML = gameDialogMarkup(game);
    document.querySelector("#gameDialogFooter").innerHTML = `${game.custom ? `<button class="button" type="button" data-edit-custom="${esc(game.id)}">${symbol("pencil")}<span>Edit game</span></button>` : ""}<span class="dialog-footer-spacer"></span><button class="button" type="button" data-close-dialog="gameDialog">Close</button><button class="button primary" type="button" data-play-game="${esc(game.id)}">${symbol("play")}<span>Play this game</span></button>`;
    icons.mount(document.querySelector("#gameDialog"));
  }

  function openGame(gameId, trigger) {
    if (!play.gameById(gameId)) return;
    openGameId = gameId;
    renderGameDialog();
    components.openDialog("#gameDialog", { trigger, focus: "[data-detail-owned='true']" });
  }

  function handleGameDialogClick(event) {
    const game = play.gameById(openGameId);
    if (!game) return;
    if (event.target.closest("[data-bgg-apply]")) { applyBggLink(event); return; }
    const owned = event.target.closest("[data-detail-owned]");
    if (owned) { mutateLibrary(game.id, entry => { entry.owned = owned.dataset.detailOwned === "true"; if (entry.owned) entry.wishlist = false; }); refreshAfterLibraryChange(); return; }
    if (event.target.closest("[data-detail-wishlist]")) { mutateLibrary(game.id, entry => { entry.wishlist = !entry.wishlist; }); refreshAfterLibraryChange(); return; }
    const owner = event.target.closest("[data-detail-owner]");
    if (owner) {
      mutateLibrary(game.id, entry => {
        const name = owner.dataset.detailOwner;
        entry.owners = entry.owners.some(item => sameName(item, name)) ? entry.owners.filter(item => !sameName(item, name)) : entry.owners.concat(name);
      });
      refreshAfterLibraryChange();
      return;
    }
    const rating = event.target.closest("[data-detail-rating]");
    if (rating) { mutateLibrary(game.id, entry => { entry.rating = Number(rating.dataset.detailRating) || 0; }); refreshAfterLibraryChange(); return; }
    const historyButton = event.target.closest("[data-open-history]");
    if (historyButton) {
      components.closeDialog("#gameDialog");
      emit("app:switchview", { view: "history" });
      openHistory(historyButton.dataset.openHistory);
      return;
    }
    const edit = event.target.closest("[data-edit-custom]");
    if (edit) { components.closeDialog("#gameDialog"); openCustomGame(edit.dataset.editCustom); return; }
    const playButton = event.target.closest("[data-play-game]");
    if (playButton) { components.closeDialog("#gameDialog"); startGameFromLibrary(playButton.dataset.playGame); }
  }

  function refreshAfterLibraryChange() {
    const focusKey = document.activeElement && Array.from(document.activeElement.attributes || []).find(attribute => attribute.name.startsWith("data-detail-"));
    const focusSelector = focusKey ? `[${focusKey.name}${focusKey.value ? `="${CSS.escape(focusKey.value)}"` : ""}]` : "";
    if (document.querySelector("#gameDialog").open) renderGameDialog();
    if (focusSelector) document.querySelector("#gameDialog " + focusSelector)?.focus({ preventScroll: true });
    if (appState().ui.view === "library") renderLibrary();
  }

  function startGameFromLibrary(gameId) {
    if (play.isSessionRunning()) {
      components.toast("Finish or end the running session first.", { title: "Session in progress", kind: "warning" });
      return;
    }
    const present = moduleState().present;
    emit("app:switchview", { view: "play" });
    play.playGame(gameId, present);
    if (present.length) components.toast(present.join(", ") + " are seated. Adjust colors and order, then press Start.", { title: play.gameAccessibleName(play.gameById(gameId).name) + " is ready", kind: "success" });
  }

  /* ---------- Custom games ---------- */

  function openCustomGame(gameId) {
    const form = document.querySelector("#customGameForm");
    const game = gameId ? appState().workspace.library.customGames.find(item => item.id === gameId) : null;
    editingCustomGameId = game ? game.id : "";
    form.reset();
    document.querySelector("#customGameTitle").textContent = game ? "Edit game" : "Add a game";
    document.querySelector("#customGameDelete").hidden = !game;
    document.querySelector("#customGameValidation").hidden = true;
    if (game) ["name", "minPlayers", "maxPlayers", "bestPlayers", "recommendedPlayers", "avoidPlayers", "complexityWeight", "minMinutes", "maxMinutes"].forEach(key => {
      const value = game[key];
      form.elements[key].value = value === null || value === undefined || value === "--" ? "" : value;
    });
    let lookup = form.querySelector("[data-bgg-lookup]");
    if (lookup) lookup.remove();
    form.querySelector(".custom-game-fields").insertAdjacentHTML("beforeend", bggLookupMarkup(game, true));
    if (!game) {
      const query = form.querySelector("[data-bgg-query]");
      query.value = form.elements.name.value;
      updateBggSearch({ target: query });
    }
    components.openDialog("#customGameDialog", { focus: "#customGameName" });
  }

  function saveCustomGame(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const validation = document.querySelector("#customGameValidation");
    const name = u.cleanLine(values.name, 100);
    const minPlayers = Number(values.minPlayers);
    const maxPlayers = Number(values.maxPlayers);
    const minMinutes = Number(values.minMinutes);
    const maxMinutes = Number(values.maxMinutes);
    let error = "";
    if (!name) error = "Enter a game name.";
    else if (values.bggLink?.trim() && !bggIdFromInput(values.bggLink)) error = "Paste a valid HTTPS BoardGameGeek game link or numeric game ID.";
    else if (!(minPlayers >= 1 && maxPlayers >= minPlayers)) error = "Max players must be at least min players.";
    else if (!(minMinutes >= 1 && maxMinutes >= minMinutes)) error = "Max minutes must be at least min minutes.";
    else if (play.allGames().some(game => game.id !== editingCustomGameId && sameName(game.name, name))) error = "A game with that name is already in the library.";
    validation.hidden = !error;
    validation.textContent = error;
    if (error) return;
    const id = editingCustomGameId || "custom-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + "-" + Date.now().toString(36);
    const record = {
      id,
      name,
      minPlayers,
      maxPlayers,
      minMinutes,
      maxMinutes,
      complexityWeight: values.complexityWeight ? Number(values.complexityWeight) : null,
      bestPlayers: values.bestPlayers,
      recommendedPlayers: values.recommendedPlayers,
      avoidPlayers: values.avoidPlayers || "--",
      createdAt: u.isoNow()
    };
    const isNew = !editingCustomGameId;
    storage.mutate(next => {
      const list = next.workspace.library.customGames;
      const index = list.findIndex(item => item.id === id);
      if (index >= 0) list[index] = Object.assign({}, list[index], record, { createdAt: list[index].createdAt });
      else list.push(record);
      if (isNew) next.workspace.library.games[id] = { owned: true, owners: [], wishlist: false, rating: 0, note: "" };
      const entry = next.workspace.library.games[id] || { owned: false, owners: [], wishlist: false, rating: 0, note: "" };
      entry.metadata = Object.assign({}, entry.metadata, { bggId: bggIdFromInput(values.bggLink) });
      next.workspace.library.games[id] = entry;
    }, { reason: "custom-game" });
    components.closeDialog("#customGameDialog", "saved");
    components.toast(isNew ? name + " was added to your library as owned." : name + " was updated.", { title: isNew ? "Game added" : "Game saved", kind: "success" });
    renderLibrary();
  }

  async function deleteCustomGame() {
    const game = appState().workspace.library.customGames.find(item => item.id === editingCustomGameId);
    if (!game) return;
    const accepted = await components.confirm({ title: "Delete " + game.name + "?", message: "The game is removed from your library. Saved history for it is kept.", confirmLabel: "Delete game", danger: true });
    if (!accepted) return;
    storage.mutate(next => {
      next.workspace.library.customGames = next.workspace.library.customGames.filter(item => item.id !== game.id);
      delete next.workspace.library.games[game.id];
    }, { reason: "custom-game-delete" });
    components.closeDialog("#customGameDialog", "deleted");
    renderLibrary();
  }

  /* ---------- People ---------- */

  function addPerson(event) {
    event.preventDefault();
    const form = event.target.closest("form");
    const name = u.cleanLine(form.elements.name.value, 60);
    if (!name) return;
    if (people().some(person => sameName(person.name, name))) {
      components.toast(name + " is already in your people list.", { title: "Already added", kind: "info" });
      return;
    }
    storage.mutate(next => { next.workspace.people.push({ id: u.uid("person"), name, color: u.normalizeColor(form.elements.color.value, "#94a3b8") }); }, { reason: "people-add" });
    renderLibrary();
    libraryRoot.querySelector("[data-add-person] input[name='name']")?.focus();
  }

  function renamePerson(id, value) {
    const person = people().find(item => item.id === id);
    const name = u.cleanLine(value, 60);
    if (!person || !name || person.name === name) { renderLibrary(); return; }
    if (people().some(item => item.id !== id && sameName(item.name, name))) {
      components.toast(name + " is already in your people list.", { title: "Name in use", kind: "warning" });
      renderLibrary();
      return;
    }
    const previous = person.name;
    storage.mutate(next => {
      next.workspace.people.forEach(item => { if (item.id === id) item.name = name; });
      Object.values(next.workspace.library.games).forEach(entry => { entry.owners = entry.owners.map(owner => sameName(owner, previous) ? name : owner); });
      next.workspace.history.forEach(record => record.players.forEach(player => { if (player.type === "player" && sameName(player.name, previous)) player.name = name; }));
      next.modules.library.present = next.modules.library.present.map(item => sameName(item, previous) ? name : item);
    }, { reason: "people-rename" });
    invalidateStats();
    renderLibrary();
    components.toast(previous + " is now " + name + " in people, owners, and history.", { title: "Renamed", kind: "success" });
  }

  async function removePerson(id) {
    const person = people().find(item => item.id === id);
    if (!person) return;
    const accepted = await components.confirm({ title: "Remove " + person.name + "?", message: "They are removed from quick-add people and game owners. Saved games keep their name.", confirmLabel: "Remove", danger: true });
    if (!accepted) return;
    storage.mutate(next => {
      next.workspace.people = next.workspace.people.filter(item => item.id !== id);
      Object.values(next.workspace.library.games).forEach(entry => { entry.owners = entry.owners.filter(owner => !sameName(owner, person.name)); });
      next.modules.library.present = next.modules.library.present.filter(name => !sameName(name, person.name));
    }, { reason: "people-remove" });
    renderLibrary();
  }

  /* ---------- History ---------- */

  function historyFilters() {
    return appState().modules.history;
  }

  function historySearchText(record) {
    return [record.gameName, play.formatDateStamp(record.gameEndedAt), record.note].concat(record.players.map(player => player.name + " " + player.factionName)).join(" ").toLowerCase();
  }

  function historyMeta(record) {
    const winners = record.players.filter(player => stats.placementNumber(player) === 1).map(player => player.name);
    return play.formatDateStamp(record.gameEndedAt) + (winners.length ? " · won by " + winners.join(" & ") : "");
  }

  function personSummary(name) {
    const record = personStats(name);
    return record ? record.games + (record.games === 1 ? " game" : " games") + " · " + record.wins + (record.wins === 1 ? " win" : " wins") : "No saved games";
  }

  function filteredHistory() {
    const filters = historyFilters();
    const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return history().filter(record => {
      if (filters.game !== "all" && record.gameId !== filters.game) return false;
      if (filters.person !== "all" && !record.players.some(player => player.type === "player" && sameName(player.name, filters.person))) return false;
      if (terms.length) {
        const text = historySearchText(record);
        if (!terms.every(term => text.includes(term))) return false;
      }
      return true;
    });
  }

  function historyRow(record) {
    const totals = stats.gameTotals(record);
    const seated = stats.sortPlayersByPlacement(record.players.filter(player => player.type === "player"));
    const winners = seated.filter(player => stats.placementNumber(player) === 1);
    return `
      <li>
        <button class="history-row" type="button" data-open-history="${esc(record.id)}">
          <span class="history-date"><strong>${esc(new Date(record.gameEndedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</strong><small>${esc(new Date(record.gameEndedAt).getFullYear())}</small></span>
          <span class="history-main">
            <span class="history-title">${play.gameTitleMarkup(record.gameName)}</span>
            <span class="history-players">${seated.map(player => `<span class="mini-player ${stats.placementNumber(player) === 1 ? "is-winner" : ""}" style="--accent:${esc(player.color)}"><span class="dot" aria-hidden="true"></span>${esc(player.name)}${player.placement ? `<small>${esc(stats.placementLabel(player.placement))}</small>` : ""}</span>`).join("")}</span>
          </span>
          <span class="history-side">
            ${winners.length ? `<span class="own-pill">${symbol("trophy")}${esc(winners.map(player => player.name).join(" & "))}</span>` : `<span class="own-pill is-unowned">No placements</span>`}
            <span class="muted">${esc(play.fmtDuration(totals.total))} · ${totals.turns} turns</span>
          </span>
        </button>
      </li>`;
  }

  function historyOverview(records) {
    const totalMs = records.reduce((sum, record) => sum + stats.gameTotals(record).total, 0);
    const gameCounts = new Map();
    const winCounts = new Map();
    records.forEach(record => {
      gameCounts.set(record.gameName, (gameCounts.get(record.gameName) || 0) + 1);
      record.players.filter(player => player.type === "player" && stats.placementNumber(player) === 1).forEach(player => winCounts.set(player.name, (winCounts.get(player.name) || 0) + 1));
    });
    const topGame = topEntry(gameCounts);
    const topWinner = topEntry(winCounts);
    return `
      <section class="kpi-row" aria-label="History totals">
        <div class="kpi"><span class="eyebrow">Games</span><strong>${records.length}</strong></div>
        <div class="kpi"><span class="eyebrow">Time played</span><strong>${esc(play.fmtDuration(totalMs))}</strong></div>
        <div class="kpi"><span class="eyebrow">Most played</span><strong class="kpi-text">${topGame ? esc(play.gameAccessibleName(topGame[0])) : "--"}</strong></div>
        <div class="kpi"><span class="eyebrow">Most wins</span><strong class="kpi-text">${topWinner ? esc(topWinner[0]) + " ×" + topWinner[1] : "--"}</strong></div>
      </section>`;
  }

  function renderHistory() {
    if (!historyRoot) return;
    const filters = historyFilters();
    const records = filteredHistory();
    const gameOptions = Array.from(new Map(history().map(record => [record.gameId, record.gameName])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const personOptions = Array.from(new Set(history().flatMap(record => record.players.filter(player => player.type === "player").map(player => player.name)))).sort((a, b) => a.localeCompare(b));
    const focusSearch = document.activeElement?.matches?.("[data-history-search]");
    historyRoot.innerHTML = `
      <div class="history">
        <header class="play-bar library-bar">
          <div class="summary-title"><span class="eyebrow">Saved automatically</span><h2>Game History</h2></div>
          <div class="filter-row">
            <label class="search-field grow-control"><span class="visually-hidden">Search history</span><input type="search" data-history-search value="${esc(filters.search)}" placeholder="Search games or players" autocomplete="off"></label>
            <label class="select-field"><span class="eyebrow">Game</span><select data-history-game><option value="all">All games</option>${gameOptions.map(([id, name]) => `<option value="${esc(id)}" ${filters.game === id ? "selected" : ""}>${esc(play.gameAccessibleName(name))}</option>`).join("")}</select></label>
            <label class="select-field"><span class="eyebrow">Player</span><select data-history-person><option value="all">Everyone</option>${personOptions.map(name => `<option value="${esc(name)}" ${filters.person === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label>
          </div>
        </header>
        ${history().length ? historyOverview(records) : ""}
        ${records.length ? `<ol class="history-list">${records.map(historyRow).join("")}</ol>` : history().length
          ? `<div class="empty-state"><strong>No games match</strong><span>Try another search or filter.</span><button class="button small" type="button" data-history-reset>Reset filters</button></div>`
          : `<div class="empty-state">${symbol("history")}<strong>No saved games yet</strong><span>Finish a game in Play and it is saved here with its full statistics.</span><button class="button small primary" type="button" data-go-play>Start a game</button></div>`}
      </div>`;
    if (focusSearch) {
      const input = historyRoot.querySelector("[data-history-search]");
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
    emit("app:viewrendered");
  }

  function historyRecordById(id) {
    return history().find(record => record.id === id) || null;
  }

  function renderHistoryDialog() {
    const record = historyRecordById(openHistoryId);
    if (!record) return;
    document.querySelector("#historyDialogTitle").innerHTML = play.gameTitleMarkup(record.gameName);
    document.querySelector("[data-history-date]").textContent = play.formatDateStamp(record.gameEndedAt) + " · " + new Date(record.gameEndedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    document.querySelector("#historyDialogBody").innerHTML = `<div class="summary-capture">${stats.summaryMarkup(record, { interactive: true })}</div>`;
  }

  function openHistory(id, trigger) {
    if (!historyRecordById(id)) return;
    openHistoryId = id;
    renderHistoryDialog();
    components.openDialog("#historyDialog", { trigger, focus: "[data-close-dialog='historyDialog']" });
  }

  function setHistoryPlacement(playerId, value) {
    const record = u.clone(historyRecordById(openHistoryId));
    if (!record || !stats.applyPlacement(record, playerId, value)) return;
    storage.mutate(next => {
      const target = next.workspace.history.find(item => item.id === record.id);
      if (target) target.players = record.players;
    }, { reason: "history-placement" });
    invalidateStats();
    renderHistoryDialog();
    document.querySelector(`#historyDialog [data-placement-id="${CSS.escape(playerId)}"]`)?.focus({ preventScroll: true });
    renderHistory();
  }

  async function deleteHistory() {
    const record = historyRecordById(openHistoryId);
    if (!record) return;
    const accepted = await components.confirm({ title: "Delete this game?", message: play.gameAccessibleName(record.gameName) + " from " + play.formatDateStamp(record.gameEndedAt) + " is removed from History, library plays, and people records.", confirmLabel: "Delete game", danger: true, trigger: document.querySelector("#historyDeleteButton") });
    if (!accepted) return;
    storage.mutate(next => { next.workspace.history = next.workspace.history.filter(item => item.id !== record.id); }, { reason: "history-delete" });
    invalidateStats();
    components.closeDialog("#historyDialog", "deleted");
    renderHistory();
    emit("app:gamechange");
    components.toast("The saved game was deleted.", { title: "Deleted", kind: "info" });
  }

  function replayHistory() {
    const record = historyRecordById(openHistoryId);
    if (!record) return;
    if (!play.setupFromRecord(record)) return;
    components.closeDialog("#historyDialog", "replay");
    emit("app:switchview", { view: "play" });
  }

  /* ---------- Sample data for Developer Mode ---------- */

  function addSampleHistory(count) {
    const crew = people();
    if (crew.length < 2) return 0;
    const games = GAME_PRESETS.filter(game => game.id !== "custom");
    const records = [];
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      const game = games[Math.floor(Math.random() * games.length)];
      const colors = play.colorsForGame(game);
      const seatCount = Math.max(game.minPlayers, Math.min(game.maxPlayers, crew.length, 2 + Math.floor(Math.random() * 4)));
      const seated = crew.slice().sort(() => Math.random() - 0.5).slice(0, seatCount);
      const endedAt = now - Math.floor(Math.random() * 90) * 86400000 - Math.floor(Math.random() * 3600000);
      const turnsPerPlayer = 3 + Math.floor(Math.random() * 5);
      const setup = (120 + Math.floor(Math.random() * 400)) * 1000;
      let cursor = endedAt;
      const players = seated.map((person, seat) => ({ id: u.uid("entry"), name: person.name, type: "player", color: (colors[seat] || STANDARD_COLORS[seat]).value, factionName: colors[seat] && !/^[A-Z][a-z]+$/.test(colors[seat].name) ? colors[seat].name : "", placement: "", turns: [] }));
      const segments = [];
      for (let round = 0; round < turnsPerPlayer; round += 1) players.forEach(player => segments.push({ player, duration: (40 + Math.floor(Math.random() * 220)) * 1000 }));
      const totalTurns = segments.reduce((sum, segment) => sum + segment.duration, 0);
      cursor = endedAt - totalTurns;
      segments.forEach(segment => {
        segment.player.turns.push({ startedAt: cursor, duration: segment.duration, endedAt: cursor + segment.duration });
        cursor += segment.duration;
      });
      players.slice().sort(() => Math.random() - 0.5).forEach((player, rank) => { player.placement = String(rank + 1); });
      const firstTurn = endedAt - totalTurns;
      records.push({ id: u.uid("game"), gameId: game.id, gameName: game.name, gameStartedAt: firstTurn - setup, firstTurnStartedAt: firstTurn, setupElapsed: setup, gameEndedAt: endedAt, players, pauses: [] });
    }
    storage.mutate(next => {
      next.workspace.history = next.workspace.history.concat(records).sort((a, b) => b.gameEndedAt - a.gameEndedAt);
      records.forEach(record => {
        if (!next.workspace.library.games[record.gameId]) next.workspace.library.games[record.gameId] = { owned: true, owners: [record.players[0].name], wishlist: false, rating: 0, note: "" };
      });
    }, { reason: "sample-history" });
    invalidateStats();
    return records.length;
  }

  /* ---------- Events ---------- */

  function handleLibraryClick(event) {
    const tab = event.target.closest("[data-library-tab]");
    if (tab) { updateLibraryUi(ui => { ui.tab = tab.dataset.libraryTab; }); renderLibrary(); return; }
    if (event.target.closest("[data-add-game]")) { openCustomGame(""); return; }
    const present = event.target.closest("[data-present]");
    if (present) {
      updateLibraryUi(ui => {
        const name = present.dataset.present;
        ui.present = ui.present.includes(name) ? ui.present.filter(item => item !== name) : ui.present.concat(name);
        if (ui.present.length && ui.sortBy === "name") ui.sortBy = "fit";
      });
      renderLibrary();
      libraryRoot.querySelector(`[data-present="${CSS.escape(present.dataset.present)}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-clear-present]")) { updateLibraryUi(ui => { ui.present = []; }); renderLibrary(); return; }
    const stepper = event.target.closest("[data-player-count]");
    if (stepper) {
      updateLibraryUi(ui => { ui.playerCount = Math.max(0, Math.min(12, ui.playerCount + Number(stepper.dataset.playerCount))); });
      renderLibrary();
      libraryRoot.querySelector(`[data-player-count="${stepper.dataset.playerCount}"]`)?.focus({ preventScroll: true });
      return;
    }
    const info = event.target.closest("[data-sheet-info]");
    if (info) { showSheetInfo(info, true); return; }
    const heading = event.target.closest("[data-sheet-sort]");
    if (heading) {
      const key = heading.dataset.sheetSort;
      const scroll = libraryRoot.querySelector(".library-sheet");
      const left = scroll?.scrollLeft || 0, top = scroll?.scrollTop || 0;
      updateLibraryUi(ui => { ui.sortDirection = ui.sortBy === key && ui.sortDirection === "asc" ? "desc" : "asc"; ui.sortBy = key; });
      renderLibrary();
      const sheet = libraryRoot.querySelector(".library-sheet");
      if (sheet) { sheet.scrollLeft = left; sheet.scrollTop = top; }
      libraryRoot.querySelector(`[data-sheet-sort="${key}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-library-direction]")) { updateLibraryUi(ui => { ui.sortDirection = ui.sortDirection === "desc" ? "asc" : "desc"; }); renderLibrary(); return; }
    if (event.target.closest("[data-library-reset]")) { updateLibraryUi(ui => { ui.category = "all"; ui.verified = "all"; ui.search = ""; ui.ownership = "all"; ui.sortBy = "fit"; ui.sortDirection = "asc"; ui.playerCount = 0; ui.present = []; }); renderLibrary(); return; }
    const owned = event.target.closest("[data-toggle-owned]");
    if (owned) {
      mutateLibrary(owned.dataset.toggleOwned, entry => { entry.owned = !entry.owned; if (entry.owned) entry.wishlist = false; });
      renderLibrary();
      libraryRoot.querySelector(`[data-toggle-owned="${CSS.escape(owned.dataset.toggleOwned)}"]`)?.focus({ preventScroll: true });
      return;
    }
    const playButton = event.target.closest("[data-play-game]");
    if (playButton) { startGameFromLibrary(playButton.dataset.playGame); return; }
    const open = event.target.closest("[data-open-game]");
    if (open) { openGame(open.dataset.openGame, open); return; }
    const remove = event.target.closest("[data-remove-person]");
    if (remove) removePerson(remove.dataset.removePerson);
  }

  function handleLibraryInput(event) {
    if (event.target.matches("[data-library-search]")) {
      const value = u.cleanLine(event.target.value, 200);
      updateLibraryUi(ui => { ui.search = value; });
      renderLibrary();
    }
  }

  function handleLibraryChange(event) {
    if (event.target.matches("[data-library-ownership]")) { const value = event.target.value; updateLibraryUi(ui => { ui.ownership = value; }); renderLibrary(); }
    else if (event.target.matches("[data-library-category], [data-library-verified]")) { const key = event.target.matches("[data-library-category]") ? "category" : "verified"; const value = event.target.value; updateLibraryUi(ui => { ui[key] = value; }); renderLibrary(); }
    else if (event.target.matches("[data-library-sort]")) { const value = event.target.value; updateLibraryUi(ui => { ui.sortBy = value; ui.sortDirection = "asc"; }); renderLibrary(); }
    else if (event.target.matches("[data-person-name]")) renamePerson(event.target.dataset.personName, event.target.value);
    else if (event.target.matches("[data-person-color]")) {
      const id = event.target.dataset.personColor;
      const color = u.normalizeColor(event.target.value, "#94a3b8");
      storage.mutate(next => { next.workspace.people.forEach(person => { if (person.id === id) person.color = color; }); }, { reason: "people-color" });
      event.target.closest(".person-card")?.style.setProperty("--accent", color);
    }
  }

  function handleHistoryClick(event) {
    const open = event.target.closest("[data-open-history]");
    if (open) { openHistory(open.dataset.openHistory, open); return; }
    if (event.target.closest("[data-history-reset]")) {
      storage.mutate(next => { next.modules.history = { search: "", game: "all", person: "all" }; }, { reason: "history-filter", touch: false });
      renderHistory();
      return;
    }
    if (event.target.closest("[data-go-play]")) emit("app:switchview", { view: "play" });
  }

  function handleHistoryFilter(event) {
    const target = event.target;
    const key = target.matches("[data-history-search]") ? "search" : target.matches("[data-history-game]") ? "game" : target.matches("[data-history-person]") ? "person" : "";
    if (!key) return;
    const value = key === "search" ? u.cleanLine(target.value, 200) : target.value;
    storage.mutate(next => { next.modules.history[key] = value; }, { reason: "history-filter", touch: false });
    renderHistory();
  }

  function init() {
    libraryRoot = document.querySelector("#libraryView");
    historyRoot = document.querySelector("#historyView");
    libraryRoot.addEventListener("click", handleLibraryClick);
    libraryRoot.addEventListener("mouseover", event => { const button = event.target.closest("[data-sheet-info]"); if (button && !button.contains(event.relatedTarget)) showSheetInfo(button, false); });
    libraryRoot.addEventListener("mouseout", event => { const button = event.target.closest("[data-sheet-info]"); if (button && !button.contains(event.relatedTarget) && !infoPinned) hideSheetInfo(); });
    libraryRoot.addEventListener("focusin", event => { const button = event.target.closest("[data-sheet-info]"); if (button) showSheetInfo(button, false); });
    libraryRoot.addEventListener("focusout", () => { if (!infoPinned) hideSheetInfo(); });
    window.addEventListener("scroll", hideSheetInfo, true);
    document.addEventListener("click", event => {
      const options = libraryRoot.querySelector(".library-table-options[open]");
      if (options && !event.target.closest(".library-table-options")) options.open = false;
    });
    libraryRoot.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const options = libraryRoot.querySelector(".library-table-options[open]");
      if (options) { options.open = false; options.querySelector("summary").focus(); event.preventDefault(); }
    });
    libraryRoot.addEventListener("input", handleLibraryInput);
    libraryRoot.addEventListener("change", handleLibraryChange);
    libraryRoot.addEventListener("submit", event => { if (event.target.matches("[data-add-person]")) addPerson(event); });
    libraryRoot.addEventListener("keydown", event => {
      if (event.target.matches("[data-person-name]") && event.key === "Enter") { event.preventDefault(); event.target.blur(); }
    });
    historyRoot.addEventListener("click", handleHistoryClick);
    historyRoot.addEventListener("input", event => { if (event.target.matches("[data-history-search]")) handleHistoryFilter(event); });
    historyRoot.addEventListener("change", event => { if (!event.target.matches("[data-history-search]")) handleHistoryFilter(event); });
    document.querySelector("#gameDialogBody").addEventListener("click", handleGameDialogClick);
    document.querySelector("#gameDialogFooter").addEventListener("click", handleGameDialogClick);
    document.querySelector("#gameDialogBody").addEventListener("input", updateBggSearch);
    document.querySelector("#customGameForm").addEventListener("input", event => {
      updateBggSearch(event);
      if (event.target.name === "name") {
        const query = event.currentTarget.querySelector("[data-bgg-query]");
        if (query) { query.value = event.target.value; updateBggSearch({ target: query }); }
      }
    });
    ["#customGameForm", "#gameDialogBody"].forEach(selector => document.querySelector(selector).addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      if (event.target.matches("[data-bgg-query]")) { event.preventDefault(); event.target.closest("[data-bgg-lookup]").querySelector("[data-bgg-search]").click(); }
      if (event.target.matches("[data-bgg-link]") && event.target.closest("#gameDialogBody")) { event.preventDefault(); event.target.closest("[data-bgg-lookup]").querySelector("[data-bgg-apply]").click(); }
    }));
    document.querySelector("#gameDialogBody").addEventListener("change", event => {
      if (event.target.matches("[data-detail-rating-select]")) {
        mutateLibrary(openGameId, entry => { entry.rating = Number(event.target.value); });
        refreshAfterLibraryChange();
        return;
      }
      if (event.target.matches("[data-detail-metadata]")) {
        if (!event.target.checkValidity()) { event.target.reportValidity(); return; }
        const key = event.target.dataset.detailMetadata;
        const value = event.target.value.trim();
        mutateLibrary(openGameId, entry => { entry.metadata = Object.assign({}, entry.metadata, { [key]: value }); });
        if (appState().ui.view === "library") renderLibrary();
      }
      if (event.target.matches("[data-detail-note]")) {
        const note = u.cleanText(event.target.value, 1000).trim();
        mutateLibrary(openGameId, entry => { entry.note = note; });
        if (appState().ui.view === "library") renderLibrary();
      }
    });
    document.querySelector("#customGameForm").addEventListener("submit", saveCustomGame);
    document.querySelector("#customGameDelete").addEventListener("click", deleteCustomGame);
    document.querySelector("#historyDialogBody").addEventListener("change", event => {
      const select = event.target.closest("[data-placement-id]");
      if (select) setHistoryPlacement(select.dataset.placementId, select.value);
    });
    document.querySelector("#historyDeleteButton").addEventListener("click", deleteHistory);
    document.querySelector("#historyReplayButton").addEventListener("click", replayHistory);
    document.querySelector("#historyShareButton").addEventListener("click", event => {
      const record = historyRecordById(openHistoryId);
      if (record) play.openShare(record, document.querySelector("#historyDialogBody .summary-capture"), event.currentTarget);
    });
    window.addEventListener("app:statechange", event => {
      if (["import", "recovery", "erase-all", "history-save", "history-placement", "legacy-import", "sample-history", "sync-download", "sync-merge"].includes(event.detail?.reason)) invalidateStats();
    });
  }

  App.library = {
    init,
    renderLibrary,
    renderHistory,
    openGame,
    openHistory,
    showPeople: () => { updateLibraryUi(ui => { ui.tab = "people"; }); renderLibrary(); },
    showPerson: name => {
      updateLibraryUi(ui => { ui.tab = "people"; });
      renderLibrary();
      const person = people().find(item => sameName(item.name, name));
      if (person) requestAnimationFrame(() => libraryRoot.querySelector(`[data-person="${CSS.escape(person.id)}"]`)?.scrollIntoView({ block: "center" }));
    },
    allGames: () => allGames().filter(game => game.id !== "custom"),
    gameSearchText,
    gameSearchMeta,
    historySearchText,
    historyMeta,
    personSummary,
    playCount,
    addSampleHistory
  };
})();
