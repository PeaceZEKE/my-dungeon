---
name: dl-harness
description: Dungeon Legion(index.html) 를 Playwright + 동봉 Chromium(swiftshader)으로 띄워 결정적으로 확인하는 재사용 하네스. 게임 화면을 스크린샷으로 보거나, 렌더 변경 전후·두 빌드·플래그 켬/끔을 픽셀 해시로 A/B 하거나, 특정 층·직업·기기(PC/모바일 가로·세로)에서 기능을 계측(--eval)하거나, 층 도달성(flood fill)을 잴 때 쓴다. 트리거 — "스크린샷 찍어 봐", "화면 확인", "픽셀 해시", "해시 같은지", "main 이랑 픽셀 단위로 같은지", "플래그 끄면 예전과 같은지", "A/B 비교", "회귀 확인", "모바일에서 어떻게 보이는지", "45층 들어가서 확인", "도달 못 하는 칸", "flood fill", "Playwright 로 띄워", "테스트 서버"; English — "take a screenshot", "pixel hash", "A/B the builds", "regression check", "is it identical to main", "check on mobile viewport", "enter floor N and measure", "reachability", "run the game headless". 밸런스용 자동 플레이(층당 사망 등)는 이게 아니라 viewers/playbot 이다.
---

# dl-harness — 게임 하네스

`scripts/harness.js` 하나로 서버 버전 확인 → 부팅 → 직업 선택 → 마을 → (층 입장) → 시간 진행 → 해시 → 계측 → 스크린샷까지 한 번에 한다.
**시계·rAF·타이머를 전부 게임 시계로 바꿔 끼우므로 같은 빌드·같은 시드는 페이지를 새로 열어도 바이트 단위로 같다**(실측: 5층 `2065b831` — 두 번 · `--shots` 유무 · 작업 트리 ↔ HEAD 다른 포트, 15층 `--steps 20 --horror` · 61층 `--reset --steps 20` · 5층 `--frames 10` 각각 두 번 같음).

## 1. 서버

```bash
bash .claude/skills/dl-harness/scripts/serve.sh            # 8899, 저장소 루트. 이미 떠 있으면 버전·내용(md5)만 확인
```
- 반드시 **저장소 루트**에서 띄운다 — 다른 폴더의 예전 index.html 이 서빙돼 `… is not a function` 으로 헤맨 사고(CLAUDE.md '렌더 변경을 비교할 때'). 버전이 같아도 내용(md5)이 다르면 실패로 끝난다.
- `setsid nohup … < /dev/null &` 로 띄운다 — 그냥 `&` 면 Bash 호출이 끝날 때 같이 죽는다(CLAUDE.md v827 계측 함정).
- 끌 때는 `pkill -f "http.serve[r] 8899"` — `[r]` 없이 쓰면 패턴이 자기 명령줄에 걸려 셸이 죽는다(exit 144, CLAUDE.md v881 계측 함정 ②).

## 2. 기본 사용

```bash
H=.claude/skills/dl-harness/scripts/harness.js
OUT="${TMPDIR:-/tmp}/dl-shots"     # 세션 스크래치패드가 있으면 그 경로로. 저장소 안이면 하네스가 ⚠ 를 찍는다(CLAUDE.md '잡동사니')
node $H --floor 5 --seed 12345 --hash                          # 5층 픽셀 해시
node $H --floor 45 --char archer --viewport mobile --seed 7 --shots "$OUT/m"   # 모바일 가로 스크린샷(마을 + 던전)
node $H --floor 75 --seed 1 --steps 120 --eval "enemies.filter(e=>e.awake).length"
node $H --help                                                 # 옵션 전체
```

