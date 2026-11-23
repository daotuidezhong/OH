import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { HOLD_TOKEN, roomCredentials } from "../app/theater/protocol.ts";

const bridgeSource = await readFile(new URL("../electron/theater-bridge.js", import.meta.url), "utf8");
const theaterMain = await readFile(new URL("../electron/theater.cjs", import.meta.url), "utf8");

/** 最小的页面环境 + 假 VideoTogether，验证放映厅桥如何遥控它。 */
function loadBridge({ savedHost = "https://vt-cn.example:5000/", fetchConfig } = {}) {
  const listeners = new Map();
  const classes = new Set();
  const calls = [];
  const window = {
    addEventListener(type, callback) { listeners.set(type, [...(listeners.get(type) ?? []), callback]); },
    postMessage(data) { for (const callback of listeners.get("message") ?? []) callback({ data, source: window }); },
    // 上次锁定的同步服务器（存在本地）
    localStorage: { store: new Map(savedHost ? [["oh-theater-vt-host", savedHost]] : []), getItem(key) { return this.store.get(key) ?? null; }, setItem(key, value) { this.store.set(key, value); } },
  };
  const extension = {
    RoleEnum: { Null: 1, Master: 2, Member: 3 },
    role: 1,
    roomName: "",
    ctxMemberCount: 0,
    gotTextMsg() { calls.push("speak"); },
    CreateRoom(name, password) { calls.push(["create", name, password]); this.role = 2; this.roomName = name; },
    JoinRoom(name, password) { calls.push(["join", name, password]); this.role = 3; this.roomName = name; },
    exitRoom() { calls.push("exit"); this.role = 1; this.roomName = ""; },
    video_together_host: "https://vt.panghair.com:5000/",
    video_together_main_host: "https://vt.panghair.com:5000/",
    SyncTimeWithServer(url) { calls.push(["sync-time", url]); },
  };
  const document = {
    head: { appendChild() {} },
    documentElement: { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } },
    createElement: () => ({}),
    querySelector: () => ({}),
  };
  window.document = document;
  const timers = [];
  const context = vm.createContext({ window, document, console, setInterval: () => 0, setTimeout: (fn) => timers.push(fn), Date, Math, Set, Number, Boolean, JSON, atob, ...(fetchConfig ? { fetch: fetchConfig } : {}) });
  vm.runInContext(bridgeSource, context);
  window.videoTogetherExtension = extension;
  const fire = (type, extra = {}) => {
    let prevented = false;
    for (const callback of listeners.get(type) ?? []) callback({ type, preventDefault() { prevented = true; }, stopImmediatePropagation() {}, ...extra });
    return prevented;
  };
  const raw = window.__ohTheater;
  // vm 沙箱里的数组原型不同，取出时转成普通值再比较。
  const api = { ...raw, drain: () => JSON.parse(JSON.stringify(raw.drain())) };
  return { api, window, extension, calls, classes, fire, timers };
}

test("bridge creates or joins the shared room exactly once and silences VideoTogether speech", () => {
  const master = loadBridge();
  const credentials = roomCredentials("K7Q2MX");
  master.api.configure({ ...credentials, role: "master" });
  assert.deepEqual(master.calls, [["create", credentials.name, credentials.password]]);
  master.api.configure({ ...credentials, role: "master" });
  assert.equal(master.calls.length, 1, "already in the room: no second create");
  master.extension.gotTextMsg("x", "hello");
  assert.ok(!master.calls.includes("speak"), "text-to-speech replaced by bubbles");

  const member = loadBridge();
  member.api.configure({ ...credentials, role: "member" });
  assert.deepEqual(member.calls, [["join", credentials.name, credentials.password]]);
  member.extension.ctxMemberCount = 2;
  const { diag, ...drained } = member.api.drain();
  assert.deepEqual({ ...drained, messages: [], events: [] }, { role: "member", inRoom: true, members: 2, line: "国内线路", hasVideo: true, messages: [], events: [] });
  assert.equal(diag.role, "成员");
  assert.equal(diag.room, credentials.name);
});

