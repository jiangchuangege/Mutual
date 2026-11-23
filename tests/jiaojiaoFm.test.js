// 焦焦FM 核心逻辑测试：源解析 / 健康分级 / 双人进度合并
const test = require('node:test');
const assert = require('node:assert');

const {
  detectSourceKind,
  sniffBodyKind,
  parseDuration,
  parseRss,
  parseListJson,
  parseSource,
  itemKey,
  plainText,
  gradeHealth,
  healthSummary,
  failingSources,
  mergeProgress,
  shouldSeek,
  driftSeconds,
} = require('../dist-core/jiaojiaoFm.js');

test('源类型判定：音频直链 / rss / json', () => {
  assert.equal(detectSourceKind('https://a.com/x.mp3'), 'audio');
  assert.equal(detectSourceKind('https://a.com/x.m3u8'), 'audio');
  assert.equal(detectSourceKind('https://a.com/feed'), 'rss');
  assert.equal(detectSourceKind('https://a.com/list.json'), 'json');
  assert.equal(sniffBodyKind('<?xml version="1.0"?><rss><channel></channel></rss>'), 'rss');
  assert.equal(sniffBodyKind('[{"title":"a"}]'), 'json');
  assert.equal(sniffBodyKind('不是 rss 也不是 json'), null);
});

test('时长归一：秒 / mm:ss / hh:mm:ss / EPUB3 秒数', () => {
  assert.equal(parseDuration(298), 298);
  assert.equal(parseDuration('298'), 298);
  assert.equal(parseDuration('04:58'), 298);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration(''), 0);
  assert.equal(parseDuration('--'), 0);
});

test('RSS 解析：标题/专辑/封面/时长/音频都拿到', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <title>睡前故事</title>
    <itunes:image href="https://img.x/cover.jpg"/>
    <item>
      <title>第 1 集 · 小王子</title>
      <enclosure url="https://cdn.x/ep1.mp3" type="audio/mpeg" length="0"/>
      <itunes:duration>12:34</itunes:duration>
      <description><![CDATA[<p>从前有个小王子&hellip;</p>]]></description>
      <pubDate>Wed, 20 Nov 2026 10:00:00 GMT</pubDate>
    </item>
    <item><title>没有音频的条目</title></item>
  </channel></rss>`;
  const items = parseRss(xml, 's1');
  assert.equal(items.length, 1, '没有音频的条目要被丢掉');
  assert.equal(items[0].title, '第 1 集 · 小王子');
  assert.equal(items[0].album, '睡前故事');
  assert.equal(items[0].audio, 'https://cdn.x/ep1.mp3');
  assert.equal(items[0].cover, 'https://img.x/cover.jpg');
  assert.equal(items[0].duration, 754);
  assert.ok(items[0].publishedAt > 0);
  assert.ok(items[0].summary.includes('从前有个小王子'));
});

test('列表 JSON：几种常见形状都能吃', () => {
  const arr = parseListJson('[{"title":"故事A","url":"https://c/a.mp3","cover":"https://i/a.jpg"}]', 's1');
  assert.equal(arr.length, 1);
  assert.equal(arr[0].title, '故事A');

  const wrapped = parseListJson('{"data":[{"name":"故事B","audio":"https://c/b.mp3","duration":"03:00"}]}', 's1');
  assert.equal(wrapped.length, 1);
  assert.equal(wrapped[0].title, '故事B');
  assert.equal(wrapped[0].duration, 180);

  assert.deepEqual(parseListJson('坏 JSON', 's1'), []);
  assert.deepEqual(parseListJson('{}', 's1'), []);
});

test('同一条音频的 key 稳定（去重与记进度靠它）', () => {
  assert.equal(itemKey('https://c/a.mp3'), itemKey('https://c/a.mp3'));
  assert.notEqual(itemKey('https://c/a.mp3'), itemKey('https://c/b.mp3'));
});

test('单条音频直链源：自己就是一条', () => {
  const items = parseSource('', { id: 's9', url: 'https://c/睡前故事.mp3', kind: 'audio' });
  assert.equal(items.length, 1);
  assert.ok(items[0].title.length > 0);
  assert.equal(items[0].audio, 'https://c/睡前故事.mp3');
});

test('健康分级：0 条 = 坏，超 4 秒 = 慢', () => {
  assert.equal(gradeHealth({ ok: true, ms: 300, count: 12 }), 'ok');
  assert.equal(gradeHealth({ ok: true, ms: 5200, count: 12 }), 'slow');
  assert.equal(gradeHealth({ ok: true, ms: 300, count: 0 }), 'fail');
  assert.equal(gradeHealth({ ok: false, ms: 0, count: 0, error: '超时' }), 'fail');

  const reports = [
    { url: 'a', status: 'ok', ms: 100, count: 3, error: null, checkedAt: 1 },
    { url: 'b', status: 'fail', ms: 0, count: 0, error: 'x', checkedAt: 1 },
  ];
  assert.deepEqual(failingSources(reports), ['b']);
  assert.equal(healthSummary(reports), '2 个源 · 1 正常 / 0 慢 / 1 坏');
});

test('双人一起听：后操作的一方赢', () => {
  const a = { itemKey: 'k1', positionSec: 30, rate: 1, playing: true, role: 'A', updatedAt: 1000 };
  const b = { itemKey: 'k1', positionSec: 55, rate: 1, playing: true, role: 'B', updatedAt: 2000 };
  assert.equal(mergeProgress(a, b).positionSec, 55);
  assert.equal(mergeProgress(b, a).positionSec, 55);
  assert.equal(mergeProgress(null, a).positionSec, 30);
  assert.equal(mergeProgress(a, null).positionSec, 30);
  assert.equal(mergeProgress(null, null), null);
});

test('双人一起听：换集时以后换的那方为准', () => {
  const a = { itemKey: 'k1', positionSec: 30, rate: 1, playing: true, role: 'A', updatedAt: 500 };
  const b = { itemKey: 'k2', positionSec: 5, rate: 1, playing: true, role: 'B', updatedAt: 900 };
  assert.equal(mergeProgress(a, b).itemKey, 'k2');
  assert.equal(mergeProgress(b, a).itemKey, 'k2');
});

test('进度偏差超过 1.5 秒才对拉', () => {
  const base = { itemKey: 'k1', positionSec: 30, rate: 1, playing: true, role: 'A', updatedAt: 1 };
  const near = { ...base, positionSec: 31, role: 'B' };
  const far = { ...base, positionSec: 45.5, role: 'B' };
  assert.equal(shouldSeek(base, near), false);
  assert.equal(shouldSeek(base, far), true);
  assert.equal(driftSeconds(base, far), 15.5);
  // 不是同一集就不要 seek
  assert.equal(shouldSeek(base, { ...far, itemKey: 'k2' }), false);
});

test('简介去标签 + 截断', () => {
  assert.equal(plainText('<p>你好&amp;世界</p>'), '你好&世界');
  const long = plainText('字'.repeat(300), 50);
  assert.equal(long.length, 51, '50 字 + 省略号');
});
