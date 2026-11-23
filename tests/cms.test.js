/* eslint-disable */
/**
 * 苹果CMS 适配层测试：播放串解析、可播判断、列表解析、URL 拼装。
 * 这些是最容易踩坑的地方（# 与 $ 分隔、非直链、网页地址）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const cms = require('../dist-core/cms.js');

test('parsePlayUrl：标准「集名$链接#集名$链接」', () => {
  const raw = '第1集$http://cdn.a.com/1.m3u8#第2集$http://cdn.a.com/2.m3u8';
  const eps = cms.parsePlayUrl(raw);
  assert.equal(eps.length, 2);
  assert.deepEqual(eps[0], { name: '第1集', url: 'http://cdn.a.com/1.m3u8' });
  assert.deepEqual(eps[1], { name: '第2集', url: 'http://cdn.a.com/2.m3u8' });
});

test('parsePlayUrl：只有链接没有集名 → 命名正片', () => {
  const eps = cms.parsePlayUrl('http://cdn.a.com/full.mp4');
  assert.equal(eps.length, 1);
  assert.equal(eps[0].name, '正片');
  assert.equal(eps[0].url, 'http://cdn.a.com/full.mp4');
});

test('parsePlayUrl：空串与脏数据不炸', () => {
  assert.deepEqual(cms.parsePlayUrl(''), []);
  assert.deepEqual(cms.parsePlayUrl('#'), []);
  const eps = cms.parsePlayUrl('第1集$');
  assert.deepEqual(eps, []);
});

test('classifyPlayable：m3u8 / mp4 直链可播', () => {
  assert.equal(cms.classifyPlayable('https://x.com/a.m3u8').playable, true);
  assert.equal(cms.classifyPlayable('https://x.com/a.mp4?v=1').playable, true);
  assert.equal(cms.classifyPlayable('HTTP://X.COM/A.M3U8').playable, true);
});

test('classifyPlayable：非 http 开头 → 需要解析', () => {
  const v = cms.classifyPlayable('player.php?url=abc');
  assert.equal(v.playable, false);
  assert.match(v.reason, /需要解析/);
});

test('classifyPlayable：网页地址 → 需要解析', () => {
  for (const url of [
    'https://x.com/play/123.html',
    'https://x.com/share/abcdef',
    'https://x.com/vip.php?id=1',
  ]) {
    const v = cms.classifyPlayable(url);
    assert.equal(v.playable, false, url);
    assert.match(v.reason, /需要解析/);
  }
});

test('pickFirstPlayable：跳过不可播、取第一个能播的', () => {
  const raw = '第1集$https://x.com/play/1.html#第2集$https://cdn.x.com/2.m3u8';
  const { episode, verdict } = cms.pickFirstPlayable(raw);
  assert.equal(verdict.playable, true);
  assert.equal(episode.name, '第2集');
  assert.match(verdict.url, /2\.m3u8/);
});

test('pickFirstPlayable：全都不可播时给出原因', () => {
  const { verdict } = cms.pickFirstPlayable('第1集$https://x.com/play/1.html');
  assert.equal(verdict.playable, false);
  assert.match(verdict.reason, /需要解析/);
});

test('parseVodList：字段缺失也不炸，HTML 标签被清掉', () => {
  const raw = {
    list: [
      {
        vod_id: 101,
        vod_name: '测试片',
        vod_pic: 'https://img/x.jpg',
        vod_remarks: 'HD',
        vod_content: '<p>很好看&nbsp;的一部</p>',
        vod_play_url: '正片$https://cdn/x.m3u8',
      },
      {},
    ],
  };
  const list = cms.parseVodList(raw);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, '101');
  assert.equal(list[0].name, '测试片');
  assert.equal(list[0].remarks, 'HD');
  assert.equal(list[0].content.includes('<'), false);
  assert.equal(list[1].name, '未命名');
});

test('parseCmsPage：分页字段解析 + 兜底', () => {
  const page = cms.parseCmsPage({ list: [{ vod_id: 1, vod_name: 'a' }], page: '2', pagecount: '7', total: '120' }, 2);
  assert.equal(page.page, 2);
  assert.equal(page.pageCount, 7);
  assert.equal(page.total, 120);
  const fallback = cms.parseCmsPage({ list: [] }, 1);
  assert.equal(fallback.pageCount, 1);
  assert.equal(fallback.total, 0);
});

test('buildListUrl：拼 ac=detail 与分页，且不重复 ?', () => {
  assert.equal(
    cms.buildListUrl('https://a.com/api.php/provide/vod', 1),
    'https://a.com/api.php/provide/vod?ac=detail&pg=1',
  );
  assert.equal(
    cms.buildListUrl('https://a.com/vod?x=1', 3),
    'https://a.com/vod?x=1&ac=detail&pg=3',
  );
  assert.equal(
    cms.buildListUrl('https://a.com/vod/', 0),
    'https://a.com/vod?ac=detail&pg=1',
    '页码下限为 1',
  );
});

test('默认接口地址可用', () => {
  assert.match(cms.DEFAULT_CMS_API, /^https:\/\//);
});

test('fetchCmsPage：非法地址直接给出人话错误', async () => {
  const r = await cms.fetchCmsPage('not-a-url', 1);
  assert.equal(r.ok, false);
  assert.match(r.error, /接口地址无效/);
});

// ---------------------------------------------------------------------------
// 影院升级：多线路 / 搜索 / 分类 / 每日轮换 / 免邀请码加入 / 倍速
// ---------------------------------------------------------------------------

test('MacCMS 多线路解析：$$$ 分隔的线路各自成套', () => {
  const D = String.fromCharCode(36);
  const TRIPLE = D + D + D;
  const { parseSources } = require('../dist-core/cms.js');
  const srcs = parseSources(
    '量子资源' + TRIPLE + '非凡资源',
    '第1集' + D + 'https://a/1.m3u8#第2集' + D + 'https://a/2.m3u8' + TRIPLE + '正片' + D + 'https://b/1.m3u8',
  );
  assert.equal(srcs.length, 2, '应该有两条线路');
  assert.equal(srcs[0].name, '量子资源');
  assert.equal(srcs[0].episodes.length, 2);
  assert.equal(srcs[1].name, '非凡资源');
  assert.equal(srcs[1].episodes.length, 1);
  // 没有线路名时给"源1/源2"，绝不空着
  const fallback = parseSources('', 'https://x/1.m3u8' + TRIPLE + 'https://x/2.m3u8');
  assert.deepEqual(fallback.map((s) => s.name), ['源1', '源2']);
});

test('搜索 / 分类 / 每日轮换 / 接口短标签', () => {
  const cms = require('../dist-core/cms.js');
  assert.match(cms.buildSearchUrl('https://x/vod', '山海'), /ac=detail&wd=%E5%B1%B1%E6%B5%B7/);
  assert.match(cms.buildCategoryUrl('https://x/vod', '2'), /ac=detail&t=2/);
  assert.deepEqual(
    cms.parseCategories({ class: [{ type_id: 1, type_name: '电影' }, { type_id: 1, type_name: '电影' }] }),
    [{ id: '1', name: '电影', pid: '0' }],
    '分类要去重（并且带上父分类 id）',
  );
  const one = cms.dailyShuffle([1, 2, 3, 4, 5], '2026-11-05').join('');
  const two = cms.dailyShuffle([1, 2, 3, 4, 5], '2026-11-05').join('');
  const next = cms.dailyShuffle([1, 2, 3, 4, 5], '2026-11-06').join('');
  assert.equal(one, two, '同一天结果必须稳定（不能每次刷新都换）');
  assert.notEqual(one, next, '隔天要换一批');
  // 界面上只显示短标签，不暴露完整地址
  const label = cms.apiLabel('https://caiji.maotaizy.cc/api.php/provide/vod');
  assert.equal(label, 'maotaizy');
  assert.ok(!label.includes('/'), '标签里不能有路径');
});

test('免邀请码加入：申请 → 房主同意 → 进房（状态机 + Hub）', () => {
  const { Hub } = require('../dist-core/hub.js');
  const { transition } = require('../dist-core/room.js');
  assert.equal(transition('WAITING_PEER', 'PEER_REQUESTED'), 'PEER_REQUESTED');
  assert.equal(transition('PEER_REQUESTED', 'PEER_APPROVED'), 'PREPARING');
  assert.equal(transition('PEER_REQUESTED', 'PEER_DECLINED'), 'WAITING_PEER');
  assert.equal(transition('PEER_REQUESTED', 'PEER_JOINED'), 'PREPARING');

  const hub = new Hub();
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  const room = hub.createRoom('A', '测试影片', 'https://x/a.m3u8');
  assert.equal(room.ok, true);

  // 房主自己不能"加入"自己的房间
  assert.equal(hub.requestJoinRoom('A').ok, false);
  // 对方申请
  const req = hub.requestJoinRoom('B');
  assert.equal(req.ok, true, '对方应当能申请加入');
  const leaderView = hub.snapshot('A').activeRoom;
  assert.equal(leaderView.joinRequestedBy, 'B', '房主要能看到谁在申请');
  assert.equal(leaderView.state, 'PEER_REQUESTED');

  // 非房主不能同意
  assert.equal(hub.approveJoinRoom('B').ok, false);
  const approved = hub.approveJoinRoom('A');
  assert.equal(approved.ok, true);
  assert.equal(approved.value.state, 'PREPARING');
  assert.notEqual(approved.value.peerJoinedAt, null, '同意后对方就算进房了');
  assert.equal(approved.value.joinRequestedBy, null, '同意后清掉申请标记');

  // 倍速：主控能改，跟随方不能
  const rate = hub.setPlaybackRate('A', 1.5);
  assert.equal(rate.ok, true);
  assert.equal(rate.value.mediaState.rate, 1.5);
  assert.equal(hub.setPlaybackRate('B', 2).ok, false, '只有主控能改倍速');
  // 非法倍速回落到 1，不会把播放器带崩
  const weird = hub.setPlaybackRate('A', 7);
  assert.equal(weird.ok, true);
  assert.equal(weird.value.mediaState.rate, 1);
});

test('搜索兜底：接口不支持 wd= 时在最新几页里按名字找（真实场景）', () => {
  const cms = require('../dist-core/cms.js');
  // 模拟"服务端搜索返回 0 条"的接口
  assert.equal(typeof cms.searchVodDeep, 'function', '要有带兜底的搜索');
  assert.equal(typeof cms.searchAcrossApis, 'function', '要多接口搜索');
  assert.equal(typeof cms.collectSourcesAcrossApis, 'function', '要能汇总同一部片的所有源');
});

test('搜索只按片名精准匹配，并按相关度排序（不全库捞）', () => {
  const cms = require('../dist-core/cms.js');
  assert.equal(cms.nameMatchScore('陆总', '陆总'), 3, '完全一致');
  assert.equal(cms.nameMatchScore('陆总，夫人去开农家乐了', '陆总'), 2, '开头匹配');
  assert.equal(cms.nameMatchScore('亲爱的陆总大人', '陆总'), 1, '包含');
  assert.equal(cms.nameMatchScore('战狼', '陆总'), 0, '不相关必须丢掉');

  const mk = (name) => ({
    id: name,
    name,
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
  });
  const out = cms.filterByTitle(
    [mk('亲爱的陆总大人'), mk('陆总，夫人去开农家乐了'), mk('战狼'), mk('陆总')],
    '陆总',
  );
  assert.deepEqual(
    out.map((v) => v.name),
    ['陆总', '陆总，夫人去开农家乐了', '亲爱的陆总大人'],
    '完全一致排最前，不相关的片一条都不能留',
  );
});

// ---------------------------------------------------------------------------
// 分类 / 轮播（用户实测：点「电影」只有 4 部；轮播不要随机，要最新）
// ---------------------------------------------------------------------------

function vod(id, name, extra = {}) {
  return {
    id,
    name,
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
    ...extra,
  };
}

test('分类：一级分类要能展开出它的二级分类（采集站的 t=一级 不级联）', () => {
  const cms = require('../dist-core/cms.js');
  const cats = cms.parseCategories({
    class: [
      { type_id: 1, type_name: '电影', type_pid: 0 },
      { type_id: 2, type_name: '连续剧', type_pid: 0 },
      { type_id: 6, type_name: '动作片', type_pid: 1 },
      { type_id: 7, type_name: '爱情片', type_pid: 1 },
      { type_id: 13, type_name: '国产剧', type_pid: 2 },
    ],
  });
  assert.deepEqual(
    cms.rootCategories(cats).map((c) => c.name),
    ['电影', '连续剧'],
    '分类条只显示一级分类',
  );
  assert.deepEqual(cms.childCategoryIds(cats, '1'), ['6', '7'], '电影下面有动作片/爱情片');
  assert.deepEqual(cms.childCategoryIds(cats, '999'), [], '没有子类就返回空');
});

test('轮播：按发布时间倒序取最新的，不随机、不去重错', () => {
  const cms = require('../dist-core/cms.js');
  const list = [
    vod('a', '旧片', { time: '2026-10-01 10:00:00', year: '2020' }),
    vod('b', '最新', { time: '2026-11-05 22:53:30', year: '2026' }),
    vod('c', '中间', { time: '2026-11-01 08:00:00', year: '2025' }),
    vod('b', '最新', { time: '2026-11-05 22:53:30', year: '2026' }), // 重复的同一条
    vod('d', '没时间', { year: '2024' }),
  ];
  const top = cms.pickLatestVods(list, 3);
  assert.deepEqual(top.map((v) => v.name), ['最新', '中间', '旧片'], '时间最新的排最前，重复的去重');
  // 连跑两次结果必须一样（不能像洗牌那样每次都变）
  const again = cms.pickLatestVods(list, 3);
  assert.deepEqual(again.map((v) => v.name), top.map((v) => v.name));
});

test('轮播：没有时间字段时退回按年份倒序', () => {
  const cms = require('../dist-core/cms.js');
  const top = cms.pickLatestVods([vod('a', 'A', { year: '2019' }), vod('b', 'B', { year: '2026' })], 2);
  assert.deepEqual(top.map((v) => v.name), ['B', 'A']);
});

test('合并：多个子分类的结果合起来去重（点「电影」不再是 4 部）', () => {
  const cms = require('../dist-core/cms.js');
  const merged = cms.mergeVods([
    [vod('1', '动作片1'), vod('2', '动作片2')],
    [vod('2', '动作片2'), vod('3', '爱情片1')],
  ]);
  assert.deepEqual(merged.map((v) => v.id), ['1', '2', '3']);
});

test('轮播接口：h= 表示"最近 N 小时有更新"，按时间倒序', () => {
  const cms = require('../dist-core/cms.js');
  assert.match(cms.buildLatestUrl('https://x/api.php/provide/vod'), /ac=detail&h=72&pg=1/);
  assert.match(cms.buildLatestUrl('https://x/api.php/provide/vod?a=1', 24), /&ac=detail&h=24&pg=1/);
});
