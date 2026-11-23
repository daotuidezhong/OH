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
  // 场景页面有自己的 preload；B站视图（WebContentsView）独立分区、沙箱、没有 preload。
  const viewPreferences = theater.match(/new WebContentsView\(\{\s*webPreferences: \{([^}]*)\}/)?.[1] ?? "";
  assert.match(viewPreferences, /partition, contextIsolation: true, nodeIntegration: false, sandbox: true/);
  assert.doesNotMatch(viewPreferences, /preload/);
  assert.match(theater, /preload: path\.join\(__dirname, "theater-preload\.cjs"\), contextIsolation: true, sandbox: true/);
  assert.match(theater, /callback\(permission === "fullscreen"\)/);
  assert.match(theater, /async function inject\(context\)[\s\S]*executeJavaScript\(loader, true\)[\s\S]*executeJavaScript\(vt, true\)[\s\S]*executeJavaScript\(bridge, true\)/);
  assert.match(theater, /webContents\.on\("dom-ready", \(\) => inject\(context\)\)/);
  assert.match(theater, /function contextFor\(event\)[\s\S]*event\.sender === context\.window\.webContents/);

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
  assert.ok(packageJson.build.files.includes("electron/theater-bridge.js"));
  assert.ok(packageJson.build.files.includes("electron/vendor/videotogether/LICENSE"));
});

test("theater test mode isolates data before taking the single-instance lock", async () => {
  const electronMain = await read("../electron/main.cjs");
  const theater = await read("../electron/theater.cjs");
  const testMode = electronMain.indexOf('app.setPath("userData", path.join(app.getPath("appData"), "OH-theater-test"))');
  assert.ok(testMode > 0 && testMode < electronMain.indexOf("requestSingleInstanceLock()"));
  assert.match(electronMain, /if \(theaterTestMode\) openTheaterTestPair/);
  assert.match(theater, /\["A", "B"\][\s\S]*persist:oh-theater-test-\$\{label\.toLowerCase\(\)\}[\s\S]*testConfig: \{ code, role: index === 0 \? "master" : "member" \}/);
  assert.match(electronMain, /openTheaterWindow\(\{ icon, parent: window, configFile: path\.join\(app\.getPath\("userData"\), "theater\.json"\) \}\)/);
});

test("theater hall rebuilt from the reference image: dolls, hold-hands, bubbles and enlargeable screen", async () => {
  const scene = await read("../app/theater/TheaterScene.tsx");
  const stage = await read("../app/theater/ReferenceStage.tsx");
  const css = await read("../app/theater/theater.css");
  const vite = await read("../desktop/vite.config.ts");
  assert.match(vite, /theater: path\.resolve\(import\.meta\.dirname, "theater\.html"\)/);
  // 座位固定：创建的人 = 右边白色玩偶，加入的人 = 左边粉色玩偶；谁不在谁的座位就空着
  assert.match(scene, /const partnerOnline = Boolean\(config && status\.inRoom && status\.members >= 2\)/);
  assert.match(scene, /const mySide = seatOf\(config\?\.role\)/);
  assert.match(scene, /\{ \[mySide\]: Boolean\(config\), \[partnerSide\]: partnerOnline \}/);
  assert.match(scene, /<ReferenceStage\s+left=\{seated\.left\}\s+right=\{seated\.right\}/);
  assert.match(stage, /\{left && <Sprite sprite=\{SPRITES\.dollLeft\}/);
  assert.match(stage, /<Sprite sprite=\{SPRITES\.seatRightEmpty\} className=\{`seat-empty \$\{right \? "is-taken" : ""\}`\} \/>/);
  assert.match(css, /\.seat-empty\.is-taken \{ opacity: 0; \}/);
  assert.match(stage, /\{hold && <Sprite sprite=\{SPRITES\.armLeft\}[\s\S]*\{hold && <Sprite sprite=\{SPRITES\.armRight\}[\s\S]*\{hold && <Sprite sprite=\{SPRITES\.heart\}/);
  // 两边都能控制：对方的操作由主进程转给场景，场景提示“TA 暂停了”等
  assert.match(await read("../electron/theater.cjs"), /controls: \(Array\.isArray\(next\.controls\) \? next\.controls : \[\]\)\s+\.filter\(\(item\) => item && \["pause", "play", "seek", "url", "rate"\]\.includes\(item\.a\)\)/);
  assert.match(scene, /const control = next\.controls\?\.at\(-1\);\s+if \(control\) setNotice\(controlNotice\(control\)\);/);
  // 离开放映厅：场景右上角按钮和配对卡片都能关掉放映厅窗口
  const preload = await read("../electron/theater-preload.cjs");
  const theaterMain = await read("../electron/theater.cjs");
  assert.match(scene, /className="leave-button" onClick=\{\(\) => bridge\?\.close\(\)\}>离开放映厅</);
  assert.match(scene, /onLeave=\{\(\) => bridge\?\.close\(\)\}/);
  assert.match(preload, /close: \(\) => ipcRenderer\.send\("theater:close"\)/);
  assert.match(theaterMain, /ipcMain\.on\("theater:close", \(event\) => \{\s+const context = contextFor\(event\);\s+if \(context && !context\.window\.isDestroyed\(\)\) context\.window\.close\(\);/);
  // 舞台铺满窗口时被裁掉的部分，贴边的界面元素往里收，不会被切掉
  assert.match(stage, /"--cut-x": `\$\{Math\.max\(0, -box\.left\)\}px`/);
  assert.match(css, /\.ticket-wrap \{[^}]*margin: var\(--cut-y, 0px\) 0 0 var\(--cut-x, 0px\)/);
  assert.match(css, /\.screen-controls \{[^}]*margin: var\(--cut-y, 0px\) 0 0 calc\(-1 \* var\(--cut-x, 0px\)\)/);
  assert.match(css, /\.chat-bar \{[^}]*margin-top: calc\(-1 \* var\(--cut-y, 0px\)\)/);
  // 银幕在房间图下面，房间图不挡点击
  assert.match(stage, /className="screen-surface"[\s\S]*className="stage-room"/);
  assert.match(css, /\.stage-room \{[^}]*pointer-events: none/);
  // 消息冒在发消息那个人的玩偶头上；牵手走专用信号
  assert.match(scene, /if \(message\.kind === "hold"\) setHoldUntil[\s\S]*else addBubble\(partnerSideRef\.current, message\.text\)/);
  assert.match(scene, /if \(await bridge\.send\(text\)\) addBubble\(mySide, text\)/);
  assert.match(scene, /await bridge\.send\(HOLD_TOKEN\)/);
  assert.match(scene, /\{holding \? "牵手中" : "牵手"\}/);
  assert.doesNotMatch(scene, /牵脚|FEET/);
  // 牵手：手臂从身侧伸出，爱心随后出现
  assert.match(css, /@keyframes reach-left \{ from \{ clip-path: inset\(0 100% 0 0\); \}/);
  assert.match(css, /\.heart \{[^}]*heart-pop/);
  // 房间灯光跟随银幕画面
  assert.match(scene, /const light = screenLight\(config \? status\.ambient : null\)/);
  // 放大银幕：舞台不用 transform，银幕以 fixed 铺满
  assert.match(css, /\.is-enlarged \.screen-surface \{ position: fixed; inset: 48px 0 0 0 !important;/);
  assert.doesNotMatch(css.match(/\.reference-stage \{[^}]*\}/)[0], /transform/);
});
