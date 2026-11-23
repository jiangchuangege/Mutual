import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, ImageSourcePropType, StyleSheet, View, useWindowDimensions } from 'react-native';

/**
 * 四季氛围特效层（全 App 一层，铺在背景之上、内容之下，不吃点击）。
 *
 * 五层叠加，全部 Animated + native driver：
 *   1. 极光  — 两条大柔光带，**只动透明度 + 横向位移**（不动 rot/scale，省 GPU）
 *   2. 星穹  — 14 颗星点呼吸闪烁
 *   3. 流星  — 偶尔斜划一道
 *   4. 飘落  — 三层景深真素材精灵（冬天纯雪、下得更大）
 *   5. 烟花  — 十几秒一簇小烟花
 *
 * 性能（用户反馈"下雪偶尔掉帧"）：
 *   - 每个元素都 React.memo 住，父组件每秒重渲染也不会重建动画；
 *   - 元素数量压到 40 以内；
 *   - 不再对超大渐变做 rotate/scale（那会让系统每帧重新栅格化整屏）；
 *   - 雪花不做 scaleY 翻转（花瓣才需要），少一次矩阵运算。
 *
 * 素材：googlefonts/noto-emoji（GitHub）512px PNG，**打包进 APK**，
 * 不联网、不依赖系统 emoji 字体 —— 换机型长得都一样；素材就在安装包里，永久有效。
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/* eslint-disable @typescript-eslint/no-var-requires */
const SPRITES: Record<string, ImageSourcePropType> = {
  sakura: require('../../assets/particles/spring_sakura.png'),
  tulip: require('../../assets/particles/spring_tulip.png'),
  butterfly: require('../../assets/particles/spring_butterfly.png'),
  flower: require('../../assets/particles/spring_flower.png'),
  sparkle: require('../../assets/particles/summer_sparkle.png'),
  leafGreen: require('../../assets/particles/summer_leaf.png'),
  bee: require('../../assets/particles/summer_bee.png'),
  maple: require('../../assets/particles/autumn_maple.png'),
  leafDry: require('../../assets/particles/autumn_leaf.png'),
  leafYellow: require('../../assets/particles/autumn_leaf2.png'),
  snow: require('../../assets/particles/winter_snow.png'),
};
/* eslint-enable @typescript-eslint/no-var-requires */

/** 所有精灵（启动时预解码一次，之后直接从内存拿，不闪不卡） */
export const ALL_SPRITES: ImageSourcePropType[] = Object.values(SPRITES);

type SpriteKey = keyof typeof SPRITES;

const SEASON_SPRITES: Record<Season, SpriteKey[]> = {
  spring: ['sakura', 'flower', 'tulip', 'butterfly'],
  summer: ['sparkle', 'leafGreen', 'bee'],
  autumn: ['maple', 'leafDry', 'leafYellow'],
  // 冬天就单纯下雪：不放星星月亮（用户：黄色的月亮星星往下掉太丑）
  winter: ['snow'],
};

const AURORA_COLORS: Record<Season, [string, string, string]> = {
  spring: ['rgba(255,168,205,0.42)', 'rgba(190,224,255,0.22)', 'rgba(255,255,255,0.00)'],
  summer: ['rgba(112,246,224,0.36)', 'rgba(150,196,255,0.20)', 'rgba(255,255,255,0.00)'],
  autumn: ['rgba(255,186,116,0.38)', 'rgba(255,132,132,0.20)', 'rgba(255,255,255,0.00)'],
  winter: ['rgba(176,222,255,0.38)', 'rgba(198,178,255,0.22)', 'rgba(255,255,255,0.00)'],
};

type Layer = 0 | 1 | 2;

type LayerCfg = { size: [number, number]; speed: [number, number]; opacity: number; count: number; flip: boolean };

