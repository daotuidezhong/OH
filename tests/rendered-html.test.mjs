import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CAT_BOUNDS, clampCatPosition, getFurnitureTarget } from "../app/game/furniture.ts";
import { fetchPlaylist, isRemotePlaybackUrl, LOCAL_PLAYBACK_PATHS, PLAYLIST_ID, resolvePlaybackUrl } from "../app/game/music.ts";
import { getTimePeriod } from "../app/game/time-period.ts";
import { getRoomAsset, getWeatherKind, getYardAsset, ROOM_ASSET_BY_WEATHER } from "../app/game/weather.ts";
import { cropItems, formatCookingTime, getCookingProgress, getCropProgress, getCropStage, INITIAL_PRODUCE, waterUnwateredPlots } from "../app/game/farm.ts";
import { clampFurniturePosition, clampToScene, getWalkPath, ROOM_FIXED_OBSTACLES, YARD_OBSTACLES } from "../app/game/scene.ts";
import { CAT_STATUS_ANIMATIONS, getCatStatus, getCatStatusTransition } from "../app/game/cat-actions.ts";
import { canPetMove, decayPetStats, decayPetStatsByTime, formatSleepRemaining, getSleepRemainingMs, PET_STAT_DECAY_MS, SLEEP_DURATION_MS } from "../app/game/pet-stats.ts";
import { getJournalReward } from "../app/game/journal-reward.ts";
import { getWalkDirection, WALK_DIRECTION_ROW } from "../app/game/movement-direction.ts";
import {
  formatPomodoroTime,
  INITIAL_POMODORO,
  normalizePomodoro,
  pausePomodoro,
  POMODORO_BREAK_MS,
  POMODORO_FOCUS_MS,
  POMODORO_REWARD,
  settlePomodoro,
  startPomodoro,
} from "../app/game/pomodoro.ts";
import {
  INITIAL_INGREDIENT_INVENTORY,
  cocktailRecipes,
  createInitialCocktailCollection,
  evaluateCocktail,
  getIceDisplacement,
  getLiquidTotal,
  getOccupiedVolume,
  ICE_DISPLACEMENT_ML,
  ingredientItems,
  mixIngredientColors,
} from "../app/game/cocktails.ts";

const { createStorage } = createRequire(import.meta.url)("../electron/storage.cjs");
const { LOCAL_PLAYBACK_PATHS: DESKTOP_PLAYBACK_PATHS, loadDesktopPlaylist } = createRequire(import.meta.url)("../electron/netease.cjs");

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("maps local hours to four room lighting periods", () => {
  assert.deepEqual(
    [4, 5, 10, 11, 15, 16, 18, 19, 23].map(getTimePeriod),
    ["night", "morning", "morning", "noon", "noon", "evening", "evening", "night", "night"],
  );
});

test("uses furniture height to choose walking or jumping", () => {
  assert.equal(CAT_BOUNDS.minY, 43);
  assert.deepEqual(clampCatPosition({ x: 50, y: 24 }), { x: 50, y: 43 });
  assert.deepEqual(clampCatPosition({ x: 100, y: 100 }), { x: 93, y: 88 });
  assert.deepEqual(getFurnitureTarget({ x: 48, y: 78 }, 0), { x: 48, y: 78, jumping: false, onTop: true });
  assert.deepEqual(getFurnitureTarget({ x: 61, y: 77 }, 8), { x: 61, y: 69, jumping: true, onTop: true });
  assert.deepEqual(getFurnitureTarget({ x: 86, y: 62 }, null), { x: 92, y: 62, jumping: false, onTop: false });
});

test("maps Foshan weather codes to room weather states", () => {
  assert.equal(getWeatherKind(0, 0, 8), "clear");
  assert.equal(getWeatherKind(3, 0, 80), "cloudy");
  assert.equal(getWeatherKind(61, 0.4, 95), "rain");
  assert.equal(getWeatherKind(95, 2.2, 100), "thunderstorm");
  assert.deepEqual(ROOM_ASSET_BY_WEATHER, {
    clear: {
      morning: "/game/room-v070-clear-morning.png",
      noon: "/game/room-v070-clear-noon.png",
      evening: "/game/room-v060-clear-evening.png",
      night: "/game/room-v070-clear-night.png",
    },
    cloudy: {
      morning: "/game/room-v060-cloudy-morning.png",
      noon: "/game/room-v060-cloudy-noon.png",
      evening: "/game/room-v060-cloudy-evening.png",
      night: "/game/room-v060-cloudy-night.png",
    },
    rain: {
      morning: "/game/room-v060-rain-morning.png",
      noon: "/game/room-v060-rain-noon.png",
      evening: "/game/room-v060-rain-evening.png",
      night: "/game/room-v070-rain-night.png",
    },
    thunderstorm: {
      morning: "/game/room-v060-thunderstorm-morning.png",
      noon: "/game/room-v060-thunderstorm-noon.png",
      evening: "/game/room-v060-thunderstorm-evening.png",
      night: "/game/room-v060-thunderstorm-night.png",
    },
  });
  assert.equal(getRoomAsset("clear", "morning"), "/game/room-v070-clear-morning.png");
  assert.equal(getRoomAsset("clear", "noon"), "/game/room-v070-clear-noon.png");
  assert.equal(getRoomAsset("rain", "night"), "/game/room-v070-rain-night.png");
  assert.equal(getRoomAsset("thunderstorm", "evening"), "/game/room-v060-thunderstorm-evening.png");
  assert.equal(getYardAsset("thunderstorm", "night"), "/game/yard-thunderstorm-night.png");
});

test("grows crops only after watering and preserves offline progress", () => {
  const crop = cropItems.find((item) => item.id === "strawberry");
  const plantedAt = 1_000_000;
  assert.equal(getCropStage({ cropId: crop.id, plantedAt, wateredAt: null }, plantedAt + crop.growMs), "seed");
  assert.equal(getCropStage({ cropId: crop.id, plantedAt, wateredAt: plantedAt }, plantedAt + crop.growMs * .25), "seedling");
  assert.equal(getCropStage({ cropId: crop.id, plantedAt, wateredAt: plantedAt }, plantedAt + crop.growMs * .6), "growing");
  assert.equal(getCropStage({ cropId: crop.id, plantedAt, wateredAt: plantedAt }, plantedAt + crop.growMs), "mature");
  assert.equal(getCropProgress({ cropId: crop.id, plantedAt, wateredAt: plantedAt }, plantedAt + crop.growMs * .5), .5);
  assert.equal(getCropProgress({ cropId: crop.id, plantedAt, wateredAt: plantedAt }, plantedAt + crop.growMs * 2), 1);
  const watered = waterUnwateredPlots([{ cropId: crop.id, plantedAt, wateredAt: null }, null], plantedAt + 20);
  assert.equal(watered[0].wateredAt, plantedAt + 20);
  assert.equal(watered[1], null);
});

test("harvests produce into the backpack and cooks one crop into one dish", async () => {
  assert.deepEqual(INITIAL_PRODUCE, { strawberry: 0, carrot: 0, tomato: 0, catnip: 0, sunflower: 0, pumpkin: 0 });
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /produce: \{ \.\.\.current\.produce, \[plot\.cropId\]: current\.produce\[plot\.cropId\] \+ 1 \}/);
  assert.match(source, /produce: \{ \.\.\.current\.produce, \[dish\.cropId\]: current\.produce\[dish\.cropId\] - 1 \}/);
  assert.match(source, /inventory: \{ \.\.\.current\.inventory, \[dish\.id\]: current\.inventory\[dish\.id\] \+ 1 \}/);
  assert.doesNotMatch(source, /berries: current\.berries \+ crop\.reward/);
  assert.match(source, /className="kitchen-hotspot"/);
  assert.match(source, /className="recipe-grid"/);
});

test("tracks cooking progress up to the twenty minute recipe", () => {
  assert.equal(getCookingProgress(0, 20 * 60_000, 10 * 60_000), .5);
  assert.equal(formatCookingTime(20 * 60_000, 0), "20:00");
});

