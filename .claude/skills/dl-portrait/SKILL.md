---
name: dl-portrait
description: Dungeon Legion 의 NPC·용병·인물 초상화(64px 도트)를 GPT(sprite-gen · codex image_gen, ChatGPT 구독)로 뽑아 게임에 넣을 때 쓴다 — 주제 문장 쓰기 → 후보 A/B 생성 → 비교 시트로 사용자가 고르기 → 64칸 중앙값 + 옥트리 32색으로 줄이기 → refs/ui/초상화/npc/ 보관 → index.html 의 window.NPC_POR_DATA(<script id="npcpor-data">)에 base64 로 넣기 → 대화창·창 머리·여관 카드에 연결 → 브라우저 확인. 기존 초상화를 다시 뽑거나 바꿀 때, codex 로그인(device-auth)이 필요할 때, 초상화 데이터·연결이 맞는지 점검할 때도 이것. Triggers — 한국어: 초상화, 초상화 넣어, 초상화 바꿔, 초상화 다시 뽑아, NPC 얼굴, 대화창 얼굴, 여관 카드 그림, 용병 초상화, 인물 그림, 도트 초상화, 64px, GPT 로 그려, 코덱스 로그인, NPC_POR_DATA, npcpor. English: portrait, NPC portrait, character portrait, face icon, dialog portrait, mercenary portrait, pixel portrait, regenerate portrait, embed portrait, codex login.
---

# dl-portrait — GPT 로 초상화 뽑아 게임에 넣기

근거: `CLAUDE.md` **'NPC 초상화'** 절(v895 · v896 주민·보초 · v897 용병 넷·사제). 릴리스는 **'릴리스 절차'**(→ `dl-release` 스킬), 서버는 **'렌더 변경을 비교할 때'**(저장소 루트에서). 충돌하면 CLAUDE.md 가 이긴다.

```
S=.claude/skills/dl-portrait/scripts     # 전부 저장소 루트에서 실행
P=.claude/skills/dl-portrait/prompts     # style.txt · style_sil.txt · subj.example.tsv · example_p_smith_a.txt
```

| 무엇 | 어디 |
|---|---|
| 화풍 참조(`--ref`) | `refs/ui/초상화/knight_512.png`(직업 초상화 — 64칸 도트 · 남색 배경 · 왼쪽 횃불빛 · 오른쪽 푸른 테 · 머리·어깨) |
| 게임에 넣은 64px 원본(RGB) | `refs/ui/초상화/npc/<key>_64.png` — **이것만 저장소에 둔다**(GPT 원본 1.4MB 는 안 올린다) |
| 게임 데이터 | `index.html` `<script id="npcpor-data">` 의 한 줄 `window.NPC_POR_DATA = {"key":"base64",…};` (게임 스크립트 앞 별도 블록) |
| 연결 | `NPC_POR_KEY` · `NPC_POR_NAME` · `img[data-por]` · `dlgPortrait()` · 여관 카드 `npcPorSrc('m'+id)` (6단계) |

## 0. 준비 — 컨테이너마다(로그인은 이 컨테이너에만 남는다)

```bash
W=<스크래치패드>/por-$(date +%m%d); mkdir -p $W     # 작업 폴더 — 아래 모든 단계가 쓴다(로그인 여부와 무관)
SG=${SPRITE_GEN_ROOT:-/root/.claude/skills/sprite-gen}; ls $SG/.venv/bin/sprite-gen   # 없으면 sprite-gen 스킬의 docs/interpreter.md 대로 venv
which codex || npm install -g @openai/codex
codex login status                     # 'Logged in using ChatGPT' 면 끝
```
로그인이 안 돼 있으면 **사용자가 링크에 코드를 넣어야 한다**(대신 할 수 없다). 백그라운드로 띄우고 로그에서 링크·코드를 꺼내 전한다:
```bash
codex login --device-auth > $W/codex_login.log 2>&1        # Bash run_in_background 로(15분 안에 입력)
sed 's/\x1b\[[0-9;]*m//g' $W/codex_login.log               # https://auth.openai.com/codex/device + 'XXXX-XXXX' 코드 → 사용자에게
grep -q 'Successfully logged in' $W/codex_login.log && codex login status
```
- 프로바이더는 **`codex`(사용자 ChatGPT 구독)만**. `--provider openai` 는 호출마다 과금이라 사용자가 이름을 대지 않으면 안 쓴다(sprite-gen 규칙).
- `~/.codex` 는 세션이 끝나면 사라진다 — 다음 세션에서 또 로그인.

