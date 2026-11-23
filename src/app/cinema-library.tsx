import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isFresh, readCmsCache, writeCmsCache } from '../ui/cmsCache';
import { LIBRARY_STATS } from '../ui/libraryStats';
import { fetchCachedCategoryPageInfo, getApiCategories, resolveIdsForApi } from '../ui/cmsCatCache';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchCmsCategories,
  fetchCmsCategoryPage,
  fetchCmsLatest,
  fetchCmsMulti,
  fetchCmsPage,
  mergeVods,
  pickLatestVods,
  searchAcrossApis,
  type CmsPage,
  type CmsVod,
} from '../core/cms';
import {
  bucketOfVod,
  dedupeByTitle,
  filterByBucket,
  matchesSubCategory,
  groupCategories,
  smartFilterAnime,
  type CinemaGroup,
} from '../core/cinemaClassify';
import { getCmsApiList } from '../core/cmsConfig';
import { useApp } from '../store';
import { NightBackdrop, NightPill, WallpaperBadge } from '../ui/NightSky';
import { night, nightFont, nightShadow } from '../ui/nightTheme';
import { Ico } from '../ui/icons';

/**
 * 影院在线片库（二次元夜景海报墙）
 *
 * 本次改造（对应用户反馈）：
 *   1. **分类修好了**：采集站的一堆一级分类（国产动漫/日本动漫/动漫、动作片/科幻片/喜剧片…）
 *      归并成 动漫 / 电影 / 剧集 / 综艺 / 纪录片 / 其他，不再是一长串站内分类；
 *   2. **动漫分类里不再混真人**：用 type_name / 片名 / 简介 判一次「动画 or 真人」，
 *      判成真人的从动漫里剔掉，并在界面上写明「已过滤 N 部真人片」；
 *   3. UI 换成夜景风（壁纸同款青蓝配色 + 玻璃卡 + 光晕），和电视直播是一套视觉。
 *
 * 合规：片源由用户自己配置的第三方接口提供，App 不内置、不托管、不存储任何视频内容。
 */
/** 细分类缓存键：分类 / 二级分类 / 年份 / 月份 任一不同就是另一份缓存（永久保留） */
function catCacheKey(
  groupKey: string | null,
  subId: string | null,
  year: string | null,
  month: string | null,
): string {
  return `lib:cat:${groupKey ?? 'all'}|${subId ?? ''}|${year ?? ''}|${month ?? ''}`;
}

/** 年份筛选：今年往前 10 年 + 更早 */
function yearOptions(): string[] {
  const now = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => String(now - i));
}

