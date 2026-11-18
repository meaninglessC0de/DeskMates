#!/bin/bash
cd "$(dirname "$0")/../../.."
for i in 1 2 3 4; do
  node agents/C/tools/render.mjs video agents/C/out/video_silent.mp4 > agents/C/out/render.log 2>&1 && break
  echo "retry $i" >> agents/C/out/render.retries; sleep 5
done
echo finished >> agents/C/out/render.retries
