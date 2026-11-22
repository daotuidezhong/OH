import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { FEET_TOKEN, roomCredentials } from "../app/theater/protocol.ts";

const bridgeSource = await readFile(new URL("../electron/theater-bridge.js", import.meta.url), "utf8");
const theaterMain = await readFile(new URL("../electron/theater.cjs", import.meta.url), "utf8");

/** 最小的页面环境 + 假 VideoTogether，验证放映厅桥如何遥控它。 */
function loadBridge() {
  const listeners = new Map();
  const classes = new Set();
  const calls = [];
  const window = {
    addEventListener(type, callback) { listeners.set(type, [...(listeners.get(type) ?? []), callback]); },
    postMessage(data) { for (const callback of listeners.get("message") ?? []) callback({ data, source: window }); },
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
  };
  const document = {
    head: { appendChild() {} },
    documentElement: { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } },
    createElement: () => ({}),
    querySelector: () => ({}),
  };
  window.document = document;
  const context = vm.createContext({ window, document, console, setInterval: () => 0, Date, Math, Set, Number, Boolean, JSON });
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
  return { api, window, extension, calls, classes, fire };
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
  assert.deepEqual({ ...member.api.drain(), messages: [], events: [] }, { role: "member", inRoom: true, members: 2, hasVideo: true, messages: [], events: [] });
});

test("bridge relays partner messages, hides its own echoes, and sends through VideoTogether", () => {
  const { api, window } = loadBridge();
  api.configure({ ...roomCredentials("K7Q2MX"), role: "master" });
  const sent = [];
  window.addEventListener("message", (event) => { if (event.data.type === 30) sent.push(event.data.data); });
  assert.equal(api.send("到啦"), true);
  assert.equal(api.send(FEET_TOKEN), true);
  assert.deepEqual(sent.map((item) => item.value), ["到啦", FEET_TOKEN]);
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
