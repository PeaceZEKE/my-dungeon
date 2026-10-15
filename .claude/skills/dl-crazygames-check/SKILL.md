---
name: dl-crazygames-check
description: Dungeon Legion(index.html)을 CrazyGames 에 처음 제출하기 전(Basic Launch), Full Launch 를 요청하기 전, 그리고 출시 뒤 업데이트를 올리기 전에 따라가는 점검표. CLAUDE.md 'CrazyGames 준수사항'(광고 중 SFX.suspendForAd/resumeAfterAd 음소거 · bossTestBtn/maxLevelBtn 은 제목 5연타 전엔 숨김 · 미드게임 자체 하한 2분)과 공식 문서 규격(초기 다운로드 50MB/모바일 홈 20MB · 4GB 크롬북 · 최대 1클릭으로 게임플레이 · SDK v3 gameplayStart/Stop · requestAd 콜백(adStarted 에 음소거 · adError 면 보상 금지) · muteAudio · Data 모듈 · locale · PEGI 12 · 커버 1920x1080/800x1200/800x800 · 미리보기 영상 15~20초)을 정적 grep(sdk-audit.sh) · 가짜 SDK 실행 점검(cg-sim.js — Basic Launch adError·광고 재생·CPU 감속·WebGL1·모바일) · 커버/영상 규격 검사(covers.py)로 확인하고, Basic Launch 동안·이후 볼 지표(평균 플레이 10분+ · 1분 전환 80%+ · D1 10~15%)를 정리한다. 광고·SDK 코드·첫 화면 흐름·저장·언어·회전·콘텐츠 수위를 바꾼 뒤에도 쓴다. Triggers — 한국어 — 크레이지게임즈, 크레이지 게임즈, CrazyGames 제출, 제출 전 점검, 심사 준비, QA 준비, 베이직 런치, 풀 런치, 출시 전 체크리스트, 업데이트 올리기 전, SDK 점검, 광고 규정, 보상형 광고, 미드게임, 광고 중 음소거, gameplayStart, 개발자 버튼 숨김, PEGI, 커버 이미지, 썸네일 크기, 미리보기 영상, 크롬북, 저사양, 로딩 시간, 초기 다운로드, 출시 지표, D1, 전환율. English — CrazyGames submission, pre-submission checklist, Basic Launch, Full Launch, QA readiness, SDK audit, ad compliance, rewarded ad, midgame ad, mute during ads, gameplayStart placement, dev buttons hidden, PEGI 12, cover image sizes, thumbnail, preview video, Chromebook low-spec, load time, initial download size, launch metrics, retention.
---

# dl-crazygames-check — CrazyGames 제출·업데이트 전 점검

근거: `CLAUDE.md` **'CrazyGames 준수사항'**(되돌리면 안 되는 셋) + CrazyGames 공식 문서(맨 아래 출처 · 2026-10-14 조회) + CrazyGames 조사(2026-10-14~15 · v897 기준 — 문서·사이트·개발자 사례·SDK 스크립트). 충돌하면 CLAUDE.md 와 공식 문서가 이긴다.
표시: **✗ = Basic Launch 제출 전(P0)** · **⚠ = Full Launch 요청 전(P1)** · **?** 사람이 판단 · ✓ · ·(정보). 세 스크립트가 같은 표시를 쓴다.
실행 도구는 다른 스킬이다: `dl-harness`(부팅·층·뷰포트·`--eval`) · `dl-device-check`(뷰포트별 글씨·HUD) · `dl-release`(버전·`smoke.js`·커밋) · `dl-playbot`(난이도).

## 0. 자동 점검 세 개 (저장소 루트에서)

