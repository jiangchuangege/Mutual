/* eslint-disable */
/**
 * 全功能领域测试：模块1–7 的服务端规则、权限与可判定行为。
 * 只测"能被断言的行为"，不测文案。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hub } = require('../dist-core/hub.js');
const { toISODate } = require('../dist-core/time.js');

const T0 = Date.UTC(2026, 2, 20, 10, 0, 0);

function makeHub() {
  const clock = { t: T0 };
  const hub = new Hub({ now: () => clock.t, latencyMs: 120, scale: 1, clockSkew: { A: 0, B: 700 } });
  const inv = hub.createInvite('A');
  hub.joinWithCode('B', inv.value.code);
  return { hub, clock };
}

const day = (offset) => toISODate(T0 + offset * 86400000);

// ---------------------------------------------------------------- 模块1
test('1.3 共同房间：装饰双方同步，非法位置被拒', () => {
  const { hub } = makeHub();
  assert.equal(hub.decorate('A', 'plant', 'plant-flower').ok, true);
  assert.equal(hub.snapshot('B').decor.slots.plant, 'plant-flower');
  assert.equal(hub.decorate('A', 'not-a-slot', 'x').ok, false);
});

test('1.4 宠物：照料增加数值，affection 永不减少，无排名字段', () => {
  const { hub, clock } = makeHub();
  hub.petCare('A', 'water');
  const after = hub.snapshot('A').pet;
  assert.ok(after.water > 0);
  assert.equal(after.careDays >= 1, true);
  // 时间推进 100 小时：water/food 衰减到 0，但 affection 不变
  const beforeAffection = after.affection;
  clock.t += 100 * 3600 * 1000;
  hub.tick();
  const later = hub.snapshot('A').pet;
  assert.ok(later.water >= 0);
  assert.equal(later.affection, beforeAffection);
  assert.equal('rank' in later, false);
});

test('1.5 主题：可同步给双方，也可各自生效', () => {
  const { hub } = makeHub();
  hub.setTheme('A', 'starry', false);
  assert.equal(hub.snapshot('A').themes.current.A, 'starry');
  assert.equal(hub.snapshot('B').themes.current.B, 'cream');
  hub.setTheme('B', 'paper', true);
  assert.equal(hub.snapshot('A').themes.current.A, 'paper');
  assert.equal(hub.snapshot('A').themes.synced, true);
});

// ---------------------------------------------------------------- 模块2
test('2.3 家务：可认领、可按周轮换、完成状态按周记录', () => {
  const { hub, clock } = makeHub();
  const chore = hub.addChore('A', '洗碗', 'A', ['A', 'B']);
  assert.equal(chore.ok, true);
  assert.equal(hub.currentChoreAssignee(chore.value), 'A');
  hub.completeChore('B', chore.value.id);
  assert.equal(hub.snapshot('A').chores[0].doneWeekKeys.length, 1);
  // 过一周：轮换到下一个人
  clock.t += 8 * 86400000;
  hub.tick();
  const rotated = hub.snapshot('A').chores[0];
  assert.equal(hub.currentChoreAssignee(rotated), 'B');
  assert.equal(rotated.doneWeekKeys.length, 1, '上周的完成记录仍保留');
  // 认领
  hub.claimChore('A', chore.value.id);
  assert.equal(hub.snapshot('B').chores[0].assignee, 'A');
});

test('2.5 记账：人均分摊余额正确，未双方确认不计入', () => {
  const { hub } = makeHub();
  hub.addLedger('A', {
    title: '民宿',
    amountCents: 100000,
    payerRole: 'A',
    split: 'equal',
    category: 'travel',
    date: day(0),
  });
  const bal1 = hub.ledgerBalance();
  assert.equal(bal1.pendingCount, 1);
  assert.equal(bal1.amountCents, 0, '未确认不计入');
  const entryId = hub.snapshot('A').ledger[0].id;
  hub.confirmLedger('B', entryId);
  const bal2 = hub.ledgerBalance();
  assert.equal(bal2.settledCount, 1);
  // A 付 1000，应承担 500 → A 多付 500 → 正数表示 A 应收
  assert.equal(bal2.amountCents, 50000);
});

test('2.5 记账：自定义比例与非法金额校验', () => {
  const { hub } = makeHub();
  hub.addLedger('B', {
    title: '房租',
    amountCents: 300000,
    payerRole: 'B',
    split: 'custom',
    shares: { A: 1, B: 2 },
    category: 'rent',
    date: day(0),
  });
  const e = hub.snapshot('A').ledger[0];
  assert.equal(Math.round(e.shares.A * 100), 33);
  assert.equal(Math.round(e.shares.B * 100), 67);
  const bad = hub.addLedger('A', {
    title: 'x',
    amountCents: 0,
    payerRole: 'A',
    split: 'equal',
    category: 'other',
    date: day(0),
  });
  assert.equal(bad.ok, false);
});

test('2.7 人物档案：私密卡对伴侣完全不可见（连数量都不显示）', () => {
  const { hub } = makeHub();
  hub.collectionAdd('A', 'people', { title: '公开的卡' });
  hub.collectionAdd('A', 'people', { title: '私密的卡', visibility: 'owner' });
  const mine = hub.snapshot('A').collection.filter((i) => i.kind === 'people');
  const partner = hub.snapshot('B').collection.filter((i) => i.kind === 'people');
  assert.equal(mine.length, 2);
  assert.equal(partner.length, 1);
  assert.equal(JSON.stringify(hub.snapshot('B')).includes('私密的卡'), false);
});

test('2.6/2.8 集合：认领、投票、删除权限', () => {
  const { hub } = makeHub();
  const wish = hub.collectionAdd('A', 'wishlist', { title: '一起去看海' });
  hub.collectionClaim('B', wish.value.id);
  assert.equal(hub.snapshot('A').collection[0].claimedBy, 'B');

  const rest = hub.collectionAdd('A', 'restaurant', { title: '那家云南菜' });
  hub.collectionVote('A', rest.value.id, 'like');
  hub.collectionVote('B', rest.value.id, 'nope');
  const item = hub.snapshot('A').collection.find((i) => i.id === rest.value.id);
  assert.equal(item.votes.A, 'like');
  assert.equal(item.votes.B, 'nope');

  const ownerOnly = hub.collectionAdd('A', 'people', { title: '秘密', visibility: 'owner' });
  assert.equal(hub.collectionDelete('B', ownerOnly.value.id).ok, false, '伴侣不能删私密卡');
  assert.equal(hub.collectionDelete('A', ownerOnly.value.id).ok, true);
});

test('2.11 愿望罐：随机抽取只从罐子里取', () => {
  const { hub } = makeHub();
  hub.collectionAdd('A', 'wishJar', { title: '看日出' });
  hub.collectionAdd('B', 'wishJar', { title: '一起做饭' });
  const draw = hub.collectionDrawRandom('A');
  assert.equal(draw.ok, true);
  assert.ok(['看日出', '一起做饭'].includes(draw.value.title));
});

test('2.12 习惯：打卡可增删，断签不清零、无惩罚字段', () => {
  const { hub } = makeHub();
  const habit = hub.addHabit('A', '喝水');
  hub.toggleHabit('A', habit.value.id, day(0));
  // 伴侣不能替 TA 打卡，只能鼓励
  assert.equal(hub.toggleHabit('B', habit.value.id, day(0)).ok, false);
  assert.deepEqual(hub.snapshot('B').habits[0].checkins, [day(0)]);
  hub.toggleHabit('A', habit.value.id, day(0));
  assert.deepEqual(hub.snapshot('A').habits[0].checkins, []);
  const h = hub.snapshot('A').habits[0];
  assert.equal('streak' in h, false);
  assert.equal('penalty' in h, false);
});

test('2.13 目标：出资累加并在达标时完成', () => {
  const { hub } = makeHub();
  const goal = hub.addGoal('A', { title: '旅行基金', targetCents: 100000, targetDate: null });
  hub.contributeGoal('A', goal.value.id, 60000);
  hub.contributeGoal('B', goal.value.id, 40000);
  const g = hub.snapshot('A').goals[0];
  assert.equal(g.savedCents, 100000);
  assert.equal(g.done, true);
  assert.equal(g.contributions.length, 2);
  assert.equal(hub.contributeGoal('A', goal.value.id, -1).ok, false);
});

// ---------------------------------------------------------------- 模块3
test('3.4 关怀提醒：仅本人可改，可单独授权让伴侣看到', () => {
  const { hub } = makeHub();
  hub.addCareReminder('A', 'rest', '21:00', '早点睡');
  const mine = hub.snapshot('A').careReminders;
  assert.equal(mine.length, 1);
  assert.equal(hub.snapshot('B').careReminders.length, 0, '默认对伴侣不可见');
  const id = mine[0].id;
  assert.equal(hub.toggleCareReminder('B', id).ok, false);
  assert.equal(hub.setCareReminderVisibility('A', id, true).ok, true);
  assert.equal(hub.snapshot('B').careReminders.length, 1);
});

test('3.10 计划记录：默认不可见；由本人单独勾选才对伴侣可见（与经期档位解耦）', () => {
  const { hub, clock } = makeHub();
  hub.addPlanEntry('A', 'contraception', day(0), '备注');
  assert.equal(hub.snapshot('B').partnerPeriod, null);
  clock.t += 1000;
  hub.setPeriodTier('A', 'care', false);
  assert.equal(hub.snapshot('B').partnerPeriod.planLog, undefined, '默认不可见');
  /*
   * 计划记录共享与经期档位解耦：以前要求先开到「完全共享」才能共享计划记录，
   * 结果男方（没有经期记录、看不到那个开关）永远无法把自己的记录给伴侣看。
   */
  assert.equal(hub.togglePlanLogShare('A').ok, true, '任何档位都能共享自己的计划记录');
  clock.t += 1000;
  hub.setPeriodTier('A', 'full', true);
  assert.equal(hub.snapshot('B').partnerPeriod.planLog.length, 1);
  assert.equal(hub.togglePlanLogShare('A').ok, true, '可以随时撤回');
  assert.equal(hub.snapshot('B').partnerPeriod.planLog, undefined);
});

