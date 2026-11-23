// 放映厅按参考图一比一还原：所有坐标都是参考图（1566×943）里的像素位置。
// 素材由 build/art/theater-ref/ 里的脚本从参考图切出来，见那里的 README。

export const STAGE_W = 1566;
export const STAGE_H = 943;

export type Box = { x: number; y: number; w: number; h: number };
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** 银幕内框：B站画面贴在这里（房间图在这里是透明的）。 */
export const SCREEN = box(432, 100, 703, 401);

/**
 * 房间图里已经有白色戴耳机的玩偶（我，一直在场）；粉色玩偶（TA）、牵手的两条手臂、爱心是叠上去的小图，
 * 每张都连同周围一圈原图像素切出来，叠上去与参考图完全一致。
 */
export const SPRITES = {
  room: { src: "/theater/room.webp", ...box(0, 0, STAGE_W, STAGE_H) },
  dollLeft: { src: "/theater/doll-left.webp", ...box(558, 579, 210, 163) },
  armLeft: { src: "/theater/arm-left.webp", ...box(706, 680, 90, 65) },
  armRight: { src: "/theater/arm-right.webp", ...box(784, 684, 76, 59) },
  heart: { src: "/theater/heart.webp", ...box(737, 570, 109, 109) },
} as const;

/** 白色玩偶（我）在房间图里的位置。 */
export const ME_DOLL = box(829, 591, 188, 150);

/** 界面元素在参考图里的位置（票根、右上按钮、聊天条），尺寸随舞台一起缩放。 */
export const UI = {
  ticket: box(14, 77, 225, 87),
  controls: box(1442, 77, 108, 134),
  chat: box(470, 865, 631, 62),
} as const;

/** 气泡挂在头的外侧：TA 在粉色玩偶左边，我在白色玩偶右边。 */
export const BUBBLE = { left: { x: 566, y: 640 }, right: { x: 1014, y: 640 } } as const;
/** TA 不在时，左边空座位上的提示。 */
export const EMPTY_SEAT = { x: 650, y: 690 } as const;

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
