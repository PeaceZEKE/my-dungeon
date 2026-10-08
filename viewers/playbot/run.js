// node run.js <class:knight|mage|archer> <startFloor> <endFloor> <seed> <outfile> [url-query]
const { chromium } = require('playwright'); const fs = require('fs');
const [cls, sF, eF, seed, out, q] = process.argv.slice(2); const startFloor = +sF, endFloor = +eF;
const CI = { knight: 0, mage: 1, archer: 2 }[cls];
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((seed) => { let s = seed >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; window.__t = 0; performance.now = () => window.__t; Date.now = () => 1767225600000 + window.__t;
    // 타이머를 게임 시계로: 보상 카드(처치 0.6초 뒤)·토스트 같은 setTimeout 이 실제 시계를 타면 회차마다 결과가 달라진다
    const Q = []; let tid = 1; window.setTimeout = (fn, ms) => { const id = tid++; Q.push({ id, at: window.__t + (ms || 0), fn }); return id; }; window.clearTimeout = (id) => { const i = Q.findIndex(q => q.id === id); if (i >= 0) Q.splice(i, 1); };
    window.__flushTimers = () => { for (let g = 0; g < 50; g++) { const due = Q.filter(q => q.at <= window.__t); if (!due.length) break; for (const q of due) { const i = Q.indexOf(q); if (i >= 0) Q.splice(i, 1); try { q.fn(); } catch (e) {} } } }; }, +seed);
  await p.goto('http://localhost:8899/index.html?tut=0&hitfx=0&amb=0&bgm2=0' + (q || ''));
  await p.waitForFunction(() => typeof exitTownToDungeon === 'function', null, { timeout: 60000 });
  await p.evaluate(() => { window.__t += 2000; window.__flushTimers(); });
  await p.evaluate((i) => { localStorage.clear(); document.querySelectorAll('#charChoices > *')[i].click(); }, CI);
  await p.evaluate(() => { window.__t += 1500; window.__flushTimers(); for (const id of ['startToTownBtn', 'startBtn']) { const s = document.getElementById(id); if (s && s.offsetParent) { s.click(); break; } } });
  await p.evaluate(() => { window.__t += 2500; window.__flushTimers(); });
  await p.addScriptTag({ path: __dirname + '/bot.js' });
  await p.evaluate(([sf, ef]) => { window.requestAnimationFrame = () => 0; exitTownToDungeon(); if (sf > 1) startRunAtFloorReset(sf); window.__botInit({ endFloor: ef, floorCap: 300 }); }, [startFloor, endFloor]);
  const t0 = Date.now(); let st;
  for (let k = 0; k < 100000; k++) {
    st = await p.evaluate(() => window.__botRun(600));
    if (k % 10 === 0) console.log(cls, JSON.stringify(st), ((Date.now() - t0) / 1000 | 0) + 's');
    if (st.done) break;
  }
  const res = await p.evaluate(() => ({ cls: selectedChar, floors: window.__bot.floors.map(f => Object.assign({}, f, { kills: player.kills })), deaths: window.__bot.deaths, dmgBy: window.__bot.dmgBy, hitsBy: window.__bot.hitsBy, hitLog: window.__bot.hitLog, t: window.__bot.t, lv: player.lv, hpMax: player.hpMax, atk: player.atk, reason: window.__bot.reason }));
  res.errs = errs.slice(0, 5); res.wallSec = (Date.now() - t0) / 1000;
  fs.writeFileSync(out, JSON.stringify(res, null, 1)); console.log('saved', out, 'floors', res.floors.length, 'deaths', res.deaths, 'errs', res.errs);
  await b.close();
})();
