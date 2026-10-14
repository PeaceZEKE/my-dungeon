---
name: dl-new-content
description: Dungeon Legion(index.html 단일 파일 게임)에 새 기능·몬스터·보스·소품·장판 공격·스킬·UI 창·문자열·효과음을 **넣기 전과 넣은 뒤**에 따라가는 체크리스트. 기본 켜짐 URL 플래그(?x=0 이면 예전 빌드와 픽셀 단위로 같게) · TDZ · 난수 흐름(THREE 생성자의 uuid · 소리·UI 는 Math.random 금지) · 뷰어에서 먼저 모델링 · markOrganic · c3MergeStatic/mergeInto · 반지름 · 팔레트 역산 · 캐릭터 그림자 금지 · 피해 배관(damagePlayer/hazardHit/a3Blocked/skillHit/merc) · ui2 창 목록 · I18N 6개 언어 · 고운바탕 서브셋 검사(scripts/font-check.py) · 검증(5·15·45·75·95·104층 해시 A/B · flood fill · 콘솔 에러 0 · 봇 측정)까지. 구현을 시작할 때, 리뷰할 때, "다 됐다"고 보고하기 전에 쓴다. Triggers — 한국어: 새 몬스터, 새 보스, 몹 추가, 보스 추가, 새 기능 추가, 기능 넣어줘, 소품 추가, 장식 추가, 새 장판, 새 패턴, 새 스킬, 새 창, 새 UI, 새 문자열, 번역 추가, 글꼴 서브셋, 고운바탕, 글자 깨짐, 시스템 글꼴로 떨어짐, 플래그 추가, 체크리스트, 빠뜨린 것 없나, 넣기 전에 확인. English: add a monster, new boss, new feature, new prop, new hazard, new skill, new UI window, new strings, translation, font subset, missing glyph, feature flag, checklist, pre-merge checklist, did I miss anything.
---

# dl-new-content — 새 콘텐츠 넣기 체크리스트

근거는 전부 `CLAUDE.md`(줄마다 절 이름을 적었다 — 막히면 그 절을 읽을 것). 충돌하면 CLAUDE.md 가 이긴다.
이 문서는 **무엇을 빠뜨리면 안 되는가**만 다룬다. 실행 도구는 다른 스킬이다:
`dl-harness`(스크린샷·해시 A/B·flood fill·계측) · `dl-release`(버전·문법·커밋·머지) · `dl-device-check`(PC↔모바일) · `dl-portrait`(초상화) · `dl-playbot`/`viewers/playbot/README.md`(밸런스 봇).

```bash
# 게임 코드만 검색(앞 4,300여 줄은 three.js·글꼴·데이터 — CLAUDE.md '파일 구조')
awk 'NR>4338' index.html | grep -n "찾을것"      # 4338 = 마지막 데이터 블록 줄. 바뀌면: grep -n '^<script>$' index.html | tail -1
```

## 0. 시작 전

- [ ] 작업 브랜치(`claude/…`)인지 — `main` 은 사용자가 "머지해" 할 때만(CLAUDE.md '릴리스 절차').
- [ ] `기획서.md`·`인수인계.md` 에서 이 작업의 자리·열린 결정을 확인 — 기획은 기획서, 상태는 인수인계(CLAUDE.md 머리말).
- [ ] 비슷한 선례를 CLAUDE.md 에서 먼저 찾는다(`grep -n "v8[0-9][0-9]" CLAUDE.md` 로 최근 절) — 같은 함정을 이미 한 번 밟았다.

## 1. 공통 — 플래그 · TDZ · 난수 (무엇을 넣든)

