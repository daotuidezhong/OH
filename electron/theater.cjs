// 放映厅：自己的场景页面（躺椅、玩偶、聊天、银幕）+ 嵌在“银幕”位置的 B站视图。
// B站视图加载第三方网页：独立会话分区、沙箱、无 preload，拿不到游戏存档和任何 IPC；
// 只通过 executeJavaScript 调用注入的 window.__ohTheater（见 theater-bridge.js）。
const { BrowserWindow, WebContentsView, ipcMain, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { isBilibiliUrl, toChromeUserAgent } = require("./theater-rules.cjs");
const { openNotebook } = require("./theater-notebook.cjs");

const THEATER_PARTITION = "persist:oh-theater";
const THEATER_HOME = "https://www.bilibili.com/";
const SCENE_URL = "berry://game/theater.html";
const VENDOR_DIR = path.join(__dirname, "vendor", "videotogether");
const POLL_MS = 250;
const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
// 牵手信号（和 app/theater/protocol.ts 的 HOLD_TOKEN 一致）；其他以 \u2063 开头的是看不见的控制信号，不记进笔记本
const HOLD_TOKEN = "\u2063OH:HAND";

/** 把一条聊天通道里的消息记进笔记本：牵手、普通聊天；看不见的控制信号跳过 */
function recordMessage(context, who, text) {
  const room = context.config && context.config.code;
  if (!context.notebook || !room || typeof text !== "string") return;
  if (text === HOLD_TOKEN) context.notebook.hold(room, who);
  else if (!text.startsWith("\u2063")) context.notebook.chat(room, who, text);
}

/** 放映厅窗口上下文，按场景页面的 webContents.id 索引。 */
const contexts = new Map();
let scripts = null;
let ipcReady = false;

function loadScripts() {
  if (!scripts) {
    scripts = {
      loader: fs.readFileSync(path.join(VENDOR_DIR, "loader.website.js"), "utf8"),
      vt: fs.readFileSync(path.join(VENDOR_DIR, "vt.zh-cn.website.js"), "utf8"),
      bridge: fs.readFileSync(path.join(__dirname, "theater-bridge.js"), "utf8"),
    };
  }
  return scripts;
}

function openExternally(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") shell.openExternal(url.toString());
  } catch {}
}

function roomCredentials(code) {
  return { name: `OH-THEATER-${code}`, password: `oh-${code.toLowerCase()}-together` };
}

function validConfig(value) {
  return Boolean(value && typeof value === "object" && ROOM_CODE.test(value.code) && (value.role === "master" || value.role === "member"));
}

function readConfig(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return validConfig(value) ? { code: value.code, role: value.role } : null;
  } catch {
    return null;
  }
}

function writeConfig(file, config) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (config) fs.writeFileSync(file, JSON.stringify(config), "utf8");
  else fs.rmSync(file, { force: true });
}

function prepareSession(partition) {
  const theaterSession = session.fromPartition(partition);
  theaterSession.setUserAgent(toChromeUserAgent(theaterSession.getUserAgent()));
  // 只需要全屏和自动播放，摄像头、麦克风、定位、通知等一律拒绝。
  theaterSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === "fullscreen"));
  return theaterSession;
}

async function runInView(context, code) {
  const { webContents } = context.view;
  if (webContents.isDestroyed() || !isBilibiliUrl(webContents.getURL())) return null;
  try {
    return await webContents.executeJavaScript(code, true);
  } catch {
    return null;
  }
}

function pushConfig(context) {
  const credentials = context.config ? roomCredentials(context.config.code) : null;
  const payload = credentials ? { ...credentials, role: context.config.role } : null;
  return runInView(context, `window.__ohTheater && window.__ohTheater.configure(${JSON.stringify(payload)})`);
}

function pushSmall(context) {
  return runInView(context, `window.__ohTheater && window.__ohTheater.setSmall(${context.enlarged ? "false" : "true"})`);
}

async function inject(context) {
  const { webContents } = context.view;
  if (webContents.isDestroyed() || !isBilibiliUrl(webContents.getURL())) return;
  const { loader, vt, bridge } = loadScripts();
  try {
    // 加载器建立存储与消息桥，再跑 VideoTogether 本体，最后是放映厅桥；三者都自带防重复注入。
    await webContents.executeJavaScript(loader, true);
    await webContents.executeJavaScript(vt, true);
    await webContents.executeJavaScript(bridge, true);
    await pushSmall(context);
    await pushConfig(context);
  } catch (error) {
    console.error("[theater] 注入失败", error);
  }
}

function sendToScene(context, channel, payload) {
  if (!context.window.isDestroyed()) context.window.webContents.send(channel, payload);
}

