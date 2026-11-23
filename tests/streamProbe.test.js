// 片源测速排序（纯函数）测试
const test = require('node:test');
const assert = require('node:assert');

const { rankStreams } = require('../dist-core/streamProbe.js');

const A = 'https://a.test/movie.m3u8';
const B = 'https://b.test/movie.m3u8';
const C = 'https://c.test/movie.m3u8';

test('快的源排前面', () => {
  const ranked = rankStreams([A, B, C], [
    { url: A, ok: true, ms: 200, kbps: 1200 },
    { url: B, ok: true, ms: 200, kbps: 8000 },
    { url: C, ok: true, ms: 200, kbps: 400 },
  ]);
  assert.deepEqual(ranked, [B, A, C]);
});

test('测速失败的源排最后（保持相对顺序）', () => {
  const ranked = rankStreams([A, B, C], [
    { url: A, ok: false, ms: 5000, kbps: 0, error: '超时' },
    { url: B, ok: true, ms: 100, kbps: 2000 },
    { url: C, ok: false, ms: 400, kbps: 0, error: 'HTTP 403' },
  ]);
  assert.equal(ranked[0], B);
  assert.deepEqual(ranked.slice(1).sort(), [A, C].sort());
});

test('没测过的源比测速失败的好一点，但排在成功的后面', () => {
  const ranked = rankStreams([A, B, C], [
    { url: A, ok: false, ms: 10, kbps: 0, error: 'HTTP 500' },
    { url: B, ok: true, ms: 10, kbps: 100 },
    // C 没测
  ]);
  assert.deepEqual(ranked, [B, C, A]);
});

test('空输入不炸', () => {
  assert.deepEqual(rankStreams([], []), []);
});
