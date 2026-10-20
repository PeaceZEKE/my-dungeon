---
name: dl-monster-model
description: Dungeon Legion 몬스터·보스 3D 모델을 높은 품질로 새로 짓거나 다시 지을 때 쓴다 — 원화(GPT codex 설정화) → 작업 폴더(setup.py — 뷰어 사본 · 지금 빌더 원문 · 손잡이 계약 · 하네스) → BRIEF.md(요청서) → 저장된 워크플로 'monster-model'(빌더 여럿이 강조점을 달리해 따로 짓기 → 심사 둘 → 합성 → 적대적 검증 둘 → 수정, 에이전트마다 노력 'high' 고정) → 뷰어에 합치기 → 사용자에게 렌더·뷰어 보내기. 세션 노력 설정이 낮아도 같은 품질이 나오게 하는 것이 목적이다(2026-10-20 지옥의 군주 나가형이 이 과정으로 나왔다). 1~4막 몬스터 뷰어(viewers/actN_monster_viewer_v1.html)를 쓴다. 게임 이식(버전 · 플래그)은 이 스킬 밖 — 사용자가 지시하면 dl-new-content · dl-release. Triggers — 한국어 — 몬스터 모델링, 보스 모델링, 몬스터 다시 만들어, 새 몬스터 모델, 퀄리티업, 원화처럼 만들어, 모델 새로 해, 형태 바꿔, 디자인 바꿔, 뷰어에서 다시 지어, 설정화 뽑아, 원화 후보, 몬스터 리디자인, 고품질 모델링, 워크플로로 모델링. English — remodel monster, new monster model, boss redesign, quality pass on models, model it like the concept art, multi-agent modeling workflow, concept art candidates.
---

# dl-monster-model — 고품질 몬스터 모델링

**품질은 노력 설정이 아니라 과정에서 나온다.** 10-20 지옥의 군주(뱀 하체 · 팔 넷)가 좋았던 이유는 ① 빌더 셋이 강조점을 달리해 따로 짓고 ② 심사 둘이 고르고 ③ 다른 안의 좋은 점을 옮겨 붙이고 ④ 적대적 검증 둘이 문제를 찾아 ⑤ 고쳤기 때문이고, 그동안 **probe 가 게임 계약(손잡이 · 관절 자리 · 자세 · 난수)을 숫자로 지켰기 때문이다.**
저장된 워크플로가 에이전트마다 노력을 `high` 로 고정하므로 이 세션의 노력 설정이 낮아도 같은 깊이로 돈다. 이 스킬을 부르는 것 자체가 워크플로 실행 동의다(사용자가 스킬을 불렀거나 '모델링해줘'로 이 스킬이 맞을 때).

**비용(실측 10-20, full · 빌더 3)**: 에이전트 9 · 하위 에이전트 토큰 약 510만 · 약 4시간 30분. `light`(빌더 1 + 검증 1 + 수정) 는 대략 그 1/3. 시작하기 전에 사용자에게 모드와 대략의 시간을 한 줄로 알린다.

## 0. 원화(없거나 바꿀 때)
```bash
S=.claude/skills/dl-monster-model/scripts
bash $S/concept.sh /tmp/…/scratchpad/cA.png 4 "THE LORD OF HELL, variant A — a NAGA-like demon …" boss &   # 후보 여럿은 & 로 동시에
```
후보를 사용자에게 보내 고르게 한다(섞어도 된다). 고른 것은 `refs/몬스터/N막/<타입>.jpg`, 안 고른 후보는 `<타입>_alt_X.jpg` 로 남기고 그 폴더 README 표에 한 줄. **게임에서의 제약(충돌 반지름이 원 · 위에서 내려다봄 · 기존 패턴)을 후보마다 한 줄씩 같이 적어 추천할 것** — 10-20 에 A(똬리 = 원형 발자국)를 추천한 근거가 그것이었다.

## 1. 작업 폴더
```bash
python3 $S/setup.py --viewer viewers/act4_monster_viewer_v1.html --type hellsovereign --name sov --concept refs/몬스터/4막/hellsovereign.jpg
#   v2 빌더가 아직 없는 종류: --new --fn a3Sporeling
bash $S/serve.sh && node $S/probe.js viewers/_work/sov 0     # b0(빈 파일 = 지금 그대로)가 전부 ✓ 인지 — 하네스가 맞는지 먼저
```
`viewers/_work/<이름>/`(gitignore). `contract.json` 의 `lock`(자세마다 예전 자리에 있어야 하는 손잡이)·`poses`·`budget` 을 BRIEF 에 맞게 손본다 — 자세 함수가 있는 보스는 setup 이 무기·팔·손을 자동으로 잠근다.

