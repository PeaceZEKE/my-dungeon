#!/usr/bin/env python3
# 몬스터 모델링 작업 폴더 만들기 — 저장소 루트에서 실행.
#   python3 .claude/skills/dl-monster-model/scripts/setup.py --viewer viewers/act4_monster_viewer_v1.html \
#       --type hellsovereign --name sov [--concept refs/몬스터/4막/hellsovereign.jpg] [--fn a4Sovereign]
# 만드는 것(viewers/_work/<name>/ — .gitignore 됨):
#   base.html      뷰어 사본(하네스 걸이 __harnessHook 을 step 의 렌더 직전에 끼움)
#   ref.js         지금 빌더 함수 원문(후보의 출발점) · b0.js = 빈 파일(= 지금 그대로)
#   contract.json  타입·함수 이름·자세 이름·고정 손잡이·예산(필요하면 고친다)
#   SPEC.md        에이전트가 따르는 공통 규칙·명령(생성됨 — 손으로 고치지 말 것)
#   BRIEF.md       이번 작업 요청서(틀만 — 메인 에이전트가 채운다)
#   concept.*      원화 · three.r128.min.js
import argparse, json, os, re, shutil, subprocess, sys

ROOT = os.getcwd()
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--viewer', required=True)
ap.add_argument('--type', required=True)
ap.add_argument('--name', required=True)
ap.add_argument('--concept')
ap.add_argument('--fn', help='빌더 함수 이름(자동으로 못 찾을 때) · 새 종류면 --new 와 같이')
ap.add_argument('--new', action='store_true', help='v2 빌더가 아직 없는 종류 — 하네스가 디스패처를 감싼다')
ap.add_argument('--force', action='store_true', help='있는 작업 폴더를 덮어쓴다(BRIEF.md·b*.js 는 남긴다)')
a = ap.parse_args()

if not os.path.isfile(os.path.join(ROOT, 'index.html')):
    sys.exit('저장소 루트에서 실행할 것')
src = open(a.viewer, encoding='utf-8').read()
work = os.path.join(ROOT, 'viewers', '_work', a.name)
if os.path.isdir(work) and not a.force and os.path.exists(os.path.join(work, 'contract.json')):
    sys.exit(f'{work} 이(가) 이미 있다 — 이어서 쓰거나 --force')
os.makedirs(work, exist_ok=True)

# ---- 디스패처(aNMonster)와 빌더 함수 찾기 ----
m = re.search(r'function (a\d)Monster\(type', src)
if not m: sys.exit('뷰어에 aNMonster 디스패처가 없다(1~4막 몬스터 뷰어만 지원)')
pre = m.group(1)
fn = a.fn
if not fn and not a.new:
    i = m.start(); body = src[i:i + 6000]
    for mk in re.finditer("'" + re.escape(a.type) + "'", body):   # 시드 표(type === 'goblin' ? …) 같은 곳은 건너뛰고 빌더를 부르는 갈래를 찾는다
        k = mk.start(); nxt = body.find('type ===', k + 1); seg = body[k:(nxt if nxt > 0 else k + 1500)]
        mm = re.search(r'\b(' + pre + r'[A-Z]\w*)\(P\)', seg)
        if mm: fn = mm.group(1); break
    if not fn:
        sys.exit(f"{pre}Monster 에서 '{a.type}' 빌더를 못 찾았다 — --fn 이름을 주거나, v2 가 없는 종류면 --new --fn {pre}새이름")
if not fn: sys.exit('--new 면 --fn 도 줄 것(예: --fn ' + pre + 'Sporeling)')

def extract_fn(text, name):
    """function name( ... { ... } — 문자열·주석을 건너뛰며 괄호를 맞춘다"""
    st = text.find('function ' + name + '(')
    if st < 0: return None
    i = text.find('{', st); depth = 0; n = len(text)
    while i < n:
        c = text[i]
        if c in '\'"`':
            q = c; i += 1
            while i < n and text[i] != q:
                if text[i] == '\\': i += 1
                i += 1
        elif text.startswith('//', i):
            i = text.find('\n', i)
            if i < 0: return None
        elif text.startswith('/*', i):
            i = text.find('*/', i) + 1
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                # 함수 앞 주석 줄도 같이
                ls = text.rfind('\n\n', 0, st); ls = 0 if ls < 0 else ls + 2
                return text[ls:i + 1]
        i += 1
    return None

