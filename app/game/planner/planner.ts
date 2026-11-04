export const PLANNER_STORAGE_KEY = "berry-planner";
export const PLANNER_TASK_REWARD = 3;
export const PLANNER_DAILY_REWARD_LIMIT = 5;
export const PLANNER_REMINDER_LEAD_MS = 10 * 60_000;
const DAY_MS = 86_400_000;

export type PlannerSlot = "morning" | "afternoon" | "evening";
export type PlannerPriority = "high" | "medium" | "low" | null;
export type WeekParity = "all" | "odd" | "even";
export type PlannerColor = "berry" | "orange" | "sage" | "sky" | "lilac" | "cream";

export type PlannerCourse = {
  id: string;
  title: string;
  weekday: number;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
  startWeek: number;
  endWeek: number;
  parity: WeekParity;
  color: PlannerColor;
  priority: PlannerPriority;
  createdAt: string;
};

export type CourseException = {
  courseId: string;
  date: string;
  skip?: boolean;
  moved?: { date: string; startTime: string; endTime: string };
};

export type PlannerTask = {
  id: string;
  title: string;
  date: string;
  slot: PlannerSlot;
  startTime: string | null;
  endTime: string | null;
  location: string;
  note: string;
  priority: PlannerPriority;
  color: PlannerColor;
  order: number;
  createdAt: string;
  completedAt: string | null;
  rewarded: boolean;
  pomodoros: number;
};

export type PlannerState = {
  version: 1;
  semesterStart: string | null;
  weekStartsOn: 0 | 1;
  remindersEnabled: boolean;
  courses: PlannerCourse[];
  courseExceptions: CourseException[];
  tasks: PlannerTask[];
  rewardLog: { date: string; count: number };
  focusTaskId: string | null;
};

export type PlannerItem = {
  kind: "course" | "task";
  key: string;
  id: string;
  title: string;
  date: string;
  slot: PlannerSlot;
  startTime: string | null;
  endTime: string | null;
  location: string;
  note: string;
  priority: PlannerPriority;
  color: PlannerColor;
  order: number;
  pomodoros: number;
  sourceDate: string;
};

export const INITIAL_PLANNER: PlannerState = {
  version: 1,
  semesterStart: null,
  weekStartsOn: 1,
  remindersEnabled: true,
  courses: [],
  courseExceptions: [],
  tasks: [],
  rewardLog: { date: "", count: 0 },
  focusTaskId: null,
};

export const SLOT_LABELS: Record<PlannerSlot, string> = { morning: "上午", afternoon: "下午", evening: "晚上" };
export const SLOT_DEFAULT_START: Record<PlannerSlot, string> = { morning: "08:00", afternoon: "14:00", evening: "19:00" };
export const PLANNER_SLOTS: PlannerSlot[] = ["morning", "afternoon", "evening"];
export const PLANNER_COLORS: PlannerColor[] = ["berry", "orange", "sage", "sky", "lilac", "cream"];
export const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const PRIORITY_LABELS: Record<Exclude<PlannerPriority, null>, string> = { high: "高", medium: "中", low: "低" };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isPlannerDate(value: unknown): value is string {
  return typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
}

export function isPlannerTime(value: unknown): value is string {
  return typeof value === "string" && timePattern.test(value);
}

export function toPlannerDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parsePlannerDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function addDays(value: string, days: number) {
  const date = parsePlannerDate(value);
  date.setDate(date.getDate() + days);
  return toPlannerDate(date);
}

export function weekdayOf(value: string) {
  return parsePlannerDate(value).getDay();
}

export function startOfWeek(value: string, weekStartsOn: 0 | 1) {
  return addDays(value, -((weekdayOf(value) - weekStartsOn + 7) % 7));
}

export function weekDates(anchor: string, weekStartsOn: 0 | 1) {
  const first = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

function dayNumber(value: string) {
  return Math.round(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) / DAY_MS);
}

