#!/usr/bin/env python3
# 마크다운(파이프 표) → 노션 표(<table>) 변환. 첫 "# 제목" 줄은 뺀다(제목은 properties 로).
# 사용: python3 md2notion.py in.md out.md
import sys, re
def conv(md):
    lines = md.split('\n'); out = []; i = 0
    def cells(l):
        l = l.strip()
        if l.startswith('|'): l = l[1:]
        if l.endswith('|'): l = l[:-1]
        return [c.strip() for c in re.split(r'(?<!\\)\|', l)]
    in_code = False
    while i < len(lines):
        l = lines[i]
        if l.strip().startswith('```'): in_code = not in_code; out.append(l); i += 1; continue
        if not in_code and l.strip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|?\s*:?-{2,}', lines[i+1]):
            head = cells(l); i += 2; rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(cells(lines[i])); i += 1
            out.append('<table header-row="true">')
            for r in [head] + rows:
                out.append('\t<tr>')
                for c in r: out.append('\t\t<td>' + c.replace('<br>', ' ') + '</td>')
                out.append('\t</tr>')
            out.append('</table>')
            continue
        out.append(l); i += 1
    return '\n'.join(out)
src = open(sys.argv[1]).read()
# 첫 줄 제목(# ...)은 페이지 제목으로 쓰므로 뺀다
src = re.sub(r'^# .*\n+', '', src, count=1)
res = conv(src)
open(sys.argv[2], 'w').write(res)
# 표 밖에 '<' 가 남았는지 점검
bad = [l for l in res.split('\n') if '<' in l and not re.match(r'^\s*</?(table|tr|td)', l.strip()) and '`' not in l]
print(sys.argv[1], len(res), 'suspicious <:', len(bad)); [print('  ', b[:120]) for b in bad[:8]]
