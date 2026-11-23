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

import { apiLabel, DEFAULT_CMS_API } from '../core/cms';
import { checkCmsSource, checkEach, IDLE_REPORT, type HealthReport } from '../core/sourceHealth';
import { useApp } from '../store';
import { Collapsible } from '../ui/Collapsible';
import { NightBackdrop } from '../ui/NightSky';
import { night, nightFont } from '../ui/nightTheme';
import { HealthSummary, SourceRow } from '../ui/SourceHealthView';
import { healthAgeText, loadHealthCache, saveHealthCache } from '../ui/sourceHealthCache';
import { warmCinema, warmCinemaDeep } from '../ui/warmCache';
import { addDeletedApi, removeDeletedApi } from '../ui/deletedSources';
import { dropCmsCache, readCmsCache, writeCmsCache } from '../ui/cmsCache';
import { cmsApiCacheKey, rebuildLibHome } from '../ui/libHome';
import { useToast } from '../ui/components';

/**
 * 片源接口管理（影院，夜景风）
 *
 * 用户要求：
 *   - 「哪个电影接口读取不到视频的坏的，让他能显示出哪个接口是坏」→ 每个接口一行，红灯 + 人话原因
 *   - 「片源接口希望可以加个折叠」→ 分区块折叠
 *   - 「UI 一定好看点」→ 夜景玻璃卡 + 青蓝主色（壁纸同款配色）
 *
 * 数据和「我们 → 在线片库」是同一份（store.cmsApis），这里只是更好看的专用管理页。
 */
