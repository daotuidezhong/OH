import { useState } from "react";
import { addDays, groupCompletedByDay, PRIORITY_LABELS, SLOT_LABELS, WEEKDAY_LABELS, type PlannerTask } from "./planner";

type Props = {
  tasks: PlannerTask[];
  today: string;
  onRestore: (task: PlannerTask) => void;
  onRemove: (task: PlannerTask) => void;
  onClose: () => void;
};

function dayTitle(date: string, today: string) {
  const label = `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 ${WEEKDAY_LABELS[new Date(`${date}T12:00:00`).getDay()]}`;
  if (date === today) return `${label} · 今天`;
  if (date === addDays(today, -1)) return `${label} · 昨天`;
  return date.slice(0, 4) === today.slice(0, 4) ? label : `${date.slice(0, 4)}年${label}`;
}

function completedTime(task: PlannerTask) {
  const date = new Date(task.completedAt!);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function DoneArchive({ tasks, today, onRestore, onRemove, onClose }: Props) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const days = groupCompletedByDay(tasks, newestFirst);
  const total = days.reduce((sum, day) => sum + day.tasks.length, 0);

  return <div className="planner-dialog-layer" onPointerDown={(event) => { event.stopPropagation(); onClose(); }}>
    <section className="done-archive" role="dialog" aria-modal="true" aria-label="完成文件夹" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <span className="done-archive-tab" aria-hidden="true">完成文件夹</span>
      <header>
        <span><b>完成文件夹</b><small>{total ? `共 ${total} 项，按完成的日期归档` : "完成的任务会按日期归档在这里"}</small></span>
        <button type="button" className="done-archive-sort" onClick={() => setNewestFirst((value) => !value)} aria-label={newestFirst ? "改为最早的在前" : "改为最新的在前"}>{newestFirst ? "最新在前" : "最早在前"} ⇅</button>
        <button type="button" className="planner-close" onClick={onClose} aria-label="关闭完成文件夹">×</button>
      </header>
      <div className="done-archive-pages">
        {!days.length && <p className="done-archive-empty">还没有完成的任务。把日程本里的任务拖进文件夹，就会按日期收在这里。</p>}
        {days.map((day) => <section key={day.date} className="done-archive-day" aria-label={dayTitle(day.date, today)}>
          <h3><span>{dayTitle(day.date, today)}</span><small>{day.tasks.length} 项{day.berries ? ` · 🍓 ${day.berries}` : ""}{day.pomodoros ? ` · 🍊 ${day.pomodoros}` : ""}</small></h3>
          <ul>
            {day.tasks.map((task) => <li key={task.id} className={`planner-color-${task.color}`}>
              <span className="done-archive-stamp" aria-hidden="true">✓</span>
              <span className="done-archive-text">
                <b>{task.title}</b>
                <small>
                  <span>{completedTime(task)} 完成</span>
                  <span>原定 {Number(task.date.slice(5, 7))}月{Number(task.date.slice(8, 10))}日{SLOT_LABELS[task.slot]}{task.startTime ? ` ${task.startTime}` : ""}</span>
                  {task.priority && <span className={`planner-tag ${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>}
                  {task.pomodoros > 0 && <span>🍊 ×{task.pomodoros}</span>}
                  {task.rewarded && <span>🍓 +3</span>}
                </small>
                {task.note && <em>{task.note}</em>}
              </span>
              {confirming === task.id
                ? <span className="done-archive-actions"><button type="button" onClick={() => setConfirming(null)}>留着</button><button type="button" className="danger" onClick={() => { setConfirming(null); onRemove(task); }}>确认移除</button></span>
                : <span className="done-archive-actions"><button type="button" onClick={() => onRestore(task)}>放回日程</button><button type="button" onClick={() => setConfirming(task.id)}>移除</button></span>}
            </li>)}
          </ul>
        </section>)}
      </div>
    </section>
  </div>;
}
