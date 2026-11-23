/* eslint-disable */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DriftController, DRIFT_CONST, computeTargetPosition } = require('../dist-core/drift.js');

const T0 = 1_700_000_000_000;

test('偏差小于 0.6s 不干预', () => {
  const c = new DriftController();
  const d = c.decide(100.5, 100.0, T0);
  assert.equal(d.mode, 'none');
  assert.equal(d.targetRate, 1);
  assert.equal(d.seekTo, null);
  assert.ok(Math.abs(d.drift - 0.5) < 1e-9);
});

test('本地落后 → 软校准加速到 1.05', () => {
  const c = new DriftController();
  const d = c.decide(100.0, 101.0, T0); // local - target = -1 → 落后
  assert.equal(d.mode, 'soft');
  assert.equal(d.targetRate, 1 + DRIFT_CONST.SOFT_RATE_DELTA);
  assert.equal(d.seekTo, null);
});

test('本地超前 → 软校准减速到 0.95', () => {
  const c = new DriftController();
  const d = c.decide(101.0, 100.0, T0);
  assert.equal(d.mode, 'soft');
  assert.equal(d.targetRate, 1 - DRIFT_CONST.SOFT_RATE_DELTA);
});

test('偏差超过 1.5s → 硬校准 seek 到目标', () => {
  const c = new DriftController();
  const d = c.decide(108.0, 100.0, T0);
  assert.equal(d.mode, 'hard');
  assert.equal(d.seekTo, 100.0);
  assert.equal(d.targetRate, 1);
});

test('30 秒内第二次硬校准被拦下 → 降级软校准', () => {
  const c = new DriftController();
  const first = c.decide(108.0, 100.0, T0);
  assert.equal(first.mode, 'hard');
  const second = c.decide(108.0, 100.0, T0 + 1000);
  assert.equal(second.mode, 'soft');
  assert.equal(second.degraded, true);
  assert.equal(c.stats.hardCount, 1);
});

test('冷却期后可再次硬校准', () => {
  const c = new DriftController();
  c.decide(108.0, 100.0, T0);
  const later = c.decide(108.0, 100.0, T0 + DRIFT_CONST.HARD_COOLDOWN_MS + 1);
  assert.equal(later.mode, 'hard');
  assert.equal(c.stats.hardCount, 2);
});

test('降级后阈值放宽到 2.5s：2.0s 偏差只做软校准', () => {
  const c = new DriftController();
  c.decide(108.0, 100.0, T0); // 硬校准 → 触发防抖
  c.decide(108.0, 100.0, T0 + 500); // 降级
  const d = c.decide(102.0, 100.0, T0 + DRIFT_CONST.HARD_COOLDOWN_MS + 10);
  assert.equal(d.mode, 'soft');
  assert.equal(d.degraded, true);
});

test('软校准窗口内保持速率', () => {
  const c = new DriftController();
  const d1 = c.decide(100.0, 101.0, T0);
  assert.equal(d1.mode, 'soft');
  // 窗口内仍然偏差 0.8s（> 0.6s 忽略阈值）→ 继续保持软校准速率
  const d2 = c.decide(100.2, 101.0, T0 + 1000);
  assert.equal(d2.mode, 'soft');
  assert.equal(d2.targetRate, 1.05);
});

test('软校准中收敛 → 恢复 1.0', () => {
  const c = new DriftController();
  c.decide(100.0, 101.0, T0);
  const d = c.decide(101.2, 101.0, T0 + 1200); // |0.2| < 0.6
  assert.equal(d.mode, 'none');
  assert.equal(d.targetRate, 1);
  assert.equal(c.stats.softRate, 1);
});

test('窗口结束后仍未收敛 → 重新判定（软或硬）', () => {
  const c = new DriftController();
  c.decide(100.0, 101.0, T0);
  const d = c.decide(108.0, 101.0, T0 + DRIFT_CONST.SOFT_WINDOW_MS + 1);
  assert.equal(d.mode, 'hard');
});

test('reset 清空状态', () => {
  const c = new DriftController();
  c.decide(108.0, 100.0, T0);
  c.reset();
  assert.equal(c.stats.hardCount, 0);
  assert.equal(c.stats.degraded, false);
  const d = c.decide(108.0, 100.0, T0 + 10); // 重置后立即可硬校准
  assert.equal(d.mode, 'hard');
});

test('computeTargetPosition 播放时按服务端时间推进', () => {
  const media = { action: 'play', positionSec: 100, rate: 1, updatedAtServerMs: T0 };
  assert.equal(computeTargetPosition(media, T0), 100);
  assert.equal(computeTargetPosition(media, T0 + 2000), 102);
  assert.equal(computeTargetPosition(media, T0 + 1500), 101.5);
});

test('computeTargetPosition 暂停时不推进', () => {
  const media = { action: 'pause', positionSec: 100, rate: 1, updatedAtServerMs: T0 };
  assert.equal(computeTargetPosition(media, T0 + 60000), 100);
});

test('computeTargetPosition 尊重倍速', () => {
  const media = { action: 'play', positionSec: 50, rate: 1.25, updatedAtServerMs: T0 };
  assert.equal(computeTargetPosition(media, T0 + 4000), 55);
});

test('computeTargetPosition 时钟回拨不产生负进展', () => {
  const media = { action: 'play', positionSec: 100, rate: 1, updatedAtServerMs: T0 };
  assert.equal(computeTargetPosition(media, T0 - 5000), 100);
});
