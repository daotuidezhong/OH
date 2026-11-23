# 第一步：去掉截图里烤进去的界面元素（票根、右上按钮、预览控制面板、聊天条）。
# 输出 step1.png（RGB），后续再去玩偶、挖银幕。
import cv2
import numpy as np

art = cv2.imread("art.png")
mask = np.zeros(art.shape[:2], np.uint8)


def rounded(x0, y0, x1, y1, r):
    cv2.rectangle(mask, (x0 + r, y0), (x1 - r, y1), 255, -1)
    cv2.rectangle(mask, (x0, y0 + r), (x1, y1 - r), 255, -1)
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        cv2.circle(mask, (cx, cy), r, 255, -1)


rounded(4, 70, 248, 172, 14)     # 票根（含两侧缺口）
rounded(1434, 70, 1558, 217, 14)  # 后退 / B站首页 / 放大银幕
rounded(4, 602, 170, 830, 14)     # 预览控制面板（应用里没有）
rounded(460, 856, 1110, 937, 18)  # 聊天条

# 面板是半透明叠在背景上的，周围一圈也被压暗了：多扩几像素
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
out = cv2.inpaint(art, mask, 9, cv2.INPAINT_TELEA)
cv2.imwrite("step1.png", out)
cv2.imwrite("mask-ui.png", mask)
print("ui pixels", int((mask > 0).sum()))

# 预览面板那块在应用里会露出来：用右侧同一高度的镜像（幕布下摆 + 走道灯）填，边缘羽化融合
art_f = art.astype(np.float32)
mirror = art_f[:, ::-1]
panel = np.zeros(art.shape[:2], np.float32)
cv2.rectangle(panel, (0, 596), (152, 834), 1.0, -1)
panel = cv2.GaussianBlur(panel, (0, 0), 6)
panel *= (mask > 0).astype(np.float32) * 0.0 + 1.0
panel[:, 160:] = 0
out_f = out.astype(np.float32)
blend = out_f * (1 - panel[..., None]) + mirror * panel[..., None]
out = np.clip(blend, 0, 255).astype(np.uint8)
cv2.imwrite("step1.png", out)
