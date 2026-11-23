// 注入到 B站页面（主世界）的放映厅桥：遥控 VideoTogether 建房 / 加入、收发聊天、统计在线人数，
// 并负责“小银幕”模式（只显示视频，点击即放大）。主进程通过 executeJavaScript 调用 window.__ohTheater。
(() => {
  if (window.__ohTheater) return;
  const SEND_TXT_MSG = 30;
  const GOT_TXT_MSG = 31;
  // “我在”信号：VideoTogether 的在线人数只在页面上有视频、成员在同步视频时才会向服务器报到，
  // 两个人都还在 B站首页时人数永远是 1。两边进房后每隔几秒互发一个隐藏信号（和聊天走同一条连接），
  // 收到对方的信号就算 TA 在线。
  const PRESENCE = "\u2063OH:HERE";
  const PRESENCE_EVERY_MS = 6000;
  const PRESENCE_TIMEOUT_MS = 20000;
  let lastPresenceSentAt = 0;
  let partnerSeenAt = 0;
  const queue = [];
  const events = [];
  const sentIds = new Set();
  let config = null;
  let lastJoinAt = 0;
  let small = false;

  const extension = () => window.videoTogetherExtension || null;

  // VideoTogether 自带的面板、提示条全部隐藏，界面交给放映厅场景。
  const style = document.createElement("style");
  style.id = "oh-theater-style";
  style.textContent = `
    #VideoTogetherWrapper, #videoTogetherLoading { display: none !important; }
    html.oh-small:has(video), html.oh-small:has(video) body { overflow: hidden !important; background: #000 !important; }
    html.oh-small:has(video) *:has(video) { transform: none !important; filter: none !important; contain: none !important; will-change: auto !important; }
    html.oh-small video { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; margin: 0 !important; z-index: 2147483646 !important; object-fit: contain !important; background: #000 !important; transform: none !important; }
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

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== "VideoTogether" || data.type !== GOT_TXT_MSG) return;
    const id = data.data && data.data.id;
    const msg = data.data && data.data.msg;
    if (typeof msg !== "string") return;
    if (id && sentIds.has(id)) { sentIds.delete(id); return; } // 自己发的回声，界面里已经显示过
    if (msg === PRESENCE) { partnerSeenAt = Date.now(); return; }
    // 对方发来任何消息也说明 TA 在
    partnerSeenAt = Date.now();
    queue.push({ msg, at: Date.now() });
    if (queue.length > 50) queue.shift();
  });

  const silence = (ext) => {
    // VideoTogether 收到消息会用语音朗读并弹出提示；放映厅改为冒泡显示。
    if (!ext || ext.__ohSilenced) return;
    ext.gotTextMsg = async () => {};
    ext.__ohSilenced = true;
  };

  // VideoTogether 的弹窗（alert）会卡住整个 B站页面，放映厅里不弹
  window.alert = (message) => { console.warn("[oh-theater] VideoTogether:", message); };

  // ---- 固定同步服务器 ----
  // VideoTogether 有两台互不相通的服务器：先连主服务器，3 秒没连通就去 CDN 配置里取国内服务器改连；
  // 两个请求都在路上时，谁后响应就用谁。两台电脑网络不同，就会落在不同服务器上，房间名一样也永远等不到对方。
  // 这里和 VideoTogether 一样从它的国内 CDN 配置取国内服务器地址，两边拿到的是同一份，然后锁定只用它。
  const CDN_CONFIG = "https://videotogether.oss-cn-hangzhou.aliyuncs.com/release/cdn-config.json";
  const MAIN_HOST = "https://vt.panghair.com:5000/";
  const HOST_KEY = "oh-theater-vt-host";
  let pinnedHost = null;
  try { pinnedHost = window.localStorage.getItem(HOST_KEY) || null; } catch {}
  const decodeHost = (value) => (typeof value === "string" && value ? (value.startsWith("https") ? value : atob(value)) : "");
  const resolveHost = () => {
    let settled = false;
    const settle = (host) => {
      if (settled) return;
      settled = true;
      pinnedHost = host;
      try { window.localStorage.setItem(HOST_KEY, host); } catch {}
    };
    setTimeout(() => settle(pinnedHost || MAIN_HOST), 4000); // 取不到配置：沿用上次的，或主服务器
    try {
      fetch(CDN_CONFIG, { cache: "no-store" })
        .then((response) => response.json())
        .then((cdn) => { const host = decodeHost(cdn && cdn.apiHostChina); if (/^https:\/\//.test(host)) settle(host); })
        .catch(() => {});
    } catch {}
  };
  if (typeof fetch === "function") resolveHost();
  // 让 VideoTogether 只连锁定的服务器；已经连到别的服务器上了就退出、换过来重新进房
  const pinHost = (ext) => {
    if (!pinnedHost) return false;
    if (!ext.__ohHostPinned && typeof ext.SyncTimeWithServer === "function") {
      const original = ext.SyncTimeWithServer;
      ext.SyncTimeWithServer = function (url) { return original.call(this, pinnedHost || url); };
      ext.__ohHostPinned = true;
    }
    ext.video_together_main_host = pinnedHost;
    if (ext.video_together_host !== pinnedHost) {
      ext.video_together_host = pinnedHost;
      if (ext.role !== ext.RoleEnum.Null) { try { ext.exitRoom(); } catch {} lastJoinAt = 0; }
    }
    return true;
  };

  const join = () => {
    // 加载器已关掉“标签页存储”（见 vendor/videotogether/README.md）；设置被别处覆盖时再关一次
    if (window.VideoTogetherStorage && window.VideoTogetherStorage.VideoTogetherTabStorageEnabled) window.VideoTogetherStorage.VideoTogetherTabStorageEnabled = false;
    const ext = extension();
    if (!ext || !config) return;
    silence(ext);
    // 服务器定下来之前不进房
    if (!pinHost(ext)) return;
    const { Null, Master, Member } = ext.RoleEnum;
    const wanted = config.role === "master" ? Master : Member;
    if (ext.role !== Null && ext.roomName === config.name) return;
    if (Date.now() - lastJoinAt < 5000) return;
    lastJoinAt = Date.now();
    try {
      if (ext.role !== Null) ext.exitRoom();
      if (wanted === Master) ext.CreateRoom(config.name, config.password);
      else ext.JoinRoom(config.name, config.password);
    } catch (error) {
      console.error("[oh-theater] join failed", error);
    }
  };
  setInterval(join, 1000);

  const sendRaw = (text) => {
    const id = `oh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sentIds.add(id);
    window.postMessage({ source: "VideoTogether", type: SEND_TXT_MSG, data: { currentSendingMsgId: id, value: text } }, "*");
  };
  const inOurRoom = () => {
    const ext = extension();
    return Boolean(ext && config && ext.RoleEnum && ext.role !== ext.RoleEnum.Null && ext.roomName === config.name);
  };
  const announcePresence = () => {
    if (!inOurRoom() || Date.now() - lastPresenceSentAt < PRESENCE_EVERY_MS) return;
    lastPresenceSentAt = Date.now();
    sendRaw(PRESENCE);
  };
  setInterval(announcePresence, 1000);

  // 诊断：VideoTogether 内部的连接状态，票根上点线路文字可以展开查看（排查两台电脑连不上）
  const diagnose = (ext) => {
    const text = (value) => (value === undefined || value === null ? "" : String(value)).slice(0, 160);
    let status = "";
    let statusColor = "";
    try {
      const statusText = document.querySelector("#videoTogetherStatusText");
      if (statusText) { status = text(statusText.textContent).trim(); statusColor = text(statusText.style && statusText.style.color); }
    } catch {}
    if (!ext) return { ready: false, status, statusColor, page: text(typeof location !== "undefined" ? location.href : "") };
    return {
      ready: true,
      host: text(ext.video_together_host),
      pinned: text(pinnedHost),
      wsOpen: Boolean(ext.ctxWsIsOpen),
      httpOk: Boolean(ext.httpSucc),
      minTrip: Number(ext.minTrip) || 0,
      role: ext.role === ext.RoleEnum.Master ? "房主" : ext.role === ext.RoleEnum.Member ? "成员" : "未进房",
      room: text(ext.roomName),
      members: Number(ext.ctxMemberCount) || 0,
      partnerSignal: partnerSeenAt ? Math.round((Date.now() - partnerSeenAt) / 1000) : -1,
      status,
      statusColor,
      page: text(typeof location !== "undefined" ? location.href : ""),
    };
  };

  window.__ohTheater = {
    configure(next) {
      config = next && typeof next.name === "string" && typeof next.password === "string" ? next : null;
      lastJoinAt = 0;
      join();
    },
    send(text) {
      if (typeof text !== "string" || !text || text === PRESENCE) return false;
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
      announcePresence();
      const role = ext ? (ext.role === ext.RoleEnum.Master ? "master" : ext.role === ext.RoleEnum.Member ? "member" : "none") : "loading";
      return {
        role,
        inRoom: Boolean(ext && config && ext.role !== ext.RoleEnum.Null && ext.roomName === config.name),
        // VideoTogether 的人数（有视频同步时才准）和“我在”信号取大的
        members: Math.max(ext ? Number(ext.ctxMemberCount) || 0 : 0, partnerSeenAt && Date.now() - partnerSeenAt < PRESENCE_TIMEOUT_MS ? 2 : 0),
        // 连的是哪条线路：两台电脑不一样就连不上
        line: pinnedHost ? (pinnedHost === MAIN_HOST ? "主线路" : "国内线路") : "",
        hasVideo: Boolean(document.querySelector("video")),
        messages: queue.splice(0),
        events: events.splice(0),
        diag: diagnose(ext),
      };
    },
  };
})();
