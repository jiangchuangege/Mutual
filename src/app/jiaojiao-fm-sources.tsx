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
import { dropInlineSource, isInlineUrl, loadInlineText, saveInlineSource } from '../ui/fmInline';
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
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
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
    void dropInlineSource(src.url);
    setScan((prev) => prev.filter((s) => s.url !== src.url));
    toast.show('已删除这个收听源');
  };

  /**
   * 粘贴 XML/JSON 当源。
   *
   * 用户手里经常不是一条网址，而是一整段 XML（别人帮他导出的喜马拉雅专辑目录：
   * 342 个 item、只有标题+时长+官方页面，没有音频）。这种没法当网址填，
   * 所以直接把正文存进本机文件缓存，源列表里存一个 inline: 假地址。
   */
  const addPasted = () => {
    const text = pasteText.trim();
    if (text.length < 20 || !/[<{[]/.test(text.slice(0, 40))) {
      toast.show('把 RSS/XML 或列表 JSON 的全文粘进来（要以 < 或 { 开头）', 'warn');
      return;
    }
    const id = `jfm_inline_${Date.now().toString(36)}`;
    const guessName =
      name.trim() ||
      (/<title>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 18) ||
      '粘贴进来的源';
    void saveInlineSource(id, text, guessName).then((fakeUrl) => {
      const src: FmSource = {
        id,
        name: guessName,
        url: fakeUrl,
        kind: /^\s*[[{]/.test(text) ? 'json' : 'rss',
        createdAt: Date.now(),
        enabled: true,
      };
      const next = [src, ...sources];
      saveLocal(next);
      store.addFmSource(src.name, src.url, src.kind);
      setPasteText('');
      setName('');
      setPasteOpen(false);
      toast.show('已加入焦焦FM（存在本机，不用联网）');
      void scanAll(next);
    });
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
            try {
              const inline = isInlineUrl(s.url);
              const body = inline
                ? await loadInlineText(s.url)
                : await (async () => {
                    const res = await fetch(s.url, { headers: { accept: '*/*' } });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.text();
                  })();
              const items: FmItem[] = parseSource(body, s);
              const ms = Date.now() - t0;
              const catalogOnly = items.length > 0 && items.every((i) => i.externalOnly);
              return {
                url: s.url,
                count: items.length,
                ms,
                error: items.length
                  ? catalogOnly
                    ? '只有目录、没有音频链接（点一集会打开官方页面）'
                    : null
                  : '这个源里没有条目',
                status: (items.length === 0 ? 'fail' : ms > 4000 ? 'slow' : 'ok') as LiveScan['status'],
              };
            } catch (err) {
              /* 单个源出错只让这一行显示「坏」，不能把整个检测 Promise.all 拖垮 */
              return {
                url: s.url,
                count: 0,
                ms: Date.now() - t0,
                error: err instanceof Error ? err.message : String(err),
                status: 'fail' as LiveScan['status'],
              };
            }
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
          <View style={{ height: 12 }} />
          <Pressable onPress={() => setPasteOpen((v) => !v)} hitSlop={8} style={styles.pasteToggle}>
            <Text style={styles.pasteToggleText}>
              {pasteOpen ? '收起「粘贴 XML / JSON」' : '没有网址？直接粘贴 RSS / XML / JSON 全文 ›'}
            </Text>
          </Pressable>
          {pasteOpen ? (
            <View style={{ marginTop: 10 }}>
              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                placeholder={'把整段 <rss>…</rss> 或列表 JSON 粘在这里'}
                placeholderTextColor={night.textFaint}
                multiline
                style={[styles.input, styles.pasteBox]}
              />
              <View style={{ height: 8 }} />
              <Btn title="把这段加进焦焦FM" variant="soft" onPress={addPasted} />
              <Text style={styles.hint}>
                存在本机、不联网解析。像喜马拉雅付费专辑那种「只有目录、没有音频」的 RSS
                也能整份收进来，点某一集会用系统打开官方页面去听。
              </Text>
            </View>
          ) : null}
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
  pasteToggle: { paddingVertical: 6 },
  pasteToggleText: { color: night.cyan, fontSize: 11.5, fontWeight: '700' },
  pasteBox: { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
  footNote: { color: night.textFaint, fontSize: 10, textAlign: 'center', marginTop: 4 },
});
