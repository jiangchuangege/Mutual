import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getLiveSources,
  saveLiveSources,
  suggestSourceName,
  type LiveSourceEntry,
} from '../core/liveConfig';
import { checkEach, checkLiveSource, IDLE_REPORT, type HealthReport } from '../core/sourceHealth';
import { useApp } from '../store';
import { Collapsible } from '../ui/Collapsible';
import { NightBackdrop } from '../ui/NightSky';
import { night, nightFont } from '../ui/nightTheme';
import { HealthSummary, SourceRow } from '../ui/SourceHealthView';
import { healthAgeText, loadHealthCache, saveHealthCache } from '../ui/sourceHealthCache';
import { warmLive } from '../ui/warmCache';
import { dropCmsCache, readCmsCache, writeCmsCache } from '../ui/cmsCache';
import { useToast } from '../ui/components';

/**
 * 直播源管理（独立模块的配置页）
 *
 * 用户要求：
 *   - 「电视源可以加多个」→ 列表式管理，想加几个加几个
 *   - 「直播源也是一样的（要能看出哪个坏了）」→ 每个源都有检测灯 + 人话原因
 *   - 「直播源那个也要折叠」→ 每个区块都是可折叠的
 *   - 「和片源一样共用一份」→ 管理者写服务端，两个人共用同一份（见 store.saveLiveSourceUrls）
 */
