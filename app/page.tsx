"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import PomodoroMiniWindow, { type PomodoroMiniSnapshot } from "./pomodoro-mini-window";
import { getFurnitureTarget, type Point } from "./game/furniture";
import { getTimePeriod, type TimePeriod } from "./game/time-period";
import { getSceneAsset, getWeatherKind, type WeatherKind } from "./game/weather";
import { cropItems, EMPTY_FARM, formatCookingTime, formatGrowTime, getCookingProgress, getCropProgress, getCropStage, INITIAL_PRODUCE, INITIAL_SEEDS, waterUnwateredPlots, type CropId, type CropPlotState, type ProduceInventory, type SeedInventory } from "./game/farm";
import { clampFurniturePosition, clampToScene, getWalkPath, ROOM_FIXED_OBSTACLES, YARD_OBSTACLES, type Rect, type SceneId } from "./game/scene";
import {
  CAT_STATUS_ANIMATIONS,
  getCatStatus,
  getCatStatusTransition,
  type CatAnimationFrame,
  type CatPose,
  type CatStatusId,
} from "./game/cat-actions";
import { canPetMove, decayPetStatsByTime, formatSleepRemaining, getSleepRemainingMs, PET_STAT_DECAY_MS, settlePetSleep, SLEEP_DURATION_MS } from "./game/pet-stats";
import { getJournalReward } from "./game/journal-reward";
import { getJournalStreak, localDate } from "./game/journal";
import { fetchPlaylist, isRemotePlaybackUrl, type Playlist, type PlaylistTrack } from "./game/music";
import { getWalkDirection, WALK_DIRECTION_ROW, type WalkDirection } from "./game/movement-direction";
import { advanceFeeding, beginFeeding, EMPTY_FEEDING, findBowlPlacement } from "./game/feeding";
import { EatingSprite, FoodBowl } from "./game/FeedingSprites";
import { getFeedingDockOffset } from "./game/feeding-pose";
import { furnitureCollision, useRoomDepth } from "./game/room-depth";
import PhotoBoardWall from "./game/photo-board/PhotoBoardWall";
import PhotoBoardOverlay from "./game/photo-board/PhotoBoardOverlay";
import { normalizePhotoBoard, PHOTO_BOARD_STORAGE_KEY, stablePhotoRotation, type PhotoBoardPhoto } from "./game/photo-board/types";
import {
  formatPomodoroTime,
  getPomodoroRemaining,
  INITIAL_POMODORO,
  normalizePomodoro,
  pausePomodoro,
  POMODORO_BREAK_MS,
  POMODORO_FOCUS_MS,
  POMODORO_REWARD,
  resetPomodoro,
  settlePomodoro,
  skipPomodoroBreak,
  startPomodoro,
  type PomodoroPhase,
  type PomodoroState,
} from "./game/pomodoro";
import {
  COCKTAIL_METHOD_LABELS,
  INGREDIENT_CATEGORY_LABELS,
  INITIAL_INGREDIENT_INVENTORY,
  cocktailRecipes,
  createInitialCocktailCollection,
  evaluateCocktail,
  formatIngredientAmount,
  getIceDisplacement,
  getIngredient,
  getIngredientStock,
  getLiquidTotal,
  getOccupiedVolume,
  ICE_DISPLACEMENT_ML,
  ingredientItems,
  mixIngredientColors,
  type CocktailCollection,
  type CocktailId,
  type CocktailMethod,
  type CocktailResult,
  type IngredientCategory,
  type IngredientId,
  type IngredientInventory,
  type MixAmounts,
  type StockedIngredientId,
} from "./game/cocktails";

type PetId = "mitao" | "doubao" | "xueqiu";
type OverlayId = "quest" | "history" | "bag" | "pets" | "shop" | "kitchen" | "music" | "bar" | "recipe-book" | "pomodoro" | "data" | null;
type ShopCategory = "food" | "furniture" | "ingredients";
type IngredientFilter = "all" | IngredientCategory;
type JournalCategory = "运动" | "学习" | "工作" | "饮食" | "睡眠" | "其他";
type JournalPhoto = { fileName?: string; key?: string; width: number; height: number };
type CheckinRecord = { id: number; date: string; content: string; category: JournalCategory; rating: number | null; reward: number | null; createdAt: string; photo?: JournalPhoto | null };
type HistoryBatch = { records: CheckinRecord[]; total: number; totalDays: number; nextCursor: string | null };
type DesktopUpdate = { phase: "available" | "downloading" | "downloaded" | "error"; name?: string; notes?: string; percent?: number; message?: string };
type BackupActionResult = { status: "exported" | "imported" | "cancelled" | "error"; message?: string; importedKeys?: number };
type PhotoActionResult = { status: "selected" | "cancelled" | "error"; message?: string; photo?: JournalPhoto };
type PhotoBoardActionResult = { status: "selected" | "cancelled" | "error"; message?: string; photo?: Pick<PhotoBoardPhoto, "id" | "fileName" | "width" | "height"> };
type StoreFoodId = "driedFish" | "chickenCan" | "salmonMousse" | "tunaRice" | "chickenCubes" | "catnipBiscuits";
type CookedFoodId = "strawberryPuree" | "carrotSoup" | "tomatoSoup" | "catnipCookies" | "sunflowerRice" | "pumpkinPuree";
type FoodId = StoreFoodId | CookedFoodId;
type CocktailInventory = Record<CocktailId, number>;
type PetStats = { energy: number; sleepiness: number; statsUpdatedAt: number };
type PetSleep = { endsAt: number | null; rest: number; furnitureId: string | null };
type GameState = {
  gameSchemaVersion: 10;
  statModelVersion: 2;
  berries: number;
  streak: number;
  lastCheckin: string | null;
  lastActivity: string | null;
  pet: PetId;
  adoptedPets: PetId[];
  petNames: Record<PetId, string>;
  petStats: Record<PetId, PetStats>;
  purchased: string[];
  inventory: Record<FoodId, number>;
  ingredientInventory: IngredientInventory;
  cocktailCollection: CocktailCollection;
  cocktailInventory: CocktailInventory;
  energy: number;
  sleepiness: number;
  statsUpdatedAt: number;
  catPosition: Point;
  petPositions: Record<PetId, Point>;
  petSleep: Record<PetId, PetSleep>;
  catFurniture: string | null;
  sleepEndsAt: number | null;
  sleepRest: number;
  furniturePositions: Record<string, Point>;
  scene: SceneId;
  farmPlots: CropPlotState[];
  seeds: SeedInventory;
  produce: ProduceInventory;
  cooking: { dishId: CookedFoodId; startedAt: number; endsAt: number } | null;
  pomodoro: PomodoroState;
};

const RELEASE_VERSION = "0.9.10";
const RELEASE_NOTES = [
  { version: "0.9.10", items: ["修复桌面版照片板上传后显示破图、无法查看照片的问题", "已经上传并保存在本地的照片会在更新后自动恢复正常显示"] },
  { version: "0.9.9", items: ["新增墙上生活照片板，完整照片板支持原比例浏览、横向滚动与高清大图查看", "照片可填写最多 80 字说明，并随网页存档、桌面存档和 .ohbackup 完整迁移", "主房间缩略照片按横图、竖图和方图自然混排，保持比例且不会溢出木框", "移除今日记录中的照片入口，并优化底部记录、背包等按钮的像素 Hover 动效"] },
  { version: "0.9.8", items: ["主界面升级为更轻盈的半透明信息层，整理顶部状态、猫咪状态与底部功能栏，同时保留原版彩色图标风格", "房间标题更新为 OH；天气按佛山实时数据自动同步，晴朗夜晚会显示月亮而不是太阳", "为唱片机中的 Jordan Critz《Beauté》加入本地音频，网络版本无法播放时也能正常收听", "桌面安装包不再包含已停用的唱片动画帧，显著缩小下载体积并加快后续更新"] },
  { version: "0.9.7", items: ["橙子专注小窗升级为苹果风液态玻璃外观，中央保持高透明，仅保留细进度环", "小窗固定为 160×160，并移除右下角缩放控件与正方形系统边框", "重写拖动边界计算，拖动过程中计时文字不会偏移、放大或缩小"] },
  { version: "0.9.6", items: ["修复 Windows 任务栏仍显示 Electron 初始图标的问题", "安装或自动更新时会重新写入桌面和开始菜单快捷方式身份", "开发调试与正式版改用不同应用身份，避免图标缓存再次互相污染"] },
  { version: "0.9.5", items: ["修复橙子专注小窗长时间不操作后时间停止的问题", "主窗口最小化或转入后台时仍按真实结束时间持续计时", "小窗新增独立时间校准，卡顿或休眠恢复后会立即显示正确剩余时间"] },
  { version: "0.9.4", items: ["刷新 Windows 任务栏应用身份，清除旧 Electron 图标关联", "保留原安装 GUID、安装目录和本地存档位置，更新后不会生成第二个 OH", "主窗口与橙子专注小窗继续统一使用草莓图标"] },
  { version: "0.9.3", items: ["修复橙子专注小窗在 Windows 任务栏显示 Electron 默认图标的问题", "主窗口、小窗、桌面快捷方式和程序本体现在统一使用草莓图标", "保留已验证的 Windows 图标写入方式，避免更新安装过程中出现兼容问题"] },
  { version: "0.9.2", items: ["新增橙子专注钟小窗：桌面版支持透明无边框、始终置顶、拖动与 120–360 像素缩放", "小窗点击圆盘即可开始或暂停，并与主窗口实时同步；修复拖动漂移、鼠标错位和时间数字显示不全", "专注钟视觉与相关文案由番茄更新为橙子，网页版继续支持画中画与弹窗兼容模式", "每日记录奖励调整为前三次依次获得 6、8、10 颗草莓，后续记录不再奖励；已授权通知时不再重复提示"] },
  { version: "0.9.1", items: ["网页版日记现在支持上传照片，照片会保存到内部并等比例显示", "上传后和历史记录中都可以预览照片，点击可查看大图", "加强完整备份校验与失败回滚，避免照片缺失或导入中断造成存档不一致", "修复网络中断时可能误删已保存照片的问题，并更新运行与打包组件的安全补丁"] },
  { version: "0.9.0", items: ["日记新增照片功能，每篇记录可导入一张照片", "照片会复制到应用内部，并按最长边 1600 像素等比例处理，不裁切、不拉伸", "完整备份现在会连同日记照片一起从 Windows 迁移到 Mac"] },
  { version: "0.8.0", items: ["新增 macOS 桌面版，同时支持 Apple 芯片和 Intel Mac", "新增完整数据导出与导入，可将 Windows 的日记、草莓、猫咪、家具、农场、调酒收藏和橙子专注钟进度迁移到 Mac", "导入前会自动保留当前存档，避免误覆盖后无法恢复"] },
  { version: "0.7.0", items: ["新增 25 分钟专注 + 5 分钟休息的橙子专注钟，每完成一次专注奖励 5 颗草莓", "新增专注钟累计次数、今日次数与累计奖励记忆，关闭界面后计时仍会继续", "计时器重绘为深色圆形仪表盘、亮色进度环与中央橙子，并加入完成庆祝动画", "专注和休息结束时播放提示音并显示确认弹窗，后台同时发送系统通知"] },
  { version: "0.6.0", items: ["新增调酒配料商店与吧台小游戏，支持真实水位、冰块排水和三种调制方式", "新增80草莓调酒书、十款鸡尾酒成品图与完整配方，购买后收进背包", "调制成功的鸡尾酒会保存到背包，未解锁酒保持剪影，并修复高水位冰块与容量提示"] },
  { version: "0.5.4", items: ["新增三只猫咪的八方向行走动画，方向切换与移动轨迹保持一致", "状态面板切换现在会切换到对应猫咪的控制权，场景名字与状态名字保持同步", "修复取消睡眠后猫咪被猫窝图层遮挡的问题"] },
  { version: "0.5.3", items: ["修复歌曲地址过期后无法继续播放的问题，自动刷新地址并从原进度恢复", "修复猫咪进入吧台、查看状态时切换控制猫咪，以及家具无法紧贴墙壁的问题", "移除房间唱片碎片动画，并让唱片柜黑胶始终保持完整圆形"] },
  { version: "0.5.2", items: ["开启桌面版本地音频流支持，修复内置备用歌曲加载失败的问题", "确认用户提供的 22 首 MP3 已逐首完整收录并映射到对应唱片"] },
  { version: "0.5.1", items: ["修复 Windows 桌面版唱片柜无法读取歌单的问题", "内置完整歌单清单，网易云接口暂时不可用时仍可打开唱片柜和播放本地备用歌曲"] },
  { version: "0.5.0", items: ["新增唱片机、吧台和指定网易云歌单，受限歌曲支持本地播放", "完成全部天气与时段的室内场景更新，修复右侧模糊和界面遮挡", "多只猫咪现在独立保存位置、状态与睡眠，同一张床不会重复入住", "每日前三条记录依次奖励 10、15、18 个草莓，后续记录不再奖励"] },
  { version: "0.4.1", items: ["修复切换状态时猫咪换位和动画被打断的问题", "伙伴页查看状态与喂食目标现在始终对应左下角选中的猫咪"] },
  { version: "0.4.0", items: ["桌面数据新增独立持久化备份，更新后自动恢复旧数据", "修复程序窗口左上角未显示草莓图标", "支持多只猫咪同时入住，并可在左下角切换独立状态", "记录改为每日自评分与智能草莓奖励，单次最高 23 颗"] },
  { version: "0.3.0", items: ["今日运动任务升级为温暖的每日生活日记，支持分类、时长、心情和同日多篇记录", "每日首次记录奖励调整为 20 颗草莓，并修正连续记录的点亮方向", "新增院子种植、厨房烹饪进度和离线计时，丰富家具与猫咪互动", "更新房间、院子与天气场景，优化移动、浇水和收获体验"] },
  { version: "0.2.2", items: ["桌面版生活记录与心情改为仅保存在本机", "更新完成后首次启动会直接弹出累计版本说明"] },
  { version: "0.2.1", items: ["修复手账翻回前一页时尺寸变大的问题", "桌面与安装图标更换为无面部像素草莓", "新增游戏内版本更新说明"] },
];

const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  morning: "上午",
  noon: "下午",
  evening: "傍晚",
  night: "夜晚",
};

const WEATHER_ICONS: Record<WeatherKind, string> = {
  clear: "☀️",
  cloudy: "☁️",
  rain: "🌧️",
  thunderstorm: "⛈️",
};

const getWeatherIcon = (weather: WeatherKind, period: TimePeriod) =>
  weather === "clear" && period === "night" ? "🌙" : WEATHER_ICONS[weather];

declare global {
  interface Window {
    gameUpdater?: {
      onStatus: (callback: (status: DesktopUpdate) => void) => () => void;
      download: () => void;
      install: () => void;
      version: () => Promise<string>;
      storage: {
        load: (key: string) => string | null;
        save: (key: string, value: string) => void;
        exportBackup: () => Promise<BackupActionResult>;
        importBackup: () => Promise<BackupActionResult>;
        refreshCache: () => Record<string, string>;
      };
      journalPhotos?: {
        select: () => Promise<PhotoActionResult>;
        remove: (fileName: string) => Promise<boolean>;
      };
      pomodoro?: {
        schedule: (endsAt: number, phase: PomodoroPhase) => void;
        cancel: () => void;
        onFinished: (callback: (phase: PomodoroPhase) => void) => () => void;
      };
      photoBoard?: {
        select: () => Promise<PhotoBoardActionResult>;
        remove: (fileName: string) => Promise<boolean>;
      };
      pomodoroMini?: {
        open: () => void;
        sync: (snapshot: PomodoroMiniSnapshot) => void;
        onState: (callback: (snapshot: PomodoroMiniSnapshot) => void) => () => void;
        onAction: (callback: (action: "start" | "pause") => void) => () => void;
        action: (action: "start" | "pause") => void;
      };
    };
  }
}

const DEFAULT_FURNITURE_POSITIONS: Record<string, Point> = {
  rug: { x: 48, y: 78 },
  plant: { x: 86, y: 62 },
  lamp: { x: 73, y: 61 },
  catbed: { x: 25, y: 77 },
  strawberrybed: { x: 38, y: 79 },
  moonbed: { x: 51, y: 78 },
  bookcase: { x: 14, y: 58 },
  table: { x: 61, y: 77 },
  cushion: { x: 78, y: 81 },
  chest: { x: 90, y: 78 },
  strawberrySofa: { x: 44, y: 76 },
  catTree: { x: 16, y: 70 },
  fishFireplace: { x: 88, y: 66 },
  wickerRocker: { x: 63, y: 76 },
  creamVanity: { x: 27, y: 66 },
  grandfatherClock: { x: 92, y: 64 },
  fishScratcher: { x: 74, y: 82 },
  flowerStool: { x: 56, y: 82 },
  teaCart: { x: 37, y: 78 },
  yarnBasket: { x: 84, y: 82 },
};

const storeFoodItems = [
  { id: "driedFish" as StoreFoodId, name: "蝴蝶结小鱼干", detail: "香香脆脆", price: 12, energy: 14, asset: "/game/food-dried-fish.png" },
  { id: "chickenCan" as StoreFoodId, name: "鸡肉肉酱罐头", detail: "软乎乎的肉酱", price: 18, energy: 20, asset: "/game/food-chicken-can.png" },
  { id: "salmonMousse" as StoreFoodId, name: "三文鱼慕斯", detail: "细腻的鱼肉慕斯", price: 24, energy: 26, asset: "/game/food-salmon-mousse.png" },
  { id: "tunaRice" as StoreFoodId, name: "金枪鱼拌饭", detail: "满满的鱼肉碎", price: 28, energy: 30, asset: "/game/food-tuna-rice.png" },
  { id: "chickenCubes" as StoreFoodId, name: "冻干鸡肉粒", detail: "一口一个咔嚓脆", price: 22, energy: 24, asset: "/game/food-chicken-cubes.png" },
  { id: "catnipBiscuits" as StoreFoodId, name: "猫薄荷饼干", detail: "快乐的小爪饼干", price: 16, energy: 17, asset: "/game/food-catnip-biscuits.png" },
];

const cookedDishes = [
  { id: "strawberryPuree" as CookedFoodId, cropId: "strawberry" as CropId, name: "草莓鲜果泥", detail: "新鲜草莓细细打成泥", energy: 18, cookMinutes: 5, asset: "/game/dish-strawberry-puree.png" },
  { id: "carrotSoup" as CookedFoodId, cropId: "carrot" as CropId, name: "胡萝卜浓汤", detail: "暖乎乎的橙色浓汤", energy: 20, cookMinutes: 8, asset: "/game/dish-carrot-soup.png" },
  { id: "tomatoSoup" as CookedFoodId, cropId: "tomato" as CropId, name: "番茄鲜汤", detail: "小番茄煮出的鲜甜汤", energy: 22, cookMinutes: 10, asset: "/game/dish-tomato-soup.png" },
  { id: "catnipCookies" as CookedFoodId, cropId: "catnip" as CropId, name: "猫薄荷鱼饼", detail: "烤成小鱼形的香脆饼", energy: 24, cookMinutes: 12, asset: "/game/dish-catnip-biscuits.png" },
  { id: "sunflowerRice" as CookedFoodId, cropId: "sunflower" as CropId, name: "葵花籽拌饭", detail: "颗粒饱满的营养拌饭", energy: 27, cookMinutes: 15, asset: "/game/dish-sunflower-rice.png" },
  { id: "pumpkinPuree" as CookedFoodId, cropId: "pumpkin" as CropId, name: "金黄南瓜泥", detail: "绵软香甜的南瓜泥", energy: 30, cookMinutes: 20, asset: "/game/dish-pumpkin-puree.png" },
];
const foodItems = [...storeFoodItems, ...cookedDishes];

const COCKTAIL_BOOK = {
  id: "cocktailRecipeBook",
  name: "莓果调酒书",
  detail: "收录全部鸡尾酒的配料、比例与调制步骤",
  price: 80,
  asset: "/game/cocktail-recipe-book.png",
};

const INITIAL_COCKTAIL_INVENTORY = Object.fromEntries(cocktailRecipes.map((recipe) => [recipe.id, 0])) as CocktailInventory;

const COCKTAIL_BOOK_STEPS: Record<CocktailMethod, string[]> = {
  build: ["杯中加入适量冰块。", "依次倒入配方中的材料。", "轻轻调和，让风味融合。"],
  shake: ["将配料与冰块放入摇壶。", "充分摇和至壶身冰凉。", "滤入准备好的杯中。"],
  stir: ["将配料与冰块放入调酒杯。", "沿同一方向缓缓搅拌。", "滤入杯中后即可享用。"],
};

const furnitureItems = [
  { id: "rug", name: "草莓地毯", detail: "柔软的大地毯", price: 35, asset: "/game/furniture-rug.png", standHeight: 0 },
  { id: "plant", name: "薄荷盆栽", detail: "让房间有一点绿意", price: 48, asset: "/game/furniture-plant.png", standHeight: null },
  { id: "lamp", name: "蘑菇夜灯", detail: "晚上会暖暖发光", price: 60, asset: "/game/furniture-lamp.png", standHeight: null },
  { id: "catbed", name: "云朵猫窝", detail: "软绵绵的基础小窝", price: 45, asset: "/game/furniture-catbed.png", standHeight: 4, rest: 30 },
  { id: "strawberrybed", name: "草莓篮子窝", detail: "暖红色的莓果小窝", price: 95, asset: "/game/furniture-catbed.png", standHeight: 4, rest: 55 },
  { id: "moonbed", name: "星空甜甜圈窝", detail: "适合睡一场长长的觉", price: 120, asset: "/game/furniture-catbed.png", standHeight: 4, rest: 80 },
  { id: "bookcase", name: "草莓书柜", detail: "摆满绘本和小收藏", price: 82, asset: "/game/furniture-bookcase.png", standHeight: null },
  { id: "table", name: "莓果小圆桌", detail: "一起坐下吃点心", price: 58, asset: "/game/furniture-table.png", standHeight: 8 },
  { id: "cushion", name: "爱心软垫", detail: "软绵绵的休息角", price: 42, asset: "/game/furniture-cushion.png", standHeight: 2 },
  { id: "chest", name: "木制玩具箱", detail: "收好猫咪的小玩具", price: 68, asset: "/game/furniture-chest.png", standHeight: 5 },
  { id: "strawberrySofa", name: "草莓双人沙发", detail: "和草莓抱枕一起陷进软绵绵里。", price: 105, asset: "/game/furniture-strawberry-sofa.png", standHeight: 7, lounge: true },
  { id: "catTree", name: "原木猫爬架", detail: "沿着原木台阶，一层层看更远。", price: 130, asset: "/game/furniture-cat-tree.png", standHeight: 11, platformHeights: [11, 22] },
  { id: "fishFireplace", name: "小鱼壁炉", detail: "小鱼守着火光，雨夜也暖呼呼。", price: 120, asset: "/game/furniture-fish-fireplace.png", overlay: "/game/furniture-fish-fireplace-overlay.png", standHeight: null },
  { id: "wickerRocker", name: "藤编摇椅", detail: "轻轻摇一摇，把困意晃成好梦。", price: 85, asset: "/game/furniture-wicker-rocker.png", standHeight: 8, lounge: true },
  { id: "creamVanity", name: "奶油梳妆台", detail: "圆镜旁，梳好今天软乎乎的毛。", price: 95, asset: "/game/furniture-cream-vanity.png", standHeight: null },
  { id: "grandfatherClock", name: "复古落地钟", detail: "滴答声慢慢走，屋子也安静下来。", price: 110, asset: "/game/furniture-grandfather-clock.png", overlay: "/game/furniture-grandfather-clock-overlay.png", standHeight: null },
  { id: "fishScratcher", name: "鱼形抓板", detail: "小鱼肚皮正适合磨磨小爪。", price: 55, asset: "/game/furniture-fish-scratcher.png", standHeight: null, action: "scratch" as const },
  { id: "flowerStool", name: "花朵矮凳", detail: "踩上一朵花，歇一会儿再出发。", price: 45, asset: "/game/furniture-flower-stool.png", standHeight: 5 },
  { id: "teaCart", name: "茶点餐车", detail: "蛋糕与热茶，等一个悠闲下午。", price: 88, asset: "/game/furniture-tea-cart.png", standHeight: null },
  { id: "yarnBasket", name: "毛线玩具篮", detail: "彩色毛线滚呀滚，快乐藏在篮子里。", price: 60, asset: "/game/furniture-yarn-basket.png", overlay: "/game/furniture-yarn-basket-overlay.png", standHeight: null, action: "scratch" as const },
];

