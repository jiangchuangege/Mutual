import { usePathname } from 'expo-router';
import { ensureLive2dFiles } from './live2dWriter';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';

// 这个版本的 @types 对 WebView 泛型比较挑，放宽成 any，运行期行为不变
const WebView = RNWebView as unknown as React.ComponentType<any>;

/**
 * 二次元 Live2D 看板娘挂件（**就是 haremu 那篇里那个 tia 模型**）。
 *
 * 素材：https://github.com/galnetwen/Live2D （model.moc / 贴图 / 25 个动作 / live2d.js 运行时）
 * 我把它们连同原版 live2d.css、原版 #landlord + canvas 结构**全部内联**成一份自包含的
 * widget.html（约 1.16MB）打进 APK：不联网、不依赖任何外部文件 → 真正永久内置。
 *
 * 外观：外面是一张**实体卡片**（不透明深紫底 + 圆角 + 紫边，用户要求"不要透明、要实体"），
 * 里面跑 Live2D。万一模型没跑起来（老运行时对某些机型水土不服），
 * 卡片里自动退回同一张壁纸抠出来的女孩图，绝不留一块空白。
 *
 * 不挡字：卡片只有 88×120，贴左下角，看片页 / 横屏自动消失。
 */
const FALLBACK = require('../../assets/pet/girl.png');
const HEART = require('../../assets/pet/pet_heart.png');

const LINES = ['一起看部片吗～', '今天的你好可爱', '我一直在这儿哦', '摸摸头～', '要不要听首歌？'];

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith('/room') ||
    pathname.startsWith('/live-player') ||
    pathname.startsWith('/jiaojiao-fm-player') ||
    pathname.startsWith('/cinema-detail')
  );
}

const CARD_W = 66;
const CARD_H = 76;

export function AnimePet({ horizontal }: { horizontal: boolean }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [live2dOk, setLive2dOk] = useState(false);
  const [failed, setFailed] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const breath = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const webRef = useRef<any>(null);
  const hide = horizontal || shouldHide(pathname);

  useEffect(() => {
    let alive = true;
    // 把整套 Live2D 文件按原始相对路径解到本地，再用 file:// 打开（和网页里跑的是同一套）
    void ensureLive2dFiles()
      .then((page) => {
        if (!alive) return;
        if (page) setUri(page);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // 5 秒没回 ok 就退回抠图（老 live2d 运行时在部分机型上画不出来）
  useEffect(() => {
    if (!uri || live2dOk) return;
    const timer = setTimeout(() => setFailed(true), 20000);
    return () => clearTimeout(timer);
  }, [uri, live2dOk]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  if (hide) return null;

  const poke = () => {
    webRef.current?.injectJavaScript('window.__poke && window.__poke(); true;');
    Animated.sequence([
      Animated.timing(hop, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(hop, { toValue: 0, duration: 280, easing: Easing.bounce, useNativeDriver: true }),
    ]).start();
    setLine(LINES[Math.floor(Math.random() * LINES.length)] ?? LINES[0]!);
    bubble.setValue(0);
    Animated.timing(bubble, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(bubble, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setLine(null));
    }, 2400);
  };

  const scaleY = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  const hopY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const opacity = bubble.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const showLive2d = Boolean(uri) && !failed;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 4 }]}>
      {line ? (
        <Animated.View style={[styles.bubble, { opacity }]}>
          <Text style={styles.bubbleText} numberOfLines={2}>
            {line}
          </Text>
        </Animated.View>
      ) : null}
      <Pressable onPress={poke} hitSlop={4}>
        <Animated.View style={[styles.card, { transform: [{ translateY: hopY }, { scaleY }] }]}>
          {/*
           * 永远先铺一张兜底图，Live2D 真正 ready 之后再盖上去（opacity 切换）。
           * 之前是"要么 WebView 要么图片"，WebView 还在加载/模型没起来时那一块就是空的，
           * 表现就是用户说的"挂件一会儿有一会儿没有"。
           */}
          <Image source={FALLBACK} style={styles.girl} resizeMode="cover" fadeDuration={0} />
          {showLive2d ? (
            <WebView
              ref={webRef}
              source={{ uri: uri as string }}
              originWhitelist={['*']}
              allowFileAccess
              allowFileAccessFromFileURLs
              allowUniversalAccessFromFileURLs
              javaScriptEnabled
              domStorageEnabled={false}
              scrollEnabled={false}
              overScrollMode="never"
              androidLayerType="hardware"
              pointerEvents="none"
              onMessage={(e: { nativeEvent?: { data?: string } }) => {
                const d = String(e?.nativeEvent?.data ?? '');
                if (d === 'ok') setLive2dOk(true);
                else if (d.startsWith('err')) setFailed(true);
              }}
              style={[styles.web, { opacity: live2dOk ? 1 : 0 }]}
              containerStyle={styles.web}
            />
          ) : null}

        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * 贴在**底部导航条最左侧的空白区**（那里只有图标、没有文字）——
   * 用户明确要求挂件绝不能压到字，所以不再浮在内容区上面。
   */
  host: { position: 'absolute', right: 0, zIndex: 880, alignItems: 'flex-end' },
  /* 实体卡片：不透明底 + 圆角 + 紫边（用户要求"不要透明，要实体"） */
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',

    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  web: { width: CARD_W, height: CARD_H, backgroundColor: 'transparent' },
  girl: { width: '100%', height: '100%' },
  heart: { position: 'absolute', right: 4, top: 4, width: 13, height: 13, opacity: 0.9 },
  bubble: {
    maxWidth: 128,
    marginBottom: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 11,
    backgroundColor: 'rgba(18,14,28,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(169,139,255,0.45)',
  },
  bubbleText: { color: '#F4EDFF', fontSize: 10, fontWeight: '600', lineHeight: 13.5 },
});