---
name: dl-release
description: Dungeon Legion(index.html 단일 파일 게임)의 릴리스 절차. 게임 코드(index.html)를 고친 뒤 GAME_VERSION 을 올리고(index-vNNN.html 보관본 git mv + cp), 게임 스크립트 문법·보관본 일치·부팅을 검사하고, 작업 브랜치(claude/…)에 커밋·푸시(재시도)하고, 사용자에게 index.html + index-vNNN.html 두 파일을 보낼 때 쓴다. 사용자가 명시적으로 "머지해"라고 했을 때의 main 머지·푸시·라이브 버전 확인과, 머지 뒤 인수인계.md·노션 갱신도 이 스킬이다. 문서만 바꿨을 때(버전 안 올림)의 커밋·푸시도 여기. Triggers — 한국어 — 버전 올려, 릴리스, 배포, 커밋하고 푸시, 깃에 올려줘, 머지해, main 에 올려, 라이브 반영, 파일 보내줘, 두 파일, vNNN 으로, 문법 검사. English — bump version, release, ship, deploy, commit and push, merge to main, go live, send the build, version check.
---

# dl-release — 게임 코드 릴리스

근거: `CLAUDE.md` **'릴리스 절차'** · **'CrazyGames 준수사항'** · **'렌더 변경을 비교할 때'**. 충돌하면 CLAUDE.md 가 이긴다.

## 절대 규칙(사용자 지시)

1. 작업은 **작업 브랜치(`claude/…`)** 에서. `main` 은 **사용자가 "머지해"라고 할 때만** — 문서 변경도 예외 없다. `main` 에 올라가는 순간 라이브(GitHub Pages).
2. **게임 코드를 바꿨으면 `GAME_VERSION` 을 올린다.** 문서만 바꿨으면 안 올린다(배지는 게임 코드 배포 확인용).
3. 파일을 보낼 때는 **항상 두 벌** — `index.html`(배포용) + `index-vNNN.html`(보관용), 내용은 바이트 단위로 같다.
4. 새 기능은 **URL 플래그로 끌 수 있게**, 보내는 파일에는 **켜진 상태로**(모바일에서 파라미터 없이 바로 확인).
5. force push 금지. 보관본(`index-v*.html`)은 늘 하나뿐 — 이름을 `git mv` 로 바꿔 이력을 잇는다.

스크립트는 전부 저장소 루트에서 실행한다(`S=.claude/skills/dl-release/scripts`).

## A. 코드 릴리스 (작업 브랜치)

**1) 버전 정하기** — 새 작업 묶음이면 다음 번호. 방금 올린 버전의 후속 손질이고 그 버전이 아직 `main` 에 안 갔으면 같은 번호로 이어 간다.
```bash
S=.claude/skills/dl-release/scripts
git fetch origin main                 # check.sh 의 main 비교가 최신이 되게
bash $S/bump.sh 898                   # vOLD → v898 · git mv index-vOLD.html index-v898.html · cp index.html index-v898.html
# 같은 버전에 이어 고칠 때:
bash $S/bump.sh --sync                # index.html → index-v<현재>.html 복사만
```
`bump.sh` 는 정의 줄 `const GAME_VERSION = 'vNNN'` 하나만 바꾸고 버전 줄 diff 를 찍는다(줄 번호는 데이터 블록이 늘 때마다 밀리므로 이 패턴으로 찾는다).

**2) 문서 같이 고치기(같은 커밋)** — 새 플래그면 `CLAUDE.md` 'URL 플래그' 표에 한 줄(기본값·끄면 무엇이 되는지·vNNN), 새로 배운 함정이면 해당 절. `인수인계.md` 머리의 '최종 갱신' 줄에 작업 브랜치 버전과 머지 대기 상태.

