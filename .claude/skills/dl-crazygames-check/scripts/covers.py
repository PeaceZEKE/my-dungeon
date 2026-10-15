#!/usr/bin/env python3
"""dl-crazygames-check · 커버·미리보기 영상 규격 점검 + 실제 표시 크기 미리보기

    python3 .claude/skills/dl-crazygames-check/scripts/covers.py <파일 또는 폴더>... [--out 미리보기.png]

규격(docs.crazygames.com/requirements/game-covers/, 2026-10-14 조회):
  커버 세 장 필수 — 1920x1080(16:9) · 800x1200(2:3) · 800x800(1:1), 세 장의 그림을 맞춘다.
  제목 말고 글자('New'·'Play') 금지 · 테두리·아이콘·스토어 로고 금지 · 흐릿하거나 픽셀이 깨진 그림 금지 · 스크린샷 그대로 금지.
  미리보기 영상 — 15~20초(넘으면 20초에서 잘림) · 50MB 이하 · 1080p 16:9 와 1080p 2:3 두 벌 · 소리 없음 ·
  첫 프레임 = 정지 커버 · 기본 마우스 커서·'Play Now'·검은 화면 인트로 금지.
이 스크립트가 기계로 보는 것: 크기 · 세 장이 다 있는지 · 블록 확대(nearest 로 키운 도트 그림 — '픽셀이 깨진 그림') ·
영상 길이·크기·해상도·소리 트랙 · 영상 첫 프레임 ↔ 같은 비율 커버 차이. 글자·로고·테두리·구도는 --out 미리보기를 눈으로.
--out: 16:9 커버를 홈 썸네일 실제 크기 200x112(개발자 보고 — Larss IO 개발 로그)로, 나머지는 같은 높이로 줄여 한 장에.
종료 코드: 0 = ✗ 없음 · 1 = ✗ 있음 · 2 = 인자 문제.
"""
import os, re, subprocess, sys, tempfile

try:
    from PIL import Image, ImageDraw
except ImportError:
    print('✗ PIL(Pillow) 이 없다 — pip install pillow'); sys.exit(2)

COVERS = {(1920, 1080): '16:9', (800, 1200): '2:3', (800, 800): '1:1'}
VIDEOS = {(1920, 1080): '16:9', (1080, 1620): '2:3'}
IMG_EXT = ('.png', '.jpg', '.jpeg', '.webp')
VID_EXT = ('.mp4', '.webm', '.mov', '.m4v')
NX = NW = 0


def bad(s):
    global NX; NX += 1; print('  ✗ ' + s)


def warn(s):
    global NW; NW += 1; print('  ⚠ ' + s)


def ok(s): print('  ✓ ' + s)
def info(s): print('  · ' + s)


def blockiness(im):
    """nearest 로 k 배 키운 그림이면 k 를 돌려준다(표본 픽셀의 98% 가 k×k 블록 첫 픽셀과 같다). 아니면 1."""
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    # 격자로 뽑으면 간격이 k 의 배수일 때 표본이 전부 블록 첫 픽셀이 된다 — 의사 난수로 2만 점
    pts, s = [], 12345
    for _ in range(20000):
        s = (s * 1103515245 + 12345) & 0x7fffffff; x = s % w
        s = (s * 1103515245 + 12345) & 0x7fffffff; y = s % h
        pts.append((x, y))
    best = 1
    for k in (2, 3, 4, 5, 6, 8):
        same = tot = 0
        for x, y in pts:
            if x % k == 0 and y % k == 0:
                continue
            tot += 1
            if px[x, y] == px[x - x % k, y - y % k]:
                same += 1
        if tot and same / tot >= 0.98:
            best = k
    return best


def probe(path):
    """ffmpeg -i 의 stderr 에서 길이·해상도·소리 트랙(ffprobe 가 없는 환경이 있다)."""
    try:
        r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path], capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        return None
    t = r.stderr
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', t)
    v = re.search(r'Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})', t)
    return {
        'dur': int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else None,
        'size': (int(v.group(1)), int(v.group(2))) if v else None,
        'audio': bool(re.search(r'Stream #[^\n]*Audio:', t)),
    }


def first_frame(path):
    fd, tmp = tempfile.mkstemp(suffix='.png'); os.close(fd)
    try:
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', path, '-frames:v', '1', tmp], check=True, timeout=60)
        return Image.open(tmp).convert('RGB').copy()
    except Exception:
        return None
    finally:
        try: os.remove(tmp)
        except OSError: pass


def meandiff(a, b):
    a = a.convert('RGB').resize((64, 64)); b = b.convert('RGB').resize((64, 64))
    pa, pb = a.load(), b.load()
    s = 0
    for y in range(64):
        for x in range(64):
            s += sum(abs(pa[x, y][i] - pb[x, y][i]) for i in range(3))
    return s / (64 * 64 * 3)


