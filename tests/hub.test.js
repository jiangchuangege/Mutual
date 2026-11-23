/* eslint-disable */
/**
 * Hub 集成测试：把"服务端 + 隐私投影 + 房间状态机 + 脱敏通知"整条链路跑一遍。
 * 这是本产品最容易出 bug 的部分（授权、掉线、超时），因此用可控时钟全量覆盖。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hub } = require('../dist-core/hub.js');
const { FORBIDDEN_WORDS } = require('../dist-core/privacy.js');
const { toISODate } = require('../dist-core/time.js');

function makeHub(startAt = Date.UTC(2026, 2, 20, 10, 0, 0)) {
  const clock = { t: startAt };
  const hub = new Hub({
    now: () => clock.t,
    latencyMs: 120,
    scale: 1,
    clockSkew: { A: 0, B: 700 },
  });
  return { hub, clock };
}

function bind(hub) {
  const inv = hub.createInvite('A');
  assert.equal(inv.ok, true);
  const joined = hub.joinWithCode('B', inv.value.code);
  assert.equal(joined.ok, true);
  return inv.value.code;
}

const TODAY = toISODate(Date.UTC(2026, 2, 20, 10, 0, 0));

test('绑定：邀请码 6 位、错误码被拒、正确码成功、重复绑定被拒', () => {
  const { hub } = makeHub();
  const inv = hub.createInvite('A');
  assert.match(inv.value.code, /^\d{6}$/);

  const wrong = hub.joinWithCode('B', '000000');
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /6 位数字不对|无效|过期/);

  const joined = hub.joinWithCode('B', inv.value.code);
  assert.equal(joined.ok, true);
  assert.ok(hub.snapshot('A').boundAt !== null);

  const again = hub.joinWithCode('B', inv.value.code);
  assert.equal(again.ok, false);
});

// ---------------------------------------------------------------------------
// 按固定 ID 绑定：搜 ID → 发请求 → 对方同意（取代限时邀请码）
// ---------------------------------------------------------------------------

function ready(hub) {
  hub.updateMyProfile('A', { name: '阿玫', birthDate: '2000-02-02', gender: 'female' });
  hub.updateMyProfile('B', { name: '阿泽', birthDate: '1999-01-01', gender: 'male' });
}

test('ID 绑定：每人一个 8 位固定 ID，且两端不同', () => {
  const { hub } = makeHub();
  ready(hub);
  const a = hub.snapshot('A');
  const idA = a.members.A.publicId;
  const idB = a.members.B.publicId;
  assert.match(idA, /^TW[A-Z0-9]{6}$/);
  assert.notEqual(idA, idB);
  // 固定：再读几次不变
  assert.equal(hub.snapshot('A').members.A.publicId, idA);
});

test('ID 绑定：搜对 ID 发出请求，对方能看到并同意', () => {
  const { hub } = makeHub();
  ready(hub);
  const idA = hub.snapshot('A').members.A.publicId;

  // B 搜 A 的 ID
  const req = hub.requestBind('B', idA);
  assert.equal(req.ok, true);
  assert.equal(req.value.paired, false);
  // A 端看到待确认请求
  assert.equal(hub.snapshot('A').bindRequest.fromRole, 'B');
  // 他自己不能替对方同意
  assert.equal(hub.acceptBind('B').ok, false);

  assert.equal(hub.acceptBind('A').ok, true);
  assert.ok(hub.snapshot('A').boundAt !== null);
  assert.equal(hub.snapshot('A').bindRequest, null, '绑定后请求清空');
});

test('ID 绑定：ID 不对 / 空 ID / 拿自己的 ID 都会被拒', () => {
  const { hub } = makeHub();
  ready(hub);
  const idA = hub.snapshot('A').members.A.publicId;

  assert.equal(hub.requestBind('B', 'TW000000').ok, false);
  assert.match(hub.requestBind('B', '').error, /请输入/);
  // A 拿自己的 ID 去搜：对方（B）的 ID 不等于它 → 拒绝
  assert.equal(hub.requestBind('A', idA).ok, false);
  assert.equal(hub.snapshot('A').bindRequest, null);
});

test('ID 绑定：对方还没建档时不能请求', () => {
  const { hub } = makeHub();
  // 只有 B 建档，A 还没建档
  hub.updateMyProfile('B', { name: '阿泽', birthDate: '1999-01-01', gender: 'male' });
  const idA = hub.snapshot('B').members.A.publicId;
  const r = hub.requestBind('B', idA);
  assert.equal(r.ok, false);
  assert.match(r.error, /建档/);
});

test('ID 绑定：互相搜对方 ID 直接完成绑定（双向同意）', () => {
  const { hub } = makeHub();
  ready(hub);
  const a = hub.snapshot('A');
  const idA = a.members.A.publicId;
  const idB = a.members.B.publicId;

  assert.equal(hub.requestBind('B', idA).value.paired, false);
  const mutual = hub.requestBind('A', idB);
  assert.equal(mutual.ok, true);
  assert.equal(mutual.value.paired, true, '对方已请求过我 → 直接绑定');
  assert.ok(hub.snapshot('A').boundAt !== null);
});

test('ID 绑定：拒绝后请求清空，可以重新发起', () => {
  const { hub } = makeHub();
  ready(hub);
  const idA = hub.snapshot('A').members.A.publicId;
  hub.requestBind('B', idA);
  assert.equal(hub.declineBind('B').ok, false, '发起方不能自己拒绝');
  assert.equal(hub.declineBind('A').ok, true);
  assert.equal(hub.snapshot('A').bindRequest, null);
  assert.equal(hub.snapshot('A').boundAt, null);
  // 再发一次没问题
  assert.equal(hub.requestBind('B', idA).ok, true);
});

test('ID 绑定：已绑定后不能再发请求', () => {
  const { hub } = makeHub();
  ready(hub);
  const idA = hub.snapshot('A').members.A.publicId;
  hub.requestBind('B', idA);
  hub.acceptBind('A');
  assert.equal(hub.requestBind('B', idA).ok, false);
});

test('邀请码：B 也能生成，A 可以输入 B 的码完成绑定', () => {
  const { hub } = makeHub();
  const invB = hub.createInvite('B');
  assert.equal(invB.ok, true, 'B 应该也能生成邀请码');
  assert.match(invB.value.code, /^\d{6}$/);
  assert.equal(hub.snapshot('A').invite.createdBy, 'B');

  assert.equal(hub.joinWithCode('A', invB.value.code).ok, true, 'A 应该能输入 B 的码');
  assert.ok(hub.snapshot('B').boundAt !== null);
  assert.equal(hub.snapshot('A').invite, null, '绑定后邀请码清空');
});

test('邀请码：自己生成的码自己填会被拒绝（那不等于对方同意）', () => {
  const { hub } = makeHub();
  const invA = hub.createInvite('A');
  const selfJoin = hub.joinWithCode('A', invA.value.code);
  assert.equal(selfJoin.ok, false);
  assert.match(selfJoin.error, /你自己生成/);
  assert.equal(hub.snapshot('A').boundAt, null, '不能因此绑定成功');

  const invB = hub.createInvite('B');
  assert.equal(hub.joinWithCode('B', invB.value.code).ok, false);
});

test('邀请码：谁后生成谁的码生效（双方都能重新生成）', () => {
  const { hub } = makeHub();
  const a = hub.createInvite('A');
  const b = hub.regenerateInvite('B');
  assert.equal(b.ok, true, 'B 也能重新生成');
  assert.equal(hub.snapshot('A').invite.createdBy, 'B');
  assert.equal(hub.joinWithCode('A', a.value.code).ok, false, 'A 的旧码已失效');
  assert.equal(hub.joinWithCode('A', b.value.code).ok, true);
});

test('邀请码：已绑定后双方都不再生成', () => {
  const { hub } = makeHub();
  bind(hub);
  assert.equal(hub.createInvite('A').ok, false);
  assert.equal(hub.createInvite('B').ok, false);
});

test('未绑定时业务操作被拒绝', () => {
  const { hub } = makeHub();
  const r = hub.addTodo('A', { title: '买菜', assignee: 'either', dueDate: null });
  assert.equal(r.ok, false);
  assert.match(r.error, /绑定/);
});

test('经期隐私：默认 private → 伴侣拿不到任何字段', () => {
  const { hub } = makeHub();
  bind(hub);
  hub.addPeriodRecord('A', {
    startDate: TODAY,
    endDate: null,
    flow: 'medium',
    symptoms: ['腹痛'],
    moods: ['烦躁'],
    note: '很私密',
  });
  const snapA = hub.snapshot('A');
  assert.equal(snapA.myPeriod.records.length, 1);
  const snapB = hub.snapshot('B');
  assert.equal(snapB.partnerPeriod, null);
  // 关键：伴侣视角的 JSON 里不应出现任何记录内容
  const json = JSON.stringify(snapB);
  assert.equal(json.includes('很私密'), false);
  assert.equal(json.includes('腹痛'), false);
});

test('经期隐私：切到 care 档只给关怀信号，不给细节', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  hub.addPeriodRecord('A', {
    startDate: TODAY,
    endDate: null,
    flow: 'heavy',
    symptoms: ['腹痛'],
    moods: ['烦躁'],
    note: '细节不该泄露',
  });
  clock.t += 1000;
  hub.setPeriodTier('A', 'care', false);

  const p = hub.snapshot('B').partnerPeriod;
  assert.ok(p);
  assert.equal(p.tier, 'care');
  assert.equal(p.careHint, true);
  assert.equal(p.records, undefined);
  const json = JSON.stringify(hub.snapshot('B'));
  assert.equal(json.includes('细节不该泄露'), false);
});

test('经期隐私：full 档默认不共享历史记录', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  hub.addPeriodRecord('A', {
    startDate: '2026-01-01',
    endDate: '2026-01-05',
    flow: 'light',
    symptoms: [],
    moods: [],
    note: '历史',
  });
  clock.t += 10_000;
  hub.setPeriodTier('A', 'full', false);
  clock.t += 10_000;
  hub.addPeriodRecord('A', {
    startDate: TODAY,
    endDate: null,
    flow: 'medium',
    symptoms: [],
    moods: [],
    note: '新的',
  });

  const p = hub.snapshot('B').partnerPeriod;
  assert.ok(p);
  assert.equal(p.records.length, 1);
  assert.equal(p.records[0].note, '新的');
});

test('经期隐私：勾选"含历史"后全部可见', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  hub.addPeriodRecord('A', {
    startDate: '2026-01-01',
    endDate: '2026-01-05',
    flow: 'light',
    symptoms: [],
    moods: [],
    note: '历史',
  });
  clock.t += 10_000;
  hub.setPeriodTier('A', 'full', true);
  const p = hub.snapshot('B').partnerPeriod;
  assert.equal(p.records.length, 1);
});

test('一键撤回后伴侣立即回到"未授权"', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  clock.t += 1000;
  hub.setPeriodTier('A', 'full', true);
  assert.ok(hub.snapshot('B').partnerPeriod);
  hub.revokeAllConsent('A');
  assert.equal(hub.snapshot('B').partnerPeriod, null);
  assert.equal(hub.snapshot('A').myPeriod.tier, 'private');
});

test('授权记录可查且记录操作人与档位变化', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  clock.t += 1000;
  hub.setPeriodTier('A', 'care', false);
  clock.t += 1000;
  hub.setPeriodTier('A', 'predict', false);
  const history = hub.snapshot('A').myPeriod.tierHistory;
  assert.ok(history.length >= 2);
  const last = history[history.length - 1];
  assert.equal(last.from, 'care');
  assert.equal(last.to, 'predict');
  assert.equal(last.byRole, 'A');
});

test('通知文案全部脱敏（不含任何敏感词）', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  clock.t += 1000;
  hub.setPeriodTier('A', 'care', false);
  hub.revokeAllConsent('A');
  hub.setMood('B', 'hug', '');
  const all = [...hub.snapshot('A').notifications, ...hub.snapshot('B').notifications];
  assert.ok(all.length > 0);
  for (const n of all) {
    for (const w of FORBIDDEN_WORDS) {
      assert.equal(n.text.includes(w), false, `通知含敏感词「${w}」：${n.text}`);
    }
  }
});

test('礼物灵感：默认对伴侣不可见，揭示后可见', () => {
  const { hub } = makeHub();
  bind(hub);
  hub.addGiftIdea('A', 'TA 想要那双球鞋', '生日');
  assert.equal(hub.snapshot('B').giftIdeas.length, 0);
  assert.equal(hub.snapshot('A').giftIdeas.length, 1);
  const idea = hub.snapshot('A').giftIdeas[0];
  hub.revealGiftIdea('A', idea.id);
  assert.equal(hub.snapshot('B').giftIdeas.length, 1);
});

test('影院完整流程：创建 → 加入 → 就绪 → 倒计时 → 播放 → 暂停 → 结束 → 回忆卡', () => {
  const { hub, clock } = makeHub();
  bind(hub);

  const created = hub.createRoom('A', '春天的故事');
  assert.equal(created.ok, true);
  assert.match(created.value.code, /^\d{6}$/);
  assert.equal(created.value.state, 'WAITING_PEER');

  const joined = hub.joinRoomByCode('B', created.value.code);
  assert.equal(joined.ok, true);
  assert.equal(joined.value.state, 'PREPARING');

  hub.setReady('A');
  assert.equal(hub.snapshot('A').activeRoom.state, 'PREPARING');
  hub.setReady('B');
  assert.equal(hub.snapshot('A').activeRoom.state, 'COUNTDOWN');

  clock.t += 4000;
  hub.tick();
  const playing = hub.snapshot('A').activeRoom;
  assert.equal(playing.state, 'PLAYING');
  assert.equal(playing.mediaState.action, 'play');

  hub.pause('A', 12);
  assert.equal(hub.snapshot('B').activeRoom.state, 'PAUSED');
  assert.equal(hub.snapshot('B').activeRoom.mediaState.positionSec, 12);

  hub.play('A', 12);
  assert.equal(hub.snapshot('B').activeRoom.state, 'PLAYING');

  const ended = hub.endRoom('A');
  assert.equal(ended.ok, true);
  assert.equal(hub.snapshot('A').activeRoom.state, 'ENDED');
  assert.ok(hub.snapshot('A').activeRoom.recap);

  hub.rateMovie('A', 5);
  hub.rateMovie('B', 4);
  hub.reviewMovie('A', '很好看');
  hub.saveRecap('A');
  hub.saveRecap('B');
  const recap = hub.snapshot('A').recaps[0];
  assert.equal(recap.movieTitle, '春天的故事');
  assert.equal(recap.ratings.A, 5);
  assert.equal(recap.ratings.B, 4);
  assert.equal(recap.reviews.A, '很好看');
  assert.equal(recap.saved.length, 2);
});

test('影院：房间容量严格为 2，第 3 次加入被拒', () => {
  const { hub } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', 'x');
  hub.joinRoomByCode('B', created.value.code);
  const again = hub.joinRoomByCode('B', created.value.code);
  assert.equal(again.ok, false);
  assert.equal(again.error, '房间已满');
});

test('邀请码：两台设备角色相同时，靠设备 ID 判断归属（真实事故）', () => {
  const { hub } = makeHub();
  // 她的手机生成码（角色 B，设备 id 是 hers）
  const inv = hub.createInvite('B', 'dev_her');
  assert.equal(inv.ok, true);
  assert.equal(hub.snapshot('A').invite.createdByClientId, 'dev_her');

  // 他的手机也是 B 角色（角色撞了），但设备 id 不同 → 必须能填进去
  const joined = hub.joinWithCode('B', inv.value.code, 'dev_him');
  assert.equal(joined.ok, true, '角色相同但设备不同，应该允许绑定');
  assert.ok(hub.snapshot('A').boundAt !== null);
});

test('邀请码：同一台设备（设备 ID 相同）不能加入自己的码', () => {
  const { hub } = makeHub();
  const inv = hub.createInvite('B', 'dev_her');
  const self = hub.joinWithCode('B', inv.value.code, 'dev_her');
  assert.equal(self.ok, false);
  assert.match(self.error, /你自己生成/);
  assert.equal(hub.snapshot('A').boundAt, null);
});

test('邀请码：拿不到设备 ID 时退回按角色判断（本机单设备场景）', () => {
  const { hub } = makeHub();
  const inv = hub.createInvite('A');
  assert.equal(hub.snapshot('A').invite.createdByClientId, null);
  // 角色相同 → 视为自己
  assert.equal(hub.joinWithCode('A', inv.value.code).ok, false);
  // 角色不同 → 正常加入
  assert.equal(hub.joinWithCode('B', inv.value.code).ok, true);
});

test('邀请码：10 分钟有效期，过期与填错要分别提示', () => {
  const { hub, clock } = makeHub();
  const inv = hub.createInvite('A');
  // 生成时给的是 10 分钟
  assert.equal(inv.value.expireAt - clock.t, 10 * 60 * 1000);

  // 9 分钟时仍然有效（换 B 来填 A 的码）
  clock.t += 9 * 60 * 1000;
  assert.equal(hub.snapshot('A').invite.createdBy, 'A');
  // 还没过期 → 填错码时提示"数字不对"，不是"过期"
  const wrongCode = hub.joinWithCode('B', '000001');
  assert.equal(wrongCode.ok, false);
  assert.match(wrongCode.error, /6 位数字不对/);

  // 超过 10 分钟 → 明确说已过期
  clock.t += 2 * 60 * 1000;
  const expired = hub.joinWithCode('B', inv.value.code);
  assert.equal(expired.ok, false);
  assert.match(expired.error, /已过期（10 分钟内有效）/);
});

test('邀请码：还没人生成时的提示要能指导下一步', () => {
  const { hub } = makeHub();
  const r = hub.joinWithCode('B', '123456');
  assert.equal(r.ok, false);
  assert.match(r.error, /还没有人生成邀请码/);
});

test('影院：重新生成邀请码后旧码立即失效', () => {
  const { hub } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', 'x');
  const oldCode = created.value.code;
  const regen = hub.regenerateRoomCode('A');
  assert.equal(regen.ok, true);
  assert.notEqual(regen.value.code, oldCode);
  const joinOld = hub.joinRoomByCode('B', oldCode);
  assert.equal(joinOld.ok, false);
  assert.equal(joinOld.error, '邀请码无效或已过期');
  const joinNew = hub.joinRoomByCode('B', regen.value.code);
  assert.equal(joinNew.ok, true);
});

test('影院：邀请 30 分钟未加入则过期', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', 'x');
  clock.t += 31 * 60 * 1000;
  hub.tick();
  assert.equal(hub.snapshot('A').activeRoom.state, 'EXPIRED');
  const join = hub.joinRoomByCode('B', created.value.code);
  assert.equal(join.ok, false);
});

test('影院：一方掉线 → 重连回播放；超 5 分钟 → 等待中；再超时 → 自动结束', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', 'x');
  hub.joinRoomByCode('B', created.value.code);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000;
  hub.tick();
  assert.equal(hub.snapshot('A').activeRoom.state, 'PLAYING');

  hub.setOnline('B', false);
  assert.equal(hub.snapshot('A').activeRoom.state, 'PEER_OFFLINE');
  assert.equal(hub.snapshot('A').activeRoom.peerOnline, false);

  hub.setOnline('B', true);
  assert.equal(hub.snapshot('A').activeRoom.state, 'PLAYING');

  hub.setOnline('B', false);
  clock.t += 5 * 60 * 1000 + 1000;
  hub.tick();
  assert.equal(hub.snapshot('A').activeRoom.state, 'WAITING_RECONNECT');

  clock.t += 30 * 60 * 1000 + 1000;
  hub.tick();
  assert.equal(hub.snapshot('A').activeRoom.state, 'ENDED');
  assert.ok(hub.snapshot('A').activeRoom.recap);
});

test('影院：主控转移与接管请求', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', 'x');
  hub.joinRoomByCode('B', created.value.code);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000;
  hub.tick();

  assert.equal(hub.snapshot('A').activeRoom.leaderRole, 'A');
  const req = hub.requestLead('B');
  assert.equal(req.ok, true);
  assert.equal(hub.snapshot('A').activeRoom.pendingLeadRequest, 'B');
  hub.grantLead('A');
  assert.equal(hub.snapshot('A').activeRoom.leaderRole, 'B');
  assert.equal(hub.snapshot('A').activeRoom.pendingLeadRequest, null);
});

test('影院：跟随方"只发一次操作"需主控同意', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', 'x');
  hub.joinRoomByCode('B', created.value.code);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000;
  hub.tick();

  const req = hub.requestAction('B', 'pause');
  assert.equal(req.ok, true);
  assert.equal(hub.snapshot('B').activeRoom.state, 'PLAYING');
  hub.grantAction('A');
  assert.equal(hub.snapshot('B').activeRoom.state, 'PAUSED');
});

test('影院：弹幕绑定当前进度，房间解散后清空', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', 'x');
  hub.joinRoomByCode('B', created.value.code);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000;
  hub.tick();
  hub.seek('A', 300);
  hub.sendDanmaku('A', '这里好哭');
  const room = hub.snapshot('B').activeRoom;
  assert.equal(room.danmaku.length, 1);
  assert.ok(room.danmaku[0].mediaPosSec >= 300);
  hub.cancelRoom('A');
  assert.equal(hub.snapshot('A').activeRoom, null);
});

test('解绑：冷静期可撤销，双方确认后解绑并清空共享数据', () => {
  const { hub, clock } = makeHub();
  bind(hub);
  hub.addTodo('A', { title: '买菜', assignee: 'either', dueDate: null });

  hub.requestUnbind('A', 'delete');
  assert.equal(hub.snapshot('A').unbind.status, 'cooling');
  hub.cancelUnbind('A');
  assert.equal(hub.snapshot('A').unbind.status, 'cancelled');

  hub.requestUnbind('A', 'delete');
  clock.t += 1000;
  // 冷静期没结束前，确认不生效（这条以前是 bug：不校验 coolingEndsAt）
  hub.confirmUnbind('A');
  assert.equal(hub.snapshot('A').unbind.status, 'cooling');
  hub.fastForwardCooling();
  hub.confirmUnbind('A');
  hub.confirmUnbind('B');
  const snap = hub.snapshot('A');
  assert.equal(snap.unbind.status, 'done');
  assert.equal(snap.boundAt, null);
  assert.equal(snap.todos.length, 0);
});

test('生活工具：待办/购物/日历的增改与可见性', () => {
  const { hub } = makeHub();
  bind(hub);

  const todo = hub.addTodo('A', { title: '取快递', assignee: 'B', dueDate: TODAY });
  assert.equal(todo.ok, true);
  hub.toggleTodo('B', todo.value.id);
  assert.equal(hub.snapshot('A').todos[0].done, true);

  const shop = hub.addShopping('B', { title: '牛奶', qty: '2 盒', category: 'fresh' });
  assert.equal(shop.ok, true);
  hub.toggleShopping('A', shop.value.id);
  assert.equal(hub.snapshot('B').shopping[0].done, true);

  const shared = hub.addEvent('A', {
    title: '一起吃饭',
    date: TODAY,
    startMin: 1140,
    endMin: 1230,
    category: 'date',
    visibility: 'shared',
  });
  assert.equal(shared.ok, true);
  const own = hub.addEvent('A', {
    title: '我的私事',
    date: TODAY,
    startMin: 600,
    endMin: 660,
    category: 'reminder',
    visibility: 'self',
  });
  assert.equal(own.ok, true);
  assert.equal(hub.snapshot('B').events.length, 1);
  assert.equal(hub.snapshot('A').events.length, 2);

  const bad = hub.addEvent('A', {
    title: 'x',
    date: TODAY,
    startMin: 600,
    endMin: 500,
    category: 'date',
    visibility: 'shared',
  });
  assert.equal(bad.ok, false);
});

test('心情天气双端可见，24 小时规则由 UI 处理', () => {
  const { hub } = makeHub();
  bind(hub);
  hub.setMood('B', 'rainy', '今天有点累');
  const a = hub.snapshot('A').partnerMood;
  assert.equal(a.weather, 'rainy');
  assert.equal(a.note, '今天有点累');
  assert.equal(hub.snapshot('B').myMood.weather, 'rainy');
});

test('对时样本自洽：B 端时钟偏快 700ms 时 offset 应为 -700', () => {
  const { hub } = makeHub();
  const sample = hub.clockPing('B');
  const rtt = sample.t4 - sample.t1 - (sample.t3 - sample.t2);
  const offset = (sample.t2 - sample.t1 + (sample.t3 - sample.t4)) / 2;
  assert.equal(rtt, 120);
  assert.equal(offset, -700);
  const sampleA = hub.clockPing('A');
  assert.equal((sampleA.t2 - sampleA.t1 + (sampleA.t3 - sampleA.t4)) / 2, 0);
});

// ---------------------------------------------------------------------------
// 「我希望被这样照顾」：不预置模板、各写各的、只能照做不能替改
// ---------------------------------------------------------------------------

test('照顾清单：默认是空的（没有任何预置模板）', () => {
  const { hub } = makeHub();
  bind(hub);
  assert.deepEqual(hub.snapshot('A').myComfort, []);
  assert.deepEqual(hub.snapshot('A').partnerComfort, []);
  assert.deepEqual(hub.snapshot('B').myComfort, []);
  assert.deepEqual(hub.snapshot('B').partnerComfort, []);
});

test('照顾清单：各写各的，对方只读', () => {
  const { hub } = makeHub();
  bind(hub);

  const added = hub.addComfortItem('A', '给我倒杯热水');
  assert.equal(added.ok, true);
  hub.addComfortItem('B', '陪我散散步');

  assert.deepEqual(hub.snapshot('A').myComfort.map((i) => i.text), ['给我倒杯热水']);
  assert.deepEqual(hub.snapshot('A').partnerComfort.map((i) => i.text), ['陪我散散步']);
  assert.deepEqual(hub.snapshot('B').myComfort.map((i) => i.text), ['陪我散散步']);
  assert.deepEqual(hub.snapshot('B').partnerComfort.map((i) => i.text), ['给我倒杯热水']);
});

test('照顾清单：空文本 / 重复 / 超 12 条被拒，只能删自己的', () => {
  const { hub } = makeHub();
  bind(hub);

  assert.equal(hub.addComfortItem('A', '   ').ok, false);
  const first = hub.addComfortItem('A', '抱一下');
  assert.equal(hub.addComfortItem('A', '抱一下').ok, false, '同一条不能重复写');

  // B 不能删 A 的条目
  assert.equal(hub.removeComfortItem('B', first.value.id).ok, false);
  assert.equal(hub.snapshot('A').myComfort.length, 1);
  // A 自己能删
  assert.equal(hub.removeComfortItem('A', first.value.id).ok, true);
  assert.equal(hub.snapshot('A').myComfort.length, 0);

  // 上限 12 条
  for (let i = 0; i < 12; i += 1) {
    assert.equal(hub.addComfortItem('B', `第 ${i} 件`).ok, true);
  }
  assert.equal(hub.addComfortItem('B', '第 13 件').ok, false);
});

test('照顾动作：只能挑对方清单里的条目，并且真发一条脱敏通知', () => {
  const { hub } = makeHub();
  bind(hub);

  const mine = hub.addComfortItem('A', '给我揉揉肩');
  const other = hub.addComfortItem('B', 'B 自己写的');

  // A 不能拿自己清单里的条目"自我照顾"
  assert.equal(hub.sendCareAction('A', mine.value.id).ok, false);
  // A 只能照着 B 的清单做
  assert.equal(hub.sendCareAction('A', other.value.id).ok, true);

  const notices = hub.snapshot('B').notifications;
  // careAction 那条必须在；另外「A 写了清单」也会作为空间动态提醒 B（v1.2.2 新增）
  const care = notices.filter((n) => n.kind === 'careAction');
  assert.equal(care.length, 1);
  assert.equal(care[0].text, 'TA 想为你做点事');
  assert.ok(!care[0].text.includes('自己写的'));
  assert.ok(FORBIDDEN_WORDS.every((w) => !care[0].text.includes(w)));
  // 动态提醒只说到"照顾清单"，绝不带清单原文
  const acts = notices.filter((n) => n.kind.startsWith('activity:'));
  assert.equal(acts.length, 1, 'A 往清单里加东西，B 应该收到一条动态提醒');
  assert.ok(!acts[0].text.includes('揉揉肩'), '动态提醒不能泄露清单原文');
});

test('老存档没有 comfort 字段时补齐为空清单，不报错', () => {
  const { hub } = makeHub();
  bind(hub);
  hub.addComfortItem('A', '一起看部电影');

  const raw = hub.serialize();
  delete raw.comfort;
  const { hub: fresh } = makeHub();
  assert.equal(fresh.hydrate(raw), true);
  assert.deepEqual(fresh.snapshot('A').myComfort, []);
  // 补完以后还能正常写
  assert.equal(fresh.addComfortItem('A', '新的').ok, true);
});

// ---------------------------------------------------------------------------
// 「催一下」「打气」：以前只是前端弹 Toast，现在是真的推通知
// ---------------------------------------------------------------------------

test('催一下 TA：真的推一条脱敏通知，并且 3 分钟内限流', () => {
  const { hub, clock } = makeHub();
  bind(hub);

  assert.equal(hub.nudgePartner('A').ok, true);
  const notice = hub.snapshot('B').notifications;
  assert.equal(notice.length, 1);
  assert.equal(notice[0].kind, 'nudge');
  assert.equal(notice[0].text, 'TA 在等你');

  // 立刻再催 → 被限流
  const again = hub.nudgePartner('A');
  assert.equal(again.ok, false);
  assert.match(again.error, /秒后才能再催/);

  // 过了 3 分钟可以再催
  clock.t += 3 * 60 * 1000 + 1;
  assert.equal(hub.nudgePartner('A').ok, true);
  assert.equal(hub.snapshot('B').notifications.length, 2);

  // A 自己收不到自己催的
  assert.equal(hub.snapshot('A').notifications.filter((n) => n.kind === 'nudge').length, 0);
});

test('打气：只能给 TA 的习惯打气，且真的推通知', () => {
  const { hub } = makeHub();
  bind(hub);
  const h = hub.addHabit('A', '早睡');
  assert.equal(h.ok, true);
  const habitId = h.value.id;

  // A 不能给自己的打气
  assert.equal(hub.cheerHabit('A', habitId).ok, false);
  // B 可以给 A 打气
  assert.equal(hub.cheerHabit('B', habitId).ok, true);
  const notice = hub.snapshot('A').notifications;
  assert.ok(notice.some((n) => n.kind === 'cheer' && n.text === 'TA 在给你打气'));
  // 不存在的习惯
  assert.equal(hub.cheerHabit('B', 'nope').ok, false);
});

// ---------------------------------------------------------------------------
// 远程模式：服务端发的是**投影后的 snapshot**，客户端必须能据此还原本地状态
// 这一组断言就是为了守住"两台手机连上后心情/照顾清单/房间都不显示"那个 bug
// ---------------------------------------------------------------------------

test('远程同步：投影快照 → hydrateProjected 能还原心情、清单、邀请码', () => {
  const { hub } = makeHub();
  bind(hub);
  hub.setMood('B', 'rainy', '今天有点累');
  hub.addComfortItem('B', '帮我捶捶背');

  // A 手机上：服务端只给 A 它能看到的那份投影
  const projected = hub.snapshot('A');
  const client = makeHub().hub;
  assert.equal(client.hydrateProjected(projected, 'A'), true);

  const mine = client.snapshot('A');
  assert.equal(mine.partnerMood.weather, 'rainy');
  assert.equal(mine.partnerMood.note, '今天有点累');
  assert.deepEqual(mine.partnerComfort.map((i) => i.text), ['帮我捶捶背']);
  assert.equal(mine.myComfort.length, 0);
  assert.equal(mine.boundAt, projected.boundAt);
  assert.equal(mine.members.A.name, projected.members.A.name);
});

test('远程同步：房间能反向还原（activeRoom 不再丢失）', () => {
  const { hub } = makeHub();
  bind(hub);
  const created = hub.createRoom('A', '春天的故事', 'https://example.com/a.m3u8');
  assert.equal(created.ok, true);

  const projected = hub.snapshot('A');
  assert.ok(projected.activeRoom, '投影里应该有 activeRoom');

  const client = makeHub().hub;
  assert.equal(client.hydrateProjected(projected, 'A'), true);
  const view = client.snapshot('A').activeRoom;
  assert.ok(view, '还原后本地 hub 也要能投影出房间');
  assert.equal(view.movieTitle, '春天的故事');
  assert.equal(view.sourceUrl, 'https://example.com/a.m3u8');
  assert.equal(view.leaderRole, 'A');
});

test('远程同步：保险箱明文只回给本人，别人那条不下发', () => {
  const { hub } = makeHub();
  bind(hub);
  const added = hub.addVaultItem('A', '备用钥匙', '藏在门口花盆下');
  assert.equal(added.ok, true);

  const snapA = hub.snapshot('A');
  assert.equal(snapA.vault.length, 1);
  assert.equal(snapA.vault[0].secret, '藏在门口花盆下');

  // 没授权：B 连条目都看不到
  assert.equal(hub.snapshot('B').vault.length, 0);

  // 授权后：B 看得到、能打开，但列表里仍然没有密文
  hub.grantVaultAccess('A', added.value.id, 'B');
  const snapB = hub.snapshot('B');
  assert.equal(snapB.vault.length, 1);
  assert.equal(snapB.vault[0].canOpen, true);
  assert.equal('secret' in snapB.vault[0], false, '列表里永远不下发密文');

  // A 在远程模式下也能读回自己的明文
  const client = makeHub().hub;
  client.hydrateProjected(snapA, 'A');
  assert.equal(client.openVaultItem('A', added.value.id).value, '藏在门口花盆下');
});

test('回应「需要抱抱」：发卡 + 收下请求（对方状态被清掉，按钮不再重复出现）', () => {
  const { Hub } = require('../dist-core/hub.js');
  const hub = new Hub();
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');

  // B 说"需要抱抱"
  const set = hub.setMood('B', 'hug', '');
  assert.equal(set.ok, true);
  assert.equal(hub.snapshot('A').partnerMood?.weather, 'hug', 'A 应该看到 TA 需要抱抱');

  // 没有抱抱请求时不能乱抱
  assert.equal(hub.hugBack('B').ok, false, 'B 自己没有在等抱抱，不能抱');

  // A 抱回去
  const hug = hub.hugBack('A', '抱一下');
  assert.equal(hug.ok, true);
  assert.equal(hug.value.card?.kind, 'hug', '要真的发一张抱抱卡');
  assert.equal(hub.snapshot('A').partnerMood, null, '抱完之后 A 这边不该还挂着"需要抱抱"');
  assert.equal(hub.snapshot('B').myMood, null, 'B 那边的抱抱请求也应该被收下');
  assert.equal(hub.snapshot('B').cards[0].text, '抱一下', 'B 的卡片列表里要有这句话');
  // 同一个人不会被重复"抱"（状态已清）
  assert.equal(hub.hugBack('A').ok, false, '不能对着已经收下的请求再抱一次');
});

test('「收到啦」只能收一次：重复点要被拒，发卡人自己不能收', () => {
  const { hub } = makeHub();
  bind(hub);
  const card = hub.sendCard('A', 'hug', '抱一下');
  assert.equal(card.ok, true);
  const id = card.value.id;

  // 发卡人自己不能"收到"自己的卡
  assert.equal(hub.acceptCard('A', id).ok, false, '自己发的卡不该能自己收');

  // 收卡人可以收，且只成功一次（以前可以无限点，每次都"接受成功"）
  const first = hub.acceptCard('B', id);
  assert.equal(first.ok, true);
  assert.equal(first.value.accepted, true);
  assert.equal(first.value.acceptedBy, 'B');
  assert.ok(typeof first.value.acceptedAt === 'number', '要记下收下的时间');

  const second = hub.acceptCard('B', id);
  assert.equal(second.ok, false, '第二次必须被拒绝');
  assert.match(second.error, /已经收下过/);

  // 发卡人这边能看到"已收"，并收到一条通知
  assert.equal(hub.snapshot('A').cards.find((c) => c.id === id).accepted, true);
  const notice = hub.snapshot('A').notifications.find((n) => n.text.includes('收下了你的卡片'));
  assert.ok(notice, '对方收卡后要通知发卡人');
  assert.ok(!notice.text.includes('抱一下'), '通知里不能带卡片正文');

  // 收卡人自己的投影里：发给我的卡标记为已收，不会再出现"收到啦"
  const mine = hub.snapshot('B').cards.find((c) => c.id === id);
  assert.equal(mine.accepted, true);
  assert.equal(mine.from, 'A');
});

test('「回一句」同一句话只记一条（防止连点刷屏）', () => {
  const { hub } = makeHub();
  bind(hub);
  const card = hub.sendCard('A', 'thanks', '谢谢你昨天的饭');
  const id = card.value.id;

  assert.equal(hub.replyCard('B', id, '收到，谢谢你').ok, true);
  assert.equal(hub.replyCard('B', id, '收到，谢谢你').ok, false, '同一句话不该重复记');
  assert.equal(hub.replyCard('B', id, '另外想说辛苦了').ok, true, '换一句还是可以回');
  assert.equal(hub.replyCard('B', id, '   ').ok, false, '空回复要被拒');

  const replies = hub.snapshot('A').cards.find((c) => c.id === id).replies;
  assert.equal(replies.length, 2);
  assert.deepEqual(replies.map((r) => r.text), ['收到，谢谢你', '另外想说辛苦了']);
});

test('空闲 tick 不该改状态：状态推送才能去重（这是反复重连的根因之一）', () => {
  const { hub, clock } = makeHub();
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  hub.petCare('A', 'water');
  hub.petCare('B', 'feed');
  hub.tick();

  const before = JSON.stringify(hub.serialize());
  // 模拟 30 秒空闲：每 3 秒 tick 一次
  for (let i = 0; i < 10; i += 1) {
    clock.t += 3000;
    hub.tick();
  }
  const after = JSON.stringify(hub.serialize());
  assert.equal(after, before, '状态里不能有每次 tick 都被改写的时间戳');
});

test('宠物衰减真的会掉水/掉粮（不写库也要算对）', () => {
  const { hub, clock } = makeHub();
  hub.petCare('A', 'water');
  const full = hub.snapshot('A').pet.water;
  // 10 小时后：每小时 -2 → -20
  clock.t += 10 * 3_600_000;
  hub.tick();
  assert.equal(hub.snapshot('A').pet.water, Math.max(0, full - 20));
  // 再 5 小时 → 再 -10
  clock.t += 5 * 3_600_000;
  hub.tick();
  assert.equal(hub.snapshot('A').pet.water, Math.max(0, full - 30));
});

// ---------------------------------------------------------------------------
// 空间动态：对方新增/删除了什么，我这边必须收到提醒
// ---------------------------------------------------------------------------

test('动态提醒：对方新增日记 → 我这边有条动态 + 一条通知，自己的动作不提醒自己', () => {
  const { hub } = makeHub();
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');

  hub.addDiaryEntry('B', '今天去看海了，海风好大');

  const mine = hub.snapshot('A').activity;
  const diary = mine.find((a) => a.entity === 'diary');
  assert.ok(diary, 'A 应该看到 B 的这条日记动态');
  assert.equal(diary.byRole, 'B');
  assert.equal(diary.action, 'add');
  assert.equal(diary.entityLabel, '日记');
  assert.ok(diary.title.includes('海风'), '动态里要带上写的是哪一篇');

  // 自己做的事不进自己的动态（不然每次操作都自己提醒自己）
  const hers = hub.snapshot('B').activity;
  assert.equal(hers.filter((a) => a.byRole === 'B').length, 0, 'B 不该收到自己的动态');

  const notice = hub.snapshot('A').notifications.find((n) => n.kind === 'activity:diary');
  assert.ok(notice, 'B 写日记后 A 必须收到通知');
  assert.ok(notice.text.startsWith('TA 新增了日记'));
});

test('动态提醒：新增与删除都要提醒（安排 / 待办 / 家务 / 记账 / 习惯 / 目标）', () => {
  const { hub } = makeHub();
  bind(hub);

  const ev = hub.addEvent('B', {
    title: '一起吃饭',
    date: TODAY,
    startMin: 600,
    endMin: 660,
    category: 'date',
    visibility: 'shared',
  });
  const todo = hub.addTodo('B', { title: '买牛奶', assignee: 'either', dueDate: null });
  const chore = hub.addChore('B', '洗碗', 'B');
  hub.addLedger('B', {
    title: '外卖',
    amountCents: 3200,
    payerRole: 'B',
    split: 'equal',
    category: 'food',
    date: TODAY,
  });
  const habit = hub.addHabit('B', '早睡');
  const goal = hub.addGoal('B', { title: '去日本', targetCents: 100000, targetDate: null });

  let feed = hub.snapshot('A').activity;
  const addEntities = feed.filter((a) => a.action === 'add').map((a) => a.entity).sort();
  assert.deepEqual(
    addEntities,
    ['chore', 'event', 'goal', 'habit', 'ledger', 'todo'],
    `六次新增都要有动态，实际 ${addEntities.join(',')}`,
  );

  // 删除也要提醒
  hub.deleteEvent('B', ev.value.id);
  hub.deleteTodo('B', todo.value.id);
  hub.deleteChore('B', chore.value.id);

  feed = hub.snapshot('A').activity;
  const deletes = feed.filter((a) => a.action === 'delete');
  assert.equal(deletes.length, 3, '三次删除都要提醒');
  assert.ok(deletes.every((d) => d.byRole === 'B'));

  // 完成也算一次变化
  const todo2 = hub.addTodo('B', { title: '倒垃圾', assignee: 'either', dueDate: null });
  assert.equal(hub.toggleTodo('B', todo2.value.id).ok, true);
  const done = hub.snapshot('A').activity.filter((a) => a.action === 'done');
  assert.ok(done.length >= 1, '完成一条待办也要提醒');
  assert.ok(habit.ok && goal.ok);
});

test('动态提醒：私密条目 / 保险箱 / 清单原文不能泄露给伴侣', () => {
  const { hub } = makeHub();
  bind(hub);

  hub.collectionAdd('B', 'people', { title: '只有我能看的私密卡', visibility: 'owner' });
  hub.addVaultItem('B', '银行卡密码', '123456');

  const asPartner = JSON.stringify(hub.snapshot('A'));
  assert.equal(asPartner.includes('只有我能看的私密卡'), false, '私密条目连存在都不能暴露');
  assert.equal(asPartner.includes('银行卡密码'), false, '保险箱名称不能进动态');
  assert.equal(asPartner.includes('123456'), false, '保险箱内容更不能出现');

  // 但"存了一条保险箱条目"这件事本身要提醒（界面上是中性说法）
  const vaultNotice = hub.snapshot('A').notifications.find((n) => n.kind === 'activity:vault');
  assert.ok(vaultNotice, '存保险箱也要提醒对方');
  assert.ok(vaultNotice.text.includes('保险箱'));
});

test('动态提醒：对方改了心情 / 发了卡片 / 加了歌，也都要有动态', () => {
  const { hub } = makeHub();
  bind(hub);

  hub.setMood('B', 'rainy', '');
  hub.sendCard('B', 'thanks', '谢谢昨天的饭');
  hub.addMusicTrack('B', { title: '晴天', artist: '周杰伦', url: 'https://a.b/c.mp3' });

  const feed = hub.snapshot('A').activity;
  const labels = feed.map((a) => a.entityLabel);
  assert.ok(labels.includes('心情'), '心情变化要有动态');
  assert.ok(labels.includes('感谢卡'), '卡片要有动态（带卡片种类）');
  assert.ok(labels.includes('一起听歌曲'), '加歌要有动态');
  assert.equal(feed.filter((a) => a.byRole !== 'B').length, 0, '动态只能是对方做的');
});

