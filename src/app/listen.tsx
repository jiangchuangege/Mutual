import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, Image, Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../store';
import { DevicePills } from '../ui/DeviceBar';
import { MusicPlayer } from '../ui/MusicPlayer';
import { useGlobalMusicEngine } from '../ui/MusicEngineHost';
import { Btn, Card, Field, NoticeBar, Screen, SectionTitle, Sheet } from '../ui/components';
import { color, font, radius } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';

/**
 * 一起听：同步音乐（队列 + 播放状态都以服务端为准）
 *
 * 播放状态只有一份：`useMusicEngine` 返回的 engine。
 * 上面的大按钮和下面队列里的小三角都调它，所以不可能再各说各的
 * （真机 bug：点下面那个"播放"，上面的按钮不跟着变）。
 */
export default function ListenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { store, snapshot, role } = useApp();
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';
  const music = snapshot.music;
  const voiceConnected = snapshot.voice.status === 'connected';
  // 播放引擎在 AppFrame 里挂载（全 App 唯一），这里直接用
  const engine = useGlobalMusicEngine();

  /*
   * JOIN_ROOM_ALIGN（C1）：从首页点「过去」进来 = 加入 TA 的房间。
   * 进页面就对齐一次：把本地进度跳到「对方位置 + 已过时间」。
   * 只在播放中、且最后操作者是 TA 时才对齐，避免把我自己的操作顶掉。
   */
  const alignDone = useRef(false);
  useEffect(() => {
    if (alignDone.current) return;
    alignDone.current = true;
    const m = snapshot.music;
    if (!m || m.action !== 'play') return;
    if (m.updatedBy === role) return;
    const elapsed = Math.max(0, (Date.now() - (m.updatedAtServerMs || Date.now())) / 1000);
    const target = Math.max(0, (m.positionSec || 0) + elapsed);
    if (target > 1) store.musicAction('seek', { positionSec: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 记录"上次听的是音乐"：首页据此决定要不要自动续播 FM
  useEffect(() => {
    if (engine.playing) {
      void AsyncStorage.setItem('last_audio_surface', 'music').catch(() => undefined);
    }
  }, [engine.playing]);

  /** TA 现在是不是也在这个房间里（presence 里 surface=listen） */
  const ROOM_ON =
    (snapshot as unknown as {
      presence?: Partial<Record<'A' | 'B', { surface: string; at: number }>>;
    }).presence?.[partner]?.surface === 'listen';

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');

  /*
   * 歌单收纳（C4）：搜索 + 歌手筛选。
   *
   * 搜索范围**只在这份队列里**（用户明确要求"不要全库搜"）：
   * 一起听的队列是两个人共同维护的那几十首，找歌只要在这几十首里筛，
   * 不该跑去连服务器、更不该把整个在线片库拖进来。
   */
  const [musicQuery, setMusicQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState<string | null>(null);

  /** 队列里出现过的歌手（按出现次数排），给筛选 chip 用 */
  const queueArtists = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of music.queue) {
      const name = (t.artist || '未知歌手').trim() || '未知歌手';
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [music.queue]);

  /** 过完歌手 + 关键词之后要显示的队列（保留原下标，播放序号不能错位） */
  const shownQueue = React.useMemo(() => {
    const q = musicQuery.trim().toLowerCase();
    return music.queue
      .map((track, idx) => ({ track, idx }))
      .filter(({ track }) => {
        const name = (track.artist || '未知歌手').trim() || '未知歌手';
        if (artistFilter && name !== artistFilter) return false;
        if (!q) return true;
        return track.title.toLowerCase().includes(q) || name.toLowerCase().includes(q);
      });
  }, [music.queue, musicQuery, artistFilter]);

  const filtering = musicQuery.trim().length > 0 || artistFilter !== null;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="一起听"
        subtitle="同一个队列，同一个进度，谁按都能对上"
        right={<DevicePills />}
      >
        <MusicPlayer role={role} music={music} engine={engine} voiceConnected={voiceConnected} />

        <View style={{ height: 12 }} />

        {/* 房间状态 + 两个动作：对齐 / 加歌 */}
        <View style={styles.roomRow}>
          <View style={styles.roomChip}>
            <View style={[styles.roomDot, ROOM_ON ? styles.roomDotOn : null]} />
            <Text style={styles.roomText} numberOfLines={1}>
              {ROOM_ON ? '房间已连接 · TA 也在听' : 'TA 还没进来 · 进来会自动跟随'}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Btn
            title="↻ 同步到这里"
            small
            variant="soft"
            style={{ flex: 1 }}
            onPress={() => {
              /*
               * 两个人各听各的时候，点一下就"以我现在这一秒为准"：
               * 把当前曲目 + 当前进度写进共享状态，对方会跟着跳到这里。
               */
              const pos = Math.max(0, Number(engine.currentTime) || 0);
              store.musicAction('seek', { positionSec: pos });
              store.toast(`已同步到 ${Math.floor(pos / 60)}:${String(Math.floor(pos % 60)).padStart(2, '0')}`);
            }}
          />
          <Btn title="＋ 加一首歌" style={{ flex: 1 }} onPress={() => setAddOpen(true)} />
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>我们的歌单</Text>
          <Text style={styles.listMeta}>
            {filtering
              ? `· 筛出 ${shownQueue.length} / ${music.queue.length} 首`
              : `· ${music.queue.length} 首`}
          </Text>
        </View>

        {/* 搜索 + 歌手筛选：只在这份队列里找 */}
        {music.queue.length > 0 ? (
          <Card style={{ marginBottom: 10 }}>
            <View style={styles.searchRow}>
              <TextInput
                value={musicQuery}
                onChangeText={setMusicQuery}
                placeholder="在这份歌单里搜歌名 / 歌手"
                placeholderTextColor={color.inkFaint}
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {filtering ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setMusicQuery('');
                    setArtistFilter(null);
                  }}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearText}>清空</Text>
                </Pressable>
              ) : null}
            </View>
            {queueArtists.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <Pressable
                  onPress={() => setArtistFilter(null)}
                  style={[styles.chip, artistFilter === null ? styles.chipOn : null]}
                >
                  <Text style={[styles.chipText, artistFilter === null ? styles.chipTextOn : null]}>
                    全部 {music.queue.length}
                  </Text>
                </Pressable>
                {queueArtists.map(([name, count]) => {
                  const on = artistFilter === name;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => setArtistFilter(on ? null : name)}
                      style={[styles.chip, on ? styles.chipOn : null]}
                    >
                      <Text style={[styles.chipText, on ? styles.chipTextOn : null]} numberOfLines={1}>
                        {name} {count}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </Card>
        ) : null}

        {music.queue.length === 0 ? (
          <Card>
            <Text style={font.small}>
              队列还是空的。加一首你喜欢的直链音频，两个人就能同时听到同一段进度。
            </Text>
          </Card>
        ) : shownQueue.length === 0 ? (
          <Card>
            <Text style={font.small}>这份歌单里没有匹配的歌，换个词试试。</Text>
          </Card>
        ) : (
          shownQueue.map(({ track, idx }) => {
            const active = idx === music.index;
            const name = (track.artist || '未知歌手').trim() || '未知歌手';
            return (
              <Pressable
                key={track.id}
                onPress={() => engine.selectTrack(idx)}
                style={[styles.trackCard, active ? styles.trackCardOn : null]}
              >
                {active ? (
                  <LinearGradient
                    colors={['rgba(255,214,203,0.85)', 'rgba(255,244,240,0.4)', 'rgba(201,166,232,0.22)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                ) : null}
                <View style={styles.coverWrap}>
                  {track.cover ? (
                    <Image source={{ uri: track.cover }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, styles.coverFallback]}>
                      <Text style={{ fontSize: 15, color: color.primaryInk }}>♪</Text>
                    </View>
                  )}
                  {active ? (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>{engine.playing ? '❚❚' : '▶'}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    style={[font.bodyStrong, active ? { color: color.primaryInk } : null]}
                    numberOfLines={1}
                  >
                    {track.title}
                  </Text>
                  <Text style={[font.tiny, { marginTop: 3, color: color.inkMid }]} numberOfLines={1}>
                    {name} · {track.addedBy === role ? '我' : snapshot.members[track.addedBy].name} 添加
                  </Text>
                </View>
                {active ? (
                  <View style={styles.nowBadge}>
                    <Text style={styles.nowText}>正在放</Text>
                  </View>
                ) : (
                  <Text style={styles.idxText}>{idx + 1}</Text>
                )}
                <Pressable
                  hitSlop={12}
                  onPress={() => store.removeMusicTrack(track.id)}
                  style={styles.delBtn}
                >
                  <Text style={{ color: color.danger, fontSize: 12 }}>✕</Text>
                </Pressable>
              </Pressable>
            );
          })
        )}

        {/* 技术说明收成一行小字：这一页的重点是"我们一起听"，不是系统音量学 */}
        <View style={styles.footNote}>
          <Text style={styles.footNoteText}>
            语音一接通，音乐自动降到 35%，挂断恢复 100%（不会盖住你们说话）
          </Text>
        </View>

        <View style={{ height: 8 }} />
        <Btn title="返回" variant="ghost" onPress={() => router.back()} />
        <View style={{ height: 40 + insets.bottom }} />
      </Screen>

      <Sheet visible={addOpen} title="加一首歌" onClose={() => setAddOpen(false)}>
        {/* 手机里的歌：选文件 → 自动识别歌名歌手 → 上传到我们自己的服务器 → TA 也能听 */}
        <Btn
          title="📱 从手机里选一首（自动识别歌名/歌手）"
          variant="soft"
          onPress={() => {
            void (async () => {
              try {
                const picked = await DocumentPicker.getDocumentAsync({
                  type: 'audio/*',
                  copyToCacheDirectory: true,
                });
                if (picked.canceled || !picked.assets?.length) return;
                const asset = picked.assets[0];
                const ok = await store.importMusicFile(asset.uri, asset.name ?? 'song.mp3');
                if (ok) setAddOpen(false);
              } catch (err) {
                store.toast(
                  `选歌失败：${err instanceof Error ? err.message : String(err)}`,
                  'error',
                );
              }
            })();
          }}
        />
        <View style={{ height: 8 }} />
        <Text style={[font.tiny, { color: color.inkSoft, lineHeight: 17 }]}>
          选完不用手打歌名：App 会读文件里的 ID3 标签，读不到就按「歌手 - 歌名.mp3」这种文件名猜。
          文件会上传到我们自己的服务器（约 18MB 以内），所以对方手机也能播。
        </Text>
        <View style={{ height: 14 }} />
        <Text style={[font.tiny, { color: color.inkSoft }]}>或者贴一条直链：</Text>
        <Field label="歌名" value={title} onChangeText={setTitle} placeholder="例如 City of Stars" />
        <Field label="歌手（可不填）" value={artist} onChangeText={setArtist} placeholder="例如 Ryan Gosling" />
        <Field
          label="音频直链（.mp3 / .m4a）"
          value={url}
          onChangeText={setUrl}
          placeholder="https://cdn.example.com/song.mp3"
          multiline
        />
        <Btn
          title="加入队列"
          onPress={() => {
            if (store.addMusicTrack(title, artist, url)) {
              setTitle('');
              setArtist('');
              setUrl('');
              setAddOpen(false);
            }
          }}
        />
        <View style={{ height: 8 }} />
        <Text style={[font.tiny, { textAlign: 'center' }]}>
          只接受 http(s) 音频直链；网页/播放页地址会被拒绝。
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  // ── 一句话说明 / 房间状态 ────────────────────────────────────────────
  tipRow: { alignItems: 'center', marginBottom: 10 },
  tipText: { fontSize: 10.5, color: color.inkSoft, letterSpacing: 0.2 },
  roomRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: color.line,
  },
  roomDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.inkFaint, marginRight: 6 },
  roomDotOn: { backgroundColor: '#54C08A' },
  roomText: { fontSize: 10.5, color: color.inkMid },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },

  // ── 歌单标题 ────────────────────────────────────────────────────────
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  listTitle: { fontSize: 16, fontWeight: '800', color: color.ink, letterSpacing: 0.3 },
  listMeta: { fontSize: 10.5, color: color.inkSoft, marginLeft: 8 },
  footNote: { alignItems: 'center', marginTop: 6 },
  footNoteText: { fontSize: 10, color: color.inkFaint, textAlign: 'center' },

  playDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
  },
  playDotActive: { backgroundColor: color.primary, borderColor: color.primary },

  // ── 歌单：搜索 / 筛选 ───────────────────────────────────────────────
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: surf('alt'),
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: color.ink,
    fontSize: 13,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: color.primarySoft,
  },
  clearText: { fontSize: 11, fontWeight: '700', color: color.primaryInk },
  chipRow: { gap: 8, paddingTop: 10, paddingRight: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
    maxWidth: 160,
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { fontSize: 11, fontWeight: '700', color: color.inkMid },
  chipTextOn: { color: '#FFFFFF' },

  // ── 歌单：一行一首 ──────────────────────────────────────────────────
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surf('base'),
    borderRadius: radius.lg,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: color.line,
  },
  trackCardOn: { borderColor: color.primary, backgroundColor: '#FFF7F3', overflow: 'hidden' },
  coverWrap: { width: 46, height: 46 },
  cover: { width: 46, height: 46, borderRadius: 12 },
  coverFallback: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
  },
  coverBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primary,
  },
  coverBadgeText: { color: '#FFFFFF', fontSize: 8.5, fontWeight: '800' },
  nowBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    marginLeft: 6,
  },
  nowText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
  idxText: {
    fontSize: 11,
    color: color.inkFaint,
    marginLeft: 8,
    minWidth: 16,
    textAlign: 'right',
  },
  delBtn: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surf('alt'),
  },
});
