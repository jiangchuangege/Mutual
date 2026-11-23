const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
if (t.includes('本机存档')) { console.log('已存在'); process.exit(0); }

// harness：给一个内存版 localStorage
const anchor = `  const sandbox = {
    document,`;
if (!t.includes(anchor)) throw new Error('找不到 sandbox 定义');
t = t.replace(anchor, `  const ls = (globalThis.__LS__ = globalThis.__LS__ || new Map());
  const localStorageStub = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); },
  };
  const sandbox = {
    document,
    localStorage: localStorageStub,`);

// 新增测试：退出重进（同一台手机）金币不回默认值
const tAnchor = "test('自动存档：重进能把钱、作物、动物读回来', () => {";
if (!t.includes(tAnchor)) throw new Error('找不到锚点');
const block = `test('本机存档：退出重进（同一台手机）金币不会回到初始值', () => {
  const h1 = boot('A');
  h1.frame(3);
  h1.start();
  h1.frame(3);
  // 买一件东西，钱变了
  const items = h1.sandbox.marketItems();
  const target = items.find((it) => !it.done && it.p <= h1.sandbox.coins);
  h1.sandbox.buyMarket(target);
  h1.frame(200);                       // 跑过两秒，触发本机存档
  const spent = h1.sandbox.coins;
  assert.ok(spent < 520, '钱确实花了');
  assert.ok(h1.sandbox.localStorage.getItem('mutual_farm_v1'), '本地存下了世界存档');

  // 模拟"退出再进来"：新开一个 WebView（没有服务端局面）
  const h2 = boot('A');
  h2.frame(3);
  assert.equal(h2.sandbox.coins, spent, '重进后金币从本机存档恢复');
});

`;
t = t.replace(tAnchor, block + tAnchor);
fs.writeFileSync(p, t, 'utf8');
console.log('加了本机存档回归测试');
