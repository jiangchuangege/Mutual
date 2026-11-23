import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { activeGroupKey, episodeLabel, groupWatchQueue } from '../core/queueView';
import { useApp } from '../store';
import { Btn, Card, useConfirm } from '../ui/components';
import { color, font, radius, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';

/**
 * 一起看队列（房间外也能管理）。
 *
 * 两层结构：
 *  - 第一层是**合集**：一部电视剧只有一个条目，写着"共 30 集"，不会摊成 30 行；
 *  - 点进去是这一部片的所有集，点哪一集就播哪一集。
 * 单集电影就是一个合集里只有一条，直接点就播。
 */
export default function CinemaQueueScreen() {
  const router = useRouter();
  const { store, role, snapshot } = useApp();
  const confirm = useConfirm();
  const insets = useSafeAreaInsets();
  const queue = snapshot.watchQueue;
  const room = snapshot.activeRoom;
  const groups = useMemo(() => groupWatchQueue(queue), [queue]);
  const playingGroup = useMemo(() => activeGroupKey(queue, room?.sourceUrl ?? null), [queue, room?.sourceUrl]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      {/* 顶部要避开状态栏：截图里"返回"和"一起看队列"曾经压在时间上 */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>一起看队列</Text>
        <Text style={styles.count}>
          {groups.length} 部 · {queue.length} 集
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 40 + insets.bottom }}>
        {queue.length === 0 ? (
          <Card>
            <Text style={font.bodyStrong}>队列还是空的</Text>
            <Text style={[font.tiny, { marginTop: 6, lineHeight: 18 }]}>
              去「影院 → 在线片库」挑一部片，详情页底部点「加入一起看队列」或「整部加入队列」。
              电视剧会自成一个合集，之后在这里点哪一集就播哪一集。
            </Text>
            <View style={{ height: 12 }} />
            <Btn title="去在线片库挑片" onPress={() => router.push('/cinema-library')} />
          </Card>
        ) : (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[font.bodyStrong, { flex: 1 }]}>点开一个合集，选一集就能一起看</Text>
                <Btn
                  title="清空"
                  small
                  variant="ghost"
                  onPress={() =>
                    confirm({
                      title: '清空一起看队列？',
                      message: `会移除全部 ${queue.length} 项，双方都看不到了（片子本身不受影响）。`,
                      confirmText: '清空',
                      danger: true,
                    }).then((ok) => {
                      if (ok) store.clearWatchQueue();
                    })
                  }
                />
              </View>
              <Text style={[font.tiny, { marginTop: 4, lineHeight: 18 }]}>
                队列是两个人共用的：谁加的都在这里，谁都能删。电视剧按「合集」折叠，不会一集一行摊满屏。
              </Text>
            </Card>

            <View style={{ height: 12 }} />

            {groups.map((group) => {
              const open = openKey === group.key;
              const isPlaying = playingGroup === group.key;
              const first = group.items[0];
              return (
                <View key={group.key} style={[styles.group, isPlaying ? styles.groupPlaying : null]}>
                  <Pressable
                    style={styles.groupHead}
                    onPress={() => {
                      // 单集（电影）直接播；多集（电视剧）先展开合集
                      if (!group.series) {
                        store.playFromQueue(first.id);
                        return;
                      }
                      setOpenKey(open ? null : group.key);
                    }}
                  >
                    <Text style={styles.groupTitle} numberOfLines={2}>
                      {isPlaying ? '▶ ' : ''}
                      {group.title}
                    </Text>
                    <Text style={styles.groupMeta}>
                      {group.series ? `共 ${group.items.length} 集 · 点开选集` : '单片 · 点一下直接播'}
                      {isPlaying ? ' · 正在播' : ''}
                    </Text>
                  </Pressable>

                  {group.series && open ? (
                    <View style={styles.episodeBox}>
                      {group.items.map((item) => {
                        const playing = room?.sourceUrl === item.url;
                        return (
                          <View key={item.id} style={styles.episodeRow}>
                            <Pressable style={{ flex: 1 }} onPress={() => store.playFromQueue(item.id)}>
                              <Text
                                style={[
                                  font.small,
                                  playing ? { color: color.primaryInk, fontWeight: '700' } : null,
                                ]}
                              >
                                {playing ? '▶ ' : ''}
                                {episodeLabel(item)}
                              </Text>
                              <Text style={font.tiny}>
                                {item.addedBy === role ? '我' : snapshot.members[item.addedBy].name} 加的
                              </Text>
                            </Pressable>
                            <Btn
                              title="移除"
                              small
                              variant="ghost"
                              onPress={() => store.removeWatchQueue(item.id)}
                            />
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  <View style={styles.groupFoot}>
                    {group.series ? (
                      <Btn
                        title={open ? '收起' : `展开 ${group.items.length} 集`}
                        small
                        variant="ghost"
                        onPress={() => setOpenKey(open ? null : group.key)}
                      />
                    ) : (
                      <Btn
                        title="移除"
                        small
                        variant="ghost"
                        onPress={() => store.removeWatchQueue(first.id)}
                      />
                    )}
                  </View>
                </View>
              );
            })}

            <View style={{ height: 14 }} />
            <Btn
              title={room ? '回一起看房间' : '开一个一起看房间'}
              variant="dark"
              onPress={() => {
                if (room) {
                  router.push('/room');
                  return;
                }
                const first = queue[0];
                if (first) store.playFromQueue(first.id);
              }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingTop: 10,
    paddingBottom: 8,
  },
  back: { paddingRight: 10 },
  backText: { fontSize: 14, color: color.inkSoft },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: color.ink },
  count: { fontSize: 12, color: color.inkSoft },
  group: {
    backgroundColor: surf('base'),
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingTop: 12,
    marginBottom: 10,
  },
  groupPlaying: { backgroundColor: color.primarySoft },
  groupHead: { paddingBottom: 8 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
  groupMeta: { fontSize: 12, color: color.inkSoft, marginTop: 3 },
  episodeBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: 8 },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  groupFoot: { alignItems: 'flex-end', paddingVertical: 8 },
});
