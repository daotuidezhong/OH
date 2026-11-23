# v0.9.17 更新检查

本次给放映厅加上“离开放映厅”。

## 内容

- 场景右上角按钮组新增 `leave-button`（`app/theater/TheaterScene.tsx`），配对卡片新增“先不配对，离开放映厅”；两者都调用 `ohTheater.close()`。
- `electron/theater-preload.cjs` 暴露 `close`，`electron/theater.cjs` 处理 `theater:close`：只关闭发出请求的那个放映厅窗口，游戏主窗口不受影响。
- 右上角按钮区域在参考图坐标里加高到 190（`UI.controls`），不遮挡银幕。

## 验证

- 测试 136 项通过；类型检查、ESLint、桌面版构建通过。
- Linux 下 Electron 端到端：配对、放大与 Esc 返回后点击“离开放映厅”，放映厅窗口关闭、游戏主窗口保留。
- 浏览器截图检查：三种窗口比例下按钮完整显示在窗口内。

发布说明见 [v0.9.17](releases/v0.9.17.md)。
