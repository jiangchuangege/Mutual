import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store';
import { Btn, Card, EmptyState, NoticeBar, Screen, SectionTitle } from '../ui/components';
import { color, font, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

/** 动作 + 类别 → 一条完整的人话 */
function line(action: string, entityLabel: string, title: string): string {
  const verb =
    action === 'add'
      ? '新增了一个'
      : action === 'delete'
        ? '删除了一个'
        : action === 'done'
          ? '完成了一个'
          : '修改了一个';
  const tail = title ? `「${title}」` : '';
  return `${verb}${entityLabel}${tail}`;
}

function clock(at: number): string {
  const d = new Date(at);
  const now = Date.now();
  const diff = now - at;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { store } = useApp();
  const feed = store.partnerActivity;

  // 打开就算看过了：小红点清掉，但历史记录留着
  useEffect(() => {
    store.markActivityRead();
    // 只在进入页面时清一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="TA 的动态"
        subtitle="对方在软件里新增、修改、删除了什么，这里都有记录"
        right={<Btn title="返回" small variant="ghost" onPress={() => router.back()} />}
      >
        {feed.length === 0 ? (
          <EmptyState
            emoji="🫧"
            title="还没有动态"
            desc="TA 在软件里加一条日记、一个安排、一笔账……这里就会冒出来一条。"
          />
        ) : (
          <>
            <NoticeBar
              tone={tint(color.lavenderSoft)}
              ink={color.inkMid}
              icon="🔔"
              text="有新增或删除时，手机上会直接弹一条提示框，不会静音错过。"
            />
            <SectionTitle title={`最近 ${feed.length} 条`} />
            <Card>
              {feed.map((item, index) => (
                <View
                  key={item.id}
                  style={[styles.row, index === feed.length - 1 ? styles.rowLast : null]}
                >
                  <Text style={styles.emoji}>
                    {item.action === 'add'
                      ? '➕'
                      : item.action === 'delete'
                        ? '🗑️'
                        : item.action === 'done'
                          ? '✅'
                          : '✏️'}
                  </Text>
                  <View style={styles.rowText}>
                    <Text style={font.body}>{line(item.action, item.entityLabel, item.title)}</Text>
                    <Text style={[font.tiny, { marginTop: 2 }]}>{clock(item.at)}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        <Card tone={surf('alt')}>
          <Text style={font.small}>
            只记录"做了什么"，不记录具体内容：私密条目、保险箱、照顾清单的原文都不会出现在这里，
            也不会出现在提示框里。
          </Text>
        </Card>
        <View style={{ height: 40 }} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  rowLast: { borderBottomWidth: 0 },
  emoji: { fontSize: 16, width: 26 },
  rowText: { flex: 1 },
});
