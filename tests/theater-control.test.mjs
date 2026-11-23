import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { roomCredentials } from "../app/theater/protocol.ts";

const bridgeSource = await readFile(new URL("../electron/theater-bridge.js", import.meta.url), "utf8");
const CTRL = "⁣OH:CTRL:";

let clockMs = 1_000_000;
const now = () => clockMs;
const FakeDate = class extends Date {
  static now() { return clockMs; }
};

/** 一边的 B站页面：假视频、假 VideoTogether、桥。role: "master" | "member"。 */
function side(role, href) {
  const listeners = new Map();
  const docListeners = new Map();
  const sent = [];
  const store = new Map();
  const location = { href };
  const window = {
    addEventListener(type, callback) { listeners.set(type, [...(listeners.get(type) ?? []), callback]); },
    postMessage(data) {
      if (data && data.type === 30) sent.push(data.data.value);
      for (const callback of listeners.get("message") ?? []) callback({ data, source: window });
    },
    sessionStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
  };
  const dispatch = (type, target) => { for (const callback of docListeners.get(type) ?? []) callback({ type, target }); };
  const video = {
    tagName: "VIDEO",
    ended: false,
    paused: true,
    _time: 0,
    get currentTime() { return this._time; },
    set currentTime(value) { this._time = value; dispatch("seeked", this); },
    pause() { if (!this.paused) { this.paused = true; dispatch("pause", this); } },
    play() { if (this.paused) { this.paused = false; dispatch("play", this); } return Promise.resolve(); },
  };
  const credentials = roomCredentials("K7Q2MX");
  const extension = {
    RoleEnum: { Null: 1, Master: 2, Member: 3 },
    role: role === "master" ? 2 : 3,
    roomName: credentials.name,
    ctxMemberCount: 2,
    gotTextMsg() {},
    CreateRoom() {}, JoinRoom() {}, exitRoom() {},
    GetVideoDom: () => video,
    CalculateRealCurrent: (room) => room.currentTime + (now() - room.lastUpdateClientTime) / 1000,
    // 和 VideoTogether 一样：把成员的视频改成房间的样子
    async SyncMemberVideo(data, videoDom) {
      const room = data.room;
      const target = room.paused ? room.currentTime : this.CalculateRealCurrent(room);
      if (Math.abs(videoDom.currentTime - target) > 1) videoDom.currentTime = target;
      if (room.paused) videoDom.pause(); else videoDom.play();
    },
  };
  const document = {
    head: { appendChild() {} },
    documentElement: { classList: { toggle() {} } },
    createElement: () => ({}),
    querySelector: () => video,
    addEventListener(type, callback) { docListeners.set(type, [...(docListeners.get(type) ?? []), callback]); },
  };
  window.document = document;
  const context = vm.createContext({ window, document, location, console, setInterval: () => 0, Date: FakeDate, Math, Set, Number, Boolean, JSON, URL, Promise, String, Array });
  vm.runInContext(bridgeSource, context);
  window.videoTogetherExtension = extension;
  const api = window.__ohTheater;
  api.configure({ ...credentials, role });
  const drain = () => JSON.parse(JSON.stringify(api.drain()));
  return { api, window, video, extension, location, sent, drain, store, dispatch };
}

/** 假的 VideoTogether 服务器：转发聊天、把房间状态推给成员并让成员同步。 */
function link(master, member) {
  const relay = () => {
    for (const msg of member.sent.splice(0)) master.window.postMessage({ source: "VideoTogether", type: 31, data: { id: "from-member", msg } });
    for (const msg of master.sent.splice(0)) member.window.postMessage({ source: "VideoTogether", type: 31, data: { id: "from-master", msg } });
  };
  const roomFromMaster = () => ({ url: master.location.href, paused: master.video.paused, currentTime: master.video.currentTime, lastUpdateClientTime: now(), playbackRate: 1, waitForLoadding: false });
  // 成员这边一次同步：先收到房间状态，再被拉到房间的样子
  const tick = async () => {
    const room = roomFromMaster();
    member.window.postMessage({ source: "VideoTogether", type: 22, data: room });
    await member.extension.SyncMemberVideo({ room }, member.video);
  };
  return { relay, tick };
}

async function pair() {
  clockMs = 1_000_000;
  const master = side("master", "https://www.bilibili.com/video/BV1aa411?p=1&spm_id_from=x");
  const member = side("member", "https://www.bilibili.com/video/BV1aa411");
  master.drain(); member.drain(); // 让桥接上 VideoTogether（静音、包装同步）
  // 页面刚打开的几秒（B站自动播放、从历史位置继续）不算成员操作：先确认这一点，再过了这段时间开始测
  member.video.pause();
  assert.deepEqual(member.sent, [], "刚打开页面时的暂停 / 播放不当成成员操作");
  member.video.paused = false;
  clockMs += 7000;
  master.video._time = 100; master.video.paused = false;
  const net = link(master, member);
  await net.tick();
  assert.equal(member.video.paused, false);
  assert.ok(Math.abs(member.video.currentTime - 100) < 0.01);
  assert.deepEqual(member.sent, [], "VideoTogether 自己同步引起的播放 / 跳转不算成员的操作");
  return { master, member, net };
}

