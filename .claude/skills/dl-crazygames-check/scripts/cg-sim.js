#!/usr/bin/env node
// dl-crazygames-check · CrazyGames 환경 흉내(가짜 SDK v3) 실행 점검
//
//   node .claude/skills/dl-crazygames-check/scripts/cg-sim.js [옵션]
//
//   --port 8899          서버 포트(먼저 dl-harness 의 serve.sh — 저장소 루트에서 띄운다)
//   --vp 907x510         뷰포트(CrazyGames 창 모드 iframe 크기 · 1216x684 · 1077x606 · 821x462 · 모바일 800x450)
//   --touch              터치 기기로(hasTouch + isMobile + 안드로이드 UA → 게임의 isTouchDevice 가 참)
//   --cpu 4              CPU 감속 배수(CDP Emulation.setCPUThrottlingRate) — 저사양·크롬북 흉내. 1 = 감속 없음
//   --mbps 0             내려받기 속도 제한(Mbps, CDP). 0 = 제한 없음(로컬 서버라 전송 시간이 거의 0)
//   --webgl1             WebGL2 를 끈다(getContext('webgl2') → null — 크롬 --disable-es3-apis 는 swiftshader 에서 안 먹었다) — WebGL1 폴백 부팅 확인
//   --ad error|finish    가짜 광고 결과. error = Basic Launch 처럼 바로 adError('adsDisabledBasicLaunch')(기본)
//                        finish = 0.3초 뒤 adStarted → --ad-ms 뒤 adFinished
//   --ad-ms 1500         finish 모드 광고 길이
//   --env crazygames     SDK.environment(crazygames | local | disabled)
//   --locale en-US       SDK.user.systemInfo.locale
//   --query "&x=0"       URL 플래그(앞의 & ? 는 있어도 없어도)
//   --fps-sec 4          던전 1층에서 실제 rAF 로 프레임을 세는 시간(0 = 안 잼)
//   --timeout 300000 · --quiet
//
// 하는 일(순서대로):
//   ① addInitScript 로 window.CrazyGames.SDK 를 가짜로 심고(진짜 SDK 요청은 막는다) 모든 호출을 시각과 함께 기록
//   ② 페이지 열기 → 로딩 끝(loadingStop) 시각 · 그때까지 받은 바이트 · 콘솔 에러
//   ③ 첫 화면에서 개발자 버튼(bossTestBtn·maxLevelBtn)이 숨어 있는지
//   ④ 캐릭터 카드 1클릭 → 몇 초 안에 gameplayStart 가 오는지(Full 조건 '최대 1클릭') — 안 오면 exitTownToDungeon() 으로 1층에 넣고 다시 잰다
//   ⑤ 던전 1층 rAF 프레임 수(실제 시계 — SwiftShader 라 절대값은 의미 없고 --cpu 1 ↔ 4 · 플래그 켬/끔 비율로만 본다)
//   ⑥ 보상형 cgShowRewarded · 미드게임 cgShowMidgame 을 직접 불러 보상·진행·음소거(SFX.suspendForAd/resumeAfterAd) 시각을 광고 콜백 시각과 비교
//   ⑦ SDK 기능 사용 여부(muteAudio 리스너 · systemInfo · Data 모듈 · setGameContext · happytime)
//   ⑧ 제목 5연타로 개발자 버튼이 나오는지(숨김 제스처 — 정보)
// 출력: 사람이 읽는 줄 + 마지막 줄 'RESULT {json}'. ✗ = Basic 제출 전(P0) · ⚠ = Full 요청 전(P1)·사람이 판단 · ✓ · ·(정보)
// 종료 코드 0 = ✗ 없음 · 1 = ✗ 있음 · 2 = 인자·서버 문제.
//
// 진짜 SDK 의 동작은 sdk.crazygames.com/crazygames-sdk-v3.js(2026-10-15)를 읽고 맞췄다 — requestAd 는 아무것도 반환하지 않고
// (await 해도 바로 끝남) 결과는 콜백뿐 · Basic Launch 면 그 자리에서 adError(code 'adsDisabledBasicLaunch') · adError 가 없으면
// adFinished 를 대신 부른다 · 요청이 겹치면 adError('other'). 그 밖의 세부(postMessage 왕복 지연 등)는 흉내 내지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');

