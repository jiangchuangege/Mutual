import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Assignee } from '../core/types';
import { useApp } from '../store';
import { Btn, Card, Chip, EmptyState, Field, NoticeBar, Screen, Sheet, useConfirm } from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, radius, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

export default function ChoresScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const confirm = useConfirm();
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<Assignee>('either');
  const [rotate, setRotate] = useState(false);

  const chores = snapshot.chores;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title="家务分工" subtitle="谁洗碗谁倒垃圾，写下来就不用吵" right={<DevicePills />}>
        <Btn title="＋ 新增家务" onPress={() => setOpen(true)} />

        <NoticeBar
          tone={tint(color.mintSoft)}
          ink={color.ok}
          icon="✓"
          text="只记录完成状态，不做排名、不比谁做得多、没有惩罚。轮换到谁就是谁。"
        />

        {chores.length === 0 ? (
          <EmptyState
            emoji="🧹"
            title="还没有分工"
            desc="先把最常吵的那两件事写下来。"
            actionLabel="新增第一条"
            onAction={() => setOpen(true)}
          />
        ) : (
          chores.map((chore) => {
            const current = snapshot.chores.length > 0 ? currentAssignee(chore) : chore.assignee;
            const week = weekKeyNow();
            const done = chore.doneWeekKeys.includes(week);
            const who = current === 'either' ? '谁做都行' : current === role ? '我' : snapshot.members[current].name;
            return (
              <Card key={chore.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    onPress={() => (done ? store.uncompleteChore(chore.id) : store.completeChore(chore.id))}
                    style={[styles.checkbox, done ? styles.checkboxDone : null]}
                  >
                    {done ? <Text style={{ color: '#FFF', fontSize: 11 }}>✓</Text> : null}
                  </Pressable>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text
                      style={[
                        font.bodyStrong,
                        done ? { textDecorationLine: 'line-through', color: color.inkFaint } : null,
                      ]}
                    >
                      {chore.title}
                    </Text>
                    <Text style={[font.small, { marginTop: 2 }]}>
                      本周：{who}
                      {chore.rotation.length > 1 ? ` · 轮换（${chore.rotation.map((r) => (r === 'either' ? '都行' : r === role ? '我' : snapshot.members[r].name)).join(' → ')}）` : ''}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={10}
                    onPress={() =>
                      void confirm({
                        title: `删除「${chore.title}」？`,
                        message: '删除后两个人都会看不到这条家务，完成记录里也不会再显示它。',
                        icon: '🧹',
                        confirmText: '删除',
                        danger: true,
                      }).then((ok) => {
                        if (ok) store.deleteChore(chore.id);
                      })
                    }
                  >
                    <Text style={[font.tiny, { color: color.danger }]}>删除</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn title="我来做" small variant="ghost" style={{ flex: 1 }} onPress={() => store.claimChore(chore.id)} />
                  <Btn
                    title={done ? '撤销完成' : '标记完成'}
                    small
                    variant={done ? 'ghost' : 'soft'}
                    style={{ flex: 1 }}
                    onPress={() => (done ? store.uncompleteChore(chore.id) : store.completeChore(chore.id))}
                  />
                </View>
              </Card>
            );
          })
        )}

        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>

      <Sheet visible={open} title="新增家务" onClose={() => setOpen(false)}>
        <Field label="做什么" value={title} onChangeText={setTitle} placeholder="洗碗 / 倒垃圾 / 拖地" />
        <Text style={[font.tiny, { marginBottom: 6 }]}>默认谁做</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          <Chip label="谁做都行" active={assignee === 'either'} onPress={() => setAssignee('either')} />
          <Chip label="我" active={assignee === role} onPress={() => setAssignee(role)} />
          <Chip label={snapshot.members[partner].name} active={assignee === partner} onPress={() => setAssignee(partner)} />
        </View>
        <Text style={[font.tiny, { marginBottom: 6 }]}>是否每周轮换</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          <Chip label="不轮换" active={!rotate} onPress={() => setRotate(false)} />
          <Chip label="每周在我和 TA 之间轮换" active={rotate} onPress={() => setRotate(true)} />
        </View>
        <Btn
          title="加入家务表"
          onPress={() => {
            const rotation: Assignee[] = rotate ? [role, partner] : [assignee];
            if (store.addChore(title, assignee, rotation)) {
              setTitle('');
              setOpen(false);
            }
          }}
        />
      </Sheet>
    </View>
  );
}

function currentAssignee(chore: { assignee: Assignee; rotation: Assignee[]; rotationIndex: number }): Assignee {
  if (chore.rotation.length === 0) return chore.assignee;
  return chore.rotation[chore.rotationIndex % chore.rotation.length];
}

function weekKeyNow(): string {
  const d = new Date();
  const first = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - first.getTime()) / 86400000);
  const week = Math.ceil((days + first.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${`${week}`.padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surf('base'),
  },
  checkboxDone: { backgroundColor: color.ok, borderColor: color.ok },
});
