#!/usr/bin/env python3
# python3 build.py <작업폴더> <N>  →  <작업폴더>/vN.html
# base.html 끝에 <script> 하나를 덧붙인다: 후보 bN.js(빌더 함수를 같은 이름으로 다시 정의 — 전역 함수라 나중 정의가 이긴다)
# + 하네스 걸이(__harnessHook) + rebuild()(처음 지은 몸을 새 정의로 다시 짓는다).
import json, os, sys
work, n = os.path.abspath(sys.argv[1]), sys.argv[2]
c = json.load(open(os.path.join(work, 'contract.json'), encoding='utf-8'))
base = open(os.path.join(work, 'base.html'), encoding='utf-8').read()
cand = open(os.path.join(work, f'b{n}.js'), encoding='utf-8').read() if os.path.exists(os.path.join(work, f'b{n}.js')) else ''
wrap = ''
if c.get('new') and cand.strip():
    # v2 가 없던 종류: 디스패처를 감싸 이 종류만 새 빌더로(난수는 a1Lcg 안 — 다른 종류와 같은 규약)
    pre = c['prefix']
    wrap = (f"{{ const __m0 = {pre}Monster; {pre}Monster = function (type, isBoss, isRanged, grp, bodyGrp, headGrp, limbs) {{\n"
            f"  if (type === '{c['type']}') return a1Lcg(9900, () => {c['fn']}({{ grp, bodyGrp, headGrp, limbs, isBoss, isRanged, seed: 0x99 }}));\n"
            f"  return __m0(type, isBoss, isRanged, grp, bodyGrp, headGrp, limbs); }}; }}\n")
hook = r"""
// 하네스 걸이 — window.__pose = [자세 이름, 진행 0..1, 쪽 ±1] · window.__limbs = { _hsWing: 1, ... } (매 step 렌더 직전에 다시 건다)
function __harnessHook() { for (const h of heroes) { const L = h.limbs; if (!L) continue;
  if (window.__limbs) Object.assign(L, window.__limbs);
  if (window.__pose) for (const k in L) if (/^_[a-z]{2}Pose$/.test(k) && typeof L[k] === 'function') L[k](window.__pose[0], window.__pose[1], window.__pose[2] || 1); } }
"""
tail = f"<script>\n/* ===== 후보 b{n}.js ===== */\n{cand}\n{wrap}{hook}\nrebuild();\n</script>\n"
i = base.rfind('</body>')
out = base[:i] + tail + base[i:] if i >= 0 else base + tail
open(os.path.join(work, f'v{n}.html'), 'w', encoding='utf-8').write(out)
print('built', os.path.join(work, f'v{n}.html'))