export default function CinemaLibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // 片库接口归一个人管、两个人共用；用共享的那一份而不是本机配置
  const { store } = useApp();

  const [apis, setApis] = useState<string[]>([]);
  const [items, setItems] = useState<CmsVod[]>([]);
  const [groups, setGroups] = useState<CinemaGroup[]>([]);
  /** 当前选中的分类档（`null` = 全部） */
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  /** 二级分类（动作片/恐怖片/科幻片…）；null = 这一档全部 */
  const [subId, setSubId] = useState<string | null>(null);
  /** 年份 / 月份筛选；null = 不限 */
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSheet, setErrorSheet] = useState(false);
  const [failedPics, setFailedPics] = useState<Record<string, boolean>>({});
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  /** 动漫分类下「剔掉了几部真人片」 */
  const [animeFilter, setAnimeFilter] = useState<{ dropped: number; suspicious: boolean }>({
    dropped: 0,
    suspicious: false,
  });
  const inFlight = useRef(false);
  const groupsRef = useRef<CinemaGroup[]>([]);
  const carouselRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [latest, setLatest] = useState<CmsVod[]>([]);

  const cols = 3;
  const winWidth = useWindowDimensions().width;
  const carouselGap = 12;
  const carouselCardWidth = Math.max(240, winWidth - 32);
  const carouselStride = carouselCardWidth + carouselGap;

  /*
   * DELETED_API_FILTER：接口列表是两个人共用的。对方在另一台手机上删掉某个接口时，
   * 服务器投影一变，这一屏上属于那个接口的片子必须**立刻**消失 —— 不能等刷新、
   * 更不能因为本机缓存里还留着就继续显示（用户要求："删掉要同步，不要删了还在"）。
   * 依赖用字符串 key，避免每次 store bump 都重建数组。
   */
  const sharedApisKey = store.cmsApis.join('|');
  const aliveApis = useMemo(() => new Set(sharedApisKey.split('|').filter(Boolean)), [sharedApisKey]);
  const visibleItems = useMemo(
    () => (aliveApis.size === 0 ? items : items.filter((it) => !it.fromApi || aliveApis.has(it.fromApi))),
    [items, aliveApis],
  );
  const visibleLatest = useMemo(
    () => (aliveApis.size === 0 ? latest : latest.filter((it) => !it.fromApi || aliveApis.has(it.fromApi))),
    [latest, aliveApis],
  );

  const featured = useMemo(() => pickLatestVods(visibleLatest, 8), [visibleLatest]);

  useEffect(() => {
    if (featured.length < 2) return;
    const timer = setInterval(() => {
      setCarouselIdx((prev) => {
        const next = (prev + 1) % featured.length;
        carouselRef.current?.scrollTo?.({ x: next * carouselStride, animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, [featured.length, carouselStride]);

  /**
   * 拉一个「归并后的分类」：把这一档下的所有采集站分类 id 并行拉一遍再合并。
   *
   * 为什么不能只传一级 id：采集站的 `t=一级分类` 大多不级联
   * （实测点「电影」只回 4 部），所以要把这一档下面所有子类一起拉。
   */
  /**
   * 取「某一档 / 某一类」在这个接口里的内容。
   *
   * 关键修复（用户反馈"电影跑进电视剧、短剧跑进爱情片"）：
   * 采集站的分类 id 是各站自己编号的，以前拿 A 站解析出来的 id 去问 B 站，
   * 结果问到的其实是别的分类 —— 所以怎么过滤都是错乱的。
   * 现在按**分类名**在每个接口自己的分类表里找它自己的 id，找不到就不问这个接口。
   *
   * 顺带把每个 (接口, 分类) 的第一页永久缓存：同一个分类再点一次 = 0 次网络。
   */
  const fetchGroupForApi = useCallback(
    async (
      api: string,
      group: CinemaGroup,
      targetPage: number,
      year?: string | null,
      subName?: string | null,
    ) => {
      if (targetPage > 1) {
        // 翻页不走缓存，直接按名字对齐后拉第 N 页
        const cats = await getApiCategories(api);
        const ids = resolveIdsForApi(cats, group.key, subName).slice(0, 4);
        if (ids.length === 0) return { ok: false as const, error: '这个接口没有这个分类', kind: 'empty' as const };
        const results = await Promise.all(
          ids.map((id) => fetchCmsCategoryPage(api, id, targetPage, 12_000, year).catch(() => null)),
        );
        const pages = results
          .filter((r): r is { ok: true; page: CmsPage } => Boolean(r && r.ok))
          .map((r) => r.page);
        if (pages.length === 0) return { ok: false as const, error: '这个分类没有更多了', kind: 'empty' as const };
        return {
          ok: true as const,
          page: {
            list: pickLatestVods(mergeVods(pages.map((p) => p.list)), 300),
            page: targetPage,
            pageCount: Math.max(1, ...pages.map((p) => p.pageCount)),
            total: pages.reduce((sum, p) => sum + (p.total || 0), 0),
          },
        };
      }

      const cats = await getApiCategories(api);
      const ids = resolveIdsForApi(cats, group.key, subName).slice(0, 4);
      if (ids.length === 0) return { ok: false as const, error: '这个接口没有这个分类', kind: 'empty' as const };
      /*
       * 第一页也要把真实页数/总数交上去。
       * 以前这里硬写 pageCount: 1 —— 片库判断 page(1) >= pageCount(1) 就直接显示
       * 「已经到底了」，分类页永远没有「加载更多」，第 2 页成了一辈子进不去的死代码。
       */
      const infos = await Promise.all(ids.map((id) => fetchCachedCategoryPageInfo(api, id, year)));
      const lists = infos.map((i) => i.list);
      const flat = lists.flat();
      if (flat.length === 0) return { ok: false as const, error: '这个分类没取到内容', kind: 'empty' as const };
      return {
        ok: true as const,
        page: {
          list: pickLatestVods(mergeVods(lists.filter((l) => l.length > 0)), 300),
          page: 1,
          pageCount: Math.max(1, ...infos.map((i) => i.pageCount)),
          total: infos.reduce((sum, i) => sum + i.total, 0) || flat.length,
        },
      };
    },
    [],
  );

  /*
   * 进片库先读本机缓存，秒出上次的内容；然后再决定要不要刷新。
   * 以前每次进来都要把 20 多个接口重新拉一遍（15~25 秒白等）。
   */
  const cacheLoaded = useRef(false);
  useEffect(() => {
    if (cacheLoaded.current) return;
    cacheLoaded.current = true;
    void readCmsCache<{
      items: CmsVod[];
      total: number;
      pageCount: number;
      groups: ReturnType<typeof groupCategories>;
      latest: CmsVod[];
    }>('lib:home').then((cached) => {
      if (!cached) return;
      const v = cached.value;
      if (v.items?.length) setItems(v.items);
      if (typeof v.total === 'number') setTotal(v.total);
      if (typeof v.pageCount === 'number') setPageCount(v.pageCount);
      /*
       * PAGE_COUNT_SELFHEAL：老版本写进缓存的 pageCount 是 1（那条 bug），
       * 而"缓存新鲜就直接用"不会自动刷新 —— 于是页脚会一直停在「已经到底了」。
       * 见到 pageCount <= 1 就顺手在后台重算一次，下一次进来就正常了。
       */
      const stalePageCount = !(typeof v.pageCount === 'number' && v.pageCount > 1);
      if (stalePageCount) void load(1, 'refresh');
      if (v.groups?.length) {
        setGroups(v.groups);
        groupsRef.current = v.groups;
      }
      if (v.latest?.length) setLatest(v.latest);
      /*
       * CACHE_FIRST_30M：缓存是永久的，进页面**直接用它铺满**（列表 + 分类 + 最近上线轮播），
       * 只有缓存超过 30 分钟才在后台静默刷新。
       * 之前改成"每次进来都刷新"，结果每次先看到缩水的列表、轮播图还得等十几秒才出。
       */
      setLoading(false);
      if (!isFresh(cached.at, 30 * 60 * 1000)) {
        void load(1, 'refresh');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    async (
      targetPage: number,
      mode: 'init' | 'refresh' | 'more',
      opts?: {
        groupKey?: string | null;
        search?: string | null;
        subId?: string | null;
        year?: string | null;
        month?: string | null;
      },
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (mode === 'init') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);

      /*
       * 整个加载过程兜一层 try/finally：
       * 以前只要中途抛异常（网络错误、接口返回怪数据），下面的 setLoading(false)
       * 就永远执行不到 —— 页面会一直停在"正在读取片源…"，用户只能杀进程重开。
       */
      try {

      // 接口用「共享的那一份」：一个人维护，两个人拉到同一批片
      const shared = store.cmsApis;
      const list = shared.length > 0 ? shared : await getCmsApiList();
      setApis(list);

      const searchText = opts?.search ?? null;
      const groupKey = opts?.groupKey ?? null;
      const group = groupKey ? groupsRef.current.find((g) => g.key === groupKey) ?? null : null;
      /* 二级分类 / 年份 / 月份：用户要的是"电影 -> 恐怖片 -> 2026年 -> 11月"这种细到不能再细的分类 */
      const subId = opts?.subId ?? null;
      const year = opts?.year ?? null;
      const month = opts?.month ?? null;
      // 二级分类的**名字**：按名字去每个接口自己的分类表里对齐 id（id 各站不一样）
      const subName = subId ? (group?.subs.find((s) => s.id === subId)?.name ?? null) : null;

      if (searchText) {
        setSearching(true);
        const found = await searchAcrossApis(list, searchText, items);
        setSearching(false);
        setSourceWarnings(
          found.modes.some((m) => m.mode === 'local')
            ? ['这个接口不支持关键词搜索：已按片名在最新几页里精准过滤']
            : [],
        );
        if (found.list.length === 0) setError(`没有搜到「${searchText}」，换个关键词试试`);
        else setError(null);
        setItems((prev) => (mode === 'more' ? [...prev, ...found.list] : found.list));
        setTotal(found.list.length);
        setPageCount(1);
        setPage(targetPage);
        setAnimeFilter({ dropped: 0, suspicious: false });
      } else {
        /*
         * 快速首屏：先用**第一个接口**把片子铺出来（实测 2~3 秒），
         * 再后台把剩下 20 多个接口合并进来。
         * 以前是等全部接口都回来才渲染，只要有一个慢，整页就十几秒空白。
         */
        if (mode === 'init' && targetPage === 1 && !group && list.length > 0) {
          try {
            const quick = await fetchCmsPage(list[0], 1);
            if (quick.ok && quick.page.list.length > 0) {
              setItems(quick.page.list);
              setTotal(quick.page.total || quick.page.list.length);
              setPageCount(quick.page.pageCount);
              setPage(1);
              setLoading(false);
            }
          } catch {
            /* 首屏失败就走下面的完整流程 */
          }
        }
        const fetcher = (api: string) => {
          if (group) return fetchGroupForApi(api, group, targetPage, year, subName);
          return fetchCmsPage(api, targetPage);
        };
        /*
         * 分类页要快：先只用**前 8 个接口**把内容铺出来（几秒内），
         * 剩下的接口在后台补进来再合并 —— 以前等 20 多个接口全回来，
         * 所以点「电影/动漫」要转圈十几秒。
         */
        const apiBudget = year || subId ? 5 : 8;
        const firstBatch = targetPage === 1 && (group || subId) ? list.slice(0, apiBudget) : list;
        const merged = await fetchCmsMulti(firstBatch, fetcher);
        if (targetPage === 1 && (group || subId) && list.length > firstBatch.length) {
          void (async () => {
            try {
              const rest = await fetchCmsMulti(list.slice(firstBatch.length), fetcher);
              if (rest.list.length === 0) return;
              setItems((prev) => {
                const seen = new Set(prev.map((v) => `${v.fromApi ?? ''}|${v.id}`));
                const extra = rest.list.filter((v) => {
                  const k = `${v.fromApi ?? ''}|${v.id}`;
                  if (seen.has(k)) return false;
                  seen.add(k);
                  return true;
                });
                return extra.length > 0 ? [...prev, ...extra] : prev;
              });
            } catch {
              /* 补齐失败就用手上这些 */
            }
          })();
        }
        setSourceWarnings(
          merged.sources.filter((s) => !s.ok).map((s) => `${s.label}：${s.error ?? '不可用'}`),
        );

        // ---- 年份 / 月份：接口不一定认 &year=，本地再兜一层（按 vod 的年份与上线时间） ----
        // 有的接口 vod_year 是空的，只能用 vod_time（"2026-11-05 …"）里的年份兜底
        const yearOfVod = (v: CmsVod): string => {
          const y = String(v.year ?? '').trim();
          if (y) return y;
          const tt = String(v.time ?? '');
          return /^\d{4}/.test(tt) ? tt.slice(0, 4) : '';
        };
        const monthOfVod = (v: CmsVod): string => {
          const tt = String(v.time ?? '');
          return tt.length >= 7 ? tt.slice(5, 7) : '';
        };
        const scopeFilter = (list: CmsVod[]): CmsVod[] =>
          list.filter((v) => {
            if (year) {
              const y = yearOfVod(v);
              // 严格：拿不到年份 = 不算这一年的（以前放行，于是 2012 年的片混进"2026 年"里）
              if (y !== year) return false;
            }
            if (month) {
              const mm = monthOfVod(v);
              if (mm !== month.padStart(2, '0')) return false;
            }
            return true;
          });

        let scoped = year || month ? scopeFilter(merged.list) : merged.list;
        /* 分类严格复核：短剧/综艺/动漫不能混进「电影」，反之亦然（宁可少几部也不脏） */
        if (group) {
          const strict = filterByBucket(scoped, group.key);
          if (strict.list.length > 0 || scoped.length === 0) {
            scoped = strict.list;
          }
          // 选了具体子类（如「爱情片」）：条目类型必须提到它，否则宁可不显示
          if (subId) {
            const subName = group.subs.find((s) => s.id === subId)?.name ?? '';
            if (subName) {
              /*
               * 同义词归并后再筛条目（日韩动漫 ≈ 日本动漫、国产动漫 ≈ 中国动漫）。
               * 以前用字面包含，跨站叫法一不一样就把整站条目丢光 ——
               * 用户看到的就是"日韩动漫才 5 千多"。
               */
              const matched = scoped.filter((v) =>
                matchesSubCategory(String(v.typeName ?? ''), subName),
              );
              if (matched.length > 0 || scoped.length === 0) scoped = matched;
            }
          }
        }
        /*
         * 选年份后如果这一档拿到的旧片太少，再多拉一页（page 2）：
         * 采集站第一页往往全是"最近更新"，只筛第一页会出现"2020 年一部都没有"的假象。
         */
        if (year && targetPage === 1 && scoped.length < 12) {
          try {
            const deeper = await fetchCmsMulti(list, (api) => {
              if (subId) return fetchCmsCategoryPage(api, subId, 2, 12_000, year);
              if (group) return fetchGroupForApi(api, group, 2, year);
              return fetchCmsPage(api, 2);
            });
            const seenIds = new Set(scoped.map((v) => `${v.fromApi ?? ''}|${v.id}`));
            for (const v of scopeFilter(deeper.list)) {
              const k = `${v.fromApi ?? ''}|${v.id}`;
              if (seenIds.has(k)) continue;
              seenIds.add(k);
              scoped.push(v);
            }
          } catch {
            /* 拉不到就用手上这些 */
          }
        }

        // ---- 动漫分类：把混进来的真人片剔掉 ----
        let finalList = scoped;
        if (group?.anime && scoped.length > 0) {
          const filtered = smartFilterAnime(scoped);
          finalList = filtered.list;
          setAnimeFilter({ dropped: filtered.dropped, suspicious: filtered.suspicious });
        } else {
          setAnimeFilter({ dropped: 0, suspicious: false });
        }

        /*
         * SORT_MOVIES_FIRST：'全部' 里以前是纯按更新时间混排，采集站最近更新一堆综艺，
         * 于是首屏全变成综艺。这里按类型给个优先级（电影 > 剧集 > 动漫 > 纪录片 > 综艺 > 其它），
         * 同类内部仍然保持"最新在前"（sort 是稳定的），所以既好看又不丢时效。
         */
        if (!group && !subId && !searchText) {
          const prio: Record<string, number> = {
            movie: 0,
            series: 1,
            anime: 2,
            doc: 3,
            variety: 4,
            other: 5,
          };
          finalList = [...finalList].sort(
            (a2, b2) => (prio[bucketOfVod(a2)] ?? 9) - (prio[bucketOfVod(b2)] ?? 9),
          );
        }
        // 按片名去重：一部片在十几个采集站里各有一条、上架月份还不同，不去重就会"同片多月份重复出现"
        finalList = dedupeByTitle(finalList);
        if (finalList.length > 0) {
          setError(null);
          setItems((prev) => (mode === 'more' ? [...prev, ...finalList] : finalList));
          setTotal(merged.total > 0 ? merged.total : finalList.length);
          setPage(targetPage);
          if (targetPage === 1 && !group) {
            // 分类条 + 轮播只在「全部」的第一页刷新
            const first = await fetchCmsPage(list[0], 1);
            if (first.ok) {
              /* 页数取"所有接口的最大值"（merged 已经算好），不再拿单个接口覆盖全局 */
              setPageCount((prev) => Math.max(prev, 1, Number(merged.pageCount) || 1));
              /*
               * TOTAL_NO_MULTIPLY：以前这里是 `first.page.total * 接口数`，
               * 把"一个站的片数"乘上"站的个数"——纯属凭空放大十几倍（用户看到 770 万）。
               * 现在只加各接口自己报的 total（仍然会偏高：采集站互相搬运，同一部片在多个站都有；
               * 真实去重片数只能全库抓完才算得准）。
               */
              setTotal(merged.total > 0 ? merged.total : first.page.total);
            }
            const cats = await fetchCmsCategories(list[0]);
            const grouped = groupCategories(cats);
            setGroups(grouped);
            groupsRef.current = grouped;
            const fresh = await fetchCmsLatest(list[0]);
            const latestList =
              fresh.ok && fresh.page.list.length > 0 ? fresh.page.list : first.ok ? first.page.list : [];
            if (latestList.length > 0) setLatest(latestList);
            // 顺手把前几个接口的「分类表」也缓存了：切分类时按名字对齐 id 才是对的
            void Promise.all(list.slice(0, 6).map((api) => getApiCategories(api))).catch(() => undefined);
            // 把「第一页 + 分类 + 最近上线」存本机：下次进片库先秒出这个
            void writeCmsCache('lib:home', {
              items: finalList,
              total: merged.total > 0 ? merged.total : finalList.length,
              pageCount: Math.max(1, Number(merged.pageCount) || 1),
              groups: grouped,
              latest: latestList,
            });
          } else if (targetPage === 1 && group) {
            // 分类页第一页也存本机：下次点同一档直接秒出（永久缓存）
            const chosenKey = catCacheKey(group.key, subId, year, month);
            void writeCmsCache(chosenKey, {
              items: finalList.slice(0, 600),
              total: merged.total > 0 ? merged.total : finalList.length,
              pageCount: Math.max(1, merged.pageCount),
            });
          }
        } else if (group?.anime && merged.list.length > 0) {
          // 极端情况：整个分类全被判成真人（说明采集站分类标错了），别把库清空
          setItems((prev) => (mode === 'more' ? [...prev, ...merged.list] : merged.list));
          setTotal(merged.total > 0 ? merged.total : merged.list.length);
          setPage(targetPage);
          setError(null);
        } else {
          const first = merged.sources[0];
          if (year || month) {
            // 严格过滤之后确实没有：说清楚是"筛选条件太严"，别让人以为接口挂了
            const label = `${year ?? ''}${month ? ` 年 ${month} 月` : ' 年'}`;
            setError(`这一档没有 ${label}的片（采集站大多不给年份/月份，换个年份或点「年份全部」）`);
          } else {
            setError(first?.error ?? '接口没有返回任何影片，请更换片源');
          }
          if (mode !== 'more') setErrorSheet(true);
        }
        /*
         * PAGE_COUNT_STALE：这里以前是 `setPageCount(group ? merged.pageCount : pageCount)`，
         * 「全部」那条分支用的是**闭包里的旧值**（初值 1 / 缓存里的 1），
         * 把上面刚从接口拿到的真实页数又覆盖回去了 ——
         * 于是几万部的片库，页脚永远写着「已经到底了」，第二页根本翻不到。
         * 现在用函数式更新，拿当前值和新算出来的最大值取较大者。
         */
        setPageCount((prev) => {
          const mergedPages = Math.max(1, Number(merged.pageCount) || 1);
          return group ? mergedPages : Math.max(prev, mergedPages);
        });
      }
      } catch (err) {
        // 出异常也要给一句人话 + 把 loading 关掉，绝不留白转圈
        setError(err instanceof Error ? err.message : '读取片源失败，检查一下接口地址');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        inFlight.current = false;
      }
    },
    [fetchGroupForApi, items, pageCount, store],
  );

  useEffect(() => {
    void load(1, 'init');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goSources = () => {
    setErrorSheet(false);
    router.push('/cinema-sources');
  };

  const runSearch = () => {
    const text = keyword.trim();
    if (!text) {
      setSearchMode(false);
      setActiveGroup(null);
      void load(1, 'refresh');
      return;
    }
    setSearchMode(true);
    setActiveGroup(null);
    void load(1, 'refresh', { search: text });
  };

  /** 任何筛选变化都走这里：先读对应的永久缓存秒开，再后台刷新 */
  const applyCategory = (next: {
    groupKey: string | null;
    subId?: string | null;
    year?: string | null;
    month?: string | null;
  }) => {
    const s = next.subId ?? null;
    const y = next.year ?? null;
    const m = next.month ?? null;
    setActiveGroup(next.groupKey);
    setSearchMode(false);
    setKeyword('');
    setSubId(s);
    setYearFilter(y);
    setMonthFilter(m);

    const key = catCacheKey(next.groupKey, s, y, m);
    const readKey = next.groupKey === null ? 'lib:home' : key;
    void readCmsCache<{ items: CmsVod[]; total: number; pageCount: number }>(readKey).then((cached) => {
      const v = cached?.value;
      if (!v?.items?.length) return;
      setItems(v.items);
      if (typeof v.total === 'number') setTotal(v.total);
      if (typeof v.pageCount === 'number') setPageCount(v.pageCount);
      /* 老缓存的页数是 1：后台补算一次真实页数（否则页脚永远是「已经到底了」） */
      if (!(typeof v.pageCount === 'number' && v.pageCount > 1)) {
        void load(1, 'refresh', {
          groupKey: next.groupKey,
          subId: s,
          year: y,
          month: m,
        });
      }
      setPage(1);
      setError(null);
      setLoading(false);
    });
    void load(1, 'refresh', { groupKey: next.groupKey, subId: s, year: y, month: m });
  };

  const pickGroup = (key: string | null) => {
    /*
     * 分类页也走永久缓存：点「动漫/电影/剧集…」时先把上次这一档的内容直接铺出来，
     * 再在后台刷新。以前每点一次都要把 20 多个接口的分类页重新拉一遍，卡好几秒。
     * 「全部」用片库首页那份缓存（lib:home），不重复点网络。
     */
    applyCategory({ groupKey: key });
  };

  /** 点二级分类（恐怖片 / 科幻片 …） */
  const pickSub = (id: string | null) => {
    applyCategory({ groupKey: activeGroup, subId: id, year: yearFilter, month: monthFilter });
  };

  /** 点年份；换年份时把月份清掉（月份只在选定年份下才有意义） */
  const pickYear = (y: string | null) => {
    applyCategory({ groupKey: activeGroup, subId, year: y, month: null });
  };

  /**
   * 点月份：**不发网络请求**，直接在已缓存的「这一年」列表里按上线时间筛。
   * 以前每个月份组合都当新查询去打接口，所以点一下要等半天（用户反馈"加载半天"）。
   */
  const pickMonth = (m: string | null) => {
    setMonthFilter(m);
    setSearchMode(false);
    const baseKey = catCacheKey(activeGroup, subId, yearFilter, null);
    void readCmsCache<{ items: CmsVod[]; total: number; pageCount: number }>(baseKey).then((cached) => {
      const pool = cached?.value?.items?.length ? cached.value.items : items;
      if (!m) {
        if (cached?.value?.items?.length) {
          setItems(cached.value.items);
          setTotal(cached.value.total);
          setPageCount(cached.value.pageCount);
          setPage(1);
          setError(null);
        }
        return;
      }
      const mm = m.padStart(2, '0');
      const filtered = pool.filter((v) => String(v.time ?? '').slice(5, 7) === mm);
      setItems(filtered);
      setTotal(filtered.length);
      setPageCount(1);
      setPage(1);
      setError(filtered.length === 0 ? '这个月这一档没有片（采集站只给到最近更新的内容）' : null);
      setLoading(false);
    });
  };

  const renderItem = ({ item }: { item: CmsVod }) => {
    const broken = failedPics[`${item.id}${item.name}`];
    return (
      <Pressable
        style={{ width: `${100 / cols}%`, marginBottom: 14 }}
        onPress={() =>
          router.push(
            `/cinema-detail?id=${encodeURIComponent(item.id)}&api=${encodeURIComponent(item.fromApi ?? '')}`,
          )
        }
      >
        <View style={styles.posterBox}>
          {item.pic && !broken ? (
            <Image
              source={{ uri: item.pic }}
              style={styles.poster}
              resizeMode="cover"
              onError={() => setFailedPics((prev) => ({ ...prev, [`${item.id}${item.name}`]: true }))}
            />
          ) : (
            <View style={styles.posterFallback}>
              <Ico name="cinema" size="xl" />
              <Text style={styles.posterFallbackText} numberOfLines={2}>
                {item.name}
              </Text>
            </View>
          )}
          <View style={styles.posterMask}>
            <Text style={styles.posterName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.remarks ? (
              <Text style={styles.posterRemark} numberOfLines={1}>
                {item.remarks}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  const overlayTitle = searchMode
    ? '搜索结果'
    : activeGroup
      ? `分类 · ${groups.find((g) => g.key === activeGroup)?.label ?? ''}`
      : '最新上线 · 按时间倒序';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <NightBackdrop variant="cinema" />

      {/* 顶部 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.roundBtn} hitSlop={8}>
          <Text style={{ color: night.text, fontSize: 16 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={nightFont.h1}>在线片库</Text>
          <Text style={[nightFont.small, { marginTop: 2 }]} numberOfLines={1}>
            {apis.length > 1 ? `${apis.length} 个片源 · ` : ''}
            {total > 0 ? (
              <>
                {`已收录 ${LIBRARY_STATS.uniqueExact.toLocaleString('zh-CN')} 部`}
                {` · ${LIBRARY_STATS.sources} 个源去重`}
              </>
            ) : visibleItems.length > 0 ? `${visibleItems.length} 部` : '读取中…'}
            {sourceWarnings.length > 0 ? ` · ${sourceWarnings.length} 个源不可用` : ''}
          </Text>
        </View>
        <Pressable onPress={goSources} style={styles.roundBtn} hitSlop={8}>
          <Text style={{ color: night.cyan, fontSize: 11.5, fontWeight: '700' }}>接口</Text>
        </Pressable>
      </View>

      {/* 搜索 */}
      <View style={styles.searchRow}>
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜片名，比如「葬送的芙莉莲」"
          placeholderTextColor={night.textFaint}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <Pressable onPress={runSearch} style={styles.searchBtn}>
          <Text style={styles.searchBtnText}>{searching ? '…' : '搜索'}</Text>
        </Pressable>
        {searchMode || activeGroup ? (
          <Pressable
            onPress={() => {
              setKeyword('');
              setSearchMode(false);
              setActiveGroup(null);
              void load(1, 'refresh');
            }}
            style={styles.clearBtn}
          >
            <Text style={{ color: night.textDim, fontSize: 11 }}>清除</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={night.cyan} />
          <Text style={[nightFont.small, { marginTop: 10 }]}>正在读取片源…</Text>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => `${item.id}-${item.name}-${item.fromLabel ?? ''}`}
          renderItem={renderItem}
          numColumns={3}
          /* 列表性能：一次只挂少量海报、滑出屏幕就回收（几百部片时不卡） */
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={5}
          removeClippedSubviews
          updateCellsBatchingPeriod={40}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 14 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                void load(1, 'refresh', {
                  groupKey: activeGroup,
                  search: searchMode ? keyword : null,
                })
              }
              tintColor={night.cyan}
              colors={[night.cyan]}
            />
          }
          ListHeaderComponent={
            <>
              {/* 主视觉：内置壁纸（伊蕾娜·夜幕）—— 只在「全部」顶部出现一次 */}
              {!searchMode && !activeGroup ? (
                <View style={styles.hero}>
                  <WallpaperBadge size={56} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: night.text, fontSize: 13.5, fontWeight: '800' }}>
                      夜幕 · 伊蕾娜
                    </Text>
                    <Text style={[nightFont.small, { marginTop: 3 }]} numberOfLines={2}>
                      内置壁纸（Wallpaper Engine 3470764447）同款青蓝配色
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                      <NightPill label={`${groups.length} 个分类`} tone="pink" />
                      <NightPill label="动漫已剔除真人" tone="mint" />
                    </View>
                  </View>
                </View>
              ) : null}

              {/* 最新上线轮播 */}
              {!searchMode && featured.length > 0 ? (
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.sectionTitle}>{overlayTitle}</Text>
                  <ScrollView
                    ref={carouselRef as never}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    pagingEnabled
                    snapToInterval={carouselStride}
                    snapToAlignment="start"
                    disableIntervalMomentum
                    decelerationRate="fast"
                    contentContainerStyle={{ paddingHorizontal: 14 }}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / carouselStride);
                      setCarouselIdx(Math.max(0, Math.min(featured.length - 1, idx)));
                    }}
                    scrollEventThrottle={60}
                  >
                    {featured.map((item) => (
                      <Pressable
                        key={`feat-${item.id}-${item.name}`}
                        style={{ width: carouselCardWidth, marginRight: carouselGap }}
                        onPress={() =>
                          router.push(
                            `/cinema-detail?id=${encodeURIComponent(item.id)}&api=${encodeURIComponent(
                              item.fromApi ?? '',
                            )}`,
                          )
                        }
                      >
                        <View style={styles.featureCard}>
                          {item.pic ? (
                            <>
                              <Image
                                source={{ uri: item.pic }}
                                style={StyleSheet.absoluteFill}
                                resizeMode="cover"
                                blurRadius={18}
                              />
                              <View style={styles.featureDim} />
                              <Image source={{ uri: item.pic }} style={styles.featurePic} resizeMode="contain" />
                            </>
                          ) : (
                            <View style={[styles.featurePic, styles.posterFallback]}>
                              <Ico name="cinema" size="xl" />
                            </View>
                          )}
                          <View style={styles.featureMask}>
                            <Text style={styles.featureName} numberOfLines={2}>
                              {item.name}
                            </Text>
                            <Text style={styles.featureSub} numberOfLines={1}>
                              {[item.typeName, item.remarks].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.dots}>
                    {featured.map((_, i) => (
                      <View key={`dot-${i}`} style={[styles.dot, i === carouselIdx ? styles.dotActive : null]} />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* 分类条：已归并成固定几档 */}
              {groups.length > 0 && !searchMode ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingBottom: 8 }}
                >
                  <Pressable onPress={() => pickGroup(null)}>
                    <NightPill label="全部" active={activeGroup === null} tone="cyan" />
                  </Pressable>
                  {groups.map((g) => (
                    <Pressable key={g.key} onPress={() => pickGroup(g.key)}>
                      <NightPill
                        label={`${g.emoji} ${g.label}`}
                        active={activeGroup === g.key}
                        tone={g.anime ? 'pink' : 'violet'}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {/* 二级细分：类型（动作片/恐怖片…）、年份、月份 —— 都要细，选中即筛 */}
              {activeGroup && !searchMode
                ? (() => {
                    const g = groups.find((x) => x.key === activeGroup);
                    if (!g) return null;
                    return (
                      <View
                        style={{
                          gap: 6,
                          marginHorizontal: 12,
                          marginBottom: 8,
                          paddingVertical: 7,
                          paddingHorizontal: 4,
                          borderRadius: 14,
                          backgroundColor: 'rgba(8,12,28,0.62)',
                          borderWidth: 1,
                          borderColor: 'rgba(120,190,255,0.22)',
                        }}
                      >
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}
                        >
                          <Pressable onPress={() => pickSub(null)}>
                            <NightPill label="类型全部" active={subId === null} tone="pink" small />
                          </Pressable>
                          {g.subs.map((s) => (
                            <Pressable key={s.id} onPress={() => pickSub(s.id)}>
                              <NightPill label={s.name} active={subId === s.id} tone="pink" small />
                            </Pressable>
                          ))}
                        </ScrollView>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}
                        >
                          <Pressable onPress={() => pickYear(null)}>
                            <NightPill label="年份全部" active={yearFilter === null} tone="cyan" small />
                          </Pressable>
                          {yearOptions().map((y) => (
                            <Pressable key={y} onPress={() => pickYear(y)}>
                              <NightPill label={y} active={yearFilter === y} tone="cyan" small />
                            </Pressable>
                          ))}
                        </ScrollView>
                        {yearFilter ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}
                          >
                            <Pressable onPress={() => pickMonth(null)}>
                              <NightPill
                                label="月份全部"
                                active={monthFilter === null}
                                tone="violet"
                                small
                              />
                            </Pressable>
                            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                              <Pressable key={m} onPress={() => pickMonth(m)}>
                                <NightPill
                                  label={`${m}月`}
                                  active={monthFilter === m}
                                  tone="violet"
                                  small
                                />
                              </Pressable>
                            ))}
                          </ScrollView>
                        ) : null}
                      </View>
                    );
                  })()
                : null}
              {activeGroup && animeFilter.dropped > 0 ? (
                <View style={styles.filterNote}>
                  <Text style={{ color: night.pink, fontSize: 10.5, fontWeight: '600' }}>
                    🌸 已过滤 {animeFilter.dropped} 部混进动漫分类的真人片
                  </Text>
                </View>
              ) : null}
              {activeGroup && animeFilter.suspicious ? (
                <View style={styles.filterNote}>
                  <Text style={{ color: night.warn, fontSize: 10.5, fontWeight: '600' }}>
                    ⚠️ 这个分类里大多数其实是真人内容（采集站标错了），已按原样显示
                  </Text>
                </View>
              ) : null}

              {visibleItems.length === 0 ? (
                <View style={styles.centerBox}>
                  <Text style={{ fontSize: 32 }}>📽️</Text>
                  <Text style={[nightFont.bodyStrong, { marginTop: 10 }]}>
                    {searchMode ? '没搜到这部片' : '没有取到影片'}
                  </Text>
                  <Text style={[nightFont.small, { marginTop: 6, textAlign: 'center' }]}>
                    {searchMode
                      ? '换个关键词，或者换一个片源接口再试'
                      : '检查一下片源接口是否可用（点右上角「接口」）'}
                  </Text>
                  <Pressable onPress={goSources} style={[styles.searchBtn, { marginTop: 14, paddingHorizontal: 18 }]}>
                    <Text style={styles.searchBtnText}>去检查接口</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          }
          ListFooterComponent={
            visibleItems.length > 0 && !searchMode ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                {loadingMore ? (
                  <ActivityIndicator color={night.cyan} />
                ) : page >= pageCount ? (
                  <Text style={nightFont.small}>已经到底了</Text>
                ) : (
                  <Pressable
                    onPress={() =>
                    void load(page + 1, 'more', {
                      groupKey: activeGroup,
                      subId,
                      year: yearFilter,
                      month: monthFilter,
                    })
                  }
                    style={[styles.searchBtn, { paddingHorizontal: 20 }]}
                  >
                    <Text style={styles.searchBtnText}>加载更多</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={{ height: 24 }} />
            )
          }
        />
      )}

      {/* 接口失效弹层 */}
      {errorSheet ? (
        <View style={styles.sheetHost}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setErrorSheet(false)} />
          <View style={styles.sheetCard}>
            <Text style={nightFont.h2}>接口失效，请更换片源</Text>
            <Text style={[nightFont.small, { marginTop: 8, lineHeight: 19 }]}>
              片源接口没有返回可用数据。到「接口」页看是哪一个坏了，换成你自己的苹果CMS JSON 地址再刷新。
            </Text>
            <View style={styles.errorBox}>
              <Text style={styles.errorDetail}>{error ?? '未知错误'}</Text>
              {sourceWarnings.map((w) => (
                <Text key={w} style={styles.errorDetail}>
                  {w}
                </Text>
              ))}
            </View>
            <Pressable onPress={goSources} style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>去检查接口</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setErrorSheet(false);
                void load(1, 'refresh', { groupKey: activeGroup });
              }}
              style={[styles.clearBtn, { marginTop: 8, height: 40, justifyContent: 'center' }]}
            >
              <Text style={{ color: night.text, fontSize: 12, fontWeight: '700' }}>再试一次</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  roundBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: night.line,
    backgroundColor: night.glass,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 13,
    backgroundColor: night.glass,
    borderWidth: 1,
    borderColor: night.line,
    paddingHorizontal: 12,
    color: night.text,
    fontSize: 13,
  },
  searchBtn: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 13,
    backgroundColor: night.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: night.textOnLight, fontWeight: '800', fontSize: 12.5 },
  clearBtn: {
    paddingHorizontal: 11,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: night.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.glass,
  },
  sectionTitle: {
    ...nightFont.h2,
    fontSize: 13.5,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: night.glass,
    borderWidth: 1,
    borderColor: night.line,
    ...nightShadow.card,
  },
  featureCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: night.cardSolid,
    borderWidth: 1,
    borderColor: night.line,
    ...nightShadow.card,
  },
  featureDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,9,20,0.5)',
  },
  featurePic: { width: '100%', height: '100%' },
  featureMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(4,7,16,0.62)',
  },
  featureName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  featureSub: { fontSize: 11, color: night.textDim, marginTop: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(120,186,255,0.28)' },
  dotActive: { backgroundColor: night.cyan, width: 14 },
  filterNote: {
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,155,210,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,155,210,0.28)',
  },
  centerBox: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  posterBox: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: night.cardSolid,
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.12)',
  },
  poster: { width: '100%', height: '100%' },
  posterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: night.bgSoft,
  },
  posterFallbackText: { fontSize: 10, color: night.textFaint, marginTop: 6, textAlign: 'center' },
  posterMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 7,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: 'rgba(4,7,16,0.62)',
  },
  posterName: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  posterRemark: { fontSize: 9, color: night.textDim, marginTop: 1 },
  sheetHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3,5,12,0.7)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: night.bgSoft,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: night.line,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 26,
  },
  errorBox: {
    backgroundColor: night.glass,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: night.line,
    padding: 10,
    marginVertical: 12,
  },
  errorDetail: { fontSize: 11, color: night.textDim, lineHeight: 17 },
});
