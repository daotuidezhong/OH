// 放映室验证版：在独立窗口打开 B站，并注入固定版本的 VideoTogether 做同步播放。
// 这个窗口加载的是第三方网页，因此不挂 OH 的 preload，也拿不到游戏存档和任何 IPC。
const { BrowserWindow, session, shell } = require("electron");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { isBilibiliUrl, toChromeUserAgent } = require("./theater-rules.cjs");

const THEATER_PARTITION = "persist:oh-theater";
const THEATER_HOME = "https://www.bilibili.com/";
const VENDOR_DIR = path.join(__dirname, "vendor", "videotogether");

function openExternally(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") shell.openExternal(url.toString());
  } catch {}
}

const theaterWindows = new Map();
let vendorScripts = null;

function loadVendorScripts() {
  if (!vendorScripts) {
    vendorScripts = {
      loader: readFileSync(path.join(VENDOR_DIR, "loader.website.js"), "utf8"),
      vt: readFileSync(path.join(VENDOR_DIR, "vt.zh-cn.website.js"), "utf8"),
    };
  }
  return vendorScripts;
}

function prepareTheaterSession(partition) {
  const theaterSession = session.fromPartition(partition);
  theaterSession.setUserAgent(toChromeUserAgent(theaterSession.getUserAgent()));
  // 放映室只需要全屏和自动播放，其余权限（摄像头、麦克风、定位、通知等）一律拒绝。
  theaterSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "fullscreen");
  });
  return theaterSession;
}

async function injectVideoTogether(webContents) {
  if (webContents.isDestroyed() || !isBilibiliUrl(webContents.getURL())) return;
  const { loader, vt } = loadVendorScripts();
  try {
    // 先跑加载器（建立存储与消息桥），再跑 vt 本体；两者自带防重复注入。
    await webContents.executeJavaScript(loader, true);
    await webContents.executeJavaScript(vt, true);
  } catch (error) {
    console.error("[theater] VideoTogether 注入失败", error);
  }
}

// 每个分区（独立的 B站登录状态）最多一个放映室窗口。
function openTheaterWindow({ icon, parent, partition = THEATER_PARTITION, label = "", bounds = {} } = {}) {
  const existing = theaterWindows.get(partition);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const windowTitle = label ? `OH 放映室 ${label}` : "OH 放映室";
  prepareTheaterSession(partition);
  const theaterWindow = new BrowserWindow({
    title: windowTitle,
    icon,
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    ...bounds,
    backgroundColor: "#1d1520",
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  theaterWindows.set(partition, theaterWindow);

  const { webContents } = theaterWindow;
  webContents.setWindowOpenHandler(({ url }) => {
    // B站大量链接用新标签页打开，放映室统一在当前窗口里跳转。
    if (isBilibiliUrl(url)) webContents.loadURL(url);
    else openExternally(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (isBilibiliUrl(url)) return;
    event.preventDefault();
    openExternally(url);
  });
  webContents.on("dom-ready", () => injectVideoTogether(webContents));
  webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    if (!theaterWindow.isDestroyed()) theaterWindow.setTitle(`${windowTitle} · ${title}`);
  });

  const closeWithParent = () => { if (!theaterWindow.isDestroyed()) theaterWindow.close(); };
  parent?.once("closed", closeWithParent);
  theaterWindow.on("closed", () => {
    parent?.removeListener("closed", closeWithParent);
    if (theaterWindows.get(partition) === theaterWindow) theaterWindows.delete(partition);
  });

  theaterWindow.loadURL(THEATER_HOME);
  return theaterWindow;
}

// 测试模式：一次打开左右并排的两个放映室，各自独立登录，模拟两个人。
function openTheaterTestPair({ icon, parent, workArea }) {
  const width = Math.floor(workArea.width / 2);
  return ["A", "B"].map((label, index) => openTheaterWindow({
    icon,
    parent,
    label,
    partition: `persist:oh-theater-test-${label.toLowerCase()}`,
    bounds: { x: workArea.x + index * width, y: workArea.y, width, height: workArea.height },
  }));
}

module.exports = { THEATER_HOME, THEATER_PARTITION, openTheaterTestPair, openTheaterWindow };
