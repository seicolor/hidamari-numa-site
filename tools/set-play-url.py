#!/usr/bin/env python3
"""ゲームの公開先URLを差しかえる: index.html の「沼へ行く」リンクとQRコードを更新する。
  python3 tools/set-play-url.py https://example.com/hidamari-numa/"""
import os, re, sys, segno
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = sys.argv[1]
p = os.path.join(ROOT, 'index.html'); h = open(p, encoding='utf-8').read()
h = re.sub(r'(<a class="btn btn-big" data-play href=")[^"]*(")', r'\g<1>' + url + r'\g<2>', h)
open(p, 'w', encoding='utf-8').write(h)
segno.make(url, error='m').save(os.path.join(ROOT, 'assets/img/qr.svg'), scale=1, border=1, dark='#17231e', light=None, xmldecl=False, svgns=True, nl=False, omitsize=True)
print('updated:', url)
