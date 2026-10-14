#!/usr/bin/env node
// dl-harness · Dungeon Legion 재사용 Playwright 하네스
//
//   node .claude/skills/dl-harness/scripts/harness.js [옵션]
//
//   --port 8899              서버 포트(먼저 scripts/serve.sh 로 띄울 것)
//   --url-flags "&x=0&y=1"   URL 플래그(앞의 & 나 ? 는 있어도 없어도 된다)
//   --viewport 960x540       WxH · mobile(844x390 터치) · mobile-portrait(390x844 터치)
//   --dpr 1                  devicePixelRatio
//   --char knight            knight | mage | archer (캐릭터 카드 클릭으로 고른다)
//   --floor N                마을 → 던전 입장(1층) → player.floor = N; startFloor()
//   --reset                  위 대신 startRunAtFloorReset(N)(막 시작 레벨·체력으로)
//   --seed N                 addInitScript 에서 Math.random 을 LCG 로 고정(부팅 전에 건다)
//   --setup "식"             층에 들어간 뒤(없으면 마을에서) --steps 보다 먼저 평가(상태 꾸미기 — 여러 번 · 준 순서대로)
//   --setup-file 파일.js     같은 것을 파일로
//   --steps K                메인 루프의 던전 분기를 K 번(1/60 씩) — 렌더·HUD(ui2)·음악만 뺀다. 히트스톱·보스 슬로모·
//                            120층 낙하·막 전환 글·온보딩·스토리·콤보·레벨업 이펙트는 메인 루프처럼 돈다. 마을이면 updateTownMode
//   --horror                 --steps·--hash 에서 updateHorror 까지 돈다(어둠·저체력·횃불·눈 유니폼은 이게 매 프레임 넣는다 —
//                            안 돌리면 ?dark= 같은 플래그가 화면에 안 나온다. CLAUDE.md 의 'updateHorror 까지' 측정)
//   --frames K               진짜 메인 루프(tick)를 K 프레임 돌린다(렌더 포함 — 느리다)
//   --hash                   rAF 를 멈춘 상태에서 renderWithPost(지금 씬) 한 번 → 캔버스 픽셀 FNV-1a 해시(페이지 안에서)
//   --shots out/prefix       out/prefix-town.png · out/prefix-dungeon.png(또는 -rest.png)
//   --eval "식"              페이지 전역에서 평가해 JSON 으로 출력(여러 번 줄 수 있다 · Promise 는 기다린다)
//   --eval-file 파일.js      파일 내용(식 하나 — 보통 IIFE)을 같은 식으로. --eval 과 섞어 준 순서대로 돈다
//                            (--eval 은 --steps·--frames·--hash 뒤에 돈다. 그 사이에 시간을 더 흘리려면 식 안에서
//                             __dlSteps(K, horror) · __dlFrames(K) · __dlHash(horror) — 페이지에 하네스가 심어 둔 도우미)
//   --expect v897            서빙 버전이 다르면 실패
//   --realtime               시계·rAF·타이머를 실제 것으로 둔다(결정성 없음 — 눈으로 볼 때만)
//   --locale ko-KR · --timeout 240000 · --quiet
//
// 결정성(CLAUDE.md '렌더 변경을 비교할 때' · '계측 대조군이 0이 안 나오면 시계부터 의심할 것'):
//   addInitScript 에서 performance.now / Date.now / new Date() 를 게임 시계(window.__t)로,
//   requestAnimationFrame 을 수동 큐로, setTimeout/setInterval 을 게임 시계 큐로 바꾼다.
//   그래서 실제 시간이 얼마나 흐르든(rAF 스로틀링 포함) 같은 시드·같은 빌드는 같은 결과가 난다.
//   메인 루프는 --frames 와 던전 스크린샷 직전 2프레임에만 수동으로 돈다(마을 스크린샷·--hash 는 그리기만).
//   하네스가 끼워 넣는 렌더는 그동안 Math.random 을 따로 된 LCG 로 바꿔 끼운다 — 씬 첫 렌더에 three 가 내부 객체를
//   지연 생성하며 난수를 먹어(마을 실측 8개) --shots 유무로 층 배치가 달라졌다.
//
// 출력: 사람이 읽는 줄 + 마지막에 'RESULT {json}' 한 줄. 페이지 오류·알 수 없는 콘솔 에러·eval 예외가 있으면 종료 코드 1,
//       인자/서버 문제는 2.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

