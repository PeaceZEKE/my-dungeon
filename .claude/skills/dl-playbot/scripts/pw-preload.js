// dl-playbot · viewers/playbot/run.js 앞에 `node -r` 로 거는 프리로드. run.js 는 고치지 않는다.
//
//   NODE_PATH=$(npm root -g) node -r <이 파일 절대경로> viewers/playbot/run.js …   (batch.sh 가 알아서 붙인다)
//
// 하는 일(전부 Playwright 객체를 감싸기만 한다 — 게임·봇 동작은 그대로):
//  1. chromium.launch 가 "Executable doesn't exist" 로 죽으면 /opt/pw-browsers 의 동봉 Chromium 을 executablePath 로 다시 띄운다
//     (CLAUDE.md '렌더 변경을 비교할 때' — npm playwright 와 동봉 브라우저 빌드 번호가 어긋날 때. playwright install 받지 말 것).
//  2. 페이지 이동 제한 30초 → DL_GOTO_MS(기본 240000). 한 서버에 동시 실행이 몰리면 page.goto 가 30초에 죽는다
//     (CLAUDE.md '용병 2단계' 계측 함정 ① · playbot README v871).
//  3. DL_MERC=<spear|shield|xbow|monk> 이면 용병을 고용한 채로 돈다 — run.js 는 exitTownToDungeon() 뒤에 startRunAtFloorReset() 을 또 부르는데
//     고용이 앞에서 소모되므로(CLAUDE.md '용병 — 동료 1단계' 계측 함정) 두 함수 바로 앞에서 meta.merc 를 다시 넣는다.
//     DL_MGEAR=<0~5> 면 그 종류 장비 레벨도(meta.mercGear). 봇 결과 JSON 에 용병 지표는 없다(사망·피해만) —
//     대신 로그에 '[dl-playbot] 용병 상태: active=true type=… gearLv=…' 한 줄을 남긴다(__botInit 직후 페이지 안에서 잰 값).
'use strict';
const fs = require('fs'), path = require('path');
// run.js 가 require('playwright') 로 받는 것과 '같은 모듈 객체'를 감싸야 한다 — run.js 자리에서 풀어 본다
const PLAYBOT = path.resolve(__dirname, '../../../../viewers/playbot');
let pw;
try { pw = require(require.resolve('playwright', { paths: [PLAYBOT] })); }   // NODE_PATH 를 따른다 — run.js 와 같은 모듈 객체
catch (e) {   // NODE_PATH 없이 불렸을 때: node 실행 파일 옆 전역 폴더(<prefix>/lib/node_modules) — run.js 도 같은 NODE_PATH 가 있어야 같은 객체다
  pw = require(path.resolve(process.execPath, '../../lib/node_modules/playwright'));
  console.error('[dl-playbot] ⚠ NODE_PATH 없이 불렸다 — run.js 가 다른 playwright 를 잡으면 프리로드가 안 걸린다(batch.sh 로 돌릴 것)');
}
const GOTO_MS = +(process.env.DL_GOTO_MS || 240000);
const MERC = process.env.DL_MERC || '';
const MGEAR = process.env.DL_MGEAR === undefined || process.env.DL_MGEAR === '' ? null : +process.env.DL_MGEAR;
// 용병 run 은 로그 첫 줄에 남긴다 — 결과 JSON 에는 용병 표시가 없어서 나중에 로그로 확인한다
if (MERC) console.error(`[dl-playbot] 용병 고용: ${MERC}${MGEAR !== null ? ' 장비 Lv' + MGEAR : ''}`);

function bundledChrome() {
  const base = '/opt/pw-browsers', cands = [];
  if (!fs.existsSync(base)) return null;
  // 폴더 배치가 playwright 판마다 다르다(chrome-linux/… · chrome-linux64/… · chrome-headless-shell-linux64/…) — 아는 것을 다 본다
  for (const d of fs.readdirSync(base)) {
    if (d.startsWith('chromium_headless_shell-')) cands.push(path.join(base, d, 'chrome-linux', 'headless_shell'), path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
    else if (d.startsWith('chromium-')) cands.push(path.join(base, d, 'chrome-linux', 'chrome'), path.join(base, d, 'chrome-linux64', 'chrome'));
  }
  return cands.filter(p => fs.existsSync(p)).sort().pop() || null;
}

function wrapPage(page) {
  page.setDefaultNavigationTimeout(GOTO_MS);
  if (!MERC) return page;
  // 페이지 안에서 확인한 용병 상태를 노드 로그로(run.js 는 페이지 콘솔을 안 옮긴다)
  page.on('console', m => { const t = m.text(); if (t.startsWith('[dl-playbot]')) console.error(t); });
  const addTag = page.addScriptTag.bind(page);
  // run.js 순서: addScriptTag(bot.js) → evaluate(exitTownToDungeon(); startRunAtFloorReset(sf); __botInit(…)) — 그 사이에 끼운다
  page.addScriptTag = async (o) => {
    const r = await addTag(o);
    await page.evaluate(([type, gear]) => {
      const hire = () => {
        meta.merc = { hired: true, type };
        if (gear !== null) { meta.mercGear = meta.mercGear || {}; meta.mercGear[type] = gear; }
      };
      for (const fn of ['exitTownToDungeon', 'startRunAtFloorReset']) {
        const orig = window[fn]; if (typeof orig !== 'function' || orig.__dlMerc) continue;
        const w = function () { hire(); return orig.apply(this, arguments); }; w.__dlMerc = true; window[fn] = w;
      }
      // __botInit(회차 시작 직후)에서 실제로 용병이 붙었는지 한 줄 남긴다 — 'active=true' 가 아니면 고용이 안 먹은 것
      const bi = window.__botInit;
      if (typeof bi === 'function' && !bi.__dlMerc) {
        const w = function () {
          const r = bi.apply(this, arguments);
          try { console.log('[dl-playbot] 용병 상태: active=' + merc.active + ' type=' + merc.type + ' gearLv=' + ((meta.mercGear || {})[merc.type] || 0)); }
          catch (e) { console.log('[dl-playbot] 용병 상태를 못 읽었다: ' + e.message); }
          return r;
        };
        w.__dlMerc = true; window.__botInit = w;
      }
    }, [MERC, MGEAR]);
    return r;
  };
  return page;
}

function wrapBrowser(b) {
  const newCtx = b.newContext.bind(b);
  b.newContext = async (...a) => {
    const ctx = await newCtx(...a);
    ctx.setDefaultNavigationTimeout(GOTO_MS);
    const newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async (...p) => wrapPage(await newPage(...p));
    return ctx;
  };
  return b;
}

const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (opts = {}) => {
  try { return wrapBrowser(await launch(opts)); }
  catch (e) {
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    const exe = bundledChrome(); if (!exe) throw e;
    console.error('[dl-playbot] 동봉 브라우저 직접 사용: ' + exe);
    return wrapBrowser(await launch(Object.assign({}, opts, { executablePath: exe })));
  }
};
