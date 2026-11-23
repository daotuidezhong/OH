// 注入到 B站页面（主世界）的放映厅桥：遥控 VideoTogether 建房 / 加入、收发聊天、统计在线人数，
// 并负责“小银幕”模式（只显示视频，点击即放大）。主进程通过 executeJavaScript 调用 window.__ohTheater。
(() => {
  if (window.__ohTheater) return;
  const SEND_TXT_MSG = 30;
  const GOT_TXT_MSG = 31;
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

  const join = () => {
    // 加载器已关掉“标签页存储”（见 vendor/videotogether/README.md）；设置被别处覆盖时再关一次
    if (window.VideoTogetherStorage && window.VideoTogetherStorage.VideoTogetherTabStorageEnabled) window.VideoTogetherStorage.VideoTogetherTabStorageEnabled = false;
    const ext = extension();
    if (!ext || !config) return;
    silence(ext);
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

  window.__ohTheater = {
    configure(next) {
      config = next && typeof next.name === "string" && typeof next.password === "string" ? next : null;
      lastJoinAt = 0;
      join();
    },
    send(text) {
      if (typeof text !== "string" || !text) return false;
      const id = `oh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sentIds.add(id);
      window.postMessage({ source: "VideoTogether", type: SEND_TXT_MSG, data: { currentSendingMsgId: id, value: text } }, "*");
      return true;
    },
    setSmall(next) {
      small = Boolean(next);
      document.documentElement.classList.toggle("oh-small", small);
    },
    drain() {
      const ext = extension();
      silence(ext);
      const role = ext ? (ext.role === ext.RoleEnum.Master ? "master" : ext.role === ext.RoleEnum.Member ? "member" : "none") : "loading";
      return {
        role,
        inRoom: Boolean(ext && config && ext.role !== ext.RoleEnum.Null && ext.roomName === config.name),
        members: ext ? Number(ext.ctxMemberCount) || 0 : 0,
        hasVideo: Boolean(document.querySelector("video")),
        messages: queue.splice(0),
        events: events.splice(0),
      };
    },
  };
})();
