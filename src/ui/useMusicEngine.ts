import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { claimAudioFocus, registerAudioOwner, releaseAudioFocus, unregisterAudioOwner } from '../lib/audioFocus';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  isAtEnd,
  isStalled as isStalledByRule,
  planTrackEnd,
  makePlayIntent,
  musicTargetPosition,
  musicWant,
  shouldSeek,
  tapTrackAction,
  type PlayIntent,
  type PlayLike,
} from '../core/musicSync';
import type { MusicAction, MusicState } from '../core/types';

/**
 * 一起听 · 播放引擎（页面里唯一的一份播放状态）
 *
 * 真机上出过的三个 bug 都是"状态有两份"造成的：
 *   - 大按钮看本地 player.playing，队列里的小三角看服务端 music.action，
 *     于是同一个界面里两个按钮各说各的；
 *   - 点暂停只是调了 player.pause()，一旦这次调用没生效（源码还没加载好、
 *     正处于缓冲），没有任何东西会再纠正它，歌就继续唱；
 *   - 队列里那个小三角压根没做播放/暂停，只发了 change_track。
 *
 * 现在：**这个 hook 是唯一真相**，任何一处按钮都读同一份 `playing`，
 * 并且每 350ms 做一次"对账"：想播就播、想停就停，两条控制路径不可能再分叉。
 */

export type MusicEngine = {
  track: MusicState['queue'][number] | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffering: boolean;
  stalled: boolean;
  volumePct: number;
  toggle: () => void;
  /** 点队列里的某一首：同一首 = 播放/暂停，别的 = 切过去并播放 */
  selectTrack: (index: number) => void;
  step: (dir: 1 | -1) => void;
  seekTo: (sec: number) => void;
  retry: () => void;
  setLoop: (loop: boolean) => void;
  setShuffle: (shuffle: boolean) => void;
  /** 音频直链（排查失败时显示出来） */
  sourceUrl: string | null;
};

