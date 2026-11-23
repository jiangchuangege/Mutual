/**
 * 分类的**按接口**映射与原始页缓存。
 *
 * 之前分类错乱的根因（不是过滤不严，是根本没对上）：
 * 每个采集站的分类 id 是**自己编号**的 —— A 站的「8」是爱情片，B 站的「8」可能是国产剧。
 * 以前是把 A 站解析出来的 id 直接拿去问其他站，于是「短剧/电视剧」就跑进了「电影/爱情片」。
 *
 * 现在改成：**按名字对齐**。每个接口的分类表单独缓存（永久），
 * 选某个二级分类时，用「分类名」去每个接口自己的分类表里找它自己的 id，找不到就不问这个接口。
 *
 * 另外把每个 (接口, 分类) 的第一页原始数据也永久缓存起来（cmsCat:*）。
 * 这样同一个分类再点一次 = 0 次网络请求，直接在本地合并 + 过滤。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { canonicalBucket, matchesSubCategory, type BucketKey } from '../core/cinemaClassify';
import { fetchCmsCategories, fetchCmsCategoryPage, type CmsCategory, type CmsVod } from '../core/cms';

const MAP_PREFIX = 'mutual_catmap_v1:';
const PAGE_PREFIX = 'mutual_catpage_v1:';
/** 单个分类页最多留多少条（20 一页就够铺两屏，省空间） */
const PAGE_CAP = 60;
/** 每个接口的分类表缓存的版本：分类改名/加类时 bump 一下即可 */
const PAGE_MAX_KEYS = 400;

const mapMemory = new Map<string, CmsCategory[]>();

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存不下就下次再拉 */
  }
}

/** 拿某个接口的分类表（内存 -> 本地缓存 -> 网络），永久有效 */
export async function getApiCategories(api: string): Promise<CmsCategory[]> {
  const hit = mapMemory.get(api);
  if (hit) return hit;
  const cached = await readJson<CmsCategory[]>(MAP_PREFIX + api);
  if (cached && cached.length > 0) {
    mapMemory.set(api, cached);
    return cached;
  }
  const fresh = await fetchCmsCategories(api).catch(() => [] as CmsCategory[]);
  if (fresh.length > 0) {
    mapMemory.set(api, fresh);
    await writeJson(MAP_PREFIX + api, fresh);
  }
  return fresh;
}

/**
 * 这个接口自己有哪些分类 id 对应"我选的这一档/这一类"。
 * - 传 subName：按名字精确/包含匹配（找不到就返回空 → 这个接口这次不参与）
 * - 只传 groupKey：按名字归并到同一档的全部 id
 */
export function resolveIdsForApi(
  categories: CmsCategory[],
  groupKey: BucketKey,
  subName?: string | null,
): string[] {
  if (categories.length === 0) return [];
  if (subName) {
    const core = subName.replace(/[（(].*?[)）]/g, '').trim();
    const exact = categories.filter((c) => c.name === core);
    if (exact.length > 0) return exact.map((c) => c.id);
    /*
     * 同义词归并：各站叫法不一样（日韩动漫 / 日本动漫 / 中国动漫 / 国产动漫…）。
     * 以前这里只做字面包含，于是 subocj、hhzyapi 这种把这一档叫「日本动漫」的站
     * 整站被跳过 —— 用户点「日韩动漫」只看到 5 千多，而单站 alone 就有 4.5 千。
     */
    const loose = categories.filter((c) => matchesSubCategory(c.name, core));
    if (loose.length > 0) return loose.map((c) => c.id);
    const short = core.replace(/(片|剧|类|动漫|电影|电视剧)$/, '');
    const byShort = categories.filter(
      (c) => short.length >= 2 && (c.name.includes(short) || short.includes(c.name)),
    );
    return byShort.map((c) => c.id);
  }
  return categories.filter((c) => canonicalBucket(c.name) === groupKey).map((c) => c.id);
}

