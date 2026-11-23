/* eslint-disable */
/**
 * 季节 / 昼夜：框架跟着时间变（用户要的"春夏秋冬 + 白天黑夜，看着高科技"）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { seasonOf, dayPhaseOf, ambienceFor, daysTogether } = require('../dist-core/ambience.js');

const at = (month, day, hour) => new Date(2026, month - 1, day, hour, 0, 0);

test('季节按月份分：3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬', () => {
  assert.equal(seasonOf(at(3, 20, 12)), 'spring');
  assert.equal(seasonOf(at(5, 31, 12)), 'spring');
  assert.equal(seasonOf(at(6, 1, 12)), 'summer');
  assert.equal(seasonOf(at(9, 15, 12)), 'autumn');
  assert.equal(seasonOf(at(12, 31, 12)), 'winter');
  assert.equal(seasonOf(at(1, 15, 12)), 'winter');
  assert.equal(seasonOf(at(2, 28, 12)), 'winter');
});

test('昼夜分段：清晨/上午/正午/午后/黄昏/夜晚/深夜都分得出来', () => {
  assert.equal(dayPhaseOf(at(4, 1, 5)), 'dawn');
  assert.equal(dayPhaseOf(at(4, 1, 8)), 'morning');
  assert.equal(dayPhaseOf(at(4, 1, 12)), 'noon');
  assert.equal(dayPhaseOf(at(4, 1, 15)), 'afternoon');
  assert.equal(dayPhaseOf(at(4, 1, 18)), 'dusk');
  assert.equal(dayPhaseOf(at(4, 1, 21)), 'night');
  assert.equal(dayPhaseOf(at(4, 1, 2)), 'deepNight');
});

test('夜里开星星，白天不开；每个时段都有配色和问候语', () => {
  const night = ambienceFor(at(4, 1, 22), { mine: '甲', partner: '乙' });
  assert.equal(night.palette.stars, true);
  assert.match(night.label, /春 · 夜晚/);
  assert.match(night.greeting, /甲/);

  const noon = ambienceFor(at(4, 1, 12), { mine: '甲', partner: '乙' });
  assert.equal(noon.palette.stars, false);
  assert.match(noon.label, /春 · 正午/);

  for (const hour of [2, 6, 9, 12, 15, 18, 21]) {
    const amb = ambienceFor(at(7, 1, hour));
    assert.ok(amb.greeting.length > 0, `${hour} 点应该有问候语`);
    assert.ok(amb.palette.accent.startsWith('#'), '强调色要是具体颜色');
  }
});

test('不同季节的强调色不一样（框架真的会变）', () => {
  const accents = new Set(
    [3, 6, 9, 12].map((m) => ambienceFor(at(m, 10, 12)).palette.accent),
  );
  assert.equal(accents.size, 4, '四季各一种强调色');
});

test('在一起的天数：含当天，未来日期返回 0，脏数据不炸', () => {
  const now = new Date(2026, 10, 8, 12, 0, 0);
  assert.equal(daysTogether('2026-11-08', now), 1);
  assert.equal(daysTogether('2026-11-06', now), 3);
  assert.equal(daysTogether('2026-12-01', now), 0);
  assert.equal(daysTogether('乱填的', now), 0);
  assert.equal(daysTogether(null, now), 0);
});