## 1. 주제 문장 — `$W/subj.tsv`

한 줄에 `이름<TAB>주제`. 화풍 문장(`$P/style.txt`)은 `one.sh` 가 앞에 붙인다 — 주제에는 **인물만** 쓴다. 실례: `$P/subj.example.tsv`(실제로 쓴 줄), 조립된 프롬프트: `$P/example_p_smith_a.txt`.
- 나이 · 머리(색·모양) · 얼굴 특징 하나(흉터·주근깨·수염) · 표정 · 옷과 **색 하나를 대문자로**(`deep BLUE horsehair crest`) · 손에 든 것 하나.
- **용병은 게임 3D 몸의 아군 표시색과 맞춘다**: 창잡이 붉은 깃털 · 방패병 푸른 갈기 · 석궁수 초록 두건 · 사제 주황 망토(v897 — 몸을 바꾸면 초상화도 같이).
- 64칸에서 얼굴이 읽혀야 한다 — 소품·배경 디테일은 줄이고 얼굴을 크게.
- `sil*`·`sv*` 이름은 실루엣 화풍(`style_sil.txt`)으로 간다. **v896 에 실루엣 안(C1)을 뽑았지만 사용자가 얼굴·채색으로 바꿨다** — 기본은 얼굴.

## 2. 후보 뽑기 — 인물마다 A/B 두 장 이상

```bash
printf 'smith a\nsmith b\nguide a\nguide b\n' > $W/jobs.txt     # 이름·후보에 따옴표·공백 금지(xargs 가 벗긴다)
bash $S/batch.sh $W $W/jobs.txt 3       # Bash run_in_background 로 — 장당 1~2분, 실패는 한 번 더(600초 제한)
cat $W/batch.log                         # OK/FAIL 이름 후보(실행마다 쌓인다) · OK 면 $W/<이름>_<후보>_64.png 까지 만들어져 있다
bash $S/one.sh $W smith c                # 한 장만 다시(주제를 고친 뒤 c·d·e 로 이어 간다 — 길잡이는 c 에서 정해졌다) · 64px 도 같이
```
`batch.sh` 는 이번 실행에 FAIL 이 하나라도 있으면 exit 1(subj.tsv 에 그 이름 줄이 없을 때도 FAIL). 같은 이름·후보로 다시 돌리면 그 후보 파일을 덮어쓴다 — 고른 후보를 다시 돌리지 말 것.
`one.sh` = `sprite-gen gen --provider codex --prompt-file p_<이름>_<후보>.txt --ref refs/ui/초상화/knight_512.png --out raw_….png --report r_….json`. FAIL 이면 `log_<이름>_<후보>.txt`.

## 3. 비교 시트 → 사용자가 고른다(대신 고르지 말 것)

```bash
python3 $S/sheet.py $W/sheet.png --dir $W                       # 후보 전부(GPT 원본 · 64px ×4 · 게임 크기 128/96/64)
python3 $S/sheet.py $W/sheet_smith.png --dir $W --only smith now=refs/ui/초상화/npc/smith_64.png   # 바꾸는 경우 지금 것과 나란히
```
`SendUserFile`(display: render)로 보내고 고르게 한다. 이름표는 ASCII(기본 글꼴엔 한글이 없다). 마음에 안 들면 주제 줄을 고쳐 2단계로.

## 4. 64px 확정 · 원본 보관

