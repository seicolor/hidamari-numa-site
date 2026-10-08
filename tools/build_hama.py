# ひだまり浜のページを組む: ゲームから撮った画面（raw/）を webp にして hama/img/ へ、魚のカードを hama/index.html に入れる
# 使いかた: python3 tools/build_hama.py <raw のフォルダ>
import sys, os, json, html
from PIL import Image

RAW = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'hama', 'img')
os.makedirs(os.path.join(IMG, 'fish'), exist_ok=True)

def webp(src, name, widths, q=80):
    im = Image.open(os.path.join(RAW, src)).convert('RGB')
    for w in widths:
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(os.path.join(IMG, f'{name}-{w}.webp'), 'WEBP', quality=q, method=6)

for n in ['view-dusk', 'view-noon', 'view-morning', 'view-night', 'view-rain', 'view-beach', 'view-sunset-beach', 'tank']:
    if os.path.exists(os.path.join(RAW, n + '.png')):
        webp(n + '.png', n, [1000, 1600])
webp('map.png', 'map', [1000], q=86)

# SNS 用（1200×630）
def og(src, out):
    im = Image.open(os.path.join(RAW, src)).convert('RGB')
    w, h = im.size
    ch = round(w * 630 / 1200)
    top = max(0, min(h - ch, round((h - ch) * 0.55)))
    im.crop((0, top, w, top + ch)).resize((1200, 630), Image.LANCZOS).save(out, 'JPEG', quality=86)
og('view-dusk.png', os.path.join(IMG, 'og.jpg'))
# series/og.jpg は、シリーズのページの見出し（地球儀と2つの釣り場）から別に作ったもの（ここでは上書きしない）

# 魚
sp = json.load(open(os.path.join(RAW, 'species.json')))
order = ['aholehole', 'himeSuzume', 'kiiroHagi', 'muramasa', 'hashinaga', 'tsunodashi', 'potter', 'hifuki', 'uhu', 'papio', 'nushi', 'boot']
cards = []
for i, k in enumerate(order):
    s = sp[k]
    im = Image.open(os.path.join(RAW, f'fish-{k}.png')).convert('RGBA')
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    im.thumbnail((360, 240), Image.LANCZOS)
    im.save(os.path.join(IMG, 'fish', f'{k}.webp'), 'WEBP', quality=86, method=6)
    sents = [x + '。' for x in s['desc'].split('。') if x.strip()]
    desc = ''.join(sents[:2])
    legend = s['legend']
    name = '？？？　海のぬし' if legend else s['name']
    latin = '' if legend else s['latin']
    if legend:
        desc = '夜のにわか雨のとき、リーフの外から入り江の深みへ入ってくる、という話。'
    no = 'ぬし' if legend else ('おまけ' if s['junk'] else f'No.{i + 1:02d}')
    size = '' if legend else f"体長 {s['cm'][0]:g}〜{s['cm'][1]:g} cm" + ('' if s['junk'] else f"　{'★' * s['rarity']}")
    alt = '' if legend else f"{s['name']}の絵"
    cards.append(f"""      <li class="fcard rv{' secret' if legend else ''}">
        <div class="fcard-img"><img src="img/fish/{k}.webp" width="{im.width}" height="{im.height}" alt="{html.escape(alt)}" loading="lazy"></div>
        <p class="fcard-no">{no}</p>
        <h3>{html.escape(name).replace('エンゼルフィッシュ', '<wbr>エンゼルフィッシュ').replace('ムラサメモンガラ', 'ムラサメ<wbr>モンガラ')}</h3>
        {f'<p class="fcard-l" lang="la">{html.escape(latin)}</p>' if latin else ''}
        <p class="fcard-d">{html.escape(desc)}</p>
        {f'<p class="fcard-s">{size}</p>' if size else ''}
      </li>""")
tpl = open(os.path.join(ROOT, 'tools', 'hama.tpl.html'), encoding='utf-8').read()
open(os.path.join(ROOT, 'hama', 'index.html'), 'w', encoding='utf-8').write(tpl.replace('%%FISH%%', '\n'.join(cards)))
print('ok', len(cards))
