import type { Point } from "./furniture";
import { getWalkPath, type Rect } from "./scene.ts";

export type FeedingPhase = "IDLE" | "WAKING" | "WALK_TO_BOWL" | "ALIGN_AT_BOWL" | "LOWER_HEAD" | "EATING" | "FINISH_EATING";
export type BowlState = "empty" | "filled";
export type FeedingState = {
  phase: FeedingPhase;
  bowl: BowlState;
  position: Point;
  path: Point[];
  elapsed: number;
  petId: string;
  foodId: string;
  energy: number;
};

export const EMPTY_FEEDING: FeedingState = {
  phase: "IDLE", bowl: "empty", position: { x: 0, y: 0 }, path: [], elapsed: 0, petId: "", foodId: "", energy: 0,
};
export const FEEDING_DURATIONS = { WAKING: 1400, ALIGN_AT_BOWL: 240, LOWER_HEAD: 600, EATING: 3600, FINISH_EATING: 700 };
const WALK_SPEED = 18; // Room percentage points per second; independent of refresh rate.

export function beginFeeding(current: FeedingState, options: {
  from: Point; target: Point; obstacles: Rect[]; sleeping: boolean; petId: string; foodId: string; energy: number;
}): FeedingState | null {
  if (current.phase !== "IDLE" || current.bowl !== "empty") return null;
  const path = getWalkPath(options.from, options.target, "room", options.obstacles);
  const end = path.at(-1);
  // Never eat at a clamped destination that is actually far from the bowl.
  if (!end || Math.hypot(end.x - options.target.x, end.y - options.target.y) > .05) return null;
  return {
    phase: options.sleeping ? "WAKING" : "WALK_TO_BOWL", bowl: "filled", position: { ...options.from },
    path, elapsed: 0, petId: options.petId, foodId: options.foodId, energy: options.energy,
  };
}

export function advanceFeeding(current: FeedingState, delta: number): FeedingState {
  if (current.phase === "IDLE") return current;
  let next = { ...current, position: { ...current.position }, path: [...current.path] };
  let remaining = Math.max(0, delta);
  while (remaining > 0 && next.phase !== "IDLE") {
    if (next.phase === "WALK_TO_BOWL") {
      const target = next.path[0];
      if (!target) { next = { ...next, phase: "ALIGN_AT_BOWL", elapsed: 0 }; continue; }
      const distance = Math.hypot(target.x - next.position.x, target.y - next.position.y);
      const duration = distance / WALK_SPEED * 1000;
      const used = Math.min(remaining, duration);
      const ratio = duration > 0 ? used / duration : 1;
      next.position = { x: next.position.x + (target.x - next.position.x) * ratio, y: next.position.y + (target.y - next.position.y) * ratio };
      remaining -= used;
      if (used >= duration) { next.position = { ...target }; next.path.shift(); }
      continue;
    }
    const phase = next.phase as keyof typeof FEEDING_DURATIONS;
    const used = Math.min(remaining, FEEDING_DURATIONS[phase] - next.elapsed);
    next.elapsed += used;
    remaining -= used;
    if (next.elapsed < FEEDING_DURATIONS[phase]) break;
    const following: Record<keyof typeof FEEDING_DURATIONS, FeedingPhase> = {
      WAKING: "WALK_TO_BOWL", ALIGN_AT_BOWL: "LOWER_HEAD", LOWER_HEAD: "EATING", EATING: "FINISH_EATING", FINISH_EATING: "IDLE",
    };
    next = { ...next, phase: following[phase], elapsed: 0, bowl: phase === "EATING" ? "empty" : next.bowl };
  }
  return next;
}

export function getEatingFrame(state: Pick<FeedingState, "phase" | "elapsed">) {
  if (state.phase === "LOWER_HEAD") return Math.min(2, Math.floor(state.elapsed / 200));
  if (state.phase === "EATING") return 2 + Math.floor(state.elapsed / 180) % 2;
  if (state.phase === "FINISH_EATING") return Math.max(0, 2 - Math.floor(state.elapsed / 230));
  return 0;
}

export function findBowlPlacement(obstacles: Rect[], offset: Point, clearance: Point = { x: 2.5, y: 1.5 }) {
  // Keep the bowl off the main passage. Try other floor spaces if furniture was moved.
  const candidates = [{ x: 64, y: 85 }, { x: 51, y: 86 }, { x: 36, y: 87 }, { x: 17, y: 85 }, { x: 63, y: 64 }, { x: 45, y: 60 }];
  for (let y = 82; y >= 55; y -= 4) for (let x = 65; x >= 15; x -= 5) candidates.push({ x, y });
  for (const bowl of candidates) {
    const target = { x: bowl.x - offset.x, y: bowl.y - offset.y };
    if (target.x < 7 || target.x > 93 || target.y < 43 || target.y > 88) continue;
    const blocked = obstacles.some((rect) => bowl.x + clearance.x > rect.left && bowl.x - clearance.x < rect.right && bowl.y + clearance.y > rect.top && bowl.y - clearance.y < rect.bottom
      || target.x > rect.left && target.x < rect.right && target.y > rect.top && target.y < rect.bottom);
    if (!blocked) return { bowl, target };
  }
  return null;
}