export default function CinemaSourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { store, partnerRole } = useApp();

  const urls = useMemo(() => store.cmsApis, [store.cmsApis]);
  const [reports, setReports] = useState<Record<string, HealthReport>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  /** 上次检测时间（0 = 从没测过）：进页面只展示缓存，不自动重测 */
  const [checkedAt, setCheckedAt] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const checkOne = useCallback(async (url: string) => {
    setReports((prev) => ({ ...prev, [url]: { ...IDLE_REPORT, level: 'checking', detail: '检测中…' } }));
    const res = await checkCmsSource(url);
    setReports((prev) => ({ ...prev, [url]: res }));
    return res;
  }, []);

  const checkAll = useCallback(async () => {
    if (urls.length === 0) return;
    setCheckingAll(true);
    const initial: Record<string, HealthReport> = {};
    for (const u of urls) initial[u] = { ...IDLE_REPORT, level: 'checking', detail: '检测中…' };
    setReports(initial);
    await checkEach(
      urls,
      (u) => u,
      (u) => checkCmsSource(u),
      (key, value) => setReports((prev) => ({ ...prev, [key]: value })),
      3,
    );
    setCheckingAll(false);
    const at = Date.now();
    setCheckedAt(at);
    setReports((prev) => {
      void saveHealthCache<Record<string, HealthReport>>('cinema', prev, at);
      return prev;
    });
  }, [urls]);

  /*
   * 进页面只显示上次的检测结果，不自动检测（用户要求：检测改成手动，别一进来就狂测）。
   * 想重新测点「检测全部」。
   */
  useEffect(() => {
    let cancelled = false;
    void loadHealthCache<Record<string, HealthReport>>('cinema').then((cached) => {
      if (cancelled || !cached) return;
      setReports(cached.reports ?? {});
      setCheckedAt(cached.at);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reportOf = (url: string): HealthReport => reports[url] ?? { ...IDLE_REPORT, detail: '还没检测' };

  const addApi = async () => {
    const url = draft.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      toast.show('接口地址要以 http:// 或 https:// 开头', 'error');
      return;
    }
    if (urls.includes(url)) {
      toast.show('这个接口已经加过了', 'warn');
      return;
    }
    setSaving(true);
    const ok = await store.saveCmsApis([...urls, url]);
    setSaving(false);
    if (!ok) return;
    setAddOpen(false);
    setDraft('');
    const res = await checkOne(url);
    if (res.level === 'dead') toast.show(`接口加上了，但读不出来：${res.detail}`, 'error');
    else toast.show(`接口可用：${res.detail}`, 'ok');
    // 新接口：立刻把它整份片库缓存进本机（永久缓存，之后进片库秒开）
    // 用户要求：新增接口要"先把这一份全部缓存进缓存文件"，完成后明确提示
    toast.show('正在把新接口的片库全部保存到缓存文件…', 'ok');
    /*
     * 新增源要**翻到底**，不是只抓前几页：
     * 采集站动辄几万部，只预热 400 部的话用户会觉得"我加的源没用"。
     * warmCinemaDeep 逐页抓、限速自适应（失败就放慢）、每 5 页落盘可续跑。
     */
    /*
     * 新源缓存策略（按用户要求）：
     *   · 先缓存这个源的**前 600 部**（30 页），进库立刻有东西看；
     *   · 剩下的算"没缓存"，不在这里闷头全量抓；
     *   · 用户点开某部没缓存的片时，只把**那一部**抓下来写进缓存（见 cinema-detail）。
     * 用得越多、缓存越全，最终整库自然就都缓存上了。
     */
    void warmCinemaDeep(url, {
      maxPages: 30,
      paceMs: 180,
      onProgress: ({ page, got }) => {
        if (page % 10 === 0) {
          toast.show(`正在预缓存新源：已收 ${got} 部…`, 'info');
        }
      },
    })
      .then((n) => {
        toast.show(`新源已预缓存 ${n} 部（后面的等你点到时再单独缓存）`, 'ok');
      })
      .catch(() => {
        toast.show('预缓存中断了（已缓存的部分都在），下次进片库会接着来', 'warn');
      });
  };

  const removeApi = async (url: string) => {
    if (urls.length <= 1) {
      toast.show('至少留一个片源接口，否则片库会空', 'warn');
      return;
    }
    const ok = await store.saveCmsApis(urls.filter((u) => u !== url), { quiet: true });
    if (!ok) return;
    /*
     * 删源 = 连它的缓存一起清掉（用户要求"不要一直占着"）。
     * 种子缓存是只读的，删不掉，所以同时把这个接口记进"已删除"名单，
     * 读取缓存时一律跳过 —— 等于看不见。
     */
    try {
      await addDeletedApi(url);
      await dropCmsCache(cmsApiCacheKey(url));
      // 重建片库首页：把还活着的接口缓存合并一遍，让被删的站从列表里消失
      await rebuildLibHome(urls.filter((u) => u !== url));
    } catch {
      /* 清缓存失败不影响删源本身 */
    }
    setReports((prev) => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
    toast.show('已删除这个接口', 'ok');
  };

  const deadCount = urls.filter((u) => reportOf(u).level === 'dead').length;

  return (
    <View style={styles.root}>
      <NightBackdrop variant="cinema" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.roundBtn} hitSlop={8}>
          <Text style={{ color: night.text, fontSize: 16 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={nightFont.h1}>片源接口</Text>
          <Text style={[nightFont.small, { marginTop: 2 }]} numberOfLines={1}>
            {urls.length} 个接口{deadCount > 0 ? ` · ${deadCount} 个已失效` : ''}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/cinema-library')} style={styles.roundBtn} hitSlop={8}>
          <Text style={{ color: night.cyan, fontSize: 12, fontWeight: '700' }}>去片库</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.managerBar}>
          <Text style={{ fontSize: 15 }}>{store.canManageCms ? '🔧' : '🔒'}</Text>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[nightFont.bodyStrong, { fontSize: 12.5 }]}>
              {store.canManageCms
                ? `现在由你管理（${urls.length} 个接口在生效）`
                : `现在由 TA 管理（${urls.length} 个接口）`}
            </Text>
            <Text style={[nightFont.small, { marginTop: 2 }]}>
              {store.canManageCms
                ? '改完之后 TA 那边自动跟着变，两个人从同一份接口拉片'
                : '你直接看片就行，需要改就让 TA 交给你'}
            </Text>
          </View>
        </View>

        <Collapsible
          title="片源接口列表"
          emoji="🎬"
          badge={`${urls.length} 个`}
          subtitle={
            checkedAt
              ? `上次检测：${healthAgeText(checkedAt)} · 想重测点「检测全部」`
              : '苹果CMS(MacCMS) JSON 接口；还没检测过，点「检测全部」'
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
          <View style={{ marginBottom: 8 }}>
            <HealthSummary reports={reports} />
          </View>

          {urls.map((url) => (
            <SourceRow
              key={url}
              name={apiLabel(url)}
              url={url}
              report={reportOf(url)}
              active={urls[0] === url}
              extra={urls[0] === url ? '主接口' : undefined}
              onRemove={
                store.canManageCms && urls.length > 1
                  ? () => {
                      void removeApi(url);
                    }
                  : undefined
              }
            />
          ))}

          <Pressable
            onPress={() => {
              if (!store.canManageCms) {
                toast.show('片库接口由 TA 管理，需要 TA 交给你之后才能改', 'warn');
                return;
              }
              setAddOpen(true);
            }}
            style={[styles.addBtn, !store.canManageCms ? { opacity: 0.5 } : null]}
          >
            <Text style={styles.addBtnText}>＋ 添加片源接口</Text>
          </Pressable>

          {store.canManageCms && store.isBound ? (
            <Pressable
              onPress={() => {
                void store.transferCmsManager(partnerRole);
              }}
              style={styles.transferBtn}
            >
              <Text style={{ color: night.textDim, fontSize: 11 }}>把接口管理权交给 TA</Text>
            </Pressable>
          ) : null}
        </Collapsible>

        <Collapsible
          title="怎么判断一个接口是不是坏的"
          emoji="🩺"
          tone="violet"
          subtitle="点「检测全部」后，每个接口都会给一句人话结论"
        >
          <Text style={[nightFont.small, { lineHeight: 19 }]}>
            <Text style={{ color: night.danger, fontWeight: '700' }}>已失效</Text>
            {'：连不上、超时、返回的不是 JSON、或者一部片都没有' +
              '（免费采集站关停很常见，接口地址几个月就换一次）'}
            {'\n\n'}
            <Text style={{ color: night.warn, fontWeight: '700' }}>很慢</Text>
            {'：能出片但超过 3.5 秒，翻页和海报会明显卡；可以留着当备用'}
            {'\n\n'}
            <Text style={{ color: night.ok, fontWeight: '700' }}>正常</Text>
            {'：能读到第 1 页的片子，并显示读到几部'}
            {'\n\n'}
            坏接口不用手忙脚乱：片库是多个接口并行拉的，挂一个不影响其它接口出片，
            片库顶部会提示「N 个源暂时不可用」。
          </Text>
        </Collapsible>
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalHost}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={nightFont.h2}>添加片源接口</Text>
            <Text style={[nightFont.small, { marginTop: 6, lineHeight: 18 }]}>
              填苹果CMS(MacCMS)的 JSON 接口地址，加完会自动检测能不能读到片。
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={DEFAULT_CMS_API}
              placeholderTextColor={night.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { marginTop: 14 }]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
              <Pressable
                onPress={() => setAddOpen(false)}
                style={[styles.modalBtn, { backgroundColor: night.glassHi, flex: 1 }]}
              >
                <Text style={{ color: night.text, fontSize: 13, fontWeight: '700' }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => void addApi()}
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