// ---------- 인자 ----------
const A = { port: 8899, flags: '', viewport: '960x540', dpr: 1, char: 'knight', floor: null, reset: false, seed: null,
  steps: 0, frames: 0, horror: false, hash: false, shots: null, evals: [], setups: [], expect: null, realtime: false, locale: 'ko-KR', timeout: 240000, quiet: false };
const argv = process.argv.slice(2);
function need(i) { if (i >= argv.length) { console.error('✗ 값이 없다: ' + argv[i - 1]); process.exit(2); } return argv[i]; }
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--port') A.port = +need(++i);
  else if (k === '--url-flags') A.flags = need(++i);
  else if (k === '--viewport') A.viewport = need(++i);
  else if (k === '--dpr') A.dpr = +need(++i);
  else if (k === '--char') A.char = need(++i);
  else if (k === '--floor') A.floor = +need(++i);
  else if (k === '--reset') A.reset = true;
  else if (k === '--seed') A.seed = +need(++i);
  else if (k === '--steps') A.steps = +need(++i);
  else if (k === '--frames') A.frames = +need(++i);
  else if (k === '--horror') A.horror = true;
  else if (k === '--hash') A.hash = true;
  else if (k === '--shots') A.shots = need(++i);
  else if (k === '--eval') { const v = need(++i); A.evals.push({ src: v, label: v }); }
  else if (k === '--eval-file') { const f = need(++i); A.evals.push({ src: fs.readFileSync(f, 'utf8'), label: path.basename(f) }); }
  else if (k === '--expect') A.expect = need(++i);
  else if (k === '--realtime') A.realtime = true;
  else if (k === '--locale') A.locale = need(++i);
  else if (k === '--timeout') A.timeout = +need(++i);
  else if (k === '--quiet') A.quiet = true;
  else if (k === '--setup') { const v = need(++i); A.setups.push({ src: v, label: v }); }
  else if (k === '--setup-file') { const f = need(++i); A.setups.push({ src: fs.readFileSync(f, 'utf8'), label: path.basename(f) }); }
  else if (k === '-h' || k === '--help') {   // 머리 주석 전체(줄 수를 박지 않는다 — 옵션을 늘리면 잘렸다)
    const L = fs.readFileSync(__filename, 'utf8').split('\n'); const end = L.findIndex((l, j) => j > 0 && !l.startsWith('//'));
    console.log(L.slice(1, end).join('\n')); process.exit(0);
  }
  else { console.error('✗ 모르는 인자: ' + k); process.exit(2); }
}
// 숫자 인자 검사 — 예전엔 --steps abc 가 조용히 0, --seed abc 가 조용히 시드 0 이 됐다
for (const [k, v, lo] of [['--port', A.port, 1], ['--dpr', A.dpr, 0.1], ['--steps', A.steps, 0], ['--frames', A.frames, 0], ['--timeout', A.timeout, 1000]]) {
  if (!Number.isFinite(v) || v < lo) { console.error(`✗ ${k} 값이 이상하다: ${v}`); process.exit(2); }
}
if (A.seed !== null && !Number.isFinite(A.seed)) { console.error('✗ --seed 는 숫자'); process.exit(2); }
if (A.realtime && A.steps > 0) { console.error('✗ --steps 는 --realtime 과 같이 못 쓴다(게임 시계 큐가 없다) — --frames 를 쓸 것'); process.exit(2); }
if (!['knight', 'mage', 'archer'].includes(A.char)) { console.error('✗ --char 는 knight|mage|archer'); process.exit(2); }
if (A.floor !== null && !(Number.isInteger(A.floor) && A.floor >= 1)) { console.error('✗ --floor 는 1 이상 정수'); process.exit(2); }
let VP, touch = false;
if (A.viewport === 'mobile') { VP = { width: 844, height: 390 }; touch = true; }
else if (A.viewport === 'mobile-portrait') { VP = { width: 390, height: 844 }; touch = true; }
else { const m = A.viewport.match(/^(\d+)x(\d+)$/); if (!m) { console.error('✗ --viewport 는 WxH | mobile | mobile-portrait'); process.exit(2); } VP = { width: +m[1], height: +m[2] }; }
const q = A.flags.replace(/^[?&]+/, '');
const URL = `http://127.0.0.1:${A.port}/index.html` + (q ? '?' + q : '');
const log = (...a) => { if (!A.quiet) console.log(...a); };
const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

