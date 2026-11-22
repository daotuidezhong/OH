import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  assert.match(source, /BERRY FOCUS CLOCK/);
  assert.match(source, /berries: current\.berries \+ result\.reward/);
  assert.match(source, /Notification\.requestPermission/);
  assert.match(source, /className="pomodoro-alert-layer"[\s\S]*role="alertdialog"[\s\S]*知道了/);
  assert.match(source, /new AudioContext\(\)/);
  assert.match(source, /playPomodoroChime\("focus"\)/);
  assert.match(source, /playPomodoroChime\("break"\)/);
  assert.match(source, /id === "pomodoro"\) preparePomodoroAudio\(\)/);
  assert.doesNotMatch(source, /试听提示音/);
  assert.match(source, /Windows 弹窗提醒已开启/);
  assert.match(source, /className="pomodoro-progress-shell"[\s\S]*className="pomodoro-tomato-mark"/);
  assert.doesNotMatch(source, /className="pomodoro-crown"/);
  assert.doesNotMatch(source, /crop-tomato-mature\.png[\s\S]*专注时间/);
  assert.match(css, /\.pomodoro-dial \{[^}]*background: radial-gradient[\s\S]*\.pomodoro-progress-shell \{[^}]*conic-gradient[\s\S]*\.pomodoro-tomato-mark \{[^}]*background: radial-gradient/);
  assert.match(css, /\.pomodoro-dial-face > strong \{[^}]*color: #fffdf7/);
  assert.match(css, /@keyframes pomodoro-berry-burst/);
  assert.match(desktopMain, /setAppUserModelId\("com\.berryworkout\.island"\)/);
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
  assert.match(source, /const stepDirection = getWalkDirection\(from, point\)[\s\S]*setDirection\(stepDirection\)[\s\S]*from = point/);
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
  assert.equal(Object.keys(LOCAL_PLAYBACK_PATHS).length, 22);
  assert.equal(resolvePlaybackUrl(1352585027, null), "/music/tracks/1352585027.mp3");
  assert.equal(resolvePlaybackUrl(2008736389, "http://example.com/song.mp3"), "https://example.com/song.mp3");
  await Promise.all(Object.values(LOCAL_PLAYBACK_PATHS).map((playbackPath) =>
    access(new URL(`../public${playbackPath}`, import.meta.url))));
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
  assert.equal(playlist.trackCount, 115);
  assert.equal(playlist.tracks.length, 115);
  assert.equal(playlist.tracks.filter((track) => track.playbackUrl).length, 22);
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
  assert.match(feedBody, /inspectedPetId === current\.pet[\s\S]*petStats:[\s\S]*\[inspectedPetId\]/);
  assert.doesNotMatch(feedBody, /setInterruptConfirm|requestSleepInterrupt/);
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
  assert.match(source, /setWalkDuration\(WALK_CYCLE_MS\)/);
  assert.match(source, /Math\.hypot\(point\.x - from\.x, point\.y - from\.y\) \* 14/);
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
  const electronMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  assert.match(source, /historyDates\.slice\(historyPage \* 2, historyPage \* 2 \+ 2\)/);
  assert.match(css, /\.notebook-page \{[^}]*min-height: 430px/);
  assert.match(source, /TODAY&apos;S NOTE[\s\S]*今天发生了什么[\s\S]*JOURNAL HISTORY[\s\S]*往日日记/);
  assert.match(source, /maxLength=\{300\}/);
  assert.match(source, /const todayRecordCount = history\.filter\(\(record\) => record\.date === today\)\.length/);
  assert.match(source, /let reward = getJournalReward\(todayRecordCount \+ 1\)/);
  assert.match(source, /berries: current\.berries \+ reward, streak: firstRecordToday \? next : current\.streak/);
  assert.match(api, /countCheckinsForDate[\s\S]*getJournalReward\(\(await countCheckinsForDate\(deviceId, date\)\) \+ 1\)/);
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
  assert.match(electronMain, /app\.setName\("OH"\)[\s\S]*user-data\.json[\s\S]*createStorage\(dataFile\)[\s\S]*storage:load[\s\S]*storage:save/);
  assert.match(packageJson, /"version": "0\.7\.0"[\s\S]*"appId": "com\.berryworkout\.island"[\s\S]*"productName": "OH"/);
  assert.match(preload, /storage:[\s\S]*sendSync\("storage:load"[\s\S]*send\("storage:save"/);
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

test("rewards only the first three journal records of each day", () => {
  assert.equal(getJournalReward(0), 0);
  assert.equal(getJournalReward(1), 10);
  assert.equal(getJournalReward(2), 15);
  assert.equal(getJournalReward(3), 18);
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
  assert.match(switchBody, /const targetSleep = game\.petSleep\[id\][\s\S]*sleepEndsAt: currentTargetSleep\.endsAt[\s\S]*sleepRest: currentTargetSleep\.rest/);
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
  assert.equal(packageJson.build.win.signAndEditExecutable, false);
  assert.equal(packageJson.build.afterPack, "build/after-pack.cjs");
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
  assert.match(html, /的困倦值/);
  assert.doesNotMatch(html, /weather-chip|天气同步中|room-help|点击地面移动/);
});

test("opens the Bilibili theater prototype in an isolated window with pinned VideoTogether", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const electronMain = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const theater = await readFile(new URL("../electron/theater.cjs", import.meta.url), "utf8");
  const loader = await readFile(new URL("../electron/vendor/videotogether/loader.website.js", import.meta.url), "utf8");
  const vt = await readFile(new URL("../electron/vendor/videotogether/vt.zh-cn.website.js", import.meta.url), "utf8");
  const license = await readFile(new URL("../electron/vendor/videotogether/LICENSE", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const { isBilibiliUrl, toChromeUserAgent } = createRequire(import.meta.url)("../electron/theater-rules.cjs");

  assert.match(source, /desktopTheaterAvailable && <button className="theater-dock"[\s\S]*theater\?\.open\(\)[\s\S]*放映室/);
  assert.match(preload, /theater: \{\s*open: \(\) => ipcRenderer\.send\("theater:open"\)/);
  assert.match(electronMain, /ipcMain\.on\("theater:open"[\s\S]*event\.sender !== window\.webContents[\s\S]*openTheaterWindow/);

  // 第三方网页窗口：独立分区、沙箱、无 OH preload。
  assert.match(theater, /partition: THEATER_PARTITION,\s*contextIsolation: true,\s*nodeIntegration: false,\s*sandbox: true/);
  assert.doesNotMatch(theater, /preload:/);
  assert.match(theater, /callback\(permission === "fullscreen"\)/);
  assert.match(theater, /dom-ready[\s\S]*injectVideoTogether/);

  // 测试模式：单独数据目录，A/B 两个独立登录分区。
  assert.match(electronMain, /process\.argv\.includes\("--theater-test"\)[\s\S]*app\.setPath\("userData", path\.join\(app\.getPath\("appData"\), "OH-theater-test"\)\)[\s\S]*app\.whenReady/);
  assert.match(electronMain, /theaterTestMode \? |if \(theaterTestMode\) openTheaterTestPair/);
  assert.match(theater, /\["A", "B"\][\s\S]*persist:oh-theater-test-\$\{label\.toLowerCase\(\)\}/);
  assert.match(theater, /const theaterWindows = new Map\(\)/);

  // 只在 B站注入，且只放行 https。
  assert.equal(isBilibiliUrl("https://www.bilibili.com/video/BV1xx411c7mD"), true);
  assert.equal(isBilibiliUrl("https://b23.tv/abc"), true);
  assert.equal(isBilibiliUrl("https://passport.bilibili.com/login"), true);
  assert.equal(isBilibiliUrl("http://www.bilibili.com/"), false);
  assert.equal(isBilibiliUrl("https://evilbilibili.com/"), false);
  assert.equal(isBilibiliUrl("https://bilibili.com.evil.example/"), false);
  assert.equal(
    toChromeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) OH/0.7.0 Chrome/138.0.0.0 Electron/37.2.6 Safari/537.36"),
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  );

  // VideoTogether 固定版本：加载器不再从 CDN 拉取 vt.js。
  assert.match(loader, /OH patch: vt\.js 由 OH 主进程从本地固定版本注入/);
  assert.doesNotMatch(loader, /getCdnPath|release\/vt\./);
  assert.match(vt, /const vtRuntime = `website`/);
  assert.match(license, /MIT License[\s\S]*VideoTogether/);
  assert.ok(packageJson.build.files.includes("electron/vendor/videotogether/*.js"));
  assert.ok(packageJson.build.files.includes("electron/vendor/videotogether/LICENSE"));
});
