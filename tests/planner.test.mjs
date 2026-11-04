import assert from "node:assert/strict";
import test from "node:test";
import {
  completeTask, courseOccurrences, getTeachingWeek, groupCompletedByDay, INITIAL_PLANNER, moveCourseEveryWeek, moveCourseOnce, moveTask, normalizePlanner, PLANNER_DAILY_REWARD_LIMIT,
  PLANNER_TASK_REWARD, removeCourse, restoreTask, shiftTimesToSlot, skipCourseOnce, slotForTime, upcomingReminders, visiblePlannerItems, weekDates,
} from "../app/game/planner/planner.ts";

const english = { id: "english", title: "大学英语（一）", weekday: 1, startTime: "14:10", endTime: "15:45", location: "教 3-201", note: "", startWeek: 1, endWeek: 16, parity: "all", color: "sky", priority: "high", createdAt: "2026-09-01T00:00:00.000Z" };
const grammar = { ...english, id: "grammar", title: "英语语法", weekday: 4, startTime: "08:30", endTime: "10:05", parity: "even" };
const semester = { ...INITIAL_PLANNER, semesterStart: "2026-08-31", courses: [english, grammar] };

function task(id, date, slot, extra = {}) {
  return { id, title: id, date, slot, startTime: null, endTime: null, location: "", note: "", priority: null, color: "berry", order: 0, createdAt: "2026-11-01T00:00:00.000Z", completedAt: null, rewarded: false, pomodoros: 0, ...extra };
}

