/* Private, device-local table matching. Ballots and the host code never enter storage. */
(function () {
  "use strict";
  const App = window.LocalApp;
  const OPTIONS = ["heavy", "light", "out"];
  const LABELS = { heavy: "Heavy", light: "Light", out: "Sit out" };
  const esc = value => App.utils.escapeHtml(String(value));
  let dialog, body, round = null;

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

  function icon(kind) { return kind === "out" ? "" : App.icons.markup("vibe" + (kind === "heavy" ? "Heavy" : "Light")); }
  function gameName(game) { return App.play.gameAccessibleName(game.name); }
  function focus(selector) { body.querySelector(selector)?.focus({ preventScroll: true }); }
  function show(markup, selector = "[data-vibe-focus]") {
    body.innerHTML = markup;
    focus(selector);
  }
  function error(message) { body.querySelector("[data-vibe-error]").textContent = message; }
  function notice() { return '<p class="panel-note">Choices and passcode stay in memory. Ending or reloading clears this round. Keep the screen private; assignments may imply a preference.</p>'; }
  function tableSummary() {
    return '<div class="vibe-table-summary">' + ["heavy", "light"].map(kind => '<span>' + icon(kind) + '<strong>' + LABELS[kind] + '</strong> · ' + esc(round.tables[kind].name) + '</span>').join("") + '</div>';
  }

  function setup() {
    round = null;
    const people = App.storage.getState().workspace.people;
    const games = App.play.allGames().filter(game => game.id !== "custom").sort((a, b) => gameName(a).localeCompare(gameName(b)));
    show(`<form id="vibeSetup" class="vibe-form">
      <p>Select who is here, then pass the device so everyone can privately choose what they would enjoy.</p>
      <fieldset><legend>Who is here?</legend><div class="vibe-people">${people.map((person, i) => `<label><input type="checkbox" name="attendee" value="${i}"><span>${esc(person.name)}</span></label>`).join("") || '<p>Add people in Library → People first.</p>'}</div></fieldset>
      <div class="vibe-tables">${["heavy", "light"].map(kind => `<fieldset><legend>${icon(kind)} ${LABELS[kind]}</legend><label>Game (optional)<select name="${kind}Game"><option value="">Game undecided</option>${games.map(game => `<option value="${esc(game.id)}">${esc(gameName(game))}</option>`).join("")}</select></label><div data-vibe-limits="${kind}"></div></fieldset>`).join("")}</div>
      <fieldset><legend>Host reveal passcode</legend><p class="panel-note">Choose 4–12 digits before handing over the device. Only this code reveals the result. There is no recovery for a forgotten code.</p>
      <div class="vibe-tables"><label>Passcode<input name="passcode" type="password" inputmode="numeric" pattern="[0-9]{4,12}" minlength="4" maxlength="12" autocomplete="off" required></label><label>Confirm passcode<input name="confirmation" type="password" inputmode="numeric" pattern="[0-9]{4,12}" minlength="4" maxlength="12" autocomplete="off" required></label></div></fieldset>
      <label class="vibe-check"><input type="checkbox" name="fixed"> Use fixed answer positions (keyboard and accessibility mode)</label>
      <p class="panel-note">Every person answers Heavy, Light and Sit out. Select every acceptable option. Each active table needs at least three people; one table is allowed. Random answer positions conceal tap patterns.</p>
      ${notice()}<p class="vibe-error" role="alert" data-vibe-error></p><button class="button primary" type="submit">Begin private voting</button>
    </form>`, "input[name='attendee']");
  }

  function gameChanged(select) {
    const kind = select.name === "heavyGame" ? "heavy" : "light";
    const game = App.play.gameById(select.value);
    const target = body.querySelector(`[data-vibe-limits="${kind}"]`);
    if (!game) { target.innerHTML = ""; return; }
    const minKnown = Number.isInteger(game.minPlayers) && game.minPlayers >= 1;
    const maxKnown = Number.isInteger(game.maxPlayers) && game.maxPlayers >= 1;
    target.innerHTML = `<p class="panel-note">${minKnown && maxKnown ? 'Game player limits' : 'Confirm missing game limits before voting'}</p><div class="vibe-tables"><label>Minimum players<input name="${kind}Min" type="number" min="1" max="${App.config.controls.maxPeople}" step="1" required value="${minKnown ? game.minPlayers : ''}" ${minKnown ? 'readonly' : ''}></label><label>Maximum players<input name="${kind}Max" type="number" min="1" max="${App.config.controls.maxPeople}" step="1" required value="${maxKnown ? game.maxPlayers : ''}" ${maxKnown ? 'readonly' : ''}></label></div>`;
  }

  function begin(form) {
    const people = App.storage.getState().workspace.people;
    const selected = Array.from(form.querySelectorAll("[name='attendee']:checked"), input => people[Number(input.value)].name);
    if (selected.length < 3) { error("Select at least three people."); return; }
    if (form.elements.passcode.value !== form.elements.confirmation.value) { error("The passcodes do not match."); return; }
    const tables = {};
    for (const kind of ["heavy", "light"]) {
      const game = App.play.gameById(form.elements[kind + "Game"].value);
      const min = game ? Number(form.elements[kind + "Min"].value) : 3;
      const max = game ? Number(form.elements[kind + "Max"].value) : selected.length;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) { error("Check the game player limits: maximum must be at least minimum."); return; }
      tables[kind] = { name: game ? gameName(game) : "Game undecided", min, max };
    }
    round = { people: selected, tables, passcode: form.elements.passcode.value, fixed: form.elements.fixed.checked, ballots: [], ballot: [], question: 0, stage: "handoff", result: null, failures: 0, retryAt: 0 };
    handoff();
  }

  function handoff(message = "") {
    round.stage = "handoff";
    round.ballot = [];
    round.question = 0;
    show(`<div class="vibe-private"><h3 data-vibe-focus tabindex="-1">Pass to ${esc(round.people[round.ballots.length])}</h3><p>${round.ballots.length + 1} of ${round.people.length} · Hold the screen privately.</p>${message ? `<p>${esc(message)}</p>` : ''}${tableSummary()}<p>Choose every option you genuinely accept. You can accept either table, sitting out, or any combination.</p><button class="button primary" type="button" data-vibe="ready">I’m ready</button></div>`);
  }

  function question() {
    round.stage = "question";
    const kind = OPTIONS[round.question];
    const slots = [0, 1, 2, 3];
    if (!round.fixed) {
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
    }
    const targets = round.fixed ? [0, 1] : slots.slice(0, 2);
    show(`<div class="vibe-private"><p>Question ${round.question + 1} of 3</p><h3 data-vibe-focus tabindex="-1">${icon(kind)} ${kind === "out" ? "Would you be happy sitting out?" : "Would you enjoy the " + LABELS[kind] + " table?"}</h3><p>${kind === "out" ? "Choose Yes only if sitting out is an acceptable outcome for you." : esc(round.tables[kind].name)}</p><div class="vibe-targets ${round.fixed ? 'vibe-fixed' : ''}">${[true, false].map((answer, i) => `<button class="button" type="button" data-vibe-answer="${answer}" style="grid-area:${Math.floor(targets[i] / 2) + 1}/${targets[i] % 2 + 1}">${answer ? 'Yes, happy to' : 'No, thanks'}</button>`).join("")}</div><p class="panel-note">Each answer stays private. Select all acceptable options across the three questions.</p></div>`);
  }

  function submitScreen() {
    round.stage = "submit";
    show('<div class="vibe-private"><h3 data-vibe-focus tabindex="-1">Ready to submit</h3><p>Your choices will be hidden before you pass the device.</p><button class="button primary" type="button" data-vibe="submit">Submit privately</button><button class="button" type="button" data-vibe="redo">Answer again</button></div>');
  }

  function gate() {
    round.stage = "locked";
    show(`<form id="vibeUnlock" class="vibe-form"><h3 data-vibe-focus tabindex="-1">Return to the host</h3><p>Voting is complete. Enter the host passcode to reveal table assignments.</p><label>Host passcode<input name="code" type="password" inputmode="numeric" maxlength="12" autocomplete="off" required></label><p role="alert" class="vibe-error" data-vibe-error></p><button class="button primary" type="submit">Reveal assignments</button>${notice()}</form>`);
  }

  function unlock(form) {
    if (Date.now() < round.retryAt) { form.reset(); error("Wait a few seconds before trying again."); return; }
    const code = form.elements.code.value;
    form.reset();
    if (code !== round.passcode) {
      round.failures++;
      if (round.failures % 5 === 0) round.retryAt = Date.now() + 15000;
      error(round.failures % 5 === 0 ? "Incorrect passcode. Wait 15 seconds before trying again." : "Incorrect passcode.");
      focus("input[name='code']");
      return;
    }
    if (!round.result) {
      // Compute only after authorization. Never put individual ballots in the DOM.
      round.result = { assignments: solve(round.ballots, round.tables) };
      round.ballots = [];
    }
    reveal();
  }

  function reveal() {
    round.stage = "revealed";
    const assignments = round.result.assignments;
    show(`<div class="vibe-form"><h3 data-vibe-focus tabindex="-1">${assignments ? 'Tonight’s tables' : 'No valid arrangement'}</h3>${assignments ? `<div class="vibe-results">${OPTIONS.map(kind => {
      const members = round.people.filter((name, i) => assignments[i] === kind);
      return members.length ? `<section><h4>${icon(kind)} ${kind === "out" ? 'Sitting out' : LABELS[kind]} · ${members.length}</h4>${kind !== "out" ? `<p>${esc(round.tables[kind].name)}</p>` : ''}<ul>${members.map(name => `<li>${esc(name)}</li>`).join('')}</ul></section>` : '';
    }).join('')}</div><p class="panel-note">Every assignment respects accepted choices. Active tables have at least three people and fit their game’s limits.</p>` : '<p>No split respects everyone’s choices and the game player limits while keeping at least three people at each active table. Start a fresh round with different games or attendees; no one has been assigned against their choices.</p>'}<p class="panel-note">Ballots have been cleared. Assignments may imply a preference.</p><div class="vibe-actions"><button class="button" type="button" data-vibe="lock">Lock results</button><button class="button" type="button" data-vibe="new">New round</button><button class="button primary" type="button" data-close-dialog="vibeCheckDialog">End and clear</button></div></div>`);
  }

  function init() {
    dialog = document.querySelector("#vibeCheckDialog");
    body = document.querySelector("#vibeCheckBody");
    document.querySelector("#vibeCheckButton").addEventListener("click", event => {
      setup();
      App.components.openDialog(dialog, { trigger: event.currentTarget, focus: "#vibeCheckTitle" });
    });
    dialog.addEventListener("close", () => { round = null; body.innerHTML = ""; });
    body.addEventListener("change", event => {
      if (event.target.matches("select[name='heavyGame'], select[name='lightGame']")) gameChanged(event.target);
    });
    body.addEventListener("submit", event => {
      event.preventDefault();
      if (event.target.id === "vibeSetup" && !round) begin(event.target);
      else if (event.target.id === "vibeUnlock" && round?.stage === "locked") unlock(event.target);
    });
    body.addEventListener("click", event => {
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
      if (action === "ready" && round.stage === "handoff") question();
      else if (action === "redo" && round.stage === "submit") { round.ballot = []; round.question = 0; question(); }
      else if (action === "submit" && round.stage === "submit") {
        if (!round.ballot.length) { handoff("Choose at least one acceptable option. Please answer again."); return; }
        round.ballots.push(round.ballot);
        round.ballot = [];
        if (round.ballots.length === round.people.length) gate(); else handoff();
      } else if (action === "lock" && round.stage === "revealed") gate();
      else if (action === "new" && round.stage === "revealed") setup();
    });
    document.addEventListener("visibilitychange", () => {
      if (!round || !document.hidden) return;
      if (["revealed", "locked"].includes(round.stage)) gate();
      else if (["question", "submit"].includes(round.stage)) handoff("The screen was hidden. Please answer again.");
    });
  }
  App.vibeCheck = { init, solve };
})();
