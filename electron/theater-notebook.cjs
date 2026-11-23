// 放映厅笔记本：自动记下两个人一起看过的视频、聊天和牵手。
// 只存在本机（userData 里的一个 JSON 文件），两台电脑各记一份；两人看的是同一个视频、聊天两边都能收到，所以内容一致。
// 不依赖 Electron，方便单独测试。
const fs = require("node:fs");
const path = require("node:path");

const VERSION = 1;
// 离开后多久之内回来还算同一次“一起看”
const SAME_VISIT_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 300;
const MAX_ITEMS = 2000;
const MAX_TEXT = 400;
const SAVE_DELAY_MS = 800;

const now = () => Date.now();
const clean = (value, max = MAX_TEXT) => String(value ?? "").replace(/[\u0000-\u001f⁣]/g, " ").trim().slice(0, max);

function emptyBook() {
  return { version: VERSION, sessions: [] };
}

function readBook(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value && Array.isArray(value.sessions)) return { version: VERSION, sessions: value.sessions.filter((item) => item && typeof item.id === "string") };
  } catch {}
  return emptyBook();
}

/** B站视频的“同一个视频”判断：同一个 BV / 番剧集 / 分 P 算一个 */
function videoKey(url) {
  try {
    const parsed = new URL(url);
    const part = parsed.searchParams.get("p");
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}${part && part !== "1" ? `?p=${part}` : ""}`;
  } catch {
    return "";
  }
}

/** 打开一个笔记本文件。所有写入都会合并、延迟一点再落盘（原子写入）。 */
function openNotebook(file, { clock = now } = {}) {
  const book = readBook(file);
  let saveTimer = null;

  const save = () => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(book), "utf8");
      fs.renameSync(temporary, file);
    } catch (error) {
      console.error("[theater] 笔记本保存失败", error);
    }
  };
  const scheduleSave = () => {
    if (!saveTimer) saveTimer = setTimeout(save, SAVE_DELAY_MS);
  };

  /** 当前这次“一起看”：同一个放映厅、上次记录在 30 分钟内就接着记，否则翻新的一页 */
  const current = (room) => {
    const at = clock();
    const last = book.sessions[book.sessions.length - 1];
    if (last && last.room === room && at - last.lastAt < SAME_VISIT_MS) return last;
    const session = { id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, room, startedAt: at, lastAt: at, togetherMs: 0, videos: [], items: [] };
    book.sessions.push(session);
    if (book.sessions.length > MAX_SESSIONS) book.sessions.splice(0, book.sessions.length - MAX_SESSIONS);
    return session;
  };
  const touch = (session) => {
    session.lastAt = clock();
    scheduleSave();
  };

  return {
    /** 两人都在：累计一起看的时间（由轮询按间隔调用） */
    together(room, elapsedMs) {
      if (!room || !(elapsedMs > 0)) return;
      const session = current(room);
      session.togetherMs += Math.min(elapsedMs, 60 * 1000);
      touch(session);
    },
    /** 两人都在时银幕上打开的视频（同一个视频连着出现只记一次） */
    video(room, url, title) {
      const key = videoKey(url);
      if (!room || !key) return;
      const session = current(room);
      const last = session.videos[session.videos.length - 1];
      if (last && videoKey(last.url) === key) {
        if (!last.title && title) { last.title = clean(title, 200); touch(session); }
        return;
      }
      if (session.videos.length >= MAX_ITEMS) return;
      session.videos.push({ at: clock(), url: clean(url, 600), title: clean(title, 200) });
      touch(session);
    },
    /** 一句聊天：who 是 "me" 或 "partner" */
    chat(room, who, text) {
      const message = clean(text);
      if (!room || !message || (who !== "me" && who !== "partner")) return;
      const session = current(room);
      if (session.items.length >= MAX_ITEMS) return;
      session.items.push({ at: clock(), kind: "chat", who, text: message });
      touch(session);
    },
    /** 牵手 */
    hold(room, who) {
      if (!room || (who !== "me" && who !== "partner")) return;
      const session = current(room);
      const last = session.items[session.items.length - 1];
      // 连着点牵手只记一次
      if (last && last.kind === "hold" && clock() - last.at < 60 * 1000) return;
      if (session.items.length >= MAX_ITEMS) return;
      session.items.push({ at: clock(), kind: "hold", who });
      touch(session);
    },
    /** 给界面看的：新的在前，没内容的（只开了一下）不显示 */
    list() {
      return book.sessions
        .filter((session) => session.videos.length || session.items.length)
        .slice()
        .reverse()
        .map((session) => ({ ...session, videos: session.videos.slice(), items: session.items.slice() }));
    },
    flush() {
      if (saveTimer) { clearTimeout(saveTimer); save(); }
    },
  };
}

module.exports = { openNotebook, videoKey, SAME_VISIT_MS };
