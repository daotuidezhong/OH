# 草莓打卡屋项目架构

> 文档基线：2026-08-10
> 用途：记录当前真实架构，并作为后续问题批注与修改入口。  
> 原则：先在“待修改清单”写清问题，再按模块编号定位代码；代码修改完成后同步更新本文档。

## 1. 架构总览

项目共用一套 React 游戏界面，同时输出网页版和 Windows 桌面版。

```mermaid
flowchart LR
    UI["GAME-UI：游戏界面"] --> RULES["GAME-RULES：游戏规则"]
    UI --> WEBAPI["WEB-API：打卡接口"]
    WEBAPI --> DB["DATA-DB：Sites D1"]
    DESKTOP["DESKTOP：Electron 外壳"] --> UI
    UI --> LOCAL["DATA-LOCAL：浏览器本地存储"]
    WEB["WEB：vinext / Cloudflare Worker"] --> UI
```

## 2. 目录结构

```text
project_009_草莓打卡屋/
├─ app/
│  ├─ api/checkins/route.ts   # 网页版打卡 API
│  ├─ game/                   # 无界面的游戏规则
│  │  ├─ calories.ts          # 热量估算
│  │  ├─ cat-actions.ts       # 猫咪状态与动画序列
│  │  ├─ cocktails.ts         # 调酒配料、价格、配方与评分规则
│  │  ├─ furniture.ts         # 家具落点与移动边界
│  │  ├─ farm.ts              # 作物、种子与真实时间生长规则
│  │  ├─ scene.ts             # 室内外边界、障碍与绕行路径
│  │  ├─ pet-stats.ts         # 活力、困倦、睡眠规则
│  │  ├─ time-period.ts       # 早晨 / 白天 / 傍晚 / 夜晚
│  │  └─ weather.ts           # 天气映射与房间背景选择
│  ├─ globals.css             # 全部网页与游戏样式
│  ├─ layout.tsx              # 页面元信息与根布局
│  └─ page.tsx                # 游戏界面、交互和状态协调
├─ db/                        # D1 访问与表结构
├─ desktop/                   # 桌面版 React 构建入口
├─ electron/                  # Windows 窗口、更新和安全桥接
├─ drizzle/                   # 数据库迁移记录
├─ public/game/               # 房间、猫咪、家具等游戏素材
├─ tests/                     # 构建后回归检查
├─ worker/                    # Cloudflare Worker 入口
├─ docs/                      # 架构与设计文档
├─ .openai/hosting.json       # Sites 资源声明
├─ package.json               # 命令、依赖和桌面打包配置
└─ vite.config.ts             # 网页版构建配置
```

构建产物位于 `dist/`、`desktop-dist/`、`outputs/`，不属于源代码。

## 3. 模块索引

后续批注问题时优先引用下表中的稳定编号。

| 编号 | 模块 | 主要职责 | 关键文件 |
|---|---|---|---|
| `GAME-UI` | 游戏界面 | 页面状态、弹层、打卡、移动、购买、调酒、喂食、睡眠、桌面更新提示 | `app/page.tsx`, `app/globals.css` |
| `GAME-RULES` | 游戏规则 | 纯计算规则和动画资源映射，不直接操作页面 | `app/game/` |
| `WEB-API` | 网页接口 | 校验打卡请求，读写网页版历史记录 | `app/api/checkins/route.ts` |
| `DATA-DB` | 云端数据 | D1 表结构、查询、保存和迁移 | `db/`, `drizzle/` |
| `DATA-LOCAL` | 本地数据 | 保存设备编号、游戏状态和桌面版历史记录 | `app/page.tsx` 中的 `localStorage` 逻辑 |
| `WEB` | 网页运行层 | vinext 构建、Worker 运行、Sites 资源绑定 | `vite.config.ts`, `worker/index.ts`, `.openai/hosting.json` |
| `DESKTOP` | Windows 运行层 | 复用游戏界面、创建窗口、本地协议、应用更新 | `desktop/`, `electron/` |
| `THEATER` | 放映室（验证版） | 独立窗口打开 B站，注入固定版本 VideoTogether 实现两人同步观看 | `electron/theater.cjs`, `electron/theater-rules.cjs`, `electron/vendor/videotogether/` |
| `ASSETS` | 游戏素材 | 房间、猫咪动画、家具、食品、鼠标指针 | `public/game/` |
| `TEST` | 回归检查 | 构建产物、规则、资源与关键页面结构检查 | `tests/rendered-html.test.mjs` |
| `DOCS` | 项目文档 | 架构基线、问题清单、设计验收记录 | `docs/` |

## 4. 关键数据流

### 4.1 打卡

