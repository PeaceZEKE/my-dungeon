#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
font-check.py — index.html 에 쓰인 한글 중 박아 둔 고운바탕(UI2Ko) 서브셋에 없는 글자를 찾는다.

근거: CLAUDE.md 'UI v2 1단계 — 던전 HUD(v814)' (글꼴은 base64 로 박았다 · 새 한글 문자열을 넣으면
서브셋을 다시 굽을 것) · v869 '덫' · v891 '짊' · v892 '얘'·'팠' · v893 '럴'.
없는 글자는 그 글자만 시스템 글꼴로 떨어져 한 줄 안에서 글꼴이 섞인다.

동작
  1. index.html 의 `@font-face { font-family: 'UI2Ko' … url(data:font/woff2;base64,…)` 을 풀어
     fontTools 로 cmap 을 읽는다(woff2 라 brotli 모듈이 필요하다).
  2. 파일 전체를 <script>/<style>/마크업으로 나누고, JS·CSS 주석과 HTML 주석을 갈라
     한글(가-힣 · 호환 자모 U+3131-318E · 첫가끝 U+1100-11FF — UI2Ko 의 unicode-range)을
     '화면에 나올 수 있는 곳(문자열·마크업)'과 '주석에만'으로 센다.
  3. 화면에 나올 수 있는데 cmap 에 없는 글자를 줄 번호·앞뒤 글과 함께 찍는다.
     주석에만 있는 글자는 참고로만(화면에 안 나온다).

종료 코드: 0 = 빠진 글자 없음 · 1 = 화면에 나올 수 있는 글자가 빠짐(--strict 면 주석 것도) · 2 = 실행 문제

다시 굽기(빠진 글자가 있을 때) — 이 스크립트는 index.html 을 고치지 않는다(--apply 를 줄 때만):
  python3 font-check.py --emit-text chars.txt          # (지금 cmap ∪ 화면 한글) — 예전 굽기와 같은 입력
  python3 font-check.py --rebake --src GowunBatang-Bold.ttf --out ko.woff2   # 서브셋 굽기(pyftsubset 기본값)
  python3 font-check.py --rebake --fetch --out ko.woff2  # 원본 TTF 를 Google Fonts(gstatic)에서 받아서
  python3 font-check.py --rebake --fetch --out ko.woff2 --apply   # 굽고 index.html 의 base64 를 갈아 끼움
  - pyftsubset 기본 옵션 + --flavor=woff2 가 v897 에 박힌 서브셋을 바이트 단위로 재현한다
    (이 스킬을 만들며 확인: 같은 글자 목록 → 90,892 바이트 · cmp 동일. 원본 TTF 는 예전 것 · gstatic v12 둘 다).
  - 글자 목록은 '지금 cmap ∪ 새 글자' 다. 지금 cmap 에서 빼면 다른 곳에 쓰던 글자가 사라질 수 있다.

옵션
  --file PATH      검사할 파일(기본: 이 스크립트가 든 저장소 루트의 index.html — 현재 폴더와 무관)
  --strict         주석에만 있는 빠진 글자도 실패로 친다
  --json           결과를 JSON 한 줄로
  --show N         빠진 글자마다 보여 줄 위치 수(기본 2)
  --emit-text F    pyftsubset --text-file 용 글자 목록(지금 cmap ∪ 화면 한글[--with-comments 면 주석 것도])
  --with-comments  --emit-text/--rebake 에 주석 한글도 넣는다(CLAUDE.md v814 의 '게임 코드 [가-힣] 전부' 방식)
  --rebake         서브셋을 굽는다(--src 또는 --fetch, --out 필수)
  --src TTF        원본 Gowun Batang Bold TTF
  --fetch          원본(약 8MB)을 Google Fonts css2 API → fonts.gstatic.com 에서 받아 --cache 에 둔다(두 번째부터는 재사용)
  --cache DIR      --fetch 로 받은 TTF 를 둘 곳(기본: $TMPDIR 또는 /tmp 아래 dl-font-cache)
  --out WOFF2      구운 woff2 를 쓸 곳
  --apply          구운 woff2 의 base64 로 --file 안의 UI2Ko 데이터를 갈아 끼운다(그 뒤 다시 검사)
