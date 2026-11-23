# 第四步：右边空座位（蓝色玩偶不在时盖在房间图上）+ 两张椅子之间的残影清理。
#   out/room.png              覆盖：去掉两椅之间擦手臂留下的浅色残影
#   out/seat-right-empty.png  白色玩偶那块补成空座位的小图（带羽化），玩偶不在时叠上去
# 补法：只用周围真正的墙面 / 暗处像素，沿水平方向做多尺度归一化卷积（保住墙上横向的暗带），
# 再叠一层附近墙面的细纹理。椅背、格子毯、爆米花桌保持原图。
import json

import cv2
import numpy as np

room = cv2.imread("out/room.png", cv2.IMREAD_UNCHANGED)
plate = room[..., :3].astype(np.float32)
art = cv2.imread("art.png")
mask = cv2.imread("mask-dolls.png", 0) > 0
chair_top = np.load("chair_top.npy")
h, w = mask.shape
yy, xx = np.mgrid[0:h, 0:w]


def dilate(region, size):
    return cv2.dilate(region.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))) > 0


count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
for index in range(1, count):
    if stats[index, cv2.CC_STAT_AREA] < 50:
        mask[labels == index] = False
heart = ((xx - 791) ** 2 + (yy - 624) ** 2) < 54 ** 2
right = mask & (xx >= 800) & ~heart & (yy > 575)

b, g, r = [plate[..., i] for i in range(3)]
lum = (r + g + b) / 3
below_chair = yy >= chair_top[None, :]
velvet = (r > 115) & (r > g * 1.6)
ab, ag, ar = [art[..., i].astype(np.float32) for i in range(3)]
_plaid = (yy >= 708) & (xx > 955) & ((ab + ag + ar) / 3 > 110) | ((yy >= 708) & (xx > 955) & (ab > ar + 8))
# 蓝白格子毯：照原图量出来的轮廓（上沿 y≈712，往左斜到 (956,718)；左沿是 (956,718)→(992,746) 的深色描边）。
# 分割把毯子左上角也算进了玩偶，这里以几何轮廓为准，整块保持原图。
top = np.where(xx >= 1000, 712, 712 + (1000 - xx) * 6 / 44)
left_edge = 955 + (yy - 718) * 36 / 28
blanket = (xx >= 950) & (yy >= top) & (xx >= left_edge - 1) & (yy < 800)
right &= ~blanket
# 右椅背在原图里是露着的（玩偶坐在椅背后面）：原图里的红色丝绒一律保持原样，避免擦出锯齿
# 丝绒本体很红（r/g > 2）；上沿那条高光偏粉但很亮（r ≥ 238），只认紧贴丝绒的那一条。玩偶的毛 r/g ≈ 1.55、更暗。
area = (yy >= 712) & (xx >= 830) & (xx < 1000)
core = area & (ar > 110) & (ar > ag * 2.0)
art_velvet = core | (area & dilate(core, 5) & (ar >= 238))
art_velvet = cv2.morphologyEx(art_velvet.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
right &= ~art_velvet
protect = (below_chair & ~right) | blanket | art_velvet

# 白色玩偶区域（含耳机、毛边光晕）
seat = dilate(right, 15) & ~protect & (yy < 760)
# 两椅之间擦手臂留下的浅色横向残影
# 范围按位置划：亮红色的残影会被误认成椅子丝绒，所以不按颜色排除；只避开爆米花桶的饰带、杯子吸管和杯沿
streak = (xx >= 730) & (xx <= 848) & (yy >= 718) & (yy <= 737) & ~below_chair & (lum > 50)
streak &= ~((xx >= 774) & (xx <= 810) & (yy >= 730))
streak = dilate(streak, 5) & ~below_chair & (yy <= 738) & ~((xx >= 774) & (xx <= 810) & (yy >= 730))
fill = seat | streak

valid = ~dilate(fill, 3) & ~protect & (lum > 22) & (lum < 105) & ~velvet & ~(b > r + 5) & (yy > 540) & (yy < 770)
valid &= ~dilate((lum > 120), 5)
weight = valid.astype(np.float32)
smooth = None
for sigma_x in (220, 110, 55, 26):
    num = cv2.GaussianBlur(plate * weight[..., None], (0, 0), sigmaX=sigma_x, sigmaY=3)
    den = cv2.GaussianBlur(weight, (0, 0), sigmaX=sigma_x, sigmaY=3)[..., None]
    est = num / np.maximum(den, 1e-6)
    conf = np.clip(den / 0.2, 0, 1)
    smooth = est if smooth is None else smooth * (1 - conf) + est * conf
patch = plate[600:680, 430:530]
texture = patch - cv2.GaussianBlur(patch, (0, 0), 3)
tile = np.tile(texture, (h // 80 + 1, w // 100 + 1, 1))[:h, :w]
filled = np.clip(smooth + tile * 0.8, 0, 255)


def blend(region, sigma=1.4):
    alpha = cv2.GaussianBlur(region.astype(np.float32), (0, 0), sigma)
    alpha = np.where(dilate(region, 5), alpha, 0) * ~protect
    return alpha


# 残影直接修进房间图
a_streak = blend(streak)[..., None]
fixed = plate * (1 - a_streak) + filled * a_streak
room[..., :3] = np.clip(fixed, 0, 255).astype(np.uint8)
cv2.imwrite("out/room.png", room)

a_seat = blend(seat)
empty = fixed * (1 - a_seat[..., None]) + filled * a_seat[..., None]

cv2.imwrite("out/room-empty-preview.png", np.clip(empty, 0, 255).astype(np.uint8))
ys, xs = np.where(a_seat > 0.02)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
rgba = cv2.cvtColor(np.clip(filled[y0:y1, x0:x1], 0, 255).astype(np.uint8), cv2.COLOR_BGR2BGRA)
rgba[..., 3] = np.clip(a_seat[y0:y1, x0:x1] * 255, 0, 255).astype(np.uint8)
cv2.imwrite("out/seat-right-empty.png", rgba)
layout = json.load(open("out/layout.json"))
layout["seat-right-empty"] = [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]
json.dump(layout, open("out/layout.json", "w"), indent=2)
print(layout["seat-right-empty"])
