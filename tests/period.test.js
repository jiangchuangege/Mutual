/* eslint-disable */
const test = require('node:test');
const assert = require('node:assert/strict');
const per = require('../dist-core/period.js');

function rec(startDate, endDate, id = startDate) {
  return {
    id,
    ownerRole: 'A',
    startDate,
    endDate,
    flow: 'medium',
    symptoms: [],
    moods: [],
    note: '',
    createdAt: 0,
    updatedAt: 0,
  };
}

test('summarize 计算周期与经期长度', () => {
  const s = per.summarize([
    rec('2026-01-01', '2026-01-05'),
    rec('2026-01-29', '2026-02-02'),
    rec('2026-02-26', '2026-03-02'),
  ]);
  assert.deepEqual(s.cycleLengths, [28, 28]);
  assert.deepEqual(s.periodLengths, [5, 5, 5]);
  assert.equal(s.avgCycle, 28);
  assert.equal(s.avgLength, 5);
  assert.equal(s.sampleCount, 3);
  assert.equal(s.lastStart, '2026-02-26');
});

test('summarize 对乱序输入先排序', () => {
  const s = per.summarize([rec('2026-02-26', '2026-03-02'), rec('2026-01-01', '2026-01-05')]);
  assert.deepEqual(s.starts, ['2026-01-01', '2026-02-26']);
  assert.equal(s.cycleLengths[0], 56);
});

test('无记录时不给预测，并给出引导文案', () => {
  const p = per.predictNext([], '2026-03-20', true);
  assert.equal(p.nextStart, null);
  assert.deepEqual(p.predictedDates, []);
  assert.equal(p.confidence, 'none');
  assert.match(p.note, /记录/);
});

test('一条记录即可预测，但置信度低', () => {
  const p = per.predictNext([rec('2026-03-01', '2026-03-05')], '2026-03-20', true);
  assert.equal(p.confidence, 'low');
  assert.equal(p.avgCycle, 28); // 回落到默认 28
  assert.equal(p.nextStart, '2026-03-29');
  assert.equal(p.predictedDates.length, 5);
  assert.equal(p.predictedDates[0], '2026-03-29');
  assert.equal(p.predictedDates[4], '2026-04-02');
});

test('三条以上记录 → 置信度 medium', () => {
  const p = per.predictNext(
    [rec('2026-01-01', '2026-01-05'), rec('2026-01-30', '2026-02-03'), rec('2026-02-27', '2026-03-03')],
    '2026-03-10',
    true,
  );
  assert.equal(p.confidence, 'medium');
  // 周期 29 与 28 → 平均 28.5 → Math.round 取 29 → 02-27 + 29 = 03-28
  assert.equal(p.avgCycle, 29);
  assert.equal(p.nextStart, '2026-03-28');
});

test('预测日已过去时顺延到未来', () => {
  const p = per.predictNext([rec('2026-01-01', '2026-01-05')], '2026-06-01', true);
  assert.equal(p.nextStart !== null, true);
  assert.ok(new Date(`${p.nextStart}T00:00:00Z`).getTime() > new Date('2026-06-01T00:00:00Z').getTime());
});

test('关闭预测时返回空预测', () => {
  const p = per.predictNext([rec('2026-03-01', '2026-03-05')], '2026-03-20', false);
  assert.equal(p.nextStart, null);
  assert.equal(p.confidence, 'none');
  assert.equal(p.note, '预测已关闭');
});

test('anomalyFlags：经期超过 10 天标红（仅提示就医）', () => {
  const r = per.anomalyFlags([rec('2026-03-01', '2026-03-15')]);
  assert.equal(r.flagged, true);
  assert.ok(r.reasons.includes('period-too-long'));
  assert.match(r.copy, /建议去医院/);
  assert.match(r.copy, /不构成诊断/);
});

test('anomalyFlags：周期跨度超过 45 天', () => {
  const r = per.anomalyFlags([rec('2026-01-01', '2026-01-05'), rec('2026-03-01', '2026-03-05')]);
  assert.equal(r.flagged, true);
  assert.ok(r.reasons.includes('cycle-too-long'));
});

test('anomalyFlags：正常数据不报警', () => {
  const r = per.anomalyFlags([
    rec('2026-01-01', '2026-01-05'),
    rec('2026-01-29', '2026-02-02'),
    rec('2026-02-26', '2026-03-02'),
  ]);
  assert.equal(r.flagged, false);
  assert.equal(r.copy, '');
});

test('recordsOnDay 覆盖起止日期', () => {
  const records = [rec('2026-03-01', '2026-03-05')];
  assert.equal(per.recordsOnDay(records, '2026-03-01').length, 1);
  assert.equal(per.recordsOnDay(records, '2026-03-03').length, 1);
  assert.equal(per.recordsOnDay(records, '2026-03-05').length, 1);
  assert.equal(per.recordsOnDay(records, '2026-03-06').length, 0);
  assert.equal(per.recordsOnDay(records, '2026-02-28').length, 0);
});

test('ongoingRecord 识别进行中的记录', () => {
  const records = [rec('2026-03-18', null, 'ongoing'), rec('2026-02-01', '2026-02-05', 'done')];
  const o = per.ongoingRecord(records, '2026-03-20');
  assert.ok(o);
  assert.equal(o.id, 'ongoing');
  assert.equal(per.ongoingRecord(records, '2026-03-17'), null);
});

test('predictedDaysInMonth 只返回本月天号', () => {
  const data = {
    tier: 'private',
    predictionEnabled: true,
    records: [rec('2026-03-01', '2026-03-05')],
    tierHistory: [],
    planLog: [],
    shareHistoryFrom: null,
  };
  const days = per.predictedDaysInMonth(data, '2026-03-20', 2026, 3);
  assert.deepEqual(days, [29, 30, 31]);
  const april = per.predictedDaysInMonth(data, '2026-03-20', 2026, 4);
  // 默认经期长度 5 天：03-29 起 → 03-29/30/31 + 04-01/02
  assert.deepEqual(april, [1, 2]);
});

test('periodDaysInMonth 返回本月经期天号', () => {
  const days = per.periodDaysInMonth([rec('2026-03-30', '2026-04-02')], 2026, 3);
  assert.deepEqual(days, [30, 31]);
});