"""
import argparse
import base64
import bisect
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import traceback
import urllib.error
import urllib.request

HANGUL_RANGES = ((0xAC00, 0xD7A3), (0x3131, 0x318E), (0x1100, 0x11FF))
FONT_RE = re.compile(
    r"(@font-face\s*\{\s*font-family:\s*'UI2Ko'[^}]*?url\(data:font/woff2;base64,)([A-Za-z0-9+/=]+)(\))")


def is_hangul(ch):
    o = ord(ch)
    for a, b in HANGUL_RANGES:
        if a <= o <= b:
            return True
    return False


def find_default_file():
    """기본은 **이 스크립트가 든 저장소 루트**의 index.html — 현재 폴더가 아니다.
    현재 폴더를 먼저 보면 스크래치패드 같은 데 굴러다니던 예전 index.html 을 조용히 검사한다
    (CLAUDE.md '렌더 변경을 비교할 때' — 스크래치패드에서 띄운 서버가 예전 index.html 을 서빙한 사고와 같은 함정).
    다른 파일은 --file 로."""
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        root = subprocess.run(['git', '-C', here, 'rev-parse', '--show-toplevel'], capture_output=True,
                              text=True, timeout=10).stdout.strip()
    except Exception:
        root = ''
    if not root:
        root = os.path.abspath(os.path.join(here, '..', '..', '..', '..'))   # scripts → dl-new-content → skills → .claude → 루트
    return os.path.join(root, 'index.html')


def load_cmap(src):
    m = FONT_RE.search(src)
    if not m:
        raise SystemExit("UI2Ko @font-face(woff2 base64)를 못 찾았다 — 글꼴을 박는 방식이 바뀌었으면 이 스크립트의 FONT_RE 를 고칠 것")
    raw = base64.b64decode(m.group(2))
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        raise SystemExit("fontTools 가 없다: pip install fonttools brotli  (수동 방법은 SKILL.md '글꼴' 절)")
    try:
        f = TTFont(io.BytesIO(raw))
    except Exception as e:  # brotli 없음 등
        raise SystemExit("woff2 를 못 읽었다(%s) — pip install brotli" % e)
    cmap = f.getBestCmap()
    name = f['name'].getDebugName(4)
    line = src.count('\n', 0, m.start()) + 1
    return set(cmap.keys()), len(raw), name, line


# ---------------------------------------------------------------- 분류기
# 각 글자 위치를 'vis'(문자열·마크업 — 화면에 나올 수 있음) / 'com'(주석)으로 나눈다.

REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
REGEX_WORDS = ('return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'new', 'throw', 'else', 'do', 'yield', 'await')


def scan_js(s, base, out):
    """JS 소스 s(파일 안 시작 위치 base)를 훑어 한글 위치를 out(list of (pos, kind))에 넣는다.
    템플릿 리터럴은 `${ … }` 중첩까지 따라간다(안 그러면 셰이더·창 마크업 템플릿 뒤가 통째로 어긋난다).
    템플릿 안의 `// …`(줄 끝까지)·`/* … */`, 따옴표 문자열 안의 '공백 + //' 뒤는 GLSL·CSS 주석이라
    'com' 으로 센다 — 화면 글자가 아니다(휴리스틱: 화면 문장에 ' // ' 를 쓰면 그 뒤는 놓친다)."""
    i, n = 0, len(s)
    last_sig = ''      # 주석·공백이 아닌 마지막 글자
    last_word = ''
    mode = 'code'      # 'code' | 'tmpl'
    depth = 0          # 지금 코드 구간의 { 깊이
    stack = []         # ${ 에 들어갈 때 바깥 깊이

    def mark(a0, b0, kind):
        for k in range(a0, b0):
            if is_hangul(s[k]):
                out.append((base + k, kind))

    while i < n:
        c = s[i]
        if mode == 'tmpl':
            if c == '\\':
                if i + 1 < n and is_hangul(s[i + 1]):
                    out.append((base + i + 1, 'vis'))
                i += 2
                continue
            if c == '`':
                mode = 'code'
                i += 1
                last_sig, last_word = '`', ''
                continue
            if c == '$' and s.startswith('{', i + 1):
                stack.append(depth)
                depth = 0
                mode = 'code'
                i += 2
                last_sig, last_word = '{', ''
                continue
            if c == '/' and s.startswith('/', i + 1) and (i == 0 or s[i - 1] in ' \t\n;{}('):
                j = i
                while j < n and s[j] != '\n' and s[j] != '`' and not s.startswith('${', j):
                    j += 1
                mark(i, j, 'com')
                i = j
                continue
            if c == '/' and s.startswith('*', i + 1):
                j = s.find('*/', i + 2)
                j = n if j < 0 else j + 2
                mark(i, j, 'com')
                i = j
                continue
            if is_hangul(c):
                out.append((base + i, 'vis'))
            i += 1
            continue
        # ---- code
        if c == '/' and s.startswith('/', i + 1):
            j = s.find('\n', i)
            j = n if j < 0 else j
            mark(i, j, 'com')
            i = j
            continue
        if c == '/' and s.startswith('*', i + 1):
            j = s.find('*/', i + 2)
            j = n if j < 0 else j + 2
            mark(i, j, 'com')
            i = j
            continue
        if c == '`':
            mode = 'tmpl'
            i += 1
            continue
        if c in '\'"':
            q = c
            j = i + 1
            kind = 'vis'
            while j < n:
                d = s[j]
                if d == '\\':
                    j += 2
                    continue
                if d == q or d == '\n':
                    break
                # 따옴표 문자열로 이어 붙인 셰이더 줄('… // 주석',) — 공백 뒤 // 부터는 GLSL 주석
                if d == '/' and s.startswith('/', j + 1) and s[j - 1] in ' \t':
                    kind = 'com'
                if is_hangul(d):
                    out.append((base + j, kind))
                j += 1
            i = j + 1
            last_sig, last_word = q, ''
            continue
        if c == '/' and (last_sig == '' or last_sig in REGEX_PREV or last_word in REGEX_WORDS):
            j = i + 1          # 정규식 리터럴
            in_cls = False
            while j < n:
                d = s[j]
                if d == '\\':
                    j += 2
                    continue
                if d == '\n':
                    break
                if in_cls:
                    if d == ']':
                        in_cls = False
                elif d == '[':
                    in_cls = True
                elif d == '/':
                    break
                if is_hangul(d):
                    out.append((base + j, 'com'))   # /[가-힣]/ 같은 정규식 속 한글은 화면 글자가 아니다
                j += 1
            i = j + 1
            last_sig, last_word = '/', ''
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            if depth == 0 and stack:
                depth = stack.pop()
                mode = 'tmpl'
                i += 1
                continue
            depth = max(0, depth - 1)
        if is_hangul(c):   # 식별자·코드 속 한글(드묾)
            out.append((base + i, 'vis'))
        if not c.isspace():
            if c.isalnum() or c in '_$':
                j = i
                while j < n and (s[j].isalnum() or s[j] in '_$'):
                    j += 1
                last_word = s[i:j]
                last_sig = s[j - 1]
                i = j
                continue
            last_sig, last_word = c, ''
        i += 1


def scan_css(s, base, out):
    i = 0
    for m in re.finditer(r'/\*.*?\*/', s, re.S):
        for k in range(i, m.start()):
            if is_hangul(s[k]):
                out.append((base + k, 'vis'))
        for k in range(m.start(), m.end()):
            if is_hangul(s[k]):
                out.append((base + k, 'com'))
        i = m.end()
    for k in range(i, len(s)):
        if is_hangul(s[k]):
            out.append((base + k, 'vis'))


def scan_markup(s, base, out):
    i = 0
    for m in re.finditer(r'<!--.*?-->', s, re.S):
        for k in range(i, m.start()):
            if is_hangul(s[k]):
                out.append((base + k, 'vis'))
        for k in range(m.start(), m.end()):
            if is_hangul(s[k]):
                out.append((base + k, 'com'))
        i = m.end()
    for k in range(i, len(s)):
        if is_hangul(s[k]):
            out.append((base + k, 'vis'))


BLOCK_RE = re.compile(r'(<script\b[^>]*>)(.*?)(</script>)|(<style\b[^>]*>)(.*?)(</style>)', re.S | re.I)


def classify(src):
    out = []
    pos = 0
    for m in BLOCK_RE.finditer(src):
        scan_markup(src[pos:m.start()], pos, out)
        if m.group(1) is not None:
            scan_markup(m.group(1), m.start(1), out)
            scan_js(m.group(2), m.start(2), out)
        else:
            scan_markup(m.group(4), m.start(4), out)
            scan_css(m.group(5), m.start(5), out)
        pos = m.end()
    scan_markup(src[pos:], pos, out)
    return out


# ---------------------------------------------------------------- 굽기

def fetch_ttf(cache):
    """Google Fonts css2 API → fonts.gstatic.com 의 통짜 TTF(약 8MB, 한글 11,172자 전부).
    주의: 옛 css API(css?family=…)는 같은 이름으로 39KB 짜리 일부 글자 TTF 를 준다 — 그걸로 구우면
    한글이 통째로 빠진다(이 스킬을 만들며 실제로 겪음). 그래서 받은 뒤 한글 수를 확인한다.
    github raw·jsdelivr gh 는 이 환경 프록시에서 막혀 있었다(403)."""
    os.makedirs(cache, exist_ok=True)
    css_url = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700'
    css = urllib.request.urlopen(css_url, timeout=30).read().decode('utf-8')
    m = re.search(r'url\((https://fonts\.gstatic\.com/[^)]+\.ttf)\)', css)
    if not m:
        raise SystemExit('Google Fonts CSS 에서 TTF 주소를 못 찾았다:\n' + css[:400])
    url = m.group(1)
    dst = os.path.join(cache, 'GowunBatang-Bold-' + url.rsplit('/', 1)[-1])
    if not os.path.isfile(dst) or os.path.getsize(dst) < 1_000_000:
        data = urllib.request.urlopen(url, timeout=180).read()
        with open(dst, 'wb') as fh:
            fh.write(data)
    return dst


def full_hangul_or_die(ttf):
    from fontTools.ttLib import TTFont
    f = TTFont(ttf, lazy=True)
    nm = f['name'].getDebugName(4) or ''
    if 'Gowun Batang' not in nm or 'Bold' not in nm:
        raise SystemExit("원본이 Gowun Batang Bold 가 아니다(%s) — 게임에 박힌 것은 Bold 다" % nm)
    nh = sum(1 for c in f.getBestCmap() if 0xAC00 <= c <= 0xD7A3)
    if nh < 11000:
        raise SystemExit('원본 TTF 의 한글이 %d자뿐이다(통짜는 11,172자) — 일부 글자만 든 파일이다: %s' % (nh, ttf))


def rebake(src_ttf, chars, out_path):
    """pyftsubset 명령과 똑같이 굽는다(subset.main 을 그대로 부른다 — Options() 로 직접 짜면
    로딩 옵션이 달라 48바이트 다른 파일이 나왔다. CLI 와 같아야 박힌 서브셋을 바이트 단위로 재현한다)."""
    from fontTools import subset
    from fontTools.ttLib import TTFont
    full_hangul_or_die(src_ttf)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', suffix='.txt', delete=False) as fh:
        fh.write(chars)
        tf = fh.name
    try:
        rc = subset.main([src_ttf, '--text-file=' + tf, '--flavor=woff2', '--output-file=' + out_path])
    finally:
        os.unlink(tf)
    if rc not in (None, 0):
        raise SystemExit('pyftsubset 실패(%s)' % rc)
    got = set(TTFont(out_path).getBestCmap().keys())
    lack = [ch for ch in chars if ord(ch) not in got]
    if lack:
        raise SystemExit('구운 서브셋에 빠진 글자가 있다(원본에 없는 글자?): ' + ''.join(lack[:40]))
    return os.path.getsize(out_path)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description='고운바탕(UI2Ko) 서브셋에 빠진 한글 찾기')
    ap.add_argument('--file')
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--show', type=int, default=2)
    ap.add_argument('--emit-text')
    ap.add_argument('--with-comments', action='store_true')
    ap.add_argument('--rebake', action='store_true')
    ap.add_argument('--src')
    ap.add_argument('--fetch', action='store_true')
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'dl-font-cache'))
    ap.add_argument('--out')
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()

    path = a.file or find_default_file()
    if not os.path.isfile(path):
        print('파일이 없다: ' + path, file=sys.stderr)
        return 2
    src = open(path, encoding='utf-8').read()
    cmap, size, fname, fline = load_cmap(src)

    hits = classify(src)
    nl = [i for i, ch in enumerate(src) if ch == '\n']

    def line_of(p):
        return bisect.bisect_left(nl, p) + 1

    vis, com = {}, {}
    for p, kind in hits:
        (vis if kind == 'vis' else com).setdefault(src[p], []).append(p)
    com_only = {ch: ps for ch, ps in com.items() if ch not in vis}

    miss_vis = sorted(ch for ch in vis if ord(ch) not in cmap)
    miss_com = sorted(ch for ch in com_only if ord(ch) not in cmap)
    digits_missing = [d for d in '0123456789' if ord(d) not in cmap]

    def ctx(p):
        a0 = max(src.rfind('\n', 0, p) + 1, p - 28)
        b0 = src.find('\n', p)
        b0 = len(src) if b0 < 0 else min(b0, p + 28)
        return src[a0:b0].strip()

    res = {
        'file': path, 'fontLine': fline, 'fontBytes': size, 'fontName': fname,
        'cmapGlyphs': len(cmap), 'cmapHangul': sum(1 for c in cmap if 0xAC00 <= c <= 0xD7A3),
        'usedVisible': len(vis), 'usedCommentOnly': len(com_only),
        'missingVisible': [{'ch': ch, 'count': len(vis[ch]),
                            'at': [{'line': line_of(p), 'ctx': ctx(p)} for p in vis[ch][:a.show]]}
                           for ch in miss_vis],
        'missingCommentOnly': ''.join(miss_com),
        'digitsMissing': ''.join(digits_missing),
    }

    if a.json:
        print(json.dumps(res, ensure_ascii=False))
    else:
        print('UI2Ko(%s) %d줄 · %.1fKB · 글리프 %d (한글 %d자)' % (
            fname, fline, size / 1024, res['cmapGlyphs'], res['cmapHangul']))
        print('%s 의 한글: 화면에 나올 수 있는 곳 %d자 · 주석에만 %d자' % (
            os.path.abspath(path), res['usedVisible'], res['usedCommentOnly']))
        if digits_missing:
            print('!! 숫자가 빠졌다(unicode-range 가 0-9 를 UI2Ko 로 보낸다 — v816): ' + ''.join(digits_missing))
        if miss_vis:
            print('!! 빠진 글자(화면에 나올 수 있음) %d자: %s' % (len(miss_vis), ''.join(miss_vis)))
            for it in res['missingVisible']:
                for at in it['at']:
                    print("   '%s' ×%d  %d줄: %s" % (it['ch'], it['count'], at['line'], at['ctx']))
        else:
            print('OK 화면에 나올 수 있는 한글은 전부 서브셋에 있다')
        if miss_com:
            if a.strict:
                print('!! --strict: 주석에만 있는 빠진 글자 %d자도 실패로 친다: %s' % (len(miss_com), ''.join(miss_com)))
            else:
                print('   (주석에만 있는 빠진 글자 %d자 — 화면에 안 나오므로 무시해도 된다, --strict 면 실패로 친다)' % len(miss_com))

    want = set(chr(c) for c in cmap) | set(vis)
    if a.with_comments:
        want |= set(com_only)
    chars = ''.join(sorted(want))

    if a.emit_text:
        with open(a.emit_text, 'w', encoding='utf-8') as fh:
            fh.write(chars)
        print('글자 목록 %d자 → %s  (pyftsubset GowunBatang-Bold.ttf --text-file=%s --flavor=woff2 --output-file=ko.woff2)' % (
            len(chars), a.emit_text, a.emit_text), file=sys.stderr)

    if a.rebake:
        if not a.out:
            print('--rebake 에는 --out 이 필요하다', file=sys.stderr)
            return 2
        ttf = a.src or (fetch_ttf(a.cache) if a.fetch else None)
        if not ttf:
            print('--rebake 에는 --src TTF 또는 --fetch 가 필요하다', file=sys.stderr)
            return 2
        nb = rebake(ttf, chars, a.out)
        print('구움: %s (%d자 → %.1fKB, 예전 %.1fKB)' % (a.out, len(chars), nb / 1024, size / 1024), file=sys.stderr)
        if a.apply:
            b64 = base64.b64encode(open(a.out, 'rb').read()).decode('ascii')
            new_src, k = FONT_RE.subn(lambda m: m.group(1) + b64 + m.group(3), src, count=1)
            if k != 1:
                print('갈아 끼울 자리를 못 찾았다', file=sys.stderr)
                return 2
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(new_src)
            cmap2, size2, _, _ = load_cmap(new_src)
            left = [ch for ch in vis if ord(ch) not in cmap2]
            print('적용: %s 의 UI2Ko 데이터 교체(%.1fKB) · 남은 빠진 글자 %d' % (path, size2 / 1024, len(left)), file=sys.stderr)
            if left:
                return 1
            return 0

    if miss_vis or digits_missing or (a.strict and miss_com):
        return 1
    return 0


if __name__ == '__main__':
    # 종료 코드 약속: 0 OK · 1 빠진 글자 · 2 실행 문제. raise SystemExit("메시지") 는 파이썬 기본으로 1 이 돼
    # '빠진 글자'와 구분이 안 됐다(fontTools 없음·네트워크 실패도 1) — 여기서 2 로 바꾼다.
    try:
        rc = main()
    except SystemExit as e:
        if isinstance(e.code, str):
            print('✗ ' + e.code, file=sys.stderr)
            rc = 2
        else:
            raise
    except urllib.error.URLError as e:
        print('✗ 내려받기 실패(%s) — 네트워크·프록시 문제면 --src 로 TTF 를 직접 줄 것' % e, file=sys.stderr)
        rc = 2
    except Exception:
        traceback.print_exc()
        rc = 2
    sys.exit(rc)
