import { useRouter } from 'expo-router';
import { getRoomDebug } from '../ui/roomDebug';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { getCmsApiList, saveCmsApiList } from '../core/cmsConfig';
import { DEFAULT_CMS_API } from '../core/cms';
import Constants from 'expo-constants';
import { SHOW_SIM_METRICS } from '../core/buildFlags';
import { loadServerSettings } from '../core/serverConfig';
import { DEFAULT_SERVER_URL, checkServerUrl } from '../core/serverUrl';
import type { DiagReport } from '../core/netDiagnostics';
import { togetherDayNumber, todayISO } from '../core/time';
import { Avatar, Btn, Card, Field, KeyValue, NoticeBar, Pill, Screen, SectionTitle, useConfirm } from '../ui/components';
import { Collapsible } from '../ui/Collapsible';
import { DevicePills } from '../ui/DeviceBar';
import { NetStatusDot } from '../ui/NetStatusDot';
import { TabBar } from '../ui/TabBar';
import { font, radius, space, themedColor } from '../ui/theme';
import { color as _baseColor } from '../ui/theme';
import { pageBg } from '../ui/theme';
import { surf } from '../ui/theme';
import { tint } from '../ui/theme';
import { getVideoStatus } from '../ui/videoStatus';
import { Flair } from '../ui/PageFlair';

/** 本页主题：us（只影响这一页的配色） */
const color = themedColor('us');
import { Ico } from '../ui/icons';
import { Aurora } from '../ui/Aurora';

/** 装的是哪个版本：排查“两台手机行为不一致”时第一个要看的东西 */
const APP_VERSION = Constants.expoConfig?.version ?? '未知';

