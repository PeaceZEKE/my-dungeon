# 투구 매개 단면(python3 viewers/fit/helm_param.py [방향 수]) → helm_param.json: 높이마다 옆 반지름 rs(정면 윤곽, 옆 원판 구간은 보간) · 앞 zf · 뒤 zb(측면 윤곽) · 앞 지수 nf(1 = V 부리, 2 = 타원)
import sys, json, math, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import ortho
REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../refs/ui/초상화/knight_helm_ortho.png')
H = 0.8; L = 40; NP = int(sys.argv[1]) if len(sys.argv) > 1 else 48
V = ortho.split(REF); Fm, Sm, Tm = V[0]['mask'], V[1]['mask'], V[3]['mask']
sf = H / Fm.shape[0]; ss = H / Sm.shape[0]
rows = []
for li in range(L + 1):
  t = li / L
  fr = min(Fm.shape[0] - 1, int(round(t * (Fm.shape[0] - 1)))); sr = min(Sm.shape[0] - 1, int(round(t * (Sm.shape[0] - 1))))
  fx = np.nonzero(Fm[fr])[0]; sz = np.nonzero(Sm[sr])[0]
  rs = (fx.max() + 1 - fx.min()) * sf / 2
  zf, zb = (sz.min() - Sm.shape[1] / 2) * ss, (sz.max() + 1 - Sm.shape[1] / 2) * ss
  rows.append([t, rs, zf, zb])
R = np.array(rows)
# 옆 원판(t 0.27~0.6) 구간의 폭은 원판이라 몸통이 아니다 — 양끝을 잇는 매끈한 곡선(위 둥근 두개골 폭 연장)으로
a, b = 0.26, 0.61
ia, ib = int(a * L), int(b * L)
for i in range(ia + 1, ib):
  f = (i - ia) / (ib - ia); R[i, 1] = R[ia, 1] * (1 - f) + R[ib, 1] * f + 0.012 * math.sin(math.pi * f)
# 앞 지수: 면갑(t 0.37~0.8)은 V 부리
def nf(t):
  s = lambda x, e0, e1: min(1, max(0, (x - e0) / (e1 - e0)))
  k = s(t, 0.33, 0.39) * (1 - s(t, 0.79, 0.83))
  return 2.0 - 0.9 * k
# 높이 방향 다듬기(폭·앞·뒤) — 그림의 계단 노이즈 제거
for _ in range(2):
  R[1:-1, 1:] = (R[:-2, 1:] + 2 * R[1:-1, 1:] + R[2:, 1:]) / 4
out = []
for t, rs, zf, zb in R:
  cz = (zf + zb) / 2; rf = cz - zf; rb = zb - cz; n = nf(t)
  # 단면을 촘촘한 매개점으로 → 중심(0, cz)에서 φ 격자 반지름
  th = np.linspace(-math.pi, math.pi, 2001); s, c = np.sin(th), np.cos(th)
  ex = np.where(c >= 0, 2 / n, 1.0)   # 앞(c ≥ 0) 은 초타원 지수, 뒤는 타원
  x = rs * np.sign(s) * np.abs(s) ** ex
  z = np.where(c >= 0, -rf * np.abs(c) ** ex, rb * np.abs(c))
  ang = np.arctan2(x, -z); rad = np.hypot(x, z); o = np.argsort(ang)
  phs = np.array([-math.pi + 2 * math.pi * k / NP for k in range(NP)])
  rr = np.interp(phs, ang[o], rad[o], period=2 * math.pi)
  out.append([round(H * (1 - t), 4), 0.0, round(cz, 4)] + [round(float(v), 4) for v in rr])
json.dump(out, open('helm_param.json', 'w'))
print(len(out), len(out[0])); print([ [round(v,3) for v in r] for r in R[::5].tolist()])
