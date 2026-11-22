// 用 Chromium 渲染 SVG：先 4 倍超采样，再缩到半尺寸，最后 2 倍最近邻放大，得到与背景一致的柔和像素颗粒。
const { chromium } = require("playwright");
const path = require("node:path");
const tvSvg = require("./tv.svg.cjs");
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 4 });
  for (const [on, name] of [[false, "raw-off.png"], [true, "raw-on.png"]]) {
    await p.setContent(`<html><body style="margin:0;background:transparent">${tvSvg(on)}</body></html>`);
    await p.locator("svg").screenshot({ path: path.join(out, name), omitBackground: true });
  }
  await b.close();
})();
