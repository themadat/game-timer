/* Private, device-local table matching. Ballots and the host code never enter storage. */
(function () {
  "use strict";
  const App = window.LocalApp;
  const OPTIONS = ["heavy", "light", "out"];
  const LABELS = { heavy: "Heavy", light: "Light", out: "Sit out" };
  const esc = value => App.utils.escapeHtml(String(value));
  let dialog, body, round = null, draft = null;
  let pinDigits = "", firstPin = "", setupStep = "people", peoplePage = 0;
  const DEFAULT_ATTENDEES = new Set(["adam", "austin", "bryson", "johanna", "tristen", "kathleen", "jake", "kacie"]);

  // Counts form a small dynamic program instead of enumerating all 3^n ballots.
  // Weighted reservoir sampling preserves random ties without retaining every split.
  function solve(ballots, limits, random = Math.random) {
    let states = new Map([["0,0", { h: 0, l: 0, ways: 1, path: null }]]);
    for (const ballot of ballots) {
      const next = new Map();
      for (const previous of states.values()) {
        for (const option of OPTIONS) {
          if (!ballot.includes(option)) continue;
          const h = previous.h + (option === "heavy" ? 1 : 0);
          const l = previous.l + (option === "light" ? 1 : 0);
          if (h > limits.heavy.max || l > limits.light.max) continue;
          const key = h + "," + l;
          const existing = next.get(key);
          const path = { option, previous: previous.path };
          if (!existing) next.set(key, { h, l, ways: previous.ways, path });
          else {
            existing.ways += previous.ways;
            if (random() < previous.ways / existing.ways) existing.path = path;
          }
        }
      }
      states = next;
    }
    let winner = null, best = null, ways = 0;
    for (const state of states.values()) {
      if ((state.h && state.h < Math.max(3, limits.heavy.min)) || (state.l && state.l < Math.max(3, limits.light.min))) continue;
      const score = [state.h + state.l, Number(state.h > 0) + Number(state.l > 0), -Math.abs(state.h - state.l)];
      const comparison = best ? score.findIndex((value, i) => value !== best[i]) : -1;
      const better = !best || (comparison >= 0 && score[comparison] > best[comparison]);
      const equal = best && comparison === -1;
      if (better) { best = score; winner = state; ways = state.ways; }
      else if (equal) {
        ways += state.ways;
        if (random() < state.ways / ways) winner = state;
      }
    }
    if (!winner) return null;
    const assignments = [];
    for (let path = winner.path; path; path = path.previous) assignments.push(path.option);
    return assignments.reverse();
  }

  function filterGames(games, minimum, direction = "minimum") {
    const threshold = Number(minimum) || 0;
    return games.filter(game => game.id !== "custom" && (!threshold || (Number.isFinite(game.complexityWeight) && (direction === "maximum" ? game.complexityWeight <= threshold : game.complexityWeight >= threshold))));
  }

  // Continuous positions, with rejection sampling to keep both targets separated.
  function answerPositions(width, height, buttonWidth, buttonHeight, random = Math.random) {
    const maxX = Math.max(0, width - buttonWidth), maxY = Math.max(0, height - buttonHeight);
    for (let attempt = 0; attempt < 80; attempt++) {
      const points = [0, 1].map(() => ({ x: random() * maxX, y: random() * maxY }));
      if (Math.abs(points[0].x - points[1].x) >= buttonWidth + 16 || Math.abs(points[0].y - points[1].y) >= buttonHeight + 16) return points;
    }
    return [{ x: 0, y: 0 }, { x: maxX, y: maxY }];
  }

  function icon(kind) { return kind === "out" ? "" : App.icons.markup("vibe" + (kind === "heavy" ? "Heavy" : "Light")); }
  function gameName(game) { return App.play.gameAccessibleName(game.name); }
  function focus(selector) { body.querySelector(selector)?.focus({ preventScroll: true }); }
  function show(markup, selector = "[data-vibe-focus]") {
    dialog.dataset.vibeStage = round?.stage || "setup";
    body.innerHTML = markup;
    body.scrollTop = 0;
    focus(selector);
  }
  function error(message) { body.querySelector("[data-vibe-error]").textContent = message; }
  function personStyle(person) {
    const color = App.utils.normalizeColor(person.color, "#94a3b8");
    const channels = color.slice(1).match(/../g).map(hex => {
      const value = parseInt(hex, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    return `--person-color:${color};--person-ink:${luminance > .179 ? '#111111' : '#ffffff'}`;
  }
  function personMarkup(person) { return `<span class="vibe-name" style="${personStyle(person)}">${esc(person.name)}</span>`; }
  function currentPerson() { return `<div class="vibe-current-person">${personMarkup(round.people[round.ballots.length])}</div>`; }
  function tableSummary() {
    return '<div class="vibe-table-summary">' + ["heavy", "light"].map(kind => '<span>' + icon(kind) + '<strong>' + LABELS[kind] + '</strong> · ' + esc(round.tables[kind].name) + '</span>').join("") + '</div>';
  }
  function gameOptions(minimum, selected = "", kind = "heavy") {
    const games = filterGames(App.play.allGames(), minimum, kind === "light" ? "maximum" : "minimum").sort((a, b) => gameName(a).localeCompare(gameName(b)));
    return '<option value="">Game undecided</option>' + games.map(game => `<option value="${esc(game.id)}" ${game.id === selected ? 'selected' : ''}>${esc(gameName(game))}${Number.isFinite(game.complexityWeight) ? ' · ' + game.complexityWeight.toFixed(2) : ' · Weight unknown'}</option>`).join("");
  }

  function defaultAttendees(people) {
    return people.map((person, i) => DEFAULT_ATTENDEES.has(person.name.trim().toLowerCase()) ? i : -1).filter(i => i >= 0);
  }
  function weightStep() { return App.storage.getState().preferences.game.vibeWeightStep; }

  function renderPeople() {
    if (round || !draft || setupStep !== "people") return;
    const people = App.storage.getState().workspace.people;
    const grid = body.querySelector(".vibe-people");
    const columns = Math.max(1, Math.min(6, Math.floor((grid.clientWidth + 8) / 152)));
    const rows = Math.max(1, Math.floor((grid.clientHeight + 8) / 76));
    const capacity = columns * rows;
    const pages = Math.max(1, Math.ceil(people.length / capacity));
    peoplePage = Math.min(peoplePage, pages - 1);
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    grid.innerHTML = people.slice(peoplePage * capacity, (peoplePage + 1) * capacity).map((person, offset) => {
      const i = peoplePage * capacity + offset;
      return `<button type="button" class="vibe-person-chip" data-vibe-person="${i}" aria-pressed="${draft.attendees.includes(i)}" style="${personStyle(person)}"><span class="vibe-person-dot" aria-hidden="true"></span><span>${esc(person.name)}</span></button>`;
    }).join("") || '<p>Add people in Library → People first.</p>';
    body.querySelector("[data-vibe-people-page]").textContent = `Page ${peoplePage + 1} of ${pages}`;
    body.querySelector("[data-vibe='people-prev']").disabled = peoplePage === 0;
    body.querySelector("[data-vibe='people-next']").disabled = peoplePage === pages - 1;
    body.querySelector("[data-vibe-selected]").textContent = `${draft.attendees.length} selected`;
  }

  function setSetupStep(step) {
    if (step === "tables" && draft.attendees.length < 3) { error("Select at least three people."); return; }
    setupStep = step;
    draft.step = step;
    for (const kind of ["people", "tables"]) {
      body.querySelector(`[data-vibe-panel="${kind}"]`).hidden = kind !== step;
      body.querySelector(`[data-vibe-setup="${kind}"]`).setAttribute("aria-pressed", String(kind === step));
    }
    const next = body.querySelector("[data-vibe-continue]");
    next.type = step === "people" ? "button" : "submit";
    next.textContent = step === "people" ? "Next: tables" : "Next: set host PIN";
    next.dataset.vibe = step === "people" ? "setup-tables" : "setup-start";
    error("");
    if (step === "people") renderPeople();
  }

  function setup(saved = null) {
    round = null; pinDigits = ""; firstPin = ""; peoplePage = 0;
    const people = App.storage.getState().workspace.people;
    draft = saved || { attendees: defaultAttendees(people), fixed: false, heavyWeight: "2.5", lightWeight: "0.0", step: "people" };
    show(`<form id="vibeSetup" class="vibe-form vibe-setup" autocomplete="off">
      <nav class="vibe-setup-nav" aria-label="Vibe Check setup"><button type="button" class="button" data-vibe-setup="people">People</button><button type="button" class="button" data-vibe-setup="tables">Tables</button></nav>
      <section class="vibe-setup-panel" data-vibe-panel="people"><h3>Who is here? <span data-vibe-selected></span></h3><div class="vibe-people" aria-label="People present"></div><div class="vibe-people-pager"><button type="button" class="button" data-vibe="people-prev" aria-label="Previous people page">Previous</button><span data-vibe-people-page></span><button type="button" class="button" data-vibe="people-next" aria-label="Next people page">Next</button></div></section>
      <section class="vibe-setup-panel" data-vibe-panel="tables" hidden><div class="vibe-tables">${["heavy", "light"].map(kind => `<fieldset><legend>${icon(kind)} ${LABELS[kind]}</legend><div class="vibe-game-row"><label>Game (optional)<select name="${kind}Game">${gameOptions(draft[kind + 'Weight'], draft[kind + 'Game'], kind)}</select></label><label>Weight ${kind === 'heavy' ? 'at least' : 'at most'}<span class="vibe-weight-control"><button type="button" data-vibe-weight="${kind}" data-delta="-1" aria-label="Decrease ${kind} weight">−</button><input aria-label="${LABELS[kind]} weight ${kind === 'heavy' ? 'at least' : 'at most'}" name="${kind}Weight" type="number" min="0" max="5" step="any" inputmode="decimal" value="${esc(draft[kind + 'Weight'] || '0.0')}"><button type="button" data-vibe-weight="${kind}" data-delta="1" aria-label="Increase ${kind} weight">+</button></span></label></div><p class="visually-hidden" data-vibe-filter-note="${kind}" aria-live="polite"></p><div class="vibe-limits" data-vibe-limits="${kind}"></div></fieldset>`).join("")}</div></section>
      <p class="vibe-error vibe-setup-error" role="alert" data-vibe-error></p><footer class="vibe-setup-footer"><button type="button" class="button" data-vibe="fixed" aria-pressed="${draft.fixed}" title="Use fixed answer positions for keyboard and accessibility">Fixed answers</button><button class="button primary" type="button" data-vibe-continue>Next: tables</button></footer>
    </form>`, "[data-vibe-setup='people']");
    if (saved) {
      for (const kind of ["heavy", "light"]) {
        gameChanged(body.querySelector(`[name="${kind}Game"]`));
        for (const suffix of ["Min", "Max"]) {
          const input = body.querySelector(`[name="${kind + suffix}"]`);
          if (input && saved[kind + suffix]) input.value = saved[kind + suffix];
        }
      }
    }
    setSetupStep(draft.step || "people");
  }

  function adjustWeight(kind, delta) {
    const input = body.querySelector(`[name="${kind}Weight"]`);
    input.value = (Math.round(Math.max(0, Math.min(5, (Number(input.value) || 0) + delta * weightStep())) * 100) / 100).toFixed(2);
    weightChanged(input);
  }

  function weightChanged(input) {
    if (!input.validity.valid) return;
    const kind = input.name === "heavyWeight" ? "heavy" : "light";
    const select = body.querySelector(`[name="${kind}Game"]`);
    const previous = select.value;
    select.innerHTML = gameOptions(input.value, previous, kind);
    if (select.value !== previous) gameChanged(select);
    const count = select.options.length - 1;
    body.querySelector(`[data-vibe-filter-note="${kind}"]`).textContent = `${count} game${count === 1 ? '' : 's'} available.${previous && select.value !== previous ? ' Previous game cleared by the weight filter.' : ''}`;
  }

  function gameChanged(select) {
    const kind = select.name === "heavyGame" ? "heavy" : "light";
    const game = App.play.gameById(select.value);
    const target = body.querySelector(`[data-vibe-limits="${kind}"]`);
    if (!game) { target.innerHTML = '<p class="panel-note">No game assigned</p>'; return; }
    const minKnown = Number.isInteger(game.minPlayers) && game.minPlayers >= 1;
    const maxKnown = Number.isInteger(game.maxPlayers) && game.maxPlayers >= 1;
    target.innerHTML = `<div class="vibe-player-limits" aria-label="${minKnown && maxKnown ? 'Game player limits' : 'Confirm missing game limits before voting'}"><label>Minimum players<input name="${kind}Min" type="number" min="1" max="${App.config.controls.maxPeople}" step="1" required value="${minKnown ? game.minPlayers : ''}" ${minKnown ? 'readonly' : ''}></label><label>Maximum players<input name="${kind}Max" type="number" min="1" max="${App.config.controls.maxPeople}" step="1" required value="${maxKnown ? game.maxPlayers : ''}" ${maxKnown ? 'readonly' : ''}></label></div>`;
  }

  function begin(form) {
    const people = App.storage.getState().workspace.people;
    const attendees = draft.attendees;
    if (attendees.length < 3) { error("Select at least three people."); return; }
    const tables = {};
    for (const kind of ["heavy", "light"]) {
      const game = App.play.gameById(form.elements[kind + "Game"].value);
      const min = game ? Number(form.elements[kind + "Min"].value) : 3;
      const max = game ? Number(form.elements[kind + "Max"].value) : attendees.length;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) { error("Check the game player limits: maximum must be at least minimum."); return; }
      tables[kind] = { name: game ? gameName(game) : "Game undecided", min, max };
    }
    draft = { attendees, fixed: draft.fixed, step: "tables" };
    for (const kind of ["heavy", "light"]) for (const suffix of ["Game", "Weight", "Min", "Max"]) draft[kind + suffix] = form.elements[kind + suffix]?.value || "";
    round = { people: attendees.map(i => ({ name: people[i].name, color: people[i].color })), tables, passcode: "", fixed: draft.fixed, ballots: [], ballot: [], question: 0, stage: "pin-create", result: null, failures: 0, retryAt: 0 };
    firstPin = "";
    pinScreen("pin-create");
  }

  // Button-only entry: no password/text/hidden input, credential field or native keyboard.
  function pinScreen(stage, message = "") {
    round.stage = stage; pinDigits = "";
    const heading = stage === "pin-create" ? "Choose host PIN" : stage === "pin-confirm" ? "Confirm host PIN" : "Return to the host";
    const description = stage === "pin-create" ? "Choose four digits to unlock the results." : stage === "pin-confirm" ? "Enter the same four digits again. Voting begins after confirmation." : "Enter your four-digit host PIN to reveal table assignments.";
    show(`<section class="vibe-pin-page" data-vibe-pin tabindex="0" aria-label="${heading}. Use the number pad or type four digits."><h3>${heading}</h3><p>${description}</p><div class="vibe-pin-dots" data-vibe-dots aria-hidden="true">○ ○ ○ ○</div><span class="visually-hidden" data-vibe-pin-status role="status">0 of 4 digits entered</span><div class="vibe-keypad">${[1,2,3,4,5,6,7,8,9].map(digit => `<button class="button" type="button" data-vibe-digit="${digit}" aria-label="Digit ${digit}">${digit}</button>`).join('')}<button class="button" type="button" data-vibe="pin-clear">Clear</button><button class="button" type="button" data-vibe-digit="0" aria-label="Digit 0">0</button><button class="button" type="button" data-vibe="pin-delete" aria-label="Delete last digit">⌫</button></div><p class="vibe-error" role="alert" data-vibe-error>${esc(message)}</p>${stage !== "locked" ? `<div class="vibe-actions"><button class="button" type="button" data-vibe="pin-back">Back to setup</button>${stage === 'pin-confirm' ? '<button class="button" type="button" data-vibe="pin-change">Choose a different PIN</button>' : ''}</div>` : ''}</section>`, "[data-vibe-pin]");
  }

  function updatePin() {
    body.querySelector("[data-vibe-dots]").textContent = Array.from({ length: 4 }, (_, i) => i < pinDigits.length ? "●" : "○").join(" ");
    body.querySelector("[data-vibe-pin-status]").textContent = pinDigits.length + " of 4 digits entered";
  }
  function enterDigit(digit) {
    if (!round || !["pin-create", "pin-confirm", "locked"].includes(round.stage)) return;
    if (round.stage === "locked" && Date.now() < round.retryAt) { error("Wait a few seconds before trying again."); return; }
    pinDigits += digit; updatePin();
    if (pinDigits.length < 4) return;
    const code = pinDigits; pinDigits = "";
    if (round.stage === "pin-create") { firstPin = code; pinScreen("pin-confirm"); }
    else if (round.stage === "pin-confirm") {
      if (code !== firstPin) { pinScreen("pin-confirm", "PINs do not match. Enter your chosen PIN again."); return; }
      round.passcode = code; firstPin = ""; draft = null; handoff();
    } else unlock(code);
  }

  function handoff(message = "") {
    round.stage = "handoff"; round.ballot = []; round.question = 0;
    show(`<div class="vibe-private vibe-handoff"><h3 data-vibe-focus tabindex="-1">Pass to ${esc(round.people[round.ballots.length].name)}</h3>${currentPerson()}<p>${round.ballots.length + 1} of ${round.people.length} · Hold the screen privately.</p>${message ? `<p>${esc(message)}</p>` : ''}${tableSummary()}<p>Choose every option you genuinely accept. You can accept either table, sitting out, or any combination.</p><button class="button primary" type="button" data-vibe="ready">I’m ready</button></div>`);
  }

  function placeAnswers() {
    if (round?.stage !== "question" || round.fixed) return;
    const canvas = body.querySelector(".vibe-targets");
    const buttons = Array.from(canvas.querySelectorAll("[data-vibe-answer]"));
    const points = answerPositions(canvas.clientWidth, canvas.clientHeight, buttons[0].offsetWidth, buttons[0].offsetHeight);
    buttons.forEach((button, i) => { button.style.left = points[i].x + "px"; button.style.top = points[i].y + "px"; });
  }
  function question() {
    round.stage = "question";
    const kind = OPTIONS[round.question];
    show(`<div class="vibe-private vibe-question">${currentPerson()}<p>Question ${round.question + 1} of 3</p><h3 data-vibe-focus tabindex="-1">${icon(kind)} ${kind === "out" ? "Would you be happy sitting out?" : "Would you enjoy the " + LABELS[kind] + " table?"}</h3><p>${kind === "out" ? "Choose Yes only if sitting out is an acceptable outcome for you." : esc(round.tables[kind].name)}</p><div class="vibe-targets ${round.fixed ? 'vibe-fixed' : ''}">${[true, false].map(answer => `<button class="button vibe-answer-${answer ? 'yes' : 'no'}" type="button" data-vibe-answer="${answer}">${answer ? 'Yes, happy to' : 'No, thanks'}</button>`).join("")}</div><p class="panel-note">Each answer stays private. Select all acceptable options across the three questions.</p></div>`);
    placeAnswers();
  }

  function submitScreen() {
    round.stage = "submit";
    show(`<div class="vibe-private vibe-handoff">${currentPerson()}<h3 data-vibe-focus tabindex="-1">Ready to submit</h3><p>Your choices will be hidden before you pass the device.</p><div class="vibe-actions"><button class="button primary" type="button" data-vibe="submit">Submit privately</button><button class="button" type="button" data-vibe="redo">Answer again</button></div></div>`);
  }

  function gate() { pinScreen("locked"); }
  function unlock(code) {
    if (Date.now() < round.retryAt) { pinScreen("locked", "Wait a few seconds before trying again."); return; }
    if (code !== round.passcode) {
      round.failures++;
      if (round.failures % 5 === 0) round.retryAt = Date.now() + 15000;
      pinScreen("locked", round.failures % 5 === 0 ? "Incorrect PIN. Wait 15 seconds before trying again." : "Incorrect PIN.");
      return;
    }
    if (!round.result) {
      round.result = { assignments: solve(round.ballots, round.tables) };
      round.ballots = [];
    }
    reveal();
  }

  function reveal() {
    round.stage = "revealed";
    const assignments = round.result.assignments;
    show(`<div class="vibe-result-page"><h3 data-vibe-focus tabindex="-1">${assignments ? 'Tonight’s tables' : 'No valid arrangement'}</h3>${assignments ? `<div class="vibe-results">${OPTIONS.map(kind => {
      const members = round.people.filter((person, i) => assignments[i] === kind);
      return `<section class="vibe-result-${kind}"><h4>${icon(kind)} ${kind === "out" ? 'Out' : LABELS[kind]} <span>${members.length}</span></h4>${kind !== "out" ? `<p>${esc(round.tables[kind].name)}</p>` : '<p>Sitting out</p>'}<ul>${members.map(person => `<li>${personMarkup(person)}</li>`).join('')}</ul>${!members.length ? '<p class="vibe-empty">Nobody here</p>' : ''}</section>`;
    }).join('')}</div>` : '<p>No split respects everyone’s choices and the game player limits while keeping at least three people at each active table. Start a fresh round with different games or attendees; no one has been assigned against their choices.</p>'}<p class="panel-note">Every assignment respects accepted choices. Ballots have been cleared; assignments may imply a preference.</p><div class="vibe-actions"><button class="button" type="button" data-vibe="lock">Lock results</button><button class="button" type="button" data-vibe="new">New round</button><button class="button primary" type="button" data-close-dialog="vibeCheckDialog">End and clear</button></div></div>`);
    fitResults();
  }

  function fitResults() {
    if (round?.stage !== "revealed") return;
    body.querySelectorAll(".vibe-results section").forEach(section => {
      const list = section.querySelector("ul");
      const names = Array.from(list.querySelectorAll(".vibe-name"));
      if (!names.length) return;
      names.forEach(name => { name.style.fontSize = ""; });
      list.style.gap = "";
      const desired = parseFloat(getComputedStyle(names[0]).fontSize);
      let gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      if (names.length * desired * 1.95 + gap * (names.length - 1) > list.clientHeight) gap = Math.min(gap, 4);
      list.style.gap = gap + "px";
      const row = Math.max(14, Math.min(desired * 1.95, (list.clientHeight - gap * (names.length - 1)) / names.length));
      list.style.gridAutoRows = row + "px";
      names.forEach(name => {
        let size = desired;
        name.style.fontSize = size + "px";
        while (size > 10 && (name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1)) {
          size -= 1; name.style.fontSize = size + "px";
        }
      });
    });
  }

  function init() {
    dialog = document.querySelector("#vibeCheckDialog");
    body = document.querySelector("#vibeCheckBody");
    document.querySelector("#vibeCheckButton").addEventListener("click", event => {
      setup();
      App.components.openDialog(dialog, { trigger: event.currentTarget, focus: "#vibeCheckTitle" });
      requestAnimationFrame(renderPeople);
    });
    dialog.addEventListener("close", () => { round = null; draft = null; pinDigits = ""; firstPin = ""; body.innerHTML = ""; delete dialog.dataset.vibeStage; });
    body.addEventListener("input", event => {
      if (event.target.matches("[name='heavyWeight'], [name='lightWeight']")) weightChanged(event.target);
    });
    body.addEventListener("change", event => {
      if (event.target.matches("select[name='heavyGame'], select[name='lightGame']")) gameChanged(event.target);
    });
    body.addEventListener("submit", event => {
      event.preventDefault();
      if (event.target.id === "vibeSetup" && !round) {
        if (setupStep === "people") setSetupStep("tables"); else begin(event.target);
      }
    });
    body.addEventListener("keydown", event => {
      if (!round && ["ArrowUp", "ArrowDown"].includes(event.key) && event.target.matches("[name='heavyWeight'], [name='lightWeight']")) {
        event.preventDefault();
        adjustWeight(event.target.name === "heavyWeight" ? "heavy" : "light", event.key === "ArrowUp" ? 1 : -1);
        return;
      }
      if (!round || !["pin-create", "pin-confirm", "locked"].includes(round.stage)) return;
      if (/^[0-9]$/.test(event.key) || ["Backspace", "Delete"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.repeat) return;
        if (/^[0-9]$/.test(event.key)) enterDigit(event.key);
        else { pinDigits = event.key === "Delete" ? "" : pinDigits.slice(0, -1); updatePin(); }
      }
    });
    body.addEventListener("click", event => {
      if (!round && draft) {
        const person = event.target.closest("[data-vibe-person]");
        const step = event.target.closest("[data-vibe-setup]")?.dataset.vibeSetup;
        const weight = event.target.closest("[data-vibe-weight]");
        const setupAction = event.target.closest("[data-vibe]")?.dataset.vibe;
        if (person) {
          const index = Number(person.dataset.vibePerson);
          draft.attendees = draft.attendees.includes(index) ? draft.attendees.filter(i => i !== index) : draft.attendees.concat(index);
          person.setAttribute("aria-pressed", String(draft.attendees.includes(index)));
          body.querySelector("[data-vibe-selected]").textContent = `${draft.attendees.length} selected`;
          return;
        }
        if (step) { setSetupStep(step); return; }
        if (weight) {
          adjustWeight(weight.dataset.vibeWeight, Number(weight.dataset.delta)); return;
        }
        if (setupAction === "fixed") { draft.fixed = !draft.fixed; event.target.closest("[data-vibe]").setAttribute("aria-pressed", String(draft.fixed)); return; }
        if (setupAction === "setup-tables") { setSetupStep("tables"); return; }
        if (setupAction === "people-prev" || setupAction === "people-next") { peoplePage += setupAction === "people-next" ? 1 : -1; renderPeople(); return; }
      }
      const digit = event.target.closest("[data-vibe-digit]")?.dataset.vibeDigit;
      if (digit !== undefined) { enterDigit(digit); return; }
      const answer = event.target.closest("[data-vibe-answer]");
      if (answer && round?.stage === "question") {
        if (event.detail > 1) return;
        if (answer.dataset.vibeAnswer === "true") round.ballot.push(OPTIONS[round.question]);
        round.question++;
        if (round.question < 3) question(); else submitScreen();
        return;
      }
      const action = event.target.closest("[data-vibe]")?.dataset.vibe;
      if (!round) return;
      if (["pin-create", "pin-confirm", "locked"].includes(round.stage)) {
        if (action === "pin-clear" || action === "pin-delete") { pinDigits = action === "pin-clear" ? "" : pinDigits.slice(0, -1); updatePin(); }
        else if (action === "pin-change" && round.stage === "pin-confirm") { firstPin = ""; pinScreen("pin-create"); }
        else if (action === "pin-back" && round.stage !== "locked") setup(draft);
        return;
      }
      if (action === "ready" && round.stage === "handoff") question();
      else if (action === "redo" && round.stage === "submit") { round.ballot = []; round.question = 0; question(); }
      else if (action === "submit" && round.stage === "submit") {
        if (!round.ballot.length) { handoff("Choose at least one acceptable option. Please answer again."); return; }
        round.ballots.push(round.ballot); round.ballot = [];
        if (round.ballots.length === round.people.length) gate(); else handoff();
      } else if (action === "lock" && round.stage === "revealed") gate();
      else if (action === "new" && round.stage === "revealed") setup();
    });
    window.addEventListener("resize", () => { if (!round) renderPeople(); else if (round.stage === "revealed") fitResults(); else placeAnswers(); });
    document.addEventListener("visibilitychange", () => {
      if (!round || !document.hidden) return;
      if (["revealed", "locked"].includes(round.stage)) gate();
      else if (["pin-create", "pin-confirm"].includes(round.stage)) { firstPin = ""; pinScreen("pin-create"); }
      else if (["question", "submit"].includes(round.stage)) handoff("The screen was hidden. Please answer again.");
    });
  }
  App.vibeCheck = { init, solve, filterGames, answerPositions, defaultAttendees };
})();
