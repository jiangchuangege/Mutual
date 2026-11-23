const fs = require('node:fs');
let t = fs.readFileSync('C:/ts/tools/dbg-localsave.cjs', 'utf8');
const from = `const h2 = boot();
h2.frame(2);
console.log('重进: coins', h2.sandbox.coins);`;
const to = `const h2 = boot();
h2.frame(2);
console.log('重进: coins', h2.sandbox.coins);
try {
  h2.sandbox.dec(w);
  console.log('手动 dec 后 coins:', h2.sandbox.coins);
} catch (e) {
  console.log('dec 抛错:', e && e.message);
}
try {
  const save = h2.sandbox.loadLocalSave();
  console.log('loadLocalSave 返回:', save ? ('有, 长度 ' + String(save.w).length) : 'null');
  console.log('sandbox.localStorage 有值?', !!h2.sandbox.localStorage.getItem('mutual_farm_v1'));
} catch (e) {
  console.log('loadLocalSave 抛错:', e && e.message);
}`;
if (!t.includes(from)) throw new Error('找不到结尾');
t = t.replace(from, to);
fs.writeFileSync('C:/ts/tools/dbg-localsave2.cjs', t, 'utf8');
console.log('ok');
