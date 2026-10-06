#!/usr/bin/env python3
"""公開先のURLが決まったら、SNS共有用のメタ情報（canonical / og:url / og:image / X のカード）を index.html に書く。
何度実行しても同じ結果になる（前に書いたものは消してから書く）。
  python3 tools/set-site-url.py https://example.com/hidamari-numa-site/"""
import html, json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = sys.argv[1].rstrip('/') + '/'
img = url + 'assets/img/og.jpg'
w, h_ = Image.open(os.path.join(ROOT, 'assets/img/og.jpg')).size
alt = '秋の夕ぐれ、紅葉の森にかこまれた沼にウキを浮かべる、ゲームの画面'

p = os.path.join(ROOT, 'index.html')
h = open(p, encoding='utf-8').read()

def meta(attr, key):
    m = re.search(rf'<meta {attr}="{re.escape(key)}" content="([^"]*)">', h)
    return m.group(1) if m else ''

title, desc = meta('property', 'og:title'), meta('property', 'og:description')

# 前に書いたものを消す
h = re.sub(r'<link rel="canonical"[^>]*>\n?', '', h)
h = re.sub(r'<meta property="og:(url|site_name|image(:[a-z]+)?)"[^>]*>\n?', '', h)
h = re.sub(r'<meta name="twitter:(title|description|image(:alt)?)"[^>]*>\n?', '', h)

e = lambda s: html.escape(s, quote=True)
add = (
    f'<link rel="canonical" href="{url}">\n'
    f'<meta property="og:url" content="{url}">\n'
    f'<meta property="og:site_name" content="ひだまり沼">\n'
)
h = h.replace('<meta property="og:type"', add + '<meta property="og:type"', 1)
img_tags = (
    f'<meta property="og:image" content="{img}">\n'
    f'<meta property="og:image:type" content="image/jpeg">\n'
    f'<meta property="og:image:width" content="{w}">\n'
    f'<meta property="og:image:height" content="{h_}">\n'
    f'<meta property="og:image:alt" content="{e(alt)}">\n'
)
h = h.replace('<meta property="og:locale"', img_tags + '<meta property="og:locale"', 1)
tw = (
    f'<meta name="twitter:title" content="{title}">\n'
    f'<meta name="twitter:description" content="{desc}">\n'
    f'<meta name="twitter:image" content="{img}">\n'
    f'<meta name="twitter:image:alt" content="{e(alt)}">\n'
)
h = re.sub(r'(<meta name="twitter:card"[^>]*>\n)', lambda m: m.group(1) + tw, h, count=1)

# 構造化データ（JSON-LD）にも、URL と画像を入れる
def ld(m):
    d = json.loads(m.group(2))
    d['url'] = url
    d['image'] = img
    return m.group(1) + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + m.group(3)
h = re.sub(r'(<script type="application/ld\+json">\n?)(.*?)(\n?</script>)', ld, h, count=1, flags=re.S)

open(p, 'w', encoding='utf-8').write(h)
print('updated:', url)
