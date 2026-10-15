#!/usr/bin/env bash
# dl-playbot · 플레이 봇(viewers/playbot/run.js) 묶음 실행 — 시드 × 직업 × 층 구간 × 조건(URL 플래그)
#
#   bash .claude/skills/dl-playbot/scripts/batch.sh -o <결과 폴더> -f 31-60 [옵션…]
#
#   -o, --out DIR        결과 폴더(필수). runs/<이름>.json · logs/<이름>.log · done.txt · conds.tsv · batch-<시각>.txt
#   -f, --floors A-B     층 구간(여러 번 가능). act1~act4 도 된다(= 1-30 · 31-60 · 61-90 · 91-120).
#                        시작층은 1·31·61·91 만 권장 — 그 밖은 startRunAtFloorReset 의 단축 레벨(22/27/30)이 안 맞는다
#   -c, --class LIST     knight,mage,archer (k,m,a · all). 기본 knight
#   -s, --seeds LIST     11,22,33 … (기본 11,22,…,88 — 8개)
#   -n N                 시드 N 개(11·22·33·… 11 의 배수)
#   -C, --cond NAME=Q    조건 이름 = 붙일 URL 쿼리(여러 번 가능). 예: -C old='&bal5=0' -C new=''
#   -q, --query Q        조건 하나짜리 축약(이름 base)
#   -p, --ports LIST     서버 포트(쉼표). 기본 8899. 없는 포트는 저장소 루트에서 띄운다. 일을 포트에 나눠 준다
#   -j N                 동시 실행 수(최대 4, 기본 4) — 4 개를 넘기면 page.goto 가 시간 초과로 죽는다
#   -T, --timeout SEC    run 하나의 실제 시간 상한(기본 3600)
#   --merc TYPE[:GEAR]   용병 고용(spear·shield·xbow·monk, GEAR 0~5) — 조건 이름에 표시해 둘 것
#   --force              이미 있는 결과도 다시 돌린다(기본은 건너뜀 — 끊긴 묶음 이어 돌리기)
#   --dry                일 목록만 찍는다
#
# 지키는 것(CLAUDE.md 근거):
#  · URL 플래그는 배열 원소 하나로 node 에 그대로 넘긴다 — xargs 를 쓰지 않는다
#    ('용병 2단계' 계측 함정 ① xargs 는 입력의 따옴표를 벗긴다 → '&aggro=0' 의 & 가 셸 백그라운드 기호가 돼 대조군이 쿼리 없이 돌았다).
#  · 서버는 저장소 루트에서 · 서빙 중인 내용(md5)이 작업 트리 index.html 과 같은지 확인('렌더 변경을 비교할 때').
#  · 측정 중 index.html 이 바뀌면 그 뒤로는 새 run 을 띄우지 않는다('2·3막 체감 조정' 계측 함정 ④ — 뒤에 뜨는 회차가 새 빌드를 읽는다).
#  · 서버는 setsid nohup … < /dev/null & 로 띄운다('혼령 히트앤런 빈도' 계측 함정 — 그냥 & 면 Bash 호출과 같이 죽는다).
#  · 끌 때 pkill -f 패턴을 쓰지 않는다 — pid 파일로(stop.sh). ('용병 2단계' 계측 함정 ② — 패턴이 자기 셸 명령줄에 걸려 exit 144)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || (cd "$HERE/../../../.." && pwd))"
RUNJS="$ROOT/viewers/playbot/run.js"
PRE="$HERE/pw-preload.js"
# playwright 는 전역 설치본을 쓴다(run.js 옆에 node_modules 가 없다) — 전역 폴더는 npm root -g, 없으면 node 실행 파일 옆 lib/node_modules
GNM="$(npm root -g 2>/dev/null)"; [ -d "$GNM" ] || GNM="$(dirname "$(dirname "$(command -v node)")")/lib/node_modules"
export NODE_PATH="${NODE_PATH:+$NODE_PATH:}$GNM"

usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"; }

