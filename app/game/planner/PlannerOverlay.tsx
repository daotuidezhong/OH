import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import "./planner.css";
import PlannerEditor, { type PlannerDraft } from "./PlannerEditor";
import TimetableImport from "./TimetableImport";
import DoneArchive from "./DoneArchive";
import { ConfettiBurst, DoneFolder, Shredder, SHRED_FEED_MS, ShredderFeed, SlicedCard, type ShredFeedGeometry } from "./PlannerEffects";
import {
  addDays, getTeachingWeek, itemEndsAt, moveCourseEveryWeek, moveCourseOnce, moveTask, nextOrder, PLANNER_DAILY_REWARD_LIMIT, PLANNER_SLOTS, PLANNER_TASK_REWARD,
  PRIORITY_LABELS, removeCourse, removeTask, restoreTask, skipCourseOnce, SLOT_DEFAULT_START, SLOT_LABELS, slotForTime, startOfWeek, visiblePlannerItems,
  weekDates, WEEKDAY_LABELS, type CourseException, type PlannerColor, type PlannerCourse, type PlannerItem, type PlannerSlot, type PlannerState, type PlannerTask,
} from "./planner";

type Props = {
  open: boolean;
  origin: DOMRect | null;
  planner: PlannerState;
  today: string;
  now: number;
  onChange: (update: (current: PlannerState) => PlannerState) => void;
  onClose: () => void;
  onCompleteTask: (taskId: string) => number;
  onStartFocus: (taskId: string) => void;
  onWriteJournal: (title: string) => void;
};

type DropTarget = { type: "cell"; date: string; slot: PlannerSlot; beforeTaskId: string | null } | { type: "trash" } | { type: "folder" };
type DragState = { item: PlannerItem; x: number; y: number; offsetX: number; offsetY: number; width: number; target: DropTarget | null };
type ScopeChoice = { action: "move"; item: PlannerItem; date: string; slot: PlannerSlot } | { action: "delete"; item: PlannerItem };
type Notice = { id: number; text: string; undo?: (current: PlannerState) => PlannerState; journalTitle?: string };
type Shredding = { item: PlannerItem; seed: number };
type BinShred = Shredding & { geometry: ShredFeedGeometry };

const CELL_VISIBLE_CARDS = 3;
const SLOT_ICONS: Record<PlannerSlot, string> = { morning: "☀️", afternoon: "⛅", evening: "🌙" };
const SHRED_MS = 1250;
const NOTICE_MS = 5200;

let seedCounter = 0;
const nextSeed = () => ++seedCounter;

function dateLabel(date: string) {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

function weekdayLabel(date: string) {
  return WEEKDAY_LABELS[new Date(`${date}T12:00:00`).getDay()];
}

function sameCell(item: PlannerItem, date: string, slot: PlannerSlot) {
  return item.date === date && item.slot === slot;
}

function findTarget(x: number, y: number, dragKey: string): DropTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const zone = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-planner-drop]") : null;
    if (!zone) continue;
    const type = zone.dataset.plannerDrop;
    if (type === "trash" || type === "folder") return { type };
    if (type !== "cell" || !zone.dataset.date || !zone.dataset.slot) continue;
    const before = [...zone.querySelectorAll<HTMLElement>("[data-card-key^='task:']")]
      .filter((card) => card.dataset.cardKey !== dragKey)
      .find((card) => { const rect = card.getBoundingClientRect(); return y < rect.top + rect.height / 2; });
    return { type: "cell", date: zone.dataset.date, slot: zone.dataset.slot as PlannerSlot, beforeTaskId: before?.dataset.cardKey?.slice(5) ?? null };
  }
  return null;
}

function useNarrowLayout() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

