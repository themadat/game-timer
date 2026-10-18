(function () {
  "use strict";

  const App = window.LocalApp;
  const config = App.config;
  const storage = App.storage;
  let registration = null;
  let refreshing = false;
  let refreshFallbackTimer = 0;

  function versionedAsset(path) {
    return path + "?v=" + encodeURIComponent(config.identity.buildId);
  }

  function installed() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function detectDevice() {
    const ua = navigator.userAgent || "";
    const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    if (/iPhone|iPod/i.test(ua)) return { id: "iphone", label: "iPhone" };
    if (/iPad/i.test(ua) || touchMac) return { id: "ipad", label: "iPad" };
    if (/Android/i.test(ua)) return { id: /Mobile/i.test(ua) ? "android-phone" : "android-tablet", label: /Mobile/i.test(ua) ? "Android phone" : "Android tablet" };
    if (/Macintosh|Mac OS X/i.test(ua)) return { id: "mac", label: "Mac" };
    if (/Windows/i.test(ua)) return { id: "windows", label: "Windows PC" };
    return { id: "other", label: "PC or other device" };
  }

  function effectiveDark() {
    const mode = storage.getState().preferences.appearance.mode;
    return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function applyAppearanceAssets() {
    const dark = effectiveDark();
    const variant = dark ? "dark" : "light";
    const manifest = document.querySelector("link[rel='manifest']");
    if (manifest) manifest.href = versionedAsset(dark ? config.identity.assets.manifestDark : config.identity.assets.manifestLight);
    const apple = document.querySelector("link[rel='apple-touch-icon']");
    if (apple) apple.href = versionedAsset(variant === "dark" ? "assets/icons/apple-touch-icon-dark.png" : "assets/icons/apple-touch-icon.png");
    const theme = document.querySelector("meta[name='theme-color']:not([media])");
    if (theme) theme.content = dark ? "#121616" : "#f5f3ed";
    document.documentElement.dataset.installIcon = variant;
  }

  function forceRefreshUrl() {
    const target = new URL(location.href);
    target.searchParams.set("force-refresh", String(Date.now()));
    return target.href;
  }

  function forceRefresh(worker) {
    if (refreshing) return;
    refreshing = true;
    const waitingWorker = worker || registration && registration.waiting;
    if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
    if (registration && typeof registration.update === "function") registration.update().catch(function () {});
    window.clearTimeout(refreshFallbackTimer);
    refreshFallbackTimer = window.setTimeout(function () { location.replace(forceRefreshUrl()); }, waitingWorker ? 1200 : 0);
  }

  let checkingUpdate = false;
  async function checkForUpdates(button) {
    if (checkingUpdate || refreshing) return;
    checkingUpdate = true;
    if (button) { button.disabled=true; button.setAttribute('aria-busy','true'); }
    try {
      if (navigator.onLine === false) throw new Error('Connect to the internet to check for an update.');
      if (!storage.saveNow()) throw new Error('Your changes could not be saved. Update was paused to keep them safe.');
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        registration = registration || await navigator.serviceWorker.getRegistration();
        if (!registration) { await registerServiceWorker(); }
        if (registration) {
          await registration.update();
          const worker=registration.installing;
          if (worker && worker.state!=='installed' && worker.state!=='activated') await new Promise(function (resolve,reject) {
            const timer=window.setTimeout(function () { finish(new Error('The update is taking longer than expected. Please try Update again.')); },30000);
            function finish(error) { window.clearTimeout(timer); worker.removeEventListener('statechange',changed); error ? reject(error) : resolve(); }
            function changed() { if (worker.state==='installed' || worker.state==='activated') finish(); else if (worker.state==='redundant') finish(new Error('The update could not be installed. Please try again.')); }
            worker.addEventListener('statechange',changed); changed();
          });
        }
      }
      forceRefresh(registration && registration.waiting);
    } catch (error) {
      App.components.toast(error.message || 'Could not check for updates. Please try again.',{title:'Update',kind:'warning'});
    } finally {
      checkingUpdate=false;
      if (button) { button.disabled=false; button.removeAttribute('aria-busy'); }
    }
  }

  function renderUpdateReady(ready) {
    const button=document.querySelector('#updateAppButton');
    if (!button) return;
    button.dataset.updateAvailable=String(ready);
    button.title=ready ? 'Update available — install and refresh' : 'Check for updates and force refresh';
    button.setAttribute('aria-label',ready ? 'Update — new version available' : 'Update — check for updates and force refresh');
    App.icons.set(button.querySelector('.button-icon'),ready ? 'updateReady' : 'updateApp');
  }

  function updateAvailable() {
    renderUpdateReady(true);
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    try {
      registration = await navigator.serviceWorker.register(versionedAsset("sw.js"), { updateViaCache: "none" });
      if (registration.waiting && navigator.serviceWorker.controller) updateAvailable(registration.waiting);
      registration.addEventListener("updatefound", function () {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) updateAvailable(worker);
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        renderUpdateReady(false);
        if (refreshing) {
          window.clearTimeout(refreshFallbackTimer);
          location.replace(forceRefreshUrl());
        }
      });
    } catch (error) {
      window.dispatchEvent(new CustomEvent("app:pwaerror", { detail: { message: "Offline installation is unavailable in this browser session." } }));
    }
  }

  function networkStatus() {
    return navigator.onLine === false ? { online: false, label: "Offline", message: "Local features remain available." } : { online: true, label: "Online", message: "Optional internet features are available." };
  }

  function init() {
    applyAppearanceAssets();
    renderUpdateReady(false);
    registerServiceWorker();
    document.querySelector("#updateAppButton").addEventListener("click",function () { checkForUpdates(this); });
    window.addEventListener("appinstalled", function () {
      App.components.toast("The application was added to this device.", { title: "Installed", kind: "success" });
    });
    ["online", "offline"].forEach(function (name) {
      window.addEventListener(name, function () { window.dispatchEvent(new CustomEvent("app:networkchange", { detail: networkStatus() })); });
    });
    const appearanceQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (typeof appearanceQuery.addEventListener === "function") appearanceQuery.addEventListener("change", applyAppearanceAssets);
    else if (typeof appearanceQuery.addListener === "function") appearanceQuery.addListener(applyAppearanceAssets);
    window.addEventListener("app:statechange", applyAppearanceAssets);
  }

  App.pwa = {
    init: init,
    detectDevice: detectDevice,
    installed: installed,
    networkStatus: networkStatus,
    applyAppearanceAssets: applyAppearanceAssets,
    forceRefresh: forceRefresh,
    checkForUpdates: checkForUpdates,
    getRegistration: function () { return registration; }
  };
})();
