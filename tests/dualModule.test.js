/* eslint-disable */
/**
 * 双人同步总回归：每个模块的"新增/删除"都要真的同步到对方。
 *
 * 为什么单独写一个：之前的 bug 都是"我这边的操作对方看不到"这一类
 * （日记、安排、账本、清单、物资库存、片库接口……）。这里把每个模块都跑一遍，
 * **两个方向都跑**（A 做 → B 看得到；B 做 → A 看得到），一个都不能漏。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { Hub } = require('../dist-core/hub.js');
const { toISODate } = require('../dist-core/time.js');

const TODAY = toISODate(Date.now());

function makeBound() {
  const hub = new Hub();
  hub.updateMyProfile('A', { name: '甲', birthDate: '1999-01-01', gender: 'male' });
  hub.updateMyProfile('B', { name: '乙', birthDate: '2000-02-02', gender: 'female' });
  hub.bindPair('A');
  return hub;
}

const other = (r) => (r === 'A' ? 'B' : 'A');

/** 某个模块：actor 做一次新增，partner 的投影里必须能看到 */
function expectSynced(actor, run, read, label) {
  const hub = makeBound();
  const partner = other(actor);
  const res = run(hub, actor);
  assert.equal(res.ok, true, `${label}：${actor} 的操作失败了（${res.error ?? ''}）`);
  const seen = read(hub, partner);
  assert.ok(seen, `${label}：${partner} 那边看不到 ${actor} 做的改动`);
  return { hub, partner, res };
}

test('总回归：A→B 与 B→A，各模块新增都能同步', () => {
  for (const actor of ['A', 'B']) {
    // 安排
    expectSynced(
      actor,
      (hub, me) =>
        hub.addEvent(me, {
          title: `${me} 的饭局`,
          date: TODAY,
          startMin: 600,
          endMin: 660,
          category: 'date',
          visibility: 'shared',
        }),
      (hub, partner) => hub.snapshot(partner).events.some((e) => e.title.includes('饭局')),
      `安排(${actor})`,
    );

    // 待办
    expectSynced(
      actor,
      (hub, me) => hub.addTodo(me, { title: `${me} 的待办`, assignee: 'either', dueDate: null }),
      (hub, partner) => hub.snapshot(partner).todos.some((t) => t.title.includes('待办')),
      `待办(${actor})`,
    );

    // 购物
    expectSynced(
      actor,
      (hub, me) => hub.addShopping(me, { title: `${me} 的牛奶`, qty: '1L', category: 'food' }),
      (hub, partner) => hub.snapshot(partner).shopping.some((s) => s.title.includes('牛奶')),
      `购物(${actor})`,
    );

    // 日记
    expectSynced(
      actor,
      (hub, me) => hub.addDiaryEntry(me, `${me} 今天很开心`),
      (hub, partner) => {
        const d = hub.snapshot(partner).diary;
        return d.some((x) => (x.body[actor] ?? '').includes('很开心'));
      },
      `日记(${actor})`,
    );

    // 家务
    expectSynced(
      actor,
      (hub, me) => hub.addChore(me, `${me} 洗碗`, me),
      (hub, partner) => hub.snapshot(partner).chores.some((c) => c.title.includes('洗碗')),
      `家务(${actor})`,
    );

    // 记账（共享）
    expectSynced(
      actor,
      (hub, me) =>
        hub.addLedger(me, {
          title: `${me} 买菜`,
          amountCents: 2300,
          payerRole: me,
          split: 'equal',
          category: 'food',
          date: TODAY,
          visibility: 'shared',
        }),
      (hub, partner) => hub.snapshot(partner).ledger.some((l) => l.title.includes('买菜')),
      `记账(${actor})`,
    );

    // 物资库存（集合型）
    expectSynced(
      actor,
      (hub, me) => hub.collectionAdd(me, 'inventory', { title: `${me} 纸巾`, note: '两提' }),
      (hub, partner) =>
        hub.snapshot(partner).collection.some((c) => c.kind === 'inventory' && c.title.includes('纸巾')),
      `物资库存(${actor})`,
    );

    // 愿望清单
    expectSynced(
      actor,
      (hub, me) => hub.collectionAdd(me, 'wishlist', { title: `${me} 想去看海` }),
      (hub, partner) =>
        hub.snapshot(partner).collection.some((c) => c.kind === 'wishlist' && c.title.includes('看海')),
      `愿望清单(${actor})`,
    );

    // 习惯
    expectSynced(
      actor,
      (hub, me) => hub.addHabit(me, `${me} 早睡`),
      (hub, partner) => hub.snapshot(partner).habits.some((x) => x.title.includes('早睡')),
      `习惯(${actor})`,
    );

    // 目标
    expectSynced(
      actor,
      (hub, me) => hub.addGoal(me, { title: `${me} 存钱`, targetCents: 100000, targetDate: null }),
      (hub, partner) => hub.snapshot(partner).goals.some((g) => g.title.includes('存钱')),
      `目标(${actor})`,
    );

    // 卡片
    expectSynced(
      actor,
      (hub, me) => hub.sendCard(me, 'thanks', `${me} 谢谢你`),
      (hub, partner) => hub.snapshot(partner).cards.some((c) => c.text.includes('谢谢你')),
      `卡片(${actor})`,
    );

    // 一起听
    expectSynced(
      actor,
      (hub, me) => hub.addMusicTrack(me, { title: `${me} 的歌`, artist: 'x', url: 'https://a.b/c.mp3' }),
      (hub, partner) => hub.snapshot(partner).music.queue.length === 1,
      `一起听(${actor})`,
    );

    // 共同计划
    expectSynced(
      actor,
      (hub, me) => hub.addPlanItem(me, { title: `${me} 的计划`, targetDate: null, owners: [me], notes: '' }),
      (hub, partner) => hub.snapshot(partner).plans.some((p) => p.title.includes('计划')),
      `共同计划(${actor})`,
    );

    // 关系约定
    expectSynced(
      actor,
      (hub, me) => hub.addBoundary(me, 'money', `${me} 的约定`),
      (hub, partner) => hub.snapshot(partner).boundaries.some((b) => b.text.includes('约定')),
      `关系约定(${actor})`,
    );

    // 报备（先开启开关）
    {
      const hub = makeBound();
      hub.setTrust(actor, { arrivedReport: true });
      const res = hub.addSocialReport(actor, '公司楼下', '同事', '21:00');
      assert.equal(res.ok, true, `报备(${actor}) 添加失败`);
      assert.ok(
        hub.snapshot(other(actor)).socialReports.some((r) => r.place.includes('公司楼下')),
        `报备(${actor})：对方看不到`,
      );
    }

    // 关怀提醒：默认只对自己可见（隐私设计），打开可见性后才同步给 TA
    {
      const hub = makeBound();
      assert.equal(hub.addCareReminder(actor, 'water', '15:00', '喝水').ok, true);
      assert.equal(
        hub.snapshot(other(actor)).careReminders.some((r) => r.time === '15:00'),
        false,
        '关怀提醒默认不该被对方看到',
      );
      const mine = hub.state ?? null;
      void mine;
      const list = hub.snapshot(actor).careReminders.find((r) => r.time === '15:00');
      assert.ok(list, '自己的提醒自己要能看到');
      assert.equal(hub.setCareReminderVisibility(actor, list.id, true).ok, true);
      assert.ok(
        hub.snapshot(other(actor)).careReminders.some((r) => r.time === '15:00'),
        '打开可见性之后对方必须能看到',
      );
    }

    // 照顾清单：各写各的，但对方能读到（照做用）
    {
      const hub = makeBound();
      const res = hub.addComfortItem(actor, `${actor} 想被抱一下`);
      assert.equal(res.ok, true);
      assert.equal(hub.snapshot(actor).myComfort.length, 1, '自己的清单里要有');
      assert.equal(
        hub.snapshot(other(actor)).partnerComfort.length,
        1,
        'TA 的清单对方要能读到（不然没法照着做）',
      );
    }

    // 心情
    expectSynced(
      actor,
      (hub, me) => hub.setMood(me, 'sunny', ''),
      (hub, partner) => hub.snapshot(partner).partnerMood?.weather === 'sunny',
      `心情(${actor})`,
    );
  }
});

