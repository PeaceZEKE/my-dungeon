#!/usr/bin/env bash
# dl-release · 릴리스 전 검사
#
# 사용: check.sh [저장소 루트]
#
# 검사(하나라도 ✗ 면 종료 코드 1):
#   1) 게임 스크립트 문법 — 마지막 '<script>' ~ '</script>' 블록만 잘라 node --check
#      (CLAUDE.md '릴리스 절차'. 앞의 <script> 들은 three.js·GLTFLoader·초상화·효과음 데이터라 건너뛴다)
#   2) GAME_VERSION 정의 줄이 정확히 1개
#   3) 보관본 index-vNNN.html 이 그 버전 이름으로 있고 index.html 과 바이트 단위로 같다
#   4) 다른 index-v*.html 이 남아 있지 않다(보관본은 늘 하나)
#   5) AD_TEST·DEV_MODE 가 URL 로만 켜진다(CLAUDE.md 'CrazyGames 준수사항' — 치트 버튼 노출 금지)
#      — 정의 두 줄을 node vm 으로 쿼리 없음·?dev=1·?adtest=1 에서 실제로 평가한다
#   6) origin/main 대비: 게임 코드가 바뀌었으면 버전도 main 보다 커야 한다(마지막 fetch 기준)
set -uo pipefail

FAIL=0
ok()   { echo "✓ $*"; }
bad()  { echo "✗ $*"; FAIL=1; }
warn() { echo "! $*"; }

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "$ROOT" ] && cd "$ROOT" || { echo "✗ 저장소 루트를 못 찾음"; exit 1; }
[ -f index.html ] || { echo "✗ index.html 없음: $ROOT"; exit 1; }

# 1) 문법
S=$(grep -n '^<script>$' index.html | tail -1 | cut -d: -f1)
E=$(grep -n '^</script>$' index.html | tail -1 | cut -d: -f1)
if [ -z "$S" ] || [ -z "$E" ] || [ "$E" -le "$S" ]; then
  bad "게임 스크립트 블록을 못 찾음(S=$S E=$E) — 마지막 블록은 '<script>' / '</script>' 한 줄씩이어야 한다"
else
  TMP=$(mktemp --suffix=.js)
  trap 'rm -f "$TMP"' EXIT
  sed -n "$((S+1)),$((E-1))p" index.html > "$TMP"
  if ! grep -q "^const GAME_VERSION = " "$TMP"; then
    bad "마지막 <script> 블록(${S}~${E}줄)에 GAME_VERSION 이 없다 — 게임 스크립트가 아닌 블록을 잡았다"
  elif OUT=$(node --check "$TMP" 2>&1); then
    ok "문법 통과 — 게임 스크립트 ${S}~${E}줄 ($(( E - S - 1 ))줄)"
  else
    L=$(echo "$OUT" | head -1 | grep -o ':[0-9][0-9]*$' | tr -d ':')
    if [ -n "$L" ]; then bad "문법 오류(node --check) — index.html $((L + S))줄"; else bad "문법 오류(node --check)"; fi
    echo "$OUT" | head -12 | sed 's/^/    /'
  fi
fi

# 2) 버전 정의
CNT=$(grep -c "^const GAME_VERSION = 'v[0-9][0-9]*'" index.html || true)
if [ "$CNT" != "1" ]; then
  bad "GAME_VERSION 정의 줄이 1개가 아님($CNT개)"
  V=""
else
  V=$(sed -n "s/^const GAME_VERSION = 'v\([0-9][0-9]*\)'.*/\1/p" index.html)
  ok "index.html 버전 v$V"
fi

# 3·4) 보관본
if [ -n "$V" ]; then
  A="index-v$V.html"
  if [ ! -f "$A" ]; then
    bad "보관본 $A 이 없다 — bump.sh 로 올렸는지, 아니면: bash .claude/skills/dl-release/scripts/bump.sh --sync"
  else
    AV=$(sed -n "s/^const GAME_VERSION = 'v\([0-9][0-9]*\)'.*/\1/p" "$A" | head -1)
    [ "$AV" = "$V" ] && ok "$A 안의 버전도 v$AV" || bad "$A 안의 버전이 v$AV (index.html 은 v$V)"
    if cmp -s index.html "$A"; then
      ok "index.html = $A (바이트 단위로 같음, $(wc -c < index.html) bytes)"
    else
      bad "index.html 과 $A 이 다르다 — 아직 main 에 안 올린 버전이면 bump.sh --sync · main 과 같은 버전이면 bump.sh <다음 번호> (아래 main 비교 참고)"
    fi
  fi
  OTHERS=$(ls index-v*.html 2>/dev/null | grep -vx "$A" || true)
  [ -z "$OTHERS" ] && ok "보관본은 하나뿐" || bad "낡은 보관본이 남아 있다: $(echo $OTHERS) — git mv/git rm 으로 정리(보관본은 늘 하나)"
