#!/usr/bin/env python3
"""dl-device-check · 접촉 시트(contact sheet) 만들기

    python3 .claude/skills/dl-device-check/scripts/sheet.py <devices.js 결과 폴더> [--height H]

metrics.json 을 읽어 뷰포트마다 한 줄:  [이름표 두세 줄]
                                         [title?] [마을] [던전] [던전 1:1 잘라내기]
장면은 전부 같은 높이(H)로 줄인다 — 세로 FOV 가 같으면 캐릭터가 같은 크기로 보여야 하고, 가로 폭 차이가 곧 '옆으로 더 보이는 양'이다.
마지막 칸은 줄이지 않은 1:1 잘라내기(캐릭터 중심) — 모니터마다 텍셀(PX_FIXED_H)이 화면 몇 픽셀로 찍히는지 그대로 보인다.

글꼴: 한글이 되는 시스템 글꼴(fc-list :lang=ko) → 스킬 동봉 assets/font.ttf(고운바탕 Bold 부분 집합) → PIL 기본 글꼴 순.
동봉 글꼴은 이 파일과 devices.js 의 문자열에 나오는 글자만 담았다 — 이름표에 새 한글을 넣으면 SKILL.md '글꼴' 절대로 다시 구울 것.
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BG = (21, 23, 28)
FG = (232, 226, 212)
DIM = (150, 156, 170)
WARN = (255, 170, 90)
GOOD = (130, 210, 160)
SCENE_KO = {'title': '타이틀', 'town': '마을', 'dungeon': '던전'}


def find_font():
    try:
        out = subprocess.run(['fc-list', ':lang=ko', 'file'], capture_output=True, text=True, timeout=10).stdout
        files = [l.split(':')[0].strip() for l in out.splitlines() if l.strip()]
        files.sort(key=lambda f: (0 if 'wqy' in f.lower() or 'nanum' in f.lower() or 'noto' in f.lower() else 1, f))
        for f in files:
            if os.path.exists(f) and not f.lower().endswith(('.pcf', '.pcf.gz', '.bdf')):
                return f
    except Exception:
        pass
    f = os.path.join(HERE, '..', 'assets', 'font.ttf')
    return os.path.abspath(f) if os.path.exists(f) else None


FONT_FILE = find_font()


def font(size):
    if FONT_FILE:
        try:
            return ImageFont.truetype(FONT_FILE, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def fit_h(img, h):
    w = max(1, round(img.width * h / img.height))
    return img.resize((w, h), Image.LANCZOS if img.height > h else Image.NEAREST)


def crop_1to1(img, cx, cy, w, h):
    # 캐릭터 중심(CSS px) → 스크린샷 px(dpr 배)로. 화면 밖으로 안 나가게 민다.
    x0 = int(min(max(0, cx - w // 2), max(0, img.width - w)))
    y0 = int(min(max(0, cy - h // 2), max(0, img.height - h)))
    return img.crop((x0, y0, x0 + min(w, img.width), y0 + min(h, img.height)))


def label_lines(r, shots, meta_small=11, meta_rel=1.6):
    """뷰포트 한 줄의 이름표(세 줄)."""
    if r.get('error'):
        err = (re.sub(r'\x1b\[[0-9;]*m', '', r['error']).strip().splitlines() or [''])[0][:140]
        return [(f"{r['label']}  {r['w']}×{r['h']}  — 실패: {err}", WARN)]
    md = r['m'].get('dungeon') or r['m'].get('town') or r['m'].get('title') or {}
    if not md:
        return [(f"{r['label']}  {r['w']}×{r['h']}", FG)]
    kind = '터치' if md.get('isTouchDevice') else 'PC'
    z = md.get('ui2z')
    l1 = f"{r['label']}   {md['scr'][0]}×{md['scr'][1]}  {kind}" + (f"  dpr {r['dpr']}" if r.get('dpr', 1) != 1 else '') + \
         (f"   HUD 배율 ×{z}" if z is not None else ('   HUD 배율 -' + ('' if md.get('ui2') else ' (새 HUD 꺼짐)'))) + ('   (가로 돌려 그림)' if md.get('rotLand') else '')
    gt = md.get('groundTiles') or [None, None]
    l2 = f"세로 FOV {md['vfov']}°  가로 FOV {md['hfov']}°  (화면비 {md['aspect']})   바닥 보이는 범위 {gt[0]}×{gt[1]}칸" + \
         f"   저해상 {md['lowRes'][0]}×{md['lowRes'][1]} → 텍셀 {md['texelPx']}px"
    parts = []
    for s in shots:
        m = r['m'].get(s)
        if m and m.get('char'):
            parts.append(f"{SCENE_KO.get(s, s)} 캐릭터 {m['char']['px']}px({m['char']['pctH']}%)")
    smalls = []
    for s in shots:
        m = r['m'].get(s)
        if not m:
            continue
        tx = m['text']
        if tx.get('smallN'):
            t = tx['small'][0]
            smalls.append(f"{SCENE_KO.get(s, s)} <{meta_small}px {tx['smallN']}개(최소 {t['px']}px {t['sel']})")
        if tx.get('relN'):
            t = tx['rel'][0]
            smalls.append(f"{SCENE_KO.get(s, s)} <{meta_rel}%높이 {tx['relN']}개(최소 {t['px']}px={t['pct']}% {t['sel']})")
    l3 = '   '.join(parts)
    if md.get('mobileControls'):
        l3 += f"   모바일 버튼 {md['mcCoverPct']}% 덮음"
    out = [(l1, FG), (l2, DIM), (l3, DIM)]
    if smalls:
        out.append(('작은 글씨: ' + '  ·  '.join(smalls), WARN))
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    d = sys.argv[1]
    meta = json.load(open(os.path.join(d, 'metrics.json'), encoding='utf8'))
    H = meta.get('height', 360)
    if '--height' in sys.argv:
        H = int(sys.argv[sys.argv.index('--height') + 1])
    shots = meta['shots']
    f_head, f_lab, f_cap = font(24), font(17), font(14)
    pad, gap, line_h = 16, 10, 23

    rows = []
    for r in meta['results']:
        tiles = []
        for s in shots:
            fn = r['files'].get(s)
            if not fn:
                continue
            im = Image.open(os.path.join(d, fn)).convert('RGB')
            if (r['m'].get(s) or {}).get('rotLand'):
                # 세로로 든 폰: 게임이 body 를 90° 돌려 그리므로(CLAUDE.md '가로 고정(v816)') 스크린샷이 옆으로 누워 있다.
                # 반시계로 90° 되돌리면 플레이어가 폰을 눕혀 보는 그림 = 측정(scrW/scrH · 캐릭터 좌표)과 같은 좌표계가 된다.
                im = im.transpose(Image.Transpose.ROTATE_90 if hasattr(Image, 'Transpose') else Image.ROTATE_90)
            cap = SCENE_KO.get(s, s) + (f" {meta['floor']}층" if s == 'dungeon' else '')
            tiles.append((fit_h(im, H), cap))
            if s == 'dungeon':
                m = r['m'].get('dungeon') or {}
                ch = m.get('char') or {'cx': m.get('scr', [im.width, im.height])[0] // 2, 'cy': m.get('scr', [im.width, im.height])[1] // 2}
                dpr = r.get('dpr', 1)
                cw = H
                # dpr 이 1 이 아니면 스크린샷이 기기 픽셀이라 1:1 은 'CSS px 가 아니라 기기 픽셀 1:1'(텍셀이 dpr 배 크게 보인다)
                cap1 = '1:1 (줄이지 않음)' + (f' · 기기 픽셀 dpr {dpr}' if dpr != 1 else '')
                tiles.append((crop_1to1(im, ch['cx'] * dpr, ch['cy'] * dpr, cw, H), cap1))
        labs = label_lines(r, shots, meta.get('small', 11), meta.get('smallrel', 1.6))
        w = pad * 2 + sum(t[0].width for t in tiles) + gap * max(0, len(tiles) - 1)
        h = pad + len(labs) * line_h + 6 + (H if tiles else 0) + pad
        rows.append((labs, tiles, w, h))

    q = meta.get('query') or ''
    head = f"dl-device-check  ·  {meta['version']}  ·  시드 {meta['seed']}  ·  {meta['floor']}층  ·  {meta['cls']}  ·  " + \
           (f"?tut=0{q}  ·  " if q else '') + \
           f"장면은 같은 높이({H}px)로 줄임 — 가로 폭 차이 = 옆으로 더 보이는 양  ·  마지막 칸은 1:1"
    head_h = 46
    W = max([r[2] for r in rows] + [900])
    try:
        W = max(W, int(ImageDraw.Draw(Image.new('RGB', (1, 1))).textlength(head, font=f_head)) + pad * 2)
    except Exception:
        pass
    total = head_h + sum(r[3] for r in rows)
    sheet = Image.new('RGB', (W, total), BG)
    dr = ImageDraw.Draw(sheet)
    dr.text((pad, 12), head, font=f_head, fill=FG)
    y = head_h
    for labs, tiles, w, h in rows:
        dr.line([(0, y), (W, y)], fill=(48, 52, 62), width=1)
        ty = y + pad // 2
        for txt, col in labs:
            dr.text((pad, ty), txt, font=f_lab, fill=col)
            ty += line_h
        x, iy = pad, y + pad // 2 + len(labs) * line_h + 6
        for im, cap in tiles:
            sheet.paste(im, (x, iy))
            dr.rectangle([x, iy, x + im.width - 1, iy + im.height - 1], outline=(70, 74, 86))
            tw = dr.textlength(cap, font=f_cap) if hasattr(dr, 'textlength') else len(cap) * 8
            dr.rectangle([x + 4, iy + 4, x + 12 + tw, iy + 22], fill=(0, 0, 0))
            dr.text((x + 8, iy + 5), cap, font=f_cap, fill=GOOD)
            x += im.width + gap
        y += h
    out = os.path.join(d, 'sheet.png')
    sheet.save(out, optimize=True)
    print(f'✓ 시트 {out}  ({sheet.width}×{sheet.height}, 글꼴 {os.path.basename(FONT_FILE) if FONT_FILE else "PIL 기본(한글 깨짐)"})')


if __name__ == '__main__':
    main()