test("runs a persistent 25 plus 5 pomodoro cycle and rewards five strawberries once", async () => {
  assert.equal(POMODORO_FOCUS_MS, 25 * 60_000);
  assert.equal(POMODORO_BREAK_MS, 5 * 60_000);
  assert.equal(POMODORO_REWARD, 5);
  const started = startPomodoro({ ...INITIAL_POMODORO, todayDate: "2026-08-25" }, 1_000);
  assert.equal(started.endsAt, 1_000 + POMODORO_FOCUS_MS);
  assert.equal(formatPomodoroTime(POMODORO_FOCUS_MS), "25:00");

  const paused = pausePomodoro(started, 61_000);
  assert.equal(paused.status, "paused");
  assert.equal(paused.remainingMs, 24 * 60_000);

  const finished = settlePomodoro(started, "2026-08-25", started.endsAt);
  assert.equal(finished.reward, 5);
  assert.equal(finished.event, "focus");
  assert.equal(finished.state.phase, "break");
  assert.equal(finished.state.status, "running");
  assert.equal(finished.state.totalCycles, 1);
  assert.equal(finished.state.todayCycles, 1);
  assert.equal(finished.state.earnedBerries, 5);
  assert.equal(settlePomodoro(finished.state, "2026-08-25", started.endsAt).reward, 0);

  const restoredNextDay = normalizePomodoro(finished.state, "2026-08-26");
  assert.equal(restoredNextDay.todayCycles, 0);
  assert.equal(restoredNextDay.totalCycles, 1);
  assert.equal(restoredNextDay.earnedBerries, 5);

  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const desktopMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const desktopPreload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const desktopPomodoro = await readFile(new URL("../desktop/pomodoro.tsx", import.meta.url), "utf8");
  assert.match(source, /BERRY FOCUS CLOCK/);
  assert.match(source, /berries: current\.berries \+ result\.reward/);
  assert.match(source, /Notification\.requestPermission/);
  assert.match(source, /className="pomodoro-alert-layer"[\s\S]*role="alertdialog"[\s\S]*知道了/);
  assert.match(source, /new AudioContext\(\)/);
  assert.match(source, /playPomodoroChime\("focus"\)/);
  assert.match(source, /playPomodoroChime\("break"\)/);
  assert.match(source, /id === "pomodoro"\) preparePomodoroAudio\(\)/);
  assert.doesNotMatch(source, /试听提示音/);
  assert.doesNotMatch(source, /桌面系统弹窗提醒已开启|系统弹窗提醒已开启/);
  assert.match(source, /!desktopPomodoroAvailable && \(notificationPermission === "default" \|\| notificationPermission === "denied"\)/);
  assert.match(source, /className="pomodoro-progress-shell"[\s\S]*className="pomodoro-orange-mark"[\s\S]*pomodoro-orange\.png/);
  assert.match(source, /className="pomodoro-dock-icon"[\s\S]*pomodoro-orange\.png/);
  assert.doesNotMatch(source, /🍊/);
  assert.doesNotMatch(source, /pomodoro-tomato|🍅|番茄钟|番茄循环/);
  assert.match(source, /mini\.onAction\(\(action\) => \{[\s\S]*if \(action === "pause"\) pausePomodoroTimer\(\);[\s\S]*else startPomodoroTimer\(\)/);
  assert.doesNotMatch(source, /className="pomodoro-crown"/);
  assert.doesNotMatch(source, /crop-tomato-mature\.png[\s\S]*专注时间/);
  assert.match(css, /\.pomodoro-dial \{[^}]*background: radial-gradient[\s\S]*\.pomodoro-progress-shell \{[^}]*conic-gradient[\s\S]*\.pomodoro-orange-mark \{[^}]*image-rendering: pixelated/);
  assert.match(css, /\.pomodoro-dial-face > strong \{[^}]*color: #fffdf7/);
  assert.match(css, /\.desktop-pomodoro-mini \{[^}]*app-region: no-drag[\s\S]*\.desktop-pomodoro-mini \.pomodoro-dial \{[^}]*app-region: no-drag[\s\S]*\.desktop-pomodoro-mini \.pomodoro-drag-handle \{[^}]*top: 8px[^}]*app-region: no-drag/);
  assert.doesNotMatch(css, /\.desktop-pomodoro-mini[^\n{]*\{[^}]*app-region: drag/);
  assert.match(desktopPomodoro, /className="pomodoro-clock-card"[\s\S]*className="pomodoro-drag-handle"[\s\S]*<PomodoroClockFace/);
  assert.match(desktopPomodoro, /const \[dragging, setDragging\] = useState\(false\)[\s\S]*dragging \? "is-dragging" : ""/);
  assert.match(desktopPomodoro, /getPomodoroRemaining\(current\.state, Date\.now\(\)\)[\s\S]*window\.setInterval\(updateRemaining, 250\)/);
  assert.match(desktopPomodoro, /startDrag\(\{ x: event\.screenX, y: event\.screenY \}\)[\s\S]*moveDrag\(\{ x: event\.screenX, y: event\.screenY \}\)[\s\S]*endDrag\(\)/);
  assert.doesNotMatch(desktopPomodoro, /pomodoro-resize-handle|startResize|moveResize|endResize/);
  assert.doesNotMatch(source, /className="pomodoro-drag-handle"/);
  assert.match(css, /\.pomodoro-mini \.pomodoro-dial-face > strong \{[^}]*width: 92%[^}]*font-size: clamp\(12px, 6vmin, 18px\)/);
  assert.match(css, /\.desktop-pomodoro-mini \.pomodoro-dial \{[^}]*background: linear-gradient[^}]*backdrop-filter: saturate\(112%\) brightness\(1\.015\)[^}]*contain: layout paint style/);
  assert.match(css, /\.desktop-pomodoro-mini \.pomodoro-progress-shell \{[^}]*background: transparent[\s\S]*\.desktop-pomodoro-mini \.pomodoro-progress-shell::before[^}]*-webkit-mask: radial-gradient/);
  assert.match(css, /\.desktop-pomodoro-mini \.pomodoro-dial-face > strong \{[^}]*width: 5\.25ch[^}]*font-variant-numeric: tabular-nums[^}]*font-feature-settings: "tnum" 1, "kern" 0/);
  assert.match(css, /\.desktop-pomodoro-mini \.pomodoro-dial-face \{[^}]*animation: none[^}]*contain: layout paint style/);
  assert.match(css, /\.desktop-pomodoro-mini\.is-dragging \.pomodoro-dial-face[\s\S]*animation: none; transition: none/);
  assert.match(css, /@keyframes pomodoro-berry-burst/);
  assert.match(desktopMain, /app\.isPackaged[\s\S]*"com\.berryworkout\.island\.desktop\.v2"[\s\S]*"com\.berryworkout\.island\.development"[\s\S]*setAppUserModelId\(WINDOWS_APP_ID\)/);
  assert.match(desktopMain, /width: 160,[\s\S]*height: 160,[\s\S]*minWidth: 160,[\s\S]*minHeight: 160,[\s\S]*maxWidth: 160,[\s\S]*maxHeight: 160/);
  assert.match(desktopMain, /frame: false,[\s\S]*thickFrame: false,[\s\S]*roundedCorners: false,[\s\S]*movable: true[\s\S]*resizable: false[\s\S]*setMovable\(true\)/);
  assert.match(desktopMain, /pomodoro-mini:drag-start[\s\S]*getContentBounds\(\)[\s\S]*pomodoroMiniDragOrigin = \{ pointerX: point\.x, pointerY: point\.y, windowX: bounds\.x, windowY: bounds\.y, width: bounds\.width, height: bounds\.height \}[\s\S]*pomodoro-mini:drag-move[\s\S]*point\.x - pomodoroMiniDragOrigin\.pointerX[\s\S]*setContentBounds\(\{ x, y, width: pomodoroMiniDragOrigin\.width, height: pomodoroMiniDragOrigin\.height \}, false\)/);
  assert.doesNotMatch(desktopMain, /getCursorScreenPoint|setInterval|setPosition\(x, y/);
  assert.equal((desktopMain.match(/backgroundThrottling: false/g) ?? []).length, 2);
  assert.match(desktopPreload, /startDrag:[\s\S]*pomodoro-mini:drag-start[\s\S]*moveDrag:[\s\S]*pomodoro-mini:drag-move[\s\S]*endDrag:[\s\S]*pomodoro-mini:drag-end/);
  assert.doesNotMatch(desktopMain, /pomodoro-mini:resize-|pomodoroMiniResizeOrigin|setContentSize/);
  assert.doesNotMatch(desktopPreload, /pomodoro-mini:resize-|startResize|moveResize|endResize/);
  assert.match(desktopMain, /pomodoro:schedule[\s\S]*new Notification[\s\S]*notification\.on\("click"[\s\S]*window\.focus\(\)/);
});

test("keeps yard movement out of large obstacles", () => {
  assert.deepEqual(clampToScene({ x: 10, y: 45 }, "yard", YARD_OBSTACLES), { x: 10, y: 51 });
  const path = getWalkPath({ x: 30, y: 76 }, { x: 92, y: 60 }, "yard", YARD_OBSTACLES);
  assert.ok(path.length >= 1 && path.length <= 2);
  assert.ok(path.every((point) => point.x >= 7 && point.x <= 94 && point.y >= 45 && point.y <= 89));
});

test("shares sixteen strawberry-priced ingredients between the shop and bar", () => {
  assert.equal(ingredientItems.length, 16);
  assert.equal(ingredientItems.filter((item) => item.id !== "ice").every((item) => item.price > 0), true);
  assert.deepEqual(ingredientItems.find((item) => item.id === "gin"), {
    id: "gin",
    name: "金酒",
    category: "base_spirit",
    packageAmount: 750,
    unit: "ml",
    price: 36,
    iconIndex: 0,
    description: "清新的杜松子香气，适合清爽长饮。",
    relatedCocktails: ["金汤力", "汤姆柯林斯"],
    properties: { alcohol: 40, sweetness: 0, acidity: 0, bitterness: 2, color: "#dff4f1", carbonated: false },
  });
  assert.deepEqual(ingredientItems.find((item) => item.id === "ice"), {
    id: "ice",
    name: "冰块",
    category: "garnish",
    packageAmount: 0,
    unit: "portion",
    price: 0,
    iconIndex: 15,
    description: "吧台常备，免费且不限量。",
    relatedCocktails: ["全部长饮"],
    properties: { alcohol: 0, sweetness: 0, acidity: 0, bitterness: 0, color: "#dff5ff", carbonated: false },
  });
  assert.equal(Object.keys(INITIAL_INGREDIENT_INVENTORY).length, 15);
  assert.equal(Object.values(INITIAL_INGREDIENT_INVENTORY).every((amount) => amount === 0), true);
});

