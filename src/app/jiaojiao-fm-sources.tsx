import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  detectSourceKind,
  healthSummary,
  parseSource,
  type FmHealthReport,
  type FmItem,
  type FmSource,
} from '../core/jiaojiaoFm';
import { useApp } from '../store';
import { Btn, useToast } from '../ui/components';
import { night } from '../ui/nightTheme';
import { Aurora } from '../ui/Aurora';
import { radius, space } from '../ui/theme';

/**
 * 焦焦FM · 收听源（独立页面）
 *
 * 用户要求："源接口单独设计一个页面，别杵在首页碍眼。"
 * 所以这里把「添加 / 删除 / 检测每个源」全搬过来，首页只留一行状态 + 入口。
 *
 * 写法和首页一致：
 *   · 源列表 = 空间里共享的那份（TA 加的我也能看到）优先，本地只是离线兜底；
 *   · 增删都走 store.addFmSource / removeFmSource（服务端共享），并同步写本机缓存；
 *   · 每个源单独拉一次（9 秒硬超时），显示「正常 / 慢 / 坏 + 条数 + 耗时」。
 */
const SRC_KEY = 'jfm_sources_v1';
const HARD_TIMEOUT_MS = 9000;

type LiveScan = { url: string; count: number; ms: number; error: string | null; status: 'ok' | 'slow' | 'fail' };

