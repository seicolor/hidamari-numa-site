#!/usr/bin/env python3
"""ページで使う文字だけを書体から取り出して、小さな woff2 にする（書体は SIL OFL）。"""
import glob, os, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/fonts-src')
OUT = os.path.join(ROOT, 'assets/fonts'); os.makedirs(OUT, exist_ok=True)

text = ''
for pat in ['index.html', 'js/*.js', 'css/*.css']:
    for f in glob.glob(os.path.join(ROOT, pat)):
        text += open(f, encoding='utf-8').read()
# 動的に出る文字（釣った魚の数、時刻、季節など）
text += '0123456789:/.,-–—…・「」『』（）()[]!?！？。、 ' + '春夏秋冬朝昼夕夜' + ''.join(chr(c) for c in range(0x20, 0x7f))
text += 'ひだまり沼一日のほとりでAQuietfishinggamedrawnentirelyincode'
chars = sorted(set(text) - set('\n\r\t'))
print('unique chars:', len(chars))

def sub(src, dst, chars, flavor='woff2', layout=None):
    opts = subset.Options(); opts.flavor = flavor; opts.layout_features = layout or ['*']; opts.notdef_outline = True
    opts.name_IDs = [0, 1, 2, 3, 4, 6, 13, 14]; opts.hinting = False; opts.desubroutinize = True
    font = TTFont(src); s = subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(font)
    font.flavor = flavor; font.save(dst)
    print(os.path.basename(dst), os.path.getsize(dst) // 1024, 'KB')

for w, name in [(400, 'Regular'), (500, 'Medium'), (700, 'Bold')]:
    sub(os.path.join(SRC, f'ShipporiMincho-{name}.ttf'), os.path.join(OUT, f'shippori-mincho-{w}.woff2'), chars)

latin = [c for c in chars if ord(c) < 0x250 or c in '–—…·’‘“”']
sub(os.path.join(SRC, 'CormorantGaramond[wght].ttf'), os.path.join(OUT, 'cormorant-400.woff2'), latin)
sub(os.path.join(SRC, 'CormorantGaramond-Italic[wght].ttf'), os.path.join(OUT, 'cormorant-italic-400.woff2'), latin)
