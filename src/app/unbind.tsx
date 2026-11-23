import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store';
import { DEMO_TOOLS } from '../core/buildFlags';
import type { DataChoice } from '../core/types';
import { Btn, Card, Chip, KeyValue, NoticeBar, Screen, SectionTitle, useConfirm } from '../ui/components';
import { color, font, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

function formatCooling(ms: number): string {
  const total = Math.max(0, ms);
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const mins = Math.floor((total % 3_600_000) / 60_000);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${mins} 分钟`;
  return `${mins} 分钟`;
}

export default function UnbindScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const confirm = useConfirm();
  const partner = role === 'A' ? 'B' : 'A';
  const [choice, setChoice] = useState<DataChoice>('export');
  const unbind = snapshot.unbind;
  const bound = snapshot.boundAt !== null;

  if (!bound) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
        <Screen back
          title="双人空间已结束"
          subtitle="数据已按双方选择处置"
          right={<Btn title="返回" small variant="ghost" onPress={() => router.replace('/')} />}
        >
          <Card>
            <Text style={font.h3}>你们已经解绑</Text>
            <Text style={[font.small, { marginTop: 6 }]}>
              共享数据按"从严优先"处理：任一方选择删除，共享域即物理删除。
              私密数据（如经期记录）跟随本人选择。
            </Text>
          </Card>
          <Btn title="回到首页" onPress={() => router.replace('/')} />
          <View style={{ height: 40 }} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="解绑与数据删除"
        subtitle="敢让你干净地走，才敢让你放心地进来"
        right={<Btn title="返回" small variant="ghost" onPress={() => router.back()} />}
      >
        {!unbind || unbind.status === 'cancelled' ? (
          <>
            <NoticeBar
              tone={tint(color.dangerSoft)}
              ink={color.danger}
              icon="⚠️"
              text="解绑是双向的：冷静期结束后，你们互相看不到任何数据。解绑原因不会展示给对方。"
            />

            <SectionTitle title="我的数据怎么办" />
            <Card>
              <Btn
                title={choice === 'export' ? '✅ 保留我的数据副本' : '保留我的数据副本'}
                variant={choice === 'export' ? 'primary' : 'ghost'}
                onPress={() => setChoice('export')}
              />
              <View style={{ height: 10 }} />
              <Btn
                title={choice === 'delete' ? '✅ 删除我的全部数据' : '删除我的全部数据'}
                variant={choice === 'delete' ? 'danger' : 'ghost'}
                onPress={() => setChoice('delete')}
              />
              <Text style={[font.small, { marginTop: 10 }]}>
                {choice === 'export'
                  ? '保留：解绑后这些数据只属于你，不能再共享给任何人。'
                  : '删除：确认后不可恢复，服务端物理删除，备份最长 7 天内清除。'}
              </Text>
            </Card>

            <SectionTitle title="流程" />
            <Card>
              <KeyValue k="第 1 步" v="发起解绑（进入 7 天冷静期）" />
              <KeyValue k="第 2 步" v="期间任意一方可撤销" />
              <KeyValue k="第 3 步" v="双方各自确认数据处置" />
              <KeyValue k="第 4 步" v="执行删除 / 保留，并给出进度查询" />
            </Card>

            <Btn
              title="发起解绑"
              variant="danger"
              onPress={() =>
                void confirm({
                  title: '确认发起解绑？',
                  message:
                    '进入 7 天冷静期，对方会收到一条中性通知（不含原因）。冷静期内你们仍然能看到彼此，也随时可以撤销。',
                  icon: '🚪',
                  confirmText: '发起解绑',
                  danger: true,
                }).then((ok) => {
                  if (ok) store.requestUnbind(choice);
                })
              }
            />
          </>
        ) : (
          <>
            <NoticeBar
              tone={tint(color.dangerSoft)}
              ink={color.danger}
              icon="⏳"
              text="冷静期中：双方仍可看到彼此数据，直到最终确认执行。"
            />
            <Card>
              <KeyValue k="发起人" v={unbind.byRole === role ? '我' : snapshot.members[unbind.byRole].name} />
              <KeyValue k="剩余冷静期" v={formatCooling(unbind.coolingEndsAt - Date.now())} />
              <KeyValue k="我的数据选择" v={unbind.dataChoice[role] === 'delete' ? '删除' : '保留副本'} />
              <KeyValue
                k={`${snapshot.members[partner].name} 的选择`}
                v={unbind.dataChoice[partner] === 'delete' ? '删除' : '保留副本'}
              />
              <KeyValue k="已确认方" v={unbind.confirmed.length === 0 ? '暂无' : unbind.confirmed.join('、')} />
            </Card>

            <Card tone={surf('alt')}>
              <Text style={[font.small]}>
                执行规则：共享数据从严（任一方选删除即删除）；私密数据（经期等）跟随本人选择。
              </Text>
            </Card>

            {/*
             * 冷静期里必须让**自己**选一次"我的数据怎么办"。
             * 以前这里只显示"保留副本"，那个值是发起方发起时替对方写死的默认，
             * 用户从来没点过；而 hub 的 setUnbindChoice 全仓库没有任何调用方。
             */}
            <Card tone={surf("alt")}>
              <Text style={font.small}>我的数据怎么办（只有你能改）</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Chip
                  label="保留副本"
                  active={unbind.dataChoice[role] !== "delete"}
                  onPress={() => store.setUnbindChoice("export")}
                />
                <Chip
                  label="全部删除"
                  active={unbind.dataChoice[role] === "delete"}
                  onPress={() => store.setUnbindChoice("delete")}
                />
              </View>
            </Card>

            <Btn title="撤销解绑" onPress={() => store.cancelUnbind()} />
            <View style={{ height: 10 }} />
            <Btn
              title="我确认执行解绑"
              variant="danger"
              onPress={() =>
                void confirm({
                  title: '确认执行解绑？',
                  message:
                    '两个人都确认后立即执行：共享数据按从严规则删除，不可回滚。你的私密数据（经期等）按你自己刚才的选择处理。',
                  icon: '⚠️',
                  confirmText: '确认执行',
                  danger: true,
                }).then((ok) => {
                  if (ok) store.confirmUnbind();
                })
              }
            />
            <View style={{ height: 10 }} />
            {DEMO_TOOLS ? (
              <>
                <Btn
                  title="演示：快进到冷静期结束"
                  variant="ghost"
                  small
                  onPress={() => store.fastForwardCooling()}
                />
                <Text style={[font.tiny, { marginTop: 8 }]}>
                  「快进」只存在于演示构建，用来现场验证冷静期结束后的分支；真实产品没有这个入口。
                </Text>
              </>
            ) : (
              <Text style={[font.tiny, { color: color.inkSoft }]}>
                冷静期结束后会自动进入最终确认，不需要任何手动操作；到期前双方都可以随时撤销。
              </Text>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
