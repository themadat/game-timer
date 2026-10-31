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
  const MAIN_GAME_TYPES = ["Board", "Cards", "Coop", "1v1", "Table"];
  const ADDITIONAL_GAME_TYPES = App.stateModel.additionalGameTypes;
  const SORT_LABELS = { fit: "Best fit", name: "Name", plays: "Most played", recent: "Recently played", length: "Play time", weight: "Weight" };

  const PASTE_CATALOG_FIELDS = ["name", "minPlayers", "maxPlayers", "minMinutes", "maxMinutes", "complexityWeight", "bestPlayers", "recommendedPlayers", "avoidPlayers"];
  const PASTE_LABELS = { name: "Name", alternativeNames: "Alternative names", year: "Published year", bggId: "BGG game ID", bggRating: "BGG rating", minPlayers: "Minimum players", maxPlayers: "Maximum players", minMinutes: "Shortest time (min)", maxMinutes: "Longest time (min)", complexityWeight: "Weight", additionalTypes: "Additional Types", mechanisms: "Mechanisms", expansions: "Expansions", bestPlayers: "Best player counts", recommendedPlayers: "Good player counts", avoidPlayers: "Bad player counts" };
  const DECIMAL_PLACES = { complexityWeight: 2, bggRating: 1, pasteBggRating: 1 };
  function fieldText(key, value) {
    if (Array.isArray(value)) return value.join("; ") || "—";
    if (value === null || value === undefined || value === "") return "—";
    return DECIMAL_PLACES[key] !== undefined && Number.isFinite(Number(value)) ? Number(value).toFixed(DECIMAL_PLACES[key]) : value;
  }
  function decimalInputKey(input) { return input.name || input.dataset.detailMetadata; }
  function decimalInputValue(input) { return input.dataset.decimalDisplay === input.value ? input.dataset.decimalValue : input.value; }
  function formatDecimalInput(input, raw = decimalInputValue(input)) {
    const key = decimalInputKey(input);
    input.value = raw === "" || raw === null || raw === undefined ? "" : fieldText(key, raw);
    input.dataset.decimalValue = raw == null ? "" : String(raw);
    input.dataset.decimalDisplay = input.value;
  }
  function imageMarkup(image, name) {
    return `<span class="bgg-game-image">${image ? `<img src="${esc(image)}" alt="${esc(name)} box cover" loading="lazy" referrerpolicy="no-referrer">` : ""}<span ${image ? 'hidden' : ''}>No image</span></span>`;
  }
  function renderBggResults(games, query) {
    const root = document.querySelector("#gameBggResults");
    const focused = root.contains(document.activeElement) ? document.activeElement.dataset.bggResult : "";
    root.innerHTML = games.length ? games.map(game => `<button type="button" class="button bgg-result" data-bgg-result="${esc(game.id)}">${imageMarkup(game.image, game.name)}<span>${esc(game.name)}${game.year ? ` (${esc(game.year)})` : ""}<small>BGG ${esc(game.id)}</small></span></button>`).join("") : `<a class="button" target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=${encodeURIComponent(query + " site:boardgamegeek.com/boardgame")}">Search Google for this title on BGG</a>`;
    if (focused) root.querySelector(`[data-bgg-result="${CSS.escape(focused)}"]`)?.focus();
  }
  function buyLinksMarkup(name, year) {
    const query = encodeURIComponent([name, year, "board game"].filter(Boolean).join(" "));
    return `<a class="button small" href="https://www.google.com/search?tbm=shop&amp;q=${query}" target="_blank" rel="noopener noreferrer">Find stores</a><a class="button small" href="https://www.ebay.com/sch/i.html?_nkw=${query}" target="_blank" rel="noopener noreferrer">Find on eBay</a>`;
  }

  function importedExpansions(value) {
    const names = Array.isArray(value) ? value : String(value || "").split(/[;\n]/);
    return [...new Set(names.map(name => name.trim()).filter(name => name && !/\bfan[\s–—-]*(?:made[\s–—-]*)?(?:expansion|extension)\b|\(\s*fan[\s–—-]*made\s*\)|\bpromo\p{L}*/iu.test(name)))];
  }

  // Parse text and Markdown links; clipboard HTML is converted to inert text separately.
  function parseBggPaste(value) {
    const warnings = [];
    if (String(value || "").length > 50000) warnings.push("Only the first 50,000 characters were read.");
    let raw = String(value || "").slice(0, 50000).replace(/\r\n?/g, "\n").replace(/\\\s*\n/g, "\n")
      .replace(/&(?:nbsp|#160|#x0*a0);/gi, " ").replace(/\u00a0/g, " ").replace(/&amp;/g, "&");
    // A whole-page copy includes navigation and unrelated game links before the form.
    const correctionHeading = raw.match(/^\s*#{1,6}\s+Correction for\s+/mi);
    if (correctionHeading) {
      const before = raw.slice(0, correctionHeading.index);
      const siteHeading = before.match(/^\s*#\s+boardgame geek\s*$/mi);
      raw = before.slice(0, siteHeading ? siteHeading.index : before.length) + "\n# " + raw.slice(correctionHeading.index + correctionHeading[0].length);
    }
    const plain = raw.replace(/\[([^\]]+)\]\([^\n)]*\)/g, "$1").replace(/\*\*|__/g, "");
    const lines = plain.split("\n").map(line => line.trim());
    const text = lines.join("\n");
    const fields = {};
    const number = (key, pattern, min, max) => {
      const match = text.match(pattern);
      if (!match) return;
      const result = Number(match[1]);
      if (Number.isFinite(result) && result >= min && result <= max) fields[key] = result;
      else warnings.push(PASTE_LABELS[key] + " is outside the supported range and was skipped.");
    };
    const editName = text.match(/^Edit Name[\t ]+(?!Set as Primary Name\b)([^\n]+)/mi) || text.match(/^Edit Name[\t ]*\n([^\n]+)/mi);
    if (editName && !/\(alternate\)/i.test(editName[1])) fields.name = editName[1].trim().slice(0, 100);
    const heading = raw.match(/^\s*#{1,6}\s*\[([^\]]+)\]\(https:\/\/(?:www\.)?boardgamegeek\.com\/boardgame\/(\d{1,12})(?:\/[^\n)]*)?\)(?:[^\S\n]*\((-?\d{1,4})\))?/mi);
    const plainHeading = text.match(/^#\s+([^\n|]+?)(?:[ \t]+\((-?\d{1,4})\))?\s*$/m) || text.match(/^([^\n|]+?)\s*\((-?\d{1,4})\)\s*$/m);
    if (heading) {
      fields.name = heading[1].trim().slice(0, 100); fields.bggId = heading[2]; if (heading[3] !== undefined) fields.year = Number(heading[3]);
    } else if (plainHeading && !/alternate/i.test(plainHeading[1])) {
      fields.name = plainHeading[1].trim().slice(0, 100); if (plainHeading[2] !== undefined) fields.year = Number(plainHeading[2]);
    }
    if (!fields.name) {
      const titleLink = raw.match(/^\s*\[([^\]\n]+)\]\(https:\/\/(?:www\.)?boardgamegeek\.com\/boardgame\/(\d{1,12})(?:\/[^\s/)]*)?\)\s*$/mi);
      if (titleLink && !/^[\d.*\s]+$/.test(titleLink[1])) { fields.name = titleLink[1].trim().slice(0, 100); fields.bggId = titleLink[2]; }
    }
    const alternatives = [...text.matchAll(/^Edit Name[^\n]*?Remove Name[\t ]+([^\n]+?)\s*\(alternate\)\s*$/gmi)].map(match => match[1].trim());
    const namesSection = text.match(/^Names(?:\s+more information)?[ \t]*\n([\s\S]*?)(?=^Year Released(?:\s+more information)?[ \t]*$)/mi);
    if (namesSection) {
      for (const line of namesSection[1].split("\n").map(line => line.trim()).filter(Boolean)) {
        if (/^(?:Edit Name|Add Alternate Name)\b/i.test(line)) continue;
        if (/\(alternate\)\s*$/i.test(line)) alternatives.push(line.replace(/\s*\(alternate\)\s*$/i, "").trim());
        else if (!fields.name) fields.name = line.slice(0, 100);
      }
    }
    if (alternatives.length) fields.alternativeNames = [...new Set(alternatives)].slice(0, 100);
    number("year", /(?:Edit\s+)?Year Released(?:\s+more information)?\s*[:\t ]*\n?\s*(-?\d{1,4})\b/i, -9999, 9999);
    number("minPlayers", /(?:Edit\s+)?Minimum Players(?:\s+more information)?\s*[:\t ]*\n?\s*(\d+)\b/i, 1, 20);
    number("maxPlayers", /(?:Edit\s+)?Maximum Players(?:\s+more information)?\s*[:\t ]*\n?\s*(\d+)\b/i, 1, 20);
    number("minMinutes", /(?:Edit\s+)?Minimum Playing Time(?:\s+more information)?\s*[:\t ]*\n?\s*(\d+)\b/i, 1, 1440);
    number("maxMinutes", /(?:Edit\s+)?Maximum Playing Time(?:\s+more information)?\s*[:\t ]*\n?\s*(\d+)\b/i, 1, 1440);
    const range = (minKey, maxKey, pattern, limit) => {
      if (fields[minKey] !== undefined || fields[maxKey] !== undefined) return;
      const match = text.match(pattern);
      if (!match) return;
      const lo = Number(match[1]), hi = Number(match[2] || match[1]);
      if (lo >= 1 && hi >= lo && hi <= limit) { fields[minKey] = lo; fields[maxKey] = hi; }
      else warnings.push("An unsupported " + PASTE_LABELS[minKey].toLowerCase() + " range was skipped.");
    };
    range("minPlayers", "maxPlayers", /\b(\d+)(?:\s*[–—-]\s*(\d+))?\s*Players\b/i, 20);
    range("minMinutes", "maxMinutes", /\b(\d+)(?:\s*[–—-]\s*(\d+))?\s*(?:Min\b|Minutes\b)/i, 1440);
    number("complexityWeight", /\bWeight\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*5/i, 1, 5);
    const score = raw.match(/\[\s*\*{0,2}(\d+(?:\.\d+)?)\s*\*{0,2}\s*\]\(https:\/\/(?:www\.)?boardgamegeek\.com\/boardgame\/\d+\/[^\n)]*\/ratings[^\n)]*\)/i);
    if (score && Number(score[1]) >= 1 && Number(score[1]) <= 10) fields.bggRating = Number(score[1]);
    if (!score && plainHeading) {
      const before = text.slice(0, plainHeading.index).trim().split("\n").slice(-4).reverse();
      const candidate = before.find(line => /^\d+(?:\.\d+)?$/.test(line) && Number(line) >= 1 && Number(line) <= 10);
      if (candidate) fields.bggRating = Number(candidate);
    }
    if (!fields.bggId) {
      const explicitId = raw.match(/\bBGG(?:\s+game)?\s*(?:ID|#)\s*[:#=]?\s*(\d{1,12})\b/i);
      const correctionId = raw.match(/https:\/\/(?:www\.)?boardgamegeek\.com\/geekitem\/edit\/thing\/(\d{1,12})(?=[/?#\s)]|$)/i);
      if (explicitId && Number(explicitId[1]) > 0) fields.bggId = explicitId[1];
      else if (correctionId && Number(correctionId[1]) > 0) fields.bggId = correctionId[1];
    }
    if (!fields.bggId) {
      const ratingsId = raw.match(/https:\/\/(?:www\.)?boardgamegeek\.com\/boardgame\/(\d{1,12})\/[^/\s)]+\/ratings\b/i);
      if (ratingsId) fields.bggId = ratingsId[1];
      else {
        const ids = [...new Set([...raw.matchAll(/https:\/\/(?:www\.)?boardgamegeek\.com\/boardgame\/(\d{1,12})(?:\/|(?=[\s)]|$))/gi)].map(match => match[1]))];
        if (ids.length === 1) fields.bggId = ids[0];
        else if (ids.length > 1) warnings.push("Multiple linked games found; no BGG game ID was selected.");
      }
    }
    const tagSections = { category: [], mechanisms: [], expansions: [] };
    let tagSection = "";
    for (const line of lines) {
      const heading = line.match(/^(Category|Mechanism|Expansion)(?:\s+more information)?\s*$/i);
      if (heading) { tagSection = ({ category: "category", mechanism: "mechanisms", expansion: "expansions" })[heading[1].toLowerCase()]; continue; }
      if (/^Add (?:Category|Mechanism|Expansion)\b/i.test(line)) { tagSection = ""; continue; }
      if (tagSection) {
        const tag = line.match(/^Remove\s+(.+)$/i);
        if (tag) tagSections[tagSection].push(tag[1].trim());
        else if (line && !/^Remove\s*$/i.test(line)) tagSection = "";
      }
    }
    // Some browser copies omit the Edit/Remove/Add controls entirely.
    const formSections = /^(?:Names|Year Released|Minimum Players|Maximum Players|Mfg Suggested Ages|Minimum Playing Time|Maximum Playing Time|Designer|Solo Designer|Artist|Developer|Graphic Designer|Sculptor|Editor|Writer|Insert Designer|Publisher|Category|Mechanism|Expansion|Fan Expansions?|Promo(?:tional)?(?: Expansions?)?|Expands|Integrates With|Contains|Contained in|Reimplemented By|Reimplements|Family|Video Game Adaptation|Note(?:s)? to Admin)(?:\s+more information)?$/i;
    let bareSection = "";
    for (const line of lines) {
      if (formSections.test(line)) {
        bareSection = ({ category: "category", mechanism: "mechanisms", expansion: "expansions" })[line.toLowerCase().replace(/\s+more information$/i, "")] || "";
        continue;
      }
      if (bareSection && line && !/^(?:Remove|Add)\b/i.test(line)) tagSections[bareSection].push(line);
    }
    const hadExpansions = tagSections.expansions.length > 0;
    tagSections.expansions = importedExpansions(tagSections.expansions);
    if (hadExpansions) fields.expansions = tagSections.expansions;
    if (tagSections.category.length) fields.category = [...new Set(tagSections.category)].join(", ").slice(0, 1000);
    ["mechanisms", "expansions"].forEach(key => { if (tagSections[key].length) fields[key] = [...new Set(tagSections[key])].slice(0, 100); });
    const votes = { bestPlayers: [], recommendedPlayers: [], avoidPlayers: [] };
    let pollRows = 0, openEnded = false;
    const hasPoll = /Not Recommended/i.test(text) && /Best/i.test(text);
    if (hasPoll) for (const line of lines) {
      const clean = line.replace(/^\|\s*|\s*\|$/g, "");
      const cells = clean.split(/\s*\|\s*|\t+/).map(cell => cell.trim());
      const label = cells.length >= 4 ? cells[0] : clean.match(/^(more than \d+|\d+\+|\d+)\s+/i)?.[1];
      if (!label || !/^(?:\d+|\d+\+|more than \d+)$/i.test(label)) continue;
      if (!/^\d+$/.test(label)) { openEnded = true; continue; }
      const count = Number(label);
      if (count < 1 || count > 20) continue;
      const percentages = [...clean.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].slice(0, 3).map(match => Number(match[1]));
      const counts = [...clean.matchAll(/\(\s*(\d+)\s*\)/g)].slice(0, 3).map(match => Number(match[1]));
      const scores = counts.length === 3 ? counts : percentages.length === 3 ? percentages : cells.slice(1, 4).map(cell => /^\d+$/.test(cell) ? Number(cell) : NaN);
      if (scores.length !== 3 || !scores.every(Number.isFinite) || !scores.some(score => score > 0)) continue;
      pollRows += 1;
      const max = Math.max(...scores);
      if (scores.filter(score => score === max).length > 1) { warnings.push("Tied votes at " + count + " players were left neutral."); continue; }
      votes[Object.keys(votes)[scores.indexOf(max)]].push(count);
    }
    if (pollRows) Object.keys(votes).forEach(key => { fields[key] = [...new Set(votes[key])].sort((a, b) => a - b).join(", ") || "--"; });
    if (openEnded) warnings.push("Open-ended player counts such as ‘more than 6’ were skipped.");
    for (const [minKey, maxKey] of [["minPlayers", "maxPlayers"], ["minMinutes", "maxMinutes"]]) {
      if (fields[minKey] !== undefined && fields[maxKey] !== undefined && fields[minKey] > fields[maxKey]) {
        delete fields[minKey]; delete fields[maxKey]; warnings.push("A reversed range was skipped.");
      }
    }
    return { fields, warnings };
  }

  let pasteContext = "library";
  let pasteParsed = { fields: {}, warnings: [] };
  let pasteLockedGameId = "";
  let pasteSource = "paste";
  let bggRequest = null;
  let bggMessage = "";

  function cancelBggRequest() {
    bggRequest?.abort();
    bggRequest = null;
    bggMessage = "";
  }
  async function fetchBggInfo(command, gameId) {
    const idInput = document.querySelector("#gamePasteBggId");
    const id = gameId || bggIdFromInput(idInput.value);
    const query = document.querySelector("#gameBggQuery").value.trim();
    cancelBggRequest();
    if (command === "thing" && !id) { bggMessage = "Enter a BGG game ID or HTTPS page link first, or search by title."; renderPastePreview(); idInput.focus(); return; }
    if (command === "search" && !query) { bggMessage = "Enter a game title to search."; renderPastePreview(); document.querySelector("#gameBggQuery").focus(); return; }
    pasteParsed = { fields: {}, warnings: [] };
    pasteSource = "api";
    document.querySelector("#gameBggResults").innerHTML = "";
    const controller = new AbortController();
    bggRequest = controller;
    bggMessage = command === "search" ? "Searching BoardGameGeek…" : "Fetching BGG game info and player votes…";
    renderPastePreview();
    try {
      const result = command === "search" ? await App.bgg.search(query, controller.signal) : await App.bgg.thing(id, controller.signal);
      if (bggRequest !== controller || controller.signal.aborted) return;
      if (command === "search") {
        const games = result.slice(0, 20);
        renderBggResults(games, query);
        bggMessage = games.length ? "Loading game images… You can select a result now." : "No games found. Try another title, use a BGG ID, or search Google.";
        renderPastePreview();
        if (games.length) {
          try {
            const previews = await App.bgg.previews(games, controller.signal);
            if (bggRequest !== controller || controller.signal.aborted) return;
            renderBggResults(games.map(game => ({ ...game, image: previews.find(preview => preview.id === game.id)?.image || "" })), query);
            bggMessage = (result.length > games.length ? "Showing the first 20 results; refine your title to narrow them down." : games.length + " results.") + " Choose a game to review its info.";
          } catch (error) {
            if (bggRequest !== controller || controller.signal.aborted) return;
            bggMessage = "Game images could not be loaded. You can still select a result to fetch its info.";
          }
        }
      } else {
        pasteParsed = result;
        idInput.value = result.fields.bggId;
        idInput.dataset.manual = "true";
        idInput.setCustomValidity("");
        const target = document.querySelector("#gamePasteTarget");
        if (!target.readOnly && !target.value.trim()) {
          const suggested = suggestedPasteGame(result.fields);
          target.value = suggested ? pasteGameLabel(suggested) : result.fields.name;
        }
        bggMessage = "";
      }
    } catch (error) {
      if (bggRequest !== controller || controller.signal.aborted) return;
      bggMessage = error.message;
    } finally {
      if (bggRequest === controller) { bggRequest = null; renderPastePreview(); }
    }
  }

  function pasteGameLabel(game) {
    const year = sheetValue(game, "year");
    return sheetValue(game, "name") + (year ? ` (${year})` : "");
  }
  function pasteNameKey(value) {
    return String(value || "").replace(/\s*\(\d{4}\)$/, "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function selectedPasteGame() {
    if (pasteLockedGameId) return play.gameById(pasteLockedGameId);
    const value = document.querySelector("#gamePasteTarget").value.trim();
    const matches = allGames().filter(game => game.id !== "custom" && pasteGameLabel(game) === value);
    return matches.length === 1 ? matches[0] : null;
  }
  function suggestedPasteGame(fields) {
    const games = allGames().filter(game => game.id !== "custom");
    const byId = fields.bggId ? games.filter(game => sheetValue(game, "bggId") === fields.bggId) : [];
    if (byId.length === 1) return byId[0];
    if (!fields.name) return null;
    let matches = games.filter(game => [sheetValue(game, "name"), ...(libraryEntry(game.id).metadata?.alternativeNames || [])].some(name => pasteNameKey(name) === pasteNameKey(fields.name)));
    if (fields.year && matches.length > 1) matches = matches.filter(game => sheetValue(game, "year") === fields.year);
    return matches.length === 1 ? matches[0] : null;
  }
  function openGamePaste(gameId, customForm, trigger) {
    cancelBggRequest();
    pasteSource = "api";
    pasteContext = customForm ? "custom" : "library";
    pasteLockedGameId = gameId || "";
    const game = gameId ? play.gameById(gameId) : null;
    const target = document.querySelector("#gamePasteTarget");
    target.value = customForm ? document.querySelector("#customGameName").value : game ? pasteGameLabel(game) : "";
    target.readOnly = Boolean(customForm || game);
    document.querySelector("#gamePasteTargets").innerHTML = allGames().filter(game => game.id !== "custom").map(game => `<option value="${esc(pasteGameLabel(game))}"></option>`).join("");
    document.querySelectorAll("[data-game-paste-input]").forEach(input => { input.value = ""; });
    const idInput = document.querySelector("#gamePasteBggId");
    idInput.value = customForm ? document.querySelector('#customGameForm [name="bggLink"]').value : game ? sheetValue(game,"bggId") || "" : "";
    idInput.dataset.manual = "false";
    idInput.dataset.initial = idInput.value;
    idInput.setCustomValidity("");
    pasteParsed = { fields: {}, warnings: [] };
    document.querySelector("#gameBggQuery").value = customForm ? target.value : game ? sheetValue(game, "name") : "";
    document.querySelector("#gameBggResults").innerHTML = "";
    renderPastePreview();
    components.openDialog("#gamePasteDialog", { trigger, focus: idInput.value ? "#gameBggFetch" : "#gameBggQuery" });
  }
  function renderPastePreview() {
    const game = selectedPasteGame();
    const fields = pasteParsed.fields;
    const keys = Object.keys(fields).filter(key => key !== "category");
    const mismatch = game && fields.name && pasteNameKey(fields.name) !== pasteNameKey(game.name);
    const current = key => {
      if (pasteContext === "custom") {
        const form = document.querySelector("#customGameForm");
        if (key === "additionalTypes") return Array.from(form.querySelectorAll('[name="additionalTypes"]:checked')).map(input => input.dataset.additionalType);
        const inputName = ({ year: "pasteYear", bggRating: "pasteBggRating", alternativeNames: "alternativeNames", mechanisms: "pasteMechanisms", expansions: "pasteExpansions", bggId: "bggLink" })[key] || key;
        return form.elements[inputName]?.value || "—";
      }
      if (!game) return "—";
      if (key === "additionalTypes") return libraryEntry(game.id).metadata?.additionalTypes || [];
      if (key === "name") return sheetValue(game, "name");
      if (key === "complexityWeight") return Number.isFinite(game.complexityWeight) ? game.complexityWeight.toFixed(2) : "—";
      return sheetValue(game, key) ?? "—";
    };
    document.querySelector("#gamePastePreview").innerHTML = keys.length ? `${pasteParsed.image ? `<div class="bgg-preview-cover">${imageMarkup(pasteParsed.image, fields.name || "Game")}</div>` : ""}<div class="paste-preview-table"><table><thead><tr><th scope="col">Use</th><th scope="col">Field</th><th scope="col">Current</th><th scope="col">${pasteSource === "api" ? "BGG" : "Pasted"}</th></tr></thead><tbody>${keys.map(key => `<tr><td><input type="checkbox" data-paste-field="${key}" ${key === "alternativeNames" || (mismatch && key === "name") ? '' : 'checked'} aria-label="Use ${PASTE_LABELS[key]}"></td><th scope="row">${PASTE_LABELS[key]}</th><td>${esc(fieldText(key, current(key)))}</td><td>${esc(fieldText(key, fields[key]))}</td></tr>`).join("")}</tbody></table></div>` : "";
    const status = keys.length ? keys.length + " fields found. Only checked fields will be filled." : gamePasteText().trim() ? "No supported fields found. Paste the correction form, game overview, or player recommendation table." : "Paste a BGG correction form, game overview, or player recommendation table.";
    document.querySelector("#gamePasteStatus").textContent = [bggMessage || (pasteSource === "api" && !keys.length ? "Search BGG or fetch by ID to preview game info and player recommendations." : status), ...pasteParsed.warnings, mismatch ? "The imported name differs from this game; Name is unchecked. Review the other fields before applying." : ""].filter(Boolean).join(" ");
    const target = document.querySelector("#gamePasteTarget").value.trim();
    const apply = document.querySelector("#gamePasteApply");
    apply.disabled = Boolean(bggRequest) || !keys.length || !document.querySelector("#gamePasteBggId").checkValidity() || (!target && pasteContext !== "custom");
    document.querySelector("#gameBggFetch").disabled = Boolean(bggRequest);
    document.querySelector("#gameBggSearch").disabled = Boolean(bggRequest);
    document.querySelector("#gameBggCancel").hidden = !bggRequest;
    document.querySelector("#gameBggKeyHint").textContent = App.bgg.hasToken() ? "BGG key saved on this device." : "Add your BGG API key in Settings → Data Sync to get started.";
    document.querySelector("#gamePastePreview").setAttribute("aria-busy", String(Boolean(bggRequest)));
    apply.textContent = pasteContext === "custom" ? editingCustomGameId || editingExpansionDraft ? "Apply to game" : "Fill form" : game ? "Apply to game" : "Fill new game";
  }
  function gamePasteText() {
    return Array.from(document.querySelectorAll("[data-game-paste-input]")).map(input => input.value).join("\n\n");
  }
  function updateGamePaste(event) {
    cancelBggRequest();
    document.querySelector("#gameBggResults").innerHTML = "";
    if (pasteSource === "api" && !event.target.matches("[data-game-paste-input]")) {
      pasteParsed = { fields: {}, warnings: [] };
      const idInput = document.querySelector("#gamePasteBggId");
      if (event.target === idInput) idInput.dataset.manual = "true";
      if (event.target.id === "gamePasteTarget") {
        const game = selectedPasteGame();
        idInput.value = game ? sheetValue(game, "bggId") || "" : "";
        document.querySelector("#gameBggQuery").value = game ? sheetValue(game, "name") : event.target.value;
      }
      const id = bggIdFromInput(idInput.value);
      idInput.setCustomValidity(idInput.value.trim() && !id ? "Enter a BGG game ID or HTTPS game/correction page link." : "");
      renderPastePreview();
      return;
    }
    if (event.target.matches("[data-game-paste-input], #gamePasteBggId")) {
      pasteSource = "paste";
      const idInput = document.querySelector("#gamePasteBggId");
      if (event.target === idInput) idInput.dataset.manual = "true";
      pasteParsed = parseBggPaste(gamePasteText());
      if (idInput.dataset.manual !== "true") idInput.value = pasteParsed.fields.bggId || idInput.dataset.initial || "";
      const id = bggIdFromInput(idInput.value);
      idInput.setCustomValidity(idInput.value.trim() && !id ? "Enter a BGG game ID or HTTPS game/correction page link." : "");
      if (id) pasteParsed.fields.bggId = id;
      else if (idInput.dataset.manual === "true") delete pasteParsed.fields.bggId;
      const target = document.querySelector("#gamePasteTarget");
      if (!target.readOnly && !target.value.trim()) {
        const suggested = suggestedPasteGame(pasteParsed.fields);
        if (suggested) target.value = pasteGameLabel(suggested);
        else if (pasteParsed.fields.name) target.value = pasteParsed.fields.name;
      }
    }
    renderPastePreview();
  }
  function fillCustomGameFromPaste(fields) {
    const form = document.querySelector("#customGameForm");
    Object.entries(fields).forEach(([key, value]) => {
      if (key === "additionalTypes") { form.querySelectorAll('[name="additionalTypes"]').forEach(input => { input.checked = value.includes(input.dataset.additionalType); }); return; }
      const name = ({ year: "pasteYear", bggRating: "pasteBggRating", alternativeNames: "alternativeNames", mechanisms: "pasteMechanisms", expansions: "pasteExpansions", bggId: "bggLink" })[key] || key;
      if (form.elements[name]) { form.elements[name].value = Array.isArray(value) ? value.join("\n") : value; if (DECIMAL_PLACES[name] !== undefined) formatDecimalInput(form.elements[name], value); form.elements[name].dataset.fieldKnown = "true"; }
    });
    Object.keys(PASTE_LABELS).forEach(key => {
      if (key === "additionalTypes") return;
      const name = ({ year:"pasteYear",bggRating:"pasteBggRating",mechanisms:"pasteMechanisms",expansions:"pasteExpansions",bggId:"bggLink" })[key] || key;
      const input = form.elements[name];
      if (!input) return;
      const missing = !Object.prototype.hasOwnProperty.call(fields,key) && input.dataset.fieldKnown !== "true" && (!editingCustomGameId || !input.value.trim());
      input.classList.toggle("paste-missing-field",missing);
      if (missing) input.setAttribute("data-paste-missing", ""); else input.removeAttribute("data-paste-missing");
      input.setAttribute("aria-describedby","customGameMissingNote");
    });
    document.querySelector("#customGameMissingNote").hidden = !form.querySelector(".paste-missing-field");
    const query = form.querySelector("[data-bgg-query]");
    query.value = form.elements.name.value;
    updateBggSearch({ target: query });
  }
  function applyGamePaste(event) {
    event.preventDefault();
    if (bggRequest || document.querySelector("#gamePasteApply").disabled) return;
    const fields = {};
    document.querySelectorAll("[data-paste-field]:checked").forEach(input => { fields[input.dataset.pasteField] = pasteParsed.fields[input.dataset.pasteField]; });
    if (!Object.keys(fields).length) { document.querySelector("#gamePasteStatus").textContent = "Select at least one field to fill."; return; }
    const game = selectedPasteGame();
    if (pasteContext === "custom") {
      fillCustomGameFromPaste(fields);
      components.closeDialog("#gamePasteDialog", "filled");
      if (editingCustomGameId || editingExpansionDraft) saveCustomGame({preventDefault() {}, currentTarget: document.querySelector("#customGameForm")}, true);
      components.toast(editingCustomGameId ? "Game details saved automatically." : "Fields filled. Review them and save the game.", { title: "Fields applied", kind: "success" });
    } else if (game) {
      mutateLibrary(game.id, entry => {
        entry.metadata = Object.assign({}, entry.metadata);
        Object.entries(fields).forEach(([key, value]) => {
          if (PASTE_CATALOG_FIELDS.includes(key)) entry.metadata.catalog = Object.assign({}, entry.metadata.catalog, { [key]: key === "expansions" ? importedExpansions(value) : value });
          else entry.metadata[key] = value;
        });
      }, "catalog-paste");
      components.closeDialog("#gamePasteDialog", "applied");
      refreshAfterLibraryChange();
      components.toast("Selected fields saved for " + (fields.name || game.name) + ".", { title: "Game updated", kind: "success" });
    } else {
      const name = document.querySelector("#gamePasteTarget").value.trim();
      if (!name) return;
      components.closeDialog("#gamePasteDialog", "filled");
      openCustomGame("");
      fillCustomGameFromPaste(Object.assign({ name }, fields));
      components.toast("Fields filled. Review them and save the new game.", { title: "Ready to add", kind: "success" });
    }
  }

  const SHEET_COLUMNS = [
    ["name", "Name"], ["bggId", "BGG"], ["turnStart", "Turn start"], ["factions", "Factions"],
    ["rating", "Rate"], ["bggRating", "BGG rating"], ["weight", "Weight"], ["minPlayers", "Players"],
    ["length", "Time"], ["mainType", "Type"], ["mechanisms", "Play"], ["note", "Notes"], ["owners", "Owner"]
  ];
  SHEET_COLUMNS.forEach(([key, label]) => { SORT_LABELS[key] = label; });
  Object.assign(SORT_LABELS, { year: "Published year", bestPlayers: "Best player count", recommendedPlayers: "Good player counts", avoidPlayers: "Bad player counts", maxPlayers: "Maximum players", minMinutes: "Shortest time", maxMinutes: "Longest time", verified: "Verified colors", colors: "Colors" });

  function playerCountBadges(game) {
    if (!Number.isFinite(game.minPlayers) || !Number.isFinite(game.maxPlayers)) return '<span class="sheet-missing" aria-label="Not recorded">—</span>';
    const badges = [];
    for (let count = 1; count <= game.maxPlayers; count += 1) {
      if (count < game.minPlayers) { badges.push('<span class="player-count-square is-placeholder" aria-hidden="true"></span>'); continue; }
      const fit = play.playerCountFit(game, count);
      const label = fit.key === "plays" ? `Neutral at ${count}` : fit.label || `${count} players`;
      badges.push(`<span class="player-count-square is-${fit.key}" title="${esc(label)}" role="img" aria-label="${esc(label)}">${icons.markup(`number${count}SquareFill`)}</span>`);
    }
    return `<span class="player-count-badges${game.maxPlayers > 8 ? ' has-two-rows' : ''}"${game.maxPlayers > 8 ? ` style="--player-count-columns:${Math.ceil(game.maxPlayers / 2)}"` : ''}>${badges.join("")}</span>`;
  }

  function pickerSummaryMarkup(game) {
    if (game.id === "custom") return '<span class="game-summary">Any game · any player count</span>';
    const time = Number.isFinite(game.minMinutes) && Number.isFinite(game.maxMinutes)
      ? `${game.minMinutes}${game.minMinutes === game.maxMinutes ? "" : "–" + game.maxMinutes} min` : "Time unknown";
    const weight = Number.isFinite(game.complexityWeight) ? game.complexityWeight.toFixed(2) : "?";
    return `<span class="game-summary">${playerCountBadges(game)} <span aria-hidden="true">·</span> <span class="summary-time time-band-${Math.min(6, Math.max(1, Math.ceil((game.maxMinutes || 0) / 30)))}">${esc(time)}</span> <span aria-hidden="true">·</span> <span class="summary-weight weight-band-${Math.min(5, Math.max(1, Math.ceil(game.complexityWeight || 1)))}" title="Complexity out of 5">Weight ${esc(weight)}</span> <span aria-hidden="true">·</span> <span class="summary-type">${esc(combinedGameType(game))}</span></span>`;
  }

  function pickerInfoMarkup(game) {
    if (game.id === "custom") return "";
    return `<span class="sheet-turnStart">${sheetInfoButton(game, "turnStart", "libraryTurnStart", "Turn start")}</span><span class="sheet-factions">${sheetInfoButton(game, "factions", "libraryFactions", "Factions")}</span>`;
  }

  function sheetInfoButton(game, key, icon, label) {
    const info = sheetValue(game, key);
    return `<button data-info-game="${esc(game.id)}" data-info-kind="${key}" class="sheet-info-button ${info ? "has-info" : ""}" type="button" data-sheet-info="${esc(info || `No ${label.toLowerCase()} recorded.`)}" data-info-label="${label}" aria-label="${esc(label + ': ' + (info || 'Not recorded'))}" aria-expanded="false">${symbol(icon)}</button>`;
  }

  let infoAnchor = null;
  let infoPinned = false;
  let infoHideTimer = null;
  function scheduleSheetInfoHide() {
    clearTimeout(infoHideTimer);
    if (!infoPinned) infoHideTimer = setTimeout(hideSheetInfo,160);
  }
  function resetInfoExpanded(button) {
    if (!button) return;
    const game = button.dataset.expandGame ? play.gameById(button.dataset.expandGame) : null;
    button.setAttribute("aria-expanded", game ? Boolean(expansionsExpanded(game)) : false);
  }
  function hideSheetInfo() {
    clearTimeout(infoHideTimer);
    document.querySelector("#libraryInfoPopover")?.hidePopover();
    resetInfoExpanded(infoAnchor);
    infoAnchor = null;
    infoPinned = false;
  }
  function showSheetInfo(button, pin) {
    clearTimeout(infoHideTimer);
    if (button.dataset.expandGame && expansionsExpanded(play.gameById(button.dataset.expandGame))) {
      if (infoAnchor?.dataset.expandGame === button.dataset.expandGame) hideSheetInfo();
      return;
    }
    if (pin && infoAnchor === button && infoPinned) { hideSheetInfo(); return; }
    if (!pin && infoPinned) return;
    let popup = document.querySelector("#libraryInfoPopover");
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "libraryInfoPopover";
      popup.className = "sheet-info-popover";
      popup.setAttribute("popover", "auto");
      document.body.appendChild(popup);
      popup.addEventListener("change", handleMetadataChoice);
      popup.addEventListener("click", event => { const edit = event.target.closest("[data-edit-expansion]"); if (edit) { hideSheetInfo(); openExpansionEditor(edit.dataset.editExpansion,edit.dataset.expansionName,edit); return; } const button = event.target.closest("[data-open-game]"); if (button) { hideSheetInfo(); openGame(button.dataset.openGame, button); } });
      popup.addEventListener("mouseenter", () => clearTimeout(infoHideTimer));
      popup.addEventListener("focusin", () => clearTimeout(infoHideTimer));
      popup.addEventListener("mouseleave", scheduleSheetInfoHide);
      popup.addEventListener("focusout", event => { if (!popup.contains(event.relatedTarget)) scheduleSheetInfoHide(); });
      popup.addEventListener("toggle", event => { if (event.newState === "closed") { resetInfoExpanded(infoAnchor); infoAnchor = null; infoPinned = false; } });
    }
    resetInfoExpanded(infoAnchor);
    popup.dataset.kind = button.dataset.infoKind || "info";
    const game = button.dataset.infoGame ? play.gameById(button.dataset.infoGame) : null;
    const factions = game && button.dataset.infoKind === "factions" ? factionColors(game) : [];
    popup.innerHTML = `<strong>${esc(button.dataset.infoLabel)}</strong>${factions.length ? `<ul class="faction-color-list">${factions.map(color => `<li><span class="sheet-color" style="--bubble:${esc(u.normalizeColor(color.value, '#94a3b8'))}" aria-hidden="true"></span><span>${esc(color.name)}</span></li>`).join("")}</ul>` : `<p>${esc(button.dataset.sheetInfo)}</p>`}`;
    if (game && button.dataset.infoKind === "tags") popup.innerHTML = tagSectionsMarkup(game);
    if (game && ["mechanisms", "expansions"].includes(button.dataset.infoKind)) {
      const values = gameTagGroups(game)[({mechanisms:"Mechanism",expansions:"Expansions"})[button.dataset.infoKind]];
      popup.innerHTML = `<strong>${esc(button.dataset.infoLabel)}</strong><ul class="tag-values">${values.length ? values.map(value => `<li>${esc(value)}</li>`).join("") : '<li>None added</li>'}</ul>`;
    }
    if (game && button.dataset.infoKind === "expansions") popup.innerHTML = `<strong>Expansions I have</strong><div class="expansion-checklist">${gameTagGroups(game).Expansions.map(name => expansionOwnershipMarkup(game, name)).join("")}</div>`;
    if (game && button.dataset.infoKind === "unownedExpansions") popup.innerHTML = unownedExpansionList(game);
    popup.showPopover();
    infoAnchor = button;
    infoPinned = Boolean(pin);
    button.setAttribute("aria-expanded", button.hasAttribute("data-expand-game") ? Boolean(expansionsExpanded(game)) : true);
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
    if (key === "name") return game.name.replace(/\s*\(-?\d{1,4}\)$/, "");
    if (key === "year") return metadata.year ?? (game.name.match(/\((-?\d{1,4})\)$/) ? Number(game.name.match(/\((-?\d{1,4})\)$/)[1]) : null);
    if (key === "rating") return entry.rating || null;
    if (key === "owners") return entry.owned ? (entry.owners.join(", ") || "Shared") : entry.wishlist ? "Wishlist" : "Not owned";
    if (key === "note") return entry.note;
    if (["alternativeNames", "mechanisms", "expansions"].includes(key)) return (metadata[key] || []).join("; ");
    if (["bggRating", "bggId"].includes(key)) return metadata[key] || null;
    if (key === "mainType") return combinedGameType(game);
    if (key === "weight") return game.complexityWeight;
    if (key === "length") return averageMinutes(game);
    if (key === "turnStart") return game.turnOrder ? [game.turnOrder.label, game.turnOrder.note].filter(Boolean).join(" · ") : "";
    if (key === "factions") return factionColors(game).map(color => color.name).join(", ");
    if (key === "colors") return play.colorsForGame(game).map(color => color.name).join(", ");
    return game[key] ?? null;
  }

  function factionColors(game) {
    if (game.factions === false) return [];
    if (game.factions === true) return play.colorsForGame(game);
    return play.colorsForGame(game).filter(color => !Object.keys(App.gameData.NAMED_COLORS).some(name => name.toLowerCase() === color.name.toLowerCase()));
  }

  function gameTagGroups(game) {
    const metadata = libraryEntry(game.id).metadata || {};
    return {
      Mechanism: metadata.mechanisms || [],
      Expansions: metadata.expansions || []
    };
  }
  function gameTags(game) {
    return [...new Set([mainGameTag(game), ...(libraryEntry(game.id).metadata?.additionalTypes || []), ...Object.values(gameTagGroups(game)).flat()])];
  }
  function mainGameTag(game) {
    return libraryEntry(game.id).metadata?.mainType || "Board";
  }
  function combinedGameType(game) {
    const extra = libraryEntry(game.id).metadata?.additionalTypes || [];
    return mainGameTag(game) + (extra.length ? " :: " + extra.join(", ") : "");
  }
  function expansionCountMarkup(game) {
    const expansions = gameTagGroups(game).Expansions;
    if (!expansions.length) return "";
    const owned = expansions.filter(name => libraryEntry(game.id).metadata?.ownedExpansions?.includes(name)).length;
    const state = owned === expansions.length ? "all" : owned ? "some" : "none";
    return `<button type="button" class="expansion-count expansion-owned-${state}" data-expand-game="${esc(game.id)}" data-sheet-info="Expansions" data-info-game="${esc(game.id)}" data-info-kind="expansions" data-info-label="Expansions" aria-expanded="${Boolean(expansionsExpanded(game))}" aria-label="${owned} of ${expansions.length} expansions owned; ${expansionsExpanded(game) ? 'collapse' : 'expand'} ${esc(game.name)}"><span>${state === "some" ? owned + "/" + expansions.length : expansions.length}</span>${symbol("chevronDown")}</button>`;
  }
  function expansionsExpanded(game) {
    return moduleState().expansionDisclosure?.[game.id] ?? moduleState().showExpansions;
  }
  function showUnownedExpansions(gameId) {
    const button = libraryRoot.querySelector(`[data-expand-game="${CSS.escape(gameId)}"]`);
    if (button) showSheetInfo(button,true);
  }
  function unownedExpansionList(game) {
    if (!expansionsExpanded(game)) return "";
    const owned = libraryEntry(game.id).metadata?.ownedExpansions || [];
    const names = gameTagGroups(game).Expansions.filter(name => !owned.includes(name));
    return names.length ? `<div class="unowned-expansion-list"><span class="eyebrow">Other expansions</span>${names.map(name => { const child = play.allGames(true).find(child => child.expansionOf === game.id && child.name === name); return `<div>${expansionOwnershipMarkup(game, name)}${child ? `<button type="button" class="text-link" data-open-game="${esc(child.id)}">Edit</button>` : ''}</div>`; }).join("")}</div>` : "";
  }
  function additionalTypesMarkup(game, custom) {
    const selected = game ? libraryEntry(game.id).metadata?.additionalTypes || [] : [];
    return `<fieldset class="additional-types"><legend>Additional Types</legend><div>${ADDITIONAL_GAME_TYPES.map(type => `<label><input type="checkbox" ${custom ? 'name="additionalTypes"' : ''} data-additional-type="${esc(type)}" data-type-game="${esc(game?.id || '')}" ${selected.includes(type) ? 'checked' : ''}>${esc(type)}</label>`).join("")}</div></fieldset>`;
  }
  function tagSectionsMarkup(game) {
    return `<label class="field main-type-field"><span>Main Type</span><select data-main-type="${esc(game.id)}">${MAIN_GAME_TYPES.map(type => `<option value="${type}" ${mainGameTag(game) === type ? 'selected' : ''}>${type}</option>`).join("")}</select></label>${additionalTypesMarkup(game, false)}`;
  }
  function expansionOwnershipMarkup(game, name, compact) {
    const owned = libraryEntry(game.id).metadata?.ownedExpansions?.includes(name) || false;
    if (owned && !compact) return `<div class="expansion-ownership"><input type="checkbox" data-expansion-game="${esc(game.id)}" data-expansion-owned="${esc(name)}" aria-label="I have ${esc(name)}" checked><button class="text-link" type="button" data-edit-expansion="${esc(game.id)}" data-expansion-name="${esc(name)}">${esc(name)}</button></div>`;
    return `<label class="expansion-ownership"><input type="checkbox" data-expansion-game="${esc(game.id)}" data-expansion-owned="${esc(name)}" aria-label="I have ${esc(name)}" ${owned ? 'checked' : ''}><span>${compact ? 'Have' : esc(name)}</span></label>`;
  }
  let restoringMetadataScroll = false;
  function handleMetadataChoice(event) {
    const input = event.target.closest("[data-expansion-owned], [data-additional-type], [data-main-type]");
    if (!input || input.closest("#customGameForm")) return false;
    const gameId = input.dataset.expansionGame || input.dataset.typeGame || input.dataset.mainType;
    const game = play.gameById(gameId);
    if (!game) return false;
    const inPopup = Boolean(input.closest("#libraryInfoPopover"));
    const sheet = libraryRoot?.querySelector(".library-sheet");
    const sheetScroll = {left:sheet?.scrollLeft || 0,top:sheet?.scrollTop || 0};
    const scrollParents = [];
    for (let node = input.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) scrollParents.push({node,top:node.scrollTop,left:node.scrollLeft});
    }
    const kind = input.hasAttribute("data-expansion-owned") ? "expansions" : "tags";
    if (input.hasAttribute("data-main-type")) {
      if (!MAIN_GAME_TYPES.includes(input.value)) return false;
      mutateLibrary(gameId, entry => { entry.metadata = Object.assign({}, entry.metadata, {mainType: input.value}); });
    } else {
      const key = kind === "expansions" ? "ownedExpansions" : "additionalTypes";
      const value = kind === "expansions" ? input.dataset.expansionOwned : input.dataset.additionalType;
      const checked = input.checked;
      mutateLibrary(gameId, entry => { const values = entry.metadata?.[key] || []; entry.metadata = Object.assign({}, entry.metadata, {[key]: checked ? [...new Set(values.concat(value))] : values.filter(item => item !== value)}); });
    }
    if (kind === "expansions") {
      const child = play.allGames(true).find(game => game.expansionOf === gameId && game.name === input.dataset.expansionOwned);
      if (child) mutateLibrary(child.id, entry => { entry.owned = input.checked; });
    }
    if (appState().ui.view === "library") {
      restoringMetadataScroll = kind === "expansions";
      renderLibrary({keepInfo:inPopup && kind === "expansions"});
      requestAnimationFrame(() => { restoringMetadataScroll = false; });
      const updated = libraryRoot.querySelector(".library-sheet");
      if (updated) { updated.scrollLeft = sheetScroll.left; updated.scrollTop = sheetScroll.top; }
    }
    if (kind === "expansions") {
      scrollParents.forEach(({node,top,left}) => { if (node.isConnected) { node.scrollTop = top; node.scrollLeft = left; } });
      if (inPopup) {
        // Keep the live checklist and focus in place while updating the table behind it.
        infoAnchor = libraryRoot.querySelector(`[data-expand-game="${CSS.escape(gameId)}"]`);
        infoAnchor?.setAttribute("aria-expanded","true");
      }
      return true;
    }
    if (inPopup) {
      const anchor = libraryRoot.querySelector(`[data-info-kind="${kind}"][data-info-game="${CSS.escape(gameId)}"]`);
      if (anchor) {
        showSheetInfo(anchor, true);
        const selector = input.hasAttribute("data-expansion-owned") ? `[data-expansion-owned="${CSS.escape(input.dataset.expansionOwned)}"]` : input.hasAttribute("data-additional-type") ? `[data-additional-type="${CSS.escape(input.dataset.additionalType)}"]` : "[data-main-type]";
        document.querySelector("#libraryInfoPopover")?.querySelector(selector)?.focus({preventScroll:true});
      }
    }
    return true;
  }
  function gameListButton(game, kind, label, values) {
    return `<button class="game-tag" type="button" data-info-game="${esc(game.id)}" data-info-kind="${kind}" data-info-label="${label}" data-sheet-info="${esc(values.join('\n') || 'None added')}" aria-label="${values.length} mechanisms for ${esc(game.name)}; show list" aria-expanded="false"><span class="game-tag-label">${values.length}</span>${symbol("chevronDown")}</button>`;
  }

  function refreshSheetPosition(focusSelector) {
    const sheet = libraryRoot.querySelector(".library-sheet");
    const left = sheet?.scrollLeft || 0, top = sheet?.scrollTop || 0;
    renderLibrary();
    const updated = libraryRoot.querySelector(".library-sheet");
    if (updated) { updated.scrollLeft = left; updated.scrollTop = top; }
    if (focusSelector) libraryRoot.querySelector(focusSelector)?.focus({ preventScroll: true });
  }
  let ratingGameId = "";
  let ratingAnchor = null;
  let ratingReturnFocus = false;
  function hideRatingPicker() {
    document.querySelector("#gameRatingPopover")?.hidePopover();
    ratingAnchor?.setAttribute("aria-expanded", "false");
    ratingAnchor = null;
  }
  function openRatingPicker(button) {
    const popup = document.querySelector("#gameRatingPopover");
    if (ratingAnchor === button && popup.matches(":popover-open")) { hideRatingPicker(); return; }
    ratingGameId = button.dataset.sheetRating;
    ratingAnchor = button;
    ratingReturnFocus = false;
    const game = play.gameById(ratingGameId);
    if (!game) return;
    const rating = libraryEntry(game.id).rating;
    popup.setAttribute("aria-label", "Rate " + sheetValue(game, "name"));
    const values = [0, ...Array.from({ length: 10 }, (_, index) => 5 - index / 2)];
    document.querySelector("#gameRatingChoices").innerHTML = values.map(value => `<button type="button" role="option" class="rating-choice rating-band-${Math.ceil(value)}" data-rating-pick="${value}" aria-selected="${rating === value}" tabindex="${rating === value ? '0' : '-1'}" aria-label="${value ? value.toFixed(1) + ' out of 5' : 'Not rated'}">${value ? value.toFixed(1) : '--'}</button>`).join("");
    popup.style.maxHeight = "none";
    popup.showPopover();
    popup.scrollTop = 0;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", popup.id);
    const selected = popup.querySelector('[aria-selected="true"]');
    const anchor = button.getBoundingClientRect();
    const center = anchor.top + anchor.height / 2;
    const selectedCenter = selected.offsetTop + selected.offsetHeight / 2;
    const fullHeight = popup.scrollHeight + 2;
    const wantedTop = center - selectedCenter;
    const top = Math.max(8, wantedTop);
    const height = Math.min(fullHeight, window.innerHeight - 8 - top, fullHeight - Math.max(0, top - wantedTop));
    popup.style.maxHeight = Math.max(1, height) + "px";
    popup.style.top = top + "px";
    popup.style.left = Math.max(8, anchor.right + popup.offsetWidth + 4 <= window.innerWidth ? anchor.right + 4 : anchor.left - popup.offsetWidth - 4) + "px";
    popup.scrollTop = top + selectedCenter - center;
    selected.focus({ preventScroll: true });
  }
  function pickRating(event) {
    const button = event.target.closest("[data-rating-pick]");
    if (!button || !ratingGameId) return;
    mutateLibrary(ratingGameId, entry => { entry.rating = Number(button.dataset.ratingPick); });
    hideRatingPicker();
    refreshSheetPosition(`[data-sheet-rating="${CSS.escape(ratingGameId)}"]`);
  }

  function fitLibrarySheet() {
    const sheet = libraryRoot?.querySelector(".library-sheet");
    if (!sheet || libraryRoot.hidden) return;
    const top = sheet.getBoundingClientRect().top + window.scrollY;
    sheet.style.maxHeight = Math.max(160, window.innerHeight - top - 8) + "px";
  }

  function ownerPillsMarkup(game) {
    const entry = libraryEntry(game.id);
    let owner = "";
    if (entry.owned && entry.owners.length) owner = entry.owners.map(name => {
      const person = people().find(person => sameName(person.name, name));
      return `<span class="owner-pill" style="--owner-color:${esc(u.normalizeColor(person?.color, '#94a3b8'))}"><span class="owner-dot" aria-hidden="true"></span>${esc(name)}</span>`;
    }).join("");
    else if (entry.owned) owner = '<span class="owner-pill is-shared">Shared</span>';
    else if (!entry.wishlist) owner = '<span class="owner-pill is-unowned">Not owned</span>';
    return `<span class="owner-pills">${owner}${entry.wishlist ? `<span class="owner-pill is-wishlist">${symbol("heart")}Wishlist</span>` : ''}</span>`;
  }

  function gameColorsMarkup(game) {
    const colors = play.colorsForGame(game);
    const available = new Set(colors.map(color => u.normalizeColor(color.value, "#94a3b8").toLowerCase()));
    if (STANDARD_COLORS.every(color => available.has(u.normalizeColor(color.value, "#94a3b8").toLowerCase()))) {
      return '<span class="sheet-colors"><span class="sheet-color sheet-rainbow" title="All colors available" role="img" aria-label="All colors available"></span></span>';
    }
    const factions = new Set(factionColors(game).map(color => color.name));
    return `<span class="sheet-colors">${colors.map(color => factions.has(color.name)
      ? `<button type="button" class="sheet-color faction-color-button" style="--bubble:${esc(u.normalizeColor(color.value, '#94a3b8'))}" data-sheet-info="${esc(color.name)}" data-info-label="Faction" aria-label="${esc(color.name)}" aria-expanded="false"></button>`
      : `<span class="sheet-color" style="--bubble:${esc(u.normalizeColor(color.value, '#94a3b8'))}" title="${esc(color.name)}" role="img" aria-label="${esc(color.name)}"></span>`).join("")}</span>`;
  }

  function gameRow(game, parent) {
    const id = esc(game.id);
    const entry = libraryEntry(game.id);
    const alternativeNames = (entry.metadata?.alternativeNames || []).join(" · ");
    const cells = SHEET_COLUMNS.map(([key]) => {
      const value = sheetValue(game, key);
      if (key === "name") return `<th scope="row" class="sheet-name-cell"><div class="sheet-name-line">${parent ? '<span class="expansion-indent" aria-hidden="true">↳</span>' : ''}<button class="text-link sheet-name" type="button" data-open-game="${id}" title="${esc([game.name, alternativeNames].filter(Boolean).join(' · '))}"><span class="name-text"><span class="sheet-primary-name">${esc(value)}</span>${alternativeNames ? ` <span class="sheet-alternative-names">(${esc(alternativeNames)})</span>` : ''}</span></button><span class="sheet-name-details">${gameColorsMarkup(game)}<span class="sheet-verification-mark ${game.verified ? "is-verified" : ""}" role="img" title="${game.verified ? 'Verified colors' : 'Colors unchecked'}" aria-label="${game.verified ? 'Verified colors' : 'Colors unchecked'}">${symbol("libraryVerified")}</span></span>${sheetYearMarkup(game)}<span class="sheet-expansion-slot">${expansionCountMarkup(game)}</span></div></th>`;
      let content = value === null || value === "" || value === "--" ? '<span class="sheet-missing" aria-label="Not recorded">—</span>' : esc(value);
      if (key === "rating") content = `<button class="sheet-rate-pill rating-band-${value ? Math.ceil(value) : 0}" type="button" data-sheet-rating="${id}" aria-haspopup="listbox" aria-expanded="false" aria-label="Rate ${esc(game.name)}: ${value ? Number(value).toFixed(1) + ' out of 5' : 'Not rated'}">${value ? Number(value).toFixed(1) : '—'}</button>`;
      if (key === "bggRating" && value) content = `<span class="rating-score rating-band-${Math.ceil(value / 2)}" title="BGG rating ${Number(value).toFixed(1)} / 10">${Number(value).toFixed(1)}</span>`;
      if (key === "weight" && Number.isFinite(value)) content = `<span class="sheet-weight weight-band-${Math.min(5, Math.max(1, Math.ceil(value)))}" title="Complexity ${Number(value).toFixed(2)} / 5">${Number(value).toFixed(2)}</span>`;
      if (key === "length" && Number.isFinite(game.minMinutes) && Number.isFinite(game.maxMinutes)) {
        const band = Math.min(6, Math.max(1, Math.ceil(game.maxMinutes / 30)));
        content = `<span class="sheet-time time-band-${band}" title="${esc(game.maxMinutes)} min longest · ${Math.round(value || 0)} min average"><span>${esc(game.minMinutes)}${game.minMinutes === game.maxMinutes ? "" : "–" + esc(game.maxMinutes)} min</span></span>`;
      }
      if (key === "minPlayers") content = playerCountBadges(game);
      if (key === "owners") content = ownerPillsMarkup(game);
      if (key === "mainType") content = esc(combinedGameType(game));
      if (key === "mechanisms") content = gameListButton(game, key, "Mechanism", gameTagGroups(game).Mechanism);
      if (key === "turnStart") content = sheetInfoButton(game, key, "libraryTurnStart", "Turn start");
      if (key === "factions") content = sheetInfoButton(game, key, "libraryFactions", "Factions");
      if (["minMinutes", "maxMinutes"].includes(key) && value) content = `${esc(value)} min`;
      if (key === "verified") content = `<span class="sheet-verification-mark ${game.verified ? "is-verified" : ""}" role="img" aria-label="${game.verified ? "Verified colors" : "Colors unchecked"}">${symbol("libraryVerified")}</span>`;
      if (key === "bggId") content = `<a class="sheet-web ${value ? 'is-linked' : 'is-unlinked'}" aria-label="${esc((value ? 'View BGG: ' : 'Find on BGG (not linked): ') + game.name)}" title="${value ? 'Linked to BGG' : 'Not linked · search BGG'}" href="${value ? 'https://boardgamegeek.com/boardgame/' + encodeURIComponent(value) : 'https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=' + encodeURIComponent(sheetValue(game, 'name'))}" target="_blank" rel="noopener noreferrer">${symbol("libraryWeb")}</a>`;
      if (key === "colors") content = `${gameColorsMarkup(game)}`;
      if (["note"].includes(key)) content = `<span class="sheet-cell-text">${content}</span>`;
      return `<td class="sheet-${key}" ${key === "note" ? `data-edit-note="${id}" tabindex="0" aria-label="Notes for ${esc(game.name)}; double-click or press Enter to edit"` : ''} title="${esc(value ?? '')}">${content}</td>`;
    }).join("");
    const rowClasses = [parent ? "sheet-expansion-row" : game.id === "custom" ? "is-pinned-game" : "", entry.wishlist && !entry.owned ? "is-wishlist-only" : ""].filter(Boolean).join(" ");
    return `<tr${rowClasses ? ` class="${rowClasses}"` : ""}${parent ? ` data-expansion-parent="${esc(parent.id)}"` : ""}><td class="sheet-play-cell">${parent ? '' : `<button class="sheet-play-button" type="button" data-play-game="${id}" aria-label="Play ${esc(game.name)}" title="Play ${esc(game.name)}">${symbol("play")}</button>`}</td>${cells}</tr>`;
  }

  function sheetYearMarkup(game, parentId, expansionName) {
    const year = game ? sheetValue(game, "year") : null;
    const name = game?.name || expansionName;
    return `<span class="sheet-year"><button type="button" class="sheet-year-button" data-edit-year="${esc(game?.id || '')}" ${parentId ? `data-year-parent="${esc(parentId)}" data-year-expansion="${esc(expansionName)}"` : ''} aria-label="Edit published year for ${esc(name)}" title="Click to edit published year">${year !== null ? `(${esc(year)})` : '—'}</button></span>`;
  }

  function editSheetYear(button) {
    if (!button) return;
    const holder = button.parentElement;
    const game = button.dataset.editYear ? play.gameById(button.dataset.editYear) : play.allGames(true).find(game => game.expansionOf === button.dataset.yearParent && game.name === button.dataset.yearExpansion);
    const original = game ? sheetValue(game, "year") : null;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "-9999";
    input.max = "9999";
    input.step = "1";
    input.className = "sheet-year-editor";
    input.value = original ?? "";
    input.setAttribute("aria-label", button.getAttribute("aria-label"));
    holder.replaceChildren(input);
    let finished = false;
    const finish = save => {
      if (finished) return;
      if (save && !input.checkValidity()) { input.reportValidity(); input.focus(); return; }
      finished = true;
      const year = input.value.trim() ? Number(input.value) : null;
      if (save && year !== original) {
        const id = game?.id || u.uid("custom-game");
        storage.mutate(next => {
          if (!game) next.workspace.library.customGames.push({id, name:button.dataset.yearExpansion, createdAt:u.isoNow()});
          const entry = next.workspace.library.games[id] || {owned:!game, owners:[], wishlist:false, rating:0, note:""};
          entry.metadata = Object.assign({}, entry.metadata, {year});
          if (!game) entry.metadata.expansionOf = button.dataset.yearParent;
          next.workspace.library.games[id] = entry;
        }, {reason:"library-year"});
        renderLibrary();
      } else holder.replaceChildren(button);
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(event.key === "Enter");
        if (holder.isConnected) holder.querySelector("button")?.focus();
      }
    });
    input.focus();
    input.select();
  }

  function editSheetNote(cell) {
    if (!cell || cell.querySelector("textarea")) return;
    let id = cell.dataset.editNote;
    const original = id ? libraryEntry(id).note || "" : "";
    const input = document.createElement("textarea");
    input.className = "sheet-note-editor";
    input.maxLength = 1000;
    input.rows = 3;
    input.value = original;
    input.setAttribute("aria-label", "Edit notes; click away to save, Escape to cancel");
    cell.replaceChildren(input);
    let finished = false;
    const finish = save => {
      if (finished) return;
      finished = true;
      const note = save ? u.cleanText(input.value, 1000).trim() : original;
      if (save && note !== original) {
        if (!id) {
          const parentId = cell.dataset.noteParent;
          const name = cell.dataset.noteExpansion;
          const existing = play.allGames(true).find(game => game.expansionOf === parentId && game.name === name);
          id = existing?.id || u.uid("custom-game");
          storage.mutate(next => {
            if (!existing) next.workspace.library.customGames.push({id, name, createdAt: u.isoNow()});
            const entry = next.workspace.library.games[id] || {owned:true, owners:[], wishlist:false, rating:0, metadata:{expansionOf:parentId}};
            entry.note = note;
            next.workspace.library.games[id] = entry;
          }, {reason:"expansion-note"});
          cell.dataset.editNote = id;
        } else mutateLibrary(id, entry => { entry.note = note; });
      }
      cell.title = note;
      cell.innerHTML = note ? `<span class="sheet-cell-text">${esc(note)}</span>` : '<span class="sheet-missing" aria-label="Not recorded">—</span>';
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", event => {
      if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        event.stopPropagation();
        finish(event.key !== "Escape");
        cell.focus({ preventScroll: true });
      }
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function expansionRows(game) {
    if (!expansionsExpanded(game)) return "";
    const owned = libraryEntry(game.id).metadata?.ownedExpansions || [];
    const linked = play.allGames(true).filter(child => child.expansionOf === game.id);
    return gameTagGroups(game).Expansions.filter(name => owned.includes(name)).map(name => {
      const child = linked.find(child => child.name === name);
      if (child) return gameRow(child,game);
      return `<tr class="sheet-expansion-row" data-expansion-parent="${esc(game.id)}"><td class="sheet-play-cell"></td>${SHEET_COLUMNS.map(([key]) => key === "name" ? `<th scope="row" class="sheet-name-cell"><div class="sheet-name-line"><span class="expansion-row-name">↳ <button type="button" class="text-link" data-edit-expansion="${esc(game.id)}" data-expansion-name="${esc(name)}">${esc(name)}</button></span>${sheetYearMarkup(null,game.id,name)}<span class="sheet-expansion-slot"></span></div></th>` : `<td class="sheet-${key}" ${key === "note" ? `data-edit-note="" data-note-parent="${esc(game.id)}" data-note-expansion="${esc(name)}" tabindex="0" aria-label="Notes for ${esc(name)}; double-click or press Enter to edit"` : ''}>${key === "owners" ? '<span class="owner-pill">Owned</span>' : key === "mainType" ? '<span class="game-tag">Expansion</span>' : '<span class="sheet-missing" aria-label="Not applicable">—</span>'}</td>`).join("")}</tr>`;
    }).join("");
  }

  function gameSheet(games) {
    const ui = moduleState();
    return `<div class="library-sheet" role="region" aria-label="Game library spreadsheet" tabindex="0"><table><caption class="visually-hidden">Game library. Select a column heading to sort; select a game name to edit details. Player squares: green best, blue good, red bad, purple neutral. Times are in minutes, colored in half-hour bands by longest time. Turn and faction symbols show information on hover, focus, or tap.</caption><thead><tr><th scope="col" class="sheet-play-cell"><span class="visually-hidden">Play</span></th>${SHEET_COLUMNS.map(([key, label]) => `<th scope="col" class="${key === 'name' ? 'sheet-name-cell' : 'sheet-' + key}" aria-sort="${ui.sortBy === key ? (ui.sortDirection === 'desc' ? 'descending' : 'ascending') : 'none'}"><button type="button" data-sheet-sort="${key}">${["bggId", "bggRating", "turnStart", "factions", "minPlayers", "length", "weight", "verified"].includes(key) ? `<span class="sheet-heading-icon" title="${label}">${symbol(({ bggId: "libraryWeb", bggRating: "libraryBggRating", turnStart: "libraryTurnStart", factions: "libraryFactions", minPlayers: "libraryPlayers", length: "libraryTime", weight: "libraryWeight", verified: "libraryVerified" })[key])}<span class="visually-hidden">${label}</span></span>` : label}${ui.sortBy === key ? (ui.sortDirection === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`).join("")}</tr></thead><tbody>${games.map(game => gameRow(game) + expansionRows(game)).join("")}</tbody></table></div>`;
  }

  let libraryRoot = null;
  let historyRoot = null;
  let openGameId = "";
  let openHistoryId = "";
  let editingCustomGameId = "";
  let editingExpansionDraft = null;
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
    return Number.isFinite(game.minMinutes) && Number.isFinite(game.maxMinutes) ? (game.minMinutes + game.maxMinutes) / 2 : null;
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
    return [play.gameSearchText(game), ...(entry.metadata?.alternativeNames || []), entry.note, ...SHEET_COLUMNS.map(([key]) => sheetValue(game, key)), ...gameTags(game), entry.wishlist ? "wishlist wish" : "", entry.owned ? "" : "not owned unowned"].filter(Boolean).join(" ").toLowerCase();
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
      if (ui.hosts?.length && (!entry.owned || !entry.owners.some(name => ui.hosts.some(host => sameName(name, host))))) return false;
      if (ui.ownership === "owned" && !entry.owned) return false;
      if (ui.ownership === "available" && !isAvailable(game)) return false;
      if (ui.ownership === "unowned" && entry.owned) return false;
      if (ui.ownership === "wishlist" && !entry.wishlist) return false;
      if (ui.ownership === "played" && !plays) return false;
      if (ui.ownership === "unplayed" && plays) return false;
      if (ui.ownership === "available" && count && play.playerCountFit(game, count).score < 0) return false;
      if (ui.mechanism && ui.mechanism !== "all" && !gameTagGroups(game).Mechanism.includes(ui.mechanism)) return false;
      if (ui.mainType && ui.mainType !== "all" && (ui.mainType.startsWith("additional:") ? !entry.metadata?.additionalTypes?.includes(ui.mainType.slice(11)) : mainGameTag(game) !== ui.mainType)) return false;
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
        const av = ui.sortBy === "mainType" ? combinedGameType(a) : sheetValue(a, ui.sortBy), bv = ui.sortBy === "mainType" ? combinedGameType(b) : sheetValue(b, ui.sortBy);
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

  function numericRatingMarkup(rating) {
    return rating ? `<span class="rating-score rating-band-${Math.ceil(rating)}" aria-label="Rated ${rating.toFixed(1)} out of 5">${rating.toFixed(1)}</span>` : "";
  }

  function ratingLevelsMarkup(rating, custom) {
    return `<fieldset class="numeric-rating-levels"><legend>My rating</legend>${custom ? `<input type="hidden" name="personalRating" value="${rating}">` : ''}<div>${Array.from({length:11},(_,i)=>i/2).map(value=>`<button type="button" class="rating-score rating-band-${Math.ceil(value)}" ${custom ? 'data-custom-rating' : 'data-detail-rating'}="${value}" aria-pressed="${rating === value}" aria-label="${value ? value.toFixed(1) + ' out of 5' : 'Not rated'}">${value ? value.toFixed(1) : '—'}</button>`).join("")}</div></fieldset>`;
  }

  function bggLookupMarkup(game, customForm) {
    const name = game ? sheetValue(game, "name") : "";
    const bggId = game ? sheetValue(game, "bggId") : "";
    return `<section class="bgg-lookup ${customForm ? 'wide' : 'detail-section'}" data-bgg-lookup><h3>BGG lookup</h3><p class="setting-note">${customForm ? 'Search BoardGameGeek, then paste its ID or link beside Name above.' : 'Search BoardGameGeek, then paste the game’s page link below to connect it.'}</p><div class="bgg-lookup-row"><label class="field grow-control"><span>Game name</span><input type="search" data-bgg-query maxlength="100" value="${esc(name)}" autocomplete="off"></label><a class="button" data-bgg-search href="https://boardgamegeek.com/geeksearch.php?action=search&amp;objecttype=boardgame&amp;q=${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer">${symbol("libraryWeb")}Search BGG</a></div><div class="bgg-lookup-row"><label class="field grow-control"><span>BGG game link or ID</span><input type="text" data-bgg-link ${customForm ? 'name="bggLink"' : ''} maxlength="500" value="${esc(bggId || '')}" placeholder="https://boardgamegeek.com/boardgame/…" autocomplete="off"></label>${customForm ? '' : '<button class="button" type="button" data-bgg-apply>Link game</button>'}</div><p class="setting-note" data-bgg-status role="status">${bggId ? `Linked to BGG #${esc(bggId)}.` : ''}</p></section>`;
  }

  function bggIdFromInput(value) {
    const text = String(value || "").trim();
    if (/^\d{1,12}$/.test(text) && Number(text) > 0) return text;
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" || !["boardgamegeek.com", "www.boardgamegeek.com"].includes(url.hostname) || url.username || url.password) return "";
      const id = url.pathname.match(/^\/(?:boardgame|geekitem\/edit\/thing)\/(\d{1,12})(?:\/|$)/)?.[1];
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
    const players = !Number.isFinite(game.minPlayers) || !Number.isFinite(game.maxPlayers) ? "?" : game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers}–${game.maxPlayers}`;
    return `
      <article class="library-card ${entry.owned ? "is-owned" : ""} ${available && moduleState().present.length ? "is-available" : ""}" data-game-card="${esc(game.id)}">
        <button class="library-card-main" type="button" data-open-game="${esc(game.id)}" aria-label="${esc(play.gameAccessibleName(game.name))} details">
          <span class="library-card-title">${play.gameTitleMarkup(game.name)}${numericRatingMarkup(entry.rating)}</span>
          <span class="library-card-facts">
            <span>${symbol("people")}${esc(players)}</span>
            <span>${symbol("star")}Best ${esc(game.bestPlayers || players)}</span>
            <span>${symbol("timer")}${esc(!Number.isFinite(game.minMinutes) || !Number.isFinite(game.maxMinutes) ? "?" : game.minMinutes === game.maxMinutes ? game.minMinutes : game.minMinutes + "–" + game.maxMinutes)}m</span>
            ${Number.isFinite(game.complexityWeight) ? `<span>${symbol("bolt")}${esc(game.complexityWeight.toFixed(2))}</span>` : ""}
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

  function hostNames() {
    return [...new Set([...people().map(person => person.name), ...Object.values(appState().workspace.library.games).flatMap(entry => entry.owners)])].sort((a, b) => a.localeCompare(b));
  }

  function presentPickerMarkup() {
    const ui = moduleState();
    return `
      <div class="present-picker">
        <div><span class="eyebrow">Who’s hosting?</span><div class="chip-grid host-picker"><button type="button" class="chip-btn" data-host="" aria-pressed="${!ui.hosts?.length}">Any host</button>${hostNames().map(name => { const person = people().find(person => sameName(person.name, name)); return `<button type="button" class="chip-btn" data-host="${esc(name)}" aria-pressed="${Boolean(ui.hosts?.includes(name))}" style="--accent:${esc(u.normalizeColor(person?.color, '#94a3b8'))}"><span class="dot" aria-hidden="true"></span><span>${esc(name)}</span></button>`; }).join("")}</div></div>
        <div class="present-heading"><span class="eyebrow">Who’s playing?</span><div class="count-stepper" ${ui.present.length ? "hidden" : ""}>
          <span class="eyebrow">or player count</span>
          <button class="icon-button" type="button" data-player-count="-1" aria-label="Fewer players">−</button>
          <output aria-live="polite">${ui.playerCount ? ui.playerCount + " players" : "Any"}</output>
          <button class="icon-button" type="button" data-player-count="1" aria-label="More players">+</button>
        </div></div>
        <div class="chip-grid">
          ${people().map(person => `<button class="chip-btn" type="button" data-present="${esc(person.name)}" aria-pressed="${ui.present.includes(person.name)}" style="--accent:${esc(person.color)}"><span class="dot" aria-hidden="true"></span><span>${esc(person.name)}</span></button>`).join("")}
        </div>
        <label class="game-setup-check"><input type="checkbox" data-show-expansions ${ui.showExpansions ? 'checked' : ''}> Show expansions as rows</label>
        ${ui.present.length ? `<span class="panel-note">${ui.present.length} at the table · <button class="text-link" type="button" data-clear-present>Clear</button></span>` : ""}
      </div>`;
  }

  function libraryControlsMarkup() {
    const ui = moduleState();
    const count = tableCount();
    return `<section class="panel library-controls" aria-label="Library controls">
      <div class="segmented compact" role="tablist" aria-label="Library sections">
        <button type="button" role="tab" data-library-tab="games" data-shortcut="G" aria-keyshortcuts="G Control+Alt+Shift+G" aria-selected="${ui.tab === "games"}" aria-pressed="${ui.tab === "games"}">${symbol("library")}<span><span class="keyboard-mnemonic">G</span>ames</span></button>
        <button type="button" role="tab" data-library-tab="people" data-shortcut="E" aria-keyshortcuts="E Control+Alt+Shift+E" aria-selected="${ui.tab === "people"}" aria-pressed="${ui.tab === "people"}">${symbol("people")}<span>P<span class="keyboard-mnemonic">e</span>ople</span></button>
      </div>
      ${ui.tab === "games" ? `
        <div class="filter-row" role="group" aria-label="Library search and filters">
        <details class="library-table-options"><summary>${symbol("people")}<span>Table${count ? ` · ${count}` : ''}</span></summary>${presentPickerMarkup()}</details>
          <div class="library-search-tools"><label class="search-field grow-control library-search-field"><span class="visually-hidden">Search library</span><input type="search" aria-keyshortcuts="." data-library-search value="${esc(ui.search)}" placeholder="Search library…" autocomplete="off"><span class="library-game-count" role="status">${filteredGames().length} out of ${allGames().length} games</span><kbd aria-hidden="true">.</kbd></label>
          <button class="button small" type="button" data-library-reset>Reset</button>
          </div>
          <label class="select-field"><span class="visually-hidden">Show</span><select data-library-ownership>${Object.keys(OWNERSHIP_LABELS).map(key => `<option value="${key}" ${ui.ownership === key ? "selected" : ""}>${OWNERSHIP_LABELS[key]}</option>`).join("")}</select></label>
          <label class="select-field"><span class="visually-hidden">Sort</span><select data-library-sort>${Object.keys(SORT_LABELS).map(key => `<option value="${key}" ${ui.sortBy === key ? "selected" : ""}>${SORT_LABELS[key]}${key === "fit" && count ? ` for ${count}` : ""}</option>`).join("")}</select></label>
          <button class="icon-button" type="button" data-library-direction aria-label="${ui.sortDirection === "desc" ? "Reverse order on" : "Reverse order off"}" aria-pressed="${ui.sortDirection === "desc"}" title="Reverse order">${icons.markup("sort")}</button>
          <label class="select-field"><span class="visually-hidden">Main Type / Additional Types</span><select data-library-main-type><option value="all">All types</option>${MAIN_GAME_TYPES.map(type => `<option value="${type}" ${ui.mainType === type ? 'selected' : ''}>${type}</option>`).join("")}<optgroup label="Additional Types">${ADDITIONAL_GAME_TYPES.map(type => `<option value="additional:${esc(type)}" ${ui.mainType === 'additional:' + type ? 'selected' : ''}>${esc(type)}</option>`).join("")}</optgroup></select></label>
          ${[["mechanism", "Mechanism", "Mechanism"]].map(([key, label, group]) => `<label class="select-field"><span class="visually-hidden">${label}</span><select data-library-${key}><option value="all">${label}</option>${[...new Set(allGames().flatMap(game => gameTagGroups(game)[group]))].sort().map(value => `<option value="${esc(value)}" ${ui[key] === value ? 'selected' : ''}>${esc(value)}</option>`).join("")}</select></label>`).join("")}
          <label class="select-field"><span class="visually-hidden">Colors</span><select data-library-verified>${[["all", "Any verification"], ["yes", "Verified"], ["no", "Unchecked"]].map(([value, label]) => `<option value="${value}" ${ui.verified === value ? 'selected' : ''}>${label}</option>`).join("")}</select></label>
        </div>


      ` : ''}
      <button class="button small" type="button" data-open-game-paste>BGG info</button>
      <button class="button small library-add-game" type="button" data-add-game>${symbol("plus")}<span>Add game</span></button>
    </section>`;
  }

  function renderGamesTab() {
    const ui = moduleState();
    const games = filteredGames();
    const count = tableCount();
    return `

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

  function positionTableMenu() {
    const details = libraryRoot?.querySelector(".library-table-options[open]");
    if (!details) return;
    const rect = details.querySelector("summary").getBoundingClientRect();
    const popup = details.querySelector(".present-picker");
    popup.style.left = Math.max(8, Math.min(rect.left, innerWidth - Math.min(560, innerWidth - 16) - 8)) + "px";
    popup.style.top = rect.bottom + 4 + "px";
  }

  function preserveScroll(nodes) {
    const positions = nodes.filter(Boolean).map(node => ({node,top:node.scrollTop,left:node.scrollLeft}));
    return () => positions.forEach(({node,top,left}) => {
      if (node.isConnected) { node.scrollTop = top; node.scrollLeft = left; }
    });
  }

  function renderLibrary(options) {
    if (!options?.keepInfo) hideSheetInfo();
    hideRatingPicker();
    if (!libraryRoot) return;
    const previousSheet = libraryRoot.querySelector(".library-sheet");
    const sheetScroll = {top:previousSheet?.scrollTop || 0,left:previousSheet?.scrollLeft || 0};
    const ancestors = [];
    for (let node = libraryRoot; node; node = node.parentElement) ancestors.push(node);
    const restoreParents = preserveScroll(ancestors);
    const restore = () => {
      const sheet = libraryRoot.querySelector(".library-sheet");
      if (sheet) { sheet.scrollTop = sheetScroll.top; sheet.scrollLeft = sheetScroll.left; }
      restoreParents();
    };
    const ui = moduleState();
    const tableOptionsOpen = Boolean(libraryRoot.querySelector(".library-table-options")?.open);
    const focusSelector = document.activeElement?.matches?.("[data-library-search]") ? "[data-library-search]" : "";
    libraryRoot.innerHTML = `
      <div class="library">
        ${libraryControlsMarkup()}
        ${ui.tab === "people" ? renderPeopleTab() : renderGamesTab()}
      </div>`;
    if (tableOptionsOpen && libraryRoot.querySelector(".library-table-options")) libraryRoot.querySelector(".library-table-options").open = true;
    positionTableMenu();
    if (focusSelector) {
      const input = libraryRoot.querySelector(focusSelector);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
    restore();
    requestAnimationFrame(() => { fitLibrarySheet(); restore(); });
    emit("app:viewrendered");
  }

  function mutateLibrary(gameId, update, reason) {
    storage.mutate(next => {
      const games = next.workspace.library.games;
      const entry = Object.assign({ owned: false, owners: [], wishlist: false, rating: 0, note: "" }, games[gameId] || {});
      update(entry);
      if (!entry.owned) entry.owners = [];
      if (entry.metadata?.expansionOf) {
        const parent = games[entry.metadata.expansionOf];
        const child = next.workspace.library.customGames.find(game => game.id === gameId);
        if (parent?.metadata && child) { const owned = parent.metadata.ownedExpansions || []; parent.metadata.ownedExpansions = entry.owned ? [...new Set(owned.concat(child.name))] : owned.filter(name => name !== child.name); }
      }
      if (entry.owned || entry.wishlist || entry.rating || entry.note || entry.metadata?.year === 0 || Object.values(entry.metadata || {}).some(Boolean)) games[gameId] = entry;
      else delete games[gameId];
    }, { reason: reason || "library-edit" });
  }

  function updateLibraryUi(update) {
    storage.mutate(next => update(next.modules.library), { reason: "library-filter", touch: false });
  }

  /* ---------- Game dialog ---------- */

  function canonicalSetupColor(color) {
    return App.gameData.migrateStandardColor(color);
  }
  function setupColorOptions(game) {
    const base = GAME_PRESETS.find(item => item.id === game.id);
    const palette = libraryEntry(game.id).metadata?.setup?.palette;
    const colors = [...STANDARD_COLORS, ...(palette || []), ...play.colorsForGame(game), ...(base ? play.colorsForGame(base) : [])].map(canonicalSetupColor);
    return colors.filter((color, index) => colors.findIndex(other => other.name === color.name && other.value === color.value) === index);
  }
  function setupColorRow(color, checked, factions) {
    return `<div class="game-color-option" data-setup-value="${esc(color.value)}" data-setup-name="${esc(color.name)}" title="${esc(color.name)}"><input type="checkbox" data-setup-color ${checked ? 'checked' : ''} aria-label="Available: ${esc(color.name)}"><span class="dot" style="background:${esc(color.value)}" aria-hidden="true"></span><span data-color-label ${factions ? 'hidden' : ''}>${esc(color.name)}</span><input data-color-name aria-label="Faction name for ${esc(color.name)}" maxlength="60" value="${esc(color.name)}" ${factions ? '' : 'hidden'}></div>`;
  }
  function gameSetupMarkup(game) {
    const rule = game.turnOrder || {};
    const colors = setupColorOptions(game);
    const selected = play.colorsForGame(game).map(canonicalSetupColor);
    const standard = game.openColorPool === true || (game.openColorPool !== false && !game.colors?.length);
    const factions = game.factions ?? Boolean(factionColors(game).length);
    return `<div class="game-setup-grid" data-pool-mode="${standard ? 'all' : 'selected'}" data-first-mode="${esc(rule.firstMode || '')}">
      <section><h3>Available colors & factions</h3>
        <div class="segmented setup-choices" role="group" aria-label="Color pool"><button type="button" data-setup-pool="all" aria-pressed="${standard}">Standard colors</button><button type="button" data-setup-pool="selected" aria-pressed="${!standard}">Choose colors</button></div>
        <label class="game-setup-check"><input type="checkbox" data-setup-factions ${factions ? 'checked' : ''}> Factions — name each color</label>
        <div class="game-color-picker">${colors.map(color => setupColorRow(color, !standard && selected.some(item => item.name === color.name && item.value === color.value), factions)).join("")}</div>
        <div class="add-game-color"><label class="field"><span>New color hex</span><input data-new-color-hex placeholder="#12ab34" maxlength="7" aria-label="New color hex code"></label><label class="field"><span>Name</span><input data-new-color-name maxlength="60" placeholder="Color or faction name"></label><button type="button" class="button" data-add-game-color>Add color</button></div>
        <label class="game-setup-check"><input type="checkbox" data-setup-verified ${game.verified ? 'checked' : ''}> Colors verified</label>
      </section>
      <section><h3>First player & timing</h3>
        <div class="segmented setup-choices" role="group" aria-label="First player">${[["", "None"], ["random-first", "Random first player"], ["random-all", "Random full order"], ["manual", "Choose from game"], ["current-order", "Player order"], ["faction-order", "Faction order"]].map(([value, label]) => `<button type="button" data-setup-first="${value}" aria-pressed="${(rule.firstMode || '') === value}">${label}</button>`).join("")}</div>
        <label class="field"><span>Turn order</span><select data-setup-sequence>${[["clockwise", "Clockwise table order"], ["random", "Random full order"], ["listed", "Listed / faction order"]].map(([value, label]) => `<option value="${value}" ${(rule.sequence || (rule.firstMode === "random-all" ? "random" : rule.autoSortFactions || rule.firstMode === "faction-order" ? "listed" : "clockwise")) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="field"><span>Rule title</span><input data-setup-label maxlength="80" value="${esc(rule.label || '')}" placeholder="First player"></label>
        <label class="game-setup-check"><input type="checkbox" data-setup-sort ${rule.autoSortFactions ? 'checked' : ''}> Seat players in faction order</label>
        <label class="field"><span>First-player / turn-order instructions</span><textarea rows="2" maxlength="1000" data-setup-note placeholder="Youngest player, last winner, clockwise turns…">${esc(rule.note || '')}</textarea></label>
        <label class="field"><span>Other timers (semicolon-separated)</span><input data-setup-timers maxlength="800" value="${esc((rule.defaultOthers || []).join('; '))}" placeholder="Bidding; Upkeep; Scoring"></label>
        <p class="setting-note">Edits save automatically. Other timers are added to Play setup.</p>
        <button type="button" class="button" data-reset-game-setup>Reset to game defaults</button>
        <span class="setting-note" role="status" data-setup-status></span>
      </section></div>`;
  }
  function syncSetupControls() {
    const panel = document.querySelector("#game-panel-setup");
    if (!panel) return;
    const standard = panel.querySelector("[data-pool-mode]").dataset.poolMode === "all";
    const factions = panel.querySelector("[data-setup-factions]").checked;
    panel.querySelectorAll("[data-setup-color]").forEach(input => { input.disabled = standard; });
    panel.querySelectorAll("[data-color-name]").forEach(input => { input.hidden = !factions; input.disabled = standard || !factions; });
    panel.querySelectorAll("[data-color-label]").forEach(label => { label.hidden = factions; });
  }
  function saveGameSetup(reset) {
    if (reset) {
      mutateLibrary(openGameId, entry => { if (entry.metadata) delete entry.metadata.setup; });
      refreshAfterLibraryChange();
      document.querySelector("[data-setup-status]").textContent = "Game defaults restored.";
      return;
    }
    const panel = document.querySelector("#game-panel-setup");
    const value = key => panel.querySelector(`[data-setup-${key}]`).value.trim();
    const checked = key => panel.querySelector(`[data-setup-${key}]`).checked;
    const options = Array.from(panel.querySelectorAll("[data-setup-value]"));
    const colorValue = row => ({ name: row.querySelector("[data-color-name]").value.trim() || row.dataset.setupName, value: row.dataset.setupValue });
    const palette = options.map(colorValue);
    const colors = options.filter(row => row.querySelector("[data-setup-color]").checked).map(colorValue);
    const firstMode = panel.querySelector("[data-first-mode]").dataset.firstMode;
    const timers = value("timers").split(";").map(name => name.trim()).filter(Boolean);
    const setup = { openColorPool: panel.querySelector("[data-pool-mode]").dataset.poolMode === "all", colors, palette, factions: checked("factions"), verified: checked("verified"), turnOrder: value("sequence") !== "clockwise" || firstMode || value("label") || value("note") || timers.length || checked("sort") ? { firstMode, sequence: value("sequence"), label: value("label") || "First player", note: value("note"), autoSortFactions: checked("sort"), defaultOthers: timers } : null };
    mutateLibrary(openGameId, entry => { entry.metadata = Object.assign({}, entry.metadata, { setup }); });
    if (appState().ui.view === "library") renderLibrary();
    panel.querySelector("[data-setup-status]").textContent = "Saved automatically.";
  }
  function handleSetupClick(event) {
    const panel = event.target.closest("#game-panel-setup");
    if (!panel) return false;
    const pool = event.target.closest("[data-setup-pool]");
    const first = event.target.closest("[data-setup-first]");
    if (pool) {
      panel.querySelector("[data-pool-mode]").dataset.poolMode = pool.dataset.setupPool;
      panel.querySelectorAll("[data-setup-pool]").forEach(button => button.setAttribute("aria-pressed", button === pool));
      panel.querySelectorAll("[data-setup-color]").forEach(input => { input.checked = false; });
      syncSetupControls(); saveGameSetup(false); return true;
    }
    if (first) {
      panel.querySelector("[data-first-mode]").dataset.firstMode = first.dataset.setupFirst;
      panel.querySelectorAll("[data-setup-first]").forEach(button => button.setAttribute("aria-pressed", button === first));
      saveGameSetup(false); return true;
    }
    if (event.target.closest("[data-add-game-color]")) {
      const hex = panel.querySelector("[data-new-color-hex]");
      const name = panel.querySelector("[data-new-color-name]");
      if (!/^#[0-9a-f]{6}$/i.test(hex.value.trim())) { hex.setCustomValidity("Enter a six-digit hex color, such as #12ab34."); hex.reportValidity(); return true; }
      hex.setCustomValidity("");
      const color = {name: name.value.trim() || "Custom " + hex.value.trim(), value: hex.value.trim().toLowerCase()};
      if (panel.querySelectorAll("[data-setup-value]").length >= 64) { panel.querySelector("[data-setup-status]").textContent = "Up to 64 colors can be stored."; return true; }
      panel.querySelector(".game-color-picker").insertAdjacentHTML("beforeend", setupColorRow(color, true, panel.querySelector("[data-setup-factions]").checked));
      panel.querySelector("[data-pool-mode]").dataset.poolMode = "selected";
      panel.querySelectorAll("[data-setup-pool]").forEach(button => button.setAttribute("aria-pressed", button.dataset.setupPool === "selected"));
      hex.value = ""; name.value = ""; syncSetupControls(); saveGameSetup(false); return true;
    }
    return false;
  }

  let gameDetailTab = "details";

  function baseGameChoices(excludeId) {
    return allGames().filter(game => game.id !== "custom" && game.id !== excludeId).sort((a,b) => sheetValue(a,"name").localeCompare(sheetValue(b,"name"),undefined,{sensitivity:"base",numeric:true}));
  }
  function customOwnershipMarkup(game, draft) {
    const entry = game ? libraryEntry(game.id) : {owned:true,owners:[],wishlist:false};
    const names = [...new Set(people().map(person => person.name).concat(entry.owners || []))].sort((a,b) => a.localeCompare(b));
    return `<fieldset class="wide custom-ownership"><legend>Ownership</legend><div class="custom-owned-status"><label><input type="checkbox" name="customOwned" ${entry.owned || draft ? 'checked' : ''}> Owned</label><label><input type="checkbox" name="customWishlist" ${entry.wishlist ? 'checked' : ''}> On my wishlist</label></div><span class="eyebrow">Owners</span><div class="chip-grid">${names.map(name => { const person = people().find(person => sameName(person.name,name)); return `<label class="custom-owner-choice" style="--accent:${esc(u.normalizeColor(person?.color,'#94a3b8'))}"><input type="checkbox" name="gameOwners" value="${esc(name)}" ${(entry.owners || []).some(owner => sameName(owner,name)) ? 'checked' : ''}><span class="dot" aria-hidden="true"></span><span>${esc(name)}</span></label>`; }).join("")}</div><label class="field custom-other-owners"><span>Other owners</span><input name="additionalOwners" maxlength="500" placeholder="Name, another owner" autocomplete="off"></label><p class="setting-note">Select owners above or enter other names separated by commas. Wishlist stays independent.</p></fieldset>`;
  }
  function openExpansionEditor(parentId,name,trigger) {
    const child = play.allGames(true).find(game => game.expansionOf === parentId && game.name === name);
    if (child) { if (child.custom) openCustomGame(child.id); else openGame(child.id,trigger); return; }
    openCustomGame("",{parentId,name});
  }

  function expansionParentMarkup(game) {
    const parentId = libraryEntry(game.id).metadata?.expansionOf || "";
    return `<label class="field"><span>Expansion of</span><select data-detail-expansion-parent="${esc(game.id)}"><option value="">Standalone game</option>${baseGameChoices(game.id).map(parent => `<option value="${esc(parent.id)}" ${parent.id === parentId ? 'selected' : ''}>${esc(parent.name)}</option>`).join("")}</select></label>`;
  }
  function setExpansionParent(gameId, parentId) {
    const game = play.gameById(gameId);
    if (!game || game.id === "custom" || parentId === gameId) return;
    if (parentId && (!allGames().some(parent => parent.id === parentId && parent.id !== "custom") || play.allGames(true).some(child => child.expansionOf === gameId))) { components.toast("Choose a standalone base game. Games with linked expansions must stay standalone.", {kind:"info"}); renderGameDialog(); return; }
    storage.mutate(next => {
      const entries = next.workspace.library.games;
      const entry = entries[gameId] || {owned:false,owners:[],wishlist:false,rating:0,note:"",metadata:{}};
      const oldParent = entries[entry.metadata?.expansionOf];
      if (oldParent?.metadata) {
        oldParent.metadata.expansions = (oldParent.metadata.expansions || []).filter(name => name !== game.name);
        oldParent.metadata.ownedExpansions = (oldParent.metadata.ownedExpansions || []).filter(name => name !== game.name);
      }
      entry.metadata = Object.assign({},entry.metadata);
      if (parentId) entry.metadata.expansionOf = parentId; else delete entry.metadata.expansionOf;
      entries[gameId] = entry;
    }, {reason:"expansion-link"});
    refreshAfterLibraryChange();
  }

  function gameDialogMarkup(game) {
    const entry = libraryEntry(game.id);
    const record = gameStats(game.id);
    const owners = entry.owners;
    const winners = record ? Array.from(record.winners.entries()).sort((a, b) => b[1] - a[1]) : [];
    const recent = record ? record.records.slice(0, 6) : [];
    return `
      <div class="game-detail">
        <div class="game-detail-tabs" role="tablist" aria-label="Game editor">${["details", "catalog", "plays"].map(tab => `<button type="button" id="game-tab-${tab}" role="tab" aria-selected="${gameDetailTab === tab}" aria-controls="game-panel-${tab}" tabindex="${gameDetailTab === tab ? 0 : -1}" data-detail-tab="${tab}">${({details:"Details",catalog:"Catalog & BGG",setup:"Colors & timing",plays:"Your plays"})[tab]}</button>`).join("")}</div>
        <div role="tabpanel" id="game-panel-details" aria-labelledby="game-tab-details" ${gameDetailTab !== "details" ? 'hidden' : ''} class="game-details-grid game-overview">
        <section id="game-panel-setup" class="detail-section" aria-label="Colors and timing">${gameSetupMarkup(game)}</section>
        <section class="detail-section game-personal-panel">
          <h3>Ownership</h3>
          <div class="segmented" role="group" aria-label="Ownership">
            <button type="button" data-detail-owned="true" aria-pressed="${entry.owned}">${symbol("checkmark")}<span>Owned</span></button>
            <button type="button" data-detail-owned="false" aria-pressed="${!entry.owned}"><span>Not owned</span></button>
          </div>
          <div class="owner-picker ${owners.length ? '' : 'owner-missing'}" ${entry.owned ? "" : "hidden"}>
            <span class="eyebrow">Who owns it?</span>
            <div class="chip-grid">${people().map(person => `<button class="chip-btn" type="button" data-detail-owner="${esc(person.name)}" aria-pressed="${owners.some(owner => sameName(owner, person.name))}" style="--accent:${esc(person.color)}"><span class="dot" aria-hidden="true"></span><span>${esc(person.name)}</span></button>`).join("")}</div>
            <p class="setting-note">Leave everyone unselected if it belongs to the whole table.</p>
          </div>
          <button type="button" class="button wishlist-choice" data-detail-wishlist aria-pressed="${entry.wishlist}">${symbol("heart")}<span>On my wishlist</span></button>
          <p class="setting-note wishlist-note">Keep this on your wishlist even when someone else owns a copy.</p>
          ${entry.wishlist ? `<div class="button-row wishlist-buy-links" aria-label="Find this wishlist game to buy">${buyLinksMarkup(sheetValue(game, "name"), sheetValue(game, "year"))}</div>` : ""}
          ${ratingLevelsMarkup(entry.rating,false)}
          <label class="field"><span>Notes</span><textarea data-detail-note rows="2" maxlength="1000" placeholder="House rules, missing pieces, expansions…">${esc(entry.note)}</textarea></label>
        </section>
        </div>
        <div role="tabpanel" id="game-panel-catalog" aria-labelledby="game-tab-catalog" ${gameDetailTab !== "catalog" ? 'hidden' : ''} class="game-details-grid">
        <div class="game-linking-panel">${bggLookupMarkup(game, false)}${expansionParentMarkup(game)}<div class="catalog-compact-fields">${tagSectionsMarkup(game)}${[["year","Published year",'-9999','9999','1'],["bggRating","BGG rating",'1','10','any']].map(([key,label,min,max,step]) => `<label class="field"><span>${label}</span><input data-detail-metadata="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(sheetValue(game,key) ?? '')}"></label>`).join("")}</div></div>
        <section class="catalog-list-columns" aria-label="Catalog lists">${[["alternativeNames","Alternative names"],["mechanisms","Mechanisms"],["expansions","Expansions"]].map(([key,label]) => `<label class="field"><span>${label}</span><textarea data-detail-metadata="${key}" rows="16" maxlength="10000" placeholder="One per line">${esc((entry.metadata?.[key] || []).join("\n"))}</textarea></label>`).join("")}</section>
        </div>
        <section class="detail-section" role="tabpanel" id="game-panel-plays" aria-labelledby="game-tab-plays" ${gameDetailTab !== "plays" ? 'hidden' : ''}>
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
    const bggRatingInput = document.querySelector('[data-detail-metadata="bggRating"]');
    if (bggRatingInput) formatDecimalInput(bggRatingInput, sheetValue(game, "bggRating"));
    document.querySelector("#gameDialogFooter").innerHTML = `<button class="button" type="button" data-open-game-paste="${esc(game.id)}">Get BGG info</button>${game.id !== "custom" ? `<button class="button" type="button" data-edit-custom="${esc(game.id)}">${symbol("pencil")}<span>Edit game</span></button>` : ""}<span class="dialog-footer-spacer"></span><button class="button" type="button" data-close-dialog="gameDialog">Close</button>${libraryEntry(game.id).metadata?.expansionOf ? `<button class="button primary" type="button" data-open-base="${esc(libraryEntry(game.id).metadata.expansionOf)}">Open base game</button>` : `<button class="button primary" type="button" data-play-game="${esc(game.id)}">${symbol("play")}<span>Play this game</span></button>`}`;
    syncSetupControls();
    icons.mount(document.querySelector("#gameDialog"));
  }

  function openGame(gameId, trigger) {
    if (!play.gameById(gameId)) return;
    openGameId = gameId;
    gameDetailTab = "details";
    renderGameDialog();
    components.openDialog("#gameDialog", { trigger, focus: "[data-detail-owned='true']" });
  }

  function handleGameDialogClick(event) {
    const tab = event.target.closest("[data-detail-tab]");
    if (tab) { gameDetailTab = tab.dataset.detailTab; renderGameDialog(); document.querySelector(`[data-detail-tab="${gameDetailTab}"]`).focus(); return; }
    if (handleSetupClick(event)) return;
    if (event.target.closest("[data-reset-game-setup]")) { saveGameSetup(true); return; }
    const base = event.target.closest("[data-open-base]");
    if (base) { openGameId = base.dataset.openBase; gameDetailTab = "details"; renderGameDialog(); return; }
    const paste = event.target.closest("[data-open-game-paste]");
    if (paste) { openGamePaste(paste.dataset.openGamePaste, false, paste); return; }
    const game = play.gameById(openGameId);
    if (!game) return;
    if (event.target.closest("[data-bgg-apply]")) { applyBggLink(event); return; }
    const owned = event.target.closest("[data-detail-owned]");
    if (owned) { mutateLibrary(game.id, entry => { entry.owned = owned.dataset.detailOwned === "true"; }); refreshAfterLibraryChange(); return; }
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
    const dialog = document.querySelector("#gameDialog");
    const restoreEditor = preserveScroll([dialog, dialog.querySelector(".dialog-shell"), dialog.querySelector(".dialog-body")]);
    if (dialog.open) renderGameDialog();
    if (focusSelector) document.querySelector("#gameDialog " + focusSelector)?.focus({ preventScroll: true });
    restoreEditor();
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

  function openCustomGame(gameId, draft) {
    const form = document.querySelector("#customGameForm");
    const game = gameId ? play.gameById(gameId) : null;
    editingCustomGameId = game?.id || "";
    editingExpansionDraft = draft || null;
    document.querySelector("#customGameTitle").textContent = draft ? "Edit expansion" : game ? "Edit game" : "Add a game";
    document.querySelector("#customGameDelete").hidden = !game || game.id === "custom";
    document.querySelector("#customGameSave").hidden = Boolean(game || draft);
    form.querySelector(".dialog-footer [data-close-dialog]").textContent = game || draft ? "Close" : "Cancel";
    const parentId = draft?.parentId || (game ? libraryEntry(game.id).metadata?.expansionOf || "" : "");
    const field = (name, label, type, attrs, value, placeholder) => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" ${attrs || ''} value="${esc(value ?? '')}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ''}></label>`;
    const value = (key, fallback) => game ? game[key] === "--" ? "" : game[key] ?? "" : fallback;
    form.querySelector("#customGameSaveStatus")?.remove();
    const body = form.querySelector(".dialog-body");
    body.className = "dialog-body custom-game-fields custom-game-editor";
    body.innerHTML = `
      <div class="wide custom-name-row"><label class="field"><span>Name</span><input id="customGameName" name="name" maxlength="100" required autocomplete="off" value="${esc(game?.name || draft?.name || '')}"></label><label class="field"><span>BGG ID or link</span><input name="bggLink" data-bgg-link maxlength="500" value="${esc(game ? sheetValue(game, "bggId") || '' : '')}" placeholder="BGG ID or https://boardgamegeek.com/…"></label><button class="button" type="button" data-custom-game-paste>Get BGG info</button></div>
      ${customOwnershipMarkup(game,draft)}
      <div class="wide">${ratingLevelsMarkup(game ? libraryEntry(game.id).rating : 0,true)}</div>
      <div class="wide custom-game-fields" data-game-kind-fields><label class="field"><span>Add as</span><select name="gameKind"><option value="standalone" ${!parentId ? 'selected' : ''}>Standalone game</option><option value="expansion" ${parentId ? 'selected' : ''}>Expansion</option></select></label><label class="field" data-expansion-parent-field ${parentId ? '' : 'hidden'}><span>Expansion of</span><select name="expansionOf" ${parentId ? 'required' : ''}><option value="">Choose a base game</option>${baseGameChoices(gameId).map(parent => `<option value="${esc(parent.id)}" ${parent.id === parentId ? 'selected' : ''}>${esc(parent.name)}</option>`).join("")}</select></label></div>
      <div class="wide custom-player-fields" role="group" aria-label="Players">${[["minPlayers","Min players","number",'min="1" max="20" step="1"',""], ["maxPlayers","Max players","number",'min="1" max="20" step="1"',""], ["bestPlayers","Best at","text",'maxlength="40"',""], ["recommendedPlayers","Recommended","text",'maxlength="40"',""], ["avoidPlayers","Avoid at","text",'maxlength="40"',""]].map(([name,label,type,attrs,fallback]) => field(name,label,type,attrs,value(name,fallback))).join("")}</div>
      <div class="wide custom-timing-fields">${field("minMinutes","Min minutes","number",'min="1" max="1440" step="1"',value("minMinutes",""))}${field("maxMinutes","Max minutes","number",'min="1" max="1440" step="1"',value("maxMinutes",""))}${field("complexityWeight","Weight (1–5)","number",'min="1" max="5" step="any"',game && Number.isFinite(game.complexityWeight) ? game.complexityWeight.toFixed(2) : "","Optional")}${field("pasteYear","Published year","number",'min="-9999" max="9999" step="1"',game ? sheetValue(game,"year") : "")}${field("pasteBggRating","BGG rating","number",'min="1" max="10" step="any"',game ? sheetValue(game,"bggRating") : "")}</div>
      <div class="wide custom-types-row" data-custom-paste-fields><label class="field"><span>Main Type</span><select name="pasteMainType">${MAIN_GAME_TYPES.map(type => `<option value="${type}" ${game && mainGameTag(game) === type ? 'selected' : ''}>${type}</option>`).join("")}</select></label>${additionalTypesMarkup(game,true)}</div>
      <div class="wide custom-catalog-fields">${[["alternativeNames","Alternative names","alternativeNames"],["pasteMechanisms","Mechanisms","mechanisms"],["pasteExpansions","Expansions","expansions"]].map(([name,label,key]) => `<label class="field"><span>${label}</span><textarea name="${name}" rows="8" maxlength="10000" placeholder="One per line">${esc(game ? (libraryEntry(game.id).metadata?.[key] || []).join("\n") : "")}</textarea></label>`).join("")}</div>
      ${bggLookupMarkup(game,true)}
      <label class="field wide"><span>Notes</span><textarea name="gameNote" rows="2" maxlength="1000" placeholder="Notes about this game">${esc(game ? libraryEntry(game.id).note : "")}</textarea></label>
      <p class="setting-note wide" id="customGameMissingNote" role="status" hidden>Yellow fields are missing information. Fill in what you know; unknown values can stay blank.</p>
      <p class="inline-status warning wide" id="customGameValidation" role="alert" hidden></p>
      <p class="setting-note wide" id="customGameSaveStatus" role="status">${game || draft ? "Edits save automatically on this device." : "Save the game to add it; later edits save automatically."}</p>`;
    form.querySelector(".dialog-footer").prepend(body.querySelector("#customGameSaveStatus"));
    body.querySelector("[data-bgg-lookup] [data-bgg-link]").closest(".bgg-lookup-row").remove();
    formatDecimalInput(form.elements.complexityWeight, game?.complexityWeight ?? "");
    formatDecimalInput(form.elements.pasteBggRating, game ? sheetValue(game, "bggRating") : "");
    const buyLinks = document.createElement("div");
    buyLinks.className = "button-row wishlist-buy-links";
    buyLinks.setAttribute("data-custom-buy-links", "");
    buyLinks.setAttribute("aria-label", "Find this wishlist game to buy");
    buyLinks.hidden = !form.elements.customWishlist.checked;
    buyLinks.innerHTML = buyLinksMarkup(form.elements.name.value, form.elements.pasteYear.value);
    form.querySelector(".custom-ownership").appendChild(buyLinks);
    if (draft) fillCustomGameFromPaste({name:draft.name});
    highlightGameMissingFields(form);
    components.openDialog("#customGameDialog", { focus: "#customGameName" });
  }

  function highlightGameMissingFields(form) {
    const ownerMissing = !form.querySelector('[name="gameOwners"]:checked') && !form.elements.additionalOwners.value.split(",").some(name => name.trim());
    form.querySelector(".custom-ownership").classList.toggle("owner-missing",ownerMissing);
    const names = ["name","bggLink","minPlayers","maxPlayers","bestPlayers","recommendedPlayers","avoidPlayers","minMinutes","maxMinutes","complexityWeight","pasteYear","pasteBggRating","alternativeNames","pasteMechanisms","pasteExpansions"];
    names.forEach(name => {
      const input = form.elements[name];
      if (!input) return;
      const missing = !input.value.trim();
      input.classList.toggle("paste-missing-field",missing);
      input.toggleAttribute("data-paste-missing",missing);
      input.setAttribute("aria-describedby","customGameMissingNote");
    });
    form.querySelector("#customGameMissingNote").hidden = !form.querySelector(".paste-missing-field");
  }

  function saveCustomGame(event, autosave) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("#customGameSaveStatus");
    const invalid = Array.from(form.elements).find(input => input.willValidate && !input.validity.valid);
    if (invalid) {
      const label = invalid.closest("label")?.querySelector("span")?.textContent || invalid.name || "Field";
      const message = "Not saved: " + label + ". " + invalid.validationMessage;
      const validation = form.querySelector("#customGameValidation");
      validation.hidden = false;
      validation.textContent = message;
      if (status) status.textContent = "Changes are pending. Correct the highlighted field to save.";
      if (!autosave) form.reportValidity();
      return;
    }
    const values = Object.fromEntries(new FormData(form).entries());
    values.complexityWeight = decimalInputValue(form.elements.complexityWeight);
    values.pasteBggRating = decimalInputValue(form.elements.pasteBggRating);
    const validation = document.querySelector("#customGameValidation");
    const name = u.cleanLine(values.name, 100);
    const minPlayers = values.minPlayers ? Number(values.minPlayers) : null;
    const maxPlayers = values.maxPlayers ? Number(values.maxPlayers) : null;
    const minMinutes = values.minMinutes ? Number(values.minMinutes) : null;
    const maxMinutes = values.maxMinutes ? Number(values.maxMinutes) : null;
    let error = "";
    if (!name) error = "Enter a game name.";
    else if (values.bggLink?.trim() && !bggIdFromInput(values.bggLink)) error = "Paste a valid HTTPS BoardGameGeek game link or numeric game ID.";
    else if (minPlayers !== null && maxPlayers !== null && maxPlayers < minPlayers) error = "Max players must be at least min players.";
    else if (minMinutes !== null && maxMinutes !== null && maxMinutes < minMinutes) error = "Max minutes must be at least min minutes.";
    else if (values.gameKind === "expansion" && !allGames().some(parent => parent.id === values.expansionOf && parent.id !== "custom" && parent.id !== editingCustomGameId)) error = "Choose a standalone base game for this expansion.";
    else if (values.gameKind === "expansion" && editingCustomGameId && play.allGames(true).some(child => child.expansionOf === editingCustomGameId)) error = "A game with linked expansions must stay standalone.";
    else if (play.allGames(true).some(game => game.id !== editingCustomGameId && sameName(game.name, name))) error = "A game with that name is already in the library.";
    validation.hidden = !error;
    validation.textContent = error;
    if (error) { if (status) status.textContent = "Not saved: " + error; return; }
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
    const builtin = !isNew && !play.gameById(editingCustomGameId)?.custom;
    const previousName = editingCustomGameId ? play.gameById(editingCustomGameId)?.name : editingExpansionDraft?.name || "";
    storage.mutate(next => {
      const list = next.workspace.library.customGames;
      const index = list.findIndex(item => item.id === id);
      if (!builtin) {
        if (index >= 0) list[index] = Object.assign({}, list[index], record, { createdAt: list[index].createdAt });
        else list.push(record);
      }
      if (isNew) next.workspace.library.games[id] = { owned: true, owners: [], wishlist: false, rating: 0, note: "" };
      const entry = next.workspace.library.games[id] || { owned: false, owners: [], wishlist: false, rating: 0, note: "" };
      entry.note = u.cleanText(values.gameNote,1000).trim();
      entry.rating = Number(values.personalRating) || 0;
      entry.owners = Array.from(form.querySelectorAll('[name="gameOwners"]:checked')).map(input => input.value).concat((values.additionalOwners || "").split(",").map(name => u.cleanLine(name,60)).filter(Boolean)).filter((name,index,names) => names.findIndex(other => sameName(other,name)) === index);
      entry.owned = form.elements.customOwned.checked || entry.owners.length > 0;
      entry.wishlist = form.elements.customWishlist.checked;
      const oldParent = entry.metadata?.expansionOf || editingExpansionDraft?.parentId;
      const newParent = values.gameKind === "expansion" ? values.expansionOf : "";
      if (oldParent && (oldParent !== newParent || previousName !== name)) {
        const parentEntry = next.workspace.library.games[oldParent];
        if (parentEntry?.metadata) { parentEntry.metadata.expansions = (parentEntry.metadata.expansions || []).filter(value => value !== previousName); parentEntry.metadata.ownedExpansions = (parentEntry.metadata.ownedExpansions || []).filter(value => value !== previousName); }
      }
      if (newParent) {
        const parentEntry = next.workspace.library.games[newParent] || {owned:false,owners:[],wishlist:false,rating:0,note:""};
        parentEntry.metadata = Object.assign({}, parentEntry.metadata);
        parentEntry.metadata.expansions = [...new Set((parentEntry.metadata.expansions || []).concat(name))];
        parentEntry.metadata.ownedExpansions = entry.owned ? [...new Set((parentEntry.metadata.ownedExpansions || []).concat(name))] : (parentEntry.metadata.ownedExpansions || []).filter(value => value !== name);
        next.workspace.library.games[newParent] = parentEntry;
      }
      entry.metadata = Object.assign({}, entry.metadata, { bggId: bggIdFromInput(values.bggLink), year: values.pasteYear || null, bggRating: values.pasteBggRating || null, mainType: values.pasteMainType || entry.metadata?.mainType || "Board", additionalTypes: Array.from(form.querySelectorAll("[name=additionalTypes]:checked")).map(input => input.dataset.additionalType), alternativeNames: values.alternativeNames || "", mechanisms: values.pasteMechanisms || "", expansions: importedExpansions(values.pasteExpansions) });
      if (newParent) entry.metadata.expansionOf = newParent; else delete entry.metadata.expansionOf;
      if (builtin) entry.metadata.catalog = Object.fromEntries(PASTE_CATALOG_FIELDS.map(key => [key,record[key]]));
      else delete entry.metadata.catalog;
      next.workspace.library.games[id] = entry;
    }, { reason: "custom-game" });
    const persisted = storage.saveNow();
    if (status) status.textContent = persisted ? "Saved on this device." : "Not saved to this device. Browser storage is unavailable or full; keep this page open and export a backup.";
    if (!persisted) {
      validation.hidden = false;
      validation.textContent = "The browser could not persist your changes. They are currently only in memory.";
    }
    if (autosave || !persisted) {
      if (isNew) { editingCustomGameId = id; editingExpansionDraft = null; document.querySelector("#customGameDelete").hidden = false; document.querySelector("#customGameSave").hidden = true; }
      return;
    }
    components.closeDialog("#customGameDialog", "saved");
    components.toast(isNew ? name + " was added to your library as owned." : name + " was updated.", { title: isNew ? "Game added" : "Game saved", kind: "success" });
    renderLibrary();
  }

  function removeLibraryGame(game) {
    storage.mutate(next => {
      const games = next.workspace.library.games;
      const parent = games[games[game.id]?.metadata?.expansionOf];
      if (parent?.metadata) {
        parent.metadata.expansions = (parent.metadata.expansions || []).filter(name => name !== game.name);
        parent.metadata.ownedExpansions = (parent.metadata.ownedExpansions || []).filter(name => name !== game.name);
      }
      Object.values(games).forEach(entry => {
        if (entry.metadata?.expansionOf === game.id) delete entry.metadata.expansionOf;
      });
      next.workspace.library.customGames = next.workspace.library.customGames.filter(item => item.id !== game.id);
      if (game.custom) delete games[game.id];
      else {
        games[game.id] = Object.assign({}, games[game.id], { deleted: true });
        if (games[game.id].metadata) delete games[game.id].metadata.expansionOf;
      }
    }, { reason: "game-delete" });
    play.gameDeleted(game.id);
  }

  async function deleteCustomGame() {
    const game = play.gameById(editingCustomGameId);
    if (!game || game.id === "custom") return;
    const accepted = await components.confirm({ title: "Delete " + game.name + "?", message: "The game is removed from Library and Play. Saved history and statistics are kept. Linked expansions remain as standalone games.", confirmLabel: "Delete game", danger: true, trigger: document.querySelector("#customGameDelete") });
    if (!accepted) return;
    removeLibraryGame(game);
    components.closeDialog("#customGameDialog", "deleted");
    components.closeDialog("#gameDialog", "deleted");
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
    const year = event.target.closest("[data-edit-year]");
    if (year) { editSheetYear(year); return; }
    const paste = event.target.closest("[data-open-game-paste]");
    if (paste) { openGamePaste(paste.dataset.openGamePaste, false, paste); return; }
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
    const rate = event.target.closest("[data-sheet-rating]");
    if (rate) { openRatingPicker(rate); return; }
    const editExpansion = event.target.closest("[data-edit-expansion]");
    if (editExpansion) { openExpansionEditor(editExpansion.dataset.editExpansion,editExpansion.dataset.expansionName,editExpansion); return; }
    const disclosure = event.target.closest("[data-expand-game]");
    if (disclosure) { const id = disclosure.dataset.expandGame; const expanded = expansionsExpanded(play.gameById(id)); updateLibraryUi(ui => { ui.expansionDisclosure = Object.assign({}, ui.expansionDisclosure, {[id]: !expanded}); }); refreshSheetPosition(`[data-expand-game="${CSS.escape(id)}"]`); return; }
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
    const host = event.target.closest("[data-host]");
    if (host) {
      const name = host.dataset.host;
      updateLibraryUi(ui => { ui.hosts = !name ? [] : ui.hosts.includes(name) ? ui.hosts.filter(value => value !== name) : ui.hosts.concat(name); ui.host = ui.hosts.length === 1 ? ui.hosts[0] : "all"; });
      renderLibrary(); libraryRoot.querySelector(`[data-host="${CSS.escape(name)}"]`)?.focus({preventScroll:true}); return;
    }
    if (event.target.closest("[data-library-direction]")) { updateLibraryUi(ui => { ui.sortDirection = ui.sortDirection === "desc" ? "asc" : "desc"; }); renderLibrary(); return; }
    if (event.target.closest("[data-library-reset]")) { updateLibraryUi(ui => { ui.host = "all"; ui.hosts = []; ui.category = "all"; ui.mechanism = "all"; ui.mainType = "all"; ui.verified = "all"; ui.search = ""; ui.ownership = "all"; ui.sortBy = "fit"; ui.sortDirection = "asc"; ui.playerCount = 0; ui.present = []; }); renderLibrary(); return; }
    const owned = event.target.closest("[data-toggle-owned]");
    if (owned) {
      mutateLibrary(owned.dataset.toggleOwned, entry => { entry.owned = !entry.owned; });
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
      const value = event.target.value.slice(0, 200);
      const start = event.target.selectionStart, end = event.target.selectionEnd;
      updateLibraryUi(ui => { ui.search = u.cleanLine(value, 200); });
      renderLibrary();
      const input = libraryRoot.querySelector("[data-library-search]");
      input.value = value;
      input.setSelectionRange(start, end);
    }
  }

  function handleLibraryChange(event) {
    if (handleMetadataChoice(event)) return;
    if (event.target.matches("[data-show-expansions]")) { const checked = event.target.checked; updateLibraryUi(ui => { ui.showExpansions = checked; ui.expansionDisclosure = {}; }); renderLibrary(); libraryRoot.querySelector("[data-show-expansions]")?.focus({preventScroll:true}); return; }
    if (event.target.matches("[data-library-ownership]")) { const value = event.target.value; updateLibraryUi(ui => { ui.ownership = value; }); renderLibrary(); }
    else if (event.target.matches("[data-library-mechanism], [data-library-main-type], [data-library-verified]")) { const key = event.target.matches("[data-library-mechanism]") ? "mechanism" : event.target.matches("[data-library-main-type]") ? "mainType" : "verified"; const value = event.target.value; updateLibraryUi(ui => { ui[key] = value; }); renderLibrary(); }
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
    const ratingPopup = document.querySelector("#gameRatingPopover");
    ratingPopup.addEventListener("click", pickRating);
    ratingPopup.addEventListener("toggle", event => {
      if (event.newState === "closed") {
        const anchor = ratingAnchor;
        ratingAnchor = null;
        anchor?.setAttribute("aria-expanded", "false");
        if (ratingReturnFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
        ratingReturnFocus = false;
      }
    });
    ratingPopup.addEventListener("keydown", event => {
      if (event.key === "Escape") ratingReturnFocus = true;
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const options = [...ratingPopup.querySelectorAll("[data-rating-pick]")];
      const index = options.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)));
      options[next].focus();
    });
    window.addEventListener("resize", () => { hideRatingPicker(); fitLibrarySheet(); });
    window.addEventListener("app:viewrendered", () => { if (ratingAnchor && (libraryRoot?.hidden || !ratingAnchor.isConnected)) hideRatingPicker(); });
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => requestAnimationFrame(fitLibrarySheet));
      [".app-header", "#whatsNewBanner", "#contextHint"].forEach(selector => { const node = document.querySelector(selector); if (node) observer.observe(node); });
    }
    document.querySelector("#gamePasteForm").addEventListener("submit", applyGamePaste);
    document.querySelector("#gameBggFetch").addEventListener("click", () => fetchBggInfo("thing"));
    document.querySelector("#gameBggSearch").addEventListener("click", () => fetchBggInfo("search"));
    document.querySelector("#gameBggResults").addEventListener("click", event => {
      const button = event.target.closest("[data-bgg-result]");
      if (button) fetchBggInfo("thing", button.dataset.bggResult);
    });
    document.querySelector("#gamePasteDialog").addEventListener("error", event => {
      if (!event.target.matches(".bgg-game-image img")) return;
      event.target.hidden = true;
      event.target.nextElementSibling.hidden = false;
    }, true);
    document.querySelector("#gameBggCancel").addEventListener("click", () => { cancelBggRequest(); bggMessage = "Request canceled."; renderPastePreview(); });
    document.querySelector("#gamePasteDialog").addEventListener("close", cancelBggRequest);
    document.querySelector("#gamePasteDialog").addEventListener("cancel", cancelBggRequest);
    document.querySelector("#gameBggSettings").addEventListener("click", event => {
      components.closeDialog("#gamePasteDialog");
      App.application.openSupport("dataSync", event.currentTarget);
      requestAnimationFrame(() => { document.querySelector("#bggSettings").scrollIntoView({ block: "start" }); document.querySelector("#bggToken").focus(); });
    });
    document.querySelector("#gameBggQuery").addEventListener("input", () => {
      if (!bggRequest) return;
      cancelBggRequest();
      renderPastePreview();
    });
    document.querySelector("#gamePasteForm").addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      if (event.target.matches("#gameBggQuery, #gamePasteBggId, #gamePasteTarget")) {
        event.preventDefault();
        if (event.target.id === "gamePasteBggId") fetchBggInfo("thing");
        else if (event.target.id === "gamePasteTarget") document.querySelector("#gameBggQuery").focus();
        else fetchBggInfo("search");
      }
    });
    document.querySelectorAll("[data-game-paste-input]").forEach(input => {
      input.addEventListener("input", updateGamePaste);
      input.addEventListener("paste", event => {
        const html = event.clipboardData?.getData("text/html");
        if (!html) return;
        const template = document.createElement("template");
        template.innerHTML = html;
        // Never attach clipboard markup to the document or load its resources.
        const walk = node => {
          if (node.nodeType === 3) return node.textContent;
          if (node.nodeType !== 1 && node.nodeType !== 11) return "";
          const tag = node.nodeName.toLowerCase();
          if (["script", "style", "iframe", "object", "img", "svg", "link", "meta"].includes(tag)) return "";
          const content = Array.from(node.childNodes).map(walk).join("");
          if (tag === "a") {
            const href = node.getAttribute("href") || "";
            if (/^https:\/\/(?:www\.)?boardgamegeek\.com\/(?:boardgame|geekitem\/edit\/thing)\/\d+(?:[/?#]|$)/i.test(href)) return `[${content.replace(/[\[\]\n]/g, " ")}](${href.replace(/[\s()]/g, char => encodeURIComponent(char))})`;
          }
          if (/^h[1-6]$/.test(tag)) return "\n" + "#".repeat(Number(tag[1])) + " " + content + "\n";
          if (tag === "br") return "\n";
          if (["td", "th"].includes(tag)) return content + "\t";
          return ["p", "div", "li", "tr", "table", "section"].includes(tag) ? "\n" + content + "\n" : content;
        };
        const text = walk(template.content);
        if (!/\]\(https:\/\/(?:www\.)?boardgamegeek\.com\/(?:boardgame|geekitem\/edit\/thing)\//i.test(text)) return;
        event.preventDefault();
        const available = Math.max(0, input.maxLength - (input.value.length - (input.selectionEnd - input.selectionStart)));
        input.setRangeText(text.slice(0, available), input.selectionStart, input.selectionEnd, "end");
        updateGamePaste({ target: input });
      });
    });
    document.querySelector("#gamePasteTarget").addEventListener("input", updateGamePaste);
    document.querySelector("#gamePasteBggId").addEventListener("input", updateGamePaste);
    document.querySelector("#customGameForm").addEventListener("click", event => {
      const rating = event.target.closest("[data-custom-rating]");
      if (rating) {
        const form = event.currentTarget;
        form.elements.personalRating.value = rating.dataset.customRating;
        form.querySelectorAll("[data-custom-rating]").forEach(button => button.setAttribute("aria-pressed",button === rating));
        if (editingCustomGameId || editingExpansionDraft) saveCustomGame({preventDefault() {},currentTarget:form},true);
        return;
      }
      const trigger = event.target.closest("[data-custom-game-paste]");
      if (trigger) openGamePaste(editingCustomGameId, true, trigger);
    });
    libraryRoot = document.querySelector("#libraryView");
    historyRoot = document.querySelector("#historyView");
    libraryRoot.addEventListener("click", handleLibraryClick);
    libraryRoot.addEventListener("dblclick", event => editSheetNote(event.target.closest("[data-edit-note]")));
    libraryRoot.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target.matches("[data-edit-note]")) {
        event.preventDefault();
        editSheetNote(event.target);
      }
    });
    libraryRoot.addEventListener("mouseover", event => { const button = event.target.closest("[data-sheet-info]"); if (button && button.dataset.infoKind !== "tags" && !button.contains(event.relatedTarget)) showSheetInfo(button, false); });
    libraryRoot.addEventListener("mouseout", event => { const button = event.target.closest("[data-sheet-info]"); if (button && !button.contains(event.relatedTarget) && !document.querySelector("#libraryInfoPopover")?.contains(event.relatedTarget) && !infoPinned) scheduleSheetInfoHide(); });
    libraryRoot.addEventListener("focusin", event => { const button = event.target.closest("[data-sheet-info]"); if (button && button.dataset.infoKind !== "tags") showSheetInfo(button, false); });
    libraryRoot.addEventListener("focusout", scheduleSheetInfoHide);
    window.addEventListener("scroll", event => {
      if (restoringMetadataScroll) return;
      if (!document.querySelector("#libraryInfoPopover")?.contains(event.target)) hideSheetInfo();
      if (!ratingPopup.contains(event.target)) hideRatingPicker();
    }, true);
    document.addEventListener("click", event => {
      const options = libraryRoot.querySelector(".library-table-options[open]");
      if (options && !event.target.closest(".library-table-options")) options.open = false;
    });
    libraryRoot.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const options = libraryRoot.querySelector(".library-table-options[open]");
      if (options) { options.open = false; options.querySelector("summary").focus(); event.preventDefault(); }
    });
    libraryRoot.addEventListener("toggle", event => { if (event.target.matches(".library-table-options")) positionTableMenu(); }, true);
    window.addEventListener("resize", positionTableMenu);
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
      const decimalKey = decimalInputKey(event.target);
      if (DECIMAL_PLACES[decimalKey] !== undefined) { event.target.dataset.decimalValue = event.target.value; event.target.dataset.decimalDisplay = event.target.value; }
      if (["customWishlist", "name", "pasteYear"].includes(event.target.name)) {
        const links = event.currentTarget.querySelector("[data-custom-buy-links]");
        links.hidden = !event.currentTarget.elements.customWishlist.checked;
        links.innerHTML = buyLinksMarkup(event.currentTarget.elements.name.value, event.currentTarget.elements.pasteYear.value);
      }
      if (event.target.name === "additionalOwners" && event.target.value.trim()) event.currentTarget.elements.customOwned.checked = true;
      if (event.target.name === "gameOwners" && event.target.checked) event.currentTarget.elements.customOwned.checked = true;
      if (event.target.name === "customOwned" && !event.target.checked) { event.currentTarget.querySelectorAll('[name="gameOwners"]').forEach(input => { input.checked = false; }); event.currentTarget.elements.additionalOwners.value = ""; }

      highlightGameMissingFields(event.currentTarget);
      if (event.target.name) event.target.dataset.fieldKnown = event.target.value.trim() && event.target.checkValidity() ? "true" : "false";
      if (event.target.hasAttribute("data-paste-missing")) { const missing = !event.target.value.trim(); event.target.classList.toggle("paste-missing-field",missing); document.querySelector("#customGameMissingNote").hidden = !event.currentTarget.querySelector(".paste-missing-field"); }

      if (event.target.name === "gameKind") { const expansion = event.target.value === "expansion"; const field = event.currentTarget.querySelector("[data-expansion-parent-field]"); field.hidden = !expansion; field.querySelector("select").required = expansion; }
      updateBggSearch(event);
      if ((editingCustomGameId || editingExpansionDraft) && event.target.name) saveCustomGame(event, true);
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
    document.querySelector("#gameDialogBody").addEventListener("keydown", event => {
      if (!event.target.matches("[data-detail-tab]") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = Array.from(document.querySelectorAll("[data-detail-tab]"));
      const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.indexOf(event.target) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[index].click();
    });
    document.querySelector("#gameDialogBody").addEventListener("input", event => {
      if (event.target.matches('[data-detail-metadata="bggRating"]')) { event.target.dataset.decimalValue = event.target.value; event.target.dataset.decimalDisplay = event.target.value; }
      if (event.target.matches("[data-new-color-hex]")) event.target.setCustomValidity("");
      if (event.target.matches("[data-bgg-link]")) { const raw = event.target.value.trim(); const bggId = bggIdFromInput(raw); if (!raw || bggId) { mutateLibrary(openGameId, entry => { entry.metadata = Object.assign({}, entry.metadata, { bggId }); }); if (appState().ui.view === "library") renderLibrary(); } }
      if (event.target.matches("[data-color-name], [data-setup-label], [data-setup-note], [data-setup-timers]")) saveGameSetup(false);
      if (event.target.matches("[data-detail-note]")) { const note = u.cleanText(event.target.value, 1000).trim(); mutateLibrary(openGameId, entry => { entry.note = note; }); if (appState().ui.view === "library") renderLibrary(); }
      if (event.target.matches("[data-detail-metadata]") && event.target.checkValidity()) { const key = event.target.dataset.detailMetadata; const value = event.target.value.trim(); mutateLibrary(openGameId, entry => { entry.metadata = Object.assign({}, entry.metadata, { [key]: key === "expansions" ? importedExpansions(value) : value }); }); if (appState().ui.view === "library") renderLibrary(); }
    });
    document.querySelector("#gameDialogBody").addEventListener("change", event => {
      if (event.target.matches("[data-detail-expansion-parent]")) { setExpansionParent(event.target.dataset.detailExpansionParent,event.target.value); return; }
      if (handleMetadataChoice(event)) return;
      if (event.target.closest("#game-panel-setup") && event.target.matches("[data-setup-color], [data-setup-factions], [data-setup-verified], [data-setup-sort]")) { syncSetupControls(); saveGameSetup(false); return; }
      if (event.target.matches("[data-detail-rating-select]")) {
        mutateLibrary(openGameId, entry => { entry.rating = Number(event.target.value); });
        refreshAfterLibraryChange();
        return;
      }
      if (event.target.matches("[data-detail-metadata]")) {
        if (!event.target.checkValidity()) { event.target.reportValidity(); return; }
        const key = event.target.dataset.detailMetadata;
        const value = (key === "bggRating" ? decimalInputValue(event.target) : event.target.value).trim();
        mutateLibrary(openGameId, entry => { entry.metadata = Object.assign({}, entry.metadata, { [key]: key === "expansions" ? importedExpansions(value) : value }); });
        if (appState().ui.view === "library") renderLibrary();
      }
      if (event.target.matches("[data-detail-note]")) {
        const note = u.cleanText(event.target.value, 1000).trim();
        mutateLibrary(openGameId, entry => { entry.note = note; });
        if (appState().ui.view === "library") renderLibrary();
      }
    });
    document.querySelector("#customGameForm").addEventListener("change", event => { if ((editingCustomGameId || editingExpansionDraft) && event.target.name) saveCustomGame(event, true); });
    ["#customGameForm", "#gameDialogBody"].forEach(selector => document.querySelector(selector).addEventListener("focusout", event => {
      if (event.target.matches("input") && DECIMAL_PLACES[decimalInputKey(event.target)] !== undefined && event.target.checkValidity()) formatDecimalInput(event.target);
    }));
    document.querySelector("#customGameForm").addEventListener("submit", saveCustomGame);
    document.querySelector("#customGameDialog").addEventListener("close", () => { if (editingCustomGameId) { storage.saveNow(); renderLibrary(); } });
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
    pickerSummaryMarkup,
    pickerInfoMarkup,
    showGameInfo: button => showSheetInfo(button, true),
    init,
    parseBggPaste,
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
