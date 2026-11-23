# 用素材重新拼回去，检查与参考图是否一致；再拼“没牵手 / TA 不在”两种状态。
import json
import math

from PIL import Image

layout = json.load(open("out/layout.json"))
art = Image.open("art.png").convert("RGBA")
room = Image.open("out/room.png").convert("RGBA")
REST_ANGLE = {"arm-left": 72, "arm-right": -72}


def paste(base, name, angle=0.0):
    sprite = Image.open(f"out/{name}.png").convert("RGBA")
    box = layout[name]
    x, y = box[0], box[1]
    if angle and len(box) > 4:
        px, py = box[4]
        # 绕肩膀支点旋转：把支点放到画布中心再转
        pad = max(sprite.width, sprite.height) * 2
        canvas = Image.new("RGBA", (pad * 2, pad * 2))
        canvas.paste(sprite, (pad - (px - x), pad - (py - y)))
        canvas = canvas.rotate(-angle, resample=Image.BICUBIC, center=(pad, pad))
        base.alpha_composite(canvas, (px - pad, py - pad))
        return
    base.alpha_composite(sprite, (x, y))


def frame(partner=True, holding=True):
    base = Image.new("RGBA", room.size, (20, 20, 30, 255))
    screen = art.crop(tuple(layout["screen"][:2]) + (layout["screen"][0] + layout["screen"][2], layout["screen"][1] + layout["screen"][3]))
    base.paste(screen, tuple(layout["screen"][:2]))
    base.alpha_composite(room)
    if partner:
        paste(base, "doll-left")
    paste(base, "doll-right")
    # 不牵手时手臂收在身侧（被椅背挡住，不画）；牵手时从肩膀伸出来
    if partner and holding:
        paste(base, "arm-left")
        paste(base, "arm-right")
    if partner and holding:
        paste(base, "heart")
    return base


rebuilt = frame()
rebuilt.convert("RGB").save("z-rebuilt.png")
diff = sum(abs(a - b) for a, b in zip(rebuilt.convert("L").getdata(), art.convert("L").getdata())) / (art.width * art.height)
print("mean abs diff vs reference", round(diff, 2))
crop = (520, 560, 1060, 800)
tiles = [art.crop(crop), rebuilt.crop(crop), frame(holding=False).crop(crop), frame(partner=False).crop(crop)]
sheet = Image.new("RGB", (tiles[0].width * 2 + 10, tiles[0].height * 2 + 10), (255, 255, 255))
for index, tile in enumerate(tiles):
    sheet.paste(tile.convert("RGB"), ((index % 2) * (tile.width + 10), (index // 2) * (tile.height + 10)))
sheet = sheet.resize((sheet.width * 2 // 1, sheet.height * 2 // 1))
sheet.thumbnail((2200, 1100))
sheet.save("z-compose.png")
