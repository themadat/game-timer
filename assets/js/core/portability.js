(function () {
  "use strict";

  const App = window.LocalApp;
  const config = App.config;
  const u = App.utils;
  const model = App.stateModel;
  const storage = App.storage;
  let pendingImport = null;

  function summaryFor(state, migrations) {
    const categories = new Set(state.workspace.records.map(function (record) { return record.category; }));
    return {
      workspaceTitle: state.workspace.title,
      records: state.workspace.records.length,
      documents: state.workspace.documents.length,
      history: (state.workspace.history || []).length,
      ownedGames: Object.keys((state.workspace.library || {}).games || {}).filter(function (id) { return state.workspace.library.games[id].owned; }).length,
      people: (state.workspace.people || []).length,
      categories: categories.size,
      schemaVersion: state.schemaVersion,
      appVersion: state.meta.appVersion,
      updatedAt: state.meta.updatedAt,
      migrations: migrations || []
    };
  }

  function exportJson() {
    storage.saveNow();
    const envelope = model.exportEnvelope(storage.getState());
    const json = JSON.stringify(envelope, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = config.identity.shortName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
    link.href = url;
    link.download = slug + "-backup-" + new Date().toISOString().slice(0, 10) + "-v" + config.identity.version + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    App.components.toast("A complete JSON backup was created.", { title: "Backup exported", kind: "success" });
  }

  function readFile(file) {
    if (!file) return Promise.reject(new Error("No file was selected."));
    if (file.size > config.controls.maxImportBytes) return Promise.reject(new Error("That backup is larger than the " + u.formatBytes(config.controls.maxImportBytes) + " import limit."));
    return file.text ? file.text() : new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("The selected file could not be read.")); };
      reader.readAsText(file);
    });
  }

  function renderPreview(candidate, fileName) {
    const summary = summaryFor(candidate.state, candidate.migrations);
    const current = summaryFor(storage.getState(), []);
    document.querySelector("[data-import-file]").textContent = fileName || "Selected backup";
    document.querySelector("[data-import-workspace]").textContent = summary.history + " games (current: " + current.history + ")";
    document.querySelector("[data-import-documents]").textContent = summary.ownedGames + " owned · " + summary.people + " people (current: " + current.ownedGames + " owned · " + current.people + " people)";
    document.querySelector("[data-import-version]").textContent = "State v" + summary.schemaVersion + " · app v" + (summary.appVersion || "unknown");
    document.querySelector("[data-import-updated]").textContent = u.dateLabel(summary.updatedAt);
    const migrationRow = document.querySelector("[data-import-migrations-row]");
    migrationRow.hidden = summary.migrations.length === 0;
    document.querySelector("[data-import-migrations]").textContent = summary.migrations.length ? summary.migrations.join(", ") : "None";
    const warning = document.querySelector("[data-import-warning]");
    warning.hidden = candidate.validation.warnings.length === 0;
    warning.textContent = candidate.validation.warnings.join(" ");
  }

  async function previewFile(file, trigger) {
    try {
      App.components.setLoading(true, "Checking backup…");
      const text = await readFile(file);
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (error) { throw new Error("The selected file is not valid JSON."); }
      const candidate = model.prepare(parsed);
      pendingImport = candidate;
      renderPreview(candidate, file.name);
      App.components.openDialog("#importPreviewDialog", { trigger: trigger, focus: "[data-import-confirm]" });
    } catch (error) {
      pendingImport = null;
      App.components.message("Import unavailable", error.message || "That backup could not be used.", { trigger: trigger });
    } finally {
      App.components.setLoading(false);
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const accepted = await App.components.confirm({
      title: "Replace current data?",
      message: "The validated backup will replace game history, library, people, notes, and preferences. A recoverable copy of the current data will be saved first.",
      confirmLabel: "Replace data",
      cancelLabel: "Keep current data",
      danger: true,
      trigger: document.querySelector("[data-import-confirm]")
    });
    if (!accepted) return;
    const summary = summaryFor(pendingImport.state, pendingImport.migrations);
    storage.replace(pendingImport.state, { recoveryReason: "Before importing a backup", reason: "import" });
    pendingImport = null;
    App.components.closeDialog("#importPreviewDialog", "imported");
    App.components.toast("Imported " + summary.history + " saved games and " + summary.ownedGames + " owned games.", { title: "Backup restored", kind: "success" });
  }

  function init() {
    const input = document.querySelector("#importFileInput");
    if (input) input.addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      previewFile(file, document.activeElement);
      event.target.value = "";
    });
    document.querySelector("[data-import-confirm]")?.addEventListener("click", confirmImport);
    document.querySelector("#importPreviewDialog")?.addEventListener("close", function () {
      if (this.returnValue !== "imported") pendingImport = null;
    });
  }

  App.portability = {
    init: init,
    exportJson: exportJson,
    previewFile: previewFile,
    summaryFor: summaryFor
  };
})();
