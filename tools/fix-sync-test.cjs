const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const from = `  B.sandbox.buyMarket(B.sandbox.marketItems()[0]);
  B.frame(3);`;
const to = `  // 挑一件"还没解锁/买得起"的（第一个种子默认已解锁，会买不动）
  const items = B.sandbox.marketItems();
  const target = items.find((it) => !it.done && it.p <= B.sandbox.coins);
  assert.ok(target, '要有一件买得起的商品');
  B.sandbox.buyMarket(target);
  B.frame(3);`;
if (!t.includes(from)) throw new Error('找不到购买行');
t = t.replace(from, to);
fs.writeFileSync(p, t, 'utf8');
console.log('同步测试改成买一件能买的');
