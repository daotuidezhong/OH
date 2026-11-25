import type { SceneId } from "./scene";
import type { TimePeriod } from "./time-period";

const CHRISTMAS_ASSETS = "/game/christmas";

export const CHRISTMAS_ROOM_FALLBACK = `${CHRISTMAS_ASSETS}/room.webp`;
export const CHRISTMAS_MUSIC = "/music/christmas-background.m4a";

export function getChristmasSceneAsset(scene: SceneId | "forest", period: TimePeriod) {
  if (scene === "yard") return `${CHRISTMAS_ASSETS}/yard.webp`;
  return `${CHRISTMAS_ASSETS}/${scene}-${period === "night" ? "evening" : period}.webp`;
}

export const CHRISTMAS_FURNITURE_ASSETS = `${CHRISTMAS_ASSETS}/furniture`;

export const christmasFoods = [
  { id: "christmasFishGift", name: "圣诞小鱼礼盒", detail: "莓红礼盒里装着香脆小鱼干", price: 14, energy: 15, asset: `${CHRISTMAS_ASSETS}/food/fish-gift-box.webp` },
  { id: "christmasCatnipFlakes", name: "雪花猫薄荷饼", detail: "烤成雪花形的猫薄荷小饼", price: 17, energy: 18, asset: `${CHRISTMAS_ASSETS}/food/snowflake-catnip-biscuits.webp` },
  { id: "christmasChickenSnowman", name: "雪人鸡肉慕斯", detail: "一只软乎乎的鸡肉小雪人", price: 21, energy: 23, asset: `${CHRISTMAS_ASSETS}/food/snowman-chicken-mousse.webp` },
  { id: "christmasChickenBells", name: "铃铛冻干鸡", detail: "金色小铃铛，咬起来咔嚓脆", price: 23, energy: 25, asset: `${CHRISTMAS_ASSETS}/food/bell-chicken-bites.webp` },
  { id: "christmasSalmonRoll", name: "松枝三文鱼卷", detail: "用鱼肉和鱼泥卷成的小树桩", price: 26, energy: 28, asset: `${CHRISTMAS_ASSETS}/food/salmon-yule-roll.webp` },
  { id: "christmasTunaTree", name: "圣诞树金枪鱼饭", detail: "鱼肉碎叠成小树，顶着一颗金色小星", price: 28, energy: 30, asset: `${CHRISTMAS_ASSETS}/food/christmas-tree-tuna-rice.webp` },
] as const;

export type ChristmasFoodId = (typeof christmasFoods)[number]["id"];
