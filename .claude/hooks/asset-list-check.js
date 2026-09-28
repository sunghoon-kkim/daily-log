// Stop 훅: js/ 실제 파일, index.html의 <script> 목록, sw.js의 CORE_ASSETS가 서로 맞는지 확인
// (목록이 어긋나면 새 파일이 로드되지 않거나, 없는 파일을 캐싱하려다 서비스워커 설치가 통째로 실패함)
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', (d) => (input += d)).on('end', () => {
  try {
    if (JSON.parse(input).stop_hook_active) return; // 같은 경고로 무한 반복 방지
  } catch (e) {}

  const root = path.resolve(__dirname, '..', '..');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

  const files = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
  const html = [...read('index.html').matchAll(/<script\s+src="(js\/[^"?]+)/g)].map((m) => m[1]);
  const swBlock = (read('sw.js').match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
  const sw = [...swBlock.matchAll(/'\.\/(js\/[^']+)'/g)].map((m) => m[1]);

  const problems = [];
  const diff = (a, b) => a.filter((x) => !b.includes(x));
  diff(files, html).forEach((f) => problems.push(`${f}: index.html <script>에 없음`));
  diff(files, sw).forEach((f) => problems.push(`${f}: sw.js CORE_ASSETS에 없음`));
  diff(html, files).forEach((f) => problems.push(`${f}: index.html에 있지만 실제 파일 없음`));
  diff(sw, files).forEach((f) => problems.push(`${f}: sw.js에 있지만 실제 파일 없음 (서비스워커 설치 실패 원인)`));
  if (!problems.length && html.join() !== sw.join()) {
    problems.push('index.html <script> 순서와 sw.js CORE_ASSETS 순서가 다름 (main.js가 항상 먼저)');
  }

  if (problems.length) {
    console.error('JS 파일 등록 목록 불일치:\n- ' + problems.join('\n- '));
    process.exit(2);
  }
});
