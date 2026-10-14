#!/usr/bin/env python3
"""dl-portrait · 후보 비교 시트(사용자가 고르게)

    python3 .claude/skills/dl-portrait/scripts/sheet.py OUT.png --dir <작업폴더> [--only smith,guide]
    python3 .claude/skills/dl-portrait/scripts/sheet.py OUT.png smith_a=<작업폴더>/smith_a_64.png now=refs/ui/초상화/npc/smith_64.png

후보마다 한 칸:  [이름표]
                 [GPT 원본(있으면) 256px]
                 [64px ×4 (도트 확인)]
                 [게임 크기 그대로 — 대화창 128 · 창 머리 96 · 여관 카드 64]
--dir 이면 작업폴더의 <이름>_<후보>_64.png 를 전부 모으고 raw_<이름>_<후보>.png 가 있으면 원본 칸도 채운다.
64px 이 아닌 그림을 주면 down.py 로 줄여서 쓴다. 이름표는 ASCII 로(기본 글꼴엔 한글이 없다).
게임 크기 칸은 CSS image-rendering:pixelated 와 같은 nearest 확대라 96(1.5배)은 도트 굵기가 들쭉날쭉한 것이 정상이다.
"""
import argparse
import glob
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True   # 스킬 폴더(저장소 안)에 __pycache__ 를 남기지 않게
from down import down  # noqa: E402

BG = (14, 16, 24)
NAVY = (27, 37, 64)        # 초상화 바탕 #1b2540 (.npcPor background)
GOLD = (184, 154, 94)      # ui2 테 #b89a5e
FG = (232, 226, 212)
DIM = (150, 156, 170)
COLW, PAD = 320, 14


def font(sz):
    try:
        return ImageFont.load_default(size=sz)
    except TypeError:
        return ImageFont.load_default()


def framed(im, size):
    """게임처럼: 남색 바탕 + 금색 테 2px 안에 nearest 로 size 크기."""
    t = Image.new('RGB', (size + 4, size + 4), GOLD)
    t.paste(NAVY, (2, 2, size + 2, size + 2))
    t.paste(im.resize((size, size), Image.NEAREST), (2, 2))
    return t


def load64(path):
    im = Image.open(path).convert('RGB')
    return im if im.size == (64, 64) else down(path)[1]


def collect(d, only):
    out = []
    for p in sorted(glob.glob(os.path.join(d, '*_64.png'))):
        m = re.match(r'(.+)_([^_]+)_64\.png$', os.path.basename(p))
        if not m:
            continue
        n, v = m.groups()
        if only and n not in only:
            continue
        raw = os.path.join(d, f'raw_{n}_{v}.png')
        out.append((f'{n}_{v}', p, raw if os.path.exists(raw) else None))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('items', nargs='*', help='이름표=경로')
    ap.add_argument('--dir')
    ap.add_argument('--only', help='쉼표로 이름 거르기(예: smith,guide)')
    ap.add_argument('--cols', type=int, default=6)
    a = ap.parse_intermixed_args()   # '--dir W --only smith now=…' 처럼 옵션 뒤에 이름표=경로가 와도 받는다
    items = []
    if a.dir:
        items += collect(a.dir, set(a.only.split(',')) if a.only else None)
    for it in a.items:
        lab, _, p = it.partition('=')
        items.append((lab, p, p if Image.open(p).size != (64, 64) else None))
    if not items:
        sys.exit('후보가 없다 — --dir 또는 이름표=경로')
    has_raw = any(r for _, _, r in items)
    f, fs = font(18), font(13)
    rows_h = 26 + (262 if has_raw else 0) + 262 + 160
    cols = min(a.cols, len(items))
    nrow = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (PAD + cols * (COLW + PAD), PAD + nrow * (rows_h + PAD)), BG)
    dr = ImageDraw.Draw(sheet)
    for i, (lab, p64, raw) in enumerate(items):
        x = PAD + (i % cols) * (COLW + PAD)
        y = PAD + (i // cols) * (rows_h + PAD)
        dr.text((x, y), lab, fill=FG, font=f)
        y += 26
        if has_raw:
            if raw:
                sheet.paste(Image.open(raw).convert('RGB').resize((256, 256), Image.LANCZOS), (x, y))
                dr.text((x + 4, y + 240), 'GPT raw', fill=DIM, font=fs)
            y += 262
        im = load64(p64)
        sheet.paste(im.resize((256, 256), Image.NEAREST), (x, y))
        dr.text((x + 4, y + 240), f'64px x4 · {len(im.getcolors(4096) or [])} colors', fill=DIM, font=fs)
        y += 262
        gx = x
        for sz, nm in ((128, 'dialog'), (96, 'window'), (64, 'inn')):
            sheet.paste(framed(im, sz), (gx, y))
            dr.text((gx, y + sz + 6), nm, fill=DIM, font=fs)
            gx += sz + 4 + 6
    sheet.save(a.out)
    print(f'{a.out}: {len(items)}장 · {sheet.size[0]}x{sheet.size[1]}')


if __name__ == '__main__':
    main()
