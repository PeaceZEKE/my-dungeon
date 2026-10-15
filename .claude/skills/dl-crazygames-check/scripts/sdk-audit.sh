#!/usr/bin/env bash
# dl-crazygames-check · CrazyGames SDK·규정 정적 점검(grep)
#
#   bash .claude/skills/dl-crazygames-check/scripts/sdk-audit.sh [index.html 경로=저장소 루트의 index.html]
#
# 게임 스크립트(마지막 <script> 블록)와 마크업(첫 동봉 라이브러리 블록 앞)만 본다 — three.js·데이터 블록은 안 본다.
# 줄 번호는 '지금 파일' 기준이다(데이터 블록이 늘 때마다 밀린다). '근처 함수'는 가장 가까운 앞쪽 function 선언이라 대략이다.
#
# 표시: ✗ Basic Launch 제출 전에(P0 — SKILL.md 1절) · ⚠ Full Launch 요청 전에(P1 — 2절) · ? 사람이 보고 판단 · ✓ 맞음 · · 정보
# 종료 코드: 0 = ✗ 없음 · 1 = ✗ 있음 · 2 = 파일·구조 문제
# 근거: CLAUDE.md 'CrazyGames 준수사항' · docs.crazygames.com/requirements/{ads,technical,gameplay}/ · /sdk/video-ads/ ·
#       sdk.crazygames.com/crazygames-sdk-v3.js(2026-10-15 확인 — requestAd 는 동기 반환, 결과는 콜백뿐 ·
#       Basic Launch 면 바로 adError('adsDisabledBasicLaunch') · adError 콜백이 없으면 adFinished 를 대신 부른다)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || (cd "$HERE/../../../.." && pwd))"
F="${1:-$ROOT/index.html}"
[ -f "$F" ] || { echo "✗ 파일 없음: $F"; exit 2; }

S=$(grep -n '^<script>$' "$F" | tail -1 | cut -d: -f1)
E=$(grep -n '^</script>$' "$F" | tail -1 | cut -d: -f1)
LIB=$(grep -n '^<script>/\*' "$F" | head -1 | cut -d: -f1)
{ [ -n "$S" ] && [ -n "$E" ] && [ "$S" -lt "$E" ]; } || { echo "✗ 게임 스크립트 블록(^<script>$ … ^</script>$)을 못 찾았다"; exit 2; }
[ -n "$LIB" ] || LIB=$S
VER=$(grep -o -m1 "GAME_VERSION = 'v[0-9]*'" "$F" | grep -o 'v[0-9]*')
BYTES=$(wc -c < "$F" | tr -d ' ')
GZ=$(gzip -9 -c "$F" | wc -c | tr -d ' ')
export S E LIB

NX=0; NW=0; NQ=0; NO=0
bad()  { NX=$((NX + 1)); echo "  ✗ $*"; }
warn() { NW=$((NW + 1)); echo "  ⚠ $*"; }
ask()  { NQ=$((NQ + 1)); echo "  ? $*"; }
ok()   { NO=$((NO + 1)); echo "  ✓ $*"; }
info() { echo "  · $*"; }
mb()   { awk -v b="$1" 'BEGIN { printf "%.2fMB", b / 1048576 }'; }

