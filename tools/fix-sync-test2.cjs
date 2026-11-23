const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 测试里 setTimeout 直接执行（否则 A 的回广播不会发生）
sub('    setTimeout: () => 0,', '    setTimeout: (fn) => { if (typeof fn === \'function\') fn(); return 0; },', 'setTimeout 立即执行');

// 同步断言改用内存里的真实金币
sub(`  const coinsOf = (h) => parse(h.lastState()).coins;
  const before = coinsOf(B);
  assert.equal(coinsOf(A), before, '开局两边一致');`,
`  const coinsOf = (h) => h.sandbox.coins;
  const before = coinsOf(B);
  assert.equal(coinsOf(A), before, '开局两边一致');`, '金币取内存值');

fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
