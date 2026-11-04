import { useEffect, useRef, useState } from "react";
import type { PlannerCourse, WeekParity } from "./planner";
import { aiKey, prepareTimetableImage, recognizeTimetable, type TimetableImage } from "./timetable-ai";
import { isDuplicateCourse, rowsToCourses, toImportRows, validateImportRow, type ImportRow } from "./timetable-import";

type Props = {
  courses: PlannerCourse[];
  hasSemester: boolean;
  onSetCurrentWeek: (week: number) => void;
  onImport: (courses: PlannerCourse[]) => void;
  onClose: () => void;
};

type Step = "loading" | "key" | "pick" | "busy" | "confirm";

const WEEKDAY_OPTIONS = [[1, "周一"], [2, "周二"], [3, "周三"], [4, "周四"], [5, "周五"], [6, "周六"], [0, "周日"]] as const;
const PARITY_OPTIONS: [WeekParity, string][] = [["all", "每周"], ["odd", "单周"], ["even", "双周"]];

export default function TimetableImport({ courses, hasSemester, onSetCurrentWeek, onImport, onClose }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [keyDraft, setKeyDraft] = useState("");
  const [changingKey, setChangingKey] = useState(false);
  const [image, setImage] = useState<TimetableImage | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [weekDraft, setWeekDraft] = useState("");
  const [error, setError] = useState("");
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const desktop = typeof window !== "undefined" && Boolean(window.gameUpdater?.aiKey);

  useEffect(() => {
    let alive = true;
    void aiKey.has().then((has) => { if (alive) setStep(has ? "pick" : "key"); });
    return () => { alive = false; abortRef.current?.abort(); };
  }, []);

  const choose = async (file: Blob | null | undefined) => {
    if (!file) return;
    setError("");
    try { setImage(await prepareTimetableImage(file)); } catch (problem) { setError(problem instanceof Error ? problem.message : "图片读取失败"); }
  };

  useEffect(() => {
    if (step !== "pick") return;
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (file) { event.preventDefault(); void choose(file); }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [step]);

  const saveKey = async () => {
    const key = keyDraft.trim();
    if (!key.startsWith("sk-")) { setError("DeepSeek 的 API Key 一般以 sk- 开头，请检查一下"); return; }
    try { await aiKey.set(key); } catch { setError("API Key 保存失败，请重试"); return; }
    setKeyDraft(""); setChangingKey(false); setError(""); setStep("pick");
  };

  const recognize = async () => {
    if (!image) return;
    const week = Number(weekDraft);
    if (!hasSemester && weekDraft && week >= 1 && week <= 30) onSetCurrentWeek(week);
    const controller = new AbortController();
    abortRef.current = controller;
    setError(""); setStep("busy");
    try {
      const result = await recognizeTimetable(image, controller.signal);
      setRows(toImportRows(result, courses, `${Date.now()}`));
      setWarnings(result.warnings);
      setStep("confirm");
      if (!result.courses.length) setError("没有在截图里找到课程，可以换一张更清晰的截图再试");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "识别失败");
      setStep("pick");
    } finally { abortRef.current = null; }
  };

  const updateRow = (id: string, patch: Partial<ImportRow>) => setRows((current) => current.map((row) => {
    if (row.id !== id) return row;
    const next = { ...row, ...patch };
    return { ...next, duplicate: isDuplicateCourse(next, courses) };
  }));
  const importable = rows.filter((row) => row.include && !validateImportRow(row) && !row.duplicate);
  const finish = () => {
    const created = rowsToCourses(rows, courses, () => crypto.randomUUID(), new Date().toISOString());
    if (created.length) onImport(created);
  };

  return <div className="planner-dialog-layer" onPointerDown={(event) => { event.stopPropagation(); if (step !== "busy") onClose(); }}>
    <section className={`planner-dialog timetable-import step-${step}`} role="dialog" aria-modal="true" aria-label="截图导入课表" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape" && step !== "busy") { event.stopPropagation(); onClose(); } }}>
      <header><b>📷 截图导入课表</b>{step === "pick" && !changingKey && <button type="button" className="timetable-link" onClick={() => { setChangingKey(true); setStep("key"); }}>更换 API Key</button>}</header>

      {step === "loading" && <p className="planner-dialog-note">正在准备…</p>}

      {step === "key" && <form className="timetable-key" onSubmit={(event) => { event.preventDefault(); void saveKey(); }}>
        <p>识别课表会用你自己的 DeepSeek API Key（在 DeepSeek 开放平台创建）。Key 只保存在这台{desktop ? "电脑上，并用系统加密" : "浏览器里"}，不会进入游戏存档、备份或同步。识别一张课表一般只花几分钱。</p>
        <label className="planner-field"><span>DeepSeek API Key</span><input type="password" autoComplete="off" spellCheck={false} value={keyDraft} placeholder="sk-…" onChange={(event) => { setKeyDraft(event.target.value); setError(""); }} autoFocus /></label>
        {error && <p className="planner-dialog-error" role="alert">{error}</p>}
        <footer>
          {changingKey && <button type="button" className="danger" onClick={() => { void aiKey.clear().then(() => { setChangingKey(false); setKeyDraft(""); setStep("key"); }); }}>删除已保存的 Key</button>}
          <span />
          <button type="button" onClick={() => { if (changingKey) { setChangingKey(false); setError(""); setStep("pick"); } else onClose(); }}>取消</button>
          <button type="submit" className="primary" disabled={!keyDraft.trim()}>保存并继续</button>
        </footer>
      </form>}

      {(step === "pick" || step === "busy") && <div className="timetable-pick">
        <button type="button" className={`timetable-drop ${dropping ? "dropping" : ""} ${image ? "has-image" : ""}`} disabled={step === "busy"} onClick={() => fileRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDropping(true); }} onDragLeave={() => setDropping(false)}
          onDrop={(event) => { event.preventDefault(); setDropping(false); void choose(event.dataTransfer.files[0]); }}>
          {image ? <img src={image.dataUrl} alt="待识别的课表截图" /> : <span><b>点这里选择课表截图</b><small>也可以把图片拖进来，或者截图后直接按 Ctrl+V 粘贴</small></span>}
          {step === "busy" && <i className="timetable-scan" aria-hidden="true" />}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
        {!hasSemester && step === "pick" && <label className="planner-field timetable-week"><span>本周是第几周（用来计算课程周次，可以稍后在设置里填）</span><input type="number" min={1} max={30} value={weekDraft} placeholder="比如 10" onChange={(event) => setWeekDraft(event.target.value)} /></label>}
        {step === "busy" && <p className="timetable-busy" role="status">DeepSeek 正在读课表，一般需要 10–40 秒…</p>}
        {error && <p className="planner-dialog-error" role="alert">{error}</p>}
        <footer>
          <span />
          {step === "busy"
            ? <button type="button" onClick={() => abortRef.current?.abort()}>取消识别</button>
            : <><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={!image} onClick={() => void recognize()}>开始识别</button></>}
        </footer>
      </div>}

      {step === "confirm" && <div className="timetable-confirm">
        <p className="planner-dialog-note">识别出 {rows.length} 项，请逐行核对后再导入。黄色的行需要特别留意；和日程本里已有课程重复的行默认不导入。</p>
        {warnings.length > 0 && <ul className="timetable-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <div className="timetable-table" role="table" aria-label="识别出的课程">
          <div className="timetable-row head" role="row"><span>导入</span><span>课程</span><span>星期</span><span>上课</span><span>下课</span><span>地点</span><span>周次</span><span>单双周</span></div>
          {rows.map((row) => {
            const problem = validateImportRow(row);
            return <div key={row.id} className={`timetable-row ${row.issue ? "uncertain" : ""} ${row.duplicate ? "duplicate" : ""} ${problem ? "invalid" : ""} ${row.include ? "" : "skipped"}`} role="row">
              <label className="timetable-check"><input type="checkbox" checked={row.include} onChange={(event) => updateRow(row.id, { include: event.target.checked })} aria-label={`导入${row.title}`} /></label>
              <input value={row.title} maxLength={40} aria-label="课程名" onChange={(event) => updateRow(row.id, { title: event.target.value })} />
              <select value={row.weekday} aria-label="星期" onChange={(event) => updateRow(row.id, { weekday: Number(event.target.value) })}>{WEEKDAY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input type="time" value={row.startTime} aria-label="上课时间" onChange={(event) => updateRow(row.id, { startTime: event.target.value })} />
              <input type="time" value={row.endTime} aria-label="下课时间" onChange={(event) => updateRow(row.id, { endTime: event.target.value })} />
              <input value={row.location} maxLength={40} placeholder="—" aria-label="地点" onChange={(event) => updateRow(row.id, { location: event.target.value })} />
              <span className="timetable-weeks"><input type="number" min={1} max={30} value={row.startWeek} aria-label="开始周" onChange={(event) => updateRow(row.id, { startWeek: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} />–<input type="number" min={1} max={30} value={row.endWeek} aria-label="结束周" onChange={(event) => updateRow(row.id, { endWeek: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /></span>
              <select value={row.parity} aria-label="单双周" onChange={(event) => updateRow(row.id, { parity: event.target.value as WeekParity })}>{PARITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              {(row.issue || row.duplicate || problem) && <small className="timetable-issue">{[problem, row.duplicate ? "日程本里已有这门课" : "", row.issue].filter(Boolean).join(" · ")}</small>}
            </div>;
          })}
        </div>
        {error && <p className="planner-dialog-error" role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={() => { setRows([]); setWarnings([]); setError(""); setStep("pick"); }}>换一张截图</button>
          <span />
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={!importable.length} onClick={finish}>导入 {importable.length} 门课</button>
        </footer>
      </div>}
    </section>
  </div>;
}
