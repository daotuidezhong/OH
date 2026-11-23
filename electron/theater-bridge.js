// 注入到 B站页面（主世界）的放映厅桥：遥控 VideoTogether 建房 / 加入、收发聊天、统计在线人数，
// 并负责“小银幕”模式（只显示视频，点击即放大）。主进程通过 executeJavaScript 调用 window.__ohTheater。
//
// 两边都能控制：VideoTogether 只认房主（创建者）的播放状态，成员每秒被拉回房主的进度。
// 成员自己暂停 / 播放 / 拖进度 / 换视频时，桥把这个操作作为隐藏消息发给房主，房主那边代为执行，
// 再由 VideoTogether 照常同步给两个人；等待期间暂缓把成员拉回去，画面不会闪回。
(() => {
  if (window.__ohTheater) return;
  const SEND_TXT_MSG = 30;
  const GOT_TXT_MSG = 31;
  const ROOM_DATA = 22;
  // 控制指令走聊天通道，前缀和牵手信号一样以不可见字符开头，不会显示成气泡
  const CTRL = "\u2063OH:CTRL:";
  const HOLD_SYNC_MS = 4000;
  const SEEK_TOLERANCE = 3;
  // 页面刚打开时 B站会自动播放、从观看历史的位置继续：这几秒里播放器的变化不算成员的操作
  const SETTLE_MS = 6000;
  const loadedAt = Date.now();
  const queue = [];
  const events = [];
  const sentIds = new Set();
  let config = null;
  let lastJoinAt = 0;
  let small = false;
  let lastRoom = null;        // 成员最近收到的房间状态（VideoTogether 正要同步成的样子）
  let holdSyncUntil = 0;      // 成员刚操作过：这之前不把成员拉回房主进度
  let pendingCtrl = null;     // 成员发出、房主还没执行到的操作
  let lastSent = null;
  const controls = [];        // 对方的操作（房主这边：执行了的成员操作；成员这边：房主的操作），给场景显示提示

  const extension = () => window.videoTogetherExtension || null;

  // VideoTogether 自带的面板、提示条全部隐藏，界面交给放映厅场景。
  const style = document.createElement("style");
  style.id = "oh-theater-style";
  style.textContent = `
    #VideoTogetherWrapper, #videoTogetherLoading { display: none !important; }
    html.oh-small.oh-video-page:has(video), html.oh-small.oh-video-page:has(video) body { overflow: hidden !important; background: #000 !important; }
    html.oh-small.oh-video-page:has(video) *:has(video) { transform: none !important; filter: none !important; contain: none !important; will-change: auto !important; }
    html.oh-small.oh-video-page video { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; margin: 0 !important; z-index: 2147483646 !important; object-fit: contain !important; background: #000 !important; transform: none !important; }
    html.oh-small, html.oh-small * { cursor: zoom-in !important; }
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
  const videoOf = (ext) => (ext && typeof ext.GetVideoDom === "function" && ext.GetVideoDom()) || document.querySelector("video");
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

  // ---- 成员：把自己的操作发给房主 ----
  const sendCtrl = (action) => {
    const now = Date.now();
    // 同一个操作在短时间里重复触发（例如拖动时连着几次 seeked）只发一次
    if (lastSent && lastSent.a === action.a && now - lastSent.at < 400 && Math.abs((lastSent.t || 0) - (action.t || 0)) < 0.5 && lastSent.u === action.u) return;
    lastSent = { ...action, at: now };
    pendingCtrl = action;
    holdSyncUntil = now + HOLD_SYNC_MS;
    sendRaw(CTRL + JSON.stringify(action));
  };

  // 房间状态已经变成成员要的样子：马上恢复同步
  const settlePending = (ext, room) => {
    if (!pendingCtrl) return;
    const action = pendingCtrl;
    const t = roomTime(ext, room);
    const done = action.a === "pause" ? room.paused === true && Math.abs(t - action.t) < 2
      : action.a === "play" ? room.paused === false
      : action.a === "seek" ? Math.abs(t - action.t) < 2
      : action.a === "url" ? pageKey(room.url) === pageKey(action.u)
      : true;
    if (done) { pendingCtrl = null; holdSyncUntil = 0; }
  };

  // 媒体事件不冒泡，但捕获阶段能在 document 上收到
  const onMedia = (event) => {
    const video = event.target;
    if (!video || (video.tagName !== "VIDEO" && video.tagName !== "BWP-VIDEO") || !lastRoom || !inRole("Member")) return;
    // 只认视频页上的主播放器：首页、列表里的预览小视频自己播放 / 暂停不算
    if (typeof location === "undefined" || !isVideoPage(location.href) || video !== videoOf(extension())) return;
    if (Date.now() - loadedAt < SETTLE_MS) return;
    const room = lastRoom;
    // 房主在等对方缓冲时，VideoTogether 会让成员暂停 / 播放，那不是成员自己的操作
    if (room.waitForLoadding && !room.paused) return;
    const ext = extension();
    const t = Number(video.currentTime) || 0;
    if (event.type === "pause" && !video.ended && room.paused === false) sendCtrl({ a: "pause", t });
    else if (event.type === "play" && room.paused === true) sendCtrl({ a: "play", t });
    else if (event.type === "seeked" && Math.abs(t - roomTime(ext, room)) > SEEK_TOLERANCE) sendCtrl({ a: "seek", t, paused: Boolean(video.paused) });
  };
  if (document.addEventListener) for (const type of ["play", "pause", "seeked"]) document.addEventListener(type, onMedia, true);

  // 成员自己换了视频 / 分 P（不是被 VideoTogether 带过去的）：请房主也换过去。
  // 只在成员这边的页面发生变化时判断；房主换视频、成员被带走时，新页面就是房间里的页面，不会再发回去。
  const checkPage = () => {
    if (!lastRoom || !inRole("Member") || typeof location === "undefined") return;
    const here = location.href;
    const key = pageKey(here);
    const store = storage();
    let previous = null;
    try { previous = store ? store.getItem("oh-theater-page") : null; } catch {}
    try { if (store) store.setItem("oh-theater-page", key); } catch {}
    if (!previous || previous === key) return;
    if (!isVideoPage(here) || key === pageKey(lastRoom.url)) return;
    sendCtrl({ a: "url", u: cleanVideoUrl(here) });
  };

  // ---- 房主：执行对方的操作 ----
  const applyCtrl = (action) => {
    if (!action || typeof action !== "object" || !inRole("Master")) return;
    const ext = extension();
    if (action.a === "url") {
      if (typeof action.u !== "string" || !isVideoPage(action.u)) return;
      controls.push({ a: "url" });
      if (pageKey(action.u) !== pageKey(location.href)) location.href = cleanVideoUrl(action.u);
      return;
    }
    if (!["pause", "play", "seek"].includes(action.a)) return;
    const video = videoOf(ext);
    if (!video) return;
    const t = Number(action.t);
    if (Number.isFinite(t) && t >= 0 && (action.a === "seek" || Math.abs((Number(video.currentTime) || 0) - t) > 1.5)) video.currentTime = t;
    const wantPaused = action.a === "pause" ? true : action.a === "play" ? false : Boolean(action.paused);
    if (wantPaused && !video.paused) video.pause();
    if (!wantPaused && video.paused) {
      const playing = video.play();
      if (playing && typeof playing.catch === "function") playing.catch(() => {});
    }
    controls.push({ a: action.a, t: Number.isFinite(t) ? t : 0 });
    if (controls.length > 20) controls.shift();
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== "VideoTogether") return;
    if (data.type === ROOM_DATA) {
      const room = data.data;
      if (room && typeof room === "object") {
        const ext = extension();
        // 房间状态变了、又不是自己刚发起的操作：那是对方（房主）操作的，给场景一个提示
        if (lastRoom && !pendingCtrl && inRole("Member") && !(room.waitForLoadding && !room.paused)) {
          if (pageKey(room.url) !== pageKey(lastRoom.url)) controls.push({ a: "url" });
          else if (room.paused !== lastRoom.paused) controls.push({ a: room.paused ? "pause" : "play", t: roomTime(ext, room) });
          else if (Math.abs(roomTime(ext, room) - roomTime(ext, lastRoom)) > SEEK_TOLERANCE) controls.push({ a: "seek", t: roomTime(ext, room) });
          if (controls.length > 20) controls.shift();
        }
        lastRoom = room;
        settlePending(ext, room);
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
      applyCtrl(action);
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
    // 成员刚操作、房主还没执行到时，先不把成员拉回房主的进度
    if (!ext.__ohSyncWrapped && typeof ext.SyncMemberVideo === "function") {
      const original = ext.SyncMemberVideo;
      ext.SyncMemberVideo = function (data, video) {
        if (Date.now() < holdSyncUntil) return Promise.resolve();
        return original.call(this, data, video);
      };
      ext.__ohSyncWrapped = true;
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
    const { Null, Master, Member } = ext.RoleEnum;
    const wanted = config.role === "master" ? Master : Member;
    if (ext.role !== Null && ext.roomName === config.name) return;
    if (Date.now() - lastJoinAt < 2000) return;
    lastJoinAt = Date.now();
    try {
      if (ext.role !== Null) ext.exitRoom();
      if (wanted === Master) ext.CreateRoom(config.name, config.password);
      else ext.JoinRoom(config.name, config.password);
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
      document.documentElement.classList.toggle("oh-small", small);
    },
    drain() {
      const ext = extension();
      silence(ext);
      checkPage();
      // 小银幕只在视频页把播放器铺满；首页 / 搜索页照常显示（首页的预览小视频不会被当成正片放大成黑屏）
      if (typeof location !== "undefined") document.documentElement.classList.toggle("oh-video-page", isVideoPage(location.href));
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