```bash
C=.claude/skills/dl-crazygames-check/scripts
SCRATCH="${TMPDIR:-/tmp}"                  # 세션에서는 시스템 프롬프트의 스크래치패드 경로로(저장소 안에 출력하지 말 것)
bash $C/sdk-audit.sh                       # 정적 grep 1초 — SDK 호출 위치 표 · 광고 콜백 · 음소거 · 개발자 버튼 · 링크 · 키 · 회전 (✗ 있으면 종료 1)
bash .claude/skills/dl-harness/scripts/serve.sh   # 서버(반드시 저장소 루트 — CLAUDE.md '테스트용 웹서버는…')
node $C/cg-sim.js                          # 가짜 SDK · 907x510 · 광고는 Basic 처럼 바로 adError (25초)
node $C/cg-sim.js --ad finish --vp 800x450 --touch --cpu 4   # 광고가 실제로 돌 때 · 모바일 · CPU 4배 감속
node $C/cg-sim.js --webgl1                 # WebGL1 폴백 부팅
python3 $C/covers.py <커버·영상 폴더> --out "$SCRATCH/thumbs.png"   # 커버·영상 규격 + 200x112 미리보기
```
- `cg-sim.js` 는 진짜 SDK 요청을 막고 `window.CrazyGames.SDK` 를 가짜로 심어 호출을 시각과 함께 기록한다. 가짜의 광고 동작은 `sdk.crazygames.com/crazygames-sdk-v3.js` 를 읽고 맞췄다(2026-10-15): **`requestAd` 는 아무것도 반환하지 않고 결과는 콜백뿐**, Basic Launch 면 그 자리에서 `adError({code:'adsDisabledBasicLaunch'})`, `adError` 가 없으면 `adFinished` 를 대신 부른다.
- **v897 결과(2026-10-15)**: sdk-audit ✗ 8 · ⚠ 5 / cg-sim 기본(`--ad error`) ✗ 3(1클릭 뒤 gameplayStart 없음 · adError 인데 보상 · locale) · `--ad finish` ✗ 8(+ 광고가 끝나기 전 보상 · 음소거 시점 · 미드게임이 광고 중에 진행) — 아래 1절의 숙제였다. **v898 결과(2026-10-15)**: sdk-audit ✗ 0 · ⚠ 3(Data 모듈 · 부활 카운트다운 · safe-area) / cg-sim `--ad error` ✗ 0 · `--ad finish --touch --cpu 4` ✗ 0(⚠ Data 모듈) — 고친 내용은 CLAUDE.md 'CrazyGames 준수사항' v898 절. cg-sim 이 못 보는 것(iframe 회전 · 첫 방문 언어 다시 열기 · muteAudio · Basic 사전 감지 · 부활 실패 · 광고 중 정지 · 콜백 시간 초과 · 신규/기존 유저 분기)은 페이지에 가짜 SDK 를 심어 따로 시험했다(전부 ✓). **v899(적대적 검토 반영)**: sdk-audit ✗ 0 · cg-sim 두 모드 ✗ 0 · 따로 시험(시간 제한 뒤 늦은 adStarted · 겹친 요청 busy · isAdPlaying 동안 기다림 · muteAudio 해제 때 곡 복구 · 언어마다 한 번 · local 환경 로캘 무시 · init 전 카드 → gameplayStart · 조작 안내 먼저) 전부 ✓ · 5·45·75·104층 픽셀 해시 v897 과 같음(`&quick=0`).
- 숫자는 SwiftShader(소프트웨어 GL) 값이다 — **로드 시간·fps 절대값은 실기기가 아니다.** `--cpu 1 ↔ 4`, 플래그 켬/끔 비율로만 본다(CLAUDE.md '…비율만 의미가 있다'). 크롬북·폰 판정은 실기기로.
- 하네스·cg-sim 을 한 서버에 여럿 동시에 돌리지 말 것(CLAUDE.md v827·v881 — `goto` 시간 초과).

## 1. Basic Launch 제출 전 (P0 — ✗ 가 하나라도 있으면 내지 않는다)

**첫 60초** — Basic 판정은 평균 플레이 시간·1분 전환·D1 을 다른 게임과 비교한다(docs 첫 페이지 · basic-launch-metrics). 통과·탈락을 가른 것은 콘텐츠 깊이가 아니라 첫 1분이었다(개발자 사례 One More Fly · Cyber Gomoku · Poki Vortella).
- [x] 신규 유저(저장 없음)가 **1클릭으로 1층 전투**에 들어간다 — v898 `quickStartDungeon`(`?quick=0` 이면 v897 처럼 마을부터 — 기존 유저는 늘 마을). cg-sim `캐릭터 1클릭 → gameplayStart` 가 ✓ 이고 `(1층)` 이어야 한다(`마을` 이면 ⚠ — 신호만 앞당긴 것).
- [x] `gameplayStart` 를 **처음 조작 가능한 순간**에 부른다(v898 — 신규 유저는 1층 `startFloor` · 기존 유저의 마을은 아직 플레이로 안 친다 — Full 전에 볼 것) — SDK 가 있으면 초기 다운로드를 로딩 시작 → 첫 gameplayStart 로 잰다(requirements/technical).
- [ ] 10초 안에 첫 적, 60초 안에 첫 처치 + 상자 또는 레벨업 · 조작 안내는 막지 않는 오버레이(텍스트 창 없음) · 1~3층에서 첫 사망이 안 나온다 — 새 저장으로 녹화하거나 `dl-playbot` 1~3층.

