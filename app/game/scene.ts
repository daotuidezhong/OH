import type { Point } from "./furniture";

export type SceneId = "room" | "yard";
export type Rect = { left: number; right: number; top: number; bottom: number };
export type FurnitureFootprint = { halfWidth: number; height: number };

export const SCENE_BOUNDS: Record<SceneId, Rect> = {
  room: { left: 7, right: 93, top: 43, bottom: 88 },
  yard: { left: 7, right: 94, top: 45, bottom: 89 },
};

export const YARD_OBSTACLES: Rect[] = [
  { left: 0, right: 26, top: 0, bottom: 51 },
  { left: 77, right: 89, top: 26, bottom: 46 },
  { left: 90, right: 100, top: 28, bottom: 66 },
];

export const ROOM_FIXED_OBSTACLES: Rect[] = [
  { left: 0, right: 35, top: 0, bottom: 46 },
  { left: 69, right: 80, top: 0, bottom: 44 },
  { left: 81, right: 97, top: 35, bottom: 49 },
  { left: 29, right: 49, top: 43, bottom: 71 }, // 圣诞树和树下礼物
  { left: 80, right: 100, top: 54, bottom: 90 },
  { left: 58, right: 68, top: 0, bottom: 49 }, // 放映室小电视（电视柜占地）
];

// The background is stretched with the room, so the visible tree uses room percentages.
export const CHRISTMAS_TREE_ART: readonly Rect[] = [
  { left: 34.5, right: 42, top: 8, bottom: 29 },
  { left: 32, right: 45, top: 29, bottom: 47 },
  { left: 28.5, right: 48, top: 47, bottom: 60 },
  { left: 27, right: 51.5, top: 60, bottom: 72.5 },
];

export function furnitureFootprintAt(point: Point, footprint: FurnitureFootprint): Rect {
  return { left: point.x - footprint.halfWidth, right: point.x + footprint.halfWidth,
    top: point.y - Math.min(2.5, footprint.height), bottom: point.y + 2 };
}

export function clampFurniturePosition(
  point: Point,
  footprint: FurnitureFootprint,
  occupied: Rect[] = [],
  visual?: Rect,
): Point | null {
  const bounds = SCENE_BOUNDS.room;
  const minX = bounds.left + footprint.halfWidth;
  const maxX = bounds.right - footprint.halfWidth;
  const minY = bounds.top;
  const maxY = bounds.bottom - 2;
  const next = {
    x: Math.min(maxX, Math.max(minX, point.x)),
    y: Math.min(maxY, Math.max(minY, point.y)),
  };
  // Convert each obstacle into the range of anchors that would overlap it.
  const exclude = (obstacle: Rect, extent: Rect): Rect => ({
    left: obstacle.left - extent.right,
    right: obstacle.right - extent.left,
    top: obstacle.top - extent.bottom,
    bottom: obstacle.bottom - extent.top,
  });
  const foot = furnitureFootprintAt({ x: 0, y: 0 }, footprint);
  const forbidden = [...ROOM_FIXED_OBSTACLES, ...occupied].map((rect) => exclude(rect, foot));
  if (visual) forbidden.push(...CHRISTMAS_TREE_ART.map((rect) => exclude(rect, visual)));
  const fits = (position: Point) => !forbidden.some((rect) => inside(position, rect));
  if (fits(next)) return next;

  const columns = new Set([next.x, minX, maxX]);
  const rows = new Set([next.y, minY, maxY]);
  for (const rect of forbidden) {
    columns.add(rect.left);
    columns.add(rect.right);
    rows.add(rect.top);
    rows.add(rect.bottom);
  }
  // A corner between two obstacles can require moving along both axes.
  let closest: Point | null = null;
  let distance = Infinity;
  for (const x of columns) {
    if (x < minX || x > maxX) continue;
    for (const y of rows) {
      if (y < minY || y > maxY) continue;
      const offset = (x - next.x) ** 2 + (y - next.y) ** 2;
      if (offset >= distance || !fits({ x, y })) continue;
      closest = { x, y };
      distance = offset;
    }
  }
  return closest;
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
