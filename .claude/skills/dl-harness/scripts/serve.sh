#!/usr/bin/env bash
# dl-harness · 테스트 서버 띄우기
#
#   bash .claude/skills/dl-harness/scripts/serve.sh [포트=8899] [서빙할 폴더=저장소 루트]
#
# - 그 포트에 이미 서버가 있으면 건드리지 않고 서빙 중인 GAME_VERSION 만 출력한다.
# - 없으면 python3 -m http.server 를 setsid nohup … < /dev/null & 로 띄운다
#   (CLAUDE.md '혼령 히트앤런 빈도(v827)' 계측 함정 — 그냥 & 로 띄우면 Bash 호출이 끝날 때 같이 죽는다).
# - 서빙 폴더의 index.html 과 실제로 서빙되는 것의 버전·내용(md5)이 다르면 경고하고 1 로 끝난다
#   (CLAUDE.md '렌더 변경을 비교할 때' — 스크래치패드에서 띄운 서버가 예전 index.html 을 서빙한 사고).
#   버전을 올리기 전 작업 트리 ↔ HEAD 는 버전이 같으므로 내용까지 본다.
#
# 두 번째 빌드(A/B)는 scripts/ab.sh 가 빈 포트·임시 폴더로 알아서 띄우고 끈다.
set -u
PORT="${1:-8899}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || (cd "$HERE/../../../.." && pwd))"
DIR="${2:-$ROOT}"
DIR="$(cd "$DIR" && pwd)" || { echo "✗ 폴더 없음: ${2:-}"; exit 2; }
[ -f "$DIR/index.html" ] || { echo "✗ $DIR/index.html 이 없다"; exit 2; }

ver_of_file() { grep -o -m1 "GAME_VERSION = 'v[0-9]*'" "$1" | grep -o "v[0-9]*"; }
ver_served() { curl -s --max-time 5 "http://127.0.0.1:$PORT/index.html" | grep -o -m1 "GAME_VERSION = 'v[0-9]*'" | grep -o "v[0-9]*"; }
up() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/index.html")" = "200" ]; }

WANT="$(ver_of_file "$DIR/index.html")"
if up; then
  echo "· localhost:$PORT 에 이미 서버가 있다 — 그대로 쓴다"
else
  LOG="${TMPDIR:-/tmp}/dl-serve-$PORT.log"
  setsid nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR" > "$LOG" 2>&1 < /dev/null &
  for _ in $(seq 1 40); do up && break; sleep 0.25; done
  up || { echo "✗ localhost:$PORT 서버를 못 띄웠다(로그 $LOG)"; exit 1; }
  echo "· localhost:$PORT 서버를 띄웠다 — 폴더 $DIR (로그 $LOG)"
fi
GOT="$(ver_served)"
echo "served GAME_VERSION = ${GOT:-?} (폴더의 index.html = ${WANT:-?})"
# 버전이 같아도 내용이 다를 수 있다(버전을 올리기 전의 작업 트리 ↔ HEAD) — 내용 해시까지 본다
M1="$(curl -s --max-time 20 "http://127.0.0.1:$PORT/index.html" | md5sum | cut -c1-12)"
M2="$(md5sum < "$DIR/index.html" | cut -c1-12)"
if [ "$GOT" = "$WANT" ] && [ "$M1" != "$M2" ]; then
  echo "⚠ 버전은 같은데 내용이 다르다(served md5 $M1 · 파일 $M2) — 이 포트는 다른 폴더를 서빙 중이다. 끄고 다시 띄울 것:"
  echo "    pkill -f \"http.serve[r] $PORT\""
  exit 1
fi
if [ "$GOT" != "$WANT" ]; then
  echo "⚠ 서빙 중인 버전이 $DIR/index.html 과 다르다 — 다른 폴더에서 띄운 서버다. 끄고 다시 띄울 것:"
  echo "    pkill -f \"http.serve[r] $PORT\"   # [r] — 패턴이 이 명령줄 자신에 걸려 셸이 죽는 것(exit 144) 방지(CLAUDE.md v881 계측 함정 ②)"
  exit 1
fi
