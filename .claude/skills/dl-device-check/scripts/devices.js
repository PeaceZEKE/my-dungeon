#!/usr/bin/env node
// dl-device-check · PC 웹 ↔ 모바일 화면 비교
//
// 사용(저장소 루트에서):
//   node .claude/skills/dl-device-check/scripts/devices.js [--floor 5] [--out DIR] [옵션…]
//
// 옵션:
//   --floor N        던전 층(기본 5). 1 이면 1층 그대로, 그 위는 startRunAtFloorReset(N)
//   --seed S         Math.random 시드(기본 12345, addInitScript 로 부팅 전에 건다)
//   --vp SPEC        뷰포트(여러 번 · 하나라도 주면 기본 목록을 대신한다)
//                    SPEC = 이름:가로x세로[:touch][:dpr2]   예) phone:844x390:touch  pc:1920x1080  tall:390x844:touch
//   --shots LIST     찍을 장면(기본 town,dungeon · title 을 더할 수 있다 — 캐릭터 선택 화면)
//   --query Q        URL 뒤에 덧붙일 것(예: '&ui2=0' · '&pxh=360'). 기본 쿼리는 '?tut=0'
//   --class C        knight|mage|archer(기본 knight)
//   --tod day|night  마을 시간대(기본 day — 자동이면 실제 시각을 따라 실행마다 달라진다)
//   --hints          마을 조작 힌트 패널(#howtoHint)을 그대로 둔다(기본은 숨김)
//   --lang L         브라우저 locale(기본 ko-KR)
//   --frames N       장면마다 돌릴 프레임 수(기본 20, 게임 시계 1/60초씩)
//   --small PX       '작은 글씨' 문턱(화면에 실제로 찍히는 크기, 기본 11) — 폰에서 읽기 어려운 글씨
//   --smallrel PCT   '상대적으로 작은 글씨' 문턱(화면 높이 대비 %, 기본 1.6) — 큰 모니터에서 배율 없이 쪼그라든 글씨
//   --height H       시트에서 한 줄 높이(기본 360)
//   --port P         테스트 서버 포트(기본 8899)
//   --out DIR        결과 폴더(기본 $TMPDIR/dl-device-check-<시각>) — 세션에서는 스크래치패드를 줄 것
//   --no-sheet       PNG·metrics.json 만 만들고 시트는 건너뛴다
//
// 결과: DIR/<이름>-<장면>.png · DIR/metrics.json · DIR/sheet.png(scripts/sheet.py) · 표준 출력에 요약 표
//
// 지키는 것(CLAUDE.md '렌더 변경을 비교할 때'):
//   · 시드·시계는 addInitScript 로 부팅보다 먼저 건다(evaluate 안에서 걸면 이미 늦다).
//   · performance.now / Date.now / setTimeout 을 게임 시계로 — 토스트·힌트가 뷰포트마다 다르게 사라지지 않게.
//   · 장면을 찍을 때는 rAF 를 끊고 tick() 을 직접 돌린다(반짝이·흔들림이 뷰포트마다 다른 순간에 찍히지 않게).
//   · 서버는 저장소 루트에서 — 서빙하는 index.html 이 저장소 것과 버전·내용(md5)이 다르면 멈춘다.
//   · 바깥 요청(CrazyGames SDK 등)은 막는다.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn, spawnSync } = require('child_process');

const DEFAULT_VPS = [
  'mobile-844x390:844x390:touch',
  'pc-960x540:960x540',
  'pc-1280x720:1280x720',
  'pc-1366x768:1366x768',
  'pc-1920x1080:1920x1080',
];
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

