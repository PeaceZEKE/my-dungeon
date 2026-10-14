// dl-portrait · 브라우저에서 초상화 데이터·연결 확인(읽기만 — 게임을 바꾸지 않는다)
//
//   node .claude/skills/dl-portrait/scripts/check.js [--url http://localhost:8899/index.html] [--shot OUT.png] [--dialog KEY]
//
// ① window.NPC_POR_DATA 의 모든 키가 64×64 그림으로 디코드되는지(브라우저 Image 로)
// ② 게임 코드가 부르는 키(NPC_POR_KEY 값 · NPC_POR_NAME 값 · img[data-por] · dlgPortrait('cleric') · 용병 'm'+MERC_ORDER)
//    중 데이터가 없는 것(빠짐) / 데이터는 있는데 아무도 안 부르는 것(안 쓰임)
// ③ ?portrait=0 이면 npcPorSrc 가 전부 null(숨김)
// --shot: 모든 초상화를 게임과 같은 .npcPor 스타일(128px · pixelated)로 한 장에 찍는다
// --dialog KEY: 대화창(townDialog)에 그 초상화를 띄워 찍는다(<OUT 이름>_dialog.png — --shot 과 같이 쓸 것)
// 서버는 저장소 루트에서(CLAUDE.md '렌더 변경을 비교할 때' — 스크래치패드에서 띄우면 예전 index.html 이 나온다).
// playwright: 전역 설치(/opt/node22/…) 를 먼저, 없으면 NODE_PATH·로컬 node_modules 의 것
const { chromium } = (() => {
  for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright']) { try { return require(m); } catch (e) {} }
  console.error('playwright 를 못 찾았다 — NODE_PATH 를 전역 node_modules 로 두거나 npm i playwright'); process.exit(2);
})();
const fs = require('fs');
const path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('--url', 'http://localhost:8899/index.html');
const SHOT = arg('--shot', null);
const DLG = arg('--dialog', null);
const ARGS = ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'];
if (DLG && !SHOT) { console.error('--dialog 는 --shot OUT.png 와 같이 쓴다(대화창 그림은 <OUT>_dialog.png 로 저장)'); process.exit(2); }

async function launch() {
  try { return await chromium.launch({ args: ARGS }); }
  catch (e) {
    // npm playwright 와 동봉 브라우저 빌드 번호가 어긋나면 /opt/pw-browsers 의 것을 직접 가리킨다(CLAUDE.md)
    const base = '/opt/pw-browsers';
    const dir = fs.existsSync(base) && fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    const exe = dir && ['chrome-linux/chrome', 'chrome-linux64/chrome'].map(p => path.join(base, dir, p)).find(p => fs.existsSync(p));
    if (!exe) throw e;
    return chromium.launch({ args: ARGS, executablePath: exe });
  }
}

async function open(b, q) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { let s = 12345 >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; });
  await p.goto(URL + q, { timeout: 120000 });
  await p.waitForFunction(() => typeof npcPorSrc === 'function' && typeof MERC_ORDER !== 'undefined', null, { timeout: 120000 });
  return { p, errs };
}

(async () => {
  const b = await launch();
  const { p, errs } = await open(b, '');
  const r = await p.evaluate(async () => {
    const D = window.NPC_POR_DATA || {};
    const keys = Object.keys(D);
    const size = {};
    await Promise.all(keys.map(k => new Promise(res => {
      const im = new Image(); im.onload = () => { size[k] = im.naturalWidth + 'x' + im.naturalHeight; res(); };
      im.onerror = () => { size[k] = 'ERROR'; res(); }; im.src = 'data:image/png;base64,' + D[k];
    })));
    const used = {};
    const add = (k, w) => { (used[k] = used[k] || []).push(w); };
    for (const [s, k] of Object.entries(NPC_POR_KEY)) add(k, 'NPC_POR_KEY.' + s);
    for (const [n, k] of NPC_POR_NAME) add(k, 'NPC_POR_NAME ' + n);
    document.querySelectorAll('img[data-por]').forEach(im => add(im.dataset.por, 'data-por#' + (im.closest('[id]') || {}).id));
    add('cleric', "dlgPortrait('cleric')");
    for (const id of MERC_ORDER) add('m' + id, 'inn card m' + id);
    return {
      ver: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '?', keys, size,
      missing: Object.keys(used).filter(k => !D[k]).map(k => k + ' ← ' + used[k].join(', ')),
      unused: keys.filter(k => !used[k]),
      bad: keys.filter(k => size[k] !== '64x64').map(k => k + ' ' + size[k]),
      used,
    };
  });
  console.log(`버전 ${r.ver} · 초상화 ${r.keys.length}장`);
  console.log('64x64 아닌 것:', r.bad.length ? r.bad.join(' · ') : '없음');
  console.log('빠짐(부르는데 데이터 없음):', r.missing.length ? '\n  ' + r.missing.join('\n  ') : '없음');
  console.log('안 쓰임(데이터만 있음):', r.unused.length ? r.unused.join(', ') : '없음');

  if (SHOT) {
    await p.evaluate((keys) => {
      const box = document.createElement('div'); box.id = '__porSheet';
      box.style.cssText = 'position:fixed; left:0; top:0; z-index:99999; display:flex; flex-wrap:wrap; gap:10px; padding:12px; background:#0e1018; width:1240px;';
      for (const k of keys) {
        const c = document.createElement('div'); c.style.cssText = 'color:#e8e2d4; font:12px monospace; text-align:center;';
        const im = document.createElement('img'); im.className = 'npcPor'; im.src = npcPorSrc(k); c.appendChild(im);
        c.appendChild(document.createTextNode(k)); box.appendChild(c);
      }
      document.body.appendChild(box);
    }, r.keys);
    await p.waitForTimeout(300);
    await (await p.$('#__porSheet')).screenshot({ path: SHOT });
    console.log('시트:', SHOT);
    await p.evaluate(() => document.getElementById('__porSheet').remove());
    if (DLG) {
      await p.evaluate((k) => {
        const o = document.getElementById('townDialog'); if (o) o.classList.remove('hidden');   // 게임은 .hidden 으로 여닫는다
        const n = document.getElementById('townDialogName'); if (n) n.textContent = k;
        const t = document.getElementById('townDialogText'); if (t) t.textContent = '(dl-portrait check)';
        dlgPortrait(k);
      }, DLG);
      await p.waitForTimeout(300);
      const out = SHOT.replace(/\.png$/, '') + '_dialog.png';
      await p.screenshot({ path: out }); console.log('대화창:', out);
    }
  }

  const off = await open(b, '?portrait=0');
  const hidden = await off.p.evaluate(() => Object.keys(window.NPC_POR_DATA || {}).every(k => npcPorSrc(k) === null)
    && [...document.querySelectorAll('img[data-por]')].every(im => im.style.display === 'none'));
  console.log('?portrait=0 → 전부 숨김:', hidden);
  console.log('페이지 오류:', errs.length + off.errs.length ? errs.concat(off.errs).slice(0, 5) : 0);
  await b.close();
  process.exit(r.bad.length || r.missing.length || !hidden ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
