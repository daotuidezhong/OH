// 放映室的纯规则，不依赖 Electron，方便单独测试。
const BILIBILI_HOSTS = ["bilibili.com", "b23.tv"];

function isBilibiliUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return BILIBILI_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

// 去掉 Electron 和应用名标记，避免 B站把窗口当成非主流浏览器降级处理。
function toChromeUserAgent(userAgent) {
  return userAgent.replace(/\s+Electron\/\S+/, "").replace(/\s+OH\/\S+/, "").replace(/\s+berry-workout-island\/\S+/, "");
}

module.exports = { BILIBILI_HOSTS, isBilibiliUrl, toChromeUserAgent };
