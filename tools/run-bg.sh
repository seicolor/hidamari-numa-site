#!/bin/bash
# 例: tools/run-bg.sh capture-scenes.mjs  → tools/_logs/capture-scenes.log に出力。終わると最後に "finished" と書く
cd "$(dirname "$0")/.."
mkdir -p tools/_logs
node "tools/$1" "${@:2}" > "tools/_logs/${1%.mjs}.log" 2>&1
echo finished >> "tools/_logs/${1%.mjs}.log"
