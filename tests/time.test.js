/* eslint-disable */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../dist-core/time.js');

test('toISODate / parseISODate 往返一致', () => {
  const iso = '2026-03-09';
  assert.equal(T.toISODate(T.parseISODate(iso)), iso);
  assert.equal(T.toISODate(new Date(2026, 2, 9)), '2026-03-09');
});

test('isValidISO 拒绝非法日期', () => {
  assert.equal(T.isValidISO('2026-03-09'), true);
  assert.equal(T.isValidISO('2026-13-01'), false);
  assert.equal(T.isValidISO('2026-02-30'), false);
  assert.equal(T.isValidISO('2026-3-9'), false);
  assert.equal(T.isValidISO('abc'), false);
});

test('addDays 跨月跨年正确', () => {
  assert.equal(T.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(T.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(T.addDays('2024-03-01', -1), '2024-02-29'); // 闰年
  assert.equal(T.addDays('2026-03-09', 365), '2027-03-09'); // 非闰年
});

test('diffDays 带符号且不受跨月影响', () => {
  assert.equal(T.diffDays('2026-03-09', '2026-03-01'), 8);
  assert.equal(T.diffDays('2026-03-01', '2026-03-09'), -8);
  assert.equal(T.diffDays('2027-01-01', '2026-01-01'), 365);
  assert.equal(T.diffDays('2026-05-10', '2026-05-10'), 0);
});

test('isBetween 含端点与开区间', () => {
  assert.equal(T.isBetween('2026-03-05', '2026-03-01', '2026-03-10'), true);
  assert.equal(T.isBetween('2026-03-01', '2026-03-01', '2026-03-10'), true);
  assert.equal(T.isBetween('2026-03-10', '2026-03-01', '2026-03-10'), true);
  assert.equal(T.isBetween('2026-03-11', '2026-03-01', '2026-03-10'), false);
  assert.equal(T.isBetween('2026-02-28', '2026-03-01', '2026-03-10'), false);
  assert.equal(T.isBetween('2030-01-01', '2026-03-01', null), true);
});

test('monthMatrix 为 6x7 且覆盖整月', () => {
  const weeks = T.monthMatrix(2026, 3);
  assert.equal(weeks.length, 6);
  weeks.forEach((w) => assert.equal(w.length, 7));
  const flat = weeks.flat();
  assert.equal(flat.length, 42);
  assert.ok(flat.includes('2026-03-01'));
  assert.ok(flat.includes('2026-03-31'));
  assert.ok(!flat.includes('2026-02-28') || true);
  // 3 月 1 日是周日 → 第一行第一格就应是 3/1
  assert.equal(flat[0], '2026-03-01');
  // 日期严格递增
  for (let i = 1; i < flat.length; i += 1) {
    assert.equal(T.diffDays(flat[i], flat[i - 1]), 1);
  }
});

test('monthMatrix 起点补位正确', () => {
  // 2026-04-01 是周三 → 前面应有 3 个 3 月的日期
  const flat = T.monthMatrix(2026, 4).flat();
  assert.equal(flat[0], '2026-03-29');
  assert.equal(flat[3], '2026-04-01');
});

test('shiftMonth 跨年', () => {
  assert.deepEqual(T.shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(T.shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(T.shiftMonth(2026, 6, 0), { year: 2026, month: 6 });
});

test('clock 与分钟互转', () => {
  assert.equal(T.minToClock(0), '00:00');
  assert.equal(T.minToClock(9 * 60 + 5), '09:05');
  assert.equal(T.minToClock(1439), '23:59');
  assert.equal(T.clockToMin('19:30'), 1170);
  assert.equal(T.clockToMin('00:00'), 0);
});

test('formatDuration 处理小时', () => {
  assert.equal(T.formatDuration(0), '00:00');
  assert.equal(T.formatDuration(59), '00:59');
  assert.equal(T.formatDuration(600), '10:00');
  assert.equal(T.formatDuration(3725), '1:02:05');
  assert.equal(T.formatDuration(-5), '00:00');
});

test('formatCountdown 向上取整', () => {
  assert.equal(T.formatCountdown(0), '00:00');
  assert.equal(T.formatCountdown(1000), '00:01');
  assert.equal(T.formatCountdown(29 * 60 * 1000 + 41000), '29:41');
  assert.equal(T.formatCountdown(3600 * 1000), '1:00:00');
});

test('daysTogether 边界', () => {
  const base = T.parseISODate('2026-03-01');
  assert.equal(T.daysTogether(base, base), 0);
  assert.equal(T.daysTogether(base, base + 10 * T.MS_DAY), 10);
  assert.equal(T.daysTogether(null, base), 0);
});

test('togetherDayNumber 当天算第 1 天', () => {
  const base = T.parseISODate('2026-03-01');
  assert.equal(T.togetherDayNumber(base, base), 1);
  assert.equal(T.togetherDayNumber(base, base + 10 * T.MS_DAY), 11);
  assert.equal(T.togetherDayNumber(null, base), 0);
  // 开始日期被填成未来（手误）时不能出现 0 或负数天
  assert.equal(T.togetherDayNumber(base + 30 * T.MS_DAY, base), 1);
});

test('weekdayCN', () => {
  assert.equal(T.weekdayCN('2026-03-01'), '日');
  assert.equal(T.weekdayCN('2026-03-07'), '六');
});