// ---------------------------------------------------------------- 模块4
test('4.3/4.12 卡片：感谢与夸夸可回应、可接受', () => {
  const { hub } = makeHub();
  const card = hub.sendCard('A', 'thanks', '谢谢你带早饭', '带早饭');
  assert.equal(card.ok, true);
  hub.replyCard('B', card.value.id, '小事');
  hub.acceptCard('B', card.value.id);
  const c = hub.snapshot('A').cards[0];
  assert.equal(c.replies.length, 1);
  assert.equal(c.accepted, true);
  assert.equal(hub.sendCard('A', 'thanks', '').ok, false);
});

test('4.7 冷静卡：三种需求可选，并发中性通知', () => {
  const { hub } = makeHub();
  const card = hub.sendCard('A', 'calm', '我需要缓一下', '', 'space');
  const c = hub.snapshot('B').cards[0];
  assert.equal(c.kind, 'calm');
  assert.equal(c.meta, 'space');
  const notes = hub.snapshot('B').notifications;
  assert.ok(notes.some((n) => n.text.includes('关心')));
  void card;
});

test('4.2 每日一问：双方都答完才都可见（数据结构保证）', () => {
  const { hub } = makeHub();
  hub.ensureDailyQuestion();
  hub.answerDailyQuestion('A', '想被抱一下');
  const q1 = hub.snapshot('A').dailyQuestion;
  assert.equal(q1.answers.A, '想被抱一下');
  assert.equal(q1.answers.B, undefined);
  hub.answerDailyQuestion('B', '想一起吃饭');
  const q2 = hub.snapshot('A').dailyQuestion;
  assert.equal(q2.answers.B, '想一起吃饭');
  assert.equal(q2.question.length > 0, true);
});

