import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { clockToMin, minToClock, todayISO } from '../core/time';
import { useApp } from '../store';
import {
  Btn,
  Card,
  EmptyState,
  Field,
  NoticeBar,
  Screen,
  SectionTitle,
  Sheet,
} from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { tint } from '../ui/theme';

export default function CinemaPlanScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';

  const [pickOpen, setPickOpen] = useState(false);
  const [candidates, setCandidates] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const [movieTitle, setMovieTitle] = useState('');
  const [planDate, setPlanDate] = useState(todayISO());
  const [planClock, setPlanClock] = useState('20:00');

  const session = snapshot.pickSession;
  const matches = store.hub.pickMatches();

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title="选片与预约" subtitle="先决定看什么，再约好时间" right={<DevicePills />}>
        {/* -------- 5.2 一起选片 -------- */}
        <SectionTitle
          title="一起选片"
          right={
            session ? (
              <Btn title="重开一局" small variant="ghost" onPress={() => store.clearPickSession()} />
            ) : (
              <Btn title="＋ 发起" small variant="ghost" onPress={() => setPickOpen(true)} />
            )
          }
        />
        <NoticeBar
          tone={tint(color.skySoft)}
          ink={color.inkMid}
          icon="🎯"
          text="双方各自滑完，才揭晓「共同想看」。一方没滑完时，你看不到结果。"
        />

        {!session ? (
          <EmptyState
            emoji="🎲"
            title="还没有进行中的选片"
            desc="把候选片名列进来，双方各自选喜欢/不想看。"
            actionLabel="发起选片"
            onAction={() => setPickOpen(true)}
          />
        ) : (
          <>
            {session.candidates.map((c) => {
              const mine = session.picks[role][c];
              const theirs = session.picks[partner][c];
              return (
                <Card key={c}>
                  <Text style={font.bodyStrong}>{c}</Text>
                  <Text style={[font.tiny, { marginTop: 2 }]}>
                    我：{mine === 'like' ? '想看' : mine === 'nope' ? '不太想' : '未选'} · TA：
                    {theirs === 'like' ? '想看' : theirs === 'nope' ? '不太想' : '未选'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Btn title="想看" small style={{ flex: 1 }} onPress={() => store.pickMovie(c, 'like')} />
                    <Btn title="不太想" small variant="ghost" style={{ flex: 1 }} onPress={() => store.pickMovie(c, 'nope')} />
                  </View>
                </Card>
              );
            })}
            <Card tone={tint(color.primarySoft)}>
              <Text style={[font.bodyStrong, { color: color.primaryInk }]}>
                共同想看：{session.finished ? matches.join('、') || '这次没有重合' : '等双方都选完才揭晓'}
              </Text>
            </Card>
          </>
        )}

        {/* -------- 5.3 预约观影 -------- */}
        <SectionTitle title="预约观影" right={<Btn title="＋ 预约" small variant="ghost" onPress={() => setPlanOpen(true)} />} />
        {snapshot.watchPlans.length === 0 ? (
          <EmptyState emoji="🗓️" title="还没有预约" desc="约好时间后，双方确认会自动写进共享日历。" actionLabel="约一次" onAction={() => setPlanOpen(true)} />
        ) : (
          snapshot.watchPlans.map((p) => (
            <Card key={p.id}>
              <Text style={font.bodyStrong}>{p.movieTitle}</Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                {p.date} {minToClock(p.startMin)} · 已确认 {p.confirmedBy.length}/2
              </Text>
              {!p.confirmedBy.includes(role) ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn title="我确认" small style={{ flex: 1 }} onPress={() => store.confirmWatchPlan(p.id)} />
                  <Btn title="取消预约" small variant="ghost" style={{ flex: 1 }} onPress={() => store.deleteWatchPlan(p.id)} />
                </View>
              ) : (
                <Text style={[font.tiny, { marginTop: 6 }]}>
                  {p.confirmedBy.length === 2 ? '已写进共享日历' : '等待 TA 确认'}
                </Text>
              )}
            </Card>
          ))
        )}

        <Btn title="返回影院" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>

      <Sheet visible={pickOpen} title="发起选片" onClose={() => setPickOpen(false)}>
        <Field
          label="候选片名（顿号或逗号分隔）"
          value={candidates}
          onChangeText={setCandidates}
          placeholder="春天的故事、海街日记、爱在黎明破晓前"
          multiline
        />
        <Btn
          title="开始"
          onPress={() => {
            const list = candidates
              .split(/[、,，\n]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (store.startPickSession(list)) {
              setCandidates('');
              setPickOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={planOpen} title="预约观影" onClose={() => setPlanOpen(false)}>
        <Field label="片名" value={movieTitle} onChangeText={setMovieTitle} placeholder="春天的故事" />
        <Field label="日期（YYYY-MM-DD）" value={planDate} onChangeText={setPlanDate} />
        <Field label="开始时间（HH:mm）" value={planClock} onChangeText={setPlanClock} placeholder="20:00" />
        <Btn
          title="发出预约"
          onPress={() => {
            if (store.addWatchPlan(movieTitle, planDate, clockToMin(planClock))) {
              setMovieTitle('');
              setPlanOpen(false);
            }
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
