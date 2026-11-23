/**
 * 接口/片源检测结果的本地缓存。
 *
 * 用户要求：**不要一进页面就自动把所有接口测一遍**（太频繁、也费流量），
 * 改成「点进来直接显示上次的检测结果」，想重新测再点「检测全部」。
 * 所以这里只负责把结果和时间戳存下来 / 读回来。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'mutual_health_cache_v1:';

export type CachedHealth<T> = { reports: T; at: number };

export async function loadHealthCache<T>(key: string): Promise<CachedHealth<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedHealth<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveHealthCache<T>(key: string, reports: T, at = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify({ reports, at }));
  } catch {
    /* 存不下就算了，下次再测 */
  }
}

/** "3 分钟前 / 刚刚 / 2 小时前" —— 给"上次检测：…"那行用 */
export function healthAgeText(at: number, now = Date.now()): string {
  if (!at) return '还没检测过';
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 60) return '刚刚';
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.round(sec / 3600)} 小时前`;
  return `${Math.round(sec / 86400)} 天前`;
}