function PlannerCard({ item, ghost, onPointerDown, onOpen, onFocus }: { item: PlannerItem; ghost?: boolean; onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void; onOpen?: () => void; onFocus?: () => void }) {
  return <div
    className={`planner-card planner-color-${item.color} ${item.kind} ${ghost ? "ghost" : ""}`}
    data-card-key={item.key}
    role="button"
    tabIndex={0}
    aria-label={`${item.kind === "course" ? "课程" : "任务"}：${item.title}${item.startTime ? `，${item.startTime}` : ""}。拖动可以调整时间，按回车编辑`}
    onPointerDown={onPointerDown}
    onKeyDown={(event) => { if (onOpen && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }}
  >
    <span className="planner-card-top"><b>{item.title}</b>{item.startTime && <time>{item.startTime}</time>}</span>
    <span className="planner-card-meta">
      <span>{item.kind === "course" ? "🎓 课程" : "✏️ 任务"}</span>
      {item.priority && <span className={`planner-tag ${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>}
      {item.location && <span className="planner-card-location">{item.location}</span>}
      {item.kind === "task" && onFocus && <button type="button" className="planner-focus" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onFocus(); }} aria-label={`为「${item.title}」开始橙子专注`}>🍊 {item.pomodoros ? `×${item.pomodoros}` : "专注"}</button>}
    </span>
  </div>;
}

function ShreddingCard({ shredding }: { shredding: Shredding }) {
  return <div className="planner-card-shred" aria-hidden="true"><SlicedCard item={shredding.item} seed={shredding.seed} mode="in-place" /></div>;
}

export default function PlannerOverlay(props: Props) {
  // Mounting the book only while open gives every visit a fresh week, dialogs and drag state.
  return props.open ? <PlannerBook {...props} /> : null;
}

function PlannerBook({ origin, planner, today, now, onChange, onClose, onCompleteTask, onStartFocus, onWriteJournal }: Props) {
  const narrow = useNarrowLayout();
  const [anchor, setAnchor] = useState(today);
  const [focusDay, setFocusDay] = useState(today);
  const [editor, setEditor] = useState<PlannerDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [scope, setScope] = useState<ScopeChoice | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [expanded, setExpanded] = useState<{ date: string; slot: PlannerSlot } | null>(null);
  const [inPlaceShreds, setInPlaceShreds] = useState<Shredding[]>([]);
  const [binShred, setBinShred] = useState<BinShred | null>(null);
  const shredderRef = useRef<HTMLSpanElement>(null);
  const [pile, setPile] = useState<PlannerColor[]>([]);
  const [confetti, setConfetti] = useState<{ x: number; y: number; seed: number } | null>(null);
  const [swallowing, setSwallowing] = useState(false);
  const [folderRefusing, setFolderRefusing] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const folderRef = useRef<HTMLButtonElement>(null);
  const pressRef = useRef<{ item: PlannerItem; pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; width: number; active: boolean } | null>(null);
  const expandTimer = useRef<number | undefined>(undefined);
  const previousVisible = useRef<Map<string, PlannerItem> | null>(null);
  const timers = useRef<number[]>([]);

  const weekStart = startOfWeek(anchor || today, planner.weekStartsOn);
  const dates = weekDates(weekStart, planner.weekStartsOn);
  const shownDates = narrow ? [dates.includes(focusDay) ? focusDay : dates[0]] : dates;
  const visible = today ? visiblePlannerItems(planner, dates, now) : [];
  const week = getTeachingWeek(weekStart, planner.semesterStart);
  const completed = planner.tasks.filter((task) => task.completedAt);
  const rewardsLeft = Math.max(0, PLANNER_DAILY_REWARD_LIMIT - (planner.rewardLog.date === today ? planner.rewardLog.count : 0));

  const later = (callback: () => void, delay: number) => { timers.current.push(window.setTimeout(callback, delay)); };
  const say = (next: Omit<Notice, "id">) => {
    const id = nextSeed();
    setNotice({ ...next, id });
    later(() => setNotice((current) => current?.id === id ? null : current), NOTICE_MS);
  };

  useEffect(() => () => { timers.current.forEach((timer) => window.clearTimeout(timer)); window.clearTimeout(expandTimer.current); }, []);

  // Courses that end while the planner is open get shredded where they sit.
  const visibleKeys = visible.map((item) => item.key).join("|");
  useEffect(() => {
    const current = new Map(visible.map((item) => [item.key, item]));
    const previous = previousVisible.current;
    previousVisible.current = current;
    if (!previous) return;
    const ended = [...previous.values()].filter((item) => item.kind === "course" && !current.has(item.key) && itemEndsAt(item) <= now);
    if (!ended.length) return;
    const shreds = ended.map((item) => ({ item, seed: nextSeed() }));
    const timer = window.setTimeout(() => setInPlaceShreds((items) => [...items, ...shreds]), 0);
    later(() => setInPlaceShreds((items) => items.filter((entry) => !shreds.includes(entry))), SHRED_MS + 400);
    return () => window.clearTimeout(timer);
  }, [visibleKeys, now]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || editor || settingsOpen || scope || importOpen) return;
      if (doneOpen) setDoneOpen(false);
      else if (expanded) setExpanded(null);
      else onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [editor, settingsOpen, scope, importOpen, doneOpen, expanded, onClose]);

  const shredIntoBin = (item: PlannerItem, apply: (current: PlannerState) => PlannerState, undo: (current: PlannerState) => PlannerState, text: string) => {
    // The data changes right away so closing the book mid-animation never loses the deletion.
    const card = document.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(item.key)}"]`)?.getBoundingClientRect();
    const slot = shredderRef.current?.querySelector(".shredder-slot")?.getBoundingClientRect();
    const teeth = shredderRef.current?.querySelector(".shredder-teeth")?.getBoundingClientRect();
    const bin = shredderRef.current?.querySelector(".shredder-bin")?.getBoundingClientRect();
    const shred = slot && teeth && bin ? {
      item, seed: nextSeed(),
      geometry: { slotX: slot.left + slot.width / 2, slotY: slot.top + slot.height / 2, slotWidth: slot.width - 4, exitY: teeth.bottom, binBottom: bin.bottom - 3, width: card?.width || 140, height: card?.height || 80 },
    } : null;
    setBinShred(shred);
    onChange(apply);
    say({ text, undo });
    later(() => {
      setBinShred((current) => current === shred ? null : current);
      setPile((items) => [...items, ...Array.from({ length: 6 }, () => item.color)]);
    }, SHRED_FEED_MS);
  };

  const shredTask = (item: PlannerItem) => {
    const task = planner.tasks.find((entry) => entry.id === item.id);
    if (!task) return;
    shredIntoBin(item, (current) => removeTask(current, task.id), (current) => current.tasks.some((entry) => entry.id === task.id) ? current : { ...current, tasks: [...current.tasks, task] }, `「${task.title}」已经粉碎`);
  };

  const deleteCourse = (item: PlannerItem, whole: boolean) => {
    const course = planner.courses.find((entry) => entry.id === item.id);
    if (!course) return;
    const exceptions = planner.courseExceptions.filter((entry) => entry.courseId === course.id);
    const previous = exceptions.find((entry) => entry.date === item.sourceDate);
    if (whole) {
      shredIntoBin(item, (current) => removeCourse(current, course.id), (current) => current.courses.some((entry) => entry.id === course.id) ? current : { ...current, courses: [...current.courses, course], courseExceptions: [...current.courseExceptions, ...exceptions] }, `「${course.title}」整门课已删除`);
    } else {
      const restore = (current: PlannerState) => ({ ...current, courseExceptions: [...current.courseExceptions.filter((entry) => entry.courseId !== course.id || entry.date !== item.sourceDate), ...(previous ? [previous as CourseException] : [])] });
      shredIntoBin(item, (current) => skipCourseOnce(current, course.id, item.sourceDate), restore, `${dateLabel(item.date)}的「${course.title}」已粉碎，其他周不受影响`);
    }
  };

  const completeTask = (item: PlannerItem) => {
    const rect = folderRef.current?.getBoundingClientRect();
    if (rect) setConfetti({ x: rect.left + rect.width / 2, y: rect.top + rect.height * .35, seed: nextSeed() });
    setSwallowing(true);
    later(() => setSwallowing(false), 720);
    later(() => setConfetti(null), 1900);
    const reward = onCompleteTask(item.id);
    say({ text: reward ? `完成「${item.title}」！获得 🍓 ${reward}` : `完成「${item.title}」！${planner.tasks.find((task) => task.id === item.id)?.rewarded ? "这项任务已领取过奖励" : "今天的任务奖励已经领满"}`, journalTitle: item.title, undo: (current) => restoreTask(current, item.id) });
  };

  const drop = (item: PlannerItem, target: DropTarget | null) => {
    if (!target) return;
    if (target.type === "trash") { if (item.kind === "task") shredTask(item); else setScope({ action: "delete", item }); return; }
    if (target.type === "folder") {
      if (item.kind === "task") completeTask(item);
      else { setFolderRefusing(true); later(() => setFolderRefusing(false), 520); say({ text: "课程下课后会自动粉碎，不用放进文件夹" }); }
      return;
    }
    if (item.kind === "task") {
      onChange((current) => moveTask(current, item.id, target.date, target.slot, target.beforeTaskId));
      if (!sameCell(item, target.date, target.slot)) say({ text: `已移到${weekdayLabel(target.date)}${SLOT_LABELS[target.slot]}` });
    } else if (!sameCell(item, target.date, target.slot)) setScope({ action: "move", item, date: target.date, slot: target.slot });
  };

  const openEditor = (item: PlannerItem) => {
    if (item.kind === "task") {
      const task = planner.tasks.find((entry) => entry.id === item.id);
      if (!task) return;
      setEditor({ mode: "edit", kind: "task", id: task.id, sourceDate: task.date, title: task.title, date: task.date, slot: task.slot, weekday: 1, startTime: task.startTime ?? "", endTime: task.endTime ?? "", location: task.location, note: task.note, priority: task.priority, color: task.color, startWeek: 1, endWeek: 16, parity: "all" });
    } else {
      const course = planner.courses.find((entry) => entry.id === item.id);
      if (!course) return;
      setEditor({ mode: "edit", kind: "course", id: course.id, sourceDate: item.sourceDate, title: course.title, date: item.date, slot: item.slot, weekday: course.weekday, startTime: course.startTime, endTime: course.endTime, location: course.location, note: course.note, priority: course.priority, color: course.color, startWeek: course.startWeek, endWeek: course.endWeek, parity: course.parity });
    }
  };

  const newDraft = (date: string, slot: PlannerSlot): PlannerDraft => ({ mode: "new", kind: "task", id: null, sourceDate: null, title: "", date, slot, weekday: new Date(`${date}T12:00:00`).getDay(), startTime: "", endTime: "", location: "", note: "", priority: null, color: "berry", startWeek: 1, endWeek: 16, parity: "all" });

  const saveDraft = (draft: PlannerDraft) => {
    const createdAt = new Date().toISOString();
    if (draft.kind === "task") {
      const fields = { title: draft.title, date: draft.date, slot: draft.startTime ? slotForTime(draft.startTime) : draft.slot, startTime: draft.startTime || null, endTime: draft.startTime && draft.endTime ? draft.endTime : null, location: draft.location, note: draft.note, priority: draft.priority, color: draft.color };
      onChange((current) => draft.id
        ? { ...current, tasks: current.tasks.map((task) => task.id === draft.id ? { ...task, ...fields, order: task.date === fields.date && task.slot === fields.slot ? task.order : nextOrder(current, fields.date, fields.slot) } : task) }
        : { ...current, tasks: [...current.tasks, { id: crypto.randomUUID(), ...fields, order: nextOrder(current, fields.date, fields.slot), createdAt, completedAt: null, rewarded: false, pomodoros: 0 } satisfies PlannerTask] });
    } else {
      const fields = { title: draft.title, weekday: draft.weekday, startTime: draft.startTime, endTime: draft.endTime, location: draft.location, note: draft.note, priority: draft.priority, color: draft.color, startWeek: draft.startWeek, endWeek: draft.endWeek, parity: draft.parity };
      onChange((current) => draft.id
        ? { ...current, courses: current.courses.map((course) => course.id === draft.id ? { ...course, ...fields } : course) }
        : { ...current, courses: [...current.courses, { id: crypto.randomUUID(), ...fields, createdAt } satisfies PlannerCourse] });
      if (!planner.semesterStart && (draft.startWeek > 1 || draft.parity !== "all")) say({ text: "设置学期周次后，第几周和单双周才会生效" });
    }
    setEditor(null);
  };

  const startPress = (event: React.PointerEvent<HTMLDivElement>, item: PlannerItem) => {
    if (event.button !== 0 || pressRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pressRef.current = { item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, active: false };
    const move = (moveEvent: PointerEvent) => {
      const press = pressRef.current;
      if (!press || moveEvent.pointerId !== press.pointerId) return;
      if (!press.active && Math.hypot(moveEvent.clientX - press.startX, moveEvent.clientY - press.startY) < 6) return;
      if (!press.active) press.active = true;
      moveEvent.preventDefault();
      const target = findTarget(moveEvent.clientX, moveEvent.clientY, press.item.key);
      const chip = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY).map((element) => element instanceof HTMLElement ? element.closest<HTMLElement>("[data-expand-date]") : null).find(Boolean);
      if (chip && !expandTimer.current) expandTimer.current = window.setTimeout(() => { setExpanded({ date: chip.dataset.expandDate!, slot: chip.dataset.expandSlot as PlannerSlot }); expandTimer.current = undefined; }, 550);
      if (!chip && expandTimer.current) { window.clearTimeout(expandTimer.current); expandTimer.current = undefined; }
      setDrag({ item: press.item, x: moveEvent.clientX, y: moveEvent.clientY, offsetX: press.offsetX, offsetY: press.offsetY, width: press.width, target });
    };
    const finish = (endEvent: PointerEvent) => {
      const press = pressRef.current;
      if (!press || endEvent.pointerId !== press.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.clearTimeout(expandTimer.current); expandTimer.current = undefined;
      pressRef.current = null;
      setDrag(null);
      if (!press.active) { if (endEvent.type === "pointerup") openEditor(press.item); return; }
      if (endEvent.type === "pointerup") drop(press.item, findTarget(endEvent.clientX, endEvent.clientY, press.item.key));
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const hotCell = drag?.target?.type === "cell" ? drag.target : null;
  const originX = origin ? origin.left + origin.width / 2 : window.innerWidth * .8;
  const originY = origin ? origin.top + origin.height / 2 : window.innerHeight * .25;
  const card = (item: PlannerItem) => <PlannerCard key={item.key} item={item} ghost={drag?.item.key === item.key} onPointerDown={(event) => startPress(event, item)} onOpen={() => openEditor(item)} onFocus={item.kind === "task" ? () => onStartFocus(item.id) : undefined} />;
  const expandedItems = expanded ? visible.filter((item) => sameCell(item, expanded.date, expanded.slot)) : [];

  return <div className={`planner-layer ${drag ? "is-dragging" : ""}`} role="presentation" onPointerDown={() => { if (!drag) onClose(); }}>
    <section className="planner-overlay" role="dialog" aria-modal="true" aria-label="日程本" style={{ "--board-origin-x": `${originX}px`, "--board-origin-y": `${originY}px` } as CSSProperties} onPointerDown={(event) => event.stopPropagation()} onClickCapture={(event) => {
      const target = event.target as HTMLElement;
      if (expanded && !target.closest(".planner-expanded, [data-expand-date]")) setExpanded(null);
    }}>
      <header className="planner-header">
        <h2>日程本</h2>
        <button type="button" className="planner-week-chip" onClick={() => setSettingsOpen(true)}>{week ? `第 ${week} 周 · ${week % 2 ? "单周" : "双周"}` : "设置学期周次"}</button>
        <span className="planner-range">{dateLabel(dates[0])} – {dateLabel(dates[6])}</span>
        <span className="planner-spacer" />
        <span className="planner-week-nav">
          <button type="button" aria-label="上一周" onClick={() => { setAnchor(addDays(weekStart, -7)); setFocusDay(addDays(focusDay, -7)); }}>‹</button>
          <button type="button" disabled={dates.includes(today)} onClick={() => { setAnchor(today); setFocusDay(today); }}>本周</button>
          <button type="button" aria-label="下一周" onClick={() => { setAnchor(addDays(weekStart, 7)); setFocusDay(addDays(focusDay, 7)); }}>›</button>
        </span>
        <button type="button" className="planner-button" onClick={() => setImportOpen(true)} aria-label="截图导入课表">📷<span className="planner-button-label"> 截图导入课表</span></button>
        <button type="button" className="planner-button planner-settings-button" onClick={() => setSettingsOpen(true)} aria-label="设置">⚙<span className="planner-button-label"> 设置</span></button>
        <button type="button" className="planner-button primary" onClick={() => { const date = dates.includes(today) ? today : narrow ? shownDates[0] : dates[0]; const nowDate = new Date(now); setEditor(newDraft(date, date === today ? slotForTime(`${String(nowDate.getHours()).padStart(2, "0")}:00`) : "morning")); }}>＋ 新建</button>
        <button type="button" className="planner-close" onClick={onClose} aria-label="关闭日程本">×</button>
      </header>

      {narrow && <nav className="planner-day-tabs" aria-label="选择日期">
        {dates.map((date) => <button type="button" key={date} className={`${date === shownDates[0] ? "active" : ""} ${date === today ? "today" : ""}`} onClick={() => setFocusDay(date)}><small>{weekdayLabel(date).slice(1)}</small><b>{Number(date.slice(8, 10))}</b></button>)}
      </nav>}

      <div className="planner-grid-scroll">
        <div className="planner-grid" style={{ "--planner-days": shownDates.length } as CSSProperties}>
          <span className="planner-corner" />
          {shownDates.map((date) => <span key={date} className={`planner-day-head ${date === today ? "today" : ""}`}><small>{weekdayLabel(date)}</small><b>{Number(date.slice(8, 10))}</b></span>)}
          {PLANNER_SLOTS.map((slot) => <Fragment key={slot}>
            <span className="planner-slot-label"><i aria-hidden="true">{SLOT_ICONS[slot]}</i>{SLOT_LABELS[slot]}</span>
            {shownDates.map((date) => {
              const items = visible.filter((item) => sameCell(item, date, slot));
              const shown = items.length > CELL_VISIBLE_CARDS ? items.slice(0, CELL_VISIBLE_CARDS) : items;
              const shreds = inPlaceShreds.filter((entry) => sameCell(entry.item, date, slot));
              const hot = hotCell && hotCell.date === date && hotCell.slot === slot && !(drag && sameCell(drag.item, date, slot) && drag.item.kind === "course");
              return <div key={date} className={`planner-cell ${date === today ? "today" : ""} ${hot ? "hot" : ""}`} data-planner-drop="cell" data-date={date} data-slot={slot}>
                {shown.map(card)}
                {shreds.map((entry) => <ShreddingCard key={`shred-${entry.item.key}`} shredding={entry} />)}
                {items.length > shown.length && <button type="button" className="planner-more" data-expand-date={date} data-expand-slot={slot} onClick={() => setExpanded({ date, slot })}>展开另外 {items.length - shown.length} 项 ▾</button>}
                <button type="button" className="planner-add" data-planner-add aria-label={`在${weekdayLabel(date)}${SLOT_LABELS[slot]}新建`} onClick={() => setEditor(newDraft(date, slot))}>＋</button>
              </div>;
            })}
          </Fragment>)}
        </div>
        {!planner.courses.length && !planner.tasks.some((task) => !task.completedAt) && <p className="planner-empty">点格子里的 ＋ 新建安排，或者用“📷 截图导入课表”一次导入整学期的课</p>}
      </div>

      <footer className="planner-footer">
        <span className={`planner-drop planner-trash ${drag?.target?.type === "trash" ? "hot" : ""}`} data-planner-drop="trash" aria-label="碎纸机：把任务拖到这里粉碎">
          <span ref={shredderRef}><Shredder hot={drag?.target?.type === "trash"} busy={Boolean(binShred)} pile={pile} /></span>
          <small>拖进来<br />粉碎删除</small>
        </span>
        <p className="planner-hint">拖动卡片换天或时段 · <b>课程下课后自动粉碎</b><br />任务拖进文件夹算完成，每项 🍓 {PLANNER_TASK_REWARD}（今天还能领 {rewardsLeft} 次）</p>
        <span className={`planner-drop planner-done ${drag?.target?.type === "folder" ? "hot" : ""} ${folderRefusing ? "refusing" : ""}`} data-planner-drop="folder">
          <small>拖进来<br />完成 + 彩带</small>
          <button ref={folderRef} type="button" className="planner-folder-button" aria-label={`完成文件夹，已完成 ${completed.length} 项，点击打开`} onClick={() => setDoneOpen(true)}>
            <DoneFolder hot={drag?.target?.type === "folder"} swallowing={swallowing} count={completed.length} />
          </button>
        </span>
      </footer>

      {expanded && <div className="planner-expanded" data-planner-drop="cell" data-date={expanded.date} data-slot={expanded.slot} role="dialog" aria-label={`${weekdayLabel(expanded.date)}${SLOT_LABELS[expanded.slot]}的全部安排`}>
        <header><b>{weekdayLabel(expanded.date)}{SLOT_LABELS[expanded.slot]} · 全部 {expandedItems.length} 项</b><button type="button" onClick={() => setExpanded(null)} aria-label="收起">×</button></header>
        {expandedItems.map(card)}
      </div>}

      {notice && <div className="planner-notice" role="status">
        <span>{notice.text}</span>
        {notice.journalTitle && <button type="button" onClick={() => { onWriteJournal(notice.journalTitle!); setNotice(null); }}>写进日记</button>}
        {notice.undo && <button type="button" onClick={() => { onChange(notice.undo!); setNotice(null); }}>撤销</button>}
      </div>}

      {scope && <div className="planner-dialog-layer" onPointerDown={(event) => { event.stopPropagation(); setScope(null); }}>
        <section className="planner-dialog planner-scope" role="alertdialog" aria-modal="true" aria-label={scope.action === "move" ? "调整课程" : "删除课程"} onPointerDown={(event) => event.stopPropagation()}>
          <b>{scope.action === "move" ? `把「${scope.item.title}」移到${weekdayLabel(scope.date)}${SLOT_LABELS[scope.slot]}` : `粉碎「${scope.item.title}」`}</b>
          <p>{scope.action === "move" ? `换到其他时段时，会从 ${SLOT_DEFAULT_START[scope.slot]} 开始，保持原来的上课时长。` : "可以只粉碎这一次（比如停课），也可以删掉整门课。"}</p>
          <footer>
            <button type="button" onClick={() => setScope(null)}>取消</button>
            <button type="button" onClick={() => { if (scope.action === "move") onChange((current) => moveCourseOnce(current, scope.item.id, scope.item.sourceDate, scope.date, scope.slot)); else deleteCourse(scope.item, false); setScope(null); }}>{scope.action === "move" ? "只改这一次" : "只粉碎这一次"}</button>
            <button type="button" className={scope.action === "delete" ? "danger" : "primary"} onClick={() => { if (scope.action === "move") onChange((current) => moveCourseEveryWeek(current, scope.item.id, scope.date, scope.slot)); else deleteCourse(scope.item, true); setScope(null); }}>{scope.action === "move" ? "以后每周都改" : "删除整门课"}</button>
          </footer>
        </section>
      </div>}

      {importOpen && <TimetableImport
        courses={planner.courses}
        hasSemester={Boolean(planner.semesterStart)}
        onSetCurrentWeek={(value) => onChange((current) => ({ ...current, semesterStart: addDays(startOfWeek(today, 1), -(Math.round(value) - 1) * 7) }))}
        onImport={(created) => {
          onChange((current) => ({ ...current, courses: [...current.courses, ...created] }));
          setImportOpen(false);
          say({ text: `已导入 ${created.length} 门课${planner.semesterStart ? "" : "，记得在设置里填本周是第几周"}`, undo: (current) => ({ ...current, courses: current.courses.filter((course) => !created.some((item) => item.id === course.id)) }) });
        }}
        onClose={() => setImportOpen(false)}
      />}

      {doneOpen && <DoneArchive
        tasks={planner.tasks}
        today={today}
        onClose={() => setDoneOpen(false)}
        onRestore={(task) => { onChange((current) => restoreTask(current, task.id)); say({ text: `「${task.title}」已放回${dateLabel(task.date)}${SLOT_LABELS[task.slot]}` }); }}
        onRemove={(task) => { onChange((current) => removeTask(current, task.id)); say({ text: `「${task.title}」已从文件夹移除`, undo: (current) => current.tasks.some((entry) => entry.id === task.id) ? current : { ...current, tasks: [...current.tasks, task] } }); }}
      />}

      {settingsOpen && <PlannerSettings planner={planner} today={today} onCancel={() => setSettingsOpen(false)} onSave={(patch) => { onChange((current) => ({ ...current, ...patch })); setSettingsOpen(false); }} />}

      {editor && <PlannerEditor
        draft={editor}
        onCancel={() => setEditor(null)}
        onSave={saveDraft}
        onDelete={editor.mode === "edit" ? () => {
          const item = visible.find((entry) => entry.id === editor.id && (editor.kind === "task" || entry.sourceDate === editor.sourceDate));
          setEditor(null);
          if (!item) return;
          if (item.kind === "task") shredTask(item); else setScope({ action: "delete", item });
        } : undefined}
        onComplete={editor.mode === "edit" && editor.kind === "task" ? () => { const item = visible.find((entry) => entry.kind === "task" && entry.id === editor.id); setEditor(null); if (item) completeTask(item); } : undefined}
        onFocus={editor.mode === "edit" && editor.kind === "task" ? () => { setEditor(null); onStartFocus(editor.id!); } : undefined}
      />}
    </section>

    {drag && <div className={`planner-drag-card ${drag.target?.type === "trash" ? "over-trash" : drag.target?.type === "folder" ? "over-folder" : ""}`} style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }} aria-hidden="true"><PlannerCard item={drag.item} /></div>}
    {binShred && <ShredderFeed key={binShred.seed} item={binShred.item} seed={binShred.seed} geometry={binShred.geometry} />}
    {confetti && <ConfettiBurst {...confetti} />}
  </div>;
}

function PlannerSettings({ planner, today, onCancel, onSave }: { planner: PlannerState; today: string; onCancel: () => void; onSave: (patch: Partial<PlannerState>) => void }) {
  const [semesterStart, setSemesterStart] = useState(planner.semesterStart ?? "");
  const [weekStartsOn, setWeekStartsOn] = useState(planner.weekStartsOn);
  const [remindersEnabled, setRemindersEnabled] = useState(planner.remindersEnabled);
  const currentWeek = semesterStart ? getTeachingWeek(today, semesterStart) : null;
  const setCurrentWeek = (value: number) => {
    if (!Number.isFinite(value) || value < 1 || value > 30) return;
    setSemesterStart(addDays(startOfWeek(today, 1), -(Math.round(value) - 1) * 7));
  };
  return <div className="planner-dialog-layer" onPointerDown={(event) => { event.stopPropagation(); onCancel(); }}>
    <form className="planner-dialog planner-settings" role="dialog" aria-modal="true" aria-label="日程本设置" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave({ semesterStart: semesterStart || null, weekStartsOn, remindersEnabled }); }}>
      <header><b>日程本设置</b></header>
      <label className="planner-field"><span>本周是第几周</span><input type="number" min={1} max={30} value={currentWeek ?? ""} placeholder="比如 10" onChange={(event) => setCurrentWeek(Number(event.target.value))} /></label>
      <label className="planner-field"><span>学期第一周的任意一天</span><input type="date" value={semesterStart} onChange={(event) => setSemesterStart(event.target.value)} /></label>
      <p className="planner-dialog-note">两项填一项就行。周次按周一到周日计算，课程的“第几周”和“单双周”都以它为准{semesterStart ? `；第 1 周从 ${dateLabel(startOfWeek(semesterStart, 1))} 开始` : ""}。</p>
      <fieldset className="planner-field wide planner-chips"><legend>每周从哪天开始显示</legend>
        <button type="button" className={weekStartsOn === 1 ? "active" : ""} aria-pressed={weekStartsOn === 1} onClick={() => setWeekStartsOn(1)}>周一</button>
        <button type="button" className={weekStartsOn === 0 ? "active" : ""} aria-pressed={weekStartsOn === 0} onClick={() => setWeekStartsOn(0)}>周日</button>
      </fieldset>
      <label className="planner-toggle wide"><input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} /><span>上课和有开始时间的任务，提前 10 分钟提醒</span></label>
      <footer>
        {semesterStart && <button type="button" onClick={() => setSemesterStart("")}>清除周次</button>}
        <span />
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary">保存</button>
      </footer>
    </form>
  </div>;
}
