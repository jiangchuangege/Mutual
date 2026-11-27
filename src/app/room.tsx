import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { setRoomDebug } from '../ui/roomDebug';

/**
 * 房间标题里常带集名（"不着边际的你 第01集"），而采集站里的片名是"不着边际的你"。
 * 拿带集名的标题去搜，任何接口都匹配不到 → 候选源永远只有当前这一条。
 * 这里把集名/清晰度后缀剥掉，用干净的片名去搜。
 */
function baseTitleOf(input: string): string {
  return String(input ?? '')
    .replace(/\s*(第\s*\d+\s*[集话期]|EP?\s*\d+|\d+\s*集全?)\s*$/i, '')
    .replace(/\s*[（(]?(国语|粤语|中字|中文字幕|高清|超清|蓝光|TC|HD|BD|4K)[)）]?\s*$/gi, '')
    .trim();
}
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../store';
import { DEMO_TOOLS } from '../core/buildFlags';
import { classifyPlayable, findVodAcrossApis, parseSources } from '../core/cms';
import { getCmsApiList } from '../core/cmsConfig';
import { formatCountdown, formatDuration } from '../core/time';
import { activeGroupKey, episodeLabel, groupWatchQueue } from '../core/queueView';
import { probeStream, rankStreams, type StreamProbe } from '../core/streamProbe';
import { pickLowestVariant } from '../core/lockVariant';
import { healthAgeText, loadHealthCache, saveHealthCache } from '../ui/sourceHealthCache';
import type { ReactionKind, RoomState, Role } from '../core/types';
import { Btn, Card, KeyValue, NoticeBar, Pill, useChoice, useConfirm, useToast } from '../ui/components';
import { VoiceCallCard } from '../ui/VoiceCall';
import { NightBackdrop } from '../ui/NightSky';
import { MoviePlayer } from '../ui/MoviePlayer';
import { DevicePills } from '../ui/DeviceBar';
import { color, font, radius, reactionMeta, shadow, space } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

const STATE_LABEL: Record<RoomState, string> = {
  CREATED: '房间已创建',
  WAITING_PEER: '等待 TA 加入',
  PEER_REQUESTED: '等 TA 同意加入',
  PREPARING: '片源准备',
  COUNTDOWN: '即将开始',
  PLAYING: '观影中',
  PAUSED: '已暂停',
  PEER_OFFLINE: 'TA 暂时掉线',
  WAITING_RECONNECT: '等待重连',
  ENDED: '已结束',
  RECAP: '回忆卡',
  DISSOLVED: '已解散',
  EXPIRED: '邀请已过期',
};

/** 示例片源时长（真实产品里由用户自己填，或不填） */
const DEMO_TOTAL_SEC = 90 * 60;

/** 双人头像条里的状态文案：比状态机的枚举更口语 */
function inPlaybackText(state: RoomState): string {
  if (state === 'PLAYING') return '同步播放中';
  if (state === 'PAUSED') return '一起暂停着';
  return STATE_LABEL[state];
}

const REACTIONS: ReactionKind[] = ['lol', 'scared', 'ship', 'hug'];

