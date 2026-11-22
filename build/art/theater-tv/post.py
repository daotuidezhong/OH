# 后处理：缩到目标原图尺寸的一半再 2 倍最近邻放大，得到柔和像素颗粒；并合成到房间背景预览。
import sys
from PIL import Image
S, target_w, cx, feet_y = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
def pixelize(src, w):
    im = Image.open(src).convert("RGBA")
    h = round(im.height * w / im.width)
    half = im.resize((w // 2, h // 2), Image.LANCZOS)
    a = half.getchannel("A").point(lambda v: 255 if v > 140 else (0 if v < 40 else v))
    half.putalpha(a)
    return half.resize((w // 2 * 2, h // 2 * 2), Image.NEAREST)
off = pixelize(f"{S}/raw-off.png", target_w); on = pixelize(f"{S}/raw-on.png", target_w)
off.save(f"{S}/furniture-tv.png"); on.save(f"{S}/furniture-tv-on.png")
bg = Image.open("public/game/room-frames/room-v070-clear-noon-00.png").convert("RGBA")
W, H = bg.size
# 精灵底部 4% 是投影留白，脚落在 feet_y
x = round(cx * W - off.width / 2); y = round(feet_y * H - off.height * 0.928)
for img, name in ((off, "comp-off.png"), (on, "comp-on.png")):
    c = bg.copy(); c.alpha_composite(img, (x, y))
    c.crop((int(.48 * W), int(.10 * H), int(.98 * W), int(.62 * H))).resize((int(.5 * W) * 2, int(.52 * H) * 2), Image.NEAREST).save(f"{S}/{name}")
print(off.size, x, y)
