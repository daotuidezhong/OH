import assert from "node:assert/strict";
import test from "node:test";
import { clampToScene, getWalkPath, ROOM_FIXED_OBSTACLES, SCENE_BOUNDS } from "../app/game/scene.ts";
import { PET_STAT_DECAY_MS, settlePetSleep } from "../app/game/pet-stats.ts";

function assertClearPath(from, path, obstacles) {
  let start = from;
  for (const end of path) {
    assert.ok(end.x >= SCENE_BOUNDS.room.left && end.x <= SCENE_BOUNDS.room.right);
    assert.ok(end.y >= SCENE_BOUNDS.room.top && end.y <= SCENE_BOUNDS.room.bottom);
    for (let step = 0; step <= 5000; step += 1) {
      const point = { x: start.x + (end.x - start.x) * step / 5000, y: start.y + (end.y - start.y) * step / 5000 };
      assert.ok(!obstacles.some((rect) => point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom), `Path enters an obstacle at ${JSON.stringify(point)}`);
    }
    start = end;
  }
}

test("cat tree routes use multiple turns without crossing the furniture", () => {
  const from = { x: 50, y: 70 };
  const target = { x: 70, y: 70 };
  const obstacles = [...ROOM_FIXED_OBSTACLES, { left: 54, right: 66, top: 62, bottom: 79 }];
  const path = getWalkPath(from, target, "room", obstacles);
  assert.ok(path.length >= 3);
  assert.deepEqual(path.at(-1), target);
  assertClearPath(from, path, obstacles);
  const length = path.reduce((total, point, index) => {
    const previous = index === 0 ? from : path[index - 1];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
  assert.equal(length, 12 + 2 * Math.hypot(4, 8));
});

test("walk paths navigate obstacles requiring turns in opposite directions", () => {
  const from = { x: 20, y: 70 };
  const target = { x: 70, y: 70 };
  const obstacles = [
    { left: 30, right: 40, top: 0, bottom: 75 },
    { left: 50, right: 60, top: 57, bottom: 100 },
  ];
  const path = getWalkPath(from, target, "room", obstacles);
  assert.ok(path.length >= 4);
  assert.deepEqual(path.at(-1), target);
  assertClearPath(from, path, obstacles);
});

test("blocked scenes return no route instead of a straight line through obstacles", () => {
  const barrier = { left: 54, right: 66, top: 0, bottom: 100 };
  assert.deepEqual(getWalkPath({ x: 50, y: 70 }, { x: 70, y: 70 }, "room", [barrier]), []);
  const coveredScene = { left: 0, right: 100, top: 0, bottom: 100 };
  assert.deepEqual(getWalkPath({ x: 50, y: 70 }, { x: 70, y: 70 }, "room", [coveredScene]), []);
  assert.deepEqual(clampToScene({ x: 50, y: 70 }, "room", [coveredScene]), { x: 50, y: 70 });
});

test("walk routes detect thin obstacles between sampling points", () => {
  const from = { x: 20, y: 70 };
  const target = { x: 70, y: 70 };
  const thinObstacle = { left: 45.11, right: 45.12, top: 60, bottom: 80 };
  const path = getWalkPath(from, target, "room", [thinObstacle]);
  assert.ok(path.length > 1);
  assert.deepEqual(path.at(-1), target);
  assertClearPath(from, path, [thinObstacle]);
});

test("open paths retain direct routes and target clamping", () => {
  assert.deepEqual(getWalkPath({ x: 30, y: 70 }, { x: 50, y: 70 }, "room"), [{ x: 50, y: 70 }]);
  assert.deepEqual(getWalkPath({ x: 30, y: 70 }, { x: 110, y: 100 }, "room"), [{ x: 93, y: 88 }]);
});

test("unfinished sleep preserves stats until its end", () => {
  const result = settlePetSleep(72, 24, 1_000_000, 20_000_000, 30, 10_000_000);
  assert.deepEqual(result, { energy: 72, sleepiness: 24, statsUpdatedAt: 10_000_000, sleepEndsAt: 20_000_000, sleepRest: 30, sleepEnded: false });
});

test("waking restores sleepiness at the deadline before awake decay", () => {
  const endsAt = 20_000_000;
  const result = settlePetSleep(72, 24, 1_000_000, endsAt, 30, endsAt + 2.5 * PET_STAT_DECAY_MS);
  assert.deepEqual(result, { energy: 70, sleepiness: 2, statsUpdatedAt: endsAt + 2 * PET_STAT_DECAY_MS, sleepEndsAt: null, sleepRest: 0, sleepEnded: true });
  assert.deepEqual(settlePetSleep(72, 24, 1_000_000, endsAt, 30, endsAt), { energy: 72, sleepiness: 0, statsUpdatedAt: endsAt, sleepEndsAt: null, sleepRest: 0, sleepEnded: true });
});

test("sleep completed 21 hours ago applies all subsequent awake decay", () => {
  const endsAt = 20_000_000;
  const now = endsAt + 21 * 60 * 60 * 1000;
  const result = settlePetSleep(72, 24, 1_000_000, endsAt, 30, now);
  assert.deepEqual(result, { energy: 0, sleepiness: 100, statsUpdatedAt: now, sleepEndsAt: null, sleepRest: 0, sleepEnded: true });
});

test("settled sleep does not restore twice and preserves fractional decay time", () => {
  const endsAt = 20_000_000;
  const now = endsAt + 2.5 * PET_STAT_DECAY_MS;
  const first = settlePetSleep(72, 50, 1_000_000, endsAt, 30, now);
  const second = settlePetSleep(first.energy, first.sleepiness, first.statsUpdatedAt, first.sleepEndsAt, first.sleepRest, now);
  assert.deepEqual(second, { ...first, sleepEnded: false });
  const later = settlePetSleep(second.energy, second.sleepiness, second.statsUpdatedAt, second.sleepEndsAt, second.sleepRest, now + .5 * PET_STAT_DECAY_MS);
  assert.deepEqual(later, { energy: 69, sleepiness: 23, statsUpdatedAt: endsAt + 3 * PET_STAT_DECAY_MS, sleepEndsAt: null, sleepRest: 0, sleepEnded: false });
});

test("different pets settle their own sleep independently", () => {
  const endsAt = 20_000_000;
  const now = endsAt + 3 * PET_STAT_DECAY_MS;
  const activePet = settlePetSleep(72, 24, 1_000_000, endsAt, 30, now);
  const roommate = settlePetSleep(85, 80, 2_000_000, endsAt - PET_STAT_DECAY_MS, 55, now);
  assert.equal(activePet.energy, 69);
  assert.equal(activePet.sleepiness, 3);
  assert.equal(roommate.energy, 81);
  assert.equal(roommate.sleepiness, 29);
  assert.equal(activePet.sleepEndsAt, null);
  assert.equal(roommate.sleepEndsAt, null);
});
