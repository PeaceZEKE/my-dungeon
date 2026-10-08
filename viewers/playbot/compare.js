const fs = require('fs');
const stat = f => { if (!fs.existsSync(f)) return null; const r = JSON.parse(fs.readFileSync(f, 'utf8')); const fl = r.floors.filter(x => x.t > 1); const n = fl.length;
  const hits = r.hitLog.length, avgHit = hits ? r.hitLog.reduce((s, x) => s + x[2], 0) / hits : 0, maxHit = hits ? Math.max(...r.hitLog.map(x => x[2])) : 0;
  const big = r.hitLog.filter(x => x[2] >= 0.35).length;
  const proj = r.hitLog.filter(x => x[1] === 'projectile' || x[1] === 'undefined' || x[1] === 'wraith' || x[1] === 'courtmage' || x[1] === 'stingwasp' || x[1] === 'goblin' || x[1] === 'skeleton' || x[1] === 'orc');
  const bosses = fl.filter(x => x.boss).map(x => `${x.floor}층 ${x.bossT | 0}s/사망${x.deaths}`).join(' ');
  return { n, deathsPF: (fl.reduce((s, x) => s + x.deaths, 0) / n).toFixed(2), dmgPF: (fl.reduce((s, x) => s + x.dmg / x.hpMax, 0) / n * 100).toFixed(0) + '%', hitsPF: (hits / n).toFixed(1), avgHit: (avgHit * 100).toFixed(0) + '%', maxHit: (maxHit * 100).toFixed(0) + '%', big35: big, timePF: (fl.reduce((s, x) => s + x.t, 0) / n).toFixed(0) + 's', timeouts: fl.filter(x => x.timeout).length, bosses, lv: `${fl[0].lv0}→${r.lv}` }; };
const rows = [];
for (const c of ['k', 'm', 'a']) for (const seed of ['777', '4242']) for (const act of [1, 2, 3]) {
  const a = stat(`out/${c}${act}_${seed}.json`), b = stat(`out/${c}${act}_${seed}_new.json`);
  if (!a && !b) continue;
  const fmt = (s) => s ? `사망/층 ${s.deathsPF} · 피해/층 ${s.dmgPF} · 피격/층 ${s.hitsPF} · 한방 평균 ${s.avgHit} 최대 ${s.maxHit} · 35%↑ ${s.big35}회 · 층 ${s.timePF} · 초과 ${s.timeouts} · ${s.lv} · 보스 ${s.bosses}` : '-';
  console.log(`${c}${act} seed ${seed}\n  전: ${fmt(a)}\n  후: ${fmt(b)}`);
}