export default function FmSourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { store, snapshot } = useApp();

  const [localSources, setLocalSources] = useState<FmSource[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<LiveScan[]>([]);

  /* 本机兜底（离线时也能看到自己加过的源） */
  useEffect(() => {
    void AsyncStorage.getItem(SRC_KEY)
      .then((raw) => {
        if (!raw) return;
        const list = JSON.parse(raw) as FmSource[];
        if (Array.isArray(list)) setLocalSources(list.filter((s) => s && s.url));
      })
      .catch(() => undefined);
  }, []);

  const shared = ((snapshot as unknown as { fmSources?: FmSource[] }).fmSources ?? []).filter(
    (s) => s && s.url,
  );
  const sources = shared.length > 0 ? shared : localSources;

  const saveLocal = (list: FmSource[]) => {
    setLocalSources(list);
    void AsyncStorage.setItem(SRC_KEY, JSON.stringify(list)).catch(() => undefined);
  };

  const addSource = () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      toast.show('请填 http(s) 开头的地址（RSS / 列表 JSON / mp3 直链）', 'warn');
      return;
    }
    if (sources.some((s) => s.url === u)) {
      toast.show('这个源已经加过了', 'warn');
      return;
    }
    const src: FmSource = {
      id: `jfm_${Date.now().toString(36)}`,
      name: name.trim() || u.replace(/^https?:\/\//, '').slice(0, 18),
      url: u,
      kind: detectSourceKind(u),
      createdAt: Date.now(),
      enabled: true,
    };
    saveLocal([src, ...sources]);
    store.addFmSource(src.name, src.url, src.kind);
    setName('');
    setUrl('');
    toast.show('已加入焦焦FM');
    void scanAll([src, ...sources]);
  };

  const removeSource = (src: FmSource) => {
    saveLocal(sources.filter((s) => s.id !== src.id && s.url !== src.url));
    store.removeFmSource(src.id);
    setScan((prev) => prev.filter((s) => s.url !== src.url));
    toast.show('已删除这个收听源');
  };

  /** 逐个源检测：拿到条数 + 耗时 + 失败原因 */
  const scanAll = async (list?: FmSource[]) => {
    const use = (list ?? sources).filter((s) => s.enabled);
    if (use.length === 0) {
      setScan([]);
      return;
    }
    setScanning(true);
    const results = await Promise.all(
      use.map((s) =>
        Promise.race([
          (async () => {
            const t0 = Date.now();
            const res = await fetch(s.url, { headers: { accept: '*/*' } });
            const body = await res.text();
            const items: FmItem[] = res.ok ? parseSource(body, s) : [];
            const ms = Date.now() - t0;
            return {
              url: s.url,
              count: items.length,
              ms,
              error: res.ok ? (items.length ? null : '这个源里没有可播放的音频') : `HTTP ${res.status}`,
              status: (!res.ok || items.length === 0 ? 'fail' : ms > 4000 ? 'slow' : 'ok') as LiveScan['status'],
            };
          })(),
          new Promise<LiveScan>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  url: s.url,
                  count: 0,
                  ms: HARD_TIMEOUT_MS,
                  error: '超时（9 秒没返回）',
                  status: 'fail',
                }),
              HARD_TIMEOUT_MS,
            ),
          ),
        ]),
      ),
    );
    setScan(results);
    setScanning(false);
  };

  useEffect(() => {
    if (sources.length === 0) return;
    void scanAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.map((s) => s.url).join('|')]);

  const summary = useMemo(() => {
    if (scan.length === 0) return `${sources.length} 个源`;
    const reports = scan.map(
      (s) =>
        ({
          url: s.url,
          status: s.status,
          ms: s.ms,
          count: s.count,
          error: s.error,
          checkedAt: Date.now(),
        }) as FmHealthReport,
    );
    return `${sources.length} 个 · ${healthSummary(reports)}`;
  }, [scan, sources.length]);

  return (
    <View style={styles.root}>
      <Aurora accent="#FFD37A" which={2} useCustom={false} />
      <View pointerEvents="none" style={styles.scrim} />
      <ScrollView
        contentContainerStyle={{ padding: space.md, paddingTop: insets.top + 10, paddingBottom: 40 }}
      >
        <View style={styles.head}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.chip}>
            <Text style={styles.chipText}>返回</Text>
          </Pressable>
          <Text style={styles.headTitle}>收听源</Text>
          <Pressable onPress={() => void scanAll()} hitSlop={10} style={styles.chip}>
            <Text style={styles.chipText}>{scanning ? '检测中…' : '↻ 检测'}</Text>
          </Pressable>
        </View>

        <Text style={styles.summary}>{summary}</Text>

        <View style={styles.card}>
          {sources.length === 0 ? (
            <Text style={styles.hint}>还没有收听源。支持 音频直链 / 播客 RSS / 列表 JSON。</Text>
          ) : (
            sources.map((s) => {
              const r = scan.find((x) => x.url === s.url);
              const tone =
                !r || r.status === 'ok' ? night.cyan : r.status === 'slow' ? '#FFD37A' : '#FF6B6B';
              return (
                <View key={s.id} style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: tone }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.srcName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={styles.srcMeta} numberOfLines={2}>
                      {s.kind}
                      {r
                        ? ` · ${r.status === 'ok' ? '正常' : r.status === 'slow' ? '慢' : '坏'} · ${r.count} 条 · ${r.ms}ms`
                        : ' · 未检测'}
                      {r?.error ? ` · ${r.error}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeSource(s)} hitSlop={10} style={styles.del}>
                    <Text style={styles.delText}>删除</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* 添加 */}
        <View style={styles.card}>
          <Text style={[styles.srcName, { marginBottom: 8 }]}>添加收听源</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="给它起个名字（可不填）"
            placeholderTextColor={night.textFaint}
            style={styles.input}
          />
          <View style={{ height: 8 }} />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…（RSS / 列表 JSON / mp3 直链）"
            placeholderTextColor={night.textFaint}
            autoCapitalize="none"
            style={styles.input}
          />
          <View style={{ height: 10 }} />
          <Btn title="＋ 加入" onPress={addSource} />
          <Text style={styles.hint}>
            RSS 适合播客/有声书站；列表 JSON 适合自己整理的书单；mp3 直链就是单集。
          </Text>
        </View>

        <Text style={styles.footNote}>
          源是两个人共享的：你在这里加的，TA 那边也能看到并一起听。
        </Text>
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bgDeep },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,12,24,0.42)',
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headTitle: { flex: 1, textAlign: 'center', color: night.text, fontSize: 15, fontWeight: '800' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.25)',
  },
  chipText: { color: night.text, fontSize: 11.5, fontWeight: '700' },
  summary: { color: night.cyan, fontSize: 11.5, marginBottom: 10 },
  card: {
    backgroundColor: 'rgba(12,20,40,0.74)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(120,186,255,0.20)',
    padding: 14,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  srcName: { color: night.text, fontSize: 13, fontWeight: '700' },
  srcMeta: { color: night.textDim, fontSize: 10.5, marginTop: 2, lineHeight: 15 },
  del: { paddingHorizontal: 6 },
  delText: { color: 'rgba(255,120,120,0.9)', fontSize: 11.5 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: night.text,
    fontSize: 12.5,
  },
  hint: { color: night.textDim, fontSize: 10.5, marginTop: 8, lineHeight: 16 },
  footNote: { color: night.textFaint, fontSize: 10, textAlign: 'center', marginTop: 4 },
});
