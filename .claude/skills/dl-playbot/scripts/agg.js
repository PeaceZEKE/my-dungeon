#!/usr/bin/env node
// dl-playbot · 플레이 봇 결과 집계 — (조건, 막, 직업)마다 시드 평균 ± 표준오차
//
//   node .claude/skills/dl-playbot/scripts/agg.js <결과 폴더|결과 .json>… [옵션]
//     --cond a,b        이 조건만          --acts 2,3     이 막만          --class knight,mage   이 직업만
//     --base NAME       비교 기준 조건(기본: 첫 조건)                     --top N        출처 상위 N(기본 4)
//     --boss-src        보스 층 피해 출처도                               --md           마크다운 표(노션·보고용)
//     --json FILE       집계 결과를 JSON 으로도 쓴다
//
// 입력: viewers/playbot/run.js 결과 JSON — { cls, floors:[{floor,t,dmg,deaths,potions,hpMax,boss,bossT,timeout,lv0,…}],
//        hitLog:[[층, 출처, 최대체력 대비 비율]…](6000 개 상한), deaths, reason('end'|'rest'), errs, wallSec … }
//   파일 이름이 batch.sh 형식(<조건>__<직업>__f<A>-<B>__s<시드>.json)이면 조건·시드·구간을 거기서 읽는다.
//   아니면 조건 = 폴더 이름(+ 시드 뒤 _접미사), 직업 = r.cls, 시드 = 파일 이름의 마지막 숫자.
//
// 지표(일반층 = 보스 층이 아닌 층, t > 1 초 — 층 이동 직후 한 프레임짜리 기록은 뺀다):
//   사망/층 · 피해/층(층마다 잃은 체력 / 최대 체력 — 중독 등 damagePlayer 밖 피해 포함) · 피격/층(hitLog 개수 — floors[].hits 는
//   '체력이 준 프레임 수'라 중독 도트가 수천 번으로 잡힌다: CLAUDE.md '2·3막 체감 조정' 계측 함정 ①) · 층 시간 · 300초 초과 수 · 물약/층 ·
//   출처/층(일반층 피격 비율 합 / 일반층 수 · 괄호는 한 방 평균/최대) · 보스 층마다 전투 시간(bossT, 초과 제외)·사망.
// 시드 하나 = 표본 하나. ± 는 표준오차(표준편차 / √시드 수). 비교의 z = 차이 / √(SE₁² + SE₂²) — |z| < 2 면 '잡음 안'.
'use strict';
const fs = require('fs'), path = require('path');

// ── 인자 ──
const argv = process.argv.slice(2), inputs = [], opt = { top: 4 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--cond') opt.cond = argv[++i].split(',');
  else if (a === '--acts') opt.acts = argv[++i].split(',').map(Number);
  else if (a === '--class') opt.cls = argv[++i].split(',').map(c => ({ k: 'knight', m: 'mage', a: 'archer' }[c] || c));
  else if (a === '--base') opt.base = argv[++i];
  else if (a === '--top') opt.top = +argv[++i];
  else if (a === '--boss-src') opt.bossSrc = true;
  else if (a === '--md') opt.md = true;
  else if (a === '--json') opt.json = argv[++i];
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 19).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  else inputs.push(a);
}
if (!inputs.length) { console.error('사용: node agg.js <결과 폴더|json>… (--help)'); process.exit(2); }

