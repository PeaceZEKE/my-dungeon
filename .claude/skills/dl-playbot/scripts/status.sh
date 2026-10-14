#!/usr/bin/env bash
# dl-playbot · 묶음 진행 상황 — 끝난 수 · 실패 · 돌고 있는 run 의 마지막 진행 줄(층·사망·경과)
#
#   bash .claude/skills/dl-playbot/scripts/status.sh <결과 폴더>
set -u
OUT="${1:?결과 폴더}"
alive=no; [ -f "$OUT/batch.pid" ] && kill -0 "$(cat "$OUT/batch.pid")" 2>/dev/null && alive="yes(pid $(cat "$OUT/batch.pid"))"
nr=$(ls "$OUT"/runs/*.json 2>/dev/null | wc -l)
nf=$(grep -c " FAIL" "$OUT/done.txt" 2>/dev/null); nf=${nf:-0}
echo "묶음 실행 중: $alive · 결과 $nr 개 · 실패 $nf"
[ "$nf" -gt 0 ] && grep " FAIL" "$OUT/done.txt" | tail -5 | sed 's/^/  /'
for f in "$OUT"/pids/*; do [ -f "$f" ] || continue; n=$(basename "$f")
  last=$(grep -a '"floor"' "$OUT/logs/$n.log" 2>/dev/null | tail -1 | grep -o '"floor":[0-9]*\|"deaths":[0-9]*\|[0-9]*s$' | tr '\n' ' ')
  echo "  ▶ $n  $last"
done
# 마지막 묶음 기록에 TAINTED 가 있으면 알린다(없을 때 grep 이 1 · xargs 가 123 을 돌려 status.sh 가 실패로 끝나던 것을 막는다)
lastb="$(ls "$OUT"/batch-*.txt 2>/dev/null | tail -1)"
[ -n "$lastb" ] && grep -H TAINTED "$lastb" || true
