# VideoTogether（固定版本）

放映室验证版使用的第三方同步脚本，来自 [VideoTogether/VideoTogether](https://github.com/VideoTogether/VideoTogether)，MIT 许可（见 `LICENSE`）。

- 上游提交：`3c61f12b84523abed497f690754487b5c21ec6d3`（2026-02-09）
- `vt.zh-cn.website.js`：上游 `release/vt.zh-cn.website.js`，未修改。
- `loader.website.js`：上游 `release/extension.website.user.js`，打了一处 OH 补丁：删除从 jsDelivr / 阿里云 CDN 下载、缓存并注入最新版 `vt.js` 的整段逻辑。`vt.js` 改由 `electron/theater.cjs` 从本目录注入，保证运行的就是仓库里的这份代码。

## 注意

- 同步房间走 VideoTogether 的公共服务器（`vt.panghair.com` / `2gether.video`）。房间名、密码、当前视频链接和播放进度会经过该服务器。正式版计划换成 OH 自己的 Cloudflare 房间。
- 更新上游版本：

```bash
git clone --depth 1 https://github.com/VideoTogether/VideoTogether.git /path/to/VideoTogether
node electron/vendor/videotogether/update.mjs /path/to/VideoTogether <提交号>
```
