import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { roomCredentials } from "../app/theater/protocol.ts";

// 两边都能控制：谁在自己的播放器上动手，谁就临时当 VideoTogether 的房主（上传状态），另一边切成成员跟随。
// 这里用一个假的 VideoTogether 服务器把两边接起来，按真实的规则跑：只有房主上传房间状态，成员每次同步跟上。

const bridgeSource = await readFile(new URL("../electron/theater-bridge.js", import.meta.url), "utf8");
const CTRL = "⁣OH:CTRL:";
const MASTER = 2;
const MEMBER = 3;

let clockMs = 1_000_000;
const now = () => clockMs;
const FakeDate = class extends Date {
  static now() { return clockMs; }
};

/** 一边的 B站页面：真实结构的假播放器 + 按真实规则工作的假 VideoTogether + 桥。 */
function side(name, role, href, server, { store = new Map(), vtRole } = {}) {
  const listeners = new Map();
  const docListeners = new Map();
  const sent = [];
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
    VideoTogetherVideoId: `vt-${name}`,
    duration: 1800,
    ended: false,
    paused: false,
    _time: 100,
    get currentTime() { return this._time; },
    // 和浏览器一样：设置 currentTime 先触发 seeking，缓冲好再触发 seeked
    set currentTime(value) { this._time = value; dispatch("seeking", this); dispatch("seeked", this); },
    pause() { if (!this.paused) { this.paused = true; dispatch("pause", this); } },
    play() { if (this.paused) { this.paused = false; dispatch("play", this); } return Promise.resolve(); },
  };
  const credentials = roomCredentials("K7Q2MX");
  const extension = {
    RoleEnum: { Null: 1, Master: MASTER, Member: MEMBER },
    role: vtRole ?? (role === "master" ? MASTER : MEMBER),
    roomName: credentials.name,
    ctxMemberCount: 2,
    url: href,
    gotTextMsg() {},
    CreateRoom() { this.role = MASTER; }, JoinRoom() { this.role = MEMBER; }, exitRoom() { this.role = 1; },
    setRole(next) { this.role = next; },
    linkWithoutState: (link) => String(link),
    // 和真实的 VideoTogether 一样：返回的是视频记录（id、时长），不是元素本身
    GetVideoDom: () => ({ id: video.VideoTogetherVideoId, duration: video.duration, priority: 0 }),
    CalculateRealCurrent: (room) => room.currentTime + (now() - room.lastUpdateClientTime) / 1000,
    // VideoTogether 的定时任务：房主上传自己的状态；成员拉取房间、换页或同步播放器
    ScheduledTask() {
      if (this.role === MASTER) {
        server.room = { url: this.linkWithoutState(location.href), paused: video.paused, currentTime: video.currentTime, lastUpdateClientTime: now(), playbackRate: 1, waitForLoadding: false };
        window.postMessage({ source: "VideoTogether", type: 22, data: server.room });
      } else if (this.role === MEMBER && server.room) {
        const room = server.room;
        window.postMessage({ source: "VideoTogether", type: 22, data: room });
        if (room.url !== this.url) { location.href = room.url; this.url = room.url; server.jumps.push(name); return; }
        this.SyncMemberVideo({ room }, video);
      }
    },
    SyncMemberVideo(data, videoDom) {
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
    // 视频页上除了正片，还有一个推荐区的预览小视频
    querySelectorAll: () => [{ tagName: "VIDEO", VideoTogetherVideoId: "preview", duration: 15, paused: true, currentTime: 0 }, video],
    addEventListener(type, callback) { docListeners.set(type, [...(docListeners.get(type) ?? []), callback]); },
  };
  window.document = document;
  const context = vm.createContext({ window, document, location, console, setInterval: () => 0, Date: FakeDate, Math, Set, Number, Boolean, JSON, URL, Promise, String, Array, Object });
  vm.runInContext(bridgeSource, context);
  window.videoTogetherExtension = extension;
  const api = window.__ohTheater;
  api.configure({ ...credentials, role });
  const drain = () => JSON.parse(JSON.stringify(api.drain()));
  /** 人在这一边点了一下 / 按了键，然后做某件事 */
  const user = (action) => {
    for (const callback of listeners.get("pointerdown") ?? []) callback({ type: "pointerdown", isTrusted: true, preventDefault() {}, stopImmediatePropagation() {} });
    action();
  };
  return { name, api, window, video, extension, location, sent, drain, user, dispatch, store };
}

