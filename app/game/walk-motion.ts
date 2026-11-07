import type { Point } from "./furniture";
import { getWalkDirection, type WalkDirection } from "./movement-direction.ts";

// Walking is planned along the whole path at once: ease in, cruise, ease out.
// Leg frames advance with distance travelled, so the paws never slide.
export const WALK_SPEED_CAT_WIDTHS = 2;         // cruising speed, cat widths per second
export const WALK_ACCEL_SECONDS = .2;           // time to reach cruising speed from a stop
// A longer stride at the higher speed keeps each leg frame on screen ~80ms, so the
// legs read as walking rather than a blur.
export const WALK_CYCLE_CAT_WIDTHS = .65;       // distance covered by one 4-frame stride

export type WalkPlan = {
  points: Point[];                 // percent of the room, start first
  lengths: number[];               // pixel length of each segment
  total: number;                   // pixel length of the whole path
  vmax: number; accel: number; v0: number; vpeak: number;
  accelTime: number; cruiseTime: number; decelTime: number; duration: number;
  frameDistance: number;           // pixels per leg frame
  strideOffset: number;            // pixels already walked before this plan, keeps the leg phase
};

export type WalkSample = { point: Point; direction: WalkDirection; frame: number; distance: number; speed: number; done: boolean };

export function planWalk(points: Point[], room: { width: number; height: number }, catWidth: number, v0 = 0, strideOffset = 0): WalkPlan {
  const lengths = points.slice(1).map((point, index) => Math.hypot((point.x - points[index].x) * room.width / 100, (point.y - points[index].y) * room.height / 100));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const vmax = catWidth * WALK_SPEED_CAT_WIDTHS;
  const accel = vmax / WALK_ACCEL_SECONDS;
  let start = Math.min(Math.max(v0, 0), vmax);
  let vpeak = vmax;
  let accelDistance = (vmax ** 2 - start ** 2) / (2 * accel);
  let decelDistance = vmax ** 2 / (2 * accel);
  let decel = accel;
  if (accelDistance + decelDistance > total) {
    vpeak = Math.sqrt((2 * accel * total + start ** 2) / 2);
    if (vpeak < start) {
      // Already moving too fast to stop within this path: brake the whole way.
      vpeak = start; accelDistance = 0; decel = total > 0 ? start ** 2 / (2 * total) : accel;
      if (!total) start = 0;
    } else {
      accelDistance = (vpeak ** 2 - start ** 2) / (2 * accel);
    }
    decelDistance = total - accelDistance;
  }
  const accelTime = (vpeak - start) / accel;
  const cruiseTime = Math.max(0, total - accelDistance - decelDistance) / vmax;
  const decelTime = vpeak / decel;
  return {
    points, lengths, total, vmax, accel: decel === accel ? accel : decel, v0: start, vpeak,
    accelTime, cruiseTime, decelTime, duration: total ? (accelTime + cruiseTime + decelTime) * 1000 : 0,
    frameDistance: catWidth * WALK_CYCLE_CAT_WIDTHS / 4, strideOffset,
  };
}

function distanceAt(plan: WalkPlan, seconds: number) {
  const { v0, vpeak, vmax, accelTime, cruiseTime, decelTime } = plan;
  const up = (vpeak - v0) / (accelTime || 1);
  if (seconds <= accelTime) return { distance: v0 * seconds + up * seconds ** 2 / 2, speed: v0 + up * seconds };
  const accelDistance = (v0 + vpeak) / 2 * accelTime;
  const cruiseEnd = accelTime + cruiseTime;
  if (seconds <= cruiseEnd) return { distance: accelDistance + vmax * (seconds - accelTime), speed: vmax };
  const t = Math.min(seconds - cruiseEnd, decelTime);
  const down = vpeak / (decelTime || 1);
  return { distance: Math.min(plan.total, accelDistance + vmax * cruiseTime + vpeak * t - down * t ** 2 / 2), speed: Math.max(0, vpeak - down * t) };
}

export function sampleWalk(plan: WalkPlan, elapsedMs: number): WalkSample {
  const done = elapsedMs >= plan.duration;
  const { distance, speed } = done ? { distance: plan.total, speed: 0 } : distanceAt(plan, elapsedMs / 1000);
  let remaining = distance;
  let index = 0;
  while (index < plan.lengths.length - 1 && remaining > plan.lengths[index]) { remaining -= plan.lengths[index]; index += 1; }
  const from = plan.points[index];
  const to = plan.points[Math.min(index + 1, plan.points.length - 1)];
  const ratio = plan.lengths[index] ? Math.min(1, remaining / plan.lengths[index]) : 1;
  return {
    point: { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio },
    direction: getWalkDirection(from, to),
    frame: Math.floor((plan.strideOffset + distance) / plan.frameDistance) % 4,
    distance, speed, done,
  };
}
