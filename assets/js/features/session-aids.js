/* Table aids for a running session: screen wake lock, turn chimes, vibration, and long-turn warnings. */
(function () {
  "use strict";

  const App = window.LocalApp;
  const storage = App.storage;

  const TONES = {
    turn: [[660, 0, 0.12], [880, 0.09, 0.16]],
    start: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.22]],
    pause: [[440, 0, 0.18]],
    resume: [[440, 0, 0.1], [660, 0.08, 0.14]],
    end: [[784, 0, 0.14], [659, 0.12, 0.14], [523, 0.24, 0.3]],
    pick: [[988, 0, 0.1], [1319, 0.08, 0.18]],
    warning: [[880, 0, 0.16], [880, 0.24, 0.16], [880, 0.48, 0.24]]
  };
  const VIBRATIONS = { turn: 25, start: [30, 40, 30], pause: 40, resume: 25, end: [40, 60, 80], pick: 20, warning: [120, 80, 120, 80, 200], haptic: [30, 50, 30] };

  let audioContext = null;
  let wakeLock = null;
  let sessionActive = false;
  let warnedTurnKey = "";
  let currentTurnKey = "";

  function prefs() {
    return storage.getState().preferences.game;
  }

  function wakeLockSupported() {
    return "wakeLock" in navigator && typeof navigator.wakeLock?.request === "function";
  }

  function hapticsSupported() {
    return typeof navigator.vibrate === "function";
  }

  function wakeLockStatus() {
    return wakeLock && !wakeLock.released ? "Screen kept awake" : "";
  }

  function showWakeLockState() {
    document.querySelectorAll("[data-awake-chip]").forEach(chip => { chip.hidden = !wakeLockStatus(); });
  }

  async function acquireWakeLock() {
    if (!wakeLockSupported() || (wakeLock && !wakeLock.released) || document.visibilityState !== "visible") return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; showWakeLockState(); });
    } catch (error) {
      wakeLock = null;
    }
    showWakeLockState();
  }

  function releaseWakeLock() {
    if (wakeLock && !wakeLock.released) wakeLock.release().catch(() => {});
    wakeLock = null;
    showWakeLockState();
  }

  function refresh() {
    if (sessionActive && prefs().keepAwake) acquireWakeLock();
    else releaseWakeLock();
  }

  function setSessionActive(active) {
    if (sessionActive === active) {
      if (active && prefs().keepAwake && !wakeLock) acquireWakeLock();
      showWakeLockState();
      return;
    }
    sessionActive = active;
    showWakeLockState();
    if (!active) {
      warnedTurnKey = "";
      currentTurnKey = "";
    }
    refresh();
  }

  function userHasInteracted() {
    return !navigator.userActivation || navigator.userActivation.hasBeenActive;
  }

  function ensureAudio() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || !userHasInteracted()) return null;
    if (!audioContext) audioContext = new Context();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function playTone(kind) {
    const context = ensureAudio();
    if (!context) return;
    const now = context.currentTime + 0.02;
    (TONES[kind] || TONES.turn).forEach(([frequency, offset, length]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + length + 0.05);
    });
  }

  function vibrate(kind) {
    if (!hapticsSupported() || !userHasInteracted()) return;
    try { navigator.vibrate(VIBRATIONS[kind] || 25); } catch (error) { /* Vibration is optional. */ }
  }

  function cue(kind) {
    if (prefs().chime) playTone(kind);
    if (prefs().haptics) vibrate(kind);
  }

  function preview(kind) {
    if (kind === "haptic") { vibrate("haptic"); return; }
    playTone(kind);
    if (prefs().haptics) vibrate(kind);
  }

  function turnStarted(player) {
    currentTurnKey = player.id + ":" + Date.now();
    warnedTurnKey = "";
    cue("turn");
  }

  function thresholdMs() {
    return (prefs().longTurnSeconds || 0) * 1000;
  }

  function isOvertime(elapsed) {
    const limit = thresholdMs();
    return limit > 0 && elapsed >= limit;
  }

  function tick(elapsed) {
    const overtime = isOvertime(elapsed);
    if (overtime && currentTurnKey && warnedTurnKey !== currentTurnKey) {
      warnedTurnKey = currentTurnKey;
      if (prefs().chime) playTone("warning");
      if (prefs().haptics) vibrate("warning");
      const status = document.querySelector("#assertiveStatus");
      if (status) status.textContent = "Long turn: over " + Math.round(thresholdMs() / 60000 * 10) / 10 + " minutes.";
    }
    return overtime;
  }

  function init() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
  }

  App.sessionAids = {
    init,
    refresh,
    setSessionActive,
    wakeLockSupported,
    hapticsSupported,
    wakeLockStatus,
    cue,
    preview,
    turnStarted,
    tick,
    isOvertime
  };
})();
