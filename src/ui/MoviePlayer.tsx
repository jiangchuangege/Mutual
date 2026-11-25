import * as ScreenOrientation from 'expo-screen-orientation';
import { computeTargetPosition, decideRoomSync } from '../core/drift';
import { useVideoPlayer, VideoView } from 'expo-video';

import { claimAudioFocus, releaseAudioFocus } from '../lib/audioFocus';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration } from '../core/time';
import type { MediaState } from '../core/types';
import { color, font, radius } from './theme';
import { surf } from './theme';
import { setBackgroundVideoSuppressed } from './bgVideoGate';

/** 可选倍速（1 是原速） */
export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 3] as const;

/**
 * 真实视频播放器（expo-video）
 *
 * 三种能力：
 * 1. 本机播放：自己的播放器，自制控制条；
 * 2. 同步播放：以服务端 mediaState 为准（播放/暂停/进度/倍速都跟它走）；
 * 3. **放大全屏**：点右下角放大按钮 → 弹出全屏播放器并自动转横屏；退出恢复竖屏。
 */
/**
 * 播放器本体。
 *
 * 外面包了 React.memo：房间页每次 store bump（心跳、对方动作、每秒同步）都会重渲染，
 * 如果播放器跟着重渲染，TextureView + 解码器会一起被搅动，画面就一顿一顿的。
 * 这里只在"真的需要变"的时候才重渲染（换片/换源/倍速/主控变化/播放状态变化/弹幕条数变化）。
 */