/** 春/夏/秋一套常规密度；冬天单独一套：雪花更大、更密、更实（用户要求"雪下大点"） */
const LAYER: Record<Season, Record<Layer, LayerCfg>> = {
  spring: {
    0: { size: [11, 16], speed: [11000, 17000], opacity: 0.3, count: 8, flip: true },
    1: { size: [17, 24], speed: [8200, 12000], opacity: 0.55, count: 7, flip: true },
    2: { size: [24, 34], speed: [6000, 9000], opacity: 0.8, count: 4, flip: true },
  },
  summer: {
    0: { size: [11, 16], speed: [11000, 17000], opacity: 0.3, count: 8, flip: true },
    1: { size: [17, 24], speed: [8200, 12000], opacity: 0.55, count: 7, flip: true },
    2: { size: [24, 34], speed: [6000, 9000], opacity: 0.8, count: 4, flip: true },
  },
  autumn: {
    0: { size: [12, 17], speed: [11000, 17000], opacity: 0.32, count: 8, flip: true },
    1: { size: [18, 26], speed: [8200, 12000], opacity: 0.58, count: 7, flip: true },
    2: { size: [26, 38], speed: [6000, 9000], opacity: 0.82, count: 4, flip: true },
  },
  winter: {
    0: { size: [16, 22], speed: [13000, 19000], opacity: 0.5, count: 13, flip: false },
    1: { size: [24, 34], speed: [9500, 14000], opacity: 0.78, count: 10, flip: false },
    2: { size: [38, 52], speed: [7000, 10000], opacity: 1, count: 6, flip: false },
  },
};

/** 确定性伪随机：同一个 key 每次渲染都一样，避免重渲染时元素"跳位" */
function rand(seed: number, mod: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.abs(x - Math.floor(x)) * mod;
}

export const SeasonParticles = React.memo(function SeasonParticlesInner({ season }: { season: Season }) {
  const { width, height } = useWindowDimensions();

  const flakes = useMemo(() => {
    const sprites = SEASON_SPRITES[season];
    const plan: Array<{
      key: string;
      sprite: SpriteKey;
      left: number;
      size: number;
      duration: number;
      delay: number;
      sway: number;
      spin: number;
      flip: boolean;
      opacity: number;
    }> = [];
    ([0, 1, 2] as Layer[]).forEach((layer) => {
      const cfg = LAYER[season][layer];
      for (let i = 0; i < cfg.count; i += 1) {
        const seed = layer * 97 + i * 13 + sprites.length;
        const [sMin, sMax] = cfg.size;
        const [dMin, dMax] = cfg.speed;
        plan.push({
          key: `${season}-${layer}-${i}`,
          sprite: sprites[i % sprites.length] ?? sprites[0]!,
          left: rand(seed + 1, Math.max(1, width - 4)),
          size: sMin + rand(seed + 2, sMax - sMin + 1),
          duration: dMin + rand(seed + 3, dMax - dMin),
          delay: rand(seed + 4, 9000),
          sway: 16 + rand(seed + 5, 34),
          spin: 160 + rand(seed + 6, 220),
          flip: cfg.flip,
          opacity: cfg.opacity,
        });
      }
    });
    return plan;
  }, [season, width]);

  const stars = useMemo(() => {
    const count = season === 'winter' ? 18 : 14;
    return Array.from({ length: count }, (_, i) => ({
      key: `star-${i}`,
      left: rand(i * 7 + 1, Math.max(1, width - 3)),
      top: rand(i * 11 + 3, Math.max(1, Math.round(height * 0.8))),
      size: 1.6 + rand(i * 5 + 2, 2.2),
      delay: rand(i * 3 + 5, 5200),
      duration: 2400 + rand(i * 13 + 7, 2600),
    }));
  }, [season, width, height]);

  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Aurora season={season} height={height} />
      {stars.map(({ key, ...s }) => (
        <Twinkle key={key} {...s} />
      ))}
      <Meteor width={width} height={height} />
      <Firework width={width} height={height} />
      {flakes.map(({ key, ...f }) => (
        <Flake key={key} {...f} height={height} />
      ))}
    </View>
  );
});

