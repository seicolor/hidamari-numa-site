#!/usr/bin/env python3
"""公開先のURLが決まったら、SNS共有用のメタ情報（canonical / og:url / og:image）を index.html に書く。
  python3 tools/set-site-url.py https://example.com/hidamari-numa-site/"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = sys.argv[1].rstrip('/') + '/'
p = os.path.join(ROOT, 'index.html'); h = open(p, encoding='utf-8').read()
h = re.sub(r'<link rel="canonical"[^>]*>\n?|<meta property="og:url"[^>]*>\n?|<meta property="og:image"[^>]*>\n?', '', h)
add = f'<link rel="canonical" href="{url}">\n<meta property="og:url" content="{url}">\n<meta property="og:image" content="{url}assets/img/og.jpg">\n'
h = h.replace('<meta property="og:type"', add + '<meta property="og:type"', 1)
open(p, 'w', encoding='utf-8').write(h)
print('updated:', url)
