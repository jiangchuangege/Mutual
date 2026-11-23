// 把 Kenney 图集按 64px 网格画出来并标注坐标，方便挑合适的格子
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { FARM_TILES_SHEET, TILE } = require('../dist-core/farmTiles.js');

const COLS = 23;
const ROWS = 13;
const CELL = 72;
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#222;color:#fff;font:10px monospace}
.wrap{position:relative;width:${COLS * CELL}px;height:${ROWS * CELL}px}
img{position:absolute;left:0;top:0;width:${COLS * CELL}px;height:${ROWS * CELL}px;image-rendering:pixelated}
.g{position:absolute;left:0;top:0;width:${COLS * CELL}px;height:${ROWS * CELL}px;
background-image:linear-gradient(to right,rgba(0,255,255,.35) 1px,transparent 1px),
linear-gradient(to bottom,rgba(0,255,255,.35) 1px,transparent 1px);
background-size:${CELL}px ${CELL}px}
span{position:absolute;background:#000a;padding:0 2px;z-index:3}</style></head>
<body><div class="wrap"><img src="${FARM_TILES_SHEET}"><div class="g"></div>
${Array.from({ length: COLS * ROWS }, (_, i) => {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return `<span style="left:${c * CELL + 2}px;top:${r * CELL + 2}px">${c},${r}</span>`;
}).join('')}
</div></body></html>`;

const out = path.resolve('tmp');
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'tiles-grid.html');
fs.writeFileSync(file, html, 'utf8');
const shot = path.join(out, 'tiles-grid.png');
execFileSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--window-size=' + (COLS * CELL + 20) + ',' + Math.min(4000, ROWS * CELL + 20),
  '--virtual-time-budget=3000', '--screenshot=' + shot,
  'file:///' + file.replace(/\\/g, '/'),
], { stdio: 'ignore' });
console.log('图集网格:', shot, fs.statSync(shot).size, 'bytes', 'TILE=' + TILE);
