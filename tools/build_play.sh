#!/bin/sh
# ゲーム本体（fishing_inaka の series/hidamari-hama）を、このサイトの play/ に置く。
# 使いかた: sh tools/build_play.sh <fishing_inaka のフォルダ>
# play/?place=hama で浜から、play/?place=numa で沼から始まる（指定なしなら、釣り場をえらぶ画面）
set -eu
GAME="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/play"
rm -rf "$OUT"
mkdir -p "$OUT"
cp "$GAME/index.html" "$GAME/style.css" "$OUT/"
cp -R "$GAME/src" "$GAME/vendor" "$OUT/"
# 共有したときのカード（OGP）を、<title> のあとに入れる（ゲーム本体の index.html には入れない）
# アクセス解析（Google タグ）を <head> のすぐあとに
awk -v gt="$ROOT/tools/gtag.html" '{ print } /<head>/ { while ((getline l < gt) > 0) print l }' "$OUT/index.html" > "$OUT/index.html.tmp" && mv "$OUT/index.html.tmp" "$OUT/index.html"
awk -v og="$ROOT/tools/play-og.html" '{ print } /<\/title>/ { while ((getline l < og) > 0) print l }' "$OUT/index.html" > "$OUT/index.html.tmp" && mv "$OUT/index.html.tmp" "$OUT/index.html"
( cd "$GAME" && git rev-parse --short HEAD ) > "$OUT/VERSION" 2>/dev/null || true
echo "play/ を更新しました（$(cat "$OUT/VERSION" 2>/dev/null)）"
