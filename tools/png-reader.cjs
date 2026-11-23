// 读 PNG → RGBA（无依赖，用于素材测量）
const fs = require('node:fs');
const zlib = require('node:zlib');

function decodePngFile(file) {
  const buf = fs.readFileSync(file);
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

module.exports = { decodePngFile };