test("sells and persists an eighty-strawberry cocktail recipe book", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const bookArtwork = await readFile(new URL("../public/game/cocktail-recipe-book.png", import.meta.url));
  assert.match(source, /const COCKTAIL_BOOK = \{[\s\S]*id: "cocktailRecipeBook"[\s\S]*price: 80[\s\S]*asset: "\/game\/cocktail-recipe-book\.png"/);
  assert.match(source, /function buyCocktailBook\(\)[\s\S]*berries: current\.berries - COCKTAIL_BOOK\.price[\s\S]*purchased: \[\.\.\.current\.purchased, COCKTAIL_BOOK\.id\]/);
  assert.match(source, /ownsCocktailBook = game\.purchased\.includes\(COCKTAIL_BOOK\.id\)/);
  assert.match(source, /totalBackpackItems = totalFood \+ totalProduce \+ totalCocktails \+ \(ownsCocktailBook \? 1 : 0\)/);
  assert.match(source, /莓果调酒书已放进背包/);
  assert.match(source, /ownsCocktailBook && \([\s\S]*className="backpack-book"[\s\S]*onClick=\{openCocktailBook\}/);
  assert.match(source, /ingredientFilter === "all" && !ownsCocktailBook && <article/);
  assert.match(source, />返回背包<\/button>/);
  assert.match(source, /overlay === "recipe-book"[\s\S]*cocktailRecipes\.map[\s\S]*selectedBookRecipe\.ingredients\.map[\s\S]*COCKTAIL_BOOK_STEPS\[selectedBookRecipe\.method\]/);
  assert.match(source, /购买调酒书/);
  assert.match(css, /\.recipe-book-spread[\s\S]*\.recipe-book-directory[\s\S]*\.recipe-book-detail/);
  assert.match(css, /\.store-art \{[^}]*grid-template-rows: minmax\(0, 1fr\) auto[^}]*overflow: hidden/);
  assert.match(css, /\.store-art i \{[^}]*position: static[^}]*grid-row: 2[^}]*text-align: center/);
  assert.match(css, /\.store-grid :is\(small, p\) \{ font-size: 14px; \}/);
  assert.match(css, /\.store-grid :is\(small, h2, p\) \{ overflow-wrap: anywhere; \}/);
  assert.equal(bookArtwork.toString("ascii", 1, 4), "PNG");
  assert.equal(bookArtwork[25], 6);
});

test("scores recipes by ingredients, ratios, extras, and method", () => {
  const perfect = evaluateCocktail({ gin: 45, tonic: 120 }, "build");
  assert.equal(perfect.recipe.name, "金汤力");
  assert.equal(perfect.score, 100);
  assert.equal(perfect.quality, "完美");
  assert.equal(perfect.success, true);

  const perfectWithIce = evaluateCocktail({ gin: 45, tonic: 120, ice: 1 }, "build");
  assert.equal(perfectWithIce.score, 100);
  assert.equal(perfectWithIce.success, true);

  const imprecise = evaluateCocktail({ gin: 45, tonic: 80 }, "build");
  assert.equal(imprecise.recipe.name, "金汤力");
  assert.ok(imprecise.score < perfect.score);
  assert.equal(imprecise.success, true);

  const wrongMethod = evaluateCocktail({ gin: 45, tonic: 120 }, "shake");
  assert.ok(wrongMethod.score < perfect.score);
  assert.equal(wrongMethod.success, true);

  const mystery = evaluateCocktail({ gin: 45, tonic: 120, limeJuice: 20 }, "build");
  assert.equal(mystery.success, false);
  assert.equal(mystery.quality, "失败");
  assert.match(mystery.feedback, /不协调/);
  assert.equal(getLiquidTotal({ gin: 45, mint: 1, ice: 2 }), 45);
  assert.equal(ICE_DISPLACEMENT_ML, 18);
  assert.equal(getIceDisplacement({ gin: 45, ice: 3 }), 54);
  assert.equal(getOccupiedVolume({ gin: 45, ice: 3 }), 99);
  assert.equal(getOccupiedVolume({ gin: 330, ice: 1 }), 348);
  assert.match(mixIngredientColors({ grenadine: 15, orangeJuice: 90 }), /^rgb\(/);
});

test("persists ingredient stock and cocktail collection and settles each transaction once", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const sprite = await readFile(new URL("../public/game/cocktail-ingredients-v1.png", import.meta.url));
  const collection = createInitialCocktailCollection();
  assert.equal(Object.keys(collection).length, cocktailRecipes.length);
  assert.equal(Object.values(collection).every((entry) => !entry.unlocked && entry.bestScore === 0), true);
  assert.match(source, /gameSchemaVersion: 10[\s\S]*ingredientInventory: IngredientInventory[\s\S]*cocktailCollection: CocktailCollection[\s\S]*cocktailInventory: CocktailInventory/);
  assert.match(source, /const ingredientInventory = Object\.fromEntries[\s\S]*const cocktailCollection = Object\.fromEntries[\s\S]*const cocktailInventory = Object\.fromEntries/);
  assert.match(source, /function confirmIngredientPurchase\(\)[\s\S]*ingredientPurchaseLock\.current = true[\s\S]*setGame\(\(current\) => \(\{[\s\S]*berries: current\.berries - totalPrice[\s\S]*ingredientInventory:/);
  assert.match(source, /function startMixing\(\)[\s\S]*mixingTransactionLock\.current = true[\s\S]*ingredientInventory\[stockId\] = Math\.max\(0, ingredientInventory\[stockId\] - \(amount \?\? 0\)\)/);
  assert.match(source, /setMixResult\(\{ \.\.\.result, firstUnlock, consumed \}\)[\s\S]*mixingTransactionLock\.current = false/);
  assert.match(source, /cocktailInventory: \{[\s\S]*\[result\.recipe\.id\]: current\.cocktailInventory\[result\.recipe\.id\] \+ 1/);
  assert.match(source, /className=\{unlocked \? "unlocked" : "locked"\}[\s\S]*尚未解锁的鸡尾酒剪影[\s\S]*game\.cocktailInventory\[recipe\.id\]/);
  assert.match(css, /\.bag-cocktails article\.locked img \{[^}]*filter: brightness\(0\)/);
  assert.match(source, /调酒配料/);
  assert.match(source, /鸡尾酒图鉴/);
  assert.match(source, /开始调制/);
  assert.match(source, /mixIceDisplacement[\s\S]*mixOccupiedVolume/);
  assert.match(source, /className="ice-cube-slot"/);
  assert.match(source, /pouring === "ice" \? "dropping-ice"/);
  assert.match(source, /remainingVolume < ICE_DISPLACEMENT_ML[\s\S]*杯内空间不足，不能再放冰块/);
  assert.match(source, /Math\.min\(148, Math\.max\(10, mixFillHeight - 19 - row \* 20\)\)/);
  assert.doesNotMatch(source, /金币|钻石|积分/);
  assert.match(css, /\.bar-vessel\.method-shake[\s\S]*\.bar-vessel\.method-stir[\s\S]*\.bar-vessel\.method-build/);
  assert.match(css, /@keyframes ice-gravity-drop[\s\S]*@keyframes ice-buoyancy[\s\S]*@keyframes ice-splash/);
  assert.match(source, /className="bar-liquid-clip"[\s\S]*className="bar-liquid"/);
  assert.match(css, /\.bar-liquid-clip \{[^}]*inset: 7px[^}]*overflow: hidden[^}]*border-radius: 8px 8px 39px 39px/);
  assert.match(css, /\.bar-liquid \{[^}]*overflow: hidden/);
  assert.match(source, /className="bar-liquid-surface"[\s\S]*translate3d/);
  assert.match(css, /\.bar-liquid \{[^}]*transition: clip-path \.24s var\(--ease-out\)/);
  assert.doesNotMatch(css, /\.bar-liquid \{[^}]*transition: height/);
  assert.match(css, /\.bar-vessel\.dropping-ice \.ice-field::after/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.equal(sprite.toString("ascii", 1, 4), "PNG");
  assert.equal(sprite[25], 6);
  assert.equal(new Set(cocktailRecipes.map((recipe) => recipe.asset)).size, cocktailRecipes.length);
  for (const recipe of cocktailRecipes) {
    const artwork = await readFile(new URL(`../public${recipe.asset}`, import.meta.url));
    assert.equal(artwork.toString("ascii", 1, 4), "PNG");
    assert.equal(artwork[25], 6);
  }
});

test("maps movement vectors to all eight walking directions", () => {
  const origin = { x: 0, y: 0 };
  assert.equal(getWalkDirection(origin, { x: -1, y: 0 }), "left");
  assert.equal(getWalkDirection(origin, { x: -1, y: -1 }), "up-left");
  assert.equal(getWalkDirection(origin, { x: 0, y: -1 }), "up");
  assert.equal(getWalkDirection(origin, { x: 1, y: -1 }), "up-right");
  assert.equal(getWalkDirection(origin, { x: 1, y: 0 }), "right");
  assert.equal(getWalkDirection(origin, { x: 1, y: 1 }), "down-right");
  assert.equal(getWalkDirection(origin, { x: 0, y: 1 }), "down");
  assert.equal(getWalkDirection(origin, { x: -1, y: 1 }), "down-left");
  assert.deepEqual(Object.values(WALK_DIRECTION_ROW), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("ships transparent eight-direction sprite sheets for every cat", async () => {
  for (const kind of ["orange", "cow", "white"]) {
    const png = await readFile(new URL(`../public/game/cat-${kind}-walk-8dir-v4.png`, import.meta.url));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 2048);
    assert.equal(png[25], 6);
  }
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const stepDirection = getWalkDirection\(from, destination\)[\s\S]*setDirection\(stepDirection\)[\s\S]*from = point/);
  assert.match(source, /WALK_DIRECTION_ROW\[direction\]/);
  assert.match(css, /\.cat-walk-sprite \{[^}]*background-size: 400% 800%/);
});

test("keeps the room vinyl static without the rotating fragment", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /ROOM_SCENE_ASSET_VERSION[\s\S]*\?v=\$\{ROOM_SCENE_ASSET_VERSION\}/);
  assert.doesNotMatch(source, /roomVinylFrame|setRoomVinylFrame|room-frames|turntable-frames|room-turntable-vinyl/);
});

test("keeps the player vinyl perfectly round while only its clipped highlight rotates", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.turntable-record, \.sleeve-vinyl \{[^}]*overflow: hidden[^}]*contain: paint[^}]*border-radius: 50%/);
  assert.match(css, /\.turntable-record::before, \.sleeve-vinyl::before \{[^}]*inset: -14%[^}]*border-radius: 50%[^}]*animation: vinyl-groove-spin/);
  assert.match(css, /\.current\.playing::before \{ animation-play-state: running; \}/);
  assert.doesNotMatch(css, /\.current \{[^}]*animation:/);
});

