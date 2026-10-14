#!/usr/bin/env bash
# dl-playbot · 돌고 있는 묶음 끄기 — pid 파일로만 끈다(pkill -f 패턴 금지: CLAUDE.md '용병 2단계' 계측 함정 ② — 패턴이 자기 셸 명령줄에 걸려 exit 144)
#
#   bash .claude/skills/dl-playbot/scripts/stop.sh <결과 폴더>
#
# batch.sh 가 TERM 을 받으면 실행 중인 run(timeout → node → Chromium)에 TERM 을 넘기고 끝날 때까지 기다린다.
# 끝난 run 은 runs/ 에 남고 끊긴 run 은 결과가 없다 — 같은 명령으로 batch.sh 를 다시 부르면 남은 것만 이어 돈다.
set -u
OUT="${1:?결과 폴더}"
if [ -f "$OUT/batch.pid" ] && kill -0 "$(cat "$OUT/batch.pid")" 2>/dev/null; then
  kill -TERM "$(cat "$OUT/batch.pid")"; echo "· 묶음(pid $(cat "$OUT/batch.pid"))에 TERM"
else
  echo "· 돌고 있는 묶음이 없다 — 남은 run 만 끈다"
  for f in "$OUT"/pids/*; do [ -f "$f" ] && kill -TERM "$(cat "$f")" 2>/dev/null && echo "  run $(basename "$f") 끔"; rm -f "$f"; done
fi
for _ in $(seq 1 30); do ls "$OUT"/pids/* >/dev/null 2>&1 || break; sleep 1; done
echo "· 남은 봇 프로세스:"; pgrep -af "playbot/run[.]js" || echo "  없음"
