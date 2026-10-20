// 후보 계측 — 예전 몸(같은 페이지의 v2=false)과 새 몸(bN.js)을 나란히 지어 비교한다. 저장소 루트에서 실행.
//   node .claude/skills/dl-monster-model/scripts/probe.js <작업폴더> <N>
// 판정(✗ 가 하나라도 있으면 종료 코드 1):
//   페이지 오류 0 · 손잡이(limbs 키) 같음 · 짓는 동안 Math.random 소비가 예전과 같음(층 배치가 그대로)
//   · 고정 손잡이(contract.lock)가 자세마다 예전 자리와 lockTol 안 · 예산(보이는 메시·삼각형)
//   · MeshBasic 재질 전부 _glowMat(적 어둡게 하기·피격 번쩍임이 color 를 덮어쓴다)
//   · 자세·갱신 함수·걷기·손잡이 토글을 60프레임 돌려도 예외 없음
// 참고로 찍는 것: 크기·바닥 아래로 내려간 깊이(minY)·자세별 고정 손잡이 차이. 결과는 <작업폴더>/probe_N.json
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const [work, n] = process.argv.slice(2);
const name = path.basename(path.resolve(work)), port = process.env.PORT || 8898;
const c = require(path.resolve(work, 'contract.json'));
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage(); const perr = []; p.on('pageerror', e => perr.push(e.message)); p.on('console', m => { if (m.type() === 'error') perr.push(m.text()); });
  await p.goto(`http://localhost:${port}/${name}/v${n}.html?type=${c.type}&cmp=2&spin=0`, { timeout: 120000 }); await p.waitForTimeout(1200);
  const r = await p.evaluate((c) => {
    window.requestAnimationFrame = () => 0;
    const type = c.type, out = { errs: [] };
    const tryf = (f, tag) => { try { return f(); } catch (e) { out.errs.push(tag + ': ' + e.message); } };
    // 뷰어 rebuild 가 makeMonOld 에 넘기는 인자(isBoss·isRanged)를 그대로 받아 쓴다
    let args = null; const mk0 = makeMonOld;
    makeMonOld = function (...a) { if (!args) args = a; return mk0.apply(this, a); };
    rebuild(); makeMonOld = mk0;
    const [, isBoss, isRanged] = args || [type, false, false];
    // 같은 시드로 두 번 짓고 소비 횟수를 센다 — 예전 빌더 중에는 난수 값에 따라 반복 횟수가 달라지는 것이 있어(3막 c3TumorShell)
    // 진짜 난수로 재면 새 몸과 무관하게 횟수가 흔들린다
    const R = Math.random; let cnt = 0, sd = 0; const seeded = () => { cnt++; sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    // 판정은 '새 몸이 a1Lcg 밖으로 새는 난수'(leak) — 디스패처(aNMonster)가 도는 동안 바깥 Math.random 이 불린 횟수. 0 이어야 게임 층 배치가 그대로다.
    // (예전 빌더 중에는 같은 시드로도 소비 횟수가 매번 다른 것이 있어 — 3막 c3TumorShell — 예전 ↔ 새 횟수 비교만으로는 판정할 수 없다)
    const MON = c.prefix + 'Monster', mon0 = window[MON]; let inMon = 0, leak = 0;
    window[MON] = function (...a) { inMon++; try { return mon0.apply(this, a); } finally { inMon--; } };
    const seededL = () => { if (inMon) leak++; return seeded(); };
    sd = 12345; Math.random = seededL; const A = mk0(type, isBoss, isRanged, false); const na = cnt; cnt = 0;
    sd = 12345; Math.random = seededL; const A2 = mk0(type, isBoss, isRanged, false); const na2 = cnt; cnt = 0;
    sd = 12345; Math.random = seededL; const B = tryf(() => mk0(type, isBoss, isRanged, true), 'build'); const nb = cnt; Math.random = R; window[MON] = mon0;
    out.leak = leak; out.oldRepeatable = na === na2;
    if (!B) return out;
    const vis = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    const stat = (g) => { g.updateMatrixWorld(true); let m = 0, t = 0; g.traverse(o => { if (o.isMesh && vis(o)) { m++; const gg = o.geometry; t += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); return [m, Math.round(t)]; };
    out.old = stat(A.obj); out.neu = stat(B.obj); out.rnd = [na, nb];
    const ka = Object.keys(A.limbs).sort(), kb = Object.keys(B.limbs).sort();
    out.keysMissing = ka.filter(k => !kb.includes(k)); out.keysExtra = kb.filter(k => !ka.includes(k));
    const noGlow = (H) => { const ms = new Set(); H.obj.traverse(o => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) if (m.isMeshBasicMaterial && !m._glowMat) ms.add(m); }); return ms.size; };
    out.basicNoGlow = noGlow(B); out.basicNoGlowOld = noGlow(A);
    const box = (o) => { o.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(o); return { size: [bx.max.x - bx.min.x, bx.max.y - bx.min.y, bx.max.z - bx.min.z].map(v => +v.toFixed(2)), minY: +bx.min.y.toFixed(3) }; };
    // 고정 손잡이: 자세마다 obj 로컬 자리(예전 ↔ 새)
    const where = (H, k) => { const o = H.limbs[k]; if (!o || !o.isObject3D) return null; H.obj.updateMatrixWorld(true); const w = new THREE.Vector3(); o.getWorldPosition(w); H.obj.worldToLocal(w); return w; };
    const poses = c.poseFn ? c.poses : ['rest'];
    out.lock = {}; let worst = 0;
    for (const ps of poses) {
      for (const H of [A, B]) tryf(() => { if (c.poseFn) H.limbs[c.poseFn](ps, 1, 1); for (const k in H.limbs) if (/^_[a-z]{2}Update$/.test(k)) H.limbs[k](1.0, 0.016); }, 'pose ' + ps);
      for (const k of c.lock) { const a = where(A, k), b2 = where(B, k); if (!a || !b2) { if (!A.limbs[k] || !A.limbs[k].isObject3D) continue; out.errs.push('lock 손잡이 없음: ' + k); continue; } const d = a.distanceTo(b2); worst = Math.max(worst, d); if (d > c.lockTol) (out.lock[ps] = out.lock[ps] || []).push(k + ' ' + d.toFixed(3)); }
    }
    out.lockWorst = +worst.toFixed(3);
    // 갱신 함수 돌리기: 손잡이 토글(0/1 숫자·참거짓) 켬 → 끔, 걷기(legR/legL 흔들기)
    const L = B.limbs, toggles = Object.keys(L).filter(k => /^_[a-z]{2}[A-Z]\w*$/.test(k) && (typeof L[k] === 'number' || typeof L[k] === 'boolean'));
    tryf(() => {
      if (c.poseFn) L[c.poseFn]('rest', 0, 1);
      for (const on of [1, 0]) { for (const k of toggles) L[k] = typeof L[k] === 'boolean' ? !!on : on; for (let i = 0; i < 60; i++) for (const k in L) if (/^_[a-z]{2}Update$/.test(k)) L[k](on * 3 + i * 0.05, 0.05); }
      for (let i = 0; i < 60; i++) { if (L.legR) L.legR.rotation.x = Math.sin(i * 0.3) * 0.8; if (L.legL) L.legL.rotation.x = -Math.sin(i * 0.3) * 0.8; if (L.armR) L.armR.rotation.x = Math.sin(i * 0.2) * 1.5; for (const k in L) if (/^_[a-z]{2}Update$/.test(k)) L[k](6 + i * 0.05, 0.05); }
      if (c.poseFn) L[c.poseFn]('rest', 0, 1);
    }, 'update');
    out.toggles = toggles;
    out.boxOld = box(A.obj); out.boxNew = box(B.obj);
    return out;
  }, c);
  r.pageErrors = perr;
  const bud = { meshes: c.budget.meshes || Math.max(24, Math.round((r.old ? r.old[0] : 40) * 1.6)), tris: c.budget.tris || Math.max(3000, Math.round((r.old ? r.old[1] : 5000) * 2.2)) };   // 아주 싼 예전 몸(1막 고블린 244)에도 숨 쉴 틈
  const chk = [];
  const ok = (cond, msg) => chk.push((cond ? '✓ ' : '✗ ') + msg);
  ok(!r.errs.length && !perr.length, `오류 0 — ${JSON.stringify(r.errs.concat(perr)).slice(0, 400)}`);
  if (r.neu) {
    ok(!r.keysMissing.length && !r.keysExtra.length, `손잡이 같음 — 빠짐 ${JSON.stringify(r.keysMissing)} · 더함 ${JSON.stringify(r.keysExtra)}`);
    ok(r.leak === 0, `새 몸이 a1Lcg 밖으로 새는 난수 ${r.leak}회(0 이어야 층 배치 그대로) · 소비 예전 ${r.rnd[0]} ↔ 새 ${r.rnd[1]}${r.oldRepeatable ? (r.rnd[0] === r.rnd[1] ? ' 같음' : ' — 다름: a1Lcg 밖에서 객체를 만든다') : ' (예전 빌더가 같은 시드로도 반복 불가 — 횟수 비교 생략)'}`);
    if (r.oldRepeatable && r.rnd[0] !== r.rnd[1]) ok(false, 'makeMonOld 전체 소비가 예전과 다르다 — 디스패처 밖(makeMonOld 안)에서 새로 만드는 것이 있다');
    ok(!Object.keys(r.lock).length, `고정 손잡이(${c.lock.join(',') || '없음'}) 자세 ${c.poseFn ? c.poses.length : 1}개 최대 차이 ${r.lockWorst} ≤ ${c.lockTol}${Object.keys(r.lock).length ? ' — 어긋남 ' + JSON.stringify(r.lock) : ''}`);
    ok(r.neu[0] <= bud.meshes && r.neu[1] <= bud.tris, `예산 메시 ${r.neu[0]}/${bud.meshes} · 삼각형 ${r.neu[1]}/${bud.tris} (예전 ${r.old[0]} · ${r.old[1]})`);
    ok(!c.requireGlowFlag || r.basicNoGlow <= r.basicNoGlowOld, `MeshBasic 인데 _glowMat 없는 재질 새 ${r.basicNoGlow} (예전 몸에서 남긴 것 ${r.basicNoGlowOld} 까지 허용 — 새로 만든 발광 재질은 전부 표식)`);
    chk.push(`· 크기 예전 ${JSON.stringify(r.boxOld.size)} → 새 ${JSON.stringify(r.boxNew.size)} · 가장 낮은 점 ${r.boxNew.minY}(바닥 0 · 몸은 -0.03 아래로 가면 안 된다 — 무기 끝은 예외)`);
    chk.push(`· 손잡이 토글 ${JSON.stringify(r.toggles)}`);
  }
  fs.writeFileSync(path.resolve(work, `probe_${n}.json`), JSON.stringify(r, null, 1));
  console.log(chk.join('\n'));
  await b.close(); process.exit(chk.some(s => s.startsWith('✗')) ? 1 : 0);
})();
