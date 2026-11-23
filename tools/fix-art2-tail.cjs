const fs = require('node:fs');
const p = 'C:/ts/src/core/farmArtKit2.ts';
let t = fs.readFileSync(p, 'utf8');
const marker = 'String.raw`';
if (!t.includes(marker)) throw new Error('没找到 String.raw');
// 去掉结尾孤立的 ";"
t = t.replace(/\n;\s*$/, '\n');
if (!t.trimEnd().endsWith('`;')) {
  t = t.trimEnd() + '\n`;\n';
}
fs.writeFileSync(p, t, 'utf8');
console.log('尾部现在是:', JSON.stringify(t.slice(-20)));
