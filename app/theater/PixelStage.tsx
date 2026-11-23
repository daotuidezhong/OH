"use client";

// 像素家庭影院舞台：房间画布 + 银幕（B站画面贴在这里）+ 座位画布 + 灯光层，统一按像素画坐标排版。
// 舞台按“铺满窗口”等比放大，窗口不是 16:9 时裁掉两侧或上下一点。

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { BUBBLE_Y, drawRoom, drawSeats, H, HEART, SCREEN, SEATS, W, type SeatState } from "./pixelArt";

const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

/** 舞台在窗口里的位置和大小（cover）。 */
function useStageBox() {
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  useLayoutEffect(() => {
    const update = () => {
      const scale = Math.max(window.innerWidth / W, window.innerHeight / H);
      const width = W * scale;
      const height = H * scale;
      setBox({ left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return box;
}

/** 数值向目标缓动（转头、牵手）。 */
function useEased(target: number, speed = 0.12) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    let frame = 0;
    const step = () => {
      const next = current.current + (target - current.current) * speed;
      current.current = Math.abs(target - next) < 0.01 ? target : next;
      setValue(current.current);
      if (current.current !== target) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, speed]);
  return value;
}

export type StageProps = {
  partner: boolean;
  me: boolean;
  talkLeft: boolean;
  talkRight: boolean;
  holding: boolean;
  surfaceRef: RefObject<HTMLDivElement | null>;
  screenChildren?: ReactNode;
  overlay?: ReactNode;
};

/** 气泡挂在头的外侧（TA 在左边、我在右边），不往上冒到银幕里。 */
export function bubbleAnchor(side: keyof typeof SEATS) {
  return pct(SEATS[side] + (side === "left" ? -27 : 27), BUBBLE_Y);
}

export function seatAnchor(side: keyof typeof SEATS) {
  return pct(SEATS[side], 168);
}

export function PixelStage({ partner, me, talkLeft, talkRight, holding, surfaceRef, screenChildren, overlay }: StageProps) {
  const box = useStageBox();
  const roomRef = useRef<HTMLCanvasElement>(null);
  const seatsRef = useRef<HTMLCanvasElement>(null);
  const yawLeft = useEased(holding || talkLeft ? 1 : 0);
  const yawRight = useEased(holding || talkRight ? -1 : 0);
  const hold = useEased(holding && partner && me ? 1 : 0, 0.08);

  // 房间：串灯、灯笼、台灯、放映机轻轻变化，每 150ms 重画一次
  useEffect(() => {
    const ctx = roomRef.current?.getContext("2d");
    if (!ctx) return;
    const paint = () => drawRoom(ctx, performance.now());
    paint();
    const timer = window.setInterval(paint, 150);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const ctx = seatsRef.current?.getContext("2d");
    if (!ctx) return;
    const state: SeatState = { partner, me, yawLeft, yawRight, hold };
    drawSeats(ctx, state);
  }, [partner, me, yawLeft, yawRight, hold]);

  const stageStyle: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height };
  const screenStyle: CSSProperties = { ...pct(SCREEN.x, SCREEN.y), width: `${(SCREEN.w / W) * 100}%`, height: `${(SCREEN.h / H) * 100}%` };

  return (
    <div className="pixel-stage" style={stageStyle}>
      <canvas ref={roomRef} className="pixel-layer" width={W} height={H} aria-hidden="true" />
      <div className="screen-light" aria-hidden="true" />
      <div className="lamp-glow" style={pct(84, 68)} aria-hidden="true" />
      <div className="lamp-glow" style={pct(300, 68)} aria-hidden="true" />
      <div className="lamp-glow small" style={pct(86, 112)} aria-hidden="true" />
      <div className="led-glow" style={{ ...pct(SCREEN.x, SCREEN.y + SCREEN.h + 6), width: `${(SCREEN.w / W) * 100}%` }} aria-hidden="true" />
      <div className="string-glow" aria-hidden="true" />
      <div className="screen-surface" ref={surfaceRef} style={screenStyle} aria-label="银幕：点击放大">{screenChildren}</div>
      <canvas ref={seatsRef} className="pixel-layer seats-layer" width={W} height={H} aria-label={partner ? "两张扶手椅上坐着粉色和白色两只玩偶" : "两张扶手椅，白色玩偶坐在右边，左边空着"} />
      {hold > 0.92 && <div className="hold-heart" style={pct(HEART.x, HEART.y)} aria-hidden="true" />}
      {overlay}
    </div>
  );
}
