const fs = require('node:fs');
const p = 'C:/ts/src/core/farmEngine2.ts';
let t = fs.readFileSync(p, 'utf8');
const from = `function step(dt){
  tick++;
  checkDay();`;
const to = `function step(dt){
  tick++;
  if(tick%120===0 && typeof saveLocalNow==='function') saveLocalNow();  // 两秒存一次本机存档
  checkDay();`;
if (!t.includes(from)) throw new Error('找不到 step');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('step 里加了两秒一次的本机存档');
