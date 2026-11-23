/* eslint-disable */
/**
 * 影院 v1.3：回忆卡阶段能解散房间、换片不再串上一场的回忆卡、一起看队列。
 * 真实反馈：「房间看完一起看解散不了」（RECAP/CANCEL 被拒）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');
const { transition } = require('../dist-core/room.js');

function boundHub() {
  // 可控时钟：影院有 3 秒倒计时，必须能推进时间
  const clock = { t: Date.UTC(2026, 2, 20, 10, 0, 0) };
  const hub = new Hub({ now: () => clock.t, latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  return { hub, clock };
}

/** 把房间推到"看完 + 已保存回忆"的 RECAP 状态（走真实流程：建房→加入→都就绪→倒计时→播放→结束） */
function playThrough(hub, clock, title = '大明王朝1566') {
  const created = hub.createRoom('A', title, 'https://cdn.example.com/a.m3u8');
  assert.equal(created.ok, true, created.error);
  const joined = hub.joinRoomByCode('B', created.value.code);
  assert.equal(joined.ok, true, joined.error);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000; // 倒计时走完
  hub.tick();
  const playing = hub.snapshot('A').activeRoom;
  assert.equal(playing.state, 'PLAYING', '应该已经进入播放');
  hub.endRoom('A');
  hub.saveRecap('A');
  hub.saveRecap('B');
  return hub.snapshot('A').activeRoom;
}

test('状态机：RECAP 阶段允许解散（CANCEL → DISSOLVED）', () => {
  assert.equal(transition('RECAP', 'CANCEL'), 'DISSOLVED');
  assert.equal(transition('ENDED', 'CANCEL'), 'DISSOLVED');
});

test('看完之后能解散房间（以前报 RECAP / CANCEL 不允许）', () => {
  const { hub, clock } = boundHub();
  const room = playThrough(hub, clock);
  assert.equal(room.state, 'RECAP');
  const res = hub.cancelRoom('A');
  assert.equal(res.ok, true, res.error);
  assert.equal(hub.snapshot('A').activeRoom, null, '解散后不该还有房间');
});

test('回忆卡阶段换片会开新房间，不会把旧回忆卡串进来', () => {
  const { hub, clock } = boundHub();
  playThrough(hub, clock, '大明王朝1566');

  // 上一场还在 RECAP 时，直接换片
  const res = hub.setRoomSource('A', 'https://cdn.example.com/b.m3u8', '罗梅莉亚战记');
  assert.equal(res.ok, true, res.error);
  const room = hub.snapshot('A').activeRoom;
  assert.ok(room, '应该有一个新房间');
  assert.equal(room.movieTitle, '罗梅莉亚战记');
  assert.equal(room.recap, null, '新房间不能带着上一场的回忆卡');
  assert.equal(room.sourceUrl, 'https://cdn.example.com/b.m3u8');
});

test('一起看队列：加进去、去重、双方都能看到、能移除', () => {
  const { hub, clock } = boundHub();
  const a = hub.addWatchQueue('A', {
    title: '大明王朝1566',
    url: 'https://cdn.example.com/ep1.m3u8',
    episodeIndex: 0,
    episodeName: '第1集',
  });
  assert.equal(a.ok, true, a.error);
  assert.equal(hub.snapshot('A').watchQueue.length, 1);
  assert.equal(hub.snapshot('B').watchQueue.length, 1, '对方也要看到同一个队列');

  // 同一条地址不重复加
  const dup = hub.addWatchQueue('B', {
    title: '大明王朝1566',
    url: 'https://cdn.example.com/ep1.m3u8',
    episodeName: '第1集',
  });
  assert.equal(dup.ok, true);
  assert.equal(hub.snapshot('A').watchQueue.length, 1, '同一个地址只留一条');

  // 加第二集
  hub.addWatchQueue('B', {
    title: '大明王朝1566',
    url: 'https://cdn.example.com/ep2.m3u8',
    episodeIndex: 1,
    episodeName: '第2集',
  });
  assert.equal(hub.snapshot('A').watchQueue.length, 2);

  // 非法地址拒绝
  assert.equal(hub.addWatchQueue('A', { title: 'x', url: 'ftp://a/b' }).ok, false);

  // 移除 + 清空
  const first = hub.snapshot('A').watchQueue[0];
  assert.equal(hub.removeWatchQueue('A', first.id).ok, true);
  assert.equal(hub.snapshot('A').watchQueue.length, 1);
  assert.equal(hub.clearWatchQueue('A').ok, true);
  assert.equal(hub.snapshot('A').watchQueue.length, 0);
});

