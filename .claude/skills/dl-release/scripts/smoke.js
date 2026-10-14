#!/usr/bin/env node
// dl-release · 부팅 확인(머지 전 최소 확인 — node --check 는 TDZ 같은 실행 오류를 못 잡는다)
//
// 사용:
//   node .claude/skills/dl-release/scripts/smoke.js [--port 8899] [--wait 8000] [--query '?ui2=0'] ...
//
//   --query 는 여러 번 줄 수 있다(새 플래그를 껐을 때도 뜨는지 같이 볼 때). 기본은 쿼리 없이 한 번.
//
// 하는 일:
//   1) 저장소 루트 index.html 의 GAME_VERSION 을 읽는다
//   2) localhost:<port> 서버가 그 버전을 서빙하는지 본다 — 다른 버전이면 실패
//      (CLAUDE.md '렌더 변경을 비교할 때' — 스크래치패드에서 띄운 서버가 예전 index.html 을 서빙한 사고).
//      아무것도 안 떠 있으면 저장소 루트에서 python3 -m http.server 를 직접 띄웠다가 끝나면 끈다
//   3) Playwright + 동봉 Chromium(swiftshader)으로 열어 외부 요청은 막고,
//      페이지 오류(pageerror) 0 · 콘솔 'DUNGEON vNNN' 이 index.html 버전과 같은지 본다
//      (CrazyGames SDK 처럼 외부 리소스 실패로 나는 콘솔 에러는 알려진 것으로 따로 센다)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn } = require('child_process');

const args = process.argv.slice(2);
let port = 8899, waitMs = 8000;
const queries = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') port = +args[++i];
  else if (args[i] === '--wait') waitMs = +args[++i];
  else if (args[i] === '--query') queries.push(args[++i]);
  else { console.error('모르는 인자: ' + args[i]); process.exit(2); }
}
if (!queries.length) queries.push('');

const root = execSync('git rev-parse --show-toplevel', { cwd: __dirname }).toString().trim();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vm = html.match(/^const GAME_VERSION = '(v\d+)'/m);
if (!vm) { console.error('✗ index.html 에서 GAME_VERSION 을 못 읽음'); process.exit(1); }
const want = vm[1];

function fetchVersion() {
  return new Promise(res => {
    const req = http.get({ host: '127.0.0.1', port, path: '/index.html', timeout: 5000 }, r => {
      let body = '';
      r.setEncoding('utf8');
      r.on('data', c => { body += c; });
      r.on('end', () => {
        const m = body.match(/GAME_VERSION = '(v\d+)'/);
        res({ up: true, status: r.statusCode, v: m ? m[1] : null });
      });
    });
    req.on('error', () => res({ up: false }));
    req.on('timeout', () => { req.destroy(); res({ up: false }); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadPlaywright() {
  // 로컬 node_modules → 전역(npm root -g) → 이 컨테이너의 알려진 자리 순서로 찾는다
  const tries = ['playwright'];
  try { tries.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch (e) { /* npm 없음 */ }
  tries.push('/opt/node22/lib/node_modules/playwright');
  for (const t of tries) { try { return require(t); } catch (e) { /* 다음 후보 */ } }
  throw new Error('playwright 모듈을 못 찾음(' + tries.join(' · ') + ') — npm i -g playwright 후 브라우저는 /opt/pw-browsers 동봉본을 쓴다');
}
async function launch(chromium) {
  const a = ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'];
  try {
    return await chromium.launch({ args: a });
  } catch (e) {
    // npm playwright 와 동봉 브라우저 빌드 번호가 어긋나면 executablePath 로 동봉본을 직접(CLAUDE.md)
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    const base = '/opt/pw-browsers';
    const cands = [];
    for (const d of fs.readdirSync(base)) {
      if (d.startsWith('chromium_headless_shell-')) cands.push(path.join(base, d, 'chrome-linux', 'headless_shell'));
      else if (d.startsWith('chromium-')) cands.push(path.join(base, d, 'chrome-linux', 'chrome'));
    }
    const exe = cands.filter(p => fs.existsSync(p)).sort().pop();
    if (!exe) throw e;
    console.log('  (동봉 브라우저 직접 사용: ' + exe + ')');
    return await chromium.launch({ args: a, executablePath: exe });
  }
}

(async () => {
  let server = null, fail = 0;
  try {
    let st = await fetchVersion();
    if (!st.up) {
      console.log(`  localhost:${port} 에 서버가 없어 저장소 루트에서 띄운다`);
      server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
        { cwd: root, stdio: 'ignore' });
      for (let i = 0; i < 40 && !st.up; i++) { await sleep(250); st = await fetchVersion(); }
      if (!st.up) { console.log('✗ 서버를 못 띄웠다'); process.exit(1); }
    }
    if (st.v !== want) {
      console.log(`✗ localhost:${port} 이 ${st.v} 를 서빙한다(저장소 index.html 은 ${want}) — 서버를 저장소 루트에서 다시 띄우거나 --port 로 다른 포트`);
      process.exit(1);
    }
    console.log(`✓ 서버 버전 ${st.v} = index.html`);

    const { chromium } = loadPlaywright();
    const browser = await launch(chromium);
    for (const q of queries) {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      const pageErrors = [], conErr = [], known = [];
      let booted = null;
      await page.route('**/*', r => {
        const u = r.request().url();
        if (/^(https?:\/\/(127\.0\.0\.1|localhost)[:/]|data:|blob:)/.test(u)) return r.continue();
        return r.abort();
      });
      page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
      page.on('console', m => {
        const t = m.text();
        const b = t.match(/^DUNGEON (v\d+)/);
        if (b) booted = b[1];
        if (m.type() === 'error') {
          if (/crazygames|sdk|ERR_|Failed to load resource|net::/i.test(t)) known.push(t);
          else conErr.push(t);
        }
      });
      const url = `http://127.0.0.1:${port}/index.html${q}`;
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => typeof window.requestAnimationFrame === 'function', null, { timeout: 60000 });
      await page.waitForTimeout(waitMs);
      let v = null;
      try { v = await page.evaluate('typeof GAME_VERSION === "string" ? GAME_VERSION : null'); } catch (e) { /* 부팅 실패 */ }
      const label = q || '(쿼리 없음)';
      const good = pageErrors.length === 0 && v === want && booted === want;
      console.log(`${good ? '✓' : '✗'} ${label}: GAME_VERSION ${v} · 콘솔 부팅 줄 ${booted} · 페이지 오류 ${pageErrors.length} · 콘솔 에러 ${conErr.length}(알려진 외부 리소스 ${known.length}) · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
      for (const e of pageErrors.slice(0, 8)) console.log('    pageerror: ' + e.slice(0, 300));
      for (const e of conErr.slice(0, 8)) console.log('    console.error: ' + e.slice(0, 300));
      if (!good) fail = 1;
      await page.close();
    }
    await browser.close();
  } catch (e) {
    console.log('✗ ' + (e && e.stack || e));
    fail = 1;
  } finally {
    if (server) server.kill();
  }
  console.log(fail ? '== 부팅 확인 실패 ==' : '== 부팅 확인 통과 ==');
  process.exit(fail);
})();
