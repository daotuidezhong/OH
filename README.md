# OH 像素生活日记小屋

一个把每日生活日记、25+5 橙子专注、猫咪陪伴、院子种植、厨房烹饪和房间布置结合起来的网页 / Windows / macOS 桌面小游戏。

## 项目入口

- 项目架构与待修改清单：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 设计验收记录：[`docs/design-qa.md`](docs/design-qa.md)
- 下一更新检查：[`docs/next-update-review-20261014.md`](docs/next-update-review-20261014.md)
- 网页主界面：[`app/page.tsx`](app/page.tsx)
- Windows / macOS 桌面入口：[`desktop/main.tsx`](desktop/main.tsx)

## 常用命令

```bash
npm install
npm run dev
npm run build
npm test
```

## Windows 安装版

```bash
npm run desktop:build
```

安装包输出到 `outputs/Berry-Workout-Island-Setup-<version>.exe`。桌面版在本机保存游戏进度、日记历史、日记照片、自评分、橙子专注钟记忆和猫咪名字，并支持检查 GitHub Releases 更新。日记照片会导入应用内部，最长边等比例缩至 1600 像素，不裁切、不拉伸。

## macOS 安装版

macOS 安装包必须在 Mac 上构建。在 GitHub Actions 中手动运行 `Build macOS installers`，会分别生成 Apple 芯片的 `OH-<version>-arm64.dmg` 和 Intel Mac 的 `OH-<version>-x64.dmg`。未签名安装包首次打开时需在 macOS“隐私与安全性”中确认允许。

```bash
npm run desktop:build:mac -- --arm64 --publish never
npm run desktop:build:mac -- --x64 --publish never
```

## 数据位置

- 网页版：游戏状态保存在浏览器，打卡记录保存在 Sites D1，日记照片保存在 Sites R2。
- Windows / macOS 版：游戏状态、打卡记录与自评分同时写入网页存储和独立本地数据文件，不会上传给屋主。
- 桌面版左上角的“数据备份”可导出 `.ohbackup` 完整存档；把文件复制到新电脑后导入，即可在 Windows 和 Mac 之间迁移全部数据，包括日记照片。
- 桌面版更新完成后，首次启动会自动弹出当前版本的更新说明。

## 橙子专注钟

- 每次专注 25 分钟，完成后奖励 5 颗草莓并自动进入 5 分钟休息。
- 保存今日循环数、历史累计循环数和专注钟累计奖励；暂停、关闭橙子专注钟窗口或把游戏放到后台不会丢失进度。
- 网页版在获得通知权限后发送系统通知；Windows / macOS 版由桌面进程计时，窗口最小化后仍会在专注或休息结束时提醒。

## 商店与调酒

- 在商店的“调酒配料”分类用草莓购买基酒、利口酒、果汁、汽水、糖浆和装饰物；冰块免费且不限量。
- 点击房间里的吧台进入调酒小游戏。选择现有库存、调整用量和制作方式后即可出杯，成功会解锁配方图鉴。
- 配料库存、草莓余额、已解锁配方和最佳品质与原有游戏状态一起保存；中途退出不会消耗材料。
- 配料、价格和配方统一配置在 `app/game/cocktails.ts`，新增内容时优先修改该文件并补充回归检查。
