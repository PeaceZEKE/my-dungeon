#!/bin/bash
# 원화(설정화) 한 장 — GPT(codex image_gen, ChatGPT 구독). 저장소 루트에서 실행.
#   bash .claude/skills/dl-monster-model/scripts/concept.sh <출력.png> <막 1~4> "<몬스터 설명(영어)>" [boss]
# 여러 후보는 & 로 동시에(장당 1~2분). codex 로그인이 없으면 dl-portrait 스킬의 device-auth 절차.
# 화풍 기준은 refs/ui/초상화/knight_512.png · 한 장에 정면 · 측면(앞이 왼쪽) · 뒷면 — 1~4막 설정화와 같은 틀.
OUT=$1; ACT=$2; DESC=$3; BOSS=$4
[ -f index.html ] || { echo "저장소 루트에서 실행할 것"; exit 1; }
[ -n "$DESC" ] || { echo 'usage: concept.sh out.png <막> "<설명>" [boss]'; exit 2; }
command -v codex >/dev/null || { echo "codex 가 없다 — npm install -g @openai/codex && codex login --device-auth"; exit 1; }
case $ACT in
  1) SET='ACT 1 — "Cavern": damp cave of rough rock, moss, puddles, torchlight. Gritty fantasy.';;
  2) SET='ACT 2 — "Ruined Castle": abandoned royal castle, cold moonlight, cracked flagstones, moss and vines, banners. Haunted, melancholic.';;
  3) SET='ACT 3 — "Corrupted Castle": the castle overgrown by corrupted flesh — warm cream stone, teal shadows, saturated coral-pink tumours. Body-horror but stylized (PEGI 12: no gore).';;
  *) SET='ACT 4 — "Hell": a dark volcanic canyon of COLUMNAR BASALT — blue-grey hexagonal stone pillars, near-black obsidian glass, thin glowing red-orange LAVA VEINS that pulse like a heartbeat, ash and sulphur, embers. Darker than any previous act; the only light is fire and lava. Demonic and infernal, but stylized and readable (PEGI 12: no gore).';;
esac
B=''; [ "$BOSS" = boss ] && B='This is a BOSS: imposing, distinctive silhouette, but still chunky "SD" game proportions so it reads from above at small size in an isometric game. Big simple shapes, clear colour blocks. Glowing parts must read as bright accents against a dark body.'
DIR=$(mktemp -d); cp refs/ui/초상화/knight_512.png "$DIR/ref.png"
start=$(date +%s)
timeout 900 codex exec --skip-git-repo-check --sandbox workspace-write -C "$DIR" -i "$DIR/ref.png" - > "$DIR/log.txt" 2>&1 <<P
Use your image generation tool to create ONE image as described below, then save the generated image file into the current directory as exactly "out.png" (copy it from wherever the tool wrote it). Do not write any other files. Reply DONE when the file exists.

Character design sheet for a stylized low-poly 3D action RPG monster (dark fantasy dungeon crawler), painted in the same illustration style as the attached hero portrait: crisp pixel-art-inspired edges, warm torch light from the left, cool blue rim light on the right, rich but slightly muted colours.
Setting: $SET
Layout: landscape 3:2, plain flat dark-slate background (#2a2f3a), NO text, NO labels, NO frame. Three full-body figures standing on the same ground line, evenly spaced, same scale, feet (or lowest point) fully visible:
 (1) LEFT: orthographic FRONT view, facing the viewer.
 (2) MIDDLE: orthographic SIDE view, facing left.
 (3) RIGHT: orthographic BACK view.
$B

MONSTER: $DESC
P
f="$DIR/out.png"; [ -s "$f" ] || f=$(find ~/.codex -name '*.png' -newermt "@$start" 2>/dev/null | head -1)
if [ -n "$f" ] && [ -s "$f" ]; then cp "$f" "$OUT"; echo "OK $OUT"; else echo "FAIL — $DIR/log.txt"; tail -5 "$DIR/log.txt"; exit 1; fi
