# 第三步：生成放映厅素材（全部来自参考图，坐标与参考图一一对应）。
#   room.png        干净的房间：去掉界面元素、玩偶、手臂、爱心，银幕挖空（透明）
#   doll-left.png   粉色蝴蝶结玩偶（TA），不含内侧手臂
#   doll-right.png  戴蓝色耳机的玩偶（我），不含内侧手臂
#   arm-left.png / arm-right.png  内侧手臂（牵手时的姿势），绕肩膀旋转
#   heart.png       爱心和光芒
#   layout.json     每张素材在参考图里的位置、肩膀支点、银幕位置
import json

import cv2
import numpy as np

SCREEN = (432, 100, 703, 401)  # x, y, w, h：银幕内框，B站画面贴在这里
SPLIT_X = 790                   # 两只爪子相碰的位置
HEART_BOX = (732, 574, 850, 676)

step1 = cv2.imread("step1.png")
art = cv2.imread("art.png")
mask = cv2.imread("mask-dolls.png", 0) > 0
h, w = mask.shape
yy, xx = np.mgrid[0:h, 0:w]

# 小噪点（单像素连通块）去掉
count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
for index in range(1, count):
    if stats[index, cv2.CC_STAT_AREA] < 50:
        mask[labels == index] = False

# 爱心是框内的一小块独立连通区域；框里的玩偶边缘（耳朵、耳机罩）仍属于玩偶
x0, y0, x1, y1 = HEART_BOX
count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
heart_shape = np.zeros_like(mask)
for index in range(1, count):
    bx, by, bw, bh, area = stats[index]
    if bx >= x0 and by >= y0 and bx + bw <= x1 and by + bh <= y1:
        heart_shape |= labels == index
dolls = mask & ~heart_shape
# 光芒细线没有被分割进来，整圈都算爱心区域（只用于擦干净房间），但不含玩偶像素
heart_area = (((xx - 791) ** 2 + (yy - 624) ** 2) < 54 ** 2) & ~cv2.dilate(dolls.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)