```mermaid
sequenceDiagram
    participant U as 用户
    participant P as GAME-UI
    participant A as WEB-API
    participant D as D1 / 本机存储
    U->>P: 填写运动和时长
    P->>P: GAME-RULES 估算热量
    alt 网页版
        P->>A: POST /api/checkins
        A->>D: 保存到 D1
        D-->>P: 返回打卡记录
    else Windows 版
        P->>D: 保存到 localStorage
    end
    P-->>U: 更新连续天数、莓果和历史
```

### 4.2 宠物状态

`GAME-UI` 定时读取真实经过时间，调用 `app/game/pet-stats.ts` 计算活力与困倦，再由 `app/game/cat-actions.ts` 选择动画状态。睡眠状态优先于移动和普通待机动画。

### 4.3 商店与调酒

`app/game/cocktails.ts` 集中定义 16 种配料、草莓价格、包装容量、10 张配方、容差和评分规则。`GAME-UI` 复用原有商店、草莓和本地存档：购买时一次性扣除草莓并增加库存；确认出杯后才一次性扣除实际配料，冰块不限量；关闭吧台或制作失败不会发生重复扣除。已解锁配方和最佳品质随 `berry-workout-game` 一起保存。

### 4.4 天气与房间

`GAME-UI` 获取佛山天气；`app/game/weather.ts` 把天气数据映射为晴、多云、雨或雷暴，再结合 `app/game/time-period.ts` 选择房间素材。天气接口失败时保留当前场景并显示同步失败信息。

### 4.5 番茄钟

`app/game/pomodoro.ts` 集中定义 25 分钟专注、5 分钟休息、每次 5 颗草莓奖励，以及开始、暂停、恢复和跨后台结算规则。计时使用绝对结束时间，不依赖前台逐秒累减；状态随 `berry-workout-game` 保存。网页版通过系统通知提示，Windows 版由 Electron 主进程调度本地通知，窗口最小化后仍会继续计时。

### 4.6 放映室（验证版）

入口是立在窗户与门前方地板上的立体像素小电视（电视柜 + 显像管电视）（`public/game/furniture-tv.png` / `furniture-tv-on.png`），悬停时屏幕亮起并提示“进入放映室”，同时登记为房间固定障碍。仅 Windows 版可进入，网页版点击会提示“放映室目前只在 Windows 版可用”。点击后通过 `theater:open` 让主进程打开独立窗口：使用独立会话分区 `persist:oh-theater`、沙箱、无 OH preload，只允许 `bilibili.com` / `b23.tv` 的 https 页面在窗口内跳转，其余链接交给系统浏览器。每次 B站页面 `dom-ready` 时注入 `electron/vendor/videotogether/` 中固定版本的 VideoTogether（加载器已去掉从 CDN 拉取最新代码的逻辑）。两人分别登录自己的 B站账号，在悬浮面板中用同一房间名和密码建房 / 加入即可同步播放。当前同步走 VideoTogether 公共服务器，正式版计划换成 OH 自己的 Cloudflare 房间。

单机测试：未打包运行 `npx electron . --theater-test`，会使用独立数据目录 `%APPDATA%\OH-theater-test`（不读写已安装 OH 的存档），点“放映室”时左右并排打开 A、B 两个窗口，各自独立登录，模拟两个人。

## 5. 网页版与桌面版差异

| 能力 | 网页版 | Windows 版 |
|---|---|---|
| 游戏界面 | 共用 `app/page.tsx` | 共用 `app/page.tsx` |
| 游戏状态 | 浏览器 `localStorage` | 本机 `localStorage` |
| 打卡历史 | Sites D1 | 本机 `localStorage` |
| 天气 | 浏览器直接请求天气服务 | 同网页版 |
| 更新 | 随网站发布更新 | `electron-updater` 检查 GitHub Releases |
| 运行入口 | `worker/index.ts` | `electron/main.cjs` |
| 放映室 | 不提供 | B站独立窗口 + VideoTogether 同步（验证版） |

## 6. 修改边界

- 改数值规则、状态映射或动画序列：优先修改 `app/game/`，并补充或调整 `tests/rendered-html.test.mjs`。
- 改页面布局、弹层或操作流程：修改 `app/page.tsx` 和 `app/globals.css`。
- 改网页版记录格式：同时检查 `app/api/checkins/route.ts`、`db/` 与迁移文件。
- 改桌面窗口、安装包或自动更新：修改 `electron/`、`desktop/` 与 `package.json`。
- 改素材：替换 `public/game/` 文件，并确认代码中的文件名和动画帧顺序。
- 不直接编辑 `dist/`、`desktop-dist/`、`outputs/`；这些目录由构建命令生成。

## 7. 当前架构注意点