test('点队列里的片子就能开播（没房间就建，散场了开新的）', () => {
  const { hub, clock } = boundHub();
  hub.addWatchQueue('A', { title: '罗梅莉亚战记', url: 'https://cdn.example.com/film.mp4' });
  const item = hub.snapshot('A').watchQueue[0];

  // 没有房间时：直接建房并设好片源
  const r1 = hub.playFromQueue('A', item.id);
  assert.equal(r1.ok, true, r1.error);
  let room = hub.snapshot('A').activeRoom;
  assert.equal(room.movieTitle, '罗梅莉亚战记');
  assert.equal(room.sourceUrl, 'https://cdn.example.com/film.mp4');

  // 上一场散场后：再点队列另一项，应该开新房间
  hub.endRoom('A');
  hub.addWatchQueue('A', { title: '第二部', url: 'https://cdn.example.com/2.mp4' });
  const second = hub.snapshot('A').watchQueue.find((q) => q.title === '第二部');
  const r2 = hub.playFromQueue('A', second.id);
  assert.equal(r2.ok, true, r2.error);
  room = hub.snapshot('A').activeRoom;
  assert.equal(room.movieTitle, '第二部');
  assert.equal(room.recap, null, '新一场不带上一场的回忆卡');
});

test('整部加入队列：重复点不会重复加，数量如实报回来', () => {
  const { hub } = boundHub();
  const eps = [1, 2, 3, 4, 5].map((n) => ({
    title: '影子姐妹2026',
    url: `https://cdn.example.com/shadow/ep${n}.m3u8`,
    episodeIndex: n - 1,
    episodeName: `第${String(n).padStart(2, '0')}集`,
    vodId: 'vod-shadow',
  }));

  const first = hub.addWatchQueueBatch('A', eps);
  assert.equal(first.ok, true, first.error);
  assert.deepEqual(first.value, { added: 5, dup: 0, invalid: 0, capped: 0 });
  assert.equal(hub.snapshot('A').watchQueue.length, 5);

  // 用户真实反馈：「一部剧 30 集，不小心又点了一下，一下子又重复加了 30 集」
  const again = hub.addWatchQueueBatch('A', eps);
  assert.equal(again.ok, true);
  assert.deepEqual(again.value, { added: 0, dup: 5, invalid: 0, capped: 0 }, '第二次全是重复');
  assert.equal(hub.snapshot('A').watchQueue.length, 5, '队列里还是 5 集，没有翻倍');

  // 对象那一侧也能看到同一份队列（队列是共享的）
  assert.equal(hub.snapshot('B').watchQueue.length, 5);

  // 非法地址计入 invalid，不会污染队列
  const mixed = hub.addWatchQueueBatch('B', [
    { title: '坏地址', url: 'ftp://nope/x.mp4', episodeIndex: 0 },
    { title: '新的一集', url: 'https://cdn.example.com/shadow/ep6.m3u8', episodeIndex: 5 },
  ]);
  assert.deepEqual(mixed.value, { added: 1, dup: 0, invalid: 1, capped: 0 });
  assert.equal(hub.snapshot('A').watchQueue.length, 6);
});

test('同一部片同一集换条线路，也算已经在队列里（不重复）', () => {
  const { hub } = boundHub();
  hub.addWatchQueue('A', {
    title: '影子姐妹2026',
    url: 'https://line1.example.com/ep1.m3u8',
    episodeIndex: 0,
    episodeName: '第01集',
    vodId: 'vod-shadow',
  });
  // 另一条线路：地址不同，但用户眼里是同一集
  const res = hub.addWatchQueueBatch('B', [
    {
      title: '影子姐妹2026',
      url: 'https://line2.example.com/ep1.m3u8',
      episodeIndex: 0,
      episodeName: '第01集',
      vodId: 'vod-shadow',
    },
  ]);
  assert.deepEqual(res.value, { added: 0, dup: 1, invalid: 0, capped: 0 });
  assert.equal(hub.snapshot('A').watchQueue.length, 1);
});

test('老存档没有 watchQueue 字段也能正常加载（不丢已有数据）', () => {  const { hub, clock } = boundHub();
  hub.addEvent('A', {
    title: '旧数据还在',
    date: '2026-05-20',
    startMin: 600,
    endMin: 660,
    category: 'date',
    visibility: 'shared',
  });
  const raw = hub.serialize();
  delete raw.watchQueue;

  const fresh = new Hub();
  fresh.hydrate(raw);
  assert.deepEqual(fresh.snapshot('A').watchQueue, [], '缺字段补空数组');
  assert.equal(
    fresh.snapshot('A').events.some((e) => e.title === '旧数据还在'),
    true,
    '老数据必须完好',
  );
});