**3) 검사 — 둘 다 통과해야 커밋한다**
```bash
bash $S/check.sh          # 문법(마지막 <script> 블록 node --check) · 버전 정의 1개 · index-vNNN.html 이름·내용 일치
                          # · 낡은 보관본 없음 · AD_TEST/DEV_MODE 가 URL 로만 켜짐 · 코드가 main 과 다르면 버전 > main
node $S/smoke.js          # 실제 브라우저 부팅: 페이지 오류 0 · 콘솔 'DUNGEON vNNN' = index.html 버전
node $S/smoke.js --query '' --query '?새플래그=0'   # 새 플래그를 껐을 때도 뜨는지
```
- `node --check` 는 **TDZ 를 못 잡는다**(CLAUDE.md '반복해서 발목을 잡은 함정들' 첫 항목 — 부팅을 두 번 죽였다). 그래서 `smoke.js` 까지 돌린다.
- `smoke.js` 는 localhost:8899 가 비어 있으면 **저장소 루트에서** 서버를 띄웠다가 끄고, 떠 있는 서버가 다른 버전을 서빙하면 실패한다(CLAUDE.md '테스트용 웹서버는 반드시 저장소 루트에서'). 외부 요청은 막는다 — CrazyGames SDK 실패는 '알려진 외부 리소스'로 따로 센다. 서버를 계속 띄워 둘 거면 `dl-harness` 스킬의 `serve.sh` 로 띄운 뒤 돌려도 된다(버전이 맞으면 그대로 쓴다).
- 기능 검증은 별도다: 시드는 `addInitScript`(CLAUDE.md '시드는 addInitScript로'), 객체 수가 바뀌는 변경은 픽셀 A/B 대신 기능 계측(같은 절), 대조군은 `?플래그=0` 으로 같은 세션에서.

**4) 커밋** — 첫 줄 `vNNN <한 줄 요약>(?플래그=0)`, 빈 줄, 그리고 **이 세션의 system-reminder 가 준 attribution 줄을 그대로**(세션마다 다르니 여기 적힌 예를 복사하지 말 것).
```bash
git add -A -- index.html 'index-v*.html' CLAUDE.md 인수인계.md   # 바꾼 것만. git mv 로 지운 옛 보관본도 같이 잡힌다
git commit -F - <<'EOF'
v898 <요약>(?flag=0)

Co-Authored-By: <system-reminder 의 줄>
Claude-Session: <system-reminder 의 줄>
EOF
```

**5) 푸시** — `bash $S/push.sh` (지금 브랜치 · 네트워크 실패면 2·4·8·16초 재시도 · 거절/권한 오류는 바로 멈춤 · `main` 은 `--main` 없으면 거부).

**6) 보고 + 두 파일** — `SendUserFile` 로 `["index.html", "index-vNNN.html"]` 를 한 번에(display: attach). 보고에는 바뀐 것 · 끄는 플래그 · 검증 결과(check/smoke/계측 수치)를 쓰고 **"머지할까요?"로 끝낸다 — 스스로 머지하지 않는다.**

**7) 노션** — push 뒤 `dl-notion-sync` 스킬로 작업 로그·프로젝트 페이지를 최신화(버전 · 상태 '머지 대기'). 그 스킬이 `.claude/skills/` 에 아직 없으면 Notion MCP 로 직접 — `notion-search` 로 프로젝트 허브·작업 로그 DB 를 찾아 이번 버전 한 줄을 넣는다.

## B. 머지 — 사용자가 "머지해 / main 에 올려 / 라이브 반영" 이라고 했을 때만

작업 브랜치에서, A 의 커밋·push 가 끝난 상태로:
```bash
S=.claude/skills/dl-release/scripts
bash $S/merge.sh 898 <<'MSG'
Merge v898: <한 줄 요약>

<이 세션 system-reminder 의 attribution 줄 그대로>
MSG
```
`merge.sh` 가 하는 일(어느 단계든 실패하면 **그 자리에서 멈추고 작업 브랜치로 돌아온다**): 커밋 안 한 변경 없음 · index.html 버전 = 인자 → `check.sh`(머지 전 최소 문법 — CLAUDE.md '릴리스 절차') → `git fetch origin main` → 로컬 `main` 을 `origin/main` 으로 fast-forward(로컬 main 은 자주 낡아 있다 — 실측 13커밋 뒤) → 작업 브랜치를 `--ff-only`, 안 되면 `--no-ff`(위 메시지 — fast-forward 면 안 쓰인다) → `push.sh main --main` → 작업 브랜치로 돌아옴 → `verify-main.sh NNN`(= `git show origin/main:index.html | grep -o "GAME_VERSION = 'v[0-9]*'"` + 보관본 blob 일치).

