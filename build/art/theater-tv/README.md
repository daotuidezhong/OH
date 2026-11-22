# 放映室小电视素材源文件

`public/game/furniture-tv.png`（关机）和 `furniture-tv-on.png`（开机）由这里的 SVG 生成。配色取自房间背景里的唱片机柜。

```bash
node build/art/theater-tv/render.cjs build/art/theater-tv        # Chromium 4 倍超采样渲染 raw-off.png / raw-on.png
python3 build/art/theater-tv/post.py build/art/theater-tv 168 0.63 0.486   # 缩成柔和像素颗粒，并合成房间预览 comp-*.png
cp build/art/theater-tv/furniture-tv*.png public/game/
```

- 168 是在 1672×941 房间原图里的宽度（像素），对应 CSS `width: 10.05%; height: 23.4%`。
- 0.63 / 0.486 是放置点（柜脚中心）在原图里的横、纵比例，对应 CSS `left: 63%; top: 48.6%`，与唱片机柜的柜脚在同一条地面线上。