- [ ] **기본 켜짐 플래그**: `const NEWFX_ON = !/[?&]newfx=0/.test(location.search);` (하위 기능이면 `PARENT_ON && …`) — 사용자가 모바일에서 파라미터 없이 바로 보고, 문제면 끌 수 있어야 한다(CLAUDE.md '릴리스 절차').
- [ ] **`?newfx=0` 이면 예전 빌드와 픽셀 단위로 같게** — 꺼진 경로에서 객체를 하나도 안 만들고 난수를 한 번도 안 먹어야 한다. 재질·메시는 **첫 사용 때** 만든다(모듈 로드 때 만들면 uuid 가 난수를 먹는다 — CLAUDE.md '복셀 디스플레이스먼트(v763)' "재질은 첫 사용 때 만든다").
- [ ] **TDZ**: 플래그·상수는 **쓰는 곳보다 위에** 선언. 부팅 중 일찍 도는 코드가 부르는 객체는 `var`(`ui2` 처럼). 함수 선언은 호이스팅되지만 그 안의 `const` 는 아니다 — 앞쪽 블록에서 쓰면 그 안에서 다시 파싱(CLAUDE.md '반복해서 발목을 잡은 함정들' TDZ · 'UI v2 1단계(v814)' · '복셀 바닥은 벽을 낮아 보이게 한다(v784)' · '마을 건물 v2' 도구 TDZ).
- [ ] **THREE 생성자는 난수를 먹는다**(`generateUUID` 가 호출당 `Math.random` 4번). 층 생성 뒤·게임 중에 만드는 객체는 `Math.random` 을 자체 LCG 로 잠깐 바꿔 끼우고 지은 뒤 되돌린다(선례 `sk2Make` · `hrnd` · 골렘 빌더 · `buildLoreDecor`) — 안 하면 다음 층 배치가 통째로 바뀐다(CLAUDE.md '시드는 addInitScript로' 끝 · v810 환경 이야기).
- [ ] **소리·UI·연출은 `Math.random` 금지** — 음악·환경음 `arnd`, 효과음 `kRnd`, UI 는 순번·해시. 소리가 난 횟수에 따라 던전이 달라진다(CLAUDE.md '배경음악(v806)' · 'Kenney 효과음(v832)' · v822 데미지 숫자).
- [ ] 월드 생성에 `Date.now()`·`performance.now()` 금지(CLAUDE.md '켜지 않기로 한 것' 골렘 시드).
- [ ] 매 프레임 루프에만 있는 시계(슬로모·낙하 등)를 새로 만들면 봇 루프(`viewers/playbot/bot.js` 의 `__botRun`)에도 넣는다(CLAUDE.md '4막 측정과 조정(v870)').

## 2. 몬스터 · 보스

