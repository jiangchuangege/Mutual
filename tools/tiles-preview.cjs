// 把 tiny-dungeon 的逐个小图拼成带编号的预览图，方便挑素材
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = path.resolve('tmp/assets/tiny-dungeon/Tiles');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const COLS = 12, CELL = 64;
const rows = Math.ceil(files.length / COLS);
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#1d1f24;color:#fff;font:11px monospace}
.w{position:relative;width:${COLS * CELL}px}
img{position:absolute;width:56px;height:56px;image-rendering:pixelated}
span{position:absolute;background:#000a;padding:0 2px;font-size:10px}</style></head><body><div class="w"
style="height:${rows * CELL}px">
${files.map((f, i) => {
  const n = parseInt(f.replace('tile_', '').replace('.png', ''), 10);
  const x = (i % COLS) * CELL + 4;
  const y = Math.floor(i / COLS) * CELL + 4;
  return `<img src="file:///${dir.replace(/\\/g, '/')}/${f}" style="left:${x}px;top:${y}px"><span style="left:${x}px;top:${y + 56}px">${n}</span>`;
}).join('\n')}
</div></body></html>`;
fs.writeFileSync('tmp/tiles-preview.html', html, 'utf8');
const shot = path.resolve('tmp/tiles-preview.png');
execFileSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  '--window-size=' + (COLS * CELL + 20) + ',' + (rows * CELL + 20),
  '--virtual-time-budget=3000', '--screenshot=' + shot, 'file:///' + path.resolve('tmp/tiles-preview.html').replace(/\\/g, '/'),
], { stdio: 'ignore' });
console.log('预览:', shot, files.length, '个小图');
