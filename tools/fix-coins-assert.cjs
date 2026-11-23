const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const from = "assert.ok(st.coins < 180, '扣了种子钱');";
const to = "assert.ok(st.coins < 520, '扣了种子钱');";
if (t.includes(from)) { t = t.replace(from, to); fs.writeFileSync(p, t, 'utf8'); console.log('已改起始金币断言'); }
else console.log('没找到断言，当前含 520?', t.includes('520'));