test("uses the requested NetEase playlist and local fallbacks for its unavailable tracks", async () => {
  assert.equal(PLAYLIST_ID, "17961012548");
  assert.equal(Object.keys(LOCAL_PLAYBACK_PATHS).length, 23);
  assert.equal(resolvePlaybackUrl(2623215876, null), "/music/tracks/2623215876.mp3");
  assert.equal(resolvePlaybackUrl(1352585027, null), "/music/tracks/1352585027.mp3");
  assert.equal(resolvePlaybackUrl(2008736389, "http://example.com/song.mp3"), "https://example.com/song.mp3");
  await Promise.all(Object.values(LOCAL_PLAYBACK_PATHS).map((playbackPath) =>
    access(new URL(`../public${playbackPath}`, import.meta.url))));
  const beaute = await readFile(new URL("../public/music/tracks/2623215876.mp3", import.meta.url));
  assert.equal(beaute.subarray(0, 3).toString("ascii"), "ID3");
  assert.ok(beaute.length > 4_000_000);
});

test("refreshes expiring NetEase playback URLs without reusing a cached playlist", async () => {
  let requestedUrl = "";
  let requestedCache = "";
  const playlist = await fetchPlaylist(async (url, init) => {
    requestedUrl = String(url);
    requestedCache = String(init?.cache);
    return Response.json({ id: PLAYLIST_ID, name: "test", trackCount: 1, tracks: [{ id: 1, name: "song", artist: "artist", duration: 1, cover: "", playbackUrl: "https://example.com/song.mp3", playbackCode: 200, playbackFee: 0 }] });
  });
  assert.match(requestedUrl, /^\/api\/netease-playlist\?refresh=\d+$/);
  assert.equal(requestedCache, "no-store");
  assert.equal(playlist.tracks.length, 1);
  assert.equal(isRemotePlaybackUrl(playlist.tracks[0].playbackUrl), true);
  assert.equal(isRemotePlaybackUrl(LOCAL_PLAYBACK_PATHS[1352585027]), false);
});

test("opens the desktop record cabinet from its bundled playlist when NetEase is unavailable", async () => {
  const root = fileURLToPath(new URL("../public/", import.meta.url));
  const playlist = await loadDesktopPlaylist(root, async () => { throw new Error("offline"); });
  assert.equal(playlist.id, PLAYLIST_ID);
  assert.equal(playlist.trackCount, 118);
  assert.equal(playlist.tracks.length, 118);
  assert.equal(playlist.tracks[0].name, "Beauté");
  assert.equal(playlist.tracks[0].playbackUrl, "/music/tracks/2623215876.mp3");
  assert.equal(playlist.tracks.filter((track) => track.playbackUrl).length, 23);
  assert.deepEqual(DESKTOP_PLAYBACK_PATHS, LOCAL_PLAYBACK_PATHS);
  const electronMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(electronMain, /pathname === "\/api\/netease-playlist"[\s\S]*loadDesktopPlaylist\(root, net\.fetch\)/);
  assert.match(electronMain, /supportFetchAPI: true, stream: true/);
  assert.match(electronMain, /Cache-Control": "no-store, max-age=0"/);
});

test("automatically refreshes an expired stream and resumes its playback position", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/netease-playlist/route.ts", import.meta.url), "utf8");
  const recoveryStart = source.indexOf("async function recoverPlayback()");
  const recoveryEnd = source.indexOf("\n  function togglePlayback", recoveryStart);
  const recoveryBody = source.slice(recoveryStart, recoveryEnd);
  assert.match(recoveryBody, /isRemotePlaybackUrl\(track\.playbackUrl\)[\s\S]*fetchPlaylist\(\)/);
  assert.match(recoveryBody, /resumeAt[\s\S]*loadedmetadata[\s\S]*audio\.currentTime[\s\S]*audio\.play\(\)/);
  assert.match(recoveryBody, /recoveringTrackId/);
  assert.match(recoveryBody, /lastPlaybackRecovery[\s\S]*30_000/);
  assert.match(source, /onError=\{\(\) => \{ void recoverPlayback\(\); \}\}/);
  assert.match(route, /Cache-Control": "no-store, max-age=0"/);
});

test("lets furniture touch the wall while keeping its feet out of fixed room furniture", () => {
  const footprint = { halfWidth: 6, height: 10 };
  const wall = clampFurniturePosition({ x: 50, y: 20 }, footprint);
  const kitchen = clampFurniturePosition({ x: 20, y: 30 }, footprint);
  const music = clampFurniturePosition({ x: 88, y: 48 }, footprint);
  const bar = clampFurniturePosition({ x: 90, y: 70 }, footprint);
  const overlaps = (point, rect) => point.x + footprint.halfWidth > rect.left
    && point.x - footprint.halfWidth < rect.right
    && point.y + 2 > rect.top
    && point.y - 2.5 < rect.bottom;
  assert.deepEqual(wall, { x: 50, y: 43 });
  assert.ok(wall.y - footprint.height < 43);
  for (const point of [kitchen, music, bar]) {
    assert.ok(ROOM_FIXED_OBSTACLES.every((rect) => !overlaps(point, rect)));
  }
});

test("keeps the cat body clear of the bar counter", () => {
  assert.deepEqual(clampToScene({ x: 78, y: 61 }, "room", ROOM_FIXED_OBSTACLES), { x: 71, y: 61 });
});

test("keeps the cat and movement controls indoors", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /game\.scene !== "room" \|\| overlay/);
  assert.match(source, /onPointerDown=\{game\.scene === "room" \? moveCat : undefined\}/);
  assert.match(source, /\{game\.scene === "room" && game\.adoptedPets\.map[\s\S]*className=\{`scene-cat walking-cat/);
  assert.match(source, /全屏像素院子。点击田地进行种植，或使用导航栏。/);
});

test("selects seeds from the yard storage before planting a chosen plot", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /aria-label="打开种子仓库"/);
  assert.match(source, /else if \(selectedSeed\) plantCrop\(index, selectedSeed\)/);
  assert.match(source, /className="seed-cursor"[\s\S]*crop-\$\{selectedSeed\}-seed\.png/);
  assert.match(source, /setSelectedSeed\(crop\.id\)[\s\S]*点击空田播种/);
  assert.match(source, /className="seed-storage"[\s\S]{0,300}setSelectedSeed\(null\)/);
  assert.doesNotMatch(source, /selectedPlot|setSelectedPlot/);
  assert.match(css, /\.seed-storage \{[^}]*left: 91%/);
  assert.match(css, /\.game-room:is\(\.seed-selected, \.watering-selected\)[^{]*\{ cursor: none !important; \}/);
});

test("moves the watering can with the pointer and tips it over the selected plot", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const \[wateringPlot, setWateringPlot\] = useState<number \| null>\(null\)/);
  assert.match(source, /className="watering-cursor" src="\/game\/watering-can-matched\.png"/);
  assert.match(source, /className="watering-animation"[\s\S]*className="water-spray"[\s\S]*<i \/><i \/><i \/><i \/><i \/>[\s\S]*className="water-impact"/);
  assert.match(source, /setWateringPlot\(index\)[\s\S]*setWateringPlot\(null\)/);
  assert.match(css, /@keyframes watering-pour[^{]*\{[\s\S]*rotate\(-28deg\)/);
  assert.match(css, /\.water-spray i[^{]*\{[^}]*animation: water-drop/);
  assert.match(css, /\.water-impact[^{]*\{[^}]*top: 127px[^}]*animation: water-impact/);
  assert.match(css, /\.watering-can \{[^}]*outline: 0/);
  assert.match(css, /\.watering-cursor \{[^}]*brightness\(\.84\) saturate\(\.86\) contrast\(1\.12\)/);
  assert.doesNotMatch(css, /water-stream|water-flow|water-drops/);
  assert.match(source, /className=\{`crop-progress[\s\S]*<progress max=\{1\} value=\{progress\}/);
  assert.match(css, /\.crop-progress \{[^}]*bottom: 4%;[^}]*width: 96px/);
  assert.match(css, /\.crop-progress b \{[^}]*font-size: 11px/);
  assert.match(css, /\.farm-plot \.crop-sprite \{[^}]*z-index: 1;[^}]*inset: auto 4% 2%;[^}]*height: 145%/);
  assert.doesNotMatch(css, /\.farm-plot:has\(\.crop-sprite\)::after/);
  assert.doesNotMatch(css, /crop-ready|farm-plot\.mature \.crop-sprite/);
});

