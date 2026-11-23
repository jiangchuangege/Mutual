import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { readCmsCache, writeCmsCache } from '../ui/cmsCache';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  classifyPlayable,
  fetchCmsDetail,
  findVodAcrossApis,
  parseSources,
  type CmsEpisode,
  type CmsSource,
  type CmsVod,
} from '../core/cms';
import { getCmsApiList } from '../core/cmsConfig';
import { useApp } from '../store';
import { Btn, Sheet } from '../ui/components';
import { MoviePlayer } from '../ui/MoviePlayer';
import { probeStream, type StreamProbe } from '../core/streamProbe';
import { pickLowestVariant } from '../core/lockVariant';
import { healthAgeText, loadHealthCache, saveHealthCache } from '../ui/sourceHealthCache';
import { color, radius } from '../ui/theme';
import { Ico } from '../ui/icons';
import { NightBackdrop } from '../ui/NightSky';

const DARK = {
  bg: '#141110',
  card: '#1E1A18',
  line: '#2C2622',
  text: '#F3EAE3',
  dim: '#A2928A',
  accent: '#E8836B',
};

/** 整部加入队列之后，把"真的加了几集、跳过了几集、为什么"一条话说清楚 */
function queueSummaryText(
  r: { added: number; dup: number; invalid: number; capped: number },
  notPlayable: number,
): string {
  const bits: string[] = [];
  if (r.added > 0) bits.push(`已加入 ${r.added} 集`);
  if (r.dup > 0) bits.push(`${r.dup} 集本来就在队列里（没重复加）`);
  if (r.invalid > 0) bits.push(`${r.invalid} 集地址无效`);
  if (r.capped > 0) bits.push(`${r.capped} 集超出队列上限 100`);
  if (notPlayable > 0) bits.push(`${notPlayable} 集是网页源、不能直接播`);
  if (bits.length === 0) return '队列没有变化';
  return bits.join('，');
}

