const fs = require('node:fs');
const src = fs.readFileSync('C:/ts/src/core/farmArt.ts', 'utf8');
const buf = Buffer.from(src.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1], 'base64');
let off = 8;
let plte = null, trns = null;
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 'PLTE') plte = data;
  if (type === 'tRNS') trns = data;
  off += 12 + len;
  if (type === 'IEND') break;
}
const rows = [];
for (let i = 0; i < 106; i++) {
  const r = plte[i * 3], g = plte[i * 3 + 1], b = plte[i * 3 + 2];
  const a = trns[i];
  const nearWhite = r > 225 && g > 225 && b > 225;
  rows.push(`${i}: rgb(${r},${g},${b}) a=${a}${nearWhite ? ' <== 近白' : ''}`);
}
console.log(rows.join('\n'));
console.log('\n--- 近白索引数:', rows.filter((r) => r.includes('近白')).length);