**로딩·크기·성능**
- [ ] 초기 다운로드 ≤ 50MB(모바일 홈 노출은 ≤ 20MB) · 전체 ≤ 250MB/1,500파일 — sdk-audit [1](v897: 3.76MB 단일 파일, gzip 1.29MB). 크게 키우지 말 것(1MB 마다 플레이어를 몇 %씩 잃는다 — Poki 2026-06-05).
- [ ] 페이지 열기 → 첫 화면 10초 미만(성공작 기준) — cg-sim `[부팅]`(첫 화면 = max(loadingStop, load)) · `--cpu 4`·`--mbps 10` 으로 저사양·느린 망. 최종은 실기기.
- [ ] **4GB 램 크롬북에서 부드럽게**(아니면 ChromeOS 에서 꺼진다 — requirements/technical) — 실기기 1~4막. 무거우면 `?voxray=0`·`?pxh`·`?tshadow`·`?ssao=0` 을 저사양에서 자동으로 켜는 프리셋(별도 저품질 빌드는 안 만든다 — 2026-10-14 논의). cg-sim fps 는 비교용.
- [ ] WebGL1 에서 부팅·플레이 — `cg-sim --webgl1` 이 `WebGL1 로 부팅했다` · 오류 0(v897 ✓).
- [ ] 콘솔 에러 0 — 막·기기마다:
  ```bash
  H=.claude/skills/dl-harness/scripts/harness.js
  for f in 1 15 45 75 95 104 120; do node $H --floor $f --seed 1 --steps 120 --quiet | grep '페이지 오류'; done
  for v in 907x510 821x462 1216x684 mobile mobile-portrait; do node $H --viewport $v --floor 5 --seed 1 --frames 3 --quiet | grep '페이지 오류'; done
  ```
- [ ] 부팅 자체 — `node .claude/skills/dl-release/scripts/smoke.js`(TDZ 는 `node --check` 가 못 잡는다 — CLAUDE.md 첫 함정).

**화면·입력**
- [ ] DPR 1 에서 글씨가 읽힌다 — 창 모드 iframe 907×510·1216×684·1077×606·821×462 · 전체화면 1366×768·1920×1080·1536×864·1280×720 · 모바일 800×450 · 태블릿 1080×607(requirements/gameplay):
  `node .claude/skills/dl-device-check/scripts/devices.js --vp cg907:907x510 --vp cg821:821x462 --vp cg1216:1216x684 --vp fs1366:1366x768 --vp mob:800x450:touch --vp tab:1080x607:touch --floor 5 --out "$SCRATCH/cg-dev"` → `summary.md` 의 작은 글씨 열.
- [x] iframe 안에서는 v816 가로 돌려 그리기를 끈다(v898 `inFrame` · `?rotframe=1` 이면 예전처럼) · 제출 때 방향 '가로'(방향은 제출 설정이라 직접 잠글 필요 없다 — requirements/technical) — sdk-audit [7] ROT_ON.
- [ ] 게임 안 자체 전체화면 버튼 없음 · 외부 링크·다른 게임 홍보·앱스토어 링크 없음 — sdk-audit [7](v897 ✓ — `requestFullscreen` 은 iframe 밖 첫 터치에서만).
- [ ] AZERTY(물리 키 `e.code` — v897 ✓) · Esc 는 전체화면 종료라 일시정지를 Esc 에만 맡기지 않는다 · Ctrl/Cmd+W 를 막지 않는다 · 144/165Hz 에서 이동·판정이 같다 — 이동·판정은 `clock.getDelta()` dt 기반(상한 0.05)이라 같다. 다만 `tick` 의 60fps 제한(`FRAME_MIN − 0.5`) 때문에 **144Hz 는 3프레임에 1번 = 48fps · 165Hz 55fps**(120Hz 는 60) — 고주사율 실기기에서 부드러움을 볼 것.
- [x] 언어: SDK `user.systemInfo.locale` → 없으면 영어 — sdk-audit [5]·cg-sim `[SDK 기능]`. v898: 고른 언어 → 기억한 SDK 로캘(`dungeon_lang_cg`) → `navigator.language` → en · 처음 방문에 다르면 아무것도 안 눌렀을 때 한 번 다시 연다(`cgApplyLocale` · `?cglang=0` · v899: 언어마다 한 번 · `environment` 가 `crazygames` 일 때만). 영어 문장 교정 · 품질이 낮은 번역(es·pt·ru)은 빼는 것도 방법(번역은 '정확하고 품질이 높아야' — requirements/gameplay).

