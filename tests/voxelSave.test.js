/* eslint-disable */
/** 3D 体素世界的存档 + 情侣模组 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');
const { VOXEL_GAME, buildVoxelHtml } = require('../dist-core/gameVoxel.js');

function boundHub() {
  const clock = { t: Date.UTC(2026, 10, 8, 10, 0, 0) };
  const hub = new Hub({ now: () => clock.t, latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  return { hub, clock };
}

test('挖/放并进存档：同一格以后来的为准，其它格不受影响', () => {
  const { hub } = boundHub();
  let r = hub.mergeVoxelEdits('A', ['3,4,5,0', '3,4,6,6']);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.count, 2, '两块都要存下来');

  // 同一格再改一次（x,y,z 相同）：覆盖而不是新增
  r = hub.mergeVoxelEdits('B', ['3,4,5,7']);
  assert.equal(r.value.count, 2, '同一格只留最新值');
  const edits = hub.snapshot('A').voxelWorld.edits;
  assert.ok(edits.includes('3,4,5,7'));
  assert.ok(!edits.includes('3,4,5,0'));
  assert.ok(edits.includes('3,4,6,6'), '别的格子不能被冲掉');
});

test('存档是双方共用的一份（谁改的都进同一份）', () => {
  const { hub } = boundHub();
  hub.mergeVoxelEdits('A', ['1,1,1,6']);
  hub.mergeVoxelEdits('B', ['2,1,1,7']);
  assert.equal(hub.snapshot('A').voxelWorld.edits.length, 2);
  assert.equal(hub.snapshot('B').voxelWorld.edits.length, 2);
});

test('脏数据被过滤，不会写坏存档', () => {
  const { hub } = boundHub();
  hub.mergeVoxelEdits('A', ['ok?', '1,2', '', 'x,y,z,v', '5,5,5,8']);
  const edits = hub.snapshot('A').voxelWorld.edits;
  assert.deepEqual(edits, ['5,5,5,8']);
});

test('存档能跨进程持久化（serialize → hydrate 还在）', () => {
  const { hub } = boundHub();
  hub.mergeVoxelEdits('A', ['9,2,9,6', '10,2,9,7']);
  const raw = hub.serialize();
  const fresh = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  fresh.hydrate(raw);
  assert.equal(fresh.snapshot('A').voxelWorld.edits.length, 2, '下次打开世界还在');
});

test('老存档没有 voxelWorld 字段也能加载', () => {
  const { hub } = boundHub();
  const raw = hub.serialize();
  delete raw.voxelWorld;
  const fresh = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  fresh.hydrate(raw);
  assert.deepEqual(fresh.snapshot('A').voxelWorld.edits, []);
});

test('清空存档会连带结束这一局', () => {
  const { hub } = boundHub();
  const g = hub.addGame('A', { title: '体素', code: '<html></html>' }).value;
  hub.startGame('A', g.id);
  hub.mergeVoxelEdits('A', ['1,1,1,6']);
  assert.equal(hub.resetVoxelWorld('A').ok, true);
  assert.equal(hub.snapshot('A').voxelWorld.edits.length, 0);
  assert.equal(hub.snapshot('A').gameSession, null);
});

test('情侣模组：3D 世界里有爱心砖、玫瑰、暖灯、合影墙和出生点小院', () => {
  assert.equal(VOXEL_GAME.builtin, 'voxel3d');
  const html = buildVoxelHtml();
  for (const word of ['爱心砖', '玫瑰', '暖灯', '合影墙']) {
    assert.ok(html.includes(word), `应该有「${word}」`);
  }
  assert.match(html, /coupleCourtyard/, '出生点要有情侣小院');
  assert.ok(html.includes('THREE'), 'three.js 要内联进去');
});
