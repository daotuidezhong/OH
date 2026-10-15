import assert from "node:assert/strict";
import test from "node:test";
import { advanceFeeding, beginFeeding, DEFAULT_BOWL_POSITION, EMPTY_FEEDING, FEEDING_DURATIONS, findBowlPlacement, getEatingFrame, normalizeBowlPosition } from "../app/game/feeding.ts";
import { furnitureCollision } from "../app/game/room-depth.ts";
import { getCatFeedingRig, getFeedingDockOffset, getFeedingPose } from "../app/game/feeding-pose.ts";

const options = { from: { x: 30, y: 70 }, target: { x: 60, y: 82 }, obstacles: [], sleeping: false, petId: "mitao", foodId: "driedFish", energy: 10 };

test("initial bowl is empty; an active session rejects every repeated feeding", () => {
  assert.equal(EMPTY_FEEDING.bowl, "empty");
  let state = beginFeeding(EMPTY_FEEDING, options);
  assert.equal(state.bowl, "filled");
  while (state.phase !== "IDLE") {
    assert.equal(beginFeeding(state, options), null);
    state = advanceFeeding(state, 16);
  }
  assert.equal(state.bowl, "empty");
  assert.ok(beginFeeding(state, options));
});

test("cat walks continuously and cannot eat before reaching the bowl", () => {
  let state = beginFeeding(EMPTY_FEEDING, options);
  let previous = state.position;
  const phases = [];
  let emptyTransitions = 0;
  while (state.phase !== "IDLE") {
    if (phases.at(-1) !== state.phase) phases.push(state.phase);
    const next = advanceFeeding(state, 16);
    assert.ok(Math.hypot(next.position.x - previous.x, next.position.y - previous.y) <= 18 * .016 + 1e-8);
    if (["LOWER_HEAD", "EATING", "FINISH_EATING"].includes(next.phase)) assert.deepEqual(next.position, options.target);
    if (state.bowl === "filled" && next.bowl === "empty") emptyTransitions++;
    previous = next.position;
    state = next;
  }
  assert.deepEqual(phases, ["WALK_TO_BOWL", "ALIGN_AT_BOWL", "LOWER_HEAD", "EATING", "FINISH_EATING"]);
  assert.equal(emptyTransitions, 1);
  assert.deepEqual(state.position, options.target);
});

test("resting cats wake before moving; cancelled sleep gives no instant relocation", () => {
  const state = beginFeeding(EMPTY_FEEDING, { ...options, sleeping: true });
  const almostAwake = advanceFeeding(state, FEEDING_DURATIONS.WAKING - 1);
  assert.equal(almostAwake.phase, "WAKING");
  assert.deepEqual(almostAwake.position, options.from);
  const awake = advanceFeeding(almostAwake, 1);
  assert.equal(awake.phase, "WALK_TO_BOWL");
  assert.deepEqual(awake.position, options.from);
});

test("blocked routes and clamped docking points leave the bowl empty", () => {
  assert.equal(beginFeeding(EMPTY_FEEDING, { ...options, obstacles: [{ left: 40, right: 50, top: 0, bottom: 100 }] }), null);
  assert.equal(beginFeeding(EMPTY_FEEDING, { ...options, target: { x: 105, y: 82 } }), null);
  assert.equal(EMPTY_FEEDING.bowl, "empty");
});

test("feeding route goes around furniture without crossing its footprint", () => {
  const obstacle = { left: 40, right: 50, top: 65, bottom: 83 };
  let state = beginFeeding(EMPTY_FEEDING, { ...options, obstacles: [obstacle] });
  assert.ok(state.path.length > 1);
  while (state.phase !== "IDLE") {
    state = advanceFeeding(state, 16);
    const p = state.position;
    assert.ok(!(p.x > obstacle.left && p.x < obstacle.right && p.y > obstacle.top && p.y < obstacle.bottom));
  }
});

