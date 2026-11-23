import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { todayISO } from '../core/time';
import { useApp } from '../store';
import { Btn, Card, EmptyState, Field, NoticeBar, ProgressBar, Screen, SectionTitle, Sheet } from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

export default function HabitsScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const today = todayISO();
  const [habitOpen, setHabitOpen] = useState(false);
  const [habitTitle, setHabitTitle] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [contributeOpen, setContributeOpen] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');

  const totalCheckins = snapshot.habits.reduce((sum, h) => sum + h.checkins.filter((d) => d === today).length, 0);

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title="习惯与目标" subtitle="一起变好，但不互相施压" right={<DevicePills />}>
        <NoticeBar
          tone={tint(color.mintSoft)}
          ink={color.ok}
          icon="🌱"
          text="断签不清零、不扣分、不发红点。打卡只是记录，鼓励来自对方而不是系统。"
        />

        <SectionTitle title={`今天我们一起完成 ${totalCheckins} 项`} />
        {snapshot.habits.length === 0 ? (
          <EmptyState
            emoji="🌱"
            title="还没有习惯"
            desc="先定一件小事，比如每天喝水。"
            actionLabel="添加习惯"
            onAction={() => setHabitOpen(true)}
          />
        ) : (
          snapshot.habits.map((habit) => {
            const mine = habit.createdBy === role;
            const doneToday = habit.checkins.includes(today);
            return (
              <Card key={habit.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    onPress={() => {
                      if (!mine) {
                        store.toast('这是 TA 的习惯，你只能给 TA 打气', 'warn');
                        return;
                      }
                      store.toggleHabit(habit.id, today);
                    }}
                    style={[styles.checkbox, doneToday ? styles.checkboxDone : null]}
                  >
                    {doneToday ? <Text style={{ color: '#FFF', fontSize: 11 }}>✓</Text> : null}
                  </Pressable>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={font.bodyStrong}>{habit.title}</Text>
                    <Text style={[font.small, { marginTop: 2 }]}>
                      {mine ? '我的习惯' : `${snapshot.members[habit.createdBy].name} 的习惯`} · 累计打卡{' '}
                      {habit.checkins.length} 天
                    </Text>
                  </View>
                  {!mine ? (
                    <Btn title="打气" small variant="ghost" onPress={() => store.cheerHabit(habit.id)} />
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
        <Btn title="＋ 添加习惯" variant="ghost" onPress={() => setHabitOpen(true)} />

        <SectionTitle title="共同目标" right={<Text style={font.tiny}>{snapshot.goals.length} 个</Text>} />
        {snapshot.goals.length === 0 ? (
          <EmptyState
            emoji="🎯"
            title="还没有共同目标"
            desc="存钱、旅行基金、学习计划都算。"
            actionLabel="设一个目标"
            onAction={() => setGoalOpen(true)}
          />
        ) : (
          snapshot.goals.map((goal) => {
            const ratio = goal.targetCents ? goal.savedCents / goal.targetCents : 0;
            return (
              <Card key={goal.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={font.bodyStrong}>{goal.title}</Text>
                  {goal.done ? <Text style={[font.tiny, { color: color.ok, marginLeft: 8 }]}>已达成</Text> : null}
                </View>
                <Text style={[font.small, { marginTop: 4 }]}>
                  ¥{(goal.savedCents / 100).toFixed(0)}
                  {goal.targetCents ? ` / ¥${(goal.targetCents / 100).toFixed(0)}` : ''} · 共{' '}
                  {goal.contributions.length} 次存入
                </Text>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={ratio} tone={goal.done ? color.ok : color.primary} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Btn title="存入一笔" small style={{ flex: 1 }} onPress={() => setContributeOpen(goal.id)} />
                  <Btn
                    title={goal.done ? '标记未完成' : '标记达成'}
                    small
                    variant="ghost"
                    style={{ flex: 1 }}
                    onPress={() => store.completeGoal(goal.id)}
                  />
                </View>
              </Card>
            );
          })
        )}
        <Btn title="＋ 设一个共同目标" variant="ghost" onPress={() => setGoalOpen(true)} />

        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>

      <Sheet visible={habitOpen} title="添加习惯" onClose={() => setHabitOpen(false)}>
        <Field label="习惯" value={habitTitle} onChangeText={setHabitTitle} placeholder="每天喝水 1.5L / 睡前拉伸" />
        <Btn
          title="添加"
          onPress={() => {
            if (store.addHabit(habitTitle)) {
              setHabitTitle('');
              setHabitOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={goalOpen} title="设一个共同目标" onClose={() => setGoalOpen(false)}>
        <Field label="目标" value={goalTitle} onChangeText={setGoalTitle} placeholder="旅行基金 6000 元" />
        <Field
          label="目标金额（元，可不填）"
          value={goalTarget}
          onChangeText={setGoalTarget}
          placeholder="6000"
          keyboardType="numeric"
        />
        <Btn
          title="创建"
          onPress={() => {
            const cents = goalTarget.trim() ? Math.round(Number(goalTarget) * 100) : null;
            if (store.addGoal(goalTitle, cents, null)) {
              setGoalTitle('');
              setGoalTarget('');
              setGoalOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={contributeOpen !== null} title="存入一笔" onClose={() => setContributeOpen(null)}>
        <Field
          label="金额（元）"
          value={contributeAmount}
          onChangeText={setContributeAmount}
          placeholder="500"
          keyboardType="numeric"
        />
        <Btn
          title="存入"
          onPress={() => {
            const cents = Math.round(Number(contributeAmount) * 100);
            if (contributeOpen && store.contributeGoal(contributeOpen, cents)) {
              setContributeAmount('');
              setContributeOpen(null);
            }
          }}
        />
      </Sheet>
    </View>
  );
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
