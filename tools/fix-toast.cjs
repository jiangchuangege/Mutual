const fs = require('node:fs');
const p = 'C:/ts/src/store.tsx';
const L = fs.readFileSync(p, 'utf8').split('\n');
let fixed = 0;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes('res.value.name') || (L[i].includes('toast(') && L[i].includes('res.value.blocks'))) {
    L[i] = "    this.toast(`模组已生成 ${res.value?.blocks ?? 0} 格`, 'ok');";
    fixed += 1;
  }
}
fs.writeFileSync(p, L.join('\n'), 'utf8');
console.log('修正行数:', fixed);
