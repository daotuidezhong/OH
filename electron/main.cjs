const { app, BrowserWindow, dialog, ipcMain, nativeImage, net, Notification, protocol } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { loadDesktopPlaylist } = require("./netease.cjs");
const { createStorage } = require("./storage.cjs");

app.setName("OH");
const WINDOWS_APP_ID = app.isPackaged
  ? "com.berryworkout.island.desktop.v2"
  : "com.berryworkout.island.development";
app.setAppUserModelId(WINDOWS_APP_ID);

const singleInstance = app.requestSingleInstanceLock();
let mainWindow = null;
if (!singleInstance) app.quit();
app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

protocol.registerSchemesAsPrivileged([{
  scheme: "berry",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

if (singleInstance) app.whenReady().then(() => {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "desktop-dist")
    : path.join(__dirname, "../desktop-dist");
  const userDataRoot = app.getPath("userData");
  const journalPhotosDirectory = path.join(userDataRoot, "journal-photos");
  const photoBoardDirectory = path.join(userDataRoot, "photo-board-photos");

  protocol.handle("berry", async (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (url.hostname === "journal-photo") {
      const name = path.basename(pathname);
      const file = path.join(journalPhotosDirectory, name);
      if (!/^journal-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(name) || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    }
    if (url.hostname === "photo-board") {
      const name = path.basename(pathname);
      const file = path.join(photoBoardDirectory, name);
      if (!/^board-[0-9a-f-]{36}\.jpg$/i.test(name) || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    }
    if (pathname === "/api/netease-playlist") {
      return Response.json(await loadDesktopPlaylist(root, net.fetch), { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    const file = path.resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
    if (!file.startsWith(root)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const window = new BrowserWindow({
    title: "OH",
    icon: app.isPackaged ? path.join(process.resourcesPath, "build/icon.png") : path.join(__dirname, "../build/icon.png"),
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f7ead7",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false,
    },
  });
  mainWindow = window;
  let pomodoroMiniWindow = null;
  let pomodoroMiniSnapshot = null;
  let pomodoroMiniDragOrigin = null;
  const openPomodoroMini = () => {
    if (pomodoroMiniWindow && !pomodoroMiniWindow.isDestroyed()) {
      pomodoroMiniWindow.show();
      pomodoroMiniWindow.focus();
      return;
    }
    pomodoroMiniWindow = new BrowserWindow({
      title: "OH · 橙子专注钟",
      icon: app.isPackaged ? path.join(process.resourcesPath, "build/icon.png") : path.join(__dirname, "../build/icon.png"),
      width: 160,
      height: 160,
      minWidth: 160,
      minHeight: 160,
      maxWidth: 160,
      maxHeight: 160,
      frame: false,
      thickFrame: false,
      roundedCorners: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      hasShadow: false,
      movable: true,
      resizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        backgroundThrottling: false,
      },
    });
    pomodoroMiniWindow.setMovable(true);
    pomodoroMiniWindow.setAlwaysOnTop(true, "floating");
    pomodoroMiniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    pomodoroMiniWindow.webContents.once("did-finish-load", () => {
      if (pomodoroMiniSnapshot && pomodoroMiniWindow && !pomodoroMiniWindow.isDestroyed()) {
        pomodoroMiniWindow.webContents.send("pomodoro-mini:state", pomodoroMiniSnapshot);
      }
    });
    void pomodoroMiniWindow.loadURL("berry://game/pomodoro.html");
    pomodoroMiniWindow.on("closed", () => { pomodoroMiniDragOrigin = null; pomodoroMiniWindow = null; });
  };
  ipcMain.on("pomodoro-mini:open", (event) => {
    if (event.sender === window.webContents) openPomodoroMini();
  });
  ipcMain.on("pomodoro-mini:sync", (event, snapshot) => {
    if (event.sender !== window.webContents || !snapshot || typeof snapshot.remaining !== "number" || typeof snapshot.progress !== "number") return;
    pomodoroMiniSnapshot = snapshot;
    if (pomodoroMiniWindow && !pomodoroMiniWindow.isDestroyed()) pomodoroMiniWindow.webContents.send("pomodoro-mini:state", snapshot);
  });
  ipcMain.on("pomodoro-mini:action", (event, action) => {
    if (!pomodoroMiniWindow || event.sender !== pomodoroMiniWindow.webContents || (action !== "start" && action !== "pause") || window.isDestroyed()) return;
    window.webContents.send("pomodoro-mini:action", action);
  });
  ipcMain.on("pomodoro-mini:drag-start", (event, point) => {
    if (!pomodoroMiniWindow || pomodoroMiniWindow.isDestroyed() || event.sender !== pomodoroMiniWindow.webContents || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const bounds = pomodoroMiniWindow.getContentBounds();
    pomodoroMiniDragOrigin = { pointerX: point.x, pointerY: point.y, windowX: bounds.x, windowY: bounds.y, width: bounds.width, height: bounds.height };
  });
  ipcMain.on("pomodoro-mini:drag-move", (event, point) => {
    if (!pomodoroMiniDragOrigin || !pomodoroMiniWindow || pomodoroMiniWindow.isDestroyed() || event.sender !== pomodoroMiniWindow.webContents || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const x = Math.round(pomodoroMiniDragOrigin.windowX + point.x - pomodoroMiniDragOrigin.pointerX);
    const y = Math.round(pomodoroMiniDragOrigin.windowY + point.y - pomodoroMiniDragOrigin.pointerY);
    const current = pomodoroMiniWindow.getContentBounds();
    if (x !== current.x || y !== current.y) pomodoroMiniWindow.setContentBounds({ x, y, width: pomodoroMiniDragOrigin.width, height: pomodoroMiniDragOrigin.height }, false);
  });
  ipcMain.on("pomodoro-mini:drag-end", (event) => {
    if (pomodoroMiniWindow && !pomodoroMiniWindow.isDestroyed() && event.sender === pomodoroMiniWindow.webContents) pomodoroMiniDragOrigin = null;
  });
  const sendUpdate = (status) => window.webContents.send("update:status", status);
  let pomodoroTimer = null;
  const cancelPomodoroTimer = () => {
    if (pomodoroTimer) clearTimeout(pomodoroTimer);
    pomodoroTimer = null;
  };
  const dataFile = path.join(userDataRoot, "user-data.json");
  const storage = createStorage(dataFile, { journalPhotosDirectory, photoBoardDirectory });
  ipcMain.on("storage:load", (event, key) => { event.returnValue = storage.load(key); });
  ipcMain.on("storage:save", (_event, key, value) => storage.save(key, value));
  ipcMain.on("storage:initialize", (event, legacyData) => {
    event.returnValue = event.sender === window.webContents ? storage.initialize(legacyData) : storage.snapshot();
  });
  ipcMain.on("storage:snapshot", (event) => { event.returnValue = storage.snapshot(); });
  ipcMain.handle("storage:export", async (event) => {
    if (event.sender !== window.webContents) return { status: "error", message: "无法读取当前游戏数据" };
    try {
      const date = new Date().toISOString().slice(0, 10);
      const result = await dialog.showSaveDialog(window, {
        title: "导出 OH 完整备份",
        defaultPath: `OH-backup-${date}.ohbackup`,
        filters: [{ name: "OH 备份", extensions: ["ohbackup"] }],
      });
      if (result.canceled || !result.filePath) return { status: "cancelled" };
      const payload = storage.exportPayload({ sourcePlatform: process.platform, appVersion: app.getVersion() });
      fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), "utf8");
      return { status: "exported" };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "备份导出失败" };
    }
  });
  ipcMain.handle("storage:import", async (event) => {
    if (event.sender !== window.webContents) return { status: "error", message: "无法写入当前游戏数据" };
    try {
      const result = await dialog.showOpenDialog(window, {
        title: "导入 OH 完整备份",
        properties: ["openFile"],
        filters: [{ name: "OH 备份", extensions: ["ohbackup", "json"] }],
      });
      if (result.canceled || !result.filePaths[0]) return { status: "cancelled" };
      const keys = storage.importPayload(JSON.parse(fs.readFileSync(result.filePaths[0], "utf8")));
      return { status: "imported", importedKeys: keys.length };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "备份导入失败" };
    }
  });
  ipcMain.handle("journal-photo:select", async (event) => {
    if (event.sender !== window.webContents) return { status: "error", message: "无法读取当前照片" };
    try {
      const result = await dialog.showOpenDialog(window, {
        title: "选择日记照片",
        properties: ["openFile"],
        filters: [{ name: "照片", extensions: ["jpg", "jpeg", "png", "webp"] }],
      });
      if (result.canceled || !result.filePaths[0]) return { status: "cancelled" };
      const source = nativeImage.createFromPath(result.filePaths[0]);
      if (source.isEmpty()) return { status: "error", message: "这张照片无法读取，请换一张试试" };
      const size = source.getSize();
      const longestSide = Math.max(size.width, size.height);
      const image = longestSide > 1600
        ? source.resize(size.width >= size.height ? { width: 1600, quality: "best" } : { height: 1600, quality: "best" })
        : source;
      const resizedSize = image.getSize();
      const fileName = `journal-${randomUUID()}.jpg`;
      fs.mkdirSync(journalPhotosDirectory, { recursive: true });
      fs.writeFileSync(path.join(journalPhotosDirectory, fileName), image.toJPEG(85));
      return { status: "selected", photo: { fileName, width: resizedSize.width, height: resizedSize.height } };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "照片导入失败" };
    }
  });
  ipcMain.handle("journal-photo:remove", (event, fileName) => {
    if (event.sender !== window.webContents || !/^journal-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(fileName)) return false;
    fs.rmSync(path.join(journalPhotosDirectory, fileName), { force: true });
    return true;
  });
  ipcMain.on("pomodoro:schedule", (event, endsAt, phase) => {
    if (event.sender !== window.webContents || !Number.isFinite(endsAt) || (phase !== "focus" && phase !== "break")) return;
    cancelPomodoroTimer();
    const delay = Math.max(0, Math.min(endsAt - Date.now(), 2_147_483_647));
    pomodoroTimer = setTimeout(() => {
      pomodoroTimer = null;
      const focusFinished = phase === "focus";
      const notification = new Notification({
        title: focusFinished ? "专注完成 · 草莓到账" : "休息结束",
        body: focusFinished ? "完成 1 个橙子专注循环，获得 5 颗草莓。现在休息 5 分钟吧！" : "新的 25 分钟专注已经准备好。",
        icon: app.isPackaged ? path.join(process.resourcesPath, "build/icon.png") : path.join(__dirname, "../build/icon.png"),
        silent: false,
      });
      notification.on("click", () => {
        if (window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      });
      notification.show();
      if (!window.isDestroyed()) window.webContents.send("pomodoro:finished", phase);
    }, delay);
  });
  ipcMain.on("pomodoro:cancel", (event) => { if (event.sender === window.webContents) cancelPomodoroTimer(); });
  autoUpdater.autoDownload = false;
  autoUpdater.on("update-available", (info) => sendUpdate({
    phase: "available",
    name: info.releaseName || `草莓打卡屋 v${info.version}`,
    notes: Array.isArray(info.releaseNotes) ? info.releaseNotes.map((item) => item.note).join("\n") : info.releaseNotes,
  }));
  autoUpdater.on("download-progress", (progress) => sendUpdate({ phase: "downloading", percent: progress.percent }));
  autoUpdater.on("update-downloaded", (info) => sendUpdate({ phase: "downloaded", name: `v${info.version} 已下载`, message: "点击按钮安装，新版本会自动重新打开。" }));
  autoUpdater.on("error", () => sendUpdate({ phase: "error", message: "暂时无法获取更新，请稍后再试。" }));
  ipcMain.handle("update:download", () => autoUpdater.downloadUpdate());
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.on("update:install", () => autoUpdater.quitAndInstall());
  window.webContents.setUserAgent(`${window.webContents.getUserAgent()} BerryWorkoutDesktop`);
  window.webContents.once("did-finish-load", () => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); });
  window.loadURL("berry://game/");
  window.on("closed", () => {
    mainWindow = null;
    cancelPomodoroTimer();
    if (pomodoroMiniWindow && !pomodoroMiniWindow.isDestroyed()) pomodoroMiniWindow.close();
  });
  ipcMain.handle("photo-board:select", async (event) => {
    if (event.sender !== window.webContents) return { status: "error", message: "无法读取当前照片" };
    try {
      const result = await dialog.showOpenDialog(window, { title: "选择照片板照片", properties: ["openFile"], filters: [{ name: "照片", extensions: ["jpg", "jpeg", "png", "webp"] }] });
      if (result.canceled || !result.filePaths[0]) return { status: "cancelled" };
      const source = nativeImage.createFromPath(result.filePaths[0]);
      if (source.isEmpty()) return { status: "error", message: "这张照片无法读取，请换一张试试" };
      const size = source.getSize();
      const longestSide = Math.max(size.width, size.height);
      const image = longestSide > 2000 ? source.resize(size.width >= size.height ? { width: 2000, quality: "best" } : { height: 2000, quality: "best" }) : source;
      const resizedSize = image.getSize();
      const id = randomUUID();
      const fileName = `board-${id}.jpg`;
      fs.mkdirSync(photoBoardDirectory, { recursive: true });
      fs.writeFileSync(path.join(photoBoardDirectory, fileName), image.toJPEG(88));
      return { status: "selected", photo: { id, fileName, width: resizedSize.width, height: resizedSize.height } };
    } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "照片导入失败" }; }
  });
  ipcMain.handle("photo-board:remove", (event, fileName) => {
    if (event.sender !== window.webContents || !/^board-[0-9a-f-]{36}\.jpg$/i.test(fileName)) return false;
    fs.rmSync(path.join(photoBoardDirectory, fileName), { force: true });
    return true;
  });
});

app.on("window-all-closed", () => app.quit());
