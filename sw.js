"use strict";

// Registration supplies config.identity.buildId; no release literal lives here.
const ASSET_VERSION = new URL(self.location.href).searchParams.get("v") || "development";
const CACHE_NAME = "game-timer-shell-" + ASSET_VERSION;
const versioned = function (path) { return path + "?v=" + ASSET_VERSION; };
const SHELL = [
  "./",
  "./index.html",
  "./assets/js/boot.js",
  "./assets/js/config.js",
  versioned("./manifest.webmanifest"),
  versioned("./manifest-dark.webmanifest"),
  versioned("./assets/css/app.css"),
  versioned("./assets/css/game.css"),
  versioned("./assets/js/icons.js"),
  versioned("./assets/js/data/games.js"),
  versioned("./assets/js/core/utils.js"),
  versioned("./assets/js/core/state.js"),
  versioned("./assets/js/core/storage.js"),
  versioned("./assets/js/core/components.js"),
  versioned("./assets/js/core/portability.js"),
  versioned("./assets/js/core/sync.js"),
  versioned("./assets/js/core/pwa.js"),
  versioned("./assets/js/features/session-aids.js"),
  versioned("./assets/js/features/play.js"),
  versioned("./assets/js/core/bgg.js"),
  versioned("./assets/js/features/library.js"),
  versioned("./assets/js/features/vibe-check.js"),
  versioned("./assets/js/app.js"),
  versioned("./assets/icons/favicon-tab.svg"),
  versioned("./assets/icons/app-icon-light.svg"),
  versioned("./assets/icons/app-icon-dark.svg"),
  versioned("./assets/icons/icon-192.png"),
  versioned("./assets/icons/icon-512.png"),
  versioned("./assets/icons/icon-512-maskable.png"),
  versioned("./assets/icons/icon-192-dark.png"),
  versioned("./assets/icons/icon-512-dark.png"),
  versioned("./assets/icons/icon-512-maskable-dark.png"),
  versioned("./assets/icons/apple-touch-icon.png"),
  versioned("./assets/icons/apple-touch-icon-dark.png"),
  versioned("./assets/icons/splash-light.png"),
  versioned("./assets/icons/splash-dark.png")
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(Promise.all([
    caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key.startsWith("game-timer-shell-") && key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); })); }),
    self.clients.claim()
  ]));
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Keep one config cache entry despite boot's freshness nonce.
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.delete("boot");

  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-cache" }).then(function (response) {
      if (response && response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put("./index.html", copy); });
      }
      return response;
    }).catch(function () { return caches.match("./index.html").then(function (cached) { return cached || Response.error(); }); }));
    return;
  }

  event.respondWith(fetch(request, { cache: "no-cache" }).then(function (response) {
      if (!response || !response.ok || response.type !== "basic") return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(cacheUrl.href, copy); });
      return response;
    }).catch(function () { return caches.open(CACHE_NAME).then(function (cache) { return cache.match(cacheUrl.href, { ignoreSearch: true }); }).then(function (cached) { return cached || Response.error(); }); }));
});