| 옵션 | 뜻 |
|---|---|
| `--url-flags "&lore=0"` | URL 플래그(`&`·`?` 는 있어도 없어도) |
| `--viewport 960x540` / `mobile` / `mobile-portrait` | mobile = 844×390 터치(`isTouchDevice` 참), portrait = 390×844(가로 고정 v816 회전 그리기) · `--dpr N` |
| `--char knight\|mage\|archer` | 캐릭터 카드 클릭(onTap 경로 그대로) |
| `--floor N` | 마을 → `exitTownToDungeon()`(1층) → `player.floor = N; startFloor()`. `--reset` 이면 `startRunAtFloorReset(N)`(막 시작 레벨) |
| `--seed N` | `addInitScript` 로 부팅 **전에** `Math.random` LCG. 안 주면 진짜 난수(시계는 그래도 고정) |
| `--setup "식"` · `--setup-file f.js` | 층에 들어간 뒤(없으면 마을) **`--steps` 보다 먼저** 평가 — 상태 꾸미기. 준 순서대로 |
| `--steps K` | 메인 루프 `tick` 의 한 프레임에서 **렌더·HUD(ui2)·전투 음악만 뺀 것**을 K 번(1/60 씩 — 빠르다). 히트스톱·보스 슬로모·120층 낙하·막 전환 글·`cullSceneLights`·온보딩·스토리·콤보·레벨업 이펙트·픽셀 잔디·FOV 는 tick 순서대로 돈다. 마을이면 `updateTownMode` |
| `--horror` | `--steps`·`--hash` 에 `updateHorror` 까지(어둠·저체력·횃불·눈 유니폼은 이게 넣는다) |
| `--frames K` | 진짜 메인 루프 `tick` K 프레임(렌더 포함, swiftshader 프레임당 0.3~0.5초) |
| `--hash` | 루프를 안 돌린 채 `renderWithPost(지금 씬)` 한 번 → 캔버스 FNV-1a(페이지 안에서) + 8×6 격자 평균 휘도 |
| `--shots "$OUT/p"` | `$OUT/p-town.png`(그리기만) · `$OUT/p-dungeon.png`(HUD 때문에 2프레임 돌리고 — 해시·eval 뒤에 찍는다). 폴더는 만들어 준다 |
| `--eval "식"` · `--eval-file f.js` | 페이지 전역에서 평가 → JSON. 준 순서대로. Promise 는 기다린다. **`--steps`·`--frames`·`--hash` 뒤에** 돈다 — 그 사이에 시간을 더 흘리려면 식 안에서 도우미 `__dlSteps(K, horror)` · `__dlFrames(K)` · `__dlHash(horror)`(→ `{hash, grid, …}`) |
| `--expect v897` · `--port` · `--realtime` · `--quiet` | 버전 강제 · 포트 · 실제 시계(결정성 없음, 눈으로 볼 때만) · 요약만 |

출력: `served GAME_VERSION = … (저장소 index.html = … · 내용 같음)` 가 맨 먼저(버전이 같아도 내용이 다르면 ⚠), `SETUP 식 => json`, `HASH dungeon f5 960x540 2065b831`, `EVAL 식 => json`, 마지막 줄 `RESULT {json}`.
종료 코드: 0 정상 · **1 페이지 오류/알 수 없는 콘솔 에러/eval 예외** · 2 인자·서버 문제. 외부 요청(CrazyGames SDK)은 막고 그 실패 콘솔은 '알려진 외부 리소스'로 따로 센다.

## 3. 레시피

**① 대조군부터** — 같은 빌드를 두 번 돌려 해시가 같은지 먼저 본다. 대조군이 다르면 그 뒤 측정은 믿지 않는다(CLAUDE.md '렌더 변경을 비교할 때').
```bash
for i in 1 2; do node $H --floor 5 --seed 12345 --hash --quiet | grep ^HASH; done
```

**② 두 빌드 A/B(같은 세션에서 연달아)** — `ab.sh` 가 B 빌드를 임시 폴더 + 빈 포트(8898~)에 띄우고, 양쪽을 순서대로 돌리고, 끝나면 끈다.
```bash
A=.claude/skills/dl-harness/scripts/ab.sh
bash $A HEAD --floor 5 --seed 12345                            # 작업 트리 ↔ HEAD (변경 없으면 SAME = 대조군)
git fetch origin main   # 로컬 main 은 뒤처져 있을 수 있다(실측: 로컬 main v888 · origin/main v897) — 라이브는 origin/main
for f in 5 15 45 75 95 104; do AB_A_FLAGS='&newfeat=0' bash $A origin/main --floor $f --seed 12345; done   # 새 플래그 끄면 라이브와 같은가
AB_A_FLAGS='&dark=0' bash $A HEAD --floor 15 --seed 12345 --horror   # 루프가 넣는 효과는 --horror/--frames 로
```
`SAME` 이면 0, `DIFF` 면 3(격자 최대 차 위치와 양쪽 방·적 수를 같이 찍는다 — 방·적 수가 다르면 난수 흐름이 갈린 것). B 는 git 참조나 index.html 경로. `main` 을 주면 로컬 main 이 origin/main 과 다를 때 ⚠ 를 찍는다. `[B] served GAME_VERSION` 줄로 실제로 무엇과 비교했는지 확인할 것.
- **객체 수가 달라지는 변경은 픽셀 A/B 가 원천 불가** — THREE 생성자가 uuid 로 난수를 먹어 층 배치가 통째로 바뀐다(CLAUDE.md '시드는 addInitScript로' 절). 그런 변경은 `?새플래그=0` ↔ 예전 빌드만 해시로 보고, 새 기능은 `--eval` 로 직접 잰다.
- 빌드 간 해시는 **같은 세션에서 연달아** 잴 것(CLAUDE.md v888 — 서버를 다시 띄운 뒤의 값과 섞지 말 것).

