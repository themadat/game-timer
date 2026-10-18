(async function () {
  "use strict";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Could not load " + src.split("?")[0])); };
      document.head.appendChild(script);
    });
  }

  try {
    // Revalidate the single version source, including on the first uncontrolled visit.
    // The service worker removes this nonce when caching for offline startup.
    await loadScript("assets/js/config.js?boot=" + Date.now());
    const version = encodeURIComponent(window.LocalApp.config.identity.version);
    document.querySelectorAll("link[data-app-asset]").forEach(function (link) {
      link.href = link.getAttribute("data-app-asset") + "?v=" + version;
    });
    for (const script of document.querySelectorAll("script[data-app-src]")) {
      await loadScript(script.getAttribute("data-app-src") + "?v=" + version);
    }
  } catch (error) {
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = "The app could not finish loading. Reconnect and reload. " + error.message;
    document.body.prepend(message);
  }
})();