| 编号 | 现状 | 修改时注意 |
|---|---|---|
| `NOTE-001` | `app/page.tsx` 是主要交互协调器，内容较多 | 只有出现明确、可独立维护的界面边界时再拆组件，避免为拆分而拆分 |
| `NOTE-002` | 网页版和桌面版在同一页面中按运行环境选择存储方式 | 修改打卡或心情保存时必须同时验证两个分支 |
| `NOTE-003` | `globals.css` 为单一全局样式文件 | 修改选择器前先搜索对应 JSX 类名，避免影响多个弹层或动画 |
| `NOTE-004` | 数据库代码同时保留迁移文件与运行时建表保护 | 改表结构时两处必须保持一致 |

## 8. 待修改清单

直接在表中新增一行即可。问题描述尽量写“现在怎样、希望怎样”，无需先给技术方案。

| 问题编号 | 模块编号 | 状态 | 现在的问题 | 希望的结果 | 补充说明 |
|---|---|---|---|---|---|
| `ISSUE-001` | `GAME-UI` | 已完成 | 手账在翻回内容较多的前一页时尺寸会变大 | 每一页保持相同尺寸 | 固定桌面端纸张与心情输入区高度，移动端仍按内容展开 |
| `ISSUE-002` | `DESKTOP` | 已完成 | 安装包使用默认程序图标 | 桌面快捷方式显示无面部的可爱像素草莓 | 新增透明 PNG 与多尺寸 ICO，并配置为 Windows 图标 |
| `ISSUE-003` | `DESKTOP`, `DATA-DB` | 已取消 | 下载者记录仅在各自电脑本地保存 | 去除下载者记录备份与屋主汇总页 | Windows 版不再向 Sites D1 上传记录，已有云端数据不自动删除 |
| `ISSUE-004` | `GAME-UI` | 已完成 | 更新说明隐藏在手账页面 | 更新完成后的首次启动直接弹窗显示累计版本号与分条内容 | 使用本地已读版本号确保每个版本只弹出一次；最新版内置历次更新内容，跨版本升级不会遗漏 |

状态统一使用：`待填写`、`待确认`、`处理中`、`已完成`、`暂不处理`。

### 详细批注模板

需要截图、复现步骤或多条要求时，在表格下追加：

```md
### ISSUE-002：问题标题

- 模块编号：GAME-UI
- 状态：待确认
- 复现步骤：
  1. 
  2. 
- 现在的问题：
- 希望的结果：
- 不要改动：
- 参考图片或文件：
```

## 9. 修改完成记录

| 日期 | 问题编号 | 修改摘要 | 涉及模块 | 验证结果 |
|---|---|---|---|---|
| 2026-08-08 | `ARCH-BASELINE` | 将游戏规则集中到 `app/game/`，文档集中到 `docs/`，建立架构基线与批注入口 | `GAME-RULES`, `DOCS` | 网页构建通过，15 项回归检查通过 |
| 2026-08-09 | `ISSUE-001`, `ISSUE-002` | 固定手账翻页尺寸，并为 Windows 安装包加入无面部像素草莓图标 | `GAME-UI`, `DESKTOP`, `ASSETS` | 网页构建与 15 项回归检查通过；Windows 安装包构建通过并确认图标已嵌入 |
| 2026-08-10 | `YARD-FARM` | 新增双向院门、四天气四时段院子、10 件家具和 12 格真实时间种植循环；旧存档自动迁移到 v3 | `GAME-UI`, `GAME-RULES`, `DATA-LOCAL`, `ASSETS` | 网页、规则、资源与桌面渲染构建验收 |
| 2026-08-18 | `COCKTAIL-BAR` | 新增商店调酒配料、吧台调酒流程、10 张配方图鉴和库存存档迁移 | `GAME-UI`, `GAME-RULES`, `DATA-LOCAL`, `ASSETS`, `TEST` | 网页构建与 40 项回归检查通过；桌面和移动端交互验收通过 |
| 2026-08-25 | `POMODORO` | 新增 25+5 番茄钟、每循环 5 草莓奖励、累计记忆、完成动画和网页／Windows 后台提醒 | `GAME-UI`, `GAME-RULES`, `DATA-LOCAL`, `DESKTOP`, `TEST` | 网页构建与自动回归检查通过；桌面通知桥接已覆盖 |
| 2026-11-22 | `THEATER` | 新增 Windows 版 B站放映室验证版：独立沙箱窗口 + 固定版本 VideoTogether 注入 | `GAME-UI`, `DESKTOP`, `THEATER`, `TEST` | 43 项回归检查通过；Linux 下 Electron 冒烟测试确认注入、防重复注入与外链拦截；真实 B站与 Windows 打包待验证 |

### 院子与种植状态

室内和院子共用页面中的天气、时间与宠物状态。场景、种子库存和 12 格农田保存在 `berry-workout-game`；作物阶段由 `wateredAt` 与当前时间推导，关闭游戏期间也会继续生长。雨或雷雨只为尚未浇水的作物写入一次浇水时间。
