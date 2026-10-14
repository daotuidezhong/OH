# 整体代码与交互检查（2026-10-08）

> 后续状态（2026-10-14）：本文保留原检查时的缺陷与证据，以下十项问题已修复并增加回归测试。当前验证结果见 [下一更新检查](next-update-review-20261014.md)。

项目：project_009_草莓打卡屋；版本：0.9.10。此次为检查，未修改业务源码或正式桌面存档。

结论：基础流程能够运行，但确认了 10 项需要修改的问题。优先修复多实例存档覆盖、备份导入缓存混用和跨天日期。P1 表示优先修复的数据风险；P2 表示有明确触发条件的功能缺陷。

## 确认的问题

### 1. [P1] 桌面重复启动会覆盖进度

- 位置：[electron/main.cjs:21](E:/workspace/project_009_草莓打卡屋/electron/main.cjs:21)、[electron/storage.cjs:128](E:/workspace/project_009_草莓打卡屋/electron/storage.cjs:128)。
- 触发：同时打开两份 OH。每个窗口保留自己的游戏状态，并向相同用户数据目录保存整个游戏状态 key。
- 验证：临时目录中两个真实 createStorage 实例读取 5 草莓；A 保存 11 草莓后，B 以旧状态只切换场景再保存，磁盘草莓变回 5。主进程没有申请单实例锁。此验证模拟存档写入，没有启动两份正式应用。
- 建议：启动时申请单实例锁；重复启动只恢复并聚焦现有窗口。补充两次启动不会创建第二个写入者的检查。

### 2. [P2] 导入旧备份后可能混入旧日记、出现破图

- 位置：[app/page.tsx:377](E:/workspace/project_009_草莓打卡屋/app/page.tsx:377)、[app/page.tsx:1487](E:/workspace/project_009_草莓打卡屋/app/page.tsx:1487)、[electron/storage.cjs:170](E:/workspace/project_009_草莓打卡屋/electron/storage.cjs:170)。
- 触发：本机已有照片板，导入不含照片板 key 的兼容旧备份。导入替换磁盘数据和照片目录，但刷新前未同步清理浏览器缓存。
- 验证：隔离运行真实 importPayload 和源码 readPersisted，磁盘缺少的 key 被旧 localStorage 回灌；照片元数据存在，但对应文件已不在当前照片目录。缺少历史 key 时，同样会混入旧日记。
- 建议：成功导入后按备份完全替换应用拥有的缓存 key，再刷新；只在首次迁移时允许旧缓存补入磁盘。保留现有导入前备份。

### 3. [P2] 常驻应用跨午夜后仍向前一天记账

- 位置：[app/page.tsx:568](E:/workspace/project_009_草莓打卡屋/app/page.tsx:568)、[app/page.tsx:1907](E:/workspace/project_009_草莓打卡屋/app/page.tsx:1907)。
- 触发：前一天打开应用，午夜后不刷新继续记录。
- 依据：today 与 dateLabel 仅在挂载时赋值，保存日期、每日奖励次数和连续记录判断继续使用冻结日期。连续天数的中断重置也只在加载存档时执行。
- 影响：日记归错日期，新一天奖励不能正确重置；长时间常驻跨过断签日时，连续天数仍可能累加。
- 建议：提交时重新计算本地日期，并在跨日或恢复前台时同步日期、记录计数和连续天数。测试 23:59→00:01 及间隔一天未记录的情况。

### 4. [P2] 网页版第 101 篇起，最早的日记无法翻到

- 位置：[db/checkins.ts:42](E:/workspace/project_009_草莓打卡屋/db/checkins.ts:42)、[app/page.tsx:750](E:/workspace/project_009_草莓打卡屋/app/page.tsx:750)。
- 依据：查询固定 LIMIT 100；前端只加载一次，翻页仅在已加载数组内进行，没有服务端分页或总数。
- 验证：将源码查询用于内存 SQLite，101 条只返回 100 条。旧记录仍在数据库，但界面不可访问；刷新后的篇数也会缩回 100。
- 建议：增加游标分页与总数，翻到末页继续加载，并测试 101 篇以上。

### 5. [P2] 慢网保存日记会清掉等待期间新写的文字

