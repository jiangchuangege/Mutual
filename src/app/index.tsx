import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useApp } from '../store';
import { ambienceFor, dailyQuote } from '../core/ambience';
import { minToClock, togetherDayNumber, todayISO } from '../core/time';
import {
  Avatar,
  Btn,
  Card,
  EmptyState,
  Field,
  NoticeBar,
  Screen,
  Sheet,
} from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { VoiceCallCard } from '../ui/VoiceCall';
import { TabBar } from '../ui/TabBar';
import { font, radius, shadow, space, weatherMeta, themedColor } from '../ui/theme';
import { color as _baseColor } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';
import { describePartnerPresence } from '../ui/presence';
import { Flair } from '../ui/PageFlair';

/** 本页主题：today（只影响这一页的配色） */
const color = themedColor('today');
import type { Weather } from '../core/types';
import { Ico } from '../ui/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Aurora } from '../ui/Aurora';

const WEATHERS: Weather[] = ['sunny', 'cloudy', 'rainy', 'hug'];

/** 中间那颗心：外面一圈脉冲光环，慢慢呼吸 */
function HeartAura({ accent }: { accent: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.7] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.7, 0.35, 0] });
  return (
    <View style={styles.heartWrap}>
      <Animated.View
        style={[
          styles.heartRing,
          { borderColor: accent, opacity, transform: [{ scale }] },
        ]}
      />
      <Ico name="care" size="xl" />
    </View>
  );
}

/** 今日一句：淡入 + 一句情话。按日期定，所以两个人看到的是同一句 */
function DailyQuoteCard({ accent }: { accent: string }) {
  const [quote] = useState(() => dailyQuote(new Date()));
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);
  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
      <Card tone={surf('alt')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.quoteDot, { backgroundColor: accent }]} />
          <Text style={[font.tiny, { color: color.inkSoft }]}>今日一句 · 你们看到的是同一句</Text>
        </View>
        <Text style={[font.small, { marginTop: 6, lineHeight: 21 }]}>{quote}</Text>
      </Card>
    </Animated.View>
  );
}

/** 双人卡片里往上飘的小心心（三个错开出发，纯 native driver） */function DriftingHearts({ accent }: { accent: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0, 1, 2, 3].map((i) => (
        <FloatingHeart key={i} index={i} accent={accent} />
      ))}
    </View>
  );
}

function FloatingHeart({ index, accent }: { index: number; accent: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 900),
        Animated.timing(anim, {
          toValue: 1,
          duration: 7000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, index]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, -46] });
  const opacity = anim.interpolate({ inputRange: [0, 0.2, 0.75, 1], outputRange: [0, 0.55, 0.28, 0] });
  return (
    <Animated.Text
      style={[
        styles.floatingHeart,
        {
          left: `${12 + index * 22}%`,
          bottom: 6,
          opacity,
          transform: [{ translateY }],
          color: accent,
        },
      ]}
    >
      {index % 2 === 0 ? '💗' : '💞'}
    </Animated.Text>
  );
}

