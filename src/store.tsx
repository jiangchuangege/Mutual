/**
 * 全局状态：Hub + 两台模拟设备 + 当前演示角色
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { ClientDevice } from './core/device';
import { clearState, loadState, saveState, storageInfo } from './core/persistence';
import {
  checkServerHealth,
  createAccountOnServer,
  fetchMe,
  loginOnServer,
  pairAcceptOnServer,
  pairDeclineOnServer,
  pairRequestOnServer,
  pairResetOnServer,
  pingServer,
  restoreSpaceOnServer,
  rpcOnServer,
  waitForChange,
} from './core/remoteSync';
import type { AccountCreated } from './core/remoteSync';
import {
  loadAccountSession,
  looksLikeAccountId,
  normalizeAccountId,
  resolveMyRole,
  saveAccountSession,
} from './core/account';
import type { AccountSession } from './core/account';
import { ConnectionManager } from './core/connectionManager';
import type { ConnectionStatusInfo } from './core/connectionManager';
import { loadServerSettings, saveServerUrl, setAutoConnect } from './core/serverConfig';
import { getCmsApiList, saveCmsApiList } from './core/cmsConfig';
import { entriesFromUrls, getLiveSources, saveLiveSources } from './core/liveConfig';
import { activityToToast, loadActivitySeenAt, saveActivitySeenAt } from './core/activityFeed';
import { avatarKind, resolveAvatarUri } from './core/avatar';
import { DEFAULT_NOTIFY_PREFS, loadNotifyPrefs, saveNotifyPrefs } from './core/notifyPrefs';
import type { NotifyPrefs } from './core/notifyPrefs';
import { presentIfAllowed } from './lib/systemNotify';
import { uploadImage } from './lib/avatarUpload';
import { uploadAudio } from './lib/audioUpload';
import { readMusicMeta } from './lib/musicMetaFile';
import { buildNativeGame } from './lib/cloudBuild';
import { commentsOf } from './core/comments';
import type { CommentItem } from './core/types';
import { loadDeviceIdentity, loadProfileBackup, saveProfileBackup } from './core/deviceIdentity';
import type { ProfileBackup } from './core/deviceIdentity';
import {
  buildServerCandidates,
  checkServerUrl,
  normalizeServerUrl,
  toWebSocketUrl,
} from './core/serverUrl';
import { LOCAL_ONLY_HUB_METHODS, LOCAL_OPTIMISTIC_METHODS, isRoleArg } from './core/hubMethods';
import { classifyNetworkError, diagnoseServer } from './core/netDiagnostics';
import type { DiagReport } from './core/netDiagnostics';
import { Hub } from './core/hub';
import type {
  ActivityItem,
  Assignee,
  BoundaryCategory,
  CardKind,
  CollectionKind,
  DataChoice,
  Gender,
  PeriodTier,
  RelStage,
  Result,
  Role,
  SpaceSnapshot,
  SpaceState,
  ThemeId,
  ValuesTopic,
  Weather,
} from './core/types';
import { AppState } from 'react-native';
import { useConfirm, useToast } from './ui/components';
import { addDeletedApi, removeDeletedApi, loadDeletedApis } from './ui/deletedSources';
import { dropCmsCache, readCmsCache, writeCmsCache } from './ui/cmsCache';
import { cmsApiCacheKey, rebuildLibHome } from './ui/libHome';

export class AppStore {
  /** 本机权威状态（远程模式下由服务器 hydrate 进来） */
  readonly localHub: Hub;
  /** 对外 Hub：本机模式=本地；远程模式=写操作转发服务器 */
  readonly hub: Hub;
  readonly devices: Record<Role, ClientDevice>;
  role: Role = 'A';
  version = 0;

  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * 这次 hub notify 是不是"用户刚操作了一下"引起的。
   *
   * 只有这种时候才把本地 hub 的投影刷到界面上。本地投影是**有损**的
   * （服务端不发的字段本地保持原样，比如片单、对方的经期授权档位），
   * 而 hub 每 250ms tick 一次、hydrate 也会 notify，无条件刷就会和服务端投影
   * 来回打架 —— 用户看到的「我们的片单一直闪」「关怀页一会有一会没有」就是这么来的。
   */
  private localEcho = false;
  private lastTickAt = 0;
  private toastFn: ((text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void) | null = null;
  /** 最近一条 Toast，用来去重（防止循环报错刷屏） */
  private lastToast: { text: string; at: number } | null = null;
  private confirmFn:
    | ((opts: {
        title: string;
        message?: string;
        icon?: string;
        confirmText?: string;
        cancelText?: string;
        danger?: boolean;
      }) => Promise<boolean>)
    | null = null;
  /** 本地持久化 */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  savedAt: number | null = null;
  storageBytes: number | null = null;
  hydrated = false;

  // ---- 远程同步（两台手机共用一个空间）----
  /** 用户填的 http(s) 地址；为空表示本机模式 */
  private remoteServer = '';
  /** 备用地址：主地址在某条链路上被拦时自动改用它 */
  backupServer = '';
  /** 当前实际连上的地址（主/备都可能） */
  private activeServer = '';
  /** 这次是不是靠备用地址连上的 */
  usedBackup = false;
  private remoteRole: Role | null = null;
  private remoteRev = 0;
  /**
   * 登录状态（账号模型）。
   *
   * token 是服务端给的，**它才是身份**：所有请求都带着它，服务端据此找到
   * 我的账号和账号所在的的空间。客户端不再告诉服务端"我是 A 还是 B"。
   */
  private token = '';
  /** 我的账号 ID（界面上给用户看的那个，也是别人搜我的那个） */
  accountId = '';
  /** 这个账号是什么时候登录在这台手机上的（用来识破"其实还登着旧账号"） */
  accountSince = 0;
  /** 这个账号属于哪台服务器 */
  private accountServer = '';
  /** 登录状态是否已经失效（token 过期/账号被删）：UI 要请用户重新登录 */
  authExpired = false;

  /** 登录状态是否已经试过从本地读取了（避免启动瞬间闪一下登录页） */
  accountReady = false;
  remoteLastError: string | null = null;
  /** 连接时产生的"能用但有代价"的提醒（例如 http 公网地址不能语音） */
  connectWarnings: string[] = [];
  /** ws = 长连接（默认）；http = 老服务端的长轮询回退通道 */
  private transport: 'ws' | 'http' | null = null;
  private conn: ConnectionManager | null = null;
  private httpRunning = false;
  private rpcSeq = 1;
  private pendingRpcs = new Map<number, (result: Result<unknown>) => void>();
  /** 自动连接只在启动时试一次，避免反复连接 */
  private autoConnectTried = false;
  /** 这台设备的稳定身份（服务端按 clientId 认人，角色跟着设备走） */
  clientId = '';
  /** 最后一次"建好的档案"备份：服务端丢了也能一键推回去 */
  profileBackup: ProfileBackup | null = null;
  private lastProfilePushAt = 0;
  /** 最后一次收到**任何**服务器下行消息的时间（看门狗用它判断连接是否"半死"） */
  private lastInboundAt = 0;
  /** 最后一次"拉起长轮询 / 强制重连"的时间，避免看门狗自己打成风暴 */
  private lastForceResyncAt = 0;
  /** 最后一次收到服务器快照的时间 */
  private lastStateAt = 0;
  /** 上一次快照属于哪个空间：换了空间就不能再拿 rev 比大小 */
  private lastSpaceId = '';
  /** 「TA 做了什么」已经提醒到哪个时间点（本地持久化，避免重开 App 重复弹） */
  private activitySeenAt = 0;
  /** 本次进程里已经提示过的动态 id（防止"每次进来又弹一遍"） */
  private activityAnnounced = new Set<string>();
  /** 本地模式下也兜住，避免同一批动态弹两次 */
  private activityWatchReady = false;
  /** 当前挂在界面上的"TA 刚做了什么"提示框（需要点一下才消失） */
  private activityNotice: ActivityItem | null = null;
  /** 老版本 file:// 头像只尝试迁一次服务器，避免死循环 */
  private avatarMigrateTried = false;
  /** 片库接口的本机缓存（离线时用；联网后以服务端那份为准） */
  private cmsLocalCache: string[] = [];
  /** 电视直播源的本机缓存（同样是"离线时用，联网以服务端那份为准"） */
  private liveLocalCache: string[] = [];
  /** 通知偏好（免打扰 / 分类 / 锁屏程度）：本地持久化，退出页面不会丢 */
  notifyPrefs: NotifyPrefs = { ...DEFAULT_NOTIFY_PREFS };
  /**
   * 自设提醒（用药/饮水/休息）的到点检查。
   * 以前这些提醒只被存下来、界面显示「已开启」，全 App 没有任何调度器 ——
   * 用户永远收不到。这里每分钟比一次 HH:mm，当天只提醒一次。
   */
  private careReminderDay = '';
  private careReminderFired = new Set<string>();

  private tickCareReminders(now: number): void {
    const d = new Date(now);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const minute = `${hh}:${mm}`;
    const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (day !== this.careReminderDay) {
      this.careReminderDay = day;
      this.careReminderFired.clear();
    }
    const list = this.snapshot.careReminders ?? [];
    for (const r of list) {
      if (!r || !r.enabled || r.time !== minute) continue;
      // 只提醒自己设的（对方的提醒由他自己那台手机提醒）
      if (r.ownerRole && r.ownerRole !== this.role) continue;
      const key = `${day}|${r.id}`;
      if (this.careReminderFired.has(key)) continue;
      this.careReminderFired.add(key);
      const text =
        r.note?.trim() ||
        (r.kind === 'medicine' ? '该吃药了' : r.kind === 'water' ? '该喝水了' : '起来休息一下');
      void presentIfAllowed(this.notifyPrefs, 'care-reminder', `提醒你：${text}`, d).catch(
        () => undefined,
      );
    }
  }

  /** 通知流里"已经推到系统通知栏"的时间点（只存内存，避免连上就刷一堆） */
  private notifSeenAt = 0;
  /** 连接状态快照（供指示灯订阅，SSE 风格：状态一变就 bump） */
  private netInfo: ConnectionStatusInfo = {
    status: 'idle',
    label: '未连接',
    tone: 'muted',
    retryInMs: 0,
    attempt: 0,
    lastError: null,
    url: '',
  };

  constructor() {
    this.localHub = new Hub({ scale: 1, latencyMs: 120, clockSkew: { A: 0, B: 700 } });
    this.hub = this.createFacade(this.localHub);
    this.localHub.resetToEmpty();
    this.devices = {
      A: new ClientDevice({
        role: 'A',
        hub: this.hub,
        clockSkewMs: this.hub.clockSkew.A,
        playbackFactor: 1,
      }),
      B: new ClientDevice({
        role: 'B',
        hub: this.hub,
        clockSkewMs: this.hub.clockSkew.B,
        playbackFactor: 1.004,
      }),
    };
    this.hub.subscribe('A', (snap) => {
      // 远程模式下只有"用户的本地操作"才可以先撑一下界面，
      // 其余的 notify（tick / hydrate）交给服务端投影，否则两份状态会互相覆盖到闪屏
      const merged = this.withServerFields(snap);
      if (!this.remoteServer || this.localEcho) this.devices.A.applySnapshot(merged);
      this.bump();
      this.schedulePersist();
    });
    this.hub.subscribe('B', (snap) => {
      const merged = this.withServerFields(snap);
      if (!this.remoteServer || this.localEcho) this.devices.B.applySnapshot(merged);
      this.bump();
      this.schedulePersist();
    });
  }

  // -------------------------------------------------------------------------
  // 本地持久化
  // -------------------------------------------------------------------------

  private schedulePersist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistNow();
    }, 500);
  }

  async persistNow(): Promise<boolean> {
    const okSave = await saveState(this.hub.serialize());
    if (okSave) {
      this.savedAt = Date.now();
      const info = await storageInfo();
      this.storageBytes = info.bytes;
      this.bump();
    }
    return okSave;
  }

  /** 启动时先尝试恢复上次的状态；没有就保留示例数据 */
  async hydrateFromStorage(): Promise<'restored' | 'fresh' | 'error'> {
    try {
      const loaded = await loadState();
      if (loaded.state && this.hub.hydrate(loaded.state)) {
        this.savedAt = loaded.savedAt;
        const info = await storageInfo();
        this.storageBytes = info.bytes;
        this.hydrated = true;
        this.bump();
        return 'restored';
      }
      this.hydrated = true;
      this.bump();
      return 'fresh';
    } catch {
      this.hydrated = true;
      return 'error';
    }
  }

  /** 只在本机执行、绝不发给服务器的方法（清单在 core 里，测试会静态校验） */
  private readonly localOnlyMethods = new Set<string>(LOCAL_ONLY_HUB_METHODS);

  /**
   * 把 Hub 包一层：
   * - 本机模式：原样调用本地 Hub；
   * - 远程模式：写操作转给服务器（服务器是唯一权威），本地乐观返回 ok，
   *   真正的状态通过长连接/长轮询 hydrate 回来。
   */
  private createFacade(local: Hub): Hub {
    const store = this;
    return new Proxy(local, {
      get(target, prop) {
        const value = (target as unknown as Record<string | symbol, unknown>)[prop as string];
        if (typeof value !== 'function') return value;
        const name = String(prop);
        const bound = (value as (...a: unknown[]) => unknown).bind(target);
        if (store.localOnlyMethods.has(name)) return bound;
        return (...args: unknown[]) => {
          const callLocal = () => (value as (...a: unknown[]) => unknown).apply(target, args);
          if (!store.remoteServer || store.remoteRole === null) return callLocal();
          // 防御：所有转发到服务器的方法，第一个参数都必须是 role。
          // 不是 role 的方法一律在本机执行——宁可少同步一次，也不要对着服务器
          // 发一条注定被拒的请求，然后在界面上刷屏报错。
          const first = args[0];
          const role = first === 'A' || first === 'B' ? (first as Role) : null;
          if (role === null) return callLocal();

          // 远程模式下**所有写操作都先在本地执行一遍**。
          // 以前只对少数"赋值类"方法这么做，其余只是发给服务器、界面等快照回来——
          // 结果服务器一旦拒收（例如它那边空间是空的），用户只看到"已送出"却什么都没有，
          // 所有模块都像坏了。本地先落地 + 服务端快照覆盖，界面永远有反馈。
          const localResult = (() => {
            // 标记"这次 notify 是用户操作引发的"：只有这种 notify 才允许把本地投影
            // 刷到界面上（否则 tick/hydrate 的 notify 会和服务端投影互相覆盖 → 闪屏）
            store.localEcho = true;
            try {
              return callLocal();
            } finally {
              store.localEcho = false;
            }
          })();
          store.bump();
          const r = localResult as { ok?: boolean } | null;
          if (r && r.ok === false) {
            // 本地校验就没过：服务端同样会拒，不必再发一次
            return localResult;
          }

          const methodArgs = args.slice(1);
          store.forwardRpc(role, name, methodArgs);
          return localResult;
        };
      },
    }) as Hub;
  }

  get remoteStatus(): {
    connected: boolean;
    server: string;
    role: Role | null;
    rev: number;
    transport: 'ws' | 'http' | null;
    /** 当前实际生效的地址（可能是备用地址） */
    activeServer: string;
    usedBackup: boolean;
  } {
    return {
      connected: this.remoteServer !== '' && this.remoteRole !== null,
      server: this.remoteServer,
      role: this.remoteRole,
      rev: this.remoteRev,
      transport: this.transport,
      activeServer: this.activeServer,
      usedBackup: this.usedBackup,
    };
  }

  /** 网络指示灯用的状态（绿/黄/红 + 下次重连倒计时） */
  get netStatus(): ConnectionStatusInfo {
    return this.netInfo;
  }

  /** socket 是否真的连着（指示灯绿 = true） */
  get isOnline(): boolean {
    return this.netInfo.status === 'open';
  }

  /** 只做连通性测试：打 /ping（规格要求），老服务端回退 /health */
  async testServer(rawUrl: string): Promise<{ ok: boolean; text: string; detail: string }> {
    const check = checkServerUrl(rawUrl);
    if (!check.ok) {
      return { ok: false, text: '无法连接服务器', detail: check.error ?? '地址不合法' };
    }
    const res = await pingServer(check.url);
    if (res.ok) return { ok: true, text: '连接正常', detail: res.detail };
    return { ok: false, text: '无法连接服务器', detail: res.detail };
  }

  /**
   * 四步网络诊断：地址 → HTTPS/`/ping` → WebSocket 升级。
   *
   * 直接把「断在 DNS、TLS、还是长连接升级」指出来，不用再靠猜。
   * 每次都会真实发请求，不缓存结果。
   */
  async diagnose(rawUrl: string): Promise<DiagReport> {
    return diagnoseServer(
      rawUrl,
      {
        ping: (url) => this.probePing(url),
        openSocket: (wsUrl, timeoutMs) => this.probeWebSocket(wsUrl, timeoutMs),
      },
      checkServerUrl,
      (u) => toWebSocketUrl(u),
    );
  }

  /** 诊断用：直接打 /ping，失败时把原始错误抛出去交给分类器 */
  private async probePing(url: string): Promise<{ ok: boolean; text: string; detail: string }> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8_000) : null;
    try {
      const res = await fetch(`${url}/ping`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller?.signal as AbortSignal,
      });
      const body = await res.text();
      if (!res.ok) {
        return {
          ok: false,
          text: '无法连接服务器',
          detail: `/ping 返回 HTTP ${res.status}：${body.slice(0, 100)}`,
        };
      }
      let parsed: unknown = body;
      try {
        parsed = JSON.parse(body);
      } catch {
        // 不是 JSON 也算通，只是服务端长得不一样
      }
      const summary =
        parsed && typeof parsed === 'object' && 'service' in (parsed as Record<string, unknown>)
          ? `service=${String((parsed as Record<string, unknown>).service)}`
          : body.slice(0, 80);
      return { ok: true, text: '连接正常', detail: `/ping 正常（${summary}）` };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 诊断用：真的尝试 WebSocket 升级，成功/失败都给结论 */
  private probeWebSocket(wsUrl: string, timeoutMs: number): Promise<{ ok: boolean; detail: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean, detail: string) => {
        if (settled) return;
        settled = true;
        resolve({ ok, detail });
      };
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        finish(false, `当前环境无法创建 WebSocket：${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      const timer = setTimeout(() => {
        try {
          socket.close();
        } catch {
          /* 忽略 */
        }
        finish(false, `握手超时（${timeoutMs}ms 内没有完成 upgrade）`);
      }, timeoutMs);
      socket.onopen = () => {
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          /* 忽略 */
        }
        finish(true, 'WebSocket 升级成功');
      };
      socket.onerror = () => {
        clearTimeout(timer);
        finish(false, '升级失败：服务端可能没有 upgrade 处理，或被网络中间设备拦截');
      };
      socket.onclose = (ev) => {
        clearTimeout(timer);
        if (!settled) finish(false, `连接被关闭（code=${ev?.code ?? '未知'}）`);
      };
    });
  }

  /**
   * 连接同步服务器。
   *
   * 依次尝试「主地址 → 备用地址」（见 buildServerCandidates）：
   * 每个地址都先试 WebSocket 长连接，不行再退回 HTTP 长轮询。
   * 这样公网域名在某条链路上被按 SNI 拦掉时，备用地址（局域网 IP / 另一个域名）能自动顶上。
   */
  async connectRemote(rawUrl: string, rawBackup?: string | null): Promise<boolean> {
    if (!this.token) {
      // 没有账号就没有身份，连上去也拿不到任何数据
      this.remoteLastError = '请先创建账号或登录';
      this.bump();
      return false;
    }
    const candidates = buildServerCandidates(rawUrl, rawBackup ?? this.backupServer);
    if (candidates.length === 0) {
      const check = checkServerUrl(rawUrl);
      this.connectWarnings = check.warnings;
      this.remoteLastError = check.error ?? '请先填一个有效的服务器地址';
      this.toast(this.remoteLastError, 'error');
      this.bump();
      return false;
    }

    let lastRawError: string | null = null;
    // 明确进入"连接中"：从点按钮到真正连上，指示灯只该是黄色「连接中」，
    // 不要中途闪「重连中 / 失败」——那看起来像连接坏了。
    this.netInfo = {
      status: 'connecting',
      label: '连接中',
      tone: 'warn',
      retryInMs: 0,
      attempt: 0,
      lastError: null,
      url: candidates[0].url,
    };
    this.bump();
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const isBackup = i > 0;
      this.connectWarnings = candidate.warnings;
      // 保留"连接中"状态：这里会依次试主地址 → 备用地址 → WS → 长轮询，
      // 每试一次都重置成"未连接"会让指示灯狂闪。
      this.teardownConnection(true);

      const ok = await this.tryConnect(candidate.url);
      if (ok) {
        this.remoteServer = candidate.url;
        this.activeServer = candidate.url;
        this.usedBackup = isBackup;
        await saveServerUrl(candidates[0].url, candidates[1]?.url ?? '');
        await setAutoConnect(true);
        const how = isBackup ? '备用地址' : '主地址';
        const channel = this.transport === 'ws' ? '长连接' : '长轮询兼容模式';
        this.toast(`已连接（${how} · ${channel}）`, 'ok');
        this.bump();
        return true;
      }
      lastRawError = lastRawError ?? this.remoteLastError;
    }

    // 所有候选都不通：把原生错误归类成人话（UnknownHostException → 域名解析失败 …）
    const failure = classifyNetworkError(lastRawError ?? '连接失败');
    const tried = candidates.map((c) => c.url).join(' / ');
    this.remoteLastError = `${failure.title}（已尝试 ${tried}）。${failure.advice}`;
    this.remoteServer = '';
    this.transport = null;
    this.toast(failure.title, 'error');
    this.bump();
    return false;
  }

  /** 针对单个地址：先 WS，失败再 HTTP 长轮询 */
  private async tryConnect(url: string): Promise<boolean> {
    if (!this.token) {
      this.remoteLastError = '还没有登录账号';
      return false;
    }
    const wsOk = await this.connectWebSocket(url);
    if (wsOk) {
      this.transport = 'ws';
      this.remoteLastError = null;
      return true;
    }

    // 公网 http 地址的常见坑：ws:// 走 80 端口，Cloudflare 之类会把它 301 到 https
    // 从而握不上手，但 wss:// 是通的。这里补一次 wss 尝试，别白白退化成轮询。
    const probe = checkServerUrl(url);
    if (probe.ok && !probe.isHttps && probe.hostKind === 'public') {
      const wssUrl = toWebSocketUrl(url.replace(/^http:\/\//i, 'https://'));
      if (wssUrl !== toWebSocketUrl(url)) {
        const wssOk = await this.connectWebSocket(wssUrl, 6_000);
        if (wssOk) {
          this.transport = 'ws';
          this.remoteLastError = null;
          return true;
        }
      }
    }

    // 长轮询回退：先问服务器"我是谁、绑到没有"
    const mine = await fetchMe(url, this.token);
    if (!mine.ok) {
      this.remoteLastError = mine.error || this.netInfo.lastError || '连接失败';
      return false;
    }
    this.remoteRole = mine.value.account.role;
    this.role = mine.value.account.role;
    this.remoteRev = mine.value.rev ?? 0;
    this.transport = 'http';
    this.httpRunning = true;
    this.remoteLastError = null;
    this.netInfo = {
      status: 'open',
      label: '已连接',
      tone: 'ok',
      retryInMs: 0,
      attempt: 0,
      lastError: null,
      url,
    };
    void this.httpLoop();
    return true;
  }

  /** 建立 WS 并等待握手结果；成功返回 true（此时 hello 已发出） */
  private connectWebSocket(url: string, handshakeMs = 8_000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      // 先声明再注册监听：ConnectionManager.connect() 会同步回调一次 'connecting'，
      // 如果监听里引用了后声明的 const，会踩到暂时性死区。
      let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
      let conn: ConnectionManager;
      try {
        conn = new ConnectionManager({
        url,
        heartbeatMs: 20_000,
        ackTimeoutMs: 15_000,
        // 手机上（尤其公网/隧道）短暂收不到东西是常态：
        // 30 秒就判死会不停重连，正是"连上了一会儿又不稳定"的来源。
        // 给到 60 秒：这段时间内先用 HTTP 拉一次状态自查，不动 socket。
        silenceLimitMs: 60_000,
      });
      } catch (err) {
        this.remoteLastError = err instanceof Error ? err.message : String(err);
        resolve(false);
        return;
      }
      this.conn = conn;

      const giveUp = () => {
        if (settled) return;
        settled = true;
        if (handshakeTimer) clearTimeout(handshakeTimer);
        conn.destroy();
        if (this.conn === conn) this.conn = null;
        resolve(false);
      };

      conn.onStatus((info) => {
        // 已经被换掉的老连接（重连时旧 conn 会被 destroy）迟到的"已断开"事件
        // 绝不能覆盖新连接的状态。以前没有这层判断，界面会出现
        // "其实已经连上了，却红着显示已断开"（真实事故，模拟器上复现过）。
        if (this.conn !== conn) return;
        // 首次握手期间还在试各种通道，这时候给用户看「连接中」而不是「重连中」，
        // 否则从点「连接」到真正连上会一路闪：重连中 → 失败 → 重连中 → 已连接。
        this.netInfo = !settled && info.status !== 'open'
          ? { ...info, status: 'connecting', label: '连接中', tone: 'warn' }
          : info;
        if (info.status === 'open') this.remoteLastError = null;
        else if (info.lastError) this.remoteLastError = info.lastError;
        this.bump();
        // 连不上就别一直退避下去，交给上层去试兼容通道（约 2 秒后回退到长轮询）
        if (info.status === 'reconnecting' && info.attempt >= 2) giveUp();
      });

      // 首次连上：报身份 + 补发当前状态
      conn.onOpened(() => {
        if (this.conn !== conn) return;
        this.sendHello();
        if (!settled) {
          settled = true;
          if (handshakeTimer) clearTimeout(handshakeTimer);
          resolve(true);
        }
      });

      // 断线重连成功：补发当前房间状态与播放进度，完成状态恢复
      conn.onResync(() => {
        if (this.conn !== conn) return;
        /*
         * 重连必须重新报身份：这是一条**新连接**，服务端那边这条连接的
         * role / accountId 还是空的（身份靠 hello 里的 token 建立）。
         * 以前这里只发 resume（不带 token），服务端因为"没身份"直接丢掉所有投影推送，
         * 客户端却因为收到 pong 而认为链路健康 —— 指示灯绿、Toast 说已重连，
         * 实际对方的任何更新都收不到。sendHello 内部已经包含 sendResume。
         */
        this.sendHello();
      });

      conn.onMessage((msg) => {
        if (this.conn !== conn) return;
        this.handleServerMessage(msg);
      });
      conn.connect();

      handshakeTimer = setTimeout(() => {
        if (settled) return;
        this.remoteLastError = this.remoteLastError ?? '长连接握手超时';
        giveUp();
      }, handshakeMs);
    });
  }

  /** 连上后的第一条消息：我是谁（token 就是身份）、我当前的进度 */
  private sendHello(force = false): void {
    void force;
    this.conn?.send(
      {
        v: 1,
        type: 'hello',
        // token 就是身份：服务端据此找到我的账号和空间，客户端不再自称 A/B
        token: this.token,
        // 设备 ID 只用于"同账号多设备"的诊断，不参与身份判定
        clientId: this.clientId,
        rev: this.remoteRev,
      },
      true,
    );
    this.sendResume(false);
  }

  /**
   * 状态恢复：把当前房间与播放进度补发给服务端。
   * 重连成功后（onResync）也会走这里，只是多弹一条提示。
   */
  private sendResume(announce = true): void {
    const room = this.snapshot.activeRoom;
    const sent = this.conn?.send({
      v: 1,
      type: 'resume',
      rev: this.remoteRev,
      room: room
        ? {
            id: room.id,
            title: room.movieTitle,
            state: room.state,
            leaderRole: room.leaderRole,
            playing: room.mediaState.action === 'play',
            positionSec: Math.max(0, this.device.player.positionSec),
            updatedAt: Date.now(),
          }
        : null,
    });
    if (announce && sent) this.toast('已把当前进度同步给服务器', 'ok');
  }

  /** 发一条 RPC（断线时自动入队，重连后补发） */
  /**
   * 转发一条 RPC。
   *
   * 关键点：**绝不能静默丢消息**。以前是 `this.conn?.send(...)`——
   * 长连接被销毁后 conn 是 null，可选链什么都不做，用户的点击就石沉大海
   * （「完成建档点不动」就是这么来的）。现在：
   *   1. 长连接开着 → 走 WS（断线时由 ConnectionManager 入队补发）
   *   2. 长连接不在了 → 直接走 HTTP 兜底，保证操作真的到达服务器
   */
  private forwardRpc(role: Role, method: string, args: unknown[]): void {
    void role; // 账号模型下服务端靠 token 认人，role 只用于本机乐观写入
    if (this.transport === 'ws' && this.conn && this.conn.isOpen) {
      const id = this.rpcSeq;
      this.rpcSeq += 1;
      if (
        this.conn.send(
          { v: 1, type: 'rpc', id, method, args, token: this.token, clientId: this.clientId },
          true,
        )
      ) {
        return;
      }
    }
    if (this.transport === 'ws' && this.conn) {
      /*
       * 长连接在但还没连上：ConnectionManager.send 会把消息**排进队列**
       * （重连后自动补发）并返回 false。
       * 以前返回 false 之后还继续往下走 HTTP 分支 —— 同一份写操作被发两遍
       * （队列一份 + HTTP 一份），重连补发后日记/待办/弹幕/卡片各出现两条。
       * 这里发一次就返回：队列负责补发。
       */
      const id = this.rpcSeq;
      this.rpcSeq += 1;
      const queued = this.conn.send(
        { v: 1, type: 'rpc', id, method, args, token: this.token, clientId: this.clientId },
        true,
      );
      if (!queued) {
        this.remoteLastError = '连接中断，操作已排队等待重连';
        this.bump();
      }
      return;
    }
    // 长连接彻底没有 / 已关闭：走 HTTP，别把操作吞掉
    if (!this.remoteServer || !this.token) return;
    void rpcOnServer(this.remoteServer, this.token, method, args).then((result) => {
      if (!result.ok) {
        // 只有明确的 auth 才踢下线。以前这里是 /登录|认证|token/ 正则匹配文案，
        // 于是服务端那句「还没完成身份认证，请稍后重试」也会把用户踢到登录页
        // （真实事故：网络一抖就"莫名其妙退出登录"）。
        if (result.code === 'auth') {
          void this.handleAuthExpired(result.error);
          return;
        }
        if (result.code === 'retry') {
          // 连接刚建好、服务端还没认人：1.2 秒后补发一次，别打扰用户
          setTimeout(() => {
            if (this.token) void this.forwardRpc(this.role, method, args);
          }, 1200);
          return;
        }
        this.remoteLastError = result.error ?? null;
        this.toast(`同步失败：${result.error ?? '未知错误'}`, 'error');
      }
    });
  }

  /** 处理服务端下行消息（协议见 README §6.10） */
  private handleServerMessage(msg: Record<string, unknown> | null): void {
    if (!msg) return;
    // 任何下行消息都算"链路活着"：看门狗靠它判断连接是不是半死
    this.lastInboundAt = Date.now();
    const type = typeof msg.type === 'string' ? msg.type : '';
    switch (type) {
      case 'welcome': {
        if (msg.role === 'A' || msg.role === 'B') {
          this.remoteRole = msg.role;
          this.role = msg.role;
        }
        if (typeof msg.rev === 'number') this.remoteRev = msg.rev;
        this.bump();
        return;
      }
      case 'state':
      case 'snapshot': {
        const rev = typeof msg.rev === 'number' ? msg.rev : null;
        const payload = (msg.state ?? msg.snapshot) as SpaceSnapshot | undefined;
        if (!payload) return;
        // 服务端每份快照都带 role：绑定之后我的槽位会从 A 变成 B，
        // 不采纳它就会一直用旧槽位 —— 界面把对方当成"我"，
        // 甚至把对方的档案写成自己的（真实事故）。
        this.adoptServerRole(msg.role);
        // 换了空间（重新绑定 / 服务端重建）时，rev 是**新的计数**，比大小毫无意义。
        const spaceChanged = Boolean(payload.spaceId) && payload.spaceId !== this.lastSpaceId;
        if (!spaceChanged && rev !== null && rev < this.remoteRev) return;
        if (payload.spaceId) this.lastSpaceId = payload.spaceId;
        if (rev !== null) this.remoteRev = rev;
        this.lastStateAt = Date.now();
        if (this.netInfo.status !== 'open') {
          this.netInfo = {
            ...this.netInfo,
            status: 'open',
            label: '已连接',
            tone: 'ok',
            retryInMs: 0,
            attempt: 0,
            lastError: null,
          };
        }
        this.applyRemoteSnapshot(payload);
        return;
      }
      case 'rpc-result': {
        const id = typeof msg.id === 'number' ? msg.id : -1;
        const result = (msg.result ?? { ok: true, value: null }) as Result<unknown>;
        const waiter = this.pendingRpcs.get(id);
        if (waiter) {
          this.pendingRpcs.delete(id);
          waiter(result);
          // 有调用方在等这个结果：错误由它自己用更准确的话术提示，
          // 这里不再补一条"同步失败"，否则同一个失败会弹两次。
          return;
        }
        if (result && result.ok === false) {
          this.remoteLastError = result.error ?? '同步失败';
          this.toast(`同步失败：${result.error ?? '未知错误'}`, 'error');
        }
        return;
      }
      case 'error': {
        this.remoteLastError = typeof msg.error === 'string' ? msg.error : '服务器返回错误';
        // 认证失效：token 过期/账号被删。由服务端显式给 code，不靠文案猜。
        // 连接器自己会重连，"还没完成认证"由重连后的 hello 解决，不能把用户踢下线。
        if (msg.code === 'auth') {
          void this.handleAuthExpired(this.remoteLastError);
          return;
        }
        this.toast(this.remoteLastError, 'error');
        this.bump();
        return;
      }
      case 'pong':
        return;
      default:
        return;
    }
  }

  /**
   * 应用服务端投影（远程模式的唯一入口）。
   *
   * 铁律：**服务端有档案，就以服务端为准**。
   * 以前这里在"本地建过档、服务端这份是空的"时，把本地整份成员对象盖到投影上
   * （`{...remoteMe, ...localMe}`），连名字、性别、固定 ID 都盖掉了——
   * 于是「我们」页显示的是本地那份别人写进去的档案，
   * 两台手机会同时出现"自己跟自己绑定""女端上显示男方的名字"（真实事故）。
   *
   * 现在只有一种情况允许用本地补：服务端那个槽位**确实还没有档案**（没有名字）。
   */
  /**
   * 只有**服务端**才算得出来的字段（对方的经期关怀提示等）。
   *
   * 真实问题：「TA 今天可能需要关心」那张卡一有一没有地闪。
   * 原因：远程模式下每次"本机写操作"都会把**本地 hub 的投影**刷到界面上（localEcho），
   * 而本地根本拿不到对方的 period（服务端不下发），于是 partnerPeriod 变成 null →
   * 卡片消失；下一条服务器投影一到又出现 → 看起来就是一直在闪。
   * 这里把服务端那份留一份，合并回本地投影。
   */
  private serverOnlyCache: {
    partnerPeriod?: SpaceSnapshot['partnerPeriod'];
    partnerMood?: SpaceSnapshot['partnerMood'];
    partnerOnline?: SpaceSnapshot['partnerOnline'];
    recaps?: SpaceSnapshot['recaps'];
    annual?: SpaceSnapshot['annual'];
  } = {};

  private withServerFields(snap: SpaceSnapshot): SpaceSnapshot {
    if (!this.remoteServer) return snap;
    const cached = this.serverOnlyCache;
    /*
     * 这四个字段是"服务端权威"的：本地 hub 那边要么拿不到（对方的 period），
     * 要么算不全（房间回忆卡只有服务端有全量历史）。
     * 本机每做一次写操作都会把本地投影刷到界面，如果不在这里垫住，
     * 首页的关怀卡、影院的「我们的片单」、在线小圆点就会一有一没有地闪。
     */
    const partnerPeriod = cached.partnerPeriod ?? snap.partnerPeriod ?? null;
    const partnerMood = cached.partnerMood ?? snap.partnerMood ?? null;
    const partnerOnline = cached.partnerOnline ?? snap.partnerOnline;
    // 回忆卡：本机刚结束一场（本地更长）就用本地，否则用服务器那份
    const localRecaps = snap.recaps ?? [];
    const cachedRecaps = cached.recaps ?? [];
    const recaps = localRecaps.length >= cachedRecaps.length ? localRecaps : cachedRecaps;
    /*
     * 年度报告同理：本地投影是按本地房间历史现算的，一旦本地那份还不完整，
     * 年报里的数字就会一会儿有一会儿没有（用户看的是同一屏，感觉在抽动）。
     */
    const annual =
      (snap.annual?.moviesCount ?? 0) >= (cached.annual?.moviesCount ?? 0)
        ? snap.annual
        : cached.annual ?? snap.annual;
    if (
      partnerPeriod === snap.partnerPeriod &&
      partnerMood === snap.partnerMood &&
      partnerOnline === snap.partnerOnline &&
      recaps === snap.recaps &&
      annual === snap.annual
    ) {
      return snap;
    }
    return { ...snap, partnerPeriod, partnerMood, partnerOnline, recaps, annual };
  }

  private applyRemoteSnapshot(projected: SpaceSnapshot): void {
    // 先把"只有服务端能算"的字段记下来，供本地投影合并（否则首页关怀卡会闪）
    this.serverOnlyCache = {
      partnerPeriod: projected.partnerPeriod ?? this.serverOnlyCache.partnerPeriod ?? null,
      partnerMood: projected.partnerMood ?? this.serverOnlyCache.partnerMood ?? null,
      partnerOnline: projected.partnerOnline ?? this.serverOnlyCache.partnerOnline,
      recaps: projected.recaps ?? this.serverOnlyCache.recaps,
      annual: projected.annual ?? this.serverOnlyCache.annual,
    };
    // ---- 硬自愈：先确认"我"在这个空间的哪一格 ----
    // 每个槽位都带着那个人的账号 ID，而我的账号 ID 是本地 token 决定的、不会变，
    // 所以"我在哪一格"是一道确定性题：谁那格的 publicId 等于我的账号 ID，我就是那一格。
    // 真实事故：她注册时是 A，被绑进对方空间后应该是 B，但客户端没及时更新槽位，
    // 于是把对方（wrw）的档案当成自己显示 —— 看起来像"我注册的 oo 变成了 wrw"。
    const mineRole = resolveMyRole(this.accountId, projected.members);
    if (mineRole && (this.remoteRole !== mineRole || this.role !== mineRole)) {
      this.remoteRole = mineRole;
      this.role = mineRole;
      this.toast(`已自动校正身份：你在空间里的这一格是 ${this.myNameAt(projected, mineRole)}`, 'info');
    }
    const role = this.remoteRole ?? this.role;

    const localMe = this.localHub.snapshot(role).members[role];
    const remoteMe = projected.members?.[role];
    const serverHasProfile = Boolean(remoteMe && remoteMe.profileCompleted && remoteMe.name);

    // 账号模型下档案的权威来源是**服务端账号记录**，这里只做两件事：
    //   1. 服务端有档案 → 更新本地备份
    //   2. 服务端还没有档案 → 什么都不做（服务端会用自己的账号档案 seed）
    //
    // 以前这里有一段"服务端槽位是空、本机有档案 → 用本机的补上并推给服务端"的逻辑，
    // 它是为 v1（服务端把设备分到空的端）打的补丁。在账号模型里它是有害的：
    // 一台手机上残留的**别人的**档案（同一台手机先后登过两个账号、或注册页预填了旧名字）
    // 会被当成"我的"推上去，于是两个人的昵称都变成了同一个（真实事故：
    // 她叫 9，他叫 jog，最后服务器上两个账号都叫 jog）。
    if (serverHasProfile && remoteMe) {
      this.profileBackup = {
        name: remoteMe.name,
        birthDate: remoteMe.birthDate,
        gender: remoteMe.gender,
        avatarUri: remoteMe.avatarUri,
        savedAt: Date.now(),
      };
      void saveProfileBackup({
        name: remoteMe.name,
        birthDate: remoteMe.birthDate,
        gender: remoteMe.gender,
        avatarUri: remoteMe.avatarUri,
      });
    }

    this.localHub.hydrateProjected(projected, role);
    // 显示以服务端投影为准：本地 hub 重新投影会丢掉"对方的经期关怀提示"这类
    // 只有服务端才算得出来的东西，这里再用服务端原始投影覆盖一次。
    this.devices[role].applySnapshot(projected);
    // 片库接口：以服务端那份为准（只有管理者能改）
    this.syncCmsSources(projected);
    // 电视直播源：同一套规则（一人管理、两人共用）
    this.syncLiveSources(projected);
    // 老版本把头像/背景存成了手机本地路径：对方看不到、换机就丢。
    // 连上服务器后自动补传一次（只试一次，失败不打扰）。
    if (!this.avatarMigrateTried) {
      this.avatarMigrateTried = true;
      const mineAvatar = projected.members?.[role]?.avatarUri ?? null;
      const bg = projected.profile?.backgroundUri ?? null;
      if (avatarKind(mineAvatar) === 'local' || avatarKind(bg) === 'local') {
        void this.migrateLocalAvatar();
      }
    }
    this.announcePartnerActivity(projected);
    this.pushSystemNotifications(projected);
    this.bump();
  }

  /**
   * 片库接口的同步：
   *  - 服务端有 → 覆盖本机缓存（双方看到同一份）；
   *  - 服务端还没有、本机有 → 补推一次（谁先配谁是管理者）；
   *  - 都没有 → 什么都不做。
   */
  private syncCmsSources(projected: SpaceSnapshot): void {
    const shared = projected.cms?.apis ?? [];
    if (shared.length > 0) {
      if (shared.join('|') !== this.cmsLocalCache.join('|')) {
        const prev = this.cmsLocalCache;
        this.cmsLocalCache = shared;
        void saveCmsApiList(shared);
        this.applySharedSourceChange('cms', prev, shared);
      }
      return;
    }
    /*
     * CMS_PUSH_GUARD：别把"刚被自己删空"的状态又推回去。
     * 见 syncLiveSources 里那段注释（这是同一类事故）。
     */
    if (Date.now() < this.sourcePushMutedUntil) return;
    if (this.cmsLocalCache.length > 0 && this.token) {
      const pushed = this.cmsLocalCache;
      void this.sendRpcAwait('setCmsApis', [pushed]);
    }
  }

  /**
   * 电视直播源的同步：规则和片库接口一模一样。
   *
   *  - 服务端有 → 覆盖本机缓存（两个人看到同一份台单）；
   *  - 服务端还没有、本机有 → 补推一次（谁先配谁是管理者）；
   *  - 都没有 → 什么都不做。
   */
  private syncLiveSources(projected: SpaceSnapshot): void {
    const shared = (projected as { live?: { urls?: string[] } }).live?.urls ?? [];
    if (shared.length > 0) {
      if (shared.join('|') !== this.liveLocalCache.join('|')) {
        const prev = this.liveLocalCache;
        this.liveLocalCache = shared;
        void saveLiveSources(entriesFromUrls(shared));
        this.applySharedSourceChange('live', prev, shared);
      }
      return;
    }
    /*
     * ★ 真实事故：「删掉的直播源过一会儿自己又回来了 / 怎么删都删不掉」。
     *
     * 这里的"补推"是给"服务端还没有、本机有"准备的。但删掉**最后一个**源之后，
     * 服务端那份就是空的（length 0），而本机缓存那时还来不及更新，
     * 于是这一支把用户刚删掉的地址又原样推回服务器 —— 服务器重新存上，
     * 下一份投影把它推回来，界面里那一行就"复活"了。
     *
     * 所以：用户自己刚写过源列表的这段时间里，一律不许自动补推。
     */
    if (Date.now() < this.sourcePushMutedUntil) return;
    if (this.liveLocalCache.length > 0 && this.token) {
      const pushed = this.liveLocalCache;
      void this.sendRpcAwait('setLiveSourceUrls', [pushed]);
    }
  }

  /**
   * 共享的源列表变了（对方加的 / 对方删的）→ **本机的缓存也要跟着变**。
   *
   * 用户的原话：「我在软件里删掉，服务器上也要跟着删掉，不要删了不同步」。
   * 列表本身是靠服务器同步的（setCmsApis / setLiveSourceUrls），但**缓存是本机各存一份**，
   * 不在这里对齐就会出现：你在这台手机上删了一个接口，另一台手机上照旧能看到它的片子
   * （因为 `lib:home` 这份合并缓存里还留着那个站的片），看起来就像"删了没同步"。
   *
   * 所以收到新的列表时统一做三件事：
   *   1. 删掉的地址记进"已删除"名单 —— 连 APK 里打包的种子缓存一起看不见；
   *   2. 清掉它自己的缓存文件；
   *   3. 重建/丢弃合并缓存（片库 lib:home / 直播台单 live:catalog / 测速 health:live）。
   * 反过来，新加回来的地址要从"已删除"名单里移出来，不然它会一直不显示。
   */
  private applySharedSourceChange(kind: 'cms' | 'live', prev: string[], next: string[]): void {
    const removed = prev.filter((u) => !next.includes(u));
    const added = next.filter((u) => !prev.includes(u));
    if (removed.length === 0 && added.length === 0) return;
    void (async () => {
      try {
        for (const url of removed) {
          await addDeletedApi(url);
          if (kind === 'cms') await dropCmsCache(cmsApiCacheKey(url));
        }
        for (const url of added) await removeDeletedApi(url);
        if (kind === 'cms') {
          await rebuildLibHome(next);
        } else {
          // 台单是"多源合并"的结果，删/加任何源都让这份合并缓存作废
          await dropCmsCache('live:catalog');
          const health = await readCmsCache<Record<string, unknown>>('health:live');
          if (health?.value && typeof health.value === 'object') {
            const nextHealth = { ...(health.value as Record<string, unknown>) };
            for (const url of removed) delete nextHealth[url];
            await writeCmsCache('health:live', nextHealth);
          }
        }
      } catch {
        /* 缓存对齐失败不影响源列表本身的同步 */
      }
      this.bump();
    })();
  }

  /**
   * 「TA 刚做了什么」→ 立刻在界面上弹一条提示框。
   *
   * 数据源是快照里的 `activity`（服务端只下发**对方**的动作），这里负责
   * 只提醒"还没提醒过的"：按时间点记账，重连、重开 App 都不会重复弹。
   * 多条一起到达（比如刚连上时补了一堆）只弹最新的一条 + 一句"还有 N 条"。
   */
  private announcePartnerActivity(projected: SpaceSnapshot): void {
    // 还没读完本地"已提醒到哪"的位置就弹，会把最近 60 条一次性全弹出来
    if (!this.activityWatchReady) return;
    const feed = projected.activity ?? [];
    if (feed.length === 0) return;
    const fresh = feed
      .filter((a) => a.at > this.activitySeenAt)
      .sort((a, b) => b.at - a.at);
    if (fresh.length === 0) return;
    const newest = fresh[0];
    this.activitySeenAt = Math.max(this.activitySeenAt, newest.at);
    void saveActivitySeenAt(this.activitySeenAt);
    /*
     * 同一条动态只在本次进程里提示一次：
     * 以前 activitySeenAt 靠 AsyncStorage 持久化，一旦那次写入失败（或换了账号/清了存档），
     * 每次进 App 都会把同一批动态再弹一遍（用户反馈"每次都弹"）。
     */
    if (this.activityAnnounced.has(newest.id)) return;
    this.activityAnnounced.add(newest.id);
    // 除了会消失的 Toast，再挂一个需要点掉的提示框（低头两秒也不会错过）
    this.activityNotice = newest;
    if (fresh.length > 1) {
      this.toast(`${activityToToast(newest)}（还有 ${fresh.length - 1} 条动态）`, 'info');
    } else {
      this.toast(activityToToast(newest), 'info');
    }
    // 系统通知统一在 pushSystemNotifications 里按"通知流"发（同一条消息只弹一次）
  }

  /**
   * 把服务端推来的**通知流**（已脱敏）逐条变成系统通知。
   *
   * 为什么用通知流而不是"动态"：通知流里已经包含卡片、催一下、语音邀请、影院、关怀……
   * 全部消息，而且文案在服务端就脱敏过了；用它一处发即可，不会一条消息弹两次。
   * 免打扰 / 分类开关 / 锁屏模式都在 presentIfAllowed 里生效。
   */
  private pushSystemNotifications(projected: SpaceSnapshot): void {
    const list = projected.notifications ?? [];
    if (list.length === 0) return;
    const newest = Math.max(...list.map((n) => n.at));
    // 第一次拿到快照：只记位置，不把历史消息全弹一遍
    if (this.notifSeenAt === 0) {
      this.notifSeenAt = newest;
      return;
    }
    const fresh = list
      .filter((n) => n.at > this.notifSeenAt)
      .sort((a, b) => a.at - b.at)
      .slice(-3);
    if (fresh.length === 0) return;
    this.notifSeenAt = newest;
    for (const n of fresh) {
      void presentIfAllowed(this.notifyPrefs, n.kind, n.text);
    }
  }

  /**
   * 登录状态失效（token 过期 / 账号被删 / 服务端换了数据）：立刻退回登录页。
   *
   * 为什么必须这么做：账号模型里 token 就是身份。token 失效了还留在主界面，
   * 用户看到的是一份永远同步不上去的旧数据，怎么点都"没反应"——
   * 这正是之前那类"怎么修都不对"的体验。宁可让 ta 重新登录一次。
   */
  private async handleAuthExpired(reason: string): Promise<void> {
    this.authExpired = true;
    this.toast(`${reason || '登录状态已失效'}，请重新登录`, 'warn');
    this.teardownConnection();
    this.token = '';
    this.accountId = '';
    this.accountServer = '';
    this.remoteServer = '';
    this.remoteRole = null;
    this.remoteRev = 0;
    await saveAccountSession(null);
    await setAutoConnect(false);
    this.bump();
  }

  /**
   * 手动"立刻同步"：拉一次全量状态 + 把本机档案补推一次。
   *
   * 界面上的「立即同步」按钮用它。看门狗会自动做同样的事，但人需要有个
   * 看得见、点了就一定有动作的按钮——不然"到底同没同步"只能靠猜。
   */
  async forceSyncNow(): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('还没登录账号 / 没连服务器', 'warn');
      return false;
    }
    const before = this.remoteRev;
    await this.refreshFromServer();
    if (this.conn && !this.conn.isOpen) this.conn.retryNow();
    const me = this.snapshot.members[this.role];
    if (me.profileCompleted && me.name) this.pushMyProfile();
    const moved = this.remoteRev !== before;
    this.toast(
      moved ? `已同步到最新（rev ${this.remoteRev}）` : `已和服务器核对（rev ${this.remoteRev}）`,
      moved ? 'ok' : 'info',
    );
    this.bump();
    return true;
  }

  /** 取某个槽位上的名字（自愈提示用） */
  private myNameAt(projected: SpaceSnapshot, role: Role): string {
    const name = projected.members?.[role]?.name || '';
    return name || '这一格';
  }

  /**
   * 采纳服务端下发的槽位。
   *
   * 账号模型里"我在空间的哪一格"是服务端说了算，而且会变：
   * 注册时我是自己个人空间的 A，被对方绑进去之后我变成 B。
   * 以前只有 welcome 带 role，绑定之后客户端就再也收不到新槽位了 ——
   * 于是两台手机都按 A 渲染，看到的是对方的名字，还会把对方的档案当成自己的推上去
   * （真实事故：她叫 9，绑定后服务器上她的账号也变成了 jog）。
   */
  private adoptServerRole(role: unknown): void {
    if (role !== 'A' && role !== 'B') return;
    if (this.remoteRole === role && this.role === role) return;
    this.remoteRole = role;
    this.role = role;
    this.bump();
  }

  /**
   * 我这份本地档案到底是不是"我"的。
   *
   * 判定标准很直接：我这个槽位上的 publicId 必须等于我的账号 ID。
   * 不等就说明槽位还没对齐（刚绑定、或者拿到的是旧快照）——
   * 这时候**绝对不许**把本地档案写回服务器，否则就是拿别人的名字覆盖自己的账号。
   */
  private canPushMyProfile(): boolean {
    if (!this.token || !this.accountId) return false;
    const me = this.snapshot.members[this.role];
    if (!me.profileCompleted || !me.name) return false;
    const slotId = me.publicId || '';
    return slotId === '' || slotId === this.accountId;
  }

  /** 把本地档案推回服务端（服务端丢了档案时用） */
  private pushMyProfile(): void {
    if (!this.canPushMyProfile()) return;
    const me = this.snapshot.members[this.role];
    const backup = this.profileBackup;
    const name = me.name || backup?.name || '';
    const birthDate = me.birthDate ?? backup?.birthDate ?? null;
    const gender = me.gender ?? backup?.gender ?? null;
    if (!name || !birthDate || !gender) return;
    // 走 facade：远程模式会被转发成一次 updateMyProfile RPC
    this.hub.updateMyProfile(this.role, { name, birthDate, gender });
  }

  disconnectRemote(): void {
    this.teardownConnection();
    this.remoteServer = '';
    this.remoteRole = null;
    this.transport = null;
    this.remoteRev = 0;
    void setAutoConnect(false);
    this.toast('已断开同步服务器，回到本机模式', 'warn');
    this.bump();
  }

  private teardownConnection(keepStatus = false): void {
    this.httpRunning = false;
    // 必须把 transport 一起清掉：否则 conn 已销毁、transport 还挂着 'ws'，
    // 后续所有 RPC 都会走进"长连接存在但其实不可用"的死路（真实 bug）。
    this.transport = null;
    this.activeServer = '';
    this.usedBackup = false;
    if (this.conn) {
      this.conn.destroy();
      this.conn = null;
    }
    this.pendingRpcs.clear();
    // keepStatus=true 时保留当前指示灯状态：连接过程中会依次试主地址/备用地址/WS/长轮询，
    // 每试一次都重置成"未连接"会让指示灯疯狂闪。
    if (keepStatus) return;
    this.netInfo = {
      status: 'idle',
      label: '未连接',
      tone: 'muted',
      retryInMs: 0,
      attempt: 0,
      lastError: null,
      url: '',
    };
  }

  /** 手动"立刻重连"（不走退避） */
  retryConnectionNow(): void {
    if (this.transport === 'ws' && this.conn) {
      this.conn.retryNow();
      this.bump();
      return;
    }
    // 没配置过地址就别乱连（normalizeServerUrl('') 会回落到公网默认值）
    const target = this.remoteServer || this.netInfo.url;
    if (!target) {
      this.toast('还没有填服务器地址', 'warn');
      return;
    }
    void this.connectRemote(target);
  }

  /** 启动时自动读取上次地址并连接（规格第 5 条）；用户主动断开过就不再自动连 */
  async autoConnect(): Promise<boolean> {
    if (!this.token) return false;
    const saved = await loadServerSettings();
    this.backupServer = saved.backupUrl;
    if (!saved.autoConnect) return false;
    // 地址优先级：用户填的 → 这个账号注册时用的服务器
    const url = saved.url || this.accountServer;
    if (!url) return false;
    return this.connectRemote(url, saved.backupUrl);
  }

  /**
   * 用本机数据把服务端重建出来（服务端被清过、空间为空时用）。
   * 只有本机确实已绑定、且服务端确实是空的才会成功。
   */
  async restoreToServer(): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('还没连服务器', 'warn');
      return false;
    }
    if (this.snapshot.boundAt === null) {
      this.toast('本机也还没有绑定的空间', 'warn');
      return false;
    }
    const res = await restoreSpaceOnServer(this.remoteServer, this.token, this.hub.serialize());
    if (res.ok) {
      this.toast('已把本机数据恢复到服务器', 'ok');
      this.bump();
      return true;
    }
    this.toast(res.error ?? '恢复失败', 'error');
    return false;
  }

  /**
   * 解绑并各自清空（「我们就重来一次」）。
   *
   * 账号不会被删：昵称/生日/头像还在账号上，两台手机各自回到"未绑定"，
   * 然后重新搜账号 ID 绑一次就好。这是绑定关系被搞乱时的唯一出口。
   */
  async resetServerSpace(): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('还没连服务器', 'warn');
      return false;
    }
    const ok = this.confirmFn
      ? await this.confirmFn({
          title: '解绑并清空这个双人空间？',
          message:
            '两个账号都会保留（昵称、生日、头像还在），但空间里的内容会清空，并回到"未绑定"。然后你们重新搜账号 ID 绑一次即可。',
          icon: '🧹',
          confirmText: '解绑并清空',
          cancelText: '先不要',
          danger: true,
        })
      : true;
    if (!ok) return false;
    const res = await pairResetOnServer(this.remoteServer, this.token);
    if (!res.ok) {
      this.toast(res.error || '解绑失败', 'error');
      return false;
    }
    // 本机也回到干净状态（账号还在），然后重新连接拿最新快照
    this.hub.resetToEmpty();
    this.bump();
    this.toast('已解绑并清空，正在重新连接…', 'ok');
    const server = this.remoteServer;
    this.teardownConnection();
    void this.connectRemote(server);
    return true;
  }

  /** 只保存地址、不连接 */
  async saveServer(url: string): Promise<boolean> {
    const check = checkServerUrl(url);
    if (!check.ok) {
      this.remoteLastError = check.error ?? '地址不合法';
      return false;
    }
    const okSave = await saveServerUrl(check.url, this.backupServer);
    if (okSave) this.remoteServer = check.url;
    return okSave;
  }

  /** HTTP 长轮询回退通道（WS 握不上手时用，和 WS 读写同一份空间） */
  private async httpLoop(): Promise<void> {
    let failures = 0;
    while (this.httpRunning && this.remoteServer && this.token) {
      const server = this.remoteServer;
      const res = await waitForChange(server, this.token, this.remoteRev);
      if (!this.httpRunning || this.remoteServer !== server) break;

      if (res) {
        failures = 0;
        // 槽位可能因为绑定/解绑变了，先采纳再应用快照
        this.adoptServerRole(res.role);
        this.remoteRev = res.rev;
        if (this.netInfo.status !== 'open') {
          this.netInfo = { ...this.netInfo, status: 'open', label: '已连接', tone: 'ok', retryInMs: 0, attempt: 0 };
          this.bump();
        }
        this.applyRemoteSnapshot(res.state as unknown as SpaceSnapshot);
        continue;
      }

      // 长轮询挂起到点返回空是**正常节奏**（服务端 20s 一轮），不能当成掉线。
      // 以前每次空返回都报"重连中"，界面就一会已连接一会重连中地跳。
      failures += 1;
      if (failures >= 3) {
        const delay = Math.min(1200 * (failures - 2), 5000);
        this.netInfo = {
          status: 'reconnecting',
          label: `重连中（${failures} 次未响应）`,
          tone: 'warn',
          retryInMs: delay,
          attempt: failures,
          lastError: '服务器连续没有响应',
          url: server,
        };
        this.bump();
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // 偶尔空一次：安静地立刻重挂，不改状态、不打扰用户
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }

  async pingServer(serverUrl: string): Promise<string> {
    const r = await checkServerHealth(serverUrl);
    return r.text;
  }

  setToast(fn: (text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void): void {
    this.toastFn = fn;
  }

  /** 让 store 也能弹确认框（语音 HTTPS 检查要用），由 AppProvider 注入 */
  setConfirm(
    fn: (opts: {
      title: string;
      message?: string;
      icon?: string;
      confirmText?: string;
      cancelText?: string;
      danger?: boolean;
    }) => Promise<boolean>,
  ): void {
    this.confirmFn = fn;
  }

  /**
   * 语音前检查 —— 现在**不再因为 http 就拦人**。
   *
   * 之前我按"公网必须 HTTPS 才能开麦"做了个硬拦截，这个前提是错的：
   * 语音走的是 Agora 的原生 RTC 通道，不经过同步服务器，服务器是 http 还是 https
   * 跟麦克风一点关系都没有（实测 http 地址语音正常）。所以这里只保留一个返回值，
   * 永远放行；留着方法是为了以后真要加"仅 Wi-Fi 通话"之类的策略时有地方落。
   */
  voiceGuard(): { blocked: boolean; message: string | null } {
    return { blocked: false, message: null };
  }

  /** 通过检查返回 true（当前恒为 true） */
  private async guardVoice(): Promise<boolean> {
    const guard = this.voiceGuard();
    if (guard.blocked) {
      if (this.confirmFn) {
        await this.confirmFn({
          title: '语音功能不可用',
          message: guard.message ?? '当前配置无法使用语音',
          icon: '🔒',
          confirmText: '知道了',
        });
      } else {
        this.toast(guard.message ?? '当前配置无法使用语音', 'error');
      }
      return false;
    }
    return true;
  }

  toast(text: string, tone: 'info' | 'ok' | 'warn' | 'error' = 'info'): void {
    // 同一条提示 3 秒内只弹一次：任何循环里的失败都不该把屏幕糊满
    const now = Date.now();
    if (this.lastToast && this.lastToast.text === text && now - this.lastToast.at < 3000) {
      this.lastToast.at = now;
      return;
    }
    this.lastToast = { text, at: now };
    this.toastFn?.(text, tone);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * 通知所有订阅者重渲染。
   *
   * 性能（用户反馈"用起来有点小卡顿"）：
   * 以前是**每次状态变化都同步通知**，而 hub 每 250ms 就 tick 一次，再加上心跳和投影，
   * 整棵页面树一秒要重渲染好几次 —— 正在滑列表时就是掉帧。
   * 现在合并成"一帧最多一次"（16ms）：同一帧内来多少条变化都只渲染一次，画面完全一致。
   */
  private bumpTimer: ReturnType<typeof setTimeout> | null = null;

  private bump(): void {
    if (this.bumpTimer !== null) return;
    this.bumpTimer = setTimeout(() => {
      this.bumpTimer = null;
      this.version += 1;
      for (const l of [...this.listeners]) l();
    }, 16);
  }

  get snapshot() {
    return this.devices[this.role].snapshot;
  }

  get device(): ClientDevice {
    return this.devices[this.role];
  }

  get partnerRole(): Role {
    return this.role === 'A' ? 'B' : 'A';
  }

  /**
   * 界面上**不再有"端"这个概念**。
   *
   * 账号模型下你在空间里的位置是服务端根据"谁先注册、谁后绑定"定的内部槽位，
   * 对用户没有任何意义——所以这里统一返回空串，凡是需要身份的地方
   * 一律用名字或账号 ID。保留这个方法只是为了让历史 UI 代码不至于炸。
   */
  get roleLabel(): string {
    return '';
  }

  /** 我的账号 ID（也就是别人搜我时填的那个） */
  get myAccountId(): string {
    return this.accountId;
  }

  /** 对方的名字（没建档时给空串） */
  get partnerName(): string {
    return this.snapshot.members[this.partnerRole].name || '';
  }

  /** 我的名字 */
  get myName(): string {
    return this.snapshot.members[this.role].name || '';
  }

  /**
   * 两个人昵称是不是一样。
   *
   * 一模一样的时候，界面上凡是"直接打出对方名字"的地方都会读成"我自己"
   * （真实事故：两个账号都叫 jog，关怀页 tab 显示「我 / jog」，
   * 提示语变成"jog 的关怀信息由 TA 自己管理"，看起来像身份错乱）。
   * 所以这些地方统一改用 `partnerLabel`，并且在「我们」页提示改名。
   */
  get namesCollide(): boolean {
    const mine = this.myName;
    const theirs = this.partnerName;
    return Boolean(mine && theirs && mine.trim() === theirs.trim());
  }

  /**
   * 界面上称呼对方的统一写法：
   *  - 昵称不冲突 → 「TA（jog）」，一眼能看出是对方
   *  - 昵称冲突 → 只写「TA」，绝不打出和我一样的名字
   */
  get partnerLabel(): string {
    const name = this.partnerName.trim();
    if (!name || name === this.myName.trim()) return 'TA';
    return `TA（${name}）`;
  }

  /** 已经登录了账号吗 */
  get hasAccount(): boolean {
    return Boolean(this.token && this.accountId);
  }

  /**
   * 「TA 最近做了什么」：最新的在前。
   * 服务端只下发对方的动作，这里不再过滤，直接给界面用。
   */
  get partnerActivity() {
    const feed = this.snapshot.activity ?? [];
    return [...feed].sort((a, b) => b.at - a.at);
  }

  /** 还挂在屏幕上的提示框（全局 ActivityDock 读它） */
  get pendingActivityNotice(): ActivityItem | null {
    return this.activityNotice;
  }

  /** 用户点了「知道了」：收起提示框，并把动态标记为已读 */
  dismissActivityNotice(): void {
    this.activityNotice = null;
    this.markActivityRead();
    this.bump();
  }

  /** 其中还没弹过提示框的条数（「我们」页上的小红点用它） */
  get unreadActivityCount(): number {
    return this.partnerActivity.filter((a) => a.at > this.activitySeenAt).length;
  }

  /** 打开动态页 / 点一下小红点：全部标记为已看 */
  markActivityRead(): void {
    const feed = this.partnerActivity;
    if (feed.length === 0) return;
    const newest = feed[0].at;
    if (newest <= this.activitySeenAt) return;
    this.activitySeenAt = newest;
    void saveActivitySeenAt(newest);
    this.bump();
  }

  /** 账号是不是已经绑定成双人空间了 */
  get isBound(): boolean {
    return this.snapshot.boundAt !== null;
  }

  // ---------------------------------------------------------------------------
  // 在线片库接口（CMS）：只由一个人管理，两个人共用同一份
  // ---------------------------------------------------------------------------

  /**
   * 刚保存、还没被服务器投影确认的列表（乐观覆盖）。
   *
   * 为什么需要：界面上的 `snapshot` 是**服务器投影**，RPC 返回 ok 只说明
   * 服务器那边已经改好了，这台手机上的投影要等下一份快照才更新；
   * 而 getter 里"共享那份优先"，于是用户点完删除，屏幕上那一行仍然来自旧投影
   * ——这就是「删了还在、一直删不掉、红着一直不消失」的真正原因。
   * 这里先按本地结果画 15 秒，服务器投影一到（正常 1 秒内）自然接管。
   */
  private liveOptimistic: { urls: string[]; until: number } | null = null;
  private cmsOptimistic: { apis: string[]; until: number } | null = null;
  private static readonly OPTIMISTIC_MS = 15_000;
  /**
   * 用户刚改过"源列表"的时间闸门：这段时间里 syncLiveSources / syncCmsSources
   * 不许把本机缓存补推回服务器（否则删掉的源会被自己推回来）。
   */
  private sourcePushMutedUntil = 0;

  /** 现在生效的接口列表（服务端那份优先，没有才用本机缓存） */
  get cmsApis(): string[] {
    const opt = this.cmsOptimistic;
    if (opt !== null && Date.now() < opt.until) return opt.apis;
    this.cmsOptimistic = null;
    const shared = this.snapshot.cms?.apis ?? [];
    if (shared.length > 0) return shared;
    return this.cmsLocalCache;
  }

  /** 谁在管理片库接口 */
  get cmsManagerRole(): Role {
    return this.snapshot.cms?.manager ?? this.role;
  }

  /** 我能不能改接口（对方管理时我这边只读） */
  get canManageCms(): boolean {
    const cms = this.snapshot.cms;
    if (!cms) return true;
    if (cms.updatedAt === 0 && cms.apis.length === 0) return true; // 还没人配：谁先配谁管
    return cms.manager === this.role;
  }

  /**
   * 保存接口列表。
   *
   * 管理者：写服务端 + 本机缓存；非管理者：明确告知并拒绝。
   * 以前是"各存各的手机"，于是两个人各配一份，同一个采集站被抓两遍、
   * 一边能看另一边没有——现在接口只有一份，属于管理者。
   */
  async saveCmsApis(apis: string[], opts?: { quiet?: boolean }): Promise<boolean> {
    const clean = Array.from(
      new Set(
        apis
          .map((a) => a.trim())
          .filter((a) => /^https?:\/\//i.test(a)),
      ),
    ); // 与 hub 保持一致：不设上限
    if (clean.length === 0) {
      this.toast('至少留一个 http(s) 接口地址', 'warn');
      return false;
    }
    if (!this.remoteServer || !this.token) {
      this.cmsLocalCache = clean;
      await saveCmsApiList(clean);
      /*
       * 关键（真实事故：「接口删了还在 / 一直删不掉」）：
       * 界面上的 `snapshot.cms` 不是缓存文件，而是本机 hub 投影出来的。
       * 以前这里只改缓存、不写 hub，于是 get cmsApis() 里
       * `shared.length > 0` 一直成立 → 拿到的永远是删之前那份旧列表。
       * 现在两边一起写，删掉就是删掉。
       */
      this.writeLocalCmsApis(clean);
      this.markCmsOptimistic(clean);
      if (!opts?.quiet) this.toast('接口只存在这台手机上（还没连服务器，对方看不到）', 'warn');
      this.bump();
      return true;
    }
    if (!this.canManageCms) {
      this.toast('片库接口由 TA 管理，需要 TA 交给你之后才能改', 'warn');
      return false;
    }
    /*
     * 顺序很关键：先把本机这份改成"刚保存的"，再发 RPC。
     * 反过来的话，RPC 期间到达的服务器投影会看到"本机还有旧列表"，
     * 于是自动把旧列表补推回服务器 —— 用户刚做的修改就被自己盖掉了。
     */
    this.sourcePushMutedUntil = Date.now() + AppStore.OPTIMISTIC_MS;
    this.cmsLocalCache = clean;
    await saveCmsApiList(clean);
    this.writeLocalCmsApis(clean);
    this.markCmsOptimistic(clean);
    const res = await this.sendRpcAwait('setCmsApis', [clean]);
    if (!res.ok) {
      this.toast(res.error ?? '保存接口失败', 'error');
      void this.refreshFromServer();
      return false;
    }
    if (!opts?.quiet) this.toast('片库接口已保存，双方都会用这一份', 'ok');
    void this.refreshFromServer();
    return true;
  }

  /** 记下"我刚保存的这份"，让界面立刻按它画（15 秒后交给服务器投影） */
  private markCmsOptimistic(apis: string[]): void {
    this.cmsOptimistic = { apis, until: Date.now() + AppStore.OPTIMISTIC_MS };
    this.bump();
  }

  private markLiveOptimistic(urls: string[]): void {
    this.liveOptimistic = { urls, until: Date.now() + AppStore.OPTIMISTIC_MS };
    this.bump();
  }

  /**
   * 把接口列表写进本机 hub（离线/单人模式下界面就是这么投影出来的）。
   *
   * 远程模式下 hub 的投影不直接接管界面（见构造函数里的 localEcho 判断），
   * 所以这里写一遍是安全的：连上服务器后仍以服务器那份为准。
   */
  private writeLocalCmsApis(apis: string[]): void {
    try {
      const res = this.localHub.setCmsApis(this.role, apis);
      if (!res.ok) {
        // 管理权在"对方"名下的历史存档：单人本地模式下把管理权拿回来，
        // 否则会出现「明明点了删除，界面上一直都在」的死结
        this.localHub.claimCmsManagerLocal(this.role);
        this.localHub.setCmsApis(this.role, apis);
      }
    } catch {
      /* 写 hub 失败不影响本机缓存，界面下次投影会修正 */
    }
  }

  /** 把接口管理权交给对方 */
  async transferCmsManager(to: Role): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('需要先连上服务器才能交接', 'warn');
      return false;
    }
    const res = await this.sendRpcAwait('transferCmsManager', [to]);
    if (!res.ok) {
      this.toast(res.error ?? '交接失败', 'error');
      return false;
    }
    this.toast('已把片库接口交给 TA 管理', 'ok');
    void this.refreshFromServer();
    return true;
  }

  // ---------------------------------------------------------------------------
  // 电视直播源：和片库接口同一套规则（一个人管理，两个人共用一份）
  // ---------------------------------------------------------------------------

  /** 现在生效的直播源地址（服务端那份优先，没有才用本机缓存） */
  get liveSourceUrls(): string[] {
    const opt = this.liveOptimistic;
    if (opt !== null && Date.now() < opt.until) return opt.urls;
    this.liveOptimistic = null;
    const live = this.snapshot.live;
    /*
     * LIVE_CLEARED_IS_EMPTY：服务端**配置过**（updatedAt > 0）就以它为准，
     * 哪怕它是空的（管理者把源全删光了）。以前 length === 0 一律回落到本机旧缓存，
     * 于是对方手机上这些源一个不少、照样能播，而且他还删不掉（管理权不在他那儿）。
     */
    if (live && live.updatedAt > 0) return live.urls;
    return this.liveLocalCache;
  }

  /** 谁在管理直播源 */
  get liveManagerRole(): Role {
    return this.snapshot.live?.manager ?? this.role;
  }

  /** 我能不能改直播源 */
  get canManageLive(): boolean {
    const live = this.snapshot.live;
    if (!live) return true;
    if (live.updatedAt === 0 && live.urls.length === 0) return true; // 还没人配：谁先配谁管
    return live.manager === this.role;
  }

  /**
   * 保存直播源地址列表。
   *
   * 管理者的写入会走服务端（TA 那边立刻跟着变）；非管理者明确拒绝。
   * 允许清空（把源全删掉），这点和片库接口不同：片库没接口就没片看，
   * 但直播源清空只是"直播页变成空状态"，是合法操作。
   */
  async saveLiveSourceUrls(urls: string[], opts?: { quiet?: boolean }): Promise<boolean> {
    const clean = Array.from(
      new Set(
        urls
          .map((u) => u.trim().replace(/\/+$/, ''))
          .filter((u) => /^https?:\/\//i.test(u)),
      ),
    );
    if (!this.remoteServer || !this.token) {
      this.liveLocalCache = clean;
      await saveLiveSources(entriesFromUrls(clean));
      /*
       * 关键（真实事故：「删掉的直播源一直在，红色报错删不掉」）：
       * `snapshot.live` 是本机 hub 投影出来的，不是这份缓存文件。
       * 只改缓存不写 hub，`shared.length > 0` 就一直成立，
       * 界面上看到的永远是删之前那份列表 → 怎么点删除都没用。
       */
      this.writeLocalLiveUrls(clean);
      this.markLiveOptimistic(clean);
      if (!opts?.quiet) this.toast('直播源只存在这台手机上（还没连服务器，对方看不到）', 'warn');
      this.bump();
      return true;
    }
    if (!this.canManageLive) {
      this.toast('直播源由 TA 管理，需要 TA 交给你之后才能改', 'warn');
      return false;
    }
    /*
     * ★ 顺序很关键（真实事故：删掉的源过 20 秒自己回来、重启还在）：
     *
     * 如果先发 RPC 再改本机缓存，那么 RPC 往返的这几十毫秒里服务器会把
     * "已经删空了"的投影推回来，而 syncLiveSources 看到"服务端空 + 本机还有"
     * 就执行它的补推逻辑，把用户刚删掉的地址**又原样推回服务器** —— 完美复原。
     *
     * 所以：先让本机这份等于目标状态（并把补推闸门关上），再发 RPC。
     */
    this.sourcePushMutedUntil = Date.now() + AppStore.OPTIMISTIC_MS;
    this.liveLocalCache = clean;
    await saveLiveSources(entriesFromUrls(clean));
    this.writeLocalLiveUrls(clean);
    this.markLiveOptimistic(clean);
    const res = await this.sendRpcAwait('setLiveSourceUrls', [clean]);
    if (!res.ok) {
      this.toast(res.error ?? '保存直播源失败', 'error');
      void this.refreshFromServer();
      return false;
    }
    if (!opts?.quiet) this.toast('直播源已保存，双方都会用这一份', 'ok');
    void this.refreshFromServer();
    return true;
  }

  /**
   * 把直播源列表写进本机 hub。
   *
   * hub 的 setLiveSourceUrls 只允许"管理者"改，而历史存档里管理权可能挂在对方名下
   * （比如以前在另一台手机上配的）。单人本地模式下那就是死结：删了不生效、
   * 也没有任何报错。所以失败时先把管理权收回给自己再写一次。
   */
  private writeLocalLiveUrls(urls: string[]): void {
    try {
      const res = this.localHub.setLiveSourceUrls(this.role, urls);
      if (!res.ok) {
        this.localHub.claimLiveManagerLocal(this.role);
        this.localHub.setLiveSourceUrls(this.role, urls);
      }
    } catch {
      /* 写 hub 失败不影响本机缓存，界面下次投影会修正 */
    }
  }

  /** 把直播源管理权交给对方 */
  async transferLiveManager(to: Role): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('需要先连上服务器才能交接', 'warn');
      return false;
    }
    const res = await this.sendRpcAwait('transferLiveManager', [to]);
    if (!res.ok) {
      this.toast(res.error ?? '交接失败', 'error');
      return false;
    }
    this.toast('已把直播源交给 TA 管理', 'ok');
    void this.refreshFromServer();
    return true;
  }

  setRole(role: Role): void {
    if (this.role === role) return;
    this.role = role;
    this.bump();
  }

  toggleOnline(): void {
    const device = this.device;
    const next = !device.online;
    device.setOnline(next);
    this.hub.setOnline(this.role, next);
    this.toast(next ? '网络已恢复' : '已模拟断网', next ? 'ok' : 'warn');
    this.bump();
  }

  /** 给对手设备制造漂移（演示用） */
  scrubPartner(seconds = 8): void {
    const partner = this.partnerRole;
    this.devices[partner].seekLocal(this.devices[partner].player.positionSec + seconds);
    this.toast(`已给 ${partner} 端播放器制造 +${seconds}s 漂移`, 'warn');
    this.bump();
  }

  start(): void {
    if (this.timer) return;
    // 先加载设备身份 + 档案备份，再恢复存档、再自动连
    void this.boot().then(() => {
      if (!this.autoConnectTried) {
        this.autoConnectTried = true;
        void this.autoConnect();
      }
    });
    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(1000, now - this.lastTickAt);
      this.lastTickAt = now;
      this.hub.tick();
      this.devices.A.tick(dt);
      this.devices.B.tick(dt);
      this.syncWatchdog(now);
      this.tickCareReminders(now);
    }, 250);
  }

  /**
   * 同步看门狗（每 250ms 跑一次，只做廉价的判断）。
   *
   * 为什么需要：手机上的长连接会"半死"——切 Wi-Fi/4G、系统挂起、NAT 把映射丢掉，
   * socket 看起来还是开着的，onclose 永远不来。以前界面就一直显示「已连接」，
   * 而服务端的推送一条都收不到：一端新建的安排，另一端纹丝不动（真实事故）。
   *
   * ConnectionManager 现在用心跳回执兜底（收不到 pong 就重连），这里再补一层：
   *  - 一段时间没有任何下行消息 → 主动重连 + 拉一次最新状态
   *  - 指示灯不再撒谎：超过 HEALTHY_MS 没收消息就变黄「连接不稳定」
   *  - 长轮询循环如果意外退出了，只要还连着就把它拉起来
   */
  private syncWatchdog(now: number): void {
    if (!this.remoteStatus.connected) return;
    // 长轮询循环死了但状态还写着已连接：拉起来
    if (this.transport === 'http' && !this.httpRunning && this.remoteServer && this.token) {
      this.httpRunning = true;
      void this.httpLoop();
    }
    if (this.lastInboundAt === 0) this.lastInboundAt = now;
    const silentMs = now - this.lastInboundAt;

    // 静默一段时间先"自查"：用 HTTP 拉一次最新状态，**不碰 socket**。
    // 以前这里直接 retryNow() 掐掉长连接——网络只是抖一下，却被我们主动断了一次，
    // 于是变成"连上 → 抖动 → 重连 → 再抖动"的循环（用户说的"一会就不稳定"）。
    if (silentMs > 25_000 && now - this.lastForceResyncAt > 15_000) {
      this.lastForceResyncAt = now;
      void this.refreshFromServer();
    }
    // 90 秒一条消息都没有，才认定长连接真的坏了，主动重连
    if (silentMs > 90_000 && this.conn) {
      this.remoteLastError = '超过 90 秒没有任何服务器消息，正在重连';
      this.conn.retryNow();
      this.bump();
      return;
    }
    if (silentMs > 45_000 && this.netInfo.status === 'open') {
      this.netInfo = {
        ...this.netInfo,
        status: 'reconnecting',
        label: '网络波动',
        tone: 'warn',
        lastError: '45 秒没有收到服务器消息，已用 HTTP 自查',
      };
      this.bump();
    }
  }

  /** 启动：账号登录状态 → 设备身份 → 档案备份 → 本地存档，全部就绪后再自动连接 */
  private async boot(): Promise<void> {
    /*
     * 第一件事：把"已删除的片源接口"名单读进内存。
     *
     * 缓存层用的是同步判断（isApiDeletedSync，读缓存时不 await），
     * 这份名单没加载完之前它会一律返回 false —— 于是删掉的接口的缓存
     * （包括 APK 里打包的种子缓存）照样能被读出来，
     * 表现就是「删了那个接口，片库里它的片子还在」。
     * 必须在任何缓存读取之前加载。
     */
    try {
      await loadDeletedApis();
    } catch {
      /* 读不到就当作没有删过 */
    }
    // 账号优先：有了 token 才有身份，服务端靠它认人
    try {
      const session = await loadAccountSession();
      if (session?.token) {
        this.token = session.token;
        this.accountId = session.accountId;
        this.accountServer = session.server;
        this.accountSince = session.since;
      }
    } catch {
      // 读不到就当没登录，让用户走登录页
    }
    this.accountReady = true;
    try {
      const identity = await loadDeviceIdentity();
      this.clientId = identity.clientId;
    } catch {
      // 设备 ID 只用于诊断，拿不到也能用
    }
    try {
      this.profileBackup = await loadProfileBackup();
    } catch {
      this.profileBackup = null;
    }
    try {
      this.activitySeenAt = await loadActivitySeenAt();
    } catch {
      this.activitySeenAt = 0;
    }
    try {
      this.notifyPrefs = await loadNotifyPrefs();
    } catch {
      this.notifyPrefs = { ...DEFAULT_NOTIFY_PREFS };
    }
    this.activityWatchReady = true;
    try {
      // 片库接口的本机缓存：连上服务器后会被"共享的那一份"覆盖
      this.cmsLocalCache = await getCmsApiList();
    } catch {
      this.cmsLocalCache = [];
    }
    try {
      // 电视直播源的本机缓存（同样会被共享的那一份覆盖）
      const entries = await getLiveSources();
      this.liveLocalCache = entries.map((e) => e.url);
    } catch {
      this.liveLocalCache = [];
    }
    this.lastTickAt = Date.now();
    await this.hydrateFromStorage();
    this.bump();
  }

  /** 把当前档案记为本地备份（建档成功 / 服务端确认后调用） */
  rememberProfile(): void {
    const me = this.snapshot.members[this.role];
    if (!me.profileCompleted) return;
    this.profileBackup = {
      name: me.name,
      birthDate: me.birthDate,
      gender: me.gender,
      avatarUri: me.avatarUri,
      savedAt: Date.now(),
    };
    void saveProfileBackup({
      name: me.name,
      birthDate: me.birthDate,
      gender: me.gender,
      avatarUri: me.avatarUri,
    });
  }

  /** 建档页预填用：本地备份的档案（本地被服务端清空时不至于让用户重填一遍） */
  get profileHint(): ProfileBackup | null {
    return this.profileBackup;
  }

  /**
   * 本地档案认领（只在**没有连服务器**的本机模式下用）。
   *
   * 远程模式下这条路径是有害的：服务端账号记录才是档案的权威来源，
   * 而本机这份"备份"可能根本是别人的（同一台手机先后登录过两个账号）。
   * 以前它会把本地档案推成 updateMyProfile RPC，于是 A 的昵称被写进 B 的账号
   * （真实事故：她刚注册叫 9，绑完变成 jog）。
   */
  adoptProfileIfNeeded(): boolean {
    if (this.remoteServer) return false;
    if (!this.profileBackup) return false;
    const me = this.snapshot.members[this.role];
    if (me.profileCompleted) return false;
    if (this.snapshot.boundAt !== null) return false;
    const { name, birthDate, gender, avatarUri } = this.profileBackup;
    if (!name || !birthDate || !gender) return false;
    const res = this.localHub.updateMyProfile(this.role, { name, birthDate, gender });
    if (!res.ok) return false;
    if (avatarUri) this.localHub.setMyAvatar(this.role, avatarUri);
    this.devices[this.role].applySnapshot(this.localHub.snapshot(this.role));
    this.toast(`档案已恢复：${name}`, 'ok');
    this.bump();
    return true;
  }

  /**
   * 把档案明确写到服务端（建档完成 / 改了昵称头像时）。
   *
   * 账号模型下档案的权威来源就是账号本身，所以这里直接发一次
   * `updateMyProfile` RPC（服务端会顺手同步到账号记录），并且**等它回话**：
   * 写不进去就明确报错，绝不让界面显示"已保存"而服务器上其实没有。
   *
   * 前提：当前槽位必须真的是我（publicId === 我的账号 ID）。否则先拉一次
   * 最新状态把槽位对齐，绝不在"我看到的可能不是我"的时候往服务器写名字。
   */
  syncProfileToServer(): void {
    if (!this.remoteServer || !this.token) return;
    void (async () => {
      if (!this.canPushMyProfile()) {
        await this.refreshFromServer();
        if (!this.canPushMyProfile()) {
          this.toast('账号还没和服务器对齐（可能刚完成绑定），请点「立即同步」再试', 'warn');
          return;
        }
      }
      const me = this.snapshot.members[this.role];
      const res = await this.sendRpcAwait('updateMyProfile', [
        { name: me.name, birthDate: me.birthDate ?? '2000-01-01', gender: me.gender ?? 'other' },
      ]);
      if (!res.ok) {
        this.toast(`档案没能同步到服务器：${res.error ?? '未知错误'}`, 'error');
        return;
      }
      if (me.avatarUri) {
        const avatar = await this.sendRpcAwait('setMyAvatar', [me.avatarUri]);
        if (!avatar.ok) this.toast(`头像没能同步：${avatar.error ?? '未知错误'}`, 'warn');
      }
      void this.refreshFromServer();
    })();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // 退出时别把 socket 留着，否则热重载会叠出好几个连接
    if (this.conn) {
      this.conn.destroy();
      this.conn = null;
    }
  }

  /**
   * App 回到前台时调用：手机在后台会被系统掐断 socket，
   * 这时如果状态不是 open，就立刻重连一次（不等退避计时器）。
   */
  handleAppForeground(): void {
    if (this.transport === 'ws' && this.conn && !this.conn.isOpen) {
      this.conn.retryNow();
      this.bump();
    }
  }

  // -------------------------------------------------------------------------
  // 业务动作（统一返回是否成功，并给出 Toast）
  // -------------------------------------------------------------------------

  private handle<T>(result: { ok: boolean; value?: T; error?: string }, okText?: string): boolean {
    if (!result.ok) {
      this.toast(result.error ?? '操作失败', 'error');
      return false;
    }
    if (okText) this.toast(okText, 'ok');
    this.bump();
    return true;
  }

  /**
   * 回应对方的「需要抱抱」：发一张抱抱卡，并把那个请求收下。
   *
   * 只发卡不清状态的话，对方那张卡会一直挂着"需要抱抱"+两个按钮，
   * 点完看起来像没反应（用户实测反馈）。
   */
  hugPartner(words = ''): boolean {
    const result = this.hub.hugBack(this.role, words);
    if (!result.ok) {
      this.toast(result.error, 'warn');
      return false;
    }
    this.toast('已经抱到 TA 了', 'ok');
    this.bump();
    return true;
  }

  setMood(weather: Weather, note: string): boolean {
    return this.handle(this.hub.setMood(this.role, weather, note), '已更新今天的状态');
  }

  addTodo(title: string, assignee: 'A' | 'B' | 'either'): boolean {
    return this.handle(this.hub.addTodo(this.role, { title, assignee, dueDate: null }), '已加入待办');
  }

  toggleTodo(id: string): void {
    this.handle(this.hub.toggleTodo(this.role, id));
  }

  deleteTodo(id: string): void {
    this.handle(this.hub.deleteTodo(this.role, id));
  }

  addShopping(title: string, qty: string, category: 'fresh' | 'daily' | 'medicine' | 'snack' | 'other'): boolean {
    return this.handle(this.hub.addShopping(this.role, { title, qty, category }), '已加入清单');
  }

  toggleShopping(id: string): void {
    this.handle(this.hub.toggleShopping(this.role, id));
  }

  addEvent(input: {
    title: string;
    date: string;
    startMin: number;
    endMin: number;
    category: 'date' | 'anniversary' | 'chore' | 'trip' | 'reminder' | 'movie';
    visibility: 'shared' | 'self';
  }): boolean {
    return this.handle(this.hub.addEvent(this.role, input), '已加到日历');
  }

  deleteEvent(id: string): void {
    this.handle(this.hub.deleteEvent(this.role, id));
  }

  setPeriodTier(tier: PeriodTier, shareHistory: boolean): boolean {
    return this.handle(
      this.hub.setPeriodTier(this.role, tier, shareHistory),
      '可见范围已更新',
    );
  }

  revokeAll(): boolean {
    return this.handle(this.hub.revokeAllConsent(this.role), '已撤回全部授权');
  }

  togglePrediction(): void {
    this.handle(this.hub.togglePeriodPrediction(this.role));
  }

  addPeriodRecord(input: {
    startDate: string;
    endDate: string | null;
    flow: 'light' | 'medium' | 'heavy' | null;
    symptoms: string[];
    moods: string[];
    note: string;
  }): boolean {
    return this.handle(this.hub.addPeriodRecord(this.role, input), '记录已保存');
  }

  deletePeriodRecord(id: string): void {
    this.handle(this.hub.deletePeriodRecord(this.role, id), '已删除');
  }

  updatePeriodRecord(
    id: string,
    patch: {
      startDate?: string;
      endDate?: string | null;
      flow?: 'light' | 'medium' | 'heavy' | null;
      symptoms?: string[];
      moods?: string[];
      note?: string;
    },
  ): void {
    this.handle(this.hub.updatePeriodRecord(this.role, id, patch), '已更新');
  }

  addGiftIdea(text: string, occasion: string): boolean {
    return this.handle(this.hub.addGiftIdea(this.role, text, occasion), '已记下（默认对 TA 不可见）');
  }

  revealGiftIdea(id: string): void {
    this.handle(this.hub.revealGiftIdea(this.role, id), '已揭示给 TA');
  }

  // ---- 个人建档与外观 ----

  updateMyProfile(name: string, birthDate: string, gender: Gender): boolean {
    return this.handle(this.hub.updateMyProfile(this.role, { name, birthDate, gender }), '建档完成');
  }

  setMyAvatar(uri: string | null): void {
    this.handle(this.hub.setMyAvatar(this.role, uri), uri ? '头像已更新' : '已恢复默认头像');
  }

  /**
   * 换头像的完整流程：先上传到服务器，再把 `/avatar/xxx.jpg` 写进空间状态。
   *
   * 以前这里直接把 `file://` 本地路径写进状态：对方手机打不开、换机也丢，
   * 界面上又只有注册页预览会渲染它，所以用户的感觉就是"传了没反应"。
   *
   * 上传失败时**也先显示本地那张**（至少自己这台上能看到），并明确告诉他原因。
   */
  async changeMyAvatar(localUri: string): Promise<boolean> {
    // 先本地立刻上屏，避免"点了没反应"的观感
    this.setMyAvatar(localUri);
    if (!this.remoteServer || !this.token) {
      this.toast('头像只存在这台手机上（还没连服务器，对方暂时看不到）', 'warn');
      return false;
    }
    this.toast('正在上传头像…', 'info');
    const up = await uploadImage(this.remoteServer, this.token, localUri, 'avatar');
    if (!up.ok || !up.path) {
      this.toast(`头像没能同步给对方：${up.error ?? '未知错误'}`, 'error');
      return false;
    }
    this.setMyAvatar(up.path);
    // 服务端认的是 rpc：把相对路径再显式推一次（角色可能刚变，幂等无害）
    await this.sendRpcAwait('setMyAvatar', [up.path]);
    this.toast('头像已更新（对方也能看到）', 'ok');
    return true;
  }

  /**
   * 老版本留下的 `file://` 图片地址要迁到服务器上，否则对方永远看不到。
   * 登录后、连上服务器时跑一次；失败了也不打扰用户（下次还会再试）。
   */
  async migrateLocalAvatar(): Promise<void> {
    if (!this.remoteServer || !this.token) return;
    const mine = this.snapshot.members[this.role]?.avatarUri ?? null;
    if (avatarKind(mine) === 'local') {
      const up = await uploadImage(this.remoteServer, this.token, mine as string, 'avatar');
      if (up.ok && up.path) {
        await this.sendRpcAwait('setMyAvatar', [up.path]);
        this.setMyAvatar(up.path);
      }
    }
    const bg = this.snapshot.profile?.backgroundUri ?? null;
    if (avatarKind(bg) === 'local') {
      const up = await uploadImage(this.remoteServer, this.token, bg as string, 'background');
      if (up.ok && up.path) {
        await this.sendRpcAwait('setBackground', [up.path]);
        this.setBackground(up.path);
      }
    }
    await this.migrateLocalPhotos();
  }

  /**
   * 老版本往清单里放的配图/照片存的是本机 `file://` 路径，对方永远加载不出来。
   * 连上服务器后把自己名下的这些图补传一次（只处理自己的条目，改不了别人的）。
   */
  async migrateLocalPhotos(): Promise<void> {
    if (!this.remoteServer || !this.token) return;
    const PHOTO_KEYS = ['cover', 'photo1', 'photo2', 'photo3'];
    const mine = this.snapshot.collection.filter((i) => i.ownerRole === this.role);
    for (const item of mine) {
      const localKeys = PHOTO_KEYS.filter((k) => avatarKind(item.meta?.[k]) === 'local');
      if (localKeys.length === 0) continue;
      const next = { ...item.meta };
      let changed = false;
      for (const k of localKeys) {
        const up = await uploadImage(this.remoteServer, this.token, item.meta[k], 'photo');
        if (up.ok && up.path) {
          next[k] = up.path;
          changed = true;
        }
      }
      if (changed) this.collectionUpdate(item.id, { meta: next });
    }
  }

  /** 某个人的头像该显示成什么地址（拿不到就返回 null，界面退回 emoji） */
  avatarSrc(role: Role): string | null {
    const uri = this.snapshot.members[role]?.avatarUri ?? null;
    const server = this.remoteServer || this.accountServer || '';
    return resolveAvatarUri(uri, server);
  }

  /**
   * 换背景图的完整流程：上传 → 状态里存相对路径 → 对方也能看到。
   * 直接存本地 `file://` 的话，对方那边永远加载不出来（和头像同一个坑）。
   */
  async changeBackground(localUri: string | null): Promise<boolean> {
    if (!localUri) {
      this.setBackground(null);
      return true;
    }
    this.setBackground(localUri); // 先本地立刻上屏
    if (!this.remoteServer || !this.token) {
      this.toast('背景图只存在这台手机上（还没连服务器，对方暂时看不到）', 'warn');
      return false;
    }
    this.toast('正在上传背景图…', 'info');
    const up = await uploadImage(this.remoteServer, this.token, localUri, 'background');
    if (!up.ok || !up.path) {
      this.toast(`背景图没能同步给对方：${up.error ?? '未知错误'}`, 'error');
      return false;
    }
    this.setBackground(up.path);
    await this.sendRpcAwait('setBackground', [up.path]);
    this.toast('背景图已更新（对方也能看到）', 'ok');
    return true;
  }

  /** 背景图该显示成什么地址（相对路径 + 当前服务器） */
  get backgroundSrc(): string | null {
    const uri = this.snapshot.profile?.backgroundUri ?? null;
    const server = this.remoteServer || this.accountServer || '';
    return resolveAvatarUri(uri, server);
  }

  /** 改通知偏好：写内存 + 落盘 + 刷新界面 */
  setNotifyPrefs(next: NotifyPrefs): void {
    this.notifyPrefs = next;
    void saveNotifyPrefs(next);
    this.bump();
  }

  /** 任意图片字段（头像 / 背景 / 清单照片）→ 可显示地址 */
  mediaSrc(uri: string | null | undefined): string | null {
    const server = this.remoteServer || this.accountServer || '';
    return resolveAvatarUri(uri, server);
  }

  /**
   * 上传一张清单照片/配图，返回服务器路径。
   * 失败时退回本地路径（本机能看，同时明确告诉用户对方看不到）。
   */
  async uploadPhoto(localUri: string): Promise<string> {
    if (!this.remoteServer || !this.token) {
      this.toast('照片只存在这台手机上（还没连服务器，对方看不到）', 'warn');
      return localUri;
    }
    const up = await uploadImage(this.remoteServer, this.token, localUri, 'photo');
    if (!up.ok || !up.path) {
      this.toast(`照片没能同步给对方：${up.error ?? '未知错误'}`, 'error');
      return localUri;
    }
    return up.path;
  }

  setBackground(uri: string | null): void {
    this.handle(this.hub.setBackground(this.role, uri), uri ? '背景已更新（双方可见）' : '已恢复默认背景');
  }

  setStartedAt(date: string | null): boolean {
    return this.handle(this.hub.setStartedAt(this.role, date), '在一起的日子已保存');
  }

  editDiaryEntry(id: string, text: string): boolean {
    return this.handle(this.hub.editDiaryEntry(this.role, id, text), '已修改');
  }

  // ---- 一起听（同步音乐）----

  addMusicTrack(title: string, artist: string, url: string): boolean {
    return this.handle(this.hub.addMusicTrack(this.role, { title, artist, url }), '已加入一起听队列');
  }

  /**
   * 本地音乐 → 上传到我们自己的服务器 → 加进一起听队列。
   *
   * 用户要的："音乐那里让本地音乐也可以上传一起听，歌手和音乐名自己识别到"。
   * 流程：读 ID3 标签（读不到按文件名猜）→ 上传音频 → 用服务器直链加进队列，
   * 这样对方手机也能播同一首。
   */
  async importMusicFile(localUri: string, fileName: string): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('本地音乐要连上服务器才能一起听（现在只能自己听）', 'warn');
      return false;
    }
    this.toast('正在识别歌曲信息并上传…', 'info');
    const meta = await readMusicMeta(localUri, fileName);
    const up = await uploadAudio(this.remoteServer, this.token, localUri, fileName);
    if (!up.ok || !up.path) {
      this.toast(`音乐没能上传：${up.error ?? '未知错误'}`, 'error');
      return false;
    }
    const absolute = `${(this.remoteServer || '').replace(/\/+$/, '')}${up.path}`;
    const title = meta.title?.trim() || fileName.replace(/\.[^.]+$/, '') || '未命名歌曲';
    const artist = meta.artist?.trim() || '未知歌手';
    const added = this.addMusicTrack(title, artist, absolute);
    if (added) {
      this.toast(`已加入一起听：${title} - ${artist}（TA 也能听）`, 'ok');
    }
    return added;
  }

  /**
   * 上传一个本地音频文件，返回**绝对直链**（失败返回 null）。
   * 歌单里的"本地音乐"必须走这里，否则对方手机打不开 file:// 路径。
   */
  async uploadAudioFile(localUri: string, fileName: string): Promise<string | null> {
    if (!this.remoteServer || !this.token) {
      this.toast('要连上服务器才能把音乐分享给 TA', 'warn');
      return null;
    }
    const up = await uploadAudio(this.remoteServer, this.token, localUri, fileName);
    if (!up.ok || !up.path) {
      this.toast(`音乐没能上传：${up.error ?? '未知错误'}`, 'error');
      return null;
    }
    return `${(this.remoteServer || '').replace(/\/+$/, '')}${up.path}`;
  }

  /** 联机层数据包（第三方 HTML 游戏）：转给 hub，靠投影送到对方 */
  pushGameNet(packet: string): void {
    const r = this.hub.pushGameNet(this.role, packet);
    if (!r.ok) {
      /* 联机包丢了不打扰用户：下一拍还会再发一次 */
      return;
    }
    this.bump();
  }

  /**
   * 同一对、同一个游戏 → 两台手机必须拿到同一颗种子，
   * 否则"同一个初始局面、同一串随机数"这个前提不成立。
   */
  get gameNetSeed(): number {
    const space = this.snapshot.spaceId || 'space';
    const game = this.snapshot.gameSession?.gameId || 'game';
    let h = 5381;
    for (const ch of `${space}|${game}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  removeMusicTrack(id: string): void {
    this.handle(this.hub.removeMusicTrack(this.role, id), '已从队列移除');
  }

  musicAction(
    action: 'play' | 'pause' | 'seek' | 'change_track' | 'setting',
    payload: { positionSec?: number; index?: number; loop?: boolean; shuffle?: boolean } = {},
  ): void {
    this.handle(this.hub.musicAction(this.role, action, payload));
  }

  nextMusicIndex(from: number, direction: 1 | -1): number {
    return this.hub.nextMusicIndex(from, direction);
  }

  /** 片库「一起看」：有房间就换片源，没有就建房并带上直链 */
  startOnlineWatch(title: string, url: string): boolean {
    const existing = this.snapshot.activeRoom;
    /*
     * 死房间（邀请过期 / 已散场 / 已回忆 / 对方从没进来过）不能"换片源"：
     * 以前对 EXPIRED 房间直接 setRoomSource，于是用户点「一起看」被塞进一间
     * 「邀请已过期」的房间，播不动、也开不了新的，两个人一起卡死。
     */
    const deadRoom =
      !existing ||
      existing.state === 'RECAP' ||
      existing.state === 'ENDED' ||
      existing.state === 'DISSOLVED' ||
      existing.state === 'EXPIRED' ||
      existing.peerJoinedAt === null;
    if (existing && !deadRoom) {
      const result = this.hub.setRoomSource(this.role, url, title);
      if (!result.ok) {
        this.toast(result.error, 'error');
        return false;
      }
      this.toast('已把房间片源切换为在线片库', 'ok');
      this.bump();
      return true;
    }
    return this.handle(this.hub.createRoom(this.role, title, url), '房间已创建，去邀请 TA');
  }

  /** 开一局内置样例（井字棋/沙盒/小窝）：这些游戏不在 state.games 里 */
  startSampleGame(id: string, title: string): boolean {
    return this.handle(this.hub.startSampleGame(this.role, { id, title }), '开局了');
  }

  createRoom(movieTitle: string): boolean {
    return this.handle(this.hub.createRoom(this.role, movieTitle), '房间已创建，等 TA 点加入');
  }

  /**
   * 申请加入对方开的影厅（不用邀请码）。
   *
   * 已经绑定的两个人本来就在同一个空间里，房间就是共享状态的一部分，
   * 所以点一下就能申请，房主同意后进房。
   */
  requestJoinRoom(): boolean {
    const result = this.hub.requestJoinRoom(this.role);
    if (!result.ok) {
      this.toast(result.error, 'error');
      return false;
    }
    this.toast('已申请加入，等 TA 点同意', 'ok');
    this.bump();
    return true;
  }

  /** 房主同意对方进来 */
  approveJoinRoom(): boolean {
    return this.handle(this.hub.approveJoinRoom(this.role), 'TA 已进入房间');
  }

  /** 房主拒绝 / 申请人撤回 */
  declineJoinRoom(): boolean {
    return this.handle(this.hub.declineJoinRoom(this.role));
  }

  /** 播放倍速（主控才能改，双方同步） */
  setPlaybackRate(rate: number): boolean {
    const result = this.hub.setPlaybackRate(this.role, rate);
    if (!result.ok) {
      this.toast(result.error, 'warn');
      return false;
    }
    this.bump();
    return true;
  }

  regenerateRoomCode(): void {
    this.handle(this.hub.regenerateRoomCode(this.role), '已重新生成邀请码');
  }

  extendRoomCode(): void {
    this.handle(this.hub.extendRoomCode(this.role), '邀请有效期已延长');
  }

  joinRoomByCode(code: string): boolean {
    return this.handle(this.hub.joinRoomByCode(this.role, code), '已加入房间');
  }

  setReady(): void {
    this.handle(this.hub.setReady(this.role));
  }

  /**
   * 真实播放器位置回写（房间页 ±10s / 心跳 / 续播都读这一份）。
   * device.player 以前只会按墙钟自增，和真实播放器完全对不上。
   */
  syncDevicePosition(positionSec: number, playing: boolean): void {
    const device = this.devices[this.role];
    try {
      device.seekLocal(Math.max(0, positionSec));
      device.player.playing = playing;
    } catch {
      /* 忽略 */
    }
  }

  setMediaOffset(sec: number): void {
    this.handle(this.hub.setMediaOffset(this.role, sec));
  }

  play(): void {
    /*
     * LEADER_POS_FROM_PLAYER：不要再拿 device.player.positionSec 当权威位置。
     * 那是 ClientDevice 按墙钟自己累加的"模拟进度"，和真实播放器（expo-video）
     * 的位置毫无关系：主控拖到 20:00 后点暂停，服务端会被这里的假进度
     * 写成 5:00，把跟随方拽回去。位置统一由 MoviePlayer 的心跳上报。
     */
    this.handle(this.hub.play(this.role));
  }

  pause(): void {
    this.handle(this.hub.pause(this.role), '已暂停（两边同步）');
  }

  seek(sec: number): void {
    this.handle(this.hub.seek(this.role, sec));
  }

  transferLeader(to: Role): void {
    this.handle(this.hub.transferLeader(this.role, to), '已交出主控');
  }

  requestLead(): void {
    this.handle(this.hub.requestLead(this.role), '已向 TA 发送接管请求');
  }

  grantLead(): void {
    this.handle(this.hub.grantLead(this.role), '已同意对方接管');
  }

  denyLead(): void {
    this.handle(this.hub.denyLead(this.role), '已拒绝接管请求');
  }

  requestAction(action: 'play' | 'pause'): void {
    this.handle(this.hub.requestAction(this.role, action), '已把这次操作发给 TA 确认');
  }

  grantAction(): void {
    this.handle(this.hub.grantAction(this.role), '已同意这次操作');
  }

  denyAction(): void {
    this.handle(this.hub.denyAction(this.role), '已拒绝这次操作');
  }

  devSkipOffline(msAgo: number): void {
    this.handle(this.hub.devSkipOfflineTo(msAgo));
  }

  sendDanmaku(text: string): void {
    this.handle(this.hub.sendDanmaku(this.role, text));
  }

  sendReaction(kind: 'lol' | 'scared' | 'ship' | 'hug'): void {
    this.handle(this.hub.sendReaction(this.role, kind));
  }

  rateMovie(stars: number): void {
    this.handle(this.hub.rateMovie(this.role, stars), `已打 ${stars} 分`);
  }

  reviewMovie(text: string): void {
    this.handle(this.hub.reviewMovie(this.role, text.trim() || '（已清空）'), text.trim() ? '短评已保存' : '短评已清空');
  }

  saveRecap(): void {
    this.handle(this.hub.saveRecap(this.role), '已保存到回忆');
  }

  /** 一起看队列：从片库选进来的片子 */
  /**
   * 队列里是不是已经有这一项了。
   *
   * 判重两条路：同一个播放地址，或者同一部片的同一集（换了一条线路时地址不同，
   * 但用户眼里就是同一集，不能重复出现）。
   */
  watchQueueHas(input: { url: string; vodId?: string | null; episodeIndex?: number }): boolean {
    const url = String(input.url ?? '').trim();
    const vid = input.vodId ?? null;
    const idx = Math.max(0, Math.round(input.episodeIndex ?? 0));
    return this.snapshot.watchQueue.some(
      (q) => q.url === url || (!!vid && q.vodId === vid && q.episodeIndex === idx),
    );
  }

  addWatchQueue(input: {
    title: string;
    url: string;
    episodeIndex?: number;
    episodeName?: string;
    api?: string | null;
    vodId?: string | null;
  }): 'added' | 'dup' | 'fail' {
    if (this.watchQueueHas(input)) {
      this.toast('这一集已经在队列里了', 'warn');
      return 'dup';
    }
    const res = this.hub.addWatchQueue(this.role, input);
    if (!res.ok) {
      this.toast(res.error ?? '加入队列失败', 'error');
      return 'fail';
    }
    this.bump();
    this.toast(
      input.episodeName ? `已加入队列：${input.title} ${input.episodeName}` : `已加入队列：${input.title}`,
      'ok',
    );
    return 'added';
  }

  /** 整部剧一次加入：一条 RPC，返回真实的新增/重复/无效数量 */
  addWatchQueueBatch(
    items: {
      title: string;
      url: string;
      episodeIndex?: number;
      episodeName?: string;
      api?: string | null;
      vodId?: string | null;
    }[],
  ): { added: number; dup: number; invalid: number; capped: number } {
    const res = this.hub.addWatchQueueBatch(this.role, items);
    if (!res.ok) {
      this.toast(res.error ?? '加入队列失败', 'error');
      return { added: 0, dup: 0, invalid: 0, capped: 0 };
    }
    this.bump();
    return res.value;
  }

  removeWatchQueue(id: string): void {
    this.handle(this.hub.removeWatchQueue(this.role, id), '已从队列移除');
  }

  // ---- 评论区（每个对象一池：影视 / 生活点滴互不串） ----

  /** 某个对象下的评论（新的在前）：直接从快照里按 key 取，不额外发 RPC */
  commentsFor(target: 'movie' | 'moment', targetId: string): CommentItem[] {
    return commentsOf(this.snapshot.comments, target, targetId);
  }

  addComment(target: 'movie' | 'moment', targetId: string, text: string): boolean {
    return this.handle(
      this.hub.addComment(this.role, target, targetId, text),
      target === 'movie' ? '评论已发出' : '评论已发出',
    );
  }

  // ---- 游戏库与双人联机 ----

  addGame(title: string, code: string, kind: 'html' | 'link' | 'source' | 'native' = 'html'): boolean {
    return this.handle(this.hub.addGame(this.role, { title, code, kind }), '已加入游戏库');
  }

  /**
   * 大体积游戏：先传到服务器，再只把地址登记进库。
   * 返回 true 表示已经进库（体积不再受 400KB 限制）。
   */
  async importLargeGame(title: string, code: string): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('大游戏要连上服务器才能上传（对方也要能下载）', 'warn');
      return false;
    }
    this.toast('正在上传游戏文件…', 'info');
    try {
      const base64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(code))) : '';
      if (!base64) {
        this.toast('这个环境无法编码文件，请改用"粘贴代码"方式', 'error');
        return false;
      }
      const url = `${this.remoteServer.replace(/\/+$/, '')}/api/upload`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ kind: 'game', data: base64, ext: 'html' }),
      });
      const data = (await res.json()) as { ok?: boolean; value?: { path?: string }; error?: string };
      if (!res.ok || !data.ok || !data.value?.path) {
        this.toast(`上传失败：${data.error ?? res.status}`, 'error');
        return false;
      }
      const added = this.hub.addGameAsset(this.role, { title, assetPath: data.value.path });
      if (!added.ok) {
        this.toast(added.error ?? '登记失败', 'error');
        return false;
      }
      this.bump();
      this.toast('已加入游戏库（体积不受限制，按网址加载）', 'ok');
      return true;
    } catch (err) {
      this.toast(`上传出错：${err instanceof Error ? err.message : String(err)}`, 'error');
      return false;
    }
  }

  /**
   * 从手机里选一个文件上传成游戏。
   *
   * 支持：.html/.htm（当网页游戏，按网址加载，几个人都能玩）、.apk（原生游戏，点卡片安装）。
   * 其它后缀会提示先转成这两种。文件走 /api/upload 进服务器 /game/，状态里只留地址。
   */
  async uploadGameFile(file: { uri: string; name: string; size?: number; title?: string }): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('上传文件要先连上服务器（对方也要能下载）', 'warn');
      return false;
    }
    const name = (file.name || 'game.html').trim();
    const extMatch = /\.([a-z0-9]+)$/i.exec(name);
    const ext = (extMatch ? extMatch[1] : '').toLowerCase();
    const webExt = ['html', 'htm'];
    const apkExt = ['apk'];
    if (!webExt.includes(ext) && !apkExt.includes(ext)) {
      this.toast('只支持 .html/.htm（网页游戏）或 .apk（安卓游戏）；.zip/.js 请先解出 index.html', 'error');
      return false;
    }
    if (file.size && file.size > 400 * 1024 * 1024) {
      this.toast('文件超过 400MB，服务器收不下', 'error');
      return false;
    }
    /*
     * 手机上直接导入（用户要的：「从手机本地把下载好的 apk 传进游戏库」）。
     *
     * 走 /api/game/raw 这条"原始字节"通道：从文件流式上传，不转 base64。
     * 好处有两个：
     *   1. 不占内存 —— 146MB 的 APK base64 之后是 195MB，手机上很容易 OOM；
     *   2. 服务端收到就直接登记（还算好了包名），卡片立刻带着包名出现，
     *      点一下就能拉起游戏，而不是反复弹安装器。
     * 传不上去（老服务器 / 环境不支持）再回落到原来的 base64 通道。
     */
    const titleOf = (file.title ?? '').trim().slice(0, 40) || name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || '上传的游戏';
    this.toast('正在上传游戏文件…', 'info');
    try {
      const FileSystem = await import('expo-file-system/legacy');
      const extForRaw = apkExt.includes(ext) ? 'apk' : 'html';
      const res = await FileSystem.uploadAsync(
        `${this.remoteServer.replace(/\/+$/, '')}/api/game/raw?ext=${extForRaw}&title=${encodeURIComponent(titleOf)}`,
        file.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            authorization: `Bearer ${this.token}`,
            'content-type': 'application/octet-stream',
          },
        },
      );
      const parsed = JSON.parse(res.body ?? '{}') as {
        ok?: boolean;
        value?: { assetPath?: string; packageName?: string | null };
        error?: string;
      };
      if (res.status === 200 && parsed.ok && parsed.value?.assetPath) {
        const spec = this.hub.addGameAsset(this.role, {
          title: titleOf,
          assetPath: parsed.value.assetPath,
          kind: apkExt.includes(ext) ? 'native' : 'html',
          packageName: parsed.value.packageName ?? null,
        });
        this.bump();
        this.toast(
          spec.ok
            ? apkExt.includes(ext)
              ? '已进游戏库：对方点卡片就能下载安装，装完直接在这里打开'
              : '已进游戏库：两台手机都能下载来玩'
            : spec.error ?? '登记失败',
          spec.ok ? 'ok' : 'error',
        );
        return spec.ok;
      }
      // 服务端明确拒绝（比如体积超限）：直接把原因告诉用户，不用再试老通道
      if (res.status === 413 || res.status === 401) {
        this.toast(parsed.error ?? `上传失败（HTTP ${res.status}）`, 'error');
        return false;
      }
    } catch {
      // 落到下面的 base64 通道
    }
    // 大文件别走 base64：手机上转 base64 很容易把内存撑爆，直接说清楚
    if (file.size && file.size > 60 * 1024 * 1024) {
      this.toast('这个大文件用「流式上传」没成功，先检查网络/服务器版本再试', 'error');
      return false;
    }
    this.toast('正在读取文件…', 'info');
    let base64 = '';
    try {
      const FileSystem = await import('expo-file-system/legacy');
      base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      try {
        const blob = await (await fetch(file.uri)).blob();
        const buf = await new Response(blob).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
        base64 = typeof btoa === 'function' ? btoa(bin) : '';
      } catch {
        base64 = '';
      }
    }
    if (!base64) {
      this.toast('读不出这个文件，换个文件或用"粘贴代码"方式', 'error');
      return false;
    }
    this.toast('正在上传游戏文件…', 'info');
    try {
      const url = `${this.remoteServer.replace(/\/+$/, '')}/api/upload`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ kind: 'game', data: base64, ext: webExt.includes(ext) ? 'html' : 'apk' }),
      });
      const data = (await res.json()) as { ok?: boolean; value?: { path?: string }; error?: string };
      if (!res.ok || !data.ok || !data.value?.path) {
        this.toast(`上传失败：${data.error ?? res.status}`, 'error');
        return false;
      }
      const title =
        (file.title ?? '').trim().slice(0, 40) ||
        name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) ||
        '上传的游戏';
      const added = this.hub.addGameAsset(this.role, {
        title,
        assetPath: data.value.path,
        kind: apkExt.includes(ext) ? 'native' : 'html',
      });
      if (!added.ok) {
        this.toast(added.error ?? '登记失败', 'error');
        return false;
      }
      this.bump();
      this.toast(
        apkExt.includes(ext)
          ? '已加入游戏库：点卡片会装到手机上'
          : '已加入游戏库：点卡片直接开玩，对方也能下载',
        'ok',
      );
      return true;
    } catch (err) {
      this.toast(`上传出错：${err instanceof Error ? err.message : String(err)}`, 'error');
      return false;
    }
  }

  /**
   * 云编译：把 Java 源码交给服务器编成 APK，然后把"文件型游戏"登记进库。
   * 产物是独立 App（原生程序没法嵌进 Mutual 一页），点卡片走系统安装。
   */
  async compileNativeGame(title: string, code: string): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('云编译要连上服务器', 'warn');
      return false;
    }
    this.toast('正在上传源码到服务器编译…', 'info');
    const res = await buildNativeGame(this.remoteServer, this.token, title || 'Mutual 小游戏', [
      { name: 'MainActivity.java', content: code },
    ]);
    if (!res.ok || !res.path) {
      this.toast(`编译失败：${(res.error ?? '未知错误').slice(0, 160)}`, 'error');
      return false;
    }
    const added = this.hub.addGameAsset(this.role, {
      title: title || 'Mutual 小游戏',
      assetPath: res.path,
      kind: 'native',
    });
    if (!added.ok) {
      this.toast(added.error ?? '登记失败', 'error');
      return false;
    }
    this.bump();
    this.toast(`编译成功（${Math.round((res.bytes ?? 0) / 1024)}KB），点卡片安装`, 'ok');
    return true;
  }

  removeGame(id: string): void {
    this.handle(this.hub.removeGame(this.role, id), '已从游戏库移除');
  }

  /** 3D 沙盒的存档条目（x,y,z,v），打开世界时用来复原 */
  /** 服务器基地址（游戏文件按网址加载时用） */
  get gameBaseUrl(): string {
    return (this.remoteServer || this.accountServer || '').replace(/\/+$/, '');
  }

  get voxelEdits(): string[] {
    return this.snapshot.voxelWorld?.edits ?? [];
  }

  /** 把这次挖/放的增量并进存档（服务端权威，双方同一份） */
  mergeVoxelEdits(edits: string[]): void {
    if (!edits.length) return;
    const res = this.hub.mergeVoxelEdits(this.role, edits);
    if (res.ok) this.bump();
  }

  /** 粘贴模组 JSON → 直接在存档里生成方块 */
  applyVoxelMod(json: string): boolean {
    const res = this.hub.applyVoxelMod(this.role, json);
    if (!res.ok) {
      this.toast(res.error ?? '模组应用失败', 'error');
      return false;
    }
    this.bump();
    this.toast(`模组已生成 ${res.value?.blocks ?? 0} 格`, 'ok');
    return true;
  }

  removeVoxelMod(id: string): void {
    this.handle(this.hub.removeVoxelMod(this.role, id), '已从模组列表移除（方块还在世界里）');
  }

  resetVoxelWorld(): void {
    this.handle(this.hub.resetVoxelWorld(this.role), '存档已清空，回到初始地形');
  }

  // ---- 焦焦FM（听书）：独立模块，数据只走自己的字段 ----

  /** 加一个收听源（双方的手机都能看到，因为存在空间里） */
  addFmSource(name: string, url: string, kind?: 'audio' | 'rss' | 'json'): void {
    this.handle(this.hub.addFmSource(this.role, { name, url, kind }));
  }

  // ---- 自定义背景（两人共用的满屏背景，支持图片或 mp4 视频） ----

  /**
   * 从手机选文件上传背景。
   *
   * 视频几十 MB，走 base64 会多占 33% 并且容易 OOM，所以用 expo 的
   * uploadAsync 直接流式发送原始字节到 /api/background/raw。
   */
  async uploadCustomBackground(file: {
    uri: string;
    name: string;
    size?: number;
    type?: 'image' | 'video';
  }): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('上传背景要先连上服务器（对方也要能看到）', 'warn');
      return false;
    }
    const name = String(file.name ?? '').toLowerCase();
    const isVideo =
      file.type === 'video' || /\.(mp4|mov|m4v|webm)$/.test(name);
    if (!isVideo && !file.type && !/\.(jpg|jpeg|png|webp|heic)$/.test(name)) {
      this.toast('只支持图片或 mp4 视频', 'error');
      return false;
    }
    if (file.size && file.size > 200 * 1024 * 1024) {
      this.toast('背景文件超过 200MB', 'error');
      return false;
    }
    this.toast(isVideo ? '正在上传背景视频…' : '正在上传背景图片…', 'info');
    try {
      const FileSystem = await import('expo-file-system/legacy');
      const res = await FileSystem.uploadAsync(
        `${this.remoteServer.replace(/\/+$/, '')}/api/background/raw?type=${isVideo ? 'video' : 'image'}`,
        file.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            authorization: `Bearer ${this.token}`,
            'content-type': 'application/octet-stream',
          },
        },
      );
      const parsed = JSON.parse(res.body ?? '{}') as { ok?: boolean; error?: string };
      if (res.status === 200 && parsed.ok) {
        this.toast('背景已换好：两台手机都是这张，且不加任何压暗', 'ok');
        return true;
      }
      this.toast(parsed.error ?? `上传失败（HTTP ${res.status}）`, 'error');
      return false;
    } catch (err) {
      this.toast(`上传失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      return false;
    }
  }

  /** 恢复内置壁纸 */
  clearCustomBackground(): void {
    this.handle(this.hub.clearCustomBackground(this.role), '已恢复内置壁纸');
  }

  /**
   * 心跳：上报"我现在在哪个模块"。
   *
   * 对面首页会显示「TA 在看电影 / TA 在听歌 · 快加入一起听吧」这类提示。
   * 只上报模块名，不上报任何内容；失败了也无所谓，下次心跳再来。
   */
  setPresence(surface: string, detail?: string | null): void {
    try {
      this.hub.setPresence(this.role, { surface, detail: detail ?? null });
    } catch {
      /* 离线/未登录：忽略 */
    }
  }

  removeFmSource(id: string): void {
    this.handle(this.hub.removeFmSource(this.role, id));
  }

  /** 上报"我在听哪一集、听到第几秒"，TA 那边会跟着同步 */
  pushFmProgress(input: { itemKey: string; positionSec: number; rate: number; playing: boolean }): void {
    const res = this.hub.pushFmProgress(this.role, input);
    if (res.ok) this.bump();
  }

  startGame(gameId: string): void {
    this.handle(this.hub.startGame(this.role, gameId));
  }

  /** 把局面交给服务端广播（对方 WebView 会收到 TwGame.apply） */
  pushGameState(state: string, turn: number): void {
    const res = this.hub.pushGameState(this.role, state, turn);
    if (res.ok) this.bump();
  }

  endGame(): void {
    this.handle(this.hub.endGame(this.role));
  }

  removeComment(target: 'movie' | 'moment', targetId: string, commentId: string): void {
    this.handle(this.hub.removeComment(this.role, target, targetId, commentId));
  }

  clearWatchQueue(): void {
    this.handle(this.hub.clearWatchQueue(this.role), '队列已清空');
  }

  /** 点队列里的一项 → 直接开播（没房间就建，散场了就开新的） */
  playFromQueue(id: string): void {
    const res = this.hub.playFromQueue(this.role, id);
    if (res.ok) this.toast('已切到这一部，双方同步播放', 'ok');
    else this.toast(res.error, 'warn');
  }

  /**
   * 拖动进度条 / 在画面上滑动快进之后，把新位置交给服务端。
   *
   * 不告诉服务端的话，跟随方下一次自动校准会把你拽回去，"刚拖完又跳回原处"。
   * 静默执行（不带 toast）：拖动本来就会连续触发，弹提示会刷屏。
   */
  seekRoom(positionSec: number): void {
    const res = this.hub.seek(this.role, Math.max(0, positionSec));
    if (!res.ok) return; // 房间还没进入播放态时忽略，下一次拖动再试
    this.bump();
  }

  endRoom(): void {
    this.handle(this.hub.endRoom(this.role));
  }

  cancelRoom(): void {
    this.handle(this.hub.cancelRoom(this.role), '房间已解散');
  }

  requestUnbind(choice: DataChoice): boolean {
    return this.handle(this.hub.requestUnbind(this.role, choice), '已进入 7 天冷静期');
  }

  cancelUnbind(): void {
    this.handle(this.hub.cancelUnbind(this.role), '已撤销解绑');
  }

  /** 冷静期里改"我的数据怎么办"（只有自己能改自己的） */
  setUnbindChoice(choice: 'export' | 'delete'): void {
    this.handle(this.hub.setUnbindChoice(this.role, choice), choice === 'delete' ? '已选择：删除我的数据' : '已选择：保留副本');
  }

  confirmUnbind(): void {
    this.handle(this.hub.confirmUnbind(this.role));
  }

  fastForwardCooling(): void {
    this.handle(this.hub.fastForwardCooling(), '已模拟冷静期结束');
  }

  /**
   * 远程模式下真正的「发一条 rpc 并等结果」。
   *
   * WS 通着就用 WS 等 rpc-result；否则退回 HTTP 直接读响应。
   * 所有"必须知道服务器怎么说"的操作（建档写档、绑定…）都走这里，
   * 决不能用本地乐观结果去判断——本地那份数据可能和服务器根本不一致，
   * 于是"明明是对的"却提示失败（真实事故）。
   */
  private async sendRpcAwait(
    method: string,
    methodArgs: unknown[] = [],
  ): Promise<Result<unknown>> {
    const out = await this.sendRpcAwaitInner(method, methodArgs);
    // 临时诊断（排查"删不掉"）：把最近一次同步 RPC 的结果留在内存里给界面读
    this.lastRpcDebug = `${method} ok=${out.ok}${out.ok ? '' : ' ' + (out.error ?? '')}`;
    return out;
  }

  /** 最近一次同步 RPC 的结果（诊断用） */
  lastRpcDebug = '';

  private async sendRpcAwaitInner(
    method: string,
    methodArgs: unknown[] = [],
  ): Promise<Result<unknown>> {
    if (!this.remoteServer || !this.token) {
      return { ok: false, error: '还没登录账号 / 没连同步服务器' } as Result<unknown>;
    }
    try {
      if (this.transport === 'ws' && this.conn && this.conn.isOpen) {
        return await new Promise<Result<unknown>>((resolve) => {
          const id = this.rpcSeq;
          this.rpcSeq += 1;
          const timer = setTimeout(() => {
            this.pendingRpcs.delete(id);
            resolve({ ok: false, error: '服务器没有响应，请重试' } as Result<unknown>);
          }, 8000);
          this.pendingRpcs.set(id, (r) => {
            clearTimeout(timer);
            resolve(r);
          });
          if (
            !this.conn ||
            !this.conn.send(
              { v: 1, type: 'rpc', id, method, args: methodArgs, token: this.token },
              true,
            )
          ) {
            clearTimeout(timer);
            this.pendingRpcs.delete(id);
            resolve({ ok: false, error: '连接断了，请稍后重试' } as Result<unknown>);
          }
        });
      }
      return await rpcOnServer(this.remoteServer, this.token, method, methodArgs);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } as Result<unknown>;
    }
  }
  /** 我的账号 ID（「我们」页展示给 TA 搜的那个） */
  get myPublicId(): string {
    return this.accountId || this.snapshot.members[this.role].publicId || '';
  }

  /** 对方账号 ID（绑定后才有意义；用来核对输入） */
  get partnerPublicId(): string {
    return this.snapshot.members[this.partnerRole].publicId || '';
  }

  /**
   * 搜对方**账号 ID** 发绑定请求。
   *
   * 全部由服务器判定：账号存不存在、是不是自己、对方是不是已经绑了别人。
   * 客户端不再做任何"本地猜一下"的判断——那正是以前"ID 对了却说找不到"的根源。
   */
  async requestBind(targetId: string): Promise<'paired' | 'requested' | false> {
    if (!this.remoteServer || !this.token) {
      this.toast('绑定需要两台手机都连上同步服务器', 'warn');
      return false;
    }
    const wanted = normalizeAccountId(targetId);
    if (!wanted) {
      this.toast('请输入对方的账号 ID', 'warn');
      return false;
    }
    if (wanted === this.accountId) {
      this.toast('这是你自己的账号 ID，要填对方的', 'warn');
      return false;
    }
    const res = await pairRequestOnServer(this.remoteServer, this.token, wanted);
    if (!res.ok) {
      this.toast(res.error ?? '发起绑定失败', 'error');
      void this.refreshFromServer();
      return false;
    }
    const paired = Boolean(res.value?.paired);
    await this.refreshFromServer();
    if (paired) {
      this.toast('绑定成功，你们已经在一个空间里了', 'ok');
      return 'paired';
    }
    this.toast('请求已发出，等 TA 在手机上点同意', 'ok');
    return 'requested';
  }

  /** 立刻向服务器要一份最新状态（不改变连接方式） */
  async refreshFromServer(): Promise<void> {
    if (!this.remoteServer || !this.token) return;
    const server = this.remoteServer;
    const token = this.token;
    try {
      const res = await waitForChange(server, token, -1);
      if (!res) return;
      if (this.remoteServer !== server || this.token !== token) return;
      // 顺手采纳最新槽位：绑定/解绑之后我这里可能是另一格了
      this.adoptServerRole(res.role);
      this.remoteRev = Math.max(this.remoteRev, res.rev);
      const snap = res.state as unknown as SpaceSnapshot;
      if (snap && snap.spaceId) this.lastSpaceId = snap.spaceId;
      this.applyRemoteSnapshot(snap);
    } catch {
      // 拉不到就等下一次快照
    }
  }

  /** 同意对方的绑定请求（服务器权威，等它回话） */
  async acceptBind(): Promise<boolean> {
    if (!this.remoteServer || !this.token) {
      this.toast('绑定需要先连上同步服务器', 'warn');
      return false;
    }
    const res = await pairAcceptOnServer(this.remoteServer, this.token);
    if (!res.ok) {
      this.toast(res.error ?? '绑定失败', 'error');
      void this.refreshFromServer();
      return false;
    }
    this.toast('绑定成功', 'ok');
    await this.refreshFromServer();
    return true;
  }

  /** 拒绝对方的请求 / 撤回自己的请求 */
  async declineBind(): Promise<boolean> {
    if (!this.remoteServer || !this.token) return false;
    const res = await pairDeclineOnServer(this.remoteServer, this.token);
    if (!res.ok) {
      this.toast(res.error ?? '操作失败', 'error');
      return false;
    }
    this.toast('已拒绝', 'ok');
    await this.refreshFromServer();
    return true;
  }

  /** 现在能不能真正和"另一台手机"完成绑定：必须已经登录账号并连上服务器 */
  get canPairAcrossDevices(): boolean {
    return Boolean(this.remoteServer && this.token && this.remoteStatus.connected);
  }

  /** 绑定前置检查：没登录/没连服务器就别让用户白折腾 */
  private requirePairing(): boolean {
    if (this.canPairAcrossDevices) return true;
    this.toast('绑定要用账号：先登录账号并连上同步服务器', 'warn');
    return false;
  }

  // =========================================================================
  // 账号：注册 / 登录 / 退出
  // =========================================================================

  /**
   * 注册一个账号（昵称/生日/性别/头像 + 6 位登录码），并立刻登录。
   *
   * 账号 ID 由服务器分配（形如 TW8K3M9Q），它就是别人搜你时填的那个 ID，
   * 也是「我们」页顶部显示的那串——一个身份，不用记两个。
   */
  async createAccount(input: {
    name: string;
    birthDate: string;
    gender: Gender;
    avatarUri?: string | null;
    pin: string;
    server: string;
  }): Promise<boolean> {
    const server = normalizeServerUrl(input.server);
    if (!server) {
      this.toast('请先填同步服务器地址', 'error');
      return false;
    }
    const res = await createAccountOnServer(server, {
      name: input.name,
      birthDate: input.birthDate,
      gender: input.gender,
      avatarUri: input.avatarUri ?? null,
      pin: input.pin,
      deviceId: this.clientId,
    });
    if (!res.ok) {
      this.toast(res.error || '注册失败', 'error');
      return false;
    }
    const created = res.value;
    await this.adoptAccount(server, created);
    this.toast(`账号已创建：${created.accountId}`, 'ok');
    return true;
  }

  /** 登录已有账号：账号 ID + 登录码（换手机就靠这个） */
  async loginAccount(input: {
    accountId: string;
    pin: string;
    server: string;
  }): Promise<boolean> {
    const server = normalizeServerUrl(input.server);
    if (!server) {
      this.toast('请先填同步服务器地址', 'error');
      return false;
    }
    const accountId = normalizeAccountId(input.accountId);
    if (!looksLikeAccountId(accountId)) {
      this.toast('账号 ID 看起来不对（形如 TW8K3M9Q）', 'warn');
      return false;
    }
    const res = await loginOnServer(server, {
      accountId,
      pin: input.pin,
      deviceId: this.clientId,
    });
    if (!res.ok) {
      this.toast(res.error || '登录失败', 'error');
      return false;
    }
    await this.adoptAccount(server, res.value);
    this.toast('登录成功', 'ok');
    return true;
  }

  /** 拿到 token 之后：存起来 → 保存地址 → 连接 → 拉一次真实状态 */
  private async adoptAccount(server: string, created: AccountCreated): Promise<void> {
    this.token = created.token;
    this.accountId = created.accountId;
    this.accountServer = server;
    this.remoteRole = created.role;
    this.role = created.role;
    this.authExpired = false;
    // 换账号/重新登录：本地必须先清干净，否则上一个人的数据会短暂显示给下一个人看
    this.hub.resetToEmpty();
    await saveAccountSession({
      accountId: created.accountId,
      token: created.token,
      server,
      since: Date.now(),
    });
    await saveServerUrl(server, this.backupServer);
    await setAutoConnect(true);
    this.accountReady = true;
    this.bump();
    void this.connectRemote(server);
  }

  /** 退出登录：本机回到"没有账号"状态（服务器上的东西不动） */
  async logoutAccount(): Promise<void> {
    const ok = this.confirmFn
      ? await this.confirmFn({
          title: '退出这个账号？',
          message:
            '退出后这台手机回到登录页，需要「账号 ID + 登录码」才能重新进来。服务器上的数据不会丢。',
          icon: '🚪',
          confirmText: '退出',
          cancelText: '取消',
          danger: true,
        })
      : true;
    if (!ok) return;
    this.teardownConnection();
    this.token = '';
    this.accountId = '';
    this.accountServer = '';
    this.remoteServer = '';
    this.remoteRole = null;
    this.remoteRev = 0;
    this.authExpired = false;
    await saveAccountSession(null);
    await setAutoConnect(false);
    // 本机数据属于刚才那个账号，不能留给下一个人看
    this.hub.resetToEmpty();
    /*
     * 片源接口/直播源是**设备级**缓存（cms_api_urls / live_sources_v1），
     * 不清的话下一个账号登录后，"服务端还没有、本机有 → 补推"会把上一个人的
     * 采集站与直播源写进新账号的空间，新伴侣也会看到。
     */
    this.cmsLocalCache = [];
    this.liveLocalCache = [];
    this.cmsOptimistic = null;
    this.liveOptimistic = null;
    this.sourcePushMutedUntil = 0;
    try {
      await saveCmsApiList([]);
      await saveLiveSources([]);
    } catch {
      /* 清不掉也不影响退出登录 */
    }
    await clearState();
    this.bump();
    this.toast('已退出账号', 'warn');
  }

  /** 发一条 RPC 并等它的结果（WS 用 rpc-result，超时兜底） */
  private awaitRpc(method: string, args: unknown[]): Promise<Result<unknown>> {
    return new Promise<Result<unknown>>((resolve) => {
      if (!this.conn) {
        resolve({ ok: false, error: '连接断了，请稍后重试' });
        return;
      }
      const id = this.rpcSeq;
      this.rpcSeq += 1;
      const timer = setTimeout(() => {
        this.pendingRpcs.delete(id);
        resolve({ ok: false, error: '服务器没有响应，请重试' });
      }, 8000);
      this.pendingRpcs.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      if (
        !this.conn.send(
          { v: 1, type: 'rpc', id, method, args, token: this.token, clientId: this.clientId },
          true,
        )
      ) {
        clearTimeout(timer);
        this.pendingRpcs.delete(id);
        resolve({ ok: false, error: '连接断了，请稍后重试' });
      }
    });
  }

  // =========================================================================
  // 模块1 双人空间
  // =========================================================================

  setTheme(theme: ThemeId, sync: boolean): void {
    this.handle(this.hub.setTheme(this.role, theme, sync), sync ? '已同步给 TA' : '只改了你自己看到的');
  }

  decorate(slot: string, itemId: string | null): void {
    this.handle(this.hub.decorate(this.role, slot, itemId));
  }

  petCare(action: 'water' | 'feed' | 'pet'): void {
    this.handle(this.hub.petCare(this.role, action));
  }

  // =========================================================================
  // 模块2
  // =========================================================================

  addChore(title: string, assignee: Assignee, rotation?: Assignee[]): boolean {
    return this.handle(this.hub.addChore(this.role, title, assignee, rotation), '已加入家务表');
  }

  claimChore(id: string): void {
    this.handle(this.hub.claimChore(this.role, id), '已认领');
  }

  completeChore(id: string): void {
    this.handle(this.hub.completeChore(this.role, id), '已完成');
  }

  uncompleteChore(id: string): void {
    this.handle(this.hub.uncompleteChore(this.role, id));
  }

  deleteChore(id: string): void {
    this.handle(this.hub.deleteChore(this.role, id));
  }

  addLedger(input: {
    title: string;
    amountCents: number;
    payerRole: Role;
    split: 'equal' | 'custom';
    shares?: Record<Role, number>;
    category: 'travel' | 'rent' | 'daily' | 'gift' | 'other';
    date: string;
    visibility?: 'shared' | 'owner';
  }): boolean {
    return this.handle(this.hub.addLedger(this.role, input), '已记一笔');
  }

  confirmLedger(id: string): void {
    this.handle(this.hub.confirmLedger(this.role, id), '已确认分摊');
  }

  collectionAdd(
    kind: CollectionKind,
    input: Parameters<Hub['collectionAdd']>[2],
  ): boolean {
    return this.handle(this.hub.collectionAdd(this.role, kind, input), '已添加');
  }

  collectionToggle(id: string): void {
    this.handle(this.hub.collectionToggle(this.role, id));
  }

  collectionDelete(id: string): void {
    this.handle(this.hub.collectionDelete(this.role, id), '已删除');
  }

  collectionVote(id: string, verdict: 'like' | 'nope' | null): void {
    this.handle(this.hub.collectionVote(this.role, id, verdict));
  }

  collectionClaim(id: string): void {
    this.handle(this.hub.collectionClaim(this.role, id));
  }

  collectionUpdate(id: string, patch: Parameters<Hub['collectionUpdate']>[2]): void {
    this.handle(this.hub.collectionUpdate(this.role, id, patch));
  }

  collectionDraw(): void {
    const r = this.hub.collectionDrawRandom(this.role);
    if (r.ok) {
      this.toast(r.value ? `抽到了：${r.value.title}` : '抽到了空', 'ok');
    } else {
      this.toast(r.error, 'warn');
    }
    this.bump();
  }

  addHabit(title: string): boolean {
    return this.handle(this.hub.addHabit(this.role, title), '已添加习惯');
  }

  toggleHabit(id: string, date: string): void {
    this.handle(this.hub.toggleHabit(this.role, id, date));
  }

  addGoal(title: string, targetCents: number | null, targetDate: string | null): boolean {
    return this.handle(this.hub.addGoal(this.role, { title, targetCents, targetDate }), '已添加目标');
  }

  contributeGoal(id: string, cents: number): boolean {
    return this.handle(this.hub.contributeGoal(this.role, id, cents), '已存入一笔');
  }

  completeGoal(id: string): void {
    this.handle(this.hub.completeGoal(this.role, id));
  }

  // =========================================================================
  // 模块3
  // =========================================================================

  addCareReminder(kind: 'water' | 'medicine' | 'rest', time: string, note: string): boolean {
    return this.handle(this.hub.addCareReminder(this.role, kind, time, note), '提醒已设置');
  }

  toggleCareReminder(id: string): void {
    this.handle(this.hub.toggleCareReminder(this.role, id));
  }

  setCareReminderVisibility(id: string, visible: boolean): void {
    this.handle(
      this.hub.setCareReminderVisibility(this.role, id, visible),
      visible ? 'TA 能看到这个提醒了' : '已改为仅我可见',
    );
  }

  togglePlanLogShare(): void {
    this.handle(this.hub.togglePlanLogShare(this.role));
  }

  /** 「我希望被这样照顾」：加一条（只有自己能加自己的） */
  addComfortItem(text: string): boolean {
    return this.handle(this.hub.addComfortItem(this.role, text), '已加入你的清单');
  }

  /** 删自己清单里的一条 */
  removeComfortItem(id: string): void {
    this.handle(this.hub.removeComfortItem(this.role, id), '已删除');
  }

  /** 照着 TA 的清单做一件：真实发一条中性通知给 TA */
  sendCareAction(itemId: string): void {
    this.handle(this.hub.sendCareAction(this.role, itemId), '已经告诉 TA 了');
  }

  // =========================================================================
  // 模块4
  // =========================================================================

  sendCard(kind: CardKind, text: string, detail = '', meta = ''): boolean {
    return this.handle(this.hub.sendCard(this.role, kind, text, detail, meta), '已送出');
  }

  /** 催一下 TA：真实推送 + 3 分钟限流（失败原因会以 Toast 说明） */
  nudgePartner(): void {
    this.handle(this.hub.nudgePartner(this.role), '已经提醒 TA 了');
  }

  /** 给 TA 的习惯打气：真实推送 */
  cheerHabit(habitId: string): void {
    this.handle(this.hub.cheerHabit(this.role, habitId), '已给 TA 打气');
  }

  replyCard(id: string, text: string): void {
    this.handle(this.hub.replyCard(this.role, id, text), '已回应');
  }

  acceptCard(id: string): void {
    this.handle(this.hub.acceptCard(this.role, id), '已收到');
  }

  answerDailyQuestion(text: string): boolean {
    return this.handle(this.hub.answerDailyQuestion(this.role, text), '已回答');
  }

  addVoiceNote(uri: string, durationSec: number, deliverAt: number | null): boolean {
    return this.handle(this.hub.addVoiceNote(this.role, uri, durationSec, deliverAt), '语音已发出');
  }

  markVoiceListened(id: string): void {
    this.handle(this.hub.markVoiceListened(this.role, id));
  }

  addDiaryEntry(text: string): boolean {
    return this.handle(this.hub.addDiaryEntry(this.role, text), '已写进我们的日记');
  }

  submitWeeklyReview(happy: string, trouble: string, want: string): boolean {
    return this.handle(this.hub.submitWeeklyReview(this.role, happy, trouble, want), '本周复盘已提交');
  }

  addTimelineNode(title: string, date: string, note: string, emoji: string): boolean {
    return this.handle(this.hub.addTimelineNode(this.role, title, date, note, emoji), '已加到时间轴');
  }

  // =========================================================================
  // 模块5
  // =========================================================================

  addWatchPlan(movieTitle: string, date: string, startMin: number): boolean {
    return this.handle(this.hub.addWatchPlan(this.role, movieTitle, date, startMin), '已发出预约');
  }

  confirmWatchPlan(id: string): void {
    this.handle(this.hub.confirmWatchPlan(this.role, id), '已确认，写进共享日历');
  }

  deleteWatchPlan(id: string): void {
    this.handle(this.hub.deleteWatchPlan(this.role, id));
  }

  startPickSession(candidates: string[]): boolean {
    return this.handle(this.hub.startPickSession(this.role, candidates), '开始选片');
  }

  pickMovie(title: string, verdict: 'like' | 'nope'): void {
    this.handle(this.hub.pickMovie(this.role, title, verdict));
  }

  clearPickSession(): void {
    this.handle(this.hub.clearPickSession(this.role));
  }

  toggleScene(key: 'popcorn' | 'cat' | 'blanket'): void {
    this.handle(this.hub.toggleScene(this.role, key));
  }

  startVoiceInvite(): void {
    void this.guardVoice().then((allowed) => {
      if (allowed) this.handle(this.hub.startVoiceInvite(this.role));
    });
  }

  acceptVoiceInvite(): void {
    void this.guardVoice().then((allowed) => {
      if (allowed) this.handle(this.hub.acceptVoiceInvite(this.role), '语音已接通');
    });
  }

  declineVoiceInvite(): void {
    this.handle(this.hub.declineVoiceInvite(this.role), '已拒绝');
  }

  setVoiceMuted(muted: boolean): void {
    this.handle(this.hub.setVoiceMuted(this.role, muted));
  }

  setVoiceSpeaker(speaker: boolean): void {
    this.handle(this.hub.setVoiceSpeaker(this.role, speaker));
  }

  setVoiceVolume(volume: number): void {
    this.handle(this.hub.setVoiceVolume(this.role, volume));
  }

  switchToTextOnly(): void {
    this.handle(this.hub.switchToTextOnly(this.role), '已切换为仅文字');
  }

  endVoice(): void {
    this.handle(this.hub.endVoice(this.role), '语音已结束');
  }

  addRecapScreenshot(uri: string): void {
    this.handle(this.hub.addRecapScreenshot(this.role, uri), '已加上截图');
  }

  // =========================================================================
  // 模块7
  // =========================================================================

  saveRelProfile(input: {
    meetMethod: string;
    firstDate: string;
    stage: RelStage;
    milestones: string[];
  }): boolean {
    return this.handle(this.hub.saveRelProfile(this.role, input), '关系档案已提交');
  }

  confirmRelProfile(): void {
    this.handle(this.hub.confirmRelProfile(this.role), '已确认');
  }

  saveValuesDraft(topic: ValuesTopic, text: string): void {
    this.handle(this.hub.saveValuesDraft(this.role, topic, text), '草稿已保存（仅我可见）');
  }

  revealValues(): void {
    this.handle(this.hub.revealValues(this.role), '已互相揭示');
  }

  saveValuesConsensus(text: string): void {
    this.handle(this.hub.saveValuesConsensus(this.role, text), '共识已记录');
  }

  addPlanItem(title: string, targetDate: string | null, owners: Role[], notes: string): boolean {
    return this.handle(this.hub.addPlanItem(this.role, { title, targetDate, owners, notes }), '已加入目标看板');
  }

  confirmPlanItem(id: string): void {
    this.handle(this.hub.confirmPlanItem(this.role, id));
  }

  setPlanStage(id: string, stage: 'discuss' | 'confirmed' | 'done'): void {
    this.handle(this.hub.setPlanStage(this.role, id, stage));
  }

  addBoundary(category: BoundaryCategory, text: string): boolean {
    return this.handle(this.hub.addBoundary(this.role, category, text), '已加一条约定');
  }

  setBoundaryAgreement(id: string, value: 'agree' | 'change'): void {
    this.handle(this.hub.setBoundaryAgreement(this.role, id, value), value === 'agree' ? '你认同了这条' : '你标记了想改');
  }

  startConflict(trigger: string): boolean {
    return this.handle(this.hub.startConflict(this.role, trigger), '已开始记录');
  }

  setConflictField(id: string, field: 'feelings' | 'needs' | 'apology', text: string): void {
    this.handle(this.hub.setConflictField(this.role, id, field, text), '已保存');
  }

  markConflictCalm(id: string): void {
    this.handle(this.hub.markConflictCalm(this.role, id), '冷静卡已发出');
  }

  resolveConflict(id: string, ritual: string): void {
    this.handle(this.hub.resolveConflict(this.role, id, ritual), '这次到这里了');
  }

  saveSelfAssess(input: {
    satisfaction: number;
    security: number;
    communication: number;
    fairness: number;
  }): void {
    this.handle(this.hub.saveSelfAssess(this.role, input), '已记录（只有你能看到）');
  }

  createVote(title: string, options: string[], anonymous: boolean): boolean {
    return this.handle(this.hub.createVote(this.role, title, options, anonymous, null), '投票已发起');
  }

  castVote(id: string, optionId: string): void {
    this.handle(this.hub.castVote(this.role, id, optionId));
  }

  setLdr(patch: Parameters<Hub['setLdr']>[1]): void {
    this.handle(this.hub.setLdr(this.role, patch));
  }

  setTrust(patch: Parameters<Hub['setTrust']>[1]): void {
    this.handle(this.hub.setTrust(this.role, patch), '设置已更新');
  }

  requestArrived(): void {
    this.handle(this.hub.requestArrived(this.role), '已告诉 TA 你到家了');
  }

  startLocationOnce(minutes: number, label: string): void {
    this.handle(this.hub.startLocationOnce(this.role, minutes, label), '已开始单次共享');
  }

  addIntimacyCard(topic: string, content: string): boolean {
    return this.handle(this.hub.addIntimacyCard(this.role, topic, content), '已记录（默认不共享）');
  }

  shareIntimacyCard(id: string, shared: boolean): void {
    this.handle(this.hub.shareIntimacyCard(this.role, id, shared), shared ? '已共享这一条' : '已撤回共享');
  }

  addSocialReport(place: string, people: string, eta: string): boolean {
    return this.handle(this.hub.addSocialReport(this.role, place, people, eta), '已报备');
  }

  withdrawSocialReport(id: string): void {
    this.handle(this.hub.withdrawSocialReport(this.role, id), '已撤回');
  }

  addVaultItem(label: string, secret: string): boolean {
    return this.handle(this.hub.addVaultItem(this.role, label, secret), '已存入（未授权任何人）');
  }

  grantVaultAccess(id: string): void {
    const to: Role = this.role === 'A' ? 'B' : 'A';
    this.handle(this.hub.grantVaultAccess(this.role, id, to), '已授权 TA 查看');
  }

  revokeVaultAccess(id: string): void {
    const to: Role = this.role === 'A' ? 'B' : 'A';
    this.handle(this.hub.revokeVaultAccess(this.role, id, to), '已撤回授权');
  }

  /**
   * 打开保险箱：联机模式下必须走服务端返回值。
   * 投影里"别人授权的条目"本来就不下发明文（这是对的），而本地镜像里 secret 恒为空串 ——
   * 以前这里同步读本地，于是被授权人点「查看内容」只弹出一个空白弹窗，
   * 服务端却已经把这次查看记进留痕。
   */
  async openVaultItem(id: string): Promise<string | null> {
    if (!this.remoteServer || !this.token) {
      const r = this.hub.openVaultItem(this.role, id);
      if (!r.ok) {
        this.toast(r.error, 'error');
        return null;
      }
      this.bump();
      return r.value;
    }
    const res = await this.sendRpcAwait('openVaultItem', [id]);
    if (!res.ok) {
      this.toast(res.error ?? '没有取到内容', 'error');
      return null;
    }
    const secret = typeof res.value === 'string' ? res.value : '';
    if (!secret) {
      this.toast('没有取到内容，请重试（这一次查看已记录）', 'warn');
      return null;
    }
    return secret;
  }

  deleteVaultItem(id: string): void {
    this.handle(this.hub.deleteVaultItem(this.role, id), '已删除');
  }

  updateWedding(patch: { budgetCents?: number; styles?: string[]; guests?: string[]; dates?: string[] }): void {
    this.handle(this.hub.updateWedding(this.role, patch), '已更新');
  }

  shareWedding(shared: boolean): void {
    this.handle(this.hub.shareWedding(this.role, shared), shared ? '已共享给 TA' : '已改为仅我可见');
  }

  reset(): void {
    /*
     * 连服务器时本地 reset 没有任何意义：几秒后服务端投影就会把数据整份盖回来，
     * 而用户按提示重新录入的内容反而被覆盖。这里直接拦住，并告诉他正确的入口。
     */
    if (this.remoteServer) {
      this.toast('数据在服务器上，请用「我们 → 同步服务器 → 清空这个空间」', 'warn');
      return;
    }
    void clearState();
    this.savedAt = null;
    this.localHub.resetToEmpty();
    this.schedulePersist();
    this.bump();
  }

  /** 清空本地存储（模拟"卸载重装"） */
  async wipeStorage(): Promise<void> {
    await clearState();
    this.savedAt = null;
    this.storageBytes = 0;
    this.bump();
  }
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => new AppStore());
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    store.setToast(toast.show);
  }, [store, toast]);

  // 语音前的 HTTPS 检查需要弹窗，store 自己没有 hooks，所以在这里注入
  useEffect(() => {
    store.setConfirm(confirm);
  }, [store, confirm]);

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  // 手机在后台会被系统掐断 socket：回到前台立刻补一次重连
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') store.handleAppForeground();
    });
    return () => sub.remove();
  }, [store]);

  const value = useMemo(() => store, [store]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export interface AppView {
  store: AppStore;
  role: Role;
  snapshot: AppStore['snapshot'];
  device: ClientDevice;
  partnerRole: Role;
}

export function useApp(): AppView {
  const store = useContext(AppContext);
  if (!store) throw new Error('useApp 必须在 AppProvider 内使用');
  // subscribe / getSnapshot 必须是稳定引用，否则每次渲染都会重新订阅
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.version, [store]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    store,
    role: store.role,
    snapshot: store.snapshot,
    device: store.device,
    partnerRole: store.partnerRole,
  };
}

/**
 * 拿不到 Provider 时返回 null，而不是抛错。
 * 网络指示灯会出现在很多页面的标题栏里，它不该因为脱离 Provider 就让整页崩掉。
 */
export function useAppOptional(): AppView | null {
  const store = useContext(AppContext);
  const subscribe = useCallback((cb: () => void) => store?.subscribe(cb) ?? (() => undefined), [store]);
  const getSnapshot = useCallback(() => store?.version ?? 0, [store]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!store) return null;
  return {
    store,
    role: store.role,
    snapshot: store.snapshot,
    device: store.device,
    partnerRole: store.partnerRole,
  };
}
