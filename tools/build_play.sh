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
( cd "$GAME" && git rev-parse --short HEAD ) > "$OUT/VERSION" 2>/dev/null || true
echo "play/ を更新しました（$(cat "$OUT/VERSION" 2>/dev/null)）"
