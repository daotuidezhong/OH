import { spriteRuns, type PixelIconName } from "./pixel-sprites.ts";

export type { PixelIconName };
export { pixelIconDataUrl } from "./pixel-sprites.ts";

export default function PixelIcon({ name, size = 24, className = "" }: { name: PixelIconName; size?: number; className?: string }) {
  const runs = spriteRuns(name);
  return <svg className={`pixel-icon ${className}`} width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {runs.map((run) => <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} fill={run.color} />)}
  </svg>;
}
