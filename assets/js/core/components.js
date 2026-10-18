(function () {
  "use strict";

  const App = window.LocalApp;
  const u = App.utils;
  const focusOrigins = new Map();
  let confirmResolve = null;
  let choiceResolve = null;
  let toastTimer = 0;
  let activePopover = null;

  function element(value) {
    return typeof value === "string" ? document.querySelector(value) : value;
  }

  function openDialog(target, options) {
    const dialog = element(target);
    if (!dialog) return null;
    const settings = Object.assign({ trigger: document.activeElement, focus: "[autofocus], [data-initial-focus], input, button, select, textarea" }, options || {});
    focusOrigins.set(dialog, settings.trigger instanceof HTMLElement ? settings.trigger : null);
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add("dialog-open");
    requestAnimationFrame(function () {
      const targetFocus = element(settings.focus) && dialog.contains(element(settings.focus)) ? element(settings.focus) : dialog.querySelector(settings.focus);
      if (targetFocus && typeof targetFocus.focus === "function") targetFocus.focus({ preventScroll: true });
    });
    return dialog;
  }

  function closeDialog(target, returnValue) {
    const dialog = element(target);
    if (dialog && dialog.open) dialog.close(returnValue || "");
  }

  function handleDialogClose(event) {
    const dialog = event.currentTarget;
    const stillOpen = Array.from(document.querySelectorAll("dialog")).some(function (item) { return item.open; });
    document.documentElement.classList.toggle("dialog-open", stillOpen);
    const origin = focusOrigins.get(dialog);
    focusOrigins.delete(dialog);
    if (origin && origin.isConnected && !stillOpen) requestAnimationFrame(function () { origin.focus({ preventScroll: true }); });
  }

  function confirm(options) {
    const settings = Object.assign({ title: "Confirm action", message: "Continue?", confirmLabel: "Confirm", cancelLabel: "Cancel", danger: false }, options || {});
    const dialog = document.querySelector("#confirmDialog");
    dialog.querySelector("[data-confirm-title]").textContent = settings.title;
    dialog.querySelector("[data-confirm-message]").textContent = settings.message;
    const action = dialog.querySelector("[data-confirm-action]");
    const cancel = dialog.querySelector("[data-confirm-cancel]");
    action.textContent = settings.confirmLabel;
    action.classList.toggle("danger", settings.danger);
    cancel.textContent = settings.cancelLabel;
    if (confirmResolve) confirmResolve(false);
    return new Promise(function (resolve) {
      confirmResolve = resolve;
      openDialog(dialog, { trigger: settings.trigger, focus: settings.danger ? "[data-confirm-cancel]" : "[data-confirm-action]" });
    });
  }

  function choose(options) {
    const settings = Object.assign({ title: "Choose an action", message: "", choices: [], cancelLabel: "Cancel" }, options || {});
    const dialog = document.querySelector("#choiceDialog");
    dialog.querySelector("[data-choice-title]").textContent = settings.title;
    dialog.querySelector("[data-choice-message]").textContent = settings.message;
    const container = dialog.querySelector("[data-choice-actions]");
    container.innerHTML = "";
    settings.choices.forEach(function (choice, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button " + (choice.kind || "secondary");
      button.dataset.choiceValue = choice.value;
      if (index === 0) button.dataset.initialFocus = "";
      if (choice.symbol && App.icons) {
        const icon = document.createElement("span");
        icon.className = "choice-icon";
        icon.setAttribute("aria-hidden", "true");
        App.icons.set(icon, choice.symbol);
        button.appendChild(icon);
        button.classList.add("has-symbol");
      }
      const copy = document.createElement("span");
      copy.className = "choice-copy";
      const title = document.createElement("strong");
      title.textContent = choice.label;
      copy.appendChild(title);
      if (choice.description) {
        const description = document.createElement("span");
        description.className = "choice-description";
        description.textContent = choice.description;
        copy.appendChild(description);
      }
      button.appendChild(copy);
      container.appendChild(button);
    });
    dialog.querySelector("[data-choice-cancel]").textContent = settings.cancelLabel;
    if (choiceResolve) choiceResolve("cancel");
    return new Promise(function (resolve) {
      choiceResolve = resolve;
      openDialog(dialog, { trigger: settings.trigger, focus: "[data-initial-focus]" });
    });
  }

  function message(title, text, options) {
    const dialog = document.querySelector("#messageDialog");
    dialog.querySelector("[data-message-title]").textContent = title;
    dialog.querySelector("[data-message-text]").textContent = text;
    dialog.querySelector("[data-message-close]").textContent = options && options.closeLabel ? options.closeLabel : "Close";
    openDialog(dialog, { trigger: options && options.trigger, focus: "[data-message-close]" });
  }

  function configureShortcut(control, key) {
    if (key) {
      control.dataset.shortcut = key;
      control.setAttribute("aria-keyshortcuts", key + " Control+Alt+Shift+" + key);
      return;
    }
    delete control.dataset.shortcut;
    control.removeAttribute("aria-keyshortcuts");
  }

  function toast(messageText, options) {
    const settings = Object.assign({ title: "Saved", kind: "info", duration: 3200, actionLabel: "", actionSymbol: "", actionShortcut: "", closeShortcut: "", context: "", onAction: null }, options || {});
    const toastEl = document.querySelector("#appToast");
    toastEl.dataset.kind = settings.kind;
    toastEl.dataset.context = settings.context;
    toastEl.querySelector("[data-toast-title]").textContent = settings.title;
    toastEl.querySelector("[data-toast-message]").textContent = messageText;
    const action = toastEl.querySelector("[data-toast-action]");
    action.hidden = !settings.actionLabel;
    action.className = settings.actionSymbol ? "icon-button toast-action-icon" : "button small";
    action.setAttribute("aria-label", settings.actionLabel || "Notification action");
    action.title = settings.actionLabel || "";
    if (settings.actionSymbol && App.icons) App.icons.set(action, settings.actionSymbol);
    else action.textContent = settings.actionLabel || "";
    configureShortcut(action, settings.actionShortcut);
    action.onclick = settings.onAction || null;
    configureShortcut(toastEl.querySelector("[data-toast-close]"), settings.closeShortcut);
    toastEl.hidden = false;
    window.dispatchEvent(new CustomEvent("app:shortcutcontrols"));
    requestAnimationFrame(function () { toastEl.classList.add("visible"); });
    clearTimeout(toastTimer);
    if (settings.duration > 0) toastTimer = window.setTimeout(hideToast, settings.duration);
  }

  function hideToast() {
    const toastEl = document.querySelector("#appToast");
    if (!toastEl) return;
    toastEl.classList.remove("visible");
    window.setTimeout(function () { if (!toastEl.classList.contains("visible")) toastEl.hidden = true; }, 180);
  }

  function setLoading(visible, label) {
    const overlay = document.querySelector("#loadingOverlay");
    if (!overlay) return;
    overlay.hidden = !visible;
    overlay.querySelector("[data-loading-label]").textContent = label || "Working…";
  }

  function closePopover(options) {
    if (!activePopover) return;
    const current = activePopover;
    activePopover = null;
    current.popover.hidden = true;
    current.anchor.setAttribute("aria-expanded", "false");
    if (!options || options.restoreFocus !== false) current.anchor.focus({ preventScroll: true });
  }

  function positionPopover(anchor, popover) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(popover.offsetWidth || 280, window.innerWidth - 16);
    const height = popover.offsetHeight || 200;
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    if (top + height > window.innerHeight - 8 && rect.top > height + 16) top = rect.top - height - 8;
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    popover.style.left = Math.round(left) + "px";
    popover.style.top = Math.round(top) + "px";
    popover.style.maxWidth = width + "px";
    popover.style.maxHeight = Math.max(120, window.innerHeight - 16) + "px";
  }

  function openMenu(anchorValue, items, options) {
    const anchor = element(anchorValue);
    const popover = document.querySelector("#globalPopover");
    if (!anchor || !popover) return;
    if (activePopover) closePopover({ restoreFocus: false });
    popover.innerHTML = "";
    popover.setAttribute("role", "menu");
    (items || []).forEach(function (item) {
      if (item.separator) {
        const separator = document.createElement("hr");
        separator.setAttribute("role", "separator");
        popover.appendChild(separator);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.disabled = item.disabled === true;
      button.className = item.danger ? "danger-text" : "";
      button.dataset.menuValue = item.value || "";
      const icon = document.createElement("span");
      icon.className = "menu-icon";
      icon.setAttribute("aria-hidden", "true");
      if (item.symbol && window.LocalApp.icons) window.LocalApp.icons.set(icon, item.symbol);
      else icon.textContent = item.icon || "•";
      const label = document.createElement("span");
      label.textContent = item.label;
      button.append(icon, label);
      button.addEventListener("click", function () {
        closePopover({ restoreFocus: false });
        if (typeof item.action === "function") item.action();
      });
      popover.appendChild(button);
    });
    anchor.setAttribute("aria-expanded", "true");
    popover.hidden = false;
    activePopover = { anchor: anchor, popover: popover };
    requestAnimationFrame(function () {
      positionPopover(anchor, popover);
      const first = popover.querySelector("button:not([disabled])");
      if (options && options.focus && first) first.focus();
    });
  }

  function bindLongPress(target, callback, duration) {
    const node = element(target);
    if (!node) return function () {};
    let timer = 0;
    let startX = 0;
    let startY = 0;
    function cancel() { clearTimeout(timer); timer = 0; }
    function down(event) {
      if (event.pointerType === "mouse") return;
      startX = event.clientX;
      startY = event.clientY;
      cancel();
      timer = window.setTimeout(function () {
        timer = 0;
        callback(event);
      }, duration || 520);
    }
    function move(event) {
      if (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10) cancel();
    }
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) { node.addEventListener(name, cancel); });
    return cancel;
  }

  function init() {
    document.querySelectorAll("dialog").forEach(function (dialog) {
      dialog.addEventListener("close", handleDialogClose);
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog && dialog.dataset.backdropClose !== "false") dialog.close("cancel");
      });
    });
    document.addEventListener("click", function (event) {
      const closeButton = event.target.closest("[data-close-dialog]");
      if (closeButton) closeDialog("#" + closeButton.dataset.closeDialog, "cancel");
      if (activePopover && !activePopover.popover.contains(event.target) && !activePopover.anchor.contains(event.target)) closePopover({ restoreFocus: false });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !activePopover) {
        const dialogs = Array.from(document.querySelectorAll("dialog[open]"));
        const dialog = dialogs[dialogs.length - 1];
        if (dialog && dialog.id !== "confirmDialog" && dialog.id !== "choiceDialog") {
          event.preventDefault();
          closeDialog(dialog, "cancel");
        }
        return;
      }
      if (!activePopover) return;
      const buttons = Array.from(activePopover.popover.querySelectorAll("button:not([disabled])"));
      const index = buttons.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closePopover();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        buttons[(index + delta + buttons.length) % buttons.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault(); buttons[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault(); buttons[buttons.length - 1]?.focus();
      }
    });
    window.addEventListener("resize", function () { if (activePopover) positionPopover(activePopover.anchor, activePopover.popover); });
    window.addEventListener("scroll", function () { if (activePopover) positionPopover(activePopover.anchor, activePopover.popover); }, true);

    document.querySelector("[data-confirm-action]").addEventListener("click", function () {
      const resolve = confirmResolve; confirmResolve = null; closeDialog("#confirmDialog", "confirm"); if (resolve) resolve(true);
    });
    document.querySelector("[data-confirm-cancel]").addEventListener("click", function () {
      const resolve = confirmResolve; confirmResolve = null; closeDialog("#confirmDialog", "cancel"); if (resolve) resolve(false);
    });
    document.querySelector("#confirmDialog").addEventListener("cancel", function () {
      const resolve = confirmResolve; confirmResolve = null; if (resolve) resolve(false);
    });
    document.querySelector("[data-choice-actions]").addEventListener("click", function (event) {
      const button = event.target.closest("[data-choice-value]");
      if (!button) return;
      const resolve = choiceResolve; choiceResolve = null; closeDialog("#choiceDialog", button.dataset.choiceValue); if (resolve) resolve(button.dataset.choiceValue);
    });
    document.querySelector("[data-choice-cancel]").addEventListener("click", function () {
      const resolve = choiceResolve; choiceResolve = null; closeDialog("#choiceDialog", "cancel"); if (resolve) resolve("cancel");
    });
    document.querySelector("#choiceDialog").addEventListener("cancel", function () {
      const resolve = choiceResolve; choiceResolve = null; if (resolve) resolve("cancel");
    });
    document.querySelector("[data-toast-close]").addEventListener("click", hideToast);
  }

  App.components = {
    init: init,
    openDialog: openDialog,
    closeDialog: closeDialog,
    confirm: confirm,
    choose: choose,
    message: message,
    toast: toast,
    hideToast: hideToast,
    setLoading: setLoading,
    openMenu: openMenu,
    closePopover: closePopover,
    bindLongPress: bindLongPress
  };
})();
