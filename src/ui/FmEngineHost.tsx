import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cleanEpisodeTitle } from '../core/jiaojiaoFm';
import { night } from './nightTheme';
import { getFmState, pauseFm, subscribeFmEngine, toggleFm, type FmEngineState } from './fmEngine';
import { radius } from './theme';

/**
 * 焦焦FM 的全局宿主（挂在 AppFrame 上，和 MusicEngineHost 同级）。
 *
 * 做两件事：
 *  1. `useFmEngine()` 给任何页面订阅播放状态（列表页、播放页都用它）；
 *  2. 在**非 FM 页面**悬浮一条迷你条：说明"FM 还在后台放"，并提供暂停/回到播放页。
 *
 * 这样"退出 FM 模块就听不到"就彻底消失了 —— 播放器不再跟着页面卸载。
 */
export function useFmEngine(): FmEngineState {
  return React.useSyncExternalStore(subscribeFmEngine, getFmState, getFmState);
}

export function FmEngineHost({ children }: { children?: React.ReactNode }) {
  return (
    <>
      {children}
      <FmFloatingBar />
    </>
  );
}

function FmFloatingBar() {
  const state = useFmEngine();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /* 在 FM 自己的两个页面里不需要这条（那边有完整的迷你条/播放页） */
  const onFmPage = Boolean(pathname && pathname.startsWith('/jiaojiao-fm'));
  if (!state.item || onFmPage) return null;

  const mmss = (sec: number) =>
    `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 84 }]}>
      <Pressable
        style={styles.pill}
        onPress={() =>
          router.push({
            pathname: '/jiaojiao-fm-player',
            params: {
              audio: state.item?.audio ?? '',
              title: state.item?.title ?? '',
              album: state.item?.album ?? '',
              cover: state.item?.cover ?? '',
              key: state.item?.key ?? '',
              startSec: String(Math.round(state.position)),
            },
          })
        }
      >
        <Text style={styles.emoji}>🎙</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {cleanEpisodeTitle(state.item.title) || '焦焦FM'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {state.playing ? 'FM 正在后台播放' : 'FM 已暂停'} · {mmss(state.position)}
            {state.sleepLeft > 0 ? ` · 睡眠 ${Math.ceil(state.sleepLeft / 60)} 分` : ''}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => (state.playing ? pauseFm() : toggleFm())}
          style={styles.btn}
        >
          <Text style={styles.btnText}>{state.playing ? '暂停' : '继续'}</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    alignItems: 'center',
    /* 高于内容、低于全局提示框（ActivityDock 1200） */
    zIndex: 900,
    elevation: 18,
  },
  pill: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,18,36,0.92)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(87,248,255,0.45)',
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  emoji: { fontSize: 15, marginRight: 8 },
  title: { color: night.text, fontSize: 12.5, fontWeight: '700' },
  meta: { color: night.textDim, fontSize: 10, marginTop: 1 },
  btn: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(87,248,255,0.92)',
  },
  btnText: { color: '#08111F', fontSize: 11, fontWeight: '800' },
});
