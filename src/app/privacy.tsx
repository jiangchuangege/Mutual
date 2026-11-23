import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { useApp } from '../store';
import { TIER_META } from '../core/privacy';
import { Btn, Card, Disclaimer, KeyValue, NoticeBar, Screen, SectionTitle, useConfirm } from '../ui/components';
import { color, font, HEALTH_DISCLAIMER, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { tint } from '../ui/theme';

export default function PrivacyScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const confirm = useConfirm();
  const partner = role === 'A' ? 'B' : 'A';
  const myPeriod = snapshot.myPeriod;
  /** 真正把"属于我的数据"写成 JSON 文件并调系统分享 */
  const exportMyData = async () => {
    try {
      const part = role === 'A' ? 'B' : 'A';
      const payload = {
        app: '双人空间 / TwoSpace',
        schema: 1,
        exportedAt: new Date().toISOString(),
        role,
        spaceId: snapshot.spaceId,
        boundAt: snapshot.boundAt,
        me: snapshot.members[role],
        partner: { name: snapshot.members[part].name },
        data: {
          events: snapshot.events,
          todos: snapshot.todos,
          shopping: snapshot.shopping,
          chores: snapshot.chores,
          ledger: snapshot.ledger,
          collection: snapshot.collection,
          habits: snapshot.habits,
          goals: snapshot.goals,
          myMood: snapshot.myMood,
          myPeriod: snapshot.myPeriod,
          careReminders: snapshot.careReminders.filter((r) => r.ownerRole === role),
          giftIdeas: snapshot.giftIdeas.filter((g) => g.ownerRole === role),
          cards: snapshot.cards,
          diary: snapshot.diary,
          weeklyReviews: snapshot.weeklyReviews,
          timeline: snapshot.timeline,
          watchPlans: snapshot.watchPlans,
          recaps: snapshot.recaps,
          annual: snapshot.annual,
          relProfile: snapshot.relProfile,
          plans: snapshot.plans,
          boundaries: snapshot.boundaries,
          conflicts: snapshot.conflicts,
          mySelfAssess: snapshot.mySelfAssess,
          votes: snapshot.votes,
          ldr: snapshot.ldr,
          intimacy: snapshot.intimacy.filter((c) => c.ownerRole === role),
          vault: snapshot.vault.filter((v) => v.ownerRole === role),
          achievements: snapshot.achievements,
          notifications: snapshot.notifications,
          audit: snapshot.audit,
        },
        note: '只包含属于我自己的数据。不含 TA 的私密内容（TA 的经期原始记录、TA 的亲密卡、TA 的自评分数等）。',
      };
      const json = JSON.stringify(payload, null, 2);
      const dir = FileSystem.cacheDirectory;
      if (!dir) throw new Error('设备不支持文件目录');
      const uri = `${dir}twospace-my-data-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: '导出我的数据副本',
        });
      } else {
        store.toast(`已导出到：${uri}`, 'ok');
      }
    } catch (err) {
      store.toast(`导出失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const visibleRecords =
    snapshot.partnerPeriod && snapshot.partnerPeriod.records
      ? snapshot.partnerPeriod.records.length
      : 0;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="隐私权限中心"
        subtitle="一页看完：你在共享什么，TA 能看到什么"
        right={<Btn title="返回" small variant="ghost" onPress={() => router.back()} />}
      >
        <NoticeBar
          tone={tint(color.primarySoft)}
          ink={color.primaryInk}
          icon="🔐"
          text="所有敏感数据默认只有本人可见。未授权的字段在服务端就不会下发给对方，不是前端藏起来。"
        />

        <SectionTitle title="经期与关怀" />
        <Card onPress={() => router.push('/care')}>
          <KeyValue k="我的可见范围" v={TIER_META[myPeriod.tier].label} />
          <KeyValue
            k="TA 能看到"
            v={snapshot.partnerPeriod === null ? '什么都看不到' : TIER_META[snapshot.partnerPeriod.tier].label}
          />
          <KeyValue k="我的记录条数" v={`${myPeriod.records.length} 条（仅我可见）`} />
          <KeyValue k="授权变更次数" v={`${myPeriod.tierHistory.length} 次`} />
          <Text style={[font.tiny, { marginTop: 8 }]}>
            点这里进入「关怀 → 授权设置」，四档可切换、可一键撤回。
          </Text>
        </Card>

        <SectionTitle title="其他数据" />
        <Card>
          <KeyValue k="观影片单与回忆卡" v="仅双方可见（可设私密：v1.1）" />
          <KeyValue k={`TA 看到我的记录`} v={`${visibleRecords} 条（按授权档位）`} />
          <KeyValue k="房间弹幕与表情" v="仅房间内两人；结束后 24 小时内删除" />
          <KeyValue k="语音" v="不录制、不存储；本版未接入音频模块" />
          <KeyValue k="礼物灵感" v="仅我可见（对 TA 连数量都不显示）" />
          <KeyValue k="位置与安全报备" v="默认关闭，未实现" />
        </Card>

        <SectionTitle title="授权记录" right={<Text style={font.tiny}>可查 · 可撤回</Text>} />
        <Card>
          {myPeriod.tierHistory.length === 0 ? (
            <Text style={font.small}>还没有授权变更。</Text>
          ) : (
            [...myPeriod.tierHistory].reverse().map((h, idx) => (
              <View key={`${h.at}-${idx}`} style={styles.historyRow}>
                <Text style={font.small}>
                  {TIER_META[h.from].label} → {TIER_META[h.to].label}
                  {h.shareHistory ? '（含历史）' : ''}
                </Text>
                <Text style={font.tiny}>{new Date(h.at).toLocaleString()}</Text>
              </View>
            ))
          )}
        </Card>

        <SectionTitle title="数据处置" />
        <Card>
          <Btn
            title="导出我的数据副本（JSON）"
            variant="ghost"
            onPress={() => void exportMyData()}
          />
          <View style={{ height: 10 }} />
          <Btn
            title="撤回全部授权"
            variant="danger"
            onPress={() =>
              void confirm({
                title: '撤回全部授权？',
                message:
                  '撤回后 TA 立刻看不到任何经期相关信息，并会收到一条中性通知（不含原因）。之后你可以随时重新授权。',
                icon: '🔒',
                confirmText: '确认撤回',
                danger: true,
              }).then((ok) => {
                if (ok) store.revokeAll();
              })
            }
          />
        </Card>

        <SectionTitle title="高风险功能（本版未开放）" />
        <Card>
          <Text style={[font.small]}>
            位置共享 / 到家报备 / 社交报备 / 亲密边界卡 / 共享保险箱：全部默认关闭且未实现。
            它们必须通过独立隐私影响评估后才可上线，且上线时也默认关闭、可单方关闭。
          </Text>
        </Card>

        <Disclaimer text={HEALTH_DISCLAIMER} />
        <View style={{ height: 40 }} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  historyRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
});
