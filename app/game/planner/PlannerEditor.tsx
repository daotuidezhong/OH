import { useState } from "react";
import { minutesOf, PLANNER_COLORS, PLANNER_SLOTS, PRIORITY_LABELS, SLOT_LABELS, slotForTime, WEEKDAY_LABELS, type PlannerColor, type PlannerPriority, type PlannerSlot, type WeekParity } from "./planner";

export type PlannerDraft = {
  mode: "new" | "edit";
  kind: "task" | "course";
  id: string | null;
  sourceDate: string | null;
  title: string;
  date: string;
  slot: PlannerSlot;
  weekday: number;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
  priority: PlannerPriority;
  color: PlannerColor;
  startWeek: number;
  endWeek: number;
  parity: WeekParity;
};

type Props = {
  draft: PlannerDraft;
  onSave: (draft: PlannerDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onComplete?: () => void;
  onFocus?: () => void;
};

const COLOR_NAMES: Record<PlannerColor, string> = { berry: "莓果粉", orange: "橙子橙", sage: "薄荷绿", sky: "天空蓝", lilac: "葡萄紫", cream: "奶油黄" };
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function validate(draft: PlannerDraft) {
  if (!draft.title.trim()) return "先写一个标题吧";
  if (draft.kind === "course") {
    if (!draft.startTime || !draft.endTime) return "课程需要填写上课和下课时间";
    if (minutesOf(draft.endTime) <= minutesOf(draft.startTime)) return "下课时间要晚于上课时间";
    if (draft.endWeek < draft.startWeek) return "结束周不能早于开始周";
  } else if (draft.endTime && (!draft.startTime || minutesOf(draft.endTime) <= minutesOf(draft.startTime))) return "结束时间要晚于开始时间";
  return "";
}

export default function PlannerEditor({ draft: initial, onSave, onCancel, onDelete, onComplete, onFocus }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const update = (patch: Partial<PlannerDraft>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); };
  const setStartTime = (startTime: string) => update(startTime && draft.kind === "task" ? { startTime, slot: slotForTime(startTime) } : { startTime });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate(draft);
    if (problem) { setError(problem); return; }
    onSave({ ...draft, title: draft.title.trim().slice(0, draft.kind === "course" ? 40 : 60), location: draft.location.trim().slice(0, 40), note: draft.note.trim().slice(0, 200) });
  };
  const isCourse = draft.kind === "course";

  return <div className="planner-dialog-layer" onPointerDown={(event) => { event.stopPropagation(); onCancel(); }}>
    <form className="planner-dialog planner-editor" role="dialog" aria-modal="true" aria-label={draft.mode === "new" ? "新建安排" : "编辑安排"} onPointerDown={(event) => event.stopPropagation()} onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
      <header>
        <b>{draft.mode === "new" ? "新建安排" : isCourse ? "编辑课程" : "编辑任务"}</b>
        {draft.mode === "new" && <span className="planner-kind-switch" role="radiogroup" aria-label="安排类型">
          <button type="button" role="radio" aria-checked={!isCourse} className={!isCourse ? "active" : ""} onClick={() => update({ kind: "task", color: draft.color === "sky" ? "berry" : draft.color })}>✏️ 任务</button>
          <button type="button" role="radio" aria-checked={isCourse} className={isCourse ? "active" : ""} onClick={() => update({ kind: "course", color: draft.color === "berry" ? "sky" : draft.color, startTime: draft.startTime || "08:00", endTime: draft.endTime || "09:35" })}>🎓 课程</button>
        </span>}
      </header>

      <label className="planner-field wide"><span>标题</span><input autoFocus value={draft.title} maxLength={isCourse ? 40 : 60} placeholder={isCourse ? "比如：大学英语（一）" : "比如：写项目申报书"} onChange={(event) => update({ title: event.target.value })} /></label>

      {isCourse
        ? <label className="planner-field"><span>星期</span><select value={draft.weekday} onChange={(event) => update({ weekday: Number(event.target.value) })}>{WEEKDAY_ORDER.map((day) => <option key={day} value={day}>{WEEKDAY_LABELS[day]}</option>)}</select></label>
        : <label className="planner-field"><span>日期</span><input type="date" value={draft.date} required onChange={(event) => event.target.value && update({ date: event.target.value })} /></label>}
      {!isCourse && <label className="planner-field"><span>时段</span><select value={draft.slot} onChange={(event) => update({ slot: event.target.value as PlannerSlot, startTime: "", endTime: "" })}>{PLANNER_SLOTS.map((slot) => <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>)}</select></label>}
      <label className="planner-field"><span>{isCourse ? "上课" : "开始（可不填）"}</span><input type="time" value={draft.startTime} required={isCourse} onChange={(event) => setStartTime(event.target.value)} /></label>
      <label className="planner-field"><span>{isCourse ? "下课" : "结束（可不填）"}</span><input type="time" value={draft.endTime} required={isCourse} onChange={(event) => update({ endTime: event.target.value })} /></label>

      {isCourse && <>
        <label className="planner-field"><span>从第几周</span><input type="number" min={1} max={30} value={draft.startWeek} onChange={(event) => update({ startWeek: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /></label>
        <label className="planner-field"><span>到第几周</span><input type="number" min={1} max={30} value={draft.endWeek} onChange={(event) => update({ endWeek: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /></label>
        <fieldset className="planner-field wide planner-chips"><legend>单双周</legend>
          {(["all", "odd", "even"] as WeekParity[]).map((parity) => <button type="button" key={parity} className={draft.parity === parity ? "active" : ""} aria-pressed={draft.parity === parity} onClick={() => update({ parity })}>{parity === "all" ? "每周" : parity === "odd" ? "单周" : "双周"}</button>)}
        </fieldset>
      </>}

      <label className="planner-field"><span>地点 / 班级</span><input value={draft.location} maxLength={40} placeholder="可不填" onChange={(event) => update({ location: event.target.value })} /></label>
      <fieldset className="planner-field planner-chips"><legend>优先级</legend>
        {([null, "low", "medium", "high"] as PlannerPriority[]).map((priority) => <button type="button" key={priority ?? "none"} className={`${draft.priority === priority ? "active" : ""} ${priority === "high" ? "high" : ""}`} aria-pressed={draft.priority === priority} onClick={() => update({ priority })}>{priority ? PRIORITY_LABELS[priority] : "无"}</button>)}
      </fieldset>
      <fieldset className="planner-field wide planner-swatches"><legend>颜色</legend>
        {PLANNER_COLORS.map((color) => <button type="button" key={color} className={`planner-color-${color} ${draft.color === color ? "active" : ""}`} aria-pressed={draft.color === color} aria-label={COLOR_NAMES[color]} title={COLOR_NAMES[color]} onClick={() => update({ color })} />)}
      </fieldset>
      <label className="planner-field wide"><span>备注</span><textarea rows={2} value={draft.note} maxLength={200} placeholder="可不填" onChange={(event) => update({ note: event.target.value })} /></label>

      {isCourse && draft.mode === "edit" && <p className="planner-dialog-note">修改会作用到这门课的每一周；只想调这一次，直接把卡片拖到新位置。</p>}
      {error && <p className="planner-dialog-error" role="alert">{error}</p>}
      <footer>
        {onDelete && <button type="button" className="danger" onClick={onDelete}>{isCourse ? "删除课程…" : "粉碎"}</button>}
        {onFocus && <button type="button" onClick={onFocus}>🍊 专注</button>}
        {onComplete && <button type="button" onClick={onComplete}>完成</button>}
        <span />
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary">保存</button>
      </footer>
    </form>
  </div>;
}
