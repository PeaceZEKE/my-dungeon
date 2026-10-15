#!/bin/bash
# dl-crazygames-check · 미리보기 영상 이어 붙이기
#   bash trailer.sh <커버 이미지> <WxH> <출력.mp4> <토막폴더:시작프레임:끝프레임>…
#   커버(첫 프레임 = 정지 커버 · 1.3초) → 토막들(0.25초 디졸브) → 커버(2.0초). 30fps · H.264 · 소리 트랙 없음.
#   토막 폴더는 trailer-seg.js 출력(f0000.jpg …). 예: w_a1:0:75 = 앞 2.5초만.
set -e
COV=$1; WH=$2; OUT=$3; shift 3; W=${WH%x*}; H=${WH#*x}
TMP=$(mktemp -d); trap 'rm -rf $TMP' EXIT
FPS=30; XF=0.25
ffmpeg -loglevel error -y -loop 1 -t 1.3 -i "$COV" -vf "scale=$W:$H:flags=lanczos,format=yuv420p,fps=$FPS" -c:v libx264 -crf 16 $TMP/c0.mp4
ffmpeg -loglevel error -y -loop 1 -t 2.0 -i "$COV" -vf "scale=$W:$H:flags=lanczos,format=yuv420p,fps=$FPS" -c:v libx264 -crf 16 $TMP/c9.mp4
i=1; LIST=($TMP/c0.mp4)
for s in "$@"; do
  IFS=: read D A B <<< "$s"; n=$((B - A + 1))
  ffmpeg -loglevel error -y -framerate $FPS -start_number $A -i "$D/f%04d.jpg" -frames:v $n -vf "scale=$W:$H:flags=lanczos,format=yuv420p" -c:v libx264 -crf 16 $TMP/s$i.mp4
  LIST+=($TMP/s$i.mp4); i=$((i+1))
done
LIST+=($TMP/c9.mp4)
# xfade 사슬 — 오프셋 = 앞까지 길이 합 − 디졸브 수 × XF
IN=(); FC=""; prev="0:v"; acc=0
for k in "${!LIST[@]}"; do IN+=(-i "${LIST[$k]}"); done
for k in $(seq 1 $((${#LIST[@]} - 1))); do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${LIST[$((k-1))]}")
  acc=$(python3 -c "print($acc + $d - $XF)")
  lab="v$k"; FC+="[$prev][$k:v]xfade=transition=fade:duration=$XF:offset=$acc[$lab];"; prev=$lab
done
ffmpeg -loglevel error -y "${IN[@]}" -filter_complex "${FC%;}" -map "[$prev]" -an -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -r $FPS -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
