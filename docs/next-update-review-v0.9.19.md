# v0.9.19 更新检查

修复两台电脑连不到同一个放映厅。

## 原因

VideoTogether 有两台互不相通的同步服务器：先连主服务器 `vt.panghair.com:5000`，3 秒没连通就从国内 CDN 配置（`videotogether.oss-cn-hangzhou.aliyuncs.com/release/cdn-config.json` 的 `apiHostChina`）取国内服务器改连；两个请求都在路上时，谁后响应就用谁。两台电脑网络不同时会落在不同服务器上，房间名相同也互相看不到。单机测试时两个窗口网络相同，所以测不出来。

## 修改

- `electron/theater-bridge.js`：进房前先从同一份国内 CDN 配置取国内服务器（4 秒取不到用上次记下的，否则主服务器），存进 localStorage，锁定 `video_together_host`，并让 `SyncTimeWithServer` 只连这台；已经连到别的服务器时退出重进。`drain()` 报告当前线路。
- 场景票根显示线路（“国内线路” / “主线路”）。

## 验证

- 测试 137 项通过；类型检查、ESLint、桌面版构建通过。
- 新增桥测试：服务器定下来前不进房；VideoTogether 想换服务器时仍只连锁定的那台；已连到别的服务器时退出重进；配置取不到时退回主服务器。
- Electron 端到端（模拟网络）：首次加入、同域名跳转、跨域名跳转后都连在锁定的服务器上；配对、聊天、放大、离开正常。

发布说明见 [v0.9.19](releases/v0.9.19.md)。
