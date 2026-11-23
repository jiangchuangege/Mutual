/**
 * 台单按"当前生效的直播源"过滤。
 *
 * 为什么单独拿出来：删直播源有两个入口 ——
 *   1) 本机：直播源页点删除；
 *   2) 对方：服务器把新的源列表投影下来。
 * 两个入口都必须让**已经删掉的源**（连同它的红色报错块）立刻从电视直播页消失，
 * 否则用户看到的就是「删了还在、还红着」（真实问题）。
 *
 * 缓存里读出来的台单、内存里正在用的台单，都走这一个函数。
 */
import type { LiveCatalog, LoadedLiveSource } from '../core/liveLoad';

type LooseChannel = { id?: string };

/**
 * 只保留 `aliveUrls` 里还存在的源的频道。
 * `aliveUrls` 为空（还没配源）时原样返回，交给页面自己的空状态处理。
 */
export function filterLiveCatalog(catalog: LiveCatalog | null, aliveUrls: string[]): LiveCatalog | null {
  if (!catalog) return null;
  const alive = new Set(aliveUrls.filter(Boolean));
  if (alive.size === 0) return catalog;

  const sources = (catalog.sources ?? []) as LoadedLiveSource[];
  /*
   * 源 id 有两种来源：本机缓存的 entry.id 是**哈希**（liveConfig.entriesFromUrls），
   * 而没命中缓存时 live.tsx 用的是**地址**。以前只比 s.id === 地址，
   * 命中哈希那一路就一条都匹配不上 → 台单被整个过滤成空（0 个台、筛选条 0 个源）。
   * 所以 url / id 两边都要认。
   */
  const aliveSource = (s: LoadedLiveSource): boolean =>
    alive.has(s.id) || alive.has(s.url) || alive.has(String((s as { id?: string }).id ?? ''));
  const keptSources = sources.filter(aliveSource);
  if (keptSources.length === sources.length) return catalog;

  // 合并后的频道列表里没法直接看出"这条来自哪个源"，
  // 但每个频道都有稳定 id，而 id 一定出现在"产生它的那个源"的频道列表里。
  const keptIds = new Set<string>();
  for (const s of keptSources) {
    for (const c of (s.channels ?? []) as LooseChannel[]) {
      if (c?.id) keptIds.add(c.id);
    }
  }

  const channels = (catalog.channels ?? []).filter((c) => keptIds.has((c as LooseChannel).id ?? ''));
  const groups: string[] = [];
  for (const c of channels) {
    const g = (c as { group?: string }).group ?? '未分组';
    if (!groups.includes(g)) groups.push(g);
  }

  const okCount = keptSources.filter((s) => s.ok).length;
  return {
    channels,
    sources: keptSources,
    groups,
    okCount,
    deadCount: keptSources.length - okCount,
  };
}
