/* A narrow BGG XML API2 proxy. No token is sent to the browser. */
export function createBggProxy({ fetchImpl = fetch, cache, now = Date.now, minimumInterval = 5000 } = {}) {
  let lastRequest = -Infinity;
  const pending = new Map();
  return async function handle(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || url.origin;
    const allowed = String(env.ALLOWED_ORIGIN || "").split(",").map(value => value.trim()).filter(Boolean);
    const headers = { "Vary": "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const respond = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...headers, ...extra } });
    if (!allowed.includes(origin)) return respond("App origin is not allowed.", 403);
    headers["Access-Control-Allow-Origin"] = origin;
    if (request.method === "OPTIONS") return respond(null, 204, { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" });
    if (request.method !== "GET") return respond("Use GET.", 405, { Allow: "GET, OPTIONS" });
    if (!env.BGG_TOKEN) return respond("BGG service is not configured.", 503);
    const command = url.pathname.replace(/^\/api\/bgg\//, "/");
    const upstream = new URL("https://boardgamegeek.com/xmlapi2" + command);
    if (command === "/thing") {
      const id = url.searchParams.get("id") || "";
      if (!/^\d{1,12}$/.test(id) || Number(id) < 1 || [...url.searchParams.keys()].some(key => key !== "id")) return respond("A single numeric game ID is required.", 400);
      upstream.searchParams.set("id", id);
      upstream.searchParams.set("stats", "1");
    } else if (command === "/search") {
      const query = (url.searchParams.get("query") || "").replace(/\s+/g, " ").trim();
      if (!query || query.length > 100 || [...url.searchParams.keys()].some(key => key !== "query")) return respond("A game title of 1–100 characters is required.", 400);
      upstream.searchParams.set("query", query);
      upstream.searchParams.set("type", "boardgame,boardgameexpansion");
    } else return respond("Not found.", 404);
    const key = new Request(url.origin + "/bgg-cache" + command + upstream.search);
    try {
      const cached = await cache?.match(key);
      if (cached) return respond(await cached.text(), 200, { "Content-Type": "application/xml; charset=utf-8" });
      let task = pending.get(key.url);
      if (!task) {
        // Best-effort per-isolate spacing; cache hits and duplicates bypass the queue.
        if (pending.size >= 2) return respond("Wait before requesting another game.", 429, { "Retry-After": "5" });
        const startAt = Math.max(now(), lastRequest + minimumInterval);
        const delay = startAt - now();
        if (delay > minimumInterval) return respond("Wait before requesting another game.", 429, { "Retry-After": "5" });
        lastRequest = startAt;
        task = (async () => {
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 18000);
          try {
            const result = await fetchImpl(upstream.href, { headers: { Authorization: "Bearer " + env.BGG_TOKEN, Accept: "application/xml" }, signal: controller.signal, redirect: "error" });
            if (result.status !== 200) return { status: [202, 401, 403, 429].includes(result.status) ? result.status : 503 };
            const text = await result.text();
            if (text.length > 2000000 || !/<items\b/.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text)) return { status: 502 };
            const ttl = command === "/thing" ? 86400 : 3600;
            await cache?.put(key, new Response(text, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=" + ttl } }));
            return { status: 200, text };
          } finally { clearTimeout(timeout); }
        })();
        pending.set(key.url, task);
      }
      let result;
      try { result = await task; } finally { if (pending.get(key.url) === task) pending.delete(key.url); }
      return result.status === 200 ? respond(result.text, 200, { "Content-Type": "application/xml; charset=utf-8" }) : respond("BGG could not return data. Try again later.", result.status, { "Retry-After": "5" });
    } catch (_) { return respond("Unable to reach BGG. Try again later.", 502); }
  };
}

let handle;
export default {
  fetch(request, env) {
    handle ||= createBggProxy({ cache: caches.default });
    return handle(request, env);
  }
};