test('总回归：删除也要同步到对方（安排 / 待办 / 家务 / 清单）', () => {
  for (const actor of ['A', 'B']) {
    const partner = other(actor);
    const hub = makeBound();
    const ev = hub.addEvent(actor, {
      title: '要删的安排',
      date: TODAY,
      startMin: 600,
      endMin: 620,
      category: 'date',
      visibility: 'shared',
    });
    const todo = hub.addTodo(actor, { title: '要删的待办', assignee: 'either', dueDate: null });
    const chore = hub.addChore(actor, '要删的家务', actor);
    const wish = hub.collectionAdd(actor, 'wishlist', { title: '要删的愿望' });

    assert.equal(hub.deleteEvent(actor, ev.value.id).ok, true);
    assert.equal(hub.deleteTodo(actor, todo.value.id).ok, true);
    assert.equal(hub.deleteChore(actor, chore.value.id).ok, true);
    assert.equal(hub.collectionDelete(actor, wish.value.id).ok, true);

    const snap = hub.snapshot(partner);
    assert.equal(snap.events.some((e) => e.title === '要删的安排'), false, `删除安排(${actor}) 没同步`);
    assert.equal(snap.todos.some((t) => t.title === '要删的待办'), false, `删除待办(${actor}) 没同步`);
    assert.equal(snap.chores.some((c) => c.title === '要删的家务'), false, `删除家务(${actor}) 没同步`);
    assert.equal(snap.collection.some((c) => c.title === '要删的愿望'), false, `删除清单(${actor}) 没同步`);
  }
});

test('总回归：图片类（头像/背景）同步的是服务器路径，不是本地文件', () => {
  const hub = makeBound();
  hub.setMyAvatar('A', '/avatar/TWAAAAAAAA-aaa.jpg');
  hub.setBackground('B', '/background/TWBBBBBBBB-bbb.jpg');

  assert.equal(hub.snapshot('B').members.A.avatarUri, '/avatar/TWAAAAAAAA-aaa.jpg');
  assert.equal(hub.snapshot('A').profile.backgroundUri, '/background/TWBBBBBBBB-bbb.jpg');
  // 存本地路径也不算错（本机能看），但界面上会走迁移流程把它传上去
  hub.setMyAvatar('B', 'file:///data/user/0/com.twospace.app/files/x.jpg');
  assert.match(hub.snapshot('A').members.B.avatarUri, /^file:/);
});
