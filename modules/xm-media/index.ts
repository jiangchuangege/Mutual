/**
 * 外部播放器（喜马拉雅这类）的播放状态读取 / 控制。
 *
 * 为什么需要原生模块：Android 只允许持有「通知使用权」的 App 通过
 * `MediaSessionManager.getActiveSessions()` 看到别的 App 的播放状态。
 *
 * 我们**不搬音频**：声音仍然在对方的 App 里、用你自己的会员账号播放，
 * 这里只读「放到第几秒」并下发 播放/暂停/跳转，用来把两台设备对齐。
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface ExternalSession {
  /** 包名，例如 com.ximalaya.ting.android */
  package: string;
  /** App 名字（喜马拉雅 / 播客 …） */
  appLabel: string;
  title: string;
  artist: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  canSeek: boolean;
  updatedAt: number;
}

type NativeXmMedia = {
  hasAccess(): boolean;
  openAccessSettings(): boolean;
  sessions(): ExternalSession[];
  control(packageName: string, action: string, positionMs?: number): boolean;
};

const native = requireOptionalNativeModule<NativeXmMedia>('XmMedia');

export function isAvailable(): boolean {
  return native != null;
}

export function hasAccess(): boolean {
  try {
    return native?.hasAccess() ?? false;
  } catch {
    return false;
  }
}

export function openAccessSettings(): void {
  try {
    native?.openAccessSettings();
  } catch {
    /* 打不开就算了，让用户自己去设置里找 */
  }
}

/** 当前正在放媒体的 App（一般只有一个）；没有就返回空数组 */
export function sessions(): ExternalSession[] {
  try {
    const list = native?.sessions() ?? [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** 找出我们要控制的那一个：优先指定包名，否则取第一个正在播的 */
export function pickSession(preferPackage?: string | null): ExternalSession | null {
  const all = sessions();
  if (all.length === 0) return null;
  if (preferPackage) {
    const hit = all.find((s) => s.package === preferPackage);
    if (hit) return hit;
  }
  return all.find((s) => s.playing) ?? all[0];
}

export function control(packageName: string, action: 'play' | 'pause' | 'toggle' | 'seek' | 'next' | 'prev', positionMs?: number): boolean {
  try {
    return native?.control(packageName, action, positionMs) ?? false;
  } catch {
    return false;
  }
}

/** 常见有声书 App 的包名，用来在界面上显示「这是喜马拉雅」 */
export const KNOWN_PLAYERS: Record<string, string> = {
  'com.ximalaya.ting.android': '喜马拉雅',
  'com.ximalaya.ting.lite': '喜马拉雅极速版',
  'com.lazyaudio.ximalaya': '喜马拉雅车载',
  'com.tencent.qqmusic': 'QQ音乐',
  'com.netease.cloudmusic': '网易云音乐',
  'com.kugou.android': '酷狗音乐',
  'com.xiaomi.player': '小米音乐',
  'com.android.chrome': 'Chrome',
};
