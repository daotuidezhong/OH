import { useLayoutEffect, useRef } from "react";
import { getEatingFrame, type BowlState, type FeedingState } from "./feeding";
import type { Point } from "./furniture";
import { drawFeedingPose, FEEDING_CANVAS, getCatFeedingRig, getFeedingPose } from "./feeding-pose";

const originalImages = new Map<string, HTMLImageElement>();

export function FoodBowl({ state, position, onClick, disabled }: { state: BowlState; position: Point; onClick: () => void; disabled: boolean }) {
  return <button type="button" className="food-bowl" data-interactive data-scene-depth="bowl" data-bowl-state={state}
    style={{ left: `${position.x}%`, top: `${position.y}%` }} onClick={onClick} disabled={disabled}
    aria-label={state === "empty" ? "空食物碗，选择食物投喂" : "食物碗，猫咪正在用餐"}>
    <img src="/game/food-bowl-empty.png" alt="" draggable={false} />
    {state === "filled" && <svg className="bowl-food" viewBox="0 0 60 24" shapeRendering="crispEdges" aria-hidden="true">
      <path fill="#5c3525" d="M6 10h6V6h12V2h18v4h9v6h5v8H6z" />
      <path fill="#a96c38" d="M8 10h8v6H8zm12-4h8v7h-8zm13-2h7v7h-7zm10 6h8v7h-8zm-18 4h9v7h-9z" />
      <path fill="#d49a54" d="M9 10h5v2H9zm12-4h5v2h-5zm13-2h5v2h-5zm10 6h5v2h-5zm-18 4h6v2h-6z" />
    </svg>}
  </button>;
}

export function EatingSprite({ feeding }: { feeding: FeedingState }) {
  const frame = getEatingFrame(feeding);
  const pose = getFeedingPose(feeding);
  const asset = getCatFeedingRig(feeding.petId).asset;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context || !canvas) return;
    let image = originalImages.get(asset);
    if (!image) { image = new Image(); image.src = asset; originalImages.set(asset, image); }
    const loadedImage = image;
    const draw = () => drawFeedingPose(context, loadedImage, feeding.petId, pose);
    if (image.complete && image.naturalWidth) draw();
    else image.addEventListener("load", draw, { once: true });
    return () => image.removeEventListener("load", draw);
  }, [asset, feeding.petId, pose.angle, pose.jaw]);
  return <canvas ref={canvasRef} width={FEEDING_CANVAS.width} height={FEEDING_CANVAS.height} className="cat-base cat-eating-sprite" role="img" aria-label={feeding.phase === "FINISH_EATING" ? "猫咪吃完抬头" : "猫咪低头咀嚼"}
    data-eating-frame={frame} data-source-asset={asset} data-pose-angle={pose.angle.toFixed(2)} />;
}
