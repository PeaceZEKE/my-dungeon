#!/usr/bin/env bash
# dl-release · 재시도하는 push
#
# 사용:
#   push.sh                 — 지금 브랜치를 origin 에 (git push -u origin <브랜치>)
#   push.sh <브랜치>
#   push.sh main --main     — main 은 '--main' 을 붙였을 때만. 사용자가 '머지해'라고 했을 때만 쓴다.
#
# 네트워크 실패면 2·4·8·16초 뒤 다시(최대 5번). 거절(non-fast-forward)·권한(403) 은 다시 해도 소용없어
# 바로 멈춘다. --force 는 절대 쓰지 않는다.
set -uo pipefail

B=""; ALLOW_MAIN=0
for a in "$@"; do
  case "$a" in
    --main) ALLOW_MAIN=1 ;;
    --force*|-f|+*) echo "✗ force push 는 하지 않는다($a)"; exit 2 ;;
    -*) echo "✗ 모르는 옵션: $a (쓸 수 있는 것: [브랜치] [--main])"; exit 2 ;;
    *) B="$a" ;;
  esac
done
[ -n "$B" ] || B=$(git branch --show-current)
[ -n "$B" ] || { echo "✗ 브랜치를 모르겠다(detached HEAD?)"; exit 2; }

if [ "$B" = "main" ] && [ "$ALLOW_MAIN" != 1 ]; then
  echo "✗ main 은 사용자가 머지를 지시했을 때만 올린다 — 그때는: push.sh main --main"
  exit 2
fi
case "$B" in main|claude/*) ;; *) echo "! 작업 브랜치 이름이 claude/… 가 아니다: $B" ;; esac

for d in 0 2 4 8 16; do
  if [ "$d" -gt 0 ]; then echo "… ${d}초 뒤 다시 시도"; sleep "$d"; fi
  OUT=$(git push -u origin "$B" 2>&1); RC=$?
  echo "$OUT"
  if [ "$RC" = 0 ]; then echo "✓ push 완료: $B"; exit 0; fi
  if echo "$OUT" | grep -qiE "rejected|non-fast-forward|fetch first|403|denied|permission"; then
    echo "✗ 거절됨 — 재시도로 안 풀린다. 원격이 앞서 있으면 git fetch && git merge origin/$B 후 다시(force 금지). 권한이면 /root/.ccr/README.md"
    exit 1
  fi
done
echo "✗ push 5번 실패 — 네트워크 확인: curl -sS \"\$HTTPS_PROXY/__agentproxy/status\""
exit 1
