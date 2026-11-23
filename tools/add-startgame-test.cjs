const fs = require('node:fs');
const p = 'C:/ts/tests/games.test.js';
let t = fs.readFileSync(p, 'utf8');
if (t.includes('重新打开同一个游戏不能丢存档')) { console.log('已存在'); process.exit(0); }
t += `

test('重新打开同一个游戏不能丢存档（退出重进金币不变）', () => {
  const hub = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  hub.hydrate({
    ...emptyState(),
    bound: true,
    games: [{ id: 'g1', title: '小窝', code: '', players: 2, createdBy: 'A', createdAt: 0 }],
  });
  const started = hub.startGame('A', 'g1');
  assert.equal(started.ok, true);
  // 游戏里存了世界状态
  const pushed = hub.pushGameState('A', '{"w":"世界存档"}', 0);
  assert.equal(pushed.ok, true);
  // 退出再进来：又调一次 startGame（同一个游戏）
  const again = hub.startGame('B', 'g1');
  assert.equal(again.ok, true);
  const snap = hub.snapshot('A');
  assert.equal(snap.gameSession.state, '{"w":"世界存档"}', '存档必须还在');
  assert.ok(snap.gameSession.seq > 0, 'seq 不能被重置');
});
`;
fs.writeFileSync(p, t, 'utf8');
console.log('加了 startGame 存档保持的 hub 测试');
