import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import wallGif from '../../assets/cinema-night.gif';
import wallPng from '../../assets/cinema-night-still.png';
import { glow, night } from './nightTheme';
import { WallVideo } from './WallVideo';
import { useApp } from '../store';
import { getBackdropStill } from './backdropStill';
import { wallStills } from './wallVideos';

/**
 * 二次元夜景背景（纯代码绘制）
 *
 * 为什么不用壁纸图拉满整屏：工坊那张壁纸只有 190×190（预览图），拉大就是一坨马赛克。
 * 所以夜空是**画出来的**：分层渐变 + 星点 + 月晕 + 地平线极光 + 浮游光粒，
 * 配色全部取自那张壁纸；壁纸原图另外用 <WallpaperBadge> 以内置素材的形式嵌进主视觉。
 */

/** #RRGGBB → [r,g,b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16) || 0,
    Number.parseInt(h.slice(2, 4), 16) || 0,
    Number.parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/** 两色线性混合（t=0 取 a，t=1 取 b） */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const bl = Math.round(b1 + (b2 - b1) * k);
  return `rgb(${r},${g},${bl})`;
}

/** 固定的伪随机（同一屏每次渲染星点位置不变，避免闪烁跳动） */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const BAND_COUNT = 18;

/** 全屏夜空背景：放在页面最底层（absoluteFill） */
/**
 * 不播背景视频时（一起看/播放器页），**仍然铺你那张二次元壁纸**，
 * 只是用静态图（首帧截图），不再启动第二个解码器抢性能。
 * 以前这里退回的是内置夜景照片，所以用户看到的是"二次元背景没了"。
 */
function CustomBgStill() {
  const { snapshot, store } = useApp();
  const cb = (snapshot as unknown as { customBackground?: { url?: string; poster?: string | null } | null })
    .customBackground;
  const rel = cb?.poster || cb?.url;
  if (!rel) return <WallVideo which={1} />;
  const abs = getBackdropStill() ?? (rel.startsWith('http') ? rel : store.gameBaseUrl + rel);
  return (
    <Image
      pointerEvents="none"
      source={{ uri: abs }}
      style={[StyleSheet.absoluteFill, { zIndex: 9 }]}
      resizeMode="cover"
      fadeDuration={0}
    />
  );
}

/** 自定义壁纸（多半是很亮的二次元图）时，给页面压一层暗纱保证文字可读 */
function CustomBgVeil() {
  const { snapshot } = useApp();
  const custom = (snapshot as unknown as { customBackground?: { url?: string } | null }).customBackground;
  if (!custom?.url) return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: 'rgba(7,10,18,0.5)' }]}
    />
  );
}