fi

# 5) 개발자·광고 테스트 모드가 URL 로만 켜지는가
ADL=$(grep -m1 "^const AD_TEST = " index.html || true)
DVL=$(grep -m1 "^const DEV_MODE = " index.html || true)
if [ -z "$ADL" ] || [ -z "$DVL" ]; then
  bad "AD_TEST / DEV_MODE 정의 줄을 못 찾음"
else
  # 글자 패턴으로 보면 'const DEV_MODE = true || /dev=1/…' 같은 것이 빠져나간다 — 두 줄을 실제로 평가한다.
  # 쿼리 없음 → 둘 다 false · ?dev=1 → DEV_MODE true · ?adtest=1 → AD_TEST true 여야 한다.
  if DOUT=$(ADL="$ADL" DVL="$DVL" node -e '
    const vm = require("vm");
    const run = q => {
      const ctx = { location: { search: q, href: "http://localhost/index.html" + q }, URLSearchParams, URL };
      ctx.window = ctx;
      const r = vm.runInNewContext(process.env.ADL + "\n" + process.env.DVL + "\n;[!!AD_TEST, !!DEV_MODE]", ctx);
      return [r[0], r[1]];
    };
    try {
      const a = run(""), d = run("?dev=1"), t = run("?adtest=1");
      console.log(`쿼리 없음 AD_TEST=${a[0]} DEV_MODE=${a[1]} · ?dev=1 DEV_MODE=${d[1]} · ?adtest=1 AD_TEST=${t[0]}`);
      process.exit(!a[0] && !a[1] && d[1] && t[0] ? 0 : 1);
    } catch (e) { console.log("평가 실패: " + e.message); process.exit(1); }
  ' 2>&1); then
    ok "AD_TEST·DEV_MODE 는 ?adtest=1 · ?dev=1 로만 켜짐 ($DOUT)"
  else
    bad "AD_TEST/DEV_MODE 가 URL 없이 켜지거나 URL 로 안 켜진다 — $DOUT"; echo "    $ADL"; echo "    $DVL"
  fi
fi

# 6) origin/main 대비
if [ -n "$V" ] && git rev-parse -q --verify origin/main >/dev/null 2>&1; then
  MV=$(git show origin/main:index.html 2>/dev/null | sed -n "s/^const GAME_VERSION = 'v\([0-9][0-9]*\)'.*/\1/p" | head -1)
  if [ -z "$MV" ]; then
    warn "origin/main 의 GAME_VERSION 을 못 읽음"
  elif git diff --quiet origin/main -- index.html; then
    ok "index.html 이 origin/main(v$MV)과 같다 — 게임 코드 변경 없음(문서만이면 버전을 안 올린다)"
  elif [ "$V" -gt "$MV" ]; then
    ok "게임 코드 변경 있음 · main v$MV → 이 브랜치 v$V"
  elif [ "$V" -eq "$MV" ]; then
    bad "게임 코드가 main 과 다른데 버전이 main 과 같은 v$V — bash .claude/skills/dl-release/scripts/bump.sh $((MV + 1))"
  else
    bad "이 브랜치 v$V 가 main v$MV 보다 낮다 — 브랜치가 뒤처졌다(git merge origin/main 후 다시)"
  fi
  echo "  (origin/main 은 마지막 fetch 기준 — 최신으로 보려면 먼저 git fetch origin main)"
else
  warn "origin/main 이 없어 main 비교는 건너뜀"
fi

BR=$(git branch --show-current 2>/dev/null || true)
[ "$BR" = "main" ] && warn "지금 main 에 있다 — 작업은 claude/… 작업 브랜치에서(CLAUDE.md '릴리스 절차')"

echo
if [ "$FAIL" = 0 ]; then echo "== 통과 =="; else echo "== 실패 — 위 ✗ 를 고칠 것 =="; fi
exit "$FAIL"
