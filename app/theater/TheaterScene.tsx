"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  cleanChatText, CHAT_MAX_LENGTH, formatRoomCode, generateRoomCode, HOLD_TOKEN,
  normalizeRoomCode, parseTheaterMessage, screenLight, type TheaterConfig,
} from "./protocol";
import { ReferenceStage } from "./ReferenceStage";
import { BUBBLE, EMPTY_SEAT, otherSide, place, point, seatOf, UI } from "./stageLayout";

type TheaterStatus = { role: string; inRoom: boolean; members: number; hasVideo: boolean; canGoBack: boolean; messages: { msg: string }[]; line?: string; ambient?: number[] | null };
type TheaterInit = { config: TheaterConfig | null; label: string; testMode: boolean };
type Rect = { x: number; y: number; width: number; height: number };

export type TheaterBridge = {
  init: () => Promise<TheaterInit | null>;
  setConfig: (config: TheaterConfig | null) => Promise<boolean>;
  setScreen: (rect: Rect, enlarged: boolean) => void;
  send: (text: string) => Promise<boolean | null>;
  navigate: (action: "home" | "back") => void;
  onState: (callback: (status: TheaterStatus) => void) => () => void;
  onEnlarge: (callback: (enlarged: boolean) => void) => () => void;
  /** 关掉放映厅窗口（游戏主窗口不受影响） */
  close: () => void;
};

declare global {
  interface Window { ohTheater?: TheaterBridge }
}

type Bubble = { id: number; side: "left" | "right"; text: string; at: number };

const BUBBLE_MS = 7000;
const TALK_MS = 2600;
const HOLD_MS = 4800;
const ARRIVE_MS = 1400;
const EMPTY_STATUS: TheaterStatus = { role: "loading", inRoom: false, members: 0, hasVideo: false, canGoBack: false, messages: [] };

let bubbleSeq = 0;

function PairingCard({ onCreate, onJoin, onLeave }: { onCreate: () => void; onJoin: (code: string) => void; onLeave: () => void }) {
  const [input, setInput] = useState("");
  const code = normalizeRoomCode(input);
  return (
    <div className="pairing-layer" role="dialog" aria-modal="true" aria-labelledby="pairing-title">
      <section className="pairing-card">
        <p className="pairing-eyebrow">OH CINEMA · 两人放映厅</p>
        <h1 id="pairing-title">第一次来，先把两张票配成对</h1>
        <div className="pairing-options">
          <div className="pairing-option">
            <h2>我来开放映厅</h2>
            <p>生成一个放映厅码，发给 TA。你坐右边，是戴蓝色耳机的白色玩偶。</p>
            <button type="button" className="pairing-primary" onClick={onCreate}>创建放映厅</button>
          </div>
          <form className="pairing-option" onSubmit={(event) => { event.preventDefault(); if (code) onJoin(code); }}>
            <h2>TA 已经开好了</h2>
            <p>输入 TA 发来的 6 位放映厅码。你坐左边，是粉色蝴蝶结玩偶。</p>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如 K7Q 2MX" maxLength={9} aria-label="放映厅码" autoComplete="off" spellCheck={false} />
            <button type="submit" className="pairing-secondary" disabled={!code}>加入放映厅</button>
          </form>
        </div>
        <p className="pairing-note">配对一次就好，以后打开放映厅会自动入座。</p>
        <button type="button" className="pairing-leave" onClick={onLeave}>先不配对，离开放映厅</button>
      </section>
    </div>
  );
}