test("ships complete base scenes without duplicate door or field layers", async () => {
  const periods = ["morning", "noon", "evening", "night"];
  for (const weather of ["clear", "cloudy", "rain", "thunderstorm"]) {
    for (const period of periods) {
      const png = await readFile(new URL(`../public/game/yard-${weather}-${period}.png`, import.meta.url));
      assert.equal(png.readUInt32BE(16), 1672);
      assert.equal(png.readUInt32BE(20), 941);
    }
  }
  for (const name of ["room-kitchen-v3.png", "room-kitchen-morning.png", "room-kitchen-evening.png", "room-kitchen-cloudy.png", "room-kitchen-rain.png", "room-kitchen-thunderstorm.png"]) {
    const png = await readFile(new URL(`../public/game/${name}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 1672);
    assert.equal(png.readUInt32BE(20), 941);
  }
  const furniture = ["strawberry-sofa", "cat-tree", "fish-fireplace", "wicker-rocker", "cream-vanity", "grandfather-clock", "fish-scratcher", "flower-stool", "tea-cart", "yarn-basket"];
  const transparent = [
    ...furniture.map((name) => `furniture-${name}.png`),
    "furniture-fish-fireplace-overlay.png", "furniture-grandfather-clock-overlay.png", "furniture-yarn-basket-overlay.png",
    "effect-seed.png", "effect-water.png", "effect-harvest.png", "watering-can-matched.png",
    ...["strawberry-puree", "carrot-soup", "tomato-soup", "catnip-biscuits", "sunflower-rice", "pumpkin-puree"].map((name) => `dish-${name}.png`),
    ...cropItems.flatMap((crop) => ["seed", "seedling", "growing", "mature"].map((stage) => `crop-${crop.id}-${stage}.png`)),
    ...["orange", "cow", "white"].flatMap((cat) => [1, 2, 3, 4].map((frame) => `cat-${cat}-scratch-${frame}.png`)),
  ];
  for (const name of transparent) {
    const png = await readFile(new URL(`../public/game/${name}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG", name);
    assert.ok([4, 6].includes(png[25]), `${name} must contain alpha`);
  }
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /door-(?:room|yard)-(?:handle|open-[12])\.png|plot-(?:dry|wet)\.png/);
  assert.match(css, /\.scene-door-room[^}]*clip-path|\.scene-door[^}]*clip-path/);
  assert.match(css, /\.farm-plot[^}]*clip-path/);
});

test("weather and time preserve the interior colors", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /data-weather[^\{]*\{[^\}]*--scene-lighting|not\(\[data-weather="clear"\]\) \.room-vignette/);
  assert.match(css, /data-period="night"\] \{ --scene-lighting: brightness\(\.97\); \}/);
  assert.doesNotMatch(css, /data-period="(?:morning|evening|night)"[^\}]*\b(?:sepia|saturate|hue-rotate)\(/);
  assert.doesNotMatch(css, /data-period="night"\] \.room-vignette/);
});

test("uses the pixel cat paw cursor throughout the game", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const cursor = await readFile(new URL("../public/game/cursor-cat-paw-native.cur", import.meta.url));
  assert.doesNotMatch(source, /--paw-[xy]|cat-paw-cursor/);
  assert.match(css, /\.game-stage \{[^}]*cursor: url\("\/game\/cursor-cat-paw-native\.cur"\), default !important;/);
  assert.match(css, /\.game-stage \* \{ cursor: inherit !important; \}/);
  assert.equal(cursor.readUInt16LE(2), 2);
  assert.equal(cursor.readUInt16LE(10), 15);
  assert.equal(cursor.readUInt16LE(12), 15);
  assert.equal(cursor.readUInt32LE(22), 40);
  assert.equal(cursor.readInt32LE(26), 32);
  assert.equal(cursor.readInt32LE(30), 64);
  assert.equal(cursor.readUInt16LE(36), 32);
});

test("maps the two pet stats to all nine animation states", () => {
  assert.deepEqual(
    [
      [85, 12], [85, 50], [85, 88],
      [50, 12], [50, 50], [50, 88],
      [12, 12], [12, 50], [12, 88],
    ].map(([energy, sleepiness]) => getCatStatus(energy, sleepiness)),
    ["high-low", "high-medium", "high-high", "medium-low", "medium-medium", "medium-high", "low-low", "low-medium", "low-high"],
  );
  assert.equal(getCatStatus(30, 30), "low-low");
  assert.equal(getCatStatus(31, 31), "medium-medium");
  assert.equal(getCatStatus(71, 71), "high-high");
  assert.equal(Object.keys(CAT_STATUS_ANIMATIONS).length, 9);
  for (const [status, animation] of Object.entries(CAT_STATUS_ANIMATIONS)) {
    assert.ok(animation.frames.length >= 5);
    assert.ok(animation.frames.every((frame) => frame.duration >= 90 && !("scale" in frame)));
    assert.ok(animation.frames.every((frame) => frame.pose !== "wake"));
    const restingPose = status === "low-high" ? "sleep" : "idle";
    assert.equal(animation.frames[0].pose, restingPose);
    assert.equal(animation.frames.at(-1).pose, restingPose);
  }
  assert.equal(getCatStatusTransition("high-low", "low-high").at(-1).pose, "sleep");
  assert.equal(getCatStatusTransition("low-high", "high-low").at(-1).pose, "idle");
  assert.ok(getCatStatusTransition("high-high", "high-low").every((frame) => frame.pose !== "wake"));
  assert.ok(getCatStatusTransition("low-high", "high-low").some((frame) => frame.pose === "wake"));
});

test("drains energy, raises sleepiness, and allows movement while energy remains", () => {
  assert.equal(PET_STAT_DECAY_MS, 300000);
  assert.deepEqual(decayPetStats(72, 24), { energy: 71, sleepiness: 25 });
  assert.deepEqual(decayPetStats(0, 100), { energy: 0, sleepiness: 100 });
  assert.deepEqual(decayPetStatsByTime(72, 24, 1_000_000, 1_900_001), { energy: 69, sleepiness: 27, statsUpdatedAt: 1_900_000 });
  assert.deepEqual(decayPetStatsByTime(72, 24, 0, 1_000_000), { energy: 72, sleepiness: 24, statsUpdatedAt: 1_000_000 });
  assert.equal(canPetMove(42), true);
  assert.equal(canPetMove(0), false);
});

test("keeps cat-bed sleep active for three hours and formats the countdown", () => {
  const now = 1_700_000_000_000;
  assert.equal(SLEEP_DURATION_MS, 10800000);
  assert.equal(getSleepRemainingMs(now + SLEEP_DURATION_MS, now), SLEEP_DURATION_MS);
  assert.equal(getSleepRemainingMs(now - 1, now), 0);
  assert.equal(formatSleepRemaining(SLEEP_DURATION_MS), "3:00:00");
  assert.equal(formatSleepRemaining(3661000), "1:01:01");
});

test("only movement intent asks to cancel sleep before the wake-up animation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const start = source.indexOf("function interruptSleep()");
  const end = source.indexOf("\n  function", start + 1);
  const interruptBody = source.slice(start, end);
  const moveStart = source.indexOf("function moveCat(");
  const moveEnd = source.indexOf("\n  function walkCatTo", moveStart);
  const moveBody = source.slice(moveStart, moveEnd);
  const keyboardStart = source.indexOf("const onKeyDown = (event: KeyboardEvent)");
  const keyboardEnd = source.indexOf("window.addEventListener(\"keydown\", onKeyDown)", keyboardStart);
  const keyboardBody = source.slice(keyboardStart, keyboardEnd);
  assert.match(moveBody, /if \(resting\) \{[\s\S]*requestSleepInterrupt\(\)[\s\S]*return/);
  assert.match(keyboardBody, /const move = moves\[event\.key\][\s\S]*if \(resting\) \{[\s\S]*requestSleepInterrupt\(\)[\s\S]*return/);
  assert.doesNotMatch(source, /startCatDrag|trackCatDrag|stopCatDrag|setPointerCapture|releasePointerCapture/);
  assert.match(source, /是否要取消睡眠？[\s\S]*>取消睡眠<\/button>/);
  assert.match(interruptBody, /petSleep: \{ \.\.\.current\.petSleep, \[current\.pet\]: \{ endsAt: null, rest: 0, furnitureId: null \} \}[\s\S]*sleepEndsAt: null[\s\S]*sleepRest: 0/);
  assert.doesNotMatch(interruptBody, /catFurniture: null/);
  assert.match(source, /function walkCatTo[\s\S]*catPosition: point, catFurniture: null/);
  assert.match(interruptBody, /setWakingUp\(true\)/);
  assert.doesNotMatch(interruptBody, /sleepiness:\s*Math\.max|sleepiness\s*-/);
  assert.match(source, /cat-orange-wake\.png[\s\S]*cat-cow-wake\.png[\s\S]*cat-white-wake\.png/);
  assert.doesNotMatch(source, /frameAdjustments|baseAdjustment/);
  assert.doesNotMatch(css, /walking-cat\.(?:resting|waking-up)[^{]*\{[^}]*\bwidth:/);
  assert.doesNotMatch(css, /\.walking-cat\.resting \{[^}]*pointer-events: auto/);
  assert.doesNotMatch(css, /@keyframes cat-rest[^\n]*\bscale:/);
  assert.doesNotMatch(css, /@keyframes cat-head-shake[^\n]*\brotate:/);
});

test("other controls do not open the sleep interruption confirmation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function feedPet(");
  const end = source.indexOf("\n  function", start + 1);
  const feedBody = source.slice(start, end);
  const sceneStart = source.indexOf("function changeScene(");
  const sceneEnd = source.indexOf("\n  function", sceneStart + 1);
  const changeSceneBody = source.slice(sceneStart, sceneEnd);
  const furnitureStart = source.indexOf("function moveCatToFurniture(");
  const furnitureEnd = source.indexOf("\n  async function checkIn", furnitureStart);
  const furnitureBody = source.slice(furnitureStart, furnitureEnd);
  assert.match(feedBody, /beginFeeding[\s\S]*petId: inspectedPetId[\s\S]*switchControlledPet\(inspectedPetId\)/);
  assert.doesNotMatch(feedBody, /setInterruptConfirm\(true\)|requestSleepInterrupt/);
  assert.doesNotMatch(changeSceneBody, /setInterruptConfirm|requestSleepInterrupt/);
  assert.doesNotMatch(furnitureBody, /setInterruptConfirm|requestSleepInterrupt/);
  assert.match(changeSceneBody, /if \(resting\) \{[\s\S]*setToast[\s\S]*return/);
});

test("keeps every cat animation loaded and coordinates transitions", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const assets = await readdir(new URL("../public/game", import.meta.url));
  for (const cat of ["orange", "cow", "white"]) {
    assert.equal(assets.filter((name) => new RegExp(`^cat-${cat}-(?:walk-v2|groom|yawn|wake-yawn)-[1-4]\\.png$`).test(name)).length, 16);
    const fixedFrames = assets.filter((name) => new RegExp(`^cat-${cat}-(?:walk|groom)-fixed-[1-4]\\.png$`).test(name));
    assert.equal(fixedFrames.length, 8);
    const scratchFrames = assets.filter((name) => new RegExp(`^cat-${cat}-scratch-[1-4]\\.png$`).test(name));
    assert.equal(scratchFrames.length, 4);
    for (const frame of [...fixedFrames, ...scratchFrames]) {
      const png = await readFile(new URL(`../public/game/${frame}`, import.meta.url));
      assert.equal(png.readUInt32BE(16), 418);
      assert.equal(png.readUInt32BE(20), 418);
    }
    for (const state of ["idle", "sleep", "wake"]) assert.ok(assets.includes(`cat-${cat}-${state}.png`));
  }
  assert.match(source, /animationImages\.current = frames\.map/);
  assert.match(source, /image\.decode\(\)\.catch/);
  assert.match(source, /const activePose: CatPose = resting \|\| lounging \? "sleep"/);
  assert.match(source, /const catAsset = scratching \? pet\.scratchFrames/);
  assert.match(source, /setWalkDuration\(0\)[\s\S]*requestAnimationFrame\(animate\)/);
  assert.match(source, /Math\.hypot\(destination\.x - from\.x, destination\.y - from\.y\) \* 14/);
  assert.match(source, /const STATUS_IDLE_MS = 8000/);
  assert.match(source, /className=\{`cat-base cat-pose-\$\{activePose\}`\}[\s\S]*decoding="sync"/);
  assert.match(source, /const \[statusIdle, setStatusIdle\] = useState\(true\)/);
  assert.match(source, /statusIdle[\s\S]*setStatusIdle\(false\)[\s\S]*setStatusIdle\(true\)/);
  assert.match(source, /desiredCatStatus !== catStatus[\s\S]*getCatStatusTransition\(catStatus, desiredCatStatus\)/);
  assert.doesNotMatch(source, /<img className="cat-base" key=\{/);
});

test("shop discloses distinct food and cat-bed recovery values", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /补充活力 \+\{item\.energy\}/);
  assert.match(source, /困倦值 -\$\{item\.rest\}/);
  assert.match(source, /rest: 30[\s\S]*rest: 55[\s\S]*rest: 80/);
});

