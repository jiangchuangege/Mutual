/**
 * 片源测速 / 排序。
 *
 * 背景：同一个片子在不同采集站上的 CDN 速度能差 10 倍（实测同一部片：
 * 一个源只有 300~480kbps，另一个 2500~4900kbps），"随便点一个源"经常挑到最慢的。
 *
 * 这里做两件事：
 *   1. probeStream：真的下一个**分片**来估速度（只拉 m3u8 文本的话，
 *      几百字节的播放列表会被算成 1~9kbps，完全看不出能不能播）；
 *   2. rankStreams：快的排前面，测速失败的排最后。
 *
 * 流量很小：HLS 只取第一个分片（最多读 1.5MB），直链用 Range 取前 256KB。
 * 超时短（默认 6 秒），而且只在用户手动点「测速」时才跑。
 */

export type StreamProbe = {
  url: string;
  ok: boolean;
  /** 这次探测用了多久（毫秒） */
  ms: number;
  /** 估算速度（kbps）；0 表示测不出来 */
  kbps: number;
  error?: string;
};

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
/** 直链：取前 256KB 估速度 */
const SAMPLE_BYTES = 256 * 1024;
/** HLS 分片：最多读 1.5MB（一个分片通常 200~800KB） */
const SEG_MAX_BYTES = 1.5 * 1024 * 1024;

function isHls(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url);
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal, headers: { 'User-Agent': UA, Accept: '*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * 从播放列表里挑下一跳：
 *   - master（含 EXT-X-STREAM-INF）→ 选**码率最低**的 variant 地址（最容易播得动）
 *   - 媒体播放列表 → 第一个非注释行（就是分片）
 */
function pickNext(playlist: string, baseUrl: string): string | null {
  const lines = playlist
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const variants: Array<{ url: string; bandwidth: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes('EXT-X-STREAM-INF')) continue;
    const bw = Number(/BANDWIDTH=(\d+)/.exec(lines[i])?.[1] ?? '0');
    const next = lines[i + 1];
    if (next && !next.startsWith('#')) {
      variants.push({ url: new URL(next, baseUrl).toString(), bandwidth: bw });
    }
  }
  if (variants.length > 0) {
    variants.sort((a, b) => a.bandwidth - b.bandwidth);
    return variants[0]?.url ?? null;
  }

  const seg = lines.find((l) => !l.startsWith('#'));
  return seg ? new URL(seg, baseUrl).toString() : null;
}

/**
 * 测一个地址：返回它大概能跑多快。
 * 失败（403/超时/DNS）也会返回 ok=false，调用方据此把它排到最后。
 */
export async function probeStream(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<StreamProbe> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const hls = isHls(url);
    let target = url;

    if (hls) {
      // master → (variant) → 分片，最多两跳
      for (let hop = 0; hop < 2; hop += 1) {
        const text = await fetchText(target, ctrl.signal);
        const next = pickNext(text, target);
        if (!next) throw new Error('播放列表里没有分片地址');
        target = next;
        if (!isHls(next)) break;
      }
    }

    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        ...(hls ? {} : { Range: `bytes=0-${SAMPLE_BYTES - 1}` }),
      },
    });
    if (!res.ok && res.status !== 206) {
      return { url, ok: false, ms: Date.now() - started, kbps: 0, error: `HTTP ${res.status}` };
    }
    const buf = await res.arrayBuffer();
    const bytes = Math.min(buf.byteLength, SEG_MAX_BYTES);
    const ms = Math.max(1, Date.now() - started);
    if (bytes < 4096) {
      return { url, ok: false, ms, kbps: 0, error: '分片太小，测不出速度' };
    }
    return { url, ok: true, ms, kbps: Math.round((bytes * 8) / ms) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url,
      ok: false,
      ms: Date.now() - started,
      kbps: 0,
      error: /abort/i.test(msg) ? '超时' : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 排序：测速成功且快的排前面；**没测过的**排在失败的之前（还有机会），失败的排最后。
 * 纯函数，方便单测。
 */
export function rankStreams(urls: string[], probes: StreamProbe[]): string[] {
  const byUrl = new Map(probes.map((p) => [p.url, p]));
  const score = (u: string): number => {
    const p = byUrl.get(u);
    if (!p) return -1; // 还没测过
    if (!p.ok) return -2; // 测过、明确失败
    return p.kbps;
  };
  return [...urls].sort((a, b) => score(b) - score(a));
}
