import { formatMinutes, isPlannerTime, minutesOf, type PlannerColor, type PlannerCourse, type WeekParity } from "./planner.ts";

export const TIMETABLE_PROMPT = `你会收到一张大学课表的截图。把截图里的每一门课整理成 JSON，用户会在确认表里逐项核对后再导入。

只输出一个 JSON 对象，格式如下（字段名必须一致）：
{
  "courses": [
    {
      "title": "大学英语（一）",
      "weekday": 1,
      "startTime": "14:10",
      "endTime": "15:45",
      "location": "教3-201",
      "weeks": [{ "start": 1, "end": 8, "parity": "all" }, { "start": 10, "end": 16, "parity": "all" }],
      "confident": true,
      "issue": ""
    }
  ],
  "warnings": []
}

字段说明：
- weekday：1 = 周一 … 7 = 周日。
- startTime / endTime：24 小时制 HH:MM。
- weeks：上课周次，每段写开始周、结束周和 parity（"all" 每周、"odd" 单周、"even" 双周）。
- confident：这一门的信息都能在截图里清楚看到时为 true，否则为 false。
- issue：不确定时写明哪一项需要用户核对，否则为空字符串。
- warnings：整张截图层面的提醒，例如看不到时间、图片被裁切；没有就是空数组。

规则：
- 只整理截图里真实存在的课程，不要补充或猜测截图之外的课。
- 同一门课在一周里上多次（比如周一和周三都有），每次单独一项。
- 课表只写了“第几节”时，用截图里给出的节次时间换算；截图里没有节次时间，就按常见作息估计，并把 confident 设为 false、在 issue 里说明“时间是估计的”。
- “1-16周”写成一段；“1-8,10-16周”拆成两段；“单周”“(单)”记为 odd，“双周”“(双)”记为 even；没写周次时用 1-16 周并在 issue 里说明。
- location 写教室；没有教室但有班级或老师时写班级或老师；都没有就写空字符串。
- 认不清的字保留最可能的写法，并在 issue 里指出。
- 截图看不出是课表、或者被裁切导致信息缺失时，在 warnings 里说明；没有找到任何课程时 courses 为空数组。`;

export type TimetableCourse = {
  title: string;
  weekday: number;
  startTime: string;
  endTime: string;
  location: string;
  weeks: { start: number; end: number; parity: WeekParity }[];
  confident: boolean;
  issue: string;
};

export type TimetableResult = { courses: TimetableCourse[]; warnings: string[] };

export type ImportRow = {
  id: string;
  include: boolean;
  title: string;
  weekday: number;
  startTime: string;
  endTime: string;
  location: string;
  startWeek: number;
  endWeek: number;
  parity: WeekParity;
  issue: string;
  duplicate: boolean;
};

const COURSE_COLORS: PlannerColor[] = ["sky", "sage", "lilac", "orange", "cream", "berry"];

function clampWeek(value: unknown, fallback: number) {
  const week = Math.round(Number(value));
  return Number.isFinite(week) ? Math.min(30, Math.max(1, week)) : fallback;
}

function normalizeTime(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})[:：](\d{2})$/);
  if (!match) return null;
  const time = `${match[1].padStart(2, "0")}:${match[2]}`;
  return isPlannerTime(time) ? time : null;
}