/** 银幕颜色：每 0.6 秒截一张很小的缩略图取平均色，放映厅的灯光跟着画面变。 */
async function sampleScreen(context) {
  const now = Date.now();
  if (context.enlarged || context.sampling || now - context.sampledAt < 600) return context.ambient;
  context.sampling = true;
  context.sampledAt = now;
  try {
    const bounds = context.view.getBounds();
    if (bounds.width > 0 && bounds.height > 0) {
      const image = await context.view.webContents.capturePage();
      if (!image.isEmpty()) {
        const bitmap = image.resize({ width: 12, quality: "good" }).toBitmap();
        let red = 0; let green = 0; let blue = 0; let count = 0;
        for (let index = 0; index + 3 < bitmap.length; index += 4) {
          blue += bitmap[index]; green += bitmap[index + 1]; red += bitmap[index + 2]; count += 1;
        }
        if (count) context.ambient = [red, green, blue].map((value) => Math.round(value / count));
      }
    }
  } catch {
    // 截图失败时保持上一次的颜色
  } finally {
    context.sampling = false;
  }
  return context.ambient;
}

async function poll(context) {
  if (context.polling || context.view.webContents.isDestroyed()) return;
  context.polling = true;
  try {
    const state = await runInView(context, "window.__ohTheater ? window.__ohTheater.drain() : null");
    const next = state && typeof state === "object" ? state : { role: "loading", inRoom: false, members: 0, hasVideo: false, messages: [], events: [] };
    // 笔记本：两人都在时记下一起看的时长和银幕上的视频；对方发来的聊天、牵手
    const pollAt = Date.now();
    const room = context.config && context.config.code;
    if (context.notebook && room && next.inRoom && Number(next.members) >= 2) {
      if (context.lastPollAt) context.notebook.together(room, pollAt - context.lastPollAt);
      if (next.page && typeof next.page.url === "string" && isBilibiliUrl(next.page.url)) context.notebook.video(room, next.page.url, typeof next.page.title === "string" ? next.page.title : "");
    }
    context.lastPollAt = pollAt;
    for (const item of Array.isArray(next.messages) ? next.messages : []) if (item && typeof item.msg === "string") recordMessage(context, "partner", item.msg.slice(0, 400));
    for (const event of Array.isArray(next.events) ? next.events : []) {
      if (event && event.type === "enlarge") sendToScene(context, "theater:enlarge", true);
    }
    sendToScene(context, "theater:state", {
      role: String(next.role),
      inRoom: Boolean(next.inRoom),
      members: Number(next.members) || 0,
      hasVideo: Boolean(next.hasVideo),
      messages: (Array.isArray(next.messages) ? next.messages : []).filter((item) => item && typeof item.msg === "string").map((item) => ({ msg: item.msg.slice(0, 400) })),
      line: typeof next.line === "string" ? next.line.slice(0, 10) : "",
      diag: next.diag && typeof next.diag === "object" ? Object.fromEntries(Object.entries(next.diag).slice(0, 16).map(([key, value]) => [String(key).slice(0, 20), typeof value === "string" ? value.slice(0, 160) : typeof value === "number" || typeof value === "boolean" ? value : ""])) : null,
      canGoBack: context.view.webContents.navigationHistory.canGoBack(),
      ambient: await sampleScreen(context),
    });
  } finally {
    context.polling = false;
  }
}

function contextFor(event) {
  const context = contexts.get(event.sender.id);
  return context && event.sender === context.window.webContents ? context : null;
}

function setupIpc() {
  if (ipcReady) return;
  ipcReady = true;
  ipcMain.handle("theater:init", (event) => {
    const context = contextFor(event);
    return context ? { config: context.config, label: context.label, testMode: Boolean(context.testConfig) } : null;
  });
  ipcMain.handle("theater:config", async (event, config) => {
    const context = contextFor(event);
    if (!context) return false;
    if (config !== null && !validConfig(config)) return false;
    context.config = config ? { code: config.code, role: config.role } : null;
    if (!context.testConfig && context.configFile) writeConfig(context.configFile, context.config);
    await pushConfig(context);
    return true;
  });
  ipcMain.on("theater:screen", (event, rect, enlarged) => {
    const context = contextFor(event);
    if (!context || !rect || typeof rect !== "object") return;
    const [x, y, width, height] = ["x", "y", "width", "height"].map((key) => Math.max(0, Math.round(Number(rect[key]) || 0)));
    context.view.setBounds({ x, y, width, height });
    const nextEnlarged = Boolean(enlarged);
    if (nextEnlarged !== context.enlarged) {
      context.enlarged = nextEnlarged;
      pushSmall(context);
      if (nextEnlarged) context.view.webContents.focus();
    }
  });
  ipcMain.handle("theater:send", async (event, text) => {
    const context = contextFor(event);
    if (!context || typeof text !== "string" || !text || text.length > 400) return false;
    const sent = await runInView(context, `window.__ohTheater ? window.__ohTheater.send(${JSON.stringify(text)}) : false`);
    if (sent) recordMessage(context, "me", text);
    return sent;
  });
  // 笔记本：一起看过的每一次（新的在前）
  ipcMain.handle("theater:notebook", (event) => {
    const context = contextFor(event);
    return context && context.notebook ? context.notebook.list() : [];
  });
  // 场景里的“离开放映厅”：关掉放映厅窗口，游戏主窗口不受影响
  ipcMain.on("theater:close", (event) => {
    const context = contextFor(event);
    if (context && !context.window.isDestroyed()) context.window.close();
  });
  ipcMain.on("theater:navigate", (event, action) => {
    const context = contextFor(event);
    if (!context) return;
    const { webContents } = context.view;
    if (action === "home") webContents.loadURL(THEATER_HOME);
    if (action === "back" && webContents.navigationHistory.canGoBack()) webContents.navigationHistory.goBack();
    // 笔记本里点一个看过的视频：在银幕上重新打开（只允许 B站）
    if (action && typeof action === "object" && typeof action.url === "string" && isBilibiliUrl(action.url)) webContents.loadURL(action.url);
  });
}

