import assert from "node:assert/strict";
import test from "node:test";
import { berryKeyframes, POP_MS, TRAVEL_MS } from "../app/game/reward-flight.ts";

function position(frame) {
  const match = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(frame.transform) ?? /translate3d\((-?[\d.]+), (-?[\d.]+)/.exec(frame.transform);
  return { x: Number(match[1]), y: Number(match[2]) };
}

test("reward berries pop out, then glide along a smooth arc into the counter", () => {
  const from = { x: 600, y: 420 };
  const to = { x: 330, y: 40 };
  for (let index = 0; index < 4; index += 1) {
    const frames = berryKeyframes(from, to, index, 4);
    assert.equal(frames[0].offset, 0);
    assert.equal(frames.at(-1).offset, 1);
    frames.slice(1).forEach((frame, step) => assert.ok(frame.offset > frames[step].offset, "offsets increase"));
    const end = position(frames.at(-1));
    assert.ok(Math.abs(end.x - (to.x - from.x)) < .5 && Math.abs(end.y - (to.y - from.y)) < .5, "ends on the counter");
    // The travel part is sampled densely: neighbouring segments never change speed abruptly.
    const travel = frames.filter((frame) => frame.offset >= POP_MS / (POP_MS + TRAVEL_MS) - 1e-9);
    const speeds = travel.slice(1).map((frame, step) => {
      const a = position(travel[step]);
      const b = position(frame);
      return Math.hypot(b.x - a.x, b.y - a.y) / (frame.offset - travel[step].offset);
    });
    const fastest = Math.max(...speeds);
    for (let step = 1; step < speeds.length; step += 1) {
      const jump = Math.abs(speeds[step] - speeds[step - 1]) / fastest;
      assert.ok(jump < .25, `segment ${step} speed jumps by ${(jump * 100).toFixed(0)}% of top speed`);
    }
    assert.ok(travel.length >= 18);
    const peak = Math.min(...travel.map((frame) => position(frame).y));
    assert.ok(peak < Math.min(0, to.y - from.y), "arcs above the straight line");
  }
});