export default function LiveSourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { store, partnerRole } = useApp();

  const [names, setNames] = useState<LiveSourceEntry[]>([]);
  const [reports, setReports] = useState<Record<string, HealthReport>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  /** 上次检测时间（0 = 从没测过）：进页面只展示缓存结果，不自动重测 */
  const [checkedAt, setCheckedAt] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

  /** 当前生效的地址（服务端共享优先） */
  const urls = store.liveSourceUrls;

  const entries = useMemo<LiveSourceEntry[]>(() => {
    return urls.map((url) => {
      const hit = names.find((n) => n.url === url);
      return hit ?? { id: url, name: suggestSourceName(url), url, addedAt: 0 };
    });
  }, [urls, names]);

  // 本机缓存里的名字（地址是共享的，名字只是本地展示用）
  useEffect(() => {
    void getLiveSources().then((list) => setNames(list));
  }, []);

  const checkOne = useCallback(
    async (url: string) => {
      setReports((prev) => ({ ...prev, [url]: { ...IDLE_REPORT, level: 'checking', detail: '检测中…' } }));
      const res = await checkLiveSource(url);
      setReports((prev) => ({ ...prev, [url]: res }));
      return res;
    },
    [],
  );

  const checkAll = useCallback(async () => {
    if (entries.length === 0) return;
    setCheckingAll(true);
    const initial: Record<string, HealthReport> = {};
    for (const e of entries) initial[e.url] = { ...IDLE_REPORT, level: 'checking', detail: '检测中…' };
    setReports(initial);
    await checkEach(
      entries,
      (e) => e.url,
      (e) => checkLiveSource(e.url),
      (key, value) => setReports((prev) => ({ ...prev, [key]: value })),
      3,
    );
    setCheckingAll(false);
    const at = Date.now();
    setCheckedAt(at);
    // 存下来：下次进页面直接显示这次的结果，不再自动重测
    setReports((prev) => {
      void saveHealthCache<Record<string, HealthReport>>('live', prev, at);
      return prev;
    });
  }, [entries]);

  /*
   * 进页面只读上次的检测结果，不自动检测（用户要求：检测改成手动）。
   * 想重新测点右上角「检测全部」。
   */
  useEffect(() => {
    let cancelled = false;
    void loadHealthCache<Record<string, HealthReport>>('live').then((cached) => {
      if (cancelled || !cached) return;
      setReports(cached.reports ?? {});
      setCheckedAt(cached.at);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reportOf = (url: string): HealthReport => {
    if (reports[url]) return reports[url];
    return { ...IDLE_REPORT, level: 'idle', detail: '还没检测' };
  };

  const persistNames = async (next: LiveSourceEntry[]) => {
    setNames(next);
    await saveLiveSources(next);
  };

  const addSource = async () => {
    const url = draftUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.show('地址要以 http:// 或 https:// 开头', 'error');
      return;
    }
    if (urls.includes(url.replace(/\/+$/, ''))) {
      toast.show('这个直播源已经加过了', 'warn');
      return;
    }
    setSaving(true);
    const ok = await store.saveLiveSourceUrls([...urls, url]);
    if (!ok) {
      setSaving(false);
      return;
    }
    const bare = url.replace(/\/+$/, '');
    await persistNames([
      ...names,
      { id: bare, name: draftName.trim() || suggestSourceName(bare), url: bare, addedAt: Date.now() },
    ]);
    setSaving(false);
    setAddOpen(false);
    setDraftUrl('');
    setDraftName('');
    // 立刻检测，并直接把结果告诉用户（"128 个台" 或 "拉不到"）
    const res = await checkOne(bare);
    if (res.level === 'dead') toast.show(`源加上了，但读不出来：${res.detail}`, 'error');
    else toast.show(`源可用：${res.detail}`, 'ok');
    // 新源：立刻把它的台单整份缓存进本机（永久缓存，之后进直播页秒开）
    void warmLive([{ id: bare, name: draftName.trim() || suggestSourceName(bare), url: bare, addedAt: Date.now() }], true);
  };

  const removeSource = async (url: string) => {
    // quiet：删除只弹一条「已删除…」，不要再叠一条「已保存」的通用提示
    const ok = await store.saveLiveSourceUrls(urls.filter((u) => u !== url), { quiet: true });
    if (!ok) return;
    await persistNames(names.filter((n) => n.url !== url));
    setReports((prev) => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
    /*
     * 关键：删源必须把这个源在**台单缓存**里的痕迹也清掉，
     * 否则「电视直播」页先读缓存，就会一直显示这个已经删掉的源 + 它的红色报错。
     * 这里直接删掉整个台单缓存（下次进直播页会用剩下的源重新拉一份），
     * 同时把测速缓存里这一条也删掉。
     */
    try {
      await dropCmsCache('live:catalog');
      const health = await readCmsCache<Record<string, unknown>>('health:live');
      if (health?.value && typeof health.value === 'object') {
        const nextHealth = { ...(health.value as Record<string, unknown>) };
        delete nextHealth[url];
        await writeCmsCache('health:live', nextHealth);
      }
    } catch {
      /* 清缓存失败不影响删源 */
    }
    toast.show('已删除这个直播源（它的台单缓存也清掉了）', 'ok');
  };

  const deadCount = entries.filter((e) => reportOf(e.url).level === 'dead').length;

  return (
    <View style={styles.root}>
      <NightBackdrop variant="live" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.roundBtn} hitSlop={8}>
          <Text style={{ color: night.text, fontSize: 16 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={nightFont.h1}>直播源</Text>
          <Text style={[nightFont.small, { marginTop: 2 }]} numberOfLines={1}>
            {entries.length > 0
              ? `${entries.length} 个源${deadCount > 0 ? ` · ${deadCount} 个已失效` : ''}`
              : '还没添加'}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/live')} style={styles.roundBtn} hitSlop={8}>
          <Text style={{ color: night.cyan, fontSize: 12, fontWeight: '700' }}>去看台</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 管理者提示 */}
        <View style={styles.managerBar}>
          <Text style={{ fontSize: 15 }}>{store.canManageLive ? '🔧' : '🔒'}</Text>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[nightFont.bodyStrong, { fontSize: 12.5 }]}>
              {store.canManageLive
                ? `现在由你管理（${urls.length} 个源在生效）`
                : `现在由 TA 管理（${urls.length} 个源）`}
            </Text>
            <Text style={[nightFont.small, { marginTop: 2 }]}>
              {store.canManageLive
                ? '改完之后 TA 那边自动跟着变，两个人看到的是同一份台单'
                : '你直接看台就行，需要改就让 TA 交给你'}
            </Text>
          </View>
        </View>

        {/* 源列表（可折叠） */}
        <Collapsible
          title="我加的直播源"
          emoji="📡"
          badge={`${entries.length} 个`}
          subtitle={
            checkedAt
              ? `上次检测：${healthAgeText(checkedAt)} · 想重测点「检测全部」`
              : '支持 m3u / m3u8 / txt；还没检测过，点「检测全部」'
          }
          defaultOpen
          right={
            <Pressable onPress={() => void checkAll()} hitSlop={6} style={styles.miniBtn}>
              <Text style={{ color: night.cyan, fontSize: 10.5, fontWeight: '700' }}>
                {checkingAll ? '检测中' : '检测全部'}
              </Text>
            </Pressable>
          }
        >
          {entries.length === 0 ? (
            <Text style={[nightFont.small, { lineHeight: 18 }]}>
              还没有直播源。点下面的「＋ 添加直播源」，把播放列表地址贴进来就行。
            </Text>
          ) : (
            <>
              <View style={{ marginBottom: 8 }}>
                <HealthSummary reports={reports} />
              </View>
              {entries.map((e) => (
                <SourceRow
                  key={e.url}
                  name={e.name}
                  url={e.url}
                  report={reportOf(e.url)}
                  onRemove={
                    store.canManageLive
                      ? () => {
                          void removeSource(e.url);
                        }
                      : undefined
                  }
                />
              ))}
            </>
          )}

          <Pressable
            onPress={() => {
              if (!store.canManageLive) {
                toast.show('直播源由 TA 管理，需要 TA 交给你之后才能改', 'warn');
                return;
              }
              setAddOpen(true);
            }}
            style={[styles.addBtn, !store.canManageLive ? { opacity: 0.5 } : null]}
          >
            <Text style={styles.addBtnText}>＋ 添加直播源</Text>
          </Pressable>

          {store.canManageLive && entries.length > 0 ? (
            <Pressable
              onPress={() => {
                void store.transferLiveManager(partnerRole);
              }}
              style={styles.transferBtn}
            >
              <Text style={{ color: night.textDim, fontSize: 11 }}>
                把直播源管理权交给 TA
              </Text>
            </Pressable>
          ) : null}
        </Collapsible>

        {/* 格式说明（可折叠） */}
        <Collapsible
          title="支持哪些直播源格式"
          emoji="📖"
          tone="violet"
          subtitle="贴地址就能用，不用手动挑格式（会自动识别）"
        >
          <Text style={[nightFont.small, { lineHeight: 19 }]}>
            <Text style={{ color: night.cyan, fontWeight: '700' }}>1. M3U / M3U8 播放列表</Text>
            {'\n'}#EXTM3U 开头，带 #EXTINF 和频道地址的那种。组名会取自 group-title。
            {'\n\n'}
            <Text style={{ color: night.cyan, fontWeight: '700' }}>2. TXT 直播源</Text>
            {'\n'}电视盒子最常见：`央视,#genre#` 分组行 + `CCTV-1 综合,http://…`
            {'\n\n'}
            <Text style={{ color: night.cyan, fontWeight: '700' }}>3. 一个台多个线路</Text>
            {'\n'}同一行用 # 或 | 隔开多个地址，播放页会自动挨个试，挂一条换下一条。
            {'\n\n'}
            <Text style={{ color: night.gold, fontWeight: '700' }}>说明</Text>
            {'\n'}App 不内置任何频道地址，也不托管、不转发视频流；频道由你配置的第三方源提供。
          </Text>
        </Collapsible>

        {deadCount > 0 ? (
          <Collapsible
            title="失效的源怎么处理"
            emoji="🩺"
            tone="pink"
            subtitle={`有 ${deadCount} 个源读不出来`}
          >
            <Text style={[nightFont.small, { lineHeight: 19 }]}>
              · 先点「检测全部」看具体原因：超时 / HTTP 404 / 内容不是播放列表 / 一条频道都没有
              {'\n'}· 超时和 404 基本就是源站挂了或换了地址，直接删掉换新的
              {'\n'}· 能连上但没有频道，通常是这个源只剩空壳（很多免费源会这样）
              {'\n'}· 只挂了一个源不用慌：其它源里的台照常能看，顶部会显示是哪个源坏了
            </Text>
          </Collapsible>
        ) : null}
      </ScrollView>

      {/* 添加弹层（夜色风格） */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalHost}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={[nightFont.h2]}>添加直播源</Text>
            <Text style={[nightFont.small, { marginTop: 6, lineHeight: 18 }]}>
              粘贴播放列表地址（.m3u / .m3u8 / .txt）。加完会自动检测能不能读出频道。
            </Text>

            <Text style={[nightFont.small, { marginTop: 14, marginBottom: 6 }]}>地址</Text>
            <TextInput
              value={draftUrl}
              onChangeText={setDraftUrl}
              placeholder="https://example.com/iptv.m3u"
              placeholderTextColor={night.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />

            <Text style={[nightFont.small, { marginTop: 12, marginBottom: 6 }]}>
              名字（可留空，默认用域名）
            </Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="比如：央视源"
              placeholderTextColor={night.textFaint}
              maxLength={24}
              style={styles.input}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
              <Pressable
                onPress={() => setAddOpen(false)}
                style={[styles.modalBtn, { backgroundColor: night.glassHi, flex: 1 }]}
              >
                <Text style={{ color: night.text, fontSize: 13, fontWeight: '700' }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => void addSource()}
                disabled={saving}
                style={[styles.modalBtn, { backgroundColor: night.cyan, flex: 1.4 }]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={night.textOnLight} />
                ) : (
                  <Text style={{ color: night.textOnLight, fontSize: 13, fontWeight: '800' }}>
                    添加并检测
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bgDeep },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10 },
  roundBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: night.line,
    backgroundColor: night.glass,
  },
  managerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 14,
    backgroundColor: night.glassHi,
    borderWidth: 1,
    borderColor: night.line,
    marginBottom: 12,
  },
  miniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: night.cyanLine,
    backgroundColor: night.cyanSoft,
  },
  addBtn: {
    marginTop: 4,
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: night.cyanLine,
    backgroundColor: night.cyanSoft,
  },
  addBtnText: { color: night.cyan, fontSize: 12.5, fontWeight: '800' },
  transferBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 6 },
  modalHost: { flex: 1, backgroundColor: 'rgba(3,5,12,0.72)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: night.bgSoft,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: night.line,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  input: {
    height: 44,
    borderRadius: 12,
    backgroundColor: night.glass,
    borderWidth: 1,
    borderColor: night.line,
    paddingHorizontal: 12,
    color: night.text,
    fontSize: 13,
  },
  modalBtn: { paddingVertical: 13, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
