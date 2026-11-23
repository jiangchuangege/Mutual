/* eslint-disable */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ClockSync, sampleMetrics, MAX_USABLE_RTT_MS } = require('../dist-core/clockSync.js');

test('对称 100ms 单程 → offset 0，rtt 200', () => {
  const m = sampleMetrics({ t1: 0, t2: 100, t3: 100, t4: 200 });
  assert.equal(m.rtt, 200);
  assert.equal(m.offset, 0);
  assert.equal(m.usable, true);
});

test('服务端快 1000ms 且对称 → offset = 1000', () => {
  // 客户端 t1=0，服务端收到=1100（server=1000+100），回包 server=1100 → 客户端 t3=server-1000
  const m = sampleMetrics({ t1: 0, t2: 1100, t3: 1100, t4: 200 });
  assert.equal(m.rtt, 200);
  assert.equal(m.offset, 1000);
});

test('服务端慢 500ms → offset = -500', () => {
  const m = sampleMetrics({ t1: 0, t2: -400, t3: -400, t4: 200 });
  assert.equal(m.offset, -500);
});

test('非对称链路：offset 取往返平均', () => {
  // 上行 100ms、下行 300ms，服务端时间 = 本地 + 0
  const m = sampleMetrics({ t1: 0, t2: 100, t3: 100, t4: 400 });
  assert.equal(m.rtt, 400);
  assert.equal(m.offset, -100); // ((100-0)+(100-400))/2 = -100
});

test('RTT 超过阈值标记不可用', () => {
  const m = sampleMetrics({ t1: 0, t2: 0, t3: 0, t4: MAX_USABLE_RTT_MS + 1 });
  assert.equal(m.usable, false);
});

test('ClockSync 取 RTT 最小样本的 offset', () => {
  const c = new ClockSync();
  c.add({ t1: 0, t2: 500, t3: 500, t4: 2000 }); // 高延迟样本，offset 假值 -500
  c.add({ t1: 0, t2: 150, t3: 150, t4: 200 }); // 低延迟，offset = 50
  assert.equal(c.offset, 50);
  assert.equal(c.serverNow(1000), 1050);
});

test('ClockSync 全部样本不可用时 offset 回落到 0 并标记降级', () => {
  const c = new ClockSync();
  c.add({ t1: 0, t2: 0, t3: 0, t4: 900 });
  assert.equal(c.offset, 0);
  assert.equal(c.quality.degraded, true);
  assert.equal(c.quality.samples, 1);
});

test('ClockSync 只保留最近 maxSamples 个样本', () => {
  const c = new ClockSync(3);
  for (let i = 0; i < 10; i += 1) c.add({ t1: 0, t2: 0, t3: 0, t4: 100 });
  assert.equal(c.quality.samples, 3);
});

test('ClockSync reset 后回到无样本状态', () => {
  const c = new ClockSync();
  c.add({ t1: 0, t2: 150, t3: 150, t4: 200 });
  c.reset();
  assert.equal(c.offset, 0);
  assert.equal(c.quality.samples, 0);
});

test('质量判定：RTT 200 以上标记 degraded', () => {
  const c = new ClockSync();
  c.add({ t1: 0, t2: 150, t3: 150, t4: 300 }); // rtt=300
  assert.equal(c.quality.degraded, true);
  c.add({ t1: 0, t2: 50, t3: 50, t4: 100 }); // rtt=100
  assert.equal(c.quality.degraded, false);
});