/** Teaching weeks always start on Monday, matching Chinese timetables, whatever day the grid starts on. */
export function getTeachingWeek(value: string, semesterStart: string | null) {
  if (!semesterStart) return null;
  const week = Math.floor((dayNumber(startOfWeek(value, 1)) - dayNumber(startOfWeek(semesterStart, 1))) / 7) + 1;
  return week >= 1 ? week : null;
}

export function minutesOf(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function formatMinutes(total: number) {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function slotForTime(time: string): PlannerSlot {
  const minutes = minutesOf(time);
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "evening";
}

/** Moving into another slot keeps the duration and starts at that slot's usual hour. */
export function shiftTimesToSlot(startTime: string, endTime: string, slot: PlannerSlot) {
  if (slotForTime(startTime) === slot) return { startTime, endTime };
  const duration = Math.max(5, minutesOf(endTime) - minutesOf(startTime));
  const start = minutesOf(SLOT_DEFAULT_START[slot]);
  return { startTime: formatMinutes(start), endTime: formatMinutes(start + duration) };
}

export function courseRunsInWeek(course: Pick<PlannerCourse, "startWeek" | "endWeek" | "parity">, week: number | null) {
  if (week === null) return true;
  if (week < course.startWeek || week > course.endWeek) return false;
  if (course.parity === "odd") return week % 2 === 1;
  if (course.parity === "even") return week % 2 === 0;
  return true;
}

export function occurrenceKey(courseId: string, date: string) {
  return `${courseId}@${date}`;
}

export function itemEndsAt(item: Pick<PlannerItem, "date" | "endTime" | "startTime" | "slot">) {
  const end = item.endTime ?? item.startTime;
  if (end) return new Date(`${item.date}T${end}:00`).getTime();
  return new Date(`${item.date}T${item.slot === "morning" ? "12:00" : item.slot === "afternoon" ? "18:00" : "23:59"}:00`).getTime();
}

export function itemStartsAt(item: Pick<PlannerItem, "date" | "startTime">) {
  return item.startTime ? new Date(`${item.date}T${item.startTime}:00`).getTime() : null;
}

function courseItem(course: PlannerCourse, sourceDate: string, date: string, startTime: string, endTime: string): PlannerItem {
  return {
    kind: "course", key: occurrenceKey(course.id, sourceDate), id: course.id, title: course.title, date, slot: slotForTime(startTime),
    startTime, endTime, location: course.location, note: course.note, priority: course.priority, color: course.color, order: 0, pomodoros: 0, sourceDate,
  };
}

/** Every course occurrence that falls on one of the dates, including occurrences moved there from other weeks. */
export function courseOccurrences(state: Pick<PlannerState, "courses" | "courseExceptions" | "semesterStart">, dates: string[]) {
  const wanted = new Set(dates);
  const exceptions = new Map(state.courseExceptions.map((exception) => [occurrenceKey(exception.courseId, exception.date), exception]));
  const items: PlannerItem[] = [];
  for (const course of state.courses) {
    for (const date of dates) {
      const week = getTeachingWeek(date, state.semesterStart);
      if (weekdayOf(date) !== course.weekday || (state.semesterStart && week === null) || !courseRunsInWeek(course, week)) continue;
      const exception = exceptions.get(occurrenceKey(course.id, date));
      if (exception?.skip || exception?.moved) continue;
      items.push(courseItem(course, date, date, course.startTime, course.endTime));
    }
  }
  for (const exception of state.courseExceptions) {
    if (!exception.moved || exception.skip || !wanted.has(exception.moved.date)) continue;
    const course = state.courses.find((item) => item.id === exception.courseId);
    if (course) items.push(courseItem(course, exception.date, exception.moved.date, exception.moved.startTime, exception.moved.endTime));
  }
  return items;
}

export function taskItem(task: PlannerTask): PlannerItem {
  return {
    kind: "task", key: `task:${task.id}`, id: task.id, title: task.title, date: task.date, slot: task.slot, startTime: task.startTime, endTime: task.endTime,
    location: task.location, note: task.note, priority: task.priority, color: task.color, order: task.order, pomodoros: task.pomodoros, sourceDate: task.date,
  };
}

export function sortPlannerItems(items: PlannerItem[]) {
  return [...items].sort((left, right) => {
    const leftTime = left.startTime ? minutesOf(left.startTime) : 10_000 + left.order;
    const rightTime = right.startTime ? minutesOf(right.startTime) : 10_000 + right.order;
    return leftTime - rightTime || left.title.localeCompare(right.title, "zh-CN");
  });
}

/** Courses disappear once their class has ended; tasks stay until they are shredded or filed as done. */
export function visiblePlannerItems(state: PlannerState, dates: string[], now: number) {
  const wanted = new Set(dates);
  const courses = courseOccurrences(state, dates).filter((item) => itemEndsAt(item) > now);
  const tasks = state.tasks.filter((task) => !task.completedAt && wanted.has(task.date)).map(taskItem);
  return sortPlannerItems([...courses, ...tasks]);
}

export function nextOrder(state: PlannerState, date: string, slot: PlannerSlot) {
  return state.tasks.filter((task) => task.date === date && task.slot === slot).reduce((maximum, task) => Math.max(maximum, task.order), -1) + 1;
}

export function moveTask(state: PlannerState, taskId: string, date: string, slot: PlannerSlot, beforeTaskId: string | null = null): PlannerState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return state;
  const times = task.startTime && task.endTime ? shiftTimesToSlot(task.startTime, task.endTime, slot) : task.startTime ? { startTime: shiftTimesToSlot(task.startTime, task.startTime, slot).startTime, endTime: null } : { startTime: null, endTime: null };
  const siblings = state.tasks.filter((item) => item.id !== taskId && item.date === date && item.slot === slot && !item.completedAt).sort((left, right) => left.order - right.order);
  const insertAt = beforeTaskId ? Math.max(0, siblings.findIndex((item) => item.id === beforeTaskId)) : siblings.length;
  const ordered = [...siblings.slice(0, insertAt), { ...task, date, slot, ...times }, ...siblings.slice(insertAt)];
  const orders = new Map(ordered.map((item, index) => [item.id, index]));
  return { ...state, tasks: state.tasks.map((item) => item.id === taskId ? { ...item, date, slot, ...times, order: orders.get(item.id)! } : orders.has(item.id) ? { ...item, order: orders.get(item.id)! } : item) };
}

function withException(state: PlannerState, exception: CourseException): PlannerState {
  const rest = state.courseExceptions.filter((item) => item.courseId !== exception.courseId || item.date !== exception.date);
  return { ...state, courseExceptions: [...rest, exception] };
}

export function moveCourseOnce(state: PlannerState, courseId: string, sourceDate: string, date: string, slot: PlannerSlot): PlannerState {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return state;
  const current = state.courseExceptions.find((item) => item.courseId === courseId && item.date === sourceDate)?.moved;
  const times = slotForTime(course.startTime) === slot
    ? { startTime: course.startTime, endTime: course.endTime }
    : shiftTimesToSlot(current?.startTime ?? course.startTime, current?.endTime ?? course.endTime, slot);
  if (date === sourceDate && times.startTime === course.startTime && times.endTime === course.endTime) {
    return { ...state, courseExceptions: state.courseExceptions.filter((item) => item.courseId !== courseId || item.date !== sourceDate) };
  }
  return withException(state, { courseId, date: sourceDate, moved: { date, ...times } });
}

export function moveCourseEveryWeek(state: PlannerState, courseId: string, date: string, slot: PlannerSlot): PlannerState {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return state;
  const times = shiftTimesToSlot(course.startTime, course.endTime, slot);
  return {
    ...state,
    courses: state.courses.map((item) => item.id === courseId ? { ...item, weekday: weekdayOf(date), ...times } : item),
    courseExceptions: state.courseExceptions.filter((item) => item.courseId !== courseId),
  };
}

export function skipCourseOnce(state: PlannerState, courseId: string, sourceDate: string): PlannerState {
  return withException(state, { courseId, date: sourceDate, skip: true });
}

export function removeCourse(state: PlannerState, courseId: string): PlannerState {
  return { ...state, courses: state.courses.filter((item) => item.id !== courseId), courseExceptions: state.courseExceptions.filter((item) => item.courseId !== courseId) };
}

export function removeTask(state: PlannerState, taskId: string): PlannerState {
  return { ...state, tasks: state.tasks.filter((item) => item.id !== taskId), focusTaskId: state.focusTaskId === taskId ? null : state.focusTaskId };
}

/** Completes a task and reports how many berries it earns, at most once per task and five tasks a day. */
export function completeTask(state: PlannerState, taskId: string, completedAt: Date) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.completedAt) return { state, reward: 0 };
  const today = toPlannerDate(completedAt);
  const log = state.rewardLog.date === today ? state.rewardLog : { date: today, count: 0 };
  const reward = !task.rewarded && log.count < PLANNER_DAILY_REWARD_LIMIT ? PLANNER_TASK_REWARD : 0;
  return {
    reward,
    state: {
      ...state,
      tasks: state.tasks.map((item) => item.id === taskId ? { ...item, completedAt: completedAt.toISOString(), rewarded: item.rewarded || reward > 0 } : item),
      rewardLog: reward ? { date: today, count: log.count + 1 } : log,
      focusTaskId: state.focusTaskId === taskId ? null : state.focusTaskId,
    },
  };
}

