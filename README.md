# ひだまり沼 紹介ページ

のんびり田舎釣りゲーム「**ひだまり沼**」の紹介サイトです（ゲームも、このページも、AI の Claude がつくりました）。ビルドなし・ライブラリなしの静的サイト（ES Modules + 生の WebGL2）。

> コンセプトは「**一日、沼のほとりで**」。スクロールすると、朝 → 昼 → 夕 → 夜 → 夜明け と、沼の一日が進みます。

## 見どころ

| | |
| --- | --- |
| **背景の沼** | ひとつのフラグメントシェーダ。空・雲・星・月・山の森・古民家・水面・波紋・スイレン・花びら／落ち葉／雪を、画像なしで描画。時刻と季節は uniform で渡す |
| **一日の時計** | スクロール位置から時刻を決め、ナビの時計と空が連動（季節ごとに日の出・日の入りも変わる） |
| **ヒーローの釣り** | 水面をクリックして糸をたらし、ウキが沈んだらクリック。アタリの癖（ウキの動き・音・振動）は、ゲーム本体の数値そのまま。釣った魚は図鑑（localStorage）に残る |
| **魚拓** | 釣った魚を、和紙に墨で刷ったような画像にして保存（ゲームの `gyotaku.js` を移植） |
| **四季** | 4つの実画面を、水面の波紋のように円形のワイプで切りかえ。季節の印（春夏秋冬）でページ全体の色と背景も変わる |
| **夜** | 電気ウキ・ほたる・花火（2Dキャンバス）・流れ星 |
| **音** | ゲームと同じ Web Audio の合成（ファイルなし）。「音とともに／静かに」を入口で選ぶ。層ごとにオン・オフ |

## 動かす

```bash
python3 -m http.server 8000     # → http://localhost:8000
```

`file://` では動きません（ES Modules のため）。GitHub Pages にも、そのまま置けます。
画質を指定して確かめるには `?q=0|1|2`（シェーダの品質）と `&sc=0.5`（描画解像度の倍率）。

## 素材のつくりかた（`tools/`）

素材はすべて、ゲーム本体（`fishing_inaka`）から生成しています。Chromium（Playwright）と、ゲームのリポジトリが必要です。

```bash
node tools/build-species.mjs     # 魚種データ → js/species.js（ゲームの src/species.js から）
GAME_DIR=../fishing_inaka node tools/capture-scenes.mjs   # 実画面の撮影 → assets/_raw/*.png（時間がかかります）
GAME_DIR=../fishing_inaka node tools/capture-fish.mjs     # 魚・コイの骨組み・質感 → assets/_raw/
GAME_DIR=../fishing_inaka node tools/capture-fish.mjs gyotaku   # 魚拓
python3 tools/optimize.py        # → assets/img/*.webp（--placeholder で、無いものを仮の絵で埋める）
node tools/build.mjs             # 図鑑カード・できごとの並びを index.html に流しこむ
python3 tools/subset-fonts.py    # 使う文字だけの woff2（assets/fonts-src に TTF が必要）
python3 tools/set-play-url.py <ゲームのURL>   # 「沼へ行く」リンクとQRコードを差しかえ
python3 tools/set-site-url.py <このサイトのURL>   # 共有用のメタ情報（canonical / og:image）を書く
```

## つくり

```
index.html        … 本文（セマンティックな HTML。JS が無くても読める）
css/style.css     … 見た目（デザイントークン・レイアウト・レスポンシブ・動きをおさえる設定）
js/main.js        … 起動・毎フレームの進行
js/world.js       … 一日の進行役（スクロール→時刻・季節・空）
js/sky.js         … 空の色の表（ゲームの atmosphere.js を移植）
js/shaders.js     … 背景シェーダ
js/gl.js          … WebGL2 の設定・解像度の自動調整・波紋
js/fishing.js     … ヒーローの釣りあそび
js/bite.js        … ウキの動き（魚ごとのアタリの癖）と描画
js/cards.js       … 図鑑カード・横スクロール
js/night.js       … 夜（電気ウキ・ほたる・花火・流れ星）
js/scroll.js      … 固定セクション・視差・四季の切りかえ・時計
js/ui.js          … ナビ・モーダル・魚拓・コイの見くらべ・音の層
js/audio.js       … 音の合成（ゲームから移植）／ sound.js … ページ用の窓口
```

## アクセシビリティ・性能のこころがけ

- 入口で音のオン・オフを選べる。`prefers-reduced-motion` では、動きと遷移を最小にする
- キーボードで、釣り（水面ボタン→Enter）・図鑑・モーダル・季節の印・コイの見くらべを操作できる
- 背景の WebGL は、画面に見えているときだけ描画。フレーム時間を測って、描画解像度を自動で上下
- 書体は、使う文字だけを取り出した woff2。画像は WebP（`srcset`・遅延読み込み）

## 書体・ライセンス

- Shippori Mincho、Cormorant Garamond … SIL Open Font License 1.1（`assets/fonts/OFL.txt`）
- このリポジトリのコードと画像の利用条件は、公開する方（権利者）が決めてください。
