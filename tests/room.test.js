/* eslint-disable */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../dist-core/room.js');

test('主链路每一跳都合法', () => {
  for (const [from, event, to] of R.HAPPY_PATH) {
    assert.equal(R.transition(from, event), to, `${from} --${event}--> ${to}`);
  }
});

test('重连分支每一跳都合法', () => {
  for (const [from, event, to] of R.RECONNECT_PATH) {
    assert.equal(R.transition(from, event), to, `${from} --${event}--> ${to}`);
  }
});

test('RoomMachine 走完整主链路', () => {
  const m = new R.RoomMachine();
  assert.equal(m.state, 'CREATED');
  assert.equal(m.apply('INVITE_SHARED').to, 'WAITING_PEER');
  assert.equal(m.apply('PEER_JOINED').to, 'PREPARING');
  assert.equal(m.apply('BOTH_READY').to, 'COUNTDOWN');
  assert.equal(m.apply('COUNTDOWN_DONE').to, 'PLAYING');
  assert.equal(m.apply('PAUSE').to, 'PAUSED');
  assert.equal(m.apply('PLAY').to, 'PLAYING');
  assert.equal(m.apply('END').to, 'ENDED');
  assert.equal(m.apply('SAVE_RECAP').to, 'RECAP');
});

test('非法迁移被拒绝且状态不变', () => {
  const m = new R.RoomMachine('CREATED');
  const r = m.apply('PLAY');
  assert.equal(r.ok, false);
  assert.equal(m.state, 'CREATED');
  assert.match(r.error, /非法迁移/);
});

test('终态不可再迁移', () => {
  for (const terminal of ['DISSOLVED', 'EXPIRED']) {
    const m = new R.RoomMachine('CREATED');
    assert.equal(m.apply('CANCEL').to, 'DISSOLVED');
    assert.equal(m.apply('CANCEL').ok, false);
    void terminal;
  }
  assert.equal(R.isTerminal('RECAP'), true);
  assert.equal(R.isTerminal('PLAYING'), false);
});

test('任意进行中状态都可以解散', () => {
  for (const state of ['CREATED', 'WAITING_PEER', 'PREPARING', 'COUNTDOWN', 'PLAYING', 'PAUSED']) {
    assert.equal(R.transition(state, 'CANCEL'), 'DISSOLVED', `${state} 应可解散`);
  }
});

test('掉线与重连：播放/暂停分别回到对应状态', () => {
  assert.equal(R.transition('PLAYING', 'PEER_OFFLINE'), 'PEER_OFFLINE');
  assert.equal(R.transition('PEER_OFFLINE', 'PEER_ONLINE_PLAYING'), 'PLAYING');
  assert.equal(R.transition('PEER_OFFLINE', 'PEER_ONLINE_PAUSED'), 'PAUSED');
  assert.equal(R.transition('PEER_OFFLINE', 'RECONNECT_TIMEOUT'), 'WAITING_RECONNECT');
  assert.equal(R.transition('WAITING_RECONNECT', 'PEER_ONLINE_PLAYING'), 'PLAYING');
  assert.equal(R.transition('WAITING_RECONNECT', 'ROOM_TIMEOUT'), 'ENDED');
});

test('邀请过期只在未加入阶段生效', () => {
  assert.equal(R.transition('CREATED', 'INVITE_EXPIRED'), 'EXPIRED');
  assert.equal(R.transition('WAITING_PEER', 'INVITE_EXPIRED'), 'EXPIRED');
  assert.equal(R.transition('PLAYING', 'INVITE_EXPIRED'), null);
});

test('每个状态都定义了迁移表（防止遗漏）', () => {
  const states = [
    'CREATED',
    'WAITING_PEER',
    'PREPARING',
    'COUNTDOWN',
    'PLAYING',
    'PAUSED',
    'PEER_OFFLINE',
    'WAITING_RECONNECT',
    'ENDED',
    'RECAP',
    'DISSOLVED',
    'EXPIRED',
  ];
  for (const s of states) {
    assert.ok(R.ROOM_TRANSITIONS[s], `缺少状态 ${s} 的迁移表`);
  }
  // 只有 RECAP / DISSOLVED / EXPIRED 允许为空
  for (const s of states) {
    const keys = Object.keys(R.ROOM_TRANSITIONS[s]);
    if (!['RECAP', 'DISSOLVED', 'EXPIRED'].includes(s)) {
      assert.ok(keys.length > 0, `${s} 不应为空迁移表`);
    }
  }
});

test('isActiveRoom 判定', () => {
  assert.equal(R.isActiveRoom('CREATED'), true);
  assert.equal(R.isActiveRoom('RECAP'), false);
  assert.equal(R.isActiveRoom('DISSOLVED'), false);
});
