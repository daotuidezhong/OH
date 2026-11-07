import { useMemo, type CSSProperties } from "react";
import { PRIORITY_LABELS, type PlannerColor, type PlannerItem } from "./planner";

const SHRED_SLICES = 14;
const CONFETTI_COLORS = ["#e95d68", "#f0c45f", "#89ad83", "#72b7e2", "#b38ad6", "#f39a52"];
export const SHRED_FEED_MS = 1500;

function seeded(seed: number) {
  let value = seed % 2147483647 || 1;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

/** The static look of a card, reused by the draggable card and by every slice of a shredded copy. */
export function CardFace({ item, focusLabel, className = "", style }: { item: PlannerItem; focusLabel?: boolean; className?: string; style?: CSSProperties }) {
  return <span className={`planner-card planner-card-face planner-color-${item.color} ${item.kind} ${className}`} style={style}>
    <span className="planner-card-top"><b>{item.title}</b>{item.startTime && <time>{item.startTime}</time>}</span>
    <span className="planner-card-meta">
      <span>{item.kind === "course" ? "🎓 课程" : "✏️ 任务"}</span>
      {item.priority && <span className={`planner-tag ${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>}
      {item.location && <span className="planner-card-location">{item.location}</span>}
      {focusLabel && <span className="planner-focus">🍊 {item.pomodoros ? `×${item.pomodoros}` : "专注"}</span>}
    </span>
  </span>;
}

function useSlices(seed: number, count = SHRED_SLICES) {
  return useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: count }, (_, index) => {
      const left = index / count * 100;
      const right = 100 - (index + 1) / count * 100;
      const side = index / (count - 1) - .5;
      return {
        clipPath: `inset(0 ${right}% 0 ${left}%)`,
        "--slice-index": index,
        "--slice-spread": `${side * (10 + random() * 14)}px`,
        "--slice-curl": `${(random() - .5) * 34 + side * 18}deg`,
        "--slice-drop": `${36 + random() * 46}px`,
        "--slice-delay": `${Math.round(random() * 140 + Math.abs(side) * 90)}ms`,
      } as CSSProperties;
    });
  }, [seed, count]);
}

/**
 * A card cut into vertical slices of its own artwork. Each slice is a full copy clipped to one strip
 * (the clone-and-clip technique), so the falling strips keep the card's real text and colours.
 */
export function SlicedCard({ item, seed, mode }: { item: PlannerItem; seed: number; mode: "in-place" | "feed" }) {
  const slices = useSlices(seed);
  return <span className={`planner-sliced ${mode}`} aria-hidden="true">
    <CardFace item={item} className="planner-sliced-sizer" focusLabel={item.kind === "task"} />
    {slices.map((style, index) => <span key={index} className="planner-slice" style={style}><CardFace item={item} focusLabel={item.kind === "task"} /></span>)}
    {mode === "in-place" && <span className="planner-shred-flecks">{slices.slice(0, 8).map((_, index) => <i key={index} className={`planner-color-${item.color}`} style={{ "--fleck-x": `${(index - 3.5) * 9}px`, "--fleck-delay": `${index * 45}ms` } as CSSProperties} />)}</span>}
  </span>;
}

export type ShredFeedGeometry = { slotX: number; slotY: number; slotWidth: number; exitY: number; binBottom: number; width: number; height: number };

/**
 * Feeds a card into the shredder slot: above the slot it is still whole, below the slot only slices come out,
 * curl apart and drop into the bin.
 */
export function ShredderFeed({ item, seed, geometry }: { item: PlannerItem; seed: number; geometry: ShredFeedGeometry }) {
  const scale = Math.min(1, geometry.slotWidth / geometry.width);
  const width = geometry.width * scale;
  const height = geometry.height * scale;
  const frame = { left: geometry.slotX - width / 2, width } as const;
  const inner = { width: geometry.width, height: geometry.height, scale: `${scale}`, transformOrigin: "0 0" } as CSSProperties;
  return <div className="planner-shred-feed" style={{ "--feed-height": `${height}px` } as CSSProperties} aria-hidden="true">
    <div className="feed-above" style={{ ...frame, top: geometry.slotY - height, height }}>
      <div className="feed-travel"><span style={inner}><CardFace item={item} focusLabel={item.kind === "task"} style={{ width: "100%", height: "100%" }} /></span></div>
    </div>
    {/* Inside the head the paper is hidden; it reappears below the cutting teeth already in slices. */}
    <div className="feed-below" style={{ ...frame, left: frame.left - 24, width: width + 48, top: geometry.exitY, height: geometry.binBottom - geometry.exitY }}>
      <div className="feed-travel" style={{ left: 24, top: geometry.slotY - geometry.exitY - height, width, height }}><span style={inner}><SlicedCard item={item} seed={seed} mode="feed" /></span></div>
    </div>
  </div>;
}

/** A one-shot confetti burst centred on a point in the viewport. */
export function ConfettiBurst({ x, y, seed }: { x: number; y: number; seed: number }) {
  const pieces = useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: 28 }, (_, index) => {
      const angle = -Math.PI / 2 + (random() - .5) * Math.PI * 1.25;
      const distance = 90 + random() * 170;
      return {
        background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        "--confetti-x": `${Math.cos(angle) * distance}px`,
        "--confetti-y": `${Math.sin(angle) * distance}px`,
        "--confetti-fall": `${120 + random() * 160}px`,
        "--confetti-spin": `${(random() - .5) * 900}deg`,
        "--confetti-delay": `${random() * 90}ms`,
        width: `${5 + random() * 5}px`,
        height: `${8 + random() * 7}px`,
        borderRadius: index % 5 === 0 ? "50%" : "1px",
      } as CSSProperties;
    });
  }, [seed]);
  return <div className="planner-confetti" style={{ left: x, top: y }} aria-hidden="true">
    {pieces.map((style, index) => <i key={index} style={style} />)}
  </div>;
}

export function Shredder({ hot, busy, pile }: { hot: boolean; busy: boolean; pile: PlannerColor[] }) {
  return <span className={`planner-shredder ${hot ? "hot" : ""} ${busy ? "busy" : ""}`} aria-hidden="true">
    <span className="shredder-head"><i className="shredder-slot" /><i className="shredder-rollers" /><i className="shredder-led" /></span>
    <span className="shredder-teeth" />
    <span className="shredder-bin">{pile.slice(-24).map((color, index) => <i key={index} className={`planner-color-${color}`} style={{ left: `${4 + (index * 37) % 90}%`, height: `${9 + (index * 7) % 15}px`, rotate: `${(index * 23) % 50 - 25}deg`, zIndex: index }} />)}</span>
  </span>;
}

export function DoneFolder({ hot, swallowing, count }: { hot: boolean; swallowing: boolean; count: number }) {
  return <span className={`planner-folder ${hot ? "hot" : ""} ${swallowing ? "swallowing" : ""}`} aria-hidden="true">
    <span className="folder-tab" /><span className="folder-back" />
    <span className="folder-sheet" /><span className="folder-sheet two" />
    <span className="folder-front">完成啦</span>
    {count > 0 && <b className="folder-count">{count > 99 ? "99+" : count}</b>}
  </span>;
}
