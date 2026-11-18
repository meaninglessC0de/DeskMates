#!/bin/bash
# fade, two-pass loudnorm to -16 LUFS, mux, preview
set -e
cd "$(dirname "$0")/../../.."
P=public/agents/C
ffmpeg -v error -y -i $P/mix_raw.wav -af "afade=t=in:st=0:d=0.6,afade=t=out:st=118:d=2" $P/mix_faded.wav
J=$(ffmpeg -hide_banner -y -i $P/mix_faded.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i $P/mix_faded.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" -ar 48000 $P/mix.wav
ffmpeg -v error -y -i agents/C/out/video_silent.mp4 -i $P/mix.wav -c:v copy -c:a aac -b:a 256k -shortest agents/C/out/deskmates-C.mp4
ffmpeg -v error -y -i agents/C/out/deskmates-C.mp4 -vf scale=1280:720 -c:v libx264 -b:v 1400k -maxrate 1700k -bufsize 3000k -preset slow -c:a aac -b:a 96k agents/C/out/deskmates-C-preview.mp4
ls -la agents/C/out
ffmpeg -hide_banner -i agents/C/out/deskmates-C.mp4 -af ebur128 -f null - 2>&1 | grep -A3 "Integrated loudness"
