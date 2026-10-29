/* BGG XML API2 import. Credentials stay on the proxy, outside app data. */
(function () {
  "use strict";
  const App = window.LocalApp;
  const endpointKey = "gameTimer.bggEndpoint.v1";
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
  function validateEndpoint(value) {
    if (!String(value || "").trim()) return "";
    const url = new URL(String(value).trim());
    if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use an HTTPS BGG service URL (HTTP is allowed on localhost).");
    return url.href.replace(/\/$/, "");
  }
  function endpoint() {
    try { return validateEndpoint(localStorage.getItem(endpointKey) || App.config.bgg?.apiUrl || ""); } catch (_) { return ""; }
  }
  function setEndpoint(value) {
    const next = validateEndpoint(value);
    if (next) localStorage.setItem(endpointKey, next); else localStorage.removeItem(endpointKey);
  }
  async function request(command, params, signal) {
    const base = endpoint();
    if (!base) throw new Error("Connect the BGG service below before searching or fetching. The token belongs on that service.");
    if (navigator.onLine === false) throw new Error("Reconnect to fetch BGG info. Your saved games are available offline.");
    const url = new URL(base + "/" + command);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 25000);
    try {
      const response = await fetch(url.href, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      if (response.status === 202) throw new Error("BGG is preparing this data. Wait a few seconds, then try again.");
      if (response.status === 401 || response.status === 403) throw new Error("BGG access was refused. Check the service token and allowed app origin.");
      if (response.status === 429 || response.status === 503) throw new Error("BGG is busy or requests are too frequent. Wait a few seconds, then try again.");
      if (!response.ok) throw new Error("The BGG service could not fetch data (" + response.status + "). Try again later.");
      const text = await response.text();
      return command === "search" ? parseSearch(text) : parseThing(text, params.id);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted) throw new Error("BGG took too long to respond. Try again.");
      if (error instanceof TypeError) throw new Error("Could not reach the BGG service. Check its URL and allowed app origin, then try again.");
      throw error;
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
  }
  App.bgg = { endpoint, setEndpoint, parseSearch, parseThing,
    search: (query, signal) => request("search", { query: clean(query).slice(0, 100) }, signal),
    thing: (id, signal) => request("thing", { id }, signal)
  };
})();
