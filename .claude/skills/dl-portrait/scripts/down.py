#!/usr/bin/env python3
"""dl-portrait · GPT 원본(약 1254px) → 64px 도트 초상화

    python3 .claude/skills/dl-portrait/scripts/down.py RAW.png OUT_64.png [--colors 32] [--preview OUT_x8.png]

v895~v897 에 게임에 넣은 초상화 19장을 만든 그 함수다(스크래치패드 port/down.py 를 옮김 — 결과가 픽셀 단위로 같다).
· GPT 의 '도트'는 정확한 격자가 아니다(칸이 약 19.6px 로 들쭉날쭉). 64칸으로 나눠 **칸 가운데 60%** 의 중앙값을 뽑는다
  (가장자리 20% 씩은 이웃 칸과 번진 경계라 버린다).
· 색 줄이기는 **옥트리(FASTOCTREE) 32색 · 디더 없음**. 중앙 절단(기본 quantize) 24색은 작은 채도 높은 영역을
  합쳐 버려 길잡이 등불의 보라 불꽃이 흰빛이 됐다(CLAUDE.md 'NPC 초상화' 절).
· numpy 가 있으면 numpy 로, 없으면 순수 파이썬으로 같은 값을 낸다(짝수 개 중앙값 = 두 가운데 평균을 내림 — numpy 가
  float → uint8 로 넣을 때 자르는 것과 같다). sprite-gen venv 에는 numpy 가 있다.
"""
import argparse
import sys

from PIL import Image

try:
    import numpy as np
except ImportError:  # 순수 파이썬 경로(결과 같음)
    np = None

N = 64
try:
    _FASTOCTREE = Image.Quantize.FASTOCTREE
    _NODITHER = Image.Dither.NONE
except AttributeError:  # 오래된 Pillow
    _FASTOCTREE = Image.FASTOCTREE
    _NODITHER = Image.NONE


def _cells(W, H):
    for y in range(N):
        for x in range(N):
            y0, y1 = int(y * H / N), int((y + 1) * H / N)
            x0, x1 = int(x * W / N), int((x + 1) * W / N)
            my = (y1 - y0) // 5
            mx = (x1 - x0) // 5
            yield x, y, x0 + mx, y0 + my, x1 - mx, y1 - my


def _median_grid_np(im):
    W, H = im.size
    a = np.asarray(im).astype(np.float32)
    out = np.zeros((N, N, 3), np.uint8)
    for x, y, l, t, r, b in _cells(W, H):
        out[y, x] = np.median(a[t:b, l:r].reshape(-1, 3), axis=0)
    return Image.fromarray(out)


def _median_grid_py(im):
    W, H = im.size
    out = Image.new('RGB', (N, N))
    px = out.load()
    for x, y, l, t, r, b in _cells(W, H):
        buf = im.crop((l, t, r, b)).tobytes()   # RGB 바이트(getdata 는 Pillow 14 에서 빠진다)
        n = len(buf) // 3
        rgb = []
        for c in range(3):
            v = sorted(buf[c::3])
            rgb.append(v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) // 2)
        px[x, y] = tuple(rgb)
    return out


def down(path, ncol=32, force_py=False):
    """(중앙값 64px RGB, 32색 64px RGB) 를 돌려준다. 게임에 넣는 것은 두 번째."""
    im = Image.open(path).convert('RGB')
    raw = _median_grid_py(im) if (np is None or force_py) else _median_grid_np(im)
    return raw, raw.quantize(colors=ncol, method=_FASTOCTREE, dither=_NODITHER).convert('RGB')


def main():
    ap = argparse.ArgumentParser(description='GPT 초상화 원본 → 64px 32색')
    ap.add_argument('raw')
    ap.add_argument('out')
    ap.add_argument('--colors', type=int, default=32)
    ap.add_argument('--preview', help='8배 확대 미리보기(nearest) 저장 경로')
    ap.add_argument('--pure', action='store_true', help='numpy 가 있어도 순수 파이썬 경로로(검증용)')
    a = ap.parse_args()
    _, q = down(a.raw, a.colors, a.pure)
    q.save(a.out)
    if a.preview:
        q.resize((N * 8, N * 8), Image.NEAREST).save(a.preview)
    ncol = len(q.getcolors(4096) or [])
    print(f'{a.out}: 64x64 · {ncol}색 · {"pure" if (np is None or a.pure) else "numpy"}')


if __name__ == '__main__':
    sys.exit(main())
