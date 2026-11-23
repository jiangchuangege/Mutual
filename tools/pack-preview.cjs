// 通用素材预览：把某个 Tiles 目录拼成带编号的图
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dirArg = process.argv[2];
const outName = process.argv[3] || 'preview';
const COLS = Number(process.argv[4] || 24);
const CELL = 56;
const dir = path.resolve(dirArg);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const rows = Math.ceil(files.length / COLS);
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#1d1f24;color:#fff;font:10px monospace}
.w{position:relative;width:${COLS * CELL}px;height:${rows * CELL}px}
img{position:absolute;width:48px;height:48px;image-rendering:pixelated}
span{position:absolute;background:#000a;padding:0 1px}</style></head><body><div class="w">
${files.map((f, i) => {
  const n = parseInt(String(f).replace(/[^0-9]/g, ''), 10) || i;
  const x = (i % COLS) * CELL + 4;
  const y = Math.floor(i / COLS) * CELL + 2;
  return `<img src="file:///${dir.replace(/\\/g, '/')}/${f}" style="left:${x}px;top:${y}px"><span style="left:${x}px;top:${y + 48}px">${n}</span>`;
}).join('\n')}
</div></body></html>`;
const htmlPath = path.resolve('tmp/' + outName + '.html');
fs.writeFileSync(htmlPath, html, 'utf8');
const shot = path.resolve('tmp/' + outName + '.png');
execFileSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  '--window-size=' + (COLS * CELL + 16) + ',' + (rows * CELL + 16),
  '--virtual-time-budget=3000', '--screenshot=' + shot, 'file:///' + htmlPath.replace(/\\/g, '/'),
], { stdio: 'ignore' });
console.log('预览:', shot, files.length);