ref = extract_fn(src, fn) if not a.new else None
if not a.new and not ref: sys.exit(f'{fn} 본문을 못 뽑았다')
open(os.path.join(work, 'ref.js'), 'w', encoding='utf-8').write((ref or f'// {a.type}: v2 빌더가 아직 없다 — function {fn}(P) 를 새로 짓는다\n') + '\n')
if ref:
    chk = subprocess.run(['node', '--check', os.path.join(work, 'ref.js')], capture_output=True, text=True)
    if chk.returncode: print('⚠ ref.js 문법 검사 실패(뽑기가 어긋났을 수 있다):', chk.stderr[:300])

# ---- 자세 함수 이름·자세 목록(있으면) ----
poseFn, poses = None, []
if ref:
    pm = re.search(r'limbs\.(_[a-z]{2}Pose)\s*=\s*function', ref)
    if pm:
        poseFn = pm.group(1)
        poses = ['rest'] + [p for p in dict.fromkeys(re.findall(r"name === '(\w+)'", ref)) if p != 'rest']
handles = sorted(set(re.findall(r'limbs\.(\w+)\s*=(?!\s*function)(?!=)', ref or '')))
lock = [h for h in handles if h not in ('legR', 'legL', 'bodyGrp', 'head') and not re.match(r'_[a-z]{2}(Wing|Flap|Fire|Heat|Charge|Crouch|Dash|Rear|Roar|Swell)$', h)] if poseFn else []
contract = {
    'viewer': a.viewer, 'type': a.type, 'fn': fn, 'new': a.new, 'prefix': pre,
    'poseFn': poseFn, 'poses': poses,
    'lock': lock, 'lockTol': 0.05,
    'budget': {'meshes': None, 'tris': None},   # None = 예전 몸 × 1.6 / × 2.2 (probe.js)
    'requireGlowFlag': True,
}
cp = os.path.join(work, 'contract.json')
if not os.path.exists(cp) or a.force:
    json.dump(contract, open(cp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
else:
    contract = json.load(open(cp, encoding='utf-8'))

# ---- base.html: step 렌더 직전에 하네스 걸이 ----
st = src.find('function step(dt)')
en = src.find('window.__step = step', st)
if st < 0 or en < 0: sys.exit('뷰어에 step(dt) / window.__step 이 없다')
r = src.rfind('renderWithPost(scene)', st, en)
if r < 0: sys.exit('step 안에 renderWithPost(scene) 가 없다')
base = src[:r] + "if (typeof __harnessHook === 'function') __harnessHook(); " + src[r:]
base = base.replace("walking = false", "walking = /[?&]walk=1/.test(location.search)", 1)
open(os.path.join(work, 'base.html'), 'w', encoding='utf-8').write(base)
shutil.copy(os.path.join(ROOT, 'viewers', 'three.r128.min.js'), work)
if a.concept:
    ext = os.path.splitext(a.concept)[1].lower()
    shutil.copy(a.concept, os.path.join(work, 'concept' + ext))
for f in ('b0.js',):
    p = os.path.join(work, f)
    if not os.path.exists(p): open(p, 'w').write('')

# ---- SPEC.md · BRIEF.md ----
tpl = open(os.path.join(HERE, '..', 'SPEC.template.md'), encoding='utf-8').read()
cimg = next((f for f in os.listdir(work) if f.startswith('concept.')), '(원화 없음 — BRIEF.md 의 글을 따른다)')
spec = (tpl.replace('{{WORK}}', work).replace('{{TYPE}}', a.type).replace('{{FN}}', fn).replace('{{NAME}}', a.name)
        .replace('{{CONCEPT}}', os.path.join(work, cimg) if cimg.startswith('concept.') else cimg)
        .replace('{{POSEFN}}', poseFn or '(없음)').replace('{{POSES}}', ' '.join(poses) or '(없음)')
        .replace('{{LOCK}}', ', '.join(contract['lock']) or '(없음)')
        .replace('{{SKILL}}', os.path.relpath(os.path.join(HERE, '..'), ROOT)).replace('{{NEW}}', '예 — 디스패처를 하네스가 감싼다' if a.new else '아니오'))
open(os.path.join(work, 'SPEC.md'), 'w', encoding='utf-8').write(spec)
bp = os.path.join(work, 'BRIEF.md')
if not os.path.exists(bp):
    shutil.copy(os.path.join(HERE, '..', 'BRIEF.template.md'), bp)

subprocess.run([sys.executable, os.path.join(HERE, 'build.py'), work, '0'], check=True)
print(f'✓ {work}\n  fn={fn} poseFn={poseFn} poses={poses}\n  lock={contract["lock"]}\n  다음: BRIEF.md 채우기 → bash {os.path.relpath(HERE, ROOT)}/serve.sh → node {os.path.relpath(HERE, ROOT)}/probe.js {os.path.relpath(work, ROOT)} 0')
