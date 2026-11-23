# 第三步：生成放映厅素材（全部来自参考图，坐标与参考图一一对应）。
#   room.png       房间：去掉界面元素、粉色玩偶（TA）、两条牵手的手臂、爱心；银幕挖空（透明）。
#                  白色玩偶（我）一直在场，保留在房间图里，只擦掉它伸出去的手臂。
#   doll-left.png  粉色蝴蝶结玩偶（TA）——连同周围一圈原图像素，叠上去和原图完全一致
#   arm-left.png / arm-right.png  牵手时伸向中间的手臂（同样带一圈原图像素）
#   heart.png      爱心和光芒
#   layout.json    每张小图在参考图里的位置、银幕位置
import json

import cv2
import numpy as np

SCREEN = (432, 100, 703, 401)  # x, y, w, h：银幕内框，B站画面贴在这里
SPLIT_X = 790                   # 两只爪子相碰的位置
AXIS = 792                      # 两张椅子的对称轴
HEART_BOX = (732, 574, 850, 676)

step1 = cv2.imread("step1.png")          # 已去掉界面元素
art = cv2.imread("art.png")              # 原图（用来切小图）
mask = cv2.imread("mask-dolls.png", 0) > 0
chair_top = np.load("chair_top.npy")
h, w = mask.shape
yy, xx = np.mgrid[0:h, 0:w]
bgr = step1.astype(np.int32)
sb, sg, sr = bgr[..., 0], bgr[..., 1], bgr[..., 2]
lum = (sr + sg + sb) / 3


def dilate(region, size):
    return cv2.dilate(region.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))) > 0


# ---------- 分出各部分 ----------
count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
heart_shape = np.zeros_like(mask)
x0, y0, x1, y1 = HEART_BOX
for index in range(1, count):
    bx, by, bw, bh, area = stats[index]
    if area < 50:
        mask[labels == index] = False
    elif bx >= x0 and by >= y0 and bx + bw <= x1 and by + bh <= y1:
        heart_shape |= labels == index
dolls = mask & ~heart_shape

left_all = dolls & (xx < SPLIT_X)
right_all = dolls & (xx >= SPLIT_X)
blue = (art[..., 0].astype(np.int32) > art[..., 2].astype(np.int32) + 12) & (art[..., 0] > 90)
ear = ((xx - 728) / 31.0) ** 2 + ((yy - 676) / 42.0) ** 2 < 1      # 粉色玩偶右耳
cup = ((xx - 852) / 24.0) ** 2 + ((yy - 663) / 31.0) ** 2 < 1      # 白色玩偶左边耳机罩
body_edge = 846 + 4 * ((yy - 712) / 25.0) ** 2                       # 白色玩偶身体左缘
left_keep = left_all & (ear | (xx < 712) | (yy < 686))
right_keep = right_all & ((xx >= body_edge) | cup | blue | (yy < 686))
left_arm = left_all & ~left_keep
right_arm = right_all & ~right_keep

below_chair = yy >= chair_top[None, :]
chair_rim = (yy >= 700) & (sr > 120) & (sr > sg * 1.6) & ~dolls
# 格子毯只按毯子本身的颜色保护（浅色 / 红白格），旁边玩偶的深色描边可以擦掉
blankets = (yy >= 690) & ((xx < 600) | (xx > 985)) & ~dolls & ((lum > 110) | ((sr > 150) & (sr > sg * 1.5)))
protect = chair_rim | blankets | (below_chair & ~dolls)

# ---------- 要擦掉的区域（都带一圈“光晕”，避免留下轮廓痕迹） ----------
heart_area = (((xx - 791) ** 2 + (yy - 624) ** 2) < 54 ** 2) & ~dilate(dolls, 3)
region_left = dilate(left_keep, 13) & ~protect & ~dilate(right_keep, 3)
# 粉色玩偶下沿的深色描边压在左椅背上沿几个像素：一起擦掉，后面用右椅背镜像补
outline_on_rim = dilate(left_keep, 9) & below_chair & (yy < chair_top[None, :] + 7) & (lum < 75) & (xx < 770)
region_left |= outline_on_rim
region_arm_left = dilate(left_arm, 11) & ~protect & ~dilate(right_keep, 3)
region_arm_right = dilate(right_arm, 11) & ~right_keep & ~protect & ~dilate(left_keep, 3)
# 手臂收起后，白色玩偶身体左缘要有一圈描边：这一圈也算进右臂区域，牵手时用原图像素盖回去
edge_band = right_keep & dilate(region_arm_right, 11) & ~cup & ~blue
erase = region_left | region_arm_left | region_arm_right | heart_area
rim_band = (xx >= 568) & (xx <= 760) & (chair_top[None, :] < 800) & (yy >= chair_top[None, :] - 9) & (yy < chair_top[None, :]) & ~blankets & ~dilate(right_keep, 3)
erase |= rim_band
region_left |= rim_band

# ---------- 补背景 ----------
src = step1.astype(np.float32)
# 1) 椅背上沿以下（被粉色项圈压着的那段椅背）：用右椅背镜像
mirrored = src.copy()
for x in range(560, 770):
    mirrored[:, x] = src[:, 2 * AXIS - x]
from_mirror = erase & below_chair & (xx >= 605) & (xx < 770)
# 最左一小段（x 570–605）镜像会落到格子毯上；那里原本被粉色项圈压出一个小凹口（上沿偏低几像素）。
# 用这一列自己的椅背像素整体上移凹口的深度来填平，不从别处借颜色。
left_edge_x = 566
while chair_top[left_edge_x] >= 800 and left_edge_x < 600:
    left_edge_x += 1
