/**
 * 永久缓存 + 全量预热。
 *
 * 用户要求（原话）：缓存"一定是永久的"，"只要用就要用下载好的缓存文件"，
 * "添加新的源会先全部自动缓存这些新的"，"所有缓存都要保存在缓存文件内"。
 *
 * 这里的约定：
 *   1. 所有缓存都落 AsyncStorage，永久有效，不设 TTL、不自动清（见 cmsCache / sourceHealthCache）。
 *   2. 新加的源 -> 立刻把它**整份**抓下来写进缓存（片库接口 / 直播 m3u / FM 源）。
 *   3. 启动时跑一次预热：只补"还没有缓存"的源，已经有缓存的一律跳过 —— 所以第二次启动几乎 0 流量。
 *   4. 内置素材（四季特效精灵）直接打包在 APK 里，见 src/ui/SeasonParticles.tsx。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { groupCategories, type CinemaGroup } from '../core/cinemaClassify';
import {
  fetchCmsCategories,
  fetchCmsCategoryPage,
  fetchCmsLatest,
  fetchCmsPage,
  type CmsVod,
} from '../core/cms';
import { parseSource, type FmItem, type FmSource } from '../core/jiaojiaoFm';
import type { LiveSourceEntry } from '../core/liveConfig';
import { loadLiveCatalog, type LiveCatalog } from '../core/liveLoad';
import { readCmsCache, writeCmsCache } from './cmsCache';
import { getApiCategories, resolveIdsForApi } from './cmsCatCache';

/** 焦焦FM 条目的文件缓存键（AsyncStorage 那份是 6MB SQLite，装不下整库） */
const FM_ITEMS_CACHE_KEY = 'fm:items';

/** 单个接口最多缓存几页（再往后命中率极低，白占内存） */
const PAGES_PER_API = 3;
/** 单个接口缓存条目上限（AsyncStorage 单条有 2MB 上限，别写爆） */
const PER_API_CAP = 400;
/** 合并后（片库首页）条目上限 */
const CINEMA_CAP = 900;
/** FM 条目上限（永久保留，但也别无限长） */
export const FM_ITEMS_KEY = 'jfm_items_v1';

export type WarmStage = 'site' | 'live' | 'fm' | 'done' | 'idle';
export type WarmReporter = (stage: WarmStage, label: string, done: number, total: number) => void;

export type WarmInput = {
  apis: string[];
  liveEntries: LiveSourceEntry[];
  fmSources: FmSource[];
};

export type WarmResult = { cinema: number; channels: number; fm: number };