const pets = [
  {
    id: "mitao" as PetId, name: "蜜桃", kind: "橘子猫", nature: "热情的小太阳",
    walkFrames: [1, 2, 3, 4].map((frame) => `/game/cat-orange-walk-fixed-${frame}.png`), idle: "/game/cat-orange-idle.png", sleep: "/game/cat-orange-sleep.png", wake: "/game/cat-orange-wake.png",
    walkSheet: "/game/cat-orange-walk-8dir-v4.png",
    wakeYawnFrames: [1, 2, 3, 4].map((frame) => `/game/cat-orange-wake-yawn-${frame}.png`),
    groomFrames: [1, 2, 3, 4].map((frame) => `/game/cat-orange-groom-fixed-${frame}.png`),
    scratchFrames: [1, 2, 3, 4].map((frame) => `/game/cat-orange-scratch-${frame}.png`),
  },
  {
    id: "doubao" as PetId, name: "豆包", kind: "奶牛猫", nature: "安静的陪跑员",
    walkFrames: [1, 2, 3, 4].map((frame) => `/game/cat-cow-walk-fixed-${frame}.png`), idle: "/game/cat-cow-idle.png", sleep: "/game/cat-cow-sleep.png", wake: "/game/cat-cow-wake.png",
    walkSheet: "/game/cat-cow-walk-8dir-v4.png",
    wakeYawnFrames: [1, 2, 3, 4].map((frame) => `/game/cat-cow-wake-yawn-${frame}.png`),
    groomFrames: [1, 2, 3, 4].map((frame) => `/game/cat-cow-groom-fixed-${frame}.png`),
    scratchFrames: [1, 2, 3, 4].map((frame) => `/game/cat-cow-scratch-${frame}.png`),
  },
  {
    id: "xueqiu" as PetId, name: "雪球", kind: "白绒猫", nature: "爱撒娇的鼓励师",
    walkFrames: [1, 2, 3, 4].map((frame) => `/game/cat-white-walk-fixed-${frame}.png`), idle: "/game/cat-white-idle.png", sleep: "/game/cat-white-sleep.png", wake: "/game/cat-white-wake.png",
    walkSheet: "/game/cat-white-walk-8dir-v4.png",
    wakeYawnFrames: [1, 2, 3, 4].map((frame) => `/game/cat-white-wake-yawn-${frame}.png`),
    groomFrames: [1, 2, 3, 4].map((frame) => `/game/cat-white-groom-fixed-${frame}.png`),
    scratchFrames: [1, 2, 3, 4].map((frame) => `/game/cat-white-scratch-${frame}.png`),
  },
];

const INITIAL_INVENTORY: Record<FoodId, number> = {
  driedFish: 2,
  chickenCan: 0,
  salmonMousse: 0,
  tunaRice: 0,
  chickenCubes: 0,
  catnipBiscuits: 0,
  strawberryPuree: 0,
  carrotSoup: 0,
  tomatoSoup: 0,
  catnipCookies: 0,
  sunflowerRice: 0,
  pumpkinPuree: 0,
};

const INITIAL_GAME: GameState = {
  gameSchemaVersion: 10,
  statModelVersion: 2,
  berries: 48,
  streak: 0,
  lastCheckin: null,
  lastActivity: null,
  pet: "mitao",
  adoptedPets: ["mitao"],
  petNames: { mitao: "蜜桃", doubao: "豆包", xueqiu: "雪球" },
  petStats: {
    mitao: { energy: 72, sleepiness: 24, statsUpdatedAt: 0 },
    doubao: { energy: 68, sleepiness: 18, statsUpdatedAt: 0 },
    xueqiu: { energy: 76, sleepiness: 30, statsUpdatedAt: 0 },
  },
  purchased: [],
  inventory: INITIAL_INVENTORY,
  ingredientInventory: INITIAL_INGREDIENT_INVENTORY,
  cocktailCollection: createInitialCocktailCollection(),
  cocktailInventory: INITIAL_COCKTAIL_INVENTORY,
  energy: 72,
  sleepiness: 24,
  statsUpdatedAt: 0,
  catPosition: { x: 56, y: 72 },
  petPositions: { mitao: { x: 56, y: 72 }, doubao: { x: 62, y: 73 }, xueqiu: { x: 78, y: 77 } },
  petSleep: {
    mitao: { endsAt: null, rest: 0, furnitureId: null },
    doubao: { endsAt: null, rest: 0, furnitureId: null },
    xueqiu: { endsAt: null, rest: 0, furnitureId: null },
  },
  catFurniture: null,
  sleepEndsAt: null,
  sleepRest: 0,
  furniturePositions: DEFAULT_FURNITURE_POSITIONS,
  scene: "room",
  farmPlots: EMPTY_FARM,
  seeds: INITIAL_SEEDS,
  produce: INITIAL_PRODUCE,
  cooking: null,
  pomodoro: INITIAL_POMODORO,
};

const milestones = [3, 7, 14, 30];

const ROOMMATE_POSITIONS: Record<PetId, Point> = {
  mitao: { x: 38, y: 76 }, doubao: { x: 62, y: 73 }, xueqiu: { x: 78, y: 77 },
};

const journalCategories: { name: JournalCategory; icon: string }[] = [
  { name: "运动", icon: "🏃" }, { name: "学习", icon: "📖" }, { name: "工作", icon: "💼" }, { name: "饮食", icon: "🍙" },
  { name: "睡眠", icon: "🌙" }, { name: "其他", icon: "✨" },
];

function readPersisted(key: string) {
  if (window.gameUpdater?.storage) return window.gameUpdater.storage.load(key);
  return window.localStorage.getItem(key);
}

function writePersisted(key: string, value: string) {
  if (window.gameUpdater?.storage) {
    window.gameUpdater.storage.save(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* Desktop disk storage remains authoritative. */ }
    return;
  }
  window.localStorage.setItem(key, value);
}

function photoBoardUrl(photo: PhotoBoardPhoto) {
  if (photo.key) return `/api/photo-board-photos?key=${encodeURIComponent(photo.key)}`;
  return photo.fileName ? `berry://photo-board/${encodeURIComponent(photo.fileName)}` : "";
}

async function preparePhotoFile(file: File) {
  if (!file.type.startsWith("image/") || file.size > 20_000_000) throw new Error("请选择不超过 20 MB 的照片");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) { image.close(); throw new Error("照片处理失败"); }
  context.drawImage(image, 0, 0, width, height); image.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("照片处理失败")), "image/jpeg", .88));
  return { blob, width, height };
}

const PLOT_POSITIONS = [
  { x: 38, y: 45, width: 9.5, height: 8.8 }, { x: 48, y: 45, width: 9.5, height: 8.8 }, { x: 58, y: 45, width: 9.5, height: 8.8 }, { x: 68, y: 45, width: 9.5, height: 8.8 },
  { x: 36, y: 56, width: 10, height: 9.5 }, { x: 46, y: 56, width: 10, height: 9.5 }, { x: 56, y: 56, width: 10, height: 9.5 }, { x: 67, y: 56, width: 10, height: 9.5 },
  { x: 34, y: 70, width: 10.5, height: 10 }, { x: 45, y: 70, width: 10.5, height: 10 }, { x: 56, y: 70, width: 10.5, height: 10 }, { x: 68, y: 70, width: 10.5, height: 10 },
];

const FURNITURE_FOOTPRINTS: Record<string, { halfWidth: number; height: number }> = {
  rug: { halfWidth: 10, height: 2 }, plant: { halfWidth: 4, height: 9 }, lamp: { halfWidth: 4, height: 10 },
  catbed: { halfWidth: 7, height: 5 }, strawberrybed: { halfWidth: 7, height: 5 }, moonbed: { halfWidth: 7, height: 5 },
  bookcase: { halfWidth: 5, height: 11 }, table: { halfWidth: 7, height: 6 }, cushion: { halfWidth: 5, height: 4 }, chest: { halfWidth: 5, height: 6 },
  strawberrySofa: { halfWidth: 9, height: 7 }, catTree: { halfWidth: 6, height: 15 }, fishFireplace: { halfWidth: 7, height: 11 },
  wickerRocker: { halfWidth: 6, height: 9 }, creamVanity: { halfWidth: 7, height: 11 }, grandfatherClock: { halfWidth: 4, height: 14 },
  fishScratcher: { halfWidth: 5, height: 4 }, flowerStool: { halfWidth: 5, height: 5 }, teaCart: { halfWidth: 6, height: 8 }, yarnBasket: { halfWidth: 5, height: 5 },
};

const WAKE_YAWN_SEQUENCE = [0, 1, 2, 3, 3, 2, 1, 0];
const WAKE_SEQUENCE_LENGTH = WAKE_YAWN_SEQUENCE.length + 3;
const WALK_FRAME_MS = 90;
const WALK_CYCLE_MS = WALK_FRAME_MS * 4;
const STATUS_IDLE_MS = 8000;
const BAR_CAPACITY_ML = 350;
const ICE_CUBE_LAYOUT = [
  { x: -34, rotation: -13 }, { x: 1, rotation: 8 }, { x: 34, rotation: -5 },
  { x: -18, rotation: 15 }, { x: 20, rotation: -17 }, { x: -39, rotation: 5 },
  { x: 39, rotation: 13 }, { x: -7, rotation: -8 }, { x: 25, rotation: 19 },
  { x: -28, rotation: -20 },
];
const ROOM_SCENE_ASSET_VERSION = "20260817-static-vinyl-wall-furniture-v1";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ingredientIconStyle(iconIndex: number): CSSProperties {
  return { backgroundPosition: `${(iconIndex % 4) * (100 / 3)}% ${Math.floor(iconIndex / 4) * (100 / 3)}%` };
}

function getLoopedStatusFrame(frames: CatAnimationFrame[], now: number) {
  const totalDuration = frames.reduce((total, frame) => total + frame.duration, 0);
  let elapsed = now % totalDuration;
  for (const frame of frames) {
    if (elapsed < frame.duration) return frame;
    elapsed -= frame.duration;
  }
  return frames[0];
}

