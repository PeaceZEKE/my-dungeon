#!/bin/bash
# dl-portrait · 초상화 후보 한 장 뽑기(GPT · sprite-gen gen --provider codex)
#
#   bash .claude/skills/dl-portrait/scripts/one.sh <작업폴더> <이름> <후보>
#   예) bash .claude/skills/dl-portrait/scripts/one.sh "$W" smith a
#
# <작업폴더>/subj.tsv 에서 '<이름>\t<주제 문장>' 줄을 찾아 화풍 문장(prompts/style.txt — 이름이 sil*·sv* 면 style_sil.txt) 뒤에
# 붙여 <작업폴더>/p_<이름>_<후보>.txt 를 만들고, 직업 초상화 knight_512.png 를 --ref 로 넘겨 GPT 로 그린다.
# 결과: raw_<이름>_<후보>.png(약 1254px) · <이름>_<후보>_64.png(down.py) · r_…json(보고서) · log_…txt.
# 실패하면 한 번 더(장당 1~2분, 제한 600초). 성공이면 'OK 이름 후보', 아니면 'FAIL …' 을 찍고 exit 1.
# v895~v897 에 쓴 스크래치패드 port/one.sh 를 옮긴 것 — 출력이 스킬 폴더가 아니라 작업 폴더에 남도록 경로만 바꿨다.
#
# 환경 변수: SPRITE_GEN_ROOT(기본 /root/.claude/skills/sprite-gen) · POR_REF(기본 refs/ui/초상화/knight_512.png)
set -u
W=$1; n=$2; v=$3
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$(dirname "$HERE")"
REPO="$(cd "$SKILL/../../.." && pwd)"
SG="${SPRITE_GEN_ROOT:-/root/.claude/skills/sprite-gen}/.venv/bin/sprite-gen"
REF="${POR_REF:-$REPO/refs/ui/초상화/knight_512.png}"
[ -x "$SG" ] || { echo "FAIL $n $v (sprite-gen 없음: $SG — SKILL.md 0단계)"; exit 1; }
[ -s "$REF" ] || { echo "FAIL $n $v (참조 그림 없음: $REF)"; exit 1; }
cd "$W" || exit 1
s=$(grep -P "^$n\t" subj.tsv | head -1 | cut -f2)
[ -n "$s" ] || { echo "FAIL $n $v (subj.tsv 에 '$n' 줄이 없다)"; exit 1; }
{ case $n in sil*|sv*) cat "$SKILL/prompts/style_sil.txt";; *) cat "$SKILL/prompts/style.txt";; esac; echo "$s"; } > "p_${n}_$v.txt"
ok=0
for t in 1 2; do
  timeout 600 "$SG" gen --provider codex --prompt-file "p_${n}_$v.txt" \
    --ref "$REF" --out "raw_${n}_$v.png" --report "r_${n}_$v.json" > "log_${n}_$v.txt" 2>&1 && { ok=1; break; }
done
# 성공 판정은 이번 호출의 종료 코드로 — 같은 이름·후보로 다시 돌렸을 때 예전 raw 가 남아 있어도 OK 로 치지 않는다
[ $ok = 1 ] && [ -s "raw_${n}_$v.png" ] || { echo "FAIL $n $v (log_${n}_$v.txt)"; exit 1; }
# 64px 후보도 바로 만든다(sheet.py --dir 가 <이름>_<후보>_64.png 를 모은다 — 한 장만 다시 뽑아도 시트에 나오게)
PY="${SPRITE_GEN_ROOT:-/root/.claude/skills/sprite-gen}/.venv/bin/python"
[ -x "$PY" ] || PY=python3   # down.py 는 numpy 가 없어도 같은 결과
if "$PY" "$HERE/down.py" "raw_${n}_$v.png" "${n}_${v}_64.png" > /dev/null 2>> "log_${n}_$v.txt"; then
  echo "OK $n $v"
else
  echo "FAIL $n $v (64px 줄이기 실패 — log_${n}_$v.txt)"; exit 1
fi
