// 뷰어가 '열면 실제로 보이는지'를 확인한다. 커밋·전달 전에 반드시 돌릴 것.
//
//   node viewers/smoke.js                    # viewers/*.html 전부
//   node viewers/smoke.js viewers/<이름>.html  # 하나만
//
// 왜 이게 따로 필요한가:
// 렌더를 확인한답시고 `requestAnimationFrame` 을 막고 `renderWithPost(scene)` 를 직접 부르면
// **뷰어 자신의 애니메이션 루프가 도는지는 확인이 안 된다.** 실제로 부패한 왕을 옮기면서
// 마지막 줄(`animate();`)이 잘려 나갔는데, 직접 렌더로 찍은 스크린샷은 멀쩡해서
// 사용자가 열어 보고 새까만 화면을 보고서야 알았다.
//
// 그래서 여기서는 아무것도 건드리지 않고 그냥 띄워 두고 본다:
//  ① 페이지가 requestAnimationFrame 을 실제로 부르는가(루프가 사는가)
//  ② 드로우콜이 0 이 아닌가(뭔가 그리기는 하는가)
//  ③ 캔버스에 캐릭터가 있는가(배경만 있는 새까만 화면이 아닌가)
//  ④ 콘솔 오류·미처리 예외가 없는가
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium';

const args = process.argv.slice(2);
const dir = path.join(__dirname);
const files = args.length ? args
  : fs.readdirSync(dir).filter(f => f.endsWith('.html')).map(f => path.join('viewers', f));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'] });
  let bad = 0;
  for (const f of files) {
    const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
    const errs = [];
    page.on('pageerror', e => errs.push('예외: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('콘솔: ' + m.text()); });
    // rAF 호출 횟수를 세는 계측기를 부팅보다 먼저 심는다
    await page.addInitScript(() => {
      window.__raf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { window.__raf++; return orig(cb); };
    });
    await page.goto('file://' + path.resolve(f), { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    let r;
    try {
      r = await page.evaluate(() => {
        // 캐릭터가 화면에 있는지: 캐릭터를 껐다 켠 두 장의 차이 픽셀 수로 본다.
        // 배경색만 비교하면 '배경은 나오는데 캐릭터가 없는' 경우를 놓친다.
        const root = (typeof kingObj !== 'undefined') ? kingObj
                   : (typeof bugObj !== 'undefined') ? bugObj
                   : (typeof ghoulObj !== 'undefined') ? ghoulObj : null;
        const gl = renderer.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4);
        const draw = () => { renderWithPost(scene); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, A); };
        draw();
        let px = null;
        if (root) {
          root.visible = false; renderWithPost(scene);
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, B);
          root.visible = true;
          px = 0;
          for (let i = 0; i < W * H; i++) {
            const o = i * 4;
            if (Math.abs(A[o] - B[o]) + Math.abs(A[o + 1] - B[o + 1]) + Math.abs(A[o + 2] - B[o + 2]) >= 12) px++;
          }
        }
        return { raf: window.__raf, elapsed: +(typeof clock !== 'undefined' ? clock.elapsedTime : 0).toFixed(2),
                 calls: renderer.info.render.calls, charPx: px, ctxLost: gl.isContextLost() };
      });
    } catch (e) { r = { fatal: e.message }; }
    await page.close();

    const why = [];
    if (r.fatal) why.push('평가 실패: ' + r.fatal);
    else {
      if (!r.raf) why.push('requestAnimationFrame 이 한 번도 안 불렸다 — animate() 호출이 빠졌을 가능성이 높다');
      if (!r.elapsed) why.push('clock 이 안 돈다 — 애니메이션 루프가 죽었다');
      if (!r.calls) why.push('드로우콜 0');
      if (r.ctxLost) why.push('WebGL 컨텍스트 손실');
      if (r.charPx !== null && r.charPx < 200) why.push('캐릭터 픽셀 ' + r.charPx + '개 — 화면에 안 보인다');
    }
    if (errs.length) why.push(...errs.slice(0, 3));

    const name = path.basename(f);
    if (why.length) { bad++; console.log('✗ ' + name + '\n    ' + why.join('\n    ')); }
    else console.log('✓ ' + name + '  rAF ' + r.raf + ' · ' + r.elapsed + '초 · 캐릭터 픽셀 ' + r.charPx);
  }
  await browser.close();
  if (bad) { console.log('\n' + bad + '개 실패'); process.exit(1); }
  console.log('\n전부 통과');
})();
