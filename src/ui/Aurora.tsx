import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { night } from './nightTheme';
import { blurProps, shouldUseBlur } from './blurTarget';
import { WallVideo } from './WallVideo';
import { useApp } from '../store';

/**
 * 二次元夜景的「极光层」—— 用真渐变画流动星河，替代原来手涂的半透明层。
 *
 * 纯 View + LinearGradient + Animated，不依赖 Skia/Reanimated，装上就能跑，
 * 而且只在用它的页面里生效（模块内部各自用自己的配色，互不影响）。
 *
 * 结构（自下而上）：
 *   1. 深色底渐变（夜色 → 深紫）
 *   2. 两条斜向光带（缓慢左右漂移 = 星河流动）
 *   3. 顶部暖光晕（月亮方向）
 *   4. 底部青蓝反光（地平线方向）
 */
export function Aurora({
  accent = night.cyan as unknown as string,
  intensity = 1,
  mode = 'dark',
  useCustom = true,
  which = 0,
  style,
}: {
  accent?: string;
  /** 0.4 ~ 1.4，越大越亮 */
  intensity?: number;
  /** dark = 夜景模块（影院/直播）；light = 浅色页面（今天/生活/关怀/我们） */
  mode?: 'dark' | 'light';
  /** true = 用用户上传的背景；模块页面传 false，各用自己那段壁纸 */
  useCustom?: boolean;
  /** 模块自己的壁纸序号：0=直播 1=影院 2=FM */
  which?: 0 | 1 | 2;
  style?: StyleProp<ViewStyle>;
}) {
  const light = mode === 'light';
  /** 有上传的背景时，浅色底板绝对不能画（会把视频整个盖住 —— 用户实测背景不变） */
  const { snapshot } = useApp();
  const hasCustom = useCustom && !!(
    snapshot as unknown as { customBackground?: { url?: string } | null }
  ).customBackground?.url;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const shiftX = drift.interpolate({ inputRange: [0, 1], outputRange: [-40, 40] });
  const shiftX2 = drift.interpolate({ inputRange: [0, 1], outputRange: [50, -30] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {/*
       * 0. 用户上传的背景（图片/视频）放最底。
       * 有自定义背景时 AppFrame 已经在最外层铺了一份，这里**不要**再开第二个播放器
       * （两路同时解码同一个 MP4 会卡、也会闪），直接跳过。
       */}
      {/*
       * 有自定义背景时也铺：影院/直播/FM 这几个模块现在由 AppFrame 让路
       * （不再开第二路解码），模块自己的 WallVideo 走同一份**本地缓存**，
       * 所以这里只要一直渲染，画面就是同一张、但只解码一次、而且立刻出来。
       */}
      <WallVideo which={which} allowCustom={useCustom} style={{ zIndex: 0 }} />

      {/*
       * 1. 底色渐变：只有浅色页面才画底。
       * 夜景模块底下有壁纸视频 + NightSky，再画不透明底会把壁纸盖住。
       */}
      {light && !hasCustom ? (
        <LinearGradient
          colors={['#FFFFFF', '#FFF9F2', '#FFF3E8', '#FFFFFF']}
          locations={[0, 0.35, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* 2. 两条斜向光带（星河） */}
      <Animated.View
        style={[
          styles.band,
          { transform: [{ translateX: shiftX }, { rotate: '-18deg' }], opacity: 0.16 * intensity },
        ]}
      >
        <LinearGradient
          colors={['transparent', accent, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bandInner}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.band2,
          {
            transform: [{ translateX: shiftX2 }, { rotate: '-18deg' }],
            opacity: (light ? 0.10 : 0.12) * intensity,
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', light ? accent : '#A98BFF', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bandInner}
        />
      </Animated.View>

      {/* 3. 顶部光晕（夜景是月晕暖金；浅色页面是一抹淡主色，保持通透） */}
      <LinearGradient
        colors={light ? [`${accent}22`, 'transparent'] : ['rgba(255,211,122,0.20)', 'transparent']}
        start={{ x: 0.8, y: 0 }}
        end={{ x: 0.3, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 4. 底部反光（浅色页面几乎不要，只留一点点主色温度） */}
      <LinearGradient
        colors={light ? ['transparent', `${accent}14`] : ['transparent', 'rgba(87,248,255,0.16)']}
        start={{ x: 0.2, y: 0.55 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * 毛玻璃卡片 —— 真·原生模糊（expo-blur），比"半透明色块"高级一档。
 * 模块内部用它；外壳用它；四套浅色主题也能用（tint="light"）。
 */
export function Glass({
  children,
  tone = 'dark',
  radius = 18,
  style,
}: {
  children?: React.ReactNode;
  /** dark = 夜景玻璃（偏黑通透）；light = 浅色页（偏白通透） */
  tone?: 'dark' | 'light';
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const isDark = tone === 'dark';
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      {/*
       * 背景是视频时（AppFrame 那支壁纸 MP4）不跑 BlurView：
       * 它会把"一直在变的视频"当模糊目标，等于每帧重新糊一次整块，
       * 表现就是这张卡片**一直在闪**、还特别费电。
       * 底下那层深色/白色蒙版本来就把可读性撑住了，视觉几乎没差别。
       */}
      {shouldUseBlur() ? (
        <BlurView
          intensity={isDark ? 26 : 40}
          tint={isDark ? 'dark' : 'light'}
          {...blurProps}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            // 用户明确：UI 必须在背景之上、要看得见 —— 玻璃给足白度，别让内容糊进壁纸
            backgroundColor: isDark ? 'rgba(12,18,34,0.80)' : 'rgba(255,255,255,0.90)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)',
            borderRadius: radius,
          },
        ]}
      />
      <View style={{ padding: 14 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: '18%',
    left: '-30%',
    width: '160%',
    height: 120,
  },
  band2: {
    position: 'absolute',
    top: '52%',
    left: '-30%',
    width: '160%',
    height: 150,
  },
  bandInner: { flex: 1, borderRadius: 999 },
});
