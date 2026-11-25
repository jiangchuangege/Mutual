/* eslint-disable */
/**
 * 只有目录、没有音频的 RSS（喜马拉雅付费专辑那种）。
 *
 * 真实样本：一个专辑 342 个 <item>，每条都有 title / itunes:duration /
 * <link>https://www.ximalaya.com/sound/<id></link> / <guid>，但**一个 <enclosure> 都没有**。
 * 以前解析器第一行就是 `if (!audio) continue;`，整份专辑进去什么都不剩。
 * 现在这些条目照样进焦焦FM 当目录，标 externalOnly，点一下走官方页面。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRss, parseSource, MAX_FM_ITEMS_PER_SOURCE } = require('../dist-core/jiaojiaoFm.js');

const CATALOG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>罪全书（十宗罪系列，蜘蛛作品，骆驼演播）</title>
    <link>https://www.ximalaya.com/album/24495649</link>
    <description>本XML仅含节目目录与官方页面链接，不含音频</description>
    <itunes:author>有声的骆驼_骆驼</itunes:author>
    <item>
      <title>1. 骆驼-十宗罪（前传）001</title>
      <link>https://www.ximalaya.com/sound/201713069</link>
      <guid isPermaLink="false">201713069</guid>
      <description>时长 00:18:05，官方页面播放</description>
      <itunes:duration>00:18:05</itunes:duration>
    </item>
    <item>
      <title>2. 骆驼-十宗罪（前传）002</title>
      <link>https://www.ximalaya.com/sound/201713076</link>
      <guid isPermaLink="false">201713076</guid>
      <itunes:duration>00:15:39</itunes:duration>
    </item>
    <item>
      <title>3. 十宗罪（前传）003</title>
      <link>https://www.ximalaya.com/sound/201893678</link>
      <guid isPermaLink="false">201893678</guid>
      <itunes:duration>00:16:28</itunes:duration>
    </item>
  </channel>
</rss>`;

const PLAYABLE_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>可以听的播客</title>
  <item>
    <title>真·有音频的一集</title>
    <enclosure url="https://cdn.example.com/a.mp3" type="audio/mpeg" length="1"/>
    <itunes:duration>1800</itunes:duration>
  </item>
  <item>
    <title>只有页面的一集</title>
    <link>https://example.com/ep/2</link>
  </item>
</channel></rss>`;

test('目录型 RSS：342 集那种也能全部收进来（不再被 !audio 全部丢掉）', () => {
  const items = parseRss(CATALOG_XML, 'src1');
  assert.equal(items.length, 3);
  for (const it of items) {
    assert.equal(it.externalOnly, true, '没有 enclosure 的条目要标 externalOnly');
    assert.equal(it.audio, '', 'externalOnly 条目不该有音频地址');
    assert.match(it.pageUrl, /^https:\/\/www\.ximalaya\.com\/sound\/\d+$/);
  }
  // 标题/时长/合集名都要正常
  assert.equal(items[0].title, '1. 骆驼-十宗罪（前传）001');
  assert.equal(items[0].duration, 18 * 60 + 5);
  assert.match(items[0].album, /罪全书/);
  // 每条的 key 不一样（去重靠它）
  assert.equal(new Set(items.map((i) => i.key)).size, 3);
});

test('混合 RSS：能播的照旧可播，不能播的标成官方页面', () => {
  const items = parseSource(PLAYABLE_XML, { id: 's', url: 'https://x/feed.xml', kind: 'rss' });
  assert.equal(items.length, 2);
  const playable = items.find((i) => i.title === '真·有音频的一集');
  const pageOnly = items.find((i) => i.title === '只有页面的一集');
  assert.equal(playable.audio, 'https://cdn.example.com/a.mp3');
  assert.ok(!playable.externalOnly);
  assert.equal(pageOnly.externalOnly, true);
  assert.equal(pageOnly.pageUrl, 'https://example.com/ep/2');
});

test('合集名是 channel title，不会被条目链接污染', () => {
  const items = parseRss(CATALOG_XML, 'src1');
  assert.ok(items.every((i) => i.album.includes('罪全书')));
});

test('条数上限仍然生效（不会因为改成目录型就吃掉几千条）', () => {
  const one = `<item><title>t</title><link>https://e.com/1</link></item>`;
  const many = `<rss><channel><title>大方</title>${one.repeat(MAX_FM_ITEMS_PER_SOURCE + 50)}</channel></rss>`;
  const items = parseRss(many, 'src2');
  assert.equal(items.length, MAX_FM_ITEMS_PER_SOURCE);
});
