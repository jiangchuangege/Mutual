import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import {
  fmCurrentSec,
  getFmState,
  pauseFm,
  playFm,
  seekFm,
  setFmRate,
  setFmSleep,
  stopFm,
  subscribeFmEngine,
  toggleFm,
} from '../ui/fmEngine';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  detectSourceKind,
  healthSummary,
  itemKey,
  parseSource,
  type FmHealthReport,
  type FmItem,
  type FmSource,
} from '../core/jiaojiaoFm';
import { Btn, Card, useToast } from '../ui/components';
import { readCmsCache, writeCmsCache } from '../ui/cmsCache';
import { useApp } from '../store';
import { cleanEpisodeTitle, mergeProgress } from '../core/jiaojiaoFm';
import { night, nightFont } from '../ui/nightTheme';
import { color, font, radius, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { Aurora } from '../ui/Aurora';
import { Ico } from '../ui/icons';

/**
 * 焦焦FM —— 一起听书 / 故事 / 有声小说。
 *
 * 独立模块：数据只存自己的 `jfm_*`，不碰影院的队列、片源接口，也不碰电视直播的源。
 * 这一版先做「能加源 → 能拉到条目 → 能播 → 有健康状态」，双人同步下一步接。
 */
const SRC_KEY = 'jfm_sources_v1';
/** 上次拉到的条目也缓存下来：退出再进来先看到上次的合集，不用干等网络 */
const ITEMS_KEY = 'jfm_items_v1';
/**
 * FM_ITEMS_FILE_CACHE：条目同时写一份**文件缓存**（ui/cmsCache，永久、不设上限）。
 *
 * AsyncStorage 在有些机器上会写满（SQLITE_FULL），一写不进就等于没缓存，
 * 于是每次进页面都得重新下 4MB 的 RSS、解析十几秒 —— 用户反馈"每次都拉半天"。
 * 文件缓存和片库/直播同一套，写完立刻能读回来。
 */
const FM_ITEMS_CACHE_KEY = 'fm:items';

type FmItemsCache = { items: FmItem[]; at: number; sourceKey: string };

/** 这一层在音频焦点登记表里的名字 */
const FM_OWNER = 'jiaojiao-fm';

/**
 * FM 专用的深色玻璃卡。
 *
 * FM_CARD_DARK：全局 <Card> 在"用户设了自定义背景"时会被强制成白色磨砂
 * （components.tsx 里 glass 分支把 tone 压成 0.3 透明叠层），而本页文字是浅色的
 * night 主题 —— 于是「收听源状态 / 一起听提示」在自定义背景下几乎看不见。
 * 这里自己画一张深色卡，保证任何背景上都读得清。
 */
function FmCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.darkCard}>{children}</View>;
}

/**
 * 给一集列表定顺序（整页 / 合集内部都用它）。
 *
 * EP_ORDER_NO_TIME：RSS 里经常**没有 pubDate**（喜马拉雅就是这样），
 * 这时所有项时间戳都是 0，任何"按时间排"都等于没排，只会保留源站给的原始顺序；
 * 而源站又是"最新在前"的 → 片头被排到最后一集、「案3」跑到「案1」前面（用户截图）。
 * 所以：只要有时间就按时间正序；全都没时间就把原始顺序整体反过来。
 */
function orderEpisodes<T extends { publishedAt?: number; title?: string }>(items: T[]): T[] {
  /*
   * EP_SOURCE_ORDER：**完全照抄源里的顺序**，一条都不动。
   *
   * 用户原话："下次添加源后拉取到的列表，和源接口里的列表一模一样。"
   * 之前按时间/编号/上中下各种猜，结果每个专辑总有几处和源站不一样，
   * 反而让人以为"又搞反了"。现在：
   *   · 解析层不动顺序（parseRss 直接返回 XML 里的 item 次序）；
   *   · 这里也不再重排，只做一次浅拷贝（避免外部修改原数组）。
   * 想按编号排的话，源站自己已经排好了 —— 我们和它保持一致。
   */
  return items.slice();
}




/**
 * 集排序（整页和合集内部必须用同一个比较器）。
 *
 * EP_ORDER_FULL：只按时间排不够 —— 同一批「上/中/下」在 RSS 里往往时间戳相同
 * （甚至没有 pubDate），这时会退回源站给的原始顺序，而源站常常是**新的在前**，
 * 于是「下」排到「中」前面、「上」排到最后（用户截图就是这个）。
 * 现在：时间正序 → 上(1)中(2)下(3) → 原始顺序。
 */
function compareEpisodes(a: { publishedAt?: number; title?: string }, b: { publishedAt?: number; title?: string }): number {
  const at = a.publishedAt || 0;
  const bt = b.publishedAt || 0;
  if (at !== bt) return at - bt;
  const aw = partWeight(String(a.title ?? ''));
  const bw = partWeight(String(b.title ?? ''));
  return aw - bw;
}

