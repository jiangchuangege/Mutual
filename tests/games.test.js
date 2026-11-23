/* eslint-disable */
/** 游戏库：粘贴代码进库、开局、局面同步、删除；老存档兼容 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');
const { SAMPLE_GAMES } = require('../dist-core/gameSamples.js');

function boundHub() {
  const clock = { t: Date.UTC(2026, 10, 8, 10, 0, 0) };
  const hub = new Hub({ now: () => clock.t, latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  return { hub, clock };
}

const CODE = '<!doctype html><html><body><canvas></canvas><script>window.TwGame={send(){},apply(){}}</script></body></html>';

test('粘贴代码进库：双方都能看到；完整重复粘贴会复用旧条目', () => {
  const { hub } = boundHub();
  const added = hub.addGame('A', { title: '井字棋', code: CODE });
  assert.equal(added.ok, true, added.error);
  assert.equal(hub.snapshot('B').games.length, 1, '对方也要看到这个库');
  const again = hub.addGame('B', { title: '井字棋副本', code: CODE });
  assert.equal(again.ok, true);
  assert.equal(hub.snapshot('A').games.length, 1, '同一份代码不产生第二个条目');
});

test('太短的代码要拒绝（防止误粘贴乱七八糟的东西）', () => {
  const { hub } = boundHub();
  assert.equal(hub.addGame('A', { title: 'x', code: 'hi' }).ok, false);
  assert.equal(hub.snapshot('A').games.length, 0);
});

test('开局 + 局面同步：谁操作就谁交局面，对方拿到同一份', () => {
  const { hub, clock } = boundHub();
  const g = hub.addGame('A', { title: '井字棋', code: CODE }).value;
  const started = hub.startGame('A', g.id);
  assert.equal(started.ok, true, started.error);
  assert.equal(hub.snapshot('B').gameSession.gameId, g.id);

  clock.t += 1000;
  const pushed = hub.pushGameState('A', '{"board":["X","",""]}', 1);
  assert.equal(pushed.ok, true, pushed.error);
  const seen = hub.snapshot('B').gameSession;
  assert.equal(seen.state, '{"board":["X","",""]}');
  assert.equal(seen.turn, 1);
  assert.equal(seen.seq, 1);
  assert.equal(seen.updatedBy, 'A');

  // 对方接着走
  hub.pushGameState('B', '{"board":["X","O",""]}', 0);
  assert.equal(hub.snapshot('A').gameSession.seq, 2);
});

test('没有对局时不能交局面；结束对局后清空', () => {
  const { hub } = boundHub();
  assert.equal(hub.pushGameState('A', '{}', 0).ok, false);
  const g = hub.addGame('A', { title: '井字棋', code: CODE }).value;
  hub.startGame('A', g.id);
  assert.equal(hub.pushGameState('A', '{}', 0).ok, true);
  assert.equal(hub.endGame('A').ok, true);
  assert.equal(hub.snapshot('A').gameSession, null);
});

test('删除游戏会顺带结束用它开的那局', () => {
  const { hub } = boundHub();
  const g = hub.addGame('A', { title: '井字棋', code: CODE }).value;
  hub.startGame('A', g.id);
  assert.equal(hub.removeGame('B', g.id).ok, true, '谁都能删共享库里的游戏');
  assert.equal(hub.snapshot('A').games.length, 0);
  assert.equal(hub.snapshot('A').gameSession, null);
});

test('老存档没有 games 字段也能加载（补空，不丢数据）', () => {
  const { hub } = boundHub();
  hub.addTodo('A', { title: '别丢', assignee: 'either', dueDate: null });
  const raw = hub.serialize();
  delete raw.games;
  delete raw.gameSession;
  const fresh = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  fresh.hydrate(raw);
  assert.deepEqual(fresh.snapshot('A').games, []);
  assert.equal(fresh.snapshot('A').gameSession, null);
  assert.equal(fresh.snapshot('A').todos.some((t) => t.title === '别丢'), true);
});

test('内置样例是能跑的完整 HTML（有 canvas + TwGame 桥）', () => {
  assert.ok(SAMPLE_GAMES.length >= 2, '至少有井字棋和沙盒两个样例');
  // 农场/体素这类内置游戏的 code 是空串：运行时由 buildFarmHtml()/buildVoxelHtml() 现场拼
  const inline = SAMPLE_GAMES.filter((g) => g.builtin !== 'voxel3d' && typeof g.code === 'string' && g.code.length > 0);
  assert.ok(inline.length >= 1, '要有直接带代码的内置样例');
  for (const g of inline) {
    assert.match(g.code, /<canvas/i, `${g.title} 应该有 canvas`);
    assert.match(g.code, /TwGame/, `${g.title} 要有 TwGame 桥`);
    assert.match(g.code, /ReactNativeWebView/, `${g.title} 要能把局面发回 App`);
    assert.ok(g.code.length > 500, `${g.title} 要像真的游戏`);
  }
});


test('重新打开同一个游戏不能丢存档（退出重进金币不变）', () => {
  const { hub } = boundHub();
  const added = hub.addGame('A', { title: '小窝', code: CODE });
  assert.equal(added.ok, true, added.error);
  const gameId = added.value.id;

  const started = hub.startGame('A', gameId);
  assert.equal(started.ok, true);
  const pushed = hub.pushGameState('A', '{"w":"世界存档"}', 0);
  assert.equal(pushed.ok, true);

  // 退出再进来：又调一次 startGame（同一个游戏，可能换人开）
  const again = hub.startGame('B', gameId);
  assert.equal(again.ok, true);
  const snap = hub.snapshot('A');
  assert.equal(snap.gameSession.state, '{"w":"世界存档"}', '存档必须还在');
  assert.ok(snap.gameSession.seq > 0, 'seq 不能被重置');
});