**③ 기기 비교** — 같은 시드로 `--viewport 960x540` / `mobile` / `mobile-portrait` 를 `--shots` 로 찍어 나란히 본다. UI 는 DOM 이라 해시(GL 캔버스만)에는 안 잡힌다 — UI 확인은 스크린샷과 `--eval "getComputedStyle(document.getElementById('…')).…"`.
화면 크기는 게임 함수 `scrW()`/`scrH()` 로 볼 것(세로 회전 그리기 중 `innerWidth` 는 실제 세로 기준 — CLAUDE.md v816).

**④ 도달성 flood fill** — 충돌체를 반지름만큼 부풀려 0.5 격자로 채운다(`walls` = 벽·장식·흑요석·쓰러진 기둥).
```bash
node $H --floor 25 --seed 5150 --eval "window.__reachR = 0.575" --eval-file .claude/skills/dl-harness/scripts/snippets/reach.js
# => {"floorTiles":213,…,"unreachable":0,"fullyBlocked":0}
```
기준은 플레이어 0.5 · 오크 0.575 · 여유 0.6 에서 0(반경 1.0 보스는 기준 아님 — CLAUDE.md '1막 벽 콜라이더는…'). 층 전체를 보려면 층마다 돌리되, **실패 층은 그 층만 따로 지으면 재현이 안 될 수 있다** — 앞 층들을 지으며 먹은 난수가 배치를 바꾼다(CLAUDE.md v851). 계단 받침은 충돌체가 아니라 밀어내기라 스니펫에 없다(필요하면 원으로 더할 것 — v812 ③). 새 스니펫은 `scripts/snippets/` 에 식 하나(IIFE)로 둔다.

**⑤ 기능 계측** — `--setup` 으로 상태를 꾸미고 `--steps` 로 돌린 뒤 `--eval` 로 읽는다. 여러 단계면 `--eval` 안에서 `__dlSteps` 로 더 흘린다.
```bash
node $H --floor 10 --seed 12345 --setup "killEnemy(enemies.find(e => e.isBoss))" --steps 240 \
  --eval "[bossSlowT, rewardPaused]" --eval "__dlSteps(60), player.hp"
# => [-1,true] (보스 슬로모가 끝나 보상 카드가 떴다)
```
**`--eval` 안에서 `update()` 만 직접 돌리지 말 것** — 히트스톱·보스 슬로모·낙하는 메인 루프 몫이라 `hitStop` 이 안 줄고 보상 카드가 영영 안 뜬다(실측: 보스 처치 뒤 update 240번 → `bossSlowT` 0 · `hitStop` 0.3 그대로. CLAUDE.md v870 봇 루프와 같은 함정). `__dlSteps` 를 쓸 것.

## 4. 계측 함정 — 하네스가 막아 둔 것 / 직접 조심할 것

하네스가 처리한다:
- **시드는 부팅 전에** — `page.evaluate` 안에서 걸면 늦다(마을·부팅 던전이 이미 진짜 난수로 지어짐 → 페이지마다 방 수가 흔들림). CLAUDE.md '시드는 addInitScript로 — 부팅보다 먼저 걸어야 한다'.
- **시계도 고정** — 횃불·호흡이 `performance.now` 를 보고, 마을 낮/밤은 `new Date().getHours()`(→ 2026-01-01 09:00 KST 고정). CLAUDE.md '계측 대조군이 0이 안 나오면 시계부터 의심할 것'.
- **rAF 스로틀링** — 페이지를 놀리면 rAF 가 느려져 행동 계측이 틀어진다(CLAUDE.md '…rAF가 스로틀링돼…'). 하네스는 rAF 를 수동 큐로 바꿨고, 그래서 `waitForFunction`(기본 polling = rAF)을 안 쓴다. `setTimeout`·`setInterval` 도 게임 시계 큐(보상 카드 0.6초 타이머 — CLAUDE.md v826 ⑤).
- **씬 첫 렌더가 난수를 먹는다**(three 내부 지연 생성, 마을 첫 렌더 8개 — 이 스킬을 만들며 잰 값). 하네스가 끼워 넣는 렌더(마을 스크린샷·해시)는 그동안 `Math.random` 을 따로 된 LCG 로 바꿔 끼워 `--shots` 유무가 해시를 안 바꾼다.
- **update 만 돌리면 잔디가 새까맣다** — `updatePixelGrass` 는 메인 루프 몫(CLAUDE.md v809 계측 함정). `--steps`·`--hash` 가 같이 부른다.
- **마을↔던전 FOV** 는 메인 루프의 `_lastInTown` 비교가 바꾼다 — `--steps`·`--hash` 가 같이 한다.
- **히트스톱·보스 슬로모·120층 낙하·막 전환 글은 메인 루프 몫**(CLAUDE.md v870) — `--steps`·`__dlSteps` 가 tick 순서대로 돌린다(update 만 부르면 보상 카드가 영영 안 뜬다).
- **픽셀 배열을 페이지 밖으로 옮기지 말 것**(장당 2MB, 타임아웃) — 해시·격자 평균은 페이지 안에서.
- npm playwright ↔ 동봉 브라우저 빌드가 어긋나면 `/opt/pw-browsers` 의 동봉본을 `executablePath` 로(자동). playwright 모듈은 로컬 → `npm root -g` → `/opt/node22/…` 순으로 찾는다.
- 서버가 저장소 index.html 과 **버전은 같은데 내용이 다르면**(버전을 올리기 전 작업 트리 ↔ 다른 폴더) 첫 줄에 `내용 다름` + ⚠ — serve.sh 와 같은 md5 검사.

