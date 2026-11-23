import { usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../store';
import { useMusicEngine, type MusicEngine } from './useMusicEngine';
import { ALL_SPRITES, SeasonParticles } from './SeasonParticles';
import { AnimePet } from './AnimePet';
import { seasonOf } from '../core/ambience';

/**
 * 全局音乐引擎 + 迷你播放器 + 季节飘落层。
 *
 * 播放器和「一起听」页面用的是**同一个引擎**（引擎挂在这里，全 App 唯一一份）。
 * 迷你播放器：默认收成贴边小圆点，点开是小胶囊（封面/歌名/播放/下一首/收起/关闭），可拖动。
 * 只在「今天/生活/关怀/影院/我们」这五个外部模块显示。
 */

const MusicCtx = createContext<MusicEngine | null>(null);

export function useGlobalMusicEngine(): MusicEngine {
  const engine = useContext(MusicCtx);
  if (!engine) throw new Error('音乐引擎还没挂载（应在 AppFrame 里提供）');
  return engine;
}

const OUTER_TABS = ['/', '/index', '/life', '/care', '/cinema', '/us'];

function isPlayingPage(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith('/room') ||
    pathname.startsWith('/live-player') ||
    pathname.startsWith('/jiaojiao-fm-player')
  );
}

export function MusicEngineHost({ children }: { children: React.ReactNode }) {
  const { store, snapshot, role } = useApp();
  const music = snapshot.music;
  const pathname = usePathname();
  const engine = useMusicEngine({
    role,
    music,
    serverNow: snapshot.serverNowMs,
    voiceConnected: snapshot.voice.status === 'connected',
    onAction: (action, payload) => store.musicAction(action, payload),
  });

  /*
   * 开机自动续播只允许发生一次。
   *
   * 真实事故：这个 effect 依赖 [music.queue.length, snapshot.collection]，
   * 而 snapshot.collection 每次投影都是新数组（服务端每 30 秒一次 presence 心跳、
   * 每次操作都会产生新快照）→ effect 反复重跑 → 只要音乐是「暂停」状态，
   * 第 84 行就无条件 musicAction('play')：用户点了暂停，过几十秒音乐自己又响起来，
   * 还把对方手机也切到播放。
   */
  const autoBootedRef = useRef(false);
  useEffect(() => {
    if (autoBootedRef.current) return;
    autoBootedRef.current = true;
    let cancelled = false;
    void (async () => {
      const silenced = await AsyncStorage.getItem('music_silenced');
      if (cancelled) return;
      // 开机自动放歌：只要用户没按过 ✕（music_silenced=1）就接着放。
      // 不再看 last_audio_surface —— FM 已经不自动播了，那个标记只会让音乐起不来。
      if (silenced === '1') return;
      if (music.queue.length === 0) {
        // 队列空：从「共享歌单」里挑第一首有音频的补进去（只补一次，别每次开屏都塞歌）
        const seeded = await AsyncStorage.getItem('music_seeded');
        if (cancelled || seeded === '1') return;
        const first = (snapshot.collection ?? []).find(
          (it) => it.kind === 'playlist' && it.visibility === 'shared' && !!it.meta.audio,
        );
        if (!first) return;
        void AsyncStorage.setItem('music_seeded', '1').catch(() => undefined);
        if (store.addMusicTrack(first.title, '', first.meta.audio)) store.musicAction('play');
        return;
      }
      if (music.action === 'play') return;
      store.musicAction('play');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music.queue.length, snapshot.collection]);

  const season = seasonOf(new Date());
  // 横屏（全屏看片）时不显示挂件，别挡画面
  const dims = useWindowDimensions();
  const horizontal = dims.width > dims.height;
  const showPlayer = OUTER_TABS.includes(pathname ?? '/');

  return (
    <MusicCtx.Provider value={engine}>
      {/* 飘落层：铺在背景之上、内容之下（不挡字、不吃点击） */}
      {isPlayingPage(pathname) ? null : <SeasonParticles season={season} />}
      <SpriteKeeper />
      {children}
      {showPlayer ? <AnimePet horizontal={horizontal} /> : null}
      {showPlayer ? <MiniMusicPlayer engine={engine} /> : null}
    </MusicCtx.Provider>
  );
}

/**
 * 特效素材"常驻"：把 11 张精灵以 1px 尺寸挂在树上（肉眼看不见）。
 * 作用是把解码后的位图钉在内存里 —— 换页、换季节都不会再出现"第一帧空一下"。
 * 素材本身是打包在 APK 里的，所以这份缓存是永久的（除非卸载重装）。
 */
function SpriteKeeper() {
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: -20, top: -20, width: 1, height: 1, opacity: 0.01 }}
    >
      {ALL_SPRITES.map((src, i) => (
        <Image key={`sprite-${i}`} source={src} fadeDuration={0} style={{ width: 1, height: 1 }} />
      ))}
    </View>
  );
}

