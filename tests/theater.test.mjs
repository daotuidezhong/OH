import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { ROOM_FIXED_OBSTACLES } from "../app/game/scene.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("enters the theater from the room TV instead of a dock button", async () => {
  const source = await read("../app/page.tsx");
  const css = await read("../app/globals.css");
  assert.doesNotMatch(source, /theater-dock|<b>放映室<\/b>/);
  assert.match(source, /data-scene-depth="tv" className="theater-tv room-hint" data-hint="进入放映室" onPointerDown=\{\(event\) => \{ event\.stopPropagation\(\); openTheater\(\); \}\}/);
  assert.match(source, /furniture-tv\.png[\s\S]*theater-tv-on" src="\/game\/furniture-tv-on\.png"/);
  assert.match(source, /function openTheater\(\) \{\s*if \(window\.gameUpdater\?\.theater\) window\.gameUpdater\.theater\.open\(\);\s*else setToast\("放映室目前只在 Windows 版可用"\)/);
  assert.match(css, /\.theater-tv:hover \.theater-tv-on \{ opacity: 1; \}/);
  await access(new URL("../public/game/furniture-tv.png", import.meta.url));
  await access(new URL("../public/game/furniture-tv-on.png", import.meta.url));
  assert.ok(ROOM_FIXED_OBSTACLES.some((rect) => rect.left <= 63 && rect.right >= 63 && rect.bottom >= 48));
});

test("opens Bilibili in an isolated, sandboxed theater window with pinned VideoTogether", async () => {
  const electronMain = await read("../electron/main.cjs");
  const preload = await read("../electron/preload.cjs");
  const theater = await read("../electron/theater.cjs");
  const loader = await read("../electron/vendor/videotogether/loader.website.js");
  const vt = await read("../electron/vendor/videotogether/vt.zh-cn.website.js");
  const license = await read("../electron/vendor/videotogether/LICENSE");
  const packageJson = JSON.parse(await read("../package.json"));
  const { isBilibiliUrl, toChromeUserAgent } = createRequire(import.meta.url)("../electron/theater-rules.cjs");

  assert.match(preload, /theater: \{\s*open: \(\) => ipcRenderer\.send\("theater:open"\)/);
  assert.match(electronMain, /ipcMain\.on\("theater:open"[\s\S]*event\.sender !== window\.webContents[\s\S]*openTheaterWindow/);
  assert.match(theater, /partition = THEATER_PARTITION[\s\S]*partition,\s*contextIsolation: true,\s*nodeIntegration: false,\s*sandbox: true/);
  assert.doesNotMatch(theater, /preload:/);
  assert.match(theater, /callback\(permission === "fullscreen"\)/);
  assert.match(theater, /dom-ready[\s\S]*injectVideoTogether/);

  assert.equal(isBilibiliUrl("https://www.bilibili.com/video/BV1xx411c7mD"), true);
  assert.equal(isBilibiliUrl("https://b23.tv/abc"), true);
  assert.equal(isBilibiliUrl("https://passport.bilibili.com/login"), true);
  assert.equal(isBilibiliUrl("http://www.bilibili.com/"), false);
  assert.equal(isBilibiliUrl("https://evilbilibili.com/"), false);
  assert.equal(isBilibiliUrl("https://bilibili.com.evil.example/"), false);
  assert.equal(
    toChromeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) OH/0.9.15 Chrome/138.0.0.0 Electron/37.2.6 Safari/537.36"),
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  );

  assert.match(loader, /OH patch: vt\.js 由 OH 主进程从本地固定版本注入/);
  assert.doesNotMatch(loader, /getCdnPath|release\/vt\./);
  assert.match(vt, /const vtRuntime = `website`/);
  assert.match(license, /MIT License[\s\S]*VideoTogether/);
  assert.ok(packageJson.build.files.includes("electron/vendor/videotogether/*.js"));
  assert.ok(packageJson.build.files.includes("electron/vendor/videotogether/LICENSE"));
});

test("theater test mode isolates data before taking the single-instance lock", async () => {
  const electronMain = await read("../electron/main.cjs");
  const theater = await read("../electron/theater.cjs");
  const testMode = electronMain.indexOf('app.setPath("userData", path.join(app.getPath("appData"), "OH-theater-test"))');
  assert.ok(testMode > 0 && testMode < electronMain.indexOf("requestSingleInstanceLock()"));
  assert.match(electronMain, /if \(theaterTestMode\) openTheaterTestPair/);
  assert.match(theater, /\["A", "B"\][\s\S]*persist:oh-theater-test-\$\{label\.toLowerCase\(\)\}/);
});
