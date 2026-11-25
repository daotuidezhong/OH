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

// Garland bulbs on the yard: the house eave and the fence, in yard percentages.
export const YARD_GARLAND_BULBS: readonly (readonly [x: number, y: number])[] = [
  [2.1, 18.1], [4.7, 16.7], [7.3, 16.3], [12.8, 14.2], [15.4, 13.4], [18.4, 12.4], [20.3, 11.5], [22.2, 10.9],
  [23.9, 10.3], [23.9, 20.6], [25, 10.9], [25.2, 15.6], [25.7, 18.4], [25.9, 11.4], [31.4, 27.4], [35.3, 26.4],
  [35.6, 27.1], [38.1, 27.1], [39.9, 28.1], [41.5, 27.8], [42.4, 26.9], [43.3, 25.8], [45.8, 26.8], [46.7, 27.8],
  [48, 28.6], [49.1, 28.1], [50.2, 27.6], [54.2, 27.4], [55.1, 27.9], [56.2, 28.5], [56.9, 27.9], [57.7, 27.5],
  [58.2, 26.8], [59.4, 27.5], [60.8, 27.4], [65.4, 27], [67.4, 28.2], [68.5, 28.7], [69.5, 27.8], [70.3, 26.9],
  [74, 27.6], [74.7, 27.9], [76.7, 27.8], [77.5, 27.4],
];

// Fairy lights painted on the tree (room percentages). The particle layer lights these exact
// spots, so the sparkle follows the art instead of drawing a new tree.
export const CHRISTMAS_TREE_LIGHTS: readonly (readonly [x: number, y: number])[] = [
  [37.6, 19], [38.5, 20.4], [37.1, 21.4], [39.5, 21.5], [35.5, 23.3], [36, 23.5], [39.8, 23.9], [39.7, 24.2],
  [41.4, 24.6], [35, 24.8], [39.5, 25.3], [40.9, 26.4], [36.1, 26.9], [36.8, 27.4], [35.8, 27.9], [40.1, 27.9],
  [39.2, 28.2], [36.9, 28.6], [41.4, 29.3], [35.2, 29.4], [41.1, 29.6], [37.1, 29.9], [41.3, 30], [40, 30],
  [34.9, 30.3], [35.4, 30.7], [41.2, 30.8], [35.6, 30.9], [34.2, 31.2], [35.9, 31.4], [35.5, 31.7], [41.7, 31.7],
  [39.9, 32], [35.4, 32.3], [42, 32.5], [38.8, 32.6], [34.8, 32.6], [37, 32.9], [35.4, 33.2], [36.8, 33.4],
  [35.7, 33.8], [34.1, 34.1], [42, 34.2], [37.7, 34.4], [34.1, 34.6], [41.2, 34.8], [33.9, 34.9], [42.4, 34.9],
  [43.2, 35.3], [34.6, 35.6], [39.2, 35.6], [42, 36.1], [37.8, 36.2], [42.3, 36.3], [41.1, 36.5], [34.4, 36.6],
  [42, 36.8], [35.8, 36.9], [38.5, 37.1], [37.1, 37.1], [40.5, 37.1], [36, 37.2], [33.8, 37.4], [33.2, 37.6],
  [33.5, 37.7], [41.1, 37.9], [39.4, 38], [33.4, 38.2], [43.3, 38.3], [43.1, 38.5], [38.7, 38.7], [33.7, 39.6],
  [39.6, 39.8], [33, 40.7], [42.4, 40.7], [42.9, 40.9], [41.3, 41], [39.1, 41.1], [40.3, 41.2], [43.8, 41.4],
  [42.5, 41.7], [37.5, 41.9], [33.1, 42.2], [33.3, 42.4], [32.5, 42.5], [42.8, 42.8], [44.1, 42.8], [35.1, 42.9],
  [37, 43.1], [33.1, 43.2], [36.2, 43.2], [33.5, 43.4], [37.3, 43.6], [35.6, 43.7], [40.9, 43.8], [40.4, 44],
  [33.4, 44.6], [34, 45.2], [40.8, 45.3], [32.8, 45.4], [32.3, 45.5], [36.3, 45.5], [34.1, 45.9], [36.9, 46],
  [45, 46.2], [36, 46.2], [44.1, 46.4], [42.8, 46.5], [43.3, 46.6], [42.9, 46.8], [43.6, 46.8], [44.1, 47],
  [36.5, 47.1], [32.5, 47.1], [40.9, 47.3], [37.7, 47.6], [35.7, 47.8], [31.5, 48], [36, 48.1], [35.2, 48.2],
  [42.6, 48.4], [42.2, 48.5], [36.6, 48.7], [33.1, 48.9], [40.9, 49], [44.3, 49], [31.8, 49.3], [41.7, 49.3],
  [36.6, 49.4], [40.8, 49.5], [44.5, 49.6], [35.8, 49.7], [40.5, 49.8], [42.2, 50], [33.7, 50], [44.8, 50.2],
  [43.9, 50.3], [33.2, 50.5], [43.9, 50.7], [31.4, 50.8], [45.1, 50.8], [39.3, 50.8], [43.5, 50.9], [32.2, 51],
  [36.2, 51.1], [45.5, 51.3], [30.6, 51.4], [42.2, 51.8], [40.5, 51.8], [38.1, 52], [32.3, 52], [46.1, 52.1],
  [31.4, 52.2], [45.1, 52.4], [45.3, 52.6], [31.9, 52.7], [42.2, 52.9], [32.7, 53.4], [36.6, 53.8], [34.8, 54],
  [41.2, 54], [31.8, 54.2], [36.4, 54.5], [33.6, 54.6], [44, 54.8], [33.8, 54.8], [44.8, 54.8], [45.2, 55],
  [33.1, 55.2], [43.3, 55.4], [39.6, 55.5], [34.1, 55.5], [38, 55.6], [31.9, 55.7], [35.4, 55.8], [34.5, 56],
  [30.5, 56.1], [42.2, 56.1], [42.5, 56.3], [34.1, 56.3], [43.2, 56.3], [41, 56.5], [41.7, 56.8], [37, 57],
  [45.7, 57], [33, 57.3], [39.3, 57.3], [39.7, 57.5], [43.3, 57.5], [35.6, 57.6], [36.2, 57.6], [39.9, 57.8],
  [36.5, 57.9], [38.1, 58.1], [37.5, 58.3], [41.1, 58.5], [36.6, 58.5], [45.8, 58.9], [34.4, 59], [40.1, 59],
  [46.1, 59.2], [31.1, 59.3], [41.9, 59.4], [49.5, 59.5], [30.6, 59.6], [35, 59.8], [36.3, 59.9], [38.2, 60.1],
  [38.7, 60.3], [38.2, 60.5], [38.6, 60.6], [34.9, 60.6], [31.3, 60.6], [32, 60.8], [29.6, 61], [46.5, 61.2],
  [42.2, 61.4], [49, 61.5], [44.9, 61.6], [33, 61.7], [42.3, 61.8], [30.5, 62], [29.7, 62.1], [37.1, 62.2],
  [41.3, 62.3], [49.3, 62.3], [32.9, 62.4], [36.3, 62.4], [31.3, 62.5], [44.4, 62.6], [33.4, 62.7], [30.8, 62.9],
  [39.7, 63], [32.9, 63.1], [30.4, 63.2], [35.2, 63.4], [41.4, 63.4], [43.3, 63.9], [38.2, 64], [34.2, 64.1],
  [41, 64.1], [43.6, 64.4], [34.6, 64.8], [45.2, 64.9], [39.1, 65.2], [44.2, 65.5], [36.7, 65.9], [34.5, 66.1],
  [43.1, 66.4],
];