function MoviePlayerInner({
  url,
  title,
  sync,
  onPosition,
  onError,
  autoPlay = false,
  rate = 1,
  onRateChange,
  sourceSwitcher,
  danmaku,
  onSeek,
  onStall,
}: {
  url: string;
  title?: string;
  autoPlay?: boolean;
  onError?: (message: string) => void;
  /** 卡顿回调：明明应该播、但超过 3 秒没往前走（用来触发自动换源） */
  onStall?: () => void;
  /** 用户拖动进度条 / 滑动画面跳转后回调（同步模式下要把新位置告诉服务端） */
  onSeek?: (positionSec: number) => void;
  /** 当前倍速（同步模式下由服务端 mediaState.rate 决定） */
  rate?: number;
  /** 用户点了某个倍速（同步模式下交给房主广播） */
  onRateChange?: (rate: number) => void;
  /** 视频上的弹幕：按播放进度飞到画面上（私密弹幕，只有你们两个人能看到） */
  danmaku?: Array<{ id: string; text: string; mediaPosSec: number }>;
  /** 换源入口：只有多个源时才传，传了才显示按钮 */
  sourceSwitcher?: { label: string; onPress: () => void };
  /** 真实播放位置回写（房间用它替代模拟进度） */
  onPosition?: (positionSec: number, playing: boolean) => void;
  sync?: {
    mediaState: MediaState;
    serverNow: number;
    isLeader: boolean;
    onHeartbeat: (positionSec: number, playing: boolean) => void;
    onRequestPlayPause?: (playing: boolean) => void;
  };
}) {

  /*
   * VIDEO_TAKES_FOCUS：播视频时把其它音源（FM / 一起听 / 试听）全部暂停，
   * 否则会出现"画面在看、声音在窜"（电视直播那边同样处理）。
   */
  React.useEffect(() => {
    claimAudioFocus('movie-player');
    return () => releaseAudioFocus('movie-player');
  }, []);
  /*
   * 片源地址 → 播放器源对象。
   *
   * 为什么要带 headers：采集站/网盘的 m3u8 大多会看 User-Agent 和 Referer，
   * 拿 ExoPlayer 默认 UA 去拉经常被限速（甚至 403 后不停重试），
   * 表现就是"每次播都特别卡"。带上浏览器 UA + 同源 Referer 后顺畅很多。
   * 缓存只在直链 mp4 上开：HLS 分片缓存收益小、还容易越占越多。
   */
  const source = useMemo(() => {
    const isHls = /\.m3u8(\?|$)/i.test(url);
    let referer = '';
    try {
      const u = new URL(url);
      referer = `${u.protocol}//${u.host}/`;
    } catch {
      referer = '';
    }
    return {
      uri: url,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
        Accept: '*/*',
        ...(referer ? { Referer: referer, Origin: referer.replace(/\/$/, '') } : {}),
      },
      // 弱网实测：这类采集站的 CDN 只有 300~480kbps（片源要 1610kbps），
      // 同一段反复下载很常见 —— HLS 也开缓存，看过的分片不用再拉第二遍。
      useCaching: true,
    };
  }, [url]);

  /*
   * 播放器在的时候，把 AppFrame 的背景壁纸视频停掉。
   * 不然就是"两路视频同时解码 + 抢同一条网"，看片必然卡（用户反馈的核心症状）。
   */
  useEffect(() => {
    setBackgroundVideoSuppressed(true);
    return () => setBackgroundVideoSuppressed(false);
  }, []);

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.5;
    /*
     * 缓冲策略（按实测调）：
     *   这类采集站 CDN 实测 300~480kbps，而片源要 1610kbps。之前我把续播门槛调到 6 秒，
     *   结果**快进到未缓冲的位置会等很久**（6 秒画面 ≈ 1.2MB，400kbps 下要 20 多秒），
     *   所以这里改回"快启动"策略：
     *     - 前向缓冲 20 秒：够连续播放，又不会过度预读把带宽占死
     *     - 续播门槛 2 秒：seek / 起播尽快出画面
     *   稳定性交给另外两层：分片缓存（看过的段不用重下）+ 卡顿自动换源。
     */
    try {
      p.bufferOptions = {
        preferredForwardBufferDuration: 20,
        minBufferForPlayback: 2,
        prioritizeTimeOverSizeThreshold: true,
      };
    } catch {
      /* 平台不支持就算了，用默认值 */
    }
    if (autoPlay) p.play();
  });

  /**
   * 换源时才 replace（首次挂载不用，避免多准备一次）。
   *
   * 关键修复（用户："自动换源后不接着播，而是从头开始，太恶心了"）：
   * 换源必须**记住换之前的播放位置**，新源就绪后跳回去继续播，
   * 而不是从 00:00 重新放。跳转放在"新源 ready"的时机做，太早设 currentTime 会被丢掉。
   */
  const firstUrl = useRef(url);
  const resumeAtRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  useEffect(() => {
    if (firstUrl.current === url) return;
    const p = player as unknown as { currentTime?: number };
    const keep = Math.max(0, Number(p?.currentTime ?? 0));
    resumeAtRef.current = keep > 1 ? keep - 1 : 0;
    pendingSeekRef.current = resumeAtRef.current;
    firstUrl.current = url;
    try {
      player.replace(source);
      player.play();
    } catch {
      /* 忽略：某些机型 replace 会抛，下一次自动重试 */
    }
  }, [url, player, source]);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [drift, setDrift] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [rateSheet, setRateSheet] = useState(false);
  /** 有没有真的画出一帧：没画出来就一直显示"正在加载"，而不是给一块纯黑 */
  const [hasFrame, setHasFrame] = useState(false);
  /** 兜底：某些机型即便用 TextureView 也要等一次重新布局才出画面，3 秒没出就自己重挂一次 */
  const [videoKey, setVideoKey] = useState(0);
  /** 全屏那层的独立 key：进/退全屏都重挂一次，避免两个 surface 抢同一个 player */
  const [fullKey, setFullKey] = useState(0);
  const lastBeat = useRef(0);
  const lastRateSeen = useRef(rate);

  // 倍速：服务端是权威，变了就跟着改
  useEffect(() => {
    lastRateSeen.current = rate;
    try {
      (player as unknown as { playbackRate: number }).playbackRate = rate;
    } catch {
      // 某些平台不支持时忽略
    }
  }, [player, rate]);

  // 读取播放器状态（每 700ms；以前 500ms，一次要 set 4 个 state + 一次强制重渲染，
  // 在 TextureView 上和视频解码抢主线程，表现就是"画面一顿一顿"）
  const syncRef = useRef(sync);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;
  syncRef.current = sync;
  /** 上一次"因为偏差太大而 seek"的时间：seek 一定会卡一下，必须限流 */
  const lastSeekAt = useRef(0);
  /** 连续多少次 tick 判定"该校准"（见 SYNC_PERSIST：小偏差要连续两次） */
  const pendingDriftRef = useRef(0);
  /** 卡顿累计时间：应该播却没往前走超过 3 秒就报一次（房间页据此自动换源） */
  const stalledMs = useRef(0);
  const lastStallAt = useRef(0);
  const onStallRef = useRef(onStall);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const errorShownRef = useRef(false);
  onStallRef.current = onStall;
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const p = player as unknown as { currentTime?: number; duration?: number; playing?: boolean };
        const pos = p.currentTime ?? 0;
        const dur = p.duration ?? 0;
        const isPlaying = Boolean(p.playing);
        setPosition((prev) => (Math.abs(prev - pos) < 0.25 ? prev : pos));
        setDuration((prev) => (Math.abs(prev - dur) < 0.5 ? prev : dur));
        setPlaying((prev) => (prev === isPlaying ? prev : isPlaying));
        setReady(dur > 0);

        /*
         * PLAYER_ERROR_SURFACED：播放器真的报错时必须让用户看到原因，
         * 而不是一直转圈。最典型的两种：
         *   - 系统级音频不可用：ExoPlayer 里 "Cannot create AudioTrack" → 视频也会一起失败；
         *   - 这个源 404/被墙：Source error。
         */
        try {
          const st = String((player as unknown as { status?: string }).status ?? '');
          if (st === 'error' && !errorShownRef.current) {
            errorShownRef.current = true;
            onErrorRef.current?.(
              '这个源播放失败（系统音频/网络异常）。可以点「换源」，或重启手机后再试',
            );
          } else if (st !== 'error') {
            errorShownRef.current = false;
          }
        } catch {
          /* 忽略 */
        }

        /*
         * 换源续播：新源一开始拿到时长（dur > 0）就把位置跳回去接着播。
         * 只做一次，且只在"确实离目标还差得远"时才跳，避免和自己拖动打架。
         */
        if (pendingSeekRef.current !== null && dur > 0) {
          const target = pendingSeekRef.current;
          pendingSeekRef.current = null;
          if (target > 1 && Math.abs(pos - target) > 1.5 && target < dur - 0.5) {
            try {
              (player as unknown as { currentTime: number }).currentTime = target;
              player.play();
            } catch {
              /* 忽略 */
            }
          }
        }

        const sync = syncRef.current;

        /*
         * 卡顿检测（和同步无关，纯播放器状态）：
         * 应该有声音在走、但播放器没在播（缓冲中）→ 累计时间；超过 3 秒报一次，
         * 两次上报至少隔 10 秒。房间页拿到这个信号会自动换更快的源。
         */
        /*
         * STALL_ONLY_AFTER_READY：卡顿只在"已经拿到时长、确实在播的流"上判定。
         * 起播前 isPlaying 本来就是 false，以前加载 3 秒就被当成卡顿 → 房间自动换源
         * → 地址变、播放器重载 → 又"未播放" → 再换……形成死循环，
         * 表现就是永远 0:00、总时长还一直在变、并不断弹"已自动换源（第 N 次卡顿）"。
         */
        if (!isPlaying) {
          if (ready) {
            stalledMs.current += 700;
            if (stalledMs.current >= 3000 && Date.now() - lastStallAt.current > 10_000) {
              lastStallAt.current = Date.now();
              stalledMs.current = 0;
              onStallRef.current?.();
            }
          } else {
            stalledMs.current = 0;
          }
        } else {
          stalledMs.current = 0;
        }

        /*
         * POSITION_TO_DEVICE：把真实播放位置回写给上层（房间页的 ±10s、心跳、
         * 重进房间的续播都以它为准）。
         * 以前这份"当前进度"来自模拟设备按墙钟自增的数字，和真实播放器无关 ——
         * 主控拖到 20:00 后点暂停，服务端却被写成 5:00，把跟随方拽回去。
         */
        onPositionRef.current?.(pos, isPlaying);

        if (!sync) return;

        // 同步校准
        if (!sync.isLeader) {
          const target = computeTargetPosition(sync.mediaState, serverNowNow());
          const cur = pos;
          const d = cur - target;
          setDrift((prev) => (Math.abs(prev - d) < 0.2 ? prev : d));
          /*
           * SYNC_NO_ZERO_PULL / SYNC_ASYMMETRIC_TOLERANCE 的判定全部收在
           * core/drift.ts 的 decideRoomSync 里（可被单测覆盖）：
           *  - 目标 < 1.5 秒一律不 seek，避免还没开播就被拽回 0:00；
           *  - 落后 2 秒就追，超前要 6 秒才往回拉（往回跳最伤观感）；
           *  - 两次 seek 至少隔 6 秒。
           */
          const decision = decideRoomSync(cur, target, Date.now() - lastSeekAt.current);
          if (decision.seek) {
            /*
             * SYNC_PERSIST：小偏差要"连续两次都偏"才动手。
             * 服务端位置是台阶式的（主控心跳每 2 秒落一次），偶尔会有 1~2 秒的
             * 瞬时台阶；每一次都追就成了"进度一直跳"。大偏差（>10 秒，例如主控
             * 刚拖到别的位置、或换了片）不等，立刻对齐。
             */
            const big = Math.abs(decision.driftSec) > 10;
            pendingDriftRef.current = big ? 2 : pendingDriftRef.current + 1;
            if (pendingDriftRef.current >= 2) {
              pendingDriftRef.current = 0;
              lastSeekAt.current = Date.now();
              /*
               * SYNC_PENDING_WHILE_LOADING：播放器还没拿到时长（换源/缓冲中）时
               * seek 会被直接丢掉 —— 以前每个 6 秒都去拽一次还没起来的播放器，
               * 结果就是"一直在加载、进度还一直跳"。这里改成记下来，等真的能播了再跳。
               */
              if (!ready || dur <= 0) {
                pendingSeekRef.current = target;
              } else {
                try {
                  (player as unknown as { currentTime: number }).currentTime = target;
                  setPosition(target);
                  setDrift(0);
                } catch {
                  // 忽略瞬时 seek 失败，下一轮再来
                }
              }
            }
          } else {
            pendingDriftRef.current = 0;
          }
          if (sync.mediaState.action === 'play' && !isPlaying) {
            try {
              player.play();
            } catch {
              // 忽略
            }
          }
          if (sync.mediaState.action === 'pause' && isPlaying) {
            try {
              player.pause();
            } catch {
              // 忽略
            }
          }
        } else {
          // 主控：2 秒一次心跳，把真实位置交给服务端
          const now = Date.now();
          if (now - lastBeat.current > 2000) {
            lastBeat.current = now;
            sync.onHeartbeat(pos, isPlaying);
          }
        }
      } catch {
        // 播放器尚未就绪
      }
    }, 700);
    return () => clearInterval(timer);
  }, [player]);

  // 退出全屏时把屏幕转回竖屏
  const exitFullscreen = async () => {
    setFullscreen(false);
    // 关键：退出全屏后小窗的 surfaceView/textureView 是重新创建出来的，
    // 不重置这两个状态就会出现"声音在走、画面定格在退出前那一帧"
    // （用户实测：一开始竖屏正常，横屏看了会儿退出横屏就卡住）。
    setHasFrame(false);
    setVideoKey((k) => k + 1);
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch {
      // 忽略：有的设备本来就不允许锁定
    }
    // 画面重挂有可能会把播放状态丢掉，本来在播就补一次 play
    setTimeout(() => {
      try {
        if (livePlaying.current) player.play();
      } catch {
        // 忽略
      }
    }, 220);
  };

  const enterFullscreen = async () => {
    setFullscreen(true);
    setHasFrame(false);
    setFullKey((k) => k + 1);
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } catch {
      // 锁不了方向也仍然全屏（至少变大）
    }
  };

  // 组件卸载时恢复竖屏，避免别的页面莫名其妙横着
  useEffect(() => {
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const toggle = () => {
    const next = !playing;
    try {
      if (sync && !sync.isLeader) {
        sync.onRequestPlayPause?.(next);
        return;
      }
      if (next) player.play();
      else player.pause();
    } catch {
      onError?.('播放器操作失败');
    }
  };

  const seekBy = (delta: number) => {
    try {
      const p = player as unknown as { currentTime: number };
      p.currentTime = Math.max(0, (p.currentTime ?? 0) + delta);
    } catch {
      // 忽略
    }
  };

  // ---- 进度：拖动 / 滑动画面跳转 ----  /** 正在拖动或滑动时预览到的位置（null = 没在操作） */
  const [scrubTarget, setScrubTarget] = useState<number | null>(null);
  const videoWidth = useRef(1);
  const livePos = useRef(0);
  /*
   * SYNC_SERVERNOW_FRESH：sync.serverNow 是**快照那一刻**的服务端时间。
   * 每 2 秒才来一次快照，中间它就不动了；而跟随端本地一直在走，
   * 于是算出来的"应该到哪了"永远慢半拍 → 每隔几秒被往回 seek 一次
   * （表现：一会儿跟我一样、一会儿又往回缩）。
   * 这里记下拿到它的本地时刻，用本地流逝时间把它往前推，等于一个平滑的服务端时钟。
   */
  const serverNowSeenAt = useRef(Date.now());
  const serverNowSeenValue = useRef(sync?.serverNow ?? 0);
  useEffect(() => {
    if (!sync) return;
    serverNowSeenAt.current = Date.now();
    serverNowSeenValue.current = sync.serverNow;
  }, [sync?.serverNow]);
  /** 估算"现在"的服务端时间（毫秒） */
  const serverNowNow = () =>
    serverNowSeenValue.current + Math.max(0, Date.now() - serverNowSeenAt.current);
  const liveDur = useRef(0);
  const livePlaying = useRef(false);
  livePos.current = position;
  liveDur.current = duration;
  livePlaying.current = playing;

  /**
   * 落地一次跳转。
   *
   * 用户反馈「拖动进度条没法拖」——原来进度条只是个 View，根本没有手势；
   * 现在拖动条、在画面上左右滑、双击左右半边都能跳，跳完还会把新位置告诉服务端
   * （同步模式下对方会跟着跳过去，不然两边就必然不同步）。
   */
  const applySeek = (target: number) => {
    const upper = liveDur.current > 1 ? liveDur.current - 0.4 : Math.max(0, target);
    const clamped = Math.max(0, Math.min(upper, target));
    try {
      (player as unknown as { currentTime: number }).currentTime = clamped;
    } catch {
      onError?.('跳转失败，请再试一次');
      return;
    }
    setPosition(clamped);
    setDrift(0);
    onSeek?.(clamped);
  };

  /** 画面上的左右滑动 / 双击：dx 换算成秒数（整屏宽度 ≈ 片长的 1/3，最少 90 秒、最多 10 分钟） */
  const secondsPerPx = () => {
    const span = liveDur.current;
    const full = span > 0 ? Math.min(600, Math.max(90, span / 3)) : 180;
    return full / Math.max(1, videoWidth.current);
  };

  const seekPan = useRef(
    PanResponder.create({
      // 单击不抢，双击/滑动才抢：不然点一下画面就无法放大了
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderGrant: () => {
        setScrubTarget(livePos.current);
      },
      onPanResponderMove: (_e, g) => {
        const target = livePos.current + g.dx * secondsPerPx();
        const upper = liveDur.current > 1 ? liveDur.current - 0.4 : target;
        setScrubTarget(Math.max(0, Math.min(upper, target)));
      },
      onPanResponderRelease: (_e, g) => {
        const target = livePos.current + g.dx * secondsPerPx();
        setScrubTarget(null);
        applySeek(target);
      },
      onPanResponderTerminate: () => setScrubTarget(null),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // 双击左右半边快退/快进 10 秒；单击放大（和以前一样）
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 单击画面 = 显示/隐藏控制条（像所有播放器那样），双击左右半边 = ±10 秒。
   *
   * 用户反馈："进度条一直挂着，太影响强迫症了，点一下能缩下去、再点一下出来。"
   * 所以：单击切换显隐；控制条出现后 4 秒不再动就自动收起（暂停时保持显示）。
   */
  /* 控制条显隐：默认显示，4 秒无操作自动收起 */
  const [uiVisible, setUiVisible] = useState(true);
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearUiTimer = () => {
    if (uiTimer.current) {
      clearTimeout(uiTimer.current);
      uiTimer.current = null;
    }
  };
  const hideLater = () => {
    clearUiTimer();
    uiTimer.current = setTimeout(() => setUiVisible(false), 4000);
  };
  /** 任何一次交互都把控制条亮出来、并把"自动收起"往后推 4 秒 */
  const bumpUi = () => {
    setUiVisible(true);
    hideLater();
  };
  /* 只在**正在播放**时才自动收起；暂停时一直显示，方便你随时点 */
  useEffect(() => {
    if (!uiVisible) return;
    if (playing) hideLater();
    return clearUiTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiVisible, playing]);

  const onVideoTap = (x: number, width: number) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (tapTimer.current) {
        clearTimeout(tapTimer.current);
        tapTimer.current = null;
      }
      const delta = x < width / 2 ? -10 : 10;
      applySeek(livePos.current + delta);
      setScrubTarget(livePos.current + delta);
      setTimeout(() => setScrubTarget(null), 550);
      bumpUi();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setUiVisible((v) => {
        const next = !v;
        if (next) {
          clearUiTimer();
          uiTimer.current = setTimeout(() => setUiVisible(false), 4000);
        } else {
          clearUiTimer();
        }
        return next;
      });
    }, 260);
  };

  /** 拖动时中间的预览气泡：目标时间 + 前后差值 */
  const seekBubble = () =>
    scrubTarget === null ? null : (
      <View pointerEvents="none" style={styles.seekBubble}>
        <Text style={styles.seekBubbleTime}>
          {formatDuration(scrubTarget)} / {formatDuration(duration)}
        </Text>
        <Text style={styles.seekBubbleDelta}>
          {scrubTarget - position >= 0 ? '+' : ''}
          {Math.round(scrubTarget - position)}s
        </Text>
      </View>
    );

  /**
   * 手动「同步进度」：把本地播放位置直接对齐到**服务端权威位置**
   * （也就是主控那边的进度），播放/暂停状态也一并对齐。
   *
   * 自动校准只在偏差 > 1.5 秒时才动手（避免每帧都 seek 造成卡顿），
   * 所以偶尔会出现"两边差一秒多、看着不同步"的情况；给用户一个能立刻按的按钮。
   */
  const syncNow = () => {
    if (!sync) return;
    const target = computeTargetPosition(sync.mediaState, serverNowNow());
    try {
      (player as unknown as { currentTime: number }).currentTime = Math.max(0, target);
      setDrift(0);
      if (sync.mediaState.action === 'play' && !player.playing) player.play();
      if (sync.mediaState.action === 'pause' && player.playing) player.pause();
    } catch {
      onError?.('对齐进度失败，请重试');
      return;
    }
    // 跟随方对齐后顺手报一次心跳，让服务端也知道我这边真的跟上了
    sync.onHeartbeat(Math.max(0, target), sync.mediaState.action === 'play');
  };

  const pct = useMemo(() => (duration > 0 ? Math.min(1, position / duration) : 0), [position, duration]);

  /** 控制条：竖屏和全屏共用 */
  const renderControls = (full: boolean) => (
    <View style={[styles.chrome, full ? styles.chromeFull : null]}>
      {/* 第一行：播放 + ±10s + 进度条 + 时间（永远不能被截断） */}
      <View style={styles.controls}>
        <Pressable onPress={() => { bumpUi(); toggle(); }} style={styles.playBtn}>
          <Text style={{ color: '#FFFFFF', fontSize: full ? 18 : 15 }}>{playing ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable onPress={() => { bumpUi(); seekBy(-10); }} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>−10s</Text>
        </Pressable>
        <SeekBar
          position={position}
          duration={duration}
          onPreview={setScrubTarget}
          onCommit={applySeek}
        />
        <Text style={styles.time}>
          {formatDuration(Math.max(0, position))} / {formatDuration(duration)}
        </Text>
        <Pressable onPress={() => { bumpUi(); seekBy(10); }} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>+10s</Text>
        </Pressable>
      </View>
      {/*
       * 第二行：同步 / 倍速 / 换源 / 放大 —— 玻璃小药丸，不再是四块白砖。
       *
       * 原来八颗按钮挤成一行、还是白底，窄屏被切、暗底上又刺眼（用户原话："有点不太好看"）。
       * 现在拆两行 + 统一做成暗底玻璃片，和下面那颗"跟着 TA 的进度"胶囊是一套语言。
       */}
      <View style={styles.controlsRow2}>
        {sync ? (
          <Pressable onPress={() => { bumpUi(); syncNow(); }} style={styles.chipBtn}>
            <Text style={styles.chipBtnText}>⟳ 同步</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => { bumpUi(); setRateSheet((v) => !v); }} style={styles.chipBtn}>
          <Text style={styles.chipBtnText}>{rate === 1 ? '⏱ 倍速' : `⏱ ${rate}x`}</Text>
        </Pressable>
        {sourceSwitcher ? (
          <Pressable onPress={() => { bumpUi(); sourceSwitcher.onPress(); }} style={styles.chipBtn}>
            <Text style={styles.chipBtnText}>⇄ {sourceSwitcher.label}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => { bumpUi(); if (full) void exitFullscreen(); else void enterFullscreen(); }} style={styles.chipBtn}>
          <Text style={styles.chipBtnText}>{full ? '✕ 退出' : '⛶ 放大'}</Text>
        </Pressable>
      </View>
    </View>
  );

  /** 倍速选择条 */
  const renderRates = () =>
    rateSheet ? (
      <View style={styles.rateRow}>
        {PLAYBACK_RATES.map((r) => (
          <Pressable
            key={r}
            onPress={() => {
              setRateSheet(false);
              onRateChange?.(r);
              try {
                (player as unknown as { playbackRate: number }).playbackRate = r;
              } catch {
                // 忽略
              }
            }}
            style={[styles.rateChip, rate === r ? styles.rateChipActive : null]}
          >
            <Text style={[styles.rateText, rate === r ? { color: '#1A1210' } : null]}>
              {r === 1 ? '原速' : `${r}x`}
            </Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  /** 弹幕层：绝对定位盖在视频上，从右往左飘 */
  const danmakuLayer = () => (
    <View pointerEvents="none" style={styles.danmakuLayer}>
      {lanes.map((lane) => (
        <DanmakuLine key={lane.key} text={lane.text} lane={lane.lane} />
      ))}
    </View>
  );

  const videoNode = (full: boolean) => (
    <VideoView
      key={full ? `full-${fullKey}` : `inline-${videoKey}`}
      player={player}
      style={full ? styles.videoFull : styles.video}
      contentFit="contain"
      nativeControls={false}
      /**
       * 竖着放小窗时必须用 TextureView。
       *
       * 用户实测：「竖着的时候播放是黑屏，必须横过来才有画面」。
       * 原因是 Android 的 SurfaceView 画在独立图层上，当它被放进一个
       * 带 borderRadius + overflow:'hidden' 的圆角容器里时，很多机型不会自己
       * 重新裁剪那块 surface，结果就是**有声音、有时间在走、画面全黑**；
       * 一旋转屏幕触发重新布局，画面就出来了。TextureView 是普通 View 的
       * 绘制路径，会老老实实跟着容器的圆角裁切，所以小窗用它。
       * 全屏那层没有圆角、而且面积大，继续用 SurfaceView（性能更好）。
       */
      surfaceType={full ? 'surfaceView' : 'textureView'}
      onFirstFrameRender={() => setHasFrame(true)}
    />
  );

  const insets = useSafeAreaInsets();

  // ---- 弹幕：按播放位置把弹幕放到画面上 ----
  const [lanes, setLanes] = useState<Array<{ key: string; text: string; lane: number }>>([]);
  const shownRef = useRef<Set<string>>(new Set());
  /** 「文本 + 秒级位置」→ 上次飘出来的时刻（同一条弹幕不重复飘，见 DANMAKU_TEXT_DEDUPE） */
  const recentTextRef = useRef<Map<string, number>>(new Map());
  const laneCursor = useRef(0);
  /** 自动重挂计数（最多 2 次，避免无限重挂） */
  const remounts = useRef(0);

  // 换片/换源时重置"已出画面"标记，否则会拿着上一部的状态；
  // 弹幕也一起清空——上一部已经飘出来/放过的弹幕不能带到新片上
  useEffect(() => {
    setHasFrame(false);
    shownRef.current.clear();
    setLanes([]);
    laneCursor.current = 0;
    remounts.current = 0;
  }, [url]);

  // 有音频在走却迟迟不出画面 → 自动重挂播放器（等价于用户"转一下屏幕"）
  useEffect(() => {
    if (!ready || hasFrame) return;
    if (remounts.current >= 2) return;
    const timer = setTimeout(() => {
      remounts.current += 1;
      setVideoKey((k) => k + 1);
    }, 3000);
    return () => clearTimeout(timer);
  }, [ready, hasFrame, url, videoKey]);

  /*
   * 「源太慢」判定：12 秒还没出画面，基本就是这个源的带宽跟不上（实测这类采集站
   * 只有 300~480kbps，而片源要 1610kbps）。这时不再傻等：
   *   1) 报一次 onStall，让房间页走自动换源；
   *   2) 界面上直接写明原因，用户知道该点「换源」而不是以为 App 坏了。
   */
  const [slowSource, setSlowSource] = useState(false);
  useEffect(() => {
    if (hasFrame) {
      setSlowSource(false);
      return;
    }
    const timer = setTimeout(() => {
      setSlowSource(true);
      onStallRef.current?.();
    }, 12_000);
    return () => clearTimeout(timer);
  }, [hasFrame, url]);

  useEffect(() => {
    if (!danmaku || danmaku.length === 0) return;
    // 播放位置往前 1 秒内的弹幕算"刚到"，还没显示过就放出来
    const nowSec = position;
    for (const d of danmaku) {
      if (!d || !d.text) continue;
      if (shownRef.current.has(d.id)) continue;
      if (d.mediaPosSec > nowSec + 0.6 || d.mediaPosSec < nowSec - 3) continue;
      shownRef.current.add(d.id);
      /*
       * DANMAKU_TEXT_DEDUPE：同一条弹幕在服务端可能被落成两条
       * （本地乐观一条 + 服务端一条，id 不同），用户实测「发一次飘出来俩」。
       * 这里按「文本 + 秒级位置」在 8 秒内再兜一层，两条只会飘一条。
       */
      const textKey = `${d.text}|${Math.round(d.mediaPosSec)}`;
      const seenAt = recentTextRef.current.get(textKey) ?? 0;
      if (Date.now() - seenAt < 8000) continue;
      recentTextRef.current.set(textKey, Date.now());
      const lane = laneCursor.current % 4;
      laneCursor.current += 1;
      const key = `${d.id}-${Date.now()}`;
      setLanes((prev) => [...prev.slice(-12), { key, text: d.text, lane }]);
      // 6 秒后移除（动画结束）
      setTimeout(() => {
        setLanes((prev) => prev.filter((x) => x.key !== key));
      }, 6000);
    }
  }, [position, danmaku]);


  return (
    <View style={styles.wrap}>
      <View style={styles.videoBox}>
        {/* 全屏时不再渲染小窗：同一个 player 上挂两个 View，
            退出全屏后小窗经常接不回画面（只剩声音在走）。 */}
        {fullscreen ? null : videoNode(false)}
        {danmakuLayer()}
        {/* 手指在画面上左右滑 = 快退/快进；双击左右半边 = ±10 秒；单击 = 放大 */}
        <View
          style={styles.gestureLayer}
          onLayout={(e) => {
            videoWidth.current = Math.max(1, e.nativeEvent.layout.width);
          }}
          {...seekPan.panHandlers}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => onVideoTap(e.nativeEvent.locationX, videoWidth.current)}
          />
        </View>
        {seekBubble()}
        {!ready || !hasFrame ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={[font.tiny, { color: 'rgba(255,255,255,0.75)', marginTop: 8 }]}>
              {slowSource
                ? '这个源太慢，网络跟不上…'
                : ready
                  ? '正在出画面…'
                  : '正在加载片源…'}
            </Text>
            {slowSource ? (
              <Text
                style={[
                  font.tiny,
                  { color: 'rgba(255,255,255,0.55)', marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
                ]}
              >
                实测这类采集站只有 300~480kbps，片源要 1600kbps{'\n'}
                点下面的「换源」换一个快一点的
              </Text>
            ) : null}
          </View>
        ) : null}
        {title && uiVisible ? (
          <View style={styles.titleBar}>
            <Text style={[font.tiny, { color: '#FFFFFF' }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
        {/* 点画面也能直接放大，符合手机看片的直觉 */}
        {uiVisible ? (
          <Pressable style={styles.expandHot} onPress={() => void enterFullscreen()}>
            <Text style={styles.expandHint}>⛶</Text>
          </Pressable>
        ) : null}
      </View>

      {uiVisible ? renderControls(false) : null}
      {uiVisible ? renderRates() : null}

      {sync ? (
        /* 同步胶囊：暗底上的玻璃片，别再是一行灰字 */
        <View style={styles.syncBar}>
          <View style={styles.syncPill}>
            <Text style={styles.syncPillInk}>
              {sync.isLeader ? '🎬 你掌着进度' : '💞 跟着 TA 的进度'}
            </Text>
            <View style={styles.syncDot} />
            <Text style={styles.syncPillNum}>
              {drift >= 0 ? '+' : ''}
              {drift.toFixed(2)}s
            </Text>
            {Math.abs(drift) > 1.5 ? <Text style={styles.syncPillWarn}>校准中</Text> : null}
            {rate !== 1 ? <Text style={styles.syncPillNum}>{rate}x</Text> : null}
          </View>
        </View>
      ) : null}

      {/* 全屏（横屏）播放器 */}
      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => void exitFullscreen()} supportedOrientations={['landscape', 'portrait']}>
        <View style={[styles.fullRoot, { paddingTop: insets.top * 0.4 }]}>
          <View style={styles.fullVideoBox}>
            {videoNode(true)}
            {danmakuLayer()}
            <View style={styles.gestureLayer} {...seekPan.panHandlers}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={(e) => onVideoTap(e.nativeEvent.locationX, Dimensions.get('window').width)}
              />
            </View>
            {seekBubble()}
            {!hasFrame ? (
              <View style={styles.loading}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
          </View>
          {uiVisible ? renderControls(true) : null}
          {uiVisible ? renderRates() : null}
        </View>
      </Modal>
    </View>
  );
}

/**
 * 可拖动的进度条。
 *
 * 用户反馈「看电影时拖动进度条没法拖动」：原来它是个纯 View，只有宽度百分比，
 * 没有任何手势。现在：
 *  - 按住就能拖（触摸区 30px 高，实际轨道只有 5px，手指不容易点偏）；
 *  - 拖动过程中只更新预览气泡，松手才真的 seek（避免一路拖一路解码卡顿）；
 *  - 点空白处直接跳到那个位置。
 */
function SeekBar({
  position,
  duration,
  onPreview,
  onCommit,
}: {
  position: number;
  duration: number;
  onPreview: (target: number | null) => void;
  onCommit: (target: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const durRef = useRef(0);
  const grantX = useRef(0);
  widthRef.current = width;
  durRef.current = duration;

  const timeAt = (x: number) => {
    if (!(durRef.current > 0)) return 0;
    const clamped = Math.max(0, Math.min(widthRef.current, x));
    return (clamped / widthRef.current) * durRef.current;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        grantX.current = e.nativeEvent.locationX;
        onPreview(timeAt(e.nativeEvent.locationX));
      },
      onPanResponderMove: (_e, g) => {
        onPreview(timeAt(grantX.current + g.dx));
      },
      onPanResponderRelease: (_e, g) => {
        const target = timeAt(grantX.current + g.dx);
        onPreview(null);
        onCommit(target);
      },
      onPanResponderTerminate: () => onPreview(null),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  return (
    <View
      style={styles.progressWrap}
      onLayout={(e) => {
        const w = Math.max(1, e.nativeEvent.layout.width);
        widthRef.current = w;
        setWidth(w);
      }}
      {...responder.panHandlers}
    >
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={[styles.progressThumb, { left: Math.max(0, Math.min(width - 9, pct * width - 4.5)) }]} />
    </View>
  );
}

/** 一条从右往左飘的弹幕 */
function DanmakuLine({ text, lane }: { text: string; lane: number }) {  const { width } = Dimensions.get('window');
  const anim = useRef(new Animated.Value(width)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: -width * 0.9,
      duration: 6000,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [anim, width]);
  return (
    <Animated.Text
      numberOfLines={1}
      style={[
        styles.danmakuText,
        { top: 8 + lane * 22, transform: [{ translateX: anim }] },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

/**
 * 只在关键字段变化时才重渲染（见上面 MoviePlayerInner 的注释）。
 * 播放进度、对方心跳这些每秒都在变的东西**不该**让播放器重渲染。
 */
export const MoviePlayer = React.memo(MoviePlayerInner, (prev, next) => {
  if (prev.url !== next.url) return false;
  if (prev.title !== next.title) return false;
  if (prev.rate !== next.rate) return false;
  if ((prev.danmaku?.length ?? 0) !== (next.danmaku?.length ?? 0)) return false;
  if (prev.sourceSwitcher?.label !== next.sourceSwitcher?.label) return false;
  const a = prev.sync;
  const b = next.sync;
  if (!a || !b) return a === b;
  if (a.isLeader !== b.isLeader) return false;
  if (a.mediaState.action !== b.mediaState.action) return false;
  if (Math.abs(a.mediaState.rate - b.mediaState.rate) > 0.001) return false;
  if (Math.abs(a.mediaState.positionSec - b.mediaState.positionSec) > 0.75) return false;
  return true;
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  // 弹幕直接盖在 videoBox / fullVideoBox 里（不再多包一层容器，避免把视频高度压成 0）
  danmakuLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  danmakuText: {
    position: 'absolute',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0F0D0C',
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  video: { width: '100%', height: '100%' },
  // 手势层：盖在画面上，只在横向拖动时抢手势，单击仍然穿给放大按钮
  gestureLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  seekBubble: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    backgroundColor: 'rgba(0,0,0,0.68)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  seekBubbleTime: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  seekBubbleDelta: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  progressWrap: {
    flex: 1,
    height: 30,
    justifyContent: 'center',
  },
  progressThumb: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: color.primary,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  expandHot: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  expandHint: { color: '#FFFFFF', fontSize: 14 },
  controlsWrap: { marginTop: 8 },
  /** 控制区整体：一块暗玻璃，和下面的同步胶囊同一套语言 */
  chrome: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(10,8,12,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chromeFull: { marginTop: 10 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  controlsRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  controlsFull: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 0,
    backgroundColor: '#0F0D0C',
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  smallBtnText: { ...font.tiny, color: 'rgba(255,255,255,0.92)', fontWeight: '700' },
  /** ±10 秒：暗底圆钮 */
  skipBtn: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  skipBtnText: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  /** 第二行的玻璃药丸：同步 / 倍速 / 换源 / 放大 */
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  chipBtnText: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.88)', letterSpacing: 0.2 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: { height: 5, backgroundColor: color.primary },
  time: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    fontVariant: ['tabular-nums'],
  },
  syncBar: { marginTop: 6, flexDirection: 'row' },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  syncPillInk: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  syncDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.42)' },
  syncPillNum: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    fontVariant: ['tabular-nums'],
  },
  syncPillWarn: { fontSize: 10, fontWeight: '700', color: '#FFD8A8' },
  rateRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  rateChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  rateChipActive: { backgroundColor: color.primary, borderColor: color.primary },
  rateText: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  fullRoot: { flex: 1, backgroundColor: '#000000' },
  fullVideoBox: { flex: 1, justifyContent: 'center' },
  videoFull: { width: '100%', height: '100%' },
});
