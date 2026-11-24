/**
 * 苹果CMS（MacCMS）JSON 接口适配层
 *
 * 只做三件事：拉列表、解析播放地址、判断能不能直接播。
 * 纯函数部分（解析）全部可测试；网络请求带超时与错误分类。
 *
 * 合规说明：片源由用户自行配置的第三方接口提供，App 不内置、不托管、不存储任何视频内容，
 * 也不上传/转发视频流；播放发生在本机播放器，与"同步控制"分离。
 */

export interface CmsVod {
  id: string;
  name: string;
  pic: string;
  remarks: string;
  year: string;
  area: string;
  typeName: string;
  typeId?: string;
  /** 上架/更新时间（vod_time，接口给的是 "2026-11-05 22:53:30"），轮播按它排最新 */
  time?: string;
  actor: string;
  director: string;
  content: string;
  /** 原始播放串 vod_play_url */
  playUrlRaw: string;
  /** 线路名串 vod_play_from（"线路1$$$线路2"） */
  playFromRaw: string;
  /** 这个条目来自哪个接口（多接口时用来区分/换源） */
  fromApi?: string;
  /** 接口的主机名（界面上给人看的"源1/源2"，不显示完整地址） */
  fromLabel?: string;
}

export interface CmsPage {
  list: CmsVod[];
  page: number;
  pageCount: number;
  total: number;
}

export interface CmsEpisode {
  name: string;
  url: string;
}

export type PlayableVerdict =
  | { playable: true; url: string; format: 'm3u8' | 'mp4' | 'other' }
  | { playable: false; reason: string };

/** 默认测试接口（可在设置页改成你自己的） */
export const DEFAULT_CMS_API = 'https://json.heimuertv.api.php/provide/vod';

const DIRECT_HOST_HINTS = ['.m3u8', '.mp4', '.flv', '.ts'];

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/** 把接口返回的 list 解析成强类型数组（字段缺失也不炸） */
export function parseVodList(raw: unknown): CmsVod[] {
  const list = (raw as { list?: unknown })?.list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const v = (item ?? {}) as Record<string, unknown>;
    return {
      id: asString(v.vod_id),
      name: asString(v.vod_name) || '未命名',
      pic: asString(v.vod_pic),
      remarks: asString(v.vod_remarks),
      year: asString(v.vod_year),
      area: asString(v.vod_area),
      typeName: asString(v.type_name),
      typeId: asString(v.type_id),
      time: asString(v.vod_time),
      actor: asString(v.vod_actor),
      director: asString(v.vod_director),
      content: asString(v.vod_content).replace(/<[^>]+>/g, '').trim(),
      playUrlRaw: asString(v.vod_play_url),
      playFromRaw: asString(v.vod_play_from),
    };
  });
}

/**
 * 一个接口里有好几条**线路**（MacCMS 的 vod_play_from / vod_play_url 用 $$$ 分隔）。
 * 这是"同一部片的多个播放源"最常见的形式：某个线路卡顿就换一条。
 */
export interface CmsSource {
  /** 线路名，如 "量子资源"、"线路2"；没有名字时给 "源1" */
  name: string;
  episodes: CmsEpisode[];
}

export function parseSources(playFromRaw: string, playUrlRaw: string): CmsSource[] {
  const froms = (playFromRaw || '')
    .split('$$$')
    .map((s) => s.trim())
    .filter(Boolean);
  const groups = (playUrlRaw || '')
    .split('$$$')
    .map((s) => s.trim())
    .filter(Boolean);
  if (groups.length === 0) return [];
  return groups.map((group, i) => {
    const episodes = parsePlayUrl(group);
    const label = froms[i] && !/^(youku|qq|iqiyi|letv|sohu|mgtv|bilibili)$/i.test(froms[i])
      ? froms[i]
      : `源${i + 1}`;
    return { name: label, episodes };
  });
}