test("the viewer pauses on their own player: the host follows and the viewer is not pulled back", async () => {
  const { master, member, net } = await pair();
  clockMs += 3000;
  member.video.pause();
  assert.equal(member.sent.length, 1);
  assert.ok(member.sent[0].startsWith(CTRL));
  // 房主那边还没执行到：成员这边不被拉回播放
  await member.extension.SyncMemberVideo({ room: { url: master.location.href, paused: false, currentTime: 100, lastUpdateClientTime: now() - 3000, playbackRate: 1 } }, member.video);
  assert.equal(member.video.paused, true, "等待期间不闪回");
  net.relay();
  assert.equal(master.video.paused, true, "房主那边跟着暂停");
  assert.deepEqual(master.drain().controls.map((item) => item.a), ["pause"]);
  assert.deepEqual(master.drain().messages, [], "控制指令不会显示成聊天气泡");
  await net.tick();
  assert.equal(member.video.paused, true);
  assert.deepEqual(member.drain().controls, [], "自己的操作不提示“TA 暂停了”");
  assert.deepEqual(member.sent, []);
});

test("the viewer resumes and seeks; the host's own actions show up on the viewer's side", async () => {
  const { master, member, net } = await pair();
  member.video.pause();
  net.relay();
  await net.tick();
  member.drain(); master.drain();
  // 继续播放
  member.video.play();
  net.relay();
  assert.equal(master.video.paused, false);
  await net.tick();
  // 拖进度到 12:34
  member.video.currentTime = 754;
  net.relay();
  assert.ok(Math.abs(master.video.currentTime - 754) < 0.01, "房主那边跳到同一个时间");
  assert.equal(master.video.paused, false);
  assert.deepEqual(master.drain().controls.map((item) => item.a), ["play", "seek"]);
  await net.tick();
  assert.deepEqual(member.drain().controls, []);
  // 房主自己暂停：成员被同步，并提示“TA 暂停了”
  clockMs += 1000;
  master.video.pause();
  await net.tick();
  assert.equal(member.video.paused, true);
  assert.deepEqual(member.drain().controls.map((item) => item.a), ["pause"]);
  assert.deepEqual(member.sent, [], "被房主同步的暂停不会再发回去");
});

test("the viewer opens another video: the host switches too, without bouncing back", async () => {
  const { master, member, net } = await pair();
  // 成员页面上记着上一个页面（同一个标签页里跳转后保留）
  member.drain();
  member.location.href = "https://www.bilibili.com/video/BV1bb422/?p=2&vd_source=abc";
  member.drain();
  assert.equal(member.sent.length, 1);
  net.relay();
  assert.equal(master.location.href, "https://www.bilibili.com/video/BV1bb422/?p=2", "房主换到同一个视频（去掉来源参数）");
  assert.deepEqual(master.drain().controls.map((item) => item.a), ["url"]);
  // 房主换视频、成员还没被带过去：成员不会把旧视频发回去
  master.location.href = "https://www.bilibili.com/video/BV1cc433";
  member.location.href = "https://www.bilibili.com/video/BV1bb422/?p=2";
  await net.tick();
  member.drain();
  member.location.href = "https://www.bilibili.com/video/BV1cc433";
  member.drain();
  assert.deepEqual(member.sent, [], "被房主带过去的跳转不算成员换视频");
  // 首页、搜索页不算换视频
  member.location.href = "https://search.bilibili.com/all?keyword=cat";
  member.drain();
  assert.deepEqual(member.sent, []);
});

test("preview videos on the home page are not the viewer's actions", async () => {
  const { member } = await pair();
  member.location.href = "https://www.bilibili.com/";
  const preview = { tagName: "VIDEO", ended: false, paused: true, currentTime: 3 };
  // 首页上的预览小视频暂停 / 跳转：不发给房主
  for (const type of ["pause", "seeked"]) member.dispatch(type, preview);
  member.dispatch("pause", member.video);
  assert.deepEqual(member.sent, []);
});

test("only the host executes partner commands, and only Bilibili video pages", async () => {
  const { master, member } = await pair();
  // 成员收到控制指令不执行（只有房主上传房间状态）
  member.window.postMessage({ source: "VideoTogether", type: 31, data: { id: "x", msg: `${CTRL}${JSON.stringify({ a: "pause", t: 1 })}` } });
  assert.equal(member.video.paused, false);
  // 房主不跳到 B站以外的地址
  master.window.postMessage({ source: "VideoTogether", type: 31, data: { id: "y", msg: `${CTRL}${JSON.stringify({ a: "url", u: "https://evil.example/video/x" })}` } });
  master.window.postMessage({ source: "VideoTogether", type: 31, data: { id: "z", msg: `${CTRL}not json` } });
  assert.equal(master.location.href, "https://www.bilibili.com/video/BV1aa411?p=1&spm_id_from=x");
  assert.deepEqual(master.drain().messages, []);
  // 场景的聊天发送不能伪造控制指令
  assert.equal(member.api.send(`${CTRL}{"a":"pause"}`), false);
});
