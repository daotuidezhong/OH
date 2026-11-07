export type CatStatLevel = "low" | "medium" | "high";
export type CatStatusId =
  | "high-low"
  | "high-medium"
  | "high-high"
  | "medium-low"
  | "medium-medium"
  | "medium-high"
  | "low-low"
  | "low-medium"
  | "low-high";
export type CatPose = "idle" | "walk" | "groom" | "yawn" | "sleep" | "wake" | "scratch";
// Poses a cat may hold while standing still. Walk frames only play while the cat
// actually travels; reusing them in place made it look like it walked on air.
export type CatStatusPose = Exclude<CatPose, "walk">;
export type CatAnimationFrame = {
  pose: CatPose;
  frame?: 0 | 1 | 2 | 3;
  duration: number;
  x?: number;
  y?: number;
};

// Every duration is a whole number of ticks so the frame rhythm stays even.
export const CAT_ANIMATION_TICK_MS = 90;
const t = (ticks: number) => ticks * CAT_ANIMATION_TICK_MS;

// scratch frames: 0 sit, 1 reach forward, 2 crouch low, 3 sit and look.
export const CAT_STATUS_ANIMATIONS: Record<CatStatusId, { name: string; frames: CatAnimationFrame[] }> = {
  "high-low": {
    name: "蓄力扑爪",
    frames: [
      { pose: "idle", duration: t(3) },
      { pose: "scratch", frame: 0, duration: t(2) },
      { pose: "scratch", frame: 2, duration: t(3) },
      { pose: "scratch", frame: 2, duration: t(2), y: 1 },
      { pose: "scratch", frame: 2, duration: t(2) },
      { pose: "scratch", frame: 1, duration: t(2) },
      { pose: "scratch", frame: 2, duration: t(2) },
      { pose: "scratch", frame: 1, duration: t(2) },
      { pose: "scratch", frame: 3, duration: t(4) },
      { pose: "idle", duration: t(4) },
    ],
  },
  "high-medium": {
    name: "玩闹后哈欠",
    frames: [
      { pose: "idle", duration: t(3) },
      { pose: "scratch", frame: 1, duration: t(2) },
      { pose: "scratch", frame: 2, duration: t(2) },
      { pose: "scratch", frame: 1, duration: t(2) },
      { pose: "scratch", frame: 3, duration: t(3) },
      { pose: "idle", duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(2) },
      { pose: "yawn", frame: 1, duration: t(2) },
      { pose: "yawn", frame: 2, duration: t(3) },
      { pose: "yawn", frame: 3, duration: t(5) },
      { pose: "yawn", frame: 2, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(2) },
      { pose: "yawn", frame: 0, duration: t(2) },
      { pose: "idle", duration: t(4) },
    ],
  },
  "high-high": {
    name: "扑空犯困",
    frames: [
      { pose: "idle", duration: t(2) },
      { pose: "scratch", frame: 1, duration: t(2) },
      { pose: "scratch", frame: 2, duration: t(2) },
      { pose: "scratch", frame: 1, duration: t(2) },
      { pose: "scratch", frame: 3, duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3), y: 1 },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "idle", duration: t(5) },
    ],
  },
  "medium-low": {
    name: "抬爪张望",
    frames: [
      { pose: "idle", duration: t(5) },
      { pose: "scratch", frame: 3, duration: t(5) },
      { pose: "idle", duration: t(3) },
      { pose: "groom", frame: 0, duration: t(4) },
      { pose: "groom", frame: 1, duration: t(4) },
      { pose: "groom", frame: 0, duration: t(4) },
      { pose: "idle", duration: t(6) },
    ],
  },
  "medium-medium": {
    name: "洗脸伸懒腰",
    frames: [
      { pose: "idle", duration: t(4) },
      { pose: "groom", frame: 0, duration: t(3) },
      { pose: "groom", frame: 1, duration: t(3) },
      { pose: "groom", frame: 2, duration: t(3) },
      { pose: "groom", frame: 3, duration: t(3) },
      { pose: "groom", frame: 2, duration: t(3) },
      { pose: "groom", frame: 1, duration: t(3) },
      { pose: "groom", frame: 0, duration: t(3) },
      { pose: "idle", duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "yawn", frame: 2, duration: t(3) },
      { pose: "yawn", frame: 3, duration: t(4) },
      { pose: "yawn", frame: 2, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "idle", duration: t(5) },
    ],
  },
  "medium-high": {
    name: "点头惊醒",
    frames: [
      { pose: "idle", duration: t(5) },
      { pose: "yawn", frame: 0, duration: t(4) },
      { pose: "yawn", frame: 1, duration: t(5), y: 1 },
      { pose: "yawn", frame: 0, duration: t(4), y: 1 },
      { pose: "yawn", frame: 0, duration: t(5) },
      { pose: "scratch", frame: 3, duration: t(2) },
      { pose: "idle", duration: t(4) },
      { pose: "yawn", frame: 0, duration: t(4), y: 1 },
      { pose: "yawn", frame: 0, duration: t(5) },
      { pose: "idle", duration: t(6) },
    ],
  },
  "low-low": {
    name: "安静观察",
    frames: [
      { pose: "idle", duration: t(13) },
      { pose: "scratch", frame: 3, duration: t(6) },
      { pose: "idle", duration: t(10) },
      { pose: "groom", frame: 0, duration: t(4) },
      { pose: "groom", frame: 1, duration: t(4) },
      { pose: "groom", frame: 0, duration: t(5) },
      { pose: "idle", duration: t(15) },
    ],
  },
  "low-medium": {
    name: "香箱犯困",
    frames: [
      { pose: "idle", duration: t(9) },
      { pose: "yawn", frame: 0, duration: t(6) },
      { pose: "yawn", frame: 1, duration: t(6), y: 1 },
      { pose: "yawn", frame: 0, duration: t(6) },
      { pose: "idle", duration: t(10) },
      { pose: "yawn", frame: 0, duration: t(6), y: 1 },
      { pose: "idle", duration: t(10) },
    ],
  },
  "low-high": {
    name: "蜷睡呼吸",
    frames: [
      { pose: "sleep", duration: t(9) },
      { pose: "sleep", duration: t(9), y: 1 },
      { pose: "sleep", duration: t(9) },
      { pose: "sleep", duration: t(9), y: 1 },
      { pose: "sleep", duration: t(9) },
    ],
  },
};