async function pair() {
  clockMs = 1_000_000;
  const server = { room: null, jumps: [] };
  const url = "https://www.bilibili.com/video/BV1aa411?spm_id_from=x";
  const a = side("A", "master", url, server); // 创建者
  const b = side("B", "member", url, server); // 观众
  a.drain(); b.drain();
  const relay = () => {
    for (const [from, to] of [[a, b], [b, a]]) for (const msg of from.sent.splice(0)) to.window.postMessage({ source: "VideoTogether", type: 31, data: { id: `from-${from.name}`, msg } });
  };
  // 两边各跑一次 VideoTogether 定时任务（房主先上传，成员再跟上）
  const tick = () => {
    clockMs += 2000;
    for (const one of [a, b].sort((x) => (x.extension.role === MASTER ? -1 : 1))) one.extension.ScheduledTask();
  };
  tick();
  return { a, b, server, relay, tick, url };
}

const isMaster = (one) => one.extension.role === MASTER;

test("the viewer drags the progress bar: they take the remote, the creator follows and nobody is pulled back", async () => {
  const { a, b, relay, tick } = await pair();
  assert.ok(isMaster(a) && !isMaster(b));
  b.user(() => { b.video.currentTime = 754; });
  assert.ok(isMaster(b), "观众动手后自己当房主，马上上传");
  assert.ok(b.sent.some((msg) => msg.startsWith(CTRL)), "通知另一边让出房主");
  relay();
  assert.ok(!isMaster(a), "创建者那边切成成员");
  tick(); tick();
  assert.ok(Math.abs(a.video.currentTime - b.video.currentTime) < 0.01, "创建者跟到观众拖到的位置");
  assert.ok(b.video.currentTime > 750, "观众没有被拉回去");
  assert.deepEqual(b.drain().controls.map((item) => item.by), ["me"], "观众这边提示“你在控制播放”");
});

test("pause and play from either side, back and forth", async () => {
  const { a, b, relay, tick } = await pair();
  b.user(() => b.video.pause());
  relay(); tick();
  assert.equal(a.video.paused, true, "观众暂停，创建者也暂停");
  a.drain();
  // 创建者再点播放：遥控器回到创建者手里
  a.user(() => a.video.play());
  relay(); tick();
  assert.ok(isMaster(a) && !isMaster(b));
  assert.equal(b.video.paused, false, "观众跟着继续播放");
  assert.deepEqual(b.drain().controls.filter((item) => item.by !== "me").map((item) => item.a), ["play"], "观众这边提示“TA 继续播放”");
});

test("VideoTogether's own syncing and Bilibili autoplay never take the remote", async () => {
  const { a, b, relay, tick } = await pair();
  // 创建者拖进度：观众被 VideoTogether 同步过去（没有观众自己的点击）
  a.user(() => { a.video.currentTime = 1200; });
  tick();
  assert.ok(Math.abs(b.video.currentTime - 1200) < 3);
  // B站自己暂停 / 播放（没有点击）
  b.video.pause(); b.video.play();
  assert.deepEqual(b.sent, []);
  assert.ok(isMaster(a) && !isMaster(b));
  relay();
  // 点击过去很久以后的变化也不算
  b.user(() => {});
  clockMs += 5000;
  b.video.pause();
  assert.deepEqual(b.sent, []);
  // 推荐区的预览小视频不算
  b.user(() => b.dispatch("pause", { tagName: "VIDEO", VideoTogetherVideoId: "preview", duration: 15, currentTime: 2 }));
  assert.deepEqual(b.sent, []);
});

test("if both grab the remote at once, the later one wins and the other follows", async () => {
  const { a, b, relay, tick } = await pair();
  b.user(() => { b.video.currentTime = 300; });
  clockMs += 200;
  // 观众的消息还没到，创建者也拖了一下（创建者本来就是房主，不需要接管）
  a.user(() => { a.video.currentTime = 900; });
  relay();
  // 创建者更晚动手：创建者继续当房主，观众让出来（让出后的同步不会被当成观众又动了手）
  assert.ok(isMaster(a) && !isMaster(b));
  tick(); tick();
  assert.ok(Math.abs(a.video.currentTime - b.video.currentTime) < 0.01, "两边最终一致");
});

