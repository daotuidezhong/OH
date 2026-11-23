# 放映厅素材（按参考图一比一还原）

`reference.webp` 是放映厅的参考图（含 claude.ai 顶栏和预览页的界面元素）。`public/theater/*.webp` 全部从这张图切出来，坐标写在 `app/theater/stageLayout.ts`。

## 重新生成

需要 Python 3、Pillow、`opencv-python-headless`、numpy。在一个临时目录里运行：

```bash
python3 -c "from PIL import Image; Image.open('build/art/theater-ref/reference.webp').convert('RGB').crop((0, 59, 1566, 1002)).save('art.png')"
python3 build/art/theater-ref/plate_ui.py      # 去掉票根、按钮、预览控制面板、聊天条 → step1.png
python3 build/art/theater-ref/segment.py       # 分出两只玩偶、牵着的手臂、爱心 → mask-dolls.png
mkdir -p out && python3 build/art/theater-ref/build_assets.py   # 干净房间 + 玩偶 / 手臂 / 爱心小图 → out/
python3 build/art/theater-ref/compose.py       # 拼回去和参考图对比（平均差异约 4/255）
```

然后把 `out/*.png` 转成 WebP 放进 `public/theater/`（`room`、`doll-left`、`doll-right`、`doll-right-rest`、`arm-left`、`arm-right`、`heart`），尺寸和位置要与 `layout.json`、`stageLayout.ts` 一致，`tests/theater-stage.test.mjs` 会检查。

## 各素材

- `room`：去掉界面、玩偶、手臂、爱心后的房间；银幕内框（432, 100, 703×401）透明，B站画面在下面。左边空座位的椅背上沿用右椅背镜像补齐，左下预览面板处用右侧镜像补齐。
- `doll-left`：粉色蝴蝶结玩偶（TA），手臂收在身侧。
- `doll-right` / `doll-right-rest`：戴蓝色耳机的玩偶（我），分别用于牵手时和收手时（后者在原本被手臂盖住的身体边缘补了描边）。
- `arm-left` / `arm-right`：牵手时伸向中间的手臂，播放时从身侧往中间展开。
- `heart`：爱心和光芒。