OUT=""; CLASSES="knight"; SEEDS=""; NSEEDS=""; RANGES=(); CONDN=(); CONDQ=(); PORTS="8899"; J=4; TO=3600; MERC=""; FORCE=0; DRY=0
need() { [ $# -ge 2 ] && [ -n "${2-}" ] || { echo "✗ $1 에 값이 필요하다"; exit 2; }; }
while [ $# -gt 0 ]; do
  case "$1" in
    -o|--out) need "$@"; OUT="$2"; shift 2 ;;
    -f|--floors) need "$@"; RANGES+=("$2"); shift 2 ;;
    -c|--class) need "$@"; CLASSES="$2"; shift 2 ;;
    -s|--seeds) need "$@"; SEEDS="$2"; shift 2 ;;
    -n) need "$@"; NSEEDS="$2"; shift 2 ;;
    -C|--cond) [ $# -ge 2 ] || { echo "✗ -C 에 NAME=Q 가 필요하다"; exit 2; }
       case "$2" in *=*) CONDN+=("${2%%=*}"); CONDQ+=("${2#*=}") ;; *) CONDN+=("$2"); CONDQ+=("") ;; esac; shift 2 ;;
    -q|--query) [ $# -ge 2 ] || { echo "✗ -q 에 값이 필요하다"; exit 2; }; CONDN+=("base"); CONDQ+=("$2"); shift 2 ;;
    -p|--ports) need "$@"; PORTS="$2"; shift 2 ;;
    -j) need "$@"; J="$2"; shift 2 ;;
    -T|--timeout) need "$@"; TO="$2"; shift 2 ;;
    --merc) need "$@"; MERC="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --dry) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "✗ 모르는 옵션: $1 (-h 로 도움말)"; exit 2 ;;
  esac
done

[ -n "$OUT" ] || { echo "✗ -o <결과 폴더> 가 필요하다"; exit 2; }
[ ${#RANGES[@]} -gt 0 ] || { echo "✗ -f <층 구간> 이 필요하다(예: -f 31-60 · -f act2)"; exit 2; }
[ -f "$RUNJS" ] || { echo "✗ $RUNJS 가 없다"; exit 2; }
( cd "$ROOT/viewers/playbot" && node -e "require.resolve('playwright')" ) 2>/dev/null || { echo "✗ playwright 모듈을 못 찾는다(NODE_PATH=$NODE_PATH) — 전역 설치를 확인할 것(브라우저는 playwright install 말고 /opt/pw-browsers 동봉본: pw-preload.js 가 알아서 쓴다)"; exit 2; }
[[ "$J" =~ ^[1-4]$ ]] || { echo "✗ -j 는 1~4 — 동시 실행이 4 개를 넘으면 page.goto 가 시간 초과로 죽고(CLAUDE.md '용병 2단계' 계측 함정 ①) 코어도 4 개뿐이다"; exit 2; }
mkdir -p "$OUT/runs" "$OUT/logs" "$OUT/pids"
OUT="$(cd "$OUT" && pwd)"
# 같은 폴더에서 묶음이 이미 돌고 있으면 아무것도 쓰기 전에 멈춘다(돌고 있는 run 은 .json.part 라 일 목록에 다시 잡힌다)
if [ $DRY -eq 0 ] && [ -f "$OUT/batch.pid" ] && kill -0 "$(cat "$OUT/batch.pid")" 2>/dev/null; then
  echo "✗ 이 폴더에서 이미 묶음이 돌고 있다(pid $(cat "$OUT/batch.pid")) — 끝나길 기다리거나 bash $HERE/stop.sh $OUT"; exit 1
fi

# ── 조건 ────────────────────────────────────────────────
[ ${#CONDN[@]} -gt 0 ] || { CONDN=("base"); CONDQ=(""); }
for i in "${!CONDN[@]}"; do
  n="${CONDN[$i]}"; q="${CONDQ[$i]}"
  [[ "$n" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "✗ 조건 이름은 영문·숫자·_- 만: '$n'"; exit 2; }
  case "$q" in '') ;; '?'*) q="&${q#?}" ;; '&'*) ;; *) q="&$q" ;; esac
  [[ "$q" =~ [[:space:]\"\'\`] ]] && { echo "✗ 쿼리에 공백·따옴표가 있다: '$q'"; exit 2; }
  CONDQ[$i]="$q"
done
MERC_T=""; MERC_G=""
if [ -n "$MERC" ]; then
  MERC_T="${MERC%%:*}"; [ "$MERC_T" != "$MERC" ] && MERC_G="${MERC#*:}"
  [[ "$MERC_T" =~ ^(spear|shield|xbow|monk)$ ]] || { echo "✗ --merc 는 spear·shield·xbow·monk"; exit 2; }
  [ -z "$MERC_G" ] || [[ "$MERC_G" =~ ^[0-5]$ ]] || { echo "✗ --merc 장비 레벨은 0~5"; exit 2; }
fi
# 같은 결과 폴더에 같은 이름·다른 설정의 조건이 섞이지 않게(conds.tsv: 이름 \t 쿼리 \t 용병)
touch "$OUT/conds.tsv"
for i in "${!CONDN[@]}"; do
  n="${CONDN[$i]}"; line="$n"$'\t'"${CONDQ[$i]}"$'\t'"${MERC}"
  old="$(awk -F'\t' -v n="$n" '$1==n' "$OUT/conds.tsv" | head -1)"
  if [ -n "$old" ] && [ "$old" != "$line" ]; then
    if [ $FORCE -eq 0 ]; then
      echo "✗ 조건 '$n' 이 이 폴더에 다른 설정으로 이미 있다: [$old] ↔ [$line] — 이름을 바꾸거나 --force"; exit 2
    fi
    # --force: conds.tsv 를 새 설정으로 바꾼다(안 바꾸면 agg.js 가 예전 쿼리를 찍는다). 이번 묶음이 안 덮는 예전 결과는 예전 설정 그대로다
    echo "⚠ 조건 '$n' 의 설정을 바꾼다 [$old] → [$line] — 이번 묶음에 없는 시드·직업·구간의 runs/${n}__* 는 예전 설정 결과다(지우거나 폴더를 새로)"
    if [ $DRY -eq 0 ]; then
      awk -F'\t' -v n="$n" -v l="$line" 'BEGIN{OFS=FS} $1==n { if (!d) print l; d=1; next } { print }' "$OUT/conds.tsv" > "$OUT/conds.tsv.new" && mv "$OUT/conds.tsv.new" "$OUT/conds.tsv"
    fi
  fi
  [ -z "$old" ] && [ $DRY -eq 0 ] && printf '%s\n' "$line" >> "$OUT/conds.tsv"
done

# ── 직업 · 시드 · 구간 ────────────────────────────────────
CLS=()
IFS=',' read -r -a _c <<< "$CLASSES"
for c in "${_c[@]}"; do
  case "$c" in k|knight) CLS+=(knight) ;; m|mage) CLS+=(mage) ;; a|archer) CLS+=(archer) ;; all) CLS+=(knight mage archer) ;;
    *) echo "✗ 직업: $c"; exit 2 ;; esac