**CLAUDE.md 준수사항 셋 — 되돌리지 말 것**
- [ ] **광고 중 게임 오디오 음소거** `SFX.suspendForAd()`/`resumeAfterAd()` — 소리가 전부 SFX 의 AudioContext 하나를 거치는지(sdk-audit [4] '오디오 생성처'). **음소거는 광고가 실제로 시작될 때(adStarted)**, 해제는 adFinished/adError 뒤 — cg-sim `--ad finish` 의 `adStarted 에 음소거`·`adFinished 뒤 음소거 해제`.
- [ ] **일반 접속에서 `bossTestBtn`/`maxLevelBtn` 숨김** — cg-sim ③ · sdk-audit [6] · 또는 `node $H --floor 1 --seed 1 --eval "['bossTestBtn','maxLevelBtn'].map(id => getComputedStyle(document.getElementById(id)).display)"` → `["none","none"]`(`--url-flags '&dev=1'` 이면 `inline-block`). 제목 5연타(탭 사이 3초 안)로만 나오고 새로고침하면 다시 숨는다 — 사용자 지시라 유지. 마크업은 기본 보임이고 부팅 스크립트가 숨기므로 **스크립트가 그 전에 죽으면 보인다**(부팅 확인이 곧 이 점검).
- [ ] **미드게임 자체 하한 2분**(`lastMidgameAt < 120000`) — sdk-audit [3]. SDK 도 3분에 최대 1번으로 자동 제한한다.

**광고 코드(보상형·미드게임 — 한 번에 고칠 것)** — requirements/ads · sdk/video-ads
- [x] `requestAd(type, { adStarted, adFinished, adError })` 콜백식(v898 `cgRequestAd`). 보상은 **adFinished 에서만**, **adError 면 보상 없이** 원래대로(실패 콜백). `await requestAd(...)` 뒤에 보상을 주면 Basic Launch·광고 차단·로드 실패에서 공짜 부활·리롤·골드 2배가 된다(v897 `cgShowRewarded` — cg-sim `--ad error` ✗). 시간 제한으로 끝내도 SDK 쪽 광고는 살아 있다 — SDK 가 끝을 알릴 때까지 새 요청을 안 보낸다(v899 `cgAdInFlight` · SDK v3 는 두 번째 요청이 첫 요청의 콜백을 가로챈다).
- [x] 미드게임은 adFinished/adError 가 올 때까지 진행(`onDone`)·UI 를 막는다(v898 `cgAdBlock` — 메인 루프 정지 + 화면 막) — cg-sim `--ad finish` `미드게임: 광고가 도는 중에 진행` 이 ✗ 면 안 된다.
- [x] Basic 동안(adError `adsDisabledBasicLaunch`)에는 광고 버튼을 숨기고 골드 부활만 남긴다 — v898 `cgCheckBasic`(init 직후 배너 모듈 `checkBannerAdsEnabled` 가 `bannersDisabledBasicLaunch` 를 던지는지) + 첫 adError 에서 `cgAdsOff`.
- [ ] 로컬에서는 이 버그가 안 보인다는 것을 기억할 것 — CrazyGames 도메인 밖에서는 SDK 가 `environment 'disabled'` 라 `requestAd` 가 예외를 던져 실패 경로로 가고, `?adtest=1` 가짜 광고는 2초를 기다렸다 끝난다. **판단은 cg-sim 으로.**

**콘텐츠(PEGI 12)** — 아래 3절.  **에셋(커버·영상·카테고리)** — 아래 4절.
- [ ] CrazyGames 프리뷰 환경에서 최종 확인(FAQ — 제출 전에 여러 버전을 시험할 수 있다).

## 2. Full Launch 요청 전 (P1 — SDK 전체 연동)