export default function UsScreen() {
  const router = useRouter();
  const { store, snapshot, role, device } = useApp();
  const confirm = useConfirm();
  const partner = role === 'A' ? 'B' : 'A';
  const today = todayISO();
  const me = snapshot.members[role];
  const partnerMember = snapshot.members[partner];
  const partnerName = partnerMember.name;
  // 在一起天数：优先用用户自己填的开始日期，没填才退回绑定时间
  const togetherDays = togetherDayNumber(
    snapshot.profile.startedAt ? Date.parse(`${snapshot.profile.startedAt}T00:00:00`) : snapshot.boundAt,
    Date.now(),
  );

  /** 片源接口（可以多个） */
  const [cmsUrls, setCmsUrls] = useState<string[]>([]);
  const [cmsSavedCount, setCmsSavedCount] = useState<number | null>(null);
  /** 直播源数量（共享的那份优先，见 store.liveSourceUrls） */
  const liveCount = store.liveSourceUrls.length;
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [backupUrl, setBackupUrl] = useState('');
  const [serverMsg, setServerMsg] = useState('未连接');
  const [startedAt, setStartedAtState] = useState(snapshot.profile.startedAt ?? '');
  /** 昵称编辑框：两个人同名时这里是唯一的解法 */
  const [nicknameDraft, setNicknameDraft] = useState(me.name || '');
  const [busy, setBusy] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diag, setDiag] = useState<DiagReport | null>(null);

  /**
   * 背景视频状态（每秒刷一次）：用来判断"背景是不是真的在播"，
   * 而不是只显示了服务端截的那张首帧占位图。
   */
  const [videoState, setVideoState] = useState('未启用');
  useEffect(() => {
    const tick = () => {
      const vs = getVideoStatus();
      if (vs.status === 'idle') {
        setVideoState('未启用');
        return;
      }
      setVideoState(`${vs.status} · 已播 ${vs.positionSec.toFixed(1)}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /** 诊断用：把原始 presence 打出来，方便一眼看出"心跳有没有到" */
  const partnerPresenceRaw = (() => {
    const p = (snapshot as unknown as {
      presence?: Partial<Record<'A' | 'B', { surface: string; detail: string | null; at: number }>>;
    }).presence;
    const other = role === 'A' ? 'B' : 'A';
    const mine = p?.[role];
    const theirs = p?.[other];
    const age = theirs?.at ? Math.round((Date.now() - theirs.at) / 1000) : null;
    return theirs
      ? `${theirs.surface} · ${age}s 前（我：${mine?.surface ?? '无'}）`
      : `未收到（我：${mine?.surface ?? '无'}）`;
  })();

  // 地址校验：http + 公网会给出"语音不可用"的警告（规格第 4 条）
  const urlCheck = useMemo(() => checkServerUrl(serverUrl), [serverUrl]);

  // 启动时读回上次保存的地址（规格第 5 条）
  useEffect(() => {
    void loadServerSettings().then((saved) => {
      if (saved.url) setServerUrl(saved.url);
      if (saved.backupUrl) setBackupUrl(saved.backupUrl);
      if (store.remoteStatus.connected) {
        setServerMsg(`已连接 · rev ${store.remoteStatus.rev}`);
      }
    });
    // 只在挂载时读一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void getCmsApiList().then((list) => {
      setCmsUrls(list.length > 0 ? list : [DEFAULT_CMS_API]);
      setCmsSavedCount(list.length);
    });
  }, []);

  const pickImage = async (target: 'avatar' | 'background') => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        store.toast('没有相册权限', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        // 头像按 1:1 裁一次，看着整齐；质量 0.7 足够清楚，又不至于上传很久
        aspect: target === 'avatar' ? [1, 1] : undefined,
        quality: 0.7,
      });
      if (result.canceled || result.assets.length === 0) return;
      const dir = FileSystem.documentDirectory;
      if (!dir) {
        store.toast('设备不支持本地存储', 'error');
        return;
      }
      const ext = (result.assets[0].uri.split('.').pop() ?? 'jpg').split('?')[0].slice(0, 5);
      const dest = `${dir}twospace-${target}-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
      if (target === 'avatar') {
        // 真正的上传 + 同步：只写本地路径的话对方永远看不到（真机踩过）
        await store.changeMyAvatar(dest);
      } else {
        // 背景图同理：上传后状态里存 /background/xxx.jpg，对方才看得到
        await store.changeBackground(dest);
      }
    } catch (err) {
      store.toast(`选择图片失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  /** 高敏感但已实现的功能：列出来是为了让用户知道"有、但默认关着、开关在我手里" */
  const sensitive: Array<{
    icon: string;
    title: string;
    note: string;
    route: '/trust' | '/care' | '/growth';
  }> = [
    { icon: '📍', title: '位置与到家报备', note: '单次授权 · 无轨迹 · 不留停留记录', route: '/trust' },
    { icon: '🍻', title: '社交边界与聚会报备', note: '只在你主动提交时对方才看得到', route: '/trust' },
    { icon: '💞', title: '亲密关系边界卡', note: '逐条由本人决定是否共享', route: '/trust' },
    { icon: '🔑', title: '共享保险箱 / 账号密码', note: '每次取出都留痕，可随时收回', route: '/trust' },
    { icon: '🌱', title: '备孕 / 避孕记录', note: '仅本人可见，需单独授权', route: '/care' },
    { icon: '🪞', title: '关系健康自评', note: '只给自己看，永不互看分数', route: '/growth' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: pageBg(color.bg) }]}>
      <Flair theme="us" />
      <Aurora mode="light" accent="#F0B3C8" intensity={0.8} />
      <Screen title="我们" subtitle="关系档案、隐私与数据，都收在这里" right={<DevicePills />}>
        {/*
         * 在一起天数：**实心**深玫瑰底 + 白字。
         * 注意不要用 <Card tone=...>：自定义壁纸模式下 Card 的填充会被换成半透明白玻璃，
         * 深底被冲淡，白字就彻底糊在壁纸上了（用户反馈"这里字体看不清"）。
         * 这里直接用普通 View 画实底，任何模式下都保持高对比。
         */}
        <View
          style={{
            backgroundColor: '#5A2440',
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
          }}
        >
          <Text style={[font.h3, { color: '#FFFFFF' }]}>
            在一起第 {togetherDays} 天
          </Text>
          <Text style={[font.small, { color: 'rgba(255,255,255,0.92)', marginTop: 4 }]}>
            {me.name || '我'}
            {partnerName ? ` & ${partnerName}` : ' · 还没有绑定对方'} · {today}
          </Text>
          {/* 把两个账号 ID 都摆出来：绑错账号（比如绑到自己的另一个账号）时，
              这是唯一能一眼看出来的地方 */}
          {partnerName ? (
            <Text style={[font.tiny, { color: 'rgba(255,255,255,0.80)', marginTop: 6 }]}>
              我的账号 {store.myAccountId || '——'} · 对方账号 {store.partnerPublicId || '——'}
            </Text>
          ) : null}
          {store.namesCollide ? (
            <>
              <Text style={[font.tiny, { color: 'rgba(255,255,255,0.82)', marginTop: 6 }]}>
                你们俩昵称一样（都叫 {me.name}），所以很多地方看起来会像"同一个人"——
                关怀、语音、首页那些"和 XX"的字样就会绕。改掉一个最省事。
              </Text>
              <Text style={[font.tiny, { color: 'rgba(255,255,255,0.82)', marginTop: 4 }]}>
                往下拉到「外观：昵称 / 头像 / 背景 / 在一起的日子」就能改自己的昵称，改完对方那边立刻同步。
              </Text>
            </>
          ) : null}
        </View>

        <SectionTitle title="我的账号" />
        <Card>
          {/* 一句话说清"这台手机现在登录的是谁"：
              很多人会记成"我注册的那个昵称"，可两台手机的账号很容易对调 */}
          <Text style={[font.small, { marginBottom: 8 }]}>
            这台手机现在登录的是
            <Text style={{ fontWeight: '700' }}> {me.name || '（还没建档）'}</Text>
            {me.gender === 'female' ? '（女）' : me.gender === 'male' ? '（男）' : ''}
            ，账号 ID 如下。不是你自己的账号就退出登录换一个。
          </Text>
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>🆔</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>{store.myAccountId || '——'}</Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                别人搜这串 ID 才能找到你；换手机用「账号 ID + 登录码」登录同一个账号。
              </Text>
              {store.accountSince > 0 ? (
                <Text style={[font.tiny, { marginTop: 4, color: color.inkSoft }]}>
                  这台手机登录于 {new Date(store.accountSince).toLocaleString()}
                  {' · '}如果不是刚刚登录的，说明可能还登着旧账号
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn
              title="退出登录（换账号）"
              small
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => void store.logoutAccount()}
            />
          </View>
        </Card>

        <SectionTitle title="背景" />
        <Card>
          <Text style={[font.bodyStrong]}>满屏背景（两个人共用）</Text>
          <Text style={[font.tiny, { color: color.inkSoft, marginTop: 4, lineHeight: 17 }]}>
            支持图片或 mp4 视频。上传后两台手机都用它铺满整屏，不加任何压暗。
          </Text>
          {/* 诊断：客户端此刻拿到的地址（区分"没同步"和"地址错"） */}
          <Text style={[font.tiny, { color: color.inkSoft, marginTop: 6 }]} numberOfLines={2}>
            {`诊断·服务端：${store.gameBaseUrl || '空'}`}
          </Text>
          <Text style={[font.tiny, { color: color.inkSoft, marginTop: 2 }]} numberOfLines={2}>
            {`诊断·背景：${(snapshot as unknown as { customBackground?: { url?: string } | null }).customBackground?.url ?? '未同步'}`}
          </Text>
          {/* 诊断：视频到底在不在播（status 是 readyToPlay 且秒数在涨 = 真的在放） */}
          <Text style={[font.tiny, { color: color.inkSoft, marginTop: 2 }]} numberOfLines={2}>
            {`诊断·背景视频：${videoState}`}
          </Text>
          {/* 诊断：对方此刻在哪个模块（对方手机上要装新版才会上报心跳） */}
          <Text style={[font.tiny, { color: color.inkSoft, marginTop: 2 }]} numberOfLines={2}>
            {`诊断·对方状态：${partnerPresenceRaw}`}
          
{`诊断·房间播放：${getRoomDebug()}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: color.primarySoft,
              }}
              onPress={() => {
                void (async () => {
                  try {
                    const DocumentPicker = await import('expo-document-picker');
                    const picked = await DocumentPicker.getDocumentAsync({
                      type: ['video/*', 'image/*'],
                      copyToCacheDirectory: true,
                      multiple: false,
                    });
                    if (picked.canceled || !picked.assets?.length) return;
                    const f = picked.assets[0];
                    await store.uploadCustomBackground({
                      uri: f.uri,
                      name: f.name ?? 'bg.mp4',
                      size: f.size ?? undefined,
                    });
                  } catch {
                    // 选择失败不弹错误，保持安静
                  }
                })();
              }}
            >
              <Text style={{ color: color.primaryInk, fontSize: 12.5, fontWeight: '700' }}>
                🖼 从文件选择背景
              </Text>
            </Pressable>
            <Pressable
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: color.primarySoft,
              }}
              onPress={() => store.clearCustomBackground()}
            >
              <Text style={{ color: color.primaryInk, fontSize: 12.5, fontWeight: '700' }}>
                恢复内置壁纸
              </Text>
            </Pressable>
          </View>
        </Card>

        <SectionTitle title="隐私与数据" />
        <Card onPress={() => router.push('/privacy')}>
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>🔐</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>隐私权限中心</Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                经期当前档位：
                {
                  { private: '完全私密', care: '仅关怀状态', predict: '预测日历可见', full: '完全共享' }[
                    snapshot.myPeriod.tier
                  ]
                }
                {' · '}
                查看 TA 能看到什么
              </Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>

        <Card onPress={() => router.push('/activity')}>
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>📣</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>
                TA 的动态{store.unreadActivityCount > 0 ? `（${store.unreadActivityCount} 条新的）` : ''}
              </Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                {store.partnerActivity.length === 0
                  ? 'TA 新增或删除了什么，这里会记一条'
                  : `最新：${store.partnerActivity[0].entityLabel} · ${new Date(
                      store.partnerActivity[0].at,
                    ).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
              </Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>

        <Card onPress={() => router.push('/notifications')}>
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>🔔</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>通知与锁屏脱敏</Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                免打扰 22:00–08:00 · 锁屏不出现敏感词
              </Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>

        <Card onPress={() => router.push('/unbind')}>
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>🚪</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>解绑与数据删除</Text>
              <Text style={[font.small, { marginTop: 2 }]}>
                7 天冷静期 · 删除即删除
                {snapshot.unbind?.status === 'cooling' ? ' · 冷静期中' : ''}
              </Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>

        <SectionTitle title="互动与成长" />
        <Card onPress={() => router.push('/emotions')}>
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>💌</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>卡片 · 每日一问 · 语音 · 日记 · 复盘 · 时间轴</Text>
              <Text style={[font.small, { marginTop: 2 }]}>情感互动</Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>
        <Card onPress={() => router.push('/growth')}>
          <View style={styles.row}>
            <Ico name="life" size="xl" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>我们的关系</Text>
              <Text style={[font.small, { marginTop: 2 }]}>档案 · 价值观 · 目标 · 边界 · 冲突修复 · 自评 · 投票 · 异地</Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>
        <Card onPress={() => router.push('/trust')}>
          <View style={styles.row}>
            <Text style={{ fontSize: 18 }}>🛡️</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>信任与安全</Text>
              <Text style={[font.small, { marginTop: 2 }]}>报备 · 亲密边界 · 保险箱 · 婚礼计划（默认全关）</Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>
        <Card onPress={() => router.push('/home-decor')}>
          <View style={styles.row}>
            <Ico name="home" size="xl" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>我们的房间 · 绿植 · 主题</Text>
              <Text style={[font.small, { marginTop: 2 }]}>共同房间 · 绿植养成 · 主题皮肤</Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>
        <Card onPress={() => router.push('/annual')}>
          <View style={styles.row}>
            <Ico name="book" size="xl" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={font.bodyStrong}>年度报告与回忆卡</Text>
              <Text style={[font.small, { marginTop: 2 }]}>仅双方可见</Text>
            </View>
            <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
          </View>
        </Card>

        <SectionTitle title="关系档案" />
        <Card>
          <KeyValue k="在一起" v={`${togetherDays} 天`} />
          <KeyValue k="共同安排" v={`${snapshot.events.length} 条`} />
          <KeyValue k="一起看过的电影" v={`${snapshot.recaps.length} 次`} />
          <KeyValue k="时间轴节点" v={`${snapshot.timeline.length} 个`} />
          <KeyValue k="日记" v={`${snapshot.diary.length} 篇`} />
          <KeyValue k="成就" v={`${snapshot.achievements.length} 个已解锁`} />
          <KeyValue k="年度报告年份" v={`${snapshot.annual.year} 年`} />
          <Text style={[font.tiny, { marginTop: 8 }]}>
            这些数字全部来自真实记录：写日记、看电影、过里程碑都会自动累加。空间初始是空的，没有任何预置数据。
          </Text>
        </Card>

        <SectionTitle title="高敏感功能" right={<Pill label="已可用 · 默认关闭" />} />
        <Card>
          <Text style={[font.small, { marginBottom: 10 }]}>
            下面这些功能都已经做完、随时可开，但默认关闭——它们容易被用来查岗或施压，
            所以开关握在各自手里，每一项都要求双方各自同意才会生效。
          </Text>
          {sensitive.map((d) => (
            <Pressable
              key={d.title}
              onPress={() => router.push(d.route)}
              style={({ pressed }) => [styles.deferredRow, pressed ? { opacity: 0.7 } : null]}
            >
              <Text style={{ fontSize: 12, color: color.inkFaint }}>{d.icon}</Text>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[font.bodyStrong, { color: color.inkMid }]}>{d.title}</Text>
                <Text style={[font.tiny, { marginTop: 1 }]}>{d.note}</Text>
              </View>
              <Text style={[font.bodyStrong, { color: color.inkFaint }]}>›</Text>
            </Pressable>
          ))}
        </Card>

        <SectionTitle title="本机与会话" />
        <Card tone={surf('alt')}>
          <KeyValue k="我的账号 ID" v={store.myAccountId || '——'} />
          <KeyValue k="App 版本" v={APP_VERSION} />
          <KeyValue
            k="同步状态"
            v={
              store.remoteStatus.connected
                ? `已连接 · rev ${store.remoteStatus.rev}`
                : '未连服务器'
            }
          />
          {/* 身份自查：这三行能把"我到底是谁"彻底说清。
              两格的账号 ID 都是服务端给的，跟我本地账号 ID 一对就知道有没有错位。 */}
          <KeyValue
            k="空间里这一格（服务端说）"
            v={`${store.remoteStatus.role ?? '——'} · ${snapshot.members[role].publicId || '空'}`}
          />
          <KeyValue
            k="另一格"
            v={`${partner} · ${
              snapshot.members[partner].name || '空'
            }（${snapshot.members[partner].publicId || '——'}）`}
          />
          <KeyValue
            k="身份自检"
            v={
              snapshot.members[role].publicId === store.myAccountId
                ? '✓ 一致（我这一格就是我的账号）'
                : `✗ 不一致：我这一格是 ${
                    snapshot.members[role].publicId || '空'
                  }，我的账号是 ${store.myAccountId || '空'}`
            }
          />
          {SHOW_SIM_METRICS ? (
            <>
              <KeyValue k="本机时钟偏移" v={`${Math.round(device.clockSkewMs)} ms`} />
              <KeyValue k="对时估算偏移" v={`${Math.round(device.metrics.offset)} ms`} />
              <KeyValue k="对时 RTT" v={`${Math.round(device.metrics.rtt)} ms`} />
            </>
          ) : null}
          <Text style={[font.tiny, { marginTop: 8 }]}>
            绑定靠这个账号：对方在「绑定」页搜它，双方都同意后才绑定。
            这个 ID 就是你的账号本身，固定不变；换手机用「账号 ID + 登录码」登录即可。
          </Text>
        </Card>

        <SectionTitle title="影院与直播" />
        <Collapsible
          variant="light"
          title="在线片库（影院）"
          emoji="🎬"
          badge={`${store.cmsApis.length} 个接口`}
          subtitle="接口一人管理、两人共用；点开可以改，或去专用页看每个接口的健康状况"
        >
        <Card>
          <Text style={[font.small]}>
            片库接口只由一个人管理，两个人从同一份接口拉片：你能看到的片，TA 那边也能看到。
            （各配一份会让同一个采集站被重复抓取、目录重复，还容易一边能播一边没有。）
          </Text>
          <View style={{ height: 8 }} />
          <NoticeBar
            tone={store.canManageCms ? color.mintSoft : color.skySoft}
            ink={color.inkMid}
            icon={store.canManageCms ? '🔧' : '🔒'}
            text={
              store.canManageCms
                ? `现在由你管理（${store.cmsApis.length} 个接口在生效）· 换接口后 TA 那边自动跟着变`
                : `现在由 TA 管理（${store.cmsApis.length} 个接口）· 你直接看片就行，需要改就让 TA 交给你`
            }
          />
          <View style={{ height: 10 }} />
          {store.canManageCms ? (
            <>
              {cmsUrls.map((url, idx) => (
                <View key={`cms-${idx}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={idx === 0 ? '片源接口地址' : `备用片源 ${idx}`}
                      value={url}
                      onChangeText={(v) => {
                        const next = [...cmsUrls];
                        next[idx] = v;
                        setCmsUrls(next);
                      }}
                      placeholder={DEFAULT_CMS_API}
                      autoFocus={false}
                    />
                  </View>
                  {cmsUrls.length > 1 ? (
                    <Btn
                      title="删除"
                      small
                      variant="ghost"
                      style={{ marginBottom: 14 }}
                      onPress={() => setCmsUrls(cmsUrls.filter((_, i) => i !== idx))}
                    />
                  ) : null}
                </View>
              ))}
              <Btn
                title="＋ 再加一个片源接口"
                small
                variant="ghost"
                onPress={() => setCmsUrls([...cmsUrls, ''])}
              />
              <View style={{ height: 10 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn
                  title="保存（双方生效）"
                  small
                  style={{ flex: 1 }}
                  onPress={() => {
                    void store.saveCmsApis(cmsUrls).then((okSave) => {
                      if (okSave) setCmsSavedCount(store.cmsApis.length);
                    });
                  }}
                />
                <Btn
                  title="恢复默认"
                  small
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setCmsUrls([DEFAULT_CMS_API]);
                    void store.saveCmsApis([DEFAULT_CMS_API]).then((okSave) => {
                      if (okSave) setCmsSavedCount(1);
                    });
                  }}
                />
              </View>
              {store.isBound ? (
                <View style={{ marginTop: 10 }}>
                  <Btn
                    title="把接口管理权交给 TA"
                    small
                    variant="ghost"
                    onPress={() => {
                      const partnerRole = store.partnerRole;
                      void store.transferCmsManager(partnerRole);
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              {/* 非管理者只看状态，不显示别人的接口地址（那是配置，不该占屏幕） */}
              <KeyValue k="接口数量" v={`${store.cmsApis.length} 个（由 TA 配置）`} />
              <Text style={[font.tiny, { marginTop: 8, color: color.inkSoft }]}>
                接口由 TA 维护。TA 换了接口之后，你这边刷新片库就会跟着变，不需要你操作。
              </Text>
            </>
          )}
          <Text style={[font.tiny, { marginTop: 8 }]}>
            {/* 不显示具体地址：那是配置，不该占着屏幕（用户明确要求） */}
            {cmsSavedCount !== null
              ? `当前生效：${cmsSavedCount} 个片源接口`
              : `当前生效：${store.cmsApis.length} 个片源接口`}
          </Text>
          <Text style={[font.tiny, { marginTop: 6, color: color.inkSoft }]}>
            说明：片源由第三方接口提供，App 不内置、不托管、不存储任何视频内容。
          </Text>
        </Card>

          <View style={{ height: 8 }} />
          <Btn
            title="检查每个接口是否可用（夜景管理页）"
            small
            variant="ghost"
            onPress={() => router.push('/cinema-sources')}
          />
        </Collapsible>

        {/* 电视直播：和影院完全独立的模块，配置也独立 */}
        <Collapsible
          variant="light"
          title="电视直播"
          emoji="📺"
          tone="violet"
          badge={liveCount > 0 ? `${liveCount} 个源` : '未配置'}
          subtitle="独立的直播模块：加 m3u/txt 直播源就能看 CCTV 等频道，还能和 TA 一起看"
        >
          <Card>
            <Text style={font.small}>
              直播和影院是两套东西：影院看的是片库里的电影电视剧，直播看的是电视台上星的实时频道。
              直播源同样「一人管理、两人共用」。
            </Text>
            <View style={{ height: 10 }} />
            <KeyValue k="直播源数量" v={`${liveCount} 个`} />
            <KeyValue
              k="管理权"
              v={store.canManageLive ? '在我这里' : '在 TA 那里'}
            />
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn
                title="打开电视直播"
                small
                style={{ flex: 1 }}
                onPress={() => router.push('/live')}
              />
              <Btn
                title="管理直播源"
                small
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => router.push('/live-sources')}
              />
            </View>
            <Text style={[font.tiny, { marginTop: 8, color: color.inkSoft }]}>
              说明：App 不内置任何频道地址，也不托管、不转发视频流；频道由你配置的第三方源提供。
            </Text>
          </Card>
        </Collapsible>

        <SectionTitle title="本地存储" />
        <Card>
          <KeyValue
            k="最近保存"
            v={store.savedAt ? new Date(store.savedAt).toLocaleString() : '尚未保存'}
          />
          <KeyValue
            k="快照大小"
            v={store.storageBytes === null ? '—' : `${(store.storageBytes / 1024).toFixed(1)} KB`}
          />
          <KeyValue k="恢复状态" v={store.hydrated ? '已尝试恢复上次数据' : '正在恢复…'} />
          <Text style={[font.tiny, { marginTop: 8 }]}>
            数据落在设备本地（AsyncStorage），杀掉进程再打开会恢复上次状态；
            新建的空间是空的，只有你们自己填写的内容会出现在这里。
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn title="立即保存" small variant="ghost" style={{ flex: 1 }} onPress={() => void store.persistNow()} />
            <Btn
              title="清空本地存储"
              small
              variant="danger"
              style={{ flex: 1 }}
              onPress={() =>
                void confirm({
                  title: '清空本机存储？',
                  message: '只清掉这台手机上的本地快照，不会影响当前界面里的数据，也不影响 TA 那边。',
                  icon: '🧽',
                  confirmText: '清空本机',
                  danger: true,
                }).then((ok) => {
                  if (ok) void store.wipeStorage();
                })
              }
            />
          </View>
        </Card>

        <SectionTitle title="同步服务器" right={<NetStatusDot />} />
        <Card>
          <Text style={[font.small]}>
            两台手机都装了这个 App、连同一个服务器，才能在同一个空间里同步。默认已经填好公网服务器，
            直接点「连接」即可。
          </Text>
          <View style={{ height: 10 }} />
          <Field
            label="服务器地址"
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder={DEFAULT_SERVER_URL}
            autoFocus={false}
          />
          <View style={{ height: 8 }} />
          <Field
            label="备用地址（可选 · 主地址连不上时自动改用它）"
            value={backupUrl}
            onChangeText={setBackupUrl}
            placeholder="http://192.168.1.10:8787"
            autoFocus={false}
          />
          <Text style={[font.tiny, { color: color.inkSoft, marginTop: 4 }]}>
            公网域名在有些网络下会被按域名拦掉（DNS 和端口都正常，唯独 TLS 握手被重置），
            这时填一个局域网地址做备用，连不上会自动切换过去。
          </Text>

          {/* 实时校验反馈：不合法说清为什么，能连但有限制也提前说 */}
          {urlCheck.error ? (
            <NoticeBar tone={tint(color.dangerSoft)} ink={color.danger} icon="⚠️" text={urlCheck.error} />
          ) : null}
          {urlCheck.warnings.map((w) => (
            <NoticeBar
              key={w}
              tone={tint(color.butterSoft)}
              ink={color.careInk}
              icon="🔒"
              text={w}
            />
          ))}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Btn
              title="测试连接"
              small
              variant="ghost"
              style={{ flex: 1 }}
              loading={busy}
              onPress={async () => {
                setBusy(true);
                const res = await store.testServer(serverUrl);
                setBusy(false);
                setServerMsg(`${res.text}${res.ok ? '' : `（${res.detail}）`}`);
                store.toast(res.text, res.ok ? 'ok' : 'error');
                // http + 公网：语音一定用不了，点测试时就明确警告一次
                if (res.ok && urlCheck.warnings.length > 0 && !urlCheck.isHttps) {
                  await confirm({
                    title: '这个地址不能用来语音',
                    message: `${urlCheck.warnings.join('\n')}\n\n数据同步仍然可用，只是语音用不了。建议把地址换成 https:// 开头的那一条。`,
                    icon: '🔒',
                    confirmText: '知道了',
                    cancelText: '仍要使用',
                  });
                }
              }}
            />
            <Btn
              title={store.remoteStatus.connected ? '重新连接' : '连接'}
              small
              loading={busy}
              style={{ flex: 1 }}
              onPress={async () => {
                setBusy(true);
                // 主地址连不上会自动试备用地址
                const okConn = await store.connectRemote(serverUrl, backupUrl);
                setBusy(false);
                setServerMsg(
                  okConn
                    ? `已连接 · 账号 ${store.myAccountId || ''} · ${
                        store.remoteStatus.transport === 'ws' ? '长连接' : '长轮询兼容模式'
                      }${store.remoteStatus.usedBackup ? ' · 用的是备用地址' : ''}`
                    : store.remoteLastError ?? '连接失败',
                );
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {store.remoteStatus.connected ? (
              <Btn
                title="重连一次"
                small
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => store.retryConnectionNow()}
              />
            ) : null}
            {store.remoteStatus.connected ? (
              <Btn
                title="断开"
                small
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => store.disconnectRemote()}
              />
            ) : null}
            <Btn
              title="恢复默认地址"
              small
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                setServerUrl(DEFAULT_SERVER_URL);
                void store.saveServer(DEFAULT_SERVER_URL);
                store.toast('已填回默认公网地址', 'ok');
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn
              title="网络诊断"
              small
              variant="soft"
              style={{ flex: 1 }}
              loading={diagBusy}
              onPress={async () => {
                setDiagBusy(true);
                const report = await store.diagnose(serverUrl);
                setDiagBusy(false);
                setDiag(report);
                store.toast(report.ok ? '诊断通过' : '诊断发现问题', report.ok ? 'ok' : 'warn');
              }}
            />
            {/* 服务端重启后空间会变空（以前不持久化）：用本机副本一键恢复 */}
            {store.remoteStatus.connected && snapshot.boundAt !== null ? (
              <Btn
                title="推回本机数据"
                small
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() =>
                  void confirm({
                    title: '把本机数据恢复到服务器？',
                    message:
                      '只在服务器那边的空间是空的时候有效（比如刚重启过后端）。服务器上已有数据时不会被覆盖。',
                    icon: '⬆️',
                    confirmText: '推回去',
                  }).then((ok) => {
                    if (ok) void store.restoreToServer();
                  })
                }
              />
            ) : null}
          </View>
          {/* 手动同步：看门狗会自动做，但人需要一个点了就一定有动作的按钮 */}
          {store.remoteStatus.connected ? (
            <Btn
              title="立即同步（拉取最新 + 补推我的档案）"
              small
              variant="soft"
              style={{ marginTop: 8 }}
              onPress={() => void store.forceSyncNow()}
            />
          ) : null}
          {/* 绑定关系被搞乱时的出口：解绑并清空，两个账号都保留 */}
          {store.remoteStatus.connected ? (
            <Btn
              title="解绑并清空这个空间（重新开始）"
              small
              variant="ghost"
              style={{ marginTop: 8 }}
              onPress={() => void store.resetServerSpace()}
            />
          ) : null}
          {diag ? (
            <View style={styles.diagBox}>
              {diag.steps.map((s) => (
                <View key={s.id} style={styles.diagRow}>
                  <Text style={{ fontSize: 13, color: s.ok ? color.ok : color.danger }}>
                    {s.ok ? '✓' : '✗'}
                  </Text>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={[font.tiny, { fontWeight: '700' }]}>{s.label}</Text>
                    <Text style={[font.tiny, { color: color.inkMid, marginTop: 1 }]}>{s.detail}</Text>
                  </View>
                </View>
              ))}
              <Text style={[font.tiny, { marginTop: 6, color: diag.ok ? color.ok : color.careInk }]}>
                {diag.summary}
              </Text>
            </View>
          ) : null}

          <Text style={[font.tiny, { marginTop: 8 }]}>状态：{serverMsg}</Text>
          {store.remoteStatus.connected ? (
            <Text style={[font.tiny, { marginTop: 2 }]}>
              通道：{store.remoteStatus.transport === 'ws' ? 'WebSocket 长连接' : 'HTTP 长轮询'} · rev{' '}
              {store.remoteStatus.rev}
              {store.netStatus.status === 'reconnecting'
                ? ` · 重连中（第 ${store.netStatus.attempt} 次）`
                : ''}
            </Text>
          ) : null}
          {store.netStatus.lastError ? (
            <Text style={[font.tiny, { marginTop: 2, color: color.danger }]}>
              最近错误：{store.netStatus.lastError}
            </Text>
          ) : null}
          <Text style={[font.tiny, { marginTop: 6, color: color.inkSoft }]}>
            长连接断开后会自动重连（2s → 4s → 8s → 16s → 最长 30s），重连成功后自动把当前房间和播放进度补发上去。
            地址会记在本机，下次打开 App 自动连。
          </Text>
        </Card>

        <SectionTitle title="外观：昵称 / 头像 / 背景 / 在一起的日子" />
        <Card>
          <Field
            label="我的昵称（对方看到的名字）"
            value={nicknameDraft}
            onChangeText={setNicknameDraft}
            placeholder="比如 小玫"
            maxLength={20}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <Avatar emoji={me.avatar} uri={store.avatarSrc(role)} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={font.tiny}>
                {store.avatarSrc(role)
                  ? '这张就是对方看到的样子（图片存在服务器上，换手机登录也在）'
                  : '还没设置头像：点右边这个按钮选一张，会自动上传给对方'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn
              title="保存昵称"
              small
              style={{ flex: 1 }}
              disabled={!nicknameDraft.trim() || nicknameDraft.trim() === me.name}
              onPress={() => {
                const next = nicknameDraft.trim();
                if (!next) return;
                if (!store.updateMyProfile(next, me.birthDate ?? '2000-01-01', me.gender ?? 'other')) return;
                store.rememberProfile();
                store.syncProfileToServer();
                store.toast('昵称已更新，对方那边会自动同步', 'ok');
              }}
            />
            <Btn
              title="换我的头像"
              small
              variant="soft"
              style={{ flex: 1 }}
              onPress={() => void pickImage('avatar')}
            />
          </View>
          {store.avatarSrc(role) ? (
            <View style={{ marginTop: 10 }}>
              <Btn
                title="清除头像（恢复默认）"
                small
                variant="ghost"
                onPress={() => store.setMyAvatar(null)}
              />
            </View>
          ) : null}
          {store.namesCollide ? (
            <Text style={[font.tiny, { marginTop: 8, color: color.careInk }]}>
              你们俩现在同名，改掉一个（比如加上「的男朋友 / 的女朋友」）就不容易看混了。
            </Text>
          ) : null}
          <View style={{ height: 10 }} />
          <Btn title="换背景图（双方可见）" small variant="soft" onPress={() => void pickImage('background')} />
          <Text style={[font.tiny, { marginTop: 6 }]}>
            {store.backgroundSrc
              ? '背景图已经上传到服务器，对方刷新就能看到'
              : '还没设置背景图（两个人看到的是同一张）'}
          </Text>
          {snapshot.profile.backgroundUri ? (
            <View style={{ marginTop: 10 }}>
              <Btn title="清除背景图" small variant="ghost" onPress={() => store.setBackground(null)} />
            </View>
          ) : null}
          <View style={{ height: 12 }} />
          <Field
            label="在一起的开始日期（自己填，首页天数按它算）"
            value={startedAt}
            onChangeText={setStartedAtState}
            placeholder="2024-05-20"
          />
          <Btn title="保存开始日期" small onPress={() => store.setStartedAt(startedAt.trim() || null)} />
        </Card>

        <SectionTitle title="合规声明" />
        <Card>
          {[
            '不做医疗诊断：健康页面均标注"不构成医疗建议"',
            '不做排行榜/亲密度排名/断签惩罚/公开比较',
            '不做监控式位置功能：无轨迹、无停留分析',
            '影院不内置片源、不托管视频、不提供盗链',
            '语音不录制、不存储，房间结束销毁',
          ].map((t) => (
            <View key={t} style={styles.complianceRow}>
              <Text style={{ fontSize: 12, color: color.mint }}>✓</Text>
              <Text style={[font.small, { marginLeft: 8, flex: 1 }]}>{t}</Text>
            </View>
          ))}
        </Card>

        <Btn
          title="清空全部数据（从头开始）"
          variant="danger"
          onPress={() =>
            void confirm({
              title: '清空全部数据？',
              message:
                '两个人写的日记、记录、房间、照片引用都会被清空，空间回到刚创建的空状态。这一步无法撤销。',
              icon: '🗑️',
              confirmText: '全部清空',
              danger: true,
            }).then((ok) => {
              if (ok) store.reset();
            })
          }
        />

        <NoticeBar
          tone={tint(color.skySoft)}
          ink={color.inkMid}
          icon="📱"
          text="两台手机装同一个 App、连同一台同步服务器，一个成为发起方、一个成为被邀请方；之后任一方操作，另一方几秒内就能看到。"
        />

        <View style={{ height: 120 }} />
      </Screen>
      <TabBar active="us" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  deferredRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  complianceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  diagBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: surf('alt'),
  },
  diagRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3 },
});