done
SEEDL=()
if [ -n "$SEEDS" ]; then IFS=',' read -r -a SEEDL <<< "$SEEDS"
elif [ -n "$NSEEDS" ]; then for k in $(seq 1 "$NSEEDS"); do SEEDL+=($((11 * k))); done
else SEEDL=(11 22 33 44 55 66 77 88); fi
for s in "${SEEDL[@]}"; do [[ "$s" =~ ^[0-9]+$ ]] || { echo "✗ 시드: $s"; exit 2; }; done
[ ${#SEEDL[@]} -lt 8 ] && echo "· 시드 ${#SEEDL[@]} 개 — 수치 판단은 8 개 이상으로(playbot README v870: 한 회차 층당 사망이 두 배까지 흔들린다)"
RA=(); RB=()
for r in "${RANGES[@]}"; do
  case "$r" in act1) r=1-30 ;; act2) r=31-60 ;; act3) r=61-90 ;; act4) r=91-120 ;; esac
  [[ "$r" =~ ^([0-9]+)-([0-9]+)$ ]] || { echo "✗ 층 구간: $r (A-B)"; exit 2; }
  a=${BASH_REMATCH[1]}; b=${BASH_REMATCH[2]}
  [ "$a" -ge 1 ] && [ "$b" -ge "$a" ] && [ "$b" -le 120 ] || { echo "✗ 층 구간: $r"; exit 2; }
  case "$a" in 1|31|61|91) ;; *) echo "· 시작층 $a — 단축 시작 레벨은 1층 1 · 31층~ 22 · 61층~ 27 · 91층~ 30 이라 그 막 중간부터는 레벨이 실제보다 낮거나 높다" ;; esac
  RA+=("$a"); RB+=("$b")
done

# ── 일 목록(시드가 가장 바깥 — 도중에 끊겨도 조건·직업이 고르게 남는다) ──
JN=(); JC=(); JA=(); JB=(); JS=(); JQ=()
for s in "${SEEDL[@]}"; do for i in "${!CONDN[@]}"; do for k in "${!RA[@]}"; do for c in "${CLS[@]}"; do
  name="${CONDN[$i]}__${c}__f${RA[$k]}-${RB[$k]}__s${s}"
  if [ $FORCE -eq 0 ] && [ -s "$OUT/runs/$name.json" ]; then continue; fi
  JN+=("$name"); JC+=("$c"); JA+=("${RA[$k]}"); JB+=("${RB[$k]}"); JS+=("$s"); JQ+=("${CONDQ[$i]}")