export function NightBackdrop({
  variant = 'cinema',
  style,
  video = true,
}: {
  variant?: 'cinema' | 'live' | 'fm';
  style?: StyleProp<ViewStyle>;
  /**
   * false = 只铺**静态**壁纸，不启动播放器。
   * 观影房间 / 播放器页面必须传 false —— 那里已经有一路视频在解码，
   * 再开一路背景 MP4 就会抢解码器，表现就是"一起看特别卡、掉帧"。
   */
  video?: boolean;
}) {
  const rand = useMemo(() => seeded(variant === 'live' ? 20261121 : 19940718), [variant]);

  // 星点：越靠上越密
  const stars = useMemo(
    () =>
      Array.from({ length: 38 }, () => {
        const y = rand();
        return {
          x: rand() * 100,
          y: y * 62,
          size: 1 + rand() * 1.8,
          opacity: 0.25 + rand() * 0.6,
          twinkle: rand() > 0.78,
          delay: Math.floor(rand() * 1800),
        };
      }),
    [rand],
  );

  /*
   * CINEMA_TRANSPARENT：影院模块的背景交由外层 AppFrame 统一渲染
   * （外层能正常播你那支 MP4）。这里只留一层很淡的暗纱保证文字可读，
   * 不再画深蓝夜空渐变 —— 那层会把外层壁纸整个盖住。
   */
  if (variant === 'cinema') {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,10,20,0.30)' }]} />
      </View>
    );
  }

  const accent = variant === 'live' ? night.violet : night.cyan;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {/* 有自定义壁纸时压一层中性暗纱：壁纸还看得见，但页面上的浅色字不会糊掉 */}
      <CustomBgVeil />
      {video ? (
        <WallVideo
          which={variant === 'fm' ? 2 : variant === 'live' ? 0 : 1}
          preferBuiltinAnime={false}
        />
      ) : (
        <CustomBgStill />
      )}
      {/*
       * 注意：这里**不能**再叠一张内置夜景图。
       * 之前留着这段，它用 zIndex:9 画在里面那张"自定义壁纸静态图"上面，
       * 结果就是"一起看/详情页二次元壁纸又没了"。兜底逻辑统一交给 <CustomBgStill />。
       */}
      {/* 分层渐变：伪造纵向夜空渐变（不引入 expo-linear-gradient） */}
      <View style={StyleSheet.absoluteFill}>
        {Array.from({ length: BAND_COUNT }, (_, i) => {
          const t = i / (BAND_COUNT - 1);
          // 顶部更深，接近地平线偏紫（壁纸里的"夜幕渐层"）
          const top = mix(night.bgDeep, '#0E1533', Math.min(1, t * 1.6));
          const color = t < 0.72 ? top : mix('#0E1533', '#2A1A47', (t - 0.72) / 0.28);
          return (
            <View
              key={`band-${i}`}
              style={{
                flex: 1,
                backgroundColor: color,
                opacity: i === 0 ? 1 : 0.96,
              }}
            />
          );
        })}
      </View>

      {/* 星点 */}
      {stars.map((s, i) =>
        s.twinkle ? (
          <TwinkleStar key={`star-${i}`} {...s} />
        ) : (
          <View
            key={`star-${i}`}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              borderRadius: s.size,
              backgroundColor: '#FFFFFF',
              opacity: s.opacity,
            }}
          />
        ),
      )}

      {/* 月亮 + 三层光晕 */}
      <View style={styles.moonWrap}>
        <View style={[styles.moonHalo, styles.moonHalo3]} />
        <View style={[styles.moonHalo, styles.moonHalo2]} />
        <View style={[styles.moonHalo, styles.moonHalo1]} />
        <View style={styles.moonCore} />
      </View>

      {/* 地平线极光 */}
      <View style={[styles.aurora, { backgroundColor: accent, opacity: 0.14 }]} />
      <View style={[styles.auroraSmall, { backgroundColor: accent, opacity: 0.1 }]} />

      {/* 浮游光粒 */}
      {Array.from({ length: 5 }, (_, i) => (
        <Mote key={`mote-${i}`} index={i} color={i % 2 === 0 ? accent : night.gold} />
      ))}

      {/* 顶部/底部的压暗，让内容永远压得住 */}
      <View style={styles.topDim} />
      <View style={styles.bottomDim} />
    </View>
  );
}

/** 会呼吸的星 */
function TwinkleStar({
  x,
  y,
  size,
  opacity,
  delay,
}: {
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
}) {
  const v = useRef(new Animated.Value(opacity)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: opacity * 0.24,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: opacity,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity, v]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: '#FFFFFF',
        opacity: v,
      }}
    />
  );
}

