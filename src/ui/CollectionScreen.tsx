import React, { useEffect, useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer } from 'expo-audio';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import PhotoViewer from './PhotoViewer';
import { COLLECTION_SPECS } from '../core/modules';
import type { CollectionItem, CollectionKind } from '../core/types';
import { useApp } from '../store';
import { claimAudioFocus, registerAudioOwner, releaseAudioFocus, unregisterAudioOwner } from '../lib/audioFocus';
import {
  Btn,
  Card,
  Chip,
  EmptyState,
  Field,
  NoticeBar,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  useConfirm,
} from './components';
import { color, font, radius, space } from './theme';
import { pageBg } from './theme';
import { surf } from './theme';
import { tint } from './theme';

/**
 * 通用集合屏：14 个清单型功能共用同一套真实交互（新增/编辑/完成/删除/投票/认领），
 * 但每个功能的字段、默认可见性、可用动作都由 COLLECTION_SPECS 单独定义。
 */
export function CollectionScreen({
  kind,
  onBack,
  onListen,
}: {
  kind: CollectionKind;
  onBack: () => void;
  onListen: () => void;
}) {
  const { store, snapshot, role } = useApp();

  /** A1：全屏看图（照片回忆） */
  const [photoViewer, setPhotoViewer] = useState<{ uris: string[]; index: number } | null>(null);
  const onOpenPhoto = (uris: string[], index: number) => {
    if (uris.length === 0) return;
    setPhotoViewer({ uris, index: Math.max(0, Math.min(index, uris.length - 1)) });
  };
  const confirm = useConfirm();
  const spec = COLLECTION_SPECS[kind];
  const partner: 'A' | 'B' = role === 'A' ? 'B' : 'A';

  const items = useMemo(
    () => snapshot.collection.filter((i) => i.kind === kind),
    [snapshot.collection, kind],
  );
  const [filter, setFilter] = useState<'all' | 'open' | 'done' | 'owner'>('all');
  const shown = items.filter((i) => {
    if (filter === 'open') return !i.done;
    if (filter === 'done') return i.done;
    if (filter === 'owner') return i.visibility === 'owner';
    return true;
  });

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [level, setLevel] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [ownerOnly, setOwnerOnly] = useState(spec.defaultVisibility === 'owner');

  // 相册选图（真权限 + 真拷贝到 App 私有目录）
  const pickPhotos = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        store.toast('没有相册权限，无法选择照片', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 3,
        quality: 0.8,
      });
      if (result.canceled) return;
      const dir = FileSystem.documentDirectory;
      if (!dir) {
        store.toast('设备不支持本地存储', 'error');
        return;
      }
      const nextMeta = { ...meta };
      let count = 0;
      for (let i = 0; i < result.assets.length && i < 3; i += 1) {
        const asset = result.assets[i];
        const ext = (asset.uri.split('.').pop() ?? 'jpg').split('?')[0].slice(0, 5);
        const target = `${dir}twospace-photo-${Date.now()}-${i}.${ext}`;
        await FileSystem.copyAsync({ from: asset.uri, to: target });
        // 关键：上传到服务器，否则对方那边加载不出来（本地路径只有本机有效）
        nextMeta[`photo${i + 1}`] = await store.uploadPhoto(target);
        count += 1;
      }
      setMeta(nextMeta);
      store.toast(`已选入 ${count} 张照片`, 'ok');
    } catch (err) {
      store.toast(`选择照片失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  /**
   * 给"已经存在的某一条"补一张配图。
   * 用在图片加载不出来的条目上（比如对方在老版本里配的图只存在他那台手机里），
   * 谁看到了都能补一张，补完两个人都能看到。
   */
  const fixCoverFor = async (item: CollectionItem) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        store.toast('没有相册权限，无法选择图片', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || result.assets.length === 0) return;
      const dir = FileSystem.documentDirectory;
      if (!dir) {
        store.toast('设备不支持本地存储', 'error');
        return;
      }
      const ext = (result.assets[0].uri.split('.').pop() ?? 'jpg').split('?')[0].slice(0, 5);
      const dest = `${dir}twospace-cover-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
      const uploaded = await store.uploadPhoto(dest);
      store.collectionUpdate(item.id, { meta: { ...item.meta, cover: uploaded } });
      store.toast('配图已更新，双方都能看到', 'ok');
    } catch (err) {
      store.toast(`选择图片失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  // 通用配图：任何清单条目都能配一张图（相册选择 → 拷贝到私有目录）
  const pickCover = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        store.toast('没有相册权限，无法选择图片', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (result.canceled || result.assets.length === 0) return;
      const dir = FileSystem.documentDirectory;
      if (!dir) {
        store.toast('设备不支持本地存储', 'error');
        return;
      }
      const ext = (result.assets[0].uri.split('.').pop() ?? 'jpg').split('?')[0].slice(0, 5);
      const dest = `${dir}twospace-cover-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
      // 配图同样要上传，否则「TA 那边看不到我放的图」
      const uploaded = await store.uploadPhoto(dest);
      setMeta({ ...meta, cover: uploaded });
      store.toast('配图已选好', 'ok');
    } catch (err) {
      store.toast(`选择图片失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  // 选本地音乐（真文件拷贝，用于内置播放器）
  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const dir = FileSystem.documentDirectory;
      if (!dir) {
        store.toast('设备不支持本地存储', 'error');
        return;
      }
      const asset = result.assets[0];
      const ext = (asset.name?.split('.').pop() ?? 'mp3').slice(0, 5);
      const target = `${dir}twospace-audio-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: asset.uri, to: target });
      /*
       * AUDIO_UPLOAD：一定要传到服务器。
       * 以前这里存的是 file:// 本机路径：对方点播放打不开我手机 sandbox 里的文件，
       * 按下去永远没声；冷启动时还会被当成"共享队列直链"塞进一起听（必然失败）。
       */
      const uploaded = await store.uploadAudioFile(target, asset.name ?? `${Date.now()}.${ext}`);
      if (!uploaded) {
        store.toast('音乐上传失败（检查一下服务器连接），这次先不加', 'error');
        return;
      }
      setMeta({ ...meta, audio: uploaded });
      store.toast('已添加本地音乐（已上传，TA 也能听）', 'ok');
    } catch (err) {
      store.toast(`选择音乐失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const reset = () => {
    setTitle('');
    setNote('');
    setAmount('');
    setDate('');
    setLevel(0);
    setTags([]);
    setMeta({});
    setOwnerOnly(spec.defaultVisibility === 'owner');
  };

  const submit = () => {
    const okAdd = store.collectionAdd(kind, {
      title,
      note,
      tags,
      amountCents: spec.allowAmount && amount.trim() ? Math.round(Number(amount) * 100) : null,
      date: spec.allowDate && date.trim() ? date.trim() : null,
      level,
      visibility: ownerOnly ? 'owner' : 'shared',
      meta,
    });
    if (okAdd) {
      reset();
      setAddOpen(false);
    }
  };

  const renderItem = (item: CollectionItem) => {
    const mine = item.ownerRole === role;
    const bothLike = item.votes.A === 'like' && item.votes.B === 'like';
    return (
      <Card key={item.id}>
        <View style={styles.itemHead}>
          <Pressable
            onPress={() => store.collectionToggle(item.id)}
            style={[styles.checkbox, item.done ? styles.checkboxDone : null]}
          >
            {item.done ? <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
          </Pressable>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text
              style={[
                font.bodyStrong,
                item.done ? { textDecorationLine: 'line-through', color: color.inkFaint } : null,
              ]}
            >
              {item.title}
            </Text>
            <Text style={[font.tiny, { marginTop: 2 }]}>
              {item.ownerRole === role ? '我加的' : 'TA 加的'}
              {item.visibility === 'owner' ? ' · 仅我可见' : ''}
              {item.date ? ` · ${item.date}` : ''}
              {item.amountCents !== null ? ` · ¥${(item.amountCents / 100).toFixed(2)}` : ''}
            </Text>
          </View>
          {item.visibility === 'owner' && !mine ? null : (
            <Pressable
              hitSlop={10}
              onPress={() =>
                void confirm({
                  title: `删除「${item.title}」？`,
                  message: '删除后两个人都看不到这条收藏，且不可恢复。',
                  icon: '🗂️',
                  confirmText: '删除',
                  danger: true,
                }).then((ok) => {
                  if (ok) store.collectionDelete(item.id);
                })
              }
            >
              <Text style={[font.tiny, { color: color.danger }]}>删除</Text>
            </Pressable>
          )}
        </View>

        {item.note ? <Text style={[font.small, { marginTop: 8 }]}>{item.note}</Text> : null}

        {item.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {item.tags.map((t) => (
              <Chip key={t} label={t} active onPress={() => undefined} />
            ))}
          </View>
        ) : null}

        {Object.keys(item.meta).length > 0 ? (
          <View style={{ marginTop: 6 }}>
            {spec.metaFields
              .filter((f) => item.meta[f.key])
              .map((f) => (
                <Text key={f.key} style={[font.small, { marginTop: 2 }]}>
                  {f.label}：{item.meta[f.key]}
                </Text>
              ))}
          </View>
        ) : null}

        {item.meta.cover ? (
          <CollectionImage
            uri={item.meta.cover}
            label={item.title}
            style={styles.itemCover}
            square={false}
            onFix={() => void fixCoverFor(item)}
          />
        ) : null}

        {kind === 'photoMemory' && ['photo1', 'photo2', 'photo3'].some((k) => item.meta[k]) ? (
          <View style={styles.photoRow}>
            {(['photo1', 'photo2', 'photo3'] as const)
              .filter((k) => item.meta[k])
              .map((k, i) => (
                <Pressable
                  key={k}
                  /* A1：点一下就看大图 */
                  onPress={() =>
                    onOpenPhoto(
                      (['photo1', 'photo2', 'photo3'] as const)
                        .map((x) => item.meta[x])
                        .filter(Boolean) as string[],
                      i,
                    )
                  }
                >
                  <CollectionImage
                    uri={item.meta[k]}
                    label={item.title}
                    style={styles.photoThumb}
                    square
                  />
                </Pressable>
              ))}
          </View>
        ) : null}

        {kind === 'playlist' && item.meta.audio ? (
          <AudioRow uri={item.meta.audio} label={item.title} />
        ) : null}

        {spec.allowLevel && kind === 'inventory' ? (
          <View style={styles.levelRow}>
            {['充足', '快没了', '没了'].map((label, idx) => (
              <Pressable
                key={label}
                onPress={() => store.collectionUpdate(item.id, { level: idx })}
                style={[
                  styles.levelCell,
                  item.level === idx ? { backgroundColor: color.careSoft, borderColor: color.care } : null,
                ]}
              >
                <Text style={[font.tiny, { color: item.level === idx ? color.careInk : color.inkSoft }]}>
                  {label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.levelAction}
              onPress={() => {
                store.collectionUpdate(item.id, { level: 1 });
                store.addShopping(item.title, '1', 'other');
              }}
            >
              <Text style={[font.tiny, { color: color.primaryInk }]}>转购物清单</Text>
            </Pressable>
          </View>
        ) : null}

        {spec.allowLevel && kind === 'restaurant' ? (
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => store.collectionUpdate(item.id, { level: n })}>
                <Text style={{ fontSize: 16, opacity: item.level >= n ? 1 : 0.25 }}>⭐</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {spec.allowVote ? (
          <View style={styles.voteRow}>
            <Pressable
              onPress={() => store.collectionVote(item.id, item.votes[role] === 'like' ? null : 'like')}
              style={[styles.voteBtn, item.votes[role] === 'like' ? styles.voteOn : null]}
            >
              <Text style={[font.tiny, { color: item.votes[role] === 'like' ? '#FFF' : color.inkMid }]}>
                想吃 / 想看
              </Text>
            </Pressable>
            <Pressable
              onPress={() => store.collectionVote(item.id, item.votes[role] === 'nope' ? null : 'nope')}
              style={[styles.voteBtn, item.votes[role] === 'nope' ? styles.voteNo : null]}
            >
              <Text style={[font.tiny, { color: item.votes[role] === 'nope' ? '#FFF' : color.inkMid }]}>
                不太想
              </Text>
            </Pressable>
            {bothLike ? (
              <Text style={[font.tiny, { color: color.ok, marginLeft: 8 }]}>双方都想</Text>
            ) : null}
          </View>
        ) : null}

        {spec.allowClaim ? (
          <View style={{ marginTop: 8 }}>
            <Btn
              title={item.claimedBy === role ? '我来做（点此取消）' : '我来做'}
              small
              variant={item.claimedBy === role ? 'primary' : 'ghost'}
              onPress={() => store.collectionClaim(item.id)}
            />
            {item.claimedBy && item.claimedBy !== role ? (
              <Text style={[font.tiny, { marginTop: 6 }]}>{snapshot.members[item.claimedBy].name} 认领了</Text>
            ) : null}
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Screen
        title={spec.title}
        subtitle={spec.subtitle}
        right={<Btn title="返回" small variant="ghost" onPress={onBack} />}
      >
        <NoticeBar tone={tint(color.skySoft)} ink={color.inkMid} icon="ℹ️" text={spec.rule} />

        {kind === 'playlist' ? (
          <View style={{ marginTop: space.md }}>
            <Btn title="🎧 一起听（同步播放，需要直链）" variant="dark" onPress={() => onListen()} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
          <Btn title={`＋ ${spec.empty.action}`} onPress={() => setAddOpen(true)} style={{ flex: 1 }} />
          {kind === 'wishJar' ? (
            <Btn title="摇一摇" variant="ghost" onPress={() => store.collectionDraw()} style={{ flex: 1 }} />
          ) : null}
        </View>

        <SectionTitle title={`共 ${items.length} 条`} />
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'open', label: '未完成' },
            { value: 'done', label: '已完成' },
            { value: 'owner', label: '仅我可见' },
          ]}
        />

        <View style={{ height: space.md }} />
        {shown.length === 0 ? (
          <EmptyState
            emoji={spec.empty.emoji}
            title={spec.empty.title}
            desc={spec.empty.desc}
            actionLabel={spec.empty.action}
            onAction={() => setAddOpen(true)}
          />
        ) : (
          shown.map(renderItem)
        )}

        <View style={{ height: 60 }} />
      </Screen>
      {/* A1：全屏看图 */}
      {photoViewer ? (
        <PhotoViewer
          uris={photoViewer.uris}
          index={photoViewer.index}
          onIndex={(i2) => setPhotoViewer((v) => (v ? { ...v, index: i2 } : v))}
          onClose={() => setPhotoViewer(null)}
        />
      ) : null}

      <Sheet visible={addOpen} title={spec.empty.action} onClose={() => setAddOpen(false)}>
        <Field label={spec.titleLabel} value={title} onChangeText={setTitle} placeholder={spec.titleLabel} />
        <Field label="备注" value={note} onChangeText={setNote} placeholder={spec.notePlaceholder} multiline />

        {spec.allowAmount ? (
          <Field label="金额（元，可不填）" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="numeric" />
        ) : null}
        {spec.allowDate ? (
          <Field label="日期（YYYY-MM-DD）" value={date} onChangeText={setDate} placeholder="2026-04-01" />
        ) : null}

        {spec.tagsPreset.length > 0 ? (
          <>
            <Text style={[font.tiny, { marginBottom: 6 }]}>标签</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              {spec.tagsPreset.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={tags.includes(t)}
                  onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
                />
              ))}
            </View>
          </>
        ) : null}

        {spec.metaFields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={meta[f.key] ?? ''}
            onChangeText={(v) => setMeta({ ...meta, [f.key]: v })}
            placeholder={f.placeholder}
          />
        ))}

        <View style={{ marginBottom: 12 }}>
          <Text style={[font.tiny, { marginBottom: 6 }]}>配图（可不加）</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {meta.cover ? (
              <CollectionImage uri={meta.cover} label="配图" style={styles.coverThumb} square />
            ) : null}
            <Btn title={meta.cover ? '换一张' : '从相册选择配图'} small variant="soft" onPress={() => void pickCover()} />
            {meta.cover ? (
              <Btn
                title="去掉"
                small
                variant="ghost"
                onPress={() => {
                  const next = { ...meta };
                  delete next.cover;
                  setMeta(next);
                }}
              />
            ) : null}
          </View>
        </View>

        {kind === 'photoMemory' ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[font.tiny, { marginBottom: 6 }]}>照片（最多 3 张，从相册选择）</Text>
            <Btn title="从相册选择照片" small variant="soft" onPress={() => void pickPhotos()} />
            {/* A2：选完立刻显示缩略图，点 × 可删 */}
            {['photo1', 'photo2', 'photo3'].some((k) => meta[k]) ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {(['photo1', 'photo2', 'photo3'] as const)
                  .filter((k) => meta[k])
                  .map((k) => (
                    <View key={k} style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: meta[k] }}
                        style={{ width: 82, height: 82, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                      <Pressable
                        onPress={() => setMeta({ ...meta, [k]: '' })}
                        style={{
                          position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
                          backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 13, lineHeight: 15 }}>×</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            ) : null}
            <Text style={[font.tiny, { marginTop: 6 }]}>
              已选 {['photo1', 'photo2', 'photo3'].filter((k) => meta[k]).length} 张
            </Text>
          </View>
        ) : null}

        {kind === 'playlist' ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[font.tiny, { marginBottom: 6 }]}>本地音乐（内置播放器可直接播）</Text>
            <Btn title="选一首本地音乐" small variant="soft" onPress={() => void pickAudio()} />
            <Text style={[font.tiny, { marginTop: 6 }]}>
              {meta.audio ? '已选好一首，保存后可在列表里播放' : '未选择（也可以只记歌名）'}
            </Text>
          </View>
        ) : null}

        <Text style={[font.tiny, { marginBottom: 6 }]}>可见范围</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          <Chip label="双方可见" active={!ownerOnly} onPress={() => setOwnerOnly(false)} />
          <Chip label="仅我可见" active={ownerOnly} onPress={() => setOwnerOnly(true)} />
        </View>

        <Btn title="保存" onPress={submit} />
        <View style={{ height: 8 }} />
        <Text style={[font.tiny, { textAlign: 'center' }]}>
          对方看到的视图由你设的可见范围决定
        </Text>
      </Sheet>
    </View>
  );
}

/** 内置音乐播放器（expo-audio，真实播放本地文件） */
function AudioRow({ uri, label }: { uri: string; label: string }) {
  const player = useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);
  /** 自己的唯一 id：用于"别人开始播放时把我暂停" */
  const ownerId = React.useMemo(() => 'preview-' + Math.random().toString(36).slice(2), []);

  // 登记到全局音频焦点：一起听开始播放时，这里会被自动暂停
  React.useEffect(() => {
    registerAudioOwner(ownerId, () => {
      try {
        player.pause();
      } catch {
        // 忽略
      }
      setPlaying(false);
    });
    return () => {
      unregisterAudioOwner(ownerId);
      try {
        player.pause();
      } catch {
        // 忽略
      }
    };
  }, [ownerId, player]);

  const toggle = () => {
    try {
      if (playing) {
        player.pause();
        releaseAudioFocus(ownerId);
        setPlaying(false);
      } else {
        claimAudioFocus(ownerId); // 先抢焦点，把「一起听」暂停掉
        player.play();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };

  return (
    <View style={styles.audioRow}>
      <Pressable onPress={toggle} style={styles.audioBtn}>
        <Text style={{ color: '#FFFFFF', fontSize: 13 }}>{playing ? '⏸' : '▶'}</Text>
      </Pressable>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[font.small, { color: color.ink }]} numberOfLines={1}>
          {playing ? `正在播放：${label}` : `播放这首：${label}`}
        </Text>
        <Text style={[font.tiny]}>内置播放器 · 本地文件</Text>
      </View>
    </View>
  );
}

/**
 * 清单里的图片（配图 / 照片回忆）。
 *
 * 两个要点：
 *  1. 存的可能是服务器相对路径（`/photo/xxx.jpg`），要用当前服务器拼成绝对地址；
 *  2. 加载不出来时**不能留一个空框**——用户看到的就是"我传的图没了"。
 *     这里明确写出「图片没加载出来」，还能看出是哪一条。
 */
function CollectionImage({
  uri,
  label,
  style,
  square,
  onFix,
}: {
  uri: string;
  label: string;
  style: object;
  square?: boolean;
  /** 加载失败时的补救入口（重新传一张） */
  onFix?: () => void;
  /** A1：点照片打开全屏查看 */
  onOpenPhoto?: (uris: string[], index: number) => void;
}) {
  const { store } = useApp();
  const [failed, setFailed] = useState(false);
  const src = store.mediaSrc(uri) ?? uri;
  useEffect(() => setFailed(false), [uri]);

  if (failed || !src) {
    return (
      <View style={[style, styles.imgFallback]}>
        <Text style={{ fontSize: square ? 18 : 24 }}>🖼️</Text>
        <Text style={styles.imgFallbackText} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.imgFallbackHint}>图片没加载出来</Text>
        {onFix ? (
          <Btn title="换一张图" small variant="ghost" onPress={onFix} style={{ marginTop: 6 }} />
        ) : null}
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src }}
      style={style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  itemHead: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surf('base'),
  },
  checkboxDone: { backgroundColor: color.primary, borderColor: color.primary },
  coverThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: surf('alt') },
  itemCover: { width: '100%', height: 140, borderRadius: radius.md, marginTop: 10, backgroundColor: surf('alt') },
  imgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
  },
  imgFallbackText: { fontSize: 11, color: color.inkMid, marginTop: 4, paddingHorizontal: 6, textAlign: 'center' },
  imgFallbackHint: { fontSize: 10, color: color.inkFaint, marginTop: 2 },
  photoRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  photoThumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: surf('alt') },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: surf('alt'),
    borderWidth: 1,
    borderColor: color.line,
  },
  audioBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  levelCell: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: surf('alt'),
  },
  levelAction: { paddingHorizontal: 8, paddingVertical: 5 },
  starRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  voteRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  voteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  voteOn: { backgroundColor: color.primary, borderColor: color.primary },
  voteNo: { backgroundColor: color.inkSoft, borderColor: color.inkSoft },
});
