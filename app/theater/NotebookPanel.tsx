"use client";

// 放映厅笔记本：两个人每一次一起看的记录——看过的视频、聊天、牵手。数据只存在本机（主进程写入）。

import { useEffect, useMemo, useState } from "react";

export type NotebookVideo = { at: number; url: string; title: string };
export type NotebookItem = { at: number; kind: "chat" | "hold"; who: "me" | "partner"; text?: string };
export type NotebookSession = { id: string; room: string; startedAt: number; lastAt: number; togetherMs: number; videos: NotebookVideo[]; items: NotebookItem[] };

const pad = (value: number) => String(value).padStart(2, "0");
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const dayLabel = (at: number) => {
  const date = new Date(at);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · 周${WEEK[date.getDay()]}`;
};
const timeLabel = (at: number) => {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const partOfDay = (at: number) => {
  const hour = new Date(at).getHours();
  return hour < 6 ? "深夜" : hour < 11 ? "早上" : hour < 14 ? "中午" : hour < 18 ? "下午" : "晚上";
};
export function durationLabel(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "不到 1 分钟";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ""}` : `${minutes} 分钟`;
}

type Entry = { at: number; key: string } & ({ type: "video"; video: NotebookVideo } | { type: "item"; item: NotebookItem });

export function NotebookPanel({ load, onOpenVideo, onClose }: { load: () => Promise<NotebookSession[]>; onOpenVideo: (url: string) => void; onClose: () => void }) {
  const [sessions, setSessions] = useState<NotebookSession[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((value) => { if (alive) setSessions(Array.isArray(value) ? value : []); }).catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const session = sessions?.find((item) => item.id === selected) ?? sessions?.[0] ?? null;
  // 视频和对话按时间排在一条线上：先看到“开始看《…》”，下面是那段时间说的话
  const entries = useMemo<Entry[]>(() => {
    if (!session) return [];
    const list: Entry[] = [
      ...session.videos.map((video, index) => ({ at: video.at, key: `v${index}`, type: "video" as const, video })),
      ...session.items.map((item, index) => ({ at: item.at, key: `i${index}`, type: "item" as const, item })),
    ];
    return list.sort((a, b) => a.at - b.at);
  }, [session]);

  return (
    <div className="notebook-layer" role="dialog" aria-modal="true" aria-label="放映厅笔记本">
      <section className="notebook">
        <header className="notebook-head">
          <h2>放映厅笔记本</h2>
          <p>我们一起看过的视频和说过的话，只存在这台电脑上。</p>
          <button type="button" className="notebook-close" onClick={onClose}>合上 <kbd>Esc</kbd></button>
        </header>
        {sessions === null ? (
          <p className="notebook-empty">翻开中…</p>
        ) : sessions.length === 0 ? (
          <p className="notebook-empty">还没有记录。两个人都在放映厅里时，看的视频和聊天会自动记在这里。</p>
        ) : (
          <div className="notebook-body">
            <nav className="notebook-index" aria-label="每一次一起看">
              {sessions.map((item) => (
                <button key={item.id} type="button" className={item.id === session?.id ? "active" : ""} onClick={() => setSelected(item.id)}>
                  <b>{dayLabel(item.startedAt)}</b>
                  <span>{partOfDay(item.startedAt)} · 一起看了 {durationLabel(item.togetherMs)}</span>
                  <small>{item.videos.length} 个视频 · {item.items.filter((entry) => entry.kind === "chat").length} 句话</small>
                </button>
              ))}
            </nav>
            {session && (
              <article className="notebook-page">
                <h3>{dayLabel(session.startedAt)} <span>{timeLabel(session.startedAt)}–{timeLabel(session.lastAt)} · 一起看了 {durationLabel(session.togetherMs)}</span></h3>
                <ol className="notebook-lines">
                  {entries.map((entry) => entry.type === "video" ? (
                    <li key={entry.key} className="line-video">
                      <time>{timeLabel(entry.at)}</time>
                      <span>开始看</span>
                      <button type="button" onClick={() => onOpenVideo(entry.video.url)} title="在银幕上重新打开">《{entry.video.title || "一个 B站视频"}》</button>
                    </li>
                  ) : entry.item.kind === "hold" ? (
                    <li key={entry.key} className="line-hold">
                      <time>{timeLabel(entry.at)}</time>
                      <span>♥ {entry.item.who === "me" ? "我牵起了 TA 的手" : "TA 牵起了我的手"}</span>
                    </li>
                  ) : (
                    <li key={entry.key} className={`line-chat ${entry.item.who}`}>
                      <time>{timeLabel(entry.at)}</time>
                      <b>{entry.item.who === "me" ? "我" : "TA"}</b>
                      <span>{entry.item.text}</span>
                    </li>
                  ))}
                </ol>
              </article>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
