// 量一下角色/动物/作物精灵的不透明包围盒，决定绘制尺寸
const fs = require('node:fs');
const zlib = require('node:zlib');

function decode(buf) {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const ct = buf[25];
  let off = 8, plte = null, trns = null;
  const idat = [];
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
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = Buffer.from(raw.slice(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      line[i] = v;
    }
    prev = line;
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      if (ct === 3) {
        const idx = line[x];
        out[di] = plte[idx * 3]; out[di + 1] = plte[idx * 3 + 1]; out[di + 2] = plte[idx * 3 + 2];
        out[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (ct === 6) {
        out[di] = line[x * 4]; out[di + 1] = line[x * 4 + 1]; out[di + 2] = line[x * 4 + 2]; out[di + 3] = line[x * 4 + 3];
      } else {
        out[di] = line[x * 3]; out[di + 1] = line[x * 3 + 1]; out[di + 2] = line[x * 3 + 2]; out[di + 3] = 255;
      }
    }
  }
  return { w, h, d: out };
}

function bbox(file, frames) {
  const png = decode(fs.readFileSync(file));
  const fw = png.w / frames;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < png.h; y++) {
    for (let x = 0; x < fw; x++) {
      const a = png.d[(y * png.w + x) * 4 + 3];
      if (a > 20) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { file: file.split('/').pop(), frame: Math.round(fw) + 'x' + png.h, used: (maxX - minX + 1) + 'x' + (maxY - minY + 1), top: minY, bottom: maxY };
}

const R = 'C:/Users/Jiao/Downloads/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets';
console.log(bbox(R + '/Characters/Human/WALKING/base_walk_strip8.png', 8));
console.log(bbox(R + '/Characters/Human/IDLE/base_idle_strip9.png', 9));
console.log(bbox(R + '/Elements/Animals/spr_deco_chicken_01_strip4.png', 4));
console.log(bbox(R + '/Elements/Animals/spr_deco_cow_strip4.png', 4));
console.log(bbox(R + '/Elements/Plants/spr_deco_tree_01_strip4.png', 4));
console.log(bbox(R + '/Elements/Crops/carrot_05.png', 1));