# ---------- 干净房间：只用周围真正的墙面像素做二维平滑插值（归一化卷积） ----------
src = step1.astype(np.float32)
sb, sg, sr = src[..., 0], src[..., 1], src[..., 2]
lum = (sr + sg + sb) / 3
chair_top = np.load("chair_top.npy")
below_chair = yy >= chair_top[None, :]
fill = cv2.dilate((dolls | heart_area).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))) > 0
# 椅背的丝绒上沿、两侧格子毯不属于玩偶，扩边时不能把它们抹掉
chair_rim = (yy >= 700) & (sr > 120) & (sr > sg * 1.6) & ~dolls
blankets = (yy >= 700) & ((xx < 600) | (xx > 985)) & ~dolls
fill &= ~(chair_rim | blankets | (below_chair & ~dolls))
wall = ~fill & (lum < 105) & ~((sr > 115) & (sr > sg * 1.9)) & ~below_chair & (yy < 745)
weight = wall.astype(np.float32)
# 多尺度：小半径保留局部明暗；离墙面太远（玩偶正中）就逐级用更大的半径
smooth = None
for sigma in (120, 60, 30, 16):
    num = cv2.GaussianBlur(src * weight[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(weight, (0, 0), sigma)[..., None]
    estimate = num / np.maximum(den, 1e-6)
    confidence = np.clip(den / 0.25, 0, 1)
    smooth = estimate if smooth is None else smooth * (1 - confidence) + estimate * confidence
# 原图墙面的细纹理（高频）从附近一块干净墙面借过来
patch = src[600:700, 430:530]
texture = patch - cv2.GaussianBlur(patch, (0, 0), 3)
tile = np.tile(texture, (h // 100 + 1, w // 100 + 1, 1))[:h, :w]
filled = np.clip(smooth + tile * 0.8, 0, 255)
# 边缘羽化，和原图自然衔接
soft = cv2.GaussianBlur(fill.astype(np.float32), (0, 0), 2.5)[..., None]
plate = np.clip(src * (1 - soft) + filled * soft, 0, 255).astype(np.uint8)

# 左椅背上沿原本被粉色玩偶的项圈压着：两张椅子左右对称（对称轴 x = 792），用右椅背上沿镜像补上
AXIS = 792
band = np.zeros((h, w), np.float32)
band[688:748, 604:752] = 1
band = cv2.GaussianBlur(band, (0, 0), 4) * (yy < 748)
mirrored = plate.copy()
for x in range(560, 770):
    mirrored[:, x] = plate[:, 2 * AXIS - x]
plate = np.clip(plate * (1 - band[..., None]) + mirrored * band[..., None], 0, 255).astype(np.uint8)

room = cv2.cvtColor(plate, cv2.COLOR_BGR2BGRA)
sx, sy, sw, sh = SCREEN
room[sy:sy + sh, sx:sx + sw, 3] = 0
cv2.imwrite("out/room.png", room)
cv2.imwrite("out/room-preview.jpg", plate)

# ---------- 玩偶与手臂 ----------
left_all = dolls & (xx < SPLIT_X)
right_all = dolls & (xx >= SPLIT_X)
# 按“要保留的部分”来切：手臂 = 玩偶 − 要保留的部分。两者拼回去正好等于原图。
blue = (art[..., 0].astype(np.int32) > art[..., 2].astype(np.int32) + 12) & (art[..., 0] > 90)
ear = ((xx - 728) / 31.0) ** 2 + ((yy - 676) / 42.0) ** 2 < 1      # 粉色玩偶右耳（对照网格拟合）
cup = ((xx - 852) / 27.0) ** 2 + ((yy - 664) / 33.0) ** 2 < 1      # 白色玩偶左边耳机罩
body_edge = 846 + 4 * ((yy - 712) / 25.0) ** 2                       # 白色玩偶身体左缘（微微外凸）
left_keep = left_all & (ear | (xx < 712) | (yy < 686))
right_keep = right_all & ((xx >= body_edge) | cup | blue | (yy < 686))
left_arm = left_all & ~left_keep
right_arm = right_all & ~right_keep
left_body = left_keep
right_body = right_keep.copy()

def sprite(region, source, fill_holes=None):
    """裁出 region 范围的 RGBA 小图；fill_holes 时把被手臂挡住的身体补上毛绒。"""
    ys, xs = np.where(region)
    bx0, by0, bx1, by1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
    crop = source[by0:by1, bx0:bx1].copy()
    alpha = region[by0:by1, bx0:bx1].astype(np.uint8) * 255
    if fill_holes is not None:
        # 只在原来手臂挡住身体的那一小块里补毛绒（不要把两只耳朵之间的空隙也填上）
        closed = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
        hx0, hy0, hx1, hy1 = fill_holes
        allowed = np.zeros_like(alpha)
        allowed[max(0, hy0 - by0):max(0, hy1 - by0), max(0, hx0 - bx0):max(0, hx1 - bx0)] = 255
        closed = np.where(allowed > 0, closed, alpha)
        missing = ((closed > 0) & (alpha == 0)).astype(np.uint8) * 255
        crop = cv2.inpaint(crop, missing, 6, cv2.INPAINT_TELEA)
        alpha = closed
    # 边缘 1 像素羽化，放大后不发硬
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.6)
    rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
    rgba[..., 3] = alpha
    return rgba, [int(bx0), int(by0), int(bx1 - bx0), int(by1 - by0)]


# 白色玩偶身体左缘原本被手臂盖着：沿新边缘描一圈和毛绒描边一样的深色线
art_outlined = art.copy()
edge_band = right_keep & ~cv2.erode(right_keep.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & (yy >= 690) & (xx < 870) & ~cup
art_outlined[edge_band] = (art_outlined[edge_band] * 0.45 + np.array([60, 80, 140]) * 0.55).astype(np.uint8)

layout = {"size": [w, h], "screen": list(SCREEN)}
# doll-right：牵手时用（和参考图完全一致）；doll-right-rest：手臂收起时用（身体左缘补了描边）
for name, region, holes, source in (("doll-left", left_body, None, art), ("doll-right", right_body, None, art), ("doll-right-rest", right_body, None, art_outlined), ("arm-left", left_arm, None, art), ("arm-right", right_arm, None, art)):
    image, box = sprite(region, source, holes)
    cv2.imwrite(f"out/{name}.png", image)
    layout[name] = box

# 手臂伸出的起点（参考图坐标）：牵手动画从这里往中间展开
layout["arm-left"].append([752, 712])
layout["arm-right"].append([842, 712])

# ---------- 爱心：和干净房间做差得到柔和的光晕透明度 ----------
diff = np.abs(art.astype(np.int32) - plate.astype(np.int32)).max(axis=2)
hx0, hy0, hx1, hy1 = HEART_BOX
alpha = np.clip((diff[hy0:hy1, hx0:hx1] - 6) * 4, 0, 255).astype(np.uint8)
# 只要爱心和光芒：限制在以爱心为中心的圆内，并去掉玩偶像素
ring = (((xx - 791) ** 2 + (yy - 624) ** 2) < 54 ** 2) & ~cv2.dilate(dolls.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
alpha = (alpha * ring[hy0:hy1, hx0:hx1]).astype(np.uint8)
heart = cv2.cvtColor(art[hy0:hy1, hx0:hx1], cv2.COLOR_BGR2BGRA)
heart[..., 3] = alpha
cv2.imwrite("out/heart.png", heart)
layout["heart"] = [hx0, hy0, hx1 - hx0, hy1 - hy0]

json.dump(layout, open("out/layout.json", "w"), indent=2)
print(json.dumps(layout))
