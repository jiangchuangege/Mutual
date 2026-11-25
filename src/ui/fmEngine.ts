/**
 * 焦焦FM 的**全局播放引擎**（单例）。
 *
 * 为什么要它（用户要求）：
 *   "听 FM 的时候，希望在每个页面都能听、后台也能听，不要一退出 FM 模块就断了。"
 *
 * 以前的写法是播放器长在 `app/jiaojiao-fm.tsx` 里：离开这个页面 → 组件卸载 →
 * cleanup 里把原生播放器 pause + remove 掉，于是**一退出 FM 声音就没了**。
 *
 * 现在把播放器搬到全局（`FmEngineHost` 挂在 AppFrame 上，和「一起听」的音乐引擎同级）：
 *   · 路由怎么切都不影响它，全 App 只有一个 FM 播放器；
 *   · `setAudioModeAsync({ shouldPlayInBackground: true })` 打开后台播放；
 *   · 任何页面都能通过 `fmEngine.play/toggle/seek` 控制它，并订阅状态；
 *   · 语音/一起听/试听要出声时，靠 audioFocus 登记表把它让路（不会两段声音叠着响）。
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import type { FmItem } from '../core/jiaojiaoFm';
import { claimAudioFocus, registerAudioOwner, releaseAudioFocus, unregisterAudioOwner } from '../lib/audioFocus';

const OWNER = 'jiaojiao-fm';

export type FmEngineState = {
  item: FmItem | null;
  playing: boolean;
  position: number;
  duration: number;
  rate: number;
  buffering: boolean;
  stalled: boolean;
  /** 睡眠定时剩余秒数（0 = 没开） */
  sleepLeft: number;
};

let state: FmEngineState = {
  item: null,
  playing: false,
  position: 0,
  duration: 0,
  rate: 1,
  buffering: false,
  stalled: false,
  sleepLeft: 0,
};

let player: AudioPlayer | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let sleepTicker: ReturnType<typeof setInterval> | null = null;
let attached = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* 单个订阅出错不影响别人 */
    }
  }
}

function set(patch: Partial<FmEngineState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getFmState(): FmEngineState {
  return state;
}

export function subscribeFmEngine(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 彻底停掉当前播放器：先 pause、音量归零，再 remove（漏一步就会两路声音叠着响） */
function killPlayer(): void {
  const p = player;
  player = null;
  if (!p) return;
  try {
    p.pause();
  } catch {
    /* 忽略 */
  }
  try {
    p.volume = 0;
  } catch {
    /* 忽略 */
  }
  try {
    (p as unknown as { remove?: () => void }).remove?.();
  } catch {
    /* 忽略 */
  }
}

function startTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    const p = player;
    if (!p) return;
    try {
      const pos = Number(p.currentTime) || 0;
      const dur = Number(p.duration) || 0;
      const playingNow = Boolean(p.playing);
      const buffering = Boolean(p.isBuffering);
      if (
        Math.abs(pos - state.position) > 0.05 ||
        dur !== state.duration ||
        playingNow !== state.playing ||
        buffering !== state.buffering
      ) {
        set({ position: pos, duration: dur, playing: playingNow, buffering });
      }
    } catch {
      /* 播放器还没准备好 */
    }
  }, 500);
}

function stopTicker(): void {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function clearSleep(): void {
  if (sleepTicker) {
    clearInterval(sleepTicker);
    sleepTicker = null;
  }
  if (state.sleepLeft !== 0) set({ sleepLeft: 0 });
}

/** 首次接触时：设置后台播放 + 注册 audioFocus 让路回调 */
function ensureAttached(): void {
  if (attached) return;
  attached = true;
  void setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
  } as Parameters<typeof setAudioModeAsync>[0]).catch(() => undefined);
  registerAudioOwner(OWNER, () => {
    try {
      player?.pause();
    } catch {
      /* 忽略 */
    }
    set({ playing: false });
    releaseAudioFocus(OWNER);
  });
}

/** 记得"上次听到哪"，下次进 FM 能接着放 */
function remember(item: FmItem, positionSec: number): void {
  try {
    const g = globalThis as unknown as {
      __fmLast?: { audio: string; positionSec: number };
    };
    g.__fmLast = { audio: item.audio, positionSec };
  } catch {
    /* 忽略 */
  }
}