// ---------- 인자 ----------
const argv = process.argv.slice(2);
const opt = { floor: 5, seed: 12345, vps: [], shots: 'town,dungeon', query: '', cls: 'knight', tod: 'day', hints: false,
  lang: 'ko-KR', frames: 20, small: 11, smallrel: 1.6, height: 360, port: 8899, out: null, sheet: true };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = () => argv[++i];
  if (a === '--floor') opt.floor = +v();
  else if (a === '--seed') opt.seed = +v();
  else if (a === '--vp') opt.vps.push(v());
  else if (a === '--shots') opt.shots = v();
  else if (a === '--query') opt.query = v();
  else if (a === '--class') opt.cls = v();
  else if (a === '--tod') opt.tod = v();
  else if (a === '--hints') opt.hints = true;
  else if (a === '--lang') opt.lang = v();
  else if (a === '--frames') opt.frames = +v();
  else if (a === '--small') opt.small = +v();
  else if (a === '--smallrel') opt.smallrel = +v();
  else if (a === '--height') opt.height = +v();
  else if (a === '--port') opt.port = +v();
  else if (a === '--out') opt.out = v();
  else if (a === '--no-sheet') opt.sheet = false;
  else if (a === '-h' || a === '--help') {
    // 머리 주석 전체(첫 비주석 줄 앞까지)
    const L = fs.readFileSync(__filename, 'utf8').split('\n').slice(1);
    const end = L.findIndex(l => !l.startsWith('//'));
    console.log(L.slice(0, end < 0 ? L.length : end).join('\n')); process.exit(0);
  }
  else { console.error('모르는 인자: ' + a); process.exit(2); }
}
if (!opt.vps.length) opt.vps = DEFAULT_VPS.slice();
const shots = opt.shots.split(',').map(s => s.trim()).filter(Boolean);
for (const s of shots) if (!['title', 'town', 'dungeon'].includes(s)) { console.error('모르는 장면: ' + s); process.exit(2); }

function parseVp(spec) {
  const p = spec.split(':');
  // 이름은 생략할 수 있다: '844x390:touch' 도 된다(이름 = 크기)
  const named = !/^\d+x\d+$/.test(p[0]);
  const m = (named ? p[1] || '' : p[0]).match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error('뷰포트 형식: 이름:가로x세로[:touch][:dprN] — ' + spec);
  const vp = { label: named ? p[0] : `${m[1]}x${m[2]}`, w: +m[1], h: +m[2], touch: false, dpr: 1 };
  for (const t of p.slice(named ? 2 : 1)) {
    if (t === 'touch') vp.touch = true;
    else if (/^dpr[\d.]+$/.test(t)) vp.dpr = +t.slice(3);
    else throw new Error('모르는 뷰포트 꼬리표: ' + t);
  }
  vp.label = vp.label.replace(/[^\w.-]+/g, '_');
  return vp;
}
let vps;
try { vps = opt.vps.map(parseVp); } catch (e) { console.error('✗ ' + e.message); process.exit(2); }
for (const [k, ok] of [['floor', Number.isInteger(opt.floor) && opt.floor >= 1], ['frames', Number.isInteger(opt.frames) && opt.frames >= 1], ['seed', Number.isFinite(opt.seed)]])
  if (!ok) { console.error(`✗ --${k} 값이 이상하다: ${opt[k]}`); process.exit(2); }
if (!['day', 'night'].includes(opt.tod)) { console.error('✗ --tod 는 day|night'); process.exit(2); }
if (!['knight', 'mage', 'archer'].includes(opt.cls)) { console.error('✗ --class 는 knight|mage|archer'); process.exit(2); }

