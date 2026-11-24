import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store';
import { anomalyFlags, ongoingRecord, predictNext } from '../core/period';
import { FLOW_LABEL, MOOD_OPTIONS, SYMPTOM_OPTIONS, TIER_META, TIER_ORDER, projectPeriodForPartner } from '../core/privacy';
import { addDays, diffDays, todayISO } from '../core/time';
import type { FlowLevel, PeriodTier } from '../core/types';
import {
  Btn,
  Card,
  Chip,
  Disclaimer,
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
import { font, HEALTH_DISCLAIMER, radius, space, themedColor } from '../ui/theme';
import { color as _baseColor } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';
import { Flair } from '../ui/PageFlair';
import { Aurora } from '../ui/Aurora';

/** 本页主题：care（只影响这一页的配色） */
const color = themedColor('care');

type CareTab = 'me' | 'partner' | 'settings';

export default function CareScreen() {
  const { store, snapshot, role } = useApp();
  const confirm = useConfirm();
  const partner = role === 'A' ? 'B' : 'A';
  const today = todayISO();
  const [tab, setTab] = useState<CareTab>(snapshot.members[role].gender === 'male' ? 'partner' : 'me');

  const myGender = snapshot.members[role].gender;
  // 男性不开放「本人经期记录」：只有本人（女生/其他）能记录自己的周期
  const canTrackPeriod = myGender !== 'male';

  const myPeriod = snapshot.myPeriod;
  const prediction = useMemo(() => predictNext(myPeriod.records, today, myPeriod.predictionEnabled), [myPeriod, today]);
  const anomaly = useMemo(() => anomalyFlags(myPeriod.records), [myPeriod.records]);
  const ongoing = useMemo(() => ongoingRecord(myPeriod.records, today), [myPeriod.records, today]);

  // 记录表单
  const [recordSheet, setRecordSheet] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [flow, setFlow] = useState<FlowLevel>('medium');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [note, setNote] = useState('');

  // 授权
  const [pendingTier, setPendingTier] = useState<PeriodTier>(myPeriod.tier);
  const [shareHistory, setShareHistory] = useState(false);

  // 3.4 提醒
  const [reminderOpen, setReminderOpen] = useState(false);
  const [remKind, setRemKind] = useState<'water' | 'medicine' | 'rest'>('water');
  const [remTime, setRemTime] = useState('15:00');
  const [remNote, setRemNote] = useState('');

  // 3.10 计划记录
  const [planOpen, setPlanOpen] = useState(false);
  const [planKind, setPlanKind] = useState<'prepare' | 'contraception'>('contraception');
  const [planDate, setPlanDate] = useState(today);
  const [planNote, setPlanNote] = useState('');

  // 「我希望被这样照顾」的输入框
  const [comfortDraft, setComfortDraft] = useState('');

  const partnerPeriod = snapshot.partnerPeriod;
  const partnerMeta = partnerPeriod ? TIER_META[partnerPeriod.tier] : null;

  const previewFor = (tier: PeriodTier): string[] => {
    if (tier === 'private') return TIER_META.private.partnerSees;
    const projected = projectPeriodForPartner(
      { ...myPeriod, tier },
      role,
      partner,
      today,
    );
    if (!projected) return TIER_META.private.partnerSees;
    const lines: string[] = [];
    lines.push(projected.careHint ? '「TA 今天可能需要关心」' : '今天没有关怀提示（不显示原因）');
    if (projected.predictedDates && projected.predictedDates.length > 0) {
      lines.push(`预测日期标记：${projected.predictedDates.slice(0, 3).join('、')}${projected.predictedDates.length > 3 ? ' 等' : ''}`);
    }
    if (projected.records) {
      lines.push(`可看到 ${projected.records.length} 条记录的日期、流量、症状、情绪、备注`);
    } else {
      lines.push('看不到任何日期、流量、症状、情绪、备注');
    }
    return lines;
  };

  const toggleIn = (arr: string[], v: string): string[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Flair theme="care" />
      <Aurora mode="light" accent="#E8739A" intensity={0.8} />
      <Screen
        title="关怀"
        subtitle="记录归你，是否让 TA 看见也归你"
        right={<DevicePills />}
      >
        <Segmented
          value={tab}
          onChange={(v) => setTab(v)}
          options={
            canTrackPeriod
              ? [
                  { value: 'me' as CareTab, label: '我' },
                  { value: 'partner' as CareTab, label: store.partnerLabel },
                  { value: 'settings' as CareTab, label: '授权设置' },
                ]
              : [
                  { value: 'me' as CareTab, label: '我' },
                  { value: 'partner' as CareTab, label: store.partnerLabel },
                ]
          }
        />

        {/* 两个账号昵称一样时，页面上所有"名字"看起来都像自己，这里先说清楚 */}
        {store.namesCollide ? (
          <NoticeBar
            tone={tint(color.butterSoft)}
            ink={color.careInk}
            icon="👥"
            text={`你们俩昵称都叫「${store.myName}」，所以这里只说「我」和「${store.partnerLabel}」。想区分清楚：我们 → 外观 → 改我的昵称。`}
          />
        ) : null}

        {/* ================================ 我 ================================ */}
        {tab === 'me' ? (
          <>
            {canTrackPeriod ? (
              <>
                <Card style={{ marginTop: space.md }} tone={tint(color.careSoft)}>
                  <Text style={[font.bodyStrong, { color: color.careInk }]}>
                    {ongoing
                      ? `经期第 ${diffDays(today, ongoing.startDate) + 1} 天`
                      : prediction.nextStart
                        ? `预计 ${prediction.nextStart.slice(5)} 开始（还有 ${Math.max(0, diffDays(prediction.nextStart, today))} 天）`
                        : '还没有足够的记录来估算'}
                  </Text>
                  <Text style={[font.small, { color: color.careInk, marginTop: 4 }]}>
                    {prediction.note}
                  </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn
                  title={ongoing ? '今天结束' : '今天来了'}
                  style={{ flex: 1 }}
                  onPress={() => {
                    if (ongoing) {
                      store.updatePeriodRecord(ongoing.id, { endDate: today });
                    } else {
                      store.addPeriodRecord({
                        startDate: today,
                        endDate: null,
                        flow: 'medium',
                        symptoms: [],
                        moods: [],
                        note: '',
                      });
                    }
                  }}
                />
                <Btn
                  title="补记一条"
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setStartDate(today);
                    setEndDate('');
                    setFlow('medium');
                    setSymptoms([]);
                    setMoods([]);
                    setNote('');
                    setRecordSheet(true);
                  }}
                />
              </View>
            </Card>

            {anomaly.flagged ? (
              <NoticeBar tone={tint(color.butterSoft)} ink={color.careInk} icon="🩺" text={anomaly.copy} />
            ) : null}

            <SectionTitle
              title="我的记录"
              right={
                <Text style={font.tiny}>{myPeriod.records.length} 条 · 仅我可见</Text>
              }
            />
            {myPeriod.records.length === 0 ? (
              <EmptyState
                emoji="🌿"
                title="还没有记录"
                desc="记录第一次之后，就能慢慢认识自己的规律。"
                actionLabel="记录第一次"
                onAction={() => setRecordSheet(true)}
              />
            ) : (
              [...myPeriod.records]
                .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
                .map((r) => (
                  <Card key={r.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={font.bodyStrong}>
                          {r.startDate.slice(5)}
                          {r.endDate ? ` – ${r.endDate.slice(5)}` : ' · 进行中'}
                        </Text>
                        <Text style={[font.small, { marginTop: 3 }]}>
                          流量 {r.flow ? FLOW_LABEL[r.flow] : '未填'}
                          {r.symptoms.length > 0 ? ` · ${r.symptoms.join('/')}` : ''}
                          {r.moods.length > 0 ? ` · ${r.moods.join('/')}` : ''}
                        </Text>
                        {r.note ? (
                          <Text style={[font.small, { marginTop: 2 }]}>备注：{r.note}</Text>
                        ) : null}
                      </View>
                      <Pressable
                        hitSlop={10}
                        onPress={() =>
                          void confirm({
                            title: '删除这条记录？',
                            message: '删除后不可恢复，也不会留在任何统计里。',
                            icon: '🗑️',
                            confirmText: '删除',
                            danger: true,
                          }).then((ok) => {
                            if (ok) store.deletePeriodRecord(r.id);
                          })
                        }
                      >
                        <Text style={[font.tiny, { color: color.danger }]}>删除</Text>
                      </Pressable>
                    </View>
                  </Card>
                ))
            )}
              </>
            ) : (
              <Card style={{ marginTop: space.md }} tone={tint(color.careSoft)}>
                <Text style={[font.bodyStrong, { color: color.careInk }]}>
                  经期记录不对你开放
                </Text>
                <Text style={[font.small, { color: color.careInk, marginTop: 4 }]}>
                  这类记录只由需要记录的人自己填；你能看到的是对方主动授权的那部分。
                  这一页你照样可以用：写下你希望被怎么照顾，以及设自己的提醒。
                </Text>
              </Card>
            )}

            <SectionTitle
              title="我希望被这样照顾"
              right={<Text style={font.tiny}>自己写 · TA 能看到</Text>}
            />
            <Card>
              {snapshot.myComfort.length === 0 ? (
                <Text style={[font.small, { color: color.inkMid }]}>
                  还没有写。这里不提供任何现成模板——写几条你自己被照顾时希望对方做的事，
                  TA 会在「关怀 → TA」里看到并照着做。
                </Text>
              ) : (
                snapshot.myComfort.map((item) => (
                  <View key={item.id} style={styles.comfortRow}>
                    <Text style={{ fontSize: 14, color: color.primary }}>·</Text>
                    <Text style={[font.body, { flex: 1, marginLeft: 8 }]}>{item.text}</Text>
                    <Pressable
                      hitSlop={10}
                      onPress={() => store.removeComfortItem(item.id)}
                    >
                      <Text style={[font.tiny, { color: color.danger }]}>删除</Text>
                    </Pressable>
                  </View>
                ))
              )}

              <View style={{ height: 10 }} />
              <Field
                label="加一条（最多 12 条）"
                value={comfortDraft}
                onChangeText={setComfortDraft}
                placeholder="比如：给我倒杯热水"
              />
              <Btn
                title="加入我的清单"
                small
                onPress={() => {
                  if (store.addComfortItem(comfortDraft)) setComfortDraft('');
                }}
              />
              <Text style={[font.tiny, { marginTop: 8 }]}>
                只有你能改自己的清单；TA 那边是只读的。清单内容不会进锁屏通知。
              </Text>
            </Card>
            <Disclaimer text="清单只是你们之间的相处约定，不是医疗建议；不舒服请及时就医。" />

            <SectionTitle title="用药 / 饮水 / 休息提醒" right={<Btn title="＋ 提醒" small variant="ghost" onPress={() => setReminderOpen(true)} />} />
            <Card>
              {snapshot.careReminders.filter((r) => r.ownerRole === role).length === 0 ? (
                <Text style={font.small}>还没有提醒。提醒是给自己设的，伴侣默认看不到。</Text>
              ) : (
                snapshot.careReminders
                  .filter((r) => r.ownerRole === role)
                  .map((r) => (
                    <View key={r.id} style={{ marginTop: 8 }}>
                      <Text style={font.bodyStrong}>
                        {r.time} · {r.kind === 'water' ? '喝水' : r.kind === 'medicine' ? '用药' : '休息'}
                        {r.note ? ` · ${r.note}` : ''}
                      </Text>
                      <Text style={[font.tiny, { marginTop: 2 }]}>
                        {r.enabled ? '已开启' : '已关闭'} · {r.visibleToPartner ? 'TA 能看到这个提醒' : '仅我可见'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Btn title={r.enabled ? '关闭' : '开启'} small variant="ghost" style={{ flex: 1 }} onPress={() => store.toggleCareReminder(r.id)} />
                        <Btn
                          title={r.visibleToPartner ? '改为仅我可见' : '允许 TA 看到'}
                          small
                          variant="ghost"
                          style={{ flex: 1 }}
                          onPress={() => store.setCareReminderVisibility(r.id, !r.visibleToPartner)}
                        />
                      </View>
                    </View>
                  ))
              )}
            </Card>

            <SectionTitle title="计划记录（默认私密）" right={<Btn title="＋ 记录" small variant="ghost" onPress={() => setPlanOpen(true)} />} />
            <Card>
              <Text style={[font.small]}>
                只做记录，不做任何医疗判断。默认仅你可见；想让 TA 看到就点下面的按钮，随时能撤回。
              </Text>
              <View style={{ height: 8 }} />
              <Text style={[font.tiny, { marginBottom: 6 }]}>共 {myPeriod.planLog.length} 条记录</Text>
              {myPeriod.planLog.map((p) => (
                <Text key={p.id} style={[font.small, { marginTop: 4 }]}>
                  · {p.date} {p.kind === 'prepare' ? '备孕' : '避孕'}记录 {p.note ? `（${p.note}）` : ''}
                </Text>
              ))}
              <View style={{ height: 10 }} />
              {/*
               * PLAN_SHARE_FOR_EVERYONE：计划记录是**每个人自己的**数据，
               * 共享与否只取决于本人意愿，和"有没有经期"无关。
               * 以前男方这里只显示一句"没有这条共享开关"，于是他永远无法把自己的记录给伴侣看。
               */}
              <Btn
                title={myPeriod.sharePlanLog ? '已共享 · 点这里撤回（仅我可见）' : '把我的计划记录共享给 TA'}
                small
                variant={myPeriod.sharePlanLog ? 'danger' : undefined}
                onPress={() => store.togglePlanLogShare()}
              />
              <Text style={[font.tiny, { marginTop: 8, color: color.inkSoft }]}>
                {myPeriod.sharePlanLog
                  ? 'TA 现在能看到这些计划记录（仅记录，不做任何医疗判断）。'
                  : '默认仅你可见。共享后 TA 只能看到记录本身，看不到任何推断。'}
              </Text>
            </Card>

            <Disclaimer text={HEALTH_DISCLAIMER} />
          </>
        ) : null}

        {/* ================================ TA ================================ */}
        {tab === 'partner' ? (
          <>
            {!canTrackPeriod ? (
              <NoticeBar
                tone={tint(color.skySoft)}
                ink={color.inkMid}
                icon="ℹ️"
                text="经期记录只对本人开放：这里只显示对方主动授权给你的关怀状态，你自己没有可记录的经期模块。"
              />
            ) : null}

            {partnerPeriod === null ? (
              <EmptyState
                emoji="🔒"
                title={`这是${store.partnerLabel}的关怀信息`}
                desc="对方还没授权经期相关内容 —— 那部分只有 TA 自己能看。但 TA 亲手写的「希望你这样照顾」在下面，随时可以照着做。"
              />
            ) : (
              <>
                <NoticeBar
                  tone={tint(color.skySoft)}
                  ink={color.inkMid}
                  icon="ℹ️"
                  text={`当前可见范围：${partnerMeta?.label ?? ''} · ${partnerMeta?.summary ?? ''}`}
                />

                {partnerPeriod.careHint ? (
                  <Card tone={tint(color.careSoft)}>
                    <Text style={[font.bodyStrong, { color: color.careInk }]}>
                      🌿 {snapshot.members[partner].name} 今天可能需要关心
                    </Text>
                    <Text style={[font.small, { color: color.careInk, marginTop: 4 }]}>
                      你看到的是"需要关心"这个信号本身，不是 TA 的身体数据。
                    </Text>
                  </Card>
                ) : (
                  <Card>
                    <Text style={font.small}>今天没有关怀提示。看不到原因，也不需要追问。</Text>
                  </Card>
                )}

                {partnerPeriod.tier !== 'care' && partnerPeriod.predictedDates ? (
                  <>
                    <SectionTitle title="日历标记（无细节）" />
                    <Card>
                      <Text style={font.small}>
                        {partnerPeriod.predictedDates.length > 0
                          ? partnerPeriod.predictedDates.slice(0, 6).join('、')
                          : '这个周期没有可显示的预测标记'}
                      </Text>
                      <Text style={[font.tiny, { marginTop: 6 }]}>
                        只显示日期，不显示流量、症状、情绪与备注。
                      </Text>
                    </Card>
                  </>
                ) : null}

                {partnerPeriod.tier === 'full' && partnerPeriod.records ? (
                  <>
                    <SectionTitle title="TA 共享给你的记录" />
                    {partnerPeriod.records.length === 0 ? (
                      <Card>
                        <Text style={font.small}>TA 还没有共享任何记录。</Text>
                      </Card>
                    ) : (
                      partnerPeriod.records.map((r, idx) => (
                        <Card key={`${r.startDate}-${idx}`}>
                          <Text style={font.bodyStrong}>
                            {r.startDate.slice(5)}
                            {r.endDate ? ` – ${r.endDate.slice(5)}` : ' · 进行中'}
                          </Text>
                          <Text style={[font.small, { marginTop: 3 }]}>
                            流量 {r.flow ? FLOW_LABEL[r.flow] : '未填'}
                            {r.symptoms.length > 0 ? ` · ${r.symptoms.join('/')}` : ''}
                            {r.moods.length > 0 ? ` · ${r.moods.join('/')}` : ''}
                          </Text>
                          {r.note ? (
                            <Text style={[font.small, { marginTop: 2 }]}>备注：{r.note}</Text>
                          ) : null}
                        </Card>
                      ))
                    )}
                  </>
                ) : null}

              </>
            )}
            {/*
             * 「TA 希望你这样照顾」= 对方**主动写下**的照顾清单（myComfort）。
             *
             * COMFORT_ALWAYS_SHARED：这份清单的语义就是"我同意让 TA 看见"，
             * 它跟经期授权完全是两件事。以前它被塞在 `partnerPeriod === null ? 空状态 : …`
             * 里，于是对方**没有经期模块**（比如男方，或还没做任何经期授权）时，
             * 整段都不渲染 —— 用户反馈"我写了『我希望被这样照顾』，TA 那边看不到"。
             * 现在无论对方有没有授权经期信息，这一块都显示。
             */}
            <SectionTitle
              title={`${snapshot.members[partner].name || 'TA'} 希望你这样照顾`}
              right={<Text style={font.tiny}>TA 自己写的</Text>}
            />
            {snapshot.partnerComfort.length === 0 ? (
              <Card>
                <Text style={[font.small]}>
                  TA 还没写。让 TA 在「关怀 → 我的」里加几条；写完之后这里会显示，你就可以照着做。
                </Text>
              </Card>
            ) : (
              snapshot.partnerComfort.map((item) => (
                <Card key={item.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[font.bodyStrong, { flex: 1 }]}>{item.text}</Text>
                    <Btn title="我来" small onPress={() => store.sendCareAction(item.id)} />
                  </View>
                </Card>
              ))
            )}
            <Disclaimer text="伴侣端不提供任何「推断式」统计（例如记录频次），避免间接泄露。" />
          </>
        ) : null}

        {/* ============================== 授权设置 ============================== */}
        {tab === 'settings' && canTrackPeriod ? (
          <>
            <NoticeBar
              tone={tint(color.primarySoft)}
              ink={color.primaryInk}
              icon="🔐"
              text="你可以随时修改或撤回，撤回后 TA 立刻看不到（不是明天，是立刻）。"
            />

            <SectionTitle title="TA 能看到什么" />
            {TIER_ORDER.map((t) => {
              const meta = TIER_META[t];
              const active = pendingTier === t;
              return (
                <Pressable key={t} onPress={() => setPendingTier(t)}>
                  <Card
                    style={active ? { borderColor: color.primary, borderWidth: 2 } : undefined}
                    tone={active ? color.primarySoft : surf('base')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.radio, active ? styles.radioOn : null]}>
                        {active ? <View style={styles.radioDot} /> : null}
                      </View>
                      <Text style={[font.bodyStrong, { marginLeft: 10, flex: 1 }]}>{meta.label}</Text>
                      {myPeriod.tier === t ? (
                        <Text style={[font.tiny, { color: color.ok }]}>当前</Text>
                      ) : null}
                    </View>
                    <Text style={[font.small, { marginTop: 6 }]}>{meta.summary}</Text>
                    <View style={styles.previewBox}>
                      <Text style={[font.tiny, { color: color.inkSoft, marginBottom: 4 }]}>
                        实时预览 · TA 那一侧会看到
                      </Text>
                      {previewFor(t).map((line, i) => (
                        <Text key={i} style={[font.small, { color: color.inkMid }]}>
                          · {line}
                        </Text>
                      ))}
                    </View>
                  </Card>
                </Pressable>
              );
            })}

            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={font.bodyStrong}>同时共享历史记录</Text>
                  <Text style={[font.small, { marginTop: 2 }]}>
                    默认只共享"从今往后"的新记录。打开后，以前的记录也会一并可见。
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Chip label="仅此后新记录（推荐）" active={!shareHistory} onPress={() => setShareHistory(false)} />
                <Chip label="包含历史记录" active={shareHistory} onPress={() => setShareHistory(true)} />
              </View>
              <View style={{ height: 12 }} />
              <Btn
                title="保存可见范围"
                onPress={() => {
                  if (pendingTier === myPeriod.tier && !shareHistory) {
                    store.toast('没有变化', 'info');
                    return;
                  }
                  void confirm({
                    title: '确认修改可见范围？',
                    message: `保存后 TA 将看到：\n${previewFor(pendingTier).join('\n')}`,
                    icon: '👀',
                    confirmText: '确认保存',
                  }).then((ok) => {
                    if (ok) store.setPeriodTier(pendingTier, shareHistory);
                  });
                }}
              />
            </Card>

            <SectionTitle title="授权记录" right={<Text style={font.tiny}>可查、可撤回</Text>} />
            {myPeriod.tierHistory.length === 0 ? (
              <Card>
                <Text style={font.small}>还没有授权变更记录。</Text>
              </Card>
            ) : (
              <Card>
                {[...myPeriod.tierHistory].reverse().map((h, idx) => (
                  <View
                    key={`${h.at}-${idx}`}
                    style={[styles.historyRow, idx > 0 ? styles.historyBorder : null]}
                  >
                    <View style={styles.historyDot} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={font.small}>
                        {TIER_META[h.from].label} → {TIER_META[h.to].label}
                        {h.shareHistory ? '（含历史）' : ''}
                      </Text>
                      <Text style={[font.tiny, { marginTop: 2 }]}>
                        {new Date(h.at).toLocaleString()} · 由 {h.byRole === role ? '我' : snapshot.members[h.byRole].name} 操作
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            <Btn
              title="一键撤回全部授权"
              variant="danger"
              onPress={() =>
                void confirm({
                  title: '撤回全部授权？',
                  message:
                    '撤回后 TA 会立刻看不到任何经期相关信息，且会收到一条"权限已更新"的通知（不含原因）。',
                  icon: '🔒',
                  confirmText: '确认撤回',
                  danger: true,
                }).then((ok) => {
                  if (ok) store.revokeAll();
                })
              }
            />
            <View style={{ height: 10 }} />
            <Btn
              title={myPeriod.predictionEnabled ? '关闭周期预测' : '开启周期预测'}
              variant="ghost"
              onPress={() => store.togglePrediction()}
            />
            <Disclaimer text={HEALTH_DISCLAIMER} />
          </>
        ) : null}

        <View style={{ height: 120 }} />
      </Screen>

      {/* 记录表单 */}
      <Sheet visible={recordSheet} title="记录一次经期" onClose={() => setRecordSheet(false)}>
        <NoticeBar
          tone={tint(color.careSoft)}
          ink={color.careInk}
          icon="🔒"
          text="这条记录默认只有你能看到，除非你在「授权设置」里主动放开。"
        />
        <Field label="开始日期（YYYY-MM-DD）" value={startDate} onChangeText={setStartDate} placeholder={today} />
        <Field
          label="结束日期（留空表示进行中）"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="例如 2026-03-09"
        />
        <Text style={[font.tiny, { marginBottom: 6 }]}>流量</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {(['light', 'medium', 'heavy'] as FlowLevel[]).map((f) => (
            <Chip key={f} label={FLOW_LABEL[f]} active={flow === f} onPress={() => setFlow(f)} />
          ))}
        </View>
        <Text style={[font.tiny, { marginBottom: 6 }]}>症状（可多选）</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {SYMPTOM_OPTIONS.map((s) => (
            <Chip key={s} label={s} active={symptoms.includes(s)} onPress={() => setSymptoms(toggleIn(symptoms, s))} />
          ))}
        </View>
        <Text style={[font.tiny, { marginBottom: 6 }]}>情绪（可多选）</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {MOOD_OPTIONS.map((m) => (
            <Chip key={m} label={m} active={moods.includes(m)} onPress={() => setMoods(toggleIn(moods, m))} />
          ))}
        </View>
        <Field label="备注（最多 200 字）" value={note} onChangeText={setNote} multiline maxLength={200} />
        <Btn
          title="保存"
          onPress={() => {
            const okSave = store.addPeriodRecord({
              startDate,
              endDate: endDate.trim() === '' ? null : endDate.trim(),
              flow,
              symptoms,
              moods,
              note,
            });
            if (okSave) setRecordSheet(false);
          }}
        />
        <View style={{ height: 8 }} />
        <Text style={[font.tiny, { textAlign: 'center' }]}>{HEALTH_DISCLAIMER}</Text>
      </Sheet>

      <Sheet visible={reminderOpen} title="设置提醒" onClose={() => setReminderOpen(false)}>
        <Text style={[font.tiny, { marginBottom: 6 }]}>类型</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          {(
            [
              ['water', '喝水'],
              ['medicine', '用药'],
              ['rest', '休息'],
            ] as const
          ).map(([k, label]) => (
            <Chip key={k} label={label} active={remKind === k} onPress={() => setRemKind(k)} />
          ))}
        </View>
        <Field label="时间（HH:mm）" value={remTime} onChangeText={setRemTime} placeholder="15:00" />
        <Field label="备注" value={remNote} onChangeText={setRemNote} placeholder="下午记得喝水" />
        <Btn
          title="保存提醒"
          onPress={() => {
            if (store.addCareReminder(remKind, remTime, remNote)) {
              setRemNote('');
              setReminderOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={planOpen} title="计划记录" onClose={() => setPlanOpen(false)}>
        <NoticeBar
          tone={tint(color.lavenderSoft)}
          ink={color.lavender}
          icon="🔒"
          text="仅记录，不做医疗判断；默认只有你能看到，可随时撤回共享。"
        />
        <Text style={[font.tiny, { marginBottom: 6 }]}>类型</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          <Chip label="备孕" active={planKind === 'prepare'} onPress={() => setPlanKind('prepare')} />
          <Chip label="避孕" active={planKind === 'contraception'} onPress={() => setPlanKind('contraception')} />
        </View>
        <Field label="日期（YYYY-MM-DD）" value={planDate} onChangeText={setPlanDate} placeholder={today} />
        <Field label="备注" value={planNote} onChangeText={setPlanNote} multiline />
        <Btn
          title="保存"
          onPress={() => {
            const r = store.hub.addPlanEntry(role, planKind, planDate, planNote);
            if (r.ok) {
              store.toast('记录已保存（默认仅我可见）', 'ok');
              setPlanNote('');
              setPlanOpen(false);
            } else {
              store.toast(r.error, 'error');
            }
          }}
        />
      </Sheet>

      <TabBar active="care" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  reliefRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  comfortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: color.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary },
  previewBox: {
    marginTop: 10,
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    padding: space.md,
  },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  historyBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.care,
    marginTop: 6,
  },
});
