/**
 * 外部播放器（喜马拉雅这类 App）的读取 + 同步。
 *
 * 合规边界（重要）：
 *   · 音频**不搬家**：声音永远在对方的 App 里、用你自己的会员账号播放；
 *   · 我们只读「在放什么、放到第几秒」，再下发 播放/暂停/跳转；
 *   · 两台设备之间同步的是**进度**（走现有「一起听」的 fmProgress 通道）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  control,
  hasAccess,
  isAvailable,
  KNOWN_PLAYERS,
  pickSession,
  sessions,
  type ExternalSession,
} from '../../modules/xm-media';

export type { ExternalSession };

/** 外部播放器在「一起听」里用的曲目键：同一个 App + 同一个标题 = 同一集 */
export function extKeyOf(session: ExternalSession): string {
  const title = String(session.title || session.artist || '').trim();
  return `ext:${session.package}:${title}`;
}

/** 显示用的标题：很多有声书 App 只给 artist（书名）+ title（章节） */
export function extTitleOf(session: ExternalSession | null): string {
  if (!session) return '';
  const parts = [String(session.title ?? '').trim(), String(session.artist ?? '').trim()].filter(Boolean);
  return parts.join(' · ') || '（没有标题）';
}

export function playerName(session: ExternalSession | null): string {
  if (!session) return '外部播放器';
  return KNOWN_PLAYERS[session.package] || session.appLabel || session.package;
}

export function extAvailable(): boolean {
  return isAvailable();
}

export function extHasAccess(): boolean {
  return hasAccess();
}

export function extControl(
  session: ExternalSession,
  action: 'play' | 'pause' | 'toggle' | 'seek' | 'next' | 'prev',
  positionSec?: number,
): boolean {
  return control(session.package, action, positionSec == null ? undefined : Math.round(positionSec * 1000));
}

/**
 * 轮询外部播放器状态。
 *
 * 为什么轮询而不是事件：MediaSession 的回调要挂在原生侧做广播，改动面大；
 * 播放进度本来就需要"每秒刷新一次"，轮询 900ms 的成本可以忽略，
 * 而且退出页面就停，不会在后台空转。
 */
export function useExternalSession(enabled: boolean, preferPackage?: string | null) {
  const [session, setSession] = useState<ExternalSession | null>(null);
  const [available] = useState(() => isAvailable());
  const [granted, setGranted] = useState(() => hasAccess());
  const alive = useRef(true);

  const refresh = useCallback(() => {
    if (!alive.current) return;
    const ok = hasAccess();
    setGranted(ok);
    if (!ok) {
      setSession(null);
      return;
    }
    setSession(pickSession(preferPackage));
  }, [preferPackage]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return () => {
      alive.current = false;
    };
    refresh();
    const timer = setInterval(refresh, 900);
    return () => {
      clearInterval(timer);
      alive.current = false;
    };
  }, [enabled, refresh]);

  return { available, granted, session, refresh, sessions };
}

/** 秒 → 00:00 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}
