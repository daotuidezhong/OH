const { app, BrowserWindow, ipcMain, net, Notification, protocol } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { loadDesktopPlaylist } = require("./netease.cjs");
const { createStorage } = require("./storage.cjs");
const { openTheaterWindow } = require("./theater.cjs");

app.setName("OH");
app.setAppUserModelId("com.berryworkout.island");

protocol.registerSchemesAsPrivileged([{
  scheme: "berry",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

app.whenReady().then(() => {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "desktop-dist")
    : path.join(__dirname, "../desktop-dist");

  protocol.handle("berry", async (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
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
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });
  const sendUpdate = (status) => window.webContents.send("update:status", status);
  let pomodoroTimer = null;
  const cancelPomodoroTimer = () => {
    if (pomodoroTimer) clearTimeout(pomodoroTimer);
    pomodoroTimer = null;
  };
  const dataFile = path.join(app.getPath("userData"), "user-data.json");
  const storage = createStorage(dataFile);
  ipcMain.on("storage:load", (event, key) => { event.returnValue = storage.load(key); });
  ipcMain.on("storage:save", (_event, key, value) => storage.save(key, value));
  ipcMain.on("pomodoro:schedule", (event, endsAt, phase) => {
    if (event.sender !== window.webContents || !Number.isFinite(endsAt) || (phase !== "focus" && phase !== "break")) return;
    cancelPomodoroTimer();
    const delay = Math.max(0, Math.min(endsAt - Date.now(), 2_147_483_647));
    pomodoroTimer = setTimeout(() => {
      pomodoroTimer = null;
      const focusFinished = phase === "focus";
      const notification = new Notification({
        title: focusFinished ? "专注完成 · 草莓到账" : "休息结束",
        body: focusFinished ? "完成 1 个番茄循环，获得 5 颗草莓。现在休息 5 分钟吧！" : "新的 25 分钟专注已经准备好。",
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
  ipcMain.on("theater:open", (event) => {
    if (event.sender !== window.webContents) return;
    openTheaterWindow({
      parent: window,
      icon: app.isPackaged ? path.join(process.resourcesPath, "build/icon.png") : path.join(__dirname, "../build/icon.png"),
    });
  });
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
  window.on("closed", cancelPomodoroTimer);
});

app.on("window-all-closed", () => app.quit());
