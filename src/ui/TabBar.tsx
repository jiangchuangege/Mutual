import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { blurProps } from './blurTarget';

import { color, font, radius } from './theme';
import { useApp } from '../store';

export type TabKey = 'today' | 'life' | 'care' | 'cinema' | 'us';

const TABS: Array<{ key: TabKey; href: string; emoji: string; label: string }> = [
  { key: 'today', href: '/', emoji: '🏠', label: '今天' },
  { key: 'life', href: '/life', emoji: '🗂️', label: '生活' },
  { key: 'care', href: '/care', emoji: '🌿', label: '关怀' },
  { key: 'cinema', href: '/cinema', emoji: '🎬', label: '影院' },
  { key: 'us', href: '/us', emoji: '💞', label: '我们' },
];

export function TabBar({ active }: { active: TabKey }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /*
   * 外壳强调色：优先用用户上传背景时服务端算出的主色（customBackground.accent），
   * 没有上传背景就回退默认青蓝 #57F8FF。
   * 只影响外壳（底部导航高亮/描边），模块内部各用自己的配色。
   */
  const { snapshot } = useApp();
  const shellAccent =
    (snapshot as unknown as { customBackground?: { accent?: string | null } | null }).customBackground
      ?.accent || '#57F8FF';

  const hasCustomBg = !!(snapshot as unknown as { customBackground?: { url?: string } | null })
    .customBackground?.url;
  return (
    <View style={[styles.host, { paddingBottom: Math.max(8, insets.bottom) }]}>
      <View
        style={[
          styles.bar,
          // 有自定义背景时：底色交给「模糊 + 白色薄层」，别压暖白（用户嫌黄）
          hasCustomBg ? { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.72)' } : null,
        ]}
      >
        {/* 外壳毛玻璃：真·原生模糊（底部导航透出背景画面） */}
        <BlurView
          intensity={38}
          tint="light"
          {...blurProps}
          style={StyleSheet.absoluteFill}
        />
        {hasCustomBg ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.86)' }]}
          />
        ) : null}
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                if (!isActive) router.replace(tab.href as never);
              }}
              style={styles.item}
            >
              <View style={[styles.iconWrap, isActive ? { backgroundColor: `${shellAccent}2E` } : null]}>
                <Text style={{ fontSize: 17, opacity: isActive ? 1 : 0.55 }}>{tab.emoji}</Text>
              </View>
              <Text
                style={[
                  font.tiny,
                  {
                    marginTop: 2,
                    color: isActive ? shellAccent : color.inkFaint,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,252,250,0.55)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginHorizontal: 12,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    shadowColor: '#B58C79',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  item: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  iconWrap: {
    width: 34,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: color.primarySoft },
});