export function restoreTask(state: PlannerState, taskId: string): PlannerState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return state;
  return { ...state, tasks: state.tasks.map((item) => item.id === taskId ? { ...item, completedAt: null, order: nextOrder(state, item.date, item.slot) } : item) };
}

export type CompletedDay = { date: string; tasks: PlannerTask[]; berries: number; pomodoros: number };

/** The done folder files every finished task under the day it was completed, in date order. */
export function groupCompletedByDay(tasks: PlannerTask[], newestFirst = true): CompletedDay[] {
  const days = new Map<string, PlannerTask[]>();
  for (const task of tasks) {
    if (!task.completedAt) continue;
    const completed = new Date(task.completedAt);
    if (Number.isNaN(completed.getTime())) continue;
    const date = toPlannerDate(completed);
    days.set(date, [...(days.get(date) ?? []), task]);
  }
  const direction = newestFirst ? -1 : 1;
  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right) * direction)
    .map(([date, entries]) => {
      const sorted = [...entries].sort((left, right) => left.completedAt!.localeCompare(right.completedAt!) * direction);
      return { date, tasks: sorted, berries: sorted.filter((task) => task.rewarded).length * PLANNER_TASK_REWARD, pomodoros: sorted.reduce((sum, task) => sum + task.pomodoros, 0) };
    });
}