/** 播放某一集（同一集正在放时就是续播 / 定位） */
export function playFm(item: FmItem, opts: { positionSec?: number; rate?: number } = {}): void {
  /* CATALOG_ONLY：只有官方页面、没有音频地址的条目，引擎一律不碰（界面改成打开官方页面） */
  if (!item || item.externalOnly || !item.audio) return;
  ensureAttached();
  const startAt = Math.max(0, opts.positionSec ?? 0);
  const rate = opts.rate ?? state.rate;

  /* 同一集：直接定位继续放，不重建播放器（避免一卡一顿） */
  if (player && state.item && state.item.key === item.key) {
    try {
      if (startAt > 0.5) void player.seekTo(startAt);
      try {
        player.playbackRate = rate;
      } catch {
        /* 忽略 */
      }
      claimAudioFocus(OWNER);
      player.play();
      set({ playing: true, position: startAt, stalled: false });
      return;
    } catch {
      /* 走下面的重建流程 */
    }
  }

  killPlayer();
  claimAudioFocus(OWNER);
  try {
    const p = createAudioPlayer({ uri: item.audio });
    player = p;
    /* 倍速单独 try：有的机型 source 还没就绪时设 playbackRate 会抛，
       不能因为它把整次播放放弃掉（以前就是这样一点声音都没有） */
    try {
      p.playbackRate = rate;
    } catch {
      /* 稍后再设 */
    }
    if (startAt > 0.5) {
      try {
        void p.seekTo(startAt);
      } catch {
        /* 忽略 */
      }
    }
    p.play();
    /* source 就绪后再补一次倍速 */
    if (rate !== 1) {
      setTimeout(() => {
        try {
          if (player) player.playbackRate = rate;
        } catch {
          /* 忽略 */
        }
      }, 600);
    }
    set({
      item,
      playing: true,
      position: startAt,
      duration: 0,
      rate,
      stalled: false,
      buffering: true,
    });
    remember(item, startAt);
    startTicker();
  } catch {
    set({ stalled: true, playing: false });
  }
}

export function toggleFm(): void {
  const p = player;
  if (!p) return;
  ensureAttached();
  try {
    if (state.playing) {
      p.pause();
      set({ playing: false });
      releaseAudioFocus(OWNER);
      if (state.item) remember(state.item, Number(p.currentTime) || 0);
    } else {
      claimAudioFocus(OWNER);
      p.play();
      set({ playing: true });
    }
  } catch {
    /* 忽略 */
  }
}

export function pauseFm(): void {
  const p = player;
  if (!p) return;
  try {
    p.pause();
  } catch {
    /* 忽略 */
  }
  set({ playing: false });
  releaseAudioFocus(OWNER);
}

export function seekFm(sec: number): void {
  const p = player;
  if (!p) return;
  const target = Math.max(0, sec);
  try {
    void p.seekTo(target);
    set({ position: target });
  } catch {
    /* 忽略 */
  }
}

export function setFmRate(rate: number): void {
  const r = Math.max(0.5, Math.min(2, rate));
  set({ rate: r });
  try {
    if (player) player.playbackRate = r;
  } catch {
    /* 有的机型不支持倍速 */
  }
}

/** 睡眠定时（分钟，0 = 关） */
export function setFmSleep(min: number): void {
  clearSleep();
  if (min <= 0) return;
  let left = Math.round(min * 60);
  set({ sleepLeft: left });
  sleepTicker = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      pauseFm();
      clearSleep();
      return;
    }
    set({ sleepLeft: left });
  }, 1000);
}

/** 彻底停止并释放（登出/清空时用） */
export function stopFm(): void {
  killPlayer();
  stopTicker();
  clearSleep();
  unregisterAudioOwner(OWNER);
  releaseAudioFocus(OWNER);
  attached = false;
  set({
    item: null,
    playing: false,
    position: 0,
    duration: 0,
    buffering: false,
    stalled: false,
  });
}

export function fmCurrentSec(): number {
  try {
    return Math.max(0, Number(player?.currentTime) || state.position);
  } catch {
    return state.position;
  }
}