```bash
cp $W/smith_a_64.png refs/ui/초상화/npc/smith_64.png          # key 는 소문자·숫자(용병은 'm'+종류 id: mspear · mshield · mxbow · mmonk)
```
`one.sh`(·`batch.sh`)가 안 줄였거나 손본 원본이면: `python3 $S/down.py $W/raw_smith_a.png refs/ui/초상화/npc/smith_64.png --preview $W/smith_x8.png`
- **그냥 resize 하지 말 것** — GPT 의 '도트'는 정확한 격자가 아니다(1254px · 칸 약 19.6px 들쭉날쭉). 64칸으로 나눠 **칸 가운데 60% 중앙값**.
- **색은 옥트리(FASTOCTREE) 32색 · 디더 없음** — 중앙 절단 24색은 작은 채도 높은 영역을 합쳐 길잡이 등불의 보라 불꽃이 흰빛이 됐다.
- `down.py` 는 numpy 가 있으면(sprite-gen venv) numpy, 없으면 순수 파이썬 — 결과는 같다(게임 19장 중 6장으로 두 경로 모두 픽셀 일치 확인).

## 5. 게임에 넣기 — `embed.py`

```bash
python3 $S/embed.py --dry-run smith refs/ui/초상화/npc/smith_64.png    # 무엇이 바뀌나만
python3 $S/embed.py smith refs/ui/초상화/npc/smith_64.png              # 교체(키 순서 유지) / 새 키는 끝에
python3 $S/embed.py --list                                              # 키 · 64x64 · 색 수 · base64 길이
python3 $S/embed.py --extract smith $W/x.png    ·   --remove KEY      # --html 다른파일 로 복사본에 시험할 수 있다
```
- `NPC_POR_DATA` 한 줄만 갈아 끼우고 다른 바이트는 그대로(쓴 뒤 앞뒤 일치 확인 · 원자적 교체). 줄을 다시 덤프해 원문과 다르면 **아무것도 안 쓰고 멈춘다**.
- 인코딩은 v895~v897 그대로: RGB → `quantize(32, FASTOCTREE)` → PNG optimize → base64. refs 의 64px 을 넣으면 들어 있는 값과 **바이트 단위로 같다**(같은 Pillow·zlib 일 때).
- 그다음 **손으로**: 블록 머리 주석(`/* v895 … · v897 용병 넷 … */`)에 이번 버전·무엇을 넣었는지 한 마디.

## 6. 연결 — 새 키일 때만(교체는 할 일 없음)

| 어디에 뜨나 | 하는 일 |
|---|---|
| 대화창(스토리 NPC) | `NPC_POR_KEY` 에 `스토리키: '키'`. 스토리키 = 마을 `makeVillager(…, { story: 'elder' })` · 쉼터 `makeRestNPC` 가 붙이는 `restCleric`/`restTraveler`/`guide` |
| 대화창(이름 없는 주민·보초) | `NPC_POR_NAME` 에 `['한국어 이름', '키']` — `npc.name` 은 **번역된 이름**이라 `_i18n(한국어 키)` 와 비교한다. 이름은 번역 사전 키 그대로 |
| 대화창(특수) | 대화를 여는 곳에서 `dlgPortrait('키')`(마을 성직자 이야기가 `dlgPortrait('cleric')`) |
| 창 머리(여관·축복·대장간·교관) | 창 마크업 맨 위에 `<img class="npcPor npcPorWin" data-por="키" alt="" style="display:none;">` — 로드 때 `porApplyWin()` 이 채운다 |
| 여관 용병 카드 | 키를 `'m' + 종류 id` 로 넣으면 끝(`npcPorSrc('m' + id)` · 잠긴 종류는 흑백) |

- 크기는 CSS `.npcPor`(대화창 128 · 창 머리 96 · 카드 64, 세로 520 아래·가로 돌려 그리기면 한 단 작게) — **정수 배율·pixelated 를 깨지 말 것**(0.9·1.08 배는 도트가 뭉갰다 — v814).
- DOM 만 쓴다(THREE 객체·난수 없음) → 게임 화면 픽셀 해시와 무관. `?portrait=0` 이 전부 끈다 — 새 플래그는 필요 없다.
- 새 한글 이름 문자열을 넣었으면 고운바탕 서브셋 cmap 부터(CLAUDE.md 'UI v2 1단계').

## 7. 확인 → 릴리스

