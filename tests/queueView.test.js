/* eslint-disable */
/**
 * 一起看队列的「合集」折叠。
 * 用户反馈：一部电视剧 30 集会摊成 30 行，没法看，要折叠成一个合集点进去选。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { groupWatchQueue, activeGroupKey, episodeLabel } = require('../dist-core/queueView.js');

const item = (over) => ({
  id: over.id,
  title: over.title ?? '影子姐妹2026',
  episodeIndex: over.episodeIndex ?? 0,
  episodeName: over.episodeName ?? '',
  url: over.url,
  api: null,
  vodId: over.vodId ?? null,
  addedBy: 'A',
  createdAt: over.createdAt ?? 1000,
});

test('同一部剧的多集折叠成一个合集，集内按集数排序', () => {
  const queue = [
    item({ id: 'wq3', url: 'https://x/3.m3u8', episodeIndex: 2, episodeName: '第03集', vodId: 'vod-1', createdAt: 30 }),
    item({ id: 'wq1', url: 'https://x/1.m3u8', episodeIndex: 0, episodeName: '第01集', vodId: 'vod-1', createdAt: 10 }),
    item({ id: 'wq2', url: 'https://x/2.m3u8', episodeIndex: 1, episodeName: '第02集', vodId: 'vod-1', createdAt: 20 }),
  ];
  const groups = groupWatchQueue(queue);
  assert.equal(groups.length, 1, '30 集应该只占一行');
  assert.equal(groups[0].series, true);
  assert.deepEqual(
    groups[0].items.map((i) => i.id),
    ['wq1', 'wq2', 'wq3'],
  );
});

test('不同片子各自成一个合集，合集之间按最早加入排序', () => {
  const queue = [
    item({ id: 'a', url: 'https://x/a1.m3u8', title: '剧A', vodId: 'vod-a', createdAt: 100 }),
    item({ id: 'b', url: 'https://x/b1.m3u8', title: '电影B', vodId: 'vod-b', createdAt: 50, episodeIndex: 0 }),
    item({ id: 'c', url: 'https://x/a2.m3u8', title: '剧A', vodId: 'vod-a', episodeIndex: 1, createdAt: 110 }),
  ];
  const groups = groupWatchQueue(queue);
  assert.deepEqual(
    groups.map((g) => g.title),
    ['电影B', '剧A'],
  );
  assert.equal(groups[0].series, false, '单片不算合集');
  assert.equal(groups[1].series, true);
});

test('没有 vodId 的老数据（v1.3.0 加的队列）按片名折叠，不会碎成一条一条', () => {
  const queue = [
    item({ id: 'x1', url: 'https://x/1.m3u8', title: '老剧', vodId: null, episodeIndex: 0 }),
    item({ id: 'x2', url: 'https://x/2.m3u8', title: '老剧', vodId: null, episodeIndex: 1 }),
  ];
  const groups = groupWatchQueue(queue);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
});

test('正在播的那一集能定位到所属合集', () => {
  const queue = [
    item({ id: 'p1', url: 'https://x/p1.m3u8', title: '剧P', vodId: 'vod-p' }),
    item({ id: 'q1', url: 'https://x/q1.m3u8', title: '剧Q', vodId: 'vod-q' }),
  ];
  assert.equal(activeGroupKey(queue, 'https://x/q1.m3u8'), 'vod:vod-q');
  assert.equal(activeGroupKey(queue, 'https://x/none.m3u8'), null);
  assert.equal(activeGroupKey(queue, null), null);
});

test('集名缺失时按序号补一个可读的标签', () => {
  assert.equal(episodeLabel(item({ id: 'z', url: 'https://x/z.m3u8', episodeIndex: 4 })), '第 5 集');
  assert.equal(
    episodeLabel(item({ id: 'z2', url: 'https://x/z2.m3u8', episodeIndex: 0, episodeName: '第01集' })),
    '第01集',
  );
  assert.equal(episodeLabel(item({ id: 'z3', url: 'https://x/z3.m3u8', episodeIndex: 0 })), '');
});
