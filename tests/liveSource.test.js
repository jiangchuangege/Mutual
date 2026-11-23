/* eslint-disable */
/**
 * 直播源解析测试。
 *
 * 这几个函数是「直播模块能不能用」的地基：
 * m3u / txt 两种格式、一台多线路、同名台合并、CCTV1 与 CCTV-1 的写法差异。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const live = require('../dist-core/liveSource.js');

test('parseM3U：标准 EXTINF + tvg-logo + group-title', () => {
  const text = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="CCTV1" tvg-logo="http://a/logo.png" group-title="央视",CCTV-1 综合',
    'http://cdn.a.com/cctv1.m3u8',
    '#EXTINF:-1 group-title="卫视",湖南卫视',
    'http://cdn.a.com/hunan.m3u8',
  ].join('\n');
  const pl = live.parseM3U(text);
  assert.equal(pl.kind, 'm3u');
  assert.equal(pl.channels.length, 2);
  assert.equal(pl.channels[0].name, 'CCTV-1 综合');
  assert.equal(pl.channels[0].group, '央视');
  assert.equal(pl.channels[0].logo, 'http://a/logo.png');
  assert.equal(pl.channels[0].tvgId, 'CCTV1');
  assert.deepEqual(pl.groups, ['央视', '卫视']);
});

test('parseTxt：#genre# 分组 + 频道,地址', () => {
  const text = ['央视,#genre#', 'CCTV-1 综合,http://cdn.a.com/cctv1.m3u8', '卫视,#genre#', '湖南卫视,http://cdn.a.com/hunan.m3u8'].join(
    '\n',
  );
  const pl = live.parseTxt(text);
  assert.equal(pl.kind, 'txt');
  assert.equal(pl.channels.length, 2);
  assert.equal(pl.channels[0].group, '央视');
  assert.equal(pl.channels[1].group, '卫视');
  assert.equal(pl.channels[1].name, '湖南卫视');
});

test('parseLivePlaylist：自动识别两种格式', () => {
  assert.equal(live.parseLivePlaylist('#EXTM3U\n#EXTINF:-1,A\nhttp://a/1.m3u8').kind, 'm3u');
  assert.equal(live.parseLivePlaylist('央视,#genre#\nCCTV1,http://a/1.m3u8').kind, 'txt');
  assert.equal(live.parseLivePlaylist('随便一段话').kind, 'unknown');
  assert.equal(live.parseLivePlaylist('').channels.length, 0);
});

test('splitUrls：一台多线路（# 和 | 分隔）', () => {
  assert.deepEqual(live.splitUrls('http://a/1.m3u8#http://a/2.m3u8'), [
    'http://a/1.m3u8',
    'http://a/2.m3u8',
  ]);
  assert.deepEqual(live.splitUrls('http://a/1.m3u8|http://b/1.m3u8'), [
    'http://a/1.m3u8',
    'http://b/1.m3u8',
  ]);
  // 不是完整地址的片段要拼回上一个，不能当成新线路
  assert.deepEqual(live.splitUrls('http://a/1.m3u8#frag'), ['http://a/1.m3u8#frag']);
});

test('parseTxt：多线路保留全部地址', () => {
  const pl = live.parseTxt('央视,#genre#\nCCTV1,http://a/1.m3u8#http://b/1.m3u8');
  assert.equal(pl.channels.length, 1);
  assert.equal(pl.channels[0].url, 'http://a/1.m3u8');
  assert.deepEqual(live.pickChannelUrls(pl.channels[0]), ['http://a/1.m3u8', 'http://b/1.m3u8']);
});

test('groupChannels：按分组聚合且保持原始顺序', () => {
  const pl = live.parseTxt('央视,#genre#\nCCTV1,http://a/1.m3u8\nCCTV2,http://a/2.m3u8\n卫视,#genre#\n湖南,http://a/3.m3u8');
  const groups = live.groupChannels(pl.channels);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].group, '央视');
  assert.equal(groups[0].channels.length, 2);
  assert.equal(groups[1].group, '卫视');
});

test('dedupeChannels：同台同地址去重，同台不同地址保留', () => {
  const a = live.parseTxt('央视,#genre#\nCCTV1,http://a/1.m3u8\nCCTV1,http://a/1.m3u8\nCCTV1,http://b/1.m3u8');
  assert.equal(a.channels.length, 3);
  assert.equal(live.dedupeChannels(a.channels).length, 2);
});

test('searchChannels：CCTV1 能搜到 CCTV-1，也能搜中文台名', () => {
  const pl = live.parseTxt(
    '央视,#genre#\nCCTV-1 综合,http://a/1.m3u8\nCCTV-2 财经,http://a/2.m3u8\n卫视,#genre#\n湖南卫视高清,http://a/3.m3u8',
  );
  const hitCctv1 = live.searchChannels(pl.channels, 'CCTV1');
  assert.equal(hitCctv1.length, 1);
  assert.match(hitCctv1[0].name, /CCTV-1/);
  const hitHunan = live.searchChannels(pl.channels, '湖南');
  assert.equal(hitHunan.length, 1);
  assert.equal(live.searchChannels(pl.channels, '').length, 3);
});

test('mergePlaylists：同名台跨源合并备用地址', () => {
  const p1 = live.parseTxt('央视,#genre#\nCCTV1,http://a/1.m3u8');
  const p2 = live.parseTxt('央视,#genre#\nCCTV1,http://b/1.m3u8');
  const merged = live.mergePlaylists([p1, p2]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].urls, ['http://a/1.m3u8', 'http://b/1.m3u8']);
});

test('坏行不会污染结果：只有 http 地址才收', () => {
  const pl = live.parseTxt('央视,#genre#\nCCTV1\nCCTV2,not-a-url\nCCTV3,http://a/3.m3u8');
  assert.equal(pl.channels.length, 1);
  assert.equal(pl.channels[0].name, 'CCTV3');
  assert.ok(pl.skipped >= 2);
});
