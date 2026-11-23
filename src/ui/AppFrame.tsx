import { usePathname } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import React, { useEffect } from 'react';
import { Image, AppState, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useApp } from '../store';
import { AmbientSky } from './AmbientSky';
import { blurTargetRef, setVideoBgActive } from './blurTarget';
import { setBackdropStill } from './backdropStill';
import { dropBackgroundVideo, peekBackgroundVideo, resolveBackgroundVideo } from './bgVideoCache';
import { Asset } from 'expo-asset';
import * as FileSystemLegacy from 'expo-file-system/legacy';

/*
 * BUILTIN_BG：把"你的那张二次元壁纸"直接打包进 APK。
 * 服务器在线时优先用服务器那份（换壁纸能同步），
 * 但服务器不开 / 文件还没下下来 / 播放器报错时，永远有这一份兜底 —— 也就是"永久内置"。
 */
const BUILTIN_BG_VIDEO = require('../../assets/bg/bg.mp4');
const BUILTIN_BG_POSTER = require('../../assets/bg/bg-poster.jpg');
import { applySurfaceMode } from './dynamicSurfaces';
import { surfaceFromPath } from './presence';
import { ProfileGate } from './ProfileGate';
import { MusicEngineHost } from './MusicEngineHost';
import { CacheWarmer } from './CacheWarmer';
import { color, setCustomBgActive } from './theme';
import { useBgVideoSuppressed } from './useBgVideoSuppressed';
import { clearVideoStatus, setVideoStatus } from './videoStatus';

