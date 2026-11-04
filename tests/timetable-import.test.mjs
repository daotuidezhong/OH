import assert from "node:assert/strict";
import test from "node:test";
import { courseOccurrences, INITIAL_PLANNER, weekDates } from "../app/game/planner/planner.ts";
import { isDuplicateCourse, parseTimetableResult, rowsToCourses, TIMETABLE_PROMPT, toImportRows, toPlannerWeekday, validateImportRow } from "../app/game/planner/timetable-import.ts";

const answer = {
  courses: [
    { title: "大学英语（一）", weekday: 1, startTime: "14:10", endTime: "15:45", location: "教3-201", weeks: [{ start: 1, end: 8, parity: "all" }, { start: 10, end: 16, parity: "all" }], confident: true, issue: "" },
    { title: "英语语法｜英语3、4班", weekday: 4, startTime: "8:30", endTime: "10:05", location: "", weeks: [{ start: 1, end: 16, parity: "even" }], confident: false, issue: "地点看不清" },
    { title: "体育", weekday: 7, startTime: "19：00", endTime: "18:00", location: "操场", weeks: [], confident: true, issue: "" },
    { title: "", weekday: 2, startTime: "08:00", endTime: "09:00", weeks: [] },
    { title: "无效星期", weekday: 9, startTime: "08:00", endTime: "09:00", weeks: [] },
  ],
  warnings: ["右侧被裁切", ""],
};

test("the prompt asks for JSON with the exact fields the parser reads", () => {
  assert.match(TIMETABLE_PROMPT, /JSON/);
  for (const field of ["courses", "weekday", "startTime", "endTime", "location", "weeks", "parity", "confident", "issue", "warnings"]) assert.match(TIMETABLE_PROMPT, new RegExp(`"${field}"`));
});

test("model answers are validated, normalized and flagged", () => {
  const result = parseTimetableResult(answer);
  assert.deepEqual(result.warnings, ["右侧被裁切"]);
  assert.deepEqual(result.courses.map((course) => course.title), ["大学英语（一）", "英语语法｜英语3、4班", "体育"]);
  assert.equal(result.courses[1].startTime, "08:30");
  assert.equal(result.courses[1].confident, false);
  const sport = result.courses[2];
  assert.equal(sport.startTime, "19:00");
  assert.equal(sport.endTime, "20:35");
  assert.deepEqual(sport.weeks, [{ start: 1, end: 16, parity: "all" }]);
  assert.equal(sport.confident, false);
  assert.match(sport.issue, /下课时间需要核对[\s\S]*没有识别到周次/);
  assert.deepEqual(parseTimetableResult(null), { courses: [], warnings: [] });
});

test("rows split week ranges, map weekdays and skip duplicates by default", () => {
  assert.equal(toPlannerWeekday(1), 1);
  assert.equal(toPlannerWeekday(7), 0);
  const existing = [{ id: "old", title: "体育", weekday: 0, startTime: "19:00", endTime: "20:35", location: "", note: "", startWeek: 1, endWeek: 16, parity: "all", color: "sage", priority: null, createdAt: "" }];
  const rows = toImportRows(parseTimetableResult(answer), existing, "t");
  assert.deepEqual(rows.map((row) => [row.title, row.weekday, row.startWeek, row.endWeek, row.include]), [
    ["大学英语（一）", 1, 1, 8, true], ["大学英语（一）", 1, 10, 16, true], ["英语语法｜英语3、4班", 4, 1, 16, true], ["体育", 0, 1, 16, false],
  ]);
  assert.equal(rows[2].issue, "地点看不清");
  assert.ok(rows[3].duplicate);
  assert.ok(isDuplicateCourse(rows[3], existing));
  assert.equal(validateImportRow({ ...rows[0], endTime: "13:00" }), "下课要晚于上课");
  assert.equal(validateImportRow({ ...rows[0], title: " " }), "缺少课程名");
});

test("imported rows become planner courses that follow their week rules", () => {
  const rows = toImportRows(parseTimetableResult(answer), [], "t");
  rows[2] = { ...rows[2], location: "教1-105" };
  let id = 0;
  const courses = rowsToCourses(rows, [], () => `c${++id}`, "2026-11-04T00:00:00.000Z");
  assert.equal(courses.length, 4);
  assert.equal(courses[0].color, courses[1].color);
  assert.notEqual(courses[0].color, courses[2].color);
  assert.equal(courses[2].location, "教1-105");
  const planner = { ...INITIAL_PLANNER, semesterStart: "2026-08-31", courses };
  assert.deepEqual(courseOccurrences(planner, weekDates("2026-10-28", 1)).map((item) => item.title).sort(), ["体育"]);
  assert.deepEqual(courseOccurrences(planner, weekDates("2026-11-04", 1)).map((item) => item.title).sort(), ["体育", "大学英语（一）", "英语语法｜英语3、4班"]);
  assert.equal(rowsToCourses(rows, courses, () => "again", "").length, 0);
});
