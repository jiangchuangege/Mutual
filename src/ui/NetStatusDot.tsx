import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppOptional } from '../store';
import { color, font, radius } from './theme';
import { surf } from './theme';

/**
 * 网络状态指示灯。
 *
 * 绿 = 长连接正常；黄 = 连接中 / 断线重连中（带倒计时）；红 = 已断开；灰 = 本机模式。
 * 点一下直接跳到「我们 → 同步服务器」。
 */
export function NetStatusDot({ showLabel = true }: { showLabel?: boolean }) {
  const router = useRouter();
  const app = useAppOptional();
  if (!app) return null;

  const net = app.store.netStatus;
  const dotColor =
    net.tone === 'ok'
      ? color.ok
      : net.tone === 'warn'
        ? color.butter
        : net.tone === 'danger'
          ? color.danger
          : color.inkFaint;
  const bg =
    net.tone === 'ok'
      ? color.mintSoft
      : net.tone === 'warn'
        ? color.butterSoft
        : net.tone === 'danger'
          ? color.dangerSoft
          : surf('alt');
  const ink =
    net.tone === 'ok'
      ? color.ok
      : net.tone === 'warn'
        ? color.careInk
        : net.tone === 'danger'
          ? color.danger
          : color.inkSoft;

  return (
    <Pressable
      onPress={() => router.push('/us')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`网络状态：${net.label}`}
      style={({ pressed }) => [styles.pill, { backgroundColor: bg }, pressed ? { opacity: 0.7 } : null]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      {showLabel ? (
        <Text style={[font.tiny, { color: ink, fontWeight: '700' }]} numberOfLines={1}>
          {net.label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
