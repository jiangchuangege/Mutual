import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cleanEpisodeTitle } from '../core/jiaojiaoFm';
import { useApp } from '../store';
import { useFmEngine } from '../ui/FmEngineHost';
import { fmCurrentSec, pauseFm, playFm, seekFm, setFmRate, setFmSleep, toggleFm } from '../ui/fmEngine';
import { Ico } from '../ui/icons';
import { night } from '../ui/nightTheme';
import { NightBackdrop } from '../ui/NightSky';
import { radius, space } from '../ui/theme';

/**
 * 焦焦FM · 播放页。
 *
 * 播放器**不在页面里**，而是用全局引擎 `ui/fmEngine`：
 *   · 页面切走 / 退到后台都继续放（用户要求"每个页面都能听、后台也能听"）；
 *   · 列表页和播放页共用同一个实例，来回切不会两路叠音，也不会断；
 *   · 进度条、倍速、睡眠定时都调引擎的方法，状态从引擎订阅。
 */
const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
const SLEEPS = [0, 15, 30, 60];

export default function FmPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    audio?: string;
    title?: string;
    album?: string;
    cover?: string;
    key?: string;
    startSec?: string;
  }>();
  const { store, snapshot, role } = useApp();
  const fm = useFmEngine();

  const audio = String(params.audio ?? '');
  const title = String(params.title ?? '未命名');
  const album = String(params.album ?? '');
  const cover = String(params.cover ?? '');
  const itemKey = String(params.key ?? '');
  const startSec = Number(params.startSec ?? 0) || 0;

  /* 进页面：引擎里已经是这一集就接着放（无缝）；否则才起播 */
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (!audio) return;
    const cur = fm.item;
    if (cur && cur.key === itemKey) {
      if (Math.abs(fmCurrentSec() - startSec) > 2) seekFm(startSec);
      return;
    }
    playFm(
      {
        key: itemKey || audio,
        title,
        album,
        author: '',
        cover: cover || null,
        audio,
        duration: 0,
        summary: '',
        publishedAt: 0,
        sourceId: '',
      },
      { positionSec: startSec },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = fm.position;
  const dur = fm.duration;
  const playing = fm.playing;
  const speed = fm.rate;
  const progress = dur > 0 ? Math.min(1, pos / dur) : 0;

  const mmss = (sec: number) =>
    `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

  /* 可拖动进度条：拖动中只改显示，松手才真正 seek */
  const [dragging, setDragging] = React.useState(false);
  const [dragPos, setDragPos] = React.useState(0);
  const barWidthRef = useRef(1);
  const dragSeek = (x: number, commit: boolean) => {
    if (!(dur > 0)) return;
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, barWidthRef.current)));
    const target = ratio * dur;
    setDragPos(target);
    if (commit) seekFm(target);
  };
  const barPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setDragging(true);
        dragSeek(e.nativeEvent.locationX, false);
      },
      onPanResponderMove: (e) => dragSeek(e.nativeEvent.locationX, false),
      onPanResponderRelease: (e) => {
        dragSeek(e.nativeEvent.locationX, true);
        setDragging(false);
      },
      onPanResponderTerminate: () => setDragging(false),
    }),
  ).current;

  /* 一起听：对方进度 */
  const partnerFm = (() => {
    const p = (
      snapshot as unknown as {
        fmProgress?: {
          itemKey: string;
          positionSec: number;
          playing: boolean;
          role: 'A' | 'B';
          updatedAt: number;
        } | null;
      }
    ).fmProgress;
    return p && p.role !== role ? p : null;
  })();
  const sameAsPartner = !!partnerFm && partnerFm.itemKey === itemKey;
  const [syncHint, setSyncHint] = React.useState('');

  const syncHere = () => {
    if (!itemKey) return;
    const at = fmCurrentSec();
    store.pushFmProgress({ itemKey, positionSec: at, rate: speed, playing });
    setSyncHint(`已同步到 ${mmss(at)}`);
  };
  const followPartner = () => {
    if (!partnerFm) return;
    if (!sameAsPartner) {
      setSyncHint('TA 在听另一集，回列表点「跟随 TA」会自动换过去');
      return;
    }
    seekFm(partnerFm.positionSec);
    if (partnerFm.playing && !playing) toggleFm();
    if (!partnerFm.playing && playing) pauseFm();
    setSyncHint(`已跟到 TA 的 ${mmss(partnerFm.positionSec)}`);
  };

  const changeSpeed = () => {
    const i = SPEEDS.indexOf(speed);
    setFmRate(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  const sleepLabel = useMemo(() => {
    if (fm.sleepLeft <= 0) return '';
    return `${Math.floor(fm.sleepLeft / 60)}:${String(fm.sleepLeft % 60).padStart(2, '0')} 后自动暂停`;
  }, [fm.sleepLeft]);

  return (
    <View style={styles.root}>
      <NightBackdrop variant="live" />
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
          {cleanEpisodeTitle(title)}
        </Text>
        <Text style={styles.album} numberOfLines={1}>
          {album || '焦焦FM · 一起听书'}
        </Text>

        <View
          style={styles.barTouch}
          onLayout={(e) => {
            barWidthRef.current = Math.max(1, e.nativeEvent.layout.width);
          }}
          {...barPan.panHandlers}
        >
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${(dragging && dur > 0 ? dragPos / dur : progress) * 100}%` },
              ]}
            />
            <View
              style={[
                styles.barKnob,
                { left: `${(dragging && dur > 0 ? dragPos / dur : progress) * 100}%` },
              ]}
            />
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{mmss(dragging ? dragPos : pos)}</Text>
          <Text style={styles.time}>{dur > 0 ? mmss(dur) : '--:--'}</Text>
        </View>
        {fm.buffering && !fm.stalled ? <Text style={styles.hint}>缓冲中…</Text> : null}
        {fm.stalled ? <Text style={styles.hint}>这一集加载不出来（直链失效或网络问题）</Text> : null}

        <View style={styles.controls}>
          <Pressable onPress={() => seekFm(fmCurrentSec() - 15)} style={styles.side}>
            <Text style={styles.sideText}>-15s</Text>
          </Pressable>
          <Pressable onPress={toggleFm} style={styles.play}>
            <Ico name={playing ? 'pause' : 'play'} size="xl" color="#08111F" />
          </Pressable>
          <Pressable onPress={() => seekFm(fmCurrentSec() + 15)} style={styles.side}>
            <Text style={styles.sideText}>+15s</Text>
          </Pressable>
        </View>

        <View style={styles.syncBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.syncTitle}>🎧 一起听</Text>
            <Text style={styles.syncMeta} numberOfLines={1}>
              {partnerFm
                ? `TA ${mmss(partnerFm.positionSec)}${partnerFm.playing ? ' 播放中' : ' 已暂停'}${
                    sameAsPartner ? '' : '（另一集）'
                  }`
                : 'TA 现在没在听'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable onPress={syncHere} style={[styles.syncBtn, { backgroundColor: night.cyan }]}>
              <Text style={[styles.syncBtnText, { color: '#08111F' }]}>↻ 同步到这里</Text>
            </Pressable>
            <Pressable onPress={followPartner} style={styles.syncBtn} disabled={!partnerFm}>
              <Text style={[styles.syncBtnText, { color: night.text, opacity: partnerFm ? 1 : 0.4 }]}>
                跟随 TA
              </Text>
            </Pressable>
          </View>
          {syncHint ? <Text style={styles.hint}>{syncHint}</Text> : null}
        </View>

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
              {SLEEPS.map((m) => {
                const on = m === 0 ? fm.sleepLeft <= 0 : Math.abs(fm.sleepLeft - m * 60) < 61;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setFmSleep(m)}
                    style={[styles.pill, on && styles.pillOn]}
                  >
                    <Text style={[styles.pillText, on && { color: '#08111F' }]}>
                      {m === 0 ? '关' : `${m}分`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {sleepLabel ? <Text style={styles.hint}>{sleepLabel}</Text> : null}
        </View>

        <Text style={styles.foot}>
          这一集的进度会同步给 TA（±2.5 秒对齐）；退出这一页、甚至切到别的模块，声音也会继续放。
        </Text>
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bgDeep },
  head: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.25)',
  },
  chipText: { color: night.text, fontSize: 12, fontWeight: '700' },
  headTitle: { flex: 1, textAlign: 'center', color: night.text, fontSize: 15, fontWeight: '800' },
  coverWrap: { alignItems: 'center', marginTop: 18 },
  cover: { width: 220, height: 220, borderRadius: 22 },
  coverFallback: {
    backgroundColor: 'rgba(87,248,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: night.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  album: { color: night.textDim, fontSize: 12, textAlign: 'center', marginTop: 4 },
  barTouch: { paddingVertical: 12, marginTop: 10 },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: night.cyan },
  barKnob: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: night.cyan,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  time: { color: night.textFaint, fontSize: 10.5 },
  hint: { color: night.textDim, fontSize: 10.5, marginTop: 8, textAlign: 'center' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 26,
    marginTop: 14,
  },
  side: {
    width: 60,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.20)',
  },
  sideText: { color: night.text, fontSize: 12, fontWeight: '700' },
  play: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.cyan,
  },
  syncBox: {
    marginTop: 18,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(87,248,255,0.22)',
  },
  syncTitle: { color: night.text, fontSize: 12.5, fontWeight: '800' },
  syncMeta: { flex: 1, textAlign: 'right', color: night.textDim, fontSize: 10.5, marginLeft: 8 },
  syncBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: 'rgba(87,248,255,0.16)',
    alignItems: 'center',
  },
  syncBtnText: { fontSize: 11.5, fontWeight: '800' },
  panel: {
    marginTop: 14,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.16)',
    gap: 10,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: night.text, fontSize: 12.5 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  pillOn: { backgroundColor: night.cyan },
  pillText: { color: night.text, fontSize: 11.5, fontWeight: '700' },
  foot: { color: night.textFaint, fontSize: 10, textAlign: 'center', marginTop: 18, lineHeight: 16 },
});
