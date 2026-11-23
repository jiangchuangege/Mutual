const fs = require('node:fs');
const src = fs.readFileSync('C:/ts/src/core/farmArt.ts', 'utf8');
const buf = Buffer.from(src.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1], 'base64');
let off = 8;
const chunks = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  chunks.push(type + '(' + len + ')');
  if (type === 'tRNS') {
    const n = len;
    console.log('tRNS 长度', n, '前 8 个 alpha:', [...buf.slice(off + 8, off + 8 + Math.min(8, n))]);
  }
  if (type === 'PLTE') console.log('调色板色数', len / 3);
  off += 12 + len;
  if (type === 'IEND') break;
}
console.log(chunks.join(' '));
