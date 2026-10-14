#!/usr/bin/env python3
"""dl-portrait · 64px 초상화를 index.html 의 window.NPC_POR_DATA 에 넣기/바꾸기

    python3 .claude/skills/dl-portrait/scripts/embed.py KEY PNG [--html index.html] [--dry-run]
    python3 .claude/skills/dl-portrait/scripts/embed.py --list   [--html …]
    python3 .claude/skills/dl-portrait/scripts/embed.py --extract KEY OUT.png [--html …]
    python3 .claude/skills/dl-portrait/scripts/embed.py --remove KEY [--html …]

· 대상은 `<script id="npcpor-data">` 블록 안의 한 줄 `window.NPC_POR_DATA = {...};` 뿐이다. 그 줄만 갈아 끼우고
  나머지 바이트는 그대로 둔다(쓰고 나서 앞뒤가 바뀌지 않았는지 다시 확인한다). 키 순서는 유지 — 새 키는 끝에 붙는다.
· JSON 은 `separators=(',', ':')` 압축형이다. 읽은 줄을 다시 덤프해 원문과 같지 않으면 형식이 바뀐 것이므로 손대지 않고 멈춘다.
· 인코딩은 v895~v897 과 같다: RGB 64×64 → quantize(32, FASTOCTREE) → PNG optimize → base64.
  refs/ui/초상화/npc/<key>_64.png(down.py 결과 RGB)를 넣으면 게임에 이미 들어 있는 것과 바이트 단위로 같은 값이 나온다
  (가까운 색 몇 개가 1~8 단계 합쳐질 수 있다 — 들어 있는 19장이 다 이렇게 들어갔다).
  같은 Pillow·zlib 이어야 바이트가 같다 — 다른 컨테이너에서 다시 넣으면 픽셀은 같고 바이트만 다를 수 있다.
· 표준 라이브러리 + Pillow 만 쓴다(numpy 불필요).
"""
import argparse
import base64
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OPEN = '<script id="npcpor-data">'
PREFIX = 'window.NPC_POR_DATA = '
KEY_RE = re.compile(r'^[a-z][a-z0-9_]*$')
try:
    _FASTOCTREE = Image.Quantize.FASTOCTREE
except AttributeError:
    _FASTOCTREE = Image.FASTOCTREE


def die(msg):
    print('embed.py: ' + msg, file=sys.stderr)
    sys.exit(1)


def dump(d):
    return json.dumps(d, separators=(',', ':'), ensure_ascii=False) + ';'


def locate(text):
    """(줄 시작, 줄 끝(개행 제외), dict) — 블록·줄이 정확히 하나씩일 때만."""
    if text.count(OPEN) != 1:
        die(f'{OPEN} 블록이 {text.count(OPEN)}개다(1개여야 한다)')
    b0 = text.index(OPEN)
    b1 = text.find('</script>', b0)
    if b1 < 0:
        die('npcpor-data 블록의 </script> 를 못 찾았다')
    hits = [m.start() for m in re.finditer(r'(?m)^' + re.escape(PREFIX), text[b0:b1])]
    if len(hits) != 1:
        die(f'블록 안 "{PREFIX}" 줄이 {len(hits)}개다(1개여야 한다)')
    s = b0 + hits[0]
    e = text.find('\n', s)
    if e < 0 or e > b1:
        die('NPC_POR_DATA 줄이 블록 안에서 끝나지 않는다')
    if text[e - 1] == '\r':
        e -= 1
    body = text[s + len(PREFIX):e]
    if not body.endswith(';'):
        die('NPC_POR_DATA 줄이 ";" 로 끝나지 않는다 — 형식이 바뀌었다')
    try:
        d = json.loads(body[:-1])
    except ValueError as ex:
        die(f'NPC_POR_DATA JSON 을 못 읽었다: {ex}')
    if not isinstance(d, dict):
        die('NPC_POR_DATA 가 객체가 아니다')
    if dump(d) != body:
        die('다시 덤프한 JSON 이 원문과 다르다(공백·이스케이프 형식이 바뀜) — 손으로 확인할 것. 아무것도 안 썼다')
    return s, e, d


def encode(png_path, allow_size=False):
    im = Image.open(png_path).convert('RGB')
    if im.size != (64, 64) and not allow_size:
        die(f'{png_path} 는 {im.size[0]}x{im.size[1]} — 64x64 여야 한다(down.py 결과를 넣을 것). 일부러면 --allow-size')
    buf = io.BytesIO()
    im.quantize(32, method=_FASTOCTREE).save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def info(b64):
    im = Image.open(io.BytesIO(base64.b64decode(b64)))
    return im.size, len(im.convert('RGB').getcolors(4096) or []), len(b64)


