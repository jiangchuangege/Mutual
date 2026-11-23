import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { night, nightFont } from './nightTheme';
import { color, font } from './theme';
import { surf } from './theme';

/**
 * 可折叠区块（影院 / 直播设置页共用）
 *
 * 用户明确要求：片源接口列表和直播源列表「都要能折叠」。
 * 这里是同一个组件，两处复用，行为一致（默认收起，点标题栏展开）。
 *
 * 为什么不用 LayoutAnimation：RN 0.88 在 Fabric 下 LayoutAnimation 在部分安卓机型上
 * 会闪一下白块；这里用「箭头旋转 + 内容直接挂载/卸载」，不依赖平台动画实现，稳定。
 */
export function Collapsible({
  title,
  subtitle,
  emoji,
  right,
  defaultOpen = false,
  badge,
  tone = 'cyan',
  variant = 'night',
  style,
  children,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  emoji?: string;
  /** 标题右边的自定义内容（比如"去检测"按钮） */
  right?: React.ReactNode;
  defaultOpen?: boolean;
  /** 标题上的小数字/小标签（比如"3 个接口"） */
  badge?: string;
  tone?: 'cyan' | 'violet' | 'pink' | 'gold';
  /** night = 影院/直播的夜景风；light = 「我们」设置页的奶油风 */
  variant?: 'night' | 'light';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const spin = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(spin, {
      toValue: open ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [open, spin]);

  const light = variant === 'light';
  const accent = light
    ? tone === 'violet'
      ? color.lavender
      : tone === 'pink'
        ? color.care
        : tone === 'gold'
          ? color.butter
          : color.primary
    : tone === 'violet'
      ? night.violet
      : tone === 'pink'
        ? night.pink
        : tone === 'gold'
          ? night.gold
          : night.cyan;

  const hostStyle = light
    ? { backgroundColor: surf('base'), borderColor: color.line }
    : { backgroundColor: night.glass, borderColor: night.line };
  const titleStyle = light ? [font.h3, { color: color.ink }] : [nightFont.h2, { fontSize: 14.5 }];
  const subStyle = light ? [font.small] : [nightFont.small, { marginTop: 2 }];

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <View style={[styles.host, hostStyle, style]}>
      <Pressable onPress={toggle} style={styles.header} android_ripple={{ color: 'rgba(87,248,255,0.08)' }}>
        <View
          style={[
            styles.emojiBox,
            { borderColor: `${accent}55`, backgroundColor: light ? surf('alt') : `${accent}14` },
          ]}
        >
          <Text style={{ fontSize: 14 }}>{emoji ?? '📁'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={titleStyle} numberOfLines={1}>
              {title}
            </Text>
            {badge ? (
              <View style={[styles.badge, { borderColor: `${accent}55`, backgroundColor: `${accent}1A` }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: accent }}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={subStyle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={{ marginRight: 6 }}>{right}</View> : null}
        <Animated.Text
          style={{
            color: accent,
            fontSize: 13,
            fontWeight: '700',
            transform: [
              {
                rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }),
              },
            ],
          }}
        >
          ›
        </Animated.Text>
      </Pressable>
      {open ? (
        <View
          style={[
            styles.body,
            { borderTopColor: light ? color.line : night.line },
          ]}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  emojiBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    marginLeft: 7,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: night.line,
    paddingTop: 10,
  },
});