신작 부스트('new' 라벨)는 Full Launch 날짜 기준으로 보이므로 **Full 을 요청하기 전에 전부 끝낸다**(게임 6개 관찰 — 문서화된 내용은 아니다 · Basic → Full 19~55일, 중앙값 약 31일).
- [ ] gameplayStart: 시작·재개·부활·다음 층마다 / gameplayStop: 메뉴·회차 끝·일시정지·마을·광고. **탭 포커스를 잃었을 때는 부르지 않는다**(sdk/game). v897 위치는 5절 표.
- [x] **muteAudio** — `SDK.game.settings.muteAudio` 를 읽고 `addSettingsChangeListener` 로 따라간다(HTML5 필수 — sdk-audit [4]·cg-sim · v898 `SFX.setCfgMute` · v899 소리를 다시 켜면 조용한 동안 요청된 곡으로 맞춘다 `wantTrack`/`resync`).
- [ ] **Data 모듈로 저장**(로컬 저장에 기대지 말 것 · ≤ 1MB · 제출 때 Progress Save 토글) — 지금 localStorage 키 5개: `dungeon_meta` · `dungeon_meta_test` · `dungeon_run` · `dungeon_lang` · `dungeon_best_score`.
- [ ] 부활 광고: **세션당 1회**(지금 회차당 1회 + 제안 쿨다운 3분) · **5초 카운트다운** · 부활 직후 무적 2~3초(지금 2.0초) · 광고 없는 대안(골드 부활 — 있음) · 목숨을 잃을 때마다 제안 금지(액션 가이드 · requirements/ads).
- [ ] 미드게임: 첫 광고는 3~5분 뒤 · 전투 중·메뉴 이동 버튼에서 금지 · 보상형 직후 연달아 금지 · 두 레벨 사이엔 미드게임과 보상형 이어하기 중 하나만 · RPG 는 '아껴서'(막 끝 쉼터 도착 같은 큰 전환점) — v897 자리: 막 끝 쉼터(`descend`) · 정산 → 마을(`restartBtn`).
- [ ] 보상형 버튼: 건너뛰기 버튼과 크기·글꼴·색이 같게 · 동영상 아이콘 · 광고 차단기를 켜도 정상 플레이 · 눌러도 아무 일 없는 버튼 없음.
- [ ] `happytime` 은 보스 처치(12번)·신기록에만(지금 신기록만) · `setGameContext` 로 층·직업 → 싫어요 이유를 층별로.
- [ ] CrazyGames 앱(전체 화면): `env(safe-area-inset-*)` 여백 · iOS 백그라운드 복귀 때 AudioContext resume(지금 ac() 는 'suspended' 만) — sdk-audit [4]·[7]. iOS·저메모리 안드로이드는 DPR 1 고정.
- [ ] 배너를 쓴다면 평균 5초 이상 열린 화면(대장간·여관·교관 창)에만, 화면당 2개, 30초 뒤 갱신.
- [ ] 독점 여부(Full 후 2개월 브라우저 사이트 독점 = 그 2개월 보상 +50% — 약관 3.1·5.5) · GitHub Pages 공개본 처리 · 업데이트는 다른 제3자보다 늦지 않게(약관 4.6).

## 3. 콘텐츠 — PEGI 12 (사이트 대상 13세 이상 · 아동 대상 게임은 거절)

PEGI 12: 판타지 캐릭터를 향한 약간 더 그래픽한 폭력 · 중간 정도 공포까지. 현실적인 폭력·'intense and sustained' 공포는 PEGI 16(pegi.info). **피에 대한 세부 기준은 없다(확인 안 됨).**
- [ ] 애매한 것: 1·2막 웅덩이에서 복도로 **끌려간 핏자국**·손톱자국, 3막 **살덩이 벽·핏물 웅덩이**. 핏빛을 어둡고 작게 유지.
- [ ] QA 가 문제 삼으면 바로 끄고 다시 낼 '저자극 묶음'을 준비 — `?lore=0`(핏자국·쓰러진/불탄 모험가·할퀸 자국 — **스토리 쪽지도 같이 사라진다**) · `?bpool=0`(3막 추가 핏물) · `?a3beat=0`(벽 박동) · `?eyes=0&ghost=0&amb=0`(눈·유령·속삭임) · `?lowhp=0`(저체력 연출) · `?cor3=0`(3막 사슬 해골·뼈 무더기 — 3막 바닥·소품 전체가 예전으로). 제출본은 플래그 없이 열리므로 **실제로 끄려면 기본값을 바꾸는 코드 변경**이다(`dl-release` 로 버전).
- [ ] 공포 연출은 드물게(지금도 쿨다운) — '지속적인 공포'로 보이지 않게. 사지 절단·현실적 인체 상해 없음.
- [ ] 영어 현지화 필수 · 다른 게임 홍보 없음.

