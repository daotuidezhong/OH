# 第二步：从参考图里把两只玩偶、两条牵着的手臂、爱心分出来（按颜色分割 + 位置约束）。
import cv2
import numpy as np

art = cv2.imread("art.png")
h, w = art.shape[:2]
b, g, r = [art[..., i].astype(np.int32) for i in range(3)]
lum = (r + g + b) / 3
yy, xx = np.mgrid[0:h, 0:w]

# 玩偶区域（参考图坐标）：两只玩偶 + 中间的手和爱心，椅背上沿以上
region = (xx >= 555) & (xx <= 1025) & (yy >= 565) & (yy <= 738)
# 两侧格子毯、中间小桌上的爆米花和饮料不是玩偶
region &= ~((xx < 578) & (yy > 712))
region &= ~((xx > 990) & (yy > 690))
region &= ~((xx > 740) & (xx < 835) & (yy > 728))

cream = (lum > 118) & (r > 150)                      # 奶油色、白色毛绒（含阴影面）
pink = (r > 170) & (g < 150) & (b > 110) & (r - g > 50)  # 蝴蝶结、项圈、爱心
blue = (b > r + 12) & (b > 90)                       # 耳机
gold = (r > 200) & (g > 160) & (b < 120)             # 耳机上的星星
chair = (r > g * 2.0) & (lum < 120) & ~pink           # 红丝绒椅背
seed = (cream | pink | blue | gold) & region & ~chair

mask = seed.astype(np.uint8) * 255
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
# 填洞
filled = mask.copy()
flood = np.zeros((h + 2, w + 2), np.uint8)
cv2.floodFill(filled, flood, (0, 0), 255)
mask = mask | cv2.bitwise_not(filled)
# 只留大块（去掉零星噪点）
count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
keep = np.zeros_like(mask)
for index in range(1, count):
    if stats[index, cv2.CC_STAT_AREA] > 300:
        keep[labels == index] = 255
mask = keep
# 往外扩 2 像素吃进深色描边，但不吃进椅背
grown = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
mask = np.where(chair & (mask == 0), 0, grown).astype(np.uint8)
mask[~region] = 0

# 每一列从上往下找红丝绒椅背的上沿，玩偶只留在它上面（椅背在玩偶前面）
velvet = (r > 115) & (r > g * 1.9) & (lum > 55) & (lum < 150) & (g < 110)
chair_top = np.full(w, h, np.int32)
for x in list(range(555, 760)) + list(range(833, 1026)):  # 中间小桌那段没有椅背
    column = velvet[690:745, x]
    for offset in range(column.size - 3):
        if column[offset:offset + 4].all():
            chair_top[x] = 690 + offset
            break
# 左椅背上沿压着粉色玩偶的粉色项圈，颜色接近红丝绒会被误判：两张椅子对称（轴 x = 792），用右椅背的上沿镜像
AXIS = 792
for x in range(555, 760):
    mirror_x = 2 * AXIS - x
    if 833 <= mirror_x <= 1025 and chair_top[mirror_x] < h:
        chair_top[x] = chair_top[mirror_x]
# 粉色项圈（带白点）补进玩偶
collar = (xx >= 585) & (xx <= 725) & (yy >= 690) & (r > 140) & (r - g > 35) & (b > g) & (lum > 80)
mask[collar & region] = 255
for x in range(555, 1026):
    mask[chair_top[x]:, x] = 0
np.save("chair_top.npy", chair_top)

cv2.imwrite("mask-dolls.png", mask)
overlay = art.copy()
overlay[mask > 0] = (overlay[mask > 0] * 0.4 + np.array([0, 255, 0]) * 0.6).astype(np.uint8)
cv2.imwrite("z-seg.png", cv2.resize(overlay[540:760, 540:1050], None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))
count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
for index in range(1, count):
    x, y, ww, hh, area = stats[index]
    print("component", index, "box", (x, y, x + ww, y + hh), "area", area)
