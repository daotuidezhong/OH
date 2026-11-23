"use client";

// 放映厅舞台：参考图一比一还原。房间是一整张图（银幕处透明，B站画面在下面），
// 玩偶、牵手的手臂、爱心是从参考图切出来的小图，按原位置叠上去。
// 舞台按“铺满窗口”等比缩放；--u 是参考图里 1 像素对应的屏幕像素，界面元素用它缩放。

import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { place, SCREEN, SPRITES, STAGE_H, STAGE_W } from "./stageLayout";

function useStageBox() {
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  useLayoutEffect(() => {
    const update = () => {
      const scale = Math.max(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
      const width = STAGE_W * scale;
      const height = STAGE_H * scale;
      setBox({ left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return box;
}

export type StageProps = {
  partner: boolean;
  me: boolean;
  talkLeft: boolean;
  talkRight: boolean;
  holding: boolean;
  arriving: boolean;
  surfaceRef: RefObject<HTMLDivElement | null>;
  screenChildren?: ReactNode;
  children?: ReactNode;
};

function Sprite({ sprite, className = "" }: { sprite: (typeof SPRITES)[keyof typeof SPRITES]; className?: string }) {
  return <img className={`stage-sprite ${className}`} src={sprite.src} alt="" draggable={false} style={place(sprite)} />;
}

export function ReferenceStage({ partner, me, talkLeft, talkRight, holding, arriving, surfaceRef, screenChildren, children }: StageProps) {
  const box = useStageBox();
  const hold = holding && partner && me;
  const stageStyle = { left: box.left, top: box.top, width: box.width, height: box.height, "--u": `${box.width / STAGE_W}px` } as CSSProperties;

  return (
    <div className={`reference-stage ${hold ? "is-holding" : ""}`} style={stageStyle}>
      {/* 银幕在房间图下面：房间图在银幕处是透明的 */}
      <div className="screen-surface" ref={surfaceRef} style={place(SCREEN)} aria-label="银幕：点击放大">{screenChildren}</div>
      <img className="stage-room" src={SPRITES.room.src} alt="温馨的像素家庭影院：红色幕布、串灯、书架上睡觉的小猫、放映机、两张红色扶手椅和爆米花" draggable={false} />
      <div className="screen-light" style={place(SCREEN)} aria-hidden="true" />
      {partner && <Sprite sprite={SPRITES.dollLeft} className={`doll doll-left ${talkLeft ? "talking" : ""} ${arriving ? "arriving" : ""}`} />}
      {me && <Sprite sprite={hold ? SPRITES.dollRight : SPRITES.dollRightRest} className={`doll doll-right ${talkRight ? "talking" : ""}`} />}
      {hold && <Sprite sprite={SPRITES.armLeft} className="arm arm-left" />}
      {hold && <Sprite sprite={SPRITES.armRight} className="arm arm-right" />}
      {hold && <Sprite sprite={SPRITES.heart} className="heart" />}
      {children}
    </div>
  );
}