- [ ] **뷰어에서 먼저**: 가장 비슷한 `viewers/*_viewer_v1.html` 을 복사해 빌더(`buildXxxBody`)만 갈아 끼운다. 게임과 **글자 그대로 같은 함수**(+ `c3MergeGeos`/`c3MergeStatic`)를 쓴다 — 뷰어 렌더 상수는 손대지 말 것(CLAUDE.md '캐릭터 모델링은 viewers/에서 먼저' · `viewers/README.md` · v854 '뷰어와 게임이 한 함수'). 사용자에게는 `node viewers/build-standalone.js viewers/<파일>.html`.
- [ ] **정면은 −z**. 예전 뷰어 최상위 `rotation.y = Math.PI` 는 옮기지 않는다(CLAUDE.md '3막 몬스터(v750)').
- [ ] **팔레트는 역산** — 베이스 `0x60` 위는 화면에서 다 같은 색, 원화 색을 그대로 넣으면 회색으로 뭉갠다. 목표는 그 막 게임 화면에서 잰다(CLAUDE.md '색은 감으로 찍지 말고 역산할 것' · '팔레트 역산은 게임 안에서도(v751)' · `viewers/README.md` '색 고르기').
- [ ] **피부 = `markOrganic`**. `createAdvancedMonster` 의 `skinMat` 은 자동이지만 **돌·금속·불 타입은 제외 목록에 넣는다**(`grep -n "type !== 'darkknight' && type !== 'golem'" index.html`). 전용 빌더가 자기 재질을 만들면 살·뼈 재질에 직접 건다(CLAUDE.md '새 몬스터의 피부: markOrganic만 부르면…').
- [ ] 비인덱스 20면체 혹을 흔들 때는 `c3JitterShared`(같은 좌표 = 같은 오프셋) — 전역 지터는 깨진 결정 조각(CLAUDE.md v754). 둥근 살덩이는 `vcMerge`(flatShading) 말고 `coralMesh`(v800).
- [ ] **드로우콜**: 색만 다른 재질은 `userData.mergeInto` → `c3MergeStatic` 정점색 병합(재질 수 = 콜 수). 매 프레임 모양이 바뀌는 부위(맥박 핵·구슬·불꽃)는 병합에서 빼고 그룹 스케일 or CPU 정점 갱신 — **정점 셰이더로 흔들지 말 것**(노멀·그림자 패스가 안 따라와 외곽선이 어긋난다). CPU 로 정점을 옮기면 `frustumCulled = false`(CLAUDE.md '3막 몬스터(v750)' · v755 · v864).
- [ ] **캐릭터는 그림자를 안 진다**: `grp.traverse(o => o.castShadow = false)` + 블롭. 점광원 큐브라 캐스터가 6번 그려진다(CLAUDE.md '캐릭터는 진짜 그림자를 안 진다'). 확인: `--eval` 로 `traverse` 해 `isMesh && castShadow` 수.
- [ ] **반지름 ↔ 몸집**: 뷰어 보스는 스케일 1.0 인데 반지름 0.5 → `C3_BOSS_RADIUS` 처럼 곱한다. 길쭉한 몸은 '늘 바라보는 쪽' 길이로(머리 속에 플레이어 횃불이 들어가면 몸이 새까매진다). 반지름이 크면 벽 근처 사각지대 → 돌진기로 덮기(CLAUDE.md v750 · v860 '스케일 1.6 이면 몸이 통째로 새까맸다' · '보스 몸집을 키우면…').
- [ ] 공용 애니메이션이 `limbs.legR/legL/armR/armL` rotation 을 건드린다 — 없는 팔다리는 더미 그룹(`c3BugLimbs`), 네발은 사냥개 요령(v856). 비행 높이는 `baseY` 가 아닌 별도 오프셋(블롭이 뜬다 — v750). 다리 없는 리그의 **빙결 분기**도 확인(v830 — 얼면 일반 근접 코드로 떨어져 화면이 멈췄다).
- [ ] **공격 신호**: 근접·돌진은 `hitPending`/`swingTimer`(=명중까지 남은 시간)를 세운다 — 패링·방어·봇·길잡이가 이걸 본다(CLAUDE.md '혼령 공격 예고(v828)').
- [ ] **피할 수 있는가를 계산**: 반응 0.25초 + 걸음(이속 6.5)으로 예고 시간 안에 판정 밖으로 나가는지 `반경 ÷ 예고` 로 먼저 잰다. 점프는 없다. 빠른 돌진은 방향 고정을 앞당긴다(CLAUDE.md v822 '이 게임엔 점프가 없다' · v856 '빠른 돌진은 고정을 앞당길 것').
- [ ] 스폰: 막 범위는 **양 끝**(`floor >= A && floor <= B`), 느린 거인은 방당 상한, 막 전용 매복도 같이(CLAUDE.md v750 '막이 바뀌면…' · '느린 거인은…' · v752).
- [ ] 이름은 `monsterName(type)` 한 곳 + I18N en(CLAUDE.md v752). 보스는 `BOSS_MATERIAL`·재료·대장간 장비까지(v752 · v868 '4막 재료·장비').
- [ ] **보스 패턴**: 거리순 if 사슬 말고 `c3Pick` 가중 추첨(v757) · 반복 패턴에 영구 버프 금지(v757) · 돌진은 실제 덮는 칸을 재서 사거리(v757) · 기절은 `sk2Stun` 이 보스를 거른다(v869) · 무적 상태는 `a3Blocked` 에 조건 추가(v759) · 보스 판정 모양을 용병 자리로 한 번 더(`MBOSS_ON`, v880) · 스미어 훅은 보스 블록 첫머리(v781) · 한마디는 `STORY_BOSS`(v891, 선택).
- [ ] 죽으며 터지는 몹은 `isDead` 인 채로 터진다 — 위험 목록을 `isDead` 로 거르기 전에 볼 것(v879). 시체를 바로 치울 땐 `visible=false` 말고 스케일 0.04(밝기 시스템이 visible 을 다시 켠다 — v854). 예고 고리는 `disposeEntity`·층 이동 정리 함수(`lavaLinesClear`·`sk2Clear` 옆)에서 치운다.
- [ ] 새 몹 AI 는 목표를 플레이어 좌표로 직접 보지 말고 `tgtP`/`tgtR`·`aggroPos(e)` — 용병 어그로가 깨진다(CLAUDE.md '용병 2단계(v880)').
- [ ] 봇이 그 몹의 '사람이면 아는 공략'(등 뒤 치기·장판 비키기)을 모르면 측정이 튄다 — `viewers/playbot/bot.js` 회피·목표 선택을 같이(v870 · v871 골렘).

