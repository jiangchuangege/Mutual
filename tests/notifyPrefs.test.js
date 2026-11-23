/* eslint-disable */
/**
 * 通知偏好：免打扰窗口 / 分类映射 / 该不该弹 / 锁屏文案。
 * 真机 bug 背景：「紧急联系人例外」开关退出页面就复原（因为以前只在 useState 里），
 * 以及锁屏/通知栏根本收不到东西（因为没有系统通知通道）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_NOTIFY_PREFS,
  categoryOfKind,
  inDndWindow,
  isUrgentKind,
  lockText,
  shouldPresent,
} = require('../dist-core/notifyPrefs.js');

function at(hour, minute = 0) {
  const d = new Date(2026, 10, 6, hour, minute, 0);
  return d;
}

test('免打扰窗口：22:00–08:00 跨零点', () => {
  assert.equal(inDndWindow(at(22)), true);
  assert.equal(inDndWindow(at(23, 59)), true);
  assert.equal(inDndWindow(at(0, 30)), true);
  assert.equal(inDndWindow(at(7, 59)), true);
  assert.equal(inDndWindow(at(8)), false);
  assert.equal(inDndWindow(at(12)), false);
  assert.equal(inDndWindow(at(21, 59)), false);
});

test('通知分类映射：动态/卡片算情感，待办算生活，影院算影院，其余系统', () => {
  assert.equal(categoryOfKind('activity:diary'), 'emotion');
  assert.equal(categoryOfKind('card'), 'emotion');
  assert.equal(categoryOfKind('mood'), 'emotion');
  assert.equal(categoryOfKind('todo'), 'life');
  assert.equal(categoryOfKind('ledger'), 'life');
  assert.equal(categoryOfKind('careAction'), 'care');
  assert.equal(categoryOfKind('cinema'), 'cinema');
  assert.equal(categoryOfKind('unbind'), 'system');
  assert.equal(isUrgentKind('calm'), true);
  assert.equal(isUrgentKind('safety'), true);
  assert.equal(isUrgentKind('activity:diary'), false);
});

test('该不该弹：分类关掉就不弹，锁屏设成"不显示"也不弹', () => {
  const prefs = { ...DEFAULT_NOTIFY_PREFS };
  assert.equal(shouldPresent(prefs, 'todo', at(12)).present, true);

  const noLife = { ...prefs, categories: { ...prefs.categories, life: false } };
  assert.deepEqual(shouldPresent(noLife, 'todo', at(12)), { present: false, reason: 'category-off' });

  const silent = { ...prefs, lockMode: 'none' };
  assert.deepEqual(shouldPresent(silent, 'todo', at(12)), { present: false, reason: 'silent-mode' });
});

test('该不该弹：夜间免打扰默认拦住，紧急例外开了才放行', () => {
  const base = { ...DEFAULT_NOTIFY_PREFS };
  // 默认 dnd=true，晚上 23 点：普通通知不弹
  assert.deepEqual(shouldPresent(base, 'todo', at(23)), { present: false, reason: 'dnd' });

  const withException = { ...base, urgentException: true };
  assert.equal(shouldPresent(withException, 'calm', at(23)).present, true, '冷静卡可以穿透');
  assert.equal(shouldPresent(withException, 'safety', at(23)).present, true, '安全报备可以穿透');
  assert.equal(shouldPresent(withException, 'todo', at(23)).present, false, '普通待办仍然不打扰');

  // 白天不受影响
  assert.equal(shouldPresent(base, 'todo', at(12)).present, true);
});

test('锁屏文案：中性模式不暴露内容，详情模式原样', () => {
  const neutral = { ...DEFAULT_NOTIFY_PREFS, lockMode: 'neutral' };
  // App 名字改成了 Mutual：锁屏上的中性文案跟着改，但"不暴露内容"这条不变
  assert.equal(lockText(neutral, 'TA 新增了日记「今天去看海了」'), 'Mutual · TA 那边有新的动静');
  const detail = { ...DEFAULT_NOTIFY_PREFS, lockMode: 'detail' };
  assert.equal(lockText(detail, 'TA 新增了日记「今天去看海了」'), 'TA 新增了日记「今天去看海了」');
});

test('默认值：夜间免打扰开、紧急例外关、中性文案、分类全开', () => {
  assert.equal(DEFAULT_NOTIFY_PREFS.dnd, true);
  assert.equal(DEFAULT_NOTIFY_PREFS.urgentException, false);
  assert.equal(DEFAULT_NOTIFY_PREFS.lockMode, 'neutral');
  assert.deepEqual(DEFAULT_NOTIFY_PREFS.categories, {
    life: true,
    care: true,
    emotion: true,
    cinema: true,
    system: true,
  });
});
