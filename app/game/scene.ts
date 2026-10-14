import type { Point } from "./furniture";

export type SceneId = "room" | "yard";
export type Rect = { left: number; right: number; top: number; bottom: number };

export const SCENE_BOUNDS: Record<SceneId, Rect> = {
  room: { left: 7, right: 93, top: 43, bottom: 88 },
  yard: { left: 7, right: 94, top: 45, bottom: 89 },
};

export const YARD_OBSTACLES: Rect[] = [
  { left: 0, right: 25, top: 0, bottom: 50 },
  { left: 77, right: 88, top: 31, bottom: 54 },
  { left: 90, right: 100, top: 28, bottom: 68 },
];

export const ROOM_FIXED_OBSTACLES: Rect[] = [
  { left: 0, right: 35, top: 0, bottom: 46 },
  { left: 72, right: 81, top: 0, bottom: 45 },
  { left: 81, right: 98, top: 35, bottom: 52 },
  { left: 76, right: 94, top: 39, bottom: 51 },
  { left: 72, right: 100, top: 54, bottom: 90 },
];

export function clampFurniturePosition(point: Point, footprint: { halfWidth: number; height: number }) {
  const bounds = SCENE_BOUNDS.room;
  const footDepth = Math.min(2.5, footprint.height);
  const next = {
    x: Math.min(bounds.right - footprint.halfWidth, Math.max(bounds.left + footprint.halfWidth, point.x)),
    y: Math.min(bounds.bottom - 2, Math.max(bounds.top, point.y)),
  };
  const overlaps = (candidate: Point, rect: Rect) => candidate.x + footprint.halfWidth > rect.left
    && candidate.x - footprint.halfWidth < rect.right
    && candidate.y + 2 > rect.top
    && candidate.y - footDepth < rect.bottom;
  if (!ROOM_FIXED_OBSTACLES.some((rect) => overlaps(next, rect))) return next;

  return ROOM_FIXED_OBSTACLES.flatMap((rect) => [
    { x: rect.left - footprint.halfWidth - .5, y: next.y },
    { x: rect.right + footprint.halfWidth + .5, y: next.y },
    { x: next.x, y: rect.top - 2.5 },
    { x: next.x, y: rect.bottom + footDepth + .5 },
  ]).filter((candidate) => candidate.x >= bounds.left + footprint.halfWidth
    && candidate.x <= bounds.right - footprint.halfWidth
    && candidate.y >= bounds.top
    && candidate.y <= bounds.bottom - 2
    && !ROOM_FIXED_OBSTACLES.some((rect) => overlaps(candidate, rect)))
    .sort((a, b) => Math.hypot(a.x - next.x, a.y - next.y) - Math.hypot(b.x - next.x, b.y - next.y))[0] ?? next;
}

function inside(point: Point, rect: Rect) {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

function segmentHitsRect(a: Point, b: Point, rect: Rect) {
  let enter = 0;
  let exit = 1;
  for (const [origin, delta, lower, upper] of [
    [a.x, b.x - a.x, rect.left, rect.right],
    [a.y, b.y - a.y, rect.top, rect.bottom],
  ]) {
    if (delta === 0) {
      if (origin <= lower || origin >= upper) return false;
      continue;
    }
    const first = (lower - origin) / delta;
    const last = (upper - origin) / delta;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter >= exit) return false;
  }
  return true;
}

export function clampToScene(point: Point, scene: SceneId, obstacles: Rect[] = []) {
  const bounds = SCENE_BOUNDS[scene];
  let next = {
    x: Math.min(bounds.right, Math.max(bounds.left, point.x)),
    y: Math.min(bounds.bottom, Math.max(bounds.top, point.y)),
  };
  for (const rect of obstacles) {
    if (!inside(next, rect)) continue;
    const choices = [
      { point: { x: rect.left - 1, y: next.y }, distance: next.x - rect.left },
      { point: { x: rect.right + 1, y: next.y }, distance: rect.right - next.x },
      { point: { x: next.x, y: rect.top - 1 }, distance: next.y - rect.top },
      { point: { x: next.x, y: rect.bottom + 1 }, distance: rect.bottom - next.y },
    ].filter(({ point }) => point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom)
      .sort((a, b) => a.distance - b.distance);
    next = choices[0]?.point ?? next;
  }
  return next;
}

export function getWalkPath(from: Point, target: Point, scene: SceneId, obstacles: Rect[] = []) {
  const safeTarget = clampToScene(target, scene, obstacles);
  if (obstacles.some((rect) => inside(safeTarget, rect))) return [];
  // Legacy saved positions or a cat leaving its bed may start inside a footprint.
  // Allow an outward first segment, but keep the obstacle closed on all later segments.
  const hits = (a: Point, b: Point) => obstacles.some((rect) => !(a === from && inside(from, rect)) && segmentHitsRect(a, b, rect));
  if (!hits(from, safeTarget)) return [safeTarget];
  const candidates = obstacles.flatMap((rect) => [
    { x: rect.left - 1.5, y: rect.top - 1.5 },
    { x: rect.right + 1.5, y: rect.top - 1.5 },
    { x: rect.left - 1.5, y: rect.bottom + 1.5 },
    { x: rect.right + 1.5, y: rect.bottom + 1.5 },
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.left, y: rect.bottom },
    { x: rect.right, y: rect.bottom },
  ]).map((point) => clampToScene(point, scene, obstacles))
    .filter((point) => !obstacles.some((rect) => inside(point, rect)));
  const points = [from, safeTarget, ...candidates];
  const distances = points.map(() => Infinity);
  const previous = points.map(() => -1);
  const visited = new Set<number>();
  distances[0] = 0;

  while (visited.size < points.length) {
    let nearest = -1;
    for (let index = 0; index < points.length; index += 1) {
      if (!visited.has(index) && (nearest === -1 || distances[index] < distances[nearest])) nearest = index;
    }
    if (nearest === -1 || distances[nearest] === Infinity) break;
    if (nearest === 1) {
      const path: Point[] = [];
      for (let index = 1; index !== 0; index = previous[index]) path.unshift(points[index]);
      return path;
    }
    visited.add(nearest);
    for (let index = 0; index < points.length; index += 1) {
      if (visited.has(index) || hits(points[nearest], points[index])) continue;
      const distance = distances[nearest] + Math.hypot(points[index].x - points[nearest].x, points[index].y - points[nearest].y);
      if (distance < distances[index]) {
        distances[index] = distance;
        previous[index] = nearest;
      }
    }
  }
  return [];
}
