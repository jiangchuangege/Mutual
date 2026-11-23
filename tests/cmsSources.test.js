/* eslint-disable */
/**
 * 在线片库接口的管理权：只由一个人管，两个人共用同一份。
 * 需求原话："接口权限默认交给一个人管理，但视频双方都可以正常看。"
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');

function makeBoundHub() {
  const hub = new Hub();
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  return hub;
}

const API1 = 'https://caiji.maotaizy.cc/api.php/provide/vod';
const API2 = 'https://json.heimuertv.api.php/provide/vod';

test('片库接口：谁先配谁是管理者，两个人都能读到同一份', () => {
  const hub = makeBoundHub();
  assert.equal(hub.snapshot('A').cms.apis.length, 0, '初始是空的');

  const res = hub.setCmsApis('B', [API1]);
  assert.equal(res.ok, true);
  assert.equal(res.value.manager, 'B', '先配的人成为管理者');

  assert.deepEqual(hub.snapshot('A').cms.apis, [API1], 'A 也能读到 B 配的接口');
  assert.deepEqual(hub.snapshot('B').cms.apis, [API1]);
  assert.equal(hub.snapshot('A').cms.manager, 'B');
});

test('片库接口：非管理者不能改（避免互相覆盖）', () => {
  const hub = makeBoundHub();
  hub.setCmsApis('A', [API1]);
  const denied = hub.setCmsApis('B', [API2]);
  assert.equal(denied.ok, false);
  assert.match(denied.error, /由 TA 管理/);
  assert.deepEqual(hub.snapshot('A').cms.apis, [API1], '还是原来那份');
});

test('片库接口：管理者能交接，交接之后原来的人就不能改了', () => {
  const hub = makeBoundHub();
  hub.setCmsApis('A', [API1]);
  assert.equal(hub.transferCmsManager('A', 'B').ok, true);
  assert.equal(hub.snapshot('A').cms.manager, 'B');

  assert.equal(hub.setCmsApis('A', [API2]).ok, false, 'A 已经不是管理者了');
  assert.equal(hub.setCmsApis('B', [API2]).ok, true);
  assert.deepEqual(hub.snapshot('A').cms.apis, [API2], 'A 立刻看到新接口');
});

test('片库接口：只接受 http(s)、去重、不设数量上限、空列表要拒绝', () => {
  const hub = makeBoundHub();
  const res = hub.setCmsApis('A', [
    API1,
    API1,
    'ftp://x/y',
    '   ',
    API2,
  ]);
  assert.equal(res.ok, true);
  assert.deepEqual(res.value.apis, [API1, API2], '去重 + 过滤掉非法地址');

  assert.equal(hub.setCmsApis('A', ['不是网址']).ok, false, '一个都不合法时拒绝');
  assert.equal(hub.setCmsApis('A', []).ok, false, '空列表拒绝');

  const many = hub.setCmsApis(
    'A',
    Array.from({ length: 20 }, (_, i) => `https://a${i}.test/api.php/provide/vod`),
  );
  assert.equal(many.ok, true);
  assert.equal(many.value.apis.length, 20, '想加多少加多少（用户实测"第 8 个会被吞掉"）');
  assert.equal(hub.snapshot('B').cms.apis.length, 20, '对方也能看到全部 20 个');
});

test('片库接口：改接口会给对方留一条动态（TA 换了源）', () => {
  const hub = makeBoundHub();
  hub.setCmsApis('A', [API1]);
  const feed = hub.snapshot('B').activity.filter((a) => a.entity === 'cms');
  assert.ok(feed.length >= 1, 'B 应该看到"TA 更新了片库接口"');
  assert.equal(feed[0].entityLabel, '片库接口');
});
