// 分析 tileset：按 16px 格子算"平均颜色 + 不透明占比"，找可用的草地/泥土/水/石头格子
const fs = require('node:fs');
const zlib = require('node:zlib');

function decodePng(buf) {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const bitDepth = buf[24];
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
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 1;
  if (bitDepth !== 8) throw new Error('只支持 8bit，当前 ' + bitDepth);
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const filter = raw[p++];
    const line = Buffer.from(raw.slice(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pred) & 0xff;
      }
      line[i] = v;
    }
    prev = line;
    for (let x = 0; x < w; x += 1) {
      const di = (y * w + x) * 4;
      if (colorType === 3) {
        const idx = line[x];
        out[di] = plte[idx * 3];
        out[di + 1] = plte[idx * 3 + 1];
        out[di + 2] = plte[idx * 3 + 2];
        out[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 6) {
        out[di] = line[x * 4];
        out[di + 1] = line[x * 4 + 1];
        out[di + 2] = line[x * 4 + 2];
        out[di + 3] = line[x * 4 + 3];
      } else {
        out[di] = line[x * 3];
        out[di + 1] = line[x * 3 + 1];
        out[di + 2] = line[x * 3 + 2];
        out[di + 3] = 255;
      }
    }
  }
  return { w, h, data: out, colorType };
}

const file = process.argv[2];
const png = decodePng(fs.readFileSync(file));
console.log('尺寸', png.w + 'x' + png.h, 'colorType', png.colorType);

const T = 16;
const stats = [];
for (let ty = 0; ty < png.h / T; ty += 1) {
  for (let tx = 0; tx < png.w / T; tx += 1) {
    let r = 0, g = 0, b = 0, opaque = 0;
    for (let y = 0; y < T; y += 1) {
      for (let x = 0; x < T; x += 1) {
        const i = ((ty * T + y) * png.w + (tx * T + x)) * 4;
        const al = png.data[i + 3];
        if (al > 200) {
          opaque += 1;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
        }
      }
    }
    if (opaque < T * T * 0.9) continue;
    stats.push({ tx, ty, r: r / opaque, g: g / opaque, b: b / opaque });
  }
}

function show(label, filter) {
  const hits = stats.filter(filter).slice(0, 14);
  console.log('\n' + label + ':', hits.map((s) => `${s.tx},${s.ty}(#${[s.r, s.g, s.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')})`).join('  '));
}

show('草地（绿）', (s) => s.g > 90 && s.g > s.r + 12 && s.g > s.b + 12);
show('泥土（棕）', (s) => s.r > 85 && s.r > s.g + 10 && s.g > s.b);
show('水（蓝）', (s) => s.b > 110 && s.b > s.r + 25 && s.b > s.g + 10);
show('石头/灰', (s) => Math.abs(s.r - s.g) < 12 && Math.abs(s.g - s.b) < 12 && s.r > 100 && s.r < 190);
console.log('\n完全不透明的格子总数', stats.length);