const STATUS_LEVELS: Record<CatStatusId, { energy: CatStatLevel; sleepiness: CatStatLevel }> = {
  "high-low": { energy: "high", sleepiness: "low" },
  "high-medium": { energy: "high", sleepiness: "medium" },
  "high-high": { energy: "high", sleepiness: "high" },
  "medium-low": { energy: "medium", sleepiness: "low" },
  "medium-medium": { energy: "medium", sleepiness: "medium" },
  "medium-high": { energy: "medium", sleepiness: "high" },
  "low-low": { energy: "low", sleepiness: "low" },
  "low-medium": { energy: "low", sleepiness: "medium" },
  "low-high": { energy: "low", sleepiness: "high" },
};

export function getCatStatLevel(value: number): CatStatLevel {
  if (value <= 30) return "low";
  if (value <= 70) return "medium";
  return "high";
}

export function getCatStatus(energy: number, sleepiness: number): CatStatusId {
  return `${getCatStatLevel(energy)}-${getCatStatLevel(sleepiness)}` as CatStatusId;
}

export function getCatStatusTransition(from: CatStatusId, to: CatStatusId): CatAnimationFrame[] {
  if (to === "low-high") {
    return [
      { pose: "idle", duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "yawn", frame: 2, duration: t(3) },
      { pose: "yawn", frame: 3, duration: t(5) },
      { pose: "yawn", frame: 2, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "wake", duration: t(5) },
      { pose: "sleep", duration: t(7) },
    ];
  }

  if (from === "low-high") {
    return [
      { pose: "sleep", duration: t(4) },
      { pose: "wake", duration: t(4) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(2) },
      { pose: "idle", duration: t(4) },
    ];
  }

  const current = STATUS_LEVELS[from];
  const next = STATUS_LEVELS[to];
  if (current.energy === "high" && next.energy === "low") {
    return [
      { pose: "scratch", frame: 2, duration: t(3) },
      { pose: "scratch", frame: 3, duration: t(3) },
      { pose: "idle", duration: t(5) },
    ];
  }
  if (current.energy === "low" && next.energy === "high") {
    return [
      { pose: "idle", duration: t(3) },
      { pose: "scratch", frame: 3, duration: t(2) },
      { pose: "scratch", frame: 1, duration: t(2) },
      { pose: "scratch", frame: 0, duration: t(2) },
      { pose: "idle", duration: t(3) },
    ];
  }
  if (current.sleepiness === "low" && next.sleepiness === "high") {
    return [
      { pose: "idle", duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "idle", duration: t(4) },
    ];
  }
  if (current.sleepiness === "high" && next.sleepiness === "low") {
    return [
      { pose: "yawn", frame: 1, duration: t(3) },
      { pose: "yawn", frame: 0, duration: t(3) },
      { pose: "idle", duration: t(4) },
    ];
  }
  return [{ pose: "idle", duration: t(4) }];
}
