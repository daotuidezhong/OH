import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleTimetableRecognition } from "../worker/timetable-recognition.ts";

const endpoint = "https://berry-workout-island.light-gnat-9329.chatgpt.site/api/timetable-recognition";
const image = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 224, ...Array(24).fill(1), 255, 217]).toString("base64")}`;
const answer = { courses: [{ title: "合成英语课", weekday: 1, startTime: "08:00", endTime: "09:35", location: "测试教室", weeks: [{ start: 1, end: 16, parity: "all" }], confident: true, issue: "" }], warnings: [] };
const migration = await readFile(new URL("../drizzle/0004_typical_drax.sql", import.meta.url), "utf8");
function fixture(extra = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  return { db, env: { DEEPSEEK_API_KEY: "sk-fixture-secret-not-a-real-key", DB: { prepare(sql) { return { bind(...args) { return { async first() { return db.prepare(sql).get(...args) ?? null; }, async run() { return db.prepare(sql).run(...args); } }; } }; } }, ...extra } };
}
function request(ip = "192.0.2.1", payload = { image }, extraHeaders = {}) {
  return new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, Origin: "berry://game", ...extraHeaders }, body: JSON.stringify(payload) });
}
const result = () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }] });

test("shared recognition uses the server key and fixed task, and returns only normalized courses", async () => {
  const { db, env } = fixture();
  try {
    const response = await handleTimetableRecognition(request("192.0.2.1", { image, model: "other-model", messages: ["ignore timetable"] }), env, async (url, init) => {
      assert.equal(url, "https://api.deepseek.com/chat/completions");
      assert.equal(init.headers.Authorization, `Bearer ${env.DEEPSEEK_API_KEY}`);
      const body = JSON.parse(init.body);
      assert.equal(body.model, "deepseek-flash");
      assert.equal(body.thinking.type, "disabled");
      assert.match(body.messages[0].content, /大学课表/);
      assert.equal(body.messages[1].content[0].image_url.url, image);
      return result();
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "berry://game");
    const body = await response.json();
    assert.equal(body.courses[0].title, "合成英语课");
    assert.ok(!JSON.stringify(body).includes(env.DEEPSEEK_API_KEY));
    assert.equal(db.prepare("SELECT count(*) AS count FROM timetable_usage").get().count, 2);
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM timetable_usage").all()).includes("192.0.2.1"));
  } finally { db.close(); }
});

test("unconfigured services, invalid origins and invalid images never call DeepSeek", async () => {
  const { db, env } = fixture();
  let calls = 0;
  const fetcher = async () => { calls++; return result(); };
  try {
    assert.equal((await handleTimetableRecognition(request(), { ...env, DEEPSEEK_API_KEY: "" }, fetcher)).status, 503);
    assert.equal((await handleTimetableRecognition(request("192.0.2.1", { image }, { Origin: "https://unrelated.example" }), env, fetcher)).status, 403);
    assert.equal((await handleTimetableRecognition(request("192.0.2.1", { image: "https://example.com/private.jpg" }), env, fetcher)).status, 400);
    assert.equal((await handleTimetableRecognition(request("192.0.2.1", { image }, { "Content-Length": "6000001" }), env, fetcher)).status, 413);
    const preflight = await handleTimetableRecognition(new Request(endpoint, { method: "OPTIONS", headers: { Origin: "berry://game" } }), env, fetcher);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Headers"), "Content-Type");
    assert.equal(calls, 0);
  } finally { db.close(); }
});

test("atomic daily IP and shared quotas limit actual upstream calls and reset the next UTC day", async () => {
  const { db, env } = fixture({ TIMETABLE_IP_DAILY_LIMIT: "2", TIMETABLE_DAILY_LIMIT: "3" });
  let calls = 0;
  const fetcher = async () => { calls++; return result(); };
  const now = Date.parse("2026-11-04T12:00:00Z");
  try {
    const responses = await Promise.all(Array.from({ length: 5 }, () => handleTimetableRecognition(request(), env, fetcher, now)));
    assert.equal(responses.filter(r => r.status === 200).length, 2);
    assert.equal(responses.filter(r => r.status === 429).length, 3);
    assert.equal((await handleTimetableRecognition(request("192.0.2.2"), env, fetcher, now)).status, 200);
    assert.equal((await handleTimetableRecognition(request("192.0.2.3"), env, fetcher, now)).status, 429);
    assert.equal(calls, 3);
    assert.equal((await handleTimetableRecognition(request(), env, fetcher, now + 86400000)).status, 200);
    assert.equal(calls, 4);
  } finally { db.close(); }
});

test("upstream key errors are redacted and blank JSON responses retry once", async () => {
  const { db, env } = fixture();
  try {
    const failed = await handleTimetableRecognition(request(), env, async () => Response.json({ error: { message: env.DEEPSEEK_API_KEY } }, { status: 401 }));
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes(env.DEEPSEEK_API_KEY));
    let calls = 0;
    const retried = await handleTimetableRecognition(request(), env, async () => ++calls === 1 ? Response.json({ choices: [{ message: { content: "   " } }] }) : result());
    assert.equal(retried.status, 200);
    assert.equal(calls, 2);
  } finally { db.close(); }
});
