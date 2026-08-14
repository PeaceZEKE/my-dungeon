// 뷰어 HTML의 <script src="three.r128.min.js"> 를 실제 내용으로 바꿔 '단일 파일'을 만든다.
//
// 저장소에는 분리된 형태(작은 HTML + 공용 three.r128.min.js)를 둔다 — 뷰어마다 600KB씩
// 복사되지 않고, diff도 읽을 수 있다. GitHub Pages에서는 이대로 열면 그냥 동작한다.
// 다만 파일 하나만 받아서 열면(모바일에서 흔하다) 옆의 three.js를 못 찾아 빈 화면이 된다.
// 그래서 사람에게 보낼 때는 이 스크립트로 단일 파일을 만들어 보낸다.
//
//   node viewers/build-standalone.js viewers/<이름>.html [출력경로]
//
// 출력 기본값은 dist/<이름>.html (저장소에 커밋하지 않는다 — .gitignore 참고).
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('사용법: node viewers/build-standalone.js viewers/<이름>.html [출력경로]'); process.exit(1); }
const dir = path.dirname(src);
let html = fs.readFileSync(src, 'utf8');

const TAG = /<script src="(three\.r128\.min\.js)"><\/script>/;
const m = TAG.exec(html);
if (!m) { console.error('three.r128.min.js 를 부르는 <script> 태그를 찾지 못했다: ' + src); process.exit(1); }

const lib = fs.readFileSync(path.join(dir, m[1]), 'utf8');
// </script> 가 라이브러리 안에 문자열로 들어 있으면 HTML 파서가 거기서 블록을 끊는다.
if (/<\/script/i.test(lib)) { console.error('라이브러리 안에 </script> 문자열이 있다 — 그대로 인라인하면 깨진다'); process.exit(1); }
html = html.replace(TAG, '<script>/* three.js r128 — 단일 파일용 인라인(원본: viewers/' + m[1] + ') */\n' + lib + '\n</script>');

const out = process.argv[3] || path.join(dir, 'dist', path.basename(src));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out + '  ' + (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
