// 후보 렌더 — 한 브라우저에서 여러 시점을 차례로 찍는다. 저장소 루트에서 실행.
//   node .claude/skills/dl-monster-model/scripts/shot.js <작업폴더> <N> <출력접두사> [옵션]
//   --views front,side,back,hi,game      (기본 front,side,back,game)  · game = 게임 카메라 각도(51.9° 내려다봄)
//   --cmp 2|0|1   2 새것만(기본) · 0 예전(왼쪽)+새(오른쪽) · 1 예전만      --zoom 1.8  (1.0 = 게임 실제 크기)
//   --pose sweep,1,1   _xxPose(이름, 진행, 쪽)      --limbs '{"_hsWing":1,"_hsFlap":1}'  (매 step 다시 건다)
//   --walk   걷기 켬      --atk 0.5   공격 단추 누르고 0.5초 뒤      --t 1.0   진행 시간(기본 0.9초)
//   --eval 'js'   찍기 전에 페이지에서 실행
// 출력: <출력접두사>_<view>.png. 페이지 오류가 있으면 'ERR …' 를 찍고 종료 코드 1.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const [work, n, outp, ...rest] = process.argv.slice(2);
if (!outp) { console.log('usage: shot.js <작업폴더> <N> <출력접두사> [--views …]'); process.exit(2); }
const opt = { views: 'front,side,back,game', cmp: '2', zoom: '1.8', t: '0.9' };
for (let i = 0; i < rest.length; i++) { const k = rest[i].replace(/^--/, ''); if (k === 'walk') opt.walk = true; else opt[k] = rest[++i]; }
const V = { front: [Math.PI, 0.12], side: [1.9, 0.15], back: [0, 0.15], hi: [0.6, 0.5], left: [-1.3, 0.15], top: [0.6, 1.2] };
const name = path.basename(path.resolve(work)), port = process.env.PORT || 8898;
const c = require(path.resolve(work, 'contract.json'));
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const q = `type=${c.type}&cmp=${opt.cmp}&spin=0${opt.walk ? '&walk=1' : ''}`;
  await p.goto(`http://localhost:${port}/${name}/v${n}.html?${q}`, { timeout: 120000 }); await p.waitForTimeout(1200);
  await p.evaluate(([pose, limbs, ev]) => {
    window.requestAnimationFrame = () => 0;
    if (pose) { const a = pose.split(','); window.__pose = [a[0], +(a[1] ?? 1), +(a[2] ?? 1)]; }
    if (limbs) window.__limbs = JSON.parse(limbs);
    if (ev) (0, eval)(ev);
  }, [opt.pose || '', opt.limbs || '', opt.eval || '']);
  for (const v of opt.views.split(',')) {
    await p.evaluate(([v, VV, zoom, atk, t]) => {
      camZoom = +zoom;
      if (v === 'game') { camYaw = GAME_YAW; camPitch = GAME_PITCH; } else { camYaw = VV[v][0]; camPitch = VV[v][1]; }
      applyAdaptiveFOV(); updateCam();
      const steps = 30, T = +t;
      if (atk) { atkT = 0; for (let i = 0; i < steps; i++) window.__step(+atk / steps); } else for (let i = 0; i < steps; i++) window.__step(T / steps);
    }, [v, V, opt.zoom, opt.atk || '', opt.t]);
    const out = `${outp}_${v}.png`; await p.screenshot({ path: out }); console.log('ok', out);
  }
  if (errs.length) { console.log('ERR', JSON.stringify(errs.slice(0, 5))); await b.close(); process.exit(1); }
  await b.close();
})();