const A = { port: 8899, vp: '907x510', touch: false, cpu: 1, mbps: 0, webgl1: false, ad: 'error', adMs: 1500, env: 'crazygames',
  locale: 'en-US', query: '', fpsSec: 4, timeout: 300000, quiet: false };
const argv = process.argv.slice(2);
const need = (i) => { if (i >= argv.length) { console.error('✗ 값이 없다: ' + argv[i - 1]); process.exit(2); } return argv[i]; };
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--port') A.port = +need(++i);
  else if (k === '--vp') A.vp = need(++i);
  else if (k === '--touch') A.touch = true;
  else if (k === '--cpu') A.cpu = +need(++i);
  else if (k === '--mbps') A.mbps = +need(++i);
  else if (k === '--webgl1') A.webgl1 = true;
  else if (k === '--ad') A.ad = need(++i);
  else if (k === '--ad-ms') A.adMs = +need(++i);
  else if (k === '--env') A.env = need(++i);
  else if (k === '--locale') A.locale = need(++i);
  else if (k === '--query') A.query += need(++i).replace(/^[?&]/, '&');
  else if (k === '--fps-sec') A.fpsSec = +need(++i);
  else if (k === '--timeout') A.timeout = +need(++i);
  else if (k === '--quiet') A.quiet = true;
  else if (k === '-h' || k === '--help') {
    const L = fs.readFileSync(__filename, 'utf8').split('\n'); const end = L.findIndex((l, j) => j > 0 && !l.startsWith('//'));
    console.log(L.slice(1, end).join('\n')); process.exit(0);
  } else { console.error('✗ 모르는 인자: ' + k); process.exit(2); }
}
const m = A.vp.match(/^(\d+)x(\d+)$/);
if (!m) { console.error('✗ --vp 는 WxH'); process.exit(2); }
if (!['error', 'finish'].includes(A.ad)) { console.error('✗ --ad 는 error | finish'); process.exit(2); }
if (!(A.cpu >= 1)) { console.error('✗ --cpu 는 1 이상'); process.exit(2); }
const VP = { width: +m[1], height: +m[2] };
const URL = `http://127.0.0.1:${A.port}/index.html` + (A.query ? '?' + A.query.replace(/^&/, '') : '');
const log = (...a) => { if (!A.quiet) console.log(...a); };
const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
let NX = 0, NW = 0;
const bad = (s) => { NX++; console.log('  ✗ ' + s); };
const warn = (s) => { NW++; console.log('  ⚠ ' + s); };
const ok = (s) => console.log('  ✓ ' + s);
const info = (s) => console.log('  · ' + s);

