#!/usr/bin/env bash
# dl-release · 버전 올리기
#
# 사용:
#   bump.sh <새 번호 | vNNN> [저장소 루트]   — GAME_VERSION 을 올리고 보관본을 새 이름으로
#   bump.sh --sync [저장소 루트]             — 버전은 그대로, index.html → index-v<현재>.html 복사만
#                                               (아직 main 에 안 올린 같은 버전에 이어서 고칠 때)
#
# 하는 일(bump):
#   1) index.html 의  const GAME_VERSION = 'vOLD'  한 줄을 'vNEW' 로 바꾼다(정의 줄이 정확히 1개여야 함)
#   2) git mv index-vOLD.html index-vNEW.html   (이력 보존 — 저장소가 늘 이렇게 이름을 바꿔 왔다)
#   3) cp index.html index-vNEW.html            (내용을 새 index.html 과 바이트 단위로 같게)
#   4) 버전 줄 diff 와 index*.html 상태를 찍는다
# 커밋·푸시는 하지 않는다 — 다음은 check.sh.
set -euo pipefail

die() { echo "✗ $*" >&2; exit 1; }

MODE=bump
NEW=""
if [ "${1:-}" = "--sync" ]; then
  MODE=sync; shift
elif [ -n "${1:-}" ]; then
  NEW="$1"; shift
else
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "$ROOT" ] || die "저장소 루트를 못 찾음 — 인자로 넘겨 줄 것"
cd "$ROOT"
[ -f index.html ] || die "index.html 없음: $ROOT"

DEF_RE="^const GAME_VERSION = 'v[0-9][0-9]*'"
CNT=$(grep -c "$DEF_RE" index.html || true)
[ "$CNT" = "1" ] || die "GAME_VERSION 정의 줄이 1개가 아님($CNT개) — index.html 을 직접 확인할 것"
OLD=$(sed -n "s/^const GAME_VERSION = 'v\([0-9][0-9]*\)'.*/\1/p" index.html)

if [ "$MODE" = sync ]; then
  cp index.html "index-v$OLD.html"
  echo "✓ 동기화: index.html → index-v$OLD.html (버전 v$OLD 그대로)"
  OTHERS=$(ls index-v*.html 2>/dev/null | grep -vx "index-v$OLD.html" || true)
  [ -z "$OTHERS" ] || echo "! 다른 보관본이 남아 있음: $OTHERS"
  git status --short -- 'index*.html' 2>/dev/null || true
  exit 0
fi

NEW="${NEW#v}"
case "$NEW" in ''|*[!0-9]*) die "버전은 숫자여야 함: '$NEW' (예: 898 또는 v898)";; esac
[ "$NEW" -gt "$OLD" ] || die "새 버전 v$NEW 이 현재 v$OLD 보다 크지 않다 — 같은 버전에 이어 고치는 거면 --sync"
[ ! -e "index-v$NEW.html" ] || die "index-v$NEW.html 이 이미 있다"

# 옮길 보관본 찾기 — 보통 index-vOLD.html 하나뿐이다
SRC=""
if [ -f "index-v$OLD.html" ]; then
  SRC="index-v$OLD.html"
else
  ALL=$(ls index-v*.html 2>/dev/null || true)
  N=$(printf '%s\n' "$ALL" | grep -c . || true)
  if [ "$N" = "1" ]; then
    SRC="$ALL"; echo "! index-v$OLD.html 이 없어 $SRC 를 옮긴다(보관본 이름이 버전과 어긋나 있었다)"
  elif [ "$N" -gt 1 ]; then
    die "보관본이 여럿이라 무엇을 옮길지 모름: $(echo $ALL) — 정리하고 다시"
  else
    echo "! 보관본이 하나도 없다 — index-v$NEW.html 을 새로 만든다"
  fi
fi

# 1) 버전 줄
sed -i "s/^const GAME_VERSION = 'v$OLD'/const GAME_VERSION = 'v$NEW'/" index.html
GOT=$(sed -n "s/^const GAME_VERSION = 'v\([0-9][0-9]*\)'.*/\1/p" index.html)
[ "$GOT" = "$NEW" ] || die "버전 줄 치환 실패(지금 v$GOT)"

# 2) 보관본 이름 바꾸기 — 추적 중이면 git mv(이력 보존), 아니면 mv
if [ -n "$SRC" ]; then
  if git ls-files --error-unmatch "$SRC" >/dev/null 2>&1; then
    git mv "$SRC" "index-v$NEW.html"
  else
    mv "$SRC" "index-v$NEW.html"
  fi
fi
# 3) 내용 맞추기
cp index.html "index-v$NEW.html"

echo "✓ v$OLD → v$NEW"
echo "--- 버전 줄 diff ---"
git diff -U0 -- index.html 2>/dev/null | grep -E "^[-+]const GAME_VERSION" || grep -n "$DEF_RE" index.html
echo "--- index*.html 상태 ---"
git status --short -- 'index*.html' 2>/dev/null || ls index*.html
echo "다음: bash .claude/skills/dl-release/scripts/check.sh"
