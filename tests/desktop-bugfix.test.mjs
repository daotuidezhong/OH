import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createStorage } = require("../electron/storage.cjs");
const mainFile = new URL("../electron/main.cjs", import.meta.url);
const preloadSource = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
const initializedKey = "berry-desktop-storage-initialized";

function localCache(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key: (index) => Array.from(values.keys())[index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function loadPreload(storage, cache, pathname = "/") {
  let api;
  let initializations = 0;
  const electron = {
    contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
    ipcRenderer: {
      sendSync(channel, value) {
        if (channel === "storage:initialize") {
          initializations += 1;
          return storage.initialize(value);
        }
        if (channel === "storage:snapshot") return storage.snapshot();
        if (channel === "storage:load") return storage.load(value);
        throw new Error(`Unexpected synchronous IPC: ${channel}`);
      },
      send(channel, key, value) { if (channel === "storage:save") storage.save(key, value); },
      invoke() {}, on() {}, removeListener() {},
    },
  };
  vm.runInNewContext(preloadSource, {
    require: (name) => { assert.equal(name, "electron"); return electron; },
    window: { localStorage: cache, location: { protocol: "berry:", hostname: "game", pathname } },
  });
  return { api, initializations };
}

async function loadMain(singleInstance, directory) {
  const app = new EventEmitter();
  const windows = [];
  const calls = { quit: 0, ready: 0, storage: 0 };
  Object.assign(app, {
    isPackaged: false,
    setName() {}, setAppUserModelId() {},
    requestSingleInstanceLock: () => singleInstance,
    quit: () => { calls.quit += 1; },
    whenReady: () => { calls.ready += 1; return Promise.resolve(); },
    getPath: () => directory,
    getVersion: () => "test",
  });
  class FakeBrowserWindow extends EventEmitter {
    constructor() {
      super();
      this.minimized = true;
      this.actions = [];
      this.webContents = Object.assign(new EventEmitter(), {
        getUserAgent: () => "test", setUserAgent() {}, send() {},
      });
      windows.push(this);
    }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized; }
    restore() { this.actions.push("restore"); this.minimized = false; }
    show() { this.actions.push("show"); }
    focus() { this.actions.push("focus"); }
    loadURL() {}
  }
  const ipcMain = new EventEmitter();
  const handlers = new Map();
  ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
  const electron = {
    app, BrowserWindow: FakeBrowserWindow, ipcMain,
    dialog: {}, nativeImage: {}, net: {}, Notification: class {},
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
  };
  vm.runInNewContext(await readFile(mainFile, "utf8"), {
    require(name) {
      if (name === "electron") return electron;
      if (name === "electron-updater") return { autoUpdater: new EventEmitter() };
      if (name === "./storage.cjs") return { createStorage(...args) { calls.storage += 1; return createStorage(...args); } };
      if (name === "./netease.cjs") return require("../electron/netease.cjs");
      return require(name);
    },
    __dirname: dirname(fileURLToPath(mainFile)), process,
    setTimeout, clearTimeout, URL, Response,
  });
  await Promise.resolve();
  return { app, windows, calls, ipcMain, handlers };
}

test("a second desktop process quits before opening storage or another window", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-single-instance-"));
  try {
    const original = await loadMain(true, directory);
    const duplicate = await loadMain(false, directory);
    assert.deepEqual(duplicate.calls, { quit: 1, ready: 0, storage: 0 });
    assert.equal(duplicate.windows.length, 0);
    original.app.emit("second-instance");
    assert.deepEqual(original.windows[0].actions, ["restore", "show", "focus"]);
    original.app.emit("second-instance");
    assert.equal(original.windows.length, 1);
    assert.equal(original.calls.storage, 1);
    assert.deepEqual(original.windows[0].actions.slice(-2), ["show", "focus"]);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("only the main renderer can initialize legacy desktop data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-storage-ipc-"));
  try {
    const main = await loadMain(true, directory);
    const rejected = { sender: {} };
    main.ipcMain.emit("storage:initialize", rejected, { "berry-workout-game": "{}" });
    assert.deepEqual(rejected.returnValue, {});
    assert.deepEqual(await readdir(directory), []);
    const accepted = { sender: main.windows[0].webContents };
    main.ipcMain.emit("storage:initialize", accepted, { "berry-workout-game": '{"berries":11}' });
    assert.equal(accepted.returnValue["berry-workout-game"], '{"berries":11}');
    assert.equal(accepted.returnValue[initializedKey], "1");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the first preload migrates legacy cache once and prefers existing disk values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-legacy-migration-"));
  const dataFile = join(directory, "user-data.json");
  try {
    const storage = createStorage(dataFile);
    storage.save("berry-workout-game", '{"berries":11}');
    const cache = localCache({
      "berry-workout-game": '{"berries":5}',
      "berry-workout-history": "[]",
      unrelated: "preserve",
    });
    const loaded = loadPreload(storage, cache);
    assert.equal(loaded.initializations, 1);
    assert.equal(loaded.api.storage.load("berry-workout-game"), '{"berries":11}');
    assert.equal(cache.getItem("berry-workout-game"), '{"berries":11}');
    assert.equal(storage.load("berry-workout-history"), "[]");
    assert.equal(cache.getItem("unrelated"), "preserve");
    assert.equal(storage.load("unrelated"), null);
    cache.setItem("berry-stale-key", "old");
    loadPreload(createStorage(dataFile), cache);
    assert.equal(storage.load("berry-stale-key"), null);
    assert.equal(cache.getItem("berry-stale-key"), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an older backup replaces cache and missing keys stay missing after restart or recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-import-cache-"));
  const dataFile = join(directory, "user-data.json");
  const photosDirectory = join(directory, "photo-board-photos");
  const photoName = "board-33333333-3333-4333-8333-333333333333.jpg";
  const oldGame = '{"berries":88}';
  try {
    await mkdir(photosDirectory);
    await writeFile(join(photosDirectory, photoName), "previous photo");
    const storage = createStorage(dataFile, { photoBoardDirectory: photosDirectory });
    const cache = localCache({
      "berry-workout-game": oldGame,
      "berry-workout-history": '[{"content":"old diary"}]',
      "berry-photo-board": JSON.stringify([{ fileName: photoName }]),
      unrelated: "preserve",
    });
    const { api } = loadPreload(storage, cache);
    assert.deepEqual(storage.importPayload({ format: "oh-user-data", version: 1, data: { "berry-workout-game": '{"berries":5}' } }), ["berry-workout-game"]);
    const snapshot = api.storage.refreshCache();
    assert.deepEqual(Object.keys(snapshot).sort(), [initializedKey, "berry-workout-game"].sort());
    assert.equal(cache.getItem("berry-workout-game"), '{"berries":5}');
    assert.equal(cache.getItem("berry-workout-history"), null);
    assert.equal(cache.getItem("berry-photo-board"), null);
    assert.equal(cache.getItem("unrelated"), "preserve");
    assert.deepEqual(await readdir(photosDirectory), []);
    const files = await readdir(directory);
    const preImportFile = files.find((name) => name.startsWith("user-data.pre-import-"));
    assert.ok(preImportFile);
    assert.equal(JSON.parse(await readFile(join(directory, preImportFile), "utf8"))["berry-workout-game"], oldGame);
    const photoBackup = files.find((name) => name.startsWith("photo-board-photos.pre-import-"));
    assert.equal(await readFile(join(directory, photoBackup, photoName), "utf8"), "previous photo");
    // Even if the cache refresh was interrupted, imported data forbids re-migration.
    cache.setItem("berry-photo-board", "[]");
    loadPreload(createStorage(dataFile), cache);
    assert.equal(storage.load("berry-photo-board"), null);
    assert.equal(cache.getItem("berry-photo-board"), null);
    await writeFile(dataFile, "{damaged", "utf8");
    cache.setItem("berry-workout-history", '[{"content":"stale"}]');
    loadPreload(createStorage(dataFile), cache);
    assert.equal(cache.getItem("berry-workout-history"), null);
    assert.equal(cache.getItem("berry-workout-game"), '{"berries":5}');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the pomodoro preload cannot perform or consume first-run migration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-mini-migration-"));
  try {
    const storage = createStorage(join(directory, "user-data.json"));
    const cache = localCache({ "berry-workout-game": '{"berries":33}' });
    const mini = loadPreload(storage, cache, "/pomodoro.html");
    assert.equal(mini.initializations, 0);
    assert.equal(storage.load(initializedKey), null);
    assert.equal(cache.getItem("berry-workout-game"), '{"berries":33}');
    loadPreload(storage, cache);
    assert.equal(storage.load("berry-workout-game"), '{"berries":33}');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("desktop snapshots expose only application string values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-snapshot-filter-"));
  try {
    const storage = createStorage(join(directory, "user-data.json"));
    storage.save("unrelated", "hidden");
    storage.save("berry-invalid", 3);
    storage.save("berry-workout-game", "{}");
    assert.deepEqual(storage.snapshot(), { "berry-workout-game": "{}" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a full browser cache cannot hide the desktop bridge or prevent imported data from loading", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-cache-quota-"));
  try {
    const storage = createStorage(join(directory, "user-data.json"));
    const cache = localCache({ "berry-workout-game": '{"berries":88}', unrelated: "preserve" });
    cache.setItem = () => { throw Object.assign(new Error("Cache is full"), { name: "QuotaExceededError" }); };
    const { api } = loadPreload(storage, cache);
    assert.ok(api);
    assert.equal(api.storage.load("berry-workout-game"), '{"berries":88}');
    storage.importPayload({ format: "oh-user-data", version: 1, data: { "berry-workout-game": '{"berries":5}' } });
    assert.doesNotThrow(() => api.storage.refreshCache());
    assert.equal(api.storage.load("berry-workout-game"), '{"berries":5}');
    const reopened = loadPreload(storage, cache).api;
    assert.ok(reopened);
    assert.equal(reopened.storage.load("berry-workout-game"), '{"berries":5}');
    assert.equal(cache.getItem("unrelated"), "preserve");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unavailable localStorage preserves the bridge and does not consume legacy migration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-cache-disabled-"));
  try {
    const storage = createStorage(join(directory, "user-data.json"));
    const cache = {
      get length() { throw Object.assign(new Error("Cache unavailable"), { name: "SecurityError" }); },
    };
    const { api, initializations } = loadPreload(storage, cache);
    assert.ok(api);
    assert.equal(initializations, 0);
    assert.equal(storage.load(initializedKey), null);
    assert.doesNotThrow(() => api.storage.refreshCache());
    loadPreload(storage, localCache({ "berry-workout-game": '{"berries":22}' }));
    assert.equal(storage.load("berry-workout-game"), '{"berries":22}');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
