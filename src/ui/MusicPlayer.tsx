import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '../core/time';
import type { MusicState } from '../core/types';
import { radius, shadow } from './theme';
import type { MusicEngine } from './useMusicEngine';
import { Ico } from './icons';

/**
 * 一起听 · 播放卡片（纯展示）
 *
 * 所有播放状态都来自 `engine`（`useMusicEngine` 里那一份），
 * 所以这里的大按钮、进度、缓冲状态和队列里的小三角永远是同一个真相。
 * 以前这个组件自己维护一套 `playing`，队列那一行维护另一套，才会出现
 * "上面显示暂停、下面显示播放"。
 */
const VINYL = {
  card: '#221D1A',
  line: '#3A322D',
  text: '#F5EDE6',
  dim: '#B4A79C',
  gold: '#D8B48A',
  accent: '#E8836B',
};

export function MusicPlayer({
  role,
  music,
  engine,
  voiceConnected,
}: {
  role: 'A' | 'B';
  music: MusicState;
  engine: MusicEngine;
  voiceConnected: boolean;
}) {
  const track = engine.track;
  const trackWidthRef = useRef(1);
  const pct = useMemo(
    () => (engine.duration > 0 ? Math.min(1, engine.currentTime / engine.duration) : 0),
    [engine.currentTime, engine.duration],
  );
  const playLabel = engine.playing ? '⏸' : '▶';

  return (
    <View style={styles.card}>
      {/* 唱片 + 信息 */}
      <View style={styles.discRow}>
        <View style={[styles.disc, engine.buffering ? styles.discBuffering : null]}>
          <View style={styles.discInner}>
            <Ico name="music" size="xl" />
          </View>
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.title} numberOfLines={1}>
            {track ? track.title : '队列里还没有歌'}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track ? track.artist || '未知歌手' : '先在下面加一首 http(s) 音频直链'}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {music.shuffle ? '随机' : music.loop ? '单曲循环' : '顺序播放'}
              </Text>
            </View>
            <View style={[styles.badge, { marginLeft: 6 }]}>
              <Text style={styles.badgeText}>
                {music.updatedBy === role ? '你控制中' : 'TA 控制中'}
              </Text>
            </View>
            {voiceConnected ? (
              <View style={[styles.badge, styles.badgeWarn, { marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: '#3A2A18' }]}>语音中 · 音量 {engine.volumePct}%</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* 进度条（点一下跳转） */}
      <Pressable
        style={styles.progressTouch}
        onPress={(e) => {
          if (engine.duration <= 0) return;
          const width = Math.max(1, trackWidthRef.current);
          const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
          engine.seekTo(ratio * engine.duration);
        }}
        onLayout={(e) => {
          trackWidthRef.current = Math.max(1, e.nativeEvent.layout.width);
        }}
      >
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
        </View>
      </Pressable>

      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatDuration(engine.currentTime)}</Text>
        <Text style={styles.time}>
          {engine.duration > 0 ? formatDuration(engine.duration) : '--:--'}
        </Text>
      </View>

      {/* 控制栏 */}
      <View style={styles.controls}>
        <Pressable onPress={() => engine.setShuffle(!music.shuffle)} style={styles.miniBtn}>
          <Text style={[styles.miniText, music.shuffle ? styles.activeText : null]}>随机</Text>
        </Pressable>
        <Pressable onPress={() => engine.step(-1)} style={styles.sideBtn}>
          <Text style={styles.sideText}>⏮</Text>
        </Pressable>
        <Pressable onPress={engine.toggle} style={styles.playBtn} disabled={!track}>
          <Text style={{ color: '#FFFFFF', fontSize: 20 }}>{playLabel}</Text>
        </Pressable>
        <Pressable onPress={() => engine.step(1)} style={styles.sideBtn}>
          <Text style={styles.sideText}>⏭</Text>
        </Pressable>
        <Pressable onPress={() => engine.setLoop(!music.loop)} style={styles.miniBtn}>
          <Text style={[styles.miniText, music.loop ? styles.activeText : null]}>循环</Text>
        </Pressable>
      </View>

      {/* 缓冲 / 失败 */}
      {engine.buffering && !engine.stalled ? <Text style={styles.hintCentered}>缓冲中…</Text> : null}
      {engine.stalled ? (
        <View style={styles.stallBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stallText}>音频加载不出来（直链失效或网络问题）</Text>
            {engine.sourceUrl ? (
              <Text style={styles.stallUrl} numberOfLines={1}>
                {engine.sourceUrl}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={engine.retry} style={styles.retryBtn}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: VINYL.card,
    borderRadius: radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: VINYL.line,
    ...shadow.float,
  },
  discRow: { flexDirection: 'row', alignItems: 'center' },
  disc: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#0E0B0A',
    borderWidth: 3,
    borderColor: VINYL.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discBuffering: { borderColor: VINYL.accent, opacity: 0.85 },
  discInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: VINYL.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: VINYL.line,
  },
  title: { fontSize: 17, fontWeight: '700', color: VINYL.text },
  artist: { fontSize: 12, color: VINYL.dim, marginTop: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(216,180,138,0.16)',
  },
  badgeWarn: { backgroundColor: VINYL.gold },
  badgeText: { fontSize: 10, color: VINYL.gold },
  progressTouch: { paddingVertical: 12 },
  track: { height: 5, borderRadius: 3, backgroundColor: '#3A322D', overflow: 'hidden' },
  trackFill: { height: 5, backgroundColor: VINYL.accent },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  time: { fontSize: 10, color: VINYL.dim, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: VINYL.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2420',
  },
  sideText: { fontSize: 16, color: VINYL.text },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: VINYL.line,
  },
  miniText: { fontSize: 11, color: VINYL.dim },
  activeText: { color: VINYL.accent, fontWeight: '700' },
  hintCentered: { fontSize: 11, color: VINYL.dim, textAlign: 'center', marginTop: 10 },
  stallBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(232,131,107,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  stallText: { fontSize: 11, color: VINYL.text },
  stallUrl: { fontSize: 9, color: VINYL.dim, marginTop: 3 },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: VINYL.accent,
    marginLeft: 8,
  },
  retryText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
});
