---
name: dl-device-check
description: Dungeon Legion(index.html 단일 파일 게임)이 PC 웹과 모바일에서 어떻게 다르게 보이는지 한 번에 비교할 때 쓴다 — 뷰포트 여러 개(기본 모바일 844×390 터치 · PC 960×540 · 1280×720 · 1366×768 · 1920×1080)로 같은 시드의 마을과 던전 N층을 찍고, 카메라 세로/가로 FOV · 바닥에서 보이는 칸 수 · 렌더러/저해상 크기와 텍셀 배율(PX_FIXED_H) · HUD 배율(--ui2z) · isTouchDevice · 캐릭터 화면 높이 · 작은 글씨 · 모바일 버튼 면적을 재서 같은 높이로 맞춘 이름표 붙은 접촉 시트(PNG)와 표를 만든다. UI·HUD·카메라·픽셀 해상도·글꼴 크기·모바일 조작 버튼을 바꾼 뒤, 또는 CrazyGames 제출 전 기기별 점검에. Triggers — 한국어: 모바일이랑 PC 비교, 기기별 화면, 해상도별, 화면 크기별, 모니터마다, 폰에서 어떻게 보여, 모바일 화면 확인, 뷰포트 비교, 화면비, 가로 시야, 캐릭터 크기가 다르다, 글씨가 작다, HUD 배율, 텍셀 크기, 접촉 시트. English: compare mobile vs PC, device check, viewport comparison, screen sizes, resolutions, aspect ratio, how it looks on phone, contact sheet, HUD scale, small text, FOV per device.
---

# dl-device-check — PC 웹 ↔ 모바일 화면 비교

근거: `CLAUDE.md` **'렌더 변경을 비교할 때'**(시드는 addInitScript · rAF 끊고 직접 렌더 · 서버는 저장소 루트) · **'UI v2 1단계 — 던전 HUD(v814)'**(배율 단계) · **'가로 고정(v816)'**(`scrW()/scrH()`) · **'픽셀 크기는 PIXEL_SCALE이 아니라 PX_FIXED_H가 정한다'**. 충돌하면 CLAUDE.md 가 이긴다.

## 1. 돌리기 (저장소 루트에서)

```bash
# 서버: 이미 떠 있으면 그대로(서빙하는 index.html 이 저장소 것과 버전·내용(md5)이 다르면 스크립트가 멈춘다). 없으면 스크립트가 루트에서 잠깐 띄웠다가 끝날 때 끈다
bash .claude/skills/dl-harness/scripts/serve.sh 8899     # 계속 띄워 둘 때

OUT="${TMPDIR:-/tmp}/devices-$(date +%H%M)"     # 세션에서는 시스템 프롬프트의 스크래치패드 경로로 바꿀 것(--out 을 빼면 $TMPDIR/dl-device-check-<시각>)
node .claude/skills/dl-device-check/scripts/devices.js --floor 5 --out "$OUT"
#   → $OUT/sheet.png (접촉 시트) · $OUT/summary.md (표) · $OUT/metrics.json · $OUT/<뷰포트>-<장면>.png
```
- 기본 5개 뷰포트 × (마을 + 던전) 뷰포트당 40~60초, 합쳐 4~6분(SwiftShader · 다른 브라우저 작업과 겹치면 더 걸린다). `run_in_background` 로 돌리고 로그의 `== 완료 ==` / `== 일부 실패 ==` 를 기다린다.
- 시트를 사용자에게 보여 줄 때는 `SendUserFile`(display: render)로 `sheet.png` 를.

자주 쓰는 변형(위 `node … devices.js --out "$OUT"` 뒤에 붙인다):
```bash
--vp phone:844x390:touch --vp tall:390x844:touch     # 세로로 든 폰(가로 돌려 그리기 v816 — 시트에 '(가로 돌려 그림)')
--vp tab:1180x820:touch --vp pc4k:2560x1440           # 태블릿 · 큰 모니터(HUD ×2)
--vp phone3x:844x390:touch:dpr3                       # 실제 폰처럼 dpr 3(게임은 setPixelRatio(1) 이라 화면은 같고 DOM 글씨만 선명 · 1:1 칸은 기기 픽셀이라 텍셀이 3배로 보인다)
--shots title,town,dungeon                            # 캐릭터 선택 화면까지
--query '&ui2=0'   --query '&pxh=360'                 # 플래그(여러 번 주면 이어 붙음 · 모든 뷰포트 공통 — 켬/끔 대조는 --out 을 달리해 두 번 돌려 시트 둘을 나란히)
--floor 45 --class archer --tod night --hints         # 다른 막·직업·밤 마을·조작 힌트 패널 남김
--small 12 --smallrel 1.8                             # 작은 글씨 문턱 조정
```
`--vp` 를 하나라도 주면 기본 목록을 대신한다. 형식 `[이름:]가로x세로[:touch][:dprN]`(이름을 빼면 크기가 이름). `--help` 로 전체 옵션.

