/* Dependency-free local app + BGG service: BGG_TOKEN=... node services/bgg/local.mjs */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { createBggProxy } from "./worker.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env.PORT || 8080);
const origin = "http://127.0.0.1:" + port;
const entries = new Map();
const cache = {
  async match(request) {
    const entry = entries.get(request.url);
    if (entry && entry.expires > Date.now()) return new Response(entry.text);
    entries.delete(request.url);
  },
  async put(request, response) {
    const seconds = Number(response.headers.get("cache-control").match(/max-age=(\d+)/)?.[1] || 0);
    if (entries.size >= 200) entries.delete(entries.keys().next().value);
    entries.set(request.url, { text: await response.text(), expires: Date.now() + seconds * 1000 });
  }
};
const proxy = createBggProxy({ cache });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".md": "text/plain; charset=utf-8" };
const server = createServer(async (req, res) => {
  try {
    if (!["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith("/api/bgg/")) {
      const request = new Request(url, { method: req.method, headers: { Origin: req.headers.origin || origin } });
      const result = await proxy(request, { BGG_TOKEN: process.env.BGG_TOKEN, ALLOWED_ORIGIN: origin + ",http://localhost:" + port });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(await result.text());
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const path = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = resolve(root, "." + path);
    const publicPath = /^\/(?:index\.html|sw\.js|manifest(?:-dark)?\.webmanifest|assets\/[^\0]*|docs\/BGG\.md)$/.test(path);
    if (!publicPath || !file.startsWith(root + (root.endsWith(sep) ? "" : sep)) || path.split("/").some(segment => segment.startsWith("."))) { res.writeHead(404); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (_) { res.writeHead(404); res.end(); }
});
server.listen(port, "127.0.0.1", () => {
  console.log("Game Timer: " + origin);
  console.log("BGG service URL: " + origin + "/api/bgg");
  if (!process.env.BGG_TOKEN) console.log("Set BGG_TOKEN before starting to enable BGG requests.");
});