/**
 * 打开放映厅。configFile 保存放映厅码；testConfig 用于 --theater-test（A/B 自动配对，不落盘）。
 * 每个会话分区最多一个放映厅窗口。
 */
function openTheaterWindow({ icon, parent, configFile, notebookFile, partition = THEATER_PARTITION, label = "", bounds = {}, testConfig = null } = {}) {
  setupIpc();
  for (const context of contexts.values()) {
    if (context.partition === partition && !context.window.isDestroyed()) {
      if (context.window.isMinimized()) context.window.restore();
      context.window.focus();
      return context.window;
    }
  }

  const title = label ? `OH 放映厅 ${label}` : "OH 放映厅";
  prepareSession(partition);
  const window = new BrowserWindow({
    title,
    icon,
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    ...bounds,
    backgroundColor: "#140b12",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "theater-preload.cjs"), contextIsolation: true, sandbox: true },
  });
  const view = new WebContentsView({
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: "no-user-gesture-required" },
  });
  view.setBackgroundColor("#000000");
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  window.contentView.addChildView(view);

  const context = {
    window,
    view,
    partition,
    label,
    configFile,
    testConfig,
    config: testConfig || (configFile ? readConfig(configFile) : null),
    enlarged: false,
    polling: false,
    sampling: false,
    sampledAt: 0,
    ambient: null,
    timer: null,
    lastPollAt: 0,
    notebook: null,
  };
  // 笔记本和放映厅码放在同一个文件夹（测试模式 A / B 各一本）
  const bookFile = notebookFile || (configFile ? path.join(path.dirname(configFile), "theater-notebook.json") : null);
  if (bookFile) context.notebook = openNotebook(bookFile);
  contexts.set(window.webContents.id, context);

  const { webContents } = view;
  webContents.setWindowOpenHandler(({ url }) => {
    // B站大量链接用新标签页打开，放映厅统一在银幕里跳转。
    if (isBilibiliUrl(url)) webContents.loadURL(url);
    else openExternally(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (isBilibiliUrl(url)) return;
    event.preventDefault();
    openExternally(url);
  });
  webContents.on("dom-ready", () => inject(context));
  webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape" && context.enlarged && !window.isFullScreen()) {
      event.preventDefault();
      sendToScene(context, "theater:enlarge", false);
    }
  });
  // B站播放器自己的全屏：整个窗口全屏，银幕铺满。
  webContents.on("enter-html-full-screen", () => { window.setFullScreen(true); sendToScene(context, "theater:enlarge", true); });
  webContents.on("leave-html-full-screen", () => { window.setFullScreen(false); });
  window.webContents.on("page-title-updated", (event) => { event.preventDefault(); });

  // 场景页面只允许停留在本地放映厅页面。
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const closeWithParent = () => { if (!window.isDestroyed()) window.close(); };
  parent?.once("closed", closeWithParent);
  window.on("closed", () => {
    parent?.removeListener("closed", closeWithParent);
    clearInterval(context.timer);
    context.notebook?.flush();
    for (const [id, item] of contexts) if (item === context) contexts.delete(id);
    if (!webContents.isDestroyed()) webContents.close();
  });

  context.timer = setInterval(() => poll(context), POLL_MS);
  window.loadURL(SCENE_URL);
  webContents.loadURL(THEATER_HOME);
  return window;
}

// 测试模式：一次打开左右并排的两个放映厅，A 建房、B 加入同一个随机放映厅码，各自独立登录，模拟两个人。
function openTheaterTestPair({ icon, parent, workArea, notebookDir }) {
  const width = Math.floor(workArea.width / 2);
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return ["A", "B"].map((label, index) => openTheaterWindow({
    icon,
    parent,
    label,
    partition: `persist:oh-theater-test-${label.toLowerCase()}`,
    testConfig: { code, role: index === 0 ? "master" : "member" },
    notebookFile: notebookDir ? path.join(notebookDir, `theater-notebook-${label.toLowerCase()}.json`) : undefined,
    bounds: { x: workArea.x + index * width, y: workArea.y, width, height: workArea.height, minWidth: 640 },
  }));
}

module.exports = { THEATER_HOME, THEATER_PARTITION, openTheaterTestPair, openTheaterWindow, roomCredentials };
