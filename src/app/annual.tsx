import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store';
import { Btn, Card, KeyValue, NoticeBar, ProgressBar, Screen, SectionTitle } from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { tint } from '../ui/theme';

export default function AnnualScreen() {
  const router = useRouter();
  const { snapshot, role } = useApp();
  const annual = snapshot.annual;
  const partner = role === 'A' ? 'B' : 'A';

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title={`${annual.year} 年度报告`} subtitle="只属于你们两个人的回看" right={<DevicePills />}>
        <NoticeBar
          tone={tint(color.lavenderSoft)}
          ink={color.lavender}
          icon="📖"
          text="仅双方可见；没有分享榜单、没有公开成就、不和其他情侣比较。"
        />

        <Card tone={tint(color.primarySoft)}>
          <Text style={[font.tiny, { color: color.primaryInk }]}>在一起</Text>
          <Text style={[font.h1, { color: color.primaryInk, marginTop: 2 }]}>{annual.daysTogether} 天</Text>
        </Card>

        <SectionTitle title="观影年报" />
        <Card>
          <KeyValue k="一起看过" v={`${annual.moviesCount} 部`} />
          <KeyValue k="最常看的类型" v={annual.movieTypes[0] ? `${annual.movieTypes[0].name}（${annual.movieTypes[0].count}）` : '还没有数据'} />
          <KeyValue
            k="最晚的一次"
            v={annual.latestMovieAt ? `${new Date(annual.latestMovieAt).toLocaleString()}` : '—'}
          />
          <KeyValue k="最感动的一部" v={annual.mostMovedTitle ?? '—'} />
          {annual.movieTypes.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              {annual.movieTypes.slice(0, 4).map((t) => (
                <View key={t.name} style={{ marginTop: 6 }}>
                  <Text style={font.tiny}>
                    {t.name} · {t.count} 部
                  </Text>
                  <View style={{ marginTop: 3 }}>
                    <ProgressBar
                      value={annual.moviesCount > 0 ? t.count / annual.moviesCount : 0}
                      tone={tint(color.lavender)}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        <SectionTitle title="关系年报" />
        <Card>
          <KeyValue k="共同目标" v={`${annual.goalsDone} / ${annual.goalsTotal} 达成`} />
          <KeyValue k="旅行" v={`计划 ${annual.tripsCount} 次 · 成行 ${annual.travelCount} 次`} />
          <KeyValue k="感谢卡" v={`${annual.thanksCount} 张`} />
          <KeyValue k="里程碑" v={`${annual.milestones} 个`} />
          {annual.topWords.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              <Text style={font.tiny}>最常出现的词</Text>
              <Text style={[font.small, { marginTop: 4 }]}>
                {annual.topWords.map((w) => `${w.word}(${w.count})`).join(' · ')}
              </Text>
            </View>
          ) : null}
        </Card>

        <SectionTitle title="双人成就（只有你们两人能看到）" />
        <Card>
          {snapshot.achievements.length === 0 ? (
            <Text style={font.small}>今年还没有解锁的成就。</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {snapshot.achievements.map((a) => (
                <View key={a.id} style={styles.cell}>
                  <Text style={{ fontSize: 20 }}>{a.emoji}</Text>
                  <Text style={[font.tiny, { marginTop: 4, textAlign: 'center' }]}>{a.label}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <SectionTitle title="观影回忆卡" right={<Text style={font.tiny}>{snapshot.recaps.length} 张</Text>} />
        {snapshot.recaps.length === 0 ? (
          <Card>
            <Text style={font.small}>还没有一起看过电影。</Text>
          </Card>
        ) : (
          snapshot.recaps.map((r) => (
            <Card key={r.id}>
              <Text style={font.bodyStrong}>{r.movieTitle}</Text>
              <Text style={[font.small, { marginTop: 3 }]}>
                {new Date(r.endedAt).toLocaleDateString()} · {Math.round(r.durationSec / 60)} 分钟 · 评分 我
                {r.ratings[role] ?? '—'} / TA {r.ratings[partner] ?? '—'}
              </Text>
              {r.reviews[role] || r.reviews[partner] ? (
                <Text style={[font.small, { marginTop: 3, color: color.inkSoft }]}>
                  「{r.reviews[role] ?? r.reviews[partner]}」
                </Text>
              ) : null}
            </Card>
          ))
        )}

        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  cell: { width: '25%', alignItems: 'center', paddingVertical: 10 },
});
