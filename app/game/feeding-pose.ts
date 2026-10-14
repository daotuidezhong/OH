import { getEatingFrame, type FeedingState } from "./feeding.ts";

export const FEEDING_CANVAS = { width: 512, height: 418 };
const HEAD_ANGLE = 48;
// Hold each pose for the existing sprite frame's duration, without tweening.
const FEEDING_POSES = [
  { angle: 0, jaw: 0 },
  { angle: HEAD_ANGLE / 2, jaw: 0 },
  { angle: HEAD_ANGLE, jaw: 0 },
  { angle: HEAD_ANGLE - .5, jaw: 2 },
];
const ORIGINAL_SIZE = 418;
const RIGS = {
  mitao: { asset: "/game/cat-orange-idle.png", pivot: { x: 286, y: 236 }, mouth: { x: 414, y: 230 }, head: "M245 0H418V247L328 269L286 250L245 204Z", jaw: "M388 228H418V247H394L383 241Z" },
  doubao: { asset: "/game/cat-cow-idle.png", pivot: { x: 280, y: 211 }, mouth: { x: 414, y: 215 }, head: "M245 0H418V225L330 248L280 224L245 180Z", jaw: "M386 211H418V231H394L383 224Z" },
  xueqiu: { asset: "/game/cat-white-idle.png", pivot: { x: 280, y: 184 }, mouth: { x: 414, y: 195 }, head: "M245 0H418V201L330 224L280 199L245 153Z", jaw: "M386 189H418V209H394L383 202Z" },
};

export function getCatFeedingRig(petId: string) {
  return RIGS[petId as keyof typeof RIGS] ?? RIGS.mitao;
}

export function getFeedingPose(state: Pick<FeedingState, "phase" | "elapsed">) {
  return FEEDING_POSES[getEatingFrame(state)];
}

export function getFeedingDockOffset(petId: string, catWidth: number, bowlWidth: number) {
  const { pivot, mouth } = getCatFeedingRig(petId);
  const radians = HEAD_ANGLE * Math.PI / 180;
  const dx = mouth.x - pivot.x;
  const dy = mouth.y - pivot.y;
  const x = pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians);
  const y = pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians);
  // Eat from the near edge, leaving the front paws beside the bowl rather than under it.
  return { x: (x / ORIGINAL_SIZE - .5) * catWidth + bowlWidth * .22, y: (y / ORIGINAL_SIZE - .79) * catWidth + bowlWidth * .16 };
}

// Reuse the original pixels at their native scale. Only the head and lower jaw
// articulate; the torso, feet, tail and markings never scale or change shape.
export function drawFeedingPose(context: CanvasRenderingContext2D, image: HTMLImageElement, petId: string, pose: ReturnType<typeof getFeedingPose>) {
  context.clearRect(0, 0, FEEDING_CANVAS.width, FEEDING_CANVAS.height);
  context.imageSmoothingEnabled = false;
  if (pose.angle === 0 && pose.jaw === 0) { context.drawImage(image, 0, 0); return; }
  const rig = getCatFeedingRig(petId);
  const head = new Path2D(rig.head);
  context.save();
  context.clip(new Path2D(`M0 0H512V418H0Z${rig.head}`), "evenodd");
  context.drawImage(image, 0, 0);
  context.restore();
  // Preserve the shoulder under the rotating neck to avoid a seam or a gap.
  context.save();
  context.beginPath(); context.arc(rig.pivot.x, rig.pivot.y, 36, 0, Math.PI * 2); context.clip();
  context.drawImage(image, 0, 0);
  context.restore();
  context.save();
  context.translate(rig.pivot.x, rig.pivot.y);
  context.rotate(pose.angle * Math.PI / 180);
  context.translate(-rig.pivot.x, -rig.pivot.y);
  context.clip(head);
  context.save();
  context.clip(new Path2D(`${rig.head}${rig.jaw}`), "evenodd");
  context.drawImage(image, 0, 0);
  context.restore();
  context.translate(0, pose.jaw);
  context.clip(new Path2D(rig.jaw));
  context.drawImage(image, 0, 0);
  context.restore();
}