// ---------- 서버(dl-harness 와 같은 확인 — 저장소 루트의 index.html 을 서빙하는지) ----------
function repoRoot() {
  try { return execSync('git rev-parse --show-toplevel', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (e) { return path.resolve(__dirname, '../../../..'); }
}
function fetchServed() {
  return new Promise(res => {
    const req = http.get({ host: '127.0.0.1', port: A.port, path: '/index.html', timeout: 8000 }, r => {
      const ch = []; r.on('data', c => ch.push(c));
      r.on('end', () => {
        if (r.statusCode !== 200) return res({ up: false, status: r.statusCode });
        const b = Buffer.concat(ch), v = b.toString('utf8').match(/GAME_VERSION = '(v\d+)'/);
        res({ up: true, v: v ? v[1] : null, md5: crypto.createHash('md5').update(b).digest('hex'), bytes: b.length, gz: require('zlib').gzipSync(b, { level: 9 }).length });
      });
    });
    req.on('error', () => res({ up: false })); req.on('timeout', () => { req.destroy(); res({ up: false }); });
  });
}
function loadPlaywright() {
  const tries = ['playwright'];
  try { tries.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch (e) {}
  tries.push('/opt/node22/lib/node_modules/playwright');
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('playwright 모듈을 못 찾았다(' + tries.join(' · ') + ')');
}
async function launch() {
  const { chromium } = loadPlaywright();
  const args = ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'];
  try { return await chromium.launch({ args }); }
  catch (e) {   // npm playwright ↔ 동봉 브라우저 빌드가 어긋나면 /opt/pw-browsers 동봉본(CLAUDE.md '렌더 변경을 비교할 때')
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    const base = '/opt/pw-browsers', c = [];
    for (const d of fs.readdirSync(base)) {
      if (d.startsWith('chromium_headless_shell-')) c.push(path.join(base, d, 'chrome-linux', 'headless_shell'));
      else if (d.startsWith('chromium-')) c.push(path.join(base, d, 'chrome-linux', 'chrome'));
    }
    const exe = c.filter(p => fs.existsSync(p)).sort().pop(); if (!exe) throw e;
    return await chromium.launch({ args, executablePath: exe });
  }
}

// ---------- 페이지에 부팅 전에 심는 가짜 SDK ----------
function initScript(cfg) {
  const now = () => Math.round(performance.now());
  if (cfg.webgl1) {   // three r128 은 webgl2 → webgl 순으로 묻는다
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) { if (type === 'webgl2') return null; return gc.apply(this, arguments); };
  }
  const R = window.__cg = { calls: [], dataSet: 0, dataGet: 0, sysInfo: 0, settingsRead: 0, listeners: [], bootLog: null, consoleT: {} };
  const rec = (name, extra) => { const e = Object.assign({ name, t: now() }, extra || {}); R.calls.push(e); return e; };
  const _log = console.log;
  console.log = function (...a) { if (R.bootLog === null && typeof a[0] === 'string' && a[0].startsWith('DUNGEON ')) R.bootLog = now(); return _log.apply(this, a); };
  const store = {};
  const settings = { muteAudio: false, disableChat: false };
  const sysInfo = { locale: cfg.locale, countryCode: 'US', device: { type: cfg.touch ? 'mobile' : 'desktop' }, browser: { name: 'chrome', version: '1' }, os: { name: 'linux', version: '1' }, applicationType: 'web' };
  let busy = false;
  const SDK = {
    get environment() { return cfg.env; },
    isQaTool: false,
    init: async () => { rec('init'); },
    game: {
      get settings() { R.settingsRead++; return settings; },
      addSettingsChangeListener(fn) { rec('addSettingsChangeListener'); R.listeners.push(fn); },
      removeSettingsChangeListener() {},
      loadingStart: () => rec('loadingStart'), loadingStop: () => rec('loadingStop'),
      gameplayStart: () => rec('gameplayStart'), gameplayStop: () => rec('gameplayStop'),
      happytime: () => rec('happytime'),
      setGameContext: (c) => rec('setGameContext', { c }),
      reportGameCompletedPercentage: (p) => rec('progress', { p }),
      inviteLink: () => '', showInviteButton() {}, hideInviteButton() {},
      isInstantMultiplayer: false,
    },
    ad: {
      requestAd(type, cb) {
        const c = cb || {};
        const fin = c.adFinished || (() => {}), err = c.adError || c.adFinished || (() => {}), st = c.adStarted || (() => {});
        rec('requestAd', { type, cb: Object.keys(c) });
        if (cfg.ad === 'error') { rec('adError', { type, code: 'adsDisabledBasicLaunch' }); try { err({ code: 'adsDisabledBasicLaunch', message: 'Ads are disabled during basic launch' }); } catch (e) {} return; }
        if (busy) { rec('adError', { type, code: 'other' }); try { err({ code: 'other', message: 'An ad request is already in progress' }); } catch (e) {} return; }
        busy = true;
        setTimeout(() => { rec('adStarted', { type }); SDK.ad.isAdPlaying = true; try { st(); } catch (e) {} }, 300);
        setTimeout(() => { busy = false; SDK.ad.isAdPlaying = false; rec('adFinished', { type }); try { fin(); } catch (e) {} }, 300 + cfg.adMs);
      },
      prefetchAd() {}, hasAdblock: async () => false, isAdPlaying: false,
      addAdblockPopupListener() {}, removeAdblockPopupListener() {},
    },
    banner: { requestBanner: async () => {}, requestResponsiveBanner: async () => {}, clearBanner() {}, clearAllBanners() {} },
    data: {
      getItem(k) { R.dataGet++; return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { R.dataSet++; store[k] = String(v); }, removeItem(k) { delete store[k]; }, clear() { for (const k in store) delete store[k]; },
    },
    user: {
      isUserAccountAvailable: false,
      get systemInfo() { R.sysInfo++; return sysInfo; },
      getUser: async () => null, getUserToken: async () => null, getXsollaUserToken: async () => null,
      showAuthPrompt: async () => null, showAccountLinkPrompt: async () => null, addAuthListener() {}, removeAuthListener() {},
    },
    analytics: { trackOrder() {} },
  };
  window.CrazyGames = { SDK };
}

(async () => {
  let browser = null;
  const out = { url: URL, vp: VP, touch: A.touch, cpu: A.cpu, mbps: A.mbps, webgl1: A.webgl1, ad: A.ad, env: A.env };
  try {
    const st = await fetchServed();
    if (!st.up) { console.log(st.status ? `✗ localhost:${A.port} 가 ${st.status} — 저장소 루트가 아닌 폴더를 서빙 중` : `✗ localhost:${A.port} 에 서버가 없다 — bash .claude/skills/dl-harness/scripts/serve.sh ${A.port}`); process.exit(2); }
    let repoMd5 = null, repoV = null;
    try { const b = fs.readFileSync(path.join(repoRoot(), 'index.html')); repoMd5 = crypto.createHash('md5').update(b).digest('hex'); repoV = (b.toString('utf8').match(/^const GAME_VERSION = '(v\d+)'/m) || [])[1]; } catch (e) {}
    console.log(`served GAME_VERSION = ${st.v} (저장소 = ${repoV}${repoMd5 === st.md5 ? ' · 내용 같음' : ' · ⚠ 내용 다름'}) · index.html ${(st.bytes / 1048576).toFixed(2)}MB · gzip ${(st.gz / 1048576).toFixed(2)}MB`);
    Object.assign(out, { served: st.v, bytes: st.bytes, gzip: st.gz });

    browser = await launch();
    const ctxOpt = { viewport: VP, deviceScaleFactor: 1, hasTouch: A.touch, isMobile: A.touch, locale: A.locale };
    if (A.touch) ctxOpt.userAgent = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    const ctx = await browser.newContext(ctxOpt);
    const page = await ctx.newPage();
    page.setDefaultTimeout(A.timeout);
    const cdp = await ctx.newCDPSession(page);
    if (A.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: A.cpu });
    await cdp.send('Network.enable');
    if (A.mbps > 0) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: A.mbps * 125000, uploadThroughput: A.mbps * 125000 });
    // 받은 바이트(전송 기준) — 언제까지 받았는지 페이지 시각과 맞추려고 노드 시각도 같이 둔다
    const net = []; let navWall = 0;
    cdp.on('Network.loadingFinished', e => net.push({ wall: Date.now(), bytes: e.encodedDataLength || 0 }));
    const pageErrors = [], conErr = [], blocked = [];
    await page.route('**/*', r => {
      const u = r.request().url();
      if (/^(https?:\/\/(127\.0\.0\.1|localhost)[:/]|data:|blob:)/.test(u)) return r.continue();
      blocked.push(u); return r.abort();
    });
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    page.on('console', mm => { if (mm.type() === 'error') { const t = mm.text(); if (!/ERR_FAILED|Failed to load resource|net::/i.test(t)) conErr.push(t); } });
    await page.addInitScript(initScript, { ad: A.ad, adMs: A.adMs, env: A.env, locale: A.locale, touch: A.touch, webgl1: A.webgl1 });

    // ② 부팅
    log(`· ${URL} 열기 (${VP.width}x${VP.height}${A.touch ? ' 터치' : ''} · CPU ×${A.cpu}${A.mbps ? ' · ' + A.mbps + 'Mbps' : ''}${A.webgl1 ? ' · WebGL1' : ''} · 광고 ${A.ad} · env ${A.env})`);
    navWall = Date.now();
    await page.goto(URL, { waitUntil: 'load', timeout: A.timeout });
    for (let i = 0; ; i++) {
      const s = await page.evaluate(() => ({ boot: typeof cgBootDone !== 'undefined' && cgBootDone === true, err: !!document.querySelector('#webglError, .webgl-error') }));
      if (s.boot) break;
      if (pageErrors.length && i > 20) throw new Error('부팅 중 페이지 오류: ' + pageErrors[0]);
      if (Date.now() - navWall > A.timeout) throw new Error('부팅이 안 끝난다(cgBootDone)');
      await new Promise(r => setTimeout(r, 100));
    }
    const boot = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const c = window.__cg.calls, f = (n) => { const e = c.find(x => x.name === n); return e ? e.t : null; };
      let gl = null; try { gl = renderer.capabilities.isWebGL2 ? 2 : 1; } catch (e) {}
      return { dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), bootLog: window.__cg.bootLog,
        loadingStart: f('loadingStart'), loadingStop: f('loadingStop'), gl, ver: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : null };
    });
    const bytesUntil = (pageMs) => net.filter(n => n.wall - navWall <= pageMs + 250).reduce((s, n) => s + n.bytes, 0);
    out.boot = Object.assign(boot, { bytesToLoadingStop: bytesUntil(boot.loadingStop || 0) });
    console.log(`[부팅] ${boot.ver} · WebGL${boot.gl} · DOMContentLoaded ${boot.dcl}ms · load ${boot.load}ms · 'DUNGEON' 로그 ${boot.bootLog}ms · loadingStop ${boot.loadingStop}ms · 받은 바이트 ${(out.boot.bytesToLoadingStop / 1048576).toFixed(2)}MB  (${sec()})`);
    // 게임 스크립트 끝에서 loadingStop 을 부른 뒤에도 첫 tick(셰이더 컴파일·첫 렌더)이 load 이벤트를 붙잡는다 — 첫 화면은 둘 중 늦은 쪽
    const ready = boot.loadingStop === null ? null : Math.max(boot.loadingStop, boot.load);
    out.boot.ready = ready;
    if (ready === null) bad('loadingStop 이 안 왔다');
    else if (ready > 10000) warn(`첫 화면까지 ${(ready / 1000).toFixed(1)}초 > 10초(성공작 기준 — Basic Launch 가이드 '…load in under 10 seconds'). SwiftShader 값이라 실기기에서 다시 잴 것`);
    else ok(`첫 화면까지 ${(ready / 1000).toFixed(1)}초 ≤ 10초(max(loadingStop, load) · SwiftShader · CPU ×${A.cpu} — 실기기 값이 아니다)`);
    if (A.webgl1) { if (boot.gl === 1) ok('WebGL1 로 부팅했다'); else warn('--webgl1 인데 WebGL' + boot.gl + ' — 플래그가 안 먹었다'); }

    // ③ 개발자 버튼
    const dev = await page.evaluate(() => ['bossTestBtn', 'maxLevelBtn'].map(id => { const b = document.getElementById(id); return { id, display: b ? getComputedStyle(b).display : null, visible: !!(b && b.offsetParent) }; }));
    const devQuery = /[?&](dev|adtest)=1/.test(URL);
    out.devButtons = dev;
    for (const d of dev) {
      if (d.display === null) info(`${d.id} 없음`);
      else if (devQuery) info(`${d.id} display=${d.display}(?dev=1/?adtest=1 이라 보이는 게 맞다)`);
      else if (d.visible || d.display !== 'none') bad(`${d.id} 가 일반 접속 첫 화면에 보인다(display=${d.display}) — CLAUDE.md 준수사항`);
      else ok(`${d.id} 숨김(display none)`);
    }

    // ④ 1클릭 → gameplayStart
    const clickT = await page.evaluate(() => { const el = document.querySelector('#charChoices .char-card[data-char="knight"]') || document.querySelector('#charChoices .char-card'); const t = Math.round(performance.now()); if (el) el.click(); return el ? t : null; });
    if (clickT === null) { info('캐릭터 카드가 없다(첫 화면이 바뀌었다) — 1클릭 측정 건너뜀'); }
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const id of ['startToTownBtn', 'startBtn']) { const s = document.getElementById(id); if (s && s.offsetParent) { s.click(); break; } } });
    const waitStart = async (ms) => { const e0 = Date.now(); while (Date.now() - e0 < ms) { const g = await page.evaluate(() => (window.__cg.calls.find(x => x.name === 'gameplayStart') || {}).t || null); if (g) return g; await page.waitForTimeout(200); } return null; };
    let gs = clickT === null ? null : await waitStart(Math.max(6000, 6000 * A.cpu / 2));
    const where = await page.evaluate(() => ({ inTown: typeof inTown !== 'undefined' ? inTown : null, floor: (typeof player !== 'undefined' && player) ? player.floor : null }));
    out.firstClick = { clickT, gameplayStartT: gs, inTown: where.inTown };
    if (clickT !== null) {
      if (gs && where.inTown) warn(`캐릭터 1클릭 → gameplayStart ${((gs - clickT) / 1000).toFixed(1)}초인데 아직 마을이다 — 신호만 앞당긴 것인지, 진짜 전투(1층)로 들어가는지 확인`);
      else if (gs) ok(`캐릭터 1클릭 → gameplayStart ${((gs - clickT) / 1000).toFixed(1)}초(${where.floor}층)`);
      else bad(`캐릭터 1클릭 뒤 gameplayStart 가 안 온다 — 지금 ${where.inTown ? '마을(걸어서 구덩이까지 가야 1층)' : '어딘가'}. 신규 유저는 최대 1클릭으로 게임플레이(requirements/gameplay · Full 조건)`);
    }
    if (!gs) {   // 마을을 걸어간 셈 치고 1층으로
      await page.evaluate(() => { exitTownToDungeon(); });
      gs = await waitStart(4000);
      out.firstClick.afterDungeonT = gs;
      if (gs) info(`exitTownToDungeon() 뒤 gameplayStart ${gs}ms(페이지 시각) — 1층 시작 지점에서는 불린다`);
      else bad('1층에 들어가도 gameplayStart 가 안 온다');
    }
    out.firstClick.bytesToGameplayStart = gs ? bytesUntil(gs) : null;
    if (gs) info(`처음 gameplayStart 까지 받은 바이트 ${(out.firstClick.bytesToGameplayStart / 1048576).toFixed(2)}MB(SDK 가 재는 '초기 다운로드' 구간 · 한도 50MB · 모바일 홈 20MB)`);

    // ⑤ 프레임
    if (A.fpsSec > 0) {
      const fps = await page.evaluate((T) => new Promise(res => { let n = 0; const s = performance.now(); const f = () => { n++; const d = performance.now() - s; if (d < T * 1000) requestAnimationFrame(f); else res({ fps: n / (d / 1000), ms: d / n }); }; requestAnimationFrame(f); }), A.fpsSec);
      out.fps = fps;
      info(`던전 ${where.floor || 1}층 rAF ${fps.fps.toFixed(1)}fps(${fps.ms.toFixed(0)}ms/프레임) — SwiftShader 라 절대값은 의미 없다. --cpu 1 ↔ ${A.cpu > 1 ? A.cpu : 4} 이나 플래그 켬/끔 비율로만`);
    }

    // ⑥ 광고 — 보상형·미드게임을 직접 부르고 콜백·음소거 시각을 비교
    const adRun = async (kind) => page.evaluate(async ([kind, cfg]) => {
      const R = { mute: [], reward: null, fail: null, done: null };
      const t = () => Math.round(performance.now());
      let restore = null;
      if (typeof SFX !== 'undefined' && SFX && SFX.suspendForAd) {
        const s0 = SFX.suspendForAd, r0 = SFX.resumeAfterAd;
        SFX.suspendForAd = function () { R.mute.push(['mute', t()]); return s0.apply(this, arguments); };
        SFX.resumeAfterAd = function () { R.mute.push(['unmute', t()]); return r0.apply(this, arguments); };
        restore = () => { SFX.suspendForAd = s0; SFX.resumeAfterAd = r0; };
      }
      const c0 = window.__cg.calls.length, start = t();
      try {
        if (kind === 'rewarded') cgShowRewarded(() => { R.reward = t(); }, (code) => { R.fail = [t(), String(code)]; });
        else { try { lastMidgameAt = 0; } catch (e) {} cgShowMidgame(() => { R.done = t(); }); }
      } catch (e) { R.exc = String(e); }
      await new Promise(r => setTimeout(r, (cfg.ad === 'finish' ? cfg.adMs + 300 : 0) + 900));
      if (restore) restore();
      R.calls = window.__cg.calls.slice(c0);
      R.start = start; R.available = typeof cgAdsAvailable !== 'undefined' ? cgAdsAvailable : null;
      R.muted = (typeof SFX !== 'undefined' && SFX.isAdMuted) ? SFX.isAdMuted() : null;
      return R;
    }, [kind, { ad: A.ad, adMs: A.adMs }]);
    console.log(`[광고 — 가짜 SDK '${A.ad}' 모드${A.ad === 'error' ? ': Basic Launch·광고 차단·로드 실패와 같음' : `: 0.3초 뒤 시작 · ${A.adMs}ms 광고`}]`);
    const tOf = (R, n) => { const e = R.calls.find(x => x.name === n); return e ? e.t : null; };
    for (const kind of ['rewarded', 'midgame']) {
      const R = await adRun(kind);
      out['ad_' + kind] = R;
      const req = R.calls.find(x => x.name === 'requestAd');
      const rel = (x) => x === null || x === undefined ? '-' : (x - R.start) + 'ms';
      info(`${kind}: cgAdsAvailable=${R.available} · requestAd ${req ? 'cb=[' + req.cb.join(',') + ']' : '안 부름'} · adStarted ${rel(tOf(R, 'adStarted'))} · adFinished ${rel(tOf(R, 'adFinished'))} · adError ${rel(tOf(R, 'adError'))} · ` +
        (kind === 'rewarded' ? `보상 ${rel(R.reward)} · 실패 ${R.fail ? rel(R.fail[0]) + '(' + R.fail[1] + ')' : '-'}` : `진행(onDone) ${rel(R.done)}`) +
        ` · 음소거 ${R.mute.map(([k, tt]) => k + '@' + rel(tt)).join(' ') || '없음'} · 끝난 뒤 음소거 상태 ${R.muted}`);
      if (R.exc) { bad(`${kind}: 예외 ${R.exc}`); continue; }
      if (!req) { if (R.available === false) info(`${kind}: 광고 불가로 판단해 요청 안 함(${kind === 'midgame' ? '진행은 ' + rel(R.done) : '실패 콜백 ' + (R.fail ? 'O' : 'X')})`); else warn(`${kind}: requestAd 를 안 불렀다`); continue; }
      const aS = tOf(R, 'adStarted'), aF = tOf(R, 'adFinished'), aE = tOf(R, 'adError');
      const firstMute = (R.mute.find(x => x[0] === 'mute') || [])[1], lastUnmute = (R.mute.filter(x => x[0] === 'unmute').pop() || [])[1];
      if (kind === 'rewarded') {
        if (A.ad === 'error') { if (R.reward !== null) bad('보상형: adError 인데 보상이 나갔다(규정: adError 면 보상 금지) — Basic Launch·광고 차단에서 공짜 부활·리롤·골드 2배'); else if (R.fail) ok('보상형: adError → 보상 없음 · 실패 콜백'); else warn('보상형: adError 뒤 보상도 실패 콜백도 없다(버튼이 막힌 채 남을 수 있다)'); }
        else { if (R.reward === null) bad('보상형: adFinished 인데 보상이 없다'); else if (aF !== null && R.reward < aF) bad(`보상형: 광고가 끝나기 전에 보상(${rel(R.reward)} < adFinished ${rel(aF)})`); else ok('보상형: adFinished 뒤에 보상'); }
      } else {
        if (R.done === null) bad('미드게임: 진행(onDone)이 안 불린다 — 광고 실패 때 게임이 멈출 수 있다');
        else if (A.ad === 'finish' && aF !== null && R.done < aF) bad(`미드게임: 광고가 도는 중에 진행(onDone ${rel(R.done)} < adFinished ${rel(aF)}) — 규정: adFinished/adError 까지 UI 를 막는다(Full QA)`);
        else ok('미드게임: 광고가 끝난 뒤(또는 실패 즉시) 진행');
      }
      if (A.ad === 'finish') {
        if (firstMute === undefined) bad(`${kind}: 광고 중 음소거(SFX.suspendForAd)가 없다 — CLAUDE.md 준수사항`);
        else if (aS !== null && firstMute < aS) bad(`${kind}: 음소거가 adStarted 전(${rel(firstMute)} < ${rel(aS)}) — 규정은 광고가 실제로 시작될 때`);
        else ok(`${kind}: adStarted 에 음소거`);
        if (lastUnmute === undefined || (aF !== null && lastUnmute < aF)) bad(`${kind}: 광고가 끝나기 전에 음소거를 풀었다(${rel(lastUnmute)} < adFinished ${rel(aF)}) — 광고 소리 위로 게임 소리가 난다`);
        else ok(`${kind}: adFinished 뒤 음소거 해제`);
      } else if (R.muted) bad(`${kind}: adError 뒤에도 음소거가 남아 있다`);
    }

    // ⑦ SDK 기능 사용
    const feat = await page.evaluate(() => { const R = window.__cg; const has = (n) => R.calls.filter(x => x.name === n).length; return { listeners: R.listeners.length, settingsRead: R.settingsRead, sysInfo: R.sysInfo, dataSet: R.dataSet, dataGet: R.dataGet, setGameContext: has('setGameContext'), happytime: has('happytime'), progress: has('progress'), gameplayStart: has('gameplayStart'), gameplayStop: has('gameplayStop') }; });
    out.features = feat;
    console.log('[SDK 기능 — 부팅·1클릭·1층까지]');
    (feat.listeners || feat.settingsRead) ? ok(`muteAudio: settings 읽음 ${feat.settingsRead} · 리스너 ${feat.listeners}`) : warn('muteAudio: SDK.game.settings·addSettingsChangeListener 를 안 쓴다(HTML5 Full 필수)');
    feat.sysInfo ? ok(`systemInfo 읽음 ${feat.sysInfo}번(locale)`) : bad('SDK.user.systemInfo(locale) 를 안 읽는다 — 언어는 SDK locale → 없으면 영어(requirements/gameplay)');
    (feat.dataSet || feat.dataGet) ? ok(`Data 모듈 get ${feat.dataGet} · set ${feat.dataSet}`) : warn('Data 모듈을 안 쓴다(localStorage 저장 — Full 필수 · Progress Save 토글)');
    info(`gameplayStart ${feat.gameplayStart} · gameplayStop ${feat.gameplayStop} · happytime ${feat.happytime} · setGameContext ${feat.setGameContext} · 진행도 보고 ${feat.progress}`);

    // ⑧ 숨김 제스처(정보)
    if (!devQuery) {
      const rev = await page.evaluate(() => { const h = document.querySelector('#charOverlay h1'); if (!h) return null; for (let i = 0; i < 5; i++) h.dispatchEvent(new (window.PointerEvent || Event)('pointerup', { bubbles: true })); const b = document.getElementById('bossTestBtn'); const d = b ? b.style.display : null; for (const id of ['bossTestBtn', 'maxLevelBtn']) { const x = document.getElementById(id); if (x) x.style.display = 'none'; } return d; });
      info(rev === null ? '숨김 제스처: 제목(#charOverlay h1) 없음' : `숨김 제스처: 제목 5연타 뒤 bossTestBtn display='${rev}'(''면 나타남 — 사용자용 숨김 기능 · 다시 숨겨 둠)`);
    }

    // 오류
    out.pageErrors = pageErrors; out.consoleErrors = conErr; out.blocked = [...new Set(blocked)];
    console.log('[오류]');
    pageErrors.length ? bad(`페이지 오류 ${pageErrors.length}: ${pageErrors[0].slice(0, 200)}`) : ok('페이지 오류 0');
    conErr.length ? bad(`콘솔 에러 ${conErr.length}: ${conErr[0].slice(0, 200)}`) : ok(`콘솔 에러 0 (막은 외부 요청 ${out.blocked.length}: ${out.blocked.map(u => u.replace(/^https?:\/\//, '').slice(0, 50)).join(' ')})`);
  } catch (e) {
    bad(String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log(`== 요약: ✗ ${NX} · ⚠ ${NW}  (${sec()})`);
  out.bad = NX; out.warn = NW;
  console.log('RESULT ' + JSON.stringify(out));
  process.exit(NX ? 1 : 0);
})();
