/**
 * 源健康检测（片源接口 / 直播源 / 单个频道）
 *
 * 用户的原话：「哪个电影接口如果有读取不到视频的坏的，让他可以显示出哪个接口是坏」。
 * 所以这里不做玄学判断，只做**能复现的检测**：
 *   - 片源接口：能不能连上、返回的是不是 JSON、能不能解析出影片、多少部、耗时多少；
 *   - 直播源：能不能连上、内容是不是播放列表、认出多少个台；
 *   - 单个频道：这个台的地址到底还活着没有（很多源里的台是几年前的死链）。
 * 每一档都给出**人话原因**，界面上直接显示，不用用户猜。
 */

import { fetchCmsPage } from './cms';
import { parseLivePlaylist } from './liveSource';

export type HealthLevel = 'idle' | 'checking' | 'ok' | 'slow' | 'dead';

export interface HealthReport {
  level: HealthLevel;
  /** 耗时（毫秒）；没测到是 0 */
  latencyMs: number;
  /** 给人看的一句话结论 */
  detail: string;
  /** 认出来的条目数（影片 / 频道），没有就是 undefined */
  count?: number;
  checkedAt: number;
}

export const IDLE_REPORT: HealthReport = {
  level: 'idle',
  latencyMs: 0,
  detail: '还没检测',
  checkedAt: 0,
};

/** 超过这个耗时就算"慢"（能用但不流畅） */
export const SLOW_MS = 3500;

export function levelLabel(level: HealthLevel): string {
  switch (level) {
    case 'ok':
      return '正常';
    case 'slow':
      return '很慢';
    case 'dead':
      return '已失效';
    case 'checking':
      return '检测中';
    default:
      return '未检测';
  }
}

function report(level: HealthLevel, latencyMs: number, detail: string, count?: number): HealthReport {
  return { level, latencyMs, detail, count, checkedAt: Date.now() };
}

function isAbort(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes('abort');
}

/** 带超时的纯文本拉取（直播源用） */
async function fetchText(url: string, timeoutMs: number): Promise<
  { ok: true; text: string; status: number } | { ok: false; error: string }
> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: '*/*',
        // 有些直播源服务器会拒绝空 UA
        'user-agent': 'okhttp/4.9.0',
      },
      signal: controller?.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    return { ok: true, text, status: res.status };
  } catch (err) {
    return { ok: false, error: isAbort(err) ? '超时（服务器没响应）' : err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 检测一个苹果CMS 片源接口。
 *
 * 判定：
 *   - 连不上 / 超时 / 不是 JSON / 返回 0 部 → dead（并说明是哪一种）
 *   - 能出片但很慢（>= SLOW_MS）→ slow
 *   - 其余 → ok
 */
export async function checkCmsSource(apiUrl: string, timeoutMs = 12_000): Promise<HealthReport> {
  const started = Date.now();
  const url = String(apiUrl ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return report('dead', 0, '地址不是 http(s) 开头，填错了');
  }
  try {
    const res = await fetchCmsPage(url, 1, timeoutMs);
    const latency = Date.now() - started;
    if (!res.ok) {
      const detail =
        res.kind === 'timeout'
          ? '请求超时（接口没响应，通常已经挂了）'
          : res.kind === 'parse'
            ? res.error
            : res.kind === 'empty'
              ? '能连上，但一部片都没返回（接口空了或改了地址）'
              : res.error;
      return report('dead', latency, detail);
    }
    const count = res.page.list.length;
    if (count === 0) {
      return report('dead', latency, '能连上，但没解析出影片', 0);
    }
    const level: HealthLevel = latency >= SLOW_MS ? 'slow' : 'ok';
    return report(level, latency, `能读到 ${count} 部（第 1 页）`, count);
  } catch (err) {
    const latency = Date.now() - started;
    return report('dead', latency, isAbort(err) ? '请求超时' : `请求异常：${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 检测一个直播源（播放列表地址）。
 *
 * 判定：
 *   - 拉不到文本 → dead
 *   - 拉到但认不出任何台 → dead（附上"被丢掉的坏行数"，方便判断是格式问题还是源空了）
 *   - 认得台 → ok / slow
 */
export async function checkLiveSource(sourceUrl: string, timeoutMs = 15_000): Promise<HealthReport> {
  const started = Date.now();
  const url = String(sourceUrl ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return report('dead', 0, '地址不是 http(s) 开头，填错了');
  }
  const res = await fetchText(url, timeoutMs);
  const latency = Date.now() - started;
  if (!res.ok) {
    return report('dead', latency, `拉不到直播源：${res.error}`);
  }
  const body = res.text.replace(/^\uFEFF/, '');
  if (body.trim().length === 0) {
    return report('dead', latency, '直播源是空的（服务器返回 0 字节）');
  }
  const playlist = parseLivePlaylist(body);
  if (playlist.channels.length === 0) {
    const hint =
      playlist.kind === 'unknown'
        ? '内容既不像 m3u 也不像 txt（可能是网页/需要登录）'
        : `格式认出来了（${playlist.kind}），但一条有效频道都没有`;
    return report('dead', latency, hint, 0);
  }
  const level: HealthLevel = latency >= SLOW_MS ? 'slow' : 'ok';
  const tail = playlist.skipped > 0 ? ` · 跳过 ${playlist.skipped} 行无效内容` : '';
  return report(level, latency, `${playlist.channels.length} 个频道 · ${playlist.groups.length} 个分组${tail}`, playlist.channels.length);
}

/**
 * 检测单个频道的播放地址是否还活着。
 *
 * 只做"能不能拿到播放列表/响应"这一层：
 *   - m3u8：拉回来必须包含 #EXTM3U（这是最靠谱的存活信号）
 *   - 其他（mp4/flv）：能拿到 2xx/3xx 就算活，立刻断开不下载内容
 */
export async function checkLiveChannel(channelUrl: string, timeoutMs = 7000): Promise<HealthReport> {
  const started = Date.now();
  const url = String(channelUrl ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return report('dead', 0, '地址无效');
  }
  const lower = url.toLowerCase();
  const isHls = lower.includes('.m3u8') || lower.includes('m3u8');

  if (isHls) {
    const res = await fetchText(url, timeoutMs);
    const latency = Date.now() - started;
    if (!res.ok) return report('dead', latency, `拉不到播放列表：${res.error}`);
    if (!/#EXTM3U/i.test(res.text)) {
      return report('dead', latency, '返回内容不是 m3u8 播放列表（多半已经失效）');
    }
    const level: HealthLevel = latency >= SLOW_MS ? 'slow' : 'ok';
    return report(level, latency, '播放列表正常');
  }

  // 非 HLS：只握手，不下载
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { method: 'GET', headers: { accept: '*/*' }, signal: controller?.signal });
    const latency = Date.now() - started;
    try {
      await res.body?.cancel();
    } catch {
      // 忽略：有些实现不支持 cancel
    }
    if (!res.ok) return report('dead', latency, `HTTP ${res.status}`);
    const level: HealthLevel = latency >= SLOW_MS ? 'slow' : 'ok';
    return report(level, latency, '地址可访问');
  } catch (err) {
    const latency = Date.now() - started;
    return report('dead', latency, isAbort(err) ? '超时' : `请求失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 批量检测（限制并发，避免把手机和对方服务器一起打爆）。
 *
 * onEach 每测完一个就回调一次，界面可以"边测边亮灯"，不用等全部测完。
 */
export async function checkEach<T>(
  items: T[],
  keyOf: (item: T) => string,
  check: (item: T) => Promise<HealthReport>,
  onEach?: (key: string, value: HealthReport) => void,
  concurrency = 4,
): Promise<Record<string, HealthReport>> {
  const out: Record<string, HealthReport> = {};
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      const key = keyOf(item);
      let value: HealthReport;
      try {
        value = await check(item);
      } catch (err) {
        value = report('dead', 0, `检测异常：${err instanceof Error ? err.message : String(err)}`);
      }
      out[key] = value;
      onEach?.(key, value);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
  await Promise.all(workers);
  return out;
}
