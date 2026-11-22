# v0.9.15 更新检查

本次新增 B站放映室，入口是房间里的小电视。

## 内容

- **入口**：`app/page.tsx` 在房间里窗户与门之间加入 `theater-tv`（电视柜 + 显像管电视），使用 `room-hint` 悬停提示“进入放映室”并参与 `data-scene-depth` 前后排序；悬停时切换到开机画面。桌面版调用 `gameUpdater.theater.open()`，网页版提示仅 Windows 可用。电视柜占地登记为 `ROOM_FIXED_OBSTACLES`，猫和家具不会穿过或叠上去。
- **素材**：`public/game/furniture-tv.png` / `furniture-tv-on.png` 由 `build/art/theater-tv/` 中的 SVG 用 Chromium 4 倍超采样渲染，再缩成与房间背景一致的柔和像素颗粒；配色取自唱片机柜，柜脚与唱片机柜同一条地面线，带地面接触阴影与靠墙阴影。
- **放映室窗口**：`electron/theater.cjs` 以独立会话分区 `persist:oh-theater`、沙箱、无 preload 打开 B站；只允许 `bilibili.com` / `b23.tv` 的 https 页面在窗口内跳转，其余交给系统浏览器；权限只放行全屏；UA 去掉 Electron 与应用标记。主窗口关闭时一并关闭。
- **同步**：每次 B站页面 `dom-ready` 注入 `electron/vendor/videotogether/` 中固定版本的 VideoTogether（MIT，上游提交 `3c61f12`）；加载器已去掉从 CDN 拉取最新 `vt.js` 的逻辑，运行的就是仓库里的代码。更新方法见该目录 README。
- **单机测试**：`npx electron . --theater-test` 在取得单实例锁之前切换到独立数据目录 `OH-theater-test`，不读写、也不占用已安装 OH 的存档；点小电视会并排打开 A、B 两个独立登录的放映室窗口。

## 验证

- 新增 `tests/theater.test.mjs` 3 项：入口与悬停、窗口隔离与 VideoTogether 固定版本、测试模式数据隔离。
- Linux 下 Electron 冒烟测试（模拟 B站页面）：点击小电视打开放映室，VideoTogether 注入并初始化成功，刷新不重复注入，无 CDN 请求，页面无 Node / 游戏桥接，外链不在窗口内打开；测试模式 A / B 两个窗口独立分区、关闭主窗口时一并关闭。
- Windows 实测（测试模式，此前版本）：A、B 两个窗口登录 B站后建房 / 加入，显示“同步成功”。
- 浏览器（`vinext dev`）截图检查：电脑、平板、手机宽度下小电视均位于窗户与门之间，不遮挡门框；悬停提示与开机画面正常。

发布说明见 [v0.9.15](releases/v0.9.15.md)。
