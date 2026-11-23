# v0.9.20 更新检查

票根上的同步线路被省略号截掉，改为在有线路时替换 `OH CINEMA` 显示；发布流程支持只发 Windows。

## 修改

- `app/theater/TheaterScene.tsx`：票根小字有线路时显示线路（悬停提示“同步线路：…”），否则显示 `OH CINEMA`。
- `.github/workflows/macos-build.yml`：提交说明带 `[windows-only]` 时跳过 Mac 打包，Windows 打包与校验通过即发布；不带时行为不变。
- `build/verify-release.mjs`：`RELEASE_WINDOWS_ONLY=1` 时不要求 dmg，安装包哈希、自动更新文件、分块清单校验不变。

## 验证

- 测试 138 项通过（新增：只发 Windows 时不要求 dmg、仍拦下被改动的安装包；不带开关缺 dmg 仍不能发布）；类型检查、ESLint、桌面版构建通过。

发布说明见 [v0.9.20](releases/v0.9.20.md)。
