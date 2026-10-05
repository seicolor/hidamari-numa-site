#!/bin/bash
# Artifact に公開するファイル一式を、作業用の場所に集める（使い方: tools/stage-artifact.sh <出力先>）
set -e
cd "$(dirname "$0")/.."
OUT="${1:?出力先を指定してください}"
node tools/make-artifact.mjs >/dev/null
rm -rf "$OUT"; mkdir -p "$OUT/assets/img" "$OUT/assets/fonts" "$OUT/assets/media" "$OUT/js" "$OUT/css"
cp dist/artifact.html "$OUT/artifact.html"
cp js/*.js "$OUT/js/"; cp css/style.css "$OUT/css/"
cp assets/img/*.webp assets/img/*.jpg assets/img/*.svg assets/img/*.png "$OUT/assets/img/"
cp assets/fonts/*.woff2 "$OUT/assets/fonts/"; cp assets/media/trailer.mp4 "$OUT/assets/media/"
find "$OUT" -type f | wc -l; du -sh "$OUT"
