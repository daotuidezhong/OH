# v0.9.18 更新检查

修复放映厅加入方一直进不了房间。

## 原因

VideoTogether 网页版的“标签页存储”就是按域名隔离的 `sessionStorage`，而它的设置是异步送达的。成员跟随房主跳转时，若设置已到，会把房间状态存进标签页存储再跳；刷新后 VideoTogether 在设置到达前就启动，去 `sessionStorage` 的另一组键里恢复，找不到记录，于是又跳转、又找不到，循环往复。跨子域名（例如房主在 `search.bilibili.com`）时还会弹出“请在跳转后再次加入”。

## 修改

- `electron/vendor/videotogether/loader.website.js`：关掉标签页存储（`VideoTogetherTabStorageEnabled = false`）。同域名跳转存 `sessionStorage`，跨域名把状态带在网址参数里，恢复都是同步读取。`update.mjs` 更新上游时自动打这个补丁，README 有说明。
- `electron/theater-bridge.js`：兜底关掉标签页存储；屏蔽 VideoTogether 的 `alert`（会卡住整个页面）。
- 撤回了 v0.9.17 之后“两边都能控制播放”的试验改动，播放控制与 v0.9.17 相同（创建者控制，对方跟随）。

## 验证

- 测试 136 项通过；类型检查、ESLint、桌面版构建通过。
- Electron 端到端（模拟 B站页面）：观众按 VideoTogether 原代码分支跟随房主跳转后刷新——同域名、跨域名都恢复了房间且网址对上；同样流程在 v0.9.17 下跨域名恢复失败（网址为空，会再次跳转）。
- 原有端到端：配对、聊天气泡、放大与返回、离开放映厅均正常。

发布说明见 [v0.9.18](releases/v0.9.18.md)。
