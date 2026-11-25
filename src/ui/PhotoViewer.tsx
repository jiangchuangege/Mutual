import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store';

/**
 * 全屏看图（照片回忆用）。
 * 点缩略图打开 → 大图查看，可左右翻页，点任意处关闭。
 */
export default function PhotoViewer({
  uris,
  index,
  onIndex,
  onClose,
}: {
  uris: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const total = uris.length;
  const raw = uris[Math.max(0, Math.min(index, total - 1))];
  /*
   * MEDIA_SRC：回忆里的照片在状态里存的是**相对路径**（/photo/…），
   * 缩略图那边是经过 store.mediaSrc() 拼成完整地址的；这里以前直接用原始路径，
   * 于是大图加载不出来 —— 全屏一片黑（用户反馈"点开就黑屏啥也没有"）。
   */
  const { store } = useApp();
  const cur = store.mediaSrc(raw) ?? raw;
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [cur]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.center}>
          {cur ? (
            <Image
              key={cur}
              source={{ uri: cur }}
              style={styles.big}
              resizeMode="contain"
              onError={() => setFailed(true)}
            />
          ) : null}
          {!cur || failed ? (
            <View style={styles.failBox}>
              <Text style={styles.failText}>这张图没加载出来（可能已被删除或还没上传成功）</Text>
              <ActivityIndicator color="#ffffff" style={{ marginTop: 10 }} />
            </View>
          ) : null}
          <Text style={styles.counter}>
            {index + 1} / {total} · 点任意处关闭
          </Text>
          {total > 1 ? (
            <View style={styles.row}>
              <Pressable
                onPress={() => onIndex((index - 1 + total) % total)}
                style={styles.navBtn}
              >
                <Text style={styles.navText}>‹ 上一张</Text>
              </Pressable>
              <Pressable onPress={() => onIndex((index + 1) % total)} style={styles.navBtn}>
                <Text style={styles.navText}>下一张 ›</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  big: { width: '100%', height: '76%' },
  counter: { color: '#fff', fontSize: 13, marginTop: 12 },
  failBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  failText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 24, marginTop: 16 },
  navBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  navText: { color: '#fff', fontSize: 16 },
});