export default function RoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const choose = useChoice();
  const { store, snapshot, role, device } = useApp();
  const room = snapshot.activeRoom;
  const partner: Role = role === 'A' ? 'B' : 'A';

  const [draft, setDraft] = useState('');
  const [joinCode, setJoinCode] = useState('');
  /** 备用邀请码面板：默认收起，正常流程（直接申请 + 房主同意）用不上 */
  const [joinSheetOpen, setJoinSheetOpen] = useState(false);
  const [review, setReview] = useState('');
  /** 同一部片的其他可用播放源（来自配置的多个采集接口）：卡了就换一个 */
  const [alternates, setAlternates] = useState<string[]>([]);
  /** 房间里展开的是哪个合集（电视剧按合集折叠，不摊平） */
  const [queueOpen, setQueueOpen] = useState<string | null>(null);
  /** 房间内选集面板：不出房间就能选这一部剧的任意一集 */
  const [epSheet, setEpSheet] = useState(false);
  const [epOptions, setEpOptions] = useState<Array<{ name: string; url: string }>>([]);
  const epLoadingRef = useRef(false);
  /** 拉"当前这部片"的全部集数：优先用队列里的合集，其次去接口现查 */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const title = room?.movieTitle?.trim();
      if (!title) {
        setEpOptions([]);
        return;
      }
      if (epLoadingRef.current) return;
      epLoadingRef.current = true;
      const out: Array<{ name: string; url: string }> = [];
      // 队列里同一部剧的条目（最快，已经缓存过）
      const baseTitle = baseTitleOf(title);
      for (const it of snapshot.watchQueue) {
        const itBase = baseTitleOf(it.title);
        if (it.title !== title && itBase !== baseTitle) continue;
        const v = classifyPlayable(it.url);
        if (v.playable && !out.some((x) => x.url === v.url)) {
          out.push({ name: it.episodeName || `第${(it.episodeIndex ?? 0) + 1}集`, url: v.url });
        }
      }
      if (out.length === 0) {
        try {
          const apis = await getCmsApiList();
          const vods = await findVodAcrossApis(apis, baseTitle || title);
          for (const vod of vods) {
            for (const src of parseSources(vod.playFromRaw, vod.playUrlRaw)) {
              for (const ep of src.episodes) {
                const v = classifyPlayable(ep.url);
                if (v.playable && !out.some((x) => x.url === v.url)) out.push({ name: ep.name, url: v.url });
              }
              if (out.length >= 120) break;
            }
            if (out.length > 0) break;
          }
        } catch {
          /* 查不到就只显示队列里的 */
        }
      }
      epLoadingRef.current = false;
      if (!cancelled) setEpOptions(out);
    })();
  }, [room?.movieTitle]);

  // 找同一部片的其它源（多接口 / 多线路）。只有多于 1 个时才显示"换源"按钮。
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const title = room?.movieTitle?.trim();
      if (!title || !room?.sourceUrl) {
        setAlternates([]);
        return;
      }
      const urls: string[] = [room.sourceUrl];
      // ① 队列优先（本地数据，先拿到候选，再慢慢查接口）
      try {
        const qGroups = groupWatchQueue(snapshot.watchQueue);
        const qHit =
          qGroups.find((g) => g.items.some((it) => it.url === room.sourceUrl)) ??
          qGroups.find((g) => g.title && room.movieTitle.startsWith(g.title));
        for (const it of qHit?.items ?? []) {
          const qv = classifyPlayable(it.url);
          if (qv.playable && !urls.includes(qv.url)) urls.push(qv.url);
          if (urls.length >= 8) break;
        }
      } catch {
        /* 队列读不到就只靠接口 */
      }
      if (urls.length > 1 && !cancelled) setAlternates(urls.slice());
      try {
        const apis = await getCmsApiList();
        const vods = await findVodAcrossApis(apis, title);
        // ② 再去接口里补同一部片的其它源
        for (const vod of vods) {
          for (const src of parseSources(vod.playFromRaw, vod.playUrlRaw)) {
            for (const ep of src.episodes) {
              const verdict = classifyPlayable(ep.url);
              if (verdict.playable && !urls.includes(verdict.url)) urls.push(verdict.url);
              if (urls.length >= 8) break;
            }
            if (urls.length >= 8) break;
          }
          if (urls.length >= 6) break;
        }
        if (!cancelled) setAlternates(urls);
      } catch {
        if (!cancelled) setAlternates([room.sourceUrl]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [room?.movieTitle, room?.sourceUrl]);

  const roomAlternates = alternates.length > 0 ? alternates : room?.sourceUrl ? [room.sourceUrl] : [];
  /** 主控（房主）才有权换源/自动兜底 */
  const isLeader = room?.leaderRole === role;

  /*
   * 片源测速：进房间就问一遍"哪个源最快"。
   * 采集站之间的速度差好几倍，随手点到的那个经常是最慢的 —— 测完按速度排序，
   * 「换源」就永远往更快的那个切，卡顿时也能自动兜底。
   */
  const [probes, setProbes] = useState<StreamProbe[]>([]);
  const [probing, setProbing] = useState(false);
  const [probedAt, setProbedAt] = useState(0);
  const probeCacheKey = `stream:${room?.movieTitle ?? ''}`;

  /*
   * 进房间**不自动测速**（用户要求：检测改手动，别一进来就狂测）。
   * 先把上次的测速结果读出来显示，想重新测点播放器下面那个「测速」。
   */
  useEffect(() => {
    let cancelled = false;
    void loadHealthCache<StreamProbe[]>(probeCacheKey).then((cached) => {
      if (cancelled || !cached) return;
      setProbes(cached.reports ?? []);
      setProbedAt(cached.at);
    });
    return () => {
      cancelled = true;
    };
  }, [probeCacheKey]);

  /** 手动测速：点了才跑，跑完存下来给下次进房间显示 */
  const alternatesKey = roomAlternates.join('|');
  const runProbe = useCallback(async () => {
    if (roomAlternates.length === 0) return;
    setProbing(true);
    toast.show('正在测速…（最多 6 个源）', 'ok');
    try {
      const list = await Promise.all(
        roomAlternates.slice(0, 6).map((u) => probeStream(u, { timeoutMs: 5000 })),
      );
      setProbes(list);
      const at = Date.now();
      setProbedAt(at);
      await saveHealthCache<StreamProbe[]>(probeCacheKey, list, at);
      const okList = list.filter((r) => r && r.ok) as Array<{ kbps: number }>;
      if (okList.length === 0) {
        toast.show('测速完成：这些源都没测通（可能要解析），换个源或换部片', 'warn');
      } else {
        const bestOne = okList.reduce((a, b) => (b.kbps > a.kbps ? b : a));
        toast.show('测速完成：最快 ' + Math.round(bestOne.kbps) + ' kbps', 'ok');
      }
    } finally {
      setProbing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alternatesKey, probeCacheKey]);

  /**
   * 房间播放地址也先锁最低码率：master 最高 9Mbps，手机根本跑不动，
   * 让播放器自适应就会"播两秒卡一下"。解析失败就原样播，不会更差。
   */
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!room?.sourceUrl) {
      setPlayUrl(null);
      return;
    }
    /*
     * PLAY_URL_DIRECT：不再先锁"最低码率子列表"。
     * 实测部分采集站 master 里列出的低码率子列表是 404（只有唯一的 1610kbps 那档真实存在），
     * 锁到死链 → 播放器永远 0:00；而直接播 master，HLS 自己会挑能用的那档。
     * 实测当前源 2128 kbps，带宽完全够，直接把 master 交给播放器最稳。
     */
    setPlayUrl(room?.sourceUrl ?? null);
    void pickLowestVariant(room.sourceUrl).then((u) => {
      if (alive && u && u !== room?.sourceUrl) {
        // 只有解析出的子列表确实存在（长度合理）时才用它，否则保持 master
        if (room?.sourceUrl && u.length > room.sourceUrl.length + 8) setPlayUrl(u);
      }
    });
    return () => {
      alive = false;
    };
  }, [room?.sourceUrl]);

  /** 按测速结果排序后的源列表：快的在前 */
  const rankedAlternates = useMemo(
    () => rankStreams(roomAlternates, probes),
    [roomAlternates, probes],
  );
  const currentProbe = probes.find((p) => p.url === room?.sourceUrl);

  /** 换到"下一个"源：按测速排序后往后走（也就是越换越快） */
  const switchSource = () => {
    if (!room || rankedAlternates.length < 2) return;
    const idxNow = Math.max(0, rankedAlternates.indexOf(room.sourceUrl ?? ''));
    const next = rankedAlternates[(idxNow + 1) % rankedAlternates.length];
    const result = store.hub.setRoomSource(role, next, room.movieTitle);
    if (!result.ok) {
      toast.show(result.error, 'error');
      return;
    }
    const speed = probes.find((p) => p.url === next);
    toast.show(
      speed && speed.ok
        ? `已换源（实测约 ${Math.round(speed.kbps)} kbps）`
        : '已换到下一个源',
      'ok',
    );
  };

  /**
   * 卡顿兜底：播放器连续缓冲超 3 秒时触发。
   * 房主（主控）自动切到"更快的源"；非主控只提示一句，不擅自改两边一起看的片子。
   */
  const stallCount = useRef(0);
  const handleStall = useCallback(() => {
    stallCount.current += 1;
    if (!room) return;
    if (!isLeader) {
      if (stallCount.current === 1) toast.show('网络有点慢…可以让 TA 换个更快的源', 'warn');
      return;
    }
    /*
     * STALL_SWITCH_COOLDOWN：换源之后至少给 20 秒"重新起播"的时间。
     * 以前换完源又开始算卡顿，于是「换源 → 缓冲 → 再判定卡顿 → 再换源」，
     * 用户看到的就是"它自己一直在重新找源"。
     */
    const lastSwitchAt = (globalThis as any).__lastRoomSwitchAt ?? 0;
    if (Date.now() - lastSwitchAt < 20_000) return;
    if (rankedAlternates.length < 2 || stallCount.current > 4) return;
    const better = rankedAlternates.find((u) => u !== room.sourceUrl);
    if (!better) return;
    const res = store.hub.setRoomSource(role, better, room.movieTitle);
    if (res.ok) (globalThis as any).__lastRoomSwitchAt = Date.now();
    if (res.ok) {
      toast.show(`这个源太慢，已自动换源（第 ${stallCount.current} 次卡顿）`, 'warn');
    }
    // 身份要稳定：MoviePlayer 是 memo 的，回调每帧都换新会让它一直重渲染
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.sourceUrl, isLeader, rankedAlternates, store, role, toast]);

  const alternateIdx = Math.max(0, roomAlternates.indexOf(room?.sourceUrl ?? ''));

  useEffect(() => {
    if (room?.recap?.reviews[role]) setReview(room.recap.reviews[role] ?? '');
  }, [room?.recap?.reviews, role]);


  const askLeaderForAction = (action: 'play' | 'pause') => {
    void choose({
      title: '现在由 TA 控制播放',
      message:
        action === 'play'
          ? '影片由 TA 掌着进度。你可以只把自己的这次操作发给 TA 批准，也可以申请把主控交给自己。'
          : '暂停同样由 TA 掌着。只想暂停一下可以"只发这一次"，想自己掌控就申请接管。',
      icon: '⏯️',
      actions: [
        { text: '取消', value: 'cancel', variant: 'ghost' },
        { text: '只发这一次操作', value: 'once', variant: 'soft' },
        { text: '申请接管主控', value: 'lead', variant: 'primary' },
      ],
    }).then((res) => {
      if (res === 'once') store.requestAction(action);
      if (res === 'lead') store.requestLead();
    });
  };
  /*
   * 播放器的两个"引用型"入参都缓存住：
   * 房间页每秒都在 store bump，如果每次都新建数组/对象，就算播放器做了 memo 也白搭。
   */
  const danmakuList = useMemo(
    () => (room?.danmaku ?? []).map((d) => ({ id: d.id, text: d.text, mediaPosSec: d.mediaPosSec })),
    [room?.danmaku],
  );
  const playerSync = useMemo(
    () =>
      room
        ? {
            mediaState: room.mediaState,
            roomId: room.id,
            roomState: room.state,
             serverNow: snapshot.serverNowMs,
            isLeader,
            onHeartbeat: (pos: number, playing: boolean) => {
              store.hub.heartbeat(role, pos, playing);
            },
            onRequestPlayPause: (playing: boolean) => {
              askLeaderForAction(playing ? 'play' : 'pause');
            },
          }
        : null,
    // room.mediaState 是每秒刷新的对象，这里只依赖它的关键字段，避免无意义重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room?.mediaState.action, room?.mediaState.positionSec, room?.mediaState.rate, isLeader, role, store],
  );


  /*
   * WATCHDOG_DISABLED：这里原本是"8 秒没进度就自动换源"的兜底。
   * 实测它会造成自我死循环（换源→地址变→播放器重载→位置归零→再换），
   * 表现就是"一直加载不出来、总时长还一直在变"。先停用，换源只保留手动 + 真卡顿路径。
   */
  const stuckTriesRef = useRef(0);

  // 把房间播放的关键状态写到全局调试读数（我们 → 诊断 能看到）
  try {
    const shortHost = (u: string | null | undefined) =>
      (u ?? '').replace(/^https?:\/\//, '').split('/')[0] || '空';
    const shortTail = (u: string | null | undefined) => {
      const s = u ?? '';
      const k = s.lastIndexOf('/');
      return k >= 0 ? s.slice(k + 1).slice(0, 30) : s.slice(0, 30);
    };
    setRoomDebug(
      'src=' +
        shortHost(room?.sourceUrl) +
        ' [' +
        shortTail(room?.sourceUrl) +
        '] | play=' +
        shortHost(playUrl) +
        ' [' +
        shortTail(playUrl) +
        '] | 候选=' +
        rankedAlternates.length +
        ' | 已试=' +
        stuckTriesRef.current +
        ' | pos=' +
        device.player.positionSec.toFixed(1),
    );  } catch {
    /* 调试读数失败不影响播放 */
  }

  const onPressPlayPause = () => {
    const playing = room?.mediaState.action === 'play';
    if (isLeader) {
      if (playing) store.pause();
      else store.play();
    } else {
      askLeaderForAction(playing ? 'pause' : 'play');
    }
  };

  /**
   * 进房自动开播（用户："视频一直卡在 00:00 不动"）。
   *
   * 注意：**只在房间真的开演（PLAYING/PAUSED）时才补这一次 play**。
   * 以前不判状态，刚建好房间（WAITING_PEER）1.5 秒就发 play，服务端按准备门禁
   * 拒绝 → 弹「同步失败：现在不在观影中」—— 用户反馈"每次创建房间都出这个"。
   * 房间没开演时不该有人去点播放。
   */
  const autoPlayKicked = useRef<string | null>(null);
  useEffect(() => {
    if (!isLeader) return;
    const rid = room.id;
    if (autoPlayKicked.current === rid) return;
    if (room.state !== 'PLAYING' && room.state !== 'PAUSED') return; // 还没开演：别碰
    if (room.mediaState.action === 'play') {
      autoPlayKicked.current = rid;
      return;
    }
    const timer = setTimeout(() => {
      if (autoPlayKicked.current === rid) return;
      autoPlayKicked.current = rid;
      try {
        store.play();
      } catch {
        /* 发不出去就算了，用户还能手点播放 */
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.mediaState.action, isLeader]);

  const onSeek = (delta: number) => {
    const target = Math.max(0, device.player.positionSec + delta);
    if (isLeader) {
      store.seek(target);
    } else {
      void confirm({
        title: '进度由 TA 掌着',
        message: '跟随方不能直接拖进度条，否则两边会立刻不同步。申请接管主控后你就可以自由拖动。',
        icon: '🔒',
        confirmText: '申请接管主控',
      }).then((ok) => {
        if (ok) store.requestLead();
      });
    }
  };

  /* 心跳：双人头像条中间那颗心轻轻跳一下（不夸张，只在 1.00~1.18 之间） */
  const heart = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heart, { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(heart, { toValue: 0, duration: 720, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [heart]);
  const heartScale = heart.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  if (!room) {
    return (
      <View style={[styles.root, { backgroundColor: pageBg(color.bg) }, { paddingTop: insets.top + 12 }]}>
      {/* 一起看：铺同一张二次元壁纸 + 电影感暗角，别让它变回一块纯白板 */}
      <NightBackdrop variant="cinema" video={false} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill as never}>
        <View style={{ flex: 1, backgroundColor: 'rgba(8,6,12,0.62)' }} />
      </View>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[font.bodyStrong, { color: color.primaryInk }]}>‹ 返回</Text>
          </Pressable>
          <DevicePills />
        </View>
        <View style={{ padding: space.lg }}>
          <Card>
            <Text style={font.h3}>当前没有进行中的房间</Text>
            <Text style={[font.small, { marginTop: 6 }]}>
              回到影院页创建一个，或让 TA 把邀请码发给你。
            </Text>
            <View style={{ height: 12 }} />
            {/* 房间已经结束/过期被清掉时，这里能直接再开一个（会立刻生成新的邀请码） */}
            <Btn
              title="开一个新的房间（生成邀请码）"
              onPress={() => {
                if (store.startOnlineWatch('一起看电影', '')) {
                  store.toast('房间已开好，把邀请码发给 TA 就行', 'ok');
                } else {
                  store.toast('开房间失败，稍后再试', 'error');
                }
              }}
            />
            <View style={{ height: 8 }} />
            <Btn title="回到影院挑一部片看" variant="soft" onPress={() => router.replace('/cinema')} />
          </Card>
        </View>
      </View>
    );
  }

  const m = device.metrics;
  const countdown = room.countdownEndsAt
    ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
    : 0;
  const pct = Math.min(1, Math.max(0, device.player.positionSec / DEMO_TOTAL_SEC));
  const savedReview = (room.recap?.reviews?.[role] ?? null) as string | null;
  const partnerReview = (room.recap?.reviews?.[partner] ?? null) as string | null;
  const recentDanmaku = [...room.danmaku].slice(-3).reverse();
  const inPlayback = room.state === 'PLAYING' || room.state === 'PAUSED';
  const driftTone =
    Math.abs(m.drift) <= 0.6 ? color.ok : Math.abs(m.drift) <= 1.5 ? color.butter : color.danger;


  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }, { paddingTop: insets.top + 8 }]}>
      <NightBackdrop variant="cinema" video={false} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8,6,12,0.62)' }} />
      {/*
       * 房间头部：玻璃胶囊 + 双人头像条。
       * 用户要求「这个房间内的 UI 全面升级、更浪漫」——原来是一个白底纯文字标题栏，
       * 完全没有"两个人一起看电影"的感觉。现在是：
       *   返回圆钮 · 「今晚一起看 EYEBROW」 · 片名 · 状态胶囊 · 设备胶囊
       *   下面一条双人头像条：我的头像 💞 TA 的头像 + 同步状态（心跳微微跳）
       */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backInk}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerEyebrow}>今晚一起看</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {room.state === 'RECAP' || room.state === 'ENDED' ? room.recap?.movieTitle ?? room.movieTitle : room.movieTitle}
          </Text>
          <View style={styles.headerStatePill}>
            <View style={styles.headerStateDot} />
            <Text style={styles.headerStateText}>{STATE_LABEL[room.state]}</Text>
          </View>
        </View>
        <DevicePills />
      </View>

      {/* 双人头像条：谁在陪你看、同步到什么程度，一眼就看到 */}
      <View style={styles.duoBar}>
        <View style={[styles.duoAvatar, styles.duoAvatarMine]}>
          <Text style={styles.duoAvatarInk}>{snapshot.members[role].avatar || '🐰'}</Text>
        </View>
        <Animated.Text style={[styles.duoHeart, { transform: [{ scale: heartScale }] }]}>💞</Animated.Text>
        <View style={[styles.duoAvatar, styles.duoAvatarPeer]}>
          <Text style={styles.duoAvatarInk}>{snapshot.members[partner].avatar || '🐻'}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.duoText} numberOfLines={1}>
            {snapshot.members[partner].online ? 'TA 正在和你一起看' : 'TA 暂时不在线'}
          </Text>
          <Text style={styles.duoSub} numberOfLines={1}>
            {/* 主控这里不要显示"偏差"：那个数字是本机模拟设备的指标，主控看了只会以为出错
                （用户截图：主控右上角挂着 -192.45s，吓人）。真正的偏差在播放器里那颗胶囊上 */}
            {isLeader ? '你在掌着进度' : '跟着 TA 的进度'} · {inPlaybackText(room.state)}
          </Text>
        </View>
      </View>

      {/*
       * 播放器固定在标题栏下面、**不在 ScrollView 里**。
       * 之前它被放在 ScrollView 中间，每次上下滑动都要重新布局那块 video surface，
       * 加上房间页每秒都在 store bump（心跳/同步），表现就是"一进房间就卡、
       * 越滑越卡"。视频和滚动容器天生不兼容，分开就好了。
       */}
      {/* ENDED_LEAVES_PLAYER：房间结束（ENDED/RECAP/DISSOLVED）后直接把播放器摘掉，
          以前只是"暂停"，某些源暂停完还会自己续播，用户看到"点了结束它还在放" */}
      {room.sourceUrl &&
      room.state !== 'ENDED' &&
      room.state !== 'RECAP' &&
      room.state !== 'DISSOLVED' ? (
        <View style={styles.playerDock}>
          {/* 播放器外面套一圈"电影票根"外框：玫瑰色柔光 + 胶片齿孔，别再是块黑砖 */}
          <View style={styles.playerShell}>
            <LinearGradient
              colors={['rgba(232,131,107,0.55)', 'rgba(179,164,224,0.35)', 'rgba(232,131,107,0.55)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playerShellGlow}
            />
            <View style={styles.playerInner}>
              {playUrl ? null : (
                <Text style={styles.pickingLine}>正在选择线路…</Text>
              )}
              <MoviePlayer
                url={playUrl ?? room.sourceUrl}
                title={room.movieTitle}
                rate={room.mediaState.rate}
                onRateChange={(r) => store.setPlaybackRate(r)}
                sourceSwitcher={
                  rankedAlternates.length > 1
                    ? {
                        label: probing
                          ? `换源 ${alternateIdx + 1}/${rankedAlternates.length} · 测速中`
                          : `换源 ${alternateIdx + 1}/${rankedAlternates.length}`,
                        onPress: switchSource,
                      }
                    : undefined
                }
                danmaku={danmakuList}
                onSeek={(sec) => store.seekRoom(sec)}
                onPosition={(pos, playing) => store.syncDevicePosition(pos, playing)}
                /* 同步已恢复：跟随端的"被拽回 0:00"由 MoviePlayer 里的 SYNC_NO_ZERO_PULL 兜住 */
                sync={playerSync ?? undefined}
                onStall={handleStall}
                onError={(msg) => toast.show(msg, 'error')}
              />
            </View>
            {/* 上下两条胶片齿孔：让这块区域像"正在放映"的电影票 */}
            <View style={styles.filmEdgeTop} pointerEvents="none">
              {Array.from({ length: 16 }).map((_, i) => (
                <View key={`ft-${i}`} style={styles.filmHole} />
              ))}
            </View>
            <View style={styles.filmEdgeBottom} pointerEvents="none">
              {Array.from({ length: 16 }).map((_, i) => (
                <View key={`fb-${i}`} style={styles.filmHole} />
              ))}
            </View>
          </View>
          {/* 房间内选集 + 加片：玻璃小胶囊，不再是一排白按钮 */}
          <View style={styles.playerTools}>
            <Pressable onPress={() => setEpSheet((v) => !v)} style={styles.toolChip}>
              <Text style={styles.toolChipInk}>
                {epOptions.length > 0 ? `🎞 选集 · ${epOptions.length} 集` : '🎞 选集'}
              </Text>
            </Pressable>
            <Pressable onPress={() => router.push('/cinema-library')} style={styles.toolChip}>
              <Text style={styles.toolChipInk}>＋ 加一部片</Text>
            </Pressable>
            <Pressable
              onPress={() => void runProbe()}
              disabled={probing || rankedAlternates.length < 2}
              style={[styles.toolChip, probing ? { opacity: 0.5 } : null]}
            >
              <Text style={styles.toolChipInk}>{probing ? '测速中…' : '测速'}</Text>
            </Pressable>
          </View>
          {epSheet ? (
            <View style={styles.episodeWrap}>
              {epOptions.length === 0 ? (
                <Text style={[font.tiny, { color: color.inkSoft }]}>这部片暂时没解析到其他集数</Text>
              ) : (
                epOptions.map((ep, i) => (
                  <Pressable
                    key={`rmep-${ep.url}-${i}`}
                    style={styles.episodeChip}
                    onPress={() => {
                      const res = store.hub.setRoomSource(role, ep.url, room.movieTitle);
                      if (res.ok) {
                        /*
                         * 选集属于"换片"，不是"换源"：不把进度归零的话，
                         * 用户点第 2 集会直接从上一集的 40:00 开始播（甚至超出时长）。
                         */
                        store.seekRoom(0);
                        setEpSheet(false);
                        toast.show(`已切到 ${ep.name}`, 'ok');
                      } else {
                        toast.show(res.error, 'error');
                      }
                    }}
                  >
                    <Text style={styles.episodeText}>{ep.name}</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
          {/* 上次测速结果：只做一行淡提示，按钮已经在上面的胶囊里了 */}
          <Text style={styles.probeHint} numberOfLines={1}>
            {probing
              ? '正在测速…'
              : probedAt
                ? `上次测速：${healthAgeText(probedAt)}${
                    currentProbe?.ok ? ` · 当前源约 ${Math.round(currentProbe.kbps)} kbps` : ''
                  }`
                : '卡的话点一下「测速」，会按速度重新排线路'}
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 一起看队列：从片库挑进来的片子，点一下直接播 */}
            
      {snapshot.watchQueue.length > 0 || true ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionEyebrow}>TONIGHT&apos;S LIST</Text>
                    <Text style={styles.sectionTitle}>今晚的片单</Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeInk}>{snapshot.watchQueue.length}</Text>
                  </View>
                  <View style={{ width: 6 }} />
                  <Pressable onPress={() => router.push('/cinema-queue')} hitSlop={8} style={styles.ghostChip}>
                    <Text style={styles.ghostChipInk}>全部</Text>
                  </Pressable>
                  <View style={{ width: 6 }} />
                  <Pressable onPress={() => store.clearWatchQueue()} hitSlop={8} style={styles.ghostChip}>
                    <Text style={styles.ghostChipInk}>清空</Text>
                  </Pressable>
                </View>
                <Text style={styles.sectionHint}>
                  电视剧按合集折叠；点合集展开选集，点某一集立刻换片。
                </Text>
                <View style={{ marginTop: 12 }}>
                  {groupWatchQueue(snapshot.watchQueue).map((group, gi) => {
                    const open = queueOpen === group.key;
                    const isPlaying = activeGroupKey(snapshot.watchQueue, room.sourceUrl) === group.key;
                    const first = group.items[0];
                    return (
                      <View key={group.key} style={styles.queueItem}>
                        <View style={styles.queueRow}>
                          <View style={[styles.queueIndex, isPlaying ? styles.queueIndexOn : null]}>
                            <Text style={[styles.queueIndexInk, isPlaying ? styles.queueIndexInkOn : null]}>
                              {isPlaying ? '▶' : gi + 1}
                            </Text>
                          </View>
                          <Pressable
                            style={{ flex: 1 }}
                            onPress={() => {
                              if (!group.series) {
                                store.playFromQueue(first.id);
                                return;
                              }
                              setQueueOpen(open ? null : group.key);
                            }}
                          >
                            <Text
                              style={[styles.queueTitle, isPlaying ? { color: color.primaryInk } : null]}
                              numberOfLines={1}
                            >
                              {group.title}
                            </Text>
                            <Text style={styles.queueMeta}>
                              {group.series ? `合集 · 共 ${group.items.length} 集` : '单片 · 点一下播'}
                              {group.series ? ` · ${open ? '点这里收起' : '点这里选集'}` : ''}
                            </Text>
                          </Pressable>
                          {group.series ? (
                            <Pressable
                              onPress={() => setQueueOpen(open ? null : group.key)}
                              style={styles.episodeChip}
                            >
                              <Text style={styles.episodeText}>
                                {open ? '收起' : `选集 ${group.items.length}`}
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => store.removeWatchQueue(first.id)}
                              hitSlop={8}
                              style={styles.ghostChip}
                            >
                              <Text style={styles.ghostChipInk}>移除</Text>
                            </Pressable>
                          )}
                        </View>
                        {group.series && open
                          ? group.items.map((item) => {
                              const playing = room.sourceUrl === item.url;
                              return (
                                <View key={item.id} style={styles.queueEpRow}>
                                  <Pressable
                                    style={[
                                      styles.episodeChip,
                                      playing ? { backgroundColor: '#E8836B', borderColor: '#E8836B' } : null,
                                    ]}
                                    onPress={() => store.playFromQueue(item.id)}
                                  >
                                    <Text
                                      style={[styles.episodeText, playing ? { color: '#2A0F08' } : null]}
                                    >
                                      {(playing ? '▶ ' : '') + episodeLabel(item)}
                                    </Text>
                                  </Pressable>
                                  <Pressable
                                    hitSlop={8}
                                    onPress={() => store.removeWatchQueue(item.id)}
                                    style={{ paddingHorizontal: 6 }}
                                  >
                                    <Text style={styles.queueMeta}>移除</Text>
                                  </Pressable>
                                </View>
                              );
                            })
                          : null}
                      </View>
                    );
                  })}
                </View>
                <View style={{ height: 12 }} />
                <Pressable onPress={() => router.push('/cinema-library')} style={styles.wideSoftBtn}>
                  <Text style={styles.wideSoftBtnInk}>在房间里挑片 · 去在线片库</Text>
                </Pressable>
              </Card>
            ) : (
              // 空队列也给一张卡：用户反馈"在房间里没法直接选片加进来"
              <Card>
                <Text style={font.bodyStrong}>一起看队列还是空的</Text>
                <Text style={[font.tiny, { marginTop: 4, lineHeight: 18 }]}>
                  不用退出房间：点下面的按钮进在线片库挑一部，详情页点「加入一起看队列」或「整部加入队列」，
                  回来点那一条就换片（房间不会解散，评分和短评都还在）。
                </Text>
                <View style={{ height: 10 }} />
                <Btn
                  title="在房间里挑片（去在线片库）"
                  onPress={() => router.push('/cinema-library')}
                />
              </Card>
            )}

            
{/* ---------------- 主控待处理请求 ---------------- */}
        {isLeader && room.pendingLeadRequest ? (
          <NoticeBar
            tone={tint(color.butterSoft)}
            ink={color.careInk}
            icon="🤝"
            text={`${snapshot.members[room.pendingLeadRequest].name} 申请接管主控`}
          />
        ) : null}
        {isLeader && room.pendingLeadRequest ? (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.md }}>
            <Btn title="同意" small style={{ flex: 1 }} onPress={() => store.grantLead()} />
            <Btn title="拒绝" small variant="ghost" style={{ flex: 1 }} onPress={() => store.denyLead()} />
          </View>
        ) : null}

        {isLeader && room.pendingAction ? (
          <>
            <NoticeBar
              tone={tint(color.skySoft)}
              ink={color.inkMid}
              icon="▶️"
              text={`${snapshot.members[room.pendingAction.role].name} 想${
                room.pendingAction.action === 'play' ? '播放' : '暂停'
              }这一次`}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.md }}>
              <Btn title="同意" small style={{ flex: 1 }} onPress={() => store.grantAction()} />
              <Btn title="拒绝" small variant="ghost" style={{ flex: 1 }} onPress={() => store.denyAction()} />
            </View>
          </>
        ) : null}

        {/* ---------------- 邀请阶段（不再需要邀请码：直接申请 + 房主同意） ---------------- */}
        {(room.state === 'CREATED' ||
          room.state === 'WAITING_PEER' ||
          room.state === 'PEER_REQUESTED' ||
          room.state === 'EXPIRED') && (
          <>
            {room.leaderRole !== role ? (
              room.peerJoinedAt !== null ? (
                <Card tone={tint(color.mintSoft)}>
                  <Text style={[font.bodyStrong, { color: color.ok }]}>你已经在房间里了</Text>
                  <Text style={[font.small, { marginTop: 4 }]}>
                    等两边都点「准备好了」就会倒计时开始；片源各自打开，App 只同步进度。
                  </Text>
                </Card>
              ) : room.joinRequestedBy === role ? (
                <Card tone={tint(color.butterSoft)}>
                  <Text style={[font.bodyStrong, { color: color.careInk }]}>
                    已申请加入，等 TA 点同意
                  </Text>
                  <Text style={[font.small, { marginTop: 4 }]}>不用邀请码，TA 点一下就进来了。</Text>
                </Card>
              ) : (
                <Card tone={tint(color.mintSoft)}>
                  <Text style={[font.bodyStrong, { color: color.ok }]}>TA 开着房间等你</Text>
                  <Text style={[font.small, { marginTop: 4 }]}>
                    {room.movieTitle} · 点「加入房间」申请，TA 同意后自动进房。
                  </Text>
                  <Btn
                    title="加入房间"
                    small
                    style={{ marginTop: 10 }}
                    onPress={() => store.requestJoinRoom()}
                  />
                </Card>
              )
            ) : room.joinRequestedBy && room.joinRequestedBy !== role ? (
              <Card tone={tint(color.butterSoft)}>
                <Text style={[font.bodyStrong, { color: color.careInk }]}>TA 想进你的房间</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn
                    title="同意 TA 进来"
                    small
                    style={{ flex: 1 }}
                    onPress={() => store.approveJoinRoom()}
                  />
                  <Btn
                    title="拒绝"
                    small
                    variant="ghost"
                    style={{ flex: 1 }}
                    onPress={() => store.declineJoinRoom()}
                  />
                </View>
              </Card>
            ) : (
              <Card>
                <Text style={[font.bodyStrong]}>房间开着，等 TA 申请</Text>
                <Text style={[font.small, { marginTop: 4 }]}>
                  TA 的「影院 / 一起看电影」页会直接看到这个房间，点「加入」后你这边会收到同意请求。
                </Text>
                <Text style={[font.tiny, { marginTop: 8 }]}>
                  房间 #{room.code} · 剩余 {formatCountdown(room.expireAt - Date.now())}
                </Text>
              </Card>
            )}

            {/* 备用：确实要手写邀请码时再展开 */}
            <Btn
              title={joinSheetOpen ? '收起邀请码' : '改用邀请码（备用）'}
              small
              variant="ghost"
              onPress={() => setJoinSheetOpen((v) => !v)}
            />
            {joinSheetOpen ? (
              <Card>
                <Text style={[font.tiny, { textAlign: 'center', marginBottom: 4 }]}>
                  邀请码（一般不需要）
                </Text>
                <Text style={styles.bigCode}>{room.state === 'EXPIRED' ? '------' : room.code}</Text>
                <Text style={[font.small, { textAlign: 'center' }]}>
                  {room.state === 'EXPIRED'
                    ? '邀请已过期，请重新生成'
                    : `剩余 ${formatCountdown(room.expireAt - Date.now())} · 第 ${room.codeVersion} 版`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <Btn
                    title="重新生成"
                    small
                    variant="ghost"
                    style={{ flex: 1 }}
                    onPress={() => store.regenerateRoomCode()}
                  />
                  <Btn
                    title="延长 30 分钟"
                    small
                    variant="ghost"
                    style={{ flex: 1 }}
                    onPress={() => store.extendRoomCode()}
                  />
                </View>
                {room.leaderRole !== role && room.peerJoinedAt === null ? (
                  <>
                    <View style={{ height: 10 }} />
                    <TextInput
                      value={joinCode}
                      onChangeText={setJoinCode}
                      placeholder="6 位数字"
                      placeholderTextColor={color.inkFaint}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={styles.joinInput}
                    />
                    <View style={{ height: 10 }} />
                    <Btn
                      title="用这个码加入"
                      onPress={() => {
                        if (store.joinRoomByCode(joinCode)) setJoinCode('');
                      }}
                    />
                  </>
                ) : null}
              </Card>
            ) : null}

            <Card tone={surf('alt')}>
              <Text style={[font.tiny, { marginBottom: 6 }]}>房间状态机</Text>
              <KeyValue k="当前状态" v={room.state} />
              <KeyValue k="房号" v={`#${room.code}`} />
              <KeyValue k="容量" v="2（第 3 人无法加入）" />
            </Card>
          </>
        )}

        {/* ---------------- 片源准备 ---------------- */}
        {room.state === 'PREPARING' && (
          <>
            <Card>
              <Text style={font.h3}>各自打开你自己的片源</Text>
              <Text style={[font.small, { marginTop: 6 }]}>
                合规说明：我们不提供片源、不托管视频、不提供任何链接。请用你合法持有的片源。
              </Text>
              <View style={{ marginTop: 10 }}>
                {['本机文件 / 下载好的离线片源', '你自己常用的视频 App', '实体碟片转存到本机'].map((t) => (
                  <View key={t} style={styles.tipRow}>
                    <Text style={{ fontSize: 12, color: color.mint }}>✓</Text>
                    <Text style={[font.small, { marginLeft: 8 }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card>
              <Text style={[font.tiny, { marginBottom: 8 }]}>双方准备状态</Text>
              <KeyValue
                k={`${snapshot.members[role].name}（我）`}
                v={room.readiness[role] ? '✅ 已就绪' : '⏳ 未就绪'}
              />
              <KeyValue
                k={snapshot.members[partner].name}
                v={room.readiness[partner] ? '✅ 已就绪' : '⏳ 未就绪'}
              />
              <View style={{ height: 12 }} />
              <Btn
                title={room.readiness[role] ? '已准备好' : '我已准备好'}
                disabled={room.readiness[role]}
                onPress={() => store.setReady()}
              />
              <View style={{ height: 8 }} />
              <Btn title="催一下 TA" small variant="ghost" onPress={() => store.nudgePartner()} />
            </Card>

            <Card>
              <Text style={font.bodyStrong}>片源偏移</Text>
              <Text style={[font.small, { marginTop: 4 }]}>
                两边片头长度不一样时，用这里的偏移手动对齐。当前：{room.mediaOffset[role]} 秒
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Btn title="− 5s" small variant="ghost" style={{ flex: 1 }} onPress={() => store.setMediaOffset(room.mediaOffset[role] - 5)} />
                <Btn title="− 1s" small variant="ghost" style={{ flex: 1 }} onPress={() => store.setMediaOffset(room.mediaOffset[role] - 1)} />
                <Btn title="+ 1s" small variant="ghost" style={{ flex: 1 }} onPress={() => store.setMediaOffset(room.mediaOffset[role] + 1)} />
                <Btn title="+ 5s" small variant="ghost" style={{ flex: 1 }} onPress={() => store.setMediaOffset(room.mediaOffset[role] + 5)} />
              </View>
            </Card>
          </>
        )}

        {/* ---------------- 倒计时 ---------------- */}
        {room.state === 'COUNTDOWN' && (
          <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 64, fontWeight: '700', color: color.primary }}>
              {countdown > 0 ? countdown : '▶'}
            </Text>
            <Text style={[font.body, { marginTop: 10 }]}>各自就位，一起按下播放</Text>
            <View style={{ height: 16 }} />
            <Btn title="取消" variant="ghost" small onPress={() => router.back()} />
          </Card>
        )}

        {/* ---------------- 播放界面 ---------------- */}
        {inPlayback || room.state === 'PEER_OFFLINE' || room.state === 'WAITING_RECONNECT' ? (
          <>
            {room.state === 'PEER_OFFLINE' ? (
              <NoticeBar
                tone={tint(color.butterSoft)}
                ink={color.careInk}
                icon="📴"
                text={`TA 暂时掉线，正在重连…（超过 5 分钟会转入「等待中」）`}
              />
            ) : null}
            {room.state === 'WAITING_RECONNECT' ? (
              <Card tone={tint(color.butterSoft)}>
                <Text style={[font.bodyStrong, { color: color.careInk }]}>TA 已离线超过 5 分钟</Text>
                <Text style={[font.small, { color: color.careInk, marginTop: 4 }]}>
                  房间和回忆卡草稿都还在。你可以继续等、重新邀请，或者先结束保存。
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn title="继续等待" small style={{ flex: 1 }} onPress={() => toast.show('继续等待 TA 回来')} />
                  <Btn title="重新邀请" small variant="ghost" style={{ flex: 1 }} onPress={() => store.regenerateRoomCode()} />
                  <Btn title="结束并保存" small variant="ghost" style={{ flex: 1 }} onPress={() => store.endRoom()} />
                </View>
              </Card>
            ) : null}

            {/* 播放区已挪到 ScrollView 外面的固定区域：视频放在滚动容器里必卡 */}
            {room.sourceUrl ? null : (
            <View style={styles.player}>
              <View style={styles.playerGlow} />
              <Text style={styles.playerLabel}>你自己设备上的播放器（示意）</Text>
              <Text style={styles.playerTitle}>{room.movieTitle}</Text>
              <Text style={styles.playerTime}>
                {formatDuration(device.player.positionSec)} / {formatDuration(DEMO_TOTAL_SEC)}
              </Text>
              <View style={styles.playerTrack}>
                <View style={[styles.playerFill, { width: `${pct * 100}%` }]} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={styles.playerMeta}>
                  {device.player.playing ? '▶ 正在播放' : '⏸ 已暂停'} · 速率{' '}
                  {device.player.rate.toFixed(2)}×
                </Text>
                <Text style={styles.playerMeta}>{isLeader ? '你是主控' : '跟随中'}</Text>

              </View>
            </View>
            )}

            {/* 控制条：一颗会发光的播放键 + 左右两边柔和的 ±10 秒 */}
            <View style={styles.controlDock}>
              <Pressable onPress={() => onSeek(-10)} style={({ pressed }) => [styles.skipBtn, pressed ? { opacity: 0.6 } : null]}>
                <Text style={styles.skipInk}>−10s</Text>
              </Pressable>
              <Pressable onPress={onPressPlayPause} style={({ pressed }) => [styles.playBtnShadow, pressed ? { opacity: 0.9 } : null]}>
                <LinearGradient
                  colors={['#F2A085', '#E8836B', '#D4715A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.playBtn}
                >
                  <Text style={styles.playBtnInk}>
                    {room.mediaState.action === 'play' ? '⏸' : '▶'}
                  </Text>
                  <Text style={styles.playBtnLabel}>
                    {room.mediaState.action === 'play' ? '暂停一下' : '和你一起播'}
                  </Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={() => onSeek(10)} style={({ pressed }) => [styles.skipBtn, pressed ? { opacity: 0.6 } : null]}>
                <Text style={styles.skipInk}>+10s</Text>
              </Pressable>
            </View>

            {room.pendingLeadRequest === role ? (
              <NoticeBar tone={tint(color.skySoft)} ink={color.inkMid} icon="⏳" text="已向 TA 发送接管请求，等待确认" />
            ) : null}

            {/* 同步面板（仅「各自自备片源」模式显示；在线片库的偏差在播放器里显示） */}
            {room.sourceUrl ? null : (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={font.bodyStrong}>同步状态</Text>
                <Pill
                  label={
                    Math.abs(m.drift) <= 0.6
                      ? '同步良好'
                      : Math.abs(m.drift) <= 1.5
                        ? '软校准中'
                        : '偏差较大'
                  }
                  tone={Math.abs(m.drift) <= 0.6 ? color.mintSoft : color.butterSoft}
                  ink={driftTone}
                />
              </View>
              <View style={{ height: 8 }} />
              <KeyValue k="当前误差" v={`${m.drift >= 0 ? '+' : ''}${m.drift.toFixed(2)} 秒`} />
              <KeyValue k="服务端目标位置" v={`${formatDuration(m.target)}`} />
              <KeyValue k="我的播放位置" v={`${formatDuration(m.local)}`} />
              <KeyValue k="校准模式" v={m.mode === 'none' ? '无干预' : m.mode === 'soft' ? '软校准（改速率）' : '硬校准（seek）'} />
              <KeyValue k="播放速率" v={`${m.rate.toFixed(2)}×`} />
              <KeyValue k="硬校准次数" v={`${m.hardCount} 次`} />
              <KeyValue k="对时偏移" v={`${m.offset >= 0 ? '+' : ''}${Math.round(m.offset)} ms`} />
              <KeyValue k="对时 RTT" v={`${Math.round(m.rtt)} ms`} />
              <KeyValue k="精度档位" v={m.degraded ? '放宽至 ±2.5 秒' : '严格 ±1.5 秒'} />
              {m.degraded ? (
                <Text style={[font.tiny, { color: color.danger, marginTop: 6 }]}>
                  网络波动导致频繁跳转，已主动放宽阈值并如实告知，不会假装精确。
                </Text>
              ) : null}
            </Card>

            )}

            {/* 主控操作 */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.md }}>
              {isLeader ? (
                <Btn
                  title="把主控交给 TA"
                  small
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => store.transferLeader(partner)}
                />
              ) : (
                <Btn title="申请接管主控" small variant="ghost" style={{ flex: 1 }} onPress={() => store.requestLead()} />
              )}
              <Btn
                title="结束观影"
                small
                variant="danger"
                style={{ flex: 1 }}
                onPress={() =>
                  void confirm({
                    title: '结束这次观影？',
                    message: '结束后双方都会离开房间，并生成一张回忆卡保存到「我们一起看过」。',
                    icon: '🎬',
                    confirmText: '结束观影',
                    danger: true,
                  }).then((ok) => {
                    if (ok) store.endRoom();
                  })
                }
              />
            </View>

            {/* 悄悄话：弹幕 + 表情，做成两个人之间的「聊天剧场」 */}
            {/*
             * 弹幕条：**不做聊天记录**。
             * 用户原话：「评论既然是发弹幕就不要有聊天的屏了，太难看了，没眼看」。
             * 所以这里只留一行：输入框 + 发送 + 四个表情，弹幕直接飘在画面上。
             */}
            <View style={styles.danmakuBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="发一条弹幕…（24 字，直接飘在画面上）"
                placeholderTextColor="rgba(255,255,255,0.45)"
                maxLength={24}
                style={styles.danmakuBarInput}
              />
              <Pressable
                onPress={() => {
                  store.sendDanmaku(draft);
                  setDraft('');
                }}
                style={({ pressed }) => [styles.sendBtn, pressed ? { opacity: 0.85 } : null]}
              >
                <Text style={styles.sendBtnInk}>发送</Text>
              </Pressable>
              {REACTIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => store.sendReaction(r)}
                  style={({ pressed }) => [styles.emojiBtn, pressed ? { opacity: 0.6 } : null]}
                >
                  <Text style={{ fontSize: 17 }}>{reactionMeta[r].emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* 我们的小影院场景 */}
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionEyebrow}>OUR CINEMA</Text>
                  <Text style={styles.sectionTitle}>我们的小影院</Text>
                </View>
              </View>
              <Text style={styles.sectionHint}>点一下，两个人的座位就变了。</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {([
                  ['popcorn', '🍿 爆米花', room.scene.popcorn],
                  ['cat', '🐈 猫', room.scene.cat],
                  ['blanket', '🛌 毯子', room.scene.blanket],
                ] as Array<['popcorn' | 'cat' | 'blanket', string, boolean]>).map(([key, label, on]) => (
                  <Pressable
                    key={key}
                    onPress={() => store.toggleScene(key)}
                    style={[
                      styles.sceneCell,
                      on ? styles.sceneCellOn : null,
                    ]}
                  >
                    <Text style={[styles.sceneCellInk, on ? { color: color.primaryInk } : null]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            {/* 5.8 语音通话：与首页共用同一个组件、同一份状态、同一个 RTC 频道 */}
            <VoiceCallCard voice={snapshot.voice} channel={snapshot.voiceChannel} role={role} />
          </>
        ) : null}

        {/* ---------------- 结束与回忆卡 ---------------- */}
        {(room.state === 'ENDED' || room.state === 'RECAP') && room.recap ? (
          <>
            <Card tone={tint(color.primarySoft)}>
              <Text style={[font.h3, { color: color.primaryInk }]}>🎞️ 这次观影</Text>
              <View style={{ height: 8 }} />
              <KeyValue k="片名" v={room.recap.movieTitle} />
              <KeyValue k="日期" v={new Date(room.recap.endedAt).toLocaleString()} />
              <KeyValue k="时长" v={formatDuration(room.recap.durationSec)} />
              <KeyValue k="状态" v={room.state === 'RECAP' ? '已保存到回忆' : '待保存'} />
            </Card>

            <Card>
              <Text style={font.bodyStrong}>我打几分</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => store.rateMovie(n)} hitSlop={6}>
                    <Text
                      style={{
                        fontSize: 24,
                        opacity: (room.recap?.ratings[role] ?? 0) >= n ? 1 : 0.25,
                      }}
                    >
                      ⭐
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[font.small, { marginTop: 8 }]}>
                TA 打了 {room.recap.ratings[partner] ?? '—'} 分
              </Text>
              <View style={{ height: 14 }} />
              <Text style={font.bodyStrong}>一句短评</Text>
              <TextInput
                value={review}
                onChangeText={setReview}
                placeholder="50 字以内"
                placeholderTextColor={color.inkFaint}
                maxLength={50}
                style={styles.reviewInput}
                multiline
              />
              <View style={{ height: 10 }} />
              <Btn
                title={savedReview ? '更新短评' : '保存短评'}
                small
                variant="ghost"
                onPress={() => store.reviewMovie(review)}
              />
              {savedReview ? (
                <Text style={[font.tiny, { marginTop: 6, color: color.ok }]}>✅ 已保存：{savedReview}</Text>
              ) : null}
              {partnerReview ? (
                <Text style={[font.tiny, { marginTop: 2 }]}>TA 写的：{partnerReview}</Text>
              ) : null}
              <View style={{ height: 8 }} />
              <Btn
                title={room.recap.saved.includes(role) ? '我已保存' : '保存到回忆'}
                disabled={room.recap.saved.includes(role)}
                onPress={() => store.saveRecap()}
              />
              <Text style={[font.tiny, { marginTop: 8 }]}>
                双方都保存后才会进入共同的回忆列表；截图需你手动上传，App 不会自动截屏。
              </Text>
            </Card>
          </>
        ) : null}

        {/* ---------------- 演示台（仅 DEMO_TOOLS 构建可见） ---------------- */}
        {DEMO_TOOLS ? (
          <Card tone={surf('alt')}>
            <Text style={[font.bodyStrong, { color: color.inkMid }]}>评审演示台（真实产品没有这些按钮）</Text>
            <Text style={[font.tiny, { marginTop: 4 }]}>
              用来现场验证偏移校准、掉线重连、超时分支。真实产品中这些由网络与计时器自然触发。
            </Text>
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Btn
                title="给对手制造 +8s 漂移"
                small
                variant="ghost"
                onPress={() => store.scrubPartner(8)}
              />
              <Btn
                title="切到对手断网"
                small
                variant="ghost"
                onPress={() => {
                  store.setRole(partner);
                  store.toggleOnline();
                  store.setRole(role);
                }}
              />
              <Btn
                title="快进掉线 5 分钟"
                small
                variant="ghost"
                onPress={() => store.devSkipOffline(5 * 60 * 1000)}
              />
              <Btn
                title="快进掉线 31 分钟"
                small
                variant="ghost"
                onPress={() => store.devSkipOffline(31 * 60 * 1000)}
              />
            </View>
          </Card>
        ) : null}

        <Card tone={surf('alt')}>
          <Text style={[font.bodyStrong, { color: color.inkMid }]}>我的设备通知（脱敏文案）</Text>
          <Text style={[font.tiny, { marginTop: 4 }]}>
            锁屏与通知栏只出现这类文案，不会出现身体、情绪、经期等敏感词。
          </Text>
          <View style={{ height: 8 }} />
          {device.notices.length === 0 ? (
            <Text style={[font.small]}>暂无</Text>
          ) : (
            device.notices.slice(0, 4).map((n) => (
              <Text key={n.id} style={[font.small, { marginTop: 2 }]}>
                · {new Date(n.at).toLocaleTimeString()} {n.text}
              </Text>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  /** 播放器固定区：在标题栏下面、ScrollView 外面 */
  playerDock: { paddingHorizontal: space.lg, paddingBottom: space.md },
  /** 播放器下面那行：上次测速时间 + 手动测速按钮 */
  probeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  /** 房间内选集面板用的胶囊样式（和详情页视觉一致） */
  episodeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  episodeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8836B',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  episodeText: { fontSize: 11, fontWeight: '700', color: '#E8836B' },
  probeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: color.primary },
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: 8,
  },
  bigCode: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    color: color.ink,
    marginVertical: 8,
  },
  joinInput: {
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    letterSpacing: 8,
    textAlign: 'center',
    color: color.ink,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  player: {
    backgroundColor: '#201C1A',
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  playerGlow: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(232,131,107,0.28)',
  },
  playerLabel: { ...font.tiny, color: 'rgba(255,255,255,0.55)' },
  playerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  playerTime: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  playerTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 12,
    overflow: 'hidden',
  },
  playerFill: { height: 5, backgroundColor: color.primary },
  playerMeta: { ...font.tiny, color: 'rgba(255,255,255,0.6)' },
  controlRow: { flexDirection: 'row', gap: 8, marginBottom: space.md },
  danmakuInputRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  danmakuInput: {
    flex: 1,
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: color.ink,
  },
  danmakuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  reactionCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  // 合集展开后的每一集：往里缩一格，视觉上从属于上面的合集
  queueEpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    backgroundColor: surf('alt'),
  },
  reviewInput: {
    marginTop: 6,
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 56,
    textAlignVertical: 'top',
    fontSize: 13,
    color: color.ink,
  },

  /* ==================================================================
   * 一起看房间的「浪漫版」视觉层（v3.14.23）
   * 房间底是暗色影院壁纸，所以头部/头像条用玻璃+白字；
   * 卡片仍然是中性白玻璃（surf('base') 的纸白），不带一点黄。
   * ================================================================== */
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  backInk: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: -2 },
  headerEyebrow: {
    fontSize: 9,
    letterSpacing: 2.4,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.58)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
    maxWidth: 240,
  },
  headerStatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  headerStateDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#8FE0C0' },
  headerStateText: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.86)' },

  duoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.lg,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  duoAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  duoAvatarMine: { borderColor: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(255,255,255,0.22)' },
  duoAvatarPeer: { borderColor: 'rgba(232,131,107,0.9)', backgroundColor: 'rgba(232,131,107,0.24)' },
  duoAvatarInk: { fontSize: 15 },
  duoHeart: { fontSize: 13, marginHorizontal: -3, marginTop: 8 },
  duoText: { fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' },
  duoSub: { fontSize: 10.5, fontWeight: '500', color: 'rgba(255,255,255,0.66)', marginTop: 1 },

  playerShell: {
    borderRadius: 26,
    padding: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#E8836B',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  playerShellGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.55,
  },
  playerInner: { borderRadius: 23, overflow: 'hidden', backgroundColor: '#120E12' },
  pickingLine: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  filmEdgeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 3,
  },
  filmEdgeBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 4,
    paddingTop: 3,
  },
  filmHole: {
    width: 8,
    height: 4,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  playerTools: { flexDirection: 'row', gap: 8, marginTop: 10 },
  toolChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  toolChipInk: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  probeHint: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.48)',
    marginTop: 8,
  },

  sectionEyebrow: {
    fontSize: 8.5,
    letterSpacing: 2,
    fontWeight: '700',
    color: color.inkFaint,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: color.ink, marginTop: 2 },
  sectionHint: { fontSize: 11, fontWeight: '400', color: color.inkSoft, marginTop: 6, lineHeight: 16 },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
  },
  countBadgeInk: { fontSize: 11.5, fontWeight: '700', color: color.primaryInk },
  ghostChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: color.line,
  },
  ghostChipInk: { fontSize: 10.5, fontWeight: '600', color: color.inkSoft },

  queueItem: { marginTop: 4 },
  queueIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: color.line,
    marginRight: 9,
  },
  queueIndexOn: { backgroundColor: color.primary, borderColor: color.primary },
  queueIndexInk: { fontSize: 10.5, fontWeight: '700', color: color.inkSoft },
  queueIndexInkOn: { color: '#FFFFFF' },
  queueTitle: { fontSize: 13, fontWeight: '600', color: color.ink },
  queueMeta: { fontSize: 10.5, fontWeight: '500', color: color.inkSoft, marginTop: 1 },
  wideSoftBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(232,131,107,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,131,107,0.35)',
  },
  wideSoftBtnInk: { fontSize: 12, fontWeight: '700', color: color.primaryInk },

  controlDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: space.md,
  },
  skipBtn: {
    minWidth: 72,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  skipInk: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  playBtnShadow: {
    flex: 1,
    borderRadius: 999,
    shadowColor: '#E8836B',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 999,
  },
  playBtnInk: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
  playBtnLabel: { fontSize: 12.5, color: 'rgba(255,255,255,0.95)', fontWeight: '700' },

  privacyPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: color.mintSoft,
  },
  privacyPillInk: { fontSize: 10, fontWeight: '700', color: color.ok },
  /** 弹幕条：一行玻璃，暗底上贴着播放器下面 */
  danmakuBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: space.md,
  },
  danmakuBarInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.28)',
    color: '#FFFFFF',
    fontSize: 12.5,
  },
  emojiBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: color.primary,
  },
  sendBtnInk: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  emptyHint: { fontSize: 11.5, color: color.inkFaint, fontWeight: '500' },
  bubbleRow: { flexDirection: 'row', marginBottom: 7 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  bubblePeer: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: color.line,
    borderBottomLeftRadius: 5,
  },
  bubbleMine: {
    backgroundColor: 'rgba(232,131,107,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(232,131,107,0.3)',
    borderBottomRightRadius: 5,
  },
  bubbleText: { fontSize: 12.5, color: color.ink, fontWeight: '500', lineHeight: 18 },
  bubbleTextMine: { color: color.primaryInk },
  bubbleTime: { fontSize: 9, color: color.inkFaint, marginTop: 3, fontWeight: '500' },
  bubbleTimeMine: { color: 'rgba(140,70,52,0.55)' },
  reactionLabel: { fontSize: 10, fontWeight: '600', color: color.inkSoft, marginTop: 3 },
  reactionTrail: { fontSize: 10.5, fontWeight: '500', color: color.inkFaint },

  sceneCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: color.line,
  },
  sceneCellOn: { backgroundColor: color.primarySoft, borderColor: 'rgba(232,131,107,0.55)' },
  sceneCellInk: { fontSize: 11.5, fontWeight: '600', color: color.inkSoft },
});