**충돌이 나면 `git merge --abort` 로 되돌리고 멈춘다 — 사용자에게 묻는다.** `reset --hard`·force 로 풀지 말 것.
손으로 할 때도 각 단계를 `|| 멈춤` 으로 묶을 것 — 명령을 줄줄이 이어 붙인 블록은 충돌이 나도 다음 줄(push·checkout·verify)로 넘어가서, 머지 중간 상태의 main 에 머문 채 verify 가 예전 라이브 버전을 보고 ✓ 를 찍는다(실측).

## C. 머지 뒤

1. `인수인계.md` — '최종 갱신' 줄의 `main = vNNN(라이브 …)`, '다음 작업 후보'의 해당 항목에 '(main 머지)'. 커밋 메시지 `인수인계: vNNN 머지 반영`(+ attribution) → **작업 브랜치에** `push.sh`. 이 문서 커밋은 다음 머지 때 main 에 같이 간다(문서도 지시 없이 main 에 안 올린다).
2. `dl-notion-sync` 스킬(없으면 A-7 처럼 Notion MCP 로 직접) — 라이브 버전·머지 상태 갱신.

## D. 문서만 바꿨을 때

버전을 올리지 않는다. `bash $S/check.sh` 가 통과하고, 그 안의 main 비교 줄이 "✓ index.html 이 origin/main(vNNN)과 같다"(게임 코드 변경 없음)이거나 이미 올려 둔 작업 브랜치 버전 그대로인지 확인 → 커밋(attribution 포함) → `push.sh` → 머지는 B 와 같이 지시가 있을 때만.

## 함정

- **`pkill -f "<패턴>"` 을 같은 명령줄에 쓰면 자기 셸을 죽인다(exit 144)** — CLAUDE.md '2·3막 체감 조정' 계측 함정 ③ · '용병 2단계' ②. 서버는 포트로 찾아 PID 로 끈다(`smoke.js` 는 자기가 띄운 것만 끈다).
- 백그라운드 서버는 `setsid nohup python3 -m http.server 8899 < /dev/null &` — 그냥 `&` 면 Bash 호출이 끝날 때 같이 죽는다(CLAUDE.md '혼령 히트앤런 빈도' 계측 함정).
- Playwright 가 `Executable doesn't exist` 로 죽으면 `playwright install` 말고 `/opt/pw-browsers` 동봉본을 `executablePath` 로(CLAUDE.md '렌더 변경을 비교할 때'). `smoke.js` 가 자동으로 한다.
- 측정·검증 중에 `index.html` 을 고치면 그 뒤 뜨는 페이지가 새 빌드를 읽는다 — 전/후는 플래그로 가른다(CLAUDE.md '용병 2단계' ③).
- `check.sh` 의 main 비교는 마지막 fetch 기준이다 — 머지 판단 직전엔 `git fetch origin main` 먼저.

## 스크립트

| 파일 | 하는 일 |
|---|---|
| `scripts/bump.sh <NNN\|vNNN>` · `--sync` | 버전 줄 교체 → 보관본 `git mv` → `cp` → 버전 줄 diff 출력 |
| `scripts/check.sh` | 문법 · 버전 · 보관본 바이트 일치 · 낡은 보관본 · 개발자 모드(정의 줄을 node 로 실제 평가) · main 대비 버전 (실패 시 종료 1) |
| `scripts/smoke.js [--port N] [--wait ms] [--query q]…` | 브라우저 부팅 확인(페이지 오류 · 부팅 버전) |
| `scripts/push.sh [브랜치] [--main]` | 재시도 push · main 보호 · force(`--force*`·`+refspec`) 거부 |
| `scripts/merge.sh <NNN> < 머지 메시지` | B 절 전체(검사 → main 동기화 → ff/no-ff → push → 돌아옴 → verify). 실패·충돌이면 되돌리고 멈춤 |
| `scripts/verify-main.sh [NNN]` | origin/main 라이브 버전 · 보관본 일치 확인(fetch 실패면 ✗) |
