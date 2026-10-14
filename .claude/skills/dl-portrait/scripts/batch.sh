#!/bin/bash
# dl-portrait · 후보 여러 장을 병렬로 뽑고 64px 로 줄이기
#
#   bash .claude/skills/dl-portrait/scripts/batch.sh <작업폴더> <jobs.txt> [병렬 수=3]
#
# jobs.txt 는 한 줄에 '<이름> <후보>'(예: 'smith a' · 'smith b'). 줄마다 one.sh 를 돌린다 — one.sh 가 성공한 것은
# down.py 로 <이름>_<후보>_64.png 까지 만든다. 진행은 <작업폴더>/batch.log 에 'OK/FAIL 이름 후보' 로 쌓인다.
# 오래 걸리므로(장당 1~2분 · 병렬 3이면 6장에 4~5분) Bash 의 run_in_background 로 돌리고 batch.log 를 볼 것.
# 이름·후보에 따옴표·공백·& 를 넣지 말 것 — xargs 가 따옴표를 벗긴다(CLAUDE.md '용병 2단계' 계측 함정 ①).
set -u
[ $# -ge 2 ] || { echo "사용: bash $0 <작업폴더> <jobs.txt> [병렬 수=3]"; exit 2; }
W=$1; J=$2; P=${3:-3}
[ -s "$W/subj.tsv" ] || { echo "$W/subj.tsv 가 없다 — SKILL.md 1단계"; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
grep -v '^\s*$' "$J" | xargs -P "$P" -L 1 bash "$HERE/one.sh" "$W" | tee -a "$W/batch.log" | tee "$W/.batch_this.log"
# 이번 실행에 FAIL 이 하나라도 있으면 exit 1(batch.log 는 실행마다 쌓이므로 이번 것만 본다)
! grep -q '^FAIL' "$W/.batch_this.log"