## 4. 에셋 — 커버·미리보기 영상·카테고리 (requirements/game-covers)

- [ ] 커버 세 장 **1920×1080(16:9) · 800×1200(2:3) · 800×800(1:1)**, 세 장 그림을 맞춘다 — `covers.py`.
- [ ] 제목('DUNGEON LEGION') 말고 글자 금지('New'·'Play' 등) · 테두리·아이콘·스토어 로고 금지 · **흐릿하거나 픽셀이 깨진 그림 금지 · 스크린샷 그대로 금지** — 320줄 게임 화면을 키운 그림은 안 된다. 고해상도로 다시 렌더하거나 새로 그린다(`covers.py` 는 정수배 nearest 확대만 잡는다 — 나머지는 눈으로).
- [ ] **200×112(홈 썸네일 실제 크기 — 개발자 보고)** 에서 무슨 게임인지 읽힌다 — `covers.py --out`. 어둡고 채도 낮은 픽셀아트는 눈에 덜 띈다(Poki 2026-05-16): 주인공 하나 + 큰 제목 + 횃불·용암·스킬 빛으로 밝게, 뒤에 보스 실루엣.
- [ ] 미리보기 영상: **15~20초**(넘으면 20초에서 잘림) · **≤ 50MB** · **1080p 16:9 와 2:3 두 벌**(1920×1080 · 1080×1620) · **소리 없음** · 첫 프레임 = 정지 커버 · 기본 마우스 커서·'Play Now'·검은 화면 인트로 금지 — `covers.py`(영상은 ffmpeg 로 잰다). 커서는 녹화 전에 CSS(`cursor:none`)로 숨긴다.
- [ ] 카테고리: **제출 뒤 장르를 못 바꾼다**(requirements/quality) — Action 이 유력(액션 평균 13분 · D1 8.1% · 비교작 Immortal: Dark Slayer 도 Action).
- [ ] 큰 업데이트 때 커버 교체(오래된 게임은 세션이 튄다 — 너무 자주는 말 것).

## 5. v898 SDK 연결 지도 (sdk-audit [2] 가 지금 파일에서 다시 뽑는다 — 줄 번호는 밀린다)

| 호출 | 어디서 |
|---|---|
| `SDK.init` · `loadingStart` | `initCG`(IIFE, 게임 스크립트 앞부분) — init 이 부팅보다 늦으면 start/stop 을 한꺼번에 |
| `loadingStop` | 게임 스크립트 끝 `cgLoadingStop()`(셰이더 예열 뒤) |
| `gameplayStart` | `startFloor`(층 시작 — 신규 유저는 캐릭터 카드 → `quickStartDungeon` → 1층) · `doRevive` · `closeBossReward`(카드 대기열이 비면) |
| `gameplayStop` | `buildTownScene`(마을) · `die` · `showRewardChoice` · `cgShowMidgame` · `returnToTown` · `continueFromRest` |
| `happytime` | `showRunResult`(신기록) |
| `reportGameCompletedPercentage` | `startFloor` |
| 광고 요청 | `cgRequestAd(type, done)` 한 곳 — adStarted 음소거 · adFinished/adError 에 `done(ok, code)` 한 번 · 시작 전 30초/시작 뒤 3분 안전장치 · 동안 `cgAdBlock`(루프 정지 + `#cgAdShield`) |
| Basic Launch | `cgCheckBasic`(init 직후) · `cgAdsOff`(첫 adError `adsDisabledBasicLaunch` — 떠 있는 광고 버튼까지 숨김) |
| 언어 · muteAudio | `cgApplyLocale`(SDK 로캘 → `dungeon_lang_cg`) · `cgWatchSettings` → `SFX.setCfgMute` |
| 미드게임 `cgShowMidgame` | `descend`(막 끝 쉼터 도착) · `#restartBtn`(정산 → 마을) |
| 보상형 `cgShowRewarded` | `onBossRewardReroll` · `#reviveAdBtn`(부활) · `#overGoldAdBtn`(골드 2배) |
| 광고 중 음소거 | `cgRequestAd` 의 adStarted → `setMusicPausedForAd` → `SFX.suspendForAd`/`resumeAfterAd`(ctx.suspend + 새 소리 차단 · muteAudio 로 꺼져 있으면 광고 뒤에도 안 켬) |
| 개발자 버튼 | 마크업 `#charOverlay` 안 · `DEV_MODE = ?adtest=1 \|\| ?dev=1` · `if (!DEV_MODE)` 숨김 · `wireDevReveal`(제목 5연타) |

