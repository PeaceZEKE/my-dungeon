#!/usr/bin/env bash
# dl-harness · 두 빌드 픽셀 해시 A/B (같은 세션에서 연달아)
#
#   bash .claude/skills/dl-harness/scripts/ab.sh <B 빌드> [harness 옵션 …]
#
#   <B 빌드>  git 참조(origin/main · HEAD · HEAD~1 · 커밋 해시) 또는 index.html 파일 경로
#             라이브 빌드와 비교할 때는 main 이 아니라 origin/main(git fetch origin main 뒤) — 로컬 main 은 뒤처져 있을 수 있다
#             (실측: 로컬 main v888 · origin/main v897). 로컬 main 이 origin/main 과 다르면 경고한다.
#   A 쪽은 저장소 루트(작업 트리, 8899 — 없으면 serve.sh 로 띄운다), B 쪽은 임시 폴더 + 빈 포트(8898 부터)에 띄웠다가 끝나면 끈다.
#   harness 옵션은 양쪽에 똑같이 넘긴다. --hash 가 없으면 붙인다. --port 는 주지 말 것.
#   A 쪽에만 줄 URL 플래그는 AB_A_FLAGS, B 쪽에만은 AB_B_FLAGS(예: AB_A_FLAGS='&newfeat=0' — 새 빌드 플래그 끔 == 예전 빌드인지).
#
# 예) 새 플래그를 끄면 main 과 픽셀 단위로 같은가(1·2·3·4막)
#   for f in 5 45 75 95; do AB_A_FLAGS='&lore=0' bash .claude/skills/dl-harness/scripts/ab.sh origin/main --floor $f --seed 12345; done
#
# 규칙(CLAUDE.md '렌더 변경을 비교할 때'):
#   - 대조군(같은 빌드 두 번)이 같은 해시를 내는지 먼저 볼 것 — ab.sh HEAD 로 작업 트리 ↔ HEAD 가 같은 경우가 대조군이다.
#   - 객체 수가 달라지는 변경은 THREE uuid 가 난수를 먹어 층 배치가 통째로 바뀐다 → 픽셀 A/B 원천 불가, 기능을 직접 계측할 것.
#   - 둘은 순서대로 돈다(동시에 돌리면 같은 빌드 해시가 달라질 때가 있다 — CLAUDE.md v851 계측 함정).
set -u
[ $# -ge 1 ] || { awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0"; exit 2; }   # 머리 주석만
REF="$1"; shift
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
H="$HERE/harness.js"

bash "$HERE/serve.sh" 8899 "$ROOT" >/dev/null || { bash "$HERE/serve.sh" 8899 "$ROOT"; exit 2; }

# 로컬 main 은 pull 하지 않으면 라이브(origin/main)보다 뒤처진다 — 엉뚱한 빌드와 비교하지 않게 경고
if [ "$REF" = "main" ] && git -C "$ROOT" rev-parse -q --verify origin/main >/dev/null \
   && [ "$(git -C "$ROOT" rev-parse main)" != "$(git -C "$ROOT" rev-parse origin/main)" ]; then
  gv() { git -C "$ROOT" show "$1:index.html" | grep -o -m1 "GAME_VERSION = 'v[0-9]*'" | grep -o "v[0-9]*"; }
  echo "⚠ 로컬 main($(gv main))이 origin/main($(gv origin/main))과 다르다 — 라이브와 비교하려면 origin/main 을 줄 것(git fetch origin main 먼저)"
fi
D="$(mktemp -d "${TMPDIR:-/tmp}/dl-ab.XXXXXX")"
SPID=""
cleanup() { [ -n "$SPID" ] && kill "$SPID" 2>/dev/null; rm -rf "$D"; }
trap cleanup EXIT   # mktemp 바로 뒤에 — 참조를 못 꺼내 일찍 끝나도 임시 폴더가 안 남게
if [ -f "$REF" ]; then cp "$REF" "$D/index.html"
else git -C "$ROOT" show "$REF:index.html" > "$D/index.html" 2>/dev/null || { echo "✗ $REF:index.html 을 못 꺼냄"; exit 2; }; fi

PB=8898
while curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PB/" ; do PB=$((PB - 1)); done
setsid nohup python3 -m http.server "$PB" --bind 127.0.0.1 --directory "$D" > "$D/server.log" 2>&1 < /dev/null &
SPID=$!
for _ in $(seq 1 40); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PB/index.html" && break; sleep 0.25; done
[ "$(curl -s "http://127.0.0.1:$PB/index.html" | md5sum)" = "$(md5sum < "$D/index.html")" ] || { echo "✗ B 서버($PB)가 엉뚱한 것을 서빙"; exit 2; }

ARGS=("$@")
case " ${ARGS[*]-} " in *" --hash "*) ;; *) ARGS+=("--hash");; esac
# --url-flags 를 분리해서 A/B 전용 플래그를 덧붙인다
BASEF=""; REST=()
i=0; while [ $i -lt ${#ARGS[@]} ]; do
  if [ "${ARGS[$i]}" = "--url-flags" ]; then BASEF="${ARGS[$((i+1))]}"; i=$((i+2)); else REST+=("${ARGS[$i]}"); i=$((i+1)); fi
done

run() { # $1 port $2 flags $3 label
  local out; out="$(node "$H" --port "$1" --url-flags "$2" "${REST[@]}" --quiet 2>&1)"; local rc=$?
  echo "$out" | grep -E "^(served|HASH|SETUP|EVAL|✗|⚠)" | sed "s/^/[$3] /"
  echo "$out" | grep "^RESULT " | sed 's/^RESULT //' > "$D/$3.json"
  return $rc
}
run 8899 "$BASEF${AB_A_FLAGS:-}" A; RA=$?
run "$PB" "$BASEF${AB_B_FLAGS:-}" B; RB=$?
node -e '
const fs = require("fs"), [a, b] = process.argv.slice(1, 3).map(f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return {}; } });
const ha = a.hash && a.hash.hash, hb = b.hash && b.hash.hash;
if (!ha || !hb) { console.log("✗ 해시를 못 얻음(위 오류 참고)"); process.exit(1); }
if (ha === hb) { console.log("SAME " + ha + "  (A 작업 트리 · B " + process.argv[3] + ")"); process.exit(0); }
let worst = [0, 0, 0];
a.hash.grid.forEach((row, y) => row.forEach((v, x) => { const d = Math.abs(v - b.hash.grid[y][x]); if (d > worst[0]) worst = [d, x, y]; }));
console.log("DIFF A " + ha + " · B " + hb + " — 거친 격자(8×6) 평균 휘도 최대 차 " + worst[0].toFixed(1) + " @ 열 " + worst[1] + " 행 " + worst[2]);
console.log("  A 던전 " + JSON.stringify(a.dungeon || null) + "\n  B 던전 " + JSON.stringify(b.dungeon || null) + "   (방·적 수가 다르면 난수 흐름이 갈린 것 — 객체 수 변화)");
process.exit(3);
' "$D/A.json" "$D/B.json" "$REF"
RC=$?
[ $RA -eq 0 ] && [ $RB -eq 0 ] || RC=1
exit $RC
