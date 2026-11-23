import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const music = snapshot.music;
  const voiceConnected = snapshot.voice.status === 'connected';
  // 播放引擎在 AppFrame 里挂载（全 App 唯一），这里直接用
  const engine = useGlobalMusicEngine();

  // 记录"上次听的是音乐"：首页据此决定要不要自动续播 FM
  useEffect(() => {
    if (engine.playing) {
      void AsyncStorage.setItem('last_audio_surface', 'music').catch(() => undefined);
    }
  }, [engine.playing]);

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen back
        title="一起听"
        subtitle="同一个队列，同一个进度，谁按都能对上"
        right={<DevicePills />}
      >
        <MusicPlayer role={role} music={music} engine={engine} voiceConnected={voiceConnected} />

        <View style={{ height: 12 }} />

        <NoticeBar
          tone={tint(color.skySoft)}
          ink={color.inkMid}
          icon="🎧"
          text="需要一首 http(s) 直链音频（.mp3 / .m4a / .aac / .wav / .ogg）。本地文件只能自己听，跨设备同步必须用直链。"
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
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

        <SectionTitle
          title={`一起听的队列 · ${music.queue.length} 首`}
          right={
            <Text style={[font.tiny, { color: color.inkSoft }]}>
              {music.updatedBy === role ? '你在控制' : 'TA 在控制'}
            </Text>
          }
        />

        {music.queue.length === 0 ? (
          <Card>
            <Text style={font.small}>
              队列还是空的。加一首你喜欢的直链音频，两个人就能同时听到同一段进度。
            </Text>
          </Card>
        ) : (
          music.queue.map((track, idx) => {
            const active = idx === music.index;
            // 正在放的那一首：显示真实的播放状态（和上面的大按钮同一个 engine）
            const label = active ? (engine.playing ? '⏸' : '▶') : String(idx + 1);
            return (
              <Card key={track.id} tone={active ? color.primarySoft : surf('base')}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    onPress={() => engine.selectTrack(idx)}
                    style={[styles.playDot, active ? styles.playDotActive : null]}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : color.inkSoft, fontSize: 11 }}>
                      {label}
                    </Text>
                  </Pressable>
                  <Pressable style={{ flex: 1, marginLeft: 10 }} onPress={() => engine.selectTrack(idx)}>
                    <Text style={font.bodyStrong} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={[font.tiny, { marginTop: 2 }]} numberOfLines={1}>
                      {track.artist || '未知歌手'} · 由 {track.addedBy === role ? '我' : snapshot.members[track.addedBy].name} 添加
                    </Text>
                  </Pressable>
                  <Pressable hitSlop={10} onPress={() => store.removeMusicTrack(track.id)}>
                    <Text style={[font.tiny, { color: color.danger }]}>删除</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })
        )}

        <SectionTitle title="音频焦点怎么处理" />
        <Card>
          <Text style={[font.small, { lineHeight: 20 }]}>
            音乐和语音同时开时，系统默认走「通话模式」：音量键调的是通话音量，不是音乐音量。
            所以我们做了三件事：
            {'\n'}· 语音一接通，音乐自动降到 35%，人脸对脸说话不会被盖住；
            {'\n'}· 挂断后自动恢复 100%；
            {'\n'}· 语音音量在语音面板里单独调（`adjustPlaybackSignalVolume`），不动系统媒体音量。
          </Text>
        </Card>

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
});