export default function TodayScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const [moodSheet, setMoodSheet] = useState(false);
  const [careSheet, setCareSheet] = useState(false);
  const [hugSheet, setHugSheet] = useState(false);
  const [hugText, setHugText] = useState('');
  /** 我刚送出去的话：送完立刻显示出来，不用等对方回应 */
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [moodNote, setMoodNote] = useState(snapshot.myMood?.note ?? '');

  // 季节 + 昼夜：问候语和配色跟着时间走（每分钟看一眼，时段变了才重绘）
  const [ambNow, setAmbNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setAmbNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const today = todayISO(now);
  const partner = role === 'A' ? 'B' : 'A';

  const todayEvents = useMemo(
    () =>
      snapshot.events
        .filter((e) => e.date === today)
        .sort((a, b) => a.startMin - b.startMin),
    [snapshot.events, today],
  );
  const pendingTodos = snapshot.todos.filter((t) => !t.done);
  const partnerPeriod = snapshot.partnerPeriod;
  const showCare = partnerPeriod !== null && partnerPeriod.careHint;
  const unbindCooling = snapshot.unbind?.status === 'cooling';
  const partnerMood = snapshot.partnerMood;
  const myMood = snapshot.myMood;
  // 在一起天数：优先用用户自己填的开始日期
  const togetherDays = togetherDayNumber(
    snapshot.profile.startedAt
      ? Date.parse(`${snapshot.profile.startedAt}T00:00:00`)
      : snapshot.boundAt,
    now,
  );
  const amb = ambienceFor(ambNow, {
    mine: snapshot.members[role].name,
    partner: snapshot.members[partner].name,
  });

  /**
   * TA 此刻在哪（在线 / 在看电影 / 在听歌 / 在听书 / 在看电视）。
   * 每 30 秒重算一次，避免心跳过期后还显示"在看电影"。
   */
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setPresenceNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const partnerPresence = describePartnerPresence(
    (snapshot as unknown as {
      presence?: Partial<Record<'A' | 'B', { surface: string; detail: string | null; at: number }>>;
    }).presence?.[partner],
    snapshot.partnerOnline,
    presenceNow,
  );

  /* C2：已经在 TA 所在的那个页面里，就不再提示「过去」 */
  const pathname = usePathname();
  const partnerRoute = partnerPresence.route;
  const alreadyHere = Boolean(
    partnerRoute && pathname && pathname.startsWith(String(partnerRoute).split('?')[0]),
  );

  /*
   * 还没拿到服务端快照：只可能是"刚启动/刚回到前台还没连上"，
   * 这时 boundAt 一定是默认的 null，不能据此说"没有双人空间"。
   */
  if (snapshot.boundAt === null && !store.serverSnapshotReady) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
        <Flair theme="today" />
        <Aurora mode="light" accent="#E9A24B" intensity={0.8} />
        <Screen title="今天" subtitle="正在连接你们的空间…" right={<DevicePills />}>
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={color.primary} />
            <Text style={[font.small, { marginTop: 12, color: color.inkMid }]}>
              正在读取你们两个人的空间，稍等一下
            </Text>
          </View>
        </Screen>
      </View>
    );
  }

  // 未绑定时不能渲染双人主页（解绑后 boundAt 会被置空）
  if (snapshot.boundAt === null && store.serverSnapshotReady) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Flair theme="today" />
      <Aurora mode="light" accent="#E9A24B" intensity={0.8} />
        <Screen title="今天" subtitle="还没有建立双人空间" right={<DevicePills />}>
          <EmptyState
            emoji="💌"
            title="先建立你们的双人空间"
            desc="把 TA 的账号 ID 填进来打个招呼，ta 点「同意」之后这里才会长成你们两个人的样子。"
            actionLabel="去绑定"
            onAction={() => router.push('/bind')}
          />
          <Card tone={surf('alt')}>
            <Text style={[font.small]}>
              一个账号同时只能在一个双人空间里；解绑后双方互相看不到任何数据。
            </Text>
          </Card>
        </Screen>
        <TabBar active="today" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen
        title="今天"
        subtitle={`和 ${store.partnerLabel} 在一起的第 ${togetherDays} 天`}
        right={<DevicePills />}
      >
        {/* 双人抬头 */}
        <Card style={styles.coupleCard}>
          {/* 卡片里飘的小心心：静态排版 + native driver 的缓慢漂浮，几乎不耗电 */}
          <DriftingHearts accent={amb.palette.accent} />
          <View style={styles.coupleRow}>
            <View style={styles.personCol}>
              <Avatar
                emoji={snapshot.members[role].avatar}
                uri={store.avatarSrc(role)}
                size={44}
                bg={color.primarySoft}
              />
              <Text style={[font.tiny, { marginTop: 6 }]}>{snapshot.members[role].name}（我）</Text>
            </View>
            <View style={styles.heartCol}>
              <HeartAura accent={amb.palette.accent} />
              <Text
                style={[
                  font.tiny,
                  { marginTop: 4, color: partnerPresence.online ? color.inkMid : color.inkFaint },
                ]}
              >
                {partnerPresence.online ? '在线' : '不在线'}
              </Text>
            </View>
            <View style={styles.personCol}>
              <Avatar
                emoji={snapshot.members[partner].avatar}
                uri={store.avatarSrc(partner)}
                size={44}
                bg={color.mintSoft}
                dim={!snapshot.partnerOnline}
              />
              <Text style={[font.tiny, { marginTop: 6 }]}>{snapshot.members[partner].name}</Text>
              {/* TA 现在在干什么：在看电影 / 在听歌 / 在听书 / 在看电视 */}
              <Text
                style={[
                  font.tiny,
                  {
                    marginTop: 2,
                    color: partnerPresence.online ? color.primary : color.inkFaint,
                    fontWeight: '700',
                  },
                ]}
                numberOfLines={1}
              >
                {partnerPresence.chip}
              </Text>
            </View>
          </View>
          {/* 一句跟着时间变的话，+ 当前季节/时段徽章 */}
          <View style={styles.ambRow}>
            <View style={[styles.ambBadge, { borderColor: amb.palette.accent }]}>
              <Text style={[font.tiny, { color: amb.palette.accent, fontWeight: '700' }]}>
                {amb.mote} {amb.label}
              </Text>
            </View>
            <Text style={[font.tiny, { flex: 1, lineHeight: 17 }]}>{amb.greeting}</Text>
          </View>
          {/* TA 正在某个模块里：一条可点的提示，点一下直接过去一起看/一起听 */}
          {partnerPresence.hint && partnerPresence.route && !alreadyHere ? (
            <Pressable
              onPress={() => router.push(partnerPresence.route as never)}
              style={[styles.joinHint, { borderColor: color.primary }]}
            >
              <Text style={[font.small, { color: color.primaryInk, flex: 1 }]}>
                {partnerPresence.hint}
              </Text>
              <Text style={[font.bodyStrong, { color: color.primary }]}>过去 ›</Text>
            </Pressable>
          ) : null}
        </Card>

        {/* 今日一句：按日期定，双方看到的是同一句 */}
        <DailyQuoteCard accent={amb.palette.accent} />

        {unbindCooling ? (
          <Pressable onPress={() => router.push('/unbind')}>
            <NoticeBar
              tone={tint(color.dangerSoft)}
              ink={color.danger}
              icon="⚠️"
              text="双人空间正在变更中（冷静期），点这里查看或撤销"
            />
          </Pressable>
        ) : null}

        {/* 心情天气 */}
        <Text style={styles.sectionLabel}>今天的状态</Text>
        <Card>
          <View style={styles.weatherRow}>
            {WEATHERS.map((w) => {
              const active = myMood?.weather === w;
              const meta = weatherMeta[w];
              return (
                <Pressable
                  key={w}
                  onPress={() => {
                    setMoodNote(myMood?.note ?? '');
                    setMoodSheet(true);
                  }}
                  style={[
                    styles.weatherCell,
                    { backgroundColor: active ? meta.color : surf('alt') },
                    active ? { borderColor: color.primary } : null,
                  ]}
                >
                  <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                  <Text style={[font.tiny, { marginTop: 4 }]}>{meta.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {myMood ? (
            <Text style={[font.small, { marginTop: 10 }]}>
              我说的：{weatherMeta[myMood.weather].label}
              {myMood.note ? ` · ${myMood.note}` : ''}
            </Text>
          ) : (
            <Text style={[font.small, { marginTop: 10 }]}>还没更新今天的天气</Text>
          )}
        </Card>

        {/* TA 的状态 */}
        <Text style={styles.sectionLabel}>
          {snapshot.members[partner].name} 今天
        </Text>
        <Card>
          {partnerMood ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 24 }}>{weatherMeta[partnerMood.weather].emoji}</Text>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={font.bodyStrong}>{weatherMeta[partnerMood.weather].label}</Text>
                  {partnerMood.note ? (
                    <Text style={[font.small, { marginTop: 2 }]}>「{partnerMood.note}」</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.actionRow}>
                <Btn
                  title="抱抱"
                  variant="soft"
                  small
                  style={{ flex: 1 }}
                  onPress={() => {
                    // 发一张抱抱卡，并且把 TA 的"需要抱抱"收下——
                    // 不然点完还挂着"需要抱抱"，看起来像没反应
                    const r = store.hugPartner('抱一下');
                    if (r) setLastSent('抱一下（已送到 TA 的卡片里）');
                  }}
                />
                <Btn
                  title="说一句"
                  variant="ghost"
                  small
                  style={{ flex: 1 }}
                  onPress={() => {
                    setHugText('');
                    setHugSheet(true);
                  }}
                />
              </View>
              {lastSent ? (
                <View style={styles.sentBox}>
                  <Text style={[font.tiny, { color: color.primaryInk }]}>
                    你已经说了：「{lastSent}」
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={font.small}>
                {snapshot.members[partner].name} 今天还没更新状态。直接问一句也行。
              </Text>
              {lastSent ? (
                <View style={styles.sentBox}>
                  <Text style={[font.tiny, { color: color.primaryInk }]}>
                    你已经说了：「{lastSent}」
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </Card>

        {/* 5.8 语音：随时可发起，不依赖影院房间 */}
        <VoiceCallCard voice={snapshot.voice} channel={snapshot.voiceChannel} role={role} compact />

        {/* 关怀卡：只有授权后才出现；未授权时**不出现占位** */}
        {showCare ? (
          <Pressable onPress={() => setCareSheet(true)}>
            <Card tone={tint(color.careSoft)} style={{ borderColor: color.care }}>
              <Text style={[font.bodyStrong, { color: color.careInk }]}>
                🌿 TA 今天可能需要关心
              </Text>
              <Text style={[font.small, { color: color.careInk, marginTop: 4 }]}>
                点开看看能做点什么（不会显示 TA 的任何细节）
              </Text>
            </Card>
          </Pressable>
        ) : null}

        {/* 今日摘要 */}
        <Text style={styles.sectionLabel}>今天的安排</Text>
        <Card onPress={() => router.push('/life')}>
          {todayEvents.length === 0 ? (
            <Text style={font.small}>今天没有安排。加一个你们的小约定？</Text>
          ) : (
            todayEvents.map((e, idx) => (
              <View
                key={e.id}
                style={[styles.eventRow, idx > 0 ? styles.eventRowBorder : null]}
              >
                <Text style={[font.mono, { width: 52, color: color.primaryInk }]}>
                  {minToClock(e.startMin)}
                </Text>
                <Text style={[font.bodyStrong, { flex: 1 }]}>{e.title}</Text>
                <Text style={font.tiny}>{e.ownerRole === role ? '我加的' : 'TA 加的'}</Text>
              </View>
            ))
          )}
          <View style={styles.todoHint}>
            <Text style={font.small}>
              待办还有 {pendingTodos.length} 件
              {pendingTodos.length > 0 ? `，最近一件：${pendingTodos[0].title}` : ''}
            </Text>
          </View>
        </Card>

        {/* TA 的动态：对方新增/删除了什么，一进来就能看到最新一条 */}
        {store.partnerActivity.length > 0 ? (
          <Card onPress={() => router.push('/activity')}>
            <View style={styles.eventRow}>
              <Text style={{ fontSize: 16 }}>📣</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={font.bodyStrong}>
                  TA {store.partnerActivity[0].entityLabel}有更新
                  {store.unreadActivityCount > 0 ? ` · ${store.unreadActivityCount} 条新的` : ''}
                </Text>
                <Text style={[font.small, { marginTop: 2 }]} numberOfLines={1}>
                  {store.partnerActivity[0].title
                    ? `「${store.partnerActivity[0].title}」`
                    : '点开看看 TA 做了什么'}
                </Text>
              </View>
              <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
            </View>
          </Card>
        ) : null}

        {/* 快捷入口 */}
        <View style={styles.grid}>
          <QuickCell emoji="🗓️" label="日历" onPress={() => router.push('/life')} />
          <QuickCell emoji="🛒" label="购物清单" onPress={() => router.push('/life')} />
          <QuickCell emoji="🎬" label="一起看电影" onPress={() => router.push('/cinema')} />
          <QuickCell emoji="🌿" label="关怀" onPress={() => router.push('/care')} />
        </View>

        <View style={{ height: 120 }} />
      </Screen>

      <Sheet visible={moodSheet} title="今天什么天气？" onClose={() => setMoodSheet(false)}>
        <View style={styles.sheetWeatherRow}>
          {WEATHERS.map((w) => (
            <Pressable
              key={w}
              onPress={() => {
                if (store.setMood(w, moodNote)) setMoodSheet(false);
              }}
              style={[styles.sheetWeatherCell, { backgroundColor: weatherMeta[w].color }]}
            >
              <Text style={{ fontSize: 26 }}>{weatherMeta[w].emoji}</Text>
              <Text style={[font.tiny, { marginTop: 6 }]}>{weatherMeta[w].label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[font.tiny, { marginTop: 8 }]}>想补一句（最多 30 字）</Text>
        <Pressable
          style={styles.noteBox}
          onPress={() => {
            // 简化交互：点一下用内置输入
          }}
        >
          <TextInputProxy value={moodNote} onChange={setMoodNote} />
        </Pressable>
        <Text style={[font.small, { marginTop: 10 }]}>
          TA 会看到你的天气和这句话；不看也没关系，不推送强提醒。
        </Text>
      </Sheet>

      <Sheet
        visible={hugSheet}
        title="说一句"
        subtitle="会作为一张抱抱卡送到 TA 的卡片里"
        icon="🤗"
        onClose={() => setHugSheet(false)}
        footer={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn
              title="取消"
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => setHugSheet(false)}
            />
            <Btn
              title="送出"
              style={{ flex: 1 }}
              onPress={() => {
                const words = hugText.trim() || '抱一下';
                if (store.hugPartner(words)) {
                  setLastSent(words);
                  setHugSheet(false);
                  setHugText('');
                }
              }}
            />
          </View>
        }
      >
        <Field
          label="想说的话"
          value={hugText}
          onChangeText={setHugText}
          placeholder="比如：不用回，我就是抱一下"
          autoFocus
        />
        <Text style={[font.tiny, { marginTop: 8 }]}>
          TA 那边会看到这张卡，以及一条「TA 给你留了一张卡片」的通知（锁屏不显示正文）。
        </Text>
      </Sheet>

      <Sheet
        visible={careSheet}
        title="可以做点什么"
        subtitle="照 TA 自己写的清单来，不是系统给的建议"
        icon="🤍"
        onClose={() => setCareSheet(false)}
      >
        {snapshot.partnerComfort.length === 0 ? (
          <Text style={[font.small, { color: color.inkMid }]}>
            TA 还没写希望被怎么照顾。这个清单只有本人能填——让 TA 在「关怀 → 我」里加几条，
            之后你在这里就能照着做，也不会看到任何身体数据。
          </Text>
        ) : (
          snapshot.partnerComfort.map((item) => (
            <Card key={item.id}>
              <Text style={font.bodyStrong}>{item.text}</Text>
              <View style={{ height: 10 }} />
              <Btn
                title="我来做"
                small
                onPress={() => {
                  setCareSheet(false);
                  store.sendCareAction(item.id);
                }}
              />
            </Card>
          ))
        )}
        <Text style={[font.tiny, { marginTop: 10 }]}>
          点「我来做」会给 TA 发一条通知（锁屏只说「TA 想为你做点事」，不会带清单原文）。
        </Text>
      </Sheet>

      <TabBar active="today" />
    </View>
  );
}

function TextInputProxy({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // 独立小组件，避免 Sheet 内重复渲染
  const { TextInput } = require('react-native') as typeof import('react-native');
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="比如：今天有点累"
      placeholderTextColor={color.inkFaint}
      maxLength={30}
      style={{ fontSize: 14, color: color.ink, paddingVertical: 8 }}
    />
  );
}

function QuickCell({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickCell, pressed ? { opacity: 0.8 } : null]}
    >
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={[font.tiny, { marginTop: 6 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  /** 「你已经说了…」的回显框 */
  sentBox: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: color.primarySoft,
  },
  coupleCard: { backgroundColor: surf('base'), paddingVertical: space.lg },
  coupleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  personCol: { alignItems: 'center' },
  heartCol: { alignItems: 'center' },
  heartWrap: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  heartRing: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
  },
  floatingHeart: { position: 'absolute', fontSize: 12 },
  ambRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  /** TA 在别的模块里：一条可点的「过去一起」提示 */
  joinHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: surf('alt'),
  },
  ambBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  quoteDot: { width: 6, height: 6, borderRadius: 3 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line,
  },
  sectionLabel: {
    ...font.tiny,
    color: color.inkSoft,
    marginTop: space.lg,
    marginBottom: space.sm,
    marginLeft: 4,
  },
  weatherRow: { flexDirection: 'row', gap: 8 },
  weatherCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
  },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  eventRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  todoHint: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  grid: { flexDirection: 'row', gap: 8, marginTop: space.md },
  quickCell: {
    flex: 1,
    backgroundColor: surf('base'),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    paddingVertical: 14,
    ...shadow.card,
  },
  sheetWeatherRow: { flexDirection: 'row', gap: 8, marginBottom: space.md },
  sheetWeatherCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  noteBox: {
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 12,
    marginTop: 6,
  },
});