for x in range(570, 606):
    if chair_top[left_edge_x] < 800:
        t = (x - left_edge_x) / (612 - left_edge_x)
        target = int(round(chair_top[left_edge_x] * (1 - t) + chair_top[612] * t))
    else:
        target = chair_top[612]
    depth = chair_top[x] - target
    if depth <= 0 or depth > 10:
        continue
    for y in range(target, chair_top[x] + 12):
        if not blankets[y, x]:
            mirrored[y, x] = src[y + depth, x]
            erase[y, x] = True
            from_mirror[y, x] = True
    for y in range(target - 9, target):
        if not blankets[y, x]:
            erase[y, x] = True

# 2) 墙面：只沿水平方向做归一化卷积，保住墙上横向的线脚和上下明暗；离得远的地方逐级放大半径
# 椅子、玩偶的深色描边不算墙（会被横向拉成一条黑线）
wall = ~erase & ~protect & (lum < 105) & (lum > 32) & ~((sr > 115) & (sr > sg * 1.9)) & (yy < 745) & ~dilate(protect, 5)
# 耳机罩、格子毯的蓝色不能当成墙色（会被横向拉成一条浅紫带）
wall &= ~dilate(dolls, 9) & ~(sb > sr + 5) & ~dilate(blankets, 7)
weight = wall.astype(np.float32)
smooth = None
for sigma_x in (260, 130, 60, 28):
    num = cv2.GaussianBlur(src * weight[..., None], (0, 0), sigmaX=sigma_x, sigmaY=4)
    den = cv2.GaussianBlur(weight, (0, 0), sigmaX=sigma_x, sigmaY=4)[..., None]
    estimate = num / np.maximum(den, 1e-6)
    confidence = np.clip(den / 0.2, 0, 1)
    smooth = estimate if smooth is None else smooth * (1 - confidence) + estimate * confidence
# 墙面细纹理从附近一块干净墙面借来
patch = src[600:700, 430:530]
texture = patch - cv2.GaussianBlur(patch, (0, 0), 3)
tile = np.tile(texture, (h // 100 + 1, w // 100 + 1, 1))[:h, :w]
filled = np.clip(smooth + tile * 0.8, 0, 255)
filled = np.where(from_mirror[..., None], mirrored, filled)
soft = cv2.GaussianBlur(erase.astype(np.float32), (0, 0), 1.6)[..., None]
plate = src * (1 - soft) + filled * soft
# 3) 白色玩偶身体左缘：原本被手臂挡住，补一圈和毛绒描边一样的暖棕色线
outline = edge_band & ~dilate(~right_keep & ~region_arm_right, 1)
outline_color = np.array([62, 84, 140], np.float32)  # BGR
# 离新边缘越近越暗一点，让切开处看起来是圆润的身体侧面，而不是一个平面
distance = cv2.distanceTransform(right_keep.astype(np.uint8), cv2.DIST_L2, 3)
shade = np.clip(distance / 9.0, 0, 1) * 0.22 + 0.78
shade_area = edge_band & (distance < 9)
plate[shade_area] = plate[shade_area] * shade[shade_area][:, None]
plate[outline] = plate[outline] * 0.45 + outline_color * 0.55
# 两种补法在 x ≈ 605 交界：横向轻微模糊几列，消掉接缝
seam = plate[700:750, 596:616].copy()
plate[700:750, 598:614] = cv2.GaussianBlur(seam, (0, 0), sigmaX=2.2, sigmaY=0.6)[:, 2:18]
plate = np.clip(plate, 0, 255).astype(np.uint8)

room = cv2.cvtColor(plate, cv2.COLOR_BGR2BGRA)
sx, sy, sw, sh = SCREEN
room[sy:sy + sh, sx:sx + sw, 3] = 0
cv2.imwrite("out/room.png", room)
cv2.imwrite("out/room-preview.jpg", plate)


# ---------- 小图：原图像素 + 外圈羽化 ----------
def sprite(region, exclude=None):
    alpha = cv2.GaussianBlur(region.astype(np.float32), (0, 0), 1.2)
    alpha = np.where(dilate(region, 3), alpha, 0)
    if exclude is not None:
        alpha *= 1 - cv2.GaussianBlur(exclude.astype(np.float32), (0, 0), 1.0)
    ys, xs = np.where(alpha > 0.02)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = cv2.cvtColor(art[by0:by1, bx0:bx1], cv2.COLOR_BGR2BGRA)
    rgba[..., 3] = np.clip(alpha[by0:by1, bx0:bx1] * 255, 0, 255).astype(np.uint8)
    return rgba, [int(bx0), int(by0), int(bx1 - bx0), int(by1 - by0)]


layout = {"size": [w, h], "screen": list(SCREEN)}
for name, region, exclude in (
    ("doll-left", region_left, dilate(left_arm, 5)),       # 收手时，手臂那块露出补好的背景
    ("arm-left", region_arm_left, None),
    ("arm-right", region_arm_right | edge_band, None),
    ("heart", heart_area, None),
):
    image, box = sprite(region, exclude)
    cv2.imwrite(f"out/{name}.png", image)
    layout[name] = box

json.dump(layout, open("out/layout.json", "w"), indent=2)
print(json.dumps(layout))