test('4.4 语音留言：时长校验 + 定时送达', () => {
  const { hub } = makeHub();
  assert.equal(hub.addVoiceNote('A', 'file://a.m4a', 0, null).ok, false);
  assert.equal(hub.addVoiceNote('A', 'file://a.m4a', 90, null).ok, false);
  const okNote = hub.addVoiceNote('A', 'file://a.m4a', 12, T0 + 3600000);
  assert.equal(okNote.ok, true);
  assert.equal(okNote.value.deliverAt, T0 + 3600000);
  assert.equal(hub.snapshot('B').voiceNotes.length, 1);
});

test('4.5 双人日记：两人各写一段落在同一篇', () => {
  const { hub } = makeHub();
  hub.addDiaryEntry('A', '今天很开心');
  hub.addDiaryEntry('B', '我也是');
  const entries = hub.snapshot('A').diary;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].body.A, '今天很开心');
  assert.equal(entries[0].body.B, '我也是');
});

test('4.6 周复盘：三问分别记录', () => {
  const { hub } = makeHub();
  hub.submitWeeklyReview('A', '开心事', '困扰事', '下周想要');
  const r = hub.snapshot('A').weeklyReviews[0];
  assert.deepEqual(r.answers.A, { happy: '开心事', trouble: '困扰事', want: '下周想要' });
});