function MiniMusicPlayer({ engine }: { engine: MusicEngine }) {
  const insets = useSafeAreaInsets();
  const track = engine.track;
  const [collapsed, setCollapsed] = useState(true);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragStart = useRef({ x: 0, y: 0 });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        const v = pan as unknown as { x?: { _value?: number }; y?: { _value?: number } };
        dragStart.current = { x: v.x?._value ?? 0, y: v.y?._value ?? 0 };
      },
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: dragStart.current.x + g.dx, y: dragStart.current.y + g.dy });
      },
      onPanResponderRelease: () => {
        const v = pan as unknown as { x?: { _value?: number }; y?: { _value?: number } };
        dragStart.current = { x: v.x?._value ?? 0, y: v.y?._value ?? 0 };
      },
    }),
  ).current;

  if (!track) return null;
  const pct = engine.duration > 0 ? Math.min(1, engine.currentTime / engine.duration) : 0;

  const close = () => {
    void AsyncStorage.setItem('music_silenced', '1').catch(() => undefined);
    try {
      if (engine.playing) engine.toggle();
    } catch {
      /* 忽略 */
    }
  };

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          right: 10,
          /* 贴右下角：之前放右上角会盖住"已连接"状态药丸，用户反馈挡字 */
          bottom: insets.bottom + 96,
          alignItems: 'flex-end',
          zIndex: 999,
          elevation: 24,
        },
        { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
      ]}
      {...responder.panHandlers}
    >
      {collapsed ? (
        <Pressable onPress={() => setCollapsed(false)} style={styles.bubble}>
          <LinearGradient
            colors={['rgba(87,248,255,0.95)', 'rgba(169,139,255,0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.bubbleIcon}>{engine.playing ? '♫' : '♪'}</Text>
          <View style={styles.bubbleRing} />
        </Pressable>
      ) : (
        <View style={styles.card}>
          <LinearGradient
            colors={['rgba(23,19,45,0.95)', 'rgba(10,20,38,0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={styles.row}>
            {track.cover ? (
              <Image source={{ uri: track.cover }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Text style={{ fontSize: 12 }}>🎵</Text>
              </View>
            )}
            <View style={{ maxWidth: 92, marginLeft: 8 }}>
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {engine.playing ? '一起听' : '已暂停'}
                {track.artist ? ` · ${track.artist}` : ''}
              </Text>
            </View>
            {engine.buffering ? (
              <ActivityIndicator color="#57F8FF" size="small" style={{ marginHorizontal: 4 }} />
            ) : (
              <Pressable onPress={() => engine.toggle()} hitSlop={8} style={styles.iconBtn}>
                <Text style={styles.icon}>{engine.playing ? '⏸' : '▶'}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => engine.step(1)} hitSlop={8} style={styles.iconBtn}>
              <Text style={[styles.icon, { color: '#A98BFF' }]}>⏭</Text>
            </Pressable>
            <Pressable onPress={() => setCollapsed(true)} hitSlop={8} style={styles.iconBtn}>
              <Text style={[styles.icon, { color: 'rgba(234,244,255,0.7)' }]}>›</Text>
            </Pressable>
            <Pressable onPress={close} hitSlop={8} style={styles.iconBtn}>
              <Text style={[styles.icon, { color: 'rgba(234,244,255,0.45)' }]}>✕</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', right: 10, alignItems: 'flex-end' },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#57F8FF',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bubbleIcon: { color: '#08111F', fontSize: 17, fontWeight: '900' },
  bubbleRing: {
    position: 'absolute',
    width: 33,
    height: 33,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 7,
    borderWidth: 1,
    borderColor: 'rgba(169,139,255,0.5)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  progressFill: { height: 2, backgroundColor: '#57F8FF' },
  row: { flexDirection: 'row', alignItems: 'center' },
  cover: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.08)' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F6EEFF', fontSize: 11, fontWeight: '700' },
  sub: { color: 'rgba(190,199,232,0.9)', fontSize: 9.5, marginTop: 1 },
  iconBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  icon: { color: '#57F8FF', fontSize: 13, fontWeight: '700' },
});