## 2. 무엇을 보나 (시트 이름표 · summary.md 열 순서대로)

1. **세로 FOV 30° 고정 → 캐릭터 크기가 같은가.** `applyAdaptiveFOV()` 는 화면비 ≥ 16:9 이면 세로 FOV 30 그대로 두고 가로만 넓힌다 → '캐릭터 높이 %' 가 모든 16:9 이상 기기에서 같아야 한다(실측 v897: 기사 마을·던전 9.06% · 궁수 9.23% — 직업끼리가 아니라 같은 직업의 뷰포트끼리 비교). 16:9 보다 좁은 화면(4:3 태블릿·세로 폰)은 세로 FOV 가 커져(가로 시야 유지) 캐릭터가 작아진다 — 의도된 동작인지 확인.
2. **가로 시야.** 같은 높이로 줄인 시트에서 그림 폭 차이가 곧 '옆으로 더 보이는 양'이다. '바닥 보이는 범위 가로×세로(칸)' 로 숫자 비교(실측: 844×390 5.89×3.62 · 16:9 4.84×3.62 — 모바일이 옆으로 약 22% 더 본다).
3. **텍셀 크기(PX_FIXED_H 320).** 저해상 버퍼 세로가 늘 320 이라 '텍셀 = 화면 세로 / 320' px — 390 → 1.22 · 540 → 1.69 · 720 → 2.25 · 768 → 2.4 · 1080 → 3.375. **정수가 아니면 텍셀 줄마다 1px 차가 난다** — 마지막 '1:1 (줄이지 않음)' 칸에서 도트 크기·고르지 않음을 직접 본다. 픽셀 크기를 바꾸는 손잡이는 `?pxh=` 이지 `PIXEL_SCALE` 이 아니다(CLAUDE.md).
4. **HUD 배율 단계.** `--ui2z` = 화면 세로 900 미만 ×1 · 1260 미만 ×1.5 · 그 위 ×2. 경계 바로 아래(예: 1366×768 · 1600×900 근처)는 ×1 이라 HUD 가 상대적으로 가장 작게 보인다 — 'HUD 배율' 열과 그림으로 확인.
5. **모바일 조작 오버레이.** 터치 기기만 `#mobileControls`(조이스틱·물약·스킬·방어)가 뜬다. '모바일 버튼 면적 %' 와 그림에서 버튼이 HUD·미니맵·캐릭터·알림 띠를 가리는지. 마을은 방어·스킬·물약 버튼이 숨는다(5% 안팎), 던전은 9% 안팎.
6. **작은 글씨.** 두 가지를 센다 — `<11px`(폰에서 읽기 어려움 · `--small`) 와 `<1.6% 화면 높이`(배율 없이 쪼그라든 글씨 — 큰 모니터에서 HUD 밖 DOM 글씨 · `--smallrel`). 화면에 실제로 찍히는 크기(transform 배율·회전까지)로 잰다. 표준 출력에 선택자·글자 예가 찍히니 어느 요소인지 바로 찾는다. HUD(`#hud2`) 밖의 창·토스트·버튼은 `--ui2z` 를 안 따른다는 점에 주의 — 실측 v897: 1920×1080 던전 HUD 는 ×1.5 로 최소 22.5px 인데 마을 `#townTimeBtn`·`#townMusicBtn` 은 14px(화면 높이 1.3%) 그대로였다.
7. **같은 장면인가.** 끝에 '✓ town/dungeon: 모든 뷰포트가 같은 장면 — grid … · 방 … · 적 …' 이 떠야 비교가 성립한다. ⚠ 가 뜨면 뷰포트에 따라 객체 수가 달라진 것(난수 흐름이 갈림 — CLAUDE.md 'THREE 객체를 만들면 그 자체로 난수를 먹는다') — 그 자체가 버그 신호다.

## 3. 스크립트가 지키는 것 (고치기 전에 읽을 것)

