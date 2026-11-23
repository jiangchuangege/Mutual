/**
 * 通知偏好的本地持久化 + "该不该弹"的判断（纯逻辑部分可单测）。
 *
 * 真机上出过的问题：「通知与锁屏」页里的开关全是 useState，
 * 退出页面再进来就变回默认值——用户开了"紧急联系人例外"，回来发现又关着。
 * 所以这些偏好必须落盘。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIFY_PREFS_KEY = 'twospace::notify-prefs';

export type LockMode = 'detail' | 'neutral' | 'none';

export type NotifyCategory = 'life' | 'care' | 'emotion' | 'cinema' | 'system';

export interface NotifyPrefs {
  /** 夜间免打扰 22:00–08:00 */
  dnd: boolean;
  /** 冷静卡 / 安全报备可以穿透免打扰 */
  urgentException: boolean;
  /** 锁屏显示到什么程度 */
  lockMode: LockMode;
  categories: Record<NotifyCategory, boolean>;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  dnd: true,
  urgentException: false,
  lockMode: 'neutral',
  categories: { life: true, care: true, emotion: true, cinema: true, system: true },
};

export const DND_START_HOUR = 22;
export const DND_END_HOUR = 8;

/** 服务端通知的 kind → 分类（对不上的一律算 system） */
export function categoryOfKind(kind: string): NotifyCategory {
  const k = (kind ?? '').toLowerCase();
  if (k.startsWith('activity:') || k === 'card' || k === 'mood' || k === 'nudge' || k === 'cheer') {
    return 'emotion';
  }
  if (k === 'todo' || k === 'ledger' || k === 'chore') return 'life';
  if (k === 'care' || k === 'careaction' || k === 'period' || k === 'predict') return 'care';
  if (k === 'cinema' || k === 'room' || k === 'watchplan') return 'cinema';
  return 'system';
}

/** 这些 kind 允许穿透夜间免打扰（冷静卡 / 安全报备 / 语音邀请） */
export function isUrgentKind(kind: string): boolean {
  const k = (kind ?? '').toLowerCase();
  return k === 'calm' || k === 'safety' || k === 'arrived' || k === 'voice' || k === 'card:calm';
}

/** 当前小时是否在免打扰区间（22:00–08:00，跨零点） */
export function inDndWindow(date: Date, startHour = DND_START_HOUR, endHour = DND_END_HOUR): boolean {
  const h = date.getHours();
  if (startHour === endHour) return false;
  if (startHour < endHour) return h >= startHour && h < endHour;
  // 跨零点：22–24 或 0–8
  return h >= startHour || h < endHour;
}

/**
 * 这条通知现在该不该弹系统通知。
 *
 * @returns false 表示按用户设置应该静默
 */
export function shouldPresent(
  prefs: NotifyPrefs,
  kind: string,
  now: Date = new Date(),
): { present: boolean; reason?: 'category-off' | 'dnd' | 'silent-mode' } {
  if (prefs.lockMode === 'none') return { present: false, reason: 'silent-mode' };
  const cat = categoryOfKind(kind);
  if (!prefs.categories[cat]) return { present: false, reason: 'category-off' };
  if (prefs.dnd && inDndWindow(now)) {
    if (!(prefs.urgentException && isUrgentKind(kind))) {
      return { present: false, reason: 'dnd' };
    }
  }
  return { present: true };
}

/**
 * 锁屏上显示什么：
 *  - detail  → 原样（服务端已经脱敏过）
 *  - neutral → 只给"TA 那边有动静"，不显示具体内容
 *  - none    → 不弹（shouldPresent 已经拦住）
 */
export function lockText(prefs: NotifyPrefs, text: string): string {
  if (prefs.lockMode === 'neutral') return 'Mutual · TA 那边有新的动静';
  return text;
}

export async function loadNotifyPrefs(): Promise<NotifyPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFY_PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFY_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotifyPrefs>;
    return {
      dnd: typeof parsed.dnd === 'boolean' ? parsed.dnd : DEFAULT_NOTIFY_PREFS.dnd,
      urgentException:
        typeof parsed.urgentException === 'boolean'
          ? parsed.urgentException
          : DEFAULT_NOTIFY_PREFS.urgentException,
      lockMode:
        parsed.lockMode === 'detail' || parsed.lockMode === 'neutral' || parsed.lockMode === 'none'
          ? parsed.lockMode
          : DEFAULT_NOTIFY_PREFS.lockMode,
      categories: {
        ...DEFAULT_NOTIFY_PREFS.categories,
        ...(parsed.categories ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

export async function saveNotifyPrefs(prefs: NotifyPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFY_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 存不上就下次再说（不影响当前会话的使用）
  }
}