/** 极光：两条大柔光带，只做横向位移 + 透明度呼吸（不动 rot/scale，省 GPU） */
const Aurora = React.memo(function Aurora({ season, height }: { season: Season; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const colors = AURORA_COLORS[season];
  const bands = [
    { key: 'a', top: -height * 0.1, h: height * 0.52, amp: 26, from: 0.5 },
    { key: 'b', top: height * 0.46, h: height * 0.46, amp: -30, from: 0.34 },
  ] as const;

  return (
    <>
      {bands.map((b) => {
        const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-b.amp, b.amp] });
        const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [b.from, b.from * 0.66] });
        return (
          <Animated.View
            key={b.key}
            style={{
              position: 'absolute',
              top: b.top,
              left: '-20%',
              width: '140%',
              height: b.h,
              borderRadius: 999,
              opacity,
              transform: [{ translateX }],
            }}
          >
            <LinearGradient
              colors={colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, borderRadius: 999 }}
            />
          </Animated.View>
        );
      })}
    </>
  );
});

const Twinkle = React.memo(function Twinkle({
  left,
  top,
  size,
  delay,
  duration,
}: {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay, duration]);

  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.85] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        opacity,
      }}
    />
  );
});

/** 流星：一道细长光尾斜划而过，不打断阅读 */
const Meteor = React.memo(function Meteor({ width, height }: { width: number; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => {
    const startX = 0.15 * width + rand(17, width * 0.7);
    const startY = rand(29, height * 0.34);
    const dist = 0.5 * width + rand(31, 90);
    return { startX, startY, dist, delay: 3000 + rand(37, 9000), duration: 1100 + rand(41, 700) };
  }, [width, height]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(cfg.delay),
        Animated.timing(t, { toValue: 1, duration: cfg.duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(5200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, cfg.delay, cfg.duration]);

  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, cfg.dist] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, cfg.dist * 0.62] });
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 0.95, 0.85, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cfg.startX,
        top: cfg.startY,
        opacity,
        transform: [{ rotate: '32deg' }, { translateX }, { translateY }],
      }}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: 96, height: 2.2, borderRadius: 2 }}
      />
    </Animated.View>
  );
});

/** 烟花：一簇 8 颗小火星，十几秒放一次 */
const Firework = React.memo(function Firework({ width, height }: { width: number; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => {
    const cx = 0.18 * width + rand(19, width * 0.62);
    const cy = 0.1 * height + rand(23, height * 0.32);
    const palette = ['#FFD9EC', '#FFB3D9', '#C9E6FF'];
    const parts = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + rand(i + 3, 0.5);
      const dist = 34 + rand(i * 3 + 5, 26);
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, color: palette[i % palette.length]! };
    });
    return { cx, cy, parts, delay: 6000 + rand(43, 9000) };
  }, [width, height]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(cfg.delay),
        Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(8000),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, cfg.delay]);

  const opacity = t.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 0.9, 0.55, 0] });

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: cfg.cx, top: cfg.cy }}>
      {cfg.parts.map((p, i) => {
        const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const ty = t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] });
        return (
          <Animated.View
            key={`p-${i}`}
            style={{
              position: 'absolute',
              width: 3.4,
              height: 3.4,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX: tx }, { translateY: ty }],
            }}
          />
        );
      })}
    </View>
  );
});

const Flake = React.memo(function Flake({
  sprite,
  left,
  size,
  duration,
  delay,
  sway,
  spin,
  flip,
  opacity,
  height,
}: {
  sprite: SpriteKey;
  left: number;
  size: number;
  duration: number;
  delay: number;
  sway: number;
  spin: number;
  flip: boolean;
  opacity: number;
  height: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, duration, delay]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-70, height + 80] });
  const translateX = t.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0, sway, -sway * 0.7, sway * 0.4],
  });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin}deg`] });
  const flipScale = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0.55, 1, 0.6, 1],
  });

  return (
    <Animated.Image
      source={SPRITES[sprite]}
      fadeDuration={0}
      style={{
        position: 'absolute',
        left,
        top: 0,
        width: size,
        height: size,
        opacity,
        transform: flip
          ? [{ translateY }, { translateX }, { rotate }, { scaleY: flipScale }]
          : [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
});