test("teaching weeks count Monday-based weeks from the semester start", () => {
  assert.equal(getTeachingWeek("2026-08-31", "2026-08-31"), 1);
  assert.equal(getTeachingWeek("2026-09-06", "2026-08-31"), 1);
  assert.equal(getTeachingWeek("2026-11-04", "2026-08-31"), 10);
  assert.equal(getTeachingWeek("2026-11-04", "2026-09-02"), 10);
  assert.equal(getTeachingWeek("2026-08-20", "2026-08-31"), null);
  assert.equal(getTeachingWeek("2026-11-04", null), null);
  assert.deepEqual(weekDates("2026-11-04", 1), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  assert.equal(weekDates("2026-11-04", 0)[0], "2026-11-01");
});

test("times map to morning, afternoon and evening slots", () => {
  assert.equal(slotForTime("08:30"), "morning");
  assert.equal(slotForTime("11:59"), "morning");
  assert.equal(slotForTime("12:00"), "afternoon");
  assert.equal(slotForTime("17:59"), "afternoon");
  assert.equal(slotForTime("18:00"), "evening");
  assert.deepEqual(shiftTimesToSlot("08:30", "10:05", "evening"), { startTime: "19:00", endTime: "20:35" });
  assert.deepEqual(shiftTimesToSlot("08:30", "10:05", "morning"), { startTime: "08:30", endTime: "10:05" });
});

test("courses respect week ranges and odd or even weeks", () => {
  const week10 = weekDates("2026-11-04", 1);
  const week11 = weekDates("2026-11-11", 1);
  assert.deepEqual(courseOccurrences(semester, week10).map((item) => `${item.id}@${item.date}`).sort(), ["english@2026-11-02", "grammar@2026-11-05"]);
  assert.deepEqual(courseOccurrences(semester, week11).map((item) => item.id), ["english"]);
  const afterTerm = weekDates("2026-12-21", 1);
  assert.deepEqual(courseOccurrences(semester, afterTerm), []);
  const noSemester = { ...semester, semesterStart: null };
  assert.equal(courseOccurrences(noSemester, week11).length, 2);
});

test("courses disappear after class ends while tasks stay until filed", () => {
  const dates = weekDates("2026-11-04", 1);
  const planner = { ...semester, tasks: [task("申报书", "2026-11-02", "morning")] };
  const beforeClass = visiblePlannerItems(planner, dates, new Date("2026-11-02T14:00:00").getTime());
  assert.ok(beforeClass.some((item) => item.key === "english@2026-11-02"));
  const afterClass = visiblePlannerItems(planner, dates, new Date("2026-11-02T15:46:00").getTime());
  assert.ok(!afterClass.some((item) => item.key === "english@2026-11-02"));
  assert.ok(afterClass.some((item) => item.key === "task:申报书"));
});

test("moving a course once only changes that week, every week changes the rule", () => {
  const once = moveCourseOnce(semester, "english", "2026-11-02", "2026-11-03", "evening");
  const week10 = courseOccurrences(once, weekDates("2026-11-04", 1)).find((item) => item.id === "english");
  assert.deepEqual([week10.date, week10.startTime, week10.endTime, week10.slot], ["2026-11-03", "19:00", "20:35", "evening"]);
  assert.equal(courseOccurrences(once, weekDates("2026-11-11", 1)).find((item) => item.id === "english").date, "2026-11-09");
  const back = moveCourseOnce(once, "english", "2026-11-02", "2026-11-02", "afternoon");
  assert.equal(back.courseExceptions.length, 0);

  const always = moveCourseEveryWeek(once, "english", "2026-11-06", "afternoon");
  assert.equal(always.courses.find((course) => course.id === "english").weekday, 5);
  assert.equal(always.courseExceptions.length, 0);
  assert.equal(courseOccurrences(always, weekDates("2026-11-11", 1)).find((item) => item.id === "english").date, "2026-11-13");
});

test("skipping and deleting courses", () => {
  const skipped = skipCourseOnce(semester, "english", "2026-11-02");
  assert.ok(!courseOccurrences(skipped, weekDates("2026-11-04", 1)).some((item) => item.id === "english"));
  assert.ok(courseOccurrences(skipped, weekDates("2026-11-11", 1)).some((item) => item.id === "english"));
  const removed = removeCourse(skipped, "english");
  assert.deepEqual(removed.courses.map((course) => course.id), ["grammar"]);
  assert.equal(removed.courseExceptions.length, 0);
});

test("dragging tasks reorders within a slot and moves times with the slot", () => {
  const planner = { ...INITIAL_PLANNER, tasks: [task("a", "2026-11-03", "morning", { order: 0 }), task("b", "2026-11-03", "morning", { order: 1 }), task("c", "2026-11-03", "morning", { order: 2, startTime: "09:00", endTime: "10:00" })] };
  const reordered = moveTask(planner, "b", "2026-11-03", "morning", "a");
  assert.deepEqual(reordered.tasks.filter((item) => !item.startTime).sort((left, right) => left.order - right.order).map((item) => item.id), ["b", "a"]);
  const moved = moveTask(planner, "c", "2026-11-05", "afternoon");
  const c = moved.tasks.find((item) => item.id === "c");
  assert.deepEqual([c.date, c.slot, c.startTime, c.endTime], ["2026-11-05", "afternoon", "14:00", "15:00"]);
});

test("completing tasks pays once per task and caps daily rewards", () => {
  const tasks = Array.from({ length: PLANNER_DAILY_REWARD_LIMIT + 1 }, (_, index) => task(`t${index}`, "2026-11-04", "morning"));
  let planner = { ...INITIAL_PLANNER, tasks };
  const rewards = [];
  for (const item of tasks) {
    const result = completeTask(planner, item.id, new Date("2026-11-04T10:00:00"));
    planner = result.state;
    rewards.push(result.reward);
  }
  assert.deepEqual(rewards, [...Array(PLANNER_DAILY_REWARD_LIMIT).fill(PLANNER_TASK_REWARD), 0]);
  planner = restoreTask(planner, "t0");
  assert.equal(planner.tasks.find((item) => item.id === "t0").completedAt, null);
  assert.equal(completeTask(planner, "t0", new Date("2026-11-05T10:00:00")).reward, 0);
  const nextDay = completeTask(restoreTask(planner, "t5"), "t5", new Date("2026-11-05T10:00:00"));
  assert.equal(nextDay.reward, PLANNER_TASK_REWARD);
});

test("reminders fire ten minutes before timed items within a day", () => {
  const now = new Date("2026-11-02T13:00:00").getTime();
  const reminders = upcomingReminders({ ...semester, tasks: [task("交周报", "2026-11-02", "afternoon", { startTime: "16:00" }), task("无时间", "2026-11-02", "afternoon")] }, now);
  assert.deepEqual(reminders.map((item) => [item.key, new Date(item.at).toTimeString().slice(0, 5)]), [["english@2026-11-02", "14:00"], ["task:交周报", "15:50"]]);
  assert.match(reminders[0].title, /10 分钟后上课：大学英语/);
  assert.deepEqual(upcomingReminders({ ...semester, remindersEnabled: false }, now), []);
});

test("saved planners are normalized defensively", () => {
  assert.deepEqual(normalizePlanner(null), INITIAL_PLANNER);
  const normalized = normalizePlanner({
    semesterStart: "bad", weekStartsOn: 0,
    courses: [english, { ...english, id: "broken", startTime: "25:00" }, { ...english, id: "short", endTime: "14:00", startWeek: 9, endWeek: 3 }],
    courseExceptions: [{ courseId: "missing", date: "2026-11-02", skip: true }, { courseId: "english", date: "2026-11-02", skip: true }],
    tasks: [task("ok", "2026-11-02", "noon"), { id: "untitled", title: " ", date: "2026-11-02" }],
    focusTaskId: "gone",
  });
  assert.equal(normalized.semesterStart, null);
  assert.equal(normalized.weekStartsOn, 0);
  assert.deepEqual(normalized.courses.map((course) => course.id), ["english", "short"]);
  assert.equal(normalized.courses[1].endTime, "14:55");
  assert.equal(normalized.courses[1].endWeek, 9);
  assert.equal(normalized.courseExceptions.length, 1);
  assert.deepEqual(normalized.tasks.map((item) => [item.id, item.slot]), [["ok", "morning"]]);
  assert.equal(normalized.focusTaskId, null);
});

test("the done folder files tasks by the local day they were completed", () => {
  const done = (id, at, extra = {}) => task(id, "2026-11-02", "morning", { completedAt: new Date(at).toISOString(), ...extra });
  const tasks = [
    done("早", "2026-11-03T09:00:00", { rewarded: true, pomodoros: 2 }),
    done("晚", "2026-11-03T21:30:00", { rewarded: true }),
    done("昨天", "2026-11-02T23:59:00"),
    task("未完成", "2026-11-03", "evening"),
    done("坏日期", "2026-11-04T08:00:00", { completedAt: "not a date" }),
  ];
  const newest = groupCompletedByDay(tasks);
  assert.deepEqual(newest.map((day) => [day.date, day.tasks.map((item) => item.id)]), [["2026-11-03", ["晚", "早"]], ["2026-11-02", ["昨天"]]]);
  assert.equal(newest[0].berries, 6);
  assert.equal(newest[0].pomodoros, 2);
  assert.deepEqual(groupCompletedByDay(tasks, false).map((day) => [day.date, day.tasks.map((item) => item.id)]), [["2026-11-02", ["昨天"]], ["2026-11-03", ["早", "晚"]]]);
});
