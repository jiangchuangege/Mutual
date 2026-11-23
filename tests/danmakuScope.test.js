/* eslint-disable */
/**
 * 弹幕不能跨片串台。
 * 用户实测：「我明明是在另一部剧里发的弹幕，切换电影之后那些弹幕跑到新剧里来了」。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');

function playingRoom() {
  const clock = { t: Date.UTC(2026, 10, 8, 10, 0, 0) };
  const hub = new Hub({ now: () => clock.t, latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  const created = hub.createRoom('A', '黑色五叶草', 'https://cdn.example.com/black-01.m3u8');
  assert.equal(created.ok, true, created.error);
  hub.joinRoomByCode('B', created.value.code);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000;
  hub.tick();
  assert.equal(hub.snapshot('A').activeRoom.state, 'PLAYING');
  return { hub, clock };
}

test('弹幕记下自己属于哪个片源', () => {
  const { hub } = playingRoom();
  const sent = hub.sendDanmaku('A', '一库一库');
  assert.equal(sent.ok, true, sent.error);
  assert.equal(sent.value.sourceUrl, 'https://cdn.example.com/black-01.m3u8');
  const view = hub.snapshot('B').activeRoom;
  assert.equal(view.danmaku.length, 1, '对方也能看到');
});

test('换到另一部片之后，上一部的弹幕不再出现', () => {
  const { hub } = playingRoom();
  hub.sendDanmaku('A', '在黑色五叶草里发的');
  hub.sendDanmaku('B', '我也是');

  // 换片（房间还活着 → 换源，不新建房间）
  const switched = hub.setRoomSource('A', 'https://cdn.example.com/hope-01.m3u8', '希望2026');
  assert.equal(switched.ok, true, switched.error);

  const view = hub.snapshot('A').activeRoom;
  assert.equal(view.sourceUrl, 'https://cdn.example.com/hope-01.m3u8');
  assert.deepEqual(view.danmaku, [], '新片里不该出现上一部的弹幕');

  // 新片里发的弹幕正常显示
  hub.sendDanmaku('A', '新片第一句');
  const after = hub.snapshot('A').activeRoom;
  assert.equal(after.danmaku.length, 1);
  assert.equal(after.danmaku[0].text, '新片第一句');

  // 换回去还能看到原来那两条（弹幕没有被删掉，只是按片源分开）
  hub.setRoomSource('A', 'https://cdn.example.com/black-01.m3u8', '黑色五叶草');
  const back = hub.snapshot('A').activeRoom;
  assert.equal(back.danmaku.length, 2);
  assert.equal(back.danmaku[0].text, '在黑色五叶草里发的');
});

test('老数据（弹幕没有 sourceUrl）在换片时被钉在旧片源上', () => {
  const { hub } = playingRoom();
  hub.sendDanmaku('A', '旧弹幕');
  // 模拟 v1.3.3 之前存下来的数据：没有 sourceUrl
  const raw = hub.serialize();
  for (const room of Object.values(raw.rooms)) {
    for (const d of room.danmaku) delete d.sourceUrl;
  }
  const fresh = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  fresh.hydrate(raw);

  // 老数据在当前片源下仍然可见（不能因为升级就"弹幕全没了"）
  assert.equal(fresh.snapshot('A').activeRoom.danmaku.length, 1);

  fresh.setRoomSource('A', 'https://cdn.example.com/other.m3u8', '另一部');
  assert.deepEqual(fresh.snapshot('A').activeRoom.danmaku, [], '换片后被钉在旧地址，不串台');

  fresh.setRoomSource('A', 'https://cdn.example.com/black-01.m3u8', '黑色五叶草');
  assert.equal(fresh.snapshot('A').activeRoom.danmaku.length, 1, '换回旧片还能看到');
});
