import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PhotoBoardScrollbar from "./PhotoBoardScrollbar";
import type { PhotoBoardPhoto } from "./types";

type Props = {
  open: boolean; origin: DOMRect | null; photos: PhotoBoardPhoto[]; uploadingId: string | null; uploadingBusy?: boolean; deletingId: string | null;
  photoUrl: (photo: PhotoBoardPhoto) => string; onClose: () => void; onUpload: (file: File) => void; onDesktopUpload?: () => void;
  onDelete: (photo: PhotoBoardPhoto) => void; onUpdateCaption: (photoId: string, caption: string) => void;
};
type ViewerState = { id: string; origin: DOMRect };

function photoOrientation(photo: PhotoBoardPhoto) {
  const ratio = photo.width / photo.height;
  if (ratio > 1.12) return "landscape";
  if (ratio < .88) return "portrait";
  return "square";
}

function BoardRope({ className }: { className: string }) {
  return <svg className={`photo-board-rope ${className}`} viewBox="0 0 1000 22" preserveAspectRatio="none" aria-hidden="true">
    <path className="rope-shadow" d="M0 3 C240 5 300 15 500 13 S760 5 1000 4" />
    <path d="M0 2 C240 4 300 14 500 12 S760 4 1000 3" />
  </svg>;
}

function blurCaption(container: HTMLElement | null) {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement && container?.contains(active)) active.blur();
}