test("the viewer opens another video: the creator is taken there; same video means no reload", async () => {
  const { a, b, server, relay, tick } = await pair();
  b.drain();
  // 观众在 B站里点了另一个视频（页内切换）
  b.user(() => { b.location.href = "https://www.bilibili.com/video/BV1bb422/?p=2"; });
  b.drain();
  assert.ok(isMaster(b));
  relay();
  assert.ok(!isMaster(a));
  tick();
  assert.equal(a.location.href, "https://www.bilibili.com/video/BV1bb422/?p=2", "创建者被带到同一个视频");
  assert.deepEqual(server.jumps, ["A"]);
  // 同一个视频里接管遥控器：跟随的一方不用重新打开页面
  a.user(() => a.video.pause());
  relay(); tick(); tick();
  assert.deepEqual(server.jumps, ["A"], "同一个视频里互相接管不会刷新页面");
  // 首页、搜索页不算换视频
  b.user(() => { b.location.href = "https://search.bilibili.com/all?keyword=cat"; });
  b.drain();
  assert.ok(!isMaster(b));
});

test("if both ended up as host (page reopened), the next action sorts it out", async () => {
  const { a, b, relay, tick } = await pair();
  b.extension.setRole(MASTER);
  clockMs += 1500;
  a.user(() => { a.video.currentTime = 600; });
  relay();
  assert.ok(isMaster(a) && !isMaster(b), "动手的一方通知对方让出来");
  tick(); tick();
  assert.ok(Math.abs(b.video.currentTime - a.video.currentTime) < 0.01);
});

test("only takeover messages are acted on, and the chat box cannot forge them", async () => {
  const { a, b } = await pair();
  a.window.postMessage({ source: "VideoTogether", type: 31, data: { id: "x", msg: `${CTRL}not json` } });
  a.window.postMessage({ source: "VideoTogether", type: 31, data: { id: "y", msg: `${CTRL}${JSON.stringify({ a: "pause" })}` } });
  assert.ok(isMaster(a));
  assert.deepEqual(a.drain().messages, [], "控制消息不会显示成聊天气泡");
  assert.equal(b.api.send(`${CTRL}{"a":"takeover"}`), false);
});

test("clicking the follower's window while it is being synced does not steal the remote", async () => {
  const { a, b, relay, tick } = await pair();
  b.user(() => { b.video.currentTime = 500; });
  relay();
  assert.ok(isMaster(b) && !isMaster(a));
  // 切到左边窗口点了一下（获得焦点），刚好赶上 VideoTogether 把它同步到 500 秒
  b.video._time = 900; tick();
  a.user(() => tick());
  assert.ok(isMaster(b) && !isMaster(a), "同步造成的跳转不算左边动手");
  assert.deepEqual(a.sent, []);
});

test("a full page reload keeps who holds the remote even if VideoTogether forgot", async () => {
  const { a, b, server, relay, tick, url } = await pair();
  b.user(() => { b.video.currentTime = 500; });
  relay(); tick();
  // 观众那边整页刷新：VideoTogether 没能恢复身份（超过 60 秒），桥按本标签页的记录回到房主
  const reloaded = side("B", "member", url, server, { store: b.store, vtRole: 1 });
  reloaded.drain();
  assert.equal(reloaded.extension.role, MASTER, "刷新后仍然是房主");
  // VideoTogether 自己恢复错了身份：下一次 drain 纠正
  reloaded.extension.setRole(MEMBER);
  reloaded.drain();
  assert.equal(reloaded.extension.role, MASTER);
  assert.ok(!isMaster(a));
});

test("two hosts sort themselves out from the periodic check; two followers get rescued by the creator", async () => {
  const { a, b, relay } = await pair();
  // 两边都以为自己是房主（谁都没动过）：加入者让出来
  b.extension.setRole(MASTER);
  clockMs += 9000;
  a.drain(); b.drain();
  relay();
  assert.ok(isMaster(a) && !isMaster(b));
  // 两边都成了成员（消息丢了）：20 秒没听到房主，创建者自己收回
  a.extension.setRole(MEMBER);
  a.store.set("oh-theater-holder", JSON.stringify({ room: roomCredentials("K7Q2MX").name, role: "member", at: 0 }));
  clockMs += 21000;
  a.drain(); b.drain();
  assert.ok(isMaster(a), "创建者收回遥控器");
  relay();
  assert.ok(!isMaster(b));
});