test("bridge relays partner messages, hides its own echoes, and sends through VideoTogether", () => {
  const { api, window } = loadBridge();
  api.configure({ ...roomCredentials("K7Q2MX"), role: "master" });
  const sent = [];
  window.addEventListener("message", (event) => { if (event.data.type === 30) sent.push(event.data.data); });
  assert.equal(api.send("到啦"), true);
  assert.equal(api.send(HOLD_TOKEN), true);
  assert.deepEqual(sent.map((item) => item.value), ["到啦", HOLD_TOKEN]);
  // 服务器把自己发的消息回传：不重复显示
  for (const item of sent) window.postMessage({ source: "VideoTogether", type: 31, data: { id: item.currentSendingMsgId, msg: item.value } });
  window.postMessage({ source: "VideoTogether", type: 31, data: { id: "remote", msg: "你到了吗" } });
  window.postMessage({ source: "other", type: 31, data: { id: "x", msg: "spoof" } });
  assert.deepEqual(api.drain().messages.map((item) => item.msg), ["你到了吗"]);
  assert.deepEqual(api.drain().messages, []);
});

test("small screen swallows clicks and asks to enlarge; enlarged screen passes clicks through", () => {
  const { api, classes, fire } = loadBridge();
  api.setSmall(true);
  assert.ok(classes.has("oh-small"));
  assert.equal(fire("pointerdown"), true);
  assert.equal(fire("click"), true);
  assert.deepEqual(api.drain().events, [{ type: "enlarge" }]);
  api.setSmall(false);
  assert.ok(!classes.has("oh-small"));
  assert.equal(fire("click"), false);
  assert.deepEqual(api.drain().events, []);
});

test("main process and theater page derive the same room credentials", () => {
  assert.match(theaterMain, /return \{ name: `OH-THEATER-\$\{code\}`, password: `oh-\$\{code\.toLowerCase\(\)\}-together` \};/);
  assert.deepEqual(roomCredentials("K7Q2MX"), { name: "OH-THEATER-K7Q2MX", password: "oh-k7q2mx-together" });
});

test("both computers are pinned to the same sync server before joining", async () => {
  // 第一次打开：从 VideoTogether 的国内 CDN 配置取国内服务器，取到之前不进房
  let resolveConfig;
  const fetchConfig = () => new Promise((resolve) => { resolveConfig = resolve; });
  const fresh = loadBridge({ savedHost: null, fetchConfig });
  const credentials = roomCredentials("K7Q2MX");
  fresh.api.configure({ ...credentials, role: "member" });
  assert.deepEqual(fresh.calls, [], "服务器定下来之前不进房");
  resolveConfig({ json: async () => ({ apiHostChina: "https://vt-cn.example:5000/" }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  fresh.api.configure({ ...credentials, role: "member" });
  assert.deepEqual(fresh.calls.at(-1), ["join", credentials.name, credentials.password]);
  assert.equal(fresh.extension.video_together_host, "https://vt-cn.example:5000/");
  assert.equal(fresh.window.localStorage.getItem("oh-theater-vt-host"), "https://vt-cn.example:5000/", "记下来，下次打开立刻可用");
  // VideoTogether 自己想切到别的服务器：仍然只连锁定的那台
  fresh.extension.SyncTimeWithServer("https://vt.panghair.com:5000/");
  assert.deepEqual(fresh.calls.at(-1), ["sync-time", "https://vt-cn.example:5000/"]);
  assert.equal(fresh.api.drain().line, "国内线路");

  // 已经连到了别的服务器上：退出、换到锁定的服务器重新进房
  const saved = loadBridge();
  saved.extension.role = 3; saved.extension.roomName = credentials.name;
  saved.api.configure({ ...credentials, role: "member" });
  assert.ok(saved.calls.includes("exit"));
  assert.equal(saved.extension.video_together_host, "https://vt-cn.example:5000/");

  // CDN 配置取不到：4 秒后退回主服务器（票根上能看到是哪条线路）
  const offline = loadBridge({ savedHost: null, fetchConfig: () => Promise.reject(new Error("offline")) });
  for (const timer of offline.timers) timer();
  offline.api.configure({ ...credentials, role: "master" });
  assert.equal(offline.extension.video_together_host, "https://vt.panghair.com:5000/");
  assert.equal(offline.api.drain().line, "主线路");
});
