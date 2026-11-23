const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
if (t.includes('每个包都带完整状态')) { console.log('已有'); process.exit(0); }

const anchor = "test('自动存档：重进能把钱、作物、动物读回来', () => {";
if (!t.includes(anchor)) throw new Error('找不到锚点');

const block = `test('同步：每个包都带完整状态（否则退出重进会回默认值）', () => {
  const h = boot('A');
  h.frame(3);
  h.start();
  h.frame(120);            // 跑两秒，让它发一批心跳
  assert.ok(h.sent.length > 0, '应该有发包');
  const missing = h.sent.filter((p) => typeof p.w !== 'string' || p.w.length < 10);
  assert.equal(missing.length, 0, '每个包都要带 w（App 就靠它存档）');
  assert.ok(h.sent.every((p) => p.from === 'A' || p.from === 'B'), '每个包都带身份');
});

test('同步：B 的旧心跳不会冲掉 A 的进度，B 的真改动会被采纳', () => {
  let A;
  let B;
  A = boot('A', (json) => B && B.applyRemote(json));
  B = boot('B', (json) => A && A.applyRemote(json));
  A.frame(3); B.frame(3);
  A.start(); B.start();
  A.frame(3); B.frame(3);

  const staleW = B.lastState();          // A 改动之前，B 那边的状态
  const items = A.sandbox.marketItems();
  const target = items.find((it) => !it.done && it.p <= A.sandbox.coins);
  assert.ok(target, '要有一件买得起的商品');
  A.sandbox.buyMarket(target);
  A.frame(3);
  const afterA = A.sandbox.coins;

  // 旧心跳：chg=0 → 不采纳
  A.applyRemote(JSON.stringify({ t: 1, w: staleW, o: [], x: 0, y: 0, from: 'B', chg: 0 }));
  A.frame(3);
  assert.equal(A.sandbox.coins, afterA, 'B 的旧状态不该覆盖 A');

  // 真改动：chg=1 → 采纳
  const newer = JSON.stringify({ t: 2, w: staleW, o: [], x: 0, y: 0, from: 'B', chg: 1 });
  A.applyRemote(newer);
  A.frame(3);
  assert.notEqual(A.sandbox.coins, afterA, 'B 真改了东西就要采纳');
});

`;
t = t.replace(anchor, block + anchor);
fs.writeFileSync(p, t, 'utf8');
console.log('新增两条同步回归测试');
