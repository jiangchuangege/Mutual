import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';

import { ambienceFor, type Ambience } from '../core/ambience';

/**
 * 会跟着时间变的"天幕"。
 *
 * 用户要的：框架随春夏秋冬变化、白天黑夜也随时间变，看着高科技一点。
 * 做法上不引三方渐变库（之前 `npm install --legacy-peer-deps` 把 reanimated 之类
 * 顺手清过一次，宁可不用），而是：
 *   1. 三层半透明色带拼出竖直渐变（颜色由 ambience 按时段算好）；
 *   2. 一颗缓慢呼吸的光晕（放大 + 透明度循环，native driver，不占 JS 线程）；
 *   3. 夜里撒星星、白天撒光斑，按季节飘花瓣 / 落叶 / 雪。
 * 每秒只重算一次 ambience，颜色/季节切换是淡入的。
 */
export function AmbientSky() {
  const [amb, setAmb] = useState<Ambience>(() => ambienceFor(new Date()));
  const [w, setW] = useState(Dimensions.get('window').width);
  const [h, setH] = useState(Dimensions.get('window').height);

  // 每分钟刷一次就够（时段切换很慢），但窗口尺寸变化要立刻跟
  useEffect(() => {
    const tick = () => setAmb(ambienceFor(new Date()));
    const timer = setInterval(tick, 60_000);
    tick();
    return () => clearInterval(timer);
  }, []);

  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  // 固定的一组浮游物位置（不要每帧随机，那样会闪）
  const motes = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        id: i,
        left: ((i * 37) % 88) + 4,
        top: ((i * 61) % 70) + 6,
        size: 10 + ((i * 13) % 10),
        delay: i * 620,
        drift: ((i % 2 === 0 ? 1 : -1) * (8 + (i % 4) * 6)),
      })),
    [],
  );

  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });

  return (
    <View
      pointerEvents="none"
      style={styles.root}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        setH(e.nativeEvent.layout.height);
      }}
    >
      <View style={[styles.band, { height: h * 0.42, backgroundColor: amb.palette.skyTop }]} />
      <View
        style={[
          styles.band,
          { top: h * 0.36, height: h * 0.34, backgroundColor: amb.palette.skyMid },
        ]}
      />
      <View
        style={[
          styles.band,
          { top: h * 0.66, height: h * 0.34, backgroundColor: amb.palette.skyBottom },
        ]}
      />

      {/* 呼吸光晕：位置放在上三分之一，像天光 */}
      <Animated.View
        style={[
          styles.glow,
          {
            left: w * 0.5 - 170,
            top: h * 0.06,
            width: 340,
            height: 340,
            borderRadius: 170,
            backgroundColor: amb.palette.glow,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* 季节里的浮游物：夜里少一点、淡一点 */}
      {motes.map((m) => (
        <Mote
          key={m.id}
          emoji={amb.mote}
          left={(m.left / 100) * w}
          top={(m.top / 100) * h}
          size={m.size}
          delay={m.delay}
          drift={m.drift}
          dim={amb.palette.stars}
        />
      ))}

      {/* 夜里的星星：只画静态小点，避免 CPU 抖动 */}
      {amb.palette.stars
        ? Array.from({ length: 18 }, (_, i) => (
            <View
              key={`star-${i}`}
              style={[
                styles.star,
                {
                  left: ((i * 53) % 96) + 2 + '%',
                  top: ((i * 29) % 55) + 2 + '%',
                  opacity: 0.25 + ((i % 4) * 0.14),
                },
              ]}
            />
          ))
        : null}
    </View>
  );
}

/** 一个慢慢上浮、左右摇的浮游物（花瓣 / 落叶 / 雪 / 光点） */
function Mote({
  emoji,
  left,
  top,
  size,
  delay,
  drift,
  dim,
}: {
  emoji: string;
  left: number;
  top: number;
  size: number;
  delay: number;
  drift: number;
  dim: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 11000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -90] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.75, 0.5, 0] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '24deg'] });

  return (
    <Animated.Text
      style={[
        styles.mote,
        {
          left,
          top,
          fontSize: size,
          opacity: dim ? Animated.multiply(opacity, 0.55) : opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, top: 0 },
  glow: { position: 'absolute' },
  mote: { position: 'absolute' },
  star: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
});
