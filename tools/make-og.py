#!/usr/bin/env python3
"""SNS で共有したときの画像（1200x630）をつくる。ゲームの実画面に、題字をのせる。"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets/_raw'); FONT = os.path.join(ROOT, 'assets/fonts-src/ShipporiMincho-Medium.ttf')
src = next((os.path.join(RAW, n + '.png') for n in ('autumn_day', 'dawn_mist', 'dusk') if os.path.exists(os.path.join(RAW, n + '.png'))), None)
im = Image.open(src).convert('RGB')
w, h = im.size; ch = int(w * 630 / 1200); y0 = max(0, int(h * 0.42 - ch / 2))
im = im.crop((0, y0, w, y0 + ch)).resize((1200, 630), Image.LANCZOS)
# 左から暗くして、文字を読みやすく
ov = Image.new('RGBA', (1200, 630), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
for x in range(1200):
    a = int(185 * max(0, 1 - x / 880) ** 1.4); d.line([(x, 0), (x, 630)], fill=(8, 18, 15, a))
im = Image.alpha_composite(im.convert('RGBA'), ov)
d = ImageDraw.Draw(im)
f_big = ImageFont.truetype(FONT, 150); f_mid = ImageFont.truetype(FONT, 40); f_small = ImageFont.truetype(FONT, 26)
cream = (246, 240, 226, 255)
d.text((84, 190), 'ひだまり沼', font=f_big, fill=cream)
d.line([(88, 392), (168, 392)], fill=(240, 160, 90, 255), width=3)
d.text((86, 416), '一日、沼のほとりで。', font=f_mid, fill=cream)
d.text((88, 480), 'のんびり田舎釣りゲーム　―　ブラウザで遊べます', font=f_small, fill=(246, 240, 226, 190))
im.convert('RGB').save(os.path.join(ROOT, 'assets/img/og.jpg'), 'JPEG', quality=86, optimize=True, progressive=True)
print('og.jpg from', os.path.basename(src))
