#!/bin/sh
# Actual terminal captures are rendered first; no provider or tools are called here.
set -eu
ROOT=${1:?usage: assemble.sh ARTIFACT_DIRECTORY}
python3 "$(dirname "$0")/render.py" "$ROOT/live/terminal.cast" "$ROOT/pan-agent-live.mp4"
python3 "$(dirname "$0")/render.py" "$ROOT/live-replay-final/terminal.cast" "$ROOT/pan-agent-replay.mp4"
ffmpeg -y -loglevel error -i "$ROOT/pan-agent-live.mp4" -i "$ROOT/pan-agent-replay.mp4" \
  -filter_complex '[0:v]trim=end=27,setpts=PTS-STARTPTS[a];[a][1:v]concat=n=2:v=1:a=0[out]' \
  -map '[out]' -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart "$ROOT/pan-agent-demo.mp4"