## 6. Basic Launch 동안·이후 볼 지표

Basic: 제한된 이용자에게 노출 · **7일 이상 그리고 500플레이 이상**에 끝(못 채우면 21일째 자동 종료) · 광고·인앱결제 꺼짐 · 업데이트는 자동 승인·즉시 반영 · 대시보드 하루 한 번 갱신, D1 은 하루 늦게. 결과는 셋 — 전부 기준 이상(Full 구현 초대) / 일부(고쳐서 Basic 재요청) / 대부분 미달(새 게임으로 다시 제출). 합격선 숫자는 공개되지 않았다 — 아래는 '성공작이 보이는 수준'이다.

| 지표 | 기준점 | 출처 |
|---|---|---|
| 평균 플레이(세션) | 성공작 10분+ · 액션 평균 약 13분 · 플랫폼 약 16분(계산) | basic-launch-metrics · monetizing-action |
| 1분 전환(1분 이상 플레이) | 상위작 80%+(10초 안 로드 · 20MB 아래와 같이 언급) | basic-launch-metrics |
| D1 재방문 | 강한 게임 10~15% · 액션 8.1% · 플랫폼 6.7% | basic-launch-metrics · 장르 가이드 |
| 썸네일 CTR · 크래시 | 공식 수치 없음(개발자 목표 2~4% · 1% 미만) | Larss IO 개발 로그 |
| 데스크톱 vs 모바일 | **따로** 본다 — 모바일 이탈이 전체를 끌어내린 사례(모바일 5명 중 4명이 60초 안에 나가 1분 전환 약 20%) | One More Fly 개발 로그 2026-10-13 |

- [ ] 고칠 거리를 Basic 기간에 바로 올린다(자동 승인). 단 장르는 못 바꾼다. 업데이트마다 1~2절을 다시 돌린다.
- [ ] 게임 안에서 따로 세면 좋은 것(제안): 3·5·10층 도달 비율 · 첫 사망 층 · 첫 전투까지 걸린 시간 · 직업 선택 비율.
- [ ] Full 이후 순위는 플레이 수·평균 플레이·재방문·전환·피드백(FAQ) — 싫어요 이유는 개발자 포털에서 본다(setGameContext 가 있으면 층이 붙는다).

## 7. 업데이트를 올리기 전 (출시 뒤)

1. `dl-release` 절차(버전 · `check.sh` · `smoke.js`) — 문서만이면 버전을 안 올린다.
2. `sdk-audit.sh` 가 전보다 나빠지지 않았는지(✗·⚠ 개수와 줄) · `cg-sim.js` 두 모드(`--ad error` · `--ad finish`) · 바뀐 막의 콘솔 에러(1절 하네스 줄).
3. 새 외부 리소스·링크가 없는지(sdk-audit [1]·[7]) · 파일 크기 20MB 아래 유지.
4. 새 소리는 SFX 의 ctx 를 거치는지(광고 중 음소거가 새지 않게) · 새 창·버튼에 광고를 붙였으면 2절 광고 규칙.
5. 커버를 바꿨으면 `covers.py` · 다른 포털에 같은 업데이트를 먼저 내지 않는다(약관 4.6).

## 함정