/** Validates the model's answer defensively; anything unusable is dropped or flagged for the user. */
export function parseTimetableResult(raw: unknown): TimetableResult {
  const value = raw && typeof raw === "object" ? raw as Partial<Record<keyof TimetableResult, unknown>> : {};
  const warnings = Array.isArray(value.warnings) ? value.warnings.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
  const courses = (Array.isArray(value.courses) ? value.courses : []).flatMap((entry): TimetableCourse[] => {
    const course = entry as Partial<Record<keyof TimetableCourse, unknown>>;
    const title = typeof course?.title === "string" ? course.title.trim().slice(0, 40) : "";
    const weekday = Math.round(Number(course?.weekday));
    if (!title || !(weekday >= 1 && weekday <= 7)) return [];
    const issues = typeof course.issue === "string" && course.issue.trim() ? [course.issue.trim()] : [];
    let startTime = normalizeTime(course.startTime);
    let endTime = normalizeTime(course.endTime);
    if (!startTime) { startTime = "08:00"; issues.push("没有识别到上课时间"); }
    if (!endTime || minutesOf(endTime) <= minutesOf(startTime)) { endTime = formatMinutes(minutesOf(startTime) + 95); issues.push("下课时间需要核对"); }
    const weeks = (Array.isArray(course.weeks) ? course.weeks : []).flatMap((range) => {
      const item = range as { start?: unknown; end?: unknown; parity?: unknown };
      const start = clampWeek(item?.start, 1);
      const end = Math.max(start, clampWeek(item?.end, 16));
      return [{ start, end, parity: item?.parity === "odd" || item?.parity === "even" ? item.parity : "all" as WeekParity }];
    });
    if (!weeks.length) { weeks.push({ start: 1, end: 16, parity: "all" }); issues.push("没有识别到周次"); }
    return [{
      title, weekday, startTime, endTime, weeks,
      location: typeof course.location === "string" ? course.location.trim().slice(0, 40) : "",
      confident: course.confident === true && issues.length === 0,
      issue: issues.join("；"),
    }];
  });
  return { courses, warnings };
}

/** Planner weekdays follow Date#getDay (0 = Sunday); the model answers 1 = Monday … 7 = Sunday. */
export function toPlannerWeekday(weekday: number) {
  return weekday % 7;
}

function weeksOverlap(left: Pick<ImportRow, "startWeek" | "endWeek" | "parity">, right: Pick<ImportRow, "startWeek" | "endWeek" | "parity">) {
  if (Math.max(left.startWeek, right.startWeek) > Math.min(left.endWeek, right.endWeek)) return false;
  return left.parity === "all" || right.parity === "all" || left.parity === right.parity;
}

/** Same class at the same slot only counts as a duplicate when their teaching weeks actually collide. */
export function isDuplicateCourse(row: Pick<ImportRow, "title" | "weekday" | "startTime" | "startWeek" | "endWeek" | "parity">, courses: PlannerCourse[]) {
  return courses.some((course) => course.title === row.title.trim() && course.weekday === row.weekday && course.startTime === row.startTime && weeksOverlap(course, row));
}

/** One editable row per week range, so “1-8,10-16周” becomes two rows the user can check separately. */
export function toImportRows(result: TimetableResult, existing: PlannerCourse[], idPrefix = "row"): ImportRow[] {
  let index = 0;
  return result.courses.flatMap((course) => course.weeks.map((range) => {
    const row = {
      id: `${idPrefix}-${index++}`, title: course.title, weekday: toPlannerWeekday(course.weekday), startTime: course.startTime, endTime: course.endTime,
      location: course.location, startWeek: range.start, endWeek: range.end, parity: range.parity, issue: course.confident ? "" : course.issue || "请核对这一门",
    };
    const duplicate = isDuplicateCourse(row, existing);
    return { ...row, duplicate, include: !duplicate };
  }));
}

export function validateImportRow(row: ImportRow) {
  if (!row.title.trim()) return "缺少课程名";
  if (!isPlannerTime(row.startTime) || !isPlannerTime(row.endTime)) return "时间格式不对";
  if (minutesOf(row.endTime) <= minutesOf(row.startTime)) return "下课要晚于上课";
  if (row.endWeek < row.startWeek) return "结束周早于开始周";
  return "";
}

/** Turns the checked rows into planner courses, giving the same course title the same colour. */
export function rowsToCourses(rows: ImportRow[], existing: PlannerCourse[], createId: () => string, createdAt: string): PlannerCourse[] {
  const colors = new Map(existing.map((course) => [course.title, course.color]));
  const created: PlannerCourse[] = [];
  for (const row of rows) {
    if (!row.include || validateImportRow(row) || isDuplicateCourse(row, [...existing, ...created])) continue;
    const title = row.title.trim();
    if (!colors.has(title)) colors.set(title, COURSE_COLORS[colors.size % COURSE_COLORS.length]);
    created.push({
      id: createId(), title, weekday: row.weekday, startTime: row.startTime, endTime: row.endTime, location: row.location.trim(), note: "",
      startWeek: row.startWeek, endWeek: row.endWeek, parity: row.parity, color: colors.get(title)!, priority: null, createdAt,
    });
  }
  return created;
}
