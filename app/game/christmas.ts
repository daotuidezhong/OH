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

// Bulb centres on the garland along the top wall, in room percentages. The three
// lighting variants share one layout, so one list drives the twinkle for all of them.
export const CHRISTMAS_GARLAND_BULBS: readonly (readonly [x: number, y: number])[] = [
  [3.3, 2.3], [3.5, 4.2], [3.9, 1.5], [6.2, 2], [7.1, 4.1], [11.2, 3.5], [12.2, 3.6], [13.9, 1.1], [15.4, 3.2], [16.6, 1.8], [16.9, 3.1], [17.7, 2.5], [18.4, 2.1], [20.8, 4.5], [21, 1.1], [21.9, 3.5], [22.4, 3.2], [23.8, 1.2], [24.8, 4.5], [27.3, 2.6], [27.9, 4.1], [28.1, 3.4], [29.5, 1.3], [30.4, 3.1], [34.1, 2.9], [34.8, 1.2], [35.9, 4.2], [37.3, 2.2], [38, 1.9], [38.5, 4.1], [39.8, 3.9], [41, 2.3], [42.2, 0.3], [42.2, 4.6], [45.2, 1.1], [45.5, 3.2], [46.3, 2.5], [47.4, 4.5], [51.9, 2.9], [53, 4.7], [53.4, 1.8], [53.6, 3.2], [56.6, 2.1], [57.6, 3.8], [58.3, 1.1], [58.3, 3.9], [58.9, 4.4], [60.1, 3.6], [61.6, 4.8], [62.4, 1.2], [63.8, 2.6], [70.6, 2.7], [70.7, 1.2], [72.4, 2.8], [72.5, 4.1], [74.1, 2.1], [74.6, 1.7], [75.7, 3.7], [77.5, 4.1], [78.3, 3.4], [78.9, 2.8], [79.5, 3.3], [80.6, 1.1], [83.4, 2.2], [83.5, 1.1], [84.1, 4.5], [84.9, 4.1], [85.1, 2], [85.6, 3.3], [86.5, 2.4], [87.2, 1.8], [87.8, 1.2], [88.5, 4.3], [91.7, 2.6], [92.5, 4.1], [93.1, 4.2], [94.8, 2.2], [95.7, 4.7], [96.7, 2.5], [97.4, 4.7],
];

// The tree and its gifts are painted into the room art. This outline (room
// percentages) cuts the same pixels into a layer that sorts by depth, so a cat or
// furniture behind the tree is hidden by it instead of being drawn on top of it.
export const CHRISTMAS_TREE_OUTLINE: readonly (readonly [x: number, y: number])[] = [
  [38.1, 8.7], [39.4, 11.4], [41.3, 12.3], [40.2, 13.8], [40.5, 16.6], [39.6, 18.2], [41.2, 19.5], [41.5, 22.5], [42.5, 26.5], [42.8, 30], [43.7, 35], [44.5, 40], [45.1, 45], [45.9, 50], [46.7, 55], [47, 58.6], [49.5, 58.6], [50.9, 60.3], [50.9, 69.5], [46.9, 69.5], [46.9, 71.4], [42, 71.6], [39.1, 71.6], [38.9, 69.1], [35, 69.2], [35, 71.9], [31.3, 71.9], [31.3, 69.3], [27.6, 69.3], [27.6, 61.2], [28.9, 60], [29.6, 55], [30.8, 50], [32, 45], [32.7, 40], [33, 35], [34, 30], [34.4, 26.5], [35.1, 22.5], [35.3, 19.5], [36.8, 18.2], [35.9, 16.6], [36.2, 13.8], [35, 12.3], [37, 11.4],
];

// Layer box around the outline. Depth sorting reads the ground 94% down the box,
// which lands on the tree's base (about 70%).
export const CHRISTMAS_TREE_BOX = { left: 27.4, top: 8.5, width: 23.7, height: 65.4 };