- **시드·시계·setTimeout 을 `addInitScript` 로 부팅 전에 건다**(CLAUDE.md '시드는 addInitScript로'). `setTimeout` 은 게임 시계 큐(playbot `run.js` 요령) — 토스트·힌트가 뷰포트마다 다른 순간에 사라지지 않게.
- **찍을 때는 rAF 를 끊고 `tick(lastFrameT + 1000/60 + 1)` 을 직접 돌린다**(기본 20프레임). `tick` 의 60fps 제한이 `lastFrameT`(실제 rAF 시각) 기준이라 고정 시계 값을 넘기면 프레임이 통째로 건너뛰어진다 — 반드시 `lastFrameT` 에 더할 것.
- 마을은 `beginGameWith(직업)` → 시간대 고정(`townTimeAuto=false; setTownTimeOfDay`) · 조작 힌트 숨김. 던전은 `exitTownToDungeon(); startRunAtFloorReset(N)` — `startFloor` 가 카메라를 바로 붙인다(추적 대기 불필요).
- **캐릭터 높이는 발 → 보이는 메시 꼭대기의 세로 선분을 투영**한다. 월드 축 상자를 통째로 투영하면 발밑 블롭 판·망토 깊이까지 세로로 잡혀 두 배 가까이 부풀었다(30% vs 실제 9%).
- 화면 크기는 `scrW()/scrH()` 로 읽는다 — 세로 폰을 돌려 그리는 동안 `innerWidth` 는 실제(세로) 기준이다(CLAUDE.md '가로 고정(v816)').
- 터치 뷰포트는 `hasTouch + isMobile + 안드로이드 UA` — 게임의 `isTouchDevice` 가 참이 되는지 'touch/PC' 이름표로 확인된다.
- 바깥 요청은 막는다(CrazyGames SDK). 페이지 오류가 나면 그 뷰포트 줄에 ✗ 와 첫 오류가 찍히고 종료 코드 1.
- Playwright 모듈은 `require('playwright')` → `npm root -g` → `/opt/node22/lib/node_modules/playwright` 순(dl-harness 와 같다), 브라우저 빌드가 어긋나면 `/opt/pw-browsers` 동봉본을 `executablePath` 로(자동).

## 4. 판단할 때의 함정

- **스크린샷 비교로 픽셀 단위 결론을 내지 말 것** — 뷰포트가 다르면 저해상 버퍼 가로(693 · 569 · 1024 …)가 달라 픽셀 격자 자체가 다르다. 여기서 보는 것은 구도·크기·배율·가림이다.
- 던전 화면이 어두워 형태가 안 보이면 1:1 칸으로 본다(캐릭터 중심으로 자른다). 층 장식에 묻히면 `--floor` 를 바꾸거나 `--query '&dark=0'`.
- 측정 중 `index.html` 을 고치면 그 뒤 뜨는 페이지가 새 빌드를 읽는다 — 전/후는 같은 실행 안에서 `--query` 플래그로 가를 것(CLAUDE.md '용병 2단계' 계측 함정 ③).
- 서버 여럿·봇과 동시에 돌리면 단일 스레드 python 서버가 막혀 `goto` 시간 초과가 난다(CLAUDE.md '혼령 히트앤런 빈도' 계측 함정) — 한 번에 하나.

## 5. 글꼴

`sheet.py` 는 한글 이름표용 글꼴을 ① 시스템(`fc-list :lang=ko`) ② `assets/font.ttf`(고운바탕 Bold 부분 집합 · OFL 1.1 — `assets/OFL.txt`, 이 스킬 스크립트의 글자만 · 약 170KB) ③ PIL 기본(한글 깨짐) 순으로 고른다. 이름표에 새 한글을 넣었고 시스템 한글 글꼴이 없는 환경이면:
```bash
bash .claude/skills/dl-device-check/scripts/mkfont.sh <한글 TTF>   # 원본: github.com/yangheeryu/Gowun-Batang
```

## 파일

| 파일 | 하는 일 |
|---|---|
| `scripts/devices.js` | 뷰포트마다 부팅(시드 고정) → 장면 찍기 → 측정 → `metrics.json`·`summary.md` → `sheet.py` 호출 |
| `scripts/sheet.py <폴더> [--height H]` | 같은 높이로 줄인 장면 + 1:1 잘라내기 + 이름표로 `sheet.png` (metrics.json 만 있으면 다시 만들 수 있다) |
| `scripts/mkfont.sh <TTF>` | `assets/font.ttf` 다시 굽기 |
| `assets/font.ttf` · `assets/OFL.txt` | 시트 이름표 글꼴(대체용) · 라이선스 |
