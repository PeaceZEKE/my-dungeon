#!/usr/bin/env bash
# dl-device-check · 시트 이름표용 글꼴(assets/font.ttf) 다시 굽기
#
#   bash .claude/skills/dl-device-check/scripts/mkfont.sh <한글이 되는 원본 TTF/OTF>
#
# sheet.py 는 시스템 한글 글꼴(fc-list :lang=ko)을 먼저 쓰고, 없을 때만 assets/font.ttf 를 쓴다.
# assets/font.ttf 는 고운바탕 Bold(OFL 1.1, assets/OFL.txt)를 이 스킬 스크립트(sheet.py·devices.js)에
# 나오는 글자 + ASCII 만 남긴 부분 집합(약 180KB)이다 — 이름표에 새 한글을 넣었으면 이걸로 다시 굽는다.
# 원본: https://github.com/yangheeryu/Gowun-Batang 의 GowunBatang-Bold.ttf (다른 한글 TTF 도 된다)
set -eu
SRC="${1:?원본 글꼴 경로를 줄 것}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v pyftsubset >/dev/null || { echo "✗ pyftsubset 이 없다 — pip install fonttools"; exit 1; }
T="$(mktemp)"
python3 - "$HERE" > "$T" <<'PY'
import sys, os
h = sys.argv[1]
s = ''.join(open(os.path.join(h, f), encoding='utf8').read() for f in ('sheet.py', 'devices.js'))
print(''.join(sorted(set(c for c in s if ord(c) > 0x7e) | set('·×°→←↑↓≤≥…—–'))))
PY
pyftsubset "$SRC" --text-file="$T" --unicodes="U+0020-007E" --output-file="$HERE/../assets/font.ttf" --no-hinting --desubroutinize
rm -f "$T"
ls -la "$HERE/../assets/font.ttf"
