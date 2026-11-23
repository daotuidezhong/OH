# VideoTogether（固定版本）

放映室验证版使用的第三方同步脚本，来自 [VideoTogether/VideoTogether](https://github.com/VideoTogether/VideoTogether)，MIT 许可（见 `LICENSE`）。

- 上游提交：`3c61f12b84523abed497f690754487b5c21ec6d3`（2026-02-09）
- `vt.zh-cn.website.js`：上游 `release/vt.zh-cn.website.js`，未修改。
- `loader.website.js`：上游 `release/extension.website.user.js`，打了两处 OH 补丁：
  1. 删除从 jsDelivr / 阿里云 CDN 下载、缓存并注入最新版 `vt.js` 的整段逻辑。`vt.js` 改由 `electron/theater.cjs` 从本目录注入，保证运行的就是仓库里的这份代码。
  2. 关掉“标签页存储”（`VideoTogetherTabStorageEnabled = false`）。网页版的标签页存储就是按域名隔离的 `sessionStorage`，而且设置是异步送达的：成员跟随房主跳转时把房间状态存进标签页存储，刷新后 VideoTogether 却在设置到达前就去 `sessionStorage` 恢复，找不到记录，于是反复跳转、一直进不了房（跨域名时还会弹“请在跳转后再次加入”）。关掉后同域名跳转存 `sessionStorage`、跨域名跳转把状态带在网址参数里，恢复都是同步读取的。

## 注意

- 同步房间走 VideoTogether 的公共服务器（`vt.panghair.com` / `2gether.video`）。房间名、密码、当前视频链接和播放进度会经过该服务器。正式版计划换成 OH 自己的 Cloudflare 房间。
- 更新上游版本：

```bash
git clone --depth 1 https://github.com/VideoTogether/VideoTogether.git /path/to/VideoTogether
node electron/vendor/videotogether/update.mjs /path/to/VideoTogether <提交号>
```
