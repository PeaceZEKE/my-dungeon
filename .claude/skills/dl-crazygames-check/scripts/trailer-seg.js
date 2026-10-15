// dl-crazygames-check · 미리보기 영상 한 토막을 프레임으로 찍는다(실제 메인 루프 · 결정적 시계 · 봇이 싸움)
//   node trailer-seg.js <토막> <WxH> <출력 폴더> [프레임 수=105] [포트=8899]
//   토막: a1(기사 6층) · a2(마법사 44층) · a3(궁수 74층) · a4(기사 120층 지옥의 군주)
//   출력: <폴더>/f0000.jpg … (30fps) — 이어 붙이기는 trailer.sh
// 렌더는 ?pxh=<H/3>(정수 3배 — 도트가 고르게) · 체력 무한(피해 무시) · 공격력 1.5배 · 스킬 둘을 1.4초마다 번갈아.
const { chromium } = require('playwright'); const fs = require('fs');
const [seg, vp, out, nF = '105', port = '8899'] = process.argv.slice(2);
const [W, H] = vp.split('x').map(Number); const NF = +nF;
const SEG = {
  a1: { ci: 0, cls: 'knight', floor: 6, sk: ['knight_spin', 'knight_dash'], seed: 11 },
  a2: { ci: 1, cls: 'mage', floor: 44, sk: ['mage_meteor', 'mage_chain'], seed: 22 },
  a3: { ci: 2, cls: 'archer', floor: 74, sk: ['archer_rain', 'archer_blast'], seed: 33 },
  a4: { ci: 0, cls: 'knight', floor: 120, sk: ['knight_quake', 'knight_spin'], seed: 44, boss: true },
}[seg];
if (!SEG) { console.error('토막 이름: a1 a2 a3 a4'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H }, locale: 'en-US' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((seed) => {
    let s = seed >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    try { localStorage.clear(); } catch (e) {}
    window.__t = 0; performance.now = () => window.__t; const RD = Date; RD.now = () => 1767225600000 + window.__t;
    const TQ = []; let tid = 1;
    window.setTimeout = (fn, ms) => { const id = tid++; TQ.push({ id, at: window.__t + (+ms || 0), fn }); return id; };
    window.setInterval = (fn, ms) => { const id = tid++; TQ.push({ id, at: window.__t + Math.max(4, +ms || 0), ms: Math.max(4, +ms || 0), fn, rep: 1 }); return id; };
    window.clearTimeout = window.clearInterval = (id) => { const i = TQ.findIndex(x => x.id === id); if (i >= 0) TQ.splice(i, 1); };
    const flush = () => { for (let g = 0; g < 50; g++) { const due = TQ.filter(x => x.at <= window.__t); if (!due.length) break;
      for (const x of due) { const i = TQ.indexOf(x); if (i < 0) continue; if (x.rep) x.at += x.ms; else TQ.splice(i, 1); try { typeof x.fn === 'function' ? x.fn() : 0; } catch (e) {} } } };
    const RQ = []; window.requestAnimationFrame = (cb) => { RQ.push(cb); return RQ.length; }; window.cancelAnimationFrame = () => {};
    window.__vf = (ms) => { window.__t += ms; flush(); const q = RQ.splice(0); for (const cb of q) { try { cb(window.__t); } catch (e) { (window.__ve = window.__ve || []).push(String(e)); } } };
  }, SEG.seed);
  await p.goto(`http://localhost:${port}/index.html?tut=0&f60=0&qauto=0&amb=0&pxh=${Math.round(H / 3)}`, { timeout: 240000 });
  await p.waitForFunction(() => typeof quickStartDungeon === 'function', null, { timeout: 120000 });
  await p.evaluate(() => { for (let i = 0; i < 120; i++) window.__vf(1000 / 60); });
  await p.evaluate((ci) => document.querySelectorAll('#charChoices > *')[ci].click(), SEG.ci);
  await p.evaluate(() => { for (let i = 0; i < 30; i++) window.__vf(1000 / 60); });
  await p.addScriptTag({ path: __dirname + '/../../../../viewers/playbot/bot.js' });
  const info = await p.evaluate((S) => {
    if (S.floor >= 31) startRunAtFloorReset(S.floor); else { player.floor = S.floor; startFloor(); }
    meta.skills = meta.skills || {}; meta.skills.owned = S.sk.slice(); meta.skills.equipped = meta.skills.equipped || {}; meta.skills.equipped[selectedChar] = S.sk.slice();
    if (typeof refreshSkillButtons === 'function') refreshSkillButtons();
    player.atk = Math.round(player.atk * 1.5); window.damagePlayer = function () {}; player.alive = true;
    // 가장 적이 많은 방(시작 방 제외 · 보스 층이면 보스 방) 가운데 가까이로
    const T = TILE, rooms = dungeon.rooms; let best = null, bn = -1;
    for (const r of rooms.slice(1)) { const cx = (r.cx - MAP_W / 2) * T, cz = (r.cy - MAP_H / 2) * T;
      const n = enemies.filter(e => !e.isDead && Math.hypot(e.obj.position.x - cx, e.obj.position.z - cz) < Math.max(r.w, r.h) * T * 0.6).length + (S.boss && enemies.some(e => e.isBoss && Math.hypot(e.obj.position.x - cx, e.obj.position.z - cz) < 12) ? 99 : 0);
      if (n > bn) { bn = n; best = { cx, cz }; } }
    // 방 가운데에서 카메라 쪽(+x+z)으로 2.5 — 적이 화면 위쪽에 모인다
    let px = best.cx + 2.5, pz = best.cz + 2.5;
    if (wallOverlapAt && wallOverlapAt(px, pz, 0.6)) { px = best.cx; pz = best.cz; }
    player.obj.position.x = px; player.obj.position.z = pz;
    if (typeof groundHeightAt === 'function') player.obj.position.y = groundHeightAt(px, pz);
    for (const e of enemies) if (Math.hypot(e.obj.position.x - px, e.obj.position.z - pz) < 14) e.awake = true;
    window.__botInit({ endFloor: 999, floorCap: 9999 });
    const hide = document.createElement('style'); hide.textContent = '#tipBar,#toast,.toast{display:none!important} *{cursor:none!important}'; document.head.appendChild(hide);
    camera.fov *= 0.72; camera.updateProjectionMatrix();
    return { bn, lv: player.lv, n: enemies.length };
  }, SEG);
  // 카메라가 따라붙고 싸움이 붙도록 0.6초 먼저 돌린다(안 찍음)
  const step = async (cap, i) => p.evaluate(([S, i]) => {
    if (window.__botStep) window.__botStep(1 / 30);
    if (i % 42 === 0 || i % 42 === 21) { const k = (i / 21 | 0) % 2; player.skillCd[k] = 0;
      if (enemies.some(e => !e.isDead && e.awake && Math.hypot(e.obj.position.x - player.obj.position.x, e.obj.position.z - player.obj.position.z) < 7)) useSkill(k); }
    player.hp = player.hpMax; window.__vf(1000 / 30);
  }, [SEG, i]);
  for (let i = 0; i < 18; i++) await step(false, i);
  const t0 = Date.now();
  for (let i = 0; i < NF; i++) {
    await step(true, i + 18);
    await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 93 });
    if (i % 30 === 0) console.log(seg, i, ((Date.now() - t0) / 1000 | 0) + 's');
  }
  const ve = await p.evaluate(() => (window.__ve || []).slice(0, 3));
  console.log('done', seg, JSON.stringify(info), 'errs', errs.slice(0, 3), ve);
  await b.close();
})();
