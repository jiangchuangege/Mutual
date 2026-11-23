// 分类映射：常见采集站写法都要归对
const test = require('node:test');
const assert = require('node:assert');
const { canonicalBucket } = require('../dist-core/cinemaClassify.js');

const cases = [
  ['电影', 'movie'], ['动作片', 'movie'], ['爱情片', 'movie'], ['恐怖片', 'movie'],
  ['科幻片', 'movie'], ['剧情片', 'movie'], ['战争片', 'movie'], ['家庭篇', 'movie'],
  ['古装片', 'movie'], ['灾难片', 'movie'], ['伦理片', 'movie'], ['动画片', 'anime'],
  ['动漫', 'anime'], ['日韩动漫', 'anime'], ['国产动漫', 'anime'],
  ['连续剧', 'series'], ['国产剧', 'series'], ['香港剧', 'series'], ['欧美剧', 'series'],
  ['短剧', 'series'], ['微短剧', 'series'], ['电视剧', 'series'],
  ['综艺', 'variety'], ['脱口秀', 'variety'], ['真人秀', 'variety'],
  ['纪录片', 'doc'], ['体育', 'other'], ['NBA', 'other'],
];

for (const [name, want] of cases) {
  test(`${name} -> ${want}`, () => {
    assert.strictEqual(canonicalBucket(name), want);
  });
}

test('短剧永远不进电影', () => {
  assert.notStrictEqual(canonicalBucket('短剧'), 'movie');
  assert.notStrictEqual(canonicalBucket('微短剧'), 'movie');
});