/** 「…上 / …中 / …下」的排序权重：同一时间戳时也要保证 上→中→下 */
/**
 * 从标题里认「这是第几集」。
 *
 * EP_ORDINAL：不同专辑的发布时间顺序是乱的（有的源先发第 3 集再发第 1 集，
 * 片头还常常是后来补传的、时间戳最新），光按时间排总有一批会反。
 * 这里认几种常见写法：
 *   「…案12」「…第12集」「12-3」「12_3」→ 12 / 1203
 *   「…片头」「…序章」「…开场」→ -1（永远排最前）
 * 认不出来就给一个大数（排在编号集之后）。
 */
function epOrdinal(title: string): number {
  const s = String(title ?? '').trim();
  if (/片头|序章|开场|前言|发刊词/.test(s)) return -1;
  const pair = /(\d{1,3})\s*[-_．.]\s*(\d{1,3})/.exec(s);
  if (pair) return Number(pair[1]) * 100 + Number(pair[2]);
  const ep = /第\s*(\d{1,4})\s*[集期话]/.exec(s);
  if (ep) return Number(ep[1]);
  const an = /案\s*(\d{1,4})/.exec(s);
  if (an) return Number(an[1]);
  const head = /^(\d{1,4})\s*[_\-.．、]/.exec(s);
  if (head) return Number(head[1]);
  return 99999;
}

function partWeight(title: string): number {
  const s = String(title ?? '').replace(/\s+$/, '');
  const tail = /[（(【\[]?\s*([上中下])\s*[)）】\]]?\s*(?:集|篇|部)?$/.exec(s)?.[1];
  if (tail === '上') return 1;
  if (tail === '中') return 2;
  if (tail === '下') return 3;
  return 0;
}