test('4.9 时间轴：按日期排序', () => {
  const { hub } = makeHub();
  hub.addTimelineNode('A', '后来', day(10), '', '🌷');
  hub.addTimelineNode('A', '更早', day(-10), '', '🌱');
  const nodes = hub.snapshot('A').timeline;
  assert.equal(nodes[0].title, '更早');
  assert.equal(nodes[1].title, '后来');
});

// ---------------------------------------------------------------- 模块5
test('5.3 预约观影：双方确认后写入共享日历', () => {
  const { hub } = makeHub();
  const plan = hub.addWatchPlan('A', '春天的故事', day(2), 20 * 60);
  hub.confirmWatchPlan('A', plan.value.id);
  assert.equal(hub.snapshot('A').events.length, 0);
  hub.confirmWatchPlan('B', plan.value.id);
  const events = hub.snapshot('A').events;
  assert.equal(events.length, 1);
  assert.equal(events[0].category, 'movie');
});

test('5.2 一起选片：只匹配双方都 like 的', () => {
  const { hub } = makeHub();
  hub.startPickSession('A', ['片A', '片B', '片C']);
  hub.pickMovie('A', '片A', 'like');
  hub.pickMovie('A', '片B', 'like');
  hub.pickMovie('B', '片A', 'like');
  hub.pickMovie('B', '片B', 'nope');
  assert.deepEqual(hub.pickMatches(), ['片A']);
  assert.equal(hub.pickMovie('B', '片X', 'like').ok, false);
});

test('5.9 虚拟影院：场景开关同步', () => {
  const { hub } = makeHub();
  const room = hub.createRoom('A', 'x');
  hub.toggleScene('A', 'blanket');
  assert.equal(hub.snapshot('B').activeRoom.scene.blanket, true);
  void room;
});

test('5.8 语音：邀请→同意→静音→结束；拒绝与 60 秒超时', () => {
  const { hub, clock } = makeHub();
  hub.createRoom('A', 'x');
  hub.startVoiceInvite('A');
  assert.equal(hub.snapshot('B').voice.status, 'inviting');
  hub.acceptVoiceInvite('B');
  assert.equal(hub.snapshot('A').voice.status, 'connected');
  hub.setVoiceMuted('A', true);
  assert.equal(hub.snapshot('A').voice.muted.A, true);
  hub.setVoiceVolume('A', 40);
  assert.equal(hub.snapshot('B').voice.volume.A, 40);
  hub.endVoice('A');
  assert.equal(hub.snapshot('A').voice.status, 'ended');

  // 拒绝
  hub.startVoiceInvite('A');
  hub.declineVoiceInvite('B');
  assert.equal(hub.snapshot('A').voice.status, 'declined');

  // 60 秒超时
  hub.startVoiceInvite('A');
  clock.t += 61000;
  hub.tick();
  assert.equal(hub.snapshot('A').voice.status, 'declined');

  // 弱网切文字
  hub.startVoiceInvite('B');
  hub.acceptVoiceInvite('A');
  hub.switchToTextOnly('A');
  assert.equal(hub.snapshot('A').voice.textOnly, true);
});

test('5.10 回忆卡：最多 3 张手动截图', () => {
  const { hub } = makeHub();
  hub.createRoom('A', 'x');
  hub.endRoom('A');
  assert.equal(hub.addRecapScreenshot('A', 'f1').ok, true);
  assert.equal(hub.addRecapScreenshot('A', 'f2').ok, true);
  assert.equal(hub.addRecapScreenshot('A', 'f3').ok, true);
  assert.equal(hub.addRecapScreenshot('A', 'f4').ok, false);
});

// ---------------------------------------------------------------- 模块7
test('7.1 关系档案：双方提交后才能确认', () => {
  const { hub } = makeHub();
  hub.saveRelProfile('A', { meetMethod: '朋友介绍', firstDate: day(-100), stage: 'dating', milestones: [] });
  assert.equal(hub.confirmRelProfile('A').ok, false);
  hub.saveRelProfile('B', { meetMethod: '朋友介绍', firstDate: day(-100), stage: 'dating', milestones: [] });
  assert.equal(hub.confirmRelProfile('A').ok, true);
  assert.equal(hub.snapshot('A').relProfile.confirmedBy.length, 1);
});

