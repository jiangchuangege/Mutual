import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { claimAudioFocus, registerAudioOwner, releaseAudioFocus, unregisterAudioOwner } from '../lib/audioFocus';
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
import { useApp } from '../store';
import { mergeProgress } from '../core/jiaojiaoFm';
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

/** 这一层在音频焦点登记表里的名字 */
const FM_OWNER = 'jiaojiao-fm';

export default function JiaojiaoFmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { store, snapshot } = useApp();

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

  const playerRef = useRef<AudioPlayer | null>(null);
  /** 已经应用过的对方操作时间戳（避免来回拉扯） */
  const syncRef = useRef(0);
  /** 换集自动跟随：默认关（防止把你的播放抢走） */
  const [autoFollow, setAutoFollow] = useState(false);

  // 音频模式：后台继续放、静音档也出声
  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    } as Parameters<typeof setAudioModeAsync>[0]).catch(() => undefined);
  }, []);

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
    void AsyncStorage.getItem(ITEMS_KEY)
      .then((raw) => {
        if (!raw) return;
        const cached = JSON.parse(raw) as FmItem[];
        if (Array.isArray(cached) && cached.length > 0) {
          setItems((prev) => (prev.length > 0 ? prev : cached));
        }
      })
      .catch(() => undefined)
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
    // 关键：把"还剩哪些条目"写回缓存，否则下次进来又读回旧数据
    void AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(keep.slice(0, 600))).catch(() => undefined);

    if (playing && !keep.some((i) => i.key === playing.key)) {
      try {
        playerRef.current?.pause();
      } catch {
        /* 忽略 */
      }
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
    const use = (list ?? allSources).filter((s) => s.enabled);
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
    const results = await Promise.all(
      use.map(async (s) => {
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
      }),
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
    dedup.sort((a, b) => b.publishedAt - a.publishedAt);
    setItems(dedup);
    // 存一份到本机：下次进页面先显示这个（不会因为网络慢就变成"还没有声音"）
    void AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(dedup.slice(0, 600))).catch(() => undefined);
    setReports(nextReports);
    setLoading(false);
    if (!dedup.length) toast.show('没拉到内容，检查一下源地址', 'warn');
  };

  /*
   * 别人（一起听的引擎、歌单试听）要出声时，FM 让路；
   * 离开页面时把原生播放器彻底释放，避免"声音还在放、界面却没有停止入口"。
   */
  useEffect(() => {
    registerAudioOwner(FM_OWNER, () => {
      try {
        playerRef.current?.pause();
      } catch {
        /* 忽略 */
      }
      setIsPlaying(false);
    });
    return () => {
      unregisterAudioOwner(FM_OWNER);
      releaseAudioFocus(FM_OWNER);
      const p = playerRef.current;
      playerRef.current = null;
      try {
        p?.pause();
        (p as unknown as { remove?: () => void })?.remove?.();
      } catch {
        /* 忽略 */
      }
    };
  }, []);

  const play = (item: FmItem) => {
    try {
      /*
       * 1) 抢音频焦点：把「一起听」暂停掉（否则两段音频叠在一起——
       *    引擎会一直在对账循环里 p.play()，光 pause FM 是没用的）。
       * 2) 换集要把旧播放器 **remove 掉**：以前只 pause，旧实例带着原生 AudioTrack
       *    一直留在内存里，来回换几次就变成多路声音 / Cannot create AudioTrack。
       */
      claimAudioFocus(FM_OWNER);
      const prev = playerRef.current;
      playerRef.current = createAudioPlayer({ uri: item.audio });
      try {
        (prev as unknown as { remove?: () => void })?.remove?.();
      } catch {
        /* 老版本没有 remove */
      }
      playerRef.current.play();
      setPlaying(item);
      setIsPlaying(true);
      // 记住"上次听的是 FM"：首页只在这次是 FM 时才自动续播
      void AsyncStorage.setItem('last_audio_surface', 'fm').catch(() => undefined);
      // 记住"上次听的是 FM"：首页只在这次是 FM 时才自动续播
      void AsyncStorage.setItem('last_audio_surface', 'fm').catch(() => undefined);
      // 记住最后播放的这条：下次打开 App 自动续播
      void AsyncStorage.setItem(
        'jfm_last_track',
        JSON.stringify({ audio: item.audio, title: item.title, album: item.album, cover: item.cover }),
      ).catch(() => undefined);
      try {
        store.pushFmProgress({ itemKey: item.key, positionSec: 0, rate: 1, playing: true });
      } catch {
        /* 离线时忽略 */
      }
    } catch {
      toast.show('这条音频播不了，可能地址失效了', 'error');
    }
  };

  const toggleFollow = () => {
    const next = !autoFollow;
    setAutoFollow(next);
    void AsyncStorage.setItem('jfm_auto_follow', next ? '1' : '0').catch(() => undefined);
    toast.show(next ? '已开启：TA 换集你这边跟着换' : '已关闭：各听各的，不互相打断');
  };

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (isPlaying) p.pause();
      else p.play();
      setIsPlaying(!isPlaying);
      if (playing) {
        try {
          store.pushFmProgress({
            itemKey: playing.key,
            positionSec: Math.max(0, Number(p.currentTime) || 0),
            rate: 1,
            playing: !isPlaying,
          });
        } catch {
          /* 离线时忽略 */
        }
      }
    } catch {
      /* 忽略 */
    }
  };

  /**
   * 一起听：盯住空间里的进度。
   * 规则和影院一致 —— 谁后操作听谁的；偏差 > 1.5 秒才强制 seek，避免两边互相拽。
   */
  useEffect(() => {
    const remote = (snapshot as unknown as {
      fmProgress?: { itemKey: string; positionSec: number; playing: boolean; role: 'A' | 'B'; updatedAt: number } | null;
    }).fmProgress;
    if (!remote || !remote.itemKey) return;
    if (remote.updatedAt <= syncRef.current) return;
    const p = playerRef.current;
    // 对方换集了：开了自动跟随便切过去，否则保持现状
    if (!playing || playing.key !== remote.itemKey) {
      if (!autoFollow) return;
      const target = items.find((i) => i.key === remote.itemKey);
      if (!target) return;
      try {
        claimAudioFocus(FM_OWNER);
        const oldP = playerRef.current;
        const np = createAudioPlayer({ uri: target.audio });
        playerRef.current = np;
        try {
          (oldP as unknown as { remove?: () => void })?.remove?.();
        } catch {
          /* 忽略 */
        }
        np.play();
        void np.seekTo(Math.max(0, remote.positionSec));
        setPlaying(target);
        setIsPlaying(remote.playing);
        return;
      } catch {
        return;
      }
    }
    if (!p) return;
    syncRef.current = remote.updatedAt;
    try {
      const cur = Number(p.currentTime) || 0;
      if (Math.abs(cur - remote.positionSec) > 1.5) void p.seekTo(remote.positionSec);
      if (remote.playing && !isPlaying) {
        p.play();
        setIsPlaying(true);
      } else if (!remote.playing && isPlaying) {
        p.pause();
        setIsPlaying(false);
      }
    } catch {
      /* 播放器还没准备好就跳过这一拍 */
    }
  }, [snapshot, playing, isPlaying]);

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
    return [...map.values()].sort((a, b) => b.latest - a.latest);
  }, [visibleItems]);

  /** 分组之后再按搜索词过滤 */
  const shownGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return albumGroups;
    return albumGroups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.items.some((i) => i.title.toLowerCase().includes(q)),
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

        {/* 源状态 */}
        <Card tone={night.glass as unknown as string}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[font.bodyStrong, { color: night.text, flex: 1 }]} numberOfLines={1}>
              收听源
            </Text>
            <Text style={{ color: night.cyan, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
              {reports.length ? healthSummary(reports) : `${allSources.length} 个`}
            </Text>
          </View>
          {/* 刷新从搜索按钮挪到这里：搜索旁边应该是搜索，不该是刷新 */}
          <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
            <Pressable onPress={() => void refresh()} hitSlop={8} style={styles.srcRefreshBtn}>
              <Text style={styles.srcRefreshText}>{loading ? '刷新中…' : '↻ 刷新'}</Text>
            </Pressable>
          </View>
          {allSources.length === 0 ? (
            <Text style={styles.hint}>还没有收听源。支持 音频直链 / 播客 RSS / 列表 JSON。</Text>
          ) : (
            allSources.map((s) => {
              const rep = reports.find((r) => r.url === s.url);
              const tone =
                !rep || rep.status === 'ok' ? night.cyan : rep.status === 'slow' ? '#FFD37A' : '#FF6B6B';
              return (
                <View key={s.id} style={styles.srcRow}>
                  <View style={[styles.dot, { backgroundColor: tone }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.srcName]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={styles.srcMeta} numberOfLines={1}>
                      {s.kind} · {rep ? `${rep.status === 'ok' ? '正常' : rep.status === 'slow' ? '慢' : '坏'} · ${rep.count} 条 · ${rep.ms}ms` : '未检测'}
                      {rep?.error ? ` · ${rep.error}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeAnySource(s)} hitSlop={8}>
                    <Text style={{ color: night.textFaint, fontSize: 12 }}>删除</Text>
                  </Pressable>
                </View>
              );
            })
          )}
          {failed.length > 0 ? (
            <Text style={[styles.hint, { color: '#FF6B6B' }]}>
              {failed.length} 个源失效，点「刷新」重试或删掉它
            </Text>
          ) : null}
          <View style={{ height: 8 }} />
          {adding ? (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="给它起个名字（可不填）"
                placeholderTextColor={night.textFaint}
                style={styles.input}
              />
              <View style={{ height: 6 }} />
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="https://…（RSS / JSON / mp3 直链）"
                placeholderTextColor={night.textFaint}
                autoCapitalize="none"
                style={styles.input}
              />
              <View style={{ height: 8 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn title="加入" small onPress={addSource} />
                <Btn title="取消" small variant="ghost" onPress={() => setAdding(false)} />
              </View>
            </>
          ) : (
            <Btn title="＋ 添加收听源" small onPress={() => setAdding(true)} />
          )}
        </Card>

        <View style={{ height: 14 }} />

        {/* 条目 */}
        {loading ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <ActivityIndicator color={night.cyan as unknown as string} />
            <Text style={styles.hint}>正在把声音拉进来…</Text>
          </View>
        ) : list.length === 0 ? (
          <Card tone={night.glass as unknown as string}>
            <Text style={[font.bodyStrong, { color: night.text }]}>焦焦FM 里还没有声音</Text>
            <Text style={styles.hint}>
              加一个收听源就能听。RSS 适合播客和有声书站，列表 JSON 适合自己整理的书单。
            </Text>
          </Card>
        ) : (
          openAlbum ? (
            <>
              <Pressable onPress={() => setOpenAlbum(null)} style={styles.backRow}>
                <Text style={styles.backRowText}>‹ 返回全部合集</Text>
              </Pressable>
              <Text style={styles.groupTitle}>
                {openAlbum} · {list.length} 集
              </Text>
              {/* 选集列表：一行一集，显示标题 + 时长；每页 20 条可翻页 */}
              {(() => {
                const pageCount = Math.max(1, Math.ceil(list.length / EP_PAGE_SIZE));
                const page = Math.min(epPage, pageCount - 1);
                const from = page * EP_PAGE_SIZE;
                const slice = list.slice(from, from + EP_PAGE_SIZE);
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
                              {it.title || `第 ${num} 集`}
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
                          第 {page + 1}/{pageCount} 页 · 共 {list.length} 集
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
               * FM_HANDOFF：进播放页之前把列表页这一路停掉，并把进度交接过去。
               * 以前直接 push：Stack 不会卸载列表页，列表页的播放器还在放，
               * 播放页又从头 createAudioPlayer → 同一集两路、带偏移地叠在一起。
               */
              const handoff = (() => {
                const p = playerRef.current;
                try {
                  return Math.max(0, Number(p?.currentTime) || 0);
                } catch {
                  return 0;
                }
              })();
              try {
                playerRef.current?.pause();
              } catch {
                /* 忽略 */
              }
              setIsPlaying(false);
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
              {playing.title}
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