def main():
    args = sys.argv[1:]
    out = None
    if '--out' in args:
        i = args.index('--out'); out = args[i + 1] if i + 1 < len(args) else None; del args[i:i + 2]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__); sys.exit(0 if args else 2)
    files = []
    for a in args:
        if os.path.isdir(a):
            files += [os.path.join(a, f) for f in sorted(os.listdir(a))]
        elif os.path.isfile(a):
            files.append(a)
        else:
            print('✗ 없다: ' + a); sys.exit(2)
    imgs = [f for f in files if f.lower().endswith(IMG_EXT)]
    vids = [f for f in files if f.lower().endswith(VID_EXT)]
    covers = {}

    print(f'== 커버 {len(imgs)}장 (필수: 1920x1080 · 800x1200 · 800x800)')
    for f in imgs:
        im = Image.open(f)
        sz = im.size
        name = os.path.basename(f)
        if sz in COVERS:
            ratio = COVERS[sz]
            if ratio in covers:
                warn(f'{name}: {ratio} 커버가 둘 — {os.path.basename(covers[ratio][0])} 와 겹친다')
            covers[ratio] = (f, im)
            ok(f'{name}: {sz[0]}x{sz[1]} ({ratio})')
        else:
            bad(f'{name}: {sz[0]}x{sz[1]} — 규격 크기가 아니다(1920x1080 · 800x1200 · 800x800 중 하나)')
            continue
        k = blockiness(im)
        if k > 1:
            bad(f'{name}: {k}배 블록 확대 그림 — 저해상 화면(픽셀아트 320줄)을 키운 것 같다. 규정: 흐릿하거나 픽셀이 깨진 그림 금지 — 고해상도로 다시 렌더하거나 새로 그릴 것')
        if im.mode in ('RGBA', 'LA') and im.getextrema()[-1][0] < 255:
            info(f'{name}: 투명 픽셀이 있다 — 사이트 배경색 위에서 어떻게 보이는지 확인')
    for r in ('16:9', '2:3', '1:1'):
        if r not in covers:
            bad(f'{r} 커버가 없다')

    if vids:
        print(f'== 미리보기 영상 {len(vids)}개 (15~20초 · ≤50MB · 1920x1080 과 1080x1620 · 소리 없음 · 첫 프레임 = 커버)')
    seen = set()
    for f in vids:
        name = os.path.basename(f)
        mbs = os.path.getsize(f) / 1048576
        p = probe(f)
        if p is None:
            warn(f'{name}: ffmpeg 가 없어 길이·해상도를 못 쟀다({mbs:.1f}MB)'); continue
        line = f'{name}: {p["dur"]:.1f}초 · {p["size"][0]}x{p["size"][1]} · {mbs:.1f}MB' if p['dur'] and p['size'] else f'{name}: 읽기 실패'
        (bad if mbs > 50 else info)(line + (' — 50MB 초과' if mbs > 50 else ''))
        if p['dur'] is not None:
            if p['dur'] < 15: warn(f'{name}: {p["dur"]:.1f}초 < 15초')
            elif p['dur'] > 20.05: warn(f'{name}: {p["dur"]:.1f}초 — 20초에서 잘린다')
        if p['size'] not in VIDEOS:
            bad(f'{name}: 해상도 {p["size"]} — 1920x1080(16:9) 또는 1080x1620(2:3)')
        else:
            seen.add(VIDEOS[p['size']])
            c = covers.get(VIDEOS[p['size']])
            if c:
                fr = first_frame(f)
                if fr is not None:
                    d = meandiff(fr, c[1])
                    (ok if d <= 12 else warn)(f'{name}: 첫 프레임 ↔ {os.path.basename(c[0])} 평균 차 {d:.1f}/255' + ('' if d <= 12 else ' — 첫 프레임은 정지 커버와 같아야 한다'))
        if p['audio']:
            bad(f'{name}: 소리 트랙이 있다 — 미리보기 영상은 소리 없이(ffmpeg -an 으로 빼기)')
    if vids:
        for r in ('16:9', '2:3'):
            if r not in seen:
                warn(f'{r} 영상이 없다(1080p 16:9 · 2:3 두 벌이 규격)')

    if out and covers:
        H = 112
        tiles = []
        for r in ('16:9', '2:3', '1:1'):
            if r in covers:
                im = covers[r][1].convert('RGB')
                w = 200 if r == '16:9' else round(im.size[0] * H / im.size[1])
                tiles.append((r, im.resize((w, H), Image.LANCZOS)))
        pad = 12
        W = sum(t[1].size[0] for t in tiles) + pad * (len(tiles) + 1)
        sheet = Image.new('RGB', (W, H + pad * 2 + 16), (32, 33, 38))
        dr = ImageDraw.Draw(sheet)
        x = pad
        for r, t in tiles:
            sheet.paste(t, (x, pad))
            dr.text((x, pad + H + 3), f'{r} {t.size[0]}x{t.size[1]}', fill=(200, 200, 200))
            x += t.size[0] + pad
        sheet.save(out)
        print(f'== 미리보기 {out} — 16:9 는 홈 썸네일 실제 크기(200x112). 이 크기에서 무슨 게임인지 읽히는지 · 제목 말고 글자·테두리·로고가 없는지 눈으로')
    print(f'== 요약: ✗ {NX} · ⚠ {NW}')
    sys.exit(1 if NX else 0)


if __name__ == '__main__':
    main()
