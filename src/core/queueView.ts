import type { WatchQueueItem } from './types';

/**
 * 把「一起看队列」里的平铺条目按片子折叠成合集。
 *
 * 用户反馈：一部电视剧 30 集，加进队列后是 30 行摊在那里，根本没法看。
 * 现在同一个片子（同一个 `vodId`，没有 vodId 就按片名）合成一个合集，
 * 合集里再按集数排好，界面上一层只显示一个合集，点进去才是所有集。
 */
export interface QueueGroup {
  /** 稳定 key：有 vodId 用 vodId，否则用片名 */
  key: string;
  title: string;
  /** 这一组下面的所有条目，已按集数/加入顺序排好 */
  items: WatchQueueItem[];
  /** 是不是"合集"（多于一集） */
  series: boolean;
}

/** 集数的展示名：优先用采集接口给的集名，没有就按序号补一个 */
export function episodeLabel(item: WatchQueueItem): string {
  if (item.episodeName) return item.episodeName;
  if (item.episodeIndex > 0) return `第 ${item.episodeIndex + 1} 集`;
  return '';
}

export function groupWatchQueue(queue: WatchQueueItem[]): QueueGroup[] {
  const groups = new Map<string, QueueGroup>();
  for (const item of queue) {
    if (!item) continue;
    const key = item.vodId ? `vod:${item.vodId}` : `title:${item.title}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      existing.series = existing.items.length > 1;
      continue;
    }
    groups.set(key, { key, title: item.title, items: [item], series: false });
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.episodeIndex - b.episodeIndex || a.createdAt - b.createdAt);
    group.series = group.items.length > 1;
  }
  // 合集之间按"最早加入"排序：先加进来的排前面，稳定不跳动
  return [...groups.values()].sort(
    (a, b) => (a.items[0]?.createdAt ?? 0) - (b.items[0]?.createdAt ?? 0),
  );
}

/** 当前正在播的那一条落在哪个合集里（用来给合集打「正在播」标记） */
export function activeGroupKey(queue: WatchQueueItem[], playingUrl: string | null): string | null {
  if (!playingUrl) return null;
  const hit = queue.find((q) => q.url === playingUrl);
  if (!hit) return null;
  return hit.vodId ? `vod:${hit.vodId}` : `title:${hit.title}`;
}
