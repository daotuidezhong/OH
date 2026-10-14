const { contextBridge, ipcRenderer } = require("electron");

function replaceApplicationCache(data) {
  try {
    const entries = Object.entries(data);
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("berry-")) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
    for (const [key, value] of entries) {
      if (key.startsWith("berry-") && typeof value === "string") window.localStorage.setItem(key, value);
    }
  } catch {
    // Disk storage remains authoritative when the optional browser cache is full or unavailable.
  }
}

function refreshStorageCache() {
  const data = ipcRenderer.sendSync("storage:snapshot");
  replaceApplicationCache(data);
  return data;
}

if (window.location.protocol === "berry:" && window.location.hostname === "game" && window.location.pathname === "/") {
  try {
    const legacyData = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("berry-")) legacyData[key] = window.localStorage.getItem(key);
    }
    replaceApplicationCache(ipcRenderer.sendSync("storage:initialize", legacyData));
  } catch {
    // Keep the bridge usable, and retry migration on a later launch if cache access failed.
  }
}

contextBridge.exposeInMainWorld("gameUpdater", {
  onStatus(callback) {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
  download: () => ipcRenderer.invoke("update:download"),
  install: () => ipcRenderer.send("update:install"),
  version: () => ipcRenderer.invoke("app:version"),
  storage: {
    load: (key) => ipcRenderer.sendSync("storage:load", key),
    save: (key, value) => ipcRenderer.send("storage:save", key, value),
    snapshot: () => ipcRenderer.sendSync("storage:snapshot"),
    refreshCache: refreshStorageCache,
    exportBackup: () => ipcRenderer.invoke("storage:export"),
    importBackup: () => ipcRenderer.invoke("storage:import"),
  },
  journalPhotos: {
    select: () => ipcRenderer.invoke("journal-photo:select"),
    remove: (fileName) => ipcRenderer.invoke("journal-photo:remove", fileName),
  },
  pomodoro: {
    schedule: (endsAt, phase) => ipcRenderer.send("pomodoro:schedule", endsAt, phase),
    cancel: () => ipcRenderer.send("pomodoro:cancel"),
    onFinished(callback) {
      const listener = (_event, phase) => callback(phase);
      ipcRenderer.on("pomodoro:finished", listener);
      return () => ipcRenderer.removeListener("pomodoro:finished", listener);
    },
  },
  photoBoard: {
    select: () => ipcRenderer.invoke("photo-board:select"),
    remove: (fileName) => ipcRenderer.invoke("photo-board:remove", fileName),
  },
  pomodoroMini: {
    open: () => ipcRenderer.send("pomodoro-mini:open"),
    sync: (snapshot) => ipcRenderer.send("pomodoro-mini:sync", snapshot),
    onState(callback) {
      const listener = (_event, snapshot) => callback(snapshot);
      ipcRenderer.on("pomodoro-mini:state", listener);
      return () => ipcRenderer.removeListener("pomodoro-mini:state", listener);
    },
    onAction(callback) {
      const listener = (_event, action) => callback(action);
      ipcRenderer.on("pomodoro-mini:action", listener);
      return () => ipcRenderer.removeListener("pomodoro-mini:action", listener);
    },
    action: (action) => ipcRenderer.send("pomodoro-mini:action", action),
    startDrag: (point) => ipcRenderer.send("pomodoro-mini:drag-start", point),
    moveDrag: (point) => ipcRenderer.send("pomodoro-mini:drag-move", point),
    endDrag: () => ipcRenderer.send("pomodoro-mini:drag-end"),
  },
});