- 位置：[app/page.tsx:1929](E:/workspace/project_009_草莓打卡屋/app/page.tsx:1929)、[app/page.tsx:2544](E:/workspace/project_009_草莓打卡屋/app/page.tsx:2544)。
- 触发：提交后请求未返回，继续修改输入框；响应成功时无条件 setNoteText("")。
- 验证：抽取真实 checkIn 函数并模拟延迟响应，提交后的新草稿被清空。普通本地网络保存正常，此问题属于异步边界。
- 建议：保存期间锁定输入，或仅当当前草稿仍与提交快照相同时清空。

### 6. [P2] 连续上传照片可能占用同一个位置

- 位置：[app/page.tsx:1427](E:/workspace/project_009_草莓打卡屋/app/page.tsx:1427)、[app/page.tsx:1442](E:/workspace/project_009_草莓打卡屋/app/page.tsx:1442)。
- 触发：网页上传较慢，在第一张返回前再次选择照片。上传等待期间未设置 busy，两个回调均从旧闭包分配 slot。
- 验证：抽取源码函数并模拟并发返回，两张照片的 slot 都为 0；CSS 使用 slot 定位，所以显示重叠。刷新后的 normalize 会修正，但本次会话没有修正。
- 建议：从上传开始就锁定入口；在 setPhotoBoardPhotos(current => ...) 内按最新 current 分配位置。

### 7. [P2] 照片说明在中间编辑时光标跳到末尾

- 位置：[PhotoBoardOverlay.tsx:31](E:/workspace/project_009_草莓打卡屋/app/game/photo-board/PhotoBoardOverlay.tsx:31)。
- 实测：输入 ABCD，按 Home，再依次输入 x、y；实际为 xABCDy，预期 xyABCD。输入 x 后读取 DOM，selectionStart 为 5，证实光标被移到末尾。
- 原因：effect 依赖 draft.length，每次字符数变化都调用 setSelectionRange 到末尾。
- 建议：只在进入编辑模式时聚焦和定位，正常输入时保留浏览器的光标位置。证据见步骤 4。

### 8. [P2] 点击照片大图外部会连照片板一起关闭

- 位置：[PhotoBoardOverlay.tsx:90](E:/workspace/project_009_草莓打卡屋/app/game/photo-board/PhotoBoardOverlay.tsx:90)、[PhotoBoardOverlay.tsx:122](E:/workspace/project_009_草莓打卡屋/app/game/photo-board/PhotoBoardOverlay.tsx:122)。
- 实测：打开照片大图，点击图片右侧遮罩，直接回到房间，未返回照片板。
- 原因：大图遮罩的 pointerdown 继续冒泡到外层照片板关闭处理器。
- 建议：阻止事件继续冒泡，仅关闭当前大图层，保留照片板和滚动位置。证据见步骤 5、6。

### 9. [P2] 离线睡眠结束后，漏算醒来至重启之间的状态衰减

- 位置：[app/page.tsx:682](E:/workspace/project_009_草莓打卡屋/app/page.tsx:682)、[app/page.tsx:689](E:/workspace/project_009_草莓打卡屋/app/page.tsx:689)。
- 触发：猫咪开始睡眠后关闭应用，超过 3 小时睡眠结束时间很久才重开。
- 依据：加载分支只扣除睡眠恢复的困倦，并直接把 statsUpdatedAt 设为当前时间，未结算 sleep.endsAt 到现在的清醒时段。
- 验证：睡眠结束后数值为活力 72、困倦 0，21 小时后重开仍保留 72/0；使用现有每 5 分钟变化 1 点的规则，清醒时段应结算至 0/100。
- 建议：在睡眠结束时间先应用恢复，再调用现有衰减函数计算剩余时段；同时覆盖当前猫和其他已领养猫。

### 10. [P2] 某些家具布置下，寻路失败会直接穿过家具

- 位置：[app/game/scene.ts:96](E:/workspace/project_009_草莓打卡屋/app/game/scene.ts:96)、[app/page.tsx:1721](E:/workspace/project_009_草莓打卡屋/app/page.tsx:1721)。
- 复现：将猫爬架放在合法位置 (60%,77%)，障碍范围为 left=54、right=66、top=62、bottom=79；从 (50,70) 去 (70,70)。
- 验证：直接调用真实 getWalkPath，返回 [{x:70,y:70}]，直线路径穿过猫爬架。
- 原因：算法只尝试一个转折点；需要两个转折点时，失败分支直接返回目标。
- 建议：支持多个转折点；至少在找不到可行路线时停留并反馈，而不返回穿障碍直线。

