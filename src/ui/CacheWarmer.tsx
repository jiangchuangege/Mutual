import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { getCmsApiList } from '../core/cmsConfig';
import type { FmSource } from '../core/jiaojiaoFm';
import { getLiveSources, suggestSourceName, type LiveSourceEntry } from '../core/liveConfig';
import { useApp } from '../store';
import { warmIfNeeded, type WarmInput } from './warmCache';

/**
 * 启动时的"缓存预热"（渲染 null，不打扰界面）。
 *
 * 用户要求：所有要用网络的东西都得有本地缓存，缓存永久有效，
 * 加了新源要自动把新的那份全部缓存下来。
 *   - 源列表没变 → 直接跳过（几乎 0 流量，文件已经在本地）
 *   - 源变了 / 第一次装 → 把缺的那份抓下来写进永久缓存
 */
export function CacheWarmer() {
  const { store } = useApp();
  const sharedApis = store.cmsApis;
  const sharedLive = store.liveSourceUrls;

  useEffect(() => {
    let cancelled = false;
    // 启动先让首页出画面，2.5 秒后再安静地在后台预热
    const timer = setTimeout(() => {
      void (async () => {
        try {
          /*
           * 种子缓存（assets/seed/cache-v1.json）现在由 cmsCache 直接读取，
           * 不需要再往 AsyncStorage 里搬一遍（那边有 6MB 上限，装不下整库）。
           */
          const input = await collect(sharedApis, sharedLive);
          if (cancelled || !input) return;
          await warmIfNeeded(input);
        } catch {
          /* 预热失败不影响使用，下次启动再补 */
        }
      })();
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // 只在启动时跑一次：加源时会由对应页面立刻预热（见 warmCache.ts）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

async function collect(sharedApis: string[], sharedLive: string[]): Promise<WarmInput | null> {
  let apis = sharedApis.filter(Boolean);
  if (apis.length === 0) apis = await getCmsApiList().catch(() => [] as string[]);

  const localLive = await getLiveSources().catch(() => [] as LiveSourceEntry[]);
  const liveEntries: LiveSourceEntry[] =
    sharedLive.length > 0
      ? sharedLive.map((url) => localLive.find((e) => e.url === url) ?? fallbackLiveEntry(url))
      : localLive;

  let fmSources: FmSource[] = [];
  const raw = await AsyncStorage.getItem('jfm_sources_v1').catch(() => null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as FmSource[];
      if (Array.isArray(parsed)) fmSources = parsed.filter((s) => s && s.url && s.enabled !== false);
    } catch {
      fmSources = [];
    }
  }

  if (apis.length === 0 && liveEntries.length === 0 && fmSources.length === 0) return null;
  return { apis, liveEntries, fmSources };
}

/** 直播源还没存过名字时补一个 */
export function fallbackLiveEntry(url: string): LiveSourceEntry {
  return { id: url, name: suggestSourceName(url), url, addedAt: Date.now() };
}
