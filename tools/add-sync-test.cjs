const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
const ok = [];
function sub(from, to, tag) { if (!t.includes(from)) { console.log('MISS', tag); return; } t = t.replace(from, to); ok.push(tag); }

// boot 支持 role + 中继
sub("function boot() {\n  const html = buildFarmHtml();",
    "function boot(role = 'A', relay) {\n  const html = buildFarmHtml(role);", 'boot role');
sub(`  sandbox.window.ReactNativeWebView = {
    postMessage: (data) => {
      assert.equal(typeof data, 'string');
      assert.ok(data.startsWith('TW_STATE:'), '必须走 TW_STATE 前缀');
      const json = data.slice('TW_STATE:'.length);
      posted.push(json);
      sent.push(JSON.parse(json));
    },
  };`,
`  sandbox.window.ReactNativeWebView = {
    postMessage: (data) => {
      assert.equal(typeof data, 'string');
      assert.ok(data.startsWith('TW_STATE:'), '必须走 TW_STATE 前缀');
      const json = data.slice('TW_STATE:'.length);
      posted.push(json);
      sent.push(JSON.parse(json));
      if (relay) relay(json);
    },
  };`, '中继');

// 新增：双人同步测试（B 花钱，两边必须一致）
sub(`test('农场：退出重进能把世界读回来（自动存档）', () => {`,
`test('双人同步：B 花钱后 A 会合并并回广播，两边钱数一致', () => {
  /** @type {any} */
  let A;
  /** @type {any} */
  let B;
  A = boot('A', (json) => B && B.applyRemote(json));
  B = boot('B', (json) => A && A.applyRemote(json));
  A.frame(3); B.frame(3);
  A.start(); B.start();
  A.frame(3); B.frame(3);

  const coinsOf = (h) => parse(h.lastState()).coins;
  const before = coinsOf(B);
  assert.equal(coinsOf(A), before, '开局两边一样');

  // B 直接买一只动物（会扣钱）
  B.sandbox.buyMarket(B.sandbox.marketItems()[0]);
  B.frame(3);
  const afterB = coinsOf(B);
  assert.ok(afterB < before, 'B 这边扣钱了');

  // A 收到 B 的整包 → 合并 → 回广播；B 再采纳，两边收敛
  for (let i = 0; i < 20; i++) { A.frame(2); B.frame(2); }
  assert.equal(coinsOf(A), afterB, 'A 这边也变成扣过钱的数');
  assert.equal(coinsOf(B), afterB, 'B 保持扣过钱的数');
});

test('农场：退出重进能把世界读回来（自动存档）', () => {`, '同步测试');
fs.writeFileSync(p, t, 'utf8');
console.log('改了:', ok.join(' / '));
