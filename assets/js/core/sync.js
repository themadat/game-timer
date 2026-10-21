(function () {
  "use strict";

  const App = window.LocalApp;
  const config = App.config;
  const u = App.utils;
  const model = App.stateModel;
  const storage = App.storage;
  // The state presentation is shared by the floating control and Settings.
  // Reconciliation (which copy changed) stays separate from work actually in progress.
  const STATE_PRESENTATIONS = Object.freeze({
    idle: { symbol: "icloud", kind: "neutral", title: "Cloud Sync", message: "Optional synchronization with GitHub.", animation: "none" },
    upToDate: { symbol: "checkmark.icloud", kind: "success", title: "Up to Date", message: "This device is fully synchronized with GitHub.", animation: "none" },
    syncing: { symbol: "arrow.trianglehead.2.clockwise.rotate.90.icloud", kind: "info", title: "Syncing…", message: "Comparing this device with GitHub.", animation: "rotate" },
    uploading: { symbol: "icloud.and.arrow.up", kind: "info", title: "Uploading…", message: "Sending this device’s data to GitHub.", animation: "none" },
    downloading: { symbol: "icloud.and.arrow.down", kind: "info", title: "Downloading…", message: "Retrieving the GitHub copy for this device.", animation: "none" },
    pending: { symbol: "icloud.dashed", kind: "neutral", title: "Waiting to Sync", message: "Changes are queued for the next sync.", animation: "none" },
    disabled: { symbol: "icloud.slash", kind: "neutral", title: "Sync Disabled", message: "Sync is disabled. Local data stays on this device.", animation: "none", primaryAction: "settings" },
    offline: { symbol: "icloud.slash", kind: "neutral", title: "Offline", message: "Reconnect before syncing. Local data remains available.", animation: "none", primaryAction: "settings" },
    warning: { symbol: "exclamationmark.icloud", kind: "warning", title: "Sync Needs Attention", message: "Review the sync connection or choose which copy to use.", animation: "none" },
    failed: { symbol: "xmark.icloud", kind: "danger", title: "Sync Failed", message: "The sync attempt failed. Retry or review the connection.", animation: "none" },
    authenticationRequired: { symbol: "key.icloud", kind: "warning", title: "Sign In Required", message: "Enter or renew the GitHub access token in Settings.", animation: "none", primaryAction: "settings" },
    permissionDenied: { symbol: "lock.icloud", kind: "warning", title: "Access Required", message: "Grant the token Contents read and write access to the configured repository.", animation: "none", primaryAction: "settings" },
    connected: { symbol: "link.icloud", kind: "info", title: "Connected", message: "The GitHub connection is configured. Sync to compare copies.", animation: "none" },
    shared: { symbol: "person.icloud", kind: "info", title: "Shared", message: "This resource is associated with another user or account.", animation: "none" }
  });
  const CloudSyncState = Object.freeze(Object.fromEntries(Object.keys(STATE_PRESENTATIONS).map(function (name) {
    Object.freeze(STATE_PRESENTATIONS[name]);
    return [name, name];
  })));
  const ACTIONS = Object.freeze({
    syncNow: Object.freeze({ symbol: "arrow.trianglehead.clockwise.icloud", title: "Sync Now", help: "Compare copies and sync changes with GitHub." }),
    restore: Object.freeze({ symbol: "arrow.trianglehead.counterclockwise.icloud", title: "Restore from Cloud", help: "Replace this device with the GitHub copy after confirmation and a recovery backup." }),
    settings: Object.freeze({ symbol: "support", title: "Sync Settings", help: "Open storage and GitHub Sync settings." })
  });

  function presentation(state, options) {
    const value = STATE_PRESENTATIONS[state] || STATE_PRESENTATIONS.idle;
    const kind = state === CloudSyncState.permissionDenied && options?.hardDenial ? "danger" : value.kind;
    return Object.assign({}, value, {
      kind: kind,
      accessibilityLabel: value.title,
      help: value.title + ". " + value.message,
      primaryAction: value.primaryAction || "syncNow"
    });
  }

  const runtime = {
    busy: false,
    operation: "",
    checking: false,
    remoteSha: "",
    remoteHash: "",
    remoteState: null, remoteNeedsRewrite: false,
    remoteMissing: false,
    checkedAt: "",
    error: "",
    errorState: "",
    deciding: false,
    offline: navigator.onLine === false,
    requestSequence: 0,
    controller: null
  };

  function emit() {
    window.dispatchEvent(new CustomEvent("app:syncchange", { detail: { info: getInfo() } }));
  }

  function settings() {
    return storage.getState().modules.cloudSync;
  }

  function target(cloud) {
    const value = cloud || settings();
    return [value.owner, value.repo, value.branch, value.path].join("/");
  }

  function configured() {
    const cloud = settings();
    return Boolean(cloud.enabled && cloud.owner && cloud.repo && cloud.branch && cloud.path && storage.hasSecret());
  }

  function validateConfiguration(input, token) {
    const source = u.plainObject(input);
    const next = {
      owner: u.cleanLine(source.owner, 39),
      repo: u.cleanLine(source.repo, 100).replace(/\.git$/i, ""),
      branch: u.cleanLine(source.branch || "main", 250) || "main",
      path: u.cleanLine(source.path || "data/workspace.json", 500).replace(/^\/+/, "")
    };
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(next.owner)) throw new Error("Enter a valid GitHub owner or organization.");
    if (!/^[A-Za-z0-9._-]+$/.test(next.repo)) throw new Error("Enter a valid repository name.");
    if (!next.branch || /[\u0000-\u001f\u007f ~^:?*\[]/.test(next.branch) || next.branch.includes("..")) throw new Error("Enter a valid branch name.");
    const pathParts = next.path.split("/");
    if (!next.path || pathParts.some(function (part) { return !part || part === "." || part === ".."; }) || !/\.json$/i.test(next.path)) throw new Error("Enter a safe JSON data-file path.");
    if (!token && !storage.hasSecret()) throw new Error("Enter a fine-grained GitHub access token.");
    return next;
  }

  function saveConfiguration(input) {
    const token = u.cleanLine(input.token, 500);
    const next = validateConfiguration(input, token);
    const rememberToken = input.rememberToken !== false;
    const secret = token || storage.getSecret();
    const previousTarget = target();
    if (!storage.setSecret(secret, rememberToken)) throw new Error("This browser could not store the GitHub token.");
    storage.mutate(function (state) {
      const cloud = state.modules.cloudSync;
      cloud.owner = next.owner;
      cloud.repo = next.repo;
      cloud.branch = next.branch;
      cloud.path = next.path;
      cloud.rememberToken = rememberToken;
      cloud.enabled = true;
      if (previousTarget !== target(cloud)) {
        cloud.autoSyncReady = false;
        cloud.baselineTarget = "";
        cloud.baselineSha = "";
        cloud.baselineHash = "";
        cloud.lastSyncedAt = "";
        cloud.lastCheckedAt = "";
      }
    }, { reason: "sync-settings" });
    resetRuntime();
    emit();
    return next;
  }

  function resetRuntime() {
    if (runtime.controller) runtime.controller.abort();
    Object.assign(runtime, {
      busy: false,
      operation: "",
      checking: false,
      remoteSha: "",
      remoteHash: "",
      remoteState: null, remoteNeedsRewrite: false,
      remoteMissing: false,
      checkedAt: "",
      error: "",
      errorState: "",
      deciding: false,
      offline: navigator.onLine === false,
      requestSequence: runtime.requestSequence + 1,
      controller: null
    });
  }

  function apiRepositoryUrl(cloud) {
    return "https://api.github.com/repos/" + encodeURIComponent(cloud.owner) + "/" + encodeURIComponent(cloud.repo);
  }

  function apiContentsUrl(cloud) {
    return apiRepositoryUrl(cloud) + "/contents/" + cloud.path.split("/").map(encodeURIComponent).join("/");
  }

  function headers(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  async function responseError(response) {
    let detail = "";
    try { detail = u.cleanLine((await response.json()).message, 300); } catch (error) { detail = ""; }
    const failure = function (message, state) { return Object.assign(new Error(message), { syncState: state }); };
    if (response.status === 401) return failure("GitHub rejected the token. Create a new fine-grained token and try again.", CloudSyncState.authenticationRequired);
    if (response.status === 429 || (response.status === 403 && /rate limit|abuse|secondary rate/i.test(detail))) return failure("GitHub is limiting requests. Wait before trying again.", CloudSyncState.warning);
    if (response.status === 403) return failure("GitHub denied access. Confirm that the token has Contents read and write permission.", CloudSyncState.permissionDenied);
    if (response.status === 404) return failure("GitHub could not find the repository or branch, or the token cannot access it.", CloudSyncState.warning);
    if (response.status === 409 || response.status === 422) return failure("The GitHub copy changed while syncing. Check again before choosing a copy.", CloudSyncState.warning);
    return failure(detail ? "GitHub: " + detail : "GitHub request failed (" + response.status + ").", CloudSyncState.failed);
  }

  function requestContext(operation) {
    if (runtime.controller) runtime.controller.abort();
    runtime.requestSequence += 1;
    runtime.controller = typeof AbortController === "function" ? new AbortController() : null;
    runtime.operation = operation || "checking";
    return { sequence: runtime.requestSequence, signal: runtime.controller ? runtime.controller.signal : undefined };
  }

  function currentRequest(context) {
    return context.sequence === runtime.requestSequence;
  }

  function networkError(error) {
    return navigator.onLine === false || /failed to fetch|network|load failed/i.test(String(error && error.message || error));
  }

  function recordError(error, fallback) {
    runtime.error = error.message || fallback;
    runtime.errorState = error.syncState || CloudSyncState.failed;
    runtime.offline = networkError(error);
  }

  async function verifyTarget(cloud, token, context) {
    const repositoryUrl = apiRepositoryUrl(cloud);
    const repository = await fetch(repositoryUrl, { headers: headers(token), signal: context.signal });
    if (!repository.ok) throw await responseError(repository);
    const branch = await fetch(repositoryUrl + "/branches/" + encodeURIComponent(cloud.branch), { headers: headers(token), signal: context.signal });
    if (!branch.ok) throw await responseError(branch);
  }

  async function readRemote(cloud, token, context, allowMissing) {
    const response = await fetch(apiContentsUrl(cloud) + "?ref=" + encodeURIComponent(cloud.branch), { headers: headers(token), signal: context.signal, cache: "no-store" });
    if (response.status === 404 && allowMissing) return null;
    if (!response.ok) throw await responseError(response);
    const file = await response.json();
    if (!file || file.type !== "file" || typeof file.content !== "string" || typeof file.sha !== "string") throw new Error("The configured GitHub path is not a readable file.");
    let decoded;
    if (!file.content && file.size > 0) {
      // GitHub omits base64 content for files over 1 MB; request the raw file instead.
      const raw = await fetch(apiContentsUrl(cloud) + "?ref=" + encodeURIComponent(cloud.branch), { headers: Object.assign({}, headers(token), { Accept: "application/vnd.github.raw+json" }), signal: context.signal, cache: "no-store" });
      if (!raw.ok) throw await responseError(raw);
      decoded = await raw.text();
    } else {
      try {
        const binary = atob(file.content.replace(/\s/g, ""));
        decoded = new TextDecoder().decode(Uint8Array.from(binary, function (character) { return character.charCodeAt(0); }));
      } catch (error) {
        throw new Error("The GitHub file could not be decoded.");
      }
    }
    let parsed;
    try { parsed = JSON.parse(decoded); } catch (error) { throw new Error("The GitHub data file is not valid JSON."); }
    const prepared = model.prepareSync(parsed);
    return { state: prepared.state, sha: file.sha, needsRewrite: prepared.legacy || u.stableJson(parsed) !== u.stableJson(model.syncPayload(prepared.state)) };
  }

  function utf8Base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 32768));
    return btoa(binary);
  }

  function payloadJson(state) {
    // Long histories are stored compactly to stay well under GitHub's file limits.
    const payload = model.syncPayload(state);
    const pretty = JSON.stringify(payload, null, 2);
    return pretty.length > 400000 ? JSON.stringify(payload) : pretty;
  }

  async function writeRemote(cloud, token, context, state, sha) {
    const body = {
      message: "Update " + config.identity.shortName + " data (v" + config.identity.version + ")",
      content: utf8Base64(payloadJson(state)),
      branch: cloud.branch
    };
    if (sha) body.sha = sha;
    const response = await fetch(apiContentsUrl(cloud), {
      method: "PUT",
      headers: Object.assign({}, headers(token), { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: context.signal
    });
    if (!response.ok) throw await responseError(response);
    const result = await response.json();
    return result && result.content && result.content.sha ? result.content.sha : sha;
  }

  function localHash() {
    return model.syncHash(storage.getState());
  }

  function rememberBaseline(sha, hash, established) {
    const now = u.isoNow();
    storage.mutate(function (state) {
      const cloud = state.modules.cloudSync;
      if (established) cloud.autoSyncReady = true;
      cloud.baselineTarget = target(cloud);
      cloud.baselineSha = sha || "";
      cloud.baselineHash = hash || localHash();
      cloud.lastSyncedAt = now;
      cloud.lastCheckedAt = now;
    }, { touch: false, reason: "sync-baseline" });
    Object.assign(runtime, { remoteSha: sha || "", remoteHash: hash || localHash(), checkedAt: now, error: "", errorState: "", remoteMissing: false, offline: false });
  }

  function reconciliation() {
    const cloud = settings();
    const hash = localHash();
    const baselineMatchesTarget = cloud.baselineTarget === target(cloud) && cloud.baselineHash.startsWith("data-v1:");
    if (runtime.remoteMissing) return baselineMatchesTarget ? "local" : "first-sync";
    if (!runtime.remoteSha || !runtime.remoteHash) return baselineMatchesTarget && hash !== cloud.baselineHash ? "local" : "unknown";
    if (hash === runtime.remoteHash) return "current";
    if (!baselineMatchesTarget) return "first-sync";
    const localChanged = hash !== cloud.baselineHash;
    const remoteChanged = runtime.remoteHash !== cloud.baselineHash;
    if (localChanged && remoteChanged) return "conflict";
    if (localChanged) return "local";
    if (remoteChanged) return "remote";
    return "conflict";
  }

  function cloudState(change) {
    if (!config.features.cloudSync || !settings().enabled) return CloudSyncState.disabled;
    if (runtime.offline || navigator.onLine === false) return CloudSyncState.offline;
    if (runtime.busy) return runtime.operation === "uploading" ? CloudSyncState.uploading : runtime.operation === "downloading" ? CloudSyncState.downloading : CloudSyncState.syncing;
    if (runtime.checking) return CloudSyncState.syncing;
    if (runtime.error) return runtime.errorState || CloudSyncState.failed;
    if (!configured()) return CloudSyncState.authenticationRequired;
    if (change === "current") return CloudSyncState.upToDate;
    if (change === "local" || change === "remote" || runtime.remoteMissing) return CloudSyncState.pending;
    if (change === "first-sync" || change === "conflict") return CloudSyncState.warning;
    return CloudSyncState.connected;
  }

  function copyComparisonText() {
    if (!runtime.remoteState) return "The remote file has not been created yet.";
    return "This device and GitHub contain different saved content.";
  }

  function getInfo() {
    const change = reconciliation();
    const state = cloudState(change);
    const info = presentation(state);
    const details = {
      local: "This device has changes ready to upload.",
      remote: "GitHub has changes ready to download.",
      "first-sync": runtime.remoteMissing ? "Sync Now will create the GitHub data file after you confirm." : "Choose which copy should start this sync connection.",
      conflict: "This device and GitHub both changed. Sync Now lets you choose or merge copies."
    };
    if (runtime.error && state !== CloudSyncState.offline) info.message = runtime.error;
    else if (state === CloudSyncState.pending || state === CloudSyncState.warning) info.message = details[change] || info.message;
    const busy = runtime.busy || runtime.checking || runtime.deciding;
    info.help = info.title + ". " + info.message;
    return Object.assign(info, {
      state: state, change: change, checkedAt: runtime.checkedAt || settings().lastCheckedAt,
      busy: busy, newer: copyComparisonText(), action: ACTIONS[info.primaryAction].title,
      canSync: !busy && info.primaryAction === "syncNow" && configured(),
      canRestore: !busy && info.primaryAction === "syncNow" && configured() && !runtime.remoteMissing
    });
  }

  async function check(force) {
    if (!configured() || runtime.busy || runtime.checking || runtime.deciding) { emit(); return getInfo(); }
    if (navigator.onLine === false) { runtime.offline = true; emit(); return getInfo(); }
    const last = Date.parse(runtime.checkedAt || "");
    if (!force && Number.isFinite(last) && Date.now() - last < config.controls.syncCheckIntervalMs) return getInfo();
    runtime.checking = true;
    runtime.error = "";
    runtime.offline = false;
    emit();
    const context = requestContext("checking");
    const cloud = settings();
    try {
      const remote = await readRemote(cloud, storage.getSecret(), context, true);
      if (!currentRequest(context)) return getInfo();
      const checkedAt = u.isoNow();
      if (remote) {
        runtime.remoteSha = remote.sha;
        runtime.remoteState = remote.state;
        runtime.remoteHash = model.syncHash(remote.state);
        runtime.remoteNeedsRewrite = remote.needsRewrite;
        runtime.remoteMissing = false;
      } else {
        runtime.remoteSha = "";
        runtime.remoteState = null;
        runtime.remoteNeedsRewrite = false;
        runtime.remoteHash = "";
        runtime.remoteMissing = true;
      }
      // Equal content establishes a baseline even after an upgrade or first check.
      // An unchanged legacy SHA also identifies the old baseline's actual content.
      if (remote && (localHash() === runtime.remoteHash
        || (cloud.baselineTarget === target(cloud) && cloud.baselineSha === remote.sha && !cloud.baselineHash.startsWith("data-v1:")))) {
        if (cloud.baselineTarget !== target(cloud) || cloud.baselineHash !== runtime.remoteHash || cloud.baselineSha !== remote.sha) rememberBaseline(remote.sha, runtime.remoteHash);
      }
      runtime.checkedAt = checkedAt;
      storage.mutate(function (state) { state.modules.cloudSync.lastCheckedAt = checkedAt; }, { touch: false, reason: "sync-check" });
    } catch (error) {
      if (!currentRequest(context) || error && error.name === "AbortError") return getInfo();
      recordError(error, "Could not check GitHub.");
      runtime.checkedAt = u.isoNow();
    } finally {
      if (currentRequest(context)) {
        runtime.checking = false;
        runtime.operation = "";
        emit();
      }
    }
    return getInfo();
  }

  async function testConnection(input) {
    if (getInfo().busy) return null;
    const tokenInput = u.cleanLine(input.token, 500);
    const cloud = validateConfiguration(input, tokenInput);
    const token = tokenInput || storage.getSecret();
    const rememberToken = input.rememberToken !== false;
    const context = requestContext("checking");
    runtime.checking = true;
    runtime.error = "";
    runtime.offline = navigator.onLine === false;
    emit();
    try {
      await verifyTarget(cloud, token, context);
      const remote = await readRemote(cloud, token, context, true);
      if (!currentRequest(context)) return null;
      if (!storage.setSecret(token, rememberToken)) throw new Error("Connection succeeded, but this browser could not store the token.");
      storage.mutate(function (state) {
        state.modules.cloudSync.rememberToken = rememberToken;
        state.modules.cloudSync.enabled = true;
      }, { touch: false, reason: "sync-token-tested" });
      // A successful test establishes a connection; a sync check compares the copies.
      Object.assign(runtime, { remoteSha: "", remoteHash: "", remoteState: null, remoteNeedsRewrite: false, remoteMissing: false, checkedAt: "", errorState: "", offline: false });
      const storedMessage = rememberToken ? " The token is stored on this device." : " The token is stored for this browser tab.";
      return { ok: true, remoteExists: Boolean(remote), message: (remote ? "Connection succeeded and the data file is readable." : "Connection succeeded. The data file will be created on first upload.") + storedMessage };
    } catch (error) {
      if (!currentRequest(context) || error && error.name === "AbortError") return null;
      recordError(error, "Connection test failed.");
      throw error;
    } finally {
      if (currentRequest(context)) { runtime.checking = false; runtime.operation = ""; emit(); }
    }
  }

  async function performUpload(quiet) {
    const context = requestContext("uploading");
    runtime.busy = true;
    runtime.operation = "uploading";
    runtime.error = "";
    emit();
    try {
      const state = model.normalize(u.clone(storage.getState()));
      const hash = model.syncHash(state);
      const sha = await writeRemote(settings(), storage.getSecret(), context, state, runtime.remoteSha);
      if (!currentRequest(context)) return false;
      rememberBaseline(sha, hash, true);
      runtime.remoteState = state;
      runtime.remoteNeedsRewrite = false;
      if (!quiet) App.components.toast("This device’s latest data is now on GitHub.", { title: "Sync complete", kind: "success" });
      return true;
    } catch (error) {
      if (!currentRequest(context) || error && error.name === "AbortError") return false;
      recordError(error, "Upload failed.");
      const info = presentation(runtime.offline ? CloudSyncState.offline : runtime.errorState);
      if (!quiet) App.components.toast(runtime.error, { title: info.title, kind: info.kind, duration: 6000 });
      return false;
    } finally {
      if (currentRequest(context)) { runtime.busy = false; runtime.operation = ""; emit(); }
    }
  }

  async function performDownload(quiet) {
    if (!runtime.remoteState) throw new Error("No remote data is available to download.");
    const context = requestContext("downloading");
    runtime.busy = true;
    runtime.operation = "downloading";
    runtime.error = "";
    emit();
    try {
      const next = model.applySync(storage.getState(), runtime.remoteState);
      if (!storage.saveRecovery("Before downloading GitHub data")) throw new Error("The local recovery copy could not be saved. Export a backup before restoring from cloud.");
      storage.replace(next, { saveRecovery: false, reason: "sync-download", touch: false });
      rememberBaseline(runtime.remoteSha, runtime.remoteHash, true);
      if (!quiet) App.components.toast("This device now uses the GitHub copy. The previous local copy is recoverable in Developer Tools.", { title: "Sync complete", kind: "success", duration: 5000 });
      return true;
    } catch (error) {
      recordError(error, "Download failed.");
      if (!quiet) App.components.toast(runtime.error, { title: "Sync Failed", kind: "danger", duration: 6000 });
      return false;
    } finally {
      if (currentRequest(context)) { runtime.busy = false; runtime.operation = ""; emit(); }
    }
  }

  async function performMerge() {
    if (!runtime.remoteState) return performUpload();
    try {
      const merged = model.merge(storage.getState(), runtime.remoteState);
      if (!storage.saveRecovery("Before merging GitHub data")) throw new Error("The local recovery copy could not be saved. Export a backup before merging.");
      storage.replace(merged, { saveRecovery: false, reason: "sync-merge", touch: false });
    } catch (error) {
      recordError(error, "Merge failed.");
      App.components.toast(runtime.error, { title: "Sync Failed", kind: "danger", duration: 6000 });
      emit();
      return false;
    }
    return performUpload();
  }

  async function syncNow(trigger) {
    const info = getInfo();
    if (info.busy) return;
    if (!configured() || info.primaryAction === "settings") {
      window.dispatchEvent(new CustomEvent("app:opensyncsettings", { detail: { trigger: trigger } }));
      return;
    }
    await check(true);
    if (runtime.error || runtime.offline || !configured() || getInfo().busy) return;
    const state = reconciliation();
    if (state === "current") {
      if (runtime.remoteNeedsRewrite) return performUpload();
      rememberBaseline(runtime.remoteSha, runtime.remoteHash, true);
      App.components.toast("This device already matches GitHub.", { title: "Up to date", kind: "success" });
      return;
    }
    if (state === "local") return performUpload();
    if (state === "remote") return performDownload();
    if (state === "first-sync" || state === "conflict") {
      const choices = runtime.remoteMissing
        ? [{ value: "upload", symbol: STATE_PRESENTATIONS.uploading.symbol, label: "Upload this device", description: "Create the GitHub data file from this device.", kind: "primary" }]
        : [
            ...(model.canMerge(storage.getState(), runtime.remoteState) ? [{ value: "merge", symbol: "link.icloud", label: "Merge both copies", description: "Combine matching or separate items, keeping content present in either copy.", kind: "primary" }] : []),
            { value: "upload", symbol: STATE_PRESENTATIONS.uploading.symbol, label: "Upload this device", description: "Replace the GitHub copy with this device.", kind: "secondary" },
            { value: "download", symbol: STATE_PRESENTATIONS.downloading.symbol, label: "Download GitHub", description: "Replace saved content after making a recovery copy; keep this device’s settings.", kind: "secondary" }
          ];
      const sequence = runtime.requestSequence;
      runtime.deciding = true;
      emit();
      let choice;
      try {
        choice = await App.components.choose({
          title: state === "conflict" ? "Resolve sync conflict" : "Choose the first sync copy",
          message: getInfo().newer + " Nothing will be overwritten until you choose.",
          choices: choices,
          cancelLabel: "Cancel sync",
          trigger: trigger
        });
      } finally { runtime.deciding = false; emit(); }
      if (sequence !== runtime.requestSequence || navigator.onLine === false || !configured()) return;
      if (choice === "upload") return performUpload();
      if (choice === "download") return performDownload();
      if (choice === "merge") return performMerge();
    }
  }

  async function restoreFromCloud(trigger) {
    if (!getInfo().canRestore) return;
    await check(true);
    if (runtime.error || runtime.offline || !configured() || getInfo().busy) return;
    if (!runtime.remoteState) {
      App.components.message("No cloud copy", "There is no GitHub data file to restore. Use Sync Now to create one.", { trigger: trigger });
      return;
    }
    const sequence = runtime.requestSequence;
    runtime.deciding = true;
    emit();
    let accepted;
    try {
      accepted = await App.components.confirm({
        title: "Restore from Cloud?",
        message: "Replace this device’s saved content with the GitHub copy? Device settings stay as they are. Your current local copy will be saved for recovery in Developer Tools.",
        confirmLabel: ACTIONS.restore.title, cancelLabel: "Keep this device", danger: true, trigger: trigger
      });
    } finally { runtime.deciding = false; emit(); }
    if (accepted && sequence === runtime.requestSequence && navigator.onLine !== false && configured()) return performDownload();
  }

  async function forget() {
    storage.clearSecret();
    storage.mutate(function (state) {
      state.modules.cloudSync = model.createDefaultState({ demo: false }).modules.cloudSync;
    }, { reason: "sync-forget" });
    resetRuntime();
    emit();
  }

  let autoTimer = 0, autoFailures = 0, autoRunning = false;

  function autoEligible() {
    const cloud = settings();
    return config.features.cloudSync && configured() && cloud.autoSync && cloud.autoSyncReady
      && cloud.baselineTarget === target() && cloud.baselineHash.startsWith("data-v1:")
      && navigator.onLine !== false && document.visibilityState !== "hidden";
  }

  async function autoSync() {
    if (!autoEligible() || autoRunning || getInfo().busy) return false;
    autoRunning = true;
    try {
      if (storage.saveNow && !storage.saveNow()) {
        recordError(new Error("Local changes could not be saved. Resolve device storage before syncing."));
        emit();
        return false;
      }
      await check(true);
      if (!autoEligible() || runtime.error || getInfo().busy) return false;
      // Missing files and conflicting edits always need an explicit manual decision.
      if (runtime.remoteMissing) return false;
      const change = reconciliation();
      if (change === "local") {
        if (storage.saveNow && !storage.saveNow()) {
          recordError(new Error("Local changes could not be saved. Resolve device storage before syncing."));
          emit();
          return false;
        }
        return await performUpload(true);
      }
      if (change === "remote") return await performDownload(true);
      return change === "current";
    } finally {
      autoRunning = false;
      autoFailures = runtime.error ? Math.min(autoFailures + 1, 6) : 0;
      if (autoEligible() && (runtime.error || reconciliation() === "local" && !runtime.remoteMissing)) scheduleAuto();
    }
  }

  function scheduleAuto() {
    if (autoTimer) window.clearTimeout(autoTimer);
    autoTimer = 0;
    if (!autoEligible()) return;
    autoTimer = window.setTimeout(async function () {
      autoTimer = 0;
      const run = function () { return autoSync(); };
      if (navigator.locks && navigator.locks.request) {
        await navigator.locks.request("game-timer-sync-" + target(), run);
      } else await run();
    }, Math.min(60000, 1200 * Math.pow(2, autoFailures)));
  }

  function init() {
    const refresh = function () { if (settings().autoSync) { if (!autoTimer) scheduleAuto(); } else check(false); };
    window.addEventListener("online", function () {
      runtime.offline = false;
      runtime.error = "";
      emit();
      if (settings().autoSync) scheduleAuto(); else check(true);
    });
    window.addEventListener("offline", function () { runtime.offline = true; scheduleAuto(); emit(); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refresh(); else scheduleAuto();
    });
    window.setInterval(function () { if (document.visibilityState !== "hidden") refresh(); }, config.controls.syncCheckIntervalMs);
    window.addEventListener("app:statechange", function (event) {
      if (!["sync-baseline", "sync-check", "sync-merge", "sync-download"].includes(event.detail.reason)) scheduleAuto();
    });
    window.setTimeout(refresh, 700);
    emit();
  }

  App.sync = {
    CloudSyncState: CloudSyncState,
    presentation: presentation,
    actions: ACTIONS,
    init: init,
    getInfo: getInfo,
    configured: configured,
    saveConfiguration: saveConfiguration,
    testConnection: testConnection,
    check: check,
    syncNow: syncNow,
    autoSync: autoSync,
    restoreFromCloud: restoreFromCloud,
    forget: forget
  };
})();