function CaptionEditor({ photo, viewer = false, onSave }: { photo: PhotoBoardPhoto; viewer?: boolean; onSave: (caption: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(photo.caption ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancellingRef = useRef(false);
  useEffect(() => {
    const input = inputRef.current;
    if (editing && input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }, [editing]);

  const save = () => {
    const caption = draft.trim().slice(0, 80);
    if (caption !== (photo.caption ?? "")) onSave(caption);
    setDraft(caption);
    setEditing(false);
  };
  const cancel = () => { cancellingRef.current = true; setDraft(photo.caption ?? ""); setEditing(false); };
  const finishBlur = () => { if (cancellingRef.current) { cancellingRef.current = false; return; } save(); };

  return <div className={`photo-caption-area ${viewer ? "viewer-caption" : ""} ${editing ? "editing" : ""}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    {editing
      ? <textarea ref={inputRef} value={draft} maxLength={80} rows={2} aria-label="照片说明" onChange={(event) => setDraft(event.target.value)} onBlur={finishBlur} onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); cancel(); inputRef.current?.blur(); }
        else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); inputRef.current?.blur(); }
      }} />
      : <button type="button" className={photo.caption ? "has-caption" : "caption-placeholder"} onClick={() => { setDraft(photo.caption ?? ""); setEditing(true); }} aria-label={photo.caption ? "编辑照片说明" : "添加照片说明"}>{photo.caption || "添加说明…"}</button>}
  </div>;
}

function PhotoViewer({ photo, src, origin, onClosed, onUpdateCaption }: { photo: PhotoBoardPhoto; src: string; origin: DOMRect; onClosed: () => void; onUpdateCaption: (caption: string) => void }) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState<"origin" | "fallback" | null>(null);
  const ratio = Math.max(.08, photo.width / photo.height);
  const maximumWidth = window.innerWidth * .86;
  const maximumHeight = window.innerHeight * .79;
  const imageWidth = Math.min(maximumWidth, maximumHeight * ratio);
  const imageHeight = imageWidth / ratio;

  const setOriginTransform = (rect: DOMRect) => {
    const paper = paperRef.current;
    if (!paper) return;
    const target = paper.getBoundingClientRect();
    paper.style.setProperty("--viewer-from-x", `${rect.left + rect.width / 2 - (target.left + target.width / 2)}px`);
    paper.style.setProperty("--viewer-from-y", `${rect.top + rect.height / 2 - (target.top + target.height / 2)}px`);
    paper.style.setProperty("--viewer-from-scale-x", `${Math.max(.04, rect.width / target.width)}`);
    paper.style.setProperty("--viewer-from-scale-y", `${Math.max(.04, rect.height / target.height)}`);
  };

  useLayoutEffect(() => {
    setOriginTransform(origin);
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [origin]);

  const closeViewer = () => {
    if (closing) return;
    blurCaption(paperRef.current);
    const card = document.querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(photo.id)}"] .photo-board-card`);
    const viewport = card?.closest<HTMLElement>(".photo-board-viewport");
    const rect = card?.getBoundingClientRect();
    const viewportRect = viewport?.getBoundingClientRect();
    const visible = Boolean(rect && viewportRect && rect.right > viewportRect.left && rect.left < viewportRect.right && rect.bottom > viewportRect.top && rect.top < viewportRect.bottom);
    if (rect && visible) { setOriginTransform(rect); setClosing("origin"); window.setTimeout(onClosed, 400); }
    else { setClosing("fallback"); window.setTimeout(onClosed, 260); }
  };

  return <div className={`photo-viewer ${ready ? "ready" : ""} ${closing ? `closing-${closing}` : ""}`} role="dialog" aria-modal="true" aria-label="照片大图" onPointerDown={(event) => { event.stopPropagation(); closeViewer(); }}>
    <div ref={paperRef} className="photo-viewer-paper" style={{ width: imageWidth + 20 } as React.CSSProperties} onPointerDown={(event) => event.stopPropagation()}>
      <img src={src} alt="生活照片大图" style={{ width: imageWidth, height: imageHeight }} />
      <CaptionEditor photo={photo} viewer onSave={onUpdateCaption} />
      <button type="button" aria-label="关闭大图" onClick={closeViewer}>×</button>
    </div>
  </div>;
}

export default function PhotoBoardOverlay({ open, origin, photos, uploadingId, uploadingBusy = false, deletingId, photoUrl, onClose, onUpload, onDesktopUpload, onDelete, onUpdateCaption }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const viewerPhoto = photos.find((photo) => photo.id === viewer?.id) ?? null;
  const selectedPhoto = photos.find((photo) => photo.id === selectedId) ?? null;
  const maxSlot = photos.reduce((maximum, photo) => Math.max(maximum, photo.slot), -1);
  const columnCount = Math.max(5, Math.ceil((maxSlot + 1) / 2));
  const contentWidth = useMemo(() => `max(100%, ${columnCount * 238 + 76}px)`, [columnCount]);
  const uploadInProgress = uploadingBusy || Boolean(uploadingId);
  const startUpload = () => { if (!uploadInProgress) { if (onDesktopUpload) onDesktopUpload(); else inputRef.current?.click(); } };
  const closeBoard = () => { blurCaption(layerRef.current); setSelectedId(null); setViewer(null); setConfirming(false); onClose(); };

  useEffect(() => {
    if (!uploadingId) return;
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(uploadingId)}"]`);
    if (viewport && target) viewport.scrollTo({ left: Math.max(0, target.offsetLeft - viewport.clientWidth * .55), behavior: "smooth" });
  }, [uploadingId]);

  if (!open) return null;
  const originX = origin ? origin.left + origin.width / 2 : window.innerWidth * .65;
  const originY = origin ? origin.top + origin.height / 2 : window.innerHeight * .42;
  return <div ref={layerRef} className="photo-board-layer" role="presentation" onPointerDown={closeBoard}>
    <section className="photo-board-overlay" role="dialog" aria-modal="true" aria-label="照片板" style={{ "--board-origin-x": `${originX}px`, "--board-origin-y": `${originY}px` } as React.CSSProperties} onPointerDown={(event) => event.stopPropagation()}>
      <header><span><b>照片板</b><small>把生活里的小小美好，别在这里</small></span><button type="button" onClick={closeBoard} aria-label="关闭照片板">×</button></header>
      <div ref={viewportRef} className="photo-board-viewport" onWheel={(event) => { const viewport = event.currentTarget; if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && viewport.scrollWidth > viewport.clientWidth) viewport.scrollLeft += event.deltaY * .7; }}>
        <div className="photo-board-content" style={{ width: contentWidth }}>
          <BoardRope className="rope-one" /><BoardRope className="rope-two" />
          <img className="photo-board-decor decor-lamp" src="/game/furniture-lamp.png" alt="" aria-hidden="true" />
          <img className="photo-board-decor decor-plant" src="/game/furniture-plant.png" alt="" aria-hidden="true" />
          {photos.map((photo) => <div className={`photo-board-slot ${photoOrientation(photo)} ${selectedId === photo.id ? "selected" : ""} ${uploadingId === photo.id ? "uploading" : ""} ${deletingId === photo.id ? "deleting" : ""}`} data-photo-id={photo.id} key={photo.id} style={{ "--slot-column": Math.floor(photo.slot / 2), "--slot-row": photo.slot % 2, "--photo-rotation": `${photo.rotation}deg` } as React.CSSProperties}>
            <i className="photo-board-clip" />
            <div className="photo-board-card">
              <button type="button" className="photo-image-button" onClick={(event) => { setSelectedId(photo.id); const card = event.currentTarget.closest<HTMLElement>(".photo-board-card"); if (card) setViewer({ id: photo.id, origin: card.getBoundingClientRect() }); }} aria-label="查看照片大图"><img src={photoUrl(photo)} alt="生活照片" loading="lazy" /></button>
              <CaptionEditor photo={photo} onSave={(caption) => onUpdateCaption(photo.id, caption)} />
            </div>
          </div>)}
          {!photos.length && <div className="photo-board-empty"><p>把第一张生活照片挂在这里吧</p><button type="button" disabled={uploadInProgress} onClick={startUpload}>{uploadInProgress ? "正在上传…" : "上传照片"}</button></div>}
        </div>
      </div>
      <PhotoBoardScrollbar viewportRef={viewportRef} />
      <footer><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadInProgress} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file && !uploadInProgress) onUpload(file); }} /><button type="button" className="primary-button" disabled={uploadInProgress} onClick={startUpload}>{uploadInProgress ? "正在上传…" : "上传照片"}</button><button type="button" disabled={!selectedPhoto || Boolean(deletingId)} onClick={() => setConfirming(true)}>删除照片</button></footer>
      {confirming && selectedPhoto && <div className="photo-board-confirm" role="alertdialog" aria-label="确认删除照片"><p>要把这张照片取下来吗？</p><span><button type="button" onClick={() => setConfirming(false)}>再留一会儿</button><button type="button" onClick={() => { setConfirming(false); onDelete(selectedPhoto); }}>取下照片</button></span></div>}
    </section>
    {viewer && viewerPhoto && <PhotoViewer photo={viewerPhoto} src={photoUrl(viewerPhoto)} origin={viewer.origin} onClosed={() => setViewer(null)} onUpdateCaption={(caption) => onUpdateCaption(viewerPhoto.id, caption)} />}
  </div>;
}