export default function CinemaDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; name?: string; api?: string }>();
  const vodId = String(params.id ?? '');
  const apiHint = String(params.api ?? '');
  /*
   * 缓存键必须带上接口：vod_id 是各采集站**自己**编号的，
   * 20 个站合并成一堵墙时必然会有相同的 id。只用 vod 会互相串
   * （打开 B 站的片，显示/播放的却是上次 A 站同 id 那部）。
   */
  const vodCacheKey = `vod:${apiHint || 'any'}|${vodId}`;
  const { store, role } = useApp();

  const [vod, setVod] = useState<CmsVod | null>(null);
  /** 同一部片的所有可用源（不同接口 / 不同线路）：卡了就换一个 */
  const [sources, setSources] = useState<CmsSource[]>([]);
  const [activeSource, setActiveSource] = useState(0);
  /** 每个源的速度（手动测速后才有；进页面先读上次结果） */
  const [speedByLevel, setSpeedByLevel] = useState<Record<string, number>>({});
  const [probedAt, setProbedAt] = useState(0);
  const [probing, setProbing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posterBroken, setPosterBroken] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [episodeSheet, setEpisodeSheet] = useState(false);
  /** 选集弹窗的用途：本机播放（点了直接播） / 加入一起看队列 */
  const [sheetMode, setSheetMode] = useState<'play' | 'queue' | 'room'>('play');
  const [notice, setNotice] = useState<string | null>(null);
  /** 本片评论区：草稿 + key（优先片 id，退化成片名） */
  const [commentDraft, setCommentDraft] = useState('');
  const commentKey = vod?.id ?? vod?.name ?? vodId;
  const movieComments = store.commentsFor('movie', commentKey ?? '');

  useEffect(() => {
    let cancelled = false;
    /*
     * 先读本机缓存：上次看过的这部片，详情 + 全部播放源直接秒显示，
     * 不用再等 20 多个接口（实测要 20 秒左右）。随后后台静默刷新。
     */
    void readCmsCache<{ vod: CmsVod; sources: CmsSource[] }>(`vod:${vodCacheKey}`).then((cached) => {
      /*
       * CACHE_ID_GUARD：列表页有时拿不到源（apiHint 为空），而各站 vod_id 是各自编号、可能重复。
       * 这里再核一次 id，对不上就当没缓存，避免"点开这部片却显示另一部"。
       */
      if (cached?.value?.vod && String((cached.value.vod as { id?: string }).id ?? '') !== String(vodId)) return;
      /*
       * NO_HINT_NO_CACHE：列表页没带源时（apiHint 为空），缓存键是 `vod:any|<id>`，
       * 而各站 vod_id 各自编号、**完全可能重号**（A 站和 B 站各有 id=123 的不同片）。
       * 这时 id 校验也救不了，所以直接不吃缓存，按"主源 + id"重新抓一次 —— 一次单条请求，
       * 换来的是绝不串片。带了源的正常路径不受影响（有缓存照样秒开）。
       */
      if (!apiHint) {
        setLoading(true);
        return;
      }
      if (cancelled || !cached) return;
      if (cached.value.vod) setVod(cached.value.vod);
      if (cached.value.sources?.length) {
        setSources(cached.value.sources);
        setActiveSource(0);
      }
      setLoading(false);
    });
    const run = async () => {
      setLoading(true);
      const apis = await getCmsApiList();
      // 优先用列表页传过来的那个接口（多接口时能直接问到对的源）
      const primary = apiHint && apis.includes(apiHint) ? apiHint : apis[0];
      const result = await fetchCmsDetail(primary, vodId);
      if (cancelled) return;
      if (!result.ok || !result.vod) {
        setError(result.ok ? '没有找到这部影片' : result.error);
        setLoading(false);
        /*
         * CACHED_STILL_USABLE：本机缓存里已经有这部片和全部播放源时，
         * 不能因为这次请求超时就把整页换成「接口失效，请更换片源」——
         * 缓存里的源本来是能播的。这种情况只留一条顶部提示（见渲染层）。
         */
        return;
      }
      const main = result.vod;
      setVod(main);
      setError(null);

      // 收集这部片的所有源：本接口的多条线路 + 其它接口里同名的片
      const collected: CmsSource[] = [];
      const pushAll = (v: CmsVod) => {
        for (const src of parseSources(v.playFromRaw, v.playUrlRaw)) {
          if (src.episodes.length === 0) continue;
          collected.push({
            name: `${src.name}${v.fromLabel ? ` · ${v.fromLabel}` : ''}`,
            episodes: src.episodes,
          });
        }
      };
      pushAll(main);

      /*
       * 关键提速：**先用本接口的结果把页面画出来**。
       * 以前这里要等 findVodAcrossApis 把剩下 20 多个接口全问一遍才 setLoading(false)，
       * 只要有一个接口慢（实测有的要 20~30 秒），整页就一直"正在读取详情…"。
       * 现在：主源立刻显示，其它源在后台补（最多 6 个 + 6 秒上限），补到再追加。
       */
      setSources(collected);
      setActiveSource(0);
      setLoading(false);
      if (collected.length > 0) {
        void writeCmsCache(`vod:${vodCacheKey}`, { vod: main, sources: collected });
      }

      const others = apis.filter((a) => a !== primary).slice(0, 6);
      if (others.length > 0) {
        const extra = await Promise.race([
          findVodAcrossApis(others, main.name, 6000).catch(() => [] as CmsVod[]),
          new Promise<CmsVod[]>((resolve) => setTimeout(() => resolve([]), 6000)),
        ]);
        if (cancelled || extra.length === 0) return;
        const added: CmsSource[] = [];
        for (const o of extra) {
          if (o.fromApi === primary) continue;
          for (const src of parseSources(o.playFromRaw, o.playUrlRaw)) {
            if (src.episodes.length === 0) continue;
            added.push({
              name: `${src.name}${o.fromLabel ? ` · ${o.fromLabel}` : ''}`,
              episodes: src.episodes,
            });
          }
        }
        if (added.length > 0) {
          setSources((prev) => {
            const next = [...prev, ...added];
            // 后台补到源之后，顺手把更全的列表写回缓存
            void writeCmsCache(`vod:${vodId}`, { vod: main, sources: next });
            return next;
          });
        }
      }
    };
    if (vodId) void run();
    else {
      setError('缺少影片 id');
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [vodId, apiHint]);

  /** 当前源里的剧集；没有源时回退成空 */
  const episodes: CmsEpisode[] = useMemo(() => {
    if (sources.length > 0) return sources[Math.min(activeSource, sources.length - 1)].episodes;
    return [];
  }, [sources, activeSource]);

  /**
   * 开始播放的唯一入口：**先把 master 播放列表锁到最低码率那一档**再播。
   * 采集站 master 最高能到 9Mbps，而手机这条网只跑得动 400~1200kbps，
   * 让播放器自己自适应就会先冲高码率 → 播两秒卡一下。锁最低档是止卡的根，
   * 换源/换集/自动兜底都必须走这里。
   */
  const startPlay = useCallback(
    async (rawUrl: string, note?: string) => {
      setNotice(null);
      setPlayingUrl(null);
      const finalUrl = await pickLowestVariant(rawUrl);
      setPlayingUrl(finalUrl);
      if (note) setNotice(note);
    },
    [],
  );

  /** 当前播的是第几集（0 基）；找不到就是 0 */
  const epIndex = Math.max(
    0,
    episodes.findIndex((e) => {
      const v = classifyPlayable(e.url);
      return v.playable && v.url === playingUrl;
    }),
  );

  /**
   * 播放前自动挑"最快的线路"：
   *   - 已有测速缓存 → 直接用最快的（>=800kbps 才值得切）
   *   - 没有缓存 → 快速测前 3 个候选（每个 2.5 秒超时），挑最快的
   * 这样用户点一下就能落在 1000kbps 以上的源上，不用自己一个个试。
   */
  const pickFastestSource = useCallback(async (): Promise<{ idx: number; url: string; kbps: number } | null> => {
    const cands: Array<{ idx: number; url: string; known: number }> = [];
    sources.forEach((src, idx) => {
      const ep = src.episodes[Math.min(epIndex, Math.max(0, src.episodes.length - 1))] ?? src.episodes[0];
      const v = ep ? classifyPlayable(ep.url) : null;
      if (v && v.playable) cands.push({ idx, url: v.url, known: speedByLevel[v.url] ?? 0 });
    });
    if (cands.length === 0) return null;
    const known = cands.filter((c) => c.known > 0).sort((a, b) => b.known - a.known);
    if (known.length > 0 && known[0]!.known >= 800) {
      return { idx: known[0]!.idx, url: known[0]!.url, kbps: known[0]!.known };
    }
    const quick = await Promise.all(
      cands.slice(0, 3).map((c) =>
        probeStream(c.url, { timeoutMs: 2500 })
          .then((r) => ({ ...c, kbps: r.ok ? r.kbps : 0 }))
          .catch(() => ({ ...c, kbps: 0 })),
      ),
    );
    quick.sort((a, b) => b.kbps - a.kbps);
    const best = quick[0];
    if (!best) return { idx: cands[0]!.idx, url: cands[0]!.url, kbps: 0 };
    return { idx: best.idx, url: best.url, kbps: best.kbps };
  }, [sources, epIndex, speedByLevel]);

  const playEpisode = (ep: CmsEpisode) => {
    const verdict = classifyPlayable(ep.url);
    setEpisodeSheet(false);
    if (!verdict.playable) {
      setNotice(verdict.reason);
      return;
    }
    void (async () => {
      const best = await pickFastestSource();
      if (best && best.kbps > 0) {
        setActiveSource(best.idx);
        await startPlay(best.url, `已自动选最快线路（实测 ${Math.round(best.kbps)}kbps）`);
        return;
      }
      await startPlay(verdict.url);
    })();
  };


  /**
 * 换**播放源**（不是换集）：同一个片子在 9 个采集站上的 CDN 速度能差 10 倍
 * （实测：mdzyapi 上这部片 2500kbps，另一部只有 400kbps），
 * 所以"慢"的解法是换源，而不是往后翻集。
 * 优先保持当前集号；那个源没有这一集就从这个源里挑第一个能直接播的。
 */
  const switchToNextSource = (): boolean => {
    if (sources.length < 2) return false;
    /*
     * 先按"测过速且快"排一遍：慢源（实测 300~480kbps）换过去还是卡，
     * 只有换到快的源才有意义。没测过的源排在后面兜底。
     */
    const ranked = sources
      .map((src, idx) => {
        const ep = src.episodes.find((e) => classifyPlayable(e.url).playable);
        const url = ep ? classifyPlayable(ep.url) : null;
        const kbps = url && url.playable ? (speedByLevel[url.url] ?? 0) : 0;
        return { idx, kbps };
      })
      .filter((x) => x.idx !== activeSource)
      .sort((a, b) => b.kbps - a.kbps);
    const order = ranked.length > 0 ? ranked.map((x) => x.idx) : [];
    for (let step = 0; step < order.length; step += 1) {
      const idx = order[step];
      const kbps = ranked.find((r) => r.idx === idx)?.kbps ?? 0;
      const kbpsNote = kbps > 0 ? ` · 实测 ${Math.round(kbps)}kbps` : '';
      const src = sources[idx];
      if (!src || src.episodes.length === 0) continue;
      const same = src.episodes[Math.min(epIndex, src.episodes.length - 1)];
      const ordered = [same, ...src.episodes];
      for (const cand of ordered) {
        const verdict = classifyPlayable(cand.url);
        if (verdict.playable) {
          setActiveSource(idx);
          void startPlay(
            verdict.url,
            `已换到第 ${idx + 1} 个源（${src.name || '线路'}）${kbpsNote}`,
          );
          return true;
        }
      }
    }
    return false;
  };

  /**
   * 卡顿兜底：播放器 12 秒还没出画面 / 反复缓冲 → 自动换下一个**源**。
   * 最多试 2 次，避免在全是坏源的情况下反复跳。
   */
  const stallTries = useRef(0);
  const handleStall = useCallback(() => {
    stallTries.current += 1;
    if (stallTries.current > 2) return;
    if (!switchToNextSource()) {
      setNotice('这部片的源都很慢或者都不可用，可以稍后再试');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, activeSource, epIndex]);

  /** 缓存 key：同一部片只测一次 */
  const speedCacheKey = `detail:${vod?.id ?? ''}`;

  // 进页面只读上次测速结果，不自动测（用户要求：检测改手动）
  useEffect(() => {
    let cancelled = false;
    void loadHealthCache<StreamProbe[]>(speedCacheKey).then((cached) => {
      if (cancelled || !cached) return;
      const map: Record<string, number> = {};
      for (const r of cached.reports ?? []) {
        if (r && r.ok && r.kbps > 0) map[r.url] = r.kbps;
      }
      setSpeedByLevel(map);
      setProbedAt(cached.at);
    });
    return () => {
      cancelled = true;
    };
  }, [speedCacheKey]);

  /** 手动测速：每个源取"第一个能直接播的地址"测一下，按速度给源排序用 */
  const runSpeedTest = useCallback(async () => {
    if (sources.length === 0) return;
    setProbing(true);
    try {
      const targets = sources
        .map((src) => {
          const ep = src.episodes.find((e) => classifyPlayable(e.url).playable);
          const url = ep ? classifyPlayable(ep.url) : null;
          return url && url.playable ? url.url : null;
        })
        .filter((u): u is string => Boolean(u))
        .slice(0, 8);
      const list = await Promise.all(targets.map((u) => probeStream(u, { timeoutMs: 5000 })));
      const map: Record<string, number> = {};
      for (const r of list) if (r.ok && r.kbps > 0) map[r.url] = r.kbps;
      setSpeedByLevel(map);
      const at = Date.now();
      setProbedAt(at);
      await saveHealthCache<StreamProbe[]>(speedCacheKey, list, at);
    } finally {
      setProbing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, speedCacheKey]);

  /**
   * 「一起看（同步）」：**不再只带一集**。
   * 直接把整部剧所有能直接播的集数写进一起看队列（= 房间里的"合集"），
   * 再用第一集把房间开起来；房间里点「合集」就能选集，两个人同步看同一集。
   */
  const watchTogether = () => {
    if (!vod) return;
    const all = episodes.map((e, i) => ({ e, i, v: classifyPlayable(e.url) }));
    const playable = all.filter((x) => x.v.playable);
    const first = playable[0];
    if (!first) {
      const v0 = episodes[0] ? classifyPlayable(episodes[0].url) : null;
      setNotice(v0 && !v0.playable ? v0.reason : '这部片没有可用播放地址');
      return;
    }
    try {
      store.addWatchQueueBatch(
        playable.slice(0, 200).map((x) => ({
          title: vod.name,
          url: x.v.playable ? x.v.url : '',
          episodeIndex: x.i,
          episodeName: episodes.length > 1 ? x.e.name : '',
          api: String(params.api ?? '') || null,
          vodId: vod.id,
        })),
      );
    } catch {
      /* 入队失败也照常开房 */
    }
    /*
     * 房间的 sourceUrl 必须是**这一集在队列/接口里的那条原始地址**。
     * 之前我先测速、再把测速结果（往往是 m3u8 的子播放列表地址）当成房间源，
     * 这条地址既不在队列里、也和接口返回对不上 → 房间算不出任何候选源
     * （连「换源」按钮都不出现），一旦这条地址加载不出来就永远转圈。
     * 现在房间源永远用原始地址；挑最快/锁低码率交给播放器内部与房间的换源逻辑。
     */
    if (store.startOnlineWatch(vod.name, first.v.playable ? first.v.url : '')) {
      router.push('/room');
    }
  };

  /**
   * 开房前先挑"能跑得动"的源。
   *
   * 用户反馈："房间里的视频一直卡住"。根因是开房时用的是**列表里的第一条地址**，
   * 而这类采集站单条 CDN 实测只有 300~480kbps，片源要 1600kbps → 必卡。
   * 这里跟「本机播放」一样的策略：最多测 3 个可用地址（每个 2.5 秒超时），
   * 取实测最快的那个给房间；都测不通就退回第一条，绝不让开房失败。
   */
  const pickFastestEpisode = useCallback(async (): Promise<CmsEpisode | null> => {
    const playable = episodes.filter((e) => classifyPlayable(e.url).playable);
    if (playable.length === 0) return null;
    if (playable.length === 1) return playable[0]!;
    try {
      const probeList = playable.slice(0, 3);
      const results = await Promise.all(
        probeList.map((e) => {
          const v = classifyPlayable(e.url);
          return probeStream(v.playable ? v.url : e.url, { timeoutMs: 2500 }).catch(() => null);
        }),
      );
      let bestIdx = 0;
      let bestKbps = -1;
      results.forEach((r, i) => {
        if (r && r.ok && r.kbps > bestKbps) {
          bestKbps = r.kbps;
          bestIdx = i;
        }
      });
      if (bestKbps > 0) {
        setNotice(null);
        return probeList[bestIdx] ?? playable[0]!;
      }
    } catch {
      /* 测速失败就用第一条 */
    }
    return playable[0]!;
  }, [episodes]);

  const startRoomWith = (ep: CmsEpisode) => {    const verdict = classifyPlayable(ep.url);
    setEpisodeSheet(false);
    if (!verdict.playable) {
      setNotice(verdict.reason);
      return;
    }
    /*
     * 用户："点一起看（同步）只有第一集，电视剧只能看一集太恶心"。
     * 房间里的「合集/选集」是靠**一起看队列**里同一部剧的多条条目实现的，
     * 所以开房前先把这部片所有能直接播的集数整批塞进队列（双方共享），
     * 房间就会显示「合集 · 共 N 集」，点进去再选集，不用退出房间。
     */
    try {
      const all = episodes.map((e, i) => ({ e, i, v: classifyPlayable(e.url) }));
      const playable = all.filter((x) => x.v.playable);
      if (playable.length > 1) {
        store.addWatchQueueBatch(
          playable.slice(0, 200).map((x) => ({
            title: vod?.name ?? x.e.name,
            url: x.v.playable ? x.v.url : '',
            episodeIndex: x.i,
            episodeName: episodes.length > 1 ? x.e.name : '',
            api: String(params.api ?? '') || null,
            vodId: vod?.id ?? null,
          })),
        );
      }
    } catch {
      /* 入队失败也照常开房，至少能看这一集 */
    }
    if (store.startOnlineWatch(vod ? vod.name : ep.name, verdict.url)) {
      router.push('/room');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* 二次元背景：和影院首页同一张（自己上传的壁纸 / 影院专属壁纸），只是多压一层电影感暗角 */}
      <NightBackdrop variant="cinema" video={!playingUrl} />
      <View pointerEvents="none" style={styles.cineScrim} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>返回</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {vod?.name ?? String(params.name ?? '影片详情')}
        </Text>
        <View style={{ width: 52 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={DARK.accent} />
          <Text style={styles.dim}>正在读取详情…</Text>
        </View>
      ) : error && !vod ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 32 }}>🚫</Text>
          <Text style={styles.emptyTitle}>接口失效，请更换片源</Text>
          <Text style={styles.dim}>{error}</Text>
          <View style={{ height: 14 }} />
          <Btn title="去设置页更换片源" onPress={() => router.push('/us')} />
        </View>
      ) : !vod ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>没有找到这部影片</Text>
        </View>
      ) : (
        <>
          {/*
           * 播放器固定在标题栏下面、**不在 ScrollView 里**：
           * 视频放进滚动容器，每次滑动都要重新布局 video surface，必卡。
           * 另外把「换源」和卡顿兜底接上：源慢自动换下一个播放地址。
           */}
          {playingUrl ? (
            <View style={styles.playerDock}>
              <MoviePlayer
                url={playingUrl}
                title={vod.name}
                autoPlay
                sourceSwitcher={
                  episodes.length > 1
                    ? { label: `换源 ${activeSource + 1}/${Math.max(1, sources.length)}`, onPress: () => void switchToNextSource() }
                    : undefined
                }
                onStall={handleStall}
              />
            </View>
          ) : null}
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* 海报 + 基本信息 */}
          <View style={styles.metaRow}>
            <View style={styles.posterBox}>
              {vod.pic && !posterBroken ? (
                <Image
                  source={{ uri: vod.pic }}
                  style={styles.poster}
                  resizeMode="cover"
                  onError={() => setPosterBroken(true)}
                />
              ) : (
                <View style={styles.posterFallback}>
                  <Ico name="cinema" size="xl" />
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.name}>{vod.name}</Text>
              <Text style={styles.sub}>
                {[vod.year, vod.area, vod.typeName].filter(Boolean).join(' · ') || '—'}
              </Text>
              {vod.remarks ? <Text style={styles.remarks}>{vod.remarks}</Text> : null}
              {vod.director ? (
                <Text style={styles.field} numberOfLines={1}>
                  导演：{vod.director}
                </Text>
              ) : null}
              {vod.actor ? (
                <Text style={styles.field} numberOfLines={2}>
                  主演：{vod.actor}
                </Text>
              ) : null}
              <Text style={styles.field}>共 {episodes.length} 个播放地址</Text>
            </View>
          </View>

          {/* 操作 */}
          <View style={styles.actionRow}>
            <Btn
              title={playingUrl ? '重新选一集' : '本机播放'}
              style={{ flex: 1 }}
              onPress={() => {
                if (episodes.length === 0) {
                  setNotice('这部片没有可用播放地址');
                  return;
                }
                setSheetMode('play');
                setEpisodeSheet(true);
              }}
            />
            <Btn title="一起看（同步）" variant="dark" style={{ flex: 1 }} onPress={watchTogether} />
          </View>
          <View style={[styles.actionRow, { marginTop: 8 }]}>
            <Btn
              title="加入一起看队列"
              variant="soft"
              style={{ flex: 1 }}
              onPress={() => {
                if (episodes.length === 0) {
                  setNotice('这部片没有可用播放地址');
                  return;
                }
                setSheetMode('queue');
                setEpisodeSheet(true);
              }}
            />
            <Btn
              title="整部加入队列"
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                // 只加能直接播的地址；重复的由 addWatchQueueBatch 数出来，不再静默忽略
                const all = episodes.map((ep, idx) => ({ ep, idx, verdict: classifyPlayable(ep.url) }));
                const playable = all.filter((x) => x.verdict.playable);
                if (playable.length === 0) {
                  setNotice('这部片的所有剧集都是网页源，没法直接播，所以没法加入队列');
                  return;
                }
                const use = playable.slice(0, 200);
                const res = store.addWatchQueueBatch(
                  use.map((x) => ({
                    title: vod?.name ?? x.ep.name,
                    url: x.verdict.playable ? x.verdict.url : '',
                    episodeIndex: x.idx,
                    episodeName: episodes.length > 1 ? x.ep.name : '',
                    api: String(params.api ?? '') || null,
                    vodId: vod?.id ?? null,
                  })),
                );
                store.toast(queueSummaryText(res, all.length - playable.length), 'ok');
              }}
            />
          </View>

          {/* 简介：**始终显示**。有的采集接口不带 content，就从别的源里补；
              都补不到就把海报上的信息（年份/地区/分类/演员/状态）写成一段介绍，
              而不是整块消失让人以为没有简介 */}
          <View style={styles.contentBox}>
            <Text style={styles.sectionTitle}>简介</Text>
            {vod.content ? (
              <Text style={styles.content}>{vod.content}</Text>
            ) : (
              <>
                <Text style={styles.content}>
                  {[
                    vod.name ? `《${vod.name}》` : '',
                    vod.year ? `${vod.year} 年` : '',
                    vod.area || '',
                    vod.typeName ? `${vod.typeName}` : '',
                    vod.remarks ? `（${vod.remarks}）` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  {vod.actor ? `。主演：${vod.actor}。` : '。'}
                  {vod.director ? `导演：${vod.director}。` : ''}
                </Text>
                <Text style={[styles.dim, { textAlign: 'left', marginTop: 6 }]}>
                  这个片源没提供剧情简介（有的采集接口不返回 content）。换一个片源可能会带上。
                </Text>
              </>
            )}
          </View>

          {/* 剧集 */}
          {episodes.length > 0 ? (
            <View style={{ marginTop: 16 }}>
              {/* 多个源才显示换源；只有一个源时不出现（用户明确要求） */}
              {sources.length > 1 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.sectionTitle, { flex: 1 }]}>
                      播放源（{sources.length} 个，卡了就换一个）
                    </Text>
                    <Pressable
                      onPress={() => void runSpeedTest()}
                      disabled={probing}
                      hitSlop={8}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: DARK.accent,
                      }}
                    >
                      <Text style={{ color: DARK.accent, fontSize: 11, fontWeight: '700' }}>
                        {probing ? '测速中…' : '测速'}
                      </Text>
                    </Pressable>
                  </View>
                  {probedAt ? (
                    <Text style={[styles.dim, { marginTop: 2, textAlign: 'left' }]}>
                      上次测速：{healthAgeText(probedAt)} · 换源会优先跳到最快的那个
                    </Text>
                  ) : (
                    <Text style={[styles.dim, { marginTop: 2, textAlign: 'left' }]}>
                      还没测过速（不会自动测）：卡的话点「测速」，之后换源会按速度排序
                    </Text>
                  )}
                  <View style={styles.episodeWrap}>
                    {sources.map((src, idx) => (
                      <Pressable
                        key={`src-${src.name}-${idx}`}
                        onPress={() => {
                          setActiveSource(idx);
                          setPlayingUrl(null);
                        }}
                        style={[styles.episodeChip, idx === activeSource ? styles.sourceChipActive : null]}
                      >
                        <Text
                          style={[
                            styles.episodeText,
                            idx === activeSource ? { color: '#1A1210', fontWeight: '700' } : null,
                          ]}
                        >
                          {src.name}
                          {(() => {
                            const ep = src.episodes.find((e) => classifyPlayable(e.url).playable);
                            const v = ep ? classifyPlayable(ep.url) : null;
                            const kbps = v && v.playable ? speedByLevel[v.url] : undefined;
                            return kbps ? ` · ${Math.round(kbps)}k` : '';
                          })()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ height: 12 }} />
                </>
              ) : null}
              <Text style={styles.sectionTitle}>播放列表</Text>
              <View style={styles.episodeWrap}>
                {episodes.slice(0, 60).map((ep, idx) => {
                  const verdict = classifyPlayable(ep.url);
                  return (
                    <Pressable
                      key={`${ep.name}-${idx}`}
                      onPress={() => playEpisode(ep)}
                      style={[styles.episodeChip, verdict.playable ? null : styles.episodeChipDisabled]}
                    >
                      <Text style={[styles.episodeText, verdict.playable ? null : { color: '#7A6A62' }]}>
                        {ep.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {episodes.length > 60 ? (
                <Text style={[styles.dim, { textAlign: 'left', marginTop: 6 }]}>
                  仅展示前 60 个地址，共 {episodes.length} 个
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* 本片评论区：和别的片子各自隔离（key 用片 id/片名），也和弹幕互不干扰 */}
          <View style={styles.contentBox}>
            <Text style={styles.sectionTitle}>本片评论区</Text>
            <Text style={[styles.dim, { textAlign: 'left' }]}>
              只有你们两个人能看到；每部片的评论各自一池，不会串到别的片子里。
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <TextInput
                value={commentDraft}
                onChangeText={setCommentDraft}
                placeholder="说一句…"
                placeholderTextColor="#8A7A72"
                maxLength={200}
                style={styles.commentInput}
              />
              <View style={{ width: 8 }} />
              <Btn
                title="发送"
                small
                disabled={commentDraft.trim().length === 0 || !commentKey}
                onPress={() => {
                  if (!commentKey) return;
                  if (store.addComment('movie', commentKey, commentDraft.trim())) setCommentDraft('');
                }}
              />
            </View>
            {movieComments.length === 0 ? (
              <Text style={[styles.dim, { textAlign: 'left', marginTop: 8 }]}>还没有评论。</Text>
            ) : (
              movieComments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.commentMeta}>
                      {c.byRole === role ? '我' : 'TA'} · {new Date(c.at).toLocaleString()}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {c.byRole === role ? (
                      <Btn
                        title="删"
                        small
                        variant="ghost"
                        onPress={() => store.removeComment('movie', commentKey, c.id)}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={[styles.dim, { textAlign: 'left', marginTop: 18 }]}>
            片源由你配置的第三方接口提供，App 不存储、不托管任何视频内容；播放发生在本机播放器。
            「一起看」时双方播放同一地址，App 只同步播放/暂停/进度。
          </Text>
        </ScrollView>
        </>
      )}

      {/* 选集（居中弹窗） */}
      <Sheet
        visible={episodeSheet}
        title={
          sheetMode === 'queue'
            ? '选一集加入一起看队列'
            : playingUrl
              ? '选一集播放'
              : vod
                ? '选一集'
                : '播放地址'
        }
        onClose={() => {
          setEpisodeSheet(false);
          setSheetMode('play');
        }}
      >
        <Text style={{ fontSize: 12, color: color.inkSoft, marginBottom: 10 }}>
          {sheetMode === 'queue'
            ? '点一集把它加进「一起看队列」（已经在队列里的不会重复加），回房间点一下就能播。'
            : '标灰的地址是网页/需要解析的源，暂不支持直接播放。'}
        </Text>
        <ScrollView style={{ maxHeight: 300 }}>
          <View style={styles.episodeWrap}>
            {episodes.map((ep, idx) => {
              const verdict = classifyPlayable(ep.url);
              return (
                <Pressable
                  key={`sheet-${ep.name}-${idx}`}
                  style={[styles.episodeChip, verdict.playable ? null : styles.episodeChipDisabled]}
                  onPress={() => {
                    if (!verdict.playable) {
                      setNotice(verdict.reason);
                      return;
                    }
                    if (sheetMode === 'queue') {
                      /*
                       * 电视剧：点任意一集都把**整部**加进队列（队列里只显示成一个"合集"，
                       * 点进合集才选集）；电影才只加一条。
                       */
                      if (episodes.length > 1) {
                        const allEp = episodes.map((e2, i2) => ({ e2, i2, v2: classifyPlayable(e2.url) }));
                        const okEp = allEp.filter((x) => x.v2.playable);
                        if (okEp.length > 0) {
                          store.addWatchQueueBatch(
                            okEp.slice(0, 200).map((x) => ({
                              title: vod?.name ?? x.e2.name,
                              url: x.v2.playable ? x.v2.url : '',
                              episodeIndex: x.i2,
                              episodeName: x.e2.name,
                              api: String(params.api ?? '') || null,
                              vodId: vod?.id ?? null,
                            })),
                          );
                          setEpisodeSheet(false);
                          setSheetMode('play');
                          // 房间开着：加完直接回房间，队列里立刻能看到并点播，不用自己找路回去
                          if (store.snapshot.activeRoom) {
                            store.toast('已加入一起看队列，回房间点一下就能播', 'ok');
                            router.back();
                          }
                          return;
                        }
                      }
                      const status = store.addWatchQueue({
                        title: vod?.name ?? ep.name,
                        url: verdict.url,
                        episodeIndex: idx,
                        episodeName: episodes.length > 1 ? ep.name : '',
                        api: String(params.api ?? '') || null,
                        vodId: vod?.id ?? null,
                      });
                      // 加成功或"已经在队列里"都算处理完了，关掉弹窗；失败就留在原地让他重试
                      if (status !== 'fail') {
                        setEpisodeSheet(false);
                        setSheetMode('play');
                        if (store.snapshot.activeRoom) {
                          store.toast('已加入一起看队列，回房间点一下就能播', 'ok');
                          router.back();
                        }
                      }
                      return;
                    }
                    /*
                     * 用户："我点的本机播放，怎么进了"邀请已过期"的一起看房间？"
                     * 原因是这里以前只要磁盘上还有旧房间（哪怕已过期），点一集就把他拽进房间。
                     * 现在本机模式永远本机播；想一起看就点上面的「一起看（同步）」。
                     */
                    if (sheetMode === 'room') {
                      startRoomWith(ep);
                      return;
                    }
                    playEpisode(ep);
                  }}
                >
                  <Text style={[styles.episodeText, verdict.playable ? null : { color: '#7A6A62' }]}>
                    {ep.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={{ height: 10 }} />
        <Btn
          title={sheetMode === 'queue' ? '整部加入队列' : sheetMode === 'room' ? '用第一集开房间一起看' : '播放第一集（本机）'}
          variant="ghost"
          onPress={() => {
            if (sheetMode === 'queue') {
              const all = episodes.map((ep, idx) => ({ ep, idx, verdict: classifyPlayable(ep.url) }));
              const playable = all.filter((x) => x.verdict.playable);
              if (playable.length === 0) {
                setNotice('这部片的所有剧集都是网页源，没法直接播，所以没法加入队列');
                return;
              }
              const use = playable.slice(0, 200);
              const res = store.addWatchQueueBatch(
                use.map((x) => ({
                  title: vod?.name ?? x.ep.name,
                  url: x.verdict.playable ? x.verdict.url : '',
                  episodeIndex: x.idx,
                  episodeName: episodes.length > 1 ? x.ep.name : '',
                  api: String(params.api ?? '') || null,
                  vodId: vod?.id ?? null,
                })),
              );
              setEpisodeSheet(false);
              setSheetMode('play');
              store.toast(queueSummaryText(res, all.length - playable.length), 'ok');
              return;
            }
            const first = episodes[0];
            if (first) {
              if (sheetMode === 'room') {
                startRoomWith(first);
              } else {
                setEpisodeSheet(false);
                playEpisode(first);
              }
            }
          }}
        />
      </Sheet>

      {/* 不可播提示（居中弹窗） */}
      <Sheet visible={notice !== null} title="该源需要解析，暂不支持" onClose={() => setNotice(null)}>
        <Text style={{ fontSize: 14, color: color.inkMid, lineHeight: 21 }}>
          {notice ?? ''}
        </Text>
        <View style={{ height: 12 }} />
        <Text style={{ fontSize: 12, color: color.inkSoft }}>
          换一个直链（.m3u8 / .mp4）源即可，或者到设置页更换片源接口。
        </Text>
        <View style={{ height: 14 }} />
        <Btn title="知道了" onPress={() => setNotice(null)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  /** 播放器固定区：在标题栏下面、ScrollView 外面 */
  playerDock: { paddingHorizontal: 16, paddingTop: 8 },
  /* 详情页根容器必须透明：以前是实心黑，会把外层那张二次元壁纸整块盖住 */
  root: { flex: 1, backgroundColor: 'transparent' },
  /* 电影感压层：上深下浅的暗角，保证字压得住，又不会把壁纸糊死 */
  cineScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(9,7,13,0.66)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: DARK.line,
  },
  headerBtnText: { fontSize: 12, color: DARK.text },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: DARK.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: DARK.text, marginTop: 10 },
  dim: { fontSize: 12, color: DARK.dim, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  metaRow: {
    flexDirection: 'row',
    marginTop: 4,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(14,11,20,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  posterBox: {
    width: 108,
    aspectRatio: 2 / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: DARK.card,
  },
  poster: { width: '100%', height: '100%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#241F1C' },
  name: { fontSize: 18, fontWeight: '700', color: DARK.text },
  sub: { fontSize: 12, color: DARK.dim, marginTop: 4 },
  remarks: { fontSize: 12, color: DARK.accent, marginTop: 4 },
  field: { fontSize: 12, color: DARK.dim, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: DARK.text, marginBottom: 8 },
  contentBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(16,12,22,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  // 评论区
  commentInput: {
    flex: 1,
    backgroundColor: DARK.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: DARK.line,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: DARK.text,
    fontSize: 13,
  },
  commentRow: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DARK.line,
    paddingTop: 8,
  },
  commentMeta: { fontSize: 11, color: DARK.dim },
  commentText: { fontSize: 13, color: DARK.text, marginTop: 4, lineHeight: 20 },
  content: { fontSize: 13, color: DARK.dim, lineHeight: 21 },
  episodeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  episodeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: DARK.card,
    borderWidth: 1,
    borderColor: DARK.line,
  },
  episodeChipDisabled: { backgroundColor: '#1A1615', borderColor: '#241F1C' },
  sourceChipActive: { backgroundColor: DARK.accent, borderColor: DARK.accent },
  episodeText: { fontSize: 12, color: DARK.text },
});
