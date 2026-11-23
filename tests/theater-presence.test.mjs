import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { roomCredentials } from "../app/theater/protocol.ts";

// 两台电脑都停在 B站首页（没有视频）时，VideoTogether 的在线人数永远是 1（成员只在同步视频时才向服务器报到）。
// 放映厅靠互发“我在”信号判断 TA 在不在。这里用假的聊天转发把两边的桥接起来验证。

const bridgeSource = await readFile(new URL("../electron/theater-bridge.js", import.meta.url), "utf8");
let clockMs = 1_000_000;
const FakeDate = class extends Date {
  static now() { return clockMs; }
};

function side(role) {
  const listeners = new Map();
  const sent = [];
  const window = {
    addEventListener(type, callback) { listeners.set(type, [...(listeners.get(type) ?? []), callback]); },
    postMessage(data) {
      if (data && data.type === 30) sent.push(data.data.value);
      for (const callback of listeners.get("message") ?? []) callback({ data, source: window });
    },
    localStorage: { getItem: () => "https://api.videotogether.cn", setItem() {} },
  };
  const credentials = roomCredentials("4VZCMD");
  const extension = {
    RoleEnum: { Null: 1, Master: 2, Member: 3 },
    role: 1,
    roomName: "",
    ctxMemberCount: 1, // 首页没有视频：服务器只算到 1 个人
    video_together_host: "https://api.videotogether.cn",
    gotTextMsg() {},
    CreateRoom(name) { this.role = 2; this.roomName = name; },
    JoinRoom(name) { this.role = 3; this.roomName = name; },
    exitRoom() { this.role = 1; this.roomName = ""; },
    SyncTimeWithServer() {},
  };
  const document = {
    head: { appendChild() {} },
    documentElement: { classList: { toggle() {} } },
    createElement: () => ({}),
    querySelector: () => null, // 首页：没有视频
  };
  window.document = document;
  const context = vm.createContext({ window, document, console, setInterval: () => 0, setTimeout: () => 0, Date: FakeDate, Math, Set, Number, Boolean, JSON, String, atob });
  vm.runInContext(bridgeSource, context);
  window.videoTogetherExtension = extension;
  const api = window.__ohTheater;
  api.configure({ ...credentials, role });
  const drain = () => JSON.parse(JSON.stringify(api.drain()));
  return { api, window, sent, drain };
}

test("partner shows as online from the hidden 'I am here' signal even with no video on either page", () => {
  clockMs = 1_000_000;
  const host = side("master");
  const guest = side("member");
  const relay = () => {
    for (const [from, to] of [[host, guest], [guest, host]]) for (const msg of from.sent.splice(0)) to.window.postMessage({ source: "VideoTogether", type: 31, data: { id: `from-${from === host ? "host" : "guest"}`, msg } });
  };
  // 还没收到对方的信号：只有自己
  assert.equal(host.drain().members, 1);
  assert.equal(guest.drain().members, 1);
  relay();
  assert.equal(host.drain().members, 2, "收到观众的信号：TA 在线");
  assert.equal(guest.drain().members, 2, "收到房主的信号：TA 在线");
  assert.deepEqual(host.drain().messages, [], "信号不会显示成聊天气泡");
  // 每 6 秒补发一次，一直在线
  for (let i = 0; i < 5; i += 1) { clockMs += 6000; host.drain(); guest.drain(); relay(); }
  assert.equal(host.drain().members, 2);
  assert.equal(host.drain().diag.partnerSignal, 0);
  // 观众关掉放映厅：20 秒收不到信号就算离开
  clockMs += 21000;
  host.drain(); relay();
  assert.equal(host.drain().members, 1, "TA 离开后座位空出来");
  // 聊天框不能伪造信号
  assert.equal(guest.api.send("⁣OH:HERE"), false);
});