done; done; done; done
echo "· 일 ${#JN[@]} 개(건너뛴 기존 결과 제외) · 동시 $J · 포트 $PORTS · 결과 $OUT"
if [ $DRY -eq 1 ]; then for x in "${!JN[@]}"; do printf '  %s  query=[%s]%s\n' "${JN[$x]}" "${JQ[$x]}" "${MERC:+  merc=$MERC}"; done; exit 0; fi
[ ${#JN[@]} -gt 0 ] || { echo "· 할 일이 없다 — node $HERE/agg.js $OUT"; exit 0; }

# ── 서버 ────────────────────────────────────────────────
IFS=',' read -r -a PL <<< "$PORTS"
up() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$1/index.html")" = "200" ]; }
FILE_MD5="$(md5sum < "$ROOT/index.html" | cut -c1-12)"
VER="$(grep -o -m1 "GAME_VERSION = 'v[0-9]*'" "$ROOT/index.html" | grep -o 'v[0-9]*')"
for p in "${PL[@]}"; do
  [[ "$p" =~ ^[0-9]+$ ]] || { echo "✗ 포트: $p"; exit 2; }
  if ! up "$p"; then
    # ( … & ) — 서버가 이 스크립트의 자식으로 남으면 마지막 wait 가 서버까지 기다려 묶음이 안 끝난다
    # pid 는 server-<포트>.pid 에 — 묶음이 끝나도 서버는 남는다(다음 묶음이 다시 쓴다). 끄기: kill "$(cat <결과 폴더>/server-<포트>.pid)"
    ( setsid nohup python3 -m http.server "$p" --bind 127.0.0.1 --directory "$ROOT" > "$OUT/server-$p.log" 2>&1 < /dev/null & echo $! > "$OUT/server-$p.pid" )
    for _ in $(seq 1 40); do up "$p" && break; sleep 0.25; done
    up "$p" || { echo "✗ localhost:$p 서버를 못 띄웠다($OUT/server-$p.log)"; exit 1; }
    echo "· localhost:$p 서버를 저장소 루트에서 띄웠다(묶음이 끝나도 남는다 — 끄기: kill \$(cat $OUT/server-$p.pid))"
  fi
  m="$(curl -s --max-time 30 "http://127.0.0.1:$p/index.html" | md5sum | cut -c1-12)"
  if [ "$m" != "$FILE_MD5" ]; then
    echo "✗ localhost:$p 가 서빙하는 index.html(md5 $m)이 저장소 것($FILE_MD5)과 다르다 — 다른 폴더에서 띄운 서버다."
    echo "    끄고 다시: pkill -f \"http.serve[r] $p\"   ([r] — 패턴이 자기 명령줄에 걸려 셸이 죽는 것 방지)"
    exit 1
  fi
done