// Specular highlights on the pearl baubles, where a short star-shaped glint flashes.
export const CHRISTMAS_TREE_GLINTS: readonly (readonly [x: number, y: number])[] = [
  [30.6, 61.8], [30.8, 52.7], [32.3, 47.3], [32.4, 47], [33.1, 54.9], [33.3, 37.8], [33.9, 34.6], [34.7, 50.8],
  [34.7, 37.9], [37.2, 43.1], [37.8, 38], [38, 60.4], [38.1, 31.2], [38.7, 60.5], [39.9, 33.3], [40.1, 45],
  [42.2, 54.8], [43.8, 42.8], [44.1, 50.6], [44.1, 42.8], [44.6, 58.8], [44.9, 46.9], [45.4, 49.2], [46.2, 52.4],
];

export const CHRISTMAS_TREE_STAR = { x: 38.2, y: 13.2 };

// The tree's half-width and centre at a given height, read from the outline, for particles that
// spiral around the cone.
export function getTreeSpan(y: number) {
  const xs: number[] = [];
  const outline = CHRISTMAS_TREE_OUTLINE;
  for (let index = 0; index < outline.length; index += 1) {
    const [x1, y1] = outline[index];
    const [x2, y2] = outline[(index + 1) % outline.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
  }
  if (xs.length < 2) return null;
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  return { centre: (left + right) / 2, halfWidth: (right - left) / 2 };
}

export function isInsideTree(point: { x: number; y: number }) {
  let inside = false;
  const outline = CHRISTMAS_TREE_OUTLINE;
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index, index += 1) {
    const [x1, y1] = outline[index];
    const [x2, y2] = outline[previous];
    if ((y1 > point.y) !== (y2 > point.y) && point.x < (x2 - x1) * (point.y - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}