## 3. 소품 · 지형 · 이펙트

- [ ] 층 소품은 층 시드 난수(또는 좌표 해시)로, `Math.random` 바꿔 끼우기 안에서 짓는다(v810).
- [ ] **지면 높이**: `applyGroundRelief`/`rlApplyRelief` 는 최상위 자식을 **원점 한 점** 높이로 올린다 — 한자리 소품은 그룹을 자기 자리에, 여러 칸 무늬는 조각마다 높이 + `noRelief`. 복셀 막은 `seatOnGround`/`voxContactCells`. 애니메이션하는 물체는 기준 높이를 기억해 거기에 더한다(절댓값 대입 금지 — CLAUDE.md v810 · v877 '묻힘' · v807 '수면 출렁임이 절대값을 대입했다'). 마을·쉼터는 `groundHeightAt` 이 0 — `townTerrH`/`townGroundY`/`restGroundY`(v786 · v791).
- [ ] 충돌체·길: 상호작용 물체(계단·상자·샘)는 `findClearSpot`/`decorFootprints` 로 보이는 크기까지 피한다(v803). 장애물을 넣었으면 flood fill 로 도달 못 하는 칸 0(아래 6-③) — 고리 모양 무리가 칸을 가둔 선례(v851 · v854 `obsReachFix`).
- [ ] **드로우콜·그림자**: 청크(4×4·8×8칸)마다 재질별 병합 · 장식은 `castShadow` 끔(횃불 큐브 6면 — 삼각형 72k → 166k 선례) · 너무 크게 합치면 컬링이 안 돼 오히려 무겁다 · 카메라를 등진 면은 안 낸다(CLAUDE.md v742 · v797 · v805 · v793).
- [ ] **광원을 새로 만들지 말 것** — 촛대·화로는 `castleTorches` 풀(`li`)에 합류. 점광원 상한은 `cullSceneLights`/`MAX_DYN_LIGHTS`(6) 하나뿐, 켜진 수가 흔들리면 전 재질 재컴파일 → 실기기 흰 화면(CLAUDE.md '점광원 상한을 새로 만들지 말 것' · v796).
- [ ] 같은 평면에 겹친 상자는 깜빡인다 — 기단은 몸통보다 0.1 넓게, 겹친 무늬는 0.004 씩 띄운다(CLAUDE.md '건물이 깜빡이면 AO보다 먼저…' · v810).
- [ ] 위에서 51.9° 로 내려다본다 — 높이 h 는 뒤로 0.78h 를 가린다. 세로로 서야 할 이펙트는 수직이거나 등 뒤로 기울인다(v794 · v806 · v865).
- [ ] 빛·불: `MeshBasicMaterial` + `toneMapped:false`(+ 필요하면 `fog:false`) · 가산 혼합 투명이면 노멀 패스에서 저절로 빠진다 · 블룸 임계 1·3막 0.62 / 2막 0.70 아래로 색을 고를 것(CLAUDE.md '블룸 임계는 막별로 다르다' · v794 · v840). 식생은 `userData.fx`, 건물은 `markArch`.
- [ ] 객체 수가 바뀌는 변경은 빌드 간 픽셀 A/B 가 원천 불가 — 기능을 직접 계측(CLAUDE.md '시드는 addInitScript로' 끝).

