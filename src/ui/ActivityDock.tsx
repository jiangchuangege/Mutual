import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { activityToToast } from '../core/activityFeed';
import { useApp } from '../store';
import { font, radius, shadow } from './theme';
import { color } from './theme';

/**
 * 「TA 刚做了什么」的全局提示框。
 *
 * 需求：只要对方在软件里新增/删除了任何东西，我这边都要有提醒。
 * 光靠 Toast 不够——它 2.4 秒就没了，人一低头就错过。所以这里再挂一个
 * **需要点一下才消失**的提示框（和通话悬浮窗同一层，任何页面都看得到）：
 *   - 显示「TA 新增了日记「今天……」」
 *   - 点「看看」→ 打开动态页；点「知道了」→ 收起并标记已读
 *
 * 数据来自快照里的 `activity`，store 已经把"提醒过没有"记在本地了，
 * 所以重连、重开 App 都不会重复弹。
 *
 * ── 2026-11 修复（用户反馈："点了几次「知道了」它还在弹"）──
 * 三处都是"点了没反应 / 点了还在"的直接原因，一起改掉：
 *   1. 「知道了」以前是**嵌在外层 Pressable 里面的小按钮**，而且在屏幕右下角，
 *      正好被音乐播放的悬浮气泡（zIndex 999）压住一半 → 点偏一点就落到外层卡片上，
 *      于是跳去动态页，回来时提示框**原封不动**又出现（看起来就是"点了没关掉"）。
 *      现在两个动作各自是独立按钮、平铺在卡片下半行，卡片右边缘也不再伸进气泡的地盘。
 *   2. 外层卡片"点这里看看"以前只调用 markActivityRead()，**没有把提示框本身收起来**；
 *      从动态页返回后 activityNotice 还在，于是原地复活。现在点卡片也会收起。
 *   3. 人已经进了动态页（/activity）就说明"看到了"，这里顺手把提示框收掉，
 *      返回首页不会再莫名其妙弹出来一次。
 */
export function ActivityDock() {
  const { store } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const pending = store.pendingActivityNotice;
  const onActivityPage = pathname === '/activity';

  // 已经在动态页里看了 = 已读：进页面这一下就把提示框收掉，返回时不再出现
  React.useEffect(() => {
    if (onActivityPage && store.pendingActivityNotice) store.dismissActivityNotice();
  }, [onActivityPage, store]);

  if (!pending || onActivityPage) return null;

  const text = activityToToast(pending);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: insets.bottom + 78 }]}
    >
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={styles.emoji}>📣</Text>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {text}
            </Text>
            <Text style={styles.hint}>TA 刚在软件里动了一下</Text>
          </View>
        </View>
        <View style={styles.rowBtns}>
          <Pressable
            hitSlop={8}
            onPress={() => {
              store.dismissActivityNotice();
              router.push('/activity');
            }}
            style={[styles.btn, styles.btnGhost]}
          >
            <Text style={styles.btnGhostText}>看看</Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => store.dismissActivityNotice()}
            style={[styles.btn, styles.btnSolid]}
          >
            <Text style={styles.btnSolidText}>知道了</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 摆在底部（导航栏之上），不遮页面标题
  host: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    alignItems: 'center',
    // 必须高于音乐悬浮气泡（zIndex 999）和通话悬浮窗，否则点不到「知道了」
    zIndex: 1200,
    elevation: 24,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#FFFDFB',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.primarySoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...shadow.float,
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start' },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: color.primarySoft },
  btnSolid: { backgroundColor: color.primary },
  btnGhostText: { fontSize: 12, fontWeight: '700', color: color.primaryInk },
  btnSolidText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  emoji: { fontSize: 18, marginRight: 8, lineHeight: 22 },
  body: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: color.ink, lineHeight: 18 },
  hint: { fontSize: 10, color: color.inkMid, marginTop: 2 },
  text: { ...font.tiny },
});