STAMP="$(date +%Y%m%d-%H%M%S)"
{
  echo "date      $(date '+%F %T')"
  echo "version   $VER   index.html md5 $FILE_MD5"
  echo "git       $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null) $(git -C "$ROOT" status --porcelain index.html 2>/dev/null | head -1)"
  echo "classes   ${CLS[*]}"; echo "seeds     ${SEEDL[*]}"; echo "ranges    ${RANGES[*]}"
  for i in "${!CONDN[@]}"; do echo "cond      ${CONDN[$i]} = [${CONDQ[$i]}]"; done
  echo "merc      ${MERC:--}"; echo "ports     $PORTS   -j $J   timeout $TO"; echo "jobs      ${#JN[@]}"
} > "$OUT/batch-$STAMP.txt"
rm -f "$OUT"/pids/*   # 지난 묶음이 남긴 pid 파일(재사용된 pid 를 엉뚱하게 죽이지 않게)
echo $$ > "$OUT/batch.pid"

# ── 실행 ────────────────────────────────────────────────
declare -A PIDPORT=()
STOP=0; TAINT=0
cleanup() {
  STOP=1; echo "· 중단 — 실행 중인 run 을 끈다"
  for f in "$OUT"/pids/*; do [ -f "$f" ] && kill -TERM "$(cat "$f")" 2>/dev/null; done
}
ALLP=()   # 띄운 run 의 subshell pid — wait 는 이것만(맨 wait 는 다른 자식까지 기다린다)
trap 'cleanup; [ ${#ALLP[@]} -gt 0 ] && wait "${ALLP[@]}" 2>/dev/null; rm -f "$OUT/batch.pid"; exit 130' INT TERM

prune() { local p; for p in "${!PIDPORT[@]}"; do kill -0 "$p" 2>/dev/null || unset "PIDPORT[$p]"; done; }
pick_port() {   # 지금 덜 바쁜 포트
  local best="" bn=999 p n q
  for p in "${PL[@]}"; do n=0; for q in "${PIDPORT[@]}"; do [ "$q" = "$p" ] && n=$((n + 1)); done
    [ $n -lt $bn ] && { bn=$n; best=$p; }; done
  echo "$best"
}
launch() {   # name cls a b seed query port
  local name="$1" json="$OUT/runs/$1.json" log="$OUT/logs/$1.log"
  (
    cd "$ROOT/viewers/playbot" || exit 1
    PB_PORT="$7" DL_MERC="$MERC_T" DL_MGEAR="$MERC_G" timeout "$TO" \
      node -r "$PRE" "$RUNJS" "$2" "$3" "$4" "$5" "$json.part" "$6" > "$log" 2>&1 < /dev/null &
    tp=$!; echo "$tp" > "$OUT/pids/$name"; wait "$tp"; rc=$?; rm -f "$OUT/pids/$name"
    if [ $rc -eq 0 ] && [ -s "$json.part" ]; then mv "$json.part" "$json"; st="ok $(grep -o 'deaths [0-9]*' "$log" | tail -1)"
    else rm -f "$json.part"; st="FAIL rc=$rc ($( [ $rc -eq 124 ] && echo timeout || tail -c 160 "$log" | tr '\n' ' '))"; fi
    echo "$(date +%T) $name $st" >> "$OUT/done.txt"
    echo "· $(date +%T) $name — $st"
  ) &
  PIDPORT[$!]="$7"; ALLP+=($!)
}

T0=$(date +%s)
for x in "${!JN[@]}"; do
  while :; do prune; [ ${#PIDPORT[@]} -lt "$J" ] && break; sleep 2; [ $STOP -eq 1 ] && break; done
  [ $STOP -eq 1 ] && break
  if [ "$(md5sum < "$ROOT/index.html" | cut -c1-12)" != "$FILE_MD5" ]; then
    TAINT=1; echo "⚠ index.html 이 측정 도중 바뀌었다 — 남은 $(( ${#JN[@]} - x )) 개는 띄우지 않는다(이미 뜬 것은 끝까지 돈다)"; break
  fi
  p="$(pick_port)"
  echo "▶ $(date +%T) [$((x + 1))/${#JN[@]}] ${JN[$x]} (port $p${JQ[$x]:+ · ${JQ[$x]}})"
  launch "${JN[$x]}" "${JC[$x]}" "${JA[$x]}" "${JB[$x]}" "${JS[$x]}" "${JQ[$x]}" "$p"
done
[ ${#ALLP[@]} -gt 0 ] && wait "${ALLP[@]}" 2>/dev/null
rm -f "$OUT/batch.pid"
[ "$(md5sum < "$ROOT/index.html" | cut -c1-12)" != "$FILE_MD5" ] && TAINT=1
if [ $TAINT -eq 1 ]; then echo "TAINTED: index.html changed during batch $STAMP" >> "$OUT/batch-$STAMP.txt"; echo "⚠ 측정 도중 index.html 이 바뀌었다 — 이 묶음 결과는 두 빌드가 섞였을 수 있다(batch-$STAMP.txt)"; fi
# 실패는 '아직 결과가 없는 것'만 센다(끊겼다가 이어 돌려 성공한 run 의 예전 FAIL 줄은 done.txt 에 남는다)
NOK=$(ls "$OUT"/runs/*.json 2>/dev/null | wc -l)
NF=$(awk '$3=="FAIL" {print $2}' "$OUT/done.txt" 2>/dev/null | sort -u | while read -r n; do [ -s "$OUT/runs/$n.json" ] || echo "$n"; done | wc -l)
echo "· 끝 — $(( ($(date +%s) - T0) / 60 ))분 · 결과 ${NOK:-0} 개 · 결과 없는 실패 ${NF:-0} 개(bash $HERE/status.sh $OUT — 같은 명령을 다시 부르면 실패한 것만 다시 돈다)"
echo "  집계: node $HERE/agg.js $OUT"
