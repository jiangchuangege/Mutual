const fs = require('node:fs');
const p = 'C:/ts/src/core/gameFarm.ts';
let t = fs.readFileSync(p, 'utf8');
const from = "    'var SCENERY_SPRITES=' + JSON.stringify(SCENERY_SPRITES) + ';';";
const to = "    'var SCENERY_SPRITES=' + JSON.stringify(SCENERY_SPRITES) + ';' +\n    'var MYROLE=' + JSON.stringify(role === 'B' ? 'B' : 'A') + ';';";
if (!t.includes(from)) throw new Error('找不到数据块结尾');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('MYROLE 注入完成');
