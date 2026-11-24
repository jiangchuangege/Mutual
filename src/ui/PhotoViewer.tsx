import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const cur = uris[Math.max(0, Math.min(index, total - 1))];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.center}>
          <Image source={{ uri: cur }} style={styles.big} resizeMode="contain" />
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
  row: { flexDirection: 'row', gap: 24, marginTop: 16 },
  navBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  navText: { color: '#fff', fontSize: 16 },
});
