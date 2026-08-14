// 뷰어의 캐릭터를 glTF 바이너리(.glb)로 뽑는다. Blender·3D 뷰어 등에서 그대로 열린다.
//
//   node viewers/export-glb.js viewers/<이름>.html [출력.glb]
//
// 뷰어를 헤드리스 브라우저로 띄워 실제로 만들어진 씬 그래프를 그대로 내보낸다.
// 이 게임의 캐릭터는 코드로 생성되므로(파일에 저장된 메시가 없다) 이 방법 말고는 꺼낼 길이 없다.
//
// 내보내는 것 / 아닌 것
//  · 나온다: 지오메트리, 머티리얼(색·러프니스·메탈니스·발광), 계층 구조
//  · 안 나온다: 애니메이션. 이 뷰어의 동작은 키프레임이 아니라 매 프레임 도는 자바스크립트다.
//    특정 포즈가 필요하면 --pose 로 그 순간을 만든 뒤 내보낸다.
//  · 안 나온다: 게임의 후처리(픽셀화·외곽선·색보정). 그건 렌더 파이프라인이지 모델이 아니다.
//    그래서 Blender에서 열면 뷰어보다 밝고 매끈해 보이는 게 정상이다.
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('사용법: node viewers/export-glb.js viewers/<이름>.html [출력.glb] [--pose=roar|phase2]');
  process.exit(1);
}
const poseArg = (process.argv.find(a => a.startsWith('--pose=')) || '').split('=')[1] || '';
const out = process.argv.find((a, i) => i > 2 && !a.startsWith('--'))
  || path.join(path.dirname(src), 'dist', path.basename(src, '.html') + (poseArg ? '-' + poseArg : '') + '.glb');

const CHROME = '/opt/pw-browsers/chromium';
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');

(async () => {
  const dir = path.dirname(path.resolve(src));
  const exporterSrc = fs.readFileSync(path.join(dir, 'GLTFExporter.js'), 'utf8');

  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(src), { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  if (errs.length) { console.error('뷰어 로드 중 오류:', errs); process.exit(1); }

  await page.addScriptTag({ content: exporterSrc });

  const result = await page.evaluate(async (pose) => {
    // 애니메이션을 멈춰 포즈를 고정한다(안 그러면 내보내는 순간의 호흡 위상이 섞인다)
    window.requestAnimationFrame = () => 0;
    // 포즈는 animate() 를 여러 번 부르는 대신 최종값을 직접 넣는다.
    // 이 뷰어의 동작은 dt 기반 lerp 라서, 루프를 빨리 돌리면 dt 가 거의 0 이라 수렴하지 않는다.
    if (pose === 'roar') {
      jawGrp.rotation.x = JAW_ROAR; headGrp.rotation.x = 0.32;
      armR.armGrp.rotation.z = 0.42; armL.armGrp.rotation.z = -0.42;
      tongue.position.z = -0.40; tongue.rotation.x = -0.35;
    }
    if (pose === 'phase2') {
      cageR.rotation.y = -1.25; cageL.rotation.y = 1.25; cageSeam.visible = false;
    }

    const root = ghoulObj;
    root.updateMatrixWorld(true);

    // flatShading 은 three 렌더러 쪽 설정이라 glTF 에 그런 항목이 없다.
    // 그냥 두면 각진 로우폴리 느낌이 사라지므로, 그 머티리얼을 쓰는 지오메트리는
    // 면 노멀을 직접 구워 넣는다(비인덱스 지오메트리에 computeVertexNormals 를 부르면 면 노멀이 된다).
    // markOrganic 이 걸린 살 재질은 flatShading 이 이미 꺼져 있어 부드러운 노멀 그대로 나간다.
    let flatBaked = 0;
    const hidden = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // 발밑 블롭 그림자는 모델이 아니라 렌더 트릭이라 뺀다
      if (mats.some(m => m && m.map && m.transparent && m.color && m.color.getHex() === 0x000000)) {
        o.visible = false; hidden.push(o); return;
      }
      if (!mats.some(m => m && m.flatShading)) return;
      let g = o.geometry;
      if (g.index) { g = g.toNonIndexed(); o.geometry = g; }
      g.computeVertexNormals();
      flatBaked++;
    });

    const stats = { meshes: 0, tris: 0, materials: new Set() };
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      stats.meshes++;
      const p = o.geometry.attributes.position;
      stats.tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => stats.materials.add(m.uuid));
    });

    const buf = await new Promise((res, rej) => {
      new THREE.GLTFExporter().parse(root, res, { binary: true, onlyVisible: true }, rej);
    });
    for (const o of hidden) o.visible = true;
    // ArrayBuffer 는 evaluate 결과로 못 넘기므로 일반 배열로 바꿔 전달한다
    return { bytes: Array.from(new Uint8Array(buf)), flatBaked,
             meshes: stats.meshes, tris: stats.tris, materials: stats.materials.size };
  }, poseArg);

  await browser.close();
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(result.bytes));
  console.log(out + '  ' + (result.bytes.length / 1024).toFixed(0) + 'KB'
    + '  메시 ' + result.meshes + ' · 삼각형 ' + result.tris + ' · 머티리얼 ' + result.materials
    + ' · 면노멀 구운 메시 ' + result.flatBaked + (poseArg ? ' · 포즈 ' + poseArg : ''));
})();
