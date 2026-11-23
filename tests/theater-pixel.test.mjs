import assert from "node:assert/strict";
import test from "node:test";
import { BUBBLE_Y, DOLL_TOP, handPose, HEART, SCREEN, SCREEN_BOTTOM, SEAT_DY, SEATS, W, H } from "../app/theater/pixelArt.ts";

test("screen is 16:9 and sits inside the room", () => {
  assert.ok(Math.abs(SCREEN.w / SCREEN.h - 16 / 9) < 0.02);
  assert.ok(SCREEN.x > 0 && SCREEN.x + SCREEN.w < W && SCREEN.y > 0 && SCREEN_BOTTOM < H);
});

test("nothing on the seat layer reaches up into the screen (Bilibili covers it)", () => {
  assert.ok(DOLL_TOP + SEAT_DY > SCREEN_BOTTOM, "dolls' heads stay below the screen");
  assert.ok(HEART.y - 6 > SCREEN_BOTTOM, "heart stays below the screen");
  assert.ok(BUBBLE_Y - 12 > SCREEN_BOTTOM, "bubbles hang beside the heads, below the screen");
  for (const side of ["left", "right"]) {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) assert.ok(handPose(side, p).paw.y + SEAT_DY - 4 > SCREEN_BOTTOM, `${side} paw at ${p}`);
  }
});

test("holding hands: inner paws rest on the armrests, then meet over the popcorn table", () => {
  const restLeft = handPose("left", 0).paw;
  const restRight = handPose("right", 0).paw;
  assert.ok(restLeft.x > SEATS.left && restRight.x < SEATS.right, "resting paws are on the inner armrests");
  const left = handPose("left", 1).paw;
  const right = handPose("right", 1).paw;
  assert.ok(Math.hypot(left.x - right.x, left.y - right.y) <= 8, "paws touch");
  assert.ok(Math.abs((left.x + right.x) / 2 - (SEATS.left + SEATS.right) / 2) < 1, "they meet in the middle");
  assert.ok(left.y < restLeft.y, "arms are raised to hold hands");
  // 动画中途手在两者之间，不会乱跳
  const mid = handPose("left", 0.5).paw;
  assert.ok(mid.x > restLeft.x && mid.x < left.x);
});
