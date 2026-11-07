import assert from "node:assert/strict";
import test from "node:test";
import { planWalk, sampleWalk, WALK_CYCLE_CAT_WIDTHS } from "../app/game/walk-motion.ts";

const room = { width: 1000, height: 600 };
const catWidth = 120;

test("walks ease in from a stop and ease out to a stop", () => {
  const plan = planWalk([{ x: 10, y: 50 }, { x: 40, y: 50 }, { x: 40, y: 70 }], room, catWidth);
  assert.equal(sampleWalk(plan, 0).speed, 0);
  assert.ok(sampleWalk(plan, plan.duration / 2).speed > 0);
  const end = sampleWalk(plan, plan.duration);
  assert.equal(end.speed, 0);
  assert.equal(end.done, true);
  assert.deepEqual(end.point, { x: 40, y: 70 });
  assert.equal(end.direction, "down");
  // Speed never jumps: consecutive 10ms samples differ by at most one acceleration step.
  let previous = 0;
  for (let t = 10; t <= plan.duration; t += 10) {
    const { speed } = sampleWalk(plan, t);
    assert.ok(Math.abs(speed - previous) <= plan.accel * .011 + 1e-6, `speed jump at ${t}ms`);
    previous = speed;
  }
});

test("leg frames advance with distance so the paws never slide", () => {
  const plan = planWalk([{ x: 10, y: 50 }, { x: 60, y: 50 }], room, catWidth);
  const frameDistance = catWidth * WALK_CYCLE_CAT_WIDTHS / 4;
  for (let t = 0; t <= plan.duration; t += 7) {
    const sample = sampleWalk(plan, t);
    assert.equal(sample.frame, Math.floor(sample.distance / frameDistance) % 4);
  }
  assert.equal(sampleWalk(plan, 0).frame, 0);
});

test("an interrupted walk keeps its speed and leg phase", () => {
  const fresh = planWalk([{ x: 50, y: 50 }, { x: 53, y: 50 }], room, catWidth);
  const carried = planWalk([{ x: 50, y: 50 }, { x: 53, y: 50 }], room, catWidth, fresh.vmax, 31);
  assert.equal(sampleWalk(carried, 0).speed, fresh.vmax);
  assert.equal(sampleWalk(carried, 0).frame, Math.floor(31 / carried.frameDistance) % 4);
  assert.ok(carried.duration < fresh.duration);
  // Too fast to stop within a tiny step: it brakes smoothly and still ends at rest on target.
  const brake = planWalk([{ x: 50, y: 50 }, { x: 50.4, y: 50 }], room, catWidth, fresh.vmax);
  const end = sampleWalk(brake, brake.duration);
  assert.equal(end.speed, 0);
  assert.deepEqual(end.point, { x: 50.4, y: 50 });
});