def write_safely(path, old, s, e, newline):
    new = old[:s] + newline + old[e:]
    raw = new.encode('utf-8')
    tmp = path + '.embed-tmp'
    with open(tmp, 'wb') as f:
        f.write(raw)
    try:
        os.chmod(tmp, os.stat(path).st_mode & 0o7777)
    except OSError:
        pass
    os.replace(tmp, path)
    with open(path, 'rb') as f:
        back = f.read().decode('utf-8')
    if back != new or back[:s] != old[:s] or back[s + len(newline):] != old[e:]:
        die('쓴 뒤 확인 실패 — git diff 로 확인할 것')
    return len(old.encode('utf-8')), len(raw)


def main():
    ap = argparse.ArgumentParser(description='NPC_POR_DATA 에 64px 초상화 넣기')
    ap.add_argument('key', nargs='?')
    ap.add_argument('png', nargs='?')
    ap.add_argument('--html', default=os.path.join(REPO, 'index.html'))
    ap.add_argument('--dry-run', action='store_true', help='쓰지 않고 무엇이 바뀌는지만')
    ap.add_argument('--list', action='store_true', help='들어 있는 키·크기·색 수')
    ap.add_argument('--extract', nargs=2, metavar=('KEY', 'OUT'), help='들어 있는 PNG 를 파일로 꺼내기')
    ap.add_argument('--remove', metavar='KEY')
    ap.add_argument('--allow-size', action='store_true')
    a = ap.parse_args()

    with open(a.html, 'rb') as f:
        old = f.read().decode('utf-8')
    s, e, d = locate(old)

    if a.list:
        for k, v in d.items():
            (w, h), nc, n = info(v)
            print(f'{k:14s} {w}x{h}  {nc:2d}색  base64 {n}자')
        print(f'— {len(d)}장 · 줄 {len(old[s:e])}자')
        return
    if a.extract:
        k, out = a.extract
        if k not in d:
            die(f'키 "{k}" 가 없다. 있는 키: {", ".join(d)}')
        with open(out, 'wb') as f:
            f.write(base64.b64decode(d[k]))
        print(f'{k} → {out}')
        return

    if a.remove:
        if a.remove not in d:
            die(f'키 "{a.remove}" 가 없다')
        del d[a.remove]
        action = f'삭제 {a.remove}'
    else:
        if not a.key or not a.png:
            ap.error('KEY PNG 둘 다 필요하다(또는 --list / --extract / --remove)')
        if not KEY_RE.match(a.key):
            die(f'키 "{a.key}" — 소문자·숫자·_ 만(예: smith, mmonk, gate)')
        b64 = encode(a.png, a.allow_size)
        prev = d.get(a.key)
        if prev == b64:
            print(f'{a.key}: 이미 같은 값이다 — 파일을 건드리지 않았다')
            return
        d[a.key] = b64
        (w, h), nc, n = info(b64)
        action = (f'{"교체" if prev is not None else "추가"} {a.key} · {w}x{h} · {nc}색 · base64 {n}자'
                  + (f' (이전 {len(prev)}자)' if prev is not None else ' (새 키 — 끝에 붙음)'))

    newline = PREFIX + dump(d)
    if a.dry_run:
        print('[dry-run] ' + action + f' · 줄 {e - s} → {len(newline)}자 · 아무것도 안 썼다')
        return
    n0, n1 = write_safely(a.html, old, s, e, newline)
    rp = os.path.relpath(a.html)
    print(action + f' · {a.html if rp.startswith("..") else rp} {n0} → {n1} 바이트')
    if not a.remove:
        rest = old[:s] + old[e:]
        refs = len(re.findall(r"""['"=]""" + re.escape(a.key) + r"""['"]""", rest))
        # 용병 카드는 npcPorSrc('m' + id) 라 키 문자열이 코드에 없다 — 'm' + MERC_ORDER 의 종류 id 면 연결된 것으로 본다
        merc = (a.key.startswith('m') and re.search(r"""MERC_ORDER\s*=.*['"]""" + re.escape(a.key[1:]) + r"""['"]""", rest))
        if refs == 0 and not merc:
            print(f'참고: 게임 코드에서 "{a.key}" 를 부르는 곳이 아직 없다 — SKILL.md 6단계(연결)를 할 것')
        print('잊지 말 것: 블록 머리 주석(vNNN · 무엇을 넣었나)을 한 줄 고치고, GAME_VERSION 을 올린다(dl-release)')


if __name__ == '__main__':
    try:
        main()
    except BrokenPipeError:   # | head 로 잘라 볼 때(쓰기는 이미 끝났다)
        sys.stderr.close()