test('7.3 价值观卡：未揭示前对方看不到我的草稿', () => {
  const { hub } = makeHub();
  hub.saveValuesDraft('A', 'money', '希望共同账户');
  const partnerView = hub.snapshot('B').valuesCard;
  assert.equal(partnerView.drafts.A, undefined, '伴侣拿不到我的草稿');
  assert.equal(JSON.stringify(partnerView).includes('希望共同账户'), false);
  assert.equal(hub.revealValues('A').ok, false, '双方没写完不能揭示');
  hub.saveValuesDraft('B', 'money', 'AA 就好');
  assert.equal(hub.revealValues('A').ok, true);
  assert.equal(hub.snapshot('B').valuesCard.drafts.A.money, '希望共同账户');
});

test('7.4 共同目标：双方确认后转为 confirmed', () => {
  const { hub } = makeHub();
  const item = hub.addPlanItem('A', { title: '搬到同城', targetDate: day(300), owners: ['A', 'B'], notes: '' });
  hub.confirmPlanItem('A', item.value.id);
  assert.equal(hub.snapshot('A').plans[0].stage, 'discuss');
  hub.confirmPlanItem('B', item.value.id);
  assert.equal(hub.snapshot('A').plans[0].stage, 'confirmed');
});

test('7.5 边界契约：各自表态，可要求再谈', () => {
  const { hub } = makeHub();
  const b = hub.addBoundary('A', 'privacy', '不翻手机');
  hub.setBoundaryAgreement('A', b.value.id, 'agree');
  hub.setBoundaryAgreement('B', b.value.id, 'change');
  const item = hub.snapshot('A').boundaries[0];
  assert.equal(item.agreements.A, 'agree');
  assert.equal(item.agreements.B, 'change');
});

test('7.6 冲突修复：流程推进 + 冷静卡联动 + 收尾条件', () => {
  const { hub } = makeHub();
  const c = hub.startConflict('A', '周末安排没商量');
  hub.setConflictField('A', c.value.id, 'feelings', '被忽略');
  hub.markConflictCalm('B', c.value.id);
  assert.equal(hub.snapshot('A').cards.some((x) => x.kind === 'calm'), true);
  assert.equal(hub.resolveConflict('A', c.value.id, '买奶茶').ok, false, '双方感受未写不能收尾');
  hub.setConflictField('B', c.value.id, 'feelings', '被指责');
  hub.setConflictField('A', c.value.id, 'needs', '提前一天确认');
  assert.equal(hub.resolveConflict('A', c.value.id, '买奶茶').ok, true);
  const done = hub.snapshot('A').conflicts[0];
  assert.equal(done.resolvedAt !== null, true);
  assert.equal(done.ritual, '买奶茶');
});

test('7.7 关系自评：只有自己能拿到，伴侣侧永远是 null', () => {
  const { hub } = makeHub();
  hub.saveSelfAssess('A', { satisfaction: 4, security: 3, communication: 5, fairness: 2 });
  const mine = hub.snapshot('A').mySelfAssess;
  assert.equal(mine.satisfaction, 4);
  assert.equal(hub.snapshot('B').mySelfAssess, null);
  assert.equal(JSON.stringify(hub.snapshot('B')).includes('"satisfaction":4'), false);
  hub.saveSelfAssess('A', { satisfaction: 5, security: 4, communication: 4, fairness: 3 });
  assert.equal(hub.snapshot('A').mySelfAssess.history.length, 1, '保留历史趋势');
});

test('7.8 共同投票：双方各一票，可改票', () => {
  const { hub } = makeHub();
  const v = hub.createVote('A', '周末去哪', ['爬山', '看电影'], false, null);
  hub.castVote('A', v.value.id, 'o1');
  hub.castVote('B', v.value.id, 'o2');
  let vote = hub.snapshot('A').votes[0];
  assert.equal(vote.votes.A, 'o1');
  assert.equal(vote.votes.B, 'o2');
  hub.castVote('B', v.value.id, 'o1');
  vote = hub.snapshot('A').votes[0];
  assert.equal(vote.votes.B, 'o1');
  assert.equal(hub.createVote('A', 'x', ['只有一个'], false, null).ok, false);
});