function uniqVods(lists: CmsVod[][], cap = CINEMA_CAP): CmsVod[] {
  const seen = new Set<string>();
  const out: CmsVod[] = [];
  for (const one of lists) {
    for (const v of one) {
      const key = `${v.fromApi ?? ''}|${v.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/**
 * 把一个（或一批）采集接口的整份片库缓存下来。
 * `force=false` 时，已经有缓存的接口直接跳过（永久缓存，不重复下载）。
 */
export async function warmCinema(apis: string[], force = false, report?: WarmReporter): Promise<number> {
  const list = apis.filter((a) => /^https?:\/\//i.test((a ?? '').trim()));
  if (list.length === 0) return 0;

  const perApi: CmsVod[][] = [];
  let done = 0;
  let fetched = 0;
  for (const api of list) {
    const cached = force ? null : await readCmsCache<{ list: CmsVod[] }>(`cmsApi:${api}`);
    if (cached?.value?.list?.length) {
      perApi.push(cached.value.list);
    } else {
      const pages: CmsVod[][] = [];
      for (let p = 1; p <= PAGES_PER_API; p += 1) {
        const res = await fetchCmsPage(api, p).catch(() => null);
        if (!res || !res.ok) break;
        if (res.page.list.length > 0) pages.push(res.page.list);
        if (p >= res.page.pageCount) break;
      }
      const merged = uniqVods(pages, PER_API_CAP);
      if (merged.length > 0) {
        perApi.push(merged);
        await writeCmsCache(`cmsApi:${api}`, { list: merged, pageCount: pages.length || 1 });
        fetched += 1;
      }
    }
    done += 1;
    report?.('site', `片源接口 ${done}/${list.length}`, done, list.length);
  }
  if (perApi.length === 0) return 0;

  const merged = uniqVods(perApi);
  const homeCached = force ? null : await readCmsCache<{ items?: CmsVod[] }>('lib:home');
  if (homeCached?.value?.items?.length && fetched === 0) {
    return homeCached.value.items.length;
  }
  const first = list[0]!;
  const cats = await fetchCmsCategories(first).catch(() => []);
  const latestRes = await fetchCmsLatest(first).catch(() => null);
  const baseRes = await fetchCmsPage(first, 1).catch(() => null);
  const latestList =
    latestRes && latestRes.ok && latestRes.page.list.length > 0
      ? latestRes.page.list.slice(0, 12)
      : merged.slice(0, 12);
  await writeCmsCache('lib:home', {
    items: merged,
    total: merged.length,
    pageCount: baseRes && baseRes.ok ? Math.max(1, baseRes.page.pageCount) : 1,
    groups: groupCategories(cats),
    latest: latestList,
  });
  // 分类页也一起预热（用户反馈"电影/动漫/剧集这些分类点进去特别慢"）
  await warmCinemaGroups(list, groupCategories(cats), report).catch(() => undefined);
  return merged.length;
}

/** 分类页预热：每档取前几个子分类 × 前几个接口，够铺满第一屏 + 翻两页 */
async function warmCinemaGroups(
  apis: string[],
  groups: CinemaGroup[],
  report?: WarmReporter,
): Promise<number> {
  const useApis = apis.slice(0, 3);
  const targets = groups.slice(0, 6);
  if (useApis.length === 0 || targets.length === 0) return 0;
  let done = 0;
  for (const g of targets) {
    const key = catCacheKey(g.key, null, null, null);
    try {
      const cached = await readCmsCache<{ items?: CmsVod[] }>(key);
      if (cached?.value?.items?.length) {
        done += 1;
        report?.('site', `分类缓存 ${done}/${targets.length}`, done, targets.length);
        continue;
      }
      /*
       * 每个接口的分类 id 是**各站自己编号**的：拿第一站的 id 去问其它站，
       * 命中率极低，回来的还经常是别的档（真人/短剧混进动漫），而且这份结果会被写进
       * `lib:cat:*` —— 片库点分类时第一眼读的就是它，于是"第一次点进去就是错乱的"。
       * 这里改成按**名字**在每个接口里各解析一次自己的 id。
       */
      const perApi = await Promise.all(
        useApis.map(async (api) => {
          const cats = await getApiCategories(api).catch(() => []);
          const ids = resolveIdsForApi(cats, g.key).slice(0, 4);
          if (ids.length === 0) return [] as Array<{ ok: true; page: { list: CmsVod[]; pageCount: number } } | null>;
          return Promise.all(
            ids.map((id) =>
              fetchCmsCategoryPage(api, id, 1)
                .then((r) => (r && r.ok ? r : null))
                .catch(() => null),
            ),
          );
        }),
      );
      const results = perApi.flat();
      const lists: CmsVod[][] = [];
      const counts: number[] = [];
      for (const r of results) {
        if (r && r.ok) {
          lists.push(r.page.list);
          counts.push(r.page.pageCount);
        }
      }
      const pageCount = Math.max(1, ...counts, 1);
      const mergedGroup = uniqVods(lists, 600);
      if (mergedGroup.length > 0) {
        await writeCmsCache(key, { items: mergedGroup, total: mergedGroup.length, pageCount });
      }
    } catch {
      /* 这一档没抓到，点进去时再拉 */
    }
    done += 1;
    report?.('site', `分类缓存 ${done}/${targets.length}`, done, targets.length);
  }

  // ---- 二级细分（恐怖片 / 科幻片 / 古装片 …）+ 今年：都缓存第一页 ----
  const thisYear = String(new Date().getFullYear());
  const detailed = targets.slice(0, 3);
  for (let gi = 0; gi < detailed.length; gi += 1) {
    const g = detailed[gi]!;
    const subs = (g.subs ?? []).slice(0, 8);
    // 只在第一档额外缓存"今年"，其余档只缓"全部年份"，避免一次性打太多请求
    const years: Array<string | null> = gi === 0 ? [null, thisYear] : [null];
    for (const sub of subs) {
      for (const y of years) {
        const key = catCacheKey(g.key, sub.id, y, null);
        try {
          const cached = await readCmsCache<{ items?: CmsVod[] }>(key);
          if (cached?.value?.items?.length) continue;
          /* 二级分类同样按名字在每个接口里对齐（sub.id 只是第一站的编号） */
          const perApiSub = await Promise.all(
            useApis.slice(0, 2).map(async (api) => {
              const cats = await getApiCategories(api).catch(() => []);
              const ids = resolveIdsForApi(cats, g.key, sub.name).slice(0, 2);
              if (ids.length === 0) return [];
              return Promise.all(
                ids.map((id) =>
                  fetchCmsCategoryPage(api, id, 1, 12_000, y)
                    .then((r) => (r && r.ok ? r : null))
                    .catch(() => null),
                ),
              );
            }),
          );
          const results = perApiSub.flat();
          const lists: CmsVod[][] = [];
          for (const r of results) if (r && r.ok) lists.push(r.page.list);
          const mergedSub = uniqVods(lists, 400);
          if (mergedSub.length > 0) {
            await writeCmsCache(key, { items: mergedSub, total: mergedSub.length, pageCount: 1 });
          }
        } catch {
          /* 点进去时再拉 */
        }
      }
      report?.('site', `细分缓存 ${g.label} · ${sub.name}`, 1, 1);
    }
  }
  return targets.length;
}

/** 细分类缓存键（必须和 cinema-library 里的一致，否则读不到） */
export function catCacheKey(
  groupKey: string | null,
  subId: string | null,
  year: string | null,
  month: string | null,
): string {
  return `lib:cat:${groupKey ?? 'all'}|${subId ?? ''}|${year ?? ''}|${month ?? ''}`;
}

function uniqById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

async function cachedLiveCatalog(): Promise<LiveCatalog | null> {
  const hit = await readCmsCache<{ catalog: LiveCatalog }>('live:catalog');
  return hit?.value?.catalog ?? null;
}

/** 把一个（或一批）直播源整份台单缓存下来；已有台单的源不重复拉 */
export async function warmLive(entries: LiveSourceEntry[], force = false, report?: WarmReporter): Promise<number> {
  const list = entries.filter((e) => e && /^https?:\/\//i.test(e.url ?? ''));
  if (list.length === 0) return 0;

  const old = await cachedLiveCatalog();
  const hasChannels = (url: string) => {
    if (force || !old) return false;
    const hit = old.sources?.find((s) => s.id === url || s.url === url);
    return Boolean(hit && hit.channels.length > 0);
  };
  const todo = list.filter((e) => !hasChannels(e.url));
  if (todo.length === 0) {
    report?.('live', `直播台单 ${old?.channels.length ?? 0} 个`, 1, 1);
    return old?.channels.length ?? 0;
  }
  const result = await loadLiveCatalog(todo).catch(() => null);
  if (!result) return old?.channels.length ?? 0;

  const combined: LiveCatalog = old
    ? {
        ...result,
        channels: uniqById([...result.channels, ...old.channels]),
        sources: [...result.sources, ...old.sources.filter((s) => !result.sources.some((r) => r.id === s.id))],
        okCount: result.okCount + old.okCount,
      }
    : result;
  await writeCmsCache('live:catalog', { catalog: combined });
  report?.('live', `直播台单 ${combined.channels.length} 个`, 1, 1);
  return combined.channels.length;
}

function safeItems(raw: string | null): FmItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FmItem[];
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.key && i.audio) : [];
  } catch {
    return [];
  }
}

/** 把 FM 收听源整份缓存下来（新加的源也走这里）；已经有条目的源不重复拉 */
export async function warmFm(sources: FmSource[], force = false, report?: WarmReporter): Promise<number> {
  const list = sources.filter((s) => s && s.url && s.enabled !== false);
  if (list.length === 0) return 0;

  /*
   * 读取顺序：文件缓存（fm:items）→ 老的 AsyncStorage 键（只兼容老版本存下来的）。
   * 写只写文件缓存：AsyncStorage 在 Android 是 6MB 的 SQLite 库，
   * 一千多条 FM 条目一次就能把它写满，然后把账号会话之类的关键小数据一起写坏。
   */
  const fileBox = await readCmsCache<{ items?: FmItem[] }>(FM_ITEMS_CACHE_KEY).catch(() => null);
  const fromFile = Array.isArray(fileBox?.value?.items) ? (fileBox!.value.items as FmItem[]) : [];
  const old =
    fromFile.length > 0
      ? fromFile.filter((i) => i && i.key && i.audio)
      : safeItems(await AsyncStorage.getItem(FM_ITEMS_KEY).catch(() => null));
  const covered = new Set(old.map((i) => i.sourceId));
  const todo = force ? list : list.filter((s) => !covered.has(s.id));
  if (todo.length === 0) {
    report?.('fm', `声音 ${old.length} 条`, 1, 1);
    return old.length;
  }

  const collected: FmItem[] = [];
  let done = 0;
  await Promise.all(
    todo.map(async (s) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      try {
        const res = await fetch(s.url, { headers: { accept: '*/*' }, signal: ctrl.signal });
        if (res.ok) {
          const body = await res.text();
          collected.push(...parseSource(body, s));
        }
      } catch {
        /* 这次抓不到，下次启动再补 */
      } finally {
        clearTimeout(timer);
        done += 1;
        report?.('fm', `收听源 ${done}/${todo.length}`, done, todo.length);
      }
    }),
  );

  const seen = new Set<string>();
  const combined = [...collected, ...old]
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)))
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, 1200);
  await writeCmsCache(FM_ITEMS_CACHE_KEY, {
    items: combined,
    at: Date.now(),
    sourceKey: list.map((s) => s.url).join('|'),
  }).catch(() => undefined);
  // 老的 AsyncStorage 副本留着只会把 6MB 的库继续撑满，直接删掉
  void AsyncStorage.removeItem(FM_ITEMS_KEY).catch(() => undefined);
  return combined.length;
}

/** 全量预热：片库 -> 直播 -> FM，按顺序来，别把网络打满 */
export async function warmEverything(input: WarmInput, force = false, report?: WarmReporter): Promise<WarmResult> {
  const cinema = await warmCinema(input.apis, force, report).catch(() => 0);
  const channels = await warmLive(input.liveEntries, force, report).catch(() => 0);
  const fm = await warmFm(input.fmSources, force, report).catch(() => 0);
  report?.('done', `已缓存 ${cinema} 部片 · ${channels} 个台 · ${fm} 条声音`, 1, 1);
  return { cinema, channels, fm };
}

const SIG_KEY = 'mutual_warm_sig_v1';

/** 源列表指纹：源变了才需要重新预热 */
export function warmSignature(input: WarmInput): string {
  const part = (arr: string[]) => arr.filter(Boolean).slice().sort().join('|');
  return [part(input.apis), part(input.liveEntries.map((e) => e.url)), part(input.fmSources.map((s) => s.url))].join(
    '#',
  );
}

/** 启动时调用：源没变就直接返回（几乎 0 流量） */
export async function warmIfNeeded(input: WarmInput, report?: WarmReporter): Promise<WarmResult | null> {
  const sig = warmSignature(input);
  const prev = await AsyncStorage.getItem(SIG_KEY).catch(() => null);
  if (prev === sig) {
    report?.('idle', '缓存已是最新', 1, 1);
    return null;
  }
  const result = await warmEverything(input, false, report);
  /*
   * 只有**真的补到了东西**才记指纹。
   * 以前无论如何都写 sig：装完 App 在地铁/电梯里首启（或启动 2.5 秒时网还没连上）时，
   * warmEverything 每个 stage 自己 catch 返回 0、不会抛异常 → 指纹照样写入 →
   * 之后每次启动都认为"缓存已是最新"，片库/直播/FM 的缓存再也补不回来。
   */
  const filled = result.cinema + result.channels + result.fm;
  if (filled > 0) await AsyncStorage.setItem(SIG_KEY, sig).catch(() => undefined);
  return result;
}

/* =========================================================================
 * 深度缓存（新增源 / 手动触发）—— 按页分片写，绝不写"一个越来越大的大 key"
 *
 * 写放大问题（真实风险，已被指出来）：
 *   如果把整个源的列表写进一个 key，条目从 600 涨到 6 万的过程中，每 flush 一次就要
 *   把整份重新序列化 + 覆盖写一遍（几十 MB × 上千次），既慢又伤闪存。
 *
 * 所以这里的分片规则是：
 *   · cmsApiDeep:p:<api>:<page>  每一页一个文件（约 20 部 / 几 KB），**写完就不再改**
 *   · cmsApiDeep:i:<api>         只存"已抓到哪些页码"和总数（纯数字数组，极小）
 *   · cmsApi:<api>               收尾时写一次（≤6000 部），片库立刻能用 —— 只写一次，不反复覆盖
 *   详情页的单条缓存仍是 vod:<源>|<id> 一条一个文件。
 *   配 cmsCache 的 .tmp + move 原子写：中断只会丢掉"正在写的那一页"，已有分片永远完整。
 * ========================================================================= */

/** 已抓到哪些页（纯数字，很小） */
function deepIndexKey(api: string): string {
  return `cmsApiDeep:i:${api}`;
}

/** 某一页的分片 */
function deepPageKey(api: string, page: number): string {
  return `cmsApiDeep:p:${api}:${page}`;
}

export interface DeepWarmOptions {
  /** 最多抓到第几页（默认 0 = 抓到这个源的最后一页） */
  maxPages?: number;
  onProgress?: (info: { api: string; page: number; pageCount: number; got: number }) => void;
  /** 每页间隔毫秒（越大越不容易被限流） */
  paceMs?: number;
}

interface DeepIndex {
  pages: number[];
  pageCount: number;
  count: number;
}

async function readDeepIndex(api: string): Promise<DeepIndex> {
  const hit = await readCmsCache<DeepIndex>(deepIndexKey(api));
  const v = hit?.value;
  return {
    pages: Array.isArray(v?.pages) ? v!.pages : [],
    pageCount: Number(v?.pageCount ?? 0) || 0,
    count: Number(v?.count ?? 0) || 0,
  };
}

/**
 * 把一个源的页面逐页拉到缓存里（可续跑）。
 * 返回本次新缓存的页数。每页单独一个文件，写完不改。
 */
export async function warmCinemaDeep(api: string, opts: DeepWarmOptions = {}): Promise<number> {
  const maxPages = Math.max(0, Math.floor(opts.maxPages ?? 0));
  let pace = Math.max(0, Math.floor(opts.paceMs ?? 120));
  const index = await readDeepIndex(api);
  const done = new Set(index.pages);
  const firstPage = index.pages.length > 0 ? Math.max(...index.pages) + 1 : 1;
  let page = firstPage;
  let pageCount = index.pageCount || 0;
  let count = index.count;
  let added = 0;
  let failStreak = 0;

  while (true) {
    if (page > pageCount && pageCount > 0) break;
    if (maxPages > 0 && page >= maxPages + 1) break;
    if (page > 4000) break; // 安全上限：单源 4000 页（约 8 万部）足够

    const res = await fetchCmsPage(api, page).catch(() => null);
    if (!res || !res.ok) {
      failStreak += 1;
      pace = Math.min(1200, pace + 200);
      if (failStreak >= 3) break;
      await new Promise((r) => setTimeout(r, pace * 2));
      continue;
    }
    failStreak = 0;
    if (res.page.pageCount > 0) pageCount = res.page.pageCount;

    if (res.page.list.length > 0 && !done.has(page)) {
      /* 一页一个分片：小、只写一次、原子替换 */
      await writeCmsCache(deepPageKey(api, page), { items: res.page.list });
      done.add(page);
      count += res.page.list.length;
      added += 1;
      await writeCmsCache(deepIndexKey(api), {
        pages: [...done].sort((a, b) => a - b),
        pageCount,
        count,
      });
    }

    opts.onProgress?.({ api, page, pageCount, got: count });
    page += 1;
    if (pace > 0) await new Promise((r) => setTimeout(r, pace));
  }

  /* 收尾：写一次"片库能直接用的那份"（≤6000 部，只写一次，不随页数反复覆盖） */
  if (added > 0) {
    const head = await loadDeepList(api, 6000);
    if (head.length > 0) await writeCmsCache(`cmsApi:${api}`, { list: head });
  }
  return added;
}

/**
 * 把某个源已缓存的分片按页顺序拼起来（超过 cap 就停）。
 * 只在"要用这个源的内容"时调用，启动流程不读它。
 */
export async function loadDeepList(api: string, cap = 6000): Promise<CmsVod[]> {
  const index = await readDeepIndex(api);
  const pages = [...index.pages].sort((a, b) => a - b);
  const out: CmsVod[] = [];
  for (const page of pages) {
    if (out.length >= cap) break;
    const hit = await readCmsCache<{ items: CmsVod[] }>(deepPageKey(api, page));
    const items = hit?.value?.items;
    if (!Array.isArray(items)) continue;
    out.push(...items);
  }
  return out.slice(0, cap);
}

/** 这个源已经缓存了多少部（读 index，不读分片本体） */
export async function deepCachedCount(api: string): Promise<number> {
  const index = await readDeepIndex(api);
  return index.count;
}
