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
 */
export function ActivityDock() {
  const { store } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const pending = store.pendingActivityNotice;
  // 已经在动态页里看了，就不用再挂一个提示框
  if (!pending || pathname === '/activity') return null;

  const text = activityToToast(pending);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: insets.bottom + 78 }]}
    >
      <Pressable
        style={styles.card}
        onPress={() => {
          store.markActivityRead();
          router.push('/activity');
        }}
      >
        <Text style={styles.emoji}>📣</Text>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {text}
          </Text>
          <Text style={styles.hint}>点这里看看 · 收起请点右边</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => store.dismissActivityNotice()}
          style={styles.close}
        >
          <Text style={styles.closeText}>知道了</Text>
        </Pressable>
      </Pressable>
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
    zIndex: 60,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  emoji: { fontSize: 18, marginRight: 8, lineHeight: 22 },
  body: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: color.ink, lineHeight: 18 },
  hint: { fontSize: 10, color: color.inkMid, marginTop: 2 },
  close: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: color.primarySoft,
  },
  closeText: { fontSize: 11, fontWeight: '700', color: color.primaryInk },
  text: { ...font.tiny },
});