test("keeps desktop records in update-safe local storage and uses daily ratings", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const checkins = await readFile(new URL("../db/checkins.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/checkins/route.ts", import.meta.url), "utf8");
  const photoApi = await readFile(new URL("../app/api/journal-photos/route.ts", import.meta.url), "utf8");
  const photoStore = await readFile(new URL("../db/journal-photos.ts", import.meta.url), "utf8");
  const electronMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const macWorkflow = await readFile(new URL("../.github/workflows/macos-build.yml", import.meta.url), "utf8");
  assert.match(source, /historyDates\.slice\(historyPage \* 2, historyPage \* 2 \+ 2\)/);
  assert.match(css, /\.notebook-page \{[^}]*min-height: 430px/);
  assert.match(source, /TODAY&apos;S NOTE[\s\S]*今天发生了什么[\s\S]*JOURNAL HISTORY[\s\S]*往日日记/);
  assert.match(source, /maxLength=\{300\}/);
  assert.match(source, /const todayRecordCount = history\.filter\(\(record\) => record\.date === today\)\.length/);
  assert.match(api, /countCheckinsForDate[\s\S]*getJournalReward\(\(await countCheckinsForDate\(deviceId, date\)\) \+ 1\)/);
  assert.match(api, /journalPhotoExists[\s\S]*照片不存在，请重新选择/);
  assert.doesNotMatch(source, /calorie|卡路里|千卡|智能估算/i);
  assert.doesNotMatch(api, /calorie|estimateCalories/i);
  assert.doesNotMatch(source, /backup-consent|syncDesktopRecord|BACKUP_ORIGIN|云备份/);
  assert.match(source, /RELEASE_NOTES[\s\S]*version: "0\.2\.2"[\s\S]*仅保存在本机[\s\S]*version: "0\.2\.1"[\s\S]*手账翻回前一页[\s\S]*无面部像素草莓/);
  assert.match(source, /release-modal-layer[\s\S]*全部更新内容[\s\S]*RELEASE_NOTES\.map[\s\S]*知道了/);
  assert.match(source, /berry-workout-release-notes-seen/);
  assert.doesNotMatch(source, /className="release-notes"/);
  assert.doesNotMatch(api, /access-control-allow-origin|export function OPTIONS/);
  assert.match(electronMain, /app:version[\s\S]*app\.getVersion\(\)[\s\S]*checkForUpdates/);
  assert.match(preload, /version: \(\) => ipcRenderer\.invoke\("app:version"\)/);
  assert.match(source, /今天给自己打几分/);
  assert.doesNotMatch(source, /className="duration-field"|className="mood-field"|name: "娱乐"/);
  assert.match(schema, /rating: integer\("rating"\)[\s\S]*reward: integer\("reward"\)/);
  assert.match(schema, /category: text\("category"\)/);
  assert.match(checkins, /name === "rating"[\s\S]*ALTER TABLE checkins ADD rating INTEGER[\s\S]*ALTER TABLE checkins ADD reward INTEGER/);
  assert.match(electronMain, /app\.setName\("OH"\)[\s\S]*user-data\.json[\s\S]*createStorage\(dataFile, \{ journalPhotosDirectory, photoBoardDirectory \}\)[\s\S]*storage:load[\s\S]*storage:save/);
  assert.match(packageJson, /"version": "0\.9\.11"[\s\S]*"appId": "com\.berryworkout\.island\.desktop\.v2"[\s\S]*"productName": "OH"[\s\S]*"mac"[\s\S]*"target": "dmg"/);
  assert.match(packageJson, /"from": "desktop-dist"[\s\S]*"!game\/room-frames\{,\/\*\*\/\*\}"/);
  assert.match(source, /RELEASE_VERSION = "0\.9\.11"[\s\S]*三只猫保持原始体型[\s\S]*version: "0\.9\.10"[\s\S]*桌面版照片板上传后显示破图[\s\S]*version: "0\.9\.9"/);
  assert.match(packageJson, /"createDesktopShortcut": "always"[\s\S]*"createStartMenuShortcut": true[\s\S]*"include": "build\/installer\.nsh"/);
  const installer = await readFile(new URL("../build/installer.nsh", import.meta.url), "utf8");
  assert.match(installer, /customInstall[\s\S]*newStartMenuLink[\s\S]*SetLnkAUMI[\s\S]*newDesktopLink[\s\S]*SetLnkAUMI[\s\S]*SHChangeNotify/);
  assert.match(packageJson, /"guid": "157ce719-ed07-5847-b8dd-55ce3ea69ebd"/);
  assert.match(macWorkflow, /macos-15[\s\S]*arch: \[arm64, x64\][\s\S]*desktop:build:mac[\s\S]*outputs\/\*\.dmg/);
  assert.match(electronMain, /showSaveDialog[\s\S]*\.ohbackup[\s\S]*storage\.exportPayload[\s\S]*showOpenDialog[\s\S]*storage\.importPayload/);
  assert.match(preload, /storage:[\s\S]*sendSync\("storage:load"[\s\S]*send\("storage:save"[\s\S]*storage:export[\s\S]*storage:import/);
  assert.match(source, /数据备份[\s\S]*导出 \.ohbackup 文件[\s\S]*选择备份并导入/);
  assert.match(source, /TIME_PERIOD_LABELS[\s\S]*WEATHER_ICONS[\s\S]*className="scene-context"[\s\S]*"OH"[\s\S]*草莓小院/);
  assert.match(source, /getWeatherIcon[\s\S]*weather === "clear" && period === "night" \? "🌙"[\s\S]*getWeatherIcon\(weather\.kind, timePeriod\)/);
  assert.match(source, /open-meteo[\s\S]*cache: "no-store"[\s\S]*5 \* 60 \* 1000[\s\S]*visibilitychange/);
  assert.match(source, /className="scene-context-home"[\s\S]*🏠[\s\S]*dock-record-icon[\s\S]*record-book[\s\S]*dock-bag-icon[\s\S]*bag-body[\s\S]*dock-shop-icon[\s\S]*🛒[\s\S]*dock-pets-icon[\s\S]*dock-paw-one[\s\S]*dock-decorate-icon[\s\S]*🪑/);
  assert.match(css, /--hud-surface:[\s\S]*\.scene-context \{[^}]*border-radius: 22px[\s\S]*\.scene-context-home[^}]*Segoe UI Emoji[\s\S]*\.game-dock \.dock-icon[^}]*font-size: 24px/);
  for (const animation of ["dock-orange-ring", "dock-cart-roll", "dock-cart-wheel", "dock-paw-one", "dock-paw-two", "dock-chair-lift"]) assert.match(css, new RegExp(animation));
  assert.match(source, /record-book[\s\S]*closed-book[\s\S]*closed-book-cover[\s\S]*open-book[\s\S]*open-book-page-left[\s\S]*open-book-spine[\s\S]*bag-body[\s\S]*bag-inner[\s\S]*zipper-track-left[\s\S]*bag-content[\s\S]*dock-paw-one[\s\S]*dock-paw-two/);
  assert.match(css, /\.closed-book, \.open-book \{[^}]*transition: transform 390ms[\s\S]*button:is\(:hover, :focus-visible\) \.closed-book \{[^}]*opacity: 0[\s\S]*button:is\(:hover, :focus-visible\) \.open-book \{[^}]*opacity: 1/);
  assert.match(css, /\.bag-zipper \{[^}]*transition: transform 180ms[\s\S]*button:is\(:hover, :focus-visible\) \.bag-zipper \{[^}]*translateX\(8px\)/);
  assert.doesNotMatch(css, /animation: dock-(?:book|bag|zipper)/);
  assert.doesNotMatch(source, /dock-paw-step|dock-pets-icon[^\n]*🐾/);
  assert.match(css, /\.game-dock button:hover \{[^}]*background: rgba\(239, 201, 137, \.2\)[^}]*\}/);
  assert.doesNotMatch(css, /\.game-dock button:hover \{[^}]*transform:/);
  assert.doesNotMatch(source, /添加一张照片|journal-photo-field|selectJournalPhoto|selectWebJournalPhoto/);
  assert.doesNotMatch(source, /\/api\/journal-photos[\s\S]*photoData/);
  assert.doesNotMatch(source, /uploadedPhotoKey[\s\S]*method: "DELETE"/);
  assert.match(photoApi, /saveJournalPhoto[\s\S]*getJournalPhoto[\s\S]*deleteJournalPhoto/);
  assert.match(photoStore, /JOURNAL_PHOTOS[\s\S]*\.head\(key\)[\s\S]*\.put\(key[\s\S]*\.delete\(key\)/);
  assert.doesNotMatch(source, /notebook-photo|journalPhotoUrl|photo-lightbox/);
  assert.doesNotMatch(css, /journal-photo-|notebook-photo|photo-lightbox/);
  assert.match(electronMain, /journal-photo:select[\s\S]*nativeImage\.createFromPath[\s\S]*longestSide > 1600[\s\S]*toJPEG\(85\)/);
  assert.match(preload, /journalPhotos:[\s\S]*journal-photo:select[\s\S]*journal-photo:remove/);
});

