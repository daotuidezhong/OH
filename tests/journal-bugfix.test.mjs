import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getJournalStreak, localDate } from "../app/game/journal.ts";
import { getJournalReward } from "../app/game/journal-reward.ts";
import { stablePhotoRotation } from "../app/game/photo-board/types.ts";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const checkinsSource = await readFile(new URL("../db/checkins.ts", import.meta.url), "utf8");

function loadPageFunctions(names, bindings) {
  const declarations = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.set(node.name.text, node.getText(pageAst));
    ts.forEachChild(node, visit);
  }
  visit(pageAst);
  for (const name of names) assert.ok(declarations.has(name), `Missing page function ${name}`);
  const source = `${names.map((name) => declarations.get(name)).join("\n")}\n({ ${names.join(", ")} });`;
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
  return vm.runInNewContext(compiled.outputText, { Error, ...bindings }, { filename: "page-functions.js" });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function fixedDate(date) {
  return class extends Date {
    constructor(...args) { super(...(args.length ? args : [date.getTime()])); }
    static now() { return date.getTime(); }
  };
}

function updateState(state, key) {
  return (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; };
}

function makeRecord(overrides = {}) {
  return { id: 1, date: "2026-10-09", content: "提交时的文字", category: "其他", rating: 5, reward: 6, createdAt: "2026-10-09T00:01:00.000Z", ...overrides };
}

function checkinHarness({ now = new Date(2026, 9, 9, 0, 1), history = [], desktop = false, fetch, game = {} } = {}) {
  const state = {
    noteText: "  提交时的文字  ", history, historyMeta: { total: history.length, totalDays: new Set(history.map((record) => record.date)).size, nextCursor: null },
    game: { berries: 48, streak: 4, lastCheckin: "2026-10-08", lastActivity: null, ...game },
    savingCheckin: false, today: "2026-10-08", dateLabel: "", toast: "",
  };
  const saveLock = { current: false };
  const persisted = new Map();
  const actions = loadPageFunctions(["checkIn"], {
    ...state, ready: true, historyReady: true, deviceId: "device-a", category: "其他", rating: 5,
    navigator: { userAgent: desktop ? "BerryWorkoutDesktop" : "TestBrowser" },
    Date: fixedDate(now), localDate, getJournalStreak, getJournalReward, checkinSaveLock: saveLock,
    fetch: fetch ?? (() => { throw new Error("Unexpected HTTP request"); }),
    writePersisted: (key, value) => persisted.set(key, value),
    setToday: updateState(state, "today"), setDateLabel: updateState(state, "dateLabel"),
    setSavingCheckin: updateState(state, "savingCheckin"), setHistory: updateState(state, "history"),
    setHistoryMeta: updateState(state, "historyMeta"), setGame: updateState(state, "game"),
    setNoteText: updateState(state, "noteText"), setToast: updateState(state, "toast"),
  });
  return { state, saveLock, persisted, submit: () => actions.checkIn({ preventDefault() {} }) };
}

function photoHarness({ preparePhotoFile, fetch, photos = [] } = {}) {
  const state = { photos, uploadingPhotoId: null, photoUploadBusy: false, toast: "" };
  const lock = { current: false };
  const queuedPhotoUpdates = [];
  const actions = loadPageFunctions(["nextPhotoBoardSlot", "addPhotoBoardPhoto", "uploadWebPhotoBoardPhoto"], {
    deviceId: "device-a", photoBoardPhotos: photos, uploadingPhotoId: null, photoUploadLock: lock,
    stablePhotoRotation, Date, FormData, preparePhotoFile, fetch,
    window: { setTimeout() {} },
    setPhotoBoardPhotos: (update) => queuedPhotoUpdates.push(update),
    setUploadingPhotoId: updateState(state, "uploadingPhotoId"),
    setPhotoUploadBusy: updateState(state, "photoUploadBusy"), setToast: updateState(state, "toast"),
  });
  return {
    state, lock, actions,
    flushPhotos() {
      for (const update of queuedPhotoUpdates.splice(0)) updateState(state, "photos")(update);
    },
  };
}

function memoryCheckins(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  const adapter = {
    prepare(sql) {
      const statement = database.prepare(sql);
      function bound(parameters = []) {
        return {
          bind: (...values) => bound(values),
          async run() {
            const result = statement.run(...parameters);
            return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } };
          },
          async all() { return { results: statement.all(...parameters) }; },
          async first() { return statement.get(...parameters) ?? null; },
        };
      }
      return bound();
    },
  };
  const exports = {};
  const compiled = ts.transpileModule(checkinsSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(compiled.outputText, {
    exports,
    require(name) {
      assert.equal(name, "cloudflare:workers");
      return { env: { DB: adapter } };
    },
  }, { filename: "db-checkins.js" });
  return { database, ...exports };
}