// ---------- 서버 버전 ----------
function fetchVersion() {
  return new Promise(res => {
    const req = http.get({ host: '127.0.0.1', port: A.port, path: '/index.html', timeout: 8000 }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        if (r.statusCode !== 200) return res({ up: false, status: r.statusCode });   // 다른 폴더를 서빙 중(index.html 없음)
        const buf = Buffer.concat(chunks), m = buf.toString('utf8').match(/GAME_VERSION = '(v\d+)'/);
        res({ up: true, v: m ? m[1] : null, md5: require('crypto').createHash('md5').update(buf).digest('hex') });
      });
    });
    req.on('error', () => res({ up: false }));
    req.on('timeout', () => { req.destroy(); res({ up: false }); });
  });
}
function repoRoot() {
  try { return execSync('git rev-parse --show-toplevel', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (e) { return path.resolve(__dirname, '../../../..'); }   // .claude/skills/dl-harness/scripts → 저장소 루트
}
function repoVersion() {   // { v, md5 } — 버전을 올리기 전의 작업 트리 ↔ HEAD 는 버전이 같으므로 내용(md5)까지 본다
  try {
    const buf = fs.readFileSync(path.join(repoRoot(), 'index.html'));
    const m = buf.toString('utf8').match(/^const GAME_VERSION = '(v\d+)'/m);
    return { v: m ? m[1] : null, md5: require('crypto').createHash('md5').update(buf).digest('hex') };
  } catch (e) { return null; }
}

// ---------- 브라우저 ----------
// playwright 모듈 — 경로를 박아 두면 node 가 다른 곳에 깔린 환경에서 죽는다. 로컬 → 전역(npm root -g) → 예전 고정 경로 순.
function loadPlaywright() {
  const tries = ['playwright'];
  try { tries.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch (e) {}
  tries.push('/opt/node22/lib/node_modules/playwright');
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('playwright 모듈을 못 찾았다(' + tries.join(' · ') + ') — npm i -g playwright 로 모듈만 받고, 브라우저는 받지 말 것(/opt/pw-browsers 동봉본을 쓴다)');
}
async function launch() {
  const { chromium } = loadPlaywright();
  const args = ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'];
  try { return await chromium.launch({ args }); }
  catch (e) {
    // npm playwright 와 동봉 브라우저 빌드 번호가 어긋나면 동봉본을 직접(CLAUDE.md '렌더 변경을 비교할 때')
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    const base = '/opt/pw-browsers', cands = [];
    for (const d of fs.readdirSync(base)) {
      if (d.startsWith('chromium_headless_shell-')) cands.push(path.join(base, d, 'chrome-linux', 'headless_shell'));
      else if (d.startsWith('chromium-')) cands.push(path.join(base, d, 'chrome-linux', 'chrome'));
    }
    const exe = cands.filter(p => fs.existsSync(p)).sort().pop();
    if (!exe) throw e;
    log('  (동봉 브라우저 직접 사용: ' + exe + ')');
    return await chromium.launch({ args, executablePath: exe });
  }
}

// 페이지에 부팅 전에 거는 것. cfg = { seed, realtime }
function initScript(cfg) {
  window.__dlErrs = [];
  if (cfg.seed !== null && cfg.seed !== undefined) {
    let s = cfg.seed >>> 0;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  if (cfg.realtime) { window.__dl = null; return; }
  const T0 = 1767225600000;            // 2026-01-01 00:00 UTC (컨텍스트 시간대 Asia/Seoul → 09시 = 마을 낮)
  window.__t = 0;
  performance.now = () => window.__t;
  const RD = Date;
  RD.now = () => T0 + window.__t;
  window.Date = new Proxy(RD, {        // new Date() 도 게임 시계(timeOfDayNow 가 실제 시각으로 낮/밤을 고른다)
    construct(t, a, nt) { return Reflect.construct(t, a.length ? a : [T0 + window.__t], nt); },
    apply() { return new RD(T0 + window.__t).toString(); },
  });
  // 타이머 → 게임 시계 큐
  const TQ = []; let tid = 1;
  const addT = (fn, ms, rep, args) => { const id = tid++; ms = Math.max(0, +ms || 0); TQ.push({ id, at: window.__t + ms, ms, fn, rep, args }); return id; };
  window.setTimeout = (fn, ms, ...args) => addT(fn, ms, false, args);
  window.setInterval = (fn, ms, ...args) => addT(fn, Math.max(4, +ms || 0), true, args);
  window.clearTimeout = window.clearInterval = (id) => { const i = TQ.findIndex(x => x.id === id); if (i >= 0) TQ.splice(i, 1); };
  const run = (f, args) => { try { if (typeof f === 'function') f(...(args || [])); else (0, eval)(String(f)); } catch (e) { window.__dlErrs.push(String(e && e.stack || e)); } };
  const flush = () => {
    for (let g = 0; g < 50; g++) {
      const due = TQ.filter(x => x.at <= window.__t).sort((a, b) => a.at - b.at || a.id - b.id);
      if (!due.length) break;
      for (const x of due) {
        const i = TQ.indexOf(x); if (i < 0) continue;
        if (x.rep) x.at += x.ms; else TQ.splice(i, 1);
        run(x.fn, x.args);
      }
    }
  };
  // rAF → 수동 큐
  const RQ = []; let rid = 1;
  window.requestAnimationFrame = (cb) => { const id = rid++; RQ.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { const i = RQ.findIndex(x => x.id === id); if (i >= 0) RQ.splice(i, 1); };
  const STEP = 1000 / 60;
  window.__dl = {
    flush,
    // 시계만 전진(렌더 없음) — 부팅 타이머용
    advance(ms) { const n = Math.max(1, Math.round(ms / STEP)); for (let k = 0; k < n; k++) { window.__t += STEP; flush(); } },
    // 메인 루프 한 프레임(tick) — 렌더 포함
    frame() { window.__t += STEP; flush(); const q = RQ.splice(0); for (const r of q) run(r.cb, [window.__t]); },
  };
}

// 메인 루프의 렌더 준비를 흉내 내고 지금 씬을 그린 뒤 캔버스 픽셀 해시(페이지 안에서 — 픽셀 배열을 밖으로 옮기지 않는다).
// doHash=false 면 그리기만 한다(update 를 안 돌리므로 상태·난수가 그대로 — 마을 스크린샷이 이 길로 간다).
function pageHash([doHash, horror]) {
  if (_lastInTown !== inTown) { _lastInTown = inTown; applyAdaptiveFOV(); }   // 마을↔던전 FOV(메인 루프가 하는 것)
  if (horror && !inTown && !inRest && typeof updateHorror === 'function') updateHorror(0);   // 시간은 안 흘리고 유니폼만
  if (PGRASS) updatePixelGrass(windUniforms.uTime.value);                     // 안 부르면 잔디가 새까만 가시(CLAUDE.md v809 계측 함정)
  quadMat.uniforms.uCloudStr.value = (inTown && quadMat.uniforms.tCloud.value) ? (townAnim.cloudStr !== undefined ? townAnim.cloudStr : 0.5) : 0.0;
  if (PTREES && inTown && townPTrees) townPTrees.update(windUniforms.uTime.value, { night: townTimeOfDay === 'night' ? 1 : 0 });
  const sc = inTown ? townScene : inRest ? restScene : scene;
  if (sc === scene) cullSceneLights(camera);
  // 씬을 처음 그릴 때 three r128 이 내부 객체를 지연 생성하며 uuid 로 Math.random 을 먹는다(실측: 마을 첫 렌더 8개).
  // 하네스가 끼워 넣은 렌더가 게임 난수 흐름을 바꾸지 않게 그동안만 따로 된 LCG 로 바꿔 끼운다(골렘 빌더 요령).
  const RNG = Math.random; let ss = 0x9e3779b9;
  Math.random = () => { ss = (Math.imul(ss, 1664525) + 1013904223) >>> 0; return ss / 4294967296; };
  try { renderWithPost(sc); } finally { Math.random = RNG; }
  if (!doHash) return null;
  renderer.setRenderTarget(null);
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let hs = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) { hs ^= buf[i]; hs = Math.imul(hs, 0x01000193); }
  // 다를 때 위치를 보려고 거친 격자(8×6) 평균 휘도 — 위가 0행(readPixels 는 아래부터라 뒤집는다)
  const GX = 8, GY = 6, grid = [];
  for (let gy = 0; gy < GY; gy++) {
    const row = [];
    for (let gx = 0; gx < GX; gx++) {
      let s = 0, n = 0;
      const x0 = Math.floor(gx * w / GX), x1 = Math.floor((gx + 1) * w / GX);
      const y0 = Math.floor((GY - 1 - gy) * h / GY), y1 = Math.floor((GY - gy) * h / GY);
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const o = (y * w + x) * 4; s += 0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2]; n++; }
      row.push(Math.round(s / Math.max(1, n) * 10) / 10);
    }
    grid.push(row);
  }
  return { hash: (hs >>> 0).toString(16).padStart(8, '0'), w, h, where: inTown ? 'town' : inRest ? 'rest' : 'dungeon', floor: player.floor, grid };
}

// 메인 루프(tick)의 한 프레임에서 렌더·HUD(ui2.tick)·전투 음악만 뺀 것을 K 번(1/60 씩). 순서도 tick 그대로다.
// 예전엔 update 만 불러서 ① 히트스톱(hitStop)이 안 줄어 패링 뒤 영영 0.18 배속 ② 보스 슬로모(bossSlowTick)·120층 낙하(hsFallTick)·
// 막 전환 글(storyActTick)이 안 돌아 보상 카드·쉼터가 영영 안 왔고(CLAUDE.md v870 — 봇 루프와 같은 함정)
// ③ cullSceneLights 를 update 앞에서 안 불러 적 밝기(켜진 광원 기준)가 메인 루프와 달랐다.
// typeof 검사는 ab.sh 로 예전 빌드(그 기능이 없던 때)를 돌릴 때를 위해서다.
function pageSteps([K, horror]) {
  const rdt = 1 / 60;
  for (let k = 0; k < K; k++) {
    window.__t += 1000 / 60; window.__dl.flush();
    if (typeof clock !== 'undefined') clock.getDelta();   // 이후 --frames 가 큰 dt 를 받지 않게
    let dt = rdt;
    windUniforms.uTime.value += dt;
    if (PGRASS) updatePixelGrass(windUniforms.uTime.value);
    if (_lastInTown !== inTown) { _lastInTown = inTown; applyAdaptiveFOV(); }
    if (typeof hitStop !== 'undefined' && hitStop > 0) { hitStop -= dt; dt *= 0.18; }
    if (typeof bossSlowT !== 'undefined' && bossSlowT >= 0) dt *= bossSlowTick(rdt);
    const tut = (d) => { if (typeof tutTick === 'function') tutTick(d); };
    if (inTown) { updateTownMode(dt); tut(dt); }
    else if (inRest) { updateRestMode(dt); tut(dt); }
    else {
      cullSceneLights(camera);   // tick 과 같이 update 앞에서(적 가시성이 켜진 광원을 본다)
      if (typeof hsFall !== 'undefined' && hsFall) hsFallTick(rdt);
      if (typeof storyAct !== 'undefined' && storyAct) storyActTick(rdt);
      const lock = (typeof hsFallLock === 'function' && hsFallLock()) || (typeof storyAct !== 'undefined' && !!storyAct);
      if (player.alive && !rewardPaused && !lock) {
        update(dt);
        if (typeof tutUpdate === 'function') tutUpdate();
        if (typeof STORY_ON !== 'undefined' && STORY_ON) storyUpdate(dt);
      }
      if (typeof COMBO_ON !== 'undefined' && COMBO_ON && !rewardPaused) comboTick(dt);
      if (typeof LVFX_ON !== 'undefined' && LVFX_ON) lvfxTick(dt);
      tut(dt);
      if (horror && typeof updateHorror === 'function') updateHorror(dt);
    }
  }
  return { t: window.__t, where: inTown ? 'town' : inRest ? 'rest' : 'dungeon', floor: player.floor, hp: player.hp, x: +player.obj.position.x.toFixed(3), z: +player.obj.position.z.toFixed(3) };
}

// 페이지에 도우미를 심는다 — --eval 식 안에서 시간을 흘리거나 중간 해시를 낼 수 있게.
//   __dlSteps(K, horror) · __dlFrames(K) · __dlHash(horror) → { hash, grid, … }
function helperSource() {
  return `window.__dlSteps = function (K, horror) { return (${pageSteps.toString()})([K | 0, !!horror]); };
window.__dlFrames = function (K) { for (let k = 0; k < (K | 0); k++) window.__dl.frame(); return window.__t; };
window.__dlHash = function (horror) { return (${pageHash.toString()})([true, !!horror]); };`;
}

(async () => {
  let browser = null, exit = 0;
  const result = { url: URL, viewport: VP, touch, char: A.char, seed: A.seed, floor: A.floor };
  try {
    // 1) 서빙 버전부터(CLAUDE.md '렌더 변경을 비교할 때' — 엉뚱한 폴더의 예전 index.html 을 서빙한 사고)
    const st = await fetchVersion();
    if (!st.up) {
      console.log(st.status ? `✗ localhost:${A.port} 가 /index.html 에 ${st.status} 를 준다 — 저장소 루트가 아닌 폴더를 서빙 중. pkill -f "http.serve[r] ${A.port}" 뒤 serve.sh`
        : `✗ localhost:${A.port} 에 서버가 없다 — bash .claude/skills/dl-harness/scripts/serve.sh ${A.port}`);
      process.exit(2);
    }
    const rv = repoVersion();
    const same = rv && rv.md5 === st.md5;
    console.log(`served GAME_VERSION = ${st.v}` + (rv ? ` (저장소 index.html = ${rv.v}${rv.v === st.v ? (same ? ' · 내용 같음' : ' · 내용 다름') : ''})` : ''));
    result.served = st.v; result.servedSameAsRepo = !!same;
    if (A.expect && st.v !== A.expect) { console.log(`✗ --expect ${A.expect} 인데 ${st.v} 를 서빙한다`); process.exit(2); }
    if (!A.expect && rv && !same) console.log(`⚠ 저장소 index.html 과 다른 ${rv.v === st.v ? '내용(버전은 같다)' : '버전'}을 서빙 중 — ab.sh 의 B 빌드면 괜찮다. 아니면 serve.sh 로 확인할 것`);

    browser = await launch();
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: A.dpr, hasTouch: touch, isMobile: touch, locale: A.locale, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(A.timeout);
    const pageErrors = [], conErr = [], known = [];
    let bootLine = null;
    await page.route('**/*', r => {   // 외부 요청은 막는다(CrazyGames SDK 등) — 실패 콘솔은 '알려진 것'으로 따로 센다
      const u = r.request().url();
      if (/^(https?:\/\/(127\.0\.0\.1|localhost)[:/]|data:|blob:)/.test(u)) return r.continue();
      return r.abort();
    });
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    page.on('console', m => {
      const t = m.text();
      const b = t.match(/^DUNGEON (v\d+)/); if (b) bootLine = b[1];
      if (m.type() === 'error') { if (/crazygames|sdk|ERR_|Failed to load resource|net::/i.test(t)) known.push(t); else conErr.push(t); }
    });
    await page.addInitScript(initScript, { seed: A.seed, realtime: A.realtime });
    const RT = A.realtime;
    const pump = async (n) => { for (let k = 0; k < n; k++) await page.evaluate(() => window.__dl.frame()); };
    const advance = async (ms) => { if (RT) await page.waitForTimeout(ms); else await page.evaluate((m) => window.__dl.advance(m), ms); };
    const drainErrs = async () => { const e = await page.evaluate(() => { const a = window.__dlErrs || []; window.__dlErrs = []; return a; }); for (const x of e) pageErrors.push(x); };
    // --setup·--eval 공용: 페이지 전역에서 평가 → JSON. 실패하면 종료 코드 1
    const runEvals = async (list, tag, key) => {
      for (const { src, label } of list) {
        let out;
        try {
          out = await page.evaluate(async (s) => {
            let v = (0, eval)(s);
            if (v && typeof v.then === 'function') v = await v;
            try { return { ok: true, v: JSON.parse(JSON.stringify(v === undefined ? null : v)) }; }
            catch (e) { return { ok: true, v: String(v) }; }
          }, src);
        } catch (e) { out = { ok: false, err: String(e && e.message || e).split('\n')[0] }; }
        console.log(`${tag} ${label} => ${out.ok ? JSON.stringify(out.v) : '✗ ' + out.err}`);
        (result[key] = result[key] || []).push({ src: label, ...out });
        if (!out.ok) exit = 1;
      }
      await drainErrs();
    };
    if (A.shots) {   // 저장소 안에 쓰면 git 에 잡동사니가 남는다(CLAUDE.md '잡동사니')
      const abs = path.resolve(A.shots), root = repoRoot();
      if (abs === root || abs.startsWith(root + path.sep)) log(`  ⚠ --shots 가 저장소 안(${path.relative(root, abs)})이다 — 스크래치패드 경로를 쓸 것`);
    }

    log(`· ${URL} 열기 (${VP.width}x${VP.height}${touch ? ' 터치' : ''} · dpr ${A.dpr} · ${A.char}` + (A.seed !== null ? ` · seed ${A.seed}` : '') + (RT ? ' · realtime' : '') + ')');
    await page.goto(URL, { waitUntil: 'load', timeout: A.timeout });
    // waitForFunction 의 기본 polling 은 rAF 라 수동 큐에서는 영영 안 돈다 — 노드 쪽에서 직접 묻는다
    for (let i = 0; ; i++) {
      if (await page.evaluate(() => typeof exitTownToDungeon === 'function' && typeof renderWithPost === 'function' && typeof renderer !== 'undefined' && !!renderer)) break;
      if (i > 600) throw new Error('게임 스크립트가 안 뜬다(60초)');
      await new Promise(r => setTimeout(r, 100));
    }
    result.gameVersion = await page.evaluate(() => GAME_VERSION);
    if (!RT) await page.evaluate(helperSource());   // __dlSteps · __dlFrames · __dlHash
    log(`  부팅 ${result.gameVersion} (콘솔 줄 ${bootLine}) ${sec()}`);
    await advance(2000);

    // 2) 캐릭터 → 마을
    await page.evaluate((c) => { const el = document.querySelector('#charChoices .char-card[data-char="' + c + '"]'); if (!el) throw new Error('캐릭터 카드 없음: ' + c); el.click(); }, A.char);
    await advance(1500);
    await page.evaluate(() => { for (const id of ['startToTownBtn', 'startBtn']) { const s = document.getElementById(id); if (s && s.offsetParent) { s.click(); break; } } });
    await advance(1500);
    await drainErrs();
    const where0 = await page.evaluate(() => ({ inTown, selectedChar }));
    log(`  마을 inTown=${where0.inTown} char=${where0.selectedChar} ${sec()}`);
    if (A.shots && where0.inTown) {
      fs.mkdirSync(path.dirname(path.resolve(A.shots)), { recursive: true });
      if (!RT) await page.evaluate(pageHash, [false, false]);   // 그리기만(메인 루프를 돌리면 마을 update 가 난수를 먹어 --hash 결과가 --shots 유무로 달라진다)
      const f = A.shots + '-town.png'; await page.screenshot({ path: f }); log(`  스크린샷 ${f}`); (result.shots = result.shots || []).push(f);
    }

    // 3) 던전
    if (A.floor !== null) {
      await page.evaluate(([n, reset]) => {
        exitTownToDungeon();                         // 1층(resetGame → startFloor)
        if (n > 1) { if (reset) startRunAtFloorReset(n); else { player.floor = n; startFloor(); } }
      }, [A.floor, A.reset]);
      await drainErrs();
      const w = await page.evaluate(() => ({ floor: player.floor, inTown, rooms: dungeon && dungeon.rooms ? dungeon.rooms.length : null, enemies: enemies.length }));
      log(`  던전 ${w.floor}층 · 방 ${w.rooms} · 적 ${w.enemies} ${sec()}`);
      result.dungeon = w;
    }

    // 3.5) 상태 꾸미기(--setup) — --steps 보다 먼저
    if (A.setups.length) await runEvals(A.setups, 'SETUP', 'setups');

    // 4) 시간 진행
    if (A.steps > 0) {
      if (RT) throw new Error('--steps 는 --realtime 과 같이 못 쓴다');
      const s = await page.evaluate(pageSteps, [A.steps, A.horror]);
      await drainErrs();
      log(`  steps ${A.steps}: ${JSON.stringify(s)} ${sec()}`);
      result.steps = s;
    }
    if (A.frames > 0) {
      if (RT) await page.waitForTimeout(Math.round(A.frames * 1000 / 60)); else await pump(A.frames);
      await drainErrs();
      log(`  frames ${A.frames} ${sec()}`);
    }

    // 5) 해시
    if (A.hash) {
      if (RT) log('  ⚠ --realtime 에서는 해시가 결정적이지 않다');
      const h = await page.evaluate(pageHash, [true, A.horror]);
      await drainErrs();
      console.log(`HASH ${h.where} f${h.floor} ${h.w}x${h.h} ${h.hash}`);
      result.hash = h;
    }

    // 6) eval
    await runEvals(A.evals, 'EVAL', 'evals');

    // 7) 던전(쉼터) 스크린샷 — HUD·미니맵은 메인 루프(ui2.tick)가 그리므로 2프레임 돌리고 찍는다
    if (A.shots && A.floor !== null) {
      fs.mkdirSync(path.dirname(path.resolve(A.shots)), { recursive: true });
      if (!RT) await pump(2);
      const tag = await page.evaluate(() => inTown ? 'town2' : inRest ? 'rest' : 'dungeon');
      const f = A.shots + '-' + tag + '.png'; await page.screenshot({ path: f }); log(`  스크린샷 ${f}`); (result.shots = result.shots || []).push(f);
      await drainErrs();
    }

    result.pageErrors = pageErrors; result.consoleErrors = conErr; result.knownExternal = known.length;
    if (pageErrors.length || conErr.length) exit = 1;
    console.log(`${exit ? '✗' : '✓'} 페이지 오류 ${pageErrors.length} · 콘솔 에러 ${conErr.length}(알려진 외부 리소스 ${known.length}) · ${sec()}`);
    for (const e of pageErrors.slice(0, 8)) console.log('    pageerror: ' + e.slice(0, 400));
    for (const e of conErr.slice(0, 8)) console.log('    console.error: ' + e.slice(0, 400));
  } catch (e) {
    console.log('✗ ' + (e && e.stack || e));
    result.fatal = String(e && e.message || e);
    exit = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log('RESULT ' + JSON.stringify(result));
  process.exit(exit);
})();
