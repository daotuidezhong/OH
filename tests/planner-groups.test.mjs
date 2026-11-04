import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { INITIAL_PLANNER } from "../app/game/planner/planner.ts";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const input = readFileSync(file, "utf8");
  const compiledModule = { exports: {} };
  cache.set(file, compiledModule);
  const source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const localRequire = name => {
    if (name.endsWith(".css")) return {};
    if (!name.startsWith(".")) return require(name);
    const absolute = path.resolve(path.dirname(file), name);
    if (/\.tsx?$/.test(absolute)) return load(absolute);
    try { return load(`${absolute}.tsx`); } catch (error) { if (error.code !== "ENOENT") throw error; }
    return load(`${absolute}.ts`);
  };
  new Function("require", "module", "exports", source)(localRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const PlannerOverlay = load(fileURLToPath(new URL("../app/game/planner/PlannerOverlay.tsx", import.meta.url))).default;
const task = (index, color = "berry") => ({ id: `task-${index}`, title: `作业 ${index}`, date: "2026-11-04", slot: "morning", startTime: null, endTime: null, location: "", note: "", priority: null, color, order: index, createdAt: "2026-11-04T00:00:00Z", completedAt: null, rewarded: false, pomodoros: 0 });
const render = tasks => renderToStaticMarkup(React.createElement(PlannerOverlay, {
  open: true, origin: { left: 800, top: 100, width: 180, height: 100 }, planner: { ...INITIAL_PLANNER, tasks }, today: "2026-11-04", now: new Date("2026-11-04T07:00:00").getTime(),
  onChange() {}, onClose() {}, onCompleteTask() { return 0; }, onStartFocus() {}, onWriteJournal() {},
}));

test("week cells render thirty matching tasks as one existing-color group", () => {
  const html = render(Array.from({ length: 30 }, (_, index) => task(index)));
  assert.match(html, /aria-label="展开莓果粉组，30项安排"/);
  assert.equal((html.match(/class="planner-group planner-color-berry"/g) ?? []).length, 1);
  assert.equal((html.match(/data-card-key=/g) ?? []).length, 0);
  assert.doesNotMatch(html, /完成 \+ 彩带/);
});

test("groups keep separate color controls while a single item retains its direct actions", () => {
  const html = render([task(0), task(1), task(2, "sky"), task(3, "sky"), task(4, "sage")]);
  assert.match(html, /aria-label="展开莓果粉组，2项安排"/);
  assert.match(html, /aria-label="展开天空蓝组，2项安排"/);
  assert.match(html, /data-card-key="task:task-4"/);
  assert.match(html, /为「作业 4」开始橙子专注/);
  assert.match(html, /data-expand-color="berry"/);
  assert.match(html, /data-expand-color="sky"/);
});