async function seedRecords(db, deviceId, countsByDate) {
  await db.listCheckins(deviceId);
  const insert = db.database.prepare("INSERT INTO checkins (device_id, date, activity, category, rating, reward, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const [date, count] of countsByDate) {
    for (let index = 0; index < count; index += 1) insert.run(deviceId, date, `${deviceId}/${date}/${index}`, "其他", 5, 6, `${date}T12:00:00.000Z`);
  }
}

test("journal dates advance over midnight and interrupted streaks reset", () => {
  const beforeMidnight = localDate(new Date(2026, 9, 8, 23, 59));
  const afterMidnight = localDate(new Date(2026, 9, 9, 0, 1));
  assert.equal(beforeMidnight, "2026-10-08");
  assert.equal(afterMidnight, "2026-10-09");
  assert.equal(getJournalStreak(beforeMidnight, 4, afterMidnight), 4);
  assert.equal(getJournalStreak(beforeMidnight, 4, afterMidnight, true), 5);
  assert.equal(getJournalStreak(beforeMidnight, 4, "2026-10-10"), 0);
  assert.equal(getJournalStreak(beforeMidnight, 4, "2026-10-10", true), 1);
  assert.equal(getJournalStreak(afterMidnight, 5, afterMidnight, true), 5);
  assert.equal(getJournalStreak("2026-12-31", 9, "2027-01-01", true), 10);
  assert.equal(getJournalStreak(null, 0, afterMidnight, true), 1);
});

test("101 same-day records are all accessible and ordered deterministically", async (t) => {
  const db = memoryCheckins(t);
  await seedRecords(db, "device-a", [["2026-10-09", 101]]);
  const page = await db.listCheckins("device-a");
  assert.equal(page.records.length, 101);
  assert.equal(page.total, 101);
  assert.equal(page.totalDays, 1);
  assert.equal(page.nextCursor, null);
  assert.deepEqual(Array.from(page.records, (record) => record.id), Array.from({ length: 101 }, (_, index) => 101 - index));
  assert.equal(await db.countCheckinsForDate("device-a", "2026-10-09"), 101);
});

test("date cursor pagination preserves every record and isolates devices", async (t) => {
  const db = memoryCheckins(t);
  const dates = ["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03"];
  await seedRecords(db, "device-a", dates.map((date, index) => [date, index === 0 ? 101 : 3]));
  await seedRecords(db, "device-b", [["2026-10-09", 5]]);
  const records = [];
  const cursors = [];
  let cursor = null;
  do {
    const page = await db.listCheckins("device-a", cursor);
    assert.equal(page.total, 119);
    assert.equal(page.totalDays, 7);
    assert.ok(page.records.every((record) => record.content.startsWith("device-a/")));
    if (cursor) assert.ok(page.records.every((record) => record.date < cursor));
    records.push(...page.records);
    cursor = page.nextCursor;
    if (cursor) cursors.push(cursor);
    assert.ok(cursors.length < 10, "Cursor must advance");
  } while (cursor);
  assert.equal(records.length, 119);
  assert.equal(new Set(records.map((record) => record.id)).size, 119);
  assert.deepEqual([...new Set(records.map((record) => record.date))], dates);
  assert.deepEqual(cursors, ["2026-10-08", "2026-10-06", "2026-10-04"]);
  const otherDevice = await db.listCheckins("device-b");
  assert.equal(otherDevice.records.length, 5);
  assert.equal(otherDevice.total, 5);
  assert.equal(otherDevice.totalDays, 1);
  assert.ok(otherDevice.records.every((record) => record.content.startsWith("device-b/")));
  assert.equal(await db.countCheckinsForDate("device-b", "2026-10-09"), 5);
  const missingDevice = await db.listCheckins("not-saved");
  assert.equal(missingDevice.records.length, 0);
  assert.equal(missingDevice.total, 0);
  assert.equal(missingDevice.nextCursor, null);
  const end = await db.listCheckins("device-a", dates.at(-1));
  assert.equal(end.records.length, 0);
  assert.equal(end.total, 119);
  assert.equal(end.nextCursor, null);
});

test("delayed journal saves preserve a newer draft and save the submitted snapshot", async () => {
  const response = deferred();
  let submitted;
  const harness = checkinHarness({ fetch: async (_url, options) => { submitted = JSON.parse(options.body); return response.promise; } });
  const pending = harness.submit();
  assert.equal(harness.saveLock.current, true);
  assert.equal(harness.state.savingCheckin, true);
  harness.state.noteText = "请求期间新写的草稿";
  response.resolve({ ok: true, json: async () => ({ record: makeRecord() }) });
  await pending;
  assert.equal(submitted.content, "提交时的文字");
  assert.equal(harness.state.history[0].content, "提交时的文字");
  assert.equal(harness.state.noteText, "请求期间新写的草稿");
  assert.equal(harness.state.game.berries, 54);
  assert.equal(harness.saveLock.current, false);
  assert.equal(harness.state.savingCheckin, false);
});

