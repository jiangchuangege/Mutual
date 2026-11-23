// 分类图集 16px 格子：输出字母地图 + 每类“纯色”候选，用来挑地面块
const fs = require('node:fs');
const zlib = require('node:zlib');

function decodePng(buf) {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const colorType = buf[25];
  let off = 8;
  const idat = [];
  let plte = null;
  let trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'PLTE') plte = data;
    if (type === 'tRNS') trns = data;
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  const cur = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < h; y += 1) {
    const ft = raw[pos]; pos += 1;
    raw.copy(cur, 0, pos, pos + stride); pos += stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[i] = v;
    }
    for (let x = 0; x < w; x += 1) {
      const s = x * bpp, d = (y * w + x) * 4;
      if (colorType === 3) {
        const pi = cur[s] * 3;
        out[d] = plte[pi]; out[d + 1] = plte[pi + 1]; out[d + 2] = plte[pi + 2];
        out[d + 3] = trns && cur[s] < trns.length ? trns[cur[s]] : 255;
      } else if (bpp === 4) {
        out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = cur[s + 3];
      } else if (bpp === 3) {
        out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = 255;
      } else {
        out[d] = out[d + 1] = out[d + 2] = cur[s]; out[d + 3] = 255;
      }
    }
    prev.set(cur);
  }
  return { w, h, data: out };
}

const SRC = process.argv[2];
const COLS = Number(process.argv[3] || 16);
const ROWS = Number(process.argv[4] || 12);
const png = decodePng(fs.readFileSync(SRC));

function cell(cx, cy) {
  let r = 0, g = 0, b = 0, n = 0, solid = 0;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const d = ((cy * 16 + y) * png.w + (cx * 16 + x)) * 4;
      const a = png.data[d + 3];
      if (a < 40) continue;
      solid += 1;
      r += png.data[d]; g += png.data[d + 1]; b += png.data[d + 2]; n += 1;
    }
  }
  if (!n) return { r: 0, g: 0, b: 0, a: 0, cls: '.' };
  r /= n; g /= n; b /= n;
  const cover = solid / 256;
  let cls = '?';
  if (g > r + 18 && g > b + 18) cls = 'G';                     // 草绿
  else if (b > r + 30 && b > g + 12) cls = 'B';                // 水蓝
  else if (r > 140 && g > 130 && b < 140 && b < g) cls = 'Y';   // 沙黄
  else if (r > 120 && r > b + 50 && g > 90) cls = 'T';          // 土黄 tan
  else if (r > 100 && r < 170 && g < 120 && b < 110) cls = 'R'; // 棕
  else if (r < 80 && g < 80 && b < 80) cls = 'K';               // 暗
  if (cover < 0.55) cls = cls.toLowerCase();                    // 小写=半透明/不满块
  return { r: r | 0, g: g | 0, b: b | 0, a: +cover.toFixed(2), cls };
}

const rows = [];
const buckets = { G: [], B: [], T: [], R: [], Y: [] };
for (let cy = 0; cy < ROWS; cy += 1) {
  let line = '';
  for (let cx = 0; cx < COLS; cx += 1) {
    const c = cell(cx, cy);
    line += c.cls;
    if (buckets[c.cls]) buckets[c.cls].push({ cx, cy, ...c });
  }
  rows.push(line.padEnd(COLS, '.'));
}
console.log('字母地图（行=' + ROWS + ' 列=' + COLS + '）');
rows.forEach((l, i) => console.log(String(i).padStart(2) + ' ' + l));
for (const k of Object.keys(buckets)) {
  const list = buckets[k].filter((c) => c.a >= 0.995).sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
  console.log('\n满块候选 ' + k + ' (' + list.length + '): ' +
    list.slice(0, 40).map((c) => `(${c.cx},${c.cy})#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`).join(' '));
}
