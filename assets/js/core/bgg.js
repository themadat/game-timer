/* Direct BGG XML API2 import. The key stays on this device, outside app data. */
(function () {
  "use strict";
  const App = window.LocalApp;
  const tokenKey = App.config.storage?.bggSecretKey || "gameTimer.bggToken.v1";
  const cache = new Map();
  const active = new Set();
  let nextRequestAt = 0;
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const children = (node, tag) => Array.from(node.children).filter(child => child.tagName === tag);
  function xmlDocument(text) {
    if (!text || text.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("BGG returned unsupported XML. Try again later.");
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror") || doc.documentElement.tagName !== "items") throw new Error("BGG returned an unreadable response. Try again later.");
    return doc.documentElement;
  }
  function parseSearch(text) {
    return children(xmlDocument(text), "item").filter(item => ["boardgame", "boardgameexpansion"].includes(item.getAttribute("type"))).map(item => ({
      id: item.getAttribute("id"),
      name: clean(children(item, "name")[0]?.getAttribute("value")).slice(0, 100),
      year: children(item, "yearpublished")[0]?.getAttribute("value") || ""
    })).filter(item => /^\d{1,12}$/.test(item.id) && Number(item.id) > 0 && item.name).slice(0, 100);
  }
  function parseThing(text, expectedId) {
    const item = children(xmlDocument(text), "item").find(item => item.getAttribute("id") === String(expectedId) && ["boardgame", "boardgameexpansion"].includes(item.getAttribute("type")));
    if (!item) throw new Error("No board game or expansion found for that BGG ID.");
    const fields = { bggId: String(expectedId) }, warnings = [];
    const names = children(item, "name");
    const primary = names.find(name => name.getAttribute("type") === "primary");
    if (!clean(primary?.getAttribute("value"))) throw new Error("BGG returned a game without a primary name.");
    fields.name = clean(primary.getAttribute("value")).slice(0, 100);
    fields.alternativeNames = [...new Set(names.filter(name => name.getAttribute("type") === "alternate").map(name => clean(name.getAttribute("value")).slice(0, 150)).filter(Boolean))].slice(0, 100);
    function number(key, node, min, max, integer = false) {
      const raw = node?.getAttribute("value");
      if (raw == null || !raw.trim()) return;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))) fields[key] = value;
      else warnings.push(key + " is unavailable or outside the supported range and was skipped.");
    }
    number("year", children(item, "yearpublished")[0], -9999, 9999, true);
    for (const [key, tag, max] of [["minPlayers", "minplayers", 20], ["maxPlayers", "maxplayers", 20], ["minMinutes", "minplaytime", 1440], ["maxMinutes", "maxplaytime", 1440]]) number(key, children(item, tag)[0], 1, max, true);
    for (const [min, max] of [["minPlayers", "maxPlayers"], ["minMinutes", "maxMinutes"]]) {
      if (fields[min] !== undefined && fields[max] !== undefined && fields[min] > fields[max]) { delete fields[min]; delete fields[max]; warnings.push("An invalid range was skipped."); }
    }
    const ratings = item.querySelector("statistics > ratings");
    number("bggRating", ratings?.querySelector("average"), 1, 10);
    number("complexityWeight", ratings?.querySelector("averageweight"), 1, 5);
    const links = children(item, "link");
    fields.mechanisms = [...new Set(links.filter(link => link.getAttribute("type") === "boardgamemechanic").map(link => clean(link.getAttribute("value")).slice(0, 150)).filter(Boolean))].slice(0, 100);
    // inbound expansions point to the base game; they must not become its expansions.
    fields.expansions = [...new Set(links.filter(link => link.getAttribute("type") === "boardgameexpansion" && link.getAttribute("inbound") !== "true").map(link => clean(link.getAttribute("value")).slice(0, 150)).filter(name => name && !/\bfan[\s–—-]*(?:made[\s–—-]*)?(?:expansion|extension)\b|\(\s*fan[\s–—-]*made\s*\)|\bpromo\p{L}*/iu.test(name)))].slice(0, 100);
    const poll = children(item, "poll").find(poll => poll.getAttribute("name") === "suggested_numplayers");
    const votes = { bestPlayers: [], recommendedPlayers: [], avoidPlayers: [] };
    let rows = 0;
    if (poll) for (const row of children(poll, "results")) {
      const label = row.getAttribute("numplayers");
      if (!/^\d+$/.test(label)) { warnings.push("Open-ended player-count votes were skipped."); continue; }
      const count = Number(label);
      if (count < 1 || count > 20) continue;
      const results = children(row, "result");
      const scores = ["Best", "Recommended", "Not Recommended"].map(label => {
        const raw = results.find(result => result.getAttribute("value") === label)?.getAttribute("numvotes");
        return raw != null && /^\d+$/.test(raw) ? Number(raw) : NaN;
      });
      if (!scores.every(Number.isFinite) || !scores.some(score => score > 0)) continue;
      rows++;
      const max = Math.max(...scores);
      if (scores.filter(score => score === max).length > 1) warnings.push("Tied votes at " + count + " players were left neutral.");
      else votes[Object.keys(votes)[scores.indexOf(max)]].push(count);
    }
    if (rows) for (const key of Object.keys(votes)) fields[key] = [...new Set(votes[key])].sort((a, b) => a - b).join(", ") || "--";
    else warnings.push("No usable player-count votes were returned; existing recommendations will be kept.");
    return { fields, warnings: [...new Set(warnings)] };
  }
  function getToken() {
    try { return localStorage.getItem(tokenKey) || ""; } catch (_) { return ""; }
  }
  function resetRequests() {
    for (const controller of active) controller.abort(new Error("The BGG key changed. Try the request again."));
    cache.clear();
    nextRequestAt = 0;
  }
  function setToken(value) {
    const token = String(value || "").trim();
    if (!token || token.length > 500 || /\s/.test(token)) throw new Error("Enter a valid BGG API key.");
    try { localStorage.setItem(tokenKey, token); }
    catch (_) { throw new Error("This browser could not save the BGG key. Allow device storage and try again."); }
    resetRequests();
  }
  function clearToken() {
    try { localStorage.removeItem(tokenKey); }
    catch (_) { throw new Error("This browser could not remove the BGG key. Try again."); }
    resetRequests();
  }
  function wait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  async function request(command, params, signal) {
    const token = getToken();
    if (!token) throw new Error("Add your BGG API key in Settings → Data Sync before searching or fetching.");
    if (navigator.onLine === false) throw new Error("Reconnect to fetch BGG info. Your saved games are available offline.");
    if (signal?.aborted) throw signal.reason;
    const url = new URL("https://boardgamegeek.com/xmlapi2/" + command);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    if (command === "thing") url.searchParams.set("stats", "1");
    else url.searchParams.set("type", "boardgame,boardgameexpansion");
    const parse = text => command === "search" ? parseSearch(text) : parseThing(text, params.id);
    const cached = cache.get(url.href);
    if (cached && cached.expires > Date.now()) return parse(cached.text);
    const controller = new AbortController();
    active.add(controller);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(new Error("BGG took too long to respond. Try again.")), 30000);
    let reservedAt = null, started = false;
    try {
      const startAt = Math.max(Date.now(), nextRequestAt);
      reservedAt = startAt;
      nextRequestAt = startAt + 5000;
      if (startAt > Date.now()) await wait(startAt - Date.now(), controller.signal);
      started = true;
      const response = await fetch(url.href, { headers: { Authorization: "Bearer " + token }, signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error" });
      if (response.status === 202) throw new Error("BGG is preparing this data. Wait a few seconds, then try again.");
      if (response.status === 401 || response.status === 403) throw new Error("BGG access was refused. Check your API key in Settings → Data Sync.");
      if (response.status === 429 || response.status === 503) throw new Error("BGG is busy or requests are too frequent. Wait a few seconds, then try again.");
      if (!response.ok) throw new Error("BGG could not fetch data (" + response.status + "). Try again later.");
      const text = await response.text();
      const result = parse(text);
      if (controller.signal.aborted) throw controller.signal.reason;
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(url.href, { text, expires: Date.now() + (command === "thing" ? 86400000 : 3600000) });
      return result;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof TypeError) throw new Error("Could not reach BGG. Check your connection and try again.");
      throw error;
    } finally {
      if (!started && reservedAt !== null && nextRequestAt === reservedAt + 5000) nextRequestAt = reservedAt;
      active.delete(controller); clearTimeout(timeout); signal?.removeEventListener("abort", abort);
    }
  }
  App.bgg = { hasToken: () => Boolean(getToken()), setToken, clearToken, parseSearch, parseThing,
    search: (query, signal) => request("search", { query: clean(query).slice(0, 100) }, signal),
    thing: (id, signal) => request("thing", { id }, signal)
  };
})();