- **`requestAd` 는 프로미스가 아니다** — `await` 해도 바로 끝난다. 결과는 콜백뿐(sdk.js 확인). 그래서 `await` 뒤 보상 코드는 광고를 안 봐도 돈다.
- **v898 부터 첫 방문 언어가 SDK 로캘과 다르면 한 번 다시 연다** — cg-sim 은 브라우저·SDK 로캘을 둘 다 `en-US` 로 둬서 안 걸린다. `--locale ko-KR` 처럼 다르게 주면 다시 여는 동안 `evaluate` 가 끊길 수 있다(언어 시험은 따로).
- **로컬에서 언어 다시 열기를 보려면 가짜 SDK 의 `environment` 를 `crazygames` 로** — v899 부터 local 모드(localhost · `?useLocalSdk=true`)는 SDK 의 데모 로캘('en-US' 고정)이라 무시한다.
- **v899 부터 광고 요청이 겹치면 SDK 로 안 보내고 `busy` 실패** — 가짜 SDK 가 콜백을 안 부르는 모드(`never`)로 한 번 시간 제한을 낸 뒤에는 같은 페이지의 다음 광고가 10분 동안 전부 busy 다(시험은 새 페이지에서).
- **v898 부터 캐릭터 카드 클릭이 신규 유저를 1층으로 바로 보낸다**(마을을 안 짓는다) — dl-harness·봇 측정을 v897 이전 빌드와 A/B 할 때는 새 쪽에 `&quick=0`(CLAUDE.md 'CrazyGames 준수사항').
- **로컬·GitHub Pages 에서는 광고 버그가 안 보인다** — SDK 가 disabled 라 예외 → 실패 경로, `?adtest=1` 은 2초를 기다리는 가짜 광고. 광고 판단은 cg-sim 으로.
- `cg-sim` 은 postMessage 왕복 지연·배너·광고 차단 팝업·실제 Basic 판정을 흉내 내지 않는다. 로드 시간·fps 는 SwiftShader 값.
- 페이지를 새로 열어 A/B 하는 측정은 실시간이라 회차마다 흔들린다 — 같은 조건 두 번으로 대조군부터(CLAUDE.md '렌더 변경을 비교할 때').
- 측정 중 `index.html` 을 고치면 그 뒤 뜨는 페이지가 새 빌드를 읽는다(CLAUDE.md v826 ④) — `served GAME_VERSION … 내용 같음` 줄부터 볼 것.
- 스크린샷·커버 미리보기·임시 파일은 스크래치패드에. 저장소에 디버그 스크립트를 만들지 말 것(CLAUDE.md '잡동사니').

## 파일

| 파일 | 하는 일 |
|---|---|
| `scripts/sdk-audit.sh [index.html]` | 정적 grep — [1] 크기·외부 의존 [2] SDK 호출 위치(근처 함수) [3] 광고 콜백·음소거 시점·Basic 처리·미드게임 하한·부활 [4] 오디오·muteAudio [5] Data·locale·setGameContext·happytime [6] 개발자 버튼 [7] 전체화면·링크·키·회전·safe-area. ✗ 있으면 종료 1 |
| `scripts/cg-sim.js [옵션]` | 가짜 SDK v3 로 부팅 → 로딩 시각·받은 바이트 → 개발자 버튼 → 1클릭 gameplayStart → 1층 fps → 보상형·미드게임 콜백·음소거 시각 → SDK 기능 사용 → 오류. `--help` |
| `scripts/covers.py <파일·폴더>… [--out png]` | 커버 세 장 크기·블록 확대 · 영상 길이·크기·해상도·소리·첫 프레임 · 200x112 미리보기 |

## 출처 (2026-10-14 조회 · 문서 대부분은 날짜 없음)

- 출시 단계·Basic 결과 셋: https://docs.crazygames.com/ · 지표: https://docs.crazygames.com/resources/basic-launch-metrics/ · FAQ(순위·프리뷰): https://docs.crazygames.com/faq/
- 요건: 기술 https://docs.crazygames.com/requirements/technical/ · 게임플레이 https://docs.crazygames.com/requirements/gameplay/ · 품질 https://docs.crazygames.com/requirements/quality/ · 광고 https://docs.crazygames.com/requirements/ads/ · 커버·영상 https://docs.crazygames.com/requirements/game-covers/
- SDK: https://docs.crazygames.com/sdk/game/ · https://docs.crazygames.com/sdk/video-ads/ · https://docs.crazygames.com/sdk/data/ · https://docs.crazygames.com/sdk/user/ · 스크립트 https://sdk.crazygames.com/crazygames-sdk-v3.js(2026-10-15 읽음)
- 가이드: 액션 https://docs.crazygames.com/resources/monetizing-action/ · 미드코어·RPG https://docs.crazygames.com/resources/monetizing-midcore-idle/ · 미드게임 간격 https://docs.crazygames.com/resources/midgame-ads-pacing/ · 광고 수익화 https://docs.crazygames.com/resources/ad-monetization-guide/ · 앱 https://docs.crazygames.com/resources/crazygames-app/
- 약관(2025-08-18): https://files.crazygames.com/documents/developer_terms_20250818.pdf · PEGI: https://pegi.info/what-do-the-labels-mean · Poki 썸네일·색: https://poki.com/blog/what-makes-high-quality-browser-game · Larss IO(200x112·CTR): https://fxf8.itch.io/larss-io/devlog/1586849/launching-a-1v1-strategy-game-on-crazygames-04-ctr-and-what-im-learning
