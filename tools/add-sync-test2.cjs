const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// 中继：把收到的 TW_STATE 转给对面
sub(`      posted.push(json);
      sent.push(JSON.parse(json));
    },
  };
  vm.createContext(sandbox);`,
`      posted.push(json);
      sent.push(JSON.parse(json));
      if (relay) relay(json);
    },
  };
  vm.createContext(sandbox);`, '中继');

// 同步测试：放在"自动存档"前
const anchor = "test('农场：退出重进能把世界读回来（自动存档）', () => {";
if (!t.includes(anchor)) throw new Error('找不到锚点');
const test = `test('双人同步：B 花钱后 A 会合并并回广播，两边钱数一致', () => {
  let A;
  let B;
  A = boot('A', (json) => B && B.applyRemote(json));
  B = boot('B', (json) => A && A.applyRemote(json));
  A.frame(3); B.frame(3);
  A.start(); B.start();
  A.frame(3); B.frame(3);

  const coinsOf = (h) => parse(h.lastState()).coins;
  const before = coinsOf(B);
  assert.equal(coinsOf(A), before, '开局两边一致');

  B.sandbox.buyMarket(B.sandbox.marketItems()[0]);
  B.frame(3);
  const afterB = coinsOf(B);
  assert.ok(afterB < before, 'B 这边扣钱了');

  for (let i = 0; i < 20; i++) { A.frame(2); B.frame(2); }
  assert.equal(coinsOf(A), afterB, 'A 合并后变成扣过钱的数');
  assert.equal(coinsOf(B), afterB, 'B 保持扣过钱的数');
});

`;
t = t.replace(anchor, test + anchor);
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / ') || '同步测试已插');
