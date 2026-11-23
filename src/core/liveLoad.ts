/**
 * 直播源加载（拉取 + 解析 + 多源合并）
 *
 * 和 sourceHealth 的分工：
 *   - sourceHealth 只回答"这个源是不是坏的"（给设置页亮灯用）；
 *   - 这里负责"把台单真的拉下来给播放页用"，带缓存和超时。
 */

import { dedupeChannels, mergePlaylists, parseLivePlaylist, type LiveChannel, type LivePlaylist } from './liveSource';
import type { LiveSourceEntry } from './liveConfig';

export interface LoadedLiveSource {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  channels: LiveChannel[];
  groups: string[];
  /** 解析器认出的格式 */
  kind: LivePlaylist['kind'];
  /** 拉取耗时 */
  latencyMs: number;
}

/** 拉一个直播源。失败不抛异常，返回 ok=false + 人话原因 */
export async function loadLiveSource(entry: LiveSourceEntry, timeoutMs = 20_000): Promise<LoadedLiveSource> {
  const started = Date.now();
  const base: LoadedLiveSource = {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    ok: false,
    channels: [],
    groups: [],
    kind: 'unknown',
    latencyMs: 0,
  };
  if (!/^https?:\/\//i.test(entry.url)) {
    return { ...base, error: '地址不是 http(s) 开头' };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(entry.url, {
      method: 'GET',
      headers: {
        accept: '*/*',
        // 很多直播源服务器会对空 UA 直接 403
        'user-agent': 'okhttp/4.9.0',
      },
      signal: controller?.signal,
    });
    if (!res.ok) {
      return { ...base, latencyMs: Date.now() - started, error: `HTTP ${res.status}` };
    }
    const text = (await res.text()).replace(/^\uFEFF/, '');
    const playlist = parseLivePlaylist(text);
    const latencyMs = Date.now() - started;
    if (playlist.channels.length === 0) {
      return {
        ...base,
        latencyMs,
        kind: playlist.kind,
        error:
          playlist.kind === 'unknown'
            ? '内容不像 m3u / txt 直播源'
            : `格式是 ${playlist.kind}，但没认出任何频道`,
      };
    }
    // 同一个源里重复的台先去掉，再给上层合并
    const channels = dedupeChannels(playlist.channels);
    return {
      id: entry.id,
      name: entry.name,
      url: entry.url,
      ok: true,
      channels,
      groups: playlist.groups,
      kind: playlist.kind,
      latencyMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      latencyMs: Date.now() - started,
      error: msg.toLowerCase().includes('abort') ? '超时（源服务器没响应）' : msg,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface LiveCatalog {
  /** 全部频道（多源合并、同名台合并备用地址） */
  channels: LiveChannel[];
  /** 每个源各自的加载结果（坏源直接在这里看得见） */
  sources: LoadedLiveSource[];
  /** 分组顺序 */
  groups: string[];
  /** 多少个源成功 */
  okCount: number;
  /** 多少个源失败 */
  deadCount: number;
}

/** 并行加载多个源并合并成一个台单 */
export async function loadLiveCatalog(entries: LiveSourceEntry[], timeoutMs = 20_000): Promise<LiveCatalog> {
  if (entries.length === 0) {
    return { channels: [], sources: [], groups: [], okCount: 0, deadCount: 0 };
  }
  const sources = await Promise.all(entries.map((e) => loadLiveSource(e, timeoutMs)));
  const okList = sources.filter((s) => s.ok);
  const merged = mergePlaylists(
    okList.map((s) => ({ channels: s.channels, groups: s.groups, kind: s.kind, skipped: 0 })),
  );
  const channels = dedupeChannels(merged);
  const groups: string[] = [];
  for (const c of channels) {
    if (!groups.includes(c.group)) groups.push(c.group);
  }
  return {
    channels,
    sources,
    groups,
    okCount: okList.length,
    deadCount: sources.length - okList.length,
  };
}