export function upcomingReminders(state: PlannerState, now: number, horizonMs = DAY_MS) {
  if (!state.remindersEnabled) return [];
  const dates = Array.from({ length: Math.ceil(horizonMs / DAY_MS) + 1 }, (_, index) => addDays(toPlannerDate(new Date(now)), index));
  return visiblePlannerItems(state, dates, now)
    .map((item) => ({ item, startsAt: itemStartsAt(item) }))
    .filter((entry): entry is { item: PlannerItem; startsAt: number } => entry.startsAt !== null && entry.startsAt - PLANNER_REMINDER_LEAD_MS > now && entry.startsAt - PLANNER_REMINDER_LEAD_MS <= now + horizonMs)
    .map(({ item, startsAt }) => ({
      key: item.key,
      at: startsAt - PLANNER_REMINDER_LEAD_MS,
      title: item.kind === "course" ? `10 分钟后上课：${item.title}` : `10 分钟后开始：${item.title}`,
      body: [`${item.startTime}${item.endTime ? `–${item.endTime}` : ""}`, item.location].filter(Boolean).join(" · "),
    }));
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function priority(value: unknown): PlannerPriority {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function color(value: unknown, fallback: PlannerColor): PlannerColor {
  return PLANNER_COLORS.includes(value as PlannerColor) ? value as PlannerColor : fallback;
}

function weekNumber(value: unknown, fallback: number) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(30, Math.max(1, number)) : fallback;
}

export function normalizePlanner(raw: unknown): PlannerState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return INITIAL_PLANNER;
  const value = raw as Partial<Record<keyof PlannerState, unknown>>;
  const courses = (Array.isArray(value.courses) ? value.courses : []).flatMap((entry): PlannerCourse[] => {
    const course = entry as Partial<PlannerCourse>;
    if (typeof course?.id !== "string" || !text(course.title, 40) || !isPlannerTime(course.startTime) || !isPlannerTime(course.endTime)) return [];
    const weekday = Math.round(Number(course.weekday));
    if (!(weekday >= 0 && weekday <= 6)) return [];
    const startWeek = weekNumber(course.startWeek, 1);
    return [{
      id: course.id, title: text(course.title, 40), weekday, startTime: course.startTime, endTime: minutesOf(course.endTime) > minutesOf(course.startTime) ? course.endTime : formatMinutes(minutesOf(course.startTime) + 45),
      location: text(course.location, 40), note: text(course.note, 200), startWeek, endWeek: Math.max(startWeek, weekNumber(course.endWeek, 20)),
      parity: course.parity === "odd" || course.parity === "even" ? course.parity : "all", color: color(course.color, "sky"), priority: priority(course.priority),
      createdAt: typeof course.createdAt === "string" ? course.createdAt : new Date(0).toISOString(),
    }];
  });
  const courseIds = new Set(courses.map((course) => course.id));
  const courseExceptions = (Array.isArray(value.courseExceptions) ? value.courseExceptions : []).flatMap((entry): CourseException[] => {
    const exception = entry as Partial<CourseException>;
    if (typeof exception?.courseId !== "string" || !courseIds.has(exception.courseId) || !isPlannerDate(exception.date)) return [];
    if (exception.skip) return [{ courseId: exception.courseId, date: exception.date, skip: true }];
    const moved = exception.moved;
    if (!moved || !isPlannerDate(moved.date) || !isPlannerTime(moved.startTime) || !isPlannerTime(moved.endTime)) return [];
    return [{ courseId: exception.courseId, date: exception.date, moved: { date: moved.date, startTime: moved.startTime, endTime: moved.endTime } }];
  });
  const tasks = (Array.isArray(value.tasks) ? value.tasks : []).flatMap((entry): PlannerTask[] => {
    const task = entry as Partial<PlannerTask>;
    if (typeof task?.id !== "string" || !text(task.title, 60) || !isPlannerDate(task.date)) return [];
    const startTime = isPlannerTime(task.startTime) ? task.startTime : null;
    const endTime = startTime && isPlannerTime(task.endTime) && minutesOf(task.endTime) > minutesOf(startTime) ? task.endTime : null;
    return [{
      id: task.id, title: text(task.title, 60), date: task.date, slot: PLANNER_SLOTS.includes(task.slot as PlannerSlot) ? task.slot as PlannerSlot : startTime ? slotForTime(startTime) : "morning",
      startTime, endTime, location: text(task.location, 40), note: text(task.note, 200), priority: priority(task.priority), color: color(task.color, "berry"),
      order: Number.isFinite(task.order) ? Number(task.order) : 0, createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date(0).toISOString(),
      completedAt: typeof task.completedAt === "string" ? task.completedAt : null, rewarded: task.rewarded === true, pomodoros: Math.max(0, Math.round(Number(task.pomodoros) || 0)),
    }];
  });
  const rewardLog = value.rewardLog as PlannerState["rewardLog"] | undefined;
  return {
    version: 1,
    semesterStart: isPlannerDate(value.semesterStart) ? value.semesterStart : null,
    weekStartsOn: value.weekStartsOn === 0 ? 0 : 1,
    remindersEnabled: value.remindersEnabled !== false,
    courses,
    courseExceptions,
    tasks,
    rewardLog: rewardLog && isPlannerDate(rewardLog.date) && Number.isFinite(rewardLog.count) ? { date: rewardLog.date, count: Math.max(0, Math.round(rewardLog.count)) } : { date: "", count: 0 },
    focusTaskId: typeof value.focusTaskId === "string" && tasks.some((task) => task.id === value.focusTaskId && !task.completedAt) ? value.focusTaskId : null,
  };
}
