"""把壁纸里的二次元女孩抠成透明底 PNG，做成桌面宠物挂件素材。

思路：
  1. 取壁纸视频的一帧（已经提取成 girl_src.png）
  2. 裁出"脸+上半身"区域
  3. 用四角颜色做背景色键（壁纸是纯色淡蓝），按颜色距离生成 alpha，边缘羽化
  4. 缩放到 360px 宽，输出 assets/pet/girl.png
"""
import os

import numpy as np
from PIL import Image, ImageFilter

SRC = r"C:\ts\tmp\girl_src.png"
OUT_DIR = r"C:\ts\assets\pet"
os.makedirs(OUT_DIR, exist_ok=True)

img = Image.open(SRC).convert("RGB")
w, h = img.size
print("src", w, h)

# 脸+上半身：以画面中间偏上为主
left = int(w * 0.10)
right = int(w * 0.90)
top = int(h * 0.06)
bottom = int(h * 0.72)
crop = img.crop((left, top, right, bottom))
cw, ch = crop.size
print("crop", cw, ch)

arr = np.asarray(crop).astype(np.float32)

# 背景色：取四角一圈的中位色
corners = np.concatenate([
    arr[0:20, 0:20].reshape(-1, 3),
    arr[0:20, -20:].reshape(-1, 3),
    arr[-20:, 0:20].reshape(-1, 3),
    arr[-20:, -20:].reshape(-1, 3),
])
bg = np.median(corners, axis=0)
print("bg color", bg)

dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
# 距离小 -> 背景，大 -> 人物；用软阈值过渡，避免生硬边缘
lo, hi = 18.0, 60.0
alpha = np.clip((dist - lo) / (hi - lo), 0.0, 1.0)

alpha_img = Image.fromarray((alpha * 255).astype(np.uint8), mode="L")
# 羽化 + 去掉孤立噪点
alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(1.2))
alpha_img = alpha_img.filter(ImageFilter.MedianFilter(3))

rgba = crop.convert("RGBA")
rgba.putalpha(alpha_img)

# 裁掉四周透明区域，缩到 360 宽
bbox = rgba.getbbox()
if bbox:
    rgba = rgba.crop(bbox)
target_w = 360
ratio = target_w / rgba.width
rgba = rgba.resize((target_w, max(1, int(rgba.height * ratio))), Image.LANCZOS)

out = os.path.join(OUT_DIR, "girl.png")
rgba.save(out, optimize=True)
print("wrote", out, rgba.size, round(os.path.getsize(out) / 1024, 1), "KB")