export default function JiaojiaoFmScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { store, snapshot, role } = useApp();

  const [sources, setSources] = useState<FmSource[]>([]);
  const [items, setItems] = useState<FmItem[]>([]);
  const [reports, setReports] = useState<FmHealthReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<FmItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  /* FM 播放器在全局引擎（ui/fmEngine）里：这里只订阅，页面卸载也不会停声 */
  const fm = React.useSyncExternalStore(subscribeFmEngine, getFmState, getFmState);
  useEffect(() => {
    setPlaying(fm.item);
    setIsPlaying(fm.playing);
  }, [fm.item, fm.playing]);

  /** 已经应用过的对方操作时间戳（避免来回拉扯） */
  const syncRef = useRef(0);
  /** 换集自动跟随：默认关（防止把你的播放抢走） */
  const [autoFollow, setAutoFollow] = useState(false);

  // 读回"自动跟随"设置
  useEffect(() => {
    void AsyncStorage.getItem('jfm_auto_follow')
      .then((v) => setAutoFollow(v === '1'))
      .catch(() => undefined);
  }, []);

  // 读本地源
  useEffect(() => {
    void AsyncStorage.getItem(SRC_KEY)
      .then((raw) => {
        if (!raw) return;
        const list = JSON.parse(raw) as FmSource[];
        if (Array.isArray(list)) setSources(list.filter((s) => s && s.url));
      })
      .catch(() => undefined);
  }, []);

  /*
   * 进页面：先显示上次的条目，再后台刷新一次。
   * 之前这里**没有**任何自动加载 —— 所以"加完源、退出去、再进来"就变成
   * "焦焦FM 里还没有声音"，看着像没持久化（其实源还在，只是条目没恢复）。
   */
  const autoLoadRef = useRef(false);
  useEffect(() => {
    if (autoLoadRef.current) return;
    autoLoadRef.current = true;
    void readCmsCache<FmItemsCache>(FM_ITEMS_CACHE_KEY)
      .then((box) => {
        const cached = box?.value?.items;
        if (Array.isArray(cached) && cached.length > 0) {
          setItems((prev) => (prev.length > 0 ? prev : cached));
          return true;
        }
        return false;
      })
      .catch(() => false)
      .then((hit) => {
        if (hit) return;
        /* 文件缓存没有 → 退回老的 AsyncStorage 缓存（兼容老版本存下来的） */
        return AsyncStorage.getItem(ITEMS_KEY)
          .then((raw) => {
            if (!raw) return;
            const cached = JSON.parse(raw) as FmItem[];
            if (Array.isArray(cached) && cached.length > 0) {
              setItems((prev) => (prev.length > 0 ? prev : cached));
            }
          })
          .catch(() => undefined);
      })
      .finally(() => {
        // 源读回来之后，后台静默刷新一次（读不到源就什么都不做）
        void AsyncStorage.getItem(SRC_KEY)
          .then((raw) => {
            const list = raw ? (JSON.parse(raw) as FmSource[]) : [];
            const use = Array.isArray(list) ? list.filter((x) => x && x.url && x.enabled !== false) : [];
            if (use.length > 0) void refresh(use);
          })
          .catch(() => undefined);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*

  /**
   * 删除收听源：服务端共享的那份也删，**本机缓存和已加载条目一起清掉**。
   *
   * 之前只删源、没有把缓存的条目重写回去 —— 于是「合集」卡片还在（它是按条目分组出来的），
   * 重进页面缓存又把条目读回来，看起来像"删了没效果"。
   */
  const removeAnySource = (src: FmSource) => {
    try {
      store.removeFmSource(src.id);
    } catch {
      /* 离线时忽略 */
    }
    saveSources(sources.filter((x) => x.id !== src.id && x.url !== src.url));

    const keep = items.filter((i) => {
      if (i.sourceId && i.sourceId === src.id) return false;
      // 老缓存里 sourceId 可能对不上：再按合集名兜一层（服务端源的 id 与名称由用户命名）
      if (src.name && i.album && i.album.trim() === src.name.trim()) return false;
      return true;
    });
    setItems(keep);
    // 关键：把"还剩哪些条目"写回缓存，否则下次进来又读回旧数据。
    // 只写文件缓存（fm:items）—— AsyncStorage 在 Android 上是 6MB 的 SQLite 库，
    // 几条整库条目就能把它写满，然后把账号会话一起写坏（真实事故）。
    void writeCmsCache(FM_ITEMS_CACHE_KEY, {
      items: keep.slice(0, 600),
      at: Date.now(),
    } as FmItemsCache);

    if (playing && !keep.some((i) => i.key === playing.key)) {
      /* 正在放的那一集被删了：引擎里也停掉，别在后台继续响 */
      stopFm();
      setPlaying(null);
      setIsPlaying(false);
    }
    toast.show('已删除这个收听源（合集也一起清掉了）');
  };

  const saveSources = (list: FmSource[]) => {
    setSources(list);
    void AsyncStorage.setItem(SRC_KEY, JSON.stringify(list)).catch(() => undefined);
  };

  const addSource = () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      toast.show('源地址要以 http:// 或 https:// 开头');
      return;
    }
    if (sources.some((s) => s.url === u)) {
      toast.show('这个源已经加过了');
      return;
    }
    const src: FmSource = {
      id: `jfm_${Date.now().toString(36)}`,
      name: name.trim() || u.replace(/^https?:\/\//, '').slice(0, 24),
      url: u,
      kind: detectSourceKind(u),
      createdAt: Date.now(),
      enabled: true,
    };
    saveSources([src, ...sources]);
    store.addFmSource(src.name, src.url, src.kind);
    setName('');
    setUrl('');
    setAdding(false);
    toast.show('已加入焦焦FM');
    void refresh([src, ...sources]);
  };

  const removeSource = (id: string) => {
    saveSources(sources.filter((s) => s.id !== id));
    store.removeFmSource(id);
    setItems((prev) => prev.filter((i) => i.sourceId !== id));
    setReports((prev) => prev.filter((r) => !sources.find((s) => s.id === id && s.url === r.url)));
  };

  /** 拉取所有源：解析条目 + 记健康状态（0 条就算坏） */
  const refresh = async (list?: FmSource[]) => {
    /*
     * SOURCE_LIVE：refresh 必须用**当下**最全的源列表。
     * 以前用渲染闭包里的 allSources：进页面时服务端快照还没到，闭包里只有本地那 1 个源，
     * 于是只拉了 1 个源、另一个永远"未检测"，必须手动点刷新才补上。
     */
    const liveShared =
      ((store.snapshot as unknown as { fmSources?: FmSource[] }).fmSources ?? []).filter(
        (s) => s && s.url && s.enabled !== false,
      );
    const base = list ?? (liveShared.length > 0 ? liveShared : allSources);
    const use = base.filter((s) => s.enabled);
    if (!use.length) {
      setItems([]);
      setReports([]);
      return;
    }
    setLoading(true);
    /*
     * 并行拉 + 单个源 8 秒超时。
     * 之前是「一个接一个 await」，某个源卡住（不返回也不报错）整页就永远转圈——
     * 用户看到的就是「一直正在把声音拉进来」。现在最多等 8 秒。
     */
    /* 先攒着：哪个源先回来就先渲染哪个（以前要等最慢那个，页面一直转圈） */
    const liveItems: FmItem[] = [];
    const liveReports: FmHealthReport[] = [];
    const pushLive = () => {
      const seenLive = new Set<string>();
      const dedupLive = liveItems.filter((i) => (seenLive.has(i.key) ? false : (seenLive.add(i.key), true)));
      dedupLive.sort((a, b) => b.publishedAt - a.publishedAt);
      setItems(orderEpisodes(dedupLive));
      setReports([...liveReports]);
    };
    const results = await Promise.all(
      use.map((s) =>
        Promise.race([
          (async () => {
        const t0 = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const res = await fetch(s.url, { headers: { accept: '*/*' }, signal: ctrl.signal });
          const body = await res.text();
          const parsed = res.ok ? parseSource(body, s) : [];
          return {
            parsed,
            report: {
              url: s.url,
              status: (!res.ok || parsed.length === 0
                ? 'fail'
                : Date.now() - t0 > 4000
                  ? 'slow'
                  : 'ok') as FmHealthReport['status'],
              ms: Date.now() - t0,
              count: parsed.length,
              error: res.ok
                ? parsed.length
                  ? null
                  : '这个源里没有可播放的音频'
                : `HTTP ${res.status}`,
              checkedAt: Date.now(),
            } as FmHealthReport,
          };
        } catch (err) {
          return {
            parsed: [] as FmItem[],
            report: {
              url: s.url,
              status: 'fail' as const,
              ms: Date.now() - t0,
              count: 0,
              error: err instanceof Error ? err.message : String(err),
              checkedAt: Date.now(),
            } as FmHealthReport,
          };
        } finally {
          clearTimeout(timer);
        }
          })(),
          /* 兜底：无论底层卡在哪一步，9 秒后都给出结果，页面不会一直转圈 */
          new Promise<{ parsed: FmItem[]; report: FmHealthReport }>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  parsed: [],
                  report: {
                    url: s.url,
                    status: 'fail',
                    ms: 9000,
                    count: 0,
                    error: '超时（9 秒没返回）',
                    checkedAt: Date.now(),
                  } as FmHealthReport,
                }),
              9000,
            ),
          ),
        ]).then((r) => {
          liveItems.push(...r.parsed);
          liveReports.push(r.report);
          pushLive();
          return r;
        }),
      ),
    );
    const collected: FmItem[] = [];
    const nextReports: FmHealthReport[] = [];
    for (const r of results) {
      collected.push(...r.parsed);
      nextReports.push(r.report);
    }
    // 去重（同一段音频在多个源里出现只留一条）
    const seen = new Set<string>();
    const dedup = collected.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
    /*
     * EP_ORDER_ASC：集内按"播出时间正序"排。
     * 用户反馈「7 是下、5 才是上，上应该在上面」—— 以前是**倒序**（新的在前），
     * 于是「…下」排到「…上」前面。听书/连载要的是第 1 集在上，所以改成正序。
     */
    const ordered = orderEpisodes(dedup);
    setItems(ordered);
    // 存一份到本机：下次进页面先显示这个（不会因为网络慢就变成"还没有声音"）
    const cacheBox: FmItemsCache = {
      items: orderEpisodes(dedup).slice(0, 1200),
      at: Date.now(),
      sourceKey: use.map((s) => s.url).join('|'),
    };
    void writeCmsCache(FM_ITEMS_CACHE_KEY, cacheBox);
    setReports(nextReports);
    setLoading(false);
    /* 拉的过程中源列表又变多了（对方刚加了一个）：自动补一轮 */
    const newestShared =
      ((store.snapshot as unknown as { fmSources?: FmSource[] }).fmSources ?? []).filter(
        (s) => s && s.url && s.enabled !== false,
      );
    if (newestShared.length > use.length) {
      void refresh();
      return;
    }
    if (!dedup.length) {
      toast.show('没拉到内容，检查一下源地址', 'warn');
    } else {
      /*
       * 有源没抓到东西时明确说一句（用户反馈"两个源只显示一个合集"），
       * 并把是哪个源、什么原因写进那一行的状态里，不再静默少一个合集。
       */
      const broken = nextReports.filter((r) => r.status === 'fail');
      if (broken.length > 0) {
        const names = broken
          .map((r) => use.find((s) => s.url === r.url)?.name ?? r.url)
          .slice(0, 2)
          .join('、');
        toast.show(
          `${broken.length} 个源没抓到内容：${names}${broken.length > 2 ? ' 等' : ''}（点该行看原因）`,
          'warn',
        );
      }
    }
  };

  /*
   * 别人（一起听的引擎、歌单试听）要出声时，FM 让路；
   * 离开页面时把原生播放器彻底释放，避免"声音还在放、界面却没有停止入口"。
   */

  /* REFRESH_ON_FOCUS：从「收听源」页回来时，源可能已经变了，立刻重拉一遍 */
  useFocusEffect(
    React.useCallback(() => {
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  /* 回到本页：解除交接锁，并把播放页停下的位置接回来（不然会跳回进播放页之前的进度） */


  /** 对方（TA）现在的 FM 进度：只有"最后操作者是 TA"时才算 TA 的状态 */
  const partnerFm = (() => {
    const p = (
      snapshot as unknown as {
        fmProgress?: {
          itemKey: string;
          positionSec: number;
          playing: boolean;
          role: 'A' | 'B';
          updatedAt: number;
          rate: number;
        } | null;
      }
    ).fmProgress;
    return p && p.role !== role ? p : null;
  })();

  const fmtClock = (sec: number) =>
    `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

  /** 把"我现在这一秒"写进共享状态：TA 开着跟随便会跳过来 */
  const syncHere = () => {
    if (!playing) {
      toast.show('先点一集开始听，再同步', 'warn');
      return;
    }
    const at = fmCurrentSec();
    store.pushFmProgress({ itemKey: playing.key, positionSec: at, rate: fm.rate, playing: fm.playing });
    toast.show(`已同步到 ${fmtClock(at)}${autoFollow ? '' : '（提醒 TA 打开跟随）'}`);
  };

  /** 跟到 TA 那一集、那一秒（顺便把跟随打开） */
  const followPartner = () => {
    const remote = partnerFm;
    if (!remote) {
      toast.show('TA 现在没在听，先让 TA 播一下', 'warn');
      return;
    }
    const target = items.find((i) => i.key === remote.itemKey);
    if (!target) {
      toast.show('TA 听的那一集不在当前列表里（可能换了源）', 'warn');
      return;
    }
    playFm(target, { positionSec: remote.positionSec });
    if (!remote.playing) pauseFm();
    setAutoFollow(true);
    void AsyncStorage.setItem('jfm_auto_follow', '1').catch(() => undefined);
    toast.show(`已跟到 TA 的 ${fmtClock(remote.positionSec)}`);
  };

  const play = (item: FmItem) => {
    playFm(item);
    /* 一起听：告诉对方我在听这一集（进度由播放页/引擎每 500ms 续报） */
    try {
      store.pushFmProgress({ itemKey: item.key, positionSec: 0, rate: fm.rate, playing: true });
    } catch {
      /* 离线忽略 */
    }
    void AsyncStorage.setItem('last_audio_surface', 'fm').catch(() => undefined);
    void AsyncStorage.setItem(
      'jfm_last_track',
      JSON.stringify({ audio: item.audio, title: item.title, album: item.album, cover: item.cover }),
    ).catch(() => undefined);
  };

  const toggleFollow = () => {
    const next = !autoFollow;
    setAutoFollow(next);
    void AsyncStorage.setItem('jfm_auto_follow', next ? '1' : '0').catch(() => undefined);
    toast.show(next ? '已开启：TA 换集你这边跟着换' : '已关闭：各听各的，不互相打断');
  };

  /** 暂停/继续：走全局引擎（同一套状态，全 App 一致） */
  const toggle = () => {
    toggleFm();
    if (playing) {
      try {
        store.pushFmProgress({
          itemKey: playing.key,
          positionSec: fmCurrentSec(),
          rate: fm.rate,
          playing: !fm.playing,
        });
      } catch {
        /* 离线忽略 */
      }
    }
  };

  /*
   * 一起听：盯住空间里的进度（引擎在全局，页面切走也能跟着）。
   *   · 只跟**对方**的进度（remote.role === role 直接跳过）；
   *   · 对方换集 → 开了跟随便切过去；
   *   · 同集时偏差 > 2.5 秒才 seek，避免两边互相对抽、把音频拽得一直缓冲。
   */
  useEffect(() => {
    if (pathname !== '/jiaojiao-fm') return;
    const remote = (snapshot as unknown as {
      fmProgress?: {
        itemKey: string;
        positionSec: number;
        playing: boolean;
        role: 'A' | 'B';
        updatedAt: number;
      } | null;
    }).fmProgress;
    if (!remote || !remote.itemKey) return;
    if (remote.role === role) return;
    if (remote.updatedAt <= syncRef.current) return;

    if (!playing || playing.key !== remote.itemKey) {
      if (!autoFollow) return;
      const target = items.find((i) => i.key === remote.itemKey);
      if (!target) {
        toast.show('TA 听的那一集不在当前列表里，刷新一下收听源再试', 'warn');
        return;
      }
      syncRef.current = remote.updatedAt;
      playFm(target, { positionSec: remote.positionSec });
      if (!remote.playing) pauseFm();
      return;
    }

    syncRef.current = remote.updatedAt;
    if (Math.abs(fmCurrentSec() - remote.positionSec) > 2.5) seekFm(remote.positionSec);
    if (remote.playing && !fm.playing) toggleFm();
    else if (!remote.playing && fm.playing) pauseFm();
  }, [snapshot, playing, fm.playing, autoFollow, items, pathname]);

  /** 当前打开的合集名（null = 显示合集列表） */
  /** 选集分页：一页 20 条（用户要求：一行一集 + 显示标题 + 翻页） */
  const EP_PAGE_SIZE = 20;
  const [epPage, setEpPage] = useState(0);
  const [openAlbum, setOpenAlbumRaw] = useState<string | null>(null);
  /** 打开/切换合集时把页码归零，避免停在越界页 */
  const setOpenAlbum = (next: string | null) => {
    setEpPage(0);
    setOpenAlbumRaw(next);
  };

  /*
   * 源被删光时，缓存里的旧条目不能让合集继续显示（用户删了源，合集却还在）。
   * 这里以"还有没有源"为准：没有源 → 条目一律视为空，并清掉缓存。
   */
  const sharedSources = (snapshot as unknown as { fmSources?: FmSource[] }).fmSources;
  const allSources = sharedSources && sharedSources.length ? sharedSources : sources;

  const visibleItems = allSources.length === 0 ? [] : items;
  /*
   * SOURCE_WATCH：源列表一变就自动重新拉一遍。
   *
   * 真实 bug：加了第二个源（或对方加的源从服务端同步过来）之后，
   * 只有"进页面那一次" refresh 覆盖到的源有数据，新源既不抓条目也没有健康状态
   * → 界面上「2 个源却只显示 1 个合集」，另一个显示「未检测」。
   */
  const sourceKey = allSources
    .filter((s) => s.enabled)
    .map((s) => s.url)
    .join('|');
  const lastSourceKeyRef = useRef('');
  useEffect(() => {
    if (!sourceKey) return;
    if (sourceKey === lastSourceKeyRef.current) return;
    lastSourceKeyRef.current = sourceKey;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);
  useEffect(() => {
    if (allSources.length === 0 && items.length > 0) {
      setItems([]);
      void AsyncStorage.removeItem(ITEMS_KEY).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSources.length]);
  /** 按「专辑/节目名」分组：一个源 133 集 → 1 张合集卡 */
  const albumGroups = useMemo(() => {
    const map = new Map<string, { name: string; cover: string | null; items: typeof items; latest: number }>();
    for (const it of visibleItems) {
      const name = (it.album || it.author || '未命名合集').trim();
      const g = map.get(name);
      if (g) {
        g.items.push(it);
        if (it.publishedAt > g.latest) g.latest = it.publishedAt;
        if (!g.cover && it.cover) g.cover = it.cover;
      } else {
        map.set(name, { name, cover: it.cover, items: [it], latest: it.publishedAt });
      }
    }
    for (const [name, g] of map.entries()) {
      map.set(name, { ...g, items: orderEpisodes(g.items) });
    }
    return [...map.values()].sort((a, b) => b.latest - a.latest);
  }, [visibleItems]);

  /** 当前打开的合集里的条目（按播出时间正序；没有打开就是空） */
  const albumEps = React.useMemo(() => {
    if (!openAlbum) return [] as FmItem[];
    const hit = albumGroups.find((g) => g.name === openAlbum);
    return hit ? hit.items : [];
  }, [openAlbum, albumGroups]);

  /** 分组之后再按搜索词过滤 */
  const shownGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return albumGroups;
    return albumGroups.filter(
      (g) =>
      g.name.toLowerCase().includes(q) ||
      g.items.some((i) => cleanEpisodeTitle(i.title).toLowerCase().includes(q)),
    );
  }, [albumGroups, query]);

  const list = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((i) => (i.title + i.album + i.author).toLowerCase().includes(q.toLowerCase()));
  }, [items, query]);

  // 空间里的源优先（TA 加的我也能看到）；本地只是离线兜底

  const failed = reports.filter((r) => r.status === 'fail');



  return (
    <View style={[styles.root, { backgroundColor: pageBg(night.bgDeep) }]}>
      {/* 焦焦FM 用自己的专属壁纸（bg-3），和外面的背景分开 */}
      <Aurora accent="#FFD37A" which={2} useCustom={false} />
      {/*
       * FM_SCRIM：本页文字是浅色的（night 主题），壁纸太亮时「收听源状态 / 一起听提示」
       * 几乎看不见。压一层中性暗色（不是奶白，也不发黄），壁纸仍然透出来。
       */}
      <View pointerEvents="none" style={styles.scrim} />
      <ScrollView
        contentContainerStyle={{ padding: space.md, paddingTop: insets.top + 10, paddingBottom: 120 }}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>焦焦FM</Text>
            <Text style={styles.sub}>一起听故事 · 有声小说 · 播客（独立模块，和影院无关）</Text>
          </View>
          <Pressable onPress={toggleFollow} hitSlop={10} style={[styles.backBtn, { marginRight: 6 }]}>
            <Text style={styles.backText}>{autoFollow ? '跟随：开' : '跟随：关'}</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>返回</Text>
          </Pressable>
        </View>

        {/* 搜索：输入即筛（只筛已抓到的条目，不联网全库搜），按钮只负责收键盘/确认 */}
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜书名、故事名、主播"
            placeholderTextColor={night.textFaint}
            style={styles.search}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <Pressable onPress={() => Keyboard.dismiss()} style={styles.searchBtn}>
            <Text style={styles.searchBtnText}>搜索</Text>
          </Pressable>
        </View>

        {/* 收听源：只剩一行状态 + 入口，管理搬到独立页面（用户嫌这里碍眼） */}
        <Pressable
          onPress={() => router.push('/jiaojiao-fm-sources')}
          style={styles.srcBar}
        >
          <Text style={styles.srcBarDot}>🎙</Text>
          <Text style={styles.srcBarText} numberOfLines={1}>
            收听源 · {allSources.length} 个
            {reports.length
              ? ` · ${healthSummary(reports)}`
              : failed.length > 0
                ? ` · ${failed.length} 个异常`
                : ''}
          </Text>
          <Pressable onPress={() => void refresh()} hitSlop={8} style={styles.srcBarBtn}>
            <Text style={styles.srcBarBtnText}>{loading ? '刷新中…' : '刷新'}</Text>
          </Pressable>
          <Text style={styles.srcBarArrow}>›</Text>
        </Pressable>

        {/* 一起听：把进度同步给对方 / 跟到对方（用户要求 FM 也要有"同步到一样的进度"） */}
        <View style={{ height: 12 }} />
        <FmCard>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[font.bodyStrong, { color: night.text, flex: 1 }]} numberOfLines={1}>
              🎧 一起听
            </Text>
            <Text style={{ color: autoFollow ? night.cyan : night.textDim, fontSize: 11 }}>
              {autoFollow ? '跟随：开' : '跟随：关'}
            </Text>
          </View>
          <Text style={[styles.hint, { color: 'rgba(234,244,255,0.82)' }]} numberOfLines={2}>
            {partnerFm
              ? `TA 正在听「${
                  cleanEpisodeTitle(items.find((i) => i.key === partnerFm.itemKey)?.title ?? '') || '另一集'
                }」 ${fmtClock(partnerFm.positionSec)}${partnerFm.playing ? ' · 播放中' : ' · 已暂停'}`
              : 'TA 现在没在听。点「同步到这里」，TA 开着跟随就会跳到你这一秒。'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn title="↻ 同步到这里" small style={{ flex: 1 }} onPress={syncHere} />
            <Btn title="跟随 TA" small variant="soft" style={{ flex: 1 }} onPress={followPartner} />
            <Btn
              title={autoFollow ? '关跟随' : '开跟随'}
              small
              variant="ghost"
              onPress={toggleFollow}
            />
          </View>
        </FmCard>

        <View style={{ height: 14 }} />

        {/* 条目 */}
        {loading && list.length === 0 ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <ActivityIndicator color={night.cyan as unknown as string} />
            <Text style={styles.hint}>正在把声音拉进来…</Text>
          </View>
        ) : list.length === 0 ? (
          <FmCard>
            <Text style={[font.bodyStrong, { color: night.text }]}>焦焦FM 里还没有声音</Text>
            <Text style={styles.hint}>
              加一个收听源就能听。RSS 适合播客和有声书站，列表 JSON 适合自己整理的书单。
            </Text>
          </FmCard>
        ) : (
          openAlbum ? (
            <>
              <Pressable onPress={() => setOpenAlbum(null)} style={styles.backRow}>
                <Text style={styles.backRowText}>‹ 返回全部合集</Text>
              </Pressable>
              <Text style={styles.groupTitle}>
                {openAlbum} · {albumEps.length} 集
              </Text>
              {/* 选集列表：一行一集，显示标题 + 时长；每页 20 条可翻页 */}
              {(() => {
                const pageCount = Math.max(1, Math.ceil(albumEps.length / EP_PAGE_SIZE));
                const page = Math.min(epPage, pageCount - 1);
                const from = page * EP_PAGE_SIZE;
                const slice = albumEps.slice(from, from + EP_PAGE_SIZE);
                return (
                  <>
                    <View style={styles.epList}>
                      {slice.map((it, i) => {
                        const num = from + i + 1;
                        const active = playing?.key === it.key;
                        const dur =
                          it.duration > 0
                            ? `${Math.floor(it.duration / 60)}:${String(Math.floor(it.duration % 60)).padStart(2, '0')}`
                            : '';
                        return (
                          <Pressable
                            key={it.key}
                            style={[styles.epRow, active && styles.epRowOn]}
                            onPress={() => play(it)}
                          >
                            <Text style={[styles.epRowNum, active && { color: '#08111F' }]}>{num}</Text>
                            <Text
                              style={[styles.epRowTitle, active && { color: '#08111F', fontWeight: '700' }]}
                              numberOfLines={2}
                            >
                              {cleanEpisodeTitle(it.title) || `第 ${num} 集`}
                            </Text>
                            {dur ? (
                              <Text style={[styles.epRowDur, active && { color: 'rgba(8,17,31,0.7)' }]}>
                                {dur}
                              </Text>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                    {pageCount > 1 ? (
                      <View style={styles.pager}>
                        <Pressable
                          onPress={() => setEpPage(Math.max(0, page - 1))}
                          disabled={page === 0}
                          style={[styles.pagerBtn, page === 0 && styles.pagerBtnOff]}
                        >
                          <Text style={styles.pagerBtnText}>‹ 上一页</Text>
                        </Pressable>
                        <Text style={styles.pagerText}>
                          第 {page + 1}/{pageCount} 页 · 共 {albumEps.length} 集
                        </Text>
                        <Pressable
                          onPress={() => setEpPage(Math.min(pageCount - 1, page + 1))}
                          disabled={page >= pageCount - 1}
                          style={[styles.pagerBtn, page >= pageCount - 1 && styles.pagerBtnOff]}
                        >
                          <Text style={styles.pagerBtnText}>下一页 ›</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.hint}>共 {list.length} 集</Text>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            <View style={styles.grid}>
              {shownGroups.map((g) => (
                <Pressable key={g.name} style={styles.tile} onPress={() => setOpenAlbum(g.name)}>
                  {g.cover ? (
                    <Image source={{ uri: g.cover }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, styles.coverFallback]}>
                      <Ico name="fm" size="xl" />
                    </View>
                  )}
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{g.items.length} 集</Text>
                  </View>
                  <Text style={styles.tileTitle} numberOfLines={2}>
                    {g.name}
                  </Text>
                  <Text style={styles.tileMeta} numberOfLines={1}>
                    {g.items.length} 集 · 点开选集
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* 迷你播放条 */}
      {playing ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
          {playing.cover ? (
            <Image source={{ uri: playing.cover }} style={styles.barCover} />
          ) : (
            <View style={[styles.barCover, styles.coverFallback]}>
              <Ico name="fm" size="lg" />
            </View>
          )}
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              /*
               * 进播放页：**不用再暂停交接**了 —— 播放器在全局引擎里，
               * 列表页和播放页共用同一个实例，页面切换声音是连续的（不会两路叠音，也不会断）。
               * 这里只把当前进度带过去，播放页一进来就能对上。
               */
              const handoff = fmCurrentSec();
              router.push({
                pathname: '/jiaojiao-fm-player',
                params: {
                  audio: playing.audio,
                  title: playing.title,
                  album: playing.album || playing.author || '',
                  cover: playing.cover ?? '',
                  key: playing.key,
                  startSec: String(Math.round(handoff)),
                },
              });
            }}
          >
            <Text style={styles.barTitle} numberOfLines={1}>
              {cleanEpisodeTitle(playing.title)}
            </Text>
            <Text style={styles.barMeta} numberOfLines={1}>
              {playing.album || playing.author || '焦焦FM'}
            </Text>
          </Pressable>
          <Pressable onPress={toggle} hitSlop={10} style={styles.playBtn}>
            <Text style={{ color: '#08111F', fontSize: 15, fontWeight: '800' }}>
              {isPlaying ? '暂停' : '播放'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bgDeep },
  darkCard: {
    backgroundColor: 'rgba(12,20,40,0.74)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.20)',
    padding: 14,
    marginBottom: 12,
  },
  srcBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12,20,40,0.74)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.20)',
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 9,
    marginBottom: 12,
  },
  srcBarDot: { fontSize: 12, marginRight: 6 },
  srcBarText: { flex: 1, color: night.text, fontSize: 11.5 },
  srcBarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(87,248,255,0.92)',
    marginLeft: 6,
  },
  srcBarBtnText: { color: '#08111F', fontSize: 10.5, fontWeight: '800' },
  srcBarArrow: { color: night.textDim, fontSize: 16, marginLeft: 4 },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,12,24,0.42)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: night.text },
  sub: { fontSize: 11, color: night.textDim, marginTop: 3 },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backText: { color: night.text, fontSize: 12 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  search: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: night.text,
    fontSize: 13,
  },
  searchBtn: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: night.cyan,
  },
  searchBtnText: { color: '#08111F', fontWeight: '800', fontSize: 12 },
  srcRefreshBtn: {
    marginLeft: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm ?? radius.md,
    backgroundColor: 'rgba(87,248,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(87,248,255,1)',
  },
  srcRefreshText: { color: '#08111F', fontSize: 11, fontWeight: '800' },
  hint: { fontSize: 11.5, color: night.textDim, lineHeight: 18, marginTop: 6 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  srcName: { fontSize: 12.5, color: night.text, fontWeight: '700' },
  srcMeta: { fontSize: 10.5, color: night.textDim, marginTop: 1 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: night.text,
    fontSize: 12.5,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  backRow: { paddingVertical: 8 },
  backRowText: { color: night.cyan, fontSize: 12.5, fontWeight: '700' },
  groupTitle: { color: night.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  epTitle: { color: night.text, fontSize: 12.5, fontWeight: '700' },
  epMeta: { color: night.textDim, fontSize: 10.5, marginTop: 2 },
  epGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  epChip: {
    width: 56,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(12,18,34,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  epChipOn: { backgroundColor: night.cyan },
  epChipNum: { color: night.text, fontSize: 15, fontWeight: '800' },
  epChipSub: { color: night.textDim, fontSize: 9.5, marginTop: 2 },
  /** 一行一集的选集列表（用户要求：显示标题 + 一行一集 + 每页 20 条翻页） */
  epList: { marginTop: 8, gap: 6 },
  epRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(26,35,71,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.16)',
  },
  epRowOn: { backgroundColor: night.cyan, borderColor: night.cyan },
  epRowNum: { width: 30, color: night.textDim, fontSize: 12, fontWeight: '700' },
  epRowTitle: { flex: 1, color: night.text, fontSize: 13.5, lineHeight: 19 },
  epRowDur: { color: night.textFaint, fontSize: 11 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  pagerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.16)',
    backgroundColor: 'rgba(26,35,71,0.62)',
  },
  pagerBtnOff: { opacity: 0.35 },
  pagerBtnText: { color: night.cyan, fontSize: 12, fontWeight: '700' },
  pagerText: { color: night.textDim, fontSize: 11.5 },
  badge: {
    position: 'absolute',
    right: 6,
    top: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(6,10,20,0.66)',
  },
  badgeText: { color: night.cyan, fontSize: 10, fontWeight: '800' },
  tile: { width: '47.5%' },
  cover: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontSize: 12.5, color: night.text, fontWeight: '700', marginTop: 6 },
  tileMeta: { fontSize: 10.5, color: night.textDim, marginTop: 2 },
  bar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(12,18,34,0.92)',
  },
  barCover: { width: 40, height: 40, borderRadius: 10 },
  barTitle: { fontSize: 12.5, color: night.text, fontWeight: '700' },
  barMeta: { fontSize: 10.5, color: night.textDim },
  playBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: night.cyan,
  },
});