/** 接口主机名 → 界面上给人看的短标签（绝不显示完整地址） */
export function apiLabel(apiUrl: string): string {
  try {
    const host = String(apiUrl ?? '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0];
    if (!host) return '源';
    const parts = host.split('.');
    return parts.length > 1 ? parts[parts.length - 2] : host;
  } catch {
    return '源';
  }
}

export function parseCmsPage(raw: unknown, page: number): CmsPage {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const list = parseVodList(obj);
  const pageCount = Number.parseInt(asString(obj.pagecount) || '1', 10) || 1;
  const total = Number.parseInt(asString(obj.total) || String(list.length), 10) || list.length;
  const current = Number.parseInt(asString(obj.page) || String(page), 10) || page;
  return { list, page: current, pageCount, total };
}

/**
 * 解析 vod_play_url：
 *   "第1集$http://a/1.m3u8#第2集$http://a/2.m3u8"
 * 也兼容 "第1集$https://...#第2集$https://..." 与没有集名的情况。
 */
export function parsePlayUrl(raw: string): CmsEpisode[] {
  if (!raw) return [];
  return raw
    .split('#')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const idx = chunk.indexOf('$');
      if (idx < 0) {
        // 只有链接没有集名
        const only = chunk.trim();
        const match = /https?:\/\/\S+/.exec(only);
        return { name: '正片', url: match ? match[0] : only };
      }
      const name = chunk.slice(0, idx).trim() || '正片';
      const url = chunk.slice(idx + 1).trim();
      return { name, url };
    })
    .filter((e) => e.url.length > 0);
}

/** 能不能直接播：必须 http(s) 直链，且不是网页/解析页 */
export function classifyPlayable(url: string): PlayableVerdict {
  const u = (url ?? '').trim();
  if (!u) return { playable: false, reason: '播放地址为空' };
  if (!/^https?:\/\//i.test(u)) {
    return { playable: false, reason: '该源需要解析，暂不支持（地址不是 http/https 直链）' };
  }
  const lower = u.toLowerCase();
  if (lower.includes('.html') || lower.includes('/share/') || lower.includes('vip.php')) {
    return { playable: false, reason: '该源需要解析，暂不支持（这是网页地址，不是媒体直链）' };
  }
  if (lower.includes('.m3u8')) return { playable: true, url: u, format: 'm3u8' };
  if (lower.includes('.mp4')) return { playable: true, url: u, format: 'mp4' };
  if (DIRECT_HOST_HINTS.some((h) => lower.includes(h))) return { playable: true, url: u, format: 'other' };
  // 没有扩展名但确实是 http 直链，交给播放器尝试
  return { playable: true, url: u, format: 'other' };
}

/** 从整条播放串里挑第一个可播的直链 */
export function pickFirstPlayable(raw: string): { episode: CmsEpisode | null; verdict: PlayableVerdict } {
  const episodes = parsePlayUrl(raw);
  if (episodes.length === 0) {
    return { episode: null, verdict: { playable: false, reason: '该片没有可用播放地址' } };
  }
  for (const ep of episodes) {
    const verdict = classifyPlayable(ep.url);
    if (verdict.playable) return { episode: ep, verdict };
  }
  return { episode: episodes[0], verdict: classifyPlayable(episodes[0].url) };
}

export function buildListUrl(apiUrl: string, page: number): string {
  const base = apiUrl.trim().replace(/\/+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}ac=detail&pg=${Math.max(1, Math.round(page))}`;
}

/**
 * "最近更新"：MacCMS 的 `h=<小时数>` 表示最近 N 小时内有变动的片子，默认按时间倒序。
 * 首页轮播要用**最新上映/更新的片子**，就靠这个接口（而不是把第一页洗牌）。
 */
export function buildLatestUrl(apiUrl: string, hours = 72): string {
  const base = apiUrl.trim().replace(/\/+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}ac=detail&h=${Math.max(1, Math.round(hours))}&pg=1`;
}