test("lowering, chewing and raising use a reversible sprite sequence", () => {
  assert.deepEqual([0, 200, 400].map((elapsed) => getEatingFrame({ phase: "LOWER_HEAD", elapsed })), [0, 1, 2]);
  assert.deepEqual([0, 180, 360, 540].map((elapsed) => getEatingFrame({ phase: "EATING", elapsed })), [2, 3, 2, 3]);
  assert.deepEqual([0, 230, 460].map((elapsed) => getEatingFrame({ phase: "FINISH_EATING", elapsed })), [2, 1, 0]);
});

test("bowl placement avoids both furniture and blocked docking spaces", () => {
  const obstacle = { left: 59, right: 69, top: 78, bottom: 88 };
  const placement = findBowlPlacement([obstacle], { x: 4, y: 4 });
  assert.deepEqual(placement.bowl, { x: 51, y: 86 });
  assert.equal(findBowlPlacement([{ left: 0, right: 100, top: 0, bottom: 100 }], { x: 4, y: 4 }), null);
});

test("a saved bowl stays at its chosen position and old or malformed saves use the default", () => {
  const preferred = { x: 43, y: 73 };
  const restored = normalizeBowlPosition(JSON.parse(JSON.stringify(preferred)));
  assert.deepEqual(findBowlPlacement([], { x: 6, y: 2 }, undefined, { preferred: restored }).bowl, preferred);
  for (const value of [undefined, null, {}, { x: "43", y: 73 }, { x: NaN, y: 73 }, { x: Infinity, y: 73 }, { x: 101, y: 73 }]) {
    assert.deepEqual(normalizeBowlPosition(value), DEFAULT_BOWL_POSITION);
  }
});

test("an invalid bowl drop is rejected instead of silently selecting another location", () => {
  const obstacle = { left: 40, right: 50, top: 60, bottom: 80 };
  const offset = { x: 6, y: 2 };
  for (const preferred of [{ x: 45, y: 70 }, { x: 8, y: 70 }, { x: 60, y: 90 }, { x: 60, y: 42 }]) {
    assert.equal(findBowlPlacement([obstacle], offset, undefined, { preferred, strict: true }), null);
    assert.ok(findBowlPlacement([obstacle], offset, undefined, { preferred }));
  }
});

test("a moved bowl reserves separate reachable docks for all three original cats", () => {
  const preferred = { x: 52, y: 76 };
  const approaches = ["mitao", "doubao", "xueqiu"].map((id) => ({ offset: getFeedingDockOffset(id, 144, 84), from: { x: 20, y: 68 } }))
    .map((approach) => ({ ...approach, offset: { x: approach.offset.x / 12, y: approach.offset.y / 9 } }));
  for (const approach of approaches) {
    const placement = findBowlPlacement([], approach.offset, undefined, { preferred, strict: true, approaches });
    assert.deepEqual(placement.bowl, preferred);
    let state = beginFeeding(EMPTY_FEEDING, { ...options, from: approach.from, target: placement.target });
    assert.ok(state);
    while (state.phase !== "LOWER_HEAD") state = advanceFeeding(state, 16);
    assert.deepEqual(state.position, placement.target);
    while (state.phase !== "IDLE") state = advanceFeeding(state, 16);
    assert.equal(state.bowl, "empty");
  }
  const blockedDock = { left: 44, right: 48, top: 74, bottom: 78 };
  assert.equal(findBowlPlacement([blockedDock], { x: 2, y: 0 }, undefined, { preferred, strict: true, approaches }), null);
});

test("an enclosed bowl and a bowl that leaves no room for the cat are rejected", () => {
  const preferred = { x: 60, y: 75 };
  const offset = { x: 6, y: 2 };
  const approaches = [{ offset, from: { x: 30, y: 70 } }];
  const wall = { left: 40, right: 50, top: 0, bottom: 100 };
  assert.equal(findBowlPlacement([wall], offset, undefined, { preferred, strict: true, approaches }), null);
  assert.ok(findBowlPlacement([], offset, undefined, { preferred, strict: true, approaches }));
  assert.equal(findBowlPlacement([], offset, undefined, { preferred, strict: true, approaches,
    footprint: { left: -8, right: 8, top: -5, bottom: 5 } }), null);
});

