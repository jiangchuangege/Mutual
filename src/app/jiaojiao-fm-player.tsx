import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { claimAudioFocus, registerAudioOwner, releaseAudioFocus, unregisterAudioOwner } from '../lib/audioFocus';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../store';
import { Ico } from '../ui/icons';
import { night } from '../ui/nightTheme';
import { NightBackdrop } from '../ui/NightSky';
import { radius, space } from '../ui/theme';
import { Aurora } from '../ui/Aurora';

/**
 * 焦焦FM 独立播放页（章节 / 倍速 / 睡眠定时）。
 *
 * 从听书首页的迷你条点进来，参数走路由：audio / title / album / cover / key。
 * 播放进度照样上报空间（store.pushFmProgress），所以「一起听」在这个页面一样生效。
 */
const SPEEDS = [0.8, 1, 1.25, 1.5, 2];
const SLEEPS = [0, 15, 30, 60]; // 分钟，0 = 关

export default function JiaojiaoFmPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { store } = useApp();
  const params = useLocalSearchParams<{
    audio?: string;
    title?: string;
    album?: string;
    cover?: string;
    key?: string;
    chapter?: string;
    /** 从列表页/迷你条交接过来的播放位置 */
    startSec?: string;
  }>();

  const audio = String(params.audio ?? '');
  const title = String(params.title ?? '未命名');
  const album = String(params.album ?? '');
  const cover = String(params.cover ?? '');
  const itemKey = String(params.key ?? '');
  /** 从列表页/迷你条交接过来的播放位置 */
  const startSec = Number(params.startSec ?? 0) || 0;