/** 分类列表：MacCMS 的 `ac=detail&t=<type_id>` */
export function buildCategoryUrl(apiUrl: string, typeId: string, page = 1, year?: string | null): string {
  const base = apiUrl.trim().replace(/\/+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  const tail = year ? `&year=${encodeURIComponent(year)}` : '';
  return `${base}${separator}ac=detail&t=${encodeURIComponent(typeId)}&pg=${Math.max(1, Math.round(page))}${tail}`;
}

/** 搜索：MacCMS 的 `ac=detail&wd=<关键词>` */
export function buildSearchUrl(apiUrl: string, keyword: string, page = 1): string {
  const base = apiUrl.trim().replace(/\/+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}ac=detail&wd=${encodeURIComponent(keyword)}&pg=${Math.max(1, Math.round(page))}`;
}

export interface CmsCategory {
  id: string;
  name: string;
  /** 父分类 id（0 = 一级分类）。一级分类的 t= 查询在多数采集站不会级联，要自己展开子类 */
  pid?: string;
}

/** 解析 `ac=list` 返回的分类（class 数组） */
export function parseCategories(raw: unknown): CmsCategory[] {
  const list = (raw as { class?: unknown })?.class;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: CmsCategory[] = [];
  for (const item of list) {
    const v = (item ?? {}) as Record<string, unknown>;
    const id = asString(v.type_id);
    const name = asString(v.type_name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, pid: asString(v.type_pid) || '0' });
  }
  return out;
}

/** 某个一级分类下面的二级分类 id（没有子类就返回空数组） */
export function childCategoryIds(categories: CmsCategory[], parentId: string): string[] {
  return categories
    .filter((c) => (c.pid ?? '0') === parentId && c.id !== parentId)
    .map((c) => c.id);
}

/** 一级分类（pid=0）——分类条只显示这一层，点开再展开子类 */
export function rootCategories(categories: CmsCategory[]): CmsCategory[] {
  return categories.filter((c) => (c.pid ?? '0') === '0');
}

/**
 * 按"更新时间 / 年份"倒序取前 n 部，用作首页轮播。
 *
 * 用户要求：「轮播图用最新时间上映的电影，不要随机」。
 * 接口的 vod_time 形如 "2026-11-05 22:53:30"，可以直接按字符串倒序比较。
 */
export function pickLatestVods(list: CmsVod[], n = 8): CmsVod[] {
  const seen = new Set<string>();
  const unique: CmsVod[] = [];
  for (const v of list) {
    const key = `${v.id}|${v.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(v);
  }
  const score = (v: CmsVod) => {
    const t = (v.time ?? '').trim();
    // 没有时间的排最后；有时间的按字典序即可（YYYY-MM-DD hh:mm:ss）
    return t.length >= 10 ? t : '';
  };
  return unique
    .slice()
    .sort((a, b) => {
      const ta = score(a);
      const tb = score(b);
      if (ta && tb && ta !== tb) return ta < tb ? 1 : -1;
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      const ya = Number.parseInt(a.year || '0', 10) || 0;
      const yb = Number.parseInt(b.year || '0', 10) || 0;
      return yb - ya;
    })
    .slice(0, Math.max(1, n));
}

/** 合并多个请求的结果并去重（一级分类要并行拉它的子类，然后合起来看） */
export function mergeVods(lists: CmsVod[][]): CmsVod[] {
  const seen = new Set<string>();
  const out: CmsVod[] = [];
  for (const list of lists) {
    for (const v of list) {
      const key = `${v.id}|${v.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/**
 * 每天轮换的"今日推荐"：用日期做种子，同一天结果稳定、隔天自动换。
 */
export function dailyShuffle<T>(list: T[], dateKey: string): T[] {
  let seed = 0;
  for (let i = 0; i < dateKey.length; i += 1) seed = (seed * 31 + dateKey.charCodeAt(i)) % 2147483647;
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483647;
    const j = seed % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export type CmsFetchResult =
  | { ok: true; page: CmsPage }
  | { ok: false; error: string; kind: 'network' | 'timeout' | 'parse' | 'empty' };

/** 带超时的列表请求：超时 12 秒；失败给出人话原因 */
export async function fetchCmsPage(
  apiUrl: string,
  page = 1,
  timeoutMs = 12_000,
): Promise<CmsFetchResult> {
  return fetchCmsUrl(buildListUrl(apiUrl, page), apiUrl, page, timeoutMs);
}

/** 按分类拉一页 */
export async function fetchCmsCategoryPage(
  apiUrl: string,
  typeId: string,
  page = 1,
  timeoutMs = 12_000,
  year?: string | null,
): Promise<CmsFetchResult> {
  return fetchCmsUrl(buildCategoryUrl(apiUrl, typeId, page, year), apiUrl, page, timeoutMs);
}

/**
 * 拉"最近更新"的片子（首页轮播用）。
 * 失败或没有新片时调用方退回第一页（第一页本身就是按时间倒序）。
 */
export async function fetchCmsLatest(
  apiUrl: string,
  hours = 72,
  timeoutMs = 12_000,
): Promise<CmsFetchResult> {
  return fetchCmsUrl(buildLatestUrl(apiUrl, hours), apiUrl, 1, timeoutMs);
}

/**
 * 拉一个分类的内容（一级分类自动展开子类）。
 *
 * 采集站的 `t=<一级分类>` 通常**不级联**（实测：`t=1` 只回 4 部，
 * 因为绝大多数片子挂在二级分类 5/6/7… 下面）。所以：
 *   - 有子类 → 并行拉子类，再按时间倒序合并（点「电影」不会只剩 4 部）；
 *   - 没有子类（它自己就是叶子分类）→ 直接按这个分类 id 拉。
 * 以前叶子分类被当成"没子类 = 拉全部"，于是点「动作片」看到的却是整个库。
 */
export async function fetchCmsCategoryAnyPage(
  apiUrl: string,
  typeId: string,
  childIds: string[],
  page = 1,
  timeoutMs = 12_000,
): Promise<CmsFetchResult> {
  if (childIds.length === 0) {
    return fetchCmsCategoryPage(apiUrl, typeId, page, timeoutMs);
  }
  const ids = childIds.slice(0, 12);
  const results = await Promise.all(
    ids.map((id) => fetchCmsCategoryPage(apiUrl, id, page, timeoutMs).catch(() => null)),
  );
  const ok = results.filter((r): r is { ok: true; page: CmsPage } => Boolean(r && r.ok));
  if (ok.length === 0) {
    const firstErr = results.find((r) => r && !r.ok);
    return firstErr ?? { ok: false, error: '这个分类没有取到内容', kind: 'empty' };
  }
  const pages = ok.map((r) => r.page);
  return {
    ok: true,
    page: {
      list: pickLatestVods(mergeVods(pages.map((p) => p.list)), 200),
      page,
      // 子类并行拉的是同一页，所以"翻页"按子类的页算
      pageCount: Math.max(...pages.map((p) => p.pageCount), 1),
      total: pages.reduce((sum, p) => sum + (p.total || 0), 0),
    },
  };
}

/** 按关键词搜索一页 */
export async function fetchCmsSearchPage(
  apiUrl: string,
  keyword: string,
  page = 1,
  timeoutMs = 12_000,
): Promise<CmsFetchResult> {
  return fetchCmsUrl(buildSearchUrl(apiUrl, keyword, page), apiUrl, page, timeoutMs);
}

/** 拉分类列表（失败就当没有分类，不影响主流程） */
export async function fetchCmsCategories(
  apiUrl: string,
  timeoutMs = 10_000,
): Promise<CmsCategory[]> {
  const base = apiUrl.trim().replace(/\/+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${base}${separator}ac=list`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!res.ok) return [];
    return parseCategories(await res.json());
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 真正干活的那个：给一个拼好的 URL，拉回来解析成 CmsPage。
 * 所有"列表 / 分类 / 搜索"都走它，保证错误处理和超时只有一份。
 */
async function fetchCmsUrl(
  url: string,
  apiUrl: string,
  page: number,
  timeoutMs: number,
): Promise<CmsFetchResult> {
  if (!apiUrl || !/^https?:\/\//i.test(apiUrl.trim())) {
    return { ok: false, error: '接口地址无效，请到设置页填写以 http(s) 开头的地址', kind: 'parse' };
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `接口返回 HTTP ${res.status}`, kind: 'network' };
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: '接口返回的不是 JSON（可能被防火墙或登录页拦截）', kind: 'parse' };
    }
    const parsed = parseCmsPage(json, page);
    const label = apiLabel(apiUrl);
    parsed.list = parsed.list.map((v) => ({ ...v, fromApi: apiUrl, fromLabel: label }));
    if (parsed.list.length === 0 && page === 1) {
      return { ok: false, error: '接口没有返回任何影片，请更换片源', kind: 'empty' };
    }
    return { ok: true, page: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('abort')) {
      return { ok: false, error: '接口请求超时，请更换片源', kind: 'timeout' };
    }
    return { ok: false, error: `接口请求失败：${msg}`, kind: 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface MultiSourceResult {
  list: CmsVod[];
  /** 每个接口的情况（成功/失败原因），界面上用来提示"某个源挂了" */
  sources: Array<{ api: string; label: string; ok: boolean; count: number; error?: string }>;
  /** 接口自称的总条数（多个源相加；没有就 0） */
  total: number;
  /** 接口自称的总页数（多个源取最大；没有就 1） */
  pageCount: number;
}

/**
 * 片名精准匹配打分（0 = 不匹配）。
 *
 * 用户要的是"我打几个字，直接找到那部片"，不是把整个库捞出来。
 * 所以搜索结果**只认片名**，并按相关度排序：
 *   3 = 片名完全一致
 *   2 = 片名以关键词开头
 *   1 = 片名里包含关键词
 *   0 = 不相关（直接丢弃）
 */
export function nameMatchScore(name: string, keyword: string): number {
  const n = String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const k = String(keyword ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!n || !k) return 0;
  if (n === k) return 3;
  if (n.startsWith(k)) return 2;
  if (n.includes(k)) return 1;
  return 0;
}

/** 按片名过滤 + 排序（精准优先），最多取 limit 条 */
export function filterByTitle(list: CmsVod[], keyword: string, limit = 40): CmsVod[] {
  const scored = list
    .map((v) => ({ v, score: nameMatchScore(v.name, keyword) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: CmsVod[] = [];
  for (const { v } of scored) {
    const key = `${v.name}::${v.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 搜片名（精准过滤，不做"全库捞一遍"）。
 *
 * 流程：
 *   1. 问接口要 `wd=` 关键词结果（标准 MacCMS 支持），拿回来**再按片名过滤**一遍，
 *      保证结果不跑偏；
 *   2. 接口不支持关键词搜索时，只在已加载的列表 + 前两页里按片名过滤，
 *      不做整库翻页（152028 部翻不完，也没必要）；
 *   3. 结果按 完全匹配 > 开头匹配 > 包含 排序。
 */
export async function searchVodDeep(
  apiUrl: string,
  keyword: string,
  maxPages = 2,
  knownList: CmsVod[] = [],
): Promise<{ list: CmsVod[]; mode: 'server' | 'local' | 'none' }> {
  const kw = keyword.trim();
  if (!kw) return { list: [], mode: 'none' };

  // 1) 接口自己的搜索（拿回来仍然按片名过滤，绝不让不相关的片混进来）
  /* 单源 6 秒上限：慢源直接算"没命中"，不拖累整次搜索 */
  const direct = await Promise.race([
    fetchCmsSearchPage(apiUrl, kw, 1),
    new Promise<{ ok: false; error: string }>((r) => setTimeout(() => r({ ok: false, error: '超时' }), 6000)),
  ]);
  if (direct.ok) {
    const filtered = filterByTitle(direct.page.list, kw);
    if (filtered.length > 0) return { list: filtered, mode: 'server' };
  }

  /*
   * 2) 兜底：**只在已经拿到手里的列表里**按片名过滤，不再去翻第 1、2 页。
   *
   * 这是"搜索像在扫全库"的元凶：接口搜索没命中时，原来会去拉该接口的前两页，
   * 17 个接口 × 2 页 = 34 个请求、每个还有 12 秒超时，一个慢源就把整页拖住。
   * 现在只用调用方内存里已有的列表；搜不到立即返回空，由界面提示换关键词。
   */
  const local = filterByTitle(knownList, kw);
  void maxPages;
  return { list: local, mode: local.length > 0 ? 'local' : 'none' };
}

/** 多接口搜索：并行 + 按片名精准过滤 + 相关度排序（不做全库捞取） */
export async function searchAcrossApis(
  apiUrls: string[],
  keyword: string,
  knownList: CmsVod[] = [],
): Promise<{ list: CmsVod[]; modes: Array<{ label: string; mode: 'server' | 'local' | 'none' }> }> {
  const urls = apiUrls.filter((u) => u && /^https?:\/\//i.test(u.trim()));
  /* 先搜前 8 个源把结果给用户（多源并行、每个 6 秒上限），不再等全部 17 个 */
  const fastUrls = urls.slice(0, 8);
  void urls;
  const results = await Promise.all(
    fastUrls.map(async (api) => {
      const label = apiLabel(api);
      try {
        const r = await searchVodDeep(api, keyword, 2, knownList);
        return { label, mode: r.mode, list: r.list };
      } catch {
        return { label, mode: 'none' as const, list: [] as CmsVod[] };
      }
    }),
  );
  // 汇总后再按片名相关度排一次序（多个源混在一起时，最像的那部排最前）
  const merged: CmsVod[] = [];
  for (const r of results) merged.push(...r.list);
  return {
    list: filterByTitle(merged, keyword, 40),
    modes: results.map((r) => ({ label: r.label, mode: r.mode })),
  };
}

/** 同一部片在多个接口里的所有播放线路（用于"换源"） */
export async function collectSourcesAcrossApis(
  apiUrls: string[],
  title: string,
): Promise<CmsSource[]> {
  const vods = await findVodAcrossApis(apiUrls, title);
  const out: CmsSource[] = [];
  for (const v of vods) {
    for (const s of parseSources(v.playFromRaw, v.playUrlRaw)) {
      if (s.episodes.length === 0) continue;
      out.push({ name: `${s.name}${v.fromLabel ? ` · ${v.fromLabel}` : ''}`, episodes: s.episodes });
    }
  }
  return out;
}

/**
 * 多接口并行拉取并合并（按 id+名字去重）。
 *
 * 用户可能配置了好几个苹果CMS 接口：有的片只有 A 有，有的只有 B 有。
 * 这里并行请求，任何一个失败都不影响其他源的结果。
 */
export async function fetchCmsMulti(
  apiUrls: string[],
  fetcher: (api: string) => Promise<CmsFetchResult>,
): Promise<MultiSourceResult> {
  const urls = apiUrls.filter((u) => u && /^https?:\/\//i.test(u.trim()));
  if (urls.length === 0) {
    return { list: [], sources: [], total: 0, pageCount: 1 };
  }
  const results = await Promise.all(
    urls.map(async (api) => {
      const label = apiLabel(api);
      try {
        const r = await fetcher(api);
        if (r.ok)
          return {
            api,
            label,
            ok: true,
            count: r.page.list.length,
            list: r.page.list,
            total: r.page.total,
            pageCount: r.page.pageCount,
          };
        return { api, label, ok: false, count: 0, error: r.error, list: [] as CmsVod[], total: 0, pageCount: 1 };
      } catch (err) {
        return {
          api,
          label,
          ok: false,
          count: 0,
          error: err instanceof Error ? err.message : String(err),
          list: [] as CmsVod[],
          total: 0,
          pageCount: 1,
        };
      }
    }),
  );
  const seen = new Set<string>();
  const list: CmsVod[] = [];
  for (const r of results) {
    for (const v of r.list) {
      const key = `${v.name}::${v.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(v);
    }
  }
  return {
    list,
    sources: results.map((r) => ({ api: r.api, label: r.label, ok: r.ok, count: r.count, error: r.error })),
    total: results.reduce((sum, r) => sum + (r.ok ? r.total : 0), 0),
    pageCount: Math.max(1, ...results.map((r) => (r.ok ? r.pageCount : 1))),
  };
}

/** 按 id 拉单部影片详情（ac=detail&ids=） */
export async function fetchCmsDetail(
  apiUrl: string,
  id: string,
  timeoutMs = 12_000,
): Promise<{ ok: true; vod: CmsVod | null } | { ok: false; error: string }> {
  if (!apiUrl || !/^https?:\/\//i.test(apiUrl.trim())) {
    return { ok: false, error: '接口地址无效，请到设置页填写' };
  }
  const base = apiUrl.trim().replace(/\/+$/, '');
  const separator = base.includes('?') ? '&' : '?';
  const url = `${base}${separator}ac=detail&ids=${encodeURIComponent(id)}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, signal: controller?.signal });
    if (!res.ok) return { ok: false, error: `接口返回 HTTP ${res.status}` };
    const json = (await res.json()) as unknown;
    const list = parseVodList(json);
    const hit = list.find((v) => v.id === String(id)) ?? list[0] ?? null;
    return {
      ok: true,
      vod: hit ? { ...hit, fromApi: apiUrl, fromLabel: apiLabel(apiUrl) } : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.toLowerCase().includes('abort') ? '请求超时' : `请求失败：${msg}` };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 在多个接口里找同一部片（按名字匹配）。
 *
 * 用途：某部片在 A 接口只有一条线路、还卡，但 B 接口也有这部片，
 * 于是可以把 B 也列成"另一个源"让用户切过去。
 */
export async function findVodAcrossApis(
  apiUrls: string[],
  title: string,
  timeoutMs = 10_000,
): Promise<CmsVod[]> {
  const clean = title.trim();
  if (!clean) return [];
  const hits = await Promise.all(
    apiUrls
      .filter((u) => u && /^https?:\/\//i.test(u.trim()))
      .map(async (api) => {
        void timeoutMs;
        try {
          // 用带兜底的搜索：接口不支持 wd= 时会在最新几页里按名字找
          const r = await searchVodDeep(api, clean);
          const exact = r.list.find((v) => v.name.trim() === clean);
          return exact ?? r.list[0] ?? null;
        } catch {
          return null;
        }
      }),
  );
  return hits.filter((v): v is CmsVod => Boolean(v));
}