test("failed journal saves release their lock and allow retry", async () => {
  const response = deferred();
  let requests = 0;
  const harness = checkinHarness({ fetch: async () => {
    requests += 1;
    return requests === 1 ? response.promise : { ok: true, json: async () => ({ record: makeRecord() }) };
  } });
  const pending = harness.submit();
  await harness.submit();
  assert.equal(requests, 1, "Same-render duplicate submit is blocked synchronously");
  response.reject(new Error("Network failure"));
  await pending;
  assert.equal(harness.state.noteText, "  提交时的文字  ");
  assert.equal(harness.state.game.berries, 48);
  assert.equal(harness.state.history.length, 0);
  assert.equal(harness.saveLock.current, false);
  assert.equal(harness.state.savingCheckin, false);
  await harness.submit();
  assert.equal(requests, 2);
  assert.equal(harness.state.history.length, 1);
  assert.equal(harness.state.noteText, "");
});

test("journal submission uses the actual date and that date's reward count", async () => {
  const history = [
    makeRecord({ id: 2 }),
    ...Array.from({ length: 3 }, (_, index) => makeRecord({ id: index + 10, date: "2026-10-08" })),
  ];
  const harness = checkinHarness({ desktop: true, history });
  await harness.submit();
  assert.equal(harness.state.today, "2026-10-09");
  assert.equal(harness.state.history[0].date, "2026-10-09");
  assert.equal(harness.state.history[0].reward, 8);
  assert.equal(harness.state.game.berries, 56);
  assert.equal(harness.state.game.streak, 5);
  assert.equal(harness.state.game.lastCheckin, "2026-10-09");
  const persisted = JSON.parse(harness.persisted.get("berry-workout-history"));
  assert.equal(persisted[0].date, "2026-10-09");
});

test("submitting after an unrecorded day starts a new streak", async () => {
  const harness = checkinHarness({ desktop: true, now: new Date(2026, 9, 10, 0, 1) });
  await harness.submit();
  assert.equal(harness.state.game.streak, 1);
  assert.equal(harness.state.game.lastCheckin, "2026-10-10");
  assert.equal(harness.state.history[0].reward, 6);
});

test("photo slots are allocated from the current functional setter state", () => {
  const harness = photoHarness();
  harness.actions.addPhotoBoardPhoto({ id: "first", key: "first.jpg", width: 100, height: 100 });
  harness.actions.addPhotoBoardPhoto({ id: "second", key: "second.jpg", width: 100, height: 100 });
  harness.flushPhotos();
  assert.deepEqual(Array.from(harness.state.photos, (photo) => photo.slot), [0, 1]);
  assert.equal(new Set(harness.state.photos.map((photo) => photo.slot)).size, 2);
  assert.equal(harness.actions.nextPhotoBoardSlot([{ slot: 0 }, { slot: 2 }]), 1);
});

test("photo upload locks synchronously while preparation and HTTP are pending", async () => {
  const prepared = deferred();
  let preparations = 0;
  let requests = 0;
  let uploadedForm;
  const harness = photoHarness({
    preparePhotoFile: () => { preparations += 1; return prepared.promise; },
    fetch: async (_url, options) => {
      requests += 1;
      uploadedForm = options.body;
      return { ok: true, json: async () => ({ photo: { id: "uploaded", key: "saved.jpg", width: 200, height: 100 } }) };
    },
  });
  const pending = harness.actions.uploadWebPhotoBoardPhoto({ name: "first.png" });
  assert.equal(harness.lock.current, true);
  assert.equal(harness.state.photoUploadBusy, true);
  await harness.actions.uploadWebPhotoBoardPhoto({ name: "second.png" });
  assert.equal(preparations, 1);
  assert.equal(requests, 0);
  prepared.resolve({ blob: new Blob(["image"], { type: "image/jpeg" }), width: 200, height: 100 });
  await pending;
  harness.flushPhotos();
  assert.equal(requests, 1);
  assert.equal(uploadedForm.get("deviceId"), "device-a");
  assert.equal(uploadedForm.get("width"), "200");
  assert.equal(harness.state.photos.length, 1);
  assert.equal(harness.state.photos[0].slot, 0);
  assert.equal(harness.lock.current, false);
  assert.equal(harness.state.photoUploadBusy, false);
});

test("photo upload failures unlock the next attempt", async () => {
  let requests = 0;
  const harness = photoHarness({
    preparePhotoFile: async () => ({ blob: new Blob(["image"]), width: 100, height: 100 }),
    fetch: async () => {
      requests += 1;
      return requests === 1 ? { ok: false } : { ok: true, json: async () => ({ photo: { id: "retry", key: "retry.jpg", width: 100, height: 100 } }) };
    },
  });
  await harness.actions.uploadWebPhotoBoardPhoto({ name: "first.png" });
  assert.equal(harness.lock.current, false);
  assert.equal(harness.state.photoUploadBusy, false);
  harness.flushPhotos();
  assert.equal(harness.state.photos.length, 0);
  await harness.actions.uploadWebPhotoBoardPhoto({ name: "retry.png" });
  harness.flushPhotos();
  assert.equal(requests, 2);
  assert.equal(harness.state.photos.length, 1);
  assert.equal(harness.lock.current, false);
});