export function useMusicEngine({
  role,
  music,
  serverNow,
  voiceConnected,
  onAction,
}: {
  role: 'A' | 'B';
  music: MusicState;
  serverNow: number;
  voiceConnected: boolean;
  onAction: (action: MusicAction, payload?: { positionSec?: number; index?: number; loop?: boolean; shuffle?: boolean }) => void;
}): MusicEngine {
  const playerRef = useRef<AudioPlayer | null>(null);
  const trackIdRef = useRef<string | null>(null);
  const intentRef = useRef<PlayIntent | null>(null);
  const loadingSinceRef = useRef(0);
  /*
   * MUSIC_FAIL_FAST：音乐文件加载不出来时不要再无限重试。
   * 关掉云服务器后队列里的音频全是死链，播放器会不停创建/重试、一直占着音频设备，
   * 结果连电影都放不出来（日志里就是 Cannot create AudioTrack）。
   * 这里连续失败 2 次就：释放播放器、交还音频焦点、停止自动重试（用户手动点播放才会再试）。
   */
  const failCountRef = useRef(0);
  const FOCUS_ID_SAFE = 'listen';
  const shutdownMusic = useCallback(() => {
    try {
      playerRef.current?.release?.();
    } catch {
      /* 忽略 */
    }
    playerRef.current = null;
    try {
      releaseAudioFocus(FOCUS_ID_SAFE);
    } catch {
      /* 忽略 */
    }
    setPlaying(false);
    setBuffering(false);
  }, []);

  const beatRef = useRef(0);
  // 每秒看一眼播放器是不是 error（死链会立刻变 error）
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const st = String((playerRef.current as unknown as { status?: string } | null)?.status ?? '');
        if (st === 'error') {
          failCountRef.current += 1;
          if (failCountRef.current >= 2) shutdownMusic();
        } else if (st === 'readyToPlay' || st === 'loading') {
          failCountRef.current = 0;
        }
      } catch {
        /* 忽略 */
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [shutdownMusic]);

  const appliedSeqRef = useRef(0);
  /** 上一次"跟着对方进度跳转"的时间：避免每 350ms 都 seek 一次 */
  const lastSeekFixRef = useRef(0);
  const stallNotifiedRef = useRef<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [volumePct, setVolumePct] = useState(100);

  const track = music.queue[music.index] ?? null;
  const trackUrl = track?.url ?? null;

  /** 只要有一条直链就保证播放器实例存在（失败重试会重建实例） */
  const ensurePlayer = useCallback((uri: string | null): AudioPlayer | null => {
    if (playerRef.current) return playerRef.current;
    try {
      const p = createAudioPlayer(uri ? { uri } : null);
      playerRef.current = p;
      return p;
    } catch {
      return null;
    }
  }, []);

  // 销毁 + 音频焦点登记
  const FOCUS_ID = 'listen';
  useEffect(() => {
    /*
     * 用户要求：「不要一最小化软件音乐就停，后台照样能放」。
     * Android 上要让音频在切到后台后继续，必须显式声明（默认一进后台就被系统掐掉）：
     *   - shouldPlayInBackground: 允许后台播放
     *   - interruptionMode: 被来电/别的 App 打断时的处理，duck 会压低而不是直接停
     *   - playsInSilentMode: 静音档也出声音（一起听的时候对方按了静音也要能听到）
     */
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    } as Parameters<typeof setAudioModeAsync>[0]).catch(() => undefined);
    // 别人（比如收藏里的本地预览）开始播放时，把这里暂停
    registerAudioOwner(FOCUS_ID, () => {
      try {
        playerRef.current?.pause();
      } catch {
        // 忽略
      }
      setPlaying(false);
    });
    return () => {
      unregisterAudioOwner(FOCUS_ID);
      try {
        playerRef.current?.remove();
      } catch {
        // 释放失败忽略
      }
      playerRef.current = null;
      trackIdRef.current = null;
    };
  }, []);

  // 切歌 / 首次加载：装载音源
  useEffect(() => {
    if (!trackUrl) {
      /*
       * 队列被删空时要真的停下来。以前这里只清时长：原生播放器还在出声，
       * 而迷你条（没歌时不渲染）和播放器页的大按钮（disabled）都给不了停止入口，
       * 声音只能杀进程才停。
       */
      const p0 = playerRef.current;
      if (p0 && p0.playing) {
        try {
          p0.pause();
        } catch {
          /* 忽略 */
        }
      }
      releaseAudioFocus(FOCUS_ID);
      setPlaying(false);
      setBuffering(false);
      trackIdRef.current = null;
      loadingSinceRef.current = 0;
      setDuration(0);
      setCurrentTime(0);
      return;
    }
    const p = ensurePlayer(trackUrl);
    if (!p) return;
    if (trackIdRef.current === trackUrl) return;
    trackIdRef.current = trackUrl;
    appliedSeqRef.current = music.seq;
    loadingSinceRef.current = Date.now();
    stallNotifiedRef.current = null;
    setDuration(0);
    setCurrentTime(0);
    setStalled(false);
    setBuffering(true);
    try {
      p.replace({ uri: trackUrl });
      p.loop = false;
      p.volume = voiceConnected ? 0.35 : 1;
    } catch {
      setStalled(true);
    }
  }, [trackUrl, ensurePlayer, music.seq, voiceConnected]);

  // 音频焦点：语音接通时压低音乐
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.volume = voiceConnected ? 0.35 : 1;
      setVolumePct(voiceConnected ? 35 : 100);
    } catch {
      // 忽略
    }
  }, [voiceConnected, trackUrl]);

  // 对账循环：唯一决定"该播还是该停"的地方
  useEffect(() => {
    const timer = setInterval(() => {
      const p = playerRef.current;
      const now = Date.now();
      const want: PlayLike = musicWant({
        action: music.action === 'play' ? 'play' : 'pause',
        intent: intentRef.current,
        seq: music.seq,
        updatedBySelf: music.updatedBy === role,
        now,
      });
      // 服务端已经跟上我的意图，窗口就可以撤了
      if (intentRef.current && (music.action === 'play') === (intentRef.current.want === 'play')) {
        intentRef.current = null;
      }

      if (!p) return;
      let cur = 0;
      let dur = 0;
      let isPlaying = false;
      let isBuffering = false;
      try {
        cur = typeof p.currentTime === 'number' ? p.currentTime : 0;
        dur = typeof p.duration === 'number' ? p.duration : 0;
        isPlaying = Boolean(p.playing);
        isBuffering = Boolean(p.isBuffering);
      } catch {
        return;
      }
      setCurrentTime(cur);
      setDuration(dur);
      setPlaying(isPlaying);
      setBuffering(isBuffering);
      if (dur > 0) loadingSinceRef.current = 0;

      /** 放完了（或已经到结尾）：ExoPlayer 停在 ENDED，直接 play() 是没反应的 */
      const atEnd = isAtEnd(cur, dur);

      if (want === 'play' && trackUrl) {
        const stall = isStalledByRule({
          want,
          durationSec: dur,
          loadingSince: loadingSinceRef.current,
          now,
        });
        if (stall && !isPlaying) {
          setStalled(true);
          if (stallNotifiedRef.current !== trackUrl) {
            stallNotifiedRef.current = trackUrl;
          }
        } else if (!isPlaying && !stall) {
          if (atEnd) {
            const plan = planTrackEnd({
              loop: music.loop,
              shuffle: music.shuffle,
              queueLength: music.queue.length,
              index: music.index,
            });
            if (plan.kind === 'next') {
              onAction('change_track', { index: plan.index });
            } else if (plan.kind === 'replay') {
              void p
                .seekTo(0)
                .then(() => {
                  try {
                    claimAudioFocus(FOCUS_ID);
                    p.play();
                  } catch {
                    // 下一轮再试
                  }
                })
                .catch(() => undefined);
              onAction('seek', { positionSec: 0 });
            }
          } else {
            try {
              claimAudioFocus(FOCUS_ID);
              p.play();
            } catch {
              // 下一次对账再试
            }
          }
        }
      }
      // 想停 → 真的停
      if (want === 'pause' && isPlaying) {
        try {
          p.pause();
        } catch {
          // 下一次对账再试
        }
      }

      // 跟随对方的进度：**只在对方驱动时纠正**
      // 以前自己的心跳也会触发纠正，于是"放完重播"和"纠正回 6 秒"互相打架，
      // 表现就是进度卡住不动、按了播放像没反应。
      if (music.seq > appliedSeqRef.current) {
        appliedSeqRef.current = music.seq;
        const partnerDriving = music.updatedBy !== role;
        /*
         * SEEK_COOLDOWN：刚 seek 完的 4 秒内不再纠正，
         * 并且**缓冲中/卡住时一律不纠**（否则每纠一次就重新缓冲，永远出不来）。
         */
        const busy = isBuffering;
        if (partnerDriving && !intentRef.current && !busy && now - lastSeekFixRef.current > 4000) {
          const target = musicTargetPosition(
            {
              action: music.action === 'play' ? 'play' : 'pause',
              positionSec: music.positionSec,
              updatedAtServerMs: music.updatedAtServerMs,
            },
            serverNow,
          );
          if (shouldSeek(cur, target, 2.5)) {
            lastSeekFixRef.current = now;
            void p.seekTo(Math.max(0, target)).catch(() => undefined);
          }
        }
      }
    }, 350);
    return () => clearInterval(timer);
  }, [music.action, music.seq, music.updatedBy, music.positionSec, music.updatedAtServerMs, role, serverNow, trackUrl]);

  // 主控心跳：每 5 秒把真实进度交给服务端，防止两边越漂越远
  useEffect(() => {
    const timer = setInterval(() => {
      if (music.updatedBy !== role) return;
      if (music.action !== 'play') return;
      const p = playerRef.current;
      if (!p) return;
      const now = Date.now();
      if (now - beatRef.current < 5000) return;
      beatRef.current = now;
      const local = Math.max(0, Number(p.currentTime) || 0);
      /*
       * HEARTBEAT_ON_DRIFT：服务端那份"应该到哪了"和本地实际差得不多就别发，
       * 省掉一次没必要的 seq 递增（对方会因为 seq 变化再纠一次）。
       */
      const elapsed = Math.max(0, (now - (music.updatedAtServerMs || now)) / 1000);
      const expected = Math.max(0, (music.positionSec || 0) + elapsed);
      if (Math.abs(local - expected) < 2.5) return;
      onAction('seek', { positionSec: local });
    }, 1000);
    return () => clearInterval(timer);
  }, [music.updatedBy, music.action, role, onAction]);

  const toggle = useCallback(() => {
    if (!trackUrl) return;
    const now = Date.now();
    const want = musicWant({
      action: music.action === 'play' ? 'play' : 'pause',
      intent: intentRef.current,
      seq: music.seq,
      updatedBySelf: music.updatedBy === role,
      now,
    });
    const next: PlayLike = want === 'play' ? 'pause' : 'play';
    intentRef.current = makePlayIntent(next, music.seq, now);
    // 立刻反馈：按钮必须在 0ms 内翻转，否则用户以为"没点到"
    setPlaying(next === 'play');
    if (next === 'pause') setStalled(false);
    const p = ensurePlayer(trackUrl);
    try {
      if (next === 'play') {
        // 停在结尾时 play() 是没反应的（ExoPlayer 在 ENDED 状态）→ 先回到 0
        const cur = p?.currentTime ?? 0;
        const dur = p?.duration ?? 0;
        if (isAtEnd(cur, dur)) {
          void p?.seekTo(0).catch(() => undefined);
        }
        if (stalled || !playerRef.current) {
          loadingSinceRef.current = Date.now();
          setStalled(false);
          p?.replace({ uri: trackUrl });
        }
        claimAudioFocus(FOCUS_ID);
        p?.play();
      } else {
        p?.pause();
      }
    } catch {
      // 对账循环会兜住
    }
    onAction(next, { positionSec: playerRef.current?.currentTime ?? 0 });
  }, [trackUrl, music.action, music.seq, music.updatedBy, ensurePlayer, stalled, onAction]);

  const selectTrack = useCallback(
    (index: number) => {
      if (!music.queue[index]) return;
      if (tapTrackAction(index, music.index) === 'toggle') {
        toggle();
        return;
      }
      const now = Date.now();
      intentRef.current = makePlayIntent('play', music.seq, now);
      setPlaying(true);
      setStalled(false);
      setCurrentTime(0);
      setDuration(0);
      onAction('change_track', { index });
    },
    [music.queue, music.index, music.seq, toggle, onAction],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const len = music.queue.length;
      if (len === 0) return;
      let next = music.index + dir;
      if (music.shuffle && len > 1) {
        next = Math.floor(Math.random() * len);
        if (next === music.index) next = (next + 1) % len;
      } else if (music.loop) {
        next = ((next % len) + len) % len;
      }
      next = Math.max(0, Math.min(len - 1, next));
      intentRef.current = makePlayIntent('play', music.seq, Date.now());
      setPlaying(true);
      setStalled(false);
      onAction('change_track', { index: next });
    },
    [music.queue.length, music.index, music.shuffle, music.loop, music.seq, onAction],
  );

  const seekTo = useCallback(
    (sec: number) => {
      const p = playerRef.current;
      const target = Math.max(0, sec);
      setCurrentTime(target);
      try {
        void p?.seekTo(target).catch(() => undefined);
      } catch {
        // 忽略
      }
      onAction('seek', { positionSec: target });
    },
    [onAction],
  );

  /** 重试：整条播放器重建（replace 同一条失效源往往不生效） */
  const retry = useCallback(() => {
    if (!trackUrl) return;
    try {
      playerRef.current?.remove();
    } catch {
      // 忽略
    }
    playerRef.current = null;
    trackIdRef.current = null;
    stallNotifiedRef.current = null;
    loadingSinceRef.current = Date.now();
    setStalled(false);
    setDuration(0);
    setCurrentTime(0);
    const p = ensurePlayer(trackUrl);
    const now = Date.now();
    intentRef.current = makePlayIntent('play', music.seq, now);
    setPlaying(true);
    try {
      p?.replace({ uri: trackUrl });
      claimAudioFocus(FOCUS_ID);
      p?.play();
    } catch {
      setStalled(true);
    }
    onAction('play', { positionSec: 0 });
  }, [trackUrl, ensurePlayer, music.seq, onAction]);

  const setLoop = useCallback((loop: boolean) => onAction('setting', { loop }), [onAction]);
  const setShuffle = useCallback((shuffle: boolean) => onAction('setting', { shuffle }), [onAction]);

  return useMemo(
    () => ({
      track,
      playing,
      currentTime,
      duration,
      buffering,
      stalled,
      volumePct,
      toggle,
      selectTrack,
      step,
      seekTo,
      retry,
      setLoop,
      setShuffle,
      sourceUrl: trackUrl,
    }),
    [
      track,
      playing,
      currentTime,
      duration,
      buffering,
      stalled,
      volumePct,
      toggle,
      selectTrack,
      step,
      seekTo,
      retry,
      setLoop,
      setShuffle,
      trackUrl,
    ],
  );
}
