// v900 그래픽 품질 단계 기능 시험(실제 시계 · webdriver 숨김) — 저장소 루트에서 serve.sh(8899) 뒤: node .claude/skills/dl-crazygames-check/scripts/quality.js · 영어 화면 기준 문구로 비교한다
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
let pw; for (const t of ['playwright', path.join(execSync('npm root -g').toString().trim(), 'playwright'), '/opt/node22/lib/node_modules/playwright']) { try { pw = require(t); break; } catch (e) {} }
const URL = 'http://127.0.0.1:8899/index.html';
async function launch() {
  const args = ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'];
  try { return await pw.chromium.launch({ args }); } catch (e) {
    const base = '/opt/pw-browsers', c = [];
    for (const d of fs.readdirSync(base)) { if (d.startsWith('chromium-')) c.push(path.join(base, d, 'chrome-linux', 'chrome')); if (d.startsWith('chromium_headless_shell-')) c.push(path.join(base, d, 'chrome-linux', 'headless_shell')); }
    return await pw.chromium.launch({ args, executablePath: c.filter(p => fs.existsSync(p)).sort().pop() });
  }
}
const res = [];
const ok = (name, cond, info) => { res.push((cond ? '✓ ' : '✗ ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const b = await launch();
  const mk = async (init) => {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(init || '');
    await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    p.errs = errs; return { ctx, p };
  };
  const st = () => ({ Q: QUALITY, live: qLive, auto: QAUTO_LIVE, pxh: PX_FIXED_H, lr: [lowResW, lowResH], bloom: BLOOM_ON, ts: TORCH_SHADOW_EVERY, lember: LEMBER, ssao: SSAO_STR, voxray: VOX_RAY, dens: PGRASS_DENS, ls: localStorage.getItem('dungeon_quality_auto'), pick: localStorage.getItem('dungeon_quality'), row: [...document.querySelectorAll('#qualRow button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')) });
  // 1. 첫 실행 추정(SwiftShader → 낮음)
  { const { ctx, p } = await mk(); await p.goto(URL); await p.waitForFunction(() => typeof qLive !== 'undefined', null, { timeout: 120000 });
    const s = await p.evaluate(st); ok('첫 실행 SwiftShader → 낮음', s.Q === 'low' && s.ls === 'low' && s.pxh === 240 && !s.bloom && s.ssao === 0 && !s.voxray && s.dens === 0.45, s);
    ok('시작 화면 줄: 자동(낮음) 강조', s.row.includes('Auto (Low)*'), s.row);
    ok('페이지 오류 0', p.errs.length === 0, p.errs); await ctx.close(); }
  // 2. 기억한 자동 단계 '높음' → 던전에서 프레임이 낮으면 보통 → 낮음
  { const { ctx, p } = await mk(() => { try { localStorage.setItem('dungeon_quality_auto', 'high'); } catch (e) {} });
    await p.goto(URL); await p.waitForFunction(() => typeof qLive !== 'undefined', null, { timeout: 120000 });
    let s = await p.evaluate(st); ok('기억한 자동 단계 높음으로 부팅', s.Q === 'high' && s.pxh === 320 && s.voxray, s);
    await p.click('.char-card[data-char="knight"]');
    await p.waitForFunction(() => !inTown && player && player.floor >= 1, null, { timeout: 120000 });
    await p.waitForFunction(() => qLive === 'med', null, { timeout: 90000 }).catch(() => {});
    s = await p.evaluate(st); ok('낮은 프레임 → 보통으로 내림(해상도 288 · 불티 끔 · 다음 접속 med)', s.live === 'med' && s.pxh === 288 && s.lr[1] === 288 && !s.lember && s.ts >= 3 && s.ls === 'med', s);
    const tt = await p.evaluate(() => document.getElementById('toast').textContent); ok('안내 띠', /Graphics quality lowered/.test(tt), tt);
    await p.waitForFunction(() => qLive === 'low', null, { timeout: 90000 }).catch(() => {});
    s = await p.evaluate(st); ok('계속 낮음 → 낮음(240 · 블룸·SSAO 끔)', s.live === 'low' && s.lr[1] === 240 && !s.bloom && s.ssao === 0 && s.ls === 'low', s);
    ok('페이지 오류 0', p.errs.length === 0, p.errs); await ctx.close(); }
  // 3. 시작 화면에서 '높음' 고르기 → 다시 열림 · 자동 내림 없음
  { const { ctx, p } = await mk(); await p.goto(URL); await p.waitForFunction(() => typeof qLive !== 'undefined', null, { timeout: 120000 });
    await Promise.all([p.waitForNavigation({ timeout: 120000 }), p.click('#qualOpenBtn').then(() => p.click('#qualRow button[data-q="high"]'))]);
    await p.waitForFunction(() => typeof qLive !== 'undefined', null, { timeout: 120000 });
    let s = await p.evaluate(st); ok('높음 고름 → 높음 · 자동 꺼짐', s.Q === 'high' && s.pick === 'high' && !s.auto && s.row.some(t => t === 'High*'), s);
    await Promise.all([p.waitForNavigation({ timeout: 120000 }), p.click('#qualOpenBtn').then(() => p.click('#qualRow button[data-q="auto"]'))]);
    await p.waitForFunction(() => typeof qLive !== 'undefined', null, { timeout: 120000 });
    s = await p.evaluate(st); ok('자동으로 되돌림 → 다시 추정', s.pick === null && s.auto && s.Q === 'low', s);
    ok('페이지 오류 0', p.errs.length === 0, p.errs); await ctx.close(); }
  // 4. ?q=med 는 저장값보다 이긴다 · 자동 내림 없음
  { const { ctx, p } = await mk(() => { try { localStorage.setItem('dungeon_quality', 'low'); } catch (e) {} });
    await p.goto(URL + '?q=med'); await p.waitForFunction(() => typeof qLive !== 'undefined', null, { timeout: 120000 });
    const s = await p.evaluate(st); ok('?q=med 우선', s.Q === 'med' && !s.auto && s.pxh === 288, s); await ctx.close(); }
  await b.close();
  console.log(res.join('\n'));
})().catch(e => { console.log(res.join('\n')); console.error(e); process.exit(1); });
