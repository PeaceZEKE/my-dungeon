# CrazyGames 커버(2026-10-15)

GPT(codex image_generation, ChatGPT 구독)로 뽑았다. 방향 B(세 직업 + 지옥의 군주) · GPT 가 그린 제목 · 가로는 후보 1(제목 가운데 위) — 사용자 선택.
참고 이미지: refs/ui/초상화/knight_512.png · witch_512.png · archer_512.png · refs/배경/4막/4막_키아트_1.webp(처음 B) → 이후 B 결과(src_wide_1536x1024.png)를 참고로 세 규격을 다시 뽑음.
궁수 후드 제거(사용자 지시 — 원래 후드를 안 쓴다): 세 장 각각을 첫 참고로 + archer_512.png 를 둘째 참고로 "궁수만 후드 없이 · 금발 높은 포니테일 · 청록 스카프, 나머지는 그대로" 로 다시 그림(p_fix).
가로 1536×1024 → 위를 기준으로 1920×1080 크롭(1.25배) · 세로 1024×1536 → 800×1200 · 정사각 1254 → 800. 검사: python3 .claude/skills/dl-crazygames-check/scripts/covers.py refs/cg/cover_*.png (✗0 ⚠0).

## 프롬프트 — 처음 B(wide_b)
```
Key art / cover illustration for a dark fantasy dungeon-crawler game, landscape 3:2.
Style: polished painterly digital illustration with crisp pixel-art-inspired edges and strong graphic shapes (NOT blurry, NOT photo). Rich contrast: deep blue-black shadows, blazing orange lava light, cool blue rim lights. Setting: hexagonal basalt-column volcanic canyon (like the attached environment reference) with thin glowing lava cracks and drifting embers. Readable at tiny thumbnail size: big simple shapes, strong silhouettes against bright lava.
Three heroes from the attached portrait references stand together in the lower half, facing the viewer at three-quarter angle: center front the KNIGHT (steel plate armour with gold trim, closed helm, crimson tabard, sword and kite shield), left the WITCH/MAGE (hood, staff with a burning fire orb in hand casting flames), right the ARCHER (green hood, bow drawn with a glowing arrow).
Behind them, colossal and looming over the whole scene: a demon lord with curved horns, crown, a ring of fire behind his head, bat wings, glowing eyes, obsidian greatsword with lava edges.
Keep the TOP 28% calm and dark for a title later. NO text, NO letters, NO logo, NO border, NO UI.
```
## 프롬프트 — 가로(wb1)
```
Recreate the attached key-art (first attached image) as a game cover: SAME characters, SAME art style, SAME colors and lighting — the three heroes (KNIGHT center front: steel plate with gold trim, closed helm, crimson tabard, sword and kite shield; WITCH/MAGE left: hood, casting a fire orb; ARCHER right: green hood, bow drawn with glowing arrow) in front of a colossal horned demon lord with a ring of fire behind his head, bat wings and a lava-edged obsidian greatsword, in a hexagonal basalt-column lava canyon. Polished painterly digital illustration with crisp pixel-art-inspired edges (NOT blurry). Deep blue-black shadows, blazing orange lava light, cool blue rim lights.
Add the game title "DUNGEON LEGION" as large bold engraved fantasy capital letters in two lines ("DUNGEON" above "LEGION"), gold metal with dark outline and a hot orange glow — spelled exactly, these two words only. No other text, no border, no extra logos, no UI. Readable at tiny thumbnail size: the title and the knight must stay big and clear.
Composition: landscape 3:2. Title at the top center, characters in the lower two thirds, demon lord between and behind them.
```
## 세로·정사각은 마지막 줄만 다르다
```
Composition: PORTRAIT 2:3 (tall). Title at the top, demon lord head and wings filling the middle, the three heroes standing together in the bottom half, knight largest in the center.
Composition: SQUARE 1:1. Title at the top, knight center large, mage and archer at his sides slightly behind, demon lord looming behind them.
```
