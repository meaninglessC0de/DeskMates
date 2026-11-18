#!/bin/bash
# master the mix to -16 LUFS (two-pass loudnorm), fade the last 2 s, mux with the silent render, make the preview.
set -e
cd "$(dirname "$0")/../out"
J=$(ffmpeg -hide_banner -i mix.wav -af loudnorm=I=-16:TP=-2.0:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
IL=$(echo "$J" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_i'])")
TP=$(echo "$J" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_tp'])")
LR=$(echo "$J" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_lra'])")
TH=$(echo "$J" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_thresh'])")
OF=$(echo "$J" | python3 -c "import json,sys;print(json.load(sys.stdin)['target_offset'])")
ffmpeg -v error -y -i mix.wav -af "loudnorm=I=-16:TP=-2.0:LRA=11:measured_I=$IL:measured_TP=$TP:measured_LRA=$LR:measured_thresh=$TH:offset=$OF:linear=true,afade=t=out:st=133.2:d=2:curve=qsin" -ar 48000 master.wav
ffmpeg -v error -y -i silent.mp4 -i master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest deskmates-golden6.mp4
ffmpeg -v error -y -i deskmates-golden6.mp4 -c:v libx264 -b:v 1500k -maxrate 1800k -bufsize 3600k -preset slow -vf scale=1280:720 -c:a aac -b:a 96k -movflags +faststart deskmates-golden6-preview.mp4
ffmpeg -hide_banner -i deskmates-golden6.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -12
ls -la deskmates-golden6*.mp4
