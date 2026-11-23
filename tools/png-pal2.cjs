const fs = require('node:fs');
const buf = fs.readFileSync('C:/ts/tmp/assets/animal-pack-remastered/PNG/Square/chicken.png');
let off = 8, plte = null, trns = null;
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 'PLTE') plte = data;
  if (type === 'tRNS') trns = data;
  if (type === 'IDAT') break;
  off += 12 + len;
}
const n = plte.length / 3;
const rows = [];
for (let i = 0; i < n; i++) {
  const r = plte[i * 3], g = plte[i * 3 + 1], b = plte[i * 3 + 2];
  const a = trns && i < trns.length ? trns[i] : 255;
  rows.push(`${i}: #${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')} a=${a}`);
}
console.log('调色板', n, '色');
console.log(rows.join('\n'));
