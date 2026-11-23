/* eslint-disable */
/**
 * 空间动态：提示框文案 + 已读位置的存取纯逻辑。
 * 不碰 React Native，只测能单测的那部分（activityFeed.ts）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activityToToast,
} = require('../dist-core/activityFeed.js');

test('动态文案：新增 / 修改 / 删除 / 完成 各说人话', () => {
  assert.equal(
    activityToToast({ action: 'add', entityLabel: '日记', title: '今天很开心' }),
    'TA 新增了日记「今天很开心」',
  );
  assert.equal(
    activityToToast({ action: 'delete', entityLabel: '安排', title: '一起吃饭' }),
    'TA 删除了安排「一起吃饭」',
  );
  assert.equal(
    activityToToast({ action: 'update', entityLabel: '共同主题', title: '' }),
    'TA 修改了共同主题',
  );
  assert.equal(
    activityToToast({ action: 'done', entityLabel: '家务', title: '洗碗' }),
    'TA 完成了家务「洗碗」',
  );
});

test('动态文案：可以换成对方的名字，也可以没有标题', () => {
  assert.equal(
    activityToToast({ action: 'add', entityLabel: '待办', title: '' }, '小雨'),
    '小雨 新增了待办',
  );
});
