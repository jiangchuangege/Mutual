import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { todayISO } from '../core/time';
import type { CardKind } from '../core/types';
import { useApp } from '../store';
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
} from '../ui/components';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, radius } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';
import { VoicePlayer, VoiceRecorder } from '../ui/voice';

/**
 * 一条生活点滴（日记）的评论区。
 *
 * 评论存在 `comments['moment:<日记id>']` 里，和别的日记、和影视评论完全隔离
 * （用户要求："每个评论区一定是隔离的不要串，就和弹幕一样"）。
 */
function DiaryComments({ diaryId }: { diaryId: string }) {
  const { store, role } = useApp();
  const [draft, setDraft] = useState('');
  const list = store.commentsFor('moment', diaryId);
  return (
    <View style={styles.commentBox}>
      <Text style={[font.tiny, { color: color.inkSoft }]}>评论 · {list.length}</Text>
      {list.map((c) => (
        <View key={c.id} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[font.tiny, { color: color.inkSoft, flex: 1 }]}>
              {c.byRole === role ? '我' : 'TA'} · {new Date(c.at).toLocaleString()}
            </Text>
            {c.byRole === role ? (
              <Pressable onPress={() => store.removeComment('moment', diaryId, c.id)} hitSlop={8}>
                <Text style={[font.tiny, { color: color.danger }]}>删</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[font.small, { marginTop: 2 }]}>{c.text}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="评论这条…"
          placeholderTextColor={color.inkFaint}
          maxLength={200}
          style={styles.commentInput}
        />
        <View style={{ width: 8 }} />
        <Pressable
          onPress={() => {
            if (draft.trim().length === 0) return;
            if (store.addComment('moment', diaryId, draft.trim())) setDraft('');
          }}
          style={styles.commentSend}
        >
          <Text style={[font.tiny, { color: '#FFFFFF', fontWeight: '700' }]}>发送</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Tab = 'cards' | 'daily' | 'voice' | 'diary' | 'review' | 'timeline';

const CARD_KINDS: Array<{ kind: CardKind; label: string; placeholder: string; needDetail: boolean }> = [
  { kind: 'thanks', label: '感谢卡', placeholder: '今天 TA 做了什么小事', needDetail: true },
  { kind: 'praise', label: '夸夸卡', placeholder: '具体夸哪件事（不要空泛彩虹屁）', needDetail: true },
  { kind: 'apology', label: '道歉卡', placeholder: '我想说的一句', needDetail: false },
  { kind: 'makeup', label: '和好卡', placeholder: '我们和好吧', needDetail: false },
  { kind: 'calm', label: '冷静卡', placeholder: '我需要缓一下', needDetail: false },
  { kind: 'hug', label: '抱抱卡', placeholder: '想对 TA 说的一句话（可以只写「抱一下」）', needDetail: false },
];

const CALM_OPTIONS = [
  { key: 'space', label: '需要空间' },
  { key: 'listen', label: '需要倾听' },
  { key: 'hug', label: '需要拥抱' },
];

export default function EmotionsScreen() {
  const router = useRouter();
  const { store, snapshot, role } = useApp();
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';
  const today = todayISO();
  const [tab, setTab] = useState<Tab>('cards');

  const [cardOpen, setCardOpen] = useState(false);
  const [cardKind, setCardKind] = useState<CardKind>('thanks');
  const [cardText, setCardText] = useState('');
  const [cardDetail, setCardDetail] = useState('');
  const [calmMeta, setCalmMeta] = useState('space');

  const [answer, setAnswer] = useState('');
  const [diaryText, setDiaryText] = useState('');
  const [reviewHappy, setReviewHappy] = useState('');
  const [reviewTrouble, setReviewTrouble] = useState('');
  const [reviewWant, setReviewWant] = useState('');
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeDate, setNodeDate] = useState(today);
  const [nodeNote, setNodeNote] = useState('');
  const [editingDiaryId, setEditingDiaryId] = useState<string | null>(null);
  const [diaryEditText, setDiaryEditText] = useState('');

  const daily = snapshot.dailyQuestion;
  const bothAnswered = !!daily?.answers.A && !!daily?.answers.B;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back title="我们的互动" subtitle="把想说的话，变成能点得到的东西" right={<DevicePills />}>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'cards', label: '卡片' },
            { value: 'daily', label: '每日一问' },
            { value: 'voice', label: '语音' },
            { value: 'diary', label: '日记' },
            { value: 'review', label: '复盘' },
            { value: 'timeline', label: '时间轴' },
          ]}
        />

        {/* ------------------------------ 卡片 ------------------------------ */}
        {tab === 'cards' ? (
          <>
            <View style={{ marginTop: 12 }}>
              <Btn title="＋ 写一张卡" onPress={() => setCardOpen(true)} />
            </View>
            <NoticeBar
              tone={tint(color.primarySoft)}
              ink={color.primaryInk}
              icon="💌"
              text="卡片发出即对 TA 可见，不支持撤回；发送前请确认内容。"
            />
            {snapshot.cards.length === 0 ? (
              <EmptyState emoji="💌" title="还没有卡片" desc="从今天一件小事开始。" actionLabel="写一张" onAction={() => setCardOpen(true)} />
            ) : (
              snapshot.cards.map((c) => {
                const meta = CARD_KINDS.find((k) => k.kind === c.kind);
                return (
                  <Card key={c.id} tone={c.kind === 'calm' ? color.butterSoft : surf('base')}>
                    <Text style={[font.tiny, { color: color.inkSoft }]}>
                      {meta?.label ?? c.kind} · 来自 {c.from === role ? '我' : snapshot.members[c.from].name} ·{' '}
                      {new Date(c.at).toLocaleDateString()}
                    </Text>
                    <Text style={[font.bodyStrong, { marginTop: 6 }]}>{c.text}</Text>
                    {c.detail ? <Text style={[font.small, { marginTop: 4 }]}>具体的事：{c.detail}</Text> : null}
                    {c.kind === 'calm' && c.meta ? (
                      <Text style={[font.small, { marginTop: 4, color: color.careInk }]}>
                        需要：{CALM_OPTIONS.find((o) => o.key === c.meta)?.label ?? c.meta}
                      </Text>
                    ) : null}
                    {c.replies.length > 0 ? (
                      <View style={{ marginTop: 8 }}>
                        {c.replies.map((r, i) => (
                          <Text key={`${r.at}-${i}`} style={[font.small, { color: color.inkSoft }]}>
                            {r.role === role ? '我' : snapshot.members[r.role].name}：{r.text}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {c.from !== role ? (
                      // 收到的那张卡：只给一次「收到啦」，收完就变成"你已经收到了"
                      // （以前按钮永远在，点几次都说"接受成功"——用户实测反馈）
                      <View style={{ marginTop: 10 }}>
                        {c.accepted ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[font.small, { color: color.ok, fontWeight: '700' }]}>
                              ✅ 你已经收到了
                            </Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Btn
                              title="收到啦"
                              small
                              style={{ flex: 1 }}
                              onPress={() => store.acceptCard(c.id)}
                            />
                            <Btn
                              title="回一句"
                              small
                              variant="ghost"
                              style={{ flex: 1 }}
                              onPress={() => store.replyCard(c.id, '收到，谢谢你')}
                            />
                          </View>
                        )}
                        {c.accepted && !c.replies.some((r) => r.role === role) ? (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <Btn
                              title="再回一句"
                              small
                              variant="ghost"
                              style={{ flex: 1 }}
                              onPress={() => store.replyCard(c.id, '收到，谢谢你')}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={[font.tiny, { marginTop: 8 }]}>
                        {c.accepted ? 'TA 已收到 ✅' : '等待 TA 回应'}
                      </Text>
                    )}
                  </Card>
                );
              })
            )}
          </>
        ) : null}

        {/* ---------------------------- 每日一问 ---------------------------- */}
        {tab === 'daily' ? (
          <>
            <Card style={{ marginTop: 12 }} tone={tint(color.skySoft)}>
              <Text style={[font.tiny, { color: color.inkMid }]}>今天的问题（{daily?.day ?? today}）</Text>
              <Text style={[font.h3, { marginTop: 6 }]}>{daily?.question ?? '今天最想被怎样关心？'}</Text>
            </Card>
            <Card>
              <Text style={[font.tiny, { marginBottom: 6 }]}>我的回答</Text>
              <Field label="" value={answer || (daily?.answers[role] ?? '')} onChangeText={setAnswer} placeholder="写一句就够" multiline />
              <Btn
                title={daily?.answers[role] ? '重新回答' : '提交回答'}
                onPress={() => {
                  store.answerDailyQuestion(answer || (daily?.answers[role] ?? ''));
                  setAnswer('');
                }}
              />
            </Card>
            <Card>
              <Text style={[font.tiny, { marginBottom: 6 }]}>TA 的回答</Text>
              {bothAnswered ? (
                <Text style={font.body}>{daily?.answers[partner]}</Text>
              ) : (
                <Text style={font.small}>
                  {daily?.answers[partner] ? 'TA 已答，等你答完才能互相看到' : 'TA 还没回答'}
                </Text>
              )}
            </Card>
          </>
        ) : null}

        {/* ------------------------------ 语音 ------------------------------ */}
        {tab === 'voice' ? (
          <>
            <Card style={{ marginTop: 12 }}>
              <Text style={font.bodyStrong}>录一段给 TA</Text>
              <Text style={[font.small, { marginTop: 4, marginBottom: 10 }]}>
                真实录音（需要麦克风权限），最多 60 秒；文件只留在本机，对方在自己的设备上播放自己的文件。
              </Text>
              <VoiceRecorder
                onDone={(uri, durationSec) => store.addVoiceNote(uri, durationSec, null)}
                onError={(msg) => store.toast(msg, 'error')}
              />
            </Card>
            {snapshot.voiceNotes.length === 0 ? (
              <EmptyState emoji="🎙️" title="还没有语音" desc="睡前留一句，比打字更有温度。" />
            ) : (
              snapshot.voiceNotes.map((v) => (
                <Card key={v.id}>
                  <Text style={font.bodyStrong}>
                    {v.from === role ? '我' : snapshot.members[v.from].name} 的语音 · {v.durationSec}s
                  </Text>
                  <Text style={[font.tiny, { marginTop: 2 }]}>
                    {new Date(v.at).toLocaleString()}
                    {v.deliverAt ? ` · 定时 ${new Date(v.deliverAt).toLocaleString()} 送达` : ''}
                    {v.listenedAt ? ' · 已听过' : ''}
                  </Text>
                  <VoicePlayer uri={v.uri} label={`${v.durationSec}s`} />
                  {v.from !== role && !v.listenedAt ? (
                    <View style={{ marginTop: 6 }}>
                      <Btn title="标记已听" small variant="ghost" onPress={() => store.markVoiceListened(v.id)} />
                    </View>
                  ) : null}
                </Card>
              ))
            )}
          </>
        ) : null}

        {/* ------------------------------ 日记 ------------------------------ */}
        {tab === 'diary' ? (
          <>
            <Card style={{ marginTop: 12 }}>
              <Text style={[font.tiny, { marginBottom: 6 }]}>今天写一段（仅你们两人可见）</Text>
              <Field label="" value={diaryText} onChangeText={setDiaryText} placeholder="今天想说的话" multiline />
              <Btn
                title="写进我们的日记"
                onPress={() => {
                  if (store.addDiaryEntry(diaryText)) setDiaryText('');
                }}
              />
              <Text style={[font.tiny, { marginTop: 8 }]}>
                注意：日记一旦写入就无法撤回——这是写之前就该知道的事。
              </Text>
            </Card>
            {snapshot.diary.map((d) => (
              <Card key={d.id}>
                <Text style={[font.tiny]}>{new Date(d.createdAt).toLocaleDateString()}</Text>
                {(['A', 'B'] as const).map((r) =>
                  d.body[r] ? (
                    <View key={r} style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[font.tiny, { color: color.inkSoft, flex: 1 }]}>
                          {r === role ? '我' : snapshot.members[r].name}
                          {d.editedAt && d.editedAt[r] ? ' · 已修改' : ''}
                        </Text>
                        {r === role ? (
                          <Pressable
                            onPress={() => {
                              setEditingDiaryId(d.id);
                              setDiaryEditText(d.body[r] ?? '');
                            }}
                          >
                            <Text style={[font.tiny, { color: color.primaryInk, fontWeight: '700' }]}>
                              编辑（改错别字）
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={[font.body, { marginTop: 2 }]}>{d.body[r]}</Text>
                    </View>
                  ) : null
                )}
                {/* 这条日记的评论区：key = moment:<日记 id>，和其它日记、和影视评论都互不串 */}
                <DiaryComments diaryId={d.id} />
              </Card>
            ))}
          </>
        ) : null}

        {/* ------------------------------ 复盘 ------------------------------ */}
        {tab === 'review' ? (
          <>
            <Card style={{ marginTop: 12 }}>
              <Text style={font.bodyStrong}>本周三问</Text>
              <Field label="① 这周最开心的一件事" value={reviewHappy} onChangeText={setReviewHappy} />
              <Field label="② 这周有点困扰的事" value={reviewTrouble} onChangeText={setReviewTrouble} />
              <Field label="③ 下周我想要" value={reviewWant} onChangeText={setReviewWant} />
              <Btn
                title="提交本周复盘"
                onPress={() => {
                  if (store.submitWeeklyReview(reviewHappy, reviewTrouble, reviewWant)) {
                    setReviewHappy('');
                    setReviewTrouble('');
                    setReviewWant('');
                  }
                }}
              />
            </Card>
            {snapshot.weeklyReviews.map((r) => (
              <Card key={r.id}>
                <Text style={[font.tiny]}>{r.weekKey}</Text>
                {(['A', 'B'] as const).map((side) => {
                  const ans = r.answers[side];
                  if (!ans) return null;
                  return (
                    <View key={side} style={{ marginTop: 8 }}>
                      <Text style={[font.tiny, { color: color.inkSoft }]}>
                        {side === role ? '我' : snapshot.members[side].name}
                      </Text>
                      <Text style={[font.small, { marginTop: 2 }]}>开心：{ans.happy || '—'}</Text>
                      <Text style={[font.small]}>困扰：{ans.trouble || '—'}</Text>
                      <Text style={[font.small]}>下周想要：{ans.want || '—'}</Text>
                    </View>
                  );
                })}
              </Card>
            ))}
          </>
        ) : null}

        {/* ----------------------------- 时间轴 ----------------------------- */}
        {tab === 'timeline' ? (
          <>
            <Card style={{ marginTop: 12 }}>
              <Field label="这个节点是" value={nodeTitle} onChangeText={setNodeTitle} placeholder="第一次一起旅行" />
              <Field label="日期（YYYY-MM-DD）" value={nodeDate} onChangeText={setNodeDate} />
              <Field label="当时发生了什么" value={nodeNote} onChangeText={setNodeNote} multiline />
              <Btn
                title="加到时间轴"
                onPress={() => {
                  if (store.addTimelineNode(nodeTitle, nodeDate, nodeNote, '💗')) {
                    setNodeTitle('');
                    setNodeNote('');
                  }
                }}
              />
            </Card>
            {snapshot.timeline.map((n) => (
              <Card key={n.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{n.emoji}</Text>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={font.bodyStrong}>{n.title}</Text>
                    <Text style={[font.small, { marginTop: 2 }]}>
                      {n.date} · {n.createdBy === role ? '我加的' : 'TA 加的'}
                    </Text>
                    {n.note ? <Text style={[font.small, { marginTop: 2 }]}>{n.note}</Text> : null}
                  </View>
                </View>
              </Card>
            ))}
          </>
        ) : null}

        <Sheet
          visible={editingDiaryId !== null}
          title="修改我的这一段"
          onClose={() => setEditingDiaryId(null)}
        >
          <NoticeBar
            tone={tint(color.butterSoft)}
            ink={color.careInk}
            icon="✏️"
            text="日记不能撤回，但可以改错别字；你只能改自己那一段，对方的段落动不了。"
          />
          <Field label="我的段落" value={diaryEditText} onChangeText={setDiaryEditText} multiline maxLength={500} />
          <Btn
            title="保存修改"
            onPress={() => {
              if (editingDiaryId && store.editDiaryEntry(editingDiaryId, diaryEditText)) {
                setEditingDiaryId(null);
              }
            }}
          />
        </Sheet>

        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 }} />
      </Screen>

      <Sheet visible={cardOpen} title="写一张卡" onClose={() => setCardOpen(false)}>
        <Text style={[font.tiny, { marginBottom: 6 }]}>卡片类型</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          {CARD_KINDS.map((k) => (
            <Chip
              key={k.kind}
              label={k.label}
              active={cardKind === k.kind}
              onPress={() => {
                setCardKind(k.kind);
                setCardDetail('');
              }}
            />
          ))}
        </View>
        <Field
          label="内容"
          value={cardText}
          onChangeText={setCardText}
          placeholder={CARD_KINDS.find((k) => k.kind === cardKind)?.placeholder ?? ''}
          multiline
        />
        {CARD_KINDS.find((k) => k.kind === cardKind)?.needDetail ? (
          <Field label="具体是哪件事（必须写）" value={cardDetail} onChangeText={setCardDetail} placeholder="例如：昨天帮我带了早饭" />
        ) : null}
        {cardKind === 'calm' ? (
          <>
            <Text style={[font.tiny, { marginBottom: 6 }]}>我需要</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              {CALM_OPTIONS.map((o) => (
                <Chip key={o.key} label={o.label} active={calmMeta === o.key} onPress={() => setCalmMeta(o.key)} />
              ))}
            </View>
          </>
        ) : null}
        <Btn
          title="发送"
          onPress={() => {
            if (store.sendCard(cardKind, cardText, cardDetail, cardKind === 'calm' ? calmMeta : '')) {
              setCardText('');
              setCardDetail('');
              setCardOpen(false);
            }
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  commentBox: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    paddingTop: 10,
  },
  commentInput: {
    flex: 1,
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: color.ink,
  },
  commentSend: {
    backgroundColor: color.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  root: { flex: 1, backgroundColor: color.bg },
});