```bash
curl -s localhost:8899/index.html | grep -o "GAME_VERSION = 'v[0-9]*'" | head -1   # 저장소 루트 서버인지 먼저
node $S/check.js --shot $W/chk.png --dialog smith
```
- `check.js`(Playwright · 읽기만 · 페이지를 두 번 열어 1분 안팎): 모든 키가 브라우저에서 64×64 로 디코드 · **빠짐**(부르는데 데이터 없음 — `data-por#창ID` 처럼 어디서 부르는지 찍는다) · **안 쓰임** · `?portrait=0` 이면 전부 숨김 · 페이지 오류.
  exit 1 = 64×64 아님 · 빠짐 · 숨김 실패. **안 쓰임은 경고만**(exit 0) — 5단계에서 넣고 6단계 연결을 아직 안 한 키가 여기 뜬다. exit 2 = 서버·게임이 안 뜸(`--url` 로 다른 주소).
  `--shot OUT.png` 은 전체 초상화 한 장, `--dialog KEY` 는 대화창에 띄운 화면(`OUT_dialog.png` — `--shot` 과 같이 써야 한다).
- 실제 자리(대화창 · 여관 카드 · 모바일 844×390)까지 보려면 `dl-harness`/`dl-device-check` 스킬.
- 게임 코드가 바뀌었으니 **`dl-release`**(GAME_VERSION 올림 · 두 벌 · 작업 브랜치). CLAUDE.md 'NPC 초상화' 절에 한 줄(vNNN · 누구 · 연결 방식 · 고른 후보).

## 함정

- **서버는 저장소 루트에서**(스크래치패드에서 띄우면 예전 index.html). 임시 서버(예: 복사본을 `--url` 로 시험)를 끌 때 `pkill -f "http.server 8893"` 처럼 쓰면 **그 패턴이 자기 셸 명령줄에도 들어 있어 자기 셸을 죽인다**(exit 144 — 따로 불러도 마찬가지다). 글자 하나를 괄호로 감쌀 것: `pkill -f "http[.]server 8893"`(CLAUDE.md `node mrun[.]js` 와 같은 요령). 띄울 때는 `setsid nohup python3 -m http.server 8893 < /dev/null &`.
- `xargs` 는 따옴표를 벗긴다 — jobs.txt 에 이름·후보 말고 넣지 말 것.
- 스크래치패드(GPT 원본·후보)는 세션이 끝나면 지워진다 — 고른 64px 은 바로 `refs/ui/초상화/npc/` 로.
- 3D 몸을 바꾸면(예: v897 수도사 → 사제) 초상화·이름도 같이 바뀌어야 한다 — 내부 id(`monk` → 키 `mmonk`)는 그대로 둔다.

## 이 스킬을 만들 때 검증한 것(2026-10, v897)

`index.html` 임시 복사본에서: refs 의 19장을 같은 키로 다시 넣기 → **바이트 단위로 같음** · 다른 그림으로 바꿨다 되돌리기 · 마지막 키 지웠다 다시 넣기 · 새 키 넣었다 지우기 → 전부 원본과 같음 · 64×64 아님/잘못된 키/없는 키는 아무것도 안 쓰고 멈춤. `down.py` 로 스크래치패드 GPT 원본 → 게임 refs 6장 픽셀 일치(numpy·순수 둘 다). 가짜 sprite-gen 으로 `batch.sh` → `p_smith_a.txt` 가 v895 원본과 같음 · 실패 재시도 2회. `check.js` → v897 19장 정상 · 키를 지운 복사본에서 `smith ← data-por#smithOverlay` 빠짐 · 안 쓰인 키 검출(exit 1). GPT 는 부르지 않았다.

독립 점검(같은 날): 위 순서대로 새로 따라 하며 고친 것 — `sheet.py --dir … --only … now=…`(옵션 뒤 이름표=경로가 argparse 오류) · `jobs.txt` 마지막 줄에 개행이 없으면 64px 를 안 만들던 것 · `one.sh` 로 한 장만 다시 뽑으면 64px 이 없어 시트에 안 나오던 것(이제 `one.sh` 가 줄인다) · 같은 이름·후보 재실행에서 예전 raw 가 남아 있으면 GPT 가 실패해도 OK 로 치던 것 · `batch.sh` 종료 코드가 마지막 줄에만 달려 있던 것 · `W=` 가 로그인 블록 안에만 있던 것 · 연결 단계 번호(5 → 6) · `pkill` 함정 안내(따로 불러도 자기 셸을 죽인다 → `http[.]server`) · `check.js` 의 playwright 경로 고정·`--dialog` 단독 사용.
