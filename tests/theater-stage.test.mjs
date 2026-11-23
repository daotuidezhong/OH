import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUBBLE, EMPTY_SEAT, SCREEN, SPRITES, STAGE_H, STAGE_W, UI } from "../app/theater/stageLayout.ts";

/** 读 WebP 文件头里的宽高（VP8X / VP8L / VP8）。 */
async function webpSize(publicPath) {
  const data = await readFile(new URL(`../public${publicPath}`, import.meta.url));
  assert.equal(data.toString("ascii", 0, 4), "RIFF");
  assert.equal(data.toString("ascii", 8, 12), "WEBP");
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { w: 1 + data.readUIntLE(24, 3), h: 1 + data.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { w: data.readUInt16LE(26) & 0x3fff, h: data.readUInt16LE(28) & 0x3fff };
}

test("every theater image matches its slot in the reference layout", async () => {
  for (const [name, sprite] of Object.entries(SPRITES)) {
    const size = await webpSize(sprite.src);
    assert.deepEqual(size, { w: sprite.w, h: sprite.h }, name);
    assert.ok(sprite.x >= 0 && sprite.y >= 0 && sprite.x + sprite.w <= STAGE_W && sprite.y + sprite.h <= STAGE_H, `${name} inside the stage`);
  }
});

test("screen hole is close to 16:9 and nothing on the seats overlaps it", () => {
  assert.ok(Math.abs(SCREEN.w / SCREEN.h - 16 / 9) < 0.03);
  const screenBottom = SCREEN.y + SCREEN.h;
  for (const name of ["dollLeft", "dollRight", "dollRightRest", "armLeft", "armRight", "heart"]) {
    assert.ok(SPRITES[name].y > screenBottom, `${name} stays below the screen (Bilibili is drawn over it)`);
  }
  for (const side of ["left", "right"]) assert.ok(BUBBLE[side].y - 40 > screenBottom, `${side} bubble below the screen`);
  assert.ok(EMPTY_SEAT.y > screenBottom);
});

test("hand-holding arms reach from each doll to the middle and meet", () => {
  const { armLeft, armRight, dollLeft, dollRight, dollRightRest } = SPRITES;
  // 左臂从粉色玩偶身上伸出、右臂从白色玩偶身上伸出，在中间相接
  assert.ok(armLeft.x >= dollLeft.x && armLeft.x < dollLeft.x + dollLeft.w);
  assert.ok(armRight.x + armRight.w > dollRight.x && armRight.x + armRight.w <= dollRight.x + dollRight.w);
  assert.ok(Math.abs(armLeft.x + armLeft.w - armRight.x) <= 6, "paws touch");
  // 两种白色玩偶图（伸手 / 收手）放在同一个位置
  assert.deepEqual([dollRight.x, dollRight.y, dollRight.w, dollRight.h], [dollRightRest.x, dollRightRest.y, dollRightRest.w, dollRightRest.h]);
});

test("controls sit where the reference puts them and do not cover the screen", () => {
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [name, item] of Object.entries(UI)) assert.ok(!overlaps(item, SCREEN), name);
  assert.ok(UI.ticket.x < 40 && UI.ticket.y < 100, "ticket top-left");
  assert.ok(UI.controls.x > STAGE_W - 140, "buttons top-right");
  assert.ok(UI.chat.y > STAGE_H - 90 && Math.abs(UI.chat.x + UI.chat.w / 2 - STAGE_W / 2) < 40, "chat bar bottom centre");
});
