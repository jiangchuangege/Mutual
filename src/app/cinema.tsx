/**
 * 影院（二次元夜景版）
 *
 * 说明：这个文件在一次批量改写事故里被误伤，恢复时重建了界面层。
 * 功能与之前完全一致：房间（开房/申请加入/同意/解散）、一起看队列、我们的片单、
 * 选片与预约、看片规矩、电视直播入口都保留；只是把外观统一回夜景玻璃风格。
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCountdown, formatDuration } from '../core/time';
import type { RoomState } from '../core/types';
import { useApp } from '../store';
import { Aurora, Glass } from '../ui/Aurora';
import { Btn, Field, Sheet, useConfirm } from '../ui/components';
import { Ico } from '../ui/icons';
import { night, nightFont } from '../ui/nightTheme';
import { NightPill } from '../ui/NightSky';
import { TabBar } from '../ui/TabBar';
import { pageBg } from '../ui/theme';

const STATE_LABEL: Record<RoomState, string> = {
  CREATED: '房间已创建',
  WAITING_PEER: '等待 TA 加入',
  PEER_REQUESTED: '等 TA 同意加入',
  PREPARING: '片源准备中',
  COUNTDOWN: '即将开始',
  PLAYING: '观影中',
  PAUSED: '已暂停',
  PEER_OFFLINE: 'TA 暂时掉线',
  WAITING_RECONNECT: '等待重连中',
  ENDED: '已结束',
  RECAP: '回忆卡',
  DISSOLVED: '已解散',
  EXPIRED: '邀请已过期',
};

const QUICK_PICKS = ['一起看部老片', '随便挑一部', '想看的剧第 2 集'];

const RULES = [
  '只有你们两个人能进，第 3 个人一定进不来',
  '邀请链接不显示片名，通知也不显示',
  '语音不录音、不保存，房间结束即销毁',
  '同步精度目标 ±1.5 秒，不承诺帧级同步',
];

export default function CinemaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { store, snapshot, role } = useApp();
  const partner = role === 'A' ? 'B' : 'A';
  const room = snapshot.activeRoom;

  const [createSheet, setCreateSheet] = useState(false);
  const [title, setTitle] = useState('');
  const [joinSheet, setJoinSheet] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const confirm = useConfirm();

  const liveCount = (store.liveSourceUrls ?? []).length;
  const queue = snapshot.watchQueue ?? [];
  const recaps = snapshot.recaps ?? [];

  return (
    <View style={[styles.root, { backgroundColor: pageBg(night.bgDeep) }]}>
      {/* 不再叠 NightBackdrop：底色交给 Aurora 的壁纸层（自己上传的 MP4 或影院专属壁纸） */}
      <Aurora which={1} useCustom />

      {/* 标题固定在最上面（不跟内容一起滚，避开状态栏） */}
      <View style={[styles.headerRow, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={nightFont.hero}>影院</Text>
          <Text style={[nightFont.small, { marginTop: 3 }]}>
            各自打开片源，App 只同步播放进度
          </Text>
        </View>
        <NightPill label={role === 'A' ? '我开房' : 'TA 开房'} tone="violet" />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: 8,
          paddingBottom: 130,
        }}
        showsVerticalScrollIndicator={false}
      >

        {/* 电视直播入口 */}
        <Glass style={{ marginTop: 14 }}>
          <Pressable onPress={() => router.push('/live')} style={styles.liveRow}>
            <View style={styles.liveIcon}>
              <Ico name="live" size={20} color={night.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={nightFont.h2}>
                打开电视直播（{liveCount} 个直播源）
              </Text>
              <Text style={[nightFont.small, { marginTop: 3 }]}>
                电视直播是独立模块，频道和片库互不影响
              </Text>
            </View>
            <Text style={[nightFont.h2, { color: night.cyan }]}>›</Text>
          </Pressable>
        </Glass>

        <Pressable
          onPress={() => router.push('/live-sources')}
          style={styles.outlineBtn}
        >
          <Text style={[nightFont.bodyStrong, { color: night.textDim }]}>
            管理直播源（支持 m3u / txt，可多个）
          </Text>
        </Pressable>

        {/* 焦焦FM 入口：听书 / 故事 / 有声小说，和影院/直播各用各的数据 */}
        <Glass style={{ marginTop: 10 }}>
          <Pressable onPress={() => router.push('/jiaojiao-fm')} style={styles.liveRow}>
            <View style={styles.liveIcon}>
              <Ico name="fm" size={20} color={night.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={nightFont.h2}>打开焦焦FM</Text>
              <Text style={[nightFont.small, { marginTop: 3 }]}>
                一起听书、故事、有声小说（独立模块）
              </Text>
            </View>
            <Text style={[nightFont.h2, { color: night.gold }]}>›</Text>
          </Pressable>
        </Glass>

        {/* 在线片库（影库）入口：海报墙 + 搜索，挑片直接进一起看队列 */}
        <Glass style={{ marginTop: 10 }}>
          <Pressable onPress={() => router.push('/cinema-library')} style={styles.liveRow}>
            <View style={styles.liveIcon}>
              <Ico name="cinema" size={20} color={night.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={nightFont.h2}>打开在线片库（影库）</Text>
              <Text style={[nightFont.small, { marginTop: 3 }]}>
                海报墙 + 搜索，挑一部直接加入一起看队列
              </Text>
            </View>
            <Text style={[nightFont.h2, { color: night.cyan }]}>›</Text>
          </Pressable>
        </Glass>

        {/* 当前房间 */}
        {room ? (
          <Glass style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ico name="cinema" size={20} color={night.gold} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={nightFont.h2}>{STATE_LABEL[room.state]}</Text>
                <Text style={[nightFont.small, { marginTop: 3 }]}>
                  {room.movieTitle} · 开房的人：{room.leaderRole === role ? '我' : 'TA'}
                </Text>
              </View>
              <Pressable onPress={() => router.push('/room')}>
                <Text style={[nightFont.h2, { color: night.cyan }]}>进入 ›</Text>
              </Pressable>
            </View>

            {/* 不用邀请码：TA 开的房，我直接申请；TA 同意后进房 */}
            {room.leaderRole !== role ? (
              <View style={{ marginTop: 12 }}>
                {room.peerJoinedAt !== null ? (
                  <Btn title="进入房间" small onPress={() => router.push('/room')} />
                ) : room.joinRequestedBy === role ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={[nightFont.small, { flex: 1 }]}>
                      已申请加入，等 TA 点同意（不用邀请码）
                    </Text>
                    <Pressable onPress={() => store.declineJoinRoom()} hitSlop={8}>
                      <Text style={[nightFont.bodyStrong, { color: night.danger }]}>撤回</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Btn title="加入房间（TA 同意即可）" small onPress={() => store.requestJoinRoom()} />
                )}
              </View>
            ) : room.joinRequestedBy && room.joinRequestedBy !== role ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn
                  title="同意 TA 进来"
                  small
                  style={{ flex: 1 }}
                  onPress={() => store.approveJoinRoom()}
                />
                <Btn
                  title="拒绝"
                  small
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => store.declineJoinRoom()}
                />
              </View>
            ) : (
              <Text style={[nightFont.small, { marginTop: 10 }]}>
                房间 #{room.code} · 有效期剩余 {formatCountdown(room.expireAt - Date.now())} ·
                TA 那边点一下就能申请进来
              </Text>
            )}
          </Glass>
        ) : null}

        {/* 一起看队列 */}
        <View style={styles.sectionRow}>
          <Text style={nightFont.h2}>一起看队列</Text>
          <Text style={nightFont.tiny}>{queue.length} 项</Text>
        </View>
        <Pressable onPress={() => router.push('/cinema-queue')} style={styles.outlineBtn}>
          <Text style={[nightFont.bodyStrong, { color: queue.length === 0 ? night.textFaint : night.text }]}>
            {queue.length === 0 ? '一起看队列（空的，去片库加）' : `管理一起看队列（${queue.length} 项）`}
          </Text>
        </Pressable>
        <Text style={[nightFont.small, { marginTop: 6 }]}>
          队列是两人共用的：能看到双方加进来的每一集，能单条删、能清空，点一条直接开播。
        </Text>

        {/* 我们的片单 */}
        <View style={styles.sectionRow}>
          <Text style={nightFont.h2}>我们的片单</Text>
          <Text style={nightFont.tiny}>{recaps.length} 次观影记录</Text>
        </View>
        {recaps.length === 0 ? (
          <Glass>
            <Text style={nightFont.small}>看过的电影会在这里留下回忆卡（仅你们两人可见）。</Text>
          </Glass>
        ) : (
          recaps.map((r) => (
            <Glass key={r.id} style={{ marginTop: 8 }}>
              <Text style={nightFont.h2}>{r.movieTitle}</Text>
              <Text style={[nightFont.small, { marginTop: 4 }]}>
                {new Date(r.endedAt).toLocaleDateString()} · 时长 {formatDuration(r.durationSec)} ·{' '}
                {r.saved.length === 2 ? '已保存到回忆' : '草稿'}
              </Text>
              <Text style={[nightFont.small, { marginTop: 2 }]}>
                评分：我 {r.ratings[role] ?? '—'} 星 · TA {r.ratings[partner] ?? '—'} 星
              </Text>
              {r.reviews[role] || r.reviews[partner] ? (
                <Text style={[nightFont.body, { marginTop: 6 }]}>
                  「{r.reviews[role] ?? r.reviews[partner] ?? ''}」
                </Text>
              ) : null}
            </Glass>
          ))
        )}

        {/* 一起看电影 */}
        <View style={styles.sectionRow}>
          <Text style={nightFont.h2}>一起看电影</Text>
        </View>
        <Pressable
          onPress={() => (room ? router.push('/room') : setCreateSheet(true))}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>{room ? '进入当前房间' : '创建房间'}</Text>
        </Pressable>
        {room ? (
          <Pressable
            onPress={() =>
              void confirm({
                title: '解散这个观影房间？',
                message: '房间会立即关闭，TA 那边也会同步消失；还没保存的评分和短评不会进入回忆。',
                icon: '🎬',
                confirmText: '解散房间',
                danger: true,
              }).then((ok) => {
                if (ok) store.cancelRoom();
              })
            }
            style={[styles.outlineBtn, { marginTop: 8, borderColor: night.danger }]}
          >
            <Text style={[nightFont.bodyStrong, { color: night.danger }]}>解散当前房间</Text>
          </Pressable>
        ) : null}

        {/* 选片与预约 */}
        <View style={styles.sectionRow}>
          <Text style={nightFont.h2}>选片与预约</Text>
        </View>
        <Pressable onPress={() => router.push('/cinema-plan')} style={styles.outlineBtn}>
          <Text style={[nightFont.bodyStrong, { color: night.textDim }]}>一起选片 · 预约观影</Text>
        </Pressable>

        {/* 看片规矩 */}
        <View style={styles.sectionRow}>
          <Text style={nightFont.h2}>看片规矩</Text>
        </View>
        <Glass>
          <Text style={[nightFont.small, { marginBottom: 6 }]}>
            这里不提供片源、不托管视频、不给链接；片源由你自己准备。
          </Text>
          {RULES.map((t) => (
            <View key={t} style={styles.ruleRow}>
              <Text style={{ fontSize: 12, color: night.mint }}>✓</Text>
              <Text style={[nightFont.small, { marginLeft: 8, flex: 1 }]}>{t}</Text>
            </View>
          ))}
        </Glass>
      </ScrollView>

      {/* 创建房间 */}
      <Sheet visible={createSheet} title="创建观影房间" onClose={() => setCreateSheet(false)}>
        <Field
          label="看什么（可稍后决定，且不会写进邀请链接）"
          value={title}
          onChangeText={setTitle}
          placeholder="例如：春天的故事"
          maxLength={40}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {QUICK_PICKS.map((q) => (
            <Pressable key={q} onPress={() => setTitle(q)} style={styles.quickPick}>
              <Text style={[nightFont.tiny, { color: night.textDim }]}>{q}</Text>
            </Pressable>
          ))}
        </View>
        <Btn
          title="创建房间"
          onPress={() => {
            if (store.createRoom(title)) {
              setTitle('');
              setCreateSheet(false);
              router.push('/room');
            }
          }}
        />
      </Sheet>

      {/* 备用入口：老用户手里可能还有别人给的邀请码 */}
      <Sheet visible={joinSheet} title="用邀请码加入（备用）" onClose={() => setJoinSheet(false)}>
        <Field
          label="6 位邀请码"
          value={joinCode}
          onChangeText={setJoinCode}
          placeholder="6 位数字"
          keyboardType="number-pad"
          maxLength={6}
        />
        <Btn
          title="加入"
          onPress={() => {
            if (store.joinRoomByCode(joinCode)) {
              setJoinCode('');
              setJoinSheet(false);
              router.push('/room');
            }
          }}
        />
      </Sheet>

      <TabBar active="cinema" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bgDeep },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center' },
  liveIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.cyanSoft,
    marginRight: 10,
  },
  outlineBtn: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: night.line,
    backgroundColor: night.glassHi,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: night.cyan,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: night.textOnLight },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  quickPick: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: night.line,
    backgroundColor: night.glassHi,
  },
});
