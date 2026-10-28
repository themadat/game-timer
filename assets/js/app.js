(function () {
  "use strict";

  const App = window.LocalApp;
  const config = App.config;
  const icons = App.icons;
  const u = App.utils;
  const model = App.stateModel;
  const storage = App.storage;
  const components = App.components;
  const portability = App.portability;
  const sync = App.sync;
  const pwa = App.pwa;
  let hintModifierActive = false;
  let appIconHoldTimer = 0;
  let appIconHoldHandled = false;
  let whatsNewDismissTimer = 0;
  let whatsNewTimerVersion = "";

  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
  const versionedAsset = function (path) { return path + "?v=" + encodeURIComponent(config.identity.buildId); };

  const SHORTCUTS = [
    { keys: "1", hintKey: "1", chordKey: "1", label: "Show Play", group: "Navigation" },
    { keys: "2", hintKey: "2", chordKey: "2", label: "Show Library", group: "Navigation" },
    { keys: "3", hintKey: "3", chordKey: "3", label: "Show History", group: "Navigation" },
    { keys: "/", hintKey: "/", chordKey: "/", label: "Search games, people, history, and help", group: "Global" },
    { keys: "Esc", hintKey: "Esc", chordKey: "Esc", label: "Close a dialog or menu", group: "Global" },
    { keys: "?", hintKey: "?", chordKey: "?", label: "Open Help Center", group: "Global", chord: false },
    { keys: "P", label: "Show Play (pauses or resumes during a live game)", group: "Navigation", chord: false },
    { keys: "L", label: "Show Library", group: "Navigation", chord: false },
    { keys: "H", label: "Show History", group: "Navigation", chord: false },
    { keys: "G", label: "Show Games in Library", group: "Library", chord: false },
    { keys: "E", label: "Show People in Library", group: "Library", chord: false },
    { keys: ".", label: "Open and focus Library search", group: "Library", chord: false },
    { keys: ",", hintKey: ",", chordKey: ",", label: "Open Settings", group: "Global" },
    { keys: "N", hintKey: "N", chordKey: "N", label: "Open Notes", group: "Actions" },
    { keys: "V", hintKey: "V", chordKey: "V", label: "Open What’s New", group: "Actions" },
    { keys: "T", hintKey: "T", chordKey: "T", label: "Switch color theme", group: "Actions" },
    { keys: "X", hintKey: "X", chordKey: "X", label: "Dismiss What’s New", group: "Actions" },
    { keys: "U", hintKey: "U", chordKey: "U", label: "Check for updates and force refresh", group: "Actions", plain: false },
    { keys: "G", hintKey: "G", chordKey: "G", label: "Start the session", group: "Setup", plain: false },
    { keys: "R", hintKey: "R", chordKey: "R", label: "Random game and players · Restart from Statistics", group: "Setup", plain: false },
    { keys: "Y", hintKey: "Y", chordKey: "Y", label: "Random players for the selected game", group: "Setup", plain: false },
    { keys: "Z", hintKey: "Z", chordKey: "Z", label: "Reset setup", group: "Setup", plain: false },
    { keys: "J", hintKey: "J", chordKey: "J", label: "Show or hide the game list", group: "Setup", plain: false },
    { keys: "F", hintKey: "F", chordKey: "F", label: "Pick the first player or set a random order", group: "Setup", plain: false },
    { keys: "L", hintKey: "L", chordKey: "L", label: "Clear the turn order", group: "Setup", plain: false },
    { keys: "Q", hintKey: "Q", chordKey: "Q", label: "Use Quick Add colors", group: "Setup", plain: false },
    { keys: "P", hintKey: "P", chordKey: "P", label: "Pause or resume · Add a custom player in Setup", group: "Session" },
    { keys: "Space", label: "Advance to the next player", group: "Session", chord: false },
    { keys: "A", hintKey: "A", chordKey: "A", label: "Advance to the next player", group: "Session", plain: false },
    { keys: "E", hintKey: "E", chordKey: "E", label: "End the game", group: "Session", plain: false },
    { keys: "Shift G", label: "Simulate a finished game (testing)", group: "Session", chord: false },
    { keys: "S", hintKey: "S", chordKey: "S", label: "Share statistics", group: "Statistics", plain: false },
    { keys: "D or |", hintKey: "D", secondaryHintKey: "|", chordKey: "D or |", label: "Toggle hidden Developer Mode", group: "Developer" },
    { keys: "Arrow keys", label: "Move through tabs, menus, and list choices", group: "Navigation", chord: false }
  ];

  const VIEWS = ["play", "library", "history"];

  function state() {
    return storage.getState();
  }

  function setInputValue(input, value) {
    if (input && document.activeElement !== input) input.value = value == null ? "" : String(value);
  }

  function activeModuleEnabled(id) {
    if (id === "roadmap") return config.features.roadmap;
    return false;
  }

  function applyIdentity() {
    icons.mount(document);
    document.title = config.identity.name;
    $("meta[name='description']").content = config.identity.description;
    $("#appName").textContent = config.identity.name;
    $("#notesButton")?.toggleAttribute("hidden", !config.features.documents);
    $("#versionButton").textContent = "v" + config.identity.version;
    $("#versionButton").setAttribute("aria-label", "Open release notes for version " + config.identity.version);
    $("#appIcon").src = versionedAsset(config.identity.assets.appIconLight);
    $("#releaseCurrentVersion").textContent = "v" + config.identity.version;
    $("#dataSyncTab").hidden = !config.features.cloudSync;
    if (!config.features.roadmap) {
      $("[data-module='roadmap']")?.setAttribute("hidden", "");
      $("#roadmapModule")?.setAttribute("hidden", "");
      $("#supportRoadmapTab")?.setAttribute("hidden", "");
    }
  }

  function applyAppearance() {
    const appearance = state().preferences.appearance;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = appearance.mode === "dark" || (appearance.mode === "system" && systemDark);
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.buttonStyle = state().preferences.controls.buttonStyle;
    root.dataset.motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "full";
    root.style.setProperty("--text-scale", String(appearance.textScale));
    root.style.setProperty("--accent", appearance.accent);
    root.style.setProperty("--accent-strong", u.mixColor(appearance.accent, dark ? "#ffffff" : "#000000", dark ? 0.18 : 0.22));
    root.style.setProperty("--accent-soft", u.mixColor(appearance.accent, dark ? "#161c1b" : "#ffffff", dark ? 0.76 : 0.86));
    root.style.setProperty("--accent-2", appearance.accent2);
    root.style.setProperty("--accent-2-soft", u.mixColor(appearance.accent2, dark ? "#161c1b" : "#ffffff", dark ? 0.78 : 0.86));
    root.style.setProperty("--success", appearance.success);
    root.style.setProperty("--warning", appearance.warning);
    root.style.setProperty("--danger", appearance.danger);
    $("#appIcon").src = versionedAsset(dark ? config.identity.assets.appIconDark : config.identity.assets.appIconLight);
    const iconButton = $("#appIconButton");
    const nextTheme = dark ? "light" : "dark";
    iconButton.setAttribute("aria-label", "Switch to " + nextTheme + " theme. Press and hold to toggle Developer Mode");
    iconButton.title = "Switch to " + nextTheme + " theme · Press and hold for Developer Mode";
    decorateShortcutControls(iconButton);
    pwa.applyAppearanceAssets?.();
  }

  function isBetaDeploy() {
    const path = (location.pathname || "").toLowerCase();
    if (/\/beta(\/|$)/.test(path)) return true;
    const beta = new URLSearchParams(location.search || "").get("beta");
    return beta === "1" || beta === "true";
  }

  function renderHeader() {
    const developerMode = config.features.developerTools && state().preferences.controls.developerMode;
    const versionButton = $("#versionButton");
    versionButton.textContent = "v" + config.identity.version + (developerMode ? " DEV" : "");
    versionButton.dataset.developer = developerMode ? "true" : "false";
    versionButton.setAttribute("aria-label", "Open release notes for version " + config.identity.version + (developerMode ? ". Developer Mode is enabled" : ""));
    $("#betaPill").hidden = !isBetaDeploy();
    document.documentElement.dataset.developer = developerMode ? "on" : "off";
    setInputValue($("#globalSearch"), state().ui.search);
    renderSyncStatus();
    const latest = config.releases[0];
    const unread = latest && state().ui.seenReleaseVersion !== latest.version;
    $("#releaseUnreadDot").hidden = !unread;
    const banner = $("#whatsNewBanner");
    const showBanner = unread && state().preferences.controls.showWhatsNew;
    banner.hidden = !showBanner;
    if (showBanner) {
      $("[data-whats-new-version]").textContent = "v" + latest.version;
      $("[data-whats-new-title]").textContent = latest.title;
      $("[data-whats-new-summary]").textContent = latest.summary;
      startWhatsNewTimer(latest.version);
    } else {
      stopWhatsNewTimer();
    }
    const hint = $("#contextHint");
    const hintHidden = !config.features.hints || !state().preferences.hints.enabled || state().preferences.hints.dismissed.includes("game-timer-basics");
    hint.hidden = hintHidden;
  }

  function stopWhatsNewTimer() {
    window.clearTimeout(whatsNewDismissTimer);
    whatsNewDismissTimer = 0;
    whatsNewTimerVersion = "";
    $("#whatsNewBanner")?.classList.remove("is-counting-down");
  }

  function startWhatsNewTimer(version) {
    if (whatsNewDismissTimer && whatsNewTimerVersion === version) return;
    stopWhatsNewTimer();
    const banner = $("#whatsNewBanner");
    const duration = state().preferences.controls.whatsNewDismissSeconds * 1000;
    banner.style.setProperty("--whats-new-duration", duration + "ms");
    void banner.offsetWidth;
    banner.classList.add("is-counting-down");
    whatsNewTimerVersion = version;
    whatsNewDismissTimer = window.setTimeout(function () {
      if (config.releases[0]?.version === version && state().ui.seenReleaseVersion !== version) dismissWhatsNew();
    }, duration);
  }

  function dismissWhatsNew() {
    stopWhatsNewTimer();
    storage.mutate(function (next) { next.ui.seenReleaseVersion = config.releases[0].version; }, { reason: "release-seen" });
    renderHeader();
  }

  function renderCloudSyncVisual(element, info) {
    element.dataset.syncState = info.state;
    element.dataset.kind = info.kind;
    element.dataset.animation = info.animation;
    const icon = element.querySelector("[data-sync-icon]");
    if (icon && icon.dataset.symbol !== info.symbol) icons.set(icon, info.symbol);
  }

  function renderSyncStatus() {
    const info = sync.getInfo();
    const localAvailable = storage.isPersistent();
    const localLabel = localAvailable ? "Saved locally" : "Storage unavailable";
    const syncLabel = "GitHub · " + info.title;
    const button = $("#floatingStatusButton");
    button.hidden = !config.features.cloudSync;
    renderCloudSyncVisual(button, info);
    button.dataset.localStorage = localAvailable ? "available" : "unavailable";
    button.setAttribute("aria-disabled", String(info.busy));
    button.title = localLabel + ". " + info.help + (info.busy ? "" : " " + info.action + ": " + sync.actions[info.primaryAction].help);
    button.setAttribute("aria-label", button.title);
    decorateShortcutControls(button);
    $("[data-floating-local-label]").textContent = localLabel;
    $("[data-floating-sync-label]").textContent = syncLabel;
  }

  function documentText(documentItem) {
    return u.richTextToPlainText(documentItem && documentItem.html || "", config.controls.maxDocumentHtmlLength);
  }

  function documentHtml(value) {
    return u.escapeHtml(u.cleanText(value, config.controls.maxDocumentHtmlLength)).replace(/\n/g, "<br>");
  }

  function renderNotesEditor() {
    const documentItem = state().workspace.documents[0];
    setInputValue($("#notesTextarea"), documentText(documentItem));
  }

  function saveNotes(value) {
    const normalized = u.cleanText(value, config.controls.maxDocumentHtmlLength);
    storage.mutate(function (next) {
      const documentItem = next.workspace.documents[0];
      if (!documentItem) return;
      documentItem.html = documentHtml(normalized);
      documentItem.updatedAt = u.isoNow();
    }, { reason: "edit-document" });
    $("[data-floating-local-label]").textContent = "Saving locally…";
    renderGlobalSearchResults();
  }

  function openNotes(trigger) {
    renderNotesEditor();
    components.openDialog("#notesDialog", { trigger: trigger, focus: "#notesTextarea" });
  }

  function filteredRoadmap(overrides) {
    const moduleState = state().modules.roadmap;
    const filters = Object.assign({ search: moduleState.search, state: moduleState.state, priority: moduleState.priority, target: moduleState.target, effort: moduleState.effort, sortBy: moduleState.sortBy, sortDirection: moduleState.sortDirection }, overrides || {});
    const query = String(filters.search || "").trim().toLowerCase();
    const direction = filters.sortDirection === "desc" ? -1 : 1;
    const priority = function (item) { return Number(item.priority) || 99; };
    return config.roadmap.filter(function (item) {
      return (filters.state === "all" || item.state === filters.state)
        && (filters.priority === "all" || String(item.priority) === String(filters.priority))
        && (filters.target === "all" || item.target === filters.target)
        && (filters.effort === "all" || String(item.effort) === String(filters.effort))
        && (!query || (item.title + " " + item.description + " " + item.target).toLowerCase().includes(query));
    }).slice().sort(function (a, b) {
      let compared = 0;
      if (filters.sortBy === "priority") compared = priority(a) - priority(b);
      else if (filters.sortBy === "effort") compared = a.effort - b.effort;
      else if (filters.sortBy === "age") compared = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      else if (filters.sortBy === "target") compared = String(a.target).localeCompare(String(b.target), undefined, { numeric: true });
      else compared = a.title.localeCompare(b.title);
      return compared * direction || a.title.localeCompare(b.title);
    });
  }

  function roadmapCard(item) {
    return '<article class="roadmap-card" data-roadmap-state="' + item.state + '"><header><span class="roadmap-state">' + u.escapeHtml(item.state) + '</span><span class="priority-chip">P' + item.priority + '</span></header><h3>' + u.escapeHtml(item.title) + '</h3><p>' + u.escapeHtml(item.description) + '</p><footer><span>Target ' + u.escapeHtml(item.target) + '</span><span>Effort ' + item.effort + '/4</span><span>Added ' + u.dateLabel(item.createdAt) + "</span></footer></article>";
  }

  function searchTerms(query) {
    return Array.from(String(query || "").toLowerCase().matchAll(/"([^"]*)"|([^\s"]+)/g), function (match) {
      return { text: (match[1] === undefined ? match[2] : match[1]).trim(), exact: match[1] !== undefined };
    }).filter(function (term) { return term.text; });
  }

  function searchTermRanges(value, term) {
    const text = String(value).toLowerCase();
    const ranges = [];
    const wordCharacter = function (character) { return /[\p{L}\p{N}]/u.test(character || ""); };
    let index = text.indexOf(term.text);
    while (index >= 0) {
      const end = index + term.text.length;
      if (!term.exact || (!wordCharacter(text[index - 1]) && !wordCharacter(text[end]))) ranges.push([index, end]);
      index = text.indexOf(term.text, index + Math.max(1, term.text.length));
    }
    return ranges;
  }

  function termsMatch(text, query) {
    const terms = searchTerms(query);
    return terms.length > 0 && terms.every(function (term) { return searchTermRanges(text, term).length > 0; });
  }

  function emptyState(title, message, actionLabel, action) {
    return '<div class="empty-state"><strong>' + u.escapeHtml(title) + '</strong><span>' + u.escapeHtml(message) + "</span>" + (actionLabel ? '<button type="button" class="button small" data-action="' + u.escapeHtml(action) + '">' + u.escapeHtml(actionLabel) + "</button>" : "") + "</div>";
  }

  function highlightedSearchText(value, query) {
    const text = String(value || "");
    const ranges = searchTerms(query).flatMap(function (term) { return searchTermRanges(text, term); }).sort(function (a, b) { return a[0] - b[0]; });
    const merged = [];
    ranges.forEach(function (range) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push(range.slice());
    });
    let cursor = 0;
    let output = "";
    merged.forEach(function (range) {
      output += u.escapeHtml(text.slice(cursor, range[0]));
      output += '<mark class="search-match">' + u.escapeHtml(text.slice(range[0], range[1])) + "</mark>";
      cursor = range[1];
    });
    return output + u.escapeHtml(text.slice(cursor));
  }

  function globalSearchMatches(query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const results = [];
    const library = App.library;
    if (library) {
      library.allGames().forEach(function (game) {
        if (results.length < 6 && termsMatch(library.gameSearchText(game), needle)) results.push({ type: "game", id: game.id, title: game.name, meta: library.gameSearchMeta(game) });
      });
      state().workspace.people.forEach(function (person) {
        if (termsMatch(person.name, needle)) results.push({ type: "person", id: person.name, title: person.name, meta: "Person · " + library.personSummary(person.name) });
      });
      state().workspace.history.slice(0, 200).forEach(function (record) {
        if (results.length < 14 && termsMatch(library.historySearchText(record), needle)) results.push({ type: "history", id: record.id, title: record.gameName, meta: "History · " + library.historyMeta(record) });
      });
    }
    const notes = state().workspace.documents[0];
    if (config.features.documents && notes && termsMatch("notes " + documentText(notes), needle)) results.push({ type: "notes", id: notes.id, title: "Notes", meta: "Local notes" });
    config.help.forEach(function (topic) {
      if (termsMatch(topic.title + " " + topic.keywords + " " + u.stripHtml(topic.html), needle)) results.push({ type: "help", id: topic.id, title: topic.title, meta: "Help · " + topic.section });
    });
    if (config.features.roadmap) config.roadmap.forEach(function (item) {
      if (termsMatch(item.title + " " + item.description, needle)) results.push({ type: "roadmap", id: item.id, title: item.title, meta: "Roadmap · " + item.state });
    });
    config.releases.forEach(function (release) {
      const releaseText = [release.version, release.title, release.summary].concat(release.features || [], release.improvements || [], release.fixes || [], release.knownIssues || []).join(" ");
      if (termsMatch(releaseText, needle)) results.push({ type: "release", id: release.version, title: release.title, meta: "Release · v" + release.version });
    });
    return results.slice(0, 16);
  }

  function focusGlobalSearch() {
    $("#globalSearch").focus();
    $("#globalSearch").select();
  }

  function renderGlobalSearchResults() {
    const container = $("#globalSearchResults");
    const query = state().ui.search;
    if (!query || document.activeElement !== $("#globalSearch")) { container.hidden = true; return; }
    const results = globalSearchMatches(query);
    container.hidden = false;
    container.innerHTML = results.length ? results.map(function (result, index) {
      return '<button type="button" role="option" id="global-result-' + index + '" data-search-type="' + result.type + '" data-search-id="' + u.escapeHtml(result.id) + '"><span><strong>' + highlightedSearchText(result.title, query) + '</strong><small>' + highlightedSearchText(result.meta, query) + "</small></span><span aria-hidden=\"true\">→</span></button>";
    }).join("") : '<div class="search-empty">No matching games, people, or help.</div>';
  }

  function submitGlobalSearch() {
    const first = $("#globalSearchResults button[role='option']");
    if (first) first.click();
  }

  function activateGlobalSearchResult(type, id) {
    if (type === "game") { switchView("library"); App.library?.openGame(id, $("#globalSearch")); }
    else if (type === "person") { switchView("library"); App.library?.showPerson(id); }
    else if (type === "history") { switchView("history"); App.library?.openHistory(id, $("#globalSearch")); }
    else if (type === "notes") openNotes($("#globalSearch"));
    else if (type === "help") { openSupport("help"); setInputValue($("#helpSearch"), config.help.find(function (topic) { return topic.id === id; })?.title || ""); renderHelp(); }
    else if (type === "roadmap") {
      storage.mutate(function (next) { next.modules.roadmap.search = config.roadmap.find(function (item) { return item.id === id; })?.title || ""; }, { reason: "roadmap-search" });
      openSupport("roadmap", $("#globalSearch"));
    }
    else if (type === "release") openSupport("releases");
    $("#globalSearchResults").hidden = true;
    storage.mutate(function (next) { next.ui.search = ""; }, { reason: "global-search", touch: false });
    $("#globalSearch").value = "";
  }

  function currentView() {
    return VIEWS.includes(state().ui.view) ? state().ui.view : "play";
  }

  function renderViewTabs() {
    const view = currentView();
    $$('[data-view-tab]').forEach(function (tab) {
      const selected = tab.dataset.viewTab === view;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    VIEWS.forEach(function (id) { const panel = $("#" + id + "View"); if (panel) panel.hidden = id !== view; });
    document.documentElement.dataset.view = view;
    const historyCount = state().workspace.history.length;
    const badge = $("#historyCount");
    if (badge) { badge.textContent = String(historyCount); badge.hidden = historyCount === 0; }
    const live = App.play?.sessionStatus?.();
    document.documentElement.dataset.session = live ? "live" : "idle";
    const playStatus = $("#playTabStatus");
    if (playStatus) { playStatus.hidden = !live; playStatus.title = live || ""; playStatus.setAttribute("aria-label", live || ""); }
  }

  function renderActiveView() {
    const view = currentView();
    if (view === "play") App.play?.render();
    else if (view === "library") App.library?.renderLibrary();
    else if (view === "history") App.library?.renderHistory();
    afterViewRender();
  }

  function afterViewRender() {
    decorateShortcutControls($("#mainContent"));
    refreshShortcutEligibility(hintModifierActive);
  }

  function switchView(view, options) {
    if (!VIEWS.includes(view)) return;
    const changed = view !== currentView();
    if (changed) storage.mutate(function (next) { next.ui.view = view; }, { reason: "view", touch: false });
    renderViewTabs();
    renderActiveView();
    if (changed && !(options && options.keepScroll)) window.scrollTo({ top: 0, behavior: "auto" });
    if (options && options.focus) $("[data-view-tab='" + view + "']")?.focus({ preventScroll: true });
  }

  function switchModule(moduleId) {
    if (!activeModuleEnabled(moduleId)) return;
    if (moduleId === "roadmap") openSupport("roadmap");
  }

  function openSupport(tab, trigger) {
    const chosen = tab || state().ui.supportTab || "settings";
    switchSupportTab(chosen);
    components.openDialog("#supportDialog", { trigger: trigger, focus: "[data-support-tab='" + chosen + "']" });
    renderSupport();
  }

  function switchSupportTab(tab) {
    if (tab === "developer" && !state().preferences.controls.developerMode) tab = "settings";
    storage.mutate(function (next) { next.ui.supportTab = tab; }, { touch: false, reason: "support-tab" });
    $$('[data-support-tab]').forEach(function (button) {
      const selected = button.dataset.supportTab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $$('[data-support-panel]').forEach(function (panel) { panel.hidden = panel.dataset.supportPanel !== tab; });
    if (tab === "dataSync") renderSyncSettings();
    else if (tab === "help") renderHelp();
    else if (tab === "releases") renderReleases();
    else if (tab === "shortcuts") renderShortcuts();
    else if (tab === "roadmap") renderSupportRoadmap();
    else if (tab === "developer") renderDeveloper();
    else renderSettings();
    $(".support-panels")?.scrollTo({ top: 0, behavior: "auto" });
    $("#supportDialog")?.scrollTo({ top: 0, behavior: "auto" });
    $("#supportDialog .dialog-shell")?.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderTextSizeControl() {
    const input = $("#textSizeSlider");
    const output = $("#textSizeValue");
    const wrap = $(".text-size-slider-wrap");
    if (!input || !output || !wrap) return;
    const percent = Math.round(state().preferences.appearance.textScale * 100);
    const minimum = Number(input.min) || 85;
    const maximum = Number(input.max) || 130;
    const ratio = Math.max(0, Math.min(1, (percent - minimum) / (maximum - minimum)));
    setInputValue(input, percent);
    input.style.setProperty("--range-pct", (ratio * 100) + "%");
    wrap.style.setProperty("--thumb-ratio", String(ratio));
    output.textContent = percent + "%";
  }

  function renderSettings() {
    const preferences = state().preferences;
    const appearance = preferences.appearance;
    $$('[data-theme-mode]').forEach(function (button) { button.setAttribute("aria-pressed", String(button.dataset.themeMode === appearance.mode)); });
    renderTextSizeControl();
    setInputValue($("#whatsNewDismissSeconds"), preferences.controls.whatsNewDismissSeconds);
    $("#whatsNewDismissSeconds").disabled = !preferences.controls.showWhatsNew;
    $$('[data-whats-new-enabled]').forEach(function (button) { button.setAttribute("aria-pressed", String((button.dataset.whatsNewEnabled === "true") === preferences.controls.showWhatsNew)); });
    $$('[data-button-style]').forEach(function (button) { button.setAttribute("aria-pressed", String(button.dataset.buttonStyle === preferences.controls.buttonStyle)); });
    $$('[data-hints-enabled]').forEach(function (button) { button.setAttribute("aria-pressed", String((button.dataset.hintsEnabled === "true") === preferences.hints.enabled)); });
    renderGameSettings();
  }

  function renderGameSettings() {
    const game = state().preferences.game;
    $$('[data-game-pref]').forEach(function (button) {
      const key = button.dataset.gamePref;
      const value = button.dataset.value;
      const current = typeof game[key] === "boolean" ? String(game[key]) : String(game[key]);
      button.setAttribute("aria-pressed", String(current === value));
    });
    setInputValue($("#longTurnSeconds"), game.longTurnSeconds ? Math.round(game.longTurnSeconds / 60 * 10) / 10 : "");
    const aids = App.sessionAids;
    $("#keepAwakeSupport").textContent = aids && aids.wakeLockSupported() ? "Keeps phones and tablets from dimming while a session runs." : "This browser does not support keeping the screen awake.";
    $("#hapticsSupport").textContent = aids && aids.hapticsSupported() ? "Short vibrations on turn changes and long-turn warnings." : "Vibration is not supported here (for example Safari on iPhone).";
  }

  function setGamePreference(key, value) {
    storage.mutate(function (next) { next.preferences.game[key] = value; }, { reason: "game-preference" });
    renderGameSettings();
    renderActiveView();
    if (key === "keepAwake") App.sessionAids?.refresh();
  }

  function renderSyncPayload() {
    const output = $("#syncPayloadJson");
    const json = JSON.stringify(model.syncPayload(state()), null, 2);
    if (output.textContent !== json) output.textContent = json;
  }

  function renderSyncSettings() {
    renderSyncPayload();
    const localAvailable = storage.isPersistent();
    $("#localStorageSettingsState").textContent = localAvailable ? "Saved locally" : "Unavailable";
    $("#localStorageSettingsState").dataset.kind = localAvailable ? "success" : "danger";
    $("#localStorageSettingsSummary").innerHTML = '<span aria-hidden="true">' + icons.markup(localAvailable ? "check" : "close") + '</span><span><strong>' + (localAvailable ? "Browser storage is working" : "Browser storage is unavailable") + '</strong><small>' + (localAvailable ? "Notes, preferences, and sync metadata save automatically on this device." : "Changes may not survive a reload. Export a backup before continuing.") + "</small></span>";
    if (!config.features.cloudSync) { $("#cloudSyncSettings").hidden = true; return; }
    const cloud = state().modules.cloudSync;
    const info = sync.getInfo();
    $("#cloudSyncSettings").hidden = false;
    const settingsStatus = $("#syncSettingsState");
    renderCloudSyncVisual(settingsStatus, info);
    settingsStatus.querySelector("[data-sync-label]").textContent = info.title;
    settingsStatus.title = info.help;
    [["#syncNowButton", "syncNow", info.canSync], ["#restoreCloudButton", "restore", info.canRestore]].forEach(function (entry) {
      const button = $(entry[0]);
      const action = sync.actions[entry[1]];
      icons.set(button.querySelector("[data-sync-action-icon]"), action.symbol);
      button.querySelector("[data-sync-action-label]").textContent = action.title;
      button.setAttribute("aria-label", action.title);
      button.title = action.help + (entry[2] ? "" : " " + info.help);
      button.disabled = !entry[2];
    });
    const appRepositoryUrl = u.safeUrl(config.identity.repository.url);
    const appRepositoryLink = $("#appRepositoryLink");
    appRepositoryLink.textContent = appRepositoryUrl ? config.identity.repository.label : "App repository not configured";
    appRepositoryLink.hidden = !appRepositoryUrl;
    if (appRepositoryUrl) {
      appRepositoryLink.href = appRepositoryUrl;
      appRepositoryLink.setAttribute("aria-label", config.identity.repository.label + " (opens in a new tab)");
    } else {
      appRepositoryLink.removeAttribute("href");
      appRepositoryLink.removeAttribute("aria-label");
    }
    $("#syncOwner").textContent = cloud.owner || "Not set";
    $("#syncBranch").textContent = cloud.branch || "Not set";
    const repositoryUrl = cloud.owner && cloud.repo ? u.safeUrl("https://github.com/" + encodeURIComponent(cloud.owner) + "/" + encodeURIComponent(cloud.repo)) : "";
    const dataFileUrl = repositoryUrl && cloud.branch && cloud.path ? u.safeUrl(repositoryUrl + "/blob/" + encodeURIComponent(cloud.branch) + "/" + cloud.path.split("/").map(encodeURIComponent).join("/")) : "";
    [["#syncRepo", cloud.repo, repositoryUrl, "Open GitHub repository"], ["#syncPath", cloud.path, dataFileUrl, "Open GitHub data file"]].forEach(function (entry) {
      const link = $(entry[0]);
      link.textContent = entry[1] || "Not set";
      if (entry[2]) {
        link.href = entry[2];
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", entry[3] + " (opens in a new tab)");
      } else {
        link.removeAttribute("href");
        link.removeAttribute("target");
        link.removeAttribute("rel");
        link.removeAttribute("aria-label");
      }
    });
    const tokenInput = $("#syncToken");
    const rememberInput = $("#syncRememberToken");
    $("#autoSyncEnabled").checked = cloud.autoSync;
    const hasStoredToken = storage.hasSecret();
    if (tokenInput.dataset.dirty !== "true") tokenInput.value = hasStoredToken ? storage.getSecret() : "";
    if (rememberInput.dataset.dirty !== "true") rememberInput.checked = cloud.rememberToken;
    $("#storedTokenLabel").textContent = hasStoredToken ? (cloud.rememberToken ? "Stored on this device" : "Stored for this tab") : "Required";
    tokenInput.placeholder = hasStoredToken ? "Token stored" : "Enter token";
    $("#forgetSyncButton").disabled = !hasStoredToken && !cloud.baselineHash;
    $("#saveSyncButton").disabled = info.busy;
    $("#testSyncButton").disabled = info.busy;
  }

  function markSyncCredentialFieldsClean() {
    delete $("#syncToken").dataset.dirty;
    delete $("#syncRememberToken").dataset.dirty;
  }

  function renderHelp() {
    const query = String($("#helpSearch")?.value || "").trim().toLowerCase();
    const topics = config.help.filter(function (topic) {
      return !query || (topic.title + " " + topic.section + " " + topic.keywords + " " + u.stripHtml(topic.html)).toLowerCase().includes(query);
    });
    $("#helpResultCount").textContent = topics.length + " topic" + (topics.length === 1 ? "" : "s");
    const groups = {};
    topics.forEach(function (topic) { (groups[topic.section] = groups[topic.section] || []).push(topic); });
    $("#helpContent").innerHTML = topics.length ? Object.keys(groups).map(function (section) {
      return '<section class="help-section"><h3>' + u.escapeHtml(section) + '</h3>' + groups[section].map(function (topic) { return '<article id="help-' + topic.id + '"><h4>' + u.escapeHtml(topic.title) + "</h4>" + topic.html + "</article>"; }).join("") + "</section>";
    }).join("") + renderSupportLinks() : emptyState("No help matches", "Try a shorter or broader search.", "Clear help search", "clear-help-search");
  }

  function renderSupportLinks() {
    const links = [config.identity.repository].concat(config.identity.support || []).filter(function (item) { return u.safeUrl(item.url); });
    if (!links.length) return "";
    return '<section class="help-section"><h3>Support links</h3><div class="support-links">' + links.map(function (item) { return '<button type="button" class="safe-link-button" data-open-url="' + u.escapeHtml(u.safeUrl(item.url)) + '">' + u.escapeHtml(item.label) + ' <span aria-hidden="true">↗</span></button>'; }).join("") + "</div></section>";
  }

  function releaseCard(release, index) {
    const section = function (title, values) {
      return values && values.length ? '<div class="release-section"><h5>' + title + "</h5><ul>" + values.map(function (value) { return "<li>" + u.escapeHtml(value) + "</li>"; }).join("") + "</ul></div>" : "";
    };
    return '<details class="release-card"' + (index === 0 ? " open" : "") + '><summary><div class="release-version-line"><span class="version-pill">v' + u.escapeHtml(release.version) + '</span><time datetime="' + u.escapeHtml(release.date) + '">' + u.dateLabel(release.date) + '</time></div><h4>' + u.escapeHtml(release.title) + '</h4></summary><div class="release-card-content"><p>' + u.escapeHtml(release.summary) + '</p><div class="release-sections">' + section("Features", release.features) + section("Improvements", release.improvements) + section("Fixes", release.fixes) + section("Known issues", release.knownIssues) + (release.sections || []).map(function (group) { return section(u.escapeHtml(group.title), group.items); }).join("") + "</div></div></details>";
  }

  function renderReleases() {
    $("#releaseContent").innerHTML = config.releases.map(releaseCard).join("");
  }

  function renderShortcuts() {
    const groups = {};
    SHORTCUTS.forEach(function (shortcut) { (groups[shortcut.group] = groups[shortcut.group] || []).push(shortcut); });
    $("#shortcutContent").innerHTML = '<p class="section-intro">Use a listed key directly or with Shift–Control–Option. Hold the full chord to reveal badges on the controls you can use right now; chord-only keys act on visible Play controls such as Start, Auto, and End. Command-key combinations remain available to the browser.</p>' + Object.keys(groups).map(function (group) {
      return '<section><h3>' + group + "</h3>" + groups[group].map(function (shortcut) {
        const chordKey = '<kbd>⇧⌃⌥ ' + u.escapeHtml(shortcut.chordKey) + "</kbd>";
        const keys = shortcut.plain === false ? chordKey : '<kbd>' + u.escapeHtml(shortcut.keys) + "</kbd>" + (shortcut.chord === false ? "" : '<span class="shortcut-alternative">or</span>' + chordKey);
        return '<div class="shortcut-row"><span class="shortcut-key-pair">' + keys + '</span><span>' + u.escapeHtml(shortcut.label) + "</span></div>";
      }).join("") + "</section>";
    }).join("");
  }

  function renderSupportRoadmap() {
    const moduleState = state().modules.roadmap;
    setInputValue($("#supportRoadmapSearch"), moduleState.search);
    $("#supportRoadmapState").value = moduleState.state;
    $("#supportRoadmapPriority").value = moduleState.priority;
    const targetSelect = $("#supportRoadmapTarget");
    const targetOptions = Array.from(new Set(config.roadmap.map(function (item) { return item.target; }))).sort(function (a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); });
    targetSelect.innerHTML = '<option value="all">All targets</option>' + targetOptions.map(function (target) { return '<option value="' + u.escapeHtml(target) + '">' + u.escapeHtml(target) + "</option>"; }).join("");
    targetSelect.value = moduleState.target;
    $("#supportRoadmapEffort").value = moduleState.effort;
    $("#supportRoadmapSort").value = moduleState.sortBy;
    const items = filteredRoadmap();
    $("#supportRoadmapCount").textContent = items.length + " " + (items.length === 1 ? "item" : "items");
    $("#supportRoadmapList").innerHTML = items.length ? items.map(roadmapCard).join("") : emptyState("No roadmap matches", "Try another search or view.");
  }

  async function renderDeveloper() {
    if (!state().preferences.controls.developerMode) return;
    const usage = await storage.usage();
    const info = sync.getInfo();
    const device = pwa.detectDevice();
    const breakpoint = window.innerWidth < 700 ? "Mobile" : window.innerWidth < 960 ? "Tablet" : "Desktop";
    const recovery = storage.recoveryInfo();
    const diagnostics = [
      ["State model", "v" + state().schemaVersion],
      ["Application", "v" + config.identity.version + " · build " + config.identity.buildId],
      ["Device", device.label],
      ["Layout", breakpoint + " · " + window.innerWidth + "×" + window.innerHeight],
      ["State size", u.formatBytes(usage.stateBytes)],
      ["Browser storage", usage.quota ? u.formatBytes(usage.usage) + " of " + u.formatBytes(usage.quota) : (usage.persistentStorageAvailable ? "Available" : "Unavailable")],
      ["Modules", Object.keys(config.features).filter(function (key) { return config.features[key]; }).join(", ")],
      ["Theme", document.documentElement.dataset.theme],
      ["Sync", info.title + (info.checkedAt ? " · checked " + u.relativeTime(info.checkedAt) : "")],
      ["Recovery", recovery ? u.dateLabel(recovery.createdAt) + " · " + recovery.reason : "None"]
    ];
    diagnostics.splice(2, 0, ["Notes", documentText(state().workspace.documents[0]).length + " characters"], ["Game data", state().workspace.history.length + " saved games · " + state().workspace.people.length + " people · " + Object.keys(state().workspace.library.games).length + " library entries"], ["Session", App.play?.sessionStatus?.() || "No session running"], ["Screen awake", App.sessionAids?.wakeLockStatus?.() || "Unavailable"]);
    $("#developerDiagnostics").innerHTML = diagnostics.map(function (row) { return '<div><dt>' + u.escapeHtml(row[0]) + '</dt><dd>' + u.escapeHtml(row[1]) + "</dd></div>"; }).join("");
    $("#developerState").textContent = JSON.stringify(model.exportEnvelope(state()), null, 2);
    $("#restoreRecoveryButton").disabled = !recovery;
  }

  function renderSupport() {
    $("#developerTab").hidden = !state().preferences.controls.developerMode || !config.features.developerTools;
    switchSupportTab(state().ui.supportTab);
  }

  function clearRoadmapFilters() {
    storage.mutate(function (next) { next.modules.roadmap.search = ""; next.modules.roadmap.state = "all"; next.modules.roadmap.priority = "all"; next.modules.roadmap.target = "all"; next.modules.roadmap.effort = "all"; next.modules.roadmap.sortBy = "priority"; }, { reason: "clear-roadmap-filters" });
    renderSupportRoadmap();
  }

  async function resetPreferences() {
    const accepted = await components.confirm({ title: "Reset preferences?", message: "Appearance, Game Timer settings, filters, and dismissed hints will return to defaults. Your library, history, people, notes, and any running session are kept.", confirmLabel: "Reset preferences", danger: true });
    if (!accepted) return;
    storage.replace(model.resetPreferences(state()), { recoveryReason: "Before resetting preferences", reason: "reset-preferences", touch: false });
    renderAll();
    components.toast("Preferences were reset; your games and notes were kept.", { title: "Preferences reset", kind: "success" });
  }

  async function eraseAllData() {
    const accepted = await components.confirm({ title: "Erase all application data?", message: "This permanently removes game history, the library, people, notes, preferences, the running session, and recovery data from this browser. Export a backup first if anything should be kept.", confirmLabel: "Erase everything", cancelLabel: "Keep my data", danger: true });
    if (!accepted) return;
    storage.clearAll();
    App.play?.clearSession();
    renderAll();
    components.closeDialog("#supportDialog", "erased");
    $("#assertiveStatus").textContent = "All application data was erased.";
    components.toast("All application data was erased from this browser.", { title: "Data erased", kind: "info", duration: 5000 });
  }

  async function forgetSync() {
    const accepted = await components.confirm({ title: "Forget GitHub token on this device?", message: "The stored token and sync history will be removed. The app’s fixed repository target and local notes will stay here.", confirmLabel: "Forget token", danger: true });
    if (!accepted) return;
    await sync.forget();
    markSyncCredentialFieldsClean();
    renderSyncSettings(); renderSyncStatus();
    components.toast("The GitHub token and sync history were removed from this device.", { title: "Sync disconnected", kind: "success" });
  }

  function syncFormValues() {
    const cloud = state().modules.cloudSync;
    return {
      owner: cloud.owner,
      repo: cloud.repo,
      branch: cloud.branch,
      path: cloud.path,
      token: $("#syncToken").value,
      rememberToken: $("#syncRememberToken").checked
    };
  }

  async function saveSyncSettings() {
    try {
      sync.saveConfiguration(syncFormValues());
      markSyncCredentialFieldsClean();
      renderSyncSettings(); renderSyncStatus();
      components.toast("The GitHub connection settings were saved.", { title: "Sync configured", kind: "success" });
      sync.check(true);
    } catch (error) {
      components.message("Settings not saved", error.message || "Check the GitHub settings and try again.", { trigger: $("#saveSyncButton") });
    }
  }

  async function testSyncSettings() {
    try {
      components.setLoading(true, "Testing GitHub…");
      const result = await sync.testConnection(syncFormValues());
      if (result) {
        markSyncCredentialFieldsClean();
        components.message("Connection succeeded", result.message, { trigger: $("#testSyncButton") });
      }
    } catch (error) {
      components.message("Connection failed", error.message || "GitHub could not be reached with these settings.", { trigger: $("#testSyncButton") });
    } finally {
      components.setLoading(false);
      renderSyncSettings(); renderSyncStatus();
    }
  }

  async function restoreRecovery() {
    const info = storage.recoveryInfo();
    if (!info) return;
    const accepted = await components.confirm({ title: "Restore recovery copy?", message: "Restore the copy saved " + u.relativeTime(info.createdAt) + " (“" + info.reason + "”). Current data will be replaced.", confirmLabel: "Restore recovery", danger: true });
    if (!accepted) return;
    storage.restoreRecovery(); renderAll();
    components.toast("The recovery copy was restored.", { title: "Recovery complete", kind: "success" });
  }

  function saveRecoveryCopy() {
    const saved = storage.saveRecovery("Manual recovery copy", state());
    if (saved) {
      renderDeveloper();
      components.toast("A recoverable local copy was saved.", { title: "Recovery copy saved", kind: "success" });
    }
  }

  function toggleDeveloperMode(force, options) {
    if (!config.features.developerTools) return;
    storage.mutate(function (next) { next.preferences.controls.developerMode = typeof force === "boolean" ? force : !next.preferences.controls.developerMode; }, { reason: "developer-mode" });
    $("#developerTab").hidden = !state().preferences.controls.developerMode;
    renderHeader();
    renderActiveView();
    if (state().preferences.controls.developerMode) {
      components.toast("Developer Mode is available in Settings & Help.", { title: "Developer Mode on", kind: "info" });
      if (options && options.openPanel) openSupport("developer");
    } else {
      if (state().ui.supportTab === "developer") switchSupportTab("settings");
      components.toast("Developer tools are hidden.", { title: "Developer Mode off", kind: "info" });
    }
  }

  function toggleThemeFromAppIcon() {
    const nextMode = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    storage.mutate(function (next) { next.preferences.appearance.mode = nextMode; }, { reason: "appearance" });
    applyAppearance();
    if ($("#supportDialog").open && state().ui.supportTab === "settings") renderSettings();
    components.toast(nextMode === "dark" ? "Dark theme is active." : "Light theme is active.", { title: "Theme changed", kind: "info", duration: 2200 });
  }

  function bindAppIconGestures() {
    const button = $("#appIconButton");
    let startX = 0;
    let startY = 0;

    function cancelHold() {
      window.clearTimeout(appIconHoldTimer);
      appIconHoldTimer = 0;
      delete button.dataset.holdActive;
    }

    button.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      cancelHold();
      appIconHoldHandled = false;
      startX = event.clientX;
      startY = event.clientY;
      button.dataset.holdActive = "true";
      appIconHoldTimer = window.setTimeout(function () {
        appIconHoldTimer = 0;
        appIconHoldHandled = true;
        delete button.dataset.holdActive;
        toggleDeveloperMode();
        window.setTimeout(function () { appIconHoldHandled = false; }, 900);
      }, 620);
    });
    button.addEventListener("pointermove", function (event) {
      if (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10) cancelHold();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) { button.addEventListener(name, cancelHold); });
    button.addEventListener("click", function (event) {
      if (appIconHoldHandled) {
        event.preventDefault();
        appIconHoldHandled = false;
        return;
      }
      toggleThemeFromAppIcon();
    });
  }

  function handleAction(action, trigger) {
    if (action === "clear-roadmap-filters") clearRoadmapFilters();
    else if (action === "clear-help-search") { $("#helpSearch").value = ""; renderHelp(); }
  }

  function bindSupportEvents() {
    const dialog = $("#supportDialog");
    dialog.addEventListener("click", function (event) {
      const tab = event.target.closest("[data-support-tab]");
      if (tab) { switchSupportTab(tab.dataset.supportTab); return; }
      const mode = event.target.closest("[data-theme-mode]");
      if (mode) {
        storage.mutate(function (next) { next.preferences.appearance.mode = mode.dataset.themeMode; }, { reason: "appearance" }); applyAppearance(); renderSettings(); return;
      }
      const style = event.target.closest("[data-button-style]");
      if (style) { storage.mutate(function (next) { next.preferences.controls.buttonStyle = style.dataset.buttonStyle; }, { reason: "button-style" }); applyAppearance(); renderSettings(); return; }
    });
    dialog.addEventListener("keydown", function (event) {
      const tab = event.target.closest("[role='tab']");
      if (!tab || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$('[data-support-tab]:not([hidden])');
      const index = tabs.indexOf(tab);
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const target = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (forward ? 1 : -1) + tabs.length) % tabs.length];
      target.focus(); switchSupportTab(target.dataset.supportTab);
    });
    $$('[data-game-pref]').forEach(function (button) {
      button.addEventListener("click", function () {
        const raw = button.dataset.value;
        setGamePreference(button.dataset.gamePref, raw === "true" ? true : raw === "false" ? false : raw);
        if (button.dataset.gamePref === "chime" && raw === "true") App.sessionAids?.preview("turn");
        if (button.dataset.gamePref === "haptics" && raw === "true") App.sessionAids?.preview("haptic");
      });
    });
    $("#longTurnSeconds").addEventListener("change", function () {
      if (!this.reportValidity()) return;
      const minutes = Number(this.value);
      setGamePreference("longTurnSeconds", Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0);
    });
    $("#previewChimeButton").addEventListener("click", function () { App.sessionAids?.preview("warning"); });
    $("#textSizeSlider").addEventListener("input", function (event) { storage.mutate(function (next) { next.preferences.appearance.textScale = Number(event.target.value) / 100; }, { reason: "appearance" }); applyAppearance(); renderTextSizeControl(); });
    $$('[data-hints-enabled]').forEach(function (button) {
      button.addEventListener("click", function () { storage.mutate(function (next) { next.preferences.hints.enabled = button.dataset.hintsEnabled === "true"; }, { reason: "hints" }); renderHeader(); renderSettings(); });
    });
    $$('[data-whats-new-enabled]').forEach(function (button) {
      button.addEventListener("click", function () {
        storage.mutate(function (next) { next.preferences.controls.showWhatsNew = button.dataset.whatsNewEnabled === "true"; }, { reason: "banner-preference" });
        storage.saveNow();
        renderHeader(); renderSettings();
      });
    });
    $("#whatsNewDismissSeconds").addEventListener("change", function () {
      if (!this.reportValidity()) return;
      const seconds = Number(this.value);
      storage.mutate(function (next) { next.preferences.controls.whatsNewDismissSeconds = seconds; }, { reason: "banner-duration" });
      storage.saveNow();
      stopWhatsNewTimer();
      renderHeader();
    });
    $("#restoreHintsButton").addEventListener("click", function () { storage.mutate(function (next) { next.preferences.hints.dismissed = []; next.ui.dismissedHints = []; }, { reason: "hints" }); renderHeader(); renderSettings(); components.toast("All contextual hints are available again.", { title: "Hints restored", kind: "success" }); });
    $("#saveSyncButton").addEventListener("click", saveSyncSettings);
    $("#testSyncButton").addEventListener("click", testSyncSettings);
    $("#forgetSyncButton").addEventListener("click", forgetSync);
    $("#syncNowButton").addEventListener("click", function (event) { sync.syncNow(event.currentTarget); });
    $("#restoreCloudButton").addEventListener("click", function (event) { sync.restoreFromCloud(event.currentTarget); });
    $("#syncToken").addEventListener("input", function (event) { event.currentTarget.dataset.dirty = "true"; });
    $("#autoSyncEnabled").addEventListener("change", function (event) {
      storage.mutate(function (next) { next.modules.cloudSync.autoSync = event.target.checked; }, { reason: "sync-auto", touch: false });
    });
    $("#syncRememberToken").addEventListener("change", function (event) { event.currentTarget.dataset.dirty = "true"; });
    $("#exportButton").addEventListener("click", portability.exportJson);
    $("#importButton").addEventListener("click", function () { $("#importFileInput").click(); });
    $("#resetPreferencesButton").addEventListener("click", resetPreferences);
    $("#eraseAllButton").addEventListener("click", eraseAllData);
    $("#helpSearch").addEventListener("input", renderHelp);
    $("#supportRoadmapSearch").addEventListener("input", function (event) {
      storage.mutate(function (next) { next.modules.roadmap.search = u.cleanLine(event.target.value, 200); }, { reason: "roadmap-filter" });
      renderSupportRoadmap();
    });
    $("#supportRoadmapState").addEventListener("change", function (event) {
      storage.mutate(function (next) { next.modules.roadmap.state = event.target.value; }, { reason: "roadmap-filter" });
      renderSupportRoadmap();
    });
    $("#supportRoadmapPriority").addEventListener("change", function (event) {
      storage.mutate(function (next) { next.modules.roadmap.priority = event.target.value; }, { reason: "roadmap-filter" });
      renderSupportRoadmap();
    });
    $("#supportRoadmapTarget").addEventListener("change", function (event) {
      storage.mutate(function (next) { next.modules.roadmap.target = event.target.value; }, { reason: "roadmap-filter" });
      renderSupportRoadmap();
    });
    $("#supportRoadmapEffort").addEventListener("change", function (event) {
      storage.mutate(function (next) { next.modules.roadmap.effort = event.target.value; }, { reason: "roadmap-filter" });
      renderSupportRoadmap();
    });
    $("#supportRoadmapSort").addEventListener("change", function (event) {
      storage.mutate(function (next) { next.modules.roadmap.sortBy = event.target.value; }, { reason: "roadmap-sort" });
      renderSupportRoadmap();
    });
    $("#resetSupportRoadmapFilters").addEventListener("click", clearRoadmapFilters);
    $("#restoreRecoveryButton").addEventListener("click", restoreRecovery);
    $("#saveRecoveryButton").addEventListener("click", saveRecoveryCopy);
    $("#developerSimulateGame").addEventListener("click", function () {
      components.closeDialog("#supportDialog", "simulate");
      switchView("play");
      App.play?.simulateForTesting();
    });
    $("#developerSampleHistory").addEventListener("click", function () {
      const added = App.library?.addSampleHistory(6) || 0;
      renderViewTabs(); renderActiveView(); renderDeveloper();
      components.toast(added + " simulated games were added to History.", { title: "Sample history added", kind: "success" });
    });
    $("#disableDeveloperButton").addEventListener("click", function () { toggleDeveloperMode(false); });
  }

  function shortcutChordHeld(event) {
    return Boolean(event.shiftKey && event.ctrlKey && event.altKey && !event.metaKey);
  }

  function shortcutModifiersAllowed(event) {
    return shortcutChordHeld(event) || (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey);
  }

  function refreshShortcutEligibility(active) {
    const openDialogs = $$("dialog[open]");
    const activeDialog = openDialogs[openDialogs.length - 1] || null;
    $$('[data-shortcut]').forEach(function (control) {
      const ownerDialog = control.closest("dialog");
      const available = !control.disabled && control.getAttribute("aria-disabled") !== "true" && control.getClientRects().length > 0;
      const inActiveScope = activeDialog ? ownerDialog === activeDialog : !ownerDialog;
      control.classList.toggle("shortcut-eligible", Boolean(active && available && inActiveScope));
    });
  }

  function decorateShortcutControls(root) {
    const controls = root && root.matches?.("[data-shortcut]") ? [root] : $$('[data-shortcut]', root || document);
    controls.forEach(function (control) {
      const keys = [control.dataset.shortcut, control.dataset.shortcutSecondary].filter(Boolean);
      const key = keys[0];
      const definition = SHORTCUTS.find(function (item) { return item.hintKey === key; });
      const currentTitle = String(control.getAttribute("title") || "");
      const undecoratedTitle = / · Shortcuts?:/.test(currentTitle) ? "" : currentTitle;
      const baseTitle = undecoratedTitle || control.getAttribute("aria-label") || definition?.label || control.textContent.trim();
      const commands = keys.map(function (commandKey) {
        const command = SHORTCUTS.find(function (item) { return item.hintKey === commandKey || item.secondaryHintKey === commandKey; });
        const chordKey = commandKey === command?.secondaryHintKey ? commandKey : command?.chordKey || commandKey;
        return commandKey + " or Shift + Control + Option + " + chordKey;
      });
      control.title = control.dataset.shortcutTitle || baseTitle + " · Shortcut" + (commands.length > 1 ? "s: " : ": ") + commands.join("; ");
    });
  }

  function updateShortcutHints(event, forceOff) {
    const active = !forceOff && state().preferences.controls.shortcutHints && shortcutChordHeld(event);
    hintModifierActive = active;
    document.documentElement.classList.toggle("shortcut-hints-visible", active);
    refreshShortcutEligibility(active);
  }

  function runShortcut(event, action) {
    event.preventDefault();
    action();
    requestAnimationFrame(function () {
      decorateShortcutControls();
      refreshShortcutEligibility(hintModifierActive);
    });
  }

  function chordTarget(event) {
    const key = event.key === " " ? "Space" : (event.key || "").length === 1 ? event.key.toUpperCase() : event.key;
    const code = event.code || "";
    const fromCode = code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : code === "Comma" ? "," : code === "Slash" ? "/" : "";
    const openDialogs = $$("dialog[open]");
    const scope = openDialogs[openDialogs.length - 1] || document;
    return $$('[data-shortcut]', scope).find(function (control) {
      if (scope === document && control.closest("dialog")) return false;
      const shortcut = String(control.dataset.shortcut || "").toUpperCase();
      return (shortcut === fromCode || shortcut === key) && !control.disabled && control.getAttribute("aria-disabled") !== "true" && control.getClientRects().length > 0;
    }) || null;
  }

  function focusLibrarySearch() {
    storage.mutate(function (next) { next.modules.library.tab = "games"; }, { reason: "library-tab", touch: false });
    switchView("library");
    const input = $("[data-library-search]");
    input?.focus();
    input?.select();
  }

  function handleGlobalKeydown(event) {
    updateShortcutHints(event, false);
    if (event.key === "Escape") {
      $("#globalSearchResults").hidden = true;
      return;
    }
    if (event.isComposing || event.defaultPrevented) return;
    if (event.target === $("#globalSearch") && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      runShortcut(event, focusGlobalSearch);
      return;
    }
    if (!event.repeat && !event.metaKey && shortcutChordHeld(event) && !["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
      const target = chordTarget(event);
      if (target) { runShortcut(event, function () { target.click(); }); return; }
    }
    if (u.isEditableTarget(event.target)) return;
    if (event.metaKey) return;
    if (event.code === "Slash") {
      if (!shortcutChordHeld(event) && event.shiftKey) runShortcut(event, function () { openSupport("help", event.target); });
      else runShortcut(event, focusGlobalSearch);
      return;
    }
    if (event.repeat) return;
    const mainActive = !$("dialog[open]");
    const plain = !event.shiftKey && !event.ctrlKey && !event.altKey;
    if (mainActive && App.play?.handleKey && currentView() === "play" && App.play.handleKey(event)) return;
    if ((event.code === "Backslash" && event.shiftKey) || event.key === "|") runShortcut(event, function () { toggleDeveloperMode(undefined, { openPanel: true }); });
    else if (!shortcutModifiersAllowed(event)) return;
    else if (event.code === "Digit1" && mainActive) runShortcut(event, function () { switchView("play", { focus: plain }); });
    else if (event.code === "Digit2" && mainActive) runShortcut(event, function () { switchView("library", { focus: plain }); });
    else if (event.code === "Digit3" && mainActive) runShortcut(event, function () { switchView("history", { focus: plain }); });
    else if (mainActive && event.code === "Period") runShortcut(event, focusLibrarySearch);
    else if (mainActive && plain && event.code === "KeyP") runShortcut(event, function () { switchView("play", { focus: true }); });
    else if (mainActive && plain && event.code === "KeyL") runShortcut(event, function () { switchView("library", { focus: true }); });
    else if (mainActive && plain && event.code === "KeyH") runShortcut(event, function () { switchView("history", { focus: true }); });
    else if (mainActive && plain && currentView() === "library" && event.code === "KeyG") runShortcut(event, function () { $("[data-library-tab='games']")?.click(); });
    else if (mainActive && plain && currentView() === "library" && event.code === "KeyE") runShortcut(event, function () { $("[data-library-tab='people']")?.click(); });
    else if (event.code === "Comma") runShortcut(event, function () { openSupport("settings", event.target); });
    else if (event.code === "KeyN") runShortcut(event, function () { openNotes(event.target); });
    else if (event.code === "KeyV") runShortcut(event, function () { openSupport("releases", event.target); });
    else if (event.code === "KeyX" && mainActive && !$("#whatsNewBanner").hidden) runShortcut(event, dismissWhatsNew);
    else if (event.code === "KeyT") runShortcut(event, toggleThemeFromAppIcon);
    else if (event.code === "KeyD") runShortcut(event, function () { toggleDeveloperMode(undefined, { openPanel: true }); });
  }

  function bindGeneralEvents() {
    $$('[data-close-dialog]').forEach(function (button) {
      if (!button.dataset.shortcut) button.dataset.shortcut = "Esc";
      if (!button.hasAttribute("aria-keyshortcuts")) button.setAttribute("aria-keyshortcuts", "Escape Control+Alt+Shift+Escape");
    });
    decorateShortcutControls();
    bindAppIconGestures();
    $("#versionButton").addEventListener("click", function (event) { openSupport("releases", event.currentTarget); });
    $("#supportButton").addEventListener("click", function (event) { openSupport(state().ui.supportTab, event.currentTarget); });
    $("#notesButton").addEventListener("click", function (event) { openNotes(event.currentTarget); });
    $("#notesTextarea").addEventListener("input", function (event) { saveNotes(event.target.value); });
    $("#floatingStatusButton").addEventListener("click", function (event) {
      sync.syncNow(event.currentTarget);
    });
    $(".view-tabs").addEventListener("click", function (event) {
      const tab = event.target.closest("[data-view-tab]");
      if (tab) switchView(tab.dataset.viewTab);
    });
    $(".view-tabs").addEventListener("keydown", function (event) {
      const tab = event.target.closest("[data-view-tab]");
      if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$("[data-view-tab]");
      const index = tabs.indexOf(tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      switchView(tabs[next].dataset.viewTab, { focus: true });
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".global-search-wrap")) {
        $("#globalSearchResults").hidden = true;
        if (document.activeElement === $("#globalSearch")) $("#globalSearch").blur();
      }
      const action = event.target.closest("[data-action]");
      if (action) handleAction(action.dataset.action, action);
      const dismissHint = event.target.closest("[data-dismiss-hint]");
      if (dismissHint) { storage.mutate(function (next) { next.preferences.hints.dismissed = Array.from(new Set(next.preferences.hints.dismissed.concat(dismissHint.dataset.dismissHint))); }, { reason: "dismiss-hint" }); renderHeader(); }
      if (event.target.closest("[data-dismiss-release]")) dismissWhatsNew();
      if (event.target.closest("[data-open-releases]")) openSupport("releases", event.target.closest("[data-open-releases]"));
      const safeLink = event.target.closest("[data-open-url]");
      if (safeLink && !u.safeExternalOpen(safeLink.dataset.openUrl)) components.toast("That external address is not allowed.", { title: "Link unavailable", kind: "warning" });
    });
    $("#globalSearch").addEventListener("input", function (event) {
      storage.mutate(function (next) { next.ui.search = u.cleanLine(event.target.value, 200); }, { reason: "global-search", touch: false });
      renderGlobalSearchResults();
    });
    $("#globalSearch").addEventListener("focus", renderGlobalSearchResults);
    $("#globalSearch").addEventListener("keydown", function (event) {
      if (event.isComposing) return;
      const results = $$("button[role='option']", $("#globalSearchResults"));
      if (event.key === "Enter") { event.preventDefault(); submitGlobalSearch(); }
      else if (event.key === "ArrowDown" && results.length) { event.preventDefault(); results[0].focus(); }
      else if (event.key === "Escape") { $("#globalSearchResults").hidden = true; event.target.select(); }
    });
    $("#globalSearchResults").addEventListener("click", function (event) { const result = event.target.closest("[data-search-type]"); if (result) activateGlobalSearchResult(result.dataset.searchType, result.dataset.searchId); });
    $("#globalSearchResults").addEventListener("keydown", function (event) {
      const button = event.target.closest("[data-search-type]"); if (!button) return;
      const buttons = $$("[data-search-type]", event.currentTarget); const index = buttons.indexOf(button);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
      else if (event.key === "Escape") { event.preventDefault(); $("#globalSearch").focus(); $("#globalSearchResults").hidden = true; }
    });
    document.addEventListener("focusin", function (event) { if (!event.target.closest(".global-search-wrap")) $("#globalSearchResults").hidden = true; });
    window.addEventListener("app:viewrendered", afterViewRender);
    window.addEventListener("app:gamechange", function () { renderViewTabs(); });
    window.addEventListener("app:switchview", function (event) { switchView(event.detail.view); });
    bindSupportEvents();
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("keyup", function (event) { updateShortcutHints(event, false); });
    window.addEventListener("blur", function () { updateShortcutHints({ altKey: false, shiftKey: false, ctrlKey: false }, true); });
    new MutationObserver(function () { if (hintModifierActive) refreshShortcutEligibility(true); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open", "hidden", "disabled", "aria-disabled"] });
  }

  function renderAll() {
    applyAppearance();
    renderHeader();
    renderNotesEditor();
    renderViewTabs();
    renderActiveView();
    renderGlobalSearchResults();
    if ($("#supportDialog").open) renderSupport();
    decorateShortcutControls();
    refreshShortcutEligibility(hintModifierActive);
  }

  function bindRuntimeEvents() {
    window.addEventListener("app:shortcutcontrols", function () {
      decorateShortcutControls($("#appToast"));
      refreshShortcutEligibility(hintModifierActive);
    });
    window.addEventListener("app:syncchange", function () {
      renderSyncStatus();
      if ($("#supportDialog").open && state().ui.supportTab === "dataSync") renderSyncSettings();
      if ($("#supportDialog").open && state().ui.supportTab === "developer") renderDeveloper();
    });
    window.addEventListener("app:opensyncsettings", function (event) {
      openSupport("dataSync", event.detail && event.detail.trigger);
      requestAnimationFrame(function () { $("#storageSyncSettings").scrollIntoView({ block: "start" }); $("#syncToken").focus(); });
    });
    window.addEventListener("app:storageerror", function (event) {
      components.toast(event.detail.message, { title: event.detail.title, kind: "danger", duration: 0, actionLabel: "Export", onAction: portability.exportJson });
      renderSyncStatus();
    });
    window.addEventListener("app:statesaved", function () {
      renderSyncStatus();
      if ($("#supportDialog").open && state().ui.supportTab === "dataSync") renderSyncSettings();
    });
    window.addEventListener("app:networkchange", function () { document.documentElement.classList.toggle("offline", navigator.onLine === false); renderSyncStatus(); });
    window.addEventListener("app:pwaerror", function (event) { components.toast(event.detail.message, { title: "Offline support unavailable", kind: "warning", duration: 5000 }); });
    window.addEventListener("app:statechange", function (event) {
      const reasons = new Set(["import", "sync-download", "sync-merge", "recovery", "erase-all", "reset-preferences", "restore-demo", "legacy-import"]);
      if (reasons.has(event.detail.reason)) renderAll();
      else if ($("#supportDialog").open && state().ui.supportTab === "dataSync") renderSyncPayload();
    });
    window.addEventListener("resize", function () { if ($("#developerPanel") && !$("#developerPanel").hidden) renderDeveloper(); });
    ["(prefers-color-scheme: dark)", "(prefers-reduced-motion: reduce)"].forEach(function (query) {
      const media = window.matchMedia(query);
      if (typeof media.addEventListener === "function") media.addEventListener("change", applyAppearance);
      else if (typeof media.addListener === "function") media.addListener(applyAppearance);
    });
  }

  function showLoadReport() {
    const report = storage.getLoadReport();
    if (report.recovered) {
      components.toast("The saved state was unusable, so the last valid recovery copy was loaded.", { title: "Recovery copy restored", kind: "warning", duration: 6000 });
    } else if (report.error && report.source === "default") {
      components.toast("Saved data could not be read. A fresh default workspace was created without overwriting any imported file.", { title: "Fresh workspace loaded", kind: "warning", duration: 6000 });
    } else if (report.migrations.length) {
      components.toast("Saved data was upgraded through " + report.migrations.join(", ") + ".", { title: "State upgraded", kind: "success" });
    }
  }

  function init() {
    storage.load();
    applyIdentity();
    components.init();
    portability.init();
    App.play?.init();
    App.library?.init();
    App.vibeCheck?.init();
    App.sessionAids?.init();
    bindGeneralEvents();
    bindRuntimeEvents();
    pwa.init();
    sync.init();
    const header = $(".app-header");
    const syncHeaderHeight = function () { document.documentElement.style.setProperty("--app-header-height", Math.ceil(header.getBoundingClientRect().height) + "px"); };
    if (typeof ResizeObserver === "function") new ResizeObserver(syncHeaderHeight).observe(header);
    syncHeaderHeight();
    const hashView = (location.hash || "").replace("#", "");
    if (VIEWS.includes(hashView) && hashView !== state().ui.view) storage.mutate(function (next) { next.ui.view = hashView; }, { reason: "view", touch: false });
    renderAll();
    document.documentElement.classList.toggle("offline", navigator.onLine === false);
    requestAnimationFrame(function () { document.documentElement.classList.add("app-ready"); });
    showLoadReport();
  }

  App.application = {
    render: renderAll,
    switchModule: switchModule,
    openSupport: openSupport,
    openNotes: openNotes,
    switchView: switchView,
    renderViewTabs: renderViewTabs,
    renderActiveView: renderActiveView,
    shortcuts: SHORTCUTS
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
