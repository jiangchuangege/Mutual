// 把 tileset 按 16px 网格放大并标注坐标，方便挑格子
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const src = process.argv[2];
const out = process.argv[3] || 'tmp/tiles-grid-16.png';
const CELL = 32; // 16px 格放大 2 倍
const img = fs.readFileSync(src);
const w = img.readUInt32BE(16);
const h = img.readUInt32BE(20);
const file = path.resolve('tmp/_grid.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
const dataUri = 'data:image/png;base64,' + img.toString('base64');

const labels = [];
for (let y = 0; y < h / 16; y += 8) {
  for (let x = 0; x < w / 16; x += 8) {
    labels.push(`<span style="left:${x * CELL + 2}px;top:${y * CELL + 2}px">${x},${y}</span>`);
  }
}

fs.writeFileSync(
  file,
  `<!doctype html><html><body style="margin:0;background:#111">
<div style="position:relative;width:${(w / 16) * CELL}px;height:${(h / 16) * CELL}px">
<img src="${dataUri}" style="position:absolute;width:${(w / 16) * CELL}px;image-rendering:pixelated">
<div style="position:absolute;inset:0;background-image:
linear-gradient(to right,rgba(0,255,255,.25) 1px,transparent 1px),
linear-gradient(to bottom,rgba(0,255,255,.25) 1px,transparent 1px);
background-size:${CELL}px ${CELL}px"></div>
${labels.join('')}
</div>
<style>span{position:absolute;color:#0ff;font:9px monospace;background:#000a;padding:0 1px}</style>
</body></html>`,
  'utf8',
);

execFileSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  '--window-size=1100,1100', '--virtual-time-budget=2500',
  '--screenshot=' + path.resolve(out), 'file:///' + file.replace(/\\/g, '/'),
], { stdio: 'ignore' });
console.log('已生成', out, w + 'x' + h);
