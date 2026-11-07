import { pixelIconDataUrl } from "./pixel-sprites.ts";

type Point = { x: number; y: number };

const BERRY_SIZE = 22;
export const POP_MS = 170;
export const TRAVEL_MS = 640;
const PATH_SAMPLES = 28;
const STAGGER_MS = 55;

function quadratic(start: Point, control: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * start.x + 2 * u * t * control.x + t * t * end.x, y: u * u * start.y + 2 * u * t * control.y + t * t * end.y };
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Keyframes for one berry: a short pop out of the origin, then a smooth arc into the counter.
 * The arc is sampled densely with linear timing so the compositor can run it without kinks.
 */
export function berryKeyframes(from: Point, to: Point, index: number, count: number): Keyframe[] {
  const side = count > 1 ? index / (count - 1) - .5 : 0;
  const popped = { x: side * 34, y: -26 - (index % 2) * 10 };
  const start = { x: from.x + popped.x, y: from.y + popped.y };
  const control = { x: (start.x + to.x) / 2 + side * 40, y: Math.min(start.y, to.y) - 110 - Math.abs(side) * 40 };
  const total = POP_MS + TRAVEL_MS;
  const frames: Keyframe[] = [{ offset: 0, transform: "translate3d(0, 0, 0) scale(.3)", opacity: 0 }];
  for (let step = 1; step <= 4; step += 1) {
    const t = easeOutCubic(step / 4);
    frames.push({ offset: (POP_MS * step / 4) / total, transform: `translate3d(${popped.x * t}px, ${popped.y * t}px, 0) scale(${.3 + .85 * t})`, opacity: Math.min(1, t * 1.6) });
  }
  for (let step = 1; step <= PATH_SAMPLES; step += 1) {
    const progress = step / PATH_SAMPLES;
    const point = quadratic(start, control, to, easeInOutSine(progress));
    const scale = 1.15 - .6 * progress ** 2;
    frames.push({ offset: (POP_MS + TRAVEL_MS * progress) / total, transform: `translate3d(${point.x - from.x}px, ${point.y - from.y}px, 0) scale(${scale.toFixed(3)})`, opacity: progress > .92 ? .85 : 1 });
  }
  return frames;
}

/**
 * Flies strawberries from where a reward was earned to the counter without touching React state,
 * so the large game page never re-renders mid-flight.
 */
export function launchRewardFlight(from: Point, counter: HTMLElement, amount: number) {
  const rect = counter.getBoundingClientRect();
  const to = { x: rect.left + 24, y: rect.top + rect.height / 2 };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = reduce ? 0 : Math.min(6, Math.max(2, Math.ceil(amount / 2)));
  const layer = document.createElement("div");
  layer.className = "reward-flight";
  layer.setAttribute("aria-hidden", "true");
  const sprite = pixelIconDataUrl("strawberry");
  const berries = Array.from({ length: count }, () => {
    const berry = document.createElement("img");
    berry.className = "reward-berry";
    berry.src = sprite;
    berry.alt = "";
    berry.width = BERRY_SIZE;
    berry.height = BERRY_SIZE;
    berry.style.left = `${from.x - BERRY_SIZE / 2}px`;
    berry.style.top = `${from.y - BERRY_SIZE / 2}px`;
    layer.append(berry);
    return berry;
  });
  const label = document.createElement("b");
  label.className = "reward-amount";
  label.textContent = `+${amount}`;
  label.style.left = `${to.x}px`;
  label.style.top = `${to.y}px`;
  layer.append(label);
  document.body.append(layer);

  const landAt = reduce ? 0 : POP_MS + TRAVEL_MS + STAGGER_MS * (count - 1) - 60;
  // Start on the frame after the reward's own state updates have painted, so the first frames are not dropped.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const animations = berries.map((berry, index) => berry.animate(berryKeyframes(from, to, index, count), { duration: POP_MS + TRAVEL_MS, delay: index * STAGGER_MS, easing: "linear", fill: "both" }));
    animations.push(label.animate([
      { transform: "translate3d(-50%, -30%, 0) scale(.6)", opacity: 0 },
      { offset: .18, transform: "translate3d(-50%, -130%, 0) scale(1.12)", opacity: 1 },
      { offset: .7, transform: "translate3d(-50%, -170%, 0) scale(1)", opacity: 1 },
      { transform: "translate3d(-50%, -215%, 0) scale(1)", opacity: 0 },
    ], { duration: reduce ? 900 : 1100, delay: landAt, easing: "ease-out", fill: "both" }));
    const bump = [{ transform: "scale(1)" }, { offset: .35, transform: "scale(1.32)" }, { transform: "scale(1)" }];
    counter.querySelectorAll<HTMLElement>(":scope > span, :scope > b").forEach((part) => part.animate(bump, { duration: 450, delay: landAt, easing: "cubic-bezier(.2, 1.6, .4, 1)" }));
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => layer.remove());
  }));
  // Hidden tabs pause animation timelines, so never leave the layer behind if they do not finish.
  window.setTimeout(() => layer.remove(), landAt + 2600);
}
