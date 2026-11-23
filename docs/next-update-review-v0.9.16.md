# v0.9.16 更新检查

本次把放映室重做成像素小影院，并改为放映厅码配对、固定双人座位。

## 内容

- **场景**：`desktop/theater.html` / `desktop/theater.tsx` 是放映室窗口的界面，`app/theater/` 是场景本身。房间按参考图一比一还原（`build/art/theater-ref/`，生成方法见其 README），银幕处透明，B站画面（`WebContentsView`，独立分区 `persist:oh-theater`、沙箱、无 preload）贴在银幕位置；舞台按窗口等比铺满，贴边的票根、按钮、聊天条按被裁掉的宽度往里收。
- **座位**：创建者（master）坐右边白色玩偶，加入者（member）坐左边粉色玩偶。白色玩偶画在房间图里，不在时盖一块空座位小图（`seat-right-empty`）；粉色玩偶、牵手的手臂、爱心是叠上去的小图。
- **配对与同步**：6 位放映厅码换算成 VideoTogether 的房间名和密码（`app/theater/protocol.ts`）；`electron/theater-bridge.js` 隐藏 VideoTogether 面板，转发成员数、聊天和牵手信号，小银幕上的点击转成“放大”。
- **单机测试**：`npx electron . --theater-test` 打开 A（创建者）、B（加入者）两个窗口并自动用同一个码配对。

## 验证

- 测试 136 项通过；类型检查、ESLint、桌面版构建通过。
- Linux 下 Electron 端到端（模拟 B站页面）：配对、VideoTogether 注入、成员数、双向聊天气泡、小银幕点击放大与 Esc 返回均正常。
- Windows 实测（测试模式）：真实 B站视频在银幕中播放，A / B 两个窗口互相显示“TA 在线”，两只玩偶入座。
- 浏览器截图检查：我方 / 对方视角、对方不在 / 在线 / 牵手、三种窗口比例下界面完整。

发布说明见 [v0.9.16](releases/v0.9.16.md)。