## 2. BRIEF.md 채우기(메인 에이전트 몫 — 품질을 가장 많이 좌우한다)
틀은 setup 이 깔아 둔다. 채울 것: **사용자 말 원문**(예: "날개는 더 크게") · 원화가 보여 주는 것 · 원화와 다르게 할 것 · 게임에서 하는 일(index.html 에서 그 타입·손잡이를 grep 해 확인 — 패턴 · 게임이 만지는 손잡이 · 비행 등 높이 변화) · 이번만의 제약(바닥에 남아야 하는 부분 등) · 판단 기준. 짧고 구체적으로.

## 3. 워크플로
```
Workflow({ name: 'monster-model', args: { work: '/home/user/my-dungeon/viewers/_work/sov', n: 3, effort: 'high', mode: 'full' } })
```
- `mode: 'light'` — 작은 손질(한 부위 · 색 · 크기). `n` 2~4. `effort` 'xhigh'·'max' 도 된다.
- `args.dryRun: true` 면 설정만 돌려준다(이름이 잡히는지 확인용).
- 끝나면 결과의 `final`(예: `b4.js`)을 직접 확인한다: `probe.js` 전부 ✓ · `shot.js` 로 정면/측면/뒷면/게임 시점/주요 자세 · 원화와 나란히. **결과 요약을 믿지 말고 그림을 본다.**

## 4. 뷰어에 합치기 · 보내기
- 최종 `function <fn>(P)` 를 그 막 뷰어의 v2 블록(`/*ANNEW*/ … /*ANEND*/` 사이 — 4막은 스크래치 `a4_new.js` → inject 로 관리했다)에서 같은 이름 함수와 바꾼다. 막 공통 도구를 고쳐야 하면(예: 10-20 `a4Lava` 의 applyToon 대비) 그 막의 모든 종류를 다시 probe.
- 뷰어 전 종류 확인(오류 0 · 손잡이 · 난수) → `node viewers/build-standalone.js viewers/<뷰어>.html` → 비교 시트(게임 시점 예전 ↔ 새 + 3/4) 와 단일 파일 뷰어를 보낸다 → `viewers/README.md` 한 줄 → 커밋·푸시(작업 브랜치 · 게임 코드 안 바꿨으면 버전 안 올림).
- 게임 이식은 사용자 지시가 있을 때만(이전 막 v905~v907 과 같은 방식 — 옛 몸을 지은 뒤 a1Lcg 안에서 새 몸 · `?aNm=0` 플래그 · 픽셀 해시 A/B).

## 함정(이번에 실제로 걸린 것)
- **게임의 `applyToon` → `makeToonChar` 가 모든 몬스터 재질의 `customProgramCacheKey` 를 'toonChar5' 로 덮어쓴다** — 자체 셰이더 재질이 다른 몬스터 프로그램과 섞인다. 뷰어에는 이 함수가 없어 뷰어에서는 안 보인다. 셰이더를 거는 쪽에서 makeToonChar 를 먼저 걸고 키를 따로 쓰거나(`a4Lava`) `userData._toon = true` 로 뺀다.
- 몸이 기울어지는 자세(bodyGrp 회전)에서 바닥에 닿는 부분이 땅을 뚫는다 → 그 부분은 `grp` 에 따로.
- 4막 바닥은 기둥 단이라 울퉁불퉁하다 — 발자국이 넓은 몸(똬리)은 일부가 묻힐 수 있다(지옥의 군주 324자리 중 7자리 최대 0.25). 이식할 때 보스 방 바닥을 다질지 정한다.
- 병합 · _glowMat · 메시 자식 · 정점 흔들기 등 공통 함정은 SPEC.template.md 14항목.

## 파일
| 파일 | 하는 일 |
|---|---|
| `scripts/setup.py` | 작업 폴더 — base.html(하네스 걸이) · ref.js(지금 빌더 원문, 괄호 맞춰 뽑고 node --check) · contract.json(자세 이름·잠글 손잡이 자동) · SPEC.md · BRIEF.md 틀 · v0 |
| `scripts/build.py <폴더> <N>` | b<N>.js 를 뷰어 끝 `<script>` 로 덧붙여(같은 이름 함수 덮어쓰기 + rebuild()) v<N>.html |
| `scripts/serve.sh` | viewers/_work 를 :8898 로(setsid nohup) |
| `scripts/shot.js <폴더> <N> <접두사> [--views …] [--cmp] [--zoom] [--pose 이름,k,쪽] [--limbs JSON] [--walk] [--atk s]` | 한 브라우저에서 여러 시점 |
| `scripts/probe.js <폴더> <N>` | 예전 ↔ 새 — 오류 · 손잡이 · 난수 · 잠근 손잡이 자세별 차이 · 예산 · _glowMat · 토글/걷기 60프레임 · 크기/가장 낮은 점(✗ 면 종료 1) |
| `scripts/concept.sh <출력> <막> "<설명>" [boss]` | codex 설정화 한 장 |
| `SPEC.template.md` · `BRIEF.template.md` | 에이전트 공통 규칙 · 요청서 틀 |
| `/.claude/workflows/monster-model.js` | 저장된 워크플로(노력 고정) |
