# 정투영 참고도 검사 + 비주얼 헐 로프트
#   python3 ortho.py check <img> [order]   order: 'fsbt'(정면·측면·후면·위, 투구) / 'ofbt'(바깥·정면·후면·위, 어깨)
import sys, json, numpy as np
from PIL import Image, ImageDraw
def fill(m):
    im = Image.fromarray(np.pad(m, 2).astype(np.uint8) * 255).convert('RGB'); ImageDraw.floodfill(im, (0, 0), (128, 0, 0))
    return (np.asarray(im)[:, :, 0] != 128)[2:-2, 2:-2]
def split(path):
    ref = np.asarray(Image.open(path).convert('RGB')).astype(int)
    bgc = np.median(np.concatenate([ref[:15].reshape(-1, 3), ref[-15:].reshape(-1, 3)]), axis=0)
    rm = np.abs(ref - bgc).sum(2) > 55
    col = rm.sum(0) > 3; runs = []; x = 0
    while x < len(col):
        if col[x]:
            s0 = x
            while x < len(col) and col[x]: x += 1
            if x - s0 > 40: runs.append((s0, x))
        x += 1
    out = []
    for a, b in runs:
        m = fill(rm[:, a:b]); ys, xs = np.nonzero(m)
        out.append(dict(mask=m[ys.min():ys.max() + 1, xs.min():xs.max() + 1], y0=ys.min(), y1=ys.max(), x0=a + xs.min(), x1=a + xs.max()))
    return out
def sym(m):
    return (m & m[:, ::-1]).sum() / max(1, (m | m[:, ::-1]).sum())
def check(path, order):
    V = split(path)
    if len(V) != 4: return dict(ok=False, why=f'뷰 {len(V)}개')
    h = [v['mask'].shape[0] for v in V]; w = [v['mask'].shape[1] for v in V]
    r = {}
    r['높이(정면/측면/후면)'] = h[:3]; r['높이 편차'] = round((max(h[:3]) - min(h[:3])) / np.mean(h[:3]), 3)
    r['바닥선 편차'] = round((max(v['y1'] for v in V[:3]) - min(v['y1'] for v in V[:3])) / np.mean(h[:3]), 3)
    if order == 'fsbt':
        r['정면 대칭'] = round(sym(V[0]['mask']), 3); r['후면 대칭'] = round(sym(V[2]['mask']), 3); r['위 대칭'] = round(sym(V[3]['mask']), 3)
        r['정면폭/위폭'] = round(w[0] / w[3], 3); r['측면깊이/위깊이'] = round(w[1] / h[3], 3); r['정면폭/후면폭'] = round(w[0] / w[2], 3)
        ok = r['높이 편차'] < 0.05 and r['정면 대칭'] > 0.93 and r['후면 대칭'] > 0.93 and r['위 대칭'] > 0.9 and abs(r['정면폭/위폭'] - 1) < 0.07 and abs(r['측면깊이/위깊이'] - 1) < 0.07
    else:
        r['정면폭/위폭'] = round(w[1] / w[3], 3); r['바깥깊이/위깊이'] = round(w[0] / h[3], 3); r['정면폭/후면폭'] = round(w[1] / w[2], 3)
        r['정면·후면 거울 IoU'] = round((lambda a, b: (a & b).sum() / max(1, (a | b).sum()))(*[np.asarray(Image.fromarray(V[k]['mask'].astype(np.uint8) * 255).resize((200, 200))) > 127 for k in (1, 2)]), 3) if False else None
        ok = r['높이 편차'] < 0.05 and abs(r['정면폭/위폭'] - 1) < 0.07 and abs(r['바깥깊이/위깊이'] - 1) < 0.07 and abs(r['정면폭/후면폭'] - 1) < 0.07
    r['ok'] = bool(ok); return r
if __name__ == '__main__':
    if sys.argv[1] == 'check':
        print(json.dumps(check(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'fsbt'), ensure_ascii=False))

