/* eslint-disable */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../dist-core/privacy.js');

function makeData(overrides = {}) {
  return {
    tier: 'private',
    predictionEnabled: true,
    records: [],
    tierHistory: [],
    planLog: [],
    shareHistoryFrom: null,
    ...overrides,
  };
}

function record(id, startDate, endDate, createdAt) {
  return {
    id,
    ownerRole: 'A',
    startDate,
    endDate,
    flow: 'medium',
    symptoms: ['腹痛'],
    moods: ['疲惫'],
    note: `备注${id}`,
    createdAt,
    updatedAt: createdAt,
  };
}

test('private 档对伴侣返回 null（连"是否有数据"都不下发）', () => {
  const data = makeData({ records: [record('r1', '2026-03-01', '2026-03-05', 1)] });
  const p = P.projectPeriodForPartner(data, 'A', 'B', '2026-03-20');
  assert.equal(p, null);
});

test('care 档只给 careHint 与日期，不含任何细节字段', () => {
  const data = makeData({
    tier: 'care',
    records: [record('r1', '2026-03-01', '2026-03-05', 1)],
  });
  const p = P.projectPeriodForPartner(data, 'A', 'B', '2026-03-20');
  assert.ok(p);
  assert.equal(p.tier, 'care');
  assert.equal(p.careHint, false);
  assert.equal(p.date, '2026-03-20');
  assert.equal(p.records, undefined);
  assert.equal(p.predictedDates, undefined);
});

test('predict 档给预测日期但仍无细节', () => {
  const data = makeData({
    tier: 'predict',
    records: [
      record('r1', '2026-02-01', '2026-02-05', 1),
      record('r2', '2026-03-01', '2026-03-05', 2),
    ],
  });
  const p = P.projectPeriodForPartner(data, 'A', 'B', '2026-03-20');
  assert.ok(p);
  assert.equal(p.tier, 'predict');
  assert.ok(Array.isArray(p.predictedDates));
  assert.ok(p.predictedDates.length > 0);
  assert.equal(p.records, undefined);
});

test('full 档给细节，但默认不含授权之前的历史记录', () => {
  const data = makeData({
    tier: 'full',
    records: [
      record('old', '2026-01-01', '2026-01-05', 100),
      record('new', '2026-03-01', '2026-03-05', 1000),
    ],
    tierHistory: [{ at: 500, from: 'private', to: 'full', byRole: 'A', shareHistory: false }],
  });
  const p = P.projectPeriodForPartner(data, 'A', 'B', '2026-03-20');
  assert.ok(p);
  assert.equal(p.records.length, 1);
  assert.equal(p.records[0].startDate, '2026-03-01');
});

test('勾选"包含历史"后全量可见', () => {
  const data = makeData({
    tier: 'full',
    records: [
      record('old', '2026-01-01', '2026-01-05', 100),
      record('new', '2026-03-01', '2026-03-05', 1000),
    ],
    shareHistoryFrom: 0,
  });
  const p = P.projectPeriodForPartner(data, 'A', 'B', '2026-03-20');
  assert.equal(p.records.length, 2);
});

test('今天处于经期中 → careHint 为 true', () => {
  const data = makeData({
    tier: 'care',
    records: [record('r1', '2026-03-18', null, 1)],
  });
  const p = P.projectPeriodForPartner(data, 'A', 'B', '2026-03-20');
  assert.equal(p.careHint, true);
});

test('isCareDay 在预测窗口内也为 true', () => {
  const data = makeData({
    tier: 'care',
    records: [
      record('r1', '2026-02-01', '2026-02-05', 1),
      record('r2', '2026-03-01', '2026-03-05', 2),
    ],
  });
  // 平均 28 天 → 下次 3/29 起 5 天
  assert.equal(P.isCareDay(data, '2026-03-29'), true);
  assert.equal(P.isCareDay(data, '2026-03-20'), false);
});

test('关闭预测后不再产生 careHint 预测窗口', () => {
  const data = makeData({
    tier: 'care',
    predictionEnabled: false,
    records: [
      record('r1', '2026-02-01', '2026-02-05', 1),
      record('r2', '2026-03-01', '2026-03-05', 2),
    ],
  });
  assert.equal(P.isCareDay(data, '2026-03-29'), false);
});

test('伴侣视角不能反过来调用自己（防误用）', () => {
  const data = makeData({ tier: 'full' });
  assert.throws(() => P.projectPeriodForPartner(data, 'A', 'A', '2026-03-20'));
});

test('礼物灵感：非所有者看不到未揭示条目', () => {
  const ideas = [
    { id: '1', ownerRole: 'A', text: 'x', occasion: '', createdAt: 1, revealed: false },
    { id: '2', ownerRole: 'A', text: 'y', occasion: '', createdAt: 2, revealed: true },
    { id: '3', ownerRole: 'B', text: 'z', occasion: '', createdAt: 3, revealed: false },
  ];
  const forB = P.projectGiftIdeas(ideas, 'B');
  assert.equal(forB.length, 2);
  assert.deepEqual(forB.map((i) => i.id).sort(), ['2', '3']);
  const forA = P.projectGiftIdeas(ideas, 'A');
  assert.equal(forA.length, 2);
});

test('所有锁屏文案都不含敏感词（产品底线）', () => {
  for (const [key, text] of Object.entries(P.MASK)) {
    assert.equal(
      P.isMaskedCopySafe(text),
      true,
      `文案 ${key} 含敏感词：${text}`,
    );
  }
});

test('safeMaskText 对污染模板返回 null（拒发而非降级明文）', () => {
  assert.equal(P.safeMaskText('她经期第 2 天'), null);
  assert.equal(P.safeMaskText('TA 今天可能需要关心'), 'TA 今天可能需要关心');
});

test('四档元数据齐全且顺序固定', () => {
  assert.deepEqual(P.TIER_ORDER, ['private', 'care', 'predict', 'full']);
  for (const tier of P.TIER_ORDER) {
    assert.ok(P.TIER_META[tier].label.length > 0);
    assert.ok(P.TIER_META[tier].partnerSees.length > 0);
  }
});
