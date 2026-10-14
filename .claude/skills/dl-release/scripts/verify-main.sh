#!/usr/bin/env bash
# dl-release · 머지 뒤 라이브(main) 확인
#
# 사용: verify-main.sh [기대 버전 NNN|vNNN]
#
# origin/main 을 새로 받아 와서
#   - origin/main 의 GAME_VERSION (CLAUDE.md '릴리스 절차'의 푸시 후 확인 명령과 같다)
#   - 기대 버전과 같은지(생략하면 로컬 index.html 의 버전)
#   - origin/main 의 index.html 과 index-vNNN.html 이 같은 내용(같은 blob)인지
#   - 로컬 index.html 과 origin/main 의 index.html 이 같은지
# 를 찍는다. 하나라도 어긋나면 종료 코드 1.
set -uo pipefail
FAIL=0
cd "$(git rev-parse --show-toplevel)" || exit 1

FETCHED=0
for d in 0 2 4 8; do
  [ "$d" -gt 0 ] && { echo "… ${d}초 뒤 fetch 다시"; sleep "$d"; }
  git fetch -q origin main && { FETCHED=1; break; }
done
if [ "$FETCHED" != 1 ]; then
  echo "✗ origin main 을 못 받아 왔다 — 아래는 예전 fetch 기준이라 라이브 확인이 아니다"; FAIL=1
fi

LINE=$(git show origin/main:index.html | grep -o "GAME_VERSION = 'v[0-9]*'" | head -1)
MV=$(echo "$LINE" | grep -o '[0-9]*' | tail -1)
echo "origin/main: $LINE"

EXP="${1:-}"; EXP="${EXP#v}"
[ -n "$EXP" ] || EXP=$(sed -n "s/^const GAME_VERSION = 'v\([0-9][0-9]*\)'.*/\1/p" index.html)
if [ "$MV" = "$EXP" ]; then echo "✓ 라이브 버전 v$MV (기대 v$EXP)"; else echo "✗ 라이브 v$MV ≠ 기대 v$EXP"; FAIL=1; fi

B1=$(git rev-parse -q --verify "origin/main:index.html" 2>/dev/null)
B2=$(git rev-parse -q --verify "origin/main:index-v$MV.html" 2>/dev/null)
if [ -z "$B2" ]; then echo "✗ origin/main 에 index-v$MV.html 이 없다"; FAIL=1
elif [ "$B1" = "$B2" ]; then echo "✓ origin/main 의 index.html = index-v$MV.html"
else echo "✗ origin/main 의 index.html 과 index-v$MV.html 이 다르다"; FAIL=1; fi

if git diff --quiet origin/main -- index.html; then echo "✓ 로컬 index.html = origin/main"
else echo "! 로컬 index.html 이 origin/main 과 다르다(머지 안 된 변경이 있거나 브랜치가 다름)"; fi

exit "$FAIL"