export function TheaterScene({ bridge: bridgeProp }: { bridge?: TheaterBridge }) {
  const bridge = bridgeProp ?? (typeof window !== "undefined" ? window.ohTheater : undefined);
  const [init, setInit] = useState<TheaterInit | null>(null);
  const [config, setConfig] = useState<TheaterConfig | null>(null);
  const [status, setStatus] = useState<TheaterStatus>(EMPTY_STATUS);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [holdUntil, setHoldUntil] = useState(0);
  const [arrivedAt, setArrivedAt] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const partnerWasOnline = useRef(false);
  const partnerSideRef = useRef<Bubble["side"]>("left");

  const partnerOnline = Boolean(config && status.inRoom && status.members >= 2);
  const holding = partnerOnline && holdUntil > now;
  // 座位固定：创建放映厅的人坐右边（白色玩偶），加入的人坐左边（粉色玩偶）
  const mySide = seatOf(config?.role);
  const partnerSide = otherSide(mySide);
  const seated = { [mySide]: Boolean(config), [partnerSide]: partnerOnline } as Record<Bubble["side"], boolean>;

  useEffect(() => { partnerSideRef.current = partnerSide; }, [partnerSide]);

  useEffect(() => {
    if (!bridge) return;
    bridge.init().then((value) => {
      if (!value) return;
      setInit(value);
      setConfig(value.config);
    });
  }, [bridge]);

  const addBubble = useCallback((side: Bubble["side"], text: string) => {
    const at = Date.now();
    setBubbles((current) => [...current.filter((bubble) => bubble.side !== side || at - bubble.at < BUBBLE_MS).slice(-4), { id: (bubbleSeq += 1), side, text, at }]);
  }, []);

  useEffect(() => {
    if (!bridge) return;
    const offState = bridge.onState((next) => {
      setStatus(next);
      for (const { msg } of next.messages) {
        const message = parseTheaterMessage(msg);
        if (!message) continue;
        if (message.kind === "hold") setHoldUntil(Date.now() + HOLD_MS);
        else addBubble(partnerSideRef.current, message.text);
      }
    });
    const offEnlarge = bridge.onEnlarge((next) => setEnlarged(next));
    return () => { offState(); offEnlarge(); };
  }, [bridge, addBubble]);

  // TA 上线：TA 的玩偶“刷新”到座位上
  useEffect(() => {
    if (partnerOnline && !partnerWasOnline.current) {
      setArrivedAt(Date.now());
      setNotice(`TA 来啦，坐在你${partnerSideRef.current === "left" ? "左" : "右"}边`);
    }
    if (!partnerOnline && partnerWasOnline.current) setNotice("TA 暂时离开了座位");
    partnerWasOnline.current = partnerOnline;
  }, [partnerOnline]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setBubbles((current) => (current.some((bubble) => tick - bubble.at >= BUBBLE_MS) ? current.filter((bubble) => tick - bubble.at < BUBBLE_MS) : current));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // 把银幕位置告诉主进程，B站画面贴在这里。
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!bridge || !surface) return;
    const report = () => {
      const rect = surface.getBoundingClientRect();
      bridge.setScreen({ x: rect.left, y: rect.top, width: config ? rect.width : 0, height: config ? rect.height : 0 }, enlarged);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    window.addEventListener("resize", report);
    return () => { observer.disconnect(); window.removeEventListener("resize", report); };
  }, [bridge, enlarged, config]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setEnlarged(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveConfig = async (next: TheaterConfig | null) => {
    if (!bridge) return;
    if (await bridge.setConfig(next)) setConfig(next);
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const text = cleanChatText(draft);
    if (!text || !bridge) return;
    setDraft("");
    if (await bridge.send(text)) addBubble(mySide, text);
    else setNotice("消息没发出去，稍后再试");
  };

  const holdHands = async () => {
    if (!bridge || !partnerOnline) return;
    setHoldUntil(Date.now() + HOLD_MS);
    await bridge.send(HOLD_TOKEN);
  };

  const copyCode = async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(config.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice(`放映厅码：${formatRoomCode(config.code)}`);
    }
  };

  const talking = (side: Bubble["side"]) => bubbles.some((bubble) => bubble.side === side && now - bubble.at < TALK_MS);
  const seatStatus = !config ? "" : !status.inRoom ? "正在进入放映厅…" : partnerOnline ? "TA 在线" : "等 TA 入座…";
  const latestPartner = [...bubbles].reverse().find((bubble) => bubble.side === partnerSide);
  const arriving = partnerOnline && now - arrivedAt < ARRIVE_MS;
  const light = screenLight(config ? status.ambient : null);
  const lightStyle = { "--screen-rgb": light.rgb, "--screen-level": light.level } as CSSProperties;

  return (
    <main className={`theater ${enlarged ? "is-enlarged" : ""} ${holding ? "is-holding" : ""}`} data-partner={partnerOnline ? "online" : "offline"} style={lightStyle}>
      <ReferenceStage
        left={seated.left}
        right={seated.right}
        talkLeft={talking("left")}
        holding={holding}
        arriving={arriving ? partnerSide : null}
        surfaceRef={surfaceRef}
        screenChildren={!config && <div className="screen-idle"><b>OH CINEMA</b><span>配对后开始放映</span></div>}
      >
        {(["left", "right"] as const).map((side) => (
          <div key={side} className={`bubble-stack bubble-stack-${side}`} style={point(BUBBLE[side].x, BUBBLE[side].y)}>
            {bubbles.filter((bubble) => bubble.side === side).slice(-2).map((bubble) => (
              <p key={bubble.id} className={`bubble ${now - bubble.at > BUBBLE_MS - 900 ? "leaving" : ""}`}>{bubble.text}</p>
            ))}
          </div>
        ))}
        {arriving && <div className="arrive-sparkles" style={point(EMPTY_SEAT[partnerSide].x, EMPTY_SEAT[partnerSide].y - 40)} aria-hidden="true"><i /><i /><i /><i /><i /></div>}
        {config && !partnerOnline && <p className="empty-seat" style={point(EMPTY_SEAT[partnerSide].x, EMPTY_SEAT[partnerSide].y)}>TA 的座位</p>}

        {config && (
          <div className="ticket-wrap" style={place(UI.ticket)}>
            <div className="ticket">
              <div className="ticket-main">
                <span className="ticket-label"><b>放映厅</b><small>{init?.testMode ? `测试 ${init.label}` : "OH CINEMA"}{status.line ? ` · ${status.line}` : ""}</small></span>
                <button type="button" className="ticket-code" onClick={copyCode} title="复制放映厅码发给 TA">{copied ? "已复制" : formatRoomCode(config.code)}</button>
                <span className={`ticket-status ${partnerOnline ? "online" : ""}`} title={seatStatus}><i /><span>{seatStatus}</span></span>
              </div>
              <div className="ticket-stub">
                <span className="ticket-admit">ADMIT</span>
                <b className="ticket-count">2</b>
                {init?.testMode
                  ? <span className="ticket-seat">双人座</span>
                  : <button type="button" className="ticket-change" onClick={() => { if (window.confirm("更换放映厅后需要和 TA 重新配对，确定吗？")) saveConfig(null); }}>更换</button>}
              </div>
            </div>
          </div>
        )}
        {config && (
          <nav className="screen-controls" style={place(UI.controls)} aria-label="银幕">
            <button type="button" onClick={() => bridge?.navigate("back")} disabled={!status.canGoBack}>后退</button>
            <button type="button" onClick={() => bridge?.navigate("home")}>B站首页</button>
            <button type="button" className="enlarge-button" onClick={() => setEnlarged(true)}>放大银幕</button>
            <button type="button" className="leave-button" onClick={() => bridge?.close()}>离开放映厅</button>
          </nav>
        )}
        {config && (
          <form className="chat-bar" style={place(UI.chat)} onSubmit={sendChat}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={CHAT_MAX_LENGTH} placeholder={partnerOnline ? "和 TA 说点什么…" : "TA 还没来，先写好想说的话"} aria-label="聊天" />
            <button type="submit" className="send-button" disabled={!cleanChatText(draft) || !status.inRoom}>发送</button>
            <button type="button" className={`hold-button ${holding ? "active" : ""}`} onClick={holdHands} disabled={!partnerOnline} title={partnerOnline ? "牵牵 TA 的手" : "TA 还没来"}>
              <svg className="hold-heart-icon" viewBox="0 0 14 13" aria-hidden="true"><path d="M7 13C7 13 0 8.6 0 4.2 0 1.8 1.8 0 4 0c1.4 0 2.5.8 3 1.9C7.5.8 8.6 0 10 0c2.2 0 4 1.8 4 4.2C14 8.6 7 13 7 13Z" /></svg>{holding ? "牵手中" : "牵手"}
            </button>
          </form>
        )}
      </ReferenceStage>

      {enlarged && (
        <div className="enlarged-bar">
          <button type="button" className="enlarged-back" onClick={() => setEnlarged(false)}>← 回到放映厅 <kbd>Esc</kbd></button>
          <button type="button" onClick={() => bridge?.navigate("back")} disabled={!status.canGoBack}>后退</button>
          <button type="button" onClick={() => bridge?.navigate("home")}>B站首页</button>
          <span className={`enlarged-status ${partnerOnline ? "online" : ""}`}><i />{seatStatus}</span>
          {latestPartner && now - latestPartner.at < BUBBLE_MS && <span className="enlarged-message">TA：{latestPartner.text}</span>}
        </div>
      )}

      {notice && <p className="theater-notice" role="status">{notice}</p>}
      {init && !config && (
        <PairingCard
          onCreate={() => saveConfig({ code: generateRoomCode(), role: "master" })}
          onJoin={(code) => saveConfig({ code, role: "member" })}
          onLeave={() => bridge?.close()}
        />
      )}
    </main>
  );
}
