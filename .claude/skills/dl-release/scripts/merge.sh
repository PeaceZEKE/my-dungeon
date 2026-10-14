#!/usr/bin/env bash
# dl-release · 작업 브랜치 → main 머지 (사용자가 "머지해 / main 에 올려 / 라이브 반영" 이라고 했을 때만)
#
# 사용(저장소 루트, 작업 브랜치에서):
#   bash .claude/skills/dl-release/scripts/merge.sh <NNN|vNNN> <<'EOF'
#   Merge vNNN: <한 줄 요약>
#
#   <이 세션 system-reminder 의 attribution 줄 그대로>
#   EOF
#
#   표준 입력은 fast-forward 가 안 될 때(main 이 따로 움직였을 때) 만드는 머지 커밋 메시지다.
#   두 번째 인자로 메시지 파일을 줘도 된다.
#
# 하는 일 — 어느 단계든 실패하면 그 자리에서 멈추고 작업 브랜치로 돌아온다:
#   1) 지금 브랜치가 main 이 아니고, 추적 파일에 커밋 안 한 변경이 없고, index.html 버전 = NNN
#   2) check.sh 통과(머지 전 최소 문법 — CLAUDE.md '릴리스 절차')
#   3) git fetch origin main → main 을 origin/main 으로 fast-forward(로컬 main 은 자주 낡아 있다)
#   4) main 에 작업 브랜치를 --ff-only, 안 되면 --no-ff(위 메시지). 충돌이면 git merge --abort 후 멈춘다
#      — reset --hard·force 로 풀지 말고 사용자에게 묻는다
#   5) push.sh main --main → 작업 브랜치로 돌아옴 → verify-main.sh NNN
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
die() { echo "✗ $*" >&2; exit 1; }

V="${1:-}"; V="${V#v}"
case "$V" in ''|*[!0-9]*) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2;; esac
cd "$(git rev-parse --show-toplevel)" || exit 1

B=$(git branch --show-current)
[ -n "$B" ] || die "브랜치를 모르겠다(detached HEAD?)"
[ "$B" != main ] || die "지금 main 이다 — 작업 브랜치(claude/…)에서 부를 것"
git diff --quiet && git diff --cached --quiet || die "추적 파일에 커밋 안 한 변경이 있다 — 커밋하고 push.sh 한 뒤 다시"
CUR=$(sed -n "s/^const GAME_VERSION = 'v\([0-9][0-9]*\)'.*/\1/p" index.html)
[ "$CUR" = "$V" ] || die "index.html 버전 v$CUR ≠ 머지하려는 v$V"

# 머지 커밋 메시지(--no-ff 때만 쓴다)
MSGF=$(mktemp); trap 'rm -f "$MSGF"' EXIT
if [ -n "${2:-}" ]; then cat "$2" > "$MSGF" || die "메시지 파일을 못 읽음: $2"
elif [ ! -t 0 ]; then timeout 5 cat > "$MSGF" || true; fi
grep -q '[^[:space:]]' "$MSGF" 2>/dev/null || printf 'Merge v%s\n' "$V" > "$MSGF"
grep -qi '^Co-Authored-By:' "$MSGF" || echo "! 머지 메시지에 attribution 줄이 없다(fast-forward 면 안 쓰인다)"

COUT=$(bash "$HERE/check.sh" 2>&1) || { echo "$COUT" | grep '✗'; die "check.sh 실패 — 머지하지 않는다"; }
echo "✓ check.sh 통과"

git fetch -q origin main || die "git fetch origin main 실패"
if git rev-parse -q --verify "origin/$B" >/dev/null && [ "$(git rev-parse "$B")" != "$(git rev-parse "origin/$B")" ]; then
  echo "! $B 이 origin/$B 와 다르다 — 작업 브랜치를 먼저 push.sh 해 두는 것이 좋다"
fi

back() { git checkout -q "$B" 2>/dev/null || echo "! $B 로 못 돌아왔다 — git status 확인"; }
git checkout -q main || die "git checkout main 실패"
git merge -q --ff-only origin/main || { back; die "로컬 main 을 origin/main 으로 fast-forward 못 함 — 로컬 main 에 원격에 없는 커밋이 있다(사용자에게 물을 것)"; }
if git merge -q --ff-only "$B" 2>/dev/null; then
  echo "✓ fast-forward: main ← $B"
elif git merge -q --no-ff "$B" -F "$MSGF"; then
  echo "✓ 머지 커밋: main ← $B (main 이 따로 움직여 있었다)"
else
  git merge --abort 2>/dev/null
  back
  die "머지 충돌 — 되돌렸다(git merge --abort). 사용자에게 어떻게 풀지 묻는다(reset --hard·force 금지)"
fi

if ! bash "$HERE/push.sh" main --main; then
  back
  die "main push 실패 — 로컬 main 에만 머지가 있다. 네트워크를 보고 push.sh main --main 을 다시"
fi
back
bash "$HERE/verify-main.sh" "$V"