# ---------- 비주얼 헐 로프트 ----------
NPH = 32
def loft(path, order='fsbt', levels=40, H=0.8):
    """정면(x,y)·측면(z,y)·위(x,z) 윤곽의 교집합 단면을 높이마다 구해 링 [y, cx, cz, r0..r31] 로. 앞 = −z."""
    V = split(path)
    if order == 'fsbt': Fm, Sm, Tm = V[0]['mask'], V[1]['mask'], V[3]['mask']; sideFrontLeft = True
    else: Fm, Sm, Tm = V[1]['mask'], V[0]['mask'], V[3]['mask']; sideFrontLeft = False   # 어깨 바깥 측면 그림은 앞이 오른쪽
    sf = H / Fm.shape[0]; ss = H / Sm.shape[0]; st = Fm.shape[1] * sf / Tm.shape[1]
    Tz = Tm.shape[0] * st; Sz = Sm.shape[1] * ss
    rings = []
    for li in range(levels + 1):
        t = li / levels; y = H * (1 - t)                       # 위 → 아래
        fr = min(Fm.shape[0] - 1, int(round(t * (Fm.shape[0] - 1)))); sr = min(Sm.shape[0] - 1, int(round(t * (Sm.shape[0] - 1))))
        fx = np.nonzero(Fm[fr])[0]; sz = np.nonzero(Sm[sr])[0]
        if len(fx) == 0 or len(sz) == 0: continue
        xl, xr = (fx.min() - Fm.shape[1] / 2) * sf, (fx.max() + 1 - Fm.shape[1] / 2) * sf
        zf, zb = (sz.min() - Sm.shape[1] / 2) * ss, (sz.max() + 1 - Sm.shape[1] / 2) * ss
        if not sideFrontLeft: zf, zb = -zb, -zf
        # 위 그림 픽셀 좌표: x = (c − W/2)·st, z = (R/2 − r)·st … 앞(아래쪽 행)이 −z
        Wt, Ht = Tm.shape[1], Tm.shape[0]
        cx, cz = (xl + xr) / 2, (zf + zb) / 2
        rs = []
        for k in range(NPH):
            ph = -np.pi + 2 * np.pi * k / NPH; dx, dz = np.sin(ph), -np.cos(ph); r = 0.0; step = st * 0.5
            while True:
                x, z = cx + dx * (r + step), cz + dz * (r + step)
                if x < xl or x > xr or z < zf or z > zb: break
                c = int(x / st + Wt / 2); rr = int(Ht / 2 - z / st)
                if c < 0 or c >= Wt or rr < 0 or rr >= Ht or not Tm[rr, c]: break
                r += step
            rs.append(r)
        rings.append([y, cx, cz] + rs)
    return rings
def ring_pts(R, ph):
    y, cx, cz, rs = R[0], R[1], R[2], np.array(R[3:])
    k = (ph + np.pi) / (2 * np.pi) * NPH; k0 = np.floor(k).astype(int) % NPH; k1 = (k0 + 1) % NPH; f = k - np.floor(k)
    r = rs[k0] * (1 - f) + rs[k1] * f
    return np.stack([cx + r * np.sin(ph), np.full_like(ph, y), cz - r * np.cos(ph)], -1)
def loft_polys(rings, n=64):
    ph = np.linspace(-np.pi, np.pi, n + 1); G = np.array([ring_pts(R, ph) for R in rings])
    return list(np.stack([G[:-1, :-1], G[:-1, 1:], G[1:, 1:], G[1:, :-1]], 2).reshape(-1, 4, 3))
def proj_mask(PL, iu, iv, flipu=False, H=200):
    allp = np.concatenate([p.reshape(-1, 3) for p in PL]); u = allp[:, iu] * (-1 if flipu else 1)
    u0, u1, v0, v1 = u.min(), u.max(), allp[:, iv].min(), allp[:, iv].max(); sc = (H - 1) / (v1 - v0)
    im = Image.new('L', (int((u1 - u0) * sc) + 5, H + 4)); d = ImageDraw.Draw(im)
    for p in PL: d.polygon([(((-a if flipu else a) - u0) * sc + 2, (v1 - b) * sc + 2) for a, b in zip(p[:, iu], p[:, iv])], fill=255)
    m = np.asarray(im) > 0; ys, xs = np.nonzero(m); return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
def resizeH(m, H=200):
    h, w = m.shape; return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((max(1, round(w * H / h)), H), Image.BILINEAR)) > 127
def edge(m):
    p = np.pad(m, 1); inner = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return np.argwhere(m & ~inner)
def contour_dist(a, b):
    """두 실루엣(같은 높이로 맞춤 · 가로 중심 맞춤) 윤곽 거리 — 평균·최대, 높이 대비 %"""
    a, b = resizeH(a), resizeH(b); W = max(a.shape[1], b.shape[1]) + 4
    A = np.zeros((200, W), bool); B = np.zeros((200, W), bool)
    A[:, (W - a.shape[1]) // 2:(W - a.shape[1]) // 2 + a.shape[1]] = a; B[:, (W - b.shape[1]) // 2:(W - b.shape[1]) // 2 + b.shape[1]] = b
    ea, eb = edge(A).astype(float), edge(B).astype(float)
    d = np.sqrt(((ea[:, None, :] - eb[None, :, :]) ** 2).sum(2))
    dab, dba = d.min(1), d.min(0)
    iou = (A & B).sum() / max(1, (A | B).sum())
    return dict(mean=round((dab.mean() + dba.mean()) / 2 / 2, 2), max=round(max(dab.max(), dba.max()) / 2, 2), iou=round(iou, 3)), A, B
