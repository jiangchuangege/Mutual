/**
 * 片库首页（`lib:home`）的重建 —— 把"还活着的接口"的本机缓存重新合并一遍。
 *
 * 为什么需要单独一个模块：删接口这件事有**两个**入口，
 *   1) 本机操作：片源管理页点删除（cinema-sources.tsx）
 *   2) 对方操作：服务器把新的接口列表投影下来（store.syncCmsSources）
 * 两边都必须让 `lib:home` 立刻不含被删站的片子，
 * 否则对方手机上照样能看到已经删掉的接口的片单（真实问题：删了不同步）。
 */
import { readCmsCache, writeCmsCache, dropCmsCache } from './cmsCache';

/** 每个接口第 1 页的缓存键（warmCinema / 片库首屏都写这个键） */
export function cmsApiCacheKey(api: string): string {
  return `cmsApi:${api}`;
}

/**
 * 用剩下的接口缓存重建片库首页。
 *
 * - 能重建（至少有一个接口有缓存）→ 就地写回 `lib:home`，进片库仍然秒开；
 * - 一个都重建不出来 → 把 `lib:home` 删掉，让片库下次自己联网合并，
 *   **绝不能留着旧的那份**（旧的那份里全是被删站的片）。
 */
export async function rebuildLibHome(remainingApis: string[]): Promise<boolean> {
  try {
    const lists: unknown[][] = [];
    for (const api of remainingApis) {
      const hit = await readCmsCache<{ list?: unknown[] }>(cmsApiCacheKey(api));
      if (hit?.value?.list?.length) lists.push(hit.value.list);
    }
    const flat = lists.flat().slice(0, 6000);
    if (flat.length === 0) {
      await dropCmsCache('lib:home');
      return false;
    }
    // 分类表 / 最近上线轮播沿用上一份（它们只是"分类骨架"和"新片轮播"，与哪个站无关）
    const home = await readCmsCache<{ groups?: unknown; latest?: unknown }>('lib:home');
    await writeCmsCache('lib:home', {
      items: flat,
      total: flat.length,
      pageCount: 1,
      groups: home?.value?.groups ?? null,
      latest: home?.value?.latest ?? [],
    });
    return true;
  } catch {
    return false;
  }
}
