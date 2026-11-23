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
# 白色玩偶身体左侧（原图伸出手臂的地方）：手臂擦掉后要重新长出一条干净的毛边。
# 照右侧真实的毛边：两只耳机罩外缘对称轴 x ≈ 923.5，右侧身体边缘 x ≈ 995→992，镜像过来左边缘约 850→859，
# 从耳机罩底部往下略向外收到椅背。边缘右侧本来就是身体 / 手臂交界处的毛（原图像素），左侧换成补好的墙面。
EDGE_Y0, EDGE_Y1 = 687, 750
rows = np.arange(h)
edge_x = 850 + (rows - EDGE_Y0) * 0.15 + np.round(0.6 * np.sin(rows * 1.3) + 0.5 * np.sin(rows * 0.47))
edge_zone = (yy >= EDGE_Y0) & (yy < EDGE_Y1) & (xx >= 826) & (xx < edge_x[:, None] + 3) & ~art_velvet
fill = seat | streak | edge_zone

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
# 白色玩偶左侧毛边：边缘左边是墙，右边是原图的毛；边缘 1 像素稍暗（和右侧真实毛边一样），不画深色描边
art_f = art.astype(np.float32)
fur = (yy >= EDGE_Y0) & (yy < EDGE_Y1) & (xx >= edge_x[:, None]) & (xx < 885) & ~art_velvet
wall_side = (yy >= EDGE_Y0) & (yy < EDGE_Y1) & (xx >= 826) & (xx < edge_x[:, None]) & ~art_velvet
# 耳机罩底部那几行：原图里罩子本身就在这里，保持原样
cup_bottom = ((xx - 852) / 24.0) ** 2 + ((yy - 663) / 31.0) ** 2 < 1
fur &= ~cup_bottom
wall_side &= ~cup_bottom
first = fur & ~np.roll(fur, 1, axis=1)
second = fur & np.roll(first, 1, axis=1)
body = art_f.copy()
body[first] *= 0.86
body[second] *= 0.95
fixed = np.where(fur[..., None], body, fixed)
soft_wall = cv2.GaussianBlur(wall_side.astype(np.float32), (0, 0), 0.8)[..., None] * (~fur)[..., None]
fixed = fixed * (1 - soft_wall) + filled * soft_wall
# 手臂留下的痕迹：耳机罩下方手臂和身体的接缝（一道深色斜线），身体底部手臂投下的灰紫阴影。
# 手臂已经不在，这些地方本来都是毛：用周围的毛补（Telea 修补，半径小，只在毛里取色）
fb, fg, fr = fixed[..., 0], fixed[..., 1], fixed[..., 2]
flum = (fb + fg + fr) / 3
zone = fur & (xx >= 852) & (xx < 895) & (yy >= 684) & (yy < 738) & ~dilate(art_velvet, 3) & ~dilate(cup_bottom, 3)
marks = zone & ((flum < 138) | (fb > fr - 60))
# 耳机罩下方那道接缝斜线：(858,694) → (870,685)
px, py = xx - 858.0, yy - 694.0
t = np.clip((px * 12 - py * 9) / (12 * 12 + 9 * 9), 0, 1)
seam = np.hypot(px - 12 * t, py + 9 * t) < 1.6
cup_px = (ab > ar - 20)
seam_zone = fur & (yy >= 680) & (yy < 700) & ~dilate(cup_px, 3)
marks = dilate(marks, 3) & zone | (dilate(seam, 3) & seam_zone)
zone = zone | seam_zone
fixed8 = np.clip(fixed, 0, 255).astype(np.uint8)
# 修补时把墙和丝绒当成“未知”之外的已知色会被拉进来：先把区域外的非毛像素临时涂成毛色
guide = fixed8.copy()
fur_mean = fixed8[zone & ~marks].mean(axis=0)
guide[~fur & dilate(zone, 9)] = fur_mean.astype(np.uint8)
patched = cv2.inpaint(guide, (marks * 255).astype(np.uint8), 3, cv2.INPAINT_TELEA).astype(np.float32)
# 补上一点毛的细纹理
fur_patch = fixed[700:720, 870:900]
fur_tex = fur_patch - cv2.GaussianBlur(fur_patch, (0, 0), 2)
tex = np.tile(fur_tex, (h // 20 + 1, w // 30 + 1, 1))[:h, :w]
patched = np.clip(patched + tex * 0.9, 0, 255)
a_marks = cv2.GaussianBlur(marks.astype(np.float32), (0, 0), 0.9)[..., None] * zone[..., None]
fixed = fixed * (1 - a_marks) + patched * a_marks
print("marks", int(marks.sum()))
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

# 牵手时的右臂小图：往身体里多带一段原图像素（到 x = 874），盖过上面新长出来的毛边，接合处不露线
base_arm = cv2.imread("out/arm-right-base.png", cv2.IMREAD_UNCHANGED)
bx, by, bw, bh = json.load(open("out/layout.json"))["arm-right-base"] if "arm-right-base" in json.load(open("out/layout.json")) else (784, 684, 76, 59)
alpha = np.zeros((h, w), np.float32)
alpha[by:by + bh, bx:bx + bw] = base_arm[..., 3] / 255.0
cover = (yy >= EDGE_Y0 - 2) & (yy < EDGE_Y1) & (xx >= bx) & (xx < 874) & ~art_velvet & ~(ab > ar - 20)
cover &= dilate(alpha > 0.5, 25)
cover_a = cv2.GaussianBlur(cover.astype(np.float32), (0, 0), 1.2)
cover_a = np.where(xx < 874, np.where(cover, 1.0, cover_a * (xx < 870)), 0) * ~art_velvet
alpha = np.maximum(alpha, cover_a.astype(np.float32))
ys, xs = np.where(alpha > 0.02)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
rgba = cv2.cvtColor(art[y0:y1, x0:x1], cv2.COLOR_BGR2BGRA)
rgba[..., 3] = np.clip(alpha[y0:y1, x0:x1] * 255, 0, 255).astype(np.uint8)
cv2.imwrite("out/arm-right.png", rgba)
layout = json.load(open("out/layout.json"))
layout.setdefault("arm-right-base", [int(bx), int(by), int(bw), int(bh)])
layout["arm-right"] = [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]
json.dump(layout, open("out/layout.json", "w"), indent=2)
print("arm-right", layout["arm-right"])