/** 这一层在音频焦点登记表里的名字 */
const FM_PLAYER_OWNER = 'jiaojiao-fm-player';

  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [sleepMin, setSleepMin] = useState(0);
  const [sleepLeft, setSleepLeft] = useState(0);

  // 进页面就准备播放器
  useEffect(() => {
    if (!audio) return;
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    } as Parameters<typeof setAudioModeAsync>[0]).catch(() => undefined);

    try {
      /*
       * 进播放页同样要抢音频焦点（把「一起听」暂停掉），
       * 卸载时把原生播放器 **remove** 掉：以前只 pause 再置 null，
       * 原生 AudioTrack 还在，来回进出就变成多路声音叠着放。
       */
      claimAudioFocus(FM_PLAYER_OWNER);
      const p = createAudioPlayer({ uri: audio });
      playerRef.current = p;
      p.play();
      /* 从迷你条进来时带 startSec：先定位再播，避免从头再放一遍（错位回声） */
      if (startSec > 0.5) {
        try {
          void p.seekTo(startSec);
        } catch {
          /* 忽略 */
        }
      }
      setPlaying(true);
    } catch {
      /* 地址失效就当没播 */
    }
    return () => {
      const p = playerRef.current;
      playerRef.current = null;
      releaseAudioFocus(FM_PLAYER_OWNER);
      try {
        p?.pause();
        (p as unknown as { remove?: () => void })?.remove?.();
      } catch {
        /* 忽略 */
      }
    };
  }, [audio, startSec]);

  // 每 500ms 刷进度 + 上报（一起听同步用）
  useEffect(() => {
    const timer = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const cur = Number(p.currentTime) || 0;
      setPos(cur);
      const d = Number(p.duration) || 0;
      if (d > 0) setDur(d);
      if (itemKey) {
        try {
          store.pushFmProgress({ itemKey, positionSec: cur, rate: speed, playing });
        } catch {
          /* 离线忽略 */
        }
      }
    }, 500);
    return () => clearInterval(timer);
  }, [itemKey, speed, playing]);

  // 睡眠定时
  useEffect(() => {
    if (sleepMin <= 0) {
      setSleepLeft(0);
      return;
    }
    setSleepLeft(sleepMin * 60);
    const timer = setInterval(() => {
      setSleepLeft((left) => {
        if (left <= 1) {
          try {
            playerRef.current?.pause();
          } catch {
            /* 忽略 */
          }
          setPlaying(false);
          setSleepMin(0);
          clearInterval(timer);
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [sleepMin]);

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (playing) p.pause();
      else p.play();
      setPlaying(!playing);
    } catch {
      /* 忽略 */
    }
  };

  const seekBy = (delta: number) => {
    const p = playerRef.current;
    if (!p) return;
    const next = Math.max(0, Math.min(dur || 1e9, pos + delta));
    try {
      void p.seekTo(next);
      setPos(next);
    } catch {
      /* 忽略 */
    }
  };

  const changeSpeed = () => {
    const i = SPEEDS.indexOf(speed);
    const next = SPEEDS[(i + 1) % SPEEDS.length];
    setSpeed(next);
    try {
      // expo-audio 用 playbackRate 控制倍速
      (playerRef.current as unknown as { playbackRate?: number; setPlaybackRate?: (r: number) => void });
      const p = playerRef.current as unknown as {
        playbackRate?: number;
        setPlaybackRate?: (r: number) => void;
      };
      if (p?.setPlaybackRate) p.setPlaybackRate(next);
      else if (p) p.playbackRate = next;
    } catch {
      /* 有的机型不支持倍速，忽略 */
    }
  };

  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  const progress = dur > 0 ? Math.min(1, pos / dur) : 0;

  return (
    <View style={styles.root}>
      <NightBackdrop variant="live" />
      <Aurora accent="#FFD37A" />
      <ScrollView
        contentContainerStyle={{ padding: space.md, paddingTop: insets.top + 10, paddingBottom: 40 }}
      >
        <View style={styles.head}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.chip}>
            <Text style={styles.chipText}>返回</Text>
          </Pressable>
          <Text style={styles.headTitle}>焦焦FM</Text>
          <View style={{ width: 52 }} />
        </View>

        {/* 封面 */}
        <View style={styles.coverWrap}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverFallback]}>
              <Ico name="fm" size="xl" color="#57F8FF" />
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.album} numberOfLines={1}>
          {album || '焦焦FM · 一起听书'}
        </Text>

        {/* 进度条 */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{mmss(pos)}</Text>
          <Text style={styles.time}>{dur > 0 ? mmss(dur) : '--:--'}</Text>
        </View>

        {/* 控制 */}
        <View style={styles.controls}>
          <Pressable onPress={() => seekBy(-15)} style={styles.side}>
            <Text style={styles.sideText}>-15s</Text>
          </Pressable>
          <Pressable onPress={toggle} style={styles.play}>
            <Ico name={playing ? 'pause' : 'play'} size="xl" color="#08111F" />
          </Pressable>
          <Pressable onPress={() => seekBy(15)} style={styles.side}>
            <Text style={styles.sideText}>+15s</Text>
          </Pressable>
        </View>

        {/* 倍速 / 睡眠定时 */}
        <View style={styles.panel}>
          <View style={styles.panelRow}>
            <Text style={styles.label}>倍速</Text>
            <Pressable onPress={changeSpeed} style={styles.pill}>
              <Text style={styles.pillText}>{speed}×</Text>
            </Pressable>
          </View>
          <View style={styles.panelRow}>
            <Text style={styles.label}>睡眠定时</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {SLEEPS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setSleepMin(m)}
                  style={[styles.pill, sleepMin === m && styles.pillOn]}
                >
                  <Text style={[styles.pillText, sleepMin === m && { color: '#08111F' }]}>
                    {m === 0 ? '关' : `${m}分`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {sleepLeft > 0 ? (
            <Text style={styles.hint}>
              {Math.floor(sleepLeft / 60)}:{String(sleepLeft % 60).padStart(2, '0')} 后自动暂停
            </Text>
          ) : null}
        </View>

        <Text style={styles.hint}>
          这一集的进度会同步给 TA（±1.5 秒对齐）；切后台/锁屏也会继续放。
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bgDeep },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headTitle: { color: night.text, fontSize: 15, fontWeight: '800' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipText: { color: night.text, fontSize: 12 },
  coverWrap: { alignItems: 'center', marginVertical: 8 },
  cover: { width: 232, height: 232, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.06)' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { color: night.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  album: { color: night.textDim, fontSize: 12, textAlign: 'center', marginTop: 4 },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 18,
    overflow: 'hidden',
  },
  barFill: { height: 4, borderRadius: 2, backgroundColor: night.cyan },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { color: night.textDim, fontSize: 11 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 18 },
  side: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sideText: { color: night.text, fontSize: 12, fontWeight: '700' },
  play: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: night.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    marginTop: 22,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(12,18,34,0.72)',
    gap: 12,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: night.textDim, fontSize: 12.5 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pillOn: { backgroundColor: night.cyan },
  pillText: { color: night.text, fontSize: 12, fontWeight: '700' },
  hint: { color: night.textFaint, fontSize: 11, marginTop: 12, lineHeight: 17, textAlign: 'center' },
});
