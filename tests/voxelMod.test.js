/* eslint-disable */
/** 3D 世界模组接口：声明式 JSON → 直接生成到存档 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');
const { parseMod, expandMod, MOD_TEMPLATE } = require('../dist-core/voxelMod.js');

function boundHub() {
  const clock = { t: Date.UTC(2026, 10, 8, 10, 0, 0) };
  const hub = new Hub({ now: () => clock.t, latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  return { hub, clock };
}

test('示例模板本身是合法的，能展开成方块', () => {
  const parsed = parseMod(MOD_TEMPLATE);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.mod.name, '樱花庭院');
  const edits = expandMod(parsed.mod);
  assert.ok(edits.length > 40, `模板应该生成不少方块，实际 ${edits.length}`);
  for (const e of edits) assert.match(e, /^-?\d+,-?\d+,-?\d+,\d+$/);
});

test('形状：heart 是爱心、circle 是圆、sphere 是球壳、plaza 是圆盘', () => {
  const heart = expandMod({ name: 'h', build: [{ type: 'heart', center: [16, 4, 16], size: 3, block: 6 }] });
  assert.ok(heart.length > 20, '爱心要有足够多的点');
  const circle = expandMod({ name: 'c', build: [{ type: 'circle', center: [16, 4, 16], radius: 6, block: 8 }] });
  assert.ok(circle.length > 8, '圆的边点数与半径相关');
  const sphere = expandMod({ name: 's', build: [{ type: 'sphere', center: [10, 5, 10], radius: 3, block: 3, hollow: true }] });
  assert.ok(sphere.length > 5);
  const plaza = expandMod({ name: 'p', build: [{ type: 'plaza', center: [16, 4, 16], radius: 5, block: 20, edge: 6 }] });
  assert.ok(plaza.length > 50, '圆盘是一片，不是一圈');
});

test('超出世界的坐标自动裁掉（不会写坏存档）', () => {
  const edits = expandMod({
    name: 'big',
    build: [{ type: 'box', from: [-20, -5, -20], to: [60, 40, 60], block: 3 }],
  });
  for (const e of edits) {
    const [x, y, z] = e.split(',').map(Number);
    assert.ok(x >= 0 && x < 32 && y >= 0 && y < 10 && z >= 0 && z < 32, `越界: ${e}`);
  }
});

test('非法模组会被拒（带人能看懂的原因）', () => {
  assert.equal(parseMod('不是 json').ok, false);
  assert.equal(parseMod('{"name":"空"}').ok, false);
  assert.equal(parseMod('{"name":"x","build":[]}').ok, false);
  assert.equal(parseMod('{"name":"x","build":[{"type":"unknown","block":3}]}').ok, false);
});

test('应用模组 = 写进存档：双方可见、跨进程还在', () => {
  const { hub } = boundHub();
  const res = hub.applyVoxelMod('A', MOD_TEMPLATE);
  assert.equal(res.ok, true, res.error);
  assert.ok(res.value.blocks > 40);
  assert.equal(hub.snapshot('B').voxelWorld.edits.length, res.value.blocks, '对方看到同一份存档');
  assert.equal(hub.snapshot('A').voxelMods.length, 1, '模组列表里也有记录');

  const raw = hub.serialize();
  const fresh = new Hub({ now: () => Date.now(), latencyMs: 0, scale: 1, clockSkew: { A: 0, B: 0 } });
  fresh.hydrate(raw);
  assert.equal(fresh.snapshot('A').voxelWorld.edits.length, res.value.blocks, '下次打开还在');
  assert.equal(fresh.snapshot('A').voxelMods.length, 1);
});

test('自定义方块（id ≥ 20）会被记进模组方块表', () => {
  const { hub } = boundHub();
  const res = hub.applyVoxelMod(
    'A',
    JSON.stringify({
      name: '樱花',
      blocks: [{ id: 20, name: '樱花瓣', color: '#ffc0cb' }],
      build: [{ type: 'plaza', center: [16, 4, 16], radius: 4, block: 20 }],
    }),
  );
  assert.equal(res.ok, true, res.error);
  assert.equal(hub.snapshot('A').voxelMods[0].blocks[0].color, '#ffc0cb');
});

test('移除模组只去掉记录，方块留在世界里', () => {
  const { hub } = boundHub();
  const res = hub.applyVoxelMod('A', MOD_TEMPLATE);
  const before = hub.snapshot('A').voxelWorld.edits.length;
  assert.equal(hub.removeVoxelMod('A', res.value.id).ok, true);
  assert.equal(hub.snapshot('A').voxelMods.length, 0);
  assert.equal(hub.snapshot('A').voxelWorld.edits.length, before, '方块不能被顺手删掉');
});