test("adds a persistent continuous photo board without changing room, yard, or weather semantics", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const overlay = await readFile(new URL("../app/game/photo-board/PhotoBoardOverlay.tsx", import.meta.url), "utf8");
  const scrollbar = await readFile(new URL("../app/game/photo-board/PhotoBoardScrollbar.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../app/game/photo-board/types.ts", import.meta.url), "utf8");
  const wall = await readFile(new URL("../app/game/photo-board/PhotoBoardWall.tsx", import.meta.url), "utf8");
  const electronMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  assert.match(source, /game\.scene === "room" && <PhotoBoardWall/);
  assert.match(wall, /className="scene-photo-board-art"[\s\S]*photo-board-scene-v2\.png[\s\S]*className="photo-board-hotspot"/);
  assert.match(wall, /getSceneThumbnailShape[\s\S]*ratio < \.8[\s\S]*ratio > 1\.25/);
  assert.match(wall, /canvasRef[\s\S]*imageSmoothingEnabled = false[\s\S]*scene-photo-thumb/);
  assert.match(wall, /scene-photo-row-\$\{position\.row\}[\s\S]*scene-photo-board-inner/);
  assert.match(css, /\.scene-photo-board-inner \{[^}]*inset: 10% 8% 11%[^}]*overflow: hidden/);
  assert.match(css, /\.scene-photo-slot\.scene-photo-row-0 \{[^}]*top: 26%[^}]*height: 30%[\s\S]*\.scene-photo-slot\.scene-photo-row-1 \{[^}]*top: 62%[^}]*height: 32%/);
  assert.match(css, /\.scene-photo-thumb\.portrait[^}]*aspect-ratio: 3 \/ 4[\s\S]*\.scene-photo-thumb\.square[^}]*aspect-ratio: 1[\s\S]*\.scene-photo-thumb\.landscape[^}]*aspect-ratio: 4 \/ 3/);
  assert.match(css, /\.scene-photo-board \{[^}]*position: absolute[^}]*left: 88\.15%[^}]*width: clamp\([^}]*13\.6%/);
  assert.match(css, /\.scene-photo-board-art \{[^}]*filter: var\(--scene-lighting\) drop-shadow/);
  assert.match(css, /\.scene-photo-board\.is-open \.scene-photo-board-art \{[^}]*opacity: 0/);
  assert.doesNotMatch(css, /\.photo-board-wall \{/);
  assert.doesNotMatch(source, /scene\s*=\s*["']photoBoard|scene:\s*["']photoBoard/);
  assert.match(source, /open-meteo[\s\S]*5 \* 60 \* 1000[\s\S]*addEventListener\("focus"[\s\S]*addEventListener\("online"[\s\S]*visibilitychange/);
  assert.match(source, /weather === "clear" && period === "night" \? "🌙"/);
  assert.match(source, /PHOTO_BOARD_STORAGE_KEY[\s\S]*writePersisted\(PHOTO_BOARD_STORAGE_KEY/);
  assert.match(overlay, /overflow-x: auto|photo-board-viewport/);
  assert.match(overlay, /key=\{photo\.id\}/);
  assert.match(scrollbar, /viewport\.scrollLeft[\s\S]*setPointerCapture[\s\S]*releasePointerCapture/);
  assert.match(types, /stablePhotoRotation[\s\S]*Math\.abs\(hash\)/);
  assert.match(types, /caption\?: string[\s\S]*typeof photo\.caption === "string" \? photo\.caption : ""/);
  assert.match(source, /updatePhotoBoardCaption[\s\S]*caption[\s\S]*onUpdateCaption=\{updatePhotoBoardCaption\}/);
  assert.match(overlay, /maxLength=\{80\}[\s\S]*添加说明…/);
  assert.doesNotMatch(css, /scroll-snap/);
  assert.match(css, /photo-board-slot\.deleting[\s\S]*board-photo-drop/);
  assert.match(source, /setDeletingPhotoId\(photo\.id\)[\s\S]*setTimeout\(async \(\) =>[\s\S]*current\.filter/);
  assert.match(electronMain, /protocol\.handle\("berry"[\s\S]*url\.hostname === "photo-board"[\s\S]*photoBoardDirectory[\s\S]*const window = new BrowserWindow/);
  assert.match(electronMain, /photo-board-photos[\s\S]*photo-board:select[\s\S]*photo-board:remove/);
  assert.match(preload, /photoBoard:[\s\S]*photo-board:select[\s\S]*photo-board:remove/);
});

test("preserves the previous desktop save and recovers from a damaged primary file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-storage-"));
  const dataFile = join(directory, "user-data.json");
  const legacyGame = JSON.stringify({ gameSchemaVersion: 5, berries: 321, streak: 9, pet: "doubao", inventory: { driedFish: 7 } });
  const legacyHistory = JSON.stringify([{ id: 1, date: "2026-08-15", content: "旧版记录", category: "学习", rating: 8, reward: 23 }]);
  try {
    const storage = createStorage(dataFile);
    storage.save("berry-workout-game", legacyGame);
    storage.save("berry-workout-history", legacyHistory);
    assert.equal(storage.load("berry-workout-game"), legacyGame);
    assert.equal(storage.load("berry-workout-history"), legacyHistory);
    await writeFile(dataFile, "{damaged", "utf8");
    assert.equal(storage.load("berry-workout-game"), legacyGame);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("moves the complete Windows save into macOS and preserves the replaced Mac save", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-cross-platform-"));
  const windowsDataFile = join(directory, "windows", "user-data.json");
  const macDataFile = join(directory, "mac", "user-data.json");
  const windowsPhotos = join(directory, "windows", "journal-photos");
  const macPhotos = join(directory, "mac", "journal-photos");
  const windowsBoardPhotos = join(directory, "windows", "photo-board-photos");
  const macBoardPhotos = join(directory, "mac", "photo-board-photos");
  const photoFile = "journal-11111111-1111-4111-8111-111111111111.jpg";
  const boardPhotoFile = "board-33333333-3333-4333-8333-333333333333.jpg";
  const photoBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const windowsGame = JSON.stringify({ gameSchemaVersion: 8, berries: 888, pet: "xueqiu", pomodoro: { totalCycles: 12 } });
  const windowsHistory = JSON.stringify([{ id: 7, date: "2026-08-26", content: "Windows 迁移记录", category: "工作", rating: 9, reward: 18, photo: { fileName: photoFile, width: 1200, height: 800 } }]);
  try {
    await mkdir(windowsPhotos, { recursive: true });
    await writeFile(join(windowsPhotos, photoFile), photoBytes);
    await mkdir(windowsBoardPhotos, { recursive: true });
    await writeFile(join(windowsBoardPhotos, boardPhotoFile), photoBytes);
    const windowsStorage = createStorage(windowsDataFile, { journalPhotosDirectory: windowsPhotos, photoBoardDirectory: windowsBoardPhotos });
    windowsStorage.save("berry-workout-game", windowsGame);
    windowsStorage.save("berry-workout-history", windowsHistory);
    windowsStorage.save("berry-workout-device", "windows-device-id");
    const windowsBoard = JSON.stringify([{ id: "33333333-3333-4333-8333-333333333333", fileName: boardPhotoFile, width: 900, height: 1200, slot: 0, rotation: -.8, caption: "从 Windows 带到 Mac 的照片说明", createdAt: "2026-09-20T00:00:00.000Z" }]);
    windowsStorage.save("berry-photo-board", windowsBoard);
    const payload = windowsStorage.exportPayload({ sourcePlatform: "win32", appVersion: "0.9.0" });

    assert.equal(payload.format, "oh-user-data");
    assert.equal(payload.version, 3);
    assert.equal(payload.sourcePlatform, "win32");
    assert.deepEqual(Buffer.from(payload.assets.journalPhotos[photoFile], "base64"), photoBytes);
    assert.deepEqual(Buffer.from(payload.assets.photoBoardPhotos[boardPhotoFile], "base64"), photoBytes);

    await mkdir(macPhotos, { recursive: true });
    await writeFile(join(macPhotos, "journal-22222222-2222-4222-8222-222222222222.jpg"), "old-mac-photo");
    const macStorage = createStorage(macDataFile, { journalPhotosDirectory: macPhotos, photoBoardDirectory: macBoardPhotos });
    macStorage.save("berry-workout-game", JSON.stringify({ berries: 3 }));
    const importedKeys = macStorage.importPayload(JSON.parse(JSON.stringify(payload)));
    assert.deepEqual(importedKeys.sort(), ["berry-photo-board", "berry-workout-device", "berry-workout-game", "berry-workout-history"]);
    assert.equal(macStorage.load("berry-workout-game"), windowsGame);
    assert.equal(macStorage.load("berry-workout-history"), windowsHistory);
    assert.equal(macStorage.load("berry-photo-board"), windowsBoard);
    assert.deepEqual(await readFile(join(macPhotos, photoFile)), photoBytes);
    assert.deepEqual(await readFile(join(macBoardPhotos, boardPhotoFile)), photoBytes);
    assert.ok((await readdir(join(directory, "mac"))).some((file) => file.startsWith("user-data.pre-import-")));
    assert.ok((await readdir(join(directory, "mac"))).some((file) => file.startsWith("journal-photos.pre-import-")));
    assert.throws(() => macStorage.importPayload({ format: "other", version: 1, data: payload.data }), /可识别的 OH 备份/);
    const missingPhotoPayload = JSON.parse(JSON.stringify(payload));
    missingPhotoPayload.assets.journalPhotos = {};
    assert.throws(() => macStorage.importPayload(missingPhotoPayload), /日记照片不完整/);
    const invalidPhotoPayload = JSON.parse(JSON.stringify(payload));
    invalidPhotoPayload.assets.journalPhotos[photoFile] = Buffer.from("not-a-jpeg").toString("base64");
    assert.throws(() => macStorage.importPayload(invalidPhotoPayload), /日记照片格式不正确/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rewards only the first three journal records of each day", () => {
  assert.equal(getJournalReward(0), 0);
  assert.equal(getJournalReward(1), 6);
  assert.equal(getJournalReward(2), 8);
  assert.equal(getJournalReward(3), 10);
  assert.equal(getJournalReward(4), 0);
  assert.equal(getJournalReward(99), 0);
});

test("switches movement control and independent stats with the selected pet", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /adoptedPets: PetId\[\][\s\S]*petStats: Record<PetId, PetStats>[\s\S]*petPositions: Record<PetId, Point>/);
  assert.match(source, /function switchControlledPet\(id: PetId\)[\s\S]*pet: id[\s\S]*\[current\.pet\]: \{ energy: current\.energy[\s\S]*\[id\]: nextStats/);
  assert.match(source, /catPosition: current\.petPositions\[id\] \?\? ROOMMATE_POSITIONS\[id\][\s\S]*\[current\.pet\]: current\.catPosition/);
  assert.match(source, /game\.adoptedPets\.map\(\(id\) => \{[\s\S]*const controlled = id === game\.pet[\s\S]*const position = controlled \? game\.catPosition : game\.petPositions\[id\] \?\? ROOMMATE_POSITIONS\[id\]/);
  const controlledCatStart = source.indexOf("className={`scene-cat walking-cat");
  const controlledCatSource = source.slice(controlledCatStart, source.indexOf("})}", controlledCatStart));
  assert.match(controlledCatSource, /aria-label=\{`\$\{game\.petNames\[id\]\}正在行走`\}[\s\S]*alt=\{`\$\{game\.petNames\[id\]\}正在小屋里`\}[\s\S]*game\.petNames\[id\]/);
  assert.doesNotMatch(controlledCatSource, /cat\.name/);
  assert.match(source, /function cycleControlledPet\(\)[\s\S]*className=\{`scene-cat roommate-cat[\s\S]*title="切换控制猫咪"/);
  const cycleStart = source.indexOf("function cycleControlledPet()");
  const cycleBody = source.slice(cycleStart, source.indexOf("function adoptPet", cycleStart));
  assert.match(cycleBody, /game\.adoptedPets\.indexOf\(game\.pet\)[\s\S]*switchControlledPet\(id\)/);
  const adoptPetSource = source.slice(source.indexOf("function adoptPet"), source.indexOf("function resetFurniture"));
  assert.match(adoptPetSource, /switchControlledPet\(id\)[\s\S]*已切换控制/);
  assert.match(source, /菜品可以喂给 \{inspectedPet\.name\}[\s\S]*`喂给 \$\{inspectedPet\.name\}`/);
  assert.match(css, /\.scene-cat \{[^}]*width: clamp\(92px, 10vw, 168px\)[^}]*transform: translate\(-50%, -79%\)/);
  assert.match(css, /\.game-room \{[^}]*z-index: 0/);
  assert.doesNotMatch(css, /\.roommate-cat \{[^}]*\b(?:width|transform):/);
});

test("stores sleep independently, reserves beds, and animates every adopted pet", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /type PetSleep = \{ endsAt: number \| null; rest: number; furnitureId: string \| null \}/);
  assert.match(source, /petSleep: Record<PetId, PetSleep>/);
  assert.match(source, /mitao: \{ endsAt: null, rest: 0, furnitureId: null \}[\s\S]*doubao: \{ endsAt: null, rest: 0, furnitureId: null \}[\s\S]*xueqiu: \{ endsAt: null, rest: 0, furnitureId: null \}/);
  assert.match(source, /petSleep: \{ \.\.\.current\.petSleep, \[current\.pet\]: \{ endsAt: sleepEndsAt, rest: item\.rest, furnitureId: item\.id \} \}/);
  assert.match(source, /const occupyingPet = game\.adoptedPets\.find[\s\S]*sleep\.furnitureId === item\.id[\s\S]*请换一个猫窝/);
  const switchStart = source.indexOf("function switchControlledPet(id: PetId)");
  const switchEnd = source.indexOf("\n  function cycleControlledPet", switchStart);
  const switchBody = source.slice(switchStart, switchEnd);
  assert.doesNotMatch(switchBody, /if \(resting\)/);
  assert.match(switchBody, /setInspectedPetId\(id\)[\s\S]*setOverlay\(null\)/);
  assert.match(switchBody, /const targetSleep = game\.petSleep\[id\][\s\S]*sleepEndsAt: settled\.sleepEndsAt[\s\S]*sleepRest: settled\.sleepRest/);
  assert.match(switchBody, /catFurniture: getSleepRemainingMs\(currentTargetSleep\.endsAt, now\) > 0 \? currentTargetSleep\.furnitureId : null/);
  assert.match(source, /const roommateSleep = game\.petSleep\[id\][\s\S]*const roommateStatus = getCatStatus[\s\S]*getLoopedStatusFrame\(CAT_STATUS_ANIMATIONS\[roommateStatus\]\.frames[\s\S]*const roommateAsset/);
  assert.match(source, /roommateFrame\.pose === "walk"[\s\S]*cat\.walkFrames[\s\S]*roommateFrame\.pose === "groom"[\s\S]*cat\.groomFrames/);
  assert.doesNotMatch(source, /onClick=\{cycleControlledPet\} disabled=\{resting\}/);
});

test("uses OH desktop branding and a stable cat-paw cursor", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const desktopHtml = await readFile(new URL("../desktop/index.html", import.meta.url), "utf8");
  const electronMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /game-logo|关闭窗口回到小屋/);
  assert.equal(packageJson.build.productName, "OH");
  assert.equal(packageJson.build.nsis.shortcutName, "OH");
  assert.match(desktopHtml, /<title>OH<\/title>/);
  assert.match(electronMain, /app\.setName\("OH"\)[\s\S]*title: "OH"[\s\S]*build\/icon\.png/);
  assert.match(electronMain, /title: "OH · 橙子专注钟"[\s\S]*icon: app\.isPackaged \? path\.join\(process\.resourcesPath, "build\/icon\.png"\)/);
  assert.equal(packageJson.build.win.signAndEditExecutable, true);
  assert.equal(packageJson.build.afterPack, undefined);
  assert.ok(packageJson.build.extraResources.some((item) => item.from === "build/icon.png"));
  assert.match(css, /\.game-stage \{[^}]*cursor: url\("\/game\/cursor-cat-paw-native\.cur"\), default !important;/);
});

test("server-renders the full-screen game without the old movement hint", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /class="game-stage"/);
  assert.match(html, /class="game-room/);
  assert.match(html, /class="cat-base\b/);
  assert.match(html, /data-cat-status="high-low"/);
  assert.doesNotMatch(html, /class="cat-action"/);
  assert.match(html, /aria-label="游戏菜单"/);
  assert.match(html, /<span>活力<\/span>[\s\S]*<span>困倦<\/span>/);
  assert.doesNotMatch(html, /weather-chip|天气同步中|room-help|点击地面移动/);
});
