const fs = require('node:fs');
const p = 'C:/ts/tests/games.test.js';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf("test('重新打开同一个游戏不能丢存档（退出重进金币不变）'");
if (start < 0) throw new Error('找不到新测试');
const test = `test('重新打开同一个游戏不能丢存档（退出重进金币不变）', () => {
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
`;
t = t.slice(0, start) + test;
fs.writeFileSync(p, t, 'utf8');
console.log('测试改成用 boundHub()');
