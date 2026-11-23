/**
 * 锁最低清晰度：很多采集站的 m3u8 是 master（多档码率，最高能到 9Mbps），
 * 但手机这条网只跑得动 400~1200kbps。播放器自适应会先冲高码率，
 * 结果就是"播两秒卡一下"。这里直接把 master 解析成**最低码率那一档**，
 * 让播放器只请求它跑得动的那一档 —— 这是"不卡"的关键一步。
 */
const variantCache = new Map<string, string>();

function isHlsUrl(u: string): boolean {
  return /\.m3u8(\?|$)/i.test(u);
}

/**
 * 返回"应该真正喂给播放器"的地址：
 *   - master 播放列表 → 最低码率 variant 的地址
 *   - 已经是媒体播放列表 / 普通直链 → 原样返回
 * 任何异常都原样返回（绝不因为优化而播不了）。
 */
export async function pickLowestVariant(url: string, timeoutMs = 6000): Promise<string> {
  if (!isHlsUrl(url)) return url;
  const cached = variantCache.get(url);
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
        Accept: '*/*',
      },
    });
    if (!res.ok) return url;
    const text = await res.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const variants: Array<{ uri: string; bandwidth: number }> = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes('EXT-X-STREAM-INF')) continue;
      const bw = Number(/BANDWIDTH=(\d+)/.exec(lines[i])?.[1] ?? '0');
      const next = lines[i + 1];
      if (next && !next.startsWith('#')) {
        try {
          variants.push({ uri: new URL(next, url).toString(), bandwidth: bw });
        } catch {
          /* 跳过坏地址 */
        }
      }
    }
    if (variants.length === 0) return url;
    variants.sort((a, b) => a.bandwidth - b.bandwidth);
    const picked = variants[0]!.uri;
    variantCache.set(url, picked);
    return picked;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}
