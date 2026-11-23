/* eslint-disable */
/**
 * 一起听 · 同步决策。
 * 三个真机 bug 的回归测试：
 *  1. 点了暂停歌还在唱      → musicWant 必须坚持本机暂停意图
 *  2. 有时点暂停没反应      → 意图窗口内不被服务端回声弹回去
 *  3. 上面大按钮和队列小三角不同步 → tapTrackAction 让两处走同一套动作
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DRIFT_TOLERANCE_SEC,
  PAUSE_INTENT_MS,
  isAtEnd,
  isStalled,
  makePlayIntent,
  musicTargetPosition,
  musicWant,
  planTrackEnd,
  shouldSeek,
  tapTrackAction,
} = require('../dist-core/musicSync.js');

const NOW = 1_800_000_000_000;

test('没有本地意图时：完全听服务端的', () => {
  assert.equal(musicWant({ action: 'play', intent: null, seq: 5, updatedBySelf: false, now: NOW }), 'play');
  assert.equal(musicWant({ action: 'pause', intent: null, seq: 5, updatedBySelf: false, now: NOW }), 'pause');
});

test('我点了暂停：服务端还没跟上（回声/延迟），也必须停', () => {
  const intent = makePlayIntent('pause', 5, NOW);
  // 服务端此刻还写着 play（rpc 还在路上/被别的端覆盖）
  assert.equal(
    musicWant({ action: 'play', intent, seq: 5, updatedBySelf: true, now: NOW + 300 }),
    'pause',
    '点了暂停就不能继续唱（这就是"我暂停后他还在唱"）',
  );
});

test('我点了暂停：窗口很长，一分钟后也不会自己响起来', () => {
  const intent = makePlayIntent('pause', 5, NOW);
  assert.equal(
    musicWant({ action: 'play', intent, seq: 5, updatedBySelf: true, now: NOW + PAUSE_INTENT_MS - 1 }),
    'pause',
  );
  // 窗口过期了也宁可安静（不做突然出声这件事）
  assert.equal(
    musicWant({ action: 'play', intent, seq: 5, updatedBySelf: true, now: NOW + PAUSE_INTENT_MS + 60_000 }),
    'pause',
  );
});

test('服务端跟上了我的暂停：意图立刻释放，之后听服务端', () => {
  const intent = makePlayIntent('pause', 5, NOW);
  assert.equal(musicWant({ action: 'pause', intent, seq: 6, updatedBySelf: true, now: NOW + 200 }), 'pause');
});

test('对方在我之后操作了：对方说了算（不能被我卡住）', () => {
  const intent = makePlayIntent('pause', 5, NOW);
  assert.equal(
    musicWant({ action: 'play', intent, seq: 6, updatedBySelf: false, now: NOW + 200 }),
    'play',
    'TA 按了播放，我这边要跟着播',
  );
});

test('我点了播放：服务端还写着 pause（回声）→ 先按我的来，过期后听服务端', () => {
  const intent = makePlayIntent('play', 7, NOW);
  assert.equal(musicWant({ action: 'pause', intent, seq: 7, updatedBySelf: true, now: NOW + 500 }), 'play');
  assert.equal(
    musicWant({ action: 'pause', intent, seq: 7, updatedBySelf: true, now: NOW + 60_000 }),
    'pause',
    '播放意图不需要长保护：过期就以服务端为准',
  );
});

test('目标进度：播放中按服务端时间往前推，暂停就停在原位', () => {
  const music = { action: 'play', positionSec: 30, updatedAtServerMs: NOW };
  assert.equal(musicTargetPosition(music, NOW + 5000), 35);
  assert.equal(musicTargetPosition({ ...music, action: 'pause' }, NOW + 5000), 30);
  // 服务端时间比本地时间"早"（时钟不同步）也不能算出负数
  assert.equal(musicTargetPosition(music, NOW - 5000), 30);
});

test('偏差纠正：小抖动不动，超过 1.5 秒才 seek', () => {
  assert.equal(shouldSeek(10, 10.4), false);
  assert.equal(shouldSeek(10, 10 + DRIFT_TOLERANCE_SEC), false);
  assert.equal(shouldSeek(10, 10 + DRIFT_TOLERANCE_SEC + 0.1), true);
  assert.equal(shouldSeek(NaN, 10), false);
});

test('点队列：同一首是播放/暂停，别的歌是切歌（两处按钮同一套动作）', () => {
  assert.equal(tapTrackAction(1, 1), 'toggle', '点正在放的那首 = 播放/暂停');
  assert.equal(tapTrackAction(0, 1), 'switch', '点别的歌 = 切过去');
});

test('音频加载失败判定：想播却 7 秒拿不到时长才算失败', () => {
  assert.equal(isStalled({ want: 'pause', durationSec: 0, loadingSince: NOW, now: NOW + 99_000 }), false);
  assert.equal(isStalled({ want: 'play', durationSec: 180, loadingSince: NOW, now: NOW + 99_000 }), false);
  assert.equal(isStalled({ want: 'play', durationSec: 0, loadingSince: NOW, now: NOW + 3000 }), false);
  assert.equal(isStalled({ want: 'play', durationSec: 0, loadingSince: NOW, now: NOW + 8000 }), true);
  assert.equal(isStalled({ want: 'play', durationSec: 0, loadingSince: 0, now: NOW }), false);
});

test('放完了：单曲/循环重头放，否则下一首，最后一首重头放', () => {
  assert.equal(isAtEnd(7.9, 8), true);
  assert.equal(isAtEnd(5, 8), false);
  assert.equal(isAtEnd(0, 0), false, '没有时长就谈不上到结尾');

  assert.deepEqual(planTrackEnd({ loop: false, shuffle: false, queueLength: 1, index: 0 }), {
    kind: 'replay',
  });
  assert.deepEqual(planTrackEnd({ loop: true, shuffle: false, queueLength: 3, index: 1 }), {
    kind: 'replay',
  });
  assert.deepEqual(planTrackEnd({ loop: false, shuffle: false, queueLength: 3, index: 0 }), {
    kind: 'next',
    index: 1,
  });
  assert.deepEqual(planTrackEnd({ loop: false, shuffle: false, queueLength: 3, index: 2 }), {
    kind: 'replay',
  }, '最后一首放完重头放，不能卡死在结尾（那样再点播放毫无反应）');

  // 随机：不能抽到自己
  for (let i = 0; i < 20; i += 1) {
    const plan = planTrackEnd({ loop: false, shuffle: true, queueLength: 3, index: 1 });
    assert.equal(plan.kind, 'next');
    assert.notEqual(plan.index, 1);
  }
  assert.deepEqual(planTrackEnd({ loop: false, shuffle: false, queueLength: 0, index: 0 }), {
    kind: 'idle',
  });
});
