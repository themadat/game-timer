(function () {
  "use strict";

  const App = window.LocalApp;
  const config = App.config;

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function cleanText(value, max = config.controls.maxTextLength) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .slice(0, max);
  }

  function cleanLine(value, max = 200) {
    return cleanText(value, max).replace(/\s+/g, " ").trim();
  }

  function cleanIconLabel(value, max = 120) {
    return cleanText(value, config.controls.maxTextLength)
      .replace(/\bsvg\s*repo\s*com\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
      .trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
    });
  }

  function safeUrl(value, options) {
    const settings = Object.assign({ allowMailto: false, allowRelative: false }, options || {});
    const input = cleanLine(value, 2048);
    if (!input) return "";
    if (settings.allowRelative && /^(?:\.\/|\.\.\/|\/)[^\s]*$/.test(input)) return input;
    try {
      const url = new URL(input);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
      if (settings.allowMailto && url.protocol === "mailto:") return url.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function safeExternalOpen(value) {
    const url = safeUrl(value);
    if (!url) return false;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
    return Boolean(opened);
  }

  function normalizeColor(value, fallback) {
    const color = cleanLine(value, 16).toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
  }

  function hexToRgb(hex) {
    const value = normalizeColor(hex, "#000000").slice(1);
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHex(red, green, blue) {
    return "#" + [red, green, blue].map(function (part) {
      return Math.round(clamp(part, 0, 255, 0)).toString(16).padStart(2, "0");
    }).join("");
  }

  function mixColor(first, second, weight) {
    const a = hexToRgb(first);
    const b = hexToRgb(second);
    const amount = clamp(weight, 0, 1, 0.5);
    return rgbToHex(
      a.r + (b.r - a.r) * amount,
      a.g + (b.g - a.g) * amount,
      a.b + (b.b - a.b) * amount
    );
  }

  const ALLOWED_RICH_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A", "CODE"]);

  function sanitizeRichHtml(value) {
    const source = cleanText(value, config.controls.maxDocumentHtmlLength);
    if (!source) return "";
    const template = document.createElement("template");
    template.innerHTML = source;

    function cleanNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(cleanText(node.nodeValue, config.controls.maxTextLength));
      if (node.nodeType !== Node.ELEMENT_NODE || !ALLOWED_RICH_TAGS.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        Array.from(node.childNodes || []).forEach(function (child) { fragment.appendChild(cleanNode(child)); });
        return fragment;
      }
      const element = document.createElement(node.tagName.toLowerCase() === "b" ? "strong" : node.tagName.toLowerCase() === "i" ? "em" : node.tagName.toLowerCase());
      if (node.tagName === "A") {
        const href = safeUrl(node.getAttribute("href"));
        if (href) {
          element.setAttribute("href", href);
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
      }
      Array.from(node.childNodes).forEach(function (child) { element.appendChild(cleanNode(child)); });
      return element;
    }

    const output = document.createElement("div");
    Array.from(template.content.childNodes).forEach(function (node) { output.appendChild(cleanNode(node)); });
    return output.innerHTML.slice(0, config.controls.maxDocumentHtmlLength);
  }

  function stripHtml(value) {
    const template = document.createElement("template");
    template.innerHTML = sanitizeRichHtml(value);
    return cleanLine(template.content.textContent || "", config.controls.maxTextLength);
  }

  function richTextToPlainText(value, max) {
    const template = document.createElement("template");
    const withBreaks = sanitizeRichHtml(value)
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|li|h2|h3|blockquote)>/gi, "\n");
    template.innerHTML = withBreaks;
    return cleanText(template.content.textContent || "", max || config.controls.maxDocumentHtmlLength)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\n+|\n+$/g, "");
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    const lead = cleanLine(prefix || "item", 24).replace(/[^a-z0-9_-]/gi, "-").toLowerCase() || "item";
    if (window.crypto && typeof window.crypto.randomUUID === "function") return lead + "-" + window.crypto.randomUUID();
    return lead + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function ensureIso(value, fallback) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? new Date(time).toISOString() : (fallback || isoNow());
  }

  function stableJson(value) {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function fingerprint(value) {
    const text = stableJson(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function debounce(callback, delay) {
    let timer = 0;
    function wrapped() {
      const args = arguments;
      clearTimeout(timer);
      timer = window.setTimeout(function () { callback.apply(null, args); }, delay);
    }
    wrapped.flush = function () {
      clearTimeout(timer);
      timer = 0;
      callback();
    };
    wrapped.cancel = function () { clearTimeout(timer); timer = 0; };
    return wrapped;
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function dateLabel(value) {
    const time = Date.parse(value || "");
    if (!Number.isFinite(time)) return "Unknown";
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(time));
  }

  function relativeTime(value) {
    const time = Date.parse(value || "");
    if (!Number.isFinite(time)) return "never";
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 45) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + " min ago";
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + " hr ago";
    const days = Math.round(hours / 24);
    return days + " day" + (days === 1 ? "" : "s") + " ago";
  }

  function isEditableTarget(target) {
    if (!target || !target.matches) return false;
    return target.matches("input, textarea, select, [contenteditable='true']") || Boolean(target.closest("[contenteditable='true']"));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  App.utils = {
    clone,
    plainObject,
    clamp,
    cleanText,
    cleanLine,
    cleanIconLabel,
    escapeHtml,
    safeUrl,
    safeExternalOpen,
    normalizeColor,
    hexToRgb,
    mixColor,
    sanitizeRichHtml,
    stripHtml,
    richTextToPlainText,
    isoNow,
    uid,
    ensureIso,
    stableJson,
    fingerprint,
    debounce,
    formatBytes,
    dateLabel,
    relativeTime,
    isEditableTarget,
    cssEscape
  };
})();