export default function Home() {
  const [overlay, setOverlay] = useState<OverlayId>(null);
  const [shopCategory, setShopCategory] = useState<ShopCategory>("food");
  const [ingredientFilter, setIngredientFilter] = useState<IngredientFilter>("all");
  const [shopIngredientId, setShopIngredientId] = useState<IngredientId | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [ingredientPurchaseBusy, setIngredientPurchaseBusy] = useState(false);
  const [barView, setBarView] = useState<"mix" | "collection">("mix");
  const [mixDraft, setMixDraft] = useState<MixAmounts>({});
  const [mixMethod, setMixMethod] = useState<CocktailMethod | null>(null);
  const [mixIngredientId, setMixIngredientId] = useState<IngredientId | null>(null);
  const [mixIngredientAmount, setMixIngredientAmount] = useState(5);
  const [pouring, setPouring] = useState<"liquid" | "ice" | null>(null);
  const [mixing, setMixing] = useState(false);
  const [mixResult, setMixResult] = useState<(CocktailResult & { firstUnlock: boolean; consumed: MixAmounts }) | null>(null);
  const [recipeBookIndex, setRecipeBookIndex] = useState(0);
  const [selectedFood, setSelectedFood] = useState<FoodId>("driedFish");
  const [noteText, setNoteText] = useState("");
  const [category, setCategory] = useState<JournalCategory>("其他");
  const [rating, setRating] = useState(5);
  const [deviceId, setDeviceId] = useState("");
  const [history, setHistory] = useState<CheckinRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyMeta, setHistoryMeta] = useState<Omit<HistoryBatch, "records"> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [game, setGame] = useState<GameState>(INITIAL_GAME);
  const [inspectedPetId, setInspectedPetId] = useState<PetId>("mitao");
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [toast, setToast] = useState("");
  const [decorating, setDecorating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [feeding, setFeeding] = useState(EMPTY_FEEDING);
  const feedingRef = useRef(EMPTY_FEEDING);
  const feedingBusy = feeding.phase !== "IDLE";
  const [bowlPosition, setBowlPosition] = useState<Point>({ x: 64, y: 85 });
  const [jumping, setJumping] = useState(false);
  const [walkFrame, setWalkFrame] = useState(0);
  const [walkDuration, setWalkDuration] = useState(0);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("noon");
  const [weather, setWeather] = useState<{ kind: WeatherKind; label: string }>({ kind: "clear", label: "晴" });
  const [catStatus, setCatStatus] = useState<CatStatusId>(() => getCatStatus(INITIAL_GAME.energy, INITIAL_GAME.sleepiness));
  const [statusFrame, setStatusFrame] = useState(0);
  const [statusIdle, setStatusIdle] = useState(true);
  const [statusTransition, setStatusTransition] = useState<CatAnimationFrame[] | null>(null);
  const [statusTransitionTarget, setStatusTransitionTarget] = useState<CatStatusId | null>(null);
  const [resting, setResting] = useState(false);
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);
  const [sleepNow, setSleepNow] = useState(Date.now());
  const [roommateAnimationNow, setRoommateAnimationNow] = useState(Date.now());
  const [interruptConfirm, setInterruptConfirm] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  const [wakeFrame, setWakeFrame] = useState(0);
  const [headShaking, setHeadShaking] = useState(false);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdate | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [direction, setDirection] = useState<WalkDirection>("right");
  const [seedStorageOpen, setSeedStorageOpen] = useState(false);
  const [selectedSeed, setSelectedSeed] = useState<CropId | null>(null);
  const [watering, setWatering] = useState(false);
  const [wateringPlot, setWateringPlot] = useState<number | null>(null);
  const [farmNow, setFarmNow] = useState(Date.now());
  const [kitchenNow, setKitchenNow] = useState(Date.now());
  const [sceneTransition, setSceneTransition] = useState(false);
  const [lounging, setLounging] = useState(false);
  const [scratching, setScratching] = useState(false);
  const [scratchFrame, setScratchFrame] = useState(0);
  const [plotEffect, setPlotEffect] = useState<{ index: number; type: "seed" | "water" | "harvest" } | null>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(true);
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(.7);
  const [pomodoroNow, setPomodoroNow] = useState(Date.now());
  const [pomodoroAlert, setPomodoroAlert] = useState<PomodoroPhase | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [dataTransferBusy, setDataTransferBusy] = useState<"export" | "import" | null>(null);
  const [photoBoardOpen, setPhotoBoardOpen] = useState(false);
  const [photoBoardOrigin, setPhotoBoardOrigin] = useState<DOMRect | null>(null);
  const [photoBoardPhotos, setPhotoBoardPhotos] = useState<PhotoBoardPhoto[]>([]);
  const [photoBoardReady, setPhotoBoardReady] = useState(false);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pomodoroAudioContextRef = useRef<AudioContext | null>(null);
  const recoveringTrackId = useRef<number | null>(null);
  const lastPlaybackRecovery = useRef<{ trackId: number; attemptedAt: number } | null>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const walkingTimer = useRef<number | undefined>(undefined);
  const motionFrame = useRef(0);
  const headShakeTimer = useRef<number | undefined>(undefined);
  const sleepInterruptReadyAt = useRef(0);
  const animationImages = useRef<HTMLImageElement[]>([]);
  const scratchTimer = useRef<number | undefined>(undefined);
  const mixingTimer = useRef<number | undefined>(undefined);
  const pouringTimer = useRef<number | undefined>(undefined);
  const ingredientPurchaseLock = useRef(false);
  const mixingTransactionLock = useRef(false);
  const photoUploadLock = useRef(false);
  const historyLoadLock = useRef(false);
  const checkinSaveLock = useRef(false);
  const legacyJournal = useRef<{ lastCheckin: string | null; lastActivity: string | null }>({ lastCheckin: null, lastActivity: null });
  const handledPomodoroDeadline = useRef<number | null>(null);
  const desiredCatStatus = getCatStatus(game.energy, game.sleepiness);
  const currentTrack = playlist?.tracks.find((track) => track.id === playingTrackId) ?? null;
  const sceneAsset = getSceneAsset(game.scene, weather.kind, timePeriod);
  const renderedSceneUrl = `${sceneAsset}?v=${ROOM_SCENE_ASSET_VERSION}`;
  useRoomDepth(roomRef, walking);

  useEffect(() => {
    const timer = window.setTimeout(() => {
    const now = new Date();
    const current = localDate(now);
    setToday(current);
    setDateLabel(now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" }));
    const savedCategory = readPersisted("berry-journal-category") as JournalCategory | null;
    if (journalCategories.some((item) => item.name === savedCategory)) setCategory(savedCategory!);

    const saved = readPersisted("berry-workout-game");
    let savedDeviceId = readPersisted("berry-workout-device");
    if (!savedDeviceId) {
      savedDeviceId = crypto.randomUUID();
      writePersisted("berry-workout-device", savedDeviceId);
    }
    setDeviceId(savedDeviceId);
    try { setPhotoBoardPhotos(normalizePhotoBoard(JSON.parse(readPersisted(PHOTO_BOARD_STORAGE_KEY) ?? "[]"))); } catch { setPhotoBoardPhotos([]); }
    setPhotoBoardReady(true);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<GameState> & { food?: number };
        const legacyFood = typeof parsed.food === "number" ? parsed.food : INITIAL_INVENTORY.driedFish;
        const inventory = { ...INITIAL_INVENTORY, ...(parsed.inventory ?? {}) };
        const ingredientInventory = Object.fromEntries((Object.keys(INITIAL_INGREDIENT_INVENTORY) as StockedIngredientId[]).map((id) => [
          id,
          Math.max(0, Number(parsed.ingredientInventory?.[id] ?? 0)),
        ])) as IngredientInventory;
        const initialCocktailCollection = createInitialCocktailCollection();
        const cocktailCollection = Object.fromEntries(cocktailRecipes.map((recipe) => [
          recipe.id,
          { ...initialCocktailCollection[recipe.id], ...(parsed.cocktailCollection?.[recipe.id] ?? {}) },
        ])) as CocktailCollection;
        const cocktailInventory = Object.fromEntries(cocktailRecipes.map((recipe) => [
          recipe.id,
          Math.max(0, Number(parsed.cocktailInventory?.[recipe.id] ?? (cocktailCollection[recipe.id].unlocked ? 1 : 0))),
        ])) as CocktailInventory;
        const scene: SceneId = parsed.scene === "yard" ? "yard" : "room";
        if (!parsed.inventory) inventory.driedFish = legacyFood;
        const activePet = parsed.pet ?? "mitao";
        const sceneObstacles = scene === "yard" ? YARD_OBSTACLES : ROOM_FIXED_OBSTACLES;
        const activePosition = clampToScene(parsed.catPosition ?? INITIAL_GAME.catPosition, scene, sceneObstacles);
        const petPositions = Object.fromEntries((Object.keys(INITIAL_GAME.petPositions) as PetId[]).map((id) => [
          id,
          clampToScene(parsed.petPositions?.[id] ?? INITIAL_GAME.petPositions[id], "room", ROOM_FIXED_OBSTACLES),
        ])) as Record<PetId, Point>;
        const furniturePositions = Object.fromEntries(Object.entries({ ...DEFAULT_FURNITURE_POSITIONS, ...(parsed.furniturePositions ?? {}) })
          .map(([id, position]) => [id, clampFurniturePosition(position, FURNITURE_FOOTPRINTS[id])]));
        const merged: GameState = {
          ...INITIAL_GAME,
          ...parsed,
          inventory,
          ingredientInventory,
          cocktailCollection,
          cocktailInventory,
          gameSchemaVersion: 10,
          pet: activePet,
          purchased: Array.isArray(parsed.purchased) ? parsed.purchased : [],
          adoptedPets: Array.isArray(parsed.adoptedPets) && parsed.adoptedPets.length ? parsed.adoptedPets : [activePet],
          petNames: { ...INITIAL_GAME.petNames, ...(parsed.petNames ?? {}) },
          petStats: { ...INITIAL_GAME.petStats, ...(parsed.petStats ?? {}) },
          catPosition: activePosition,
          petPositions: { ...petPositions, [activePet]: activePosition },
          petSleep: Object.fromEntries((["mitao", "doubao", "xueqiu"] as PetId[]).map((id) => {
            const savedSleep = parsed.petSleep?.[id];
            return [id, {
              endsAt: savedSleep?.endsAt ?? (id === activePet ? parsed.sleepEndsAt ?? null : null),
              rest: savedSleep?.rest ?? (id === activePet ? parsed.sleepRest ?? 0 : 0),
              furnitureId: savedSleep?.furnitureId ?? (id === activePet ? parsed.catFurniture ?? null : null),
            }];
          })) as Record<PetId, PetSleep>,
          furniturePositions,
          scene,
          farmPlots: Array.from({ length: 12 }, (_, index) => parsed.farmPlots?.[index] ?? null),
          seeds: { ...INITIAL_SEEDS, ...(parsed.seeds ?? {}) },
          produce: { ...INITIAL_PRODUCE, ...(parsed.produce ?? {}) },
          pomodoro: normalizePomodoro(parsed.pomodoro, current),
        };
        if (parsed.statModelVersion !== 2) {
          merged.sleepiness = 100 - clamp(merged.sleepiness, 0, 100);
          merged.statModelVersion = 2;
        }
        merged.streak = getJournalStreak(merged.lastCheckin, merged.streak, current);
        const nowMs = now.getTime();
        merged.statsUpdatedAt = typeof parsed.statsUpdatedAt === "number" && parsed.statsUpdatedAt > 0 ? parsed.statsUpdatedAt : nowMs;
        const sleepingPets = (Object.keys(merged.petSleep) as PetId[])
          .filter((id) => merged.petSleep[id].endsAt && getSleepRemainingMs(merged.petSleep[id].endsAt, nowMs) > 0)
          .sort((left, right) => (merged.petSleep[left].endsAt ?? 0) - (merged.petSleep[right].endsAt ?? 0));
        const restFurniture = furnitureItems.filter((item) => item.rest && merged.purchased.includes(item.id));
        const occupiedBeds = new Set<string>();
        for (const id of sleepingPets) {
          const sleep = merged.petSleep[id];
          let furnitureId = sleep.furnitureId;
          if (!furnitureId) {
            const petPosition = id === merged.pet ? merged.catPosition : merged.petPositions[id];
            const nearestBed = restFurniture.map((item) => {
              const target = getFurnitureTarget(merged.furniturePositions[item.id], item.standHeight);
              return { id: item.id, distance: Math.hypot(target.x - petPosition.x, target.y - petPosition.y) };
            }).sort((left, right) => left.distance - right.distance)[0];
            if (nearestBed && (restFurniture.length === 1 || nearestBed.distance < 8)) furnitureId = nearestBed.id;
          }
          if (furnitureId && occupiedBeds.has(furnitureId)) {
            merged.petSleep[id] = { endsAt: null, rest: 0, furnitureId: null };
            merged.petPositions[id] = ROOMMATE_POSITIONS[id];
            if (id === merged.pet) merged.catPosition = ROOMMATE_POSITIONS[id];
            continue;
          }
          merged.petSleep[id] = { ...sleep, furnitureId: furnitureId ?? null };
          if (furnitureId) occupiedBeds.add(furnitureId);
        }
        for (const id of Object.keys(merged.petSleep) as PetId[]) {
          const sleep = merged.petSleep[id];
          if (id === merged.pet || !sleep.endsAt || getSleepRemainingMs(sleep.endsAt, nowMs) > 0) continue;
          const stats = merged.petStats[id];
          const settled = settlePetSleep(stats.energy, stats.sleepiness, stats.statsUpdatedAt, sleep.endsAt, sleep.rest, nowMs);
          merged.petStats[id] = { energy: settled.energy, sleepiness: settled.sleepiness, statsUpdatedAt: settled.statsUpdatedAt };
          merged.petSleep[id] = { endsAt: null, rest: 0, furnitureId: null };
        }
        const activeSleep = merged.petSleep[merged.pet];
        merged.sleepEndsAt = activeSleep.endsAt;
        merged.sleepRest = activeSleep.rest;
        const sleepRemaining = getSleepRemainingMs(merged.sleepEndsAt, nowMs);
        if (merged.sleepEndsAt && sleepRemaining === 0) {
          const settled = settlePetSleep(merged.energy, merged.sleepiness, merged.statsUpdatedAt, merged.sleepEndsAt, merged.sleepRest, nowMs);
          merged.energy = settled.energy;
          merged.sleepiness = settled.sleepiness;
          merged.statsUpdatedAt = settled.statsUpdatedAt;
          merged.petSleep[merged.pet] = { endsAt: null, rest: 0, furnitureId: null };
          merged.catFurniture = null;
          merged.sleepEndsAt = null;
          merged.sleepRest = 0;
        } else if (sleepRemaining > 0) {
          merged.catFurniture = activeSleep.furnitureId;
          merged.statsUpdatedAt = nowMs;
          setResting(true);
          setSleepRemainingMs(sleepRemaining);
        } else {
          Object.assign(merged, decayPetStatsByTime(merged.energy, merged.sleepiness, merged.statsUpdatedAt, nowMs));
        }
        merged.petStats[merged.pet] = { energy: merged.energy, sleepiness: merged.sleepiness, statsUpdatedAt: merged.statsUpdatedAt };
        legacyJournal.current = { lastCheckin: merged.lastCheckin, lastActivity: merged.lastActivity };
        setGame(merged);
        setInspectedPetId(merged.pet);
      } catch {
        setGame({ ...INITIAL_GAME, pomodoro: normalizePomodoro(undefined, current) });
      }
    } else setGame({ ...INITIAL_GAME, statsUpdatedAt: now.getTime(), pomodoro: normalizePomodoro(undefined, current) });
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
    if (window.sessionStorage.getItem("oh-backup-imported") === "yes") {
      window.sessionStorage.removeItem("oh-backup-imported");
      queueMicrotask(() => setToast("备份已完整导入，Windows 数据已在这台电脑恢复"));
    }
    setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const syncDate = () => {
      const now = new Date();
      const date = localDate(now);
      setToday(date);
      setDateLabel(now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" }));
      setGame((current) => {
        const streak = getJournalStreak(current.lastCheckin, current.streak, date);
        return streak === current.streak ? current : { ...current, streak };
      });
    };
    const timer = window.setInterval(syncDate, 30_000);
    const syncVisibleDate = () => { if (document.visibilityState === "visible") syncDate(); };
    window.addEventListener("focus", syncDate);
    document.addEventListener("visibilitychange", syncVisibleDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncDate);
      document.removeEventListener("visibilitychange", syncVisibleDate);
    };
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    fetchPlaylist()
      .then((data) => { if (!cancelled) setPlaylist(data); })
      .catch((error) => { if (!cancelled) setToast(error instanceof Error ? error.message : "歌单载入失败"); })
      .finally(() => { if (!cancelled) setPlaylistLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!ready || !deviceId) return;
    let cancelled = false;
    const loadHistory = async () => {
      if (navigator.userAgent.includes("BerryWorkoutDesktop")) {
        const records = (JSON.parse(readPersisted("berry-workout-history") ?? "[]") as (CheckinRecord & { activity?: string })[]).map((record) => ({
          ...record,
          content: record.content ?? record.activity ?? "",
          category: record.category ?? "其他",
          rating: record.rating ?? null,
          reward: record.reward ?? null,
          createdAt: record.createdAt ?? `${record.date}T00:00:00`,
          photo: record.photo ?? null,
        }));
        if (!cancelled) { setHistory(records); setHistoryReady(true); }
        return;
      }
      try {
        const response = await fetch(`/api/checkins?device=${encodeURIComponent(deviceId)}`);
        if (!response.ok) throw new Error();
        const data = await response.json() as HistoryBatch;
        let records = data.records;
        const legacy = legacyJournal.current;
        if (!records.length && legacy.lastCheckin && legacy.lastActivity) {
          const migrated = await fetch("/api/checkins", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deviceId, date: legacy.lastCheckin, content: legacy.lastActivity, category: "其他", rating: null, reward: null }),
          });
          if (migrated.ok) {
            records = [(await migrated.json() as { record: CheckinRecord }).record];
            data.total = 1;
            data.totalDays = 1;
          }
        }
        if (!cancelled) {
          setHistory(records);
          setHistoryMeta({ total: data.total, totalDays: data.totalDays, nextCursor: data.nextCursor });
          setHistoryReady(true);
        }
      } catch {
        if (!cancelled) { setHistoryError(true); setToast("历史记录暂时无法载入，请重试"); }
      }
    };
    loadHistory();
    return () => { cancelled = true; };
  }, [deviceId, ready, historyRetry]);

  useEffect(() => {
    const syncTimePeriod = () => setTimePeriod(getTimePeriod());
    syncTimePeriod();
    const timer = window.setInterval(syncTimePeriod, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const labels: Record<WeatherKind, string> = { clear: "晴", cloudy: "多云", rain: "小雨", thunderstorm: "雷暴雨" };
    const syncWeather = async () => {
      try {
        const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=23.0215&longitude=113.1214&current=weather_code,cloud_cover,precipitation&timezone=Asia%2FShanghai", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json() as { current: { weather_code: number; cloud_cover: number; precipitation: number } };
        const kind = getWeatherKind(data.current.weather_code, data.current.precipitation, data.current.cloud_cover);
        if (!cancelled) {
          setWeather({ kind, label: labels[kind] });
          if (kind === "rain" || kind === "thunderstorm") setGame((current) => ({ ...current, farmPlots: waterUnwateredPlots(current.farmPlots) }));
        }
      } catch {
        try {
          const response = await fetch("https://wttr.in/Foshan?format=j1", { cache: "no-store" });
          if (!response.ok) throw new Error();
          const data = await response.json() as { current_condition: Array<{ cloudcover: string; precipMM: string; weatherDesc: Array<{ value: string }> }> };
          const current = data.current_condition[0];
          const description = current.weatherDesc[0]?.value.toLowerCase() ?? "";
          const code = description.includes("thunder") ? 95 : description.includes("rain") || description.includes("drizzle") || description.includes("shower") ? 61 : description.includes("cloud") || description.includes("overcast") ? 3 : 0;
          const kind = getWeatherKind(code, Number(current.precipMM), Number(current.cloudcover));
          if (!cancelled) {
            setWeather({ kind, label: labels[kind] });
            if (kind === "rain" || kind === "thunderstorm") setGame((current) => ({ ...current, farmPlots: waterUnwateredPlots(current.farmPlots) }));
          }
        } catch {
          // Keep the last successfully synced weather instead of replacing it with an error state.
        }
      }
    };
    syncWeather();
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncWeather();
    };
    const timer = window.setInterval(syncWeather, 5 * 60 * 1000);
    window.addEventListener("focus", syncWeather);
    window.addEventListener("online", syncWeather);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncWeather);
      window.removeEventListener("online", syncWeather);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (ready) writePersisted("berry-workout-game", JSON.stringify(game));
  }, [game, ready]);

  useEffect(() => {
    if (photoBoardReady) writePersisted(PHOTO_BOARD_STORAGE_KEY, JSON.stringify(photoBoardPhotos));
  }, [photoBoardPhotos, photoBoardReady]);

  useEffect(() => {
    if (!photoBoardOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [photoBoardOpen]);

  useEffect(() => {
    const desktopPomodoro = window.gameUpdater?.pomodoro;
    if (!ready || game.pomodoro.status !== "running" || game.pomodoro.endsAt === null) {
      desktopPomodoro?.cancel();
      return;
    }
    const updatePomodoroNow = () => setPomodoroNow(Date.now());
    handledPomodoroDeadline.current = handledPomodoroDeadline.current === game.pomodoro.endsAt
      ? handledPomodoroDeadline.current
      : null;
    desktopPomodoro?.schedule(game.pomodoro.endsAt, game.pomodoro.phase);
    updatePomodoroNow();
    const timer = window.setInterval(updatePomodoroNow, 250);
    window.addEventListener("focus", updatePomodoroNow);
    document.addEventListener("visibilitychange", updatePomodoroNow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updatePomodoroNow);
      document.removeEventListener("visibilitychange", updatePomodoroNow);
    };
  }, [game.pomodoro.endsAt, game.pomodoro.phase, game.pomodoro.status, ready]);

  useEffect(() => {
    const desktopPomodoro = window.gameUpdater?.pomodoro;
    if (!desktopPomodoro) return;
    return desktopPomodoro.onFinished(() => setPomodoroNow(Date.now()));
  }, []);

  useEffect(() => {
    const deadline = game.pomodoro.endsAt;
    if (!ready || game.pomodoro.status !== "running" || deadline === null || pomodoroNow < deadline || handledPomodoroDeadline.current === deadline) return;
    handledPomodoroDeadline.current = deadline;
    const currentDate = localDate(new Date(pomodoroNow));
    const result = settlePomodoro(game.pomodoro, currentDate, pomodoroNow);
    queueMicrotask(() => {
      setGame((current) => current.pomodoro.endsAt === deadline ? {
        ...current,
        berries: current.berries + result.reward,
        pomodoro: result.state,
      } : current);

      if (result.event === "focus") {
        setToast(`专注完成！获得 🍓 ${POMODORO_REWARD}，休息 5 分钟吧`);
        setPomodoroAlert("focus");
        playPomodoroChime("focus");
        if (!window.gameUpdater?.pomodoro && "Notification" in window && Notification.permission === "granted") {
          new Notification("专注完成 · 草莓到账", { body: `完成 1 个橙子专注循环，获得 ${POMODORO_REWARD} 颗草莓。现在休息 5 分钟吧！` });
        }
      } else if (result.event === "break") {
        setToast("休息结束，可以开始下一次专注啦");
        setPomodoroAlert("break");
        playPomodoroChime("break");
        if (!window.gameUpdater?.pomodoro && "Notification" in window && Notification.permission === "granted") {
          new Notification("休息结束", { body: "新的 25 分钟专注已经准备好。" });
        }
      }
    });
  }, [game.pomodoro, pomodoroNow, ready]);

  useEffect(() => {
    const updateFarm = () => setFarmNow(Date.now());
    const timer = window.setInterval(updateFarm, 60_000);
    window.addEventListener("focus", updateFarm);
    document.addEventListener("visibilitychange", updateFarm);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateFarm);
      document.removeEventListener("visibilitychange", updateFarm);
    };
  }, []);

  useEffect(() => {
    if (!game.cooking) return;
    const updateCooking = () => setKitchenNow(Date.now());
    updateCooking();
    const timer = window.setInterval(updateCooking, 1000);
    return () => window.clearInterval(timer);
  }, [game.cooking]);

  useEffect(() => {
    if (!ready || !game.cooking || kitchenNow < game.cooking.endsAt) return;
    const dish = cookedDishes.find((item) => item.id === game.cooking?.dishId);
    if (!dish) return;
    const timer = window.setTimeout(() => {
      setGame((current) => current.cooking?.dishId === dish.id ? {
        ...current,
        cooking: null,
        inventory: { ...current.inventory, [dish.id]: current.inventory[dish.id] + 1 },
      } : current);
      setToast(`${dish.name}做好啦，成品已放进背包`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [game.cooking, kitchenNow, ready]);

  useEffect(() => {
    const updater = window.gameUpdater;
    if (!updater) return;
    const unsubscribe = updater.onStatus(setDesktopUpdate);
    void updater.version().then((version) => {
      if (version === RELEASE_VERSION && readPersisted("berry-workout-release-notes-seen") !== version) setShowReleaseNotes(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!ready || resting) return;
    const syncStats = () => setGame((current) => ({
      ...current,
      ...decayPetStatsByTime(current.energy, current.sleepiness, current.statsUpdatedAt),
    }));
    syncStats();
    const timer = window.setInterval(syncStats, PET_STAT_DECAY_MS);
    const syncVisibleStats = () => { if (document.visibilityState === "visible") syncStats(); };
    window.addEventListener("focus", syncStats);
    document.addEventListener("visibilitychange", syncVisibleStats);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncStats);
      document.removeEventListener("visibilitychange", syncVisibleStats);
    };
  }, [ready, resting]);

  useEffect(() => {
    if (!ready) return;
    const updateSleep = () => {
      const now = Date.now();
      const activeSleep = game.petSleep[game.pet] ?? INITIAL_GAME.petSleep[game.pet];
      const activeRemaining = getSleepRemainingMs(activeSleep.endsAt, now);
      const completedPets = (Object.keys(game.petSleep) as PetId[]).filter((id) => {
        const sleep = game.petSleep[id];
        return Boolean(sleep.endsAt && getSleepRemainingMs(sleep.endsAt, now) === 0);
      });
      setSleepNow(now);
      setSleepRemainingMs(activeRemaining);
      setResting(activeRemaining > 0);
      if (activeRemaining === 0) setInterruptConfirm(false);
      if (!completedPets.length) return;
      setGame((current) => {
        let energy = current.energy;
        let sleepiness = current.sleepiness;
        let statsUpdatedAt = current.statsUpdatedAt;
        const petStats = { ...current.petStats };
        const petSleep = { ...current.petSleep };
        for (const id of Object.keys(current.petSleep) as PetId[]) {
          const sleep = current.petSleep[id];
          if (!sleep.endsAt || getSleepRemainingMs(sleep.endsAt, now) > 0) continue;
          if (id === current.pet) {
            const settled = settlePetSleep(current.energy, current.sleepiness, current.statsUpdatedAt, sleep.endsAt, sleep.rest, now);
            energy = settled.energy;
            sleepiness = settled.sleepiness;
            statsUpdatedAt = settled.statsUpdatedAt;
            petStats[id] = { energy, sleepiness, statsUpdatedAt };
          } else {
            const stats = current.petStats[id];
            const settled = settlePetSleep(stats.energy, stats.sleepiness, stats.statsUpdatedAt, sleep.endsAt, sleep.rest, now);
            petStats[id] = { energy: settled.energy, sleepiness: settled.sleepiness, statsUpdatedAt: settled.statsUpdatedAt };
          }
          petSleep[id] = { endsAt: null, rest: 0, furnitureId: null };
        }
        const currentActiveSleep = petSleep[current.pet] ?? INITIAL_GAME.petSleep[current.pet];
        return {
          ...current,
          energy,
          sleepiness,
          statsUpdatedAt,
          petStats,
          petSleep,
          catFurniture: completedPets.includes(current.pet) ? null : current.catFurniture,
          sleepEndsAt: currentActiveSleep.endsAt,
          sleepRest: currentActiveSleep.rest,
        };
      });
      if (completedPets.includes(game.pet)) setToast(`${game.petNames[game.pet]}睡醒啦，困倦值降低 ${activeSleep.rest}`);
    };
    updateSleep();
    if (!Object.values(game.petSleep).some((sleep) => sleep.endsAt)) return;
    const timer = window.setInterval(updateSleep, 1000);
    return () => window.clearInterval(timer);
  }, [game.pet, game.petNames, game.petSleep, ready]);

  useEffect(() => {
    if (!ready || game.scene !== "room" || game.adoptedPets.length < 2) return;
    const updateRoommateAnimations = () => setRoommateAnimationNow(Date.now());
    const timer = window.setInterval(updateRoommateAnimations, 120);
    return () => window.clearInterval(timer);
  }, [game.adoptedPets.length, game.scene, ready]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const frames = ["/game/food-bowl-empty.png", ...pets.flatMap((item) => [item.idle, item.sleep, item.wake, item.walkSheet, ...item.wakeYawnFrames, ...item.walkFrames, ...item.groomFrames, ...item.scratchFrames])];
    animationImages.current = frames.map((src) => {
      const image = new Image();
      image.src = src;
      image.decode().catch(() => undefined);
      return image;
    });
    return () => { animationImages.current = []; };
  }, []);

  useEffect(() => {
    const image = new Image();
    image.src = getSceneAsset(game.scene === "room" ? "yard" : "room", weather.kind, timePeriod);
    image.decode().catch(() => undefined);
  }, [game.scene, timePeriod, weather.kind]);

  useEffect(() => {
    if (game.scene !== "room") return;
    const canvas = sceneCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
    };
    image.src = renderedSceneUrl;
    return () => { cancelled = true; };
  }, [game.scene, renderedSceneUrl]);

  useEffect(() => {
    if (!walking) {
      const timer = window.setTimeout(() => setWalkFrame(0), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setInterval(() => setWalkFrame((frame) => (frame + 1) % 4), WALK_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [walking]);

  useEffect(() => {
    if (!scratching) return;
    let frame = 0;
    scratchTimer.current = window.setInterval(() => {
      frame += 1;
      if (frame >= 8) {
        window.clearInterval(scratchTimer.current);
        setScratchFrame(0);
        setScratching(false);
        return;
      }
      setScratchFrame(frame % 4);
    }, 180);
    return () => window.clearInterval(scratchTimer.current);
  }, [scratching]);

  useEffect(() => {
    if (feedingBusy || game.scene !== "room" || !game.purchased.includes("yarnBasket") || overlay || decorating || walking || resting || lounging || wakingUp || scratching) return;
    const timer = window.setInterval(() => {
      if (Math.random() >= .2) return;
      const item = furnitureItems.find((furniture) => furniture.id === "yarnBasket")!;
      moveCatToFurniture(item, game.furniturePositions.yarnBasket ?? DEFAULT_FURNITURE_POSITIONS.yarnBasket);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [feedingBusy, decorating, game.catFurniture, game.catPosition.x, game.catPosition.y, game.energy, game.furniturePositions.yarnBasket, game.pet, game.purchased, game.scene, lounging, overlay, resting, scratching, wakingUp, walking]);

  useEffect(() => {
    if (!wakingUp) return;
    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      if (frame >= WAKE_SEQUENCE_LENGTH) {
        window.clearInterval(timer);
        setWakeFrame(0);
        setWakingUp(false);
        setStatusIdle(true);
        setToast("已经打完哈欠，可以继续活动了");
        return;
      }
      setWakeFrame(frame);
    }, 280);
    return () => window.clearInterval(timer);
  }, [wakingUp]);

  useEffect(() => {
    if (feedingBusy || overlay || walking || decorating || resting || lounging || scratching || wakingUp) return;
    if (statusIdle) {
      const timer = window.setTimeout(() => {
        if (desiredCatStatus !== catStatus) {
          setStatusTransition(getCatStatusTransition(catStatus, desiredCatStatus));
          setStatusTransitionTarget(desiredCatStatus);
        }
        setStatusFrame(0);
        setStatusIdle(false);
      }, STATUS_IDLE_MS);
      return () => window.clearTimeout(timer);
    }
    const frames = statusTransition ?? CAT_STATUS_ANIMATIONS[catStatus].frames;
    const currentFrame = frames[statusFrame] ?? frames[0];
    const timer = window.setTimeout(() => {
      if (statusFrame < frames.length - 1) {
        setStatusFrame((frame) => frame + 1);
        return;
      }
      if (statusTransition) {
        setCatStatus(statusTransitionTarget ?? desiredCatStatus);
        setStatusTransition(null);
        setStatusTransitionTarget(null);
        setStatusFrame(0);
        setStatusIdle(true);
        return;
      }
      setStatusFrame(0);
      setStatusIdle(true);
    }, currentFrame.duration);
    return () => window.clearTimeout(timer);
  }, [feedingBusy, catStatus, decorating, desiredCatStatus, lounging, overlay, resting, scratching, statusFrame, statusIdle, statusTransition, statusTransitionTarget, wakingUp, walking]);

  useEffect(() => {
    if (game.scene !== "room" || overlay || decorating || sceneTransition) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable='true']")) return;
      const moves: Record<string, Point> = {
        ArrowLeft: { x: -3, y: 0 }, a: { x: -3, y: 0 }, A: { x: -3, y: 0 },
        ArrowRight: { x: 3, y: 0 }, d: { x: 3, y: 0 }, D: { x: 3, y: 0 },
        ArrowUp: { x: 0, y: -3 }, w: { x: 0, y: -3 }, W: { x: 0, y: -3 },
        ArrowDown: { x: 0, y: 3 }, s: { x: 0, y: 3 }, S: { x: 0, y: 3 },
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      if (feedingRef.current.phase !== "IDLE") return;
      if (resting) {
        requestSleepInterrupt();
        return;
      }
      if (refuseMovement()) return;
      const position = readCatPosition(game.pet);
      walkCatTo({ x: position.x + move.x, y: position.y + move.y });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decorating, game.pet, game.purchased, game.furniturePositions, game.catFurniture, game.energy, game.scene, overlay, resting, sceneTransition, sleepRemainingMs, wakingUp]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const moveFurniture = (event: PointerEvent) => {
      const rect = roomRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = clampFurniturePosition({
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      }, FURNITURE_FOOTPRINTS[dragging]);
      setGame((current) => ({
        ...current,
        furniturePositions: { ...current.furniturePositions, [dragging]: point },
      }));
    };
    const stopDragging = () => setDragging(null);
    window.addEventListener("pointermove", moveFurniture);
    window.addEventListener("pointerup", stopDragging, { once: true });
    window.addEventListener("pointercancel", stopDragging, { once: true });
    return () => {
      window.removeEventListener("pointermove", moveFurniture);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [dragging]);

  useEffect(() => () => {
    window.clearTimeout(walkingTimer.current);
    window.cancelAnimationFrame(motionFrame.current);
    window.clearTimeout(headShakeTimer.current);
    window.clearTimeout(mixingTimer.current);
    window.clearTimeout(pouringTimer.current);
  }, []);

  const todayRecordCount = history.filter((record) => record.date === today).length;
  const nextJournalReward = getJournalReward(todayRecordCount + 1);
  const basePet = pets.find((item) => item.id === game.pet) ?? pets[0];
  const pet = { ...basePet, name: game.petNames[basePet.id] };
  const inspectedPetBase = pets.find((item) => item.id === inspectedPetId) ?? basePet;
  const inspectedPet = { ...inspectedPetBase, name: game.petNames[inspectedPetBase.id] };
  const inspectedPetStats = inspectedPetId === game.pet ? game : game.petStats[inspectedPetId];
  const nextMilestone = milestones.find((day) => day > game.streak);
  const ownedFurniture = furnitureItems.filter((item) => game.purchased.includes(item.id));
  const ownsCocktailBook = game.purchased.includes(COCKTAIL_BOOK.id);
  const selectedBookRecipe = cocktailRecipes[recipeBookIndex] ?? cocktailRecipes[0];
  const totalFood = foodItems.reduce((total, item) => total + game.inventory[item.id], 0);
  const totalProduce = cropItems.reduce((total, crop) => total + game.produce[crop.id], 0);
  const totalCocktails = Object.values(game.cocktailInventory).reduce((total, amount) => total + amount, 0);
  const totalBackpackItems = totalFood + totalProduce + totalCocktails + (ownsCocktailBook ? 1 : 0);
  const filteredIngredients = ingredientItems.filter((item) => ingredientFilter === "all" || item.category === ingredientFilter);
  const selectedShopIngredient = shopIngredientId ? getIngredient(shopIngredientId) : null;
  const ingredientPurchaseTotal = selectedShopIngredient ? selectedShopIngredient.price * purchaseQuantity : 0;
  const ingredientPurchaseStockAfter = selectedShopIngredient && selectedShopIngredient.id !== "ice"
    ? game.ingredientInventory[selectedShopIngredient.id] + selectedShopIngredient.packageAmount * purchaseQuantity
    : Infinity;
  const availableBarIngredients = ingredientItems.filter((item) => item.id === "ice" || getIngredientStock(game.ingredientInventory, item.id) > 0);
  const selectedMixIngredient = mixIngredientId ? getIngredient(mixIngredientId) : null;
  const mixLiquidTotal = getLiquidTotal(mixDraft);
  const mixIceDisplacement = getIceDisplacement(mixDraft);
  const mixOccupiedVolume = getOccupiedVolume(mixDraft);
  const mixIceCount = Math.floor(mixDraft.ice ?? 0);
  const mixLiquidLevel = mixLiquidTotal > 0 ? Math.min(.88, (mixOccupiedVolume / BAR_CAPACITY_ML) * .88) : 0;
  const mixFillHeight = Math.min(181, (mixOccupiedVolume / BAR_CAPACITY_ML) * 181);
  const mixColor = mixIngredientColors(mixDraft);
  const selectedMixStep = selectedMixIngredient?.unit === "ml" ? 5 : 1;
  const selectedMixReserved = selectedMixIngredient ? mixDraft[selectedMixIngredient.id] ?? 0 : 0;
  const selectedMixStock = selectedMixIngredient ? getIngredientStock(game.ingredientInventory, selectedMixIngredient.id) : 0;
  const selectedMixMax = selectedMixIngredient
    ? Math.max(0, Math.floor(Math.min(
      selectedMixStock === Infinity ? Math.max(0, 10 - selectedMixReserved) : selectedMixStock - selectedMixReserved,
      selectedMixIngredient.unit === "ml"
        ? BAR_CAPACITY_ML - mixOccupiedVolume
        : selectedMixIngredient.id === "ice"
          ? Math.floor((BAR_CAPACITY_ML - mixOccupiedVolume) / ICE_DISPLACEMENT_ML)
          : 10,
    ) / selectedMixStep) * selectedMixStep)
    : 0;
  const selectedFoodItem = foodItems.find((item) => item.id === selectedFood) ?? foodItems[0];
  const historyDates = [...new Set(history.map((record) => record.date))];
  const historyPageCount = Math.max(1, Math.ceil((historyMeta?.totalDays ?? historyDates.length) / 2));
  const historyPageDates = historyDates.slice(historyPage * 2, historyPage * 2 + 2);
  const pomodoroRemaining = getPomodoroRemaining(game.pomodoro, pomodoroNow);
  const pomodoroDuration = game.pomodoro.phase === "focus" ? POMODORO_FOCUS_MS : POMODORO_BREAK_MS;
  const pomodoroProgress = Math.min(1, Math.max(0, pomodoroRemaining / pomodoroDuration));
  const pomodoroStyle = { "--pomodoro-progress": `${pomodoroProgress * 360}deg` } as CSSProperties;
  const pomodoroActive = game.pomodoro.status === "running";
  const desktopPomodoroAvailable = typeof window !== "undefined" && Boolean(window.gameUpdater?.pomodoro);
  const desktopDataAvailable = typeof window !== "undefined" && Boolean(window.gameUpdater?.storage.exportBackup);
  const statusFrames = statusTransition ?? CAT_STATUS_ANIMATIONS[catStatus].frames;
  const currentStatusFrame: CatAnimationFrame = statusIdle
    ? { pose: catStatus === "low-high" ? "sleep" : "idle", duration: STATUS_IDLE_MS }
    : statusFrames[statusFrame] ?? statusFrames[0];
  const poseFrame = currentStatusFrame.frame ?? 0;
  const statusAsset = currentStatusFrame.pose === "walk"
    ? pet.walkFrames[poseFrame]
    : currentStatusFrame.pose === "groom"
      ? pet.groomFrames[poseFrame]
      : currentStatusFrame.pose === "yawn"
        ? pet.wakeYawnFrames[poseFrame]
        : currentStatusFrame.pose === "sleep"
          ? pet.sleep
          : currentStatusFrame.pose === "wake"
            ? pet.wake
            : pet.idle;
  const wakeSequenceAssets = [pet.sleep, pet.wake, ...WAKE_YAWN_SEQUENCE.map((frame) => pet.wakeYawnFrames[frame]), pet.idle];
  const activePose: CatPose = resting || lounging ? "sleep" : wakingUp ? "wake" : walking ? "walk" : currentStatusFrame.pose;
  const catAsset = scratching ? pet.scratchFrames[scratchFrame] : resting || lounging ? pet.sleep : wakingUp ? wakeSequenceAssets[wakeFrame] : walking ? pet.walkFrames[walkFrame] : statusAsset;
  const facingLeft = direction === "left" || direction === "up-left" || direction === "down-left";
  const motionX = feedingBusy || walking || resting || lounging || wakingUp || scratching ? 0 : (currentStatusFrame.x ?? 0) * (facingLeft ? -1 : 1);
  const motionY = feedingBusy || walking || resting || lounging || wakingUp || scratching ? 0 : currentStatusFrame.y ?? 0;

  useEffect(() => {
    if (!ready || game.scene !== "room" || feedingBusy) return;
    const update = () => {
      const placement = getBowlPlacement();
      if (placement) setBowlPosition((current) => current.x === placement.bowl.x && current.y === placement.bowl.y ? current : placement.bowl);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [ready, game.scene, game.furniturePositions, game.purchased, feedingBusy]);

  useEffect(() => {
    if (!feedingBusy) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (time: number) => {
      const previous = feedingRef.current;
      // Pause safely in background tabs instead of skipping the visible eating sequence.
      const next = advanceFeeding(previous, last === null ? 0 : Math.min(80, time - last));
      last = time;
      feedingRef.current = next;
      setFeeding(next);
      const moving = next.phase === "WALK_TO_BOWL";
      setWalking(moving);
      if (next.position.x !== previous.position.x || next.position.y !== previous.position.y) {
        setDirection(getWalkDirection(previous.position, next.position));
        setGame((current) => ({ ...current, catPosition: next.position, catFurniture: null }));
      }
      if (["ALIGN_AT_BOWL", "LOWER_HEAD", "EATING", "FINISH_EATING"].includes(next.phase)) setDirection("right");
      if (previous.bowl === "filled" && next.bowl === "empty") {
        setGame((current) => ({ ...current, energy: Math.min(100, current.energy + next.energy) }));
      }
      if (next.phase === "IDLE") {
        setWalking(false);
        setStatusFrame(0);
        setStatusIdle(true);
        setToast("吃饱啦，继续在小屋里玩耍吧");
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [feedingBusy]);

  useEffect(() => {
    if (!ready) return;
    window.gameUpdater?.pomodoroMini?.sync({ state: game.pomodoro, remaining: pomodoroRemaining, progress: pomodoroProgress });
  }, [game.pomodoro, pomodoroProgress, pomodoroRemaining, ready]);

  useEffect(() => {
    const mini = window.gameUpdater?.pomodoroMini;
    if (!mini) return;
    return mini.onAction((action) => {
      if (action === "pause") pausePomodoroTimer();
      else startPomodoroTimer();
    });
  }, [pomodoroActive]);

  async function enablePomodoroNotifications() {
    if (window.gameUpdater?.pomodoro || !("Notification" in window) || Notification.permission !== "default") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function preparePomodoroAudio() {
    if (!pomodoroAudioContextRef.current) pomodoroAudioContextRef.current = new AudioContext();
    if (pomodoroAudioContextRef.current.state === "suspended") void pomodoroAudioContextRef.current.resume();
  }

  function playPomodoroChime(phase: PomodoroPhase) {
    const audioContext = pomodoroAudioContextRef.current;
    if (!audioContext) return;
    void audioContext.resume().then(() => {
      const notes = phase === "focus" ? [659.25, 783.99, 987.77] : [783.99, 659.25];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const startsAt = audioContext.currentTime + index * .18;
        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, startsAt);
        gain.gain.exponentialRampToValueAtTime(.28, startsAt + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, startsAt + .32);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startsAt);
        oscillator.stop(startsAt + .33);
      });
    });
  }

  function startPomodoroTimer() {
    const now = Date.now();
    const currentDate = localDate(new Date(now));
    setPomodoroNow(now);
    setGame((current) => {
      const pomodoro = normalizePomodoro(current.pomodoro, currentDate);
      return { ...current, pomodoro: startPomodoro(pomodoro, now) };
    });
    preparePomodoroAudio();
    void enablePomodoroNotifications();
  }

  function pausePomodoroTimer() {
    const now = Date.now();
    setPomodoroNow(now);
    setGame((current) => ({ ...current, pomodoro: pausePomodoro(current.pomodoro, now) }));
  }

  function resetPomodoroTimer() {
    setPomodoroNow(Date.now());
    setGame((current) => ({ ...current, pomodoro: resetPomodoro(current.pomodoro) }));
    setPomodoroAlert(null);
  }

  function skipCurrentBreak() {
    setPomodoroNow(Date.now());
    setGame((current) => ({ ...current, pomodoro: skipPomodoroBreak(current.pomodoro) }));
    setPomodoroAlert(null);
    setToast("休息已结束，准备好后开始下一次专注吧");
  }

  function openOverlay(id: Exclude<OverlayId, null>) {
    setDecorating(false);
    if (id === "pomodoro") preparePomodoroAudio();
    if (id === "bag") {
      const firstOwned = foodItems.find((item) => game.inventory[item.id] > 0);
      if (firstOwned) setSelectedFood(firstOwned.id);
    }
    if (id === "bar") {
      setBarView("mix");
      setMixDraft({});
      setMixMethod(null);
      setMixIngredientId(null);
      setMixResult(null);
    }
    setOverlay(id);
  }

  function closeOverlay() {
    if (overlay === "bar" && mixing) return;
    if (overlay === "bar") {
      setMixDraft({});
      setMixMethod(null);
      setMixIngredientId(null);
      setMixResult(null);
    }
    setShopIngredientId(null);
    setOverlay(null);
  }

  function nextPhotoBoardSlot(photos: PhotoBoardPhoto[]) {
    const occupied = new Set(photos.map((photo) => photo.slot));
    let slot = 0;
    while (occupied.has(slot)) slot += 1;
    return slot;
  }

  function addPhotoBoardPhoto(photo: Omit<PhotoBoardPhoto, "createdAt" | "slot" | "rotation">) {
    const next = { ...photo, caption: photo.caption ?? "", createdAt: new Date().toISOString(), rotation: stablePhotoRotation(photo.id) };
    setPhotoBoardPhotos((current) => [...current, { ...next, slot: nextPhotoBoardSlot(current) }]);
    setUploadingPhotoId(next.id);
    window.setTimeout(() => setUploadingPhotoId((id) => id === next.id ? null : id), 900);
    setToast("照片已经挂到照片板上了");
  }

  async function uploadDesktopPhotoBoardPhoto() {
    const api = window.gameUpdater?.photoBoard;
    if (!api || uploadingPhotoId || photoUploadLock.current) return;
    photoUploadLock.current = true;
    setPhotoUploadBusy(true);
    try {
      const result = await api.select();
      if (result.status === "selected" && result.photo?.id && result.photo.fileName) addPhotoBoardPhoto(result.photo as Omit<PhotoBoardPhoto, "createdAt" | "slot" | "rotation">);
      else if (result.status === "error") setToast(result.message ?? "照片导入失败");
    } catch { setToast("照片导入失败"); }
    finally { photoUploadLock.current = false; setPhotoUploadBusy(false); }
  }

  async function uploadWebPhotoBoardPhoto(file: File) {
    if (uploadingPhotoId || photoUploadLock.current || !deviceId) return;
    photoUploadLock.current = true;
    setPhotoUploadBusy(true);
    try {
      const prepared = await preparePhotoFile(file);
      const form = new FormData();
      form.set("deviceId", deviceId); form.set("width", String(prepared.width)); form.set("height", String(prepared.height)); form.set("photo", prepared.blob, "photo-board.jpg");
      const response = await fetch("/api/photo-board-photos", { method: "POST", body: form });
      if (!response.ok) throw new Error("照片保存失败");
      const data = await response.json() as { photo: { id: string; key: string; width: number; height: number } };
      addPhotoBoardPhoto(data.photo);
    } catch (error) { setToast(error instanceof Error ? error.message : "照片导入失败"); }
    finally { photoUploadLock.current = false; setPhotoUploadBusy(false); }
  }

  function deletePhotoBoardPhoto(photo: PhotoBoardPhoto) {
    if (deletingPhotoId) return;
    setDeletingPhotoId(photo.id);
    window.setTimeout(async () => {
      let removed = true;
      if (photo.fileName) removed = await window.gameUpdater?.photoBoard?.remove(photo.fileName).catch(() => false) ?? false;
      else if (photo.key) removed = (await fetch("/api/photo-board-photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, key: photo.key }) }).catch(() => null))?.ok ?? false;
      if (removed) { setPhotoBoardPhotos((current) => current.filter((item) => item.id !== photo.id)); setToast("照片已经轻轻取下来了"); }
      else setToast("照片暂时无法删除，请稍后再试");
      setDeletingPhotoId(null);
    }, 360);
  }

  function updatePhotoBoardCaption(photoId: string, caption: string) {
    setPhotoBoardPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, caption } : photo));
  }

  async function nextHistoryPage() {
    const nextPage = historyPage + 1;
    if (nextPage >= historyPageCount || historyLoadLock.current) return;
    if (historyDates.length >= Math.min((nextPage + 1) * 2, historyMeta?.totalDays ?? historyDates.length) || !historyMeta?.nextCursor) {
      setHistoryPage(nextPage);
      return;
    }
    historyLoadLock.current = true;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/checkins?device=${encodeURIComponent(deviceId)}&before=${encodeURIComponent(historyMeta.nextCursor)}`);
      if (!response.ok) throw new Error();
      const data = await response.json() as HistoryBatch;
      setHistory((current) => {
        const ids = new Set(current.map((record) => record.id));
        return [...current, ...data.records.filter((record) => !ids.has(record.id))];
      });
      setHistoryMeta((current) => ({ total: Math.max(current?.total ?? 0, data.total), totalDays: Math.max(current?.totalDays ?? 0, data.totalDays), nextCursor: data.nextCursor }));
      if (data.records.length) setHistoryPage((current) => current === nextPage - 1 ? nextPage : current);
    } catch { setToast("旧日记暂时无法载入，请再试一次"); }
    finally { historyLoadLock.current = false; setHistoryLoading(false); }
  }

  async function exportDesktopBackup() {
    const storage = window.gameUpdater?.storage;
    if (!storage || dataTransferBusy) return;
    setDataTransferBusy("export");
    const result = await storage.exportBackup().catch(() => ({ status: "error", message: "备份导出失败" } as BackupActionResult));
    setDataTransferBusy(null);
    if (result.status === "exported") setToast("完整备份已导出，可以复制到 Mac 了");
    else if (result.status === "error") setToast(result.message ?? "备份导出失败");
  }

  async function importDesktopBackup() {
    const storage = window.gameUpdater?.storage;
    if (!storage || dataTransferBusy || !window.confirm("导入后会用备份覆盖当前进度。导入前会自动保留当前存档，是否继续？")) return;
    setDataTransferBusy("import");
    const result = await storage.importBackup().catch(() => ({ status: "error", message: "备份导入失败" } as BackupActionResult));
    if (result.status === "imported") {
      storage.refreshCache();
      window.sessionStorage.setItem("oh-backup-imported", "yes");
      window.location.reload();
      return;
    }
    setDataTransferBusy(null);
    if (result.status === "error") setToast(result.message ?? "备份导入失败");
  }

  function openIngredientPurchase(id: IngredientId) {
    const ingredient = getIngredient(id);
    if (ingredient.id === "ice") return;
    setPurchaseQuantity(1);
    setShopIngredientId(id);
  }

  function confirmIngredientPurchase() {
    if (!selectedShopIngredient || selectedShopIngredient.id === "ice" || ingredientPurchaseLock.current) return;
    const totalPrice = selectedShopIngredient.price * purchaseQuantity;
    if (game.berries < totalPrice) {
      setToast("草莓不足");
      return;
    }
    ingredientPurchaseLock.current = true;
    setIngredientPurchaseBusy(true);
    const ingredient = selectedShopIngredient;
    const stockId = ingredient.id as StockedIngredientId;
    setGame((current) => ({
      ...current,
      berries: current.berries - totalPrice,
      ingredientInventory: {
        ...current.ingredientInventory,
        [stockId]: current.ingredientInventory[stockId] + ingredient.packageAmount * purchaseQuantity,
      },
    }));
    setToast(`获得${ingredient.name}${formatIngredientAmount(ingredient.packageAmount * purchaseQuantity, ingredient.unit)}`);
    window.setTimeout(() => {
      ingredientPurchaseLock.current = false;
      setIngredientPurchaseBusy(false);
      setShopIngredientId(null);
    }, 260);
  }

  function openMixIngredient(id: IngredientId) {
    if (mixing || mixResult) return;
    const ingredient = getIngredient(id);
    const stock = getIngredientStock(game.ingredientInventory, id);
    const reserved = mixDraft[id] ?? 0;
    const step = ingredient.unit === "ml" ? 5 : 1;
    const remainingVolume = Math.max(0, BAR_CAPACITY_ML - mixOccupiedVolume);
    const maximum = Math.max(0, Math.floor(Math.min(
      stock === Infinity ? Math.max(0, 10 - reserved) : stock - reserved,
      ingredient.unit === "ml"
        ? remainingVolume
        : ingredient.id === "ice"
          ? Math.floor(remainingVolume / ICE_DISPLACEMENT_ML)
          : 10,
    ) / step) * step);
    if (!maximum) {
      const lacksCapacity = ingredient.id === "ice"
        ? remainingVolume < ICE_DISPLACEMENT_ML
        : ingredient.unit === "ml" && remainingVolume < step;
      setToast(lacksCapacity ? ingredient.id === "ice" ? "杯内空间不足，不能再放冰块" : "容器已经装满啦" : `${ingredient.name}库存不足`);
      return;
    }
    setMixIngredientAmount(Math.min(step, maximum));
    setMixIngredientId(id);
  }

  function addMixIngredient() {
    if (!selectedMixIngredient || mixIngredientAmount <= 0 || mixIngredientAmount > selectedMixMax) return;
    setMixDraft((current) => ({
      ...current,
      [selectedMixIngredient.id]: (current[selectedMixIngredient.id] ?? 0) + mixIngredientAmount,
    }));
    window.clearTimeout(pouringTimer.current);
    setPouring(selectedMixIngredient.id === "ice" ? "ice" : selectedMixIngredient.unit === "ml" ? "liquid" : null);
    pouringTimer.current = window.setTimeout(() => setPouring(null), selectedMixIngredient.id === "ice" ? 900 : 520);
    setMixIngredientId(null);
  }

  function removeMixIngredient(id: IngredientId) {
    if (mixing || mixResult) return;
    setMixDraft((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function clearMix() {
    if (mixing) return;
    setMixDraft({});
    setMixMethod(null);
    setMixIngredientId(null);
    setMixResult(null);
  }

  function startMixing() {
    const consumed = { ...mixDraft };
    const used = Object.entries(consumed).filter(([, amount]) => (amount ?? 0) > 0);
    if (!used.length) {
      setToast("先往杯子里加入材料吧");
      return;
    }
    if (!mixMethod) {
      setToast("请选择摇和、搅拌或直接调和");
      return;
    }
    if (mixingTransactionLock.current) return;
    for (const [id, amount] of used) {
      if (id !== "ice" && (amount ?? 0) > game.ingredientInventory[id as StockedIngredientId]) {
        setToast(`${getIngredient(id as IngredientId).name}库存不足`);
        return;
      }
    }
    const selectedMethod = mixMethod;
    const result = evaluateCocktail(consumed, selectedMethod);
    const firstUnlock = result.success && !game.cocktailCollection[result.recipe.id].unlocked;
    mixingTransactionLock.current = true;
    setMixing(true);
    setMixResult(null);
    const duration = selectedMethod === "shake" ? 1250 : selectedMethod === "stir" ? 1100 : 900;
    mixingTimer.current = window.setTimeout(() => {
      setGame((current) => {
        const ingredientInventory = { ...current.ingredientInventory };
        for (const [id, amount] of used) {
          if (id === "ice") continue;
          const stockId = id as StockedIngredientId;
          ingredientInventory[stockId] = Math.max(0, ingredientInventory[stockId] - (amount ?? 0));
        }
        if (!result.success) return { ...current, ingredientInventory };
        const previous = current.cocktailCollection[result.recipe.id];
        const improved = result.score > previous.bestScore;
        return {
          ...current,
          ingredientInventory,
          cocktailCollection: {
            ...current.cocktailCollection,
            [result.recipe.id]: {
              ...previous,
              unlocked: true,
              bestScore: Math.max(previous.bestScore, result.score),
              bestQuality: improved ? result.quality : previous.bestQuality,
            },
          },
          cocktailInventory: {
            ...current.cocktailInventory,
            [result.recipe.id]: current.cocktailInventory[result.recipe.id] + 1,
          },
        };
      });
      setMixResult({ ...result, firstUnlock, consumed });
      setMixing(false);
      mixingTransactionLock.current = false;
    }, duration);
  }

  function goToIngredientShop() {
    if (mixing) return;
    setMixDraft({});
    setMixMethod(null);
    setMixIngredientId(null);
    setMixResult(null);
    setIngredientFilter("all");
    setShopCategory("ingredients");
    setOverlay("shop");
  }

  function resetStatusAnimation() {
    setCatStatus(desiredCatStatus);
    setStatusFrame(0);
    setStatusIdle(true);
    setStatusTransition(null);
    setStatusTransitionTarget(null);
  }

  function requestSleepInterrupt() {
    if (feedingRef.current.phase !== "IDLE") return;
    if (!resting || wakingUp || interruptConfirm || Date.now() < sleepInterruptReadyAt.current) return;
    setInterruptConfirm(true);
  }

  function continueSleeping() {
    setInterruptConfirm(false);
    sleepInterruptReadyAt.current = Date.now() + 1200;
  }

  function interruptSleep() {
    setInterruptConfirm(false);
    setResting(false);
    setSleepRemainingMs(0);
    resetStatusAnimation();
    setWakeFrame(0);
    setWakingUp(true);
    setGame((current) => ({
      ...current,
      statsUpdatedAt: Date.now(),
      petStats: { ...current.petStats, [current.pet]: { energy: current.energy, sleepiness: current.sleepiness, statsUpdatedAt: Date.now() } },
      petSleep: { ...current.petSleep, [current.pet]: { endsAt: null, rest: 0, furnitureId: null } },
      sleepEndsAt: null,
      sleepRest: 0,
    }));
    setToast("睡眠已取消，本次不会降低困倦值");
  }

  function refuseMovement(allowNoEnergy = false) {
    if (feedingRef.current.phase !== "IDLE") return true;
    if (wakingUp) {
      setToast("正在打哈欠起床，请稍等一下");
      return true;
    }
    if (resting) {
      setToast(`${pet.name}正在睡觉，还剩 ${formatSleepRemaining(sleepRemainingMs)}`);
      return true;
    }
    if (allowNoEnergy || canPetMove(game.energy)) return false;
    setWalking(false);
    resetStatusAnimation();
    setHeadShaking(true);
    window.clearTimeout(headShakeTimer.current);
    headShakeTimer.current = window.setTimeout(() => setHeadShaking(false), 650);
    setToast(`${pet.name}没有活力了，先喂点食物吧`);
    return true;
  }

  function getSceneObstacles(excludeFurniture?: string, includeOccupied = false, includeBowl = true): Rect[] {
    if (game.scene === "yard") return YARD_OBSTACLES;
    const room = roomRef.current?.getBoundingClientRect();
    const catWidth = roomRef.current?.querySelector<HTMLElement>(".walking-cat")?.getBoundingClientRect().width ?? 100;
    const bowl = roomRef.current?.querySelector<HTMLElement>(".food-bowl")?.getBoundingClientRect();
    const bowlObstacles = includeBowl && room?.width && bowl?.width ? [furnitureCollision(bowl, room, catWidth)] : [];
    return [...ROOM_FIXED_OBSTACLES, ...bowlObstacles, ...ownedFurniture.flatMap((item) => {
      if (item.id === "rug") return [];
      if (item.id === excludeFurniture || !includeOccupied && item.id === game.catFurniture) return [];
      const bounds = roomRef.current?.querySelector<HTMLElement>(`[data-furniture="${item.id}"]`)?.getBoundingClientRect();
      if (room?.width && bounds?.width) return [furnitureCollision(bounds, room, catWidth)];
      const footprint = FURNITURE_FOOTPRINTS[item.id];
      if (!footprint) return [];
      const position = game.furniturePositions[item.id] ?? DEFAULT_FURNITURE_POSITIONS[item.id];
      return [{ left: position.x - footprint.halfWidth, right: position.x + footprint.halfWidth, top: position.y - footprint.height, bottom: position.y + 2 }];
    })];
  }

  function readCatPosition(id: PetId): Point {
    const room = roomRef.current?.getBoundingClientRect();
    const element = roomRef.current?.querySelector<HTMLElement>(`[data-pet-id="${id}"]`);
    const bounds = (element?.querySelector<HTMLElement>(".cat-base") ?? element)?.getBoundingClientRect();
    if (!room?.width || !bounds?.width) return id === game.pet ? game.catPosition : game.petPositions[id] ?? ROOMMATE_POSITIONS[id];
    return { x: (bounds.left + bounds.width / 2 - room.left) / room.width * 100, y: (bounds.top + bounds.height * .79 - room.top) / room.height * 100 };
  }

  function getBowlPlacement(petId = game.pet) {
    const room = roomRef.current?.getBoundingClientRect();
    const cat = roomRef.current?.querySelector<HTMLElement>(".walking-cat")?.getBoundingClientRect();
    const bowl = roomRef.current?.querySelector<HTMLElement>(".food-bowl")?.getBoundingClientRect();
    const mouthOffset = getFeedingDockOffset(petId, cat?.width ?? 100, bowl?.width ?? 64);
    const offset = room?.width ? { x: mouthOffset.x / room.width * 100, y: mouthOffset.y / room.height * 100 } : { x: 4, y: 4 };
    const hudObstacles: Rect[] = room?.width ? Array.from(document.querySelectorAll<HTMLElement>(".pet-status, .game-dock")).map((node) => {
      const bounds = node.getBoundingClientRect();
      return { left: (bounds.left - room.left) / room.width * 100, right: (bounds.right - room.left) / room.width * 100,
        top: (bounds.top - room.top) / room.height * 100, bottom: (bounds.bottom - room.top) / room.height * 100 };
    }) : [];
    const clearance = room?.width && bowl ? { x: bowl.width * .43 / room.width * 100, y: bowl.width * .26 / room.height * 100 } : undefined;
    return findBowlPlacement([...getSceneObstacles(undefined, true, false), ...hudObstacles], offset, clearance);
  }

  function playTrack(track: PlaylistTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    if (!track.playbackUrl) {
      setToast(`${track.name} 受网易云版权或会员限制，当前无法直接播放`);
      return;
    }
    if (recoveringTrackId.current !== track.id) lastPlaybackRecovery.current = null;
    if (playingTrackId !== track.id) {
      audio.dataset.trackId = String(track.id);
      audio.src = track.playbackUrl;
      audio.load();
      setPlayingTrackId(track.id);
    }
    audio.play().catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError") && !audio.error) setToast("这首歌暂时无法播放，请稍后再试");
    });
  }

  async function recoverPlayback() {
    const audio = audioRef.current;
    const track = playlist?.tracks.find((item) => item.id === playingTrackId);
    if (!audio || !track || !isRemotePlaybackUrl(track.playbackUrl)) {
      setIsPlaying(false);
      setToast("歌曲加载失败，请重试或切换下一首");
      return;
    }
    const now = Date.now();
    const previousRecovery = lastPlaybackRecovery.current;
    if (recoveringTrackId.current === track.id) return;
    if (previousRecovery?.trackId === track.id && now - previousRecovery.attemptedAt < 30_000) {
      setIsPlaying(false);
      setToast("歌曲地址刷新后仍无法播放，请切换下一首");
      return;
    }

    const resumeAt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    recoveringTrackId.current = track.id;
    lastPlaybackRecovery.current = { trackId: track.id, attemptedAt: now };
    setIsPlaying(false);
    setToast("播放地址已过期，正在自动刷新…");
    try {
      const refreshedPlaylist = await fetchPlaylist();
      const refreshedTrack = refreshedPlaylist.tracks.find((item) => item.id === track.id);
      if (!refreshedTrack?.playbackUrl) throw new Error("没有新的播放地址");
      setPlaylist(refreshedPlaylist);
      if (audio.dataset.trackId !== String(track.id)) return;
      audio.addEventListener("loadedmetadata", () => {
        if (resumeAt > 0 && Number.isFinite(audio.duration)) audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - .25));
      }, { once: true });
      audio.src = refreshedTrack.playbackUrl;
      audio.load();
      await audio.play();
      setToast(`${track.name} 已恢复播放`);
    } catch {
      setIsPlaying(false);
      setToast("播放地址刷新失败，请检查网络或切换下一首");
    } finally {
      if (recoveringTrackId.current === track.id) recoveringTrackId.current = null;
    }
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playingTrackId) {
      const firstTrack = playlist?.tracks.find((track) => track.playbackUrl);
      if (firstTrack) playTrack(firstTrack);
      return;
    }
    if (audio.paused) audio.play().catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError") && !audio.error) setToast("歌曲暂时无法继续播放");
    });
    else audio.pause();
  }

  function skipTrack(offset: number) {
    const playableTracks = playlist?.tracks.filter((track) => track.playbackUrl) ?? [];
    if (!playableTracks.length) return;
    const currentIndex = playableTracks.findIndex((track) => track.id === playingTrackId);
    const nextIndex = currentIndex < 0 ? (offset > 0 ? 0 : playableTracks.length - 1) : (currentIndex + offset + playableTracks.length) % playableTracks.length;
    playTrack(playableTracks[nextIndex]);
  }

  function moveCat(event: React.PointerEvent<HTMLDivElement>) {
    if (game.scene !== "room" || decorating || overlay || sceneTransition || (event.target as HTMLElement).closest("[data-interactive], [data-furniture]")) return;
    if (resting) {
      requestSleepInterrupt();
      return;
    }
    if (refuseMovement()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const obstacles = getSceneObstacles();
    const target = clampToScene({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    }, game.scene, obstacles);
    walkCatTo(target);
    event.currentTarget.focus();
  }

  function walkCatTo(target: Point, onFinished?: () => void, shouldJump = false, excludeFurniture?: string) {
    if (feedingRef.current.phase !== "IDLE") return;
    const obstacles = getSceneObstacles(excludeFurniture);
    const start = readCatPosition(game.pet);
    const path = getWalkPath(start, target, game.scene, obstacles);
    if (!path.length) { setToast("这里暂时走不过去，试试其他位置吧"); return; }
    window.clearTimeout(walkingTimer.current);
    window.cancelAnimationFrame(motionFrame.current);
    let from = start;
    resetStatusAnimation();
    setResting(false);
    setLounging(false);
    setScratching(false);
    setJumping(shouldJump);
    setWalking(true);
    const step = (index: number) => {
      const destination = path[index];
      const origin = from;
      const duration = Math.round(clamp(Math.hypot(destination.x - from.x, destination.y - from.y) * 14, WALK_CYCLE_MS * 2, 900));
      const stepDirection = getWalkDirection(from, destination);
      setDirection(stepDirection);
      setWalkDuration(0);
      let startedAt: number | null = null;
      const animate = (time: number) => {
        startedAt ??= time;
        const ratio = Math.min(1, (time - startedAt) / duration);
        const point = { x: origin.x + (destination.x - origin.x) * ratio, y: origin.y + (destination.y - origin.y) * ratio };
        setGame((current) => ({ ...current, catPosition: point, catFurniture: null }));
        from = point;
        if (ratio < 1) motionFrame.current = window.requestAnimationFrame(animate);
        else walkingTimer.current = window.setTimeout(() => {
          if (index + 1 < path.length) step(index + 1);
          else { setWalking(false); setJumping(false); onFinished?.(); }
        }, 60);
      };
      motionFrame.current = window.requestAnimationFrame(animate);
    };
    step(0);
  }

  function moveCatToFurniture(item: (typeof furnitureItems)[number], position: Point, heightOverride?: number) {
    if (refuseMovement(Boolean(item.rest))) return;
    if (item.rest) {
      const occupyingPet = game.adoptedPets.find((id) => {
        if (id === game.pet) return false;
        const sleep = game.petSleep[id] ?? INITIAL_GAME.petSleep[id];
        return sleep.furnitureId === item.id && getSleepRemainingMs(sleep.endsAt) > 0;
      });
      if (occupyingPet) {
        setToast(`${game.petNames[occupyingPet]}正在${item.name}睡觉，请换一个猫窝`);
        return;
      }
    }
    const target = getFurnitureTarget(position, heightOverride ?? item.standHeight);
    walkCatTo(target, () => {
      setGame((current) => ({ ...current, catFurniture: target.onTop ? item.id : null }));
      if (item.rest) {
        const sleepEndsAt = Date.now() + SLEEP_DURATION_MS;
        setResting(true);
        setSleepRemainingMs(SLEEP_DURATION_MS);
        sleepInterruptReadyAt.current = Date.now() + 900;
        setGame((current) => ({
          ...current,
          statsUpdatedAt: Date.now(),
          petStats: { ...current.petStats, [current.pet]: { energy: current.energy, sleepiness: current.sleepiness, statsUpdatedAt: Date.now() } },
          petSleep: { ...current.petSleep, [current.pet]: { endsAt: sleepEndsAt, rest: item.rest, furnitureId: item.id } },
          sleepEndsAt,
          sleepRest: item.rest,
        }));
        setToast(`${pet.name}开始在${item.name}睡觉，3小时后困倦值降低 ${item.rest}`);
      } else if ("lounge" in item && item.lounge) {
        setLounging(true);
        setToast(`${pet.name}在${item.name}上安静地休息`);
      } else if ("action" in item && item.action === "scratch") {
        setScratching(true);
        setToast(item.id === "yarnBasket" ? `${pet.name}拨动了彩色毛线球` : `${pet.name}认真磨了磨小爪子`);
      }
    }, target.jumping, item.id);
  }

  async function checkIn(event: React.FormEvent) {
    event.preventDefault();
    const content = noteText.trim();
    if (!ready || !content || !deviceId || savingCheckin || checkinSaveLock.current || !historyReady) return;
    const submittedDraft = noteText;
    const submittedAt = new Date();
    const date = localDate(submittedAt);
    setToday(date);
    setDateLabel(submittedAt.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" }));
    const recordCount = history.filter((record) => record.date === date).length;
    let reward: number = getJournalReward(recordCount + 1);
    checkinSaveLock.current = true;
    setSavingCheckin(true);
    try {
      let record: CheckinRecord;
      if (navigator.userAgent.includes("BerryWorkoutDesktop")) {
        record = { id: Date.now(), date, content, category, rating, reward, createdAt: submittedAt.toISOString() };
        const records = [record, ...history];
        writePersisted("berry-workout-history", JSON.stringify(records));
      } else {
        const response = await fetch("/api/checkins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId, date, content, category, rating }),
        });
        if (!response.ok) throw new Error();
        record = (await response.json() as { record: CheckinRecord }).record;
        reward = record.reward ?? 0;
      }
      setHistory((records) => [record, ...records.filter((item) => item.id !== record.id)]);
      setHistoryMeta((meta) => meta ? { ...meta, total: meta.total + 1, totalDays: meta.totalDays + (history.some((item) => item.date === date) ? 0 : 1) } : null);
      setGame((current) => ({ ...current, berries: current.berries + reward, streak: getJournalStreak(current.lastCheckin, current.streak, date, true), lastCheckin: date, lastActivity: content }));
      setNoteText((draft) => draft === submittedDraft ? "" : draft);
      writePersisted("berry-journal-category", category);
      setToast(reward ? `今天的记忆已经收好啦，获得 ${reward} 个草莓 🍓` : "今天的三次记录奖励已经领完，记忆仍然收好啦");
    } catch {
      setToast("记录保存失败，请稍后再试");
    } finally {
      checkinSaveLock.current = false;
      setSavingCheckin(false);
    }
  }

  function buyFood(item: (typeof storeFoodItems)[number]) {
    if (game.berries < item.price) {
      setToast("草莓不够，再写几篇日记吧！");
      return;
    }
    setGame((current) => ({
      ...current,
      berries: current.berries - item.price,
      inventory: { ...current.inventory, [item.id]: current.inventory[item.id] + 1 },
    }));
    setToast(`${item.name} 已放进背包`);
  }

  function buyFurniture(item: (typeof furnitureItems)[number]) {
    if (feedingRef.current.phase !== "IDLE") { setToast("等猫咪吃完再摆放新家具吧"); return; }
    if (game.purchased.includes(item.id)) return;
    if (game.berries < item.price) {
      setToast("草莓不够，再写几篇日记吧！");
      return;
    }
    setGame((current) => ({
      ...current,
      berries: current.berries - item.price,
      purchased: [...current.purchased, item.id],
      furniturePositions: { ...current.furniturePositions, [item.id]: DEFAULT_FURNITURE_POSITIONS[item.id] },
    }));
    setToast(`${item.name} 已送到小屋`);
  }

  function openCocktailBook() {
    if (!ownsCocktailBook) return;
    setRecipeBookIndex(0);
    setOverlay("recipe-book");
  }

  function buyCocktailBook() {
    if (ownsCocktailBook) {
      openCocktailBook();
      return;
    }
    if (game.berries < COCKTAIL_BOOK.price) {
      setToast("草莓不够，再写几篇日记吧！");
      return;
    }
    setGame((current) => {
      if (current.purchased.includes(COCKTAIL_BOOK.id) || current.berries < COCKTAIL_BOOK.price) return current;
      return {
        ...current,
        berries: current.berries - COCKTAIL_BOOK.price,
        purchased: [...current.purchased, COCKTAIL_BOOK.id],
      };
    });
    setRecipeBookIndex(0);
    setOverlay("bag");
    setToast("莓果调酒书已放进背包");
  }

  function feedPet(foodId: FoodId) {
    if (feedingRef.current.phase !== "IDLE") return;
    if (!ready || sceneTransition || decorating || game.scene !== "room") { setToast("回到小屋后再投喂吧"); return; }
    const item = foodItems.find((food) => food.id === foodId)!;
    if (!game.inventory[foodId]) {
      setToast("背包里没有这种食物了");
      return;
    }
    if (inspectedPetStats.energy >= 100) {
      setToast(`${inspectedPet.name} 现在精神满满！`);
      return;
    }
    const sleep = game.petSleep[inspectedPetId];
    const placement = getBowlPlacement(inspectedPetId);
    const from = readCatPosition(inspectedPetId);
    const session = placement && beginFeeding(feedingRef.current, {
      from, target: placement.target, obstacles: getSceneObstacles(sleep?.furnitureId ?? undefined),
      sleeping: getSleepRemainingMs(sleep?.endsAt) > 0 || inspectedPetId === game.pet && (lounging || wakingUp || currentStatusFrame.pose === "sleep"),
      petId: inspectedPetId, foodId, energy: item.energy,
    });
    if (!session) { setToast("碗边暂时走不过去，请先给猫咪留一点空地"); return; }
    // Switch first, then acquire the synchronous session lock before any animation or inventory update.
    if (inspectedPetId !== game.pet) switchControlledPet(inspectedPetId);
    feedingRef.current = session;
    setFeeding(session);
    setBowlPosition(placement!.bowl);
    window.clearTimeout(walkingTimer.current);
    window.cancelAnimationFrame(motionFrame.current);
    window.clearInterval(scratchTimer.current);
    window.clearTimeout(headShakeTimer.current);
    setWalking(false);
    setJumping(false);
    setResting(false);
    setLounging(false);
    setScratching(false);
    setWakingUp(false);
    setHeadShaking(false);
    setInterruptConfirm(false);
    setSleepRemainingMs(0);
    setWalkDuration(0);
    resetStatusAnimation();
    setGame((current) => ({
      ...current, catPosition: from,
      inventory: { ...current.inventory, [foodId]: current.inventory[foodId] - 1 },
      petSleep: { ...current.petSleep, [inspectedPetId]: { endsAt: null, rest: 0, furnitureId: null } },
      sleepEndsAt: null, sleepRest: 0, statsUpdatedAt: Date.now(),
    }));
    setOverlay(null);
    setToast(session.phase === "WAKING" ? `${inspectedPet.name}闻到香味，起床吃饭啦` : `${inspectedPet.name}正走向食物碗`);
  }

  function cookDish(dish: (typeof cookedDishes)[number]) {
    if (game.cooking) {
      setToast("灶台正在忙，等这道菜做好吧");
      return;
    }
    if (!game.produce[dish.cropId]) {
      setToast(`背包里没有${cropItems.find((crop) => crop.id === dish.cropId)?.name}了`);
      return;
    }
    const startedAt = Date.now();
    setKitchenNow(startedAt);
    setGame((current) => ({
      ...current,
      produce: { ...current.produce, [dish.cropId]: current.produce[dish.cropId] - 1 },
      cooking: { dishId: dish.id, startedAt, endsAt: startedAt + dish.cookMinutes * 60_000 },
    }));
    setToast(`${dish.name}开始烹饪，${dish.cookMinutes} 分钟后完成`);
  }

  function switchControlledPet(id: PetId) {
    if (feedingRef.current.phase !== "IDLE") return;
    if (id === game.pet) return;
    const now = Date.now();
    const targetSleep = game.petSleep[id] ?? INITIAL_GAME.petSleep[id];
    const targetSleepRemaining = getSleepRemainingMs(targetSleep.endsAt, now);
    const savedTargetStats = game.petStats[id] ?? INITIAL_GAME.petStats[id];
    const targetStats = settlePetSleep(savedTargetStats.energy, savedTargetStats.sleepiness, savedTargetStats.statsUpdatedAt > 0 ? savedTargetStats.statsUpdatedAt : now, targetSleep.endsAt, targetSleep.rest, now);
    window.clearTimeout(walkingTimer.current);
    window.cancelAnimationFrame(motionFrame.current);
    setWalking(false);
    setJumping(false);
    setLounging(false);
    setScratching(false);
    setWakingUp(false);
    setHeadShaking(false);
    setInterruptConfirm(false);
    setResting(targetSleepRemaining > 0);
    setSleepRemainingMs(targetSleepRemaining);
    sleepInterruptReadyAt.current = now + 300;
    setCatStatus(getCatStatus(targetStats.energy, targetStats.sleepiness));
    setStatusFrame(0);
    setStatusIdle(true);
    setStatusTransition(null);
    setStatusTransitionTarget(null);
    setInspectedPetId(id);
    setOverlay(null);
    setGame((current) => {
      const currentTargetStats = current.petStats[id] ?? INITIAL_GAME.petStats[id];
      const currentTargetSleep = current.petSleep[id] ?? INITIAL_GAME.petSleep[id];
      const settled = settlePetSleep(currentTargetStats.energy, currentTargetStats.sleepiness, currentTargetStats.statsUpdatedAt > 0 ? currentTargetStats.statsUpdatedAt : now, currentTargetSleep.endsAt, currentTargetSleep.rest, now);
      const nextStats = { energy: settled.energy, sleepiness: settled.sleepiness, statsUpdatedAt: settled.statsUpdatedAt };
      return {
        ...current,
        pet: id,
        adoptedPets: current.adoptedPets.includes(id) ? current.adoptedPets : [...current.adoptedPets, id],
        petStats: {
          ...current.petStats,
          [current.pet]: { energy: current.energy, sleepiness: current.sleepiness, statsUpdatedAt: current.statsUpdatedAt },
          [id]: nextStats,
        },
        petSleep: settled.sleepEnded ? { ...current.petSleep, [id]: { endsAt: null, rest: 0, furnitureId: null } } : current.petSleep,
        ...nextStats,
        catPosition: current.petPositions[id] ?? ROOMMATE_POSITIONS[id],
        petPositions: {
          ...current.petPositions,
          [current.pet]: current.catPosition,
          [id]: current.petPositions[id] ?? ROOMMATE_POSITIONS[id],
        },
        catFurniture: getSleepRemainingMs(currentTargetSleep.endsAt, now) > 0 ? currentTargetSleep.furnitureId : null,
        sleepEndsAt: settled.sleepEndsAt,
        sleepRest: settled.sleepRest,
      };
    });
  }

  function cycleControlledPet() {
    if (feedingRef.current.phase !== "IDLE") return;
    const index = game.adoptedPets.indexOf(game.pet);
    const id = game.adoptedPets[(index + 1) % game.adoptedPets.length];
    switchControlledPet(id);
    setToast(`已切换控制 ${game.petNames[id]}`);
  }

  function adoptPet(id: PetId) {
    if (feedingRef.current.phase !== "IDLE") return;
    const chosen = pets.find((item) => item.id === id)!;
    if (game.adoptedPets.includes(id)) {
      switchControlledPet(id);
      setToast(`已切换控制 ${game.petNames[id]}`);
      return;
    }
    switchControlledPet(id);
    setToast(`${chosen.name} 已经住进小屋，现在由你控制啦！`);
  }

  function resetFurniture() {
    if (feedingRef.current.phase !== "IDLE") return;
    setGame((current) => ({ ...current, furniturePositions: { ...DEFAULT_FURNITURE_POSITIONS } }));
    setToast("家具已经恢复到推荐位置");
  }

  function changeScene() {
    if (feedingRef.current.phase !== "IDLE") { setToast("等猫咪吃完再出门吧"); return; }
    if (sceneTransition) return;
    if (resting) {
      setToast(`${pet.name}正在睡觉，还剩 ${formatSleepRemaining(sleepRemainingMs)}`);
      return;
    }
    setOverlay(null);
    setDecorating(false);
    setSeedStorageOpen(false);
    setSelectedSeed(null);
    setWatering(false);
    setWateringPlot(null);
    setLounging(false);
    setScratching(false);
    window.clearTimeout(walkingTimer.current);
    window.cancelAnimationFrame(motionFrame.current);
    setWalking(false);
    setSceneTransition(true);
    window.setTimeout(() => {
      setGame((current) => ({
        ...current,
        scene: current.scene === "room" ? "yard" : "room",
        catPosition: current.scene === "yard" ? { x: 70, y: 61 } : current.catPosition,
        catFurniture: null,
      }));
      window.setTimeout(() => setSceneTransition(false), 80);
    }, 320);
  }

  function buySeed(cropId: CropId) {
    const crop = cropItems.find((item) => item.id === cropId)!;
    if (game.berries < crop.seedPrice) {
      setToast("草莓不够，先完成记录或收获作物吧");
      return;
    }
    setGame((current) => ({
      ...current,
      berries: current.berries - crop.seedPrice,
      seeds: { ...current.seeds, [cropId]: current.seeds[cropId] + 1 },
    }));
    setToast(`买到一包${crop.name}种子`);
  }

  function plantCrop(index: number, cropId: CropId) {
    if (!game.seeds[cropId]) {
      setToast("先买一包种子吧");
      return;
    }
    const now = Date.now();
    const wateredAt = weather.kind === "rain" || weather.kind === "thunderstorm" ? now : null;
    setGame((current) => ({
      ...current,
      seeds: { ...current.seeds, [cropId]: current.seeds[cropId] - 1 },
      farmPlots: current.farmPlots.map((plot, plotIndex) => plotIndex === index ? { cropId, plantedAt: now, wateredAt } : plot),
    }));
    if (game.seeds[cropId] <= 1) setSelectedSeed(null);
    setFarmNow(now);
    setPlotEffect({ index, type: "seed" });
    window.setTimeout(() => setPlotEffect(null), 700);
    setToast(wateredAt ? "种子种下啦，雨水也帮忙浇好了" : "种子种下啦，记得去拿浇水壶");
  }

  function handlePlot(index: number) {
    const plot = game.farmPlots[index];
    if (!plot) {
      if (watering) setToast("这块田还没有播种");
      else if (selectedSeed) plantCrop(index, selectedSeed);
      else setToast("先点击右侧种子仓库选择种子");
      return;
    }
    if (selectedSeed) {
      setToast("这块田已经有作物了，换一块空田吧");
      return;
    }
    if (watering) {
      setWateringPlot(index);
      window.setTimeout(() => setWateringPlot(null), 900);
      if (plot.wateredAt) setToast("这块土已经湿润啦");
      else {
        const now = Date.now();
        setGame((current) => ({ ...current, farmPlots: current.farmPlots.map((item, plotIndex) => plotIndex === index && item ? { ...item, wateredAt: now } : item) }));
        setFarmNow(now);
        setPlotEffect({ index, type: "water" });
        window.setTimeout(() => setPlotEffect(null), 900);
        setToast("浇好水啦，种子开始慢慢长大");
      }
      return;
    }
    if (getCropStage(plot, farmNow) !== "mature") {
      setToast(plot.wateredAt ? "还在慢慢长大，再等等吧" : "还没浇水，种子正在土里等你");
      return;
    }
    const crop = cropItems.find((item) => item.id === plot.cropId)!;
    setGame((current) => ({
      ...current,
      produce: { ...current.produce, [plot.cropId]: current.produce[plot.cropId] + 1 },
      farmPlots: current.farmPlots.map((item, plotIndex) => plotIndex === index ? null : item),
    }));
    setPlotEffect({ index, type: "harvest" });
    window.setTimeout(() => setPlotEffect(null), 700);
    setToast(`收获${crop.name}，成品已放进背包`);
    if (plot.cropId === "catnip" && !resting && !wakingUp) {
      const position = PLOT_POSITIONS[index];
      walkCatTo({ x: position.x - 4, y: position.y + 4 }, () => {
        setStatusIdle(false);
        setToast(`${pet.name}闻到猫薄荷，开心地玩了起来！`);
      });
    }
  }

  return (
    <main className="game-page">
      {desktopUpdate && (
        <aside className="update-notice" role="status">
          {desktopUpdate.phase !== "downloading" && <button className="update-close" onClick={() => setDesktopUpdate(null)} aria-label="关闭更新提示">×</button>}
          <small>GAME UPDATE</small>
          <b>{desktopUpdate.name ?? (desktopUpdate.phase === "error" ? "更新失败" : "正在下载新版")}</b>
          <p>{desktopUpdate.phase === "downloading" ? `下载进度 ${Math.round(desktopUpdate.percent ?? 0)}%` : desktopUpdate.message ?? desktopUpdate.notes}</p>
          {desktopUpdate.phase === "available" && <button onClick={() => window.gameUpdater?.download()}>在游戏内下载</button>}
          {desktopUpdate.phase === "downloaded" && <button onClick={() => window.gameUpdater?.install()}>安装并重启游戏</button>}
        </aside>
      )}
      {showReleaseNotes && (
        <div className="release-modal-layer" role="dialog" aria-modal="true" aria-labelledby="release-title">
          <section className="release-modal">
            <small>UPDATE LOG</small>
            <h1 id="release-title">已更新至 v{RELEASE_VERSION}</h1>
            <p>以下是从首个安装版至今的全部更新内容：</p>
            <div className="release-history">
              {RELEASE_NOTES.map((release) => (
                <section key={release.version}>
                  <b>v{release.version}</b>
                  <ul>{release.items.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ))}
            </div>
            <button onClick={() => { writePersisted("berry-workout-release-notes-seen", RELEASE_VERSION); setShowReleaseNotes(false); }}>知道了</button>
          </section>
        </div>
      )}
      <section className="game-stage" aria-label="OH 像素生活小屋">
        <audio ref={audioRef} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => skipTrack(1)} onError={() => { void recoverPlayback(); }} />
        <div
          className={`game-room scene-${game.scene} ${decorating ? "decorating" : ""} ${sceneTransition ? "scene-fading" : ""} ${selectedSeed ? "seed-selected" : ""} ${watering ? "watering-selected" : ""} ${photoBoardOpen ? "photo-board-background" : ""}`}
          data-period={timePeriod}
          data-weather={weather.kind}
          ref={roomRef}
          tabIndex={0}
          onPointerDown={game.scene === "room" ? moveCat : undefined}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (selectedSeed) {
              event.currentTarget.style.setProperty("--seed-x", `${event.clientX - rect.left}px`);
              event.currentTarget.style.setProperty("--seed-y", `${event.clientY - rect.top}px`);
            }
            if (watering) {
              event.currentTarget.style.setProperty("--watering-x", `${event.clientX - rect.left}px`);
              event.currentTarget.style.setProperty("--watering-y", `${event.clientY - rect.top}px`);
            }
          }}
          aria-label={game.scene === "room" ? "全屏像素小屋。点击地面或使用方向键移动猫咪。" : "全屏像素院子。点击田地进行种植，或使用导航栏。"}
        >
          {game.scene === "room"
            ? <canvas ref={sceneCanvasRef} className="room-background" role="img" aria-label={`像素风猫咪小屋的${weather.label}场景`} />
            : <img className="room-background" src={sceneAsset} alt={`像素风猫咪院子的${weather.label}场景`} draggable={false} />}
          <div className="room-vignette" />
          <button type="button" data-interactive className={`scene-door scene-door-${game.scene}`} onPointerDown={(event) => { event.stopPropagation(); changeScene(); }} aria-label={game.scene === "room" ? "去院子" : "回到室内"} />
          {game.scene === "room" && <button type="button" data-interactive className="kitchen-hotspot" onPointerDown={(event) => { event.stopPropagation(); openOverlay("kitchen"); }} aria-label="打开左墙厨房烹饪" />}
          {game.scene === "room" && <button type="button" data-interactive className="music-hotspot" onPointerDown={(event) => { event.stopPropagation(); openOverlay("music"); }} aria-label="打开黑胶唱片与网易云歌单" />}
          {game.scene === "room" && <button type="button" data-interactive className="bar-hotspot" onPointerDown={(event) => { event.stopPropagation(); openOverlay("bar"); }} aria-label="打开调酒台" />}
          {game.scene === "room" && <PhotoBoardWall open={photoBoardOpen} photos={photoBoardPhotos} photoUrl={photoBoardUrl} onOpen={(rect) => { setPhotoBoardOrigin(rect); setPhotoBoardOpen(true); }} />}

          {game.scene === "yard" && PLOT_POSITIONS.map((position, index) => {
            const plot = game.farmPlots[index];
            const stage = getCropStage(plot, farmNow);
            const progress = getCropProgress(plot, farmNow);
            return (
              <button key={index} type="button" data-interactive data-plot={index} className={`farm-plot ${stage === "mature" ? "mature" : ""}`} style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${position.width}%`, height: `${position.height}%`, zIndex: Math.round(position.y) }} onPointerDown={(event) => { event.stopPropagation(); handlePlot(index); }} aria-label={plot ? `${cropItems.find((crop) => crop.id === plot.cropId)?.name}，${stage === "mature" ? "点击收获" : plot.wateredAt ? "生长中" : "等待浇水"}` : selectedSeed ? `空田，点击播种${cropItems.find((crop) => crop.id === selectedSeed)?.name}` : "空田，请先从种子仓库选择种子"}>
                {plot && <img className="crop-sprite" src={`/game/crop-${plot.cropId}-${stage}.png`} alt="" />}
                {plot && <span className={`crop-progress ${stage === "mature" ? "complete" : ""}`}><progress max={1} value={progress} /><b>{stage === "mature" ? "已成熟" : plot.wateredAt ? `${Math.round(progress * 100)}%` : "待浇水"}</b></span>}
                {plotEffect?.index === index && <img className="plot-effect" src={`/game/effect-${plotEffect.type}.png`} alt="" />}
              </button>
            );
          })}

          {game.scene === "yard" && <button type="button" data-interactive className="seed-storage" onPointerDown={(event) => { event.stopPropagation(); setSelectedSeed(null); setSeedStorageOpen(true); setWatering(false); setWateringPlot(null); }} aria-label="打开种子仓库"><span>种子仓库</span></button>}
          {game.scene === "yard" && selectedSeed && <img className="seed-cursor" src={`/game/crop-${selectedSeed}-seed.png`} alt="" />}
          {game.scene === "yard" && watering && wateringPlot === null && <img className="watering-cursor" src="/game/watering-can-matched.png" alt="" />}
          {game.scene === "yard" && wateringPlot !== null && <div className="watering-animation" style={{ left: `${PLOT_POSITIONS[wateringPlot].x}%`, top: `${PLOT_POSITIONS[wateringPlot].y}%`, zIndex: Math.round(PLOT_POSITIONS[wateringPlot].y) + 5 }}><img src="/game/watering-can-matched.png" alt="" /><span className="water-spray"><i /><i /><i /><i /><i /></span><span className="water-impact"><i /><i /><i /></span></div>}
          {game.scene === "yard" && <button type="button" data-interactive className={`watering-can ${watering ? "selected" : ""}`} onPointerDown={(event) => { event.stopPropagation(); const rect = roomRef.current?.getBoundingClientRect(); if (rect) { roomRef.current?.style.setProperty("--watering-x", `${event.clientX - rect.left}px`); roomRef.current?.style.setProperty("--watering-y", `${event.clientY - rect.top}px`); } setWatering((value) => !value); setWateringPlot(null); setSeedStorageOpen(false); setSelectedSeed(null); setToast(watering ? "放下浇水壶" : "拿起浇水壶，再点击田地浇水"); }} aria-label={watering ? "放下浇水壶" : "拿起浇水壶"}><span>浇水壶</span></button>}

          {game.scene === "room" && ownedFurniture.map((item) => {
            const position = game.furniturePositions[item.id] ?? DEFAULT_FURNITURE_POSITIONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                data-furniture={item.id}
                data-scene-depth={item.id === "rug" ? "rug" : "furniture"}
                className={`placed-furniture furniture-${item.id} ${dragging === item.id ? "dragging" : ""}`}
                style={{ left: `${position.x}%`, top: `${position.y}%`, zIndex: Math.round(position.y) }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (feedingRef.current.phase !== "IDLE") return;
                  if (decorating) setDragging(item.id);
                  else {
                    const heights = "platformHeights" in item ? item.platformHeights : undefined;
                    const relativeY = (event.clientY - event.currentTarget.getBoundingClientRect().top) / event.currentTarget.getBoundingClientRect().height;
                    moveCatToFurniture(item, position, heights ? heights[relativeY < .5 ? 1 : 0] : undefined);
                  }
                }}
                aria-label={`${item.name}${decorating ? "，拖动可调整位置" : item.rest ? "，睡觉3小时" : item.standHeight === null ? "，走到旁边" : item.standHeight ? "，跳上去" : "，走上去"}`}
              >
                <img src={item.asset} alt="" draggable={false} />
                {"overlay" in item && item.overlay && <img className="furniture-overlay" src={item.overlay} alt="" draggable={false} />}
                {decorating && <span>拖动</span>}
              </button>
            );
          })}

          {game.scene === "room" && <FoodBowl state={feeding.bowl} position={bowlPosition} disabled={feedingBusy || decorating}
            onClick={() => { setInspectedPetId(game.pet); openOverlay("bag"); }} />}

          {game.scene === "room" && game.adoptedPets.map((id) => {
            const controlled = id === game.pet;
            const cat = pets.find((item) => item.id === id)!;
            const position = controlled ? game.catPosition : game.petPositions[id] ?? ROOMMATE_POSITIONS[id];
            if (!controlled) {
              const roommateSleep = game.petSleep[id] ?? INITIAL_GAME.petSleep[id];
              const roommateSleepRemaining = getSleepRemainingMs(roommateSleep.endsAt, sleepNow);
              const roommateStats = game.petStats[id] ?? INITIAL_GAME.petStats[id];
              const roommateStatus = getCatStatus(roommateStats.energy, roommateStats.sleepiness);
              const roommateFrame = getLoopedStatusFrame(CAT_STATUS_ANIMATIONS[roommateStatus].frames, roommateAnimationNow + (id === "doubao" ? 320 : id === "xueqiu" ? 640 : 0));
              const roommatePoseFrame = roommateFrame.frame ?? 0;
              const roommateAsset = roommateSleepRemaining > 0
                ? cat.sleep
                : roommateFrame.pose === "walk"
                  ? cat.walkFrames[roommatePoseFrame]
                  : roommateFrame.pose === "groom"
                    ? cat.groomFrames[roommatePoseFrame]
                    : roommateFrame.pose === "yawn"
                      ? cat.wakeYawnFrames[roommatePoseFrame]
                      : roommateFrame.pose === "sleep"
                        ? cat.sleep
                        : roommateFrame.pose === "wake"
                          ? cat.wake
                          : cat.idle;
              return <div className={`scene-cat roommate-cat ${roommateSleepRemaining > 0 ? "sleeping" : ""}`} data-pet-id={id} data-scene-depth="cat" data-on-furniture={roommateSleepRemaining > 0 ? roommateSleep.furnitureId ?? undefined : undefined} key={id} style={{ left: `${position.x}%`, top: `${position.y}%`, zIndex: Math.round(position.y) + 1 }}>
                <img className={`cat-base cat-pose-${roommateSleepRemaining > 0 ? "sleep" : roommateFrame.pose}`} src={roommateAsset} alt={roommateSleepRemaining > 0 ? `${game.petNames[id]}正在睡觉` : `${game.petNames[id]}正在${CAT_STATUS_ANIMATIONS[roommateStatus].name}`} style={{ translate: roommateSleepRemaining > 0 ? undefined : `${roommateFrame.x ?? 0}px ${roommateFrame.y ?? 0}px` }} />
                <b>{roommateSleepRemaining > 0 ? `${game.petNames[id]} · ${formatSleepRemaining(roommateSleepRemaining)}` : game.petNames[id]}</b>
              </div>;
            }
            return <div
              className={`scene-cat walking-cat ${walking ? "walking" : "status-animation"} ${feedingBusy ? "feeding-cat" : ""} ${jumping ? "jumping" : ""} ${resting ? "resting" : ""} ${lounging ? "lounging" : ""} ${scratching ? "scratching" : ""} ${wakingUp ? "waking-up" : ""} ${headShaking ? "head-shaking" : ""} ${facingLeft ? "facing-left" : ""}`}
              data-pet-id={id}
              data-scene-depth="cat"
              data-on-furniture={game.catFurniture ?? undefined}
              data-feeding-state={feeding.phase}
              data-cat-status={desiredCatStatus}
              data-active-status={catStatus}
              key={id}
              style={{ left: `${position.x}%`, top: `${position.y}%`, zIndex: game.catFurniture ? Math.round((game.furniturePositions[game.catFurniture] ?? DEFAULT_FURNITURE_POSITIONS[game.catFurniture]).y) + 2 : Math.round(position.y) + 2, transitionDuration: `${walkDuration}ms` }}
            >
              {["LOWER_HEAD", "EATING", "FINISH_EATING"].includes(feeding.phase)
                ? <EatingSprite feeding={feeding} />
                : walking
                ? <span className="cat-base cat-walk-sprite cat-pose-walk" role="img" aria-label={`${game.petNames[id]}正在行走`} data-walk-direction={direction} data-walk-frame={walkFrame} style={{ backgroundImage: `url(${pet.walkSheet})`, "--walk-frame": walkFrame, "--walk-row": WALK_DIRECTION_ROW[direction] } as CSSProperties} />
                : <img className={`cat-base cat-pose-${activePose}`} src={feeding.phase === "WAKING" ? feeding.elapsed < 280 ? pet.sleep : feeding.elapsed < 560 ? pet.wake : pet.wakeYawnFrames[Math.min(3, Math.floor((feeding.elapsed - 560) / 210))] : feedingBusy ? pet.idle : catAsset} alt={`${game.petNames[id]}正在小屋里`} decoding="sync" draggable={false} style={{ transform: `scaleX(${facingLeft ? -1 : 1})`, translate: `${motionX}px ${motionY}px` }} />}
              <b>{feedingBusy ? feeding.phase === "WAKING" ? "起床吃饭…" : feeding.phase === "WALK_TO_BOWL" ? "去吃饭…" : feeding.phase === "FINISH_EATING" ? "吃饱啦" : "吃饭中…" : headShaking ? "太困啦…" : wakingUp ? "起床中…" : resting ? `还剩 ${formatSleepRemaining(sleepRemainingMs)}` : scratching ? "玩耍中…" : lounging ? "休息中…" : game.petNames[id]}</b>
            </div>;
          })}

        </div>

        <PhotoBoardOverlay
          open={photoBoardOpen && game.scene === "room"}
          origin={photoBoardOrigin}
          photos={photoBoardPhotos}
          uploadingId={uploadingPhotoId}
          uploadingBusy={photoUploadBusy}
          deletingId={deletingPhotoId}
          photoUrl={photoBoardUrl}
          onClose={() => setPhotoBoardOpen(false)}
          onUpload={(file) => void uploadWebPhotoBoardPhoto(file)}
          onDesktopUpload={typeof window !== "undefined" && window.gameUpdater?.photoBoard ? () => void uploadDesktopPhotoBoardPhoto() : undefined}
          onDelete={deletePhotoBoardPhoto}
          onUpdateCaption={updatePhotoBoardCaption}
        />

        {seedStorageOpen && game.scene === "yard" && (
          <div className="seed-layer" onPointerDown={() => setSeedStorageOpen(false)}>
            <section className="seed-panel" role="dialog" aria-modal="true" aria-label="种子仓库" onPointerDown={(event) => event.stopPropagation()}>
              <button className="window-close" onClick={() => setSeedStorageOpen(false)} aria-label="关闭种子仓库">×</button>
              <small>SEED STORAGE</small><h2>种子仓库</h2><p>选择一种种子，再点击想播种的空田。</p>
              <div className="seed-grid">
                {cropItems.map((crop) => (
                  <article key={crop.id}>
                    <img src={`/game/crop-${crop.id}-mature.png`} alt="" />
                    <div><h3>{crop.name}</h3><p>{formatGrowTime(crop.growMs)} · 收获作物 ×1</p><b>种子 ×{game.seeds[crop.id]}</b></div>
                    <button type="button" onClick={() => buySeed(crop.id)}>购买 🍓 {crop.seedPrice}</button>
                    <button type="button" className="plant-button" disabled={!game.seeds[crop.id]} onClick={() => { setSelectedSeed(crop.id); setSeedStorageOpen(false); setWatering(false); setWateringPlot(null); setToast(`已拿起${crop.name}种子，点击空田播种`); }}>播种</button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {interruptConfirm && (
          <div className="sleep-interrupt-layer">
            <section className="sleep-interrupt-dialog" role="dialog" aria-modal="true" aria-label="取消睡眠确认">
              <span>💤</span>
              <h2>是否要取消睡眠？</h2>
              <p>现在叫醒猫咪，本次睡眠不会降低困倦值。</p>
              <div>
                <button type="button" onClick={continueSleeping}>继续睡觉</button>
                <button type="button" className="interrupt-button" onClick={interruptSleep}>取消睡眠</button>
              </div>
            </section>
          </div>
        )}

        <header className="game-hud">
          <div className="scene-context">
            <span className="scene-context-home" aria-hidden="true">🏠</span>
            <span><b>{game.scene === "room" ? "OH" : "草莓小院"}</b><small>{weather.label} · {TIME_PERIOD_LABELS[timePeriod]}</small></span>
            <span className="scene-context-weather" aria-hidden="true">{getWeatherIcon(weather.kind, timePeriod)}</span>
            {desktopDataAvailable && <button type="button" className="data-transfer-button" onClick={() => openOverlay("data")} aria-label="数据备份" title="数据备份"><span aria-hidden="true">💾</span><b>数据备份</b></button>}
          </div>
          <div className="hud-counters">
            <div><span aria-hidden="true">🔥</span><small>连续</small><b>{game.streak} 天</b></div>
            <div><span aria-hidden="true">🍓</span><small>草莓</small><b>{game.berries}</b></div>
          </div>
        </header>

        <aside className="pet-status">
          <img src={inspectedPet.idle} alt="" />
          <div className="pet-meters">
            <strong className="pet-status-name">{inspectedPet.name}</strong>
            <div><small><span>活力</span><b>{inspectedPetStats.energy}</b></small><div className="energy"><i style={{ width: `${inspectedPetStats.energy}%` }} /></div></div>
            <div><small><span>困倦</span><b>{inspectedPetStats.sleepiness}</b></small><div className="sleepiness"><i style={{ width: `${inspectedPetStats.sleepiness}%` }} /></div></div>
          </div>
          <div className="pet-status-actions">
            {game.adoptedPets.length > 1 && <button onClick={cycleControlledPet} title="切换控制猫咪">切换控制</button>}
            <button onClick={() => openOverlay("bag")}>喂食</button>
          </div>
        </aside>

        {decorating && (
          <div className="decorate-tools">
            <b>布置模式</b>
            <button onClick={resetFurniture}>恢复布局</button>
            <button onClick={() => setDecorating(false)}>完成</button>
          </div>
        )}

        <nav className="game-dock" aria-label="游戏菜单">
          <button className={overlay === "quest" || overlay === "history" ? "active" : ""} onClick={() => openOverlay("quest")}><span className="dock-icon dock-record-icon" aria-hidden="true"><span className="record-book"><span className="closed-book"><span className="closed-book-pages" /><span className="closed-book-cover" /><span className="closed-book-spine" /></span><span className="open-book"><span className="open-book-cover" /><span className="open-book-page open-book-page-left" /><span className="open-book-page open-book-page-right" /><span className="open-book-spine" /><span className="open-book-edge open-book-edge-left" /><span className="open-book-edge open-book-edge-right" /></span></span></span><b>记录</b></button>
          <button className={`pomodoro-dock ${overlay === "pomodoro" ? "active" : ""} ${pomodoroActive ? "is-running" : ""}`} onClick={() => openOverlay("pomodoro")}><span className="pomodoro-dock-icon"><span className="pomodoro-ring pomodoro-ring-left" /><img src="/game/pomodoro-orange.png" alt="" draggable={false} /><span className="pomodoro-ring pomodoro-ring-right" /></span><b>橙子钟</b>{game.pomodoro.status !== "idle" && <em>{formatPomodoroTime(pomodoroRemaining)}</em>}</button>
          <button className={overlay === "bag" ? "active" : ""} onClick={() => openOverlay("bag")}><span className="dock-icon dock-bag-icon" aria-hidden="true"><span className="bag-body"><span className="bag-inner" /><span className="bag-opening" /><span className="bag-top bag-top-left" /><span className="bag-top bag-top-right" /><span className="zipper-track zipper-track-left" /><span className="zipper-track zipper-track-right" /><span className="bag-pocket" /><span className="bag-content">🍓</span><span className="bag-zipper" /></span></span><b>背包</b><i>{totalBackpackItems}</i></button>
          <button className={overlay === "shop" ? "active" : ""} onClick={() => openOverlay("shop")}><span className="dock-icon dock-shop-icon" aria-hidden="true"><span className="dock-icon-glyph">🛒</span><span className="dock-cart-item">🍓</span><span className="cart-wheel cart-wheel-left" /><span className="cart-wheel cart-wheel-right" /></span><b>商店</b></button>
          <button className={overlay === "pets" ? "active" : ""} onClick={() => openOverlay("pets")}><span className="dock-icon dock-pets-icon" aria-hidden="true"><span className="dock-paw dock-paw-one" /><span className="dock-paw dock-paw-two" /></span><b>伙伴</b></button>
          <button className={decorating ? "active" : ""} disabled={game.scene === "yard" || feedingBusy} onClick={() => { setOverlay(null); setDecorating((value) => !value); setJumping(false); resetStatusAnimation(); }}><span className="dock-icon dock-decorate-icon" aria-hidden="true"><span className="dock-icon-glyph">🪑</span><span className="dock-move-hint" /></span><b>{game.scene === "yard" ? "回屋布置" : "布置"}</b></button>
        </nav>

        {overlay && (
          <div className="window-layer" onPointerDown={closeOverlay}>
            <section className={`game-window ${overlay}-window ${overlay === "bar" && mixing ? "is-mixing" : ""}`} onPointerDown={(event) => event.stopPropagation()}>
              <button className="window-close" onClick={closeOverlay} disabled={overlay === "bar" && mixing} aria-label="关闭窗口">×</button>

              {overlay === "data" && (
                <>
                  <div className="window-heading"><small>DATA TRANSFER</small><h1>存档备份与迁移</h1><p>Windows 和 Mac 使用同一种备份文件</p></div>
                  <div className="data-transfer-layout">
                    <article>
                      <span aria-hidden="true">🖥️</span><small>WINDOWS 第一步</small><h2>导出完整备份</h2>
                      <p>包含日记、草莓、猫咪、家具、农场、调酒收藏和橙子专注钟进度。</p>
                      <button type="button" className="primary-button" onClick={() => void exportDesktopBackup()} disabled={dataTransferBusy !== null}>{dataTransferBusy === "export" ? "正在导出……" : "导出 .ohbackup 文件"}</button>
                    </article>
                    <i aria-hidden="true">→</i>
                    <article>
                      <span aria-hidden="true">🍎</span><small>MAC 第二步</small><h2>导入并恢复</h2>
                      <p>把备份文件复制到 Mac 后导入。导入前会自动保留 Mac 当前存档。</p>
                      <button type="button" className="primary-button import-button" onClick={() => void importDesktopBackup()} disabled={dataTransferBusy !== null}>{dataTransferBusy === "import" ? "正在导入……" : "选择备份并导入"}</button>
                    </article>
                  </div>
                  <p className="data-transfer-note">🔒 备份只保存在你选择的位置，不会上传给屋主或其他用户。</p>
                </>
              )}

              {overlay === "pomodoro" && (
                <>
                  <div className="window-heading with-wallet pomodoro-heading"><span><small>BERRY FOCUS CLOCK</small><h1>橙子专注钟</h1><p>专注 25 分钟，休息 5 分钟；完成一次专注奖励 5 颗草莓</p><button type="button" className="pomodoro-mini-launch" onClick={() => window.gameUpdater?.pomodoroMini ? window.gameUpdater.pomodoroMini.open() : window.dispatchEvent(new Event("oh:pomodoro-mini"))}>↗ 小窗模式</button></span><b>🍓 {game.berries}</b></div>
                  <div className={`pomodoro-layout phase-${game.pomodoro.phase}`}>
                    <section className="pomodoro-clock-card" aria-label={`${game.pomodoro.phase === "focus" ? "专注" : "休息"}计时器`}>
                      <div className={`pomodoro-dial ${pomodoroActive ? "is-running" : ""}`}>
                        <div className="pomodoro-progress-shell" style={pomodoroStyle}>
                          <div className="pomodoro-dial-face" key={game.pomodoro.phase}>
                            <span className="pomodoro-phase-label">{game.pomodoro.phase === "focus" ? "专注时间" : "莓果休息站"}</span>
                            <img className="pomodoro-orange-mark" src="/game/pomodoro-orange.png" alt="" draggable={false} />
                            <strong aria-live="off">{formatPomodoroTime(pomodoroRemaining)}</strong>
                            <small>{game.pomodoro.status === "running" ? "计时中" : game.pomodoro.status === "paused" ? "已暂停" : "准备开始"}</small>
                          </div>
                        </div>
                      </div>
                      <div className="pomodoro-controls">
                        <button type="button" className="pomodoro-primary" onClick={pomodoroActive ? pausePomodoroTimer : startPomodoroTimer}>{pomodoroActive ? "暂停" : game.pomodoro.status === "paused" ? "继续" : game.pomodoro.phase === "focus" ? "开始专注" : "开始休息"}</button>
                        <button type="button" onClick={resetPomodoroTimer}>重置</button>
                        {game.pomodoro.phase === "break" && <button type="button" onClick={skipCurrentBreak}>跳过休息</button>}
                      </div>
                      <p className="pomodoro-background-note"><span aria-hidden="true">◉</span> 关闭橙子专注钟窗口或把游戏放到后台，计时都会继续</p>
                    </section>

                    <aside className="pomodoro-memory">
                      <header><small>FOCUS MEMORY</small><h2>我的专注记忆</h2></header>
                      <div className="pomodoro-stats">
                        <article><span>今天完成</span><b>{game.pomodoro.todayCycles}</b><small>个循环</small></article>
                        <article><span>累计完成</span><b>{game.pomodoro.totalCycles}</b><small>个循环</small></article>
                        <article><span>累计收获</span><b>{game.pomodoro.earnedBerries}</b><small>颗草莓</small></article>
                      </div>
                      <div className="pomodoro-rhythm" aria-label="橙子专注钟循环规则">
                        <div><span>25</span><b>分钟专注</b><small>完成后 🍓 +5</small></div>
                        <i aria-hidden="true">→</i>
                        <div><span>5</span><b>分钟休息</b><small>自动开始</small></div>
                      </div>
                      {!desktopPomodoroAvailable && (notificationPermission === "default" || notificationPermission === "denied") && <div className="pomodoro-notice-status">
                        <span aria-hidden="true">🔔</span>
                        <div><b>{notificationPermission === "denied" ? "系统弹窗未授权" : "开启系统弹窗提醒"}</b><small>{notificationPermission === "denied" ? "可在浏览器网站设置中重新允许通知" : "专注结束和休息结束都会显示系统弹窗"}</small></div>
                        {notificationPermission === "default" && <button type="button" onClick={() => void enablePomodoroNotifications()}>开启弹窗</button>}
                      </div>}
                    </aside>
                  </div>
                </>
              )}

              {overlay === "quest" && (
                <>
                  <div className="window-heading"><small>TODAY&apos;S NOTE</small><h1>今日记录</h1><p>{dateLabel || "今天"}</p></div>
                  <form className="activity-entry" onSubmit={checkIn}>
                    <label htmlFor="today-note">今天发生了什么？</label>
                    <div>
                      <textarea id="today-note" value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="记录一件今天想留下的事情……" maxLength={300} rows={5} />
                      <small>{noteText.length}/300</small>
                    </div>
                    <fieldset className="journal-options"><legend>记录分类</legend><div className="category-options">{journalCategories.map((item) => <button key={item.name} className={category === item.name ? "selected" : ""} type="button" onClick={() => setCategory(item.name)}><span>{item.icon}</span>{item.name}</button>)}</div></fieldset>
                    <label className="rating-field">今天给自己打几分？<span><input type="range" min="1" max="10" value={rating} onChange={(event) => setRating(Number(event.target.value))} /><b>{rating} 分</b></span></label>
                    <div className="reward-line"><span>{nextJournalReward ? `今日第 ${todayRecordCount + 1} 条记录奖励` : "今日三次记录奖励已全部领取"}</span><b>🍓 +{nextJournalReward}</b></div>
                    {historyError && <button type="button" onClick={() => { setHistoryError(false); setHistoryRetry((attempt) => attempt + 1); }}>重试载入历史记录</button>}
                    <button className="primary-button" type="submit" disabled={!ready || !historyReady || !noteText.trim() || savingCheckin}>{savingCheckin ? "正在保存……" : !historyReady ? "正在载入记录……" : "保存今日记录"}</button>
                  </form>
                  <div className="streak-card">
                    <div><span><small>连续记录</small><b>{game.streak} 天</b></span><em>下一份奖励</em></div>
                    <div className="week-track">{[1, 2, 3, 4, 5, 6, 7].map((day) => <i key={day} className={day <= Math.min(game.streak, 7) ? "done" : ""}>{day <= Math.min(game.streak, 7) ? "✓" : day}</i>)}</div>
                    <p>{nextMilestone ? <>再坚持 <b>{nextMilestone - game.streak} 天</b>，达成连续 {nextMilestone} 天记录</> : "30 天里程碑已达成！"}</p>
                  </div>
                  <button className="history-link" type="button" onClick={() => { setHistoryPage(0); setOverlay("history"); }}>
                    <span>JOURNAL HISTORY</span><b>{historyMeta?.total ?? history.length} 篇　→</b>
                  </button>
                </>
              )}

              {overlay === "history" && (
                <>
                  <div className="notebook-heading">
                    <button type="button" onClick={() => setOverlay("quest")}>← 返回今日记录</button>
                    <small>JOURNAL HISTORY</small><h1>往日日记</h1><p>把平凡日子里的小事好好收起来</p>
                  </div>
                  {history.length ? (
                    <>
                      <section className="notebook-page" aria-label={`往日日记第 ${historyPage + 1} 页`}>
                        {historyPageDates.map((date) => <article className="notebook-day" key={date}>
                          <time dateTime={date}>{date.replaceAll("-", ".")}</time>
                          {history.filter((record) => record.date === date).map((record) => {
                            const categoryInfo = journalCategories.find((item) => item.name === record.category) ?? journalCategories.at(-1)!;
                            return <div className="notebook-entry" key={record.id}>
                              <div className="entry-meta"><span>{categoryInfo.icon} {categoryInfo.name}</span><time dateTime={record.createdAt}>{new Date(record.createdAt || `${record.date}T00:00:00`).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div>
                              <p>{record.content}</p>
                              {record.rating && <small>⭐ 今日自评分：{record.rating}/10{record.reward ? `　🍓 +${record.reward}` : ""}</small>}
                            </div>;
                          })}
                        </article>)}
                      </section>
                      <nav className="notebook-pagination" aria-label="手账翻页">
                        <button type="button" onClick={() => setHistoryPage((page) => Math.max(0, page - 1))} disabled={historyPage === 0}>← 上一页</button>
                        <span>第 {historyPage + 1} / {historyPageCount} 页</span>
                        <button type="button" onClick={() => void nextHistoryPage()} disabled={historyPage === historyPageCount - 1 || historyLoading}>{historyLoading ? "正在载入……" : "下一页 →"}</button>
                      </nav>
                    </>
                  ) : <div className="notebook-empty">保存第一篇今日记录后，日记会从这里开始。</div>}
                </>
              )}

              {overlay === "kitchen" && (
                <>
                  <div className="window-heading"><small>PAW PAW KITCHEN</small><h1>猫爪小厨房</h1><p>每份收获可烹饪一份菜，做好后会放入背包</p></div>
                  <div className="recipe-grid">
                    {cookedDishes.map((dish) => {
                      const crop = cropItems.find((item) => item.id === dish.cropId)!;
                      const count = game.produce[dish.cropId];
                      const cooking = game.cooking?.dishId === dish.id ? game.cooking : null;
                      return (
                        <article key={dish.id}>
                          <img src={dish.asset} alt={dish.name} />
                          <div><small>{crop.name} ×1 · 活力 +{dish.energy} · ⏱ {dish.cookMinutes} 分钟</small><h2>{dish.name}</h2><p>{dish.detail}</p></div>
                          {cooking && <div className="recipe-progress"><i style={{ width: `${getCookingProgress(cooking.startedAt, cooking.endsAt, kitchenNow) * 100}%` }} /><span>烹饪中 · {formatCookingTime(cooking.endsAt, kitchenNow)}</span></div>}
                          <button type="button" onClick={() => cookDish(dish)} disabled={!count || Boolean(game.cooking)}>{cooking ? "正在烹饪……" : count ? `烹饪（原料 ×${count}）` : `缺少${crop.name}`}</button>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}

              {overlay === "music" && (
                <>
                  <div className="window-heading music-heading"><small>VINYL CORNER</small><h1>木质唱片柜</h1><p>只收藏《Deep Focus Mode》歌单中的全部唱片</p></div>
                  {playlist ? <section className="vinyl-player">
                    <div className="turntable-panel">
                      <div className={`turntable-record ${playingTrackId ? "current" : ""} ${isPlaying ? "playing" : ""}`}><i>{playingTrackId ? "♪" : "OH"}</i></div>
                      <div className="now-playing"><small>NOW SPINNING</small><h2>{currentTrack?.name ?? "挑一张唱片吧"}</h2><p>{currentTrack?.artist ?? `${playlist.name} · ${playlist.trackCount} 首`}</p></div>
                      <div className="player-controls">
                        <button type="button" onClick={() => skipTrack(-1)} aria-label="上一首">◀</button>
                        <button type="button" className="play-toggle" onClick={togglePlayback} aria-label={isPlaying ? "暂停" : "继续播放"}>{isPlaying ? "Ⅱ" : "▶"}</button>
                        <button type="button" onClick={() => skipTrack(1)} aria-label="下一首">▶</button>
                        <label>音量<input aria-label="音量" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>
                      </div>
                    </div>
                    <div className="record-cabinet" aria-label={`${playlist.name}，共 ${playlist.tracks.length} 首`}>
                      <div className="cabinet-shelf">{playlist.tracks.map((track, index) => {
                        const selected = playingTrackId === track.id;
                        return <button type="button" key={track.id} className={`record-sleeve ${selected ? "selected" : ""} ${track.playbackUrl ? "" : "unavailable"}`} onClick={() => playTrack(track)} aria-label={track.playbackUrl ? `播放 ${track.name}，${track.artist}` : `${track.name}，当前受网易云版权或会员限制`}>
                          <span className="sleeve-vinyl-slot"><span className={`sleeve-vinyl ${selected ? "current" : ""} ${selected && isPlaying ? "playing" : ""}`}><i /></span></span>
                          <span className="sleeve-cover">{track.cover && <img src={track.cover} alt="" loading="lazy" />}<b>{String(index + 1).padStart(3, "0")}</b></span>
                          <strong>{track.name}<small>{track.artist}{track.playbackUrl ? "" : " · 暂不可播"}</small></strong>
                        </button>;
                      })}</div>
                    </div>
                  </section> : <div className="playlist-empty"><b>{playlistLoading ? "正在整理全部唱片…" : "唱片柜暂时无法打开"}</b><p>歌曲只从指定的网易云歌单读取。</p></div>}
                </>
              )}

              {overlay === "bar" && (
                <>
                  <div className="window-heading with-wallet bar-heading"><span><small>STRAWBERRY BAR</small><h1>莓果调酒台</h1><p>从自己的库存取材，调出今晚的第一杯</p></span><b>🍓 {game.berries}</b></div>
                  <div className="bar-tabs">
                    <button type="button" className={barView === "mix" ? "active" : ""} onClick={() => setBarView("mix")} disabled={mixing}>开始调酒</button>
                    <button type="button" className={barView === "collection" ? "active" : ""} onClick={() => setBarView("collection")} disabled={mixing}>鸡尾酒图鉴 <i>{Object.values(game.cocktailCollection).filter((entry) => entry.unlocked).length}/{cocktailRecipes.length}</i></button>
                  </div>

                  {barView === "collection" ? (
                    <div className="cocktail-collection">
                      {cocktailRecipes.map((recipe) => {
                        const entry = game.cocktailCollection[recipe.id];
                        return <article key={recipe.id} className={entry.unlocked ? "unlocked" : "locked"}>
                          <div className="collection-drink-art"><img src={recipe.asset} alt={entry.unlocked ? `${recipe.name}像素插图` : "尚未解锁的鸡尾酒剪影"} /></div>
                          {entry.unlocked ? <>
                            <small>最高品质 · {entry.bestQuality} {entry.bestScore}分</small>
                            <h2>{recipe.name}</h2>
                            <p>{recipe.description}</p>
                            <ul>{recipe.ingredients.map((part) => <li key={part.ingredientId}>{getIngredient(part.ingredientId).name}<b>{formatIngredientAmount(part.amount, getIngredient(part.ingredientId).unit)}</b></li>)}</ul>
                            <strong>{COCKTAIL_METHOD_LABELS[recipe.method]}</strong>
                          </> : <>
                            <small>尚未解锁</small>
                            <h2>？？？</h2>
                            <p>{recipe.clue}</p>
                            <strong>{recipe.baseHint}</strong>
                          </>}
                        </article>;
                      })}
                    </div>
                  ) : (
                    <div className="bar-workbench">
                      <section className="bar-center">
                        <div className={`bar-vessel ${pouring === "liquid" ? "pouring-liquid" : ""} ${pouring === "ice" ? "dropping-ice" : ""} ${mixing ? `mixing method-${mixMethod}` : ""}`} style={{ "--liquid-color": mixColor, "--liquid-level": `${mixLiquidLevel * 100}%` } as CSSProperties}>
                          <div className="bar-liquid-clip">
                            <div className="bar-liquid" style={{ clipPath: `inset(${(1 - mixLiquidLevel) * 100}% 0 0)` }}><i /><i /></div>
                            <span className="bar-liquid-surface" style={{ opacity: mixLiquidLevel ? 1 : 0, transform: `translate3d(0, ${-mixLiquidLevel * 192}px, 0)` }} />
                          </div>
                          <div className="ice-field" aria-hidden="true">
                            {Array.from({ length: mixIceCount }, (_, index) => {
                              const layout = ICE_CUBE_LAYOUT[index % ICE_CUBE_LAYOUT.length];
                              const row = Math.floor(index / 3);
                              const restY = mixLiquidTotal > 0 ? Math.min(148, Math.max(10, mixFillHeight - 19 - row * 20)) : 9 + row * 23;
                              return <span key={`ice-${index}`} className="ice-cube-slot" style={{ "--ice-x": `${layout.x}px`, "--ice-y": `${restY}px`, "--ice-rotation": `${layout.rotation}deg`, "--ice-delay": `${Math.min(index, 4) * 70}ms` } as CSSProperties}><i className="ice-cube-drop"><b className="ice-cube-core" /></i></span>;
                            })}
                          </div>
                          {mixDraft.mint ? <span className="glass-garnish">⌁</span> : null}
                          {mixing && <div className="mix-tool">{mixMethod === "shake" ? "SHAKE" : mixMethod === "stir" ? "STIR" : "BUILD"}</div>}
                        </div>
                        <div className="bar-volume"><span>杯内占用</span><b>{Math.min(BAR_CAPACITY_ML, mixOccupiedVolume)} / {BAR_CAPACITY_ML}ml</b><small>液体 {mixLiquidTotal}ml{mixIceDisplacement ? ` + 冰块排水 ${mixIceDisplacement}ml` : ""}</small><progress max={BAR_CAPACITY_ML} value={mixOccupiedVolume} /></div>
                        {mixing && <p className="mixing-message">{mixMethod === "shake" ? "用力摇匀中……" : mixMethod === "stir" ? "让液体慢慢旋转……" : "依次注入杯中……"}</p>}
                      </section>

                      <section className="bar-ingredients">
                        <header><span><small>YOUR INGREDIENTS</small><h2>拥有的配料</h2></span><button type="button" onClick={goToIngredientShop} disabled={mixing}>前往商店</button></header>
                        <div>
                          {availableBarIngredients.map((ingredient) => {
                            const stock = getIngredientStock(game.ingredientInventory, ingredient.id);
                            return <button type="button" key={ingredient.id} onClick={() => openMixIngredient(ingredient.id)} disabled={mixing || Boolean(mixResult) || (stock !== Infinity && stock <= (mixDraft[ingredient.id] ?? 0))}>
                              <span className="ingredient-icon" style={ingredientIconStyle(ingredient.iconIndex)} />
                              <b>{ingredient.name}</b>
                              <small>{stock === Infinity ? "不限量" : formatIngredientAmount(stock, ingredient.unit)}</small>
                              {mixDraft[ingredient.id] ? <i>已加入 {formatIngredientAmount(mixDraft[ingredient.id]!, ingredient.unit)}</i> : <i>点击添加</i>}
                            </button>;
                          })}
                        </div>
                        {availableBarIngredients.length === 1 && <p className="bar-empty-stock">还没有可用配料，先去商店补充吧。</p>}
                      </section>

                      <section className="bar-recipe">
                        <header><span><small>CURRENT MIX</small><h2>当前配方</h2></span><button type="button" onClick={clearMix} disabled={mixing || !Object.keys(mixDraft).length}>清空全部</button></header>
                        <div className="mix-list">
                          {Object.entries(mixDraft).filter(([, amount]) => (amount ?? 0) > 0).map(([id, amount]) => {
                            const ingredient = getIngredient(id as IngredientId);
                            return <article key={id}><span className="ingredient-icon" style={ingredientIconStyle(ingredient.iconIndex)} /><b>{ingredient.name}</b><small>{formatIngredientAmount(amount!, ingredient.unit)}</small><button type="button" onClick={() => removeMixIngredient(ingredient.id)} disabled={mixing || Boolean(mixResult)} aria-label={`移除${ingredient.name}`}>×</button></article>;
                          })}
                          {!Object.keys(mixDraft).length && <p>从左侧选择配料，材料只会暂时放进杯中。</p>}
                        </div>
                        <div className="bar-methods">
                          {(Object.keys(COCKTAIL_METHOD_LABELS) as CocktailMethod[]).map((method) => <button type="button" key={method} className={mixMethod === method ? "selected" : ""} onClick={() => setMixMethod(method)} disabled={mixing || Boolean(mixResult)}><span>{method === "shake" ? "↔" : method === "stir" ? "↻" : "↓"}</span>{COCKTAIL_METHOD_LABELS[method]}</button>)}
                        </div>
                        <button type="button" className="mix-start" onClick={startMixing} disabled={mixing || Boolean(mixResult) || !mixMethod || !Object.keys(mixDraft).length}>{mixing ? "正在调制……" : "开始调制"}</button>
                        <button type="button" className="bar-exit" onClick={closeOverlay} disabled={mixing}>退出吧台</button>
                      </section>
                    </div>
                  )}

                  {selectedMixIngredient && (
                    <div className="bar-dialog-layer" onPointerDown={() => !mixing && setMixIngredientId(null)}>
                      <section className="amount-dialog" role="dialog" aria-modal="true" aria-label={`选择${selectedMixIngredient.name}用量`} onPointerDown={(event) => event.stopPropagation()}>
                        <button type="button" className="window-close" onClick={() => setMixIngredientId(null)} aria-label="关闭用量面板">×</button>
                        <span className="ingredient-icon large" style={ingredientIconStyle(selectedMixIngredient.iconIndex)} />
                        <small>{INGREDIENT_CATEGORY_LABELS[selectedMixIngredient.category]}</small><h2>加入{selectedMixIngredient.name}</h2>
                        <p>库存 {selectedMixStock === Infinity ? "不限量" : formatIngredientAmount(selectedMixStock, selectedMixIngredient.unit)} · 已占用 {formatIngredientAmount(selectedMixReserved, selectedMixIngredient.unit)}</p>
                        <div className="amount-stepper">
                          <button type="button" onClick={() => setMixIngredientAmount((amount) => Math.max(selectedMixStep, amount - selectedMixStep))}>−</button>
                          <b>{formatIngredientAmount(mixIngredientAmount, selectedMixIngredient.unit)}</b>
                          <button type="button" onClick={() => setMixIngredientAmount((amount) => Math.min(selectedMixMax, amount + selectedMixStep))}>＋</button>
                        </div>
                        {selectedMixIngredient.unit === "ml" && <div className="amount-presets">{[15, 30, 45, 60, 90, 120].filter((amount) => amount <= selectedMixMax).map((amount) => <button type="button" key={amount} className={mixIngredientAmount === amount ? "active" : ""} onClick={() => setMixIngredientAmount(amount)}>{amount}ml</button>)}</div>}
                        <input type="range" min={selectedMixStep} max={Math.max(selectedMixStep, selectedMixMax)} step={selectedMixStep} value={Math.min(mixIngredientAmount, Math.max(selectedMixStep, selectedMixMax))} onChange={(event) => setMixIngredientAmount(Number(event.target.value))} />
                        <div className="amount-summary"><span>加入后剩余</span><b>{selectedMixStock === Infinity ? "不限量" : formatIngredientAmount(Math.max(0, selectedMixStock - selectedMixReserved - mixIngredientAmount), selectedMixIngredient.unit)}</b></div>
                        <button type="button" className="primary-button" onClick={addMixIngredient} disabled={!selectedMixMax || mixIngredientAmount > selectedMixMax}>确认加入</button>
                      </section>
                    </div>
                  )}

                  {mixResult && (
                    <div className="bar-dialog-layer result-layer">
                      <section className={`mix-result ${mixResult.success ? "success" : "failure"} ${mixResult.firstUnlock ? "first-unlock" : ""}`} role="dialog" aria-modal="true" aria-label="调酒结果">
                        {mixResult.firstUnlock && <span className="unlock-ribbon">NEW · 图鉴首次解锁</span>}
                        {mixResult.success ? <img className="result-drink-art" src={mixResult.recipe.asset} alt={`${mixResult.recipe.name}像素插图`} /> : <div className="result-glass" style={{ "--cocktail-color": mixColor } as CSSProperties}><i /></div>}
                        <small>{mixResult.success ? `${mixResult.quality} · 匹配度 ${mixResult.score}%` : `神秘混合饮料 · 接近度 ${mixResult.score}%`}</small>
                        <h2>{mixResult.success ? mixResult.recipe.name : "神秘混合饮料"}</h2>
                        <p>{mixResult.feedback}</p>
                        {mixResult.success && <p className="bag-result-note">成品已放进背包</p>}
                        <div className="consumed-list"><b>本次消耗</b>{Object.entries(mixResult.consumed).filter(([, amount]) => (amount ?? 0) > 0 && amount !== Infinity).map(([id, amount]) => { const ingredient = getIngredient(id as IngredientId); return <span key={id}>{ingredient.name} {formatIngredientAmount(amount!, ingredient.unit)}</span>; })}</div>
                        <div className="result-actions">
                          <button type="button" onClick={clearMix}>再调一杯</button>
                          {mixResult.success && <button type="button" onClick={() => { setMixResult(null); setMixDraft({}); setMixMethod(null); setBarView("collection"); }}>查看图鉴</button>}
                          <button type="button" onClick={closeOverlay}>离开吧台</button>
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}

              {overlay === "bag" && (
                <>
                  <div className="window-heading"><small>MY BACKPACK</small><h1>我的背包</h1><p>作物可以带去厨房烹饪，菜品可以喂给 {inspectedPet.name}，收藏可以直接打开</p></div>
                  <div className="produce-strip">
                    <b>新鲜作物</b>
                    {cropItems.map((crop) => <span key={crop.id} className={game.produce[crop.id] ? "" : "empty"}><img src={`/game/crop-${crop.id}-mature.png`} alt="" /><em>{crop.name}</em><i>×{game.produce[crop.id]}</i></span>)}
                    <button type="button" onClick={() => setOverlay("kitchen")}>去厨房烹饪 →</button>
                  </div>
                  <div className="backpack-layout">
                    <div className="inventory-grid">
                      {ownsCocktailBook && (
                        <button type="button" className="backpack-book" onClick={openCocktailBook} aria-label="打开莓果调酒书">
                          <img src={COCKTAIL_BOOK.asset} alt="棕色封面的莓果调酒书" /><b>{COCKTAIL_BOOK.name}</b><span>×1</span>
                        </button>
                      )}
                      {foodItems.map((item) => (
                        <button key={item.id} className={`${selectedFood === item.id ? "selected" : ""} ${game.inventory[item.id] ? "" : "empty"}`} onClick={() => setSelectedFood(item.id)}>
                          <img src={item.asset} alt="" /><b>{item.name}</b><span>×{game.inventory[item.id]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="feed-card">
                      <img src={selectedFoodItem.asset} alt={selectedFoodItem.name} />
                      <small>已选择</small><h2>{selectedFoodItem.name}</h2><p>{selectedFoodItem.detail} · 活力 +{selectedFoodItem.energy}</p>
                      <button className="primary-button" onClick={() => feedPet(selectedFoodItem.id)} disabled={feedingBusy || game.scene !== "room" || !game.inventory[selectedFoodItem.id] || inspectedPetStats.energy >= 100}>
                        {feedingBusy ? "猫咪正在用餐" : game.scene !== "room" ? "回到小屋投喂" : inspectedPetStats.energy >= 100 ? "活力已经满啦" : game.inventory[selectedFoodItem.id] ? `喂给 ${inspectedPet.name}` : "背包里没有了"}
                      </button>
                      {!totalFood && <button className="text-button" onClick={() => { setShopCategory("food"); setOverlay("shop"); }}>去商店买食物 →</button>}
                    </div>
                  </div>
                  <section className="bag-cocktails" aria-label="背包里的鸡尾酒">
                    <header><b>调酒收藏 {Object.values(game.cocktailCollection).filter((entry) => entry.unlocked).length}/{cocktailRecipes.length}</b><small>成功调出的成品会保存在这里</small></header>
                    <div>
                      {cocktailRecipes.map((recipe) => {
                        const unlocked = game.cocktailCollection[recipe.id].unlocked;
                        return <article key={recipe.id} className={unlocked ? "unlocked" : "locked"}>
                          <img src={recipe.asset} alt={unlocked ? `${recipe.name}像素插图` : "尚未解锁的鸡尾酒剪影"} />
                          <b>{unlocked ? recipe.name : "？？？"}</b>
                          <span>{unlocked ? `×${game.cocktailInventory[recipe.id]}` : "未解锁"}</span>
                        </article>;
                      })}
                    </div>
                  </section>
                  <div className="bag-furniture"><b>家具收藏 {ownedFurniture.length}/{furnitureItems.length}</b><div>{ownedFurniture.map((item) => <img key={item.id} src={item.asset} alt={item.name} />)}</div></div>
                </>
              )}

              {overlay === "shop" && (
                <>
                  <div className="window-heading with-wallet"><span><small>BERRY MINI MALL</small><h1>莓果小商店</h1><p>食物放进背包，家具送进小屋，配料带去吧台</p></span><b>🍓 {game.berries}</b></div>
                  <div className="shop-tabs">
                    <button className={shopCategory === "food" ? "active" : ""} onClick={() => setShopCategory("food")}>猫咪食物</button>
                    <button className={shopCategory === "furniture" ? "active" : ""} onClick={() => setShopCategory("furniture")}>小屋家具</button>
                    <button className={shopCategory === "ingredients" ? "active" : ""} onClick={() => setShopCategory("ingredients")}>调酒配料</button>
                  </div>
                  {shopCategory === "ingredients" && <div className="ingredient-filters">
                    <button type="button" className={ingredientFilter === "all" ? "active" : ""} onClick={() => setIngredientFilter("all")}>全部</button>
                    {(Object.keys(INGREDIENT_CATEGORY_LABELS) as IngredientCategory[]).map((category) => <button type="button" key={category} className={ingredientFilter === category ? "active" : ""} onClick={() => setIngredientFilter(category)}>{INGREDIENT_CATEGORY_LABELS[category]}</button>)}
                  </div>}
                  <div className={`store-grid ${shopCategory === "ingredients" ? "ingredient-store-grid" : ""}`}>
                    {shopCategory === "food" ? storeFoodItems.map((item) => (
                      <article key={item.id}>
                        <div className="store-art"><img src={item.asset} alt="" /><i>背包 ×{game.inventory[item.id]}</i></div>
                        <div><small>补充活力 +{item.energy}</small><h2>{item.name}</h2><p>{item.detail}</p></div>
                        <button onClick={() => buyFood(item)}>🍓 {item.price}</button>
                      </article>
                    )) : shopCategory === "furniture" ? furnitureItems.map((item) => {
                      const owned = game.purchased.includes(item.id);
                      return (
                        <article key={item.id} className={`${owned ? "owned" : ""} furniture-card-${item.id}`}>
                          <div className="store-art"><img src={item.asset} alt="" /></div>
                          <div><small>{item.rest ? `睡眠3小时 · 困倦值 -${item.rest}` : "可自由拖动"}</small><h2>{item.name}</h2><p>{item.detail}</p></div>
                          <button onClick={() => buyFurniture(item)} disabled={owned}>{owned ? "✓ 已拥有" : `🍓 ${item.price}`}</button>
                        </article>
                      );
                    }) : <>
                      {ingredientFilter === "all" && !ownsCocktailBook && <article className={`cocktail-book-card ${game.berries < COCKTAIL_BOOK.price ? "unaffordable" : ""}`}>
                        <div className="store-art cocktail-book-art"><img src={COCKTAIL_BOOK.asset} alt="棕色封面的莓果调酒书" /><i>{cocktailRecipes.length} 款酒谱</i></div>
                        <div><small>吧台收藏 · 完整配方</small><h2>{COCKTAIL_BOOK.name}</h2><p>{COCKTAIL_BOOK.detail}</p></div>
                        <button type="button" onClick={buyCocktailBook}>🍓 {COCKTAIL_BOOK.price} · 购买调酒书</button>
                      </article>}
                      {filteredIngredients.map((ingredient) => {
                        const stock = getIngredientStock(game.ingredientInventory, ingredient.id);
                        return <article key={ingredient.id} className={`ingredient-card ${ingredient.id === "ice" ? "unlimited" : ""} ${ingredient.id !== "ice" && game.berries < ingredient.price ? "unaffordable" : ""}`}>
                          <div className="store-art"><span className="ingredient-icon store-ingredient-icon" style={ingredientIconStyle(ingredient.iconIndex)} /><i>库存 {stock === Infinity ? "不限量" : formatIngredientAmount(stock, ingredient.unit)}</i></div>
                          <div><small>{INGREDIENT_CATEGORY_LABELS[ingredient.category]} · {ingredient.id === "ice" ? "吧台常备" : `每件 ${formatIngredientAmount(ingredient.packageAmount, ingredient.unit)}`}</small><h2>{ingredient.name}</h2><p>{ingredient.description}</p></div>
                          <button type="button" onClick={() => openIngredientPurchase(ingredient.id)} disabled={ingredient.id === "ice"}>{ingredient.id === "ice" ? "免费 · 不限量" : `🍓 ${ingredient.price} · 查看购买`}</button>
                        </article>;
                      })}
                    </>}
                  </div>

                  {selectedShopIngredient && (
                    <div className="bar-dialog-layer purchase-layer" onPointerDown={() => !ingredientPurchaseBusy && setShopIngredientId(null)}>
                      <section className="ingredient-purchase" role="dialog" aria-modal="true" aria-label={`购买${selectedShopIngredient.name}`} onPointerDown={(event) => event.stopPropagation()}>
                        <button type="button" className="window-close" onClick={() => setShopIngredientId(null)} disabled={ingredientPurchaseBusy} aria-label="关闭购买面板">×</button>
                        <div className="purchase-hero"><span className="ingredient-icon large" style={ingredientIconStyle(selectedShopIngredient.iconIndex)} /><span><small>{INGREDIENT_CATEGORY_LABELS[selectedShopIngredient.category]}</small><h2>{selectedShopIngredient.name}</h2><p>{selectedShopIngredient.description}</p></span></div>
                        <div className="purchase-facts"><span>单件容量<b>{formatIngredientAmount(selectedShopIngredient.packageAmount, selectedShopIngredient.unit)}</b></span><span>单件价格<b>🍓 × {selectedShopIngredient.price}</b></span><span>当前库存<b>{formatIngredientAmount(game.ingredientInventory[selectedShopIngredient.id as StockedIngredientId], selectedShopIngredient.unit)}</b></span></div>
                        <div className="purchase-quantity"><span>购买数量</span><div><button type="button" onClick={() => setPurchaseQuantity((quantity) => Math.max(1, quantity - 1))} disabled={purchaseQuantity <= 1}>−</button><b>{purchaseQuantity}</b><button type="button" onClick={() => setPurchaseQuantity((quantity) => Math.min(20, quantity + 1))}>＋</button></div></div>
                        <div className="purchase-summary"><span>需要消耗<b>🍓 × {ingredientPurchaseTotal}</b></span><span>当前拥有<b>🍓 × {game.berries}</b></span><span>购买后库存<b>{formatIngredientAmount(ingredientPurchaseStockAfter, selectedShopIngredient.unit)}</b></span></div>
                        <div className="purchase-cocktails"><small>代表性鸡尾酒</small><p>{selectedShopIngredient.relatedCocktails.join(" · ")}</p></div>
                        {game.berries < ingredientPurchaseTotal && <p className="berry-shortage">草莓不足</p>}
                        <button type="button" className="primary-button" onClick={confirmIngredientPurchase} disabled={ingredientPurchaseBusy || game.berries < ingredientPurchaseTotal}>{ingredientPurchaseBusy ? "正在装进库存……" : `确认购买 · 🍓 ${ingredientPurchaseTotal}`}</button>
                      </section>
                    </div>
                  )}
                </>
              )}

              {overlay === "recipe-book" && ownsCocktailBook && (
                <>
                  <div className="recipe-book-heading">
                    <button type="button" onClick={() => setOverlay("bag")}>返回背包</button>
                    <span><small>STRAWBERRY COCKTAIL RECIPES</small><h1>莓果调酒书</h1></span>
                  </div>
                  <section className="recipe-book-spread" aria-label={`调酒书，当前配方${selectedBookRecipe.name}`}>
                    <div className="recipe-book-page recipe-book-directory">
                      <header><small>COCKTAIL INDEX</small><h2>调酒配方</h2></header>
                      <div className="recipe-book-grid">
                        {cocktailRecipes.map((recipe, index) => <button type="button" key={recipe.id} className={recipe.id === selectedBookRecipe.id ? "selected" : ""} onClick={() => setRecipeBookIndex(index)} aria-pressed={recipe.id === selectedBookRecipe.id}>
                          <img src={recipe.asset} alt="" />
                          <span><b>{recipe.name}</b><small>难度 {"★".repeat(recipe.difficulty)}</small></span>
                        </button>)}
                      </div>
                      <footer><i />01<i /></footer>
                    </div>

                    <div className="recipe-book-binding" aria-hidden="true" />

                    <div className="recipe-book-page recipe-book-detail">
                      <header><small>SELECTED RECIPE</small><h2>{selectedBookRecipe.name}</h2><p>{selectedBookRecipe.description}</p></header>
                      <div className="recipe-book-summary">
                        <div className="recipe-book-ingredients">
                          {selectedBookRecipe.ingredients.map((part) => {
                            const ingredient = getIngredient(part.ingredientId);
                            return <div key={part.ingredientId}><span className="ingredient-icon" style={ingredientIconStyle(ingredient.iconIndex)} /><b>{ingredient.name}</b><em>{formatIngredientAmount(part.amount, ingredient.unit)}</em></div>;
                          })}
                        </div>
                        <img className="recipe-book-drink" src={selectedBookRecipe.asset} alt={`${selectedBookRecipe.name}成品`} />
                      </div>
                      <div className="recipe-book-fact"><b>比例</b><span>{selectedBookRecipe.ingredients.map((part) => part.amount).join(" : ")}</span></div>
                      <div className="recipe-book-fact"><b>方法</b><span>{COCKTAIL_METHOD_LABELS[selectedBookRecipe.method]}</span></div>
                      <div className="recipe-book-steps"><b>步骤</b><ol>{COCKTAIL_BOOK_STEPS[selectedBookRecipe.method].map((step) => <li key={step}>{step}</li>)}</ol></div>
                      <nav className="recipe-book-navigation" aria-label="切换酒谱">
                        <button type="button" onClick={() => setRecipeBookIndex((index) => (index - 1 + cocktailRecipes.length) % cocktailRecipes.length)}>上一杯</button>
                        <span>{String(recipeBookIndex + 1).padStart(2, "0")} / {String(cocktailRecipes.length).padStart(2, "0")}</span>
                        <button type="button" onClick={() => setRecipeBookIndex((index) => (index + 1) % cocktailRecipes.length)}>下一杯</button>
                      </nav>
                    </div>
                  </section>
                </>
              )}

              {overlay === "pets" && (
                <>
                  <div className="window-heading"><small>PAW PAW FRIENDS</small><h1>选择猫咪伙伴</h1><p>每位伙伴都有完整的走路、舔毛和打哈欠动画</p></div>
                  <div className="pet-grid">
                    {pets.map((item) => (
                      <article key={item.id} className={game.pet === item.id ? "chosen" : ""}>
                        <div><span>{item.kind}</span><img src={item.idle} alt={`${game.petNames[item.id]}，${item.kind}`} /></div>
                        <small>{item.nature}</small><h2>{game.petNames[item.id]}</h2>
                        <label className="pet-name-field">名字<input value={game.petNames[item.id]} maxLength={12} onChange={(event) => setGame((current) => ({ ...current, petNames: { ...current.petNames, [item.id]: event.target.value } }))} onBlur={() => setGame((current) => ({ ...current, petNames: { ...current.petNames, [item.id]: current.petNames[item.id].trim() || INITIAL_GAME.petNames[item.id] } }))} /></label>
                        <button onClick={() => adoptPet(item.id)} disabled={game.pet === item.id}>{game.pet === item.id ? "✓ 正在控制" : game.adoptedPets.includes(item.id) ? "切换控制" : "带它回家"}</button>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </section>
      <PomodoroMiniWindow state={game.pomodoro} remaining={pomodoroRemaining} progress={pomodoroProgress} onToggle={pomodoroActive ? pausePomodoroTimer : startPomodoroTimer} onReset={resetPomodoroTimer} onSkip={skipCurrentBreak} onReturn={() => openOverlay("pomodoro")} />
      {pomodoroAlert && (
        <div className="pomodoro-alert-layer">
          <section className={`pomodoro-celebration phase-${pomodoroAlert}`} role="alertdialog" aria-modal="true" aria-live="assertive" aria-label={pomodoroAlert === "focus" ? "专注完成提醒" : "休息结束提醒"}>
            {pomodoroAlert === "focus" && <div aria-hidden="true">{[0, 1, 2, 3, 4].map((item) => <span key={item}>🍓</span>)}</div>}
            <em aria-hidden="true">{pomodoroAlert === "focus" ? <img src="/game/pomodoro-orange.png" alt="" draggable={false} /> : "🔔"}</em>
            <strong>{pomodoroAlert === "focus" ? `专注完成　+${POMODORO_REWARD}` : "休息结束"}</strong>
            <small>{pomodoroAlert === "focus" ? "5 分钟休息已经自动开始，草莓也放进钱包啦" : "新的 25 分钟专注已经准备好"}</small>
            <button type="button" onClick={() => setPomodoroAlert(null)}>知道了</button>
          </section>
        </div>
      )}
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}
