import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '../core/time';
import type { MusicState } from '../core/types';
import { color, radius, shadow } from './theme';
import type { MusicEngine } from './useMusicEngine';
import { Ico } from './icons';

/**
 * 一起听 · 播放卡片（纯展示）
 *
 * 所有播放状态都来自 `engine`（`useMusicEngine` 里那一份），
 * 所以这里的大按钮、进度、缓冲状态和队列里的小三角永远是同一个真相。
 *
 * ── 视觉（C5 重做）──
 * 之前是"深色方盒子 + 一个橙色圆按钮"，用户说"太丑，要惊艳浪漫"。
 * 现在改成：暖白磨砂卡 + 玫瑰光晕 + 会转的黑胶唱片 + 玫瑰渐变进度条，
 * 目标是"放在桌面上想截图发人"的那种质：
 *   · 唱片会**慢慢转**（暂停就停），中间嵌封面；
 *   · 封面外面一圈玫瑰→藕荷的光晕，随呼吸轻微明暗；
 *   · 进度条是玫瑰渐变 + 白色滑点，点一下就能跳；
 *   · 中间的播放键带外发光环，像一颗心。
 */
const ROSE = {
  ink: '#3A2B27',
  dim: '#8B726B',
  faint: '#B39C94',
  line: 'rgba(232,131,107,0.22)',
  accent: '#E8836B',
  accentDeep: '#D2683F',
  lilac: '#C9A6E8',
  blush: '#FFD9CF',
  disc: '#191310',
  groove: 'rgba(255,255,255,0.07)',
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
  const playLabel = engine.playing ? '❚❚' : '▶';

  // 唱片旋转：播放时慢慢转（20 秒一圈），暂停停在当前角度
  const spin = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(0);
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (engine.playing && track) {
      const loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 20000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinLoop.current = loop;
      loop.start();
      return () => {
        loop.stop();
        spin.stopAnimation((v) => {
          spinValue.current = v;
        });
        spin.setValue(spinValue.current % 1);
        spinLoop.current = null;
      };
    }
    spin.stopAnimation((v) => {
      spinValue.current = v;
    });
    spin.setValue(spinValue.current % 1);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.playing, track?.id]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.card}>
      {/* 玫瑰光晕：卡片左上角一团暖色，下面右边一团藕荷色 */}
      <LinearGradient
        colors={['rgba(255,225,215,0.62)', 'rgba(255,249,246,0.5)', 'rgba(216,196,240,0.22)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.glowOne} pointerEvents="none" />
      <View style={styles.glowTwo} pointerEvents="none" />

      {/* 顶部小字：和谁一起听 */}
      <View style={styles.topRow}>
        <Text style={styles.nowLabel}>♫ 一起听</Text>
        <Text style={styles.nowMeta} numberOfLines={1}>
          {music.updatedBy === role ? '你在控制 · TA 会跟着你' : 'TA 在控制 · 你这儿同步跟着'}
        </Text>
      </View>

      {/* 唱片 + 信息 */}
      <View style={styles.discRow}>
        <View style={styles.discWrap}>
          <View style={[styles.discHalo, engine.playing ? styles.discHaloOn : null]} />
          <Animated.View
            style={[styles.disc, { transform: [{ rotate }] }]}
          >
            {/* 纹路：几圈很淡的亮环，让它像真的黑胶 */}
            <View style={[styles.groove, { width: 86, height: 86, borderRadius: 43 }]} />
            <View style={[styles.groove, { width: 72, height: 72, borderRadius: 36 }]} />
            <View style={[styles.groove, { width: 58, height: 58, borderRadius: 29 }]} />
            {/* 中心：封面（没有封面就用音符） */}
            <View style={styles.label}>
              {track?.cover ? (
                <Image source={{ uri: track.cover }} style={styles.labelCover} />
              ) : (
                <View style={styles.labelFallback}>
                  <Ico name="music" size="lg" />
                </View>
              )}
              <View style={styles.spindle} />
            </View>
          </Animated.View>
        </View>

        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.title} numberOfLines={1}>
            {track ? track.title : '队列里还没有歌'}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track ? track.artist || '未知歌手' : '在下面加一首 http(s) 音频直链就能一起听'}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {music.shuffle ? '随机' : music.loop ? '单曲循环' : '顺序播放'}
              </Text>
            </View>
            {track ? (
              <View style={[styles.badge, styles.badgeSoft, { marginLeft: 6 }]}>
                <Text style={[styles.badgeText, styles.badgeSoftText]}>
                  {track.addedBy === role ? '我加的' : 'TA 加的'}
                </Text>
              </View>
            ) : null}
            {voiceConnected ? (
              <View style={[styles.badge, styles.badgeWarn, { marginLeft: 6 }]}>
                <Text style={[styles.badgeText, styles.badgeWarnText]}>语音中 · {engine.volumePct}%</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* 进度条（点一下跳转）：玫瑰渐变 + 白色滑点 */}
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
          <LinearGradient
            colors={[ROSE.accent, '#F09C7E', ROSE.lilac]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.trackFill, { width: `${Math.max(pct * 100, pct > 0 ? 2 : 0)}%` }]}
          />
          {engine.duration > 0 ? (
            <View style={[styles.knob, { left: `${pct * 100}%` }]} />
          ) : null}
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
        <Pressable onPress={engine.toggle} style={styles.playWrap} disabled={!track}>
          <LinearGradient
            colors={[ROSE.accent, ROSE.accentDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playBtn}
          >
            <Text style={styles.playGlyph}>{playLabel}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => engine.step(1)} style={styles.sideBtn}>
          <Text style={styles.sideText}>⏭</Text>
        </Pressable>
        <Pressable onPress={() => engine.setLoop(!music.loop)} style={styles.miniBtn}>
          <Text style={[styles.miniText, music.loop ? styles.activeText : null]}>循环</Text>
        </Pressable>
      </View>

      {/* 缓冲 / 失败 */}
      {engine.buffering && !engine.stalled ? (
        <View style={styles.bufferingRow}>
          <View style={styles.bufferingDot} />
          <Text style={styles.hintCentered}>缓冲中…</Text>
        </View>
      ) : null}
      {engine.stalled ? (
        <View style={styles.stallBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stallText}>这首歌加载不出来（直链失效或网络问题）</Text>
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
    backgroundColor: 'rgba(255,253,251,0.95)',
    borderRadius: 26,
    padding: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: ROSE.line,
    overflow: 'hidden',
    ...shadow.float,
  },
  glowOne: {
    position: 'absolute',
    top: -46,
    left: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,168,140,0.20)',
  },
  glowTwo: {
    position: 'absolute',
    bottom: -60,
    right: -40,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(201,166,232,0.16)',
  },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  nowLabel: { fontSize: 11.5, fontWeight: '800', color: ROSE.accentDeep, letterSpacing: 0.4 },
  nowMeta: { flex: 1, textAlign: 'right', fontSize: 10, color: ROSE.faint },

  discRow: { flexDirection: 'row', alignItems: 'center' },
  discWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  discHalo: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(232,131,107,0.16)',
  },
  discHaloOn: { backgroundColor: 'rgba(232,131,107,0.3)' },
  disc: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: ROSE.disc,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(216,180,138,0.55)',
  },
  groove: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: ROSE.groove,
  },
  label: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROSE.blush,
  },
  labelCover: { width: 44, height: 44 },
  labelFallback: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  spindle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(58,43,39,0.55)',
  },

  title: { fontSize: 19, fontWeight: '800', color: ROSE.ink, letterSpacing: 0.2 },
  artist: { fontSize: 12, color: ROSE.dim, marginTop: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(232,131,107,0.16)',
  },
  badgeSoft: { backgroundColor: 'rgba(201,166,232,0.18)' },
  badgeWarn: { backgroundColor: 'rgba(232,131,107,0.9)' },
  badgeText: { fontSize: 10, color: ROSE.accentDeep, fontWeight: '700' },
  badgeSoftText: { color: '#7A5E9B' },
  badgeWarnText: { color: '#FFFFFF' },

  progressTouch: { paddingVertical: 14, paddingHorizontal: 2 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(232,131,107,0.16)',
    overflow: 'visible',
    justifyContent: 'center',
  },
  trackFill: { height: 6, borderRadius: 3 },
  knob: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: ROSE.accent,
    marginLeft: -6,
    ...shadow.float,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  time: { fontSize: 10, color: ROSE.faint, fontVariant: ['tabular-nums'] },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  playWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,131,107,0.18)',
    padding: 5,
  },
  playBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  sideBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: ROSE.line,
  },
  sideText: { fontSize: 15, color: ROSE.ink },
  miniBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: ROSE.line,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  miniText: { fontSize: 11, color: ROSE.dim },
  activeText: { color: ROSE.accentDeep, fontWeight: '800' },

  bufferingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  bufferingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ROSE.accent,
    marginRight: 6,
  },
  hintCentered: { fontSize: 11, color: ROSE.dim },
  stallBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(232,131,107,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  stallText: { fontSize: 11, color: ROSE.ink },
  stallUrl: { fontSize: 9, color: ROSE.faint, marginTop: 3 },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: ROSE.accent,
    marginLeft: 8,
  },
  retryText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
});
