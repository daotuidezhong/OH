import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanChatText, HOLD_TOKEN, formatRoomCode, generateRoomCode, isTheaterConfig,
  normalizeRoomCode, parseTheaterMessage, roomCredentials, ROOM_CODE_ALPHABET,
} from "../app/theater/protocol.ts";

test("generates readable six-character theater codes", () => {
  let seed = 0;
  const code = generateRoomCode(() => (seed = (seed * 9301 + 49297) % 233280) / 233280);
  assert.equal(code.length, 6);
  assert.ok([...code].every((char) => ROOM_CODE_ALPHABET.includes(char)));
  assert.equal(generateRoomCode(() => 0.999999), "ZZZZZZ");
  assert.equal(formatRoomCode("K7Q2MX"), "K7Q 2MX");
});

test("normalizes what the partner types in", () => {
  assert.equal(normalizeRoomCode(" k7q-2mx "), "K7Q2MX");
  assert.equal(normalizeRoomCode("K7Q 2MX"), "K7Q2MX");
  assert.equal(normalizeRoomCode("K7Q2M"), null);
  assert.equal(normalizeRoomCode("K7Q2M!"), null);
  // 0/O、1/I/L 不在字母表里，输入了也不会被接受
  assert.equal(normalizeRoomCode("OOOOOO"), null);
});

test("both partners derive the same VideoTogether room", () => {
  assert.deepEqual(roomCredentials("K7Q2MX"), roomCredentials(normalizeRoomCode("k7q 2mx")));
  assert.notDeepEqual(roomCredentials("K7Q2MX"), roomCredentials("K7Q2MY"));
  assert.ok(isTheaterConfig({ code: "K7Q2MX", role: "master" }));
  assert.ok(!isTheaterConfig({ code: "k7q2mx", role: "master" }));
  assert.ok(!isTheaterConfig({ code: "K7Q2MX", role: "host" }));
});

test("separates hold-hands signals from chat and cleans chat text", () => {
  assert.deepEqual(parseTheaterMessage(HOLD_TOKEN), { kind: "hold" });
  assert.deepEqual(parseTheaterMessage("  晚上好\n呀 "), { kind: "chat", text: "晚上好 呀" });
  assert.equal(parseTheaterMessage("   "), null);
  assert.equal(parseTheaterMessage(42), null);
  assert.equal(cleanChatText(`${HOLD_TOKEN}hi`), "OH:HANDhi");
  assert.equal(cleanChatText("哈".repeat(200)).length, 80);
});
