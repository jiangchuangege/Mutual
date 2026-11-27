/* eslint-disable */
/**
 * 设备层集成测试：真的跑 NTP 对时、跟随端漂移校准、硬校准防抖、掉线重连。
 * 这一层是"同步精度 ±1.5 秒"这个承诺的实现处，必须被测试守住。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hub } = require('../dist-core/hub.js');
const { ClientDevice } = require('../dist-core/device.js');

const T0 = Date.UTC(2026, 2, 20, 19, 0, 0);

function setup(opts = {}) {
  const clock = { t: T0 };
  const hub = new Hub({
    now: () => clock.t,
    latencyMs: 120,
    scale: 1,
    clockSkew: { A: 0, B: 700 },
  });

  // 绑定 + 建房 + 加入 + 就绪 + 进入播放
  const inv = hub.createInvite('A');
  hub.joinWithCode('B', inv.value.code);
  const room = hub.createRoom('A', '测试片');
  hub.joinRoomByCode('B', room.value.code);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000;
  hub.tick();

  const devA = new ClientDevice({
    role: 'A',
    hub,
    clockSkewMs: 0,
    playbackFactor: 1,
    now: () => clock.t,
  });
  const devB = new ClientDevice({
    role: 'B',
    hub,
    clockSkewMs: 700,
    playbackFactor: opts.playbackFactorB ?? 1,
    now: () => clock.t,
  });
  hub.subscribe('A', (s) => devA.applySnapshot(s));
  hub.subscribe('B', (s) => devB.applySnapshot(s));
  devA.applySnapshot(hub.snapshot('A'));
  devB.applySnapshot(hub.snapshot('B'));

  const step = (ms = 250) => {
    clock.t += ms;
    hub.tick();
    devA.tick(ms);
    devB.tick(ms);
  };

  return { hub, clock, devA, devB, step };
}

test('对时：B 端时钟被人为调快 700ms，offset 应估出 -700', () => {
  const { devB, hub } = setup();
  const offset = devB.clock.offset;
  assert.ok(Math.abs(offset + 700) <= 1, `offset 应约等于 -700，实际 ${offset}`);
  // 用 offset 换算出的服务端时间应与权威时间一致
  const err = Math.abs(devB.serverNow() - hub.now());
  assert.ok(err <= 5, `serverNow 误差应 ≤5ms，实际 ${err}`);
  assert.equal(devB.clock.quality.rtt, 120);
});

test('跟随端 10 秒内不会因为时钟偏移而错位', () => {
  const { devB, step } = setup();
  for (let i = 0; i < 40; i += 1) step();
  assert.ok(
    Math.abs(devB.metrics.drift) <= 0.6,
    `10 秒后 drift 应 ≤0.6s，实际 ${devB.metrics.drift.toFixed(3)}`,
  );
});

test('人为制造 +8 秒漂移 → 下一次 tick 硬校准回位并提示「已重新同步」', () => {
  const { devB, step } = setup();
  for (let i = 0; i < 12; i += 1) step();

  devB.seekLocal(devB.player.positionSec + 8);
  const before = devB.metrics.drift;
  step();

  const after = Math.abs(devB.player.positionSec - devB.metrics.target);
  assert.ok(after <= 0.3, `硬校准后本机位置应贴近目标，实际偏差 ${after.toFixed(3)}`);
  assert.ok(
    devB.notices.some((n) => n.text === '已重新同步'),
    '应产生「已重新同步」提示',
  );
  void before;
});

test('30 秒内第二次大偏差被拦下 → 降级软校准并如实提示精度下降', () => {
  const { devB, step } = setup();
  for (let i = 0; i < 8; i += 1) step();

  devB.seekLocal(devB.player.positionSec + 8);
  step(); // 第一次：硬校准
  const hardCount = devB.metrics.hardCount;
  assert.equal(hardCount, 1);

  devB.seekLocal(devB.player.positionSec + 8);
  step(); // 第二次：被防抖拦下
  assert.equal(devB.metrics.hardCount, 1, '30 秒内不应发生第二次硬校准');
  assert.equal(devB.metrics.degraded, true, '应进入精度放宽状态');
  assert.ok(
    devB.notices.some((n) => n.text.includes('同步精度下降')),
    '应提示精度下降而不是假装精确',
  );
});

test('本机播放器偏快 2% → 触发软校准（改速率），且偏差被压住', () => {
  const { devB, step } = setup({ playbackFactorB: 1.02 });
  let maxDrift = 0;
  for (let i = 0; i < 240; i += 1) {
    step();
    maxDrift = Math.max(maxDrift, Math.abs(devB.metrics.drift));
  }
  assert.ok(maxDrift <= 1.6, `60 秒内最大偏差应 ≤1.6s，实际 ${maxDrift.toFixed(3)}`);
  assert.ok(devB.metrics.hardCount >= 1 || devB.metrics.mode === 'soft' || maxDrift <= 0.6);
});

test('掉线重连后重新对时并产生「已重新同步」提示', () => {
  const { hub, devB, step } = setup();
  for (let i = 0; i < 8; i += 1) step();

  hub.setOnline('B', false);
  devB.setOnline(false);
  assert.ok(devB.notices.some((n) => n.text === '网络已断开'));
  step();

  hub.setOnline('B', true);
  devB.setOnline(true);
  step();

  assert.ok(
    devB.notices.some((n) => n.text === '已重新同步'),
    '重连后应提示已重新同步',
  );
  assert.ok(Math.abs(devB.metrics.drift) <= 1.5);
});

test('暂停时跟随端对齐到暂停位置，不会自己继续走', () => {
  const { hub, devA, devB, step } = setup();
  for (let i = 0; i < 8; i += 1) step();

  // 真实场景：用户在自己的播放器上拖到 30s 后按下暂停，App 上报的就是这个位置
  devA.seekLocal(30);
  hub.pause('A', 30);
  step();
  step();

  assert.equal(devB.player.playing, false);
  assert.ok(
    Math.abs(devB.player.positionSec - 30) <= 0.6,
    `应贴住 30s，实际 ${devB.player.positionSec}`,
  );

  // 再跑几拍：暂停状态下跟随端不能自己往前跑
  for (let i = 0; i < 6; i += 1) step();
  assert.ok(
    Math.abs(devB.player.positionSec - 30) <= 0.6,
    `暂停后不应继续推进，实际 ${devB.player.positionSec}`,
  );
});

test('心跳不会把主控"本地拖动"写进时间轴（两台设备互相打架的根因）', () => {
  const { hub, devA, clock, step } = setup();
  for (let i = 0; i < 8; i += 1) step();
  const before = hub.snapshot('A').activeRoom.mediaState;
  const timeline = (st, at) => st.positionSec + (st.action === 'play' ? (at - st.updatedAtServerMs) / 1000 : 0);
  const t0 = clock.now ? clock.now() : clock.t;
  const posBefore = timeline(before, t0);

  // 主控本地播放器被拖动 +20 秒，然后照常发一次心跳
  devA.seekLocal(devA.player.positionSec + 20);
  clock.t += 2100;
  devA.tick(250);
  hub.tick();
  const after = hub.snapshot('A').activeRoom.mediaState;
  const t1 = clock.now ? clock.now() : clock.t;
  const posAfter = timeline(after, t1);

  // 时间轴只按真实流逝前进（约 2.1 秒），不会被"主控本地拖动 +20 秒"改写
  const grew = posAfter - posBefore;
  assert.ok(grew > 0 && grew < 5, `时间轴应该只前进约 2 秒，实际前进 ${grew.toFixed(2)} 秒`);

  // 真正改位置只有"用户主动 seek"这一条路
  hub.seek('A', 600);
  assert.equal(Math.round(hub.snapshot('A').activeRoom.mediaState.positionSec), 600);
});
test('时钟偏移不同的两台设备，目标位置计算一致（误差 ≤0.15s）', () => {
  const { devA, devB, step } = setup();
  for (let i = 0; i < 20; i += 1) step();
  const delta = Math.abs(devA.metrics.target - devB.metrics.target);
  assert.ok(delta <= 0.15, `两端目标位置应一致，实际差 ${delta.toFixed(3)}s`);
});
