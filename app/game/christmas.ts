import type { SceneId } from "./scene";
import type { TimePeriod } from "./time-period";

const CHRISTMAS_ASSETS = "/game/christmas";

export const CHRISTMAS_ROOM_FALLBACK = `${CHRISTMAS_ASSETS}/room.webp`;
export const CHRISTMAS_MUSIC = "/music/christmas-background.m4a";

export function getChristmasSceneAsset(scene: SceneId | "forest", period: TimePeriod) {
  if (scene === "yard") return `${CHRISTMAS_ASSETS}/yard.webp`;
  return `${CHRISTMAS_ASSETS}/${scene}-${period === "night" ? "evening" : period}.webp`;
}
