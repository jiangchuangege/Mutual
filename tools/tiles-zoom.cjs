// 放大图集某一区域并逐格标注（1 格 = 16px）
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const src = process.argv[2];
const cols = Number(process.argv[3] || 24);
const rows = Number(process.argv[4] || 12);
const out = process.argv[5] || 'tmp/tiles-zoom.png';
const CELL = 48;

const img = fs.readFileSync(src);
const dataUri = 'data:image/png;base64,' + img.toString('base64');
const file = path.resolve('tmp/_zoom.html');
const labels = [];
for (let y = 0; y < rows; y += 1) {
  for (let x = 0; x < cols; x += 1) {
    labels.push(`<span style="left:${x * CELL + 2}px;top:${y * CELL + 1}px">${x},${y}</span>`);
  }
}
fs.writeFileSync(file, `<!doctype html><body style="margin:0;background:#101010">
<div style="position:relative;width:${cols * CELL}px;height:${rows * CELL}px;overflow:hidden">
<div style="position:absolute;width:${1024 * CELL / 16}px;height:${1024 * CELL / 16}px;
background-image:url(${dataUri});background-size:${1024 * CELL / 16}px ${1024 * CELL / 16}px;image-rendering:pixelated"></div>
<div style="position:absolute;inset:0;background-image:
linear-gradient(to right,rgba(0,255,255,.3) 1px,transparent 1px),
linear-gradient(to bottom,rgba(0,255,255,.3) 1px,transparent 1px);
background-size:${CELL}px ${CELL}px"></div>
${labels.join('')}</div>
<style>span{position:absolute;color:#0ff;font:10px monospace;background:#000b;padding:0 1px}</style>
</body>`, 'utf8');
execFileSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  '--window-size=' + (cols * CELL + 16) + ',' + (rows * CELL + 16),
  '--virtual-time-budget=2500', '--screenshot=' + path.resolve(out),
  'file:///' + file.replace(/\\/g, '/'),
], { stdio: 'ignore' });
console.log('已生成', out);
