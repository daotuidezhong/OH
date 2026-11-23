// 注入到 B站页面（主世界）的放映厅桥：遥控 VideoTogether 建房 / 加入、收发聊天、统计在线人数，
// 并负责“小银幕”模式（只显示视频，点击即放大）。主进程通过 executeJavaScript 调用 window.__ohTheater。
//
// 两边都能控制：VideoTogether 只上传房主的播放状态、成员跟随。谁在自己的播放器上动手，
// 谁就临时切成房主并通知另一边切成成员（见下面“遥控器”）。
(() => {
  if (window.__ohTheater) return;
  const SEND_TXT_MSG = 30;
  const GOT_TXT_MSG = 31;
  const ROOM_DATA = 22;
  // 控制指令走聊天通道，前缀和牵手信号一样以不可见字符开头，不会显示成气泡
  const CTRL = "\u2063OH:CTRL:";
  const SEEK_TOLERANCE = 3;
  const queue = [];
  const events = [];
  const sentIds = new Set();
  let config = null;
  let lastJoinAt = 0;
  let small = false;
  let lastRoom = null;        // 最近的房间状态（用来提示“TA 暂停了”等）
  const controls = [];        // 给场景的提示：自己接过遥控器（by: me），或对方的操作

  const extension = () => window.videoTogetherExtension || null;

  // 小银幕 / 视频页标记放在 <html> 的自定义属性上：B站会重写 <html> 的 class，属性不会被冲掉；
  // 每次 drain 也会重新确认一遍。
  const mark = (name, on) => {
    const root = document.documentElement;
    if (!root) return;
    if (root.classList) root.classList.toggle(name, on);
    const attribute = `data-${name}`;
    if (typeof root.setAttribute !== "function") return;
    if (on && !root.hasAttribute(attribute)) root.setAttribute(attribute, "");
    if (!on && root.hasAttribute(attribute)) root.removeAttribute(attribute);
  };

  // VideoTogether 自带的面板、提示条全部隐藏，界面交给放映厅场景。
  const style = document.createElement("style");
  style.id = "oh-theater-style";
  style.textContent = `
    #VideoTogetherWrapper, #videoTogetherLoading { display: none !important; }
    html[data-oh-small][data-oh-video]:has(video), html[data-oh-small][data-oh-video]:has(video) body { overflow: hidden !important; background: #000 !important; }
    html[data-oh-small][data-oh-video]:has(video) *:has(video) { transform: none !important; filter: none !important; contain: none !important; will-change: auto !important; }
    html[data-oh-small][data-oh-video] video { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; margin: 0 !important; z-index: 2147483646 !important; object-fit: contain !important; background: #000 !important; transform: none !important; }
    html[data-oh-small], html[data-oh-small] * { cursor: zoom-in !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  // 小银幕时，点哪里都是“放大银幕”，不触发 B站自己的点击（暂停、跳转等）。
  const swallow = (event) => {
    if (!small) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") events.push({ type: "enlarge" });
  };
  for (const type of ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "contextmenu"]) window.addEventListener(type, swallow, true);

  const inRole = (name) => {
    const ext = extension();
    return Boolean(ext && config && ext.RoleEnum && ext.role === ext.RoleEnum[name] && ext.roomName === config.name);
  };

  // ---- 页面 / 视频辅助 ----
  const parseUrl = (href) => { try { return new URL(href); } catch { return null; } };
  const isVideoPage = (href) => {
    const url = parseUrl(href);
    return Boolean(url && url.protocol === "https:" && /(^|\.)bilibili\.com$/.test(url.hostname) && /^\/(video|bangumi\/play|cheese\/play)\//.test(url.pathname));
  };
  // 同一个视频（含分 P）算同一页；分享参数、来源参数不算
  const pageKey = (href) => {
    const url = parseUrl(href);
    if (!url) return "";
    const part = url.searchParams.get("p");
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${part && part !== "1" ? `?p=${part}` : ""}`;
  };
  const cleanVideoUrl = (href) => {
    const url = parseUrl(href);
    const part = url.searchParams.get("p");
    return `${url.origin}${url.pathname}${part ? `?p=${encodeURIComponent(part)}` : ""}`;
  };
  // 页面上真正在放的那个播放器元素。注意 VideoTogether 的 GetVideoDom() 返回的是它内部的视频记录
  // （只有 id、时长等），不是元素本身；元素上挂着同一个 VideoTogetherVideoId，按它找回来。
  const videoOf = (ext) => {
    const elements = typeof document.querySelectorAll === "function" ? Array.from(document.querySelectorAll("video, bwp-video")) : [];
    let model = null;
    try { model = ext && typeof ext.GetVideoDom === "function" ? ext.GetVideoDom() : null; } catch {}
    if (model && model.id !== undefined) {
      const matched = elements.find((element) => element.VideoTogetherVideoId === model.id);
      if (matched) return matched;
    }
    if (model && typeof model.pause === "function" && "currentTime" in model) return model; // 已经是元素
    // 找不到时取时长最长的那个（视频页上就是正片播放器）
    let best = null;
    for (const element of elements) if (!best || (Number(element.duration) || 0) > (Number(best.duration) || 0)) best = element;
    return best || document.querySelector("video");
  };
  const roomTime = (ext, room) => {
    if (room.paused) return Number(room.currentTime) || 0;
    try { return Number(ext.CalculateRealCurrent(room)) || 0; } catch { return Number(room.currentTime) || 0; }
  };
  const storage = () => { try { return window.sessionStorage || null; } catch { return null; } };

  const sendRaw = (text) => {
    const id = `oh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sentIds.add(id);
    window.postMessage({ source: "VideoTogether", type: SEND_TXT_MSG, data: { currentSendingMsgId: id, value: text } }, "*");
  };

  // ---- 遥控器：谁操作播放器，谁临时当房主 ----
  // VideoTogether 里只有房主的播放状态会上传、对方跟随（房主控制观众就是这样做到的）。
  // 所以谁在自己的播放器上动手（拖进度、暂停、播放、换视频），谁就把自己切成房主、立刻上传，
  // 并通知另一边切成成员跟随——两边用的都是房主那条同步路径。
  // “是不是人在操作”看操作前有没有真实的鼠标 / 键盘动作：VideoTogether 自己同步、B站自动播放都没有。
  const GESTURE_MS = 1500;
  const PAGE_GESTURE_MS = 10000;
  let gestureAt = 0;
  let lastTakeoverAt = 0;
  const rememberGesture = (event) => {
    if (event && event.isTrusted === false) return;
    gestureAt = Date.now();
    // 换视频会整页跳转：把时间记在本标签页里，新页面打开后还能认出是自己点过去的
    try { const store = storage(); if (store) store.setItem("oh-theater-gesture", String(gestureAt)); } catch {}
  };
  for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, rememberGesture, true);

  const ACTIONS = { seeking: "seek", play: "play", pause: "pause", ratechange: "rate" };
  // VideoTogether 刚把这边的播放器同步成房间的样子：同步后 1 秒内，和同步目标一致的变化不是人在操作
  // （例如点一下窗口获得焦点时刚好赶上同步，不能当成要接管）；和目标不一致的仍然算。
  const SYNC_WINDOW_MS = 1000;
  let syncTarget = null;
  const causedBySync = (type, video) => {
    if (!syncTarget || Date.now() - syncTarget.at > SYNC_WINDOW_MS) return false;
    if (type === "seeking") return Math.abs((Number(video.currentTime) || 0) - syncTarget.time) < 1.5;
    if (type === "play") return syncTarget.paused === false;
    if (type === "pause") return syncTarget.paused === true || syncTarget.loading;
    return false;
  };

  // 本标签页里“遥控器在谁手里”。B站换视频常常整页刷新，VideoTogether 只能恢复 60 秒内存过的身份，
  // 恢复不了就会回到最初的身份、两边都当房主。这里自己记一份，刷新后以它为准，每次 drain 也会纠正。
  const HOLDER_KEY = "oh-theater-holder";
  const readHolder = () => {
    try {
      const store = storage();
      const saved = store ? JSON.parse(store.getItem(HOLDER_KEY) || "null") : null;
      if (saved && config && saved.room === config.name && (saved.role === "master" || saved.role === "member")) return saved;
    } catch {}
    return null;
  };
  const writeHolder = (role, at) => {
    try { const store = storage(); if (store && config) store.setItem(HOLDER_KEY, JSON.stringify({ room: config.name, role, at })); } catch {}
  };
  const setVtRole = (ext, role, at) => {
    ext.setRole(role === "master" ? ext.RoleEnum.Master : ext.RoleEnum.Member);
    writeHolder(role, at);
  };

  // 当前房主每隔一会儿告诉对方“遥控器在我这”：两边都以为自己是房主时，后接管的留下；
  // 两边都成了成员（消息丢了）时，创建者过一会儿自己收回来，不会卡住。
  const HEARTBEAT_MS = 8000;
  const RECLAIM_MS = 20000;
  let lastHeartbeatAt = 0;
  let lastHolderSeenAt = Date.now();

  let lastAnnounceAt = 0;
  // 告诉另一边“遥控器在我这”：对方如果也是房主（例如页面重开后两边都回到了原来的身份）就让出来
  const announce = (ext, now) => {
    lastAnnounceAt = now;
    let link = typeof location !== "undefined" ? location.href : "";
    try { if (typeof ext.linkWithoutState === "function") link = String(ext.linkWithoutState(link)); } catch {}
    sendRaw(CTRL + JSON.stringify({ a: "takeover", at: now, u: link }));
  };

  const takeOver = (action) => {
    const ext = extension();
    if (!ext || !inRole("Member") || typeof ext.setRole !== "function") return;
    const now = Date.now();
    lastTakeoverAt = now;
    setVtRole(ext, "master", now);
    announce(ext, now);
    kick(ext); // 立刻把自己的播放状态传上去，不等 2 秒周期
    controls.push({ a: action, by: "me" });
    if (controls.length > 20) controls.shift();
  };

  // 对方接过了遥控器（takeover），或对方说遥控器在它那（holder）：自己切成成员跟随
  const yieldTo = (action) => {
    lastHolderSeenAt = Date.now();
    const ext = extension();
    if (!ext || !inRole("Master") || typeof ext.setRole !== "function") return;
    // 两边都是房主：后接管的为准；一样早（例如都还没人动过）就由加入者让出来
    const at = Number(action.at) || 0;
    if (at < lastTakeoverAt) return;
    if (at === lastTakeoverAt && config && config.role === "master") return;
    // 两边本来就在同一个视频：记下对方的地址，跟随时不用重新打开页面；对方换了视频则会被带过去
    if (typeof action.u === "string" && typeof location !== "undefined" && pageKey(action.u) === pageKey(location.href)) ext.url = action.u;
    setVtRole(ext, "member", lastTakeoverAt);
    // 让出遥控器后，接下来播放器的变化都是在跟随对方，不能再当成自己的操作（否则会立刻抢回来）
    gestureAt = 0;
    try { const store = storage(); if (store) store.setItem("oh-theater-gesture", "0"); } catch {}
    kick(ext);
  };

  // 媒体事件不冒泡，但捕获阶段能在 document 上收到
  const onMedia = (event) => {
    const video = event.target;
    if (!video || (video.tagName !== "VIDEO" && video.tagName !== "BWP-VIDEO")) return;
    if (Date.now() - gestureAt > GESTURE_MS) return; // 不是人点出来的
    if (causedBySync(event.type, video)) return; // VideoTogether 在同步这边
    if (typeof location === "undefined" || !isVideoPage(location.href)) return;
    // 页面上的预览小视频不算（正片以外的短视频）
    const main = videoOf(extension());
    if (main && video !== main && (Number(video.duration) || 0) < 60) return;
    if (inRole("Member")) takeOver(ACTIONS[event.type] || "seek");
    else if (inRole("Master")) {
      // 本来就是房主：马上上传，不等 2 秒；拖进度会连续触发，通知对方每秒最多一次
      const ext = extension();
      const now = Date.now();
      lastTakeoverAt = now;
      writeHolder("master", now);
      if (now - lastAnnounceAt > 1000) announce(ext, now);
      kick(ext);
    }
  };
  if (document.addEventListener) for (const type of Object.keys(ACTIONS)) document.addEventListener(type, onMedia, true);

  // 自己换了视频 / 分 P（B站页内切换或整页跳转）：接过房主，VideoTogether 会把对方带过来。
  // 被 VideoTogether 带过来的跳转之前没有自己的点击，不算。
  const checkPage = () => {
    if (typeof location === "undefined" || !config || !(inRole("Member") || inRole("Master"))) return;
    const key = pageKey(location.href);
    const store = storage();
    let previous = null;
    let gesture = gestureAt;
    try {
      previous = store ? store.getItem("oh-theater-page") : null;
      gesture = Math.max(gesture, Number(store ? store.getItem("oh-theater-gesture") : 0) || 0);
      if (store) store.setItem("oh-theater-page", key);
    } catch {}
    if (!previous || previous === key || !isVideoPage(location.href)) return;
    if (Date.now() - gesture > PAGE_GESTURE_MS) return;
    if (inRole("Member")) takeOver("url");
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== "VideoTogether") return;
    if (data.type === ROOM_DATA) {
      const room = data.data;
      if (room && typeof room === "object") {
        const ext = extension();
        // 自己是成员时房间状态变了：那是对方（当前房主）操作的，给场景一个提示
        if (lastRoom && inRole("Member") && !(room.waitForLoadding && !room.paused)) {
          if (pageKey(room.url) !== pageKey(lastRoom.url)) controls.push({ a: "url" });
          else if (room.paused !== lastRoom.paused) controls.push({ a: room.paused ? "pause" : "play", t: roomTime(ext, room) });
          else if (Math.abs(roomTime(ext, room) - roomTime(ext, lastRoom)) > SEEK_TOLERANCE) controls.push({ a: "seek", t: roomTime(ext, room) });
          if (controls.length > 20) controls.shift();
        }
        lastRoom = room;
      }
      return;
    }
    if (data.type !== GOT_TXT_MSG) return;
    const id = data.data && data.data.id;
    const msg = data.data && data.data.msg;
    if (typeof msg !== "string") return;
    if (id && sentIds.has(id)) { sentIds.delete(id); return; } // 自己发的回声，界面里已经显示过
    if (msg.startsWith(CTRL)) {
      let action = null;
      try { action = JSON.parse(msg.slice(CTRL.length)); } catch {}
      if (action && (action.a === "takeover" || action.a === "holder")) yieldTo(action);
      return;
    }
    queue.push({ msg, at: Date.now() });
    if (queue.length > 50) queue.shift();
  });

  const silence = (ext) => {
    if (!ext) return;
    // VideoTogether 收到消息会用语音朗读并弹出提示；放映厅改为冒泡显示。
    if (!ext.__ohSilenced) {
      ext.gotTextMsg = async () => {};
      ext.__ohSilenced = true;
    }
    // 记下 VideoTogether 这次要把播放器同步成什么样（见 causedBySync）
    if (!ext.__ohSyncWrapped && typeof ext.SyncMemberVideo === "function") {
      const original = ext.SyncMemberVideo;
      ext.SyncMemberVideo = function (data, video) {
        const room = data && data.room;
        if (room) syncTarget = { at: Date.now(), paused: room.paused === true, loading: Boolean(room.waitForLoadding && !room.paused), time: roomTime(this, room) };
        return original.call(this, data, video);
      };
      ext.__ohSyncWrapped = true;
    }
  };

  // 遥控器的身份以本标签页记的为准；房主定时报一声；成员太久没听到房主就由创建者收回
  const keepRemote = () => {
    const ext = extension();
    if (!ext || !config || typeof ext.setRole !== "function" || !(inRole("Member") || inRole("Master"))) return;
    const holder = readHolder();
    if (!holder) { writeHolder(inRole("Master") ? "master" : "member", lastTakeoverAt); return; }
    const wanted = holder.role === "master" ? ext.RoleEnum.Master : ext.RoleEnum.Member;
    if (ext.role !== wanted) ext.setRole(wanted);
    const now = Date.now();
    if (inRole("Master")) {
      lastHolderSeenAt = now;
      if (now - lastHeartbeatAt > HEARTBEAT_MS) {
        lastHeartbeatAt = now;
        sendRaw(CTRL + JSON.stringify({ a: "holder", at: lastTakeoverAt }));
      }
    } else if (config.role === "master" && (Number(ext.ctxMemberCount) || 0) >= 2 && now - lastHolderSeenAt > RECLAIM_MS) {
      lastTakeoverAt = now;
      lastHolderSeenAt = now;
      setVtRole(ext, "master", now);
      announce(ext, now);
      kick(ext);
    }
  };

  // VideoTogether 每 2 秒跑一次定时任务（连服务器、上传 / 拉取房间、更新在线人数）。
  // 建房 / 加入后立刻跑一次，不用干等第一个周期；之后交给它自己的节奏，不额外加请求（服务器会限流）。
  const kick = (ext) => {
    if (!ext || typeof ext.ScheduledTask !== "function") return;
    try {
      const running = ext.ScheduledTask();
      if (running && typeof running.catch === "function") running.catch(() => {});
    } catch {}
  };

  const join = () => {
    const ext = extension();
    if (!ext || !config) return;
    silence(ext);
    const { Null, Master } = ext.RoleEnum;
    if (ext.role !== Null && ext.roomName === config.name) return;
    if (Date.now() - lastJoinAt < 2000) return;
    lastJoinAt = Date.now();
    // 页面刷新后按本标签页记的身份回到房间（遥控器可能已经换过手）
    const holder = readHolder();
    if (holder) lastTakeoverAt = Number(holder.at) || 0;
    try {
      if (ext.role !== Null) ext.exitRoom();
      if (!holder && config.role === "master") ext.CreateRoom(config.name, config.password);
      else {
        // 以成员身份进房，再切成该有的身份：不用 CreateRoom，免得把房间进度重置成 0
        ext.JoinRoom(config.name, config.password);
        if (holder && holder.role === "master" && typeof ext.setRole === "function") ext.setRole(Master);
      }
      kick(ext);
    } catch (error) {
      console.error("[oh-theater] join failed", error);
    }
  };
  setInterval(join, 250);

  window.__ohTheater = {
    configure(next) {
      config = next && typeof next.name === "string" && typeof next.password === "string" ? next : null;
      lastJoinAt = 0;
      join();
    },
    send(text) {
      if (typeof text !== "string" || !text || text.startsWith(CTRL)) return false;
      sendRaw(text);
      return true;
    },
    setSmall(next) {
      small = Boolean(next);
      mark("oh-small", small);
    },
    drain() {
      const ext = extension();
      silence(ext);
      keepRemote();
      checkPage();
      // 小银幕只在视频页把播放器铺满；首页 / 搜索页照常显示（首页的预览小视频不会被当成正片放大成黑屏）
      if (typeof location !== "undefined") mark("oh-video", isVideoPage(location.href));
      mark("oh-small", small);
      // VideoTogether 自己的状态栏（面板已隐藏）：报红色错误时把原因带给场景
      let vtError = "";
      try {
        const statusText = document.querySelector("#videoTogetherStatusText");
        if (statusText && statusText.style && statusText.style.color === "red") vtError = String(statusText.textContent || "").trim().slice(0, 60);
      } catch {}
      const role = ext ? (ext.role === ext.RoleEnum.Master ? "master" : ext.role === ext.RoleEnum.Member ? "member" : "none") : "loading";
      return {
        role,
        inRoom: Boolean(ext && config && ext.role !== ext.RoleEnum.Null && ext.roomName === config.name),
        members: ext ? Number(ext.ctxMemberCount) || 0 : 0,
        hasVideo: Boolean(document.querySelector("video")),
        messages: queue.splice(0),
        events: events.splice(0),
        controls: controls.splice(0),
        vtError,
      };
    },
  };
})();