직접 조심할 것:
- **`--hash` 는 '지금 상태를 그리기만' 한 스냅샷**이다. 매 프레임 루프가 넣는 것(어둠 `uDarkStr`·저체력·횃불 불안정·눈·유령)은 `--horror`, HUD(ui2 — DOM 이라 해시엔 안 잡힌다)·전투 음악까지 진짜 루프 그대로면 `--frames`. `?dark=0` A/B 를 `--horror` 없이 하면 둘 다 어둠이 없어 SAME 이 나온다(실측).
- **하네스를 여럿 동시에 돌리지 말 것** — 같은 빌드 해시가 달라질 때가 있고(CLAUDE.md v851), 서버 하나에 몰면 `page.goto` 타임아웃(v827·v881 ①). 판단용은 순서대로.
- **측정 중 index.html 을 고치면** 그 뒤 뜨는 회차가 새 빌드를 읽는다(CLAUDE.md v826 ④) — 전/후는 플래그나 `ab.sh` 로 가를 것. 하네스는 매번 서빙 버전을 먼저 찍는다.
- **플레이어를 좌표로 옮기면 카메라가 안 따라온다**(추적 4·dt — 10프레임으론 부족, CLAUDE.md v807). 카메라를 직접 옮기거나 `--frames` 를 충분히. 좌표 대입은 벽도 통과한다(CLAUDE.md '보스 계측 하네스에서 조준을…').
- **조준은 `player.yaw` 대입이 아니라 `mousePos`** — `update()` 가 매 프레임 마우스 지면 교점으로 덮어쓴다(같은 절).
- **update 직후 플레이어가 딴 데 있을 수 있다** — 하행 계단·무너지는 함정·넉백(CLAUDE.md v812 2차 계측 함정). 3 넘게 옮겨졌으면 그 시도를 버릴 것.
- **멀리 있는 적은 원래 업데이트를 건너뛴다**(`!visible && dist > TILE*5`) · 잠든 적은 `stunT` 도 안 준다(v869) — '안 움직임'을 끼임·버그로 착각하지 말 것.
- **DOM 페이드·데미지 숫자는 자기 시계** — rAF 를 멈춘 하네스에서 CSS 투명도가 0 에 머물 수 있다(CLAUDE.md v823), 데미지 숫자는 `performance.now` 로 수명을 센다(v822). 스크린샷으로 안 보이면 이것부터.
- 레벨 1 하네스로 밸런스를 판단하지 말 것(CLAUDE.md v759) — 밸런스는 `viewers/playbot`(8시드 이상, v870).
- 스크린샷·임시 출력은 스크래치패드에. 저장소에 디버그 스크립트를 만들지 말 것(CLAUDE.md '잡동사니') — 재사용할 것만 이 스킬 `scripts/` 에.

## 5. 파일

- `scripts/harness.js` — 하네스(헤더 주석이 옵션 설명)
- `scripts/serve.sh [포트] [폴더]` — 서버 확인/띄우기(버전·md5)
- `scripts/ab.sh <git참조|index.html> [harness 옵션]` — 두 빌드 해시 A/B(`AB_A_FLAGS`·`AB_B_FLAGS`)
- `scripts/snippets/reach.js` — 도달성 flood fill(`window.__reachR`·`__reachS`)