test('7.10 异地模式：倒计时数据与清单', () => {
  const { hub } = makeHub();
  hub.setLdr('A', { enabled: true, nextMeetDate: day(14), ticket: 'G1234', budgetCents: 50000 });
  hub.setLdr('B', { checklist: ['带礼物'] });
  const ldr = hub.snapshot('A').ldr;
  assert.equal(ldr.nextMeetDate, day(14));
  assert.deepEqual(ldr.checklist, ['带礼物']);
});

test('7.14 信任与安全：单次位置共享到期自动失效，不落轨迹', () => {
  const { hub, clock } = makeHub();
  hub.requestArrived('A');
  assert.equal(hub.snapshot('B').safety[0].kind, 'arrived');
  hub.startLocationOnce('A', 30, '在路上');
  assert.equal(hub.snapshot('B').trust.locationShareUntil !== null, true);
  clock.t += 31 * 60 * 1000;
  hub.tick();
  assert.equal(hub.snapshot('A').trust.locationShareUntil, null, '到期自动失效');
  const kinds = hub.snapshot('A').safety.map((s) => s.kind);
  assert.equal(kinds.includes('location-once'), false, '到期后不再下发位置事件');
});

test('7.16 社交报备：默认关闭，需先开启；可撤回', () => {
  const { hub } = makeHub();
  assert.equal(hub.addSocialReport('A', '同事聚餐', '3 人', '22:00').ok, false, '未开启不允许报备');
  hub.setTrust('A', { arrivedReport: true });
  const r = hub.addSocialReport('A', '同事聚餐', '3 人', '22:00');
  assert.equal(r.ok, true);
  hub.withdrawSocialReport('A', r.value.id);
  assert.equal(hub.snapshot('B').socialReports[0].withdrawn, true);
  assert.equal(hub.withdrawSocialReport('B', r.value.id).ok, false);
});

test('7.15 亲密边界卡：默认仅本人可见，逐条共享', () => {
  const { hub } = makeHub();
  const card = hub.addIntimacyCard('A', '边界', '需要先沟通');
  assert.equal(hub.snapshot('A').intimacy.length, 1);
  assert.equal(hub.snapshot('B').intimacy.length, 0);
  assert.equal(JSON.stringify(hub.snapshot('B')).includes('需要先沟通'), false);
  hub.shareIntimacyCard('A', card.value.id, true);
  assert.equal(hub.snapshot('B').intimacy.length, 1);
  hub.shareIntimacyCard('A', card.value.id, false);
  assert.equal(hub.snapshot('B').intimacy.length, 0);
});

test('7.17 保险箱：未授权看不到内容，查看留痕，可撤回', () => {
  const { hub } = makeHub();
  const item = hub.addVaultItem('A', 'Netflix', 'user/pass');
  const partnerView = hub.snapshot('B').vault;
  assert.equal(partnerView.length, 0, '未授权时连条目都不出现');
  assert.equal(hub.openVaultItem('B', item.value.id).ok, false);
  hub.grantVaultAccess('A', item.value.id, 'B');
  const grantedView = hub.snapshot('B').vault;
  assert.equal(grantedView.length, 1);
  assert.equal(grantedView[0].canOpen, true);
  assert.equal('secret' in grantedView[0], false, '列表里永远不带密文');
  const opened = hub.openVaultItem('B', item.value.id);
  assert.equal(opened.ok, true);
  assert.equal(opened.value, 'user/pass');
  assert.equal(hub.snapshot('A').vault[0].views.length, 1, '查看留痕');
  hub.revokeVaultAccess('A', item.value.id, 'B');
  assert.equal(hub.snapshot('B').vault.length, 0);
});

test('7.20 求婚/婚礼计划：默认仅自己可见，可主动共享', () => {
  const { hub } = makeHub();
  hub.updateWedding('B', { budgetCents: 200000, styles: ['小型'], guests: ['朋友'], dates: [day(200)] });
  assert.equal(hub.snapshot('B').wedding !== null, true);
  assert.equal(hub.snapshot('A').wedding, null, '默认对伴侣隐藏（防剧透）');
  hub.shareWedding('B', true);
  assert.equal(hub.snapshot('A').wedding.budgetCents, 200000);
});

