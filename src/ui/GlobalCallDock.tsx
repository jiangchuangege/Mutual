import { usePathname } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration } from '../core/time';
import { useApp } from '../store';
import { Avatar, Btn } from './components';
import { color, font, radius, shadow } from './theme';
import { surf } from './theme';

/**
 * 全局通话悬浮小窗
 *
 * - 挂在 _layout 上，任何页面（除影院房间，那里已有完整面板）都能看到通话状态；
 * - 未通话时完全不渲染，零遮挡；
 * - 最小可操作集：接听/拒绝、静音、扬声器、挂断；点展开可调「对方音量 / 切仅文字」；
 * - 位置在底部导航之上，安全区自适应，不挡内容。
 */
export function GlobalCallDock() {
  const { store, snapshot, role } = useApp();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const voice = snapshot.voice;
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';
  const [expanded, setExpanded] = useState(false);
  const connectedAt = useRef<number | null>(null);
  const [, forceTick] = useState(0);

  const connected = voice.status === 'connected';
  const inviting = voice.status === 'inviting';

  // 记录接通时刻（用于显示通话时长）
  useEffect(() => {
    if (connected) {
      if (connectedAt.current === null) connectedAt.current = Date.now();
    } else {
      connectedAt.current = null;
      setExpanded(false);
    }
  }, [connected]);

  // 通话中每秒刷新一次时长显示
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [connected]);

  // 影院房间页自己有完整语音面板，避免重复与遮挡
  if (pathname === '/room') return null;
  if (!connected && !inviting) return null;

  const duration =
    connected && connectedAt.current !== null
      ? Math.max(0, Math.floor((Date.now() - connectedAt.current) / 1000))
      : 0;

  const incoming = inviting && voice.byRole !== role;
  const outgoing = inviting && voice.byRole === role;

  const tone = connected ? color.mint : incoming ? color.butter : color.primarySoft;
  const bg = connected ? color.mintSoft : incoming ? color.butterSoft : surf('base');
  const ink = connected ? '#1F4A38' : color.ink;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: 96 + insets.bottom }]}
    >
      <View style={[styles.dock, { backgroundColor: bg, borderColor: tone }]}>
        {/* 第一行：状态 */}
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={styles.row}
          hitSlop={6}
        >
          <Avatar
            emoji={snapshot.members[partner].avatar}
            uri={store.avatarSrc(partner)}
            size={26}
            bg={tone}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[font.bodyStrong, { color: ink }]} numberOfLines={1}>
              {connected
                ? `通话中 ${formatDuration(duration)}`
                : incoming
                  ? `${snapshot.members[voice.byRole ?? partner].name} 邀请你语音`
                  : `正在呼叫 ${snapshot.members[partner].name}…`}
            </Text>
            <Text style={[font.tiny, { color: color.inkSoft, marginTop: 1 }]} numberOfLines={1}>
              {connected
                ? `${voice.muted[role] ? '你已静音' : '麦克风上行中'} · ${voice.speaker[role] ? '扬声器' : '听筒'} · 音量 ${voice.volume[role]}`
                : outgoing
                  ? '60 秒内未响应会自动失效'
                  : '点一下展开更多操作'}
            </Text>
          </View>
          {connected ? (
            <Text style={[font.tiny, { color: color.inkSoft, marginRight: 4 }]}>
              {expanded ? '收起' : '展开'}
            </Text>
          ) : null}
        </Pressable>

        {/* 第二行：快捷操作 */}
        <View style={styles.actions}>
          {incoming ? (
            <>
              <Btn title="接听" small style={{ flex: 1 }} onPress={() => store.acceptVoiceInvite()} />
              <Btn
                title="拒绝"
                small
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => store.declineVoiceInvite()}
              />
            </>
          ) : null}

          {outgoing ? (
            <Btn title="取消呼叫" small variant="ghost" style={{ flex: 1 }} onPress={() => store.endVoice()} />
          ) : null}

          {connected ? (
            <>
              <Pressable
                onPress={() => store.setVoiceMuted(!voice.muted[role])}
                style={[styles.iconBtn, voice.muted[role] ? styles.iconOn : null]}
              >
                <Text style={[font.tiny, { color: voice.muted[role] ? '#FFF' : color.inkMid }]}>
                  {voice.muted[role] ? '取消静音' : '静音'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => store.setVoiceSpeaker(!voice.speaker[role])}
                style={[styles.iconBtn, voice.speaker[role] ? styles.iconOn : null]}
              >
                <Text style={[font.tiny, { color: voice.speaker[role] ? '#FFF' : color.inkMid }]}>
                  {voice.speaker[role] ? '扬声器' : '听筒'}
                </Text>
              </Pressable>
              <Pressable onPress={() => store.endVoice()} style={[styles.iconBtn, styles.endBtn]}>
                <Text style={[font.tiny, { color: '#FFF' }]}>挂断</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        {/* 展开：音量与弱网降级 */}
        {connected && expanded ? (
          <View style={styles.expandBox}>
            <View style={styles.volumeRow}>
              <Text style={[font.tiny, { flex: 1 }]}>对方音量 {voice.volume[role]}</Text>
              <Btn
                title="-10"
                small
                variant="ghost"
                onPress={() => store.setVoiceVolume(voice.volume[role] - 10)}
              />
              <Btn
                title="+10"
                small
                variant="ghost"
                onPress={() => store.setVoiceVolume(voice.volume[role] + 10)}
              />
            </View>
            <View style={{ height: 6 }} />
            <Btn title="网络差，切仅文字" small variant="ghost" onPress={() => store.switchToTextOnly()} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dock: {
    width: '92%',
    maxWidth: 420,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadow.float,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  iconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: surf('base'),
    borderWidth: 1,
    borderColor: color.line,
  },
  iconOn: { backgroundColor: color.ink, borderColor: color.ink },
  endBtn: { backgroundColor: color.danger, borderColor: color.danger },
  expandBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.lineStrong,
  },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});