## 4. 피해 배관 — 새 공격·장판·스킬

- [ ] 적 → 플레이어: `damagePlayer(amount, 적)`(방어력·한 방 상한·직업 상한이 여기서). 투사체는 가짜 적에 주인(`f.owner`)을 넘긴다(v826).
- [ ] **바닥 공격(장판·분출·용암 비)은 `hazardHit(양, 출처)`** — 용암 비늘 갑주 감소가 이 표식을 본다(v868).
- [ ] **같은 자리에 용병 판정 한 줄**: 원 `mercInCircle` / 띠 `mercNearSeg` → `mercHurt(…, from)` · 투사체 `mercFireballHit` · 근접 휘말림 `mercMeleeSplash`(CLAUDE.md '용병 — 동료 1단계(v879)' · v882 정면 막기는 `from` 이 필요).
- [ ] 플레이어 → 적: 새 스킬·피해는 `skillHit(e, 배수, 온 곳 x, z, 넉백)`(골렘 정면 무적·치명타·숫자·처치까지) · 광역은 `skillAreaDamage(…, at, onHit)`(v869). 날 `e.hp -=` 를 새로 쓰면 `a3Blocked` · `dmgNumAdd` · `alertRoom` · 처치까지 직접 챙겨야 한다(v759 '피해 지점이 한 곳이 아니다' · v824).
- [ ] 용병 → 적: `skillHit(…, 'merc')` — 용병 레벨 배수가 이 표식을 본다(v886).
- [ ] 장판을 다른 막 단 위에 깔면 둘레 가장 높은 단에(`spawnFirePool` 선례 v855), 바닥 이펙트 높이는 `fxGy`(v874).

## 5. UI 창 · 문자열 · 글꼴 · 아이콘 · 소리

- [ ] **새 창 ID 를 ui2 목록 열 줄에** — `grep -n "#loreOverlay" index.html` 이 나오는 `body.ui2 :is(…)` 줄 전부에 같이 넣는다(안 넣으면 예전 파란 창). 닫기·취소 버튼은 보조 버튼 줄(`#restChoiceCancel` 옆), 그리고 `anyOverlayOpen()` 의 `ids` 에(CLAUDE.md v879 'ui2 창 스타일은 창 ID 목록으로' · v889).
- [ ] `translateMarkup` 은 로드 초반에 한 번만 돈다 — 창 글자는 열 때 `_i18n(…)` 으로 넣는다(v879). 숫자는 `{a}` 자리 문장 하나(v887). 이모지가 박힌 기존 키는 바꾸지 않는다(v817).
- [ ] **I18N**: `I18N_DICT` 의 `en·ja·zh·es·pt·ru` 여섯 곳에 같은 키 — 없으면 그 언어 화면에 한국어가 그대로 뜬다(`_i18n` 이 키를 돌려준다). 최소 en, 화면 문장(안내·토스트·창)은 여섯 전부(v819 · v820 · v823 선례).
- [ ] **고운바탕 서브셋**: 새 한글이 서브셋에 없으면 그 글자만 시스템 글꼴로 떨어진다(v814 · v869 '덫' · v891 '짊' · v892 '얘'·'팠' · v893 '럴'). 아래 `font-check.py` 로 확인·재굽기.
- [ ] 화면 크기·터치 좌표는 `scrW()/scrH()`·`tX/tY`·`rectCenter` — `innerWidth`·`clientX` 직접 금지(세로 회전 그리기, v816). 모바일 844×390 에서 창이 넘치면 안쪽 상자 `max-height:100%; overflow-y:auto`(v885).
- [ ] 새 재료·장비·이모지는 `MAT_IC`/`ITEM_IC`/`EMO_IC` 에 픽셀 아이콘(빠지면 이모지로 떨어진다 — v817). 버프는 `drawBuffs` 에 `timed(…)` 한 줄(v818).
- [ ] UI 는 DOM 만 — THREE 객체·난수 없음(v814 · v823). rAF 를 멈춘 하네스에서 CSS 페이드는 투명도 0 에 머문다(v823 계측 함정).
- [ ] 소리: 합성은 `arnd`, 파일은 `<script id="ksfx-data">` 에 −21 dBFS MP3(OGG 는 옛 iOS 에서 안 나온다), 광고 중 무음은 `ac()` 가 null 이라 자동(CLAUDE.md 'Kenney 효과음(v832)' · 'CrazyGames 준수사항').

