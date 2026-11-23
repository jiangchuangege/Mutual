import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Asset } from 'expo-asset';
import bgs, { wallStills } from './wallVideos';

/*
 * BUILTIN_ANIME_BG：你们那张二次元壁纸（打包在 APK 里）。
 * 云服务器关掉之后，空间状态（customBackground）根本拿不到，
 * 模块页就退回"内置夜景"了 —— 看起来就是"二次元背景没了"。
 * 这里让它优先用这张内置壁纸。
 */
const BUILTIN_ANIME_BG = require('../../assets/bg/bg.mp4');
import { peekBackgroundVideo, resolveBackgroundVideo } from './bgVideoCache';
import { useApp } from '../store';
import { night } from './nightTheme';

/**
 * 壁纸视频背景（创意工坊那张壁纸的手机版 MP4）。
 *
 * 用户要的："画面一定给我套进去"。工坊目录里的 scene.pkg 是 320MB 的 WE 专有场景包，
 * 没有解码器用不了；但作者另发了手机/平板版 MP4 —— 那两个才是能直接播的画面，
 * 所以这里用 expo-video 做「静音 + 循环 + cover 满屏」背景，上面压一层暗色保证文字可读。
 *
 * 兜底：视频起不来（老机型/解码失败/用户关了动效）就不渲染，交给下层纯代码夜景，绝不黑屏。
 */