test("bowl placement respects furniture artwork while keeping cat paths on floor footprints", () => {
  const occupied = [{ left: 40, right: 65, top: 50, bottom: 72 }];
  const offset = { x: 6, y: 2 };
  assert.equal(findBowlPlacement([], offset, undefined, { preferred: { x: 55, y: 66 }, strict: true, occupied }), null);
  const preferred = { x: 55, y: 76 };
  assert.deepEqual(findBowlPlacement([], offset, undefined, { preferred, strict: true, occupied }).bowl, preferred);
});

test("collision footprints use rendered floor contact and allow clearance for the cat body", () => {
  const rect = furnitureCollision({ left: 200, top: 500, width: 200, height: 200 }, { left: 0, top: 0, width: 1000, height: 1000 }, 100);
  assert.equal(rect.left, 20);
  assert.equal(rect.right, 40);
  assert.equal(rect.top, 63.6);
  assert.equal(rect.bottom, 69.1);
  assert.ok(rect.top > 50, "A tall image is solid only at its floor footprint");
});

test("feeding uses each original cat and joins the held poses at phase boundaries", () => {
  assert.deepEqual(["mitao", "doubao", "xueqiu"].map((id) => getCatFeedingRig(id).asset), ["/game/cat-orange-idle.png", "/game/cat-cow-idle.png", "/game/cat-white-idle.png"]);
  assert.deepEqual(getFeedingPose({ phase: "LOWER_HEAD", elapsed: 0 }), { angle: 0, jaw: 0 });
  assert.deepEqual(getFeedingPose({ phase: "LOWER_HEAD", elapsed: FEEDING_DURATIONS.LOWER_HEAD }), getFeedingPose({ phase: "EATING", elapsed: 0 }));
  const end = getFeedingPose({ phase: "EATING", elapsed: FEEDING_DURATIONS.EATING });
  const raising = getFeedingPose({ phase: "FINISH_EATING", elapsed: 0 });
  assert.ok(Math.abs(end.angle - raising.angle) < 1e-8 && Math.abs(end.jaw - raising.jaw) < 1e-8);
  assert.deepEqual(getFeedingPose({ phase: "FINISH_EATING", elapsed: FEEDING_DURATIONS.FINISH_EATING }), { angle: 0, jaw: 0 });
});

test("feeding holds each drawing until the next sprite frame without interpolated poses", () => {
  const pose = (phase, elapsed) => getFeedingPose({ phase, elapsed });
  for (let elapsed = 0; elapsed < 600; elapsed++) {
    const angle = elapsed < 200 ? 0 : elapsed < 400 ? 24 : 48;
    assert.deepEqual(pose("LOWER_HEAD", elapsed), { angle, jaw: 0 });
  }
  for (let elapsed = 0; elapsed < 3600; elapsed++) {
    const open = Math.floor(elapsed / 180) % 2 === 1;
    assert.deepEqual(pose("EATING", elapsed), open ? { angle: 47.5, jaw: 2 } : { angle: 48, jaw: 0 });
  }
  for (let elapsed = 0; elapsed < 700; elapsed++) {
    const angle = elapsed < 230 ? 48 : elapsed < 460 ? 24 : 0;
    assert.deepEqual(pose("FINISH_EATING", elapsed), { angle, jaw: 0 });
  }
});

test("chewing stays subtle and docking matches each cat's unscaled muzzle", () => {
  for (let elapsed = 0; elapsed <= 3600; elapsed += 16) {
    const pose = getFeedingPose({ phase: "EATING", elapsed });
    assert.ok(Math.abs(pose.angle - 48) <= .5);
    assert.ok(pose.jaw >= 0 && pose.jaw <= 2);
  }
  const offsets = ["mitao", "doubao", "xueqiu"].map((id) => getFeedingDockOffset(id, 144, 84));
  assert.ok(offsets.every((offset) => offset.x > 65 && offset.x < 85 && offset.y > -5 && offset.y < 20));
  assert.ok(new Set(offsets.map((offset) => offset.y)).size === 3, "Different original head heights need different docking points");
});
