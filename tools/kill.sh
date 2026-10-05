#!/bin/bash
for p in $(ps -eo pid,args | grep -E "node tools/captur[e]|run-bg.s[h]|chrome-linux/chrom[e]" | awk '{print $1}'); do kill $p 2>/dev/null; done
echo killed