/** 缓慢上浮的光粒 */
function Mote({ index, color }: { index: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  const left = 12 + index * 17;
  const size = 3 + (index % 3) * 2;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 900),
        Animated.timing(v, {
          toValue: 1,
          duration: 5200 + index * 700,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [index, v]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${left}%`,
        bottom: 40,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.75, 0.55, 0] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -220] }) }],
      }}
    />
  );
}

/**
 * 内置壁纸卡片
 *
 * 壁纸（Wallpaper Engine id 3470764447，伊蕾娜·夜幕）只有 190×190，
 * 所以当成"主视觉徽章"用：小尺寸 + 圆角 + 青色描边 + 外发光，看起来是块发光的小画。
 * gif 盖在 png 上面：万一某个设备不支持动图，底下还有一张静帧兜着（不会空白）。
 */
export function WallpaperBadge({
  size = 132,
  caption,
  onPress,
}: {
  size?: number;
  caption?: string;
  onPress?: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        {/* 外发光 */}
        <Animated.View
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            right: -8,
            bottom: -8,
            borderRadius: (size + 16) / 2,
            backgroundColor: glow.cyan,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] }),
          }}
        />
        <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
          <Image source={wallPng} style={{ width: size, height: size }} resizeMode="cover" />
          <Image
            source={wallGif}
            style={[StyleSheet.absoluteFill, { width: size, height: size }]}
            resizeMode="cover"
          />
          {/* 青色边缘光 */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: size / 2, borderWidth: 1.5, borderColor: night.cyanLine },
            ]}
          />
        </View>
      </View>
      {caption ? (
        <Text style={{ color: night.textDim, fontSize: 10.5, marginTop: 8, textAlign: 'center' }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** 一枚圆角小标签（夜空风格） */
export function NightPill({
  label,
  tone = 'cyan',
  active = false,
  small = false,
}: {
  label: string;
  tone?: 'cyan' | 'violet' | 'pink' | 'gold' | 'mint' | 'danger';
  active?: boolean;
  /** 二级分类条用小的，别抢主分类条的视觉重心 */
  small?: boolean;
}) {
  const map = {
    cyan: { solid: night.cyan, soft: night.cyanSoft, ink: night.textOnLight, text: night.cyan },
    violet: { solid: night.violet, soft: night.violetSoft, ink: '#150C2E', text: night.violet },
    pink: { solid: night.pink, soft: night.pinkSoft, ink: '#2B0A1C', text: night.pink },
    gold: { solid: night.gold, soft: night.goldSoft, ink: '#2B1F04', text: night.gold },
    mint: { solid: night.mint, soft: night.mintSoft, ink: '#04241A', text: night.mint },
    danger: { solid: night.danger, soft: night.dangerSoft, ink: '#2B0410', text: night.danger },
  } as const;
  const t = map[tone];
  return (
    <View
      style={{
        paddingHorizontal: small ? 8 : 9,
        paddingVertical: small ? 2.5 : 4,
        borderRadius: 999,
        backgroundColor: active ? t.solid : t.soft,
        borderWidth: 1,
        borderColor: active ? t.solid : night.line,
        opacity: active ? 1 : 0.92,
      }}
    >
      <Text style={{ fontSize: small ? 9.5 : 10.5, fontWeight: '700', color: active ? t.ink : t.text }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  moonWrap: {
    position: 'absolute',
    top: '6%',
    right: '10%',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moonHalo: { position: 'absolute', borderRadius: 999, backgroundColor: glow.moon },
  moonHalo3: { width: 120, height: 120, opacity: 0.1 },
  moonHalo2: { width: 82, height: 82, opacity: 0.16 },
  moonHalo1: { width: 54, height: 54, opacity: 0.24 },
  moonCore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: glow.moonCore,
    opacity: 0.92,
  },
  aurora: {
    position: 'absolute',
    left: '-30%',
    bottom: '-16%',
    width: '150%',
    height: 240,
    borderRadius: 999,
  },
  auroraSmall: {
    position: 'absolute',
    right: '-20%',
    bottom: '-8%',
    width: '90%',
    height: 150,
    borderRadius: 999,
  },
  topDim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 90,
    backgroundColor: 'rgba(4,7,16,0.45)',
  },
  bottomDim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    backgroundColor: 'rgba(4,7,16,0.55)',
  },
  badge: {
    overflow: 'hidden',
    backgroundColor: night.cardSolid,
  },
});