export function WallVideo({
  which = 0,
  enabled = true,
  allowCustom = true,
  preferBuiltinAnime = false,
  style,
}: {
  /** 0 = 直播页那张，1 = 影院页那张 */
  which?: 0 | 1 | 2;
  enabled?: boolean;
  /** false = 忽略上传的背景，用内置壁纸（模块页面用） */
  allowCustom?: boolean;
  /** true = 没有可用的自定义背景时，用打包在 APK 里的那张二次元壁纸 */
  preferBuiltinAnime?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [ok, setOk] = useState(true);
  /** 内置二次元壁纸解析出来的本地 file uri */
  const [builtinUri, setBuiltinUri] = useState<string | null>(null);
  useEffect(() => {
    if (!preferBuiltinAnime) return;
    let alive = true;
    void Asset.fromModule(BUILTIN_ANIME_BG)
      .downloadAsync()
      .then((a) => {
        if (alive) setBuiltinUri(a.localUri ?? a.uri ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [preferBuiltinAnime]);
  /*
   * 用户上传的自定义背景优先（两台手机共用同一段，存在空间里）。
   * 用它的时候**不加任何暗色遮罩** —— 用户明确要"满屏铺满、一点阴霾都不要"。
   */
  const { snapshot } = useApp();
  const allCustom = (snapshot as unknown as {
    customBackground?: { url: string; type: 'image' | 'video'; poster?: string | null; updatedAt?: number } | null;
  }).customBackground;
  const custom = allowCustom ? allCustom : null;
  const baseUrl = useApp().store.gameBaseUrl;
  const customUrl = custom?.url ? custom.url.startsWith('http') ? custom.url : baseUrl + custom.url : null;
  /*
   * 用户上传的背景 MP4 有 7MB，直接播远程地址每进一次页面都要重新拉一段 ——
   * 这就是"影库、接口页动态背景加载特别慢"的原因。
   * 这里跟 AppFrame 用**同一份本地缓存**（peek 同步拿），所以进页面直接有画面。
   */
  const customVersion = String(
    (custom as unknown as { updatedAt?: number } | null)?.updatedAt ?? customUrl ?? '',
  );
  const [localCustom, setLocalCustom] = useState<string | null>(() =>
    customUrl ? peekBackgroundVideo(customVersion) : null,
  );
  useEffect(() => {
    let cancelled = false;
    if (!customUrl || custom?.type !== 'video') {
      setLocalCustom(null);
      return;
    }
    const known = peekBackgroundVideo(customVersion);
    if (known) {
      setLocalCustom(known);
      return;
    }
    void resolveBackgroundVideo(customUrl, customVersion).then((uri) => {
      if (!cancelled) setLocalCustom(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [customUrl, customVersion, custom?.type]);

  const customSrc = customUrl && custom?.type === 'video' ? localCustom ?? customUrl : null;
  const source = React.useMemo(() => {
    if (customSrc) return { uri: customSrc };
    if (preferBuiltinAnime && builtinUri) return { uri: builtinUri };
    return bgs[which] ?? bgs[0];
  }, [customSrc, which, preferBuiltinAnime, builtinUri]);

  const player = useVideoPlayer(source, (p) => {
    /*
     * MUTED_LOOP_GUARANTEE：背景壁纸必须是"静音 + 循环 + 立刻播"。
     * 静音视频不会去创建 AudioTrack，所以在"系统音频不可用"的机器上也能出画面
     * （电影那种带音轨的才需要 AudioTrack，起不来是另一回事）。
     */
    p.muted = true;
    p.loop = true;
    p.volume = 0;
    p.play();
    // 有些机型创建时设置不生效，延迟再设一次
    setTimeout(() => {
      try {
        p.muted = true;
        p.volume = 0;
        p.loop = true;
        p.play();
      } catch {
        /* 忽略 */
      }
    }, 600);
  });

  /*
   * 关键：useVideoPlayer 只在创建时用一次 source。
   * 你上传背景后 customUrl 才出现，player 不会自己换源 → 一直播内置壁纸。
   * 所以这里显式 replace 成当前该用的源（自定义背景优先）。
   */
  const srcKey = source && typeof source === 'object' && 'uri' in source ? String(source.uri) : `bundled-${which}`;
  const lastKey = React.useRef<string | null>(null);
  useEffect(() => {
    // 同一个源不要反复 replace：每 replace 一次就等于重新加载一次（要等首帧）
    if (lastKey.current === srcKey) return;
    lastKey.current = srcKey;
    try {
      player.replace(source);
      player.play();
    } catch {
      setOk(false);
    }
  }, [srcKey, source, player]);

  useEffect(() => {
    if (!enabled) return;
    try {
      player.play();
    } catch {
      setOk(false);
    }
    return () => {
      try {
        player.pause();
      } catch {
        /* 忽略 */
      }
    };
  }, [enabled, player]);

  /*
   * 视频起不来（老机型 / 解码失败 / 用户关了动效）→ 退回**静态高清壁纸**，
   * 再不行才交给下面纯代码画的夜景（NightSky）。三层兜底，不会黑屏。
   */
  if (!enabled) return null;

  // 自定义背景是图片 → 铺满整屏，不加任何压层
  if (customUrl && custom?.type === 'image') {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9 }, style]}>
        <Image source={{ uri: customUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </View>
    );
  }
  if (!ok) {
    // BUILTIN_POSTER_FALLBACK：万一这台机器就是播不了，也别退回夜景图，退回内置海报（还是你的画面）
    if (preferBuiltinAnime) {
      return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9 }, style]}>
          <Image
            source={require('../../assets/bg/bg-poster.jpg')}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            fadeDuration={0}
          />
        </View>
      );
    }
    const still = wallStills[which] ?? wallStills[0];
    if (!still) return null;
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9 }, style]}>
        <Image source={still} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.shadeA} />
        <View style={styles.shadeB} />
      </View>
    );
  }

  return (
    /*
     * zIndex 必须抬高：NightBackdrop 里先画的是一层不透明的夜空渐变，
     * 视频如果按普通顺序插入会被它整个盖住（用户看到的就是"只有个夜景"）。
     * 抬起 zIndex 之后视频才是真正看得见的背景，上面的星点自然被视频覆盖，
     * 可读性由视频自带的两层暗色压层保证。
     */
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9 }, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      {/* 内置壁纸才压暗保证文字可读；用户自己的背景一律不压 */}
      {customUrl ? null : <View style={styles.shadeA} />}
      {customUrl ? null : <View style={styles.shadeB} />}
    </View>
  );
}

const styles = StyleSheet.create({
  shadeA: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,10,26,0.5)',
  },
  shadeB: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
    backgroundColor: 'rgba(4,7,18,0.45)',
    opacity: 0.55,
  },
});
