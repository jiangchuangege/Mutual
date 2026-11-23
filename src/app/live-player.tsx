import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { splitStreamHeaders } from '../core/liveSource';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';

import { checkLiveChannel, type HealthReport } from '../core/sourceHealth';
import { useApp } from '../store';
import { setBackgroundVideoSuppressed } from '../ui/bgVideoGate';
import { night, nightFont } from '../ui/nightTheme';
import { HealthChip } from '../ui/SourceHealthView';
import { useToast } from '../ui/components';
import { Maximize2, Minimize2 } from 'lucide-react-native';

/**
 * 电视直播播放页
 *
 * 设计要点：
 *   - 一个台可能有多条线路（同一个台在源里写了多个地址），挂了自动换下一条；
 *   - 真的全挂时，明确告诉你"这个台的线路都失效了"，并给一个"检测线路"按钮，
 *     能看到每条线路具体为什么失败（超时 / 404 / 不是 m3u8）；
 *   - 「一起看」直接复用影院的房间机制（store.startOnlineWatch + /room）：
 *     两边看同一个台、播放暂停同步，跟影院「一起看」是同一套体验。
 */
export default function LivePlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /** 全屏：点了才横屏；横屏时只显示画面 */
  const [full, setFull] = useState(false);
  /** 全屏顶部信息条：进全屏后 3 秒淡出，只留画面 */
  const fullBarOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!full) return;
    fullBarOpacity.setValue(1);
    const t = setTimeout(() => {
      Animated.timing(fullBarOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();
    }, 3000);
    return () => clearTimeout(t);
  }, [full, fullBarOpacity]);
  const toggleFull = () => {
    const next = !full;
    setFull(next);
    void ScreenOrientation.lockAsync(
      next ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => undefined);
  };
  useEffect(
    () => () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    },
    [],
  );
  const toast = useToast();
  const { store, snapshot, role } = useApp();

  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    group?: string;
    u?: string;
    alt?: string;
  }>();

  const name = String(params.name ?? '电视频道');
  const group = String(params.group ?? '');
  const primary = String(params.u ?? '');
  const alternates = useMemo<string[]>(() => {
    const raw = params.alt;
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(String(raw));
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter((x) => /^https?:\/\//i.test(x));
      return [];
    } catch {
      return [];
    }
  }, [params.alt]);

  const urls = useMemo(() => [primary, ...alternates].filter((u) => /^https?:\/\//i.test(u)), [primary, alternates]);

  const [urlIndex, setUrlIndex] = useState(0);
  const [overlay, setOverlay] = useState(true);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [failedAll, setFailedAll] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const currentUrl = urls[Math.min(urlIndex, Math.max(0, urls.length - 1))] ?? '';

  const nextLine = useCallback(
    (reason: string) => {
      if (urlIndex + 1 < urls.length) {
        setUrlIndex(urlIndex + 1);
        setAttempt((n) => n + 1);
        setReport(null);
        toast.show(`这条线路不行（${reason}），换下一条`, 'warn');
        return;
      }
      setFailedAll(true);
    },
    [toast, urlIndex, urls.length],
  );

  const runCheck = useCallback(async () => {
    if (!currentUrl) return;
    setChecking(true);
    const res = await checkLiveChannel(currentUrl);
    setReport(res);
    setChecking(false);
  }, [currentUrl]);

  // 打开就自动测一次这条线路（顺手给用户一个"能不能播"的结论）
  useEffect(() => {
    void runCheck();
  }, [runCheck, attempt]);

  const startTogether = () => {
    if (!currentUrl) return;
    const ok = store.startOnlineWatch(`📺 ${name}`, currentUrl);
    if (ok) {
      toast.show('已开好房间，TA 那边能看到，一起看这个台', 'ok');
      router.push('/room');
    }
  };

  /** 房间里已经在看这个台？那就直接提示进房间 */
  const room = snapshot.activeRoom;
  const inRoomSame = Boolean(room && room.sourceUrl && room.sourceUrl === currentUrl);

  const retry = () => {
    setFailedAll(false);
    setUrlIndex(0);
    setAttempt((n) => n + 1);
    setReport(null);
  };

  return (
    <View style={styles.root}>
      <RNStatusBar barStyle="light-content" />

      {/* 播放器：换地址就换 key，保证拿到一个全新的 player 实例 */}
      <View style={full ? styles.stageFull : styles.stage}>
        {currentUrl ? (
          <LiveSurface
            key={`${currentUrl}__${attempt}`}
            url={currentUrl}
            onFirstFrame={() => setFailedAll(false)}
            onFail={(reason) => nextLine(reason)}
          />
        ) : (
          <View style={styles.stageCenter}>
            <Text style={[nightFont.bodyStrong]}>这个频道没有可用地址</Text>
          </View>
        )}

        {/* 点击画面切显隐 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOverlay((v) => !v)} />
        {/* 全屏时：顶上一条极简信息（3 秒淡出），右下角一颗玻璃圆钮 */}
        {full ? (
          <>
            <Animated.View style={[styles.fullBar, { opacity: fullBarOpacity }]}>
              <Text style={styles.fullBarText} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.fullDot} />
              <Text style={styles.fullBarSub}>
                {urls.length > 1 ? `线路 ${urlIndex + 1}/${urls.length}` : '直播中'}
              </Text>
            </Animated.View>
            <Pressable onPress={toggleFull} style={styles.fullBtn} hitSlop={12}>
              <Minimize2 size={18} color="#EAF4FF" strokeWidth={2} />
            </Pressable>
          </>
        ) : (
          <Pressable onPress={toggleFull} style={styles.fullBtnSmall} hitSlop={12}>
            <Maximize2 size={16} color="#EAF4FF" strokeWidth={2} />
          </Pressable>
        )}

        {overlay && !full ? (
          <>
            {/* 顶部栏 */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <Pressable onPress={() => router.back()} style={styles.roundBtn} hitSlop={8}>
                <Text style={{ color: night.text, fontSize: 15 }}>‹</Text>
              </Pressable>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[nightFont.h2, { fontSize: 15 }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[nightFont.small, { marginTop: 1 }]} numberOfLines={1}>
                  {group ? `${group} · ` : ''}
                  {urls.length > 1 ? `线路 ${urlIndex + 1}/${urls.length}` : '单线路'}
                </Text>
              </View>
              {checking ? (
                <ActivityIndicator size="small" color={night.cyan} />
              ) : report ? (
                <HealthChip report={report} />
              ) : null}
            </View>

            {/* 底部操作条 */}
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
              {failedAll ? (
                <View style={styles.failBox}>
                  <Text style={{ color: night.danger, fontSize: 12, fontWeight: '700' }}>
                    这个台的线路全部播不出来
                  </Text>
                  <Text style={[nightFont.small, { marginTop: 3 }]}>
                    {report?.detail ?? '可能是源已经过期了'} · 换一个源或者换一个台试试
                  </Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => void runCheck()}
                  style={[styles.actionBtn, { flex: 1 }]}
                  disabled={checking}
                >
                  <Text style={styles.actionText}>{checking ? '检测中…' : '检测线路'}</Text>
                </Pressable>
                {urls.length > 1 ? (
                  <Pressable
                    onPress={() => {
                      setUrlIndex((i) => (i + 1) % urls.length);
                      setAttempt((n) => n + 1);
                      setReport(null);
                    }}
                    style={[styles.actionBtn, { flex: 1 }]}
                  >
                    <Text style={styles.actionText}>手动换线</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={retry} style={[styles.actionBtn, { flex: 1 }]}>
                  <Text style={styles.actionText}>重试</Text>
                </Pressable>
              </View>

              <Pressable onPress={startTogether} style={styles.togetherBtn}>
                <Text style={styles.togetherText}>
                  {inRoomSame ? '🎬 一起去房间看' : '💞 和 TA 一起看这个台'}
                </Text>
              </Pressable>
              {inRoomSame ? (
                <Text style={[nightFont.small, { textAlign: 'center', marginTop: 6 }]}>
                  房间里正在看这个台，进去就能同步播放/暂停
                </Text>
              ) : (
                <Text style={[nightFont.small, { textAlign: 'center', marginTop: 6 }]}>
                  一起看会开一个影院房间（和影院那套是同一套同步），TA 那边点加入即可
                </Text>
              )}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/**
 * 播放面：自己管一个 expo-video 实例。
 *
 * 失败判定用"能不能真的出时间轴"：12 秒内既没有 playing 也没有 currentTime 前进，
 * 就当这条线路挂了（直播流最常见的失败就是连上了但永远加载不出来）。
 */
function LiveSurface({
  url,
  onFirstFrame,
  onFail,
}: {
  url: string;
  onFirstFrame: () => void;
  onFail: (reason: string) => void;
}) {
  /*
   * STREAM_HEADERS：直播源常见写法是「地址|User-Agent=…|Referer=…」，
   * 请求头必须单独交给播放器。以前整串当 URL，`|User-Agent=…` 成了路径的一部分，
   * 于是台单上写着"2 条线路"，点进去每条都 403/黑屏。
   */
  const source = React.useMemo(() => {
    const split = splitStreamHeaders(url);
    return Object.keys(split.headers).length > 0
      ? { uri: split.uri, headers: split.headers }
      : split.uri;
  }, [url]);

  const player = useVideoPlayer(source, (p) => {
    try {
      p.loop = false;
      p.timeUpdateEventInterval = 0.5;
      p.play();
    } catch {
      // 忽略初始化异常
    }
  });

  /* 看直播时把背景壁纸视频停掉：两路视频同时解码会互相拖慢（看片卡的主因之一） */
  useEffect(() => {
    setBackgroundVideoSuppressed(true);
    return () => setBackgroundVideoSuppressed(false);
  }, []);

  const started = useRef(Date.now());
  const okRef = useRef(false);
  const [loading, setLoading] = useState(true);
  // 回调放进 ref：父组件每次重渲染都会传新的函数，用它当依赖会让定时器反复重建，
  // 于是"12 秒没出画面"的计时永远走不到（黑屏就一直黑着）。
  const failRef = useRef(onFail);
  const okCbRef = useRef(onFirstFrame);
  failRef.current = onFail;
  okCbRef.current = onFirstFrame;

  useEffect(() => {
    started.current = Date.now();
    okRef.current = false;
    setLoading(true);

    const timer = setInterval(() => {
      try {
        const p = player as unknown as {
          playing?: boolean;
          currentTime?: number;
          status?: string;
        };
        const elapsed = Date.now() - started.current;
        const advanced = (p.currentTime ?? 0) > 0.4;

        if (p.playing || advanced) {
          if (!okRef.current) {
            okRef.current = true;
            setLoading(false);
            okCbRef.current();
          }
          return;
        }
        if (p.status === 'error') {
          failRef.current('播放器报错');
          return;
        }
        if (elapsed > 12_000) {
          failRef.current('12 秒没出画面');
        }
      } catch {
        // 播放器还没就绪
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [player]);

  return (
    <View style={styles.stageCenter}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        surfaceType="textureView"
      />
      {loading ? (
        <View pointerEvents="none" style={styles.loadingHint}>
          <ActivityIndicator color={night.cyan} />
          <Text style={[nightFont.small, { marginTop: 8 }]}>正在连接直播流…</Text>
        </View>
      ) : null}
    </View>
  );
}

function fullBottom() {
  return 18;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  stage: { flex: 1, justifyContent: 'center' },
  stageFull: { flex: 1, backgroundColor: '#000000' },
  fullBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,16,28,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  fullBtnSmall: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,16,28,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  fullBar: {
    position: 'absolute',
    top: 12,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(10,16,28,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  fullBarText: { color: '#EAF4FF', fontSize: 12, fontWeight: '700', maxWidth: 160 },
  fullBarSub: { color: 'rgba(234,244,255,0.6)', fontSize: 10.5 },
  fullDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#57F8FF' },
  stageCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingHint: { alignItems: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: 'rgba(4,7,16,0.55)',
  },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,28,56,0.8)',
    borderWidth: 1,
    borderColor: night.line,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    backgroundColor: 'rgba(4,7,16,0.62)',
  },
  failBox: {
    backgroundColor: night.dangerSoft,
    borderWidth: 1,
    borderColor: `${night.danger}66`,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  actionBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: night.glass,
    borderWidth: 1,
    borderColor: night.line,
  },
  actionText: { color: night.text, fontSize: 12, fontWeight: '700' },
  togetherBtn: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: night.cyan,
  },
  togetherText: { color: night.textOnLight, fontSize: 14, fontWeight: '800' },
});