/**
 * 全局外框：用户设置的背景铺在最底层（cover，不拉伸变形）。
 *
 * **两种背景通道统一在这里渲染**（以前只看图片，所以换 MP4 时外层背景一直不变）：
 *   1. `customBackground`（新：图片或 mp4 视频，两个人共用）—— 优先
 *   2. `backgroundSrc`（旧：只有图片）—— 兼容老用户
 * 用完整个 App 的外层背景都会跟着换，而不是只有某个模块。
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { store, snapshot } = useApp();
  const pathname = usePathname();
  // 背景存的是服务器相对路径：要拼上当前服务器地址才取得到
  const cb = (snapshot as unknown as {
    customBackground?: { url: string; type: 'image' | 'video'; poster?: string | null } | null;
  }).customBackground;
  const abs = (p?: string | null) =>
    p ? (p.startsWith('http') ? p : store.gameBaseUrl + p) : null;
  const cbUrl = abs(cb?.url);
  /** 视频首帧截图：解码出第一帧之前先铺这张，页面不会先空一大块 */
  const cbPoster = abs(cb?.poster);
  const bg = store.backgroundSrc;
  /*
   * 电视直播 / 焦焦FM 这两个模块用**自己的专属壁纸**（它们各自一张）。
   * 这时外层就别再解码你上传的那支 MP4 了：
   *   1) 视觉上会被模块壁纸盖住，白费；
   *   2) 同时跑两个解码器会掉帧。
   */
  const moduleSurface = surfaceFromPath(pathname).surface;
  /*
   * 影院 / 直播 / FM 这三个模块自己会画一块「模块壁纸」（NightBackdrop / Aurora 里的 WallVideo），
   * 这里就别再解码第二路视频了 —— 同时渲两个解码器是「影库、接口页背景出来特别慢」的主因。
   * 这三个模块的 WallVideo 现在也走同一份本地缓存，所以视觉完全一致，只是不再重复解码。
   */
  /*
   * 只有直播 / FM 用模块自己的专属壁纸（它们本来就设计成独立配色）。
   * 影院（片库/接口/详情/一起看）改回用**外层这一份**背景 —— 外层那套
   * （自定义壁纸 → 本地缓存 → APK 内置 MP4）在首页验证过是能正常播放的，
   * 而模块页自己那套播放器起不来，才导致"二次元背景不见了"。
   */
  const moduleOwnWallpaper = moduleSurface === 'live' || moduleSurface === 'fm';
  /*
   * 用户明确要求：**只有在"带背景的普通页面"上才播背景 MP4**。
   * 点开一部电影（观影房间 / 直播播放页 / 播放器页）就彻底别播了：
   *   - 和正在看的片子抢带宽、抢解码器，是"看片卡"的主因；
   *   - 而且那片区域本来就被播放器盖住了，白烧电。
   * 这里用路由直接判定（不依赖播放器组件挂载的时序），另外再叠加播放器自己的开关兜底。
   */
  const playingSurface =
    moduleSurface === 'room' || pathname?.startsWith('/room') === true;
  const bgSuppressed = useBgVideoSuppressed();
  const allowBgVideo =
    !moduleOwnWallpaper && !playingSurface && !bgSuppressed;
  /*
   * 背景视频走本地缓存：第一次下载到本机（7MB），之后每次启动直接用本地文件，
   * 不再反复从服务器拉 —— 用户明确要求省流量。
   */
  const [cachedBgUri, setCachedBgUri] = React.useState<string | null>(null);
  // 内置壁纸（打包在 APK 里）解析出来的本地地址：服务器不可用时用它，保证永远有壁纸
  const [builtinBg, setBuiltinBg] = React.useState<{ video: string | null; poster: string | null }>({
    video: null,
    poster: null,
  });
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        /*
         * BUILTIN_COPIED：内置的这支 MP4 必须变成一个**真实存在、可播放的 file:// 路径**。
         * 之前只取 Asset 的 localUri，某些打包方式下它拿不到（于是背景全黑、退回服务器地址）。
         * 这里多一层保险：把它显式复制到 documentDirectory/bg-builtin.mp4，再播这个路径。
         */
        const v = Asset.fromModule(BUILTIN_BG_VIDEO);
        const p2 = Asset.fromModule(BUILTIN_BG_POSTER);
        await Promise.all([v.downloadAsync(), p2.downloadAsync()]);
        if (!alive) return;

        let videoUri = v.localUri ?? null;
        if (!videoUri) {
          const dir = FileSystemLegacy.documentDirectory;
          if (dir) {
            const dest = dir + 'bg-builtin.mp4';
            try {
              await FileSystemLegacy.copyAsync({ from: v.uri, to: dest });
              videoUri = dest;
            } catch {
              videoUri = v.uri ?? null;
            }
          } else {
            videoUri = v.uri ?? null;
          }
        }
        setBuiltinBg({
          video: videoUri,
          poster: p2.localUri ?? p2.uri ?? null,
        });
      } catch {
        /* 内置壁纸解析失败就算了 */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const bgVersion = String(
    (cb as unknown as { updatedAt?: number } | null)?.updatedAt ?? cbUrl ?? '',
  );
  React.useEffect(() => {
    let cancelled = false;
    if (!allowBgVideo || !cbUrl || cb?.type !== 'video') {
      setCachedBgUri(null);
      return;
    }
    /*
     * 先同步问一句"本地有没有已经下好的这版文件"：
     * 有就直接用本地路径 —— 不经过网络、不重建播放器，切页面也是立刻有画面。
     * 以前这里先 setCachedBgUri(null)（退回远程地址）再换成本地，那一次来回就是"背景加载慢"。
     */
    const known = peekBackgroundVideo(bgVersion);
    if (known) {
      setCachedBgUri(known);
      return;
    }
    void resolveBackgroundVideo(cbUrl, bgVersion).then((uri) => {
      if (!cancelled) setCachedBgUri(uri);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowBgVideo, cbUrl, bgVersion]);

  /*
   * ⚠️ 这里的对象必须 useMemo 住。
   * `useVideoPlayer(source)` 是按 source 的**引用**判断要不要重建播放器的：
   * 每次渲染都 new 一个字面量对象 -> 播放器被反复重建 ->
   * 表现就是「背景只剩首帧/静止」、「诊断·背景视频: error · 已播 0.0s」、
   * logcat 里每两秒刷一条 expo-video 的 PiP 警告。
   */
  const videoSource = React.useMemo(() => {
    if (!allowBgVideo) return null;
    if (cbUrl && cb?.type === 'video') {
      /*
       * 用户上传的视频优先：本地缓存文件 > 服务器地址 > 内置那支 MP4。
       * 以前内置 MP4 排在最前面，于是**用户上传的满屏视频在大半页面上根本不出现**
       * （只有挂了 Aurora 的那几页能看到，那几页走 WallVideo，不经过这里）。
       */
      if (cachedBgUri) return { uri: cachedBgUri };
      if (cbUrl) return { uri: cbUrl };
      return builtinBg.video ? { uri: builtinBg.video } : null;
    }
    /*
     * 自定义背景是**图片**时必须返回 null，让下面的图片层去显示；
     * 否则内置视频会把它整张盖住（用户上传的照片永远看不到）。
     */
    if (cbUrl && cb?.type === 'image') return null;
    return builtinBg.video ? { uri: builtinBg.video } : null;
  }, [allowBgVideo, cbUrl, cachedBgUri, cb?.type, builtinBg.video]);

  /*
   * 关键：在**渲染阶段**同步全局开关（不是 useEffect）。
   * AppFrame 是页面们的父组件，它先渲染，随后子页面读 pageBg()
   * 才能拿到 'transparent' —— 否则视频上面永远糊一层奶白（用户反馈"看不到背景"）。
   */
  setCustomBgActive(!!cbUrl);
  // 视频背景：卡片/弹层不再跑 RenderEffect（省 GPU，观感不变）
  setVideoBgActive(!!videoSource);
  setBackdropStill(cbPoster ?? cbUrl ?? null);
  // 同时把所有"表面色"（白卡片 / 奶油卡片 / 弹层）切成全透明
  applySurfaceMode(!!cbUrl);

  /*
   * 在线心跳：把"当前在哪个模块"上报上去（路径变了立刻发，之后每 30 秒续一次；
   * 回到前台也立刻补一次，避免切后台太久后对方一直看到旧状态）。
   */
  useEffect(() => {
    const { surface } = surfaceFromPath(pathname);
    const beat = () => store.setPresence(surface);
    beat();
    const id = setInterval(beat, 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') beat();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [pathname, store]);

  // 视频背景：交给子组件处理（它内部才创建播放器，保证创建时就有 source）

  return (
    <View style={styles.root}>
      {/*
       * 背景层里，**图片类**的都放进 BlurTargetView：
       * expo-blur 新 API 必须提供 blurTarget，否则 BlurView 退化成"半透白"（没有磨砂）。
       * ⚠️ 视频不能放进来：SurfaceView 是独立图层，进了 BlurTargetView 就画不出来
       * （实测：播放器明明在播 readyToPlay，屏幕上却只有静止的首帧图）。
       * 所以视频单独铺在 BlurTargetView 上面、UI 下面。
       */}
      <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill} pointerEvents="none">
        {/*
         * POSTER_VIA_REQUIRE：最底层永远铺**打包在 APK 里**的二次元壁纸首帧。
         * 用 require 直接给 Image（不走 Asset 异步解析），保证一定画得出来 ——
         * 正在播电影（背景视频让路）、服务器关掉、缓存被清，全都不会变成黑屏。
         */}
        {moduleOwnWallpaper ? null : (
          <Image
            source={require('../../assets/bg/bg-poster.jpg')}
            style={styles.bg}
            resizeMode="cover"
            fadeDuration={0}
          />
        )}
        {moduleOwnWallpaper ? null : videoSource ? (
          (
            <Image
              source={require('../../assets/bg/bg-poster.jpg')}
              style={styles.bg}
              resizeMode="cover"
              fadeDuration={0}
            />
          )
        ) : cb?.type === 'image' && cbUrl ? (
          <>
            <Image source={{ uri: cbUrl }} style={styles.bg} resizeMode="cover" />
            <View style={styles.scrimLight} />
          </>
        ) : bg ? (
          <>
            <Image source={{ uri: bg }} style={styles.bg} resizeMode="cover" />
            <View style={styles.scrim} />
          </>
        ) : null}
        {/* 有自定义背景时天幕整个不画：用户要的是全透明，不是再叠一层颜色 */}
        <View style={cbUrl ? styles.hidden : bg ? styles.ambientWithMedia : styles.ambient}>
          <AmbientSky />
        </View>
      </BlurTargetView>
      {videoSource ? (
        <>
          <VideoBg uri={videoSource.uri} remote={cbUrl ?? videoSource.uri} routeKey={pathname ?? 'root'} />
          {/* 视频不加奶白薄雾（会显黄），只用中性黑压一点点高光保证文字可读 */}
          <View pointerEvents="none" style={styles.scrimVideo} />
        </>
      ) : null}
      <MusicEngineHost>{children}</MusicEngineHost>
      {/* 后台预热永久缓存（渲染 null）：只补没缓存过的源 */}
      <CacheWarmer />
      <ProfileGate />
    </View>
  );
}

/**
 * 视频背景。
 *
 * 播放器留在 AppFrame（不随路由重建），但 `VideoView` 的 key 跟着路由变 ——
 * SurfaceView 在切页面时会 detach，之后有的机型不重新 attach，
 * 表现就是"一进子页面背景就变回纯色/只剩一条缝"。换 key 强制重新挂一个视图即可，
 * 播放器的播放位置不受影响。
 */
function VideoBg({ uri, remote, routeKey }: { uri: string; remote: string; routeKey: string }) {
  /*
   * 本地缓存文件万一坏了（下载残缺 / 被系统清掉），播放器会直接 error。
   * 这时自动退回服务器地址再试一次，绝不停在一张静止的首帧图上。
   */
  const [useUri, setUseUri] = React.useState(uri);
  React.useEffect(() => {
    setUseUri(uri);
  }, [uri]);
  // 同上：source 必须稳定，否则每渲染一次就重建播放器
  const source = React.useMemo(() => ({ uri: useUri }), [useUri]);
  const player = useVideoPlayer(source, (p) => {
    p.muted = true;
    p.loop = true;
    p.volume = 0;
    p.play();
  });
  // 把播放器的实时状态同步到一个只读小模块，供「我们 → 诊断」显示
  useEffect(() => {
    /*
     * 实测这个背景 MP4 只有 10 秒：播到头以后 expo-video 有时候**不会**自己 loop
     * （状态还报 readyToPlay，时间停在 9 秒多，画面就定住了 —— 用户看到的就是"背景不动"）。
     * 所以这里每 800ms 做一次看门狗：
     *   - 时间不再前进 / 已经播到结尾 -> 重新 seek(0) + play()，并把 loop 再设一次
     *   - 状态是 error -> 丢掉本地缓存文件，改用服务器地址
     */
    let lastTime = -1;
    let stuckTicks = 0;
    const publish = () => {
      try {
        const status = String(player.status);
        const time = Number(player.currentTime ?? 0);
        const dur = Number(player.duration ?? 0);
        setVideoStatus(status, time);

        if (status === 'error') {
          /*
           * 只有"当前用的是远程地址"时才尝试换成本地/回退；
           * 绝不再删本地缓存文件 —— 以前一报错就 dropBackgroundVideo()，
           * 服务器一关，永久缓存被删掉，壁纸就彻底没了（用户反馈"二次元背景跑哪去了"）。
           */
          if (useUri !== remote) {
            setUseUri(remote);
          }
          lastTime = -1;
          stuckTicks = 0;
          return;
        }

        // 只在"时间确实不动"时才动手：以前一到结尾就 seek(0) 会和原生 loop 抢，
        // 每 10 秒额外抖一下（用户说的"偶尔掉帧"有一部分就是它）。
        const nearEnd = dur > 0 && time >= dur - 0.4;
        const frozen = lastTime >= 0 && Math.abs(time - lastTime) < 0.02 && status !== 'loading';
        lastTime = time;
        stuckTicks = frozen ? stuckTicks + 1 : 0;
        if (stuckTicks >= 2) {
          stuckTicks = 0;
          try {
            player.loop = true;
          } catch {
            /* 忽略 */
          }
          if (nearEnd || (dur > 0 && time > dur - 1)) {
            try {
              player.currentTime = 0; // expo-video 用赋值来 seek
            } catch {
              /* 忽略 */
            }
          }
          try {
            player.play();
          } catch {
            /* 忽略 */
          }
        }
      } catch {
        /* 播放器还没准备好 */
      }
    };
    publish();
    const id = setInterval(publish, 800);
    // 卸载时**保留**最后一次状态：否则诊断永远是"未启用"，看不出到底有没有播过
    return () => clearInterval(id);
  }, [player, useUri, remote]);
  return (
    <VideoView
      key={routeKey}
      player={player}
      /* 绝对铺满：不要和 width/height:'100%' 混用，否则原生 surface 会算错尺寸
         （表现就是背景视频只在屏幕中间一条、或者底部多一条接缝） */
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      /*
       * 这里**不能**换 textureView：实测在部分机型上 expo-video 的 TextureView
       * 拿不到画面（状态一直 loading，背景变纯色）。SurfaceView 才是能出画面的那条路。
       */
      surfaceType="surfaceView"
    />
  );
}

const styles = StyleSheet.create({
  // 实底打底：没设背景图时是奶油色，设了背景图时半透明的页面底色才不会露出黑色窗口
  root: { flex: 1, backgroundColor: color.bgSolid },
  bg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  // 很淡的一层薄雾：只用来压住过亮的照片，别把图盖住（用户反馈"看不到背景图"）
  hidden: { display: 'none' as const },
  ambientWithMedia: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.35,
  },
  scrimLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,248,244,0.06)',
  },
  /** 视频专用：中性黑 8%，绝对不带黄 */
  scrimVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,248,244,0.12)',
  },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // 有背景图时天幕只留 45% 的存在感，别和用户的照片打架
  ambientOverPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.45,
  },
});