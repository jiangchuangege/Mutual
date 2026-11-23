import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * 页面纹理 + 入场动效（每页一层，颜色跟着该页主题走）。
 *
 * 只做两件很小的事，所以不会影响任何布局/逻辑：
 *   1. 纹理：极淡的点阵 + 斜向线，让奶油色页面不那么平（纯 View 绘制，不加图片、不加体积）
 *   2. 入场：进页面时一层同色薄雾 380ms 淡出 = 视觉上的"亮起来"，不阻挡点击
 */
export type FlairKey = 'today' | 'life' | 'care' | 'us';

const FLAIR: Record<FlairKey, { tint: string; dot: string; line: string }> = {
  today: { tint: '#FFF3E2', dot: 'rgba(233,162,75,0.10)', line: 'rgba(233,162,75,0.07)' },
  life: { tint: '#EAF9EF', dot: 'rgba(79,174,124,0.10)', line: 'rgba(79,174,124,0.07)' },
  care: { tint: '#FFEFF4', dot: 'rgba(232,115,154,0.10)', line: 'rgba(232,115,154,0.07)' },
  us: { tint: '#3A1B29', dot: 'rgba(240,179,200,0.14)', line: 'rgba(240,179,200,0.09)' },
};

export function Flair({ theme = 'today' }: { theme?: FlairKey }) {
  const c = FLAIR[theme] ?? FLAIR.today;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 380,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  // 点阵（固定位置，不用随机，避免每次重渲染跳动）
  const dots = useMemo(() => {
    const out: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < 22; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        out.push({ x: col * 38 + (row % 2 ? 19 : 0), y: row * 38 });
      }
    }
    return out;
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 点阵 */}
      {dots.map((d, i) => (
        <View
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: 3,
            height: 3,
            borderRadius: 2,
            backgroundColor: c.dot,
          }}
        />
      ))}
      {/* 斜向细线（三条，拉开层次） */}
      {[0.18, 0.52, 0.78].map((p, i) => (
        <View
          key={`l${i}`}
          style={{
            position: 'absolute',
            left: -40,
            top: `${p * 100}%`,
            width: '140%',
            height: 1,
            backgroundColor: c.line,
            transform: [{ rotate: '-8deg' }],
          }}
        />
      ))}
      {/* 入场薄雾：一开始是同色，很快淡出 */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: c.tint, opacity: fade }]}
      />
    </View>
  );
}