## 验证结果与范围

| 检查 | 结果 |
|---|---|
| npm test（包含网页构建） | 构建成功，44/44 测试通过 |
| 当前源码定向 TypeScript 检查 | 18 条诊断：含 page.tsx:1925 奖励变量类型不兼容、Cloudflare 类型缺失及配置问题；排除 work/backups 等历史副本 |
| 定向 ESLint：app、desktop、electron、db、worker | 16 errors、41 warnings；主要为 effect 内同步 setState、CommonJS require 规则及 img 提示 |
| 本地网页日记保存 | 成功；草莓 48→54，下一条奖励显示 +8 |
| 专注钟 | 开始后倒计时推进，暂停后显示 24:51 和“已暂停” |
| 照片上传 | 本地上传项目自带 PNG 成功；图片显示正常 |
| 光标与大图遮罩 | 两项缺陷均已通过实际页面复现 |
| 桌面存档、导入、历史查询、异步边界、寻路 | 隔离运行或源码函数验证，未操作正式桌面存档 |

现有测试中有不少源码字符串/正则断言，因此测试通过并不能保证上述完整交互正确。建议优先增加跨日、旧备份缺 key、并发上传和慢网草稿的行为测试；随后完善类型声明及 lint 对 CommonJS、历史目录的配置。

本次没有安装或发布版本；未实机验收 Windows/macOS 安装、自动更新、系统通知权限、休眠唤醒、多显示器小窗或完整移动端体验。未进行屏幕阅读器/完整键盘焦点测试，不能据此宣称完整无障碍合规。

当前项目目录没有 .git（已有恢复快照记录说明原因），无法提供 Git diff；业务源码未由本次检查修改。新增内容为本报告、截图、检查输出，网页构建更新了生成产物，本地预览中使用了测试记录和项目自带图片。

## 本次页面步骤与截图

截图均来自本次检查，保存后已重新打开核对。截图只用于证明当时的页面状态；跨天、存档等问题依赖上述代码和隔离验证。

### 步骤 1：进入房间——正常

主要场景及菜单可见。初始 48 草莓；较窄视口下左下状态卡与底部菜单紧邻，适配性仍可另做专项检查。

![步骤1 首页](E:/workspace/project_009_草莓打卡屋/design-qa/review-20261008/01-home.jpg)

### 步骤 2：填写并保存日记——基础流程正常

保存后得到 6 草莓，连续记录为 1 天，下一篇显示 +8。跨日和慢网边界仍存在问题 3、5。

![步骤2 日记保存](E:/workspace/project_009_草莓打卡屋/design-qa/review-20261008/02-journal-saved.jpg)

### 步骤 3：开始并暂停专注——正常

计时从 25:00 推进，暂停停在 24:51；短窗口内下方按钮需要滚动才能看到，未发生无法访问。

![步骤3 专注钟暂停](E:/workspace/project_009_草莓打卡屋/design-qa/review-20261008/03-pomodoro-paused.jpg)

### 步骤 4：上传图片并编辑说明——上传正常，编辑异常

输入顺序应得到 xyABCD，实际为 xABCDy，见问题 7。

![步骤4 说明光标问题](E:/workspace/project_009_草莓打卡屋/design-qa/review-20261008/04-caption-cursor-bug.jpg)

### 步骤 5：打开照片大图——正常

图片可以打开、按比例显示，存在有名称的关闭按钮。未验证键盘焦点是否被限制在顶层弹窗。

![步骤5 照片大图](E:/workspace/project_009_草莓打卡屋/design-qa/review-20261008/05-photo-viewer.jpg)

### 步骤 6：点击大图外部返回——异常

照片板一起关闭，直接回到房间，见问题 8。

![步骤6 错误返回房间](E:/workspace/project_009_草莓打卡屋/design-qa/review-20261008/06-viewer-closes-board.jpg)

建议实施顺序：先解决 1–3 的数据与日期问题，再处理 4–8 的记录和照片交互，最后修复 9–10 的宠物状态及寻路。
