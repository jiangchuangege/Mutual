import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store';
import { predictedDaysInMonth } from '../core/period';
import {
  clockToMin,
  diffDays,
  minToClock,
  monthMatrix,
  monthLabel,
  shiftMonth,
  todayISO,
} from '../core/time';
import type { Assignee, EventCategory } from '../core/types';
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  Field,
  NoticeBar,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  useConfirm,
} from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { TabBar } from '../ui/TabBar';
import { categoryMeta, font, radius, space, themedColor } from '../ui/theme';
import { color as _baseColor } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';
import { Flair } from '../ui/PageFlair';
import { Aurora } from '../ui/Aurora';

/** 本页主题：life（只影响这一页的配色） */
const color = themedColor('life');

type LifeTab = 'calendar' | 'todos' | 'shopping' | 'gifts';

const WEEK_HEAD = ['日', '一', '二', '三', '四', '五', '六'];
const CATEGORIES: EventCategory[] = ['date', 'anniversary', 'chore', 'trip', 'reminder', 'movie'];

export default function LifeScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const partner = role === 'A' ? 'B' : 'A';
  const today = todayISO();
  const confirm = useConfirm();

  const [tab, setTab] = useState<LifeTab>('calendar');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [selected, setSelected] = useState(today);

  // 新建事件
  const [eventSheet, setEventSheet] = useState(false);
  const [title, setTitle] = useState('');
  const [startClock, setStartClock] = useState('19:00');
  const [endClock, setEndClock] = useState('20:00');
  const [category, setCategory] = useState<EventCategory>('date');
  const [selfOnly, setSelfOnly] = useState(false);

  // 新建待办 / 购物
  const [todoSheet, setTodoSheet] = useState(false);
  const [todoTitle, setTodoTitle] = useState('');
  const [assignee, setAssignee] = useState<Assignee>('either');

  const [shopSheet, setShopSheet] = useState(false);
  const [shopTitle, setShopTitle] = useState('');
  const [shopQty, setShopQty] = useState('1');
  const [shopCat, setShopCat] = useState<'fresh' | 'daily' | 'medicine' | 'snack' | 'other'>('daily');

  // 礼物灵感
  const [giftSheet, setGiftSheet] = useState(false);
  const [giftText, setGiftText] = useState('');
  const [giftOccasion, setGiftOccasion] = useState('');

  const weeks = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof snapshot.events>();
    for (const e of snapshot.events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [snapshot.events]);

  const myPeriodDays = useMemo(() => {
    const days = new Set<number>();
    for (const r of snapshot.myPeriod.records) {
      const start = r.startDate;
      const end = r.endDate ?? today;
      let cur = start;
      let guard = 0;
      while (diffDays(end, cur) >= 0 && guard < 60) {
        if (cur.startsWith(`${cursor.year}-${`${cursor.month}`.padStart(2, '0')}-`)) {
          days.add(Number.parseInt(cur.slice(8), 10));
        }
        const d = new Date(Date.parse(`${cur}T00:00:00Z`));
        d.setUTCDate(d.getUTCDate() + 1);
        cur = d.toISOString().slice(0, 10);
        guard += 1;
      }
    }
    return days;
  }, [snapshot.myPeriod.records, cursor, today]);

  const partnerPredicted = useMemo(() => {
    if (!snapshot.partnerPeriod || !snapshot.partnerPeriod.predictedDates) return new Set<number>();
    const prefix = `${cursor.year}-${`${cursor.month}`.padStart(2, '0')}-`;
    return new Set(
      snapshot.partnerPeriod.predictedDates
        .filter((d) => d.startsWith(prefix))
        .map((d) => Number.parseInt(d.slice(8), 10)),
    );
  }, [snapshot.partnerPeriod, cursor]);

  const selectedEvents = (eventsByDate.get(selected) ?? []).sort((a, b) => a.startMin - b.startMin);
  const todoGroups: Array<{ key: string; label: string; items: typeof snapshot.todos }> = [
    { key: 'either', label: '谁做都行', items: snapshot.todos.filter((t) => !t.done && t.assignee === 'either') },
    { key: 'mine', label: '我来做', items: snapshot.todos.filter((t) => !t.done && t.assignee === role) },
    { key: 'partner', label: `${snapshot.members[partner].name} 来做`, items: snapshot.todos.filter((t) => !t.done && t.assignee === partner) },
  ];
  const doneTodos = snapshot.todos.filter((t) => t.done);

  const shoppingGroups = (['fresh', 'daily', 'medicine', 'snack', 'other'] as const).map((c) => ({
    key: c,
    label: { fresh: '生鲜', daily: '日用', medicine: '药品', snack: '零食', other: '其他' }[c],
    items: snapshot.shopping.filter((s) => !s.done && s.category === c),
  }));
  const doneShopping = snapshot.shopping.filter((s) => s.done);

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Flair theme="life" />
      <Aurora mode="light" accent="#4FAE7C" intensity={0.8} />
      <Screen title="生活" subtitle="对时间、对清单、对钱，都在这一个地方" right={<DevicePills />}>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'calendar', label: '日历' },
            { value: 'todos', label: '待办' },
            { value: 'shopping', label: '购物' },
            { value: 'gifts', label: '礼物灵感' },
          ]}
        />

        {/* ------------------------------ 日历 ------------------------------ */}
        {tab === 'calendar' ? (
          <>
            <Card style={{ marginTop: space.md }}>
              <View style={styles.monthBar}>
                <Pressable
                  onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))}
                  hitSlop={10}
                >
                  <Text style={styles.navArrow}>‹</Text>
                </Pressable>
                <Text style={font.h3}>{monthLabel(cursor.year, cursor.month)}</Text>
                <Pressable
                  onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))}
                  hitSlop={10}
                >
                  <Text style={styles.navArrow}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekHead}>
                {WEEK_HEAD.map((w) => (
                  <Text key={w} style={[font.tiny, styles.weekCell]}>
                    {w}
                  </Text>
                ))}
              </View>

              {weeks.map((week, wi) => (
                <View key={`w${wi}`} style={styles.weekRow}>
                  {week.map((iso) => {
                    const dayNum = Number.parseInt(iso.slice(8), 10);
                    const inMonth = iso.startsWith(
                      `${cursor.year}-${`${cursor.month}`.padStart(2, '0')}-`,
                    );
                    const isToday = iso === today;
                    const isSelected = iso === selected;
                    const hasEvent = (eventsByDate.get(iso) ?? []).length > 0;
                    const hasMine = myPeriodDays.has(dayNum) && inMonth;
                    const hasPartner = partnerPredicted.has(dayNum) && inMonth;
                    return (
                      <Pressable
                        key={iso}
                        onPress={() => setSelected(iso)}
                        style={[
                          styles.dayCell,
                          isSelected ? styles.dayCellSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            font.small,
                            {
                              color: !inMonth
                                ? color.inkFaint
                                : isSelected
                                  ? '#FFFFFF'
                                  : isToday
                                    ? color.primary
                                    : color.ink,
                              fontWeight: isToday || isSelected ? '700' : '400',
                            },
                          ]}
                        >
                          {dayNum}
                        </Text>
                        <View style={styles.dotRow}>
                          {hasEvent ? <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : color.primary }]} /> : null}
                          {hasMine ? <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : color.care }]} /> : null}
                          {hasPartner ? <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : color.sky }]} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}

              <View style={styles.legend}>
                <LegendDot tone={tint(color.primary)} label="我们的安排" />
                <LegendDot tone={tint(color.care)} label="我的经期" />
                {snapshot.partnerPeriod && snapshot.partnerPeriod.predictedDates ? (
                  <LegendDot tone={tint(color.sky)} label="TA 的预测" />
                ) : null}
              </View>
            </Card>

            <SectionTitle
              title={`${selected.slice(5)} 的安排`}
              right={<Btn title="＋ 新建" small variant="soft" onPress={() => setEventSheet(true)} />}
            />
            {selectedEvents.length === 0 ? (
              <EmptyState
                emoji="🗓️"
                title="这天还没有安排"
                desc="加一个你们的小约定，双方会同时看到。"
                actionLabel="新建安排"
                onAction={() => setEventSheet(true)}
              />
            ) : (
              selectedEvents.map((e) => (
                <Card key={e.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{categoryMeta[e.category].emoji}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={font.bodyStrong}>{e.title}</Text>
                      <Text style={[font.small, { marginTop: 2 }]}>
                        {minToClock(e.startMin)} – {minToClock(e.endMin)} ·{' '}
                        {e.visibility === 'self' ? '仅我可见' : '共同可见'} ·{' '}
                        {e.ownerRole === role ? '我建的' : 'TA 建的'}
                      </Text>
                    </View>
                    {e.ownerRole === role ? (
                      <Pressable
                        hitSlop={10}
                        onPress={() =>
                          void confirm({
                            title: `删除「${e.title}」？`,
                            message: '删除后双方都看不到这条安排，且不可恢复。',
                            icon: '📅',
                            confirmText: '删除',
                            danger: true,
                          }).then((ok) => {
                            if (ok) store.deleteEvent(e.id);
                          })
                        }
                      >
                        <Text style={[font.tiny, { color: color.danger }]}>删除</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              ))
            )}
          </>
        ) : null}

        {/* ------------------------------ 待办 ------------------------------ */}
        {tab === 'todos' ? (
          <>
            <View style={{ marginTop: space.md }}>
              <Btn title="＋ 新增待办" onPress={() => setTodoSheet(true)} />
            </View>
            {snapshot.todos.filter((t) => !t.done).length === 0 ? (
              <EmptyState
                emoji="✅"
                title="没有待办，今天挺轻松"
                desc="买菜、取快递、缴费这类事写下来就不会漏。"
                actionLabel="新增一件"
                onAction={() => setTodoSheet(true)}
              />
            ) : (
              todoGroups.map((group) =>
                group.items.length === 0 ? null : (
                  <View key={group.key}>
                    <SectionTitle title={group.label} />
                    {group.items.map((t) => (
                      <Card key={t.id}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Pressable
                            onPress={() => store.toggleTodo(t.id)}
                            style={styles.checkbox}
                          >
                            <View style={styles.checkboxInner} />
                          </Pressable>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={font.bodyStrong}>{t.title}</Text>
                            <Text style={[font.small, { marginTop: 2 }]}>
                              由 {t.createdBy === role ? '我' : snapshot.members[partner].name} 添加
                              {t.dueDate ? ` · 截止 ${t.dueDate.slice(5)}` : ''}
                            </Text>
                          </View>
                          <Pressable
                            hitSlop={10}
                            onPress={() =>
                              void confirm({
                                title: `删除「${t.title}」？`,
                                message: '删除后双方都看不到这条待办，且不可恢复。',
                                icon: '✅',
                                confirmText: '删除',
                                danger: true,
                              }).then((ok) => {
                                if (ok) store.deleteTodo(t.id);
                              })
                            }
                          >
                            <Text style={[font.tiny, { color: color.danger }]}>删除</Text>
                          </Pressable>
                        </View>
                      </Card>
                    ))}
                  </View>
                ),
              )
            )}
            {doneTodos.length > 0 ? (
              <>
                <SectionTitle title={`已完成 ${doneTodos.length} 件`} />
                {doneTodos.map((t) => (
                  <Card key={t.id} tone={surf('alt')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Pressable onPress={() => store.toggleTodo(t.id)} style={[styles.checkbox, styles.checkboxDone]}>
                        <Text style={{ color: '#FFFFFF', fontSize: 11 }}>✓</Text>
                      </Pressable>
                      <Text
                        style={[
                          font.body,
                          { marginLeft: 10, flex: 1, textDecorationLine: 'line-through', color: color.inkFaint },
                        ]}
                      >
                        {t.title}
                      </Text>
                      <Text style={font.tiny}>撤销</Text>
                    </View>
                  </Card>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {/* ------------------------------ 购物 ------------------------------ */}
        {tab === 'shopping' ? (
          <>
            <View style={{ marginTop: space.md, flexDirection: 'row', gap: 8 }}>
              <Btn title="＋ 添加商品" onPress={() => setShopSheet(true)} style={{ flex: 1 }} />
              <Btn
                title="清空已完成"
                variant="ghost"
                onPress={() => {
                  const r = store.hub.clearDoneShopping();
                  if (r.ok) store.toast(`已清空 ${r.value} 件`, 'ok');
                  store.setRole(role);
                }}
                style={{ flex: 1 }}
              />
            </View>
            {snapshot.shopping.filter((s) => !s.done).length === 0 && doneShopping.length === 0 ? (
              <EmptyState
                emoji="🛒"
                title="清单是空的"
                desc="家里缺什么记在这里，谁去超市谁勾，不会重复买。"
                actionLabel="添加第一件"
                onAction={() => setShopSheet(true)}
              />
            ) : (
              shoppingGroups.map((group) =>
                group.items.length === 0 ? null : (
                  <View key={group.key}>
                    <SectionTitle title={group.label} />
                    {group.items.map((s) => (
                      <Card key={s.id}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Pressable onPress={() => store.toggleShopping(s.id)} style={styles.checkbox}>
                            <View style={styles.checkboxInner} />
                          </Pressable>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={font.bodyStrong}>{s.title}</Text>
                            <Text style={[font.small, { marginTop: 2 }]}>
                              {s.qty} · {s.createdBy === role ? '我加的' : 'TA 加的'}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    ))}
                  </View>
                ),
              )
            )}
            {doneShopping.length > 0 ? (
              <>
                <SectionTitle title={`已买到 ${doneShopping.length} 件`} />
                {doneShopping.map((s) => (
                  <Card key={s.id} tone={surf('alt')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Pressable onPress={() => store.toggleShopping(s.id)} style={[styles.checkbox, styles.checkboxDone]}>
                        <Text style={{ color: '#FFFFFF', fontSize: 11 }}>✓</Text>
                      </Pressable>
                      <Text
                        style={[
                          font.body,
                          { marginLeft: 10, flex: 1, textDecorationLine: 'line-through', color: color.inkFaint },
                        ]}
                      >
                        {s.title} · {s.qty}
                      </Text>
                      <Text style={font.tiny}>撤销</Text>
                    </View>
                  </Card>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {/* ------------------------------ 礼物灵感 ------------------------------ */}
        {tab === 'gifts' ? (
          <>
            <NoticeBar
              tone={tint(color.lavenderSoft)}
              ink={color.lavender}
              icon="🔒"
              text="这里的记录默认对 TA 完全不可见（连数量也不显示），避免节日剧透。"
            />
            <Btn title="＋ 记一条" onPress={() => setGiftSheet(true)} />
            <View style={{ height: 12 }} />
            {snapshot.giftIdeas.length === 0 ? (
              <EmptyState
                emoji="🎁"
                title="还没记下什么"
                desc="TA 随口说过想要的东西，记在这里，节日就不会抓瞎。"
                actionLabel="记一条"
                onAction={() => setGiftSheet(true)}
              />
            ) : (
              snapshot.giftIdeas.map((g) => (
                <Card key={g.id}>
                  <Text style={font.bodyStrong}>{g.text}</Text>
                  <Text style={[font.small, { marginTop: 4 }]}>
                    {g.occasion ? `场合：${g.occasion} · ` : ''}
                    {g.ownerRole === role
                      ? g.revealed
                        ? '已揭示给 TA'
                        : '仅我可见'
                      : 'TA 主动揭示给你'}
                  </Text>
                  {g.ownerRole === role && !g.revealed ? (
                    <>
                      <View style={{ height: 10 }} />
                      <Btn
                        title="揭示给 TA 看"
                        small
                        variant="ghost"
                        onPress={() => store.revealGiftIdea(g.id)}
                      />
                    </>
                  ) : null}
                </Card>
              ))
            )}
          </>
        ) : null}

        <SectionTitle title="更多生活清单" />
        <View style={styles.quickGrid}>
          <QuickCell emoji="🧹" label="家务分工" onPress={() => router.push('/chores')} />
          <QuickCell emoji="🧾" label="共同记账" onPress={() => router.push('/ledger')} />
          <QuickCell emoji="🌱" label="习惯目标" onPress={() => router.push('/habits')} />
          <QuickCell emoji="🎁" label="愿望清单" onPress={() => router.push('/collection?kind=wishlist')} />
          <QuickCell emoji="🍜" label="餐厅" onPress={() => router.push('/collection?kind=restaurant')} />
          <QuickCell emoji="🧳" label="旅行" onPress={() => router.push('/collection?kind=trip')} />
          <QuickCell emoji="🎧" label="一起听" onPress={() => router.push('/listen')} />
          <QuickCell emoji="📻" label="焦焦FM" onPress={() => router.push('/jiaojiao-fm')} />
          <QuickCell emoji="🎬" label="影库" onPress={() => router.push('/cinema-library')} />
          <QuickCell emoji="🎮" label="一起玩" onPress={() => router.push('/games')} />
          <QuickCell emoji="🎵" label="歌单" onPress={() => router.push('/collection?kind=playlist')} />
          <QuickCell emoji="📦" label="库存" onPress={() => router.push('/collection?kind=inventory')} />
          <QuickCell emoji="🖼️" label="照片" onPress={() => router.push('/collection?kind=photoMemory')} />
          <QuickCell emoji="🫙" label="愿望罐" onPress={() => router.push('/collection?kind=wishJar')} />
          <QuickCell emoji="👥" label="人物档案" onPress={() => router.push('/collection?kind=people')} />
          <QuickCell emoji="🏅" label="里程碑" onPress={() => router.push('/collection?kind=milestone')} />
        </View>

        <View style={{ height: 120 }} />
      </Screen>

      {/* 新建事件 */}
      <Sheet visible={eventSheet} title="新建安排" onClose={() => setEventSheet(false)}>
        <Field label="标题" value={title} onChangeText={setTitle} placeholder="一起吃饭 / 取快递 / 看电影" />
        <Text style={[font.tiny, { marginBottom: 6 }]}>日期（当前选中：{selected}）</Text>
        <Text style={[font.small, { marginBottom: 10 }]}>{selected}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="开始" value={startClock} onChangeText={setStartClock} placeholder="19:00" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="结束" value={endClock} onChangeText={setEndClock} placeholder="20:00" />
          </View>
        </View>
        <Text style={[font.tiny, { marginBottom: 6 }]}>类型</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={`${categoryMeta[c].emoji} ${categoryMeta[c].label}`}
              active={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip label="共同可见" active={!selfOnly} onPress={() => setSelfOnly(false)} />
          <Chip label="仅我可见" active={selfOnly} onPress={() => setSelfOnly(true)} />
        </View>
        <Btn
          title="保存"
          onPress={() => {
            const okSave = store.addEvent({
              title,
              date: selected,
              startMin: clockToMin(startClock),
              endMin: clockToMin(endClock),
              category,
              visibility: selfOnly ? 'self' : 'shared',
            });
            if (okSave) {
              setTitle('');
              setEventSheet(false);
            }
          }}
        />
      </Sheet>

      {/* 新增待办 */}
      <Sheet visible={todoSheet} title="新增待办" onClose={() => setTodoSheet(false)}>
        <Field label="要做什么" value={todoTitle} onChangeText={setTodoTitle} placeholder="买菜 / 取快递 / 缴费" />
        <Text style={[font.tiny, { marginBottom: 6 }]}>指派给</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          <Chip label="谁做都行" active={assignee === 'either'} onPress={() => setAssignee('either')} />
          <Chip label="我来做" active={assignee === role} onPress={() => setAssignee(role)} />
          <Chip
            label={`${snapshot.members[partner].name} 做`}
            active={assignee === partner}
            onPress={() => setAssignee(partner)}
          />
        </View>
        <Btn
          title="加入清单"
          onPress={() => {
            if (store.addTodo(todoTitle, assignee)) {
              setTodoTitle('');
              setTodoSheet(false);
            }
          }}
        />
      </Sheet>

      {/* 添加商品 */}
      <Sheet visible={shopSheet} title="添加商品" onClose={() => setShopSheet(false)}>
        <Field label="商品名" value={shopTitle} onChangeText={setShopTitle} placeholder="牛奶" />
        <Field label="数量" value={shopQty} onChangeText={setShopQty} placeholder="2 盒" />
        <Text style={[font.tiny, { marginBottom: 6 }]}>分类</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {(
            [
              ['fresh', '生鲜'],
              ['daily', '日用'],
              ['medicine', '药品'],
              ['snack', '零食'],
              ['other', '其他'],
            ] as const
          ).map(([k, label]) => (
            <Chip key={k} label={label} active={shopCat === k} onPress={() => setShopCat(k)} />
          ))}
        </View>
        <Btn
          title="加入清单"
          onPress={() => {
            if (store.addShopping(shopTitle, shopQty, shopCat)) {
              setShopTitle('');
              setShopSheet(false);
            }
          }}
        />
      </Sheet>

      {/* 礼物灵感 */}
      <Sheet visible={giftSheet} title="记一条礼物灵感" onClose={() => setGiftSheet(false)}>
        <NoticeBar
          tone={tint(color.lavenderSoft)}
          ink={color.lavender}
          icon="🔒"
          text="TA 不会看到这条记录，也不会看到你记了几条。"
        />
        <Field label="TA 说过什么" value={giftText} onChangeText={setGiftText} placeholder="想要那个乐队的现场" multiline />
        <Field label="场合（可不填）" value={giftOccasion} onChangeText={setGiftOccasion} placeholder="生日 / 纪念日" />
        <Btn
          title="记下来"
          onPress={() => {
            if (store.addGiftIdea(giftText, giftOccasion)) {
              setGiftText('');
              setGiftSheet(false);
            }
          }}
        />
      </Sheet>

      <TabBar active="life" />
    </View>
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
      style={({ pressed }) => [styles.quickCell2, pressed ? { opacity: 0.8 } : null]}
    >
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text style={[font.tiny, { marginTop: 4, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={[font.tiny, { marginLeft: 4 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navArrow: { fontSize: 24, color: color.inkMid, paddingHorizontal: 8 },
  weekHead: { flexDirection: 'row', marginBottom: 4 },
  weekCell: { flex: 1, textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dayCellSelected: { backgroundColor: color.primary },
  dotRow: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
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
  checkboxInner: { width: 8, height: 8, borderRadius: 2, backgroundColor: 'transparent' },
  checkboxDone: { backgroundColor: color.ok, borderColor: color.ok },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  quickCell2: {
    width: '23%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: surf('base'),
    borderWidth: 1,
    borderColor: color.line,
  },
});
