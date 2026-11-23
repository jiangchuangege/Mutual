import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { todayISO } from '../core/time';
import type { BoundaryCategory, RelStage, ValuesTopic } from '../core/types';
import { useApp } from '../store';
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  Field,
  NoticeBar,
  ProgressBar,
  Screen,
  SectionTitle,
  Sheet,
} from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, radius, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

const STAGE_LABEL: Record<RelStage, string> = {
  'getting-to-know': '了解中',
  dating: '恋爱中',
  cohabiting: '同居',
  engaged: '已订婚',
  married: '已婚',
};

const TOPIC_LABEL: Record<ValuesTopic, string> = {
  money: '金钱观',
  marriage: '婚姻',
  parenting: '育儿',
  eldercare: '养老',
  city: '居住城市',
  chores: '家务分工',
  familyBoundary: '原生家庭边界',
  career: '职业规划',
  fertility: '生育计划',
  housing: '买房还是租房',
  faith: '信仰与底线',
  social: '社交与朋友',
  consumption: '消费习惯',
  holidays: '假期安排',
  pets: '宠物',
  health: '健康与运动',
};

const BOUNDARY_LABEL: Record<BoundaryCategory, string> = {
  privacy: '隐私',
  social: '异性社交',
  money: '金钱',
  chores: '家务',
  conflict: '冲突',
  checkin: '报备',
};