// ── 읽기 ──
const ACT_LEN = 30, actOf = f => Math.ceil(f / ACT_LEN);
const CLS_ORDER = ['knight', 'mage', 'archer'];
const condQuery = {}, condOrder = [], warns = [];
const addCond = c => { if (!condOrder.includes(c)) condOrder.push(c); };
const NAME_RE = /^([A-Za-z0-9_-]+)__(knight|mage|archer)__f(\d+)-(\d+)__s(\d+)\.json$/;
const files = [];
for (const inp of inputs) {
  if (!fs.existsSync(inp)) { warns.push('없음: ' + inp); continue; }
  if (fs.statSync(inp).isDirectory()) {
    const tsv = path.join(inp, 'conds.tsv');
    if (fs.existsSync(tsv)) for (const l of fs.readFileSync(tsv, 'utf8').split('\n')) { if (!l.trim()) continue; const [n, q, m] = l.split('\t'); condQuery[n] = (q || '') + (m ? ' · 용병 ' + m : ''); addCond(n); }
    const d = fs.existsSync(path.join(inp, 'runs')) ? path.join(inp, 'runs') : inp;
    for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.json')) files.push(path.join(d, f));
  } else files.push(inp);
}
const runs = [];
for (const f of files) {
  let r; try { r = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { warns.push('JSON 아님: ' + f); continue; }
  if (!r || !Array.isArray(r.floors)) continue;
  const base = path.basename(f), m = base.match(NAME_RE);
  let cond, cls, seed, fa = 1, fb = 120;
  if (m) { cond = m[1]; cls = m[2]; fa = +m[3]; fb = +m[4]; seed = m[5]; }
  else {
    const dir = path.basename(path.dirname(f)) === 'runs' ? path.basename(path.dirname(path.dirname(f))) : path.basename(path.dirname(f));
    const mm = base.match(/_(\d+)(?:_([A-Za-z][A-Za-z0-9-]*))?\.json$/) || base.match(/(\d+)()\.json$/);   // k2_777.json · k4_777_new2.json
    seed = mm ? mm[1] : base; cond = dir + (mm && mm[2] ? ':' + mm[2] : ''); cls = r.cls;
  }
  if (opt.cond && !opt.cond.includes(cond)) continue;
  if (opt.cls && !opt.cls.includes(cls)) continue;
  addCond(cond);
  runs.push({ f, cond, cls, seed, fa, fb, r });
}
if (!runs.length) { console.error('결과가 없다' + (warns.length ? ' — ' + warns.join(' · ') : '')); process.exit(1); }

// ── 묶기 ──
const G = new Map();
const grp = (cond, act, cls) => {
  const k = cond + '|' + act + '|' + cls;
  if (!G.has(k)) G.set(k, { cond, act, cls, seeds: [], d: [], h: [], hits: [], t: [], to: [], pot: [], nmob: [], lvEnd: [], src: {}, per: {}, bsrc: {}, bper: {}, boss: {}, bossT: [], bossD: [] });
  return G.get(k);
};
for (const R of runs) {
  const { r } = R;
  if (r.errs && r.errs.length) warns.push(`${path.basename(R.f)}: 페이지 오류 ${r.errs.length} — ${String(r.errs[0]).slice(0, 120)}`);
  if (r.reason && r.reason !== 'end' && r.reason !== 'rest') warns.push(`${path.basename(R.f)}: 끝난 이유 '${r.reason}'`);
  const trunc = r.hitLog && r.hitLog.length >= 6000;
  if (trunc) warns.push(`${path.basename(R.f)}: hitLog 6000 개 상한에 걸림 — 뒤쪽 층 피격/출처가 빠졌다(피해/층·사망은 정확)`);
  const fl = r.floors.filter(x => x.t > 1 && x.floor >= R.fa && x.floor <= R.fb);
  const acts = [...new Set(fl.map(x => actOf(x.floor)))];
  for (const act of acts) {
    if (opt.acts && !opt.acts.includes(act)) continue;
    const A = fl.filter(x => actOf(x.floor) === act), mob = A.filter(x => !x.boss), bos = A.filter(x => x.boss);
    const g = grp(R.cond, act, R.cls); g.seeds.push(R.seed); g.lvEnd.push(A[A.length - 1].lv0);
    if (mob.length) {
      const n = mob.length, mf = new Set(mob.map(x => x.floor));
      g.nmob.push(n);
      g.d.push(mob.reduce((s, x) => s + x.deaths, 0) / n);
      g.h.push(mob.reduce((s, x) => s + x.dmg / x.hpMax, 0) / n * 100);
      g.t.push(mob.reduce((s, x) => s + x.t, 0) / n);
      g.to.push(mob.filter(x => x.timeout).length);
      g.pot.push(mob.reduce((s, x) => s + (x.potions || 0), 0) / n);
      const hl = (r.hitLog || []).filter(h => mf.has(h[0]));
      g.hits.push(hl.length / n);
      const src = {};
      for (const [, k, v] of hl) { src[k] = (src[k] || 0) + v / n; (g.per[k] = g.per[k] || []).push(v); }
      for (const [k, v] of Object.entries(src)) (g.src[k] = g.src[k] || []).push(v);
      g.src.__n = (g.src.__n || 0) + 1;
    }
    if (bos.length) {
      const bt = [], bd = [];
      for (const b of bos) {
        const B = (g.boss[b.floor] = g.boss[b.floor] || { t: [], d: [], dmg: [], to: 0, n: 0 });
        B.n++; B.d.push(b.deaths); B.dmg.push(b.dmg / b.hpMax * 100); bd.push(b.deaths);
        if (b.timeout) B.to++; else { B.t.push(b.bossT); bt.push(b.bossT); }
        if (opt.bossSrc) for (const [fn, k, v] of (r.hitLog || [])) if (fn === b.floor) { g.bsrc[k] = (g.bsrc[k] || 0) + v; (g.bper[k] = g.bper[k] || []).push(v); }
      }
      if (bt.length) g.bossT.push(bt.reduce((s, x) => s + x, 0) / bt.length);
      g.bossD.push(bd.reduce((s, x) => s + x, 0) / bd.length);
      g.bossFloorsSeen = (g.bossFloorsSeen || 0) + bos.length;
    }
  }
}

// ── 통계 ──
const ms = a => { const n = a.length; if (!n) return { m: NaN, se: NaN, n: 0 }; const m = a.reduce((s, x) => s + x, 0) / n; const sd = n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : NaN; return { m, se: sd / Math.sqrt(n), n }; };
const fx = (v, d) => Number.isFinite(v) ? v.toFixed(d) : '-';
const pm = (s, d = 2, unit = '') => `${fx(s.m, d)}${Number.isFinite(s.se) ? '±' + fx(s.se, d) : ''}${unit}`;
const topSrc = (g, nTop) => {
  const nS = g.src.__n || 0; if (!nS) return [];
  return Object.entries(g.src).filter(([k]) => k !== '__n').map(([k, arr]) => [k, arr.reduce((s, x) => s + x, 0) / nS])
    .sort((a, b) => b[1] - a[1]).slice(0, nTop)
    .map(([k, v]) => { const p = g.per[k]; return { k, pctPerFloor: v * 100, avgHit: p.reduce((s, x) => s + x, 0) / p.length * 100, maxHit: Math.max(...p) * 100 }; });
};
const summ = g => ({
  cond: g.cond, act: g.act, cls: g.cls, seeds: g.seeds, nMobFloorsPerSeed: ms(g.nmob).m,
  deathsPF: ms(g.d), dmgPF: ms(g.h), hitsPF: ms(g.hits), floorSec: ms(g.t), timeouts: ms(g.to), potionsPF: ms(g.pot), lvEnd: ms(g.lvEnd),
  bossSec: ms(g.bossT), bossDeaths: ms(g.bossD),
  bossFloors: Object.entries(g.boss).map(([fl, B]) => ({ floor: +fl, sec: ms(B.t), deaths: ms(B.d), dmgPct: ms(B.dmg), timeouts: B.to, n: B.n })),
  top: topSrc(g, opt.top),
  bossTop: opt.bossSrc ? Object.entries(g.bsrc).sort((a, b) => b[1] - a[1]).slice(0, opt.top).map(([k, v]) => ({ k, pctPerSeed: v / Math.max(1, g.bossD.length) * 100, avgHit: g.bper[k].reduce((s, x) => s + x, 0) / g.bper[k].length * 100 })) : [],
});
const S = [...G.values()].map(summ).sort((a, b) =>
  condOrder.indexOf(a.cond) - condOrder.indexOf(b.cond) || a.act - b.act || CLS_ORDER.indexOf(a.cls) - CLS_ORDER.indexOf(b.cls));
const conds = condOrder.filter(c => S.some(s => s.cond === c));

// ── 출력 ──
const srcTxt = s => s.top.map(t => `${t.k} ${fx(t.pctPerFloor, 0)}%(${fx(t.avgHit, 0)}/${fx(t.maxHit, 0)})`).join(', ');
const bossTxt = s => s.bossFloors.map(b => `${b.floor}층 ${b.sec.n ? pm(b.sec, 0, 's') : '-'}${b.timeouts ? `(초과 ${b.timeouts}/${b.n})` : ''} 사망 ${fx(b.deaths.m, 1)}`).join(' · ');
// 비교: 기준 조건 대비 차이와 z. 시드가 2 개 미만인 쪽이 있으면 표준오차가 없어 z 를 안 낸다(한쪽 SE 만으로 낸 z 는 부풀려진다)
const base = conds.length > 1 ? (opt.base && conds.includes(opt.base) ? opt.base : conds[0]) : null;
const dz = (a, b, d, unit) => {
  if (!a.n || !b.n) return '-';
  const diff = b.m - a.m, se = Math.sqrt(a.se ** 2 + b.se ** 2), z = a.n > 1 && b.n > 1 && se > 0 ? diff / se : NaN;
  return `${diff >= 0 ? '+' : ''}${fx(diff, d)}${unit} (z ${fx(z, 1)}${Number.isFinite(z) && Math.abs(z) < 2 ? ' 잡음 안' : ''})`;
};
const cmpRows = [];
if (base) for (const c of conds.filter(x => x !== base)) for (const s of S.filter(x => x.cond === c)) {
  const b = S.find(x => x.cond === base && x.act === s.act && x.cls === s.cls); if (!b) continue;
  const ub = [...new Set(b.seeds)], us = [...new Set(s.seeds)];
  cmpRows.push({ c, s, b, nb: ub.length, ns: us.length, shared: us.filter(x => ub.includes(x)).length });
}
const nSeed = s => new Set(s.seeds).size;
if (opt.md) {
  console.log('| 조건 | 막 | 직업 | 시드 | 일반층 사망/층 | 피해/층 | 피격/층 | 층 시간 | 초과 | 보스전 | 보스 사망 | 상위 출처(층당 %, 한 방 평균/최대) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of S) console.log(`| ${s.cond}${condQuery[s.cond] ? ` \`${condQuery[s.cond]}\`` : ''} | ${s.act} | ${s.cls} | ${nSeed(s)}${nSeed(s) < 8 ? ' ⚠' : ''} | ${pm(s.deathsPF)} | ${pm(s.dmgPF, 0, '%')} | ${pm(s.hitsPF, 1)} | ${fx(s.floorSec.m, 0)}s | ${fx(s.timeouts.m, 1)} | ${s.bossSec.n ? pm(s.bossSec, 0, 's') : '-'} | ${s.bossDeaths.n ? pm(s.bossDeaths, 1) : '-'} | ${srcTxt(s) || '-'} |`);
  if (S.some(s => nSeed(s) < 8)) console.log('\n⚠ 시드 8 미만 — 판단 보류');
  if (cmpRows.length) {
    console.log(`\n비교(기준 ${base}) — z = 차이/√(SE₁²+SE₂²), |z| < 2 는 잡음 안\n`);
    console.log('| 막 | 직업 | 비교 | 사망/층 | 피해/층 | 보스전 | 보스 사망 | 시드(공통) |');
    console.log('|---|---|---|---|---|---|---|---|');
    for (const R of cmpRows) console.log(`| ${R.s.act} | ${R.s.cls} | ${R.c}−${base} | ${dz(R.b.deathsPF, R.s.deathsPF, 2, '')} | ${dz(R.b.dmgPF, R.s.dmgPF, 0, '%p')} | ${dz(R.b.bossSec, R.s.bossSec, 0, 's')} | ${dz(R.b.bossDeaths, R.s.bossDeaths, 1, '')} | ${R.nb}/${R.ns}(${R.shared}) |`);
  }
} else {
  for (const c of conds) {
    console.log(`\n== 조건 ${c}${condQuery[c] !== undefined ? ` [${condQuery[c] || '쿼리 없음'}]` : ''} ==`);
    for (const s of S.filter(x => x.cond === c)) {
      const seeds = [...new Set(s.seeds)];
      console.log(`${s.act}막 ${s.cls} (시드 ${seeds.length}${seeds.length < 8 ? ' — 8 미만, 판단 보류' : ''} · 일반층 ${fx(s.nMobFloorsPerSeed, 1)}/시드 · 끝 lv ${fx(s.lvEnd.m, 1)})`);
      if (s.deathsPF.n) console.log(`   일반층  사망/층 ${pm(s.deathsPF)} · 피해/층 ${pm(s.dmgPF, 0, '%')} · 피격/층 ${pm(s.hitsPF, 1)} · 층 ${fx(s.floorSec.m, 0)}s · 초과 ${fx(s.timeouts.m, 1)} · 물약/층 ${fx(s.potionsPF.m, 2)}`);
      if (s.top.length) console.log(`   출처/층 ${srcTxt(s)}`);
      if (s.bossFloors.length) console.log(`   보스    ${bossTxt(s)}  | 평균 ${s.bossSec.n ? pm(s.bossSec, 0, 's') : '-'} · 사망 ${pm(s.bossDeaths, 1)}`);
      if (s.bossTop.length) console.log(`   보스 출처/시드 ${s.bossTop.map(t => `${t.k} ${fx(t.pctPerSeed, 0)}%(${fx(t.avgHit, 0)})`).join(', ')}`);
    }
  }
  if (cmpRows.length) {
    console.log(`\n== 비교 (기준 ${base}) — z = 차이/√(SE₁²+SE₂²), |z|<2 는 잡음 안 ==`);
    for (const R of cmpRows) console.log(`${R.s.act}막 ${R.s.cls}  ${R.c}−${base}: 사망/층 ${dz(R.b.deathsPF, R.s.deathsPF, 2, '')} · 피해/층 ${dz(R.b.dmgPF, R.s.dmgPF, 0, '%p')} · 보스전 ${dz(R.b.bossSec, R.s.bossSec, 0, 's')} · 보스 사망 ${dz(R.b.bossDeaths, R.s.bossDeaths, 1, '')}  [시드 ${R.nb}/${R.ns}, 공통 ${R.shared}]`);
  }
}
const wall = runs.reduce((s, R) => s + (R.r.wallSec || 0), 0);
console.log(`\n(run ${runs.length} 개 · 실제 시간 합 ${fx(wall / 60, 0)}분)`);
if (warns.length) { console.log('경고:'); for (const w of [...new Set(warns)].slice(0, 30)) console.log('  · ' + w); }
if (opt.json) { fs.writeFileSync(opt.json, JSON.stringify({ condQuery, groups: S }, null, 1)); console.log('JSON → ' + opt.json); }
