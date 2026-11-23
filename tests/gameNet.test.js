// 双人联机运行层（gameNet）的纯逻辑测试
const test = require('node:test');
const assert = require('node:assert');

const {
  seedOf,
  makePrng,
  encodeInput,
  decodeInput,
  encodePacket,
  decodePacket,
  readGameManifest,
  titleFromFileName,
  buildNetShim,
  injectNetShim,
  DEFAULT_THROTTLE_MS,
} = require('../dist-core/gameNet.js');

test('联机种子：同一对 + 同一游戏 → 两台手机同一个种子', () => {
  const a = seedOf('space123:game456');
  const b = seedOf('space123:game456');
  assert.equal(a, b);
  assert.notEqual(a, seedOf('space123:game457'));
  assert.ok(a > 0);
});

test('同种子随机：两台手机产生完全相同的序列（世界才对得上）', () => {
  const r1 = makePrng(seedOf('pair:game'));
  const r2 = makePrng(seedOf('pair:game'));
  const s1 = [r1(), r1(), r1(), r1()];
  const s2 = [r2(), r2(), r2(), r2()];
  assert.deepEqual(s1, s2);
  for (const v of s1) assert.ok(v >= 0 && v < 1);
  // 不同种子必须不一样，否则两台手机就是同一个"运气"
  const r3 = makePrng(seedOf('pair:game2'));
  assert.notDeepEqual([r3(), r3()], [s1[0], s1[1]]);
});

test('输入编码：键名 + 归一化坐标，能被还原', () => {
  const key = encodeInput({ type: 'keydown', key: 'ArrowLeft' });
  const k = decodeInput(key);
  assert.equal(k.type, 'keydown');
  assert.equal(k.key, 'ArrowLeft');
  assert.equal(k.x, null);

  const touch = encodeInput({ type: 'pointerdown', x: 0.12345, y: 0.98765 });
  const t = decodeInput(touch);
  assert.equal(t.type, 'pointerdown');
  assert.equal(t.x, 0.123);
  assert.equal(t.y, 0.988);

  // 竖线是分隔符，键名里不能有它（否则解析会错位）
  const dirty = encodeInput({ type: 'keydown', key: 'a|b' });
  assert.equal(decodeInput(dirty).key, 'ab');
});

test('坏数据不会让游戏崩：解码一律返回 null 而不是抛错', () => {
  assert.equal(decodePacket(''), null);
  assert.equal(decodePacket('not json'), null);
  assert.equal(decodePacket('[]'), null);
  assert.equal(decodePacket('{"t":"i"}'), null);
  assert.equal(decodePacket('{"t":"i","s":1,"q":[]}'), null);
  assert.equal(decodePacket('{"t":"zzz"}'), null);
  assert.equal(decodeInput('nope'), null);
});

test('输入包：正常包保留序号和内容', () => {
  const pkt = { t: 'i', s: 12, q: ['keydown|a', 'keyup|a'] };
  const back = decodePacket(encodePacket(pkt));
  assert.deepEqual(back, pkt);
});

test('输入包：超过 200 条的包被截断（防止对方刷爆）', () => {
  const q = new Array(500).fill('keydown|a');
  const back = decodePacket(JSON.stringify({ t: 'i', s: 0, q }));
  assert.equal(back.q.length, 200);
});

test('局面包：超过 2MB 直接拒收', () => {
  const big = 'x'.repeat(2_000_001);
  assert.equal(decodePacket(JSON.stringify({ t: 's', d: big })), null);
  const small = decodePacket(JSON.stringify({ t: 's', d: 'hi' }));
  assert.equal(small.d, 'hi');
});

test('动作包：任意 JSON 都能过', () => {
  const back = decodePacket(JSON.stringify({ t: 'a', d: { move: [1, 2] } }));
  assert.deepEqual(back.d, { move: [1, 2] });
});

test('清单：下载来的游戏可以声明标题和人数', () => {
  const html = '<!doctype html><html><head><!--mutual-game {"title":"像素农场","players":2}--></head></html>';
  const man = readGameManifest(html);
  assert.equal(man.title, '像素农场');
  assert.equal(man.players, 2);

  assert.equal(readGameManifest('<html></html>').title, null);
  // 坏 JSON 不能抛
  assert.equal(readGameManifest('<!--mutual-game {oops}-->').title, null);
});

test('标题兜底：从文件名推一个能看的名字', () => {
  assert.equal(titleFromFileName('pixel-farm_1.0.0.html'), 'pixel farm 1.0.0');
  assert.equal(titleFromFileName('C:\\Users\\me\\Downloads\\game.html'), 'game');
  assert.equal(titleFromFileName(''), '导入的游戏');
});

test('注入的联机层：带上角色/种子/节流，并且是可执行脚本', () => {
  const shim = buildNetShim({ role: 'B', seed: seedOf('x'), throttleMs: 60 });
  assert.ok(shim.includes("var ROLE = 'B';"));
  assert.ok(shim.includes('Math.random ='));
  assert.ok(shim.includes('window.TwNet = api'));
  assert.ok(shim.includes('TW_NET:'));
  // 不能残留未替换的占位符（否则页面里会语法错）
  assert.ok(!shim.includes('__ROLE__'));
  assert.ok(!shim.includes('__SEED__'));
  assert.ok(!shim.includes('__MODE__'));
  assert.ok(!shim.includes('__THROTTLE__'));
  assert.equal(DEFAULT_THROTTLE_MS, 60);
});

test('联机层必须注入在游戏脚本之前（否则随机数已经被用掉了）', () => {
  const html = '<html><head><title>x</title></head><body><script>var a=Math.random()</script></body></html>';
  const out = injectNetShim(html, { role: 'A', seed: 7 });
  const netAt = out.indexOf('window.__TW_NET__');
  const gameAt = out.indexOf('var a=Math.random()');
  assert.ok(netAt > 0 && gameAt > netAt, '联机层要在游戏代码前面');
  // 没有 head 的页面也要能注入（注入的 <script> 放在最前面）
  const raw = '<script>boot()</script>';
  const out2 = injectNetShim(raw, { role: 'A', seed: 1 });
  assert.ok(out2.startsWith('<script>'));
  assert.ok(out2.indexOf('window.__TW_NET__') < out2.indexOf('boot()'));
});