export default function GrowthScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';
  const today = todayISO();

  // 7.1 关系档案
  const [profileOpen, setProfileOpen] = useState(false);
  const [meetMethod, setMeetMethod] = useState(snapshot.relProfile.meetMethod);
  const [firstDate, setFirstDate] = useState(snapshot.relProfile.firstDate || today);
  const [stage, setStage] = useState<RelStage>(snapshot.relProfile.stage);

  // 7.3 价值观
  const [valuesOpen, setValuesOpen] = useState(false);
  const [topic, setTopic] = useState<ValuesTopic>('money');
  const [draft, setDraft] = useState('');
  const [consensus, setConsensus] = useState(snapshot.valuesCard.consensus);

  // 7.4 目标
  const [planOpen, setPlanOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planDate, setPlanDate] = useState('');

  // 7.5 边界
  const [boundOpen, setBoundOpen] = useState(false);
  const [boundCat, setBoundCat] = useState<BoundaryCategory>('privacy');
  const [boundText, setBoundText] = useState('');

  // 7.6 冲突
  const [conflictOpen, setConflictOpen] = useState(false);
  const [trigger, setTrigger] = useState('');
  const [activeConflict, setActiveConflict] = useState<string | null>(null);
  const [fieldText, setFieldText] = useState('');
  const [ritual, setRitual] = useState('');

  // 7.7 自评
  const [assessOpen, setAssessOpen] = useState(false);
  const [sat, setSat] = useState(3);
  const [sec, setSec] = useState(3);
  const [com, setCom] = useState(3);
  const [fair, setFair] = useState(3);

  // 7.8 投票
  const [voteOpen, setVoteOpen] = useState(false);
  const [voteTitle, setVoteTitle] = useState('');
  const [voteOptions, setVoteOptions] = useState('');

  // 7.10 异地
  const ldr = snapshot.ldr;

  const myAssess = snapshot.mySelfAssess;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title="我们的关系" subtitle="把难开口的事，放进能点得到的地方" right={<DevicePills />}>
        {/* ---------------- 7.1 关系档案 ---------------- */}
        <SectionTitle title="关系档案" right={<Btn title="编辑" small variant="ghost" onPress={() => setProfileOpen(true)} />} />
        <Card>
          <Text style={font.bodyStrong}>
            {snapshot.relProfile.meetMethod || '还没填相识方式'}
          </Text>
          <Text style={[font.small, { marginTop: 4 }]}>
            阶段：{STAGE_LABEL[snapshot.relProfile.stage]} · 第一次约会：
            {snapshot.relProfile.firstDate || '未填'}
          </Text>
          <Text style={[font.tiny, { marginTop: 4 }]}>
            已提交：{snapshot.relProfile.submittedBy.map((r) => snapshot.members[r].name).join('、') || '无'}
            {' · '}
            已确认：{snapshot.relProfile.confirmedBy.map((r) => snapshot.members[r].name).join('、') || '无'}
          </Text>
          {snapshot.relProfile.submittedBy.length === 2 && !snapshot.relProfile.confirmedBy.includes(role) ? (
            <View style={{ marginTop: 10 }}>
              <Btn title="我也确认这份档案" small onPress={() => store.confirmRelProfile()} />
            </View>
          ) : null}
        </Card>

        {/* ---------------- 7.3 价值观沟通卡 ---------------- */}
        <SectionTitle
          title="重大价值观沟通卡"
          right={<Btn title="填写" small variant="ghost" onPress={() => setValuesOpen(true)} />}
        />
        <Card>
          <Text style={[font.small]}>
            {snapshot.valuesCard.revealed
              ? '双方已互相揭示，可以一起写共识'
              : '未揭示前，你只能看到自己的草稿（防止被对方答案带跑）'}
          </Text>
          {snapshot.valuesCard.revealed
            ? (Object.keys(TOPIC_LABEL) as ValuesTopic[]).map((t) => (
                <View key={t} style={styles.row}>
                  <Text style={[font.tiny, { width: 64 }]}>{TOPIC_LABEL[t]}</Text>
                  <Text style={[font.small, { flex: 1 }]}>
                    我：{snapshot.valuesCard.drafts[role]?.[t] ?? '—'}
                    {'\n'}TA：{snapshot.valuesCard.drafts[partner]?.[t] ?? '—'}
                  </Text>
                </View>
              ))
            : (Object.keys(TOPIC_LABEL) as ValuesTopic[]).map((t) => (
                <View key={t} style={styles.row}>
                  <Text style={[font.tiny, { width: 64 }]}>{TOPIC_LABEL[t]}</Text>
                  <Text style={[font.small, { flex: 1 }]}>{snapshot.valuesCard.drafts[role]?.[t] ?? '未填'}</Text>
                </View>
              ))}
          {snapshot.valuesCard.revealed ? (
            <>
              <View style={{ height: 10 }} />
              <Text style={[font.tiny]}>我们的共识</Text>
              <Field label="" value={consensus} onChangeText={setConsensus} placeholder="写下一句你们都认可的话" />
              <Btn title="保存共识" small onPress={() => store.saveValuesConsensus(consensus)} />
            </>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Btn title="双方都写完了？互相揭示" small variant="soft" onPress={() => store.revealValues()} />
            </View>
          )}
        </Card>

        {/* ---------------- 7.4 共同目标 ---------------- */}
        <SectionTitle title="共同目标与未来规划" right={<Btn title="＋ 目标" small variant="ghost" onPress={() => setPlanOpen(true)} />} />
        {snapshot.plans.length === 0 ? (
          <EmptyState emoji="🗺️" title="还没有共同目标" desc="同居、结婚、买房、存钱都算。" actionLabel="加一个" onAction={() => setPlanOpen(true)} />
        ) : (
          snapshot.plans.map((p) => (
            <Card key={p.id}>
              <Text style={font.bodyStrong}>{p.title}</Text>
              <Text style={[font.small, { marginTop: 4 }]}>
                阶段：{p.stage === 'discuss' ? '讨论中' : p.stage === 'confirmed' ? '已确认' : '已完成'}
                {p.targetDate ? ` · 目标日期 ${p.targetDate}` : ''}
              </Text>
              {p.notes ? <Text style={[font.small, { marginTop: 2 }]}>{p.notes}</Text> : null}
              <Text style={[font.tiny, { marginTop: 4 }]}>
                已确认：{p.confirmedBy.map((r) => snapshot.members[r].name).join('、') || '无'}（双方都确认才转「已确认」）
              </Text>
              {!p.confirmedBy.includes(role) ? (
                <View style={{ marginTop: 10 }}>
                  <Btn title="我确认" small onPress={() => store.confirmPlanItem(p.id)} />
                </View>
              ) : null}
            </Card>
          ))
        )}

        {/* ---------------- 7.5 边界契约 ---------------- */}
        <SectionTitle title="情侣边界与契约" right={<Btn title="＋ 约定" small variant="ghost" onPress={() => setBoundOpen(true)} />} />
        <NoticeBar tone={tint(color.butterSoft)} ink={color.careInk} icon="📄" text="这是你们之间的约定，不具备法律效力；任何一条都可以随时再议。" />
        {snapshot.boundaries.map((b) => (
          <Card key={b.id}>
            <Text style={[font.tiny]}>{BOUNDARY_LABEL[b.category]}</Text>
            <Text style={[font.bodyStrong, { marginTop: 4 }]}>{b.text}</Text>
            <Text style={[font.tiny, { marginTop: 6 }]}>
              我：{b.agreements[role] === 'agree' ? '认同' : b.agreements[role] === 'change' ? '想改' : '未表态'}
              {' · '}
              TA：{b.agreements[partner] === 'agree' ? '认同' : b.agreements[partner] === 'change' ? '想改' : '未表态'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Btn title="我认同" small style={{ flex: 1 }} onPress={() => store.setBoundaryAgreement(b.id, 'agree')} />
              <Btn title="我想改" small variant="ghost" style={{ flex: 1 }} onPress={() => store.setBoundaryAgreement(b.id, 'change')} />
            </View>
          </Card>
        ))}

        {/* ---------------- 7.6 冲突修复 ---------------- */}
        <SectionTitle title="冲突修复流程" right={<Btn title="＋ 记录一次" small variant="ghost" onPress={() => setConflictOpen(true)} />} />
        {snapshot.conflicts.length === 0 ? (
          <EmptyState emoji="🩹" title="没有未处理的冲突" desc="有摩擦时走一次流程，比各自憋着好。" actionLabel="记录一次" onAction={() => setConflictOpen(true)} />
        ) : (
          snapshot.conflicts.map((c) => (
            <Card key={c.id} tone={c.resolvedAt ? surf('base') : color.butterSoft}>
              <Text style={font.bodyStrong}>{c.trigger}</Text>
              <Text style={[font.small, { marginTop: 4 }]}>
                我的感受：{c.feelings[role] ?? '未填'} · 我的需要：{c.needs[role] ?? '未填'}
              </Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                TA 的感受：{c.feelings[partner] ?? '未填'}
              </Text>
              <Text style={[font.tiny, { marginTop: 4 }]}>
                阶段 {c.stage}/5 {c.calmUsed ? '· 用过冷静卡' : ''} {c.resolvedAt ? `· 已收尾（${c.ritual}）` : '· 进行中'}
              </Text>
              {!c.resolvedAt ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn
                    title="填写我的部分"
                    small
                    style={{ flex: 1 }}
                    onPress={() => {
                      setActiveConflict(c.id);
                      setFieldText(c.feelings[role] ?? '');
                    }}
                  />
                  <Btn title="发冷静卡" small variant="ghost" style={{ flex: 1 }} onPress={() => store.markConflictCalm(c.id)} />
                </View>
              ) : null}
            </Card>
          ))
        )}

        {/* ---------------- 7.7 关系健康自评 ---------------- */}
        <SectionTitle title="关系健康自评" right={<Btn title="自评" small variant="ghost" onPress={() => setAssessOpen(true)} />} />
        <Card>
          {myAssess ? (
            <>
              <Text style={[font.small]}>最近一次：{new Date(myAssess.at).toLocaleDateString()}</Text>
              {[
                ['满意度', myAssess.satisfaction],
                ['安全感', myAssess.security],
                ['沟通', myAssess.communication],
                ['家务公平', myAssess.fairness],
              ].map(([label, value]) => (
                <View key={String(label)} style={{ marginTop: 8 }}>
                  <Text style={font.tiny}>
                    {label}：{value}/5
                  </Text>
                  <View style={{ marginTop: 4 }}>
                    <ProgressBar value={Number(value) / 5} tone={tint(color.lavender)} />
                  </View>
                </View>
              ))}
              {myAssess.history.length > 0 ? (
                <Text style={[font.tiny, { marginTop: 10 }]}>已保留 {myAssess.history.length} 次历史，仅你自己可见</Text>
              ) : null}
            </>
          ) : (
            <Text style={font.small}>还没有自评。这里只有你能看到，对方永远拿不到分数。</Text>
          )}
        </Card>

        {/* ---------------- 7.8 共同投票 ---------------- */}
        <SectionTitle title="共同决策投票" right={<Btn title="＋ 发起" small variant="ghost" onPress={() => setVoteOpen(true)} />} />
        {snapshot.votes.map((v) => {
          /*
           * 匿名投票的投影里没有"对方投了什么"，只有每个选项的票数（tallies）
           * 和我自己的那一票。所以票数和平票都要按票数算，不能再看 A/B 两个格子。
           */
          const tallies = (v as { tallies?: Record<string, number> }).tallies;
          const countOf = (optionId: string): number => {
            if (tallies) return tallies[optionId] ?? 0;
            return (v.votes.A === optionId ? 1 : 0) + (v.votes.B === optionId ? 1 : 0);
          };
          const totalVotes = v.options.reduce((n, o) => n + countOf(o.id), 0);
          const maxCount = Math.max(0, ...v.options.map((o) => countOf(o.id)));
          const tie = totalVotes >= 2 && maxCount > 0 && v.options.filter((o) => countOf(o.id) === maxCount).length > 1;
          return (
            <Card key={v.id}>
              <Text style={font.bodyStrong}>{v.title}</Text>
              <Text style={[font.tiny, { marginTop: 2 }]}>
                发起人：{v.createdBy === role ? '我' : snapshot.members[v.createdBy].name}
                {v.anonymous ? ' · 匿名' : ''}
              </Text>
              {v.options.map((o) => {
                const chosen = v.votes[role] === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => store.castVote(v.id, o.id)}
                    style={[styles.voteRow, chosen ? { backgroundColor: color.primarySoft } : null]}
                  >
                    <Text style={[font.small, { flex: 1, color: chosen ? color.primaryInk : color.inkMid }]}>
                      {o.label}
                    </Text>
                    <Text style={[font.tiny]}>
                      {v.anonymous
                        ? `${countOf(o.id)} 票${v.votes[role] === o.id ? ' · 我投的' : ''}`
                        : v.votes.A === o.id
                          ? 'A'
                          : v.votes.B === o.id
                            ? 'B'
                            : ''}
                    </Text>
                  </Pressable>
                );
              })}
              {tie ? <Text style={[font.tiny, { color: color.danger, marginTop: 6 }]}>平票：需要你们再谈一次，不自动裁决</Text> : null}
            </Card>
          );
        })}

        {/* ---------------- 7.10 异地模式 ---------------- */}
        <SectionTitle title="异地模式与见面计划" />
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="开启异地模式" active={ldr.enabled} onPress={() => store.setLdr({ enabled: !ldr.enabled })} />
          </View>
          {ldr.enabled ? (
            <>
              <Text style={[font.small, { marginTop: 8 }]}>
                下次见面：{ldr.nextMeetDate || '未定'} · 车票：{ldr.ticket || '未填'}
              </Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                本次预算：¥{(ldr.budgetCents / 100).toFixed(0)} · 清单 {ldr.checklist.length} 项
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Btn
                  title="记下次见面（+7 天）"
                  small
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    store.setLdr({ nextMeetDate: d.toISOString().slice(0, 10) });
                  }}
                />
                <Btn
                  title="加一条见面清单"
                  small
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => store.setLdr({ checklist: [...ldr.checklist, `清单项 ${ldr.checklist.length + 1}`] })}
                />
              </View>
            </>
          ) : (
            <Text style={[font.small, { marginTop: 6 }]}>开启后首页会显示见面倒计时。</Text>
          )}
        </Card>

        {/* ---------------- 7.18 里程碑与成就 ---------------- */}
        <SectionTitle title="里程碑与双人成就" />
        <Card>
          {snapshot.achievements.length === 0 ? (
            <Text style={font.small}>还没有解锁的成就。这里不会有排行榜，也不会和其他人比较。</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {snapshot.achievements.map((a) => (
                <View key={a.id} style={styles.achCell}>
                  <Text style={{ fontSize: 20 }}>{a.emoji}</Text>
                  <Text style={[font.tiny, { marginTop: 4, textAlign: 'center' }]}>{a.label}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
          <Btn title="里程碑清单" small variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/collection?kind=milestone')} />
          <Btn title="关怀日程" small variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/collection?kind=careEvent')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Btn title="成长计划" small variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/collection?kind=growthPlan')} />
          <Btn title="共同资产" small variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/collection?kind=jointAsset')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Btn title="家庭节日" small variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/collection?kind=familyHoliday')} />
          <Btn title="信任与安全" small style={{ flex: 1 }} onPress={() => router.push('/trust')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Btn title="年度报告" small variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/annual')} />
        </View>

        <View style={{ height: 60 }} />
      </Screen>

      {/* 关系档案 */}
      <Sheet visible={profileOpen} title="关系档案" onClose={() => setProfileOpen(false)}>
        <Field label="怎么认识的" value={meetMethod} onChangeText={setMeetMethod} placeholder="朋友的生日聚会" />
        <Field label="第一次约会（YYYY-MM-DD）" value={firstDate} onChangeText={setFirstDate} placeholder={today} />
        <Text style={[font.tiny, { marginBottom: 6 }]}>关系阶段</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {(Object.keys(STAGE_LABEL) as RelStage[]).map((s) => (
            <Chip key={s} label={STAGE_LABEL[s]} active={stage === s} onPress={() => setStage(s)} />
          ))}
        </View>
        <Btn
          title="提交（双方提交后才能确认）"
          onPress={() => {
            if (store.saveRelProfile({ meetMethod, firstDate, stage, milestones: snapshot.relProfile.milestones })) {
              setProfileOpen(false);
            }
          }}
        />
      </Sheet>

      {/* 价值观草稿 */}
      <Sheet visible={valuesOpen} title="我的价值观草稿" onClose={() => setValuesOpen(false)}>
        <NoticeBar tone={tint(color.lavenderSoft)} ink={color.lavender} icon="🔒" text="草稿只有你自己能看到；双方都写完才允许互相揭示。" />
        <Text style={[font.tiny, { marginBottom: 6 }]}>主题</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {(Object.keys(TOPIC_LABEL) as ValuesTopic[]).map((t) => (
            <Chip
              key={t}
              label={TOPIC_LABEL[t]}
              active={topic === t}
              onPress={() => {
                setTopic(t);
                setDraft(snapshot.valuesCard.drafts[role]?.[t] ?? '');
              }}
            />
          ))}
        </View>
        <Field label={`${TOPIC_LABEL[topic]}：我的想法`} value={draft} onChangeText={setDraft} multiline placeholder="我希望…" />
        <Btn
          title="保存草稿"
          onPress={() => {
            store.saveValuesDraft(topic, draft);
            setValuesOpen(false);
          }}
        />
      </Sheet>

      {/* 目标 */}
      <Sheet visible={planOpen} title="加一个共同目标" onClose={() => setPlanOpen(false)}>
        <Field label="目标" value={planTitle} onChangeText={setPlanTitle} placeholder="明年搬到同一个城市" />
        <Field label="目标日期（可不填）" value={planDate} onChangeText={setPlanDate} placeholder="2027-06-01" />
        <Btn
          title="加入看板"
          onPress={() => {
            if (store.addPlanItem(planTitle, planDate || null, [role, partner], '')) {
              setPlanTitle('');
              setPlanDate('');
              setPlanOpen(false);
            }
          }}
        />
      </Sheet>

      {/* 边界 */}
      <Sheet visible={boundOpen} title="加一条约定" onClose={() => setBoundOpen(false)}>
        <Text style={[font.tiny, { marginBottom: 6 }]}>类别</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {(Object.keys(BOUNDARY_LABEL) as BoundaryCategory[]).map((c) => (
            <Chip key={c} label={BOUNDARY_LABEL[c]} active={boundCat === c} onPress={() => setBoundCat(c)} />
          ))}
        </View>
        <Field label="具体约定" value={boundText} onChangeText={setBoundText} multiline placeholder="不翻对方手机，但重要的事要主动说" />
        <Btn
          title="加入契约"
          onPress={() => {
            if (store.addBoundary(boundCat, boundText)) {
              setBoundText('');
              setBoundOpen(false);
            }
          }}
        />
      </Sheet>

      {/* 冲突 */}
      <Sheet visible={conflictOpen} title="记录一次冲突" onClose={() => setConflictOpen(false)}>
        <Field label="发生了什么" value={trigger} onChangeText={setTrigger} multiline placeholder="周末安排没商量好" />
        <Btn
          title="开始走流程"
          onPress={() => {
            if (store.startConflict(trigger)) {
              setTrigger('');
              setConflictOpen(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={activeConflict !== null} title="我的感受与需要" onClose={() => setActiveConflict(null)}>
        <Field label="我的感受" value={fieldText} onChangeText={setFieldText} multiline placeholder="我觉得被忽略了" />
        <Btn
          title="保存感受"
          onPress={() => {
            if (activeConflict) store.setConflictField(activeConflict, 'feelings', fieldText);
          }}
        />
        <View style={{ height: 10 }} />
        <Btn
          title="保存为「我的需要」"
          variant="ghost"
          onPress={() => {
            if (activeConflict) store.setConflictField(activeConflict, 'needs', fieldText);
          }}
        />
        <View style={{ height: 14 }} />
        <Field label="和好仪式" value={ritual} onChangeText={setRitual} placeholder="一起下楼买杯奶茶" />
        <Btn
          title="这次到这里（需双方都写了感受）"
          variant="soft"
          onPress={() => {
            if (activeConflict) {
              store.resolveConflict(activeConflict, ritual);
              setActiveConflict(null);
            }
          }}
        />
      </Sheet>

      {/* 自评 */}
      <Sheet visible={assessOpen} title="关系健康自评" onClose={() => setAssessOpen(false)}>
        <NoticeBar tone={tint(color.lavenderSoft)} ink={color.lavender} icon="🔒" text="只有你能看到这些分数，对方永远拿不到，也不会出现在任何报告里。" />
        {([
          ['满意度', sat, setSat],
          ['安全感', sec, setSec],
          ['沟通', com, setCom],
          ['家务公平', fair, setFair],
        ] as Array<[string, number, (v: number) => void]>).map(([label, value, setter]) => (
          <View key={String(label)} style={{ marginBottom: 10 }}>
            <Text style={[font.tiny, { marginBottom: 6 }]}>
              {label}：{value as number}/5
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => (setter as (v: number) => void)(n)}
                  style={[styles.scoreCell, (value as number) >= n ? { backgroundColor: color.lavender } : null]}
                >
                  <Text style={[font.tiny, { color: (value as number) >= n ? '#FFF' : color.inkSoft }]}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Btn
          title="保存（仅我可见）"
          onPress={() => {
            store.saveSelfAssess({ satisfaction: sat, security: sec, communication: com, fairness: fair });
            setAssessOpen(false);
          }}
        />
      </Sheet>

      {/* 投票 */}
      <Sheet visible={voteOpen} title="发起投票" onClose={() => setVoteOpen(false)}>
        <Field label="投什么" value={voteTitle} onChangeText={setVoteTitle} placeholder="周末去哪" />
        <Field
          label="选项（用顿号或逗号分隔）"
          value={voteOptions}
          onChangeText={setVoteOptions}
          placeholder="爬山、看电影、在家躺着"
        />
        <Btn
          title="发起"
          onPress={() => {
            const options = voteOptions
              .split(/[、,，\s]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (store.createVote(voteTitle, options, false)) {
              setVoteTitle('');
              setVoteOptions('');
              setVoteOpen(false);
            }
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  row: { flexDirection: 'row', marginTop: 8, alignItems: 'flex-start' },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    marginTop: 6,
    backgroundColor: surf('alt'),
  },
  achCell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  scoreCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
  },
});