### 글꼴 검사 — `scripts/font-check.py`

```bash
python3 .claude/skills/dl-new-content/scripts/font-check.py            # 0 = OK · 1 = 빠진 글자(줄·문맥 출력) · 2 = 실행 문제
python3 .claude/skills/dl-new-content/scripts/font-check.py --json     # 기계용
# 빠졌으면: 원본 TTF 를 받아(gstatic, 약 8MB) '지금 cmap ∪ 화면 한글' 로 다시 굽고 index.html 에 갈아 끼운다
python3 .claude/skills/dl-new-content/scripts/font-check.py --rebake --fetch --out <스크래치패드>/ko.woff2 --apply
python3 .claude/skills/dl-new-content/scripts/font-check.py            # 다시 검사 → OK
```
- `<style>`·`<script>`·마크업을 나눠 **화면에 나올 수 있는 한글**(문자열·마크업)과 **주석에만 있는 한글**(JS·CSS·HTML 주석, 셰이더 문자열 속 `//` 주석, 정규식)을 따로 센다. 주석 글자는 빠져도 무해(`--strict` 면 실패로 침).
- 재굽기는 `pyftsubset` 기본값 + `--flavor=woff2` 와 똑같다 — 같은 글자 목록이면 v897 에 박힌 서브셋(90,892바이트)을 **바이트 단위로 재현**한다. 원본은 Google Fonts **css2** API 로 받는다(옛 css API 는 같은 이름의 39KB 일부 글자 TTF 를 줘서 스크립트가 거부한다 · github raw/jsdelivr 는 이 환경에서 403).
- 수동: fontTools 가 없으면 `pip install fonttools brotli`. index.html 176줄 근처 `@font-face { font-family: 'UI2Ko'` 의 base64 를 풀어 `TTFont(...).getBestCmap()` 과 게임 문자열의 `[가-힣]` 를 비교 → `pyftsubset GowunBatang-Bold.ttf --text-file=chars.txt --flavor=woff2` → base64 로 그 자리만 교체. `unicode-range` 가 숫자 0-9 도 UI2Ko 로 보내므로(v816 라이닝 숫자) 숫자는 빼지 말 것.

## 6. 검증 레시피 (보고 전에 전부)