test('7.13 年报：从真实数据聚合，不是写死的', () => {
  const { hub } = makeHub();
  hub.createRoom('A', '片一');
  hub.endRoom('A');
  hub.rateMovie('A', 5);
  hub.collectionAdd('A', 'trip', { title: '旅行' });
  const annual = hub.snapshot('A').annual;
  assert.equal(annual.moviesCount, 1);
  assert.equal(annual.tripsCount, 1);
  assert.equal(annual.mostMovedTitle, '片一');
});

test('7.18 成就：达成条件才解锁，且没有排行榜字段', () => {
  const { hub } = makeHub();
  hub.createRoom('A', '片一');
  hub.endRoom('A');
  hub.tick();
  const ach = hub.snapshot('A').achievements;
  assert.ok(ach.some((a) => a.id === 'first-movie'));
  assert.equal('rank' in ach[0], false);
});

test('偏好：解绑删除会清空新增域的数据', () => {
  const { hub } = makeHub();
  hub.addHabit('A', '喝水');
  hub.addLedger('A', {
    title: 'x',
    amountCents: 100,
    payerRole: 'A',
    split: 'equal',
    category: 'other',
    date: day(0),
  });
  hub.addVaultItem('A', 'k', 'v');
  hub.requestUnbind('A', 'delete');
  hub.fastForwardCooling();
  hub.confirmUnbind('A');
  hub.confirmUnbind('B');
  const snap = hub.snapshot('A');
  assert.equal(snap.habits.length, 0);
  assert.equal(snap.ledger.length, 0);
  assert.equal(snap.vault.length, 0);
  assert.equal(snap.boundAt, null);
});

// ---------------------------------------------------------------- 5.8 空间级语音（首页可发起）
test('5.8 语音：没有观影房间也能从首页发起 → 同意 → 静音 → 挂断', () => {
  const { hub } = makeHub();
  assert.equal(hub.snapshot('A').activeRoom, null, '前置条件：没有房间');
  assert.equal(hub.startVoiceInvite('A').ok, true);
  assert.equal(hub.snapshot('B').voice.status, 'inviting');
  assert.equal(hub.snapshot('B').activeRoom, null, '仍然没有房间');
  assert.equal(hub.acceptVoiceInvite('B').ok, true);
  assert.equal(hub.snapshot('A').voice.status, 'connected');
  hub.setVoiceMuted('B', true);
  assert.equal(hub.snapshot('A').voice.muted.B, true);
  hub.setVoiceSpeaker('A', true);
  assert.equal(hub.snapshot('B').voice.speaker.A, true);
  hub.setVoiceVolume('A', 30);
  assert.equal(hub.snapshot('B').voice.volume.A, 30);
  assert.equal(hub.endVoice('A').ok, true);
  assert.equal(hub.snapshot('B').voice.status, 'ended');
});

test('5.8 语音：不能自己接自己的邀请；60 秒未响应自动失效（无房间也生效）', () => {
  const { hub, clock } = makeHub();
  hub.startVoiceInvite('A');
  assert.equal(hub.acceptVoiceInvite('A').ok, false);
  clock.t += 61_000;
  hub.tick();
  assert.equal(hub.snapshot('A').voice.status, 'declined');
});

test('5.8 语音：频道名由 spaceId 派生，两端一致（不依赖房间）', () => {
  const { hub } = makeHub();
  const chA = hub.snapshot('A').voiceChannel;
  const chB = hub.snapshot('B').voiceChannel;
  assert.equal(chA, chB);
  assert.match(chA, /^twospace_[a-zA-Z0-9]{1,16}$/);
});

test('5.8 语音：房间解散不会掐断空间级通话', () => {
  const { hub, clock } = makeHub();
  const room = hub.createRoom('A', 'x');
  hub.joinRoomByCode('B', room.value.code);
  hub.setReady('A');
  hub.setReady('B');
  clock.t += 4000;
  hub.tick();
  hub.startVoiceInvite('A');
  hub.acceptVoiceInvite('B');
  hub.cancelRoom('A');
  assert.equal(hub.snapshot('A').activeRoom, null);
  assert.equal(hub.snapshot('A').voice.status, 'connected', '通话应继续');
});

test('5.8 语音：未绑定时不允许发起', () => {
  const clock = { t: T0 };
  const hub = new Hub({ now: () => clock.t, latencyMs: 120, scale: 1, clockSkew: { A: 0, B: 700 } });
  assert.equal(hub.startVoiceInvite('A').ok, false);
});