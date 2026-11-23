/**
 * 电视直播源的持久化（本机）
 *
 * 和片源接口一样支持**多个**源：CCTV 走 A 源、卫视走 B 源，
 * 某个源挂了也不至于整个直播模块全空。
 *
 * 两条并存：
 *   - 空间共享的那一份（两个人共用，由一个人管理，见 store.liveSources / hub.setLiveSources）
 *   - 本机缓存（没连服务器 / 对方还没配时，至少能自己看）
 * 本文件只管本机缓存这一层。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const LIVE_SOURCES_KEY = 'live_sources_v1';

export interface LiveSourceEntry {
  /** 稳定 id（地址哈希），用于列表 key 和健康检测结果索引 */
  id: string;
  /** 给人看的名字；留空时按域名自动起名 */
  name: string;
  /** 播放列表地址（m3u / m3u8 / txt） */
  url: string;
  addedAt: number;
}

/** 短哈希，和 liveSource 里的算法保持一致的一族（这里只用于本地 id） */
function hash(input: string): string {
  let h = 5381;
  const s = String(input ?? '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** 从地址猜一个名字（不显示完整地址，只显示域名的主体） */
export function suggestSourceName(url: string): string {
  try {
    const host = String(url ?? '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0];
    const parts = host.split('.');
    if (parts.length >= 2) return parts[parts.length - 2];
    return host || '直播源';
  } catch {
    return '直播源';
  }
}

/** 归一整份配置（去空、去重、只留 http(s)） */
export function normalizeLiveSources(input: unknown): LiveSourceEntry[] {
  if (!Array.isArray(input)) return [];
  const out: LiveSourceEntry[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const url = String(raw.url ?? '').trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const bare = url.replace(/\/+$/, '');
    if (seen.has(bare)) continue;
    seen.add(bare);
    const name = String(raw.name ?? '').trim() || suggestSourceName(bare);
    out.push({
      id: String(raw.id ?? '') || hash(bare),
      name: name.slice(0, 24),
      url: bare,
      addedAt: Number(raw.addedAt ?? 0) || Date.now(),
    });
  }
  return out;
}

/** 从纯地址数组构造（共享配置里只存地址也够用） */
export function entriesFromUrls(urls: string[]): LiveSourceEntry[] {
  return normalizeLiveSources(
    (Array.isArray(urls) ? urls : []).map((u) => ({ url: u, name: suggestSourceName(u) })),
  );
}

export async function getLiveSources(): Promise<LiveSourceEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LIVE_SOURCES_KEY);
    if (!raw) return [];
    return normalizeLiveSources(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveLiveSources(list: LiveSourceEntry[]): Promise<boolean> {
  try {
    const clean = normalizeLiveSources(list);
    if (clean.length === 0) {
      await AsyncStorage.removeItem(LIVE_SOURCES_KEY);
      return true;
    }
    await AsyncStorage.setItem(LIVE_SOURCES_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export async function clearLiveSources(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LIVE_SOURCES_KEY);
  } catch {
    // 忽略
  }
}
