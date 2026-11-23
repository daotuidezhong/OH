// 放映厅按参考图一比一还原：所有坐标都是参考图（1566×943）里的像素位置。
// 素材由 build/art/theater-ref/ 里的脚本从参考图切出来，见那里的 README。

export const STAGE_W = 1566;
export const STAGE_H = 943;

export type Box = { x: number; y: number; w: number; h: number };
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** 银幕内框：B站画面贴在这里（房间图在这里是透明的）。 */
export const SCREEN = box(432, 100, 703, 401);

/**
 * 座位是固定的：创建放映厅的人坐右边（白色戴蓝色耳机的玩偶），加入的人坐左边（粉色蝴蝶结玩偶），
 * 两台电脑上看到的画面一样。
 * 白色玩偶直接画在房间图里（和背景完全贴合）；它不在时，用 seatRightEmpty 把那块盖成空座位。
 * 粉色玩偶、牵手的两条手臂、爱心是叠上去的小图，每张都连同周围一圈原图像素切出来。
 */
export const SPRITES = {
  room: { src: "/theater/room.webp", ...box(0, 0, STAGE_W, STAGE_H) },
  dollLeft: { src: "/theater/doll-left.webp", ...box(558, 579, 210, 163) },
  armLeft: { src: "/theater/arm-left.webp", ...box(706, 680, 90, 65) },
  armRight: { src: "/theater/arm-right.webp", ...box(782, 683, 88, 69) },
  heart: { src: "/theater/heart.webp", ...box(737, 570, 109, 109) },
  seatRightEmpty: { src: "/theater/seat-right-empty.webp", ...box(791, 584, 233, 163) },
} as const;

/** 白色玩偶在房间图里的位置。 */
export const ME_DOLL = box(829, 591, 188, 150);

/** 界面元素在参考图里的位置（票根、右上按钮、聊天条），尺寸随舞台一起缩放。 */
export const UI = {
  ticket: box(14, 77, 225, 87),
  controls: box(1442, 77, 108, 244),
  chat: box(470, 865, 631, 62),
} as const;

/** 气泡挂在头的外侧：左边座位的冒在粉色玩偶左边，右边座位的冒在白色玩偶右边。 */
export const BUBBLE = { left: { x: 566, y: 640 }, right: { x: 1014, y: 640 } } as const;
/** TA 不在时，空座位上的提示位置。 */
export const EMPTY_SEAT = { left: { x: 650, y: 690 }, right: { x: 923, y: 690 } } as const;

export type Side = "left" | "right";
/** 创建放映厅的人（master）坐右边，加入的人（member）坐左边。 */
export function seatOf(role: string | undefined): Side {
  return role === "member" ? "left" : "right";
}
export const otherSide = (side: Side): Side => (side === "left" ? "right" : "left");

/** 以参考图坐标给出的盒子 → 舞台内的百分比定位。 */
export function place(item: Box): { left: string; top: string; width: string; height: string } {
  return {
    left: `${(item.x / STAGE_W) * 100}%`,
    top: `${(item.y / STAGE_H) * 100}%`,
    width: `${(item.w / STAGE_W) * 100}%`,
    height: `${(item.h / STAGE_H) * 100}%`,
  };
}

export function point(x: number, y: number): { left: string; top: string } {
  return { left: `${(x / STAGE_W) * 100}%`, top: `${(y / STAGE_H) * 100}%` };
}