# 패턴은 ENVIRON 으로 넘긴다 — awk -v 는 역슬래시를 문자열 이스케이프로 먹는다(gawk 는 경고, mawk 는 그대로 — 환경마다 다르다)
# G: 게임 스크립트에서 패턴(ERE) → "줄: 내용"(앞 공백 정리, 140자) · GN: 개수 · GM: 마크업 + 게임 스크립트
G()  { P="$1" awk 'NR > ENVIRON["S"] + 0 && NR < ENVIRON["E"] + 0 && $0 ~ ENVIRON["P"] { t = $0; sub(/^[ \t]+/, "", t); print NR ": " substr(t, 1, 140) }' "$F"; }
GN() { P="$1" awk 'NR > ENVIRON["S"] + 0 && NR < ENVIRON["E"] + 0 && $0 ~ ENVIRON["P"] { n++ } END { print n + 0 }' "$F"; }
GM() { P="$1" awk '(NR < ENVIRON["LIB"] + 0 || (NR > ENVIRON["S"] + 0 && NR < ENVIRON["E"] + 0)) && $0 ~ ENVIRON["P"] { t = $0; sub(/^[ \t]+/, "", t); print NR ": " substr(t, 1, 140) }' "$F"; }
# 호출처: 정의 줄(D)은 빼고 '근처 함수'를 붙인다 — function 선언 · (async function 이름( IIFE · onTap($('id')
CALLS() {
  P="$1" D="$2" awk '
    NR > ENVIRON["S"] + 0 && NR < ENVIRON["E"] + 0 {
      if (match($0, /^[ \t]*\(?(async[ \t]+)?function[ \t]+[A-Za-z0-9_$]+/)) { f = substr($0, RSTART, RLENGTH); sub(/^[ \t]*\(?(async[ \t]+)?function[ \t]+/, "", f); fn = f }
      else if (match($0, /^onTap\(\$\(.[A-Za-z0-9_]+.\)/)) { fn = "onTap(#" substr($0, RSTART + 9, RLENGTH - 11) ")" }
      if ($0 ~ ENVIRON["P"] && !(ENVIRON["D"] != "" && $0 ~ ENVIRON["D"])) { t = $0; sub(/^[ \t]+/, "", t); printf "      %6d  %-24s %s\n", NR, fn, substr(t, 1, 96) }
    }' "$F"
}
# L 줄의 requestAd( … ) 호출식 전체(괄호 짝이 맞을 때까지, 최대 30줄)
CALLTEXT() {
  L="$1" awk 'NR >= ENVIRON["L"] + 0 && NR < ENVIRON["L"] + 30 {
      s = (NR == ENVIRON["L"] + 0) ? substr($0, index($0, "requestAd(")) : $0
      for (i = 1; i <= length(s); i++) { c = substr(s, i, 1); out = out c; if (c == "(") d++; else if (c == ")") { d--; if (d == 0) { print out; exit } } }
      out = out "\n"
    } END { if (d > 0) print out }' "$F"
}
# N 줄에서 시작하는 함수 본문(다음 '^}' 줄까지)
BODY() { N="$1" awk 'NR >= ENVIRON["N"] + 0 { print; if (NR > ENVIRON["N"] + 0 && /^}/) exit }' "$F"; }

echo "== CrazyGames 정적 점검 · $(basename "$F") ${VER:-?} · $BYTES B ($(mb "$BYTES"), gzip $(mb "$GZ")) · 게임 스크립트 $((S + 1))~$((E - 1))줄"

# ---------------------------------------------------------------- 1
echo "[1] 크기·외부 의존 (requirements/technical: 초기 다운로드 ≤ 50MB · 모바일 홈 노출 ≤ 20MB · 전체 ≤ 250MB/1,500파일)"
if [ "$BYTES" -le 20971520 ]; then ok "단일 파일 $(mb "$BYTES") ≤ 20MB — 다른 파일을 안 부르므로 이게 초기 다운로드 전부(SDK 스크립트는 CrazyGames 쪽)"
elif [ "$BYTES" -le 52428800 ]; then warn "$(mb "$BYTES") — 50MB 이하지만 20MB 초과(모바일 홈에 안 걸린다)"
else bad "$(mb "$BYTES") > 50MB(초기 다운로드 한도)"; fi
EXT=$(awk -v l="$LIB" 'NR < l' "$F" | grep -o '<\(script\|link\|img\|iframe\)[^>]*\(src\|href\)="https\?://[^"]*"' | grep -o 'https\?://[^"]*' | sort -u)
for u in $EXT; do case "$u" in https://sdk.crazygames.com/*) ok "외부 스크립트는 SDK 하나: $u";; *) ask "외부 리소스: $u (차단·오프라인에서도 뜨는지)";; esac; done
[ -z "$EXT" ] && warn "SDK 스크립트 태그(crazygames-sdk-v3.js)가 없다 — Basic 은 선택이지만 Full 은 필수"

# ---------------------------------------------------------------- 2
echo "[2] SDK 호출 위치 (sdk/game · sdk/video-ads)"
info "SDK 직접 호출(window.CrazyGames.SDK.*):"
CALLS 'CrazyGames[.]SDK[.][a-zA-Z]+' ''
[ "$(GN 'SDK[.]init[(]')" -gt 0 ] && ok "SDK.init() 있음" || warn "SDK.init() 없음"
for w in cgLoadingStop cgGameplayStart cgGameplayStop cgHappytime cgShowMidgame cgShowRewarded; do
  n=$(GN "(^|[^A-Za-z0-9_])$w[(]"); d=$(GN "function $w[(]")
  [ "$n" -eq 0 ] && continue
  info "$w — 정의 $d · 호출 $((n - d))곳:"
  CALLS "(^|[^A-Za-z0-9_])$w[(]" "function $w[(]"
done
GSITES=$(CALLS '(^|[^A-Za-z0-9_])cgGameplayStart[(]' 'function cgGameplayStart[(]')
# v898: 캐릭터 카드 처리(beginGameWith)가 부르는 함수 중 1층을 바로 시작하는 것(enterDungeonFromTown · resetGame · startFloor)이 있으면 1클릭 경로
QS=""; BG=$(G 'function beginGameWith[(]' | head -1 | cut -d: -f1)
if [ -n "$BG" ]; then
  for fn in $(BODY "$BG" | grep -o '[A-Za-z_][A-Za-z0-9_]*(' | tr -d '(' | sort -u); do
    FL=$(G "function $fn[(]" | head -1 | cut -d: -f1); [ -z "$FL" ] && continue
    if BODY "$FL" | grep -qE 'enterDungeonFromTown\(|resetGame\(|startFloor\('; then QS="$fn ${FL}줄 · 조건 $(BODY "$BG" | grep -m1 "$fn(" | sed 's/^[ \t]*//' | cut -c1-80)"; break; fi
  done
fi
if [ -z "$GSITES" ] && [ "$(GN 'SDK[.]game[.]gameplayStart')" -le 1 ]; then
  bad "gameplayStart 호출처가 없다 — SDK 를 넣었으면 처음 플레이 가능한 순간에 꼭(초기 다운로드를 그 시점까지 잰다)"
elif [ -n "$QS" ] && printf '%s' "$GSITES" | grep -q 'startFloor'; then
  ok "캐릭터 카드(beginGameWith ${BG}줄) → 1층(startFloor 의 gameplayStart): $QS — 실제 1클릭은 cg-sim 으로"
elif printf '%s' "$GSITES" | grep -qE 'beginGame|buildTownScene|enterTownMode|exitTownToDungeon|onTap\(#.char'; then
  ok "gameplayStart 가 첫 클릭 경로에도 있다: $(printf '%s' "$GSITES" | awk '{print $1" "$2}' | tr '\n' ' ')"
else
  bad "첫 gameplayStart 는 $(printf '%s' "$GSITES" | awk '{print $2}' | sort -u | tr '\n' ' ')뿐 — 신규 유저는 캐릭터 선택 → 마을을 걸어 구덩이까지 가야 불린다. Full 조건 '신규 유저는 최대 1클릭으로 게임플레이'(requirements/gameplay) · Basic 초기 다운로드 측정 끝점. 1클릭 → 1층으로 바꾸면 이 줄이 ✓ 가 되게 할 것"
fi

# ---------------------------------------------------------------- 3
echo "[3] 광고 (requirements/ads · sdk/video-ads)"
RA=$(P='requestAd[(]' awk 'NR > ENVIRON["S"] + 0 && NR < ENVIRON["E"] + 0 && $0 ~ ENVIRON["P"] { print NR }' "$F")
[ -z "$RA" ] && info "requestAd 호출 없음(광고 안 씀)"
for L in $RA; do
  C=$(CALLTEXT "$L")
  FNL=$(awk -v s="$S" -v l="$L" 'NR > s && NR < l && /^[ \t]*\(?(async[ \t]+)?function[ \t]+[A-Za-z0-9_$]+/ { n = NR } END { print n + 0 }' "$F")
  # 콜백을 변수로 넘기면(requestAd(type, cbs)) 같은 함수 안에서 그 변수를 만든 곳까지 함께 본다(v898 cgRequestAd)
  CBV=$(printf '%s' "$C" | head -1 | sed -n 's/^requestAd([^,]*,[ \t]*\([A-Za-z_$][A-Za-z0-9_$]*\)[ \t]*).*/\1/p')
  if [ -n "$CBV" ]; then C="$C
$(sed -n "${FNL},${L}p" "$F")"; fi
  FN=$(sed -n "${FNL}p" "$F" | grep -o 'function [A-Za-z0-9_$]*' | head -1 | cut -d' ' -f2)
  TYPE=$(printf '%s' "$C" | grep -o "requestAd(['\"][a-z]*" | head -1 | grep -o '[a-z]*$')
  info "$L ${FN:-?} [${TYPE:-?}] $(printf '%s' "$C" | head -1 | cut -c1-90)"
  if ! printf '%s' "$C" | grep -q 'adError'; then
    if [ "$TYPE" = rewarded ]; then
      bad "$L: 보상형에 adError 콜백이 없다 — SDK v3 requestAd 는 동기 반환(결과는 콜백뿐)이라 다음 줄의 보상이 광고 결과와 무관하게 바로 나간다. Basic Launch(adsDisabledBasicLaunch)·광고 차단·로드 실패에도 공짜 보상(규정: adError 면 보상 금지)"
    else
      bad "$L: ${TYPE:-?} 에 adError/adFinished 콜백이 없다 — 광고가 도는 동안 진행(onDone)·음소거 해제가 바로 일어난다(규정: adFinished/adError 까지 UI 를 막는다 — Full QA 탈락 사유. Basic 은 광고가 꺼져 있어 증상이 없지만 보상형과 같은 수정이다)"
    fi
  else ok "$L: adError 콜백 있음"; fi
  if printf '%s' "$C" | grep -q 'adError' && ! printf '%s' "$C" | grep -q 'adFinished'; then bad "$L: adFinished 콜백이 없다 — 보상·진행 재개는 adFinished 에서만"; fi
  if printf '%s' "$C" | grep -q 'adStarted'; then
    # adStarted 콜백 몸통(여러 줄이어도 — 중괄호 깊이로 끝을 찾는다) 안의 음소거는 맞는 자리다(v899: 시간 제한 뒤 늦게 시작된 광고)
    PRE=$(awk -v a="$FNL" -v b="$L" 'NR >= a && NR < b {
        if (!ins && /adStarted/) { ins = 1; d = 0; seen = 0 }
        if (ins) { n = gsub(/[{]/, "{"); m = gsub(/[}]/, "}"); d += n - m; if (n > 0) seen = 1; if (seen && d <= 0) ins = 0; next }
        if (/setMusicPausedForAd\(true\)|suspendForAd\(/) print NR }' "$F" | head -1)
    if [ -n "$PRE" ]; then bad "$L: adStarted 콜백이 있는데 음소거를 그 밖(${PRE}줄)에서도 한다 — 광고가 안 뜨면(Basic·차단) 소리가 끊긴다"
    else ok "$L: adStarted 콜백 있음 · 음소거는 그 안에서만"; fi
  else
    PRE=$(awk -v a="$FNL" -v b="$L" 'NR >= a && NR < b && /setMusicPausedForAd\(true\)|suspendForAd\(/ { print NR }' "$F" | head -1)
    if [ -n "$PRE" ]; then bad "$L: 음소거를 광고 요청 전(${PRE}줄)에 한다 — 규정은 광고가 실제로 시작될 때(adStarted). 광고가 안 뜨면(Basic·차단) 잠깐 소리가 끊긴다"
    else bad "$L: adStarted 콜백이 없다 — 음소거·일시정지를 걸 자리가 없다"; fi
  fi
done
if [ "$(GN 'adsDisabledBasicLaunch')" -gt 0 ]; then ok "adsDisabledBasicLaunch 처리 있음: $(G 'adsDisabledBasicLaunch' | head -1 | cut -c1-90)"
else bad "adsDisabledBasicLaunch 처리 없음 — Basic 동안 광고가 꺼져 있는데 광고 버튼(부활·리롤·골드 2배)이 보인다($(G 'cgAdsAvailable = .*env' | head -1 | cut -c1-80))"; fi
MG=$(G 'lastMidgameAt < [0-9]+' | head -1)
if [ -n "$MG" ]; then
  ms=$(printf '%s' "$MG" | grep -o 'lastMidgameAt < [0-9]*' | grep -o '[0-9]*$')
  if [ "$ms" -ge 120000 ]; then ok "미드게임 자체 하한 $((ms / 1000))초(CLAUDE.md 2분 · SDK 자동 상한 3분에 1번): ${MG%%:*}줄"; else bad "미드게임 하한 $((ms / 1000))초 < 120초(CLAUDE.md 준수사항)"; fi
else warn "미드게임 자체 하한(lastMidgameAt < 120000)을 못 찾았다(CLAUDE.md 준수사항)"; fi
info "미드게임 호출처(전투 중·메뉴 이동 버튼에서 금지 · 보상형 직후 연달아 금지): $(CALLS '(^|[^A-Za-z0-9_])cgShowMidgame[(]' 'function cgShowMidgame' | awk '{print $1" "$2}' | tr '\n' ' ')"
RV=$(G 'lastReviveOfferAt[)]? > [0-9]+' | head -1)
[ -n "$RV" ] && info "부활 광고 제안 쿨다운 $(printf '%s' "$RV" | grep -o '> [0-9]*' | grep -o '[0-9]*')ms(${RV%%:*}줄) · 회차당 1회(runReviveUsed) · 골드 부활 대안 — 액션 가이드 권장: 세션당 1회 · 5초 카운트다운 · 부활 뒤 무적 2~3초"
SRO=$(G 'function showReviveOffer' | head -1 | cut -d: -f1)
if [ -n "$SRO" ]; then
  if BODY "$SRO" | grep -qiE 'countdown|카운트|setInterval'; then ok "부활 제안에 카운트다운 있음(showReviveOffer ${SRO}줄)"
  else warn "부활 제안(showReviveOffer ${SRO}줄)에 5초 카운트다운 없음(액션 장르 가이드 권장)"; fi
fi

# ---------------------------------------------------------------- 4
echo "[4] 오디오 (CLAUDE.md: 광고 중 SFX.suspendForAd()/resumeAfterAd() · requirements: muteAudio 필수)"
if [ "$(GN 'function suspendForAd[(]')" -gt 0 ] && [ "$(GN 'function resumeAfterAd[(]')" -gt 0 ]; then ok "SFX.suspendForAd/resumeAfterAd 정의: $(G 'function (suspendForAd|resumeAfterAd)[(]' | cut -d: -f1 | tr '\n' ' ')"
else bad "SFX.suspendForAd/resumeAfterAd 정의가 없다(CLAUDE.md 준수사항)"; fi
[ "$(GN 'SFX[.]suspendForAd[(][)]')" -gt 0 ] && ok "광고 경로에서 호출: $(G 'SFX[.](suspendForAd|resumeAfterAd)[(][)]' | cut -d: -f1 | tr '\n' ' ')(setMusicPausedForAd — 미드게임·보상형 둘 다)" || bad "광고 경로에서 SFX.suspendForAd() 를 안 부른다(CLAUDE.md 준수사항)"
AUD=$(G 'new [(]?window[.](webkit)?AudioContext|new Audio[(]|createElement[(].audio.[)]' | cut -d: -f1 | tr '\n' ' ')
info "오디오 생성처: ${AUD:-없음}— 소리가 전부 이 ctx 하나를 거쳐야 suspendForAd 로 다 멈춘다(<audio>·새 AudioContext 를 따로 만들면 광고 중에 샌다)"
if [ "$(GN 'muteAudio')" -gt 0 ]; then ok "muteAudio 처리 있음: $(G 'muteAudio' | head -1 | cut -c1-90)"
else warn "muteAudio(SDK.game.settings.muteAudio · addSettingsChangeListener) 미지원 — HTML5 게임 Full 필수"; fi
[ "$(GN "visibilitychange|'interrupted'|pageshow")" -gt 0 ] && ok "백그라운드 복귀 오디오 처리 있음" || warn "visibilitychange/'interrupted' 처리 없음 — ac() 는 'suspended' 일 때 다음 소리에서만 resume(iOS·CrazyGames 앱은 백그라운드 복귀 때 AudioContext resume 필요 — requirements/technical)"

# ---------------------------------------------------------------- 5
echo "[5] 저장·언어·기타 SDK (Full 필수/권장)"
LSK=$(G "localStorage[.](get|set)Item[(]'[a-z_]+'" | grep -o "Item('[a-z_]*'" | grep -o "'[a-z_]*'" | sort -u | tr '\n' ' ')
[ "$(GN 'SDK[.]data[.]|[.]data[.](get|set)Item')" -gt 0 ] && ok "Data 모듈 사용" || warn "SDK Data 모듈 미사용 — localStorage 키: ${LSK}+ metaKey()(dungeon_meta · dungeon_meta_test) · 1MB 이내 · 제출 때 Progress Save 토글"
[ "$(GN 'systemInfo')" -gt 0 ] && ok "systemInfo(locale) 사용" || bad "SDK user.systemInfo.locale 로 언어를 안 고른다(requirements/gameplay — 없으면 영어). 지금은 저장값 → navigator.language → en(detectLang $(G 'function detectLang' | cut -d: -f1)줄) — locale 을 navigator 앞에 끼우면 된다"
[ "$(GN 'setGameContext')" -gt 0 ] && ok "setGameContext 사용" || info "setGameContext 없음(권장 — 싫어요 피드백에 층·직업이 붙는다)"
info "happytime 호출: $(CALLS '(^|[^A-Za-z0-9_])cgHappytime[(]' 'function cgHappytime' | awk '{print $1" "$2}' | tr '\n' ' ')(보스 처치·신기록 같은 순간에만 아껴서)"
[ "$(GN 'reportGameCompletedPercentage')" -gt 0 ] && info "진행도 보고: $(CALLS 'reportGameCompletedPercentage' '' | awk '{print $1" "$2}' | tr '\n' ' ')"

# ---------------------------------------------------------------- 6
echo "[6] 개발자 버튼 (CLAUDE.md: 일반 접속에서 bossTestBtn/maxLevelBtn 노출 금지 — ?dev=1 · ?adtest=1 · 제목 5연타로만)"
for id in bossTestBtn maxLevelBtn; do
  M=$(grep -n "id=\"$id\"" "$F" | head -1)
  [ -z "$M" ] && { info "$id 마크업 없음"; continue; }
  if printf '%s' "$M" | grep -q 'display: *none'; then ok "$id 마크업부터 숨김(${M%%:*}줄)"
  else info "$id 마크업(${M%%:*}줄)은 기본 보임 → 부팅 스크립트가 숨긴다(게임 스크립트가 그 전에 죽으면 보인다 — 부팅은 dl-release smoke.js 로)"; fi
done
DEVL=$(G '^const DEV_MODE *=' | head -1); ADL=$(G '^const AD_TEST *=' | head -1)
if printf '%s\n%s\n' "$DEVL" "$ADL" | grep -qE '= *true|\|\| *true|true *;'; then bad "DEV_MODE/AD_TEST 가 켜진 채 박혀 있다: $DEVL / $ADL"
elif printf '%s' "$DEVL" | grep -q 'location[.]search' && printf '%s' "$ADL" | grep -q 'location[.]search'; then ok "DEV_MODE·AD_TEST 는 URL 로만(${DEVL%%:*}·${ADL%%:*}줄)"
else ask "DEV_MODE/AD_TEST 정의를 눈으로 확인: $DEVL / $ADL"; fi
HIDE=$(awk -v s="$S" -v e="$E" 'NR > s && NR < e && /if \(!DEV_MODE\)/ { a = NR } a && NR >= a && NR <= a + 4 && /bossTestBtn/ { print a; exit }' "$F")
[ -n "$HIDE" ] && ok "!DEV_MODE 면 부팅 때 숨김: ${HIDE}줄" || bad "!DEV_MODE 일 때 bossTestBtn/maxLevelBtn 을 숨기는 코드를 못 찾았다(CLAUDE.md 준수사항)"
RVL=$(G 'function wireDevReveal' | head -1)
[ -n "$RVL" ] && info "숨김 제스처: 제목 5연타(탭 사이 3초 안) — ${RVL%%:*}줄 · 새로고침하면 다시 숨김" || info "숨김 제스처 없음"
info "버튼 표시를 바꾸는 곳 전부(숨김·만렙 취소 때 다시 보임): $(G "'bossTestBtn', 'maxLevelBtn'" | cut -d: -f1 | tr '\n' ' ')"

# ---------------------------------------------------------------- 7
echo "[7] 그 밖의 규정 (requirements/gameplay)"
for L in $(awk -v s="$S" -v e="$E" 'NR > s && NR < e && /requestFullscreen/ { print NR }' "$F"); do
  if awk -v a="$((L - 8))" -v b="$L" 'NR >= a && NR <= b' "$F" | grep -q 'inFrame'; then ok "requestFullscreen ${L}줄은 iframe 밖 첫 터치에서만(inFrame 가드) — 게임 안 전체화면 버튼 아님"
  else ask "requestFullscreen ${L}줄 — 게임 안 자체 전체화면 버튼은 금지. 무엇이 부르는지 확인"; fi
done
FSB=$(awk -v l="$LIB" 'NR < l && /<button/' "$F" | grep -i -n 'full *screen\|fullscreen\|전체 *화면\|⛶' | head -3)
[ -n "$FSB" ] && ask "전체화면 버튼 후보: $(printf '%s' "$FSB" | cut -c1-120)" || ok "마크업에 전체화면 버튼 없음"
LNK=$(GM 'href="https?:|window[.]open[(]|location[.](href|assign) *[=(]')
[ -n "$LNK" ] && ask "외부 링크 후보(다른 게임 홍보·외부 링크 금지): $(printf '%s' "$LNK" | head -3 | tr '\n' ' ')" || ok "외부 링크·새 창 없음"
STORE=$(GM 'play[.]google[.]com|apps[.]apple[.]com|itunes[.]apple|itch[.]io|poki[.]com|github[.]io')
[ -n "$STORE" ] && bad "앱스토어·다른 포털·자체 호스팅 링크/문구: $(printf '%s' "$STORE" | head -3 | tr '\n' ' ')" || ok "앱스토어·다른 포털 링크 없음"
KC=$(GN 'e[.]code'); KK=$(GN "[.]key *(===|==|!==) *'")
if [ "$KK" -eq 0 ]; then ok "키 입력은 e.code(물리 위치) ${KC}곳 — AZERTY 에서도 WASD 자리 그대로(ZQSD)"
else ask "e.key 비교 ${KK}곳 — AZERTY 에서 어긋날 수 있다: $(G "[.]key *(===|==|!==) *'" | head -2 | tr '\n' ' ')"; fi
ROT=$(G '^const ROT_ON *=' | head -1)
if [ -n "$ROT" ]; then
  if printf '%s' "$ROT" | grep -qE 'inFrame|window[.]top|self *!=='; then ok "가로 돌려 그리기(ROT_ON)는 iframe 밖에서만: ${ROT%%:*}줄"
  else bad "가로 돌려 그리기(ROT_ON ${ROT%%:*}줄)가 iframe 안에서도 켜진다 — CrazyGames 는 제출 때 방향을 정하므로 회전 로직이 필요 없다(requirements/technical). iframe 안에서는 끌 것"; fi
fi
[ "$(GM 'safe-area-inset')" ] && ok "safe-area 여백 있음" || warn "env(safe-area-inset-*) 여백 없음 — CrazyGames 앱은 전체 화면이라 노치·홈 바에 HUD 가 가릴 수 있다(resources/crazygames-app)"
[ "$(GN "'Escape'")" -gt 0 ] && ask "Escape 처리: $(G "'Escape'" | head -1 | cut -c1-80) — Esc 는 전체화면 종료 키(일시정지를 Esc 에만 맡기지 말 것)" || info "Esc 를 안 쓴다(전체화면 종료 키와 안 겹친다)"

echo "== 요약: ✗ $NX · ⚠ $NW · ? $NQ · ✓ $NO   (✗ Basic 제출 전 P0 · ⚠ Full 요청 전 P1 · ? 사람이 판단)"
[ "$NX" -gt 0 ] && exit 1
exit 0
