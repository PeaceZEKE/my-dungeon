// dl-playbot · viewers/playbot/run.js 앞에 `node -r` 로 거는 프리로드. run.js 는 고치지 않는다.
//
//   NODE_PATH=/opt/node22/lib/node_modules node -r <이 파일 절대경로> viewers/playbot/run.js …
//
// 하는 일(전부 Playwright 객체를 감싸기만 한다 — 게임·봇 동작은 그대로):
//  1. chromium.launch 가 "Executable doesn't exist" 로 죽으면 /opt/pw-browsers 의 동봉 Chromium 을 executablePath 로 다시 띄운다
//     (CLAUDE.md '렌더 변경을 비교할 때' — npm playwright 와 동봉 브라우저 빌드 번호가 어긋날 때. playwright install 받지 말 것).
//  2. 페이지 이동 제한 30초 → DL_GOTO_MS(기본 240000). 한 서버에 동시 실행이 몰리면 page.goto 가 30초에 죽는다
//     (CLAUDE.md '용병 2단계' 계측 함정 ① · playbot README v871).
//  3. DL_MERC=<spear|shield|xbow|monk> 이면 용병을 고용한 채로 돈다 — run.js 는 exitTownToDungeon() 뒤에 startRunAtFloorReset() 을 또 부르는데
//     고용이 앞에서 소모되므로(CLAUDE.md '용병 — 동료 1단계' 계측 함정) 두 함수 바로 앞에서 meta.merc 를 다시 넣는다.
//     DL_MGEAR=<0~5> 면 그 종류 장비 레벨도(meta.mercGear). 봇 결과 JSON 에 용병 지표는 없다(사망·피해만).
'use strict';
const fs = require('fs'), path = require('path');
// run.js 가 require('playwright') 로 받는 것과 '같은 모듈 객체'를 감싸야 한다 — run.js 자리에서 풀어 본다
const PLAYBOT = path.resolve(__dirname, '../../../../viewers/playbot');
let pw;
try { pw = require(require.resolve('playwright', { paths: [PLAYBOT] })); }
catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const GOTO_MS = +(process.env.DL_GOTO_MS || 240000);
const MERC = process.env.DL_MERC || '';
const MGEAR = process.env.DL_MGEAR === undefined || process.env.DL_MGEAR === '' ? null : +process.env.DL_MGEAR;

function bundledChrome() {
  const base = '/opt/pw-browsers', cands = [];
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    if (d.startsWith('chromium_headless_shell-')) cands.push(path.join(base, d, 'chrome-linux', 'headless_shell'));
    else if (d.startsWith('chromium-')) cands.push(path.join(base, d, 'chrome-linux', 'chrome'));
  }
  return cands.filter(p => fs.existsSync(p)).sort().pop() || null;
}

function wrapPage(page) {
  page.setDefaultNavigationTimeout(GOTO_MS);
  if (!MERC) return page;
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