/**
 * 分类页缓存（第一页）。
 *
 * 以前这里只存了一个 `CmsVod[]`：没有页数、没有时间戳 ——
 *   · 片库拿不到真实的 pageCount，分类页永远显示「已经到底了」，第 2 页是死代码；
 *   · 缓存永不过期，于是这一档永远停留在"第一次点进去"那批片，新片永远上不来。
 * 现在存 { list, pageCount, total, at }，超过 6 小时视为过期并重拉第一页。
 */
export const CATEGORY_PAGE_TTL_MS = 6 * 60 * 60 * 1000;

interface CategoryPageCache {
  list: CmsVod[];
  pageCount: number;
  total: number;
  at: number;
}

function pageCacheKey(api: string, catId: string, year?: string | null): string {
  return `${PAGE_PREFIX}${api}|${catId}|${year ?? ''}`;
}

async function readPageCache(
  api: string,
  catId: string,
  year?: string | null,
): Promise<CategoryPageCache | null> {
  const raw = await readJson<CategoryPageCache | CmsVod[]>(pageCacheKey(api, catId, year));
  if (!raw) return null;
  // 兼容老格式（裸数组）：当作"没有页数信息、且已过期"
  if (Array.isArray(raw)) {
    return raw.length > 0 ? { list: raw, pageCount: 1, total: raw.length, at: 0 } : null;
  }
  const box = raw as CategoryPageCache;
  if (!Array.isArray(box.list) || box.list.length === 0) return null;
  return {
    list: box.list,
    pageCount: Math.max(1, Number(box.pageCount) || 1),
    total: Math.max(box.list.length, Number(box.total) || 0),
    at: Number(box.at) || 0,
  };
}

/** 第一页 + 真实页数；过期或没有则返回 null */
export async function getCachedCategoryPageInfo(
  api: string,
  catId: string,
  year?: string | null,
): Promise<{ list: CmsVod[]; pageCount: number; total: number } | null> {
  const box = await readPageCache(api, catId, year);
  if (!box) return null;
  if (Date.now() - box.at > CATEGORY_PAGE_TTL_MS) return null;
  return { list: box.list, pageCount: box.pageCount, total: box.total };
}

/** 只要列表（老调用方用） */
export async function getCachedCategoryPage(
  api: string,
  catId: string,
  year?: string | null,
): Promise<CmsVod[] | null> {
  const box = await readPageCache(api, catId, year);
  return box ? box.list : null;
}

/** 第一页 + 真实页数；缓存新鲜直接用，过期就重拉 */
export async function fetchCachedCategoryPageInfo(
  api: string,
  catId: string,
  year?: string | null,
): Promise<{ list: CmsVod[]; pageCount: number; total: number }> {
  const cached = await getCachedCategoryPageInfo(api, catId, year);
  if (cached) return cached;
  const res = await fetchCmsCategoryPage(api, catId, 1, 12_000, year).catch(() => null);
  if (!res || !res.ok) return { list: [], pageCount: 1, total: 0 };
  const list = res.page.list.slice(0, PAGE_CAP);
  const box: CategoryPageCache = {
    list,
    pageCount: Math.max(1, Number(res.page.pageCount) || 1),
    total: Math.max(list.length, Number(res.page.total) || 0),
    at: Date.now(),
  };
  if (list.length > 0) await writeJson(pageCacheKey(api, catId, year), box);
  return { list, pageCount: box.pageCount, total: box.total };
}

/** 兼容旧调用：只要列表 */
export async function fetchCachedCategoryPage(
  api: string,
  catId: string,
  year?: string | null,
): Promise<CmsVod[]> {
  const info = await fetchCachedCategoryPageInfo(api, catId, year);
  return info.list;
}

/** 只保留最近用到的 N 个分类页，避免无限长（其余永久保留） */
export async function pruneCategoryPages(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PAGE_PREFIX));
    if (mine.length <= PAGE_MAX_KEYS) return;
    await AsyncStorage.multiRemove(mine.slice(0, mine.length - PAGE_MAX_KEYS));
  } catch {
    /* 忽略 */
  }
}
