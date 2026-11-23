/* eslint-disable */
/**
 * 影院分类修正测试。
 *
 * 用户反馈就两件事：
 *   1. 动漫分类里混进了真人片 → classifyVod / smartFilterAnime
 *   2. 分类条是一长串采集站自己的分类 → groupCategories 归并
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const cls = require('../dist-core/cinemaClassify.js');

function vod(patch) {
  return {
    id: '1',
    name: '未命名',
    pic: '',
    remarks: '',
    year: '',
    area: '',
    typeName: '',
    actor: '',
    director: '',
    content: '',
    playUrlRaw: '',
    playFromRaw: '',
    ...patch,
  };
}

test('classifyVod：type_name 是动漫 → 动漫', () => {
  const v = cls.classifyVod(vod({ name: '葬送的芙莉莲', typeName: '日韩动漫', area: '日本' }));
  assert.equal(v.kind, 'anime');
});

test('classifyVod：type_name 是国产剧 → 真人', () => {
  const v = cls.classifyVod(vod({ name: '甄嬛传', typeName: '国产剧' }));
  assert.equal(v.kind, 'live');
});

test('classifyVod：片名带「真人版」直接判真人（不能被动画词拉回来）', () => {
  const v = cls.classifyVod(vod({ name: '斗罗大陆 真人版', typeName: '国产动漫' }));
  assert.equal(v.kind, 'live');
});

test('classifyVod：片名带「剧场版」判动画', () => {
  const v = cls.classifyVod(vod({ name: '名侦探柯南 剧场版 独眼的残像', typeName: '动画片' }));
  assert.equal(v.kind, 'anime');
});

test('classifyVod：什么信息都没有 → unknown（不误杀）', () => {
  const v = cls.classifyVod(vod({ name: '某部片' }));
  assert.equal(v.kind, 'unknown');
});

test('filterAnimeOnly：剔掉真人，保留动漫和不确定的', () => {
  const list = [
    vod({ id: '1', name: '芙莉莲', typeName: '日本动漫' }),
    vod({ id: '2', name: '甄嬛传', typeName: '国产剧' }),
    vod({ id: '3', name: '某部片' }),
  ];
  const res = cls.filterAnimeOnly(list);
  assert.equal(res.dropped, 1);
  assert.deepEqual(
    res.list.map((v) => v.id),
    ['1', '3'],
  );
});

test('smartFilterAnime：混了几部真人 → 只剔真人', () => {
  const list = [
    vod({ id: '1', name: 'A', typeName: '国产动漫' }),
    vod({ id: '2', name: 'B', typeName: '国产动漫' }),
    vod({ id: '3', name: 'C', typeName: '国产动漫' }),
    vod({ id: '4', name: '真人剧', typeName: '国产剧' }),
  ];
  const res = cls.smartFilterAnime(list);
  assert.equal(res.suspicious, false);
  assert.equal(res.dropped, 1);
  assert.equal(res.list.length, 3);
});

test('smartFilterAnime：整个分类都是真人（站方标错）→ 不清空，标记 suspicious', () => {
  const list = [
    vod({ id: '1', typeName: '国产剧' }),
    vod({ id: '2', typeName: '国产剧' }),
    vod({ id: '3', typeName: '综艺' }),
  ];
  const res = cls.smartFilterAnime(list);
  assert.equal(res.suspicious, true);
  assert.equal(res.dropped, 0);
  assert.equal(res.list.length, 3);
});

test('canonicalBucket：采集站常见分类名都能归位', () => {
  assert.equal(cls.canonicalBucket('国产动漫'), 'anime');
  assert.equal(cls.canonicalBucket('日本动漫'), 'anime');
  assert.equal(cls.canonicalBucket('动画片'), 'anime');
  assert.equal(cls.canonicalBucket('动作片'), 'movie');
  assert.equal(cls.canonicalBucket('科幻片'), 'movie');
  assert.equal(cls.canonicalBucket('电影'), 'movie');
  assert.equal(cls.canonicalBucket('国产剧'), 'series');
  assert.equal(cls.canonicalBucket('短剧'), 'series');
  assert.equal(cls.canonicalBucket('综艺'), 'variety');
  assert.equal(cls.canonicalBucket('纪录片'), 'doc');
  assert.equal(cls.canonicalBucket('乱七八糟'), 'other');
});

test('groupCategories：多个动漫一级分类合并成一档，id 含子类', () => {
  const cats = [
    { id: '1', name: '电影', pid: '0' },
    { id: '5', name: '动作片', pid: '1' },
    { id: '6', name: '喜剧片', pid: '1' },
    { id: '2', name: '国产动漫', pid: '0' },
    { id: '20', name: '热血', pid: '2' },
    { id: '3', name: '日本动漫', pid: '0' },
    { id: '4', name: '国产剧', pid: '0' },
  ];
  const groups = cls.groupCategories(cats);
  const anime = groups.find((g) => g.key === 'anime');
  assert.ok(anime, '应该有动漫档');
  assert.deepEqual(anime.ids.sort(), ['2', '20', '3'].sort());
  assert.equal(anime.sources.length, 2);
  assert.equal(anime.anime, true);

  const movie = groups.find((g) => g.key === 'movie');
  assert.ok(movie);
  assert.deepEqual(movie.ids.sort(), ['1', '5', '6'].sort());

  // 顺序固定：动漫在电影前面
  assert.equal(groups[0].key, 'anime');
});

test('groupCategories：空分类表返回空数组', () => {
  assert.deepEqual(cls.groupCategories([]), []);
});