```bash
H=.claude/skills/dl-harness/scripts/harness.js; A=.claude/skills/dl-harness/scripts/ab.sh
bash .claude/skills/dl-harness/scripts/serve.sh              # ① 서버는 저장소 루트(버전·md5 확인)
bash .claude/skills/dl-release/scripts/check.sh              # ② 게임 스크립트 node --check 외
python3 .claude/skills/dl-new-content/scripts/font-check.py  # ③ 글꼴
# ④ 플래그 끄면 예전과 같은가 — 1·2·3·4막 6개 층, 같은 세션에서 순서대로(동시 실행 금지)
for f in 5 15 45 75 95 104; do AB_A_FLAGS='&newfx=0' bash $A main --floor $f --seed 12345; done
#    루프가 넣는 효과(어둠·저체력·눈·횃불)면 --horror, HUD·콤보·이펙트까지면 --frames 20
#    기본(켜짐)이 다른 막에 영향이 없어야 하면 플래그 없이도 같은 층 A/B
# ⑤ 도달성(장애물·소품·몹 충돌체를 건드렸으면) — 플레이어 0.5 · 오크 0.575 · 여유 0.6 에서 0
node $H --floor 25 --seed 5150 --eval "window.__reachR = 0.575" --eval-file .claude/skills/dl-harness/scripts/snippets/reach.js
# ⑥ 새 코드가 난수를 먹지 않는지(소리·UI·연출·틱 함수)
node $H --floor 15 --seed 12345 --eval "(()=>{let n=0;const r=Math.random;Math.random=function(){n++;return r.apply(this,arguments)};try{for(let i=0;i<120;i++){newFxTick(1/60);}}finally{Math.random=r}return {randomCalls:n}})()"
# ⑦ 번역이 여섯 언어에 다 있는지
node $H --floor 1 --eval "['en','ja','zh','es','pt','ru'].map(l=>[l, ['새 문자열 1','새 문자열 2'].filter(k=>!(k in I18N_DICT[l]))])"
```
- [ ] ①~③ 통과 · 하네스 종료 코드 0(**페이지 오류·콘솔 에러 0** — CrazyGames SDK 실패는 '알려진 외부 리소스'로 따로 센다).
- [ ] ④ 먼저 **대조군**(`bash $A HEAD …` 변경 없는 상태 = SAME)이 같은지 본 뒤에만 믿는다(CLAUDE.md '렌더 변경을 비교할 때'). DIFF 인데 방·적 수가 다르면 난수 흐름이 갈린 것 → 1절 난수 규칙 위반을 찾는다. 빌드 간 해시는 같은 세션에서 연달아(v888).
- [ ] ⑤ 실패 층은 그 층만 따로 지으면 재현이 안 될 수 있다 — 앞 층부터 순서대로(v851). 반경 1.0(보스)은 기준 아님.
- [ ] 기능 자체는 `--eval` 로 수치 계측(피해량 = 공식 · 예고 시간 · 패링 · 걸어 나가면 빗나감 · 정리 후 객체 0). 계측 함정은 `dl-harness` 4절(조준은 `mousePos` · 좌표 대입은 벽 통과 · update 직후 플레이어가 계단/함정으로 옮겨질 수 있음 · 멀리 있는 적은 업데이트 안 함).
- [ ] 밸런스를 건드렸으면 봇(`bash .claude/skills/dl-playbot/scripts/batch.sh -o <폴더> -f act3 -c knight,mage -C old='&newfx=0' -C new=''`, 8시드) — **층당 사망 평균 ± 표준오차**로 판단, 한 방 상한·회복량처럼 '몇 방에 죽나'를 바꾸면 사망 수가 아니라 받은 피해/층으로(CLAUDE.md v870 · v871). 레벨 1 하네스로 밸런스 판단 금지(v759).
- [ ] UI 를 바꿨으면 PC 960×540 · 모바일 844×390 스크린샷(`dl-device-check` 또는 `node $H --viewport mobile --shots …`).

## 7. 문서 · 릴리스

- [ ] `CLAUDE.md` **'URL 플래그' 표에 한 줄**(`| ?newfx=0 | 켜짐 | 무엇을 끄는지 · ?newfx=0 이면 vNNN 과 픽셀 단위로 같다 · vNNN |`) + '반복해서 발목을 잡은 함정들'에 이번에 밟은 함정·실측 수치를 한 절(다음 사람이 같은 데서 안 넘어지게).
- [ ] `기획서.md`(무엇을 — 수치표·몬스터 라인업) · `인수인계.md`(어디까지 왔나·열린 결정) 갱신.
- [ ] `dl-release`: `GAME_VERSION` 올림 → `check.sh` → 작업 브랜치 커밋·푸시 → 두 파일(`index.html` + `index-vNNN.html`, 기능 켜진 상태) 전달 → 사용자가 "머지해" 할 때만 `main`. 노션 작업 로그 갱신도 그 절차를 따른다.
- [ ] 임시 디버그 스크립트를 저장소에 남기지 않는다 — 재사용할 것만 스킬 `scripts/` 에(CLAUDE.md '잡동사니').
