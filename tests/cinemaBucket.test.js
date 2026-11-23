// 分类严谨性（短剧不能跑到电影/恐怖片里）—— 纯函数测试
const test = require('node:test');
const assert = require('node:assert');

const { filterByBucket, bucketOfVod } = require('../dist-core/cinemaClassify.js');

function vod(typeName, name) {
  return {
    id: `${typeName}-${name}`,
    name: name || '某片',
    pic: '',
    remarks: '',
    year: '2026',
    area: '大陆',
    typeName,
    actor: '',
    director: '',
    content: '',
    playUrlRaw: '',
    playFromRaw: '',
  };
}

test('短剧不会被算进电影', () => {
  assert.strictEqual(bucketOfVod(vod('短剧')), 'series');
  const list = [vod('恐怖片', '恐怖片甲'), vod('短剧', '霸总短剧')];
  const out = filterByBucket(list, 'movie');
  assert.deepStrictEqual(
    out.list.map((v) => v.name),
    ['恐怖片甲'],
  );
  assert.strictEqual(out.dropped, 1);
});

test('动漫不会被算进电影，电影也不会被算进动漫', () => {
  const mixed = [vod('动作片', '动作片甲'), vod('日韩动漫', '某番剧'), vod('国产剧', '某电视剧')];
  const movieOnly = filterByBucket(mixed, 'movie');
  assert.deepStrictEqual(
    movieOnly.list.map((v) => v.name),
    ['动作片甲'],
  );
  const animeOnly = filterByBucket(mixed, 'anime');
  assert.deepStrictEqual(
    animeOnly.list.map((v) => v.name),
    ['某番剧'],
  );
});

test('判不出档位的条目保留（不误杀）', () => {
  const out = filterByBucket([vod('', '神秘片'), vod('科幻片', '科幻甲')], 'movie');
  assert.strictEqual(out.list.length, 2);
  assert.strictEqual(out.dropped, 0);
});

test('纪录片算电影的子类，放行', () => {
  const out = filterByBucket([vod('纪录片', '地球脉动')], 'movie');
  assert.strictEqual(out.list.length, 1);
});

test('空列表安全', () => {
  assert.deepStrictEqual(filterByBucket([], 'movie'), { list: [], dropped: 0 });
});
