#!/usr/bin/env python3
"""撮影した素材 (assets/_raw) を、サイト用の WebP / JPEG に変換する。
  python3 tools/optimize.py            … あるものだけ変換
  python3 tools/optimize.py --placeholder  … 無いものは、仮の絵で埋める（レイアウト確認用。公開前に必ず本物へ）"""
import os, sys, json
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets/_raw'); OUT = os.path.join(ROOT, 'assets/img')
os.makedirs(OUT, exist_ok=True)
PLACE = '--placeholder' in sys.argv
MARK = os.path.join(OUT, '_placeholders.json')
placed = json.load(open(MARK)) if os.path.exists(MARK) else []

SCENES = {  # 生の名前: (サイトでの名前, 幅の一覧)
    'spring_day': ('spring-day', [1000, 1400, 2000]), 'summer_day': ('summer-day', [1000, 1400, 2000]),
    'autumn_day': ('autumn-day', [1000, 1400, 2000]), 'winter_day': ('winter-day', [1000, 1400, 2000]),
    'night_float': ('float-night', [800, 1400]), 'hand_funa': ('hand-funa', [800, 1400]), 'rain_pond': ('rain-pond', [800, 1400]),
    'rainbow': ('rainbow', [700, 1000, 1500]), 'kingfisher': ('kingfisher', [700, 1000, 1500]), 'frog': ('frog', [700, 1000, 1500]),
    'cat_dusk': ('cat-dusk', [700, 1000, 1500]), 'neighbor': ('neighbor', [700, 1000, 1500]), 'boat_deep': ('boat-deep', [700, 1000, 1500]),
    'meteor': ('meteor', [700, 1000, 1500]), 'fireworks': ('fireworks', [700, 1000, 1500]),
}
FISH = ['funa', 'koi', 'tanago', 'imori', 'dojo', 'zarigani', 'namazu', 'nishiki', 'hibuna', 'unagi', 'herabuna', 'wakasagi', 'nushi', 'boot']
TINT = {'spring-day': (232, 180, 190), 'summer-day': (70, 150, 110), 'autumn-day': (200, 110, 50), 'winter-day': (170, 200, 220)}

def save(im, name, w, q=80, fmt='webp'):
    h = round(im.height * w / im.width)
    r = im.resize((w, h), Image.LANCZOS)
    p = os.path.join(OUT, f'{name}-{w}.{fmt}')
    if fmt == 'webp': r.save(p, 'WEBP', quality=q, method=6)
    else: r.convert('RGB').save(p, 'JPEG', quality=q, optimize=True, progressive=True)
    return p, os.path.getsize(p)

def placeholder(name, size=(2000, 1125), alpha=False):
    col = TINT.get(name, (60, 90, 80))
    im = Image.new('RGBA' if alpha else 'RGB', size, col + ((0,) if alpha else ()))
    if not alpha:
        d = ImageDraw.Draw(im)
        for y in range(size[1]):
            t = y / size[1]; d.line([(0, y), (size[0], y)], fill=tuple(int(c * (1.15 - 0.5 * t)) for c in col))
    return im

total = 0
for raw, (name, widths) in SCENES.items():
    p = os.path.join(RAW, raw + '.png')
    if os.path.exists(p):
        im = Image.open(p).convert('RGB')
        for w in widths: total += save(im, name, w, 78)[1]
        if name in placed: placed.remove(name)
    elif PLACE:
        im = placeholder(name)
        for w in widths: save(im, name, w, 60)
        if name not in placed: placed.append(name)
for fid in FISH:
    p = os.path.join(RAW, f'fish_{fid}.png')
    name = f'fish-{fid}'
    if os.path.exists(p):
        im = Image.open(p).convert('RGBA')
        for w in (600, 900): total += save(im, name, w, 86)[1]
        if name in placed: placed.remove(name)
    elif PLACE:
        im = placeholder(name, (1200, 750), True); d = ImageDraw.Draw(im); d.ellipse((150, 220, 1050, 520), fill=(230, 120, 60, 255))
        for w in (600, 900): save(im, name, w, 70)
        if name not in placed: placed.append(name)
for nm, fn in (('koi-shaded', 'koi_shaded'), ('koi-wire', 'koi_wire')):
    p = os.path.join(RAW, fn + '.png')
    if os.path.exists(p):
        im = Image.open(p).convert('RGBA'); total += save(im, nm, 1200, 86)[1]
        if nm in placed: placed.remove(nm)
    elif PLACE:
        im = placeholder(nm, (1200, 750), True); d = ImageDraw.Draw(im); d.ellipse((150, 220, 1050, 520), outline=(240, 240, 240, 255), width=3)
        save(im, nm, 1200, 70)
        if nm not in placed: placed.append(nm)
for fid in ('koi', 'nishiki', 'funa'):
    p = os.path.join(RAW, f'gyotaku_{fid}.png'); name = f'gyotaku-{fid}'
    if os.path.exists(p):
        im = Image.open(p).convert('RGB')
        for w in (700, 1100, 1600): total += save(im, name, w, 80)[1]
        if name in placed: placed.remove(name)
    elif PLACE:
        im = placeholder(name, (1600, 1000))
        for w in (700, 1100, 1600): save(im, name, w, 60)
        if name not in placed: placed.append(name)
# OGP 画像（1200x630）
for src in ('dawn_mist', 'dusk', 'autumn_day'):
    p = os.path.join(RAW, src + '.png')
    if os.path.exists(p):
        im = Image.open(p).convert('RGB'); w, h = im.size; ch = int(w * 630 / 1200); y0 = max(0, int(h * 0.38 - ch / 2))
        im.crop((0, y0, w, y0 + ch)).resize((1200, 630), Image.LANCZOS).save(os.path.join(OUT, 'og.jpg'), 'JPEG', quality=84, optimize=True, progressive=True)
        break
json.dump(placed, open(MARK, 'w'))
if not placed and os.path.exists(MARK): os.remove(MARK)
print('converted bytes', total // 1024, 'KB; placeholders:', placed)