// 저장소 루트: git 이 없거나(압축본) 실패하면 스킬 폴더 기준 네 단계 위(.claude/skills/dl-device-check/scripts → 루트)
let root;
try { root = execSync('git rev-parse --show-toplevel', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
catch (e) { root = path.resolve(__dirname, '..', '..', '..', '..'); }
if (!fs.existsSync(path.join(root, 'index.html'))) { console.error('✗ 저장소 루트를 못 찾음(index.html 없음): ' + root); process.exit(1); }
const htmlBuf = fs.readFileSync(path.join(root, 'index.html'));
const html = htmlBuf.toString('utf8');
const wantMd5 = require('crypto').createHash('md5').update(htmlBuf).digest('hex');
const want = (html.match(/^const GAME_VERSION = '(v\d+)'/m) || [])[1];
if (!want) { console.error('✗ index.html 에서 GAME_VERSION 을 못 읽음'); process.exit(1); }
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const outDir = path.resolve(opt.out || path.join(process.env.TMPDIR || '/tmp', 'dl-device-check-' + stamp));
fs.mkdirSync(outDir, { recursive: true });

// ---------- 서버(저장소 루트) ----------
function fetchVersion() {
  return new Promise(res => {
    const req = http.get({ host: '127.0.0.1', port: opt.port, path: '/index.html', timeout: 20000 }, r => {
      const chunks = [];
      r.on('data', c => { chunks.push(c); });
      r.on('end', () => {
        const buf = Buffer.concat(chunks), m = buf.toString('utf8').match(/GAME_VERSION = '(v\d+)'/);
        res({ up: true, v: m ? m[1] : null, md5: require('crypto').createHash('md5').update(buf).digest('hex') });
      });
    });
    req.on('error', () => res({ up: false }));
    req.on('timeout', () => { req.destroy(); res({ up: false }); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// playwright 모듈 — 경로를 박아 두면 node 가 다른 곳에 깔린 환경에서 죽는다. 로컬 → 전역(npm root -g) → 예전 고정 경로 순(dl-harness 와 같다)
function loadPlaywright() {
  const tries = ['playwright'];
  try { tries.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch (e) {}
  tries.push('/opt/node22/lib/node_modules/playwright');
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('playwright 모듈을 못 찾았다(' + tries.join(' · ') + ') — npm i -g playwright 로 모듈만 받고, 브라우저는 받지 말 것(/opt/pw-browsers 동봉본을 쓴다)');
}

async function launch(chromium) {
  const a = ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'];
  try { return await chromium.launch({ args: a }); }
  catch (e) {
    // npm playwright 와 동봉 브라우저 빌드 번호가 어긋나면 동봉본을 직접(CLAUDE.md '렌더 변경을 비교할 때')
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    const base = '/opt/pw-browsers', cands = [];
    if (!fs.existsSync(base)) throw e;
    for (const d of fs.readdirSync(base)) {
      if (d.startsWith('chromium_headless_shell-')) cands.push(path.join(base, d, 'chrome-linux', 'headless_shell'));
      else if (d.startsWith('chromium-')) cands.push(path.join(base, d, 'chrome-linux', 'chrome'));
    }
    const exe = cands.filter(p => fs.existsSync(p)).sort().pop();
    if (!exe) throw e;
    console.log('  (동봉 브라우저 직접 사용: ' + exe + ')');
    return chromium.launch({ args: a, executablePath: exe });
  }
}

// ---------- 페이지에 심는 것 ----------
// 시드 + 게임 시계 + 게임 시계 setTimeout(playbot run.js 와 같은 요령) — 부팅보다 먼저
function initScript(seed) {
  let s = seed >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  window.__t = 0;
  performance.now = () => window.__t;
  Date.now = () => 1767225600000 + window.__t;
  const Q = []; let tid = 1;
  window.setTimeout = (fn, ms) => { const id = tid++; Q.push({ id, at: window.__t + (ms || 0), fn }); return id; };
  window.clearTimeout = id => { const i = Q.findIndex(q => q.id === id); if (i >= 0) Q.splice(i, 1); };
  window.__flushTimers = () => {
    for (let g = 0; g < 50; g++) {
      const due = Q.filter(q => q.at <= window.__t); if (!due.length) break;
      for (const q of due) { const i = Q.indexOf(q); if (i >= 0) Q.splice(i, 1); try { typeof q.fn === 'function' ? q.fn() : 0; } catch (e) { (window.__dcErr = window.__dcErr || []).push(String(e && e.message || e)); } }
    }
  };
}

// 페이지 안 도구: 프레임 돌리기 · 측정. 게임 전역(camera·player·renderer·lowResH·scrW…)은 클래식 스크립트 최상위라 이름으로 닿는다.
function installTools([SMALL, SMALLREL]) {
  window.__dc = {
    drive(n) {
      window.requestAnimationFrame = () => 0;   // 루프 정지 — 이후 렌더는 직접(CLAUDE.md)
      for (let i = 0; i < n; i++) {
        window.__t += 1000 / 60; window.__flushTimers();
        tick(lastFrameT + 1000 / 60 + 1);       // 60fps 제한(lastFrameT 기준)을 늘 넘게
      }
      // GPU 를 여기서 비운다: tick 은 그리기 명령만 쌓고 돌아오므로, 안 비우면 다음 screenshot 이 SwiftShader 가
      // 20프레임을 다 그릴 때까지 기다린다(1920×1080 실측 34초 → Playwright 기본 30초 초과).
      // gl.finish 는 여기서 안 막힌다 — 1픽셀 readPixels 로 강제 동기화(CLAUDE.md '포스트 패스 비용은 gl.finish로 못 잰다')
      try { const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } catch (e) {}
    },
    metrics(sceneName) {
      const r2 = x => Math.round(x * 100) / 100;
      const W = scrW(), H = scrH();
      const vfov = camera.fov, aspect = camera.aspect;
      const hfov = 2 * Math.atan(Math.tan(vfov * Math.PI / 360) * aspect) * 180 / Math.PI;
      const tgt = player.obj.position;
      const D = camera.position.distanceTo(tgt);
      const sz = renderer.getSize(new THREE.Vector2());
      player.obj.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      // 바닥에서 보이는 범위: 화면 가운데 가로줄·세로줄 양 끝을 발밑 높이 평면에 쏜 거리(칸 = TILE)
      const gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -tgt.y), rc = new THREE.Raycaster();
      const hit = (x, y) => { rc.setFromCamera(new THREE.Vector2(x, y), camera); return rc.ray.intersectPlane(gp, new THREE.Vector3()); };
      const span = (a, b) => (a && b) ? r2(a.distanceTo(b) / TILE) : null;
      const ground = [span(hit(-1, 0), hit(1, 0)), span(hit(0, -1), hit(0, 1))];
      // 캐릭터 화면 높이: 발(player.obj 원점) → 보이는 메시 꼭대기 높이의 세로 선분을 투영한다.
      // (월드 축 상자를 통째로 투영하면 발밑 블롭 판·망토 깊이까지 세로로 잡혀 두 배 가까이 부푼다)
      let top = -1e9;
      player.obj.traverse(o => {
        if (!o.isMesh || !o.geometry || o.geometry.type === 'PlaneGeometry') return;
        for (let v = o; v; v = v.parent) { if (!v.visible) return; if (v === player.obj) break; }
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        top = Math.max(top, o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).max.y);
      });
      let char = null;
      if (top > -1e9) {
        const toS = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * W, (1 - (p.y + 1) / 2) * H]; };
        const a = toS(tgt), b = toS(new THREE.Vector3(tgt.x, top, tgt.z));
        const hpx = Math.abs(a[1] - b[1]);
        char = { px: Math.round(hpx), pctH: r2(hpx / H * 100), worldH: r2(top - tgt.y), cx: Math.round((a[0] + b[0]) / 2), cy: Math.round((a[1] + b[1]) / 2) };
      }
      // 작은 글씨: 화면에 실제로 찍히는 크기(transform 배율까지) — 회전에도 맞게 넓이 비율의 제곱근
      const small = [], rel = []; let nText = 0, minPx = 1e9;
      for (const el of document.body.querySelectorAll('*')) {
        let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
        own = own.replace(/\s+/g, ' ').trim(); if (!own) continue;
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
        const ow = el.offsetWidth, oh = el.offsetHeight;
        const k = ow > 0 && oh > 0 ? Math.sqrt(r.width * r.height / (ow * oh)) : 1;
        const px = parseFloat(getComputedStyle(el).fontSize) * k;
        nText++; minPx = Math.min(minPx, px);
        const sel = el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') + (el.parentElement && el.parentElement.id ? ' <#' + el.parentElement.id : '');
        if (px < SMALL) small.push({ px: r2(px), text: own.slice(0, 28), sel });
        if (px / H * 100 < SMALLREL) rel.push({ px: r2(px), pct: r2(px / H * 100), text: own.slice(0, 28), sel });
      }
      small.sort((a, b) => a.px - b.px); rel.sort((a, b) => a.pct - b.pct);
      // 모바일 조작 버튼이 화면을 얼마나 덮나
      const mc = document.getElementById('mobileControls');
      const mcOn = !!mc && getComputedStyle(mc).display !== 'none';
      let mcArea = 0; const mcBtns = [];
      if (mcOn) for (const el of mc.querySelectorAll('.joy-base,.turn-base,.act-btn')) {
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect(); if (r.width < 1) continue;
        mcArea += r.width * r.height; mcBtns.push({ id: el.id, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) });
      }
      const rect = id => { const e = document.getElementById(id); if (!e || (e.checkVisibility && !e.checkVisibility())) return null; const r = e.getBoundingClientRect(); return r.width < 1 ? null : { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
      // 장면 서명(뷰포트끼리 같은 세계를 찍었는지)
      let sig = null;
      if (sceneName === 'dungeon' && typeof dungeon !== 'undefined' && dungeon && dungeon.grid) {
        let h = 2166136261 >>> 0; const s = JSON.stringify(dungeon.grid);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        sig = 'grid ' + h.toString(16) + ' · 방 ' + dungeon.rooms.length + ' · 적 ' + enemies.length + ' · 플레이어 (' + tgt.x.toFixed(1) + ', ' + tgt.z.toFixed(1) + ')';
      } else sig = '플레이어 (' + tgt.x.toFixed(1) + ', ' + tgt.z.toFixed(1) + ')';
      const z = getComputedStyle(document.documentElement).getPropertyValue('--ui2z').trim();
      return {
        scene: sceneName, inTown: !!inTown, floor: player.floor || null,
        isTouchDevice: !!isTouchDevice, rotLand: !!rotLand, scr: [W, H], inner: [innerWidth, innerHeight], dpr: devicePixelRatio,
        vfov: r2(vfov), hfov: r2(hfov), aspect: r2(aspect), camDist: r2(D),
        groundTiles: ground,
        renderer: [sz.x, sz.y], buffer: [renderer.domElement.width, renderer.domElement.height],
        lowRes: [lowResW, lowResH], pxFixedH: typeof PX_FIXED_H !== 'undefined' ? PX_FIXED_H : null, texelPx: r2(H / lowResH),
        ui2z: z ? +z : null, ui2: !!(typeof ui2 !== 'undefined' && ui2),
        hud2: rect('hud2'), minimap: rect('u2Map') || rect('minimap'),
        char, mobileControls: mcOn, mcCoverPct: r2(mcArea / (innerWidth * innerHeight) * 100), mcBtns,
        text: { n: nText, minPx: nText ? r2(minPx) : null, minPct: nText ? r2(minPx / H * 100) : null, smallN: small.length, small: small.slice(0, 12), relN: rel.length, rel: rel.slice(0, 12) },
        sig, errs: (window.__dcErr || []).slice(0, 5),
      };
    },
  };
}

// ---------- 뷰포트 하나 ----------
async function runViewport(browser, vp) {
  const ctxOpt = { viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, locale: opt.lang };
  if (vp.touch) Object.assign(ctxOpt, { hasTouch: true, isMobile: true, userAgent: ANDROID_UA });
  const ctx = await browser.newContext(ctxOpt);
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (/^(https?:\/\/(127\.0\.0\.1|localhost)[:/]|data:|blob:)/.test(u)) return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  await page.addInitScript(initScript, opt.seed);
  const q = '?tut=0' + (opt.query ? (opt.query.startsWith('&') ? opt.query : '&' + opt.query.replace(/^\?/, '')) : '');
  const url = `http://127.0.0.1:${opt.port}/index.html${q}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => typeof beginGameWith === 'function' && typeof startRunAtFloorReset === 'function' && typeof tick === 'function' && typeof lastFrameT === 'number', null, { timeout: 120000 });
  await page.evaluate(() => { window.__t += 2000; window.__flushTimers(); });
  await page.evaluate(installTools, [opt.small, opt.smallrel]);
  const res = { label: vp.label, w: vp.w, h: vp.h, touch: vp.touch, dpr: vp.dpr, url, files: {}, m: {} };
  const shoot = async (name) => {
    const f = `${vp.label}-${name}.png`;
    await page.screenshot({ path: path.join(outDir, f), timeout: 180000 });   // 큰 화면은 SwiftShader 합성이 느리다
    res.files[name] = f;
    res.m[name] = await page.evaluate(n => window.__dc.metrics(n), name);
  };
  if (shots.includes('title')) {
    await page.evaluate(n => window.__dc.drive(n), opt.frames);
    await shoot('title');
  }
  if (shots.includes('town') || shots.includes('dungeon')) {
    await page.evaluate(([cls, tod, hints]) => {
      beginGameWith(cls);                                   // 캐릭터 고르기 → 마을(enterTownMode)
      if (!hints && typeof hideHowtoHint === 'function') hideHowtoHint();
      if (typeof setTownTimeOfDay === 'function') { townTimeAuto = false; setTownTimeOfDay(tod); if (typeof updateTimeBtnLabel === 'function') updateTimeBtnLabel(); }
    }, [opt.cls, opt.tod, opt.hints]);
    await page.evaluate(n => window.__dc.drive(n), opt.frames);
    if (shots.includes('town')) await shoot('town');
  }
  if (shots.includes('dungeon')) {
    await page.evaluate(fl => { exitTownToDungeon(); if (fl > 1) startRunAtFloorReset(fl); }, opt.floor);
    await page.evaluate(n => window.__dc.drive(n), opt.frames);
    await shoot('dungeon');
  }
  res.pageErrors = pageErrors.slice(0, 8);
  await ctx.close();
  return res;
}

// ---------- 요약 표 ----------
function fmtRow(r, s) {
  const m = r.m[s]; if (!m) return null;
  const c = m.char ? `${m.char.px}px(${m.char.pctH}%)` : '-';
  return `| ${r.label} | ${s} | ${m.scr[0]}×${m.scr[1]}${m.isTouchDevice ? ' 터치' : ''} | ${m.vfov}° / ${m.hfov}° | ${m.groundTiles[0]}×${m.groundTiles[1]} | ${m.lowRes[0]}×${m.lowRes[1]} · ${m.texelPx}px | ${m.ui2z ?? '-'} | ${c} | ${m.text.smallN} · ${m.text.relN} / ${m.text.n} (최소 ${m.text.minPx}px = ${m.text.minPct}%) | ${m.mobileControls ? m.mcCoverPct + '%' : '-'} |`;
}

(async () => {
  let server = null, fail = 0;
  const results = [];
  try {
    let st = await fetchVersion();
    if (!st.up) {
      console.log(`  localhost:${opt.port} 에 서버가 없어 저장소 루트에서 띄운다`);
      server = spawn('python3', ['-m', 'http.server', String(opt.port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
      for (let i = 0; i < 40 && !st.up; i++) { await sleep(250); st = await fetchVersion(); }
      if (!st.up) { console.log('✗ 서버를 못 띄웠다'); server.kill(); process.exit(1); }
    }
    if (st.v !== want || st.md5 !== wantMd5) {
      // 버전이 같아도 내용이 다를 수 있다(버전을 올리기 전의 작업 트리 ↔ 다른 폴더의 HEAD) — 내용 해시까지 본다(serve.sh 와 같다)
      console.log(`✗ localhost:${opt.port} 이 서빙하는 index.html(${st.v}, md5 ${String(st.md5).slice(0, 12)})이 저장소 것(${want}, md5 ${wantMd5.slice(0, 12)})과 다르다 — ` +
        `다른 폴더에서 띄운 서버다. 끄고 저장소 루트에서 다시 띄울 것: pkill -f "http.serve[r] ${opt.port}" (CLAUDE.md '테스트용 웹서버는 반드시 저장소 루트에서')`);
      if (server) server.kill();
      process.exit(1);
    }
    console.log(`✓ 서버 ${st.v} · 층 ${opt.floor} · 시드 ${opt.seed} · 장면 ${shots.join(',')} · 결과 ${outDir}`);
    const { chromium } = loadPlaywright();
    const browser = await launch(chromium);
    for (const vp of vps) {
      const t0 = Date.now();
      try {
        const r = await runViewport(browser, vp);
        results.push(r);
        console.log(`  ${r.pageErrors.length ? '✗' : '✓'} ${vp.label} ${vp.w}×${vp.h}${vp.touch ? ' touch' : ''} · ${((Date.now() - t0) / 1000).toFixed(0)}초` + (r.pageErrors.length ? ' · 페이지 오류 ' + r.pageErrors.length + ': ' + r.pageErrors[0].slice(0, 160) : ''));
        if (r.pageErrors.length) fail = 1;
      } catch (e) {
        const noAnsi = x => String(x).replace(/\x1b\[[0-9;]*m/g, '');   // Playwright 오류의 색 코드
        fail = 1; console.log(`  ✗ ${vp.label}: ${noAnsi(e && e.stack || e).slice(0, 600)}`);
        results.push({ label: vp.label, w: vp.w, h: vp.h, touch: vp.touch, dpr: vp.dpr, files: {}, m: {}, error: noAnsi(e && e.message || e) });
      }
    }
    await browser.close();
  } catch (e) {
    console.log('✗ ' + (e && e.stack || e)); fail = 1;
  } finally {
    if (server) server.kill();
  }
  const meta = { version: want, seed: opt.seed, floor: opt.floor, shots, query: opt.query, cls: opt.cls, tod: opt.tod, small: opt.small, smallrel: opt.smallrel, height: opt.height, date: new Date().toISOString(), results };
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(meta, null, 1));

  // 요약 표(마크다운)
  const lines = ['| 뷰포트 | 장면 | 화면 | 세로/가로 FOV | 바닥 보이는 칸(가로×세로) | 저해상 · 텍셀 | HUD 배율 | 캐릭터 높이 | 작은 글씨(<' + opt.small + 'px · <' + opt.smallrel + '% 높이) / 전체 | 모바일 버튼 면적 |',
    '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) for (const s of shots) { const l = fmtRow(r, s); if (l) lines.push(l); }
  const sigs = {};
  for (const s of shots) sigs[s] = [...new Set(results.map(r => r.m[s] && r.m[s].sig).filter(Boolean))];
  const table = lines.join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.md'), table + '\n');
  console.log('\n' + table + '\n');
  for (const s of shots) {
    if (sigs[s].length > 1) console.log(`⚠ ${s}: 뷰포트마다 장면 서명이 다르다(같은 세계가 아님) — ${sigs[s].join(' / ')}`);
    else if (sigs[s].length === 1) console.log(`✓ ${s}: 모든 뷰포트가 같은 장면 — ${sigs[s][0]}`);
  }
  // 작은 글씨 상세(뷰포트마다 가장 작은 몇 개)
  for (const r of results) for (const s of shots) {
    const m = r.m[s]; if (!m) continue;
    if (m.text.smallN) console.log(`  · ${r.label}/${s} 작은 글씨(<${opt.small}px): ` + m.text.small.slice(0, 5).map(t => `${t.px}px ${t.sel} "${t.text}"`).join(' · '));
    if (m.text.relN) console.log(`  · ${r.label}/${s} 화면 대비 작은 글씨(<${opt.smallrel}%): ` + m.text.rel.slice(0, 5).map(t => `${t.px}px=${t.pct}% ${t.sel} "${t.text}"`).join(' · '));
  }

  if (opt.sheet) {
    const py = spawnSync('python3', [path.join(__dirname, 'sheet.py'), outDir], { encoding: 'utf8' });
    process.stdout.write(py.stdout || ''); process.stderr.write(py.stderr || '');
    if (py.status !== 0) { console.log('✗ 시트 만들기 실패'); fail = 1; }
  }
  console.log(fail ? '== 일부 실패 ==' : '== 완료 ==');
  process.exit(fail);
})();
